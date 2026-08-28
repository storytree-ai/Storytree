// status-vocabulary.test.ts — the five-colour vocabulary (ADR-0462) and the separation that had
// to hold before it could be authored.
//
// THE ONE CONSTRAINT THE DECISION CAME WITH. `unhealthy` is already a dark WARM near-neutral
// (`#57544a`, hue 46, 8% saturation) and `unknown` was about to become a grey. Two low-saturation
// neutrals separated mainly by BRIGHTNESS is the failure ADR-0414 D4 is written about: the shader
// quantises lighting onto a ladder spanning 0.78..1.00, so a pair whose channels stand in a ratio
// inside that span has a lighting condition at which they deliver the same pixel.
//
// SO THE BAR IS READ OFF A CONTROL IN THE SAME RUN, never picked: two DIFFERENT colours must stay
// further apart, across the whole ladder, than ONE lighting step moves a single token. Read as a
// sentence — *the difference in MEANING is louder than the difference LIGHTING makes.* It is the
// comparison `ground-cover.ts`'s `shadeRungGaps` already states in prose, promoted to a rung, and
// it is the house pattern (`frame-budget.ts`, `capture.mjs`'s holes instrument and
// `cover-measure.mjs` all state their claim against a same-run control; `hardware-floor.mjs`'s own
// history is the counter-example, having once scored against "16.7 * 1.35", a number picked to
// make the answer come out).
//
// ⚠ AND THE BAR CAN FAIL — proved here rather than asserted, with three greys that were
// candidates and are now counterfactual arms. A bar nothing has ever failed is a bar nobody knows
// works.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SHADE_LEVELS, STATUS_TOKENS, deliveredForLevel, toHex } from './palette-band.js';
import {
  ADR0462_STATUS_TOKENS,
  LAND_COLOURS,
  LEGACY_STATUS_TOKENS,
  STATUS_COLOUR,
  type StatusFamily,
  chromaticSeparation,
  colourOfStatus,
  colourPairs,
  crossRungSeparation,
  foreignColourReads,
  largestRungStep,
  statusesWearing,
  tokensOfColour,
  vocabularySeparation,
  worstColourPair,
} from './status-vocabulary.js';

/** A palette with `unknown`'s ground family swapped for one candidate token — the shape the
 *  counterfactual arms are measured in.
 *
 *  ⚠ It takes the BASE TABLE because the recorded arms were measured on the palette of 2026-08-27,
 *  before `mapped` became a clay. Their published lists are statements about THAT vocabulary; run
 *  on today's they would silently become statements about this one and stop reproducing anything. */
function withGrey(
  top0: string,
  base: ReadonlyMap<string, StatusFamily> = STATUS_TOKENS,
): ReadonlyMap<string, StatusFamily> {
  const out = new Map<string, StatusFamily>();
  for (const [st, fam] of base) out.set(st, fam);
  out.set('unknown', { top: [top0, top0, top0], wheat: '#d6b271', side: top0 });
  return out;
}

// --- the vocabulary --------------------------------------------------------------------------

test('SIX STATES, FIVE COLOURS — and yellow is the one carrying two', () => {
  assert.equal(STATUS_COLOUR.size, 6);
  assert.equal(new Set(STATUS_COLOUR.values()).size, 5);
  assert.equal(LAND_COLOURS.length, 5);
  assert.deepEqual(statusesWearing('yellow'), ['building', 'proposed']);
  for (const c of LAND_COLOURS.filter((x) => x !== 'yellow')) {
    assert.equal(statusesWearing(c).length, 1, `${c} should be worn by exactly one state`);
  }
});

test('the vocabulary and the tokens agree — the two-place edit', () => {
  // `STATUS_COLOUR` is hand-authored UPSTREAM of `STATUS_TOKENS` rather than derived from it, so
  // this is a real comparison of two independent statements and not a tautology. Pulling
  // `building` back off `proposed`'s token would fail here rather than silently redrawing the map
  // as a six-colour one with the table still claiming five.
  for (const [a, ca] of STATUS_COLOUR) {
    for (const [b, cb] of STATUS_COLOUR) {
      if (a === b) continue;
      const fa = STATUS_TOKENS.get(a)!;
      const fb = STATUS_TOKENS.get(b)!;
      const sameTokens = fa.top.length === fb.top.length && fa.top.every((t, i) => t === fb.top[i]);
      assert.equal(sameTokens, ca === cb, `${a}/${b}: colours ${ca}/${cb} but tokens ${sameTokens ? 'identical' : 'differ'}`);
    }
  }
});

