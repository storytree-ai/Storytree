/**
 * Standing contract-coverage tests for the `proposal-id-threading` capability
 * (packages/drive — ADR-0108 Phase 3, the propose→drive bridge's second link).
 *
 * The keystone red→green (the declared id reaching the terminal `done` event) was authored by the
 * gated leaf and signed by the spine @ a37d76a (events.verdict). The signed verdict observes only the
 * one authored test, so it over-claimed coverage (0/3). These standing tests complete the declared
 * `## Contracts` coverage against that landed threading — one named, substantive test per contract id
 * so the ADR-0122/0126 coverage classifier detects it (`test("<contract-id>: …")`):
 *
 *   - pit-done-event-carries-proposed-id   — the declared id reaches the terminal `done` event,
 *                                            the existing proposal/costUsd/turns fields unbroken
 *   - pit-absent-id-is-undefined-on-done   — no declaration → proposedUnitId undefined on `done`
 *   - pit-id-only-on-success-path          — error/refused terminal events carry no id
 *
 * THE THREADING (ADR-0108 d.2): the value traverses the full composition end-to-end —
 *   runHeadlessOrchestrator result (HeadlessOrchestratorResult.proposedUnitId)
 *     → OrchestrateResult (spread through, ADR-0108 Phase 1)
 *     → startChatStream's terminal `done` event (ChatStreamDoneEvent.proposedUnitId)
 * — exercised against the REAL `orchestrate()` composition (the real session-orchestrator render +
 * the real runner over the real seed corpus) with an injected `queryFn` scripted double. No live SDK
 * spend (ADR-0010 §5); the live chat run is the operator-attested Story UAT leg.
 *
 * READ/PROPOSE ONLY (ADR-0091): the threaded id is a PROPOSAL — no signing key, no verdict, no build.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

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

/** A scripted success result message — the SDK terminal message on a successful session. */
function okResult(proposal: string): unknown {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 2,
    total_cost_usd: 0.01,
    result: proposal,
  };
}

/**
 * A scripted assistant message carrying a `propose_unit` tool_use block — the structural declaration
 * `runHeadlessOrchestrator` captures into `result.proposedUnitId` via `extractProposedUnit`. The tool
 * name is the exact `mcp__proposal__propose_unit` the extraction path keys on (mirrors the helper in
 * `proposed-unit-signal.test.ts`).
 */
function proposeUnitMessage(unitId: string): unknown {
  return {
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", id: "tu_propose_1", name: "mcp__proposal__propose_unit", input: { unitId } },
      ],
    },
  };
}

