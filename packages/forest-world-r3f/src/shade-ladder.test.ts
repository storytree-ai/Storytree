// shade-ladder.test.ts — the ladder's own witnesses, in the ladder's own home.
//
// ⚠⚠ IT IS HERE RATHER THAN IN `harness/palette-band.test.ts` FOR A MEASURED REASON.
// `check:mutation-diff` mutates a project's `src/` only. When `land-relief.ts` crossed on
// 2026-08-30 its tests stayed in `harness/`, and the rung found 3 survivors and 4 uncovered
// lines on a module the harness suite exercises thoroughly — the sharpest being that the wave
// table could be EMPTIED, giving a perfectly flat land, without a test noticing. Tests reached
// through a re-export are witnesses to a reader and to nothing else.
//
// The harness suite still covers these symbols through `palette-band.ts`'s re-export, which is
// deliberate and is not duplication: that is what proves the re-export is live rather than a
// second copy.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIGHT_DIRECTION,
  SHADE_KEYS,
  SHADE_KEY_FLOOR,
  SHADE_LEVELS,
  bandGlsl,
  bandLevelIndex,
  bandShade,
  bandedColour,
  deliveredForLevel,
  paletteImageOfToken,
  parseHex,
  rungOfNormal,
  toHex,
  tokenRamp,
} from './shade-ladder.js';

test('the ladder is SORTED ASCENDING — bandShade relies on it and must not merely hope', () => {
  // `bandShade` walks the array and keeps the FIRST closest level on a tie, which resolves ties
  // toward the DARKER rung only while the array ascends. A resorted literal would silently
  // reverse the tie rule.
  const sorted = [...SHADE_LEVELS].sort((a, b) => a - b);
  assert.deepEqual([...SHADE_LEVELS], sorted);
  assert.ok(SHADE_LEVELS.length >= 2, 'a one-rung ladder quantises nothing');
  assert.equal(new Set(SHADE_LEVELS).size, SHADE_LEVELS.length, 'no duplicate rungs');
});

test('the ladder floors at 0.78 and tops at 1.0 — the authored range, not an arbitrary one', () => {
  // The FLOOR is the ambient floor of a locked palette: nothing may be darker than
  // `token x 0.78`. On the shipped map that is also the fence that stops a shaded `healthy`
  // parcel walking into a darker status's territory, so it is a semantic constant and not a
  // taste one (ADR-0392 D5 / ADR-0398 D7).
  assert.equal(SHADE_LEVELS[0], 0.78);
  assert.equal(SHADE_LEVELS[SHADE_LEVELS.length - 1], 1);
});

test('bandShade CLAMPS rather than extrapolating, in both directions', () => {
  const lo = SHADE_LEVELS[0]!;
  const hi = SHADE_LEVELS[SHADE_LEVELS.length - 1]!;
  assert.equal(bandShade(-99), lo);
  assert.equal(bandShade(0), lo);
  assert.equal(bandShade(lo), lo);
  assert.equal(bandShade(hi), hi);
  assert.equal(bandShade(99), hi);
  // ⚠ A NON-FINITE INPUT FAILS DARK, IN BOTH DIRECTIONS, AND THAT IS THE DESIGN RATHER THAN AN
  // OVERSIGHT. `NaN` and both infinities land on the DARKEST rung, not on the nearer end: a
  // lighting term that has gone non-finite is a bug, and a bug that paints a parcel at full
  // brightness reads as a confidently lit healthy island. The darkest rung is still an authored
  // entry, so the closure holds either way; what differs is which way the mistake reads.
  assert.equal(bandShade(Number.NaN), lo);
  assert.equal(bandShade(Number.POSITIVE_INFINITY), lo);
  assert.equal(bandShade(Number.NEGATIVE_INFINITY), lo);
});

test('bandShade takes the NEAREST rung, and resolves an exact tie DOWN', () => {
  // Between 0.8 and 0.9 the midpoint is 0.85: a tie, and it must go to the darker rung.
  assert.equal(bandShade(0.85), 0.8);
  assert.equal(bandShade(0.8499), 0.8);
  assert.equal(bandShade(0.8501), 0.9);
  // ...and every rung is reachable, which a nearest-rule that collapsed would not give.
  for (const level of SHADE_LEVELS) assert.equal(bandShade(level), level);
});

