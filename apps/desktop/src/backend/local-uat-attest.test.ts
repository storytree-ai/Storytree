// Contract test for local-uat-attest.ts — a local human signs a declared UAT leg at a clean git
// HEAD and persists the real operator-attested verdict through the injected brokered forest writer
// (the "brokered-local-uat-signing" capability, stories/desktop/brokered-local-uat-signing.md).
//
// WHAT IT PINS:
//  - a declared HUMAN (or EITHER) leg, a real non-agent local operator, a clean valid HEAD, and an
//    accepting writer produce ONE proof-protocol-valid `operator-attested` Verdict, persisted through
//    exactly one `ForestWriter.write({ type: "verdict", payload })` call — success is reported ONLY
//    after the writer confirms `persisted: true`;
//  - every honesty wall REFUSES before the writer is ever called: a machine-witness leg, a blank /
//    `sandbox:` / agent-equal signer (the shared @storytree/orchestrator checkUatProof trust guard),
//    a dirty or malformed git HEAD, a malformed/unknown test id, and an invalid outcome;
//  - a broker refusal (`persisted: false`) is surfaced honestly with its guidance — never a forged
//    "signed" success just because the local build of the verdict succeeded.
//
// DELETION TEST: remove the writer call and contract 1's "writer called exactly once" assertion
// fails; remove any honesty wall and its matching refusal-before-write assertion in contract 2 fails
// (the writer-call-count would go non-zero); remove the persisted:true gate and contract 3's
// "still refused" assertion fails (a broker 403 would read back as a signed success).
//
// TIER: contract/unit — an in-memory ForestWriter double, no Electron, no HTTP server, no DB, no
// hosted broker, no live SDK. Uses the REAL @storytree/orchestrator checkUatProof trust guard (no
// mock of the honesty compute itself — only the network-facing ForestWriter is doubled).

import { test } from "node:test";
import assert from "node:assert/strict";

import { Verdict } from "@storytree/proof-protocol";
import type { UatTestWitness } from "@storytree/library";

import { attestLocalUat } from "./local-uat-attest.js";
import type { AttestLocalUatInput, LocalUatDeclaredTest } from "./local-uat-attest.js";
import type { ForestWriter } from "./local-backend.js";
import type { ForestWrite, ForestWriteResult } from "./forest-readiness.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function declaredTest(id: string, witness: UatTestWitness): LocalUatDeclaredTest {
  return { id, witness };
}

const HUMAN_TEST = declaredTest("desktop#uat-1", "human");
const MACHINE_TEST = declaredTest("desktop#uat-2", "machine");
const EITHER_TEST = declaredTest("desktop#uat-3", "either");
const DECLARED_TESTS: readonly LocalUatDeclaredTest[] = [HUMAN_TEST, MACHINE_TEST, EITHER_TEST];

const OPERATOR = "owner@example.com";
const AGENT_IDENTITY = "sandbox:claude-opus-4-8@run-9";
const CLEAN_SHA = "ca".repeat(20); // 40 hex chars — a real-shaped commit SHA
const AT = "2026-07-10T00:00:00.000Z";

/** A double `ForestWriter` recording every write it receives and returning a fixed result. */
function makeWriter(result: ForestWriteResult): { writer: ForestWriter; calls: ForestWrite[] } {
  const calls: ForestWrite[] = [];
  return {
    calls,
    writer: {
      write: async (w) => {
        calls.push(w);
        return result;
      },
    },
  };
}

/** A fully-valid baseline input (human leg, trusted operator, clean HEAD) — override per case. */
function baseInput(
  writer: ForestWriter,
  overrides: Partial<AttestLocalUatInput> = {},
): AttestLocalUatInput {
  return {
    testId: HUMAN_TEST.id,
    outcome: "pass",
    at: AT,
    tests: DECLARED_TESTS,
    signer: OPERATOR,
    agentIdentity: AGENT_IDENTITY,
    git: { commitSha: CLEAN_SHA, clean: true },
    forestWriter: writer,
    ...overrides,
  };
}

// ── luat-persists-a-real-human-verdict-through-the-broker ─────────────────────────────────────

