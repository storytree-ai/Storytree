// kit-vocabulary.ts — WHAT EACH BOUGHT PROP MEANS, and where on the island it stands.
//
// ⚠ THE FLOOR THIS FILE EXISTS TO MEET. ADR-0463 D4 records a standing owner delegation on the
// PROP VOCABULARY: "you can decide what signal they represent, theres plenty of code so at this
// stage I dont mind you proposing and me adjusting the shape after." D5 keeps the floor —
// delegation picks WHICH signal a prop carries, never WHETHER it carries one. So every role
// below names a signal, and the signal is read off the SCENE rather than chosen for looks.
// ADR-0414 D1 (the shipped map carries no decoration) is what makes that non-negotiable: a prop
// that asserts nothing is exactly what it forbids.
//
// The opening proposal already on the record — rocks mark DRIFT — is kept rather than re-opened,
// and the other five are built on it.
//
// ⚠ AND WHAT THIS FILE IS NOT. It is `harness/`, the experiment surface, where ADR-0406 D1 says
// the island represents nothing and props are unfenced. Nothing here is adopted into `src/`;
// that is a separate, deliberate event (ADR-0380 D6 / ADR-0406 D2). The vocabulary is authored
// as though it WERE on the shipped map because that is the only way to find out whether it
// reads — a decorative dressing would answer a different question.

import type { SceneG } from '@storytree/forest-world';

import { groundCellsFrom } from './island-descriptors.js';
import { islandCapabilities, islandCriteria } from './island-fixture.js';
import type { IslandOptions } from './island-fixture.js';
import { heightField, layoutCells } from './prop-layout.js';
import type { GPoint, LayoutCell } from './prop-layout.js';

/** The six things a bought prop can be on this island. */
export type KitRole = 'tree' | 'deadTree' | 'undergrowth' | 'rock' | 'log' | 'bloom';

/**
 * WHAT EACH ROLE ASSERTS. One line each, and each one is a claim about the work rather than a
 * description of the object — which is the whole difference between signal and decoration.
 *
 * The four marked SCENE are read off the island's own data. The two marked INPUT name signals
 * the system genuinely computes but that this fixture does not carry, so they are supplied to
 * the dressing explicitly rather than invented inside it — a prop drawn from a number nobody
 * supplied would be decoration wearing a signal's name.
 */
export const KIT_ROLE_SIGNAL = {
  tree: 'SCENE — one standing pine per contract proven under this capability',
  deadTree:
    'SCENE — this capability is unhealthy: its contracts stand, and they are standing dead wood',
  undergrowth:
    'SCENE — this capability is proposed or building: growth that has not become a tree yet',
  rock: 'INPUT — drift: evidence gone stale beneath this capability (ADR-0463 D4, check:verification-decay)',
  log: 'INPUT — a retired contract, cut and left where it fell',
  bloom: 'SCENE — a UAT criterion the owner has signed (ADR-0226 D4, one flower per criterion)',
} as const satisfies Record<KitRole, string>;

/**
 * AN ASSEMBLY IS WHAT STANDS AT A POINT — one or more kit objects placed as a unit.
 *
 * ⚠ A PINE IS TWO OBJECTS, AND THEIR RELATIONSHIP IS THE KIT'S, NOT OURS. The kit models a
 * trunk and its needles as separate objects wearing different materials, CO-LOCATED in the
 * blend file (measured: `Pine_Trunk_01` and `Pine_Leaves_01` centres are 0.07 units apart, and
 * the needles start at z 0.548 against the trunk's base at −0.154 — branches that begin just
 * above the ground). So the two are recentred and scaled TOGETHER, by their joint bounding box.
 * Recentring each on its own base — the obvious reading of "put the object on the ground" —
 * drops the crown 0.70 units into the trunk, about 18% of the tree's height.
 *
 * This was found by reading the kit's world-space bounds, not by looking at a render: the first
 * pairing here put `Pine_Trunk_02` with `Pine_Leaves_04`, which are 5 units apart in the blend
 * and belong to different trees. Nothing about the picture would have said so.
 */
