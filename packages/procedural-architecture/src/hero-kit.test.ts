// hero-kit.test.ts — the hero roster's contract: a shared sun, a committed bake that cannot
// silently go stale, and the placement contract the composition (inc 11) reads.
//
// The staleness gate mirrors kit.test.ts: `baked/kit.json`'s `heroes` array is generated but
// committed, so someone tunes the cottage, the gate stays green, and the island keeps drawing
// last week's cottage. Re-baking and comparing here turns that into a failing test with an
// obvious fix (`pnpm --filter @storytree/procedural-architecture bake`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HERO_KIT, bakeHeroKit } from './hero-kit.js';
import { KIT_LIGHT_ANGLE } from './kit.js';
import type { BakedNode } from './bake.js';

const here = dirname(fileURLToPath(import.meta.url));
const assetPath = resolve(here, '..', 'baked', 'kit.json');

interface Asset {
  note: string;
  entries: unknown[];
  heroes: { id: string; label: string; name: string; nodes: BakedNode[]; width: number; height: number; minX: number; minY: number }[];
}

const readAsset = (): Asset => JSON.parse(readFileSync(assetPath, 'utf8')) as Asset;

// ---------------------------------------------------------------------------
// the shared sun
// ---------------------------------------------------------------------------

test('every hero is lit from the island sun', () => {
  for (const e of HERO_KIT) {
    assert.equal(e.model().lightAngle, KIT_LIGHT_ANGLE, `${e.id} is lit from ${e.model().lightAngle}°, not the island's ${KIT_LIGHT_ANGLE}°`);
  }
});

test('the hero roster has distinct, stable ids', () => {
  const ids = HERO_KIT.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  // Inc 11 references these by name; a rename is a breaking change worth catching here.
  assert.deepEqual(ids, ['cottage', 'gazebo', 'autumn-tree', 'stepping-stone', 'forest-hut']);
});

// ---------------------------------------------------------------------------
// the staleness gate
// ---------------------------------------------------------------------------

test('the committed hero bake matches a fresh one', () => {
  const asset = readAsset();
  const fresh = bakeHeroKit();
  assert.ok(Array.isArray(asset.heroes), 'kit.json carries a `heroes` array — run `pnpm --filter @storytree/procedural-architecture bake`');
  assert.equal(asset.heroes.length, fresh.length, 'the hero roster changed without a re-bake — run `pnpm --filter @storytree/procedural-architecture bake`');
  for (const [i, f] of fresh.entries()) {
    const committed = asset.heroes[i];
    assert.ok(committed, `no committed bake for ${f.id}`);
    assert.equal(committed.id, f.id);
    assert.deepEqual(
      committed.nodes,
      f.nodes,
      `${f.id} has drifted from its committed bake — run \`pnpm --filter @storytree/procedural-architecture bake\``,
    );
    assert.equal(committed.width, f.width, `${f.id}: committed width is stale`);
    assert.equal(committed.height, f.height, `${f.id}: committed height is stale`);
  }
});

test('the committed heroes carry no world-space receipt', () => {
  for (const e of readAsset().heroes) {
    assert.ok(!('polys' in e), `${e.id} shipped its world-space polys`);
  }
});

test('every hero stands on the origin and reports a usable box', () => {
  for (const e of readAsset().heroes) {
    assert.ok(e.height > 0 && e.width > 0, `${e.id} has an empty box`);
    assert.ok(e.nodes.length > 0, `${e.id} baked to nothing`);
    assert.ok(Math.abs(e.minX + e.width / 2) < 0.01, `${e.id} is not centred on x=0`);
    assert.ok(Math.abs(e.minY + e.height) < 0.01, `${e.id} does not stand on y=0`);
  }
});
