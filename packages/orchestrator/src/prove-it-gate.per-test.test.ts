import { test } from "node:test";
import assert from "node:assert/strict";

import type { AuthorResult, AuthoringPhase, PhaseAuthor } from "@storytree/agent";
import { InMemoryStore } from "@storytree/storage-protocol";

import { RecordingTestExecutor } from "./phase-machine.js";
import type { TestObservation } from "./phase-machine.js";
import { describePerTestRefusal } from "./proof/per-test-review.js";
import type { PerTestFinding, PerTestJudgement, PerTestPolicy } from "./proof/per-test-review.js";
import { proveUnit } from "./prove-it-gate.js";
import type { ProveSpec } from "./prove-it-gate.js";

// The gate's half of ADR-0573: it owns the SEQUENCE — the baseline before AUTHOR_TEST, each review only
// after `nextPhase` would advance — and a review can refuse, never advance. Observations and reviews are
// doubled here so each ordering claim is observable; `prove-it-gate.per-test.e2e.test.ts` runs the real
// runners.

const RED: TestObservation = { result: "red", kind: "runtime", testId: "T" };
const GREEN: TestObservation = { result: "green", testId: "T" };
const REVIEWED: PerTestJudgement = { ok: true, declaredTests: 2, acceptedGuardRails: [] };
const HOLLOW: PerTestFinding = {
  check: "C4",
  test: ["suite", "hollow"],
  detail: "passed before its implementation exists, and names no declared contract",
  namedContracts: [],
};

class LoggingAuthor implements PhaseAuthor {
  readonly #log: string[];

  constructor(log: string[]) {
    this.#log = log;
  }

  async author(phase: AuthoringPhase): Promise<AuthorResult> {
    this.#log.push(`author:${phase}`);
    return { ok: true };
  }
}

/** A policy double that logs when the gate consults it and returns the scripted judgements. */
function loggingPolicy(
  log: string[],
  judgements: { red?: PerTestJudgement; green?: PerTestJudgement; redNotObserved?: string },
): PerTestPolicy {
  const base = {
    beforeAuthorTest: (): void => {
      log.push("baseline");
    },
    confirmGreen: (obs: TestObservation): PerTestJudgement => {
      log.push(`green-review:${obs.result}`);
      return judgements.green ?? REVIEWED;
    },
  };
  if (judgements.redNotObserved !== undefined) return { ...base, redNotObserved: judgements.redNotObserved };
  return {
    ...base,
    confirmRed: (obs: TestObservation): PerTestJudgement => {
      log.push(`red-review:${obs.result}`);
      return judgements.red ?? REVIEWED;
    },
  };
}

/** A walk's spec, and the store its signing row (if any) lands in. */
interface WalkSpec {
  readonly spec: ProveSpec;
  readonly store: InMemoryStore;
}

function walkSpec(observations: TestObservation[], log: string[], perTest?: PerTestPolicy): WalkSpec {
  const store = new InMemoryStore();
  const spec: ProveSpec = {
    unitId: "unit-1",
    proofMode: "contract",
    testId: "T",
    author: new LoggingAuthor(log),
    testExecutor: new RecordingTestExecutor(observations),
    store,
    signerInputs: { flag: "tester@example.com" },
    treeState: async () => ({ commitSha: "deadbeefcafe", clean: true }),
    now: () => "2026-09-15T00:00:00.000Z",
    prompts: { authorTest: "author the test", implement: "implement it" },
    runId: "run-1",
  };
  if (perTest !== undefined) spec.perTest = perTest;
  return { spec, store };
}

async function signingRows(store: InMemoryStore): Promise<number> {
  return (await store.readEvents()).filter((e) => e.kind === "signing").length;
}

test("per-test-review-only-refuses: the baseline is read before AUTHOR_TEST is handed out, and each review runs after its own observation", async () => {
  const log: string[] = [];
  const { spec, store } = walkSpec([RED, GREEN], log, loggingPolicy(log, {}));
  const result = await proveUnit(spec);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(log, ["baseline", "author:AUTHOR_TEST", "red-review:red", "author:IMPLEMENT", "green-review:green"]);
  assert.equal(await signingRows(store), 1);
  assert.deepEqual(result.verdict.acceptedGuardRails, []);
  assert.deepEqual(
    result.verdict.evidence.map((e) => e.note),
    [
      "observed red (runtime) — per-test: 2 declared test(s) reviewed individually at CONFIRM_RED (ADR-0573 C1–C7); none accepted before its implementation existed",
      "observed green — per-test: 2 declared test(s) each reported green at CONFIRM_GREEN (ADR-0573 D1)",
    ],
  );
});

