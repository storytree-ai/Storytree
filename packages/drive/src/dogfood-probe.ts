/**
 * The cold-start dogfood probe (ADR-0184, Story UAT leg 7 "An agent actually USES it end to end").
 *
 * Leg 7's success condition — "a fresh agent, onboarding from CLAUDE.md alone (the inner loop never
 * named for it), reaches a real signed verdict over a genuinely-new unit" — is inherently live-only
 * (ADR-0184 d.5): no offline proxy can show that a REAL agent discovers the machinery. The probe
 * (`dogfood-probe.run.ts`) spawns a fresh, full-tool Claude Code session (`claude -p`) in an isolated
 * worktree whose ONLY coaching is the repo's onboarding surface (CLAUDE.md), and hands it a task that
 * names the OUTCOME (a signed proof verdict for a tiny new unit) but never the MEANS (the inner-loop
 * commands). If the machinery is truly usable-without-coaching (ADR-0057's load-bearing question), the
 * agent reads CLAUDE.md, discovers the inner loop itself, authors a self-registering node, and drives
 * it to a signed verdict in `events.verdict` — which gate-7 then witnesses (`dogfood-witness.check.ts`).
 *
 * This module is the PURE, offline-testable heart of the harness: the uncoached task prompt and the
 * executable integrity guard that PROVES the prompt names no inner-loop mechanic. ADR-0184 d.4 makes
 * the uncoached-context integrity a ONE-TIME authoring audit (code review); this module turns that
 * audit into a standing test (`dogfood-probe.test.ts`), so a later edit that leaks a hint into the
 * prompt reds the drive suite instead of silently coaching the probe.
 */

/** The node-id prefix every probe node carries, so gate-7 can recognize a dogfood-probe verdict. */
export const PROBE_NODE_PREFIX = "dogfood-probe-";

/**
 * The inner-loop mechanics the probe must DISCOVER from CLAUDE.md, never be told. If any of these
 * appears in the task prompt the probe is uncoached-audit FAILS: the prompt would be spoon-feeding the
 * very thing leg 7 tests the agent can find on its own. Matched case-insensitively as substrings.
 * These name the HOW (the build command, the gate, the resolver) — not the outcome ("a signed
 * verdict") or the onboarding pointer ("CLAUDE.md"), which the prompt is allowed to name.
 */
export const INNER_LOOP_TERMS: readonly string[] = [
  "node build",
  "story build",
  "--real",
  "--store pg",
  "--dry-run",
  "prove-it-gate",
  "prove-it gate",
  "proveunit",
  "buildnodereal",
  "prove-spec",
  "provespec",
  "resolveprovespec",
  "phaseauthor",
  "claudeagentauthor",
  "--pg",
  "adr-0020",
  "adr-0031",
  "adr-0057",
];

/** The id a probe node carries for a given run seed (`dogfood-probe-<seed>`). */
export function probeNodeId(seed: string): string {
  return `${PROBE_NODE_PREFIX}${seed}`;
}

/**
 * The uncoached probe task, parameterized by the target node id. It names the OUTCOME (a tiny new
 * unit taken to a genuine SIGNED proof recorded in the project's proof store) and points at the
 * onboarding surface (CLAUDE.md) — and DELIBERATELY nothing about how proofs are driven. The agent
 * must discover the inner loop from CLAUDE.md and the corpus itself; that discovery IS leg 7.
 */
export function probeTaskPrompt(nodeId: string): string {
  return [
    "You are a brand-new engineer onboarding to this repository for the first time. Start by reading",
    "CLAUDE.md — it is the authoritative orientation and explains how this project declares, proves,",
    "and records work. Trust it over any other prose.",
    "",
    "Your task: grow ONE small, brand-new unit of work all the way to a genuine, SIGNED proof — the",
    "kind of signed proof verdict this project's machinery records in its proof store when a unit is",
    "proven for real. Concretely:",
    "",
    `  1. Author a tiny, genuinely-NEW, self-contained pure function, declared as a new provable unit`,
    `     with the id "${nodeId}". It must be net-new behaviour that does not already exist in the`,
    "     repository, so the proof is honest (there is a real failing state before you implement it).",
    "  2. Take that unit through this project's real proving process, end to end, until it earns a",
    "     REAL signed verdict recorded in the project's proof store (not a dry run, not a simulation).",
    "",
    "Discover HOW entirely from CLAUDE.md and the repository itself — how a unit is declared so the",
    "machinery can build it, how the proof is driven, and which command records a real signed verdict.",
    "Do NOT ask me for the steps or the commands; find them. Read an existing proven unit if you need a",
    "worked example. When the unit has earned its signed verdict, stop and report the verdict id/commit.",
  ].join("\n");
}

/** The outcome of the uncoached-context integrity audit (ADR-0184 d.4, made executable). */
export interface UncoachedAudit {
  ok: boolean;
  /** Inner-loop terms found in the prompt (must be empty for the probe to be genuinely uncoached). */
  found: string[];
}

/**
 * PURE: does `prompt` leak any inner-loop mechanic? The probe is genuinely uncoached iff `found` is
 * empty. This is the standing form of ADR-0184 d.4's one-time authoring audit — the drive suite runs
 * it against the real {@link probeTaskPrompt}, so a hint slipped into the prompt reds the gate.
 */
export function auditUncoached(prompt: string): UncoachedAudit {
  const haystack = prompt.toLowerCase();
  const found = INNER_LOOP_TERMS.filter((term) => haystack.includes(term.toLowerCase()));
  return { ok: found.length === 0, found };
}
