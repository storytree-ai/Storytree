// motionSettled — the app's own POSITIVELY-ASSERTED answer to "is this frame still moving?"
// (frontend-visual-judgment-arc, increment frontend-settled-signal-from-the-app).
//
// WHY THIS EXISTS. A blind `frontend-builder` run on 2026-08-15 concluded the forest map was
// "caught mid-animation, before the map settled" — a guess it had no way to check. It reached for
// two things and both misled it: it read `class="world-scene lane-motion-draw"` as an in-progress
// motion state (the class is PERMANENT — see the note below), and it sampled the camera transform
// on an unprepared first load and reasoned about the settled capture from it. This module is the
// fix: a discrete fact the app sets when it has nothing left in flight, readable from outside the
// renderer via `Element.getAnimations()` + one existing player flag — never a class, never a
// heuristic, never "no rAF for N ms" (which a busy box can fool).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `lane-motion-draw` IS NOT A LIVENESS SIGNAL. DO NOT RE-DERIVE THE 2026-08-15 MISTAKE.
//
// `world-scene lane-motion-${selectionMotion}` (TreeView.tsx) names which MOTION MODE a lane draws
// with when it starts drawing — `draw` (the default) vs `march` vs `none` — a per-page SETTING, not
// a per-frame STATE. The fully-settled, correct CONTROL render carries `lane-motion-draw` exactly as
// the broken SHIPPED render does: same class, two different amounts of actual motion. Reading it as
// "still animating" is indistinguishable, from the class alone, from reading nothing at all.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT ACTUALLY MOVES, AND HOW EACH IS CAUGHT:
//   - ADR-0286's Act 2 arrival regrow, and ADR-0292's per-object vegetation growth riding the same
//     cursor: both write DOM attributes IMPERATIVELY every animation frame (`useAct2Intro`'s own
//     rAF loop) — no CSS `Animation` object ever exists for either, so `getAnimations()` cannot see
//     them. `act2Player.regrowing` (`progress < 1`) is the app's own positive flag for this half.
//   - The camera fit / pan-zoom transition, a lane's draw-on (`lane-draw`), a pathway's reveal
//     (`trail-reveal-grow`), a neighbour's shore pulse (`shore-pulse`), an arrival's pop-in
//     (`arrive-ground`/`arrive-pop`): every one of these is a real CSS Animation or Transition with
//     a FINITE duration, so `Element.getAnimations({ subtree: true })` reports it directly while it
//     is running or pending.
//   - What must NOT count: the DECORATIVE loops that are meant to run for the life of the page —
//     the marching-ants lane (`lane-march`), the build/claim wisp glow, the hover breathe, the chat
//     caret, the load spinner. Each declares `iterations: Infinity`, so a settle predicate built on
//     "any animation is running" would never resolve. `isStructuralAnimation` is the filter that
//     keeps those out without needing to name each one.

/**
 * The subset of the Web Animations API's `Animation` this module reads. Deliberately narrow so a
 * unit test can hand it a plain object instead of a real browser `Animation` — jsdom (this
 * package's test runtime) does not implement the Web Animations API at all.
 */
export interface StructuralAnimationLike {
  readonly playState: 'idle' | 'running' | 'paused' | 'finished' | string;
  readonly effect: { getTiming(): { readonly iterations?: number } } | null;
}

/**
 * True for a CSS Animation/Transition that will resolve on its own — a one-shot draw-on, reveal or
 * pulse. False for a DECORATIVE loop (`iterations: Infinity`) that is meant to run for the life of
 * the page: counting those as "in flight" would mean a settle predicate never returns true on a map
 * with a single marching lane or a live build wisp.
 */
export function isStructuralAnimation(animation: StructuralAnimationLike): boolean {
  const iterations = animation.effect?.getTiming().iterations;
  return iterations !== Number.POSITIVE_INFINITY;
}

/** A finite animation counts as "in flight" while it is actually playing or about to. */
export function isAnimationInFlight(animation: StructuralAnimationLike): boolean {
  return animation.playState === 'running' || animation.playState === 'pending';
}