test('`proposed` and `building` share the same OBJECT, so they cannot drift apart', () => {
  // Stronger than deep equality, and deliberately so: two equal literals agree today and diverge
  // the first time somebody retunes one of them. `STATUS_TOKENS` holds one family under two keys.
  assert.equal(STATUS_TOKENS.get('building'), STATUS_TOKENS.get('proposed'));
  assert.equal(tokensOfColour('yellow').length, 3, 'one family, not two concatenated');
});

test('every state has an authored colour, and an unknown state THROWS rather than defaulting', () => {
  for (const st of STATUS_TOKENS.keys()) assert.ok(colourOfStatus(st));
  assert.throws(() => colourOfStatus('retired'), /no authored colour/);
});

// --- the constraint --------------------------------------------------------------------------

test('THE CONSTRAINT: grey and black clear the lighting-step bar at every rung', () => {
  const pair = colourPairs().find((p) => [p.a, p.b].sort().join('/') === 'black/grey')!;
  // 24.93 against a bar of 17.42 — the closest the two families come across the WHOLE ladder,
  // against the largest single lighting step either of them takes.
  assert.ok(pair.distance > pair.step, `grey/black ${pair.distance.toFixed(2)} is under the ${pair.step.toFixed(2)} bar at ${pair.at}`);
  assert.ok(Math.abs(pair.distance - 24.93) < 0.01, `grey/black moved to ${pair.distance.toFixed(2)}`);
  // THE HONEST-BAR TEST: where would a number picked to PASS have sat? Just under 24.93. The bar
  // is 30% below that and is derived from the ladder rather than chosen.
  assert.ok(pair.step < pair.distance * 0.8);
});

test('THE BAR CAN FAIL — three greys that were candidates, and why each is not the one', () => {
  const black = STATUS_TOKENS.get('unhealthy')!.top[0]!;
  const bar = (g: string) => Math.max(largestRungStep(g), largestRungStep(black));

  // (a) A PURE BRIGHTNESS VARIANT of the charred token — the literal ADR-0414 D4 case. Its
  // chromatic residual is essentially zero and the cross-rung minimum collapses with it.
  const brightnessOnly = '#7a7668';
  assert.ok(chromaticSeparation(brightnessOnly, black) < 0.5, 'this arm must BE a brightness variant');
  assert.ok(crossRungSeparation(brightnessOnly, black).distance < bar(brightnessOnly));

  // (b) A DARKER warm grey — the same cast, close enough in luma that the ladder reaches across.
  const darkWarm = '#6d6a5f';
  assert.ok(crossRungSeparation(darkWarm, black).distance < bar(darkWarm));
  assert.deepEqual(
    foreignColourReads(withGrey(darkWarm)).filter((r) => r.includes('black') || r.includes('grey')),
    ['grey@0.78->black', 'grey@0.8->black'],
    'a dark warm grey slides onto the charred token — doubt read as failure',
  );

  // (c) THE NAIVE GREY — growing `unknown` out of the cosy base sage `#808763`, which is the
  // colour the owner had been seeing and calling grey. It clears the grey/black bar and fails
  // somewhere else entirely: it lands `healthy` and `mapped` on `unknown` at their dark rungs,
  // proof read as doubt. This is the arm that shows the constraint had to be checked against the
  // WHOLE vocabulary and not just against the pair the increment named.
  const naive = '#808763';
  assert.ok(crossRungSeparation(naive, black).distance > bar(naive), 'the naive grey does clear grey/black');
  // ⚠ RECORDED ON THE PALETTE OF 2026-08-27, and pinned to it. Two of these four reads are the tan
  // brown's — `brown@0.78->grey` is the sage grey catching the tan, and the two `yellow->brown`
  // entries are ADR-0462's own remaining defect showing through the arm. The clay removed both, so
  // reading this list off the live table would quietly shrink the recorded counterfactual until it
  // no longer demonstrated what it was written to demonstrate.
  assert.deepEqual(foreignColourReads(withGrey(naive, ADR0462_STATUS_TOKENS)), [
    'brown@0.78->grey',
    'green@0.78->grey',
    'yellow@0.78->brown',
    'yellow@0.8->brown',
  ]);

  // AND THE LESSON OUTLIVES THE PALETTE, which is the reason the arm is kept rather than deleted.
  // On TODAY's vocabulary the naive grey still clears the pair the increment named and still fails
  // elsewhere — `healthy`'s dark rung reading as doubt. Fewer reads, same finding: a candidate has
  // to be checked against the WHOLE vocabulary, not against the pair it was aimed at.
  assert.deepEqual(foreignColourReads(withGrey(naive)), ['green@0.78->grey']);

  // ...and the authored slate does none of it. Zero, since the clay: the tan's two were the last.
  assert.deepEqual(foreignColourReads(ADR0462_STATUS_TOKENS), ['yellow@0.78->brown', 'yellow@0.8->brown']);
  assert.deepEqual(foreignColourReads(), []);
});

