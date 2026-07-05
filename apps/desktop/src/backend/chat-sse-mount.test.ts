// Integration test for chat-sse-mount.ts
//
// WHAT IT PINS: createChatSseMount composes the POST /api/chat dispatcher — the HTTP intake
// that starts a real startChatStream session (with an injected scripted queryFn) and streams
// its typed events as Server-Sent Events. The dispatcher:
//   - Parses { "intent": string } from the POST body; rejects missing/blank intent with 400
//   - Starts startChatStream → orchestrate → renderAgentPrompt over the seed corpus, with
//     ONLY the live-spend queryFn injected as a scripted double (forwarded from deps)
//   - Streams each ChatStreamEvent as one SSE frame (data: <json>\n\n) as it arrives
//   - Sets Content-Type: text/event-stream before the first frame
//   - Ends the response after the terminal event
//   - Falls through (returns false) for every other route — not a catch-all
//
// INTEGRATION TIER: real HTTP requests over a real node:http server; real startChatStream →
// real orchestrate → real renderAgentPrompt over the seed corpus; only the live-spend SDK
// queryFn is a scripted double. No live SDK, no DB, no network beyond loopback HTTP.
//
// DELETION TEST: removing createChatSseMount breaks the import and fails every assertion.
// Making the handler a catch-all breaks the fall-through tests. Dropping SSE serialisation
// breaks the Content-Type and data-frame assertions. Dropping the 400 guard allows blank
// intents to reach the real orchestrate composition. Removing the single-session guard allows
// a second concurrent session to stream a done frame instead of the required refused frame.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// RED: chat-sse-mount.ts does not exist yet — module-not-found is the right-kind red.
import { createChatSseMount } from "./chat-sse-mount.js";
import type { ChatSseMountDeps } from "./chat-sse-mount.js";

import type { ChatStreamEvent } from "@storytree/drive";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The injectable query function type — extracted from the implementation's deps so the test
 * stays in sync with whatever the factory expects without duplicating the definition.
 */
type QueryFn = NonNullable<ChatSseMountDeps["queryFn"]>;

/** The spawn deps type — derived from the mount's own deps so the double stays in sync. */
type SpawnDeps = NonNullable<ChatSseMountDeps["spawn"]>;

/** The landing deps type — derived from the mount's own deps so the double stays in sync. */
type LandingDeps = NonNullable<ChatSseMountDeps["landing"]>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * A scripted SDK result that startChatStream recognises as a terminal `done` event.
 * Mirrors the shape used in chat-stream.test.ts (packages/drive) to prove the mount
 * drives the same real composition, not a fork.
 */
const OK_SDK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 3,
  total_cost_usd: 0.02,
  result: "I propose: mount the chat surface as the next Phase-2 capability.",
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A scripted queryFn that immediately yields the given SDK result messages. */
function queryYielding(messages: unknown[]): QueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

/** A minimal spawn-deps double — enough to mount the two claim-gated spawn tools. Its gate/runners
 *  never fire (the scripted session only orients); the point is the mount FORWARDS it to the
 *  session so the spawn tools are advertised (mirrors what backend-entry composes via buildSpawnDeps). */
function spawnDepsDouble(): SpawnDeps {
  return {
    store: {
      claim: async (req: { unitId: string; sessionId: string; branch: string; intent?: string }) => ({
        acquired: true as const,
        claim: {
          unitId: req.unitId,
          sessionId: req.sessionId,
          branch: req.branch,
          intent: req.intent ?? "orchestrate",
          claimedAt: "2026-07-03T00:00:00.000Z",
          heartbeatAt: "2026-07-03T00:00:00.000Z",
        },
        reclaimed: false,
      }),
      bumpHeartbeat: async () => {},
    },
    sessionId: "sess-desktop",
    branch: "claude/sess-desktop",
    spawnStoryAuthor: async () => "story-author spawn summary",
    spawnBuilder: async () => "builder dispatched",
    spawnGlueWorker: async () => "glue worker edited 1 file",
  } as SpawnDeps;
}

/** A minimal landing-deps double — enough to mount the two fail-closed landing tools. Its
 *  runGate/openLandingPr never fire (the scripted session only orients); the point is the mount
 *  FORWARDS it to the session so the landing tools are advertised (mirrors what backend-entry
 *  composes via buildLandingDeps). */
