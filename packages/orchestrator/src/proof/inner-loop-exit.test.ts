import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTEMPT_CEILING,
  ATTEMPT_DECISION_POINT,
  adjudicateLanding,
  decideAttempt,
  type AttemptRecord,
} from "./inner-loop-exit.js";

// ── D1: an opinion may not veto an observation ──────────────────────────────────────────────────

test("a signed verdict with no objection lands", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: true,
  });
  assert.equal(got.disposition, "land");
  assert.equal(got.mayRefuse, false);
  assert.equal(got.escalates, false);
});

test("a TEST-QUALITY objection may not veto a signed verdict — it routes to the mutation rung", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: true,
    objection: {
      kind: "test-quality",
      statement: "Matching 11 names is not complete proof",
    },
  });
  assert.equal(got.disposition, "land-and-measure");
  assert.equal(got.mayRefuse, false, "the orchestrator's own reading of the tests is not a veto");
  assert.match(got.inadmissible ?? "", /ADR-0563 D1/);
  // The suspicion is not discarded — it is routed to the instrument that can settle it.
  assert.match(got.reason, /mutation rung/i);
});

test("a test-quality objection where the mutation rung CANNOT reach escalates instead of self-auditing", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: false,
    objection: {
      kind: "test-quality",
      statement: "the assertions look semantically irrelevant",
    },
  });
  assert.equal(got.disposition, "land-and-declare-gap");
  assert.equal(got.mayRefuse, false);
  assert.equal(got.escalates, true, "ADR-0563 D3: no strength signal means escalate, never self-audit");
  assert.match(got.inadmissible ?? "", /ADR-0563 D1/);
});

test("a RULE VIOLATION is the one admissible veto, and it must name the decision it breaks", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: true,
    objection: {
      kind: "rule-violation",
      statement: "the leaf granted itself shell proof-feedback",
      decision: "ADR-0232 D5",
    },
  });
  assert.equal(got.disposition, "refuse");
  assert.equal(got.mayRefuse, true);
  assert.equal(got.escalates, false, "enforcing an existing decision creates no owner question");
  assert.match(got.reason, /ADR-0232 D5/);
});

test("a rule-violation objection naming NO decision is inadmissible — it is an opinion wearing a rule's clothes", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: true,
    objection: { kind: "rule-violation", statement: "this feels wrong" },
  });
  assert.equal(got.mayRefuse, false);
  assert.equal(got.disposition, "land-and-measure");
  assert.match(got.inadmissible ?? "", /names no standing decision/i);
});

test("a blank decision string is refused exactly as an absent one is", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: true,
    objection: { kind: "rule-violation", statement: "x", decision: "   " },
  });
  assert.equal(got.mayRefuse, false);
});

test("SURVIVING MUTANTS are an observation and justify rework", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: true,
    objection: {
      kind: "surviving-mutants",
      statement: "7 mutants survived in the new module",
      survivors: 7,
    },
  });
  assert.equal(got.disposition, "rework");
  assert.equal(got.mayRefuse, true);
  assert.equal(got.inadmissible, undefined);
});

test("ZERO surviving mutants is a pass, not an objection — the rung ran and found nothing", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: true,
    strengthSignalAvailable: true,
    objection: { kind: "surviving-mutants", statement: "ran the rung", survivors: 0 },
  });
  assert.equal(got.disposition, "land");
  assert.equal(got.mayRefuse, false);
  assert.match(got.inadmissible ?? "", /no mutant survived/i);
});

test("an UNSIGNED unit is not adjudicated here — there is no verdict to land or veto", () => {
  const got = adjudicateLanding({
    unitId: "cap-a",
    signed: false,
    strengthSignalAvailable: true,
    objection: { kind: "test-quality", statement: "weak" },
  });
  assert.equal(got.disposition, "not-signed");
  assert.equal(got.mayRefuse, false);
});

// ── D4: attempt three is a recorded decision point ──────────────────────────────────────────────

const failed = (incrementId = "arc-inc-01"): AttemptRecord => ({ incrementId, signed: false });
const signed = (incrementId = "arc-inc-01"): AttemptRecord => ({ incrementId, signed: true });

test("below the decision point the loop proceeds", () => {
  const got = decideAttempt({ unitId: "cap-a", attempts: [failed(), failed()] });
  assert.equal(got.disposition, "proceed");
  assert.equal(got.consecutiveFailures, 2);
  assert.equal(got.remainingBeforeDecision, 1);
});

test("no attempts yet is a proceed, not a decision point", () => {
  assert.equal(decideAttempt({ unitId: "cap-a", attempts: [] }).disposition, "proceed");
});

