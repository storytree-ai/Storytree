// served-tree.test.ts — a capture must refuse a page served from ANY tree but its own, and must never
// read a server that says nothing about its tree as one that said the right thing.
//
// THE PROPERTY EVERYTHING HERE EXISTS FOR: ONE stamp — the one the measured incident's server would
// have sent — is refused as a FOREIGN tree when the capture runs from the worktree that was actually
// capturing, and accepted when it runs from the tree the stamp names. The first test states it; the
// rest pin each rule it rests on, above all that an ABSENT stamp is a refusal, because every harness
// squatting the shared port on the day this landed predates the stamp.
//
// THE FIXTURE, and which parts of it are measured. Friction
// `capture-default-url-is-a-port-a-sibling-worktree-may-own` (2026-08-22) recorded the listener on :5184
// as pid 45060 serving `confident-brahmagupta-b5b8f2`'s harness while the capture ran from
// `great-chaplygin-4e32d5`. The directories and the pid below are those. The start time, branch and
// commit are illustrative — the filing session recorded none of them, which is part of why the stamp
// now carries them.
//
// THE DRIVERS' HALF, added the day after. `capture.mjs` was the only driver that read the stamp; forty
// others measured whatever answered their port, and on 2026-08-30 `shipped-land-measure.mjs` measured an
// orphaned sibling's older tree on :5231. Every driver now navigates through `gotoServedTree`. Its policy
// is stated below by BEHAVIOUR, against a fake page that emits the document response DURING `goto` — so a
// guard that subscribed late sees nothing — and the source guard at the bottom refuses any driver that
// navigates another way.

import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { transformWithEsbuild, type PluginOption } from 'vite';

import { DEFAULT_NAVIGATION_ALLOWANCE_MS } from './capture-navigation.js';
import {
  HARNESS_DIRECTORY,
  PROCESS_SOURCES,
  SERVED_TREE_HEADER,
  SERVED_TREE_PLUGIN,
  ServedTreeRefused,
  canonicalDirectory,
  checkServedTree,
  encodeServedTree,
  gotoServedTree,
  installServedTreeStamp,
  readServedTree,
  readServedTreeHeader,
  sameDirectory,
  watchServedTree,
  type HarnessWaitUntil,
  type ServedTree,
  type ServedTreeCheck,
  type ServedTreeObservation,
  type ServedTreeSources,
  type StampHandler,
  type StampedResponse,
  type StatedNavigation,
} from './served-tree.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_URL = 'http://localhost:5184/compare.html';

const SIBLING_HARNESS = 'C:\\code\\storytree\\.claude\\worktrees\\confident-brahmagupta-b5b8f2\\packages\\forest-world-r3f\\harness';
const CAPTURING_HARNESS = 'C:\\code\\storytree\\.claude\\worktrees\\great-chaplygin-4e32d5\\packages\\forest-world-r3f\\harness';

/** The stamp the squatting server would have sent: its own harness, its own pid. */
const siblingTree: ServedTree = {
  directory: SIBLING_HARNESS,
  pid: 45060,
  startedAt: '2026-08-21T23:40:12.000Z',
  branchAtStart: 'claude/confident-brahmagupta-b5b8f2',
  commitAtStart: '9f3c2b1a7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a',
};

function stamped(tree: ServedTree): ServedTreeObservation {
  return { observed: true, header: encodeServedTree(tree) };
}

/** The question `capture.mjs` asks, from the Windows box every measurement here was taken on. */
function ask(observation: ServedTreeObservation, ownDirectory: string): ServedTreeCheck {
  return checkServedTree({ url: PAGE_URL, observation, ownDirectory, platform: 'win32' });
}

// --- the property ------------------------------------------------------------------------------

