// shipped-canopy-scene.test.ts — the canopy comparison's own arithmetic, without a GPU.
//
// ⚠ THE PICTURES ON THAT PAGE ARE FOR THE OWNER'S EYE; what a test can hold is that the arms are
// the SHIPPED ground with one thing moving between them — the placement list and the shadows it
// throws — and that the list is what the canvas would stand.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GROVE_DENSITY, GROVE_DENSITY_RUNGS, cellAt } from '../src/grove-dressing.js';
import { placementCasters } from '../src/ground-casters.js';
import {
  KIT_FOOTPRINTS_2026_08_29,
  KIT_HEIGHTS_2026_08_29,
  dressingCensus,
  dressingOverlaps,
  isGrovePlacement,
  type KitPlacement,
} from '../src/kit-vocabulary.js';
import { parcelCellsFrom } from '../src/parcel-cells.js';
import {
  CANOPY_ARMS,
  CANOPY_ARM_CAPTION,
  CANOPY_ARM_DENSITY,
  CANOPY_FOOTPRINT,
  CANOPY_HEIGHTS,
  CANOPY_PICTURE_ZOOMS,
  CANOPY_SIZES,
  CONTROL_ARM,
  GROVE_ARMS,
  SHIPPED_GROVE_ARM,
  armCasters,
  armPlacements,
  canopyGroundBuild,
  canopyPlan,
  offIslandCount,
} from './shipped-canopy-scene.js';
import {
  crowdCasters,
  crowdCells,
  crowdIslandId,
  crowdIslands,
  crowdSize,
} from './shipped-crowd-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');
const ONE = crowdSize('one');
const FOREST = crowdSize('forest');

// ---------------------------------------------------------------- the control arm is the map

test('the page builds its ground with the SHIPPED builder, handed THIS arm’s casters, and constructs no scene of its own', () => {
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
  // The material is the shipped composition — the same call `CellGround` and the status page make.
  assert.ok(/buildGroundMaterial\(build\.field, SHIPPED_GRASS, build\.shore\(\), SHIPPED_SAND_MIX, extras\)/.test(page));
  // And the casters reach the ground the way they reach the map: through `placementCasters`.
  assert.ok(/placementCasters\(armPlacements\(arm, size\), CANOPY_FOOTPRINT, CANOPY_HEIGHTS\)/.test(page));
  // The props are lit by the map's own pipeline, not by a bare renderer.
  assert.ok(/configureExactColour\(renderer\)/.test(page) && /calibrateLights\(renderer\)/.test(page));
});

// ---------------------------------------------------------------- the arms

test('five arms, control first, every one captioned, both sizes, the read zoom and the fitted view', () => {
  assert.deepEqual(CANOPY_ARMS, ['bare', 'capability', 'groves-x1', 'groves-x2', 'groves-x3']);
  assert.equal(CONTROL_ARM, 'bare');
  for (const arm of CANOPY_ARMS) assert.ok(CANOPY_ARM_CAPTION[arm].length > 40, `${arm} has no caption a reader can use`);
  assert.deepEqual(CANOPY_SIZES.map((s) => s.id), ['one', 'forest']);
  assert.deepEqual(CANOPY_PICTURE_ZOOMS, [8, 'fit']);
  assert.equal(CANOPY_FOOTPRINT, KIT_FOOTPRINTS_2026_08_29, 'the page places from the table the canvas places from');
  assert.equal(CANOPY_HEIGHTS, KIT_HEIGHTS_2026_08_29);
});

// ⚠⚠ THE ONE TEST THAT SURVIVES A SCALE-BACK. When the owner picks a rung, TWO constants move
// (`GROVE_DENSITY`, which is what the map stands, and `SHIPPED_GROVE_ARM`, which is what the page
// calls the shipped picture) and nothing else does. If they can move apart, the sheet ships a
// picture labelled as the map while drawing something else — which is the exact failure the
// picture-per-step protocol exists to prevent (ADR-0503 D3).
test('canopy-arms-agree: the ladder IS the rungs, and the shipped arm IS the shipped constant', () => {
  assert.deepEqual(
    GROVE_ARMS.map((a) => CANOPY_ARM_DENSITY[a]),
    [...GROVE_DENSITY_RUNGS],
    'the grove arms are the declared rungs, in order',
  );
  assert.equal(
    CANOPY_ARM_DENSITY[SHIPPED_GROVE_ARM],
    GROVE_DENSITY,
    'the arm the sheet calls the shipped picture grows at some rung the map does not stand',
  );
  assert.ok(GROVE_ARMS.includes(SHIPPED_GROVE_ARM), 'the shipped arm is not one of the rungs');
  // A rung's NAME is its rung — an arm called x3 that grows at 2 is a caption that lies.
  for (const arm of GROVE_ARMS) {
    assert.equal(CANOPY_ARM_DENSITY[arm], Number(arm.slice('groves-x'.length)), `${arm} is not named for its rung`);
  }
  // The two arms that grow no grove are told apart by the table, not by their names.
  assert.equal(CANOPY_ARM_DENSITY['bare'], null);
  assert.equal(CANOPY_ARM_DENSITY['capability'], null);
});

test('the ladder RISES: each rung stands strictly more grove pines than the one below it', () => {
  const counts = GROVE_ARMS.map((a) => armPlacements(a, ONE).filter(isGrovePlacement).length);
  for (const [i, n] of counts.entries()) {
    if (i === 0) continue;
    assert.ok(n > counts[i - 1]!, `${GROVE_ARMS[i]} stands ${n} against ${GROVE_ARMS[i - 1]}'s ${counts[i - 1]}`);
  }
  // And the vocabulary is untouched on every rung — density reaches the grove and nothing else.
  const capability = armPlacements('capability', ONE);
  for (const arm of GROVE_ARMS) {
    assert.deepEqual(armPlacements(arm, ONE).filter((p) => !isGrovePlacement(p)), capability, `${arm} moved the vocabulary`);
  }
});