function landingDepsDouble(): LandingDeps {
  return {
    runGate: async () => ({ passed: true, summary: "gate green" }),
    openLandingPr: async () => ({ ok: true, summary: "landing PR opened", prUrl: "https://github.com/x/y/pull/1" }),
    pollPrChecks: async () => ({ status: "merged", summary: "PR merged" }),
  } as LandingDeps;
}

/** An SDK partial-assistant streaming message carrying one text-delta fragment — the live
 *  `query()` shape, so the scripted double drives the same delta path the real session does. */
function textDeltaMessage(text: string): unknown {
  return {
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    parent_tool_use_id: null,
    uuid: "u",
    session_id: "s",
  };
}

/**
 * A scripted queryFn that throws on the first iteration — drives the `error` SSE frame path.
 * The error propagates through runHeadlessOrchestrator's inner try-catch, which returns
 * `{ ok: false, error }` to orchestrate, which emits it as a `ChatStreamErrorEvent`.
 */
function queryThrowing(message: string): QueryFn {
  return () =>
    (async function* () {
      throw new Error(message);
      // unreachable — yield makes TypeScript infer an async generator return type
      yield undefined as never;
    })();
}

/**
 * A manually-resolvable promise. Lets a scripted session park mid-flight so the first
 * session's `compositionInFlight` flag stays set while a second is attempted.
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => { /* overwritten by Promise constructor */ };
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Spin up a node:http server wrapping the chat-sse-mount handler, run `fn` with the base
 * URL, then CLOSE the server before returning — no OS handle leaks. When the handler falls
 * through (returns false), the wrapper sends 404 so the fall-through test can assert on it.
 */
async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void handler(req, res, url.pathname)
      .then((handled) => {
        if (!handled && !res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "not handled" }));
        }
      })
      .catch((err: unknown) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}

/**
 * Parse SSE frames from a streamed response body: split on blank-line separators, extract
 * `data: <json>` lines, and return the parsed ChatStreamEvents.
 */
function parseSseFrames(body: string): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [];
  for (const frame of body.split(/\r?\n\r?\n/)) {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice("data: ".length).trim();
      if (!json) continue;
      try {
        events.push(JSON.parse(json) as ChatStreamEvent);
      } catch {
        // ignore malformed lines (e.g. event: type lines)
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// CORE OUTCOME: POST /api/chat with a valid intent starts a real startChatStream session
// (scripted queryFn) and streams its terminal `done` event as one SSE frame.
// Content-Type must be text/event-stream; the data: line carries the serialised
// ChatStreamDoneEvent including the proposal from the scripted SDK result.
//
// DELETION TEST: removing createChatSseMount or the call to startChatStream inside the mount
// breaks the import or breaks the SSE output. Returning a JSON body instead of SSE frames
// breaks the Content-Type assertion. Not calling res.end() after the terminal event hangs
// the fetch (the response never completes).
test(
  "csm-streams-events-as-sse: POST /api/chat with a valid intent streams a done SSE frame (200, text/event-stream)",
  async () => {
    const handler = createChatSseMount({ queryFn: queryYielding([OK_SDK_RESULT]) });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "Orient and propose the next capability." }),
      });

      assert.equal(res.status, 200, "POST /api/chat must return 200 for a valid intent");
      assert.ok(
        (res.headers.get("content-type") ?? "").includes("text/event-stream"),
        "Content-Type must include text/event-stream for an SSE response",
      );

      const body = await res.text();
      const events = parseSseFrames(body);

      assert.ok(events.length > 0, "must yield at least one SSE event frame in the response body");

      const last = events[events.length - 1];
      assert.ok(last !== undefined, "must yield at least one SSE event");
      assert.equal(
        last.type,
        "done",
        `terminal SSE event must be 'done'; got '${last.type}'`,
      );

      if (last.type === "done") {
        assert.equal(
          last.proposal,
          OK_SDK_RESULT.result,
          "done event must carry the proposal from the scripted session — " +
            "proof the mount drives the real startChatStream composition, not a fork",
        );
      }
    });
  },
);

