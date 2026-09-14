// capture-navigation.ts — tells a COLD DEV SERVER apart from a BROKEN PAGE at the two points
// `capture.mjs` waits on its evidence page, and owns the bounded allowance the first wait runs under.
//
// THE DEFECT THIS REPLACES. `capture.mjs` navigated with
//
//     await page.goto(URL, { waitUntil: 'load' });
//
// and so inherited Playwright's 30 s default. `load` waits for the page's whole ES module graph,
// and a vite dev server that has only just started answers none of that graph until it has
// scanned, pre-bundled and transformed it. On a busy box that took longer than 30 s, and the run
// died with `page.goto: Timeout 30000ms exceeded` — the words a broken page produces — while `curl`
// returned 200 for the HTML shell, which pointed the operator further toward the wrong cause. The
// identical command, re-run against the same server, then passed. Filed twice, by two sessions,
// on the same day (friction `capture-goto-budget-assumes-a-warm-vite` and
// `capture-cold-vite-load-times-out-and-reads-as-a-page-failure`).
//
// WHAT A COLD START LOOKS LIKE FROM INSIDE THE BROWSER — measured, not assumed (2026-09-15,
// `directions.html`, a worktree's first vite, no `.vite` cache, idle box). The document answered in
// 118 ms. Then the first three module requests — `/@vite/client`, `/directions.tsx`,
// `/@react-refresh` — were HELD: in flight, unanswered, with nothing else happening, for 7.2 s
// while vite ran its dependency scan. No request errored and none failed. The other 58 modules then
// arrived inside 1.3 s and `load` fired at 8.6 s. So a cold start has an exact signature — module
// requests outstanding on the server, and no error anywhere — and it is precisely what a broken
// page does NOT look like. A broken page's modules ANSWER, with a 500, or its code throws; and
// `load` still fires, because a module script that failed does not hold `load`.
//
// THE POLICY, in three parts.
//
//  1. A BOUNDED ALLOWANCE for navigation to reach `load` — `DEFAULT_NAVIGATION_ALLOWANCE_MS`, sized
//     from a starvation ladder rather than from the idle figure. `ST_NAVIGATION_ALLOWANCE_MS` moves
//     it, validated and capped, because an allowance nobody can exceed is not an allowance.
//  2. A REFUSAL THAT READS THE NETWORK when either wait runs out or throws. Every request the page
//     makes is recorded (`watchNavigation`), and the refusal says what that record shows: modules
//     outstanding and no error anywhere is a COLD SERVER (exit 75 — the same server, run again);
//     an answered error, a failed request or a page error is a BROKEN PAGE (exit 1); nothing
//     outstanding and nothing wrong is a page that STALLED on its own (exit 1); and a navigation no
//     server answered at all says exactly that.
//  3. THE SETTLED-SIGNAL WAIT IS UNCHANGED — the same signal, the same 30 s. Two things around it
//     are new: a page that `load` has already shown to be broken is refused at `load`, rather than
//     after a 30 s wait that ends in a refusal anyway, and a settle that runs out is explained
//     rather than thrown as a bare Playwright timeout.
//
// NOTHING HERE CAN TURN A FAILED NAVIGATION INTO EVIDENCE. Every path out of this module is a
// refusal; `capture.mjs` prints it and exits before it has created its output directory.
//
// Pure apart from the event subscription, so all of it is provable under `node:test` with no
// browser — the ledger is fed through an `EventEmitter` standing in for the page.

/** The operator's knob. Tested by its LITERAL string, because the name is the interface. */
export const NAVIGATION_ALLOWANCE_ENV = 'ST_NAVIGATION_ALLOWANCE_MS';

