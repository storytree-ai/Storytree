/**
 * The per-agent-type onboarding-budget monitor (ADR-0162 Phase 2 — the terminal deliverable of the
 * onboarding-cost arc).
 *
 * ONBOARDING = the orientation a session does before its first real-work action (booting the
 * worktree, probing the environment, pulling knowledge, reading source). ADR-0162 Phase 1 optimized
 * the three verified cost centers (ENV / CLI / BOOT); this module OWNS keeping the improved baseline
 * from regressing silently — it MEASURES a session's active onboarding cost, COMPARES it against a
 * per-agent-type budget (SLA), and on breach EMITS a signal that names the dominant cost center and
 * routes remediation via the ADR-0032 signal → Library graduation loop.
 *
 * It is a POST-SESSION / OBSERVABILITY mechanism, NOT an onboarding-time gate (ADR-0162 §"Why not a
 * gate"): by the time you know a session onboarded slowly its work is already running and valuable —
 * you cannot refuse it. So the control FLAGS, never HALTS. Nothing here runs on a session's hot path.
 *
 * This file is PURE (no I/O): it operates on an abstract {@link TraceToolCall}[] so the whole
 * measure → budget → breach-signal chain is deterministic and unit-tested offline. The Claude Code
 * transcript adapter (`onboarding-transcript.ts`) maps a real `.jsonl` into that trace; the CLI
 * command (`onboarding.ts`) wires the two behind `storytree onboarding`.
 */

/** A single tool call in a session trace, reduced to what the budget monitor needs. */
export interface TraceToolCall {
  /** The tool name as it appears in the transcript, e.g. "Read", "Bash", "Edit", "Agent". */
  tool: string;
  /**
   * A classification hint derived from the call's input: for Read/Edit/Write the target path; for
   * Bash/PowerShell the command string; for Agent/Task the subagent type; "" when the tool carries
   * no path/command.
   */
  target: string;
  /**
   * Milliseconds between the `tool_use` and its matching `tool_result` (the baseline's per-tool
   * latency metric, ADR-0162 Context). Because it is per-tool, the wall-clock gaps BETWEEN calls
   * (model thinking / operator idle) are never summed — "active onboarding, idle/thinking excluded".
   */
  latencyMs: number;
}

/**
 * The onboarding phases from the ADR-0162 baseline. `WORK` is not an onboarding phase — it is the
 * marker that onboarding has ENDED (the first real-work action); everything at/after it is the
 * session's actual work and is excluded from the onboarding prefix.
 */
export type OnboardingPhase = "ENV" | "CLI" | "BOOT" | "SOURCE" | "KNOWLEDGE" | "WORK";

/**
 * A cost center a non-WORK (onboarding) call is charged to. The first three (ENV / CLI / BOOT) are
 * the Phase-1 targets a breach routes remediation to. SOURCE and KNOWLEDGE reads are largely
 * *correct* just-in-time behaviour (ADR-0162 item 4 closed WON'T-DO) — a breach dominated by them
 * means the agent-type's BUDGET is too tight, not that a cost center regressed. KNOWLEDGE doubles as
 * the catch-all for unclassified orientation overhead.
 */
export type CostCenter = "ENV" | "CLI" | "BOOT" | "SOURCE" | "KNOWLEDGE";

/** The classification of one tool call. */
export interface ToolCallClass {
  phase: OnboardingPhase;
  /** true iff this call is the/an actual-work action (Edit, build, commit, delegate, …). */
  isWork: boolean;
  /** Which cost center the call is charged to; null for a WORK call. */
  costCenter: CostCenter | null;
}

/** The five cost centers in remediation-priority order (fixable-first; SOURCE last — it is correct). */
export const COST_CENTERS: readonly CostCenter[] = ["ENV", "CLI", "BOOT", "KNOWLEDGE", "SOURCE"];

const WORK_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit", "Artifact", "Agent", "Task"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const READ_TOOLS = new Set(["Read", "Grep", "Glob", "LS"]);

/** Regexes over a shell command string, checked in priority order. */
const WORK_CMD =
  /\b(pnpm\s+gate|pnpm\s+-r\s+(test|typecheck|build)|pnpm\s+--filter\s+\S+\s+(test|build)|git\s+(commit|push|merge|rebase|cherry-pick)|gh\s+pr\s+create|(story|node)\s+build|build\s+(story|node|gate))\b|--real\b|--live\b/i;
