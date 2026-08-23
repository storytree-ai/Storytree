import test from "node:test";
import assert from "node:assert/strict";

import { observeAndSign } from "./observe-and-sign.js";
import type {
  ObserveAndSignSpec,
  ObserveBrownfieldGateSpec,
  ObserveMachineLegSpec,
  AdoptedVerdictStore,
} from "./observe-and-sign.js";
import type { SignerInputs } from "./signer.js";
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

/** A minimal valid BROWNFIELD OBSERVE GATE spec (no criterion binding), overridable per test. */
function spec(over: Partial<ObserveBrownfieldGateSpec> = {}): ObserveBrownfieldGateSpec {
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

const LEG_CRITERION = "uatc_0000000000000000000000a1";
const LEG_REVISION = "uatr1:00000000000000a1";
const LEG_COMMAND = "pnpm storytree uat-drive-witness check library-review uatc_…";

/**
 * A minimal valid MACHINE UAT LEG spec (ADR-0408): identical to {@link spec} EXCEPT that the gate
 * carries the leg's criterion binding — which is the whole discriminator — and that it supplies no
 * approver, because the leg class types `approverInputs` as `never`.
 */
function legSpec(over: Partial<ObserveMachineLegSpec> = {}): ObserveMachineLegSpec {
  return {
    gate: {
      id: LEG_CRITERION,
      criterionId: LEG_CRITERION,
      revisionId: LEG_REVISION,
      kind: "observe",
      proofCommand: LEG_COMMAND,
    },
    gitState: CLEAN,
    observe: GREEN,
    store: recordingStore(),
    runId: "adopt-1",
    now: () => "2026-08-22T00:00:00.000Z",
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

// ---------------------------------------------------------------------------
// ADR-0408: a machine UAT leg carries no human approver; brownfield adoption still does.
// Pinned in BOTH directions, with a control proving the two paths genuinely differ.
// ---------------------------------------------------------------------------

test("GREEN (ADR-0408): a machine UAT leg signs with NO approvedBy — and never consults the signer chain", async () => {
  const store = recordingStore();
  // A TRIPWIRE in place of the signer inputs: reading ANY tier trips it. It is forced in past the
  // type (the leg class types `approverInputs` as `never`) precisely because that is the claim under
  // test — the runtime must discriminate on the CRITERION BINDING, not on whether approver inputs
  // happen to be present. Without this, a green test would prove only that git email resolved.
  let consulted = 0;
  const tripwire: SignerInputs = {
    get flag() {
      consulted += 1;
      return "hua.mick@gmail.com";
    },
    get env() {
      consulted += 1;
      return "hua.mick@gmail.com";
    },
    get gitEmail() {
      consulted += 1;
      return "hua.mick@gmail.com";
    },
  };
  // `approverInputs?: never` is the machine-leg spec's STRUCTURAL fence, so handing it one IS the
  // tripwire. The binding names exactly what is being built — the leg spec with that fence lifted —
  // and the remaining single `as` is a legal narrowing to the union rather than the `as unknown as`
  // chain, which asserted over the whole spec (anti-slop `no-chained-type-assertions`, inc-09).
  const specWithApprover: Omit<ObserveMachineLegSpec, "approverInputs"> & {
    approverInputs: SignerInputs;
  } = {
    ...legSpec({ store }),
    approverInputs: tripwire,
  };
  const res = await observeAndSign(specWithApprover as ObserveAndSignSpec);

  assert.equal(res.ok, true);
  if (!res.ok) return;
  // The WITNESS axis is unchanged: the machine still signs, never a model (ADR-0295 D2).
  assert.equal(res.verdict.signer, SPINE_PRINCIPAL);
  // The APPROVER axis is empty, and ABSENT rather than blank — no name nobody supplied.
  assert.equal(res.verdict.approvedBy, undefined);
  assert.equal("approvedBy" in res.verdict, false);
  assert.equal(consulted, 0);
  // The leg's binding round-trips onto the verdict (this is what makes it a criterion verdict).
  assert.equal(res.verdict.criterionId, LEG_CRITERION);
  assert.equal(res.verdict.revisionId, LEG_REVISION);
  assert.equal(res.verdict.proofMode, "adopted");
  // ...and it PERSISTED (a verdict that evaporates greens nothing).
  assert.equal(store.appended.length, 1);
  const ev = store.appended[0] as { actor: string; doc: { approvedBy?: string } };
  assert.equal(ev.actor, SPINE_PRINCIPAL);
  assert.equal(ev.doc.approvedBy, undefined);
  // The evidence note says WHY there is no approver, so a later reader is not left guessing.
  assert.match(res.verdict.evidence[0]?.note ?? "", /no human approver required/);
});

test("CONTROL (ADR-0408): the same call WITHOUT a criterion binding is a brownfield gate — and refuses", async () => {
  // The non-vacuity control. Everything is held identical to the machine leg above — same command,
  // same clean HEAD, same green observation, same absent approver — and ONLY the criterion binding
  // is removed. The leg signs; this refuses. If the split did nothing, one of the two would be wrong.
  const store = recordingStore();
  const res = await observeAndSign({
    gate: { id: LEG_CRITERION, kind: "observe", proofCommand: LEG_COMMAND },
    gitState: CLEAN,
    observe: GREEN,
    approverInputs: {}, // the blank chain the brownfield wall exists to catch
    store,
    runId: "adopt-1",
    now: () => "2026-08-22T00:00:00.000Z",
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /no approver resolved/);
  assert.equal(store.appended.length, 0); // nothing signed
});

test("ADR-0408: the brownfield wall is NOT weakened — a named approver is still recorded verbatim", async () => {
  // The other direction of the same fence: adoption keeps its human, and keeps recording them.
  const store = recordingStore();
  const res = await observeAndSign(spec({ store, approverInputs: { gitEmail: "someone@example.com" } }));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.verdict.signer, SPINE_PRINCIPAL);
  assert.equal(res.verdict.approvedBy, "someone@example.com");
  assert.match(res.verdict.evidence[0]?.note ?? "", /adopted by someone@example\.com/);
});

test("ORDER (ADR-0408): the leg path keeps observe-first — a dirty tree is consulted only after a green", async () => {
  // The honesty walls keep their existing order on the new path too: skipping the approver step must
  // not reorder observe → clean-tree → sign, or the pinned commit stops matching what was observed.
  let treeConsulted = false;
  const store = recordingStore();
  const res = await observeAndSign(
    legSpec({
      store,
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
  assert.equal(store.appended.length, 0);
});

test("ADR-0408: a machine UAT leg still refuses a DIRTY tree (the pinned-commit wall is untouched)", async () => {
  const store = recordingStore();
  const res = await observeAndSign(
    legSpec({ store, gitState: async () => ({ commitSha: "dirty99", clean: false }) }),
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /tree is not clean/);
  assert.equal(store.appended.length, 0);
});
