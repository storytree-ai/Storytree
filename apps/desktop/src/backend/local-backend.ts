// Local backend factory — composes the organism drivers into an /api/* request handler that
// replaces the 503 stub in static-server.ts. No `electron` import; headlessly provable by
// node:test against an InMemoryStore seed and a stub build seam (no live SDK, no DB).
//
// THE BOUNDARY CALL (see the story's spec): does NOT import apps/studio/server — that is a
// forbidden surface→surface coupling. Re-composes the SAME organism drivers (orchestrator
// discovery, library reads) the studio server is built from, exactly as devApi.ts does.

import type { IncomingMessage, ServerResponse } from "node:http";

import { writeToForestBroker } from "./forest-readiness.js";
import type {
  BrokerPostFn,
  BrokerCallOptions,
  ForestWrite,
  ForestWriteResult,
} from "./forest-readiness.js";
import { readTreeWithCaps, foldVerdicts } from "./tree-verdicts.js";
import type { DTVerdict, DTVerdictEvent } from "./tree-verdicts.js";

// The verdict/claim zod schemas live in raw-TS workspace packages whose `.js` re-export
// specifiers don't resolve under a non-tsx loader; load the runtime VALUES lazily, on first use —
// the SAME discipline the orchestrator import below (and the studio's writeBroker.ts) follow, so a
// future bundle of this module never reaches their enums at load time. Type-only imports are erased,
// so forest-readiness's own `import type` of these shapes carries no runtime coupling to them.
let proofProtocolModule: Promise<typeof import("@storytree/proof-protocol")> | null = null;
const loadProofProtocol = (): Promise<typeof import("@storytree/proof-protocol")> =>
  (proofProtocolModule ??= import("@storytree/proof-protocol"));
let noticeBoardModule: Promise<typeof import("@storytree/notice-board")> | null = null;
const loadNoticeBoard = (): Promise<typeof import("@storytree/notice-board")> =>
  (noticeBoardModule ??= import("@storytree/notice-board"));

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
  /**
   * The store's `/api/health` envelope. `code` is the OPTIONAL git-HEAD stamp (ADR-0164 Phase 1): the
   * HEAD the sidecar started on vs the checkout's HEAD now. `stale: true` means the checkout moved
   * under the running app — the shared StoreBanner turns it into the "rebuild & relaunch" affordance.
   * `runtime` is the OPTIONAL pinned-`main` runtime worktree status (ADR-0181 Decision 3): the branch it
   * is on (expected `main`), how many commits it is BEHIND `origin/main`, and `pinned` — whether this is
   * the installed pinned-runtime app (true) or the dev launch fallback (false). `branch`/`behind` are
   * absent when git can't answer; `pinned` gates the "N behind main — rebuild" update banner so it never
   * nags a developer's working checkout. The whole `runtime` object is omitted when git answers neither.
   */
  health: () => Promise<{
    db: "ok" | "unreachable" | "n/a";
    code?: { startedAt: string; head: string; stale: boolean };
    runtime?: { branch: string | null; behind: number | null; pinned?: boolean };
  }>;
  inFlightBuilds: () => Promise<unknown[] | null>;
  latestVerdicts: () => Promise<unknown>;
  /** Optional — absent on the json backend; the handler falls back gracefully when missing. */
  verdictEvents?: () => Promise<unknown>;
  /**
   * In-flight story CLAIMS (ADR-0138) — the coordination wisp layer, sibling to {@link inFlightBuilds}.
   * Optional like {@link verdictEvents}: a narrow stub may omit it, and `/api/activity` falls back to
   * `null` (advisory absence). Production wires it (electron/backend-entry.ts) to fold events.node_claim.
   */
  inFlightClaims?: () => Promise<unknown[] | null>;
  /**
   * EVERY live claim row, all units, all grades (ADR-0200 D7 — the session dock's
   * claims-grouped-by-session view): the raw claim docs from events.node_claim (PgClaimStore.listLiveClaims,
   * staleness-filtered in SQL). Distinct from {@link inFlightClaims} (which folds to a map-wisp and drops
   * the grade): this stays the raw shape so the `/api/claims` handler folds it through the pure
   * `groupClaimsBySession`. Optional like {@link inFlightClaims}: a narrow stub may omit it, and
   * `/api/claims` falls back to `{ sessions: null }` (advisory absence, never an over-claim). Production
   * wires it (electron/backend-entry.ts) over PgClaimStore.listLiveClaims.
   */
  sessionClaims?: () => Promise<unknown[] | null>;
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
  /**
   * Forest-write seam — the desktop persists its locally-signed verdict to the SHARED
   * forest THROUGH THE BROKER (ADR-0117), never a direct Cloud SQL connection. Omit to leave the
   * forest-write route disabled (→ 404). Production wires {@link createBrokerForestWriter} over the
   * configured studio broker URL.
   */
  forestWrite?: ForestWriter;
}

