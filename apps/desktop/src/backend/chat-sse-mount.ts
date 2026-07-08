// Chat SSE mount factory — POST /api/chat dispatcher that streams startChatStream events as SSE.
// No `electron` and no `dom` import; headlessly provable by node:test over a real node:http server.
//
// THE BOUNDARY CALL: imports startChatStream from @storytree/drive by package name (never from
// apps/studio/server). Reproduces local HTTP helpers (readBody, readJsonBody) as local-backend.ts
// does. Does NOT import @storytree/library/store (no DB path in the chat route) and does NOT
// import @storytree/storage-protocol directly (it is drive's internal dep, not desktop's declared
// dep). Instead a minimal inline SeedStore satisfies the Store interface structurally at runtime.

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type {
  ChatStreamEvent,
  SpawnSurfaceDeps,
  LandingSurfaceDeps,
  InspectSurfaceDeps,
} from "@storytree/drive";
import { startChatStream } from "@storytree/drive";

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

// ---------- Inline minimal Store (mirrors @storytree/storage-protocol's Store structurally) ----------
//
// Avoids a direct import of @storytree/storage-protocol — that package is drive's declared dep,
// not desktop's, so Node.js strict isolation prevents resolution from apps/desktop/.
// The inline class satisfies the Store interface structurally at runtime (duck typing).

interface StoredDocLike {
  id: string;
  kind: string;
  doc: unknown;
  createdAt: string;
  updatedAt: string;
}

interface StoreEventLike {
  seq: number;
  id: string;
  kind: string;
  type: "created" | "updated" | "deleted";
  doc: unknown;
  actor: string;
  at: string;
}

class SeedStore {
  private readonly docs = new Map<string, StoredDocLike>();
  private seq = 0;

  async upsertDoc(input: {
    id: string;
    kind: string;
    doc: unknown;
    actor?: string;
  }): Promise<StoredDocLike> {
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
    if (filter?.kind !== undefined) {
      const kind = filter.kind;
      return all.filter((d) => d.kind === kind);
    }
    return all;
  }

  async deleteDoc(
    id: string,
    _opts?: { actor?: string; reason?: string; supersededBy?: string },
  ): Promise<boolean> {
    return this.docs.delete(id);
  }

