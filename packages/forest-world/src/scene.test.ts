// The scene-graph's inner-loop dogfood (ADR-0093 / ADR-0020): the framework-agnostic
// drawable tree is DETERMINISTIC (same input → byte-identical scene), selects the
// right drawables per folded status, and lays out the canonical structure. The
// studio's VISUAL PARITY is operator-attested (ADR-0070), not asserted here — these
// tests pin the geometry + structure the mapper renders FROM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hash, rand01 } from './rng.js';
import { crownRadius } from './sizing.js';
import { routeTrails, trailFillWidth, type TrailIsland } from './routing.js';
import type { RelaxedCell } from './substrate.js';
import {
  buildScene,
  buildTrails,
  buildTree,
  buildPlant,
  buildConifer,
  buildBloom,
  type SceneG,
  type SceneNode,
  type SceneInput,
  type SceneTerritoryInput,
  type ScenePlantInput,
} from './scene.js';

// ---------- traversal helpers ----------

function children(n: SceneNode): SceneNode[] {
  return n.el === 'g' ? n.children : [];
}
/** First descendant (incl. self) whose kind matches, DFS. */
function firstByKind(n: SceneNode, kind: string): SceneNode | null {
  if (n.kind === kind) return n;
  for (const c of children(n)) {
    const hit = firstByKind(c, kind);
    if (hit) return hit;
  }
  return null;
}
/** Every descendant (incl. self) whose kind matches. */
function allByKind(n: SceneNode, kind: string): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (m: SceneNode): void => {
    if (m.kind === kind) out.push(m);
    for (const c of children(m)) walk(c);
  };
  walk(n);
  return out;
}
function mustByKind(n: SceneNode, kind: string): SceneNode {
  const hit = firstByKind(n, kind);
  assert.ok(hit, `expected a "${kind}" node`);
  return hit;
}

// ---------- fixtures ----------

// Trail fixtures are ROUTED, not hand-forged: real `routeTrails` output on tiny island
// sets (its own invariants are pinned in routing.test.ts). Computed once at module
// load — routeTrails is a pure function, so sharing the instance is safe.
const isle = (id: string, x: number, y: number, r: number): TrailIsland => ({ id, x, y, r });

// one unobstructed edge, matching the default territories (library → cli)
const BASE_ISLANDS = [isle('library', 100, 200, 60), isle('cli', 300, 60, 50)];
const BASE_TRAILS = routeTrails(
  BASE_ISLANDS,
  [{ from: 'library', to: 'cli', title: 'cli depends on library' }],
  'scene-fixture',
);

// two near-parallel edges into one destination — the reuse discount merges a trunk
const MERGE_TRAILS = routeTrails(
  [isle('a', -800, -60, 35), isle('b', -800, 60, 35), isle('c', 0, 0, 45)],
  [
    { from: 'a', to: 'c' },
    { from: 'b', to: 'c' },
  ],
  'scene-merge',
);

// a walled-in edge — forced under the ring, so hidden ghost runs + cave portals exist
const CAVE_ISLANDS: TrailIsland[] = [isle('A', 0, 0, 30), isle('B', 600, 0, 30)];
for (let k = 0; k < 8; k++) {
  const a = (Math.PI / 4) * k;
  CAVE_ISLANDS.push(isle(`ring${k}`, 150 * Math.cos(a), 150 * Math.sin(a), 60));
}
const CAVE_TRAILS = routeTrails(CAVE_ISLANDS, [{ from: 'A', to: 'B' }], 'scene-cave');

function mkTerritory(over: Partial<SceneTerritoryInput> = {}): SceneTerritoryInput {
  return {
    id: 'library',
    status: 'healthy',
    caps: 3,
    centroid: { x: 100, y: 200 },
    radius: 60,
    treeSpot: { x: 100, y: 190 },
    labelY: 260,
    coastPaths: ['M 0 0 L 10 0 L 10 10 Z'],
    decor: [{ x: 80, y: 180, seed: 7 }],
    plants: [{ id: 'library#cap-a', status: 'healthy', x: 90, y: 205, title: 'cap a — proven' }],
    treeTitle: 'library — healthy',
    wisps: [],
    claims: [],
    plate: { w: 120, h: 33, rx: 7, idY: 14, subY: 27, idText: 'library', subText: 'healthy · 3 caps', title: 'The library' },
    ...over,
  };
}

function mkInput(over: Partial<SceneInput> = {}): SceneInput {
  return {
    offset: { x: 300, y: 400 },
    width: 1200,
    height: 1600,
    empties: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ],
    relaxedCells: [
      { owner: 0, poly: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], variant: 1, wheat: false },
      { owner: 0, poly: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], variant: 2, wheat: true },
      { owner: 1, poly: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], variant: 0, wheat: false },
    ],
    drawTiles: [
      { h: { q: 0, r: 0 }, owner: 0 },
      { h: { q: 1, r: 0 }, owner: 1 },
    ],
    wheatSets: [new Set(['0,0']), new Set()],
    trails: BASE_TRAILS,
    territories: [
      mkTerritory(),
      mkTerritory({ id: 'cli', caps: 2, centroid: { x: 300, y: 60 }, treeSpot: { x: 300, y: 50 }, plants: [], decor: [] }),
    ],
    ...over,
  };
}

// ---------- determinism ----------

test('buildScene is deterministic — same input → byte-identical scene', () => {
  assert.deepEqual(buildScene(mkInput()), buildScene(mkInput()));
});

test('crown jitter is seeded by the story id (same id → same blobs; different id → different)', () => {
  const a = buildTree(mkTerritory({ id: 'alpha' }));
  const a2 = buildTree(mkTerritory({ id: 'alpha' }));
  const b = buildTree(mkTerritory({ id: 'beta' }));
  assert.deepEqual(a, a2);
  const cx = (t: SceneG): number => {
    const lo = mustByKind(t, 'crown-lo');
    const blob = children(lo)[1]; // [0] is the un-jittered central blob
    assert.ok(blob && blob.el === 'circle');
    return blob.cx;
  };
  assert.notEqual(cx(a), cx(b));
});

// ---------- top-level structure ----------

test('buildScene roots an offset world group with the layers in canonical order', () => {
  const scene = buildScene(mkInput());
  assert.equal(scene.kind, 'world');
  assert.match(scene.transform ?? '', /^translate\(300\.0 400\.0\)$/);
  assert.deepEqual(
    scene.children.map((c) => c.kind),
    ['empties-layer', 'coast-layer', 'ground-mesh', 'trails-layer', 'flora-layer', 'hits-layer'],
  );
});

test('mesh ground groups cells by owner; hex ground emits a group per tile', () => {
  const mesh = buildScene(mkInput());
  const ground = mustByKind(mesh, 'ground-mesh');
  // two owners with cells → two territory groups; owner 0 has a wheat + a variant cell.
  assert.equal(allByKind(ground, 'ground').length, 2);
  assert.equal(allByKind(ground, 'cell-wheat').length, 1);
  assert.equal(allByKind(ground, 'cell').length, 2);

  const hex = buildScene(mkInput({ relaxedCells: null }));
  const hexGround = mustByKind(hex, 'ground-hex');
  assert.equal(allByKind(hexGround, 'tile').length, 2); // one group per drawTile
  assert.equal(allByKind(hexGround, 'tile-side').length, 2);
  // tile 0,0 is in owner 0's wheat set → a wheat top; tile 1,0 is a plain variant top.
  assert.equal(allByKind(hexGround, 'tile-top-wheat').length, 1);
  assert.equal(allByKind(hexGround, 'tile-top').length, 1);
});

