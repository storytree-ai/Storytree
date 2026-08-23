/**
 * `storytree onboarding` — the per-agent-type onboarding-budget monitor's CLI surface (ADR-0162
 * Phase 2 / ADR-0291). A POST-SESSION / OBSERVABILITY command: it reads a supported Claude Code or
 * Codex session transcript, MEASURES
 * the active onboarding cost, COMPARES it to the agent-type's budget, and on breach EMITS the ADR-0032
 * breach signal — routed as choose-your-own-adventure `next:` pointers to the owning Phase-1 fix. It
 * FLAGS, never HALTS (ADR-0162 §Why-not-a-gate); it runs offline and touches no session's hot path.
 *
 *   storytree onboarding report <transcript.jsonl> [--agent-type <type>]
 *   storytree onboarding budgets
 *
 * The measurement/budget/breach logic is the pure `onboarding-budget.ts`; the transcript parse is the
 * pure `onboarding-transcript.ts`. This file is the thin shell that reads the host file and shapes the
 * {@link Envelope} — mirroring the drift/coverage offline commands.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Envelope } from "./envelope.js";
import {
  checkOnboardingBudget,
  formatOnboardingReport,
  budgetForAgentType,
  AGENT_BUDGETS,
  DEFAULT_BUDGET_MS,
} from "./onboarding-budget.js";
import { parseTranscript } from "./onboarding-transcript.js";

/** The default agent-type when a transcript is not tagged: the interactive outer loop (ADR-0030). */
const DEFAULT_AGENT_TYPE = "session-orchestrator";

export interface OnboardingOpts {
  /** The agent-type to budget the transcript against; defaults to {@link DEFAULT_AGENT_TYPE}. */
  agentType?: string;
}

export interface OnboardingDeps {
  /** Injected for tests; defaults to reading the real file. */
  readFile?: (p: string) => string;
}

export function onboardingHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree onboarding — the post-session onboarding-budget monitor (ADR-0162 Phase 2).",
      "",
      "  report <transcript.jsonl> [--agent-type <type>]",
      "      measure a session's active onboarding cost, compare to the agent-type's budget,",
      "      and — on breach — emit the ADR-0032 breach signal (a flag, never a halt).",
      "  budgets",
      "      print the per-agent-type onboarding budgets (the SLA table).",
      "",
      "Claude: ~/.claude/projects/<project>/*.jsonl; Codex: ~/.codex/sessions/**/*.jsonl.",
    ].join("\n"),
    next: ["storytree onboarding budgets", "storytree onboarding report <transcript.jsonl>"],
  };
}

/** Render the budget table as an envelope. */
function budgetsCommand(): Envelope {
  const lines: string[] = ["onboarding budgets (SLA, ms — provisional, ADR-0162 §Consequences):"];
  const entries = [...AGENT_BUDGETS].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  for (const [type, ms] of entries) {
    lines.push(`  ${type.padEnd(22)} ${(ms / 1000).toFixed(0)}s`);
  }
  lines.push(`  ${"(default)".padEnd(22)} ${(DEFAULT_BUDGET_MS / 1000).toFixed(0)}s`);
  return {
    ok: true,
    body: lines.join("\n"),
    next: ["storytree onboarding report <transcript.jsonl> --agent-type <type>"],
  };
}

/** The remediation `next:` pointers for a breach, so the report routes the reader to the fix. */
function breachNext(): readonly string[] {
  return [
    "storytree library artifact adr-0162",
    "storytree adr list --load-bearing",
  ];
}

/**
 * The `storytree onboarding` dispatch. `argv` is the positionals AFTER the "onboarding" area word
 * (so argv[0] is the sub-command, argv[1] the transcript path). Never throws — a missing/unreadable
 * file returns an `ok:false` envelope.
 */
export function onboardingCommand(
  argv: readonly string[],
  opts: OnboardingOpts = {},
  deps: OnboardingDeps = {},
): Envelope {
  const [sub, transcriptPath] = argv;
  const read = deps.readFile ?? ((p: string): string => readFileSync(p, "utf8"));

  if (sub === undefined || sub === "help") return onboardingHelp();

  if (sub === "budgets") return budgetsCommand();

  if (sub !== "report") {
    return {
      ok: false,
      body: `unknown onboarding command "${sub}". try: storytree onboarding report <transcript.jsonl> | storytree onboarding budgets`,
      next: ["storytree onboarding report <transcript.jsonl>", "storytree onboarding budgets"],
    };
  }

  if (transcriptPath === undefined) {
    return {
      ok: false,
      body: "onboarding report needs a transcript path: storytree onboarding report <transcript.jsonl> [--agent-type <type>]",
      next: ["storytree onboarding budgets", "storytree onboarding --help"],
    };
  }

  let jsonl: string;
  try {
    jsonl = read(transcriptPath);
  } catch (err) {
    return {
      ok: false,
      body: `could not read transcript "${transcriptPath}": ${(err as Error).message}`,
      next: ["storytree onboarding --help"],
    };
  }

  const agentType = opts.agentType ?? DEFAULT_AGENT_TYPE;
  // Fall back to the file basename (the session uuid) when the transcript carries no sessionId.
  const fallbackId = path.basename(transcriptPath).replace(/\.jsonl$/i, "");
  const parsed = parseTranscript(jsonl);
  if (parsed.harness === "unknown") {
    return {
      ok: false,
      body:
        `unsupported onboarding transcript shape in "${transcriptPath}" — expected Claude Code ` +
        "tool_use/tool_result JSONL or Codex response_item call/output JSONL.",
      next: ["storytree onboarding --help"],
    };
  }
  const sessionId = parsed.sessionId === "unknown" ? fallbackId : parsed.sessionId;
  const { calls } = parsed;
  const report = checkOnboardingBudget({ trace: calls, agentType, sessionId });

  const body =
    formatOnboardingReport(report) +
    (report.breach ? "" : `\n\n(budget for ${agentType}: ${(budgetForAgentType(agentType) / 1000).toFixed(0)}s)`);

  // A breach is a real finding but NOT a command failure — the monitor's job is to surface it, so the
  // envelope is still ok:true; the ⚠ block + the remediation `next:` carry the signal.
  return {
    ok: true,
    body,
    next: report.breach ? breachNext() : ["storytree onboarding budgets"],
  };
}