test('bandLevelIndex is bandShade in index form — the same decision, never a second one', () => {
  for (let x = -0.2; x <= 1.2; x += 0.001) {
    const i = bandLevelIndex(x);
    assert.equal(SHADE_LEVELS[i], bandShade(x), `disagreement at lambert ${x}`);
  }
});

test('parseHex round-trips through toHex, and REFUSES anything that is not #rrggbb', () => {
  assert.deepEqual(parseHex('#8cb85e'), { r: 140, g: 184, b: 94 });
  assert.equal(toHex({ r: 140, g: 184, b: 94 }), '#8cb85e');
  assert.equal(toHex(parseHex('#000000')), '#000000');
  assert.equal(toHex(parseHex('#ffffff')), '#ffffff');
  // Padding: a channel below 16 must not lose its leading zero, or the round trip shortens the
  // string and every downstream set-membership test misses.
  assert.equal(toHex({ r: 1, g: 2, b: 3 }), '#010203');
  for (const bad of ['8cb85e', '#8cb85', '#8cb85ee', '#gggggg', '', '#abc']) {
    assert.throws(() => parseHex(bad), /shade-ladder/, `${JSON.stringify(bad)} should refuse`);
  }
});

test('LIGHT_DIRECTION is NORMALISED — a lambert term with no further arithmetic', () => {
  const len = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z);
  assert.ok(Math.abs(len - 1) < 1e-12, `light direction length ${len}`);
  // It points DOWN onto the land from above and to one side: a light with y <= 0 would leave
  // every upward-facing top face on the darkest rung and the whole ground one colour.
  assert.ok(LIGHT_DIRECTION.y > 0.5, 'the sun is above the island');
  assert.ok(LIGHT_DIRECTION.x !== 0 || LIGHT_DIRECTION.z !== 0, 'a straight-down sun shades nothing');
});

test('rungOfNormal reads the ladder off a surface, and a flat top is NOT the brightest rung', () => {
  const flat = rungOfNormal({ x: 0, y: 1, z: 0 });
  assert.equal(flat, bandLevelIndex(LIGHT_DIRECTION.y * 0.5 + 0.5));
  // ⚠ The land is lit from a slant, so flat ground sits BELOW the top rung and relief can
  // therefore brighten as well as darken. A test asserting `flat === last` would pass on a
  // straight-down light that made every relief invisible.
  assert.ok(flat < SHADE_LEVELS.length - 1, 'flat ground leaves headroom above it');
  // Facing the light square on is the top rung; facing away is the bottom one.
  assert.equal(rungOfNormal(LIGHT_DIRECTION), SHADE_LEVELS.length - 1);
  assert.equal(rungOfNormal({ x: -LIGHT_DIRECTION.x, y: -LIGHT_DIRECTION.y, z: -LIGHT_DIRECTION.z }), 0);
});

test('deliveredForLevel is token x level, ROUNDED ONCE, for an unkeyed token', () => {
  assert.deepEqual(deliveredForLevel('#8cb85e', 1), { r: 140, g: 184, b: 94 });
  // 216 x 0.9 = 194.4 -> 194; 192 x 0.9 = 172.8 -> 173; 105 x 0.9 = 94.5 -> 95 (ties UP).
  assert.deepEqual(deliveredForLevel('#d8c069', 0.9), { r: 194, g: 173, b: 95 });
  assert.deepEqual(deliveredForLevel('#ffffff', 0), { r: 0, g: 0, b: 0 });
});

test('deliveredForLevel MIXES toward a shade key, and clamps rather than extrapolating', () => {
  const [token, key] = [...SHADE_KEYS.entries()][0]!;
  // At the floor the delivered colour IS the key, unmixed — that is what the floor means.
  assert.deepEqual(deliveredForLevel(token, SHADE_KEY_FLOOR), parseHex(key));
  // At 1.0 it is the token itself, so a keyed token still delivers its own colour in full light.
  assert.deepEqual(deliveredForLevel(token, 1), parseHex(token));
  // Below the floor it CLAMPS to the key rather than passing through it into a colour neither
  // entry names. Both ladders sit strictly inside, so this never fires today — it exists so a
  // rung added below the floor later fails safe.
  assert.deepEqual(deliveredForLevel(token, SHADE_KEY_FLOOR - 0.3), parseHex(key));
  assert.deepEqual(deliveredForLevel(token, 1.5), parseHex(token));
  // And it is a genuine ROTATION rather than a darkening: `token x level` cannot change the
  // channel ratios, so a keyed token whose mix agreed with the multiply would buy nothing.
  const mixed = deliveredForLevel(token, SHADE_LEVELS[0]!);
  const multiplied = { r: 0, g: 0, b: 0 };
  const t = parseHex(token);
  multiplied.r = Math.round(t.r * SHADE_LEVELS[0]!);
  multiplied.g = Math.round(t.g * SHADE_LEVELS[0]!);
  multiplied.b = Math.round(t.b * SHADE_LEVELS[0]!);
  assert.notDeepEqual(mixed, multiplied, 'a shade key that multiplies is not a key');
});