test('empties + hits are one per input', () => {
  const scene = buildScene(mkInput());
  assert.equal(allByKind(mustByKind(scene, 'empties-layer'), 'empty').length, 2);
  assert.equal(allByKind(mustByKind(scene, 'hits-layer'), 'hit').length, 2);
});

// ---------- the trail network (ADR-0169 §2) ----------

test('the trails layer is FULL passes in order — shadow < casing < fill < ghost — then the edge metadata', () => {
  const layer = buildTrails(mkInput());
  assert.equal(layer.kind, 'trails-layer');
  assert.deepEqual(
    layer.children.map((c) => c.kind),
    ['trail-shadow-pass', 'trail-casing-pass', 'trail-fill-pass', 'trail-ghost-pass', 'trail-edges'],
  );
  // every visible segment appears exactly once per pass, one path each — passes are
  // never interleaved per path (the casing rule: a merge must read as one trail).
  const visible = BASE_TRAILS.segments.filter((s) => !s.hidden);
  assert.ok(visible.length > 0);
  for (const [pass, kind] of [
    ['trail-shadow-pass', 'trail-shadow'],
    ['trail-casing-pass', 'trail-casing'],
    ['trail-fill-pass', 'trail-fill'],
  ] as const) {
    const paths = children(mustByKind(layer, pass));
    assert.equal(paths.length, visible.length, `${pass} draws every visible segment once`);
    assert.ok(paths.every((p) => p.el === 'path' && p.kind === kind));
    assert.deepEqual(paths.map((p) => p.id).sort(), visible.map((s) => s.id).sort());
  }
  // the unobstructed fixture forces nothing under-island → an empty ghost pass.
  assert.equal(children(mustByKind(layer, 'trail-ghost-pass')).length, 0);
  // it renders inside the world above ground, below flora.
  assert.equal(firstByKind(buildScene(mkInput()), 'trails-layer')?.kind, 'trails-layer');
});

test('each segment path carries id / data-usage / data-edges + its pass width from the ONE rule', () => {
  const layer = buildTrails(mkInput());
  const byId = (pass: string, id: string): SceneNode => {
    const hit = children(mustByKind(layer, pass)).find((p) => p.id === id);
    assert.ok(hit, `${pass} carries segment ${id}`);
    return hit;
  };
  for (const seg of BASE_TRAILS.segments.filter((s) => !s.hidden)) {
    const w = trailFillWidth(seg.usage);
    const fill = byId('trail-fill-pass', seg.id);
    assert.ok(fill.el === 'path' && fill.d === seg.d, 'the fill draws the segment d verbatim');
    assert.equal(fill.usage, seg.usage);
    assert.equal(fill.edges, 'library->cli');
    assert.equal(fill.strokeWidth, w);
    assert.equal(byId('trail-casing-pass', seg.id).strokeWidth, w + 2.5);
    assert.equal(byId('trail-shadow-pass', seg.id).strokeWidth, w + 5);
  }
});

test('a spur (usage 1) fill is dash-marked; a trunk (usage ≥ 2) is solid — from usage, never authored', () => {
  const layer = buildTrails(mkInput({ trails: MERGE_TRAILS }));
  const fills = children(mustByKind(layer, 'trail-fill-pass'));
  const spurs = fills.filter((p) => p.spur === true);
  const trunks = fills.filter((p) => p.spur === undefined);
  assert.ok(spurs.length > 0 && trunks.length > 0, 'the merge fixture emerges both spurs and a trunk');
  for (const p of spurs) assert.equal(p.usage, 1);
  for (const p of trunks) assert.ok((p.usage ?? 0) >= 2, 'an unmarked fill is a trunk');
  // the merged trunk carries BOTH edge keys through data-edges.
  assert.ok(trunks.some((p) => (p.edges ?? '').split(',').sort().join(',') === 'a->c,b->c'));
  // the mark is a FILL concern only — shadow + casing stay solid under a dashed spur.
  for (const pass of ['trail-shadow-pass', 'trail-casing-pass'] as const) {
    for (const p of children(mustByKind(layer, pass))) assert.equal(p.spur, undefined);
  }
});

test('trail-edges is non-visual per-edge reveal metadata: data-from/to, title, the ordered F/R chain', () => {
  const meta = mustByKind(buildTrails(mkInput()), 'trail-edges');
  const edges = children(meta);
  assert.equal(edges.length, BASE_TRAILS.edges.length);
  const edge = edges[0]!;
  const src = BASE_TRAILS.edges[0]!;
  assert.ok(edge.el === 'g' && children(edge).length === 0, 'metadata only — no drawables');
  assert.equal(edge.kind, 'trail-edge');
  assert.equal(edge.from, src.from);
  assert.equal(edge.to, src.to);
  assert.equal(edge.title, 'cli depends on library');
  assert.equal(
    edge.segments,
    src.segments.map((r) => `${r.id}:${r.reversed ? 'R' : 'F'}`).join(','),
  );
  assert.ok((edge.segments ?? '').length > 0, 'the chain names at least one segment');
});

test('hidden under-island runs land ONLY in the ghost pass', () => {
  const layer = buildTrails(mkInput({ trails: CAVE_TRAILS }));
  const hidden = CAVE_TRAILS.segments.filter((s) => s.hidden);
  assert.ok(hidden.length > 0, 'the walled-in fixture forces hidden runs');
  const ghosts = children(mustByKind(layer, 'trail-ghost-pass'));
  assert.deepEqual(ghosts.map((p) => p.id).sort(), hidden.map((s) => s.id).sort());
  assert.ok(ghosts.every((p) => p.el === 'path' && p.kind === 'trail-ghost'));
  const hiddenIds = new Set(hidden.map((s) => s.id));
  for (const pass of ['trail-shadow-pass', 'trail-casing-pass', 'trail-fill-pass'] as const) {
    for (const p of children(mustByKind(layer, pass))) {
      assert.ok(!hiddenIds.has(p.id ?? ''), `${pass} never draws a hidden segment`);
    }
  }
});

test('cave portals are PROPS above the flora: arch + rim + apron at the rim bearing, status-folded', () => {
  const cave0 = CAVE_TRAILS.caves[0]!;
  const scene = buildScene(
    mkInput({
      trails: CAVE_TRAILS,
      territories: [mkTerritory({ id: cave0.islandId, status: 'unhealthy' })],
    }),
  );
  const flora = mustByKind(scene, 'flora-layer');
  const caves = children(flora).filter((c) => c.kind === 'cave');
  assert.equal(caves.length, CAVE_TRAILS.caves.length, 'one prop per portal');
  // appended AFTER the territories, so the arch occludes the trail disappearing under.
  const kinds = children(flora).map((c) => c.kind);
  assert.ok(kinds.lastIndexOf('territory') < kinds.indexOf('cave'));
  const cave = caves[0]!;
  assert.ok(cave.el === 'g');
  assert.equal(cave.island, cave0.islandId);
  assert.equal(cave.edges, cave0.edgeIds.join(','));
  // placed at the portal point, rotated to the outward bearing.
  const deg = (cave0.bearing * 180) / Math.PI;
  assert.equal(
    cave.transform,
    `translate(${cave0.x.toFixed(1)} ${cave0.y.toFixed(1)}) rotate(${deg.toFixed(1)})`,
  );
  // the folded island status keys the mapper's shadow/side-wall hue family; a wall
  // island with no territory wears the neutral fallback.
  for (const c of caves) {
    assert.equal(c.status, c.island === cave0.islandId ? 'unhealthy' : 'unknown');
  }
  // the dark flat-bottomed arch, its lit rim arc, and the trampled apron — sized 1.6×
  // from the portal's trail width.
  assert.ok(firstByKind(cave, 'cave-arch'));
  assert.equal(mustByKind(cave, 'cave-rim').strokeWidth, 1.5);
  const apron = mustByKind(cave, 'cave-apron');
  const hw = (cave0.width * 1.6) / 2;
  assert.ok(apron.el === 'ellipse' && Math.abs(apron.rx - hw * 1.3) < 1e-9);
});

