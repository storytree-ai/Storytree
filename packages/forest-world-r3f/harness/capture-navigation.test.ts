// capture-navigation.test.ts — a COLD dev server and a BROKEN page must never produce the same
// refusal, and navigation must never again run on Playwright's unstated 30 s default.
//
// THE PROPERTY EVERYTHING HERE EXISTS FOR: the SAME Playwright timeout, thrown after the SAME wait,
// is refused as a cold server when the page's module requests are outstanding and nothing went
// wrong, and as a broken page when something answered wrong, failed or threw. The first test states
// it over one ledger that differs by a single response; the rest pin each rule it rests on.
//
// THE FIXTURES ARE MEASURED, not invented (2026-09-15, `directions.html` on a harness vite, recorded
// by a network probe). `measuredColdAt7s` is an idle box's fresh vite seven seconds into a first
// load, with three module requests held while the dependency scan ran. `measuredStarvedAt30s` is
// the same page on a vite sharing its core with three busy processes, at the instant Playwright's
// old 30 s default fired — when not even the DOCUMENT had been answered. That second shape is why
// an outstanding document counts as module-graph work: a starved server can hold the page itself.

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  COLD_START_EXIT_CODE,
  DEFAULT_NAVIGATION_ALLOWANCE_MS,
  MAX_NAVIGATION_ALLOWANCE_MS,
  NAVIGATION_ALLOWANCE_ENV,
  REFUSAL_EXIT_CODE,
  SETTLE_TIMEOUT_MS,
  explainLoadedPage,
  explainNavigationFailure,
  parseNavigationAllowance,
  watchNavigation,
  type NavigationFailure,
  type NavigationSnapshot,
  type ObservedRequest,
  type ObservedResponse,
  type RequestRecord,
} from './capture-navigation.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://127.0.0.1:5291';
const PAGE_URL = `${ORIGIN}/directions.html`;

/** A request as the ledger records it. Unless told otherwise: a script, still outstanding. */
function record(path: string, fields: Partial<RequestRecord>): RequestRecord {
  return {
    url: `${ORIGIN}${path}`,
    resourceType: 'script',
    startedAt: 0,
    endedAt: null,
    status: null,
    statusText: null,
    failure: null,
    ...fields,
  };
}

function withRecord(snapshot: NavigationSnapshot, extra: RequestRecord): NavigationSnapshot {
  return { ...snapshot, requests: [...snapshot.requests, extra] };
}

/** An idle box, a fresh vite, seven seconds into the first load of `directions.html`. */
const measuredColdAt7s: NavigationSnapshot = {
  at: 7_000,
  requests: [
    record('/directions.html', { resourceType: 'document', startedAt: 7, endedAt: 125, status: 200, statusText: 'OK' }),
    record('/@vite/client', { startedAt: 112 }),
    record('/directions.tsx', { startedAt: 112 }),
    record('/@react-refresh', { startedAt: 125 }),
  ],
};

/** The same page on a starved vite, at the moment the old 30 s default fired. Nothing had answered. */
const measuredStarvedAt30s: NavigationSnapshot = {
  at: 30_000,
  requests: [record('/directions.html', { resourceType: 'document', startedAt: 7 })],
};

/** A page whose every request answered and finished. */
const answeredPage: NavigationSnapshot = {
  at: 12_000,
  requests: [
    record('/directions.html', { resourceType: 'document', startedAt: 7, endedAt: 125, status: 200, statusText: 'OK' }),
    record('/directions.tsx', { startedAt: 112, endedAt: 7_318, status: 200, statusText: 'OK' }),
    record('/@vite/client', { startedAt: 112, endedAt: 7_450, status: 200, statusText: 'OK' }),
  ],
};

/**
 * Playwright's `TimeoutError`, exactly: `playwright-core` 1.60 defines it as
 * `class extends Error { constructor(message) { super(message); this.name = "TimeoutError"; } }`
 * (`lib/coreBundle.js`), so a renamed `Error` is the real shape rather than an approximation of it.
 */
