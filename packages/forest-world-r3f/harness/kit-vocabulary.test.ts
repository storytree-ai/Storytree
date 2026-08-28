import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { islandScene, islandCapabilities } from './island-fixture.js';
import { groundCellsFrom } from './island-descriptors.js';
import { layoutCells } from './prop-layout.js';
import {
  KIT_ASSEMBLIES,
  KIT_ROLE_ASSEMBLIES,
  KIT_ROLE_SIGNAL,
  KIT_ROLE_SIZE,
  capabilityFacts,
  clearsObjectFloor,
  contractRole,
  deliveredRolePx,
  dressIslandFromKit,
  kitObjectNames,
} from './kit-vocabulary.js';
import type { KitRole } from './kit-vocabulary.js';

const ASSET = fileURLToPath(new URL('./assets/dressing-kit.glb', import.meta.url));
const ROLES: readonly KitRole[] = ['tree', 'deadTree', 'undergrowth', 'rock', 'log', 'bloom'];

/**
 * The OBJECT names inside a `.glb`, read out of its JSON chunk. A glb is a 12-byte header and a
 * length-prefixed JSON chunk, so this needs no loader and no browser.
 *
 * ⚠ NODES, NOT MESHES, and the difference is not cosmetic. Blender exports a node per OBJECT and
 * names the mesh after the MESH DATA — so `Leafy_Bush_01` arrives as a node named for the object
 * and a mesh named `Plane.054`. `GLTFLoader` sets `Object3D.name` from the node, which is what
 * `kit-scene.ts` keys the vocabulary on, so reading meshes here would be checking the manifest
 * against a different set of names than the loader ever sees.
 */
function glbObjectNames(path: string): string[] {
  const buf = readFileSync(path);
  assert.equal(buf.toString('utf8', 0, 4), 'glTF', `${path} is not a glb`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength)) as {
    nodes?: Array<{ name?: string; mesh?: number }>;
  };
  return (json.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? '').filter(Boolean);
}

// ------------------------------------------------------------------ the vocabulary itself

test('every role names a signal, and every signal names where it is read from', () => {
  // ADR-0463 D5: delegation picks WHICH signal a prop carries, never WHETHER it carries one.
  // A role whose entry did not say where its number comes from would be decoration wearing a
  // signal's name, which ADR-0414 D1 forbids on the surface this vocabulary is authored for.
  for (const role of ROLES) {
    const signal = KIT_ROLE_SIGNAL[role];
    assert.ok(signal.length > 20, `${role} has no signal`);
    assert.match(signal, /^(SCENE|INPUT) — /, `${role}'s signal does not say where it is read from`);
  }
});

test('every role names at least one assembly, and every assembly at least one kit object', () => {
  for (const role of ROLES) {
    const assemblies = KIT_ROLE_ASSEMBLIES[role];
    assert.ok(assemblies.length > 0, `${role} has no assembly to draw`);
    for (const assembly of assemblies) {
      assert.ok(KIT_ASSEMBLIES[assembly].length > 0, `${assembly} names no kit object`);
    }
  }
});

test('THE ASSET CARRIES EVERY OBJECT THE VOCABULARY DECLARES', () => {
  // ⚠ The floor that stops a quietly emptier island. Every count and placement is per assembly
  // FOUND, so an asset that lost an object would draw fewer props and nothing else would say
  // so. The manifest is hand-authored upstream of the export, so this is a two-place mismatch.
  const inAsset = new Set(glbObjectNames(ASSET));
  const missing = kitObjectNames().filter((n) => !inAsset.has(n));
  assert.deepEqual(missing, [], `the committed kit is missing: ${missing.join(', ')}`);
});

test('the asset carries nothing the vocabulary does not use — a paid-for byte draws something', () => {
  // The payload scales with DISTINCT objects, not with how many are placed, so an object nobody
  // places is pure wire cost. This is the direction the manifest check above cannot see.
  const declared = new Set(kitObjectNames());
  const unused = glbObjectNames(ASSET).filter((n) => !declared.has(n));
  assert.deepEqual(unused, [], `the kit ships objects nothing places: ${unused.join(', ')}`);
});

test('a contract takes its role from its capability status, and unknown grows nothing', () => {
  assert.equal(contractRole('healthy'), 'tree');
  assert.equal(contractRole('mapped'), 'tree');
  assert.equal(contractRole('unhealthy'), 'deadTree');
  assert.equal(contractRole('proposed'), 'undergrowth');
  assert.equal(contractRole('building'), 'undergrowth');
  // ⚠ An island that drew confident trees for a capability whose state is UNKNOWN would be the
  // art asserting a proof state the work does not hold — the one way this arc can do harm
  // (ADR-0392 D5 / ADR-0398 D7).
  assert.equal(contractRole('unknown'), null);
});

// ------------------------------------------------------------------ the dressing

test('the facts come off the fixture\'s own capability list, not off the ground cells', () => {
  const facts = capabilityFacts({});
  assert.equal(facts.length, 11);
  assert.deepEqual(
    facts.map((f) => f.contracts),
    islandCapabilities({}).map((c) => c.testCount),
    'the contract counts drifted from the list the scene is built from',
  );
  for (const f of facts) {
    assert.equal(f.drift, 0, 'drift is a supplied signal and defaults to nothing');
    assert.equal(f.retired, 0, 'retired is a supplied signal and defaults to nothing');
  }
});

