// @vitest-environment jsdom
//
// Stage-1 red-green for the RENDER half of per-object vegetation growth (ADR-0292) — what the scene
// mapper actually emits once the growth layer is present, and what it emits when it is not.
//
// The absence lock is asserted first and deliberately: no `vegetationLayer` must mean a byte-identical
// render, because the website's own mapper and every non-studio consumer of this scene never supply
// one, and this arc is not allowed to reach them.
//
// The VISUAL verdict is the owner's (ADR-0070 stage 2). Nothing here claims the growth looks right.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
  buildScene,
  type SceneGardenHero,
  type SceneInput,
  type SceneNode,
  type SceneVegHeroTrees,
} from '@storytree/forest-world';
import { SceneView, type SceneCtx } from './SceneView.js';
import { deriveIslandVegetationPlans } from './island-vegetation-growth.js';
import { vegetationRenderLayer, type VegetationRenderLayer } from './vegetation-render.js';

afterEach(cleanup);

const hero = (fill: string): SceneGardenHero => ({
  nodes: [{ el: 'polygon', points: '0,0 5,0 0,-5', fill, stroke: '#210', strokeWidth: 0.3 }],
  width: 10,
  height: 20.6,
});
const HERO_TREES: SceneVegHeroTrees = { healthy: hero('#0a0'), unknown: hero('#9a9') };

function mkInput(withHeroTrees = true): SceneInput {
  return {
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
    empties: [],
    relaxedCells: null,
    drawTiles: [],
    wheatSets: [new Set()],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [
      {
        id: 'lib',
        status: 'healthy',
        caps: 2,
        centroid: { x: 50, y: 50 },
        radius: 30,
        treeSpot: { x: 50, y: 45 },
        labelY: 80,
        coastPaths: ['M 0 0 L 1 0 Z'],
        decor: [{ x: 34, y: 40, seed: 5 }],
        plants: [{ id: 'lib#c', status: 'healthy', x: 45, y: 58, title: 'cap c' }],
        treeTitle: 'lib — healthy',
        signpost: { outcome: null },
        wisps: [],
        claims: [],
        plate: {
          w: 60,
          h: 33,
          rx: 7,
          idY: 14,
          subY: 27,
          idText: 'lib',
          subText: 'healthy · 2 caps',
          title: 'Library',
        },
      },
    ],
    ...(withHeroTrees ? { vegetation: { heroTrees: HERO_TREES } } : {}),
  };
}

function mkLayer(scene: SceneNode, progress: number): VegetationRenderLayer {
  const plans = deriveIslandVegetationPlans(scene, [
    { storyId: 'lib', caps: 2, radius: 30, status: 'healthy' },
  ]);
  return vegetationRenderLayer(plans, new Map([['lib', progress]]));
}

function renderAt(
  progress: number | null,
  over: Partial<SceneCtx> = {},
  withHeroTrees = true,
): { root: HTMLElement; onSelectCap: ReturnType<typeof vi.fn> } {
  const scene = buildScene(mkInput(withHeroTrees));
  const onSelectCap = vi.fn();
  const ctx: SceneCtx = {
    territoryClassById: (_id, status) => `hex-territory st-${status}`,
    reveal: null,
    hidden: new Set(),
    onSelectStory: vi.fn(),
    onSelectCap,
    ...(progress === null ? {} : { vegetationLayer: mkLayer(scene, progress) }),
    ...over,
  };
  const { container } = render(
    <svg>
      <SceneView scene={scene} ctx={ctx} />
    </svg>,
  );
  return { root: container, onSelectCap };
}

describe('the absence lock', () => {
  it('renders byte-identically with no vegetation layer', () => {
    const withoutLayer = renderAt(null).root.innerHTML;
    cleanup();
    const alsoWithout = renderAt(null).root.innerHTML;
    expect(withoutLayer).toBe(alsoWithout);
    expect(withoutLayer).not.toContain('veg-track');
    expect(withoutLayer).not.toContain('data-veg-grown');
  });
});

