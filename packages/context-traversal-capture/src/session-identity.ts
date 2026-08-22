/**
 * WHAT ONE TRACE SESSION IS — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0235 / ADR-0241, `linked-session-context-arc-inc-30`).
 *
 * A trace's `sessionId` USED TO BE THE WORKTREE SLOT, and slots are POOLED. Every context window
 * that ever ran in a slot shared one id: the parent session, each subagent it spawned, and every
 * later session the pool handed the same slot to. So the trace reported the union of many windows
 * as one session's behaviour, and any per-session ratio taken from it was wrong in a knowable
 * direction. Measured over 4,161 host transcripts / 768 windows (2026-06-08..2026-08-21): pooling
 * by slot rather than by window moves the re-read share from 13.4% to 32.0% (x2.39) and the
 * re-read COST share from 5.5% to 31.2% (x5.7); the median slot holds 2 windows, the p90 holds 8,
 * and one holds 137. It is the direct cause of a published wrong number — "one document pulled 28
 * times in one session" was eleven-plus sessions over 15 days, and the worst genuine one pulled it
 * five times (`docs/research/re-reading-cost-and-mechanism-2026-08-22.md` §3(a)).
 *
 * SO IDENTITY IS THE CONTEXT WINDOW, AND THE SLOT IS DEMOTED TO A GROUPING ATTRIBUTE. The slot is
 * still genuinely useful — it says which worktree a window was working in, and it is the join the
 * host-transcript correlation already uses — it is just not an identity.
 *
 * PURE by construction: no clock, no filesystem, no `process.env` read of its own. The environment
 * and the caller's slot are injected, exactly as `observe-cli.ts` injects identity and time, so the
 * whole precedence is deterministic and testable offline.
 *
 * WHY AN ABSENT WINDOW ID CAPTURES NOTHING. There is deliberately no slot fallback. A run that
 * cannot name its window cannot honestly contribute to a per-session ratio, and falling back to the
 * slot is precisely the defect above — re-introduced for the runs least able to declare themselves.
 * An uninstrumented run is a normal outcome, not an error (the same posture `captureCliInvocation`
 * already takes for a null identity), so this returns null and the caller silently records nothing.
 */

/** The environment variable a harness-run CLI reads its own context window's id from. */
export const HOST_WINDOW_ID_ENV = "CLAUDE_CODE_SESSION_ID";

/**
 * The explicit override (the secrets-hydration precedent, and the seam a spawned runtime inherits a
 * parent session through — `packages/drive/src/spawn-record.mjs`). It wins over everything: a
 * caller that states its own identity is making a claim this module has no standing to overrule.
 */
export const DECLARED_SESSION_ID_ENV = "STORYTREE_SESSION_ID";

/**
 * How well a written trace line's `sessionId` names ONE context window.
 *
 * `window` — the harness reported this window's own id, so the id names exactly one window.
 * `declared` — a caller supplied the id explicitly; it is as precise as its declarer, no more.
 *
 * There is no `slot` grade, and that absence is the point: a slot never becomes an identity again.
 * Lines written BEFORE this existed carry no grade at all, and {@link classifyTraceIdentity} reads
 * that absence as the legacy slot era rather than guessing them into one of these two.
 */
export type TraceIdentityGrade = "window" | "declared";

/** One invocation's resolved trace identity. */
export interface TraceIdentity {
  /** The trace's session id — one context window, never a pooled slot. */
  readonly sessionId: string;
  /** How well {@link sessionId} names one window. */
  readonly grade: TraceIdentityGrade;
  /**
   * The worktree slot this invocation ran in, when one resolves — a GROUPING attribute recorded
   * beside the identity, never used as one.
   */
  readonly slot: string | null;
}

export interface TraceIdentityInput {
  /** The invocation's environment. Injected, never read ambiently, so this module stays pure. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * The caller's worktree-slot identity (`deriveIdentity()?.sessionId` in the CLI), or null in the
   * primary checkout / CI. Recorded as a grouping attribute; never promoted to an identity.
   */
  readonly slot: string | null;
}

function trimmedEnv(env: TraceIdentityInput["env"], name: string): string | null {
  const value = env[name];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the identity this invocation's trace lines are keyed by, or null to capture nothing.
 *
 * Precedence: an explicitly DECLARED id, then the harness-reported WINDOW id, then nothing. The
 * slot rides along in both cases and is never the answer on its own.
 */
export function resolveTraceIdentity(input: TraceIdentityInput): TraceIdentity | null {
  const declared = trimmedEnv(input.env, DECLARED_SESSION_ID_ENV);
  if (declared !== null) {
    return { sessionId: declared, grade: "declared", slot: input.slot };
  }

  const window = trimmedEnv(input.env, HOST_WINDOW_ID_ENV);
  if (window !== null) {
    return { sessionId: window, grade: "window", slot: input.slot };
  }

  return null;
}

/**
 * What a READ trace's session id turns out to be — the classification a render states rather than
 * leaving a reader to infer from an id's shape.
 *
 * `slot` is the legacy era: lines written before window identity existed, keyed by the pooled
 * worktree slot. They are NOT retrofittable — nothing on disk records which window wrote which
 * line — so they are labelled, never merged into a window-keyed count.
 */
export type TraceIdentityKind = TraceIdentityGrade | "slot" | "mixed";

/**
 * Classify a session from the grades its lines carry. An ungraded line is a legacy slot-era line.
 *
 * A session whose lines disagree is `mixed` rather than either — which happens to a slot-named
 * trace that later takes a declared-id append, and is exactly the silent mixing this classification
 * exists to make visible.
 */
export function classifyTraceIdentity(
  grades: readonly (TraceIdentityGrade | undefined)[],
): TraceIdentityKind {
  const seen = new Set<TraceIdentityKind>(grades.map((grade) => grade ?? "slot"));
  if (seen.size === 0) return "slot";
  if (seen.size > 1) return "mixed";
  const [only] = [...seen];
  return only ?? "slot";
}

/** One line saying what a classification means, for the replay and index renders. */
export function describeTraceIdentity(kind: TraceIdentityKind): string {
  switch (kind) {
    case "window":
      return "one host context window";
    case "declared":
      return "an id the caller declared — as precise as its declarer";
    case "slot":
      return "the worktree SLOT, which pools every window that ran in it — not retrofittable to window identity, so never comparable with a window-keyed count";
    case "mixed":
      return "MIXED — some lines are keyed by a context window and some by the pooled worktree slot; the slot-keyed ones are not retrofittable, so a per-session count over this trace is not one session's";
  }
}