test('SHADE_KEYS is EMPTY for every status family — a semantic question art may not settle', () => {
  // ADR-0392 D5 / ADR-0398 D7: the land's colour is a capability's proof state, so rotating a
  // shaded ground's hue would change what the map ASSERTS. The keys are on family-less prop
  // tokens only (ADR-0406 D4). The shipped ground therefore never takes the mix branch, which is
  // what makes `banded-ground-material`'s ramp a plain `token x level` table.
  const groundTokens = ['#8cb85e', '#b7684e', '#d8c069', '#57544a', '#9ca3af'];
  for (const token of groundTokens) {
    assert.equal(SHADE_KEYS.get(token), undefined, `${token} must not carry a shade key`);
  }
  assert.ok(SHADE_KEYS.size > 0, 'NON-VACUITY: the mix branch above is reachable by something');
});

test('tokenRamp is one entry per rung, in ladder order, and bandedColour agrees with it', () => {
  const ramp = tokenRamp('#8cb85e');
  assert.equal(ramp.length, SHADE_LEVELS.length);
  SHADE_LEVELS.forEach((level, i) => {
    assert.deepEqual(ramp[i], deliveredForLevel('#8cb85e', level));
    assert.deepEqual(bandedColour('#8cb85e', level), ramp[i]);
  });
  // Darkest first, because the ladder ascends — a reversed ramp would light the island upside
  // down while every count and closure test still passed.
  assert.ok(ramp[0]!.g < ramp[ramp.length - 1]!.g);
});

test('paletteImageOfToken DEDUPES — the token\'s own closed image, not its ramp again', () => {
  // 0.78 and 0.8 are close enough that some channels collide, so the image is genuinely smaller
  // than the ramp for some tokens and never larger for any.
  for (const token of ['#8cb85e', '#b7684e', '#d8c069', '#57544a', '#9ca3af', '#ffffff']) {
    const image = paletteImageOfToken(token);
    const hexes = image.map(toHex);
    assert.equal(new Set(hexes).size, hexes.length, `${token}: image is not deduped`);
    assert.ok(image.length <= SHADE_LEVELS.length);
    for (const c of tokenRamp(token)) assert.ok(hexes.includes(toHex(c)), `${token}: ramp entry missing`);
  }
  // Black is the degenerate case: every level delivers `#000000`, so the image is ONE entry.
  assert.equal(paletteImageOfToken('#000000').length, 1);
});

test('bandGlsl INTERPOLATES the ladder — the shader and this file share one set of numbers', () => {
  const glsl = bandGlsl();
  assert.match(glsl, new RegExp(`const int ST_N_LEVELS = ${SHADE_LEVELS.length};`));
  for (const level of SHADE_LEVELS) {
    assert.ok(glsl.includes(level.toFixed(6)), `the ladder rung ${level} is not in the source`);
  }
  // The quantiser it declares is the one the material calls; a rename here is a link error there.
  assert.match(glsl, /int st_bandIndex\(float lambert\)/);
  assert.match(glsl, /float st_level\(int i\)/);
  // ⚠ NON-VACUITY: a generator that emitted an empty string would satisfy every "includes" above
  // if the ladder were empty, and a hand-typed constant string would satisfy them all today and
  // drift tomorrow. The proof that it is DERIVED is that a rung's own digits appear once per
  // `st_level` branch plus once in the trailing reader comment.
  const first = SHADE_LEVELS[0]!.toFixed(6);
  assert.ok(glsl.split(first).length - 1 >= 2, 'the ladder is written in, not described');
});
