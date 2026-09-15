// served-tree.ts — WHICH CHECKOUT a harness dev server is serving: stamped by the server on every
// response, and checked by every harness driver — through `gotoServedTree` — before it believes a single
// delivered pixel.
//
// THE DEFECT THIS CLOSES. `vite.config.ts` pins `server: { port: 5184, strictPort: true }` for EVERY
// worktree, and `capture.mjs` defaults `ST_HARNESS_URL` to that port. So a capture started in one
// worktree while another worktree's harness is still up photographs the OTHER tree, reads its pixels,
// and reports the verdict as its own. Measured 2026-08-22 (friction
// `capture-default-url-is-a-port-a-sibling-worktree-may-own`): the listener on :5184 was pid 45060, and
// its command line named `confident-brahmagupta-b5b8f2`'s harness while the capture was being run from
// `great-chaplygin-4e32d5`. Nothing compared the served code with the checkout that launched the run,
// and nothing had to look wrong — the port answered 200 and the page settled. The error is also
// DIRECTIONAL: the server already up belongs to the session that is NOT making the change, so the wrong
// answer is always "the unchanged tree is green". The first remedy was a warning in `capture.mjs`'s
// header, and a warning only works on a reader who has already read it.
//
// THE POLICY, in four parts.
//
//  1. THE SERVER STAMPS ITS OWN ROOT. `servedTreeStamp` reads the directory vite serves pages from
//     (`server.config.root`) once, when the server starts, and sets `x-storytree-served-tree` on every
//     response. Nothing in the stamp comes from the REQUEST: a stamp that echoed what the caller asked
//     about would be a check that verified nothing — the rule `apps/studio/server/codeStamp.ts` states
//     for the `directory` in the studio's `/api/health`.
//  2. THE DRIVER COMPARES DIRECTORIES, and refuses unless the served root IS the harness directory the
//     driver lives in. That is more than a port-squatting check: it keeps the instrument coherent. A
//     driver judges pixels against declarations imported from its OWN module graph — capture's palette
//     closure, prop manifest and colour-spread bands, a measure driver's arms and thresholds — so
//     measuring another tree's page holds that tree's pixels to this tree's declarations, which
//     measures neither.
//  3. NO STAMP IS A REFUSAL, NEVER A PASS. A harness that predates the stamp sends none, and a harness
//     a sibling worktree left running on an older `main` is exactly what that looks like. Reading the
//     absence as "nothing to object to" would re-open the defect for the very servers it was filed about.
//  4. THE TREE IS JUDGED BEFORE THE PAGE, on the failure path too. A cold, broken or stalled refusal
//     about ANOTHER tree's page sends the operator off to debug code that is not theirs, so whenever the
//     document answered at all, its stamp is checked before the driver explains the rest
//     (`capture-navigation.ts`, for `capture.mjs`).
//  5. EVERY DRIVER, ONE GUARD. For its first day only `capture.mjs` read the stamp, while forty other
//     drivers each defaulted a URL to a hand-picked port that every worktree's harness answers — and on
//     2026-08-30 `shipped-land-measure.mjs` measured an orphaned sibling's older tree on :5231 and
//     refused on a relief defect that was not in the code under test. Those drivers navigate in thirteen
//     shapes (three waits, with and without a bound, with and without a `.catch`), so the guard does not
//     pick the wait: `gotoServedTree` takes the driver's own, subscribes, navigates, judges on both paths
//     and refuses through the driver's own `fail`. It also carries the bound most of them lacked: a
//     driver that states none navigates under capture's measured allowance, never Playwright's unstated
//     30 s, which a cold vite on a busy box outruns (`capture-navigation.ts`). The source guard in
//     `served-tree.test.ts` refuses a driver that reaches a page any other way.
//
// WHY ONLY THE DIRECTORY IS COMPARED, when the stamp also carries a branch and a commit. A vite dev
// server serves the WORKING TREE from disk, uncommitted edits included, so a commit describes the served
// code only until the next edit. Comparing it would refuse the honest case — a commit made while the
// server is running — and add nothing the directory lacks, because one directory holds exactly one HEAD.
// The branch and commit (read when the server STARTED, and named for it), the pid and the start time are
// for the OPERATOR: they are what the filing session had to dig out by hand, with netstat and
// `Get-CimInstance`, to learn whose server it was and how old.
//
// THE HONEST LIMIT. This proves WHICH tree answered, not that its transforms are current. A server in
// this same directory serving stale modules — an orphan whose file watcher died when its worktree slot
// was scrubbed and re-leased, say — would pass. No incident of that shape is on record; it is named so
// the claim is not read wider than it is.
//
// Pure apart from the git reads, the realpath and the event subscription, and each of those has a seam,
// so all of it is provable under `node:test` with no browser and no dev server. The wired whole is proved
// by `check:land-art`, which drives `capture.mjs` against a harness it starts itself: take the stamp off
// the server and every page that rung audits refuses.

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';
import { z } from 'zod';

