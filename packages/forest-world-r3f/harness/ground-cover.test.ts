// ground-cover.test.ts — the scenery covers, and the instrument that decides whether one of
// them can be read as a capability's proof state.
//
// THE TEST THIS FILE IS REALLY FOR is `the distance is the arc's own, not a new one`. Every
// separation figure this increment publishes is read against numbers other passes measured —
// the worst matched pair, the shipped app's 4.32, a shade rung — and a table gives a reader no
// way at all to tell one colour metric from another. If this module's distance drifted from the
// quantiser's luma-weighted space, every number beside it would still LOOK comparable and would
// silently not be. So the metric is anchored against a figure published by a different pass, in
// a different language, from a different pipeline.
//
// The second load-bearing one is `a colliding cover FAILS`. A bar nothing can fall below is not
// a bar, and the whole point of authoring `YELLOW_GRASS` against a measurement is that the
// measurement could have refused it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GROUND_COVERS,
  LUMA_WEIGHTS,
  SEPARATION_FLOOR,
  YELLOW_GRASS,
  colourDistance,
  coverPalette,
  coverTokenFor,
  coverTokens,
  coverVerdict,
  describeToken,
  luma,
  separationOf,
  shadeRungGaps,
  worstStatusPair,
} from './ground-cover.js';
import {
  SHADE_LEVELS,
  STATUS_TOKENS,
  deliveredForLevel,
  landPalette,
  paletteImageOfToken,
  parseHex,
  toHex,
} from './palette-band.js';

// --- the metric ------------------------------------------------------------------------------

test('the distance is the arc\'s own, not a new one', () => {
  // THE ANCHOR. `docs/research/chapter2-palette-foreign-status-2026-08-18/README.md` publishes
  // the shipped app's worst matched pair as **4.32 dE**, between `#9ac570` (`healthy`) and
  // `#9fc174` (`unknown`), measured by `palette_read.py`'s `dist` in numpy against `compose.py`'s
  // `W_LUMA`. This module is a hand transcription of that arithmetic into TypeScript. If the two
  // ever disagree, every figure this increment reports becomes incomparable to every figure the
  // arc has already published — while still reading as the same kind of number.
  const d = colourDistance(parseHex('#9ac570'), parseHex('#9fc174'));
  assert.ok(
    Math.abs(d - 4.32) < 0.005,
    `the transcribed distance gives ${d.toFixed(4)} where the 2026-08-18 pass published 4.32`,
  );
});

