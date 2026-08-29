// camera-framing.ts — HOW THE SHIPPED CANVAS FRAMES A WORLD. Pure, and behind the provability
// firewall with `world-to-3d.ts`: no React, no three, no drei, so it is `node:test`-provable and
// the framing is checkable without a browser or a GPU.
//
// ⚠ IT WAS NOT ALWAYS PURE, and that is the point of the move. `frameWorld` lived inside
// `ForestWorldCanvas.tsx` beside the JSX, so nothing could reach it: the harness's baseline page
// TRANSCRIBED it instead ("⚠ Transcribed from ForestWorldCanvas.tsx:158-168", against line numbers
// that had already moved), and the shipped map's delivered scale was then reported off the copy.
// Splitting the arithmetic out is what lets a test assert it and the instrument stop guessing at
// it (`harness/projection-probe.ts` reads the projection off the wire instead).
//
// THE PROJECTION IS ORTHOGRAPHIC (ADR-0380 D6 fence 4). Everything here sizes an orthographic
// frustum; the eye's DISTANCE no longer affects the delivered scale, so `position` sets only the
// view direction and the clip range.
//
// ⚠⚠ THIS IS NOT THE SHIPPED FRAMING, AND HAS NOT BEEN SINCE 2026-08-28. `restingFrame`
// (`packages/forest-world/src/resting-view.ts`, ADR-0471) is the ONE place that decides how much
// forest a surface opens on. Both maps a visitor can actually reach converge on it: the studio's
// SVG map through `apps/studio/src/lib/worldCamera.ts`, and the public `/forest/` page through
// `web/src/scripts/forest-arrival.ts`. `<ForestWorldCanvas>` is mounted only in this package's own
// dev harness — verified 2026-08-30 with the `web/` submodule checked out, which is what
// `adopt-the-land-into-the-shipped-map-arc-inc-01` could only record as UNVERIFIED: the website
// syncs this whole directory but imports from it ONLY `act2-director`'s pure zod state machine
// (`web/src/scripts/act2-{walkthrough,script,validate}.ts`), and nothing anywhere imports this
// file or `ForestWorldCanvas`. ADR-0471 D8 records why this rule was left behind rather than
// converted: `InstanceDescriptor` carries no island identity, so there is nothing here to pin a
// composition to.
//
// ⚠ WHAT THIS RULE ACTUALLY FRAMES — 2.154x the vertical room a flat world can occupy, and the
// margin is NOT headroom. `spread` is a max over GROUND |x| and |z|, but the eye looks down at 45°,
// so a ground span of z delivers only `sin(45°)` of SCREEN height. `back * FRAME_HALF_HEIGHT_PER_BACK`
// is `spread * 1.5230` — the retired perspective camera's own margin, carried forward on purpose —
// and dividing that by `sin(45°)` gives 2.1539. That figure is re-derived here from this file's own
// two constants and needs no instrument.
//
// ⚠ AND IT IS DELIBERATELY LEFT THAT WAY — do not "fix" it with a `sin(elev)` factor. The repair
// was proposed, costed at ~1.3x more delivered detail, and declined: nothing a visitor sees is
// framed by this function, so that 1.3x accrues to nobody, and `resting-view.ts` says the framing
// is ONE
// decision now and a second must not be added. If this canvas is ever mounted it adopts
// `restingFrame` — which means giving `InstanceDescriptor` island identity first — rather than
// growing a better fit of its own. Repairing the fit would be building the wrong thing better. The
// `2.6` was born in the original spike commit `ee675ad3`, where `back` was a perspective camera's
// eye DISTANCE, beside a comment reading "the camera backs off proportionally to the world's
// spread"; it was never a headroom decision by anyone.
// (Increment `does-the-shipped-framing-waste-a-third-of-the-screen`, settled 2026-08-29.)
//
// ⚠⚠ THIS ANNOTATION IS RECOVERED, AND TWO OF ITS FIGURES ARE NOT REPRODUCED HERE. It was written
// by session `land-framing` settling `does-the-shipped-framing-waste-a-third-of-the-screen` on
// 2026-08-29, and it landed ONLY as a hand-edit of the generated mirror
// (`storytree-web` commit `bfcc0c4`, whose message calls itself a "re-sync" of this file). The
// parent-side change was never committed on any branch here, so the next legitimate sync would
// have silently deleted a settled decision from the public repo — which is how it was found. Its
// closing sentence cited "all four figures measured in `camera-framing.test.ts` with a
// 30°-elevation control and a corrected-rule control"; those tests do not exist in this repo and
// that sentence is dropped rather than carried, because a citation to a test nobody has is worse
// than none. Two figures go with it and are recorded as UNVERIFIED HERE: raising every instance to
// a 92-unit hero-tree crown was measured to move the over-frame only 2.154 → 1.972, and tall
// objects were said to need a factor of 1.09 against the 2.15 reserved. Anyone re-opening this
// re-measures those two; the decision above rests on the 2.154 that this file can re-derive.

