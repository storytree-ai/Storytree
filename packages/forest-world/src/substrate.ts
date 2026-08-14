// Relaxed substrate (Oskar Stålberg / Townscaper style) — swaps the regular
// hex-tile interiors for an irregular, relaxed grid so each island reads as ONE
// organic landmass instead of a cluster of hexagons. `mesh` (the faithful
// irregular-quad Townscaper mesh, a port of kchapelier/hexagrid-relaxing) is the
// DEFAULT world look (owner look-decision 2026-06-16). All keep the DAG-driven
// layout + the organic coastline; only the interior tile geometry changes.
// Deterministic throughout (hash/rand01, no Math.random); boundary vertices (the
// outer silhouette the coastline was smoothed from) are PINNED so the shore still
// encloses the relaxed cells.
//
// Input is the layout-agnostic `(drawTiles, wheatSets)` pair — the claimed tiles
// with their owning-territory index, and one wheat-key set per territory — NOT any
// app's World type, so this is shared verbatim by the studio and the website
// (which already used exactly this signature). `wheatSets[owner]` is the set of
// axial keys that territory tinted as wheat.

import { hash, rand01 } from './rng.js';
import { groundFlattening } from './camera.js';
import { HEX_R, hexCenter, hexCorners, pixelToHex, axialKey, type Axial, type Pt } from './hex.js';

export type SubstrateMode = 'relaxed-hex' | 'relaxed-quad' | 'mesh';

/** A claimed tile and the territory index that owns it (the layout's output). */
export interface DrawTile {
  h: Axial;
  owner: number;
}

/**
 * How wild the relaxed substrate is. `jitter` is the per-vertex displacement as
 * a fraction of HEX_R (the main "randomness" knob); `iters`/`relax` are the
 * Laplacian smoothing that untangles the jitter (more smoothing = cleaner but
 * more regular). `wheatScatter` breaks whole-hex wheat patches into a per-cell
 * scatter so the tan fields stop reading as hexagons.
 */
export interface SubstrateTuning {
  jitter: number;
  iters: number;
  relax: number;
  wheatScatter: boolean;
  /** mesh-only: extra quad-subdivision passes on the merge result (1 = the
   *  canonical hexagrid-relaxing density; 2 = finer cobbles). */
  subdiv?: number;
}

const QUAD_TUNING: SubstrateTuning = { jitter: 0.78, iters: 2, relax: 0.26, wheatScatter: true };
const HEX_TUNING: SubstrateTuning = { jitter: 0.7, iters: 2, relax: 0.28, wheatScatter: false };
// Path B's irregular topology carries the de-hexing, so jitter sits lower than
// path A (less needed; too much tangles the finer mesh); relax a touch firmer to
// settle the merged quads into clean Townscaper cells.
export const MESH_TUNING: SubstrateTuning = {
  jitter: 0.42,
  iters: 3,
  relax: 0.34,
  wheatScatter: true,
  subdiv: 1,
};

/** One filled cell of the relaxed substrate: a polygon owned by a territory. */
export interface RelaxedCell {
  owner: number;
  poly: Pt[];
  variant: number;
  wheat: boolean;
}

const VKEY = (p: Pt): string => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

/**
 * Jitter (deterministically) then Laplacian-relax a vertex mesh in place.
 * Interior vertices wobble and smooth into organic cells; pinned (boundary)
 * vertices hold the silhouette. Light relaxation keeps the jittered character
 * — full convergence would regularise a regular-topology mesh back to a grid.
 */
