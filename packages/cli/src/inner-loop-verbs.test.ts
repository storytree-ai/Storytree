import assert from "node:assert/strict";
import test from "node:test";
import { INNER_LOOP_EVENT_KIND, type InnerLoopEventDoc } from "@storytree/proof-protocol";
import { InMemoryStore, type StoreEvent } from "@storytree/storage-protocol";
import {
  ATTEMPT_DECISION_POINT,
  adjudicateLanding,
  appendInnerLoopEvent,
  decideAttempt,
  foldInnerLoopLedger,
  type LandingObjection,
} from "@storytree/orchestrator";
import { runnerFor } from "./mutation-diff.js";
import {
  readNodeAttempts,
  recordNodeAdjudication,
  recordNodeGrant,
  strengthSignalFromTestScript,
} from "./inner-loop-verbs.js";

type AttemptEvent = Extract<InnerLoopEventDoc, { event: "attempt" }>;
type GrantEvent = Extract<InnerLoopEventDoc, { event: "grant" }>;
type SignedPassEvent = Extract<InnerLoopEventDoc, { event: "signed-pass" }>;
type AdjudicationEvent = Extract<InnerLoopEventDoc, { event: "adjudication" }>;
type Disposition = AdjudicationEvent["disposition"];

const unitId = "u1";
const VALID_GRANT_INPUT = { unitId, attempts: 1, kind: "fixed-defect", difference: "a fixed defect" } as const;

function attempt(runId: string, incrementId: string): AttemptEvent {
  return { event: "attempt", unitId, incrementId, runId };
}
function signedPass(runId: string, incrementId: string): SignedPassEvent {
  return { event: "signed-pass", unitId, incrementId, runId };
}
function grantDoc(runId: string, incrementId: string, attempts = 1): GrantEvent {
  return {
    event: "grant",
    unitId,
    incrementId,
    runId,
    attempts,
    kind: "fixed-defect",
    difference: "a fixed defect",
  };
}
function adjudicationDoc(runId: string, disposition: Disposition, incrementId: string): AdjudicationEvent {
  const base = {
    event: "adjudication" as const,
    unitId,
    incrementId,
    runId,
    disposition,
    mayRefuse: disposition === "rework" || disposition === "refuse",
    escalates: disposition === "land-and-declare-gap",
    reason: "the deterministic ruler decided this",
  };
  return disposition === "refuse" ? { ...base, namedRule: "ADR-0232 D5" } : base;
}

/** Folds the store's own history, so an assertion never trusts a value it did not independently derive. */
async function freshLedger(store: InMemoryStore) {
  return foldInnerLoopLedger(await store.readEvents(), unitId);
}

async function eventCount(store: InMemoryStore): Promise<number> {
  return (await store.readEvents()).filter((e) => e.kind === INNER_LOOP_EVENT_KIND).length;
}

async function buildStore(docs: readonly InnerLoopEventDoc[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const doc of docs) await appendInnerLoopEvent(store, doc);
  return store;
}

/** The fixed fold failure every "the store cannot be read" case below drives. */
class ThrowingStore extends InMemoryStore {
  override async readEvents(): Promise<StoreEvent[]> {
    throw new Error("ledger-down-marker");
  }
}

test('node-grant-refuses-an-inadmissible-grant: an unknown kind refuses before any read, naming the four kinds', async () => {
  const store = new ThrowingStore();
  const result = await recordNodeGrant(store, { unitId, attempts: 1, kind: "vibes", difference: "irrelevant" });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.equal(
    result.reason,
    'unknown grant kind "vibes" — expected changed-input, fixed-defect, new-observation or revised-test',
  );
});

