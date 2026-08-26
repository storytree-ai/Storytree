// The CONTEXT WINDOW METER's read route (`linked-session-context-arc`, increment
// `make-the-single-window-meter-useful`) — ADR-0452 D1/D2.
//
//   GET /api/context-windows              → this machine's recent session windows, each with its fullness
//   GET /api/context-windows?session=<id> → ONE window's whole occupancy series, with instants
//
// ★ THE FOLD IS NOT HERE ANY MORE, AND THAT IS THE POINT. It was written in this file, which was
// right while the widget was the only reader; `storytree context` (increment
// `hand-a-running-session-its-own-occupancy`) is the second, and the CLI must not import
// `apps/studio`. It now lives beside the transcript reader it already used, in
// `@storytree/context-traversal-transcript` (`context-windows.ts`), where both surfaces call ONE
// body. A thinner second fold in the CLI was the alternative and was rejected for the reason that
// package's own doc gives about a second copy of "what counts as a resident total": two folds is
// how two surfaces come to describe one transcript differently. This file is now the HTTP half —
// the method refusal, the priming call, and the JSON — and derives nothing of its own.
//
// ★ THE SESSION MODE IS WHAT MAKES THE REPLAY PANEL'S OWN BAR WORK (ADR-0456 D2), and it is a
// REPOINT rather than a new surface. That bar has been in the owner-signed design since
// `traversal-panel-spine-render` and has never drawn a real reading on this machine: it plots the
// replayed TRACE, and `residentInputTokens` reaches a trace only through an explicit
// `storytree traversal ingest` — 2 of 697 local traces carry it. Sourced from the ambient host
// transcripts through this route instead, the same bar answers for 25 of the 30 most recent traces
// (measured 2026-08-26). ADR-0456 D1 retires the standalone Context tab that the list mode above
// feeds; this route survives the retirement because the panel dials it.
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
// are per-machine. Hosted Cloud Run holds none, so it answers an honest empty list rather than
// inventing one, and there is deliberately no fallback that manufactures a series.

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

export type {
  ContextHelperWire,
  ContextScanWire,
  ContextWindowWire,
  ContextWindowsWire,
  WindowSeriesRead,
} from '@storytree/context-traversal-transcript';

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
export async function readWindowSeries(
  windowId: string,
): Promise<import('@storytree/context-traversal-transcript').WindowSeriesRead> {
  const { readWindowOccupancySeries } = await loadTranscripts();
  return readWindowOccupancySeries({ windowId });
}

/**
 * This machine's recent session windows, newest first.
 *
 * Kept as a named export rather than inlined into the handler because the priming call below and
 * the integration suite both reach for the same body — a second call shape beside it is how one of
 * them ends up bounded differently from the other.
 */
export async function readContextWindows(): Promise<
  import('@storytree/context-traversal-transcript').ContextWindowsWire
> {
  const { readContextWindows: fold } = await loadTranscripts();
  return fold();
}

/**
 * Pull the lazily-imported transcript module and take the first reading OFF the request path.
 *
 * The same move `primeTraversalIndex` makes and for the same measured reason: the lazy import is
 * most of the cold cost, and unprimed it lands on the FIRST click — which is exactly the click an
 * owner makes when the widget is staged for a LOOK. Fire-and-forget and failure-tolerant: a machine
 * with no transcript root resolves to an empty answer, and any fault here must degrade to "the first
 * request pays what it used to", never to a dev server that will not start.
 */
export async function primeContextWindows(): Promise<void> {
  try {
    await readContextWindows();
  } catch {
    // Priming is an optimisation, never a precondition.
  }
}

/**
 * Dispatch `GET /api/context-windows`. Read-only by decision, not omission: a transcript is the
 * harness's own record and nothing in this arc writes one from a UI — so a non-GET is refused by
 * name, the posture `handleTraversal` already takes.
 */
export async function handleContextWindows(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    throw new HttpError(
      405,
      'method not allowed — the context-window meter is read-only (a transcript is the harness’s own record)',
    );
  }

  const windowId = url.searchParams.get('session');
  if (windowId !== null) {
    if (windowId === '' || !WINDOW_ID.test(windowId)) {
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
    return;
  }

  sendJson(res, 200, await readContextWindows());
}
