// sceneExport — the `?sceneExport=1` bridge's grammar and its bookkeeping, without a window.

import { HEX_R, HEX_TILES_PER_CAPABILITY, TILE_QUOTA_RULE } from '@storytree/forest-world';
import type { SceneG } from '@storytree/forest-world';
import { describe, expect, it } from 'vitest';

import { MAPPER_READ_KINDS, pruneSceneForMapper, readSceneExport, sceneExportBridge, type ExportableWorld } from './sceneExport.js';

const scene: SceneG = { el: 'g', children: [] };

// The bridge counts segments/edges/caves and copies `dropped`, so the fixture carries exactly that.
const trails: ExportableWorld['trails'] = {
  segments: [{ id: 's1' }, { id: 's2' }],
  edges: [{ from: 'a', to: 'b' }],
  caves: [],
  dropped: [{ from: 'x', to: 'y' }],
};

const world: ExportableWorld = {
  territories: [
    { story: { id: 'a' }, centroid: { x: 1, y: 2 }, groundRadius: 70, caps: [1, 2, 3], tiles: [1, 2, 3, 4, 5] },
    { story: { id: 'b' }, centroid: { x: 9, y: 8 }, groundRadius: 90, caps: [], tiles: [1, 2, 3] },
  ],
  trails,
  width: 100,
  height: 50,
  offset: { x: -3, y: -4 },
};

describe('readSceneExport', () => {
  it('is on for ?sceneExport=1 / true and off for anything else, including absence', () => {
    expect(readSceneExport('?sceneExport=1')).toBe(true);
    expect(readSceneExport('?a=b&sceneExport=true')).toBe(true);
    expect(readSceneExport('?sceneExport=0')).toBe(false);
    expect(readSceneExport('?sceneExport=')).toBe(false);
    expect(readSceneExport('')).toBe(false);
  });
});

describe('sceneExportBridge', () => {
  it('carries the scene by reference and the layout bookkeeping a driver verifies trails with', () => {
    const b = sceneExportBridge(world, scene, { ratio: 0.2 });
    expect(b.scene).toBe(scene);
    expect(b.spacing).toEqual({ ratio: 0.2 });
    expect(b.world).toEqual({
      width: 100,
      height: 50,
      offset: { x: -3, y: -4 },
      islands: [
        { id: 'a', centroid: { x: 1, y: 2 }, groundRadius: 70, capabilities: 3, tiles: 5 },
        { id: 'b', centroid: { x: 9, y: 8 }, groundRadius: 90, capabilities: 0, tiles: 3 },
      ],
    });
    expect(b.trails).toEqual({ edges: 1, segments: 2, caves: 0, dropped: [{ from: 'x', to: 'y' }] });
  });

  it('ADR-0528: records the tile the lattice was built on — the engine’s own derived radius and quota — and the art rungs only when a dial moved one', () => {
    const b = sceneExportBridge(world, scene, {});
    expect(b.tile).toEqual({ hexR: HEX_R, quota: TILE_QUOTA_RULE, tilesPerCapability: HEX_TILES_PER_CAPABILITY });
    expect(b.tile.hexR).toBeCloseTo(11.063, 3);
    expect(b.tile.quota).toBe('max(1, capabilities) × 1 hexes');
    expect('rungs' in b.tile).toBe(false);
    expect('rungs' in sceneExportBridge(world, scene, {}, null).tile).toBe(false);
    expect('rungs' in sceneExportBridge(world, scene, {}, {}).tile).toBe(false);
    const dialled = sceneExportBridge(world, scene, {}, { tree: 0.8, plate: 1.25 });
    expect(dialled.tile.rungs).toEqual({ tree: 0.8, plate: 1.25 });
    // a copy, never the caller's object
    const rungs = { trail: 2.44 };
    const b2 = sceneExportBridge(world, scene, {}, rungs);
    expect(b2.tile.rungs).toEqual(rungs);
    expect(b2.tile.rungs).not.toBe(rungs);
  });

  it('records the legacy triple when the control arm asked for it, and omits absent keys rather than writing undefined', () => {
    const b = sceneExportBridge(world, scene, { legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 } });
    expect(b.spacing).toEqual({ legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 } });
    expect('ratio' in b.spacing).toBe(false);
    expect(sceneExportBridge(world, scene, {}).spacing).toEqual({});
  });
});

describe('pruneSceneForMapper', () => {
  const full: SceneG = {
    el: 'g',
    kind: 'ground',
    id: 'story-a',
    status: 'healthy',
    children: [
      { el: 'path', kind: 'cell', d: 'M0 0L1 0L1 1Z', cellId: 'c1' },
      { el: 'path', kind: 'parcel-blade', d: 'M0 0L0 1' },
      { el: 'ellipse', kind: 'parcel-shrub', cx: 0, cy: 0, rx: 1, ry: 1 },
      { el: 'text', x: 0, y: 0, text: 'story-a', anchor: 'middle' },
      {
        el: 'g',
        kind: 'territory',
        id: 'story-a',
        transform: 'translate(10 20)',
        children: [
          { el: 'g', kind: 'tall-flower-proven', id: 'crit-1', children: [{ el: 'circle', kind: 'tall-flower-glow', cx: 0, cy: 0, r: 1 }] },
          { el: 'path', kind: 'trail-fill', d: 'M0 0L5 5', usage: 2, edges: 'a->b' },
          { el: 'path', kind: 'coast-shore', d: 'M0 0L5 5' },
        ],
      },
    ],
  };

  it('keeps every group with its translate/identity/status, keeps only the leaves the mapper reads, and drops the rest', () => {
    const pruned = pruneSceneForMapper(full);
    expect(pruned.kind).toBe('ground');
    expect(pruned.id).toBe('story-a');
    expect(pruned.status).toBe('healthy');
    expect(pruned.children.map((c) => c.kind)).toEqual(['cell', 'territory']);
    const territory = pruned.children[1] as SceneG;
    expect(territory.transform).toBe('translate(10 20)');
    expect(territory.children.map((c) => c.kind)).toEqual(['tall-flower-proven', 'trail-fill']);
    // a group the mapper reads by KIND keeps its identity even when every leaf under it is pruned
    expect((territory.children[0] as SceneG).children).toEqual([]);
    expect((territory.children[0] as SceneG).id).toBe('crit-1');
  });

  it('is total and pure — pruning twice is the identity on a pruned scene, and the input is untouched', () => {
    const once = pruneSceneForMapper(full);
    expect(pruneSceneForMapper(once)).toEqual(once);
    expect(full.children).toHaveLength(5);
  });

  it('names exactly the kinds the walk switches on, and an anonymous leaf is not among them', () => {
    expect([...MAPPER_READ_KINDS].sort()).toEqual(['cave', 'cell', 'cell-wheat', 'tall-flower-proven', 'trail-fill', 'trail-ghost', 'wisp']);
    expect(MAPPER_READ_KINDS.has(undefined)).toBe(false);
    // a kind-less leaf under a group is dropped, a kind-less GROUP is kept (it may carry a translate)
    const pruned = pruneSceneForMapper({ el: 'g', children: [{ el: 'path', d: 'M0 0' }, { el: 'g', transform: 'translate(1 2)', children: [] }] });
    expect(pruned.children).toEqual([{ el: 'g', transform: 'translate(1 2)', children: [] }]);
  });
});
