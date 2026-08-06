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

  // ── ADR-0127: the per-contract coverage axis is surfaced when present ───────────────────────────

  it("appends a coverage summary + flags the uncovered contracts when contractCoverage is present", () => {
    const verdict: Verdict = {
      ...base,
      contractCoverage: {
        covered: ["fr-connects", "fr-streams", "fr-reconnects"],
        uncovered: ["fr-bounded-never-hangs"],
      },
    };
    const line = verdictLine(verdict);
    // the base line is preserved verbatim, with a coverage clause appended
    assert.ok(
      line.startsWith(
        "PASS verdict-line (contract) — signed by hua.mick@gmail.com @ abc1234, 2026-06-10T00:00:00.000Z",
      ),
      line,
    );
    assert.match(line, /coverage 3\/4 contracts/);
    assert.match(line, /uncovered: fr-bounded-never-hangs/);
  });

  it("reports full coverage with no uncovered clause when every contract is covered", () => {
    const verdict: Verdict = { ...base, contractCoverage: { covered: ["c-1", "c-2"], uncovered: [] } };
    const line = verdictLine(verdict);
    assert.match(line, /coverage 2\/2 contracts/);
    assert.doesNotMatch(line, /uncovered/);
  });

  it("omits the coverage clause entirely when contractCoverage is absent (pre-ADR-0127 back-compat)", () => {
    assert.doesNotMatch(verdictLine(base), /coverage/);
  });

  // ── the unread-titles qualifier: an `uncovered` list must not be read as a claim about the TESTS
  //    when part of the surface was never legible to the static reader ──────────────────────────────

  it("appends an unread-titles caveat beside the uncovered list, so the two claims stay distinct", () => {
    const verdict: Verdict = {
      ...base,
      contractCoverage: { covered: ["c-1"], uncovered: ["c-2"], unreadTitles: 2 },
    };
    const line = verdictLine(verdict);
    assert.match(line, /coverage 1\/2 contracts/);
    assert.match(line, /uncovered: c-2/);
    assert.match(line, /2 title\(s\) unread/);
  });

  it("renders the caveat even when nothing is uncovered — it qualifies the READ, not just the gap", () => {
    const verdict: Verdict = {
      ...base,
      contractCoverage: { covered: ["c-1"], uncovered: [], unreadTitles: 1 },
    };
    const line = verdictLine(verdict);
    assert.match(line, /1 title\(s\) unread/);
    assert.doesNotMatch(line, /uncovered/);
  });

  it("a measured-clean `unreadTitles: 0` renders byte-identically to a verdict carrying no count", () => {
    // Stamping the zero is how the AXIS distinguishes "measured clean" from "never measured"; the
    // RENDER has nothing to add for a clean read, so every currently-clean verdict line is unchanged.
    const withZero: Verdict = {
      ...base,
      contractCoverage: { covered: ["c-1", "c-2"], uncovered: [], unreadTitles: 0 },
    };
    const without: Verdict = {
      ...base,
      contractCoverage: { covered: ["c-1", "c-2"], uncovered: [] },
    };
    assert.equal(verdictLine(withZero), verdictLine(without));
    assert.doesNotMatch(verdictLine(withZero), /unread/);
  });
});
