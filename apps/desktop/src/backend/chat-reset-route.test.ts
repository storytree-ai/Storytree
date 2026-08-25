// Integration test for chat-reset-route.ts
//
// WHAT IT PINS: createChatResetMount composes the POST /api/chat/reset dispatcher — a recovery
// control that clears the drive composition single-session guard (`compositionInFlight` in
// packages/drive/src/orchestrate.ts) through an exported drive seam, and returns 200. It:
//   - Handles ONLY POST /api/chat/reset; falls through (returns false) for every other
//     path/method so the existing 404 / sibling dispatchers (chat-sse-mount, boot-read-routes)
//     still fire.
//   - Clears the REAL composition-level single-session guard — proven against the real
//     `orchestrate` export from @storytree/drive (the real in-story collaborator), not a stub.
//   - Starts NO session, holds NO signing key: the route only clears the guard flag.
//
// INTEGRATION TIER: real HTTP requests over a real node:http server; the guard is driven
// through the REAL `orchestrate` composition (with a scripted SDK queryFn — the only
// live-spend seam — exactly as chat-sse-mount.test.ts drives the same composition). No live
// SDK, no DB, no network beyond loopback HTTP.
//
// DELETION TEST: removing createChatResetMount breaks the import and fails every assertion.
// Making the handler a catch-all breaks the fall-through test. Not actually clearing
// compositionInFlight leaves the post-reset orchestrate() call refused, failing the guard
// assertion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { loadFixtureCorpus } from "@storytree/library/fixture";
import { orchestrate } from "@storytree/drive";

// RED: chat-reset-route.ts does not exist yet — module-not-found is the right-kind red.
import { createChatResetMount } from "./chat-reset-route.js";

// ---------------------------------------------------------------------------
// The corpus `orchestrate()` renders the `session-orchestrator` system prompt from
// ---------------------------------------------------------------------------
//
// A minimal in-memory `Store`, defined HERE rather than imported: `@storytree/storage-protocol`
// is drive's declared dep and not desktop's, so pnpm's strict isolation will not resolve it from
// apps/desktop (the same reason chat-sse-mount.test.ts defines its own copy). It `implements` the
// seam rather than being asserted into it — the seam is reached through `loadFixtureCorpus`'s own
// parameter, so the compiler holds this double to the REAL `Store` contract without desktop
// declaring a dependency it does not otherwise need.

/** The `Store` contract, reached without importing `@storytree/storage-protocol` directly. */
type CorpusStoreSeam = Parameters<typeof loadFixtureCorpus>[0];
type StoredDocLike = Awaited<ReturnType<CorpusStoreSeam["getDoc"]>> & object;

class FixtureStore implements CorpusStoreSeam {
  private readonly docs = new Map<string, StoredDocLike>();
  private seq = 0;

