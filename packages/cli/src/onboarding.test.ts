import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";
import { extractToolTarget, parseTranscript } from "./onboarding-transcript.js";
import { measureOnboarding } from "./onboarding-budget.js";
import { onboardingCommand } from "./onboarding.js";

// ---- transcript adapter ----------------------------------------------------

function toolUse(id: string, name: string, input: unknown, ts: string): string {
  return JSON.stringify({ type: "assistant", timestamp: ts, message: { content: [{ type: "tool_use", id, name, input }] } });
}
function toolResult(forId: string, ts: string): string {
  return JSON.stringify({ type: "user", timestamp: ts, message: { content: [{ type: "tool_result", tool_use_id: forId, is_error: false }] } });
}
function thinking(ts: string): string {
  return JSON.stringify({ type: "assistant", timestamp: ts, message: { content: [{ type: "thinking", thinking: "…" }] } });
}
function codexItem(payload: Record<string, unknown>, ts: string): string {
  return JSON.stringify({ type: "response_item", timestamp: ts, payload });
}

test("extractToolTarget: pulls the classification hint per tool", () => {
  assert.equal(extractToolTarget("Read", { file_path: "a.ts" }), "a.ts");
  assert.equal(extractToolTarget("Edit", { file_path: "b.ts" }), "b.ts");
  assert.equal(extractToolTarget("Bash", { command: "git fetch" }), "git fetch");
  assert.equal(extractToolTarget("Grep", { path: "packages", pattern: "foo" }), "packages");
  assert.equal(extractToolTarget("Grep", { pattern: "foo" }), "foo");
  assert.equal(extractToolTarget("Agent", { subagent_type: "Explore" }), "Explore");
  assert.equal(extractToolTarget("Mystery", {}), "");
});

test("parseTranscript: pairs tool_use/result by id, computes latency, skips malformed lines", () => {
  const jsonl = [
    toolUse("tu1", "Read", { file_path: "CLAUDE.md" }, "2026-07-06T00:00:00.000Z"),
    toolResult("tu1", "2026-07-06T00:00:01.000Z"), // 1000ms
    thinking("2026-07-06T00:00:11.000Z"), // a 10s thinking gap before the next tool_use
    toolUse("tu2", "Bash", { command: "git fetch origin main" }, "2026-07-06T00:00:11.000Z"),
    toolResult("tu2", "2026-07-06T00:00:16.000Z"), // 5000ms
    toolUse("tu3", "Edit", { file_path: "packages/x.ts" }, "2026-07-06T00:00:20.000Z"),
    toolResult("tu3", "2026-07-06T00:00:20.500Z"), // 500ms
    "{ this line does not parse",
  ].join("\n");

  const parsed = parseTranscript(jsonl, { sessionId: "test-sess" });
  assert.equal(parsed.sessionId, "test-sess");
  assert.equal(parsed.calls.length, 3);
  assert.deepEqual(parsed.calls.map((c) => c.tool), ["Read", "Bash", "Edit"]);
  assert.deepEqual(parsed.calls.map((c) => c.latencyMs), [1000, 5000, 500]);
  assert.equal(parsed.calls[1]?.target, "git fetch origin main");
});

test("parseTranscript + measureOnboarding: the 10s thinking gap is NOT counted as onboarding", () => {
  const jsonl = [
    toolUse("tu1", "Read", { file_path: "CLAUDE.md" }, "2026-07-06T00:00:00.000Z"),
    toolResult("tu1", "2026-07-06T00:00:01.000Z"), // KNOWLEDGE 1000
    thinking("2026-07-06T00:00:11.000Z"), // +10s wall-clock, but only per-tool latency counts
    toolUse("tu2", "Bash", { command: "git fetch origin main" }, "2026-07-06T00:00:11.000Z"),
    toolResult("tu2", "2026-07-06T00:00:16.000Z"), // ENV 5000
    toolUse("tu3", "Edit", { file_path: "packages/x.ts" }, "2026-07-06T00:00:20.000Z"),
    toolResult("tu3", "2026-07-06T00:00:20.500Z"), // WORK — ends the prefix
  ].join("\n");
  // Wall-clock is ~20.5s, but active onboarding is only 1000 + 5000 = 6000ms.
  assert.equal(measureOnboarding(parseTranscript(jsonl).calls).onboardingMs, 6000);
});

test("parseTranscript: an unpaired trailing tool_use gets latency 0, never throws", () => {
  const jsonl = toolUse("tu1", "Read", { file_path: "CLAUDE.md" }, "2026-07-06T00:00:00.000Z");
  const parsed = parseTranscript(jsonl);
  assert.equal(parsed.calls.length, 1);
  assert.equal(parsed.calls[0]?.latencyMs, 0);
  assert.equal(parsed.sessionId, "unknown");
});