test('the same stamp is refused from a sibling worktree and accepted from the tree it names — and nothing else differs', () => {
  const fromTheCapturingWorktree = ask(stamped(siblingTree), CAPTURING_HARNESS);
  assert.ok(!fromTheCapturingWorktree.ok, 'a sibling worktree’s harness was accepted as this checkout’s');
  assert.equal(fromTheCapturingWorktree.verdict, 'foreign');
  assert.match(fromTheCapturingWorktree.message, /is serving ANOTHER TREE, so nothing it draws is evidence about this checkout/);
  // Both trees in full, so the operator can see WHICH sibling holds the port...
  assert.ok(fromTheCapturingWorktree.message.includes(`served ${SIBLING_HARNESS}`), fromTheCapturingWorktree.message);
  assert.ok(fromTheCapturingWorktree.message.includes(`this   ${CAPTURING_HARNESS}`), fromTheCapturingWorktree.message);
  // ...and the process, which the filing session had to find with netstat and Get-CimInstance.
  assert.match(
    fromTheCapturingWorktree.message,
    /pid 45060, up since 2026-08-21T23:40:12\.000Z, started on claude\/confident-brahmagupta-b5b8f2 at 9f3c2b1a7d6e$/m,
  );
  assert.match(fromTheCapturingWorktree.message, /Leave it running — it is not yours\./);
  assert.match(fromTheCapturingWorktree.message, /`vite harness --port <free port> --strictPort`/);

  const fromItsOwnTree = ask(stamped(siblingTree), SIBLING_HARNESS);
  assert.ok(fromItsOwnTree.ok, 'a harness was refused by a capture running from the very tree it serves');
  assert.deepEqual(fromItsOwnTree.tree, siblingTree);
});

// --- the rules the property rests on ---------------------------------------------------------------

test('a server that sends NO stamp is refused, never read as having nothing to object to', () => {
  // Every harness that predates the stamp answers exactly like this — which, the day it landed, was
  // every harness a sibling worktree had left running. Passing it would re-open the defect for all of them.
  const check = ask({ observed: true, header: undefined }, CAPTURING_HARNESS);
  assert.ok(!check.ok);
  assert.equal(check.verdict, 'unstamped');
  assert.ok(check.message.includes(`sends no ${SERVED_TREE_HEADER} stamp`), check.message);
  assert.match(check.message, /Start the harness from THIS worktree/);
});

interface UnreadableCase {
  readonly name: string;
  readonly header: string;
}

test('a stamp that cannot be read is refused as unreadable, and reading one never throws', () => {
  // Asked from the directory the stamp WOULD name, so a parser lenient enough to find a directory in any
  // of these would pass it — the refusal cannot be coming from a directory mismatch.
  const cases: readonly UnreadableCase[] = [
    { name: 'not percent-encoding', header: '%E0%A4%A' },
    { name: 'not JSON', header: encodeURIComponent('confident-brahmagupta-b5b8f2') },
    { name: 'JSON null', header: encodeURIComponent('null') },
    { name: 'an empty value', header: '' },
    { name: 'no directory', header: encodeURIComponent(JSON.stringify({ ...siblingTree, directory: undefined })) },
    {
      name: 'a relative directory',
      header: encodeURIComponent(JSON.stringify({ ...siblingTree, directory: 'packages/forest-world-r3f/harness' })),
    },
    { name: 'a pid that is not a process id', header: encodeURIComponent(JSON.stringify({ ...siblingTree, pid: 'forty-five' })) },
  ];
  for (const c of cases) {
    const check = ask({ observed: true, header: c.header }, SIBLING_HARNESS);
    assert.ok(!check.ok, `${c.name} was accepted`);
    assert.equal(check.verdict, 'unreadable', c.name);
    assert.match(check.message, /stamp this capture cannot read \(.+\)\.$/m, c.name);
  }
});

test('a capture that observed no document response refuses rather than assuming the tree', () => {
  const check = ask({ observed: false }, CAPTURING_HARNESS);
  assert.ok(!check.ok);
  assert.equal(check.verdict, 'unobserved');
});

test('directories compare as WHOLE paths: separators, a trailing separator and Windows case do not matter; the worktree does', () => {
  // vite reports its root with forward slashes; `import.meta.url` comes back with backslashes.
  assert.ok(
    sameDirectory(
      'C:/code/storytree/.claude/worktrees/great-chaplygin-4e32d5/packages/forest-world-r3f/harness',
      CAPTURING_HARNESS,
      'win32',
    ),
  );
  assert.ok(sameDirectory(`${CAPTURING_HARNESS}\\`, CAPTURING_HARNESS, 'win32'));
  assert.ok(sameDirectory(CAPTURING_HARNESS.toUpperCase(), CAPTURING_HARNESS.toLowerCase(), 'win32'));

  // Every worktree's harness ends in the same `packages/forest-world-r3f/harness`.
  assert.ok(!sameDirectory(SIBLING_HARNESS, CAPTURING_HARNESS, 'win32'));
  // The main checkout is not one of its worktrees: the lobby's harness is another tree too.
  assert.ok(!sameDirectory('C:\\code\\storytree\\packages\\forest-world-r3f\\harness', CAPTURING_HARNESS, 'win32'));
  // A prefix is not a match: a sibling whose name EXTENDS this one's is still another tree.
  assert.ok(!sameDirectory('C:\\wt\\great-chaplygin-4e32d5-2', 'C:\\wt\\great-chaplygin-4e32d5', 'win32'));

  // Off Windows, case IS significant, and a root stays a root.
  assert.ok(!sameDirectory('/home/dev/wt/a/Harness', '/home/dev/wt/a/harness', 'linux'));
  assert.ok(sameDirectory('/home/dev/wt/a/harness/', '/home/dev/wt/a/harness', 'linux'));
  assert.ok(sameDirectory('/', '/', 'linux'));
  assert.ok(!sameDirectory('/', '/home', 'linux'));
});

