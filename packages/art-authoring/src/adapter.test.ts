// adapter.test.ts — contracts bsa-adapter-fans-to-swappable-vendors (1) and
// bsa-author-selects-one-maquette-rest-discarded (2). Offline, isolated, no credential.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BlockingSubstrateAdapter } from './adapter.js';
import { fixtureBackend } from './fixture-backend.js';

test('bsa-adapter-fans-to-swappable-vendors — fans one request to N backends, one candidate each, stable order', async () => {
  const adapter = new BlockingSubstrateAdapter()
    .register(fixtureBackend('alpha'))
    .register(fixtureBackend('beta'));
  assert.deepEqual([...adapter.backendIds], ['alpha', 'beta'], 'registration order is preserved');

  const candidates = await adapter.fan({ prompt: 'a cosy cottage' });
  assert.equal(candidates.length, 2, 'exactly one candidate per registered backend');
  assert.deepEqual(candidates.map((c) => c.backend), ['alpha', 'beta'], 'candidates come back in stable fan order');
  assert.ok(candidates.every((c) => c.prompt === 'a cosy cottage' && c.meshFormat === 'glb'));
});

test('bsa-adapter-fans-to-swappable-vendors — no backend is hard-coded: a THIRD vendor plugs in with no code change', async () => {
  const adapter = new BlockingSubstrateAdapter()
    .register(fixtureBackend('alpha'))
    .register(fixtureBackend('beta'));
  adapter.register(fixtureBackend('gamma'));
  const candidates = await adapter.fan({ prompt: 'x' });
  assert.deepEqual(candidates.map((c) => c.backend), ['alpha', 'beta', 'gamma']);
});

test('bsa-adapter-fans-to-swappable-vendors — fanning with no backends is a mis-wire, not a silent empty', async () => {
  await assert.rejects(() => new BlockingSubstrateAdapter().fan({ prompt: 'x' }), /no backends registered/);
});

test('a duplicate backend id is refused (a mis-wire, not a silent overwrite)', () => {
  const adapter = new BlockingSubstrateAdapter().register(fixtureBackend('dup'));
  assert.throws(() => adapter.register(fixtureBackend('dup')), /already registered/);
});

test('bsa-author-selects-one-maquette-rest-discarded — selection yields exactly one; the others are returned nowhere', async () => {
  const adapter = new BlockingSubstrateAdapter()
    .register(fixtureBackend('alpha'))
    .register(fixtureBackend('beta'))
    .register(fixtureBackend('gamma'));
  const candidates = await adapter.fan({ prompt: 'a gazebo' });

  const chosen = adapter.select(candidates, 'beta');
  assert.equal(chosen.backend, 'beta', 'the author-picked backend wins');

  // A different pick from the SAME set yields a different single maquette — proving the
  // adapter locked onto nothing and holds no candidate state (the maquette is thrown away).
  assert.equal(adapter.select(candidates, 'gamma').backend, 'gamma');
});

test('bsa-author-selects-one-maquette-rest-discarded — a pick matching zero or >1 candidates is refused', async () => {
  const adapter = new BlockingSubstrateAdapter().register(fixtureBackend('alpha')).register(fixtureBackend('beta'));
  const candidates = await adapter.fan({ prompt: 'y' });
  assert.throws(() => adapter.select(candidates, 'nope'), /exactly one maquette/);
  // an ambiguous set (two candidates from one backend) is also refused, never first-wins.
  const dupSet = [...candidates, { ...candidates[0]! }];
  assert.throws(() => adapter.select(dupSet, 'alpha'), /found 2 of 3/);
});
