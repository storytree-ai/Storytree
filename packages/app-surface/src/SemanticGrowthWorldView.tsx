import React from 'react';
import { trailFillWidth, type SceneNode } from '@storytree/forest-world';
import {
  WorldSceneView,
  type WorldPresentationEvents,
  type WorldPresentationModel,
} from './WorldSceneView.js';
import {
  collectDefBounds,
  parseSimpleTransform,
  wrapperContentBounds,
  type Bounds,
} from './sprite-sizing.js';
import {
  advanceOrganicPosePlayback,
  clampOrganicPoseProgress,
  initialOrganicPosePlayback,
  organicPoseFrameAtProgress,
  replayOrganicPosePlayback,
  selectOrganicPoseCue,
  validateOrganicPoseRegistry,
  type OrganicPosePoint,
  type OrganicPosePlaybackState,
  type RegisteredOrganicPoseRegistry,
} from './organic-pose-to-pose-track.js';
import {
  deriveSvgIslandAccretionPlan,
  svgIslandAccretionAtProgress,
  type SvgIslandAccretionPoint,
} from './svg-island-accretion.js';
// The public view itself imports/loads its co-located motion stylesheet, so a consumer
// cannot mount an inert semantic player by forgetting a separate CSS side effect.
import './semantic-growth.css';

const FRAME_KEYS = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;

export type SemanticGrowthFrameKey = (typeof FRAME_KEYS)[number];

export interface SemanticGrowthFrame {
  readonly key: SemanticGrowthFrameKey;
  readonly model: WorldPresentationModel;
}

export interface SemanticGrowthAnimationClock {
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(requestId: number): void;
}

export interface SemanticGrowthOrganicPoseInstance {
  readonly trackId: string;
  readonly worldAnchor: OrganicPosePoint;
  readonly scale: number;
  readonly progressWindow: {
    readonly start: number;
    readonly end: number;
  };
}

export interface SemanticGrowthOrganicPoseLayer {
  readonly registry: RegisteredOrganicPoseRegistry;
  readonly instances: readonly SemanticGrowthOrganicPoseInstance[];
  readonly nativeIsland: {
    readonly storyId: string;
    readonly worldAnchor: OrganicPosePoint;
    readonly radius: OrganicPosePoint;
    readonly settledAtProgress: number;
  };
  readonly clock?: SemanticGrowthAnimationClock;
}

export interface SemanticGrowthSvgIslandAccretion {
  readonly storyId: string;
  readonly worldAnchor: SvgIslandAccretionPoint;
  /** Duration of the initial empty-to-land accretion only; later pose cues retain their control timing. */
  readonly growthDurationMs: number;
}

export interface SemanticGrowthWorldViewProps {
  readonly frames: readonly SemanticGrowthFrame[];
  readonly reducedMotion?: boolean;
  readonly events?: WorldPresentationEvents;
  readonly onNext?: (key: SemanticGrowthFrameKey) => void;
  readonly onBack?: (key: SemanticGrowthFrameKey) => void;
  readonly onReplay?: (key: SemanticGrowthFrameKey) => void;
  readonly organicPoseGrowth?: SemanticGrowthOrganicPoseLayer;
  readonly svgIslandAccretion?: SemanticGrowthSvgIslandAccretion;
}

function assertFrames(frames: readonly SemanticGrowthFrame[]): void {
  if (frames.length !== FRAME_KEYS.length) {
    throw new Error('Semantic growth requires exactly six ordered frames.');
  }
  for (let index = 0; index < FRAME_KEYS.length; index += 1) {
    if (frames[index]?.key !== FRAME_KEYS[index]) {
      throw new Error('Semantic growth frames must be unique and ordered.');
    }
  }
}

/** Remove only motion metadata, retaining the source scene's real semantic markers. */
function withoutOrbit(node: SceneNode): SceneNode {
  const { phase: _phase, ...stationary } = node;
  if (node.el !== 'g') return stationary as SceneNode;
  return {
    ...stationary,
    children: node.children.map(withoutOrbit),
  } as SceneNode;
}

function browserPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** The trail passes that draw a named segment. All four carry the SAME `d` for a given segment
 *  id (`buildTrails` renders one path per pass off one `TrailSegment`), so the first occurrence
 *  in scene order resolves it — the shadow/casing/fill/ghost split is a painter concern only. */
