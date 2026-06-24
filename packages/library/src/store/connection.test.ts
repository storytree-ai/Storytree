import test from "node:test";
import assert from "node:assert/strict";
import { createPool, closePool } from "./connection.js";
import type { PoolHandle } from "./connection.js";

/**
 * Regression test: createPool must fail closed when no IAM principal resolves.
 *
 * The documented contract (connection.ts:38) states STORYTREE_DB_USER is "REQUIRED for a live
 * connection", but the current implementation silently builds a user-less pool when the env var
 * is absent and no opts.user is supplied — violating fail-closed posture.
 *
 * This test pins the SHOULD-behaviour: a missing IAM principal (no opts.user AND
 * STORYTREE_DB_USER unset) must produce a loud, instructional throw that mentions
 * STORYTREE_DB_USER — BEFORE any Connector socket is opened.
 *
 * RED-state note: the current createPool RESOLVES after ~6s (connector.getOptions + ambient ADC).
 * The test MUST closePool on that resolved path to prevent a leaked connector handle from hanging
 * the suite (pnpm --filter @storytree/library test has no --test-force-exit, and runShellCommand
 * has no timeout — a leaked handle wedges the gate permanently).
 */
test("createPool fails closed when no IAM principal resolves", async () => {
  // Temporarily remove the IAM principal so no principal resolves.
  const saved = process.env["STORYTREE_DB_USER"];
  delete process.env["STORYTREE_DB_USER"];

  let handle: PoolHandle | undefined;
  let caughtError: unknown;

  try {
    handle = await createPool();
  } catch (err) {
    caughtError = err;
  } finally {
    // In the RED state createPool resolves and returns a real pool+connector; close both
    // immediately to prevent the live handles from hanging the suite.
    if (handle !== undefined) {
      await closePool(handle.pool, handle.connector);
    }
    // Always restore the env var to avoid polluting later tests.
    if (saved !== undefined) {
      process.env["STORYTREE_DB_USER"] = saved;
    }
  }

  // In the RED state caughtError is undefined (createPool resolved) — this assertion fails.
  // In the GREEN state createPool throws before opening any socket — this assertion passes.
  assert.ok(
    caughtError !== undefined,
    "createPool() must throw when no IAM principal resolves " +
      "(STORYTREE_DB_USER unset and no opts.user supplied)",
  );
  // The error must be instructional: point the operator at STORYTREE_DB_USER.
  assert.ok(
    caughtError instanceof Error && caughtError.message.includes("STORYTREE_DB_USER"),
    `expected error message to mention STORYTREE_DB_USER, got: ${String(caughtError)}`,
  );
});
