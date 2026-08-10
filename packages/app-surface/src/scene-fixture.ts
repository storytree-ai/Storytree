// scene-fixture — the SHARED render-test fixture for the studio mapper, whose DEFAULT is the input
// set the SHIPPED STUDIO MAP actually sends (`render-fixtures-default-to-the-shipped-map`).
//
// This is the app-surface half of the inversion. `packages/forest-world/src/scene-fixture.ts` owns
// the SCENE-INPUT seam (`SceneInput` / `SceneTerritoryInput`); this module owns the RENDER-CTX seam
// (`SceneCtx`) plus the parcel fold a scene input built HERE needs. Deliberately per-package rather
// than one published fixture module: forest-world exports only `.` and a shared test fixture crossing
// that boundary would be a package-contract change, i.e. an ADR question the increment fences off.
//
// WHY THE CTX DEFAULT MATTERS. `SceneCtx.spriteSheet` is documented as a "default-off render mode",
// and that has been FALSE since 2026-07-23: `apps/studio/src/lib/worldSettings.ts` resolves an absent
// `artStyle` to the owner-attested `storybook` sheet, so the clean-URL map always has a sheet. A sheet
// is not a decoration on top of the render — `renderNode` consults `trySprite` BEFORE the generic
// path and returns its own `<image>`, so on the real map the central tree, the conifers, the
// capability plants and the UAT flowers never reach the vector branch at all. A ctx with no
// `spriteSheet` key therefore cannot see anything about how those objects actually draw, which is how
// a growth transform written only on the generic path shipped doing nothing for all 237 live UAT
// flowers.
//
// THE INVERSION. A fixture author gets the shipped map by writing NOTHING; the vector render — a
// first-class, permanently supported `artStyle`, so a legitimate thing to test — is reached only by
// NAMING it: {@link withoutSpriteSheet}. Same move as forest-world's {@link withoutParcels}.

import type { ScenePlantInput, SceneParcelInput, SceneTerritoryInput, SurfaceTheme } from '@storytree/forest-world';
import type { SpriteStyleSheet } from './sprite-sheet.js';
import type { SceneCtx } from './SceneView.js';

// ---------- the scene-input seam: the shipped map's parcel fold ----------

const PARCEL_THEMES: readonly SurfaceTheme[] = ['meadow', 'woodland', 'heath'];

/** ONE parcel per capability, seeded at that capability's own layout position and tinted by ITS
 *  status — mirroring the studio's `TreeView.capToParcel`. Derived from `plants` because that is the
 *  same array the studio derives both from, so a capless island stays parcels-ABSENT exactly as it
 *  does on the real map. */
export function shippedParcels(plants: readonly ScenePlantInput[]): SceneParcelInput[] {
  return plants.map((p, i) => ({
    capId: p.id,
    status: p.status,
    testCount: 4,
    theme: PARCEL_THEMES[i % PARCEL_THEMES.length]!,
    seed: { x: p.x, y: p.y },
  }));
}

/** A territory with the `parcels` the shipped map sends. `decor`/`plants` stay populated on purpose —
 *  the core RETIRES both for a parcels-present island, so keeping them proves the retirement instead
 *  of hiding behind empty arrays. */
export function shippedTerritory(t: SceneTerritoryInput): SceneTerritoryInput {
  const parcels = shippedParcels(t.plants);
  return parcels.length ? { ...t, parcels } : t;
}

/** Strip `parcels` — the NAMED way to ask for the public website's absence render. */
export function withoutParcels(t: SceneTerritoryInput): SceneTerritoryInput {
  const { parcels: _dropped, ...rest } = t;
  return rest;
}

// ---------- the render-ctx seam: the shipped map's sprite sheet ----------

const sprite = (href: string, w: number, h: number): SpriteStyleSheet['sprites'][string] => ({
  href,
  w,
  h,
  anchorX: 0.5,
  anchorY: 1,
});