const BOOT_CMD = /\b(pnpm\s+install|pnpm\s+i\b|corepack|provision-worktree)\b/i;
const ENV_CMD =
  /\b(git\s+fetch|git\s+pull|git\s+clone|db:status|db:up|db:down|gcloud|cloud\s+sql|claude\s+-p|select\s+1|print-access-token)\b/i;
const CLI_CMD = /\b(storytree|launch\.mjs|packages\/cli\/src\/main\.ts)\b/i;

/** A path that is orientation KNOWLEDGE rather than editable SOURCE. */
const KNOWLEDGE_PATH =
  /(^|[\\/])(docs[\\/]|(?:CLAUDE|AGENTS)\.md|README|\.(?:claude|codex)[\\/]|memory[\\/]|knowledge\.json|open-questions\.md|stories[\\/])|\.(md|mdx)$/i;
/** A path that is editable engine SOURCE. */
const SOURCE_PATH = /(^|[\\/])(packages|apps|forest-world|web|legacy|infra|scripts)[\\/]|\.(ts|tsx|mjs|cjs|js|jsx|sql|tf)$/i;

/**
 * PURE: classify one tool call into an onboarding phase (or WORK). The heart of the measurement —
 * fully unit-tested. Precedence for shell commands is WORK → BOOT → ENV → CLI → (other); for reads it
 * is SOURCE-vs-KNOWLEDGE by target path.
 */
export function classifyToolCall(call: TraceToolCall): ToolCallClass {
  const { tool, target } = call;

  if (SHELL_TOOLS.has(tool)) {
    const cmd = target;
    if (WORK_CMD.test(cmd)) return { phase: "WORK", isWork: true, costCenter: null };
    if (BOOT_CMD.test(cmd)) return { phase: "BOOT", isWork: false, costCenter: "BOOT" };
    if (ENV_CMD.test(cmd)) return { phase: "ENV", isWork: false, costCenter: "ENV" };
    if (CLI_CMD.test(cmd)) return { phase: "CLI", isWork: false, costCenter: "CLI" };
    // A generic local shell read (ls/cat/git status/echo) is orientation overhead.
    return { phase: "KNOWLEDGE", isWork: false, costCenter: "KNOWLEDGE" };
  }

  // A mutation / delegation / deliverable is the first real-work action.
  if (WORK_TOOLS.has(tool)) return { phase: "WORK", isWork: true, costCenter: null };

  if (READ_TOOLS.has(tool)) {
    // Orientation doc/ADR/memory reads are KNOWLEDGE; engine reads are SOURCE. A doc-ish path wins
    // (an ADR under docs/decisions/*.md is KNOWLEDGE, not SOURCE).
    if (KNOWLEDGE_PATH.test(target)) return { phase: "KNOWLEDGE", isWork: false, costCenter: "KNOWLEDGE" };
    if (SOURCE_PATH.test(target)) return { phase: "SOURCE", isWork: false, costCenter: "SOURCE" };
    return { phase: "KNOWLEDGE", isWork: false, costCenter: "KNOWLEDGE" };
  }

  // Any other tool (Skill, an MCP read, a session-management call, …) is orientation overhead, not
  // a real-work action — it never ends the onboarding prefix.
  return { phase: "KNOWLEDGE", isWork: false, costCenter: "KNOWLEDGE" };
}

/** The outcome of measuring one session's onboarding prefix. */
export interface OnboardingMeasurement {
  /** Σ latency of every call BEFORE the first real-work action (the active-onboarding cost). */
  onboardingMs: number;
  /** Index of the first WORK call, or -1 when the whole session is onboarding (no work found). */
  firstWorkIndex: number;
  /** How many tool calls happened before the first real-work action. */
  toolCallsBeforeWork: number;
  /** Onboarding ms attributed to each cost center within the prefix. */
  byCostCenter: Record<CostCenter, number>;
  /** The cost center with the most onboarding ms (fixable-first tie-break), or null if the prefix is empty. */
  dominantCostCenter: CostCenter | null;
}

function emptyByCostCenter() {
  return { ENV: 0, CLI: 0, BOOT: 0, SOURCE: 0, KNOWLEDGE: 0 } satisfies Record<CostCenter, number>;
}

/**
 * PURE: measure the onboarding prefix of a trace — the summed per-tool latency up to (excluding) the
 * first real-work action, broken down by cost center. Idle/thinking is excluded by construction
 * (latency is per-tool, so inter-call gaps are never counted).
 */