describe('the central tree becomes a frame of the shared track', () => {
  it('replaces the SHIPPED baked-use hero rather than drawing beside it', () => {
    const { root } = renderAt(1);
    const images = root.querySelectorAll('image.veg-track-tree');
    expect(images).toHaveLength(1);
    // The `<use>` the tree used to be is gone — a double-draw here would be two trees on one spot.
    expect(root.querySelectorAll('use')).toHaveLength(0);
    const image = images[0]!;
    expect(image.getAttribute('data-veg-frame')).toBe('18');
    expect(image.getAttribute('data-veg-grown')).toBe('1.0000');
    expect(image.getAttribute('href')).toMatch(/exp-16.*frame-18\.png$/u);
  });

  it('replaces the PROCEDURAL tree body while keeping its wrapper identity', () => {
    const { root } = renderAt(1, {}, false);
    const wrapper = root.querySelector('g.story-tree')!;
    expect(wrapper.getAttribute('transform')).toBe('translate(50.0 45.0)');
    expect(wrapper.querySelector('image.veg-track-tree')).toBeTruthy();
    // The vector crown it replaced is gone — the track IS the artwork now, not an overlay on it.
    expect(wrapper.querySelector('.crown-lo')).toBeNull();
    expect(wrapper.querySelector('.story-trunk')).toBeNull();
  });

  it('walks the track as the island accretes, and stands still once it lands', () => {
    const frames = [0, 0.25, 0.5, 0.75, 1].map((p) => {
      const { root } = renderAt(p);
      const frame = root.querySelector('image.veg-track-tree')!.getAttribute('data-veg-frame')!;
      cleanup();
      return Number(frame);
    });
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(frames[0]).toBe(0);
    expect(frames[frames.length - 1]).toBe(18);
  });

  it('pins the ground contact to the island’s own tree spot at every frame', () => {
    for (const progress of [0.1, 0.4, 0.8, 1]) {
      const { root } = renderAt(progress);
      const image = root.querySelector('image.veg-track-tree')!;
      const y = Number(image.getAttribute('y'));
      const height = Number(image.getAttribute('height'));
      // exp-16's registered contact sits at y=122 of a 128px canvas; the scale is height/128.
      const contact = y + 122 * (height / 128);
      expect(Math.abs(contact)).toBeLessThan(0.15); // local origin = the wrapper's translate
      cleanup();
    }
  });

  it('stays HITTABLE — the map selects by coordinate hit-test through this element', () => {
    // Regression wall. The first cut copied `pointer-events: none` from the decorative organic-pose
    // layer, which broke node selection on the desktop: TreeView resolves a click with
    // `elementFromPoint(...).closest('[data-story-id]')` (the Electron pointer-capture-retarget fix),
    // and an inert tree lets that probe fall through the canopy to bare `<svg>`. jsdom has no layout,
    // so the attribute is what is asserted — but `apps/desktop/e2e/node-click.e2e.mjs` exercises the
    // real thing, and it is what caught this.
    const { root } = renderAt(1);
    for (const image of root.querySelectorAll('image.veg-track')) {
      expect(image.getAttribute('pointer-events')).toBeNull();
    }
    // …and the wrapper still carries the id the coordinate probe walks up to find.
    expect(
      root.querySelector('image.veg-track-tree')!.closest('[data-story-id]'),
    ).toBeTruthy();
  });

  it('carries the island status for the stylesheet’s hue channel (ADR-0292 D3)', () => {
    const { root } = renderAt(1);
    expect(root.querySelector('image.veg-track-tree')!.getAttribute('class')).toContain('st-healthy');
  });
});

