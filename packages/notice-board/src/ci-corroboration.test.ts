import test from "node:test";
import assert from "node:assert/strict";

import {
  branchFromRef,
  planCorroboration,
  renderCorroboration,
  type CorroborationKind,
  type CorroborationObservation,
} from "./ci-corroboration.js";

/**
 * Offline: the pure half of ADR-0535 D2's NARROW CI corroboration — what may vouch for a claim's
 * liveness, and everything that may not.
 *
 * The headline red→green is the FENCE, not the happy path: every refusal below exists because
 * admitting the reading would write a heartbeat FRESHER than the truth, and a too-fresh heartbeat
 * fences a node nobody can reclaim (`isReclaimable` reads this column). Too old costs nothing new.
 */

const NOW = new Date("2026-09-08T12:00:00.000Z");
const CTX = { now: NOW, defaultBranch: "main" };

/** An observation at `NOW` unless overridden — the ordinary case every fence test perturbs. */
function obs(over: Partial<CorroborationObservation>): CorroborationObservation {
  return { ref: "refs/heads/claude/alpha", kind: "push", observedAt: NOW.toISOString(), ...over };
}

// ── branchFromRef: two spellings in, one branch out ───────────────────────────

test("branchFromRef: accepts both spellings the two observers speak", () => {
  // A push event carries a full ref; a workflow run carries a bare head_branch.
  assert.equal(branchFromRef("refs/heads/claude/alpha"), "claude/alpha");
  assert.equal(branchFromRef("claude/alpha"), "claude/alpha");
  assert.equal(branchFromRef("  refs/heads/claude/alpha  "), "claude/alpha");
});

test("branchFromRef: a ref that names no branch is null, never a guess", () => {
  assert.equal(branchFromRef("refs/tags/v1"), null, "a tag names no branch");
  assert.equal(branchFromRef("refs/pull/1056/merge"), null, "a PR merge ref names no branch");
  assert.equal(branchFromRef("refs/heads/"), null, "an empty branch is not a branch");
  assert.equal(branchFromRef("   "), null, "blank is not a branch");
});

// ── The happy path: the two clauses ADR-0535 D2 admits, and no third ──────────

test("planCorroboration: a push and a running check each corroborate their branch", () => {
  const plan = planCorroboration(
    [
      obs({ ref: "refs/heads/claude/alpha", kind: "push" }),
      obs({ ref: "claude/beta", kind: "check-running" }),
    ],
    CTX,
  );

  assert.deepEqual(plan.stamps, [
    { branch: "claude/alpha", observedAt: NOW.toISOString(), kind: "push" },
    { branch: "claude/beta", observedAt: NOW.toISOString(), kind: "check-running" },
  ]);
  assert.deepEqual(plan.refused, [], "nothing refused on the ordinary path");
});

test("planCorroboration: keys on the FULL branch, whatever its shape", () => {
  // Claims are keyed on the full branch and ANY shape can hold one — the `claude/*` prefix gate is
  // what cost PR #1024's claim its machine clear on the sibling writer.
  const plan = planCorroboration(
    [
      obs({ ref: "refs/heads/worktree-adr0270-capability-grain" }),
      obs({ ref: "refs/heads/claude/real/render-wisp-abc123" }),
      obs({ ref: "refs/heads/renovate/pg-8" }),
    ],
    CTX,
  );

  assert.deepEqual(
    plan.stamps.map((s) => s.branch),
    ["claude/real/render-wisp-abc123", "renovate/pg-8", "worktree-adr0270-capability-grain"],
    "lobby-ceremony, promotion and non-session branch shapes all vouch",
  );
});

// ── The fences: every one is against FALSE FRESHNESS ─────────────────────────

test("planCorroboration: the default branch is REFUSED — a push there is a merge, not a session", () => {
  // `claim-release.yml` RELEASES main's merged claims on the very same event. Corroborating it
  // would have the two CI writers contradict each other over one merge.
  const plan = planCorroboration([obs({ ref: "refs/heads/main" })], CTX);

  assert.deepEqual(plan.stamps, [], "main vouches for nothing");
  assert.deepEqual(plan.refused, [{ ref: "main", reason: "default-branch" }]);
});

