import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import {
  ClaudeAgentAuthor,
  composeLeafSystemPrompt,
  decideWrite,
  executeFeedback,
  formatFeedbackOutput,
  leafSystemPrompt,
} from "./sdk-author.js";
import type { FeedbackCommand, SdkFeedbackRun, SdkQueryFn } from "./sdk-author.js";

/**
 * OFFLINE tests for the SDK leaf (ADR-0030): the scope decision is pure code, and the query seam
 * is injectable, so every fail-closed property is provable without spawning the SDK (zero cost).
 * The live wiring is exercised by `storytree node build <id> --live` (the Phase-D smoke).
 */

// Platform-agnostic absolute workspace (resolves under the current drive on Windows, / on POSIX).
const CWD = path.resolve("/work/space");

const testOnlyInAuthor = (phase: string, rel: string): boolean =>
  phase === "AUTHOR_TEST" ? rel.endsWith(".test.cjs") : rel === "impl.cjs";

// ── decideWrite: the pure scope decision the PreToolUse hook applies ─────────

test("decideWrite allows an in-scope relative write", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: "unit.test.cjs" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.deepEqual(d, { allow: true, relPath: "unit.test.cjs" });
});

test("decideWrite allows an in-scope ABSOLUTE write (relativized against cwd)", () => {
  const d = decideWrite({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: path.join(CWD, "impl.cjs") },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.deepEqual(d, { allow: true, relPath: "impl.cjs" });
});

test("decideWrite denies the out-of-phase write (impl during AUTHOR_TEST)", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: "impl.cjs" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, false);
  if (d.allow) return;
  assert.match(d.reason, /phase scope/);
  assert.equal(d.relPath, "impl.cjs");
});

test("decideWrite denies the test write during IMPLEMENT (the test author is not the code author)", () => {
  const d = decideWrite({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "Edit",
    toolInput: { file_path: "unit.test.cjs" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, false);
});

test("decideWrite denies a path that escapes the workspace", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: "../outside.test.cjs" },
    isWriteAllowed: () => true,
  });
  assert.equal(d.allow, false);
  if (d.allow) return;
  assert.match(d.reason, /outside the workspace/);
});

test("decideWrite fails CLOSED on a write call with no readable file_path", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { oops: true },
    isWriteAllowed: () => true,
  });
  assert.equal(d.allow, false);
  if (d.allow) return;
  assert.match(d.reason, /fail-closed/);
});

// ── ClaudeAgentAuthor result mapping over an injected (offline) query seam ───

function scripted(messages: unknown[]): SdkQueryFn {
  return async function* () {
    for (const m of messages) {
      yield m;
    }
  };
}

test("author => ok on an SDK success result, with cost/turns recorded", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: scripted([
      { type: "assistant", text: "writing..." },
      { type: "result", subtype: "success", is_error: false, num_turns: 3, total_cost_usd: 0.0421 },
    ]),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.deepEqual(r, { ok: true });
  assert.equal(author.runs.length, 1);
  assert.equal(author.runs[0]?.turns, 3);
  assert.equal(author.totalCostUsd, 0.0421);
});

test("author => fail-closed on an SDK error result (max turns / budget)", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: scripted([
      {
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        num_turns: 9,
        total_cost_usd: 1.01,
        errors: ["budget exceeded"],
      },
    ]),
  });

  const r = await author.author("IMPLEMENT", "implement it");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /error_max_budget_usd/);
  assert.match(r.error, /budget exceeded/);
});

test("author => fail-closed when the stream ends with NO result message", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: scripted([{ type: "assistant", text: "..." }]),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /without a result message/);
});

// ── Feedback tools (option A): bounded runs, output as feedback, never the verdict ──

const okCommand = (calls: { count: number }): FeedbackCommand => ({
  name: "run_proof",
  description: "run the registered proof command",
  run: async () => {
    calls.count += 1;
    return { code: 1, stdout: "1 failing", stderr: "AssertionError: expected 5" };
  },
});

