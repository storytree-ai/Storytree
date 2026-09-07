import test from "node:test";
import assert from "node:assert/strict";
import { createTestPool, closePool, applySchema } from "@storytree/library/store";
import { PgClaimStore } from "./claim-store.js";

/**
 * Live DB proof for `PgClaimStore.stampBranchActivity` — ADR-0535 D2's NARROW CI half.
 *
 * ⚠ THIS FILE EXISTS BECAUSE THE OFFLINE SUITE STRUCTURALLY CANNOT DO ITS JOB. The fake client in
 * `claim-store.test.ts` records statement text and routes on `text.includes(...)`; it never PARSES
 * a statement, so an invalid one passes every offline assertion. Its sibling `stampActivity` was
 * green across 172 offline tests and then refused outright on its first live run with
 * `column reference "session_id" is ambiguous`. This statement is one relation-column over — an
 * `UPDATE … FROM` where BOTH relations carry `branch` — so it is the same trap, reloaded. A new
 * statement SHAPE here (a join, `UPDATE … FROM`, a CTE, `unnest`) is unproven until it has run
 * against a real Postgres once.
 *
 * The three properties nothing offline can reach:
 *   - the statement is VALID and executes at all;
 *   - `observed > heartbeat_at` really refuses a backwards move, evaluated by Postgres;
 *   - `LEAST(observed, now())` really CAPS a reading ahead of the database's clock instead of
 *     dropping it — the fence that a `<= now()` ceiling got exactly backwards, silently, because
 *     this box runs ~10 s ahead of Cloud SQL.
 */

// DB-backed proof (ADR-0064): runs ONLY when STORYTREE_DB_NAME names a disposable test DB, so it
// never touches production and never reds the offline gate.
//
// ⚠ REGISTERED THROUGH THE `if (LIVE) … else` IDIOM, NOT `test(name, { skip: !DB }, fn)`, AND THE
// DIFFERENCE IS NOT COSMETIC. `analyzeObservedTests` — the classifier `check:coverage` reads —
// parses only the `.skip`/`.todo` MODIFIER and a LITERAL options skip, so an options form computed
// from an env var reports this test as RUNNING AND SUBSTANTIVELY ASSERTING when it did neither.
// A proof that cannot fail is not a proof (ADR-0211/0249), and the worse half is that nothing
// static could tell. `check:verification-decay`'s `vacuous-proof` instrument locates exactly this
// and its ceiling is the count of files that still have it; the honest move is to make the skip
// VISIBLE rather than to raise the number.
const DB = process.env["STORYTREE_DB_NAME"];