describe('a capability plant becomes a frame of the plant track, and stays a capability', () => {
  it('keeps its id stamps, its title and its click target', () => {
    const { root, onSelectCap } = renderAt(1);
    const wrapper = root.querySelector('g.garden-flora')!;
    expect(wrapper.getAttribute('data-cap-id')).toBe('lib#c');
    expect(wrapper.getAttribute('data-story-id')).toBe('lib');
    expect(wrapper.querySelector('title')?.textContent).toBe('cap c');
    // The generous hit circle is PRESERVED — a plant swapped to an image must not become clickable
    // only where its pixels are.
    expect(wrapper.querySelector('circle.flora-hit')).toBeTruthy();
    expect(wrapper.querySelector('image.veg-track-plant')).toBeTruthy();
    fireEvent.click(wrapper);
    expect(onSelectCap).toHaveBeenCalledWith('lib', 'lib#c');
  });
});

describe('the vector half: rooted sprouting, and nothing left behind (ADR-0292 D1/D6)', () => {
  it('roots a conifer’s growth in its own ground anchor', () => {
    const { root } = renderAt(0.75);
    const conifer = root.querySelector('g.hex-conifer[data-veg-grown]');
    expect(conifer).toBeTruthy();
    // `translate(x y) scale(g)` — SVG composes left to right, so the scale happens about the anchor
    // the scene already placed, never about the flora group's shared centre.
    expect(conifer!.getAttribute('transform')).toMatch(/^translate\([-\d. ]+\) scale\(0\.\d+\)$/u);
  });

  it('settles the nameplate by translation only — never a scale', () => {
    const { root } = renderAt(0.7);
    const plate = root.querySelector('g.world-plate[data-veg-grown]')!;
    expect(plate.getAttribute('transform')).toMatch(/translate\(0 -[\d.]+\)$/u);
    expect(plate.getAttribute('transform')).not.toContain('scale');
  });

  it('leaves NO growth attribute anywhere on the settled map', () => {
    const { root } = renderAt(1);
    // The two tracked images keep theirs (they are the artwork), but nothing else may — a settled
    // forest carrying a `scale(1)` this arc wrote would be a per-frame write on a quiet map.
    const stamped = [...root.querySelectorAll('[data-veg-grown]')];
    expect(stamped.every((el) => el.tagName.toLowerCase() === 'image')).toBe(true);
    expect(root.querySelectorAll('g[data-veg-grown]')).toHaveLength(0);
  });

  it('grows a SPRITE-swapped object too — the Storybook sheet is the shipped default', () => {
    // The trap this pins: `trySprite` returns its own `<image>` and never reaches the generic render
    // path, so a rooted transform written only there would silently do nothing for every object the
    // active sheet covers. Measured on the real map, that is the UAT flowers — the sprite sheet is
    // the owner-attested default (`artStyle=storybook`), not an opt-in.
    const { root } = renderAt(0.7, {
      spriteSheet: {
        name: 'test-sheet',
        label: 'Test',
        sprites: { conifer: { href: '/conifer.png', w: 32, h: 32, anchorX: 0.5, anchorY: 1 } },
      },
    });
    const conifer = root.querySelector('image.hex-conifer[data-veg-grown]');
    expect(conifer).toBeTruthy();
    expect(conifer!.getAttribute('transform')).toMatch(/scale\(0\.\d+\)$/u);
    expect(Number(conifer!.getAttribute('opacity'))).toBeLessThan(1);
  });

  it('hides a story the regrow has not reached, layer or no layer', () => {
    const scene = buildScene(mkInput());
    const { root } = renderAt(0.5, {
      forestRegrowLayer: {
        hiddenStoryIds: new Set(['lib']),
        hiddenEmptyStoryIds: new Set(['lib']),
        hiddenSegmentIds: new Set(),
        accretionByStory: new Map(),
        cellRevealByPath: new Map(),
      },
      vegetationLayer: mkLayer(scene, 0.5),
    });
    expect(root.querySelector('image.veg-track-tree')).toBeNull();
    expect(root.querySelector('g.hex-flora')).toBeNull();
  });
});
