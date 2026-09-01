/**
 * ADR-0411 D3's two marks — as tuned by ADR-0499 D1 — and the band a reading falls in.
 *
 * SMALL ON PURPOSE, AND NOT DECORATION: these numbers are read by two surfaces that must agree —
 * the studio's context meter and `storytree context` — and they are the reason the marks live in
 * one module rather than one per surface. What is pinned here is the BOUNDARY BEHAVIOUR, which is
 * the only part of a threshold anyone ever gets wrong: a reading of exactly 700,000 is already past
 * the soft mark, and exactly 850,000 is already past the hard one. ADR-0411 D8 says the numbers may
 * be tuned; the `>=` on each side is what must survive the tuning, which is why those cases are
 * written against the constants rather than against literals.
 *
 * ★ THE LITERALS BELOW ARE THE TUNE ITSELF, AND THEY EARN THEIR PLACE. A suite written only against
 * the constants stays green for ANY pair of numbers — including the 400K/500K pair ADR-0499 was
 * decided to remove. So the old marks are asserted to be CALM now: that is the assertion that was
 * red before the tune and is the one a future re-tune must consciously rewrite.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bandGuidance,
  bandOf,
  HARD_MARK_TOKENS,
  MARKS_GOVERN_THE_NEXT_UNIT,
  SOFT_MARK_TOKENS,
} from "./context-marks.js";

test("the marks are ADR-0499 D1's numbers, and the hard mark is the higher one", () => {
  assert.equal(SOFT_MARK_TOKENS, 700_000);
  assert.equal(HARD_MARK_TOKENS, 850_000);
  assert.ok(SOFT_MARK_TOKENS < HARD_MARK_TOKENS);
});

test("each band starts AT its mark, not one token past it", () => {
  assert.equal(bandOf(0), "calm");
  assert.equal(bandOf(SOFT_MARK_TOKENS - 1), "calm");
  assert.equal(bandOf(SOFT_MARK_TOKENS), "soft");
  assert.equal(bandOf(HARD_MARK_TOKENS - 1), "soft");
  assert.equal(bandOf(HARD_MARK_TOKENS), "hard");
  assert.equal(bandOf(HARD_MARK_TOKENS * 2), "hard");
});

test("the bands sit at ADR-0499 D1's boundaries, and the OLD marks are now calm", () => {
  // The tune, stated as behaviour rather than as two constants. 400K/500K were the soft and hard
  // marks until 2026-09-01; a session reading either of them now has room for another increment.
  assert.equal(bandOf(400_000), "calm");
  assert.equal(bandOf(500_000), "calm");
  assert.equal(bandOf(699_999), "calm");
  assert.equal(bandOf(700_000), "soft");
  assert.equal(bandOf(849_999), "soft");
  assert.equal(bandOf(850_000), "hard");
});

test("every band carries D3's own instruction, and the three differ", () => {
  const said = (["calm", "soft", "hard"] as const).map(bandGuidance);
  assert.equal(new Set(said).size, 3, "two bands telling a session the same thing is not a reading");
  assert.match(bandGuidance("soft"), /no new increment/i);
  assert.match(bandGuidance("hard"), /hand(over)?|fresh session/i);
  assert.match(bandGuidance("calm"), /room/i);
});

test("what a mark asks for is stated once, verbatim, and it is about the NEXT unit", () => {
  // ADR-0499 D2-D4, pinned WHOLE rather than by probe. Deliberately brittle: this clause is what
  // the guidance projections carry, so re-wording it is meant to stop here and be re-decided.
  //
  // ⚠ A GOLDEN EQUALITY, not four `assert.match` probes, and the reason is mechanical. The constant
  // is a five-segment `+` concatenation, and each segment is its OWN string-literal mutant — probes
  // matching four of them left the fifth ("…deciding about is always wrong…") alive under
  // `check:mutation-diff`, which is a clause that could have been silently deleted.
  assert.equal(
    MARKS_GOVERN_THE_NEXT_UNIT,
    "The marks govern whether you take the NEXT unit, never how carefully you do THIS one. If" +
      " finishing the unit in hand properly crosses a mark, cross it — that is the expected case," +
      " not a failure. Below the soft mark there is no economy to practise, and economising on the" +
      " very artifact you are deciding about is always wrong: if the window cannot hold what your" +
      " conclusion rests on, hand over or fan out to a subagent whose window is its own, never read" +
      " it partially.",
  );
});

test("no band's short form drifts into advice about how to do the work in hand", () => {
  // The guard on ADR-0499 D2 at the place it would actually be violated: these three strings are
  // what both surfaces print beside the number, so a word like "economical" or "sparing" here would
  // re-teach the exact reading the decision removes.
  for (const band of ["calm", "soft", "hard"] as const) {
    assert.doesNotMatch(
      bandGuidance(band),
      /econom|sparing|budget|conserve|ration|careful/i,
      `bandGuidance(${band}) tells a session how to do the unit in hand, not whether to take the next`,
    );
  }
});
