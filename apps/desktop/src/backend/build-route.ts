// Desktop build-route mount factory — POST /api/build (202 + runId, fire-and-forget) + GET
// /api/build?runId (status + coarse transcript), wired over the RELOCATED worker's BuildContext
// (capability desktop-build-route, ADR-0133 d.3 / ADR-0108 Phase 3+4). It is the second link of the
// desktop build mount: worker-relocation moved the worker into @storytree/drive/build-worker; this
// mounts the SAME contract handleBuild holds — on the desktop surface, where chat already ships — so the
// ChatPanel accept-to-land click drives a real build from inside the app.
//
// THE BOUNDARY CALL (ADR-0100): imports the worker (runBuildJob + the BuildContext type) from
// @storytree/drive/build-worker by PACKAGE name, never from apps/studio/server (a forbidden surface→
// surface coupling). Reproduces the local HTTP helpers (readBody, readJsonBody) rather than importing
// them from studio — exactly as chat-sse-mount.ts / local-backend.ts do. No `electron`, no `dom` import;
// headlessly provable by node:test over a real node:http server.
//
// A SAFE write — INTENT, never a verdict (ADR-0091): the route hands the worker a unit id and reads back
// coarse progress. There is deliberately NO endpoint that takes a verdict as input. The spine inside
// runBuildJob observes RED→GREEN from real exit codes and SIGNS; CI re-proves green before trunk
// (ADR-0022). This module holds no signing key and no DB connection.

import type { IncomingMessage, ServerResponse } from "node:http";

import { runBuildJob } from "@storytree/drive/build-worker";
import type { BuildContext, BuildRun } from "@storytree/drive/build-worker";

// ---------- HTTP helpers (local copies — not imported from studio) ----------

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
    return {} as T;
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Shape a tracked run into the GET /api/build?runId wire body (the studio's BuildStatus). */
function buildStatusOf(run: BuildRun): Record<string, unknown> {
  return {
    runId: run.runId,
    unitId: run.unitId,
    status: run.status,
    transcript: run.transcript,
    ...(run.envelope !== undefined ? { envelope: run.envelope } : {}),
    ...(run.reason !== undefined ? { reason: run.reason } : {}),
  };
}

// ---------- Factory ----------

/**
 * Create the /api/build dispatcher over an injected {@link BuildContext} (the relocated worker).
 *
 * ROUTE TABLE — claims ONLY /api/build; returns `false` for every other path so it chains cleanly
 * beside the boot-read + chat mounts (a fall-through dispatcher, NOT a catch-all):
 * - POST /api/build {unitId} → validate `isBuildable` (404) → `createRun` (409 single-build guard) →
 *   `void runBuildJob` fire-and-forget → 202 `{ runId }`
 * - GET  /api/build?runId   → `getRun` → 200 `{ runId, unitId, status, transcript, envelope?, reason? }`
 *   (400 missing runId, 404 unknown run)
 * - any other method on /api/build → 405
 *
 * Returns an async handler `(req, res, pathname) => Promise<boolean>` — `true` when it claimed the
 * request, `false` to fall through. Every KNOWN outcome is a typed HTTP answer, never a 500 (the SAME
 * contract apps/studio/server's `handleBuild` holds — one worker, two surfaces). A build INTENT only,
 * never a verdict (ADR-0091).
 */
export function createBuildRouteMount(
  build: BuildContext,
): (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean> {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean> => {
    // Claim ONLY /api/build — fall through for every other route (the chain contract).
    if (pathname !== "/api/build") return false;

    const method = req.method ?? "GET";
    try {
      if (method === "POST") {
        // Dispatch a build intent: validate → mint a tracked run → fire the worker fire-and-forget.
        const input = await readJsonBody<Record<string, unknown>>(req);
        const unitId = asString(input["unitId"]).trim();
        if (!unitId) {
          sendJson(res, 400, { error: "unitId is required" });
          return true;
        }
        // Validate against real discovery — an un-buildable / unknown id is a clean 404, never a worker
        // that spawns against nothing (the handleBuild 404 contract).
        if (!(await build.isBuildable(unitId))) {
          sendJson(res, 404, { error: `no buildable node "${unitId}"` });
          return true;
        }
        // Mint a tracked run — the single-build-at-a-time guard surfaces as a 409 (mirrors handleBuild).
        const created = build.registry.createRun(unitId);
        if (!created.ok) {
          sendJson(res, 409, { error: created.reason });
          return true;
        }
        const { runId } = created.run;
        // Fire-and-forget: the worker streams coarse progress into the run; runBuildJob never throws
        // (it records a failed terminal state), so the floating promise can't reject. The client polls
        // GET /api/build?runId for progress (ADR-0108 d.7).
        void runBuildJob(build.registry, runId, unitId, build.runner);
        sendJson(res, 202, { runId });
        return true;
      }

      if (method === "GET") {
        // Poll a tracked run's coarse progress (the route the ChatPanel polls).
        const url = new URL(req.url ?? "/", "http://localhost");
        const runId = asString(url.searchParams.get("runId")).trim();
        if (!runId) {
          sendJson(res, 400, { error: "runId is required" });
          return true;
        }
        const run = build.registry.getRun(runId);
        if (run === undefined) {
          sendJson(res, 404, { error: "build run not found" });
          return true;
        }
        sendJson(res, 200, buildStatusOf(run));
        return true;
      }

      // A known route, an unsupported method → a typed 405 (never a 500).
      sendJson(res, 405, { error: `method ${method} not allowed` });
      return true;
    } catch (err) {
      // Backstop for a truly-unexpected fault — never reached by a known outcome (those are typed above).
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      return true;
    }
  };
}
