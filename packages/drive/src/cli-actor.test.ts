import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IN_FLIGHT_WINDOW_DAYS as W,
  selectInFlightBranches,
  type BranchRef,
} from "./cli-actor.js";

// The branch-liveness age rule (ADR-0371). `inFlightBranches()` shells out to git; the part with a
// JUDGEMENT in it — how recently a branch must have moved for its session to count as still in
// flight — is split out here so it is provable without a repo.
//
// Everything below is dated against the machine sweep the constant was baselined on (2026-08-14).
const TODAY = "2026-08-14";

/** A branch whose tip commit is `days` before {@link TODAY}. */
function ref(name: string, days: number): BranchRef {
  return {
    name,
    committedOn: new Date(Date.parse(TODAY) - days * 86_400_000).toISOString().slice(0, 10),
  };
}

test("inflight-recent-is-live: an unmerged branch touched today is in flight", () => {
  const live = selectInFlightBranches([ref("claude/working-now", 0)], TODAY);
  assert.deepEqual([...live], ["claude/working-now"]);
});

test("inflight-abandoned-ages-out: an old unmerged branch is NOT in flight — the hole is bounded", () => {
  // THE MEASUREMENT THAT FORCED THE AGE BOUND. On the authoring machine 2026-08-14 there were 810
  // local branches, 88 unmerged into `origin/main`, but only 5 touched that day — the next-most-recent
  // was FIVE DAYS older. An unbounded "unmerged ⇒ in flight" rule would therefore have permanently
  // excused memories written from branches abandoned two months ago, which is under-counting a
  // backlog the ceiling exists to BOUND. The abandoned ones must age out and become chargeable.
  const refs = [
    ref("claude/working-now", 0),
    ref("claude/also-today", 0),
    ref("claude/abandoned-5d", 5),
    ref("claude/abandoned-3w", 21),
    ref("claude/abandoned-2mo", 62),
  ];
  const live = selectInFlightBranches(refs, TODAY);
  assert.deepEqual([...live].sort(), ["claude/also-today", "claude/working-now"]);
  assert.equal(live.has("claude/abandoned-2mo"), false, "an abandoned branch is charged, never excused");
});

test("inflight-window-boundary: the window is inclusive, and one day past it is out", () => {
  assert.equal(selectInFlightBranches([ref("edge", W)], TODAY).has("edge"), true);
  assert.equal(selectInFlightBranches([ref("past", W + 1)], TODAY).has("past"), false);
});

test("inflight-window-sits-in-the-measured-gap: 1d and 2d select the same set on the sweep data", () => {
  // Why the constant is not knife-edged: on the real distribution the nearest neighbour to "today"
  // was five days away, so tightening or loosening by a day changes nothing. The constant is
  // baselined on a sweep, in the `DEFAULT_GRADUATION_DRAIN_CONFIG` posture — not picked to fit.
  const refs = [ref("a", 0), ref("b", 0), ref("c", 5), ref("d", 21)];
  const atOne = selectInFlightBranches(refs, TODAY, 1);
  const atTwo = selectInFlightBranches(refs, TODAY, 2);
  assert.deepEqual([...atOne].sort(), [...atTwo].sort());
  assert.deepEqual([...atTwo].sort(), ["a", "b"]);
});

test("inflight-unparseable-date-is-charged: a ref this cannot date is excluded, never excused", () => {
  const live = selectInFlightBranches(
    [{ name: "undateable", committedOn: "not-a-date" }, ref("fine", 0)],
    TODAY,
  );
  assert.equal(live.has("undateable"), false);
  assert.equal(live.has("fine"), true);
});

test("inflight-future-date-is-live: clock skew reads as in flight, not as an error", () => {
  // A ref dated after today has a negative age. Charging a branch demonstrably NEWER than today would
  // be the surprising direction, so it stays in flight.
  assert.equal(selectInFlightBranches([ref("skewed", -3)], TODAY).has("skewed"), true);
});

test("inflight-bad-current-date-disables-the-exclusion: fail-closed to charging everything", () => {
  // If the clock cannot be read, nothing is excluded and the whole queue is charged — the
  // pre-ADR-0371 behaviour, and the safe direction for a ceiling that bounds a backlog.
  assert.equal(selectInFlightBranches([ref("a", 0), ref("b", 0)], "nonsense").size, 0);
});

test("inflight-empty-input-is-empty: no unmerged branches means no exclusion", () => {
  assert.equal(selectInFlightBranches([], TODAY).size, 0);
});