/**
 * A sheet shaped like the shipped `storybook` manifest
 * (`apps/studio/public/art-sheets/storybook/manifest.json`, the owner-attested default since
 * 2026-07-23): the SAME covered key set, so a fixture sees exactly which drawables the real map
 * swaps out from under the generic render path. The hrefs are fixture-local — this is a stand-in for
 * the shipped sheet's COVERAGE, not a copy of its art, and app-surface cannot reach the studio's
 * static assets anyway (the dependency direction runs the other way).
 */
export function shippedSpriteSheet(): SpriteStyleSheet {
  return {
    name: 'shipped-fixture',
    label: 'Shipped-map stand-in (storybook coverage)',
    sprites: {
      'tree:healthy': sprite('/art-sheets/shipped-fixture/tree-healthy.png', 59, 70),
      'tree:unhealthy': sprite('/art-sheets/shipped-fixture/tree-unhealthy.png', 56, 70),
      'tree:proposed': sprite('/art-sheets/shipped-fixture/tree-proposed.png', 59, 70),
      'tree:mapped': sprite('/art-sheets/shipped-fixture/tree-mapped.png', 59, 70),
      'tree:unknown': sprite('/art-sheets/shipped-fixture/tree-unknown.png', 59, 70),
      'autumn-tree': sprite('/art-sheets/shipped-fixture/tree-healthy.png', 59, 70),
      'autumn-tree:healthy': sprite('/art-sheets/shipped-fixture/tree-healthy.png', 59, 70),
      'autumn-tree:unhealthy': sprite('/art-sheets/shipped-fixture/tree-unhealthy.png', 56, 70),
      'autumn-tree:proposed': sprite('/art-sheets/shipped-fixture/tree-proposed.png', 59, 70),
      'autumn-tree:mapped': sprite('/art-sheets/shipped-fixture/tree-mapped.png', 59, 70),
      'autumn-tree:unknown': sprite('/art-sheets/shipped-fixture/tree-unknown.png', 59, 70),
      conifer: sprite('/art-sheets/shipped-fixture/conifer.png', 28, 44),
      flora: sprite('/art-sheets/shipped-fixture/flora.png', 20, 24),
      'flora:unhealthy': sprite('/art-sheets/shipped-fixture/flora-unhealthy.png', 20, 24),
      'tall-flower-proven': sprite('/art-sheets/shipped-fixture/tall-flower-proven.png', 16, 34),
      'tall-flower-pending': sprite('/art-sheets/shipped-fixture/tall-flower-pending.png', 16, 34),
      'tall-flower-failing': sprite('/art-sheets/shipped-fixture/tall-flower-failing.png', 16, 34),
      cottage: sprite('/art-sheets/shipped-fixture/cottage.png', 64, 52),
      gazebo: sprite('/art-sheets/shipped-fixture/gazebo.png', 48, 46),
    },
  };
}

/**
 * A render ctx shaped like the SHIPPED MAP's: an `artStyle` sheet is present, because the clean-URL
 * studio always resolves one. Everything else is the minimum a mapper test needs; pass spies through
 * `over` where a test asserts on them.
 */
export function shippedCtx(over: Partial<SceneCtx> = {}): SceneCtx {
  return {
    territoryClassById: (id, status) => `hex-territory st-${status}`,
    reveal: null,
    hidden: new Set(),
    onSelectStory: () => {},
    onSelectCap: () => {},
    spriteSheet: shippedSpriteSheet(),
    ...over,
  };
}

/** Drop the sprite sheet — the NAMED way to ask for the procedural `vector` art style. Still a
 *  first-class, permanently supported render (it is a real `artStyle` option), just not the one the
 *  clean-URL map ships; a test that pins vector art now says so. */
export function withoutSpriteSheet(ctx: SceneCtx): SceneCtx {
  const { spriteSheet: _dropped, ...rest } = ctx;
  return rest;
}
