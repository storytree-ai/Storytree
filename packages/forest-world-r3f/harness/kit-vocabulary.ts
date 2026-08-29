// kit-vocabulary.ts — WHAT EACH BOUGHT PROP MEANS, and where on the island it stands.
//
// ⚠ THE VOCABULARY BELOW IS THE OWNER'S, SETTLED 2026-08-29, and it REPLACES the one PR #1693
// proposed under ADR-0463 D4's delegation. The delegation was to propose and be adjusted; this
// is the adjustment. It is recorded as ADR-0475 and the settled answer lives on
// `oq-a-whole-island-is-dressed-from-the-bought-kit-is-this-the`.
//
//   ONE OBJECT PER CAPABILITY. Its SPECIES and its LEAF TINT carry that capability's state. A
//   capability grows one thing however many contracts sit under it — DENSITY IS NOT A DESIGN
//   INPUT any more ("Lets not worry about density for now"). This replaces "one pine per
//   contract proven", which is why nothing here counts anything.
//
//     green pine ............... healthy / proven
//     yellow leaves ............ proposed or building
//     yellowish-brown leaves ... mapped
//     bare dead trunk .......... unhealthy
//     nothing at all ........... unknown
//     flower ................... a UAT criterion the owner signed by eye
//
// ⚠ ROCKS AND LOGS ARE WITHDRAWN — POCKETED, NOT DELETED. See {@link POCKETED_SIGNALS}. Drift and
// retired-contract get no rendered signal for now, deliberately, and re-proposing either as
// SCENERY is what ADR-0414 D1 forbids: they come back when they come back carrying their signal.
//
// ✅ ONE CONSEQUENCE WORTH NAMING. PR #1693 had to SUPPLY two of its six signals, because the
// harness fixture renders with no database and `check:verification-decay`'s drift never reaches
// it — so two props on that island were demonstrated rather than reported, and the file said so
// in a named place. Both of those props are the withdrawn ones. Every prop this vocabulary draws
// is now read off the SCENE, so there is nothing left to supply and no `DEMONSTRATED_SIGNALS`
// constant to keep honest.
//
// ⚠ AND WHAT THIS FILE IS NOT. It is `harness/`, the experiment surface, where ADR-0406 D1 says
// the island represents nothing and props are unfenced. Nothing here is adopted into `src/`;
// that is a separate, deliberate event (ADR-0380 D6 / ADR-0406 D2), and question (b) of the
// owner's own answer is NOT YET on purpose.

import type { SceneG } from '@storytree/forest-world';

import { groundCellsFrom } from './island-descriptors.js';
import { islandCapabilities, islandCriteria } from './island-fixture.js';
import type { IslandOptions } from './island-fixture.js';
import { LEAF_TINT_TOKEN } from './leaf-tint.js';
import { heightField, layoutCells } from './prop-layout.js';
import type { GPoint, LayoutCell } from './prop-layout.js';

/** The three things a bought prop can be on this island. */
export type KitRole = 'tree' | 'deadTree' | 'bloom';

export const KIT_ROLES: readonly KitRole[] = ['tree', 'deadTree', 'bloom'];

/**
 * WHAT EACH ROLE ASSERTS. One line each, and each one is a claim about the work rather than a
 * description of the object — which is the whole difference between signal and decoration
 * (ADR-0414 D1).
 *
 * ⚠ EVERY ENTRY IS `SCENE` NOW, and `kit-vocabulary.test.ts` asserts it. Under the previous
 * vocabulary two of six roles were read from numbers handed in, which was honest but was a
 * standing obligation: a prop drawn from a number nobody supplied is decoration wearing a
 * signal's name. Withdrawing those two roles discharges it.
 */
export const KIT_ROLE_SIGNAL = {
  tree: "SCENE — one tree per capability; its leaf tint is that capability's own state",
  deadTree: 'SCENE — this capability is unhealthy: the work stands, and it is standing dead wood',
  bloom: 'SCENE — a UAT criterion the owner has signed (ADR-0226 D4, one flower per criterion)',
} as const satisfies Record<KitRole, string>;