import type { InstanceDescriptor } from './world-to-3d.js';

/** Where the camera sits and what it looks at — a `[x, y, z]` pair the drei `MapControls` reads.
 *  Named rather than written inline on {@link frameWorld}'s return, because
 *  `anti-slop/no-known-value-widening` reads an anonymous object return annotation as discarded
 *  type evidence and inc-08's refactor panel settled the fork toward NAMING rather than deleting
 *  (deleting it would infer the tuples as `number[]` and break the drei props). */
export interface CameraFraming {
  target: [number, number, number];
  position: [number, number, number];
  /** How much world, in units, the view shows above and below the target. On an orthographic
   *  camera this is the whole framing — the eye's DISTANCE no longer affects the delivered scale,
   *  so `position` now sets only the view DIRECTION and the clip range. */
  halfHeight: number;
}

/** How much world half-height the RETIRED perspective camera framed per unit it backed off.
 *
 *  ⚠ IT IS INHERITED ON PURPOSE, and it is not a live field of view. That camera sat `back` units
 *  up and `back` units along +z — a 45° elevation, so `back * √2` from the target — and framed
 *  `distance * tan(fov / 2)` of world at the target plane at `fov = 45°`. Reproducing the number
 *  it delivered is what makes the before/after pictures a comparison of PROJECTIONS rather than of
 *  framings: the island lands at the same size in the frame, and the only thing that changes is
 *  whether its near edge is drawn bigger than its far one. Recomputing rather than writing 0.5858
 *  down keeps the derivation legible; `ForestWorldCanvas.test.ts` pins the value. */
export const FRAME_HALF_HEIGHT_PER_BACK = Math.SQRT2 * Math.tan(Math.PI / 8);

/** The framed half-height for an empty world — what the retired perspective camera's own
 *  `max(260, …)` floor delivered, so an empty canvas frames exactly as much world as before. */
const EMPTY_WORLD_HALF_HEIGHT = 260 * FRAME_HALF_HEIGHT_PER_BACK;

/** Frame the whole world on load: the instance centroid is the MapControls target, the camera
 *  keeps the same 45°-elevation view DIRECTION it always had, and the framed half-height grows
 *  with the world's spread. */
export function frameWorld(instances: InstanceDescriptor[]): CameraFraming {
  if (instances.length === 0) {
    return { target: [0, 0, 0], position: [0, 260, 260], halfHeight: EMPTY_WORLD_HALF_HEIGHT };
  }
  let sx = 0;
  let sz = 0;
  for (const i of instances) {
    sx += i.transform.x;
    sz += i.transform.z;
  }
  const cx = sx / instances.length;
  const cz = sz / instances.length;
  let spread = 0;
  for (const i of instances) {
    spread = Math.max(spread, Math.abs(i.transform.x - cx), Math.abs(i.transform.z - cz));
  }
  const back = Math.max(260, spread * 2.6);
  return {
    target: [cx, 0, cz],
    position: [cx, back, cz + back],
    halfHeight: back * FRAME_HALF_HEIGHT_PER_BACK,
  };
}


/** The orthographic `zoom` that frames `halfHeight` world units of a viewport whose SHORTER side
 *  is `shortSideCssPx` CSS pixels.
 *
 *  R3F sizes a default orthographic frustum in CSS pixels (`left/right = ∓width/2`,
 *  `top/bottom = ±height/2`) and divides by `zoom`, so `zoom` IS the delivered CSS-px per world
 *  unit — ONE number, everywhere in the frame. That is the whole substance of fence 4: a
 *  perspective camera has no single such number, and the shipped canvas measurably delivered 5.1%
 *  more px/unit at the near edge of an island than at the far one (PR #1679, reproduced 2026-08-28).
 *
 *  The SHORTER side is the binding one: fitting the longer side would let the island overflow the
 *  other axis on any non-square canvas. */
export function orthographicZoomFor(halfHeight: number, shortSideCssPx: number): number {
  return Math.max(shortSideCssPx, 1) / (2 * Math.max(halfHeight, Number.EPSILON));
}
