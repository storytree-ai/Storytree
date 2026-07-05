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
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  createPool,
  closePool,
  PgLibraryStore,
  PgCommentStore,
  renderStoredDoc,
} from "@storytree/library/store";
import { PgPresenceStore, PgClaimStore } from "@storytree/notice-board/store";
import { classifyPresence } from "@storytree/notice-board";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import { loadLocalSecrets } from "@storytree/drive/secrets";
import { createOrientationRunner, deriveIdentity, buildSpawnDeps, buildLandingDeps } from "@storytree/drive";
import type { SpawnSurfaceDeps, LandingSurfaceDeps } from "@storytree/drive";

import { createAdvisoryReader } from "../src/backend/advisory.js";
import { createLocalBackend } from "../src/backend/local-backend.js";
import type { LocalBackendBackend } from "../src/backend/local-backend.js";
import { acquireBackendStore, degradedBackend } from "../src/backend/sidecar-startup.js";
import { createBootReadRoutes } from "../src/backend/boot-read-routes.js";
import { createChatSseMount } from "../src/backend/chat-sse-mount.js";
import { createBuildRouteMount } from "../src/backend/build-route.js";
import { credentialedBuildRunner } from "../src/backend/credentialed-build-runner.js";
import { resolveSpawnMaxTurns } from "../src/backend/spawn-turns.js";
import { resolveOrchestratorMaxTurns } from "../src/backend/orchestrator-turns.js";
import { CredentialBroker } from "../src/credential/broker.js";
import { CREDENTIAL_ENV_VAR } from "../src/credential/kinds.js";
import { NapiKeychain } from "../src/keychain/napi-adapter.js";
// The build worker REGISTRY + routedBuildRunner come from the shared @storytree/drive package (ADR-0133
// d.3 — never apps/studio/server, ADR-0100). build-worker imports only node:crypto, so it is safe to
// import statically here (the build ENTRIES nodeBuild/storyBuild are lazily imported inside the runner).
import { BuildRegistry, routedBuildRunner } from "@storytree/drive/build-worker";
import type { BuildContext } from "@storytree/drive/build-worker";

// ---------- repo paths (real `import.meta.url`, the reason this is a sidecar) ----------

// electron/backend-entry.ts → up three (electron → apps/desktop → apps → repo root). The member runs
// a dev-mode build from their checkout (ADR-0113 §7), so the repo root holds the live stories/ + docs/.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const storiesDir = resolve(repoRoot, "stories");
const docsDir = resolve(repoRoot, "docs");

// ---------- session identity (ADR-0033) for the chat spawn surface ----------
//
// The spawn claim (ADR-0138 §2) stamps a real holder so a refusal names who holds a story. The
// canonical identity is the worktree name + HEAD branch (deriveIdentity, the same key the terminal
// session declares). A member's desktop checkout is usually a plain clone (not a `.claude/worktrees/*`
// worktree), so deriveIdentity returns null there — we fall back to a desktop-scoped id off the repo
// basename, still carrying the live HEAD branch. null only when git itself is unreachable (then the
// spawn surface fails closed and the chat mounts propose-only).
function deriveChatIdentity(root: string): { sessionId: string; branch: string } | null {
  const runGit = (args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).toString().trim();
  const viaWorktree = deriveIdentity(runGit);
  if (viaWorktree !== null) return viaWorktree;
  try {
    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const top = runGit(["rev-parse", "--show-toplevel"]);
    const base = top.split(/[/\\]/).filter((p) => p.length > 0).pop() ?? "";
    if (branch.length === 0 || base.length === 0) return null;
    return { sessionId: `desktop-${base}`, branch };
  } catch {
    return null;
  }
}

