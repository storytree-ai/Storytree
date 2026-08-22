import type { DeleteDocOpts, PatchDocInput, Store, StoredDoc, StoreEvent } from "./store.js";
import {
  STORE_ROUTES,
  type PatchDocRequest,
  decodeAppendEventResponse,
  decodeDeleteDocResponse,
  decodeGetDocResponse,
  decodePatchDocResponse,
  decodeQueryDocsResponse,
  decodeReadEventsResponse,
  decodeUpsertDocResponse,
  readErrorMessage,
  type StoreRoute,
} from "./store-wire.js";

/**
 * {@link HttpStore} — the {@link Store} seam spoken over HTTP (ADR-0259 D1). The client half of the
 * front door: the second backend the seam was designed for, not a rewrite.
 *
 * This is the piece whose absence made a remote session look like it had "no database access"
 * (ADR-0258): such a session reaches HTTPS fine, but every store client in this repo dialled
 * Postgres directly through `createPool`, and nothing spoke HTTP to a store. `HttpStore` is that
 * missing client — held to the same `storeParitySuite` as `InMemoryStore` and `PgLibraryStore`, so
 * it is DEMONSTRATED equivalent rather than reviewed-equivalent.
 *
 * Browser-safe: `fetch`, `URLSearchParams` and JSON only — no `node:` import, no runtime dependency.
 *
 * NOT IN SCOPE HERE (each is its own increment, and two are gated):
 *   - Migrating any existing caller off `createPool`. Adding a backend migrates nobody.
 *   - Extending the deployed broker's write set past assets (ADR-0259 "Bad / accepted costs").
 *   - Proof-bearing persistence through the door. ADR-0259 D5 keeps verdict / `events.work_event`
 *     writes GATED behind an ADR-0081 amendment and an ADR-0252 verification-integrity review.
 *     `HttpStore` is a general `Store` client and carries no verdict-specific path; do not add one
 *     here without lifting that gate first.
 *
 * @example
 * const store = new HttpStore({
 *   baseUrl: "https://studio.example/api/store",
 *   headers: { authorization: `Bearer ${token}` },
 * });
 * await store.upsertDoc({ id: "u1", kind: "template", doc });
 */

/** The subset of the `Response` surface {@link HttpStore} uses. The global `fetch` satisfies it. */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** The request init {@link HttpStore} builds. Structurally a `RequestInit`. */
export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * The injectable transport. Typed structurally rather than as `typeof globalThis.fetch` so this
 * package needs neither DOM nor undici types, and so a caller can supply a wrapper — that wrapper
 * is the extension point for anything per-request: a bearer token refreshed on 401, IAP headers,
 * retries, or a timeout via `AbortSignal`.
 */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;

export interface HttpStoreOptions {
  /** The door's mount point, e.g. `https://studio.example/api/store`. A trailing slash is fine. */
  baseUrl: string;
  /** Transport override. Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Headers sent on every request — the seat for `authorization` / IAP attribution. */
  headers?: Readonly<Record<string, string>>;
}

/**
 * A non-2xx response from the door, or a transport-level failure. Carries `status` so a caller can
 * tell an authorization problem (401/403 — re-auth) from a routing one (404 — the door is not
 * mounted where `baseUrl` says) from a store fault (5xx). `status` is 0 when the request never
 * produced a response at all.
 *
 * A well-formed response whose PAYLOAD violates the contract throws `StoreWireError` instead — a
 * different failure (version skew between the two halves), deliberately not conflated with this one.
 */
export class HttpStoreError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HttpStoreError";
    this.status = status;
    this.url = url;
  }
}