/**
 * THE TWO PROPS THAT ARE WITHDRAWN — recorded here so the withdrawal is a decision a reader can
 * find rather than an absence they have to infer.
 *
 * Owner, 2026-08-29: *"we keep it in the pocket to show something once we more mature and can
 * decide what that is, same with logs"*. So the shapes are not wrong, the SIGNALS are not
 * settled — and the correct move for an unsettled signal is no mark at all. The kit's `Rock_*`
 * and `Log_*` objects were dropped from the committed `.glb` with them, because an object
 * nothing places is pure wire cost (`kit-vocabulary.test.ts` refuses one); restoring either is
 * one edit to `export-dressing.py`'s KEEP argument and one entry here.
 *
 * ⚠⚠ AND THE ROCK'S ENTRY CORRECTS THE VOCABULARY IT REPLACES, WHICH HAD IT WRONG AGAINST THE
 * DECISION LOG. PR #1693 built the rock as DRIFT, citing ADR-0463 D4's delegation. ADR-0463
 * records that exact proposal being put to the owner on 2026-08-27 and REFUSED, on two grounds
 * that still bind: it duplicated an axis the map already draws (the tall-flower markers carry
 * per-criterion proof state, by FORM), and a rock is a durable thing and must not be an action
 * item — *"i like rocks as durable items, so i dislike the idea that its an action to clear
 * them"*. D6 then decided what a rock DOES carry: the declared shared seams a capability's code
 * actually rests against. So the meaning below is D6's, not the built vocabulary's, and anyone
 * bringing rocks back reads ADR-0463 D6 rather than restoring what was here.
 */
export const POCKETED_SIGNALS = {
  rock: 'foundations — the declared shared seams a capability rests against (ADR-0463 D6, and NOT drift, which that ADR records as refused)',
  log: 'a retired contract, cut and left where it fell (ADR-0438 anchors know what was retired)',
} as const;

/**
 * AN ASSEMBLY IS WHAT STANDS AT A POINT — one or more kit objects placed as a unit.
 *
 * ⚠ A PINE IS TWO OBJECTS, AND THEIR RELATIONSHIP IS THE KIT'S, NOT OURS. The kit models a
 * trunk and its needles as separate objects wearing different materials, CO-LOCATED in the
 * blend file, so the two are recentred and scaled TOGETHER by their joint bounding box.
 * Recentring each on its own base — the obvious reading of "put the object on the ground" —
 * drops the crown 0.70 units into the trunk, about 18% of the tree's height.
 *
 * The pairing is read off the kit's own world-space bounds and NOT off the names: PR #1693's
 * first attempt paired `Pine_Trunk_02` with `Pine_Leaves_04`, objects five units apart in the
 * blend that belong to different trees, and it rendered a perfectly plausible tree. The
 * 2026-08-29 re-export prints every kept object's world bounds beside the asset for exactly
 * this reason — `Pine_Trunk_01`/`Pine_Leaves_01` centres are 0.004 apart and
 * `Pine_Trunk_04`/`Pine_Leaves_04` 0.078, against 5+ for any cross pairing.
 */
export const KIT_ASSEMBLIES = {
  'pine-a': ['Pine_Trunk_01', 'Pine_Leaves_01'],
  'pine-b': ['Pine_Trunk_04', 'Pine_Leaves_04'],
  'pine-dead': ['Pine_Trunk_No_Leaves_01'],
  flower: ['Red_Flower_01'],
} as const satisfies Record<string, readonly string[]>;

export type KitAssembly = keyof typeof KIT_ASSEMBLIES;