// ---------- verdict / activity / presence overlay drivers (ADR-0119 deferred overlay) ----------
//
// Re-composed from apps/studio/server's PgBackend reads (libraryBackend.ts) — the SAME raw SQL over
// events.verdict / events.work_event + PgPresenceStore over events.session — so the desktop forest
// paints the SAME proof-health / wisp / session layers as the hosted studio. NOT an import of
// apps/studio/server (the surface boundary, ADR-0100). This is the operator-attested GLUE the desktop
// story assigns to electron/backend-entry.ts (the sidecar wiring is attested, not a CI capability); the
// CI-proven core is the tree-verdicts.ts fold, exercised through these seams by stubs. Each read is
// ADVISORY (ADR-0033): null on ANY failure (stopped DB, missing table, timeout), never a throw, so a
// down DB leaves the tree under-claiming rather than hanging /api/tree. Failures are LOGGED (once
// per failing streak, src/backend/advisory.ts) so a silently-stale overlay is distinguishable from
// a genuinely empty one in the sidecar's stderr (inherited by the Electron main).

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
// The three ADR-0138 §5 subagent colour-states — guards the advisory `doc->>'colourState'` read so a
// malformed value (or the §5-forbidden "green"/"bloom") can never reach the build wisp's role tint.
const COLOUR_STATES: ReadonlySet<string> = new Set(["authoring", "proving", "supplementing"]);
// The claim stale-reclaim window (ADR-0138 §5) — mirrors CLAIM_STALE_RECLAIM_MS in
// @storytree/notice-board and the studio inFlightActivity fold (re-composed here, the surface
// boundary): a claim whose heartbeat aged out belongs to a crashed holder, so the wisp self-heals
// rather than orbiting forever.
const CLAIM_STALE_RECLAIM_MS = 2 * 60 * 60 * 1_000; // 2 h

// Race an advisory read against a short timeout; null on ANY failure (the PgBackend pattern),
// each failure logged once per streak to stderr (the CI-proven core, src/backend/advisory.ts).
const advisory = createAdvisoryReader({ timeoutMs: ADVISORY_TIMEOUT_MS });

const toIso = (at: Date | string): string =>
  at instanceof Date ? at.toISOString() : new Date(at).toISOString();

// ---------- listen / shutdown (shared by the live + degraded paths) ----------

/** Bind the server to an ephemeral 127.0.0.1 port and print the ONE handshake line main.ts parses. */
async function announce(server: import("node:http").Server): Promise<number> {
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const { port } = server.address() as AddressInfo;
  // The ONE line main.ts parses off stdout — everything else logs to stderr so it can't be mistaken
  // for the handshake.
  process.stdout.write(`STORYTREE_BACKEND_PORT=${port}\n`);
  return port;
}

/** Reap cleanly when the Electron main kills us on quit: run `cleanup` once, then exit. */
function installShutdown(
  server: import("node:http").Server,
  cleanup: () => Promise<void>,
): void {
  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    console.error(`[backend-entry] ${signal} — shutting down`);
    server.close(() => {
      void cleanup().finally(() => process.exit(0));
    });
    // Belt-and-braces: never hang the parent's quit on a stuck socket.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Serve the DEGRADED read shell when the store could not be acquired (down/unreachable DB, missing IAM
 * user). The window still OPENS: the boot read routes serve docs (comments empty), the local backend
 * renders the authored tree with no proof overlays, and /api/health reports `unreachable` — which the
 * studio turns into its "Start DB" banner rather than the old "sidecar not started" dead-end. No chat /
 * build / spawn surface (those need the live stores); they return 404 until the DB is back and the app
 * is relaunched. This is the graceful-degrade counterpart to `main()`'s full wiring.
 */
async function serveDegraded(reason: string): Promise<void> {
  console.error(
    `[backend-entry] store unavailable — serving the DEGRADED read shell (no chat/build/spawn) ` +
      `until the DB is reachable: ${reason}`,
  );
  const bootRoutes = createBootReadRoutes({ docsDir, listComments: async () => [] });
  const localHandler = createLocalBackend({
    storiesDir,
    docsDir,
    backend: degradedBackend(),
    store: "pg",
  });
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
  const port = await announce(server);
  console.error(
    `[backend-entry] DEGRADED backend listening on 127.0.0.1:${port} (repo ${repoRoot}) — DB unreachable`,
  );
  installShutdown(server, () => Promise.resolve());
}

// ---------- main ----------