test('buildScene stays deterministic with trails + caves present (same input → byte-identical)', () => {
  assert.deepEqual(
    buildScene(mkInput({ trails: CAVE_TRAILS })),
    buildScene(mkInput({ trails: CAVE_TRAILS })),
  );
});

// ---------- the central tree ----------

test('a healthy tree has a full canopy: trunk + 5 low blobs + 3 highlights, no bare branches', () => {
  const t = buildTree(mkTerritory({ status: 'healthy', caps: 3 }));
  assert.equal(t.kind, 'tree');
  assert.equal(t.status, 'healthy');
  assert.ok(firstByKind(t, 'trunk'));
  assert.equal(children(mustByKind(t, 'crown-lo')).length, 5);
  assert.equal(children(mustByKind(t, 'crown-hi')).length, 3);
  assert.equal(firstByKind(t, 'bare'), null);
  assert.equal(allByKind(t, 'litter').length, 0);
  // the un-jittered central blob: cx 0, r = crownRadius(caps), cy = -1.65·R.
  const central = children(mustByKind(t, 'crown-lo'))[0];
  assert.ok(central && central.el === 'circle');
  const R = crownRadius(3);
  assert.equal(central.cx, 0);
  assert.equal(central.r, R);
  assert.ok(Math.abs(central.cy - -1.65 * R) < 1e-9);
});

test('an unhealthy tree withers: bare branches + leaf litter, a sparse crown, no full canopy', () => {
  const t = buildTree(mkTerritory({ status: 'unhealthy', caps: 3 }));
  assert.equal(children(mustByKind(t, 'crown-lo')).length, 2);
  assert.equal(children(mustByKind(t, 'crown-hi')).length, 1);
  assert.equal(mustByKind(t, 'crown-hi').opacity, 0.7);
  assert.equal(children(mustByKind(t, 'bare')).length, 4);
  assert.equal(allByKind(t, 'litter').length, 4);
});

test('proposed + claimed-but-empty stories render the not-yet-full (young) form', () => {
  const central = (t: SceneTerritoryInput): number => {
    const c = children(mustByKind(buildTree(t), 'crown-lo'))[0];
    assert.ok(c && c.el === 'circle');
    return c.r;
  };
  // proposed scales the crown to 0.62; a 0-cap healthy story wears the same small form.
  assert.ok(Math.abs(central(mkTerritory({ status: 'proposed', caps: 4 })) - crownRadius(4) * 0.62) < 1e-9);
  assert.ok(Math.abs(central(mkTerritory({ status: 'healthy', caps: 0 })) - crownRadius(0) * 0.62) < 1e-9);
  // a normal healthy story keeps the full crown.
  assert.equal(central(mkTerritory({ status: 'healthy', caps: 4 })), crownRadius(4));
});

test('the human-witness signpost appears only when declared; blank vs signed seal', () => {
  assert.equal(firstByKind(buildTree(mkTerritory()), 'sign-blank'), null);
  assert.ok(firstByKind(buildTree(mkTerritory({ signpost: { outcome: null } })), 'sign-blank'));
  assert.ok(firstByKind(buildTree(mkTerritory({ signpost: { outcome: 'pass' } })), 'sign-pass'));
  assert.ok(firstByKind(buildTree(mkTerritory({ signpost: { outcome: 'fail' } })), 'sign-fail'));
});

// ---------- flora ----------

test('a plant picks its variant from its id and is alive by default', () => {
  const p = buildPlant({ id: 'x#cap', status: 'healthy', x: 0, y: 0, title: 't' });
  assert.equal(p.kind, 'flora');
  // carries its capability id — the hook each mapper keys interactivity on.
  assert.equal(p.id, 'x#cap');
  assert.equal(firstByKind(p, 'dead-ground'), null);
  // shadow is the wider living size (rx 8), not the dead size (rx 6).
  const shadow = mustByKind(p, 'shadow');
  assert.ok(shadow.el === 'ellipse' && shadow.rx === 8);
});

test('an unhealthy plant withers: a dead-ground patch, the narrower dead shadow, dead silhouette', () => {
  const p = buildPlant({ id: 'x#cap', status: 'unhealthy', x: 0, y: 0, title: 't' });
  assert.ok(firstByKind(p, 'dead-ground'));
  const shadow = mustByKind(p, 'shadow');
  assert.ok(shadow.el === 'ellipse' && shadow.rx === 6);
  // a withered plant shows a dead silhouette (twig or dead stem), never living foliage.
  assert.equal(firstByKind(p, 'flora-light'), null);
  assert.ok(firstByKind(p, 'flora-dead-twig') || firstByKind(p, 'flora-dead-stem'));
});

test('a plant bloom rides the plant; a crown bloom rides the tree (spark counts differ)', () => {
  const withBloom: ScenePlantInput = { id: 'x#cap', status: 'healthy', x: 0, y: 0, title: 't', bloom: { ageRatio: 1, outcome: 'pass' } };
  const p = buildPlant(withBloom);
  const plantBloom = mustByKind(p, 'bloom-plant');
  assert.equal(allByKind(plantBloom, 'bloom-spark').length, 3);

  const t = buildTree(mkTerritory({ bloom: { ageRatio: 0.5, outcome: 'pass' } }));
  const crownBloom = mustByKind(t, 'bloom-crown');
  assert.equal(allByKind(crownBloom, 'bloom-spark').length, 4);
  assert.ok(firstByKind(crownBloom, 'bloom-ring'));
  // the anchor folds the age into opacity: 0.3 + 0.65·ageRatio.
  const anchor = mustByKind(t, 'bloom-anchor');
  assert.equal(anchor.opacity, Number((0.3 + 0.65 * 0.5).toFixed(2)));
});

test('buildBloom is pure / id-seeded — same args → identical, different unit → different sparks', () => {
  const args = ['u1', { ageRatio: 1, outcome: 'pass' as const }, 0, -40, 28, 'crown' as const] as const;
  assert.deepEqual(buildBloom(...args), buildBloom(...args));
  assert.notDeepEqual(buildBloom('u1', { ageRatio: 1, outcome: 'pass' }, 0, 0, 8, 'plant'), buildBloom('u2', { ageRatio: 1, outcome: 'pass' }, 0, 0, 8, 'plant'));
});

// ---------- conifer decor ----------

