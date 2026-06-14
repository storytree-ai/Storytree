import test from "node:test";
import assert from "node:assert/strict";

import { PgAdrStore, type AdrAllocatorClient } from "./adr-store.js";

/**
 * Offline tests for the ADR-number allocator's CONTROL FLOW — the retry-on-unique-violation that
 * makes a contended double-allocation safe — over a fake `query` client (no DB). The actual
 * GREATEST(localMax, MAX)+1 SQL is exercised by the live-gated test at the bottom.
 */

const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";

/** A unique-violation the allocator must catch + retry (mirrors node-pg's error shape). */
function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint "adr_number_pkey"'), {
    code: "23505",
  });
}

/** A fake client whose `query` runs a scripted sequence of behaviours, one per call. */
function scriptedClient(steps: Array<() => { rows: unknown[] }>): {
  client: AdrAllocatorClient;
  calls: { text: string; values?: unknown[] }[];
} {
  const calls: { text: string; values?: unknown[] }[] = [];
  let i = 0;
  const client: AdrAllocatorClient = {
    async query(text, values) {
      calls.push(values !== undefined ? { text, values } : { text });
      const step = steps[Math.min(i, steps.length - 1)];
      i += 1;
      if (step === undefined) throw new Error("scriptedClient: no step scripted");
      return step();
    },
  };
  return { client, calls };
}

const ok = (number: number) => (): { rows: unknown[] } => ({
  rows: [{ number, at: "2026-06-14T00:00:00.000Z" }],
});
const fail = (err: Error) => (): { rows: unknown[] } => {
  throw err;
};

test("allocate returns the reserved number on a clean first try", async () => {
  const { client, calls } = scriptedClient([ok(50)]);
  const store = new PgAdrStore(client);
  const res = await store.allocate({ localMax: 49, slug: "foo", branch: "claude/x", actor: "cli" });
  assert.equal(res.number, 50);
  assert.equal(res.at, "2026-06-14T00:00:00.000Z");
  assert.equal(calls.length, 1);
  // localMax + audit fields are threaded into the parameterised query.
  assert.deepEqual(calls[0]?.values, [49, "foo", "claude/x", "cli"]);
  // The SQL reconciles against the on-disk max via GREATEST (not a bare sequence).
  assert.match(calls[0]?.text ?? "", /GREATEST\(\$1::int, COALESCE\(MAX\(number\), 0\)\) \+ 1/);
});

test("allocate retries on a unique violation, then succeeds (the contended-allocation case)", async () => {
  // First INSERT loses the race (23505); the second recomputes MAX and wins.
  const { client, calls } = scriptedClient([fail(uniqueViolation()), ok(51)]);
  const store = new PgAdrStore(client);
  const res = await store.allocate({ localMax: 49, slug: "bar", branch: "b", actor: "cli" });
  assert.equal(res.number, 51);
  assert.equal(calls.length, 2); // it retried exactly once
});

test("allocate gives up after the retry bound when contention never clears", async () => {
  const { client, calls } = scriptedClient([fail(uniqueViolation())]); // every call loses the race
  const store = new PgAdrStore(client);
  await assert.rejects(
    () => store.allocate({ localMax: 0, slug: "z", branch: "b", actor: "cli" }),
    /gave up after \d+ contended attempts/,
  );
  assert.ok(calls.length >= 2, "it retried several times before giving up");
});

test("allocate propagates a NON-unique error immediately (no retry, no swallow)", async () => {
  const boom = Object.assign(new Error("connection terminated"), { code: "57P01" });
  const { client, calls } = scriptedClient([fail(boom)]);
  const store = new PgAdrStore(client);
  await assert.rejects(() => store.allocate({ localMax: 0, slug: "z", branch: "b", actor: "cli" }), /connection terminated/);
  assert.equal(calls.length, 1); // surfaced on the first failure, not retried
});

// ---- Live-gated: real atomic allocation over Postgres --------------------------------------

if (LIVE) {
  test("live: allocate hands out monotonic numbers and reconciles against localMax", async () => {
    const { createPool, closePool } = await import("./connection.js");
    const { applySchema } = await import("./migrate.js");
    const { pool, connector } = await createPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.adr_number");
      const store = new PgAdrStore(pool);

      // Empty table + localMax 46 → next is 47, then 48 (monotonic, no gaps).
      const a = await store.allocate({ localMax: 46, slug: "a", branch: "b", actor: "t" });
      const b = await store.allocate({ localMax: 46, slug: "b", branch: "b", actor: "t" });
      assert.equal(a.number, 47);
      assert.equal(b.number, 48);

      // A higher localMax (an ADR landed on main outside the allocator) jumps the floor.
      const c = await store.allocate({ localMax: 60, slug: "c", branch: "b", actor: "t" });
      assert.equal(c.number, 61);

      // Concurrent allocations never collide: 8 at once yield 8 distinct numbers.
      const batch = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          store.allocate({ localMax: 0, slug: `p${i}`, branch: "b", actor: "t" }),
        ),
      );
      const nums = batch.map((r) => r.number);
      assert.equal(new Set(nums).size, nums.length, "all 8 concurrent allocations are distinct");
    } finally {
      await closePool(pool, connector);
    }
  });
}