/**
 * WHICH ASSEMBLIES SERVE EACH ROLE.
 *
 * ⚠ HAND-AUTHORED, UPSTREAM OF THE ASSET. A list derived from whatever the `.glb` happened to
 * contain would shrink silently with it, and a role whose objects all vanished would stop being
 * drawn AND stop being expected in the same instant
 * (`an-expectation-derived-from-its-subject-cannot-fail`). `kit-vocabulary.test.ts` checks these
 * names against the committed asset's own manifest in BOTH directions, so a missing object and a
 * paid-for byte that draws nothing are each a loud two-place mismatch.
 *
 * TWO pine assemblies rather than one, and that matters more than it did: a capability now grows
 * ONE tree, so an island of eleven identical trees would be eleven copies of one silhouette
 * rather than a forest. They alternate deterministically.
 */
export const KIT_ROLE_ASSEMBLIES = {
  tree: ['pine-a', 'pine-b'],
  deadTree: ['pine-dead'],
  bloom: ['flower'],
} as const satisfies Record<KitRole, readonly KitAssembly[]>;

/** Every kit object the vocabulary names, deduped — the manifest the asset is checked against. */
export function kitObjectNames(): string[] {
  const out = new Set<string>();
  for (const assemblies of Object.values(KIT_ROLE_ASSEMBLIES)) {
    for (const assembly of assemblies) for (const name of KIT_ASSEMBLIES[assembly]) out.add(name);
  }
  return [...out].sort();
}

/**
 * HOW BIG EACH ROLE IS, in ground units — and WHICH AXIS that number is about.
 *
 * ⚠⚠ SCALING A FLAT PROP BY ITS HEIGHT BLOWS UP ITS FOOTPRINT. `Red_Flower_01` is 0.98 units
 * wide and 0.60 tall in the kit; asking for a 5-unit-TALL bloom multiplied it by 8.3 and
 * delivered a flower 8.2 ground units across — as wide as a whole pine's canopy. A criterion
 * marker the size of a tree is the art asserting an importance the signal does not have. So a
 * TALL prop is sized by its height and a FLAT one by its width, and which is which is declared
 * rather than inferred.
 *
 * ⚠ READ AGAINST THE OBJECT FLOOR, NOT CHOSEN. Below about 10 delivered pixels an isolated mark
 * stops being an object and becomes speckle. Width does not foreshorten at this camera and
 * height does, by cos(50°) = 0.643 — so a height-sized prop needs 7.8 ground units to clear the
 * floor at the overview and a width-sized one needs 5.
 */
export const KIT_ROLE_SIZE = {
  tree: { axis: 'height', units: 18 },
  deadTree: { axis: 'height', units: 15 },
  bloom: { axis: 'width', units: 4 },
} as const satisfies Record<KitRole, { axis: 'height' | 'width'; units: number }>;

/** Ground units a HEIGHT-sized prop needs to clear the ~10px object floor at the overview. */
export const MIN_PROP_HEIGHT = 7.8;
/** Ground units a WIDTH-sized prop needs for the same, since width does not foreshorten. */
export const MIN_PROP_WIDTH = 5;

/** What this role delivers at a given zoom, in device pixels, along the axis it is sized by. */
export function deliveredRolePx(role: KitRole, pxPerUnit: number): number {
  const size = KIT_ROLE_SIZE[role];
  return size.axis === 'height' ? deliveredHeightPx(size.units, pxPerUnit) : size.units * pxPerUnit;
}

/** Does this role clear the object floor at the overview zoom? */
export function clearsObjectFloor(role: KitRole): boolean {
  const size = KIT_ROLE_SIZE[role];
  return size.units >= (size.axis === 'height' ? MIN_PROP_HEIGHT : MIN_PROP_WIDTH);
}

/** The camera elevation every land picture on this arc is taken at. */
export const RENDER_ELEV_DEG = 50;

/** What a prop of this world height delivers, in device pixels, at a given zoom. */
export function deliveredHeightPx(worldHeight: number, pxPerUnit: number): number {
  return worldHeight * Math.cos((RENDER_ELEV_DEG * Math.PI) / 180) * pxPerUnit;
}