test("node-grant-refuses-an-inadmissible-grant: a better-spec grant is refused with D4's reason regardless of the real ledger", async () => {
  const betterSpecGrant = { unitId, attempts: 1, kind: "better-spec", difference: "a new fixture" };
  const expectedReason = decideAttempt({
    unitId,
    attempts: Array.from({ length: ATTEMPT_DECISION_POINT }, () => ({ incrementId: "synthetic", signed: false })),
    grant: { attempts: 1, kind: "better-spec", difference: "a new fixture" },
  }).reason;
  assert.match(expectedReason, /"a better spec" does not count as different \(ADR-0563 D4\)/);

  const throwing = new ThrowingStore();
  const twoFailures = await buildStore([attempt("r1", "inc-a"), attempt("r2", "inc-a")]);
  const sixFailures = await buildStore(Array.from({ length: 6 }, (_, i) => attempt(`r${i + 1}`, "inc-a")));
  const beforeTwo = await eventCount(twoFailures);
  const beforeSix = await eventCount(sixFailures);

  for (const store of [throwing, twoFailures, sixFailures]) {
    const result = await recordNodeGrant(store, betterSpecGrant);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected a refusal");
    assert.equal(result.reason, expectedReason);
    assert.doesNotMatch(result.reason, /ledger-down-marker/);
  }

  assert.equal(await eventCount(twoFailures), beforeTwo);
  assert.equal(await eventCount(sixFailures), beforeSix);
});

test("node-grant-refuses-an-inadmissible-grant: a blank difference refuses without touching the ledger", async () => {
  const store = new ThrowingStore();
  const result = await recordNodeGrant(store, { unitId, attempts: 1, kind: "fixed-defect", difference: "   " });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.match(result.reason, /the grant states no difference/);
  assert.doesNotMatch(result.reason, /ledger-down-marker/);
});

test("node-grant-refuses-an-inadmissible-grant: a non-positive-integer attempts count refuses without touching the ledger", async () => {
  const store = new ThrowingStore();
  for (const attempts of [0, -1, 1.5]) {
    const result = await recordNodeGrant(store, { unitId, attempts, kind: "fixed-defect", difference: "a fixed defect" });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected a refusal");
    assert.match(result.reason, /grants nothing/);
    assert.doesNotMatch(result.reason, /ledger-down-marker/);
  }
});

test("node-grant-refuses-an-inadmissible-grant: the fold refuses a grant with no recorded attempt", async () => {
  const store = new InMemoryStore();
  const result = await recordNodeGrant(store, VALID_GRANT_INPUT);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.equal(result.reason, "u1 has no recorded attempt for a grant to bind");
  assert.equal(await eventCount(store), 0);
});

test("node-grant-refuses-an-inadmissible-grant: the fold refuses a grant before the decision point", async () => {
  const store = await buildStore([attempt("r1", "inc-a"), attempt("r2", "inc-a")]);
  const before = await eventCount(store);

  const result = await recordNodeGrant(store, VALID_GRANT_INPUT);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.equal(result.reason, "grant is early: the decision point is three failures");
  assert.equal(await eventCount(store), before);
});

test("node-grant-refuses-an-inadmissible-grant: the fold refuses a grant overlapping a live grant", async () => {
  const store = await buildStore([
    attempt("r1", "inc-a"),
    attempt("r2", "inc-a"),
    attempt("r3", "inc-a"),
    grantDoc("r3", "inc-a", 2),
    attempt("r4", "inc-a"),
  ]);
  const before = await eventCount(store);

  const result = await recordNodeGrant(store, VALID_GRANT_INPUT);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.equal(result.reason, "grant overlaps a live grant");
  assert.equal(await eventCount(store), before);
});

test("node-grant-refuses-an-inadmissible-grant: the fold refuses a grant beyond the owner ceiling", async () => {
  const store = await buildStore(Array.from({ length: 6 }, (_, i) => attempt(`r${i + 1}`, "inc-a")));
  const before = await eventCount(store);

  const result = await recordNodeGrant(store, VALID_GRANT_INPUT);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.equal(result.reason, "grant exceeds the owner ceiling of 6 failures");
  assert.equal(await eventCount(store), before);
});

