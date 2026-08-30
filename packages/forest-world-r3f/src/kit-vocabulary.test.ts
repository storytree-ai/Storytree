// kit-vocabulary.test.ts — the bought kit's vocabulary and placement, proved where they now live.
//
// ⚠⚠ WHY THIS FILE EXISTS RATHER THAN THE HARNESS'S SUITE COVERING IT. `check:mutation-diff`
// mutates a project's `src/` only, so a `src/` module's tests in `harness/` buy the rung NOTHING —
// the relief crossing learned that with 3 survivors and 4 uncovered lines, the sharpest of which
// could have emptied the wave table and delivered a perfectly flat land in silence. So the tests
// that are about THIS MODULE'S ARITHMETIC live here, and the ones that are about the harness
// fixture — its capability list, its criteria, its unprojected cells — stayed with the fixture.
//
// ⚠ THE ISLAND HERE IS BUILT, NOT LOADED, and that is deliberate rather than a convenience. The
// crossed placement takes cells and facts as ARGUMENTS precisely so it does not need a scene; a
// test that reached for one would be proving the adapter instead of the thing.

import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeKitAsset } from './kit-asset.js';
import {
  KIT_ASSEMBLIES,
  KIT_FOOTPRINTS_2026_08_29,
  KIT_ROLES,
  KIT_ROLE_ASSEMBLIES,
  KIT_ROLE_SIGNAL,
  KIT_ROLE_SIZE,
  MIN_PROP_HEIGHT,
  MIN_PROP_WIDTH,
  POCKETED_SIGNALS,
  RENDER_ELEV_DEG,
  VOCABULARY_STATES,
  capabilityFactsFrom,
  clearsObjectFloor,
  deliveredHeightPx,
  deliveredRolePx,
  dressIslandFromKit,
  dressingCensus,
  dressingOverlaps,
  kitObjectNames,
  stateForm,
  tintedStates,
} from './kit-vocabulary.js';
import type { CapabilityFacts, KitPlacement, KitRole } from './kit-vocabulary.js';
import { LEAF_TINT_TOKEN } from './leaf-tint.js';
import { landHeight } from './land-relief.js';
import { cellsByParcel } from './parcel-cells.js';
import type { LayoutCell } from './parcel-cells.js';

const FOOT = KIT_FOOTPRINTS_2026_08_29;

// ---------------------------------------------------------------------------
// a built island — hostile on purpose
// ---------------------------------------------------------------------------
//
// ⚠ FOUR DIFFERENT EDGE NUMBERS AND AN ORIGIN NOWHERE NEAR ZERO. A fixture centred on the origin
// makes `max - min` and `max + min` coincide on both axes, so a clamp or a bound that read the
// wrong one survives every assertion. This one is at x ∈ [140, …] and z ∈ [-70, …] with unequal
// cell spans, so no two spans agree and no sign error is invisible.

const CELL_W = 34;
const CELL_D = 26;
const ORIGIN_X = 140;
const ORIGIN_Z = -70;

/** One parcel as a strip of `cols` quadrilateral cells, laid left to right in its own row. */
function parcel(capId: string, status: string, row: number, cols: number): LayoutCell[] {
  return Array.from({ length: cols }, (_, c) => {
    const x0 = ORIGIN_X + c * CELL_W;
    const z0 = ORIGIN_Z + row * CELL_D;
    return {
      points: [
        { x: x0, z: z0 },
        { x: x0 + CELL_W, z: z0 },
        { x: x0 + CELL_W, z: z0 + CELL_D },
        { x: x0, z: z0 + CELL_D },
      ],
      parcel: capId,
      status,
      cellId: `${capId}-${c}`,
    } satisfies LayoutCell;
  });
}

/** An island of `states.length` capabilities, one parcel-row each. The rows are wide enough that
 *  a tree (footprint 10.13) has somewhere to stand that is not on top of its neighbour. */
function island(states: readonly string[], cols = 4): LayoutCell[] {
  return states.flatMap((status, row) => parcel(`cap-${row}`, status, row, cols));
}

const ALL_HEALTHY = island(Array.from({ length: 6 }, () => 'healthy'));