export const KIT_ASSEMBLIES = {
  'pine-a': ['Pine_Trunk_01', 'Pine_Leaves_01'],
  'pine-b': ['Pine_Trunk_04', 'Pine_Leaves_04'],
  'pine-dead': ['Pine_Trunk_No_Leaves_01'],
  fern: ['Fern_01'],
  grass: ['Grass_Clump_01'],
  bush: ['Leafy_Bush_01'],
  'rock-a': ['Rock_01'],
  'rock-b': ['Rock_02'],
  'rock-c': ['Rock_03'],
  'rock-d': ['Rock_07'],
  'log-a': ['Log_01'],
  'log-b': ['Log_02'],
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
 * names against the committed asset's own manifest, so a missing object is a loud two-place
 * mismatch rather than a quietly emptier island.
 */
export const KIT_ROLE_ASSEMBLIES = {
  tree: ['pine-a', 'pine-b'],
  deadTree: ['pine-dead'],
  undergrowth: ['fern', 'grass', 'bush'],
  rock: ['rock-a', 'rock-b', 'rock-c', 'rock-d'],
  log: ['log-a', 'log-b'],
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
 * ⚠⚠ SCALING A FLAT PROP BY ITS HEIGHT BLOWS UP ITS FOOTPRINT, and the first run of this
 * dressing did exactly that. `Red_Flower_01` is 0.98 units wide and 0.60 tall in the kit; asking
 * for a 5-unit-tall bloom multiplied it by 8.3 and delivered a flower **8.2 ground units
 * across** — as wide as a whole pine's canopy. A criterion marker the size of a tree is the art
 * asserting an importance the signal does not have. So a TALL prop is sized by its height and a
 * FLAT one by its width, and which is which is declared rather than inferred.
 *
 * ⚠ READ AGAINST THE OBJECT FLOOR, NOT CHOSEN. Below about 10 delivered pixels an isolated mark
 * stops being an object and becomes speckle (measured on the predecessor arc, and the reason
 * `CANOPY_WIDTH_FLOOR` is 5). Width does not foreshorten at this camera and height does, by
 * cos(50°) = 0.643 — so a height-sized prop needs 7.8 ground units to clear the floor at the
 * overview and a width-sized one needs 5.
 */
export const KIT_ROLE_SIZE = {
  tree: { axis: 'height', units: 18 },
  deadTree: { axis: 'height', units: 15 },
  undergrowth: { axis: 'width', units: 6 },
  rock: { axis: 'width', units: 7 },
  log: { axis: 'width', units: 9 },
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

// ------------------------------------------------------------------ the facts a parcel carries

/** The four things about a capability that decide what stands on its parcel. */
export interface CapabilityFacts {
  capId: string;
  status: string;
  /** Contracts proven under it — the scene's own `testCount`. */
  contracts: number;
  /** Evidence gone stale beneath it. Supplied, not invented — see `KIT_ROLE_SIGNAL`. */
  drift: number;
  /** Contracts retired under it. Supplied, not invented. */
  retired: number;
}

/** Signals the fixture does not carry, keyed by capability id. */
export interface SuppliedSignals {
  drift?: Readonly<Record<string, number>>;
  retired?: Readonly<Record<string, number>>;
}

/**
 * Read each capability's facts off the scene, filling the two supplied signals.
 *
 * ⚠ `parcels` IS THE SOURCE, not the ground cells. A cell knows which parcel it belongs to and
 * nothing about how many contracts that capability holds; reading the count off the cells would
 * mean counting cells, which is a measure of AREA wearing a contract count's name.
 */
export function capabilityFacts(
  island: IslandOptions,
  supplied: SuppliedSignals = {},
): CapabilityFacts[] {
  return islandCapabilities(island).map((cap) => ({
    capId: cap.capId,
    status: String(cap.status),
    contracts: cap.testCount,
    drift: supplied.drift?.[cap.capId] ?? 0,
    retired: supplied.retired?.[cap.capId] ?? 0,
  }));
}

/**
 * WHICH ROLE A CAPABILITY'S CONTRACTS TAKE, from its status.
 *
 * The three arms are the three things a contract can be doing: standing (proven), standing dead
 * (the capability is unhealthy), or not yet a tree (proposed or building). `unknown` asserts
 * nothing, so it grows nothing — an island that drew confident trees for a capability whose
 * state is unknown would be the art asserting a proof state the work does not hold, which is
 * the one way this arc can do harm (ADR-0392 D5).
 */
export function contractRole(status: string): KitRole | null {
  if (status === 'healthy' || status === 'mapped') return 'tree';
  if (status === 'unhealthy') return 'deadTree';
  if (status === 'proposed' || status === 'building') return 'undergrowth';
  return null;
}

// ------------------------------------------------------------------ where each prop stands

export interface KitPlacement {
  role: KitRole;
  /** Which assembly stands here — one or more kit objects, placed as a unit. */
  assembly: KitAssembly;
  /** The capability whose facts put it here, or `story` for a whole-island signal. */
  capId: string;
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
 * Points inside a parcel, sampled from ITS OWN CELLS rather than from a parcel outline.
 *
 * ⚠ WHY NOT `parcelLoop`. It throws for any parcel that is not one simple loop, and two of this
 * island's eleven are not — `island-dressing.ts`'s terrace composition try/catches and SKIPS
 * them. A capability silently missing its trees would be the island under-reporting the work,
 * which is worse here than a slightly less tidy scatter: this dressing's whole claim is that
 * every capability's contracts are on the map.
 *
 * A cell is a quadrilateral, so a point inside it is a bilinear sample. Every random is drawn
 * BEFORE any rejection, so the stream cannot depend on which filter fired.
 */
function scatterInCells(
  cells: readonly LayoutCell[],
  count: number,
  seed: number,
  minGap: number,
): GPoint[] {
  if (cells.length === 0 || count <= 0) return [];
  const rand = rng(seed);
  const out: GPoint[] = [];
  const attempts = Math.max(400, count * 40);
  for (let i = 0; i < attempts && out.length < count; i++) {
    const cell = cells[Math.floor(rand() * cells.length) % cells.length]!;
    const u = rand();
    const v = rand();
    const jitter = rand();
    const pts = cell.points;
    if (pts.length < 3) continue;
    // Bilinear over the first four points, pulled toward the centroid so nothing sits on an
    // edge two parcels share — a tree straddling a boundary reads as belonging to neither.
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
    const p = { x: raw.x + (cx - raw.x) * pull, z: raw.z + (cz - raw.z) * pull };
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < minGap)) continue;
    out.push(p);
  }
  return out;
}

export interface KitDressingOptions {
  scene: SceneG;
  /** The same options the scene was built from — the only route back to the capability facts,
   *  because `buildScene`'s output is a drawing and cannot answer how many contracts a
   *  capability holds. */
  island: IslandOptions;
  /** The relief amplitude the ground is built at, so props sit ON the land rather than through it. */
  relief: number;
  supplied?: SuppliedSignals;
  seed?: number;
}

/**
 * DRESS THE WHOLE ISLAND. One pass per role, every count read from a capability's facts.
 *
 * ⚠ THE SPACING IS PER ROLE AND PROPORTIONAL TO WHAT IT DRAWS. Two trees closer than a canopy
 * width read as one wider tree, so the count stops being legible — which would be the picture
 * quietly under-reporting a capability's contracts. The gap is derived from the role's own
 * delivered height rather than dialled.
 */
export function dressIslandFromKit(opts: KitDressingOptions): KitPlacement[] {
  const cells = layoutCells(groundCellsFrom(opts.scene));
  const facts = capabilityFacts(opts.island, opts.supplied ?? {});
  const heightAt = heightField(opts.relief);
  const seed0 = opts.seed ?? 11;
  const out: KitPlacement[] = [];

  const byParcel = new Map<string, LayoutCell[]>();
  for (const cell of cells) {
    if (!cell.parcel) continue;
    const list = byParcel.get(cell.parcel);
    if (list) list.push(cell);
    else byParcel.set(cell.parcel, [cell]);
  }

  facts.forEach((fact, fi) => {
    const parcelCells = byParcel.get(fact.capId) ?? [];
    if (parcelCells.length === 0) return;

    const emit = (role: KitRole, count: number, gapScale: number) => {
      const choices = KIT_ROLE_ASSEMBLIES[role];
      const points = scatterInCells(
        parcelCells,
        count,
        seed0 + fi * 97 + role.length * 13,
        KIT_ROLE_SIZE[role].units * gapScale,
      );
      points.forEach((at, i) => {
        // A LINEAR prop authored north-south foreshortens into a vertical bar and reads as a
        // post rather than as a log — measured on the predecessor arc, and true of every linear
        // prop at this camera. So logs run east-west, with only enough jitter to avoid a row.
        const yaw = role === 'log' ? (i % 2 ? 0.25 : -0.25) : ((i * 2.399963) % (Math.PI * 2));
        out.push({
          role,
          assembly: choices[i % choices.length]!,
          capId: fact.capId,
          at,
          y: heightAt(at.x, at.z),
          yaw,
        });
      });
    };

    const role = contractRole(fact.status);
    // The contract count is what the parcel grows: standing pines when the capability is
    // proven, standing dead wood when it is unhealthy, undergrowth when it is not built yet.
    if (role) emit(role, fact.contracts, role === 'tree' ? 0.5 : role === 'deadTree' ? 0.6 : 0.9);
    emit('rock', fact.drift, 1.1);
    emit('log', fact.retired, 2.2);
  });

  // The blooms belong to the STORY's UAT criteria, not to any one capability, so they are
  // scattered over the whole island — the same claim the procedural flower markers make
  // (ADR-0226 D4, one flower per criterion), wearing the kit's vocabulary instead.
  const proven =
    opts.island.flowers === false
      ? 0
      : islandCriteria(opts.island).filter((c) => c.state === 'proven').length;
  if (proven > 0) {
    const all = cells.filter((c) => c.parcel);
    const points = scatterInCells(all, proven, seed0 + 7717, KIT_ROLE_SIZE.bloom.units * 2.4);
    points.forEach((at, i) => {
      out.push({
        role: 'bloom',
        assembly: 'flower',
        capId: 'story',
        at,
        y: heightAt(at.x, at.z),
        yaw: (i * 2.399963) % (Math.PI * 2),
      });
    });
  }

  return out;
}
