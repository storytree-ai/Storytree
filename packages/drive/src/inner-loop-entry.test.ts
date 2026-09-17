import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryStore, type Store, type StoreEvent } from "@storytree/storage-protocol";
import { appendInnerLoopEvent, readInnerLoopLedger } from "@storytree/orchestrator";
import {
  preflightInnerLoop,
  renderInnerLoopEntryState,
  resolveBuildIncrement,
  type InnerLoopEntryState,
  type InnerLoopRefusal,
} from "./inner-loop-entry.js";
import * as Drive from "./index.js";

// ── narrowing helpers ───────────────────────────────────────────────────────────────────────────
// `node:assert/strict`'s `equal` gives no type-level narrowing over a union return, so these two
// helpers carry the `asserts` signature that lets every test read `.state` / `.warnings` /
// `.ledgers` straight off the narrowed branch, with no cast anywhere in this file.

function assertOk<T extends { ok: boolean }>(result: T): asserts result is Extract<T, { ok: true }> {
  assert.equal(result.ok, true, "expected ok: true");
}

function assertRefused<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: false }> {
  assert.equal(result.ok, false, "expected ok: false");
}

// ── command strings the renderer must reproduce verbatim ──────────────────────────────────────────

const ARC_LIST_CMD = "storytree arc list --pg";
const DB_PROBE_CMD = "pnpm db:probe";
const grantCmd = (unitId: string) =>
  `storytree node grant ${unitId} --attempts <n> --kind <changed-input|fixed-defect|new-observation|revised-test> --difference <text|@file> --pg`;
const adjudicateCmd = (unitId: string, runId: string) =>
  `storytree node adjudicate ${unitId} --run ${runId} --pg`;

// ── the corpus fixture (walkthrough §Fixtures) ──────────────────────────────────────────────────

async function buildCorpus(): Promise<InMemoryStore> {
  const corpus = new InMemoryStore();
  const increment = (status?: "proposal" | "ready" | "active" | "closed") =>
    status === undefined
      ? { kind: "increment", arcRef: "asset:some-arc" }
      : { kind: "increment", arcRef: "asset:some-arc", status };
  await corpus.upsertDoc({ id: "inc-proposal", kind: "increment", doc: increment("proposal") });
  await corpus.upsertDoc({ id: "inc-ready", kind: "increment", doc: increment("ready") });
  await corpus.upsertDoc({ id: "inc-active", kind: "increment", doc: increment("active") });
  await corpus.upsertDoc({ id: "inc-closed", kind: "increment", doc: increment("closed") });
  await corpus.upsertDoc({ id: "inc-nostatus", kind: "increment", doc: increment() });
  await corpus.upsertDoc({ id: "some-arc", kind: "arc", doc: { kind: "arc" } });
  return corpus;
}

const throwingCorpus: Pick<Store, "getDoc"> = {
  getDoc: async () => {
    throw new Error("corpus-down-marker");
  },
};

const throwingLedger: Pick<Store, "readEvents"> = {
  readEvents: async () => {
    throw new Error("ledger-down-marker");
  },
};

// ── the ledger fixture (walkthrough §Fixtures) ──────────────────────────────────────────────────

type DiffKind = "changed-input" | "fixed-defect" | "new-observation" | "revised-test";

const attemptEvt = (unitId: string, incrementId: string, runId: string) =>
  ({ event: "attempt" as const, unitId, incrementId, runId });
const passEvt = (unitId: string, incrementId: string, runId: string) =>
  ({ event: "signed-pass" as const, unitId, incrementId, runId });
const grantEvt = (
  unitId: string,
  incrementId: string,
  runId: string,
  attempts: number,
  kind: DiffKind = "changed-input",
) => ({
  event: "grant" as const,
  unitId,
  incrementId,
  runId,
  attempts,
  kind,
  difference: "a new fixture",
});
const ownerGrantEvt = (
  unitId: string,
  incrementId: string,
  runId: string,
  attempts: number,
  kind: DiffKind = "revised-test",
) => ({
  event: "owner-grant" as const,
  unitId,
  incrementId,
  runId,
  attempts,
  kind,
  difference: "the owner-authorised test migration",
  authorityQuestionRef: "asset:q-a",
  authorityDecisionRef: "asset:adr-0577",
});
const landEvt = (unitId: string, incrementId: string, runId: string) => ({
  event: "adjudication" as const,
  unitId,
  incrementId,
  runId,
  disposition: "land" as const,
  mayRefuse: false,
  escalates: false,
  reason: "landed",
});
const reworkEvt = (unitId: string, incrementId: string, runId: string) => ({
  event: "adjudication" as const,
  unitId,
  incrementId,
  runId,
  disposition: "rework" as const,
  mayRefuse: true,
  escalates: false,
  reason: "mutants survived",
});

