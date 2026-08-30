// shadow-rung.test.ts — HOW DARK MAY A SHADOW GO, proved without a browser.
//
// THE TEST THIS FILE IS REALLY FOR is `the shipped palette's deepest admissible rung is 0.77`.
// Everything else is arithmetic that supports it. That number is the whole increment's ceiling:
// one rung below it the `proposed`/`building` yellow reads as `healthy` green, which is a
// merely-proposed capability reporting as signed-off — the one direction this surface may not be
// wrong in (ADR-0392 D5 / ADR-0398 D7, ADR-0367 D5).
//
// ⚠ THE GOLDENS SIT BESIDE THE PROPERTIES ON PURPOSE. A property test says the code is
// CORRECT; it does not pin WHICH implementation is running, so a mutant that changes a constant
// while preserving monotonicity survives it. The mutation rung charges a crossed module its whole
// file, so both are here: the properties for the argument, the goldens for the instance.
//
// ⚠ AND THE REFERENCE RUNG IS 0.90, WHICH IS THE ONE THING TO GET RIGHT. Built at full light
// instead, this instrument reports the ORDINARY SHIPPED GROUND as already misreporting on four
// rungs — a false alarm shaped exactly like a live defect. `flat ground is delivered at 0.90` is
// the test that stops that.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SHADE_LEVELS, deliveredForLevel, rungOfNormal, toHex } from './shade-ladder.js';
import {
  W_LUMA,
  colourDistance2,
  deepestAdmissibleRung,
  flatGroundLevel,
  nearestReference,
  readMargin,
  readerReferences,
  probeCount,
  rungsDarkenedBy,
  shadowLadderFor,
} from './shadow-rung.js';

/** The shipped canvas's own `GROUND_COLOUR` values, in its own order. Transcribed rather than
 *  imported because `ForestWorldCanvas.tsx` imports three and this test must stay node-provable;
 *  `harness/palette-transcription.test.ts` is what holds the three copies of this vocabulary to
 *  each other. The DUPLICATE yellow is deliberate — ADR-0462 merged `building` into `proposed`. */
const SHIPPED_TOKENS = ['#8cb85e', '#b7684e', '#d8c069', '#d8c069', '#57544a', '#9ca3af'] as const;

test('the channel weighting is the compositor’s, verbatim — the port’s whole provenance', () => {
  // Not a new choice made here: `chapter2-land-interior-fork-2026-08-15/compose.py:140`. If this
  // drifts, this module has stopped measuring confusability and started measuring its own taste.
  assert.deepEqual([...W_LUMA], [0.3, 0.59, 0.11]);
  assert.ok(Math.abs(W_LUMA[0] + W_LUMA[1] + W_LUMA[2] - 1) < 1e-12, 'the weights must sum to 1');
});

test('the distance is symmetric, zero on itself, and weights green hardest', () => {
  const a = { r: 10, g: 20, b: 30 };
  const b = { r: 40, g: 60, b: 90 };
  assert.equal(colourDistance2(a, a), 0);
  assert.equal(colourDistance2(a, b), colourDistance2(b, a));
  // 0.3*900 + 0.59*1600 + 0.11*3600 = 270 + 944 + 396
  assert.ok(Math.abs(colourDistance2(a, b) - 1610) < 1e-9);
  const base = { r: 0, g: 0, b: 0 };
  const red = colourDistance2(base, { r: 10, g: 0, b: 0 });
  const green = colourDistance2(base, { r: 0, g: 10, b: 0 });
  const blue = colourDistance2(base, { r: 0, g: 0, b: 10 });
  assert.ok(green > red && red > blue, 'green must dominate, blue must be cheapest');
});

test('FLAT GROUND IS DELIVERED AT 0.90, and it is derived rather than typed', () => {
  // ⚠ THE CORRECTION THAT INVENTS A SCANDAL IF IT IS MISSED. The live renderer never delivers
  // flat ground at `token x 1.0` — a flat up-normal lands on this rung — so a reader table built
  // at full light compares every delivered pixel against a colour the map cannot draw.
  assert.equal(flatGroundLevel(), 0.9);
  assert.equal(flatGroundLevel(), SHADE_LEVELS[rungOfNormal({ x: 0, y: 1, z: 0 })]);
  assert.ok(flatGroundLevel() < 1, 'full light is NOT what flat ground wears');
  // Memoised: the second call must be the same number, not a recomputation that could differ.
  assert.equal(flatGroundLevel(), flatGroundLevel());
});

