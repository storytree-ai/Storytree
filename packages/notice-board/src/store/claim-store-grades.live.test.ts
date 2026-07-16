import test from "node:test";
import assert from "node:assert/strict";
import { createTestPool, closePool, applySchema } from "@storytree/library/store";
import { claimGrade } from "../claim.js";
import { PgClaimStore } from "./claim-store.js";

/**
 * Live DB proof for the ADR-0200 D2 grade ledger in PgClaimStore: the pieces only real Postgres
 * can attest — the PARTIAL unique index (`node_claim_work_excl`) enforcing work exclusivity while
 * shared exploring/waiting rows coexist on the composite PK, real `claimed_at` queue ordering, and
 * the atomic oldest-live-waiter promotion end-to-end (upgrade → queue → release → promoted),
 * including the bulk releaseClaimsByBranch path and the stale-waiter skip.
 */

// DB-backed proof (ADR-0064): runs ONLY when STORYTREE_DB_NAME names a disposable test DB. The spine
// forces it (storytree_test) for the db:true proof; absent (the offline package suite) the test skips,
// so this file never touches production and never reds the offline gate.
const DB = process.env["STORYTREE_DB_NAME"];

test(
  "claim-grades-shared-vs-exclusive: two sessions explore one unit concurrently, the partial index still refuses a second work claim, and current() reads only the work holder",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");

      const store = new PgClaimStore(pool);
      const unit = "grades-unit";

      // Two sessions EXPLORING the same unit both acquire (shared rows on the composite PK).
      const a = await store.take({ unitId: unit, sessionId: "sess-A", branch: "claude/a", intent: "reading the spine", grade: "exploring" });
      const b = await store.take({ unitId: unit, sessionId: "sess-B", branch: "claude/b", intent: "planning", grade: "exploring" });
      assert.equal(a.acquired, true, "first exploring take acquires");
      assert.equal(b.acquired, true, "second exploring take acquires — exploring is SHARED");

      // No work holder yet: current() sees the exclusive slot, not the shared wisps.
      assert.equal(await store.current(unit), null, "current() is the WORK holder only");
      const all = await store.claimsFor(unit);
      assert.equal(all.length, 2, "claimsFor reads every grade");
      assert.deepEqual(all.map((c) => claimGrade(c)), ["exploring", "exploring"]);

      // A third session takes WORK — acquired alongside the shared rows (the partial index only
      // constrains grade='work').
      const c = await store.claim({ unitId: unit, sessionId: "sess-C", branch: "claude/c", intent: "real" });
      assert.equal(c.acquired, true, "the work slot is free despite two exploring rows");
      const holder = await store.current(unit);
      assert.equal(holder?.sessionId, "sess-C");
      assert.equal(holder === null ? undefined : claimGrade(holder), "work");

      // A FOURTH session's work claim is REFUSED (the real partial-index exclusivity).
      const d = await store.claim({ unitId: unit, sessionId: "sess-D", branch: "claude/d", intent: "real" });
      assert.equal(d.acquired, false, "second concurrent work claim refused");
      if (!d.acquired) assert.equal(d.heldBy.sessionId, "sess-C");

      // Re-take by an explorer refreshes re-entrantly (no duplicate row, same queue of rows).
      const a2 = await store.take({ unitId: unit, sessionId: "sess-A", branch: "claude/a", intent: "still reading", grade: "exploring" });
      assert.equal(a2.acquired, true);
      assert.equal((await store.claimsFor(unit)).length, 3, "re-take upserts — no duplicate rows");
    } finally {
      await closePool(pool, connector);
    }
  },
);