function dress(
  cells: readonly LayoutCell[],
  over: { blooms?: number; relief?: number; seed?: number; footprint?: Record<KitRole, number> } = {},
): KitPlacement[] {
  const opts = {
    cells,
    facts: capabilityFactsFrom(cells),
    blooms: over.blooms ?? 0,
    relief: over.relief ?? 0,
    footprint: over.footprint ?? FOOT,
  };
  return dressIslandFromKit(over.seed === undefined ? opts : { ...opts, seed: over.seed });
}

/** The OBJECT names inside the embedded kit, read out of its JSON chunk — a glb is a 12-byte
 *  header and a length-prefixed JSON chunk, so this needs no loader and no browser.
 *
 *  ⚠ NODES, NOT MESHES. Blender exports a node per OBJECT and names the mesh after the MESH
 *  DATA, so an object arrives as a node named for the object and a mesh named `Plane.054`.
 *  `GLTFLoader` sets `Object3D.name` from the node, which is what the kit loader keys the
 *  vocabulary on — reading meshes here would check the manifest against names the loader never
 *  sees. */
function kitObjectsInAsset(): string[] {
  const buf = new Uint8Array(decodeKitAsset());
  const view = new DataView(buf.buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLength))) as {
    nodes?: Array<{ name?: string; mesh?: number }>;
  };
  return (json.nodes ?? [])
    .filter((n) => n.mesh !== undefined)
    .map((n) => n.name ?? '')
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// the vocabulary itself
// ---------------------------------------------------------------------------

test('every role names a signal, and every signal is read off the SCENE', () => {
  // ADR-0463 D5: delegation picks WHICH signal a prop carries, never WHETHER it carries one. A
  // role whose entry did not say where its number comes from would be decoration wearing a
  // signal's name — which ADR-0414 D1 forbids outright on the surface this now ships to.
  for (const role of KIT_ROLES) {
    const signal = KIT_ROLE_SIGNAL[role];
    assert.ok(signal.length > 20, `${role} has no signal`);
    assert.match(signal, /^SCENE — /, `${role}'s signal is not read off the scene`);
  }
});

test('the withdrawn signals are recorded rather than forgotten', () => {
  assert.deepEqual(Object.keys(POCKETED_SIGNALS).sort(), ['log', 'rock']);
  for (const [prop, signal] of Object.entries(POCKETED_SIGNALS)) {
    assert.ok(signal.length > 20, `${prop} was pocketed without saying what it carried`);
  }
  for (const role of KIT_ROLES) {
    assert.ok(!(role in POCKETED_SIGNALS), `${role} is both live and pocketed`);
  }
});

test('every role names at least one assembly, and every assembly at least one kit object', () => {
  for (const role of KIT_ROLES) {
    const assemblies = KIT_ROLE_ASSEMBLIES[role];
    assert.ok(assemblies.length > 0, `${role} has no assembly to draw`);
    for (const assembly of assemblies) {
      assert.ok(KIT_ASSEMBLIES[assembly].length > 0, `${assembly} names no kit object`);
    }
  }
});

test('THE EMBEDDED ASSET CARRIES EVERY OBJECT THE VOCABULARY DECLARES', () => {
  // ⚠ The floor that stops a quietly emptier island. Every placement is per assembly FOUND, so an
  // asset that lost an object would draw fewer props and nothing else would say so. The manifest
  // is hand-authored upstream of the export, so this is a genuine two-place mismatch — and it now
  // asks the EMBEDDED bytes, which is what the shipped canvas will actually parse.
  const inAsset = new Set(kitObjectsInAsset());
  const missing = kitObjectNames().filter((n) => !inAsset.has(n));
  assert.deepEqual(missing, [], `the embedded kit is missing: ${missing.join(', ')}`);
});

test('the asset carries nothing the vocabulary does not use — a paid-for byte draws something', () => {
  // The payload scales with DISTINCT objects, not with how many are placed, so an object nobody
  // places is pure wire cost — and now wire cost in a `.ts` module that crosses into the public
  // engine copy. This is the direction the manifest check above cannot see.
  const declared = new Set(kitObjectNames());
  const unused = kitObjectsInAsset().filter((n) => !declared.has(n));
  assert.deepEqual(unused, [], `the kit ships objects nothing places: ${unused.join(', ')}`);
});

