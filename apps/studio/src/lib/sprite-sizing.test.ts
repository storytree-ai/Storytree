// sprite-sizing.test — the derived-sizing contract: a sprite inherits the size of the vector body it
// replaces (the "way too big" owner verdict, sprite-art-sheets arc). Pure math, no DOM.

import { describe, expect, test } from 'vitest';

import type { SceneBakedDef, SceneNode } from '@storytree/forest-world';
import type { SpriteDef } from './sprite-sheet.js';
import {
  bakedDefBounds,
  collectDefBounds,
  fitSpritePlacement,
  parseSimpleTransform,
  pathBounds,
  wrapperContentBounds,
} from './sprite-sizing.js';

const SPRITE: SpriteDef = { href: '/x.png', w: 40, h: 60, anchorX: 0.5, anchorY: 1 };

describe('parseSimpleTransform', () => {
  test('empty/absent is identity', () => {
    expect(parseSimpleTransform(undefined)).toEqual({ sx: 1, sy: 1, tx: 0, ty: 0 });
    expect(parseSimpleTransform('')).toEqual({ sx: 1, sy: 1, tx: 0, ty: 0 });
  });

  test('translate then scale composes left-to-right (scale is INSIDE the translate)', () => {
    // p' = translate(10,20) · scale(2) · p → sx 2, tx 10.
    expect(parseSimpleTransform('translate(10 20) scale(2)')).toEqual({ sx: 2, sy: 2, tx: 10, ty: 20 });
    // scale first: the later translate is scaled — tx = 3·10.
    expect(parseSimpleTransform('scale(3) translate(10, 20)')).toEqual({ sx: 3, sy: 3, tx: 30, ty: 60 });
  });

  test('single-arg translate implies y=0; two-arg scale is anisotropic', () => {
    expect(parseSimpleTransform('translate(7)')).toEqual({ sx: 1, sy: 1, tx: 7, ty: 0 });
    expect(parseSimpleTransform('scale(2 3)')).toEqual({ sx: 2, sy: 3, tx: 0, ty: 0 });
  });

  test('rotate / matrix / garbage are unmeasurable (null), never mis-measured', () => {
    expect(parseSimpleTransform('rotate(45)')).toBeNull();
    expect(parseSimpleTransform('translate(1 2) rotate(45)')).toBeNull();
    expect(parseSimpleTransform('matrix(1 0 0 1 0 0)')).toBeNull();
    expect(parseSimpleTransform('translate(1 2) nonsense')).toBeNull();
  });
});

describe('pathBounds', () => {
  test('absolute M/L with Z', () => {
    expect(pathBounds('M 0 0 L 10 -20 L -5 4 Z')).toEqual({ minX: -5, minY: -20, maxX: 10, maxY: 4 });
  });

  test('relative commands track the cursor', () => {
    // m 5 5 → (5,5); l 10 0 → (15,5); v -8 → (15,-3); h -20 → (-5,-3).
    expect(pathBounds('m 5 5 l 10 0 v -8 h -20')).toEqual({ minX: -5, minY: -3, maxX: 15, maxY: 5 });
  });

  test('curve control points bound the curve (Q/C)', () => {
    const b = pathBounds('M 0 0 Q 5 -30 10 0');
    expect(b).toEqual({ minX: 0, minY: -30, maxX: 10, maxY: 0 });
  });

  test('implicit lineto pairs after M', () => {
    expect(pathBounds('M 0 0 10 5 20 -5')).toEqual({ minX: 0, minY: -5, maxX: 20, maxY: 5 });
  });

  test('arcs contribute endpoints only', () => {
    expect(pathBounds('M 0 0 A 5 5 0 0 1 10 0')).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 0 });
  });

  test('garbage is null', () => {
    expect(pathBounds('')).toBeNull();
    expect(pathBounds('L L L')).toBeNull();
  });
});

/** A tree-shaped wrapper: crown circle up top, shadow ellipse at the ground. */
function treeWrapper(extraChildren: SceneNode[] = []): SceneNode {
  return {
    el: 'g',
    kind: 'tree',
    status: 'healthy',
    transform: 'translate(100 200)',
    children: [
      { el: 'ellipse', kind: 'shadow', cx: 0, cy: 0, rx: 8, ry: 3 },
      { el: 'circle', kind: 'crown-hi', cx: 0, cy: -50, r: 10 },
      ...extraChildren,
    ],
  };
}