test(
  "claim-grades-upgrade-queue-promote: upgrade queues behind a live holder, release promotes the OLDEST live waiter by claimed_at (stale waiters skipped), audited end-to-end",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");

      const store = new PgClaimStore(pool);
      const unit = "promote-unit";

      // sess-A explores, then UPGRADES into the free slot: its exploring row becomes the work row.
      await store.take({ unitId: unit, sessionId: "sess-A", branch: "claude/a", intent: "scoping", grade: "exploring" });
      const up = await store.upgrade(unit, "sess-A");
      assert.equal(up.acquired, true, "upgrade takes the free work slot");
      const afterUpgrade = await store.claimsFor(unit);
      assert.equal(afterUpgrade.length, 1, "the exploring row BECAME the work row — one row for the session");
      assert.equal(afterUpgrade[0] === undefined ? undefined : claimGrade(afterUpgrade[0]), "work");

      // sess-B and sess-C upgrade behind the live holder → both QUEUE (waiting, shared).
      const qB = await store.upgrade(unit, "sess-B", { branch: "claude/b", intent: "edit" });
      assert.equal(qB.acquired, false);
      assert.ok("queued" in qB && qB.queued === true, "blocked upgrade queues instead of dead-ending");
      const qC = await store.upgrade(unit, "sess-C", { branch: "claude/c", intent: "edit" });
      assert.ok("queued" in qC && qC.queued === true);

      // Force a deterministic queue order: sess-B joined FIRST — backdate it a minute to make the
      // claimed_at ordering unambiguous even on a fast clock.
      await pool.query(
        "UPDATE events.node_claim SET claimed_at = now() - interval '1 minute' WHERE unit_id = $1 AND session_id = 'sess-B'",
        [unit],
      );

      // Release the work holder → the OLDEST live waiter (sess-B) is promoted atomically.
      assert.equal(await store.release(unit, "sess-A"), true);
      const promoted = await store.current(unit);
      assert.equal(promoted?.sessionId, "sess-B", "oldest waiter by claimed_at wins the freed slot");
      assert.equal(promoted === null ? undefined : claimGrade(promoted), "work");

      // sess-D queues fresh; make sess-C's heartbeat STALE (3h > the 2h clock) — a dead waiter
      // never wins promotion even though it queued earlier.
      const qD = await store.upgrade(unit, "sess-D", { branch: "claude/d", intent: "edit" });
      assert.ok("queued" in qD && qD.queued === true);
      await pool.query(
        "UPDATE events.node_claim SET heartbeat_at = now() - interval '3 hours' WHERE unit_id = $1 AND session_id = 'sess-C'",
        [unit],
      );

      // DOWNGRADE the holder (work→exploring) — the freed slot skips stale sess-C, promotes sess-D.
      assert.equal(await store.downgrade(unit, "sess-B", "exploring"), true);
      const promoted2 = await store.current(unit);
      assert.equal(promoted2?.sessionId, "sess-D", "stale waiter skipped; oldest LIVE waiter promoted");
      const bRow = (await store.claimsFor(unit)).find((r) => r.sessionId === "sess-B");
      assert.equal(bRow === undefined ? undefined : claimGrade(bRow), "exploring", "the downgraded row survives at the shared grade");

      // Releasing a SHARED row never promotes: drop sess-B's exploring row — sess-C stays waiting,
      // sess-D stays the holder.
      assert.equal(await store.release(unit, "sess-B"), true);
      assert.equal((await store.current(unit))?.sessionId, "sess-D");

      // The audit history carries every typed transition (ADR-0200 D2).
      const hist = await store.history(unit);
      for (const wanted of ["claimed", "upgraded", "queued", "released", "promoted", "downgraded"]) {
        assert.ok(hist.some((e) => e.type === wanted), `a '${wanted}' event was recorded`);
      }
    } finally {
      await closePool(pool, connector);
    }
  },
);

test(
  "claim-grades-branch-release-promotes: releaseClaimsByBranch frees a merged branch's work slot and promotes that unit's oldest live waiter in the same transaction",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");

      const store = new PgClaimStore(pool);
      const unit = "branch-promote-unit";

      // sess-A holds WORK on branch-x; sess-B waits behind it (branch-y); sess-C explores (branch-y).
      await store.claim({ unitId: unit, sessionId: "sess-A", branch: "claude/branch-x", intent: "real" });
      const q = await store.upgrade(unit, "sess-B", { branch: "claude/branch-y", intent: "edit" });
      assert.ok("queued" in q && q.queued === true, "sess-B queued behind the holder");
      await store.take({ unitId: unit, sessionId: "sess-C", branch: "claude/branch-y", intent: "watching", grade: "exploring" });

      // The CI merge clear of branch-x: the work row goes, and the waiter is promoted atomically.
      const count = await store.releaseClaimsByBranch("claude/branch-x");
      assert.equal(count, 1, "only branch-x's claim cleared");
      const holder = await store.current(unit);
      assert.equal(holder?.sessionId, "sess-B", "the branch release promoted the waiter");
      assert.equal(holder === null ? undefined : claimGrade(holder), "work");

      // The explorer is untouched; the audit trail shows released → promoted.
      const rows = await store.claimsFor(unit);
      assert.equal(rows.length, 2, "promoted work row + surviving exploring row");
      const hist = await store.history(unit);
      assert.ok(hist.some((e) => e.type === "released" && e.sessionId === "sess-A"));
      assert.ok(hist.some((e) => e.type === "promoted" && e.sessionId === "sess-B"));
    } finally {
      await closePool(pool, connector);
    }
  },
);
