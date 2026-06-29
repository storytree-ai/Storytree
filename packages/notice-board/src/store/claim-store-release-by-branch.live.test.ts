import test from "node:test";
import assert from "node:assert/strict";
import { createTestPool, closePool, applySchema } from "@storytree/library/store";
import { PgClaimStore } from "./claim-store.js";

/**
 * Live DB proof for PgClaimStore.releaseClaimsByBranch (A1 of the claim-store work-time extension).
 *
 * Seeds two claims on one branch and one claim on a second branch, then asserts:
 *   - releaseClaimsByBranch(branch) returns the count of released claims (2)
 *   - the released branch's node_claim rows are gone
 *   - the surviving branch's claim is untouched
 *   - exactly one 'released' claim_event row was appended per cleared claim
 *
 * Requires STORYTREE_DB_NAME (a disposable test DB, e.g. storytree_test).
 */
test(
  "PgClaimStore.releaseClaimsByBranch: bulk-releases all claims on a branch, leaves other branches intact, appends one released audit event per claim",
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");

      const store = new PgClaimStore(pool);
      const branchX = "claude/branch-x";
      const branchY = "claude/branch-y";

      // Seed: two claims on branchX (the branch to bulk-release), one on branchY (the survivor).
      await store.claim({ unitId: "unit-alpha", sessionId: "sess-A", branch: branchX, intent: "real" });
      await store.claim({ unitId: "unit-beta", sessionId: "sess-B", branch: branchX, intent: "real" });
      await store.claim({ unitId: "unit-gamma", sessionId: "sess-C", branch: branchY, intent: "real" });

      // Verify seeded state so a seeding defect is distinguishable from the method-under-test defect.
      const before = await pool.query("SELECT unit_id FROM events.node_claim ORDER BY unit_id");
      assert.equal(before.rows.length, 3, "three claims seeded across two branches");

      // The method under test: bulk-release all claims on branchX.
      // cast to any: releaseClaimsByBranch is the new method under test, not yet on PgClaimStore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = (await (store as any).releaseClaimsByBranch(branchX)) as number;
      assert.equal(count, 2, "released count equals the number of seeded claims on branchX");

      // branchX's node_claim rows are gone.
      const gone = await pool.query(
        "SELECT unit_id FROM events.node_claim WHERE branch = $1",
        [branchX],
      );
      assert.equal(gone.rows.length, 0, "no node_claim rows remain for branchX after bulk release");

      // branchY's claim is untouched.
      const alive = await pool.query(
        "SELECT unit_id FROM events.node_claim WHERE branch = $1",
        [branchY],
      );
      assert.equal(alive.rows.length, 1, "branchY claim survives the bulk release");

      // Exactly one 'released' audit event per cleared claim was appended to claim_event.
      const releasedEvents = await pool.query(
        "SELECT type FROM events.claim_event WHERE type = 'released' ORDER BY seq",
      );
      assert.equal(
        releasedEvents.rows.length,
        2,
        "two released audit events appended, one per cleared claim on branchX",
      );
    } finally {
      await closePool(pool, connector);
    }
  },
);
