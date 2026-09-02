// shipped-skirt-scene.test.ts — THE SKIRT PAGE'S MATERIAL IS THE MAP'S MATERIAL, KEY FOR KEY.
//
// ⚠⚠ THE HAZARD THIS FILE EXISTS FOR — `comparison-baseline-moves-under-the-page`, met from the
// material side. The skirt page cannot call `buildGroundMaterial`, because its token table carries
// rows the map does not draw (the withdrawn rock, the ladder); so it composes the same options by
// hand and promises, in a comment, to mirror the canvas. PR #1802 landed layers 2, 3, 4 and 6 on the
// canvas while this page was being built on a branch cut before it — exactly the shape the memory
// records: every arm internally consistent, the whole page quietly comparing cliffs on a ground that
// no longer ships. A comment cannot fail. This file reads BOTH sources and does.
//
// It is a SOURCE property, like `shipped-grass-scene.test.ts`'s, and for the same reason: the two
// compositions live in two files, and the claim is about their text agreeing. The cost of building
// the occlusion field to compare two compiled shaders would make this a covering test for every
// mutant under `src/`, which §10 of `mutation-rung-scores-a-hang-as-unproven` measures as the thing
// that turns a green rung red in CI.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

/** The body of one top-level function, from its `export function NAME(` to the next line that is a
 *  bare `}` at column 0 — enough for a source property over a file this repo formats with prettier. */
function functionBody(text: string, name: string): string {
  const start = text.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} is not exported where this test expects it`);
  const end = text.indexOf('\n}\n', start);
  assert.ok(end > start, `${name} has no closing brace at column 0`);
  return text.slice(start, end);
}

/** Every material option a body sets — `opts.KEY =` assignments plus the keys of the one
 *  `BandedGroundMaterialOptions` literal it opens with. */
function materialKeys(body: string): Set<string> {
  const keys = new Set<string>();
  for (const m of body.matchAll(/\bopts\.(\w+)\s*=/g)) keys.add(m[1]!);
  const literal = /const opts: BandedGroundMaterialOptions = \{([\s\S]*?)\};/.exec(body);
  assert.ok(literal !== null, 'the body opens no BandedGroundMaterialOptions literal');
  // Keys, whether the literal is written on one line (the canvas) or one key per line (the page).
  for (const m of literal[1]!.matchAll(/\b(\w+)\s*:/g)) keys.add(m[1]!);
  return keys;
}

test('the skirt page sets EVERY material option the shipped canvas sets, and no other', () => {
  const canvas = functionBody(source('../src/ForestWorldCanvas.tsx'), 'buildGroundMaterial');
  const page = functionBody(source('shipped-skirt-scene.ts'), 'buildSkirtScene');
  const wanted = [...materialKeys(canvas)].sort();
  const got = [...materialKeys(page)].sort();
  // ⚠ The whole point is the ASYMMETRY of the failure: a layer the canvas grows and the page does
  // not is the stale-control hazard; a key the page invents is a comparison on a ground the map
  // does not wear. Both directions red, and the message names the key.
  assert.deepEqual(
    got,
    wanted,
    `the skirt page's material must mirror buildGroundMaterial key for key — canvas sets [${wanted.join(', ')}], page sets [${got.join(', ')}]`,
  );
  // And the set is not vacuous: the canvas wears the whole stack as of PR #1802.
  for (const key of ['grass', 'sand', 'wear', 'rock', 'detail', 'shadowAtlas']) {
    assert.ok(wanted.includes(key), `buildGroundMaterial no longer sets ${key}; re-read the stack before trusting this page`);
  }
});

test('the page reads the SHIPPED strength for every layer it mirrors, not a number of its own', () => {
  const page = functionBody(source('shipped-skirt-scene.ts'), 'buildSkirtScene');
  // The canvas's own names for the four strengths and the two carrier widths. A page that wrote
  // `0.65` where the canvas reads `SHIPPED_SAND_MIX` would be right today and wrong at the next
  // scale-back, silently.
  for (const name of [
    'SHIPPED_GRASS',
    'SHIPPED_SAND_MIX',
    'SHIPPED_LAYERS.wearMix',
    'SHIPPED_LAYERS.rock',
    'SHIPPED_LAYERS.detail.strength',
    'SAND_FIELD_WIDTH',
    'WEAR_FIELD_WIDTH',
    'DETAIL_TILE_UNITS',
  ]) {
    assert.ok(page.includes(name), `buildSkirtScene must read ${name} rather than a literal`);
  }
  assert.ok(!/mix:\s*0\.\d+/.test(page), 'a literal mix strength on the page would drift from the canvas silently');
});

test('the page hands the builder the crowd’s strips, so layer 3 has docks to join', () => {
  const page = source('shipped-skirt-scene.ts');
  assert.ok(
    /shippedGroundBuild\(crowdCells\(size\), crowdCasters\(size\), crowdStrips\(size\)\)/.test(page),
    'skirtGroundBuild must pass crowdStrips(size) — a build handed no strips wears a path nowhere',
  );
  // The carriers come from the build's own thunks, never from a field the page packed itself.
  assert.ok(/build\.shore\(\)/.test(page) && /build\.wear\(\)/.test(page), 'the sand and wear fields must be the build’s own');
  assert.ok(!/buildAtlasShore\(|buildAtlasWear\(/.test(page), 'the page must not pack its own carrier fields');
});
