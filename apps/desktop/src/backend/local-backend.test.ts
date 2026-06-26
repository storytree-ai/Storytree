// Integration test for the local-backend factory (apps/desktop/src/backend/local-backend.ts).
//
// WHAT IT PINS: the factory composes a local studio backend from injected organism drivers
// and returns an /api/* request handler that dispatches real read/build routes, replacing
// the 503 stub in static-server.ts. The test drives it headlessly over a real node:http
// server (no Electron, no DOM) with a stub backend and a stub build seam — no live SDK,
// no DB, no network.
//
// INTEGRATION TIER: real HTTP requests against the real route dispatch with real discovery
// (the orchestrator's findNodeSpecFile / loadNodeSpec over an empty storiesDir) and a
// stub read backend. The "no /api/health 503" assertion IS the deletion test — if the
// factory were removed, every assertion here would fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { createLocalBackend } from "./local-backend.js";
import type { LocalBackendDeps } from "./local-backend.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal stub backend — satisfies the read seam without touching a DB or disk. */
function stubBackend(): LocalBackendDeps["backend"] {
  return {
    listAssets: async () => [],
    health: async () => ({ db: "n/a" as const }),
    activeSessions: async () => null,
    inFlightBuilds: async () => null,
    latestVerdicts: async () => null,
    // verdictEvents is optional; omitting it is fine — the handler falls back gracefully.
  };
}

/**
 * Spin up a node:http server wrapping the local-backend handler, run `fn` with the base URL,
 * then CLOSE the server before returning — no OS handle leaks.
 */
async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}

// Point to paths that do not exist so the real orchestrator discovery returns [] without
// touching anything in the worktree. The readTree implementation handles a missing dir gracefully.
const NO_STORIES_DIR = "/tmp/local-backend-test-stories-empty";
const NO_DOCS_DIR = "/tmp/local-backend-test-docs-empty";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Pins the CORE outcome: the factory serves /api/health with a real JSON envelope, NOT the
// 503 that static-server.ts returns before the local backend is wired.
test("local-backend: GET /api/health returns a real { store, db } envelope — not a 503", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/health`);

    // Health must always be 200 (even when the DB is unreachable — that is the contract).
    assert.equal(res.status, 200, "health must return 200, never a 503");

    const body = (await res.json()) as Record<string, unknown>;

    // Concrete assertions about the envelope — not just a 200 passthrough.
    assert.equal(body["store"], "json", "envelope must echo the injected store kind");
    assert.equal(body["db"], "n/a", "envelope must carry the db probe result from the stub backend");
  });
});

// Pins that the route dispatches real orchestrator discovery: the real readTree is called
// and returns { stories: [] } over a non-existent dir (not undefined, not an error).
test("local-backend: GET /api/tree returns { stories: [] } from real discovery over empty dir", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/tree`);

    assert.equal(res.status, 200, "tree must be 200 over a non-existent stories dir");

    const body = (await res.json()) as Record<string, unknown>;

    // Deletion test: if the factory routed /api/tree to the 503 stub, `stories` would be absent.
    assert.ok(
      Array.isArray(body["stories"]),
      "tree response must contain a `stories` array — the real dispatch ran",
    );
    assert.equal(
      (body["stories"] as unknown[]).length,
      0,
      "real discovery over a non-existent dir returns zero stories, not an error",
    );
  });
});

// Pins that the read-dispatch seam is wired: listAssets is called and its result (the stub's
// empty array) is serialised as the response body.
test("local-backend: GET /api/assets returns the stub backend's result as an array", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/assets`);

    assert.equal(res.status, 200, "assets must be 200");

    const body = (await res.json()) as unknown;

    // Concrete content check: the stub's [] was serialised — not a 503, not a 500.
    assert.ok(Array.isArray(body), "assets response must be an array from the backend dispatch");
    assert.equal((body as unknown[]).length, 0, "stub backend returns an empty array");
  });
});

// Pins that the build seam is wired: an unknown unit (isBuildable returns false) is 404,
// not a crash or the 503 stub. The runner is injected but never called in this path.
test("local-backend: POST /api/build with an unknown unitId returns 404 from the build seam", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
    build: {
      isBuildable: async (_unitId: string) => false,
      runner: async (_unitId: string, _sink: (line: string) => void) =>
        ({ ok: false, body: "stub: not buildable" }),
    },
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId: "no-such-unit" }),
    });

    assert.equal(res.status, 404, "an unknown unit must be 404, not a 503 or crash");

    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(
      typeof body["error"] === "string",
      "error response must carry an error field (real error dispatch, not the 503 stub)",
    );
  });
});

// Pins that the route table is real: an unrecognised /api/* path returns 404 with an error body
// (not the static-server 503, not an unhandled crash).
test("local-backend: an unrecognised /api/* endpoint returns 404 with an error body", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/no-such-endpoint`);
    assert.equal(res.status, 404, "an unrecognised /api/* path must be 404");
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body["error"] === "string", "must carry an error field");
  });
});