test("node-grant-refuses-an-inadmissible-grant: a store read failure surfaces as a refusal quoting the failure", async () => {
  const store = new ThrowingStore();

  const result = await recordNodeGrant(store, VALID_GRANT_INPUT);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.equal(result.reason, "the attempt ledger could not be read: ledger-down-marker");
});

test("node-grant-refuses-an-inadmissible-grant: the fold refuses corrupt history naming the offending run", async () => {
  const store = new InMemoryStore();
  await appendInnerLoopEvent(store, grantDoc("r9", "inc-a"));

  const result = await recordNodeGrant(store, VALID_GRANT_INPUT);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.match(result.reason, /grant references no recorded attempt: r9/);
});

test("node-grant-binds-the-latest-failed-run: a valid grant binds the latest failed run's own increment", async () => {
  const store = await buildStore([attempt("r1", "inc-a"), attempt("r2", "inc-a"), attempt("r3", "inc-b")]);
  const before = await eventCount(store);

  const result = await recordNodeGrant(store, {
    unitId,
    attempts: 2,
    kind: "changed-input",
    difference: "a new fixture",
    actor: "orchestrator@example.com",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a grant to be recorded");
  assert.deepEqual(result.event, {
    event: "grant",
    unitId: "u1",
    incrementId: "inc-b",
    runId: "r3",
    attempts: 2,
    kind: "changed-input",
    difference: "a new fixture",
  });
  assert.equal(result.ledger.remainingGrantCount, 2);
  assert.equal(result.ledger.policy.disposition, "granted");
  assert.deepEqual(result.ledger, await freshLedger(store));

  assert.equal(await eventCount(store), before + 1);
  const events = await store.readEvents();
  const appended = events.find((e) => e.kind === INNER_LOOP_EVENT_KIND && (e.doc as { event?: string }).event === "grant");
  assert.ok(appended);
  assert.equal(appended?.actor, "orchestrator@example.com");
});

test("node-adjudicate-refuses-without-an-unresolved-signed-pass: a malformed objection refuses before any read", async () => {
  const store = new ThrowingStore();
  const calls: string[] = [];
  const reach = (id: string): boolean => {
    calls.push(id);
    return true;
  };

  const kindResult = await recordNodeAdjudication(
    store,
    { unitId, runId: "r1", objection: { kind: "vibes", statement: "irrelevant" } },
    reach,
  );
  assert.equal(kindResult.ok, false);
  if (kindResult.ok) throw new Error("expected a refusal");
  assert.match(kindResult.reason, /test-quality/);
  assert.match(kindResult.reason, /rule-violation/);
  assert.match(kindResult.reason, /surviving-mutants/);
  assert.doesNotMatch(kindResult.reason, /ledger-down-marker/);

  const statementResult = await recordNodeAdjudication(
    store,
    { unitId, runId: "r1", objection: { kind: "test-quality", statement: "  " } },
    reach,
  );
  assert.equal(statementResult.ok, false);
  if (statementResult.ok) throw new Error("expected a refusal");
  assert.match(statementResult.reason, /statement/);
  assert.doesNotMatch(statementResult.reason, /ledger-down-marker/);

  for (const survivors of [-1, 1.5]) {
    const result = await recordNodeAdjudication(
      store,
      { unitId, runId: "r1", objection: { kind: "surviving-mutants", statement: "some survived", survivors } },
      reach,
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected a refusal");
    assert.match(result.reason, /survivors/);
    assert.doesNotMatch(result.reason, /ledger-down-marker/);
  }

  assert.deepEqual(calls, []);
});

test("node-adjudicate-refuses-without-an-unresolved-signed-pass: refuses a run with no unresolved signed pass, naming the run", async () => {
  const store = await buildStore([attempt("r1", "inc-a")]);
  const before = await eventCount(store);
  const calls: string[] = [];
  const reach = (id: string): boolean => {
    calls.push(id);
    return true;
  };

  for (const runId of ["r1", "r9"]) {
    const result = await recordNodeAdjudication(store, { unitId, runId }, reach);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected a refusal");
    assert.equal(
      result.reason,
      `run ${runId} holds no unresolved signed pass for ${unitId} — nothing to adjudicate (ADR-0576 D3)`,
    );
  }

  assert.deepEqual(calls, []);
  assert.equal(await eventCount(store), before);
});

test("node-adjudicate-refuses-without-an-unresolved-signed-pass: refuses a run already settled by a landing adjudication", async () => {
  const store = await buildStore([attempt("r1", "inc-a"), signedPass("r1", "inc-a"), adjudicationDoc("r1", "land", "inc-a")]);
  const before = await eventCount(store);
  const calls: string[] = [];
  const reach = (id: string): boolean => {
    calls.push(id);
    return true;
  };

  const result = await recordNodeAdjudication(store, { unitId, runId: "r1" }, reach);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.equal(result.reason, "run r1 holds no unresolved signed pass for u1 — nothing to adjudicate (ADR-0576 D3)");
  assert.deepEqual(calls, []);
  assert.equal(await eventCount(store), before);
});

test("node-adjudicate-refuses-without-an-unresolved-signed-pass: a store read failure surfaces as a refusal quoting the failure", async () => {
  const store = new ThrowingStore();
  const calls: string[] = [];
  const reach = (id: string): boolean => {
    calls.push(id);
    return true;
  };

  const result = await recordNodeAdjudication(store, { unitId, runId: "r1" }, reach);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  assert.match(result.reason, /ledger-down-marker/);
  assert.deepEqual(calls, []);
});

test("node-adjudicate-records-the-landing-ruler: records exactly what adjudicateLanding returns, for every objection and reach", async () => {
  const cases: ReadonlyArray<{
    readonly label: string;
    readonly objection?: { readonly kind: string; readonly statement: string; readonly decision?: string; readonly survivors?: number };
    readonly reachResult: boolean;
  }> = [
    { label: "no objection", reachResult: true },
    { label: "test-quality, reachable", objection: { kind: "test-quality", statement: "assertions look weak" }, reachResult: true },
    { label: "test-quality, unreachable", objection: { kind: "test-quality", statement: "assertions look weak" }, reachResult: false },
    {
      label: "rule-violation naming a decision",
      objection: { kind: "rule-violation", statement: "shell proof-feedback was self-granted", decision: "ADR-0232 D5" },
      reachResult: true,
    },
    {
      label: "rule-violation naming no decision",
      objection: { kind: "rule-violation", statement: "an opinion wearing a rule's clothes" },
      reachResult: true,
    },
    {
      label: "surviving-mutants with survivors",
      objection: { kind: "surviving-mutants", statement: "2 mutants survived", survivors: 2 },
      reachResult: true,
    },
    {
      label: "surviving-mutants with none surviving",
      objection: { kind: "surviving-mutants", statement: "no mutant survived", survivors: 0 },
      reachResult: true,
    },
  ];

  for (const c of cases) {
    const store = await buildStore([attempt("r1", "inc-a"), attempt("r2", "inc-b"), signedPass("r2", "inc-b")]);
    const calls: string[] = [];
    const reach = (id: string): boolean => {
      calls.push(id);
      return c.reachResult;
    };

    const result =
      c.objection === undefined
        ? await recordNodeAdjudication(store, { unitId, runId: "r2" }, reach)
        : await recordNodeAdjudication(store, { unitId, runId: "r2", objection: c.objection }, reach);

    assert.equal(result.ok, true, c.label);
    if (!result.ok) throw new Error(`expected ${c.label} to be recorded`);

    const expectedAdjudication =
      c.objection === undefined
        ? adjudicateLanding({ unitId, signed: true, strengthSignalAvailable: c.reachResult })
        : adjudicateLanding({
            unitId,
            signed: true,
            objection: c.objection as LandingObjection,
            strengthSignalAvailable: c.reachResult,
          });
    assert.deepEqual(result.adjudication, expectedAdjudication, c.label);

    const expectedEvent: Record<string, unknown> = {};
    expectedEvent.event = "adjudication";
    expectedEvent.unitId = "u1";
    expectedEvent.incrementId = "inc-b";
    expectedEvent.runId = "r2";
    expectedEvent.disposition = expectedAdjudication.disposition;
    expectedEvent.mayRefuse = expectedAdjudication.mayRefuse;
    expectedEvent.escalates = expectedAdjudication.escalates;
    expectedEvent.reason = expectedAdjudication.reason;
    if (expectedAdjudication.inadmissible !== undefined) {
      expectedEvent.inadmissible = expectedAdjudication.inadmissible;
    }
    if (expectedAdjudication.disposition === "refuse") {
      expectedEvent.namedRule = (c.objection?.decision ?? "").trim();
    }
    assert.deepEqual(result.event, expectedEvent, c.label);

    assert.ok(calls.includes("u1"), c.label);

    const ledger = await freshLedger(store);
    assert.ok(!ledger.unresolvedSignedRuns.includes("r2"), c.label);
    assert.equal(ledger.adjudications.at(-1)?.disposition, expectedAdjudication.disposition, c.label);
  }
});

test("node-adjudicate-records-the-landing-ruler: strengthSignalFromTestScript matches runnerFor's reach exactly", () => {
  const scripts: ReadonlyArray<{ readonly script: string | undefined; readonly expected: boolean }> = [
    { script: "bun test --timeout 300000 src/", expected: true },
    { script: "vitest run", expected: true },
    { script: 'node --import tsx --test "src/**/*.test.ts"', expected: false },
    { script: undefined, expected: false },
  ];

  for (const { script, expected } of scripts) {
    assert.equal(strengthSignalFromTestScript(script), runnerFor(script) !== null);
    assert.equal(strengthSignalFromTestScript(script), expected);
  }
});

test("node-attempts-renders-the-fold: an empty ledger renders the no-attempts line", async () => {
  const store = new InMemoryStore();

  const result = await readNodeAttempts(store, unitId);

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the fold to render");
  assert.deepEqual(result.lines, ["u1: no recorded attempts"]);
});

test("node-attempts-renders-the-fold: a mixed ledger renders the summary, attempt and owed lines", async () => {
  const store = await buildStore([attempt("r1", "inc-a"), attempt("r2", "inc-b"), signedPass("r2", "inc-b")]);
  const ledger = await freshLedger(store);

  const result = await readNodeAttempts(store, unitId);

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the fold to render");
  assert.equal(result.lines[0], `u1: 2 attempt(s), 0 consecutive failure(s) — policy signed: ${ledger.policy.reason}`);
  assert.ok(result.lines.includes("  r1  increment inc-a  unsigned"));
  assert.ok(result.lines.includes("  r2  increment inc-b  signed"));
  assert.ok(result.lines.includes("  owed: storytree node adjudicate u1 --run r2 --pg"));
});

test("node-attempts-renders-the-fold: a landed adjudication renders and clears the owed line", async () => {
  const store = await buildStore([
    attempt("r1", "inc-a"),
    attempt("r2", "inc-b"),
    signedPass("r2", "inc-b"),
    adjudicationDoc("r2", "land", "inc-b"),
  ]);

  const result = await readNodeAttempts(store, unitId);

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the fold to render");
  assert.ok(result.lines.includes("  adjudicated r2: land"));
  assert.ok(!result.lines.some((line) => line.includes("owed:")));
});

test("node-attempts-renders-the-fold: a live grant renders its remaining count", async () => {
  const store = await buildStore([
    attempt("r1", "inc-a"),
    attempt("r2", "inc-a"),
    attempt("r3", "inc-a"),
    grantDoc("r3", "inc-a", 2),
  ]);

  const result = await readNodeAttempts(store, unitId);

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the fold to render");
  assert.ok(result.lines.includes("  live grant: 2 attempt(s) remain"));
});

test("node-attempts-renders-the-fold: a broken or corrupt ledger refuses instead of rendering", async () => {
  const throwing = new ThrowingStore();
  const throwingResult = await readNodeAttempts(throwing, unitId);
  assert.equal(throwingResult.ok, false);
  if (throwingResult.ok) throw new Error("expected a refusal");
  assert.match(throwingResult.reason, /ledger-down-marker/);

  const orphan = new InMemoryStore();
  await appendInnerLoopEvent(orphan, grantDoc("r9", "inc-a"));
  const orphanResult = await readNodeAttempts(orphan, unitId);
  assert.equal(orphanResult.ok, false);
  if (orphanResult.ok) throw new Error("expected a refusal");
  assert.match(orphanResult.reason, /grant references no recorded attempt: r9/);
});

/** A store that appends normally until `refuseAppends` is set, then throws on every append. */
class AppendRefusingStore extends InMemoryStore {
  refuseAppends = false;
  override async appendEvent(e: Parameters<InMemoryStore["appendEvent"]>[0]): ReturnType<InMemoryStore["appendEvent"]> {
    if (this.refuseAppends) throw new Error("append-down-marker");
    return super.appendEvent(e);
  }
}

test("node-grant-binds-the-latest-failed-run: a grant the store cannot append refuses with the store's own error", async () => {
  const store = new AppendRefusingStore();
  for (const doc of [attempt("r1", "inc-a"), attempt("r2", "inc-a"), attempt("r3", "inc-a")]) {
    await appendInnerLoopEvent(store, doc);
  }
  store.refuseAppends = true;
  const result = await recordNodeGrant(store, VALID_GRANT_INPUT);
  assert.deepEqual(result, { ok: false, reason: "append-down-marker" });
});

test("node-adjudicate-records-the-landing-ruler: an adjudication the store cannot append refuses with the store's own error", async () => {
  const store = new AppendRefusingStore();
  for (const doc of [attempt("r1", "inc-a"), signedPass("r1", "inc-a")]) {
    await appendInnerLoopEvent(store, doc);
  }
  store.refuseAppends = true;
  const result = await recordNodeAdjudication(store, { unitId, runId: "r1" }, () => true);
  assert.deepEqual(result, { ok: false, reason: "append-down-marker" });
});

test("node-adjudicate-records-the-landing-ruler: a refusal records the decision it enforces without its surrounding space", async () => {
  const store = await buildStore([attempt("r1", "inc-a"), signedPass("r1", "inc-a")]);
  const result = await recordNodeAdjudication(
    store,
    {
      unitId,
      runId: "r1",
      objection: { kind: "rule-violation", statement: "it bypasses the fence", decision: "  ADR-0232 D5  " },
    },
    () => true,
  );
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the ruling to be recorded");
  assert.equal(result.adjudication.disposition, "refuse");
  assert.equal((result.event as AdjudicationEvent).namedRule, "ADR-0232 D5");
});

test("node-attempts-renders-the-fold: a failing ledger with no grant renders its summary and attempts and nothing more", async () => {
  const store = await buildStore([attempt("r1", "inc-a"), attempt("r2", "inc-a")]);
  const ledger = await freshLedger(store);
  const result = await readNodeAttempts(store, unitId);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the fold to render");
  assert.deepEqual(result.lines, [
    `u1: 2 attempt(s), 2 consecutive failure(s) — policy ${ledger.policy.disposition}: ${ledger.policy.reason}`,
    "  r1  increment inc-a  unsigned",
    "  r2  increment inc-a  unsigned",
  ]);
});