/**
 * A manually-resolvable promise — lets a scripted session park mid-flight so the first session can be
 * held "in flight" while a second is attempted (the single-session refusal path, ADR-0108 d.6).
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// pit-done-event-carries-proposed-id — the declared id reaches the terminal `done` event
// ---------------------------------------------------------------------------

test(
  "pit-done-event-carries-proposed-id: the terminal done event surfaces proposedUnitId threaded through the full orchestrate composition, with proposal/costUsd/turns unbroken",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const DECLARED_UNIT_ID = "drive:proposal-id-threading/thread-id";
    const PROPOSAL = "I propose drive:proposal-id-threading/thread-id as the next unit.";

    // The scripted session declares a unit via propose_unit then returns a successful result — the
    // exact path the live agent takes. The double drives extractProposedUnit in the REAL runner, so
    // the value flows runHeadlessOrchestrator → OrchestrateResult → the done event.
    const events = await drain(
      startChatStream({
        intent: "Orient and propose the next unit.",
        store,
        queryFn: queryYielding([proposeUnitMessage(DECLARED_UNIT_ID), okResult(PROPOSAL)]),
      }),
    );

    const last = events[events.length - 1];
    assert.ok(last !== undefined, "stream must yield a terminal event");
    assert.equal(last.type, "done", `the terminal event must be 'done' (got '${last?.type}')`);

    // The threaded id reaches the wire-serialised done event.
    assert.equal(
      last.type === "done" ? last.proposedUnitId : undefined,
      DECLARED_UNIT_ID,
      "the done event must surface proposedUnitId threaded end-to-end " +
        "(HeadlessOrchestratorResult → OrchestrateResult → ChatStreamDoneEvent)",
    );

    // The existing fields are unbroken — the threading is ADDITIVE, not a rewrite of the done event.
    assert.equal(
      last.type === "done" ? last.proposal : undefined,
      PROPOSAL,
      "the done event's existing proposal field must be intact (additive threading)",
    );
    assert.equal(
      last.type === "done" ? last.costUsd : undefined,
      0.01,
      "the done event's existing costUsd field must be intact",
    );
    assert.equal(
      last.type === "done" ? last.turns : undefined,
      2,
      "the done event's existing turns field must be intact",
    );
  },
);

// ---------------------------------------------------------------------------
// pit-absent-id-is-undefined-on-done — no declaration → no id on the wire (honest absence)
// ---------------------------------------------------------------------------

test(
  "pit-absent-id-is-undefined-on-done: a session that declares no propose_unit yields a done event with proposedUnitId undefined, the proposal still surfaced",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const PROPOSAL = "Thinking out loud — no unit declared this turn.";

    // No proposeUnitMessage: the session never calls propose_unit, so the runner captures no id.
    const events = await drain(
      startChatStream({
        intent: "Orient and propose.",
        store,
        queryFn: queryYielding([okResult(PROPOSAL)]),
      }),
    );

    const last = events[events.length - 1];
    assert.ok(last !== undefined, "stream must yield a terminal event");
    assert.equal(last.type, "done", `the terminal event must be 'done' (got '${last?.type}')`);

    // Honest absence — no forged or defaulted id when none was declared.
    assert.equal(
      last.type === "done" ? last.proposedUnitId : "SENTINEL",
      undefined,
      "the done event's proposedUnitId must be undefined when no propose_unit was called (no forged default)",
    );
    // The proposal is still surfaced — the threading is additive, never gating the done event.
    assert.equal(
      last.type === "done" ? last.proposal : undefined,
      PROPOSAL,
      "the proposal must still surface on a done event that carries no proposed id",
    );
  },
);

// ---------------------------------------------------------------------------
// pit-id-only-on-success-path — error/refused terminal events carry no id
// ---------------------------------------------------------------------------

test(
  "pit-id-only-on-success-path: a failed session yields a terminal error and a concurrent session a terminal refused, NEITHER carrying proposedUnitId — threading touches the done path only",
  async () => {
    // --- error path: session-orchestrator absent → orchestrate fails closed → terminal `error` ---
    const emptyStore = new InMemoryStore(); // no corpus loaded → render fails before any SDK spend
    const errorEvents = await drain(
      startChatStream({
        intent: "Orient and propose.",
        store: emptyStore,
        queryFn: queryYielding([okResult("never reached")]),
      }),
    );
    const errorLast = errorEvents[errorEvents.length - 1];
    assert.ok(errorLast !== undefined, "the failed session must yield a terminal event");
    assert.equal(
      errorLast.type,
      "error",
      `a failed session must terminate with 'error' (got '${errorLast?.type}')`,
    );
    assert.ok(
      !("proposedUnitId" in errorLast),
      "an error event must carry NO proposedUnitId — the field rides the done path only (ADR-0091)",
    );

    // --- refused path: a second concurrent session is refused while the first is in-flight (d.6) ---
    const store = new InMemoryStore();
    await loadCorpus(store);
    const entered = deferred();
    const unblock = deferred();
    const blockingQuery: SdkQueryFn = () =>
      (async function* () {
        entered.resolve();
        await unblock.promise;
        yield okResult("first session done");
      })();
    const firstDrain = drain(
      startChatStream({ intent: "First session.", store, queryFn: blockingQuery }),
    );
    await entered.promise; // session 1 is now in-flight (the single-session guard's flag is set)

    // The second session's scripted body WOULD declare an id — but the guard refuses before any query
    // runs, so no id is ever captured. This proves the id rides the success path, not the refusal.
    const refusedEvents = await drain(
      startChatStream({
        intent: "Second session — should be refused.",
        store,
        queryFn: queryYielding([proposeUnitMessage("would-be-unit"), okResult("should not run")]),
      }),
    );
    unblock.resolve();
    await firstDrain; // let session 1 finish cleanly (resets the in-flight flag)

    const refusedLast = refusedEvents[refusedEvents.length - 1];
    assert.ok(refusedLast !== undefined, "the refused session must yield a terminal event");
    assert.equal(
      refusedLast.type,
      "refused",
      `a concurrent session must terminate with 'refused' (got '${refusedLast?.type}')`,
    );
    assert.ok(
      !("proposedUnitId" in refusedLast),
      "a refused event must carry NO proposedUnitId — even though its scripted body declared one, the " +
        "refusal short-circuits before any session result (threading is success-path only)",
    );
  },
);
