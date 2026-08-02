import test from "node:test";
import assert from "node:assert/strict";

import type { StoreEvent } from "@storytree/storage-protocol";
import type { UatTestCriterion } from "@storytree/library";
import { SIGNING_EVENT_KIND, Verdict } from "@storytree/proof-protocol";

import { uatCommand, type UatDeps, type GitState } from "./uat.js";

/**
 * The per-test UAT write surface (ADR-0082): `uat attest` mints an operator-attested verdict only
 * when every honesty wall holds, and `uat list` reads the per-test PROVEN state (the signed verdict,
 * distinct from a vouch) and the story's AND-roll-up. All offline — store, git, loader, signer, clock
 * injected.
 */

// A fake verdict store that mirrors PgWorkStore's fail-closed contract: a signing event must be a
// full Verdict (Verdict.parse), and readEvents replays everything appended (seq-ordered).
function fakeStore(seed: StoreEvent[] = []) {
  const events: StoreEvent[] = [...seed];
  const verdicts: Verdict[] = [];
  let seq = events.length;
  return {
    verdicts,
    events,
    store: {
      async appendEvent(e: {
        id: string;
        kind: string;
        type: "created";
        doc: unknown;
        actor?: string;
      }): Promise<StoreEvent> {
        seq += 1;
        let doc = e.doc;
        if (e.kind === SIGNING_EVENT_KIND) {
          const v = Verdict.parse(e.doc); // fail-closed, exactly like the real store
          verdicts.push(v);
          doc = v;
        }
        const ev: StoreEvent = {
          seq,
          id: e.id,
          kind: e.kind,
          type: e.type,
          doc,
          actor: e.actor ?? "system",
          at: (doc as { at?: string }).at ?? "2026-06-20T00:00:00.000Z",
        };
        events.push(ev);
        return ev;
      },
      async readEvents(): Promise<StoreEvent[]> {
        return [...events];
      },
    },
  };
}

const C1 = "uatc_000000000000000000000001";
const C2 = "uatc_000000000000000000000002";
const C3 = "uatc_000000000000000000000003";
const R1 = "uatr1:0000000000000001";
const R2 = "uatr1:0000000000000002";
const R3 = "uatr1:0000000000000003";

const DEMO_TESTS: UatTestCriterion[] = [
  { criterionId: C1, revisionId: R1, title: "Human relay", witness: "human", wouldBe: false },
  { criterionId: C2, revisionId: R2, title: "Machine run", witness: "machine", wouldBe: false },
  { criterionId: C3, revisionId: R3, title: "Either", witness: "either", wouldBe: false },
];

function baseDeps(over: Partial<UatDeps> = {}): UatDeps {
  return {
    store: fakeStore().store,
    loadUatTestCriteria: (storyId) => (storyId === "demo" ? DEMO_TESTS : []),
    gitState: (): GitState | null => ({ commitSha: "cafebabe0123", clean: true }),
    identity: { sessionId: "goofy-aryabhata", branch: "claude/x" },
    resolveSigner: (flag) => ({ ok: true, signer: flag ?? "owner@example.com" }),
    now: () => new Date("2026-06-20T12:00:00.000Z"),
    ...over,
  };
}

// ── uat list ───────────────────────────────────────────────────────────────────

test("list: refuses with no story id", async () => {
  const r = await uatCommand({ mode: "list", target: undefined }, {}, baseDeps());
  assert.equal(r.ok, false);
});

test("list: a story with no UAT test criteria reports so (ok)", async () => {
  const r = await uatCommand({ mode: "list", target: "empty" }, {}, baseDeps());
  assert.equal(r.ok, true);
  assert.match(r.body, /declares no UAT test criteria/);
});

test("list: offline (no store) renders tests but drops the PROVEN column", async () => {
  const r = await uatCommand({ mode: "list", target: "demo" }, {}, baseDeps({ store: null }));
  assert.equal(r.ok, true);
  assert.match(r.body, new RegExp(C1));
  assert.match(r.body, /witness=human/);
  assert.doesNotMatch(r.body, /proven=/);
  assert.match(r.body, /proven state needs the live store/);
});

