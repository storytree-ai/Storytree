// A bounded retry for an IDEMPOTENT read (`traversal-panel-arc`, increment
// `traversal-panel-index-read`).
//
// The picker's real defect was never that its index read is slow — it is that the read happens ONCE
// per mount with no second chance, so a single lost race turns a slow answer into a PERMANENT
// failure: `{status:'failed'}` for the life of the mount, every claimed session disabled, and the
// only route to the replay panel closed. Making the read faster (see server/traversalIndexMemo.ts)
// removes the usual cause; this removes the amplification, so the next unusual cause costs one
// slow render instead of the whole surface.
//
// Deliberately scoped to reads that are SAFE TO REPEAT. Every caller here is a GET that computes an
// answer and writes nothing, so re-issuing it cannot double an effect — which is why this retries
// any failure rather than trying to classify aborts apart from 5xx. A write must never use it.

/** How long to wait before attempt `attemptIndex` (1-based: the delay BEFORE the second attempt). */
export type BackoffMs = (attemptIndex: number) => number;

export interface RetryReadOptions {
  /** Total attempts INCLUDING the first. `1` disables retrying without changing the call shape. */
  readonly attempts: number;
  readonly backoffMs: BackoffMs;
  /** Injected so a test proves the retry without spending the wall clock it describes. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * The default wait — the one the shipped picker actually runs when nothing is injected.
 *
 * Exported so a test can drive THIS and not only its stand-in: a retry proved exclusively against a
 * fake sleep is evidence about the fake, and the timer the browser runs would be reached by nothing
 * (`check:verification-decay`'s `unproven-seam-default`, ADR-0278).
 */
export const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Run `read` until it resolves or `attempts` is exhausted, waiting `backoffMs(n)` between tries.
 *
 * The LAST failure is what propagates, not the first: the caller renders that message to an
 * operator, and the most recent attempt is the one that describes the world they are looking at.
 */
export async function retryRead<T>(
  read: () => Promise<T>,
  options: RetryReadOptions,
): Promise<T> {
  const sleep = options.sleep ?? realSleep;
  const attempts = Math.max(1, options.attempts);

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(options.backoffMs(attempt));
    try {
      return await read();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
