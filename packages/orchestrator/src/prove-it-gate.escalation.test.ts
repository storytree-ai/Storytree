import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { AuthorResult, AuthoringEscalation, AuthoringPhase, PhaseAuthor } from "@storytree/agent";
import type { SignerInputs } from "./proof/signer.js";

import { RecordingTestExecutor } from "./phase-machine.js";
import type { Phase, TestObservation } from "./phase-machine.js";
import { proveUnit } from "./prove-it-gate.js";
import type { ProveSpec, TreeState } from "./prove-it-gate.js";

/**
 * `escalation-ends-the-walk-or-is-overruled-by-observation` (ADR-0569 D1–D4):
 *
 *  - an AUTHOR_TEST escalation ends the walk after exactly one observation the spine takes but never
 *    gates on — it never becomes CONFIRM_RED (D4);
 *  - an IMPLEMENT escalation can never VETO an observation: the spine visits CONFIRM_GREEN exactly as
 *    it would without it. A red confirms the ordinary refusal and the record rides beside it; a green
 *    OVERRULES the escalation and the walk signs exactly as it would have (D3);
 *  - a MALFORMED escalation (raised from a phase other than the one it names) fails closed with no
 *    record of either kind (D1);
 *  - and in every case, the escalation never becomes and never enters a signed `Verdict` — only the
 *    two spine-observed CONFIRM_RED/CONFIRM_GREEN observations ever do.
 */

// ── Offline fixtures (mirrors prove-it-gate.test.ts) ────────────────────────

const FIXED_NOW = "2026-06-08T00:00:00.000Z";
const RED: TestObservation = { result: "red", kind: "compile", testId: "T" };
const GREEN: TestObservation = { result: "green", testId: "T" };
const CLEAN: TreeState = { commitSha: "deadbeefcafe", clean: true };
const DIRTY: TreeState = { commitSha: "deadbeefcafe", clean: false };
const SIGNER: SignerInputs = { flag: "sandbox:opus@run-1" };

const fixedTree = (state: TreeState) => async (): Promise<TreeState> => state;

const AUTHOR_ESCALATION: AuthoringEscalation = {
  phase: "AUTHOR_TEST",
  kind: "untestable-contract",
  statement: "the declared contract cannot be pinned by an isolated, automated unit test",
};

const IMPLEMENT_ESCALATION: AuthoringEscalation = {
  phase: "IMPLEMENT",
  kind: "unsatisfiable-test",
  statement: "no correct implementation can satisfy the authored test as written",
  assertion: "assert.equal(actual, expected)",
};

/**
 * A fully-controllable {@link PhaseAuthor} double (mirrors `FakeAuthor` in prove-it-gate.test.ts):
 * returns a scripted {@link AuthorResult} per phase (default `{ ok: true }`), letting a test dictate
 * an escalation-bearing failure without spending a real leaf turn.
 */
class FakeAuthor implements PhaseAuthor {
  readonly calls: AuthoringPhase[] = [];
  constructor(private readonly results: Partial<Record<AuthoringPhase, AuthorResult>>) {}
  async author(phase: AuthoringPhase): Promise<AuthorResult> {
    this.calls.push(phase);
    return this.results[phase] ?? { ok: true };
  }
}

function specWithAuthor(args: {
  author: PhaseAuthor;
  observations: TestObservation[];
  tree?: TreeState;
  signerInputs?: SignerInputs;
  testId?: string;
  onPhase?: (phase: Phase) => void;
}) {
  const store = new InMemoryStore();
  const executor = new RecordingTestExecutor(args.observations);
  const spec: ProveSpec = {
    unitId: "unit-1",
    proofMode: "contract",
    testId: args.testId ?? "T",
    author: args.author,
    testExecutor: executor,
    store,
    signerInputs: args.signerInputs ?? SIGNER,
    treeState: fixedTree(args.tree ?? CLEAN),
    now: () => FIXED_NOW,
    prompts: { authorTest: "author the test", implement: "implement it" },
    runId: "run-1",
  };
  if (args.onPhase !== undefined) spec.onPhase = args.onPhase;
  return { spec, executor, store };
}

async function signingRows(store: InMemoryStore): Promise<number> {
  const events = await store.readEvents();
  return events.filter((e) => e.kind === "signing").length;
}

/** Reads a not-yet-typed field off a `ProveResult` without asserting its exact shape at compile time. */
function readField<T>(value: unknown, key: string): T | undefined {
  return (value as unknown as Record<string, T | undefined>)[key];
}