// ------------------------------------------------------------------ what a state grows

/**
 * WHAT ONE CAPABILITY'S STATE GROWS: a role, and the leaf tint that role's crown wears.
 *
 * A `null` tint is not "no colour" — it is "this form carries the state without one": a green
 * pine is the kit's own needles and a bare dead trunk has no leaves at all.
 */
export interface StateForm {
  role: KitRole;
  /** The status whose declared leaf tint the crown wears, or `null` for an untinted form. */
  tint: string | null;
}

/**
 * THE VOCABULARY ITSELF — the whole of the owner's 2026-08-29 answer, as a function.
 *
 * `unknown` grows NOTHING, and it is the load-bearing entry: an island that drew a confident
 * tree for a capability whose state nobody has checked would be the art asserting a proof state
 * the work does not hold, which is the one way this arc can do real harm (ADR-0392 D5 /
 * ADR-0398 D7). It returns `null` rather than some quiet default for that reason.
 *
 * ⚠ AN UNRECOGNISED STATUS ALSO GROWS NOTHING. Failing closed here means a state this vocabulary
 * has never heard of is drawn as doubt rather than as whichever arm happened to be first.
 */
export function stateForm(status: string): StateForm | null {
  if (status === 'healthy') return { role: 'tree', tint: null };
  if (status === 'mapped' || status === 'proposed' || status === 'building') {
    return { role: 'tree', tint: status };
  }
  if (status === 'unhealthy') return { role: 'deadTree', tint: null };
  return null;
}

/** Every state the vocabulary draws something for, with the form it draws — the table a report
 *  prints and `kit-vocabulary.test.ts` holds against `LEAF_TINT_TOKEN`. */
export const VOCABULARY_STATES: readonly string[] = [
  'healthy',
  'mapped',
  'proposed',
  'building',
  'unhealthy',
  'unknown',
];

// ------------------------------------------------------------------ the facts a parcel carries

/**
 * THE ONE FACT ABOUT A CAPABILITY THAT DECIDES WHAT STANDS ON ITS PARCEL.
 *
 * ⚠ IT USED TO BE FOUR. `contracts`, `drift` and `retired` are gone because density is no longer
 * a design input and the two signals that read from numbers are withdrawn. Leaving them on the
 * interface would leave three fields nothing consults, which is how a reader concludes the
 * island still reports something it does not.
 */
export interface CapabilityFacts {
  capId: string;
  status: string;
}

/** Read each capability's state off the scene's own capability list. */
export function capabilityFacts(island: IslandOptions): CapabilityFacts[] {
  return islandCapabilities(island).map((cap) => ({ capId: cap.capId, status: String(cap.status) }));
}

// ------------------------------------------------------------------ where each prop stands

export interface KitPlacement {
  role: KitRole;
  /** Which assembly stands here — one or more kit objects, placed as a unit. */
  assembly: KitAssembly;
  /** The capability whose state put it here, or `story` for a whole-island signal. */
  capId: string;
  /** The status whose leaf tint this placement's crown wears, or `null` for an untinted form. */
  tint: string | null;
  at: GPoint;
  /** Ground height under the point, from the same relief field the land is built on. */
  y: number;
  /** Rotation about the vertical axis, radians. */
  yaw: number;
}

/**
 * A deterministic stream. `Math.random` is forbidden on this surface (ADR-0380 D6 fence 2), and
 * a scatter that moved between runs would present that movement as the direction.
 */
function rng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

/**
 * Candidate points inside a set of cells, sampled from THE CELLS THEMSELVES rather than from a
 * parcel outline.
 *
 * ⚠ WHY NOT `parcelLoop`. It throws for any parcel that is not one simple loop, and two of this
 * island's eleven are not. A capability silently missing its tree would be the island
 * under-reporting the work, which is worse here than a slightly less tidy point: this dressing's
 * whole claim is that every capability the map knows about is on it.
 *
 * A cell is a quadrilateral, so a point inside it is a bilinear sample, pulled toward the
 * centroid so nothing sits on an edge two parcels share — a tree straddling a boundary reads as
 * belonging to neither.
 */
