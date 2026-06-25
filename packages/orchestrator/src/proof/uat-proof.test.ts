import test from "node:test";
import assert from "node:assert/strict";

import type { Verdict } from "@storytree/proof-protocol";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import type { StoreEvent } from "@storytree/storage-protocol";

import {
  checkUatProof,
  rollupStoryUat,
  rollupStoryGreen,
  rollupCapStatus,
  gateStoryGreenOnOpenQuestions,
} from "./uat-proof.js";

/**
 * The per-test UAT proof model (ADR-0082): the sign-time trust guard keeps "green" honest, and the
 * read-time roll-up greens a story's own UAT only when ALL its tests are green. All offline, all pure.
 */

let seq = 0;
function passEvent(unitId: string, proofMode: Verdict["proofMode"] = "story"): StoreEvent {
  seq += 1;
  const doc: Verdict = {
    unitId,
    proofMode,
    outcome: "pass",
    commitSha: "cafebabe",
    signer: "owner@example.com",
    runId: "run-1",
    outputVersion: "v1",
    evidence: [],
    at: "2026-06-20T00:00:00.000Z",
  };
  return { seq, id: `e${seq}`, kind: SIGNING_EVENT_KIND, type: "created", doc, actor: "tester", at: doc.at };
}

function failEvent(unitId: string): StoreEvent {
  const e = passEvent(unitId);
  return { ...e, doc: { ...(e.doc as Verdict), outcome: "fail" } };
}

// ── checkUatProof: the sign-time trust guard ───────────────────────────────────────────────────

test("guard: a human test is proven by an operator-attested verdict signed by a person", () => {
  const r = checkUatProof({
    witness: "human",
    verdict: { proofMode: "operator-attested", signer: "owner@example.com" },
  });
  assert.deepEqual(r, { ok: true });
});

test("guard: a human test cannot be greened by a machine proof mode", () => {
  const r = checkUatProof({
    witness: "human",
    verdict: { proofMode: "story", signer: "owner@example.com" },
  });
  assert.equal(r.ok, false);
});

test("guard: an agent (sandbox: identity) can never self-attest a human test", () => {
  const r = checkUatProof({
    witness: "human",
    verdict: { proofMode: "operator-attested", signer: "sandbox:claude-opus-4-8@run-9" },
  });
  assert.equal(r.ok, false);
});

test("guard: the building agent cannot self-attest its own human test", () => {
  const r = checkUatProof({
    witness: "human",
    verdict: { proofMode: "operator-attested", signer: "agent@run-9" },
    agentIdentity: "agent@run-9",
  });
  assert.equal(r.ok, false);
});

test("guard: a blank signer fails closed on a human test", () => {
  const r = checkUatProof({
    witness: "human",
    verdict: { proofMode: "operator-attested", signer: "   " },
  });
  assert.equal(r.ok, false);
});

test("guard: a machine test is proven by a machine verdict", () => {
  const r = checkUatProof({
    witness: "machine",
    verdict: { proofMode: "story", signer: "sandbox:claude-opus-4-8@run-9" },
  });
  assert.deepEqual(r, { ok: true });
});

test("guard: a human click cannot green a machine test", () => {
  const r = checkUatProof({
    witness: "machine",
    verdict: { proofMode: "operator-attested", signer: "owner@example.com" },
  });
  assert.equal(r.ok, false);
});

test("guard: an 'either' test admits a machine proof", () => {
  const r = checkUatProof({
    witness: "either",
    verdict: { proofMode: "capability", signer: "sandbox:claude-opus-4-8@run-9" },
  });
  assert.deepEqual(r, { ok: true });
});

test("guard: an 'either' test admits an operator attestation, but still no self-exempt", () => {
  assert.deepEqual(
    checkUatProof({
      witness: "either",
      verdict: { proofMode: "operator-attested", signer: "owner@example.com" },
    }),
    { ok: true },
  );
  assert.equal(
    checkUatProof({
      witness: "either",
      verdict: { proofMode: "operator-attested", signer: "sandbox:x@y" },
    }).ok,
    false,
  );
});

