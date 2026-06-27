// Integration test for the forest-readiness probe (apps/desktop/src/backend/forest-readiness.ts).
//
// WHAT IT PINS: the probe confirms the local backend can reach the shared Cloud SQL before the
// agent loop runs. It takes an injected connector (async () => ForestConnection) and:
//   - returns { ready: true }  when the connector resolves (the GRANTED path)
//   - returns { ready: false, guidance: <actionable> } when the connector rejects (the REFUSED /
//     ungranted / idle-stopped path) — FAILS CLOSED, never hangs, never forges a ready signal.
//   - returns { ready: false, guidance: <timeout-actionable> } when the connector stalls past the
//     supplied timeoutMs deadline — SELF-BOUNDING so it cannot hang for minutes
//     (the MEMBERS_RESOLVE_TIMEOUT_MS precedent from serve.ts).
//
// INTEGRATION TIER: drives the probe with in-memory connector doubles (no real Cloud SQL, no IAM
// grant, no socket). The GRANTED double resolves immediately with a closeable stub; the REFUSED
// double rejects with a connection-shaped error (ECONNREFUSED); the STALLED double never resolves.
//
// DELETION TEST: if probeForestReadiness were removed, every assertion here fails. If the
// fail-closed conversion (reject → { ready: false, guidance }) were removed, the second test
// would throw instead of returning a result. If the probe's self-bounding timeout were removed,
// the third test would hang until the spine's SIGKILL budget expires.

import { test } from "node:test";
import assert from "node:assert/strict";

import { probeForestReadiness } from "./forest-readiness.js";
import type { ForestConnectorFn, ForestReadinessResult } from "./forest-readiness.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Pins the READY path: when the connector resolves (the member has the IAM grant and the DB is
// up), the probe returns { ready: true } and closes the connection cleanly.
test("forest-readiness: a granted connector resolves to ready", async () => {
  // GRANTED double: resolves immediately with a closeable in-memory stub.
  // end() is defined so the probe can close it without touching real OS handles.
  const grantedConnector: ForestConnectorFn = async () => ({ end: async () => undefined });

  const result: ForestReadinessResult = await probeForestReadiness(grantedConnector);

  // Deletion test: removing probeForestReadiness makes this test fail to import.
  // If the implementation returned a hardcoded { ready: false } this assertion would fail.
  assert.equal(result.ready, true, "a granted connector must yield ready:true");
});

// Pins the FAIL-CLOSED path: when the connector rejects (the member is missing the IAM grant
// or the DB is idle-stopped), the probe converts the error into { ready: false, guidance }
// rather than propagating the throw — it NEVER reports ready when it cannot connect.
test("forest-readiness: a refused connector fails closed with member-actionable guidance", async () => {
  // REFUSED double: rejects immediately with a connection-shaped error (ECONNREFUSED).
  // This mirrors the error shape a real Cloud SQL connector produces when the DB is unreachable.
  const refusedConnector: ForestConnectorFn = async () => {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3307"), {
      code: "ECONNREFUSED",
    });
  };

  // Deletion test: if the probe propagated the throw instead of converting to { ready: false },
  // this await would reject and the test would fail with an unexpected error.
  const result: ForestReadinessResult = await probeForestReadiness(refusedConnector);

  assert.equal(
    result.ready,
    false,
    "a refused connector must yield ready:false — the probe must not throw or report ready",
  );

  // TypeScript union narrowing: branch on ready to access guidance safely.
  if (result.ready) {
    assert.fail("probe must not report ready when the connector refuses");
  }

  // The guidance must be a non-empty, member-actionable string.
  assert.ok(
    typeof result.guidance === "string" && result.guidance.length > 0,
    "fail-closed result must carry a non-empty guidance string",
  );

  // Deletion test: if the guidance were a raw error message / stack trace rather than
  // member-actionable text, this assertion would fail, proving the guidance was crafted.
  assert.ok(
    /IAM|grant|db:up|Cloud SQL|idle/i.test(result.guidance),
    `guidance must be member-actionable (mention the IAM grant or db:up); got: "${result.guidance}"`,
  );
});

// Pins the SELF-BOUNDING path: when the connector stalls indefinitely (e.g. a Cloud SQL
// handshake that never completes — the MEMBERS_RESOLVE_TIMEOUT_MS failure mode from serve.ts),
// the probe must fail-closed within the supplied timeoutMs budget rather than hanging.
//
// The current implementation has no timeoutMs option, so:
//   - TypeScript compile: "Expected 1 arguments, but got 2" (compile-red — the missing parameter)
//   - tsx runtime: the extra arg is silently ignored, the connector stalls, the outer safety-net
//     guard fires at GUARD_MS and the test fails with a behaviour assertion (runtime-red)
//
// After implementation (probeForestReadiness accepts an optional { timeoutMs } option):
//   - both the compile error and the runtime assertion disappear → GREEN
test("forest-readiness: a stalled connector fails closed within the supplied timeout", async () => {
  // STALLED double: a connector that never resolves — simulates an indefinitely-hung
  // Cloud SQL handshake. This double has no OS handles (timers, sockets) so the process
  // exits cleanly once the test resolves; it is not a handle leak.
  const stalledConnector: ForestConnectorFn = () =>
    new Promise<never>(() => {
      /* never resolves — no timer, no socket, no OS handle */
    });

  const PROBE_TIMEOUT_MS = 50;
  // Outer safety net: slightly longer than the probe deadline.  If probeForestReadiness does
  // NOT self-bound within GUARD_MS, this guard fires and the test fails with a clear message
  // rather than hanging until the spine's SIGKILL budget expires.
  const GUARD_MS = PROBE_TIMEOUT_MS + 150;

  let guardTimer: ReturnType<typeof setTimeout> | undefined;
  const outerGuard = new Promise<never>((_, reject) => {
    guardTimer = setTimeout(
      () =>
        reject(
          new Error(
            `probeForestReadiness did not fail-closed within ${GUARD_MS}ms — ` +
              `the probe must accept a timeoutMs option and self-bound when the connector stalls`,
          ),
        ),
      GUARD_MS,
    );
  });

  try {
    // Pass { timeoutMs } as a second argument — this parameter does not yet exist on the
    // current implementation signature, which is the right-kind compile-red.
    // Under tsx (types stripped) the extra arg is silently ignored; the connector stalls;
    // the outer guard fires; and the test fails (right-kind runtime-red).
    const result = await Promise.race([
      probeForestReadiness(stalledConnector, { timeoutMs: PROBE_TIMEOUT_MS }),
      outerGuard,
    ]);

    assert.equal(
      result.ready,
      false,
      "a stalled connector must yield ready:false within the timeout",
    );
    if (result.ready) {
      assert.fail("probe must not report ready when the connector stalls");
    }
    assert.ok(
      typeof result.guidance === "string" && result.guidance.length > 0,
      "fail-closed timeout result must carry a non-empty guidance string",
    );
    // The guidance for a stalled connector must be distinct from the ECONNREFUSED guidance
    // and explicitly mention the timeout/deadline so the member knows it is a timeout failure.
    assert.ok(
      /timeout|timed out|deadline|stall/i.test(result.guidance),
      `guidance for a stalled connector must mention the timeout; got: "${result.guidance}"`,
    );
  } finally {
    // Always clear the outer guard timer — no handle leak regardless of pass/fail.
    clearTimeout(guardTimer);
  }
});
