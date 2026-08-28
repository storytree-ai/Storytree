// The desktop's mirror of the context-traversal replay panel's three local-file reads
// (`traversal-panel-arc`, increment `desktop-serves-the-traversal-routes`).
//
//   GET /api/traversal/sessions          → the sessions with a readable local trace
//   GET /api/traversal?session=<id>      → that session's structured replay
//   GET /api/context-windows?session=<w> → that window's occupancy series (the playhead bar)
//
// ★ WHY THIS FILE EXISTS AT ALL. The desktop bundles the SAME compiled studio SPA and serves it from
// its own backend, which re-composes only a SUBSET of `apps/studio/server/apiRouter.ts`. The
// Traversal tab shipped in that bundle with `traversal-panel-bottom-tab-host` and its three fetches
// were never mirrored, so the tab answered the local-backend catch-all `404 {"error":"unknown
// endpoint"}` on the ONE surface the owner actually drives — the studio's own Terminal tab renders
// `Terminal unavailable here`, so "the replay beside a working terminal" means desktop. That made
// this arc's end-state clause 1 false where it counts. Third instance of one class
// (`/api/arcs` #1191, `/api/floor-health` #1228), and the reason its sibling increment
// `desktop-route-coverage-is-unasked` exists.
//
// ★★ THE BOUNDARY IS NOT ROUTED AROUND. This module may NOT import `apps/studio/server` (ADR-0176's
// one-wired-backend rule, enforced by `check:boundaries`), so the ROUTING is re-composed here
// verbatim. What is NOT re-composed is the substance: every value on the wire comes from the same
// packages the studio route calls — `replayTraversalSessionAllAdapters`, `computeDecisionPoints`,
// `resolveTraversalDir`, `listTraversalSessionsIncremental`, `readWindowOccupancySeries`. There is no
// second replay, no second index and no second occupancy fold, so the two surfaces cannot disagree
// about what a trace contains for the same reason the studio and `storytree traversal show` cannot.
// `listTraversalSessionsIncremental` was MOVED into @storytree/context-traversal-capture by this
// increment for exactly that reason: copying it would have created a second cache carrying the same
// deep-equality obligation with nothing binding the two, which is how `/api/activity` drifted twice.
//
// ★★★ WHAT IS HAND-COPIED, AND THEREFORE WHAT `check:mirror-conformance` WATCHES: the ENVELOPE. The
// method guard and its stated reason, the two id-containment guards, the honest-EMPTY index answer,
// the 404-vs-200 fork for an unreadable trace (a file that is ABSENT is a 404; a file whose lines
// were ALL corrupt serves 200 with `skipped > 0`, because that is something observed — ADR-0241 D5),
// and `/api/context-windows`'s deliberate NON-404 for a window with no transcript. Every one of
// those is a DECISION this copy could silently lose, and the loss would be invisible: the compiled
// panel renders "no trace here" differently from "this session traversed nothing", and a mirror that
// 404'd an absent transcript would send an operator looking for a missing route.
//
// LOCAL ONLY, the owner's decision of 2026-08-10 rather than an unfinished edge: traces and host
// transcripts are per-machine. On the desktop that is not even a caveat — the desktop IS the
// operator's machine, which is why the panel has more to say here than on hosted Cloud Run.
//
// ⚠ THE LAZY LOADERS ARE COPIED TOO, AND DELIBERATELY. On the studio side they dodge a vite
// config-load trap; here the reason is narrower but real — this sidecar starts on every app launch,
// and these three packages cost a measured ~6 s of import on a cold read. `primeTraversalRoutes()`
// moves that off the first request the way `primeTraversalIndex` does for the studio, and a fault
// inside a lazy loader degrades to a slow first request rather than a sidecar that will not start.

import type { IncomingMessage, ServerResponse } from "node:http";

// Type-only, so all three are fully erased under `verbatimModuleSyntax`; the runtime values come
// from the lazy loaders below.
import type { TraversalReplayView } from "@storytree/context-traversal-spawn";
import type { DecisionPointReport } from "@storytree/context-traversal-capture";

type SpawnModule = typeof import("@storytree/context-traversal-spawn");
let spawnModulePromise: Promise<SpawnModule> | null = null;
function loadTraversalReplay(): Promise<SpawnModule> {
  return (spawnModulePromise ??= import("@storytree/context-traversal-spawn"));
}

