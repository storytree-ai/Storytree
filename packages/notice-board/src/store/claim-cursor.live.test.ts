import test from "node:test";
import assert from "node:assert/strict";
import { createTestPool, closePool, applySchema } from "@storytree/library/store";
import { PgClaimStore } from "./claim-store.js";

/**
 * Live DB proof for the ADR-0200 D4 cursor-once delta read — the pieces only real Postgres can
 * attest: the real BIGSERIAL seq window over events.claim_event, the events.claim_cursor row's
 * atomic advance-with-delivery (a second pull is genuinely silent), the first-read self-baseline
 * against real backlog, and the own-live-units intersection over real node_claim rows.
 *
 * Run PER-FILE (the live-store suites truncate live tables):
 *   STORYTREE_DB_NAME=storytree_test node --test --test-force-exit src/store/claim-cursor.live.test.ts
 */

// DB-backed proof (ADR-0064): runs ONLY when STORYTREE_DB_NAME names a disposable test DB. Absent
// (the offline package suite) the test skips, so this file never touches production and never reds
// the offline gate.
const DB = process.env["STORYTREE_DB_NAME"];

test(
  "claim-cursor-once: first read baselines silently over backlog; a foreign event on a held unit fires ONCE; own events and unheld units never deliver",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");
      await pool.query("TRUNCATE events.claim_cursor");

      const store = new PgClaimStore(pool);

      // Backlog BEFORE sess-me exists: another session explores the unit sess-me will hold.
      await store.take({ unitId: "cursor-unit", sessionId: "sess-old", branch: "claude/old", intent: "pre-history", grade: "exploring" });

      // sess-me claims its unit — its OWN take writes a claim_event too.
      await store.take({ unitId: "cursor-unit", sessionId: "sess-me", branch: "claude/me", intent: "driving inc 4", grade: "exploring" });

      // FIRST pull: self-baseline — the backlog (including sess-old's event) is history, not news.
      const first = await store.pullOverlapDeltas("sess-me");
      assert.deepEqual(first, [], "first read returns empty — never the backlog");

      // Events after the baseline: a foreign event on the HELD unit, sess-me's OWN event, and a
      // foreign event on a unit sess-me does NOT hold.
      await store.take({ unitId: "cursor-unit", sessionId: "sess-b", branch: "claude/b", intent: "also curious", grade: "exploring" });
      await store.take({ unitId: "cursor-unit", sessionId: "sess-me", branch: "claude/me", intent: "refreshing", grade: "exploring" });
      await store.take({ unitId: "other-unit", sessionId: "sess-b", branch: "claude/b", intent: "elsewhere", grade: "exploring" });

      const second = await store.pullOverlapDeltas("sess-me");
      assert.equal(second.length, 1, "exactly the one foreign event on the held unit");
      assert.equal(second[0]?.sessionId, "sess-b");
      assert.equal(second[0]?.unitId, "cursor-unit");
      assert.equal(second[0]?.type, "claimed");
      assert.equal(second[0]?.grade, "exploring");
      assert.equal(second[0]?.intent, "also curious");

      // Cursor-once: the SAME pull repeated is silent — the cursor advanced with the delivery.
      const third = await store.pullOverlapDeltas("sess-me");
      assert.deepEqual(third, [], "delivered ONCE — a repeat pull is silent");

      // A genuinely NEW event on the held unit speaks again (release fires one line).
      await store.release("cursor-unit", "sess-b");
      const fourth = await store.pullOverlapDeltas("sess-me");
      assert.equal(fourth.length, 1);
      assert.equal(fourth[0]?.type, "released");
    } finally {
      await closePool(pool, connector);
    }
  },
);

test(
  "claim-cursor-baseline: baselineCursor at session birth swallows the current overlap snapshot; a released unit drops out of the intersection",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");
      await pool.query("TRUNCATE events.claim_cursor");

      const store = new PgClaimStore(pool);

      // The worktree-create shape: claims taken for the minted session, others already present.
      await store.take({ unitId: "unit-x", sessionId: "sess-other", branch: "claude/o", intent: "already here", grade: "exploring" });
      await store.take({ unitId: "unit-x", sessionId: "minted-sess", branch: "claude/m", intent: "born claimed", grade: "exploring" });
      await store.take({ unitId: "unit-y", sessionId: "minted-sess", branch: "claude/m", intent: "born claimed", grade: "exploring" });
      await store.baselineCursor("minted-sess");

      // The snapshot rows never re-fire as deltas.
      assert.deepEqual(await store.pullOverlapDeltas("minted-sess"), [], "birth snapshot is baselined away");

      // minted-sess releases unit-y, then a foreign event lands on it — no longer news.
      await store.release("unit-y", "minted-sess");
      await store.take({ unitId: "unit-y", sessionId: "sess-other", branch: "claude/o", intent: "moving in", grade: "exploring" });
      // …while a foreign event on the still-held unit-x IS news.
      await store.take({ unitId: "unit-x", sessionId: "sess-third", branch: "claude/t", intent: "late arrival", grade: "exploring" });

      const deltas = await store.pullOverlapDeltas("minted-sess");
      assert.equal(deltas.length, 1, "only the held unit's event delivers");
      assert.equal(deltas[0]?.unitId, "unit-x");
      assert.equal(deltas[0]?.sessionId, "sess-third");
    } finally {
      await closePool(pool, connector);
    }
  },
);
