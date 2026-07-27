// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppDataContext, type AppData } from '../lib/appData';
import { api } from '../api';
import { TreeView } from './TreeView';
import { SemanticGrowthDemo } from './SemanticGrowthDemo.js';
import type { SpriteStyleSheet } from '../lib/sprite-sheet.js';

vi.mock('../api', () => ({
  api: {
    tree: vi.fn(async () => ({
      stories: [{
        id: 'studio',
        title: 'Studio',
        outcome: 'the studio serves',
        status: 'healthy',
        proofMode: 'UAT',
        uatWitness: 'machine',
        dependsOn: [],
        consumedBy: [],
        capabilities: [],
      }],
    })),
    activity: vi.fn(async () => ({ builds: null, claims: null })),
  },
}));

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

const appData: AppData = {
  docs: [],
  docIds: new Set(),
  docTitles: new Map(),
  assets: [],
  comments: [],
  me: { email: 'owner@example.com', role: 'admin', status: 'active', member: true },
  refreshComments: async () => {},
  refreshAssets: async () => {},
};

async function renderTree(): Promise<HTMLElement> {
  const { container } = render(
    <AppDataContext.Provider value={appData}>
      <TreeView focus={null} />
    </AppDataContext.Provider>,
  );
  await act(async () => {});
  expect(api.tree).toHaveBeenCalled();
  return container;
}

describe('TreeView shell — full-bleed map, no session counter', () => {
  it('asa-treeview-mounts-one-shared-world-view', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'TreeView.tsx'),
      'utf8',
    );
    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bWorldSceneView\b[\s\S]*?\}\s*from '@storytree\/app-surface'/,
    );
    expect(source).toMatch(/<WorldSceneView\b/);
    expect(source).not.toMatch(
      /import\s*\{[\s\S]*?\bSceneView\b[\s\S]*?\}\s*from '\.\/SceneView\.js'/,
    );
  });

  it('full-bleed-map: the tree wrap carries no padding ring around the world', async () => {
    const container = await renderTree();
    const wrap = container.querySelector('.tree-wrap');
    expect(wrap).toBeTruthy();
    expect(wrap!.classList.contains('pad')).toBe(false);
  });

  it('no-session-counter: active sessions render no toolbar counter above the map', async () => {
    const container = await renderTree();
    expect(container.querySelector('.tree-toolbar')).toBeNull();
    expect(container.textContent).not.toMatch(/active session|aged session/i);
  });
});

const ORDERED_KEYS = [
  'empty',
  'land',
  'proposed',
  'claimed',
  'signed-proof',
  'healthy',
] as const;

function semanticRoot(container: HTMLElement): Element {
  const root = container.querySelector('[data-semantic-growth-frame]');
  expect(root).toBeTruthy();
  return root!;
}

function control(container: HTMLElement, name: 'Back' | 'Next' | 'Replay'): HTMLElement {
  const button = [...container.querySelectorAll(
    'nav[aria-label="Semantic growth controls"] button',
  )].find((candidate) => candidate.textContent === name);
  expect(button).toBeTruthy();
  return button as HTMLElement;
}