test('a conifer is a leaning body + snow cap, its colour band from the seed', () => {
  const c = buildConifer(10, 20, 8, 5);
  assert.equal(c.kind, 'conifer');
  const body = mustByKind(c, 'conifer-body');
  assert.equal(body.variant, 5 % 3);
  assert.ok(firstByKind(c, 'conifer-snow'));
});

test('decor seeds expand to 2 + (seed % 2) conifers each', () => {
  const even = buildScene(mkInput({ territories: [mkTerritory({ decor: [{ x: 0, y: 0, seed: 4 }], plants: [] })] }));
  const odd = buildScene(mkInput({ territories: [mkTerritory({ decor: [{ x: 0, y: 0, seed: 5 }], plants: [] })] }));
  assert.equal(allByKind(mustByKind(even, 'flora-layer'), 'conifer').length, 2); // 2 + 0
  assert.equal(allByKind(mustByKind(odd, 'flora-layer'), 'conifer').length, 3); // 2 + 1
});

// ---------- the territory flora group ----------

test('a territory flora group y-sorts its drawables and carries the nameplate', () => {
  const flora = buildScene(mkInput()).children.find((c) => c.kind === 'flora-layer');
  assert.ok(flora && flora.el === 'g');
  const terr = children(flora)[0];
  assert.ok(terr && terr.kind === 'territory' && terr.el === 'g');
  assert.equal(terr.id, 'library');
  // nameplate present with the surface-folded text + box.
  const plate = mustByKind(terr, 'plate');
  const idText = mustByKind(plate, 'plate-id');
  assert.ok(idText.el === 'text' && idText.text === 'library');
  const bg = mustByKind(plate, 'plate-bg');
  assert.ok(bg.el === 'rect' && bg.width === 120 && bg.rx === 7);
});

test('a territory with in-flight builds carries a wisp orbit; none → no wisps', () => {
  const withWisp = buildScene(mkInput({ territories: [mkTerritory({ wisps: [{ runId: 'r1', title: 'building' }] })] }));
  const orbit = mustByKind(withWisp, 'wisps');
  const wisp = mustByKind(orbit, 'wisp');
  assert.equal(typeof wisp.phase, 'number');
  assert.ok(firstByKind(wisp, 'wisp-glow') && firstByKind(wisp, 'wisp-dot') && firstByKind(wisp, 'wisp-hit'));

  const noWisp = buildScene(mkInput()); // mkTerritory default has no wisps
  assert.equal(firstByKind(mustByKind(noWisp, 'flora-layer'), 'wisps'), null);
});

// ---------- the phase-resolved wisp band (ADR-0048 §3 v2) ----------

test('the wisp folds the live gate phase → a red/green band (location ⟂ form: phase is the rotation)', () => {
  const wispFor = (phase?: 'AUTHOR_TEST' | 'CONFIRM_RED' | 'IMPLEMENT' | 'CONFIRM_GREEN' | 'GATE') => {
    const scene = buildScene(
      mkInput({
        territories: [mkTerritory({ wisps: [{ runId: 'r1', title: 'building', ...(phase ? { phase } : {}) }] })],
      }),
    );
    return mustByKind(scene, 'wisp');
  };

  // red while authoring the test / confirming the red.
  assert.equal(wispFor('AUTHOR_TEST').phaseBand, 'red');
  assert.equal(wispFor('CONFIRM_RED').phaseBand, 'red');
  // green on the green observation + the gate.
  assert.equal(wispFor('CONFIRM_GREEN').phaseBand, 'green');
  assert.equal(wispFor('GATE').phaseBand, 'green');
  // IMPLEMENT (writing the source) and an absent phase are the neutral teal "building" band.
  assert.equal(wispFor('IMPLEMENT').phaseBand, 'building');
  assert.equal(wispFor(undefined).phaseBand, 'building');

  // location ⟂ form: the orbit ROTATION `phase` (a number, seeded from the runId) is UNCHANGED by
  // the build phase — the band is a separate, additive field.
  assert.equal(wispFor('GATE').phase, wispFor('CONFIRM_RED').phase);
  assert.equal(typeof wispFor('GATE').phase, 'number');
});

// ---------- the story-CLAIM wisp + the §5 honesty wall (ADR-0138) ----------

test('a territory with a claim carries a DISTINCT claim-wisp orbit (key-seeded); none → no claim wisps', () => {
  const withClaim = buildScene(
    mkInput({
      territories: [
        mkTerritory({ claims: [{ key: 's1', title: 'a session is here', colourState: 'authoring' }] }),
      ],
    }),
  );
  const orbit = mustByKind(withClaim, 'claim-wisps');
  const wisp = mustByKind(orbit, 'claim-wisp');
  // the claim wisp carries its subagent colour-state (form) and a key-seeded orbit rotation (geometry).
  assert.equal(wisp.colourState, 'authoring');
  assert.equal(typeof wisp.phase, 'number');
  // its OWN drawable family — distinct circles, never the build-wisp kinds.
  assert.ok(firstByKind(wisp, 'claim-wisp-glow') && firstByKind(wisp, 'claim-wisp-dot') && firstByKind(wisp, 'claim-wisp-hit'));

  const noClaim = buildScene(mkInput()); // mkTerritory default has no claims
  assert.equal(firstByKind(mustByKind(noClaim, 'flora-layer'), 'claim-wisps'), null);
});

test('each claim intent → its colour-state on the claim wisp (authoring / proving / supplementing)', () => {
  const claimFor = (colourState: 'authoring' | 'proving' | 'supplementing') => {
    const scene = buildScene(
      mkInput({ territories: [mkTerritory({ claims: [{ key: 'k', title: 't', colourState }] })] }),
    );
    return mustByKind(scene, 'claim-wisp');
  };
  assert.equal(claimFor('authoring').colourState, 'authoring');
  assert.equal(claimFor('proving').colourState, 'proving');
  assert.equal(claimFor('supplementing').colourState, 'supplementing');
});

test('§5 honesty wall: a claim wisp is NEVER a bloom — no bloom/outcome token anywhere on the claim layer', () => {
  // A claim in EVERY colour-state, including the at-risk "proving" (the in-flight hue that must NOT
  // read as the proven-green bloom): the claim layer must emit no bloom drawable and no `outcome`.
  for (const colourState of ['authoring', 'proving', 'supplementing'] as const) {
    const scene = buildScene(
      mkInput({ territories: [mkTerritory({ claims: [{ key: 'k', title: 't', colourState }] })] }),
    );
    const orbit = mustByKind(scene, 'claim-wisps');
    // no bloom drawable family on the claim orbit …
    for (const bloomKind of ['bloom-anchor', 'bloom-crown', 'bloom-plant', 'bloom-ring', 'bloom-spark']) {
      assert.equal(firstByKind(orbit, bloomKind), null, `claim orbit must carry no ${bloomKind}`);
    }
    // … and no node under it carries a verdict `outcome` (the bloom's hue driver).
    const walk = (n: SceneNode): void => {
      assert.equal(n.outcome, undefined, 'a claim-layer node must never carry a verdict outcome');
      for (const c of children(n)) walk(c);
    };
    walk(orbit);
  }
});