test('the luma weights are the quantiser\'s and sum to one', () => {
  assert.deepEqual([...LUMA_WEIGHTS], [0.3, 0.59, 0.11]);
  assert.ok(Math.abs(LUMA_WEIGHTS.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // Not Rec.709 (0.2126 / 0.7152 / 0.0722) — the difference is small enough to pass unnoticed in
  // a table and large enough to move a verdict, which is why it is asserted rather than trusted.
  assert.notEqual(LUMA_WEIGHTS[1], 0.7152);
  assert.equal(luma({ r: 255, g: 255, b: 255 }), 255);
  assert.equal(luma({ r: 0, g: 0, b: 0 }), 0);
});

// --- matched condition -----------------------------------------------------------------------

test('separation is measured at MATCHED CONDITION, and the darkest rung is the worst', () => {
  // The claim the module's header makes: a token times a level is linear, so a pair's distance
  // shrinks with the rung, and measuring only the lit swatch OVER-REPORTS every separation. This
  // asserts the direction rather than restating the ratio, because the ratio is the ladder's and
  // the ladder may move.
  const s = separationOf(YELLOW_GRASS);
  const fam = STATUS_TOKENS.get(s.nearest)!;
  const atFullLight = Math.min(
    ...fam.top.map((t) => colourDistance(deliveredForLevel(YELLOW_GRASS, 1), deliveredForLevel(t, 1))),
  );
  assert.ok(
    atFullLight > s.distance,
    `full light gives ${atFullLight.toFixed(2)} and matched condition ${s.distance.toFixed(2)} — ` +
      'if these are equal the minimum is no longer being taken over the ladder',
  );
  // ⚠ THE MINIMUM LANDS IN THE DARK HALF OF THE LADDER, NOT ON ONE NAMED RUNG. Scaling is
  // linear, so 0.78 should always win — but `deliveredForLevel` ROUNDS to integer channels, and
  // 0.78 and 0.80 are only 2.5% apart, so a rounding of half a unit per channel is enough to
  // flip which of the two is closer. `#b0b040` is minimal at 0.80 and `#d6b271` at 0.78. An
  // assertion naming one rung would be a coincidence wearing a claim's clothes.
  assert.match(s.at, /at level 0\.(78|8)$/);
  // And the figure is a real minimum over every family, not the first one it met.
  assert.equal(s.distance, Math.min(...Object.values(s.per)));
  assert.equal(Object.keys(s.per).length, STATUS_TOKENS.size);
});

test('the ladder\'s first step is far shallower than the rest, so "a rung" is not one number', () => {
  // Read for the report: `SHADE_LEVELS` is [0.78, 0.80, 0.90, 1.00], so the first gap is a fifth
  // of the others. A separation quoted against "one shade rung" means very different things
  // depending on which rung, and this is what stops the README quoting the flattering one.
  const gaps = shadeRungGaps(YELLOW_GRASS);
  assert.equal(gaps.length, SHADE_LEVELS.length - 1);
  assert.ok(gaps[0]! < gaps[1]! / 3, `first gap ${gaps[0]} is not far shallower than ${gaps[1]}`);
  // And the shallow one is quieter than the bar every separation is quoted against — so
  // "further apart than one shade rung" is a claim that is true or false depending entirely on
  // which rung is meant, which is why the report prints all three gaps rather than an average.
  assert.ok(gaps[0]! < SEPARATION_FLOOR, `the shallowest rung ${gaps[0]} is no longer under the bar`);
  assert.ok(gaps[1]! > SEPARATION_FLOOR * 2, `the deep rungs should dwarf the bar`);
});

test('the closest two DIFFERENT statuses are proposed and mapped', () => {
  // THE DENOMINATOR every separation in the report is read against: how quietly the map already
  // draws a MEANINGFUL difference.
  //
  // ⚠ IT WAS `healthy`/`unknown` AT **3.33** UNTIL 2026-08-27 — the 2026-08-18 pass's headline
  // defect, a parcel asserting a signed pass and a parcel asserting nothing. ADR-0462 gave
  // `unknown` its own slate and the pair is now 24.55 apart, which moves the worst meaningful
  // pair onto `proposed`/`mapped` at 14.23: unproven greenfield against inherited brownfield,
  // and the whole remaining scope of `pull-the-four-land-colours-apart-in-hue`.
  const worst = worstStatusPair();
  assert.deepEqual([worst.a, worst.b].sort(), ['mapped', 'proposed']);
  assert.ok(Math.abs(worst.distance - 14.23) < 0.01, `worst pair moved to ${worst.distance.toFixed(2)}`);
  // AND THE COMPARISON WITH THE SCENERY BAR HAS INVERTED, which is worth an assertion rather than
  // a comment because it is the sentence `YELLOW_GRASS`'s docstring had to be corrected for. The
  // worst meaningful pair used to be QUIETER than the bar a scenery colour is held to; it is now
  // nearly twice it. Improving the status vocabulary raises the standard scenery is judged by.
  assert.ok(worst.distance > SEPARATION_FLOOR, 'the worst meaningful pair is no longer under the scenery bar');
});

test('`proposed` and `building` are ONE colour asked twice, and the instrument knows it', () => {
  // Without the shared-family skip in `worstStatusPair`, ADR-0462's deliberate merge would report
  // as a distance of exactly 0 — the map's worst possible defect — and would MASK the pair that
  // really is closest. The skip is keyed on the tokens, so this test is what proves the two
  // statuses actually do share a family rather than merely being listed as merged somewhere.
  const proposed = STATUS_TOKENS.get('proposed')!;
  const building = STATUS_TOKENS.get('building')!;
  assert.deepEqual([...building.top], [...proposed.top], 'building must wear proposed’s ground family');
  assert.equal(building.side, proposed.side);
  const worst = worstStatusPair();
  assert.notDeepEqual([worst.a, worst.b].sort(), ['building', 'proposed']);
  assert.ok(worst.distance > 0);
});

// --- the bar ---------------------------------------------------------------------------------

test('the floor is still the shipped wheat override\'s own separation', () => {
  // ⚠ THE BAR IS A LITERAL ON PURPOSE. Computing it from `wheat` at call time would make wheat
  // pass by construction and would let a change to EITHER token re-baseline the bar in silence.
  // Pinning it means a moved token REDS here, where a human decides, instead of quietly moving
  // what every later cover is held to.
  const wheat = separationOf(STATUS_TOKENS.get('healthy')!.wheat);
  assert.equal(wheat.nearest, 'proposed');
  // Rounded DOWN, so the colour that DEFINES the bar sits inside it — see the constant's note.
  // Both directions are asserted: below the floor means wheat got worse and the bar is now
  // stricter than its own source; more than a hundredth above means a token moved and the bar is
  // quietly looser than what ships.
  assert.ok(wheat.distance >= SEPARATION_FLOOR, `wheat now measures ${wheat.distance.toFixed(4)}`);
  assert.ok(
    wheat.distance - SEPARATION_FLOOR < 0.01,
    `wheat now measures ${wheat.distance.toFixed(4)} against a pinned floor of ${SEPARATION_FLOOR} — ` +
      'a token moved; decide what the bar should be rather than re-pinning it reflexively',
  );
  // The reference is never a candidate, but it must still not be reported as failing itself.
  assert.equal(coverVerdict(STATUS_TOKENS.get('healthy')!.wheat).ok, true);
});

test('the authored yellow grass clears the bar', () => {
  const v = coverVerdict(YELLOW_GRASS);
  assert.equal(v.ok, true, `${YELLOW_GRASS} measures ${v.separation.distance.toFixed(2)} against ${v.floor}`);
  assert.ok(v.margin > 0);
  assert.equal(v.separation.nearest, 'proposed');
  // ⚠ AND IT IS ACTUALLY YELLOW. The luma weights put 59% of every distance on the green channel,
  // so "get further from the status families" is cheapest to satisfy by leaving yellow for green
  // — which is what the first authored token did, scoring 11.96 and rendering olive. The hue is
  // therefore pinned rather than left to the search: red equal to green is 60 degrees exactly.
  const rgb = parseHex(YELLOW_GRASS);
  assert.equal(rgb.r, rgb.g, `${YELLOW_GRASS} is not hue-60 yellow — r ${rgb.r} vs g ${rgb.g}`);
  assert.ok(rgb.b < rgb.g * 0.6, 'a grass with that much blue is not dry');
});

test('a colliding cover FAILS — the bar is not vacuous', () => {
  // ANTI-VACUITY, with real candidates rather than an invented black. Both of these are natural
  // straw yellows a session would plausibly reach for by eye, and both are measurably closer to
  // `proposed` than the colour the app already ships. They are the reason the token above was
  // authored against a number.
  for (const naive of ['#cdc36d', '#d4cf76', '#d9d18a']) {
    const v = coverVerdict(naive);
    assert.equal(v.ok, false, `${naive} was expected to collide but measured ${v.separation.distance.toFixed(2)}`);
    assert.equal(v.separation.nearest, 'proposed');
  }
  // And the curve is continuous rather than a cliff: the palest yellow that still reads as grass
  // lands ON the bar, which is the whole reason the authored token is a mustard and not a straw.
  const pale = coverVerdict('#c6c06a');
  assert.ok(
    Math.abs(pale.separation.distance - SEPARATION_FLOOR) < 0.02,
    `#c6c06a measures ${pale.separation.distance.toFixed(2)}, no longer sitting on the bar`,
  );
});

// --- the cover mechanism ---------------------------------------------------------------------

test('wheat is read per-status from STATUS_TOKENS, unhealthy included', () => {
  // The override is not restated here, so the two copies cannot drift. `unhealthy` carrying a
  // different, duller token is the one place the shipped app already refuses to put a bright
  // gold field on a failing capability, and a cover that flattened that would be a regression
  // dressed as a simplification.
  for (const status of STATUS_TOKENS.keys()) {
    assert.equal(coverTokenFor('wheat', status), STATUS_TOKENS.get(status)!.wheat);
  }
  assert.equal(coverTokenFor('wheat', 'unhealthy'), '#6f6852');
  assert.notEqual(coverTokenFor('wheat', 'unhealthy'), coverTokenFor('wheat', 'healthy'));
  // An unrecognised status falls back rather than throwing — the ground must always draw.
  assert.equal(coverTokenFor('wheat', 'not-a-status'), STATUS_TOKENS.get('unknown')!.wheat);
});

test('yellow grass is ONE token for every status — it reports nothing about the capability', () => {
  for (const status of STATUS_TOKENS.keys()) {
    assert.equal(coverTokenFor('yellowGrass', status), YELLOW_GRASS);
  }
  assert.deepEqual(coverTokens('yellowGrass'), [YELLOW_GRASS]);
  assert.deepEqual(coverTokens('wheat').sort(), ['#6f6852', '#d6b271']);
});

test('the palette widening is EXACTLY the yellow grass and nothing else', () => {
  // THE FENCE CLAIM, and it is the reason this module keeps its own palette function. Every
  // colour the WHEAT cover can deliver is already inside `landPalette()` — wheat is an authored
  // status token — so the cover page's union widens the audited pages' fence by the yellow
  // grass's four rungs and by no other entry. Asserted in both directions: the wheat half must
  // be fully contained, and the yellow half must be fully absent, or this is not a widening of
  // known size.
  const land = new Set(landPalette());
  const cover = coverPalette();
  const added = cover.filter((c) => !land.has(c));
  const yellow = paletteImageOfToken(YELLOW_GRASS).map(toHex).sort();
  assert.deepEqual(added.sort(), yellow, 'the cover palette adds something other than the yellow grass');
  for (const token of coverTokens('wheat')) {
    for (const c of paletteImageOfToken(token)) {
      assert.ok(land.has(toHex(c)), `${toHex(c)} from wheat token ${token} is not already in landPalette()`);
    }
  }
  // And the widening is the whole ladder, not one lit swatch.
  assert.equal(yellow.length, SHADE_LEVELS.length);
});

test('the two covers are visibly different fields, not two names for one colour', () => {
  // A comparison whose arms are secretly the same scene reports "no difference" with the calm
  // authority of a real measurement. This is the pure half of that guard; `cover-measure.mjs`
  // carries the delivered-pixel half.
  const d = Math.min(
    ...SHADE_LEVELS.map((l) =>
      colourDistance(deliveredForLevel('#d6b271', l), deliveredForLevel(YELLOW_GRASS, l)),
    ),
  );
  assert.ok(d > SEPARATION_FLOOR * 2, `wheat and yellow grass are only ${d.toFixed(2)} apart`);
});

test('every cover is enumerated and describable', () => {
  assert.deepEqual([...GROUND_COVERS], ['wheat', 'yellowGrass']);
  for (const cover of GROUND_COVERS) {
    assert.ok(coverTokens(cover).length > 0);
    for (const token of coverTokens(cover)) {
      const d = describeToken(token);
      assert.equal(toHex(d.rgb), token);
      assert.ok(d.luma > 0 && d.luma < 255);
    }
  }
});
