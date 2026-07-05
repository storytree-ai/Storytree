/**
 * Integration tests for the chat-stream adapter (packages/drive/src/chat-stream.ts).
 *
 * Pins:
 *   1. A successful orchestrate session → the stream terminates with a `done` event carrying
 *      the proposal text (the same text `orchestrate()` surfaces).
 *   2. Orchestrate fails (session-orchestrator absent from store) → stream terminates with a
 *      typed `error` event; the SDK is NOT called (fail-closed before any spend).
 *   3. The terminal `done` event surfaces `costUsd` and `turns` from the orchestrate result.
 *   4. The stream NEVER throws — errors are emitted as a terminal `error` event.
 *   5. The adapter drives the REAL `orchestrate` composition: the rendered system prompt names
 *      `session-orchestrator` — proof it reuses the Phase-1 composition, not a fork
 *      (`cs-drives-the-real-orchestrate-not-a-fork`, ADR-0108 d.2).
 *   6. The single-session guard holds: a second concurrent `startChatStream` is refused with a
 *      distinct terminal `refused` event (carrying the reason) while the first session is in-flight
 *      and left untouched (`cs-single-session-refused`, ADR-0108 d.6). A `refused` event is NOT an
 *      `error`: the session never started, so a thin client can render a "busy / try again" signal
 *      distinct from a genuine failure.
 *
 * IT REUSES THE PHASE-1 COMPOSITION (ADR-0108 d.2): the adapter calls `orchestrate()` — the
 * SAME composition the programmatic entry and terminal command use. It does not re-render the
 * prompt, re-wire the orientation tools, or re-implement the session.
 *
 * All tests are OFFLINE: the `queryFn` seam is injected; no live SDK spend (ADR-0010 §5).
 * The live chat run (real panel ↔ real SDK) is the operator-attested Story UAT leg.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn, LandingSurfaceDeps } from "@storytree/agent";

// RED: chat-stream.ts does not exist yet — module-not-found is the right-kind red.
import { startChatStream } from "./chat-stream.js";
import type { ChatStreamEvent } from "./chat-stream.js";
import type { SpawnSurfaceDeps } from "./spawn-deps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drain an async iterable of chat events into an array. */
async function drain(gen: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

/** Build an SDK partial-assistant streaming message carrying one text-delta fragment — the shape
 *  live `query()` emits when `includePartialMessages` is on, so the scripted double matches reality. */
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
 * A manually-resolvable promise — lets a scripted session park mid-flight so the first orchestrate
 * session can be held "in flight" while a second is attempted (the single-session guard test below).
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const OK_SDK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 3,
  total_cost_usd: 0.02,
  result: "I propose: build the chat-stream adapter as the next Phase-2 capability.",
};

/** A minimal spawn-deps double — enough to mount the two claim-gated spawn tools. The gate/runners
 *  never fire in these tests (the scripted session only orients); the point is that the deps are
 *  FORWARDED to orchestrate so the tools are advertised. */