// ---------- tree read + verdict overlay (re-composes the studio's GET /api/tree, ADR-0119 overlay) ----------

/**
 * Build the verdict-enriched `/api/tree` payload: read the authored tree with FULL capabilities, then
 * fold in the signed-verdict overlay (the studio tree-handler's enrichment, re-composed in
 * `tree-verdicts.ts`) so the desktop forest paints proof-health like the hosted studio — green from a
 * signed `verdict.outcome === 'pass'`, not the authored-status brown the bare tree fell back to.
 *
 * Every overlay leg is advisory (ADR-0033): a `null` source (the json backend / a down DB) leaves the
 * authored hue — the tree UNDER-claims, never over-claims, and never throws. Seeds `builds` on first
 * load (the `/api/activity` poll then keeps it fresh) — parity with the studio handler. The
 * self-reported `sessions` weave retired with presence (ADR-0200 D7 — the claim ledger is the one
 * coordination surface). The verdict pg SQL lives behind `deps.backend` (electron/backend-entry.ts);
 * this module stays pg-free (the desktop's brokered-only write boundary, ADR-0117).
 */
async function buildTreePayload(deps: LocalBackendDeps): Promise<Record<string, unknown>> {
  const { stories, uatTestsByStory, coverageByStory } = await readTreeWithCaps(deps.storiesDir);
  // Run the advisory reads in parallel so a down DB costs one timeout budget, not four.
  const [latestVerdicts, verdictEvents, builds, assets] = await Promise.all([
    deps.backend.latestVerdicts() as Promise<Record<string, DTVerdict> | null>,
    (deps.backend.verdictEvents?.() ?? Promise.resolve(null)) as Promise<readonly DTVerdictEvent[] | null>,
    deps.backend.inFlightBuilds(),
    deps.backend.listAssets().catch(() => null),
  ]);
  // The OQ green-gate reads the open-questions' `references` (ADR-0107) — filtered from the asset list.
  const openQuestions = (Array.isArray(assets) ? assets : [])
    .filter(
      (a): a is { id: string; category: string; references?: readonly string[] } =>
        typeof a === "object" &&
        a !== null &&
        (a as { category?: unknown }).category === "open-question" &&
        typeof (a as { id?: unknown }).id === "string",
    )
    .map((a) => (a.references !== undefined ? { id: a.id, references: a.references } : { id: a.id }));
  await foldVerdicts(stories, uatTestsByStory, coverageByStory, {
    latestVerdicts,
    verdictEvents,
    openQuestions,
  });
  const payload: Record<string, unknown> = { stories };
  if (builds && builds.length > 0) payload["builds"] = builds;
  return payload;
}

// ---------- factory ----------