test("planCorroboration: the default branch is a PARAMETER, so the fence follows the repo", () => {
  const plan = planCorroboration([obs({ ref: "refs/heads/trunk" })], {
    now: NOW,
    defaultBranch: "trunk",
  });
  assert.deepEqual(plan.refused, [{ ref: "trunk", reason: "default-branch" }]);
});

test("planCorroboration: a DELETED ref is refused — the one push that is evidence of ABSENCE", () => {
  const plan = planCorroboration([obs({ deleted: true })], CTX);

  assert.deepEqual(plan.stamps, [], "a branch that no longer exists vouches for nobody");
  assert.deepEqual(plan.refused, [{ ref: "claude/alpha", reason: "deleted-ref" }]);
});

test("planCorroboration: a non-branch ref is refused by name, not silently dropped", () => {
  const plan = planCorroboration(
    [obs({ ref: "refs/tags/v1" }), obs({ ref: "  " }), obs({ observedAt: "not-a-date" })],
    CTX,
  );

  assert.deepEqual(plan.stamps, []);
  assert.deepEqual(plan.refused, [
    { ref: "refs/tags/v1", reason: "not-a-branch" },
    { ref: "  ", reason: "unreadable" },
    { ref: "claude/alpha", reason: "unreadable" },
  ]);
});

test("planCorroboration: a FUTURE reading is refused, never clamped", () => {
  // Clamping would silently admit a skewed runner's reading as `now`. Refusing loses one stamp,
  // which is the cheap direction; a heartbeat that outlives the staleness window is a fence
  // nobody can ever reclaim.
  const plan = planCorroboration(
    [obs({ observedAt: new Date(NOW.getTime() + 1).toISOString() })],
    CTX,
  );

  assert.deepEqual(plan.stamps, []);
  assert.deepEqual(plan.refused, [{ ref: "claude/alpha", reason: "future" }]);
});

test("planCorroboration: a reading exactly AT now is admitted — the boundary is not the fault", () => {
  const plan = planCorroboration([obs({ observedAt: NOW.toISOString() })], CTX);
  assert.equal(plan.stamps.length, 1, "now is not the future");
});

test("planCorroboration: THE BROAD FORM IS REFUSED AT RUNTIME, not only by the type", () => {
  // ADR-0535 D2 refuses "has an open pull request, therefore alive" ON MEASUREMENT: every open PR
  // on this repo is a long-abandoned draft (~940 h on 2026-09-08) and three of their branches are
  // exactly the three oldest abandoned claims, so the broad form makes corpse-fencing permanent —
  // in the failure direction that has no tell. A union is erased at compile time and fences only
  // the author, so the planner checks the admitted kinds AS DATA: an observer widened without the
  // decision being widened produces a NAMED refusal in the report, never a silent stamp.
  // Widened through `string` rather than asserted straight onto the union: what a future widening
  // would actually look like is an observer emitting a kind nobody decided on, which arrives as an
  // ordinary string.
  const smuggledKind: string = "open-pull-request";
  const smuggled: CorroborationObservation = {
    ref: "refs/heads/claude/svg-island-growt-441bb8", // a real 940 h draft PR's branch
    kind: smuggledKind as CorroborationKind,
    observedAt: NOW.toISOString(),
  };

  const plan = planCorroboration([smuggled], CTX);

  assert.deepEqual(plan.stamps, [], "the deadest claim on the board stays dead");
  assert.deepEqual(plan.refused, [
    { ref: "claude/svg-island-growt-441bb8", reason: "unadmitted-kind" },
  ]);
});

// ── Dedupe: one branch, one stamp, the newest reading ────────────────────────