function timeoutError(message: string): Error {
  const error = new Error(message);
  error.name = 'TimeoutError';
  return error;
}

function failure(fields: Partial<NavigationFailure> & Pick<NavigationFailure, 'snapshot'>): NavigationFailure {
  return {
    url: PAGE_URL,
    phase: 'navigation',
    error: timeoutError(`page.goto: Timeout ${DEFAULT_NAVIGATION_ALLOWANCE_MS}ms exceeded.\nCall log:\n  - navigating`),
    limitMs: DEFAULT_NAVIGATION_ALLOWANCE_MS,
    consoleErrors: [],
    ...fields,
  };
}

// --- the property ------------------------------------------------------------------------------

test('the same timeout is refused as a COLD server or a BROKEN page by what the network shows, and nothing else', () => {
  const cold = explainNavigationFailure(failure({ snapshot: measuredColdAt7s }));
  // The identical ledger, error and wait — except that one of the held modules ANSWERED, with a 500.
  // It is recorded exactly as Chromium records one (measured in a real browser against a module that
  // answers 500): the status AND a cancellation, because Chromium abandons the body of a module
  // response that is not OK. The first classifier read that cancellation, exempted it, and called
  // this page one where nothing had errored.
  const oneAnswered500: NavigationSnapshot = {
    ...measuredColdAt7s,
    requests: measuredColdAt7s.requests.map((r) =>
      r.url.endsWith('/directions.tsx')
        ? { ...r, endedAt: 6_900, status: 500, statusText: 'Internal Server Error', failure: 'net::ERR_ABORTED' }
        : r,
    ),
  };
  const broken = explainNavigationFailure(failure({ snapshot: oneAnswered500 }));

  assert.equal(cold.verdict, 'cold');
  assert.equal(cold.exitCode, COLD_START_EXIT_CODE);
  assert.match(cold.message, /COLD DEV SERVER, not a broken page/);
  assert.doesNotMatch(cold.message, /BROKEN/);

  assert.equal(broken.verdict, 'broken');
  assert.equal(broken.exitCode, REFUSAL_EXIT_CODE);
  assert.match(broken.message, /the page is BROKEN/);
  assert.match(broken.message, /\/directions\.tsx answered 500 Internal Server Error/);
  assert.doesNotMatch(broken.message, /COLD/);

  // The exit codes are the machine-readable half of the same distinction, so they must differ too.
  assert.notEqual(COLD_START_EXIT_CODE, REFUSAL_EXIT_CODE);
});

test('a starved server holding even the DOCUMENT is refused as cold, never as a missing server', () => {
  const refusal = explainNavigationFailure(
    failure({ snapshot: measuredStarvedAt30s, limitMs: 30_000, error: timeoutError('page.goto: Timeout 30000ms exceeded.') }),
  );
  assert.equal(refusal.verdict, 'cold');
  assert.match(refusal.message, /the oldest \/directions\.html for 30\.0 s; 0 answered \(none yet\)/);
});

test('a cold refusal names what is outstanding, how long, and what the operator should do', () => {
  const refusal = explainNavigationFailure(failure({ snapshot: measuredColdAt7s, limitMs: 120_000 }));
  assert.match(refusal.message, /did not reach `load` within 120\.0 s/);
  assert.match(refusal.message, /3 module requests unanswered, the oldest \/@vite\/client for 6\.9 s/);
  assert.match(refusal.message, /1 answered \(the last 6\.9 s ago\)/);
  assert.match(refusal.message, /Leave THIS server running/);
  assert.ok(refusal.message.includes('raise ST_NAVIGATION_ALLOWANCE_MS (now 120000)'), refusal.message);
});