test('one standing tree per proven contract, on the capability that holds it', () => {
  const placements = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0 });
  const facts = capabilityFacts({});
  for (const fact of facts) {
    const trees = placements.filter((p) => p.role === 'tree' && p.capId === fact.capId);
    assert.equal(
      trees.length,
      fact.contracts,
      `${fact.capId} holds ${fact.contracts} contracts and grew ${trees.length} trees`,
    );
  }
});

test('an unhealthy capability stands dead wood, and a building one only undergrowth', () => {
  const island = { oddOneOut: { index: 0, status: 'unhealthy' as const } };
  const placements = dressIslandFromKit({ scene: islandScene(island), island, relief: 0 });
  const capZero = placements.filter((p) => p.capId === 'cap-0');
  assert.ok(capZero.length > 0);
  assert.ok(capZero.every((p) => p.role === 'deadTree'), 'an unhealthy parcel grew a living tree');
  assert.ok(!placements.some((p) => p.role === 'tree' && p.capId === 'cap-0'));

  const building = { oddOneOut: { index: 1, status: 'building' as const } };
  const built = dressIslandFromKit({ scene: islandScene(building), island: building, relief: 0 });
  assert.ok(built.filter((p) => p.capId === 'cap-1').every((p) => p.role === 'undergrowth'));
});

test('an unknown capability is left bare rather than dressed with something reassuring', () => {
  const island = { oddOneOut: { index: 2, status: 'unknown' as const } };
  const placements = dressIslandFromKit({ scene: islandScene(island), island, relief: 0 });
  assert.deepEqual(placements.filter((p) => p.capId === 'cap-2'), []);
});

test('drift puts rocks on the parcel that drifted, and nowhere else', () => {
  const supplied = { drift: { 'cap-3': 5 } };
  const placements = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0, supplied });
  const rocks = placements.filter((p) => p.role === 'rock');
  assert.equal(rocks.length, 5);
  assert.ok(rocks.every((r) => r.capId === 'cap-3'));

  const none = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0 });
  assert.equal(none.filter((p) => p.role === 'rock').length, 0, 'a rock appeared with no drift to mark');
});

test('a retired contract lies as a log, and a log runs east-west', () => {
  const supplied = { retired: { 'cap-4': 3 } };
  const placements = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0, supplied });
  const logs = placements.filter((p) => p.role === 'log');
  assert.equal(logs.length, 3);
  // ⚠ A linear prop authored north-south foreshortens into a vertical bar and reads as a post.
  // Measured on the predecessor arc; it cost a whole direction's composition.
  for (const log of logs) assert.ok(Math.abs(log.yaw) < 0.6, `a log turned ${log.yaw.toFixed(2)} rad`);
});

test('one bloom per SIGNED criterion, and none at all when the criteria are suppressed', () => {
  const proven = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0 });
  assert.equal(proven.filter((p) => p.role === 'bloom').length, 10);

  const mixed = { criteriaStates: ['failing' as const, 'pending' as const] };
  const some = dressIslandFromKit({ scene: islandScene(mixed), island: mixed, relief: 0 });
  assert.equal(some.filter((p) => p.role === 'bloom').length, 8, 'an unsigned criterion bloomed');

  const off = { flowers: false };
  const bare = dressIslandFromKit({ scene: islandScene(off), island: off, relief: 0 });
  assert.equal(bare.filter((p) => p.role === 'bloom').length, 0);
});

test('the dressing is deterministic — two builds of one island are identical', () => {
  // `Math.random` is forbidden on this surface (ADR-0380 D6 fence 2). Two islands that differed
  // in WHICH props were drawn would present that difference as the direction.
  const a = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0 });
  const b = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0 });
  assert.deepEqual(a, b);
  const c = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0, seed: 12 });
  assert.notDeepEqual(a, c, 'the seed does nothing, so the scatter is not seeded at all');
});

test('every prop stands inside the parcel whose facts put it there', () => {
  // A tree straddling a boundary belongs to neither capability, and the map's whole claim is
  // that a capability's contracts are ON its own ground.
  const placements = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0 });
  const cells = layoutCells(groundCellsFrom(islandScene()));
  const byParcel = new Map<string, typeof cells>();
  for (const cell of cells) {
    if (!cell.parcel) continue;
    const list = byParcel.get(cell.parcel);
    if (list) list.push(cell);
    else byParcel.set(cell.parcel, [cell]);
  }

  const inQuad = (pts: readonly { x: number; z: number }[], p: { x: number; z: number }): boolean => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  };

  for (const placement of placements) {
    if (placement.capId === 'story') continue;
    const parcelCells = byParcel.get(placement.capId) ?? [];
    assert.ok(
      parcelCells.some((cell) => inQuad(cell.points, placement.at)),
      `a ${placement.role} for ${placement.capId} stands outside its parcel`,
    );
  }
});

test('props ride the relief rather than floating over it', () => {
  const flat = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 0 });
  const hilly = dressIslandFromKit({ scene: islandScene(), island: {}, relief: 6 });
  assert.equal(flat.length, hilly.length, 'the relief changed WHICH props are drawn');
  assert.ok(flat.every((p) => p.y === 0), 'a flat island lifted a prop off the ground');
  assert.ok(hilly.some((p) => p.y !== 0), 'the relief field did not reach the props at all');
  // The horizontal placement must not move with the relief, or the two arms of any
  // relief comparison would differ in two things at once.
  assert.deepEqual(
    flat.map((p) => [p.at.x, p.at.z]),
    hilly.map((p) => [p.at.x, p.at.z]),
  );
});