export class HttpStore implements Store {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: HttpStoreOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    const injected = options.fetch;
    if (injected === undefined && typeof globalThis.fetch !== "function") {
      throw new Error(
        "HttpStore: no global fetch available; pass options.fetch to supply a transport",
      );
    }
    // No cast: the global `fetch` structurally satisfies FetchLike, and keeping it uncast means the
    // compiler catches any drift in FetchInit / FetchResponse.
    this.#fetch = injected ?? globalThis.fetch;
    this.#headers = options.headers ?? {};
  }

  async upsertDoc(input: {
    id: string;
    kind: string;
    doc: unknown;
    actor?: string;
  }): Promise<StoredDoc> {
    const body = await this.#post(STORE_ROUTES.upsertDoc, input);
    return decodeUpsertDocResponse(body).doc;
  }

  /**
   * Field-scoped write (ADR-0352). The merge happens at the FAR end against current state, which is
   * the whole point — sending a merged doc from here would just reintroduce the lost update over a
   * longer wire.
   *
   * A `validate` callback is REFUSED rather than dropped: it is a closure, so it cannot be
   * serialized, and silently ignoring it would let a remote patch skip the migrate-on-write boundary
   * that `upsertDoc` enforces. Loud beats silently-unvalidated.
   */
  async patchDoc(input: PatchDocInput): Promise<StoredDoc | null> {
    if (input.validate !== undefined) {
      throw new Error(
        "HttpStore.patchDoc: a validate() callback cannot cross the wire — patch through a local store, " +
          "or have the door's own handler apply the write-boundary validation.",
      );
    }
    // Key insertion order is the WIRE order here (JSON.stringify follows it), so each optional key
    // is assigned at the exact textual position its conditional spread held.
    const request: PatchDocRequest = { id: input.id, fields: input.fields };
    if (input.actor !== undefined) request.actor = input.actor;
    if (input.kind !== undefined) request.kind = input.kind;
    const body = await this.#post(STORE_ROUTES.patchDoc, request);
    return decodePatchDocResponse(body).doc;
  }

  async getDoc(id: string): Promise<StoredDoc | null> {
    const body = await this.#get(STORE_ROUTES.getDoc, { id });
    return decodeGetDocResponse(body).doc;
  }

  async queryDocs(filter?: { kind?: string }): Promise<StoredDoc[]> {
    const query = filter?.kind === undefined ? {} : { kind: filter.kind };
    const body = await this.#get(STORE_ROUTES.queryDocs, query);
    return decodeQueryDocsResponse(body).docs;
  }

  async deleteDoc(id: string, opts?: DeleteDocOpts): Promise<boolean> {
    const body = await this.#post(STORE_ROUTES.deleteDoc, { id, ...(opts ?? {}) });
    return decodeDeleteDocResponse(body).deleted;
  }

  async appendEvent(e: {
    id: string;
    kind: string;
    type: StoreEvent["type"];
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent> {
    const body = await this.#post(STORE_ROUTES.appendEvent, e);
    return decodeAppendEventResponse(body).event;
  }

  async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
    const query = filter?.id === undefined ? {} : { id: filter.id };
    const body = await this.#get(STORE_ROUTES.readEvents, query);
    return decodeReadEventsResponse(body).events;
  }

  // -------------------------------------------------------------------------

  #url(route: StoreRoute, query: Record<string, string>): string {
    const params = new URLSearchParams(query).toString();
    return `${this.#baseUrl}${route.path}${params ? `?${params}` : ""}`;
  }

  async #get(route: StoreRoute, query: Record<string, string>): Promise<unknown> {
    return this.#send(this.#url(route, query), { method: route.method, headers: this.#requestHeaders() });
  }

  async #post(route: StoreRoute, payload: unknown): Promise<unknown> {
    return this.#send(this.#url(route, {}), {
      method: route.method,
      headers: { ...this.#requestHeaders(), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  #requestHeaders() {
    return { accept: "application/json", ...this.#headers } satisfies Record<string, string>;
  }

  /**
   * One round trip. Throws {@link HttpStoreError} on a transport failure or any non-2xx status —
   * including 404, which here means "no such route" (the door is not mounted at `baseUrl`), never
   * "no such document": an absent doc is a 200 `{ doc: null }` by contract (see `store-wire.ts`).
   */
  async #send(url: string, init: FetchInit): Promise<unknown> {
    let res: FetchResponse;
    try {
      res = await this.#fetch(url, init);
    } catch (cause) {
      throw new HttpStoreError(
        `${init.method} ${url} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        0,
        url,
        { cause },
      );
    }

    const raw = await res.text();
    let parsed: unknown;
    try {
      parsed = raw.length === 0 ? undefined : JSON.parse(raw);
    } catch {
      parsed = undefined;
    }

    if (!res.ok) {
      const detail = readErrorMessage(parsed) ?? (raw.length === 0 ? "(empty body)" : raw.slice(0, 200));
      throw new HttpStoreError(
        `${init.method} ${url} -> ${res.status}: ${detail}`,
        res.status,
        url,
      );
    }
    return parsed;
  }
}