// STREAMING: assistant text deltas stream as `delta` SSE frames AS THEY ARRIVE, in order, before
// the terminal `done` frame (the responsiveness fix — the desktop SSE mount forwards each frame the
// streaming core yields). A thin client appends each delta to a live render instead of spinning
// until the whole session finishes.
//
// DELETION TEST: if the mount buffered the whole stream and emitted only the terminal frame, the
// delta-frame assertions would fail. If it dropped non-terminal events, deltaTexts would be empty.
test(
  "csm-streams-delta-frames: assistant text deltas stream as `delta` SSE frames, in order, before the terminal done",
  async () => {
    const handler = createChatSseMount({
      queryFn: queryYielding([
        textDeltaMessage("Pro"),
        textDeltaMessage("posing"),
        textDeltaMessage("…"),
        OK_SDK_RESULT,
      ]),
    });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "stream me some tokens" }),
      });

      assert.equal(res.status, 200, "a streaming session is still a 200 text/event-stream response");
      const body = await res.text();
      const events = parseSseFrames(body);

      const deltaTexts = events
        .filter((e): e is Extract<ChatStreamEvent, { type: "delta" }> => e.type === "delta")
        .map((e) => e.text);
      assert.deepEqual(
        deltaTexts,
        ["Pro", "posing", "…"],
        "each assistant text fragment must be forwarded as a `delta` SSE frame in order",
      );

      const doneIdx = events.findIndex((e) => e.type === "done");
      const lastDeltaIdx = events.map((e) => e.type).lastIndexOf("delta");
      assert.ok(doneIdx !== -1, "the stream must end with a terminal `done` frame");
      assert.ok(
        lastDeltaIdx !== -1 && lastDeltaIdx < doneIdx,
        "every `delta` frame must precede the terminal `done` frame",
      );

      const last = events[events.length - 1];
      assert.equal(last?.type, "done", "terminal SSE event must be `done`");
      if (last?.type === "done") {
        assert.equal(
          last.proposal,
          OK_SDK_RESULT.result,
          "the terminal done frame carries the authoritative proposal (the result), not the stream",
        );
      }
    });
  },
);

// FAIL-CLOSED: a POST body with no `intent` field is rejected with 400 before any session
// starts. The guard prevents empty prompts from reaching the real orchestrate composition
// and spending any SDK budget.
test(
  "csm-rejects-a-blank-intent: POST /api/chat with a missing intent field returns 400 (fail-closed)",
  async () => {
    const handler = createChatSseMount({ queryFn: queryYielding([OK_SDK_RESULT]) });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // no `intent` field
      });

      assert.equal(
        res.status,
        400,
        "a POST with no intent field must be rejected 400 before starting a session",
      );
    });
  },
);

// FAIL-CLOSED: an empty or whitespace-only intent string is also rejected with 400.
// Blank intents must not reach the real orchestrate composition.
test(
  "csm-rejects-a-blank-intent: POST /api/chat with a blank intent string returns 400",
  async () => {
    const handler = createChatSseMount({ queryFn: queryYielding([OK_SDK_RESULT]) });

    await withServer(handler, async (base) => {
      // empty string
      const res1 = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "" }),
      });
      assert.equal(res1.status, 400, "empty-string intent must be rejected with 400");

      // whitespace-only
      const res2 = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "   " }),
      });
      assert.equal(res2.status, 400, "whitespace-only intent must be rejected with 400");
    });
  },
);

// ERROR PATH: when the scripted SDK throws on iteration, startChatStream catches it and
// emits a terminal `error` event; the mount streams it as an SSE frame (never a 500).
//
// DELETION TEST: if the mount propagated the SDK error as an HTTP 500 or an uncaught throw,
// the 200 status and error-type assertions would both fail. This pins that the error path is
// observable through SSE without crashing the response.
test(
  "csm-fails-closed-on-dead-session: a session where the SDK throws streams a terminal error SSE frame (200, not 500)",
  async () => {
    const handler = createChatSseMount({ queryFn: queryThrowing("scripted SDK failure") });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "test the error path" }),
      });

      assert.equal(
        res.status,
        200,
        "error events are streamed as 200 SSE — the mount must never return 500 for a session error",
      );
      assert.ok(
        (res.headers.get("content-type") ?? "").includes("text/event-stream"),
        "error path must still send text/event-stream (not fall back to JSON)",
      );

      const body = await res.text();
      const events = parseSseFrames(body);

      assert.ok(events.length > 0, "error path must yield at least one SSE event frame");

      const last = events[events.length - 1];
      assert.ok(last !== undefined, "must yield a terminal event");
      assert.equal(
        last.type,
        "error",
        `terminal SSE event must be 'error' when the SDK throws; got '${last.type}'`,
      );
      if (last.type === "error") {
        assert.ok(
          typeof last.error === "string" && last.error.length > 0,
          "error event must carry a non-empty error message describing what went wrong",
        );
      }
    });
  },
);