describe(
  "escalation-ends-the-walk-or-is-overruled-by-observation: an authoring escalation ends a walk " +
    "without a verdict, or is overruled by the spine's own green observation, and never becomes or " +
    "enters a verdict",
  () => {
    test("an AUTHOR_TEST escalation ends the walk after exactly one observation that gates nothing (never CONFIRM_RED)", async () => {
      const seenPhases: Phase[] = [];
      const author = new FakeAuthor({
        AUTHOR_TEST: {
          ok: false,
          error: "leaf declares the contract untestable",
          escalation: AUTHOR_ESCALATION,
        },
      });
      const observedTestId = "custom-test-id";
      // Deliberately a GREEN observation: if the walk fell through into nextPhase's ordinary
      // CONFIRM_RED gate, a green there is the forged-early-pass refusal — proving instead that the
      // escalation ends the walk on its own terms, never through that gate.
      const soleObservation: TestObservation = {
        result: "green",
        testId: observedTestId,
        originalProcessResult: { stdout: "unexpected pass\n", stderr: "", exitCode: 0 },
      };
      const { spec, executor, store } = specWithAuthor({
        author,
        observations: [soleObservation],
        testId: observedTestId,
        onPhase: (phase) => seenPhases.push(phase),
      });

      const result = await proveUnit(spec);

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failedAt, "AUTHOR_TEST", "the walk ends at AUTHOR_TEST, never CONFIRM_RED");
      assert.deepEqual(result.phasesVisited, ["AUTHOR_TEST"], "CONFIRM_RED is never pushed onto phasesVisited");
      assert.deepEqual(executor.observed, [observedTestId], "the spine still takes exactly one observation");
      assert.deepEqual(
        seenPhases,
        ["AUTHOR_TEST"],
        "onPhase never fires for CONFIRM_RED on an escalated AUTHOR_TEST walk",
      );
      assert.doesNotMatch(
        result.reason,
        /requires an observed red/,
        "the escalation ends the walk on its own terms, never through nextPhase's CONFIRM_RED gate",
      );

      const record = readField<{ raised: unknown; testId: string; observation?: unknown }>(result, "escalation");
      assert.ok(record !== undefined, "the AUTHOR_TEST failure carries an escalation record");
      assert.deepEqual(record.raised, AUTHOR_ESCALATION);
      assert.equal(record.testId, observedTestId, "testId is stamped from spec.testId, never invented");
      assert.deepEqual(record.observation, soleObservation.originalProcessResult);

      assert.equal(readField(result, "overruledEscalation"), undefined, "AUTHOR_TEST never overrules — it ends the walk");
      assert.equal(await signingRows(store), 0, "an escalation never signs");
    });

    test("an AUTHOR_TEST escalation record's observation is absent when the executor supplies no process result", async () => {
      const author = new FakeAuthor({
        AUTHOR_TEST: { ok: false, error: "untestable", escalation: AUTHOR_ESCALATION },
      });
      const bareObservation: TestObservation = { result: "red", kind: "compile", testId: "T" };
      const { spec } = specWithAuthor({ author, observations: [bareObservation] });

      const result = await proveUnit(spec);

      assert.equal(result.ok, false);
      if (result.ok) return;
      const record = readField<Record<string, unknown>>(result, "escalation");
      assert.ok(record !== undefined);
      assert.equal("observation" in record, false, "the key is OMITTED, not set to undefined");
    });

    test("an IMPLEMENT escalation cannot veto a red CONFIRM_GREEN observation — the ordinary refusal runs unchanged and the record rides beside it", async () => {
      const author = new FakeAuthor({
        AUTHOR_TEST: { ok: true },
        IMPLEMENT: {
          ok: false,
          error: "leaf declares the test unsatisfiable",
          escalation: IMPLEMENT_ESCALATION,
        },
      });
      const { spec, executor, store } = specWithAuthor({ author, observations: [RED, RED] });

      const result = await proveUnit(spec);

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(
        result.failedAt,
        "CONFIRM_GREEN",
        "the spine visits CONFIRM_GREEN and observes exactly as it would without the escalation",
      );
      assert.match(result.reason, /requires an observed green/);
      assert.deepEqual(result.phasesVisited, ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN"]);
      assert.deepEqual(executor.observed, ["T", "T"]);

      const record = readField<{ raised: unknown; testId: string }>(result, "escalation");
      assert.ok(record !== undefined, "the escalation rides beside the ordinary refusal");
      assert.deepEqual(record.raised, IMPLEMENT_ESCALATION);
      assert.equal(record.testId, "T");
      assert.equal(
        "observation" in (record as unknown as Record<string, unknown>),
        false,
        "the CONFIRM_GREEN failure output is not copied onto the record",
      );

      assert.equal(readField(result, "overruledEscalation"), undefined, "a RED observation is not an overrule");
      assert.equal(await signingRows(store), 0, "still-red work never signs");
    });

    test("an IMPLEMENT escalation is OVERRULED by a green CONFIRM_GREEN observation — the walk signs exactly as it would have, recording overruledEscalation", async () => {
      const author = new FakeAuthor({
        AUTHOR_TEST: { ok: true },
        IMPLEMENT: {
          ok: false,
          error: "leaf declares the test unsatisfiable",
          escalation: IMPLEMENT_ESCALATION,
        },
      });
      const { spec, store } = specWithAuthor({ author, observations: [RED, GREEN] });

      const result = await proveUnit(spec);

      assert.equal(result.ok, true, "a green observation overrules the leaf's escalation and the walk still passes");
      if (!result.ok) return;
      assert.equal(result.verdict.outcome, "pass");
      assert.deepEqual(result.phasesVisited, [
        "AUTHOR_TEST",
        "CONFIRM_RED",
        "IMPLEMENT",
        "CONFIRM_GREEN",
        "GATE",
      ]);

      const record = readField<{ raised: unknown; testId: string }>(result, "overruledEscalation");
      assert.ok(record !== undefined, "the pass carries the overruled escalation");
      assert.deepEqual(record.raised, IMPLEMENT_ESCALATION);
      assert.equal(record.testId, "T");

      const verdictAsRecord = result.verdict as unknown as Record<string, unknown>;
      assert.equal("escalation" in verdictAsRecord, false, "the escalation never becomes or enters the signed verdict");
      assert.equal("overruledEscalation" in verdictAsRecord, false, "the escalation never becomes or enters the signed verdict");
      assert.equal(result.verdict.evidence.length, 2, "the verdict's evidence stays exactly the two CONFIRM observations");

      assert.equal(await signingRows(store), 1);
    });

    test("an overruled escalation still rides a LATER GATE refusal (dirty tree) as overruledEscalation on the failure variant", async () => {
      const author = new FakeAuthor({
        AUTHOR_TEST: { ok: true },
        IMPLEMENT: {
          ok: false,
          error: "leaf declares the test unsatisfiable",
          escalation: IMPLEMENT_ESCALATION,
        },
      });
      const { spec, store } = specWithAuthor({ author, observations: [RED, GREEN], tree: DIRTY });

      const result = await proveUnit(spec);

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failedAt, "GATE");
      assert.match(result.reason, /not clean/);

      const record = readField<{ raised: unknown; testId: string }>(result, "overruledEscalation");
      assert.ok(record !== undefined, "the overrule survives past CONFIRM_GREEN into a later GATE refusal");
      assert.deepEqual(record.raised, IMPLEMENT_ESCALATION);

      assert.equal(readField(result, "escalation"), undefined, "an overruled walk never also carries the plain `escalation` key");
      assert.equal(await signingRows(store), 0, "a dirty tree never signs, overruled or not");
    });

    test("a mismatched escalation phase (raised from a phase other than the one it names) fails closed with no record of either kind", async () => {
      // A malformed shape a well-behaved leaf can never produce (the one admitted route onto
      // AuthoringEscalation, parseAuthoringEscalation, binds phase and kind together) — pins what the
      // GATE itself does should a raw AuthorResult carry a phase/kind mismatch anyway: it trusts only
      // that the escalation's OWN `phase` field agrees with the phase that returned it.
      const mismatched: AuthoringEscalation = IMPLEMENT_ESCALATION;
      const author = new FakeAuthor({
        AUTHOR_TEST: { ok: false, error: "malformed escalation", escalation: mismatched },
      });
      const { spec, executor, store } = specWithAuthor({ author, observations: [RED] });

      const result = await proveUnit(spec);

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(
        result.failedAt,
        "AUTHOR_TEST",
        "fails closed at the phase of the slice that returned it, not escalation.phase",
      );
      assert.equal(readField(result, "escalation"), undefined, "no record of either kind");
      assert.equal(readField(result, "overruledEscalation"), undefined, "no record of either kind");
      assert.deepEqual(executor.observed, [], "a malformed escalation never reaches the spine's observation");

      assert.equal(await signingRows(store), 0);
    });
  },
);
