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

interface GrowthRig {
  readonly root: SVGGElement;
  readonly trunk: SVGPathElement;
  readonly branches: readonly SVGPathElement[];
  readonly canopy: readonly SVGCircleElement[];
  readonly matureArt: SVGElement;
}

function growthRig(container: HTMLElement): GrowthRig {
  const root = container.querySelector<SVGGElement>('g.story-tree');
  const trunk = root?.querySelector<SVGPathElement>('[data-tree-growth-part="trunk"]');
  const branches = [
    ...(root?.querySelectorAll<SVGPathElement>('[data-tree-growth-part="branch"]') ?? []),
  ];
  const canopy = [
    ...(root?.querySelectorAll<SVGCircleElement>('[data-tree-growth-part="canopy"]') ?? []),
  ];
  const matureArt = root?.querySelector<SVGElement>('[data-tree-mature-art]');
  expect(root).toBeTruthy();
  expect(trunk).toBeTruthy();
  expect(branches.length).toBeGreaterThanOrEqual(2);
  expect(canopy.length).toBeGreaterThanOrEqual(4);
  expect(matureArt).toBeTruthy();
  return {
    root: root!,
    trunk: trunk!,
    branches,
    canopy,
    matureArt: matureArt!,
  };
}

function visibleParts(parts: readonly SVGElement[]): number {
  return parts.filter((part) => getComputedStyle(part).visibility === 'visible').length;
}

