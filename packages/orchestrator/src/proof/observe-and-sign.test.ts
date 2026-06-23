import test from "node:test";
import assert from "node:assert/strict";

import { observeAndSign } from "./observe-and-sign.js";
import type { ObserveAndSignSpec, AdoptedVerdictStore } from "./observe-and-sign.js";
import { SPINE_PRINCIPAL } from "./spine-principal.js";

// A recording store double: captures the appended event(s) so a test can assert what was signed.
function recordingStore(): AdoptedVerdictStore & { appended: unknown[] } {
  const appended: unknown[] = [];
  return {
    appended,
    async appendEvent(e) {
      appended.push(e);
      return e;
    },
  };
}

const CLEAN = async () => ({ commitSha: "abc1234", clean: true });
const GREEN = async () => ({ code: 0 });

/** A minimal valid spec, overridable per test. */
function spec(over: Partial<ObserveAndSignSpec> = {}): ObserveAndSignSpec {
  return {
    gate: { id: "proof-protocol#gate-1", kind: "observe", proofCommand: "pnpm test" },
    gitState: CLEAN,
    observe: GREEN,
    approverInputs: { flag: "hua.mick@gmail.com" },
    store: recordingStore(),
    runId: "adopt-1",
    now: () => "2026-06-21T00:00:00.000Z",
    ...over,
  };
}

test("GREEN: an observe gate observed green at a clean HEAD signs an adopted verdict", async () => {
  const store = recordingStore();
  const res = await observeAndSign(spec({ store }));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.verdict.unitId, "proof-protocol#gate-1");
  assert.equal(res.verdict.proofMode, "adopted");
  assert.equal(res.verdict.outcome, "pass");
  assert.equal(res.verdict.commitSha, "abc1234");
  // ADR-0097: the MACHINE signs (the spine principal witnessed the green); the HUMAN who pressed
  // Adopt is recorded as approvedBy — distinct provenance axes.
  assert.equal(res.verdict.signer, SPINE_PRINCIPAL);
  assert.equal(res.verdict.approvedBy, "hua.mick@gmail.com");
  // The verdict PERSISTED — one signing event, the verdict as its doc, attributed to the spine.
  assert.equal(store.appended.length, 1);
  const ev = store.appended[0] as { kind: string; actor: string; doc: { proofMode: string } };
  assert.equal(ev.kind, "signing");
  assert.equal(ev.actor, SPINE_PRINCIPAL);
  assert.equal(ev.doc.proofMode, "adopted");
});

test("REFUSE: a non-observe gate is never observe-and-signed (build-tests)", async () => {
  const store = recordingStore();
  const res = await observeAndSign(
    spec({ store, gate: { id: "x#gate-1", kind: "build-tests" } }),
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /not 'observe'/);
  assert.match(res.reason, /red→green build/);
  assert.equal(store.appended.length, 0); // nothing signed
});

test("REFUSE: an observe gate with no proofCommand has nothing to observe (fail-closed)", async () => {
  const store = recordingStore();
  const res = await observeAndSign(spec({ store, gate: { id: "x#gate-1", kind: "observe" } }));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /no proofCommand/);
  assert.equal(store.appended.length, 0);
});

test("REFUSE: a non-zero exit is a fail — no verdict signed (the prior-red wall's mirror)", async () => {
  const store = recordingStore();
  const res = await observeAndSign(spec({ store, observe: async () => ({ code: 1 }) }));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /did NOT pass/);
  assert.match(res.reason, /exit 1/);
  assert.equal(store.appended.length, 0);
});

test("REFUSE: a kill-by-signal (code null) is a fail", async () => {
  const res = await observeAndSign(spec({ observe: async () => ({ code: null }) }));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /by signal/);
});

test("REFUSE: a dirty tree refuses — an adopted verdict pins a clean commit", async () => {
  const store = recordingStore();
  const res = await observeAndSign(
    spec({ store, gitState: async () => ({ commitSha: "dirty99", clean: false }) }),
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /tree is not clean/);
  assert.equal(store.appended.length, 0);
});

test("REFUSE: a blank approver chain fails closed (the adoption decision is a human act, ADR-0097)", async () => {
  const store = recordingStore();
  const res = await observeAndSign(spec({ store, approverInputs: {} }));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /no approver resolved/);
  assert.equal(store.appended.length, 0);
});

test("ORDER: a dirty tree refuses only AFTER a green observation (the gate's posture)", async () => {
  // A non-zero exit short-circuits BEFORE the clean-tree gate is consulted, so a red command on a
  // dirty tree reports the red, not the dirtiness — observe first, then the clean-tree gate.
  let treeConsulted = false;
  const res = await observeAndSign(
    spec({
      observe: async () => ({ code: 2 }),
      gitState: async () => {
        treeConsulted = true;
        return { commitSha: "z", clean: false };
      },
    }),
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /did NOT pass/);
  assert.equal(treeConsulted, false);
});
