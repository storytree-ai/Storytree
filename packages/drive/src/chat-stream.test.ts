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
import { loadFixtureCorpus } from "@storytree/library/fixture";
import type { SdkQueryFn } from "@storytree/agent";

// RED: chat-stream.ts does not exist yet — module-not-found is the right-kind red.
import { startChatStream } from "./chat-stream.js";
import type { ChatStreamEvent } from "./chat-stream.js";

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

// The `spawnDepsDouble()` helper that stood here — a claim store + the two spawn runners, forwarded
// to orchestrate so `mcp__spawn__*` was advertised — went with the surface it fed (ADR-0175).
// `startChatStream` takes no `spawn` dep to double any more; the negative in §4b keeps it that way.

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
    await loadFixtureCorpus(store);

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
    await loadFixtureCorpus(store);

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
    await loadFixtureCorpus(store);

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
// 3c. Chat continuity (ADR-0170, amending ADR-0108): the done event carries the
//     run's sessionId, and an injected `resume` is threaded down to the SDK
//     options — so a follow-up send continues the SAME conversation (the
//     ADR-0163 gap-D fix). Absent resume → no resume key (fresh session).
// ---------------------------------------------------------------------------

test(
  "startChatStream: the done event carries the run's sessionId — what the thin client threads back as resume (ADR-0170)",
  async () => {
    const store = new InMemoryStore();
    await loadFixtureCorpus(store);

    const events = await drain(
      startChatStream({
        intent: "Orient and propose.",
        store,
        queryFn: queryYielding([{ ...OK_SDK_RESULT, session_id: "sess-first-run" }]),
      }),
    );

    const done = events.find((e) => e.type === "done");
    assert.ok(done !== undefined, "stream must contain a terminal `done` event");
    assert.equal(
      done.type === "done" ? done.sessionId : undefined,
      "sess-first-run",
      "the done event must surface the SDK session_id — the continuity handle the next send resumes with",
    );
  },
);

test(
  "startChatStream: an injected resume is threaded down to the SDK options; absent → no resume key (ADR-0170)",
  async () => {
    const store = new InMemoryStore();
    await loadFixtureCorpus(store);

    // With resume: the prior session id must reach the SDK options.
    const withResume = capturingQueryFn();
    await drain(
      startChatStream({
        intent: "proceed to reauthor it",
        store,
        queryFn: withResume.fn,
        resume: "sess-first-run",
      }),
    );
    assert.equal(
      withResume.lastOptions()["resume"],
      "sess-first-run",
      "the resume id must be threaded startChatStream → orchestrate → runHeadlessOrchestrator → SDK options",
    );

    // Without resume: a fresh session — the options carry no resume key at all.
    const fresh = capturingQueryFn();
    await drain(startChatStream({ intent: "Orient and propose.", store, queryFn: fresh.fn }));
    assert.equal(
      "resume" in fresh.lastOptions(),
      false,
      "without a resume arg the SDK options must carry no `resume` key — byte-identical fresh session",
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
    await loadFixtureCorpus(store);

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
// 4b. Spawn pass-through — RETIRED (ADR-0175).
//
// ADR-0137 Phase 3 threaded injected spawn deps through to orchestrate, mounting the two claim-gated
// spawn tools on the session, and the spawn-boundary traces surfaced back out as non-terminal `spawn`
// events on the delta FIFO (chat-spawn-trace-events). ADR-0174 retired the in-app interactive
// orchestrator and ADR-0175 ruled that "the spawn and landing surfaces (which drove story work) do not
// belong to a help agent and retire with the interactive orchestrator" — so `startChatStream` takes no
// `spawn` dep, emits no `spawn` event, and the modules behind both are deleted.
//
// The positive forwarding test went with the surface (the ADR-0155 / PR #587 precedent, and the
// landing slice's own); the negative below exists to keep it gone. The wider guard — the modules are
// deleted and nothing in the chain re-composes them — is
// apps/desktop/src/backend/spawn-surface-retired.test.ts.
// ---------------------------------------------------------------------------

test(
  "startChatStream: no mcp__spawn__* tool is advertised — the claim-gated spawn surface is retired (ADR-0175)",
  async () => {
    const store = new InMemoryStore();
    await loadFixtureCorpus(store);
    const q = capturingQueryFn();

    const events = await drain(
      startChatStream({ intent: "Orient and propose the next unit.", store, queryFn: q.fn }),
    );

    const last = events[events.length - 1];
    assert.equal(last?.type, "done", `capturing session must reach a terminal 'done' (got '${last?.type}')`);

    const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
    assert.equal(
      tools.some((t) => t.startsWith("mcp__spawn__")),
      false,
      `no mcp__spawn__* tool may be advertised — the spawn surface is retired (ADR-0175); got ${JSON.stringify(tools)}`,
    );
    // The orchestrator does not propose a unit for a human to accept either (ADR-0155).
    assert.equal(
      tools.includes("mcp__proposal__propose_unit"),
      false,
      "mcp__proposal__propose_unit must NOT be mounted — ADR-0155 retired the propose/accept surface",
    );
    // And no non-terminal `spawn` frame can reach the wire: nothing emits one any more. Read the
    // discriminant as a plain string — `"spawn"` is no longer in ChatStreamEvent["type"], which is
    // the point, so this must not be written as a comparison against the narrowed union.
    assert.equal(
      events.some((e) => (e as { type: string }).type === "spawn"),
      false,
      "no `spawn` event may be emitted — chat-spawn-trace-events retired with the surface it traced",
    );
  },
);

// The ADR-0152 landing-forwarding test lived here until ADR-0175 retired the landing surface with the
// interactive orchestrator (ADR-0174): `startChatStream` takes no `landing` dep any more and the
// modules behind it are deleted, so the positive assertion went with the surface (the ADR-0155 /
// PR #587 precedent). The surviving negative below keeps it gone; the wider guard is
// apps/desktop/src/backend/landing-surface-retired.test.ts.
test(
  "startChatStream: mounts NO landing surface — the merge-ceremony tools are retired (ADR-0175)",
  async () => {
    const store = new InMemoryStore();
    await loadFixtureCorpus(store);
    const q = capturingQueryFn();

    const events = await drain(
      startChatStream({
        intent: "Orient, build to green, and land the unit.",
        store,
        queryFn: q.fn,
      }),
    );

    const last = events[events.length - 1];
    assert.equal(last?.type, "done", `capturing session must reach a terminal 'done' (got '${last?.type}')`);

    const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
    assert.equal(
      tools.some((t) => t.startsWith("mcp__landing__")),
      false,
      `no mcp__landing__* tool may be advertised — the landing surface is retired (ADR-0175), and with ` +
        `it the fresh-branch-after-merge shape ADR-0271 ended; got ${JSON.stringify(tools)}`,
    );
    // The orchestrator DRIVES rather than proposes (ADR-0155) — there is no propose_unit surface.
    assert.equal(
      tools.includes("mcp__proposal__propose_unit"),
      false,
      "mcp__proposal__propose_unit must NOT be mounted — the orchestrator drives via its spawn tools, it does not propose a unit for a human to accept (ADR-0155)",
    );
  },
);

test(
  "startChatStream: without landing deps the session advertises no mcp__landing__* tool (the §7 scale-down)",
  async () => {
    const store = new InMemoryStore();
    await loadFixtureCorpus(store);
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
    await loadFixtureCorpus(store);

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
