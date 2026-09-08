import test from 'node:test';
import assert from 'node:assert/strict';

import { createBandedGroundMaterial, type BandedGroundMaterialOptions } from './banded-ground-material.js';
import { blightGlsl, blightRung } from './land-blight.js';

const TOKENS = ['#8cb85e', '#d8c069', '#57544a', '#9ca3af'];
const GRASS = { mix: 0.85, rows: [0] };
const WHEAT = { mix: 0.85, rows: [1], anchor: '#b0b040', lift: 2 };
const DEAD = blightRung('dead').palette;
const BLIGHT = { mix: 0.85, rows: [2], palette: DEAD };

const base = (): BandedGroundMaterialOptions => ({ tokens: TOKENS, grain: 'normal', grass: GRASS });
const fragmentOf = (opts: BandedGroundMaterialOptions): string => {
  const m = createBandedGroundMaterial(opts) as unknown as { fragmentShader: string };
  return m.fragmentShader;
};

test('an UNBLIGHTED material is byte-identical to the one this file emitted before the blight existed', () => {
  // ⚠ THE WHOLE REASON `blight` IS AN OPTIONAL KEY RATHER THAN A NULLABLE ONE. Every figure already
  // measured about this ground was taken against the source with no blight in it; an absent layer
  // that still moved a byte would retire all of them.
  const withWheat = { ...base(), wheat: WHEAT };
  const a = fragmentOf(withWheat);
  const b = fragmentOf({ ...withWheat });
  assert.equal(a, b);
  assert.ok(!a.includes('st_blight'), 'an unblighted shader carries blight source');
  assert.ok(!a.includes('uBlightMix'), 'an unblighted shader declares the blight uniform');
});

test('a blighted material carries the layer`s own source, uniform, gate and mix line', () => {
  const src = fragmentOf({ ...base(), blight: BLIGHT });
  assert.ok(src.includes('uniform float uBlightMix;'));
  assert.ok(src.includes('c = mix(c, st_blightColour(vWorld.xz) * level, uBlightMix * blightGate);'));
  // The generated source is the module's, verbatim — not a second spelling in this file.
  for (const line of blightGlsl(DEAD).split('\n')) {
    assert.ok(src.includes(line.trim()), `the emitted shader is missing: ${line.trim()}`);
  }
  const material = createBandedGroundMaterial({ ...base(), blight: BLIGHT }) as unknown as {
    uniforms: Record<string, { value: number }>;
  };
  assert.equal(material.uniforms['uBlightMix']?.value, 0.85);
});

test('⚠ THE BLIGHT GATE IS NOT PROMOTED INTO grassGate — that absence is what drops layers 2, 3 and 4', () => {
  const src = fragmentOf({ ...base(), blight: BLIGHT, wheat: WHEAT });
  // The wheat IS promoted, so the two promotions are distinguishable rather than both absent.
  assert.ok(src.includes('grassGate = max(grassGate, wheatGate);'));
  assert.ok(
    !src.includes('grassGate = max(grassGate, blightGate)'),
    'the blight gate was promoted into the grass gate — an unhealthy island would then wear the shore sand, the worn path and the slope rock, and the rock is the layer measured to desaturate a small island past its own status',
  );
});

test('the blight is REFUSED without the grass it rides', () => {
  assert.throws(
    () => createBandedGroundMaterial({ tokens: TOKENS, grain: 'normal', blight: BLIGHT }),
    /the blight layer needs the grass/,
  );
});

test('an empty gate is REFUSED — a layer switched on that dresses nothing, at a full shader`s cost', () => {
  assert.throws(() => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, rows: [] } }), /no rows to dress/);
});

test('a burn of 1 is BLACK and black is the sea, so the range stops short of it', () => {
  for (const burn of [1, 1.5, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, palette: { burn, crackMix: 0.5 } } }),
      /the blight layer's burn is/,
      `a burn of ${burn} was accepted`,
    );
  }
  // The ends of the admissible range are accepted.
  assert.doesNotThrow(() => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, palette: { burn: 0, crackMix: 0 } } }));
  assert.doesNotThrow(() => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, palette: { burn: 0.99, crackMix: 1 } } }));
});

test('a crack strength outside [0, 1] is REFUSED — it is a mix factor', () => {
  for (const crackMix of [-0.01, 1.01, Number.NaN]) {
    assert.throws(
      () => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, palette: { burn: 0.5, crackMix } } }),
      /the blight layer's crack strength is/,
      `a crack strength of ${crackMix} was accepted`,
    );
  }
});

test('a row that is not a ramp row is REFUSED', () => {
  assert.throws(() => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, rows: [9] } }), /which is not a ramp row/);
  assert.throws(() => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, rows: [-1] } }), /which is not a ramp row/);
  assert.throws(() => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, rows: [1.5] } }), /which is not a ramp row/);
});

test('⚠ A ROW IN TWO PAINT GATES IS REFUSED — one row wears one painted layer, never the sum of two', () => {
  assert.throws(
    () => createBandedGroundMaterial({ ...base(), blight: { ...BLIGHT, rows: [0] } }),
    /is named by the blight gate AND another painted gate/,
  );
  assert.throws(
    () => createBandedGroundMaterial({ ...base(), wheat: WHEAT, blight: { ...BLIGHT, rows: [1] } }),
    /is named by the blight gate AND another painted gate/,
  );
  // A disjoint row is fine, which is what makes the refusal a fence rather than a ban.
  assert.doesNotThrow(() => createBandedGroundMaterial({ ...base(), wheat: WHEAT, blight: BLIGHT }));
});

test('two rungs compile DIFFERENT shaders — the palette is written in, not uniform-fed', () => {
  const sick = fragmentOf({ ...base(), blight: { ...BLIGHT, palette: blightRung('sick').palette } });
  const dead = fragmentOf({ ...base(), blight: BLIGHT });
  assert.notEqual(sick, dead);
});