test('the reader’s references are DEDUPED BY HEX — the shared yellow is one colour, not two', () => {
  const refs = readerReferences(SHIPPED_TOKENS);
  assert.equal(SHIPPED_TOKENS.length, 6, 'six authored rows');
  assert.equal(refs.length, 5, 'five distinct colours — `proposed` and `building` share one');
  assert.deepEqual(
    refs.map((r) => r.hex),
    ['#8cb85e', '#b7684e', '#d8c069', '#57544a', '#9ca3af'],
  );
  // ⚠ WITHOUT THE DEDUPE the palette condemns itself as it already ships: one of the pair always
  // wins the tie, so every yellow pixel reads as "a foreign status" at every rung.
  assert.equal(deepestAdmissibleRung([...SHIPPED_TOKENS, '#d8c069']), 0.77);
});

test('the references are built at the FLAT GROUND rung, not at full light', () => {
  const refs = readerReferences(['#8cb85e']);
  assert.equal(toHex(refs[0]!.colour), toHex(deliveredForLevel('#8cb85e', 0.9)));
  assert.notEqual(toHex(refs[0]!.colour), '#8cb85e');
});

test('a delivered colour reads as its own token at every SHIPPED rung — the map is honest today', () => {
  const refs = readerReferences(SHIPPED_TOKENS);
  for (const token of refs) {
    for (const level of SHADE_LEVELS) {
      assert.equal(
        nearestReference(deliveredForLevel(token.hex, level), refs),
        token.hex,
        `${token.hex} at ${level} reads as another token`,
      );
    }
  }
});

test('THE MARGIN: the tightest reading on the shipped ladder is 3.0 weighted units', () => {
  // The yellow at the ladder's darkest rung, against `healthy`'s green. It HOLDS — but with
  // almost nothing to spare, and this is the budget every future colour effect competes for.
  const refs = readerReferences(SHIPPED_TOKENS);
  const margin = readMargin(deliveredForLevel('#d8c069', 0.78), '#d8c069', refs);
  assert.ok(Math.abs(margin - 3.0) < 0.05, `tightest margin moved: ${margin}`);
  // And the loosest, so the number above reads as a floor rather than as the only one measured.
  const loose = readMargin(deliveredForLevel('#b7684e', 0.9), '#b7684e', refs);
  assert.ok(loose > 45, `the loosest margin should be ~49.6, got ${loose}`);
});

test('a colour ON a reference has a positive margin; one darkened past the ceiling does not', () => {
  const refs = readerReferences(SHIPPED_TOKENS);
  assert.ok(readMargin(deliveredForLevel('#d8c069', 0.9), '#d8c069', refs) > 0);
  assert.ok(
    readMargin(deliveredForLevel('#d8c069', 0.7), '#d8c069', refs) < 0,
    'NON-VACUITY: the margin must be able to go negative, or it measures nothing',
  );
});

test('THE ANSWER: the shipped palette’s deepest admissible rung is 0.77', () => {
  assert.equal(deepestAdmissibleRung(SHIPPED_TOKENS), 0.77);
});

test('one rung deeper, the yellow reads as HEALTHY — which is what 0.77 is a ceiling on', () => {
  const refs = readerReferences(SHIPPED_TOKENS);
  assert.equal(nearestReference(deliveredForLevel('#d8c069', 0.77), refs), '#d8c069');
  assert.equal(
    nearestReference(deliveredForLevel('#d8c069', 0.76), refs),
    '#8cb85e',
    'a merely-proposed capability reporting as signed-off',
  );
});

test('the sweep BREAKS at the first failure rather than looking past it', () => {
  // A rung reachable only by passing THROUGH an inadmissible one is not a ceiling. The yellow
  // fails at 0.76; nothing below it may be returned even if some deeper level reads correctly.
  const answer = deepestAdmissibleRung(SHIPPED_TOKENS);
  assert.ok(answer !== null && answer > 0.76);
  // A coarser step must still land above the first failure.
  const coarse = deepestAdmissibleRung(SHIPPED_TOKENS, 0.05);
  assert.ok(coarse !== null && coarse > 0.76, `coarse sweep returned ${coarse}`);
});

test('THE REFUSAL: a palette with no admissible rung throws rather than shipping a lie', () => {
  // Two greys ONE channel unit apart: the first step down already lands the lighter one nearer the
  // darker one's reference, so no level below flat ground has both reading as themselves.
  const confusable = ['#808080', '#7f7f7f'];
  assert.equal(deepestAdmissibleRung(confusable), null);
  assert.throws(() => shadowLadderFor(confusable), /cannot be drawn inside this closed palette/);
});

