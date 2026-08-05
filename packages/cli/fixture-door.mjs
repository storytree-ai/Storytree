#!/usr/bin/env node
// A local ADR-0259 STORE DOOR over the library's committed FIXTURE corpus, for tests that must
// SPAWN the real CLI.
//
// ## Why this exists as its own process
//
// ADR-0302 D1 deleted the committed corpus, so a spawned `storytree library artifact <id>` reads
// the LIVE store — and ADR-0302 D3 deliberately keeps `STORYTREE_DB_USER` out of `pnpm -r test`,
// so a suite that spawns the CLI has no corpus and no credential. The door is the seam that
// already exists for exactly that shape (a client that cannot dial Cloud SQL): point
// `STORYTREE_STORE_URL` at this process and the spawned CLI reads through the real `HttpStore`
// client and the real `handleStoreRequest` server half, backed by an `InMemoryStore`.
//
// IT IS A SEPARATE PROCESS BECAUSE OF `spawnSync`, and that is not incidental. A test that serves
// the door from its OWN process and drives the child with `spawnSync` deadlocks: `spawnSync` blocks
// the parent's event loop for the child's entire lifetime, so the parent can never answer the
// request the child is waiting on, and both hang until the runner is killed. Suites whose calls are
// already async can host the door in-process instead (`packages/cli/src/launch.test.ts` does);
// suites built on `spawnSync` spawn this.
//
// Prints `PORT=<n>` on stdout once listening, so a caller can `await` readiness rather than poll.
// READ-ONLY in effect: the fixture is a frozen literal and every write dies with this process.

import { createServer } from "node:http";

// Register the tsx ESM loader from THIS package's tsx before importing anything workspace-local:
// every `@storytree/*` entry is raw TypeScript consumed via tsx (no build step, ADR-0023/0115), so
// plain `node` cannot load them. Same shim launch.mjs uses, and the same loud failure when a fresh
// worktree has not run `pnpm install`.
let register;
try {
  ({ register } = await import("tsx/esm/api"));
} catch {
  process.stderr.write(
    "fixture-door: tsx is not installed in this worktree — run `pnpm install` here first.\n",
  );
  process.exit(1);
}
register();

const { InMemoryStore } = await import("@storytree/storage-protocol");
const { handleStoreRequest } = await import("@storytree/storage-protocol/http-server");
const { loadFixtureCorpus } = await import("@storytree/library/fixture");

const store = new InMemoryStore();
await loadFixtureCorpus(store);

const server = createServer((req, res) => {
  void (async () => {
    try {
      const { status, body } = await handleStoreRequest(store, {
        method: req.method ?? "GET",
        path: req.url ?? "/",
      });
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: String(err) }));
    }
  })();
});

server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  process.stdout.write(`PORT=${port}\n`);
});

// The parent kills this when its suite finishes; exit cleanly if it goes away first.
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
