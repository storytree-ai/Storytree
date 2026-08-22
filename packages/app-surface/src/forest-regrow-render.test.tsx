// @vitest-environment jsdom
//
// forest-regrow-render — Stage-1 red-green (ADR-0070) of the Act 2 regrow's RENDER seam: that a
// story the regrow has not reached draws nothing at all, that a road whose far island has not
// landed is not drawn, that an accreting island plays the SAME Experiment 6 accretion the single
// island already does, and — the absence lock — that a scene with no regrow layer renders
// byte-for-byte as it did before the layer existed.

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildScene,
  type SceneInput,
  type SceneNode,
  type SceneTrailsInput,
} from '@storytree/forest-world';
import { SceneView, type SceneCtx } from './SceneView.js';
import {
  deriveForestRegrowPlan,
  forestRegrowAtProgress,
  type ForestRegrowStory,
} from './forest-regrow.js';
import {
  deriveForestRegrowAccretionPlans,
  forestRegrowRenderLayer,
} from './forest-regrow-render.js';

afterEach(cleanup);

const ROOT = 'root-island';
const LEAF = 'leaf-island';

const square = (x: number, y: number): readonly { x: number; y: number }[] => [
  { x, y },
  { x: x + 10, y },
  { x: x + 10, y: y + 10 },
  { x, y: y + 10 },
];

/** A two-island world joined by one two-segment road — the smallest thing that can be a forest. */
const TRAILS: SceneTrailsInput = {
  segments: [
    { id: 'seg-a', d: 'M 30 15 L 60 15', points: [{ x: 30, y: 15 }, { x: 60, y: 15 }], usage: 1, hidden: false },
    { id: 'seg-b', d: 'M 60 15 L 90 15', points: [{ x: 60, y: 15 }, { x: 90, y: 15 }], usage: 1, hidden: false },
  ],
  edges: [
    {
      from: ROOT,
      to: LEAF,
      segments: [
        { id: 'seg-a', reversed: false },
        { id: 'seg-b', reversed: false },
      ],
    },
  ],
  caves: [],
  dropped: [],
};

function island(id: string, dx: number): SceneInput['territories'][number] {
  return {
    id,
    status: 'mapped',
    caps: 0,
    centroid: { x: dx + 15, y: 15 },
    groundRadius: 18,
    screenRadius: 18,
    treeSpot: { x: dx + 15, y: 12 },
    labelY: 35,
    coastPaths: [`M ${dx - 3} -2 L ${dx + 33} -2 L ${dx + 34} 31 L ${dx - 2} 33 Z`],
    decor: [],
    plants: [],
    treeTitle: id,
    wisps: [],
    plate: { w: 30, h: 14, rx: 3, idY: 6, subY: 11, idText: id, subText: 'mapped', title: id },
  };
}

/**
 * The pale coast, ADR-0286-attributed: two hexes belonging to each island, plus one the caller
 * could not attribute. The unattributed hex is the absence lock's positive control — it must draw
 * at EVERY cursor, or the hide is reaching further than the attribution it is keyed on.
 */
const EMPTIES: SceneInput['empties'] = [
  { q: 0, r: 0, owner: 0 },
  { q: 1, r: 0, owner: 0 },
  { q: 8, r: 0, owner: 1 },
  { q: 9, r: 0, owner: 1 },
  { q: 4, r: 4 },
];

function forestScene(empties: SceneInput['empties'] = []): SceneNode {
  const cellsFor = (owner: number, dx: number): NonNullable<SceneInput['relaxedCells']> =>
    [0, 10, 20].flatMap((y) =>
      [0, 10, 20].map((x) => ({
        owner,
        poly: [...square(dx + x, y)],
        variant: (x + y) % 3,
        wheat: false,
      })),
    );
  const input: SceneInput = {
    offset: { x: 7, y: 11 },
    width: 140,
    height: 60,
    empties,
    relaxedCells: [...cellsFor(0, 0), ...cellsFor(1, 90)],
    drawTiles: [],
    wheatSets: [new Set(), new Set()],
    trails: TRAILS,
    territories: [island(ROOT, 0), island(LEAF, 90)],
  };
  return buildScene(input);
}

