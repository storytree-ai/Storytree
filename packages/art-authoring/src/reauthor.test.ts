// reauthor.test.ts — contract bsa-reauthor-handoff-governed-by-checker (3). The adapter's
// integration test against its REAL in-story collaborator: the @storytree/procedural-architecture
// factory checker. Offline, isolated, no credential.

import test from 'node:test';
import assert from 'node:assert/strict';
import { building, box, gable, bakeBuilding } from '@storytree/procedural-architecture';
import { BlockingSubstrateAdapter } from './adapter.js';
import { fixtureBackend } from './fixture-backend.js';
import { governReauthored, isSound, assertReauthoredSound } from './reauthor.js';

/** A sound cottage an author would re-author against a produced maquette. */
function soundCottage() {
  const b = building({ name: 're-authored cottage', style: 'timber' });
  b.add('walls', box({ w: 14, d: 12, h: 9 }), { ground: true });
  b.add('roof', gable({ w: 14, d: 12, h: 5 }), { on: 'walls' });
  b.aperture('door', { host: 'walls', facet: 0, cu: 0, sill: 0, w: 3, h: 5, kind: 'door' });
  return b.model();
}

/** The same cottage with its roof slid off the wall — a physics fault the real checker catches. */
function slidRoofCottage() {
  const b = building({ name: 'unsound re-author' });
  b.add('walls', box({ w: 14, d: 12, h: 9 }), { ground: true });
  b.add('roof', gable({ w: 14, d: 12, h: 5 }), { on: 'walls', at: { dx: 12, dy: 0 } });
  return b.model();
}

test('bsa-reauthor-handoff-governed-by-checker — a sound re-authored asset passes the REAL factory checker', async () => {
  const adapter = new BlockingSubstrateAdapter().register(fixtureBackend('nvidia-trellis'));
  const maquette = adapter.select(await adapter.fan({ prompt: 'a cosy cottage' }), 'nvidia-trellis');

  // the author re-authors a checkable vector BY HAND against the maquette (no auto-trace)
  const asset = { model: soundCottage(), authoredAgainst: maquette.meshRef };

  assert.deepEqual(governReauthored(asset), [], 'the real checker governs and finds it sound');
  assert.equal(isSound(asset), true);
  assert.doesNotThrow(() => assertReauthoredSound(asset));
});

test('bsa-reauthor-handoff-governed-by-checker — a perturbed re-authored asset is REFUSED by the checker (a block earns nothing until it passes)', () => {
  const asset = { model: slidRoofCottage() };
  const violations = governReauthored(asset);
  assert.ok(violations.some((v) => v.rule === 'support-overlap' && v.part === 'roof'), JSON.stringify(violations));
  assert.equal(isSound(asset), false);
  assert.throws(() => assertReauthoredSound(asset), /physics violation/);
});

test('bsa-reauthor-handoff-governed-by-checker — the maquette never enters the bake (thrown-away / no-inline)', async () => {
  const adapter = new BlockingSubstrateAdapter().register(fixtureBackend('nvidia-trellis'));
  const maquette = adapter.select(await adapter.fan({ prompt: 'a cosy cottage' }), 'nvidia-trellis');
  const asset = { model: soundCottage(), authoredAgainst: maquette.meshRef };

  // only the re-authored vector is baked; the maquette handle appears nowhere in the drawables.
  const baked = bakeBuilding(asset.model);
  const serialized = JSON.stringify(baked);
  assert.equal(serialized.includes(maquette.meshRef), false, 'the maquette handle is absent from the bake');
  assert.equal(serialized.includes('fixture://'), false, 'no maquette reference reaches the baked drawables');
  assert.ok(baked.nodes.length > 0, 'the re-authored vector did bake to real drawables');
});
