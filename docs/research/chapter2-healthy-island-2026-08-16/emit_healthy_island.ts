/**
 * ONE island, emitted from a REAL STORY NODE in the live corpus — the surface everything else on
 * `chapter2-code-generated-organic-art-arc` is judged against.
 *
 * WHY THIS FILE EXISTS. Every appearance judgment on this arc so far (#1371 grass, #1372 hex lines,
 * #1373 dressing) was made against `fork-spike-island`: a SYNTHETIC fixture invented for the
 * interior-fork spike on 2026-08-15, carrying ten INVENTED capability statuses (healthy x3,
 * building x2, proposed x3, mapped x1, unhealthy x1) and invented test counts. That one fabricated
 * `unhealthy` capability is the charcoal region the owner circled on 2026-08-16, and it is roughly
 * 16% of the delivered land — so a made-up failure has been the loudest thing in every picture the
 * owner has been asked to look at. The owner's instruction: *"i think we focus on getting a healthy
 * island looking right"*, and *"which story node did you pick anyways"*.
 *
 * SO NOTHING HERE IS INVENTED. Every semantic input is read from the repo's own disk-canonical work
 * hierarchy (`stories/**`, ADR-0002 / ADR-0039) through the SAME parser the studio's tree walk uses
 * (`loadNodeSpec` from `@storytree/orchestrator`), and every PROOF input comes from the live store
 * through `proof.json` (`emit_proof.ts`).
 *
 *     capability count   <- the story spec's `capabilities:` frontmatter list
 *     capability status  <- `provenStatus(authored, signed verdict)`, NOT the authored frontmatter
 *     test count         <- `spec.contracts.length`, i.e. the `## Contracts` section
 *                           (apps/studio/server/apiRouter.ts: `testCount: spec.contracts.length`)
 *     UAT criteria       <- `parseUatTestCriteria`, witnessable legs only (`wouldBe` filtered out),
 *                           exactly as `readTree` builds `uatCriteriaByStory`
 *     UAT verdict        <- `rollupCriterionStatus` over the live store's verdict events:
 *                           signed pass => proven, signed fail => failing, else pending
 *
 * THE STATUS IS THE PROVEN ONE AND THIS IS THE LOAD-BEARING CORRECTION. Reading each capability's
 * authored `status:` frontmatter and calling that "the real status" would have produced a brown
 * island and a false report, because **NOT ONE capability in the whole corpus is authored
 * `healthy`** — 0 of 244. Green derives from a SIGNED VERDICT and never from authored paint
 * (ADR-0040), so the island's tint reads `proof.json`'s `renderedStatus` and this file refuses to
 * run without it. `census_healthy.ts` is the whole-corpus evidence, and `verify.py` check 2 holds
 * the fold honest against `apps/studio/src/lib/worldStatus.ts` itself.
 *
 * `verify.py` check 1 re-derives the statuses and asserts that NO status outside the corpus's own
 * `Status` enum reaches the island, that every one is backed by a signed verdict or an authored
 * spec, and that the emitted list matches disk + store. That is the increment's actual proof
 * obligation: not "a healthy island was rendered" but "nothing on this island was made up".
 *
 * THE GEOMETRY IS THE SIBLING SPIKE'S, INVOKED NOT COPIED. `smoothCoast`, `buildRelaxedCells`,
 * `hexCenter`/`hexCorners`, `unprojectGround`, `hash`/`rand01` are imported from
 * `packages/forest-world/src` exactly as `chapter2-land-interior-fork-2026-08-15/emit_island.ts`
 * imports them, so there is no second copy of the island to drift. This file's ONE addition is the
 * tile-claim loop, which the fork wrote out by hand for its 17 invented hexes: a real story's
 * territory is `max(3, capabilities + 2)` tiles (apps/studio/src/components/TreeView.tsx: `const
 * quotas = stories.map((s) => Math.max(3, s.capabilities.length + 2))`) grown from a seed by the
 * app's own frontier rule, so the island's OUTLINE is a function of the real story id rather than of
 * a hand-written list. See `growTiles` for exactly what is reproduced and what is not.
 *
 * THE CAMERA IS A NAMED PARAMETER (`--elev`, default 50). `LAND_CAMERA_ELEVATION_DEG` in
 * `packages/forest-world/src/camera.ts` IS STILL 20 AND IS NOT TOUCHED — it is
 * `frontend-visual-judgment-arc`'s live dogfood fixture (owner, 2026-08-15). 50 degrees is the
 * research track's authoring angle (owner look verdict 2026-08-16: *"50 degrees looks good, i think
 * we go with this"*), which settles the RESEARCH TRACK and does not move the app's constant.
 *
 * Run:  npx tsx docs/research/chapter2-healthy-island-2026-08-16/emit_healthy_island.ts \
 *         --story <story-id> [--elev 50] [--out island.json]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LAND_CAMERA_ELEVATION_DEG,
  groundFlattening,
  unprojectGround,
} from '../../../packages/forest-world/src/camera.js';
import { smoothCoast, type BoundarySeg } from '../../../packages/forest-world/src/coast.js';
import {
  HEX_R,
  HEX_W,
  TILE_DEPTH_WORLD,
  AXIAL_DIRS,
  axialKey,
  hexCenter,
  hexCorners,
  hexDist,
  type Axial,
  type Pt,
} from '../../../packages/forest-world/src/hex.js';
import { hash, rand01 } from '../../../packages/forest-world/src/rng.js';
import { buildRelaxedCells, type DrawTile } from '../../../packages/forest-world/src/substrate.js';
import { loadNodeSpec, type NodeSpec } from '../../../packages/orchestrator/src/node-spec.js';

import { asciiJson } from './ascii_json.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

/** The research track's authoring angle. A PARAMETER — see the header. */
const PASS_ELEVATION_DEG = 50;