const GRAPH: readonly ForestRegrowStory[] = [
  { id: ROOT, dependsOn: [] },
  { id: LEAF, dependsOn: [ROOT] },
];

const ANCHORS = new Map([
  [ROOT, { x: 15, y: 15 }],
  [LEAF, { x: 105, y: 15 }],
]);

function ctxFor(layer?: SceneCtx['forestRegrowLayer']): SceneCtx {
  const ctx: SceneCtx = {
    territoryClassById: (_id, status) => `hex-territory st-${status}`,
    reveal: null,
    hidden: new Set(),
    onSelectStory: vi.fn(),
    onSelectCap: vi.fn(),
  };
  if (layer) ctx.forestRegrowLayer = layer;
  return ctx;
}

function draw(
  layer?: SceneCtx['forestRegrowLayer'],
  empties: SceneInput['empties'] = [],
): HTMLElement {
  const scene = forestScene(empties);
  return render(
    <svg>
      <SceneView scene={scene} ctx={ctxFor(layer)} />
    </svg>,
  ).container;
}

/** The regrow layer at a given cursor, over the real scene geometry. */
function layerAt(progress: number): NonNullable<SceneCtx['forestRegrowLayer']> {
  const scene = forestScene();
  const plan = deriveForestRegrowPlan(GRAPH, TRAILS.edges);
  const plans = deriveForestRegrowAccretionPlans(scene, ANCHORS);
  expect(plans.ungrown, 'both fixture islands carry connected land').toEqual([]);
  return forestRegrowRenderLayer(forestRegrowAtProgress(plan, progress), plans);
}

const emptyHexes = (container: HTMLElement): number =>
  container.querySelectorAll('.hex-empty').length;

const storyNodes = (container: HTMLElement, id: string): number =>
  container.querySelectorAll(`[data-story-id="${id}"]`).length;

const segmentNodes = (container: HTMLElement, id: string): number =>
  container.querySelectorAll(`[data-id="${id}"]`).length;

