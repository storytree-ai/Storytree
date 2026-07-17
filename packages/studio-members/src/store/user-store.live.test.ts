import test from "node:test";
import assert from "node:assert/strict";
import type { UserDoc } from "@storytree/studio-members";
import { createTestPool, closePool, applySchema } from "@storytree/library/store";
import { PgUserStore, LastAdminError } from "./user-store.js";

/**
 * Live DB proof for the ADR-0043 no-lockout mutex (the TOCTOU fix). Only real Postgres can attest
 * the piece that matters: two concurrent transactions downgrading/removing DIFFERENT admin rows
 * are SERIALISED by the shared `pg_advisory_xact_lock`, so exactly one wins and at least one admin
 * always survives. Before the fix — a plain `SELECT` under READ COMMITTED — both read `adminCount
 * == 2`, both pass the guard, and both commit, orphaning the directory (zero admins). The offline
 * FakePool can't exercise real lock contention, so this is the only test that catches a regression
 * that drops the lock.
 *
 * Run PER-FILE (the live-store suites truncate live tables):
 *   STORYTREE_DB_NAME=storytree_test STORYTREE_DB_USER=<iam-email> \
 *     pnpm --filter @storytree/studio-members exec \
 *       node --import tsx --test --test-force-exit src/store/user-store.live.test.ts
 */

// DB-backed proof (ADR-0064): runs ONLY when STORYTREE_DB_NAME names a disposable test DB. Absent
// (the offline package suite / CI) the tests skip, so this file never touches production and never
// reds the offline gate.
const DB = process.env["STORYTREE_DB_NAME"];

const TS = "2026-07-18T00:00:00.000Z";

function admin(email: string): UserDoc {
  return { email, role: "admin", status: "active", invitedBy: null, createdAt: TS, lastSeenAt: TS };
}

function adminCountOf(users: readonly UserDoc[]): number {
  return users.filter((u) => u.role === "admin").length;
}

async function resetUserTables(pool: {
  query(text: string, values?: unknown[]): Promise<unknown>;
}): Promise<void> {
  await pool.query('TRUNCATE events."user"');
  await pool.query("TRUNCATE events.user_event");
}

/**
 * Pre-open `n` physical connections and hand them back to the pool. Cloud SQL connection setup
 * (connector handshake) costs seconds and desynchronises two just-launched transactions enough
 * that one finishes before the other even reads — hiding the race. Warming the pool means the
 * racing operations below check out already-open connections, so their in-transaction SELECTs
 * genuinely overlap and the guard is actually exercised under contention.
 */
async function warmPool(
  pool: { connect(): Promise<{ query(t: string): Promise<unknown>; release(): void }> },
  n: number,
): Promise<void> {
  const clients = await Promise.all(Array.from({ length: n }, () => pool.connect()));
  await Promise.all(clients.map((c) => c.query("SELECT 1")));
  for (const c of clients) c.release();
}

test(
  "no-lockout mutex: two concurrent downgrades of DIFFERENT admins serialise — exactly one survives",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await resetUserTables(pool);

      const store = new PgUserStore(pool);
      // Seed two admins (a fresh admin insert never trips the guard).
      await store.upsert(admin("a1@example.com"), "seed");
      await store.upsert(admin("a2@example.com"), "seed");
      assert.equal(adminCountOf(await store.list()), 2, "two admins seeded");
      await warmPool(pool, 2);

      // Race two downgrades of DIFFERENT admins. Pre-fix both would commit → zero admins.
      const results = await Promise.allSettled([
        store.upsert({ ...admin("a1@example.com"), role: "member" }, "actor-1"),
        store.upsert({ ...admin("a2@example.com"), role: "member" }, "actor-2"),
      ]);

      const rejected = results.filter((r) => r.status === "rejected");
      assert.equal(rejected.length, 1, "exactly one downgrade is refused");
      assert.ok(
        rejected.every((r) => (r as PromiseRejectedResult).reason instanceof LastAdminError),
        "the refusal is a LastAdminError, not an incidental failure",
      );
      assert.equal(
        adminCountOf(await store.list()),
        1,
        "at least one admin survives — the directory is not orphaned",
      );
    } finally {
      await closePool(pool, connector);
    }
  },
);

test(
  "no-lockout mutex: two concurrent removes of DIFFERENT admins serialise — exactly one survives",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await resetUserTables(pool);

      const store = new PgUserStore(pool);
      await store.upsert(admin("a1@example.com"), "seed");
      await store.upsert(admin("a2@example.com"), "seed");
      assert.equal(adminCountOf(await store.list()), 2, "two admins seeded");
      await warmPool(pool, 2);

      const results = await Promise.allSettled([
        store.remove("a1@example.com", "actor-1"),
        store.remove("a2@example.com", "actor-2"),
      ]);

      const rejected = results.filter((r) => r.status === "rejected");
      assert.equal(rejected.length, 1, "exactly one remove is refused");
      assert.ok(
        rejected.every((r) => (r as PromiseRejectedResult).reason instanceof LastAdminError),
        "the refusal is a LastAdminError",
      );
      assert.equal(
        adminCountOf(await store.list()),
        1,
        "at least one admin survives — the directory is not orphaned",
      );
    } finally {
      await closePool(pool, connector);
    }
  },
);
