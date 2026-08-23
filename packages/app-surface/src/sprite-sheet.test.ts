// Stage-1 red-green of the sprite art-sheet manifest contract (sprite-art-sheets spike): key
// precedence + null fallback (`resolveSprite`), throw-on-malformed validation (`parseStyleSheet`), and
// the ground-pivot offset math (`spritePlacement`). Pure data-in/data-out — no DOM, no React; the
// studio mapper's INTEGRATION (does a covered node actually render an `<image>` with no child
// recursion?) is pinned in `SceneView.test.tsx`.

import { describe, test, expect } from 'vitest';

import { resolveSprite, parseStyleSheet, spritePlacement, type SpriteStyleSheet } from './sprite-sheet.js';

function mkSheet(): SpriteStyleSheet {
  return {
    name: 'test-sheet',
    label: 'Stub A',
    sprites: {
      tree: { href: '/art-sheets/test-sheet/tree.svg', w: 40, h: 70, anchorX: 0.5, anchorY: 1 },
      'tree:unhealthy': { href: '/art-sheets/test-sheet/tree-unhealthy.svg', w: 40, h: 70, anchorX: 0.5, anchorY: 1 },
      conifer: { href: '/art-sheets/test-sheet/conifer.svg', w: 24, h: 34, anchorX: 0.5, anchorY: 1, scale: 2 },
    },
  };
}

describe('sprite-sheet', () => {
  test('resolveSprite — exact `${kind}:${status}` wins over the kind-only fallback', () => {
    const sheet = mkSheet();
    const hit = resolveSprite(sheet, 'tree', 'unhealthy');
    expect(hit?.href).toBe('/art-sheets/test-sheet/tree-unhealthy.svg');
  });

  test('resolveSprite — falls back to the kind-only entry when no exact status match exists', () => {
    const sheet = mkSheet();
    const hit = resolveSprite(sheet, 'tree', 'healthy');
    expect(hit?.href).toBe('/art-sheets/test-sheet/tree.svg');
  });

  test('resolveSprite — a kind with no status arg still resolves the kind-only entry', () => {
    const sheet = mkSheet();
    const hit = resolveSprite(sheet, 'conifer');
    expect(hit?.href).toBe('/art-sheets/test-sheet/conifer.svg');
  });

  test('resolveSprite — returns null when neither the exact nor the kind-only key is covered', () => {
    const sheet = mkSheet();
    expect(resolveSprite(sheet, 'flora', 'healthy')).toBe(null);
    expect(resolveSprite(sheet, 'totally-unknown-kind')).toBe(null);
  });

  test('resolveSprite — an uncovered STATUS on a covered kind still falls back to the kind-only entry', () => {
    const sheet = mkSheet();
    // `tree:proposed` is not authored; must fall back to the bare `tree` entry, not null.
    const hit = resolveSprite(sheet, 'tree', 'proposed');
    expect(hit?.href).toBe('/art-sheets/test-sheet/tree.svg');
  });

  test('spritePlacement — anchor (0.5, 1) (bottom-centre) seats the ground pivot at local (0,0)', () => {
    const place = spritePlacement({ href: 'x', w: 40, h: 70, anchorX: 0.5, anchorY: 1 });
    expect(place).toEqual({ x: -20, y: -70, width: 40, height: 70 });
  });

  test('spritePlacement — anchor (0, 0) (top-left) needs no offset', () => {
    const place = spritePlacement({ href: 'x', w: 40, h: 70, anchorX: 0, anchorY: 0 });
    expect(place).toEqual({ x: 0, y: 0, width: 40, height: 70 });
  });

  test('spritePlacement — anchor (1, 1) (bottom-right) offsets by the full box', () => {
    const place = spritePlacement({ href: 'x', w: 40, h: 70, anchorX: 1, anchorY: 1 });
    expect(place).toEqual({ x: -40, y: -70, width: 40, height: 70 });
  });

  test('spritePlacement — `scale` scales the box BEFORE the pivot offset is computed', () => {
    const place = spritePlacement({ href: 'x', w: 24, h: 34, anchorX: 0.5, anchorY: 1, scale: 2 });
    expect(place).toEqual({ x: -24, y: -68, width: 48, height: 68 });
  });

  test('parseStyleSheet — accepts a valid manifest and preserves every sprite', () => {
    const parsed = parseStyleSheet({
      name: 'test-sheet',
      label: 'Stub A',
      sprites: {
        tree: { href: '/x/tree.svg', w: 10, h: 20, anchorX: 0.5, anchorY: 1 },
      },
    });
    expect(parsed.name).toBe('test-sheet');
    expect(parsed.label).toBe('Stub A');
    expect(parsed.sprites.tree).toEqual({ href: '/x/tree.svg', w: 10, h: 20, anchorX: 0.5, anchorY: 1 });
  });

  test('parseStyleSheet — round-trips a sprite carrying an optional `scale`', () => {
    const parsed = parseStyleSheet({
      name: 'test-sheet',
      label: 'Stub A',
      sprites: { conifer: { href: '/x/conifer.svg', w: 10, h: 20, anchorX: 0.5, anchorY: 1, scale: 1.5 } },
    });
    expect(parsed.sprites.conifer?.scale).toBe(1.5);
  });

  test('parseStyleSheet — throws on a non-object manifest', () => {
    expect(() => parseStyleSheet(null)).toThrow();
    expect(() => parseStyleSheet('nope')).toThrow();
    expect(() => parseStyleSheet(42)).toThrow();
    expect(() => parseStyleSheet(['not', 'an', 'object'])).toThrow();
  });

  test('parseStyleSheet — throws when "name" / "label" / "sprites" are missing or the wrong shape', () => {
    expect(() => parseStyleSheet({ label: 'Stub A', sprites: {} })).toThrow(/"name"/);
    expect(() => parseStyleSheet({ name: 'test-sheet', sprites: {} })).toThrow(/"label"/);
    expect(() => parseStyleSheet({ name: 'test-sheet', label: 'Stub A' })).toThrow(/"sprites"/);
    expect(() => parseStyleSheet({ name: '', label: 'Stub A', sprites: {} })).toThrow();
    expect(() => parseStyleSheet({ name: 'test-sheet', label: 'Stub A', sprites: 'nope' })).toThrow();
  });

  test('parseStyleSheet — throws on a malformed sprite def (missing/invalid fields)', () => {
    const bad = (sprite: unknown) => ({ name: 'test-sheet', label: 'Stub A', sprites: { tree: sprite } });
    expect(() => parseStyleSheet(bad({}))).toThrow(/"href"/); // missing href
    expect(() => parseStyleSheet(bad({ href: '' }))).toThrow(/"href"/); // empty href
    expect(() => parseStyleSheet(bad({ href: '/x.svg', w: 0, h: 10, anchorX: 0, anchorY: 0 }))).toThrow(/"w"/); // w<=0
    expect(() => parseStyleSheet(bad({ href: '/x.svg', w: 10, h: -1, anchorX: 0, anchorY: 0 }))).toThrow(/"h"/); // h<=0
    expect(() =>
      parseStyleSheet(bad({ href: '/x.svg', w: 10, h: 10, anchorX: 'mid', anchorY: 0 })),
    ).toThrow(/"anchorX"/); // non-numeric anchor
    expect(() =>
      parseStyleSheet(bad({ href: '/x.svg', w: 10, h: 10, anchorX: 0, anchorY: 0, scale: 0 })),
    ).toThrow(/"scale"/); // scale<=0
    expect(() => parseStyleSheet(bad('not-an-object'))).toThrow();
  });
});