// ------------------------------------------------------------------ arguments

const ARGV = process.argv.slice(2);
const argOf = (name: string, fallback: string): string => {
  const i = ARGV.indexOf(name);
  const v = i >= 0 ? ARGV[i + 1] : undefined;
  return v === undefined ? fallback : v;
};
const STORY_ID = argOf('--story', '');
if (!STORY_ID) throw new Error('--story <story-id> is required — this island is a REAL story node');
const CAMERA_DEG = Number(argOf('--elev', String(PASS_ELEVATION_DEG)));
if (!Number.isFinite(CAMERA_DEG) || CAMERA_DEG <= 0 || CAMERA_DEG >= 90) {
  throw new Error(`--elev must be an angle in (0, 90) degrees, got ${argOf('--elev', '')}`);
}
const OUT_PATH = argOf('--out', join(HERE, 'island.json'));

// ------------------------------------------------------------------ the REAL story, from disk

const STORY_DIR = join(REPO, 'stories', STORY_ID);
if (!existsSync(STORY_DIR)) {
  const available = readdirSync(join(REPO, 'stories'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  throw new Error(
    `no story directory at stories/${STORY_ID} — this island may not be invented. Available: ${available.join(', ')}`,
  );
}

/** The story spec itself — `stories/<id>/<id>.md` or `stories/<id>/story.md`, whichever exists. */
function loadStorySpec(): NodeSpec {
  for (const name of [`${STORY_ID}.md`, 'story.md', 'index.md']) {
    const f = join(STORY_DIR, name);
    if (existsSync(f)) {
      const spec = loadNodeSpec(f);
      if (spec.tier === 'story') return spec;
    }
  }
  // fall back to a scan: the one spec in the directory declaring tier `story`
  for (const e of readdirSync(STORY_DIR)) {
    if (!e.endsWith('.md')) continue;
    try {
      const spec = loadNodeSpec(join(STORY_DIR, e));
      if (spec.tier === 'story') return spec;
    } catch {
      /* a capability spec that fails to parse is reported below, not here */
    }
  }
  throw new Error(`stories/${STORY_ID} carries no spec declaring tier: story`);
}

const storySpec = loadStorySpec();

// ------------------------------------------------------------------ the PROOF, from the live store

/**
 * `proof.json` — what the store says, folded through the app's own `provenStatus`. REQUIRED, and
 * required to be for THIS story: the alternative (falling back to authored frontmatter) is exactly
 * the failure mode that would silently reintroduce a fixture, because authored frontmatter is never
 * green.
 */
interface ProofCapability {
  id: string;
  title: string;
  authoredStatus: string;
  verdictGlyph: string;
  verdictOutcome: string | null;
  renderedStatus: string;
  tests: number;
}
interface ProofDoc {
  storyId: string;
  readAt: string;
  verdictEventsRead: number;
  capabilities: ProofCapability[];
  uatCriteria: { id: string; revisionId: string; witness: string | null; state: string }[];
}
const PROOF_PATH = argOf('--proof', join(HERE, 'proof.json'));
if (!existsSync(PROOF_PATH)) {
  throw new Error(
    `${PROOF_PATH} is missing. Run:\n  npx tsx ${'docs/research/chapter2-healthy-island-2026-08-16/emit_proof.ts'} --story ${STORY_ID}\n` +
      `This pass may NOT fall back to authored frontmatter: 0 of 244 capabilities in the corpus are ` +
      `authored 'healthy', because green derives from a signed verdict (ADR-0040).`,
  );
}
const proof = JSON.parse(readFileSync(PROOF_PATH, 'utf8')) as ProofDoc;
if (proof.storyId !== STORY_ID) {
  throw new Error(
    `${PROOF_PATH} holds proof for '${proof.storyId}' but this island is '${STORY_ID}' — a picture ` +
      `whose tint came from another story's verdicts is exactly the caption-does-not-match-pixels ` +
      `failure the track's provenance sidecars exist for. Refusing.`,
  );
}

/**
 * The capabilities, cross-checked between disk and store rather than taken from either alone. A
 * missing spec file is a REFUSAL, never a defaulted `unknown` — a defaulted status is the invented
 * data this whole increment exists to remove.
 */
interface RealCapability {
  id: string;
  /** WHAT THE MAP DRAWS: `provenStatus(authored, verdict)`, from `proof.json`. */
  status: string;
  authoredStatus: string;
  verdictGlyph: string;
  /** `spec.contracts.length` — the app's own `testCount`. */
  tests: number;
  title: string;
}
const capabilities: RealCapability[] = storySpec.capabilities.map((capId) => {
  const file = join(STORY_DIR, `${capId}.md`);
  if (!existsSync(file)) {
    throw new Error(
      `stories/${STORY_ID}/${capId}.md is missing — refusing to default its status, because a ` +
        `defaulted status is the invented data this pass exists to remove`,
    );
  }
  const spec = loadNodeSpec(file);
  const p = proof.capabilities.find((c) => c.id === capId);
  if (!p) throw new Error(`proof.json carries no entry for capability ${capId}`);
  if (p.authoredStatus !== spec.status || p.tests !== spec.contracts.length) {
    throw new Error(
      `proof.json disagrees with stories/${STORY_ID}/${capId}.md — proof says ` +
        `status=${p.authoredStatus} tests=${p.tests}, disk says status=${spec.status} ` +
        `tests=${spec.contracts.length}. Re-run emit_proof.ts; the two must be read at one state.`,
    );
  }
  return {
    id: capId,
    status: p.renderedStatus,
    authoredStatus: spec.status,
    verdictGlyph: p.verdictGlyph,
    tests: spec.contracts.length,
    title: spec.title,
  };
});
if (!capabilities.length) throw new Error(`story ${STORY_ID} declares no capabilities`);

/**
 * The witnessable UAT test criteria, filtered exactly as `readTree` filters them: `wouldBe` legs are
 * aspirational and are not green-blocking, so they are not part of the marker walk either. Their
 * VERDICT is `proof.json`'s — `rollupCriterionStatus` over the store's signed verdicts.
 */
const uatCriteria = storySpec.uatTestCriteria
  .filter((t) => !t.wouldBe)
  .map((t) => {
    const p = proof.uatCriteria.find((u) => u.id === t.criterionId);
    if (!p) throw new Error(`proof.json carries no state for UAT criterion ${t.criterionId}`);
    return { id: t.criterionId, revisionId: t.revisionId, witness: p.witness, state: p.state };
  });

// ------------------------------------------------------------------ the territory

/**
 * The claimed hexes — the app's own quota and its own frontier growth rule, for ONE island.
 *
 * QUOTA: `Math.max(3, capabilities.length + 2)`, verbatim from `TreeView.tsx`.
 *
 * GROWTH: the app grows every territory round-robin, each story claiming its cheapest frontier hex —
 * `hexDist(seed, cand) + rand01(hash(`${story.id}:${key}`)) * 1.4` — until its quota is met. That
 * cost function is reproduced here EXACTLY, including the hash address, so this island's outline is
 * the outline the real story would take.
 *
 * WHAT IS NOT REPRODUCED, stated rather than hidden: the app's loop is a MULTI-island packer. Other
 * territories own hexes (`owner.has(key)` skips them) and the seeds are nudged apart by a growth
 * floor, so on the real map a story's shape is also a function of its NEIGHBOURS. A single-island
 * research surface has no neighbours by construction, so this grows from the origin into empty
 * ground. The consequence: this island is the story's UNCONTESTED shape, which may be rounder than
 * the shape it takes on a crowded map. That is a property of rendering one island alone, not of the
 * data being wrong, and it is the same simplification the interior fork made by writing its tiles out
 * by hand — with the difference that the outline here still varies with the story id.
 */
function growTiles(quota: number): Axial[] {
  const seed: Axial = { q: 0, r: 0 };
  const owner = new Set<string>([axialKey(seed)]);
  const mine: Axial[] = [seed];
  while (mine.length < quota) {
    let best: Axial | null = null;
    let bestCost = Infinity;
    for (const t of mine) {
      for (const d of AXIAL_DIRS) {
        const cand = { q: t.q + d.q, r: t.r + d.r };
        const key = axialKey(cand);
        if (owner.has(key)) continue;
        const cost = hexDist(seed, cand) + rand01(hash(`${STORY_ID}:${key}`)) * 1.4;
        if (cost < bestCost) {
          bestCost = cost;
          best = cand;
        }
      }
    }
    if (!best) break;
    owner.add(axialKey(best));
    mine.push(best);
  }
  return mine;
}

const QUOTA = Math.max(3, capabilities.length + 2);
const TILES = growTiles(QUOTA);
if (TILES.length !== QUOTA) {
  throw new Error(`grew ${TILES.length} tiles for a quota of ${QUOTA}`);
}

const SIN = groundFlattening(CAMERA_DEG);
const cos = (d: number): number => Math.cos((d * Math.PI) / 180);

/** GROUND-plane hex centre — `hexCenter` with the projection undone. */
function groundCenter(h: Axial): Pt {
  return { x: HEX_W * (h.q + h.r / 2), y: 1.5 * HEX_R * h.r };
}

/** GROUND-plane hex corners: the same six offsets, unflattened. */
function groundCorners(c: Pt): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push({ x: c.x + HEX_R * Math.cos(a), y: c.y + HEX_R * Math.sin(a) });
  }
  return pts;
}

