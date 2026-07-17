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
import { readFileSync, promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Verdict } from "@storytree/proof-protocol";

import { createLocalBackend, createBrokerForestWriter } from "./local-backend.js";
import type { LocalBackendDeps, ForestWriter } from "./local-backend.js";
import type { ForestWrite } from "./forest-readiness.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal stub backend — satisfies the read seam without touching a DB or disk. */
function stubBackend(): LocalBackendDeps["backend"] {
  return {
    listAssets: async () => [],
    health: async () => ({ db: "n/a" as const }),
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

// ===========================================================================
// VERDICT / ACTIVITY OVERLAY (ADR-0119 deferred overlay) — the desktop forest paints
// proof-health from signed verdicts, NOT the authored-status brown the bare tree fell back to.
//
// These pin the chip's outcome end-to-end over the REAL route dispatch + REAL discovery: GET /api/tree
// folds an injected signed-verdict fixture into island/plant hue (green from a signed pass), and
// GET /api/activity serves the in-flight-build overlay (advisory: a null seam answers a 200
// `{ builds: null }`, never a 404 or a crash). The self-reported PRESENCE overlay is RETIRED
// (ADR-0200 D7) — /api/presence is no longer a route, pinned below.
// ===========================================================================

const TS = "2026-06-27T10:00:00.000Z";

/** A full signed PASS verdict event for `unitId` (rollupStatus requires the doc to parse as a Verdict). */
function passEvent(
  seq: number,
  unitId: string,
  proofMode: "capability" | "story" | "contract",
): { kind: string; seq: number; doc: unknown } {
  return {
    kind: "signing",
    seq,
    doc: Verdict.parse({
      unitId,
      proofMode,
      outcome: "pass",
      commitSha: "ca".repeat(20),
      signer: "ci@example.com",
      runId: `run-${unitId}`,
      at: TS,
    }),
  };
}

/** Seed a temp stories dir with one `proposed` story `alpha` + cap `cap-a` + one `## Story UAT` leg. */
async function seedStoriesDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "local-backend-tree-"));
  const storyDir = path.join(dir, "alpha");
  await fsp.mkdir(storyDir);
  await fsp.writeFile(
    path.join(storyDir, "story.md"),
    [
      "---",
      'id: "alpha"',
      "tier: story",
      'title: "Alpha story"',
      'outcome: "the alpha outcome"',
      "status: proposed",
      "proof_mode: UAT",
      "capabilities: [cap-a]",
      "---",
      "",
      "# Alpha",
      "",
      "## Story UAT",
      "",
      "1. **The one leg** (witness: machine) — it works end to end.",
    ].join("\n"),
    "utf8",
  );
  await fsp.writeFile(
    path.join(storyDir, "cap-a.md"),
    [
      "---",
      'id: "cap-a"',
      "tier: capability",
      'title: "Capability A"',
      'outcome: "the cap-a outcome"',
      "status: proposed",
      "proof_mode: contract-test",
      "---",
      "",
      "# Capability A",
    ].join("\n"),
    "utf8",
  );
  return {
    dir,
    cleanup: async () => {
      await fsp.rm(dir, { recursive: true, force: true });
    },
  };
}

/** The stub backend with verdict-overlay seams overridden. */
function overlayBackend(over: Partial<LocalBackendDeps["backend"]>): LocalBackendDeps["backend"] {
  return { ...stubBackend(), ...over };
}

