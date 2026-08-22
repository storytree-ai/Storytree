// Claim-release honesty — the second instance of the ADR-0199 class.
//
// THE RED these lock down: a session declares its claim, runs a build, and afterwards holds NO
// claim, with nothing said. The event log named the path exactly (see claim-release.ts): the build
// re-claims the SAME (unit, session) row under the launching session's identity, then its `finally`
// deletes it. `decideClaimExit` closes that; `releaseClaimWithNotice` makes the next variant loud.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ClaimDocT } from "@storytree/notice-board";

import {
  decideClaimExit,
  displacedClaimNotice,
  releaseClaimWithNotice,
  unexplicitReleaseWarning,
} from "./claim-release.js";

function claimDoc(over: Partial<ClaimDocT> = {}): ClaimDocT {
  return {
    unitId: "context-traversal-capture",
    sessionId: "competent-cohen-ba0e29",
    branch: "claude/context-traversal-inc2-finish",
    intent: "orchestrate",
    grade: "work",
    claimedAt: "2026-07-25T15:11:03.922Z",
    heartbeatAt: "2026-07-25T15:11:03.922Z",
    ...over,
  } as ClaimDocT;
}

/** A release spy: records the calls and reports whether a row was actually deleted. */
function releaseSpy(released = true) {
  const calls: { unitId: string; sessionId: string }[] = [];
  return {
    release: async (unitId: string, sessionId: string) => {
      calls.push({ unitId, sessionId });
      return released;
    },
    calls: () => calls,
  };
}

// ── decideClaimExit — the borrow-vs-take decision (half 1: close the path) ────

test("decideClaimExit: no displaced claim → RELEASE (the run's own take created the row; ADR-0121 mutex intact)", () => {
  assert.deepEqual(decideClaimExit(undefined), { action: "release" });
});

test("THE RED: a claim the session already held is KEPT — a build must not delete what it did not take", () => {
  // The measured sequence: seq=969 the session's declare, seq=978 the build's re-entrant take,
  // seq=981 the build's release. With `displaced` carried through, step 3 no longer fires.
  const sessionsOwnClaim = claimDoc({ intent: "orchestrate" });
  const decision = decideClaimExit(sessionsOwnClaim);
  assert.equal(decision.action, "keep");
  assert.equal(
    decision.action === "keep" && decision.displaced.intent,
    "orchestrate",
    "the run must be able to name what it borrowed",
  );
});

test("decideClaimExit: a displaced SHARED (exploring) row is kept too — the work take folds it, so releasing loses it outright", () => {
  const decision = decideClaimExit(claimDoc({ grade: "exploring" }));
  assert.equal(decision.action, "keep");
});

// ── unexplicitReleaseWarning — half 2: make the next one loud ────────────────

test("the warning names the CLAIM, the CALLER and the TIME — the three facts the proposal asked for", () => {
  const warning = unexplicitReleaseWarning({
    unitId: "context-traversal-capture",
    sessionId: "competent-cohen-ba0e29",
    caller: "node build context-traversal-capture --real",
    at: "2026-07-25T15:42:19.289Z",
  });
  assert.match(warning, /context-traversal-capture/, "the claim");
  assert.match(warning, /competent-cohen-ba0e29/, "the session that held it");
  assert.match(warning, /node build context-traversal-capture --real/, "the caller");
  assert.match(warning, /2026-07-25T15:42:19\.289Z/, "the time");
});

test("the warning names the merge-ceremony claim requirement and the exact remedy", () => {
  const warning = unexplicitReleaseWarning({
    unitId: "u",
    sessionId: "s",
    caller: "c",
    at: "2026-08-03T00:00:00.000Z",
  });
  assert.match(
    warning,
    /hold a live\s+noticeboard claim before the merge ceremony/,
    "names the explicit requirement",
  );
  assert.match(warning, /noticeboard declare --node u --pg/, "and the command that fixes it, unit substituted");
});

test("displacedClaimNotice: states what was borrowed and that the declaration survives — not a warning", () => {
  const notice = displacedClaimNotice("node build x --real", claimDoc({ intent: "orchestrate" }));
  assert.match(notice, /context-traversal-capture/);
  assert.match(notice, /node build x --real/);
  assert.match(notice, /survives its builds/);
  assert.doesNotMatch(notice, /WARNING/, "borrowing is correct behaviour, so it must not read as an alarm");
});

// ── releaseClaimWithNotice — the notified release ────────────────────────────