test('chromaticSeparation is zero for a pure brightness variant and non-zero otherwise', () => {
  // The non-vacuity of the diagnostic itself: a measure that never returned zero would make every
  // pair look chromatically separated, including the one case it exists to name.
  assert.ok(chromaticSeparation('#57544a', '#aea894') < 0.6, 'a scaled copy must read as ~no chroma difference');
  assert.ok(chromaticSeparation(STATUS_TOKENS.get('unknown')!.top[0]!, '#57544a') > 10);
});

// --- the red-green ---------------------------------------------------------------------------

test('ADR-0462 removed four of the six cross-colour misreads, and the clay removed the last two', () => {
  // ⚠ THREE ARMS, TWO OF THEM FROZEN. `before` is the pre-ADR-0462 palette, `mid` is what ADR-0462
  // shipped, `now` is live. Reading `mid` off the live table — which is what this test did until
  // the clay landed — would have turned ADR-0462's recorded outcome into a restatement of today's,
  // and the finding that ONE pair survived it would have vanished with the pair.
  const before = foreignColourReads(LEGACY_STATUS_TOKENS);
  const mid = foreignColourReads(ADR0462_STATUS_TOKENS);
  const after = foreignColourReads();
  assert.deepEqual(before, [
    // brown at full light reading as the old orange-gold `building` yellow
    'brown@1->yellow',
    // and the pair that mattered: a parcel asserting a SIGNED PASS and one asserting NOTHING,
    // trading places in both directions across the ladder
    'green@1->grey',
    'grey@0.78->green',
    'grey@0.8->green',
    'yellow@0.78->brown',
    'yellow@0.8->brown',
  ]);
  assert.deepEqual(mid, ['yellow@0.78->brown', 'yellow@0.8->brown']);
  // What ADR-0462 left was one pair on two rungs — unproven greenfield read as inherited
  // brownfield — and it was the entire remaining scope of the increment that landed the clay.
  assert.deepEqual([...new Set(mid.map((r) => r.split('@')[0]))], ['yellow']);
  // THE CLAY CLOSES IT. Six misreads, then two, then none: no delivered land pixel on any lit rung
  // now reads as a colour other than its own.
  assert.deepEqual(after, []);
});

test('the worst pair of DISTINCT colours went 3.33 -> 8.27 -> 23.72, and brown left the bottom slot', () => {
  const before = worstColourPair(LEGACY_STATUS_TOKENS);
  const mid = worstColourPair(ADR0462_STATUS_TOKENS);
  const after = worstColourPair();
  assert.deepEqual([before.a, before.b].sort(), ['green', 'grey']);
  assert.ok(Math.abs(before.distance - 3.33) < 0.01, `before moved to ${before.distance.toFixed(2)}`);
  // ADR-0462's own recorded figure, frozen against the palette it was taken on.
  assert.deepEqual([mid.a, mid.b].sort(), ['brown', 'yellow']);
  assert.ok(Math.abs(mid.distance - 8.27) < 0.01, `mid moved to ${mid.distance.toFixed(2)}`);
  // ⚠ AND THE WEAKEST LINK IS NO LONGER A BROWN PAIR, which is the rule the clay was picked by:
  // not "clears by N%" — a margin nobody could justify — but a statement about the vocabulary.
  // What binds now is yellow/green, where it already sat and which no edit to brown ever touched.
  assert.deepEqual([after.a, after.b].sort(), ['green', 'yellow']);
  assert.ok(Math.abs(after.distance - 23.72) < 0.01, `after moved to ${after.distance.toFixed(2)}`);
  assert.ok(mid.distance > before.distance * 2, 'the weakest link should have improved by more than 2x');
  assert.ok(after.distance > mid.distance * 2, 'and again by more than 2x');
  // Pairs still UNDER the lighting-step bar: three, then one, then none.
  assert.equal(colourPairs(LEGACY_STATUS_TOKENS).filter((p) => p.distance < p.step).length, 3);
  assert.equal(colourPairs(ADR0462_STATUS_TOKENS).filter((p) => p.distance < p.step).length, 1);
  assert.equal(colourPairs().filter((p) => p.distance < p.step).length, 0);
});