// ── rollupStoryUat: the read-time AND-roll-up ──────────────────────────────────────────────────

test("rollup: no declared tests => null (nothing to prove)", () => {
  assert.equal(rollupStoryUat([], []), null);
});

test("rollup: all tests signed pass => healthy", () => {
  const tests = [{ id: "s#uat-1" }, { id: "s#uat-2" }];
  const events = [passEvent("s#uat-1", "operator-attested"), passEvent("s#uat-2", "story")];
  assert.equal(rollupStoryUat(tests, events), "healthy");
});

test("rollup: any test still unproven => null (under-claim, never over-claim)", () => {
  const tests = [{ id: "s#uat-1" }, { id: "s#uat-2" }];
  const events = [passEvent("s#uat-1")];
  assert.equal(rollupStoryUat(tests, events), null);
});

test("rollup: a test that regressed (pass then fail) withers the story to unhealthy", () => {
  const tests = [{ id: "s#uat-1" }, { id: "s#uat-2" }];
  const events = [passEvent("s#uat-1"), passEvent("s#uat-2"), failEvent("s#uat-2")];
  assert.equal(rollupStoryUat(tests, events), "unhealthy");
});

test("rollup: a regression wins even when every other test passes", () => {
  const tests = [{ id: "s#uat-1" }, { id: "s#uat-2" }, { id: "s#uat-3" }];
  const events = [
    passEvent("s#uat-1"),
    passEvent("s#uat-3"),
    passEvent("s#uat-2"),
    failEvent("s#uat-2"),
  ];
  assert.equal(rollupStoryUat(tests, events), "unhealthy");
});

test("rollup: a first-attempt fail (no prior pass) abstains, never withers — a failed attempt invents nothing", () => {
  const tests = [{ id: "s#uat-1" }, { id: "s#uat-2" }];
  const events = [passEvent("s#uat-1"), failEvent("s#uat-2")];
  assert.equal(rollupStoryUat(tests, events), null);
});

test("rollup: a single-test story greens on its one pass", () => {
  assert.equal(rollupStoryUat([{ id: "s#uat-1" }], [passEvent("s#uat-1")]), "healthy");
});

// ── rollupStoryGreen: the story-crown roll-up = (caps healthy) AND (UAT healthy) (ADR-0083 Fork A) ──

test("story-green: all caps + all UAT pass => healthy", () => {
  const caps = ["s.cap-a", "s.cap-b"];
  const tests = [{ id: "s#uat-1" }];
  const events = [passEvent("s.cap-a", "capability"), passEvent("s.cap-b", "capability"), passEvent("s#uat-1")];
  assert.equal(rollupStoryGreen(caps, tests, events), "healthy");
});

test("story-green: UAT green but a capability still unproven (mapped) => null (under-claim, the necessary condition)", () => {
  const caps = ["s.cap-a", "s.cap-b"];
  const tests = [{ id: "s#uat-1" }];
  // s.cap-b never earned a signed pass — the crown cannot be green while it stands unproven.
  const events = [passEvent("s.cap-a", "capability"), passEvent("s#uat-1")];
  assert.equal(rollupStoryGreen(caps, tests, events), null);
});

test("story-green: caps green but UAT unproven => null (six green plants are not sufficient, ADR-0082)", () => {
  const caps = ["s.cap-a"];
  const tests = [{ id: "s#uat-1" }, { id: "s#uat-2" }];
  const events = [passEvent("s.cap-a", "capability"), passEvent("s#uat-1")];
  assert.equal(rollupStoryGreen(caps, tests, events), null);
});

test("story-green: caps green but NO UAT declared => null (UAT clause is also necessary)", () => {
  const caps = ["s.cap-a"];
  assert.equal(rollupStoryGreen(caps, [], [passEvent("s.cap-a", "capability")]), null);
});

test("story-green: a red capability (signed fail) withers the crown to unhealthy even with green UAT", () => {
  const caps = ["s.cap-a"];
  const tests = [{ id: "s#uat-1" }];
  const events = [passEvent("s.cap-a", "capability"), failEvent("s.cap-a"), passEvent("s#uat-1")];
  assert.equal(rollupStoryGreen(caps, tests, events), "unhealthy");
});

