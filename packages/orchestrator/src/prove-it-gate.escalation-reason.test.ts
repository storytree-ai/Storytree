import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { AuthorResult, AuthoringEscalation, AuthoringPhase, PhaseAuthor } from "@storytree/agent";

import { nodeEvalExecutor, ShellTestExecutor } from "./shell-test-executor.js";
import { proveUnit } from "./prove-it-gate.js";
import type { ProveSpec, TreeState } from "./prove-it-gate.js";
import type { SignerInputs } from "./proof/signer.js";

/**
 * `standing-escalation-is-named-in-its-refusal-reason` (ADR-0569 D1/D3/D4): a refusal names the
 * authoring escalation it CARRIES or REJECTS in its own `reason` string, appended AFTER the reason
 * the same refusal would give without one — never in place of it, never ahead of it.
 *
 *  - a CONFIRM_GREEN refusal whose IMPLEMENT slice escalated (D3, standing/confirmed — not
 *    overruled) begins with exactly the reason `nextPhase`/the note/the exhaustion note already give,
 *    then names the escalation's `kind` and quotes its `statement` verbatim;
 *  - an AUTHOR_TEST escalation's own reason (D4) names the `kind` and quotes the `statement`
 *    verbatim (it may still keep the leaf's `error`);
 *  - a MALFORMED escalation's reason (D1) — a rejection, never a record — already names both the
 *    phase of the slice that returned it and the phase the escalation declares, and that stays true;
 *  - an OVERRULED escalation that rides a later GATE refusal (D3) adds NOTHING: that refusal gives
 *    exactly the reason its escalation-free twin gives, byte for byte.
 *
 * The comparisons are FACTS, not phrasing: a twin walk (identical inputs, no escalation) establishes
 * the reason the refusal gives "without one", and the escalated walk's reason is checked to either
 * start with that exact prefix (D3 standing) or match it exactly (D3 overruled) — the CONNECTING
 * words between the prefix and the escalation's kind/statement are the implementer's to choose.
 */

// ── Offline fixtures ─────────────────────────────────────────────────────────

const FIXED_NOW = "2026-06-08T00:00:00.000Z";
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

/** A fully-controllable {@link PhaseAuthor} double: returns a scripted result per phase. */
class FakeAuthor implements PhaseAuthor {
  constructor(private readonly results: Partial<Record<AuthoringPhase, AuthorResult>>) {}
  async author(phase: AuthoringPhase): Promise<AuthorResult> {
    return this.results[phase] ?? { ok: true };
  }
}

/**
 * A {@link ShellTestExecutor} that replays a FIXED sequence of node scripts for the SAME testId, one
 * per call — needed where `proveUnit` calls `testExecutor.run(spec.testId)` twice with one id (once
 * at CONFIRM_RED, once at CONFIRM_GREEN) and the two calls must observe DIFFERENT outcomes (a real
 * red, then a real green).
 */
function sequentialExecutor(scripts: string[]): ShellTestExecutor {
  let cursor = 0;
  return new ShellTestExecutor({
    command: () => {
      const script = scripts[cursor];
      cursor += 1;
      if (script === undefined) {
        throw new Error(`sequentialExecutor: exhausted after ${cursor - 1} call(s)`);
      }
      return { file: process.execPath, args: ["-e", script] };
    },
  });
}

function buildSpec(args: {
  author: PhaseAuthor;
  executor: ShellTestExecutor;
  testId: string;
  tree?: TreeState;
}): ProveSpec {
  return {
    unitId: "unit-1",
    proofMode: "contract",
    testId: args.testId,
    author: args.author,
    testExecutor: args.executor,
    store: new InMemoryStore(),
    signerInputs: SIGNER,
    treeState: fixedTree(args.tree ?? CLEAN),
    now: () => FIXED_NOW,
    prompts: { authorTest: "author the test", implement: "implement it" },
    runId: "run-1",
  };
}