type LedgerDoc =
  | ReturnType<typeof attemptEvt>
  | ReturnType<typeof passEvt>
  | ReturnType<typeof grantEvt>
  | ReturnType<typeof ownerGrantEvt>
  | ReturnType<typeof landEvt>
  | ReturnType<typeof reworkEvt>;

async function seedLedger(...docs: readonly LedgerDoc[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const doc of docs) await appendInnerLoopEvent(store, doc);
  return store;
}

/** The orphan ledger: one grant on r9 for u1, with no recorded attempt (walkthrough §Fixtures). */
async function buildOrphanLedger(): Promise<InMemoryStore> {
  return seedLedger(grantEvt("u1", "inc-a", "r9", 1));
}

/** A ledger read handle plus the running count of its `readEvents` calls. */
interface CountingLedger {
  ledger: Pick<Store, "readEvents">;
  calls: { count: number };
}

/** Wraps a store's `readEvents` so a test can count how many times it was actually called. */
function countingLedger(store: InMemoryStore): CountingLedger {
  const calls = { count: 0 };
  const ledger: Pick<Store, "readEvents"> = {
    readEvents: async (filter?: { id?: string }): Promise<StoreEvent[]> => {
      calls.count++;
      return store.readEvents(filter);
    },
  };
  return { ledger, calls };
}

// ── a-paid-build-names-a-live-increment ─────────────────────────────────────────────────────────

test("a-paid-build-names-a-live-increment: refuses a missing or blank --increment id", async () => {
  const corpus = await buildCorpus();
  for (const id of [undefined, "", "   "] as const) {
    const result = await resolveBuildIncrement(corpus, id);
    assertRefused(result);
    assert.equal(result.state.state, "refused");
    assert.equal(result.state.refusals.length, 1);
    assert.equal(result.state.refusals[0]!.kind, "increment-missing");
    assert.ok(result.state.refusals[0]!.reason.includes("--increment"));
  }
});

test("a-paid-build-names-a-live-increment: refuses an unknown, wrong-kind, or closed increment, and renders arc list next", async () => {
  const corpus = await buildCorpus();

  const unknown = await resolveBuildIncrement(corpus, "no-such-increment");
  assertRefused(unknown);
  assert.equal(unknown.state.refusals.length, 1);
  assert.equal(unknown.state.refusals[0]!.kind, "increment-unknown");
  assert.ok(unknown.state.refusals[0]!.reason.includes("no-such-increment"));
  assert.ok(unknown.state.refusals[0]!.reason.includes("--increment"));
  assert.deepEqual(renderInnerLoopEntryState(unknown.state).next, [ARC_LIST_CMD]);

  const wrongKind = await resolveBuildIncrement(corpus, "some-arc");
  assertRefused(wrongKind);
  assert.equal(wrongKind.state.refusals.length, 1);
  assert.equal(wrongKind.state.refusals[0]!.kind, "increment-wrong-kind");
  assert.ok(wrongKind.state.refusals[0]!.reason.includes("some-arc"));
  assert.ok(wrongKind.state.refusals[0]!.reason.includes("arc"));
  assert.ok(wrongKind.state.refusals[0]!.reason.includes("--increment"));
  assert.deepEqual(renderInnerLoopEntryState(wrongKind.state).next, [ARC_LIST_CMD]);

  const closed = await resolveBuildIncrement(corpus, "inc-closed");
  assertRefused(closed);
  assert.equal(closed.state.refusals.length, 1);
  assert.equal(closed.state.refusals[0]!.kind, "increment-closed");
  assert.ok(closed.state.refusals[0]!.reason.includes("inc-closed"));
  assert.ok(closed.state.refusals[0]!.reason.includes("closed"));
  assert.ok(closed.state.refusals[0]!.reason.includes("--increment"));
  assert.deepEqual(renderInnerLoopEntryState(closed.state).next, [ARC_LIST_CMD]);
});

