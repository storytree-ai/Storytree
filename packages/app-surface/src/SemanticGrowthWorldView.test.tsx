// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildScene,
  type SceneInput,
  type SceneTrailsInput,
} from '@storytree/forest-world';
import { normalizeWorldPresentationModel } from './WorldSceneView.js';
import { SemanticGrowthWorldView } from './SemanticGrowthWorldView.js';
import * as AppSurfacePackageRoot from './index.js';
import type { LaneLayout } from './laneLayout.js';

const cssSideEffect = vi.hoisted(() => ({ loaded: false }));
vi.mock('./semantic-growth.css', () => {
  cssSideEffect.loaded = true;
  return {};
});

afterEach(() => {
  cleanup();
  document.head
    .querySelectorAll('[data-test-semantic-growth-css]')
    .forEach((node) => node.remove());
});

const ORDERED_KEYS = [
  'empty',
  'land',
  'proposed',
  'claimed',
  'signed-proof',
  'healthy',
] as const;

const SEMANTIC_EVENTS = ORDERED_KEYS.map((key) => ({ key }));
const NO_TRAILS: SceneTrailsInput = {
  segments: [],
  edges: [],
  caves: [],
  dropped: [],
};
const ANCHORS = {
  islandId: 'semantic-growth',
  terrain: { x: 50, y: 50 },
  storyTree: { x: 50, y: 45 },
} as const;

function persistentModel(region = { cx: 50, cy: 50 }) {
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
    empties: [],
    relaxedCells: [],
    drawTiles: [],
    wheatSets: [new Set()],
    trails: NO_TRAILS,
    territories: [
      {
        id: ANCHORS.islandId,
        status: 'healthy',
        caps: 1,
        centroid: { x: region.cx, y: region.cy },
        radius: 24,
        treeSpot: { x: region.cx, y: region.cy - 5 },
        labelY: region.cy + 26,
        coastPaths: [
          `M ${region.cx - 30} ${region.cy - 30} L ${region.cx + 30} ${region.cy - 30} L ${region.cx} ${region.cy + 30} Z`,
        ],
        decor: [],
        plants: [{
          id: `${ANCHORS.islandId}#flora`,
          status: 'healthy',
          x: region.cx + 8,
          y: region.cy + 6,
          title: 'secondary flora',
        }],
        treeTitle: 'Persistent semantic-growth story tree',
        wisps: [{
          runId: 'secondary-build',
          title: 'secondary build wisp',
          phase: 'IMPLEMENT',
        }],
        claims: [{
          key: 'secondary-claim',
          title: 'secondary claim wisp',
          colourState: 'authoring',
        }],
        bloom: { ageRatio: 0.5, outcome: 'pass' },
        plate: {
          w: 60,
          h: 30,
          rx: 7,
          idY: 13,
          subY: 25,
          idText: ANCHORS.islandId,
          subText: 'healthy',
          title: 'secondary nameplate',
        },
      },
    ],
  };
  const lanes: LaneLayout = {
    hand: 1,
    netTurn: 0,
    hubs: [],
    lanes: [{
      key: `down:${ANCHORS.islandId}`,
      dir: 'down',
      other: ANCHORS.islandId,
      d: 'M 35 58 L 72 63',
      width: 2,
      length: Math.hypot(37, 5),
    }],
  };
  return normalizeWorldPresentationModel({
    scene: buildScene(input),
    lanes,
    laneMotion: 'draw',
  });
}

function installSemanticGrowthCss(): void {
  const style = document.createElement('style');
  style.dataset.testSemanticGrowthCss = '';
  style.textContent = readFileSync(
    resolve(process.cwd(), 'src', 'semantic-growth.css'),
    'utf8',
  );
  document.head.append(style);
}

function track(container: HTMLElement): string | null {
  return container
    .querySelector('[data-semantic-growth-track]')
    ?.getAttribute('data-semantic-growth-track') ?? null;
}