const TRAIL_SEGMENT_KINDS: ReadonlySet<string> = new Set([
  'trail-shadow',
  'trail-casing',
  'trail-fill',
  'trail-ghost',
]);

/**
 * Segment id → the path data the SCENE drew for it.
 *
 * `RevealSegment` deliberately carries no `d` (it is a pure timing/direction plan over segment
 * IDS), and the draw-on mask must lie exactly over the stroke it grows, so the geometry is
 * resolved from the same scene the player is about to render rather than taken as a second prop
 * that could disagree with it. This mirrors how `SceneView` already reads `id` + `d` off the
 * trail children when it attaches the mask reference.
 */
function trailSegmentPathData(
  node: SceneNode,
  into: Map<string, string> = new Map(),
): ReadonlyMap<string, string> {
  if (node.el === 'g') {
    for (const child of node.children) trailSegmentPathData(child, into);
    return into;
  }
  if (
    node.el === 'path' &&
    node.id !== undefined &&
    node.kind !== undefined &&
    TRAIL_SEGMENT_KINDS.has(node.kind) &&
    !into.has(node.id)
  ) {
    into.set(node.id, node.d);
  }
  return into;
}

/**
 * The ADR-0169 arrival draw-on masks for a frame that carries a plan — one solid white stroke
 * per revealed segment over that segment's own path, `pathLength`-normalised so the CSS dash
 * animation grows it length-agnostically, staggered by the plan's own `delayMs`.
 *
 * Composed from the live map's `<defs>` (TreeView.tsx) because `SceneView` only ever REFERENCES
 * these ids: a `mask="url(#trail-m-…)"` whose target is absent renders UNMASKED in SVG, so
 * without this the trail would paint fully drawn from the first frame and the plan would be
 * dead wiring. `maskUnits="userSpaceOnUse"` with oversized bounds keeps a thin diagonal's mask
 * region from clipping the wide stroke.
 */
function revealMaskNodes(model: WorldPresentationModel): React.JSX.Element[] {
  const plan = model.reveal;
  if (!plan || plan.segments.length === 0) return [];
  const pathById = trailSegmentPathData(model.scene);
  return plan.segments.flatMap((seg) => {
    const d = pathById.get(seg.id);
    // A plan may name a segment this frame's scene does not draw (an earlier frame's world).
    // Emitting a mask with no geometry would blank the stroke, so skip it and let it paint.
    if (d === undefined) return [];
    return [
      <mask
        key={seg.id}
        id={`trail-m-${seg.id}`}
        maskUnits="userSpaceOnUse"
        x={-100000}
        y={-100000}
        width={200000}
        height={200000}
      >
        <path
          d={d}
          pathLength={1}
          className={`trail-reveal-mask${seg.fromEnd ? ' from-end' : ''}`}
          style={{
            animationDelay: `${seg.delayMs}ms`,
            strokeWidth: trailFillWidth(seg.revealedUsage) + 8,
          }}
        />
      </mask>,
    ];
  });
}

function withSvgIslandGrowthTiming(
  selected: OrganicPosePlaybackState,
  svgIslandAccretion: SemanticGrowthSvgIslandAccretion | undefined,
  settledAtProgress: number,
  reducedMotion: boolean,
): OrganicPosePlaybackState {
  if (
    !svgIslandAccretion ||
    reducedMotion ||
    selected.transitionMs === 0 ||
    selected.fromProgress >= selected.targetProgress ||
    selected.targetProgress !== settledAtProgress
  ) {
    return selected;
  }
  return { ...selected, transitionMs: svgIslandAccretion.growthDurationMs };
}

const fmt = (n: number): string => n.toFixed(1);

/** The host's normal contain-style view of the composed world bounds, as a fallback ONLY for a
 *  world so empty (no measurable coast/ground/story geometry across every supplied frame) that
 *  there is nothing real to frame — never the everyday framing. */
const FALLBACK_VIEW_BOX = '0 0 100 100';

/** Ordinary breathing room around the composed world's real geometry (coast, substrate, standing
 *  objects) — a fraction of the measured span on each side, not a fixed pixel margin, so a small
 *  plot and a sprawling one both read with the same proportionate air around them. */
const FRAMING_PAD_RATIO = 0.12;

