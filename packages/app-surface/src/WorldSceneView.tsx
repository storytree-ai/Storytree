import React from 'react';
import type { SceneNode } from '@storytree/forest-world';
import {
  SceneView,
  type NativeIslandGrowthRenderLayer,
  type OrganicPoseRenderLayer,
  type OrganicKeyPoseRenderLayer,
  type SceneCtx,
} from './SceneView.js';
import type { SpriteStyleSheet } from './sprite-sheet.js';
import type { TrailRevealPlan } from './trailReveal.js';
import type { NeighbourHighlightPlan } from './neighbourHighlight.js';
import type { LaneLayout } from './laneLayout.js';

export interface WorldPresentationModel {
  readonly scene: SceneNode;
  readonly selectedStoryId: string | null;
  readonly emphasizedStoryIds: readonly string[];
  readonly hiddenStatuses: readonly string[];
  readonly arrivalIds: readonly string[];
  readonly reveal: TrailRevealPlan | null;
  /** The ADR-0242 one-hop selection highlight: the lit trail segments + the immediate
   *  upstream / downstream islands. Null ⇒ nothing selected, no lane and no rings. */
  readonly neighbours: NeighbourHighlightPlan | null;
  /** The laid-out selection lanes (`laneLayout`). Present ⇒ the lit lane is drawn ONE PATH
   *  PER ROUTE in the relation's hue instead of per segment. Null ⇒ the per-segment ink lane. */
  readonly lanes: LaneLayout | null;
  /** Which selection motion the lanes carry (world setting `selectionMotion`). */
  readonly laneMotion: 'draw' | 'march' | 'none';
  readonly spriteSheet: SpriteStyleSheet | null;
  readonly artScale: number;
  readonly nativeIslandGrowthLayer?: NativeIslandGrowthRenderLayer | null;
  readonly organicPoseLayers?: readonly OrganicPoseRenderLayer[] | null;
  readonly organicGrowthLayers?: readonly OrganicKeyPoseRenderLayer[];
}

export interface WorldPresentationModelInput {
  readonly scene: SceneNode;
  readonly selectedStoryId?: string | null;
  readonly emphasizedStoryIds?: readonly string[];
  readonly hiddenStatuses?: readonly string[];
  readonly arrivalIds?: readonly string[];
  readonly reveal?: TrailRevealPlan | null;
  readonly neighbours?: NeighbourHighlightPlan | null;
  readonly lanes?: LaneLayout | null;
  readonly laneMotion?: 'draw' | 'march' | 'none';
  readonly spriteSheet?: SpriteStyleSheet | null;
  readonly artScale?: number;
  readonly nativeIslandGrowthLayer?: NativeIslandGrowthRenderLayer | null;
  readonly organicPoseLayers?: readonly OrganicPoseRenderLayer[] | null;
  readonly organicGrowthLayers?: readonly OrganicKeyPoseRenderLayer[];
}

export interface WorldPresentationEvents {
  readonly onSelectStory?: (storyId: string) => void;
  readonly onSelectCapability?: (storyId: string, capabilityId: string) => void;
}

function sortedUnique<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set(values ?? [])].sort();
}

/** Normalize a plain presentation input without consulting time, stores, or live authority. */
export function normalizeWorldPresentationModel(
  input: WorldPresentationModelInput,
): WorldPresentationModel {
  return {
    scene: input.scene,
    selectedStoryId: input.selectedStoryId ?? null,
    emphasizedStoryIds: sortedUnique(input.emphasizedStoryIds),
    hiddenStatuses: sortedUnique(input.hiddenStatuses),
    arrivalIds: sortedUnique(input.arrivalIds),
    reveal: input.reveal ?? null,
    neighbours: input.neighbours ?? null,
    lanes: input.lanes ?? null,
    laneMotion: input.laneMotion ?? 'draw',
    spriteSheet: input.spriteSheet ?? null,
    artScale: input.artScale ?? 1,
    ...(input.nativeIslandGrowthLayer !== undefined
      ? { nativeIslandGrowthLayer: input.nativeIslandGrowthLayer }
      : {}),
    ...(input.organicPoseLayers !== undefined
      ? { organicPoseLayers: input.organicPoseLayers }
      : {}),
    ...(input.organicGrowthLayers !== undefined
      ? { organicGrowthLayers: input.organicGrowthLayers }
      : {}),
  };
}

const NOOP_SELECT_STORY = (): void => {};
const NOOP_SELECT_CAPABILITY = (): void => {};

export function WorldSceneView({
  model,
  events,
}: {
  readonly model: WorldPresentationModel;
  readonly events?: WorldPresentationEvents;
}): React.JSX.Element {
  const ctx = React.useMemo<SceneCtx>(() => {
    const emphasized = new Set(model.emphasizedStoryIds);

    return {
      territoryClassById: (id, status) => {
        const classes = ['hex-territory', `st-${status}`];
        if (id === model.selectedStoryId) classes.push('is-selected');
        // ADR-0242: the immediate neighbours ring their own shore, by direction — `is-upstream`
        // is a story the selection stands on, `is-downstream` one that stands on it. A story on
        // both sides of a cycle honestly wears both.
        if (model.neighbours?.upstream.has(id)) classes.push('is-upstream');
        if (model.neighbours?.downstream.has(id)) classes.push('is-downstream');
        if (emphasized.has(id)) classes.push('is-hub', 'is-emphasized');
        return classes.join(' ');
      },
      reveal: model.reveal,
      neighbours: model.neighbours,
      lanes: model.lanes,
      laneMotion: model.laneMotion,
      hidden: new Set(model.hiddenStatuses),
      arrivalIds: new Set(model.arrivalIds),
      onSelectStory: events?.onSelectStory ?? NOOP_SELECT_STORY,
      onSelectCap: events?.onSelectCapability ?? NOOP_SELECT_CAPABILITY,
      spriteSheet: model.spriteSheet,
      artScale: model.artScale,
      ...(model.nativeIslandGrowthLayer !== undefined
        ? { nativeIslandGrowthLayer: model.nativeIslandGrowthLayer }
        : {}),
      ...(model.organicPoseLayers !== undefined
        ? { organicPoseLayers: model.organicPoseLayers }
        : {}),
      ...(model.organicGrowthLayers !== undefined
        ? { organicGrowthLayers: model.organicGrowthLayers }
        : {}),
    };
  }, [model, events]);

  return <SceneView scene={model.scene} ctx={ctx} />;
}
