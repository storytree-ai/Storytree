// shipped-wheat-lift-scene.ts — THE WHEAT FIELD, LADDERED ON HOW PALE IT IS, FOR THE OWNER
// (increment `wheat-paleness-ladder` on `paint-every-land-type-arc`).
//
//   flat           the in-progress islands FLAT — the map before any wheat (ADR-0492 D3's deploy
//                  gate as it stood until 2026-09-06 morning). A REFERENCE arm, not the control:
//                  the finding this row answers is "every rung is darker than the flat token",
//                  and this is the flat token, on the same instrument
//   lift-1.00      the wheat as the map shipped after the yellowness ladder: the mustard anchor,
//                  the rebased stops untouched (CONTROL — every "moved" is vs this)
//   lift-1.25 / lift-1.50 / lift-2.00
//                  the same wheat with all six rebased stops lifted by that number in linear
//                  space, ratio-preserving — `WHEAT_LIFTS`, ascending
//   shipped        what ships — `SHIPPED_WHEAT_LIFT` read off the source, so it IS one rung
//
// ⚠⚠ THE LADDER VARIES ONE THING: THE LIFT. Every wheat arm wears the SHIPPED anchor (the mustard
// the owner picked from the yellowness sheet), the same factor, the same rows, the same stack
// above, the same shadow; a pixel between two rungs is the lift's and nothing else's. The anchor
// ladder is `shipped-wheat-scene.ts`; this page is the ORTHOGONAL one, and it shares that page's
// runner, pictures and readings through `WheatArmTable` so the two cannot build a scene or read
// a pixel differently.
//
// ⚠⚠ THE TWO FINDINGS OF THE YELLOWNESS SHEET TRAVEL WITH EVERY RUNG, AS NUMBERS. (1) The field's
// mean delivered luma against the flat token's (`wheatFieldLuma`) — the darkening this row exists
// to answer, printed per rung so the sheet says how much of it each rung recovers. (2) The warm
// light stop's hue per rung (`wheatStopReport`) — a ratio-preserving lift moves no hue until a
// channel clamps, and when one does it turns toward yellow, not the peach the pale anchors
// showed; the sheet prints the degree rather than asserting the argument.
//
// ⚠ THE CONTROL IS THE MAP AS IT SHIPPED, BY CONSTRUCTION: `shippedGroundBuild` and
// `buildGroundMaterial` on every arm, handed this arm's wheat and depth and nothing else. The
// reader model PRINTS and does not fence (ADR-0503 D1 / ADR-0506); frame cost REPORTS (ADR-0517
// D4); arms are judged by pixels moving past 20/255 (ADR-0490 D6).
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. The pick lands in `src/ForestWorldCanvas.tsx`
// (`SHIPPED_WHEAT_LIFT`).

import type { GroundWheatLayer } from '../src/banded-ground-material.js';
import {
  GROUND_TOKENS,
  SHIPPED_GRASS,
  SHIPPED_SHADOW_DEPTH,
  SHIPPED_WHEAT_ANCHOR,
  SHIPPED_WHEAT_LIFT,
  SHIPPED_WHEAT_MIX,
  WHEAT_GATE_ROWS,
} from '../src/ForestWorldCanvas.js';
import { GRASS_STATUS_GATE } from '../src/land-grass.js';
import { WHEAT_LIFTS, wheatAnchor } from '../src/land-wheat.js';
import { SHADOW_DEPTH, deepestAdmissibleRung, type ShadowDepthOptions } from '../src/shadow-rung.js';
import { SHIPPED_TOKENS } from './grain-status-reading.js';
import { grassReachableColours } from './grass-status-reading.js';
import {
  TODAY_SHADOW_DEPTH,
  createWheatRunner,
  mountWheatPage,
  type WheatArmTable,
  type WheatPictureId,
  type WheatRunner,
} from './shipped-wheat-scene.js';
import {
  greenReferenceMargin,
  wheatLiftReports,
  wheatShadowMargin,
  type WheatRungReport,
  type WheatShadowMargin,
} from './wheat-status-reading.js';

// ---------------------------------------------------------------- the arms

export interface LiftArmSpec {
  id: string;
  /** The lift on the six rebased stops; `null` is NO wheat — the flat reference. */
  lift: number | null;
  /** The rung's id in `WHEAT_LIFTS`, for the caption; `null` on the flat reference. */
  rung: string | null;
}

export const FLAT_ARM = 'flat';
export const LIFT_CONTROL_ARM = liftArmId(WHEAT_LIFTS[0]!.id);
export const LIFT_SHIPPED_ARM = 'shipped';

export function liftArmId(rung: string): string {
  return `lift-${rung}`;
}

/** The anchor every wheat arm wears — the shipped one, held fixed, named once. */
export const LIFT_ANCHOR = SHIPPED_WHEAT_ANCHOR;

export const LIFT_ARMS: readonly LiftArmSpec[] = [
  { id: FLAT_ARM, lift: null, rung: null },
  ...WHEAT_LIFTS.map((l): LiftArmSpec => ({ id: liftArmId(l.id), lift: l.lift, rung: l.id })),
  { id: LIFT_SHIPPED_ARM, lift: SHIPPED_WHEAT_LIFT, rung: WHEAT_LIFTS.find((l) => l.lift === SHIPPED_WHEAT_LIFT)?.id ?? null },
];

/** The ladder's arms in order — the rungs, without the flat reference or the shipped twin. The
 *  FIRST rung is the control. */