test('colourPairs enumerates COLOURS, never statuses — the merge is not a collision', () => {
  const pairs = colourPairs();
  // five colours -> ten pairs. A status-keyed instrument would produce fifteen, five of them
  // involving `building`, one of which would report a distance of exactly zero.
  assert.equal(pairs.length, 10);
  for (const p of pairs) assert.notEqual(p.a, p.b);
  assert.ok(pairs.every((p) => p.distance > 0));
});

// --- the frozen table ------------------------------------------------------------------------

test('LEGACY_STATUS_TOKENS is HISTORY: it differs from the live palette and is never reconciled', () => {
  assert.deepEqual([...LEGACY_STATUS_TOKENS.keys()].sort(), [...STATUS_TOKENS.keys()].sort());
  // The two states ADR-0462 moved, and only those two.
  const moved = [...STATUS_TOKENS.keys()].filter((st) => {
    const live = STATUS_TOKENS.get(st)!.top;
    const old = LEGACY_STATUS_TOKENS.get(st)!.top;
    return !(live.length === old.length && live.every((t, i) => t === old[i]));
  });
  // Three now: ADR-0462's two, plus `mapped`, whose tan became a clay when the last colour pair
  // was pulled apart. The list is the point — it is what makes the frozen table a RECORD rather
  // than a copy, and it grows by one every time a land colour is re-authored.
  assert.deepEqual(moved.sort(), ['building', 'mapped', 'unknown']);
  // `building` had its own orange-gold; it does not now. `unknown` kept the base grass family and
  // sat four degrees of hue from `healthy`; it does not now.
  assert.equal(LEGACY_STATUS_TOKENS.get('building')!.top[0], '#dcab52');
  assert.equal(LEGACY_STATUS_TOKENS.get('unknown')!.top[0], '#a9c87f');
  assert.notEqual(LEGACY_STATUS_TOKENS.get('building')!.top[0], LEGACY_STATUS_TOKENS.get('proposed')!.top[0]);
});

test('the delivered ramp of every live token is still four distinct colours', () => {
  // The palette closure is `palette-band.ts`'s to prove; what is checked here is only that the
  // newly authored slate has not been given a token so dark that two rungs round together, which
  // would quietly cost the family a quarter of its relief.
  for (const c of LAND_COLOURS) {
    for (const token of tokensOfColour(c)) {
      const delivered = new Set(SHADE_LEVELS.map((l) => toHex(deliveredForLevel(token, l))));
      assert.equal(delivered.size, SHADE_LEVELS.length, `${token} (${c}) collapses two rungs onto one colour`);
    }
  }
});

// --- the second frozen table, and the instrument's own ability to say no -----------------------

test('ADR0462_STATUS_TOKENS is HISTORY too: exactly one family separates it from the live palette', () => {
  assert.deepEqual([...ADR0462_STATUS_TOKENS.keys()].sort(), [...STATUS_TOKENS.keys()].sort());
  const moved = [...STATUS_TOKENS.keys()].filter((st) => {
    const live = STATUS_TOKENS.get(st)!;
    const old = ADR0462_STATUS_TOKENS.get(st)!;
    return old.side !== live.side || !old.top.every((t, i) => t === live.top[i]);
  });
  // ⚠ THE PIN HAS TO BE LOAD-BEARING OR IT IS CEREMONY. If the frozen table and the live one were
  // equal, every `ADR0462_STATUS_TOKENS` argument in this file could be deleted and every test
  // would go on passing — the shape ADR-0462 itself named for `LEGACY_STATUS_TOKENS`. This asserts
  // they differ, and names the single family that differs.
  assert.deepEqual(moved, ['mapped']);
  assert.equal(ADR0462_STATUS_TOKENS.get('mapped')!.top[0], '#b3946a', 'the tan it replaced');
  assert.equal(STATUS_TOKENS.get('mapped')!.top[0], '#b7684e', 'the clay that replaced it');
  // The merge ADR-0462 D2 made is a fact about the OBJECT, and the freeze keeps it that way.
  assert.equal(ADR0462_STATUS_TOKENS.get('proposed'), ADR0462_STATUS_TOKENS.get('building'));
});

