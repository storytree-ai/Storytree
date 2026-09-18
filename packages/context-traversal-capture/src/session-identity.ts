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
 *
 * TWO HARNESSES NAME A WINDOW, NOT ONE. Claude Code exports its window id as
 * `CLAUDE_CODE_SESSION_ID`; Codex exports its thread id as `CODEX_THREAD_ID` to every shell command
 * it runs (`storytree context` already selects a Codex rollout by it). Until the second was read
 * here, every `storytree` read a Codex session made resolved no identity and was dropped in silence.
 *
 * AND AN IDENTITY NOW SAYS WHO WROTE IT, AS WELL AS WHICH WINDOW IT IS. Beside the slot it carries two
 * PROVENANCE attributes, both DETECTED from the writing process and never self-declared or inferred
 * backwards: which agent HARNESS the process runs under ({@link resolveSessionHarness}) and which
 * MACHINE it runs on ({@link TraceIdentity.host}). An audit once read roughly forty hours of Codex
 * work on the owner's Windows laptop as work done on a second Linux box, because nothing on a trace
 * line said either fact.
 *
 * ⚠ TWO MEANINGS OF "HOST", AND THIS MODULE NOW HOLDS BOTH. The older traversal vocabulary uses
 * "host" for the AGENT HARNESS — {@link HOST_WINDOW_ID_ENV}, `surface:host_transcript`, "the host
 * transcript". The `host` ATTRIBUTE added here is the MACHINE: its hostname, as `os.hostname()`
 * answers it. They are different facts and must never be read for one another; the agent harness
 * is always called `harness` from here on.
 */

/**
 * The environment variable a CLAUDE CODE-run CLI reads its own context window's id from.
 *
 * ⚠ "HOST" IN THIS NAME MEANS THE AGENT HARNESS, in the older vocabulary's sense — not the machine,
 * which is {@link TraceIdentity.host}. It is also no longer the only harness: Codex's equivalent is
 * {@link CODEX_WINDOW_ID_ENV}. The name is kept because it is exported, not because it is still apt.
 */
export const HOST_WINDOW_ID_ENV = "CLAUDE_CODE_SESSION_ID";

/**
 * The environment variable a CODEX-run CLI reads its own thread's id from. Codex exports it to every
 * shell command it runs, so it names the window the command belongs to exactly as
 * {@link HOST_WINDOW_ID_ENV} does for Claude Code — and `storytree context` (`packages/cli/src/
 * context.ts`) already reads it to select that thread's rollout.
 */
export const CODEX_WINDOW_ID_ENV = "CODEX_THREAD_ID";

/**
 * Claude Code's documented child-process marker, `1` in every process it starts — including versions
 * that export no session id. It says which HARNESS a process runs under and names no window, so it
 * is read by {@link resolveSessionHarness} alone and is never an identity.
 */
const CLAUDE_CODE_MARKER_ENV = "CLAUDECODE";

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

/**
 * The agent harnesses a process can be DETECTED running under — the closed vocabulary a trace
 * line's `harness` is read against. A word on disk that is not one of these is read as "declared
 * nothing", never coerced into one of them.
 */
export const SESSION_HARNESSES = ["claude-code", "codex"] as const;

/** One of {@link SESSION_HARNESSES}. */
export type SessionHarness = (typeof SESSION_HARNESSES)[number];

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
  /**
   * WHICH AGENT HARNESS the invocation's process runs under, detected from its own environment
   * ({@link resolveSessionHarness}). `null` means NO RECOGNISED HARNESS — never a synonym for a
   * human at a terminal, which is an inference this attribute exists to stop being made.
   */
  readonly harness: SessionHarness | null;
  /**
   * WHICH MACHINE the invocation ran on — its hostname, trimmed ({@link normalizeHost}), or null when
   * the caller supplied none. ⚠ The MACHINE, not the "host" of {@link HOST_WINDOW_ID_ENV}, which is
   * the older vocabulary's word for the agent harness.
   */
  readonly host: string | null;
}