  async upsertDoc(input: { id: string; kind: string; doc: unknown; actor?: string }): Promise<StoredDocLike> {
    const now = new Date().toISOString();
    const existing = this.docs.get(input.id);
    const entry: StoredDocLike = {
      id: input.id,
      kind: input.kind,
      doc: input.doc,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.docs.set(input.id, entry);
    return entry;
  }
  async getDoc(id: string): Promise<StoredDocLike | null> {
    return this.docs.get(id) ?? null;
  }
  async queryDocs(filter?: { kind?: string }): Promise<StoredDocLike[]> {
    const all = Array.from(this.docs.values());
    return filter?.kind === undefined ? all : all.filter((d) => d.kind === filter.kind);
  }
  async deleteDoc(id: string): Promise<boolean> {
    return this.docs.delete(id);
  }
  async appendEvent(e: { id: string; kind: string; type: "created" | "updated" | "deleted"; doc: unknown; actor?: string }) {
    return {
      seq: ++this.seq,
      id: e.id,
      kind: e.kind,
      type: e.type,
      doc: e.doc,
      actor: e.actor ?? "system",
      at: new Date().toISOString(),
    };
  }
  async patchDoc(input: {
    id: string;
    fields: Readonly<Record<string, unknown>>;
    actor?: string;
    kind?: string;
    validate?: (mergedDoc: unknown) => unknown;
  }): Promise<StoredDocLike | null> {
    const existing = this.docs.get(input.id);
    if (existing === undefined) return null;
    const merged: Record<string, unknown> = {};
    Object.assign(merged, existing.doc, input.fields);
    input.validate?.(merged);
    const write = { id: input.id, kind: input.kind ?? existing.kind, doc: merged };
    return this.upsertDoc(
      input.actor === undefined ? write : { ...write, actor: input.actor },
    );
  }
  async readEvents(): Promise<never[]> {
    return [];
  }
}

/**
 * The one corpus every case below runs against. Built ONCE at module load: `loadFixtureCorpus` is
 * the library's frozen fixture, so this is deterministic and touches neither disk nor network.
 */
const FIXTURE_STORE = new FixtureStore();
await loadFixtureCorpus(FIXTURE_STORE);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The injectable SDK query function type — derived from `orchestrate`'s own parameter type so
 * this stays in sync without importing `@storytree/agent` (not desktop's declared dep).
 */
type OrchestrateArgs = Parameters<typeof orchestrate>[0];
type QueryFn = NonNullable<OrchestrateArgs["queryFn"]>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A scripted SDK result `orchestrate` → `runHeadlessOrchestrator` recognises as terminal success. */
const OK_SDK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 1,
  total_cost_usd: 0.01,
  result: "orient-and-propose scripted result",
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A scripted queryFn that immediately yields a terminal success result. */
function quickOkQueryFn(): QueryFn {
  return () =>
    (async function* () {
      yield OK_SDK_RESULT;
    })();
}

/**
 * A manually-resolvable promise. Lets a scripted session park mid-flight so the composition
 * single-session guard (`compositionInFlight`) stays SET while the test drives the reset route
 * against it — the "guard is stuck" scenario the route exists to recover from.
 */
function deferred() {
  let resolve: () => void = () => { /* overwritten by Promise constructor */ };
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Spin up a node:http server wrapping the chat-reset-route handler, run `fn` with the base URL,
 * then CLOSE the server before returning — no OS handle leaks. When the handler falls through
 * (returns false), the wrapper sends 404 so the fall-through test can assert on it.
 */
async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void handler(req, res, url.pathname)
      .then((handled) => {
        if (!handled && !res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "not handled" }));
        }
      })
      .catch((err: unknown) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// bcr-clears-the-composition-guard: the core recovery behaviour. Drive the REAL composition
// (`orchestrate` from @storytree/drive) into a stuck-guard state (a session parked mid-flight,
// so `compositionInFlight` is set), confirm a concurrent `orchestrate()` call is refused by that
// composition-level guard (the baseline), POST /api/chat/reset through the route, and confirm
// the composition-level refusal is gone — proof the route cleared the REAL guard, not a fake one.
//
// DELETION TEST: if the route did nothing (or cleared some other flag), the post-reset
// `orchestrate()` call would still come back `refused: true, reason: "single-session"` and the
// final assertion would fail.
test(
  "bcr-clears-the-composition-guard: POST /api/chat/reset clears the backend single-session guard and returns 200",
  async () => {
    const entered = deferred();
    const unblock = deferred();

    // Session 1 parks mid-flight inside the SDK generator: it signals `entered` (by which point
    // `compositionInFlight` is guaranteed true — orchestrate() sets it synchronously before any
    // await) then blocks on `unblock`. This is the "guard is stuck" scenario the reset route
    // exists to recover from — a composition-level guard set with no way to clear it but a
    // restart, absent this route.
    const blockingQueryFn: QueryFn = () =>
      (async function* () {
        entered.resolve();
        await unblock.promise;
        yield OK_SDK_RESULT;
      })();

    const session1 = orchestrate({
      intent: "hold the composition guard open",
      store: FIXTURE_STORE,
      queryFn: blockingQueryFn,
    });

    try {
      await entered.promise;

      // ---- Baseline: the composition-level guard is live ----
      const blockedAttempt = await orchestrate({
        intent: "a concurrent attempt while the guard is stuck",
        store: FIXTURE_STORE,
        queryFn: quickOkQueryFn(),
      });
      assert.equal(
        blockedAttempt.refused,
        true,
        "a concurrent orchestrate() call must be refused by the composition guard before any reset",
      );
      assert.equal(
        blockedAttempt.reason,
        "single-session",
        "the baseline refusal must be the typed single-session composition guard",
      );

      // ---- Drive the reset route ----
      const handler = createChatResetMount();
      let resetStatus = -1;
      await withServer(handler, async (base) => {
        const res = await fetch(`${base}/api/chat/reset`, { method: "POST" });
        resetStatus = res.status;
        await res.text();
      });
      assert.equal(resetStatus, 200, "POST /api/chat/reset must return 200");

      // ---- The composition-level guard must now be CLEAR ----
      // Session 1 is still parked mid-flight, so a fresh orchestrate() call may still be refused
      // by the DEEPER, per-session guard inside runHeadlessOrchestrator (a genuinely-running
      // session is not this route's job to abort) — but it must NEVER again be refused by the
      // TYPED composition-level guard this route exists to clear.
      const afterReset = await orchestrate({
        intent: "an attempt after the reset route ran",
        store: FIXTURE_STORE,
        queryFn: quickOkQueryFn(),
      });
      assert.notEqual(
        afterReset.refused,
        true,
        "after POST /api/chat/reset, a fresh orchestrate() call must no longer be refused by the " +
          "composition-level single-session guard (compositionInFlight) — the route must have cleared it",
      );
    } finally {
      // Release session 1 and let it settle — no dangling handle/promise left behind.
      unblock.resolve();
      await session1;
    }
  },
);

// bcr-falls-through-not-404s: the dispatcher owns ONLY POST /api/chat/reset — every other
// path/method falls through (returns false) so the existing 404 / sibling dispatchers still fire.
//
// DELETION TEST: making createChatResetMount a catch-all (always true) produces a non-404 for
// both cases below — the dispatcher must not shadow other routes.
test(
  "bcr-falls-through-not-404s: the dispatcher returns false for any other path",
  async () => {
    const handler = createChatResetMount();

    await withServer(handler, async (base) => {
      // A wholly unrelated route.
      const health = await fetch(`${base}/api/health`);
      assert.equal(
        health.status,
        404,
        "GET /api/health must fall through — createChatResetMount must not be a catch-all",
      );

      // The right path, wrong method — owned by no other dispatcher on this method/path pair,
      // so a non-POST request must also fall through rather than being handled.
      const wrongMethod = await fetch(`${base}/api/chat/reset`, { method: "GET" });
      assert.equal(
        wrongMethod.status,
        404,
        "GET /api/chat/reset must fall through — the route handles POST only",
      );

      // The sibling chat-sse-mount's route — must not be shadowed by the reset dispatcher.
      const chatSend = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "not the reset route" }),
      });
      assert.equal(
        chatSend.status,
        404,
        "POST /api/chat must fall through — it is owned by the sibling chat-sse-mount dispatcher, not this one",
      );
    });
  },
);
