// act2Intro — the Act 2 introduction's app-owned clock and control state (ADR-0282 D6).
//
// The owner clicks one control and the whole forest regrows from nothing, outward from the base
// nodes, in the story graph's own dependency order. Everything about HOW that plays lives on this
// side of the seam: the clock, the ordering, normalized progress, the holds, Back, Replay and the
// reduced-motion settlement. Nothing is asset-owned and there is no remount key standing in for a
// cursor — the cursor IS the state.
//
// The ORDER itself is not decided here: `deriveForestRegrowPlan` (@storytree/app-surface) derives
// it from the real story graph, so this module never scripts a sequence (ADR-0282 D3/D8).
//
// It runs on the REAL map, not a witness stage: same world, same scene, same trails. What the
// gate adds is a cursor and a control; what it never does is change the clean route.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deriveForestRegrowPlan,
  forestRegrowAtProgress,
  forestRegrowLayerSignature,
  forestRegrowRenderLayer,
  forestRegrowTrailPlan,
  forestRegrowTrailSignature,
  type ForestRegrowAccretionPlans,
  type ForestRegrowPlan,
  type ForestRegrowRenderLayer,
  type ForestRegrowState,
  type ForestRegrowStory,
  type ForestRegrowTrailEdge,
  type TrailRevealPlan,
} from '@storytree/app-surface';

/**
 * `?act2=intro` — the ONE value that mounts the Act 2 regrow control on the real map. Absence, an
 * empty value, and any OTHER value (including near-misses like `?act2=on` or `?act2=intro-x`) leave
 * the clean Studio route byte-for-byte unchanged. An EXACT match, never a truthy/loose gate.
 */
