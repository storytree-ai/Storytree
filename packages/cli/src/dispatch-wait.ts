// The BOUNDED wait over a dispatch handle (`the-gate-costs-what-the-change-risks-arc` inc 6, item 2).
//
// WHAT WAS MISSING. `storytree dispatch <handle>` reads a backgrounded job's sentinel ONCE and is
// honest about "not yet" (ADR-0328 D3). That is the right shape for a HANDBACK — the dispatcher is
// gone and someone else reads the verdict later. It is the wrong shape for the other half of the
// same problem: a session that must not proceed until the verdict lands. That session had no verb,
// so it hand-rolled one, and the same session hand-rolled the same loop THREE TIMES in a day:
//
//   until ls .gate-logs/*.log.exit >/dev/null 2>&1; do sleep 45; done
//
// which is `a-lane-waiting-on-a-gate-parks-forever-with-no-supported-wait`. The variant that hurts
// more is the one that waits on the LOG instead of the sentinel — grepping it for "GATE GREEN" /
// "GATE RED" reads a verdict the gate never gave, because those strings appear inside TEST NAMES
// (`gate-verdict-string-appears-in-test-names`). ADR-0328 D2 already names the rule this violates:
// bound the wait on the process's own exit status or a sentinel it writes, NEVER on a line scraped
// from its log (`asset:a-probe-cannot-falsify-the-predicate-it-borrows`).
//
// WHY A BOUNDED WAIT IS ALLOWED HERE AT ALL, given `asset:mechanical-waiting-never-pays-context-rent`
// and ADR-0328 D3's "no loop, no sleep, no watching". Both are about the READER of a handback and
// about a wait that HOLDS the job. Neither applies: since inc 6 item 1 `pnpm gate:bg` detaches, so
// this wait holds nothing — killing it kills no gate — and ADR-0328 D2 says in as many words that
// "a foreground call may WAIT on work; it may never be the only thing HOLDING it". What that clause
// then requires is the two properties below.
//
// THE TWO PROPERTIES, and both are the reason this is code rather than a documented loop:
//  1. BOUNDED, comfortably under the harness's 10-minute foreground ceiling — which ADR-0328
//     measured to be real, unvalidated (a `timeout` of 27 hours is accepted and silently clamped)
//     and nondeterministic at the boundary (one identical call was backgrounded, one took SIGTERM
//     with no notification at all). {@link DEFAULT_TIMEOUT_MS} is 8 minutes for that reason.
//  2. WHAT IT RETURNS IS THE RUN'S VERDICT, NEVER THE WAITER'S. A wait that expires is UNVERIFIED —
//     not a pass, not a fail — and {@link isVerdict} is still the only predicate that says whether
//     an outcome may be cited. Expiry is reported as its own thing and, at the command layer, as its
//     own reserved exit code; it can never be read as either verdict.
//
// PURE BY INJECTION ({@link WaitIo}) so the loop is proven with no real sleeping and no gate run:
// every test below runs a whole 8-minute wait in microseconds against a fake clock.

import {
  isVerdict,
  normalizeHandle,
  readDispatchHandle,
  type DispatchHandleReading,
  type HandleIo,
} from "./dispatch-handle.js";

/**
 * The default bound: 8 minutes. Deliberately UNDER the 10-minute foreground ceiling ADR-0328
 * measured, not at it — at the ceiling the behaviour is nondeterministic and one of the two observed
 * outcomes is a SIGTERM with no notification, which is a wait that reports nothing at all.
 */
export const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;

/** The hard ceiling on `--timeout`. Above this the harness, not this loop, decides what happens. */
export const MAX_TIMEOUT_MS = 9 * 60 * 1000;

/** How often the sentinel is re-read. Two seconds: a stat, and the caller is already blocked. */
export const DEFAULT_POLL_MS = 2000;

