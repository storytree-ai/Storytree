// Local backend factory — composes the organism drivers into an /api/* request handler that
// replaces the 503 stub in static-server.ts. No `electron` import; headlessly provable by
// node:test against an InMemoryStore seed and a stub build seam (no live SDK, no DB).
//
// THE BOUNDARY CALL (see the story's spec): does NOT import apps/studio/server — that is a
// forbidden surface→surface coupling. Re-composes the SAME organism drivers (orchestrator
// discovery, library reads) the studio server is built from, exactly as devApi.ts does.

import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

// ---------- minimal HTTP helpers (local copies — not imported from studio) ----------

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ---------- types ----------

/**
 * The read seam injected into the local backend factory. Satisfies every route this module
 * serves; the test passes a stub, production wires @storytree/library + @storytree/store.
 */
export interface LocalBackendBackend {
  listAssets: () => Promise<unknown[]>;
  health: () => Promise<{ db: "ok" | "unreachable" | "n/a" }>;
  activeSessions: () => Promise<unknown[] | null>;
  inFlightBuilds: () => Promise<unknown[] | null>;
  latestVerdicts: () => Promise<unknown>;
  /** Optional — absent on the json backend; the handler falls back gracefully when missing. */
  verdictEvents?: () => Promise<unknown>;
}

/**
 * The build seam injected into the local backend factory. Wired over the real
 * `routedBuildRunner` (from @storytree/drive) in production; the test passes a stub that
 * returns `isBuildable: false` to pin the 404 path. Optional — when absent, /api/build → 404.
 */
export interface LocalBackendBuild {
  isBuildable: (unitId: string) => Promise<boolean>;
  runner: (unitId: string, sink: (line: string) => void) => Promise<{ ok: boolean; body: string }>;
}

/**
 * All dependencies injected into {@link createLocalBackend}. The factory is a plain function
 * over this injected port set so the test passes doubles and no live SDK/DB is touched.
 */
export interface LocalBackendDeps {
  /** Absolute path to the repo's `stories/` dir — passed to orchestrator discovery. */
  storiesDir: string;
  /** Absolute path to the repo's `docs/` dir — reserved for future /api/docs route. */
  docsDir: string;
  /** The read backend (in-memory seed for CI, pg-backed for production). */
  backend: LocalBackendBackend;
  /** The store kind echoed by /api/health — "json" | "pg". */
  store: string;
  /** Build seam; omit for read-only deployments. */
  build?: LocalBackendBuild;
}

// ---------- tree discovery (uses the real orchestrator, lazily) ----------

/**
 * Scan `storiesDir` with the real orchestrator discovery and return the minimal `{ stories }`
 * envelope. Returns `{ stories: [] }` gracefully for a non-existent or empty dir — the CI test
 * drives this path with a temp dir that does not exist.
 *
 * Loaded LAZILY so the module is safe to import in environments where the orchestrator's raw-TS
 * `.js` re-export specifiers are not yet resolvable at import time (the Vite config-load trap
 * `devApi.ts` already navigates).
 */
async function readLocalTree(storiesDir: string): Promise<{ stories: unknown[] }> {
  if (!existsSync(storiesDir)) return { stories: [] };

  // Lazy import — avoids the raw-TS `.js` re-export trap at module-load time.
  const { loadNodeSpec } = await import("@storytree/orchestrator");

  const stories: unknown[] = [];
  for (const ent of await fs.readdir(storiesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const storyFile = path.join(storiesDir, ent.name, "story.md");
    if (!existsSync(storyFile)) continue;
    try {
      const spec = loadNodeSpec(storyFile);
      stories.push({
        id: ent.name,
        title: spec.title,
        outcome: spec.outcome,
        status: spec.status ?? null,
        capabilities: [],
        dependsOn: spec.dependsOn,
        consumedBy: spec.consumedBy,
      });
    } catch {
      // A malformed spec is tolerated — the tree renders what it can.
      stories.push({ id: ent.name, title: ent.name, status: null, capabilities: [] });
    }
  }
  return { stories };
}

// ---------- factory ----------

/**
 * Create the /api/* request handler for the local (Electron) backend.
 *
 * ROUTE TABLE — minimal-to-journey (ADR-0113 "minimal first"): mounts only what the
 * thick-client journey needs. Desktop-irrelevant hosted concerns (IAP / members / invites /
 * db-control / db-wake) are NOT ported.
 *
 * - GET  /api/health  — store + db probe envelope (NEVER 503)
 * - GET  /api/tree    — the story tree from real orchestrator discovery over `storiesDir`
 * - GET  /api/assets  — library assets from the injected `backend`
 * - POST /api/build   — dispatch a build intent via the injected `build` seam (404 when absent)
 * - *    /api/*       — 404 with an error body
 */
export function createLocalBackend(
  deps: LocalBackendDeps,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (!url.pathname.startsWith("/api/")) {
        throw new HttpError(404, "not found");
      }

      if (url.pathname === "/api/health") {
        if ((req.method ?? "GET") !== "GET") throw new HttpError(405, "method not allowed");
        const health = await deps.backend.health();
        sendJson(res, 200, { store: deps.store, ...health });
      } else if (url.pathname === "/api/tree") {
        if ((req.method ?? "GET") !== "GET") throw new HttpError(405, "method not allowed");
        const tree = await readLocalTree(deps.storiesDir);
        sendJson(res, 200, tree);
      } else if (url.pathname === "/api/assets") {
        if ((req.method ?? "GET") !== "GET") throw new HttpError(405, "method not allowed");
        const assets = await deps.backend.listAssets();
        sendJson(res, 200, assets);
      } else if (url.pathname === "/api/build") {
        if (deps.build === undefined) throw new HttpError(404, "build is not enabled");
        const method = req.method ?? "GET";
        if (method !== "POST") throw new HttpError(405, `method ${method} not allowed`);
        const input = await readJsonBody<Record<string, unknown>>(req);
        const unitId = asString(input["unitId"]).trim();
        if (!unitId) throw new HttpError(400, "unitId is required");
        if (!(await deps.build.isBuildable(unitId))) {
          throw new HttpError(404, `no buildable node "${unitId}"`);
        }
        // The build runner is fire-and-forget (the client polls for progress via future GET).
        // For now, return 202 with a stable envelope; the runner is wired but not yet polled.
        void deps.build.runner(unitId, () => undefined);
        sendJson(res, 202, { runId: unitId });
      } else {
        throw new HttpError(404, "unknown endpoint");
      }
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
}
