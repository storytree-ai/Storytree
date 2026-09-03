// grain-status-reading.test.ts — the instrument that gated the grain crossing, held to the two
// things an instrument has to prove about itself: that it can FAIL, and that the walk it calls
// exhaustive really is.
//
// ⚠ THE FINDING ITSELF IS PINNED HERE AS A NUMBER, not as prose. `src/banded-ground-material.ts`,
// `src/ForestWorldCanvas.tsx`, `harness/shipped-baseline.test.ts` and an open question all rest on
// "the authored 0.13 is inadmissible and 0.031 is the ceiling". If the palette moves — and it has
// twice this month (ADR-0462, ADR-0475) — that sentence becomes false silently everywhere it is
// written. Here it becomes a red.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_SHADE_LEVELS,
  SHADE_LEVELS,
  deliveredForLevel,
  parseHex,
  toHex,
  type Rgb255,
} from '../src/shade-ladder.js';
import { GRAIN_COLOUR_MIX } from '../src/land-grain.js';
import {
  GRAIN_REACH_STEPS,
  SHIPPED_STATUSES,
  admissibleLevelBand,
  admissibleMixCeiling,
  grainColourHalfAdmissible,
  grainColourHalfReadings,
  grainColourHalfVerdict,
  grainMixed,
  ladderHolds,
  ladderReadings,
  levelProbes,
  levelSurvivesTint,
  ownFamily,
  readMargin,
  shippedLadder,
  shippedReaderTable,
} from './grain-status-reading.js';
import { FLAT_GROUND_LEVEL, nearestStatus } from './shadow-ladder.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';

test('the reader table is built at the level FLAT GROUND is actually delivered at', () => {
  // ⚠ THE CORRECTION THIS INSTRUMENT GOT WRONG FIRST, and the failure mode is the one that reads
  // like a discovery: with references at full light the ORDINARY SHIPPED GROUND comes back
  // misreporting on four of its twenty-four rungs, because the live renderer never delivers flat
  // ground at 1.0. A reader's reference is what lit ground LOOKS like, not what the token is.
  assert.equal(FLAT_GROUND_LEVEL, 0.9);
  const table = shippedReaderTable();
  for (const status of SHIPPED_STATUSES) {
    assert.deepEqual(
      table[status],
      [deliveredForLevel(SHIPPED_GROUND_COLOUR.get(status)!, FLAT_GROUND_LEVEL)],
      `${status}'s reference colour is not its token at flat-ground light`,
    );
  }
  // NON-VACUITY: a table built at 1.0 must be a DIFFERENT table, or the argument above is about
  // nothing.
  assert.notDeepEqual(shippedReaderTable(1.0), table);
});

test('THE UNGRAINED LADDER HOLDS — every rung of every shipped token reads as its own family', () => {
  // The control the whole measurement rests on. If the shipped ground already misreported, the
  // grain could not be blamed for anything and the fork would be a different one entirely.
  const readings = ladderReadings();
  // ⚠⚠ TEN RUNGS NOW, AND EACH GROWTH WAS A CORRECTION RATHER THAN A WIDENING. Until 2026-08-30
  // this instrument walked `SHADE_LEVELS` and reported on 24 patches; the shadow crossing
  // (PR #1736) gave the shipped material a fifth, DERIVED rung at 0.77, below all four. The
  // 2026-08-31 ladder adoption took the lit half from four rungs to nine, so the shipped ground
  // now draws ten and this reports on 60. An instrument left on an old ladder does not go red —
  // it answers about a ground nobody draws, which is why the count is derived AND pinned.
  assert.equal(shippedLadder().length, SHADE_LEVELS.length + 1);
  assert.equal(shippedLadder()[0], 0.77, 'the derived shadow rung, and it is the DARKEST');
  assert.equal(readings.length, SHIPPED_STATUSES.length * shippedLadder().length);
  assert.equal(readings.length, 60);
  for (const r of readings) {
    assert.ok(
      ownFamily(r.status).has(r.readsAs),
      `${r.status} at rung ${r.level} delivers ${r.delivered}, which reads as ${r.readsAs}`,
    );
  }
  assert.ok(ladderHolds());
  // ⚠ AND THE MARGIN IS TIGHTER THAN THE FOUR-RUNG LADDER SAID — 0.93 weighted channel units,
  // not 3.00, because the tightest patch is now the shadow rung rather than the darkest lit one.
  // It holds, and it has essentially nothing left. That is not an accident of the palette: the
  // shadow rung is DERIVED as the deepest level that still reads honestly, so by construction it
  // sits on the edge and consumes whatever headroom the palette has. A session hoping to buy tint
  // headroom by moving a colour must know that the shadow's own derivation will spend it again.
  const worst = readings.reduce((a, b) => (a.margin <= b.margin ? a : b));
  assert.ok(worst.margin > 0, 'the shipped ladder must hold');
  assert.ok(worst.margin < 2, `the tightest margin is ${worst.margin.toFixed(2)} — retune the bound`);
  assert.equal(worst.level, shippedLadder()[0], 'the binding rung is the derived shadow rung');
  assert.ok(
    ['proposed', 'building'].includes(worst.status),
    `the binding pair is expected to be the shared yellow, got ${worst.status}`,
  );
  // NON-VACUITY on the correction itself: asked about the OLD four-rung ladder the same
  // instrument still returns the old answer, so the change above is the ladder moving rather than
  // the arithmetic drifting.
  const four = ladderReadings(shippedReaderTable(), LEGACY_SHADE_LEVELS);
  assert.equal(four.length, 24);
  assert.equal(four.reduce((a, b) => (a.margin <= b.margin ? a : b)).margin.toFixed(2), '3.00');
});

