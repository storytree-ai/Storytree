// The STORE DOOR (ADR-0259 D1): the studio serves the narrow `Store` seam over ordinary HTTPS at
// `/api/store/*`, so a client that cannot open a Cloud SQL connector can still read the library.
//
// WHY THIS EXISTS AT ALL — it is an ORDERING FENCE, not a convenience. Remote sessions (Claude Code
// on the web) structurally cannot dial Cloud SQL: client-mTLS cannot survive the agent proxy's TLS
// re-termination, and no tunnel exists (ADR-0250 / ADR-0258 D2). They work today ONLY because every
// read command runs offline against the committed in-memory seed. ADR-0302 D1/D2 decommit that seed
// and drop offline as a supported mode — at which point a remote session could read NOTHING unless a
// door exists first. `session-decoupling-arc` parks this as `httpstore-lands-before-offline-drops`
// and names it the arc's one ordering constraint.
//
// WHAT IS NEW HERE, AND WHAT IS NOT. `packages/storage-protocol` already owns the whole contract:
// `store-wire.ts` (the shared wire shape), `HttpStore` (the client), and `handleStoreRequest` (the
// pure server half) — all three held to the same `storeParitySuite` as `InMemoryStore` and
// `PgLibraryStore` since ADR-0259 increment 1 (PR #983). What that increment did NOT do is wire them
// to anything: no caller, no deployed server. This module is the MOUNT — the studio's route table
// adopting the existing handler — and deliberately re-implements none of the contract. A door that
// hand-rolls its own routing is a contract that can drift.
//
// ## READ-ONLY, and that is a decision rather than an unfinished half
//
// Only the three GET routes (`get-doc`, `query-docs`, `read-events`) are admitted. The three POST
// routes are refused 403 by name, BEFORE any body is read:
//
//   - ADR-0259 D5 keeps proof-bearing writes through the door GATED behind an ADR-0081 amendment and
//     an ADR-0252 verification-integrity review, and explicitly does not lift that gate. `HttpStore`
//     is a general `Store` client with no verdict-specific path, so a door that admitted POST would
//     admit verdict-shaped docs by omission, not by decision.
//   - ADR-0254 D2 keeps `events.verdict` / `events.work_event` writes human-tethered.
//   - The arc entry's own scope is reads.
//
// The refusal is 403 (a policy refusal on a route that exists), never 404 or 405 — a client must be
// able to tell "this door does not admit writes" from "your baseUrl is wrong" (404) and from "you
// used the wrong verb" (405). Opening the write path means lifting the gate above and revisiting
// this constant, not deleting a guard someone forgot to finish.
//
// ## Authorization is the mounting server's, not this module's
//
// `handleStoreRequest` performs no authentication (its own doc comment says so, at length). This
// mount inherits the studio's existing wall instead of inventing one: hosted mode runs every
// `/api/*` request through `ApiPolicy.gate` first — IAP authenticates at the edge and injects the
// verified identity, and the members policy refuses an identity-less caller 401 and a non-member 403
// (ADR-0042 d.2, `guestPolicy.ts`). Reads are member-permitted there by the gate's method rule, so
// the door needs no rule of its own. The open localhost dev posture has no policy, exactly like every
// other route.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store, StoreRoute } from '@storytree/storage-protocol';
import { sendJson } from './httpUtil';

/** Where the door is mounted. A client's `HttpStore.baseUrl` is `<origin>` + this. */
export const STORE_DOOR_BASE_PATH = '/api/store';

/**
 * LAZY, and that is load-bearing — the vite config-load trap. `vite.config.ts` imports
 * `./server/devApi`, which imports `apiRouter.ts`, which imports this module, and vite's config is
 * loaded through Node's PLAIN ESM loader. `@storytree/storage-protocol`'s barrel re-exports
 * `./store.js` / `./store-wire.js` / `./http-store.js`, and only the `.ts` files exist — so a STATIC
 * runtime import here resolves fine under tsx (every test, the hosted server) and fails only in
 * `vite build`. `pnpm gate` does not run `vite build`, so that break is a CI-ONLY catch. Deferring
 * both imports to request time keeps them out of the config-load graph entirely — the same reason
 * `apiRouter.ts` reaches the orchestrator through `loadOrchestrator()`. Type imports above are erased
 * under `verbatimModuleSyntax` and cost nothing.
 */
