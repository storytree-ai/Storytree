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

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import type { PluginOption } from 'vite';

import {
  SERVED_TREE_HEADER,
  SERVED_TREE_PLUGIN,
  canonicalDirectory,
  checkServedTree,
  encodeServedTree,
  installServedTreeStamp,
  readServedTree,
  readServedTreeHeader,
  sameDirectory,
  watchServedTree,
  type ServedTree,
  type ServedTreeCheck,
  type ServedTreeObservation,
  type ServedTreeSources,
  type StampHandler,
  type StampedResponse,
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

test('the harness config registers the stamp FIRST, and the capture driver judges the tree before the page', async () => {
  // THE SERVER HALF, asked of the real config object rather than of its source text.
  const { default: config } = await import('./vite.config.js');
  const names = pluginNames(config.plugins ?? []);
  assert.equal(names[0], SERVED_TREE_PLUGIN, `the harness config's plugins are ${names.join(', ')}`);

  // THE CAPTURE HALF — a narrow guard with a narrow claim, in the shape of `capture-navigation.test.ts`'s:
  // it proves the driver still CALLS the pieces, in the order the policy needs, so a revert cannot land
  // quietly. That the driver uses them correctly is the live refusal runs recorded with the increment,
  // and `check:land-art`, which refuses every page if the honest case stops passing.
  const driver = readFileSync(join(HERE, 'capture.mjs'), 'utf8');
  const first = (call: string): number => driver.indexOf(`${call}(`);
  const last = (call: string): number => driver.lastIndexOf(`${call}(`);
  for (const call of ['canonicalDirectory', 'watchServedTree', 'checkServedTree', 'page.goto', 'explainLoadedPage']) {
    assert.ok(first(call) >= 0, `capture.mjs never calls ${call} — this guard would check nothing`);
  }
  assert.ok(first('watchServedTree') < first('page.goto'), 'capture.mjs subscribes to the stamp only after navigating');
  assert.ok(
    first('checkServedTree') < first('explainNavigationFailure'),
    'a failed navigation is explained before capture.mjs asks which tree answered',
  );
  // TWO checks, and the second is the one that matters most: a squatter's page usually LOADS, so the
  // check after `load` is the one it meets. Without this line, deleting that check left the failure-path
  // call satisfying both orderings on its own — found by seeding exactly that fault.
  assert.ok(
    last('checkServedTree') > first('explainNavigationFailure'),
    'capture.mjs never asks which tree served a page that loaded — the case a working squatter takes',
  );
  assert.ok(last('checkServedTree') < first('explainLoadedPage'), 'a loaded page is judged before capture.mjs asks which tree served it');
});