test("executeFeedback runs the command, records the run, and returns formatted output", async () => {
  const calls = { count: 0 };
  const recorded: SdkFeedbackRun[] = [];
  const r = await executeFeedback({
    phase: "IMPLEMENT",
    command: okCommand(calls),
    used: 0,
    max: 5,
    record: (run) => recorded.push(run),
  });
  assert.equal(r.isError, false);
  assert.equal(calls.count, 1);
  assert.match(r.text, /exit 1/);
  assert.match(r.text, /feedback only/i);
  assert.match(r.text, /AssertionError/);
  assert.deepEqual(recorded, [{ phase: "IMPLEMENT", tool: "run_proof", code: 1 }]);
});

test("executeFeedback refuses past the per-slice budget WITHOUT spawning", async () => {
  const calls = { count: 0 };
  const r = await executeFeedback({
    phase: "IMPLEMENT",
    command: okCommand(calls),
    used: 5,
    max: 5,
    record: () => assert.fail("a budget-exhausted refusal must not record a run"),
  });
  assert.equal(r.isError, true);
  assert.equal(calls.count, 0, "the command must not run past the budget");
  assert.match(r.text, /budget exhausted/);
  assert.match(r.text, /spine observes the official result itself/);
});

test("executeFeedback returns a spawn failure as an error result (never throws into the SDK)", async () => {
  const recorded: SdkFeedbackRun[] = [];
  const r = await executeFeedback({
    phase: "AUTHOR_TEST",
    command: {
      name: "run_proof",
      description: "x",
      run: async () => {
        throw new Error("ENOENT: no such file");
      },
    },
    used: 0,
    max: 5,
    record: (run) => recorded.push(run),
  });
  assert.equal(r.isError, true);
  assert.match(r.text, /failed to run: ENOENT/);
  // The failed attempt still consumed budget (no free retries of a broken spawn).
  assert.deepEqual(recorded, [{ phase: "AUTHOR_TEST", tool: "run_proof", code: null }]);
});

test("formatFeedbackOutput tail-truncates long streams (failures print last)", () => {
  const out = formatFeedbackOutput(
    { code: 1, stdout: `${"x".repeat(100)}TAIL`, stderr: "" },
    50,
  );
  assert.match(out, /chars truncated/);
  assert.match(out, /TAIL/);
  assert.doesNotMatch(out, /x{60}/);
  assert.match(out, /\(empty\)/); // the empty stderr stream
});

test("leafSystemPrompt: the blind leaf cannot run tests; the feedback leaf is told feedback ≠ verdict", () => {
  assert.match(leafSystemPrompt(false), /cannot run tests or shell commands/);
  assert.match(leafSystemPrompt(true), /mcp__spine__/);
  assert.match(leafSystemPrompt(true), /FEEDBACK ONLY/);
  assert.match(leafSystemPrompt(true), /stop and say so/);
});

test("composeLeafSystemPrompt: the INJECTED agent body leads, the runtime closing follows", () => {
  const composed = composeLeafSystemPrompt("RED-BUILDER AGENT BODY", true);
  // the library agent's body is the head of the prompt, not a generic preamble
  assert.match(composed, /^RED-BUILDER AGENT BODY/);
  // the runtime mechanic is still composed on (feedback ≠ verdict)
  assert.match(composed, /FEEDBACK ONLY/);
  // the generic base is GONE — the injected body replaces it
  assert.doesNotMatch(composed, /You are the leaf agent inside storytree/);
});

// ── ADR-0051 §4: the rendered library agent IS the SDK leaf's per-phase system prompt ───────────

