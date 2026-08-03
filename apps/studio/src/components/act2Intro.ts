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
  vegetationLayerSignature,
  vegetationProgressByStory,
  vegetationRenderLayer,
  type IslandVegetationPlan,
  type VegetationRenderLayer,
} from '@storytree/app-surface';

/**
 * `?act2=intro` — the ONE value that mounts the Act 2 regrow's DIAGNOSTIC control on the real map,
 * and forces the regrow to play whatever the session flag below says. Absence, an empty value, and
 * any OTHER value (including near-misses like `?act2=on` or `?act2=intro-x`) leave that control
 * unmounted. An EXACT match, never a truthy/loose gate.
 *
 * It is no longer what makes the regrow REACHABLE (ADR-0286): the regrow now plays on first arrival
 * on the clean route, and its owner-facing transport lives in world settings. What this param still
 * buys is a run every time — a stable URL to hand someone who has to watch it — plus the factual
 * readout (depth, islands landed, pathways growing, percent) that the gear controls do not carry.
 */
export function readAct2Intro(search: string): boolean {
  return new URLSearchParams(search).get('act2') === 'intro';
}

/**
 * `?veg2=off` — the ONE value that takes the map back to its pre-ADR-0292 render: no shared tree
 * track, no plant track, no per-object sprouting. Absence, an empty value, and any OTHER value
 * (including near-misses like `?veg2=false` or `?veg2=off-x`) leave the growth ON.
 *
 * It is a KILL SWITCH, not a gate. ADR-0292 is a decided ADR whose central choice — exp-16, on every
 * island — the owner made directly in conversation, and the arc's end state describes them watching
 * the regrow on the CLEAN route at the default speed, which a flag would put behind a URL they have
 * to remember. What this buys is the LOOK comparison: the same corpus, the same run, one parameter
 * apart, so the before and after can be held side by side while the appearance is unattested
 * (ADR-0070 stage 2 is the owner's, and nothing in this increment signs it).
 *
 * An EXACT match, never a truthy/loose gate — an over-eager reader here would silently disable the
 * arc for anyone whose URL happened to carry a `veg2` key.
 */
export function readVegetationGrowthOff(search: string): boolean {
  return new URLSearchParams(search).get('veg2') === 'off';
}

/**
 * The `sessionStorage` key that remembers this browser session has already arrived at the map.
 *
 * Session-scoped on purpose (ADR-0286, owner-directed): the regrow plays on the FIRST visit and the
 * map is static for the rest of the session. `localStorage` would show it once ever — too little
 * for something that is meant to introduce the product — and no flag at all would replay it on
 * every navigation back to the tree, which turns a title sequence into a tax.
 */
export const ACT2_INTRO_SESSION_KEY = 'storytree.act2.arrived';

/** The session store, or `null` when there is none (SSR, or a browser refusing storage). */
export function act2IntroStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    // Safari in private mode, and any embedding that blocks storage, THROW on access rather than
    // returning null. A regrow is not worth an exception on the way into the map.
    return null;
  }
}

/**
 * Has this browser session already arrived at the map? A pure READ — call {@link markAct2IntroArrived}
 * to record the arrival.
 *
 * Fails toward PLAYING (`false` ⇒ first visit) when there is no storage at all, because a viewer who
 * blocks storage should still get the introduction; the cost of being wrong is one extra regrow.
 */
