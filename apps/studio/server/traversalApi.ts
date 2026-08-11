// The context-traversal READ route (`traversal-panel-arc`, increment `traversal-panel-read-route`):
// one session's replayed traversal, shaped for the replay panel rather than for a terminal.
//
//   GET /api/traversal/sessions        → the sessions with a readable local trace
//   GET /api/traversal?session=<id>    → that session's structured replay
//
// LOCAL ONLY, and that is the owner's decision of 2026-08-10 rather than an unfinished edge. Traces
// are per-machine, metadata-only JSONL under `~/.storytree/traces` (`STORYTREE_TRAVERSAL_DIR`
// overrides), written by the capture sink in this operator's own CLI processes (ADR-0241). So this
// route answers richly under `pnpm --filter studio dev` and honestly EMPTY on hosted Cloud Run, whose
// container has no operator traces. There is deliberately no fallback that invents a series, and
// shipping traces anywhere shared is explicitly out of scope for the arc.
//
// It DERIVES NOTHING (the handleArcs / handleFloorHealth posture): every value on the wire comes from
// the sink's own readers — `replayTraversalSessionAllAdapters` for the replay, and, for the index,
// `readTraversalSession` per file under `listTraversalSessions`'s own rules (traversalIndexMemo.ts,
// which re-reads only the traces whose mtime+size moved, and is held to DEEP EQUALITY with
// `listTraversalSessions` by test). That is the SAME composition `storytree traversal show` renders, so
// the panel and the CLI can never disagree about what a trace contains, or about which adapters'
// coverage that content sits under. This file adds routing, the method check, the session-id
// containment guard, and the honest empty answer.

import type { IncomingMessage, ServerResponse } from 'node:http';

import { HttpError, sendJson } from './httpUtil';
import { listTraversalSessionsIncremental } from './traversalIndexMemo';

// Type-only, so both are fully erased under `verbatimModuleSyntax` and never reach the vite
// config-load graph — the runtime values are pulled by the lazy loaders below for exactly the reason
// `loadNoticeBoard`/`loadDrive` are lazy in apiRouter.ts: vite.config.ts loads devApi.ts → apiRouter.ts
// through Node's plain ESM loader, where these packages' `./sink.js`-style internal specifiers do not
// resolve (only the .ts files exist). `pnpm gate` does not run `vite build`, so a static import here
// would break the dev server with only CI Build to catch it.
import type { TraversalReplayView } from '@storytree/context-traversal-spawn';
import type { DecisionPointReport, TraversalSessionSummary } from '@storytree/context-traversal-capture';

type SpawnModule = typeof import('@storytree/context-traversal-spawn');
let spawnModulePromise: Promise<SpawnModule> | null = null;
function loadTraversalReplay(): Promise<SpawnModule> {
  return (spawnModulePromise ??= import('@storytree/context-traversal-spawn'));
}

type CaptureModule = typeof import('@storytree/context-traversal-capture');
let captureModulePromise: Promise<CaptureModule> | null = null;
function loadTraversalSink(): Promise<CaptureModule> {
  return (captureModulePromise ??= import('@storytree/context-traversal-capture'));
}

/**
 * The picker's index, re-reading only the traces whose (mtime, size) moved since the last request
 * (`traversalIndexMemo.ts`, which carries the measurements and the freshness argument).
 *
 * It DERIVES NOTHING the sink would not: the per-file summary below is `listTraversalSessions`'s own
 * body — same tolerant read, same omission of a session that replays to zero usable events, same
 * `lastObservedAt` off the chronologically last event — and a parity test deep-compares the two over
 * the same directory, so the panel and `storytree traversal list` still cannot disagree.
 */
async function readTraversalIndex(dir: string): Promise<TraversalSessionSummary[]> {
  const { readTraversalSession } = await loadTraversalSink();
  return listTraversalSessionsIncremental(dir, (sessionDir, sessionId) => {
    const { replay } = readTraversalSession({ dir: sessionDir, sessionId });
    if (replay.events.length === 0) return null;
    const lastEvent = replay.events[replay.events.length - 1];
    return { sessionId, eventCount: replay.events.length, lastObservedAt: lastEvent?.at };
  });
}

/**
 * Pull the two lazily-imported traversal modules and build the index ONCE, off the request path.
 *
 * The cold number is the one that hurts most and the one no cache can reach: 6.3 s measured for the
 * first `/api/traversal/sessions` against a fresh dev server, almost all of it the lazy
 * `@storytree/context-traversal-capture` import itself. Unprimed, that cost lands on the FIRST page
 * load — which is exactly the load an owner meets when the panel is staged for attestation. Priming
 * moves it to server start, where nobody is holding an abort signal.
 *
 * Fire-and-forget and failure-tolerant by design: a machine with no trace dir resolves to an empty
 * list, and any fault here must degrade to "the first request pays what it used to", never to a dev
 * server that will not start.
 */
export async function primeTraversalIndex(): Promise<void> {
  try {
    const { resolveTraversalDir } = await loadTraversalSink();
    await readTraversalIndex(resolveTraversalDir());
  } catch {
    // Priming is an optimisation, never a precondition.
  }
}