test("story-green: a UAT regression withers the crown to unhealthy even with green caps", () => {
  const caps = ["s.cap-a"];
  const tests = [{ id: "s#uat-1" }];
  const events = [passEvent("s.cap-a", "capability"), passEvent("s#uat-1"), failEvent("s#uat-1")];
  assert.equal(rollupStoryGreen(caps, tests, events), "unhealthy");
});

test("story-green: ZERO capabilities (a foundational port) satisfies the cap clause VACUOUSLY — green is its UAT alone", () => {
  const tests = [{ id: "proof-protocol#uat-1" }];
  assert.equal(rollupStoryGreen([], tests, [passEvent("proof-protocol#uat-1")]), "healthy");
});

test("story-green: ZERO capabilities with UAT still unproven => null (vacuous caps, but the UAT clause fails)", () => {
  assert.equal(rollupStoryGreen([], [{ id: "p#uat-1" }], []), null);
});

test("story-green: ZERO capabilities AND no UAT => null (nothing greens it)", () => {
  assert.equal(rollupStoryGreen([], [], []), null);
});

// ── rollupStoryGreen: ADR-0097 brownfield capability coverage via an adopted gate ───────────────

test("coverage: a brownfield cap with NO own verdict greens via a healthy gate that (covers) it", () => {
  const caps = ["s.cap-a", "s.cap-b"];
  // The two gates ARE the own-proof obligations (UAT clause) AND they cover the caps. Neither cap has
  // its own driven verdict — both green entirely through coverage.
  const gates = [
    { id: "s#gate-1", covers: ["s.cap-a", "s.cap-b"] },
    { id: "s#gate-2", covers: [] },
  ];
  const events = [passEvent("s#gate-1", "adopted"), passEvent("s#gate-2", "adopted")];
  assert.equal(rollupStoryGreen(caps, gates, events, gates), "healthy");
});

test("coverage: a cap covered by NO honest gate stays unproven and holds the crown at null", () => {
  // The library shape: gate-1 covers cap-a; cap-b (e.g. seed-corpus-scripts) is covered by no gate.
  const caps = ["s.cap-a", "s.cap-b"];
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a"] }];
  const events = [passEvent("s#gate-1", "adopted")];
  assert.equal(rollupStoryGreen(caps, gates, events, gates), null);
});

test("coverage: a gate that is NOT yet signed covers nothing (no green leaks before the adoption lands)", () => {
  const caps = ["s.cap-a"];
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a"] }];
  // gate-1 declares coverage but has no signed pass yet → cap-a unproven → crown abstains.
  assert.equal(rollupStoryGreen(caps, gates, [], gates), null);
});

test("coverage: a cap with its OWN signed fail still withers the crown, even if a gate covers it", () => {
  const caps = ["s.cap-a"];
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a"] }];
  // The covering gate is green, but the cap itself has a signed regression — coverage can't mask red.
  const events = [passEvent("s.cap-a", "capability"), failEvent("s.cap-a"), passEvent("s#gate-1", "adopted")];
  assert.equal(rollupStoryGreen(caps, gates, events, gates), "unhealthy");
});

test("coverage: omitted (greenfield) => the pre-ADR-0097 rule — each cap must earn its own verdict", () => {
  const caps = ["s.cap-a"];
  const tests = [{ id: "s#uat-1" }];
  // No coverage arg: cap-a must be proven on its own. Only the UAT is signed → still null.
  const events = [passEvent("s#uat-1")];
  assert.equal(rollupStoryGreen(caps, tests, events), null);
});

// ── rollupCapStatus: the SHARED per-cap fold (ADR-0097 §5; owner Option A 2026-06-25) ───────────
// The crown's capability clause and the per-cap DISPLAY (CLI glyph / studio plant) both go through
// THIS one function, so a green crown can never float over plants that read differently.

test("cap-status: a cap with its OWN signed pass is healthy (greenfield, no coverage)", () => {
  assert.equal(rollupCapStatus("s.cap-a", [passEvent("s.cap-a", "capability")]), "healthy");
});