test("the THIRD consecutive failure STOPS the loop and demands a recorded decision", () => {
  const got = decideAttempt({ unitId: "cap-a", attempts: [failed(), failed(), failed()] });
  assert.equal(got.disposition, "stop-and-decide");
  assert.equal(got.consecutiveFailures, ATTEMPT_DECISION_POINT);
  assert.equal(got.remainingBeforeDecision, 0);
});

test('"a better spec" is NOT a difference — it is the ratchet D1 forbids, wearing another hat', () => {
  const got = decideAttempt({
    unitId: "cap-a",
    attempts: [failed(), failed(), failed()],
    grant: { attempts: 3, kind: "better-spec", difference: "raise the acceptance bar" },
  });
  assert.equal(got.disposition, "refused");
  assert.match(got.reason, /better spec/i);
});

test("a grant naming a CHANGED INPUT, a FIXED DEFECT, a NEW OBSERVATION or a REVISED TEST is admissible", () => {
  for (const kind of ["changed-input", "fixed-defect", "new-observation", "revised-test"] as const) {
    const got = decideAttempt({
      unitId: "cap-a",
      attempts: [failed(), failed(), failed()],
      grant: { attempts: 2, kind, difference: `something real: ${kind}` },
    });
    assert.equal(got.disposition, "granted", `${kind} should be admissible`);
    assert.equal(got.granted, 2);
  }
});

test("an admissible KIND with no stated difference is still refused — the recording IS the decision", () => {
  const got = decideAttempt({
    unitId: "cap-a",
    attempts: [failed(), failed(), failed()],
    grant: { attempts: 2, kind: "fixed-defect", difference: "  " },
  });
  assert.equal(got.disposition, "refused");
  assert.match(got.reason, /what will be different/i);
});

test("a grant of zero or fewer attempts is refused rather than silently granting none", () => {
  const got = decideAttempt({
    unitId: "cap-a",
    attempts: [failed(), failed(), failed()],
    grant: { attempts: 0, kind: "fixed-defect", difference: "fixed the connector" },
  });
  assert.equal(got.disposition, "refused");
});

test("at the CEILING the call passes to the owner — even carrying a perfectly good grant", () => {
  const attempts = Array.from({ length: ATTEMPT_CEILING }, () => failed());
  const got = decideAttempt({
    unitId: "cap-a",
    attempts,
    grant: { attempts: 3, kind: "fixed-defect", difference: "found the real defect this time" },
  });
  assert.equal(got.disposition, "escalate");
  assert.match(got.reason, /owner/i);
});

test("the 2026-09 run's twenty-one attempts escalate rather than proceeding", () => {
  const got = decideAttempt({ unitId: "cap-a", attempts: Array.from({ length: 21 }, () => failed()) });
  assert.equal(got.disposition, "escalate");
});

test("a SIGNED verdict ends the loop — there is nothing left to attempt", () => {
  const got = decideAttempt({ unitId: "cap-a", attempts: [failed(), failed(), failed(), signed()] });
  assert.equal(got.disposition, "signed");
  assert.equal(got.consecutiveFailures, 0, "failures are CONSECUTIVE — a signed attempt resets them");
});

test("failures are counted from the TAIL, so an old failure before a signed attempt does not accumulate", () => {
  const got = decideAttempt({
    unitId: "cap-a",
    attempts: [failed(), failed(), signed(), failed()],
  });
  assert.equal(got.consecutiveFailures, 1);
  assert.equal(got.disposition, "proceed");
});

// ── D5: a retry reuses its increment ────────────────────────────────────────────────────────────

test("attempts sharing ONE increment do not flag the per-attempt minting D5 forbids", () => {
  const got = decideAttempt({ unitId: "cap-a", attempts: [failed("inc-01"), failed("inc-01")] });
  assert.equal(got.mintedPerAttempt, false);
  assert.deepEqual(got.increments, ["inc-01"]);
});

test("a retry that MINTED A NEW INCREMENT is flagged — that is what falsified the arc's own log", () => {
  const got = decideAttempt({
    unitId: "cap-a",
    attempts: [failed("inc-ninth-plan"), failed("inc-tenth-plan"), failed("inc-eleventh-plan")],
  });
  assert.equal(got.mintedPerAttempt, true);
  assert.equal(got.increments.length, 3);
  assert.match(got.reason, /ADR-0563 D5/);
});

test("the D5 flag does not change the attempt disposition — it is a separate finding", () => {
  const got = decideAttempt({ unitId: "cap-a", attempts: [failed("a"), failed("b")] });
  assert.equal(got.mintedPerAttempt, true);
  assert.equal(got.disposition, "proceed");
});
