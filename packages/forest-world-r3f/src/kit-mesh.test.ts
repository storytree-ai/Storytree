// kit-mesh.test.ts — the bought kit's browser half, proved without a browser.
//
// ⚠⚠ WHY IT CAN BE PROVED HERE AT ALL. Everything downstream of the parse is arithmetic over
// geometry: which axis a role is scaled by, what footprint that leaves on the ground, which
// material a tinted crown wears, and how many meshes a dressing merges into. `three` and
// `mergeGeometries` both run headless; only IMAGE DECODING does not. So the loader's own texture
// half is proved by its REFUSAL (below) and by the delivered-pixel guard on a real GPU, and
// everything else is proved here — where `check:mutation-diff` can see it, which a test in
// `harness/` could not.
//
// ⚠ THE KIT IS SYNTHESISED, deliberately. A fixture built from the committed asset would make
// every assertion below a fact about one export rather than about the arithmetic, and the numbers
// would move the next time the kit is re-exported.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { decodeKitAsset } from './kit-asset.js';
import {
  LEAF_MATERIALS,
  kitMeshes,
  parseKit,
  placementExtent,
  placementScale,
  roleFootprints,
  tintedMaterial,
} from './kit-mesh.js';
import type { KitAssemblyGeometry, KitObject, LoadedKit } from './kit-mesh.js';
import { KIT_ROLES, KIT_ROLE_ASSEMBLIES, KIT_ROLE_SIZE } from './kit-vocabulary.js';
import type { KitAssembly, KitPlacement, KitRole } from './kit-vocabulary.js';
import { leafTintGainFor } from './leaf-tint.js';

/** A box of a named size wearing a named material — enough for every measurement below. */
function part(name: string, materialName: string, w: number, h: number, d: number): KitObject {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.computeBoundingBox();
  const material = new THREE.MeshStandardMaterial({ name: materialName });
  material.name = materialName;
  return { name, geometry, material, materialName };
}

/**
 * An assembly RECENTRED THE WAY THE LOADER RECENTRES ONE — x and z on the joint centre, base at
 * y = 0.
 *
 * ⚠ THE RECENTRING IS PART OF THE FIXTURE'S FAITHFULNESS, not tidiness. `three`'s box geometry
 * straddles the origin, so an un-recentred fixture would sink every prop half its own height into
 * the land and the assertions below would be written around that — quietly encoding a bug as the
 * expected behaviour. The loader does exactly this translate for the whole assembly at once,
 * because recentring each object on its own base drops a pine's crown 18% of its height into the
 * trunk.
 */
function assembly(w: number, h: number, d: number, materialName = 'Pine_Branches'): KitAssemblyGeometry {
  const objects = [
    part('Trunk', 'Pine_Trunks', w * 0.3, h, d * 0.3),
    part('Leaves', materialName, w, h * 0.8, d),
  ];
  for (const o of objects) {
    o.geometry.translate(0, h / 2, 0);
    o.geometry.computeBoundingBox();
  }
  return { objects, names: ['Trunk', 'Leaves'], height: h, width: Math.max(w, d) };
}

/** A kit whose assemblies have DIFFERENT proportions, so a scale read off the wrong one shows. */
function kitFixture(): LoadedKit {
  const assemblies = new Map<KitAssembly, KitAssemblyGeometry>([
    ['pine-a', assembly(3, 12, 3)],
    // ⚠ WIDER AND SHORTER than pine-a, so `roleFootprints`' "widest arm wins" is a real choice
    // rather than a tie: at the tree role's 18 units of height this one is the wider of the two.
    ['pine-b', assembly(5, 10, 4)],
    ['pine-dead', assembly(2, 9, 2, 'Pine_Trunks')],
    ['flower', assembly(1.5, 2, 1.5)],
  ]);
  return {
    assemblies,
    materials: ['Pine_Branches', 'Pine_Trunks'],
    leafMeans: new Map([['Pine_Branches', { r: 70, g: 90, b: 69 }]]),
    triangles: 0,
    wireBytes: 0,
    textures: [],
    gpuBytes: 0,
  };
}