test('the header is always legal header bytes, and reads back as exactly the tree that was stamped', () => {
  const awkward: ServedTree = {
    ...siblingTree,
    directory: 'C:\\Users\\Zoë Ngata\\森\\packages\\forest-world-r3f\\harness',
    branchAtStart: null,
    commitAtStart: null,
  };
  const header = encodeServedTree(awkward);
  assert.match(header, /^[\x21-\x7e]+$/, 'the stamp would not survive as a header value');
  assert.deepEqual(readServedTreeHeader(header), { kind: 'stamped', tree: awkward });
  assert.deepEqual(readServedTreeHeader(undefined), { kind: 'unstamped' });

  // A tree git could not describe is still a tree: the directory is what decides.
  const check = ask(stamped(awkward), 'C:/Users/Zoë Ngata/森/packages/forest-world-r3f/harness');
  assert.ok(check.ok);
});

// --- the capture's half ----------------------------------------------------------------------------

function answer(navigation: boolean, headers: Record<string, string>): StampedResponse {
  return { request: () => ({ isNavigationRequest: () => navigation }), headers: () => headers };
}

test('the watcher keeps the FIRST navigation response: a module response or a later navigation never replaces it', () => {
  const page = new EventEmitter();
  const watch = watchServedTree(page);
  assert.deepEqual(watch.observation(), { observed: false });

  // A module response is not the document, even when it carries a stamp.
  page.emit('response', answer(false, { [SERVED_TREE_HEADER]: encodeServedTree(siblingTree) }));
  assert.deepEqual(watch.observation(), { observed: false });

  // The document, unstamped: observed, and observed as carrying NOTHING.
  page.emit('response', answer(true, { 'content-type': 'text/html' }));
  assert.deepEqual(watch.observation(), { observed: true, header: undefined });

  // A later navigation is not the page that was asked for, stamped or not.
  page.emit('response', answer(true, { [SERVED_TREE_HEADER]: encodeServedTree(siblingTree) }));
  assert.deepEqual(watch.observation(), { observed: true, header: undefined });

  const stampedPage = new EventEmitter();
  const stampedWatch = watchServedTree(stampedPage);
  stampedPage.emit('response', answer(true, { [SERVED_TREE_HEADER]: encodeServedTree(siblingTree) }));
  assert.deepEqual(stampedWatch.observation(), stamped(siblingTree));
});

test('a stopped watcher keeps what it saw, hears nothing after, and holds no listener', () => {
  const page = new EventEmitter();
  const watch = watchServedTree(page);
  page.emit('response', answer(true, { 'content-type': 'text/html' }));
  watch.stop();
  assert.equal(page.listenerCount('response'), 0, 'a stopped watcher is still subscribed');
  assert.deepEqual(watch.observation(), { observed: true, header: undefined });

  // Stopped before its document arrived, a watcher must not observe it — or `stop` unsubscribed nothing.
  const unheard = watchServedTree(page);
  unheard.stop();
  page.emit('response', answer(true, { [SERVED_TREE_HEADER]: encodeServedTree(siblingTree) }));
  assert.deepEqual(unheard.observation(), { observed: false });
});

// --- every driver's half: navigating to a harness page ---------------------------------------------

/** The stamp THIS checkout's harness server sends: the directory these tests, and every driver, live in. */
const ownTree: ServedTree = { ...siblingTree, directory: HARNESS_DIRECTORY };

function stampOf(tree: ServedTree) {
  return { [SERVED_TREE_HEADER]: encodeServedTree(tree) };
}

const UNSTAMPED = { 'content-type': 'text/html' };

/** What `page.goto` resolved to, as far as the guard is concerned: something to hand back untouched. */
const RESPONSE = 'the response page.goto resolved to';

/** Playwright's name for a wait that ran out — what `capture-navigation.ts` reads to tell a timeout from a failure. */
class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
}

/** A driver's `fail` that only RECORDS the refusal and returns — `visible-delta-smoke.mjs`'s shape. */
class RecordingFail {
  readonly refusals: string[] = [];
  readonly fail = (message: string): void => {
    this.refusals.push(message);
  };
}