test('the vocabulary covers all six states, and only unknown grows nothing', () => {
  assert.deepEqual(stateForm('healthy'), { role: 'tree', tint: null });
  assert.deepEqual(stateForm('mapped'), { role: 'tree', tint: 'mapped' });
  assert.deepEqual(stateForm('proposed'), { role: 'tree', tint: 'proposed' });
  assert.deepEqual(stateForm('building'), { role: 'tree', tint: 'building' });
  assert.deepEqual(stateForm('unhealthy'), { role: 'deadTree', tint: null });
  // ⚠ An island that drew a confident tree for a capability whose state is UNKNOWN would be the
  // art asserting a proof state the work does not hold — the one way this arc can do real harm
  // (ADR-0392 D5 / ADR-0398 D7), and now on the map that ships.
  assert.equal(stateForm('unknown'), null);
  assert.equal(stateForm('retired'), null);
  assert.equal(stateForm(''), null);
});

test('proposed and building are ONE token under two keys, exactly as ADR-0462 holds them', () => {
  assert.equal(LEAF_TINT_TOKEN.get('proposed'), LEAF_TINT_TOKEN.get('building'));
  assert.equal(stateForm('proposed')?.role, stateForm('building')?.role);
});

test('every tint a state asks for is declared, and every declared tint is reachable', () => {
  for (const state of VOCABULARY_STATES) {
    const form = stateForm(state);
    if (!form?.tint) continue;
    assert.ok(LEAF_TINT_TOKEN.has(form.tint), `${state} asks for an undeclared tint`);
  }
  for (const state of LEAF_TINT_TOKEN.keys()) {
    assert.equal(stateForm(state)?.tint, state, `the tint for ${state} is unreachable`);
  }
  assert.deepEqual(tintedStates().sort(), ['building', 'mapped', 'proposed']);
});

test('every role clears the object floor except the bloom, which is recorded as under it', () => {
  assert.equal(clearsObjectFloor('tree'), true);
  assert.equal(clearsObjectFloor('deadTree'), true);
  // A criterion marker is deliberately below the floor at the overview: the procedural flower
  // markers do not clear it either, and making one tree-sized so that it would is the art
  // asserting an importance the signal does not have.
  assert.equal(clearsObjectFloor('bloom'), false);
  assert.equal(KIT_ROLE_SIZE.bloom.axis, 'width');
});

test('the object floor is read on the axis the role is SIZED by, not always the height', () => {
  // ⚠ Height foreshortens at the render elevation and width does not, so one floor for both would
  // be wrong for one of them. Asserting the two floors are different numbers AND that each role
  // is judged against its own is what stops the pair collapsing into one.
  assert.notEqual(MIN_PROP_HEIGHT, MIN_PROP_WIDTH);
  assert.equal(KIT_ROLE_SIZE.tree.axis, 'height');
  assert.ok(deliveredRolePx('tree', 1) < KIT_ROLE_SIZE.tree.units, 'height did not foreshorten');
  assert.equal(deliveredRolePx('bloom', 1), KIT_ROLE_SIZE.bloom.units, 'width foreshortened');
  assert.equal(deliveredHeightPx(10, 2), 20 * Math.cos((RENDER_ELEV_DEG * Math.PI) / 180));
});

// ---------------------------------------------------------------------------
// reading the facts off the map's own parcels
// ---------------------------------------------------------------------------

test('each capability is counted once, with its own parcel’s status', () => {
  const cells = island(['healthy', 'unhealthy', 'proposed']);
  assert.deepEqual(capabilityFactsFrom(cells), [
    { capId: 'cap-0', status: 'healthy' },
    { capId: 'cap-1', status: 'unhealthy' },
    { capId: 'cap-2', status: 'proposed' },
  ] satisfies CapabilityFacts[]);
});

test('⚠ a cell with no parcel belongs to no capability, and is not a capability of its own', () => {
  // The classic extruded-hex substrate carries no parcel groups at all, so every cell arrives
  // this way. Inventing a capability for them would put objects on a map asserting work that no
  // parcel names; dropping the cells instead would shrink the ground a whole-story bloom may
  // stand on. Neither: they are ground with no capability.
  const cells: LayoutCell[] = [
    ...island(['healthy']),
    ...parcel('cap-x', 'healthy', 3, 2).map((c) => ({ ...c, parcel: undefined })),
  ];
  assert.deepEqual(capabilityFactsFrom(cells), [{ capId: 'cap-0', status: 'healthy' }]);
  assert.equal(cellsByParcel(cells).size, 1);
  assert.equal(cells.filter((c) => c.parcel === undefined).length, 2, 'the fixture lost its point');
});