function candidatePoints(cells: readonly LayoutCell[], count: number, seed: number): GPoint[] {
  if (cells.length === 0 || count <= 0) return [];
  const rand = rng(seed);
  const out: GPoint[] = [];
  for (let i = 0; i < count; i++) {
    const cell = cells[Math.floor(rand() * cells.length) % cells.length]!;
    const u = rand();
    const v = rand();
    const jitter = rand();
    const pts = cell.points;
    if (pts.length < 3) continue;
    const a = pts[0]!;
    const b = pts[1]!;
    const c = pts[2]!;
    const d = pts[3] ?? pts[0]!;
    const top = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    const bot = { x: d.x + (c.x - d.x) * u, z: d.z + (c.z - d.z) * u };
    const raw = { x: top.x + (bot.x - top.x) * v, z: top.z + (bot.z - top.z) * v };
    let cx = 0;
    let cz = 0;
    for (const p of pts) {
      cx += p.x;
      cz += p.z;
    }
    cx /= pts.length;
    cz /= pts.length;
    const pull = 0.18 + jitter * 0.12;
    out.push({ x: raw.x + (cx - raw.x) * pull, z: raw.z + (cz - raw.z) * pull });
  }
  return out;
}

/** One prop's ground footprint — the circle it occupies, which is what a neighbour is kept out of. */
export interface Occupancy {
  x: number;
  z: number;
  radius: number;
}

/** The ground WIDTH each role occupies, in ground units, keyed by role. */
export type RoleFootprints = Readonly<Record<KitRole, number>>;

/**
 * THE FOOTPRINTS THE COMMITTED ASSET DELIVERS, frozen at the 2026-08-29 re-export.
 *
 * ⚠ IT IS A CHECK ON A MEASUREMENT, NOT THE MEASUREMENT. `roleFootprints` in `kit-scene.ts`
 * reads these off the loaded kit and is what the dressing actually uses; this literal is derived
 * from the export's own world-space bounds report (`export-dressing.py` prints them beside the
 * asset) and exists so the number can be checked WITHOUT a GPU — the pure tests dress with it,
 * and `kit-island-measure.mjs` refuses a run where the loaded kit disagrees with it. A re-export
 * that changed a tree's proportions would otherwise move every placement on every island with
 * nothing anywhere saying so.
 *
 * The arithmetic, so a reader can recompute rather than trust: a role sized by HEIGHT scales by
 * `units / assembly.height` and the footprint is `assembly.width * scale`; a role sized by WIDTH
 * scales by `units / assembly.width`, so its footprint is its declared width exactly. `tree`
 * takes the WIDER of its two pines, because a role's clearance has to be enough for any arm.
 */
export const KIT_FOOTPRINTS_2026_08_29 = {
  tree: 10.13,
  deadTree: 7.33,
  bloom: 4,
} as const satisfies RoleFootprints;

/** How far the loaded kit's own footprints may sit from the frozen literal, as a fraction. */
export const FOOTPRINT_TOLERANCE = 0.01;

/** How many candidates a placement is chosen from. Fixed rather than tuned: it is the resolution
 *  of the search, and moving it moves every island's dressing, so it belongs beside the
 *  algorithm rather than in a caller's options. */
const CANDIDATES_PER_PLACEMENT = 96;

