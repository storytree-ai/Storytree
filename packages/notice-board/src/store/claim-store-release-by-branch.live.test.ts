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
 */

// DB-backed proof (ADR-0064): runs ONLY when STORYTREE_DB_NAME names a disposable test DB. The spine
// forces it (storytree_test) for the db:true proof; absent (the offline package suite) the test skips,
// so this file never touches production and never reds the offline gate.
const DB = process.env["STORYTREE_DB_NAME"];

// Names the contract id as the leading token (ADR-0122/0126 coverage convention) so the
// check:coverage sweep — which scans only this real testFile — credits the contract this live proof
// actually attests. The A2/A3 contracts are pure and proven in the offline @storytree/notice-board
// suite (claim.test.ts / claim-store.test.ts), outside this DB-gated file by design.
test(
  "release-claims-by-branch-clears-the-branch: PgClaimStore.releaseClaimsByBranch bulk-releases all claims on a branch, leaves other branches intact, appends one released audit event per claim",
  { skip: !DB },
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
      const count = await store.releaseClaimsByBranch(branchX);
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

/**
 * The IDEMPOTENCE the merge-queue fix rests on (ADR-0345 D4 / ADR-0304 D3), against the real store
 * rather than a fake. Two callers now release a merged branch — ci.yml's automerge job and
 * claim-release.yml — and a queue merge can be seen by both. Proves the second release is a clean
 * no-op AND, the sharper property, that it cannot disturb the waiter the FIRST release promoted:
 * that session now holds the unit on ITS OWN branch, and a release keyed on the merged branch must
 * leave it alone. Getting this wrong would silently hand a unit to nobody.
 */
test(
  "release-claims-by-branch-clears-the-branch: a SECOND releaseClaimsByBranch for the same branch is a no-op that leaves the promoted waiter intact",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");

      const store = new PgClaimStore(pool);
      const merged = "claude/merged-branch";
      const waiting = "claude/still-working";

      // The merged branch holds the unit; a second session is REFUSED and joins the waiting line
      // in the same transaction (ADR-0346 D1's binding fence, via queueOnRefusal).
      await store.claim({ unitId: "unit-alpha", sessionId: "sess-A", branch: merged, intent: "real" });
      const queued = await store.claim(
        { unitId: "unit-alpha", sessionId: "sess-B", branch: waiting, intent: "real" },
        { queueOnRefusal: true },
      );
      assert.equal(queued.acquired, false, "the second session is refused — the fence binds");
      assert.ok(
        "queued" in queued && queued.queued,
        "and lands in the waiting line rather than dead-ending",
      );

      const first = await store.releaseClaimsByBranch(merged);
      assert.equal(first, 1, "the first release clears the merged branch's claim");

      // The store promotes the oldest live waiter in the same transaction.
      const promoted = await pool.query(
        "SELECT branch, grade FROM events.node_claim WHERE unit_id = 'unit-alpha'",
      );
      assert.equal(promoted.rows.length, 1, "exactly one claim remains on the unit");
      assert.equal(promoted.rows[0].branch, waiting, "it is the waiter's own branch");
      assert.equal(promoted.rows[0].grade, "work", "and it was promoted to work");

      // The second caller fires for the same merge.
      const second = await store.releaseClaimsByBranch(merged);
      assert.equal(second, 0, "the second release finds nothing — a clean no-op");

      const after = await pool.query(
        "SELECT branch, grade FROM events.node_claim WHERE unit_id = 'unit-alpha'",
      );
      assert.equal(after.rows.length, 1, "the promoted session STILL holds the unit");
      assert.equal(after.rows[0].branch, waiting, "the double release did not touch it");
      assert.equal(after.rows[0].grade, "work", "and did not demote it");

      // No phantom audit rows: exactly one release happened, so exactly one 'released' event exists.
      const releasedEvents = await pool.query(
        "SELECT type FROM events.claim_event WHERE type = 'released'",
      );
      assert.equal(
        releasedEvents.rows.length,
        1,
        "the no-op appended no second 'released' audit event",
      );
    } finally {
      await closePool(pool, connector);
    }
  },
);