test('the status comes off the parcel, not off the island — six states reach six forms', () => {
  const cells = island(['healthy', 'mapped', 'proposed', 'building', 'unhealthy', 'unknown']);
  const placements = dress(cells);
  const of = (capId: string): KitPlacement | undefined => placements.find((p) => p.capId === capId);
  assert.equal(of('cap-0')?.tint, null, "a healthy capability wears the kit's own needles");
  assert.equal(of('cap-1')?.tint, 'mapped');
  assert.equal(of('cap-2')?.tint, 'proposed');
  assert.equal(of('cap-3')?.tint, 'building');
  assert.equal(of('cap-4')?.role, 'deadTree');
  assert.equal(of('cap-4')?.tint, null, 'a bare dead trunk was given leaves to tint');
  assert.equal(of('cap-5'), undefined, 'an unknown capability was dressed with something');
});

// ---------------------------------------------------------------------------
// the dressing
// ---------------------------------------------------------------------------

test('ONE object per capability, whatever its parcel holds', () => {
  // The whole of the owner's density answer, as an assertion (ADR-0475 D1). The previous
  // vocabulary grew one pine per contract proven, so this is the test that would have failed then
  // — and the parcels here deliberately differ in cell count, which under the old rule mattered.
  const cells = [
    ...parcel('cap-0', 'healthy', 0, 6),
    ...parcel('cap-1', 'healthy', 1, 2),
    ...parcel('cap-2', 'mapped', 2, 4),
  ];
  const placements = dress(cells);
  for (const fact of capabilityFactsFrom(cells)) {
    const own = placements.filter((p) => p.capId === fact.capId);
    assert.equal(own.length, 1, `${fact.capId} grew ${own.length} objects`);
  }
});

test('the two pine assemblies alternate — eleven capabilities are not eleven identical trees', () => {
  const placements = dress(island(Array.from({ length: 6 }, () => 'healthy')));
  const used = new Set(placements.map((p) => p.assembly));
  assert.ok(used.size > 1, `every tree is the same silhouette (${[...used].join(', ')})`);
});

test('one bloom per SIGNED criterion, and none when there are none', () => {
  assert.equal(dress(ALL_HEALTHY, { blooms: 4 }).filter((p) => p.role === 'bloom').length, 4);
  assert.equal(dress(ALL_HEALTHY, { blooms: 0 }).filter((p) => p.role === 'bloom').length, 0);
  // ⚠ Fail closed on a nonsense count rather than throwing or looping: a negative bloom count is
  // a caller's arithmetic error, and an island that refused to draw at all over one would take
  // the whole map down for a criterion tally.
  assert.equal(dress(ALL_HEALTHY, { blooms: -3 }).filter((p) => p.role === 'bloom').length, 0);
});

test('a bloom belongs to the STORY and stands anywhere on the island', () => {
  // ADR-0226 D4: one flower per criterion the owner signed, and the criteria are the STORY's.
  // Filing them under a capability would be the map asserting who owns a signature.
  const blooms = dress(ALL_HEALTHY, { blooms: 5 }).filter((p) => p.role === 'bloom');
  assert.equal(blooms.length, 5);
  for (const b of blooms) {
    assert.equal(b.capId, 'story');
    assert.equal(b.tint, null);
  }
});

test('the dressing is deterministic, and the seed really reaches the scatter', () => {
  // `Math.random` is forbidden on this surface (ADR-0380 D6 fence 2): two islands differing in
  // WHICH props were drawn would present that difference as the direction.
  assert.deepEqual(dress(ALL_HEALTHY, { blooms: 3 }), dress(ALL_HEALTHY, { blooms: 3 }));
  assert.notDeepEqual(
    dress(ALL_HEALTHY, { blooms: 3 }),
    dress(ALL_HEALTHY, { blooms: 3, seed: 12 }),
    'the seed does nothing, so the scatter is not seeded',
  );
});

test('the census names each tinted arm separately', () => {
  const census = dressingCensus(dress(island(['healthy', 'healthy', 'mapped']), { blooms: 2 }));
  assert.equal(census['tree:mapped'], 1);
  assert.equal(census['tree'], 2);
  assert.equal(census['bloom'], 2);
});