function spawnDepsDouble(): SpawnSurfaceDeps {
  return {
    store: {
      claim: async (req) => ({
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
    sessionId: "sess-chat",
    branch: "claude/sess-chat",
    spawnStoryAuthor: async () => "story-author spawn summary",
    spawnBuilder: async () => "builder dispatched",
    spawnGlueWorker: async () => "glue worker edited 1 file",
  };
}

/** A minimal landing-deps double — enough to mount the two landing tools. The handlers never fire
 *  in these tests (the scripted session only orients); the point is that the deps are FORWARDED to
 *  orchestrate so `mcp__landing__*` is advertised (ADR-0152). */
function landingDepsDouble(): LandingSurfaceDeps {
  return {
    runGate: async () => ({ passed: true, summary: "gate PASSED" }),
    openLandingPr: async () => ({ ok: true, summary: "landing PR opened" }),
  };
}

/** Capture the SDK Options the session was launched with (allowedTools is the observable). */
function capturingQueryFn(): { fn: SdkQueryFn; lastOptions: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  const fn: SdkQueryFn = ({ options }) => {
    captured = options as Record<string, unknown>;
    return (async function* () {
      yield OK_SDK_RESULT;
    })();
  };
  return { fn, lastOptions: () => captured };
}

// ---------------------------------------------------------------------------
// 1. Successful session → terminal `done` event with proposal
// ---------------------------------------------------------------------------

test(
  "startChatStream: successful session terminates with a `done` event carrying the proposal",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const events = await drain(
      startChatStream({
        intent: "Orient and propose the next unit.",
        store,
        queryFn: queryYielding([OK_SDK_RESULT]),
      }),
    );

    assert.ok(events.length > 0, "stream must yield at least one event");

    const last = events[events.length - 1];
    assert.ok(last !== undefined, "stream must yield at least one event");

    assert.equal(
      last.type,
      "done",
      `last event must be 'done' (got '${last.type}'); a non-terminal or error event must not be the final one`,
    );

    // Narrow to the done branch and assert the proposal text
    assert.equal(
      last.type === "done" ? last.proposal : undefined,
      OK_SDK_RESULT.result,
      "done event must carry the proposal from the orchestrate composition's result message",
    );
  },
);

// ---------------------------------------------------------------------------
// 2. Orchestrate fails (agent absent) → terminal `error` event, no SDK call
// ---------------------------------------------------------------------------

test(
  "startChatStream: when session-orchestrator is absent, terminates with a typed `error` event without calling the SDK",
  async () => {
    const store = new InMemoryStore(); // empty — no agents seeded

    let sdkCalled = false;
    const sentinelQuery: SdkQueryFn = () => {
      sdkCalled = true;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    // must NOT throw — error is emitted as a typed terminal event
    const events = await drain(
      startChatStream({
        intent: "Orient and propose.",
        store,
        queryFn: sentinelQuery,
      }),
    );

    assert.ok(
      !sdkCalled,
      "the SDK must NOT be called when the agent render fails (fail-closed: no spend before the guard)",
    );

    assert.ok(events.length > 0, "stream must yield at least one event");

    const last = events[events.length - 1];
    assert.ok(last !== undefined, "stream must yield at least one event");

    assert.equal(
      last.type,
      "error",
      `last event must be 'error' when session-orchestrator is absent; got '${last.type}'`,
    );
    assert.ok(
      last.type === "error" && typeof last.error === "string" && last.error.length > 0,
      "the error event must carry a non-empty error string describing what went wrong",
    );
  },
);

// ---------------------------------------------------------------------------
// 3. Done event surfaces costUsd and turns from the orchestrate result
// ---------------------------------------------------------------------------

test(
  "startChatStream: done event surfaces costUsd and turns from the orchestrate result",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const events = await drain(
      startChatStream({
        intent: "Orient and propose.",
        store,
        queryFn: queryYielding([OK_SDK_RESULT]),
      }),
    );

    const done = events.find((e) => e.type === "done");
    assert.ok(done !== undefined, "stream must contain a terminal `done` event");

    assert.equal(
      done.type === "done" ? done.costUsd : undefined,
      OK_SDK_RESULT.total_cost_usd,
      "done event must surface costUsd from the orchestrate result (total_cost_usd)",
    );
    assert.equal(
      done.type === "done" ? done.turns : undefined,
      OK_SDK_RESULT.num_turns,
      "done event must surface turns from the orchestrate result (num_turns)",
    );
  },
);

// ---------------------------------------------------------------------------
// 3b. Streaming — assistant text deltas are forwarded as non-terminal `delta`
//     events, in order, BEFORE the terminal `done` (the responsiveness fix,
//     ADR-0108 Phase 2 streaming).
// ---------------------------------------------------------------------------

test(
  "startChatStream: streams assistant text deltas as `delta` events, in order, before the terminal `done`",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    // A scripted session that streams three text fragments then a terminal result. The done event's
    // proposal is DISTINCT from the streamed fragments so we can prove the terminal answer is the
    // authoritative result, not just the concatenated stream.
    const events = await drain(
      startChatStream({
        intent: "Orient and propose.",
        store,
        queryFn: queryYielding([
          textDeltaMessage("Orient"),
          textDeltaMessage("ing on "),
          textDeltaMessage("the tree…"),
          OK_SDK_RESULT,
        ]),
      }),
    );

    // The delta events, in arrival order.
    const deltaTexts = events
      .filter((e): e is Extract<ChatStreamEvent, { type: "delta" }> => e.type === "delta")
      .map((e) => e.text);
    assert.deepEqual(
      deltaTexts,
      ["Orient", "ing on ", "the tree…"],
      "each streamed assistant text fragment must surface as a `delta` event in order",
    );

    // Every delta precedes the terminal done — a thin client renders tokens live, then settles.
    const doneIdx = events.findIndex((e) => e.type === "done");
    const lastDeltaIdx = events.map((e) => e.type).lastIndexOf("delta");
    assert.ok(doneIdx !== -1, "the stream must end with a terminal `done` event");
    assert.ok(
      lastDeltaIdx !== -1 && lastDeltaIdx < doneIdx,
      "all `delta` events must precede the terminal `done` (no terminal event races ahead of a delta)",
    );

    const last = events[events.length - 1];
    assert.equal(last?.type, "done", "the terminal event must be `done`");
    assert.equal(
      last?.type === "done" ? last.proposal : undefined,
      OK_SDK_RESULT.result,
      "the terminal `done` carries the AUTHORITATIVE proposal (the result message), not the stream",
    );
  },
);

// ---------------------------------------------------------------------------
// 4. Drives the REAL orchestrate composition (not a fork): the rendered system
//    prompt names `session-orchestrator`
//    (contract `cs-drives-the-real-orchestrate-not-a-fork`, ADR-0108 d.2)
// ---------------------------------------------------------------------------

test(
  "startChatStream: drives the real orchestrate composition — the system prompt names session-orchestrator (not a fork)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    // Capture the system prompt the adapter feeds the SDK. orchestrate renders the REAL
    // session-orchestrator agent from the corpus and passes its prompt straight through; a fork
    // (a bespoke hard-coded prompt) would not name the rendered Library agent. Mirrors the capture
    // pattern in orchestrate.test.ts test 1.
    let capturedSystemPrompt: string | undefined;
    const capturingQuery: SdkQueryFn = ({ options }) => {
      capturedSystemPrompt =
        typeof options.systemPrompt === "string" ? options.systemPrompt : undefined;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };

    const events = await drain(
      startChatStream({
        intent: "Orient and propose the next unit.",
        store,
        queryFn: capturingQuery,
      }),
    );

    assert.ok(events.length > 0, "stream must yield at least one event");
    const last = events[events.length - 1];
    assert.ok(last !== undefined, "stream must yield at least one event");
    assert.equal(
      last.type,
      "done",
      `the capturing session must drive through to a terminal 'done' event (got '${last.type}')`,
    );

    assert.ok(
      capturedSystemPrompt !== undefined,
      "the adapter must have driven orchestrate, which calls the SDK with a string system prompt",
    );
    assert.match(
      capturedSystemPrompt ?? "",
      /session-orchestrator/,
      "the system prompt must name 'session-orchestrator' — proof the adapter drives the REAL " +
        "orchestrate composition (the rendered Library agent), not a fork (ADR-0108 d.2)",
    );
  },
);

