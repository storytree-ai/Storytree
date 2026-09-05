// shipped-canopy-scene.test.ts — the shared builder's own arithmetic, without a GPU.
//
// ⚠ What a test can hold is that the arms are the SHIPPED ground with one thing moving between
// them — the placement list and the shadows it throws — and that the list is what the canvas
// would stand. This module stopped being a page under ADR-0518 (its ladder was the grove's); every
// page that borrows "the shipped ground under today's map" borrows it from here, so what it builds
// has to be the map.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { cellAt } from '../src/dressing-ground.js';
import { placementCasters } from '../src/ground-casters.js';
import {
  KIT_FOOTPRINTS_2026_08_29,
  KIT_HEIGHTS_2026_08_29,
  dressingCensus,
  dressingOverlaps,
  isDressingRole,
  type KitPlacement,
} from '../src/kit-vocabulary.js';
import { parcelCellsFrom } from '../src/parcel-cells.js';
import {
  CANOPY_ARMS,
  CANOPY_ARM_CAPTION,
  CANOPY_FOOTPRINT,
  CANOPY_HEIGHTS,
  CONTROL_ARM,
  SHIPPED_CANOPY_ARM,
  armCasters,
  armPlacements,
  canopyGroundBuild,
  canopyPlan,
  offIslandCount,
} from './shipped-canopy-scene.js';
import { crowdCasters, crowdCells, crowdIslandId, crowdIslands, crowdSize } from './shipped-crowd-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');
const ONE = crowdSize('one');
const FOREST = crowdSize('forest');

// ---------------------------------------------------------------- the control arm is the map

