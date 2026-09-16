import assert from "node:assert/strict";
import test from "node:test";
import {
  INNER_LOOP_EVENT_KIND,
  type InnerLoopEventDoc,
} from "@storytree/proof-protocol";
import { InMemoryStore, type StoreEvent } from "@storytree/storage-protocol";
import {
  appendInnerLoopEvent,
  foldInnerLoopLedger,
  innerLoopEventId,
  readInnerLoopLedger,
} from "./inner-loop-ledger.js";

const scope = { unitId: "unit", incrementId: "increment" } as const;
type AttemptEvent = Extract<InnerLoopEventDoc, { event: "attempt" }>;
type GrantEvent = Extract<InnerLoopEventDoc, { event: "grant" }>;
type SignedPassEvent = Extract<InnerLoopEventDoc, { event: "signed-pass" }>;
type AdjudicationEvent = Extract<InnerLoopEventDoc, { event: "adjudication" }>;

const attempt = (runId: string): AttemptEvent => ({ event: "attempt", ...scope, runId });
const pass = (runId: string): SignedPassEvent => ({ event: "signed-pass", ...scope, runId });
const grant = (runId: string, attempts = 1): GrantEvent => ({
  event: "grant",
  ...scope,
  runId,
  attempts,
  kind: "fixed-defect",
  difference: "fixed the failing parser",
});
const adjudication = (
  runId: string,
  disposition: "land" | "land-and-measure" | "land-and-declare-gap" | "rework" | "refuse",
): AdjudicationEvent => {
  const event: AdjudicationEvent = {
    event: "adjudication",
    ...scope,
    runId,
    disposition,
    mayRefuse: disposition === "rework" || disposition === "refuse",
    escalates: disposition === "land-and-declare-gap",
    reason: "the deterministic ruler decided this",
  };
  return disposition === "refuse" ? { ...event, namedRule: "ADR-0232 D5" } : event;
};
const stored = (doc: InnerLoopEventDoc, seq: number, overrides: Partial<StoreEvent> = {}): StoreEvent => ({
  seq,
  id: innerLoopEventId(doc),
  kind: INNER_LOOP_EVENT_KIND,
  type: "created",
  doc,
  actor: "test",
  at: `2026-09-16T00:00:${String(seq).padStart(2, "0")}.000Z`,
  ...overrides,
});

test("fold orders by durable sequence and scopes one unit and increment", () => {
  const elsewhere = { event: "attempt", unitId: "elsewhere", incrementId: "other", runId: "x" } as const;
  const events = [stored(attempt("r3"), 3), stored(attempt("r1"), 1), stored(elsewhere, 4), stored(attempt("r2"), 2)];

  const ledger = foldInnerLoopLedger(events, scope.unitId, scope.incrementId);

  assert.deepEqual(ledger.attempts, [
    { runId: "r1", signed: false },
    { runId: "r2", signed: false },
    { runId: "r3", signed: false },
  ]);
  assert.equal(ledger.consecutiveFailures, 3);
  assert.equal(ledger.policy.disposition, "stop-and-decide");
});

test("fold ignores malformed inner-loop rows whose loose scope is elsewhere", () => {
  const malformedElsewhere = { event: "unknown", unitId: "elsewhere", incrementId: "other" };

  const ledger = foldInnerLoopLedger(
    [stored(attempt("r1"), 1), stored(attempt("other"), 2, { doc: malformedElsewhere })],
    scope.unitId,
    scope.incrementId,
  );

  assert.deepEqual(ledger.attempts, [{ runId: "r1", signed: false }]);
});

test("fold rejects malformed selected or ambiguous-scope inner-loop rows", () => {
  const malformedSelected = { event: "unknown", ...scope };
  const malformedAmbiguous = { event: "attempt", unitId: scope.unitId };
  const blankScope = { event: "attempt", unitId: "   ", incrementId: "other", runId: "x" };

  assert.throws(
    () => foldInnerLoopLedger([stored(attempt("r1"), 1, { doc: malformedSelected })], scope.unitId, scope.incrementId),
  );
  assert.throws(
    () => foldInnerLoopLedger([stored(attempt("r1"), 1, { doc: malformedAmbiguous })], scope.unitId, scope.incrementId),
  );
  assert.throws(
    () => foldInnerLoopLedger([stored(attempt("r1"), 1, { doc: blankScope })], scope.unitId, scope.incrementId),
  );
});

