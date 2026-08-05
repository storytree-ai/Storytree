// Chat SSE mount factory — POST /api/chat dispatcher that streams startChatStream events as SSE.
// No `electron` and no `dom` import; headlessly provable by node:test over a real node:http server.
//
// THE BOUNDARY CALL: imports startChatStream from @storytree/drive by package name (never from
// apps/studio/server). Reproduces local HTTP helpers (readBody, readJsonBody) as local-backend.ts
// does. Does NOT import @storytree/library/store (no DB path in the chat route) and does NOT
// import @storytree/storage-protocol directly (it is drive's internal dep, not desktop's declared
// dep). The corpus store comes from drive's `openCorpusStore`, so its type flows in structurally.

import type { IncomingMessage, ServerResponse } from "node:http";

import type { ChatStreamEvent, InspectSurfaceDeps } from "@storytree/drive";
import { startChatStream, openCorpusStore } from "@storytree/drive";

// ---------- HTTP helpers (local copies — not imported from studio) ----------

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

// ---------- Default store (the LIVE corpus, opened once per process) ----------

/** The corpus store `startChatStream` reads — structurally, so no direct storage-protocol import. */
type ChatCorpusStore = Awaited<ReturnType<typeof openCorpusStore>>["store"];

let defaultStorePromise: Promise<ChatCorpusStore> | null = null;

/**
 * The live library store, opened lazily on the first chat request and kept for the process (a
 * connection pool is exactly the thing you hold open).
 *
 * IT USED TO CLONE `loadCorpus` INLINE over `apps/studio/data/knowledge.json`, and that file is
 * deleted (ADR-0302 D1). The replacement had to be the live store rather than the small committed
 * fixture, because of WHAT this store is for: `startChatStream` renders the real
 * `session-orchestrator` agent out of it as the chat's system prompt. Serving a fixture here would
 * not fail — it would succeed with a thinner agent, which is precisely the silent degradation
 * ADR-0302 D4's "deleted, not left inert" rule exists to prevent.
 *
 * THE BOUNDARY IS INTACT AND WAS THE CONSTRAINT ON THE FIX: this reaches the store through
 * `@storytree/drive`, already a declared dep and already the only package this module talks to. No
 * `pg`, no Cloud SQL connector, no `@storytree/library/store` — the four import bans that
 * chat-sse-mount.test.ts pins statically all still hold. The local `SeedStore` that satisfied the
 * `Store` shape for the seed went with it; the type now flows through drive.
 *
 * A failure to open PROPAGATES: the caller turns it into an SSE error frame, so a chat request
 * against an unreachable store says so instead of streaming an answer from an empty corpus.
 */
function getDefaultStore(): Promise<ChatCorpusStore> {
  if (defaultStorePromise === null) {
    defaultStorePromise = openCorpusStore("desktop chat")
      .then((c) => c.store)
      // Do NOT cache a rejection: a DB that was down when the app booted must not poison every
      // later chat request for the life of the process.
      .catch((err: unknown) => {
        defaultStorePromise = null;
        throw err;
      });
  }
  return defaultStorePromise;
}

// ---------- Types ----------

/**
 * The injectable query function type for the mount (structurally compatible with
 * @storytree/agent's SdkQueryFn — defined locally to avoid resolving that package
 * from the desktop module context).
 */
type SseMountQueryFn = (args: { prompt: string; options: unknown }) => AsyncIterable<unknown>;

/**
 * The envelope shape an orientation command returns (structurally matches @storytree/agent's
 * OrientationEnvelope and @storytree/drive's Envelope — defined locally, same reason as
 * {@link SseMountQueryFn}).
 */
interface SseOrientationEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly doctrine?: readonly string[];
  readonly next?: readonly string[];
}

/**
 * The injectable orientation runner type (structurally compatible with @storytree/agent's
 * OrientationRunner). The live composition is @storytree/drive's `createOrientationRunner`
 * over the sidecar's live stores (backend-entry.ts); tests inject a scripted double.
 */
export type SseOrientationRunner = (
  argv: readonly string[],
  deps: unknown,
) => Promise<SseOrientationEnvelope>;

/** Dependencies injected into {@link createChatSseMount}. */
export interface ChatSseMountDeps {
  /**
   * Injectable CORPUS STORE — the library the session's system prompt is rendered from. Omit for a
   * live run and the mount opens the live store lazily ({@link getDefaultStore}).
   *
   * It exists for the same reason `queryFn` does, and it became REQUIRED for the same reason: once
   * ADR-0302 D1 moved the default from a committed file to Cloud SQL, a test that omitted it would
   * dial a real database — and worse, would never exit, because the pool the mount deliberately
   * holds for the process lifetime keeps the event loop alive. A unit test of an HTTP mount should
   * touch neither the network nor a database, so the store joins the other injected collaborators.
   */
  store?: ChatCorpusStore;