test('a capability with no cells grows nothing rather than standing at the origin', () => {
  // The facts and the cells are separate arguments now, so they can disagree — and the honest
  // answer to "this capability has no ground" is no object, never one placed at (0, 0).
  const cells = island(['healthy']);
  const placements = dressIslandFromKit({
    cells,
    facts: [
      { capId: 'cap-0', status: 'healthy' },
      { capId: 'cap-ghost', status: 'healthy' },
    ],
    blooms: 0,
    relief: 0,
    footprint: FOOT,
  });
  assert.deepEqual(placements.map((p) => p.capId), ['cap-0']);
});

// ---------------------------------------------------------------------------
// THE PLACEMENT
// ---------------------------------------------------------------------------

test('NO TWO PROPS OVERLAP on a dressed island', () => {
  // ⚠⚠ THE DEFECT THE OWNER REPORTED: "the rocks are appearing where the trees are". Measured on
  // the harness island on 2026-08-29 before the fix, 26 of 2,926 prop pairs overlapped — seven
  // rock-on-tree, SIX TREE ON TREE — the worst putting a rock 8.57 ground units inside a pine.
  // The cause was scattering one ROLE at a time with the gap rejection inside that one call, so
  // no prop was ever tested against a prop of another role.
  const cells = island(['healthy', 'unhealthy', 'building', 'unknown', 'mapped', 'proposed']);
  const overlaps = dressingOverlaps(dress(cells, { blooms: 6 }), FOOT);
  assert.deepEqual(
    overlaps,
    [],
    `props overlap: ${overlaps.map((o) => `${o.a}/${o.b} by ${(-o.gap).toFixed(2)}`).join(', ')}`,
  );
});

test('every single-state island is clear too', () => {
  for (const status of ['healthy', 'mapped', 'proposed', 'building', 'unhealthy'] as const) {
    const cells = island(Array.from({ length: 6 }, () => status));
    const overlaps = dressingOverlaps(dress(cells, { blooms: 6 }), FOOT);
    assert.deepEqual(overlaps, [], `an all-${status} island overlaps ${overlaps.length} pairs`);
  }
});

test('THE OVERLAP DETECTOR CAN FIRE — it is not a check that passes on everything', () => {
  // ⚠ Without this the two assertions above are satisfied by a detector that never returns
  // anything, which is the commonest fault class in this repo.
  const at = (x: number, z: number): KitPlacement => ({
    role: 'tree',
    assembly: 'pine-a',
    capId: `c${x}`,
    tint: null,
    at: { x, z },
    y: 0,
    yaw: 0,
  });
  assert.equal(dressingOverlaps([at(0, 0), at(0, 0)], FOOT).length, 1);
  assert.equal(dressingOverlaps([at(0, 0), at(FOOT.tree * 0.999, 0)], FOOT).length, 1);
  assert.equal(dressingOverlaps([at(0, 0), at(FOOT.tree * 1.001, 0)], FOOT).length, 0);
  // And it reports HOW FAR inside, not merely that something is.
  assert.equal(dressingOverlaps([at(0, 0), at(0, 0)], FOOT)[0]?.gap, -FOOT.tree);
});