/** `GET /api/traversal/sessions` — the index the panel's session picker reads. */
export interface TraversalSessionsWire {
  /**
   * WHERE this server looked. On the wire because "no sessions" and "no traces under the directory I
   * was pointed at" are different facts, and a picker that renders the first without the second gives
   * an operator nothing to check (the trace dir is per-machine and `STORYTREE_TRAVERSAL_DIR` moves it).
   */
  readonly dir: string;
  /**
   * One entry per session with a READABLE trace. A file that replays to zero usable events is omitted
   * by the sink's own `listTraversalSessions`, so this list is exactly the CLI's `traversal list`.
   */
  readonly sessions: readonly TraversalSessionWire[];
}

export interface TraversalSessionWire {
  readonly sessionId: string;
  readonly eventCount: number;
  /** `null` when no event in the trace carried a usable timestamp — never a fabricated "now". */
  readonly lastObservedAt: string | null;
}

/**
 * A session id may only be a flat token: it becomes a FILENAME (`<sessionId>.jsonl`) inside the trace
 * dir, and the sink joins that path itself, so an id carrying a separator or a `..` segment would be a
 * filesystem escape the same way an unchecked `storyId` would be (see `containedPath` in apiRouter.ts).
 *
 * This is deliberately STRICTER than containment rather than a second copy of it: no path separator can
 * appear at all, so the join cannot leave the directory by construction. (The shared `containedPath`
 * guard is not reused here only because it lives in apiRouter.ts, which imports this module.) Real ids
 * are worktree-derived slugs like `nice-bose-6e4501`, so the allow-list costs a caller nothing.
 */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * `GET /api/traversal?session=<id>` — one session's structured replay, PLUS the honesty the panel is
 * required to render: the installed adapters' coverage declarations, the caveats the closed feature
 * enum cannot state, the tolerant reader's `skipped` count, and what may be said about occupancy.
 *
 * A partial trace must never present as complete (ADR-0241 D5), which is why `skipped`/`partial` ride
 * the same payload rather than being an optional extra a consumer might not fetch.
 */
export interface TraversalReplayWire extends TraversalReplayView {
  /**
   * The offer/follow join for this trace, and it rides the SAME payload for the same reason `skipped`
   * does: an offer fan drawn without its denominator over-reports how often a session stayed inside
   * the asset graph (ADR-0312 D6), so the thing that makes the fan honest is not an optional extra
   * fetch a consumer might skip.
   *
   * COMPUTED HERE RATHER THAN IN THE BROWSER, and that is the point: `isFollowableOfferId` and the
   * candidate/edge join are one tested classifier in `context-traversal-capture`
   * (`decision-point-playback.ts`) that `storytree traversal show` already renders from. It lives in a
   * node-only package the studio's bundle may not take, so the choice was to mirror the rule client-
   * side or to run the real one here. A second copy of "which offers could ever be followed" is
   * exactly how the panel and the CLI would come to disagree about a trace — so the route composes it,
   * the same way it composes the replay itself, and DERIVES nothing of its own.
   */
  readonly decisionPoints: DecisionPointReport;
}

/**
 * Dispatch one `/api/traversal*` request. Read-only by decision, not omission: a trace is an
 * observation record, and nothing in this arc writes one from a UI — so a non-GET is refused by name.
 */
export async function handleTraversal(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    throw new HttpError(405, 'method not allowed — the traversal replay is read-only (a trace is an observation record)');
  }

  // `listTraversalSessions` is no longer pulled here: the picker's index goes through
  // `readTraversalIndex` above, which calls the sink per CHANGED file instead of replaying the whole
  // directory per request. `computeDecisionPoints` (PR #1284) is untouched by that.
  const { resolveTraversalDir, computeDecisionPoints } = await loadTraversalSink();
  const dir = resolveTraversalDir();

  if (url.pathname === '/api/traversal/sessions') {
    const summaries: TraversalSessionSummary[] = await readTraversalIndex(dir);
    const wire: TraversalSessionsWire = {
      dir,
      sessions: summaries.map((session) => ({
        sessionId: session.sessionId,
        eventCount: session.eventCount,
        lastObservedAt: session.lastObservedAt ?? null,
      })),
    };
    // An absent or empty trace dir is an EMPTY LIST, never an error: a machine that has captured
    // nothing yet (and the hosted container, which captures nothing ever) is a normal state.
    sendJson(res, 200, wire);
    return;
  }

  const sessionId = url.searchParams.get('session');
  if (sessionId === null || sessionId === '') {
    throw new HttpError(400, 'GET /api/traversal?session=<sessionId> — which captured session should be replayed?');
  }
  if (!SESSION_ID.test(sessionId)) {
    throw new HttpError(400, `invalid session id "${sessionId}" — a session id is a flat token (letters, digits, ".", "_", "-")`);
  }

  const { replayTraversalSessionAllAdapters } = await loadTraversalReplay();
  const view = replayTraversalSessionAllAdapters(sessionId, { dir });

  // Nothing was readable AT ALL — no usable event and not even a line the reader had to skip — so this
  // machine holds no trace for that id. 404 rather than an empty replay: an empty picture would tell
  // the panel "this session traversed nothing", which is a claim about the session rather than about
  // the absence of its file. A trace whose lines were ALL corrupt is a different answer and serves
  // 200: `skipped > 0` is something observed, and reporting it is the whole point of ADR-0241 D5.
  if (view.events.length === 0 && view.skipped === 0) {
    throw new HttpError(404, `no readable trace for session "${sessionId}" under ${dir}`);
  }

  const wire: TraversalReplayWire = { ...view, decisionPoints: computeDecisionPoints(view.events) };
  sendJson(res, 200, wire);
}
