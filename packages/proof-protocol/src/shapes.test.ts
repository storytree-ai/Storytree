import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Tier,
  Status,
  ProofMode,
  Outcome,
  UatWitness,
  EvidenceRef,
  Verdict,
  VerdictOutputVersion,
  SigningRow,
  TextQuote,
  Anchor,
  ChangeEvent,
  DriftState,
  Attestation,
  WorkEventDoc,
  WORK_EVENT_KIND,
  SIGNING_EVENT_KIND,
} from "./index.js";

// ---------------------------------------------------------------------------
// Each schema round-trips a representative valid doc and rejects an invalid one.
// ---------------------------------------------------------------------------

test("Tier round-trips a valid option and rejects an unknown one", () => {
  assert.equal(Tier.parse("capability"), "capability");
  assert.equal(Tier.safeParse("epic").success, false);
});

test("Status round-trips a valid option and rejects an unknown one", () => {
  assert.equal(Status.parse("healthy"), "healthy");
  assert.equal(Status.safeParse("green").success, false);
});

test("ProofMode round-trips a valid option and rejects an unknown one", () => {
  assert.equal(ProofMode.parse("operator-attested"), "operator-attested");
  // ADR-0085: `adopted` is the brownfield observe-and-sign mode (ADR-0083 Fork B resolved).
  assert.equal(ProofMode.parse("adopted"), "adopted");
  assert.equal(ProofMode.safeParse("manual").success, false);
});

test("Outcome round-trips a valid option and rejects an unknown one", () => {
  assert.equal(Outcome.parse("pass"), "pass");
  assert.equal(Outcome.safeParse("green").success, false);
});

test("UatWitness round-trips a valid option and rejects an unknown one", () => {
  assert.equal(UatWitness.parse("human"), "human");
  assert.equal(UatWitness.safeParse("robot").success, false);
});

test("VerdictOutputVersion accepts v1 and rejects anything else", () => {
  assert.equal(VerdictOutputVersion.parse("v1"), "v1");
  assert.equal(VerdictOutputVersion.safeParse("v2").success, false);
});

test("EvidenceRef round-trips a valid doc and rejects a malformed one", () => {
  const valid = { kind: "test-log", ref: "runs/42.log", note: "the green run" };
  assert.deepEqual(EvidenceRef.parse(valid), valid);
  // missing required `ref`
  assert.equal(EvidenceRef.safeParse({ kind: "test-log" }).success, false);
  // unknown field (strict)
  assert.equal(
    EvidenceRef.safeParse({ kind: "x", ref: "y", extra: 1 }).success,
    false,
  );
});

test("Verdict round-trips a valid doc and rejects a malformed one", () => {
  const valid = {
    unitId: "stories/library#uat-1",
    proofMode: "story" as const,
    outcome: "pass" as const,
    commitSha: "abc123",
    signer: "hua.mick@gmail.com",
    runId: "run-1",
    outputVersion: "v1" as const,
    boundHash: "fnv1:deadbeef",
    evidence: [{ kind: "test-log", ref: "runs/1.log" }],
    at: "2026-06-18T00:00:00.000Z",
  };
  assert.deepEqual(Verdict.parse(valid), valid);
  // wrong type for a required field
  assert.equal(Verdict.safeParse({ ...valid, outcome: "maybe" }).success, false);
  // unknown field (strict)
  assert.equal(Verdict.safeParse({ ...valid, rogue: true }).success, false);
});

test("Verdict: boundHash is preserved when present and absent when omitted (ADR-0016 back-compat)", () => {
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
  // present → preserved
  const hash = "fnv1a:deadbeef";
  assert.equal(Verdict.parse({ ...base, boundHash: hash }).boundHash, hash);
  // absent → undefined (a pre-ADR-0016 verdict round-trips)
  assert.equal(Verdict.parse(base).boundHash, undefined);
});

test("Verdict: approvedBy is preserved when present and absent when omitted (ADR-0097 back-compat)", () => {
  const base = {
    unitId: "library#gate-1",
    proofMode: "adopted" as const,
    outcome: "pass" as const,
    commitSha: "abc1234",
    signer: "spine@storytree",
    runId: "run-1",
    evidence: [],
    at: "2026-06-23T00:00:00.000Z",
  };
  // present → preserved (the human who approved the adoption, distinct from the spine signer)
  assert.equal(Verdict.parse({ ...base, approvedBy: "hua.mick@gmail.com" }).approvedBy, "hua.mick@gmail.com");
  // absent → undefined (a pre-ADR-0097 / non-adoption verdict round-trips)
  assert.equal(Verdict.parse(base).approvedBy, undefined);
});

test("Verdict.outputVersion defaults cleanly to v1 when omitted (additive/back-compat)", () => {
  const legacy = {
    unitId: "u",
    proofMode: "contract" as const,
    outcome: "pass" as const,
    commitSha: "sha",
    signer: "s",
    runId: "r",
    at: "2026-06-18T00:00:00.000Z",
    // outputVersion intentionally omitted — a pre-ADR-0068 doc
  };
  const parsed = Verdict.parse(legacy);
  assert.equal(parsed.outputVersion, "v1");
  // evidence also defaults to [] — the legacy doc round-trips and gains both defaults
  assert.deepEqual(parsed.evidence, []);
});

