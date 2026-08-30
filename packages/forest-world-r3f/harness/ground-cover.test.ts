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
  LEGACY_SHADE_LEVELS,
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

test('⚠ THE LADDER\'S STEPS ARE NOW EVEN — the finding this test recorded was cured by the adoption', () => {
  // ⚠⚠ THIS TEST USED TO SAY THE OPPOSITE, AND THE CHANGE IS THE POINT. On the four-rung ladder
  // [0.78, 0.80, 0.90, 1.00] the first gap was a FIFTH of the others, so "further apart than one
  // shade rung" was a claim that was true or false depending entirely on which rung was meant —
  // and the report printed all three gaps rather than an average precisely so nobody could quote
  // the flattering one.
  //
  // The nine-rung ladder adopted 2026-08-31 is EVENLY SPACED at 0.025, so every gap is the same
  // and "one shade rung" is finally one number. That is a small, real gain in how this vocabulary
  // can be TALKED about, on top of what the refinement was adopted for.
  const gaps = shadeRungGaps(YELLOW_GRASS);
  assert.equal(gaps.length, SHADE_LEVELS.length - 1);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  assert.ok(spread < 1, `the ladder's steps are no longer even: ${gaps.map((g) => g.toFixed(2)).join(', ')}`);
  // ⚠ AND EVERY GAP IS NOW UNDER THE BAR, WHICH IS THE COST OF THE SAME CHANGE. A 0.025 step moves
  // a token far less than a 0.10 one did, so a separation quoted against "one shade rung" is now
  // quoted against a much quieter reference — the bar got easier to clear, and a reader of the
  // report has to know that before reading any ratio in it as an improvement.
  for (const g of gaps) {
    assert.ok(g < SEPARATION_FLOOR, `rung gap ${g.toFixed(2)} is no longer under the scenery bar`);
  }
  // NON-VACUITY, and it is the frozen record: on the ladder those sentences were written against,
  // the gaps were emphatically uneven and the deep ones dwarfed the bar.
  const legacyGaps = shadeRungGaps(YELLOW_GRASS, LEGACY_SHADE_LEVELS);
  assert.equal(legacyGaps.length, LEGACY_SHADE_LEVELS.length - 1);
  assert.ok(legacyGaps[0]! < legacyGaps[1]! / 3, `first gap ${legacyGaps[0]}`);
  assert.ok(legacyGaps[0]! < SEPARATION_FLOOR);
  assert.ok(legacyGaps[1]! > SEPARATION_FLOOR * 2, 'the deep rungs used to dwarf the bar');
});

