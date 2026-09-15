/**
 * `codex-envelope-reports-feedback-runs` (ADR-0570 D5/D6): the Codex leaf's build envelope must
 * report the feedback runs the spine's own record holds for it — or say plainly that it was armed
 * and called none — instead of always printing today's `none` line regardless of what the leaf
 * actually did.
 *
 * This pins `liveLeafLines`'s Codex branch in `node-build.ts`. Today that branch is unconditional:
 *
 *   "feedback:    none — the spine reruns every registered proof command out of band"
 *
 * That is only true for a Codex leaf given NO feedback tools. This file authors the three cases the
 * node spec names, each its own test, with every expected line written as a LITERAL string (this
 * package sits inside the mutation rung).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { CodexPhaseAuthor } from "@storytree/agent";

import { liveLeafLines } from "./node-build.js";
import { cannedLiveAuthor } from "./real-chain-fixture.js";

/**
 * A bare Codex leaf instance for the reporting fold — nothing is driven, no endpoint is opened.
 * `feedbackNames` seeds `feedbackToolNames` the same way real feedback commands would (via the
 * constructor's own `feedbackCommands` mapping), so "armed" is read from the leaf's own record
 * exactly as production does, never inferred from anything else about the fixture.
 */
function codexAuthor(feedbackNames: string[] = []): CodexPhaseAuthor {
  return new CodexPhaseAuthor({
    cwd: process.cwd(),
    writeGlobs: { AUTHOR_TEST: [], IMPLEMENT: [] },
    isWriteAllowed: () => false,
    feedbackCommands: feedbackNames.map((name) => ({
      name,
      description: `${name} description`,
      run: async () => {
        throw new Error(`codexAuthor fixture: ${name} must never actually run in this test`);
      },
    })),
  });
}

test("codex-envelope-reports-feedback-runs: non-empty feedbackRuns render exactly like the Claude branch's feedback line", () => {
  const codex = codexAuthor(["run_proof"]);
  codex.feedbackRuns.push(
    { phase: "AUTHOR_TEST", tool: "run_proof", code: 0 },
    { phase: "IMPLEMENT", tool: "run_proof", code: 1 },
  );

  // A genuine ClaudeAgentAuthor given the SAME feedbackRuns, so this test can assert the two
  // branches render BYTE-IDENTICAL text rather than merely each matching the same shape.
  const claude = cannedLiveAuthor([]);
  claude.feedbackRuns.push(
    { phase: "AUTHOR_TEST", tool: "run_proof", code: 0 },
    { phase: "IMPLEMENT", tool: "run_proof", code: 1 },
  );

  const EXPECTED_FEEDBACK_LINE =
    "feedback:    2 bounded run(s) — AUTHOR_TEST:run_proof=green, IMPLEMENT:run_proof=exit 1 " +
    "(feedback only; the spine's own observations decided)";

  const codexLines = liveLeafLines(codex);
  const claudeLines = liveLeafLines(claude);

  assert.equal(codexLines[codexLines.length - 1], EXPECTED_FEEDBACK_LINE);
  assert.equal(claudeLines[claudeLines.length - 1], EXPECTED_FEEDBACK_LINE);
  assert.equal(codexLines[codexLines.length - 1], claudeLines[claudeLines.length - 1]);
});

test("codex-envelope-reports-feedback-runs: armed with feedback tools but no calls names the armed tools instead of the none line", () => {
  const codex = codexAuthor(["run_proof", "run_typecheck"]);
  // feedbackRuns stays empty: the leaf was armed and called none.

  assert.deepEqual(liveLeafLines(codex), [
    "leaf:        Codex CLI / ChatGPT subscription (no slices ran)",
    "cost:        not metered — ChatGPT subscription quota (no API/list-price USD asserted)",
    "scope walls: no write refusals",
    "feedback:    0 bounded runs — armed with run_proof, run_typecheck; the leaf called none " +
      "(the spine's own observations decided)",
  ]);
});

test("codex-envelope-reports-feedback-runs: a Codex leaf given no feedback tools keeps today's none line", () => {
  const codex = codexAuthor();

  assert.deepEqual(liveLeafLines(codex), [
    "leaf:        Codex CLI / ChatGPT subscription (no slices ran)",
    "cost:        not metered — ChatGPT subscription quota (no API/list-price USD asserted)",
    "scope walls: no write refusals",
    "feedback:    none — the spine reruns every registered proof command out of band",
  ]);
});
