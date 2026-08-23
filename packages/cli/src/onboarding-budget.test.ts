import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyToolCall,
  measureOnboarding,
  budgetForAgentType,
  checkOnboardingBudget,
  formatOnboardingReport,
  AGENT_BUDGETS,
  DEFAULT_BUDGET_MS,
  REMEDIATION,
  type TraceToolCall,
} from "./onboarding-budget.js";

const call = (tool: string, target: string, latencyMs = 0): TraceToolCall => ({ tool, target, latencyMs });

test("classifyToolCall: a mutation / deliverable / delegation is the first real-work action", () => {
  for (const t of ["Edit", "Write", "NotebookEdit", "MultiEdit", "Artifact", "Agent", "Task"]) {
    const c = classifyToolCall(call(t, "packages/x.ts"));
    assert.equal(c.isWork, true, `${t} should be WORK`);
    assert.equal(c.phase, "WORK");
    assert.equal(c.costCenter, null);
  }
});

test("classifyToolCall: reads split SOURCE vs KNOWLEDGE by path", () => {
  assert.equal(classifyToolCall(call("Read", "packages/orchestrator/src/prove-it-gate.ts")).costCenter, "SOURCE");
  assert.equal(classifyToolCall(call("Grep", "packages/cli/src")).costCenter, "SOURCE");
  assert.equal(classifyToolCall(call("Glob", "**/*.ts")).costCenter, "SOURCE");
  // doc-ish paths are KNOWLEDGE even under packages/ (README) or docs/decisions (an ADR).
  assert.equal(classifyToolCall(call("Read", "CLAUDE.md")).costCenter, "KNOWLEDGE");
  assert.equal(classifyToolCall(call("Read", "AGENTS.md")).costCenter, "KNOWLEDGE");
  assert.equal(classifyToolCall(call("Read", "C:/Users/m/.codex/sessions/x.jsonl")).costCenter, "KNOWLEDGE");
  assert.equal(classifyToolCall(call("Read", "docs/decisions/0162-foo.md")).costCenter, "KNOWLEDGE");
  assert.equal(classifyToolCall(call("Read", "C:/Users/m/.claude/projects/x/memory/foo.md")).costCenter, "KNOWLEDGE");
  assert.equal(classifyToolCall(call("Read", "packages/cli/README.md")).costCenter, "KNOWLEDGE");
  // none of the reads is WORK.
  assert.equal(classifyToolCall(call("Read", "packages/x.ts")).isWork, false);
});

test("classifyToolCall: shell commands route to cost centers, build/test verbs are WORK", () => {
  assert.equal(classifyToolCall(call("Bash", "git fetch origin main")).costCenter, "ENV");
  assert.equal(classifyToolCall(call("Bash", "claude -p ok")).costCenter, "ENV");
  assert.equal(classifyToolCall(call("PowerShell", "pnpm db:status")).costCenter, "ENV");
  assert.equal(classifyToolCall(call("Bash", "pnpm install")).costCenter, "BOOT");
  assert.equal(classifyToolCall(call("Bash", "pnpm storytree noticeboard --pg")).costCenter, "CLI");
  assert.equal(classifyToolCall(call("Bash", "pnpm storytree library artifact foo")).costCenter, "CLI");
  // generic local shell reads are orientation overhead (KNOWLEDGE), never WORK.
  assert.equal(classifyToolCall(call("Bash", "git status")).costCenter, "KNOWLEDGE");
  assert.equal(classifyToolCall(call("Bash", "ls packages")).isWork, false);
  // build / test / commit are real work — they END the onboarding prefix.
  assert.equal(classifyToolCall(call("Bash", "pnpm storytree story build library --real")).isWork, true);
  assert.equal(classifyToolCall(call("Bash", "pnpm gate")).isWork, true);
  assert.equal(classifyToolCall(call("Bash", "pnpm -r test")).isWork, true);
  assert.equal(classifyToolCall(call("Bash", "git commit -m x")).isWork, true);
});