test('a BUILD wisp can carry the live subagent colourState (ADR-0138 §5) — additive to phaseBand, absent by default', () => {
  // back-compat: no colourState stamped → the wisp has none (the phaseBand look is unchanged).
  const plain = buildScene(mkInput({ territories: [mkTerritory({ wisps: [{ runId: 'r', title: 'b' }] })] }));
  assert.equal(mustByKind(plain, 'wisp').colourState, undefined);
  // stamped → the build wisp carries the role tint ALONGSIDE its red→green band.
  const tinted = buildScene(
    mkInput({ territories: [mkTerritory({ wisps: [{ runId: 'r', title: 'b', phase: 'CONFIRM_RED', colourState: 'proving' }] })] }),
  );
  const wisp = mustByKind(tinted, 'wisp');
  assert.equal(wisp.colourState, 'proving');
  assert.equal(wisp.phaseBand, 'red'); // the band still folds from the gate phase, unchanged
});

test('buildScene stays deterministic with a claim layer present (same input → byte-identical)', () => {
  const withClaims = (): SceneInput =>
    mkInput({ territories: [mkTerritory({ claims: [{ key: 's1', title: 't', colourState: 'proving' }] })] });
  assert.deepEqual(buildScene(withClaims()), buildScene(withClaims()));
});

// ---------- the claim-GRADE wisp geometry + the departure drawable (ADR-0200 D7) ----------
//
// Stage-1 GEOMETRY only: which drawable family a grade emits and its deterministic placement.
// The LOOK (colours / spacing / fade curve) is the mapper's, operator-attested later (ADR-0070).

test('an exploring claim HOVERS: a stationary hover-wisp beside the tree — no orbit phase, deterministic rest spot', () => {
  const input = (): SceneInput =>
    mkInput({
      territories: [
        mkTerritory({
          claims: [{ key: 's1', title: 'reading the store seam', colourState: 'authoring', grade: 'exploring' }],
        }),
      ],
    });
  const scene = buildScene(input());
  const orbit = mustByKind(scene, 'claim-wisps');
  const wisp = mustByKind(orbit, 'hover-wisp');
  // STATIONARY by construction: the mapper animates the orbit rotation only when `phase` is present
  // (and only on the 'wisp'/'claim-wisp' kinds) — a hover wisp carries NO phase, so it can never spin.
  assert.equal(wisp.phase, undefined);
  // the intent prose rides the title; the colour-state is carried unchanged.
  assert.equal(wisp.title, 'reading the store seam');
  assert.equal(wisp.colourState, 'authoring');
  // its OWN drawable family, mirroring the claim-wisp structure.
  assert.ok(firstByKind(wisp, 'hover-wisp-hit') && firstByKind(wisp, 'hover-wisp-glow') && firstByKind(wisp, 'hover-wisp-dot'));
  // an exploring claim never emits the orbiting work family.
  assert.equal(firstByKind(orbit, 'claim-wisp'), null);
  // deterministic: same input → byte-identical scene; the rest spot is a fixed translate.
  assert.deepEqual(buildScene(input()), buildScene(input()));
  const inner = children(wisp)[0];
  assert.ok(inner && inner.el === 'g');
  assert.match(inner.transform ?? '', /^translate\(-?[\d.]+ -?[\d.]+\)$/);
  // per-key jitter: two hoverers on one island never stack exactly.
  const two = buildScene(
    mkInput({
      territories: [
        mkTerritory({
          claims: [
            { key: 's1', title: 't', colourState: 'authoring', grade: 'exploring' },
            { key: 's2', title: 't', colourState: 'authoring', grade: 'exploring' },
          ],
        }),
      ],
    }),
  );
  const hovers = allByKind(two, 'hover-wisp');
  assert.equal(hovers.length, 2);
  const spot = (n: SceneNode): string => {
    const c0 = children(n)[0];
    assert.ok(c0);
    return c0.transform ?? '';
  };
  assert.notEqual(spot(hovers[0]!), spot(hovers[1]!));
});

