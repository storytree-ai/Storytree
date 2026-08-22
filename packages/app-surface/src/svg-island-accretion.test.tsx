// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildScene,
  type SceneInput,
  type SceneNode,
  type ScenePath,
  type SceneTrailsInput,
} from '@storytree/forest-world';
import { CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY } from './organic-pose-to-pose-assets.js';
import { SceneView, type SceneCtx } from './SceneView.js';
import {
  SemanticGrowthWorldView,
  type SemanticGrowthAnimationClock,
  type SemanticGrowthFrame,
} from './SemanticGrowthWorldView.js';
import { normalizeWorldPresentationModel } from './WorldSceneView.js';
import {
  deriveSharedEdgeAdjacency,
  deriveSvgIslandAccretionPlan,
  svgIslandAccretionAtProgress,
  type SvgIslandAccretionState,
} from './svg-island-accretion.js';

afterEach(cleanup);

const STORY_ID = 'connected-island';
const NO_TRAILS: SceneTrailsInput = {
  segments: [],
  edges: [],
  caves: [],
  dropped: [],
};

const square = (x: number, y: number): readonly { x: number; y: number }[] => [
  { x, y },
  { x: x + 10, y },
  { x: x + 10, y: y + 10 },
  { x, y: y + 10 },
];

function islandInput(): SceneInput {
  return {
    offset: { x: 7, y: 11 },
    width: 42,
    height: 38,
    empties: [],
    relaxedCells: [
      { owner: 0, poly: [...square(0, 0)], variant: 0, wheat: false },
      { owner: 0, poly: [...square(10, 0)], variant: 1, wheat: false },
      { owner: 0, poly: [...square(20, 0)], variant: 2, wheat: false },
      { owner: 0, poly: [...square(0, 10)], variant: 1, wheat: false },
      { owner: 0, poly: [...square(10, 10)], variant: 2, wheat: false },
      { owner: 0, poly: [...square(20, 10)], variant: 0, wheat: false },
      { owner: 0, poly: [...square(0, 20)], variant: 2, wheat: false },
      { owner: 0, poly: [...square(10, 20)], variant: 0, wheat: false },
      { owner: 0, poly: [...square(20, 20)], variant: 1, wheat: false },
    ],
    drawTiles: [],
    wheatSets: [new Set()],
    trails: NO_TRAILS,
    territories: [
      {
        id: STORY_ID,
        status: 'mapped',
        caps: 0,
        centroid: { x: 15, y: 15 },
        groundRadius: 18,
        screenRadius: 18,
        treeSpot: { x: 15, y: 12 },
        labelY: 35,
        coastPaths: ['M -3 -2 L 33 -2 L 34 31 L -2 33 Z'],
        decor: [],
        plants: [],
        treeTitle: 'Connected island',
        wisps: [],
        plate: {
          w: 30,
          h: 14,
          rx: 3,
          idY: 6,
          subY: 11,
          idText: STORY_ID,
          subText: 'mapped',
          title: 'Connected island',
        },
      },
    ],
  };
}

function islandScene(): SceneNode {
  return buildScene(islandInput());
}

function withoutPrimaryLand(node: SceneNode): SceneNode {
  if (node.el !== 'g') return node;
  return {
    ...node,
    children: node.children
      .filter(
        (child) =>
          !(
            (child.kind === 'ground' || child.kind === 'coast') &&
            child.id === STORY_ID
          ),
      )
      .map(withoutPrimaryLand),
  };
}

function sceneContext(
  svgIslandAccretionLayer?: SvgIslandAccretionState,
): SceneCtx {
  const ctx: SceneCtx = {
    territoryClassById: (_id, status) => `hex-territory st-${status}`,
    reveal: null,
    hidden: new Set(),
    onSelectStory: vi.fn(),
    onSelectCap: vi.fn(),
  };
  if (svgIslandAccretionLayer) ctx.svgIslandAccretionLayer = svgIslandAccretionLayer;
  return ctx;
}

function targetOuterHtml(container: HTMLElement) {
  return {
    coast: container.querySelector('.coast-fill-group')?.outerHTML,
    ground: container.querySelector('.relaxed-tile')?.outerHTML,
    hit: container.querySelector('.world-story-hit')?.outerHTML,
    worldTransform: container.querySelector('svg > g')?.getAttribute('transform'),
  };
}