describe(
  "standing-escalation-is-named-in-its-refusal-reason: a refusal names the authoring escalation it " +
    "carries or rejects, after the reason it gives without one",
  () => {
    test("a CONFIRM_GREEN refusal with a STANDING IMPLEMENT escalation begins with exactly its twin's reason, then names the kind and quotes the statement verbatim", async () => {
      const testId = "T-standing";

      // The twin: an identical walk with NO escalation, refusing at CONFIRM_GREEN on a real red —
      // this establishes the reason the refusal "gives without one".
      const twinSpec = buildSpec({
        author: new FakeAuthor({}),
        executor: nodeEvalExecutor({ [testId]: "process.exit(1)" }),
        testId,
      });
      const twinResult = await proveUnit(twinSpec);
      assert.equal(twinResult.ok, false, "the twin walk refuses (still red at CONFIRM_GREEN)");
      if (twinResult.ok) return;
      assert.equal(twinResult.failedAt, "CONFIRM_GREEN");

      // The escalated walk: identical inputs, but IMPLEMENT escalated. The spine still visits
      // CONFIRM_GREEN and observes the SAME red, so the ordinary refusal is unchanged — only the
      // escalation naming is new.
      const escalatedSpec = buildSpec({
        author: new FakeAuthor({
          IMPLEMENT: {
            ok: false,
            error: "leaf declares the test unsatisfiable",
            escalation: IMPLEMENT_ESCALATION,
          },
        }),
        executor: nodeEvalExecutor({ [testId]: "process.exit(1)" }),
        testId,
      });
      const escalatedResult = await proveUnit(escalatedSpec);

      assert.equal(escalatedResult.ok, false);
      if (escalatedResult.ok) return;
      assert.equal(escalatedResult.failedAt, "CONFIRM_GREEN");

      assert.ok(
        escalatedResult.reason.startsWith(twinResult.reason),
        `expected the escalated reason to start with the twin's reason byte for byte\n` +
          `  twin:      ${JSON.stringify(twinResult.reason)}\n` +
          `  escalated: ${JSON.stringify(escalatedResult.reason)}`,
      );
      const remainder = escalatedResult.reason.slice(twinResult.reason.length);
      assert.ok(
        remainder.length > 0,
        "a standing escalation must add text after every existing suffix, not repeat the twin's reason verbatim",
      );
      assert.ok(
        remainder.includes(IMPLEMENT_ESCALATION.kind),
        `expected the appended text to name the escalation's kind (${IMPLEMENT_ESCALATION.kind}); got ${JSON.stringify(remainder)}`,
      );
      assert.ok(
        remainder.includes(IMPLEMENT_ESCALATION.statement),
        `expected the appended text to quote the escalation's statement verbatim; got ${JSON.stringify(remainder)}`,
      );

      assert.ok(escalatedResult.escalation !== undefined, "the confirmed escalation still carries its record");
      assert.deepEqual(escalatedResult.escalation?.raised, IMPLEMENT_ESCALATION);
      assert.equal(
        escalatedResult.overruledEscalation,
        undefined,
        "a RED CONFIRM_GREEN confirms the escalation — it is never also recorded as overruled",
      );
    });

    test("an AUTHOR_TEST escalation's own reason names the kind and quotes the statement verbatim (and may keep the slice's error)", async () => {
      const testId = "T-author";
      const authoredError = "leaf declares the contract untestable";
      const spec = buildSpec({
        author: new FakeAuthor({
          AUTHOR_TEST: { ok: false, error: authoredError, escalation: AUTHOR_ESCALATION },
        }),
        executor: nodeEvalExecutor({ [testId]: "process.exit(1)" }),
        testId,
      });

      const result = await proveUnit(spec);

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failedAt, "AUTHOR_TEST");
      assert.ok(
        result.reason.includes(AUTHOR_ESCALATION.kind),
        `expected the reason to name the escalation's kind (${AUTHOR_ESCALATION.kind}); got ${JSON.stringify(result.reason)}`,
      );
      assert.ok(
        result.reason.includes(AUTHOR_ESCALATION.statement),
        `expected the reason to quote the escalation's statement verbatim; got ${JSON.stringify(result.reason)}`,
      );
      assert.ok(
        result.reason.includes(authoredError),
        "the slice's own error may still ride along in the reason",
      );

      assert.ok(result.escalation !== undefined, "the AUTHOR_TEST failure still carries an escalation record");
      assert.deepEqual(result.escalation?.raised, AUTHOR_ESCALATION);
    });

    test("a mismatched escalation phase's reason names both the phase of the slice that returned it and the phase the escalation declares (unchanged)", async () => {
      // A malformed shape a well-behaved leaf never produces: raised from AUTHOR_TEST but declaring
      // IMPLEMENT. The gate REJECTS it — no record of any kind — and the reason must still name both
      // phases, exactly as it already does.
      const mismatched: AuthoringEscalation = IMPLEMENT_ESCALATION;
      const spec = buildSpec({
        author: new FakeAuthor({
          AUTHOR_TEST: { ok: false, error: "malformed escalation", escalation: mismatched },
        }),
        executor: nodeEvalExecutor({}),
        testId: "T-mismatch",
      });

      const result = await proveUnit(spec);

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failedAt, "AUTHOR_TEST", "rejected at the phase of the slice that returned it");
      assert.ok(result.reason.includes("AUTHOR_TEST"), "names the phase of the slice that returned it");
      assert.ok(result.reason.includes(mismatched.phase), "names the phase the escalation declares");
      assert.equal(result.escalation, undefined, "a rejected/malformed escalation carries no record");
      assert.equal(result.overruledEscalation, undefined, "a rejected/malformed escalation carries no record");
    });

    test("an OVERRULED escalation that rides a later GATE refusal adds NOTHING — it matches its twin's reason exactly, byte for byte (unchanged)", async () => {
      const testId = "T-overruled";

      const twinSpec = buildSpec({
        author: new FakeAuthor({}),
        executor: sequentialExecutor(["process.exit(1)", "process.exit(0)"]),
        testId,
        tree: DIRTY,
      });
      const twinResult = await proveUnit(twinSpec);
      assert.equal(twinResult.ok, false);
      if (twinResult.ok) return;
      assert.equal(twinResult.failedAt, "GATE");

      const escalatedSpec = buildSpec({
        author: new FakeAuthor({
          IMPLEMENT: {
            ok: false,
            error: "leaf declares the test unsatisfiable",
            escalation: IMPLEMENT_ESCALATION,
          },
        }),
        executor: sequentialExecutor(["process.exit(1)", "process.exit(0)"]),
        testId,
        tree: DIRTY,
      });
      const escalatedResult = await proveUnit(escalatedSpec);

      assert.equal(escalatedResult.ok, false);
      if (escalatedResult.ok) return;
      assert.equal(escalatedResult.failedAt, "GATE");
      assert.equal(
        escalatedResult.reason,
        twinResult.reason,
        "an overruled escalation carried past CONFIRM_GREEN adds nothing to a later GATE refusal",
      );

      assert.ok(escalatedResult.overruledEscalation !== undefined, "the overrule still rides on the failure variant");
      assert.deepEqual(escalatedResult.overruledEscalation?.raised, IMPLEMENT_ESCALATION);
      assert.equal(
        escalatedResult.escalation,
        undefined,
        "an overruled walk never also carries the plain `escalation` key",
      );
    });
  },
);
