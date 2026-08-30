// shipped-land-scene.test.ts — the comparison page's own controls, proved without a GPU.
//
// ⚠⚠ WHY THIS FILE EXISTS AT ALL. The five arms are ONE function called with one input changed,
// which is what makes them a controlled comparison rather than five pictures side by side. Until
// 2026-08-30 that was true of only four of them — the ceiling arm was drawn by the EXPERIMENT's
// material, so "these two differ only in the grain" was a claim, and this file closed it
// arithmetically by proving the two materials build an identical ramp. `land-grain.ts` has since
// crossed, so the ceiling arm is the SHIPPED material with one option changed and that claim is
// now a property. What is left to prove here is what the ladder ASSERTS: that the grain moves
// shading and not the palette, that the arm which ships still writes an authored ramp entry, and
// that the arm which does not is the only one exempted from the closure.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBandedGroundMaterial, groundRamp } from '../src/banded-ground-material.js';
import { SHADE_LEVELS } from '../src/shade-ladder.js';
import {
  GROUND_ROWS,
  GROUND_TOKENS,
  LAND_ARMS,
  LAND_ARM_SPECS,
  LAND_STEPS,
  LAND_ZOOMS,
  PALETTE_CLOSED_ARMS,
  groundRowOf,
  shippedParcels,
} from './shipped-land-scene.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';
import { buildGroundOcclusion } from '../src/contact-shade.js';
import { groundShadowTexture } from '../src/banded-ground-material.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import { groundCasters } from '../src/ground-casters.js';
import { worldTo3D } from '../src/world-to-3d.js';
import { islandScene } from './island-fixture.js';

test('the ladder is a LADDER WITH ONE FORK — every arm adds one thing to a NAMED predecessor', () => {
  assert.deepEqual(
    [...LAND_ARMS],
    ['flat', 'relief', 'banded', 'grain-normal', 'shadow', 'grain-both'],
  );
  // ⚠ EACH ARM NAMES ITS OWN PREDECESSOR, and the shadow arm is what forced that. Two arms now
  // hang off `grain-normal` — the shadow (a candidate) and the grain's colour half (a reference) —
  // so an ORDINAL chain would publish `grain-both → shadow` as a one-thing comparison of two
  // things. Every step must therefore be a spec's own (from, arm), never a neighbouring pair.
  assert.equal(LAND_STEPS.length, LAND_ARM_SPECS.filter((spec) => spec.from !== null).length);
  for (const [from, arm] of LAND_STEPS) {
    const spec = LAND_ARM_SPECS.find((it) => it.arm === arm);
    assert.ok(spec !== undefined, `${arm} is a step target with no spec`);
    assert.equal(spec.from, from, `${arm} must be compared against the arm it extends`);
    assert.ok(LAND_ARMS.includes(from), `${from} is a predecessor but not an arm`);
  }
  // Exactly one baseline, and it is the map as it drew before any of this.
  assert.deepEqual(
    LAND_ARM_SPECS.filter((spec) => spec.from === null).map((spec) => spec.arm),
    ['flat'],
  );
  // THE FORK, named: both of these extend the arm that ships, and neither extends the other.
  assert.equal(LAND_ARM_SPECS.find((it) => it.arm === 'shadow')!.from, 'grain-normal');
  assert.equal(LAND_ARM_SPECS.find((it) => it.arm === 'grain-both')!.from, 'grain-normal');
  assert.deepEqual([...LAND_ZOOMS], [2, 8], 'the overview and the zoomed read, as everywhere else');
});