test("per-test-review-only-refuses: an observation the exit code refuses is never rescued by its review", async () => {
  // A green where the red must be: nextPhase refuses, and the review that would have said "fine" is never asked.
  const earlyGreenLog: string[] = [];
  const earlyGreen = walkSpec([GREEN], earlyGreenLog, loggingPolicy(earlyGreenLog, {}));
  const refusedRed = await proveUnit(earlyGreen.spec);
  assert.equal(refusedRed.ok, false);
  if (refusedRed.ok) return;
  assert.equal(refusedRed.failedAt, "CONFIRM_RED");
  assert.match(refusedRed.reason, /^CONFIRM_RED requires an observed red/);
  assert.equal(refusedRed.perTestFindings, undefined);
  assert.deepEqual(earlyGreenLog, ["baseline", "author:AUTHOR_TEST"]);

  // A red where the green must be: the same, one phase on.
  const stillRedLog: string[] = [];
  const stillRed = walkSpec([RED, RED], stillRedLog, loggingPolicy(stillRedLog, {}));
  const refusedGreen = await proveUnit(stillRed.spec);
  assert.equal(refusedGreen.ok, false);
  if (refusedGreen.ok) return;
  assert.equal(refusedGreen.failedAt, "CONFIRM_GREEN");
  assert.match(refusedGreen.reason, /^CONFIRM_GREEN requires an observed green/);
  assert.equal(stillRedLog.includes("green-review:red"), false);
  assert.equal(await signingRows(stillRed.store), 0);
});

test("per-test-review-only-refuses: a refused red review fails closed at CONFIRM_RED, before IMPLEMENT and without a signature", async () => {
  const log: string[] = [];
  const { spec, store } = walkSpec([RED, GREEN], log, loggingPolicy(log, { red: { ok: false, findings: [HOLLOW] } }));
  const result = await proveUnit(spec);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failedAt, "CONFIRM_RED");
  assert.equal(result.reason, describePerTestRefusal("CONFIRM_RED", [HOLLOW]));
  assert.deepEqual(result.perTestFindings, [HOLLOW]);
  assert.equal(log.includes("author:IMPLEMENT"), false);
  assert.equal(await signingRows(store), 0);
});

test("per-test-review-only-refuses: a refused green review fails closed at CONFIRM_GREEN without a signature", async () => {
  const missing: PerTestFinding = { check: "C2", test: ["suite", "never ran"], detail: "declared, and never reported" };
  const log: string[] = [];
  const { spec, store } = walkSpec([RED, GREEN], log, loggingPolicy(log, { green: { ok: false, findings: [missing] } }));
  const result = await proveUnit(spec);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failedAt, "CONFIRM_GREEN");
  assert.equal(result.reason, describePerTestRefusal("CONFIRM_GREEN", [missing]));
  assert.deepEqual(result.perTestFindings, [missing]);
  assert.deepEqual(result.phasesVisited, ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN"]);
  assert.equal(await signingRows(store), 0);
});

test("per-test-review-only-refuses: an accepted guard-rail is stamped on the verdict and disclosed on its red evidence", async () => {
  const log: string[] = [];
  const accepted: PerTestJudgement = {
    ok: true,
    declaredTests: 3,
    acceptedGuardRails: [{ test: ["probe-cluster", "g1: never throws"], contracts: ["g1"] }],
  };
  const { spec } = walkSpec([RED, GREEN], log, loggingPolicy(log, { red: accepted }));
  const result = await proveUnit(spec);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.verdict.acceptedGuardRails, [{ test: ["probe-cluster", "g1: never throws"], contracts: ["g1"] }]);
  assert.match(result.verdict.evidence[0]?.note ?? "", /1 accepted as a declared guard-rail, never observed failing \(ADR-0572\)$/);
});

test("per-test-review-only-refuses: a red not observed per test says why on its evidence, and stamps no acceptance record", async () => {
  const log: string[] = [];
  const reason = "a structural red is observed by its exit code alone";
  const { spec } = walkSpec([RED, GREEN], log, loggingPolicy(log, { redNotObserved: reason }));
  const result = await proveUnit(spec);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("acceptedGuardRails" in result.verdict, false, "absent, never [] — [] would claim red WAS observed per test");
  assert.equal(result.verdict.evidence[0]?.note, `observed red (runtime) — per-test: not observed at CONFIRM_RED — ${reason}`);
  assert.deepEqual(log, ["baseline", "author:AUTHOR_TEST", "author:IMPLEMENT", "green-review:green"]);
});

test("per-test-review-only-refuses: a unit with no per-test policy signs exactly as before", async () => {
  const { spec } = walkSpec([RED, GREEN], []);
  const result = await proveUnit(spec);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.verdict.evidence.map((e) => e.note), ["observed red (runtime)", "observed green"]);
  assert.equal("acceptedGuardRails" in result.verdict, false);
});
