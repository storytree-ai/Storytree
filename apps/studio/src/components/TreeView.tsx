// TreeView — the story world (#/tree).
//
// A Dorfromantik-style hex-tile world that READS AS A TREE (ADR-0036 d.6):
// islands are dependency-ranked — the most-depended-upon stories sit at the
// bottom centre and dependents fan upward and outward, so the eye traces the
// load-bearing foundation up through the canopy. Every story claims a
// TERRITORY of extruded hexagonal tiles (one tile quota per capability plus a
// margin) and grows ONE central story tree — the story itself, crown sized by
// capability count, GROWTH and foliage carrying the lifecycle (ADR-0038): a
// young amber tree while proposed or claimed-but-empty (building wears proposed
// too — wisps carry live work), a full brownfield tree when mapped, deep green
// when healthy, withered to bare branches when unhealthy. Retired units don't
// render at all (worldStatus.ts). HUE CARRIES
// PROOF (ADR-0040): deep green only ever derives from a signed pass in
// events.verdict — authored status can never paint it — and the crown greens
// only from the story's OWN UAT verdict, never a child roll-up (ADR-0033
// d.4). Capabilities garden around it as small flora (flower beds / berry
// bushes / saplings); one whose last signed run failed — or whose status is
// unhealthy — withers to a dead plant. There are no ✓/✗ badges in the world:
// the hue IS the verdict (precise facts stay in the panel and tooltips). A
// signpost marks a HUMAN-witnessed story (uat_witness absent or human):
// dashed-blank until the operator's UAT ceremony signs a verdict, a filled
// seal after; machine-witnessed stories carry none.
// Story-level `depends_on` (∪ derived cross-story capability deps) renders as
// roads; hovering a territory lights its upstream chain (gold) vs downstream
// dependents (red) — the focus interaction carried from V1's
// visualisations/storytree. Clicking opens the side panel with the story's
// capability sub-DAG (dagre layout, status-strip cards). A legend bar docked
// at the top of the frame maps the visual vocabulary, one entry per model
// with expandable state fans (WorldLegend.tsx); its status fan doubles as the
// status filter.
//
// Data is /api/tree — offline, straight from stories/ frontmatter; verdict
// glyphs and presence wisps are advisory layers that appear only when the
// live store answers. All "randomness" (tile growth, crown-blob jitter, road
// bows) is hashed from ids so the world renders identically every time.

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { isBuildInFlight, verdictBloom, type VerdictBloom } from '../lib/activity.js';
import { useBuildActivity } from '../lib/buildActivity';
import { formatAge, isOrbitingBand, splitSessions, usePresence } from '../lib/presence';
import { docHref, navigate, treeFocusHref, treeHref } from '../lib/route';
import { presentStories } from '../lib/worldStatus.js';
import {
  WorldLegend,
  LegendDrawerBody,
  legendRowLabel,
  legendModelFor,
  type RowKey,
} from './WorldLegend.js';
import { flyoutReducer, FLYOUT_CLOSED } from '../lib/panelFlyout.js';
import {
  controlByKey,
  readControlValue,
  readRenderScene,
  type ControlSpec,
} from '../lib/worldSettings.js';
import {
  solarSeeds,
  spokeEdges,
  dockedEdgePath,
  dockedRoads,
  orbitRings,
  type SolarNode,
  type DockNode,
} from '../lib/solarLayout.js';
import { fullConnectionSet } from '../lib/connectionSet.js';
import { bookshelfConsumers, sharedIslandStories, shelfBooks } from '../lib/buildingLayout.js';
import { ConnectionsSection } from './ConnectionsSection.js';
import { BuildSection } from './BuildSection.js';
import { WorldSettingsPanel } from './WorldSettingsPanel.js';
import type { BuildActivity, DocMeta, TreeCapability, TreeSession, TreeStory, TreeVerdict, UatTestRow } from '../types';
import {
  hash,
  rand01,
  type Pt,
  type Axial,
  HEX_R,
  HEX_W,
  TILE_DEPTH,
  axialKey,
  AXIAL_DIRS,
  hexCenter,
  pixelToHex,
  hexDist,
  hexCorners,
  hexPath,
  polyPath,
  ringsOf,
  estRadius,
  crownRadius,
  storyTreeReach,
  storyEdges,
  rankStories,
  descendantCounts,
  smoothCoast,
  type BoundarySeg,
  type SubstrateMode,
  type SubstrateTuning,
  type RelaxedCell,
  MESH_TUNING,
  buildRelaxedCells as buildRelaxedCellsFromTiles,
  buildScene,
  type SceneInput,
  type SceneStatus,
  type ScenePlantInput,
} from '@storytree/forest-world';
import { SceneView, type SceneCtx } from './SceneView.js';

// The current `?…` search string, SSR-guarded ('' when there is no window). The
// panel-exposed readers default to this so non-panel call sites (and SSR) keep
// working unchanged; the panel threads a state-held search string instead so the
// world re-renders live without a reload.
function defaultSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

// Resolve the panel-exposed controls ONCE from the worldSettings schema (the single
// source of truth for their defaults + clamps). The readers above consume these so
// the literals live in exactly one place. `controlByKey` is total over these keys —
// they are declared in CONTROLS — so a miss is a programmer error, surfaced loudly.
function requireControl(key: string): ControlSpec {
  const c = controlByKey(key);
  if (!c) throw new Error(`worldSettings: missing control "${key}"`);
  return c;
}
const SUBSTRATE_CTL = requireControl('substrate');
const LAYOUT_CTL = requireControl('layout');

/** Shared empty id-set (the DAG path passes no hub ids). */
const EMPTY_ID_SET: ReadonlySet<string> = new Set();

// ---------- world building ----------

const MARGIN = 60;
const RANK_GAP = 78; // vertical clearance between grown territories of adjacent ranks (gives rivers room)
const ISLAND_GAP = 96; // horizontal clearance between territories sharing a rank (gives rivers room)
const RANK_SWING = 235; // lateral swing for a lone island, so its roads read as diagonals
const RIVER_FAN_STEP = 0.34; // rad (~19°) of shore between adjacent river mouths leaving one source
const RIVER_FAN_MAX = 2.5; // rad (~145°) widest arc a source's outgoing delta fans across
const LANE_GAP = 13; // px centre-to-centre between adjacent metro lanes sharing a corridor (a shared sand braid-bar)
const LANE_WINDOW = 0.4; // fraction of each river's length over which it blends from its true dock/mouth into the shared corridor
const MOUTH_FLARE = 14; // px offshore the merged trunk fuses before diving head-on into the single coast mouth

interface CapSpot {
  cap: TreeCapability;
  x: number;
  y: number;
}

/** A conifer-clump spot (wheat is a tile-top fill, tracked in wheatTiles). */
interface DecorSpot {
  x: number;
  y: number;
  seed: number;
}

interface Territory {
  story: TreeStory;
  tiles: Axial[];
  centroid: Pt;
  /** px from centroid to the farthest tile centre, plus the tile radius. */
  radius: number;
  /** Where the central story tree stands (the tile nearest the centroid). */
  treeSpot: Pt;
  caps: CapSpot[];
  decor: DecorSpot[];
  wheatTiles: Set<string>;
  /** Smoothed organic coastline as closed `d` strings — the island's sand fill
   *  AND its water moat (one curve, filled then stroked). */
  coastPaths: string[];
  /** The smoothed coast as point loop(s), for docking river mouths to the shore. */
  coastLoops: Pt[][];
  labelY: number;
  /** Stamp a BUILDING icon on this island (ADR-0076 §2, distributed model): true when this
   *  story CONSUMES a building-tagged story (e.g. `library`) AND the buildings flag is on.
   *  The building (library) itself is not laid out as an island — its icon is distributed
   *  onto every consumer instead. False for a normal island with no building dependency. */
  bookshelf: boolean;
  /** Where the building icon sits on the island (beside the central tree, on owned land);
   *  present iff {@link bookshelf} is true. */
  bookshelfSpot?: Pt;
  /** This island IS a building rendered with a bookshelf glyph WITHIN its nameplate (the
   *  enlarged landmark card, {@link nameplateLayout} building branch). ALWAYS false on the map
   *  (ADR-0088: building-class stories no longer render in the forest); set true only by the
   *  Shared Islands PANEL, which builds a one-island Territory per building story and renders it
   *  with {@link TerritoryFlora}. */
  buildingGlyph: boolean;
}

interface WorldEdge {
  from: string;
  to: string;
  via: string[];
  d: string;
}

interface HexWorld {
  territories: Territory[];
  /** Pale coast tiles (1–2 rings beyond claimed land). */
  empties: Axial[];
  /** Claimed tiles in global back-to-front draw order, with territory index. */
  drawTiles: { h: Axial; owner: number }[];
  /** DAG/tree world: the `depends_on` roads as thin, no-arrow, PERIMETER-DOCKED lines
   *  (`dockedEdgePath` / `dockedRoads`) — the ONE road rendering since the river-trail
   *  system was retired (ADR-0076; owner steer 2026-06-20). Absent in solar mode, which
   *  draws its own `solar.roads`. */
  lineRoads?: WorldEdge[];
  /** Solar mode only (ADR-0074 §6 + the 2026-06-20 path refresh): the concentric orbit
   *  GRID + perimeter-docked thin connections that REPLACE the river-trail roads and
   *  centre-to-centre spokes in solar mode. Absent in the DAG world (byte-identical). */
  solar?: {
    /** The hub-cluster centre the orbit rings are concentric about. */
    center: Pt;
    /** Faint orbit-ring radii, inner → outer — the circle grid the islands sit on. */
    rings: number[];
    /** `depends_on` edges as perimeter-docked, gently-bowed thin curves. */
    roads: WorldEdge[];
    /** Provider-side `consumed_by` wiring (hub → organism), perimeter-docked + straight. */
    spokes: { from: string; to: string; d: string }[];
  };
  width: number;
  height: number;
  offset: Pt;
}

/** A nameplate's resolved box + text/glyph anchors (px, plate-local). */
export interface NameplateLayout {
  /** Plate width. */
  w: number;
  /** Plate height. */
  h: number;
  /** Corner radius. */
  rx: number;
  /** Baseline y of the id (the bigger top line). */
  idY: number;
  /** Baseline y of the sub line. */
  subY: number;
  /** Leading bookshelf-glyph anchor (building plates only; ignored otherwise). */
  glyphX: number;
  glyphY: number;
  glyphScale: number;
}

/**
 * Nameplate geometry (owner ask 2026-06-22 — bigger name cards + bigger leading bookshelf).
 * A pure function of the id length and the building flag, so the box and its anchors are
 * unit-testable (Stage-1 of ADR-0070; the final look is owner-attested). Two sizes:
 *   • NORMAL — a modest global bump over the old 30px plate (height 33, id ~12px), leaving the
 *     positioning geometry (still centred on the centroid, drawn below the island) unchanged.
 *   • BUILDING — a distinctly larger landmark card (taller, wider min, larger id) with a big
 *     leading bookshelf glyph, so the root library reads as a landmark on the foundation row.
 * Building plates reserve a left gutter for the glyph and widen to keep the centred id clear
 * of it.
 */
export function nameplateLayout(idLen: number, building: boolean): NameplateLayout {
  if (building) {
    const glyphGutter = 30; // left band the enlarged bookshelf occupies
    const w = Math.max(132, idLen * 8.6 + 36 + glyphGutter);
    const h = 42;
    return {
      w,
      h,
      rx: 9,
      idY: 18,
      subY: 32,
      glyphX: 16,
      glyphY: h - 6,
      glyphScale: 0.92,
    };
  }
  const w = Math.max(100, idLen * 7.4 + 30);
  const h = 33;
  return { w, h, rx: 7, idY: 14, subY: 27, glyphX: 0, glyphY: 0, glyphScale: 1 };
}

/**
 * The panel bookshelf-landmark anchor (ADR-0088 follow-on, owner 2026-06-22): a shared-island
 * card draws its bookshelf glyph just OUTSIDE the name card, to its RIGHT and bigger — not inside
 * the plate. Pure geometry: the glyph's centre sits `margin` px past the plate's right edge
 * (`centroidX + w/2`); its base aligns to the card's bottom (`labelY + h`) so the enlarged glyph
 * rises beside the card. The caller folds the glyph's half-width into `margin` so its left edge
 * clears the card. Unit-tested (sharedIslandPanel.test.ts) — the look (scale, gap) is owner-attested.
 */
export function bookshelfAnchorRight(
  plate: NameplateLayout,
  centroidX: number,
  labelY: number,
  margin: number,
): Pt {
  return { x: centroidX + plate.w / 2 + margin, y: labelY + plate.h };
}

/** ADR-0033 d.3 vocabulary — the one source for every verdict phrase. */
function verdictPhrase(v: TreeVerdict): string {
  return v.outcome === 'pass' ? '✓ proven' : '✗ last run failed';
}

