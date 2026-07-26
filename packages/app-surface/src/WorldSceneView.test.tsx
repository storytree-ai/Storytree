// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildScene,
  type SceneInput,
  type SceneNode,
  type SceneTrailsInput,
} from '@storytree/forest-world';
import {
  normalizeWorldPresentationModel,
  WorldSceneView,
} from './WorldSceneView.js';

afterEach(cleanup);

const NO_TRAILS: SceneTrailsInput = {
  segments: [],
  edges: [],
  caves: [],
  dropped: [],
};

function representativeInput(): SceneInput {
  return {
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
    empties: [],
    relaxedCells: [
      {
        owner: 0,
        poly: [
          { x: 20, y: 20 },
          { x: 80, y: 20 },
          { x: 50, y: 80 },
        ],
        variant: 0,
        wheat: false,
      },
    ],
    drawTiles: [],
    wheatSets: [new Set()],
    trails: NO_TRAILS,
    territories: [
      {
        id: 'story-a',
        status: 'healthy',
        caps: 1,
        centroid: { x: 50, y: 50 },
        radius: 24,
        treeSpot: { x: 50, y: 45 },
        labelY: 76,
        coastPaths: ['M 20 20 L 80 20 L 50 80 Z'],
        decor: [],
        plants: [
          {
            id: 'cap-a',
            status: 'proposed',
            x: 55,
            y: 55,
            title: 'Capability A',
          },
        ],
        treeTitle: 'Story A — healthy',
        wisps: [],
        plate: {
          w: 60,
          h: 30,
          rx: 7,
          idY: 13,
          subY: 25,
          idText: 'story-a',
          subText: 'healthy · 1 cap',
          title: 'Story A',
        },
      },
    ],
  };
}

function representativeScene(): SceneNode {
  return buildScene(representativeInput());
}

describe('WorldSceneView', () => {
  it('aswv-equal-plain-inputs-normalize-deterministically', () => {
    const scene = representativeScene();
    const input = {
      scene,
      selectedStoryId: null,
      emphasizedStoryIds: ['story-b', 'story-a', 'story-b'],
      hiddenStatuses: ['unhealthy', 'proposed', 'unhealthy'] as const,
      arrivalIds: ['story-b', 'story-a', 'story-b'],
    };

    const first = normalizeWorldPresentationModel(input);
    const second = normalizeWorldPresentationModel({
      ...input,
      emphasizedStoryIds: [...input.emphasizedStoryIds],
      hiddenStatuses: [...input.hiddenStatuses],
      arrivalIds: [...input.arrivalIds],
    });

    expect(first).toEqual(second);
    expect(first).toEqual({
      scene,
      selectedStoryId: null,
      emphasizedStoryIds: ['story-a', 'story-b'],
      hiddenStatuses: ['proposed', 'unhealthy'],
      arrivalIds: ['story-a', 'story-b'],
      reveal: null,
      neighbours: null,
      spriteSheet: null,
      artScale: 1,
    });
  });

  // ADR-0242: the neighbour RINGS ride the island class the model composes, by direction —
  // the lit LANE half is pinned in SceneView.test.tsx.
  it('rings the immediate neighbours by direction, and only them', () => {
    const model = normalizeWorldPresentationModel({
      scene: representativeScene(),
      // the one island in the fixture is a NEIGHBOUR of the selection, not the selection
      selectedStoryId: 'story-elsewhere',
      neighbours: {
        selectedId: 'story-elsewhere',
        litSegmentIds: [],
        litSegments: new Set<string>(),
        upstreamIds: ['story-a'],
        downstreamIds: [],
        upstream: new Set(['story-a']),
        downstream: new Set<string>(),
      },
    });
    const { container } = render(
      <svg>
        <WorldSceneView model={model} />
      </svg>,
    );
    expect(container.querySelector('.hex-flora.is-upstream')).toBeTruthy();
    expect(container.querySelector('.is-selected')).toBeNull(); // the selection is off-screen here
    expect(container.querySelector('.is-downstream')).toBeNull();
  });

  it('aswv-delegates-one-semantic-scene-and-event', () => {
    const onSelectStory = vi.fn();
    const onSelectCapability = vi.fn();
    const model = normalizeWorldPresentationModel({
      scene: representativeScene(),
      selectedStoryId: 'story-a',
      emphasizedStoryIds: ['story-a'],
    });
    const { container } = render(
      <svg>
        <WorldSceneView
          model={model}
          events={{ onSelectStory, onSelectCapability }}
        />
      </svg>,
    );

    const tree = container.querySelector('.story-tree.st-healthy');
    expect(tree).toBeTruthy();
    expect(
      container.querySelector('.hex-flora.is-selected.is-hub.is-emphasized'),
    ).toBeTruthy();

    const capability = container.querySelector('.garden-flora.st-proposed');
    expect(capability).toBeTruthy();
    fireEvent.click(capability!);
    expect(onSelectCapability).toHaveBeenCalledWith('story-a', 'cap-a');

    const territory = container.querySelector('.hex-flora');
    fireEvent.click(territory!);
    expect(onSelectStory).toHaveBeenCalledWith('story-a');

    expect(() =>
      render(
        <svg>
          <WorldSceneView model={model} />
        </svg>,
      ),
    ).not.toThrow();
  });

  it('aswv-wrapper-has-no-private-or-live-authority', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'WorldSceneView.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/apps\/studio|@storytree\/studio/);
    expect(source).not.toMatch(
      /\b(fetch|WebSocket|EventSource|setTimeout|setInterval|Date|Math\.random|store|subscription)\b/,
    );
    expect(source).not.toMatch(/\b(renderNode|resolveSprite|trailRevealPlan|arrivalGrowPlan)\b/);
  });
});
