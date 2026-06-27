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
 *      terminal `error` event while the first session is in-flight and left untouched
 *      (`cs-fails-closed-and-single-session`, ADR-0108 d.6).
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
// 5. Single-session guard: a second concurrent session is refused with a
//    terminal `error` event while the first is in-flight and untouched
//    (contract `cs-fails-closed-and-single-session`, ADR-0108 d.6)
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

    // --- Session 2 was refused with a terminal error event (the single-session guard) ---
    assert.ok(secondEvents.length > 0, "the refused session must still yield a terminal event");
    const secondLast = secondEvents[secondEvents.length - 1];
    assert.ok(secondLast !== undefined, "the refused session must yield a terminal event");
    assert.equal(
      secondLast.type,
      "error",
      `the second concurrent session must terminate with an 'error' event; got '${secondLast.type}'`,
    );
    assert.match(
      secondLast.type === "error" ? secondLast.error : "",
      /in-flight|concurrent|single session/i,
      "the error must be the single-session refusal (ADR-0108 d.6), not some other failure",
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
