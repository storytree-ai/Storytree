// The thick-local backend SIDECAR (ADR-0119 §1). Run as a child Node process under `tsx`
// (`ELECTRON_RUN_AS_NODE=1 --import tsx`) spawned by electron/main.ts — NOT bundled into the CJS
// main, because esbuild silently empties `import.meta.url` / `import.meta.resolve("tsx")` under CJS
// (the corpus paths + the build path break). As a raw-TS sidecar, `import.meta.url` is real, the
// drivers run in their native habitat, and the studio dist server PROXIES `/api/*` here.
//
// THE BOUNDARY (ADR-0119 / the story's "Local-backend boundary call"): this RE-COMPOSES the organism
// drivers exactly as apps/studio/server/devApi.ts does — it does NOT import apps/studio/server (a
// forbidden surface→surface coupling). It mounts the studio's BOOT read set so the frontend renders:
//   - boot-read-routes (me/docs/comments) — the read router proven by boot-read-routes.test.ts
//   - chat-sse-mount   (POST /api/chat → SSE) — the chat-sse-mount dispatcher (read/propose only, ADR-0091)
//   - local-backend     (health/tree/assets [+ build, disabled here]) — the local-backend-boot factory
// READ/PROPOSE loop (ADR-0119 §2 + the chat-SSE increment): the chat surface is now mounted (orient +
// propose via startChatStream); the build-trigger / adopt outer-loop paths are still later increments.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  createPool,
  closePool,
  PgLibraryStore,
  PgCommentStore,
  renderStoredDoc,
} from "@storytree/library/store";
import { PgPresenceStore } from "@storytree/notice-board/store";
import { classifyPresence } from "@storytree/notice-board";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import { loadLocalSecrets } from "@storytree/drive/secrets";

import { createLocalBackend } from "../src/backend/local-backend.js";
import type { LocalBackendBackend } from "../src/backend/local-backend.js";
import { createBootReadRoutes } from "../src/backend/boot-read-routes.js";
import { createChatSseMount } from "../src/backend/chat-sse-mount.js";

// ---------- repo paths (real `import.meta.url`, the reason this is a sidecar) ----------

// electron/backend-entry.ts → up three (electron → apps/desktop → apps → repo root). The member runs
// a dev-mode build from their checkout (ADR-0113 §7), so the repo root holds the live stories/ + docs/.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const storiesDir = resolve(repoRoot, "stories");
const docsDir = resolve(repoRoot, "docs");

// ---------- verdict / activity / presence overlay drivers (ADR-0119 deferred overlay) ----------
//
// Re-composed from apps/studio/server's PgBackend reads (libraryBackend.ts) — the SAME raw SQL over
// events.verdict / events.work_event + PgPresenceStore over events.session — so the desktop forest
// paints the SAME proof-health / wisp / session layers as the hosted studio. NOT an import of
// apps/studio/server (the surface boundary, ADR-0100). This is the operator-attested GLUE the desktop
// story assigns to electron/backend-entry.ts (the sidecar wiring is attested, not a CI capability); the
// CI-proven core is the tree-verdicts.ts fold, exercised through these seams by stubs. Each read is
// ADVISORY (ADR-0033): null on ANY failure (stopped DB, missing table, timeout), never a throw, so a
// down DB leaves the tree under-claiming rather than hanging /api/tree.

const ADVISORY_TIMEOUT_MS = 4_000;
// The in-flight-build TTL (ADR-0048 §2) — mirrors apps/studio/src/types `BUILD_IN_FLIGHT_TTL_MS`
// (studio-local, not importable across the surface boundary); a dangling/hard-killed build clears in
// minutes rather than orbiting forever.
const IN_FLIGHT_TTL_MS = 20 * 60 * 1_000;
const GATE_PHASES: ReadonlySet<string> = new Set([
  "AUTHOR_TEST",
  "CONFIRM_RED",
  "IMPLEMENT",
  "CONFIRM_GREEN",
  "GATE",
]);

