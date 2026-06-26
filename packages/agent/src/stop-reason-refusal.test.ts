/**
 * Regression test: StopReason must recognise the Anthropic Messages API's "refusal"
 * stop_reason (returned when the model declines for safety).
 *
 * RED phase: asserts StopReason.parse("refusal") === "refusal".
 * Against the unedited enum (which lacks "refusal"), .parse throws a ZodError —
 * the right-kind red. The two sibling assertions prove the enum is WIDENED
 * to admit one real value, never relaxed into accepting anything.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StopReason } from "./model-events.js";

describe("StopReason", () => {
  it('parses "refusal" — the Anthropic safety-decline stop reason', () => {
    assert.equal(StopReason.parse("refusal"), "refusal");
  });

  it('still parses existing values — "end_turn" is unaffected', () => {
    assert.equal(StopReason.parse("end_turn"), "end_turn");
  });

  it("still rejects a bogus value — the enum is not relaxed to accept anything", () => {
    assert.throws(() => StopReason.parse("nope"), { name: "ZodError" });
  });
});
