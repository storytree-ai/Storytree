/**
 * ADR-0411 D3's two marks and the band a reading falls in.
 *
 * SMALL ON PURPOSE, AND NOT DECORATION: these four numbers are read by two surfaces that must agree
 * — the studio's context meter and `storytree context` — and they are the reason the marks live in
 * one module rather than one per surface. What is pinned here is the BOUNDARY BEHAVIOUR, which is
 * the only part of a threshold anyone ever gets wrong: a reading of exactly 400,000 is already past
 * the soft mark, and exactly 500,000 is already past the hard one. ADR-0411 D8 says the numbers may
 * be tuned; the `>=` on each side is what must survive the tuning.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { bandGuidance, bandOf, HARD_MARK_TOKENS, SOFT_MARK_TOKENS } from "./context-marks.js";

test("the marks are ADR-0411 D3's own numbers, and the hard mark is the higher one", () => {
  assert.equal(SOFT_MARK_TOKENS, 400_000);
  assert.equal(HARD_MARK_TOKENS, 500_000);
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

test("every band carries D3's own instruction, and the three differ", () => {
  const said = (["calm", "soft", "hard"] as const).map(bandGuidance);
  assert.equal(new Set(said).size, 3, "two bands telling a session the same thing is not a reading");
  assert.match(bandGuidance("soft"), /no new increment/i);
  assert.match(bandGuidance("hard"), /hand(over)?|fresh session/i);
  assert.match(bandGuidance("calm"), /room/i);
});
