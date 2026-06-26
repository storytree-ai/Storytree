// Integration test for the forest-readiness probe (apps/desktop/src/backend/forest-readiness.ts).
//
// WHAT IT PINS: the probe confirms the local backend can reach the shared Cloud SQL before the
// agent loop runs. It takes an injected connector (async () => ForestConnection) and:
//   - returns { ready: true }  when the connector resolves (the GRANTED path)
//   - returns { ready: false, guidance: <actionable> } when the connector rejects (the REFUSED /
//     ungranted / idle-stopped path) — FAILS CLOSED, never hangs, never forges a ready signal.
//
// INTEGRATION TIER: drives the probe with in-memory connector doubles (no real Cloud SQL, no IAM
// grant, no socket). The GRANTED double resolves immediately with a closeable stub; the REFUSED
// double rejects with a connection-shaped error (ECONNREFUSED). Production wires the real
// @storytree/library Cloud SQL connector.
//
// DELETION TEST: if probeForestReadiness were removed, every assertion here fails. If the
// fail-closed conversion (reject → { ready: false, guidance }) were removed, the second test
// would throw instead of returning a result. If the guidance were left empty or not actionable,
// the actionable-text assertion in the second test would fail.

import { test } from "node:test";
import assert from "node:assert/strict";

// The module under test — does not exist until the implementation phase (right-kind red).
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
