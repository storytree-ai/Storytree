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
//   - local-backend     (health/tree/assets [+ build, disabled here]) — the local-backend-boot factory
// READ loop only (ADR-0119 §2): no build-trigger / adopt / chat-SSE — those are later increments.

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
import { loadLocalSecrets } from "@storytree/drive/secrets";

import { createLocalBackend } from "../src/backend/local-backend.js";
import type { LocalBackendBackend } from "../src/backend/local-backend.js";
import { createBootReadRoutes } from "../src/backend/boot-read-routes.js";

// ---------- repo paths (real `import.meta.url`, the reason this is a sidecar) ----------

// electron/backend-entry.ts → up three (electron → apps/desktop → apps → repo root). The member runs
// a dev-mode build from their checkout (ADR-0113 §7), so the repo root holds the live stories/ + docs/.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const storiesDir = resolve(repoRoot, "stories");
const docsDir = resolve(repoRoot, "docs");

// ---------- main ----------

async function main(): Promise<void> {
  // Fill STORYTREE_DB_USER (the keyless IAM principal) from ~/.storytree/secrets.json when unset —
  // env always wins (ADR-0021 / the drive secrets seam). createPool needs it to authenticate.
  loadLocalSecrets();

  const { pool, connector } = await createPool();
  const library = new PgLibraryStore(pool);
  const comments = new PgCommentStore(pool);

  // The read backend the local-backend factory dispatches (the pg-backed shape, mirroring
  // devApi.ts's PgBackend reads). Sessions/builds/verdicts are advisory tree overlays the boot read
  // loop does not need — left null here (a later increment wires the activity/presence overlays).
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
    activeSessions: async () => null,
    inFlightBuilds: async () => null,
    latestVerdicts: async () => null,
  };

  // The two dispatchers the Electron main mounts in sequence (ADR-0119 §2): the boot-read router first
  // (me/docs/comments), then the local-backend handler (health/tree/assets + its own 404 fall-through).
  const bootRoutes = createBootReadRoutes({
    docsDir,
    listComments: async (filter) => {
      const f: { topicId?: string; topicKind?: "doc" | "asset" } = {};
      if (filter?.topicId) f.topicId = filter.topicId;
      if (filter?.topicKind === "doc" || filter?.topicKind === "asset") f.topicKind = filter.topicKind;
      return comments.list(f);
    },
  });
  const localHandler = createLocalBackend({ storiesDir, docsDir, backend, store: "pg" });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (await bootRoutes(req, res, pathname)) return;
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