test('waiting claims QUEUE: queue-wisps in INPUT order along a line — index-placed, never hash-random', () => {
  const claimsOf = (keys: string[]) =>
    keys.map((key) => ({ key, title: `waiting ${key}`, colourState: 'proving' as const, grade: 'waiting' as const }));
  const scene = buildScene(mkInput({ territories: [mkTerritory({ claims: claimsOf(['w1', 'w2', 'w3']) })] }));
  const queue = allByKind(mustByKind(scene, 'claim-wisps'), 'queue-wisp');
  assert.equal(queue.length, 3);
  // input order preserved — the surface sends waiters ordered by claimedAt (the queue contract).
  assert.deepEqual(queue.map((q) => q.title), ['waiting w1', 'waiting w2', 'waiting w3']);
  // stationary: no orbit phase anywhere on the queue.
  for (const q of queue) assert.equal(q.phase, undefined);
  // strictly ordered positions along ONE line: x advances per queue index, y fixed.
  const spotOf = (q: SceneNode): { x: number; y: number } => {
    const inner = children(q)[0];
    assert.ok(inner && inner.el === 'g');
    const m = /^translate\((-?[\d.]+) (-?[\d.]+)\)$/.exec(inner.transform ?? '');
    assert.ok(m, 'a queue wisp sits at a plain translate');
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  const spots = queue.map(spotOf);
  assert.ok(spots[0]!.x < spots[1]!.x && spots[1]!.x < spots[2]!.x, 'the line advances with the index');
  assert.ok(spots.every((s) => s.y === spots[0]!.y), 'one line — a shared y');
  // index-driven, never key-driven: different keys in the same slots land on the SAME spots.
  const other = buildScene(mkInput({ territories: [mkTerritory({ claims: claimsOf(['zz', 'aa', 'mm']) })] }));
  assert.deepEqual(allByKind(mustByKind(other, 'claim-wisps'), 'queue-wisp').map(spotOf), spots);
  // its OWN drawable family, mirroring the claim-wisp structure.
  assert.ok(
    firstByKind(queue[0]!, 'queue-wisp-hit') && firstByKind(queue[0]!, 'queue-wisp-glow') && firstByKind(queue[0]!, 'queue-wisp-dot'),
  );
});

test('a work claim — and a grade-ABSENT claim — keeps today\'s orbit unchanged (ADR-0200 D2 back-compat lock)', () => {
  const orbitFor = (claims: NonNullable<SceneTerritoryInput['claims']>): SceneNode =>
    mustByKind(buildScene(mkInput({ territories: [mkTerritory({ claims })] })), 'claim-wisps');
  const absent = orbitFor([{ key: 's1', title: 't', colourState: 'proving' }]);
  const work = orbitFor([{ key: 's1', title: 't', colourState: 'proving', grade: 'work' }]);
  // an absent grade IS the work claim — byte-identical output (every pre-grade surface unchanged).
  assert.deepEqual(absent, work);
  // the regression lock on today's orbit: kind, key-seeded rotation, radius·0.72 + 22 orbit.
  const wisp = mustByKind(absent, 'claim-wisp');
  assert.equal(wisp.phase, rand01(hash('s1')) * 360);
  assert.equal(wisp.colourState, 'proving');
  const inner = children(wisp)[0];
  assert.ok(inner && inner.el === 'g');
  assert.equal(inner.transform, `translate(${(60 * 0.72 + 22).toFixed(1)} 0)`);
  assert.ok(firstByKind(wisp, 'claim-wisp-hit') && firstByKind(wisp, 'claim-wisp-glow') && firstByKind(wisp, 'claim-wisp-dot'));
});

test('mixed grades share the ONE claim-wisps layer — each claim renders its own family', () => {
  const scene = buildScene(
    mkInput({
      territories: [
        mkTerritory({
          claims: [
            { key: 'e1', title: 't', colourState: 'authoring', grade: 'exploring' },
            { key: 'q1', title: 't', colourState: 'proving', grade: 'waiting' },
            { key: 'k1', title: 't', colourState: 'supplementing', grade: 'work' },
          ],
        }),
      ],
    }),
  );
  assert.equal(allByKind(scene, 'claim-wisps').length, 1);
  const orbit = mustByKind(scene, 'claim-wisps');
  assert.equal(allByKind(orbit, 'hover-wisp').length, 1);
  assert.equal(allByKind(orbit, 'queue-wisp').length, 1);
  assert.equal(allByKind(orbit, 'claim-wisp').length, 1);
});

test('departures emit a stationary departing-wisp family carrying ageRatio; absent/empty → NO layer', () => {
  const departed = buildScene(
    mkInput({ territories: [mkTerritory({ departures: [{ key: 's9', title: 'left the island', ageRatio: 0.5 }] })] }),
  );
  const layer = mustByKind(departed, 'departing-wisps');
  const wisp = mustByKind(layer, 'departing-wisp');
  // ageRatio rides the node — the mapper turns it into the fade (the curve is the mapper/CSS's job).
  assert.equal(wisp.ageRatio, 0.5);
  assert.equal(wisp.title, 'left the island');
  assert.equal(wisp.phase, undefined); // stationary — never an orbit
  assert.ok(
    firstByKind(wisp, 'departing-wisp-hit') && firstByKind(wisp, 'departing-wisp-glow') && firstByKind(wisp, 'departing-wisp-dot'),
  );
  // the leaving translation is deterministic and drifts with age.
  const spotAt = (ageRatio: number): string => {
    const s = buildScene(mkInput({ territories: [mkTerritory({ departures: [{ key: 's9', title: 't', ageRatio }] })] }));
    const inner = children(mustByKind(s, 'departing-wisp'))[0];
    assert.ok(inner && inner.el === 'g');
    return inner.transform ?? '';
  };
  assert.equal(spotAt(0.5), spotAt(0.5));
  assert.notEqual(spotAt(0.1), spotAt(0.9));
  // absent and empty departures both emit NO layer (no new empty groups for the website).
  assert.equal(firstByKind(buildScene(mkInput()), 'departing-wisps'), null);
  const empty = buildScene(mkInput({ territories: [mkTerritory({ departures: [] })] }));
  assert.equal(firstByKind(empty, 'departing-wisps'), null);
});

test('§5 honesty wall holds for EVERY grade + the departure layer: no bloom kind, no verdict outcome', () => {
  const scene = buildScene(
    mkInput({
      territories: [
        mkTerritory({
          claims: [
            { key: 'e1', title: 't', colourState: 'authoring', grade: 'exploring' },
            { key: 'q1', title: 't', colourState: 'proving', grade: 'waiting' },
            { key: 'k1', title: 't', colourState: 'supplementing', grade: 'work' },
          ],
          departures: [{ key: 'd1', title: 't', ageRatio: 0.8 }],
        }),
      ],
    }),
  );
  for (const layerKind of ['claim-wisps', 'departing-wisps'] as const) {
    const layer = mustByKind(scene, layerKind);
    const walk = (n: SceneNode): void => {
      assert.ok(!(n.kind ?? '').includes('bloom'), `${layerKind} must emit no bloom kind`);
      assert.equal(n.outcome, undefined, `a ${layerKind} node must never carry a verdict outcome`);
      for (const c of children(n)) walk(c);
    };
    walk(layer);
  }
});

test('website back-compat: NO claims + NO departures → no wisp layers at all — the plate stays last', () => {
  // the public website omits `claims`/`departures` entirely — build a territory with the keys ABSENT.
  const { claims: _dropped, ...noClaimsTerritory } = mkTerritory();
  const scene = buildScene(mkInput({ territories: [noClaimsTerritory] }));
  const terr = mustByKind(scene, 'territory');
  assert.ok(terr.el === 'g');
  const kinds = children(terr).map((n) => n.kind);
  assert.equal(kinds[kinds.length - 1], 'plate');
  for (const k of ['wisps', 'claim-wisps', 'departing-wisps']) {
    assert.ok(!kinds.includes(k as never), `no empty ${k} group`);
  }
  // absent and [] render identically — the new optional keys add nothing when unused.
  assert.deepEqual(scene, buildScene(mkInput({ territories: [mkTerritory()] })));
});

// ---------- the byte-for-byte parcels-ABSENT regression lock (forest-parcels inc 1) ----------
//
// The website (and every parcels-unaware surface) must render TODAY's ground + conifer decor +
// one-plant-per-cap ring BYTE-FOR-BYTE once capability parcels land. This lock was generated from
// HEAD behaviour BEFORE the parcels branch existed and asserts deep-equality against the committed
// golden scene forever after — the parcels feature may only ADD a branch, never perturb the absence
// path. If this test goes red, the absence path drifted: fix the drift, never re-bake the fixture.
//
// The fixture input deliberately exercises every parcels-absent drawable family: conifer decor,
// the capability plant ring (alive + withered + a plant bloom), scattered wheat, a crown bloom, a
// signpost, an in-flight build wisp, and a story claim — across a healthy and a proposed island.

/** The pinned parcels-ABSENT input. Kept as pure literal data (+ a routed trail) so the golden
 *  generator can reproduce it verbatim; NO `parcels` field anywhere → the absence render path. */
function absenceLockInput(): SceneInput {
  const trails = routeTrails(
    [isle('library', 100, 200, 60), isle('cli', 300, 60, 50)],
    [{ from: 'library', to: 'cli', title: 'cli depends on library' }],
    'absence-lock',
  );
  return {
    offset: { x: 300, y: 400 },
    width: 1200,
    height: 1600,
    empties: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ],
    relaxedCells: [
      { owner: 0, poly: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], variant: 1, wheat: false },
      { owner: 0, poly: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], variant: 2, wheat: true },
      { owner: 0, poly: [{ x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }], variant: 0, wheat: true },
      { owner: 1, poly: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], variant: 0, wheat: false },
    ],
    drawTiles: [
      { h: { q: 0, r: 0 }, owner: 0 },
      { h: { q: 1, r: 0 }, owner: 1 },
    ],
    wheatSets: [new Set(['0,0']), new Set()],
    trails,
    territories: [
      {
        id: 'library',
        status: 'healthy',
        caps: 3,
        centroid: { x: 100, y: 200 },
        radius: 60,
        treeSpot: { x: 100, y: 190 },
        labelY: 260,
        coastPaths: ['M 0 0 L 10 0 L 10 10 Z'],
        decor: [
          { x: 80, y: 180, seed: 7 },
          { x: 120, y: 210, seed: 4 },
        ],
        plants: [
          { id: 'library#cap-a', status: 'healthy', x: 90, y: 205, title: 'cap a', bloom: { ageRatio: 0.5, outcome: 'pass' } },
          { id: 'library#cap-b', status: 'unhealthy', x: 110, y: 215, title: 'cap b' },
        ],
        treeTitle: 'library — healthy',
        signpost: { outcome: 'pass' },
        bloom: { ageRatio: 0.8, outcome: 'pass' },
        wisps: [{ runId: 'r1', title: 'building', phase: 'CONFIRM_RED', colourState: 'proving' }],
        claims: [{ key: 's1', title: 'a session is here', colourState: 'authoring', grade: 'work' }],
        plate: { w: 120, h: 33, rx: 7, idY: 14, subY: 27, idText: 'library', subText: 'healthy · 3 caps', title: 'The library' },
      },
      {
        id: 'cli',
        status: 'proposed',
        caps: 2,
        centroid: { x: 300, y: 60 },
        radius: 50,
        treeSpot: { x: 300, y: 50 },
        labelY: 120,
        coastPaths: ['M 0 0 L 8 0 L 8 8 Z'],
        decor: [{ x: 290, y: 55, seed: 5 }],
        plants: [{ id: 'cli#cap-x', status: 'proposed', x: 295, y: 65, title: 'cap x' }],
        treeTitle: 'cli — proposed',
        wisps: [],
        claims: [],
        plate: { w: 100, h: 30, rx: 6, idY: 13, subY: 25, idText: 'cli', subText: 'proposed · 2 caps', title: 'The cli' },
      },
    ],
  };
}