/** The clock and the sleep, injected so the whole wait is testable without waiting. */
export interface WaitIo extends HandleIo {
  /** Milliseconds since some fixed origin — only differences are used. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface WaitOptions {
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}

export interface WaitOutcome {
  /** The last reading taken — a verdict when `timedOut` is false, an honest non-answer otherwise. */
  readonly reading: DispatchHandleReading;
  /** How long the wait actually lasted, by the injected clock. */
  readonly waitedMs: number;
  /** True when the bound expired before the sentinel settled. NEVER a verdict. */
  readonly timedOut: boolean;
  /** How many times the sentinel was read. Reported so a caller can see the wait really polled. */
  readonly polls: number;
}

/**
 * Parse `--timeout <seconds>`. Returns the millisecond bound, or an error string naming what was
 * wrong — refused rather than silently clamped, because a silently-clamped bound is exactly the
 * harness behaviour ADR-0328 measured and called out as the thing that misleads a waiter.
 */
export function parseTimeoutSeconds(raw: string | undefined): { ms: number } | { error: string } {
  if (raw === undefined) return { ms: DEFAULT_TIMEOUT_MS };
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: `--timeout takes whole SECONDS; got ${JSON.stringify(raw)}` };
  }
  const ms = Number(trimmed) * 1000;
  if (ms <= 0) return { error: "--timeout must be at least 1 second" };
  if (ms > MAX_TIMEOUT_MS) {
    return {
      error:
        `--timeout ${trimmed}s exceeds the ${String(MAX_TIMEOUT_MS / 1000)}s ceiling. A foreground ` +
        "call cannot honestly hold longer than the harness's own limit — dispatch the job, let it " +
        "run detached, and read the handle again later.",
    };
  }
  return { ms };
}

/**
 * Block until the handle's sentinel settles, or until the bound expires — whichever comes first.
 *
 * Every non-verdict state keeps waiting, including `not-dispatched`: a caller that launches
 * `pnpm gate:bg` and waits in the next breath races the log file into existence, and answering that
 * race with "nothing was dispatched here" would be a false negative about somebody else's job.
 * `unreadable` also keeps waiting — the sentinel is written by one `printf`, so an unparseable read
 * is far likelier to be a half-written file than a permanently broken one.
 */
export async function waitForDispatchHandle(
  handle: string,
  io: WaitIo,
  options: WaitOptions = {},
): Promise<WaitOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const started = io.now();

  let polls = 0;
  for (;;) {
    const reading = readDispatchHandle(handle, io);
    polls += 1;
    if (isVerdict(reading)) {
      return { reading, waitedMs: io.now() - started, timedOut: false, polls };
    }
    const elapsed = io.now() - started;
    if (elapsed >= timeoutMs) {
      return { reading, waitedMs: elapsed, timedOut: true, polls };
    }
    // Never sleep past the bound: a wait that overshoots its own deadline is a wait whose caller
    // cannot predict when it returns, which is the property the harness ceiling makes load-bearing.
    await io.sleep(Math.min(pollMs, timeoutMs - elapsed));
  }
}

/**
 * The exit status a `--wait` invocation must leave behind.
 *
 * THE RUN'S OWN CODE, NOT THE WAITER'S — which is the whole point, and it is not decoration. The
 * gate reserves 3 for SKIP and 4 for PARTIAL RUN (`gate-runner.ts`), and collapsing either to a
 * generic 1 would destroy a distinction CLAUDE.md tells every session to read.
 *
 * An unsettled wait gets {@link UNVERIFIED_EXIT} instead — a code the gate itself never returns, so
 * "the wait expired" can never be mistaken for a verdict the job actually gave.
 */
export const UNVERIFIED_EXIT = 75;

export function waitExitCode(outcome: WaitOutcome): number {
  if (outcome.timedOut || !isVerdict(outcome.reading)) return UNVERIFIED_EXIT;
  return outcome.reading.exitCode ?? UNVERIFIED_EXIT;
}

/** The one-line summary of a wait, in the same register `describeReading` uses. */
export function describeWait(outcome: WaitOutcome): string {
  const seconds = (outcome.waitedMs / 1000).toFixed(0);
  if (!outcome.timedOut) return `settled after ${seconds}s (${String(outcome.polls)} reads)`;
  return `still unsettled after ${seconds}s (${String(outcome.polls)} reads) — the bound expired, the job did not`;
}

/** Re-exported so a caller of the wait never has to reach past it for the handle's two paths. */
export { normalizeHandle };
