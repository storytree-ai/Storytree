import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verdictLine } from "./verdict-line.js";
import type { Verdict } from "@storytree/proof-protocol";

const base: Verdict = {
  unitId: "verdict-line",
  proofMode: "contract",
  outcome: "pass",
  commitSha: "abc1234def",
  signer: "hua.mick@gmail.com",
  runId: "run-001",
  outputVersion: "v1",
  evidence: [],
  at: "2026-06-10T00:00:00.000Z",
};

describe("verdictLine", () => {
  it("renders a PASS verdict in the expected format", () => {
    const line = verdictLine(base);
    assert.equal(
      line,
      "PASS verdict-line (contract) — signed by hua.mick@gmail.com @ abc1234, 2026-06-10T00:00:00.000Z"
    );
  });

  it("renders a FAIL verdict in the expected format", () => {
    const verdict: Verdict = { ...base, outcome: "fail" };
    const line = verdictLine(verdict);
    assert.equal(
      line,
      "FAIL verdict-line (contract) — signed by hua.mick@gmail.com @ abc1234, 2026-06-10T00:00:00.000Z"
    );
  });

  it("uses only the first 7 characters of commitSha", () => {
    const verdict: Verdict = { ...base, commitSha: "abc1234xyz999" };
    const line = verdictLine(verdict);
    assert.ok(line.includes("@ abc1234,"), `expected short sha in: ${line}`);
  });

  it("uses a short commitSha as-is (no padding)", () => {
    const verdict: Verdict = { ...base, commitSha: "abc" };
    const line = verdictLine(verdict);
    assert.ok(line.includes("@ abc,"), `expected short sha used as-is in: ${line}`);
  });

  it("produces no trailing newline", () => {
    const line = verdictLine(base);
    assert.equal(line, line.trimEnd());
    assert.ok(!line.includes("\n"), "should not contain newline");
  });

  it("upper-cases different proof modes", () => {
    const capability: Verdict = { ...base, proofMode: "capability" };
    const story: Verdict = { ...base, proofMode: "story" };
    assert.ok(verdictLine(capability).includes("(capability)"));
    assert.ok(verdictLine(story).includes("(story)"));
  });

  it("reflects the unitId in the output", () => {
    const verdict: Verdict = { ...base, unitId: "some-other-unit" };
    const line = verdictLine(verdict);
    assert.ok(line.startsWith("PASS some-other-unit ("), `expected unitId in: ${line}`);
  });
});
