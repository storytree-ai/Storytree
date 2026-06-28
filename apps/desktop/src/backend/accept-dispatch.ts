// Desktop accept→dispatch mount factory — POST /api/chat/accept {unitId} routes a HUMAN-accepted
// proposedUnitId to the relocated dispatchAcceptedBuild over the SHARED BuildContext (capability
// desktop-accept-dispatch, ADR-0133 d.3 / ADR-0108 Phase 3+4). It is the third link of the desktop build
// mount and what makes the desktop a COMPLETE propose→accept→drive surface: chat carries a machine-
// actionable proposedUnitId (chat-drive-bridge), the relocated worker carries dispatchAcceptedBuild
// (worker-relocation), the desktop mounts a build route + GET poll over it (desktop-build-route) — and
// THIS wires an ACCEPTED id from the chat surface to the relocated dispatch on the SAME backend + the SAME
// registry, so the worker's coarse progress is read back over the shared GET /api/build?runId poll.
//
// THE ACCEPT IS THE HUMAN's (ADR-0108 d.3): the slice dispatches ONLY an explicitly-accepted id arriving
// as a POST body (the renderer's accept-button click through the api seam) — never a free-text "yes" the
// agent parsed. A DISTINCT accept route keeps the `accepted` provenance legible and matches the
// chat-build-dispatch CORE (dispatchAcceptedBuild exists precisely because the accept is a separate act
// from the generic build POST). The renderer re-point (the Build button's POST target) is the
// chat-drive-bridge / desktop operator-attested glue, a separate increment.
//
// THE BOUNDARY (ADR-0100): imports dispatchAcceptedBuild from @storytree/drive/build-worker by PACKAGE
// name, never apps/studio/server. Local HTTP helpers reproduced (not imported from studio). A SAFE write
// — a build INTENT off the human's accept, never a verdict (ADR-0091): the spine inside runBuildJob signs;
// CI re-proves green before trunk (ADR-0022). No signing key, no verdict path, no DB connection here.

import type { IncomingMessage, ServerResponse } from "node:http";

import { dispatchAcceptedBuild } from "@storytree/drive/build-worker";
import type { BuildContext } from "@storytree/drive/build-worker";

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

// ---------- Factory ----------

/**
 * Create the POST /api/chat/accept dispatcher over an injected {@link BuildContext} (the SHARED registry
 * the build route stands up — one in-flight run, the shared GET /api/build?runId poll).
 *
 * ROUTE TABLE — claims ONLY /api/chat/accept; returns `false` for every other path so it chains cleanly
 * beside the boot-read, chat, and build-route mounts (a fall-through dispatcher, NOT a catch-all):
 * - POST /api/chat/accept {unitId} → `dispatchAcceptedBuild(unitId, build)` (the relocated chat-build-
 *   dispatch core: validate isBuildable → mint a run → fire runBuildJob) → 202 `{ ok: true, runId }`
 *   - a non-buildable id → 404 `{ ok: false, error }` (the worker is never spawned against nothing)
 *   - a concurrent accept while a run is live → 409 `{ ok: false, error }` (the SHARED single-build guard)
 * - any other method on /api/chat/accept → 405
 *
 * The progress is read back over the build route's `GET /api/build?runId` (capability 2) — this slice adds
 * no second progress channel and no second registry. Returns `(req, res, pathname) => Promise<boolean>`.
 */
export function createAcceptDispatchMount(
  build: BuildContext,
): (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean> {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean> => {
    // Claim ONLY /api/chat/accept — fall through for every other route (the chain contract).
    if (pathname !== "/api/chat/accept") return false;

    const method = req.method ?? "GET";
    try {
      if (method !== "POST") {
        sendJson(res, 405, { error: `method ${method} not allowed` });
        return true;
      }

      const input = await readJsonBody<Record<string, unknown>>(req);
      const unitId = asString(input["unitId"]).trim();
      if (!unitId) {
        sendJson(res, 400, { ok: false, error: "unitId is required" });
        return true;
      }

      // Route the accepted id through the RELOCATED dispatch over the SHARED BuildContext — the same
      // worker pieces handleBuild's POST branch composes, reached via the typed-result dispatch the chat
      // surface folds into its stream. dispatchAcceptedBuild never throws on a known outcome.
      const result = await dispatchAcceptedBuild(unitId, build);
      if (result.ok) {
        sendJson(res, 202, { ok: true, runId: result.runId });
        return true;
      }

      // Map the typed refusal to a status, mirroring handleBuild / the build route: an un-buildable id is
      // a 404, the single-build guard a 409 (never a 500 on a known outcome).
      const status = result.reason === "a build is already running" ? 409 : 404;
      sendJson(res, status, { ok: false, error: result.reason });
      return true;
    } catch (err) {
      // Backstop for a truly-unexpected fault — never reached by a known outcome (those are typed above).
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
      return true;
    }
  };
}