const proveBranchStamp = async (): Promise<void> => {
  const { pool, connector } = await createTestPool();
  try {
    await applySchema(pool);
    await pool.query("TRUNCATE events.node_claim");
    await pool.query("TRUNCATE events.claim_event");

    const store = new PgClaimStore(pool);
    const observed = "claude/observed-branch";
    const other = "claude/other-branch";

    // TWO SESSIONS ON ONE BRANCH is the case the branch key exists for and the session key
    // cannot express: a `--real` promotion build and its launching session both write from one
    // branch, and CI sees the branch, not either session.
    await store.claim({ unitId: "unit-alpha", sessionId: "sess-A", branch: observed, intent: "real" });
    await store.claim({ unitId: "unit-beta", sessionId: "sess-B", branch: observed, intent: "real" });
    await store.claim({ unitId: "unit-gamma", sessionId: "sess-C", branch: other, intent: "real" });

    // Age every claim so there is room to move forward. Done through SQL rather than by waiting:
    // `claim()` stamps `heartbeat_at` at `now()`, and a test that cannot age a row can only ever
    // prove the no-op branch.
    await pool.query("UPDATE events.node_claim SET heartbeat_at = now() - interval '90 minutes'");
    const aged = await pool.query<{ branch: string; heartbeat_at: Date }>(
      "SELECT branch, heartbeat_at FROM events.node_claim ORDER BY unit_id",
    );
    assert.equal(aged.rows.length, 3, "precondition: three claims seeded across two branches");

    const eventsBefore = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM events.claim_event",
    );

    // ── The statement under test. If it is invalid SQL, this line throws. ──
    const observedAt = new Date(Date.now() - 60_000).toISOString(); // a minute ago: past, but newer
    const moved = await store.stampBranchActivity([{ branch: observed, observedAt }]);

    assert.equal(moved, 2, "both claims on the observed branch moved forward — keyed on branch, not session");

    const after = await pool.query<{ unit_id: string; branch: string; heartbeat_at: Date }>(
      "SELECT unit_id, branch, heartbeat_at FROM events.node_claim ORDER BY unit_id",
    );
    const byUnit = new Map(after.rows.map((r) => [r.unit_id, r]));
    const alpha = byUnit.get("unit-alpha");
    const gamma = byUnit.get("unit-gamma");
    assert.ok(alpha !== undefined && gamma !== undefined, "all three rows survive a stamp");
    assert.equal(
      alpha.heartbeat_at.toISOString(),
      observedAt,
      "the observed moment is written verbatim — not now(), not the old value",
    );
    assert.ok(
      Date.now() - gamma.heartbeat_at.getTime() > 60 * 60_000,
      "a branch nobody observed keeps its old heartbeat — the join really is branch-scoped",
    );

    // MONOTONIC, EVALUATED BY POSTGRES. An observed reading is a reading of the PAST, so without
    // `observed > heartbeat_at` a stale reading would age a live claim into the takeover window.
    const backwards = await store.stampBranchActivity([
      { branch: observed, observedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString() },
    ]);
    assert.equal(backwards, 0, "an OLDER reading moves nothing");
    const unmoved = await pool.query<{ heartbeat_at: Date }>(
      "SELECT heartbeat_at FROM events.node_claim WHERE unit_id = 'unit-alpha'",
    );
    assert.equal(
      unmoved.rows[0]?.heartbeat_at.toISOString(),
      observedAt,
      "and leaves the value it could not beat exactly as it was",
    );

    // SKEW-PROOF, AND THIS IS THE ASSERTION THE FIRST VERSION FAILED IN PRODUCTION. Shipped as
    // `AND v.observed <= now()`, this statement silently wrote NOTHING from a machine whose clock
    // ran ~10 s ahead of Cloud SQL: the observation is taken before the connector handshake, so
    // whether it landed depended on whether the handshake outlasted the skew. Three consecutive
    // real runs corroborated two branches and moved zero claims, reporting success each time —
    // the exact silent-writer defect this arc exists to end. `LEAST(observed, now())` caps at the
    // DATABASE's present, so a reading ahead of it still lands and lands bounded.
    const skewed = await store.stampBranchActivity([
      { branch: observed, observedAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString() },
    ]);
    assert.equal(skewed, 2, "a reading ahead of the database's clock still corroborates");
    const clamped = await pool.query<{ heartbeat_at: Date; ahead: boolean }>(
      "SELECT heartbeat_at, heartbeat_at > now() AS ahead FROM events.node_claim WHERE unit_id = 'unit-alpha'",
    );
    assert.equal(
      clamped.rows[0]?.ahead,
      false,
      "and is CAPPED at the database's present — never a heartbeat that outlives the staleness window",
    );

    // A branch nobody claims is a clean no-op — the ordinary case on most pushes.
    assert.equal(
      await store.stampBranchActivity([
        { branch: "claude/nobody-claims-this", observedAt: new Date().toISOString() },
      ]),
      0,
      "an unclaimed branch writes nothing and does not fail",
    );

    const eventsAfter = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM events.claim_event",
    );
    assert.equal(
      eventsAfter.rows[0]?.n,
      eventsBefore.rows[0]?.n,
      "a liveness reading is not a state transition — no claim_event is appended",
    );
  } finally {
    await closePool(pool, connector);
  }
};

if (DB) {
  test(
    "narrow-ci-corroboration-stamps-the-branch: stampBranchActivity moves every claim on the observed branches forward, leaves other branches alone, and refuses both a backwards reading and one ahead of the database's clock",
    proveBranchStamp,
  );
} else {
  test(
    "narrow-ci-corroboration-stamps-the-branch (skipped: set STORYTREE_DB_NAME to a disposable database to run)",
    { skip: true },
    () => {
      // A visible placeholder, so the default test output SAYS this proof did not run. The offline
      // suite pins the statement's TEXT (`claim-store.test.ts`); only the run above witnesses
      // whether Postgres will accept it — which is the whole reason this file exists.
    },
  );
}