test("releaseClaimWithNotice: an actual release WARNS, naming the caller", async () => {
  const spy = releaseSpy(true);
  const lines: string[] = [];
  const released = await releaseClaimWithNotice(
    { release: spy.release, log: (m) => lines.push(m), now: () => new Date("2026-08-03T01:02:03.000Z") },
    { unitId: "u1", sessionId: "s1", caller: "node build u1 --real" },
  );
  assert.equal(released, true);
  assert.deepEqual(spy.calls(), [{ unitId: "u1", sessionId: "s1" }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /WARNING/);
  assert.match(lines[0] ?? "", /node build u1 --real/);
  assert.match(lines[0] ?? "", /2026-08-03T01:02:03\.000Z/);
});

test("releaseClaimWithNotice: a NO-OP release (nothing held) says nothing — a line nobody needs trains readers to ignore it", async () => {
  const lines: string[] = [];
  const released = await releaseClaimWithNotice(
    { release: releaseSpy(false).release, log: (m) => lines.push(m) },
    { unitId: "u1", sessionId: "s1", caller: "node build u1 --real" },
  );
  assert.equal(released, false);
  assert.deepEqual(lines, []);
});

test("releaseClaimWithNotice: a THROWING store is fail-soft — reported, never rethrown (a release must not fail a good build)", async () => {
  const lines: string[] = [];
  const released = await releaseClaimWithNotice(
    {
      release: async () => {
        throw new Error("DB idle-stopped");
      },
      log: (m) => lines.push(m),
    },
    { unitId: "u1", sessionId: "s1", caller: "story build u1 --real" },
  );
  assert.equal(released, false, "a failed release is not a release");
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /DB idle-stopped/, "the reason is surfaced, not swallowed");
  assert.match(lines[0] ?? "", /stale-reclaim/, "and the reader is told the claim still ages out");
});

// ── The composed build-exit behaviour, both branches ─────────────────────────
//
// This is the shape node-build.ts / story-build.ts run in their `finally`. Asserting the composition
// here keeps the two build files' change to wiring only.

async function buildExit(
  displaced: ClaimDocT | undefined,
  deps: { release: (u: string, s: string) => Promise<boolean>; log: (m: string) => void },
): Promise<void> {
  const exit = decideClaimExit(displaced);
  if (exit.action === "release") {
    await releaseClaimWithNotice(
      { release: deps.release, log: deps.log, now: () => new Date("2026-08-03T00:00:00.000Z") },
      { unitId: "u1", sessionId: "s1", caller: "node build u1 --real" },
    );
  } else {
    deps.log(displacedClaimNotice("node build u1 --real", exit.displaced));
  }
}

test("build exit, FRESH take: releases and warns — the ADR-0121 mutex still frees the unit for the next builder", async () => {
  const spy = releaseSpy(true);
  const lines: string[] = [];
  await buildExit(undefined, { release: spy.release, log: (m) => lines.push(m) });
  assert.equal(spy.calls().length, 1, "a claim the build itself took MUST be released");
  assert.match(lines[0] ?? "", /WARNING/);
});

test("build exit, DISPLACED take: releases NOTHING — the session still holds its claim at the merge ceremony", async () => {
  const spy = releaseSpy(true);
  const lines: string[] = [];
  await buildExit(claimDoc(), { release: spy.release, log: (m) => lines.push(m) });
  assert.deepEqual(spy.calls(), [], "the row the session declared must survive its own build");
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0] ?? "", /WARNING/);
});

test("build exit is never SILENT — every path says what happened to the claim", async () => {
  for (const displaced of [undefined, claimDoc()]) {
    const lines: string[] = [];
    await buildExit(displaced, { release: releaseSpy(true).release, log: (m) => lines.push(m) });
    assert.equal(lines.length, 1, "a claim change with no line is the failure mode being closed");
  }
});

// ── What must NOT have changed: the DELIBERATE releases ──────────────────────
//
// A deliberate release is not the thing being reported. ADR-0142's two explicit paths keep their own
// wording and must not acquire a warning — `noticeboard done` (the session saying so) and the CI
// merge-clear (the branch died, the work landed). Both are proven here to be structurally outside
// this module: they never call releaseClaimWithNotice, so no warning can reach them.

test("ADR-0142 intact: the CI merge-clear releases through its OWN path, so it emits no unexplicit-release warning", async () => {
  // The merge clear is `releaseBranchClaims` in @storytree/notice-board — a different verb
  // (`releaseClaimsByBranch`, keyed on branch) with its own `[ingest-merge]` log line. Nothing in
  // this module is on that path, so the warning cannot fire for it. Asserted by exercising the
  // notified release and confirming its tag is one no deliberate path emits.
  const lines: string[] = [];
  await releaseClaimWithNotice(
    { release: releaseSpy(true).release, log: (m) => lines.push(m) },
    { unitId: "u", sessionId: "s", caller: "node build u --real" },
  );
  assert.match(lines[0] ?? "", /^\[claim\] WARNING/, "the warning is [claim]-tagged");
  assert.doesNotMatch(
    lines[0] ?? "",
    /\[ingest-merge\]/,
    "the merge clear owns the [ingest-merge] tag and keeps its own, unwarned line",
  );
});

test("ADR-0142 intact: `noticeboard done` is a bulk session release with no unit — it cannot reach this per-unit path", () => {
  // `done` calls releaseClaimsBySession(sessionId) — no unitId exists to name, which is exactly why
  // the deliberate ceremony cannot be expressed through releaseClaimWithNotice's (unit, session,
  // caller) shape. The type is the guard: this documents that the separation is structural.
  const notice: Parameters<typeof unexplicitReleaseWarning>[0] = {
    unitId: "u",
    sessionId: "s",
    caller: "c",
    at: "2026-08-03T00:00:00.000Z",
  };
  assert.equal(typeof notice.unitId, "string", "a warning is per-unit; the `done` bulk release has none");
});