test('NON-VACUITY: the same call on the shipped palette does NOT throw', () => {
  // Without this, the refusal above is equally satisfied by a function that always throws.
  assert.equal(shadowLadderFor(SHIPPED_TOKENS).rung, 0.77);
});

test('the shadow ladder is the authored one plus exactly one entry, sorted', () => {
  const ladder = shadowLadderFor(SHIPPED_TOKENS);
  assert.deepEqual([...ladder.levels], [0.77, 0.78, 0.8, 0.9, 1]);
  assert.equal(ladder.levels.length, SHADE_LEVELS.length + 1);
  const ascending = [...ladder.levels].sort((a, b) => a - b);
  assert.deepEqual([...ladder.levels], ascending, 'the ladder must be ascending');
  assert.equal(ladder.rungIndex, 0);
  assert.equal(ladder.levels[ladder.rungIndex], ladder.rung);
});

test('the lit remap is a LOOKUP, not an offset — every lit rung finds its own level again', () => {
  // The property that survives a palette move: whatever the sorted ladder turns out to be, index
  // `litIndex[i]` of it must hold exactly `SHADE_LEVELS[i]`. An offset would satisfy today's
  // numbers and silently paint the wrong colour the day the rung lands mid-ladder.
  const ladder = shadowLadderFor(SHIPPED_TOKENS);
  assert.equal(ladder.litIndex.length, SHADE_LEVELS.length);
  SHADE_LEVELS.forEach((level, i) => {
    assert.equal(ladder.levels[ladder.litIndex[i]!], level, `lit rung ${i} remaps wrong`);
  });
  assert.deepEqual([...ladder.litIndex], [1, 2, 3, 4]);
});

test('a shadow darkens only rungs LIGHTER than itself — it never brightens a surface', () => {
  const ladder = shadowLadderFor(SHIPPED_TOKENS);
  for (const i of ladder.darkenable) {
    assert.ok(SHADE_LEVELS[i]! > ladder.rung, `rung ${i} is not lighter than the shadow`);
  }
  for (let i = 0; i < SHADE_LEVELS.length; i += 1) {
    if (ladder.darkenable.includes(i)) continue;
    assert.ok(SHADE_LEVELS[i]! <= ladder.rung, `rung ${i} is lighter but was not darkenable`);
  }
  // On this palette every authored rung is lighter than 0.77, so all four darken.
  assert.deepEqual([...ladder.darkenable], [0, 1, 2, 3]);
});

test('a malformed token FAILS where it can be named, not as a silent black reference', () => {
  assert.throws(() => readerReferences(['not-a-hex']));
});

// ---------------------------------------------------------------------------
// THE EDGES the properties above do not reach: an empty table, a tie, the sweep's own two bounds,
// and the rung boundary that only an argument can put on an authored level.
// ---------------------------------------------------------------------------

test('a reader with NO references reads nothing rather than something arbitrary', () => {
  // `let best = ''` is the answer for an empty table, and it has to be the EMPTY string: any other
  // initial value is a token this palette does not contain, returned as if it had been found.
  assert.equal(nearestReference({ r: 1, g: 2, b: 3 }, []), '');
});

test('a TIE goes to the FIRST reference — what `numpy.argmin` over a stacked table does', () => {
  // ⚠ `d < bestD` and `d <= bestD` differ only here, and the difference is which of two equally
  // near statuses a delivered colour is reported as. The compositor's port resolved ties forward;
  // so does this.
  const refs = [
    { hex: '#aa0000', colour: { r: 100, g: 0, b: 0 } },
    { hex: '#bb0000', colour: { r: 120, g: 0, b: 0 } },
  ];
  assert.equal(nearestReference({ r: 110, g: 0, b: 0 }, refs), '#aa0000');
  // And the reverse ordering flips it, so the assertion above is about the RULE rather than about
  // which hex happens to be nearer.
  assert.equal(nearestReference({ r: 110, g: 0, b: 0 }, [...refs].reverse()), '#bb0000');
});

