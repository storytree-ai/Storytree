// hue-frontier.test.ts — the sweep, held to the one thing a search has to be: unable to report a
// solution that is not there, and unable to hide one that is.
//
// ⚠⚠ EVERY REPRODUCTION BELOW READS `ADR0462_STATUS_TOKENS`, THE FROZEN PALETTE THE SEARCH WAS
// ACTUALLY RUN AGAINST — never the live `STATUS_TOKENS`. The clay this sweep picked has since
// landed, so the live table IS the answer: a sweep of `mapped` against it starts from the clay and
// walks outward from it, which is a different search that would go on passing. The recorded
// figures — the 0.395 ratio it started from, the two named foreign reads, the >100 clearing
// candidates, the ratchet's measured inertness — are statements about the palette of 2026-08-28
// and are pinned to it. The live palette gets its own assertions at the bottom, where they belong.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SWEEP,
  familyMovement,
  sweepFamily,
  tightestPair,
  todaysBars,
  warpFamily,
  warpHex,
} from './hue-frontier.js';
import { STATUS_TOKENS, parseHex } from './palette-band.js';
import { ADR0462_STATUS_TOKENS, colourPairs, vocabularySeparation } from './status-vocabulary.js';

test('a null warp is the identity — the sweep contains its own starting colours', () => {
  const base = ADR0462_STATUS_TOKENS.get('mapped')!;
  const same = warpFamily(base, 0, 1, 1);
  // ⚠ Through HSV and back, so exact equality is not owed — but a round trip that moved a colour
  // perceptibly would put every candidate on a shifted baseline and quietly bias the whole search.
  assert.ok(familyMovement(base, same) < 1.5, `null warp moved ${familyMovement(base, same)}`);
});

test('the warp actually warps — a non-null warp is not the identity', () => {
  const base = ADR0462_STATUS_TOKENS.get('mapped')!;
  assert.ok(familyMovement(base, warpFamily(base, -14, 1.3, 0.84)) > 20);
});

test('hue rotation moves hue and value scaling moves brightness — separately', () => {
  const base = parseHex('#b3946a');
  const rotated = parseHex(warpHex('#b3946a', -60, 1, 1));
  const dimmed = parseHex(warpHex('#b3946a', 0, 1, 0.5));
  // Rotating a tan 60 degrees BACKWARDS through the wheel lands past red into magenta, so the
  // green and blue channels swap rank while the max channel is untouched — which is precisely what
  // a hue rotation is: the max stays, the other two move.
  assert.equal(rotated.r, base.r, 'a pure hue rotation leaves the value alone');
  assert.ok(rotated.b > rotated.g, 'rotating below red pushes past into magenta');
  assert.ok(base.g > base.b, 'where the tan had the opposite ordering');
  // Value scaling darkens every channel and touches none of the hue.
  assert.ok(dimmed.r < base.r && dimmed.g < base.g && dimmed.b < base.b);
  // ⚠ NON-VACUITY: an implementation that ignored `deg` would pass the dimming half alone.
  assert.notEqual(warpHex('#b3946a', -60, 1, 1), warpHex('#b3946a', 0, 1, 1));
});

test('`wheat` is NOT warped — it is shared by every family', () => {
  const base = ADR0462_STATUS_TOKENS.get('mapped')!;
  assert.equal(warpFamily(base, -14, 1.3, 0.84).wheat, base.wheat);
});

/* ── ⚠⚠ THE RATCHET — the property this module exists for ───────────────────────────────────── */

test('THE RATCHET is real but INERT here — and the report must not claim it saved anything', () => {
  // The ratchet exists because a bar computed FROM the families being compared can be shrunk by
  // desaturating one of them. On THIS vocabulary it changes nothing, and that is worth pinning:
  // the pair that binds is yellow/brown, and its bar is YELLOW's own rung step, which no edit to
  // brown can move. A later reader who finds the ratchet here should know it is a guard for the
  // next family someone sweeps, not the thing that made this answer come out.
  const base = ADR0462_STATUS_TOKENS.get('mapped')!;
  let flips = 0;
  let strictlyTighter = 0;
  for (const deg of [-20, -10, 0, 8]) {
    for (const sat of [0.7, 0.8, 0.9]) {
      for (const val of [0.7, 0.85, 1.0]) {
        const tokens = new Map(ADR0462_STATUS_TOKENS);
        tokens.set('mapped', warpFamily(base, deg, sat, val));
        const ownBars = new Map(colourPairs(tokens).map((p) => [`${p.a}/${p.b}`, p.step] as const));
        const own = tightestPair(tokens, ownBars).ratio;
        const ratcheted = tightestPair(tokens, todaysBars(ADR0462_STATUS_TOKENS)).ratio;
        assert.ok(ratcheted <= own + 1e-12, 'the ratchet may only ever be STRICTER');
        if (ratcheted < own - 1e-12) strictlyTighter++;
        if (own > 1 && ratcheted <= 1) flips++;
      }
    }
  }
  assert.equal(flips, 0, 'no VERDICT in this vocabulary turns on the ratchet');
  // ⚠ It does move NUMBERS — on most of these candidates it reports a tighter ratio than their own
  // bars would. Moving a number and changing a verdict are different claims, and the report is
  // entitled to only the weaker one.
  assert.ok(strictlyTighter > 0, 'and it is not a no-op either — it just never decides anything');
});