import { DEFAULT_NAVIGATION_ALLOWANCE_MS } from './capture-navigation.js';

/** The response header the stamp travels in. Tested by its LITERAL string, because the name is the interface. */
export const SERVED_TREE_HEADER = 'x-storytree-served-tree';

/** The plugin's name — how a test finds it among the harness config's plugins. */
export const SERVED_TREE_PLUGIN = 'storytree-served-tree';

function isAbsoluteAnywhere(directory: string): boolean {
  return path.win32.isAbsolute(directory) || path.posix.isAbsolute(directory);
}

/** What a harness server says about itself. Every verdict is taken on `directory` alone — see the header. */
const ServedTreeSchema = z.object({
  /** The root vite serves pages from, canonicalised by the SERVER from its own config. */
  directory: z.string().refine(isAbsoluteAnywhere, 'is not an absolute path'),
  /** The server process, so an operator can find it without netstat. */
  pid: z.number().int().positive(),
  /** When the server started, as an ISO timestamp — how old an orphan is. */
  startedAt: z.string().min(1),
  /** `git rev-parse --abbrev-ref HEAD` in the root when the server STARTED; null when git had no answer. */
  branchAtStart: z.string().min(1).nullable(),
  /** `git rev-parse HEAD` in the root when the server STARTED; null when git had no answer. */
  commitAtStart: z.string().min(1).nullable(),
});

export type ServedTree = z.infer<typeof ServedTreeSchema>;

// --- the stamp on the wire -------------------------------------------------------------------

/**
 * The header value: percent-encoded JSON. Node refuses to send a header value holding any character
 * past U+00FF, so a directory with, say, a CJK name in it would otherwise fail every response the
 * server tried to send — a stamp that broke the page it was meant to identify.
 */
export function encodeServedTree(tree: ServedTree): string {
  return encodeURIComponent(JSON.stringify(tree));
}

export type ServedTreeReading =
  | { readonly kind: 'stamped'; readonly tree: ServedTree }
  | { readonly kind: 'unstamped' }
  | { readonly kind: 'unreadable'; readonly detail: string };

type DecodedHeader = { readonly ok: true; readonly json: unknown } | { readonly ok: false; readonly detail: string };