type CaptureModule = typeof import("@storytree/context-traversal-capture");
let captureModulePromise: Promise<CaptureModule> | null = null;
function loadTraversalSink(): Promise<CaptureModule> {
  return (captureModulePromise ??= import("@storytree/context-traversal-capture"));
}

type TranscriptModule = typeof import("@storytree/context-traversal-transcript");
let transcriptModulePromise: Promise<TranscriptModule> | null = null;
function loadTranscripts(): Promise<TranscriptModule> {
  return (transcriptModulePromise ??= import("@storytree/context-traversal-transcript"));
}

/**
 * A status-carrying refusal, mapped to `{ error }` by {@link createTraversalRoutes}'s own catch.
 *
 * Local to this module rather than shared: the studio's `HttpError` lives in
 * `apps/studio/server/httpUtil.ts`, which this file may not import (ADR-0176), and the desktop's
 * `local-backend.ts` keeps its own for the same reason. Four lines, and the alternative is a
 * boundary violation.
 */
class TraversalHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data, null, 2));
}

/**
 * A session id may only be a flat token: it becomes a FILENAME (`<sessionId>.jsonl`) inside the trace
 * dir and the sink joins that path itself, so an id carrying a separator or a `..` segment would be a
 * filesystem escape. Deliberately STRICTER than containment — no path separator can appear at all, so
 * the join cannot leave the directory by construction.
 *
 * The same rule as the studio's `SESSION_ID` / `WINDOW_ID`, and copied for the same reason those two
 * are copies of each other: it is four characters wide, and the alternative is a cross-surface import.
 * `check:mirror-conformance` compares what the two surfaces ANSWER for a bad id, which is the half
 * that matters.
 */
const FLAT_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** `GET /api/traversal/sessions` — the index the panel's session picker reads. */
interface TraversalSessionsWire {
  /**
   * WHERE this server looked. On the wire because "no sessions" and "no traces under the directory I
   * was pointed at" are different facts, and a picker that renders the first without the second gives
   * an operator nothing to check.
   */
  readonly dir: string;
  readonly sessions: readonly {
    readonly sessionId: string;
    readonly eventCount: number;
    /** `null` when no event in the trace carried a usable timestamp — never a fabricated "now". */
    readonly lastObservedAt: string | null;
  }[];
}

interface TraversalReplayWire extends TraversalReplayView {
  readonly decisionPoints: DecisionPointReport;
}

/**
 * Pull the three lazily-imported packages and build the trace index ONCE, off the request path.
 *
 * Fire-and-forget and failure-tolerant by design, the posture `primeTraversalIndex` takes in the
 * studio: a machine with no trace dir resolves to an empty list, and any fault here must degrade to
 * "the first request pays what it used to", never to a sidecar that will not start.
 */
export async function primeTraversalRoutes(): Promise<void> {
  try {
    const { resolveTraversalDir, listTraversalSessionsIncremental } = await loadTraversalSink();
    listTraversalSessionsIncremental(resolveTraversalDir());
    await loadTranscripts();
  } catch {
    // Priming is an optimisation, never a precondition.
  }
}

async function serveSessions(res: ServerResponse): Promise<void> {
  const { resolveTraversalDir, listTraversalSessionsIncremental } = await loadTraversalSink();
  const dir = resolveTraversalDir();
  const wire: TraversalSessionsWire = {
    dir,
    sessions: listTraversalSessionsIncremental(dir).map((session) => ({
      sessionId: session.sessionId,
      eventCount: session.eventCount,
      lastObservedAt: session.lastObservedAt ?? null,
    })),
  };
  // An absent or empty trace dir is an EMPTY LIST, never an error: a machine that has captured
  // nothing yet is a normal state.
  sendJson(res, 200, wire);
}