// THE CHIP'S OUTCOME: a signed-verdict fixture greens the island AND the plant on the live /api/tree.
test("local-backend: GET /api/tree paints proof-health — a signed-verdict fixture greens the island and plant", async () => {
  const { dir, cleanup } = await seedStoriesDir();
  try {
    const backend = overlayBackend({
      latestVerdicts: async () => ({ "cap-a": { outcome: "pass", at: TS } }),
      verdictEvents: async () => [
        passEvent(1, "cap-a", "capability"),
        passEvent(2, "alpha#uat-1", "story"),
      ],
    });
    const handler = createLocalBackend({ storiesDir: dir, docsDir: NO_DOCS_DIR, backend, store: "pg" });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/tree`);
      assert.equal(res.status, 200, "tree must be 200");
      const body = (await res.json()) as { stories: Array<Record<string, unknown>> };
      const alpha = body.stories.find((s) => s["id"] === "alpha");
      assert.ok(alpha, "the seeded story is in the payload");

      // Deletion test: drop the verdict fold and these are undefined → the island/plant stay brown.
      const storyVerdict = alpha["verdict"] as { outcome?: string } | undefined;
      assert.equal(
        storyVerdict?.outcome,
        "pass",
        "the ISLAND greens — story.verdict.outcome=pass from the per-test crown roll-up",
      );
      const caps = alpha["capabilities"] as Array<Record<string, unknown>>;
      const capVerdict = caps[0]?.["verdict"] as { outcome?: string } | undefined;
      assert.equal(
        capVerdict?.outcome,
        "pass",
        "the PLANT greens — cap.verdict.outcome=pass from its own signed verdict",
      );
    });
  } finally {
    await cleanup();
  }
});

// Advisory under-claim: with null verdict seams (the json backend / a down DB) the tree carries NO
// verdict — the authored brown stands, never a forged green (ADR-0033 presence-block discipline).
test("local-backend: GET /api/tree under-claims (no verdict) when the verdict seams answer null", async () => {
  const { dir, cleanup } = await seedStoriesDir();
  try {
    const handler = createLocalBackend({
      storiesDir: dir,
      docsDir: NO_DOCS_DIR,
      backend: stubBackend(), // all seams null
      store: "pg",
    });
    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/tree`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { stories: Array<Record<string, unknown>> };
      const alpha = body.stories.find((s) => s["id"] === "alpha");
      assert.ok(alpha);
      assert.equal(alpha["verdict"], undefined, "no crown verdict — the island keeps its authored hue");
    });
  } finally {
    await cleanup();
  }
});

// GET /api/activity serves the in-flight-build overlay (the wisp layer) from the injected seam.
test("local-backend: GET /api/activity returns the in-flight-build overlay { builds } from the seam", async () => {
  const builds = [{ unitId: "cap-a", tier: "capability", runId: "run-1", at: TS, phase: "IMPLEMENT" }];
  const backend = overlayBackend({ inFlightBuilds: async () => builds });
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend,
    store: "pg",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/activity`);
    assert.equal(res.status, 200, "activity must be 200");
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body["builds"], builds, "{ builds } is the backend's inFlightBuilds result");
  });
});

// GET /api/activity is advisory: a null seam (down DB / json) answers 200 { builds: null } — never 404.
test("local-backend: GET /api/activity is advisory — 200 { builds: null } when the seam can't answer", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(), // inFlightBuilds → null
    store: "pg",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/activity`);
    assert.equal(res.status, 200, "advisory absence is a 200, not a 404 or 500");
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["builds"], null, "{ builds: null } is the honest advisory-absent answer");
  });
});

// GET /api/activity ALSO surfaces story claims (ADR-0138): the claim wisp layer rides the SAME wire as
// builds. A claim carries kind:"claim" (the §5 honesty wall) — it must render distinct from a green bloom.
test("local-backend: GET /api/activity surfaces story claims { builds, claims } from the seam, distinct from a proven-green bloom", async () => {
  const claims = [
    { unitId: "wisp-as-story-claim", kind: "claim", sessionId: "s1", branch: "b1", intent: "orchestrate", at: TS },
  ];
  const backend = overlayBackend({ inFlightClaims: async () => claims });
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend,
    store: "pg",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/activity`);
    assert.equal(res.status, 200, "activity must be 200");
    const body = (await res.json()) as { builds: unknown; claims: Array<{ kind: string }> };
    assert.deepEqual(body.claims, claims, "{ claims } is the backend's inFlightClaims result");
    assert.equal(body.builds, null, "builds is independently advisory-null here");
    // §5 honesty wall: every claim activity is discriminated kind:"claim", never green/bloom.
    for (const c of body.claims) {
      assert.equal(c.kind, "claim");
      assert.ok(!["green", "bloom"].includes(c.kind));
    }
  });
});

// GET /api/activity claims are advisory: a seam that omits inFlightClaims answers { claims: null } — never throws.
test("local-backend: GET /api/activity is advisory for claims — { claims: null } when the seam omits inFlightClaims", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(), // no inFlightClaims → claims: null
    store: "pg",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/activity`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["claims"], null, "{ claims: null } is the honest advisory-absent answer");
  });
});