export interface TraceIdentityInput {
  /** The invocation's environment. Injected, never read ambiently, so this module stays pure. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * The caller's worktree-slot identity (`deriveIdentity()?.sessionId` in the CLI), or null in the
   * primary checkout / CI. Recorded as a grouping attribute; never promoted to an identity.
   */
  readonly slot: string | null;
  /**
   * The machine's hostname (`os.hostname()` in the CLI). INJECTED for the reason `env` is: this module
   * imports no `os` and reads nothing ambiently, so the whole resolution stays decided by values.
   * Absent is "the caller did not say", which resolves to a null host rather than a guessed one.
   */
  readonly host?: string | null;
}

/** A value trimmed, or null when it is absent or blank: a blank value NAMES nothing here. */
function nonBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trimmedEnv(env: TraceIdentityInput["env"], name: string): string | null {
  return nonBlank(env[name]);
}

/**
 * A machine's hostname as a trace line records it: trimmed, and null when there is nothing to name —
 * so a blank answer is recorded as no host at all rather than as a host called "".
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  return nonBlank(raw);
}

/**
 * Which agent harness THIS process runs under, DETECTED from its own environment — never declared.
 *
 * THE PRECEDENCE MIRRORS {@link resolveTraceIdentity}'s WINDOW PRECEDENCE, and that is the point of
 * it: whenever a trace line's id is a window id, the harness beside it agrees with the harness that
 * id belongs to.
 *   1. `CLAUDE_CODE_SESSION_ID` → `claude-code` (the window rung that wins);
 *   2. `CODEX_THREAD_ID` → `codex`;
 *   3. `CLAUDECODE=1` → `claude-code` — Claude Code's documented child-process marker, which covers
 *      versions that export no session id. It sits BELOW Codex's thread id because it names no
 *      window, so it must never outvote a harness that does;
 *   4. otherwise `null` — "no recognised harness", which is NOT a human, a terminal, or anything
 *      else a reader might supply from habit.
 * Every value is trimmed, and a blank one counts as absent, exactly as the identity's own are.
 *
 * ⚠ THE NESTED CASE IS A STATED LIMIT, NOT A BUG. A Codex leaf launched from inside a Claude session
 * inherits that session's `CLAUDE_CODE_SESSION_ID`, so its reads resolve to the CLAUDE PARENT's
 * window and harness — the same way a Claude subagent's reads fold into its parent's trace today.
 * `storytree context` (`packages/cli/src/context.ts`) deliberately checks Codex FIRST, and that is
 * not a disagreement: it asks a different question — which window is THE READING PROCESS'S OWN —
 * and nothing here changes its answer.
 */
export function resolveSessionHarness(env: TraceIdentityInput["env"]): SessionHarness | null {
  if (trimmedEnv(env, HOST_WINDOW_ID_ENV) !== null) return "claude-code";
  if (trimmedEnv(env, CODEX_WINDOW_ID_ENV) !== null) return "codex";
  if (trimmedEnv(env, CLAUDE_CODE_MARKER_ENV) === "1") return "claude-code";
  return null;
}

/**
 * Resolve the identity this invocation's trace lines are keyed by, or null to capture nothing.
 *
 * Precedence: an explicitly DECLARED id, then Claude Code's WINDOW id, then Codex's THREAD id (also
 * a window id), then nothing. The slot, the harness and the host ride along whichever rung answers,
 * and none of them is ever the answer on its own.
 *
 * THE ORDER IS WHAT MAKES CODEX PURELY ADDITIVE. Codex's rung sits BELOW both rungs that existed
 * before it, so every invocation that resolved an identity before resolves to the same session id
 * and grade after; the only runs that change are the ones that used to resolve nothing at all.
 */
export function resolveTraceIdentity(input: TraceIdentityInput): TraceIdentity | null {
  // Computed ONCE, so the three rungs below cannot disagree about what rides beside the identity.
  const beside = {
    slot: input.slot,
    harness: resolveSessionHarness(input.env),
    host: normalizeHost(input.host),
  };

  const declared = trimmedEnv(input.env, DECLARED_SESSION_ID_ENV);
  if (declared !== null) return { sessionId: declared, grade: "declared", ...beside };

  const claudeWindow = trimmedEnv(input.env, HOST_WINDOW_ID_ENV);
  if (claudeWindow !== null) return { sessionId: claudeWindow, grade: "window", ...beside };

  const codexWindow = trimmedEnv(input.env, CODEX_WINDOW_ID_ENV);
  if (codexWindow !== null) return { sessionId: codexWindow, grade: "window", ...beside };

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