const ABSENCE_GOLDEN = fileURLToPath(new URL('./scene-absence-fixture.json', import.meta.url));

test('parcels-ABSENT scene matches the committed byte-for-byte lock (generated from HEAD)', () => {
  const golden = JSON.parse(readFileSync(ABSENCE_GOLDEN, 'utf8'));
  assert.deepEqual(buildScene(absenceLockInput()), golden);
});

// ---------- capability PARCELS (forest-parcels inc 1) ----------
//
// Stage-1 GEOMETRY only: the cell → parcel assignment, the per-cell cap-status tint, the flora
// density curve, and the conifer/plant-ring retirement. The LOOK (theme palettes / flora craft) is
// the mapper's, operator-attested later (ADR-0070).

/** A relaxed substrate cell whose centroid is EXACTLY (cx, cy) — a small triangle around it. */
const cellAt = (cx: number, cy: number, owner: number): RelaxedCell => ({
  owner,
  poly: [{ x: cx - 2, y: cy - 2 }, { x: cx + 2, y: cy - 2 }, { x: cx, y: cy + 4 }],
  variant: 0,
  wheat: false,
});

const SEED_A = { x: 0, y: 0 };
const SEED_B = { x: 100, y: 0 };
// four cells hugging seed A, four hugging seed B — a mis-assignment would move the 4/4 split.
const CELLS_AB: RelaxedCell[] = [
  cellAt(0, 0, 0), cellAt(6, 6, 0), cellAt(-4, 4, 0), cellAt(8, -6, 0),
  cellAt(100, 0, 0), cellAt(96, 6, 0), cellAt(104, -4, 0), cellAt(98, 8, 0),
];

type Parcels = NonNullable<SceneTerritoryInput['parcels']>;
const parcelsAB = (testA: number, testB: number, theme: 'meadow' | 'woodland' | 'heath' = 'meadow'): Parcels => [
  { capId: 'capA', status: 'healthy', testCount: testA, theme, seed: SEED_A },
  { capId: 'capB', status: 'unhealthy', testCount: testB, theme, seed: SEED_B },
];

/** A one-island scene whose territory carries `parcels` — AND still has `decor`/`plants` set, so the
 *  retirement of the conifers + plant ring is observable. The territory status is `proposed` so a
 *  per-cell tint that matched it could not be mistaken for the (healthy/unhealthy) cap statuses. */
function parcelScene(parcels: Parcels, cells: RelaxedCell[]): SceneG {
  return buildScene(
    mkInput({
      relaxedCells: cells,
      territories: [
        mkTerritory({
          id: 'library',
          status: 'proposed',
          parcels,
          decor: [{ x: 80, y: 180, seed: 7 }],
          plants: [{ id: 'library#cap-a', status: 'healthy', x: 90, y: 205, title: 'cap a' }],
        }),
      ],
    }),
  );
}

test('parcels sub-partition the island cells by nearest seed (equal-weight Voronoi), deterministically', () => {
  const scene = parcelScene(parcelsAB(3, 3), CELLS_AB);
  const parcels = allByKind(mustByKind(scene, 'ground-mesh'), 'parcel');
  assert.equal(parcels.length, 2);
  const capA = parcels.find((p) => p.id === 'capA')!;
  const capB = parcels.find((p) => p.id === 'capB')!;
  // the 4 cells nearest seed A land under capA, the 4 nearest seed B under capB.
  assert.equal(children(capA).length, 4);
  assert.equal(children(capB).length, 4);
  // deterministic: same parcels input → byte-identical scene.
  assert.deepEqual(scene, parcelScene(parcelsAB(3, 3), CELLS_AB));
});

test('every parcel cell wears its ASSIGNED cap status — not the per-territory status', () => {
  const scene = parcelScene(parcelsAB(3, 3), CELLS_AB);
  const parcels = allByKind(mustByKind(scene, 'ground-mesh'), 'parcel');
  const capA = parcels.find((p) => p.id === 'capA')!;
  const capB = parcels.find((p) => p.id === 'capB')!;
  // reuses the existing `cell` kind (zero new ground CSS) with the CAP's status, not the island's.
  for (const c of children(capA)) {
    assert.equal(c.kind, 'cell');
    assert.equal(c.status, 'healthy');
  }
  for (const c of children(capB)) {
    assert.equal(c.kind, 'cell');
    assert.equal(c.status, 'unhealthy');
  }
  // the territory is `proposed`, so neither cap tint could be the island tint bleeding through.
});

test('flora density IS the test count — a higher-testCount parcel grows strictly more flora (same island, same theme)', () => {
  const scene = parcelScene(parcelsAB(1, 12), CELLS_AB); // both meadow
  const flora = allByKind(mustByKind(scene, 'flora-layer'), 'parcel-flora');
  const a = flora.filter((n) => n.id === 'capA').length;
  const b = flora.filter((n) => n.id === 'capB').length;
  assert.ok(a > 0, 'a 1-test parcel still shows a sprig');
  assert.ok(b > a, `the 12-test parcel grows strictly more marks than the 1-test one: ${a} < ${b}`);
});

test('a parcels-present island RETIRES the conifer decor AND the one-plant-per-cap ring', () => {
  const scene = parcelScene(parcelsAB(3, 3), CELLS_AB); // territory ALSO carries decor + plants
  const layer = mustByKind(scene, 'flora-layer');
  assert.equal(firstByKind(layer, 'conifer'), null, 'no decorative conifers on a parcels island');
  assert.equal(firstByKind(layer, 'flora'), null, 'no one-plant-per-cap ring on a parcels island');
  // the central tree still stands and the parcel flora replaced them.
  assert.ok(firstByKind(layer, 'tree'));
  assert.ok(firstByKind(layer, 'parcel-flora'));
});