const KIT = kitFixture();

function placement(over: Partial<KitPlacement> = {}): KitPlacement {
  return {
    role: 'tree',
    assembly: 'pine-a',
    capId: 'cap-0',
    tint: null,
    at: { x: 0, z: 0 },
    y: 0,
    yaw: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// scale and footprint
// ---------------------------------------------------------------------------

test('a role is scaled by the axis it DECLARES, not always by its height', () => {
  // ⚠ Scaling a wide flat prop by its height multiplies its footprint by the same factor, so the
  // bloom is sized by WIDTH. A `placementScale` that always read height would put a marker on the
  // island several times the size the vocabulary asked for, and every overlap check would pass —
  // they all use the declared footprint, not the delivered one.
  assert.equal(KIT_ROLE_SIZE.tree.axis, 'height');
  assert.equal(placementScale(KIT, placement()), KIT_ROLE_SIZE.tree.units / 12);

  assert.equal(KIT_ROLE_SIZE.bloom.axis, 'width');
  const bloom = placement({ role: 'bloom', assembly: 'flower' });
  assert.equal(placementScale(KIT, bloom), KIT_ROLE_SIZE.bloom.units / 1.5);
});

test('the delivered extent is the assembly’s own proportions at that scale', () => {
  const extent = placementExtent(KIT, placement());
  const scale = KIT_ROLE_SIZE.tree.units / 12;
  assert.equal(extent.height, 12 * scale);
  assert.equal(extent.width, 3 * scale);
  // A height-sized role delivers exactly the height it asked for; its width falls out.
  assert.equal(extent.height, KIT_ROLE_SIZE.tree.units);
  assert.notEqual(extent.width, KIT_ROLE_SIZE.tree.units, 'the fixture is square, so it proves nothing');
});

test('a role’s footprint is its WIDEST arm, so the clearance is enough for either', () => {
  // ⚠ A role whose footprint came off the FIRST arm would leave the other one overlapping its
  // neighbours — and only on the islands where the alternation happened to land it there, which
  // is the kind of defect that looks like bad luck.
  const foot = roleFootprints(KIT);
  const arms = KIT_ROLE_ASSEMBLIES.tree.map((name) => {
    const a = KIT.assemblies.get(name)!;
    return (a.width * KIT_ROLE_SIZE.tree.units) / a.height;
  });
  assert.equal(foot.tree, Math.max(...arms));
  assert.ok(Math.max(...arms) > Math.min(...arms), 'the two arms are the same width — no choice made');
  // Every role gets one, and a bloom's is its declared width exactly (it is sized by width).
  for (const role of KIT_ROLES) assert.ok(foot[role] > 0, `${role} has no footprint`);
  assert.ok(Math.abs(foot.bloom - KIT_ROLE_SIZE.bloom.units) < 1e-9);
});

test('a missing assembly is refused rather than skipped', () => {
  // Every count and placement is per assembly FOUND, so an asset that lost one would draw a
  // quietly emptier island. The refusals name the assembly.
  const thin = { ...KIT, assemblies: new Map(KIT.assemblies) };
  thin.assemblies.delete('pine-b');
  assert.throws(() => roleFootprints(thin), /pine-b/);
  assert.throws(() => placementScale(thin, placement({ assembly: 'pine-b' })), /pine-b/);
});

test('an assembly with no extent on its sizing axis is refused, not divided by zero', () => {
  // A zero there produces `Infinity` and a prop that is silently absent from the frame rather
  // than an error anyone sees.
  const flat = { ...KIT, assemblies: new Map(KIT.assemblies) };
  flat.assemblies.set('pine-a', { ...assembly(3, 12, 3), height: 0 });
  assert.throws(() => placementScale(flat, placement()), /height/);
  assert.throws(() => roleFootprints(flat), /height/);
});

// ---------------------------------------------------------------------------
// the tint
// ---------------------------------------------------------------------------

test('an untinted placement wears the kit’s OWN material, not a clone of it', () => {
  // ⚠ Identity, not equality. A clone per placement would trade the merge this module exists to
  // do for one draw call per tree on a renderer measured draw-call bound.
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const leaves = KIT.assemblies.get('pine-a')!.objects[1]!;
  assert.equal(tintedMaterial(KIT, leaves.material, leaves.materialName, null, cache), leaves.material);
  assert.equal(cache.size, 0, 'an untinted placement filled the tint cache');
});

test('only LEAF materials are tinted — a dead trunk’s branches keep the kit’s own colour', () => {
  // ⚠⚠ THE TRAP THIS CLOSES. The kit gives the dead pine BOTH `Pine_Trunks` and `Pine_Branches`:
  // its dead branches wear the same material as a live crown's needles. Tinting by MATERIAL alone
  // would paint a dead tree's branches yellow for a state it does not hold. The tint is a property
  // of the PLACEMENT and this set only says which of its parts the tint reaches.
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const trunk = KIT.assemblies.get('pine-a')!.objects[0]!;
  assert.equal(LEAF_MATERIALS.has('Pine_Trunks'), false);
  assert.equal(tintedMaterial(KIT, trunk.material, 'Pine_Trunks', 'proposed', cache), trunk.material);
});

test('a tinted crown wears the gain the arithmetic asks for, and ONE clone per (material, tint)', () => {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const leaves = KIT.assemblies.get('pine-a')!.objects[1]!;
  const first = tintedMaterial(KIT, leaves.material, 'Pine_Branches', 'proposed', cache);
  const again = tintedMaterial(KIT, leaves.material, 'Pine_Branches', 'proposed', cache);
  assert.notEqual(first, leaves.material, 'the tint mutated the kit’s own material');
  assert.equal(first, again, 'a second placement of the same tint made a second clone');
  assert.equal(cache.size, 1);

  const gain = leafTintGainFor('proposed', KIT.leafMeans.get('Pine_Branches')!)!;
  assert.ok(Math.abs(first.color.r - gain.r) < 1e-9);
  assert.ok(Math.abs(first.color.g - gain.g) < 1e-9);
  assert.ok(Math.abs(first.color.b - gain.b) < 1e-9);

  // A DIFFERENT tint is a different clone — one bucket per tint, which is what stops a yellow
  // crown and a brown one being merged into whichever arrived first.
  const mapped = tintedMaterial(KIT, leaves.material, 'Pine_Branches', 'mapped', cache);
  assert.notEqual(mapped, first);
  assert.equal(cache.size, 2);
});

test('a state with no declared tint is refused rather than drawn untinted', () => {
  // A placement asking for a tint the vocabulary does not name is asking the crown to carry a
  // state nothing declares. Falling back to the kit's green would report it as proven.
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const leaves = KIT.assemblies.get('pine-a')!.objects[1]!;
  assert.throws(
    () => tintedMaterial(KIT, leaves.material, 'Pine_Branches', 'healthy', cache),
    /no declared leaf tint/,
  );
});

test('a leaf material with no recorded mean is refused — a tint has nothing to rotate', () => {
  const blind = { ...KIT, leafMeans: new Map() };
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const leaves = KIT.assemblies.get('pine-a')!.objects[1]!;
  assert.throws(
    () => tintedMaterial(blind, leaves.material, 'Pine_Branches', 'proposed', cache),
    /no base-colour mean/,
  );
});

// ---------------------------------------------------------------------------
// the merge
// ---------------------------------------------------------------------------

test('a dressing merges to ONE mesh per (material, tint), however many props there are', () => {
  // `hardware-floor.mjs` measured this renderer draw-call bound, so the merge is the whole reason
  // a bought island costs less than the procedural one it replaces.
  const many = Array.from({ length: 12 }, (_, i) =>
    placement({ capId: `cap-${i}`, at: { x: i * 20, z: 0 } }),
  );
  const meshes = kitMeshes(KIT, many);
  assert.equal(meshes.length, 2, `12 untinted pines merged into ${meshes.length} meshes`);
  for (const m of meshes) assert.ok(m.geometry.getAttribute('position').count > 0);
});

test('⚠ the TINT is part of the merge key — two states never share one mesh', () => {
  // ⚠⚠ A merged mesh wears ONE material. Merging a yellow-crowned tree with a green one by
  // material alone would paint both whichever arrived first: an island reporting a state that
  // half its capabilities do not hold, drawn with no error anywhere.
  const mixed = [
    placement({ capId: 'a' }),
    placement({ capId: 'b', tint: 'proposed', at: { x: 40, z: 0 } }),
    placement({ capId: 'c', tint: 'mapped', at: { x: 80, z: 0 } }),
  ];
  const meshes = kitMeshes(KIT, mixed);
  // trunks (one bucket) + three distinct leaf buckets: untinted, proposed, mapped.
  assert.equal(meshes.length, 4);
  const colours = meshes.map((m) => (m.material as THREE.MeshStandardMaterial).color.getHex());
  assert.equal(new Set(colours).size, 3, 'two tints delivered the same colour');
});

test('the placement’s transform reaches the merged vertices, and the kit is not mutated', () => {
  const before = KIT.assemblies.get('pine-a')!.objects[0]!.geometry.getAttribute('position').array[0];
  const far = kitMeshes(KIT, [placement({ at: { x: 500, z: -300 }, y: 7 })]);
  const box = new THREE.Box3().setFromBufferAttribute(
    far[0]!.geometry.getAttribute('position') as THREE.BufferAttribute,
  );
  assert.ok(box.min.x > 400 && box.max.x < 600, `merged geometry sits at x ${box.min.x}..${box.max.x}`);
  assert.ok(box.min.z > -400 && box.max.z < -200);
  assert.ok(box.min.y >= 7 - 1e-6, 'the placement’s ground height did not reach the vertices');
  assert.equal(
    KIT.assemblies.get('pine-a')!.objects[0]!.geometry.getAttribute('position').array[0],
    before,
    'building a dressing mutated the kit itself',
  );
});

test('yaw really rotates — two placements differing only in yaw are different geometry', () => {
  const a = kitMeshes(KIT, [placement({ yaw: 0 })])[0]!;
  const b = kitMeshes(KIT, [placement({ yaw: Math.PI / 4 })])[0]!;
  const boxOf = (m: THREE.Mesh): THREE.Box3 =>
    new THREE.Box3().setFromBufferAttribute(m.geometry.getAttribute('position') as THREE.BufferAttribute);
  assert.ok(Math.abs(boxOf(a).max.x - boxOf(b).max.x) > 1e-6, 'the yaw reached no vertex');
});

test('an empty dressing is no meshes, not one empty one', () => {
  assert.deepEqual(kitMeshes(KIT, []), []);
});

test('a placement naming an assembly the kit does not hold is refused', () => {
  const thin = { ...KIT, assemblies: new Map(KIT.assemblies) };
  thin.assemblies.delete('pine-a');
  assert.throws(() => kitMeshes(thin, [placement()]), /pine-a/);
});

// ---------------------------------------------------------------------------
// the loader's own floors
// ---------------------------------------------------------------------------

test('the loader refuses a kit whose leaf material carries no base-colour map', async () => {
  // ⚠ THIS IS THE HEADLESS CASE AND IT IS WORTH ASSERTING RATHER THAN SKIPPING. `three` parses
  // the glb's GEOMETRY here perfectly well; what node cannot do is DECODE its images. So this run
  // reaches exactly the state a real browser would reach if the kit were re-exported without its
  // foliage texture — and the loader must refuse it, because the alternative is a crown silently
  // wearing its state token as a flat colour instead of the asset it was bought for. The message
  // names the material, so the failure says what to fix.
  //
  // The parse's texture half is proved on a real GPU by the delivered-pixel colour guard; this is
  // the half that can be proved without one, and it is the fail-closed half.
  await assert.rejects(parseKit(decodeKitAsset(), 'the embedded kit'), /carries no base-colour map/);
});

test('the loader names its source in a refusal', async () => {
  // A refusal that did not say WHICH asset failed is unactionable once there is more than one.
  await assert.rejects(parseKit(decodeKitAsset(), 'a-named-source'), (e: Error) => {
    assert.match(e.message, /Pine_Branches/);
    return true;
  });
});