function decodeHeader(raw: string): DecodedHeader {
  try {
    return { ok: true, json: JSON.parse(decodeURIComponent(raw)) };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Read the stamp off a response. `undefined` is a response that carried none. Never throws. */
export function readServedTreeHeader(raw: string | undefined): ServedTreeReading {
  if (raw === undefined) return { kind: 'unstamped' };
  const decoded = decodeHeader(raw);
  if (!decoded.ok) return { kind: 'unreadable', detail: `it does not decode: ${firstLine(decoded.detail)}` };
  const parsed = ServedTreeSchema.safeParse(decoded.json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined || issue.path.length === 0 ? 'the stamp' : issue.path.join('.');
    return { kind: 'unreadable', detail: `${where} ${issue?.message ?? 'is not a served-tree stamp'}` };
  }
  return { kind: 'stamped', tree: parsed.data };
}

// --- the comparison --------------------------------------------------------------------------

/**
 * A directory as the filesystem spells it — junctions, short names and drive-letter case resolved — so
 * both sides agree about spelling before `sameDirectory` is asked. Falls back to `path.resolve` when the
 * filesystem cannot answer.
 */
export function canonicalDirectory(directory: string): string {
  try {
    return realpathSync.native(directory);
  } catch {
    return path.resolve(directory);
  }
}

/**
 * Whether two directories are the same place, as far as their paths can say. Separators are normalised
 * — vite hands its root over with forward slashes, `import.meta.url` comes back with backslashes — a
 * trailing separator is dropped, and on Windows case is not significant. It compares WHOLE paths: every
 * worktree's harness ends in the same `packages/forest-world-r3f/harness`, so a comparison that stopped
 * at the suffix would call every sibling this one.
 */
export function sameDirectory(a: string, b: string, platform: NodeJS.Platform): boolean {
  return directoryKey(a, platform) === directoryKey(b, platform);
}

function directoryKey(directory: string, platform: NodeJS.Platform): string {
  const flavour = platform === 'win32' ? path.win32 : path.posix;
  let key = flavour.normalize(directory);
  const { root } = flavour.parse(key);
  while (key.length > root.length && key.endsWith(flavour.sep)) key = key.slice(0, -1);
  return platform === 'win32' ? key.toLowerCase() : key;
}

// --- the verdict -----------------------------------------------------------------------------

/** What the page's document response carried, as `watchServedTree` observed it. */
export type ServedTreeObservation =
  | { readonly observed: false }
  | { readonly observed: true; readonly header: string | undefined };

export type ServedTreeVerdict = 'foreign' | 'unstamped' | 'unreadable' | 'unobserved';

export type ServedTreeCheck =
  | { readonly ok: true; readonly tree: ServedTree }
  | { readonly ok: false; readonly verdict: ServedTreeVerdict; readonly message: string };

export interface ServedTreeQuestion {
  /** The page being captured. */
  readonly url: string;
  readonly observation: ServedTreeObservation;
  /** The directory the driver itself lives in, canonicalised — {@link HARNESS_DIRECTORY}, for every driver here. */
  readonly ownDirectory: string;
  /** Whose path rules decide sameness — `process.platform` in the driver. */
  readonly platform: NodeJS.Platform;
}

const REMEDY =
  'Start the harness from THIS worktree on a free port (`vite harness --port <free port> --strictPort`) ' +
  'and point the driver at it through its ST_* URL variable.';

/**
 * The tree, when it is this checkout's own; otherwise the refusal. Printed after `REFUSED:`, so short on
 * purpose: `check:land-art` keeps only the last 14 lines of a capture's output.
 */
export function checkServedTree(question: ServedTreeQuestion): ServedTreeCheck {
  const { url, observation, ownDirectory, platform } = question;
  if (!observation.observed) {
    return refusal('unobserved', `no document response from ${url} was observed, so which tree served it cannot be checked.`, [
      REMEDY,
    ]);
  }
  const reading = readServedTreeHeader(observation.header);
  if (reading.kind === 'unstamped') {
    return refusal(
      'unstamped',
      `the server answering ${url} sends no ${SERVED_TREE_HEADER} stamp, so which tree it serves cannot be checked — ` +
        'and a harness a sibling worktree left running from before the stamp existed looks exactly like this.',
      [REMEDY],
    );
  }
  if (reading.kind === 'unreadable') {
    return refusal(
      'unreadable',
      `the server answering ${url} sent a ${SERVED_TREE_HEADER} stamp this capture cannot read (${reading.detail}).`,
      [REMEDY],
    );
  }
  const { tree } = reading;
  if (sameDirectory(tree.directory, ownDirectory, platform)) return { ok: true, tree };
  return refusal('foreign', `the server answering ${url} is serving ANOTHER TREE, so nothing it draws is evidence about this checkout:`, [
    `served ${tree.directory}`,
    `       ${describeServer(tree)}`,
    `this   ${ownDirectory}`,
    `Leave it running — it is not yours. ${REMEDY}`,
  ]);
}

/** The operator's half of the stamp, on one line. */
export function describeServer(tree: ServedTree): string {
  const branch = tree.branchAtStart ?? 'an unknown branch';
  const commit = tree.commitAtStart === null ? 'an unknown commit' : tree.commitAtStart.slice(0, 12);
  return `pid ${tree.pid}, up since ${tree.startedAt}, started on ${branch} at ${commit}`;
}

function refusal(verdict: ServedTreeVerdict, head: string, body: readonly string[]): ServedTreeCheck {
  return { ok: false, verdict, message: [head, ...body].join('\n  ') };
}

function firstLine(text: string): string {
  return (text.split('\n', 1)[0] ?? '').trim();
}

// --- the capture's half: watching the document response --------------------------------------

/** The slice of a Playwright `Request` the watcher reads. */
export interface NavigatingRequest {
  isNavigationRequest(): boolean;
}

/** The slice of a Playwright `Response` the watcher reads. Playwright lower-cases every header name. */
export interface StampedResponse {
  request(): NavigatingRequest;
  headers(): Record<string, string>;
}

/** The slice of a Playwright `Page` the watcher subscribes to. A real `EventEmitter` satisfies it. */
export interface StampWatchablePage {
  on(event: 'response', listener: (response: StampedResponse) => void): unknown;
  off(event: 'response', listener: (response: StampedResponse) => void): unknown;
}

export interface ServedTreeWatch {
  observation(): ServedTreeObservation;
  /** Unsubscribe. What was observed stays observed; nothing after is. */
  stop(): void;
}

/**
 * Keep the stamp off the FIRST navigation response — the document the driver asked for. Subscribe
 * BEFORE `page.goto`, or that response is exactly the one never seen. A later navigation (a frame the
 * page embeds, say) never replaces it: it is not the page that was requested. `stop` once the navigation
 * has settled, so a driver that sends one page to many harness pages does not collect a listener a visit.
 */
export function watchServedTree(page: StampWatchablePage): ServedTreeWatch {
  let first: ServedTreeObservation = { observed: false };
  const keepTheDocument = (response: StampedResponse): void => {
    if (first.observed || !response.request().isNavigationRequest()) return;
    first = { observed: true, header: response.headers()[SERVED_TREE_HEADER] };
  };
  page.on('response', keepTheDocument);
  return {
    observation: () => first,
    stop: () => {
      page.off('response', keepTheDocument);
    },
  };
}

// --- every driver's half: navigating to a harness page -------------------------------------------

/**
 * The harness directory, canonicalised — the one tree a driver beside this module can judge, because
 * every declaration a driver holds a page to is imported from here. Read off this module's own location
 * rather than passed in by every caller, so no caller can name the wrong one.
 */
export const HARNESS_DIRECTORY = canonicalDirectory(path.dirname(fileURLToPath(import.meta.url)));

/** The waits a driver may state. Each resolves only after the document response, so the stamp is in hand when `goto` returns. */
export type HarnessWaitUntil = 'load' | 'domcontentloaded' | 'networkidle';

/** How a driver asks to navigate: its own wait, and its own bound when it has one. */
export interface HarnessNavigationOptions {
  readonly waitUntil: HarnessWaitUntil;
  /** In ms. Unstated means {@link DEFAULT_NAVIGATION_ALLOWANCE_MS} — never Playwright's unstated 30 s. */
  readonly timeout?: number;
}

/** What reaches `page.goto`: the driver's wait, and a bound that is always stated. */
export interface StatedNavigation {
  readonly waitUntil: HarnessWaitUntil;
  readonly timeout: number;
}

/** The slice of a Playwright `Page` a harness navigation drives. */
export interface NavigablePage<R> extends StampWatchablePage {
  goto(url: string, options: StatedNavigation): Promise<R>;
}

/** A driver's own refusal. It is expected not to return — {@link ServedTreeRefused} is for the drivers whose refusal does. */
export type Refuse = (message: string) => unknown;

/** What a navigation this checkout's harness served hands back. */
export interface HarnessNavigation<R> {
  /** Whatever `page.goto` resolved to — Playwright's document response, or `null`. */
  readonly response: R;
  /** The server's account of itself: which process, up since when, started on what branch and commit. */
  readonly tree: ServedTree;
}

/**
 * Thrown when a driver's refusal RETURNED. Some only record a refusal — `visible-delta-smoke.mjs` sets
 * `process.exitCode`, and a refusal that counts and carries on is a shape more than one driver here has —
 * and a guard that returned after one would hand the driver another tree's page to measure. So the page
 * is abandoned instead.
 */
export class ServedTreeRefused extends Error {
  override readonly name = 'ServedTreeRefused';
}

/**
 * Navigate to a harness page, and refuse it — through the driver's own `fail` — unless THIS checkout's
 * harness served it. The header's policy, in the order it needs:
 *
 *  - SUBSCRIBED BEFORE THE NAVIGATION, or the document response is exactly the one never seen.
 *  - JUDGED THE MOMENT `goto` RETURNS, before the driver reads a thing: a squatter's page usually loads.
 *  - JUDGED WHEN IT FAILS TOO, whenever the document answered, before the driver can explain the failure
 *    as its own page's. A navigation no document answered has no tree to judge, so its error reaches the
 *    driver unchanged — a driver that explains failures still gets to say "nothing answered".
 *  - UNDER A STATED BOUND: the driver's `timeout` when it gives one, the measured allowance when not.
 *
 * It does not choose the wait. The drivers' pages settle on different signals, and that is theirs.
 */
export async function gotoServedTree<R>(
  page: NavigablePage<R>,
  url: string,
  options: HarnessNavigationOptions,
  fail: Refuse,
): Promise<HarnessNavigation<R>> {
  const stated: StatedNavigation = {
    waitUntil: options.waitUntil,
    timeout: options.timeout ?? DEFAULT_NAVIGATION_ALLOWANCE_MS,
  };
  const watch = watchServedTree(page);
  try {
    let response: R;
    try {
      response = await page.goto(url, stated);
    } catch (error) {
      const observation = watch.observation();
      if (observation.observed) await refuseUnlessOwn(url, observation, fail);
      throw error;
    }
    return { response, tree: await refuseUnlessOwn(url, watch.observation(), fail) };
  } finally {
    watch.stop();
  }
}

/** The tree, when this checkout's harness served `url`; otherwise the driver's refusal, and the page is never handed on. */
async function refuseUnlessOwn(url: string, observation: ServedTreeObservation, fail: Refuse): Promise<ServedTree> {
  const check = checkServedTree({ url, observation, ownDirectory: HARNESS_DIRECTORY, platform: process.platform });
  if (check.ok) return check.tree;
  await fail(check.message);
  throw new ServedTreeRefused(
    `${url} was refused (${check.verdict}), and the driver's refusal returned — so the page is abandoned, ` +
      `not measured: ${firstLine(check.message)}`,
  );
}

// --- the server's half: stamping every response ----------------------------------------------

/** Run `git` in `cwd`: its trimmed stdout, or `null` on any failure. The seam the tests substitute. */
export type RunGit = (args: readonly string[], cwd: string) => Promise<string | null>;

export interface ServedTreeSources {
  readonly runGit: RunGit;
  readonly pid: number;
  readonly now: () => Date;
}

/**
 * The real git. `windowsHide` for the reason `codeStamp.ts` gives — a server started without a console
 * would otherwise flash one per spawn — and a bound, because the stamp must never be what holds a
 * server's start up. git is a real `.exe`, so no shell.
 */
const runGit: RunGit = (args, cwd) =>
  new Promise((resolve) => {
    execFile('git', [...args], { cwd, windowsHide: true, timeout: 5_000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim());
    });
  });

/** This process, as the server that is stamping. */
export const PROCESS_SOURCES: ServedTreeSources = { runGit, pid: process.pid, now: () => new Date() };

/**
 * What a server whose pages come from `root` says about itself. The directory is the root it was GIVEN,
 * canonicalised; git is asked in that same directory, so the branch and commit describe the tree the
 * stamp names. A git answer that cannot be a ref or a sha is dropped to `null`; a detached checkout's
 * literal `HEAD` is git's real answer and is kept.
 */
export async function readServedTree(root: string, sources: ServedTreeSources = PROCESS_SOURCES): Promise<ServedTree> {
  const directory = canonicalDirectory(root);
  const [branch, commit] = await Promise.all([
    sources.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], directory),
    sources.runGit(['rev-parse', 'HEAD'], directory),
  ]);
  return {
    directory,
    pid: sources.pid,
    startedAt: sources.now().toISOString(),
    branchAtStart: branch !== null && /^\S{1,255}$/.test(branch) ? branch : null,
    commitAtStart: commit !== null && /^[0-9a-f]{40,64}$/.test(commit) ? commit : null,
  };
}