test('the builder builds its ground with the SHIPPED builder, handed THIS arm’s casters, and constructs no scene of its own', () => {
  const page = source('shipped-canopy-scene.ts');
  assert.ok(
    /shippedGroundBuild\(crowdCells\(size\), armCasters\(arm, size\), crowdStrips\(size\)\)/.test(page),
    'the arms must call the function CellGround calls, with the arm’s casters and the crowd’s strips',
  );
  assert.ok(!/const input: CellGroundGeometryInput/.test(page), 'no geometry input of its own');
  assert.ok(!/clipToCoast\(/.test(page), 'the coast clip is the builder’s');
  assert.ok(!/shoreRelief\(/.test(page), 'the shore fall is the builder’s');
  assert.ok(!/shoreArmRingPlan\(/.test(page), 'the inset ring is the builder’s');
  assert.ok(!/buildAtlasOcclusion\(/.test(page), 'the occlusion field is the builder’s');
  // And the casters reach the ground the way they reach the map: through `placementCasters`.
  assert.ok(/placementCasters\(armPlacements\(arm, size\), CANOPY_FOOTPRINT, CANOPY_HEIGHTS\)/.test(page));
  // ⚠ NO GROVE, AND NO ROUTE TO ONE (ADR-0518): the module imports neither the deleted src module
  // nor the harness history, and places through the vocabulary alone.
  assert.ok(!/from '\.\.\/src\/grove-dressing|from '\.\/grove-history|dressMapWithGroves\(|dressGroves/.test(page), 'the builder reaches a grove');
  assert.ok(/dressMapFromKit\(armDescriptors\(size\)/.test(page), 'the capability arm is the vocabulary alone');
});

// ---------------------------------------------------------------- the arms

test('two arms, control first, every one captioned; the shipped arm is the one that casts', () => {
  assert.deepEqual(CANOPY_ARMS, ['bare', 'capability']);
  assert.equal(CONTROL_ARM, 'bare');
  assert.equal(SHIPPED_CANOPY_ARM, 'capability');
  for (const arm of CANOPY_ARMS) assert.ok(CANOPY_ARM_CAPTION[arm].length > 40, `${arm} has no caption a reader can use`);
  assert.equal(CANOPY_FOOTPRINT, KIT_FOOTPRINTS_2026_08_29, 'the builder places from the table the canvas places from');
  assert.equal(CANOPY_HEIGHTS, KIT_HEIGHTS_2026_08_29);
});

test('⚠⚠ the arms differ in EXACTLY the dressing: nothing, then the vocabulary — one tree per capability and nothing else tree-shaped', () => {
  assert.deepEqual(armPlacements('bare', ONE), []);
  const capability = armPlacements('capability', ONE);
  assert.ok(capability.length > 0, 'the capability arm stands nothing');
  // The fixture island: eleven capabilities, ten signed criteria — and NO third kind of object.
  const census = dressingCensus(capability);
  assert.equal(census['tree'], 11);
  assert.equal(census['bloom'], 10);
  assert.equal(capability.length, 21, 'the vocabulary stands exactly its trees and blooms');
  for (const p of capability) {
    assert.ok(!isDressingRole(p.role), 'the capability arm stood ground cover');
    assert.equal(p.scale, 1, `${p.role}:${p.capId} is drawn at ${p.scale} — nothing that reports is ever smaller`);
    assert.notEqual(p.capId, 'grove');
  }
  // And nothing overlaps under the declared rule, on the arm the canvas stands.
  assert.deepEqual(dressingOverlaps(capability, CANOPY_FOOTPRINT), []);
});

test('the casters are the crowd’s own plus one per placement — and the control casts NOTHING', () => {
  // ⚠⚠ THE CONTROL'S ONE CASTER WAS THE PLACEHOLDER STORY TREE, AND IT IS GONE (ADR-0508). This
  // read `crowdCasters(ONE).length === 1` — "the map before this increment: one caster on the
  // island" — because `crowdCasters` is `groundCasters(worldTo3D(islandScene()))` replicated per
  // island, and the tree was the only descriptor on an island that cast. It is now ZERO, which
  // makes `bare` a genuinely bare island: no bought object standing on it AND no pool at its centre.
  assert.equal(crowdCasters(ONE).length, 0, 'nothing in the descriptor stream casts any more');
  assert.deepEqual(armCasters('bare', ONE), []);
  // ⚠ AND `armCasters` IS STILL THE UNION IT CLAIMS TO BE, not a function that has quietly become
  // "the placements". With `crowdCasters` empty, `deepEqual(armCasters('bare'), crowdCasters())`
  // is `[] === []` and would hold for any implementation at all. The dressed arm carries the claim.
  assert.deepEqual(armCasters('capability', ONE), [
    ...crowdCasters(ONE),
    ...placementCasters(armPlacements('capability', ONE), CANOPY_FOOTPRINT, CANOPY_HEIGHTS),
  ]);
  assert.ok(armCasters('capability', ONE).length > 0, 'the kit still casts — the union is not empty for every arm');
  assert.equal(armCasters(SHIPPED_CANOPY_ARM, ONE).length, crowdCasters(ONE).length + armPlacements(SHIPPED_CANOPY_ARM, ONE).length);
  const plan = canopyPlan(SHIPPED_CANOPY_ARM, ONE);
  assert.equal(plan.kitCasters, plan.placements, 'a placement without a caster is an object that floats');
  assert.equal(plan.casters, plan.kitCasters, 'every caster on the map is now a kit placement’s');
});

test('no placement stands off the island on any arm — and the count CAN fire', () => {
  for (const arm of CANOPY_ARMS) assert.equal(canopyPlan(arm, ONE).offIsland, 0, `${arm} stands something in the sea`);
  const cells = parcelCellsFrom(crowdCells(ONE));
  const sea: KitPlacement = {
    role: 'tree',
    assembly: 'pine-a',
    capId: 'cap-x',
    tint: null,
    at: { x: 9999, z: 9999 },
    y: 0,
    yaw: 0,
    scale: 1,
  };
  assert.equal(offIslandCount([sea], cells), 1);
  assert.equal(offIslandCount([...armPlacements(SHIPPED_CANOPY_ARM, ONE), sea], cells), 1);
  assert.equal(cellAt(cells, sea.at), null);
});

test('the ground’s triangles do not move between arms — the casters change the FIELD, never the mesh', () => {
  const plans = CANOPY_ARMS.map((arm) => canopyPlan(arm, ONE));
  assert.ok(plans[0]!.groundTriangles > 0);
  for (const p of plans) assert.equal(p.groundTriangles, plans[0]!.groundTriangles);
  // NON-VACUITY: the field DID move — the kit's casters reached it.
  const bare = canopyGroundBuild('bare', ONE).field;
  const capability = canopyGroundBuild('capability', ONE).field;
  assert.ok(bare !== null && capability !== null);
  assert.equal(bare.w, capability.w);
  let differing = 0;
  for (const [i, v] of bare.data.entries()) if (v !== capability.data[i]) differing += 1;
  assert.ok(differing > 1000, `only ${differing} texels moved between bare and capability — the kit casts nothing`);
});

test('the plan reads the same list the arm stands, by kind', () => {
  const plan = canopyPlan(SHIPPED_CANOPY_ARM, ONE);
  const placements = armPlacements(SHIPPED_CANOPY_ARM, ONE);
  assert.equal(plan.placements, placements.length);
  assert.equal(plan.blooms, placements.filter((p) => p.role === 'bloom').length);
  assert.equal(plan.capabilityTrees + plan.blooms, plan.placements);
  assert.equal(plan.capabilityTrees, 11);
  assert.deepEqual(canopyPlan('bare', ONE), { ...canopyPlan('bare', ONE), placements: 0, blooms: 0, kitCasters: 0, casters: 0 });
  // Memoised: the forest's dressing is thirty-five islands' worth of placement.
  assert.equal(armPlacements(SHIPPED_CANOPY_ARM, FOREST), armPlacements(SHIPPED_CANOPY_ARM, FOREST));
});

test('on the forest, every island stands its own capabilities’ trees and no island stands more than it has', () => {
  const trees = armPlacements(SHIPPED_CANOPY_ARM, FOREST).filter((p) => p.role === 'tree' || p.role === 'deadTree');
  const anchors = crowdIslands(FOREST).map((i) => ({ id: crowdIslandId(i.index), status: i.status, x: i.offset.x, z: i.offset.z }));
  const perIsland = new Map<string, number>();
  for (const t of trees) {
    let best = anchors[0]!;
    let bestD = Infinity;
    for (const a of anchors) {
      const d = (a.x - t.at.x) ** 2 + (a.z - t.at.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    perIsland.set(best.id, (perIsland.get(best.id) ?? 0) + 1);
  }
  // Every island in the crowd is the fixture island replicated: eleven capabilities, eleven trees —
  // EXCEPT that `unknown` grows nothing (ADR-0475), which is the vocabulary's load-bearing entry.
  const known = anchors.filter((a) => a.status !== 'unknown');
  assert.ok(known.length > 0 && known.length < anchors.length, 'the forest needs both known and unknown islands for this to mean anything');
  for (const a of anchors) {
    const n = perIsland.get(a.id) ?? 0;
    if (a.status === 'unknown') assert.equal(n, 0, `${a.id} is unknown and stands ${n} trees`);
    else assert.equal(n, 11, `${a.id} (${a.status}) stands ${n} trees for 11 capabilities`);
  }
  assert.equal(trees.length, 11 * known.length);
});