export function readAct2Intro(search: string): boolean {
  return new URLSearchParams(search).get('act2') === 'intro';
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The live reduced-motion preference. Subscribed rather than sampled once: a viewer who turns the
 * system setting on mid-regrow should land on the grown forest, not finish the animation they just
 * asked to stop. SSR-safe (no window ⇒ full motion, matching the browser default).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION_QUERY).matches === true,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (): void => setReduced(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Hold the regrow's render layer STABLE while the picture is not moving.
 *
 * A forest-map frame's cost is rasterisation (ADR-0272), and any write inside the SVG invalidates
 * paint for the whole subtree — so a new layer object on a frame that would paint the identical
 * picture costs a full repaint for nothing. Measured on the real corpus: those frames were ~300 ms
 * each. Reusing the previous object keeps `SceneView`'s `React.memo` bail-out intact and makes them
 * free. It changes WHEN the map repaints, never WHAT it paints — two layers with the same
 * signature draw the same frame by construction.
 */
export function useStableForestRegrowLayer(
  state: ForestRegrowState | null,
  plans: ForestRegrowAccretionPlans | null,
  active: boolean,
): ForestRegrowRenderLayer | null {
  const held = useRef<{ signature: string; layer: ForestRegrowRenderLayer } | null>(null);
  if (!active || !state || !plans) {
    held.current = null;
    return null;
  }
  const signature = forestRegrowLayerSignature(state);
  if (held.current?.signature === signature) return held.current.layer;
  const layer = forestRegrowRenderLayer(state, plans);
  held.current = { signature, layer };
  return layer;
}

/**
 * The same stability hold for the PATHWAY half (ADR-0283 D1): the cursor-driven trail plan that
 * feeds the per-segment reveal masks. Rebuilt only when a front has actually moved, so a frame
 * where nothing is drawing hands back the identical object and the scene's memo bail-out survives.
 *
 * Null when no pathway is mid-draw — which is also the signal that every road on the map is
 * simply painted, with no mask anywhere.
 */
export function useStableForestRegrowTrails(
  state: ForestRegrowState | null,
  usageById: ReadonlyMap<string, number>,
  active: boolean,
): TrailRevealPlan | null {
  const held = useRef<{ signature: string; plan: TrailRevealPlan | null } | null>(null);
  if (!active || !state) {
    held.current = null;
    return null;
  }
  const signature = forestRegrowTrailSignature(state);
  if (held.current?.signature === signature) return held.current.plan;
  const plan = forestRegrowTrailPlan(state, usageById);
  held.current = { signature, plan };
  return plan;
}

export interface Act2IntroClock {
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(requestId: number): void;
}

const BROWSER_CLOCK: Act2IntroClock = {
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (requestId) => window.cancelAnimationFrame(requestId),
};

export interface Act2IntroInput {
  readonly enabled: boolean;
  readonly stories: readonly ForestRegrowStory[] | null;
  readonly edges: readonly ForestRegrowTrailEdge[] | null;
  /** Segment id → drawn length in world units, so a pathway's pace follows the real routed
   *  geometry rather than a per-segment guess (ADR-0283 D1: growth runs along the real trail). */
  readonly segmentLengths?: ReadonlyMap<string, number> | null;
  readonly reducedMotion?: boolean;
  readonly clock?: Act2IntroClock;
}

export interface Act2IntroPlayer {
  /** The plan, or null when the gate is off or the graph is not loaded yet. */
  readonly plan: ForestRegrowPlan | null;
  /** The selected regrow state, or null when there is nothing to regrow. */
  readonly state: ForestRegrowState | null;
  readonly progress: number;
  readonly playing: boolean;
  /** True while the cursor is anywhere before the settled forest. */
  readonly regrowing: boolean;
  /** Which wave the cursor is in — for the control's own readout, not for the render. */
  readonly wave: number;
  /** Start (or resume) the regrow from wherever the cursor is; from 0 if it is already settled. */
  readonly play: () => void;
  readonly pause: () => void;
  /** Restart from nothing and play. */
  readonly replay: () => void;
  /** Step the cursor back to the start of the previous wave and hold there. */
  readonly back: () => void;
  /** Jump to the fully grown forest — also where reduced motion settles. */
  readonly settle: () => void;
}

const IDLE: Act2IntroPlayer = {
  plan: null,
  state: null,
  progress: 1,
  playing: false,
  regrowing: false,
  wave: 0,
  play: () => {},
  pause: () => {},
  replay: () => {},
  back: () => {},
  settle: () => {},
};

/** The normalized cursor at which a wave's FIRST island begins to accrete. */
export function waveStartProgress(plan: ForestRegrowPlan, wave: number): number {
  const starts = plan.steps.filter((step) => step.wave === wave).map((step) => step.start);
  return starts.length === 0 ? 0 : Math.min(...starts);
}

/** The wave a cursor sits in — the latest wave that has begun. */
export function waveAtProgress(plan: ForestRegrowPlan, progress: number): number {
  let wave = 0;
  for (const step of plan.steps) {
    if (step.start <= progress && step.wave > wave) wave = step.wave;
  }
  return wave;
}

/**
 * The cursor Back should land on: the start of the wave BEFORE the one currently in flight, so a
 * repeated Back walks the forest backwards a layer at a time rather than nudging by a frame.
 */
export function backProgress(plan: ForestRegrowPlan, progress: number): number {
  const current = waveAtProgress(plan, progress);
  // Already a little way into a wave ⇒ Back returns to the top of THIS wave first.
  const top = waveStartProgress(plan, current);
  if (progress > top + 1e-6) return top;
  return current === 0 ? 0 : waveStartProgress(plan, current - 1);
}

export function useAct2Intro({
  enabled,
  stories,
  edges,
  segmentLengths,
  reducedMotion,
  clock,
}: Act2IntroInput): Act2IntroPlayer {
  const plan = useMemo(
    () =>
      enabled && stories && stories.length > 0
        ? deriveForestRegrowPlan(
            stories,
            edges ?? [],
            segmentLengths ? { segmentLengths } : {},
          )
        : null,
    [enabled, stories, edges, segmentLengths],
  );
  // The cursor. A regrow starts SETTLED — opening the gated route shows the real forest as it is,
  // and the control is what rewinds it to nothing. Anything else would hide the product behind an
  // animation the owner did not ask for yet.
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // A new plan (a re-pulled tree, a different graph) invalidates the cursor rather than leaving it
  // pointing into a schedule that no longer exists.
  useEffect(() => {
    setProgress(1);
    setPlaying(false);
  }, [plan]);

  // ADR-0282 D6: reduced motion settles on the FULLY GROWN forest — not a frozen half-forest and
  // not a shorter animation. The app owns that settlement rather than leaning on a stylesheet.
  useEffect(() => {
    if (!reducedMotion) return;
    setPlaying(false);
    setProgress(1);
  }, [reducedMotion]);

  useEffect(() => {
    if (!plan || !playing || reducedMotion) return;
    const tick = clock ?? BROWSER_CLOCK;
    let requestId = 0;
    let previous: number | null = null;
    let cancelled = false;
    const step = (timestamp: number): void => {
      if (cancelled) return;
      // The cursor advances by REAL elapsed time, so the regrow takes about the duration its plan
      // says whatever the frame rate is — a slow frame shows less of the growth, it does not
      // stretch the intro. (An earlier 100 ms clamp did stretch it: measured on the real corpus,
      // frames at the full forest cost ~350 ms, so a 20 s regrow crawled past a minute.) The
      // remaining clamp is only a backstop against a pathological gap; the real hazard — a hidden
      // tab banking minutes of rAF debt — is handled by pausing on `visibilitychange` below.
      const raw = previous === null ? 1000 / 60 : timestamp - previous;
      previous = timestamp;
      const deltaMs = Math.min(Math.max(raw, 0), 500);
      // Global time is LINEAR on purpose: the plan's own wave pacing is the easing, and the
      // per-island accretion smoothsteps inside its own window. A second global ease on top would
      // distort the dependency schedule the order is supposed to make legible.
      const next = Math.min(1, progressRef.current + deltaMs / plan.durationMs);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else requestId = tick.requestFrame(step);
    };
    requestId = tick.requestFrame(step);
    return () => {
      cancelled = true;
      tick.cancelFrame(requestId);
    };
  }, [plan, playing, reducedMotion, clock, runId]);

  // A hidden tab banks rAF debt (and in some browsers stops delivering frames entirely), so a
  // regrow left running behind another window would either freeze or leap on return. Pausing is
  // the honest behaviour: the owner comes back to where they left the forest, and Resume plays on.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = (): void => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const state = useMemo(
    () => (plan ? forestRegrowAtProgress(plan, progress) : null),
    [plan, progress],
  );

  const play = useCallback(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      setProgress(0);
    }
    setRunId((id) => id + 1);
    setPlaying(true);
  }, [reducedMotion]);

  const pause = useCallback(() => setPlaying(false), []);

  const replay = useCallback(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    progressRef.current = 0;
    setProgress(0);
    setRunId((id) => id + 1);
    setPlaying(true);
  }, [reducedMotion]);

  const back = useCallback(() => {
    if (!plan) return;
    const next = backProgress(plan, progressRef.current);
    progressRef.current = next;
    setProgress(next);
    setPlaying(false);
  }, [plan]);

  const settle = useCallback(() => {
    progressRef.current = 1;
    setProgress(1);
    setPlaying(false);
  }, []);

  if (!plan || !state) return IDLE;
  return {
    plan,
    state,
    progress,
    playing,
    regrowing: progress < 1,
    wave: waveAtProgress(plan, progress),
    play,
    pause,
    replay,
    back,
    settle,
  };
}
