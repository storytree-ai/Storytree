// palette-band.test.ts — the proof that ADR-0380 D6 fence 3 (the locked palette survives
// in a shader) is met BY CONSTRUCTION rather than by hope.
//
// The load-bearing checks are the CLOSURE (nothing off-palette is representable) and the
// NON-VACUITY control (an unbanded material, the thing this replaces, fails the same
// instrument). This arc has shipped two harnesses that reported passes while never reaching
// the guard, so every closure assertion here is paired with a control that must FAIL.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARKER_TOKENS,
  SHADE_LEVELS,
  SHARED_TOKENS,
  STATUS_TOKENS,
  TREE_TOKENS,
  familylessPalette,
  familylessTokens,
  bandGlsl,
  bandShade,
  bandedColour,
  landPalette,
  landTokens,
  paletteImageOfToken,
  parseHex,
  statusFamilyOf,
  toHex,
} from './palette-band.js';

// --- the ladder itself -------------------------------------------------------

test('the shade ladder is sorted ascending — bandShade depends on it', () => {
  for (let i = 1; i < SHADE_LEVELS.length; i++) {
    assert.ok(
      SHADE_LEVELS[i]! > SHADE_LEVELS[i - 1]!,
      `SHADE_LEVELS must ascend; ${SHADE_LEVELS[i - 1]} then ${SHADE_LEVELS[i]}`,
    );
  }
});

test('bandShade is TOTAL: every finite input lands exactly on an authored level', () => {
  const levels = new Set(SHADE_LEVELS);
  // a fine sweep well outside the ladder on both sides — the clamp is part of the contract
  for (let x = -0.5; x <= 1.5; x += 0.0005) {
    const b = bandShade(x);
    assert.ok(levels.has(b), `bandShade(${x}) = ${b} is not an authored level`);
  }
  // the pathological inputs a lighting term can actually produce
  for (const x of [NaN, Infinity, -Infinity, 0, 1, -0]) {
    assert.ok(levels.has(bandShade(x)), `bandShade(${x}) escaped the ladder`);
  }
});

test('bandShade is IDEMPOTENT on the ladder — a banded value re-bands to itself', () => {
  for (const level of SHADE_LEVELS) {
    assert.equal(bandShade(level), level, `level ${level} did not survive a re-band`);
  }
});

// --- the closure, which is the whole point -----------------------------------

test('CLOSURE: every colour the material can emit is a palette entry', () => {
  const palette = new Set(landPalette());
  assert.ok(palette.size > 0, 'the palette is empty — the instrument would pass vacuously');
  let checked = 0;
  for (const token of landTokens()) {
    // sweep the CONTINUOUS lighting term, not just the ladder: this is what a GPU feeds in
    for (let x = -0.25; x <= 1.25; x += 0.001) {
      const hex = toHex(bandedColour(token, x));
      assert.ok(palette.has(hex), `token ${token} at lambert ${x} emitted off-palette ${hex}`);
      checked++;
    }
  }
  assert.ok(checked > 10_000, `the sweep only reached ${checked} samples — too coarse to trust`);
});

test('NON-VACUITY CONTROL: an UNBANDED material fails the same closure check', () => {
  // The pre-change world: shade continuously and ship it. If this passed, the closure test
  // above would be proving nothing about the banding.
  const palette = new Set(landPalette());
  const token = STATUS_TOKENS['healthy']!.top[0]!;
  const t = parseHex(token);
  let escapes = 0;
  for (let x = 0.78; x <= 1.0; x += 0.001) {
    const raw = {
      r: Math.round(t.r * x),
      g: Math.round(t.g * x),
      b: Math.round(t.b * x),
    };
    if (!palette.has(toHex(raw))) escapes++;
  }
  assert.ok(
    escapes > 100,
    `an unbanded material escaped the palette only ${escapes} times — the control is too weak ` +
      'to prove the banding is what closes it',
  );
});