// ---------------------------------------------------------------------------
// 4b. Spawn pass-through (ADR-0137 Phase 3): injected spawn deps are forwarded to
//     orchestrate, mounting the two claim-gated spawn tools; absent → propose-only,
//     byte-identical to today (the additive-threading wall, mirroring `runner`).
// ---------------------------------------------------------------------------

test(
  "startChatStream: forwards spawn deps to orchestrate — the spawn tools mount on the session (ADR-0137 Phase 3)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);
    const q = capturingQueryFn();

    const events = await drain(
      startChatStream({
        intent: "Orient and propose the next unit.",
        store,
        queryFn: q.fn,
        spawn: spawnDepsDouble(),
      }),
    );

    const last = events[events.length - 1];
    assert.equal(last?.type, "done", `capturing session must reach a terminal 'done' (got '${last?.type}')`);

    const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
    assert.ok(
      tools.includes("mcp__spawn__spawn_story_author"),
      `mcp__spawn__spawn_story_author must be advertised when spawn deps are forwarded; got ${JSON.stringify(tools)}`,
    );
    assert.ok(
      tools.includes("mcp__spawn__spawn_builder"),
      `mcp__spawn__spawn_builder must be advertised when spawn deps are forwarded; got ${JSON.stringify(tools)}`,
    );
    // The orchestrator DRIVES rather than proposes (ADR-0155) — there is no propose_unit surface.
    assert.equal(
      tools.includes("mcp__proposal__propose_unit"),
      false,
      "mcp__proposal__propose_unit must NOT be mounted — the orchestrator drives via spawn tools, it does not propose a unit for a human to accept (ADR-0155)",
    );
  },
);

test(
  "startChatStream: without spawn deps the session stays propose-only — no mcp__spawn__* tool advertised (the §7 scale-down)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);
    const q = capturingQueryFn();

    await drain(
      startChatStream({ intent: "Orient and propose.", store, queryFn: q.fn }),
    );

    const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
    assert.equal(
      tools.some((t) => t.startsWith("mcp__spawn__")),
      false,
      `no mcp__spawn__* tool may appear without spawn deps; got ${JSON.stringify(tools)}`,
    );
  },
);

