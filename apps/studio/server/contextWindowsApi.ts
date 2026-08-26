// The CONTEXT WINDOW METER's read route (`linked-session-context-arc`, increment
// `make-the-single-window-meter-useful`) — ADR-0452 D1/D2.
//
//   GET /api/context-windows   → this machine's recent session windows, each with its own fullness
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
// WHY THIS EXISTS BESIDE `/api/traversal`. The occupancy bar in the replay panel plots a series at a
// PLAYHEAD, for one trace an operator has picked out of a rail. That answers "how did this session's
// window move while it ran". It cannot answer the question ADR-0411 actually made load-bearing —
// "how full is a window, against the marks that decide whether it takes on more work" — because
// reaching it costs a pick and a scrub, and because it reads INGESTED traces.
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
} from '@storytree/context-traversal-transcript';

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
export async function handleContextWindows(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    throw new HttpError(
      405,
      'method not allowed — the context-window meter is read-only (a transcript is the harness’s own record)',
    );
  }
  sendJson(res, 200, await readContextWindows());
}