test('the walk is an ENUMERATION: consecutive samples never skip a channel value', () => {
  // What makes `grainColourHalfReadings` exhaustive rather than a sample. If two consecutive
  // steps could differ by more than one channel unit, the walk could step straight over the very
  // colour that misreports and report a clean run.
  for (const status of SHIPPED_STATUSES) {
    const base = deliveredForLevel(SHIPPED_GROUND_COLOUR.get(status)!, SHADE_LEVELS[0]!);
    let prev = grainMixed(base, 0);
    for (let i = 1; i <= GRAIN_REACH_STEPS; i++) {
      const c = grainMixed(base, i / GRAIN_REACH_STEPS);
      for (const ch of ['r', 'g', 'b'] as const) {
        assert.ok(
          Math.abs(c[ch] - prev[ch]) <= 1,
          `${status}: step ${i} moved ${ch} by ${Math.abs(c[ch] - prev[ch])} — the walk has holes`,
        );
      }
      prev = c;
    }
  }
});

test('the mix is a NO-OP at fac 0 and reaches the stops at fac 1 — the ends are real', () => {
  // Without this the whole reachable-set argument could be measuring a mix that never moves.
  const base = parseHex('#8cb85e');
  assert.equal(toHex(grainMixed(base, 0, 0)), toHex(base));
  assert.equal(toHex(grainMixed(base, 1, 0)), toHex(base));
  const [dark, light] = [grainMixed(base, 0, 1), grainMixed(base, 1, 1)];
  assert.notEqual(toHex(dark), toHex(light), 'the two grain stops must differ');
  assert.notEqual(toHex(dark), toHex(base));
});

test('THE ANSWER: the colour half is INADMISSIBLE at its authored mix, and where', () => {
  const v = grainColourHalfVerdict();
  assert.equal(v.admissible, false, 'the finding this increment reports');
  // Exactly the six `(status, rung)` readings that move — the shared yellow at the ladder's three
  // darkest rungs, once for each of the two statuses that share the token. Named rather than
  // counted, so a palette change that moved the failure somewhere else could not pass as this one.
  //
  // ⚠ THE SET IS THE SAME SIZE AND NOT THE SAME SET. The 2026-08-31 ladder adoption dropped 0.78
  // and added 0.825; the failures moved with the rungs, and they are still exactly the bottom of
  // the ladder for exactly the two statuses that share the yellow. Refining bought the tint no
  // headroom, which is the finding the fork turned on and is unchanged by the adoption.
  assert.deepEqual(
    v.breaks.map((b) => `${b.status}@${b.level}`).sort(),
    [
      'building@0.77',
      'building@0.8',
      'building@0.825',
      'proposed@0.77',
      'proposed@0.8',
      'proposed@0.825',
    ],
  );
  for (const b of v.breaks) {
    assert.ok(b.grainedReadsAs.includes('healthy'), `${b.status}@${b.level} should walk into green`);
    assert.ok(b.baseMargin > 0, 'and it must have held BEFORE the grain, or the grain broke nothing');
    assert.ok(b.worstMargin < 0);
  }
  // The other fifty-four hold, which is what makes this a narrow finding rather than a
  // condemnation of the mechanism — and the ratio IMPROVED with the ladder, 24 of 30 to 54 of 60.
  assert.equal(grainColourHalfReadings().filter((r) => r.holds).length, 54);
});