function durationFor(css: string, selectorFragment: string): number {
  const withoutKeyframes = css.replace(/@keyframes\s+[\w-]+\s*\{[\s\S]*?\n\}\n*/g, '');
  const rule = [...withoutKeyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((match) => (match[1] ?? '').includes(selectorFragment)
      && /animation(?:-duration)?\s*:/.test(match[2] ?? ''));
  if (!rule) throw new Error(`missing animation rule for ${selectorFragment}`);
  const body = rule[2] ?? '';
  const token =
    /animation-duration\s*:\s*([\d.]+m?s)/.exec(body)?.[1]
    ?? /animation\s*:[^;]*?\s([\d.]+m?s)(?:\s|;)/.exec(body)?.[1];
  if (!token) throw new Error(`missing animation duration for ${selectorFragment}`);
  const numeric = Number.parseFloat(token);
  return token.endsWith('ms') ? numeric : numeric * 1000;
}

describe('SemanticGrowthWorldView', () => {
  it('case 1/3 — one persistent island retains one planted story tree and exactly two inspectable anchors through every semantic event', () => {
    const view = render(
      <SemanticGrowthWorldView
        model={persistentModel()}
        semanticEvents={SEMANTIC_EVENTS}
        anchors={ANCHORS}
      />,
    );
    const island = view.container.querySelector('[data-semantic-growth-island]');
    const terrain = view.container.querySelector('.coast-fill-group');
    const tree = view.container.querySelector('.story-tree');
    expect(island).toBeTruthy();
    expect(terrain).toBeTruthy();
    expect(tree).toBeTruthy();

    const anchorSnapshot = (): [string | null, string | null, string | null][] =>
      [...view.container.querySelectorAll('[data-semantic-growth-anchor]')]
        .map((anchor) => [
          anchor.getAttribute('data-semantic-growth-anchor'),
          anchor.getAttribute('data-anchor-x'),
          anchor.getAttribute('data-anchor-y'),
        ]);
    expect(anchorSnapshot()).toEqual([
      ['terrain', '50', '50'],
      ['story-tree', '50', '45'],
    ]);

    for (const key of ORDERED_KEYS) {
      expect(
        view.container.querySelector('[data-semantic-growth-frame]')
          ?.getAttribute('data-semantic-growth-frame'),
      ).toBe(key);
      expect(view.container.querySelector('[data-semantic-growth-island]')).toBe(island);
      expect(view.container.querySelector('.coast-fill-group')).toBe(terrain);
      expect(view.container.querySelector('.story-tree')).toBe(tree);
      expect(tree?.closest('[data-semantic-growth-island]')).toBe(island);
      expect(anchorSnapshot()).toEqual([
        ['terrain', '50', '50'],
        ['story-tree', '50', '45'],
      ]);
      if (key !== 'healthy') {
        fireEvent.click(view.getByRole('button', { name: 'Next' }));
      }
    }
  }, 30_000);

  it('case 2/3 — reveals the island slowly, grows only the planted story tree, and leaves secondary world furniture out of the choreography', () => {
    installSemanticGrowthCss();
    const view = render(
      <SemanticGrowthWorldView
        model={persistentModel()}
        semanticEvents={SEMANTIC_EVENTS}
        anchors={ANCHORS}
      />,
    );
    const terrain = view.container.querySelector('.coast-fill-group') as SVGElement;
    const tree = view.container.querySelector('.story-tree') as SVGElement;
    const secondary = [
      '.garden-flora',
      '.world-plate',
      '.world-claim-wisp',
      '.world-bloom',
      '.trail-lane',
    ].map((selector) => view.container.querySelector(selector) as SVGElement);
    expect(secondary.every(Boolean)).toBe(true);

    expect(track(view.container)).toBe('nothing');
    expect(getComputedStyle(tree).visibility).toBe('hidden');
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(track(view.container)).toBe('island-reveal');
    expect(getComputedStyle(terrain).visibility).toBe('visible');
    expect(getComputedStyle(tree).visibility).toBe('hidden');
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(track(view.container)).toBe('story-tree-entrance');
    expect(getComputedStyle(tree).visibility).toBe('visible');

    for (const element of secondary) {
      expect(getComputedStyle(element).visibility).toBe('hidden');
    }

    const css = readFileSync(resolve(process.cwd(), 'src', 'semantic-growth.css'), 'utf8');
    const islandMs = durationFor(css, '.coast-fill-group');
    const treeMs = durationFor(css, '.story-tree');
    expect(islandMs).toBeGreaterThanOrEqual(1200);
    expect(treeMs).toBeGreaterThanOrEqual(700);
    expect(islandMs).toBeGreaterThan(treeMs);
    expect(css).not.toMatch(/@keyframes\s+(?:wisp|bloom|plate|parcel|flora)/i);
    expect(css).not.toMatch(/transform\s*:\s*(?:scale|translate)/i);
  }, 30_000);

  it('case 3/3 — Back, Replay and reduced motion preserve the same scene while six meanings fold into island/tree tracks', () => {
    const expectedTracks = [
      'nothing',
      'island-reveal',
      'story-tree-entrance',
      'story-tree-settled',
      'story-tree-settled',
      'story-tree-settled',
    ];

    const walk = (reducedMotion: boolean) => {
      const view = render(
        <SemanticGrowthWorldView
          model={persistentModel()}
          semanticEvents={SEMANTIC_EVENTS}
          anchors={ANCHORS}
          reducedMotion={reducedMotion}
        />,
      );
      const island = view.container.querySelector('[data-semantic-growth-island]');
      const tree = view.container.querySelector('.story-tree');
      const observed: string[] = [];
      for (let index = 0; index < ORDERED_KEYS.length; index += 1) {
        observed.push(track(view.container) ?? '');
        expect(view.container.querySelector('[data-semantic-growth-island]')).toBe(island);
        expect(view.container.querySelector('.story-tree')).toBe(tree);
        if (index < ORDERED_KEYS.length - 1) {
          fireEvent.click(view.getByRole('button', { name: 'Next' }));
        }
      }
      fireEvent.click(view.getByRole('button', { name: 'Back' }));
      expect(track(view.container)).toBe('story-tree-settled');
      fireEvent.click(view.getByRole('button', { name: 'Replay' }));
      expect(track(view.container)).toBe('nothing');
      expect(view.container.querySelector('[data-semantic-growth-island]')).toBe(island);
      expect(view.container.querySelector('.story-tree')).toBe(tree);
      return {
        observed,
        islandHtml: island?.innerHTML,
        treeTransform: tree?.getAttribute('transform'),
      };
    };

    const full = walk(false);
    cleanup();
    const reduced = walk(true);
    expect(full.observed).toEqual(expectedTracks);
    expect(reduced.observed).toEqual(expectedTracks);
    expect(reduced.islandHtml).toBe(full.islandHtml);
    expect(reduced.treeTransform).toBe(full.treeTransform);
  }, 30_000);

  it('loads its co-located stylesheet, exports the player publicly and rejects unordered semantic events', () => {
    expect(cssSideEffect.loaded).toBe(true);
    expect(AppSurfacePackageRoot.SemanticGrowthWorldView).toBe(SemanticGrowthWorldView);
    expect(() =>
      render(
        <SemanticGrowthWorldView
          model={persistentModel()}
          semanticEvents={[...SEMANTIC_EVENTS].reverse()}
          anchors={ANCHORS}
        />,
      )).toThrow(/unique and ordered/);
  });

  it('keeps one deterministic world framing across the walk and derives it from the composed scene rather than a magic default', () => {
    const near = render(
      <SemanticGrowthWorldView
        model={persistentModel({ cx: 50, cy: 50 })}
        semanticEvents={SEMANTIC_EVENTS}
        anchors={ANCHORS}
      />,
    );
    const nearBox = near.container.querySelector('svg')?.getAttribute('viewBox');
    for (const _key of ORDERED_KEYS.slice(1)) {
      fireEvent.click(near.getByRole('button', { name: 'Next' }));
      expect(near.container.querySelector('svg')?.getAttribute('viewBox')).toBe(nearBox);
    }
    cleanup();

    const far = render(
      <SemanticGrowthWorldView
        model={persistentModel({ cx: 520, cy: 420 })}
        semanticEvents={SEMANTIC_EVENTS}
        anchors={{
          islandId: ANCHORS.islandId,
          terrain: { x: 520, y: 420 },
          storyTree: { x: 520, y: 415 },
        }}
      />,
    );
    const farBox = far.container.querySelector('svg')?.getAttribute('viewBox');
    expect(farBox).not.toBe(nearBox);
    expect(farBox).not.toBe('0 0 100 100');
  });

  it('keeps a definite viewport height chain and never uses a blanket reduced-motion transform reset', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'semantic-growth.css'), 'utf8');
    const rootRule = css.match(/\[data-semantic-growth-frame\]\s*\{([^}]*)\}/)?.[1] ?? '';
    const svgRule = css.match(/\[data-semantic-growth-frame\]\s+svg\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rootRule).toMatch(/height\s*:\s*100%/);
    expect(rootRule).toMatch(/min-height\s*:/);
    expect(svgRule).toMatch(/max-height\s*:\s*100%/);
    expect(svgRule).toMatch(/min-height\s*:\s*0/);
    expect(css).not.toMatch(/\[data-motion=['"]reduced['"]\]\s+\*\s*\{/);
    expect(css).not.toMatch(/data-motion=['"]reduced['"][^{}]*\{[^}]*transform\s*:\s*none/is);
  });
});