test('the palette is the exact (token x level) closure — size is derived, not asserted blind', () => {
  const tokens = landTokens();
  const palette = landPalette();
  // upper bound: |tokens| x |levels|; the real count is lower only where two products collide
  assert.ok(
    palette.length <= tokens.length * SHADE_LEVELS.length,
    'the palette exceeds its own closure — an entry came from somewhere else',
  );
  const union = new Set<string>();
  for (const token of tokens) for (const c of paletteImageOfToken(token)) union.add(toHex(c));
  assert.deepEqual([...union].sort(), palette, 'landPalette is not the union of its token images');
});

// --- the foreign-status instrument -------------------------------------------

test('FOREIGN STATUS: a healthy instance can never deliver a non-healthy family colour', () => {
  // The failure ADR-0367 D5 forbids: art asserting a proof state the work does not hold.
  // Under construction-not-snap this is unrepresentable, and this is the check that says so.
  const fam = STATUS_TOKENS['healthy']!;
  for (const token of [...fam.top, fam.side]) {
    for (let x = -0.25; x <= 1.25; x += 0.002) {
      const c = bandedColour(token, x);
      const read = statusFamilyOf(c);
      assert.equal(
        read,
        'healthy',
        `healthy token ${token} at lambert ${x} delivered ${toHex(c)}, which reads ${read}`,
      );
    }
  }
});

test('statusFamilyOf REFUSES a colour that is not on the palette (it is not a nearest-match)', () => {
  assert.equal(statusFamilyOf({ r: 255, g: 0, b: 255 }), null);
  assert.equal(statusFamilyOf({ r: 1, g: 2, b: 3 }), null);
});

// --- the GLSL half must be DERIVED, not a second hand-typed copy ---------------

test('the GLSL ladder is derived from SHADE_LEVELS — every level appears verbatim', () => {
  const src = bandGlsl();
  for (const level of SHADE_LEVELS) {
    assert.ok(
      src.includes(level.toFixed(6)),
      `the GLSL does not carry level ${level} — the shader and the test have forked`,
    );
  }
  assert.ok(
    src.includes(`ST_N_LEVELS = ${SHADE_LEVELS.length}`),
    'the GLSL level COUNT is not derived from SHADE_LEVELS',
  );
});

test('the GLSL carries no level the TS ladder does not have', () => {
  const src = bandGlsl();
  const authored = new Set(SHADE_LEVELS.map((l) => l.toFixed(6)));
  const found = src.match(/\b\d\.\d{6}\b/g) ?? [];
  assert.ok(found.length > 0, 'no ladder constants found in the GLSL — the parser is broken');
  for (const f of found) {
    assert.ok(authored.has(f), `the GLSL carries ${f}, which is not an authored level`);
  }
});

// --- the token transcription --------------------------------------------------

test('every authored token parses as #rrggbb', () => {
  for (const token of landTokens()) {
    const c = parseHex(token);
    assert.equal(toHex(c), token.toLowerCase(), `${token} did not round-trip`);
  }
});