// PRESENCE IS RETIRED (ADR-0200 D7): /api/presence is no longer a route — it falls through to the
// 404 'unknown endpoint', and the tree payload no longer weaves a `sessions` block. The claim
// ledger (/api/claims below) is the one coordination + observability surface.
test("local-backend: GET /api/presence is retired — 404 unknown endpoint (ADR-0200 D7)", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "pg",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/presence`);
    assert.equal(res.status, 404, "the presence mirror is gone — the route falls through to 404");
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body["error"] === "string", "carries the standard 404 error body");
  });
});

// The tree payload carries NO self-reported `sessions` weave any more (ADR-0200 D7).
test("local-backend: GET /api/tree carries no `sessions` block — the presence weave is retired", async () => {
  const { dir, cleanup } = await seedStoriesDir();
  try {
    const handler = createLocalBackend({
      storiesDir: dir,
      docsDir: NO_DOCS_DIR,
      backend: stubBackend(),
      store: "pg",
    });
    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/tree`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.ok(!("sessions" in body), "no self-reported sessions weave rides the tree payload");
    });
  } finally {
    await cleanup();
  }
});

// ===========================================================================
// GET /api/claims — the claim-ledger DOCK view (ADR-0200 D7). Re-composes the studio's handleClaims:
// fold the backend's raw live claim rows through the pure `groupClaimsBySession`. Sibling to
// /api/activity but its OWN endpoint (the studio dock fetches it only while open). Before
// this route existed the request fell through to the local-backend 404 'unknown endpoint' — the exact
// class of desktop-only gap PR #751 fixed for /api/docs/content. Advisory: a null/absent seam answers
// 200 { sessions: null }, never a 503; the only error path is the 405 method guard.
// ===========================================================================

// A fresh (non-stale) claim row: heartbeat = NOW so `groupClaimsBySession` keeps it (a claim whose
// heartbeat aged past CLAIM_STALE_RECLAIM_MS = 2h is dropped as a dead holder). Mirrors the ClaimDocT
// shape (packages/notice-board/src/claim.ts) the pg store's listLiveClaims yields.
function freshClaim(over: Record<string, unknown> = {}): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return {
    unitId: "notice-board",
    sessionId: "sess-1",
    branch: "claude/dock",
    intent: "wiring the dock",
    grade: "work",
    claimedAt: nowIso,
    heartbeatAt: nowIso,
    ...over,
  };
}

test("local-backend: GET /api/claims folds the backend's live claim rows into session groups", async () => {
  const backend = overlayBackend({
    sessionClaims: async () => [
      freshClaim({ unitId: "notice-board", sessionId: "sess-1", branch: "claude/dock" }),
      freshClaim({ unitId: "library", sessionId: "sess-1", branch: "claude/dock", grade: "exploring" }),
    ],
  });
  const handler = createLocalBackend({ storiesDir: NO_STORIES_DIR, docsDir: NO_DOCS_DIR, backend, store: "pg" });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/claims`);
    // Deletion test: before the /api/claims route existed this fell through to the 404 'unknown endpoint'.
    assert.equal(res.status, 200, "claims must be 200 — the route is mounted, not a 404 fall-through");
    const body = (await res.json()) as {
      sessions: Array<{ sessionId: string; branch: string; claims: unknown[] }>;
    };
    assert.ok(Array.isArray(body.sessions), "the answer carries a grouped `sessions` array");
    assert.equal(body.sessions.length, 1, "both claims share one session → one group");
    assert.equal(body.sessions[0]!.sessionId, "sess-1");
    assert.equal(body.sessions[0]!.branch, "claude/dock");
    assert.equal(body.sessions[0]!.claims.length, 2, "the session's two live claims are folded in");
  });
});

test("local-backend: GET /api/claims is advisory — 200 { sessions: null } when the seam is absent", async () => {
  // stubBackend omits sessionClaims → the handler falls back to null (the json / down-DB posture).
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "pg",
  });
  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/claims`);
    assert.equal(res.status, 200, "advisory absence is a 200, never a 503");
    assert.deepEqual(await res.json(), { sessions: null }, "{ sessions: null } is the honest advisory answer");
  });
});