async function serveReplay(res: ServerResponse, url: URL): Promise<void> {
  const { resolveTraversalDir, computeDecisionPoints } = await loadTraversalSink();
  const dir = resolveTraversalDir();

  const sessionId = url.searchParams.get("session");
  if (sessionId === null || sessionId === "") {
    throw new TraversalHttpError(
      400,
      "GET /api/traversal?session=<sessionId> — which captured session should be replayed?",
    );
  }
  if (!FLAT_TOKEN.test(sessionId)) {
    throw new TraversalHttpError(
      400,
      `invalid session id "${sessionId}" — a session id is a flat token (letters, digits, ".", "_", "-")`,
    );
  }

  const { replayTraversalSessionAllAdapters } = await loadTraversalReplay();
  const view = replayTraversalSessionAllAdapters(sessionId, { dir });

  // Nothing readable AT ALL — no usable event and not even a line the reader had to skip — so this
  // machine holds no trace for that id. 404 rather than an empty replay: an empty picture would tell
  // the panel "this session traversed nothing", which is a claim about the session rather than about
  // the absence of its file. A trace whose lines were ALL corrupt is a different answer and serves
  // 200: `skipped > 0` is something observed (ADR-0241 D5).
  if (view.events.length === 0 && view.skipped === 0) {
    throw new TraversalHttpError(404, `no readable trace for session "${sessionId}" under ${dir}`);
  }

  const wire: TraversalReplayWire = { ...view, decisionPoints: computeDecisionPoints(view.events) };
  sendJson(res, 200, wire);
}

async function serveContextWindows(res: ServerResponse, url: URL): Promise<void> {
  const windowId = url.searchParams.get("session");
  // REQUIRED since ADR-0456 D1 retired the list mode. Refused by name rather than defaulting to
  // something: a caller who omits it is asking the question this route stopped answering, and a
  // silent fallback would hand them an answer to a different one.
  if (windowId === null || windowId === "") {
    throw new TraversalHttpError(
      400,
      "GET /api/context-windows?session=<windowId> — which host context window should be read? (the machine-wide list retired with the standalone Context tab, ADR-0456 D1)",
    );
  }
  if (!FLAT_TOKEN.test(windowId)) {
    throw new TraversalHttpError(
      400,
      `invalid window id "${windowId}" — a host window id is a flat token (letters, digits, ".", "_", "-")`,
    );
  }
  const { readWindowOccupancySeries } = await loadTranscripts();
  // NOT a 404 when nothing is found. A window with no transcript is an ABSENCE the caller has to
  // render as one — "no reading was observed for this window" — and a 404 would be read as "the
  // route is missing", which sends an operator somewhere else entirely.
  sendJson(res, 200, await readWindowOccupancySeries({ windowId }));
}

/**
 * The dispatcher for the replay panel's three reads, in the fall-through shape the Electron main's
 * chain mounts (`chat-sse-mount` / `chat-reset-route`): `true` when it handled the path, `false` to
 * let the chain continue to `local-backend`'s own 404.
 *
 * It owns its own error mapping rather than throwing into the chain's outer catch, which answers 500
 * for everything. The studio answers 400 / 404 / 405 here and the compiled panel reads those apart,
 * so a copy that collapsed them into 500 would be present, reachable, and still wrong.
 */
export function createTraversalRoutes(): (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) => Promise<boolean> {
  return async (req, res, pathname): Promise<boolean> => {
    if (
      pathname !== "/api/traversal" &&
      pathname !== "/api/traversal/sessions" &&
      pathname !== "/api/context-windows"
    ) {
      return false;
    }

    try {
      // Read-only by decision, not omission: a trace is an observation record and a transcript is
      // the harness's own, and nothing in this arc writes either from a UI — so a non-GET is refused
      // by name rather than falling through to a 404 that would read as "no such route".
      if ((req.method ?? "GET") !== "GET") {
        throw new TraversalHttpError(
          405,
          pathname === "/api/context-windows"
            ? "method not allowed — the occupancy read is read-only (a transcript is the harness’s own record)"
            : "method not allowed — the traversal replay is read-only (a trace is an observation record)",
        );
      }

      // The chain hands this mount a PATHNAME, never a URL, so the query string is parsed from the
      // raw request here. The base is a placeholder: only the search params are read from it.
      const url = new URL(req.url ?? "/", "http://localhost");

      if (pathname === "/api/traversal/sessions") await serveSessions(res);
      else if (pathname === "/api/traversal") await serveReplay(res, url);
      else await serveContextWindows(res, url);
    } catch (err) {
      if (err instanceof TraversalHttpError) sendJson(res, err.status, { error: err.message });
      else sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  };
}