test("measureOnboarding: prefix-sum stops at the first real-work action", () => {
  const trace = [
    call("Read", "CLAUDE.md", 1000), // KNOWLEDGE
    call("Bash", "pnpm storytree noticeboard --pg", 3000), // CLI
    call("Bash", "git fetch origin main", 5000), // ENV
    call("Read", "packages/cli/src/commands.ts", 2000), // SOURCE
    call("Edit", "packages/cli/src/commands.ts", 500), // WORK — prefix ends BEFORE this
    call("Bash", "git status", 9999), // after work — ignored
  ];
  const m = measureOnboarding(trace);
  assert.equal(m.firstWorkIndex, 4);
  assert.equal(m.toolCallsBeforeWork, 4);
  assert.equal(m.onboardingMs, 1000 + 3000 + 5000 + 2000);
  assert.deepEqual(m.byCostCenter, { ENV: 5000, CLI: 3000, BOOT: 0, SOURCE: 2000, KNOWLEDGE: 1000 });
  assert.equal(m.dominantCostCenter, "ENV");
});

test("measureOnboarding: a session that never reaches work counts as all-onboarding", () => {
  const trace = [call("Read", "CLAUDE.md", 1000), call("Bash", "git fetch", 2000)];
  const m = measureOnboarding(trace);
  assert.equal(m.firstWorkIndex, -1);
  assert.equal(m.toolCallsBeforeWork, 2);
  assert.equal(m.onboardingMs, 3000);
});

test("measureOnboarding: only per-tool latency is summed (idle/thinking between calls excluded)", () => {
  // Each call carries only its own latency; there is no field for the gap between calls, so the
  // measurement can only ever sum active tool latency — inter-call thinking is excluded by design.
  const trace = [call("Read", "CLAUDE.md", 200), call("Read", "docs/decisions/0162-x.md", 300), call("Edit", "a.ts", 1)];
  assert.equal(measureOnboarding(trace).onboardingMs, 500);
});

test("budgetForAgentType: known types are tiered; unknown falls back to the default", () => {
  assert.equal(budgetForAgentType("Explore"), AGENT_BUDGETS.get("Explore"));
  assert.equal(budgetForAgentType("explorer"), AGENT_BUDGETS.get("Explore"));
  assert.equal(budgetForAgentType("planner"), AGENT_BUDGETS.get("Plan"));
  assert.ok(budgetForAgentType("Explore") < budgetForAgentType("session-orchestrator"), "analysis budget < orchestrator");
  assert.ok(budgetForAgentType("frontend-builder") > budgetForAgentType("Explore"), "build budget > analysis");
  assert.equal(budgetForAgentType("no-such-agent"), DEFAULT_BUDGET_MS);
});

test("checkOnboardingBudget: breach emits an ADR-0032 signal naming the dominant cost center", () => {
  const trace = [call("Bash", "git fetch origin main", 60_000), call("Edit", "a.ts", 1)];
  const report = checkOnboardingBudget({ trace, agentType: "Explore", sessionId: "sess-1" });
  assert.equal(report.breach, true);
  assert.ok(report.signal);
  assert.equal(report.signal?.kind, "onboarding-budget-breach");
  assert.equal(report.signal?.sessionId, "sess-1");
  assert.equal(report.signal?.dominantCostCenter, "ENV");
  assert.equal(report.signal?.budgetMs, budgetForAgentType("Explore"));
  assert.equal(report.signal?.overByMs, 60_000 - budgetForAgentType("Explore"));
  assert.equal(report.signal?.remediation, REMEDIATION.ENV);
});

test("checkOnboardingBudget: within budget → no breach, no signal", () => {
  const trace = [call("Read", "CLAUDE.md", 1000), call("Edit", "a.ts", 1)];
  const report = checkOnboardingBudget({ trace, agentType: "session-orchestrator", sessionId: "sess-2" });
  assert.equal(report.breach, false);
  assert.equal(report.signal, null);
});

test("formatOnboardingReport: renders the breach flag or the healthy line", () => {
  const breachReport = checkOnboardingBudget({
    trace: [call("Bash", "git fetch", 60_000), call("Edit", "a.ts", 1)],
    agentType: "Explore",
    sessionId: "s",
  });
  const breachText = formatOnboardingReport(breachReport);
  assert.match(breachText, /BUDGET BREACH/);
  assert.match(breachText, /not a halt/);

  const okReport = checkOnboardingBudget({
    trace: [call("Read", "CLAUDE.md", 100), call("Edit", "a.ts", 1)],
    agentType: "session-orchestrator",
    sessionId: "s",
  });
  assert.match(formatOnboardingReport(okReport), /within budget/);
});