test("cap-status: a brownfield cap with NO own verdict greens via a healthy gate that (covers) it", () => {
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a"] }];
  assert.equal(rollupCapStatus("s.cap-a", [passEvent("s#gate-1", "adopted")], gates), "healthy");
});

test("cap-status: an uncovered cap with no own verdict abstains to null (the authored ladder stands)", () => {
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a"] }];
  assert.equal(rollupCapStatus("s.cap-b", [passEvent("s#gate-1", "adopted")], gates), null);
});

test("cap-status: a covering gate not yet signed greens nothing (no green leaks before adoption lands)", () => {
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a"] }];
  assert.equal(rollupCapStatus("s.cap-a", [], gates), null);
});

test("cap-status: a cap's OWN signed fail withers it even when a healthy gate covers it (coverage can't mask red)", () => {
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a"] }];
  const events = [passEvent("s.cap-a", "capability"), failEvent("s.cap-a"), passEvent("s#gate-1", "adopted")];
  assert.equal(rollupCapStatus("s.cap-a", events, gates), "unhealthy");
});

test("cap-status: greenfield (no coverage) collapses to exactly rollupStatus", () => {
  assert.equal(rollupCapStatus("s.cap-a", [passEvent("s.cap-a", "capability")]), "healthy");
  assert.equal(rollupCapStatus("s.cap-a", []), null);
});

test("cap-status: the crown agrees with the per-cap fold — every cap rollupCapStatus healthy ⇒ caps clause holds", () => {
  // The shared-definition guarantee: the same (events, coverage) that green each plant green the crown.
  const caps = ["s.cap-a", "s.cap-b"];
  const gates = [{ id: "s#gate-1", covers: ["s.cap-a", "s.cap-b"] }];
  const events = [passEvent("s#gate-1", "adopted")];
  for (const c of caps) assert.equal(rollupCapStatus(c, events, gates), "healthy");
  // gates double as the own-proof obligation here, so the crown greens off the same signal.
  assert.equal(rollupStoryGreen(caps, gates, events, gates), "healthy");
});

// ── gateStoryGreenOnOpenQuestions: the proving-process OQ gate (ADR-0107 / ADR-0106 d4) ──────────
// An open question raised during a story's adopt/build proving process (attached via a node:<id>
// reference, classified by the library's openQuestionsGatingNode) WITHHOLDS the story's green until
// the OQ is resolved. The gate is a pure post-filter over the already-derived crown status.

test("oq-gate: a would-be-green crown with an OPEN gating OQ does NOT roll up green (blocked → null)", () => {
  // Prove the full path: the crown rolls up healthy, but one open OQ attached to the process blocks it.
  const caps = ["s.cap-a"];
  const tests = [{ id: "s#uat-1" }];
  const events = [passEvent("s.cap-a", "capability"), passEvent("s#uat-1")];
  const crown = rollupStoryGreen(caps, tests, events);
  assert.equal(crown, "healthy"); // everything is driven green…
  assert.equal(gateStoryGreenOnOpenQuestions(crown, 1), null); // …but the open fork withholds the green
});

test("oq-gate: resolving the OQ (count → 0) UNBLOCKS the green — the base flows through verbatim", () => {
  assert.equal(gateStoryGreenOnOpenQuestions("healthy", 0), "healthy");
});

test("oq-gate: more than one open gating OQ still just withholds (any open fork blocks)", () => {
  assert.equal(gateStoryGreenOnOpenQuestions("healthy", 3), null);
});

test("oq-gate: NEVER manufactures unhealthy — a withheld green is not a regression", () => {
  // An unhealthy base (a signed fail / drift) is returned UNCHANGED regardless of open OQs.
  assert.equal(gateStoryGreenOnOpenQuestions("unhealthy", 2), "unhealthy");
});

test("oq-gate: an abstaining (null) base is returned UNCHANGED — the gate only withholds a green", () => {
  assert.equal(gateStoryGreenOnOpenQuestions(null, 2), null);
  assert.equal(gateStoryGreenOnOpenQuestions(null, 0), null);
});