test('parcel flora carries theme + status + capId; the generic mark vocabulary is emitted', () => {
  const scene = parcelScene(parcelsAB(4, 4), CELLS_AB);
  const item = mustByKind(scene, 'parcel-flora');
  assert.equal(item.theme, 'meadow');
  assert.ok(item.status === 'healthy' || item.status === 'unhealthy');
  assert.ok(typeof item.id === 'string' && item.id.startsWith('cap'));
  const layer = mustByKind(scene, 'flora-layer');
  // meadow healthy → grass blades; meadow unhealthy → a dead stem: the generic kinds appear.
  assert.ok(allByKind(layer, 'parcel-blade').length > 0);
  assert.ok(allByKind(layer, 'parcel-stem').length > 0);
});

test('each theme routes through its own SurfaceFn — the theme tag rides every flora item', () => {
  for (const theme of ['meadow', 'woodland', 'heath'] as const) {
    const scene = parcelScene([{ capId: 'c', status: 'healthy', testCount: 6, theme, seed: SEED_A }], CELLS_AB);
    for (const item of allByKind(mustByKind(scene, 'flora-layer'), 'parcel-flora')) {
      assert.equal(item.theme, theme);
    }
    // woodland/heath healthy forms carry a shrub blob; meadow carries blades.
    const layer = mustByKind(scene, 'flora-layer');
    if (theme === 'meadow') assert.ok(allByKind(layer, 'parcel-blade').length > 0);
    else assert.ok(allByKind(layer, 'parcel-shrub').length > 0);
  }
});

test('buildScene stays deterministic with parcels present (same input → byte-identical)', () => {
  assert.deepEqual(parcelScene(parcelsAB(2, 9, 'woodland'), CELLS_AB), parcelScene(parcelsAB(2, 9, 'woodland'), CELLS_AB));
});

test('§ back-compat: parcels absent OR no substrate cells → today\'s conifer + plant render (no parcel kinds)', () => {
  // parcels set but the island is hex-ground (no relaxedCells) → the feature no-ops, conifers stay.
  const hex = buildScene(
    mkInput({
      relaxedCells: null,
      territories: [mkTerritory({ id: 'library', parcels: parcelsAB(5, 5) })],
    }),
  );
  const layer = mustByKind(hex, 'flora-layer');
  assert.equal(firstByKind(layer, 'parcel-flora'), null, 'no parcels without the relaxed mesh');
  assert.ok(firstByKind(layer, 'conifer'), 'conifers survive when parcels cannot render');
});

// ---------- the UAT marker walk (forest-parcels inc 2) ----------
//
// Stage-1 GEOMETRY only: the walk + marker STRUCTURE — wrapper kinds, counts, input order, id
// carriage, deterministic placement. The marker BODY is behind the `brazierMarks` splice seam
// (ADR-0208): its exact marks are deliberately NOT pinned here, so the designer's art can change the
// body without touching these tests. The LOOK is operator-attested later (ADR-0070). The walk's
// placement cubic is INVISIBLE (owner call 2026-07-18 — no trail-bed drawable).

type UatCriteria = NonNullable<SceneTerritoryInput['uatCriteria']>;

/** A one-island scene whose territory carries `uatCriteria` + the human-witness signpost. */
function markerScene(uatCriteria: UatCriteria, over: Partial<SceneTerritoryInput> = {}): SceneG {
  return buildScene(
    mkInput({ territories: [mkTerritory({ signpost: { outcome: null }, uatCriteria, ...over })] }),
  );
}

const THREE_CRITERIA: UatCriteria = [
  { id: 'crit-a', state: 'proven' },
  { id: 'crit-b', state: 'pending' },
  { id: 'crit-c', state: 'failing' },
];

test('a uatCriteria-present island emits a uat-walk: one marker per criterion in input order, NO visible bed', () => {
  const scene = markerScene(THREE_CRITERIA);
  const walk = mustByKind(scene, 'uat-walk');
  assert.ok(walk.el === 'g');
  // the placement cubic is INVISIBLE — the walk carries ONLY the marker wrappers (owner call
  // 2026-07-18: the visible bed clashed with the inter-island trail network).
  const markers = children(walk);
  assert.equal(markers.length, THREE_CRITERIA.length);
  assert.deepEqual(
    markers.map((m) => m.kind),
    ['brazier-proven', 'brazier-pending', 'brazier-failing'],
  );
  assert.deepEqual(markers.map((m) => m.id), ['crit-a', 'crit-b', 'crit-c']);
  for (const m of markers) {
    assert.ok(m.el === 'g' && children(m).length > 0, 'a marker wrapper carries body marks');
    // the 0.9 scale is the design review's walk-density trim, applied on the wrapper.
    assert.match(m.transform ?? '', /^translate\(-?[\d.]+ -?[\d.]+\) scale\(0\.9\)$/);
  }
});

test('the markers stand on a placed walk, and the human-witness signpost seal is RETAINED', () => {
  const scene = markerScene(THREE_CRITERIA, { signpost: { outcome: 'pass' } });
  // the signpost is the trailhead seal — the markers never replace it.
  assert.ok(firstByKind(scene, 'sign-pass'), 'the signpost seal survives a marker walk');
  // every marker resolves to a concrete spot along the (invisible) placement cubic.
  const walk = mustByKind(scene, 'uat-walk');
  const spots = children(walk).map((m) => /^translate\((-?[\d.]+) (-?[\d.]+)\) scale\(0\.9\)$/.exec(m.transform ?? ''));
  assert.ok(spots.every((s) => s !== null), 'every marker carries a translate + the density-trim scale');
  assert.equal(new Set(spots.map((s) => s![0])).size, spots.length, 'markers stand on distinct spots');
});

test('the marker walk is deterministic (same input → byte-identical) and id-seeded (different story → different walk)', () => {
  assert.deepEqual(markerScene(THREE_CRITERIA), markerScene(THREE_CRITERIA));
  const walkOf = (id: string): SceneNode =>
    mustByKind(markerScene(THREE_CRITERIA, { id }), 'uat-walk');
  assert.notDeepEqual(walkOf('alpha'), walkOf('beta'));
});

test('many criteria space gracefully: every marker lands on its own spot along the walk', () => {
  const many: UatCriteria = Array.from({ length: 8 }, (_, i) => ({
    id: `crit-${i}`,
    state: (['proven', 'pending', 'failing'] as const)[i % 3]!,
  }));
  const walk = mustByKind(markerScene(many), 'uat-walk');
  const markers = children(walk);
  assert.equal(markers.length, 8);
  const spots = markers.map((m) => m.transform ?? '');
  assert.equal(new Set(spots).size, 8, 'no two markers stack on one spot');
});

test('§ back-compat ABSENCE LOCK: uatCriteria absent OR empty → NO marker kinds; absent and [] byte-identical', () => {
  // absent (mkTerritory carries no uatCriteria) → no uat-walk anywhere. The committed golden
  // fixture test above ("parcels-ABSENT scene matches …") is the byte-for-byte pre-change lock —
  // it must stay green untouched; this adds the absent ≡ [] equivalence, the inc-1 pattern.
  const absent = buildScene(mkInput());
  for (const k of ['uat-walk', 'brazier-proven', 'brazier-pending', 'brazier-failing']) {
    assert.equal(firstByKind(absent, k), null, `no ${k} on a uatCriteria-absent island`);
  }
  const empty = buildScene(mkInput({ territories: [mkTerritory({ uatCriteria: [] })] }));
  assert.deepEqual(empty, buildScene(mkInput({ territories: [mkTerritory()] })));
});