test("author INJECTS the per-phase agent prompt as the SDK systemPrompt (red-builder/green-builder)", async () => {
  let captured: string | undefined;
  const make = (): ClaudeAgentAuthor =>
    new ClaudeAgentAuthor({
      cwd: CWD,
      isWriteAllowed: () => true,
      phasePrompts: {
        AUTHOR_TEST: "RED-BUILDER body: write the one failing test, then stop.",
        IMPLEMENT: "GREEN-BUILDER body: minimum source to pass, then stop.",
      },
      queryFn: (args) => {
        captured = String((args.options as { systemPrompt?: unknown }).systemPrompt);
        return scripted([
          { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
        ])(args);
      },
    });

  await make().author("AUTHOR_TEST", "p");
  assert.match(captured ?? "", /RED-BUILDER body: write the one failing test/);
  // the generic base is NOT used when an agent is injected
  assert.doesNotMatch(captured ?? "", /You are the leaf agent inside storytree/);

  captured = undefined;
  await make().author("IMPLEMENT", "p");
  assert.match(captured ?? "", /GREEN-BUILDER body: minimum source to pass/);
});

test("a LIVE leaf (real SDK, no injected prompt) FAILS CLOSED — never a silent generic fallback (anti-blindside)", async () => {
  // No queryFn → the REAL Agent SDK path; no phasePrompts → the injection is missing.
  const author = new ClaudeAgentAuthor({ cwd: CWD, isWriteAllowed: () => true });
  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /red-builder/);
  assert.match(r.error, /no silent fallback|MUST run the Library agent/);
  // Critically, the SDK was NEVER invoked — author() returned before the query loop.
  assert.equal(author.runs.length, 0);
});

test("the green phase fail-closed message names the green-builder agent", async () => {
  const author = new ClaudeAgentAuthor({ cwd: CWD, isWriteAllowed: () => true });
  const r = await author.author("IMPLEMENT", "implement it");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /green-builder/);
});

test("author wires feedback commands as an in-process MCP server + allowlisted tools", async () => {
  let captured: { mcpServers?: Record<string, unknown>; allowedTools?: string[]; systemPrompt?: unknown } | undefined;
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    feedbackCommands: [
      { name: "run_proof", description: "d", run: async () => ({ code: 0, stdout: "", stderr: "" }) },
      { name: "run_typecheck", description: "d", run: async () => ({ code: 0, stdout: "", stderr: "" }) },
    ],
    queryFn: (args) => {
      captured = args.options as typeof captured;
      return scripted([
        { type: "result", subtype: "success", is_error: false, num_turns: 2, total_cost_usd: 0.01 },
      ])(args);
    },
  });
  assert.deepEqual(author.feedbackToolNames, ["mcp__spine__run_proof", "mcp__spine__run_typecheck"]);

  const r = await author.author("IMPLEMENT", "implement it");
  assert.deepEqual(r, { ok: true });
  assert.ok(captured !== undefined);
  assert.ok(captured.mcpServers !== undefined && "spine" in captured.mcpServers);
  assert.ok(captured.allowedTools?.includes("mcp__spine__run_proof"));
  assert.ok(captured.allowedTools?.includes("mcp__spine__run_typecheck"));
  assert.ok(captured.allowedTools?.includes("Read"));
  assert.match(String(captured.systemPrompt), /FEEDBACK ONLY/);
});

test("author WITHOUT feedback commands stays the blind leaf (no MCP server, original prompt)", async () => {
  let captured: { mcpServers?: Record<string, unknown>; allowedTools?: string[]; systemPrompt?: unknown } | undefined;
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: (args) => {
      captured = args.options as typeof captured;
      return scripted([
        { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0.01 },
      ])(args);
    },
  });
  assert.deepEqual(author.feedbackToolNames, []);

  await author.author("AUTHOR_TEST", "author the failing test");
  assert.ok(captured !== undefined);
  assert.equal(captured.mcpServers, undefined);
  assert.equal(captured.allowedTools?.some((t) => t.startsWith("mcp__")), false);
  assert.match(String(captured.systemPrompt), /cannot run tests or shell commands/);
});

test("author => fail-closed when the query itself throws (spawn/auth failure)", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: () => {
      throw new Error("ENOENT: claude binary not found");
    },
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /SDK session failed/);
});