describe('semantic-growth Studio witness', () => {
  it('keeps the clean route unchanged and mounts the public player only for the exact demo flag', async () => {
    const clean = await renderTree();
    expect(clean.querySelector('[data-semantic-growth-frame]')).toBeNull();
    cleanup();

    window.history.pushState({}, '', '/?semanticGrowth=off#/tree');
    const unknown = await renderTree();
    expect(unknown.querySelector('[data-semantic-growth-frame]')).toBeNull();
    cleanup();

    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    expect(flagged.querySelectorAll('[data-semantic-growth-frame]')).toHaveLength(1);
    expect(semanticRoot(flagged).getAttribute('data-semantic-growth-frame')).toBe('empty');
    fireEvent.click(control(flagged, 'Next'));
    expect(semanticRoot(flagged).getAttribute('data-semantic-growth-frame')).toBe('land');
  });

  it('retains one island and planted story tree while semantic events cue the corrected four tracks', async () => {
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const container = await renderTree();
    const held = {
      island: container.querySelector('[data-semantic-growth-island="semantic-growth-demo"]'),
      terrain: container.querySelector('.coast-fill-group'),
      tree: container.querySelector('.story-tree'),
    };
    for (const element of Object.values(held)) expect(element).toBeTruthy();
    expect(
      [...container.querySelectorAll('[data-semantic-growth-anchor]')]
        .map((anchor) => anchor.getAttribute('data-semantic-growth-anchor')),
    ).toEqual(['terrain', 'story-tree']);

    const expectedTracks = [
      'nothing',
      'island-reveal',
      'story-tree-entrance',
      'story-tree-settled',
      'story-tree-settled',
      'story-tree-settled',
    ];
    for (let index = 0; index < ORDERED_KEYS.length; index += 1) {
      const root = semanticRoot(container);
      expect(root.getAttribute('data-semantic-growth-frame')).toBe(ORDERED_KEYS[index]);
      expect(root.getAttribute('data-semantic-growth-track')).toBe(expectedTracks[index]);
      expect(container.querySelector('[data-semantic-growth-island]')).toBe(held.island);
      expect(container.querySelector('.coast-fill-group')).toBe(held.terrain);
      expect(container.querySelector('.story-tree')).toBe(held.tree);
      if (index < ORDERED_KEYS.length - 1) fireEvent.click(control(container, 'Next'));
    }

    fireEvent.click(control(container, 'Back'));
    expect(container.querySelector('.story-tree')).toBe(held.tree);
    fireEvent.click(control(container, 'Replay'));
    expect(container.querySelector('.story-tree')).toBe(held.tree);
  });

  it('keeps wisps, pathways, proof ornaments and unrelated fixture UI out of the story-tree witness', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'SemanticGrowthDemo.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/COMPANION|stripKind|buildFrames|SemanticGrowthFrame/);
    expect(source).not.toMatch(/<SceneView\b|<WorldSceneView\b|<path\b/);
    expect(source).toMatch(/<SemanticGrowthWorldView\b/);
    expect(source).not.toMatch(/LaneLayout|DEMO_CLAIM|\blanes\b|laneMotion|verdict:/);

    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const container = await renderTree();
    const storyIds = new Set(
      [...container.querySelectorAll('[data-story-id]')]
        .map((element) => element.getAttribute('data-story-id')),
    );
    expect(storyIds).toEqual(new Set(['semantic-growth-demo']));
    expect(container.querySelector('.world-claim-wisp')).toBeNull();
    expect(container.querySelector('.world-bloom')).toBeNull();
    expect(container.querySelector('.trail-lane')).toBeNull();
    expect(container.querySelector('.parcel')).toBeNull();
    expect(container.querySelector('.parcel-flora')).toBeNull();
  });

  it('composes the fixture through the real Studio world pipeline and stays bounded by the map host', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'SemanticGrowthDemo.tsx'),
      'utf8',
    );
    expect(source).toMatch(/\bbuildWorld\s*\(/);
    expect(source).toMatch(/\bbuildRelaxedCells\s*\(/);
    expect(source).toMatch(/\bworldToScene\s*\(/);
    expect(source).toMatch(/\bbuildScene\s*\(/);
    expect(source).not.toMatch(/\bSceneInput\b|relaxedCells\s*:\s*\[\]|drawTiles\s*:\s*\[\]/);

    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const container = await renderTree();
    expect(container.querySelector('.tree-layout > .world-frame')).toBeTruthy();
    expect(container.querySelectorAll('.relaxed-tile, .relaxed-cell').length).toBeGreaterThan(0);
    expect(container.querySelector('.story-tree')).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('viewBox')).not.toBe('0 0 100 100');
  });

  it('uses the same persistent hierarchy with the supplied Storybook sprite sheet', () => {
    const sheet: SpriteStyleSheet = {
      name: 'storybook',
      label: 'Storybook',
      sprites: {
        'tree:proposed': {
          href: '/art-sheets/storybook/tree-proposed.svg',
          w: 40,
          h: 60,
          anchorX: 0.5,
          anchorY: 1,
        },
      },
    };
    const view = render(<SemanticGrowthDemo spriteSheet={sheet} artScale={1} />);
    const island = view.container.querySelector('[data-semantic-growth-island]');
    const tree = view.container.querySelector('image.story-tree');
    expect(island).toBeTruthy();
    expect(tree?.getAttribute('href')).toBe('/art-sheets/storybook/tree-proposed.svg');
    for (const _key of ORDERED_KEYS.slice(1)) {
      fireEvent.click(control(view.container, 'Next'));
      expect(view.container.querySelector('[data-semantic-growth-island]')).toBe(island);
      expect(view.container.querySelector('image.story-tree')).toBe(tree);
    }
  });
});