test('every prop stands inside the parcel whose state put it there', () => {
  // A tree straddling a boundary belongs to neither capability, and the map's whole claim is that
  // a capability's state is read off ITS OWN ground.
  const cells = island(['healthy', 'unhealthy', 'mapped', 'proposed'], 5);
  const byParcel = cellsByParcel(cells);
  const inQuad = (pts: readonly { x: number; z: number }[], p: { x: number; z: number }): boolean => {
    let inside = false;
    for (const [i, a] of pts.entries()) {
      const b = pts[(i + pts.length - 1) % pts.length]!;
      if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  };
  for (const placement of dress(cells)) {
    if (placement.capId === 'story') continue;
    const parcelCells = byParcel.get(placement.capId) ?? [];
    assert.ok(
      parcelCells.some((cell) => inQuad(cell.points, placement.at)),
      `a ${placement.role} for ${placement.capId} stands outside its parcel`,
    );
  }
});

test('props ride the relief rather than floating over it', () => {
  const flat = dress(ALL_HEALTHY, { blooms: 3 });
  const hilly = dress(ALL_HEALTHY, { blooms: 3, relief: 6 });
  assert.equal(flat.length, hilly.length, 'the relief changed WHICH props are drawn');
  assert.ok(flat.every((p) => p.y === 0), 'a flat island lifted a prop off the ground');
  assert.ok(hilly.some((p) => p.y !== 0), 'the relief field did not reach the props at all');
  // The horizontal placement must not move with the relief, or the two arms of any relief
  // comparison would differ in two things at once.
  assert.deepEqual(flat.map((p) => [p.at.x, p.at.z]), hilly.map((p) => [p.at.x, p.at.z]));
  // And the height is the LAND'S OWN field at that point, not some other lift.
  for (const p of hilly) assert.equal(p.y, landHeight(p.at.x, p.at.z, 6));
});

test('⚠ the relief AMPLITUDE reaches the props — not just "some relief"', () => {
  // A placement that lifted by a hardcoded field would pass the test above. These two amplitudes
  // must give different heights at the same points, and in proportion, because `landHeight` is
  // exactly linear in its amplitude.
  const low = dress(ALL_HEALTHY, { relief: 2 });
  const high = dress(ALL_HEALTHY, { relief: 6 });
  assert.deepEqual(low.map((p) => [p.at.x, p.at.z]), high.map((p) => [p.at.x, p.at.z]));
  const moved = low.filter((p, i) => Math.abs(p.y - high[i]!.y) > 1e-9);
  assert.ok(moved.length > 0, 'the amplitude reached no prop');
  for (const [i, p] of low.entries()) {
    assert.ok(Math.abs(high[i]!.y - p.y * 3) < 1e-9, 'the lift is not linear in the amplitude');
  }
});

test('a wider footprint pushes the props apart rather than being ignored', () => {
  // The footprint is an ARGUMENT, so a placement that ignored it would look correct in every test
  // above — they all pass the same table. Widening it must move the arrangement.
  //
  // ⚠⚠ AND THE ISLAND HAS TO BE CROWDED FOR THIS TO ASK ANYTHING, which is a property of the
  // search worth writing down rather than a fixture detail. The candidate chosen maximises
  // `distance − (radius + other.radius)`; when ONE neighbour dominates, scaling every radius
  // subtracts the same constant from every candidate and the argmax does not move. So on a roomy
  // island the footprint genuinely changes nothing, and a fixture like that would report "the
  // footprint is ignored" for a placement that honours it perfectly. Two capabilities on two
  // small parcels with ten blooms competing for the same ground is where it bites.
  const tight = island(['healthy', 'mapped'], 2);
  const wide = {
    tree: FOOT.tree * 2.5,
    deadTree: FOOT.deadTree * 2.5,
    bloom: FOOT.bloom * 2.5,
  } satisfies Record<KitRole, number>;
  assert.notDeepEqual(
    dress(tight, { blooms: 10 }).map((p) => [p.at.x, p.at.z]),
    dress(tight, { blooms: 10, footprint: wide }).map((p) => [p.at.x, p.at.z]),
    'the footprint reached no placement decision at all',
  );
});

test('a prop is pulled off the edges its cell shares with a neighbour', () => {
  // A tree sitting exactly on a boundary reads as belonging to neither parcel. The candidate
  // sampler pulls every point toward its cell's centroid for that reason, and the pull has to be
  // real: with none, a bilinear sample would reach the corners.
  const cells = parcel('cap-0', 'healthy', 0, 3);
  const [placed] = dress(cells);
  assert.ok(placed, 'the parcel grew nothing');
  const xs = cells.flatMap((c) => c.points.map((p) => p.x));
  const zs = cells.flatMap((c) => c.points.map((p) => p.z));
  const margin = 0.5;
  assert.ok(placed.at.x > Math.min(...xs) + margin && placed.at.x < Math.max(...xs) - margin);
  assert.ok(placed.at.z > Math.min(...zs) + margin && placed.at.z < Math.max(...zs) - margin);
});

test('a degenerate cell is stepped over rather than sampled', () => {
  // A ring of fewer than three vertices bounds no area, so a bilinear sample of it is a point on
  // a line. `worldTo3D` already refuses to emit one, but the placement takes cells from any
  // caller and must not depend on that.
  const cells: LayoutCell[] = [
    { points: [{ x: 200, z: 0 }, { x: 201, z: 0 }], parcel: 'cap-0', status: 'healthy', cellId: 'd' },
    ...parcel('cap-0', 'healthy', 0, 2),
  ];
  const placements = dress(cells);
  assert.equal(placements.length, 1);
  assert.ok(placements[0]!.at.x >= ORIGIN_X, 'the placement came off the degenerate cell');
});