async function loadStoreProtocol(): Promise<{
  routes: Record<string, StoreRoute>;
  handleStoreRequest: typeof import('@storytree/storage-protocol/http-server')['handleStoreRequest'];
}> {
  const [seam, server] = await Promise.all([
    import('@storytree/storage-protocol'),
    import('@storytree/storage-protocol/http-server'),
  ]);
  return { routes: seam.STORE_ROUTES, handleStoreRequest: server.handleStoreRequest };
}

/**
 * Just the door's dependency: the raw document store, as `LibraryBackend.docStore()` supplies it.
 * OPTIONAL exactly as it is there — only the pg backend implements it, and an absent seam is the
 * same answer as a `null` one (503 below), not a crash.
 */
export interface StoreDoorBackend {
  docStore?(): Promise<Store | null>;
}

/**
 * PURE (exported for the unit test): the door's admission decision for one already-stripped route
 * path. `null` means "admit — hand it to the wire contract's handler".
 *
 * The write set is DERIVED from the wire contract's own route table rather than hardcoded — the
 * contract's rule is "reads are GET, writes are POST", so a route added there is classified here
 * automatically and can never be admitted by an omission in this file. `routes` is passed in rather
 * than imported so this stays a pure unit AND so the module keeps no static runtime import (above).
 */
export function refuseStoreDoorWrite(
  routePath: string,
  routes: Record<string, StoreRoute>,
): { status: number; error: string } | null {
  const isWrite = Object.values(routes).some(
    (route) => route.method === 'POST' && route.path === routePath,
  );
  if (!isWrite) return null;
  return {
    status: 403,
    error:
      `the store door is read-only: ${routePath} is a write route. Proof-bearing writes through the ` +
      'door stay gated behind an ADR-0081 amendment and an ADR-0252 verification-integrity review ' +
      '(ADR-0259 D5); library writes run through the CLI against the live store.',
  };
}

/**
 * Serve one `/api/store/*` request.
 *
 * Statuses are the wire contract's (`store-wire.ts` / `handleStoreRequest`) and are load-bearing:
 * 200 for every success INCLUDING a missing document (`{ doc: null }` — 404 is never spent on an
 * absent doc, so a client can read 404 as "the door is not mounted here"), 400 malformed, 404 no such
 * route, 405 wrong verb. Two are added by this mount: 403 for a write route (above) and 503 when the
 * backend has no live store — the json/offline backend genuinely has none, and answering 200 with an
 * empty result there would tell a client the corpus is empty rather than absent.
 */
export async function handleStoreDoor(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  backend: StoreDoorBackend,
): Promise<void> {
  const routePath = url.pathname.slice(STORE_DOOR_BASE_PATH.length);
  const { routes, handleStoreRequest } = await loadStoreProtocol();

  // Refuse writes BEFORE touching the store or reading a body — a refused write must cost nothing
  // and must not depend on the backend being up.
  const refusal = refuseStoreDoorWrite(routePath, routes);
  if (refusal) return sendJson(res, refusal.status, { error: refusal.error });

  const store = await (backend.docStore?.() ?? Promise.resolve(null));
  if (!store) {
    return sendJson(res, 503, {
      error:
        'the store door needs the live store (STORYTREE_STUDIO_STORE=pg); this server is running on ' +
        'the offline json backend',
    });
  }

  // GET routes carry no body, and no other method reaches the store here, so nothing is read from
  // the request stream. `handleStoreRequest` owns routing, query decoding and error mapping.
  const { status, body } = await handleStoreRequest(
    store,
    { method: req.method ?? 'GET', path: `${routePath}${url.search}` },
    // The path is already relative to the mount point, so no prefix to strip.
    {},
  );
  sendJson(res, status, body);
}
