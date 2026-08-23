import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { InMemoryStore } from "./store.js";
import type { Store, StoredDoc } from "./store.js";
import { HttpStore, HttpStoreError, type FetchLike, type FetchResponse } from "./http-store.js";
import { handleStoreRequest, type StoreRequest } from "./http-store-server.js";
import { StoreWireError } from "./store-wire.js";
import { storeParitySuite } from "./store-parity.js";

/**
 * The proof for the ADR-0259 front door's client half: `HttpStore` is held to the SAME
 * `storeParitySuite` as `InMemoryStore` and `PgLibraryStore` — over a real socket, with the shipped
 * `handleStoreRequest` behind it. That makes the third backend DEMONSTRATED equivalent rather than
 * reviewed-equivalent, and covers both halves of the wire contract at once.
 *
 * Offline by construction: the server is a `node:http` listener on an ephemeral loopback port over
 * an `InMemoryStore`. No DB, no token, no deployed service — the whole point of proving the
 * transport against the seam rather than against a deployment.
 */

const servers: Server[] = [];

/** Start a loopback door over `store` and return its base URL. */
async function startDoor(store: Store, basePath = ""): Promise<string> {
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");

      let body: unknown;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON body" }));
          return;
        }
      }

      const request: StoreRequest = {
        method: req.method ?? "GET",
        path: req.url ?? "/",
      };
      if (body !== undefined) request.body = body;
      const out = await handleStoreRequest(store, request, { basePath });
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    })();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}${basePath}`;
}

after(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ---- The parity proof --------------------------------------------------------------------

storeParitySuite("HttpStore", async () => {
  const baseUrl = await startDoor(new InMemoryStore());
  return new HttpStore({ baseUrl });
});

// ---- Contract behaviours the parity suite cannot see -------------------------------------

test("HttpStore: an absent doc is 200 {doc:null}, and 404 stays reserved for a wrong baseUrl", async () => {
  const baseUrl = await startDoor(new InMemoryStore());

  // A miss is a null doc, NOT a 404 — otherwise an unmounted door would read as an empty store.
  assert.equal(await new HttpStore({ baseUrl }).getDoc("nope"), null);

  // A wrong mount point is the 404, and it surfaces as a thrown error rather than a silent null.
  const wrong = new HttpStore({ baseUrl: `${baseUrl}/not-the-door` });
  const failure = await wrong.getDoc("nope").then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(failure instanceof HttpStoreError, "a wrong baseUrl throws rather than reading empty");
  assert.equal(failure.status, 404);
});

test("HttpStore: mounts under a basePath", async () => {
  const baseUrl = await startDoor(new InMemoryStore(), "/api/store");
  const store = new HttpStore({ baseUrl });
  await store.upsertDoc({ id: "m1", kind: "template", doc: { body: "mounted" } });
  const got = await store.getDoc("m1");
  assert.equal((got?.doc as { body: string }).body, "mounted");
});

test("HttpStore: sends configured headers on every request (the authorization seat)", async () => {
  const seen: Array<Record<string, string>> = [];
  const baseUrl = await startDoor(new InMemoryStore());
  const store = new HttpStore({
    baseUrl,
    headers: { authorization: "Bearer test-token" },
    fetch: (url, init) => {
      seen.push(init.headers);
      return globalThis.fetch(url, init) as Promise<FetchResponse>;
    },
  });

  await store.upsertDoc({ id: "h1", kind: "template", doc: {} });
  await store.getDoc("h1");

  assert.equal(seen.length, 2);
  for (const headers of seen) {
    assert.equal(headers["authorization"], "Bearer test-token", "auth header forwarded");
  }
});

test("HttpStore: a non-2xx response throws HttpStoreError carrying the status", async () => {
  const store = new HttpStore({
    baseUrl: "http://door.invalid",
    fetch: async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: "builder or admin role required" }),
    }),
  });

  const failure = await store.getDoc("x").then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(failure instanceof HttpStoreError);
  assert.equal(failure.status, 403);
  assert.match(failure.message, /builder or admin role required/);
});

test("HttpStore: a transport failure throws HttpStoreError with status 0", async () => {
  const store = new HttpStore({
    baseUrl: "http://door.invalid",
    fetch: async () => {
      throw new Error("ECONNREFUSED");
    },
  });

  const failure = await store.getDoc("x").then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(failure instanceof HttpStoreError);
  assert.equal(failure.status, 0, "no response at all is status 0, not a fabricated 5xx");
});

test("HttpStore: a conforming-status but malformed payload throws StoreWireError, not HttpStoreError", async () => {
  // Version skew between the two halves is a DIFFERENT failure from an HTTP one, and is not
  // silently coerced into a plausible-looking StoredDoc.
  const store = new HttpStore({
    baseUrl: "http://door.invalid",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ doc: { id: "x", kind: "template" } }),
    }),
  });

  const failure = await store.getDoc("x").then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(failure instanceof StoreWireError, "a malformed envelope is a wire error");
  assert.match(failure.message, /createdAt/);
});

test("HttpStore: an id containing a slash round-trips (ids are opaque, never a path segment)", async () => {
  const baseUrl = await startDoor(new InMemoryStore());
  const store = new HttpStore({ baseUrl });
  const id = "doc:decisions/0259-front-door.md";

  await store.upsertDoc({ id, kind: "template", doc: { body: "slashed" } });
  const got = await store.getDoc(id);
  assert.equal(got?.id, id, "the id survives the round trip unencoded by any intermediary");
  assert.equal((got?.doc as { body: string }).body, "slashed");
});

// ---- The server half ---------------------------------------------------------------------

test("handleStoreRequest: unknown route is 404, wrong method is 405", async () => {
  const store = new InMemoryStore();
  const unknown = await handleStoreRequest(store, { method: "GET", path: "/nope" });
  assert.equal(unknown.status, 404);

  const wrongMethod = await handleStoreRequest(store, { method: "GET", path: "/upsert-doc" });
  assert.equal(wrongMethod.status, 405);
});

test("handleStoreRequest: a malformed body is 400, and nothing is written", async () => {
  const store = new InMemoryStore();
  const res = await handleStoreRequest(store, {
    method: "POST",
    path: "/upsert-doc",
    body: { kind: "template", doc: {} }, // no id
  });
  assert.equal(res.status, 400);
  assert.match((res.body as { error: string }).error, /id/);
  assert.deepEqual(await store.queryDocs(), [], "a refused write left the store untouched");
});

test("handleStoreRequest: get-doc without ?id= is 400", async () => {
  const res = await handleStoreRequest(new InMemoryStore(), { method: "GET", path: "/get-doc" });
  assert.equal(res.status, 400);
});

test("handleStoreRequest: a store fault is 500, not a silent success", async () => {
  // A REAL `Store` whose read throws: the route's 500 is then observed against the same class
  // every other case in this file uses.
  class ExplodingStore extends InMemoryStore {
    override async queryDocs(): Promise<StoredDoc[]> {
      throw new Error("connection terminated");
    }
  }
  const exploding = new ExplodingStore();

  const res = await handleStoreRequest(exploding, { method: "GET", path: "/query-docs" });
  assert.equal(res.status, 500);
  assert.match((res.body as { error: string }).error, /connection terminated/);
});

test("handleStoreRequest: an explicit empty ?kind= filters, it does not mean 'no filter'", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "k1", kind: "template", doc: {} });

  const filtered = await handleStoreRequest(store, { method: "GET", path: "/query-docs?kind=" });
  assert.deepEqual((filtered.body as { docs: unknown[] }).docs, [], "empty kind matches nothing");

  const unfiltered = await handleStoreRequest(store, { method: "GET", path: "/query-docs" });
  assert.equal((unfiltered.body as { docs: unknown[] }).docs.length, 1);
});

test("the global fetch satisfies FetchLike without adaptation", () => {
  // Compile-time guard: the injectable-transport type must stay structurally compatible with the
  // real `fetch`, so a caller can wrap it (auth refresh, retries, timeouts) with no shim. If
  // FetchInit/FetchResponse drift, THIS LINE stops typechecking.
  const transport: FetchLike = globalThis.fetch;
  assert.equal(typeof transport, "function");
});