test('parseHex REFUSES a malformed token rather than guessing a colour', () => {
  assert.throws(() => parseHex('8cb85e'), /not a #rrggbb token/);
  assert.throws(() => parseHex('#8cb85'), /not a #rrggbb token/);
  assert.throws(() => parseHex('rebeccapurple'), /not a #rrggbb token/);
});


// --- the two families the island grew on 2026-08-20 ---------------------------
//
// The island learned to draw UAT flowers and a story tree, and both bring authored colours the
// land family never held. The fence stays a fence only if those colours are DECLARED — a palette
// with an exception is a palette that has stopped being closed — so these assertions are about
// declaration and attribution rather than about the art.

test('the flower and tree families are inside the closed palette, not exceptions to it', () => {
  const palette = new Set(landPalette());
  const tokens = new Set(landTokens());
  for (const token of Object.values(MARKER_TOKENS)) {
    assert.ok(tokens.has(token), `the flower token ${token} is not declared`);
    for (const c of paletteImageOfToken(token)) {
      assert.ok(palette.has(toHex(c)), `${token} can deliver ${toHex(c)}, which is off-palette`);
    }
  }
  for (const fam of Object.values(TREE_TOKENS)) {
    assert.ok(tokens.has(fam.crown), `the crown token ${fam.crown} is not declared`);
  }
  for (const token of Object.values(SHARED_TOKENS)) {
    assert.ok(tokens.has(token), `the shared token ${token} is not declared`);
  }
});

test('a CROWN colour attributes to its own status — the tree says what the ground says', () => {
  // The crown is status-bearing art: `--crown-healthy-lo` claims healthy exactly as the ground
  // does. If it ever attributed to another family, a tree would be contradicting the island it
  // stands on, which is the foreign-status read this whole module exists to make unrepresentable.
  for (const [status, fam] of Object.entries(TREE_TOKENS)) {
    for (const c of paletteImageOfToken(fam.crown)) {
      const read = statusFamilyOf(c);
      // `building` and `unknown` share the app's unset default, so a colour from that pair may
      // legitimately attribute to either. Every other status must attribute to itself.
      const acceptable = status === 'building' || status === 'unknown' ? ['building', 'unknown'] : [status];
      assert.ok(
        read !== null && acceptable.includes(read),
        `${status}'s crown can deliver ${toHex(c)}, which reads as ${read}`,
      );
    }
  }
});

test('a FLOWER colour attributes to NO status, and that is the design (ADR-0226 D4)', () => {
  // A flower's verdict is its FORM. Giving its colour a status family would invent a second
  // channel saying something the form already says — and saying it about the PARCEL rather than
  // about the criterion, which is a different claim entirely.
  for (const token of Object.values(MARKER_TOKENS)) {
    for (const c of paletteImageOfToken(token)) {
      assert.equal(statusFamilyOf(c), null, `${token} delivers ${toHex(c)}, which reads as a status`);
    }
  }
});

test('the FAMILY-LESS set is exactly the tokens that discriminate no status', () => {
  // The set a foreign-status audit subtracts before asking anything. If it were wider than this,
  // the audit would stop seeing real defects; if narrower, every island with a flower on it would
  // report one.
  const familyless = new Set(familylessTokens());
  assert.ok(familyless.has(SHARED_TOKENS.wheat), 'wheat is one shared override every status wears');
  assert.ok(familyless.has(SHARED_TOKENS.storyTrunk), 'so is the story tree’s bole');
  for (const token of Object.values(MARKER_TOKENS)) assert.ok(familyless.has(token));
  for (const fam of Object.values(STATUS_TOKENS)) {
    for (const token of [...fam.top, fam.side]) {
      assert.ok(!familyless.has(token), `${token} is status-bearing and must NOT be excused`);
    }
  }
  for (const fam of Object.values(TREE_TOKENS)) {
    assert.ok(!familyless.has(fam.crown), 'a crown is status-bearing and must NOT be excused');
  }
  // And its delivered image is a subset of the palette, so subtracting it can never hide an
  // off-palette colour.
  const palette = new Set(landPalette());
  for (const hex of familylessPalette()) assert.ok(palette.has(hex));
});

test('NON-VACUITY: the flower tokens really are OUTSIDE the pre-2026-08-20 land family', () => {
  // Without this, the two tests above would still pass if a flower had quietly been given a
  // ground token — the palette would close and nothing would attribute wrongly, because nothing
  // new would have been added at all.
  const landOnly = new Set<string>();
  for (const fam of Object.values(STATUS_TOKENS)) {
    for (const t of [...fam.top, fam.wheat, fam.side]) landOnly.add(t);
  }
  for (const token of Object.values(MARKER_TOKENS)) {
    assert.ok(!landOnly.has(token), `${token} is a ground token wearing a flower’s name`);
  }
  for (const fam of Object.values(TREE_TOKENS)) {
    assert.ok(!landOnly.has(fam.crown), `${fam.crown} is a ground token wearing a crown’s name`);
  }
});
