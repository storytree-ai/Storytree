// The kit's contract: a shared sun, and a committed asset that cannot go stale.
//
// The staleness gate is the important one. `baked/kit.json` is generated but committed,
// which is a shape that rots quietly — someone tunes a roof, the gate stays green, and the
// map keeps drawing last week's building. Re-baking and comparing here turns that into a
// failing test with an obvious fix (`pnpm --filter @storytree/procedural-architecture bake`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIT, KIT_LIGHT_ANGLE, bakeKit } from './kit.js';
import type { BakedNode } from './bake.js';

const here = dirname(fileURLToPath(import.meta.url));
const assetPath = resolve(here, '..', 'baked', 'kit.json');

interface Asset {
  note: string;
  entries: { id: string; label: string; name: string; nodes: BakedNode[]; width: number; height: number; minX: number; minY: number }[];
}

const readAsset = (): Asset => JSON.parse(readFileSync(assetPath, 'utf8')) as Asset;

// ---------------------------------------------------------------------------
// the shared sun
// ---------------------------------------------------------------------------

test('every building in the kit is lit from the same angle', () => {
  // The buildings disagree by default — the windmill and pagoda ship at 135, the mushroom
  // at 55 — and each default is right for a solo contact sheet. The roster is where that
  // becomes one decision, because two light directions on one island read as broken.
  for (const e of KIT) {
    assert.equal(
      e.model().lightAngle,
      KIT_LIGHT_ANGLE,
      `${e.id} is lit from ${e.model().lightAngle}°, not the island's ${KIT_LIGHT_ANGLE}°`,
    );
  }
});

test('the kit has distinct ids', () => {
  assert.equal(new Set(KIT.map((e) => e.id)).size, KIT.length);
});

// ---------------------------------------------------------------------------
// the staleness gate
// ---------------------------------------------------------------------------

test('the committed bake matches a fresh one', () => {
  const asset = readAsset();
  const fresh = bakeKit();

  assert.equal(
    asset.entries.length,
    fresh.length,
    'the roster changed without a re-bake — run `pnpm --filter @storytree/procedural-architecture bake`',
  );

  for (const [i, f] of fresh.entries()) {
    const committed = asset.entries[i];
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

test('the committed asset carries no world-space receipt', () => {
  // `polys` is a debugging aid an order test reaches for; shipping it to a surface would
  // multiply the asset several times over for data nothing paints.
  const asset = readAsset();
  for (const e of asset.entries) {
    assert.ok(!('polys' in e), `${e.id} shipped its world-space polys`);
  }
});

test('every baked entry stands on the origin and reports a usable box', () => {
  for (const e of readAsset().entries) {
    assert.ok(e.height > 0 && e.width > 0, `${e.id} has an empty box`);
    assert.ok(e.nodes.length > 0, `${e.id} baked to nothing`);
    // The placement contract, re-checked on the ASSET rather than on a fresh bake — this
    // is what the map actually reads.
    assert.ok(Math.abs(e.minX + e.width / 2) < 0.01, `${e.id} is not centred on x=0`);
    assert.ok(Math.abs(e.minY + e.height) < 0.01, `${e.id} does not stand on y=0`);
  }
});