test('⚠ THE SEPARATION CHECK CAN FAIL — it REFUSES the palette that shipped before the clay', () => {
  // The whole point of this test. An instrument that has never said no to anything is not known to
  // work, and two instruments on this arc were found in exactly that state (one compared a
  // hand-copied duplicate of its own subject; one timed the wrong thing). So the check is run
  // against the REAL pre-change palette — not a synthetic bad case — and has to refuse it.
  const before = vocabularySeparation(ADR0462_STATUS_TOKENS);
  assert.equal(before.pass, false, 'the pre-clay palette must NOT clear the floor');
  assert.equal(before.tightest.pair, 'yellow/brown');
  assert.ok(Math.abs(before.tightest.ratio - 0.395) < 0.002, `ratio ${before.tightest.ratio.toFixed(3)}`);
  assert.deepEqual(before.under.map((u) => u.pair), ['yellow/brown']);
  assert.deepEqual([...before.foreignReads], ['yellow@0.78->brown', 'yellow@0.8->brown']);

  // ...and it passes the one that shipped after.
  const now = vocabularySeparation();
  assert.equal(now.pass, true);
  assert.equal(now.tightest.pair, 'yellow/green');
  assert.ok(Math.abs(now.tightest.ratio - 1.134) < 0.002, `ratio ${now.tightest.ratio.toFixed(3)}`);
  assert.deepEqual(now.under, []);
  assert.deepEqual([...now.foreignReads], []);
});

test('the verdict ranks by RATIO, not by distance — and the two orderings genuinely disagree', () => {
  // ⚠ THE CORRECTION THIS ENCODES, restated as a property rather than as a comment. `colourPairs`
  // sorts by DISTANCE, so walking that order reads like walking from worst to best and does not:
  // every pair is read against ITS OWN bar, and a large distance under a large bar is TIGHTER than
  // a small distance under a small one. Ranking by distance once produced 1,196 "clearing"
  // candidates in `hue-frontier.ts`'s sweep, all scored on a pair that was not the binding one.
  const byDistance = colourPairs();
  const byRatio = [...byDistance].sort((a, b) => a.distance / a.step - b.distance / b.step);
  const name = (p: { a: string; b: string }) => `${p.a}/${p.b}`;
  assert.notDeepEqual(byDistance.map(name), byRatio.map(name), 'the two orderings must differ');

  // And exhibit the inversion rather than asserting the sequences differ somewhere: a pair that is
  // strictly CLOSER than another and yet stands strictly FURTHER above its own bar. That is the
  // only shape in which "closest" and "tightest" can come apart, and it is what makes the floor's
  // ordering a choice rather than a restatement of `colourPairs`'s.
  const inversions = byDistance.flatMap((near) =>
    byDistance.filter(
      (far) => near.distance < far.distance && near.distance / near.step > far.distance / far.step,
    ).map((far) => `${name(near)} closer than ${name(far)} yet further above its bar`),
  );
  assert.ok(inversions.length > 0, 'no inversion in the live table — check the bars are per-pair');

  // The verdict takes the ratio ordering's first row, never `colourPairs()[0]`.
  assert.equal(vocabularySeparation().tightest.pair, name(byRatio[0]!));
});

test('a vocabulary with nothing to compare is REFUSED, never reported as separated', () => {
  // A floor that returns `pass: true` for an empty comparison would certify any palette it could
  // not read. One colour means zero pairs, so there is no separation to have.
  const oneColour = new Map([['healthy', 'green' as const]]);
  assert.throws(() => vocabularySeparation(STATUS_TOKENS, oneColour), /cannot be judged separated/);
});
