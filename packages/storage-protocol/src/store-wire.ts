import type { DeleteDocOpts, StoredDoc, StoreEvent } from "./store.js";

/**
 * The WIRE CONTRACT for the {@link Store} seam over HTTP (ADR-0259 D1: every client that is not the
 * server reaches the store through an HTTP front door; `pg` becomes a server-side privilege).
 *
 * This file is the contract BOTH halves share — `http-store.ts` (the client) encodes against it and
 * `http-store-server.ts` (the door's request handler) decodes against it — so the contract is
 * executable on both sides rather than prose one half can drift from.
 *
 * PURE by construction, like the rest of this package's main entry: no `node:` import, no `fetch`,
 * no zod. The seam's payload contract is `doc: unknown`, so the decoders here validate the ENVELOPE
 * (the `StoredDoc` / `StoreEvent` frames) and pass doc bodies through untouched — document-shape
 * validation is a layer ABOVE the narrow seam (the library store's write boundary), not part of it.
 *
 * ## Shape of the contract, and why
 *
 * Six routes, one per seam method, named after the method. Reads are GET, writes are POST.
 *
 *   GET  /get-doc       ?id=<id>                                  -> { doc: StoredDoc | null }
 *   GET  /query-docs    [?kind=<kind>]                            -> { docs: StoredDoc[] }
 *   GET  /read-events   [?id=<id>]                                -> { events: StoreEvent[] }
 *   POST /upsert-doc    { id, kind, doc, actor? }                 -> { doc: StoredDoc }
 *   POST /delete-doc    { id, actor?, reason?, supersededBy? }    -> { deleted: boolean }
 *   POST /append-event  { id, kind, type, doc, actor? }           -> { event: StoreEvent }
 *
 * Three deliberate choices a later reader should not have to re-litigate:
 *
 * 1. **Ids never appear as a path segment.** The seam types `id` as an opaque `string`; a value
 *    containing `/` (the `supersededBy` refs in this repo already look like `doc:decisions/0009-x.md`)
 *    would need `%2F`, which proxies are free to normalise. Ids ride in the query string on reads and
 *    in the body on writes, so no intermediary can rewrite them. ADR-0259's whole premise is
 *    surviving a TLS-terminating proxy, so the contract does not bet on path-segment fidelity.
 *
 * 2. **`getDoc` of an absent id is `200 { doc: null }`, never `404`.** A 404 is what a misconfigured
 *    reverse proxy or an unmounted door returns. Spending it on "no such document" would make a
 *    broken deployment indistinguishable from an empty store — the failure mode silently reads as
 *    "the store has nothing in it". 404 stays reserved for "no such route" (see
 *    {@link handleStoreRequest}).
 *
 * 3. **Every response is a JSON object envelope**, never a bare array, so a route can gain a field
 *    without breaking decoders.
 *
 * ## JSON round-trip caveat
 *
 * Doc bodies cross the wire as JSON, so they must be JSON-serializable: `undefined` properties
 * nested inside a doc are dropped, and `Date` becomes an ISO string that comes back as a string.
 * This is a real behavioural difference from an in-process {@link Store}, inherent to any network
 * transport, and callers that persist exotic values must serialize them themselves. (A top-level
 * `doc: undefined` does round-trip, since an absent key decodes back to `undefined`.)
 */

/** Thrown when a payload does not conform to this wire contract — by either half. */
export class StoreWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreWireError";
  }
}

/** The seven seam methods, as route names. */
export type StoreRouteName =
  | "getDoc"
  | "queryDocs"
  | "readEvents"
  | "upsertDoc"
  | "patchDoc"
  | "deleteDoc"
  | "appendEvent";

export interface StoreRoute {
  readonly method: "GET" | "POST";
  /** Path relative to the door's mount point (e.g. a base of `https://host/api/store`). */
  readonly path: string;
}

/** The route table. Reads are GET, writes are POST; each path names its seam method. */
export const STORE_ROUTES = {
  getDoc: { method: "GET", path: "/get-doc" },
  queryDocs: { method: "GET", path: "/query-docs" },
  readEvents: { method: "GET", path: "/read-events" },
  upsertDoc: { method: "POST", path: "/upsert-doc" },
  patchDoc: { method: "POST", path: "/patch-doc" },
  deleteDoc: { method: "POST", path: "/delete-doc" },
  appendEvent: { method: "POST", path: "/append-event" },
} satisfies { readonly [K in StoreRouteName]: StoreRoute };