// SINGLE-SESSION GUARD: a second concurrent POST /api/chat is refused with a distinct
// `refused` SSE frame while the first session is in-flight (the compositionInFlight flag from
// orchestrate.ts is set). The first session completes cleanly with its `done` frame intact.
// The second session never reaches the SDK queryFn.
//
// DELETION TEST: removing the single-session guard allows the second session to proceed
// concurrently, producing a `done` frame instead of the required `refused` frame. The
// refused-type assertion would fail, proving the guard is load-bearing.
test(
  "chat-sse-mount: a second concurrent POST /api/chat is refused with a refused SSE frame (single-session guard)",
  async () => {
    const entered = deferred();
    const unblock = deferred();

    // Session 1's queryFn blocks inside the generator: it signals `entered` (the flag is set by
    // this point) then parks on `unblock`. This holds the first session "in flight" so a second
    // concurrent request sees compositionInFlight === true and is refused immediately.
    const blockingQueryFn: QueryFn = () =>
      (async function* () {
        entered.resolve(); // compositionInFlight is true here — the guard is live
        await unblock.promise;
        yield OK_SDK_RESULT;
      })();

    const handler = createChatSseMount({ queryFn: blockingQueryFn });

    await withServer(handler, async (base) => {
      // Start session 1 without awaiting — collect the full response later (after unblocking).
      const firstFetch = fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "first session: in-flight" }),
      }).then(async (r) => ({ status: r.status, body: await r.text() }));

      // Wait until session 1's queryFn is entered (compositionInFlight is guaranteed true).
      await entered.promise;

      // Start session 2 — must be refused immediately without calling the blocking queryFn.
      const secondRes = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "second session: should be refused" }),
      });
      const secondBody = await secondRes.text();

      // Unblock session 1 and collect its response.
      unblock.resolve();
      const { status: firstStatus, body: firstBody } = await firstFetch;

      // ---- Assert session 2 was refused ----
      assert.equal(
        secondRes.status,
        200,
        "refused session streams 200 SSE — a refusal is an application-level event, not an HTTP error",
      );
      const secondEvents = parseSseFrames(secondBody);
      assert.ok(secondEvents.length > 0, "refused session must yield at least one SSE event");
      const secondLast = secondEvents[secondEvents.length - 1];
      assert.ok(secondLast !== undefined, "refused session must yield a terminal event");
      assert.equal(
        secondLast.type,
        "refused",
        `second concurrent session must stream a 'refused' event (got '${secondLast.type}'); ` +
          "the single-session guard (compositionInFlight in orchestrate.ts) must be active",
      );
      if (secondLast.type === "refused") {
        assert.ok(
          typeof secondLast.reason === "string" && secondLast.reason.length > 0,
          "refused event must carry a non-empty reason string for the thin client to display",
        );
      }

      // ---- Assert session 1 completed cleanly ----
      assert.equal(firstStatus, 200, "the in-flight session must complete with 200");
      const firstEvents = parseSseFrames(firstBody);
      const firstLast = firstEvents[firstEvents.length - 1];
      assert.ok(firstLast !== undefined, "in-flight session must yield a terminal event");
      assert.equal(
        firstLast.type,
        "done",
        `in-flight session must complete with 'done' after unblocking; got '${firstLast.type}'`,
      );
      if (firstLast.type === "done") {
        assert.equal(
          firstLast.proposal,
          OK_SDK_RESULT.result,
          "the in-flight session's proposal must be intact — the refused second session did not disturb it",
        );
      }
    });
  },
);

