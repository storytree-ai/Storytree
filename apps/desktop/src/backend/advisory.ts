// The advisory-read helper the sidecar's overlay seams share (extracted from
// electron/backend-entry.ts so the failure-observability contract is CI-provable).
//
// Each overlay read (verdicts / activity / presence / claims) is ADVISORY (ADR-0033): null on ANY
// failure — stopped DB, missing table, timeout — never a throw, so a down DB leaves the forest
// under-claiming rather than hanging /api/tree. That contract is unchanged here. What this adds is
// OBSERVABILITY: a failing read emits one bounded stderr line naming the read and the cause, so an
// operator inspecting the sidecar output (stderr is inherited by the Electron main) can tell a
// failing overlay from a genuinely empty one. Bounded: the forest polls, and every tree render
// re-runs all five reads — so an UNCHANGED failure logs once per failing streak (a success resets
// the streak; a changed cause is new information and logs again), never once per poll.

export interface AdvisoryReaderOptions {
  /** Per-read timeout; a read racing past it is a failure like any other. Default 4s. */
  timeoutMs?: number;
  /** The log sink — one line per NEW failure. Defaults to console.error (the sidecar's stderr). */
  log?: (line: string) => void;
}

/**
 * Per-CALL budget override for a single advisory read (claim-wisp-cold-start / FIX 2b). The other
 * four reads pass nothing and keep the shared default — the softening is targeted, never a blanket
 * raise of the shared `timeoutMs` (which would make a slow verdicts/activity read hold /api/tree
 * longer on every poll).
 */
export interface AdvisoryReadOptions {
  /** Overrides the shared default for THIS read only — a softer budget for a slow DB cold-start. */
  timeoutMs?: number;
  /** Re-race `fn()` ONCE on the first failure before nulling. Bounded: at most one retry, so a
   * genuinely down DB still nulls promptly and /api/tree never hangs on an unbounded loop. */
  retryOnce?: boolean;
}

export type AdvisoryRead = <T>(
  name: string,
  fn: () => Promise<T>,
  opts?: AdvisoryReadOptions,
) => Promise<T | null>;

/**
 * Build an advisory reader: race `fn` against the timeout, null on ANY failure (the PgBackend
 * pattern), logging each read's failure once per (name, cause) streak. A read MAY pass a per-call
 * `opts` to soften its own budget (a larger `timeoutMs` and/or a single `retryOnce`) — used only by
 * the claims read on a DB cold-start; every other read keeps the shared default.
 */
export function createAdvisoryReader(options: AdvisoryReaderOptions = {}): AdvisoryRead {
  const defaultTimeoutMs = options.timeoutMs ?? 4_000;
  const log = options.log ?? ((line: string) => console.error(line));
  // Last-logged failure message per read name — the dedupe state. An entry is cleared on success,
  // so a re-failure after recovery starts a new streak and logs again.
  const lastFailure = new Map<string, string>();

  return async <T>(
    name: string,
    fn: () => Promise<T>,
    opts: AdvisoryReadOptions = {},
  ): Promise<T | null> => {
    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs;

    // One race of fn() against a fresh timeout; the timer is always cleared in finally.
    const raceOnce = async (): Promise<T> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        });
        return await Promise.race([fn(), timeout]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    };

    try {
      let result: T;
      try {
        result = await raceOnce();
      } catch (firstErr) {
        // Bounded retry: on a cold-start-shaped first failure, re-race ONCE before nulling. A second
        // failure falls through to the null-on-failure arm — no unbounded loop.
        if (!opts.retryOnce) throw firstErr;
        result = await raceOnce();
      }
      lastFailure.delete(name);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (lastFailure.get(name) !== message) {
        lastFailure.set(name, message);
        log(`[backend] advisory read '${name}' failed: ${message}`);
      }
      return null;
    }
  };
}