/**
 * Create the /api/* request handler for the local (Electron) backend.
 *
 * ROUTE TABLE — minimal-to-journey (ADR-0113 "minimal first"): mounts only what the
 * thick-client journey needs. Desktop-irrelevant hosted concerns (IAP / members / invites /
 * db-control / db-wake) are NOT ported.
 *
 * - GET  /api/health   — store + db probe envelope (NEVER 503)
 * - GET  /api/tree     — the story tree from real orchestrator discovery over `storiesDir`, ENRICHED
 *                        with the signed-verdict overlay so islands/plants paint proof-health (ADR-0119
 *                        deferred overlay) — green from a signed pass, not authored brown
 * - GET  /api/activity — the map-activity wisp layer: in-flight builds (ADR-0048) + story claims
 *                        (ADR-0138), `{ builds, claims }` — both advisory
 * - GET  /api/claims   — the claim-ledger DOCK view (ADR-0200 D7), `{ sessions }` — live claim rows
 *                        grouped by session (advisory: `{ sessions: null }` when the seam/DB is silent)
 * - GET  /api/assets   — library assets from the injected `backend`
 * - POST /api/build    — dispatch a build intent via the injected `build` seam (404 when absent)
 * - *    /api/*        — 404 with an error body
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
        sendJson(res, 200, await buildTreePayload(deps));
      } else if (url.pathname === "/api/activity") {
        // The map-activity wisp layer, polled by the world — `{ builds, claims }` (each advisory: null
        // when the backend can't answer). Builds (ADR-0048) + story claims (ADR-0138) ride the SAME
        // wire; a claim carries `kind: "claim"` (the §5 honesty wall) so it renders distinct from a
        // proven-green bloom. Mirrors the studio's GET /api/activity (handleActivity).
        if ((req.method ?? "GET") !== "GET") throw new HttpError(405, "method not allowed");
        const [builds, claims] = await Promise.all([
          deps.backend.inFlightBuilds(),
          deps.backend.inFlightClaims?.() ?? Promise.resolve(null),
        ]);
        sendJson(res, 200, { builds, claims });
      } else if (url.pathname === "/api/claims") {
        // The claim-ledger DOCK view (ADR-0200 D7): every live claim row folded by session through the
        // pure `groupClaimsBySession` so the desktop session dock renders "who's doing what, grouped by
        // session" — the SAME shape the studio's GET /api/claims produces (handleClaims), re-composed
        // here (no apps/studio/server import, ADR-0100). Sibling to /api/activity, but its
        // OWN endpoint (the dock fetches it only while open, not on the world's poll cadence). Advisory:
        // `sessionClaims` absent / a down DB → 200 `{ sessions: null }`, never a 503; the only error path
        // is the 405 method guard. `groupClaimsBySession` rides the existing `loadNoticeBoard` lazy loader
        // (browser-safe zod, no `node:`/`pg` import), so this module stays bundle-safe.
        if ((req.method ?? "GET") !== "GET") throw new HttpError(405, "method not allowed");
        const claims = (await (deps.backend.sessionClaims?.() ?? Promise.resolve(null))) as
          | unknown[]
          | null;
        if (claims === null) {
          sendJson(res, 200, { sessions: null });
        } else {
          const { groupClaimsBySession } = await loadNoticeBoard();
          sendJson(res, 200, {
            sessions: groupClaimsBySession(
              claims as Parameters<typeof groupClaimsBySession>[0],
              new Date(),
            ),
          });
        }
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
      } else if (url.pathname === "/api/forest/write") {
        // Persist a locally-signed verdict to the SHARED forest THROUGH THE BROKER
        // (ADR-0117) — the desktop's forest-write path is brokered, never a direct DB connection.
        if (deps.forestWrite === undefined) throw new HttpError(404, "forest write is not enabled");
        const method = req.method ?? "GET";
        if (method !== "POST") throw new HttpError(405, `method ${method} not allowed`);
        const input = await readJsonBody<Record<string, unknown>>(req);
        const write = await parseForestWrite(input);
        const result = await deps.forestWrite.write(write);
        if (result.persisted) {
          // The broker validated shape + attribution and persisted under its service-account identity.
          sendJson(res, 201, { ok: true, body: result.body });
        } else {
          // Fail-closed, never forged: surface the broker's refusal status (or 502 when the broker
          // was unreachable / timed out) with the member-actionable guidance.
          sendJson(res, result.status ?? 502, { ok: false, error: result.guidance });
        }
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

// ---------- forest-write wiring (brokered, never a direct DB connection — ADR-0117) ----------

/**
 * Validate an incoming `{ type, payload }` forest-write request into a typed {@link ForestWrite}.
 *
 * Throws {@link HttpError}(400) on an unknown type or a payload that fails its protocol shape — the
 * desktop fast-fails malformed local input before the network hop; the broker re-validates as the
 * authority (ADR-0117 d.3). The zod schemas are lazy-loaded (the raw-TS `.js` re-export discipline).
 * `verdict` is the ONLY write type — brokered presence retired with self-reported presence
 * (ADR-0200 D7; the claim ledger is the one coordination surface).
 */
async function parseForestWrite(input: Record<string, unknown>): Promise<ForestWrite> {
  const type = input["type"];
  if (type === "verdict") {
    const { Verdict } = await loadProofProtocol();
    const parsed = Verdict.safeParse(input["payload"]);
    if (!parsed.success) throw new HttpError(400, `invalid verdict shape: ${parsed.error.message}`);
    return { type: "verdict", payload: parsed.data };
  }
  throw new HttpError(400, `unknown forest write type "${String(type)}"`);
}

/**
 * Production {@link BrokerPostFn}: a real `fetch` POST to the configured studio broker base URL.
 *
 * Opens NO DB connection and imports NO `apps/studio/server` source — the cross-surface edge is an
 * HTTP edge only (ADR-0117 d.1 / ADR-0100). Returns the broker's status + parsed JSON body so the
 * write client can map it to a persisted / not-persisted result.
 */
export function createFetchBrokerPost(brokerBaseUrl: string): BrokerPostFn {
  const base = brokerBaseUrl.replace(/\/+$/, "");
  return async (apiPath, body) => {
    const res = await fetch(`${base}${apiPath}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, body: parsed };
  };
}

/**
 * The desktop's forest-write seam: persist a locally-signed verdict to the shared forest
 * THROUGH THE BROKER (ADR-0117) — never a direct Cloud SQL connection.
 */
export interface ForestWriter {
  write: (write: ForestWrite) => Promise<ForestWriteResult>;
}

/**
 * Production {@link ForestWriter}: brokered over a real `fetch` {@link BrokerPostFn} pointed at the
 * configured studio broker URL. This is the desktop's ONLY forest-write path — there is no direct
 * `@storytree/store` / `PgWorkStore` connector in the desktop write path (ADR-0117 d.1/d.5).
 */
export function createBrokerForestWriter(
  brokerBaseUrl: string,
  options?: BrokerCallOptions,
): ForestWriter {
  const brokerPost = createFetchBrokerPost(brokerBaseUrl);
  return { write: (w) => writeToForestBroker(brokerPost, w, options) };
}