test("parseTranscript: auto-detects Codex rollout calls and normalizes shell/delegation latency", () => {
  const jsonl = [
    JSON.stringify({
      type: "session_meta",
      timestamp: "2026-08-03T00:00:00.000Z",
      payload: { session_id: "codex-sess" },
    }),
    codexItem({
      type: "custom_tool_call",
      call_id: "c1",
      name: "exec",
      input: 'const r = await tools.shell_command({ command: "Get-Content AGENTS.md" });',
    }, "2026-08-03T00:00:01.000Z"),
    codexItem({ type: "custom_tool_call_output", call_id: "c1" }, "2026-08-03T00:00:02.500Z"),
    codexItem({
      type: "function_call",
      call_id: "c2",
      name: "spawn_agent",
      arguments: JSON.stringify({ task_name: "worker" }),
    }, "2026-08-03T00:00:03.000Z"),
    codexItem({ type: "function_call_output", call_id: "c2" }, "2026-08-03T00:00:03.100Z"),
  ].join("\n");

  const parsed = parseTranscript(jsonl);
  assert.equal(parsed.harness, "codex");
  assert.equal(parsed.sessionId, "codex-sess");
  assert.deepEqual(parsed.calls.map((c) => c.tool), ["PowerShell", "Agent"]);
  assert.deepEqual(parsed.calls.map((c) => c.latencyMs), [1500, 100]);
  assert.equal(measureOnboarding(parsed.calls).onboardingMs, 1500);
});

test("parseTranscript: Codex apply_patch is the first real-work action", () => {
  const jsonl = [
    codexItem({
      type: "custom_tool_call",
      call_id: "c1",
      name: "exec",
      input: 'await tools.apply_patch("*** Begin Patch")',
    }, "2026-08-03T00:00:01.000Z"),
    codexItem({ type: "custom_tool_call_output", call_id: "c1" }, "2026-08-03T00:00:02.000Z"),
  ].join("\n");
  const parsed = parseTranscript(jsonl);
  assert.equal(parsed.calls[0]?.tool, "Edit");
  assert.equal(measureOnboarding(parsed.calls).firstWorkIndex, 0);
});

// ---- CLI command -----------------------------------------------------------

/** A transcript whose active onboarding (one 60s ENV probe) breaches the low Explore budget. */
const BREACHING_JSONL = [
  toolUse("a", "Bash", { command: "git fetch origin main" }, "2026-07-06T00:00:00.000Z"),
  toolResult("a", "2026-07-06T00:01:00.000Z"), // 60s ENV
  toolUse("b", "Edit", { file_path: "packages/x.ts" }, "2026-07-06T00:01:01.000Z"),
  toolResult("b", "2026-07-06T00:01:01.100Z"),
].join("\n");

test("onboardingCommand: budgets prints the SLA table", () => {
  const env = onboardingCommand(["budgets"]);
  assert.equal(env.ok, true);
  assert.match(env.body, /Explore/);
  assert.match(env.body, /session-orchestrator/);
});

test("onboardingCommand: refuses an unknown transcript shape instead of reporting a false zero", () => {
  const env = onboardingCommand(
    ["report", "/fake.jsonl"],
    {},
    { readFile: () => JSON.stringify({ type: "something-new" }) },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /unsupported onboarding transcript shape/);
});

test("onboardingCommand: report on a breaching transcript flags the breach + routes remediation", () => {
  const env = onboardingCommand(["report", "/fake.jsonl"], { agentType: "Explore" }, { readFile: () => BREACHING_JSONL });
  assert.equal(env.ok, true, "a breach is surfaced, not a command failure");
  assert.match(env.body, /BUDGET BREACH/);
  assert.ok(env.next?.some((n) => n.includes("0162")), "next routes to the ADR-0162 remediation charter");
});

test("onboardingCommand: report within budget shows the healthy line", () => {
  const smallJsonl = [
    toolUse("a", "Read", { file_path: "CLAUDE.md" }, "2026-07-06T00:00:00.000Z"),
    toolResult("a", "2026-07-06T00:00:00.500Z"),
    toolUse("b", "Edit", { file_path: "packages/x.ts" }, "2026-07-06T00:00:01.000Z"),
    toolResult("b", "2026-07-06T00:00:01.100Z"),
  ].join("\n");
  const env = onboardingCommand(["report", "/fake.jsonl"], { agentType: "session-orchestrator" }, { readFile: () => smallJsonl });
  assert.equal(env.ok, true);
  assert.match(env.body, /within budget/);
});

test("onboardingCommand: missing path, unreadable file, and bad sub all fail gracefully", () => {
  assert.equal(onboardingCommand(["report"]).ok, false);
  assert.match(onboardingCommand(["report"]).body, /needs a transcript path/);

  const unreadable = onboardingCommand(["report", "/nope.jsonl"], {}, {
    readFile: () => {
      throw new Error("ENOENT");
    },
  });
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.body, /could not read transcript/);

  assert.equal(onboardingCommand(["bogus"]).ok, false);
  assert.match(onboardingCommand(["bogus"]).body, /unknown onboarding command/);

  assert.equal(onboardingCommand([]).ok, true); // bare → help
});

test("run: the onboarding area is wired end-to-end (parseArgs --agent-type + dispatch)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "onboarding-test-"));
  const file = path.join(dir, "sess.jsonl");
  writeFileSync(file, BREACHING_JSONL, "utf8");

  const env = await run(["onboarding", "report", file, "--agent-type", "Explore"], { store: new InMemoryStore() });
  assert.equal(env.ok, true);
  assert.match(env.body, /BUDGET BREACH/);

  const budgets = await run(["onboarding", "budgets"], { store: new InMemoryStore() });
  assert.equal(budgets.ok, true);
  assert.match(budgets.body, /session-orchestrator/);
});
