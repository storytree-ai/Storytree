import React from 'react';
import type { SceneNode } from '@storytree/forest-world';
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
  advanceIslandGrowthPlayback,
  initialIslandGrowthPlayback,
  islandGrowthFrameAtProgress,
  replayIslandGrowth,
  selectIslandGrowthCue,
  type IslandGrowthPoint,
  type RegisteredIslandGrowthTrack,
} from './island-growth-track.js';
import {
  advanceCutoutPuppetPlayback,
  cutoutPuppetLayerAtProgress,
  initialCutoutPuppetPlayback,
  replayCutoutPuppet,
  selectCutoutPuppetCue,
  type CutoutPuppetPoint,
  type RegisteredCutoutPuppetRig,
} from './cutout-puppet-rig.js';
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

export interface SemanticGrowthIslandLayer {
  readonly track: RegisteredIslandGrowthTrack;
  readonly worldAnchor: IslandGrowthPoint;
  readonly scale: number;
  readonly clock?: SemanticGrowthAnimationClock;
}

export interface SemanticGrowthCutoutPuppetLayer {
  readonly rig: RegisteredCutoutPuppetRig;
  readonly worldRoot: CutoutPuppetPoint;
  readonly scale: number;
  readonly clock?: SemanticGrowthAnimationClock;
}