test("a-paid-build-names-a-live-increment: resolves an existing unclosed increment with its own status, defaulting to proposal", async () => {
  const corpus = await buildCorpus();
  const cases: ReadonlyArray<readonly [string, "proposal" | "ready" | "active"]> = [
    ["inc-proposal", "proposal"],
    ["inc-ready", "ready"],
    ["inc-active", "active"],
    ["inc-nostatus", "proposal"],
  ];
  for (const [id, status] of cases) {
    const result = await resolveBuildIncrement(corpus, id);
    assertOk(result);
    assert.equal(result.incrementId, id);
    assert.equal(result.status, status);
  }
});

test("a-paid-build-names-a-live-increment: refuses a corpus read that throws, quoting its error", async () => {
  const result = await resolveBuildIncrement(throwingCorpus, "inc-proposal");
  assertRefused(result);
  assert.equal(result.state.refusals.length, 1);
  assert.equal(result.state.refusals[0]!.kind, "increment-unreadable");
  assert.ok(result.state.refusals[0]!.reason.includes("corpus-down-marker"));
  assert.ok(result.state.refusals[0]!.reason.includes("--increment"));
  assert.deepEqual(renderInnerLoopEntryState(result.state).next, [DB_PROBE_CMD]);
});

// ── the-attempt-policy-refuses-before-spend ─────────────────────────────────────────────────────

test("the-attempt-policy-refuses-before-spend: proceeds under an empty ledger and below the decision point", async () => {
  const empty = new InMemoryStore();
  const emptyResult = await preflightInnerLoop({ ledger: empty, incrementId: "inc-a", unitIds: ["u1"] });
  assertOk(emptyResult);
  assert.deepEqual(emptyResult.warnings, []);
  assert.deepEqual(emptyResult.ledgers.get("u1")?.attempts, []);

  const twoFailures = await seedLedger(attemptEvt("u1", "inc-a", "r1"), attemptEvt("u1", "inc-a", "r2"));
  const twoResult = await preflightInnerLoop({ ledger: twoFailures, incrementId: "inc-a", unitIds: ["u1"] });
  assertOk(twoResult);
  assert.equal(twoResult.ledgers.get("u1")?.consecutiveFailures, 2);
});

test("the-attempt-policy-refuses-before-spend: stops at the decision point and proceeds under a live grant", async () => {
  const threeFailures = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-a", "r2"),
    attemptEvt("u1", "inc-a", "r3"),
  );
  const expectedPolicy = await readInnerLoopLedger(threeFailures, "u1");
  const decisionResult = await preflightInnerLoop({ ledger: threeFailures, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(decisionResult);
  assert.equal(decisionResult.state.refusals.length, 1);
  assert.equal(decisionResult.state.refusals[0]!.kind, "decision-point");
  assert.equal(decisionResult.state.refusals[0]!.unitId, "u1");
  assert.equal(decisionResult.state.refusals[0]!.reason, expectedPolicy.policy.reason);
  assert.deepEqual(renderInnerLoopEntryState(decisionResult.state).next, [grantCmd("u1")]);

  const grantedLedger = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-a", "r2"),
    attemptEvt("u1", "inc-a", "r3"),
    grantEvt("u1", "inc-a", "r3", 2),
  );
  const grantedResult = await preflightInnerLoop({ ledger: grantedLedger, incrementId: "inc-a", unitIds: ["u1"] });
  assertOk(grantedResult);
});