export function buildWorld(
  allStories: TreeStory[],
  opts?: {
    plantsScatter?: boolean;
    /** ADR-0074 §6: `solar` seeds islands on rank-keyed orbits around the hubs;
     *  `dag` (default) keeps the bottom-up dependency rows. */
    layoutMode?: LayoutMode;
    /** ADR-0076 §2 / ADR-0088: stories tagged `render: building` (e.g. `library`) are
     *  EXCLUDED from the laid-out territories (they live in the Shared Islands panel now, not
     *  the map) AND their consumers carry a distributed BOOKSHELF STAMP — the on-map "this
     *  island uses the shared library" marker. The DEFAULT since the owner attested it (the
     *  component passes `readBuildings`, default true / escape `?buildings=off`); `false` here
     *  is the bare-call fallback ⇒ the building is a normal connected island and no stamps.
     *  When a single building story is passed with `buildings: false`, it lays out as one plain
     *  island — exactly the one-island Territory the Shared Islands panel renders per building. */
    buildings?: boolean;
    /** Ids of the synthetic central hubs in `stories` (solar mode only). */
    hubIds?: ReadonlySet<string>;
  },
): HexWorld {
  const plantsScatter = opts?.plantsScatter ?? false;
  const layoutMode = opts?.layoutMode ?? 'dag';
  const buildings = opts?.buildings ?? false;
  const hubIds = opts?.hubIds ?? EMPTY_ID_SET;

  // ADR-0076 §2 (distributed-bookshelf STAMP, owner steer 2026-06-20): a story tagged
  // `render: building` (e.g. `library`) has its icon stamped on every island that CONNECTS to
  // it. The consumer set is computed from the FULL list (so the building's inbound edges are
  // visible) BEFORE the building is excluded below. `buildings` off ⇒ no consumers, no stamps.
  const buildingIds = new Set(
    buildings ? allStories.filter((s) => s.building === true).map((s) => s.id) : [],
  );
  const bookshelfIds: ReadonlySet<string> = buildingIds.size
    ? bookshelfConsumers(
        allStories.map((s) => ({ id: s.id, dependsOn: s.dependsOn, consumedBy: s.consumedBy })),
        buildingIds,
      )
    : EMPTY_ID_SET;
  // ADR-0088 (Shared Islands panel, amends ADR-0076 §2): EXCLUDE every building-class story
  // from the laid-out territories whenever the distributed `buildings` flag is on — they no
  // longer render on the map at all (they live in the permanent left panel). With the building
  // gone from `stories`, no edge or rank to it exists, so its many inbound roads can never flood
  // the map (the reason the earlier edgeless-island machinery existed — now unnecessary).
  const excludedIds: ReadonlySet<string> = buildingIds.size ? buildingIds : EMPTY_ID_SET;
  const stories = excludedIds.size
    ? allStories.filter((s) => !excludedIds.has(s.id))
    : allStories;

  // Hubs are sized like any other island (owner call 2026-06-19 — "make them like any
  // other island; work out the look later"). Their hub-ness is carried by the LAYOUT
  // (centred, everything orbits + spokes converge), not by a distinct size/skin.
  const quotas = stories.map((s) => Math.max(3, s.capabilities.length + 2));

  // One edge set drives BOTH the roads and the ranking (declared ∪ derived).
  const edgeList = storyEdges(stories);
  const depsOf = new Map<string, string[]>(stories.map((s) => [s.id, []]));
  const dependentsOf = new Map<string, string[]>(stories.map((s) => [s.id, []]));
  for (const e of edgeList) {
    depsOf.get(e.to)?.push(e.from);
    dependentsOf.get(e.from)?.push(e.to);
  }

  // Dependency-ranked seeds (ADR-0036 d.6a): the most-depended-upon stories sit
  // bottom-centre and dependents fan upward and outward. Rank rows stack from
  // the bottom; within a row, stories order by the barycenter of their already-
  // placed dependencies (load-bearing count for the foundation row).
  // ADR-0088: building-class stories are no longer in `stories` (they live in the Shared
  // Islands panel), so there is no edgeless island to pin to the foundation row anymore — the
  // natural dependency ranks drive the layout directly.
  const naturalRanks = rankStories(stories, depsOf);
  const ranks = new Map<string, number>(stories.map((s) => [s.id, naturalRanks.get(s.id) ?? 0]));
  const loadBearing = descendantCounts(stories, dependentsOf);
  const maxRank = Math.max(0, ...ranks.values());
  const byRank: number[][] = Array.from({ length: maxRank + 1 }, () => []);
  stories.forEach((s, i) => byRank[ranks.get(s.id) ?? 0]?.push(i));

  // Row centre-lines, bottom-up: clearance for the tallest territory on each side.
  const rowY: number[] = [];
  let yCursor = 0;
  for (let r = 0; r <= maxRank; r++) {
    const tallest = Math.max(...(byRank[r] ?? []).map((i) => estRadius(quotas[i] ?? 3)), HEX_R);
    if (r === 0) yCursor = -tallest;
    else {
      const below = Math.max(
        ...(byRank[r - 1] ?? []).map((i) => estRadius(quotas[i] ?? 3)),
        HEX_R,
      );
      yCursor -= below + tallest + RANK_GAP;
    }
    rowY.push(yCursor);
  }

  const seedPx = new Map<number, Pt>();
  const baryOf = (idx: number): number => {
    const s = stories[idx];
    if (!s) return 0;
    const xs = (depsOf.get(s.id) ?? [])
      .map((d) => stories.findIndex((o) => o.id === d))
      .filter((j) => j >= 0 && seedPx.has(j))
      .map((j) => seedPx.get(j)?.x ?? 0);
    return xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0;
  };
  if (layoutMode === 'solar') {
    // ADR-0074 §6: hubs at the centre, organisms on rank-keyed orbits. Seeds flow
    // into the SAME snap/grow/coast/edge pipeline below, so the islands and roads
    // read as the existing forest world — only WHERE they sit changes.
    const solarNodes: SolarNode[] = stories.map((s, i) => ({
      id: s.id,
      rank: ranks.get(s.id) ?? 0,
      hub: hubIds.has(s.id),
      radius: estRadius(quotas[i] ?? 3),
    }));
    for (const [i, p] of solarSeeds(solarNodes)) seedPx.set(i, p);
  } else for (let r = 0; r <= maxRank; r++) {
    const row = byRank[r] ?? [];
    const ordered = [...row].sort((a, b) => {
      const sa = stories[a];
      const sb = stories[b];
      if (!sa || !sb) return 0;
      if (r === 0) {
        // Foundation row: most load-bearing in the middle, others outward.
        return (loadBearing.get(sb.id) ?? 0) - (loadBearing.get(sa.id) ?? 0);
      }
      return baryOf(a) - baryOf(b) || (hash(sa.id) % 997) - (hash(sb.id) % 997);
    });
    // Pack the row left-to-right around its dependency barycenter. The
    // foundation row interleaves centre-out (most load-bearing in the middle).
    let display = ordered;
    if (r === 0) {
      display = [];
      ordered.forEach((i, k) => {
        if (k % 2 === 0) display.push(i);
        else display.unshift(i);
      });
    }
    const sequence = display.map((idx) => ({ idx, w: estRadius(quotas[idx] ?? 3) }));
    const total =
      sequence.reduce((sum, s) => sum + 2 * s.w, 0) + ISLAND_GAP * Math.max(0, sequence.length - 1);
    // A lone island would otherwise sit directly on top of its dependencies,
    // stacking every road into one vertical corridor — swing it to an
    // alternating side so roads sweep as separated diagonals (the dbt-DAG read).
    let rowCenter =
      r === 0 ? 0 : display.reduce((sum, i) => sum + baryOf(i), 0) / Math.max(display.length, 1);
    if (r > 0 && sequence.length === 1) rowCenter += (r % 2 === 1 ? 1 : -1) * RANK_SWING;
    let xCursor = rowCenter - total / 2;
    for (const s of sequence) {
      const story = stories[s.idx];
      const seedH = hash(story?.id ?? String(s.idx));
      seedPx.set(s.idx, {
        x: xCursor + s.w + (rand01(seedH) - 0.5) * 44,
        y: (rowY[r] ?? 0) + (rand01(seedH + 1) - 0.5) * 30,
      });
      xCursor += 2 * s.w + ISLAND_GAP;
    }
  }

  // Snap seeds to the hex lattice, then enforce a growth floor: two seeds
  // closer than their combined ring reach would strangle each other's quota.
  const seeds: Axial[] = stories.map((_, i) => pixelToHex(seedPx.get(i) ?? { x: 0, y: 0 }));
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) {
        const a = seeds[i];
        const b = seeds[j];
        if (!a || !b) continue;
        const floor = ringsOf(quotas[i] ?? 3) + ringsOf(quotas[j] ?? 3) + 1;
        if (hexDist(a, b) < floor) {
          seeds[j] = { q: b.q + 1, r: b.r }; // deterministic eastward nudge
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // Grow territories round-robin: each story claims its cheapest frontier hex
  // (closest to seed, hash-jittered for organic coastlines) until its quota —
  // a tile per capability plus breathing room — is met.
  const owner = new Map<string, number>();
  const tilesByStory: Axial[][] = stories.map(() => []);
  seeds.forEach((seed, i) => {
    owner.set(axialKey(seed), i);
    tilesByStory[i]?.push(seed);
  });
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < stories.length; i++) {
      const mine = tilesByStory[i];
      const seed = seeds[i];
      const story = stories[i];
      const quota = quotas[i];
      if (!mine || !seed || !story || quota === undefined || mine.length >= quota) continue;
      let best: Axial | null = null;
      let bestCost = Infinity;
      for (const t of mine) {
        for (const d of AXIAL_DIRS) {
          const cand = { q: t.q + d.q, r: t.r + d.r };
          const key = axialKey(cand);
          if (owner.has(key)) continue;
          const cost = hexDist(seed, cand) + rand01(hash(`${story.id}:${key}`)) * 1.4;
          if (cost < bestCost) {
            bestCost = cost;
            best = cand;
          }
        }
      }
      if (best) {
        owner.set(axialKey(best), i);
        mine.push(best);
        progress = true;
      }
    }
  }

  // Per-territory contents.
  const territories: Territory[] = stories.map((story, i) => {
    const tiles = tilesByStory[i] ?? [];
    const seed = seeds[i] ?? { q: 0, r: 0 };
    const centers = tiles.map(hexCenter);
    const centroid: Pt = {
      x: centers.reduce((s, p) => s + p.x, 0) / Math.max(centers.length, 1),
      y: centers.reduce((s, p) => s + p.y, 0) / Math.max(centers.length, 1),
    };
    const radius =
      Math.max(0, ...centers.map((p) => Math.hypot(p.x - centroid.x, p.y - centroid.y))) +
      HEX_R;

    // The story's own tree takes the tile nearest the centroid; capabilities
    // garden in a squashed ring around it (walked inward until they sit on
    // owned land); leftover tiles grow sparser decoration so the big tree
    // dominates the island.
    const centerTile =
      [...tiles].sort((a, b) => {
        const ca = hexCenter(a);
        const cb = hexCenter(b);
        return (
          Math.hypot(ca.x - centroid.x, ca.y - centroid.y) -
          Math.hypot(cb.x - centroid.x, cb.y - centroid.y)
        );
      })[0] ?? seed;
    const treeSpot = hexCenter(centerTile);
    const crownR = crownRadius(story.capabilities.length);
    const ringR = Math.max(crownR * 0.9, Math.min(crownR + 18, radius - HEX_R * 0.55));
    // Front 240° arc only (centred south) — a plant behind the tree would
    // vanish under the canopy.
    const ARC = (Math.PI * 4) / 3;
    const caps: CapSpot[] = story.capabilities.map((cap, j) => {
      const n = story.capabilities.length;
      // `?plants=scatter` (VISUAL SPIKE): keep the rough angular slot (so plants
      // never clump) but widen the angle wobble and spread the radius across a
      // BAND rather than one ring, so the garden reads as an organic orchard
      // instead of a rigid arc — most visible on the high-cap islands. Plants stay
      // in the front arc (else they hide under the canopy) and clear of the trunk.
      const slot = -Math.PI / 6 + ((j + 0.5) / n) * ARC;
      const jitterA =
        (rand01(hash(`${story.id}:${cap.id}:a`)) - 0.5) * (ARC / n) * (plantsScatter ? 1.5 : 0.5);
      const angle = slot + jitterA;
      const rr = plantsScatter
        ? Math.max(
            crownR * 0.95,
            ringR * (0.62 + rand01(hash(`${story.id}:${cap.id}:rb`)) * 0.72),
          )
        : ringR + (rand01(hash(`${story.id}:${cap.id}:r`)) - 0.5) * 10;
      let x = treeSpot.x + Math.cos(angle) * rr;
      let y = treeSpot.y + Math.sin(angle) * rr * 0.66; // top-down squash
      for (let k = 0; k < 4 && owner.get(axialKey(pixelToHex({ x, y }))) !== i; k++) {
        x += (treeSpot.x - x) * 0.25;
        y += (treeSpot.y - y) * 0.25;
      }
      return { cap, x, y };
    });

    const decor: DecorSpot[] = [];
    const wheatTiles = new Set<string>();
    for (const tile of tiles) {
      const key = axialKey(tile);
      if (key === axialKey(centerTile)) continue; // the story tree's clearing
      const roll = rand01(hash(`${story.id}:decor:${key}`));
      const c = hexCenter(tile);
      const nearTree = Math.hypot(c.x - treeSpot.x, c.y - treeSpot.y) < crownR + 20;
      if (roll < 0.34 && !nearTree) {
        decor.push({ x: c.x, y: c.y, seed: hash(`${key}:f`) });
      } else if (roll >= 0.34 && roll < 0.62) {
        wheatTiles.add(key); // wheat is a tile-top fill, not a flora drawable
      }
    }

    // Territory boundary: every tile edge whose neighbour is foreign soil.
    const mineSet = new Set(tiles.map(axialKey));
    const boundary: BoundarySeg[] = [];
    for (const tile of tiles) {
      const c = hexCenter(tile);
      const corners = hexCorners(c.x, c.y, HEX_R);
      AXIAL_DIRS.forEach((d, e) => {
        if (mineSet.has(axialKey({ q: tile.q + d.q, r: tile.r + d.r }))) return;
        const a = corners[e];
        const b = corners[(e + 1) % 6];
        if (a && b) boundary.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      });
    }

    const labelY = Math.max(...centers.map((p) => p.y), centroid.y) + HEX_R + TILE_DEPTH + 8;
    const coast = smoothCoast(boundary, story.id);

    // ADR-0076 §2: a CONSUMER of a building-tagged story carries the building's icon. Seat it
    // beside the tree (a deterministic side), then walk inward until it sits on owned land —
    // the same land-snap the garden plants use, so it never floats over the sea.
    const carriesBookshelf = bookshelfIds.has(story.id);
    let bookshelfSpot: Pt | undefined;
    if (carriesBookshelf) {
      const side = rand01(hash(`${story.id}:shelf-side`)) < 0.5 ? -1 : 1;
      let bx = treeSpot.x + side * (crownR + 17);
      let by = treeSpot.y + 7; // a touch in front of the trunk base so it reads as on the ground
      for (let k = 0; k < 5 && owner.get(axialKey(pixelToHex({ x: bx, y: by }))) !== i; k++) {
        bx += (treeSpot.x - bx) * 0.3;
        by += (treeSpot.y - by) * 0.3;
      }
      bookshelfSpot = { x: bx, y: by };
    }
    return {
      story,
      tiles,
      centroid,
      radius,
      treeSpot,
      caps,
      decor,
      wheatTiles,
      coastPaths: coast.paths,
      coastLoops: coast.loops,
      labelY,
      bookshelf: carriesBookshelf,
      ...(bookshelfSpot ? { bookshelfSpot } : {}),
      // ADR-0088 (+ owner 2026-06-22 follow-on): building-class stories never render on the map
      // (they live in the Shared Islands panel) AND the panel's bookshelf landmark now sits
      // OUTSIDE the name card (SharedIslandCard draws it), so NO nameplate ever carries the
      // in-card building glyph — it is always false here.
      buildingGlyph: false,
    };
  });

  // The pale coast: up to two rings of unclaimed hexes around the land.
  const empties: Axial[] = [];
  const emptySet = new Set<string>();
  let ring: Axial[] = [...owner.keys()].map((k) => {
    const parts = k.split(',');
    return { q: Number(parts[0]), r: Number(parts[1]) };
  });
  for (let depth = 0; depth < 2; depth++) {
    const next: Axial[] = [];
    for (const t of ring) {
      for (const d of AXIAL_DIRS) {
        const cand = { q: t.q + d.q, r: t.r + d.r };
        const key = axialKey(cand);
        if (owner.has(key) || emptySet.has(key)) continue;
        // Thin the outer ring for an organic coastline.
        if (depth === 1 && rand01(hash(`coast:${key}`)) < 0.45) continue;
        emptySet.add(key);
        empties.push(cand);
        next.push(cand);
      }
    }
    ring = next;
  }

  // Global back-to-front tile order so extrusions layer correctly.
  const drawTiles = [...owner.entries()]
    .map(([key, idx]) => {
      const parts = key.split(',');
      return { h: { q: Number(parts[0]), r: Number(parts[1]) }, owner: idx };
    })
    .sort((a, b) => a.h.r - b.h.r || a.h.q - b.h.q);

  // Connections are thin, no-arrow curves docked on each island's PERIMETER in the
  // bearing of its neighbour, NOT centre-to-centre (the website road model,
  // web/src/lib/world.ts), so a hub's many edges fan around its rim instead of converging
  // on one point. This is the ONE connection style for BOTH layouts since the river-trail
  // road system was retired (ADR-0076): the DAG/tree world draws `lineRoads`; solar adds a
  // faint orbit GRID + provider-side `consumed_by` hub spokes (disjoint — a spoke is never
  // also a road, ADR-0074 §4).
  // Perimeter-dock node for every island, keyed by story id — the rim point + dock radius
  // an edge meets (a touch INSIDE the bounding radius so the line lands on the coast).
  // Building-tagged stories (ADR-0076 §2 / ADR-0088) aren't in `territories` at all (excluded
  // from the layout above — they live in the Shared Islands panel), so they have no dock and
  // never appear as a road endpoint: the building's inbound edges never even enter `edgeList`,
  // so no road/spoke to it can be built and no edge filter is needed.
  const dockById = new Map<string, DockNode>(
    territories.map((t) => [t.story.id, { x: t.centroid.x, y: t.centroid.y, r: t.radius * 0.82 }]),
  );
  let solar: HexWorld['solar'];
  if (layoutMode === 'solar') {
    // hub centre = mean of the central hub islands' centroids (fallback: all islands)
    const orbiting = territories.filter((t) => !hubIds.has(t.story.id));
    const ref = territories.filter((t) => hubIds.has(t.story.id));
    const refSet = ref.length ? ref : territories;
    const center: Pt = {
      x: refSet.reduce((s, t) => s + t.centroid.x, 0) / refSet.length,
      y: refSet.reduce((s, t) => s + t.centroid.y, 0) / refSet.length,
    };
    // the orbit grid: one faint ring per rank, at that rank's mean island distance
    const rings = orbitRings(
      orbiting.map((t) => ({
        rank: ranks.get(t.story.id) ?? 0,
        dist: Math.hypot(t.centroid.x - center.x, t.centroid.y - center.y),
      })),
    ).map((r) => r.radius);
    // `depends_on` roads: thin, gently-bowed, perimeter-docked lines (the shared helper).
    // Building-class stories were excluded from `stories`/`edgeList` above (ADR-0088), so no
    // road to a building can exist here — no filter needed.
    const roads = dockedRoads(edgeList, dockById, 0.08);
    // provider-side `consumed_by` wiring as straight, low-salience hub spokes.
    const spokeLines: { from: string; to: string; d: string }[] = [];
    for (const e of spokeEdges(stories.map((s) => ({ id: s.id, consumedBy: s.consumedBy })))) {
      const a = dockById.get(e.from);
      const b = dockById.get(e.to);
      if (a && b) spokeLines.push({ from: e.from, to: e.to, d: dockedEdgePath(a, b, 0) });
    }
    solar = { center, rings, roads, spokes: spokeLines };
  }

  // DAG/tree world: the `depends_on` roads as thin, gently-bowed, perimeter-docked lines
  // (ADR-0076 — the one road rendering since the river-trail system was retired). Solar
  // draws its own `solar.roads` (above), so this is DAG-only.
  const lineRoads: WorldEdge[] | undefined =
    layoutMode !== 'solar'
      ? // Building-class stories were excluded from `stories`/`edgeList` (ADR-0088), so no road
        // to a building can exist — no edge filter needed.
        dockedRoads(edgeList, dockById, 0.08)
      : undefined;

  // Scene bounds over every tile (claimed + coast), plus label + tree space.
  const allCenters = [...drawTiles.map((t) => hexCenter(t.h)), ...empties.map(hexCenter)];
  const minX = Math.min(...allCenters.map((p) => p.x)) - HEX_W / 2 - MARGIN;
  const maxX = Math.max(...allCenters.map((p) => p.x)) + HEX_W / 2 + MARGIN;
  const minY =
    Math.min(
      ...allCenters.map((p) => p.y - HEX_R),
      ...territories.map((t) => t.treeSpot.y - storyTreeReach(t.story.capabilities.length)),
    ) - MARGIN;
  const maxY =
    Math.max(...allCenters.map((p) => p.y), ...territories.map((t) => t.labelY + 34)) +
    HEX_R +
    TILE_DEPTH +
    MARGIN / 2;

  return {
    territories,
    empties,
    drawTiles,
    ...(lineRoads ? { lineRoads } : {}),
    ...(solar ? { solar } : {}),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
    offset: { x: -minX, y: -minY },
  };
}

// ---------- relaxed substrate (the island ground) — ADR-0093 shared core ----------
//
// The relaxed Townscaper mesh + the organic coastline are the shared render core now
// (@storytree/forest-world): the studio and the public website render the SAME
// substrate from it. This thin adapter is all that stays studio-side — it hands the
// core's pure builder the layout-agnostic (drawTiles, wheatSets) pair it wants, so the
// studio's call sites + tests keep passing a `HexWorld`. The substrate MODE + tuning
// are still read from the URL below (studio chrome). `MESH_TUNING` / `SubstrateMode`
// are re-exported so importers that resolved them from TreeView (sharedIslandPanel.test.ts)
// keep working while the geometry lives in the core.