describe('connected SVG island accretion topology', () => {
  it('derives true shared-edge adjacency, never corner proximity, and a deterministic connected outward prefix', () => {
    const polygons = [
      square(0, 0),
      square(10, 0),
      square(20, 0),
      square(20, 10),
    ];
    const adjacency = deriveSharedEdgeAdjacency(polygons);
    expect(adjacency.map((neighbours) => [...neighbours])).toEqual([
      [1],
      [0, 2],
      [1, 3],
      [2],
    ]);

    const scene = islandScene();
    const first = deriveSvgIslandAccretionPlan(scene, STORY_ID, { x: 15, y: 15 });
    const second = deriveSvgIslandAccretionPlan(scene, STORY_ID, { x: 15, y: 15 });
    expect(second).toEqual(first);
    expect(first.cells).toHaveLength(9);
    expect(first.cells[0]?.centroid).toEqual({ x: 15, y: 15 });
    expect(first.cells[0]?.wave).toBe(0);
    expect(first.boundaryCellKeys).toHaveLength(8);

    for (let count = 1; count <= first.cells.length; count += 1) {
      const prefix = new Set(first.cells.slice(0, count).map((cell) => cell.key));
      for (const cell of first.cells.slice(1, count)) {
        expect(
          cell.neighbourKeys.some((key) => prefix.has(key) && first.orderByKey.get(key)! < cell.order),
          `cell ${cell.key} must accrete from an earlier shared-edge neighbour`,
        ).toBe(true);
      }
    }
  });

  it('clamps progress, grows opaque local geometry smoothly, completes the ground before settling the real coast, and bypasses all reveal geometry when mature', () => {
    const plan = deriveSvgIslandAccretionPlan(islandScene(), STORY_ID, { x: 15, y: 15 });
    expect(svgIslandAccretionAtProgress(plan, Number.NaN)).toEqual(
      svgIslandAccretionAtProgress(plan, 0),
    );
    expect(svgIslandAccretionAtProgress(plan, -100).progress).toBe(0);
    expect(svgIslandAccretionAtProgress(plan, 100).progress).toBe(1);

    const forming = svgIslandAccretionAtProgress(plan, 0.37);
    const visible = forming.cells.filter((cell) => cell.scale > 0);
    expect(visible.length).toBeGreaterThan(1);
    expect(visible.length).toBeLessThan(plan.cells.length);
    expect(visible.map((cell) => cell.key)).toEqual(
      plan.cells.slice(0, visible.length).map((cell) => cell.key),
    );
    expect(visible.some((cell) => cell.scale > 0 && cell.scale < 1)).toBe(true);
    expect(forming.coastProgress).toBe(0);
    expect(forming.cells.every((cell) => !('opacity' in cell))).toBe(true);

    const groundSettled = svgIslandAccretionAtProgress(plan, 0.72);
    expect(groundSettled.cells.every((cell) => cell.scale === 1)).toBe(true);
    expect(groundSettled.coastProgress).toBe(0);

    const coastlineSettling = svgIslandAccretionAtProgress(plan, 0.81);
    expect(coastlineSettling.cells.every((cell) => cell.scale === 1)).toBe(true);
    expect(coastlineSettling.coastProgress).toBeGreaterThan(0);
    expect(coastlineSettling.coastProgress).toBeLessThan(1);
    const coastVisible = coastlineSettling.coastReveals.filter((reveal) => reveal.scale > 0);
    expect(coastVisible).toHaveLength(1);
    expect(coastVisible[0]?.key).toBe('coast-settlement');

    const terminalHold = svgIslandAccretionAtProgress(plan, 0.95);
    const justBeforeMature = svgIslandAccretionAtProgress(plan, 0.99);
    expect(terminalHold.coastProgress).toBe(1);
    expect(justBeforeMature.cells).toEqual(terminalHold.cells);
    expect(justBeforeMature.coastReveals).toEqual(terminalHold.coastReveals);

    const mature = svgIslandAccretionAtProgress(plan, 1);
    expect(mature.mature).toBe(true);
    expect(mature.cells.every((cell) => cell.scale === 1)).toBe(true);
    expect(mature.coastProgress).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// the reveal INDEX (the ADR-0367 prerequisite)
// ---------------------------------------------------------------------------
//
// The per-cell reveal used to be indexed by the cell's LITERAL emitted `d` string, so the key WAS the
// geometry, down to `polyPath`'s one decimal place. ADR-0367 moves the land's geometry (a declared
// camera first, Blender-rendered art after), and under a `d`-keyed index every cell that moved would
// silently lose its reveal transform: the lookup misses, the cell renders un-transformed, and the
// symptom reads as an easing bug rather than a broken index — nothing throws and nothing in the gate
// notices. These tests hold the index to IDENTITY instead: the SAME cell, re-emitted with different
// path bytes, must still resolve.

/** Every land-cell path node the scene emits for `storyId`, in emission order. */
function groundCellNodes(node: SceneNode, storyId: string, inGround = false): ScenePath[] {
  const targetGround =
    inGround || (node.el === 'g' && node.kind === 'ground' && node.id === storyId);
  if (targetGround && node.el === 'path' && (node.kind === 'cell' || node.kind === 'cell-wheat')) {
    return [node];
  }
  if (node.el !== 'g') return [];
  return node.children.flatMap((child) => groundCellNodes(child, storyId, targetGround));
}

/**
 * Re-print every land cell's coordinates at a FINER precision — the same polygons, different `d`
 * bytes. This is the cheapest honest stand-in for "the land's geometry moved": ADR-0367's
 * Consequences name a change in printed decimal places alongside a new lattice and a rendered tile,
 * and all three break a byte-keyed index the same way. Nothing about WHICH cell each one is changes.
 */
function reprintFiner(node: SceneNode): SceneNode {
  const finer = (d: string): string => d.replace(/-?\d+(?:\.\d+)?/gu, (n) => Number(n).toFixed(3));
  if (node.el === 'g') return { ...node, children: node.children.map(reprintFiner) };
  return node.el === 'path' && (node.kind === 'cell' || node.kind === 'cell-wheat')
    ? { ...node, d: finer(node.d) }
    : node;
}

describe('the SVG island accretion reveal index', () => {
  it('resolves every re-emitted cell, because the key is the cell identity and not its path bytes', () => {
    const scene = islandScene();
    const plan = deriveSvgIslandAccretionPlan(scene, STORY_ID, { x: 15, y: 15 });
    const forming = svgIslandAccretionAtProgress(plan, 0.37);

    const emitted = groundCellNodes(scene, STORY_ID);
    const moved = groundCellNodes(reprintFiner(scene), STORY_ID);
    expect(emitted).toHaveLength(plan.cells.length);
    expect(moved.map((cell) => cell.d)).not.toEqual(emitted.map((cell) => cell.d));

    moved.forEach((cell, index) => {
      const id = cell.cellId;
      expect(id, 'every emitted land cell carries a shape-free identity').toBe(
        emitted[index]!.cellId,
      );
      expect(
        forming.cellById.get(id!)?.key,
        `cell ${id} lost its reveal when its geometry was re-emitted`,
      ).toBe(id);
    });
  });

  it('still transforms every accreting cell after the land geometry moves', () => {
    const scene = islandScene();
    const plan = deriveSvgIslandAccretionPlan(scene, STORY_ID, { x: 15, y: 15 });
    const moved = render(
      <svg viewBox="-12 -8 70 62">
        <SceneView
          scene={reprintFiner(scene)}
          ctx={sceneContext(svgIslandAccretionAtProgress(plan, 0.37))}
        />
      </svg>,
    );
    expect(moved.container.querySelectorAll('[data-island-accretion-cell]')).toHaveLength(
      plan.cells.length,
    );
  });
});

describe('connected SVG island accretion renderer and public player', () => {
  it('locally scales real cell paths without opacity, keeps coast/camera/anchor/painter and interaction geometry fixed, and emits the exact ordinary island at progress 1', () => {
    const scene = islandScene();
    const plan = deriveSvgIslandAccretionPlan(scene, STORY_ID, { x: 15, y: 15 });
    const base = render(
      <svg viewBox="-12 -8 70 62">
        <SceneView scene={scene} ctx={sceneContext()} />
      </svg>,
    );
    const ordinary = targetOuterHtml(base.container);
    cleanup();

    const forming = render(
      <svg viewBox="-12 -8 70 62">
        <SceneView
          scene={scene}
          ctx={sceneContext(svgIslandAccretionAtProgress(plan, 0.37))}
        />
      </svg>,
    );
    const formingGeometry = targetOuterHtml(forming.container);
    expect(forming.container.querySelectorAll('[data-island-accretion-cell]').length).toBeGreaterThan(0);
    expect(
      Array.from(forming.container.querySelectorAll('[data-island-accretion-cell]')).some(
        (cell) => cell.getAttribute('transform')?.includes('scale('),
      ),
    ).toBe(true);
    expect(forming.container.querySelector('[data-island-accretion-cell][opacity]')).toBeNull();
    expect(forming.container.querySelector('[data-island-accretion-cell][style*="opacity"]')).toBeNull();
    expect(
      forming.container.querySelector('[data-island-accretion-coast][clip-path]'),
    ).toBeTruthy();
    expect(forming.container.querySelector('image[data-island-accretion-cell]')).toBeNull();
    expect(formingGeometry.worldTransform).toBe(ordinary.worldTransform);
    expect(formingGeometry.hit).toBe(ordinary.hit);
    expect(forming.container.querySelector('svg')?.getAttribute('viewBox')).toBe('-12 -8 70 62');
    const coast = forming.container.querySelector('.coast-fill-group')!;
    const ground = forming.container.querySelector('.relaxed-tile')!;
    const trails = forming.container.querySelector('.trail-net')!;
    expect(coast.compareDocumentPosition(ground) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ground.compareDocumentPosition(trails) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    const mature = render(
      <svg viewBox="-12 -8 70 62">
        <SceneView
          scene={scene}
          ctx={sceneContext(svgIslandAccretionAtProgress(plan, 1))}
        />
      </svg>,
    );
    const settled = targetOuterHtml(mature.container);
    expect(settled.ground).toBe(ordinary.ground);
    expect(settled.coast).toBe(ordinary.coast);
    expect(settled.hit).toBe(ordinary.hit);
    expect(settled.worldTransform).toBe(ordinary.worldTransform);
    expect(mature.container.querySelector('[data-island-accretion-cell]')).toBeNull();
    expect(mature.container.querySelector('[data-island-accretion-coast]')).toBeNull();
    expect(mature.container.querySelector('clipPath[id^="svg-island-accretion-"]')).toBeNull();
  });

  it('uses the existing app clock for deterministic Back/Replay and selects exact settled geometry immediately under reduced motion', () => {
    const matureScene = islandScene();
    const emptyScene = withoutPrimaryLand(matureScene);
    const ordered = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;
    const frames: readonly SemanticGrowthFrame[] = ordered.map((key, index) => ({
      key,
      model: normalizeWorldPresentationModel({ scene: index === 0 ? emptyScene : matureScene }),
    }));
    const organicPoseGrowth = {
      registry: CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY,
      instances: [
        {
          trackId: 'chapter2-hero-tree-pose-track-v1',
          worldAnchor: { x: 15, y: 12 },
          scale: 0.34,
          progressWindow: { start: 0.18, end: 1 },
        },
        {
          trackId: 'chapter2-plant-sample-pose-track-v1',
          worldAnchor: { x: 22, y: 18 },
          scale: 0.3,
          progressWindow: { start: 0.52, end: 1 },
        },
      ],
      nativeIsland: {
        storyId: STORY_ID,
        worldAnchor: { x: 15, y: 15 },
        radius: { x: 20, y: 18 },
        settledAtProgress: 0.18,
      },
    } as const;
    const view = render(
      <SemanticGrowthWorldView
        frames={frames}
        organicPoseGrowth={organicPoseGrowth}
        svgIslandAccretion={{
          storyId: STORY_ID,
          worldAnchor: { x: 15, y: 15 },
          growthDurationMs: 1_600,
        }}
        reducedMotion
      />,
    );
    const section = view.container.querySelector('section')!;
    const viewBox = view.container.querySelector('svg')?.getAttribute('viewBox');
    expect(section.getAttribute('data-island-technique')).toBe('connected-accretion');
    expect(section.getAttribute('data-svg-island-accretion-progress')).toBe('0.0000');

    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(section.getAttribute('data-semantic-growth-frame')).toBe('land');
    expect(section.getAttribute('data-svg-island-accretion-progress')).toBe('1.0000');
    expect(view.container.querySelector('.relaxed-tile')).toBeTruthy();
    expect(view.container.querySelector('[data-island-accretion-cell]')).toBeNull();
    expect(view.container.querySelector('clipPath[id^="svg-island-accretion-"]')).toBeNull();
    expect(view.container.querySelector('svg')?.getAttribute('viewBox')).toBe(viewBox);

    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    const backed = [
      section.getAttribute('data-semantic-growth-frame'),
      section.getAttribute('data-svg-island-accretion-progress'),
      view.container.querySelector('.relaxed-tile')?.outerHTML ?? null,
    ];
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    fireEvent.click(view.getByRole('button', { name: 'Replay' }));
    expect([
      section.getAttribute('data-semantic-growth-frame'),
      section.getAttribute('data-svg-island-accretion-progress'),
      view.container.querySelector('.relaxed-tile')?.outerHTML ?? null,
    ]).toEqual(backed);
  });

  it('settles full-motion Back to the same empty island state as Replay', () => {
    class ManualClock implements SemanticGrowthAnimationClock {
      private nextId = 1;
      private callbacks = new Map<number, (timestamp: number) => void>();

      requestFrame(callback: (timestamp: number) => void): number {
        const id = this.nextId++;
        this.callbacks.set(id, callback);
        return id;
      }

      cancelFrame(requestId: number): void {
        this.callbacks.delete(requestId);
      }

      step(timestamp: number): void {
        const pending = [...this.callbacks.values()];
        this.callbacks.clear();
        act(() => pending.forEach((callback) => callback(timestamp)));
      }
    }

    const matureScene = islandScene();
    const emptyScene = withoutPrimaryLand(matureScene);
    const ordered = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;
    const frames: readonly SemanticGrowthFrame[] = ordered.map((key, index) => ({
      key,
      model: normalizeWorldPresentationModel({ scene: index === 0 ? emptyScene : matureScene }),
    }));
    const clock = new ManualClock();
    const organicPoseGrowth = {
      registry: CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY,
      instances: [
        {
          trackId: 'chapter2-hero-tree-pose-track-v1',
          worldAnchor: { x: 15, y: 12 },
          scale: 0.34,
          progressWindow: { start: 0.18, end: 1 },
        },
        {
          trackId: 'chapter2-plant-sample-pose-track-v1',
          worldAnchor: { x: 22, y: 18 },
          scale: 0.3,
          progressWindow: { start: 0.52, end: 1 },
        },
      ],
      nativeIsland: {
        storyId: STORY_ID,
        worldAnchor: { x: 15, y: 15 },
        radius: { x: 20, y: 18 },
        settledAtProgress: 0.18,
      },
      clock,
    } as const;
    const view = render(
      <SemanticGrowthWorldView
        frames={frames}
        organicPoseGrowth={organicPoseGrowth}
        svgIslandAccretion={{
          storyId: STORY_ID,
          worldAnchor: { x: 15, y: 15 },
          growthDurationMs: 1_600,
        }}
      />,
    );
    const section = view.container.querySelector('section')!;

    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    clock.step(0);
    clock.step(520);
    expect(Number(section.getAttribute('data-svg-island-accretion-progress'))).toBeLessThan(1);
    expect(view.container.querySelector('[data-island-accretion-cell]')).toBeTruthy();
    clock.step(1_600);
    expect(section.getAttribute('data-svg-island-accretion-progress')).toBe('1.0000');
    expect(view.container.querySelector('[data-island-accretion-cell]')).toBeNull();

    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    const backed = [
      section.getAttribute('data-semantic-growth-frame'),
      section.getAttribute('data-svg-island-accretion-progress'),
      view.container.querySelector('[data-island-accretion-cell]')?.outerHTML ?? null,
    ];
    expect(backed).toEqual(['empty', '0.0000', null]);

    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    clock.step(20_000);
    clock.step(30_000);
    fireEvent.click(view.getByRole('button', { name: 'Replay' }));
    expect([
      section.getAttribute('data-semantic-growth-frame'),
      section.getAttribute('data-svg-island-accretion-progress'),
      view.container.querySelector('[data-island-accretion-cell]')?.outerHTML ?? null,
    ]).toEqual(backed);
  });

  it('keeps the accretion runtime deterministic, SVG-only, and free of PixelLab/network/opacity animation authority', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'svg-island-accretion.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/Math\.random|Date\.|setTimeout|setInterval|requestAnimationFrame/);
    expect(source).not.toMatch(/\b(fetch|WebSocket|EventSource)\s*\(|https?:\/\//i);
    expect(source).not.toMatch(/pixellab|credential|api[_-]?key|canvas|video|gif/i);
    expect(source).not.toMatch(/opacity|<image|createElement\(['"]image/i);
  });
});