test('the oldest outstanding request is found by its age, not by where it sits in the snapshot', () => {
  // `watchNavigation` records requests in the order they started, so its own snapshots are already
  // in age order — but a snapshot is a plain value, and the refusal must not lean on that accident.
  // (Found by seeding the fault: with the sort removed, every other test here still passed.)
  const listedNewestFirst: NavigationSnapshot = {
    at: 7_000,
    requests: [record('/late-module.ts', { startedAt: 5_000 }), record('/early-module.ts', { startedAt: 100 })],
  };
  assert.match(
    explainNavigationFailure(failure({ snapshot: listedNewestFirst })).message,
    /the oldest \/early-module\.ts for 6\.9 s/,
  );
});

// --- the rules the property rests on ---------------------------------------------------------------

interface BrokenCase {
  readonly name: string;
  readonly snapshot: NavigationSnapshot;
  readonly consoleErrors: readonly string[];
  readonly evidence: RegExp;
}

test('an answered error, a failed request, a page error or a failed pre-bundle each make the page BROKEN', () => {
  const cases: readonly BrokenCase[] = [
    {
      name: 'a module answered 404',
      snapshot: withRecord(measuredColdAt7s, record('/missing.ts', { startedAt: 200, endedAt: 300, status: 404, statusText: 'Not Found' })),
      consoleErrors: [],
      evidence: /\/missing\.ts answered 404 Not Found/,
    },
    {
      name: 'a request failed at the network level',
      snapshot: withRecord(measuredColdAt7s, record('/three.js', { startedAt: 200, endedAt: 300, failure: 'net::ERR_CONNECTION_RESET' })),
      consoleErrors: [],
      evidence: /\/three\.js failed: net::ERR_CONNECTION_RESET/,
    },
    {
      name: 'the page threw',
      snapshot: measuredColdAt7s,
      consoleErrors: ['TypeError: cannot read properties of undefined\n    at directions.tsx:12:3'],
      evidence: /the page reported: TypeError: cannot read properties of undefined$/m,
    },
    {
      name: "vite's optimizer failed to pre-bundle a dependency",
      snapshot: withRecord(
        measuredColdAt7s,
        record('/node_modules/.vite/deps/three.js', { startedAt: 200, endedAt: 300, status: 504, statusText: 'Optimize Deps Processing Error' }),
      ),
      consoleErrors: [],
      evidence: /three\.js answered 504 Optimize Deps Processing Error/,
    },
  ];
  for (const c of cases) {
    const refusal = explainNavigationFailure(failure({ snapshot: c.snapshot, consoleErrors: c.consoleErrors }));
    assert.equal(refusal.verdict, 'broken', c.name);
    assert.match(refusal.message, c.evidence, c.name);
    // The held modules are still reported, so a broken page that is ALSO slow is not hidden.
    assert.match(refusal.message, /still outstanding/, c.name);
  }
});

test("a cancelled request, vite's transient 504s and Chromium's console echo of them never make a page BROKEN", () => {
  const cancelled = withRecord(measuredColdAt7s, record('/stale.js', { startedAt: 200, endedAt: 300, failure: 'net::ERR_ABORTED' }));
  assert.equal(explainNavigationFailure(failure({ snapshot: cancelled })).verdict, 'cold');

  for (const statusText of ['Outdated Optimize Dep', 'Outdated Request']) {
    const transient = record('/node_modules/.vite/deps/react.js', { startedAt: 300, endedAt: 400, status: 504, statusText });
    const echo = [`Failed to load resource: the server responded with a status of 504 (${statusText})`];
    assert.equal(
      explainNavigationFailure(failure({ snapshot: withRecord(measuredColdAt7s, transient), consoleErrors: echo })).verdict,
      'cold',
      statusText,
    );
    assert.equal(explainLoadedPage(PAGE_URL, withRecord(answeredPage, transient), echo), null, statusText);
  }
});

