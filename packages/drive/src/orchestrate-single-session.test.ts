/**
 * Regression test: composition-level typed single-session guard (ADR-0108 decision 6).
 *
 * Pins that orchestrate() returns a TYPED refusal —
 *   { refused: true, reason: "single-session", ok: false }
 * — when a composition session is already in flight, leaving the running session untouched.
 *
 * At HEAD, orchestrate() has no composition-level guard: a concurrent call falls through to
 * runHeadlessOrchestrator, which returns { ok: false, error: "session in-flight…" } with no
 * typed fields. The `refused` and `reason` fields are absent → the assertions below fail →
 * right-kind RED.
 *
 * After the composition-level guard is added (OrchestrateResult widened + synchronous guard at
 * the top of orchestrate()), the typed refusal is returned and the first session is left
 * untouched → GREEN.
 *
 * Offline: the injectable queryFn seam is used — no live SDK spend (ADR-0010 §5).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

import { orchestrate } from "./orchestrate.js";
import type { OrchestrateResult } from "./orchestrate.js";

// ---------------------------------------------------------------------------
// Scripted SDK result used by the first (blocking) session
// ---------------------------------------------------------------------------

const FIRST_SESSION_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 2,
  total_cost_usd: 0.005,
  result: "Proposal: focus on the orchestrate-composition capability next.",
};

// ---------------------------------------------------------------------------
// Typed single-session guard at the composition level (ADR-0108 decision 6)
// ---------------------------------------------------------------------------

test(
  "orchestrate: returns typed { refused: true, reason: 'single-session' } when a composition session is already in flight, leaving the running session untouched",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    // Promise pair: signal when the first session's queryFn has been invoked (at which point
    // the in-flight guard is set in runHeadlessOrchestrator), and a latch to release it later.
    let signalQueryStarted!: () => void;
    const queryStarted = new Promise<void>((resolve) => {
      signalQueryStarted = resolve;
    });
    let unblockFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      unblockFirst = resolve;
    });

    // A queryFn that signals "I am running" then blocks until explicitly released.
    // runHeadlessOrchestrator sets its inFlight flag synchronously BEFORE calling this generator,
    // so by the time signalQueryStarted() fires the flag is guaranteed to be set.
    const blockingQuery: SdkQueryFn = () =>
      (async function* () {
        signalQueryStarted();
        await firstBlocked;
        yield FIRST_SESSION_RESULT;
      })();

    // Launch the first session without awaiting — it stays in-flight inside blockingQuery.
    const firstPromise = orchestrate({
      intent: "First session — orient and propose.",
      store,
      queryFn: blockingQuery,
    });

    // Wait until the first session's queryFn has started executing so inFlight is guaranteed set.
    await queryStarted;

    // Issue the second call while the first session is in-flight.
    // Cast to the widened result type so TypeScript accepts the typed-field access below.
    const second = (await orchestrate({
      intent: "Second session — must be refused.",
      store,
      queryFn: blockingQuery,
    })) as OrchestrateResult & { refused?: true; reason?: "single-session" };

    // Always release the first session to prevent the blocking generator from holding the
    // event loop open past the test (covers the failure path when an assertion throws).
    let first!: OrchestrateResult;
    try {
      // TYPED REFUSAL — these assertions fail at HEAD because refused/reason are absent.
      assert.equal(
        second.refused,
        true,
        "second call must return refused: true when a composition session is already in flight",
      );
      assert.equal(
        second.reason,
        "single-session",
        "second call must return reason: 'single-session' so the consumer can distinguish this " +
          "refusal from a hard error",
      );
      assert.equal(second.ok, false, "second call must return ok: false");
    } finally {
      // Always drain the first session — prevents an orphaned blocked generator.
      unblockFirst();
      first = await firstPromise;
    }

    // The running first session must have completed normally — the refusal must not interrupt it.
    assert.equal(
      first.ok,
      true,
      `first session must complete normally after the typed refusal; error: ${first.error ?? "(none)"}`,
    );
    assert.equal(
      first.proposal,
      FIRST_SESSION_RESULT.result,
      "first session must surface the scripted proposal",
    );
  },
);