export const LIFT_LADDER_ARMS: readonly string[] = WHEAT_LIFTS.map((l) => liftArmId(l.id));

export function liftArmSpec(id: string): LiftArmSpec {
  const found = LIFT_ARMS.find((a) => a.id === id);
  if (found === undefined) throw new Error(`shipped-wheat-lift-scene: no arm "${id}"`);
  return found;
}

/** Do two arms draw the SAME picture? The shipped arm must coincide with exactly one rung. */
export function sameLiftArm(a: LiftArmSpec, b: LiftArmSpec): boolean {
  return a.lift === b.lift;
}

/** The arm one rung DOWN the ladder (less lift), or null — the flat reference and the first rung
 *  (the control) have none, so "vs neighbour" always isolates ONE step of the lift. */
export function liftNeighbourArm(id: string): string | null {
  const spec = liftArmSpec(id);
  if (spec.lift === null) return null;
  const rung = LIFT_LADDER_ARMS.findIndex((arm) => liftArmSpec(arm).lift === spec.lift);
  return rung > 0 ? LIFT_LADDER_ARMS[rung - 1]! : null;
}

export function liftArmCaption(id: string): string {
  const s = liftArmSpec(id);
  if (s.lift === null) {
    return `the in-progress islands FLAT — the map before any wheat, the deep shadow on the green alone (REFERENCE: the flat token every rung is measured against)`;
  }
  const rung = WHEAT_LIFTS.find((l) => l.lift === s.lift);
  const what = rung === undefined ? `lift ${s.lift}` : `lift ${rung.id}: ${rung.what}`;
  const anchor = wheatAnchor('mustard');
  const tag = id === LIFT_SHIPPED_ARM ? ' (SHIPS)' : id === LIFT_CONTROL_ARM ? ' (CONTROL)' : '';
  return `the wheat at ${SHIPPED_WHEAT_MIX} on the in-progress rows, the ${anchor.id} anchor ${anchor.hex} held fixed, ${what}; the stack above and the deep shadow as the green wears them${tag}`;
}

/** The wheat option one arm hands the material — `null` on the flat reference. Every wheat arm
 *  wears the SHIPPED anchor, rows and factor: the lift is the one moving part. */
export function liftArmWheat(id: string): GroundWheatLayer | null {
  const s = liftArmSpec(id);
  if (s.lift === null) return null;
  return { mix: SHIPPED_WHEAT_MIX, rows: WHEAT_GATE_ROWS, anchor: LIFT_ANCHOR, lift: s.lift };
}

/** The shadow's depth: the shipped picks (the painted tokens deep) on every wheat arm; on the
 *  flat reference the depth the map wore BEFORE the wheat — the green alone deep — so the
 *  reference is the pre-wheat map exactly, not a flat yellow under the painted stack's shadow. */
export function liftArmDepth(id: string): ShadowDepthOptions {
  if (liftArmSpec(id).lift === null) return TODAY_SHADOW_DEPTH;
  return SHIPPED_SHADOW_DEPTH;
}

/** The green island is a PROOF of no change (control and shipped only); the ladder is read on the
 *  yellow island and on the forest, with the flat reference first. */
export function liftArmsFor(pic: WheatPictureId): readonly string[] {
  return pic === 'green' ? [LIFT_CONTROL_ARM, LIFT_SHIPPED_ARM] : LIFT_ARMS.map((a) => a.id);
}

// ---------------------------------------------------------------- the readings

/** THE READER MODEL, PRINTED, per rung of the paleness ladder — with the two findings as numbers
 *  on every rung (`stops`, `luma`), the green's figure on the same instrument, and the shadow's
 *  own margin on the yellow at the deep rung. */
export interface LiftMargins {
  anchor: string;
  fac: number;
  step: number;
  rungs: WheatRungReport[];
  green: { fac: number; worstMargin: number; worstAt: string };
  shadow: WheatShadowMargin;
}

export function liftMargins(step = 0.0005): LiftMargins {
  const derived = deepestAdmissibleRung(GROUND_TOKENS);
  if (derived === null) throw new Error('shipped-wheat-lift-scene: the shipped palette admits no shadow rung');
  return {
    anchor: LIFT_ANCHOR,
    fac: SHIPPED_WHEAT_MIX,
    step,
    rungs: wheatLiftReports(LIFT_ANCHOR, SHIPPED_WHEAT_MIX, step),
    green: { fac: SHIPPED_GRASS.mix, ...greenReferenceMargin(SHIPPED_GRASS.mix, grassReachableColours(), GRASS_STATUS_GATE) },
    shadow: wheatShadowMargin(SHIPPED_TOKENS, derived, SHADOW_DEPTH),
  };
}

/** THE PALENESS LADDER as a table over the shared runner. */
export const PALENESS_TABLE: WheatArmTable<LiftMargins> = {
  control: LIFT_CONTROL_ARM,
  shipped: LIFT_SHIPPED_ARM,
  armsFor: liftArmsFor,
  wheat: liftArmWheat,
  depth: liftArmDepth,
  neighbour: liftNeighbourArm,
  caption: liftArmCaption,
  margins: () => liftMargins(),
};

// ---------------------------------------------------------------- the page

export async function mountShippedWheatLift(root: HTMLElement): Promise<void> {
  const runner = await createWheatRunner(PALENESS_TABLE);
  window.wheatLiftRunner = runner;
  await mountWheatPage(root, runner, PALENESS_TABLE);
}

declare global {
  interface Window {
    wheatLiftRunner?: WheatRunner<LiftMargins>;
  }
}
