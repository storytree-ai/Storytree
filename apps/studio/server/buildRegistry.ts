// The build-run registry — the server-side, in-memory run lifecycle for UI-driven builds
// (capability `build-run-registry`, ADR-0090 Phase 1 "the local loop").
//
// WHAT IT IS: a small state organ. It holds the live build runs the studio worker drives, captures
// the COARSE progress each build emits (phase/status/verdict LINES, never the raw model stream),
// and records the terminal envelope. It owns NO proof logic — `nodeBuild` → `proveUnit` (the
// drive-machinery story) still observes red→green and SIGNS; the registry never produces a verdict.
// Duplicating any gate logic here would be a second, unproven proof path — exactly the forge risk
// ADR-0091's "no verdict is ever handed in" forbids.
//
// PHASE-1 SHAPE (deliberate, do not over-build):
//  • ONE build at a time — `createRun` refuses (typed result, the API maps to 409) while a run is
//    non-terminal. Multi-run concurrency is later-phase work.
//  • IN-MEMORY only — there is no DB table for runs; the transcript is ephemeral progress, gone on a
//    dev-server restart. The DURABLE artifact is the signed verdict the build persists to
//    `events.verdict` (via `nodeBuild --store pg`), which the world already reads.
//  • BOUNDED — the transcript is capped in line count and per-line length so a runaway build cannot
//    grow the buffer unbounded.

import { randomUUID } from 'node:crypto';

/** A build run's lifecycle state: in flight, or one of the two terminal outcomes. */
export type BuildRunStatus = 'building' | 'passed' | 'failed';

/** One UI-driven build run. `envelope`/`reason` appear only at the matching terminal state. */
export interface BuildRun {
  runId: string;
  unitId: string;
  status: BuildRunStatus;
  /** Coarse progress lines, oldest-first, bounded by the registry's caps. */
  transcript: string[];
  /** ISO start time. */
  startedAt: string;
  /** ISO terminal time (present once terminal). */
  endedAt?: string;
  /** The final build envelope body (formatted text) — present only on a `passed` run. */
  envelope?: string;
  /** The failure reason — present only on a `failed` run. */
  reason?: string;
}

/** `createRun` either mints a run, or refuses (single-build-at-a-time) with a reason. */
export type CreateRunResult = { ok: true; run: BuildRun } | { ok: false; reason: string };

/** Registry caps (defaulted; overridable in tests). */
export interface BuildRegistryOptions {
  /** Max transcript lines retained per run (most-recent kept when exceeded). */
  maxLines?: number;
  /** Max characters per transcript line (longer lines are truncated). */
  maxLineChars?: number;
}

const DEFAULT_MAX_LINES = 500;
const DEFAULT_MAX_LINE_CHARS = 2_000;

/** Collapse a value into ONE coarse display line: strip control chars / newlines, trim, truncate. */
function normaliseLine(line: string, maxChars: number): string {
  const flat = line.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > maxChars ? flat.slice(0, maxChars) : flat;
}

export class BuildRegistry {
  readonly #runs = new Map<string, BuildRun>();
  /** The id of the one non-terminal run, or null when nothing is building (the Phase-1 guard). */
  #activeRunId: string | null = null;
  readonly #maxLines: number;
  readonly #maxLineChars: number;

  constructor(opts: BuildRegistryOptions = {}) {
    this.#maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.#maxLineChars = opts.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  }

  /** True while a build is in flight — the single-build guard (`createRun` refuses meanwhile). */
  hasActiveBuild(): boolean {
    return this.#activeRunId !== null;
  }

  /**
   * Mint a fresh `building` run for `unitId`, or REFUSE (typed, never thrown) when one is already
   * live. Phase-1 single-build-at-a-time: the API maps the refusal to 409.
   */
  createRun(unitId: string): CreateRunResult {
    if (this.#activeRunId !== null) {
      return { ok: false, reason: 'a build is already running' };
    }
    const run: BuildRun = {
      runId: randomUUID(),
      unitId,
      status: 'building',
      transcript: [],
      startedAt: new Date().toISOString(),
    };
    this.#runs.set(run.runId, run);
    this.#activeRunId = run.runId;
    return { ok: true, run: this.#clone(run) };
  }

  /**
   * Append ONE coarse line to a non-terminal run (normalised to a single display line, truncated to
   * the per-line cap). No-op for an unknown or terminal run — a terminalised run accepts no more
   * appends. When the line cap is exceeded the OLDEST line is dropped (most-recent retained).
   */
  appendLine(runId: string, line: string): void {
    const run = this.#runs.get(runId);
    if (run === undefined || run.status !== 'building') return;
    run.transcript.push(normaliseLine(line, this.#maxLineChars));
    if (run.transcript.length > this.#maxLines) {
      run.transcript.splice(0, run.transcript.length - this.#maxLines);
    }
  }

  /** Terminalise a run as PASSED with its final envelope body; unblocks the next build. */
  terminalisePassed(runId: string, envelope: string): void {
    this.#terminalise(runId, (run) => {
      run.status = 'passed';
      run.envelope = envelope;
    });
  }

  /** Terminalise a run as FAILED with its reason (no signed verdict); unblocks the next build. */
  terminaliseFailed(runId: string, reason: string): void {
    this.#terminalise(runId, (run) => {
      run.status = 'failed';
      run.reason = reason;
    });
  }

  /** A snapshot of a run (deep-copied transcript so callers can't mutate registry state), or undefined. */
  getRun(runId: string): BuildRun | undefined {
    const run = this.#runs.get(runId);
    return run === undefined ? undefined : this.#clone(run);
  }

  #terminalise(runId: string, apply: (run: BuildRun) => void): void {
    const run = this.#runs.get(runId);
    if (run === undefined || run.status !== 'building') return;
    apply(run);
    run.endedAt = new Date().toISOString();
    if (this.#activeRunId === runId) this.#activeRunId = null;
  }

  #clone(run: BuildRun): BuildRun {
    return { ...run, transcript: [...run.transcript] };
  }
}