/** A driver's refusal that throws — `palette-measure.ts`'s `refuse`. */
class Refused extends Error {}

function throwingFail(message: string): never {
  throw new Refused(message);
}

interface GotoCall {
  readonly url: string;
  readonly options: StatedNavigation;
}

/** What the fake server does when the page navigates: send its document response, then let the wait settle. */
type Serve = (page: HarnessPage) => Promise<string>;

/**
 * A page that records every navigation it is asked for. A real `EventEmitter`, so the watcher subscribes
 * to it as it does to Playwright's page — and `goto` emits the document response DURING the call, so a
 * guard that subscribed after calling `goto` never sees it.
 */
class HarnessPage extends EventEmitter {
  readonly calls: GotoCall[] = [];
  readonly #serve: Serve;

  constructor(serve: Serve) {
    super();
    this.#serve = serve;
  }

  goto(url: string, options: StatedNavigation): Promise<string> {
    this.calls.push({ url, options });
    return this.#serve(this);
  }
}

/** The document answers with `headers`, and the driver's wait is reached. */
function loads(headers: Record<string, string>): Serve {
  return async (page) => {
    page.emit('response', answer(true, headers));
    return RESPONSE;
  };
}

/** The document answers with `headers`, and then the wait ends in `error`. */
function answersThenFails(headers: Record<string, string>, error: Error): Serve {
  return async (page) => {
    page.emit('response', answer(true, headers));
    throw error;
  };
}

function timedOut(): TimeoutError {
  return new TimeoutError('page.goto: Timeout 180000ms exceeded.');
}

test('a page that LOADED is refused when another tree served it and handed back when this one did — and nothing else differs', async () => {
  const squatter = new RecordingFail();
  await assert.rejects(
    gotoServedTree(new HarnessPage(loads(stampOf(siblingTree))), PAGE_URL, { waitUntil: 'networkidle' }, squatter.fail),
    ServedTreeRefused,
  );
  const [refusal = ''] = squatter.refusals;
  assert.equal(squatter.refusals.length, 1, 'the driver was never told why its page was refused');
  assert.match(refusal, /is serving ANOTHER TREE, so nothing it draws is evidence about this checkout/);
  assert.ok(refusal.includes(`served ${SIBLING_HARNESS}`), refusal);
  assert.ok(refusal.includes(`this   ${HARNESS_DIRECTORY}`), refusal);

  const honest = new RecordingFail();
  const navigation = await gotoServedTree(new HarnessPage(loads(stampOf(ownTree))), PAGE_URL, { waitUntil: 'networkidle' }, honest.fail);
  assert.deepEqual(honest.refusals, [], 'this checkout’s own harness was refused');
  assert.equal(navigation.response, RESPONSE);
  assert.deepEqual(navigation.tree, ownTree);
});

interface LoadedCase {
  readonly name: string;
  readonly serve: Serve;
  readonly verdict: string;
  readonly says: RegExp;
}

test('a loaded page is refused whatever stops its tree being read — and a fail() that returns still never hands it on', async () => {
  const cases: readonly LoadedCase[] = [
    { name: 'no stamp', serve: loads(UNSTAMPED), verdict: 'unstamped', says: /sends no x-storytree-served-tree stamp/ },
    {
      name: 'an unreadable stamp',
      serve: loads({ [SERVED_TREE_HEADER]: '%E0%A4%A' }),
      verdict: 'unreadable',
      says: /stamp this capture cannot read/,
    },
    { name: 'no document response at all', serve: async () => RESPONSE, verdict: 'unobserved', says: /no document response from .+ was observed/ },
  ];
  for (const c of cases) {
    const log = new RecordingFail();
    await assert.rejects(gotoServedTree(new HarnessPage(c.serve), PAGE_URL, { waitUntil: 'load' }, log.fail), (error) => {
      assert.ok(error instanceof ServedTreeRefused, `${c.name}: the navigation ended in ${String(error)}`);
      assert.ok(error.message.includes(`(${c.verdict})`), `${c.name}: ${error.message}`);
      return true;
    });
    assert.equal(log.refusals.length, 1, `${c.name}: the driver was never told why`);
    assert.match(log.refusals[0] ?? '', c.says, c.name);
  }
});