const centroid = (poly: Pt[]): Pt => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

/** Shoelace area, unsigned. */
function areaOf(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * A cell's SHAPE identity in the GROUND plane — the interior fork's, unchanged: the polygon
 * translated to its own centroid, rounded to 0.05, with its vertex ring rotated to a canonical
 * start. Two cells share a key exactly when one is a translation of the other, which is the only
 * equivalence a finite rendered tile set can exploit (a sprite at a fixed camera may be moved, never
 * turned).
 */
function shapeKey(poly: Pt[]): string {
  const c = centroid(poly);
  const rel = poly.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const fmt = (p: Pt): string =>
    `${(Math.round(p.x * 20) / 20).toFixed(2)},${(Math.round(p.y * 20) / 20).toFixed(2)}`;
  const rings: string[] = [];
  for (let s = 0; s < rel.length; s++) {
    rings.push(rel.map((_, i) => fmt(rel[(s + i) % rel.length]!)).join(' '));
  }
  rings.sort();
  return rings[0]!;
}

// ------------------------------------------------------------------ the coast

const keySet = new Set(TILES.map(axialKey));
const drawTiles: DrawTile[] = TILES.map((h) => ({ h, owner: 0 }));

/** Every claimed tile edge whose neighbour is foreign soil — SCREEN space, because `smoothCoast`
 *  and the app's coast both work there. Hashed off the REAL story id, so the shore is this story's. */
const segs: BoundarySeg[] = [];
for (const h of TILES) {
  const c = hexCenter(h);
  const corners = hexCorners(c.x, c.y, HEX_R);
  for (let i = 0; i < 6; i++) {
    const n = AXIAL_DIRS[i]!;
    if (keySet.has(axialKey({ q: h.q + n.q, r: h.r + n.r }))) continue;
    const a = corners[i]!;
    const b = corners[(i + 1) % 6]!;
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
}
const coast = smoothCoast(segs, STORY_ID);
const coastLoopScreen = coast.loops[0] ?? [];
const coastLoopGround = coastLoopScreen.map((p) => unprojectGround(p));

// ------------------------------------------------------------------ the capability partition

/**
 * One Voronoi seed per REAL capability, addressed by its CAPABILITY ID rather than by an index.
 *
 * The app seeds each parcel at its capability's laid-out position inside the territory
 * (`capToParcel`: `seed: { x: spot.x, y: spot.y }`), which comes from a layout this single-island
 * surface does not run. So the seed is scattered deterministically over the claimed tiles instead —
 * the interior fork's construction — but keyed off the capability's own id, which is the app's own
 * idiom for anything parcel-shaped (`parcelTheme(capId)`: *"hashed from the capId ... so a given cap
 * always surfaces the same country"*). The consequence worth stating: a capability keeps its patch
 * across re-runs and across camera angles, and adding a capability does not reshuffle the others'
 * seeds — only the tile quota, which genuinely does grow.
 */
const capSeeds: Pt[] = capabilities.map((cap) => {
  const h = TILES[hash(`${STORY_ID}:capseed:${cap.id}`) % TILES.length]!;
  const c = groundCenter(h);
  const a = rand01(hash(`${STORY_ID}:capang:${cap.id}`)) * Math.PI * 2;
  const rad = rand01(hash(`${STORY_ID}:caprad:${cap.id}`)) * HEX_R * 0.8;
  return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
});

/** Nearest capability seed — the cell's owner, and therefore its status tint. */
function capOf(p: Pt): number {
  let best = 0;
  let bd = Infinity;
  capSeeds.forEach((s, i) => {
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// ------------------------------------------------------------------ variant B: the shipped mesh

/** The wheat sets the app tints per territory — one deterministic subset of the claimed hexes. */
const wheatKeys = new Set(
  TILES.filter((h) => rand01(hash(`${STORY_ID}:wheat:${axialKey(h)}`)) < 0.22).map(axialKey),
);

const meshCellsScreen = buildRelaxedCells(drawTiles, [wheatKeys], 'mesh');

interface EmittedCell {
  poly: [number, number][];
  c: [number, number];
  shape: string;
  variant: number;
  wheat: boolean;
  cap: number;
}

const cellsB: EmittedCell[] = meshCellsScreen.map((rc) => {
  const g = rc.poly.map((p) => unprojectGround(p));
  const c = centroid(g);
  return {
    poly: g.map((p) => [p.x, p.y] as [number, number]),
    c: [c.x, c.y],
    shape: shapeKey(g),
    variant: rc.variant,
    wheat: rc.wheat,
    cap: capOf(c),
  };
});

// ------------------------------------------------------------------ variant A: the regular lattice

/**
 * Kept because the RENDERED LAND PIECES are indexed by it. `blender_land.py` renders one sprite per
 * variant-A shape class (six kites) plus the wall headings; variant B draws no interior piece at all
 * (`render-meta.json`: `variantBInteriorPieces: 0`) — its cells are flat status-tinted fills. So
 * variant A is not a fork being rendered here; it is the piece INDEX, and emitting it is what lets
 * this island reuse a committed piece set instead of re-running Blender.
 */
const cellsA: EmittedCell[] = [];
for (const h of TILES) {
  const c = groundCenter(h);
  const corners = groundCorners(c);
  const mids = corners.map((cor, i) => {
    const nxt = corners[(i + 1) % 6]!;
    return { x: (cor.x + nxt.x) / 2, y: (cor.y + nxt.y) / 2 };
  });
  const hkey = axialKey(h);
  const wheatHex = wheatKeys.has(hkey);
  for (let i = 0; i < 6; i++) {
    const poly = [c, mids[(i + 5) % 6]!, corners[i]!, mids[i]!];
    const cc = centroid(poly);
    cellsA.push({
      poly: poly.map((p) => [p.x, p.y] as [number, number]),
      c: [cc.x, cc.y],
      shape: shapeKey(poly),
      variant: hash(`lattice-cell:${hkey}:${i}`) % 3,
      wheat: wheatHex && rand01(hash(`lattice-wheat:${hkey}:${i}`)) < 0.7,
      cap: capOf(cc),
    });
  }
}

const classesA = [...new Set(cellsA.map((k) => k.shape))].sort();
const classesB = [...new Set(cellsB.map((k) => k.shape))].sort();
if (classesA.length !== 6) {
  throw new Error(`variant A must be a six-piece lattice; got ${classesA.length} distinct shapes`);
}

const pieceSet = classesA.map((key) => {
  const rep = cellsA.find((k) => k.shape === key)!;
  const c = rep.c;
  return {
    shape: key,
    poly: rep.poly.map(([x, y]) => [x - c[0], y - c[1]] as [number, number]),
    count: cellsA.filter((k) => k.shape === key).length,
  };
});

// ------------------------------------------------------------------ the coast walk (wall pieces)

const WALL_STEP = 11; // ground px per wall piece
const WALL_HEADINGS = 16; // the quantised OUTWARD-NORMAL set — 22.5 degrees apart
const islandCentre = centroid(coastLoopGround);
const wallPlacements: { c: [number, number]; heading: number }[] = [];
{
  let carry = 0;
  for (let i = 0; i < coastLoopGround.length; i++) {
    const a = coastLoopGround[i]!;
    const b = coastLoopGround[(i + 1) % coastLoopGround.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    let t = carry;
    while (t < len) {
      const p = { x: a.x + (dx / len) * t, y: a.y + (dy / len) * t };
      let nx = dy / len;
      let ny = -dx / len;
      if ((p.x - islandCentre.x) * nx + (p.y - islandCentre.y) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const ang = Math.atan2(ny, nx);
      const hIdx =
        ((Math.round((ang / (Math.PI * 2)) * WALL_HEADINGS) % WALL_HEADINGS) + WALL_HEADINGS) %
        WALL_HEADINGS;
      wallPlacements.push({ c: [p.x, p.y], heading: hIdx });
      t += WALL_STEP;
    }
    carry = t - len;
  }
}

// ------------------------------------------------------------------ the hex lattice, for the seam
//                                                                     detector

/**
 * The claimed hexes as GROUND polygons. `chapter2-hex-lines-and-flat-green-2026-08-16/seams.py`
 * needs them to register its hex-ring detector — and that detector is what makes "no hex tile is
 * stroked" a total accounting rather than a thing nobody found. Emitted HERE (from the same
 * `hexCorners` the mesh was interned from) rather than by a second script, so this island's lattice
 * cannot disagree with this island's cells.
 */
const hexTiles = TILES.map((h) => {
  const c = hexCenter(h);
  const corners = hexCorners(c.x, c.y, HEX_R).map((p) => unprojectGround(p));
  return { h, poly: corners.map((p) => [p.x, p.y] as [number, number]) };
});

// ------------------------------------------------------------------ write

const out = {
  /** Every deterministic choice keys off the REAL story id — there is no spike seed here. */
  seed: STORY_ID,
  storyId: STORY_ID,
  storyTitle: storySpec.title,
  storySource: `stories/${STORY_ID}/ — read through @storytree/orchestrator loadNodeSpec`,
  storyStatus: storySpec.status,
  uatWitness: storySpec.uatWitness ?? 'human (absent = human, ADR-0040)',
  camera: {
    elevationDeg: CAMERA_DEG,
    groundFlattening: SIN,
    uprightForeshortening: cos(CAMERA_DEG),
    source:
      `research-track authoring angle (owner look verdict 2026-08-16, "50 degrees looks good"). ` +
      `The app's LAND_CAMERA_ELEVATION_DEG is ${LAND_CAMERA_ELEVATION_DEG} and is NOT changed by ` +
      `this run — it is frontend-visual-judgment-arc's dogfood fixture. Ground geometry is ` +
      `decomposed at the app constant and re-projected here: a camera parameter, not a geometry one.`,
  },
  tileDepthWorld: TILE_DEPTH_WORLD,
  hexR: HEX_R,
  tiles: TILES,
  tileQuota: {
    quota: QUOTA,
    rule: 'Math.max(3, capabilities.length + 2) — apps/studio/src/components/TreeView.tsx',
    grownBy:
      "the app's own frontier rule: hexDist(seed, cand) + rand01(hash(`${storyId}:${key}`)) * 1.4",
  },
  /**
   * THE REAL STATUSES, as the map would draw them. `verify.py` check 1 re-derives these from disk +
   * store and refuses any mismatch; check 3 asserts none is outside the RENDERED vocabulary.
   */
  capStatuses: capabilities.map((c) => c.status),
  capabilities: capabilities.map((c, i) => ({
    index: i,
    id: c.id,
    title: c.title,
    status: c.status,
    authoredStatus: c.authoredStatus,
    verdictGlyph: c.verdictGlyph,
    tests: c.tests,
    testsSource: "spec.contracts.length (the `## Contracts` section) — the app's own testCount",
  })),
  statusSource:
    'provenStatus(authored, signed verdict) — apps/studio/src/lib/worldStatus.ts. Green is the ' +
    "verdict's, never authored paint (ADR-0040); `building` folds to `proposed` (ADR-0038) and " +
    '`unhealthy` folds to `mapped` (ADR-0296, owner-directed — the world draws no withered form).',
  proofRead: { at: proof.readAt, verdictEvents: proof.verdictEventsRead },
  uatCriteria,
  coastLoopGround: coastLoopGround.map((p) => [p.x, p.y]),
  islandCentreGround: [islandCentre.x, islandCentre.y],
  wall: { step: WALL_STEP, headings: WALL_HEADINGS, placements: wallPlacements },
  hexLattice: { tiles: hexTiles },
  variantA: {
    label: 'the piece INDEX (six-piece kite fan) — renders no interior piece for variant B',
    cells: cellsA,
    distinctShapes: classesA.length,
    pieceSet,
    meanCellArea:
      cellsA.reduce((s, k) => s + areaOf(k.poly.map(([x, y]) => ({ x, y }))), 0) / cellsA.length,
  },
  variantB: {
    label: 'shipped relaxed mesh (buildMeshCells, MESH_TUNING) — the settled b++ interior',
    cells: cellsB,
    distinctShapes: classesB.length,
    meanCellArea:
      cellsB.reduce((s, k) => s + areaOf(k.poly.map(([x, y]) => ({ x, y }))), 0) / cellsB.length,
  },
};

writeFileSync(OUT_PATH, `${asciiJson(out)}\n`);
const mix = [...new Set(capabilities.map((c) => c.status))]
  .map((s) => `${s} x${capabilities.filter((c) => c.status === s).length}`)
  .join(', ');
console.log(
  `${OUT_PATH}\n  story=${STORY_ID} (${storySpec.status})  camera=${CAMERA_DEG}deg  ` +
    `caps=${capabilities.length} [${mix}]  tests=[${capabilities.map((c) => c.tests).join(',')}]  ` +
    `uat=${uatCriteria.length}\n  tiles=${TILES.length} (quota ${QUOTA})  ` +
    `B: ${cellsB.length} cells / ${classesB.length} shapes  coast=${coastLoopGround.length} pts  ` +
    `walls=${wallPlacements.length} at ${WALL_HEADINGS} headings`,
);