  /**
   * Injectable SDK query function — an offline scripted double proves the mount without live
   * spend (ADR-0010 §5). Omit for a live run (the real SDK `query()` is used by default).
   */
  queryFn?: SseMountQueryFn;
  /**
   * The read-only orientation runner the session's tools dispatch through (the ADR-0108
   * orientation surface). Present → the session advertises the tree/library/noticeboard
   * orientation tools and the agent reads the REAL three surfaces. Absent → no orientation
   * tools are advertised (the §7 scale-down: a plain conversational session).
   * READ/PROPOSE ONLY either way (the Phase-2 wall, ADR-0091) — the runner carries no write verb.
   */
  runner?: SseOrientationRunner;
  /**
   * OPTIONAL inspect surface deps (ADR-0173, the read-only CI/git inspection surface). Present → the
   * chat session mounts the fail-closed READ-ONLY `view_ci_run` / `view_pr_checks` / `git_inspect`
   * tools (the orchestrator can read a failing-job log, an arbitrary PR's checks, the read-only git
   * verbs — so it can root-cause a red pipeline itself instead of theorising). Absent → byte-identical
   * to today (the same §7 scale-down as `runner`). The mount FORWARDS this opaque token through to
   * `startChatStream` → `orchestrate`; the sidecar (backend-entry.ts) composes the real deps via
   * `buildInspectDeps`. Observation ONLY: the chat session still carries NO Write/Edit/Bash
   * (ADR-0137 d.1 widened for reads, ADR-0173 invariant 1); no inspect tool mutates the tree.
   */
  inspect?: InspectSurfaceDeps;
  /**
   * OPTIONAL turn ceiling for the orchestrator SESSION (ADR-0151). Absent (the default) → the session
   * runs UNBOUNDED: the mount forwards no `maxTurns`, so `startChatStream` → `orchestrate` →
   * `runHeadlessOrchestrator` hand no `maxTurns` to the SDK. The orchestrator session is the
   * human-watched loop, so a fixed cap that false-fails a healthy long orient/propose costs more than
   * it protects. The sidecar (backend-entry.ts) resolves an operator RE-impose from
   * STORYTREE_ORCHESTRATOR_MAX_TURNS via `resolveOrchestratorMaxTurns` and passes it here; a positive
   * value bounds the session for a debug/bounded run.
   *
   * (The ADR-0137 `spawn` deps that used to sit above this — the claim-gated `spawn_story_author` /
   * `spawn_builder` mount — are gone: ADR-0175 retires the spawn surface with the interactive
   * orchestrator, ADR-0174. See spawn-surface-retired.test.ts.)
   */
  maxTurns?: number;
}

// ---------- Bridge startChatStream ----------
//
// startChatStream's Store parameter type comes from @storytree/storage-protocol, which is
// drive's dep but NOT desktop's declared dep (Node.js strict isolation).
// Bridge the function type so TypeScript accepts drive's store type without needing to
// resolve @storytree/storage-protocol from desktop's module resolution chain.

type BridgedStartStream = (args: {
  intent: string;
  store: ChatCorpusStore;
  resume?: string;
  queryFn?: SseMountQueryFn;
  runner?: SseOrientationRunner;
  inspect?: InspectSurfaceDeps;
  maxTurns?: number;
}) => AsyncGenerator<ChatStreamEvent>;

const bridgedStart = startChatStream as unknown as BridgedStartStream;

// ---------- Factory ----------

/**
 * Create the POST /api/chat SSE dispatcher.
 *
 * ROUTE TABLE:
 * - POST /api/chat  → validate { intent }, start startChatStream, stream events as SSE
 * - *   (anything else) → returns false (fall-through to the next dispatcher / the 404)
 *
 * Returns an async handler `(req, res, pathname) => Promise<boolean>`.
 *
 * READ/PROPOSE ONLY (Phase-2 wall, ADR-0091). The single-session guard is the
 * composition-level flag in orchestrate.ts (ADR-0108 d.6); a second concurrent session
 * streams a `refused` SSE frame, never a forged session.
 */
export function createChatSseMount(
  deps: ChatSseMountDeps,
): (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean> {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean> => {
    // Only handle POST /api/chat — fall through for every other route.
    if (pathname !== "/api/chat" || req.method !== "POST") {
      return false;
    }

    // Parse and validate the intent field.
    const body = await readJsonBody<Record<string, unknown>>(req);
    const intent =
      typeof body["intent"] === "string" ? body["intent"].trim() : "";

    if (!intent) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "intent is required and must be non-empty" }));
      return true;
    }

    // Parse the OPTIONAL resume field (ADR-0170 chat continuity): the sessionId a prior `done`
    // frame carried, threaded back so this send continues that conversation. FAIL-CLOSED on a
    // present-but-malformed value — silently ignoring it would restart a fresh memoryless session,
    // which is exactly the ADR-0163 gap-D bug this field exists to fix.
    const rawResume = body["resume"];
    if (rawResume !== undefined && (typeof rawResume !== "string" || !rawResume.trim())) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "resume, when present, must be a non-empty string" }));
      return true;
    }
    const resume = typeof rawResume === "string" ? rawResume.trim() : undefined;

    // The corpus store: an injected one when the caller supplied it, else the lazily-opened live
    // store (created once per process).
    const store = deps.store ?? (await getDefaultStore());

    // Set SSE response headers before the first frame.
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Build args — forward queryFn/runner/inspect/maxTurns only when present
    // (exactOptionalPropertyTypes).
    const streamArgs: {
      intent: string;
      store: ChatCorpusStore;
      resume?: string;
      queryFn?: SseMountQueryFn;
      runner?: SseOrientationRunner;
      inspect?: InspectSurfaceDeps;
      maxTurns?: number;
    } = {
      intent,
      store,
      ...(resume !== undefined ? { resume } : {}),
      ...(deps.queryFn !== undefined ? { queryFn: deps.queryFn } : {}),
      ...(deps.runner !== undefined ? { runner: deps.runner } : {}),
      ...(deps.inspect !== undefined ? { inspect: deps.inspect } : {}),
      ...(deps.maxTurns !== undefined ? { maxTurns: deps.maxTurns } : {}),
    };

    // Stream each ChatStreamEvent as one SSE frame (data: <json>\n\n) as it arrives.
    // startChatStream never throws — errors and refusals are typed terminal events.
    for await (const event of bridgedStart(streamArgs)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.end();
    return true;
  };
}