test('a navigation that FAILED after another tree answered is refused as that tree’s, before the driver can explain the failure as its own', async () => {
  const foreign = new HarnessPage(answersThenFails(stampOf(siblingTree), timedOut()));
  await assert.rejects(gotoServedTree(foreign, PAGE_URL, { waitUntil: 'load' }, throwingFail), (error) => {
    assert.ok(error instanceof Refused, `the driver was handed ${String(error)} to explain, instead of the refusal`);
    assert.match(error.message, /is serving ANOTHER TREE/);
    return true;
  });

  // A harness a sibling left running from before the stamp times out just the same, and is no more this tree.
  const unstamped = new HarnessPage(answersThenFails(UNSTAMPED, timedOut()));
  await assert.rejects(gotoServedTree(unstamped, PAGE_URL, { waitUntil: 'load' }, throwingFail), (error) => {
    assert.ok(error instanceof Refused, `the driver was handed ${String(error)} to explain, instead of the refusal`);
    assert.match(error.message, /sends no x-storytree-served-tree stamp/);
    return true;
  });
});

test('a navigation that failed on THIS tree, or that no server answered, reaches the driver unchanged — its own explanation stands', async () => {
  const log = new RecordingFail();
  const timeout = timedOut();
  const ours = new HarnessPage(answersThenFails(stampOf(ownTree), timeout));
  await assert.rejects(gotoServedTree(ours, PAGE_URL, { waitUntil: 'load' }, log.fail), (error) => error === timeout);

  // No document, so no tree to judge: `capture-navigation.ts` must still get to say "nothing answered",
  // which a refusal as `unobserved` would take from it.
  const refused = new Error('page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5184/compare.html');
  const nobody = new HarnessPage(async () => {
    throw refused;
  });
  await assert.rejects(gotoServedTree(nobody, PAGE_URL, { waitUntil: 'load' }, log.fail), (error) => error === refused);
  assert.deepEqual(log.refusals, []);
});

test('a driver that states no bound navigates under the measured allowance, never Playwright’s unstated 30 s — and a stated bound and every wait pass through', async () => {
  const waits: readonly HarnessWaitUntil[] = ['load', 'domcontentloaded', 'networkidle'];
  for (const waitUntil of waits) {
    const unstated = new HarnessPage(loads(stampOf(ownTree)));
    await gotoServedTree(unstated, PAGE_URL, { waitUntil }, new RecordingFail().fail);
    assert.deepEqual(unstated.calls, [{ url: PAGE_URL, options: { waitUntil, timeout: DEFAULT_NAVIGATION_ALLOWANCE_MS } }]);

    const stated = new HarnessPage(loads(stampOf(ownTree)));
    await gotoServedTree(stated, PAGE_URL, { waitUntil, timeout: 600_000 }, new RecordingFail().fail);
    assert.deepEqual(stated.calls, [{ url: PAGE_URL, options: { waitUntil, timeout: 600_000 } }]);
  }
});

test('each navigation is judged by ITS OWN document, and no navigation leaves its watcher subscribed', async () => {
  // `visible-delta-smoke.mjs` sends ONE page to two harness pages in turn.
  const documents = [stampOf(ownTree), stampOf(siblingTree)];
  const page = new HarnessPage(async (p) => {
    p.emit('response', answer(true, documents.shift() ?? UNSTAMPED));
    return RESPONSE;
  });
  const log = new RecordingFail();
  await gotoServedTree(page, PAGE_URL, { waitUntil: 'domcontentloaded' }, log.fail);
  assert.equal(page.listenerCount('response'), 0, 'a navigation that was handed back left its watcher subscribed');
  await assert.rejects(
    gotoServedTree(page, 'http://localhost:5184/shipped-skirt.html', { waitUntil: 'domcontentloaded' }, log.fail),
    ServedTreeRefused,
  );
  assert.equal(log.refusals.length, 1, 'the second navigation was judged by the first document’s stamp');
  assert.equal(page.listenerCount('response'), 0, 'a refused navigation left its watcher subscribed');

  const failed = new HarnessPage(answersThenFails(stampOf(ownTree), timedOut()));
  await assert.rejects(gotoServedTree(failed, PAGE_URL, { waitUntil: 'load' }, log.fail), TimeoutError);
  assert.equal(failed.listenerCount('response'), 0, 'a failed navigation left its watcher subscribed');
});

test('the tree every driver is judged against is the harness directory the drivers live in', () => {
  assert.equal(HARNESS_DIRECTORY, canonicalDirectory(HERE));
});

// --- the server's half -----------------------------------------------------------------------------

