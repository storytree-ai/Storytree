import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFrictionDrain,
  DEFAULT_FRICTION_DRAIN_CONFIG,
  type FrictionWorklistItem,
  type FrictionDrainContext,
} from "./friction-drain.js";
import { lifecycleOf } from "./friction-lifecycle.js";

// The gate runs in some session S on branch `me` today. Its own just-filed items are dated today.
const CTX: FrictionDrainContext = { currentBranch: "me", currentDate: "2026-07-06" };
const N = DEFAULT_FRICTION_DRAIN_CONFIG.openCeiling; // 12
const M = DEFAULT_FRICTION_DRAIN_CONFIG.ageCeilingDays; // 21

/** A batch of open items from OTHER sessions, all dated `date` (default: recent, so age never trips). */
function otherOpen(count: number, date = "2026-07-05"): FrictionWorklistItem[] {
  return Array.from({ length: count }, (_v, i) => ({
    id: `other-${i}`,
    branch: `branch-${i}`,
    date,
  }));
}

test("lifecycleOf derives open/archived from route (ADR-0168 D2, collapsed by ADR-0196 D2)", () => {
  assert.equal(lifecycleOf(undefined), "open");
  assert.equal(lifecycleOf(""), "open");
  assert.equal(lifecycleOf(null), "open");
  assert.equal(lifecycleOf("nothing"), "archived");
  assert.equal(lifecycleOf("principle"), "archived");
  assert.equal(lifecycleOf("adr"), "archived");
  assert.equal(lifecycleOf("edit-existing"), "archived");
});

test("empty worklist is OK — nothing to drain", () => {
  const v = evaluateFrictionDrain([], CTX);
  assert.equal(v.level, "ok");
  assert.equal(v.total, 0);
  assert.equal(v.openCount, 0);
  assert.equal(v.routableCount, 0);
  assert.equal(v.oldestRoutableAgeDays, null);
  assert.deepEqual(v.breaches, []);
});

test("a small routable backlog below both floors is OK", () => {
  const v = evaluateFrictionDrain(otherOpen(3), CTX);
  assert.equal(v.level, "ok");
  assert.equal(v.openCount, 3);
  assert.equal(v.routableCount, 3);
});

test("archived (dealt-with) items never count toward open/routable", () => {
  const items: FrictionWorklistItem[] = [
    { id: "r1", branch: "b1", date: "2026-01-01", route: "principle" }, // dealt with (fix produced)
    { id: "a1", branch: "b2", date: "2026-01-01", route: "nothing" }, // dealt with (tombstone)
    ...otherOpen(2),
  ];
  const v = evaluateFrictionDrain(items, CTX);
  assert.equal(v.total, 4);
  assert.equal(v.archivedCount, 2);
  assert.equal(v.openCount, 2);
  assert.equal(v.routableCount, 2);
  // The old routed/archived items must NOT drag oldestRoutableAge — only the two recent opens count.
  assert.equal(v.level, "ok");
});

test("open routable count strictly above N reds the gate (fail-closed ceiling)", () => {
  const v = evaluateFrictionDrain(otherOpen(N + 1), CTX);
  assert.equal(v.level, "red");
  assert.equal(v.routableCount, N + 1);
  assert.equal(v.breaches.length, 1);
  assert.match(v.breaches[0]!, /exceeds the ceiling/);
});

test("open routable count exactly at N is a WARN, not a red (boundary is fail-closed above)", () => {
  const v = evaluateFrictionDrain(otherOpen(N), CTX);
  assert.equal(v.level, "warn");
  assert.equal(v.routableCount, N);
  assert.deepEqual(v.breaches, []);
  assert.equal(v.warnings.length, 1);
});

test("oldest routable item older than M days reds the gate (age axis)", () => {
  // One lone open item, filed 30 days ago by another session — count is fine, age is not.
  const v = evaluateFrictionDrain(
    [{ id: "stale", branch: "old-branch", date: "2026-06-06" }],
    CTX,
  );
  assert.equal(v.routableCount, 1); // well under N
  assert.equal(v.oldestRoutableAgeDays, 30);
  assert.equal(v.level, "red");
  assert.equal(v.breaches.length, 1);
  assert.match(v.breaches[0]!, /past the ceiling/);
  assert.equal(v.oldestRoutableId, "stale");
});

test("oldest routable item in the age warn band (≥ warnAtAgeDays, ≤ M) WARNs", () => {
  const days = DEFAULT_FRICTION_DRAIN_CONFIG.warnAtAgeDays; // 14
  const v = evaluateFrictionDrain(
    [{ id: "aging", branch: "old-branch", date: "2026-06-22" }], // 14 days before 2026-07-06
    CTX,
  );
  assert.equal(v.oldestRoutableAgeDays, days);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
});

test("the count warn band (warnAtOpen ≤ routable < N) WARNs", () => {
  const v = evaluateFrictionDrain(otherOpen(DEFAULT_FRICTION_DRAIN_CONFIG.warnAtOpen), CTX);
  assert.equal(v.level, "warn");
  assert.equal(v.routableCount, DEFAULT_FRICTION_DRAIN_CONFIG.warnAtOpen);
});

test("a filer's OWN same-session items are NOT counted as routable (no marking your own homework)", () => {
  // 20 open items, all filed by the CURRENT session/branch today — way past N, but none adjudicable.
  const own: FrictionWorklistItem[] = Array.from({ length: 20 }, (_v, i) => ({
    id: `mine-${i}`,
    branch: CTX.currentBranch,
    date: CTX.currentDate,
  }));
  const v = evaluateFrictionDrain(own, CTX);
  assert.equal(v.openCount, 20); // they ARE open...
  assert.equal(v.routableCount, 0); // ...but none are routable by their own filer
  assert.equal(v.oldestRoutableAgeDays, null);
  assert.equal(v.level, "ok"); // so the ceiling is NOT tripped
});

test("only OTHER sessions' items count toward the ceiling when own + other are mixed", () => {
  const items: FrictionWorklistItem[] = [
    // N+1 of the current session's own items — must be ignored for the ceiling.
    ...Array.from({ length: N + 1 }, (_v, i) => ({
      id: `mine-${i}`,
      branch: CTX.currentBranch,
      date: CTX.currentDate,
    })),
    // 5 from other sessions — under N, so OK overall.
    ...otherOpen(5),
  ];
  const v = evaluateFrictionDrain(items, CTX);
  assert.equal(v.openCount, N + 1 + 5);
  assert.equal(v.routableCount, 5);
  assert.equal(v.level, "ok");
});

test("unattributed open items (no branch) count as routable backlog", () => {
  // A doc filed before provenance existed: no branch, no date. It is other-session backlog pressure.
  const v = evaluateFrictionDrain(
    Array.from({ length: N + 1 }, (_v, i) => ({ id: `legacy-${i}` })),
    CTX,
  );
  assert.equal(v.routableCount, N + 1);
  assert.equal(v.oldestRoutableAgeDays, null); // no dates to age
  assert.equal(v.level, "red"); // count axis still fires
});

test("a future-dated item is floored to 0 age, never negative", () => {
  const v = evaluateFrictionDrain(
    [{ id: "future", branch: "b", date: "2099-01-01" }],
    CTX,
  );
  assert.equal(v.oldestRoutableAgeDays, 0);
  assert.equal(v.level, "ok");
});