export function measureOnboarding(trace: readonly TraceToolCall[]): OnboardingMeasurement {
  let firstWorkIndex = -1;
  for (let i = 0; i < trace.length; i++) {
    const call = trace[i];
    if (call !== undefined && classifyToolCall(call).isWork) {
      firstWorkIndex = i;
      break;
    }
  }

  const prefixEnd = firstWorkIndex === -1 ? trace.length : firstWorkIndex;
  const byCostCenter = emptyByCostCenter();
  let onboardingMs = 0;
  for (let i = 0; i < prefixEnd; i++) {
    const call = trace[i];
    if (call === undefined) continue;
    const cls = classifyToolCall(call);
    const ms = Number.isFinite(call.latencyMs) && call.latencyMs > 0 ? call.latencyMs : 0;
    onboardingMs += ms;
    if (cls.costCenter !== null) byCostCenter[cls.costCenter] += ms;
  }

  let dominantCostCenter: CostCenter | null = null;
  let best = -1;
  for (const center of COST_CENTERS) {
    if (byCostCenter[center] > best) {
      best = byCostCenter[center];
      dominantCostCenter = center;
    }
  }
  // An empty prefix (or an all-zero-latency prefix) has no meaningful dominant center.
  if (onboardingMs === 0) dominantCostCenter = null;

  return { onboardingMs, firstWorkIndex, toolCallsBeforeWork: prefixEnd, byCostCenter, dominantCostCenter };
}

/**
 * Per-agent-type onboarding budgets in milliseconds (the SLA). PROVISIONAL and tuned against the
 * post-Phase-1 baseline (ADR-0162 §Consequences: the first budgets are provisional, tuned against
 * observed distributions — that is expected, not an owner fork). Two tiers plus the interactive loop:
 *
 * - Analysis / read-mostly agents reach real work fast (their reads ARE their work) → a LOW budget.
 * - Build / verify agents legitimately probe ENV + orient on SOURCE before their first edit → HIGHER.
 * - The interactive session-orchestrator orients on all three surfaces + the notice board + its
 *   harness-native root guidance → the highest budget.
 *
 * The baseline (pre-Phase-1) was ~107 s p50 / ~478 s p90 of active onboarding; these budgets guard
 * the IMPROVED baseline, so a well-behaved session sits comfortably under its type's budget.
 */
export const AGENT_BUDGETS: Readonly<Record<string, number>> = {
  // Low tier — analysis / read-mostly.
  Explore: 45_000,
  explorer: 45_000,
  Plan: 60_000,
  planner: 60_000,
  "corpus-investigator": 45_000,
  "friction-analyst": 60_000,
  "claude-code-guide": 45_000,
  "statusline-setup": 30_000,
  // Higher tier — build / verify (ENV + SOURCE).
  "frontend-builder": 120_000,
  "glue-worker": 90_000,
  "story-author": 90_000,
  "guidance-curator": 90_000,
  "librarian-curator": 90_000,
  "graduation-synthesist": 90_000,
  "general-purpose": 120_000,
  claude: 120_000,
  // The interactive outer loop.
  "session-orchestrator": 150_000,
};

/** Fallback budget for an agent-type not in {@link AGENT_BUDGETS} (ms). */
export const DEFAULT_BUDGET_MS = 120_000;

/** PURE: the budget for an agent-type, or {@link DEFAULT_BUDGET_MS} if unknown. */
export function budgetForAgentType(agentType: string): number {
  return AGENT_BUDGETS[agentType] ?? DEFAULT_BUDGET_MS;
}

/**
 * Where remediation lives for a breach dominated by each cost center — the ADR-0032 routing target.
 * ENV / CLI / BOOT point at the Phase-1 fix that owns them; SOURCE / KNOWLEDGE are correct behaviour,
 * so the signal is that the agent-type's BUDGET wants re-tuning, not that a center regressed.
 */
export const REMEDIATION = {
  ENV: "ENV probes regressed — retighten the offline skip-license guidance (ADR-0162 item 1: offline sessions need no DB/SDK/git-fetch probe; a build self-starts the DB).",
  CLI: "CLI startup tax regressed — verify the direct launcher + compile-cache still apply (ADR-0162 item 2, packages/cli/launch.mjs).",
  BOOT: "Fresh-worktree install landed on the onboarding path — verify SessionStart pre-provisioning still runs (ADR-0162 item 3, packages/cli/provision-worktree.mjs).",
  SOURCE: "Dominated by SOURCE reads (correct just-in-time behaviour, ADR-0162 item 4) — re-tune this agent-type's budget rather than chase a cost center.",
  KNOWLEDGE: "Dominated by orientation reads — check for over-eager knowledge pulling (ADR-0023 is pull-based/just-in-time); consider re-tuning this agent-type's budget.",
} as const satisfies Record<CostCenter, string>;

