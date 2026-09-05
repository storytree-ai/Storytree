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
// ⚠ WHAT THIS RULE ACTUALLY FRAMES — about 2x the vertical room a flat world can occupy, and the
// margin is NOT headroom. `spread` is a max over GROUND |x| and |z|, but the eye looks down at
// `SHIPPED_ELEVATION_DEG`, so a ground span of z delivers only `sin(elev)` of SCREEN height.
// `back * FRAME_HALF_HEIGHT_PER_BACK` is `spread * 1.5230` — the retired perspective camera's own
// margin, carried forward on purpose — and dividing that by `sin(50°)` gives 1.988 (it was 2.1539
// at the 45° this canvas looked down at until 2026-09-05). That figure is re-derived here from
// this file's own constants and needs no instrument.
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

import { RENDER_ELEV_DEG } from './kit-vocabulary.js';
import type { InstanceDescriptor } from './world-to-3d.js';

/**
 * THE ELEVATION THE SHIPPED CANVAS LOOKS DOWN AT — the owner-signed 50° every approved render was
 * taken at (`build_land.py`'s `RENDER_ELEV_DEG`, mirrored as `kit-vocabulary.ts`'s constant), by
 * import rather than by a second `50` (ADR-0517 D2).
 *
 * ⚠ IT WAS 45° UNTIL 2026-09-05, and the five degrees were taken WITH the footprint fix and never
 * instead of it: PR #1820's ladder measured the elevation alone as worth 7.5% of the island's
 * on-screen height against the footprint's 129%. Moving it is what makes every instrument that
 * already read `RENDER_ELEV_DEG` — the crowd layout's `ELEV_RAD`, `deliveredHeightPx`, the
 * object floor the prop sizes were chosen against — report against the camera that actually
 * ships, where before they reported against one five degrees higher than the canvas looked from
 * (ADR-0517 D3). `shippedElevationDeg()` READS the angle back off {@link frameWorld} so a test can
 * hold that the eye and this constant agree.
 */
export const SHIPPED_ELEVATION_DEG: number = RENDER_ELEV_DEG;

/** How far the eye sits from the target per unit of `back`: the retired perspective camera sat
 *  `back` up and `back` along +z, i.e. `back · √2` away, and the orthographic eye keeps that
 *  distance so the same `near`/`far` range still contains the world. */
const EYE_DISTANCE_PER_BACK = Math.SQRT2;

/** The eye's offset from the target: `y` up and `z` along +z. */
interface EyeOffset {
  y: number;
  z: number;
}

/** The eye's offset from the target for a given `back`: `EYE_DISTANCE_PER_BACK · back` away,
 *  along +z, raised to {@link SHIPPED_ELEVATION_DEG}. */
function eyeOffset(back: number): EyeOffset {
  const elev = (SHIPPED_ELEVATION_DEG * Math.PI) / 180;
  const dist = back * EYE_DISTANCE_PER_BACK;
  return { y: dist * Math.sin(elev), z: dist * Math.cos(elev) };
}

/** The elevation the eye actually looks down at, read back off {@link frameWorld}'s own output —
 *  never a transcription of the constant it was built from. */
export function shippedElevationDeg(): number {
  // ⚠ READ OFF A WORLD AWAY FROM THE ORIGIN. Framing an empty world targets (0, 0, 0), where
  // `position - target` and `position + target` are the same number and a reader that got the
  // subtraction wrong would still report the right angle — `check:mutation-diff` found exactly
  // that. One stand-in instance off-origin makes the target non-zero, so the arithmetic is real.
  // Stryker disable next-line StringLiteral: EQUIVALENT — `frameWorld` reads only `transform`; the
  // family and group of the probe are not consulted, so any string here is the same probe.
  const probe: InstanceDescriptor = { kind: 'wisp-sprite', transform: { x: 37, y: 0, z: 91 }, group: 'wisp-sprite' };
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT — an empty world targets the origin and
  // still reports the same angle; the probe exists so the x/z subtractions below are non-trivial.
  const frame = frameWorld([probe]);
  const dx = frame.position[0] - frame.target[0];
  // Stryker disable next-line ArithmeticOperator: EQUIVALENT — the target's y is always 0 (the
  // ground plane), so adding and subtracting it are the same number.
  const dy = frame.position[1] - frame.target[1];
  const dz = frame.position[2] - frame.target[2];
  return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
}

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
 *  looks down at {@link SHIPPED_ELEVATION_DEG} from the +z side (azimuth fixed — ADR-0380 D6
 *  fence 4, no viewer rotation), and the framed half-height grows with the world's spread. */
export function frameWorld(instances: InstanceDescriptor[]): CameraFraming {
  if (instances.length === 0) {
    const eye = eyeOffset(260);
    return { target: [0, 0, 0], position: [0, eye.y, eye.z], halfHeight: EMPTY_WORLD_HALF_HEIGHT };
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
  const eye = eyeOffset(back);
  return {
    target: [cx, 0, cz],
    position: [cx, eye.y, cz + eye.z],
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