/**
 * How long navigation may take to reach `load` before the refusal is written: twice the worst cold
 * start measured, and it is the LADDER that sizes it, not any one figure.
 *
 * Measured 2026-09-15 on `directions.html`. Every rung below the first is a FRESH vite (`--force`,
 * empty transform cache) with the navigation started the instant its port listened, which is the
 * worst case an operator meets:
 *
 *   a worktree's first vite ever (no `.vite` cache, cold file cache), idle box ...  `load` at  8.6 s
 *   vite pinned to one core, that core otherwise idle ............................  `load` at  5.4 s
 *   vite pinned to one core it shares with three busy processes ..................  `load` at 88.1 s
 *
 * The last rung is what other sessions' gates do to a dev server on a shared box — both filings met
 * this defect while gates were running — and it is nothing like proportional: a quarter of one core
 * cost sixteen times the idle figure, not four, because vite's work is many short bursts that each
 * queue behind CPU-bound neighbours. On that rung not even the DOCUMENT was answered for 40 s. The
 * original driver failed it at exactly 30 s (reproduced, `page.goto: Timeout 30000ms exceeded`), and
 * 180 s clears it twice over. It is not larger because this is also what a WEDGED server costs before
 * it is refused — per page, in `check:land-art`.
 */
export const DEFAULT_NAVIGATION_ALLOWANCE_MS = 180_000;

/** The ceiling on the override. An allowance must still be a bound. */
export const MAX_NAVIGATION_ALLOWANCE_MS = 1_800_000;

/** The settled-signal wait, carried over from `capture.mjs` unchanged. */
export const SETTLE_TIMEOUT_MS = 30_000;

/**
 * The exit code of a COLD refusal: `EX_TEMPFAIL`, which `db:up` already returns for "the start took
 * and it is still warming". Distinct from 1 so a caller can tell "run it again against the same
 * server" from "the page is broken" without parsing prose.
 */
export const COLD_START_EXIT_CODE = 75;

/** The exit code of every other refusal — what `capture.mjs`'s `fail()` has always returned. */
export const REFUSAL_EXIT_CODE = 1;

// --- the allowance ---------------------------------------------------------------------------

export type NavigationAllowance =
  | { readonly ok: true; readonly ms: number }
  | { readonly ok: false; readonly refusal: string };

/**
 * Parse `ST_NAVIGATION_ALLOWANCE_MS`.
 *
 * UNSET means the default. An explicit empty value is NOT read as unset — the same rule
 * `parseRequestedPanels` holds for `ST_PANEL_NAMES` — because `ST_NAVIGATION_ALLOWANCE_MS=` is far
 * more likely a variable that failed to expand than a request for the default.
 */
export function parseNavigationAllowance(raw: string | undefined): NavigationAllowance {
  if (raw === undefined) return { ok: true, ms: DEFAULT_NAVIGATION_ALLOWANCE_MS };
  const text = raw.trim();
  const accepted = `a whole number of milliseconds from 1 to ${MAX_NAVIGATION_ALLOWANCE_MS}`;
  if (!/^\d+$/.test(text)) {
    return {
      ok: false,
      refusal:
        `${NAVIGATION_ALLOWANCE_ENV}=${JSON.stringify(raw)} is not ${accepted} ` +
        `(unset it for the default, ${DEFAULT_NAVIGATION_ALLOWANCE_MS})`,
    };
  }
  const ms = Number(text);
  if (ms < 1 || ms > MAX_NAVIGATION_ALLOWANCE_MS) {
    return { ok: false, refusal: `${NAVIGATION_ALLOWANCE_ENV}=${text} is outside ${accepted}` };
  }
  return { ok: true, ms };
}

// --- the ledger ------------------------------------------------------------------------------

/** The slice of a Playwright `Request` the ledger reads. */
export interface ObservedRequest {
  url(): string;
  resourceType(): string;
  failure(): { errorText: string } | null;
}

/** The slice of a Playwright `Response` the ledger reads. */
export interface ObservedResponse {
  request(): ObservedRequest;
  status(): number;
  statusText(): string;
}