export function buildRelaxedCells(
  world: HexWorld,
  mode: SubstrateMode,
  override: Partial<SubstrateTuning>,
): RelaxedCell[] {
  const wheatSets = world.territories.map((t) => t.wheatTiles);
  return buildRelaxedCellsFromTiles(world.drawTiles, wheatSets, mode, override);
}

export { MESH_TUNING };
export type { SubstrateMode };

// ---------- the shared scene-graph adapter (ADR-0093, strategy C, Unit 2b) ----------
//
// `worldToScene` is the studio's thin FOLD of its `HexWorld` into the core's neutral
// `SceneInput` contract (the design fork → option b: `buildWorld` stays studio-side
// because it carries studio chrome — solar layout, building stamps; the core owns the
// LOOK, the surface folds its data into the contract). It folds ONLY presentation
// facts the surface owns — the proof/live-data → status fold is already in the
// (presented) stories, blooms come from `verdictBloom`, wisps from in-flight builds,
// nameplate text + tooltips are the studio's vocabulary. The core derives every
// hash-seeded variant/jitter from the ids. `buildScene(worldToScene(...))` then yields
// the drawable tree the React mapper (`SceneView`) walks.

function capToScene(spot: CapSpot, now: Date): ScenePlantInput {
  const cap = spot.cap;
  const st = (cap.status ?? 'unknown') as SceneStatus;
  const bloom = st === 'unhealthy' ? null : verdictBloom(cap.verdict, now);
  const verdictNote = cap.verdict ? ` · ${verdictPhrase(cap.verdict)}` : '';
  return {
    id: cap.id,
    status: st,
    x: spot.x,
    y: spot.y,
    title: `${cap.id} — ${cap.error ? 'spec error' : st}${verdictNote}`,
    ...(bloom ? { bloom: { ageRatio: bloom.ageRatio, outcome: bloom.outcome } } : {}),
  };
}

function territoryToScene(t: Territory, now: Date, builds: BuildActivity[]): SceneInput['territories'][number] {
  const story = t.story;
  const st = (story.status ?? 'unknown') as SceneStatus;
  const caps = story.capabilities.length;
  const withered = st === 'unhealthy';
  // buildingGlyph is always false on the map (ADR-0088: building islands live in the panel).
  const plate = nameplateLayout(story.id.length, t.buildingGlyph);
  const verdictNote = story.verdict
    ? ` · UAT ${verdictPhrase(story.verdict)}`
    : story.uatWitness === 'human'
      ? ' · UAT awaiting its human witness'
      : '';
  const bloom = withered ? null : verdictBloom(story.verdict, now);
  return {
    id: story.id,
    status: st,
    caps,
    centroid: t.centroid,
    radius: t.radius,
    treeSpot: t.treeSpot,
    labelY: t.labelY,
    coastPaths: t.coastPaths,
    decor: t.decor.map((d) => ({ x: d.x, y: d.y, seed: d.seed })),
    plants: t.caps.map((spot) => capToScene(spot, now)),
    treeTitle: `${story.id} — ${story.error ? 'story spec error' : st}${verdictNote}`,
    ...(story.uatWitness === 'human'
      ? { signpost: { outcome: story.verdict?.outcome ?? null } }
      : {}),
    ...(bloom ? { bloom: { ageRatio: bloom.ageRatio, outcome: bloom.outcome } } : {}),
    wisps: builds.map((b) => ({
      runId: b.runId,
      title: `${b.unitId} — building (${b.tier}) · ${formatAge(b.at, now)} · run ${b.runId}`,
    })),
    plate: {
      w: plate.w,
      h: plate.h,
      rx: plate.rx,
      idY: plate.idY,
      subY: plate.subY,
      idText: story.id,
      subText: story.error ? 'story spec error' : `${st} · ${caps} caps`,
      title: story.error ? `${story.id} — ${story.error}` : story.title,
    },
  };
}

/** Fold a studio `HexWorld` into the core's `SceneInput`. The dag world's `lineRoads`
 *  (or solar's `roads`) become the scene roads; solar SPOKES stay studio chrome (not
 *  in the scene path yet). `territories` is in owner order, the index `relaxedCells` /
 *  `drawTiles` / `wheatSets` key on. */
export function worldToScene(
  world: HexWorld,
  relaxedCells: RelaxedCell[] | null,
  now: Date,
  buildsByStory: Map<string, BuildActivity[]>,
): SceneInput {
  const roads = world.lineRoads ?? world.solar?.roads ?? [];
  return {
    offset: world.offset,
    width: world.width,
    height: world.height,
    empties: world.empties,
    relaxedCells,
    drawTiles: world.drawTiles,
    wheatSets: world.territories.map((t) => t.wheatTiles),
    roads: roads.map((e) => ({
      from: e.from,
      to: e.to,
      d: e.d,
      title: `${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`,
    })),
    territories: world.territories.map((t) =>
      territoryToScene(t, now, buildsByStory.get(t.story.id) ?? []),
    ),
  };
}

/**
 * Which substrate the forest map renders. The irregular Townscaper `mesh` is the
 * DEFAULT (owner look-decision 2026-06-16) — so no param renders mesh. Escapes:
 * `?substrate=hex` (aliases `none`/`default`/`classic`) → the original extruded
 * hex world (null); `?substrate=relaxed-quad|relaxed|relaxed-hex` → the earlier
 * spike modes. Returns null only for the explicit classic-world escape.
 */
function readSubstrateMode(search: string = defaultSearch()): SubstrateMode | null {
  // SINGLE SOURCE OF TRUTH: the panel + this reader both resolve `substrate` through
  // worldSettings (its normalize mirrors the historical aliases). `hex` ⇒ null (the
  // classic-world escape); every other canonical value maps straight through.
  const v = readControlValue(search, SUBSTRATE_CTL) as string;
  if (v === 'hex') return null;
  if (v === 'relaxed-hex') return 'relaxed-hex';
  if (v === 'relaxed-quad') return 'relaxed-quad';
  return 'mesh';
}

/** Live tuning overrides from the URL — let the owner dial the look in directly. */
function readSubstrateTuning(): Partial<SubstrateTuning> {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const out: Partial<SubstrateTuning> = {};
  const num = (key: string): number | null => {
    const raw = q.get(key);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const j = num('jitter');
  const it = num('iters');
  const rx = num('relax');
  const sd = num('subdiv');
  const ws = q.get('wheatScatter');
  if (j !== null) out.jitter = j;
  if (it !== null) out.iters = Math.max(0, Math.round(it));
  if (rx !== null) out.relax = rx;
  if (sd !== null) out.subdiv = Math.max(1, Math.min(2, Math.round(sd)));
  if (ws !== null) out.wheatScatter = ws === '1' || ws === 'true';
  return out;
}

/** `?plants=scatter` disperses the capability garden off its rigid front arc. */
function readPlantsScatter(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('plants') === 'scatter';
}

/** Stories tagged `render: building` (ADR-0076 §2) are EXCLUDED from the map and their
 *  consumers carry a distributed bookshelf STAMP (the "uses the shared library" marker). Since
 *  ADR-0088 the buildings themselves live in the permanent Shared Islands panel; this flag now
 *  only gates the on-map stamp + the exclusion. DEFAULT ON (the owner attested the look
 *  2026-06-20); the escape `?buildings=off` restores the old world where a building is a normal
 *  connected island and there are no stamps. */
function readBuildings(search: string = defaultSearch()): boolean {
  const v = new URLSearchParams(search).get('buildings');
  return v !== 'off' && v !== '0' && v !== 'false';
}

// ---------- solar-system layout (ADR-0074 §6 / `solar-system-world`) ----------

type LayoutMode = 'dag' | 'solar';

/** `?layout=solar` ⇒ the RADIAL hub-and-spoke world; default `dag` = the current
 *  world (byte-identical — the param is absent). Gear-panel managed (worldSettings,
 *  the single source of truth for the default), so the panel + this reader never drift. */
function readLayoutMode(search: string = defaultSearch()): LayoutMode {
  return readControlValue(search, LAYOUT_CTL) === 'solar' ? 'solar' : 'dag';
}

/**
 * The central wiring hubs everything orbits in solar mode (ADR-0074 §2 — the wiring
 * layer is VISIBLE, not exempt: hiding the most-connected nodes hides the most
 * architecturally important relationships). `cli` / `store` are now FIRST-CLASS hub
 * organisms with real stories + capabilities + lightweight UATs (ADR-0074 §3, landed
 * PR #234), so `/api/tree` returns them like any island — they render with their real
 * capability trees and are fully selectable. `HUB_IDS` is used only to LAY THEM OUT
 * centrally; the synthetic `makeHubStory` below is a fallback for the edge case where
 * a hub story is absent from the payload (offline / pre-#234), kept so the radial world
 * still has a centre.
 */
const HUB_DEFS: readonly { id: string; title: string }[] = [
  { id: 'store', title: 'store' },
  { id: 'cli', title: 'cli' },
];
const HUB_IDS: ReadonlySet<string> = new Set(HUB_DEFS.map((h) => h.id));

/** A synthetic FALLBACK hub story — a bare central island, used only when the real
 *  cli/store story is missing from the payload (normally they come from /api/tree). */
function makeHubStory(def: { id: string; title: string }): TreeStory {
  return {
    id: def.id,
    title: def.title,
    outcome: 'wiring hub — every organism connects here',
    status: null,
    proofMode: '',
    uatWitness: 'human',
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
  };
}

// ---------- focus relations (V1's ancestor/descendant highlighting) ----------

interface Relations {
  ancestors: Set<string>;
  descendants: Set<string>;
}

function relationsFor(nodes: { id: string; dependsOn: string[] }[], focusId: string): Relations {
  const depsOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const node of nodes) {
    depsOf.set(node.id, node.dependsOn);
    for (const d of node.dependsOn) {
      const list = dependentsOf.get(d);
      if (list) list.push(node.id);
      else dependentsOf.set(d, [node.id]);
    }
  }
  const walk = (start: string, next: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(next.get(start) ?? [])];
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(next.get(id) ?? []));
    }
    return seen;
  };
  return { ancestors: walk(focusId, depsOf), descendants: walk(focusId, dependentsOf) };
}

// ---------- capability sub-DAG (side panel) ----------

const SUB_W = 134;
const SUB_H = 46;
const SUB_STRIP = 13;

/** Smooth path through dagre's edge waypoints (quadratic through the bends). */
function pathThrough(points: Pt[]): string {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last) return '';
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const nx = points[i + 1];
    if (!p || !nx) continue;
    d += ` Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${((p.x + nx.x) / 2).toFixed(1)} ${((p.y + nx.y) / 2).toFixed(1)}`;
  }
  if (points.length >= 2) d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/** Wrap a kebab-case id across up to two lines, breaking at a hyphen. */
function idLines(id: string, max = 19): string[] {
  if (id.length <= max) return [id];
  const head = id.slice(0, max);
  let cut = head.lastIndexOf('-');
  if (cut < Math.floor(max * 0.4)) cut = max;
  const line1 = id.slice(0, cut);
  const rest = id.slice(cut).replace(/^-/, '');
  if (!rest) return [line1];
  return [line1, rest.length > max ? `${rest.slice(0, max - 1)}…` : rest];
}

interface SubLayout {
  width: number;
  height: number;
  caps: { cap: TreeCapability; x: number; y: number }[];
  edges: { from: string; to: string; d: string }[];
}

function layoutSubdag(story: TreeStory): SubLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'BT', ranksep: 30, nodesep: 16, edgesep: 10, marginx: 8, marginy: 8 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const c of story.capabilities) g.setNode(c.id, { width: SUB_W, height: SUB_H });
  for (const c of story.capabilities) {
    for (const dep of c.dependsOn) {
      if (dep !== c.id && g.hasNode(dep)) g.setEdge(dep, c.id);
    }
  }
  dagre.layout(g);
  const meta = g.graph();
  const caps = story.capabilities.map((cap) => {
    const node = g.node(cap.id);
    return { cap, x: (node?.x ?? 0) - SUB_W / 2, y: (node?.y ?? 0) - SUB_H / 2 };
  });
  const edges: SubLayout['edges'] = [];
  for (const c of story.capabilities) {
    for (const dep of c.dependsOn) {
      if (dep === c.id || !g.hasNode(dep)) continue;
      const e = g.edge(dep, c.id) as { points?: Pt[] } | undefined;
      edges.push({ from: dep, to: c.id, d: pathThrough(e?.points ?? []) });
    }
  }
  return {
    width: Math.max(Math.ceil(meta.width ?? 0), SUB_W + 16),
    height: Math.max(Math.ceil(meta.height ?? 0), SUB_H + 16),
    caps,
    edges,
  };
}

// ---------- view ----------

type Band = TreeSession['band'];

/** What the session dock shows: the board-level list, or one session's detail. */
type SessionDockState = { kind: 'list' } | { kind: 'detail'; id: string };