function sources(answers: ReadonlyMap<string, string | null>, calls: string[]): ServedTreeSources {
  return {
    runGit: async (args, cwd) => {
      calls.push(`${cwd} :: git ${args.join(' ')}`);
      return answers.get(args.join(' ')) ?? null;
    },
    pid: 45060,
    now: () => new Date('2026-08-21T23:40:12.000Z'),
  };
}

test("the server's stamp names the root it was given, and git is asked about that same root", async () => {
  const calls: string[] = [];
  const answers = new Map([
    ['rev-parse --abbrev-ref HEAD', 'claude/confident-brahmagupta-b5b8f2'],
    ['rev-parse HEAD', '9f3c2b1a7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a'],
  ]);
  const tree = await readServedTree(HERE, sources(answers, calls));
  assert.deepEqual(tree, {
    directory: canonicalDirectory(HERE),
    pid: 45060,
    startedAt: '2026-08-21T23:40:12.000Z',
    branchAtStart: 'claude/confident-brahmagupta-b5b8f2',
    commitAtStart: '9f3c2b1a7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a',
  });
  assert.ok(sameDirectory(tree.directory, HERE, process.platform), `${tree.directory} is not ${HERE}`);
  assert.deepEqual(
    [...calls].sort(),
    [`${tree.directory} :: git rev-parse --abbrev-ref HEAD`, `${tree.directory} :: git rev-parse HEAD`].sort(),
  );

  // A detached checkout's literal `HEAD` is git's real answer and is kept; what cannot be a sha is not.
  const detached = await readServedTree(
    HERE,
    sources(new Map([['rev-parse --abbrev-ref HEAD', 'HEAD'], ['rev-parse HEAD', 'fatal: not a git repository']]), []),
  );
  assert.equal(detached.branchAtStart, 'HEAD');
  assert.equal(detached.commitAtStart, null);

  // No git at all still stamps the directory, which is the field every verdict is taken on.
  const noGit = await readServedTree(HERE, sources(new Map(), []));
  assert.equal(noGit.branchAtStart, null);
  assert.equal(noGit.commitAtStart, null);
  assert.equal(noGit.directory, tree.directory);
});