/** The slice of a Playwright `Page` the ledger subscribes to. A real `EventEmitter` satisfies it. */
export interface ObservablePage {
  on(event: 'request' | 'requestfinished' | 'requestfailed', listener: (request: ObservedRequest) => void): unknown;
  on(event: 'response', listener: (response: ObservedResponse) => void): unknown;
}

/** One request the page made, as the ledger saw it. */
export interface RequestRecord {
  readonly url: string;
  /** Chromium's classification. The module graph is `document` plus `script` — measured, every one. */
  readonly resourceType: string;
  /** Clock reading when the page issued it. */
  readonly startedAt: number;
  /** Clock reading when it finished or failed; `null` while it is still outstanding. */
  readonly endedAt: number | null;
  /** The HTTP status once headers arrived; `null` before that, and for a request that never got any. */
  readonly status: number | null;
  readonly statusText: string | null;
  /** Chromium's error text for a NETWORK-level failure. An HTTP error status is not a failure. */
  readonly failure: string | null;
}

/** Everything the ledger has seen, frozen at one clock reading. */
export interface NavigationSnapshot {
  readonly at: number;
  readonly requests: readonly RequestRecord[];
}

export interface NavigationWatch {
  snapshot(): NavigationSnapshot;
}

type LiveRecord = { -readonly [K in keyof RequestRecord]: RequestRecord[K] };

/**
 * Record every request the page makes from now on. Subscribe BEFORE `page.goto`, or the document and
 * the first modules — the very requests a cold server holds — are never seen.
 */
export function watchNavigation(page: ObservablePage, now: () => number = () => performance.now()): NavigationWatch {
  const live = new Map<ObservedRequest, LiveRecord>();
  page.on('request', (request) => {
    live.set(request, {
      url: request.url(),
      resourceType: request.resourceType(),
      startedAt: now(),
      endedAt: null,
      status: null,
      statusText: null,
      failure: null,
    });
  });
  page.on('response', (response) => {
    const record = live.get(response.request());
    if (record === undefined) return;
    record.status = response.status();
    record.statusText = response.statusText();
  });
  page.on('requestfinished', (request) => {
    const record = live.get(request);
    if (record !== undefined) record.endedAt = now();
  });
  page.on('requestfailed', (request) => {
    const record = live.get(request);
    if (record === undefined) return;
    record.endedAt = now();
    record.failure = request.failure()?.errorText ?? 'failed, and Chromium gave no error text';
  });
  return { snapshot: () => ({ at: now(), requests: [...live.values()].map((r) => ({ ...r })) }) };
}

// --- the verdict -----------------------------------------------------------------------------

export type NavigationVerdict = 'cold' | 'broken' | 'stalled' | 'unreachable';

export interface NavigationRefusal {
  readonly verdict: NavigationVerdict;
  readonly exitCode: number;
  /** Printed after `REFUSED:`. Short on purpose: `check:land-art` keeps only capture's last 14 lines. */
  readonly message: string;
}

export interface NavigationFailure {
  /** The page being captured. */
  readonly url: string;
  /** Which wait ended: navigating to `load`, or the settled signal after it. */
  readonly phase: 'navigation' | 'settle';
  /** What Playwright threw. */
  readonly error: unknown;
  /** The bound that wait ran under, in ms. */
  readonly limitMs: number;
  readonly snapshot: NavigationSnapshot;
  /** `capture.mjs`'s own console-error and page-error collection. */
  readonly consoleErrors: readonly string[];
}

/**
 * VITE'S TRANSIENT 504s — sent while the dev server is part-way through changing its own state, and
 * retried by vite's client; never a verdict on the page. From vite 6.4.3's transform middleware:
 * "Outdated Optimize Dep" when the optimizer re-bundled under a request, "Outdated Request" when the
 * server closed under one. Its third 504, "Optimize Deps Processing Error", is esbuild FAILING to
 * pre-bundle a dependency, which no retry fixes — so it is deliberately absent.
 */