test("fold requires created envelopes only for the selected scope", () => {
  for (const type of ["updated", "deleted"] as const) {
    assert.throws(
      () => foldInnerLoopLedger([stored(attempt("r1"), 1, { type })], scope.unitId, scope.incrementId),
      new RegExp(`must be created: ${type}`),
    );
  }

  const elsewhere = { event: "attempt", unitId: "elsewhere", incrementId: "other", runId: "x" } as const;
  const ledger = foldInnerLoopLedger(
    [stored(attempt("r1"), 1), stored(elsewhere, 2, { type: "updated" })],
    scope.unitId,
    scope.incrementId,
  );

  assert.deepEqual(ledger.attempts, [{ runId: "r1", signed: false }]);
});

test("a grant binds the latest failed run and exposes only its unused allowance", () => {
  const events = [
    stored(attempt("r1"), 1),
    stored(attempt("r2"), 2),
    stored(attempt("r3"), 3),
    stored(grant("r3", 2), 4),
    stored(attempt("r4"), 5),
  ];

  const ledger = foldInnerLoopLedger(events, scope.unitId, scope.incrementId);

  assert.equal(ledger.remainingGrantCount, 1);
  assert.equal(ledger.consecutiveFailures, 4);
  assert.equal(ledger.policy.disposition, "granted");
  assert.equal(ledger.policy.granted, 1);
  assert.match(ledger.policy.reason, /fixed the failing parser/);
  assert.doesNotMatch(ledger.policy.reason, /no recorded grant/);
});

test("a signed pass resets failures, extinguishes a grant, and remains unresolved", () => {
  const events = [
    stored(attempt("r1"), 1),
    stored(attempt("r2"), 2),
    stored(attempt("r3"), 3),
    stored(grant("r3", 2), 4),
    stored(attempt("r4"), 5),
    stored(pass("r4"), 6),
  ];

  const ledger = foldInnerLoopLedger(events, scope.unitId, scope.incrementId);

  assert.deepEqual(ledger.attempts.at(-1), { runId: "r4", signed: true });
  assert.equal(ledger.consecutiveFailures, 0);
  assert.equal(ledger.remainingGrantCount, 0);
  assert.deepEqual(ledger.unresolvedSignedRuns, ["r4"]);
  assert.equal(ledger.policy.disposition, "signed");
});

test("landing resolves a signed pass while refusal and rework reopen the attempt policy", () => {
  for (const disposition of ["land", "refuse", "rework"] as const) {
    const ledger = foldInnerLoopLedger(
      [stored(attempt("r1"), 1), stored(pass("r1"), 2), stored(adjudication("r1", disposition), 3)],
      scope.unitId,
      scope.incrementId,
    );

    assert.deepEqual(ledger.unresolvedSignedRuns, []);
    assert.deepEqual(ledger.adjudications, [adjudication("r1", disposition)]);
    assert.equal(ledger.policy.disposition, disposition === "land" ? "signed" : "proceed");
  }
});

test("an unresolved signed pass blocks another attempt", () => {
  assert.throws(
    () => foldInnerLoopLedger(
      [stored(attempt("r1"), 1), stored(pass("r1"), 2), stored(attempt("r2"), 3)],
      scope.unitId,
      scope.incrementId,
    ),
    /unresolved signed pass r1 blocks another attempt/,
  );
});

test("an admissible refusal lets the next attempt start a fresh failure count", () => {
  const ledger = foldInnerLoopLedger([
    stored(attempt("r1"), 1),
    stored(pass("r1"), 2),
    stored(adjudication("r1", "refuse"), 3),
    stored(attempt("r2"), 4),
  ], scope.unitId, scope.incrementId);

  assert.equal(ledger.consecutiveFailures, 1);
  assert.equal(ledger.policy.disposition, "proceed");
  assert.deepEqual(ledger.unresolvedSignedRuns, []);
});

test("a landing adjudication closes the loop instead of silently reopening it", () => {
  for (const disposition of ["land", "land-and-measure", "land-and-declare-gap"] as const) {
    assert.throws(
      () => foldInnerLoopLedger([
        stored(attempt("r1"), 1),
        stored(pass("r1"), 2),
        stored(adjudication("r1", disposition), 3),
        stored(attempt("r2"), 4),
      ], scope.unitId, scope.incrementId),
      /landed signed pass r1 closes the attempt loop/,
    );
  }
});