test('the closest two DIFFERENT statuses are healthy and unknown, at 24.58', () => {
  // THE DENOMINATOR every separation in the report is read against: how quietly the map already
  // draws a MEANINGFUL difference.
  //
  // ⚠ IT HAS MOVED TWICE AND BOTH MOVES WENT THE SAME WAY. It was `healthy`/`unknown` at **3.33**
  // until 2026-08-27 — the 2026-08-18 pass's headline defect, a parcel asserting a signed pass
  // and a parcel asserting nothing. ADR-0462 gave `unknown` its own slate and the worst pair moved
  // to `proposed`/`mapped` at **14.23**. Re-authoring `mapped` as a clay on 2026-08-28 moved it
  // again — brown is now 41.52 from green and 24.36 from yellow, so what binds is `healthy`
  // against `unknown` at **25.40**, which is the same PAIR the defect was and 7.6x further apart.
  //
  // ⚠ IT MOVED A THIRD TIME, 24.58 -> 25.40, and no colour changed: the nine-rung ladder adopted
  // 2026-08-31 dropped the 0.78 rung, which is the darkest and therefore where two families sit
  // closest. Removing it removed the binding comparison. The figure is pinned on BOTH ladders
  // below, so this is the ladder moving rather than a token drifting.
  const worst = worstStatusPair();
  assert.deepEqual([worst.a, worst.b].sort(), ['healthy', 'unknown']);
  assert.ok(Math.abs(worst.distance - 25.4) < 0.01, `worst pair moved to ${worst.distance.toFixed(2)}`);
  const legacyWorst = worstStatusPair(STATUS_TOKENS, LEGACY_SHADE_LEVELS);
  assert.ok(
    Math.abs(legacyWorst.distance - 24.58) < 0.01,
    `the four-rung figure moved to ${legacyWorst.distance.toFixed(2)}`,
  );
  // AND THE COMPARISON WITH THE SCENERY BAR HAS INVERTED AND KEPT GOING, which is worth an
  // assertion rather than a comment because it is the sentence `YELLOW_GRASS`'s docstring has now
  // been corrected for twice. The worst meaningful pair used to be QUIETER than the bar a scenery
  // colour is held to (3.33 against 7.675); it is now 3.2x it. Improving the status vocabulary
  // raises the standard scenery is judged by, every time.
  assert.ok(worst.distance > SEPARATION_FLOOR * 3, 'the worst meaningful pair is well over the scenery bar');
  // ⚠ AND `yellowGrass` IS NOW ON THE WRONG SIDE OF IT. At 13.62 from the nearest proof state it
  // is a little over HALF the map's own worst meaningful difference — so a scenery cell differs
  // from a status by less than two statuses differ from each other. Nothing about the cover moved;
  // the denominator did, twice. This is not a defect that has appeared — it is the headroom
  // argument continuing to lose force as the vocabulary gets better, and it is the trade
  // `oq-how-does-the-map-report-a-capability-s-state-once-the-gro` exists to price. Recorded here
  // rather than acted on: re-authoring the grass is not this increment's to do.
  assert.ok(separationOf(YELLOW_GRASS).distance < worst.distance / 1.5);
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
  // ⚠⚠ ON THE FOUR-RUNG LADDER, WHICH IS WHAT THE CONSTANT IS. `SEPARATION_FLOOR` is the wheat
  // override's own separation ROUNDED DOWN, and that separation is a minimum over the ladder's
  // rungs — so it moves when the ladder does. The nine-rung ladder adopted 2026-08-31 dropped the
  // 0.78 rung, which is where the wheat came closest to `proposed`, and the same override now
  // measures 7.95. The constant is deliberately NOT re-derived onto that: raising a bar changes
  // which scenery colours are admissible on the island, and which colours may appear is a look
  // decision the owner signs (ADR-0392 D1), not one an adoption of the ground's ladder settles.
  // What is asserted instead is both numbers — the frozen derivation exactly, and the live one as
  // a recorded drift — so the gap is visible rather than absorbed.
  const wheat = separationOf(STATUS_TOKENS.get('healthy')!.wheat, LEGACY_SHADE_LEVELS);
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
  // THE LIVE DRIFT, recorded rather than acted on: on the ladder the map wears, the colour that
  // DEFINES the bar sits 0.27 above it. The bar is therefore now slightly LOOSER than its own
  // source, which is the direction the second assertion above exists to catch — so it is named
  // here instead of being allowed to pass unremarked.
  const wheatToday = separationOf(STATUS_TOKENS.get('healthy')!.wheat);
  assert.ok(
    Math.abs(wheatToday.distance - 7.95) < 0.01,
    `the wheat override measures ${wheatToday.distance.toFixed(4)} on the adopted ladder`,
  );
  assert.ok(wheatToday.distance > SEPARATION_FLOOR, 'the bar is looser than its source, not stricter');
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
  //
  // ⚠ CALIBRATED ON THE FOUR-RUNG LADDER, like the bar it is calibrated against. `#c6c06a` was
  // chosen to measure exactly `SEPARATION_FLOOR`; on the adopted ladder it measures 8.22, because
  // the rung where it came closest to `proposed` no longer exists. Both are asserted, so the
  // calibration stays a calibration and the drift stays visible.
  const pale = separationOf('#c6c06a', LEGACY_SHADE_LEVELS);
  assert.ok(
    Math.abs(pale.distance - SEPARATION_FLOOR) < 0.02,
    `#c6c06a measures ${pale.distance.toFixed(2)}, no longer sitting on the bar`,
  );
  assert.ok(
    Math.abs(separationOf('#c6c06a').distance - 8.22) < 0.01,
    `#c6c06a measures ${separationOf('#c6c06a').distance.toFixed(2)} on the adopted ladder`,
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