test("local-backend: GET /api/claims is advisory — 200 { sessions: null } when the seam answers null", async () => {
  const backend = overlayBackend({ sessionClaims: async () => null });
  const handler = createLocalBackend({ storiesDir: NO_STORIES_DIR, docsDir: NO_DOCS_DIR, backend, store: "pg" });
  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/claims`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { sessions: null });
  });
});

test("local-backend: /api/claims refuses a non-GET method with 405 (the only error path)", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "pg",
  });
  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/claims`, { method: "POST" });
    assert.equal(res.status, 405, "claims is a read — non-GET is a typed 405, never a silent fall-through");
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

// ===========================================================================
// FOREST-WRITE ROUTE (ADR-0117) — the local backend's verdict writes are BROKERED.
// (Brokered PRESENCE writes retired with self-reported presence, ADR-0200 D7 — pinned below.)
//
// These pin step 3 of the re-home: POST /api/forest/write routes through the injected broker writer
// (never a direct @storytree/store / PgWorkStore path), surfaces the broker's refusal honestly
// (never a forged success), and the production `createBrokerForestWriter` POSTs the exact
// { type, payload } envelope to the broker over a REAL fetch — opening no DB connection.
// ===========================================================================

/** A minimal fully-valid, locally-signed verdict attributed to the member. */
function validVerdict() {
  return Verdict.parse({
    unitId: "shared-forest-connection#gate-1",
    proofMode: "capability",
    outcome: "pass",
    commitSha: "cafebabecafebabecafebabecafebabecafebabe",
    signer: "friend-builder@example.com",
    runId: "run-local-backend-forest-1",
    at: "2026-06-27T10:00:00.000Z",
  });
}

// Pins that the route routes through the INJECTED broker writer with the VALIDATED ForestWrite —
// a persisted result → 201, and the writer (not a DB store) is what got called.
test("local-backend: POST /api/forest/write forwards the validated verdict to the broker writer (201)", async () => {
  const verdict = validVerdict();
  const received: ForestWrite[] = [];
  const forestWrite: ForestWriter = {
    write: async (w) => {
      received.push(w);
      return { persisted: true, status: 201, body: { ok: true, verdict } };
    },
  };
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
    forestWrite,
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/forest/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "verdict", payload: verdict }),
    });

    assert.equal(res.status, 201, "a persisted write returns 201");
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["ok"], true);

    // The route called the broker writer with the validated ForestWrite — the brokered write path.
    assert.equal(received.length, 1, "the forest writer was called exactly once");
    const w = received[0];
    assert.ok(w, "the writer received a ForestWrite");
    assert.equal(w.type, "verdict");
    assert.deepEqual(w.payload, verdict, "the writer received the exact validated verdict");
  });
});

// Pins fail-closed honesty: a broker refusal (e.g. 403 not-a-builder) is surfaced with its status —
// never masked as a 2xx success.
test("local-backend: POST /api/forest/write surfaces a broker refusal status, never a forged success", async () => {
  const forestWrite: ForestWriter = {
    write: async () => ({
      persisted: false,
      status: 403,
      guidance: "you are not yet an authorized builder — ask the owner via the Members panel",
    }),
  };
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
    forestWrite,
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/forest/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "verdict", payload: validVerdict() }),
    });

    assert.equal(res.status, 403, "a broker refusal is surfaced with its status, not masked as 2xx");
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["ok"], false, "the route reports the write did NOT persist");
    assert.ok(
      typeof body["error"] === "string" && (body["error"] as string).length > 0,
      "carries the member-actionable guidance",
    );
  });
});

// Pins that an absent forest-write seam is a clean 404 (read-only deployment), not a crash.
test("local-backend: POST /api/forest/write returns 404 when the forest-write seam is not wired", async () => {
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/forest/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 404, "an unwired forest-write seam → 404 (not a crash, not a 503)");
  });
});

