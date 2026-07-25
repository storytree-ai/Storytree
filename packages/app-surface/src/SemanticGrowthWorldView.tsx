import React from 'react';
import type { SceneNode } from '@storytree/forest-world';
import {
  WorldSceneView,
  type WorldPresentationEvents,
  type WorldPresentationModel,
} from './WorldSceneView.js';
// The public view itself imports/loads its co-located motion stylesheet, so a consumer
// cannot mount an inert semantic player by forgetting a separate CSS side effect.
import './semantic-growth.css';

const FRAME_KEYS = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;

export type SemanticGrowthFrameKey = (typeof FRAME_KEYS)[number];

export interface SemanticGrowthFrame {
  readonly key: SemanticGrowthFrameKey;
  readonly model: WorldPresentationModel;
}

export interface SemanticGrowthWorldViewProps {
  readonly frames: readonly SemanticGrowthFrame[];
  readonly reducedMotion?: boolean;
  readonly events?: WorldPresentationEvents;
  readonly onNext?: (key: SemanticGrowthFrameKey) => void;
  readonly onBack?: (key: SemanticGrowthFrameKey) => void;
  readonly onReplay?: (key: SemanticGrowthFrameKey) => void;
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

export function SemanticGrowthWorldView({
  frames,
  reducedMotion,
  events,
  onNext,
  onBack,
  onReplay,
}: SemanticGrowthWorldViewProps): React.JSX.Element {
  assertFrames(frames);
  const [cursor, setCursor] = React.useState(0);
  const reduce = reducedMotion ?? browserPrefersReducedMotion();
  const frame = frames[cursor]!;
  const model = React.useMemo<WorldPresentationModel>(
    () => (reduce ? { ...frame.model, scene: withoutOrbit(frame.model.scene) } : frame.model),
    [frame.model, reduce],
  );

  const select = (nextCursor: number, callback?: (key: SemanticGrowthFrameKey) => void): void => {
    const bounded = Math.max(0, Math.min(FRAME_KEYS.length - 1, nextCursor));
    setCursor(bounded);
    callback?.(frames[bounded]!.key);
  };

  return (
    <section
      data-semantic-growth-frame={frame.key}
      data-motion={reduce ? 'reduced' : 'full'}
    >
      <svg viewBox="0 0 100 100" aria-label={`Semantic growth: ${frame.key}`}>
        {events ? (
          <WorldSceneView model={model} events={events} />
        ) : (
          <WorldSceneView model={model} />
        )}
      </svg>
      <nav aria-label="Semantic growth controls">
        <button type="button" onClick={() => select(cursor - 1, onBack)}>Back</button>
        <button type="button" onClick={() => select(cursor + 1, onNext)}>Next</button>
        <button type="button" onClick={() => select(0, onReplay)}>Replay</button>
      </nav>
    </section>
  );
}