test('the palette the search STARTED from scores exactly as `status-vocabulary` said it did', () => {
  const t = tightestPair(ADR0462_STATUS_TOKENS, todaysBars(ADR0462_STATUS_TOKENS));
  assert.equal(t.pair, 'yellow/brown');
  // 8.27 against a 20.92 bar — ADR-0462's remaining defect, restated in ratio form. This is the
  // number the whole search is measured against, so it is pinned to the table it was taken on.
  assert.ok(t.ratio > 0.39 && t.ratio < 0.40, `the starting ratio is ${t.ratio.toFixed(3)}`);
  assert.deepEqual([...t.foreignReads], ['yellow@0.78->brown', 'yellow@0.8->brown']);
});

test('AND THE PICK LANDED: the live vocabulary is the one the search said it would be', () => {
  // The other half of the reproduction. The sweep predicted, of the palette that would exist once
  // the clay landed: tightest pair `yellow/green`, ratio 1.134, zero foreign reads. This asserts
  // that against the LIVE table — so the search's prediction and the shipped palette are held
  // together, and a later edit to any land colour that broke the prediction would show up here
  // rather than only in the frozen arm.
  const t = tightestPair(STATUS_TOKENS);
  assert.equal(t.pair, 'yellow/green', 'brown is out of the bottom slot');
  assert.ok(Math.abs(t.ratio - 1.134) < 0.002, `live ratio is ${t.ratio.toFixed(3)}`);
  assert.deepEqual([...t.foreignReads], []);
  assert.equal(vocabularySeparation().pass, true);
});

/* ── ⚠⚠ THE FRONTIER — what the vocabulary actually has room for ───────────────────────────── */

test('a brown-only edit CAN clear every pair — the first, narrower sweep was wrong', () => {
  // ⚠ THE CORRECTION THIS PINS. A sweep of hue −14…+6 / sat ×0.95…×1.35 / val ×0.62…×1.02 returned
  // ZERO clearing candidates and peaked at 0.966 — which reads exactly like "the palette has no
  // room for a browner brown", and was one assertion away from being published as a finding. The
  // conclusion was a property of the search box. Widening it finds hundreds.
  const rows = sweepFamily('mapped', DEFAULT_SWEEP, ADR0462_STATUS_TOKENS);
  const clearing = rows.filter((r) => r.ratio > 1 && r.foreignReads.length === 0);
  assert.ok(clearing.length > 100, `expected a wide frontier, got ${clearing.length}`);
});

test('the sweep reports its FAILURES too — a filtered frontier cannot show a shortfall', () => {
  // Non-vacuity in the other direction: if `sweepFamily` returned only the winners, the narrow
  // sweep above could never have been caught, because "no rows" and "no winners" would look alike.
  const rows = sweepFamily('mapped', DEFAULT_SWEEP, ADR0462_STATUS_TOKENS);
  assert.ok(rows.some((r) => r.ratio < 1), 'the sweep must contain candidates that fail');
  assert.ok(rows.some((r) => r.foreignReads.length > 0), 'including some that misreport outright');
  assert.equal(rows.length, DEFAULT_SWEEP.deg.length * DEFAULT_SWEEP.sat.length * DEFAULT_SWEEP.val.length);
});

test('THE RULE, and the colour it picks: brown stops being the weakest link', () => {
  // "Clears by N%" is a margin nobody can justify. The rule is a statement about the VOCABULARY:
  // the tightest pair must no longer involve brown at all — brown is out of the bottom slot, and
  // what binds instead is yellow/green, which no edit to brown ever touched.
  const rows = sweepFamily('mapped', DEFAULT_SWEEP, ADR0462_STATUS_TOKENS);
  const unseating = rows.filter(
    (r) => r.ratio > 1 && r.foreignReads.length === 0 && !r.pair.includes('brown'),
  );
  assert.ok(unseating.length > 0, 'at least one brown pushes itself out of the bottom slot');
  const pick = [...unseating].sort((a, b) => a.movement - b.movement)[0]!;
  assert.deepEqual([...pick.family.top], ['#b7684e', '#a95539', '#c1795e']);
  assert.equal(pick.family.side, '#883d24');
  assert.equal(pick.pair, 'yellow/green', 'what binds after the move is a pair brown is not in');
  // The ceiling: yellow/green is 23.72 against a 20.92 bar, and it is unchanged by any of this.
  assert.ok(Math.abs(pick.ratio - 1.134) < 0.002, `ratio ${pick.ratio.toFixed(3)}`);
  assert.equal(pick.foreignReads.length, 0);
});

test('the sweep covers the region it claims to, endpoints included', () => {
  // The float-accumulation bug this replaced dropped the last rung of every axis silently.
  assert.equal(DEFAULT_SWEEP.deg[0], -20);
  assert.equal(DEFAULT_SWEEP.deg[DEFAULT_SWEEP.deg.length - 1], 8);
  assert.ok(Math.abs(DEFAULT_SWEEP.val[DEFAULT_SWEEP.val.length - 1]! - 1.04) < 1e-9);
  assert.ok(Math.abs(DEFAULT_SWEEP.sat[DEFAULT_SWEEP.sat.length - 1]! - 1.4) < 1e-9);
});

test('an unknown status is refused, not swept as an empty set', () => {
  assert.throws(() => sweepFamily('nonesuch', DEFAULT_SWEEP, ADR0462_STATUS_TOKENS), /no token family/);
});
