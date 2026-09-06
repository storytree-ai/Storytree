// The TRAVERSAL PANEL's occupancy read route (`linked-session-context-arc`, increments
// `make-the-single-window-meter-useful` / `merge-the-context-meter-into-the-traversal-surface`) —
// ADR-0452 D1/D2, repointed by ADR-0456 D2.
//
//   GET /api/context-windows?session=<windowId> → ONE window's occupancy series AND its composition
//
// ★ IT CARRIES TWO READINGS OF ONE FILE SINCE ADR-0524, and that is deliberate rather than
//   accreted. The panel's vertical occupancy bar is REMOVED and a horizontal COMPOSITION bar takes
//   its place, so what the panel needs from this route changed — but the window still has to be
//   resolved to a transcript, and `readWindowOccupancySeries` is what does that (a walk over every
//   transcript, then one read). Composing here reuses that resolution: `scan.file` names the file,
//   so the composition costs a read rather than a second walk. A SEPARATE route would have paid the
//   walk twice and given two readers of one transcript a way to disagree, which is the failure
//   `context-window-composition-arc` exists to remove. The occupancy half STAYS on the wire: the
//   composition's harness floor is derived from the same resident figure, and `storytree context`
//   reads the same pair.
//
// ★ IT SERVES THE REPLAY PANEL'S OWN BAR, and it is a REPOINT rather than a new surface. That bar
// has been in the owner-signed design since `traversal-panel-spine-render` and had never drawn a
// real reading on this machine: it plots the replayed TRACE, and `residentInputTokens` reaches a
// trace only through an explicit `storytree traversal ingest` — 2 of 697 local traces carry it.
// Sourced from the ambient host transcripts through this route, the same bar answers for 25 of the
// 30 most recent traces (measured 2026-08-26).
//
// ★★ THE LIST MODE IS GONE (ADR-0456 D1). `GET /api/context-windows` with no `session` used to
// answer this machine's twelve most recent windows, for a standalone "Context" tab in the bottom
// panel. The owner corrected the referent of the answer that authorised that tab — "the widget" had
// always meant the context traversal surface — so the tab retires and its route mode with it. The
// FOLD it read (`readContextWindows`) is untouched in
// `@storytree/context-traversal-transcript`: ADR-0456 D3 names it machinery rather than surface, and
// `storytree context` reads its sibling. What retired here is one HTTP shape, not a reader.
//
// WHY IT IS SERVED BESIDE `/api/traversal` RATHER THAN INSIDE IT. `/api/traversal` composes ONE
// session's replay out of the sink's own readers and derives nothing — that is the invariant its
// own header states, and it is what keeps the panel and `storytree traversal show` unable to
// disagree about what a trace contains. A transcript is not in the trace; folding an ambient
// filesystem read into that composition would change what a REPLAY means for the CLI too, and
// `traversal-panel-arc`'s record warns in as many words against half-doing that inside a UI
// increment. So the panel assembles one picture from two calls, which is the cost this route
// accepts in exchange for leaving the replay a replay.
//
// LOCAL ONLY, the same call ADR-0241 / the owner's 2026-08-10 decision made for traces: transcripts
// are per-machine. Hosted Cloud Run holds none, so it answers an honest absence rather than
// inventing a series, and there is deliberately no fallback that manufactures one.

import type { IncomingMessage, ServerResponse } from 'node:http';

import { HttpError, sendJson } from './httpUtil';

// Type-only, so it is fully erased under `verbatimModuleSyntax` and never reaches the vite
// config-load graph — the runtime value is pulled by the lazy loader below, for exactly the reason
// traversalApi.ts loads its two packages lazily: vite.config.ts loads devApi.ts → apiRouter.ts
// through Node's plain ESM loader, where this package's `./transcript-occupancy.js`-style internal
// specifiers do not resolve (only the .ts files exist). `pnpm gate` does not run `vite build`, so a
// static import here would break the dev server with only CI Build to catch it.
type TranscriptModule = typeof import('@storytree/context-traversal-transcript');
let transcriptModulePromise: Promise<TranscriptModule> | null = null;
function loadTranscripts(): Promise<TranscriptModule> {
  return (transcriptModulePromise ??= import('@storytree/context-traversal-transcript'));
}