test("grants reject the wrong run, an early decision, overlap, and the owner ceiling", () => {
  const three = [stored(attempt("r1"), 1), stored(attempt("r2"), 2), stored(attempt("r3"), 3)];
  assert.throws(() => foldInnerLoopLedger([...three, stored(grant("r2"), 4)], scope.unitId, scope.incrementId), /latest failed run/);
  assert.throws(
    () => foldInnerLoopLedger([stored(attempt("r1"), 1), stored(attempt("r2"), 2), stored(grant("r2"), 3)], scope.unitId, scope.incrementId),
    /early/,
  );
  assert.throws(
    () => foldInnerLoopLedger([...three, stored(grant("r3", 2), 4), stored(attempt("r4"), 5), stored(grant("r4"), 6)], scope.unitId, scope.incrementId),
    /overlaps/,
  );
  const six = Array.from({ length: 6 }, (_, index) => stored(attempt(`r${index + 1}`), index + 1));
  assert.throws(() => foldInnerLoopLedger([...six, stored(grant("r6"), 7)], scope.unitId, scope.incrementId), /ceiling/);
});

test("fold collapses exact replay and refuses conflicting or noncanonical identity", () => {
  const first = stored(attempt("r1"), 1);
  assert.equal(foldInnerLoopLedger([first, { ...first, seq: 2 }], scope.unitId, scope.incrementId).attempts.length, 1);
  assert.throws(
    () => foldInnerLoopLedger([{ ...first, id: "inner-loop:attempt:not-the-doc" }], scope.unitId, scope.incrementId),
    /noncanonical/,
  );
  assert.throws(
    () => foldInnerLoopLedger([
      stored(attempt("r1"), 1),
      stored(attempt("r2"), 2),
      stored(attempt("r3"), 3),
      stored(grant("r3"), 4),
      stored({ ...grant("r3"), difference: "a different alleged fix" }, 5),
    ], scope.unitId, scope.incrementId),
    /conflicting/,
  );
});

test("pass and adjudication require their own recorded predecessor", () => {
  assert.throws(() => foldInnerLoopLedger([stored(pass("r1"), 1)], scope.unitId, scope.incrementId), /no recorded attempt/);
  assert.throws(
    () => foldInnerLoopLedger([
      stored(attempt("r1"), 1),
      stored(attempt("r2"), 2),
      stored(pass("r1"), 3),
    ], scope.unitId, scope.incrementId),
    /signed pass must bind the latest attempt/,
  );
  assert.throws(
    () => foldInnerLoopLedger([stored(attempt("r1"), 1), stored(adjudication("r1", "land"), 2)], scope.unitId, scope.incrementId),
    /signed pass/,
  );
});

test("generic Store helper is idempotent and a fresh reader folds persisted history", async () => {
  const store = new InMemoryStore();
  const first = await appendInnerLoopEvent(store, attempt("r1"), "original");
  const replay = await appendInnerLoopEvent(store, attempt("r1"), "replayer");
  await appendInnerLoopEvent(store, pass("r1"));

  assert.equal(first.seq, replay.seq);
  assert.equal(replay.actor, "original");
  assert.equal((await store.readEvents()).length, 2);
  assert.deepEqual(
    await readInnerLoopLedger(store, scope.unitId, scope.incrementId),
    foldInnerLoopLedger(await store.readEvents(), scope.unitId, scope.incrementId),
  );
});

test("generic Store helper validates runtime input, ignores other kinds, and rejects conflict", async () => {
  const store = new InMemoryStore();
  await assert.rejects(
    () => appendInnerLoopEvent(store, { ...attempt("r1"), unitId: "   " } as never),
    /unitId/,
  );

  const doc = grant("r3");
  await store.appendEvent({ id: innerLoopEventId(doc), kind: "other-kind", type: "created", doc });
  const appended = await appendInnerLoopEvent(store, doc);
  assert.equal(appended.kind, INNER_LOOP_EVENT_KIND);

  await assert.rejects(
    () => appendInnerLoopEvent(store, { ...doc, difference: "a different alleged fix" }),
    /conflicting/,
  );

  const corrupt = new InMemoryStore();
  await corrupt.appendEvent({ id: innerLoopEventId(doc), kind: INNER_LOOP_EVENT_KIND, type: "created", doc });
  await corrupt.appendEvent({
    id: innerLoopEventId(doc),
    kind: INNER_LOOP_EVENT_KIND,
    type: "created",
    doc: { ...doc, difference: "a conflicting stored replay" },
  });
  await assert.rejects(() => appendInnerLoopEvent(corrupt, doc), /conflicting/);
});
