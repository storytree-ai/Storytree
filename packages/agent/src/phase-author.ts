/**
 * The executor seam (ADR-0030 §2): the runtime-agnostic surface the prove-it-gate drives a leaf
 * through. The spine owns every phase transition; a {@link PhaseAuthor} only ever AUTHORS inside
 * the two authoring phases — it never observes red/green and never reports a verdict (ADR-0020).
 *
 * Two implementations exist by design:
 *  - the owned loop (`OwnedLoopAuthor` in @storytree/orchestrator): ScriptedModel/AnthropicModel +
 *    ToolExecutor + write-scoped decorator — the offline/deterministic test harness and the
 *    pivot-out fallback;
 *  - the Claude Agent SDK ({@link ClaudeAgentAuthor} in ./sdk-author.js): the live runtime
 *    (ADR-0030), subscription-funded, write-scope enforced via PreToolUse hooks.
 */

/** The two phases a leaf authors in (ADR-0020 §1). All other phases are spine-only — no leaf runs. */
export type AuthoringPhase = "AUTHOR_TEST" | "IMPLEMENT";

/** The authoring outcome the gate consumes: complete, or fail-closed with a reason. */
export type AuthorResult = { ok: true } | { ok: false; error: string };

/**
 * One leaf runtime behind the gate. `author` runs ONE authoring slice: the runtime works the
 * prompt inside the current phase's write scope and returns when the deliverable is authored (or
 * fails closed). It must NOT run tests to decide success — the spine observes red/green itself.
 */
export interface PhaseAuthor {
  author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult>;
}