export function TreeView({ focus }: { focus: string | null }): React.JSX.Element {
  const [stories, setStories] = useState<TreeStory[] | null>(null);
  // Sessions: seeded by the one-shot tree payload, then kept near-real-time by
  // the /api/presence poll; `now` ticks so wisps age between polls (lib/presence.ts).
  const [seedSessions, setSeedSessions] = useState<TreeSession[] | undefined>(undefined);
  const { sessions, now } = usePresence(seedSessions);
  // In-flight builds (ADR-0048): the harness signal the orbiting wisp is sourced
  // from. Seeded from the tree payload, then polled; aged by the SAME `now`
  // ticker usePresence publishes.
  const [seedBuilds, setSeedBuilds] = useState<BuildActivity[] | undefined>(undefined);
  const rawBuilds = useBuildActivity(seedBuilds);
  // The session dock: the board-level list (toolbar count click) or one session's
  // detail (wisp / row click). Sessions whose nodes anchor to no loaded story —
  // including nodes:[] hook declarations — are reachable ONLY through the list.
  const [sessionDock, setSessionDock] = useState<SessionDockState | null>(null);
  const [loadError, setLoadError] = useState('');
  // Selection lives in the URL (#/tree/<storyId>) so a focused territory is
  // deep-linkable; the route's `focus` IS the selected story — but only when
  // it names a real story, so a stale deep link renders the unfocused world
  // instead of dimming everything.
  const selectedStory = useMemo(
    () => (focus && stories?.some((s) => s.id === focus) ? focus : null),
    [focus, stories],
  );
  const [hoverStory, setHoverStory] = useState<string | null>(null);
  const [selectedCap, setSelectedCap] = useState<string | null>(null);
  const [hoverCap, setHoverCap] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // ADR-0088: a consumer's on-map bookshelf stamp was clicked — highlight the shared island it
  // uses in the left panel (and the panel scrolls it into view). One building today (library),
  // so a stamp highlights it; cleared on the next world click.
  const [highlightShared, setHighlightShared] = useState<string | null>(null);

  // The one-shot tree load, extracted so a per-test UAT verdict signature (UatTestsSection) can
  // RE-PULL it — the crown greens from the per-test roll-up server-side (ADR-0082), so after a
  // signature the world must re-fetch to repaint the island.
  const reloadTree = useCallback((): void => {
    api
      .tree()
      .then((p) => {
        setStories(presentStories(p.stories));
        setSeedSessions(p.sessions ?? []);
        setSeedBuilds(p.builds ?? []);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reloadTree();
  }, [reloadTree]);

  // Road routing LAYOUT (`?rivers=`, NOT water vs roads — roads is the only world now,
  // ADR-0073): the default `bundle` vs the `merge`/`confluence`/`strands` alternates.
  // Read once (URL constant), threaded into buildWorld AND its memo deps.
  const plantsScatter = useMemo(() => readPlantsScatter(), []);
  // The REACTIVE seam: the gear panel (WorldSettingsPanel) writes the gear dials into
  // the URL query string (params BEFORE the #hash) and updates this state, so the world
  // re-renders LIVE without a full reload. Seeded from the URL at mount (SSR-guarded).
  // Only the gear-exposed readers (substrate / layout) are keyed on it; plants the panel
  // never touches, so it stays mount-once.
  const [search, setSearch] = useState<string>(() => defaultSearch());
  // ADR-0074 §6: `?layout=solar` reskins the world radially with cli/store hubs at the
  // centre. Gear-panel managed, so it's reactive on `search` (live, no reload). In solar
  // mode the synthetic hub islands are injected ONLY into buildWorld's input — the
  // component's `stories` state (panel / selection / verdicts) stays clean.
  const layoutMode = useMemo(() => readLayoutMode(search), [search]);
  // ADR-0076 §2 / ADR-0088: building-class stories (e.g. library) are EXCLUDED from the map and
  // their consumers carry a distributed bookshelf STAMP (the "uses the shared library" marker).
  // The buildings themselves live in the permanent Shared Islands panel. Default ON since the
  // owner attested it; `?buildings=off` restores normal connected islands (no panel, no stamps).
  const buildings = useMemo(() => readBuildings(search), [search]);
  const worldStories = useMemo(() => {
    if (layoutMode !== 'solar' || !stories) return stories;
    const present = new Set(stories.map((s) => s.id));
    const hubs = HUB_DEFS.filter((h) => !present.has(h.id)).map(makeHubStory);
    return [...stories, ...hubs];
  }, [stories, layoutMode]);
  const world = useMemo(
    () =>
      worldStories
        ? buildWorld(worldStories, {
            plantsScatter,
            layoutMode,
            buildings,
            hubIds: HUB_IDS,
          })
        : null,
    [worldStories, plantsScatter, layoutMode, buildings],
  );
  // ADR-0088: the building-class stories that fill the permanent Shared Islands panel. Generic
  // over `story.building === true` (sharedIslandStories). Empty when `?buildings=off` (the
  // buildings render as normal islands then, so the panel has nothing to lift off the map).
  const sharedIslands = useMemo(
    () => (buildings && stories ? sharedIslandStories(stories) : []),
    [stories, buildings],
  );

  // The gear panel commits a new search string here: write it into the URL with the
  // params placed BEFORE the #hash (replaceState — never pushState, so dragging a
  // slider doesn't spam history), then push it into state so the world re-renders
  // live. SSR-guarded (no window ⇒ state-only). The panel itself debounces slider
  // drags before calling this, so buildWorld doesn't rebuild on every pixel.
  const commitSearch = useCallback((nextSearch: string): void => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    }
    setSearch(nextSearch);
  }, []);

  // VISUAL SPIKE (do not land): swap the regular hex interiors for an irregular
  // relaxed grid when `?substrate=…` is set. Null = the default hex world.
  // Tuning (`jitter`/`iters`/`relax`/`wheatScatter`) is read from the URL so the
  // owner can dial the look in live without a rebuild.
  const substrateMode = useMemo(() => readSubstrateMode(search), [search]);
  const substrateTuning = useMemo(() => readSubstrateTuning(), []);
  const relaxedCells = useMemo(
    () => (world && substrateMode ? buildRelaxedCells(world, substrateMode, substrateTuning) : null),
    [world, substrateMode, substrateTuning],
  );

  // The world reads bottom-up (foundation at the bottom), so the frame opens
  // scrolled to the bottom; selecting / deep-linking a story scrolls its
  // territory into view. SVG elements have no offsetTop and the scene is
  // width-capped + centred, so the offset comes from rect deltas.
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollToStory = (storyId: string, smooth: boolean): void => {
    const frame = frameRef.current;
    const svg = svgRef.current;
    const territory = world?.territories.find((t) => t.story.id === storyId);
    if (!frame || !svg || !territory || !world) return;
    const scale = svg.clientWidth / world.width;
    const svgTop =
      svg.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop;
    const y = (territory.centroid.y + world.offset.y) * scale + svgTop;
    frame.scrollTo({ top: y - frame.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  };
  // Mount: a deep link wins; otherwise land on the foundation (the bottom).
  useLayoutEffect(() => {
    if (!world) return;
    if (selectedStory) scrollToStory(selectedStory, false);
    else frameRef.current?.scrollTo({ top: frameRef.current.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  useEffect(() => {
    if (selectedStory && world) scrollToStory(selectedStory, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStory]);

  const focusStoryId = hoverStory ?? selectedStory;
  // Focus walks the SAME declared ∪ derived edge set the roads and ranking
  // use, so a derived-only road lights up like any declared one.
  const unionNodes = useMemo(() => {
    if (!stories) return null;
    const deps = new Map<string, string[]>(stories.map((s) => [s.id, []]));
    for (const e of storyEdges(stories)) deps.get(e.to)?.push(e.from);
    return stories.map((s) => ({ id: s.id, dependsOn: deps.get(s.id) ?? [] }));
  }, [stories]);
  const storyRelations = useMemo(
    () => (unionNodes && focusStoryId ? relationsFor(unionNodes, focusStoryId) : null),
    [unionNodes, focusStoryId],
  );
  const storyIds = useMemo(() => new Set((stories ?? []).map((s) => s.id)), [stories]);

  /** capability id → owning story id (resolves session node anchors). */
  const capOwner = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stories ?? []) for (const c of s.capabilities) m.set(c.id, s.id);
    return m;
  }, [stories]);

  /** A declared node's territory: the story itself, or its capability's owner. */
  const storyForNode = (node: string): string | null =>
    storyIds.has(node) ? node : (capOwner.get(node) ?? null);

  /**
   * session → the story territories its nodes resolve to. A session that
   * resolves to NONE (nodes:[] hook declarations, or ids no loaded story
   * owns) anchors nowhere — no wisp, only the board-level list shows it.
   */
  const sessionAnchors = useMemo(() => {
    const anchors = new Map<string, string[]>();
    for (const session of sessions) {
      const ids = new Set<string>();
      for (const node of session.nodes) {
        if (storyIds.has(node)) ids.add(node);
        const ownerId = capOwner.get(node);
        if (ownerId) ids.add(ownerId);
      }
      anchors.set(session.sessionId, [...ids]);
    }
    return anchors;
  }, [storyIds, capOwner, sessions]);

  const sessionsByStory = useMemo(() => {
    const byStory = new Map<string, TreeSession[]>();
    for (const session of sessions) {
      for (const id of sessionAnchors.get(session.sessionId) ?? []) {
        const list = byStory.get(id);
        if (list) list.push(session);
        else byStory.set(id, [session]);
      }
    }
    return byStory;
  }, [sessions, sessionAnchors]);

  /**
   * In-flight builds grouped by the story territory their unit resolves to
   * (ADR-0048). TTL-aged against the shared `now` ticker so a build's wisp
   * vanishes the instant it crosses BUILD_IN_FLIGHT_TTL_MS, not at the next
   * poll. A build whose unit no loaded story owns anchors nowhere (no wisp).
   */
  const buildsByStory = useMemo(() => {
    const byStory = new Map<string, BuildActivity[]>();
    for (const b of rawBuilds) {
      if (!isBuildInFlight(b.at, now)) continue;
      const storyId = storyIds.has(b.unitId) ? b.unitId : capOwner.get(b.unitId);
      if (storyId === undefined) continue;
      const list = byStory.get(storyId);
      if (list) list.push(b);
      else byStory.set(storyId, [b]);
    }
    return byStory;
  }, [rawBuilds, now, storyIds, capOwner]);

  // ADR-0093 Unit 2b: the shared scene-graph render, behind `?render=scene` (default
  // off ⇒ the inline render below is untouched / byte-identical). The scene is
  // focus-AGNOSTIC (focus / hover / selection are applied by the mapper per render),
  // so it only rebuilds on the world / substrate / ticker / build-activity inputs —
  // never on hover. Hooks live above the early returns (the world may still be null).
  const renderScene = useMemo(() => readRenderScene(search), [search]);
  const scene = useMemo(
    () => (world ? buildScene(worldToScene(world, relaxedCells, now, buildsByStory)) : null),
    [world, relaxedCells, now, buildsByStory],
  );

  if (loadError) {
    return (
      <div className="pad">
        <h2>Story forest</h2>
        <p className="muted">Couldn’t load the tree: {loadError}</p>
      </div>
    );
  }
  if (!stories || !world) return <p className="muted pad">Growing the world…</p>;
  if (stories.length === 0) {
    return (
      <div className="pad">
        <h2>Story forest</h2>
        <p className="muted">No stories yet — the world appears once stories/ holds one.</p>
      </div>
    );
  }

  const capCount = stories.reduce((n, s) => n + s.capabilities.length, 0);
  const selected = selectedStory ? stories.find((s) => s.id === selectedStory) : undefined;
  // ADR-0041: only fresh/stale sessions count as "active" and orbit as wisps;
  // possibly-dead sessions park in the dock (the history/debugging surface).
  const { orbiting, parked } = splitSessions(sessions);

  const toggleStatus = (st: string): void => {
    const next = new Set(hidden);
    if (next.has(st)) next.delete(st);
    else next.add(st);
    setHidden(next);
  };

  // The focus-aware island class — by id + folded status, so the scene mapper
  // (SceneView) can compute it from a scene node (which carries id + status).
  const territoryClassById = (id: string, status: string): string => {
    const cls = ['hex-territory', `st-${status}`];
    if (HUB_IDS.has(id)) cls.push('is-hub'); // solar-mode central wiring hub
    if (focusStoryId && storyRelations) {
      if (id === focusStoryId) cls.push('is-focus');
      else if (storyRelations.ancestors.has(id)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(id)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    if (id === selectedStory) cls.push('is-selected');
    return cls.join(' ');
  };
  const territoryClass = (story: TreeStory): string =>
    territoryClassById(story.id, story.status ?? 'unknown');

  // The wrapping class for a docked road/spoke: `world-trail` (the focus-dimming CSS keys
  // on it) plus the upstream-gold / downstream-red / dimmed tint when a story is focused.
  const roadClassByEnds = (from: string, to: string): string => {
    const cls = ['world-trail'];
    if (focusStoryId && storyRelations) {
      const anc = (id: string): boolean => id === focusStoryId || storyRelations.ancestors.has(id);
      const desc = (id: string): boolean =>
        id === focusStoryId || storyRelations.descendants.has(id);
      if (storyRelations.ancestors.has(from) && anc(to)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(to) && desc(from)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    return cls.join(' ');
  };
  const roadClass = (e: WorldEdge): string => roadClassByEnds(e.from, e.to);

  const clearSelection = (): void => {
    setSelectedCap(null);
    navigate(treeHref);
  };
  const selectStory = (storyId: string, capId: string | null): void => {
    // Real cli/store stories (ADR-0074 §3) are selectable like any island and show their
    // capability trees. Only a SYNTHETIC fallback hub (absent from the story payload) has
    // no panel to open, so guard that case alone.
    if (HUB_IDS.has(storyId) && !stories?.some((s) => s.id === storyId)) return;
    if (selectedStory === storyId && capId === null) {
      clearSelection(); // second click on the selected territory toggles it off
      return;
    }
    setSelectedCap(capId);
    navigate(treeFocusHref(storyId));
  };

  return (
    <div className="tree-wrap pad">
      <div className="tree-toolbar">
        <h2>Story forest</h2>
        <span className="muted small">
          {stories.length} stories · {capCount} capabilities
          {sessions.length > 0 && (
            <>
              {' · '}
              <button
                type="button"
                className="tree-link"
                onClick={() => setSessionDock({ kind: 'list' })}
              >
                {orbiting.length > 0
                  ? `${orbiting.length} active session${orbiting.length === 1 ? '' : 's'}${
                      parked.length > 0 ? ` (+${parked.length} aged)` : ''
                    }`
                  : `${parked.length} aged session${parked.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}{' '}
          — foundations at the bottom, dependents fan upward. Each story is one tree in the forest;
          its capabilities garden around its island. Click an island for the capability DAG.
        </span>
      </div>

      <div className="tree-layout">
        <SharedIslandsPanel
          islands={sharedIslands}
          stories={stories}
          builds={rawBuilds}
          now={now}
          hidden={hidden}
          highlightId={highlightShared}
          substrateMode={substrateMode}
          substrateTuning={substrateTuning}
          onToggleStatus={toggleStatus}
          onResetHidden={() => setHidden(new Set())}
          onSelectIsland={(id) => selectStory(id, null)}
        />
        <div className="world-frame">
          <div
            className="world-scroll"
            ref={frameRef}
            tabIndex={0}
            aria-label="story forest map (scrollable)"
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection(); // gutters beside the capped scene
            }}
          >
          <svg
            ref={svgRef}
            className="world-scene world-roads"
            viewBox={`0 0 ${world.width} ${world.height}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection();
            }}
          >
            <defs>
              <marker
                id="sub-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.2 L 8 5 L 0 8.8 z" fill="context-stroke" />
              </marker>
            </defs>

            {renderScene && scene ? (
              // ADR-0093 Unit 2b: render FROM the shared scene-graph via the thin React
              // mapper. Studio-only chrome (solar spokes, the Shared-Islands panel,
              // building stamps) is NOT in the scene yet — this parity path covers the
              // default dag+mesh world for the owner's visual nod.
              <SceneView
                scene={scene}
                ctx={{
                  territoryClassById,
                  roadClassByEnds,
                  hidden,
                  onHoverStory: setHoverStory,
                  onSelectStory: (id) => selectStory(id, null),
                  onSelectCap: (storyId, capId) => selectStory(storyId, capId),
                }}
              />
            ) : (
            <g transform={`translate(${world.offset.x} ${world.offset.y})`}>
              {/* SOLAR ORBIT GRID — the rings are still COMPUTED (`world.solar.rings` /
                  `.center`, machinery kept) but NOT DRAWN: the owner's steer (2026-06-20)
                  is to keep the orbit structure invisible and the islands loosely placed.
                  Re-enable by mapping `world.solar.rings` to faint `.solar-orbit-ring`
                  circles centred on `world.solar.center`. */}

              {/* the pale coast */}
              <g className="hex-coast">
                {world.empties.map((h) => {
                  const c = hexCenter(h);
                  return <path key={axialKey(h)} className="hex-empty" d={hexPath(c.x, c.y, HEX_R - 0.6)} />;
                })}
              </g>

              {/* organic island land: the smoothed coast filled as sand, UNDER the
                  hex tiles, so each island reads as one solid blob with a beach
                  rim instead of loose tiles floating in a hexagonal moat. */}
              <g className="hex-coastland">
                {world.territories.map((t) => (
                  <g key={t.story.id} className={`coast-fill-group ${territoryClass(t.story)}`}>
                    {t.coastPaths.map((d, i) => (
                      <path key={`cf${i}`} className="coast-fill" d={d} />
                    ))}
                  </g>
                ))}
              </g>

              {/* claimed land, back-to-front so extrusions layer — the shared IslandGround
                  (the SAME component the Shared Islands panel paints, so map + panel never drift). */}
              <IslandGround
                world={world}
                relaxedCells={relaxedCells}
                classOf={territoryClass}
                interactive={{
                  onHover: (id) => setHoverStory(id),
                  onSelect: (id) => selectStory(id, null),
                }}
              />

              {/* SOLAR connections (solar mode) — thin, no-arrow, PERIMETER-DOCKED curves
                  the website-way (web/src/lib/world.ts): spokes first (the de-noised
                  hub→organism `consumed_by` wiring, low salience), then the `depends_on`
                  roads above them. Both dock on each island's rim by bearing, so a hub's
                  edges fan around it instead of piling on one point (the owner's steer). */}
              {world.solar && (
                <>
                  <g className="solar-spoke-net">
                    {world.solar.spokes.map((s) => (
                      <path
                        key={`${s.from}->${s.to}`}
                        className="solar-spoke"
                        d={s.d}
                      />
                    ))}
                  </g>
                  <g className="solar-road-net">
                    {world.solar.roads.map((e) => (
                      <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                        <title>
                          {`${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`}
                        </title>
                        <path className="solar-road" d={e.d} />
                      </g>
                    ))}
                  </g>
                </>
              )}

              {/* DAG/tree docked-line roads — thin, no-arrow, PERIMETER-DOCKED curves
                  (the ONE road rendering since the river-trail system was retired, ADR-0076;
                  the same style the solar world uses). Drawn ABOVE the land. */}
              {world.lineRoads && (
                <g className="dag-road-net">
                  {world.lineRoads.map((e) => (
                    <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                      <title>
                        {`${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`}
                      </title>
                      <path className="dag-road" d={e.d} />
                    </g>
                  ))}
                </g>
              )}

              {/* trees, decoration, nameplates, wisps — per territory */}
              {world.territories.map((t) => (
                <TerritoryFlora
                  key={t.story.id}
                  territory={t}
                  className={territoryClass(t.story)}
                  hidden={hidden}
                  // The world orbits the HARNESS now (ADR-0048 §5): in-flight
                  // builds only. Session presence lives in the dock / panel.
                  builds={buildsByStory.get(t.story.id) ?? []}
                  now={now}
                  onHover={(on) => setHoverStory(on ? t.story.id : null)}
                  onSelect={(capId) => selectStory(t.story.id, capId)}
                  // ADR-0088: clicking a consumer's bookshelf stamp highlights the shared
                  // island it uses in the left panel (one building today → the library).
                  onStampClick={() => setHighlightShared(sharedIslands[0]?.id ?? null)}
                />
              ))}
            </g>
            )}
          </svg>
          </div>
          {sessionDock && (
            <SessionDock
              dock={sessionDock}
              sessions={sessions}
              anchors={sessionAnchors}
              now={now}
              storyForNode={storyForNode}
              onShowList={() => setSessionDock({ kind: 'list' })}
              onShowDetail={(id) => setSessionDock({ kind: 'detail', id })}
              onFocusStory={(id) => navigate(treeFocusHref(id))}
              onClose={() => setSessionDock(null)}
            />
          )}
          {/* The world-tuning gear (bottom-right): sliders/toggles/selects bound to
              the URL dials. Closed by default ⇒ no params written ⇒ today's world is
              byte-identical. */}
          <WorldSettingsPanel search={search} onCommit={commitSearch} />
        </div>

        {selected && (
          <StoryPanel
            story={selected}
            stories={stories}
            storyIds={storyIds}
            sessions={sessionsByStory.get(selected.id) ?? []}
            now={now}
            selectedCap={selectedCap}
            hoverCap={hoverCap}
            hidden={hidden}
            onSelectCap={setSelectedCap}
            onHoverCap={setHoverCap}
            onSelectSession={(id) => setSessionDock({ kind: 'detail', id })}
            onCrownRefresh={reloadTree}
            onClose={clearSelection}
          />
        )}
      </div>
    </div>
  );
}

/** A decorative low-poly conifer (no status meaning). */
function DecorTree({ x, y, h, seed }: { x: number; y: number; h: number; seed: number }): React.JSX.Element {
  const lean = (rand01(seed) - 0.5) * 2;
  const w = h * 0.42;
  return (
    <g className="hex-conifer" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <ellipse className="flora-shadow" cx={1} cy={1} rx={w * 0.9} ry={2.4} />
      <path
        className={`conifer-body c-${seed % 3}`}
        d={`M ${lean} ${-h} L ${w} 0 L ${-w} 0 Z`}
      />
      <path className="conifer-snow" d={`M ${lean} ${-h} L ${lean + w * 0.45} ${-h * 0.45} L ${lean - w * 0.45} ${-h * 0.45} Z`} />
    </g>
  );
}

/**
 * The recently-landed bloom (ADR-0045): a transient, decaying halo + sparkle
 * announcing that a signed PASS landed on this territory inside BLOOM_WINDOW.
 * It is a pure decoration off `verdict.at` (already on the wire) — the durable
 * record stays the plant HUE (ADR-0040); this layer fades to nothing and never
 * re-encodes that bit (see lib/activity.ts for the through-line).
 *
 * Geometry is seeded by the unit id, so it never jitters between the now-ticker
 * re-renders (the same purity rule the wisp orbit phase obeys). The CSS pulse
 * lives on the INNER group; the outer group carries the translate AND the
 * age-decay opacity — in SVG a CSS transform/opacity replaces the matching
 * presentation attribute, so the animated and the positioned facts must sit on
 * different elements (else the scale keyframe would snap the bloom to the origin
 * and the opacity keyframe would clobber the decay).
 */
function LandingBloom({
  unitId,
  bloom,
  cx,
  cy,
  r,
  kind,
}: {
  unitId: string;
  bloom: VerdictBloom;
  cx: number;
  cy: number;
  r: number;
  kind: 'crown' | 'plant';
}): React.JSX.Element {
  // Bright when fresh, dimming with age — but never to zero here: verdictBloom
  // returns null at the window edge, which unmounts the whole layer.
  const ageOpacity = (0.3 + 0.65 * bloom.ageRatio).toFixed(2);
  const sparks = Array.from({ length: kind === 'crown' ? 4 : 3 }, (_, i) => {
    const a = rand01(hash(`${unitId}:bloom:a${i}`)) * Math.PI * 2;
    const rr = r * (0.78 + rand01(hash(`${unitId}:bloom:r${i}`)) * 0.5);
    return {
      x: Math.cos(a) * rr,
      y: Math.sin(a) * rr * 0.7, // top-down squash, same as the wisp orbit
      r: (kind === 'crown' ? 1.5 : 1) * (0.8 + rand01(hash(`${unitId}:bloom:s${i}`)) * 0.5),
    };
  });
  return (
    <g
      className="world-bloom-anchor"
      transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}
      opacity={ageOpacity}
      aria-hidden="true"
    >
      <g className={`world-bloom verdict-${bloom.outcome} bloom-${kind}`}>
        <circle className="bloom-ring" r={r.toFixed(1)} />
        {sparks.map((s, i) => (
          <circle
            key={i}
            className="bloom-spark"
            cx={s.x.toFixed(1)}
            cy={s.y.toFixed(1)}
            r={s.r.toFixed(1)}
          />
        ))}
      </g>
    </g>
  );
}

/**
 * The central story tree — the story ITSELF (ADR-0036 d.6b, vocabulary
 * recalibrated by ADR-0038). Crown size grows with capability count; GROWTH
 * and foliage carry the lifecycle: `proposed` (which `building` wears in the
 * world) grows a not-yet-full young tree — as does a claimed-but-empty story
 * (zero capabilities), which renders the same small form in its status hue
 * rather than a distinct sapling stage (owner 2026-06-21); `mapped` is the
 * full brownfield canopy, `healthy` the full green one; `unhealthy`
 * withers it to a sparse drooped crown with bare branches and leaf-fall.
 * Retired stories never reach this component (worldStatus.ts prunes them),
 * and the status arrives PROVEN (provenStatus): a green or withered crown is
 * the story's OWN UAT verdict speaking, never a child roll-up. The signpost
 * is the human-witness mark (ADR-0040): only uat_witness-human stories carry
 * one — dashed-blank until their UAT verdict is signed, a filled seal after
 * (the seal echoes the crown's hue; the FILL is the new bit).
 */
// The bookshelf icon geometry (ADR-0076 §2): a tall, narrow, weathered case of ~4 shelves
// crammed with old leather books — many upright at varied heights, a few leaning, a couple
// stacked flat (the "old chaotic library shelf" the owner referenced). Base sits at y=0 and
// it grows upward (negative y), like the trees, so y-sorting layers it correctly. Sized
// small enough to sit on an island. The spine layout is the deterministic, unit-tested
// `shelfBooks` (buildingLayout.ts) — geometry red-green; the PALETTE/appearance is
// owner-attested (ADR-0070), carried by CSS (`.bookshelf-*`).
const BOOKSHELF = {
  W: 22, // case outer width
  H: 30, // case outer height (base at y=0, top at y=-H)
  wall: 1.8, // side-panel thickness
  plinth: 3, // plinth height at the base
  topMargin: 1.4, // gap above the top shelf, under the top board
  shelves: 4,
  board: 1, // shelf-board thickness
};

/**
 * The bookshelf art as a `<g>` centred horizontally at the origin with its base on y=0 —
 * shared by the consumer {@link StoryBookshelf} stamp and the building card's nameplate glyph
 * (the Shared Islands panel, ADR-0088), so the two can never drift. Pure geometry off
 * `shelfBooks(seed)`; deterministic per `seed`.
 */
function BookshelfGlyph({ seed }: { seed: number }): React.JSX.Element {
  const B = BOOKSHELF;
  const interiorW = B.W - 2 * B.wall;
  const usable = B.H - B.plinth - B.topMargin;
  const comp = usable / B.shelves; // one compartment's height
  const shelfInteriorH = comp - B.board - 0.4; // headroom for books under the next board
  const rows = Array.from({ length: B.shelves }, (_, k) => {
    const boardY = -(B.plinth + k * comp); // the surface this shelf's books rest on
    // every 3rd shelf swaps a few upright spines for a small flat stack — the lived-in look
    const flat = k === 1;
    const books = shelfBooks(seed * 31 + k * 7 + 13, interiorW * (flat ? 0.66 : 1), shelfInteriorH);
    return { k, boardY, books, flat };
  });
  // a couple of books piled flat on TOP of the case (the overflow pile)
  const topPile = shelfBooks(seed * 53 + 5, interiorW * 0.7, 2.6).slice(0, 3);

  return (
    <g className="story-bookshelf-art">
      {/* plinth */}
      <rect className="bookshelf-plinth" x={-B.W / 2 - 1} y={-B.plinth} width={B.W + 2} height={B.plinth} rx={0.6} />
      {/* the dark case interior (books sit against it) */}
      <rect className="bookshelf-case" x={-B.W / 2} y={-B.H} width={B.W} height={B.H - B.plinth} rx={1} />
      {/* shelf boards */}
      {rows.map(({ k, boardY }) => (
        <rect
          key={`b${k}`}
          className="bookshelf-board"
          x={-B.W / 2 + B.wall * 0.5}
          y={boardY}
          width={B.W - B.wall}
          height={B.board}
        />
      ))}
      {/* book spines (upright) + occasional flat stack, per shelf */}
      {rows.map(({ k, boardY, books, flat }) => (
        <g key={`s${k}`}>
          {books.map((bk, i) => {
            const x = -interiorW / 2 + bk.x;
            const cx = x + bk.w / 2;
            return (
              <rect
                key={i}
                className={`bookshelf-book bk-${bk.variant}`}
                x={x.toFixed(2)}
                y={(boardY - bk.h).toFixed(2)}
                width={bk.w.toFixed(2)}
                height={bk.h.toFixed(2)}
                rx={0.4}
                {...(bk.tilt
                  ? { transform: `rotate(${bk.tilt.toFixed(1)} ${cx.toFixed(2)} ${boardY.toFixed(2)})` }
                  : {})}
              />
            );
          })}
          {flat &&
            // a small flat stack to the side of this shelf's spines (varied lengths)
            [0, 1, 2].map((j) => {
              const sw = interiorW * (0.26 - j * 0.02);
              const sx = interiorW / 2 - sw - 0.5;
              const sy = boardY - 1.3 * (j + 1);
              return (
                <rect
                  key={`f${j}`}
                  className={`bookshelf-book bk-${(seed + j + k) % 5}`}
                  x={sx.toFixed(2)}
                  y={sy.toFixed(2)}
                  width={sw.toFixed(2)}
                  height={1.2}
                  rx={0.3}
                />
              );
            })}
        </g>
      ))}
      {/* top board */}
      <rect className="bookshelf-board" x={-B.W / 2} y={-B.H} width={B.W} height={B.board + 0.4} rx={0.6} />
      {/* the overflow pile on top */}
      {topPile.map((bk, i) => {
        const x = -interiorW / 2 + bk.x;
        return (
          <rect
            key={`t${i}`}
            className={`bookshelf-book bk-${(bk.variant + 2) % 5}`}
            x={x.toFixed(2)}
            y={(-B.H - 2.6 + (i % 2)).toFixed(2)}
            width={(bk.w * 1.9).toFixed(2)}
            height={2.2}
            rx={0.3}
          />
        );
      })}
      {/* side panels (over the book side-edges) */}
      <rect className="bookshelf-side" x={-B.W / 2} y={-B.H} width={B.wall} height={B.H - B.plinth} rx={0.8} />
      <rect className="bookshelf-side" x={B.W / 2 - B.wall} y={-B.H} width={B.wall} height={B.H - B.plinth} rx={0.8} />
    </g>
  );
}

/**
 * The library-as-a-building icon (ADR-0076 §2) stamped on an island that CONSUMES the
 * library — a small weathered bookshelf beside the story tree, NOT a replacement for it: the
 * "this island uses the shared library" marker. The library itself lives in the left Shared
 * Islands panel now (ADR-0088); clicking this stamp highlights it there (`onStampClick`). The
 * tooltip names what it means. Appearance is owner-attested (ADR-0070) — geometry only here.
 */
function StoryBookshelf({
  territory: t,
  hidden,
  onStampClick,
}: {
  territory: Territory;
  hidden: ReadonlySet<string>;
  /** ADR-0088: clicking the stamp highlights the shared island it marks in the left panel
   *  (instead of selecting the consumer island). Absent in the panel's own one-island render. */
  onStampClick?: () => void;
}): React.JSX.Element {
  const story = t.story;
  const st = story.status ?? 'unknown';
  const spot = t.bookshelfSpot ?? t.treeSpot;
  return (
    <g
      className={`story-bookshelf${hidden.has(st) ? ' is-filtered' : ''}${onStampClick ? ' is-link' : ''}`}
      transform={`translate(${spot.x.toFixed(1)} ${spot.y.toFixed(1)}) scale(1.18)`}
      {...(onStampClick
        ? {
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation(); // highlight the panel island, don't select the consumer
              onStampClick();
            },
          }
        : {})}
    >
      <title>{`library — used by ${story.id} · click to find it in Shared Islands`}</title>
      <ellipse className="flora-shadow" cx={1} cy={1.6} rx={12.5} ry={3.1} />
      <BookshelfGlyph seed={hash(`${story.id}:shelf`)} />
    </g>
  );
}

/**
 * The claimed-land GROUND layer for every territory in `world`, back-to-front so extrusions
 * layer — the relaxed mesh substrate (the default) or the extruded hex tiles. Shared by the MAP
 * (interactive: per-territory hover/select) and the Shared Islands panel CARD (non-interactive),
 * so an island's ground reads identically in both and the two can never drift (ADR-0088 follow-on,
 * owner 2026-06-22 — the panel islands were missing this layer and looked flat). Pure geometry off
 * the world model; the handlers are the only difference between the two call sites.
 */
function IslandGround({
  world,
  relaxedCells,
  classOf,
  interactive,
}: {
  world: HexWorld;
  relaxedCells: RelaxedCell[] | null;
  /** The per-territory ground class. The map passes its focus/hover-aware `territoryClass`; the
   *  panel card passes a static `hex-territory st-<status>` (no map focus context). */
  classOf: (story: TreeStory) => string;
  interactive?: { onHover: (id: string | null) => void; onSelect: (id: string) => void };
}): React.JSX.Element {
  const hov = interactive?.onHover;
  const sel = interactive?.onSelect;
  if (relaxedCells) {
    // VISUAL SPIKE substrate: irregular relaxed cells, grouped by territory for hover/focus.
    return (
      <g className="relaxed-land">
        {world.territories.map((territory, owner) => {
          const cells = relaxedCells.filter((c) => c.owner === owner);
          if (cells.length === 0) return null;
          return (
            <g
              key={territory.story.id}
              className={`relaxed-tile ${classOf(territory.story)}`}
              {...(hov
                ? { onMouseEnter: () => hov(territory.story.id), onMouseLeave: () => hov(null) }
                : {})}
              {...(sel ? { onClick: () => sel(territory.story.id) } : {})}
            >
              {cells.map((cell, i) => (
                <path
                  key={i}
                  className={`relaxed-cell ${cell.wheat ? 'is-wheat' : `v-${cell.variant}`}`}
                  d={polyPath(cell.poly)}
                />
              ))}
            </g>
          );
        })}
      </g>
    );
  }
  return (
    <g className="hex-land">
      {world.drawTiles.map(({ h, owner }) => {
        const territory = world.territories[owner];
        if (!territory) return null;
        const c = hexCenter(h);
        const key = axialKey(h);
        const variant = hash(`tile:${key}`) % 3;
        const wheat = territory.wheatTiles.has(key);
        return (
          <g
            key={key}
            className={`hex-tile ${classOf(territory.story)}`}
            {...(hov
              ? { onMouseEnter: () => hov(territory.story.id), onMouseLeave: () => hov(null) }
              : {})}
            {...(sel ? { onClick: () => sel(territory.story.id) } : {})}
          >
            <path className="hex-side" d={hexPath(c.x, c.y + TILE_DEPTH, HEX_R)} />
            <path
              className={`hex-top ${wheat ? 'is-wheat' : `v-${variant}`}`}
              d={hexPath(c.x, c.y, HEX_R)}
            />
          </g>
        );
      })}
    </g>
  );
}

/** The panel bookshelf landmark: clearly bigger than the on-map stamp (`scale(1.18)`) and seated
 *  to the RIGHT of the name card with a small gap. The glyph is centred at its origin, so its
 *  half-width is folded into the margin → its LEFT edge clears the card's right edge by ~6px.
 *  Owner-attested look (ADR-0088 follow-on, owner 2026-06-22). */
const PANEL_SHELF_SCALE = 2;
const PANEL_SHELF_MARGIN = 6 + (BOOKSHELF.W / 2) * PANEL_SHELF_SCALE;

/**
 * One shared island rendered inside the left panel (ADR-0088). Reuses the world-model→render
 * seam: `buildWorld([story], { buildings:false })` lays the building out as exactly one Territory
 * (its own sand coastline, the SAME ground substrate the map paints, central health tree,
 * capability garden, nameplate) — visually identical to a map island — and we paint it inside a
 * self-contained `<svg viewBox>`. The bookshelf landmark sits OUTSIDE the name card, to its RIGHT
 * and bigger (owner 2026-06-22 — moved out of the plate), so the viewBox is widened to fit it. No
 * on-map context (no roads, no neighbours): the panel island stands alone. The card is the click
 * target into the side panel; clicking it selects the story like clicking its map island.
 * Appearance owner-attested.
 */
function SharedIslandCard({
  story,
  hidden,
  builds,
  now,
  highlighted,
  substrateMode,
  substrateTuning,
  onSelect,
}: {
  story: TreeStory;
  hidden: ReadonlySet<string>;
  builds: BuildActivity[];
  now: Date;
  highlighted: boolean;
  /** The map's ground substrate (the default mesh, or null for plain hex tiles), so the panel
   *  island paints the same ground texture — reactive to the gear like the map. */
  substrateMode: SubstrateMode | null;
  substrateTuning: Partial<SubstrateTuning>;
  onSelect: () => void;
}): React.JSX.Element {
  // Pure, deterministic per the story data + substrate (ADR-0069) → memoise so scrolling / the
  // now-ticker never re-lays the island or its ground.
  const world = useMemo(() => buildWorld([story], { buildings: false }), [story]);
  const relaxedCells = useMemo(
    () => (substrateMode ? buildRelaxedCells(world, substrateMode, substrateTuning) : null),
    [world, substrateMode, substrateTuning],
  );
  const t = world.territories[0];
  const st = story.status ?? 'unknown';
  const cls = `shared-island-card st-${st}${highlighted ? ' is-highlighted' : ''}`;
  const ariaLabel = `shared island ${story.id} — ${story.title}`;
  if (!t) {
    return <button type="button" className={cls} onClick={onSelect} aria-label={ariaLabel} />;
  }
  const plate = nameplateLayout(story.id.length, false);
  const anchor = bookshelfAnchorRight(plate, t.centroid.x, t.labelY, PANEL_SHELF_MARGIN);
  // Widen the viewBox so the right-side glyph isn't clipped — buildWorld's bounds don't know about it.
  const vbW = Math.max(
    world.width,
    world.offset.x + anchor.x + (BOOKSHELF.W / 2 + 2) * PANEL_SHELF_SCALE + 6,
  );
  const vbH = Math.max(world.height, world.offset.y + anchor.y + 6);
  return (
    <button type="button" className={cls} onClick={onSelect} aria-label={ariaLabel}>
      <svg className="shared-island-svg world-roads" viewBox={`0 0 ${vbW} ${vbH}`} aria-hidden="true">
        <g transform={`translate(${world.offset.x} ${world.offset.y})`}>
          {/* the island's sand silhouette (the same smoothed coast the map fills) */}
          <g className="hex-coastland">
            <g className={`coast-fill-group hex-territory st-${st}`}>
              {t.coastPaths.map((d, i) => (
                <path key={`cf${i}`} className="coast-fill" d={d} />
              ))}
            </g>
          </g>
          {/* the SAME ground substrate the map paints (mesh by default) — so a panel island reads
              identically to a map island instead of a flat silhouette (owner 2026-06-22). */}
          <IslandGround
            world={world}
            relaxedCells={relaxedCells}
            classOf={(s) => `hex-territory st-${s.status ?? 'unknown'}`}
          />
          <TerritoryFlora
            territory={t}
            className={`hex-territory st-${st}`}
            hidden={hidden}
            builds={builds}
            now={now}
            onHover={() => {}}
            onSelect={() => onSelect()}
          />
          {/* the bookshelf landmark OUTSIDE the name card, to its RIGHT and bigger (owner
              2026-06-22) — marks this as a shared "building" island; the in-card glyph was retired. */}
          <g
            className="shared-island-shelf"
            transform={`translate(${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)}) scale(${PANEL_SHELF_SCALE})`}
            aria-hidden="true"
          >
            <BookshelfGlyph seed={hash(`${story.id}:shelf`)} />
          </g>
        </g>
      </svg>
    </button>
  );
}

/**
 * The permanent left "Shared Islands" panel (ADR-0088, amends ADR-0076 §2). ALWAYS visible (not
 * a toggle): it relocates the world legend (top section) and hosts the building-class islands
 * (the `library`, generic over `story.building === true`) lifted OFF the map. Every expansion —
 * a legend chip's state fan, or a shared island's detail — opens as a single self-contained box
 * popping to the RIGHT of the panel (the {@link flyoutReducer} keeps at most one open), so it
 * never reflows the panel's vertical content. Escape / click-outside dismiss the flyout.
 */
function SharedIslandsPanel({
  islands,
  stories,
  builds,
  now,
  hidden,
  highlightId,
  substrateMode,
  substrateTuning,
  onToggleStatus,
  onResetHidden,
  onSelectIsland,
}: {
  islands: TreeStory[];
  stories: TreeStory[];
  builds: BuildActivity[];
  now: Date;
  hidden: ReadonlySet<string>;
  highlightId: string | null;
  substrateMode: SubstrateMode | null;
  substrateTuning: Partial<SubstrateTuning>;
  onToggleStatus: (st: string) => void;
  onResetHidden: () => void;
  onSelectIsland: (id: string) => void;
}): React.JSX.Element {
  const [flyout, dispatch] = useReducer(flyoutReducer, FLYOUT_CLOSED);
  const panelRef = useRef<HTMLDivElement>(null);
  const islandRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Escape / click-outside dismiss the right-flyout (the contained-loop close).
  useEffect(() => {
    if (!flyout.open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dispatch({ type: 'close' });
    };
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && !panelRef.current?.contains(e.target)) {
        dispatch({ type: 'close' });
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [flyout.open]);

  // A stamp click on the map highlights its shared island — scroll it into view.
  useEffect(() => {
    if (!highlightId) return;
    islandRefs.current.get(highlightId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightId]);

  const legendKey = (row: RowKey): string => `legend:${row}`;
  const legendOpen: RowKey | null = flyout.open?.startsWith('legend:')
    ? (flyout.open.slice('legend:'.length) as RowKey)
    : null;
  const openIslandId = flyout.open?.startsWith('island:')
    ? flyout.open.slice('island:'.length)
    : null;

  const model = legendModelFor(stories, builds, now);
  const openIsland = openIslandId ? islands.find((s) => s.id === openIslandId) : undefined;

  return (
    <div className="shared-islands-panel" ref={panelRef}>
      {/* The relocated world legend (ABOVE the islands). Controlled: the panel owns the open
          chip via the shared right-flyout, and renders the drawer body to the RIGHT — so a chip
          expansion never shoves the panel's content down. */}
      <section className="panel-section panel-legend">
        <h3 className="panel-head">Legend</h3>
        <WorldLegend
          stories={stories}
          builds={builds}
          now={now}
          hidden={hidden}
          onToggleStatus={onToggleStatus}
          onResetHidden={onResetHidden}
          open={legendOpen}
          onToggle={(key) =>
            key ? dispatch({ type: 'toggle', key: legendKey(key) }) : dispatch({ type: 'close' })
          }
          renderDrawer={false}
          barClassName="legend-bar-panel"
        />
      </section>

      <section className="panel-section panel-islands">
        <h3 className="panel-head">Shared Islands</h3>
        {islands.length === 0 ? (
          <p className="panel-empty">No shared islands. (Set <code>?buildings=off</code> to draw them on the map instead.)</p>
        ) : (
          <div className="shared-islands-list">
            {islands.map((s) => (
              <div
                key={s.id}
                className="shared-island-slot"
                ref={(el) => {
                  if (el) islandRefs.current.set(s.id, el);
                  else islandRefs.current.delete(s.id);
                }}
              >
                <SharedIslandCard
                  story={s}
                  hidden={hidden}
                  builds={builds}
                  now={now}
                  highlighted={s.id === highlightId}
                  substrateMode={substrateMode}
                  substrateTuning={substrateTuning}
                  onSelect={() => onSelectIsland(s.id)}
                />
                <button
                  type="button"
                  className={`shared-island-detail-toggle${openIslandId === s.id ? ' on' : ''}`}
                  aria-expanded={openIslandId === s.id}
                  onClick={() => dispatch({ type: 'toggle', key: `island:${s.id}` })}
                >
                  {s.id} · details
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The ONE right-flyout (a self-contained box anchored to the panel's right edge): either
          the open legend row's drawer body, or the open shared island's detail. */}
      {flyout.open && (legendOpen || openIsland) && (
        <div className="panel-flyout" role="dialog" aria-label="panel detail">
          {legendOpen ? (
            <>
              <div className="panel-flyout-head">{legendRowLabel(legendOpen)}</div>
              <LegendDrawerBody
                rowKey={legendOpen}
                model={model}
                hidden={hidden}
                onToggleStatus={onToggleStatus}
              />
            </>
          ) : openIsland ? (
            <div className="panel-flyout-island">
              <div className="panel-flyout-head">{openIsland.id}</div>
              <p className="panel-flyout-title">{openIsland.title}</p>
              <p className="panel-flyout-meta">
                {openIsland.status ?? 'unknown'} · {openIsland.capabilities.length} capabilities
              </p>
              {openIsland.outcome && <p className="panel-flyout-outcome">{openIsland.outcome}</p>}
              <button
                type="button"
                className="panel-flyout-open"
                onClick={() => onSelectIsland(openIsland.id)}
              >
                Open in side panel →
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StoryTree({
  territory: t,
  hidden,
  now,
}: {
  territory: Territory;
  hidden: ReadonlySet<string>;
  now: Date;
}): React.JSX.Element {
  const story = t.story;
  const st = story.status ?? 'unknown';
  const caps = story.capabilities.length;
  const withered = st === 'unhealthy';
  // The recently-landed bloom (ADR-0045): only a PASS within the window blooms,
  // and never on a withered crown (the rare authored-unhealthy-over-a-pass
  // disagreement renders the result, not a green announcement).
  const bloom = withered ? null : verdictBloom(story.verdict, now);
  // The not-yet-full form: a small tree in the status hue. `proposed` hasn't earned
  // full growth, and a claimed-but-empty story (zero capabilities) renders the SAME
  // small form rather than a distinct sapling stage (owner 2026-06-21 — the sapling
  // state was visually identical to a zero-cap proposed tree, so it was folded in).
  const young = !withered && (st === 'proposed' || caps === 0);
  const R = crownRadius(caps) * (young ? 0.62 : 1);
  const cy = -1.65 * R;
  const verdictNote = story.verdict
    ? ` · UAT ${verdictPhrase(story.verdict)}`
    : story.uatWitness === 'human'
      ? ' · UAT awaiting its human witness'
      : '';

  // Deterministic per-blob jitter so the five islands' trees aren't clones.
  const jb = (
    i: number,
    bcx: number,
    bcy: number,
    br: number,
  ): { cx: number; cy: number; r: number } => {
    const k = hash(`${story.id}:crown:${i}`);
    return {
      cx: bcx + (rand01(k) - 0.5) * 0.12 * R,
      cy: bcy + (rand01(k + 1) - 0.5) * 0.1 * R,
      r: br * (0.94 + rand01(k + 2) * 0.12),
    };
  };
  const base = [
    { cx: 0, cy, r: R }, // the central blob is never jittered
    jb(1, -0.62 * R, cy + 0.3 * R, 0.62 * R),
    jb(2, 0.62 * R, cy + 0.3 * R, 0.62 * R),
    jb(3, -0.4 * R, cy - 0.52 * R, 0.55 * R),
    jb(4, 0.42 * R, cy - 0.5 * R, 0.57 * R),
  ];
  const highlights = [
    jb(5, -0.15 * R, cy - 0.3 * R, 0.6 * R),
    jb(6, -0.55 * R, cy - 0.05 * R, 0.38 * R),
    jb(7, 0.3 * R, cy - 0.55 * R, 0.36 * R),
  ];
  const trunkD = `M -3.6 0 C -3.2 ${(0.3 * cy).toFixed(1)}, -2.4 ${(0.65 * cy).toFixed(1)}, -2.2 ${cy.toFixed(1)} L 2.2 ${cy.toFixed(1)} C 2.4 ${(0.65 * cy).toFixed(1)}, 3.2 ${(0.3 * cy).toFixed(1)}, 3.6 0 Q 0 2.4 -3.6 0 Z`;
  const bareBranches = [
    `M 0 ${(-1.65 * R).toFixed(1)} C 2 ${(-2.07 * R).toFixed(1)}, 1 ${(-2.36 * R).toFixed(1)}, ${(0.21 * R).toFixed(1)} ${(-2.64 * R).toFixed(1)}`,
    `M ${(0.12 * R).toFixed(1)} ${(-2.29 * R).toFixed(1)} L ${(0.32 * R).toFixed(1)} ${(-2.43 * R).toFixed(1)}`,
    `M -4 ${(-1.79 * R).toFixed(1)} C -9 ${(-2.07 * R).toFixed(1)}, -8 ${(-2.25 * R).toFixed(1)}, ${(-0.46 * R).toFixed(1)} ${(-2.43 * R).toFixed(1)}`,
    `M ${(-0.31 * R).toFixed(1)} ${(-2.14 * R).toFixed(1)} L ${(-0.5 * R).toFixed(1)} ${(-2.18 * R).toFixed(1)}`,
  ];

  return (
    <g
      className={`story-tree st-${st}${hidden.has(st) ? ' is-filtered' : ''}`}
      transform={`translate(${t.treeSpot.x.toFixed(1)} ${t.treeSpot.y.toFixed(1)})`}
    >
      <title>{`${story.id} — ${story.error ? 'story spec error' : st}${verdictNote}`}</title>
      <ellipse
        className="flora-shadow"
        cx={2}
        cy={2}
        rx={(R * 0.78).toFixed(1)}
        ry={(R * 0.2).toFixed(1)}
      />
      {withered ? (
        <>
          <path className="story-trunk" d={trunkD} />
          <g className="crown-lo">
            <circle cx={0} cy={cy + 0.15 * R} r={0.78 * R} />
            <circle cx={-0.62 * R} cy={cy + 0.36 * R} r={0.49 * R} />
          </g>
          <g className="crown-hi" opacity={0.7}>
            <circle cx={-0.21 * R} cy={cy - 0.14 * R} r={0.32 * R} />
          </g>
          <g className="story-bare">
            {bareBranches.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          {[-14, -6, 8, 16].map((lx, i) => (
            <circle key={i} className="leaf-litter" cx={lx} cy={[-2, 1, -1, -4][i]} r={1.3} />
          ))}
        </>
      ) : (
        <>
          <path className="story-trunk" d={trunkD} />
          <g className="crown-lo">
            {base.map((b, i) => (
              <circle key={i} cx={b.cx.toFixed(1)} cy={b.cy.toFixed(1)} r={b.r.toFixed(1)} />
            ))}
          </g>
          <g className="crown-hi">
            {highlights.map((b, i) => (
              <circle key={i} cx={b.cx.toFixed(1)} cy={b.cy.toFixed(1)} r={b.r.toFixed(1)} />
            ))}
          </g>
        </>
      )}
      {bloom && (
        <LandingBloom
          unitId={story.id}
          bloom={bloom}
          cx={0}
          cy={cy}
          r={R * 1.18}
          kind="crown"
        />
      )}
      {story.uatWitness === 'human' && (
        <g
          className={`story-sign ${
            story.verdict ? `sign-witnessed verdict-${story.verdict.outcome}` : 'sign-blank'
          }`}
          transform={`translate(${(R * 0.7 + 9).toFixed(1)} 0)`}
        >
          <ellipse className="flora-shadow" cx={0.6} cy={0.8} rx={4} ry={1.6} />
          <rect x={-1.3} y={-15} width={2.6} height={15} rx={1.1} />
          <circle cy={-18} r={6.5} />
        </g>
      )}
    </g>
  );
}

/**
 * A capability as garden flora (ADR-0036 d.6b/d): a flower bed, berry bush or
 * sapling (hash-picked), tinted by the PROVEN status (worldStatus.ts): deep
 * green means the last signed run passed — the hue IS the verdict (ADR-0040),
 * so there is no ✓/✗ badge. A failed last run or authored `unhealthy` arrives
 * here as `unhealthy` and withers it to the matching dead silhouette; absence
 * of a verdict stays silent (the authored ladder under-claims).
 */
function GardenPlant({
  spot,
  hidden,
  now,
  onSelect,
}: {
  spot: CapSpot;
  hidden: ReadonlySet<string>;
  now: Date;
  onSelect: () => void;
}): React.JSX.Element {
  const { cap, x, y } = spot;
  const st = cap.status ?? 'unknown';
  const variant = hash(`${cap.id}:variant`) % 3;
  // The presented status already folds the verdict in (provenStatus) — the
  // flora only ever reads the world it was handed.
  const dead = st === 'unhealthy';
  // Recently-landed bloom (ADR-0045): a PASS within the window, never on a
  // withered plant — a smaller sparkle than the crown's, at the plant base.
  const bloom = dead ? null : verdictBloom(cap.verdict, now);
  const verdictNote = cap.verdict ? ` · ${verdictPhrase(cap.verdict)}` : '';

  let body: React.JSX.Element;
  if (dead && variant === 0) {
    // dead flower bed — shepherd's-crook stems, hanging dried heads, fallen petals
    body = (
      <g>
        <ellipse className="flora-bed" cx={0} cy={0.4} rx={8.5} ry={3} opacity={0.7} />
        <path
          className="flora-dead-stem"
          strokeWidth={1.2}
          d="M 0.5 0 C 0.6 -6 0.4 -10 2.6 -11.4 C 4.4 -12.4 5.8 -10.8 5.6 -9.2"
        />
        <circle className="flora-dead-head flora-dead-accent" cx={5.6} cy={-8.2} r={1.7} />
        <path
          className="flora-dead-stem"
          strokeWidth={1.1}
          d="M -3.5 0 C -4 -5 -4.5 -8.5 -2.5 -10 C -1 -11 0.5 -10 0.8 -8.4"
        />
        <circle className="flora-dead-head" cx={0.8} cy={-7.6} r={1.4} />
        <path className="flora-dead-stem" strokeWidth={1.1} d="M 4.2 0 L 4.8 -5.2 L 7.6 -7.4" />
        <circle className="leaf-litter" cx={-7} cy={-0.5} r={1} />
        <circle className="leaf-litter" cx={2.5} cy={1.2} r={1} />
        <circle className="leaf-litter" cx={6.5} cy={0.2} r={1} />
      </g>
    );
  } else if (dead && variant === 1) {
    // dead bush — bare twig skeleton, clinging dead leaves
    body = (
      <g>
        <path
          className="flora-dead-twig"
          strokeWidth={1.1}
          d="M 0 0 L -1 -4.5 M -1 -4.5 L -5 -8.5 M -1 -4.5 L 1.5 -9.5 M 1.5 -9.5 L 4.5 -11.5 M 1.5 -9.5 L 0.5 -12.5 M 0 -2.5 L 4 -6"
        />
        <circle className="leaf-litter flora-dead-accent" cx={-4.5} cy={-8} r={1.1} />
        <circle className="leaf-litter" cx={4} cy={-11} r={1.1} />
        <circle className="leaf-litter" cx={-2.5} cy={0.8} r={1} />
      </g>
    );
  } else if (dead) {
    // dead sapling — leaning bare whip, leaf-fall at the base
    body = (
      <g>
        <path
          className="flora-dead-twig"
          strokeWidth={1.4}
          d="M 0 0 C 0.4 -5 1.5 -9 3.5 -13 M 2 -8.5 L -1.5 -12 M 3 -11 L 6 -13.5"
        />
        <circle className="leaf-litter" cx={-3} cy={0.8} r={1} />
        <circle className="leaf-litter" cx={1.5} cy={1.4} r={1} />
        <circle className="leaf-litter flora-dead-accent" cx={5} cy={0.4} r={1} />
      </g>
    );
  } else if (variant === 0) {
    // flower bed — leaf blades, three stems, rosette centre bloom
    body = (
      <g>
        <ellipse className="flora-bed" cx={0} cy={0.4} rx={8.5} ry={3} />
        <path className="flora-dark" d="M -1 0 Q -7 -3 -9 -7 Q -4.5 -5.5 -1 0 Z" />
        <path className="flora-dark" d="M 1.5 0 Q 7.5 -2.5 9 -6 Q 5 -5 1.5 0 Z" />
        <path className="flora-stem" d="M -4 0 C -4.4 -4 -4.8 -7 -5.2 -10" />
        <path className="flora-stem" d="M 0 0 C 0.2 -5 0.3 -9 0.2 -13" />
        <path className="flora-stem" d="M 4 0 C 4.5 -4 5 -6.5 5.6 -9" />
        <circle className="flora-light" cx={-5.2} cy={-10} r={2.6} />
        <circle className="flora-light" cx={5.6} cy={-9} r={2.3} />
        {[0, 1, 2, 3, 4].map((k) => {
          const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
          return (
            <circle
              key={k}
              className="flora-light"
              cx={(0.2 + Math.cos(a) * 2.3).toFixed(1)}
              cy={(-13 + Math.sin(a) * 2.3).toFixed(1)}
              r={1.5}
            />
          );
        })}
        <circle className="flora-core" cx={0.2} cy={-13} r={1.3} />
      </g>
    );
  } else if (variant === 1) {
    // berry bush
    body = (
      <g>
        <polygon
          className="flora-dark"
          points="0,-12.5 5.5,-10.5 8.5,-5.5 7,-1 0,0.8 -7,-1 -8.5,-5.5 -5.5,-10.5"
        />
        <polygon
          className="flora-light"
          points="-1,-12.5 4.5,-10.8 6,-7 0.5,-5.6 -4.8,-7.4 -4.6,-10.6"
        />
        <circle className="flora-core" cx={-3.5} cy={-4.5} r={1.5} />
        <circle className="flora-core" cx={2} cy={-7.5} r={1.5} />
        <circle className="flora-core" cx={4.5} cy={-3.5} r={1.4} />
      </g>
    );
  } else {
    // sapling — echoes the central tree
    body = (
      <g>
        <path
          className="sapling-trunk"
          d="M -1.2 0 C -1 -4 -0.8 -7 -0.6 -9.5 L 0.9 -9.5 C 1 -7 1.2 -4 1.4 0 Z"
        />
        <polygon
          className="flora-dark"
          points="0,-18.5 5.4,-15.4 6.6,-10.2 3.4,-7.2 -3.4,-7.2 -6.6,-10.2 -5.4,-15.4"
        />
        <polygon className="flora-light" points="-0.6,-18.3 3.8,-15.8 3.4,-12 -1.6,-11.4 -4.4,-14.2" />
      </g>
    );
  }

  return (
    <g
      className={`garden-flora st-${st}${hidden.has(st) ? ' is-filtered' : ''}`}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <title>{`${cap.id} — ${cap.error ? 'spec error' : st}${verdictNote}`}</title>
      <circle className="flora-hit" r={9.5} fill="transparent" />
      {dead && <ellipse className="dead-ground" cx={0} cy={0.5} rx={8} ry={3.2} />}
      <ellipse className="flora-shadow" cx={1} cy={1} rx={dead ? 6 : 8} ry={dead ? 2.2 : 2.6} />
      {body}
      {bloom && <LandingBloom unitId={cap.id} bloom={bloom} cx={0} cy={-5} r={8} kind="plant" />}
    </g>
  );
}

function TerritoryFlora({
  territory: t,
  className,
  hidden,
  builds,
  now,
  onHover,
  onSelect,
  onStampClick,
}: {
  territory: Territory;
  className: string;
  hidden: ReadonlySet<string>;
  builds: BuildActivity[];
  now: Date;
  onHover: (on: boolean) => void;
  onSelect: (capId: string | null) => void;
  /** ADR-0088: clicking this island's bookshelf STAMP (a consumer marker) highlights the shared
   *  island it uses in the left panel. Absent in the panel's own one-island render. */
  onStampClick?: () => void;
}): React.JSX.Element {
  const story = t.story;
  const statusKey = story.status ?? 'unknown';
  // Nameplate box + anchors (owner ask 2026-06-22: bigger cards; building cards are landmarks).
  const plate = nameplateLayout(story.id.length, t.buildingGlyph);

  // Forest clumps: 2–3 small conifers per forest tile — deliberately small so
  // the central story tree is the only thing over ~25px on an island.
  // Draw flora top-down by y so taller southern trees overlap correctly.
  const drawables: { y: number; el: React.JSX.Element }[] = [];
  t.decor.forEach((f) => {
    const count = 2 + (f.seed % 2);
    for (let i = 0; i < count; i++) {
      const a = rand01(f.seed + i * 7) * Math.PI * 2;
      const rr = rand01(f.seed + i * 13) * HEX_R * 0.55;
      const x = f.x + Math.cos(a) * rr;
      const y = f.y + Math.sin(a) * rr * 0.8 + 4;
      drawables.push({
        y,
        el: (
          <DecorTree key={`f:${f.seed}:${i}`} x={x} y={y} h={7 + rand01(f.seed + i) * 4} seed={f.seed + i} />
        ),
      });
    }
  });
  t.caps.forEach((spot) => {
    drawables.push({
      y: spot.y,
      el: (
        <GardenPlant
          key={`c:${spot.cap.id}`}
          spot={spot}
          hidden={hidden}
          now={now}
          onSelect={() => onSelect(spot.cap.id)}
        />
      ),
    });
  });
  drawables.push({
    y: t.treeSpot.y,
    el: <StoryTree key="story-tree" territory={t} hidden={hidden} now={now} />,
  });
  // ADR-0076 §2 / ADR-0088: a consumer of the library carries a small bookshelf BESIDE its tree
  // — the "this island uses the shared library" marker. The library itself lives in the left
  // Shared Islands panel now; clicking the stamp highlights it there.
  if (t.bookshelf && t.bookshelfSpot) {
    drawables.push({
      y: t.bookshelfSpot.y,
      el: (
        <StoryBookshelf
          key="story-bookshelf"
          territory={t}
          hidden={hidden}
          {...(onStampClick ? { onStampClick } : {})}
        />
      ),
    });
  }
  drawables.sort((a, b) => a.y - b.y);

  return (
    <g
      className={`hex-flora ${className}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={() => onSelect(null)}
    >
      {drawables.map((d) => d.el)}

      <g
        className={`world-plate${t.buildingGlyph ? ' is-building' : ''}`}
        transform={`translate(${t.centroid.x - plate.w / 2} ${t.labelY})`}
      >
        <title>{story.error ? `${story.id} — ${story.error}` : story.title}</title>
        <rect className="world-plate-bg" width={plate.w} height={plate.h} rx={plate.rx} />
        {/* ADR-0088: a bookshelf glyph WITHIN the nameplate, left of the name, marks this island
            AS a building (the shared library) in the Shared Islands PANEL (never on the map —
            `buildingGlyph` is only set by the panel's one-island render). Seated as a leading
            marker on the larger building plate. The look is owner-attested (ADR-0070). */}
        {t.buildingGlyph && (
          <g
            className="world-plate-building"
            transform={`translate(${plate.glyphX} ${plate.glyphY}) scale(${plate.glyphScale})`}
            aria-hidden="true"
          >
            <BookshelfGlyph seed={hash(`${story.id}:plate-shelf`)} />
          </g>
        )}
        <text className="world-plate-id" x={plate.w / 2} y={plate.idY} textAnchor="middle">
          {story.id}
        </text>
        <text className="world-plate-sub" x={plate.w / 2} y={plate.subY} textAnchor="middle">
          {story.error
            ? 'story spec error'
            : // No ✓/✗ here — the crown's hue and the signpost carry proof (ADR-0040);
              // precise verdict facts live in the tooltip and the panel.
              `${statusKey} · ${story.capabilities.length} caps`}
        </text>
      </g>

      {/* The orbiting layer is the HARNESS (ADR-0048 §5): a wisp orbits a story
          only while a leaf agent is mechanically building one of its units.
          Session presence no longer orbits — it lives in the dock / toolbar /
          panel ("who's planning work" is re-homed to a quieter form later). This
          is what makes the layer self-cleaning: no SessionEnd dependency, no 4 h
          zombie window, no nodes:[] dead-ends. */}
      <g transform={`translate(${t.centroid.x} ${t.centroid.y})`}>
        {/* In-flight BUILD wisps: a leaf agent is mechanically building this unit
            right now. Teal pulse, faster orbit, keyed by runId (its own identity).
            Informational — the tooltip carries the unit + run; clicking falls
            through to selecting the story. */}
        {builds.map((b) => {
          const phase = rand01(hash(b.runId)) * 360;
          return (
            <g key={`build:${b.runId}`} className="world-wisp band-building">
              <title>{`${b.unitId} — building (${b.tier}) · ${formatAge(b.at, now)} · run ${b.runId}`}</title>
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`${phase} 0 0`}
                to={`${phase + 360} 0 0`}
                dur="6s"
                repeatCount="indefinite"
              />
              <g transform={`translate(${t.radius * 0.72 + 10} 0)`}>
                <circle className="world-wisp-hit" r={12} fill="transparent" />
                <circle className="world-wisp-glow" r={6.5} />
                <circle className="world-wisp-dot" r={2.8} />
              </g>
            </g>
          );
        })}
      </g>
    </g>
  );
}

/**
 * The session dock — a small overlay in the world frame (the wisps' detail
 * surface). List mode shows EVERY active session, including the ones whose
 * declared nodes resolve to no loaded story (nodes:[] hook declarations) and so
 * orbit nowhere; detail mode shows one session's identity, work, anchors, and a
 * live-updating age/band (the `now` ticker re-renders it between polls).
 * Possibly-dead sessions no longer orbit as wisps (ADR-0041) but stay listed
 * here, parked after the live ones — the dock is the history/debugging surface
 * (a worktree deleted before SessionEnd leaves a row that can never be marked
 * done). Advisory like the wisps: a session that vanishes from the poll renders
 * an honest "no longer active" note rather than a stale card.
 */
function SessionDock({
  dock,
  sessions,
  anchors,
  now,
  storyForNode,
  onShowList,
  onShowDetail,
  onFocusStory,
  onClose,
}: {
  dock: SessionDockState;
  sessions: TreeSession[];
  anchors: ReadonlyMap<string, string[]>;
  now: Date;
  storyForNode: (node: string) => string | null;
  onShowList: () => void;
  onShowDetail: (sessionId: string) => void;
  onFocusStory: (storyId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const detail =
    dock.kind === 'detail' ? sessions.find((s) => s.sessionId === dock.id) : undefined;
  const { orbiting, parked } = splitSessions(sessions);
  const row = (s: TreeSession): React.JSX.Element => {
    const anchored = anchors.get(s.sessionId) ?? [];
    return (
      <button
        key={s.sessionId}
        type="button"
        className={`session-row${isOrbitingBand(s.band) ? '' : ' is-parked'}`}
        onClick={() => {
          onShowDetail(s.sessionId);
          // A row that maps to a territory also focuses it on the map.
          const first = anchored[0];
          if (first) onFocusStory(first);
        }}
      >
        <span className={`tree-session-band band-${s.band}`} title={s.band} />
        <code>{s.sessionId}</code>
        <span className="muted small">
          {formatAge(s.lastSeenAt, now)}
          {anchored.length === 0 ? ' · no territory' : ''}
        </span>
      </button>
    );
  };
  return (
    <div className="session-dock" role="dialog" aria-label="active sessions">
      <header>
        <h4>{dock.kind === 'list' ? `active sessions (${orbiting.length})` : 'session'}</h4>
        <button type="button" className="btn" onClick={onClose} aria-label="close sessions">
          ✕
        </button>
      </header>
      {dock.kind === 'list' ? (
        sessions.length === 0 ? (
          <p className="muted small">No active sessions right now.</p>
        ) : (
          <>
            {orbiting.map(row)}
            {parked.length > 0 && (
              <>
                <p className="session-parked-label muted small">
                  possibly dead — quiet ≥ 4 h, no longer orbiting
                </p>
                {parked.map(row)}
              </>
            )}
          </>
        )
      ) : detail ? (
        <div className="session-detail">
          <p className="session-detail-id">
            <span className={`tree-session-band band-${detail.band}`} title={detail.band} />
            <code>{detail.sessionId}</code>
          </p>
          <dl>
            <dt>state</dt>
            <dd>
              {detail.band} · last seen {formatAge(detail.lastSeenAt, now)} ago
            </dd>
            <dt>branch</dt>
            <dd>
              <code>{detail.branch}</code>
            </dd>
            <dt>working on</dt>
            <dd>{detail.workingOn}</dd>
            <dt>nodes</dt>
            <dd>
              {detail.nodes.length === 0 ? (
                <span className="muted">none declared — anchored to no territory</span>
              ) : (
                detail.nodes.map((n) => {
                  const owner = storyForNode(n);
                  return owner ? (
                    <button
                      key={n}
                      type="button"
                      className="tree-link"
                      onClick={() => onFocusStory(owner)}
                    >
                      {n}
                    </button>
                  ) : (
                    <code key={n} title="resolves to no loaded story">
                      {n}{' '}
                    </code>
                  );
                })
              )}
            </dd>
          </dl>
          <button type="button" className="tree-link" onClick={onShowList}>
            all sessions
          </button>
        </div>
      ) : (
        <div className="session-detail">
          <p className="muted small">This session is no longer active.</p>
          <button type="button" className="tree-link" onClick={onShowList}>
            all sessions
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One verdict, ADR-0033 d.3 vocabulary: ✓ proven / ✗ last run failed / – never built.
 * "Never built" is also what an OFFLINE session sees — glyphs are advisory and the
 * payload omits them when no live store answered.
 */
function VerdictLine({ verdict }: { verdict: TreeVerdict | undefined }): React.JSX.Element {
  if (!verdict) return <span className="muted">– never built</span>;
  const when = new Date(verdict.at).toLocaleString();
  return (
    <span className={verdict.outcome === 'pass' ? 'verdict-pass' : 'verdict-fail'}>
      {verdictPhrase(verdict)} · {when}
    </span>
  );
}

// The detail panel OVERLAYS the world from the right edge (the world never
// reflows or rescales when it opens or resizes) and is drag-resizable from its
// left edge — wide enough by default to fit a capability sub-DAG.
const PANEL_MIN = 360;
const PANEL_MAX = 960;
const PANEL_DEFAULT = 520;
const PANEL_W_KEY = 'st-tree-panel-w';

function savedPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_W_KEY));
  return Number.isFinite(saved) && saved >= PANEL_MIN ? Math.min(saved, PANEL_MAX) : PANEL_DEFAULT;
}

/**
 * The story detail's "UAT tests" table (ADR-0082 attestation-surface): each addressable UAT test
 * (parsed from the story's `## Story UAT` prose) as a row carrying TWO deliberately-distinct marks,
 * mirroring the CLI `uat list` / `storytree tree`:
 *  - PROVEN (✓/✗/–) — the SIGNED verdict in `events.verdict`, the REAL gate state that greens the
 *    story crown via the per-test AND-roll-up (ADR-0082 d.3). For a human/`either` test an admin has
 *    not yet proven, the ✓ is a clickable **"I saw it work"** button that signs an `operator-attested`
 *    verdict (ADR-0044 §4's in-UI signature, now a real green path) — the server stamps the signer
 *    from the verified identity and REFUSES a machine-witness test (a click is not a machine proof).
 *  - the VOUCH flag (⚑/⚐) — the lower-rigor `events.attestation` "I also eyeballed it" mark, kept
 *    intact; GREEN for a pass vouch, amber when an admin may add one, muted otherwise. A vouch is
 *    NOT a proof — it never greens the crown (ADR-0044 d.2/d.3).
 * Signing re-pulls this panel (the proven glyph) AND the world tree (the crown). Fetched per-story
 * on open; silently absent when the live store is down.
 */
function UatTestsSection({
  storyId,
  onCrownRefresh,
}: {
  storyId: string;
  onCrownRefresh: () => void;
}): React.JSX.Element | null {
  const { me } = useAppData();
  const isAdmin = me.role === 'admin';
  const [tests, setTests] = useState<UatTestRow[] | null>(null);
  const [storyUat, setStoryUat] = useState<'healthy' | 'unhealthy' | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const payload = await api.attestations(storyId);
      setTests(payload.tests);
      setStoryUat(payload.storyUat);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [storyId]);

  useEffect(() => {
    setTests(null);
    void load();
  }, [load]);

  // The lower-rigor VOUCH (events.attestation) — kept intact (ADR-0044 d.2): an "I also eyeballed it"
  // mark that NEVER greens the crown.
  const recordVouch = async (testId: string): Promise<void> => {
    setBusy(`vouch:${testId}`);
    try {
      await api.recordAttestation({ testId, outcome: 'pass' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // The "I saw it work" operator-attested VERDICT (events.verdict) — the higher-rigor signature that
  // greens the story crown (ADR-0082). Refreshes the per-test proven glyph AND re-pulls the world.
  const signVerdict = async (testId: string): Promise<void> => {
    setBusy(`sign:${testId}`);
    try {
      await api.signUat({ testId, outcome: 'pass' });
      await load();
      onCrownRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="muted small">UAT tests unavailable: {error}</p>;
  if (tests === null || tests.length === 0) return null; // loading, or a story with no parsed UAT tests

  return (
    <div className="uat-tests">
      <h4 className="tree-subdag-title">UAT tests ({tests.length})</h4>
      <table className="uat-table">
        <tbody>
          {tests.map((t) => {
            // PROVEN — the SIGNED verdict (events.verdict): the real gate state that greens the crown.
            const proven = t.proven; // 'pass' | 'fail' | undefined
            // An admin signs a human/`either` test not yet proven; a machine test refuses a click.
            const canSign = isAdmin && proven !== 'pass' && t.witness !== 'machine';
            const signBusy = busy === `sign:${t.id}`;
            // A faint ✓ INVITES the signature (signable); a solid ✓ / ✗ is the recorded verdict; – is
            // an un-provable-by-click (machine) or not-yet-proven test.
            const provenGlyph =
              proven === 'pass' ? '✓' : proven === 'fail' ? '✗' : canSign ? '✓' : '–';
            const provenTitle =
              proven === 'pass'
                ? 'PROVEN — a signed operator-attested verdict (greens the story crown when every test passes, ADR-0082)'
                : proven === 'fail'
                  ? 'a signed FAIL verdict for this test'
                  : canSign
                    ? 'I saw it work — sign an operator-attested verdict (a REAL gate verdict, not a vouch)'
                    : t.witness === 'machine'
                      ? 'awaiting a machine proof — a click cannot green a machine-witness test'
                      : 'not yet proven';

            // VOUCH — the existing lower-rigor events.attestation mark, intact.
            const mark = t.human ?? t.machine;
            const vouchState = mark ? mark.outcome : 'none'; // 'pass' | 'fail' | 'none'
            const canVouch = isAdmin && vouchState === 'none' && t.witness !== 'machine';
            const vouchBusy = busy === `vouch:${t.id}`;
            const who = mark
              ? mark.relayedBy
                ? `${mark.signer} · relayed by ${mark.relayedBy}`
                : mark.signer
              : null;
            const vouchTitle = mark
              ? `${mark.witness} vouch — ${mark.outcome}${who ? ` · ${who}` : ''}${mark.note ? ` · ${mark.note}` : ''}`
              : canVouch
                ? 'flag — record that you also eyeballed this (a vouch, NEVER a gate verdict)'
                : t.witness === 'machine'
                  ? 'awaiting a machine run'
                  : 'no vouch yet';

            return (
              <tr key={t.id} className="uat-row">
                {/* PROVEN — the signed verdict; a clickable "I saw it work" button when signable. */}
                <td className="uat-proven-cell">
                  <button
                    type="button"
                    className={`uat-proven proven-${proven ?? 'none'}${canSign ? ' is-signable' : ''}`}
                    disabled={!canSign || signBusy}
                    onClick={canSign ? () => void signVerdict(t.id) : undefined}
                    title={provenTitle}
                    aria-label={
                      proven
                        ? `${t.title}: ${proven === 'pass' ? 'proven' : 'failed'}`
                        : canSign
                          ? `I saw ${t.title} work — sign a verdict`
                          : `${t.title}: not proven`
                    }
                  >
                    {signBusy ? '…' : provenGlyph}
                  </button>
                </td>
                <td className="uat-test-cell">
                  <span className="uat-test-title">{t.title}</span>
                  {who && (
                    <span className="uat-test-who muted">
                      vouch: {mark?.witness} · {who}
                    </span>
                  )}
                </td>
                {/* VOUCH — the lower-rigor mark, intact. */}
                <td className="uat-flag-cell">
                  <button
                    type="button"
                    className={`uat-flag state-${vouchState}${canVouch ? ' is-clickable' : ''}`}
                    disabled={!canVouch || vouchBusy}
                    onClick={canVouch ? () => void recordVouch(t.id) : undefined}
                    title={vouchTitle}
                    aria-label={mark ? `${mark.witness} vouch: ${mark.outcome}` : `vouch ${t.title}`}
                  >
                    {vouchBusy ? '…' : mark ? '⚑' : '⚐'}
                  </button>
                </td>
                <td className="uat-witness-cell muted" title="who may attest this test">
                  {t.witness}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted attest-note">
        <strong>✓/✗/–</strong> = the SIGNED verdict (<code>events.verdict</code>), which greens the
        crown; <strong>⚑/⚐</strong> = the lower-rigor vouch (<code>events.attestation</code>), which
        never does (ADR-0082/ADR-0044).
        {storyUat !== undefined && (
          <>
            {' '}
            <span className={`uat-story-rollup rollup-${storyUat ?? 'none'}`}>
              Story UAT:{' '}
              {storyUat === 'healthy'
                ? 'GREEN — every test proven'
                : storyUat === 'unhealthy'
                  ? 'WITHERED — a proven test failed'
                  : 'unproven — not every test has a signed pass'}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/** Extract the 1-based ADR number from a Decisions doc id (`decisions/0017-slug.md` → 17), or null. */
export function adrNumberOf(docId: string): number | null {
  const m = /(?:^|\/)(\d{4})-/.exec(docId);
  return m ? Number(m[1]) : null;
}

/**
 * The story's "Relevant ADRs" (ADR-0037 §2 / ADR-0097 Layer 2): its `decisions:` ADR numbers resolved
 * against the loaded docs and LINKED to the Decisions-group Library docs. Tolerant — a number with no
 * matching doc renders as a plain `ADR-NNNN` label (never blanks the section). Renders nothing when the
 * story declares no decisions. Exported for the jsdom render test.
 */
export function RelevantAdrs({ decisions }: { decisions: number[] }): React.JSX.Element | null {
  const { docs } = useAppData();
  if (decisions.length === 0) return null;
  const byNum = new Map<number, DocMeta>();
  for (const d of docs) {
    if (d.group !== 'Decisions') continue;
    const n = adrNumberOf(d.id);
    if (n !== null) byNum.set(n, d);
  }
  return (
    <div className="tree-relevant-adrs">
      <h4 className="tree-subdag-title">Relevant ADRs ({decisions.length})</h4>
      <ul className="relevant-adrs small">
        {decisions.map((n) => {
          const doc = byNum.get(n);
          const label = `ADR-${String(n).padStart(4, '0')}`;
          return (
            <li key={n} className="relevant-adr">
              {doc ? (
                <a href={docHref(doc.id)}>
                  <code>{label}</code> {doc.title}
                  {doc.status && (
                    <span className={`adr-status-chip adr-${doc.status}`}> {doc.status}</span>
                  )}
                </a>
              ) : (
                <span className="muted">
                  <code>{label}</code> (no doc found)
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StoryPanel({
  story,
  stories,
  storyIds,
  sessions,
  now,
  selectedCap,
  hoverCap,
  hidden,
  onSelectCap,
  onHoverCap,
  onSelectSession,
  onCrownRefresh,
  onClose,
}: {
  story: TreeStory;
  stories: TreeStory[];
  storyIds: ReadonlySet<string>;
  sessions: TreeSession[];
  now: Date;
  selectedCap: string | null;
  hoverCap: string | null;
  hidden: ReadonlySet<string>;
  onSelectCap: (id: string | null) => void;
  onHoverCap: (id: string | null) => void;
  onSelectSession: (sessionId: string) => void;
  /** Re-pull the world tree after a per-test UAT verdict is signed, so the crown repaints. */
  onCrownRefresh: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const layout = useMemo(() => layoutSubdag(story), [story]);
  // The node's FULL declared connection set (ADR-0074 §4): outbound depends_on AND
  // the unioned/derived inbound — own consumed_by ∪ every story whose depends_on
  // names it. Resolved from the whole story list so the inverse is recovered (the
  // de-noised cli hub declares none of its own spokes). See lib/connectionSet.ts.
  const connections = useMemo(() => fullConnectionSet(stories, story.id), [stories, story.id]);
  const panelSessions = splitSessions(sessions);
  const sessionLine = (s: TreeSession): React.JSX.Element => (
    <p
      key={s.sessionId}
      className={`tree-session small${isOrbitingBand(s.band) ? '' : ' is-parked'}`}
    >
      <span className={`tree-session-band band-${s.band}`} title={s.band} />
      <button type="button" className="tree-link" onClick={() => onSelectSession(s.sessionId)}>
        <code>{s.sessionId}</code>
      </button>
      <span className="muted"> {formatAge(s.lastSeenAt, now)} · </span>
      {s.workingOn}
    </p>
  );
  const [panelW, setPanelW] = useState(savedPanelWidth);
  const [resizing, setResizing] = useState(false);
  const dragFrom = useRef<{ x: number; w: number } | null>(null);
  // The latest dragged width, read at pointerup — state can lag a render behind.
  const liveW = useRef(panelW);
  const clampW = (w: number): number =>
    Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.min(w, window.innerWidth - 220)));
  // A selectedCap can survive cross-story navigation (depends-on buttons) —
  // ignore ids that aren't in this story instead of dimming the whole sub-DAG.
  const rawFocus = hoverCap ?? selectedCap;
  const focusCap =
    rawFocus && story.capabilities.some((c) => c.id === rawFocus) ? rawFocus : null;
  const relations = useMemo(
    () => (focusCap ? relationsFor(story.capabilities, focusCap) : null),
    [story, focusCap],
  );
  const cap = selectedCap ? story.capabilities.find((c) => c.id === selectedCap) : undefined;
  const dependents = cap
    ? story.capabilities.filter((c) => c.dependsOn.includes(cap.id)).map((c) => c.id)
    : [];

  const capClass = (c: TreeCapability): string => {
    const cls = ['tree-card', 'sub-card', `st-${c.status ?? 'unknown'}`];
    if (hidden.has(c.status ?? 'unknown')) cls.push('is-filtered');
    if (focusCap && relations) {
      if (c.id === focusCap) cls.push('is-focus');
      else if (relations.ancestors.has(c.id)) cls.push('is-ancestor');
      else if (relations.descendants.has(c.id)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    if (c.id === selectedCap) cls.push('is-selected');
    return cls.join(' ');
  };

  const edgeClass = (e: { from: string; to: string }): string => {
    const cls = ['tree-edge'];
    if (focusCap && relations) {
      const anc = (id: string): boolean => id === focusCap || relations.ancestors.has(id);
      const desc = (id: string): boolean => id === focusCap || relations.descendants.has(id);
      if (relations.ancestors.has(e.from) && anc(e.to)) cls.push('is-ancestor');
      else if (relations.descendants.has(e.to) && desc(e.from)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    return cls.join(' ');
  };

  return (
    <aside
      className={`tree-detail${resizing ? ' is-resizing' : ''}`}
      style={{ width: panelW }}
    >
      <div
        className="tree-detail-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="resize detail panel (drag left to widen)"
        onPointerDown={(e) => {
          dragFrom.current = { x: e.clientX, w: panelW };
          setResizing(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // synthetic pointers (tests) have no active pointer to capture
          }
        }}
        onPointerMove={(e) => {
          const from = dragFrom.current;
          if (!from) return;
          liveW.current = clampW(from.w + (from.x - e.clientX));
          setPanelW(liveW.current);
        }}
        onPointerUp={() => {
          dragFrom.current = null;
          setResizing(false);
          localStorage.setItem(PANEL_W_KEY, String(liveW.current));
        }}
        onPointerCancel={() => {
          dragFrom.current = null;
          setResizing(false);
        }}
      />
      <header>
        <span className={`tree-badge st-${story.status ?? 'unknown'}`}>
          {story.status ?? 'unknown'}
        </span>
        <button type="button" className="btn" onClick={onClose} aria-label="close detail">
          ✕
        </button>
      </header>
      <h3>{story.id}</h3>
      <p className="tree-detail-title">{story.title}</p>
      {story.error && <p className="tree-detail-error">{story.error}</p>}
      {story.outcome && <p className="muted small">{story.outcome}</p>}
      <p className="small">
        <span className="muted">UAT verdict </span>
        <VerdictLine verdict={story.verdict} />
        <span className="muted"> · witness: {story.uatWitness}</span>
      </p>
      {/* The node's full two-way wiring (ADR-0074 §4): depends_on (outbound) AND
          consumed_by ∪ derived-inverse (inbound) — so a reader sees how the organism
          is wired without leaving the panel. */}
      <ConnectionsSection
        connections={connections}
        storyIds={storyIds}
        onNavigate={(d) => navigate(treeFocusHref(d))}
      />

      {/* The story's deciding ADRs (ADR-0037 §2), linked to the Decisions-group Library docs — the
          panel's "what governs this story" context (ADR-0097 Layer 2). */}
      <RelevantAdrs decisions={story.decisions ?? []} />

      {sessions.length > 0 && (
        <div className="tree-sessions">
          {/* The panel is a detail surface like the dock (ADR-0041): the count
              speaks live sessions only; parked (possibly-dead) rows stay listed
              after them — they no longer orbit the territory as wisps. */}
          <h4 className="tree-subdag-title">sessions here ({panelSessions.orbiting.length})</h4>
          {panelSessions.orbiting.map(sessionLine)}
          {panelSessions.parked.length > 0 && (
            <>
              <p className="session-parked-label muted small">
                possibly dead — quiet ≥ 4 h, no longer orbiting
              </p>
              {panelSessions.parked.map(sessionLine)}
            </>
          )}
        </div>
      )}

      <h4 className="tree-subdag-title">capabilities ({story.capabilities.length})</h4>
      <div className="tree-subdag-frame">
        <svg
          className="tree-subdag"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
        >
          {layout.edges.map((e) => (
            <path
              key={`${e.from}->${e.to}`}
              className={edgeClass(e)}
              d={e.d}
              markerEnd="url(#sub-arrow)"
            />
          ))}
          {layout.caps.map(({ cap: c, x, y }) => {
            const lines = idLines(c.id);
            return (
              <g
                key={c.id}
                className={capClass(c)}
                transform={`translate(${x} ${y})`}
                onMouseEnter={() => onHoverCap(c.id)}
                onMouseLeave={() => onHoverCap(null)}
                onClick={() => onSelectCap(selectedCap === c.id ? null : c.id)}
              >
                <title>{c.error ? `${c.id} — ${c.error}` : c.title}</title>
                <rect className="tree-card-bg" width={SUB_W} height={SUB_H} rx={7} />
                <path
                  className="tree-card-strip"
                  d={`M 0 ${SUB_STRIP} L 0 7 Q 0 0 7 0 L ${SUB_W - 7} 0 Q ${SUB_W} 0 ${SUB_W} 7 L ${SUB_W} ${SUB_STRIP} Z`}
                />
                <text className="tree-card-status" x={7} y={10}>
                  {c.error ? 'spec error' : (c.status ?? 'unknown')}
                </text>
                {c.verdict && (
                  <text className="tree-card-verdict" x={SUB_W - 6} y={10} textAnchor="end">
                    {c.verdict.outcome === 'pass' ? '✓' : '✗'}
                  </text>
                )}
                {lines.map((line, i) => (
                  <text
                    key={i}
                    className="tree-card-id"
                    x={SUB_W / 2}
                    y={SUB_STRIP + 13 + i * 12}
                    textAnchor="middle"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {cap && (
        <div className="tree-cap-detail">
          <header>
            <span className={`tree-badge st-${cap.status ?? 'unknown'}`}>
              {cap.status ?? 'unknown'}
            </span>
          </header>
          <h3>{cap.id}</h3>
          <p className="tree-detail-title">{cap.title}</p>
          {cap.error && <p className="tree-detail-error">{cap.error}</p>}
          {cap.outcome && <p className="muted small">{cap.outcome}</p>}
          <dl>
            <dt>verdict</dt>
            <dd>
              <VerdictLine verdict={cap.verdict} />
            </dd>
            {cap.proofMode && (
              <>
                <dt>proof mode</dt>
                <dd>{cap.proofMode}</dd>
              </>
            )}
            {cap.dependsOn.length > 0 && (
              <>
                <dt>depends on</dt>
                <dd>
                  {cap.dependsOn.map((d) => (
                    <button key={d} type="button" className="tree-link" onClick={() => onSelectCap(d)}>
                      {d}
                    </button>
                  ))}
                </dd>
              </>
            )}
            {dependents.length > 0 && (
              <>
                <dt>depended on by</dt>
                <dd>
                  {dependents.map((d) => (
                    <button key={d} type="button" className="tree-link" onClick={() => onSelectCap(d)}>
                      {d}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt>spec</dt>
            <dd>
              <code>{`stories/${story.id}/${cap.id}.md`}</code>
            </dd>
          </dl>
        </div>
      )}

      {/* The per-UAT-test attestation table sits near the FOOT of the drill-down (the last thing
          you read once you've taken in the story + its capability DAG) — a vouch surface, never
          the gate-green hue (ADR-0044). */}
      <UatTestsSection storyId={story.id} onCrownRefresh={onCrownRefresh} />

      {/* The UI-driven go-green control (ADR-0090 / ADR-0094) is the LAST thing in the panel (owner
          placement, 2026-06-22): a single affordance at the foot. A drilled-in capability targets a
          single-node `--live` build (its `buildable`). A story shows a STATUS-AWARE go-green
          affordance (ADR-0094): `proposed → Build` (whole-story `--real` drive), `mapped → Adopt`
          (observe-and-sign its `## Reliability Gates`, ADR-0085), or a reason when neither applies —
          never a fail-closed Build over a mature brownfield artifact. The control stays in the SAME
          spot whether you're viewing a story or a capability, and a no-affordance selection shows WHY
          in place rather than vanishing. */}
      <BuildSection
        unitId={cap ? cap.id : story.id}
        buildable={cap ? cap.buildable : story.storyBuildable}
        scope={cap ? 'node' : 'story'}
        goGreen={cap ? undefined : story.goGreen}
        adoptGates={cap ? undefined : story.adoptGates}
        adoption={cap ? undefined : story.adoption}
        status={cap ? undefined : story.status}
      />
    </aside>
  );
}