// FALL-THROUGH: GET /api/health is not owned by the chat dispatcher; it must return false so
// the Electron main's chained dispatch can handle it (local-backend-boot owns /api/health).
// DELETION TEST: making createChatSseMount a catch-all (always true) produces a non-404 here
// — the chat dispatcher must NOT shadow other /api/* routes.
test(
  "csm-dispatcher-falls-through-not-404s: GET /api/health falls through — the dispatcher returns false, not a catch-all",
  async () => {
    const handler = createChatSseMount({ queryFn: queryYielding([OK_SDK_RESULT]) });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/health`);
      assert.equal(
        res.status,
        404,
        "GET /api/health must fall through (handler returns false, wrapper sends 404); " +
          "createChatSseMount must not be a catch-all",
      );
    });
  },
);

// FALL-THROUGH: a POST to an unrelated /api/* endpoint also falls through — the dispatcher
// owns ONLY POST /api/chat and nothing else.
test(
  "csm-dispatcher-falls-through-not-404s: POST /api/build falls through — only POST /api/chat is owned by this dispatcher",
  async () => {
    const handler = createChatSseMount({ queryFn: queryYielding([OK_SDK_RESULT]) });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: "some-unit" }),
      });
      assert.equal(
        res.status,
        404,
        "POST /api/build must fall through (handler returns false); the chat dispatcher must not shadow build routes",
      );
    });
  },
);

// ORIENTATION SEAM (the ADR-0108 orientation gap): an injected orientation runner must be
// forwarded through startChatStream → orchestrate → runHeadlessOrchestrator, which wires the
// read-only orientation tool surface (mcp__orientation__tree/library/noticeboard) into the
// session. Without this seam the chat agent cannot read the live tree/library/notice board
// (the §7 scale-down: no runner → NO orientation tools advertised).
//
// DELETION TEST: dropping the runner forwarding in the mount (or in the bridged startChatStream
// args) removes the orientation MCP server from the captured session options — the allowedTools
// and mcpServers assertions fail.
test(
  "csm-forwards-orientation-runner: an injected runner wires the orientation tool surface into the session",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    // A live-shaped orientation runner double (what backend-entry composes from the live stores
    // via @storytree/drive's createOrientationRunner) — the mount must hand it to the session.
    const runner = async (argv: readonly string[]): Promise<{ ok: boolean; body: string }> => ({
      ok: true,
      body: `live-shaped ${argv.join(" ")} view`,
    });

    const handler = createChatSseMount({ queryFn: capturingQuery, runner });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "orient on the live surfaces" }),
      });
      assert.equal(res.status, 200);
      await res.text(); // drain the stream so the session settles
    });

    assert.ok(capturedOptions !== undefined, "the scripted queryFn must have been called");
    const opts = capturedOptions as {
      allowedTools?: string[];
      mcpServers?: Record<string, unknown>;
    };
    const allowed = Array.isArray(opts.allowedTools) ? opts.allowedTools : [];
    for (const name of ["tree", "library", "noticeboard"]) {
      assert.ok(
        allowed.includes(`mcp__orientation__${name}`),
        `the injected runner must wire the '${name}' orientation tool into allowedTools; ` +
          `got: ${JSON.stringify(allowed)}`,
      );
    }
    assert.ok(
      "orientation" in (opts.mcpServers ?? {}),
      "the orientation MCP server must be mounted when a runner is injected",
    );
  },
);

// ORIENTATION SEAM (baseline): with NO runner injected, no orientation tools are advertised
// (the §7 scale-down) — the mount must not invent a dead surface.
test(
  "csm-forwards-orientation-runner: without a runner, no orientation tools are advertised",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const handler = createChatSseMount({ queryFn: capturingQuery });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "plain conversational turn" }),
      });
      assert.equal(res.status, 200);
      await res.text();
    });

    const opts = capturedOptions as { allowedTools?: string[] };
    const allowed = opts.allowedTools ?? [];
    assert.ok(
      !allowed.some((n) => n.startsWith("mcp__orientation__")),
      `with no runner, no orientation tools may be advertised; got: ${JSON.stringify(allowed)}`,
    );
  },
);

// SPAWN SEAM (ADR-0137 Phase 3): injected spawn deps must be forwarded through the mount →
// startChatStream → orchestrate → runHeadlessOrchestrator, which mounts the two claim-gated spawn
// tools (mcp__spawn__spawn_story_author / spawn_builder) into the session. This is the desktop half
// of the sidecar wiring — the sidecar (backend-entry.ts) composes the real deps via buildSpawnDeps
// and hands them to createChatSseMount; the mount only forwards.
//
// DELETION TEST: dropping the spawn forwarding in the mount (or in the bridged startChatStream args)
// removes the spawn MCP server from the captured session options — this allowedTools assertion fails.
test(
  "csm-forwards-spawn-deps: injected spawn deps wire the claim-gated spawn tools into the session",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const handler = createChatSseMount({ queryFn: capturingQuery, spawn: spawnDepsDouble() });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "bring a story in" }),
      });
      assert.equal(res.status, 200);
      await res.text(); // drain the stream so the session settles
    });

    assert.ok(capturedOptions !== undefined, "the scripted queryFn must have been called");
    const opts = capturedOptions as {
      allowedTools?: string[];
      mcpServers?: Record<string, unknown>;
    };
    const allowed = Array.isArray(opts.allowedTools) ? opts.allowedTools : [];
    for (const name of ["spawn_story_author", "spawn_builder"]) {
      assert.ok(
        allowed.includes(`mcp__spawn__${name}`),
        `the injected spawn deps must wire '${name}' into allowedTools; got: ${JSON.stringify(allowed)}`,
      );
    }
    assert.ok(
      "spawn" in (opts.mcpServers ?? {}),
      "the spawn MCP server must be mounted when spawn deps are injected",
    );
  },
);

// SPAWN SEAM (baseline): with NO spawn deps injected, no spawn tools are advertised (the §7
// scale-down) — the propose-only surface is byte-identical to today; the mount invents no dead surface.
test(
  "csm-forwards-spawn-deps: without spawn deps, no spawn tools are advertised (propose-only, unchanged)",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const handler = createChatSseMount({ queryFn: capturingQuery });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "plain conversational turn" }),
      });
      assert.equal(res.status, 200);
      await res.text();
    });

    const opts = capturedOptions as { allowedTools?: string[] };
    const allowed = opts.allowedTools ?? [];
    assert.ok(
      !allowed.some((n) => n.startsWith("mcp__spawn__")),
      `with no spawn deps, no spawn tools may be advertised; got: ${JSON.stringify(allowed)}`,
    );
  },
);

// LANDING SEAM (ADR-0152, the desktop-orchestrator full-autonomy arc): injected landing deps must be
// forwarded through the mount → startChatStream → orchestrate → runHeadlessOrchestrator, which mounts
// the two fail-closed landing tools (mcp__landing__run_gate / open_landing_pr) into the session. This
// is the desktop half of the sidecar wiring — the sidecar (backend-entry.ts) composes the real deps
// via buildLandingDeps and hands them to createChatSseMount; the mount only forwards.
//
// DELETION TEST: dropping the landing forwarding in the mount (or in the bridged startChatStream args)
// removes the landing MCP server from the captured session options — this allowedTools assertion fails.
test(
  "csm-forwards-landing-deps: injected landing deps wire the merge-ceremony tools into the session",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const handler = createChatSseMount({ queryFn: capturingQuery, landing: landingDepsDouble() });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "land the green unit" }),
      });
      assert.equal(res.status, 200);
      await res.text(); // drain the stream so the session settles
    });

    assert.ok(capturedOptions !== undefined, "the scripted queryFn must have been called");
    const opts = capturedOptions as {
      allowedTools?: string[];
      mcpServers?: Record<string, unknown>;
    };
    const allowed = Array.isArray(opts.allowedTools) ? opts.allowedTools : [];
    for (const name of ["run_gate", "open_landing_pr"]) {
      assert.ok(
        allowed.includes(`mcp__landing__${name}`),
        `the injected landing deps must wire '${name}' into allowedTools; got: ${JSON.stringify(allowed)}`,
      );
    }
    assert.ok(
      "landing" in (opts.mcpServers ?? {}),
      "the landing MCP server must be mounted when landing deps are injected",
    );
  },
);

// LANDING SEAM (baseline): with NO landing deps injected, no landing tools are advertised (the §7
// scale-down) — the read/propose/spawn surface is byte-identical to before ADR-0152; the mount
// invents no dead merge-ceremony surface.
test(
  "csm-forwards-landing-deps: without landing deps, no landing tools are advertised (unchanged)",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const handler = createChatSseMount({ queryFn: capturingQuery });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "plain conversational turn" }),
      });
      assert.equal(res.status, 200);
      await res.text();
    });

    const opts = capturedOptions as { allowedTools?: string[] };
    const allowed = opts.allowedTools ?? [];
    assert.ok(
      !allowed.some((n) => n.startsWith("mcp__landing__")),
      `with no landing deps, no landing tools may be advertised; got: ${JSON.stringify(allowed)}`,
    );
  },
);

// MAXTURNS SEAM (ADR-0151): an injected maxTurns must be forwarded through the mount →
// startChatStream → orchestrate → runHeadlessOrchestrator, which hands it to the SDK options as the
// orchestrator-session turn cap. The sidecar (backend-entry.ts) resolves an operator RE-impose from
// STORYTREE_ORCHESTRATOR_MAX_TURNS and passes it here; the mount only forwards.
//
// DELETION TEST: dropping the maxTurns forwarding in the mount (or in the bridged startChatStream args)
// removes maxTurns from the captured session options — this assertion fails.
test(
  "csm-forwards-maxturns: an injected maxTurns is forwarded into the session options (the RE-impose override)",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const handler = createChatSseMount({ queryFn: capturingQuery, maxTurns: 25 });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "orient with a bounded turn cap" }),
      });
      assert.equal(res.status, 200);
      await res.text(); // drain the stream so the session settles
    });

    assert.ok(capturedOptions !== undefined, "the scripted queryFn must have been called");
    const opts = capturedOptions as { maxTurns?: number };
    assert.equal(opts.maxTurns, 25, "an injected maxTurns must reach the session options as the turn cap");
  },
);

// MAXTURNS SEAM (baseline): with NO maxTurns injected, the orchestrator session is UNBOUNDED (ADR-0151)
// — the mount forwards no maxTurns, so the SDK options carry no `maxTurns` key at all.
//
// DELETION TEST: if the mount defaulted maxTurns to a number, the `"maxTurns" in opts` assertion fails.
test(
  "csm-forwards-maxturns: without a maxTurns, the session runs unbounded (no maxTurns key in the options)",
  async () => {
    let capturedOptions: unknown;
    const capturingQuery: QueryFn = ({ options }) => {
      capturedOptions = options;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const handler = createChatSseMount({ queryFn: capturingQuery });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "orient unbounded" }),
      });
      assert.equal(res.status, 200);
      await res.text();
    });

    assert.ok(capturedOptions !== undefined, "the scripted queryFn must have been called");
    assert.ok(
      !("maxTurns" in (capturedOptions as object)),
      "with no injected maxTurns, the session options must carry no maxTurns key — unbounded (ADR-0151)",
    );
  },
);

// STATIC BOUNDARY CHECK: the chat-sse-mount source must import startChatStream from
// @storytree/drive (by package name), never from apps/studio/server (the forbidden
// surface→surface coupling), and must carry no pg or Cloud SQL connector imports
// (the write broker + SSE route is transport-only, no DB path).
//
// This mirrors the equivalent check in local-backend.test.ts and pins the boundary
// even before a runtime integration test can enforce it.
test(
  "chat-sse-mount: imports no studio server and no pg/DB connector (boundary check)",
  () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(here, "chat-sse-mount.ts"), "utf8");

    // Check only import statement lines — prose comments legitimately name what we do NOT do.
    const importLines = src
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b/.test(l) || /import\(/.test(l))
      .join("\n");

    assert.ok(
      !/studio\/server/.test(importLines),
      "must not import apps/studio/server (forbidden surface→surface coupling)",
    );
    assert.ok(
      !/\bfrom\s+["']pg["']/.test(importLines),
      "must not import pg directly (no DB connector in the chat route)",
    );
    assert.ok(
      !/cloud-sql-connector/.test(importLines),
      "must not import the Cloud SQL connector (transport-only module)",
    );
    assert.ok(
      !/@storytree\/store/.test(importLines),
      "must not import the dissolved @storytree/store",
    );
    assert.ok(
      !/@storytree\/library\/store/.test(importLines),
      "must not import the library node-only pg store path (no DB path in the chat route)",
    );
  },
);