async function main(): Promise<void> {
  // Record which credential env vars the operator EXPLICITLY set, BEFORE any hydration runs — the
  // precedence anchor for the build path (explicit env > keychain > secrets file, the secrets.ts
  // posture): once loadLocalSecrets fills the file tier below, "explicit" and "file-hydrated" are
  // indistinguishable in process.env, so the distinction must be captured here.
  const explicitCredentialEnv: ReadonlySet<string> = new Set(
    Object.values(CREDENTIAL_ENV_VAR).filter((name) => (process.env[name] ?? "").trim() !== ""),
  );

  // Fill STORYTREE_DB_USER (the keyless IAM principal) from ~/.storytree/secrets.json when unset —
  // env always wins (ADR-0021 / the drive secrets seam). createPool needs it to authenticate.
  loadLocalSecrets();

  // Acquire the store TOLERANTLY: createPool throws on a missing IAM user or an unreachable instance
  // (its connector.getOptions is an eager network call). Rather than let that kill the sidecar before it
  // ever listens — the old silent exit-1 — degrade to a read-only shell so the window still opens with a
  // "Start DB" banner (ADR-0119: /api/health NEVER 503; the advisory contract, ADR-0033, extended to
  // pool creation). A stale-node_modules import failure still surfaces via main.ts's stderr capture.
  const store = await acquireBackendStore(() => createPool());
  if (!store.ok) {
    await serveDegraded(store.reason);
    return;
  }
  const { pool, connector } = store.handle;
  const library = new PgLibraryStore(pool);
  const comments = new PgCommentStore(pool);
  const presence = new PgPresenceStore(pool);

  // The RAW signed-verdict event stream (events.verdict ORDER BY seq) shaped as `{ kind: 'signing',
  // seq, doc }` — shared by the backend's advisory overlay read below AND the orientation runner's
  // verdict reader (which wants the throw-on-failure form; drive's readVerdictEvents catches it).
  const readVerdictEventRows = async (): Promise<{ kind: string; seq: number; doc: unknown }[]> => {
    const res = await pool.query(`SELECT seq, doc FROM events.verdict ORDER BY seq`);
    return res.rows.map((raw) => {
      const row = raw as { seq: string | number; doc: unknown };
      return { kind: SIGNING_EVENT_KIND, seq: Number(row.seq), doc: row.doc };
    });
  };

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
      advisory("latest-verdicts", async () => {
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
    // The RAW signed-verdict event stream — what the per-test crown roll-up
    // (rollupStoryGreen/rollupCapStatus) reads; advisory here (null on any failure).
    verdictEvents: async () => advisory("verdict-events", readVerdictEventRows),
    // Active notice-board sessions (events.session) with the staleness band derived at read time — the
    // session dock layer (ADR-0033), mirroring the studio PgBackend's activeSessions.
    activeSessions: async () =>
      advisory("active-sessions", async () => {
        const docs = await presence.listActive();
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
      advisory("in-flight-builds", async () => {
        const res = await pool.query(
          // ADR-0138 §5: `doc->>'colourState'` rides alongside `phase` — the live subagent role tint
          // (advisory; null on a pre-ADR-0138 mark). Mirrors the studio PgBackend.inFlightBuilds SQL.
          `WITH latest_building AS (
             SELECT DISTINCT ON (unit_id)
               unit_id, tier, doc->>'runId' AS run_id, doc->>'phase' AS phase,
               doc->>'colourState' AS colour_state, at
             FROM events.work_event
             WHERE type = 'building'
             ORDER BY unit_id, seq DESC
           )
           SELECT lb.unit_id, lb.tier, lb.run_id, lb.phase, lb.colour_state, lb.at
             FROM latest_building lb
            WHERE lb.run_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM events.verdict v
                 WHERE v.unit_id = lb.unit_id AND v.run_id = lb.run_id
              )`,
        );
        const now = Date.now();
        const out: {
          unitId: string;
          tier: string;
          runId: string;
          at: string;
          phase?: string;
          colourState?: string;
        }[] = [];
        for (const raw of res.rows) {
          const row = raw as {
            unit_id: string;
            tier: string;
            run_id: string;
            phase: string | null;
            colour_state: string | null;
            at: Date | string;
          };
          const at = toIso(row.at);
          if (now - new Date(at).getTime() >= IN_FLIGHT_TTL_MS) continue; // past the TTL — cleared
          const phase = row.phase != null && GATE_PHASES.has(row.phase) ? row.phase : undefined;
          const colourState =
            row.colour_state != null && COLOUR_STATES.has(row.colour_state) ? row.colour_state : undefined;
          out.push({
            unitId: row.unit_id,
            tier: row.tier,
            runId: row.run_id,
            at,
            ...(phase !== undefined ? { phase } : {}),
            ...(colourState !== undefined ? { colourState } : {}),
          });
        }
        return out;
      }),
    // In-flight story CLAIMS (ADR-0138): every live events.node_claim row folded into a
    // claimed-but-not-proven map activity (`kind: "claim"`) — the coordination wisp layer, sibling to
    // inFlightBuilds. `unit_id` is the PRIMARY KEY so at most one row per unit (no DISTINCT ON needed).
    // A stale claim (heartbeat aged past CLAIM_STALE_RECLAIM_MS) is dropped so a crashed holder's wisp
    // self-heals. §5 honesty wall: `kind: "claim"` is NEVER a proven-green bloom. Mirrors the studio
    // PgBackend.inFlightClaims + its claimsToActivity fold (re-composed here, the surface boundary).
    // claim-wisp-cold-start (FIX 2b): the CLAIMS read alone gets a softer per-read budget — a larger
    // timeout + one retry — so a just-taken claim survives a DB cold-start that exceeds the shared 4s
    // (the fresh wisp is not silently dropped). The other four reads keep the shared 4s so /api/tree
    // never waits longer for them. Still advisory: a genuinely down DB nulls promptly (bounded retry).
    inFlightClaims: async () =>
      advisory(
        "in-flight-claims",
        async () => {
        const res = await pool.query(
          `SELECT unit_id, session_id, branch, intent, claimed_at, heartbeat_at
             FROM events.node_claim`,
        );
        const now = Date.now();
        const out: {
          unitId: string;
          kind: "claim";
          sessionId: string;
          branch: string;
          intent: string;
          at: string;
        }[] = [];
        for (const raw of res.rows) {
          const row = raw as {
            unit_id: string;
            session_id: string;
            branch: string;
            intent: string;
            claimed_at: Date | string;
            heartbeat_at: Date | string;
          };
          const hbAt = toIso(row.heartbeat_at);
          if (now - new Date(hbAt).getTime() > CLAIM_STALE_RECLAIM_MS) continue; // stale — self-heals
          out.push({
            unitId: row.unit_id,
            kind: "claim",
            sessionId: row.session_id,
            branch: row.branch,
            intent: row.intent,
            at: toIso(row.claimed_at),
          });
        }
        return out;
        },
        { timeoutMs: 15_000, retryOnce: true },
      ),
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
  // THE ORIENTATION SEAM (closing the old boundary fork): the session's read-only orientation tools
  // (tree/library/noticeboard) dispatch through @storytree/drive's createOrientationRunner — the
  // drive-resident composition of the SAME three read commands the terminal CLI serves (the CLI's
  // run() itself stays in @storytree/cli, which this sidecar may not import; ADR-0112) — composed
  // here over the LIVE stores: the pg library store (dashboard), the stories/ dir + signed-verdict
  // log (tree), and the presence store (noticeboard + the tree's sessions block). The verdict read
  // shares readVerdictEventRows with the forest overlays; a down DB throws inside the reader and the
  // tree renders with the proof columns silently absent (the offline-silent contract),
  // never a hung tool. Attestation vouch-marks are not wired here (no attestation read in this
  // sidecar yet) — that column is silently absent, an honest under-claim. READ/PROPOSE only either
  // way: the runner carries no write verb (the Phase-2 wall, ADR-0091).
  const orientationRunner = createOrientationRunner({
    store: library,
    storiesDir,
    presence,
    verdicts: { readEvents: readVerdictEventRows },
  });
  // The chat mount is composed AFTER the build context below — its OPTIONAL spawn surface
  // (ADR-0137 Phase 3) needs the live BuildContext (the builder spawn's caller of the routed
  // worker). See the `chatMount` composition below.

  // The desktop BUILD seam (ADR-0133 d.3 — the desktop story's operator-attested sidecar glue): the
  // relocated worker's BuildContext, over which createBuildRouteMount (POST/GET /api/build) drives a
  // real build from the human's click on the story detail panel's Build/Adopt affordance. (The chat
  // accept-to-Build route was retired by ADR-0155 — the orchestrator DRIVES via its spawn + landing
  // tools, so there is no /api/chat/accept dispatch anymore.) The routedBuildRunner ROUTES by tier
  // (a story → `story build --real` that persists verdicts + opens the auto-merging PR; a node →
  // `node build --real` that persists the signed verdict and parks a claude/real/<unit>-<run> branch
  // the human lands — ADR-0144/0031/0136); the build ENTRIES + discovery are imported LAZILY inside
  // the closures (the raw-TS `.js` re-export trap, exactly the devApi.ts recipe). This wiring is
  // OPERATOR-ATTESTED (verified by the live walk, ADR-0070), NOT a CI assertion — a node:test over the
  // real routedBuildRunner would spawn a subscription-billed `--real` build on a gate pass (the live
  // spend ADR-0010 §5 forbids); the CI-proven core is the mount factory over an INJECTED BuildContext
  // (build-route.test.ts). A SAFE write — the spend is the human's click, not
  // this wiring; the spine signs, CI re-proves green before trunk (ADR-0091 / ADR-0022).
  const loadBuildUnit = async (
    unitId: string,
  ): Promise<
    | { kind: "node"; spec: import("@storytree/orchestrator").NodeSpec }
    | {
        kind: "story";
        spec: import("@storytree/orchestrator").NodeSpec;
        caps: import("@storytree/orchestrator").NodeSpec[];
      }
    | null
  > => {
    const { findNodeSpecFile, loadNodeSpec } = await import("@storytree/orchestrator");
    const file = findNodeSpecFile(storiesDir, unitId);
    if (file === null) return null;
    let spec: import("@storytree/orchestrator").NodeSpec;
    try {
      spec = loadNodeSpec(file);
    } catch {
      return null; // a malformed spec is not buildable, never a crash
    }
    if (spec.tier !== "story") return { kind: "node", spec };
    const caps = spec.capabilities
      .map((id) => {
        const f = findNodeSpecFile(storiesDir, id);
        if (f === null) return null;
        try {
          return loadNodeSpec(f);
        } catch {
          return null;
        }
      })
      .filter((s): s is import("@storytree/orchestrator").NodeSpec => s !== null);
    return { kind: "story", spec, caps };
  };
  // The credential bridge wired into the build path (ADR-0109 Step 2 / ADR-0113 §5, the
  // local-credential-wiring glue): the keychain-held credential is read PER BUILD — in this
  // main-owned sidecar, through the SAME CredentialBroker over the SAME OS keychain the Electron
  // main writes (the sidecar IS the Electron binary in Node mode, so the keychain entry is
  // reachable and, on macOS, ACL-matched) — and made ambient for exactly the build's duration
  // (the SDK leaf's auth is ambient; nodeBuild/storyBuild take no env), then scrubbed.
  // Per-build reads mean sign-in-after-launch works without a restart and sign-out fails the
  // next build closed (the bridge's typed rejection → an honest failed run, never an empty
  // token). The raw token never rides the spawn env, an HTTP hop, a sink line, or any
  // renderer-reachable surface (ADR-0109 d.4). Precedence: explicit env (recorded above) >
  // keychain > the secrets file loadLocalSecrets hydrated. Proven offline by
  // credentialed-build-runner.test.ts over an injected env; this composition over the real
  // NapiKeychain is sidecar glue, operator-attested like the rest of this file.
  const build: BuildContext = {
    registry: new BuildRegistry(),
    runner: credentialedBuildRunner({
      broker: new CredentialBroker(new NapiKeychain()),
      explicitEnvVars: explicitCredentialEnv,
      runner: routedBuildRunner({
        classify: async (unitId) =>
          (await loadBuildUnit(unitId))?.kind === "story" ? "story" : "node",
        nodeBuild: async (unitId, opts) => {
          const { nodeBuild } = await import("@storytree/drive/build");
          return nodeBuild(unitId, { dryRun: false, real: false, ...opts });
        },
        storyBuild: async (unitId, opts) => {
          const { storyBuild } = await import("@storytree/drive/build");
          return storyBuild(unitId, opts);
        },
      }),
    }),
    isBuildable: async (unitId) => {
      const unit = await loadBuildUnit(unitId);
      if (unit === null) return false;
      const { resolveBuildConfig, isStoryBuildable } = await import("@storytree/orchestrator");
      // A story is buildable when `story build <id> --real` has real work; a node when it carries a proof
      // config (the SAME discovery the CLI prechecks with) — exactly devApi.ts's isBuildable.
      return unit.kind === "story"
        ? isStoryBuildable(unit.spec, unit.caps, "real")
        : resolveBuildConfig(unit.spec) != null;
    },
  };
  const buildRouteMount = createBuildRouteMount(build);

  // ---------- the chat SPAWN surface (ADR-0137 Phase 3 — the sidecar wiring) ----------
  //
  // Compose the REAL spawn deps and thread them into the chat mount so the desktop
  // session-orchestrator gains SPAWN power (spawn the story-author to bring a story in; spawn the
  // builder leaf to drive a change red→green) — never raw Write/Bash (ADR-0137 d.1). The chat itself
  // still carries `tools: []`; the writes happen only inside the spawned subagents under their own
  // fences, and the spine remains the sole signer, the human the sole lander.
  //
  // OPERATOR-ATTESTED GLUE (like the build path above): a node:test over this composition would spawn
  // subscription-billed SDK sessions on a gate pass (ADR-0010 §5 forbids the live spend). The
  // CI-proven cores are buildSpawnDeps (packages/drive/src/spawn-deps.test.ts) and the mount's spawn
  // forwarding (chat-sse-mount.test.ts) over injected doubles; this file composes the real pieces:
  //   - store       — the live pg library store (renders the story-author agent fail-closed, ADR-0051)
  //   - claimStore  — the live pg claim store, adapted to the gate's narrow claim/bumpHeartbeat seam
  //   - identity    — the ADR-0033 session key (worktree name / desktop-scoped id + live HEAD branch),
  //                   stamped into every spawn claim so a refusal names a real holder (ADR-0138 §2)
  //   - build       — the SAME routed BuildContext the accept click drives (a third caller, ADR-0090)
  //   - cwd         — the repo checkout the spawned story-author writes its stories/** under
  //
  // FAIL-CLOSED / DEGRADE-QUIET: a blank identity, an absent story-author agent, or an unreachable git
  // yields NO spawn surface — the chat mounts propose-only (byte-identical to today), logged once to
  // stderr. The spawn power is additive; its absence never breaks the read/propose chat.
  const identity = deriveChatIdentity(repoRoot);
  let spawn: SpawnSurfaceDeps | undefined;
  let landing: LandingSurfaceDeps | undefined;
  if (identity === null) {
    console.error(
      "[backend-entry] no session identity (git unreachable) — chat mounts propose-only, no spawn/landing surface",
    );
  } else {
    const claims = new PgClaimStore(pool);
    // Adapt PgClaimStore to the gate's narrow ClaimStore seam: its bumpHeartbeat takes (unitId,
    // sessionId) and returns a boolean; the seam wants bumpHeartbeat(unitId): Promise<void> (the
    // heartbeat is always this session's, ADR-0138 §4).
    const claimStore: SpawnSurfaceDeps["store"] = {
      claim: (req) => claims.claim(req),
      bumpHeartbeat: async (unitId) => {
        await claims.bumpHeartbeat(unitId, identity.sessionId);
      },
    };
    // Give the chat-spawned story-author a realistic authoring budget: buildSpawnDeps applies maxTurns
    // to the story-author path ONLY (the builder dispatch is unaffected — it keeps the generic 16-turn
    // brake), so raising it here does not weaken the runaway brake elsewhere (ADR-0130). Env-tunable via
    // STORYTREE_SPAWN_MAX_TURNS; defaults to DEFAULT_STORY_AUTHOR_MAX_TURNS because authoring against the
    // whole corpus reliably overruns 16 and returns a false ✗ after already writing valid stories/**.
    const composed = await buildSpawnDeps({
      store: library,
      claimStore,
      sessionId: identity.sessionId,
      branch: identity.branch,
      cwd: repoRoot,
      build,
      maxTurns: resolveSpawnMaxTurns(process.env.STORYTREE_SPAWN_MAX_TURNS),
    });
    if (composed.ok) {
      spawn = composed.deps;
      console.error(
        `[backend-entry] spawn surface composed — chat can spawn the inner loop ` +
          `(session ${identity.sessionId} on ${identity.branch})`,
      );
    } else {
      console.error(
        `[backend-entry] spawn surface NOT composed (chat stays propose-only): ${composed.error}`,
      );
    }

    // ---------- the chat LANDING surface (ADR-0152 — the desktop-orchestrator full-autonomy arc) ----------
    //
    // Compose the REAL landing deps and thread them into the chat mount so the desktop
    // session-orchestrator gains the MERGE CEREMONY (run `pnpm gate`; open a NON-DRAFT PR that CI
    // auto-merges) — parity with the terminal agent (ADR-0152 relaxes the ADR-0137 d.3 Phase-2 wall
    // for the desktop orchestrator). buildLandingDeps composes over the SAME repo cwd + session branch
    // the spawn deps derive; OMIT `exec` so the real `child_process` spawn runs (win32 `pnpm` wrapped
    // via cmd.exe; git/gh pass through — @storytree/drive's defaultExec). This is PARITY, not a new
    // trust escalation: the chat still carries `tools: []` (run_gate/open_landing_pr are the ONLY
    // landing verbs), run_gate OBSERVES the exit code (never rewrites red→green), open_landing_pr
    // never `gh pr merge`s — the spine stays the sole signer, CI the sole lander (ADR-0091 / ADR-0022).
    //
    // OPERATOR-ATTESTED GLUE (like the spawn/build paths above): a node:test over this composition
    // would run a real gate / open a real PR on a gate pass — the CI-proven cores are buildLandingDeps
    // (packages/drive/src/landing-deps.test.ts, over an injected exec seam) and the mount's landing
    // forwarding (chat-sse-mount.test.ts, over a double); this file composes the real pieces.
    //
    // FAIL-CLOSED / DEGRADE-QUIET: a blank identity is refused by buildLandingDeps before any deps are
    // built (typed { ok:false }); on refusal the chat mounts WITHOUT the landing surface — read/propose/
    // spawn only, byte-identical to before ADR-0152 — logged once to stderr. The landing power is
    // additive; its absence never breaks the read/propose/spawn chat.
    const landingComposed = buildLandingDeps({ cwd: repoRoot, branch: identity.branch });
    if (landingComposed.ok) {
      landing = landingComposed.deps;
      console.error(
        `[backend-entry] landing surface composed — chat can run the gate + open the auto-merging PR ` +
          `(branch ${identity.branch})`,
      );
    } else {
      console.error(
        `[backend-entry] landing surface NOT composed (chat stays read/propose/spawn only): ${landingComposed.error}`,
      );
    }
  }
  // The orchestrator SESSION turn cap (ADR-0151): UNBOUNDED by default — the desktop chat is the
  // human-watched session-orchestrator loop, so a fixed cap that false-fails a healthy long
  // orient/propose costs more than it protects. resolveOrchestratorMaxTurns returns undefined unless
  // the operator RE-imposes a cap via STORYTREE_ORCHESTRATOR_MAX_TURNS (a bounded/debug run); undefined
  // → no maxTurns forwarded → the SDK runs unbounded. This is the SESSION cap only — the chat-spawned
  // story-author keeps its own STORYTREE_SPAWN_MAX_TURNS brake (resolveSpawnMaxTurns above) and the
  // builder leaf keeps the generic 16-turn brake (ADR-0130 unchanged there).
  const orchestratorMaxTurns = resolveOrchestratorMaxTurns(process.env.STORYTREE_ORCHESTRATOR_MAX_TURNS);
  const chatMount = createChatSseMount({
    runner: orientationRunner,
    ...(spawn !== undefined ? { spawn } : {}),
    ...(landing !== undefined ? { landing } : {}),
    ...(orchestratorMaxTurns !== undefined ? { maxTurns: orchestratorMaxTurns } : {}),
  });

  const localHandler = createLocalBackend({ storiesDir, docsDir, backend, store: "pg" });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (await bootRoutes(req, res, pathname)) return;
        if (await chatMount(req, res, pathname)) return;
        if (await buildRouteMount(req, res, pathname)) return;
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

  const port = await announce(server);
  console.error(`[backend-entry] thick-local backend listening on 127.0.0.1:${port} (repo ${repoRoot})`);

  // Reap cleanly when the Electron main kills us on quit: drain the pool + close the socket once.
  installShutdown(server, () => closePool(pool, connector));
}

main().catch((err: unknown) => {
  console.error(`[backend-entry] failed to start: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
