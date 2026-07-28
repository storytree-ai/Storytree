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
} from './sprite-sizing.js';
import './semantic-growth.css';

const FRAME_KEYS = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;

export type SemanticGrowthFrameKey = (typeof FRAME_KEYS)[number];

export interface SemanticGrowthEvent {
  readonly key: SemanticGrowthFrameKey;
}

export interface SemanticGrowthPoint {
  readonly x: number;
  readonly y: number;
}

export interface SemanticGrowthAnchors {
  readonly islandId: string;
  readonly terrain: SemanticGrowthPoint;
  readonly storyTree: SemanticGrowthPoint;
}

export interface SemanticGrowthWorldViewProps {
  /** One persistent composed scene. Semantic events cue tracks; they never replace this model. */
  readonly model: WorldPresentationModel;
  readonly semanticEvents: readonly SemanticGrowthEvent[];
  readonly anchors: SemanticGrowthAnchors;
  readonly reducedMotion?: boolean;
  readonly events?: WorldPresentationEvents;
  readonly onNext?: (key: SemanticGrowthFrameKey) => void;
  readonly onBack?: (key: SemanticGrowthFrameKey) => void;
  readonly onReplay?: (key: SemanticGrowthFrameKey) => void;
}

function assertSemanticEvents(events: readonly SemanticGrowthEvent[]): void {
  if (events.length !== FRAME_KEYS.length) {
    throw new Error('Semantic growth requires exactly six ordered semantic events.');
  }
  for (let index = 0; index < FRAME_KEYS.length; index += 1) {
    if (events[index]?.key !== FRAME_KEYS[index]) {
      throw new Error('Semantic growth events must be unique and ordered.');
    }
  }
}

function assertAnchors(anchors: SemanticGrowthAnchors): void {
  if (!anchors.islandId.trim()) {
    throw new Error('Semantic growth anchors require an island owner.');
  }
  const points = [
    anchors.terrain,
    anchors.storyTree,
  ];
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error('Semantic growth anchors require finite coordinates.');
  }
}

function anchoredTransform(
  point: SemanticGrowthPoint,
  parent: SemanticGrowthPoint,
): string {
  return `translate(${(point.x - parent.x).toFixed(3)} ${(point.y - parent.y).toFixed(3)})`;
}

/**
 * Bind the shared renderer's existing semantic bodies to the island-local anchors. This is one
 * deterministic scene rewrite performed before rendering: it neither creates another renderer
 * nor changes with the timeline cursor.
 */
function withSemanticAnchors(
  node: SceneNode,
  anchors: SemanticGrowthAnchors,
  parent: SemanticGrowthPoint = { x: 0, y: 0 },
  sceneRoot = true,
): SceneNode {
  if (node.el !== 'g') return node;
  const parsed = sceneRoot ? null : parseSimpleTransform(node.transform);
  const own = {
    x: parent.x + (parsed?.tx ?? 0),
    y: parent.y + (parsed?.ty ?? 0),
  };

  if (node.kind === 'tree') {
    const anchored = { ...node, transform: anchoredTransform(anchors.storyTree, parent) };
    return {
      ...anchored,
      children: anchored.children.map((child) =>
        withSemanticAnchors(child, anchors, anchors.storyTree, false)),
    } as SceneNode;
  }

  return {
    ...node,
    children: node.children.map((child) =>
      withSemanticAnchors(child, anchors, own, false)),
  } as SceneNode;
}

function browserPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const fmt = (n: number): string => n.toFixed(1);
const FALLBACK_VIEW_BOX = '0 0 100 100';
const FRAMING_PAD_RATIO = 0.12;