export function act2IntroAlreadyArrived(storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ACT2_INTRO_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

/** Record the arrival, so the rest of the session gets the static map. Silently a no-op with no
 *  storage — the read above is the half that matters, and it fails toward playing. */
export function markAct2IntroArrived(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(ACT2_INTRO_SESSION_KEY, '1');
  } catch {
    /* a full or blocked quota is not a reason to fail the map */
  }
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

/**
 * The same stability hold for the VEGETATION half (ADR-0292): the per-object growth layer that turns
 * each island's own accretion cursor into a tree frame, a plant frame, a rooted sprout scale and a
 * nameplate offset.
 *
 * Unlike the two holds above this one is NOT gated on a run being in flight, because the settled map
 * needs it too — the tree on a landed island is the shared track's mature frame, not the vector art it
 * replaced. With no regrow (`state === null`) every island sits at 1, the signature is a constant, and
 * the identical layer object is handed back on every frame for the rest of the session. That is what
 * keeps `SceneView`'s memo bail-out intact on a quiet forest, which is the whole of this arc's
 * frame-cost claim: growth rides frames that are already repainting, and a settled map pays nothing.
 */
export function useStableVegetationLayer(
  plans: ReadonlyMap<string, IslandVegetationPlan> | null,
  state: ForestRegrowState | null,
  storyIds: readonly string[],
): VegetationRenderLayer | null {
  const held = useRef<{
    plans: ReadonlyMap<string, IslandVegetationPlan>;
    signature: string;
    layer: VegetationRenderLayer;
  } | null>(null);
  if (!plans || plans.size === 0) {
    held.current = null;
    return null;
  }
  // The plans are keyed by scene-node IDENTITY, so a new scene invalidates the layer even when the
  // cursor has not moved — comparing the plan map itself is the only honest guard.
  const signature = vegetationLayerSignature(state);
  if (held.current?.plans === plans && held.current.signature === signature) return held.current.layer;
  const layer = vegetationRenderLayer(plans, vegetationProgressByStory(state, storyIds));
  held.current = { plans, signature, layer };
  return layer;
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
  /**
   * How fast the cursor crosses the plan (ADR-0286). `1` is the plan's OWN duration — the pace the
   * graph's pathway geometry derives. Below 1 stretches it, above 1 compresses it.
   *
   * It scales the CLOCK, never the schedule: every island still forms exactly where its incoming
   * pathway arrives, in the same proportion of the run. Re-deriving the plan per speed would move
   * the arrivals themselves, which is the one thing ADR-0285's causal invariant is about.
   */
  readonly speed?: number;
  /**
   * A regrow is ABOUT to be started (ADR-0286) — so a fresh plan opens on NOTHING rather than on
   * the settled forest.
   *
   * Without it the first arrival flashes the finished forest. The cursor's resting value is 1, the
   * caller cannot call `replay` until the scene exists to regrow, and the render that first has a
   * scene therefore COMMITS the whole settled map — one full-forest paint — before the effect
   * rewinds it. That is the opposite of "grows from nothing", and it is the most expensive frame on
   * the surface.
   *
   * Only meaningful for the FIRST run: a replay asked for later starts from a forest that is
   * already on screen, so there is nothing to avoid showing.
   */
  readonly pendingStart?: boolean;
  readonly clock?: Act2IntroClock;
}

/**
 * A content signature of everything `deriveForestRegrowPlan` reads.
 *
 * The plan has to survive a re-fetch that changes nothing. The studio paints from a cached tree
 * payload and then confirms it against `/api/tree` (ADR-0240), so `stories` arrives as a NEW array
 * holding the SAME graph seconds later — and a new plan resets the cursor, which would have killed
 * an auto-playing intro mid-run every single time the confirm landed. Keying the plan on what it is
 * DERIVED from rather than on array identity is what makes the run survive that.
 *
 * Lengths are rounded to whole world units: the routed network is deterministic given the same
 * story ids, so re-routing reproduces them, and a float wobble is not a different forest.
 */
export function forestRegrowGraphKey(
  stories: readonly ForestRegrowStory[],
  edges: readonly ForestRegrowTrailEdge[],
  segmentLengths?: ReadonlyMap<string, number> | null,
): string {
  const storyPart = stories
    .map((story) => `${story.id}>${[...story.dependsOn].sort().join(',')}`)
    .sort()
    .join(';');
  const edgePart = edges
    .map(
      (edge) =>
        `${edge.from}>${edge.to}>${edge.segments
          .map((ref) => `${ref.id}${ref.reversed === true ? '~' : ''}:${Math.round(segmentLengths?.get(ref.id) ?? -1)}`)
          .join(',')}`,
    )
    .sort()
    .join(';');
  return `${storyPart}|${edgePart}`;
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
  speed,
  pendingStart,
  clock,
}: Act2IntroInput): Act2IntroPlayer {
  const graphKey = useMemo(
    () =>
      enabled && stories && stories.length > 0
        ? forestRegrowGraphKey(stories, edges ?? [], segmentLengths)
        : null,
    [enabled, stories, edges, segmentLengths],
  );
  // Hold the plan by its GRAPH, not by the identity of the arrays it came from — see
  // `forestRegrowGraphKey`. The ref write during render mirrors `useStableForestRegrowLayer`
  // above: it is a memo whose key is content, and it never reads back a value it did not just
  // compute from the current inputs.
  const held = useRef<{ key: string; plan: ForestRegrowPlan } | null>(null);
  const plan = useMemo(() => {
    if (graphKey === null || !stories) {
      held.current = null;
      return null;
    }
    if (held.current?.key === graphKey) return held.current.plan;
    const next = deriveForestRegrowPlan(stories, edges ?? [], segmentLengths ? { segmentLengths } : {});
    held.current = { key: graphKey, plan: next };
    return next;
    // `stories` / `edges` / `segmentLengths` are read here but deliberately not deps: `graphKey`
    // IS their content, so re-running on their identity is exactly what this hold exists to stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey]);
  // Where the cursor RESTS when there is no run: the settled forest. A map that is not regrowing
  // shows the product, not an animation nobody asked for. The exception is a run already on its
  // way (`pendingStart`) — see the field's own note: opening on 1 there means committing one full
  // settled paint before the rewind, which is the flash the intro exists to avoid.
  const restingProgress = pendingStart === true ? 0 : 1;
  // Read at the two moments the cursor is (re)seeded, never as a dependency — flipping this must
  // not itself rewind a run in flight.
  const restingRef = useRef(restingProgress);
  restingRef.current = restingProgress;

  const [progress, setProgress] = useState(restingProgress);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // A new plan (a re-pulled tree, a different graph) invalidates the cursor rather than leaving it
  // pointing into a schedule that no longer exists. A plan that is merely the SAME graph re-fetched
  // never reaches here — see `forestRegrowGraphKey`.
  useEffect(() => {
    setProgress(restingRef.current);
    setPlaying(false);
  }, [plan]);

  // ADR-0282 D6: reduced motion settles on the FULLY GROWN forest — not a frozen half-forest and
  // not a shorter animation. The app owns that settlement rather than leaning on a stylesheet.
  useEffect(() => {
    if (!reducedMotion) return;
    setPlaying(false);
    setProgress(1);
  }, [reducedMotion]);

  // The speed dial, sanitised once. A non-finite or non-positive value would stall the cursor
  // forever (or run it backwards), so it falls back to the plan's own pace rather than trusting
  // whatever arrived from the URL.
  const rate = Number.isFinite(speed) && (speed as number) > 0 ? (speed as number) : 1;

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
      //
      // `rate` (ADR-0286) is a plain multiplier on elapsed time, which is why it can only stretch
      // or compress the run: every island's `start`/`end` is a FRACTION of the plan, so scaling how
      // fast the cursor crosses it leaves the whole schedule proportionally identical.
      const next = Math.min(1, progressRef.current + (deltaMs * rate) / plan.durationMs);
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
  }, [plan, playing, reducedMotion, clock, runId, rate]);

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
