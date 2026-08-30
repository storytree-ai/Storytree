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

import { SHADE_LEVELS, deliveredForLevel, parseHex, toHex } from '../src/shade-ladder.js';
import { GRAIN_COLOUR_MIX } from '../src/land-grain.js';
import {
  GRAIN_REACH_STEPS,
  SHIPPED_STATUSES,
  admissibleMixCeiling,
  grainColourHalfReadings,
  grainColourHalfVerdict,
  grainMixed,
  ladderHolds,
  ladderReadings,
  ownFamily,
  readMargin,
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
  assert.equal(readings.length, SHIPPED_STATUSES.length * SHADE_LEVELS.length);
  for (const r of readings) {
    assert.ok(
      ownFamily(r.status).has(r.readsAs),
      `${r.status} at rung ${r.level} delivers ${r.delivered}, which reads as ${r.readsAs}`,
    );
  }
  assert.ok(ladderHolds());
  // ⚠ AND THE MARGIN IS TIGHT, WHICH IS ITSELF THE FINDING. The yellow at the darkest rung sits
  // ~3 weighted channel units from `healthy`'s family — it holds, and it has almost nothing left.
  // That is why a 13% mottle is enough to break it, and it is a fact about the PALETTE rather than
  // about the grain.
  const worst = readings.reduce((a, b) => (a.margin <= b.margin ? a : b));
  assert.ok(worst.margin > 0, 'the shipped ladder must hold');
  assert.ok(worst.margin < 6, `the tightest margin is ${worst.margin.toFixed(1)} — retune the bound`);
  assert.ok(
    ['proposed', 'building'].includes(worst.status),
    `the binding pair is expected to be the shared yellow, got ${worst.status}`,
  );
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
  // Exactly the four `(status, rung)` readings that move — the shared yellow at the ladder's two
  // darkest rungs, once for each of the two statuses that share the token. Named rather than
  // counted, so a palette change that moved the failure somewhere else could not pass as this one.
  assert.deepEqual(
    v.breaks.map((b) => `${b.status}@${b.level}`).sort(),
    ['building@0.78', 'building@0.8', 'proposed@0.78', 'proposed@0.8'],
  );
  for (const b of v.breaks) {
    assert.ok(b.grainedReadsAs.includes('healthy'), `${b.status}@${b.level} should walk into green`);
    assert.ok(b.baseMargin > 0, 'and it must have held BEFORE the grain, or the grain broke nothing');
    assert.ok(b.worstMargin < 0);
  }
  // The other twenty hold, which is what makes this a narrow finding rather than a condemnation
  // of the mechanism.
  assert.equal(grainColourHalfReadings().filter((r) => r.holds).length, 20);
});

test('THE CEILING: the largest mix every reading survives, and it is far below the authored one', () => {
  // ⚠ THE FORK IS A NUMBER, NOT A YES/NO, and that is why the escalation carries this rather than
  // "no". The owner is choosing between pictures — a quarter-strength grain that holds the closure
  // against a full-strength one that does not — and a boolean would hide the option.
  const ceiling = admissibleMixCeiling(0.001);
  assert.equal(ceiling, 0.031);
  assert.ok(ceiling < GRAIN_COLOUR_MIX, 'a ceiling at or above the authored mix would be no fork');
  assert.equal(grainColourHalfVerdict(ceiling).admissible, true);
  assert.equal(grainColourHalfVerdict(Math.round((ceiling + 0.001) * 1000) / 1000).admissible, false);
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