export type { WindowSeriesRead } from '@storytree/context-traversal-transcript';

export type { WindowSeriesWithComposition } from '@storytree/context-traversal-transcript';
type WindowSeriesWithComposition = import('@storytree/context-traversal-transcript').WindowSeriesWithComposition;

/**
 * A window id may only be a flat token. It is matched against a transcript FILE's base name inside
 * the transcript root, so an id carrying a separator or a `..` segment would be a filesystem escape
 * — the same guard, and deliberately the same shape, as `traversalApi.ts`'s `SESSION_ID`. It is
 * duplicated rather than shared because that module imports apiRouter.ts's sibling and this one
 * must not grow an import of it; the rule is four characters wide and the two are asserted apart.
 */
const WINDOW_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * ONE window's occupancy series, from that window's own host transcript.
 *
 * Named beside {@link readContextWindows} for the same reason it is named at all: the integration
 * suite and the handler reach for one body, so neither can be bounded differently from the other.
 */
export async function readWindowSeries(windowId: string): Promise<WindowSeriesWithComposition> {
  const { readWindowSeriesWithComposition } = await loadTranscripts();
  // The ASSEMBLY lives in the package, not here (ADR-0524). The desktop backend serves a
  // byte-identical copy of this route and `check:mirror-conformance` holds the two together; a
  // payload each side built for itself is precisely how they drift, which that check caught on this
  // increment's first gate run.
  return readWindowSeriesWithComposition({ windowId });
}

/**
 * Pull the lazily-imported transcript module OFF the request path.
 *
 * The same move `primeTraversalIndex` makes and for the same measured reason: the lazy import is
 * most of the cold cost, and unprimed it lands on the FIRST request — which here is the first trace
 * an operator opens in the traversal panel. It primes the MODULE rather than taking a reading, since
 * this route now answers per window and there is no window to name before one is picked (it used to
 * warm the twelve-window list the retired Context tab read). Fire-and-forget and failure-tolerant:
 * any fault here must degrade to "the first request pays what it used to", never to a dev server
 * that will not start.
 */
export async function primeContextWindows(): Promise<void> {
  try {
    await loadTranscripts();
  } catch {
    // Priming is an optimisation, never a precondition.
  }
}

/**
 * Dispatch `GET /api/context-windows?session=<windowId>`. Read-only by decision, not omission: a
 * transcript is the harness's own record and nothing in this arc writes one from a UI — so a non-GET
 * is refused by name, the posture `handleTraversal` already takes.
 */
export async function handleContextWindows(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    throw new HttpError(
      405,
      'method not allowed — the occupancy read is read-only (a transcript is the harness’s own record)',
    );
  }

  const windowId = url.searchParams.get('session');
  // REQUIRED since ADR-0456 D1 retired the list mode. Refused by name rather than defaulting to
  // something: a caller who omits it is asking the question this route stopped answering, and a
  // silent fallback would hand them an answer to a different one.
  if (windowId === null || windowId === '') {
    throw new HttpError(
      400,
      'GET /api/context-windows?session=<windowId> — which host context window should be read? (the machine-wide list retired with the standalone Context tab, ADR-0456 D1)',
    );
  }
  if (!WINDOW_ID.test(windowId)) {
    throw new HttpError(
      400,
      `invalid window id "${windowId}" — a host window id is a flat token (letters, digits, ".", "_", "-")`,
    );
  }
  // NOT a 404 when nothing is found. A window with no transcript is an ABSENCE the caller has to
  // render as one — "no reading was observed for this window" — and a 404 would be read as "the
  // route is missing", which sends an operator somewhere else entirely. The answer carries its own
  // reason and the denominator it searched.
  sendJson(res, 200, await readWindowSeries(windowId));
}
