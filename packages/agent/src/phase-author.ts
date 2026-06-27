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

/**
 * The authoring outcome the gate consumes: complete, or fail-closed with a reason.
 *
 * `exhausted` marks the one fail that is NOT a genuine error: the leaf stopped because it hit its
 * own COST GUARD (turn ceiling / USD budget), so usable work may already be on disk. A leaf's
 * ceiling is a cost guard, not a proof signal — ADR-0020 makes the SPINE the sole arbiter of
 * red/green (it observes out-of-band; the leaf never reports the verdict) — so the gate treats an
 * exhausted slice as authoring-complete and falls through to its own observation rather than
 * discarding the paid work (see {@link proveUnit}). Absent/false = a genuine fail-closed error (the
 * SDK crashed, auth failed, no result) where no work was produced and observing would be pointless.
 * Optional, so a leaf that never distinguishes exhaustion (e.g. the offline owned loop, whose
 * scripted turn-exhaustion IS a test bug) keeps returning a plain `{ ok: false }`.
 */
export type AuthorResult =
  | { ok: true }
  | { ok: false; error: string; exhausted?: boolean };

/**
 * One leaf runtime behind the gate. `author` runs ONE authoring slice: the runtime works the
 * prompt inside the current phase's write scope and returns when the deliverable is authored (or
 * fails closed). It must NOT run tests to decide success — the spine observes red/green itself.
 */
export interface PhaseAuthor {
  author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult>;
}