/**
 * The breach signal — a "this needs attention" signal in the ADR-0032 sense (a signal that an
 * artifact/cost-center needs attention), shaped to feed the signal → Library graduation loop. It is
 * NOT a halt: the session already ran. The monitor emits it post-session so the arc's Phase-1 gains
 * do not regress silently.
 */
export interface OnboardingSignal {
  kind: "onboarding-budget-breach";
  sessionId: string;
  agentType: string;
  onboardingMs: number;
  budgetMs: number;
  overByMs: number;
  toolCallsBeforeWork: number;
  dominantCostCenter: CostCenter | null;
  byCostCenter: Record<CostCenter, number>;
  /** The ADR-0032 routing line: which Phase-1 fix (or budget re-tune) owns this breach. */
  remediation: string;
}

/** The full post-session report for one transcript. */
export interface OnboardingReport {
  sessionId: string;
  agentType: string;
  budgetMs: number;
  measurement: OnboardingMeasurement;
  /** true iff the onboarding cost exceeded the agent-type's budget. */
  breach: boolean;
  /** The emitted signal — present iff {@link breach}. */
  signal: OnboardingSignal | null;
}

export interface CheckOnboardingInput {
  trace: readonly TraceToolCall[];
  agentType: string;
  sessionId: string;
}

/**
 * PURE: measure a trace, compare to the agent-type's budget, and — on breach — emit the ADR-0032
 * breach signal. Never throws, never halts; the worst outcome is a signal.
 */
export function checkOnboardingBudget(input: CheckOnboardingInput): OnboardingReport {
  const { trace, agentType, sessionId } = input;
  const measurement = measureOnboarding(trace);
  const budgetMs = budgetForAgentType(agentType);
  const breach = measurement.onboardingMs > budgetMs;

  const signal: OnboardingSignal | null = breach
    ? {
        kind: "onboarding-budget-breach",
        sessionId,
        agentType,
        onboardingMs: measurement.onboardingMs,
        budgetMs,
        overByMs: measurement.onboardingMs - budgetMs,
        toolCallsBeforeWork: measurement.toolCallsBeforeWork,
        dominantCostCenter: measurement.dominantCostCenter,
        byCostCenter: measurement.byCostCenter,
        remediation:
          measurement.dominantCostCenter !== null
            ? REMEDIATION[measurement.dominantCostCenter]
            : "No dominant cost center (empty prefix) — re-tune this agent-type's budget.",
      }
    : null;

  return { sessionId, agentType, budgetMs, measurement, breach, signal };
}

/** Format ms as a compact `12.3s` / `840ms`. */
function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/**
 * PURE: render a report as a human-readable block for the CLI envelope body. On breach it prints the
 * emitted signal (the cost-center breakdown + the ADR-0032 remediation line); within budget it prints
 * the healthy measurement.
 */
export function formatOnboardingReport(report: OnboardingReport): string {
  const { measurement: m } = report;
  const lines: string[] = [];
  lines.push(`onboarding report — session ${report.sessionId} (agent-type: ${report.agentType})`);
  const workAt = m.firstWorkIndex === -1 ? "never (whole session is onboarding)" : `tool-call #${m.firstWorkIndex + 1}`;
  lines.push(`  first real-work action: ${workAt}`);
  lines.push(`  active onboarding:      ${fmtMs(m.onboardingMs)} over ${m.toolCallsBeforeWork} tool-call(s)`);
  lines.push(`  budget (${report.agentType}): ${fmtMs(report.budgetMs)}`);
  lines.push("  by cost center:");
  for (const center of COST_CENTERS) {
    const ms = m.byCostCenter[center];
    if (ms > 0) lines.push(`    ${center.padEnd(9)} ${fmtMs(ms)}`);
  }
  if (report.breach && report.signal !== null) {
    const s = report.signal;
    lines.push("");
    lines.push(`  ⚠ BUDGET BREACH — over by ${fmtMs(s.overByMs)} (dominant: ${s.dominantCostCenter ?? "—"})`);
    lines.push(`    signal: ${s.kind}`);
    lines.push(`    → ${s.remediation}`);
    lines.push("  (a flag, not a halt — the session already ran; ADR-0162 §Why-not-a-gate)");
  } else {
    lines.push("");
    lines.push(`  ✓ within budget (${fmtMs(report.budgetMs - m.onboardingMs)} to spare)`);
  }
  return lines.join("\n");
}