test("planCorroboration: one branch keeps only its NEWEST reading", () => {
  const older = new Date(NOW.getTime() - 60_000).toISOString();
  const plan = planCorroboration(
    [
      obs({ ref: "claude/alpha", kind: "check-running", observedAt: older }),
      obs({ ref: "refs/heads/claude/alpha", kind: "push", observedAt: NOW.toISOString() }),
    ],
    CTX,
  );

  assert.deepEqual(plan.stamps, [
    { branch: "claude/alpha", observedAt: NOW.toISOString(), kind: "push" },
  ]);
});

test("planCorroboration: an older reading can never age a branch back", () => {
  const older = new Date(NOW.getTime() - 60_000).toISOString();
  const plan = planCorroboration(
    [
      obs({ ref: "claude/alpha", observedAt: NOW.toISOString() }),
      obs({ ref: "claude/alpha", observedAt: older }),
    ],
    CTX,
  );
  assert.equal(plan.stamps[0]?.observedAt, NOW.toISOString(), "the newest wins whatever the order");
});

test("planCorroboration: the tie-break is ONLY a tie-break — an older running check never displaces a newer push", () => {
  // The dangerous half of ranking `check-running` above `push`: applied outside an exact tie it
  // would let a stale reading win on KIND, ageing a live claim toward the takeover window with the
  // ledger's own liveness signal. The rank may only decide when the timestamps cannot.
  const older = new Date(NOW.getTime() - 60_000).toISOString();
  const plan = planCorroboration(
    [
      obs({ ref: "claude/alpha", kind: "push", observedAt: NOW.toISOString() }),
      obs({ ref: "claude/alpha", kind: "check-running", observedAt: older }),
    ],
    CTX,
  );

  assert.deepEqual(plan.stamps, [
    { branch: "claude/alpha", observedAt: NOW.toISOString(), kind: "push" },
  ]);
});

test("planCorroboration: on an exact tie a RUNNING CHECK outranks a push", () => {
  // Same instant, so the timestamp cannot choose. A push is over the moment it lands; a run in
  // progress is happening now, so it is the stronger thing to say. Reaches the report only — the
  // stamp is the timestamp both agreed on.
  const plan = planCorroboration(
    [
      obs({ ref: "claude/alpha", kind: "push" }),
      obs({ ref: "claude/alpha", kind: "check-running" }),
    ],
    CTX,
  );
  assert.equal(plan.stamps[0]?.kind, "check-running");

  const reversed = planCorroboration(
    [
      obs({ ref: "claude/alpha", kind: "check-running" }),
      obs({ ref: "claude/alpha", kind: "push" }),
    ],
    CTX,
  );
  assert.equal(reversed.stamps[0]?.kind, "check-running", "order-independent");
});

test("planCorroboration: nothing in, nothing out", () => {
  assert.deepEqual(planCorroboration([], CTX), { stamps: [], refused: [] });
});

// ── The report: LOUD, because a silent writer is how the last one died ───────

test("renderCorroboration: the WHOLE report, pinned", () => {
  // Pinned entire rather than probed: the mechanism this replaces wrote silently and could only be
  // audited by querying the database afterwards, which is how it stayed dead for three weeks. The
  // report IS the audit surface, so its exact text is the contract.
  const plan = planCorroboration(
    [
      obs({ ref: "refs/heads/claude/alpha", kind: "push" }),
      obs({ ref: "claude/beta", kind: "check-running" }),
      obs({ ref: "refs/heads/main" }),
      obs({ ref: "refs/heads/claude/gone", deleted: true }),
    ],
    CTX,
  );

  assert.equal(
    renderCorroboration(plan, 3),
    [
      "[ci-corroborate] 2 branch(es) corroborated, 2 refused, 3 claim(s) moved forward",
      "  claude/alpha <- push at 2026-09-08T12:00:00.000Z",
      "  claude/beta <- check-running at 2026-09-08T12:00:00.000Z",
      "  refused main (default-branch)",
      "  refused claude/gone (deleted-ref)",
    ].join("\n"),
  );
});

test("renderCorroboration: a run that saw nothing still says so", () => {
  assert.equal(
    renderCorroboration({ stamps: [], refused: [] }, 0),
    "[ci-corroborate] 0 branch(es) corroborated, 0 refused, 0 claim(s) moved forward",
  );
});