test("luat-persists-a-real-human-verdict-through-the-broker: a trusted human signs a declared human leg and it persists through the broker", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: { ok: true } });
  const input = baseInput(writer, { note: "  saw it work in the desktop app  " });

  const result = await attestLocalUat(input);

  assert.equal(result.ok, true, "a trusted human signature over a declared human leg must succeed");
  assert.equal(calls.length, 1, "the forest writer is called exactly once");
  const write = calls[0];
  assert.ok(write, "the writer received a ForestWrite");
  assert.equal(write.type, "verdict");

  // The persisted payload must itself validate as a real proof-protocol Verdict — not a hand-shaped
  // object that merely LOOKS like one.
  const verdict = Verdict.parse(write.payload);
  assert.equal(verdict.unitId, HUMAN_TEST.id);
  assert.equal(verdict.proofMode, "operator-attested");
  assert.equal(verdict.outcome, "pass");
  assert.equal(verdict.commitSha, CLEAN_SHA);
  assert.equal(verdict.signer, OPERATOR);
  assert.equal(verdict.outputVersion, "v1");
  assert.equal(verdict.at, AT);
  assert.ok(verdict.runId.length > 0, "carries a non-blank run id derived from the sign time");
  assert.ok(
    verdict.evidence.some((e) => e.kind === "operator-attested" && e.ref === OPERATOR && e.note === "saw it work in the desktop app"),
    "evidence references the signer and carries the trimmed note",
  );

  if (result.ok) {
    assert.deepEqual(result.verdict, verdict, "the returned verdict is exactly what was written");
  }
});

test("luat-persists-a-real-human-verdict-through-the-broker: an 'either' leg also signs and persists through the same human path", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: { ok: true } });
  const input = baseInput(writer, { testId: EITHER_TEST.id, outcome: "fail" });

  const result = await attestLocalUat(input);

  assert.equal(result.ok, true, "an 'either' leg admits an operator attestation, still no self-exempt");
  assert.equal(calls.length, 1);
  const verdict = Verdict.parse(calls[0]?.payload);
  assert.equal(verdict.unitId, EITHER_TEST.id);
  assert.equal(verdict.outcome, "fail");
});

test("luat-persists-a-real-human-verdict-through-the-broker: a signature offered with no note omits it from the evidence", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: { ok: true } });
  const result = await attestLocalUat(baseInput(writer));

  assert.equal(result.ok, true);
  const verdict = Verdict.parse(calls[0]?.payload);
  assert.equal(verdict.evidence.length, 1);
  assert.equal(verdict.evidence[0]?.note, undefined, "no blank/omitted note is ever carried as an empty string");
});

// ── luat-refuses-untrustworthy-proof-before-writing ────────────────────────────────────────────

test("luat-refuses-untrustworthy-proof-before-writing: a machine-witness leg cannot be greened by a human click", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { testId: MACHINE_TEST.id }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0, "the writer is never called for a refused machine-witness leg");
});

test("luat-refuses-untrustworthy-proof-before-writing: a blank signer fails closed", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { signer: "   " }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: a 'sandbox:' agent identity can never self-attest", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { signer: "sandbox:claude-opus-4-8@run-9" }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: the running agent cannot self-attest its own human leg", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(
    baseInput(writer, { signer: "agent@run-9", agentIdentity: "agent@run-9" }),
  );

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: a dirty git tree refuses — never attest uncommitted bytes", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { git: { commitSha: CLEAN_SHA, clean: false } }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: a blank commit SHA refuses", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { git: { commitSha: "", clean: true } }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: a malformed (non-hex) commit SHA refuses", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { git: { commitSha: "not-a-real-sha!!", clean: true } }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: an unknown test id refuses — a typo never mints a verdict", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { testId: "desktop#uat-does-not-exist" }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: a blank test id refuses", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { testId: "   " }));

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: malformed declared test context (no matching shape) refuses rather than guessing", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(baseInput(writer, { tests: [] }));

  assert.equal(result.ok, false, "an empty/absent declared context can never resolve a witness");
  assert.equal(calls.length, 0);
});

test("luat-refuses-untrustworthy-proof-before-writing: an invalid outcome refuses", async () => {
  const { writer, calls } = makeWriter({ persisted: true, status: 201, body: {} });
  const result = await attestLocalUat(
    baseInput(writer, { outcome: "maybe" as unknown as "pass" | "fail" }),
  );

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

// ── luat-surfaces-broker-refusal-without-forging-success ───────────────────────────────────────

test("luat-surfaces-broker-refusal-without-forging-success: a 403 broker refusal is surfaced honestly, never as a signed success", async () => {
  const { writer, calls } = makeWriter({
    persisted: false,
    status: 403,
    guidance: "you are not yet an authorized builder — ask the owner via the Members panel",
  });
  const result = await attestLocalUat(baseInput(writer));

  assert.equal(calls.length, 1, "the writer IS called — the local honesty walls all passed");
  assert.equal(result.ok, false, "an unpersisted write is never reported as a signed success");
  if (!result.ok) {
    assert.match(result.reason, /authorized builder|403|guidance|broker/i, "the refusal carries the broker's guidance");
  }
});

test("luat-surfaces-broker-refusal-without-forging-success: an unreachable broker (status null) is surfaced honestly", async () => {
  const { writer, calls } = makeWriter({
    persisted: false,
    status: null,
    guidance: "Cannot reach the studio broker to persist the write.",
  });
  const result = await attestLocalUat(baseInput(writer));

  assert.equal(calls.length, 1);
  assert.equal(result.ok, false);
});