describe('the forest regrow render layer', () => {
  it('renders byte-for-byte unchanged when no layer is supplied (the absence lock)', () => {
    const before = draw().innerHTML;
    cleanup();
    const after = draw().innerHTML;
    expect(after).toBe(before);
  });

  it('renders byte-for-byte unchanged on the SETTLED forest, layer or not', () => {
    const plain = draw().innerHTML;
    cleanup();
    const settled = draw(layerAt(1)).innerHTML;
    expect(settled).toBe(plain);
  });

  // ── ADR-0286: the pale coast is per-island, and it lands with the SETTLED island ──
  //
  // Before this, the moat was one global layer with no owner, so it drew the whole forest's
  // hexagonal silhouette from frame one — every island announced before it existed. The owner
  // named it as the single biggest thing undercutting "grows from nothing".

  it('draws no attributed coast hex before its island has landed', () => {
    const container = draw(layerAt(0), EMPTIES);
    // Only the unattributed hex — the hide reaches exactly as far as the attribution does.
    expect(emptyHexes(container)).toBe(1);
  });

  it('still withholds an island’s coast while that island is mid-accretion', () => {
    const plan = deriveForestRegrowPlan(GRAPH, TRAILS.edges);
    const root = plan.stepByStory.get(ROOT)!;
    const midRoot = (root.start + root.end) / 2;
    const scene = forestScene();
    const plans = deriveForestRegrowAccretionPlans(scene, ANCHORS);
    const state = forestRegrowAtProgress(plan, midRoot);
    expect(state.growing.map((g) => g.storyId), 'ROOT is the island in flight').toEqual([ROOT]);
    const container = draw(forestRegrowRenderLayer(state, plans), EMPTIES);
    // The coast rings an island's FINAL footprint, so revealing it at the START of accretion would
    // draw a pale halo around a single cell — the same pre-announcement, one island at a time.
    expect(emptyHexes(container)).toBe(1);
  });

  it('reveals a landed island’s coast while a story still absent keeps none', () => {
    const plan = deriveForestRegrowPlan(GRAPH, TRAILS.edges);
    const root = plan.stepByStory.get(ROOT)!;
    const leaf = plan.stepByStory.get(LEAF)!;
    // After ROOT has fully accreted, before LEAF's pathway has arrived.
    const between = (root.end + leaf.start) / 2;
    expect(between).toBeGreaterThan(root.end);
    expect(between).toBeLessThan(leaf.start);
    const container = draw(layerAt(between), EMPTIES);
    // ROOT's two hexes + the unattributed one; LEAF's two are still withheld.
    expect(emptyHexes(container)).toBe(3);
  });

  it('draws the whole coast on the settled forest, byte-for-byte as with no layer', () => {
    const plain = draw(undefined, EMPTIES);
    expect(emptyHexes(plain)).toBe(EMPTIES.length);
    const html = plain.innerHTML;
    cleanup();
    expect(draw(layerAt(1), EMPTIES).innerHTML).toBe(html);
  });

  it('draws nothing at all for a story the regrow has not reached', () => {
    const container = draw(layerAt(0));
    expect(storyNodes(container, ROOT)).toBe(0);
    expect(storyNodes(container, LEAF)).toBe(0);
    expect(container.querySelector('.coast-fill-group')).toBeNull();
    expect(container.querySelector('.relaxed-tile')).toBeNull();
  });

  it('draws no road whose far island has not landed', () => {
    const plan = deriveForestRegrowPlan(GRAPH, TRAILS.edges);
    // Mid-way through the ROOT island's own accretion: root exists, leaf does not, so the road
    // between them is still a road to nowhere.
    const root = plan.stepByStory.get(ROOT)!;
    const container = draw(layerAt((root.start + root.end) / 2));
    expect(storyNodes(container, ROOT)).toBeGreaterThan(0);
    expect(storyNodes(container, LEAF)).toBe(0);
    expect(segmentNodes(container, 'seg-a')).toBe(0);
    expect(segmentNodes(container, 'seg-b')).toBe(0);
  });

  it('draws the road once both its islands are present', () => {
    const plan = deriveForestRegrowPlan(GRAPH, TRAILS.edges);
    const leaf = plan.stepByStory.get(LEAF)!;
    const container = draw(layerAt(leaf.start + 1e-4));
    expect(storyNodes(container, LEAF)).toBeGreaterThan(0);
    expect(segmentNodes(container, 'seg-a')).toBeGreaterThan(0);
    expect(segmentNodes(container, 'seg-b')).toBeGreaterThan(0);
  });

  it('plays the connected accretion on an island still growing', () => {
    const plan = deriveForestRegrowPlan(GRAPH, TRAILS.edges);
    const root = plan.stepByStory.get(ROOT)!;
    // Just inside the LAND phase (`LAND_SETTLED_AT` is 0.72 of the island's own window), so cells
    // are part-scaled rather than all-in or all-out.
    const container = draw(layerAt(root.start + (root.end - root.start) * 0.5));
    const cells = [...container.querySelectorAll('[data-island-accretion-cell]')];
    expect(cells.length).toBeGreaterThan(0);
    const scales = cells.map((cell) =>
      Number(cell.getAttribute('data-island-accretion-scale')),
    );
    expect(Math.max(...scales)).toBeGreaterThan(0);
    expect(Math.min(...scales)).toBeLessThan(1);
    for (const cell of cells) {
      expect(cell.getAttribute('transform')).toMatch(/scale\(/u);
    }
    // and the coast surfaces behind its own growing clip
    const coast = container.querySelector(`[data-island-accretion-coast="${ROOT}"]`);
    expect(coast).not.toBeNull();
    expect(coast!.getAttribute('clip-path')).toBe(`url(#svg-island-accretion-${ROOT})`);
    expect(container.querySelector(`clipPath#svg-island-accretion-${ROOT}`)).not.toBeNull();
  });

  it('leaves a LANDED island with no clip and no per-cell transform', () => {
    const plan = deriveForestRegrowPlan(GRAPH, TRAILS.edges);
    const leaf = plan.stepByStory.get(LEAF)!;
    // Root has settled; leaf is still growing.
    const container = draw(layerAt((leaf.start + leaf.end) / 2));
    expect(container.querySelector(`[data-island-accretion-coast="${ROOT}"]`)).toBeNull();
    expect(container.querySelector(`[data-island-accretion-coast="${LEAF}"]`)).not.toBeNull();
    expect(storyNodes(container, ROOT)).toBeGreaterThan(0);
  });

  it('emits one accretion clip per island in flight, keyed by story', () => {
    const layer = layerAt(0.001);
    // Wave 0 is a single island in this fixture, but the defs must be per-island, not a singleton.
    const container = draw(layer);
    const clips = container.querySelectorAll('clipPath[id^="svg-island-accretion-"]');
    expect(clips.length).toBe(layer.accretionByStory.size);
  });

  /**
   * This layer FLATTENS every in-flight island's per-cell reveals into ONE map, so the cell identity
   * the index is keyed on has to be unique across the whole forest and not merely within an island.
   * The `d`-string key was globally unique only by accident — two islands never sit at the same
   * coordinates — so a per-island ordinal would have silently made LEAF's nth cell shadow ROOT's.
   */
  it('keeps two islands’ cells apart in the flattened reveal index', () => {
    const scene = forestScene();
    const plans = deriveForestRegrowAccretionPlans(scene, ANCHORS);
    const root = plans.byStory.get(ROOT)!;
    const leaf = plans.byStory.get(LEAF)!;
    const rootKeys = root.cells.map((cell) => cell.key);
    const leafKeys = leaf.cells.map((cell) => cell.key);

    expect(new Set([...rootKeys, ...leafKeys]).size).toBe(rootKeys.length + leafKeys.length);
    // Both islands mid-accretion at once. The fixture's own schedule never does that (LEAF depends
    // on ROOT), so the state is built directly — a real forest with two independent roots would.
    const both = forestRegrowRenderLayer(
      {
        progress: 0.3,
        settled: false,
        landedStoryIds: new Set<string>(),
        growing: [
          { storyId: ROOT, progress: 0.3 },
          { storyId: LEAF, progress: 0.3 },
        ],
        presentStoryIds: new Set([ROOT, LEAF]),
        absentStoryIds: new Set<string>(),
        hiddenSegmentIds: new Set(['seg-a', 'seg-b']),
        drawingSegments: [],
        arrivalStoryIds: [],
      },
      plans,
    );
    expect(both.cellRevealById.size).toBe(rootKeys.length + leafKeys.length);
  });
});

describe('deriveForestRegrowAccretionPlans', () => {
  it('reports an island whose geometry cannot carry an accretion instead of throwing', () => {
    const plans = deriveForestRegrowAccretionPlans(forestScene(), {
      ...ANCHORS,
      // A story with no land at all in this scene.
      get: (key: string) => ANCHORS.get(key),
      keys: () => ['not-on-the-map'][Symbol.iterator](),
    } as unknown as ReadonlyMap<string, { x: number; y: number }>);
    expect(plans.byStory.size).toBe(0);
    expect(plans.ungrown).toHaveLength(1);
    expect(plans.ungrown[0]!.storyId).toBe('not-on-the-map');
  });

  it('derives a plan for every island that has one, in a deterministic order', () => {
    const scene = forestScene();
    const first = deriveForestRegrowAccretionPlans(scene, ANCHORS);
    const second = deriveForestRegrowAccretionPlans(scene, new Map([...ANCHORS].reverse()));
    expect([...first.byStory.keys()]).toEqual([...second.byStory.keys()]);
    expect([...first.byStory.keys()]).toEqual([LEAF, ROOT].sort());
  });
});