export interface SemanticGrowthWorldViewProps {
  readonly frames: readonly SemanticGrowthFrame[];
  readonly reducedMotion?: boolean;
  readonly events?: WorldPresentationEvents;
  readonly onNext?: (key: SemanticGrowthFrameKey) => void;
  readonly onBack?: (key: SemanticGrowthFrameKey) => void;
  readonly onReplay?: (key: SemanticGrowthFrameKey) => void;
  readonly islandGrowth?: SemanticGrowthIslandLayer;
  readonly cutoutPuppet?: SemanticGrowthCutoutPuppetLayer;
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
  islandGrowth?: SemanticGrowthIslandLayer,
  cutoutPuppet?: SemanticGrowthCutoutPuppetLayer,
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
  if (islandGrowth) {
    const rootOffset = parseSimpleTransform(frames[0]?.model.scene.transform);
    const tx = rootOffset?.tx ?? 0;
    const ty = rootOffset?.ty ?? 0;
    const { track, worldAnchor, scale } = islandGrowth;
    const x = worldAnchor.x - track.islandAnchor.x * scale + tx;
    const y = worldAnchor.y - track.islandAnchor.y * scale + ty;
    bounds = unionBounds(bounds, {
      minX: x,
      minY: y,
      maxX: x + track.canvas.width * scale,
      maxY: y + track.canvas.height * scale,
    });
  }
  if (cutoutPuppet) {
    const rootOffset = parseSimpleTransform(frames[0]?.model.scene.transform);
    const tx = rootOffset?.tx ?? 0;
    const ty = rootOffset?.ty ?? 0;
    const { rig, worldRoot, scale } = cutoutPuppet;
    bounds = unionBounds(bounds, {
      minX: worldRoot.x + rig.matureFootprint.x * scale + tx,
      minY: worldRoot.y + rig.matureFootprint.y * scale + ty,
      maxX:
        worldRoot.x +
        (rig.matureFootprint.x + rig.matureFootprint.width) * scale +
        tx,
      maxY:
        worldRoot.y +
        (rig.matureFootprint.y + rig.matureFootprint.height) * scale +
        ty,
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

export function SemanticGrowthWorldView({
  frames,
  reducedMotion,
  events,
  onNext,
  onBack,
  onReplay,
  islandGrowth,
  cutoutPuppet,
}: SemanticGrowthWorldViewProps): React.JSX.Element {
  assertFrames(frames);
  const [cursor, setCursor] = React.useState(0);
  const [islandPlayback, setIslandPlayback] = React.useState(initialIslandGrowthPlayback);
  const [cutoutPlayback, setCutoutPlayback] = React.useState(initialCutoutPuppetPlayback);
  const reduce = reducedMotion ?? browserPrefersReducedMotion();
  const frame = frames[cursor]!;
  const islandFrame = islandGrowth
    ? islandGrowthFrameAtProgress(islandGrowth.track, islandPlayback.progress)
    : null;
  const cutoutLayer = cutoutPuppet
    ? cutoutPuppetLayerAtProgress(
        cutoutPuppet.rig,
        cutoutPlayback.progress,
        cutoutPuppet.worldRoot,
        cutoutPuppet.scale,
      )
    : null;
  const model = React.useMemo<WorldPresentationModel>(
    () => {
      const base = reduce ? { ...frame.model, scene: withoutOrbit(frame.model.scene) } : frame.model;
      return {
        ...base,
        ...(islandGrowth && islandFrame
          ? {
              islandGrowthLayer: {
                src: islandFrame.src,
                frameIndex: islandFrame.index,
                canvas: islandGrowth.track.canvas,
                assetAnchor: islandGrowth.track.islandAnchor,
                worldAnchor: islandGrowth.worldAnchor,
                scale: islandGrowth.scale,
                depthSlot: islandGrowth.track.depthSlot,
              },
            }
          : {}),
        ...(cutoutLayer ? { cutoutPuppetLayer: cutoutLayer } : {}),
      };
    },
    [cutoutLayer, frame.model, islandFrame, islandGrowth, reduce],
  );
  // Held stable through the whole walk — derived from every supplied frame's composed geometry,
  // never the current cursor (see representativeViewBox).
  const viewBox = React.useMemo(
    () => representativeViewBox(frames, islandGrowth, cutoutPuppet),
    [cutoutPuppet, frames, islandGrowth],
  );

  React.useEffect(() => {
    if (!islandGrowth || !reduce) return;
    setIslandPlayback((current) => selectIslandGrowthCue(current, cursor, true));
  }, [cursor, islandGrowth, reduce]);

  React.useEffect(() => {
    if (!cutoutPuppet || !reduce) return;
    setCutoutPlayback((current) => selectCutoutPuppetCue(current, cursor, true));
  }, [cursor, cutoutPuppet, reduce]);

  React.useEffect(() => {
    if (!islandGrowth || reduce || !islandPlayback.playing) return;
    const clock = islandGrowth.clock ?? BROWSER_ANIMATION_CLOCK;
    let requestId = 0;
    let previousTimestamp: number | null = null;
    let running = islandPlayback;
    let cancelled = false;
    const step = (timestamp: number): void => {
      if (cancelled) return;
      const deltaMs = previousTimestamp === null ? 1000 / 60 : timestamp - previousTimestamp;
      previousTimestamp = timestamp;
      running = advanceIslandGrowthPlayback(running, deltaMs);
      setIslandPlayback(running);
      if (running.playing) requestId = clock.requestFrame(step);
    };
    requestId = clock.requestFrame(step);
    return () => {
      cancelled = true;
      clock.cancelFrame(requestId);
    };
  }, [islandGrowth, islandPlayback.transitionId, reduce]);

  React.useEffect(() => {
    if (!cutoutPuppet || reduce || !cutoutPlayback.playing) return;
    const clock = cutoutPuppet.clock ?? BROWSER_ANIMATION_CLOCK;
    let requestId = 0;
    let previousTimestamp: number | null = null;
    let running = cutoutPlayback;
    let cancelled = false;
    const step = (timestamp: number): void => {
      if (cancelled) return;
      const deltaMs = previousTimestamp === null ? 1000 / 60 : timestamp - previousTimestamp;
      previousTimestamp = timestamp;
      running = advanceCutoutPuppetPlayback(running, deltaMs);
      setCutoutPlayback(running);
      if (running.playing) requestId = clock.requestFrame(step);
    };
    requestId = clock.requestFrame(step);
    return () => {
      cancelled = true;
      clock.cancelFrame(requestId);
    };
  }, [cutoutPlayback.transitionId, cutoutPuppet, reduce]);

  const select = (
    nextCursor: number,
    callback?: (key: SemanticGrowthFrameKey) => void,
    replay = false,
  ): void => {
    const bounded = Math.max(0, Math.min(FRAME_KEYS.length - 1, nextCursor));
    setCursor(bounded);
    if (islandGrowth) {
      setIslandPlayback((current) =>
        replay ? replayIslandGrowth(current) : selectIslandGrowthCue(current, bounded, reduce),
      );
    }
    if (cutoutPuppet) {
      setCutoutPlayback((current) =>
        replay ? replayCutoutPuppet(current) : selectCutoutPuppetCue(current, bounded, reduce),
      );
    }
    callback?.(frames[bounded]!.key);
  };

  return (
    <section
      data-semantic-growth-frame={frame.key}
      data-motion={reduce ? 'reduced' : 'full'}
      {...(islandGrowth
        ? {
            'data-island-growth-progress': islandPlayback.progress.toFixed(4),
            'data-island-growth-frame': islandFrame?.index,
            'data-island-growth-anchor': `${islandGrowth.worldAnchor.x},${islandGrowth.worldAnchor.y}`,
          }
        : {})}
      {...(cutoutPuppet
        ? {
            'data-cutout-puppet-progress': cutoutPlayback.progress.toFixed(4),
            'data-cutout-puppet-root': `${cutoutPuppet.worldRoot.x},${cutoutPuppet.worldRoot.y}`,
          }
        : {})}
    >
      <svg viewBox={viewBox} aria-label={`Semantic growth: ${frame.key}`}>
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