test("SigningRow round-trips a valid doc and rejects a malformed one", () => {
  const valid = {
    id: "sig-1",
    unitId: "u",
    proofMode: "capability" as const,
    outcome: "pass" as const,
    commitSha: "sha",
    signer: "s",
    at: "2026-06-18T00:00:00.000Z",
    verdictRef: "verdict-1",
  };
  assert.deepEqual(SigningRow.parse(valid), valid);
  assert.equal(SigningRow.safeParse({ ...valid, proofMode: "bogus" }).success, false);
});

test("TextQuote round-trips a valid doc and rejects a malformed one", () => {
  const valid = { exact: "const x = 1;", prefix: "// before\n", suffix: "\n// after" };
  assert.deepEqual(TextQuote.parse(valid), valid);
  assert.equal(TextQuote.safeParse({ prefix: "no exact" }).success, false);
});

test("Anchor round-trips a valid doc and rejects a malformed one", () => {
  const valid = {
    file: "packages/core/src/proof.ts",
    symbol: "Verdict",
    quote: { exact: "z.object" },
    boundHash: "fnv1:cafe",
    boundCommit: "abc",
  };
  assert.deepEqual(Anchor.parse(valid), valid);
  // empty file (min 1) and missing boundHash both reject
  assert.equal(Anchor.safeParse({ file: "", boundHash: "h" }).success, false);
  assert.equal(Anchor.safeParse({ file: "f" }).success, false);
});

test("ChangeEvent round-trips a valid doc and rejects a malformed one", () => {
  const valid = {
    unitId: "u#uat-1",
    hashBefore: "fnv1:aaaa",
    hashAfter: "fnv1:bbbb",
    description: "renamed the field",
    author: "hua.mick@gmail.com",
    at: "2026-06-18T00:00:00.000Z",
    commitSha: "abc",
  };
  assert.deepEqual(ChangeEvent.parse(valid), valid);
  // blank required field (min 1) rejects
  assert.equal(ChangeEvent.safeParse({ ...valid, author: "" }).success, false);
});

test("DriftState round-trips a valid option and rejects an unknown one", () => {
  assert.equal(DriftState.parse("stale"), "stale");
  assert.equal(DriftState.safeParse("rotten").success, false);
});

test("Attestation round-trips a valid doc and rejects a malformed one", () => {
  const valid = {
    testId: "stories/library#uat-1",
    outcome: "pass" as const,
    witness: "human" as const,
    signer: "hua.mick@gmail.com",
    at: "2026-06-18T00:00:00.000Z",
    note: "clicked it, the panel rendered",
    relayedBy: "session-7",
  };
  assert.deepEqual(Attestation.parse(valid), valid);
  // blank signer is fail-closed (refine) — rejects
  assert.equal(Attestation.safeParse({ ...valid, signer: "   " }).success, false);
  // unknown field (strict) rejects
  assert.equal(Attestation.safeParse({ ...valid, sneaky: 1 }).success, false);
});

test("WorkEventDoc round-trips a valid doc and rejects a malformed one", () => {
  const valid = {
    unitId: "stories/library",
    event: "building" as const,
    runId: "run-1",
    tier: "story" as const,
  };
  assert.deepEqual(WorkEventDoc.parse(valid), valid);
  // a minimal doc (only the required fields) round-trips
  assert.deepEqual(WorkEventDoc.parse({ unitId: "u", event: "proposed" }), {
    unitId: "u",
    event: "proposed",
  });
  // unknown lifecycle event rejects
  assert.equal(WorkEventDoc.safeParse({ unitId: "u", event: "shipped" }).success, false);
  // unknown field (strict) rejects
  assert.equal(WorkEventDoc.safeParse({ ...valid, rogue: 1 }).success, false);
});

test("WorkEventDoc carries an optional red-green build phase on the wire (ADR-0048 §3 v2)", () => {
  // The phase-resolved wisp's wire: a `building` work-event may carry the LIVE
  // prove-it-gate phase, so the studio can colour the orbiting wisp red/green
  // without a NEW lifecycle word (ADR-0048 "No new lifecycle word") — it rides as
  // a field on the SAME `building` event doc.
  const withPhase = {
    unitId: "stories/library",
    event: "building" as const,
    runId: "run-1",
    tier: "story" as const,
    phase: "CONFIRM_RED" as const,
  };
  assert.deepEqual(WorkEventDoc.parse(withPhase), withPhase);
  // every gate phase is accepted on the wire.
  for (const phase of ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"] as const) {
    assert.equal(WorkEventDoc.safeParse({ unitId: "u", event: "building", phase }).success, true, phase);
  }
  // BACK-COMPAT: a building doc with NO phase still round-trips (every pre-ADR-0048
  // writer omits it — the studio reads it as the coarse "building" band).
  assert.deepEqual(WorkEventDoc.parse({ unitId: "u", event: "building" }), {
    unitId: "u",
    event: "building",
  });
  // an unknown phase value is rejected — the wire is constrained to the five gate phases.
  assert.equal(WorkEventDoc.safeParse({ unitId: "u", event: "building", phase: "SHIPPING" }).success, false);
});

test("the work/signing store kinds are the published literals", () => {
  assert.equal(WORK_EVENT_KIND, "work");
  assert.equal(SIGNING_EVENT_KIND, "signing");
});