test("the-attempt-policy-refuses-before-spend: escalates to the owner at or above the ceiling", async () => {
  const sixFailures = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-a", "r2"),
    attemptEvt("u1", "inc-a", "r3"),
    attemptEvt("u1", "inc-a", "r4"),
    attemptEvt("u1", "inc-a", "r5"),
    attemptEvt("u1", "inc-a", "r6"),
  );
  const result = await preflightInnerLoop({ ledger: sixFailures, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(result);
  assert.equal(result.state.refusals.length, 1);
  assert.equal(result.state.refusals[0]!.kind, "owner-ceiling");
  assert.equal(result.state.refusals[0]!.unitId, "u1");
  assert.ok(result.state.refusals[0]!.reason.includes("ceiling"));
  assert.deepEqual(renderInnerLoopEntryState(result.state).next, []);
});

test("the-attempt-policy-refuses-before-spend: refuses an unresolved signed pass before spend", async () => {
  const ledger = await seedLedger(attemptEvt("u1", "inc-a", "r1"), passEvt("u1", "inc-a", "r1"));
  const result = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(result);
  assert.equal(result.state.refusals.length, 1);
  assert.equal(result.state.refusals[0]!.kind, "unresolved-signed-pass");
  assert.equal(result.state.refusals[0]!.unitId, "u1");
  assert.equal(result.state.refusals[0]!.runId, "r1");
  assert.ok(result.state.refusals[0]!.reason.includes("r1"));
  assert.ok(result.state.refusals[0]!.reason.includes("ADR-0563 D1"));
  assert.deepEqual(renderInnerLoopEntryState(result.state).next, [adjudicateCmd("u1", "r1")]);
});

test("the-attempt-policy-refuses-before-spend: refuses a rebuild under the increment that already landed", async () => {
  const landed = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    passEvt("u1", "inc-a", "r1"),
    landEvt("u1", "inc-a", "r1"),
  );

  const sameIncrement = await preflightInnerLoop({ ledger: landed, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(sameIncrement);
  assert.equal(sameIncrement.state.refusals.length, 1);
  assert.equal(sameIncrement.state.refusals[0]!.kind, "landed-under-increment");
  assert.equal(sameIncrement.state.refusals[0]!.unitId, "u1");
  assert.ok(sameIncrement.state.refusals[0]!.reason.includes("inc-a"));
  assert.ok(sameIncrement.state.refusals[0]!.reason.includes("ADR-0576 D4"));
  assert.ok(renderInnerLoopEntryState(sameIncrement.state).next.includes(ARC_LIST_CMD));

  const newIncrement = await preflightInnerLoop({ ledger: landed, incrementId: "inc-b", unitIds: ["u1"] });
  assertOk(newIncrement);
  assert.deepEqual(newIncrement.warnings, []);

  const reworked = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    passEvt("u1", "inc-a", "r1"),
    reworkEvt("u1", "inc-a", "r1"),
  );
  const afterRework = await preflightInnerLoop({ ledger: reworked, incrementId: "inc-a", unitIds: ["u1"] });
  assertOk(afterRework);
});

test("the-attempt-policy-refuses-before-spend: refuses whole on the first refusal across a reopened loop", async () => {
  const ledger = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    passEvt("u1", "inc-a", "r1"),
    landEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-b", "r2"),
    passEvt("u1", "inc-b", "r2"),
  );
  const result = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(result);
  assert.equal(result.state.refusals.length, 1);
  assert.equal(result.state.refusals[0]!.kind, "unresolved-signed-pass");
  assert.equal(result.state.refusals[0]!.runId, "r2");
});

test("the-attempt-policy-refuses-before-spend: warns on a relabelled increment but never refuses for it", async () => {
  const ledger = await seedLedger(attemptEvt("u1", "inc-a", "r1"), attemptEvt("u1", "inc-a", "r2"));

  const relabelled = await preflightInnerLoop({ ledger, incrementId: "inc-b", unitIds: ["u1"] });
  assertOk(relabelled);
  assert.equal(relabelled.warnings.length, 1);
  assert.ok(relabelled.warnings[0]!.includes("ADR-0563 D5"));
  assert.ok(relabelled.warnings[0]!.includes("u1"));
  assert.ok(relabelled.warnings[0]!.includes("inc-a"));
  assert.ok(relabelled.warnings[0]!.includes("inc-b"));

  const sameLabel = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"] });
  assertOk(sameLabel);
  assert.deepEqual(sameLabel.warnings, []);
});

