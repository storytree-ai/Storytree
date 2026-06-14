import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_DATABASE } from "./connection.js";
import { assertTestDatabase, createTestPool, TEST_DB_ENV } from "./test-db.js";

/**
 * The truncation-wipe guard (ADR-0054): the destructive live-gated tests TRUNCATE, so they must never
 * connect to production. These run OFFLINE — they exercise the guard's refusal logic, never a DB.
 */

test("assertTestDatabase refuses the PRODUCTION database (the wipe that reverted library green→brown)", () => {
  assert.throws(() => assertTestDatabase(DEFAULT_DATABASE), /PRODUCTION database/);
});

test("assertTestDatabase refuses an unset / blank database name", () => {
  assert.throws(() => assertTestDatabase(undefined), /disposable database/);
  assert.throws(() => assertTestDatabase("   "), /disposable database/);
});

test("assertTestDatabase accepts a disposable test database", () => {
  assert.doesNotThrow(() => assertTestDatabase("storytree_test"));
});

test("createTestPool fails closed (before any connection) when STORYTREE_DB_NAME is unset", async () => {
  const prev = process.env[TEST_DB_ENV];
  delete process.env[TEST_DB_ENV];
  try {
    // assertTestDatabase throws before createPool, so this never opens a socket — safe offline.
    await assert.rejects(() => createTestPool(), /disposable database/);
  } finally {
    if (prev !== undefined) process.env[TEST_DB_ENV] = prev;
  }
});

test("createTestPool fails closed when STORYTREE_DB_NAME points at production", async () => {
  const prev = process.env[TEST_DB_ENV];
  process.env[TEST_DB_ENV] = DEFAULT_DATABASE;
  try {
    await assert.rejects(() => createTestPool(), /PRODUCTION database/);
  } finally {
    if (prev === undefined) delete process.env[TEST_DB_ENV];
    else process.env[TEST_DB_ENV] = prev;
  }
});
