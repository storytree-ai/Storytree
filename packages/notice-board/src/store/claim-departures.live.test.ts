import test from "node:test";
import assert from "node:assert/strict";
import { createTestPool, closePool, applySchema } from "@storytree/library/store";
import { foldDepartures, DEPARTURE_WINDOW_MS } from "../claim.js";
import { PgClaimStore } from "./claim-store.js";

/**
 * Live DB proof for the ADR-0200 D7 departure read (wisp-out legibility) — the pieces only real
 * Postgres can attest: the real `at` window bound over events.claim_event (a genuinely aged-out
 * release drops out; a wider window still sees it), the released-only filter against the other
 * event types the take/release cycle writes alongside, and the released doc round-tripping its
 * grade through jsonb into the pure fold.
 *
 * Run PER-FILE (the live-store suites truncate live tables):
 *   STORYTREE_DB_NAME=storytree_test node --test --test-force-exit src/store/claim-departures.live.test.ts
 */

// DB-backed proof (ADR-0064): runs ONLY when STORYTREE_DB_NAME names a disposable test DB. Absent
// (the offline package suite) the test skips, so this file never touches production and never reds
// the offline gate.
const DB = process.env["STORYTREE_DB_NAME"];

test(
  "claim-departures: a released claim surfaces inside the window (released-only, grade off the doc) and ages out past it",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");

      const store = new PgClaimStore(pool);
      const unit = "departures-unit";

      // Take then release — the release appends the 'released' claim_event this read surfaces.
      // The take's own 'claimed' event sits beside it, so the length-1 assertions below also prove
      // the released-only filter against real rows.
      const taken = await store.take({
        unitId: unit,
        sessionId: "sess-A",
        branch: "claude/a",
        intent: "scoping the departure read",
        grade: "exploring",
      });
      assert.equal(taken.acquired, true);
      assert.equal(await store.release(unit, "sess-A"), true);

      // Inside the window: exactly the one departure, carrying the released doc.
      const inside = await store.recentDepartures(DEPARTURE_WINDOW_MS);
      assert.equal(inside.length, 1, "the released event — and ONLY it — surfaces");
      assert.equal(inside[0]?.unitId, unit);
      assert.equal(inside[0]?.sessionId, "sess-A");

      // The pure fold reads the released grade off the jsonb doc.
      const folded = foldDepartures(inside, new Date());
      assert.equal(folded.length, 1);
      assert.equal(folded[0]?.grade, "exploring", "the departed wisp keeps its released grade");
      assert.equal(folded[0]?.unitId, unit);

      // Outside the window: backdate the event past the bound → excluded by the real SQL window…
      await pool.query(
        "UPDATE events.claim_event SET at = now() - interval '10 minutes' WHERE unit_id = $1",
        [unit],
      );
      const outside = await store.recentDepartures(DEPARTURE_WINDOW_MS);
      assert.deepEqual(outside, [], "an aged-out departure is no longer surfaced");

      // …while a wider window still sees it (the bound is the parameter, not a fixed literal).
      const wide = await store.recentDepartures(60 * 60 * 1_000);
      assert.equal(wide.length, 1);
      assert.equal(wide[0]?.unitId, unit);
    } finally {
      await closePool(pool, connector);
    }
  },
);