// Pins shape-validation BEFORE any write: a malformed payload is 400 and the writer is never called.
test("local-backend: POST /api/forest/write rejects a malformed payload (400) before any write", async () => {
  let called = false;
  const forestWrite: ForestWriter = {
    write: async () => {
      called = true;
      return { persisted: true, status: 201, body: {} };
    },
  };
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
    forestWrite,
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/forest/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "verdict", payload: { signer: "x" } }), // missing required fields
    });
    assert.equal(res.status, 400, "a malformed verdict is rejected with 400");
    assert.equal(called, false, "the writer is NOT called when the shape is invalid — no forged write");
  });
});

// Pins the presence retirement (ADR-0200 D7): `presence` is no longer a forest-write type — it is
// refused as unknown (400) and the writer is never called.
test("local-backend: POST /api/forest/write refuses type 'presence' as unknown (400) — presence writes are retired", async () => {
  let called = false;
  const forestWrite: ForestWriter = {
    write: async () => {
      called = true;
      return { persisted: true, status: 201, body: {} };
    },
  };
  const handler = createLocalBackend({
    storiesDir: NO_STORIES_DIR,
    docsDir: NO_DOCS_DIR,
    backend: stubBackend(),
    store: "json",
    forestWrite,
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/forest/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "presence",
        payload: {
          sessionId: "s1",
          branch: "b1",
          workingOn: "x",
          startedAt: "2026-06-27T10:00:00.000Z",
          lastSeenAt: "2026-06-27T10:00:00.000Z",
        },
      }),
    });
    assert.equal(res.status, 400, "presence is an unknown forest-write type since ADR-0200 D7");
    assert.equal(called, false, "the writer is NOT called for the retired presence type");
  });
});

// Pins the PRODUCTION wiring end-to-end: createBrokerForestWriter POSTs the exact { type, payload }
// envelope to the broker over a REAL fetch and maps a 201 to persisted — no DB connector in the path.
test("local-backend: createBrokerForestWriter POSTs { type, payload } to the broker over real fetch (no DB connector)", async () => {
  const verdict = validVerdict();
  const received: { url: string | undefined; body: unknown }[] = [];

  const brokerDouble = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const raw = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
    received.push({ url: req.url, body: raw ? JSON.parse(raw) : null });
    res.statusCode = 201;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, verdict }));
  };

  await withServer(brokerDouble, async (base) => {
    const writer = createBrokerForestWriter(base);
    const result = await writer.write({ type: "verdict", payload: verdict });

    assert.equal(result.persisted, true, "a 201 from the real broker means persisted");
    assert.equal(received.length, 1, "the broker received exactly one POST");
    const got = received[0];
    assert.ok(got, "the broker recorded the POST");
    assert.equal(got.url, "/api/write-broker", "POSTed to the write-broker endpoint");
    assert.deepEqual(
      got.body,
      { type: "verdict", payload: verdict },
      "the exact { type, payload } envelope crossed the wire",
    );
  });
});

// Static guard: the desktop write path imports no pg connector, no dissolved store, no studio server.
test("local-backend: the write path imports no pg connector and no studio server (brokered only)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "local-backend.ts"), "utf8");
  // Check IMPORT lines (static + dynamic) only — prose comments legitimately mention these names.
  const importLines = src
    .split(/\r?\n/)
    .filter((l) => /^\s*import\b/.test(l) || /import\(/.test(l))
    .join("\n");

  assert.ok(!/cloud-sql-connector/.test(importLines), "must not import the Cloud SQL connector");
  assert.ok(!/\bfrom\s+["']pg["']/.test(importLines), "must not import pg");
  assert.ok(!/@storytree\/store/.test(importLines), "must not import the dissolved @storytree/store");
  assert.ok(!/@storytree\/library\/store/.test(importLines), "must not import the library node-only pg store");
  assert.ok(!/studio\/server/.test(importLines), "must not import the studio server (surface boundary)");
  // PgWorkStore/PgBackend/PgPresenceStore can only be referenced via an import — scope the check to
  // import lines so prose comments (which legitimately name what we DON'T do) don't false-positive.
  assert.ok(
    !/PgWorkStore|PgBackend|PgPresenceStore/.test(importLines),
    "must not import a direct pg store into the desktop write path",
  );
});
