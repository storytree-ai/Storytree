import test from "node:test";
import assert from "node:assert/strict";
import type { Attestation } from "@storytree/verdict-contract";
import { attestCommand, type AttestDeps, type AttestationStoreLike } from "./attest.js";

/**
 * Offline tests for `storytree attest` (ADR-0044 d.4). The store, signer chain, and
 * identity are all injected — no DB, no git. Covers `signed-with-provenance` (operator
 * signer + scribing relayedBy) and the fail-closed / offline guidance paths.
 */

class FakeStore implements AttestationStoreLike {
  readonly recorded: Attestation[] = [];
  history_: Attestation[] = [];
  async record(att: Attestation): Promise<Attestation> {
    this.recorded.push(att);
    return att;
  }
  async history(_testId: string): Promise<Attestation[]> {
    return this.history_;
  }
  async readEvents(): Promise<ReadonlyArray<{ seq: number; doc: unknown }>> {
    return this.recorded.map((doc, i) => ({ seq: i + 1, doc }));
  }
}

function deps(over: Partial<AttestDeps> = {}): AttestDeps {
  return {
    store: new FakeStore(),
    identity: { sessionId: "nice-wright-3a8133", branch: "claude/x" },
    resolveSigner: (flag?: string) => ({ ok: true, signer: flag ?? "owner@example.com" }),
    now: () => new Date("2026-06-14T00:00:00.000Z"),
    ...over,
  };
}

// ── record: human relay ───────────────────────────────────────────────────────

test("record human relay: signer = operator, relayedBy = the scribing session", async () => {
  const d = deps();
  const env = await attestCommand(
    { mode: "record", testId: "uat-attestation#uat-2" },
    { witness: "human", signer: "hua.mick@gmail.com", note: "saw it work" },
    d,
  );
  assert.equal(env.ok, true);
  const rec = (d.store as FakeStore).recorded;
  assert.equal(rec.length, 1, "one attestation recorded");
  assert.deepEqual(
    { ...rec[0] },
    {
      testId: "uat-attestation#uat-2",
      outcome: "pass", // default
      witness: "human",
      signer: "hua.mick@gmail.com",
      at: "2026-06-14T00:00:00.000Z",
      note: "saw it work",
      relayedBy: "nice-wright-3a8133",
    },
  );
  assert.ok(env.body.includes("VOUCH, not a gate verdict"), "honest about not being a verdict");
});

test("record machine: witness machine, runner signer, no relayedBy even inside a session", async () => {
  // A session identity is present, but a MACHINE signal must NOT pick it up as relayedBy —
  // relayedBy is reserved for relayed HUMAN attestations (ADR-0044 d.4).
  const d = deps({ identity: { sessionId: "nice-wright-3a8133", branch: "claude/x" } });
  const env = await attestCommand(
    { mode: "record", testId: "uat-attestation#uat-3" },
    { witness: "machine", outcome: "pass", signer: "uat-runner" },
    d,
  );
  assert.equal(env.ok, true);
  const rec = (d.store as FakeStore).recorded[0]!;
  assert.equal(rec.witness, "machine");
  assert.equal(rec.signer, "uat-runner");
  assert.equal(rec.relayedBy, undefined, "machine attestation carries no relayedBy, even in a session");
});

test("record: defaults are outcome=pass, witness=human", async () => {
  const d = deps();
  await attestCommand({ mode: "record", testId: "s#uat-1" }, {}, d);
  const rec = (d.store as FakeStore).recorded[0]!;
  assert.equal(rec.outcome, "pass");
  assert.equal(rec.witness, "human");
});

// ── fail-closed / validation ──────────────────────────────────────────────────

test("fail-closed signer: an unresolved signer refuses, recording nothing", async () => {
  const d = deps({ resolveSigner: () => ({ ok: false, error: "no signer" }) });
  const env = await attestCommand({ mode: "record", testId: "s#uat-1" }, { witness: "human" }, d);
  assert.equal(env.ok, false);
  assert.equal((d.store as FakeStore).recorded.length, 0, "nothing recorded");
});

test("invalid outcome / witness is refused", async () => {
  const d = deps();
  const bad1 = await attestCommand({ mode: "record", testId: "s#uat-1" }, { outcome: "maybe" }, d);
  assert.equal(bad1.ok, false);
  const bad2 = await attestCommand({ mode: "record", testId: "s#uat-1" }, { witness: "either" }, d);
  assert.equal(bad2.ok, false);
  assert.equal((d.store as FakeStore).recorded.length, 0, "no bad doc recorded");
});

test("missing test id is refused", async () => {
  const env = await attestCommand({ mode: "record", testId: undefined }, {}, deps());
  assert.equal(env.ok, false);
  assert.ok(env.body.includes("needs a test id"));
});

// ── offline ────────────────────────────────────────────────────────────────────

test("offline (store null): record and list both refuse, pointing at --pg", async () => {
  const rec = await attestCommand({ mode: "record", testId: "s#uat-1" }, {}, deps({ store: null }));
  assert.equal(rec.ok, false);
  assert.ok(rec.body.includes("--pg"));
  const list = await attestCommand({ mode: "list", testId: "s#uat-1" }, {}, deps({ store: null }));
  assert.equal(list.ok, false);
  assert.ok(list.body.includes("--pg"));
});

// ── list ────────────────────────────────────────────────────────────────────

test("list: renders history newest-context, and an empty test nudges to record", async () => {
  const store = new FakeStore();
  store.history_ = [
    {
      testId: "s#uat-1",
      outcome: "pass",
      witness: "human",
      signer: "owner@example.com",
      at: "2026-06-14T00:00:00.000Z",
      relayedBy: "nice-wright-3a8133",
    },
  ];
  const withHistory = await attestCommand({ mode: "list", testId: "s#uat-1" }, {}, deps({ store }));
  assert.equal(withHistory.ok, true);
  assert.ok(withHistory.body.includes("[human] pass"));
  assert.ok(withHistory.body.includes("relayedBy=nice-wright-3a8133"));

  const empty = await attestCommand({ mode: "list", testId: "s#uat-9" }, {}, deps());
  assert.equal(empty.ok, true);
  assert.ok(empty.body.includes("No attestations recorded"));
});
