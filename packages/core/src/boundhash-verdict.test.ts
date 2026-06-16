/**
 * Regression test for ADR-0016 boundHash on Verdict (AUTHOR_TEST phase).
 *
 * Pins: a Verdict parsed with a `boundHash` field must succeed and preserve
 * the hash value.  At HEAD the `.strict()` schema rejects the unknown key,
 * so `Verdict.parse({…, boundHash})` throws — the genuine red.  After the
 * field is added to the schema the same parse succeeds.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Verdict } from "./proof.js";

const base = {
  unitId: "u1",
  proofMode: "contract" as const,
  outcome: "pass" as const,
  commitSha: "abc1234",
  signer: "tester@example.com",
  runId: "run-1",
  evidence: [],
  at: "2026-06-16T00:00:00.000Z",
};

describe("Verdict boundHash", () => {
  it("accepts and preserves boundHash when present", () => {
    const hash = "fnv1a:deadbeef";
    const verdict = Verdict.parse({ ...base, boundHash: hash });
    assert.equal(
      verdict.boundHash,
      hash,
      "parsed Verdict must carry the boundHash that was supplied",
    );
  });

  it("remains valid when boundHash is absent (back-compat)", () => {
    const verdict = Verdict.parse(base);
    assert.equal(
      verdict.boundHash,
      undefined,
      "boundHash must be absent when not supplied",
    );
  });
});