test('THE CEILING: the largest mix every reading survives, and it is far below the authored one', () => {
  // ⚠ THE FORK IS A NUMBER, NOT A YES/NO, and that is why the escalation carries this rather than
  // "no". The owner is choosing between pictures — a quarter-strength grain that holds the closure
  // against a full-strength one that does not — and a boolean would hide the option.
  const ceiling = admissibleMixCeiling(0.001);
  // ⚠⚠ 0.006, NOT THE 0.031 THE FOUR-RUNG LIT LADDER REPORTED — a fifth of that figure and a
  // twentieth of the authored mix. The shadow rung is what took it: a level darker than any lit
  // one, at 0.93 units of margin, survives almost no wash at all. Every sentence in the corpus
  // reading "the largest fac today's colours survive is 0.031" is about a ladder that has been
  // superseded, and this is where that becomes a red rather than a slow drift.
  //
  // ⚠ THE CEILING DID NOT MOVE WHEN THE LADDER DID, which is worth knowing because it is the
  // number the owner's fork turned on. It is set by the SHADOW rung, and the shadow rung is
  // derived and landed on 0.77 either way — so refining the lit ladder bought the colour half no
  // headroom at all. The lit-only figure below rose from 0.031 to 0.077 for the same reason the
  // rest of this pass keeps meeting: raising the floor from 0.78 to 0.80 removed the tightest
  // lit rung. Neither number reaches the authored 0.13.
  assert.equal(ceiling, 0.006);
  assert.equal(
    admissibleMixCeiling(0.001, 1.0, LEGACY_SHADE_LEVELS),
    0.031,
    'the four-rung lit ladder, unchanged',
  );
  assert.equal(admissibleMixCeiling(0.001, 1.0, SHADE_LEVELS), 0.077, 'the adopted lit ladder alone');
  assert.ok(ceiling < GRAIN_COLOUR_MIX, 'a ceiling at or above the authored mix would be no fork');
  assert.equal(grainColourHalfVerdict(ceiling).admissible, true);
  assert.equal(grainColourHalfVerdict(Math.round((ceiling + 0.001) * 1000) / 1000).admissible, false);
});

test('the ceiling search`s fast predicate IS the verdict`s `admissible` — one instrument, not two', () => {
  // ⚠ THIS IS THE FENCE UNDER AN OPTIMISATION, AND IT IS THE ONLY THING HOLDING IT.
  // `admissibleMixCeiling` no longer builds a full `GrainClosureVerdict` per candidate mix; it calls
  // `grainColourHalfAdmissible`, which skips the per-sample margin, the hex of every sample and the
  // sorted read set — none of which `admissible` reads — and short-circuits on the first foreign
  // read and on a colour identical to the previous sample. Every one of those is exact ON THE
  // REASONING, and reasoning is exactly what a second implementation of a predicate is not entitled
  // to. So the two are held together by measurement instead, at every mix the search can visit.
  //
  // WHAT IT SWEEPS, AND WHY THAT AND NOT THE WHOLE GRID. Every mix the shipped ladder's search can
  // visit — 0.001 to 0.010, which BRACKETS the 0.006 it returns — plus both other ladders' flip
  // points either side. The flip is the whole output: `admissibleMixCeiling` returns the last mix
  // before `false`, so a disagreement that could move the number has to sit at a boundary, and each
  // boundary is fenced on both sides. A wider sweep is not free — the verdict half of each pair is
  // the ~116 ms walk this optimisation exists to stop paying, so sweeping 0.001-0.090 would cost
  // ~10 s and hand back everything the change bought.
  for (let fac = 0.001; fac <= 0.01 + 1e-9; fac += 0.001) {
    const mix = Math.round(fac * 10000) / 10000;
    assert.equal(
      grainColourHalfAdmissible(mix),
      grainColourHalfVerdict(mix).admissible,
      `the two disagree at fac ${mix} on the shipped ladder`,
    );
  }
  // BOTH ANSWERS MUST APPEAR ON THAT SWEEP, or the agreement above is satisfied by two functions
  // that both always say the same thing — the `NON-VACUITY` test's argument, applied to the pairing
  // rather than to the verdict. 0.006 is the last admissible mix and 0.007 the first that is not,
  // so the sweep straddles the flip rather than sitting on one side of it.
  assert.equal(grainColourHalfAdmissible(0.006), true, 'the shipped ceiling is admissible');
  assert.equal(grainColourHalfAdmissible(0.007), false, 'one step past it is not');

  // AND ON THE OTHER TWO LADDERS THE CEILING TESTS ABOVE USE, either side of the boundary each one
  // turns on — the ladder is an argument to both functions, so agreement on the shipped one does
  // not carry to them, and a hoist or a short-circuit that was wrong per-rung would show here.
  for (const [name, levels, at] of [
    ['legacy', LEGACY_SHADE_LEVELS, 0.031],
    ['lit', SHADE_LEVELS, 0.077],
  ] as const) {
    for (const mix of [at, Math.round((at + 0.001) * 10000) / 10000]) {
      const fast = grainColourHalfAdmissible(mix, shippedReaderTable(), levels);
      assert.equal(
        fast,
        grainColourHalfVerdict(mix, shippedReaderTable(), levels).admissible,
        `the two disagree at fac ${mix} on the ${name} ladder`,
      );
      assert.equal(fast, mix === at, `the ${name} ladder's flip is not where the ceiling says it is`);
    }
  }
});