function relaxVerts(
  verts: Pt[],
  adj: Set<number>[],
  pinned: Set<number>,
  opts: { jitterMag: number; iters: number; relax: number },
): void {
  const orig = verts.map((p) => VKEY(p));
  for (let i = 0; i < verts.length; i++) {
    if (pinned.has(i)) continue;
    const p = verts[i];
    if (!p) continue;
    const ang = rand01(hash(`jx:${orig[i]}`)) * Math.PI * 2;
    const mag = rand01(hash(`jm:${orig[i]}`)) * opts.jitterMag;
    // The jitter is a GROUND-plane displacement, so its y foreshortens with the lattice it
    // perturbs (ADR-0367 D1). Left isotropic in SCREEN space it would inject a wobble several
    // times larger than the projected row pitch and tangle the mesh in y alone. The relaxation
    // below needs no such term: averaging commutes with the affine projection.
    p.x += Math.cos(ang) * mag;
    p.y += Math.sin(ang) * mag * groundFlattening();
  }
  for (let it = 0; it < opts.iters; it++) {
    const next = verts.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < verts.length; i++) {
      if (pinned.has(i)) continue;
      const ns = adj[i];
      const cur = verts[i];
      const nx = next[i];
      if (!ns || !cur || !nx || ns.size === 0) continue;
      let sx = 0;
      let sy = 0;
      for (const j of ns) {
        const q = verts[j];
        if (q) {
          sx += q.x;
          sy += q.y;
        }
      }
      nx.x = cur.x + (sx / ns.size - cur.x) * opts.relax;
      nx.y = cur.y + (sy / ns.size - cur.y) * opts.relax;
    }
    for (let i = 0; i < verts.length; i++) {
      const cur = verts[i];
      const nx = next[i];
      if (cur && nx) {
        cur.x = nx.x;
        cur.y = nx.y;
      }
    }
  }
}

/** Path A — relax the shared hex-corner lattice; rebuild irregular hexagons. */
function buildRelaxedHexCells(
  drawTiles: readonly DrawTile[],
  wheatSets: readonly ReadonlySet<string>[],
  t: SubstrateTuning,
): RelaxedCell[] {
  const verts: Pt[] = [];
  const vId = new Map<string, number>();
  const adj: Set<number>[] = [];
  const intern = (p: Pt): number => {
    const k = VKEY(p);
    let id = vId.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push({ x: p.x, y: p.y });
      vId.set(k, id);
      adj.push(new Set());
    }
    return id;
  };
  // Each tile → its 6 shared corner ids; track hex-edge usage to find the shore.
  const tileCorners: { owner: number; key: string; ids: number[] }[] = [];
  const edgeUse = new Map<string, number>();
  const eKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const { h, owner } of drawTiles) {
    const c = hexCenter(h);
    const ids = hexCorners(c.x, c.y, HEX_R).map(intern);
    tileCorners.push({ owner, key: axialKey(h), ids });
    for (let i = 0; i < 6; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % 6];
      if (a === undefined || b === undefined) continue;
      adj[a]?.add(b);
      adj[b]?.add(a);
      const k = eKey(a, b);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }
  const pinned = new Set<number>();
  for (const [k, n] of edgeUse) {
    if (n === 1) {
      const [a, b] = k.split('|');
      pinned.add(Number(a));
      pinned.add(Number(b));
    }
  }
  relaxVerts(verts, adj, pinned, { jitterMag: HEX_R * t.jitter, iters: t.iters, relax: t.relax });
  return tileCorners.map(({ owner, key, ids }) => ({
    owner,
    poly: ids.map((id) => verts[id] ?? { x: 0, y: 0 }),
    variant: hash(`tile:${key}`) % 3,
    wheat: wheatSets[owner]?.has(key) ?? false,
  }));
}