/** Frame one scene once; the cursor never changes the camera or scene graph. */
function representativeViewBox(model: WorldPresentationModel): string {
  const scene = model.scene;
  const defBounds = collectDefBounds(scene);
  const content = wrapperContentBounds(scene, defBounds);
  if (!content) return FALLBACK_VIEW_BOX;
  const offset = parseSimpleTransform(scene.transform);
  const tx = offset?.tx ?? 0;
  const ty = offset?.ty ?? 0;
  const minX = content.minX + tx;
  const maxX = content.maxX + tx;
  const minY = content.minY + ty;
  const maxY = content.maxY + ty;
  const width = maxX - minX;
  const height = maxY - minY;
  const padX = width * FRAMING_PAD_RATIO;
  const padY = height * FRAMING_PAD_RATIO;
  return [
    fmt(minX - padX),
    fmt(minY - padY),
    fmt(width + padX * 2),
    fmt(height + padY * 2),
  ].join(' ');
}

type SemanticGrowthTrack =
  | 'nothing'
  | 'island-reveal'
  | 'trunk-growth'
  | 'branch-growth'
  | 'canopy-accumulation'
  | 'mature-tree';

function trackFor(key: SemanticGrowthFrameKey): SemanticGrowthTrack {
  if (key === 'empty') return 'nothing';
  if (key === 'land') return 'island-reveal';
  if (key === 'proposed') return 'trunk-growth';
  if (key === 'claimed') return 'branch-growth';
  if (key === 'signed-proof') return 'canopy-accumulation';
  return 'mature-tree';
}

function anchorEntries(anchors: SemanticGrowthAnchors): readonly [
  string,
  SemanticGrowthPoint,
][] {
  return [
    ['terrain', anchors.terrain],
    ['story-tree', anchors.storyTree],
  ];
}

export function SemanticGrowthWorldView({
  model: sourceModel,
  semanticEvents,
  anchors,
  reducedMotion,
  events,
  onNext,
  onBack,
  onReplay,
}: SemanticGrowthWorldViewProps): React.JSX.Element {
  assertSemanticEvents(semanticEvents);
  assertAnchors(anchors);
  const [cursor, setCursor] = React.useState(0);
  const reduce = reducedMotion ?? browserPrefersReducedMotion();
  const event = semanticEvents[cursor]!;
  const track = trackFor(event.key);
  const anchoredScene = React.useMemo(
    () => withSemanticAnchors(sourceModel.scene, anchors),
    [sourceModel.scene, anchors],
  );
  const model = React.useMemo<WorldPresentationModel>(
    () => ({
      ...sourceModel,
      scene: anchoredScene,
      laneMotion: 'none',
    }),
    [sourceModel, anchoredScene],
  );
  const viewBox = React.useMemo(() => representativeViewBox(sourceModel), [sourceModel]);

  const select = (nextCursor: number, callback?: (key: SemanticGrowthFrameKey) => void): void => {
    const bounded = Math.max(0, Math.min(FRAME_KEYS.length - 1, nextCursor));
    setCursor(bounded);
    callback?.(semanticEvents[bounded]!.key);
  };

  return (
    <section
      data-semantic-growth-frame={event.key}
      data-semantic-growth-track={track}
      data-motion={reduce ? 'reduced' : 'full'}
    >
      <svg viewBox={viewBox} aria-label={`Semantic growth: ${event.key}`}>
        <g
          data-semantic-growth-island={anchors.islandId}
        >
          {events ? (
            <WorldSceneView model={model} events={events} />
          ) : (
            <WorldSceneView model={model} />
          )}
          <g className="semantic-growth-anchors" aria-hidden="true">
            {anchorEntries(anchors).map(([name, point]) => (
              <circle
                key={name}
                data-semantic-growth-anchor={name}
                data-anchor-x={point.x}
                data-anchor-y={point.y}
                cx={point.x}
                cy={point.y}
                r="0"
              />
            ))}
          </g>
        </g>
      </svg>
      <nav aria-label="Semantic growth controls">
        <button type="button" onClick={() => select(cursor - 1, onBack)}>Back</button>
        <button type="button" onClick={() => select(cursor + 1, onNext)}>Next</button>
        <button type="button" onClick={() => select(0, onReplay)}>Replay</button>
      </nav>
    </section>
  );
}