function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * One deterministic representative world framing, held stable across the whole walk (the node
 * spec: "hold it stable through the whole walk ... not a crop around the current tree, or a
 * frame-by-frame camera jump"). Derived from the composed bounds of EVERY supplied frame's real
 * scene geometry (coast/ground/story/claim/bloom — reusing the sprite-sizing measurer this
 * package already carries, never re-deriving scene geometry by hand), so it reflects where this
 * particular world actually sits rather than a fixed magic default. Depends only on the ordered
 * `frames` prop, never the walk's current cursor.
 */
function representativeViewBox(
  frames: readonly SemanticGrowthFrame[],
): string {
  let bounds: Bounds | null = null;
  for (const entry of frames) {
    const scene = entry.model.scene;
    const defBounds = collectDefBounds(scene);
    const content = wrapperContentBounds(scene, defBounds);
    if (!content) continue;
    const offset = parseSimpleTransform(scene.transform);
    const tx = offset?.tx ?? 0;
    const ty = offset?.ty ?? 0;
    bounds = unionBounds(bounds, {
      minX: content.minX + tx,
      maxX: content.maxX + tx,
      minY: content.minY + ty,
      maxY: content.maxY + ty,
    });
  }
  if (!bounds) return FALLBACK_VIEW_BOX;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const padX = width * FRAMING_PAD_RATIO;
  const padY = height * FRAMING_PAD_RATIO;
  return [
    fmt(bounds.minX - padX),
    fmt(bounds.minY - padY),
    fmt(width + padX * 2),
    fmt(height + padY * 2),
  ].join(' ');
}

const BROWSER_ANIMATION_CLOCK: SemanticGrowthAnimationClock = {
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (requestId) => window.cancelAnimationFrame(requestId),
};

function localInstanceProgress(
  progress: number,
  window: SemanticGrowthOrganicPoseInstance['progressWindow'],
): number | null {
  if (
    !Number.isFinite(window.start) ||
    !Number.isFinite(window.end) ||
    window.start < 0 ||
    window.end > 1 ||
    window.start >= window.end
  ) {
    throw new Error('Organic pose instance progress windows must be ordered within [0,1].');
  }
  if (progress <= window.start) return null;
  return clampOrganicPoseProgress(
    (progress - window.start) / (window.end - window.start),
  );
}

function validateOrganicPoseLayer(
  layer: SemanticGrowthOrganicPoseLayer,
  registry: RegisteredOrganicPoseRegistry,
): void {
  if (
    layer.instances.length !== registry.tracks.length ||
    new Set(layer.instances.map((instance) => instance.trackId)).size !==
      registry.tracks.length
  ) {
    throw new Error('Organic pose instances must mount each registered track exactly once.');
  }
  for (const instance of layer.instances) {
    if (!registry.tracks.some((track) => track.id === instance.trackId)) {
      throw new Error(`Unknown organic pose track "${instance.trackId}".`);
    }
    if (!Number.isFinite(instance.scale) || instance.scale <= 0) {
      throw new Error('Organic pose instance scale must be positive and finite.');
    }
    if (
      !Number.isFinite(instance.worldAnchor.x) ||
      !Number.isFinite(instance.worldAnchor.y)
    ) {
      throw new Error('Organic pose world anchors must be finite.');
    }
    localInstanceProgress(0, instance.progressWindow);
  }
  const island = layer.nativeIsland;
  if (
    island.storyId.trim() === '' ||
    !Number.isFinite(island.worldAnchor.x) ||
    !Number.isFinite(island.worldAnchor.y) ||
    !Number.isFinite(island.radius.x) ||
    !Number.isFinite(island.radius.y) ||
    island.radius.x <= 0 ||
    island.radius.y <= 0 ||
    !Number.isFinite(island.settledAtProgress) ||
    island.settledAtProgress <= 0 ||
    island.settledAtProgress > 1
  ) {
    throw new Error('Organic pose native island reveal must use finite app-owned geometry.');
  }
}

export function SemanticGrowthWorldView({
  frames,
  reducedMotion,
  events,
  onNext,
  onBack,
  onReplay,
  organicPoseGrowth,
  svgIslandAccretion,
}: SemanticGrowthWorldViewProps): React.JSX.Element {
  assertFrames(frames);
  if (svgIslandAccretion && !organicPoseGrowth) {
    throw new Error('SVG island accretion requires the existing app-owned organic playback clock.');
  }
  if (
    svgIslandAccretion &&
    organicPoseGrowth &&
    svgIslandAccretion.storyId !== organicPoseGrowth.nativeIsland.storyId
  ) {
    throw new Error('SVG island accretion must target the registered native island.');
  }
  if (
    svgIslandAccretion &&
    (!Number.isFinite(svgIslandAccretion.growthDurationMs) ||
      svgIslandAccretion.growthDurationMs <= 0)
  ) {
    throw new Error('SVG island accretion growth duration must be positive and finite.');
  }
  const [cursor, setCursor] = React.useState(0);
  const [organicPlayback, setOrganicPlayback] = React.useState(initialOrganicPosePlayback);
  const reduce = reducedMotion ?? browserPrefersReducedMotion();
  const frame = frames[cursor]!;
  const registry = React.useMemo(
    () => {
      if (!organicPoseGrowth) return null;
      const valid = validateOrganicPoseRegistry(organicPoseGrowth.registry);
      validateOrganicPoseLayer(organicPoseGrowth, valid);
      return valid;
    },
    [organicPoseGrowth],
  );
  const organicLayers = React.useMemo(
    () => {
      if (!organicPoseGrowth || !registry) return null;
      return organicPoseGrowth.instances.flatMap((instance) => {
        const track = registry.tracks.find((candidate) => candidate.id === instance.trackId);
        if (!track) throw new Error(`Unknown organic pose track "${instance.trackId}".`);
        const localProgress = localInstanceProgress(
          organicPlayback.progress,
          instance.progressWindow,
        );
        if (localProgress === null) return [];
        const selected = organicPoseFrameAtProgress(track, localProgress);
        return [
          {
            trackId: track.id,
            src: selected.src,
            frameIndex: selected.index,
            canvas: track.canvas,
            assetAnchor: track.groundAnchor,
            worldAnchor: instance.worldAnchor,
            scale: instance.scale,
            depthSlot: track.depthSlot,
          },
        ];
      });
    },
    [organicPlayback.progress, organicPoseGrowth, registry],
  );
  const nativeLandProgress = organicPoseGrowth
    ? clampOrganicPoseProgress(
        organicPlayback.progress / organicPoseGrowth.nativeIsland.settledAtProgress,
      )
    : null;
  const islandAccretionPlan = React.useMemo(
    () =>
      svgIslandAccretion
        ? deriveSvgIslandAccretionPlan(
            frames[frames.length - 1]!.model.scene,
            svgIslandAccretion.storyId,
            svgIslandAccretion.worldAnchor,
          )
        : null,
    [frames, svgIslandAccretion],
  );
  const islandAccretionState = React.useMemo(
    () =>
      islandAccretionPlan && nativeLandProgress !== null
        ? svgIslandAccretionAtProgress(islandAccretionPlan, nativeLandProgress)
        : null,
    [islandAccretionPlan, nativeLandProgress],
  );
  const model = React.useMemo<WorldPresentationModel>(
    () => {
      // Reduced motion settles on the FINAL scene, which for the arrival draw-on is the fully
      // drawn trail — the same place full motion lands once the mask animation completes. The
      // app owns that settlement rather than leaning on the stylesheet's own
      // `prefers-reduced-motion` branch, because the `reducedMotion` PROP can be set with the
      // browser query unmatched; dropping the plan removes the mask, its reference and the
      // `is-growing` class together, so nothing is left half-wired.
      const base = reduce
        ? { ...frame.model, scene: withoutOrbit(frame.model.scene), reveal: null }
        : frame.model;
      if (!organicPoseGrowth || nativeLandProgress === null) return base;
      return {
        ...base,
        ...(islandAccretionState
          ? { svgIslandAccretionLayer: islandAccretionState }
          : {
              nativeIslandGrowthLayer: {
                storyId: organicPoseGrowth.nativeIsland.storyId,
                worldAnchor: organicPoseGrowth.nativeIsland.worldAnchor,
                radius: organicPoseGrowth.nativeIsland.radius,
                progress: nativeLandProgress,
              },
            }),
        organicPoseLayers: organicLayers,
      };
    },
    [frame.model, islandAccretionState, nativeLandProgress, organicLayers, organicPoseGrowth, reduce],
  );
  // The `<defs>` half of the arrival draw-on: absent a plan this is empty and the rendered
  // `<svg>` is byte-identical to before this existed.
  const revealMasks = React.useMemo(() => revealMaskNodes(model), [model]);
  // Held stable through the whole walk — derived from every supplied frame's app-owned geometry,
  // never the current cursor or a transparent asset canvas.
  const viewBox = React.useMemo(
    () => representativeViewBox(frames),
    [frames],
  );

  React.useEffect(() => {
    if (!organicPoseGrowth || !reduce) return;
    setOrganicPlayback((current) => selectOrganicPoseCue(current, cursor, true));
  }, [cursor, organicPoseGrowth, reduce]);

  React.useEffect(() => {
    if (!organicPoseGrowth || reduce || !organicPlayback.playing) return;
    const clock = organicPoseGrowth.clock ?? BROWSER_ANIMATION_CLOCK;
    let requestId = 0;
    let previousTimestamp: number | null = null;
    let running = organicPlayback;
    let cancelled = false;
    const step = (timestamp: number): void => {
      if (cancelled) return;
      const deltaMs = previousTimestamp === null ? 1000 / 60 : timestamp - previousTimestamp;
      previousTimestamp = timestamp;
      running = advanceOrganicPosePlayback(running, deltaMs);
      setOrganicPlayback(running);
      if (running.playing) requestId = clock.requestFrame(step);
    };
    requestId = clock.requestFrame(step);
    return () => {
      cancelled = true;
      clock.cancelFrame(requestId);
    };
  }, [organicPoseGrowth, organicPlayback.transitionId, reduce]);

  const select = (
    nextCursor: number,
    callback?: (key: SemanticGrowthFrameKey) => void,
    replay = false,
  ): void => {
    const bounded = Math.max(0, Math.min(FRAME_KEYS.length - 1, nextCursor));
    setCursor(bounded);
    if (organicPoseGrowth) {
      setOrganicPlayback((current) =>
        replay
          ? replayOrganicPosePlayback(current)
          : withSvgIslandGrowthTiming(
              selectOrganicPoseCue(current, bounded, reduce),
              svgIslandAccretion,
              organicPoseGrowth.nativeIsland.settledAtProgress,
              reduce,
            ),
      );
    }
    callback?.(frames[bounded]!.key);
  };

  return (
    <section
      data-semantic-growth-frame={frame.key}
      data-motion={reduce ? 'reduced' : 'full'}
      {...(organicPoseGrowth
        ? {
            'data-organic-technique': 'pose-to-pose',
            'data-organic-pose-progress': organicPlayback.progress.toFixed(4),
            'data-native-island-progress': nativeLandProgress?.toFixed(4),
            'data-organic-pose-frames':
              organicLayers?.map((layer) => `${layer.trackId}:${layer.frameIndex}`).join(',') ?? '',
            ...(islandAccretionState
              ? {
                  'data-island-technique': 'connected-accretion',
                  'data-svg-island-accretion-progress':
                    islandAccretionState.progress.toFixed(4),
                  'data-svg-island-accretion-cells':
                    String(islandAccretionPlan?.cells.length ?? 0),
                  'data-svg-island-accretion-duration-ms':
                    String(svgIslandAccretion?.growthDurationMs ?? 0),
                  'data-svg-island-accretion-waves':
                    islandAccretionPlan
                      ? [...new Set(islandAccretionPlan.cells.map((cell) => cell.wave))]
                          .map(
                            (wave) =>
                              islandAccretionPlan.cells.filter((cell) => cell.wave === wave).length,
                          )
                          .join(',')
                      : '',
                }
              : {}),
          }
        : {})}
    >
      <svg viewBox={viewBox} aria-label={`Semantic growth: ${frame.key}`}>
        {revealMasks.length > 0 ? <defs>{revealMasks}</defs> : null}
        {events ? (
          <WorldSceneView model={model} events={events} />
        ) : (
          <WorldSceneView model={model} />
        )}
      </svg>
      <nav aria-label="Semantic growth controls">
        <button type="button" onClick={() => select(cursor - 1, onBack)}>Back</button>
        <button type="button" onClick={() => select(cursor + 1, onNext)}>Next</button>
        <button type="button" onClick={() => select(0, onReplay, true)}>Replay</button>
      </nav>
    </section>
  );
}