test('the REAL sources — this process, the wall clock and real git — describe the checkout they are pointed at', async () => {
  // Every other test here injects its sources, so without this one the default a real harness server
  // runs at every start (`PROCESS_SOURCES`) is reached by no test: a runner that misread git's output
  // would leave every refusal naming a wrong or empty branch and commit, with the suite still green.
  // A PRIVATE repo, never this checkout: sibling git operations briefly hold this checkout's ref locks,
  // the flake `apps/studio/server/codeStamp.ts` records for these same two reads.
  const repo = mkdtempSync(join(tmpdir(), 'served-tree-git-'));
  try {
    const git = (...args: string[]): string =>
      execFileSync(
        'git',
        ['-C', repo, '-c', 'user.name=served-tree', '-c', 'user.email=served-tree@example.invalid', '-c', 'commit.gpgsign=false', ...args],
        { encoding: 'utf8' },
      ).trim();
    git('init', '-q', '-b', 'claude/served-tree-probe');
    git('commit', '-q', '--allow-empty', '-m', 'served-tree probe');

    const before = Date.now();
    const tree = await readServedTree(repo, PROCESS_SOURCES);
    const after = Date.now();
    assert.equal(tree.directory, canonicalDirectory(repo));
    assert.equal(tree.pid, process.pid);
    assert.equal(tree.branchAtStart, 'claude/served-tree-probe');
    assert.equal(tree.commitAtStart, git('rev-parse', 'HEAD'));
    const startedAt = Date.parse(tree.startedAt);
    assert.ok(startedAt >= before && startedAt <= after, `${tree.startedAt} is not the moment the tree was read`);

    // Where the real runner cannot run git at all, it answers null rather than throwing — and the
    // directory, the one field every verdict is taken on, is still stamped.
    const gone = join(repo, 'no-such-directory');
    const ungitted = await readServedTree(gone, PROCESS_SOURCES);
    assert.equal(ungitted.branchAtStart, null);
    assert.equal(ungitted.commitAtStart, null);
    assert.ok(sameDirectory(ungitted.directory, gone, process.platform), `${ungitted.directory} is not ${gone}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('the server stamps its OWN root on every response, and nothing a request carries can change what it stamps', async () => {
  const handlers: StampHandler[] = [];
  const server = {
    config: { root: HERE },
    middlewares: {
      use: (handler: StampHandler) => {
        handlers.push(handler);
      },
    },
  };
  const installed = await installServedTreeStamp(server, sources(new Map(), []));
  assert.equal(handlers.length, 1);
  const [handler] = handlers;
  assert.ok(handler);

  // A request that claims another tree twice over — in its URL, and in a header of the stamp's own name.
  const forged = {
    url: `/compare.html?tree=${encodeURIComponent(SIBLING_HARNESS)}`,
    headers: { [SERVED_TREE_HEADER]: encodeServedTree(siblingTree) },
  };
  const written = new Map<string, string>();
  let nexts = 0;
  handler(
    forged,
    {
      setHeader: (name, value) => {
        written.set(name, value);
      },
    },
    () => {
      nexts += 1;
    },
  );
  assert.equal(nexts, 1, 'the stamp must hand every request on, exactly once');

  const reading = readServedTreeHeader(written.get(SERVED_TREE_HEADER));
  assert.deepEqual(reading, { kind: 'stamped', tree: installed });
  assert.ok(sameDirectory(installed.directory, HERE, process.platform), `${installed.directory} is not ${HERE}`);
  assert.ok(!sameDirectory(installed.directory, SIBLING_HARNESS, process.platform));
});

test('the stamp travels in x-storytree-served-tree, by its literal name', () => {
  assert.equal(SERVED_TREE_HEADER, 'x-storytree-served-tree');
  // Playwright lower-cases every header name it hands back, so a mixed-case constant would never match.
  assert.equal(SERVED_TREE_HEADER, SERVED_TREE_HEADER.toLowerCase());
});

// --- the wiring ------------------------------------------------------------------------------------

function pluginNames(options: readonly PluginOption[]): string[] {
  return options.flatMap((option): string[] => {
    if (Array.isArray(option)) return pluginNames(option);
    if (option && typeof option === 'object' && 'name' in option) return [option.name];
    return [];
  });
}

/**
 * Source with its comments gone — through esbuild, the same transform vite runs — so prose ABOUT
 * `page.goto` neither trips the guards below nor, worse, a comment naming `gotoServedTree(` satisfies
 * them. Strings, template literals and regex literals come through intact; `name` picks the loader.
 */
async function withoutComments(source: string, name: string): Promise<string> {
  return (await transformWithEsbuild(source, name)).code;
}

async function driverCode(name: string): Promise<string> {
  return withoutComments(readFileSync(join(HERE, name), 'utf8'), name);
}

/** How many times comment-free driver code navigates through the guard. */
function guardedNavigations(code: string): number {
  return [...code.matchAll(/\bgotoServedTree\(/g)].length;
}

test('the harness config registers the stamp FIRST, and the capture driver explains only a navigation the served-tree check made', async () => {
  // THE SERVER HALF, asked of the real config object rather than of its source text.
  const { default: config } = await import('./vite.config.js');
  const names = pluginNames(config.plugins ?? []);
  assert.equal(names[0], SERVED_TREE_PLUGIN, `the harness config's plugins are ${names.join(', ')}`);

  // THE CAPTURE HALF — narrower than it was, because the ORDER the policy needs (subscribe, navigate, judge
  // on both paths) now lives in `gotoServedTree` and is proved above by behaviour rather than by position.
  // What is left for `capture.mjs` to get right is that the navigation it explains, and the page it judges
  // broken, are the guarded ones. That it does so correctly is `check:land-art`, which drives it against a
  // harness it starts itself and refuses every page if the honest case stops passing.
  const code = await driverCode('capture.mjs');
  const at = (call: string): number => code.indexOf(`${call}(`);
  for (const call of ['gotoServedTree', 'explainNavigationFailure', 'explainLoadedPage']) {
    assert.ok(at(call) >= 0, `capture.mjs never calls ${call} — this guard would check nothing`);
  }
  assert.ok(at('gotoServedTree') < at('explainNavigationFailure'), 'capture.mjs explains a navigation failure the served-tree check never saw');
  assert.ok(at('gotoServedTree') < at('explainLoadedPage'), 'capture.mjs judges a page broken before asking which tree served it');
});

/**
 * Every way a driver's code can put a page in front of a server the served-tree check never read: a
 * `.goto` that is not the blank control no server answers (a `page.goto.bind` counts — it is still the
 * unguarded call), a re-navigation, and navigation from inside the page. Run over esbuild's output, which
 * writes every string with double quotes.
 */
const UNGUARDED_NAVIGATION: readonly RegExp[] = [
  /\.goto\b(?!\("about:blank"[,)])/g,
  /\.(?:reload|goBack|goForward)\s*\(/g,
  /\blocation\.(?:assign|replace)\s*\(/g,
  /\blocation\.href\s*=(?!=)/g,
  /\bwindow\.open\s*\(/g,
];

function unguardedNavigations(code: string): string[] {
  return UNGUARDED_NAVIGATION.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((m) => (code.slice(m.index ?? 0).split('\n', 1)[0] ?? '').slice(0, 96)),
  );
}

test('the driver guard’s matcher finds every raw navigation, and neither the guarded call nor the blank control', async () => {
  assert.deepEqual(unguardedNavigations('await gotoServedTree(page, URL_, { waitUntil: "load" }, fail);'), []);
  assert.deepEqual(unguardedNavigations('await blank.goto("about:blank");\nawait blank.goto("about:blank", { waitUntil: "load" });'), []);
  const raw = [
    'await page.goto(URL_, { waitUntil: "networkidle" });',
    'await comparePage.goto(`${BASE}/compare.html`, { waitUntil: "load" });',
    'await page.goto("http://localhost:5184/compare.html");',
    'await page.goto("about:blankety");',
    'const go = page.goto.bind(page);',
    'await page.reload();',
    'await page.goBack();',
    'await page.evaluate(() => { location.href = "/compare.html"; });',
    'await page.evaluate(() => location.assign("/compare.html"));',
    'await page.evaluate(() => window.open("/compare.html"));',
  ];
  for (const line of raw) assert.equal(unguardedNavigations(line).length, 1, line);
  // Reading where a page is, is not going anywhere.
  assert.deepEqual(unguardedNavigations('const here = location.href; if (location.href === here) {}'), []);

  // AND THROUGH THE COMMENT STRIPPER, which is what the sweep actually reads: a comment naming the guard
  // beside a raw navigation neither hides it nor counts as a guarded one, and a comment naming a raw
  // navigation beside the guarded call trips nothing.
  const disguised = await withoutComments(
    '// await gotoServedTree(page, URL_, { waitUntil: "load" }, fail);\nawait page.goto(URL_, { waitUntil: "load" });\n',
    'disguised.mjs',
  );
  assert.equal(unguardedNavigations(disguised).length, 1, disguised);
  assert.equal(guardedNavigations(disguised), 0, disguised);
  const narrated = await withoutComments(
    '/* never page.goto(URL_) here */\nawait gotoServedTree(page, URL_, { waitUntil: "load" }, fail); // and no page.reload()\n',
    'narrated.mjs',
  );
  assert.deepEqual(unguardedNavigations(narrated), [], narrated);
  assert.equal(guardedNavigations(narrated), 1, narrated);
});

/** Every script here that drives a browser from Node: each `.mjs`/`.cjs`/`.js`, and each non-test `.ts` importing Playwright. */
function harnessDrivers(): string[] {
  return readdirSync(HERE)
    .filter(
      (name) =>
        /\.(?:mjs|cjs|js)$/.test(name) ||
        (/\.ts$/.test(name) && !/\.(?:test|d)\.ts$/.test(name) && readFileSync(join(HERE, name), 'utf8').includes('@playwright/test')),
    )
    .sort();
}

test('every harness driver reaches a harness page through gotoServedTree, and no other way', async () => {
  const guarded = new Map<string, number>();
  const offences: string[] = [];
  for (const name of harnessDrivers()) {
    const code = await driverCode(name);
    for (const navigation of unguardedNavigations(code)) offences.push(`${name}: ${navigation}`);
    guarded.set(name, guardedNavigations(code));
  }
  assert.deepEqual(
    offences,
    [],
    'these harness drivers put a page in front of a server whose tree nothing checks — navigate through ' +
      `gotoServedTree (served-tree.ts) instead:\n  ${offences.join('\n  ')}`,
  );

  // NOT VACUOUS. A sweep that enumerated nothing, or read every driver as empty, finds no offence either —
  // so the drivers each shape of navigation was measured on must be found, navigating the guarded way.
  const sentinels: ReadonlyMap<string, number> = new Map([
    ['capture.mjs', 1], // the first driver to read the stamp, and the one `check:land-art` runs
    ['shipped-land-measure.mjs', 1], // 2026-08-30: measured an orphaned sibling's older tree on :5231
    ['hardware-floor.mjs', 2], // two harness pages, beside an `about:blank` control no server answers
    ['visible-delta-smoke.mjs', 2], // ONE page, sent to two harness pages in turn
    ['palette-measure.ts', 1], // the typed driver, which the `.mjs` sweep alone would miss
  ]);
  for (const [name, count] of sentinels) {
    assert.equal(guarded.get(name), count, `${name} navigates through gotoServedTree ${String(guarded.get(name))} times, not ${count}`);
  }
});