/**
 * How many one-shot CSS animations/transitions are currently mid-flight. Pure — the browser-reading
 * half (`readStructuralAnimations`) hands this the live list; this function makes no DOM call, so it
 * is the part a red/green test asserts against directly.
 */
export function countActiveStructuralAnimations(
  animations: readonly StructuralAnimationLike[],
): number {
  return animations.filter((animation) => isStructuralAnimation(animation) && isAnimationInFlight(animation))
    .length;
}

/**
 * Thin browser wrapper: `Element.getAnimations({ subtree: true })` is the ground truth for every
 * CSS Animation/Transition running anywhere under `root` (decorative loops included — filtering
 * those out is `countActiveStructuralAnimations`'s job, not this one's). Returns `[]` when the API
 * is unavailable (jsdom, an old engine, an unmounted root) rather than throwing: a missing API fails
 * toward "nothing observed", never toward blocking a capture forever.
 */
export function readStructuralAnimations(
  root: { getAnimations?: (opts: { subtree: boolean }) => readonly StructuralAnimationLike[] } | null,
): readonly StructuralAnimationLike[] {
  if (!root?.getAnimations) return [];
  try {
    return root.getAnimations({ subtree: true });
  } catch {
    // A detached/unmounted root can throw rather than return []; treat it the same as "nothing to
    // observe" — the caller's next poll reads the current (possibly re-mounted) root anyway.
    return [];
  }
}

export interface MotionSettledInput {
  /**
   * ADR-0286's Act 2 arrival regrow AND ADR-0292's per-object vegetation growth: both are driven by
   * the SAME `useAct2Intro` cursor and write DOM attributes imperatively every frame, so
   * `getAnimations()` cannot see either — this flag is the positive assertion for that half.
   */
  readonly act2Regrowing: boolean;
  /** `countActiveStructuralAnimations(readStructuralAnimations(sceneRoot))` — every CSS-driven
   *  one-shot motion currently mid-flight under the scene root (camera transition, lane draw-on,
   *  trail reveal, shore pulse, arrival pop-in). */
  readonly activeStructuralAnimations: number;
}

export type MotionSettledReason = 'act2-regrow' | 'structural-animation';

/**
 * Every reason the frame is still moving, or `[]` when it is settled. Never a heuristic: each entry
 * names a positively-asserted fact the app already computes for its own render, not an inference
 * from a CSS class or an elapsed-time guess.
 */
export function motionSettledReasons(input: MotionSettledInput): readonly MotionSettledReason[] {
  const reasons: MotionSettledReason[] = [];
  if (input.act2Regrowing) reasons.push('act2-regrow');
  if (input.activeStructuralAnimations > 0) reasons.push('structural-animation');
  return reasons;
}

export function isMotionSettled(input: MotionSettledInput): boolean {
  return motionSettledReasons(input).length === 0;
}

export interface MotionSettledSnapshot {
  readonly settled: boolean;
  readonly reasons: readonly MotionSettledReason[];
  readonly activeStructuralAnimations: number;
  readonly act2Regrowing: boolean;
}

/** The whole attestation — the shape stamped onto a capture and read back by `waitForFunction`. */
export function motionSettledSnapshot(input: MotionSettledInput): MotionSettledSnapshot {
  return {
    settled: isMotionSettled(input),
    reasons: motionSettledReasons(input),
    activeStructuralAnimations: input.activeStructuralAnimations,
    act2Regrowing: input.act2Regrowing,
  };
}

/**
 * The name the bridge is published under on `window` (TreeView.tsx). A plain string constant
 * (rather than importing the whole module into a `declare global`) keeps this module importable
 * from a Node-side capture script without pulling in a DOM lib dependency.
 */
export const MOTION_SETTLED_BRIDGE_KEY = '__storytreeMotionSettled' as const;

export type MotionSettledBridge = () => MotionSettledSnapshot;

declare global {
  interface Window {
    /** The bridge TreeView publishes while mounted. `undefined` before mount and after unmount —
     *  a caller (Playwright's `waitForFunction`, a devtools console) must treat a missing bridge
     *  the same as "not settled yet", never as "settled by default". */
    __storytreeMotionSettled?: MotionSettledBridge;
  }
}