test('NON-VACUITY: the verdict can come back TRUE, so `false` is a measurement', () => {
  // A verdict function that always said "inadmissible" would satisfy every assertion above while
  // measuring nothing. A vanishing mix must be admissible, and a saturating one must not.
  assert.equal(grainColourHalfVerdict(0.001).admissible, true);
  assert.equal(grainColourHalfVerdict(0.5).admissible, false);
});

test('the shared yellow is treated as ONE family, and that is not a way of passing', () => {
  // `proposed` and `building` are the same hex (ADR-0462), so one always reads as the other. That
  // is authored, predates the grain and cannot be fixed by it — counting it as a misread would
  // condemn the palette as it already ships. But the leniency must be exactly that wide.
  assert.deepEqual([...ownFamily('proposed')].sort(), ['building', 'proposed']);
  for (const solo of ['healthy', 'mapped', 'unhealthy', 'unknown']) {
    assert.deepEqual([...ownFamily(solo)], [solo], `${solo} must stand alone`);
  }
  // And a genuinely foreign read is still a break: `healthy`'s own reference colour must not be
  // admitted as a reading of the yellow.
  const yellow = deliveredForLevel(SHIPPED_GROUND_COLOUR.get('proposed')!, 0.78);
  assert.ok(!ownFamily('proposed').has('healthy'));
  assert.equal(nearestStatus(yellow, shippedReaderTable()), 'building');
});