/** Path B — subdivide each hex into 6 quads, relax the shared mesh (Townscaper). */
function buildRelaxedQuadCells(
  drawTiles: readonly DrawTile[],
  wheatSets: readonly ReadonlySet<string>[],
  t: SubstrateTuning,
): RelaxedCell[] {
  const verts: Pt[] = [];
  const vId = new Map<string, number>();
  const adj: Set<number>[] = [];
  const intern = (p: Pt): number => {
    const k = VKEY(p);
    let id = vId.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push({ x: p.x, y: p.y });
      vId.set(k, id);
      adj.push(new Set());
    }
    return id;
  };
  interface Quad {
    owner: number;
    ids: number[];
    variant: number;
    wheat: boolean;
  }
  const quads: Quad[] = [];
  const edgeUse = new Map<string, number>();
  const eKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const link = (a: number, b: number): void => {
    adj[a]?.add(b);
    adj[b]?.add(a);
    const k = eKey(a, b);
    edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  };
  for (const { h, owner } of drawTiles) {
    const c = hexCenter(h);
    const corners = hexCorners(c.x, c.y, HEX_R);
    const oid = intern(c);
    const key = axialKey(h);
    const wheat = wheatSets[owner]?.has(key) ?? false;
    const cornerIds = corners.map(intern);
    const midIds = corners.map((cor, i) => {
      const nxt = corners[(i + 1) % 6] ?? cor;
      return intern({ x: (cor.x + nxt.x) / 2, y: (cor.y + nxt.y) / 2 });
    });
    for (let i = 0; i < 6; i++) {
      const ci = cornerIds[i];
      const mPrev = midIds[(i + 5) % 6];
      const mNext = midIds[i];
      if (ci === undefined || mPrev === undefined || mNext === undefined) continue;
      const ids = [oid, mPrev, ci, mNext];
      // wheatScatter: a wheat hex normally tints all 6 sub-cells — which reads as
      // a tan hexagon. Scatter it per-cell instead so the field stops being hexy
      // (grass cells mixed back in; ~70% of a wheat hex's cells stay wheat).
      const cellWheat = wheat && (!t.wheatScatter || rand01(hash(`wheat:${key}:${i}`)) < 0.7);
      quads.push({ owner, ids, variant: hash(`cell:${key}:${i}`) % 3, wheat: cellWheat });
      link(ids[0]!, ids[1]!);
      link(ids[1]!, ids[2]!);
      link(ids[2]!, ids[3]!);
      link(ids[3]!, ids[0]!);
    }
  }
  const pinned = new Set<number>();
  for (const [k, n] of edgeUse) {
    if (n === 1) {
      const [a, b] = k.split('|');
      pinned.add(Number(a));
      pinned.add(Number(b));
    }
  }
  relaxVerts(verts, adj, pinned, { jitterMag: HEX_R * t.jitter, iters: t.iters, relax: t.relax });
  return quads.map((q) => ({
    owner: q.owner,
    poly: q.ids.map((id) => verts[id] ?? { x: 0, y: 0 }),
    variant: q.variant,
    wheat: q.wheat,
  }));
}

/**
 * Path B — the faithful Townscaper / Stålberg irregular-quad mesh (a port of
 * kchapelier/hexagrid-relaxing), in four steps over ONE shared, watertight
 * vertex pool:
 *   1. Triangulate: every claimed hex → 6 triangles (centre, corner_i,
 *      corner_{i+1}). Centres/corners are interned, so triangles of adjacent
 *      hexes share the rim edge between them.
 *   2. Merge adjacent triangle PAIRS into quads — greedily, ordered by a hash so
 *      it is identical every render, each triangle matched at most once. Pairs
 *      form ACROSS hex boundaries as readily as within a hex: this is what
 *      dissolves path A's fixed 6-quad fan (the residual pinwheel) and the
 *      regular lattice of hex centres.
 *   3. Subdivide: each merged quad → 4 sub-quads, each LEFTOVER triangle → 3
 *      sub-quads (the canonical "make it all quads" step). Midpoints/centroids
 *      are interned so neighbouring cells share them.
 *   4. Relax the shared mesh (reusing `relaxVerts`), boundary vertices pinned.
 *
 * Ownership is the source hex's territory — the layout keeps territories
 * non-adjacent, so a merge never spans two stories; the coastline is the existing
 * hex-silhouette one (outer vertices pinned), which still encloses the relaxed
 * cells. Deterministic (hash/rand01).
 */
