// projection-probe.ts — READ THE PROJECTION OFF THE MATRIX THE DRIVER WAS GIVEN.
//
// THE INCREMENT: `the-shipped-canvas-meets-the-isometric-fence`. ADR-0380 D6 fence 4 says the
// game stays 2.5D isometric — no free camera, no orbit control, no perspective view — and the
// shipped canvas did all three for months. Bringing the code to the fence is easy; PROVING it
// stayed there is the part that needs an instrument.
//
// ⚠⚠ WHY NOT TRANSCRIBE THE CAMERA. Until this module existed, `baseline.tsx` computed delivered
// px/ground-unit from a `pxPerUnitAt(distance, viewportH, fovDeg = 45)` hand-copied out of
// `ForestWorldCanvas.tsx` — and its own header says so ("⚠ Transcribed from
// ForestWorldCanvas.tsx:158-168", against line numbers that had already moved). An expectation
// derived from its subject cannot fail: swap the shipped camera for an orthographic one and a
// transcribed formula goes on reporting the retired fov's spread, while swapping the FORMULA to an
// orthographic one reports 0.0% whether or not the shipped file ever changed. Either way the
// headline number is a restatement of what the harness believes, arriving with the authority of a
// measurement.
//
// So the projection is taken from the GL uniform upload itself, keyed by the location three.js
// got back for the name `projectionMatrix`. It is the same route `baseline.tsx` already uses for
// draw counts — wrap the prototype, count what the driver actually received — and it has the same
// property: a component that quietly stopped doing the thing cannot satisfy it.
//
// Everything here is PURE and typechecked. ⚠ `bun test` and `tsx` are transpile-only, so a probe
// that lives only in a `.mjs` driver can print confident numbers out of code that does not
// compile; the arithmetic therefore lives in a `.ts` module with tests under it and the driver
// stays thin.

/** A projection as the GPU was told it, classified from the matrix rather than from source. */
export type ProjectionKind = 'orthographic' | 'perspective' | 'indeterminate';

/** A column-major 4x4, in the layout `THREE.Matrix4.elements` uploads. */
export type Mat4 = readonly number[];

/** Matrix indices that carry the classification. Column-major, so `[11]` is row 3 of column 2 —
 *  the term that copies `-z` into `w` and makes the perspective divide happen at all. */
const W_FROM_Z = 11;
const W_CONSTANT = 15;
/** The vertical scale term: `ndc.y = (m[5] * y_view + …) / clip.w`. */
const Y_SCALE = 5;

/** Floating-point slack. The terms being tested are exact integers in both projections three.js
 *  builds (0 / ±1), so this is generous rather than fitted — it exists to survive an f32 round
 *  trip through the GL uniform, not to make a marginal case come out. */
const EXACT = 1e-6;

/**
 * Classify a projection matrix as the driver received it.
 *
 * An ORTHOGRAPHIC projection leaves `clip.w` at a constant 1, so there is no perspective divide
 * and the delivered scale cannot vary with depth. A PERSPECTIVE projection sets `clip.w = -z`,
 * which is exactly the thing fence 4 forbids. Anything else is `indeterminate` and must be
 * reported as such rather than folded into whichever answer is convenient.
 */
export function classifyProjection(m: Mat4): ProjectionKind {
  if (m.length !== 16) return 'indeterminate';
  if (!m.every((v) => Number.isFinite(v))) return 'indeterminate';
  const wFromZ = m[W_FROM_Z] ?? Number.NaN;
  const wConst = m[W_CONSTANT] ?? Number.NaN;
  if (Math.abs(wFromZ) < EXACT && Math.abs(wConst - 1) < EXACT) return 'orthographic';
  if (Math.abs(wFromZ + 1) < EXACT && Math.abs(wConst) < EXACT) return 'perspective';
  return 'indeterminate';
}

/**
 * Delivered device pixels per world unit, at a point sitting `depth` units in front of the eye.
 *
 * ⚠ `depth` IS IGNORED FOR AN ORTHOGRAPHIC MATRIX, and that is the substance of the claim rather
 * than a shortcut: `clip.w` is 1, so the same world unit lands on the same number of pixels
 * wherever it sits in the frame. The near/far pair a caller computes from this therefore comes
 * back identical because the MEASURED matrix has no depth term — not because the formula dropped
 * one. Hand this a perspective matrix and it divides, and the pair separates again.
 */
export function pxPerUnitFrom(m: Mat4, viewportHeightPx: number, depth: number): number {
  const kind = classifyProjection(m);
  const yScale = m[Y_SCALE] ?? Number.NaN;
  const half = viewportHeightPx / 2;
  if (kind === 'orthographic') return half * yScale;
  if (kind === 'perspective') {
    if (!(depth > 0)) return Number.NaN;
    return (half * yScale) / depth;
  }
  return Number.NaN;
}

