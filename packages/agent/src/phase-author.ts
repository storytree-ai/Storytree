/**
 * The executor seam (ADR-0030 §2): the runtime-agnostic surface the prove-it-gate drives a leaf
 * through. The spine owns every phase transition; a {@link PhaseAuthor} only ever AUTHORS inside
 * the two authoring phases — it never observes red/green and never reports a verdict (ADR-0020).
 *
 * Three implementations exist by design:
 *  - the owned loop (`OwnedLoopAuthor` in @storytree/orchestrator): ScriptedModel/AnthropicModel +
 *    ToolExecutor + write-scoped decorator — the offline/deterministic test harness and the
 *    pivot-out fallback;
 *  - the Claude Agent SDK ({@link ClaudeAgentAuthor} in ./sdk-author.js): the compatibility-default
 *    live runtime (ADR-0030), subscription-funded, write-scope enforced via PreToolUse hooks;
 *  - local Codex ({@link CodexPhaseAuthor} in ./codex-author.js): the opt-in ChatGPT-subscription
 *    live runtime (ADR-0232/0356), authoring in a disposable replica whose observed, explicitly
 *    manifested changes only the spine can promote.
 */

/** The two phases a leaf authors in (ADR-0020 §1). All other phases are spine-only — no leaf runs. */
export type AuthoringPhase = "AUTHOR_TEST" | "IMPLEMENT";

/**
 * The admitted live leaves (ADR-0232), plus pi (`pi-harness-admission-arc`, ADR-0449).
 *
 * `"pi"` WAS in the type before it was in the CLI, deliberately — increment 2 built `PiPhaseAuthor`
 * behind this seam and proved its walls hold while `resolveLiveRuntime` still REFUSED `--runtime
 * pi`, with a test asserting that refusal, so the path could only open by someone changing that
 * test on purpose. Increment 3 is that deliberate change: `--runtime pi` now resolves, and the
 * narrowing moved to where it still binds — pi is admitted for `--live` and REFUSED for `--real`,
 * because ADR-0449 authorised one trial run through the live smoke and not a promotion path.
 */
export type LiveRuntime = "claude" | "codex" | "pi";

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
