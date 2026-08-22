// The dispatch-handle READER (ADR-0328 D3).
//
// ADR-0328 decided that an agent whose long machine job will outlive what it can honestly wait for
// HANDS BACK a dispatch handle — where the verdict will appear — rather than stalling or guessing.
// The dispatch half already existed and is not rebuilt here: `pnpm gate:bg <command…>` runs an
// ARBITRARY command (`scripts/gate-bg.sh` takes `"$@"`, and `scripts/gate-bg.mjs` forwards argv),
// tees to a log whose path the caller may pre-choose with `GATE_BG_LOG`, and writes a sibling
// `<log>.exit` carrying the wrapped command's REAL status via `${PIPESTATUS[0]}`.
//
// What was missing is the half a CALLER needs: a way to read that handle ONCE and be told the truth,
// including when the truth is "not yet". That is this file.
//
// THE LOAD-BEARING RULE, and the reason this is not a two-line `cat`: a handle that has not settled
// is UNVERIFIED, never a pass and never a fail (`asset:unrun-check-is-unverified-not-refuted`). The
// three unsettled states — still running, never dispatched, sentinel unparseable — are each reported
// as themselves and are structurally incapable of being read as a verdict: {@link isVerdict} is the
// single predicate that answers "may I cite this as an outcome?", and it admits only `passed` and
// `failed`. A caller that branches on anything else is branching on a non-answer.
//
// Pure by injection ({@link HandleIo}) so the decision is tested with no filesystem and no gate run.

/** The filesystem seam — two reads, so the decision below is testable without a real run. */
export interface HandleIo {
  exists(filePath: string): boolean;
  readText(filePath: string): string;
}

/**
 * What a handle says right now. Exactly two of these are outcomes ({@link isVerdict}); the other
 * three are honest non-answers and must never be folded into either outcome bucket.
 */
export type DispatchState = "passed" | "failed" | "running" | "not-dispatched" | "unreadable";

export interface DispatchHandleReading {
  readonly state: DispatchState;
  /** The tee'd log — what `gate:bg` prints as `gate:bg log:`. */
  readonly logPath: string;
  /** The sentinel — `<logPath>.exit`, holding the wrapped command's own status. */
  readonly exitFile: string;
  /** Present only for `passed` / `failed`: the wrapped command's real exit status. */
  readonly exitCode?: number;
  /** Present only for `unreadable`: what was found instead of a status. */
  readonly reason?: string;
}

/** The sentinel suffix `scripts/gate-bg.sh` appends to the log path. */
const EXIT_SUFFIX = ".exit";

export interface NormalizeHandleResult { logPath: string; exitFile: string }

/**
 * Accept either half of the handle. `gate:bg` prints BOTH paths, so an agent copying the wrong line
 * is the likeliest input error there is — and answering it with "not dispatched" would be a false
 * negative dressed as a fact about the job.
 */
export function normalizeHandle(handle: string): NormalizeHandleResult {
  const trimmed = handle.trim();
  if (trimmed.endsWith(EXIT_SUFFIX)) {
    return { logPath: trimmed.slice(0, -EXIT_SUFFIX.length), exitFile: trimmed };
  }
  return { logPath: trimmed, exitFile: `${trimmed}${EXIT_SUFFIX}` };
}

/**
 * THE predicate for "may I cite this as an outcome?". Deliberately the only way to ask: a caller
 * that tests `state !== "failed"` would read a still-running job as a pass, which is precisely the
 * confident FALSE terminal ADR-0328 exists to prevent.
 */
export function isVerdict(reading: DispatchHandleReading): boolean {
  return reading.state === "passed" || reading.state === "failed";
}

/**
 * Read a handle ONCE. No loop, no sleep, no watching — that is the caller's business and the point
 * of the handle (`asset:mechanical-waiting-never-pays-context-rent`).
 */
export function readDispatchHandle(handle: string, io: HandleIo): DispatchHandleReading {
  const { logPath, exitFile } = normalizeHandle(handle);

  if (io.exists(exitFile)) {
    const raw = io.readText(exitFile);
    const text = raw.trim();
    // `gate-bg.sh` writes `printf '%s\n'`, so a trailing newline is the NORMAL shape, not a defect.
    if (/^-?\d+$/.test(text)) {
      const exitCode = Number(text);
      return { state: exitCode === 0 ? "passed" : "failed", logPath, exitFile, exitCode };
    }
    // A sentinel we cannot parse is not a failure of the JOB — it is a failure to observe it.
    return {
      state: "unreadable",
      logPath,
      exitFile,
      reason: text === "" ? "the sentinel is empty" : `the sentinel holds ${JSON.stringify(text)}`,
    };
  }

  // No sentinel yet. The log tells us whether anything was ever dispatched at all — and these two
  // are different facts, so they get different answers rather than one shrug.
  return { state: io.exists(logPath) ? "running" : "not-dispatched", logPath, exitFile };
}

/** The one-line summary. Each state opens with a distinct word so no two can be confused by eye. */
export function describeReading(reading: DispatchHandleReading): string {
  switch (reading.state) {
    case "passed":
      return "PASS — the dispatched command exited 0.";
    case "failed":
      return `FAIL — the dispatched command exited ${String(reading.exitCode)}.`;
    case "running":
      return "RUNNING — dispatched, no verdict yet. UNVERIFIED: this is not a pass.";
    case "not-dispatched":
      return "UNVERIFIED — no log and no sentinel at this handle; nothing was dispatched here.";
    case "unreadable":
      return `UNVERIFIED — the sentinel exists but carries no status (${String(reading.reason)}).`;
  }
}