test('the three banded arms are ONE material with ONE option changed', () => {
  // The property that replaced the old arithmetic proof. All three ask
  // `createBandedGroundMaterial` for the same six ramp rows, so their PALETTES are the same object
  // by construction and the only thing that can differ between them is the grain.
  const tokens = [...GROUND_TOKENS];
  const banded = createBandedGroundMaterial({ tokens });
  const normal = createBandedGroundMaterial({ tokens, grain: 'normal' });
  const both = createBandedGroundMaterial({ tokens, grain: 'both' });
  const rampOf = (m: { uniforms: Record<string, { value: unknown }> }): string =>
    JSON.stringify(m.uniforms['uRamp']!.value);
  assert.equal(rampOf(normal), rampOf(banded), 'the grain must not move the ramp');
  assert.equal(rampOf(both), rampOf(banded), 'the grain must not move the ramp');
  // NON-VACUITY: a ramp of one repeated colour would satisfy the equalities above and prove
  // nothing. Six tokens across four rungs have to deliver a real spread.
  const entries = new Set(groundRamp(tokens).map((c) => c.join(',')));
  assert.ok(entries.size >= 18, `the ground ramp delivers only ${entries.size} distinct colours`);
  assert.equal(groundRamp(tokens).length, tokens.length * SHADE_LEVELS.length);
});

test('the arm that SHIPS keeps the closure and the arm that does not is the only exemption', () => {
  // ⚠ THIS IS THE FENCE, ASKED OF THE SOURCE. The palette closure is the property a picture can
  // only ever SAMPLE — a capture proves the pixels it photographed were authored entries, never
  // that no reachable pixel is off. The source carries the stronger claim: if the only expression
  // reaching `gl_FragColor` is a `uRamp` element, no lighting term and no noise can produce a
  // colour outside the closure, because none of them is ever added to a colour.
  const tokens = [...GROUND_TOKENS];
  const closed = (src: string): boolean => /gl_FragColor = vec4\(c, 1\.0\);/.test(src);
  assert.ok(closed(createBandedGroundMaterial({ tokens }).fragmentShader));
  assert.ok(
    closed(createBandedGroundMaterial({ tokens, grain: 'normal' }).fragmentShader),
    "the grain's NORMAL half must still write an authored ramp entry — that is why it ships",
  );
  assert.ok(
    !closed(createBandedGroundMaterial({ tokens, grain: 'both' }).fragmentShader),
    "the grain's COLOUR half must NOT be palette-closed, or the arm meant to show the cost of " +
      'holding the closure is showing nothing',
  );
  // And the driver's own exemption list has to agree with that, or the run would either refuse
  // the reference arm for being what it is or wave the shipping arm through.
  // ⚠ THE SHADOW ARM IS HELD TO THE CLOSURE TOO, and that is the whole difference between the
  // two forks off `grain-normal`. Its extra rung is `token x 0.77` — an authored `(token x level)`
  // product — so the palette GROWS BY ONE ENTRY PER ROW rather than opening.
  assert.ok(
    closed(
      createBandedGroundMaterial({
        tokens,
        grain: 'normal',
        shadow: groundShadowTexture(
          buildGroundOcclusion({
            bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
            relief: LAND_RELIEF_AMPLITUDE,
            casters: [],
          }),
        ),
      }).fragmentShader,
    ),
    'a shadowed fragment must still write an authored ramp entry',
  );
  assert.deepEqual([...PALETTE_CLOSED_ARMS], ['banded', 'grain-normal', 'shadow']);
  for (const arm of PALETTE_CLOSED_ARMS) {
    assert.ok(LAND_ARMS.includes(arm), `${arm} is held to the closure but is not an arm`);
  }
  assert.ok(!PALETTE_CLOSED_ARMS.includes('grain-both'));
});

test('the arms draw a MULTI-STATUS material, which is what retired the single-status refusal', () => {
  // ⚠ THE OLD LADDER COULD NOT SAY THIS. Its ceiling arm wore `harness/banded-material.ts`, which
  // takes ONE token per material, so the page had to refuse a mixed island rather than paint every
  // parcel the same state — a picture that would lie about the map's whole job (ADR-0392 D5 /
  // ADR-0398 D7). The shipped material takes a ramp ROW per parcel, so every arm now draws
  // whatever statuses the island carries. Asserted rather than assumed, because the fixture
  // happens to be single-status and would satisfy a weaker page just as well.
  const cells = shippedParcels();
  assert.ok(cells.length > 100, `the shipped island fixture should be ~164 parcels, got ${cells.length}`);
  assert.equal(GROUND_TOKENS.length, SHIPPED_GROUND_COLOUR.size, 'every shipped status has a row');
  assert.ok(GROUND_TOKENS.length >= 6, 'six statuses, not the four a folded set would give');
  const ramp = groundRamp([...GROUND_TOKENS]);
  assert.equal(ramp.length, GROUND_TOKENS.length * SHADE_LEVELS.length);
});