test('the arms differ in EXACTLY the dressing: nothing, the vocabulary, the vocabulary plus the grove', () => {
  assert.deepEqual(armPlacements('bare', ONE), []);
  const capability = armPlacements('capability', ONE);
  assert.ok(capability.length > 0, 'the capability arm stands nothing');
  assert.equal(capability.filter(isGrovePlacement).length, 0, 'the capability arm grew a grove');
  const groved = armPlacements(SHIPPED_GROVE_ARM, ONE);
  assert.deepEqual(groved.filter((p) => !isGrovePlacement(p)), capability, 'the grove arm moved the vocabulary’s own objects');
  // The fixture island: eleven capabilities, ten signed criteria, and the recipe's grove.
  const census = dressingCensus(groved);
  assert.equal(census['tree'], 11);
  assert.equal(census['bloom'], 10);
  const groves = groved.filter(isGrovePlacement);
  assert.ok(
    groves.length >= 40 && groves.length <= 100,
    `${groves.length} grove pines on the fixture island — outside the recipe’s 13 stands x 4–8, minus exclusions`,
  );
  for (const g of groves) assert.ok(g.scale < 1 && g.assembly !== 'pine-dead' && g.tint === null);
  // And nothing overlaps under the declared rule, on the arm the canvas stands.
  assert.deepEqual(dressingOverlaps(groved, CANOPY_FOOTPRINT), []);
});

test('the casters are the crowd’s own plus one per placement — and the control now casts NOTHING', () => {
  // ⚠⚠ THE CONTROL'S ONE CASTER WAS THE PLACEHOLDER STORY TREE, AND IT IS GONE (ADR-0508). This
  // read `crowdCasters(ONE).length === 1` — "the map before this increment: one caster on the
  // island" — because `crowdCasters` is `groundCasters(worldTo3D(islandScene()))` replicated per
  // island, and the tree was the only descriptor on an island that cast. It is now ZERO, which
  // makes `bare` a genuinely bare island: no bought object standing on it AND no pool at its
  // centre. That is the whole visible before/after this increment lands.
  assert.equal(crowdCasters(ONE).length, 0, 'nothing in the descriptor stream casts any more');
  assert.deepEqual(armCasters('bare', ONE), []);
  // ⚠ AND `armCasters` IS STILL THE UNION IT CLAIMS TO BE, not a function that has quietly become
  // "the placements". With `crowdCasters` empty, `deepEqual(armCasters('bare'), crowdCasters())`
  // — what this test used to open with — is `[] === []` and would hold for any implementation at
  // all. The dressed arms are what carry that claim now.
  assert.deepEqual(armCasters('capability', ONE), [
    ...crowdCasters(ONE),
    ...placementCasters(armPlacements('capability', ONE), CANOPY_FOOTPRINT, CANOPY_HEIGHTS),
  ]);
  assert.ok(armCasters('capability', ONE).length > 0, 'the kit still casts — the union is not empty for every arm');
  assert.equal(
    armCasters(SHIPPED_GROVE_ARM, ONE).length,
    crowdCasters(ONE).length + armPlacements(SHIPPED_GROVE_ARM, ONE).length,
  );
  const plan = canopyPlan(SHIPPED_GROVE_ARM, ONE);
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
  assert.equal(offIslandCount([...armPlacements(SHIPPED_GROVE_ARM, ONE), sea], cells), 1);
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

test('the plan reads the same list the scene draws, by kind', () => {
  const plan = canopyPlan(SHIPPED_GROVE_ARM, ONE);
  const placements = armPlacements(SHIPPED_GROVE_ARM, ONE);
  assert.equal(plan.placements, placements.length);
  assert.equal(plan.groves, placements.filter(isGrovePlacement).length);
  assert.equal(plan.blooms, placements.filter((p) => p.role === 'bloom').length);
  assert.equal(plan.capabilityTrees + plan.blooms + plan.groves, plan.placements);
  assert.equal(plan.capabilityTrees, 11);
  // `casters: 0` since ADR-0508 — it was 1, the placeholder story tree, and `bare` is now bare of
  // shadow as well as of props.
  assert.deepEqual(canopyPlan('bare', ONE), { ...canopyPlan('bare', ONE), placements: 0, groves: 0, blooms: 0, kitCasters: 0, casters: 0 });
});

test('on the forest, groves grow on the healthy islands and on no other', () => {
  const groves = armPlacements(SHIPPED_GROVE_ARM, FOREST).filter(isGrovePlacement);
  assert.ok(groves.length > 500, `${groves.length} grove pines on a 21-healthy-island forest`);
  const anchors = crowdIslands(FOREST).map((i) => ({ id: crowdIslandId(i.index), status: i.status, x: i.offset.x, z: i.offset.z }));
  assert.ok(anchors.some((a) => a.status !== 'healthy'), 'the forest has no non-healthy island — the claim is vacuous');
  const forested = new Set<string>();
  for (const g of groves) {
    let best = anchors[0]!;
    let bestD = Infinity;
    for (const a of anchors) {
      const d = (a.x - g.at.x) ** 2 + (a.z - g.at.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    assert.equal(best.status, 'healthy', `a grove pine on ${best.id}, which is ${best.status}`);
    forested.add(best.id);
  }
  const healthy = anchors.filter((a) => a.status === 'healthy').length;
  assert.equal(forested.size, healthy, `${forested.size} of ${healthy} healthy islands wear a grove`);
});