test('the sweep starts BELOW flat ground and stops at its floor', () => {
  // ⚠ `flatGroundLevel() - step` and `+ step` both produce a sweep; the second one starts ABOVE
  // the reference rung and would return a "shadow" LIGHTER than the ground it darkens.
  const answer = deepestAdmissibleRung(SHIPPED_TOKENS);
  assert.ok(answer !== null && answer < flatGroundLevel(), `a shadow rung must be darker: ${answer}`);
  // The STEP is honoured rather than fixed: a coarse sweep lands on a coarse grid.
  assert.equal(deepestAdmissibleRung(SHIPPED_TOKENS, 0.05), 0.8);
  // And so is the FLOOR: raise it above the natural answer and the sweep stops there instead.
  assert.equal(deepestAdmissibleRung(SHIPPED_TOKENS, 0.01, 0.8), 0.81);
});

test('a rung that COINCIDES with an authored level darkens nothing at that level', () => {
  // ⚠ THE CASE THE DERIVED RUNG CAN NEVER PRODUCE, which is why this is asked of the exported
  // helper rather than through `shadowLadderFor`. `level > rung` and `level >= rung` agree at
  // every rung the sweep returns, and disagree exactly here — where darkening a level onto ITSELF
  // would be a shadow that changed nothing while claiming to.
  assert.deepEqual(rungsDarkenedBy(0.8), [2, 3], 'only 0.90 and 1.00 are lighter than 0.80');
  assert.deepEqual(rungsDarkenedBy(0.78), [1, 2, 3], 'the darkest authored level is not darkened');
  assert.deepEqual(rungsDarkenedBy(0.77), [0, 1, 2, 3], 'the derived rung darkens all four');
  assert.deepEqual(rungsDarkenedBy(1), [], 'a rung at full light darkens nothing');
  // It reads the ladder it is given, so a palette with different levels gets a different answer.
  assert.deepEqual(rungsDarkenedBy(0.5, [0.4, 0.5, 0.6]), [2]);
});

test('the refusal SAYS what to do about it, and does not merely fail', () => {
  // An error message is source too. Blanked to an empty string it still throws, still passes a
  // bare `assert.throws`, and tells whoever hits it nothing — least of all that the remedy is a
  // palette change rather than a shallower shadow.
  assert.throws(
    () => shadowLadderFor(['#808080', '#7f7f7f']),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      assert.match(message, /^shadow-rung: /, 'the module that refused');
      assert.match(message, /NO ladder level below flat ground is admissible/);
      assert.match(message, /hue separation between the status tokens/, 'the remedy');
      assert.match(message, /not a shallower shadow and not a wider palette/, 'the two non-remedies');
      return true;
    },
  );
});

test('the ladder’s own arithmetic is derived from the levels rather than assumed', () => {
  const ladder = shadowLadderFor(SHIPPED_TOKENS);
  // Every index the material will use has to be a real index into the ramp it will upload.
  assert.ok(ladder.rungIndex >= 0 && ladder.rungIndex < ladder.levels.length);
  for (const i of ladder.litIndex) {
    assert.ok(i >= 0 && i < ladder.levels.length, `lit index ${i} is off the ladder`);
  }
  for (const i of ladder.darkenable) {
    assert.ok(i >= 0 && i < SHADE_LEVELS.length, `darkenable index ${i} is off the authored ladder`);
  }
  // The shadow rung is NOT one of the authored levels — a shadow reachable by lighting alone
  // would be a shadow nobody could tell from a steep face.
  assert.ok(!SHADE_LEVELS.includes(ladder.rung));
});

test('the sweep probes ENOUGH levels to reach its own answer', () => {
  // ⚠ THE `+ 1` ON THE PROBE COUNT IS LOAD-BEARING AT SOME FLOORS AND SLACK AT OTHERS, so it is
  // asked at one where it binds: a floor of 0.835 puts the answer on the LAST index the count
  // provides, and a count two short stops at 0.85 instead of 0.84.
  assert.equal(deepestAdmissibleRung(SHIPPED_TOKENS, 0.01, 0.835), 0.84);
});

test('the probe count spans the sweep INCLUSIVELY, and reads both of its ends', () => {
  // The count is a bound on a loop that breaks on its own condition, so only its ends are
  // observable through the answer. Read directly, all three arguments are.
  assert.equal(probeCount(0.89, 0.8, 0.01), 10);
  assert.equal(probeCount(0.89, 0.87, 0.01), 4);
  assert.equal(probeCount(0.89, 0.835, 0.01), 7);
  // A wider gap needs more probes; a coarser step needs fewer.
  assert.ok(probeCount(0.89, 0.3, 0.01) > probeCount(0.89, 0.8, 0.01));
  assert.ok(probeCount(0.89, 0.3, 0.05) < probeCount(0.89, 0.3, 0.01));
});