test('every parcel of the fixture resolves to a token the shipped canvas actually holds', () => {
  // The arms are only the product's land while the colours are the product's colours. A parcel
  // whose status fell through to a default nobody authored would be a picture of a map that does
  // not exist.
  for (const cell of shippedParcels()) {
    const status = cell.material ?? 'unknown';
    assert.ok(SHIPPED_GROUND_COLOUR.has(status), `no shipped ground colour for status ${status}`);
  }
});

test('the ramp ROWS and the ramp TOKENS agree, status for status', () => {
  // ⚠ THE WORST FAILURE THIS SURFACE CAN HAVE, asked of the comparison page's own copy of the
  // tables. If the row a parcel is given does not index the token that parcel should wear, every
  // arm below `relief` paints each parcel with a DIFFERENT status's colour — wrong, plausible,
  // and undetectable by eye. `shipped-baseline.test.ts` asks the same question of the shipped
  // canvas; this asks it of the instrument, which is a second, independent copy of the ordering.
  for (const [status, token] of SHIPPED_GROUND_COLOUR) {
    const row = GROUND_ROWS.get(status);
    assert.ok(row !== undefined, `no ramp row for status ${status}`);
    assert.equal(GROUND_TOKENS[row], token, `row ${row} is not ${status}'s token`);
    assert.equal(groundRowOf(status), row);
  }
  assert.equal(GROUND_TOKENS.length, GROUND_ROWS.size, 'one row per status, no gaps');
  // An unrecognised status takes `unknown`'s row — the one state that means "no data". Any other
  // fallback would have the picture assert something about work it could not classify.
  assert.equal(groundRowOf('not-a-status'), GROUND_ROWS.get('unknown'));
  assert.equal(groundRowOf(undefined), GROUND_ROWS.get('unknown'));
  // NON-VACUITY: `unknown` is not row 0, so falling back to it is a real choice rather than the
  // default a zero-filled buffer would give.
  assert.notEqual(GROUND_ROWS.get('unknown'), 0);
});

test('THE CENSUS: the shipped map draws ONE object, and skips 1,088 that stand on its ground', () => {
  // ⚠ THIS IS THE INCREMENT'S FINDING, and it bounds what a shadow can do here. `contact-shade.ts`
  // was ranked FIRST of ten mechanisms separating the owner's references from our island — but it
  // was ranked on the EXPERIMENT island, which stands 155 props. This map draws a story tree and
  // nothing else, so one contact pool is not what "placed rather than pasted" meant. The shadow is
  // bounded by the map's own emptiness rather than by the field, and it grows when the props do.
  const descriptors = worldTo3D(islandScene());
  const standing = descriptors.filter(
    (d) =>
      d.kind === 'skipped' &&
      ['parcel-blade', 'parcel-flora', 'parcel-shrub', 'parcel-stem'].includes(d.sceneKind ?? ''),
  );
  const flowers = descriptors.filter(
    (d) => d.kind === 'skipped' && (d.sceneKind ?? '').startsWith('tall-flower-'),
  );
  assert.equal(standing.length + flowers.length, 1088, 'the skipped ground-standing census moved');
  assert.equal(descriptors.filter((d) => d.kind === 'story-tree').length, 1);
  // And exactly one of them becomes a caster.
  assert.deepEqual(groundCasters(descriptors), [{ x: 0, z: -6, radius: 7, height: 19 }]);
});
