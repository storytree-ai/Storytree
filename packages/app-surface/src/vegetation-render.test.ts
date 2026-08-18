// Stage-1 red-green for the per-frame vegetation layer and its stability signature.
//
// The signature is not a micro-optimisation and this suite treats it as load-bearing: a forest-map
// frame's cost is rasterisation and any write inside the SVG invalidates paint for the whole subtree
// (ADR-0272), so a NEW layer object on an unchanged picture breaks `SceneView`'s memo bail-out and
// buys a ~150–217 ms repaint for a frame that draws exactly the same thing. If this signature ever
// stops being stable on a still picture, the arc's frame-cost claim goes with it.

import { describe, expect, it } from 'vitest';
import { buildScene, type SceneInput, type SceneNode } from '@storytree/forest-world';
import { deriveForestRegrowPlan, forestRegrowAtProgress } from './forest-regrow.js';
import { deriveIslandVegetationPlans } from './island-vegetation-growth.js';
import {
  vegetationLayerSignature,
  vegetationProgressByStory,
  vegetationRenderLayer,
} from './vegetation-render.js';

function mkScene(ids: readonly string[]): SceneNode {
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 400,
    height: 200,
    empties: [],
    relaxedCells: null,
    drawTiles: [],
    wheatSets: ids.map(() => new Set<string>()),
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: ids.map((id, index) => ({
      id,
      status: 'healthy' as const,
      caps: 2,
      centroid: { x: 60 + index * 90, y: 60 },
      groundRadius: 28,
      screenRadius: 28,
      treeSpot: { x: 60 + index * 90, y: 55 },
      labelY: 96,
      coastPaths: ['M 0 0 L 1 0 Z'],
      decor: [{ x: 50 + index * 90, y: 50, seed: 3 + index }],
      plants: [{ id: `${id}#c`, status: 'healthy' as const, x: 55 + index * 90, y: 66, title: 'cap' }],
      treeTitle: id,
      signpost: { outcome: null },
      wisps: [],
      claims: [],
      plate: { w: 50, h: 30, rx: 6, idY: 12, subY: 24, idText: id, subText: '2 caps', title: id },
    })),
  };
  return buildScene(input);
}

const IDS = ['a', 'b', 'c'] as const;
const SCENE = mkScene([...IDS]);
const PLANS = deriveIslandVegetationPlans(SCENE, [
  ...IDS.map((storyId) => ({ storyId, caps: 2, radius: 28, status: 'healthy' as const })),
]);
const REGROW_PLAN = deriveForestRegrowPlan([
  { id: 'a', dependsOn: [] },
  { id: 'b', dependsOn: ['a'] },
  { id: 'c', dependsOn: ['b'] },
]);

describe('vegetationProgressByStory', () => {
  it('holds every island at 1 when there is no regrow — the ordinary map', () => {
    const progress = vegetationProgressByStory(null, IDS);
    expect([...progress.values()]).toEqual([1, 1, 1]);
  });

  it('reads the SAME cursor the ground accretion is riding, so the two cannot drift', () => {
    const state = forestRegrowAtProgress(REGROW_PLAN, 0.4);
    const progress = vegetationProgressByStory(state, IDS);
    for (const growth of state.growing) {
      expect(progress.get(growth.storyId)).toBe(growth.progress);
    }
    for (const id of state.landedStoryIds) expect(progress.get(id)).toBe(1);
    for (const id of state.absentStoryIds) expect(progress.get(id)).toBe(0);
  });

  it('never invents a story the caller did not name', () => {
    const progress = vegetationProgressByStory(forestRegrowAtProgress(REGROW_PLAN, 0.5), ['a']);
    expect([...progress.keys()]).toEqual(['a']);
  });
});

describe('vegetationRenderLayer', () => {
  it('covers every island’s tree and plants, keyed by scene-node identity', () => {
    const layer = vegetationRenderLayer(PLANS, vegetationProgressByStory(null, IDS));
    const tracked = [...layer.byNode.values()].filter((r) => r.kind === 'track');
    expect(tracked).toHaveLength(IDS.length * 2); // one tree + one plant per island
    // Identity keying: every key is a node the scene itself holds.
    const inScene = new Set<SceneNode>();
    const visit = (node: SceneNode): void => {
      inScene.add(node);
      if (node.el === 'g') for (const child of node.children) visit(child);
    };
    visit(SCENE);
    for (const node of layer.byNode.keys()) expect(inScene.has(node)).toBe(true);
  });

  it('carries no transform work at all for a fully settled forest', () => {
    const layer = vegetationRenderLayer(PLANS, vegetationProgressByStory(null, IDS));
    expect([...layer.byNode.values()].every((r) => r.kind === 'track')).toBe(true);
  });

  it('grows only the islands that are actually accreting', () => {
    const state = forestRegrowAtProgress(REGROW_PLAN, 0.3);
    const layer = vegetationRenderLayer(PLANS, vegetationProgressByStory(state, IDS));
    const moving = [...layer.byNode.values()].filter((r) => r.kind !== 'track');
    expect(moving.length).toBeGreaterThan(0);
    expect(state.growing.length).toBeGreaterThan(0);
  });
});

describe('vegetationLayerSignature', () => {
  it('is a constant once there is nothing to regrow', () => {
    expect(vegetationLayerSignature(null)).toBe(vegetationLayerSignature(null));
  });

  it('is stable across two states that would paint the identical picture', () => {
    const a = forestRegrowAtProgress(REGROW_PLAN, 0.42);
    const b = forestRegrowAtProgress(REGROW_PLAN, 0.42);
    expect(vegetationLayerSignature(a)).toBe(vegetationLayerSignature(b));
  });

  it('MOVES the moment a growing island’s cursor moves', () => {
    const state = forestRegrowAtProgress(REGROW_PLAN, 0.3);
    expect(state.growing.length).toBeGreaterThan(0);
    const nudged = forestRegrowAtProgress(REGROW_PLAN, 0.34);
    expect(vegetationLayerSignature(nudged)).not.toBe(vegetationLayerSignature(state));
  });

  it('moves when an island appears, even at the same growing set size', () => {
    // The absent-set size is in the signature for exactly this: an island crossing from absent to
    // accreting changes what is drawn without necessarily changing any existing cursor.
    const seen = new Set<string>();
    for (let i = 0; i <= 100; i++) seen.add(vegetationLayerSignature(forestRegrowAtProgress(REGROW_PLAN, i / 100)));
    expect(seen.size).toBeGreaterThan(10);
  });
});