/**
 * View-space depth of a world point: how far in front of the eye it sits, from the view matrix
 * the driver received. Positive is in front.
 *
 * Column-major, so the third ROW is elements 2 / 6 / 10 / 14. three.js looks down its own −z, so
 * the negation is what turns that into a distance.
 */
export function viewDepthOf(view: Mat4, x: number, y: number, z: number): number {
  const a = view[2] ?? Number.NaN;
  const b = view[6] ?? Number.NaN;
  const c = view[10] ?? Number.NaN;
  const d = view[14] ?? Number.NaN;
  return -(a * x + b * y + c * z + d);
}

/** The three delivered scales a panel reports. Named because the whole reason there are three is
 *  that a PERSPECTIVE camera does not have one — and the point of this increment is that the
 *  shipped canvas now does. */
export interface DeliveredScale {
  /** At the framing target — the figure a single-number report would quote. */
  target: number;
  /** At the island corner NEAREST the eye. */
  near: number;
  /** At the island corner FURTHEST from the eye. */
  far: number;
  /** How the matrix classified. Carried alongside the numbers so a report can never quote a
   *  spread without saying which projection produced it. */
  kind: ProjectionKind;
}

/** The island footprint a scale is delivered over, in world units. */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
}

/**
 * Delivered scale at the target and at the nearest and furthest ground corners of `box`,
 * computed entirely from the two matrices the driver received.
 *
 * ⚠ A caller with no view matrix gets `indeterminate` and NaNs rather than a plausible number off
 * a transcribed camera. A missing instrument is a missing instrument.
 */
export function deliveredScale(
  projection: Mat4 | null,
  view: Mat4 | null,
  box: Footprint,
  viewportHeightPx: number,
): DeliveredScale {
  if (!projection) {
    return { target: Number.NaN, near: Number.NaN, far: Number.NaN, kind: 'indeterminate' };
  }
  const kind = classifyProjection(projection);
  /* ⚠⚠ AN ORTHOGRAPHIC PROJECTION NEEDS NO VIEW MATRIX, AND THAT IS THE CLAIM RATHER THAN A
     SHORTCUT. `clip.w` is a constant 1, so the delivered scale cannot vary with depth and there is
     nothing a view matrix could contribute — requiring one would make the instrument unable to
     report the very property it exists to establish. It matters in practice too: three's shaders
     for `meshStandardMaterial` never reference `viewMatrix`, so the GLSL compiler eliminates it
     and `getUniformLocation` returns null (measured on the RTX 2060, 2026-08-28, off the page's
     own name census). A probe that REQUIRED it would report `indeterminate` for a canvas that is
     perfectly compliant. The perspective branch below genuinely does need it, and refuses without
     it rather than guessing. */
  if (kind === 'orthographic') {
    const one = pxPerUnitFrom(projection, viewportHeightPx, Number.NaN);
    return { target: one, near: one, far: one, kind };
  }
  /* ⚠ THE KIND SURVIVES EVEN WHEN THE SPREAD DOES NOT, and getting this wrong once already cost a
     run. Returning `indeterminate` here — which is what the first version did — throws away a
     classification that was correctly made from the matrix, and the refusal downstream then
     reports "the page captured no matrix" about a canvas whose perspective matrix it read
     perfectly. `indeterminate` means the MATRIX could not be classified. A perspective matrix with
     no view matrix beside it is a classified matrix with an unavailable spread, and the two must
     not be reported as the same thing. */
  if (!view) {
    return { target: Number.NaN, near: Number.NaN, far: Number.NaN, kind };
  }
  const corners: [number, number][] = [
    [box.minX, box.minZ],
    [box.minX, box.maxZ],
    [box.maxX, box.minZ],
    [box.maxX, box.maxZ],
  ];
  const depths = corners.map(([x, z]) => viewDepthOf(view, x, 0, z));
  return {
    target: pxPerUnitFrom(projection, viewportHeightPx, viewDepthOf(view, box.cx, 0, box.cz)),
    near: pxPerUnitFrom(projection, viewportHeightPx, Math.min(...depths)),
    far: pxPerUnitFrom(projection, viewportHeightPx, Math.max(...depths)),
    kind,
  };
}

/**
 * The headline: how much more of a world unit the near edge of the island gets than the far edge,
 * as a percentage. Zero for an orthographic projection BY MEASUREMENT — the matrix carried no
 * depth term — and 5.1% is what the shipped perspective camera delivered on the reference island
 * (PR #1679, reproduced on the RTX 2060 on 2026-08-28).
 */
export function perspectiveSpreadPct(s: DeliveredScale): number {
  if (!(s.far > 0) || !Number.isFinite(s.near)) return Number.NaN;
  return (s.near / s.far - 1) * 100;
}