test(
  "startChatStream: forwards landing deps to orchestrate — the merge-ceremony tools mount on the session (ADR-0152)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);
    const q = capturingQueryFn();

    const events = await drain(
      startChatStream({
        intent: "Orient, build to green, and land the unit.",
        store,
        queryFn: q.fn,
        landing: landingDepsDouble(),
      }),
    );

    const last = events[events.length - 1];
    assert.equal(last?.type, "done", `capturing session must reach a terminal 'done' (got '${last?.type}')`);

    const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
    assert.ok(
      tools.includes("mcp__landing__run_gate"),
      `mcp__landing__run_gate must be advertised when landing deps are forwarded; got ${JSON.stringify(tools)}`,
    );
    assert.ok(
      tools.includes("mcp__landing__open_landing_pr"),
      `mcp__landing__open_landing_pr must be advertised when landing deps are forwarded; got ${JSON.stringify(tools)}`,
    );
    // The orchestrator DRIVES rather than proposes (ADR-0155) — there is no propose_unit surface.
    assert.equal(
      tools.includes("mcp__proposal__propose_unit"),
      false,
      "mcp__proposal__propose_unit must NOT be mounted — the orchestrator drives via its landing tools, it does not propose a unit for a human to accept (ADR-0155)",
    );
  },
);

test(
  "startChatStream: without landing deps the session advertises no mcp__landing__* tool (the §7 scale-down)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);
    const q = capturingQueryFn();

    await drain(
      startChatStream({ intent: "Orient and propose.", store, queryFn: q.fn }),
    );

    const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
    assert.equal(
      tools.some((t) => t.startsWith("mcp__landing__")),
      false,
      `no mcp__landing__* tool may appear without landing deps; got ${JSON.stringify(tools)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// 5. Single-session guard: a second concurrent session is refused with a
//    distinct terminal `refused` event (NOT a generic `error`) while the first
//    is in-flight and untouched (contract `cs-single-session-refused`, ADR-0108 d.6)
// ---------------------------------------------------------------------------

test(
  "startChatStream: a second concurrent session is refused (single-session guard) while the first is in-flight and untouched",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    // Session 1's scripted SDK session blocks mid-flight: it signals once its generator body is
    // running (by which point the guard's in-flight flag is already set — it is set synchronously
    // before the runner iterates the query) then parks on `unblock` before completing. This holds
    // the one session "in flight" while we attempt a second.
    const entered = deferred();
    const unblock = deferred();
    const blockingQuery: SdkQueryFn = () =>
      (async function* () {
        entered.resolve();
        await unblock.promise;
        yield OK_SDK_RESULT;
      })();

    // Kick off session 1 WITHOUT awaiting it, then wait until it is actually in-flight.
    const firstDrain = drain(
      startChatStream({
        intent: "First session: orient and propose.",
        store,
        queryFn: blockingQuery,
      }),
    );
    await entered.promise;

    // Session 2, concurrent with session 1 in-flight. Its queryFn is a sentinel: the guard must
    // refuse BEFORE any SDK work, so this must never be called.
    let secondQueryCalled = false;
    const secondQuery: SdkQueryFn = () => {
      secondQueryCalled = true;
      return (async function* () {
        yield OK_SDK_RESULT;
      })();
    };
    const secondEvents = await drain(
      startChatStream({
        intent: "Second session: should be refused.",
        store,
        queryFn: secondQuery,
      }),
    );

    // Release session 1 and let it complete cleanly (no leaked handles — the in-flight flag resets).
    unblock.resolve();
    const firstEvents = await firstDrain;

    // --- Session 2 was refused with a distinct terminal `refused` event (the single-session guard) ---
    assert.ok(secondEvents.length > 0, "the refused session must still yield a terminal event");
    const secondLast = secondEvents[secondEvents.length - 1];
    assert.ok(secondLast !== undefined, "the refused session must yield a terminal event");
    assert.equal(
      secondLast.type,
      "refused",
      `the second concurrent session must terminate with a distinct 'refused' event (not a generic 'error'); got '${secondLast.type}'`,
    );
    assert.match(
      secondLast.type === "refused" ? secondLast.reason : "",
      /in-flight|concurrent|single session/i,
      "the refused event must carry the single-session reason (ADR-0108 d.6), not some other failure",
    );
    assert.ok(
      !secondQueryCalled,
      "the refused session must NOT reach the SDK — the guard refuses before any query() spend",
    );

    // --- Session 1 was untouched: it completed cleanly with its proposal intact ---
    assert.ok(firstEvents.length > 0, "the in-flight session must complete with a terminal event");
    const firstLast = firstEvents[firstEvents.length - 1];
    assert.ok(firstLast !== undefined, "the in-flight session must complete with a terminal event");
    assert.equal(
      firstLast.type,
      "done",
      `the running session must be untouched and finish with a 'done' event; got '${firstLast.type}'`,
    );
    assert.equal(
      firstLast.type === "done" ? firstLast.proposal : undefined,
      OK_SDK_RESULT.result,
      "the running session's proposal must be intact (the refused second session did not disturb it)",
    );
  },
);