const VITE_TRANSIENT_504: ReadonlySet<string> = new Set(['Outdated Optimize Dep', 'Outdated Request']);

/** Chromium cancelling a request it no longer wants — a reload, a navigation away, a closing browser. */
const CANCELLED = 'net::ERR_ABORTED';

/**
 * The console line Chromium logs for EVERY failed subresource load. The ledger holds the same event
 * with its URL, so the echo adds nothing — and counting it would re-admit vite's transient 504s as
 * page errors through the side door.
 */
const RESOURCE_ECHO = /^Failed to load resource:/;

const MAX_LISTED = 4;

/** What makes a page BROKEN rather than slow: anything that ANSWERED wrong, FAILED, or THREW. */
function brokenEvidence(snapshot: NavigationSnapshot, consoleErrors: readonly string[]): string[] {
  const evidence: string[] = [];
  for (const r of snapshot.requests) {
    const transient = r.status === 504 && VITE_TRANSIENT_504.has(r.statusText ?? '');
    // THE STATUS DECIDES FIRST, even when Chromium ALSO reports the request cancelled. Measured in a
    // real browser: a module script answered 500 is recorded as BOTH `500 Internal Server Error` and
    // `net::ERR_ABORTED`, because Chromium abandons the body of a module response that is not OK.
    // The first version read the failure first, exempted the cancellation, and filed a page whose
    // module had just answered 500 as one where "nothing errored".
    if (r.status !== null && r.status >= 400 && !transient) {
      evidence.push(`${pathOf(r.url)} answered ${r.status} ${r.statusText ?? ''}`.trimEnd());
    } else if (r.failure !== null && r.failure !== CANCELLED) {
      evidence.push(`${pathOf(r.url)} failed: ${r.failure}`);
    }
  }
  for (const text of consoleErrors) {
    if (!RESOURCE_ECHO.test(text)) evidence.push(`the page reported: ${firstLine(text)}`);
  }
  return evidence;
}

/**
 * The refusal for a page that reached `load` already broken, or `null` when nothing is wrong yet.
 * Refusing here rather than after the settled wait changes no verdict — `capture.mjs` refuses any
 * page that logs an error — it only stops a broken page costing a 30 s wait first.
 */
export function explainLoadedPage(
  url: string,
  snapshot: NavigationSnapshot,
  consoleErrors: readonly string[],
): NavigationRefusal | null {
  const evidence = brokenEvidence(snapshot, consoleErrors);
  if (evidence.length === 0) return null;
  return {
    verdict: 'broken',
    exitCode: REFUSAL_EXIT_CODE,
    message: lines(
      `${url} reached \`load\` BROKEN, so it is refused before the settled wait rather than after it:`,
      listed(evidence),
    ),
  };
}