  async appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEventLike> {
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

  async readEvents(_filter?: { id?: string }): Promise<StoreEventLike[]> {
    return [];
  }
}

// ---------- Default store (seed corpus loaded once per process) ----------

let defaultStorePromise: Promise<SeedStore> | null = null;

function getDefaultStore(): Promise<SeedStore> {
  if (defaultStorePromise === null) {
    defaultStorePromise = loadDefaultStore();
  }
  return defaultStorePromise;
}

/**
 * Create a SeedStore seeded with the corpus from apps/studio/data/.
 * Reproduces the algorithm from @storytree/library/store's loadCorpus without importing it.
 */
async function loadDefaultStore(): Promise<SeedStore> {
  const store = new SeedStore();

  // Resolve data dir: apps/desktop/src/backend/ → 4 levels up → repo root → apps/studio/data/
  const dataBase = new URL("../../../../apps/studio/data/", import.meta.url);

  const units = JSON.parse(
    await readFile(fileURLToPath(new URL("knowledge.json", dataBase)), "utf8"),
  ) as Array<{ id: string; kind: string; [k: string]: unknown }>;
  for (const unit of units) {
    await store.upsertDoc({ id: unit.id, kind: unit.kind, doc: unit, actor: "corpus-migration" });
  }

  const assets = JSON.parse(
    await readFile(fileURLToPath(new URL("assets.json", dataBase)), "utf8"),
  ) as Array<{ id: string; category: string; [k: string]: unknown }>;
  for (const tpl of assets.filter((a) => a.category === "template")) {
    await store.upsertDoc({ id: tpl.id, kind: "template", doc: tpl, actor: "corpus-migration" });
  }

  return store;
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
   * OPTIONAL spawn surface deps (ADR-0137 Phase 3). Present → the chat session mounts the
   * claim-gated `spawn_story_author` / `spawn_builder` tools (the orchestrator can spawn the inner
   * loop). Absent → propose-only, byte-identical to today (the same §7 scale-down as `runner`). The
   * mount FORWARDS this opaque token through to `startChatStream` → `orchestrate`; it never
   * constructs it — the sidecar (backend-entry.ts) composes the real deps via `buildSpawnDeps`.
   * The chat session itself still carries NO Write/Edit/Bash (ADR-0137 d.1); the writes happen only
   * inside the spawned subagents under their own fences.
   */
  spawn?: SpawnSurfaceDeps;
  /**
   * OPTIONAL landing surface deps (ADR-0152, the desktop-orchestrator full-autonomy arc). Present →
   * the chat session mounts the fail-closed `run_gate` / `open_landing_pr` tools (the merge-ceremony
   * surface: the orchestrator can run the gate and open a NON-DRAFT PR that CI auto-merges, ADR-0022).
   * Absent → propose-only, byte-identical to today (the same §7 scale-down as `spawn`). The mount
   * FORWARDS this opaque token through to `startChatStream` → `orchestrate`; it never constructs it —
   * the sidecar (backend-entry.ts) composes the real deps via `buildLandingDeps`. The chat session
   * itself still carries NO Write/Edit/Bash (ADR-0137 d.1 / ADR-0152); `run_gate` only OBSERVES a
   * pass/fail and `open_landing_pr` never `gh pr merge`s — the spine stays the sole signer, CI the
   * sole lander (ADR-0091 / ADR-0022).
   */
  landing?: LandingSurfaceDeps;
  /**
   * OPTIONAL inspect surface deps (ADR-0173, the read-only CI/git inspection surface). Present → the
   * chat session mounts the fail-closed READ-ONLY `view_ci_run` / `view_pr_checks` / `git_inspect`
   * tools (the orchestrator can read a failing-job log, an arbitrary PR's checks, the read-only git
   * verbs — so it can root-cause a red pipeline itself instead of theorising). Absent → byte-identical
   * to today (the same §7 scale-down as `landing`). The mount FORWARDS this opaque token through to
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
   * value bounds the session for a debug/bounded run. This is the session cap only — the spawned
   * story-author / builder keep their own runaway brakes (ADR-0130 unchanged there).
   */
  maxTurns?: number;
}

// ---------- Bridge startChatStream ----------
//
// startChatStream's Store parameter type comes from @storytree/storage-protocol, which is
// drive's dep but NOT desktop's declared dep (Node.js strict isolation).
// Bridge the function type so TypeScript accepts our inline SeedStore without needing to
// resolve @storytree/storage-protocol from desktop's module resolution chain.

type BridgedStartStream = (args: {
  intent: string;
  store: SeedStore;
  resume?: string;
  queryFn?: SseMountQueryFn;
  runner?: SseOrientationRunner;
  spawn?: SpawnSurfaceDeps;
  landing?: LandingSurfaceDeps;
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

    // Resolve the lazy-loaded seed corpus store (created once per process).
    const store = await getDefaultStore();

    // Set SSE response headers before the first frame.
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Build args — forward queryFn/runner/spawn/landing/inspect/maxTurns only when present
    // (exactOptionalPropertyTypes).
    const streamArgs: {
      intent: string;
      store: SeedStore;
      resume?: string;
      queryFn?: SseMountQueryFn;
      runner?: SseOrientationRunner;
      spawn?: SpawnSurfaceDeps;
      landing?: LandingSurfaceDeps;
      inspect?: InspectSurfaceDeps;
      maxTurns?: number;
    } = {
      intent,
      store,
      ...(resume !== undefined ? { resume } : {}),
      ...(deps.queryFn !== undefined ? { queryFn: deps.queryFn } : {}),
      ...(deps.runner !== undefined ? { runner: deps.runner } : {}),
      ...(deps.spawn !== undefined ? { spawn: deps.spawn } : {}),
      ...(deps.landing !== undefined ? { landing: deps.landing } : {}),
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