/**
 * PICK THE POINT FURTHEST FROM EVERYTHING ALREADY STANDING.
 *
 * ⚠⚠ THIS IS THE DEFECT THE OWNER REPORTED, AND ITS SHAPE IS WORTH KEEPING WRITTEN DOWN.
 * The previous dressing scattered ONE ROLE AT A TIME, and its minimum-gap rejection lived inside
 * that one call — so a rock was never tested against a tree, only against other rocks. Measured
 * on the fixture island on 2026-08-29, before this changed: **26 of the 2,926 prop pairs
 * overlapped**, seven of them rock-on-tree, and the worst put a rock 8.57 ground units inside a
 * pine. The owner saw exactly that and reported it as *"the rocks are appearing where the trees
 * are"*.
 *
 * ✅ AND WITHDRAWING THE ROCKS WOULD NOT HAVE FIXED IT — the same measurement says so, which is
 * why this is a separate fix rather than a side effect of the vocabulary change: six of the 26
 * were TREE ON TREE and two were a dead tree inside a live one. Removing rocks removes the
 * symptom the owner happened to see.
 *
 * The remedy is one occupancy set for the WHOLE island, every role in it, scored by the worst
 * clearance a candidate has against anything already placed. It is a best-candidate search
 * rather than rejection sampling because rejection has to decide what to do when it runs out of
 * attempts, and every answer to that is either "drop the prop" (the island under-reports) or
 * "place it anyway" (the defect, silently).
 */
function bestCandidate(
  candidates: readonly GPoint[],
  radius: number,
  occupied: readonly Occupancy[],
): GPoint | null {
  let best: GPoint | null = null;
  let bestClearance = -Infinity;
  for (const p of candidates) {
    let clearance = Infinity;
    for (const o of occupied) {
      const gap = Math.hypot(p.x - o.x, p.z - o.z) - (radius + o.radius);
      if (gap < clearance) clearance = gap;
    }
    if (clearance > bestClearance) {
      bestClearance = clearance;
      best = p;
    }
  }
  return best;
}

export interface KitDressingOptions {
  scene: SceneG;
  /** The same options the scene was built from — the only route back to the capability list,
   *  because `buildScene`'s output is a drawing and cannot answer which capability a parcel is. */
  island: IslandOptions;
  /** The relief amplitude the ground is built at, so props sit ON the land rather than through it. */
  relief: number;
  /**
   * The ground width each role occupies, measured off the LOADED kit rather than declared here.
   *
   * ⚠ IT IS AN ARGUMENT ON PURPOSE. A footprint is a fact about the asset — a pine's canopy is
   * as wide as its own geometry says once scaled to its role's height — and a number restated
   * here would be a second copy that drifts the first time the asset is re-exported. The caller
   * that has the kit open computes it (`roleFootprints` in `kit-scene.ts`); the pure tests pass
   * the kit's own measured values.
   */
  footprint: RoleFootprints;
  seed?: number;
}

/**
 * DRESS THE WHOLE ISLAND. One object per capability, plus one bloom per signed UAT criterion.
 *
 * The order is deliberate and is part of the placement: capabilities first, in the fixture's own
 * order, then the blooms — so a bloom is placed around the trees rather than a tree around the
 * blooms. A criterion marker moved a few units is a smaller loss than a capability's own tree
 * moved off the middle of its parcel.
 */