describe('wrapperContentBounds', () => {
  test('measures the union of a wrapper’s children in LOCAL space (wrapper transform NOT applied)', () => {
    expect(wrapperContentBounds(treeWrapper())).toEqual({ minX: -10, minY: -60, maxX: 10, maxY: 3 });
  });

  test('a child g’s own translate/scale folds into the measurement', () => {
    const node: SceneNode = {
      el: 'g',
      kind: 'flora',
      children: [
        {
          el: 'g',
          transform: 'translate(0 -10) scale(2)',
          children: [{ el: 'circle', cx: 0, cy: 0, r: 5 }],
        },
      ],
    };
    // circle ±5 scaled ×2 → ±10, translated -10 in y → y ∈ [-20, 0].
    expect(wrapperContentBounds(node)).toEqual({ minX: -10, minY: -20, maxX: 10, maxY: 0 });
  });

  test('hit targets and companion marks (bloom/signpost) are NOT part of the visual mass', () => {
    const withCompanions = treeWrapper([
      { el: 'circle', kind: 'flora-hit', cx: 0, cy: 0, r: 40 },
      { el: 'g', kind: 'bloom-anchor', transform: 'translate(0 -80)', children: [{ el: 'circle', cx: 0, cy: 0, r: 6 }] },
      { el: 'g', kind: 'sign-pass', transform: 'translate(30 0)', children: [{ el: 'rect', x: 0, y: -14, width: 3, height: 14, rx: 0 }] },
    ]);
    expect(wrapperContentBounds(withCompanions)).toEqual({ minX: -10, minY: -60, maxX: 10, maxY: 3 });
  });

  test('an unmeasurable child (rotate) is skipped, not mis-measured', () => {
    const node: SceneNode = {
      el: 'g',
      kind: 'conifer',
      children: [
        { el: 'polygon', kind: 'conifer-body', points: '0,-30 8,0 -8,0' },
        { el: 'circle', transform: 'rotate(45)', cx: 0, cy: -90, r: 1 },
      ],
    };
    expect(wrapperContentBounds(node)).toEqual({ minX: -8, minY: -30, maxX: 8, maxY: 0 });
  });

  test('a baked-use wrapper resolves through the def-bounds map; unknown def is null', () => {
    const defs = new Map([['veg-hero-autumn-tree-healthy', { minX: -12, minY: -40, maxX: 12, maxY: 2 }]]);
    const use: SceneNode = { el: 'baked-use', kind: 'baked-art', defId: 'veg-hero-autumn-tree-healthy' };
    expect(wrapperContentBounds(use, defs)).toEqual({ minX: -12, minY: -40, maxX: 12, maxY: 2 });
    expect(wrapperContentBounds({ el: 'baked-use', kind: 'baked-art', defId: 'nope' }, defs)).toBeNull();
  });
});

describe('bakedDefBounds / collectDefBounds', () => {
  const def: SceneBakedDef = {
    el: 'baked-def',
    defId: 'garden-hero-cottage',
    nodes: [
      { el: 'polygon', points: '-10,0 10,0 0,-25', fill: '#9c7b53', stroke: '#6a563c', strokeWidth: 1 },
      { el: 'ellipse', cx: 0, cy: 1, rx: 12, ry: 3, fill: '#00000022' },
    ],
  };

  test('a def measures the union of its paint nodes', () => {
    expect(bakedDefBounds(def)).toEqual({ minX: -12, minY: -25, maxX: 12, maxY: 4 });
  });

  test('collectDefBounds walks the scene and keys by defId', () => {
    const scene: SceneNode = {
      el: 'g',
      kind: 'world',
      children: [{ el: 'g', kind: 'baked-defs', children: [def] }],
    };
    const map = collectDefBounds(scene);
    expect(map.get('garden-hero-cottage')).toEqual({ minX: -12, minY: -25, maxX: 12, maxY: 4 });
  });
});

describe('fitSpritePlacement', () => {
  const CONTENT = { minX: -10, minY: -60, maxX: 10, maxY: 3 }; // height 63, centred on x=0

  test('fits height to the content box, preserves aspect, bottom-aligns and centres', () => {
    const p = fitSpritePlacement(SPRITE, CONTENT, 1);
    expect(p.height).toBeCloseTo(63);
    expect(p.width).toBeCloseTo(42); // 63 × 40/60
    expect(p.x).toBeCloseTo(-21); // centred on content centerX 0
    expect(p.y).toBeCloseTo(-60); // bottom edge at maxY 3 → y = 3 − 63
  });

  test('artScale multiplies the fitted size around the same ground line', () => {
    const p = fitSpritePlacement(SPRITE, CONTENT, 2);
    expect(p.height).toBeCloseTo(126);
    expect(p.width).toBeCloseTo(84);
    expect(p.y).toBeCloseTo(3 - 126); // still grounded at maxY
  });

  test('def.scale is a per-asset fudge on top of the fit', () => {
    const p = fitSpritePlacement({ ...SPRITE, scale: 0.5 }, CONTENT, 1);
    expect(p.height).toBeCloseTo(31.5);
  });

  test('no measurable content → native manifest box seated by its own anchor (× artScale)', () => {
    const p = fitSpritePlacement(SPRITE, null, 1);
    expect(p).toEqual({ x: -20, y: -60, width: 40, height: 60 });
    const scaled = fitSpritePlacement(SPRITE, null, 0.5);
    expect(scaled).toEqual({ x: -10, y: -30, width: 20, height: 30 });
  });

  test('a degenerate (flat) content box falls back to native, never a zero-height sprite', () => {
    const p = fitSpritePlacement(SPRITE, { minX: 0, minY: 0, maxX: 0, maxY: 0 }, 1);
    expect(p).toEqual({ x: -20, y: -60, width: 40, height: 60 });
  });
});