test("list: with the store shows per-test PROVEN glyphs and the story roll-up", async () => {
  // Seed a signed pass for uat-1 only — so the story under-claims (not all proven).
  const f = fakeStore();
  await f.store.appendEvent({
    id: `r:${C1}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: {
      unitId: C1,
      criterionId: C1,
      revisionId: R1,
      proofMode: "operator-attested",
      outcome: "pass",
      commitSha: "abc",
      signer: "owner@example.com",
      runId: "r",
      at: "2026-06-20T00:00:00.000Z",
    },
  });
  const r = await uatCommand({ mode: "list", target: "demo" }, {}, baseDeps({ store: f.store }));
  assert.equal(r.ok, true);
  assert.match(r.body, new RegExp(`${C1}.*proven=✓`));
  assert.match(r.body, new RegExp(`${C2}.*proven=–`));
  assert.match(r.body, /story UAT: unproven/);
});

// ── uat attest: refusals (the honesty walls) ─────────────────────────────────────

test("attest: refuses an unknown test id", async () => {
  const unknown = "uatc_000000000000000000000009";
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: unknown },
    {},
    baseDeps(),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, new RegExp(`no UAT criterion "${unknown}"`));
});

test("attest: refuses a bad --outcome", async () => {
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { outcome: "maybe" },
    baseDeps(),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /--outcome must be pass\|fail/);
});

test("attest: refuses an unresolved signer", async () => {
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    {},
    baseDeps({ resolveSigner: () => ({ ok: false, error: "no signer" }) }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /no signer/);
});

test("attest: a machine-witness test refuses operator attestation (run the machine proof)", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C2 },
    {},
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /machine-witness/);
  assert.equal(f.verdicts.length, 0, "nothing is signed");
});

test("attest: a sandbox (agent) signer can never self-attest a human test", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { signer: "sandbox:claude-opus-4-8@run-9" },
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /self-attest|self-exempt/);
  assert.equal(f.verdicts.length, 0);
});

test("attest: the building session can never self-attest its own human test", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { signer: "goofy-aryabhata" }, // == the session identity
    baseDeps({ store: f.store, identity: { sessionId: "goofy-aryabhata", branch: "x" } }),
  );
  assert.equal(r.ok, false);
  assert.equal(f.verdicts.length, 0);
});

test("attest: refuses without --pg (the store is null)", async () => {
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    {},
    baseDeps({ store: null }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /--pg/);
});

test("attest: refuses on a dirty tree (the verdict pins a commit)", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    {},
    baseDeps({ store: f.store, gitState: () => ({ commitSha: "abc", clean: false }) }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /DIRTY/);
  assert.equal(f.verdicts.length, 0);
});

// ── uat attest: the happy path ───────────────────────────────────────────────────

test("attest: a human test signs an operator-attested verdict into events.verdict", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { note: "saw the relay land" },
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, true);
  assert.equal(f.verdicts.length, 1);
  const v = f.verdicts[0]!;
  assert.equal(v.unitId, C1);
  assert.equal(v.criterionId, C1);
  assert.equal(v.revisionId, R1);
  assert.equal(v.proofMode, "operator-attested");
  assert.equal(v.outcome, "pass");
  assert.equal(v.signer, "owner@example.com");
  assert.equal(v.commitSha, "cafebabe0123");
  assert.equal(v.evidence[0]?.note, "saw the relay land");
  assert.match(r.body, /SIGNED verdict/);
});

test("attest: an either-witness test admits an operator attestation", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C3 },
    {},
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, true);
  assert.equal(f.verdicts.length, 1);
});

test("attest: the story greens only once EVERY declared test has a signed pass", async () => {
  // demo has 3 tests; uat-2 is machine-witness, so seed its machine pass first.
  const f = fakeStore();
  await f.store.appendEvent({
    id: `m:${C2}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: {
      unitId: C2,
      criterionId: C2,
      revisionId: R2,
      proofMode: "capability",
      outcome: "pass",
      commitSha: "abc",
      signer: "sandbox:runner@1",
      runId: "m",
      at: "2026-06-20T00:00:00.000Z",
    },
  });
  const deps = baseDeps({ store: f.store });

  // After attesting uat-1, the story is still unproven (uat-3 missing).
  const r1 = await uatCommand({ mode: "attest", storyId: "demo", target: C1 }, {}, deps);
  assert.equal(r1.ok, true);
  assert.match(r1.body, /story UAT:  unproven/);

  // Attesting the last test (uat-3) greens the story's UAT.
  const r2 = await uatCommand({ mode: "attest", storyId: "demo", target: C3 }, {}, deps);
  assert.equal(r2.ok, true);
  assert.match(r2.body, /story UAT:  GREEN/);
});

test("attest: a signed fail withers a previously-green story to unhealthy", async () => {
  const f = fakeStore();
  const deps = baseDeps({ store: f.store });
  // Prove uat-2 (machine) up front so a 3-test story can be fully green.
  await f.store.appendEvent({
    id: `m:${C2}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: {
      unitId: C2,
      criterionId: C2,
      revisionId: R2,
      proofMode: "capability",
      outcome: "pass",
      commitSha: "abc",
      signer: "sandbox:runner@1",
      runId: "m",
      at: "2026-06-20T00:00:00.000Z",
    },
  });
  await uatCommand({ mode: "attest", storyId: "demo", target: C1 }, {}, deps);
  await uatCommand({ mode: "attest", storyId: "demo", target: C3 }, {}, deps);
  // Now regress uat-1 with a signed fail.
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { outcome: "fail" },
    deps,
  );
  assert.equal(r.ok, true);
  assert.match(r.body, /story UAT:  WITHERED/);
});