test("the-attempt-policy-refuses-before-spend: fails closed when the ledger itself cannot be folded or read", async () => {
  const orphan = await buildOrphanLedger();
  const orphanResult = await preflightInnerLoop({ ledger: orphan, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(orphanResult);
  assert.equal(orphanResult.state.refusals.length, 1);
  assert.equal(orphanResult.state.refusals[0]!.kind, "ledger-unreadable");
  assert.equal(orphanResult.state.refusals[0]!.unitId, "u1");
  assert.ok(orphanResult.state.refusals[0]!.reason.includes("grant references no recorded attempt: r9"));

  const throwResult = await preflightInnerLoop({ ledger: throwingLedger, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(throwResult);
  assert.equal(throwResult.state.refusals.length, 1);
  assert.equal(throwResult.state.refusals[0]!.kind, "ledger-unreadable");
  assert.equal(throwResult.state.refusals[0]!.unitId, undefined);
  assert.ok(throwResult.state.refusals[0]!.reason.includes("ledger-down-marker"));
  assert.deepEqual(renderInnerLoopEntryState(throwResult.state).next, [DB_PROBE_CMD]);
});

// ── a-live-grant-pairs-with-the-run-shape ───────────────────────────────────────────────────────

test("a-live-grant-pairs-with-the-run-shape: a revised-test grant admits only a --revise-test run", async () => {
  const ledger = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-a", "r2"),
    attemptEvt("u1", "inc-a", "r3"),
    grantEvt("u1", "inc-a", "r3", 1, "revised-test"),
  );

  const revising = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"], revise: true });
  assertOk(revising);

  const notRevising = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"] });
  assertRefused(notRevising);
  assert.equal(notRevising.state.refusals.length, 1);
  assert.equal(notRevising.state.refusals[0]!.kind, "grant-kind-mismatch");
  assert.equal(notRevising.state.refusals[0]!.unitId, "u1");
  assert.ok(notRevising.state.refusals[0]!.reason.includes("revised-test"));
  assert.ok(notRevising.state.refusals[0]!.reason.includes("--revise-test"));
  assert.ok(notRevising.state.refusals[0]!.reason.includes("ADR-0576 D6"));
});

test("a-live-grant-pairs-with-the-run-shape: a non-revised-test grant refuses a --revise-test run", async () => {
  const ledger = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-a", "r2"),
    attemptEvt("u1", "inc-a", "r3"),
    grantEvt("u1", "inc-a", "r3", 1, "fixed-defect"),
  );

  const revising = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"], revise: true });
  assertRefused(revising);
  assert.equal(revising.state.refusals.length, 1);
  assert.equal(revising.state.refusals[0]!.kind, "grant-kind-mismatch");
  assert.ok(revising.state.refusals[0]!.reason.includes("fixed-defect"));
  assert.ok(revising.state.refusals[0]!.reason.includes("--revise-test"));
  assert.ok(revising.state.refusals[0]!.reason.includes("ADR-0576 D6"));

  const notRevising = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"], revise: false });
  assertOk(notRevising);
});

test("a-live-grant-pairs-with-the-run-shape: below the decision point either run shape may proceed", async () => {
  const ledger = await seedLedger(attemptEvt("u1", "inc-a", "r1"));

  const revising = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"], revise: true });
  assertOk(revising);

  const notRevising = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"], revise: false });
  assertOk(notRevising);
});

// ── a-multi-unit-preflight-reads-once-and-refuses-whole ─────────────────────────────────────────

test("a-multi-unit-preflight-reads-once-and-refuses-whole: reads the ledger once and refuses every refusing unit in order", async () => {
  const store = new InMemoryStore();
  await appendInnerLoopEvent(store, attemptEvt("u2", "inc-a", "r1"));
  await appendInnerLoopEvent(store, attemptEvt("u2", "inc-a", "r2"));
  await appendInnerLoopEvent(store, attemptEvt("u2", "inc-a", "r3"));
  await appendInnerLoopEvent(store, attemptEvt("u3", "inc-a", "r1"));
  await appendInnerLoopEvent(store, passEvt("u3", "inc-a", "r1"));

  const { ledger, calls } = countingLedger(store);

  const result = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1", "u2", "u3"] });
  assertRefused(result);
  assert.equal(result.state.refusals.length, 2);
  assert.equal(result.state.refusals[0]!.kind, "decision-point");
  assert.equal(result.state.refusals[0]!.unitId, "u2");
  assert.equal(result.state.refusals[1]!.kind, "unresolved-signed-pass");
  assert.equal(result.state.refusals[1]!.unitId, "u3");
  assert.equal(result.state.refusals[1]!.runId, "r1");
  assert.equal(calls.count, 1);

  const rendered = renderInnerLoopEntryState(result.state);
  assert.equal(rendered.lines.length, 2);
  assert.ok(rendered.lines[0]!.includes("u2"));
  assert.ok(rendered.lines[1]!.includes("u3"));
  assert.deepEqual(rendered.next, [grantCmd("u2"), adjudicateCmd("u3", "r1")]);

  calls.count = 0;
  const onlyU1 = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"] });
  assertOk(onlyU1);
  assert.equal(onlyU1.ledgers.size, 1);
  assert.equal(calls.count, 1);
});

test("a-multi-unit-preflight-reads-once-and-refuses-whole: a ledger read failure refuses once with no unit attached", async () => {
  const result = await preflightInnerLoop({ ledger: throwingLedger, incrementId: "inc-a", unitIds: ["u1", "u2"] });
  assertRefused(result);
  assert.equal(result.state.refusals.length, 1);
  assert.equal(result.state.refusals[0]!.kind, "ledger-unreadable");
  assert.equal(result.state.refusals[0]!.unitId, undefined);
});

// ── one-entry-state-renders-every-outcome ───────────────────────────────────────────────────────

test("one-entry-state-renders-every-outcome: renders the signed state with its adjudicate command", () => {
  const state: InnerLoopEntryState = { state: "signed", unitId: "u1", runId: "r7" };
  const rendered = renderInnerLoopEntryState(state);
  assert.equal(rendered.lines.length, 1);
  assert.ok(rendered.lines[0]!.includes("u1"));
  assert.ok(rendered.lines[0]!.includes("r7"));
  assert.ok(rendered.lines[0]!.includes("ADR-0563 D1"));
  assert.deepEqual(rendered.next, [adjudicateCmd("u1", "r7")]);
});

test("one-entry-state-renders-every-outcome: renders attempt-failed across the decision point, grant window, and ceiling", () => {
  const cases: ReadonlyArray<{
    consecutiveFailures: number;
    remainingGrantCount: number;
    contains: readonly string[];
    next: readonly string[];
  }> = [
    {
      consecutiveFailures: 1,
      remainingGrantCount: 0,
      contains: ["another attempt may proceed under the same increment"],
      next: [],
    },
    {
      consecutiveFailures: 3,
      remainingGrantCount: 0,
      contains: ["ADR-0563 D4"],
      next: [grantCmd("u1")],
    },
    {
      consecutiveFailures: 4,
      remainingGrantCount: 1,
      contains: ["1 granted attempt(s) remain"],
      next: [],
    },
    {
      consecutiveFailures: 6,
      remainingGrantCount: 0,
      contains: ["owner", "ADR-0563 D4"],
      next: [],
    },
  ];

  for (const c of cases) {
    const state: InnerLoopEntryState = {
      state: "attempt-failed",
      unitId: "u1",
      runId: "r7",
      consecutiveFailures: c.consecutiveFailures,
      remainingGrantCount: c.remainingGrantCount,
    };
    const rendered = renderInnerLoopEntryState(state);
    assert.equal(rendered.lines.length, 1);
    const line = rendered.lines[0]!;
    assert.ok(line.includes("u1"));
    assert.ok(line.includes("r7"));
    assert.ok(line.includes(`${c.consecutiveFailures} consecutive failure(s)`));
    for (const fragment of c.contains) assert.ok(line.includes(fragment));
    assert.deepEqual(rendered.next, c.next);
  }
});

test("one-entry-state-renders-every-outcome: renders the not-attempted state", () => {
  const state: InnerLoopEntryState = { state: "not-attempted", unitId: "u2" };
  const rendered = renderInnerLoopEntryState(state);
  assert.equal(rendered.lines.length, 1);
  assert.ok(rendered.lines[0]!.includes("not attempted"));
  assert.ok(rendered.lines[0]!.includes("u2"));
  assert.deepEqual(rendered.next, []);
});

test("one-entry-state-renders-every-outcome: dedupes next across multiple refusals in the same refused state", () => {
  const refusals: readonly InnerLoopRefusal[] = [
    { kind: "increment-closed", reason: "x" },
    { kind: "landed-under-increment", unitId: "u1", reason: "y" },
  ];
  const state: InnerLoopEntryState = { state: "refused", refusals };
  const rendered = renderInnerLoopEntryState(state);
  assert.equal(rendered.lines.length, 2);
  assert.deepEqual(rendered.next, [ARC_LIST_CMD]);
});

test("one-entry-state-renders-every-outcome: exports the very same functions through the drive barrel", () => {
  assert.equal(Drive.resolveBuildIncrement, resolveBuildIncrement);
  assert.equal(Drive.preflightInnerLoop, preflightInnerLoop);
  assert.equal(Drive.renderInnerLoopEntryState, renderInnerLoopEntryState);
});

// ── strengthening: the branches the mutation rung found unwitnessed ─────────────────────────────

test("a-paid-build-names-a-live-increment: an increment row with no doc body resolves at the default proposal status", async () => {
  for (const body of [null, undefined]) {
    const corpus: Pick<Store, "getDoc"> = {
      getDoc: async (id: string) => ({
        id,
        kind: "increment",
        doc: body,
        createdAt: "2026-09-17T00:00:00.000Z",
        updatedAt: "2026-09-17T00:00:00.000Z",
      }),
    };
    const result = await resolveBuildIncrement(corpus, "inc-bodiless");
    assert.deepEqual(result, { ok: true, incrementId: "inc-bodiless", status: "proposal" }, String(body));
  }
});

test("the-attempt-policy-refuses-before-spend: a landing that measures or declares a gap also refuses a rebuild under its increment", async () => {
  const landings = [
    { disposition: "land-and-measure" as const, mayRefuse: false, escalates: false },
    { disposition: "land-and-declare-gap" as const, mayRefuse: false, escalates: true },
  ];
  for (const landing of landings) {
    const ledger = new InMemoryStore();
    await appendInnerLoopEvent(ledger, attemptEvt("u1", "inc-a", "r1"));
    await appendInnerLoopEvent(ledger, passEvt("u1", "inc-a", "r1"));
    await appendInnerLoopEvent(ledger, {
      event: "adjudication",
      unitId: "u1",
      incrementId: "inc-a",
      runId: "r1",
      reason: "landed",
      ...landing,
    });
    const result = await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"] });
    assert.deepEqual(
      result,
      {
        ok: false,
        state: {
          state: "refused",
          refusals: [
            {
              kind: "landed-under-increment",
              unitId: "u1",
              reason:
                "u1 already landed a signed pass under increment inc-a: new work on a landed unit names a new increment (ADR-0576 D4)",
            },
          ],
        },
      },
      landing.disposition,
    );
  }
});

test("the-attempt-policy-refuses-before-spend: a relabel warning names every increment the open loop was filed under", async () => {
  const ledger = await seedLedger(attemptEvt("u1", "inc-a", "r1"), attemptEvt("u1", "inc-b", "r2"));
  const result = await preflightInnerLoop({ ledger, incrementId: "inc-c", unitIds: ["u1"] });
  assertOk(result);
  assert.deepEqual(result.warnings, [
    "u1: its open loop was filed under inc-a, inc-b, and this build names inc-c — ADR-0563 D5: a retry reuses its own increment",
  ]);
});

test("a-live-grant-pairs-with-the-run-shape: the live grant's kind is read from this unit's own latest grant event alone", async () => {
  const mismatch = (grantKind: string) => ({
    ok: false,
    state: {
      state: "refused",
      refusals: [
        {
          kind: "grant-kind-mismatch",
          unitId: "u1",
          reason: `u1 holds a live ${grantKind} grant, and a --revise-test run consumes only a revised-test grant (ADR-0576 D6)`,
        },
      ],
    },
  });
  const failuresThenGrant = async (): Promise<InMemoryStore> =>
    seedLedger(
      attemptEvt("u1", "inc-a", "r1"),
      attemptEvt("u1", "inc-a", "r2"),
      attemptEvt("u1", "inc-a", "r3"),
      grantEvt("u1", "inc-a", "r3", 2, "fixed-defect"),
    );

  // A later event of ANOTHER kind that merely looks like a revised-test grant is not a grant.
  const decoyKind = await failuresThenGrant();
  await decoyKind.appendEvent({
    id: "decoy-grant",
    kind: "verdict",
    type: "created",
    doc: { event: "grant", unitId: "u1", incrementId: "inc-a", runId: "r3", kind: "revised-test" },
  });
  const plainRun = await preflightInnerLoop({ ledger: decoyKind, incrementId: "inc-a", unitIds: ["u1"] });
  assertOk(plainRun);

  // A later revised-test grant filed for ANOTHER unit does not change this unit's grant.
  const otherUnit = await failuresThenGrant();
  await appendInnerLoopEvent(otherUnit, grantEvt("u2", "inc-a", "q3", 1, "revised-test"));
  assert.deepEqual(
    await preflightInnerLoop({ ledger: otherUnit, incrementId: "inc-a", unitIds: ["u1"], revise: true }),
    mismatch("fixed-defect"),
  );

  // A later NON-grant event of this unit (an attempt consuming one granted run) keeps the grant's kind.
  const consumedOne = await failuresThenGrant();
  await appendInnerLoopEvent(consumedOne, attemptEvt("u1", "inc-a", "r4"));
  assert.deepEqual(
    await preflightInnerLoop({ ledger: consumedOne, incrementId: "inc-a", unitIds: ["u1"], revise: true }),
    mismatch("fixed-defect"),
  );
});

test("a-live-grant-pairs-with-the-run-shape: of two grants the one with the higher seq is live, whatever order the ledger returns them in", async () => {
  const store = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-a", "r2"),
    attemptEvt("u1", "inc-a", "r3"),
    grantEvt("u1", "inc-a", "r3", 1, "fixed-defect"),
    attemptEvt("u1", "inc-a", "r4"),
    grantEvt("u1", "inc-a", "r4", 2, "revised-test"),
  );
  const inSeqOrder = await store.readEvents();
  assert.equal(inSeqOrder.length, 6, "fixture: six ledger events");
  // The revised-test grant (highest seq) first, the consumed fixed-defect grant last.
  const shuffled: Pick<Store, "readEvents"> = {
    readEvents: async () => [inSeqOrder[5]!, ...inSeqOrder.slice(0, 3), inSeqOrder[4]!, inSeqOrder[3]!],
  };
  const plainRun = await preflightInnerLoop({ ledger: shuffled, incrementId: "inc-a", unitIds: ["u1"] });
  assert.deepEqual(plainRun, {
    ok: false,
    state: {
      state: "refused",
      refusals: [
        {
          kind: "grant-kind-mismatch",
          unitId: "u1",
          reason:
            "u1 holds a live revised-test grant, so this attempt must be a --revise-test run (ADR-0576 D6)",
        },
      ],
    },
  });
});

test("owner-grant-carries-settled-authority: preflight reads the live owner-grant kind rather than treating it as no grant", async () => {
  const ledger = await seedLedger(
    attemptEvt("u1", "inc-a", "r1"),
    attemptEvt("u1", "inc-a", "r2"),
    attemptEvt("u1", "inc-a", "r3"),
    attemptEvt("u1", "inc-a", "r4"),
    attemptEvt("u1", "inc-a", "r5"),
    attemptEvt("u1", "inc-a", "r6"),
    ownerGrantEvt("u1", "inc-a", "r6", 1),
  );

  assert.deepEqual(
    await preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"], revise: false }),
    {
      ok: false,
      state: {
        state: "refused",
        refusals: [
          {
            kind: "grant-kind-mismatch",
            unitId: "u1",
            reason:
              "u1 holds a live revised-test grant, so this attempt must be a --revise-test run (ADR-0576 D6)",
          },
        ],
      },
    },
  );
});

test("one-entry-state-renders-every-outcome: an increment refusal names no unit and points at the arc list", () => {
  assert.deepEqual(
    renderInnerLoopEntryState({
      state: "refused",
      refusals: [{ kind: "increment-missing", reason: "no increment was named" }],
    }),
    { lines: ["refused before spend (increment-missing): no increment was named"], next: [ARC_LIST_CMD] },
  );
});