// ---------------------------------------------------------------------------
// Request bodies (POST routes)
// ---------------------------------------------------------------------------

export interface UpsertDocRequest {
  id: string;
  kind: string;
  doc: unknown;
  actor?: string;
}

/**
 * A field-scoped write (ADR-0352). Carries `fields`, NOT a whole doc — the merge happens at the
 * far end, against current state. The seam's `validate` hook is deliberately absent: it is a
 * closure and cannot be serialized, so `HttpStore.patchDoc` refuses one rather than dropping it.
 */
export interface PatchDocRequest {
  id: string;
  fields: Record<string, unknown>;
  actor?: string;
  kind?: string;
}

/** {@link DeleteDocOpts} plus the id it applies to (the seam passes the id as a separate argument). */
export interface DeleteDocRequest extends DeleteDocOpts {
  id: string;
}

export interface AppendEventRequest {
  id: string;
  kind: string;
  type: StoreEvent["type"];
  doc: unknown;
  actor?: string;
}

// ---------------------------------------------------------------------------
// Response bodies
// ---------------------------------------------------------------------------

export interface GetDocResponse {
  doc: StoredDoc | null;
}
export interface QueryDocsResponse {
  docs: StoredDoc[];
}
export interface ReadEventsResponse {
  events: StoreEvent[];
}
export interface UpsertDocResponse {
  doc: StoredDoc;
}
/** `null` when the id does not exist — a patch never creates (ADR-0352). */
export interface PatchDocResponse {
  doc: StoredDoc | null;
}
export interface DeleteDocResponse {
  deleted: boolean;
}
export interface AppendEventResponse {
  event: StoreEvent;
}
/** The body of any non-2xx response. */
export interface StoreErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Primitive decoders — narrow, hand-rolled so this package keeps no runtime dependency
// ---------------------------------------------------------------------------

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoreWireError(`${what}: expected a JSON object, got ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new StoreWireError(`${what}: expected a string, got ${describe(value)}`);
  }
  return value;
}

function asOptionalString(value: unknown, what: string): string | undefined {
  return value === undefined ? undefined : asString(value, what);
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoreWireError(`${what}: expected a finite number, got ${describe(value)}`);
  }
  return value;
}

function asBoolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") {
    throw new StoreWireError(`${what}: expected a boolean, got ${describe(value)}`);
  }
  return value;
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new StoreWireError(`${what}: expected an array, got ${describe(value)}`);
  }
  return value;
}

const EVENT_TYPES = ["created", "updated", "deleted"] as const;

function asEventType(value: unknown, what: string): StoreEvent["type"] {
  const s = asString(value, what);
  for (const t of EVENT_TYPES) if (s === t) return t;
  throw new StoreWireError(
    `${what}: expected one of ${EVENT_TYPES.join(" | ")}, got ${JSON.stringify(s)}`,
  );
}

/** Fold an optional string into an object literal only when present (exactOptionalPropertyTypes). */
function optional<K extends string>(
  key: K,
  value: string | undefined,
): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string };
}

// ---------------------------------------------------------------------------
// Envelope decoders — used by the CLIENT on responses
// ---------------------------------------------------------------------------

export function decodeStoredDoc(value: unknown, what = "StoredDoc"): StoredDoc {
  const r = asRecord(value, what);
  return {
    id: asString(r["id"], `${what}.id`),
    kind: asString(r["kind"], `${what}.kind`),
    doc: r["doc"],
    createdAt: asString(r["createdAt"], `${what}.createdAt`),
    updatedAt: asString(r["updatedAt"], `${what}.updatedAt`),
  };
}

export function decodeStoreEvent(value: unknown, what = "StoreEvent"): StoreEvent {
  const r = asRecord(value, what);
  return {
    seq: asNumber(r["seq"], `${what}.seq`),
    id: asString(r["id"], `${what}.id`),
    kind: asString(r["kind"], `${what}.kind`),
    type: asEventType(r["type"], `${what}.type`),
    doc: r["doc"],
    actor: asString(r["actor"], `${what}.actor`),
    at: asString(r["at"], `${what}.at`),
  };
}

export function decodeGetDocResponse(value: unknown): GetDocResponse {
  const r = asRecord(value, "GetDocResponse");
  const doc = r["doc"];
  if (doc === null || doc === undefined) return { doc: null };
  return { doc: decodeStoredDoc(doc, "GetDocResponse.doc") };
}

export function decodeQueryDocsResponse(value: unknown): QueryDocsResponse {
  const r = asRecord(value, "QueryDocsResponse");
  const docs = asArray(r["docs"], "QueryDocsResponse.docs");
  return { docs: docs.map((d, i) => decodeStoredDoc(d, `QueryDocsResponse.docs[${i}]`)) };
}

export function decodeReadEventsResponse(value: unknown): ReadEventsResponse {
  const r = asRecord(value, "ReadEventsResponse");
  const events = asArray(r["events"], "ReadEventsResponse.events");
  return { events: events.map((e, i) => decodeStoreEvent(e, `ReadEventsResponse.events[${i}]`)) };
}

export function decodeUpsertDocResponse(value: unknown): UpsertDocResponse {
  const r = asRecord(value, "UpsertDocResponse");
  return { doc: decodeStoredDoc(r["doc"], "UpsertDocResponse.doc") };
}

export function decodePatchDocResponse(value: unknown): PatchDocResponse {
  const r = asRecord(value, "PatchDocResponse");
  const doc = r["doc"];
  // A patch of an absent id answers `null`, exactly as getDoc does — not a 404 (ADR-0352).
  if (doc === null || doc === undefined) return { doc: null };
  return { doc: decodeStoredDoc(doc, "PatchDocResponse.doc") };
}

export function decodeDeleteDocResponse(value: unknown): DeleteDocResponse {
  const r = asRecord(value, "DeleteDocResponse");
  return { deleted: asBoolean(r["deleted"], "DeleteDocResponse.deleted") };
}

export function decodeAppendEventResponse(value: unknown): AppendEventResponse {
  const r = asRecord(value, "AppendEventResponse");
  return { event: decodeStoreEvent(r["event"], "AppendEventResponse.event") };
}

/**
 * Best-effort read of a non-2xx body's `error` message. Returns `undefined` when the body is not a
 * conforming {@link StoreErrorResponse} — a door can fail before it reaches the handler (a proxy's
 * HTML 502), and the client must surface the status rather than throw a decode error over it.
 */
export function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const err = (value as Record<string, unknown>)["error"];
  return typeof err === "string" ? err : undefined;
}

// ---------------------------------------------------------------------------
// Request decoders — used by the SERVER on request bodies
// ---------------------------------------------------------------------------

export function decodeUpsertDocRequest(value: unknown): UpsertDocRequest {
  const r = asRecord(value, "UpsertDocRequest");
  return {
    id: asString(r["id"], "UpsertDocRequest.id"),
    kind: asString(r["kind"], "UpsertDocRequest.kind"),
    doc: r["doc"],
    ...optional("actor", asOptionalString(r["actor"], "UpsertDocRequest.actor")),
  };
}

export function decodePatchDocRequest(value: unknown): PatchDocRequest {
  const r = asRecord(value, "PatchDocRequest");
  return {
    id: asString(r["id"], "PatchDocRequest.id"),
    fields: asRecord(r["fields"], "PatchDocRequest.fields"),
    ...optional("actor", asOptionalString(r["actor"], "PatchDocRequest.actor")),
    ...optional("kind", asOptionalString(r["kind"], "PatchDocRequest.kind")),
  };
}

export function decodeDeleteDocRequest(value: unknown): DeleteDocRequest {
  const r = asRecord(value, "DeleteDocRequest");
  return {
    id: asString(r["id"], "DeleteDocRequest.id"),
    ...optional("actor", asOptionalString(r["actor"], "DeleteDocRequest.actor")),
    ...optional("reason", asOptionalString(r["reason"], "DeleteDocRequest.reason")),
    ...optional(
      "supersededBy",
      asOptionalString(r["supersededBy"], "DeleteDocRequest.supersededBy"),
    ),
  };
}

export function decodeAppendEventRequest(value: unknown): AppendEventRequest {
  const r = asRecord(value, "AppendEventRequest");
  return {
    id: asString(r["id"], "AppendEventRequest.id"),
    kind: asString(r["kind"], "AppendEventRequest.kind"),
    type: asEventType(r["type"], "AppendEventRequest.type"),
    doc: r["doc"],
    ...optional("actor", asOptionalString(r["actor"], "AppendEventRequest.actor")),
  };
}