/** The refusal for a wait that ran out or threw — see the header for what each verdict means. */
export function explainNavigationFailure(failure: NavigationFailure): NavigationRefusal {
  const { url, phase, snapshot } = failure;
  const cause = firstLine(failure.error instanceof Error ? failure.error.message : String(failure.error));
  const timedOut = failure.error instanceof Error && failure.error.name === 'TimeoutError';
  const answered = snapshot.requests.filter((r) => r.status !== null);
  const outstanding = snapshot.requests.filter((r) => r.endedAt === null).sort((a, b) => a.startedAt - b.startedAt);
  const modules = outstanding.filter((r) => r.resourceType === 'script' || r.resourceType === 'document');
  const evidence = brokenEvidence(snapshot, failure.consoleErrors);

  const limit = seconds(failure.limitMs);
  const what =
    phase === 'navigation'
      ? timedOut
        ? `navigation to ${url} did not reach \`load\` within ${limit}`
        : `navigation to ${url} failed (${cause})`
      : timedOut
        ? `${url} loaded, but window.__stExperimentSettled was not raised within ${limit}`
        : `${url} loaded, but the settled wait failed (${cause})`;

  // NO SERVER AT ALL. Chromium names a network error and NOTHING answered, so there is no page to
  // judge and no cold start to wait out.
  const networkError = /net::ERR_[A-Z_]+/.exec(cause)?.[0];
  if (phase === 'navigation' && !timedOut && networkError !== undefined && answered.length === 0) {
    return {
      verdict: 'unreachable',
      exitCode: REFUSAL_EXIT_CODE,
      message: lines(`nothing answered at ${url} (${networkError}) — no dev server is serving it.`, [
        'Start the harness from THIS worktree (`vite harness --port <free port>`) and point ST_HARNESS_URL at it.',
      ]),
    };
  }

  if (evidence.length > 0) {
    const also = modules.length > 0 ? [`(and ${count(modules.length, 'module request')} still outstanding)`] : [];
    return {
      verdict: 'broken',
      exitCode: REFUSAL_EXIT_CODE,
      message: lines(`${what}, and the page is BROKEN — this is not a cold dev server:`, [...listed(evidence), ...also]),
    };
  }

  const [oldest] = modules;
  if (oldest !== undefined) {
    const finished = snapshot.requests.flatMap((r) => (r.endedAt === null ? [] : [r.endedAt]));
    const lastAnswer = finished.length > 0 ? `the last ${seconds(snapshot.at - Math.max(...finished))} ago` : 'none yet';
    return {
      verdict: 'cold',
      exitCode: COLD_START_EXIT_CODE,
      message: lines(`${what}, and what is outstanding is a COLD DEV SERVER, not a broken page:`, [
        `${count(modules.length, 'module request')} unanswered, the oldest ${pathOf(oldest.url)} for ` +
          `${seconds(snapshot.at - oldest.startedAt)}; ${answered.length} answered (${lastAnswer}), none with an error, and nothing threw.`,
        'A vite serving a page for the first time holds its module requests while it scans, pre-bundles and transforms the graph.',
        phase === 'navigation'
          ? `Leave THIS server running (a restart discards the transform cache and starts over) and re-run, or raise ${NAVIGATION_ALLOWANCE_ENV} (now ${failure.limitMs}). A re-run that hangs identically is a wedged server, not a cold one.`
          : 'These are modules the page imported after `load`. Leave THIS server running and re-run.',
      ]),
    };
  }

  const waiting = outstanding.map((r) => `${pathOf(r.url)} (${r.resourceType}, ${seconds(snapshot.at - r.startedAt)})`);
  return {
    verdict: 'stalled',
    exitCode: REFUSAL_EXIT_CODE,
    message: lines(
      phase === 'navigation'
        ? `${what}, yet no module is outstanding and nothing errored (${answered.length} answered). A cold server holds module requests open; this page stopped short of \`load\` on its own.`
        : `${what}, yet no module is outstanding and nothing errored (${answered.length} answered). The dev server is not the hold-up; the page's own settle never fired.`,
      waiting.length > 0 ? [`still waiting on: ${waiting.slice(0, MAX_LISTED).join(', ')}`] : [],
    ),
  };
}

// --- formatting ------------------------------------------------------------------------------

function lines(head: string, body: readonly string[]): string {
  return [head, ...body].join('\n  ');
}

function listed(items: readonly string[]): string[] {
  const shown = items.slice(0, MAX_LISTED);
  return items.length > MAX_LISTED ? [...shown, `(+${items.length - MAX_LISTED} more)`] : shown;
}

function firstLine(text: string): string {
  return (text.split('\n', 1)[0] ?? '').trim();
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** The path, without the origin or vite's `?v=` cache-buster; the tail, when an `/@fs/` path is long. */
function pathOf(url: string): string {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Not a URL Chromium would issue; print it as it came.
  }
  return path.length > 96 ? `…${path.slice(-95)}` : path;
}
