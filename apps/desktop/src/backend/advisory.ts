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

export type AdvisoryRead = <T>(name: string, fn: () => Promise<T>) => Promise<T | null>;

/**
 * Build an advisory reader: race `fn` against the timeout, null on ANY failure (the PgBackend
 * pattern), logging each read's failure once per (name, cause) streak.
 */
export function createAdvisoryReader(options: AdvisoryReaderOptions = {}): AdvisoryRead {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const log = options.log ?? ((line: string) => console.error(line));
  // Last-logged failure message per read name — the dedupe state. An entry is cleared on success,
  // so a re-failure after recovery starts a new streak and logs again.
  const lastFailure = new Map<string, string>();

  return async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });
      const result = await Promise.race([fn(), timeout]);
      lastFailure.delete(name);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (lastFailure.get(name) !== message) {
        lastFailure.set(name, message);
        log(`[backend] advisory read '${name}' failed: ${message}`);
      }
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