/** The slice of a Node `ServerResponse` the stamp writes to. */
export interface StampableResponse {
  setHeader(name: string, value: string): unknown;
}

/** A connect middleware, only as wide as the stamp needs — vite's `middlewares.use` accepts it. */
export type StampHandler = (request: unknown, response: StampableResponse, next: () => void) => void;

/** The slice of a `ViteDevServer` the stamp is installed on. */
export interface StampableServer {
  readonly config: { readonly root: string };
  readonly middlewares: { use(handler: StampHandler): unknown };
}

/** Stamp every response with `stamp`. The request is never read: nothing a caller sends can colour the answer. */
export function stampResponses(stamp: string): StampHandler {
  return (_request, response, next) => {
    response.setHeader(SERVED_TREE_HEADER, stamp);
    next();
  };
}

/** Read the server's OWN root once, then stamp everything it sends. Returns what it stamps. */
export async function installServedTreeStamp(
  server: StampableServer,
  sources: ServedTreeSources = PROCESS_SOURCES,
): Promise<ServedTree> {
  const tree = await readServedTree(server.config.root, sources);
  server.middlewares.use(stampResponses(encodeServedTree(tree)));
  return tree;
}

/**
 * The harness config's plugin. Registered FIRST in `vite.config.ts`, so its middleware runs ahead of
 * vite's own and the document and every module carry the stamp.
 */
export function servedTreeStamp(): Plugin {
  return {
    name: SERVED_TREE_PLUGIN,
    async configureServer(server) {
      await installServedTreeStamp(server);
    },
  };
}