test('readMargin agrees with nearestStatus — one instrument, not two', () => {
  // A margin that disagreed with the read would let a verdict report a comfortable number over a
  // colour the reader model actually misclassifies.
  for (const status of SHIPPED_STATUSES) {
    for (const level of SHADE_LEVELS) {
      const c = deliveredForLevel(SHIPPED_GROUND_COLOUR.get(status)!, level);
      const m = readMargin(c, status, shippedReaderTable());
      const reads = nearestStatus(c, shippedReaderTable());
      assert.equal(
        m.margin > 0,
        ownFamily(status).has(reads),
        `${status}@${level}: margin ${m.margin.toFixed(2)} disagrees with read ${reads}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------------------------
// THE BAND — the finding that replaced the increment's premise
// ---------------------------------------------------------------------------------------------

test('THE BAND: a tinted ground may only use levels near flat ground, and the shipped ladder is not', () => {
  // ⚠⚠ THE MEASUREMENT THAT REFUTES `move-the-yellow-so-the-ground-texture-can-finish`. That
  // increment was written on "the cause is the colours, not the texture" — separate the shared
  // yellow from `healthy`'s green far enough and the tint fits. It does not, and this is why:
  // the reader holds ONE reference per token, at what LIT FLAT GROUND looks like, so a rung's
  // margin is spent by its DISTANCE FROM 0.90 in either direction. What binds is the ladder's
  // REACH, not the palette's spread.
  const band = admissibleLevelBand();
  assert.ok(band !== null, 'flat ground itself must survive the tint, or nothing can');
  const [lo, hi] = band;
  assert.equal(lo, 0.84);
  assert.equal(hi, 1.05);
  assert.ok(lo < FLAT_GROUND_LEVEL && hi > FLAT_GROUND_LEVEL, 'the band brackets flat ground');

  // THE CONSEQUENCE, stated as an overlap rather than as prose: three of the shipped ladder's
  // TEN rungs sit BELOW the tinted floor, and they are exactly the ones the verdict breaks on.
  //
  // ⚠ THE COUNT OF BREAKING RUNGS DID NOT CHANGE WHEN THE LADDER GREW — three before, three now
  // — but the SHARE did, from three of five to three of ten. The band itself is unmoved: it is a
  // property of the reader's single reference at flat ground, not of how finely the ladder is
  // subdivided, which is the whole claim this test was written to make.
  const outside = shippedLadder().filter((l) => l < lo || l > hi);
  assert.deepEqual(outside, [0.77, 0.8, 0.825]);
  assert.equal(shippedLadder().filter((l) => l >= lo && l <= hi).length, 7);
});

test('the band is a property of the LADDER, not of the yellow — moving the token does not move it much', () => {
  // NON-VACUITY WITH TEETH. If the band were really about the shared yellow, a table whose
  // yellow had been pulled far from green would widen it dramatically. Measured over a
  // 5,000-candidate sweep it does not — the binding constraint merely moves to another token.
  // One representative candidate stands for that sweep here, so the claim is checkable rather
  // than cited.
  // Three candidates spanning the directions a yellow can move: lighter, more saturated, and
  // pulled toward straw. NONE of them opens the band down to the 0.77 the shipped ladder needs —
  // and two make it WORSE, one so much so that flat ground itself stops surviving the tint,
  // because the binding constraint simply moves to another token.
  for (const candidate of ['#efe0a4', '#e8d060', '#ead884']) {
    const moved: Record<string, Rgb255[]> = {};
    for (const status of SHIPPED_STATUSES) {
      const token = SHIPPED_GROUND_COLOUR.get(status)!;
      moved[status] = [
        deliveredForLevel(token === '#d8c069' ? candidate : token, FLAT_GROUND_LEVEL),
      ];
    }
    const widened = admissibleLevelBand(GRAIN_COLOUR_MIX, moved);
    assert.ok(
      widened === null || widened[0] > 0.8,
      `yellow ${candidate} floors the band at ${widened?.[0]} — that would refute the finding`,
    );
  }
});

test('the band CAN be the whole probe span, so a narrow one is a measurement', () => {
  // A band function that always returned something narrow would satisfy the assertions above
  // while measuring nothing. At a vanishing tint every probed level survives and the band is the
  // full span it was asked about.
  const all = admissibleLevelBand(0, shippedReaderTable(), 0.01, [0.78, 1.0]);
  assert.deepEqual(all, [0.78, 1.0]);
  // And at a saturating tint nothing does — not even flat ground — which is the `null` branch.
  assert.equal(admissibleLevelBand(1.0), null);
});

test('levelProbes counts the probes, and the count is inclusive of the far end', () => {
  // ⚠ ASSERTED AS A VALUE because a probe count that is merely too LARGE cannot be seen from the
  // band it produces — the sweep breaks on its own condition. The half that IS observable is a
  // count two short, which stops before the far end.
  assert.deepEqual(levelProbes(0.9, 0.93, 0.01), [0, 1, 2, 3]);
  assert.equal(levelProbes(0.5, 1.5, 0.01).length, 101);
  // The far end is REACHED, which is the half a band assertion can actually see: a count two
  // short would stop above the true ceiling and report a narrower band than the ground has.
  assert.equal(levelSurvivesTint(1.05), true, 'the band ceiling itself must be probed');
  assert.equal(admissibleLevelBand(GRAIN_COLOUR_MIX, shippedReaderTable(), 0.01, [0.5, 1.05])![1], 1.05);
  assert.deepEqual(levelProbes(1.0, 0.5, 0.01), [], 'a reversed span probes nothing');
});

test('levelSurvivesTint is the band function\'s own predicate, and it disagrees with nothing', () => {
  // One instrument, not two: every level inside the band must pass the predicate and every level
  // outside it must fail, or the band is a summary of a different question.
  const band = admissibleLevelBand()!;
  for (const level of [0.77, 0.8, 0.83, 0.84, 0.9, 1.0, 1.04, 1.05, 1.1]) {
    assert.equal(
      levelSurvivesTint(level),
      level >= band[0] && level <= band[1],
      `level ${level} disagrees with the band [${band[0]}, ${band[1]}]`,
    );
  }
});