/** Race an advisory read against a short timeout; null on ANY failure (the PgBackend pattern). */
async function advisory<T>(fn: () => Promise<T>): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("advisory read timed out")), ADVISORY_TIMEOUT_MS);
    });
    return await Promise.race([fn(), timeout]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const toIso = (at: Date | string): string =>
  at instanceof Date ? at.toISOString() : new Date(at).toISOString();

// ---------- main ----------

async function main(): Promise<void> {
  // Fill STORYTREE_DB_USER (the keyless IAM principal) from ~/.storytree/secrets.json when unset —
  // env always wins (ADR-0021 / the drive secrets seam). createPool needs it to authenticate.
  loadLocalSecrets();

  const { pool, connector } = await createPool();
  const library = new PgLibraryStore(pool);
  const comments = new PgCommentStore(pool);

  // The read backend the local-backend factory dispatches (the pg-backed shape, mirroring devApi.ts's
  // PgBackend reads). The verdict/activity/presence overlays are now WIRED (ADR-0119 deferred overlay)
  // — the SAME SQL the studio's PgBackend runs — so the desktop forest paints proof-health, in-flight
  // wisps, and the session dock identically to the hosted studio.
  const backend: LocalBackendBackend = {
    listAssets: async () => {
      const docs = await library.queryDocs();
      return docs.map(renderStoredDoc);
    },
    health: async () => {
      try {
        await pool.query("select 1");
        return { db: "ok" as const };
      } catch {
        return { db: "unreachable" as const };
      }
    },
    // Latest signed verdict per unit (events.verdict DISTINCT ON unit_id) — the per-unit map the tree's
    // own-verdict layer attaches directly (story/cap `.verdict`).
    latestVerdicts: async () =>
      advisory(async () => {
        const res = await pool.query(
          `SELECT DISTINCT ON (unit_id) unit_id, outcome, at
             FROM events.verdict
            ORDER BY unit_id, seq DESC`,
        );
        const out: Record<string, { outcome: "pass" | "fail"; at: string }> = {};
        for (const raw of res.rows) {
          const row = raw as { unit_id: string; outcome: string; at: Date | string };
          if (row.outcome !== "pass" && row.outcome !== "fail") continue;
          out[row.unit_id] = { outcome: row.outcome, at: toIso(row.at) };
        }
        return out;
      }),
    // The RAW signed-verdict event stream (events.verdict ORDER BY seq) shaped as `{ kind: 'signing',
    // seq, doc }` — what the per-test crown roll-up (rollupStoryGreen/rollupCapStatus) reads.
    verdictEvents: async () =>
      advisory(async () => {
        const res = await pool.query(`SELECT seq, doc FROM events.verdict ORDER BY seq`);
        return res.rows.map((raw) => {
          const row = raw as { seq: string | number; doc: unknown };
          return { kind: SIGNING_EVENT_KIND, seq: Number(row.seq), doc: row.doc };
        });
      }),
    // Active notice-board sessions (events.session) with the staleness band derived at read time — the
    // session dock layer (ADR-0033), mirroring the studio PgBackend's activeSessions.
    activeSessions: async () =>
      advisory(async () => {
        const docs = await new PgPresenceStore(pool).listActive();
        const now = new Date();
        return docs.map((d) => ({
          sessionId: d.sessionId,
          branch: d.branch,
          workingOn: d.workingOn,
          nodes: d.nodes,
          band: classifyPresence(d.lastSeenAt, now),
          lastSeenAt: d.lastSeenAt,
        }));
      }),
    // In-flight builds (ADR-0048): the latest `building` work-event per unit whose run has NOT yet
    // produced a signed verdict, TTL-filtered + phase-surfaced in JS — the orbiting-wisp layer. Mirrors
    // the studio PgBackend's inFlightBuilds query + its rowsToBuildActivity fold (re-composed here).
    inFlightBuilds: async () =>
      advisory(async () => {
        const res = await pool.query(
          `WITH latest_building AS (
             SELECT DISTINCT ON (unit_id)
               unit_id, tier, doc->>'runId' AS run_id, doc->>'phase' AS phase, at
             FROM events.work_event
             WHERE type = 'building'
             ORDER BY unit_id, seq DESC
           )
           SELECT lb.unit_id, lb.tier, lb.run_id, lb.phase, lb.at
             FROM latest_building lb
            WHERE lb.run_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM events.verdict v
                 WHERE v.unit_id = lb.unit_id AND v.run_id = lb.run_id
              )`,
        );
        const now = Date.now();
        const out: { unitId: string; tier: string; runId: string; at: string; phase?: string }[] = [];
        for (const raw of res.rows) {
          const row = raw as {
            unit_id: string;
            tier: string;
            run_id: string;
            phase: string | null;
            at: Date | string;
          };
          const at = toIso(row.at);
          if (now - new Date(at).getTime() >= IN_FLIGHT_TTL_MS) continue; // past the TTL — cleared
          const phase = row.phase != null && GATE_PHASES.has(row.phase) ? row.phase : undefined;
          out.push({
            unitId: row.unit_id,
            tier: row.tier,
            runId: row.run_id,
            at,
            ...(phase !== undefined ? { phase } : {}),
          });
        }
        return out;
      }),
  };

  // The THREE dispatchers the Electron main mounts in sequence (ADR-0119 §2 + the chat-SSE increment):
  // the boot-read router first (me/docs/comments), then the chat-SSE mount (POST /api/chat), then the
  // local-backend handler (health/tree/assets + its own 404 fall-through). Each returns false for paths
  // it does not own, so the chain resolves to the first dispatcher that claims the request.
  const bootRoutes = createBootReadRoutes({
    docsDir,
    listComments: async (filter) => {
      const f: { topicId?: string; topicKind?: "doc" | "asset" } = {};
      if (filter?.topicId) f.topicId = filter.topicId;
      if (filter?.topicKind === "doc" || filter?.topicKind === "asset") f.topicKind = filter.topicKind;
      return comments.list(f);
    },
  });

  // The chat surface (chat-sse-mount, ADR-0108 Phase 2 / ADR-0091 read-propose-only): POST /api/chat
  // starts a live session-orchestrator session via startChatStream and streams its done/error/refused
  // events as SSE. No queryFn → the real SDK query() (CLAUDE_CODE_OAUTH_TOKEN hydrated by loadLocalSecrets
  // above); the mount loads the seed corpus internally to render the session-orchestrator prompt.
  //
  // KNOWN LIMITATION (a follow-on, not glue): the landed createChatSseMount accepts only { queryFn? } — it
  // cannot yet forward an OrientationRunner, so the live session's orientation tools fall back to the
  // "(orientation runner not configured)" stub (headless-orchestrator.ts) and the agent cannot read the
  // live tree/library/notice board. Wiring a real runner is blocked on a boundary fork (the runner is the
  // CLI run() in @storytree/cli, which neither the desktop nor @storytree/drive may import) — tracked
  // separately. The chat is a real orient+propose agent over its system prompt; live-state orientation is
  // the next increment.
  const chatMount = createChatSseMount({});

  const localHandler = createLocalBackend({ storiesDir, docsDir, backend, store: "pg" });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (await bootRoutes(req, res, pathname)) return;
        if (await chatMount(req, res, pathname)) return;
        await localHandler(req, res);
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        }
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    })();
  });

  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const { port } = server.address() as AddressInfo;
  // The ONE line main.ts parses off stdout — everything else logs to stderr so it can't be mistaken
  // for the handshake.
  process.stdout.write(`STORYTREE_BACKEND_PORT=${port}\n`);
  console.error(`[backend-entry] thick-local backend listening on 127.0.0.1:${port} (repo ${repoRoot})`);

  // Reap cleanly when the Electron main kills us on quit: drain the pool + close the socket once.
  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    console.error(`[backend-entry] ${signal} — shutting down`);
    server.close(() => {
      void closePool(pool, connector).finally(() => process.exit(0));
    });
    // Belt-and-braces: never hang the parent's quit on a stuck socket.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  console.error(`[backend-entry] failed to start: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
