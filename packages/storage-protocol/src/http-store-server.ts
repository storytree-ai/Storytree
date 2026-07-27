import type { DeleteDocOpts, Store } from "./store.js";
import {
  STORE_ROUTES,
  StoreWireError,
  decodeAppendEventRequest,
  decodeDeleteDocRequest,
  decodeUpsertDocRequest,
  type StoreRouteName,
} from "./store-wire.js";

/**
 * The SERVER half of the store wire contract (ADR-0259 D1): a transport-agnostic adapter that turns
 * one HTTP request into one {@link Store} call.
 *
 * It ships alongside the client so the contract in `store-wire.ts` is executable on both sides. A
 * door that hand-rolls its own routing is a contract that can drift; a door that mounts this one
 * cannot — and the parity proof (`http-store.test.ts` runs `storeParitySuite` over a real socket
 * with this handler behind it) covers the pair, not just the client.
 *
 * PURE on purpose — no `node:http`, no framework. It takes a method, a path and an already-parsed
 * body, and returns a status and a body; the mounting server owns sockets, body reading, and
 * logging. That is what lets the SAME handler sit behind the studio server, the desktop backend
 * (ADR-0259 D2 — the desktop app is the local door), and a `node:http` server in a test.
 *
 * WHAT IT IS NOT: an authorization layer. It performs no authentication, no role check, and no
 * attribution check — a door mounts it BEHIND those (the studio's IAP identity + the ADR-0117
 * `mayBrokerWrite` role wall, as `/api/write-broker` already does). Mounting this on an
 * unauthenticated route would expose the store to anyone who can reach it.
 *
 * It is also NOT a path for proof-bearing writes. ADR-0259 D5 keeps verdict persistence gated
 * behind an ADR-0081 amendment and an ADR-0252 verification-integrity review: a door that admits
 * verdicts must RE-VERIFY signature and source anchor, which is exactly the machinery this generic
 * adapter does not have. Ordinary docs and events only.
 */

export interface StoreRequest {
  /** The HTTP method, e.g. `"GET"`. */
  method: string;
  /** Request target including any query string, e.g. `"/get-doc?id=u1"`. */
  path: string;
  /** The parsed JSON body for POST routes; `undefined` for GET (or an empty body). */
  body?: unknown;
}

export interface StoreResponse {
  status: number;
  /** JSON-serializable; a {@link StoreErrorResponse} for any non-2xx status. */
  body: unknown;
}

export interface HandleStoreRequestOptions {
  /**
   * Mount prefix to strip before matching, e.g. `"/api/store"` when the door is mounted there.
   * Defaults to `""` (the path is already relative to the mount point). A request whose path does
   * not start with the prefix is a 404.
   */
  basePath?: string;
}

/** Only used to build a base for `URL` parsing; never dialled. */
const PARSE_ORIGIN = "http://store.invalid";

function err(status: number, message: string): StoreResponse {
  return { status, body: { error: message } };
}

function routeAt(pathname: string): { name: StoreRouteName; method: string } | undefined {
  for (const [name, route] of Object.entries(STORE_ROUTES)) {
    if (route.path === pathname) return { name: name as StoreRouteName, method: route.method };
  }
  return undefined;
}

/**
 * Handle one store request.
 *
 * Status codes are load-bearing and narrow:
 *   - `200` — every success, including `getDoc` of an absent id (`{ doc: null }`). 404 is NOT spent
 *     on a missing document; see the rationale in `store-wire.ts`.
 *   - `400` — a malformed body or a missing required query parameter.
 *   - `404` — no such route. This is what tells a client its `baseUrl` is wrong or the door is not
 *     mounted, which is only a usable signal because a missing doc never returns it.
 *   - `405` — the route exists but not for this method.
 *   - `500` — the backing store threw. The mounting server should log the cause; the message is
 *     surfaced so a client sees something better than an opaque failure.
 */
export async function handleStoreRequest(
  store: Store,
  req: StoreRequest,
  options?: HandleStoreRequestOptions,
): Promise<StoreResponse> {
  const basePath = (options?.basePath ?? "").replace(/\/+$/, "");

  let url: URL;
  try {
    url = new URL(req.path, PARSE_ORIGIN);
  } catch {
    return err(400, `unparseable request path ${JSON.stringify(req.path)}`);
  }

  if (basePath !== "" && !url.pathname.startsWith(basePath)) {
    return err(404, `no store route at ${url.pathname}`);
  }
  const pathname = basePath === "" ? url.pathname : url.pathname.slice(basePath.length);

  const route = routeAt(pathname);
  if (!route) return err(404, `no store route at ${pathname}`);
  if (req.method.toUpperCase() !== route.method) {
    return err(405, `${pathname} accepts ${route.method}, got ${req.method.toUpperCase()}`);
  }

  try {
    return await dispatch(store, route.name, url, req.body);
  } catch (cause) {
    if (cause instanceof StoreWireError) return err(400, cause.message);
    return err(500, cause instanceof Error ? cause.message : String(cause));
  }
}

async function dispatch(
  store: Store,
  name: StoreRouteName,
  url: URL,
  body: unknown,
): Promise<StoreResponse> {
  switch (name) {
    case "getDoc": {
      const id = url.searchParams.get("id");
      if (id === null) return err(400, "get-doc requires an ?id= parameter");
      return { status: 200, body: { doc: await store.getDoc(id) } };
    }

    case "queryDocs": {
      // `.has` rather than `.get`, so an explicit empty `?kind=` filters on the empty kind instead
      // of silently becoming "no filter".
      const filter = url.searchParams.has("kind")
        ? { kind: url.searchParams.get("kind") ?? "" }
        : {};
      return { status: 200, body: { docs: await store.queryDocs(filter) } };
    }

    case "readEvents": {
      const filter = url.searchParams.has("id") ? { id: url.searchParams.get("id") ?? "" } : {};
      return { status: 200, body: { events: await store.readEvents(filter) } };
    }

    case "upsertDoc": {
      const input = decodeUpsertDocRequest(body);
      return { status: 200, body: { doc: await store.upsertDoc(input) } };
    }

    case "deleteDoc": {
      const { id, ...opts } = decodeDeleteDocRequest(body);
      const deleteOpts: DeleteDocOpts = opts;
      return { status: 200, body: { deleted: await store.deleteDoc(id, deleteOpts) } };
    }

    case "appendEvent": {
      const input = decodeAppendEventRequest(body);
      return { status: 200, body: { event: await store.appendEvent(input) } };
    }
  }
}