test('nothing outstanding and nothing wrong is refused as STALLED, never as cold', () => {
  const refusal = explainNavigationFailure(failure({ snapshot: answeredPage }));
  assert.equal(refusal.verdict, 'stalled');
  assert.equal(refusal.exitCode, REFUSAL_EXIT_CODE);
  assert.match(refusal.message, /stopped short of `load` on its own/);
  assert.doesNotMatch(refusal.message, /COLD/);

  // An outstanding IMAGE is not module-graph work: vite compiles modules, not pictures.
  const imageHeld = withRecord(answeredPage, record('/reference/approved.png', { resourceType: 'image', startedAt: 500 }));
  const held = explainNavigationFailure(failure({ snapshot: imageHeld }));
  assert.equal(held.verdict, 'stalled');
  assert.match(held.message, /still waiting on: \/reference\/approved\.png \(image, 11\.5 s\)/);
});

test('a settle that runs out keeps its 30 s bound and is explained against the settled signal', () => {
  assert.equal(SETTLE_TIMEOUT_MS, 30_000);
  const settle = (consoleErrors: readonly string[], snapshot: NavigationSnapshot) =>
    explainNavigationFailure(
      failure({
        phase: 'settle',
        limitMs: SETTLE_TIMEOUT_MS,
        error: timeoutError('page.waitForFunction: Timeout 30000ms exceeded.'),
        snapshot,
        consoleErrors,
      }),
    );

  const quiet = settle([], answeredPage);
  assert.equal(quiet.verdict, 'stalled');
  assert.match(quiet.message, /window\.__stExperimentSettled was not raised within 30\.0 s/);
  assert.match(quiet.message, /the page's own settle never fired/);

  assert.equal(settle(['Error: WebGL context lost'], answeredPage).verdict, 'broken');

  const lateImport = settle([], withRecord(answeredPage, record('/late-chunk.ts', { startedAt: 9_000 })));
  assert.equal(lateImport.verdict, 'cold');
  assert.match(lateImport.message, /imported after `load`/);
});

test('a navigation no server answered is UNREACHABLE; the same error after the document answered is BROKEN', () => {
  const refusedDoc: NavigationSnapshot = {
    at: 40,
    requests: [record('/directions.html', { resourceType: 'document', startedAt: 5, endedAt: 30, failure: 'net::ERR_CONNECTION_REFUSED' })],
  };
  const unreachable = explainNavigationFailure(
    failure({ snapshot: refusedDoc, error: new Error(`page.goto: net::ERR_CONNECTION_REFUSED at ${PAGE_URL}\nCall log:`) }),
  );
  assert.equal(unreachable.verdict, 'unreachable');
  assert.equal(unreachable.exitCode, REFUSAL_EXIT_CODE);
  assert.ok(unreachable.message.startsWith(`nothing answered at ${PAGE_URL} (net::ERR_CONNECTION_REFUSED)`), unreachable.message);

  const diedMidLoad: NavigationSnapshot = {
    at: 900,
    requests: [
      record('/directions.html', { resourceType: 'document', startedAt: 5, endedAt: 40, status: 200, statusText: 'OK' }),
      record('/directions.tsx', { startedAt: 50, endedAt: 800, failure: 'net::ERR_CONNECTION_RESET' }),
    ],
  };
  const died = explainNavigationFailure(
    failure({ snapshot: diedMidLoad, error: new Error(`page.goto: net::ERR_CONNECTION_RESET at ${PAGE_URL}`) }),
  );
  assert.equal(died.verdict, 'broken');
});

test('a page that reaches `load` broken is refused at `load`; a healthy one is not', () => {
  assert.equal(explainLoadedPage(PAGE_URL, answeredPage, []), null);

  const typo: NavigationSnapshot = {
    at: 200,
    requests: [record('/directons.html', { resourceType: 'document', startedAt: 5, endedAt: 20, status: 404, statusText: 'Not Found' })],
  };
  const notFound = explainLoadedPage(`${ORIGIN}/directons.html`, typo, []);
  assert.equal(notFound?.verdict, 'broken');
  assert.match(notFound?.message ?? '', /\/directons\.html answered 404 Not Found/);

  assert.equal(explainLoadedPage(PAGE_URL, answeredPage, ['Error: simulated page failure'])?.verdict, 'broken');
});

// --- the allowance -----------------------------------------------------------------------------

test('the allowance knob is ST_NAVIGATION_ALLOWANCE_MS, by its literal name', () => {
  assert.equal(NAVIGATION_ALLOWANCE_ENV, 'ST_NAVIGATION_ALLOWANCE_MS');
});

test('an unset allowance is the default; a set one must be a whole number of ms inside the cap', () => {
  assert.deepEqual(parseNavigationAllowance(undefined), { ok: true, ms: DEFAULT_NAVIGATION_ALLOWANCE_MS });
  assert.deepEqual(parseNavigationAllowance('90000'), { ok: true, ms: 90_000 });
  assert.deepEqual(parseNavigationAllowance(' 5000 '), { ok: true, ms: 5_000 });
  assert.deepEqual(parseNavigationAllowance(String(MAX_NAVIGATION_ALLOWANCE_MS)), { ok: true, ms: MAX_NAVIGATION_ALLOWANCE_MS });
  for (const bad of ['', '   ', 'abc', '0', '-5', '1.5', '1e5', '90s', String(MAX_NAVIGATION_ALLOWANCE_MS + 1)]) {
    const parsed = parseNavigationAllowance(bad);
    assert.equal(parsed.ok, false, `${JSON.stringify(bad)} was accepted`);
    assert.ok(!parsed.ok);
    assert.ok(parsed.refusal.startsWith('ST_NAVIGATION_ALLOWANCE_MS='), parsed.refusal);
  }
});

test('the default allowance outlasts the worst cold start measured by a clear margin, and is still a bound', () => {
  // Measured 2026-09-15: `load` at 88.1 s on a fresh vite sharing its one core with three busy
  // processes — the starved end of the ladder in the module header. The idle end was 5.4 s.
  const worstMeasuredColdLoadMs = 88_142;
  assert.ok(
    DEFAULT_NAVIGATION_ALLOWANCE_MS >= 2 * worstMeasuredColdLoadMs,
    `the default ${DEFAULT_NAVIGATION_ALLOWANCE_MS} ms is under twice the ${worstMeasuredColdLoadMs} ms starved cold start`,
  );
  assert.ok(DEFAULT_NAVIGATION_ALLOWANCE_MS <= MAX_NAVIGATION_ALLOWANCE_MS);
});

// --- the ledger ----------------------------------------------------------------------------------

/** A Playwright-shaped request. Its IDENTITY is the key the ledger files every later event under. */
class ProbeRequest implements ObservedRequest {
  readonly path: string;
  readonly type: string;
  #failedWith: string | null = null;
  constructor(path: string, type: string) {
    this.path = path;
    this.type = type;
  }
  url(): string {
    return `${ORIGIN}${this.path}`;
  }
  resourceType(): string {
    return this.type;
  }
  failure(): { errorText: string } | null {
    return this.#failedWith === null ? null : { errorText: this.#failedWith };
  }
  fail(errorText: string): void {
    this.#failedWith = errorText;
  }
}

function answer(request: ObservedRequest, status: number, statusText: string): ObservedResponse {
  return { request: () => request, status: () => status, statusText: () => statusText };
}

test('the ledger files each request by identity: outstanding, answered with a status, or failed', () => {
  const page = new EventEmitter();
  let clock = 0;
  const watch = watchNavigation(page, () => clock);
  const doc = new ProbeRequest('/directions.html', 'document');
  const client = new ProbeRequest('/@vite/client', 'script');
  const lost = new ProbeRequest('/three.js', 'script');

  clock = 7;
  page.emit('request', doc);
  clock = 112;
  page.emit('request', client);
  clock = 118;
  page.emit('response', answer(doc, 200, 'OK'));
  clock = 125;
  page.emit('requestfinished', doc);
  clock = 130;
  page.emit('request', lost);
  clock = 140;
  lost.fail('net::ERR_CONNECTION_RESET');
  page.emit('requestfailed', lost);
  clock = 7_000;

  const snapshot = watch.snapshot();
  assert.equal(snapshot.at, 7_000);
  assert.deepEqual(snapshot.requests, [
    record('/directions.html', { resourceType: 'document', startedAt: 7, endedAt: 125, status: 200, statusText: 'OK' }),
    record('/@vite/client', { startedAt: 112 }),
    record('/three.js', { startedAt: 130, endedAt: 140, failure: 'net::ERR_CONNECTION_RESET' }),
  ]);

  // A response for a request the ledger never saw is ignored rather than invented.
  page.emit('response', answer(new ProbeRequest('/unseen.js', 'script'), 500, 'Internal Server Error'));
  assert.equal(watch.snapshot().requests.length, 3);

  // A snapshot is a copy: an event after it was taken does not rewrite it.
  clock = 7_450;
  page.emit('requestfinished', client);
  assert.equal(snapshot.requests[1]?.endedAt, null);
  assert.equal(watch.snapshot().requests[1]?.endedAt, 7_450);
});

test('the measured cold start, replayed through the ledger, is refused as cold', () => {
  const page = new EventEmitter();
  let clock = 0;
  const watch = watchNavigation(page, () => clock);
  const doc = new ProbeRequest('/directions.html', 'document');
  clock = 7;
  page.emit('request', doc);
  clock = 112;
  page.emit('request', new ProbeRequest('/@vite/client', 'script'));
  page.emit('request', new ProbeRequest('/directions.tsx', 'script'));
  clock = 118;
  page.emit('response', answer(doc, 200, 'OK'));
  clock = 125;
  page.emit('requestfinished', doc);
  page.emit('request', new ProbeRequest('/@react-refresh', 'script'));
  clock = 7_000;

  const refusal = explainNavigationFailure(failure({ snapshot: watch.snapshot() }));
  assert.equal(refusal.verdict, 'cold');
  assert.equal(refusal.exitCode, COLD_START_EXIT_CODE);
});

// --- the source guard ------------------------------------------------------------------------------

test('the capture driver navigates under its own stated allowance and explains both waits through this module', () => {
  // A narrow guard with a narrow claim, in the shape of `capture-panels.test.ts`'s: it proves the
  // driver still NAMES the pieces, so a revert cannot land quietly. That the driver uses them correctly
  // is the live capture runs recorded in the increment's evidence, and `check:land-art`.
  //
  // capture navigates through `gotoServedTree` (`served-tree.ts`), which already gives a driver that
  // states no bound this module's measured default. So what is pinned here is capture's OWN allowance —
  // the one `ST_NAVIGATION_ALLOWANCE_MS` moves — and not merely the absence of Playwright's 30 s.
  const driver = readFileSync(join(HERE, 'capture.mjs'), 'utf8');
  const navigations = [...driver.matchAll(/gotoServedTree\(page, URL, \{([^}]*)\}/g)].map((m) => m[1] ?? '');
  assert.ok(navigations.length > 0, 'capture.mjs never navigates through gotoServedTree — this guard would check nothing');
  for (const options of navigations) {
    assert.ok(
      options.includes('timeout: allowance.ms'),
      `capture.mjs navigates with {${options}}, which is not the allowance ${NAVIGATION_ALLOWANCE_ENV} moves`,
    );
  }
  for (const name of ['parseNavigationAllowance', 'watchNavigation', 'explainNavigationFailure', 'explainLoadedPage', 'SETTLE_TIMEOUT_MS']) {
    assert.ok(driver.includes(name), `capture.mjs does not use ${name} from capture-navigation`);
  }
});