describe('SemanticGrowthWorldView', () => {
  it('case 1/3 — one persistent island retains one planted trunk/branch/canopy rig and exactly two inspectable anchors through every semantic event', () => {
    const view = render(
      <SemanticGrowthWorldView
        model={persistentModel()}
        semanticEvents={SEMANTIC_EVENTS}
        anchors={ANCHORS}
      />,
    );
    const island = view.container.querySelector('[data-semantic-growth-island]');
    const terrain = view.container.querySelector('.coast-fill-group');
    const rig = growthRig(view.container);
    expect(island).toBeTruthy();
    expect(terrain).toBeTruthy();

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
      expect(view.container.querySelector('g.story-tree')).toBe(rig.root);
      expect(view.container.querySelector('[data-tree-growth-part="trunk"]')).toBe(rig.trunk);
      expect([
        ...view.container.querySelectorAll('[data-tree-growth-part="branch"]'),
      ]).toEqual(rig.branches);
      expect([
        ...view.container.querySelectorAll('[data-tree-growth-part="canopy"]'),
      ]).toEqual(rig.canopy);
      expect(view.container.querySelector('[data-tree-mature-art]')).toBe(rig.matureArt);
      expect(rig.root.closest('[data-semantic-growth-island]')).toBe(island);
      expect(rig.root.getAttribute('transform')).toBe('translate(50.000 45.000)');
      expect(anchorSnapshot()).toEqual([
        ['terrain', '50', '50'],
        ['story-tree', '50', '45'],
      ]);
      if (key !== 'healthy') {
        fireEvent.click(view.getByRole('button', { name: 'Next' }));
      }
    }
  }, 30_000);

  it('case 2/3 — visibly progresses trunk, forked branches and canopy clusters before the mature tree handoff', () => {
    installSemanticGrowthCss();
    const view = render(
      <SemanticGrowthWorldView
        model={persistentModel()}
        semanticEvents={SEMANTIC_EVENTS}
        anchors={ANCHORS}
      />,
    );
    const terrain = view.container.querySelector('.coast-fill-group') as SVGElement;
    const rig = growthRig(view.container);
    const secondary = [
      '.garden-flora',
      '.world-plate',
      '.world-claim-wisp',
      '.world-bloom',
      '.trail-lane',
    ].map((selector) => view.container.querySelector(selector) as SVGElement);
    expect(secondary.every(Boolean)).toBe(true);

    expect(rig.trunk.getAttribute('pathLength')).toBe('1');
    expect(rig.trunk.getAttribute('d')).toMatch(/^M\s*0(?:\.0+)?\s*0(?:\.0+)?\b/);
    expect(new Set(rig.branches.map((branch) => branch.getAttribute('d'))).size)
      .toBe(rig.branches.length);
    expect(rig.branches.every((branch) => branch.getAttribute('pathLength') === '1')).toBe(true);
    expect(new Set(rig.canopy.map((cluster) =>
      `${cluster.getAttribute('cx')}:${cluster.getAttribute('cy')}`,
    )).size).toBe(rig.canopy.length);

    const topology = [
      rig.trunk,
      ...rig.branches,
      ...rig.canopy,
    ];
    const participation: number[] = [];

    expect(track(view.container)).toBe('nothing');
    expect(getComputedStyle(terrain).visibility).toBe('hidden');
    participation.push(visibleParts(topology));
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(track(view.container)).toBe('island-reveal');
    expect(getComputedStyle(terrain).visibility).toBe('visible');
    participation.push(visibleParts(topology));
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(track(view.container)).toBe('trunk-growth');
    expect(getComputedStyle(rig.trunk).visibility).toBe('visible');
    expect(visibleParts(rig.branches)).toBe(0);
    expect(visibleParts(rig.canopy)).toBe(0);
    expect(getComputedStyle(rig.matureArt).visibility).toBe('hidden');
    participation.push(visibleParts(topology));
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(track(view.container)).toBe('branch-growth');
    expect(visibleParts(rig.branches)).toBe(rig.branches.length);
    expect(visibleParts(rig.canopy)).toBe(0);
    expect(getComputedStyle(rig.matureArt).visibility).toBe('hidden');
    participation.push(visibleParts(topology));
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(track(view.container)).toBe('canopy-accumulation');
    expect(visibleParts(rig.canopy)).toBe(rig.canopy.length);
    expect(getComputedStyle(rig.matureArt).visibility).toBe('hidden');
    participation.push(visibleParts(topology));
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(track(view.container)).toBe('mature-tree');
    expect(getComputedStyle(rig.matureArt).visibility).toBe('visible');
    participation.push(visibleParts(topology));

    expect(participation.slice(0, 5)).toEqual([
      0,
      0,
      1,
      1 + rig.branches.length,
      topology.length,
    ]);

    for (const element of secondary) {
      expect(getComputedStyle(element).visibility).toBe('hidden');
    }

    const css = readFileSync(resolve(process.cwd(), 'src', 'semantic-growth.css'), 'utf8');
    expect(css).toMatch(/\[data-tree-growth-part=['"]trunk['"]\][^{}]*\{[^}]*stroke-dashoffset/is);
    expect(css).toMatch(/\[data-tree-growth-part=['"]branch['"]\][^{}]*\{[^}]*stroke-dashoffset/is);
    expect(css).toMatch(/\[data-tree-growth-part=['"]canopy['"]\][^{}]*\{[^}]*(?:clip-path|scale)/is);
    expect(css).not.toMatch(/@keyframes\s+story-tree-enter/i);
    expect(css).not.toMatch(/\.story-tree\s+\.pop-motion-inner[^{}]*\{[^}]*animation/is);
    expect(css).not.toMatch(/image\.story-tree[^{}]*\{[^}]*animation/is);
    expect(css).not.toMatch(/@keyframes\s+(?:wisp|bloom|plate|parcel|flora)/i);
  }, 30_000);

  it('case 3/3 — Back, Replay and reduced motion preserve the same rig while six meanings fold into completed topology', () => {
    installSemanticGrowthCss();
    const expectedTracks = [
      'nothing',
      'island-reveal',
      'trunk-growth',
      'branch-growth',
      'canopy-accumulation',
      'mature-tree',
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
      const rig = growthRig(view.container);
      const observed: string[] = [];
      for (let index = 0; index < ORDERED_KEYS.length; index += 1) {
        observed.push(track(view.container) ?? '');
        expect(view.container.querySelector('[data-semantic-growth-island]')).toBe(island);
        expect(view.container.querySelector('g.story-tree')).toBe(rig.root);
        expect(view.container.querySelector('[data-tree-growth-part="trunk"]')).toBe(rig.trunk);
        expect([
          ...view.container.querySelectorAll('[data-tree-growth-part="branch"]'),
        ]).toEqual(rig.branches);
        expect([
          ...view.container.querySelectorAll('[data-tree-growth-part="canopy"]'),
        ]).toEqual(rig.canopy);
        if (index < ORDERED_KEYS.length - 1) {
          fireEvent.click(view.getByRole('button', { name: 'Next' }));
        }
      }
      const terminalTopology = rig.root.innerHTML;
      for (let index = ORDERED_KEYS.length - 1; index > 0; index -= 1) {
        fireEvent.click(view.getByRole('button', { name: 'Back' }));
      }
      expect(track(view.container)).toBe('nothing');
      fireEvent.click(view.getByRole('button', { name: 'Replay' }));
      expect(track(view.container)).toBe('nothing');
      expect(view.container.querySelector('[data-semantic-growth-island]')).toBe(island);
      expect(view.container.querySelector('g.story-tree')).toBe(rig.root);
      expect(view.container.querySelector('[data-tree-growth-part="trunk"]')).toBe(rig.trunk);
      if (reducedMotion) {
        expect(getComputedStyle(rig.trunk).animationName).not.toBe('tree-path-draw');
        expect(getComputedStyle(rig.branches[0]!).animationName).not.toBe('tree-path-draw');
        expect(getComputedStyle(rig.canopy[0]!).animationName).not.toBe('tree-canopy-collect');
      }
      return {
        observed,
        islandHtml: island?.innerHTML,
        treeTransform: rig.root.getAttribute('transform'),
        terminalTopology,
      };
    };

    const full = walk(false);
    cleanup();
    const reduced = walk(true);
    expect(full.observed).toEqual(expectedTracks);
    expect(reduced.observed).toEqual(expectedTracks);
    expect(reduced.islandHtml).toBe(full.islandHtml);
    expect(reduced.treeTransform).toBe(full.treeTransform);
    expect(reduced.terminalTopology).toBe(full.terminalTopology);
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