function buildMeshCells(
  drawTiles: readonly DrawTile[],
  wheatSets: readonly ReadonlySet<string>[],
  t: SubstrateTuning,
): RelaxedCell[] {
  const verts: Pt[] = [];
  const vId = new Map<string, number>();
  const adj: Set<number>[] = [];
  const intern = (p: Pt): number => {
    const k = VKEY(p);
    let id = vId.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push({ x: p.x, y: p.y });
      vId.set(k, id);
      adj.push(new Set());
    }
    return id;
  };
  const eKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // 1. Triangulate every hex into 6 triangles over the shared vertex pool, and
  //    index each undirected edge → the triangles touching it (≤2).
  interface Tri {
    v: [number, number, number];
    owner: number;
  }
  const tris: Tri[] = [];
  const triEdges = new Map<string, number[]>();
  for (const { h, owner } of drawTiles) {
    const c = hexCenter(h);
    const oid = intern(c);
    const cornerIds = hexCorners(c.x, c.y, HEX_R).map(intern);
    for (let i = 0; i < 6; i++) {
      const a = cornerIds[i] ?? 0;
      const b = cornerIds[(i + 1) % 6] ?? 0;
      const ti = tris.length;
      tris.push({ v: [oid, a, b], owner });
      for (const [x, y] of [
        [oid, a],
        [a, b],
        [b, oid],
      ] as const) {
        const k = eKey(x, y);
        let arr = triEdges.get(k);
        if (!arr) {
          arr = [];
          triEdges.set(k, arr);
        }
        arr.push(ti);
      }
    }
  }

  // 2. Greedy deterministic pairing: every interior edge shared by two same-owner
  //    triangles is a merge candidate, ordered by a hash; match each triangle once.
  const partner = new Int32Array(tris.length).fill(-1);
  interface Cand {
    ti: number;
    tj: number;
    rank: number;
  }
  const cands: Cand[] = [];
  for (const [k, arr] of triEdges) {
    if (arr.length !== 2) continue;
    const ti = arr[0] ?? 0;
    const tj = arr[1] ?? 0;
    if ((tris[ti]?.owner ?? -1) !== (tris[tj]?.owner ?? -2)) continue;
    cands.push({ ti, tj, rank: hash(`merge:${k}`) });
  }
  cands.sort((p, q) => p.rank - q.rank || p.ti - q.ti || p.tj - q.tj);
  for (const cd of cands) {
    if (partner[cd.ti] === -1 && partner[cd.tj] === -1) {
      partner[cd.ti] = cd.tj;
      partner[cd.tj] = cd.ti;
    }
  }

  // 3. Subdivide into all-quads. Midpoints/centroids interned (shared → watertight);
  //    build the relax adjacency + boundary edge-use as each final cell is emitted.
  const levels = Math.max(1, Math.round(t.subdiv ?? 1));
  const edgeUse = new Map<string, number>();
  const link = (a: number, b: number): void => {
    adj[a]?.add(b);
    adj[b]?.add(a);
    const k = eKey(a, b);
    edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  };
  interface Cell {
    ids: number[];
    owner: number;
    hkey: string;
  }
  const cells: Cell[] = [];
  const mid = (a: number, b: number): number => {
    const pa = verts[a] ?? { x: 0, y: 0 };
    const pb = verts[b] ?? { x: 0, y: 0 };
    return intern({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
  };
  const centroidId = (ids: number[]): number => {
    let x = 0;
    let y = 0;
    for (const id of ids) {
      const p = verts[id] ?? { x: 0, y: 0 };
      x += p.x;
      y += p.y;
    }
    return intern({ x: x / ids.length, y: y / ids.length });
  };
  const emit = (ids: number[], owner: number): void => {
    let cx = 0;
    let cy = 0;
    for (const id of ids) {
      const p = verts[id] ?? { x: 0, y: 0 };
      cx += p.x;
      cy += p.y;
    }
    const hkey = axialKey(pixelToHex({ x: cx / ids.length, y: cy / ids.length }));
    cells.push({ ids, owner, hkey });
    for (let i = 0; i < ids.length; i++) link(ids[i] ?? 0, ids[(i + 1) % ids.length] ?? 0);
  };
  const subdivQuad = (q: number[], owner: number, lv: number): void => {
    if (lv <= 0) {
      emit(q, owner);
      return;
    }
    const [p0, p1, p2, p3] = q as [number, number, number, number];
    const g = centroidId(q);
    const m01 = mid(p0, p1);
    const m12 = mid(p1, p2);
    const m23 = mid(p2, p3);
    const m30 = mid(p3, p0);
    subdivQuad([p0, m01, g, m30], owner, lv - 1);
    subdivQuad([m01, p1, m12, g], owner, lv - 1);
    subdivQuad([g, m12, p2, m23], owner, lv - 1);
    subdivQuad([m30, g, m23, p3], owner, lv - 1);
  };
  const subdivTri = (tri: number[], owner: number, lv: number): void => {
    const [a, b, c] = tri as [number, number, number];
    const g = centroidId(tri);
    const mab = mid(a, b);
    const mbc = mid(b, c);
    const mca = mid(c, a);
    subdivQuad([a, mab, g, mca], owner, lv - 1);
    subdivQuad([b, mbc, g, mab], owner, lv - 1);
    subdivQuad([c, mca, g, mbc], owner, lv - 1);
  };
  for (let ti = 0; ti < tris.length; ti++) {
    const tA = tris[ti];
    if (!tA) continue;
    const pj = partner[ti] ?? -1;
    if (pj === -1) {
      subdivTri(tA.v, tA.owner, levels); // leftover triangle → 3 quads
    } else if (ti < pj) {
      // emit each merged pair once, as the quad p→a→q→b (a,b = shared edge).
      const tB = tris[pj];
      if (!tB) continue;
      const shared = tA.v.filter((x) => tB.v.includes(x));
      const a = shared[0] ?? 0;
      const b = shared[1] ?? 0;
      const p = tA.v.find((x) => x !== a && x !== b) ?? a;
      const q = tB.v.find((x) => x !== a && x !== b) ?? b;
      subdivQuad([p, a, q, b], tA.owner, levels);
    }
  }

  // 4. Pin the silhouette (edges used once), then jitter + relax the interior.
  const pinned = new Set<number>();
  for (const [k, n] of edgeUse) {
    if (n === 1) {
      const [a, b] = k.split('|');
      pinned.add(Number(a));
      pinned.add(Number(b));
    }
  }
  relaxVerts(verts, adj, pinned, { jitterMag: HEX_R * t.jitter, iters: t.iters, relax: t.relax });

  return cells.map((cell) => {
    const isWheatHex = wheatSets[cell.owner]?.has(cell.hkey) ?? false;
    const cellKey = cell.ids.join(',');
    const wheat =
      isWheatHex && (!t.wheatScatter || rand01(hash(`mesh-wheat:${cell.hkey}:${cellKey}`)) < 0.72);
    return {
      owner: cell.owner,
      poly: cell.ids.map((id) => verts[id] ?? { x: 0, y: 0 }),
      variant: hash(`mesh-cell:${cellKey}`) % 3,
      wheat,
    };
  });
}

/**
 * Build the relaxed substrate cells for the whole map from the layout's claimed
 * tiles + per-territory wheat sets. `mesh` is the canonical Townscaper look;
 * `relaxed-hex`/`relaxed-quad` are the lighter alternates. Pure, deterministic.
 */
export function buildRelaxedCells(
  drawTiles: readonly DrawTile[],
  wheatSets: readonly ReadonlySet<string>[],
  mode: SubstrateMode,
  override: Partial<SubstrateTuning> = {},
): RelaxedCell[] {
  if (mode === 'relaxed-hex') {
    return buildRelaxedHexCells(drawTiles, wheatSets, { ...HEX_TUNING, ...override });
  }
  if (mode === 'mesh') {
    return buildMeshCells(drawTiles, wheatSets, { ...MESH_TUNING, ...override });
  }
  return buildRelaxedQuadCells(drawTiles, wheatSets, { ...QUAD_TUNING, ...override });
}
