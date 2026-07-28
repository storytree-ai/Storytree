// Red-green for the desktop's claim-row → map-activity fold (claim-activity.ts).
//
// THE RED this locks: the desktop's `/api/activity` claim payload dropped the ADR-0200 D7 `grade`
// (its SELECT never grew the column when the studio's did), so the frontend's `c.grade ?? 'work'`
// back-compat default fired for EVERY claim and an `exploring` / `waiting` session rendered as a full
// whole-island work orbit. Observed live: two wisps orbiting `cli` while the ledger held one `work`
// claim and one `exploring` claim. Both halves are pinned here — the fold must carry the grade
// through, and the SQL must actually select it.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAIM_ROW_COLUMNS,
  CLAIM_STALE_RECLAIM_MS,
  IN_FLIGHT_CLAIMS_SQL,
  claimRowsToActivity,
  type DesktopClaimRow,
} from "./claim-activity.js";

const NOW = new Date("2026-07-27T12:00:00.000Z");

/** A live row (heartbeat now) at `grade`, with `grade` omitted entirely when undefined. */
function row(unitId: string, sessionId: string, grade?: string | null): DesktopClaimRow {
  return {
    unit_id: unitId,
    session_id: sessionId,
    ...(grade === undefined ? {} : { grade }),
    branch: `claude/${sessionId}`,
    intent: "orchestrate",
    claimed_at: new Date(NOW.getTime() - 60_000),
    heartbeat_at: new Date(NOW.getTime() - 60_000),
  };
}

test("the SQL selects every column the fold reads — including the grade", () => {
  assert.ok(
    (CLAIM_ROW_COLUMNS as readonly string[]).includes("grade"),
    "grade must be read — without it every claim folds to `work` and hovers/queues render as orbits",
  );
  for (const column of CLAIM_ROW_COLUMNS) {
    assert.match(IN_FLIGHT_CLAIMS_SQL, new RegExp(`\\b${column}\\b`));
  }
  assert.match(IN_FLIGHT_CLAIMS_SQL, /FROM events\.node_claim/);
});

test("a shared-grade claim keeps its grade — exploring hovers, waiting queues", () => {
  const [exploring, waiting] = claimRowsToActivity(
    [row("cli", "gracious-rubin", "exploring"), row("cli", "busy-clarke", "waiting")],
    NOW,
  );
  assert.equal(exploring?.grade, "exploring");
  assert.equal(waiting?.grade, "waiting");
});

test("both shared rows on ONE unit survive the fold (the composite PK, ADR-0200 D2)", () => {
  const folded = claimRowsToActivity(
    [row("cli", "fervent-feistel", "work"), row("cli", "gracious-rubin", "exploring")],
    NOW,
  );
  assert.equal(folded.length, 2);
  assert.deepEqual(
    folded.map((c) => c.grade),
    ["work", "exploring"],
  );
  // One wisp per SESSION, never per unit — the map draws what the ledger holds.
  assert.deepEqual(
    folded.map((c) => c.sessionId),
    ["fervent-feistel", "gracious-rubin"],
  );
});

test("an absent / null / unrecognised grade normalises to work (ADR-0200 D2 back-compat)", () => {
  const folded = claimRowsToActivity(
    [row("library", "pre-grade"), row("library", "null-grade", null), row("library", "odd", "bloom")],
    NOW,
  );
  assert.deepEqual(
    folded.map((c) => c.grade),
    ["work", "work", "work"],
  );
});

test("every folded claim carries the §5 honesty-wall discriminator", () => {
  const [claim] = claimRowsToActivity([row("desktop", "sess", "exploring")], NOW);
  assert.equal(claim?.kind, "claim");
  assert.equal(claim?.unitId, "desktop");
  assert.equal(claim?.branch, "claude/sess");
  assert.equal(claim?.at, new Date(NOW.getTime() - 60_000).toISOString());
});

test("a claim whose heartbeat aged past the reclaim window is dropped (a crashed holder self-heals)", () => {
  const stale = row("desktop", "crashed", "work");
  stale.heartbeat_at = new Date(NOW.getTime() - CLAIM_STALE_RECLAIM_MS - 1_000);
  assert.deepEqual(claimRowsToActivity([stale], NOW), []);
  // Exactly at the window it is still live — the drop is strictly PAST the threshold.
  stale.heartbeat_at = new Date(NOW.getTime() - CLAIM_STALE_RECLAIM_MS);
  assert.equal(claimRowsToActivity([stale], NOW).length, 1);
});

test("string timestamps fold to ISO identically to Date ones", () => {
  const asStrings: DesktopClaimRow = {
    ...row("desktop", "strings", "waiting"),
    claimed_at: "2026-07-27T11:59:00.000Z",
    heartbeat_at: "2026-07-27T11:59:00.000Z",
  };
  const [claim] = claimRowsToActivity([asStrings], NOW);
  assert.equal(claim?.at, "2026-07-27T11:59:00.000Z");
  assert.equal(claim?.grade, "waiting");
});
