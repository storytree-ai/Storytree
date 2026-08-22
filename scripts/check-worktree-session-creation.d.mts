// Type declarations for the pure helpers check-worktree-session-creation.mjs exports, so a TS test
// (and `tsc --noEmit`) can import them without `allowJs` — the same arrangement as
// scripts/resolve-bash.d.mts and scripts/studio.d.mts. The check itself stays plain Node ESM with
// `node:` builtins only, because it must run on a machine whose worktree may be unprovisioned; this
// sibling only types the exported surface.

/** How much a piece of allocate-then-die evidence actually supports. */
export type EvidenceStrength = "direct" | "path-entry";

export interface StartEvidence {
  /** Which measured line shape matched, e.g. `"rebound-worktree"`, `"create-path"`. */
  kind: string;
  strength: EvidenceStrength;
  /** The matching log line, truncated to {@link EVIDENCE_LINE_MAX}. */
  line: string;
}

export interface ScrubEvidence {
  kind: string;
  line: string;
}

/**
 * The shape of one start attempt.
 *
 * - `healthy` — a `Starting local session` line followed inside the correlation window (~5s).
 * - `slow-but-proceeded` — it followed later, but it followed. NOT a failure: a 95s success was
 *   measured on 2026-08-19. Flagged because the delay is the ADR-0389 D2 reuse-candidate scrub
 *   costing time without hanging.
 * - `allocate-then-die` — no start line, but worktree provisioning had provably begun. The ADR-0389
 *   fault; the retired "nothing was created" tell reads this as healthy.
 * - `total-silence` — no start line, and nothing provisioning-related followed the marker at all.
 * - `indeterminate` — the scanned log ends inside the window in which a slow start has been
 *   measured to still succeed, so nothing can yet be concluded. Never read as either failure shape.
 */
export type StartShape =
  | "healthy"
  | "slow-but-proceeded"
  | "allocate-then-die"
  | "total-silence"
  | "indeterminate";

export interface StartAttempt {
  timestampMs: number;
  shape: StartShape;
  /** Set only when the start proceeded (`"healthy"` or `"slow-but-proceeded"`). */
  sessionId: string | null;
  /** Set only when the start proceeded. */
  cwd: string | null;
  /** Set only when the start proceeded. */
  latencyMs: number | null;
  /** Set only when `shape` is `"allocate-then-die"`. */
  strength?: EvidenceStrength;
  evidence: StartEvidence[];
  note: string | null;
}

export type CheckVerdict =
  | "NO ATTEMPT DETECTED"
  | "HEALTHY"
  | "BROKEN"
  | "MIXED"
  | "INDETERMINATE";

export interface SessionStartReport {
  attempts: StartAttempt[];
  /**
   * The ADR-0389 D2 reuse-scrub mechanism, RANGE-SCOPED and deliberately unattributed: the awaited
   * clean only logs when it finally gives up, measured 31 minutes and three further attempts after
   * the start it belonged to.
   */
  scrubEvidence: ScrubEvidence[];
  counts: { healthy: number; slow: number; broken: number; indeterminate: number };
  verdict: CheckVerdict;
}

export interface ClassifyOptions {
  correlationWindowMs?: number;
  proceededWindowMs?: number;
  evidenceWindowMs?: number;
}

/**
 * Correlate every `LocalSessions.start:` marker in `lines` with the `Starting local session` line
 * that followed it, and — for any attempt that did not proceed — name which fault shape it was.
 * Pure: no filesystem, no clock, no machine-local state.
 */
export function classifySessionStarts(
  lines: readonly string[],
  opts?: ClassifyOptions,
): SessionStartReport;

/** `check`'s human-readable report, factored out so the wording itself is testable. */
export function formatCheckReport(report: SessionStartReport): string;

/**
 * The start marker: a hardcoded literal with no interpolation, logged identically on every start —
 * healthy or broken. Correlate FROM it; it is never a symptom.
 */
export const ATTEMPT_MARKER: string;

/** The primary tell's window — the latency a NORMAL start shows (measured 0ms, 1s, 3s, 4s). */
export const DEFAULT_CORRELATION_WINDOW_MS: number;

/**
 * How long a `Starting local session` line still counts as this attempt's at all, and the
 * indeterminacy horizon. Not decoration: a start measured 95s and SUCCEEDED (2026-08-19 23:57), so
 * a 5s deadline would report the capability broken while it was working.
 */
export const DEFAULT_PROCEEDED_WINDOW_MS: number;

export const DEFAULT_EVIDENCE_WINDOW_MS: number;

/** Evidence lines are truncated to this length. The reuse-scrub failure line is ~27 MB. */
export const EVIDENCE_LINE_MAX: number;

/** The `main.log` chosen to read, plus the live-looking copies deliberately passed over. */
export interface ResolvedLog {
  /** Absolute path to the `main.log` that will actually be read. */
  path: string;
  mtimeMs: number;
  /** Rejected candidates, newest first — named in the report so a skip is never silent. */
  shadowed: readonly string[];
}

/**
 * The freshest `main.log` among `candidates` — the one the running app is actually writing.
 *
 * Exists because the desktop moved its log from %APPDATA% to %LOCALAPPDATA% on 2026-08-22 while
 * leaving the old copy in place, frozen at the last `willQuit`. Both are same-named and both parse,
 * so reading the wrong one yields a confident BROKEN for every start. Resolution is by mtime rather
 * than a re-pointed constant, so it self-heals if the file moves again or moves back.
 *
 * Pure over the injected `mtimeOf`, which answers null for an absent or unreadable path.
 */
export function pickNewestLog(
  candidates: readonly string[],
  mtimeOf: (path: string) => number | null,
): ResolvedLog | null;