export function dressIslandFromKit(opts: KitDressingOptions): KitPlacement[] {
  const cells = layoutCells(groundCellsFrom(opts.scene));
  const facts = capabilityFacts(opts.island);
  const heightAt = heightField(opts.relief);
  const seed0 = opts.seed ?? 11;
  const out: KitPlacement[] = [];
  const occupied: Occupancy[] = [];

  const byParcel = new Map<string, LayoutCell[]>();
  for (const cell of cells) {
    if (!cell.parcel) continue;
    const list = byParcel.get(cell.parcel);
    if (list) list.push(cell);
    else byParcel.set(cell.parcel, [cell]);
  }

  const place = (
    role: KitRole,
    assembly: KitAssembly,
    capId: string,
    tint: string | null,
    from: readonly LayoutCell[],
    seed: number,
    yaw: number,
  ): void => {
    const radius = opts.footprint[role] / 2;
    const at = bestCandidate(candidatePoints(from, CANDIDATES_PER_PLACEMENT, seed), radius, occupied);
    if (!at) return;
    occupied.push({ x: at.x, z: at.z, radius });
    out.push({ role, assembly, capId, tint, at, y: heightAt(at.x, at.z), yaw });
  };

  facts.forEach((fact, fi) => {
    const parcelCells = byParcel.get(fact.capId) ?? [];
    if (parcelCells.length === 0) return;
    const form = stateForm(fact.status);
    // `unknown` — and any state this vocabulary has never heard of — grows nothing.
    if (!form) return;
    const choices = KIT_ROLE_ASSEMBLIES[form.role];
    place(
      form.role,
      choices[fi % choices.length]!,
      fact.capId,
      form.tint,
      parcelCells,
      seed0 + fi * 97,
      (fi * 2.399963) % (Math.PI * 2),
    );
  });

  // The blooms belong to the STORY's UAT criteria, not to any one capability, so they are
  // scattered over the whole island — the same claim the procedural flower markers make
  // (ADR-0226 D4, one flower per criterion), wearing the kit's vocabulary instead.
  const proven =
    opts.island.flowers === false
      ? 0
      : islandCriteria(opts.island).filter((c) => c.state === 'proven').length;
  const all = cells.filter((c) => c.parcel);
  for (let i = 0; i < proven; i++) {
    place('bloom', 'flower', 'story', null, all, seed0 + 7717 + i * 131, (i * 2.399963) % (Math.PI * 2));
  }

  return out;
}

// ------------------------------------------------------------------ the placement's own verdict

/** Two props standing closer than their own footprints allow. */
export interface PropOverlap {
  a: string;
  b: string;
  /** Distance minus the sum of the two radii — negative, and by how much. */
  gap: number;
}

/**
 * EVERY PAIR OF PROPS THAT OVERLAP, worst first — the detector, not a hope.
 *
 * ⚠ IT IS SEPARATE FROM THE PLACEMENT ON PURPOSE. `dressIslandFromKit` chooses the best point it
 * can find; whether that was good enough is a different question, and a placement that graded
 * its own output would be the shape `an-expectation-derived-from-its-subject-cannot-fail`
 * warns about. This reads the finished placements and the kit's own footprints, and
 * `kit-vocabulary.test.ts` runs it over a deliberately naive placement too, so a detector that
 * could never fire would be caught.
 */
export function dressingOverlaps(
  placements: readonly KitPlacement[],
  footprint: RoleFootprints,
): PropOverlap[] {
  const out: PropOverlap[] = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]!;
      const b = placements[j]!;
      const need = footprint[a.role] / 2 + footprint[b.role] / 2;
      const gap = Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z) - need;
      if (gap < 0) {
        out.push({ a: `${a.role}:${a.capId}`, b: `${b.role}:${b.capId}`, gap });
      }
    }
  }
  return out.sort((x, y) => x.gap - y.gap);
}

/**
 * How many props of each (role, tint) a dressing put on the island — the census a report prints.
 *
 * A named contract rather than an open dictionary because the KEY is a composite the vocabulary
 * builds (`tree`, `tree:mapped`), so the shape has an owner and saying so is what stops it being
 * read as an arbitrary bag (`anti-slop(no-known-value-widening)`).
 */
export interface DressingCensus {
  [roleAndTint: string]: number;
}

export function dressingCensus(placements: readonly KitPlacement[]): DressingCensus {
  const out: DressingCensus = {};
  for (const p of placements) {
    const key = p.tint ? `${p.role}:${p.tint}` : p.role;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Every declared tint is one this vocabulary can actually reach — the two-place check between
 *  `stateForm` and `LEAF_TINT_TOKEN`, in one place so a report can print it. */
export function tintedStates(): string[] {
  return VOCABULARY_STATES.filter((s) => stateForm(s)?.tint !== null && stateForm(s) !== null).filter(
    (s) => LEAF_TINT_TOKEN.has(s),
  );
}
