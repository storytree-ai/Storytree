/**
 * Offline proof for ambient-presence.ts (ADR-0033 Decision 3: advisory-by-construction, re-founded
 * on the claim ledger by ADR-0200 D5/D7 — presence is RETIRED).
 *
 * Every path through the implementation is fail-silent — ledger failures must never surface
 * through the result or errors. All fixtures are inline; do NOT read .claude/settings.json from
 * disk (hook-config-audit.test.ts scans the real file).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { ActivityStamp, ClaimDocT } from "@storytree/notice-board";

import type {
  AmbientClaimsLike,
  AmbientDeps,
  HeartbeatState,
  WorktreeActivityReading,
} from "./ambient-presence.js";
import * as ambientPresence from "./ambient-presence.js";
import {
  statuslineGlance,
  auditHookConfig,
  planActivitySweep,
  sweepWorktreeActivity,
  undeclaredSessionNudge,
} from "./ambient-presence.js";

import type { SessionIdentity } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fixed clock
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-13T08:00:00.000Z");
const nowFn = () => NOW;

const IDENTITY: SessionIdentity = {
  sessionId: "wt-ambient",
  branch: "claude/real/ambient-integration",
};

// ---------------------------------------------------------------------------
// Helpers — a recording fake of the ambient claim-ledger slice
// ---------------------------------------------------------------------------

function claimDoc(over: Partial<ClaimDocT> & Pick<ClaimDocT, "unitId" | "sessionId">): ClaimDocT {
  return {
    branch: "claude/x",
    intent: "",
    claimedAt: NOW.toISOString(),
    heartbeatAt: NOW.toISOString(),
    ...over,
  };
}

interface RecordingClaims extends AmbientClaimsLike {
  /** Every batch handed to `stampActivity`, in order (ADR-0535 D2). */
  stamped: ActivityStamp[][];
  live: ClaimDocT[];
  /** When true, every method throws. */
  throwing: boolean;
  /** When true, only the activity write throws (the reads still answer). */
  stampThrows: boolean;
}

function makeClaims(live: ClaimDocT[] = [], over: Partial<RecordingClaims> = {}): RecordingClaims {
  const self: RecordingClaims = {
    stamped: [],
    live,
    throwing: false,
    stampThrows: false,
    async listLiveClaims(): Promise<ClaimDocT[]> {
      if (self.throwing) throw new Error("ledger error: listLiveClaims");
      return self.live;
    },
    async claimsBySession(sessionId: string): Promise<ClaimDocT[]> {
      if (self.throwing) throw new Error("ledger error: claimsBySession");
      return self.live.filter((c) => c.sessionId === sessionId);
    },
    async stampActivity(stamps: readonly ActivityStamp[]): Promise<number> {
      if (self.throwing || self.stampThrows) throw new Error("ledger error: stampActivity");
      self.stamped.push([...stamps]);
      const ids = new Set(stamps.map((s) => s.sessionId));
      return self.live.filter((c) => ids.has(c.sessionId)).length;
    },
    ...over,
  };
  return self;
}

/** One worktree observation. Admin-bound and in the past by default — the admissible shape. */
function reading(over: Partial<WorktreeActivityReading> = {}): WorktreeActivityReading {
  return {
    name: "wt-ambient",
    sessionIds: ["wt-ambient"],
    mtimeMs: NOW.getTime() - 60_000,
    binding: "index",
    fellBack: false,
    bulkStamped: false,
    ...over,
  };
}

function makeHeartbeatState(initial: string | null = null): HeartbeatState & { bumps: string[] } {
  let stored: string | null = initial;
  const bumps: string[] = [];
  return {
    bumps,
    readLastBump: () => stored,
    writeLastBump: (iso: string) => {
      stored = iso;
      bumps.push(iso);
    },
  };
}

// ---------------------------------------------------------------------------
// the retired writers stay deleted (ADR-0199 / ADR-0200 D7)
// ---------------------------------------------------------------------------

test("the module exports no build presence wrapper — a build run never writes session state (ADR-0199)", () => {
  assert.ok(
    !("withPresence" in ambientPresence),
    "withPresence must stay deleted — builds never write session presence (ADR-0199)",
  );
});

test("the module exports no sessionHook — sessions no longer declare/retire presence rows (ADR-0200 D7)", () => {
  // The SessionStart declare / SessionEnd done pair retired with the presence layer: a fresh
  // workspace is born claimed (the lobby ceremony, D3) and the nudge below aims at the ledger.
  assert.ok(
    !("sessionHook" in ambientPresence),
    "sessionHook must stay deleted — the claim ledger is the one session surface (ADR-0200 D7)",
  );
});

// ---------------------------------------------------------------------------
// statuslineGlance — rendering (sourced from the claim ledger, ADR-0200 D7)
// ---------------------------------------------------------------------------

test("statuslineGlance: returns a non-empty line with the live-session count and own claimed units", async () => {
  const claims = makeClaims([
    claimDoc({ unitId: "ambient-integration", sessionId: IDENTITY.sessionId, grade: "work" }),
    claimDoc({ unitId: "other-story", sessionId: "wt-other", grade: "exploring", intent: "poking" }),
  ]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps);

  assert.ok(line.length > 0, "should return a non-empty line");
  assert.match(line, /2 sessions on the ledger/, "counts distinct live-claim sessions");
  assert.match(line, /claims: ambient-integration/, "names this session's own claimed units");
});

test("statuslineGlance: includes an overlap warning when another session claims one of your units", async () => {
  const claims = makeClaims([
    claimDoc({ unitId: "ambient-integration", sessionId: IDENTITY.sessionId, grade: "work" }),
    claimDoc({ unitId: "ambient-integration", sessionId: "wt-other", grade: "exploring" }),
  ]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps);

  assert.match(line, /overlap/i);
});

test("statuslineGlance: no overlap warning when the other session claims different units", async () => {
  const claims = makeClaims([
    claimDoc({ unitId: "ambient-integration", sessionId: IDENTITY.sessionId }),
    claimDoc({ unitId: "unrelated-story", sessionId: "wt-other" }),
  ]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps);

  assert.doesNotMatch(line, /overlap|conflict/i);
});

test("statuslineGlance: a claim-less session renders the count alone (no claims segment)", async () => {
  const claims = makeClaims([claimDoc({ unitId: "other-story", sessionId: "wt-other" })]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps);

  assert.match(line, /1 session on the ledger/);
  assert.doesNotMatch(line, /claims:/);
});

// ---------------------------------------------------------------------------
// statuslineGlance — fail-silent
// ---------------------------------------------------------------------------

test("statuslineGlance: returns '' when claims store is null", async () => {
  const deps: AmbientDeps = { claims: null, identity: IDENTITY, now: nowFn };
  const result = await statuslineGlance(deps);
  assert.equal(result, "");
});

test("statuslineGlance: returns '' when identity is null", async () => {
  const deps: AmbientDeps = { claims: makeClaims(), identity: null, now: nowFn };
  const result = await statuslineGlance(deps);
  assert.equal(result, "");
});

test("statuslineGlance: returns '' when the ledger reads throw", async () => {
  const claims = makeClaims([], { throwing: true });
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };
  const result = await statuslineGlance(deps);
  assert.equal(result, "");
});

// ---------------------------------------------------------------------------
// the retired status-bar beat stays deleted (ADR-0535 D3)
// ---------------------------------------------------------------------------

test("liveness-is-observed-not-self-reported: statuslineGlance is READ-ONLY: rendering the status bar writes nothing to the ledger", async () => {
  // ADR-0535 D3 retired the self-report rather than repairing it. The glance used to carry a
  // debounced `bumpHeartbeatsBySession`, which failed in both directions at once: desktop and
  // unattended sessions never draw a status bar, so their claims aged out on a timer whatever they
  // were doing; and a WEDGED session went on bumping, because a timer proves a process exists,
  // which is exactly what a hang also proves. The seam no longer carries the verb at all, so the
  // glance CANNOT write — a structural lock, not a convention.
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })]);
  const line = await statuslineGlance({ claims, identity: IDENTITY, now: nowFn });

  assert.notEqual(line, "", "precondition: the glance did render");
  assert.deepEqual(claims.stamped, [], "rendering wrote nothing");
  assert.equal(
    "bumpHeartbeatsBySession" in claims,
    false,
    "the retired self-report verb must stay off the ambient seam",
  );
});

test("the ambient seam carries liveness and reads ONLY — never take, upgrade, or release", async () => {
  // Structural lock (kept from the retired beat's own test): ambient automation may refresh
  // liveness, but only a deliberate claim/declare may light a wisp.
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })]);
  assert.deepEqual(
    Object.keys(claims).sort(),
    [
      "claimsBySession",
      "listLiveClaims",
      "live",
      "stampActivity",
      "stampThrows",
      "stamped",
      "throwing",
    ].sort(),
  );
});

// ---------------------------------------------------------------------------
// planActivitySweep — the four fences, all against FALSE freshness (ADR-0535 D2)
// ---------------------------------------------------------------------------

test("planActivitySweep: an admin-bound past reading vouches for every identity the worktree carries", async () => {
  const at = NOW.getTime() - 5 * 60_000;
  const plan = planActivitySweep(
    [reading({ name: "wt-a", sessionIds: ["wt-a", "wt-a-admin"], mtimeMs: at })],
    NOW,
  );
  assert.deepEqual(plan.stamps, [
    { sessionId: "wt-a", observedAt: new Date(at).toISOString() },
    { sessionId: "wt-a-admin", observedAt: new Date(at).toISOString() },
  ]);
  assert.deepEqual(plan.refused, []);
});

test("liveness-is-observed-not-self-reported: planActivitySweep: a FELL-BACK reading vouches for nobody — those signals measure the world, not the worktree", async () => {
  // The `.codex/` incident: creating an empty child directory stamps its parent, so one scaffold
  // pass erased 25-40 days of real idleness across four unrelated worktrees. A husk with no admin
  // dir has nothing honest to say, and saying it anyway is how a corpse gets vouched for.
  const plan = planActivitySweep(
    [reading({ name: "husk", fellBack: true, binding: "<dir>" })],
    NOW,
  );
  assert.deepEqual(plan.stamps, []);
  assert.deepEqual(plan.refused, [{ name: "husk", reason: "fell-back" }]);
});

test("liveness-is-observed-not-self-reported: planActivitySweep: an UNREADABLE worktree is refused, never treated as touched just now", async () => {
  // EITHER half of the unreadable test stands alone, and they are separated on purpose: a reading
  // that is 0-and-null satisfies both, so a fixture carrying only that shape leaves each half free
  // to be deleted. 0 is the value `readIdleSignals` returns for a failed stat, and it means
  // INFINITELY old — treating it as "just now" would vouch for a worktree nothing could even read.
  assert.deepEqual(
    planActivitySweep([reading({ name: "no-stamp", mtimeMs: 0, binding: "index" })], NOW).refused,
    [{ name: "no-stamp", reason: "no-signal" }],
  );
  assert.deepEqual(
    planActivitySweep([reading({ name: "no-binding", binding: null })], NOW).refused,
    [{ name: "no-binding", reason: "no-signal" }],
  );
  // A NEGATIVE stamp is unreadable too, so the boundary is `<= 0` and not `< 0`.
  assert.deepEqual(
    planActivitySweep([reading({ name: "negative", mtimeMs: -1, binding: "index" })], NOW).refused,
    [{ name: "negative", reason: "no-signal" }],
  );
  assert.deepEqual(planActivitySweep([reading({ name: "gone", mtimeMs: 0, binding: null })], NOW).stamps, []);
});

test("liveness-is-observed-not-self-reported: planActivitySweep: a BULK-STAMPED worktree is refused — a pass is not activity", async () => {
  // The fault class that has bitten twice (a `git gc` reflog rewrite across 76 worktrees; the
  // `.codex/` scaffold across 4). Two unrelated worktrees cannot be USED at the same second, so a
  // shared stamp is evidence of one pass — and writing it would put a boardful of false-live claims
  // on the ledger, which is strictly worse than the corpses this arc set out to clear.
  const plan = planActivitySweep(
    [
      reading({ name: "swept-a", bulkStamped: true }),
      reading({ name: "swept-b", sessionIds: ["swept-b"], bulkStamped: true }),
    ],
    NOW,
  );
  assert.deepEqual(plan.stamps, []);
  assert.deepEqual(plan.refused, [
    { name: "swept-a", reason: "bulk-stamp" },
    { name: "swept-b", reason: "bulk-stamp" },
  ]);
});

test("liveness-is-observed-not-self-reported: planActivitySweep: a FUTURE reading is refused — a claim that cannot go stale is a fence nobody can reclaim", async () => {
  const plan = planActivitySweep(
    [reading({ name: "skewed", mtimeMs: NOW.getTime() + 3_600_000 })],
    NOW,
  );
  assert.deepEqual(plan.stamps, []);
  assert.deepEqual(plan.refused, [{ name: "skewed", reason: "future" }]);
  // …but a reading landing EXACTLY on `now` is the present, not the future, and must be admitted.
  // The boundary matters because a sweep observing a file written microseconds ago is the normal
  // case for the session doing the sweeping, and refusing it would blind the sweep to itself.
  const onTheNose = planActivitySweep([reading({ name: "now", mtimeMs: NOW.getTime() })], NOW);
  assert.deepEqual(onTheNose.refused, []);
  assert.deepEqual(onTheNose.stamps, [{ sessionId: "wt-ambient", observedAt: NOW.toISOString() }]);
});

test("liveness-is-observed-not-self-reported: planActivitySweep drops an EMPTY session id and sorts what it keeps", async () => {
  // An empty id can arrive from a malformed gitfile (`activitySessionIds` derives one from the
  // admin path). It would key nothing, so it must never enter the `unnest` batch — a row matching
  // no claim is a row that can only ever confuse a reader of the report.
  const plan = planActivitySweep(
    [
      reading({ name: "zulu", sessionIds: ["zulu", ""], mtimeMs: NOW.getTime() - 60_000 }),
      reading({ name: "alpha", sessionIds: ["alpha"], mtimeMs: NOW.getTime() - 60_000 }),
    ],
    NOW,
  );
  // Sorted by session id, not by observation order — a stable batch is what makes the report and
  // the SQL parameters comparable between runs.
  assert.deepEqual(plan.stamps.map((s) => s.sessionId), ["alpha", "zulu"]);
});

test("planActivitySweep: two worktrees mapping to ONE session id keep the NEWER observation", async () => {
  // The monotonic rule applied before the write: the older of two readings must not be the one that
  // ages a live claim, and the ledger sees exactly one row per session id.
  const older = NOW.getTime() - 3 * 3_600_000;
  const newer = NOW.getTime() - 30_000;
  // The winner comes FIRST and the loser LAST, so "always take the latest reading" loses it — the
  // opposite order would let a broken rule pass by luck.
  const plan = planActivitySweep(
    [
      reading({ name: "wt-new", sessionIds: ["shared"], mtimeMs: newer }),
      reading({ name: "wt-old", sessionIds: ["shared"], mtimeMs: older }),
    ],
    NOW,
  );
  assert.deepEqual(plan.stamps, [{ sessionId: "shared", observedAt: new Date(newer).toISOString() }]);
  // …and the same order the other way round, so neither "first wins" nor "last wins" survives.
  assert.deepEqual(
    planActivitySweep(
      [
        reading({ name: "wt-old", sessionIds: ["shared"], mtimeMs: older }),
        reading({ name: "wt-new", sessionIds: ["shared"], mtimeMs: newer }),
      ],
      NOW,
    ).stamps,
    [{ sessionId: "shared", observedAt: new Date(newer).toISOString() }],
  );
  // An EQUAL reading must not displace the one already held. It cannot change the stamp — they are
  // the same instant — but it DOES change which reading the report names as the binding beside it,
  // and a report naming a signal that did not produce the stamp is the defect this rule prevents.
  const held = planActivitySweep(
    [
      reading({ name: "wt-first", sessionIds: ["shared"], mtimeMs: newer, binding: "ORIG_HEAD" }),
      reading({ name: "wt-tie", sessionIds: ["shared"], mtimeMs: newer, binding: "HEAD" }),
    ],
    NOW,
  );
  assert.deepEqual(held.stamps, [{ sessionId: "shared", observedAt: new Date(newer).toISOString() }]);
});

test("planActivitySweep: a live reading among refused ones still vouches — one bad worktree does not mute the sweep", async () => {
  const plan = planActivitySweep(
    [
      reading({ name: "husk", sessionIds: ["husk"], fellBack: true }),
      reading({ name: "wt-live", sessionIds: ["wt-live"] }),
    ],
    NOW,
  );
  assert.deepEqual(plan.stamps.map((s) => s.sessionId), ["wt-live"]);
  assert.deepEqual(plan.refused, [{ name: "husk", reason: "fell-back" }]);
});

// ---------------------------------------------------------------------------
// sweepWorktreeActivity — the debounce, the cost trap, and fail-silence
// ---------------------------------------------------------------------------

function sweepDeps(
  claims: RecordingClaims | null,
  obs: readonly WorktreeActivityReading[],
  seen?: { n: number; acquired: number },
) {
  return {
    now: nowFn,
    acquire: async () => {
      if (seen !== undefined) seen.acquired += 1;
      return claims;
    },
    observe: () => {
      if (seen !== undefined) seen.n += 1;
      return obs;
    },
  };
}

test("sweepWorktreeActivity: a due sweep writes the plan and records the debounce", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: "wt-ambient" })]);
  const state = makeHeartbeatState(null);

  const result = await sweepWorktreeActivity(
    sweepDeps(claims, [reading()]),
    state,
    60_000,
  );

  assert.equal(result.skipped, null);
  assert.equal(result.written, 1);
  assert.deepEqual(claims.stamped.length, 1, "one batched write, not one per worktree");
  assert.deepEqual(claims.stamped[0]?.map((s) => s.sessionId), ["wt-ambient"]);
  assert.equal(state.bumps.length, 1, "the debounce is consumed on success");
});

test("liveness-is-observed-not-self-reported: sweepWorktreeActivity: WITHIN the debounce it does not even OBSERVE — check first, connect second", async () => {
  // The cost trap this ordering exists for: the retired ping opened a DB pool BEFORE deciding
  // whether a write was due, and the keyless Cloud SQL handshake measures ~6-11s on this box, so
  // on a per-call path it silently lost its own race every time. The debounce must be the first
  // thing read, ahead of the fs work and far ahead of any connection.
  const claims = makeClaims();
  const seen = { n: 0, acquired: 0 };
  const result = await sweepWorktreeActivity(
    sweepDeps(claims, [reading()], seen),
    makeHeartbeatState(NOW.toISOString()),
    60_000,
  );

  assert.equal(result.skipped, "debounced");
  assert.equal(seen.n, 0, "no filesystem observation inside the window");
  assert.equal(seen.acquired, 0, "and no connector handshake");
  assert.deepEqual(claims.stamped, [], "and certainly no write");
  // A skipped sweep reports EMPTY collections, never absent ones: callers render `stamps`/`refused`
  // unconditionally, and an undefined here would be a crash in the diagnostic rather than a blank.
  assert.deepEqual(result.stamps, []);
  assert.deepEqual(result.refused, []);
  assert.equal(result.written, 0);
});

test("liveness-is-observed-not-self-reported: the debounce boundary sweeps AT the window, and never wedges shut", async () => {
  // Exactly `debounceMs` elapsed is the window EXPIRING, not still running. The difference is a
  // rounding error per fire and a permanent stall in the pathological case, and the sweep is the
  // only thing keeping claims out of stale-reclaim — so it errs toward sweeping.
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: "wt-ambient" })]);
  const atTheBoundary = await sweepWorktreeActivity(
    sweepDeps(claims, [reading()]),
    makeHeartbeatState(new Date(NOW.getTime() - 60_000).toISOString()),
    60_000,
  );
  assert.equal(atTheBoundary.skipped, null, "elapsed === debounceMs must sweep");

  // One millisecond short is still inside the window.
  const justInside = await sweepWorktreeActivity(
    sweepDeps(makeClaims(), [reading()]),
    makeHeartbeatState(new Date(NOW.getTime() - 59_999).toISOString()),
    60_000,
  );
  assert.equal(justInside.skipped, "debounced");
});

test("liveness-is-observed-not-self-reported: sweepWorktreeActivity: with nothing admissible, the LEDGER IS NEVER ASKED FOR — the cost trap, structurally", async () => {
  // The sharpest form of the same rule, and the one the type now enforces: `acquire` is a thunk,
  // so a box whose worktrees are all husks decides it has nothing to say BEFORE paying a
  // handshake. The retired ping got this backwards and lost its own race every time.
  const seen = { n: 0, acquired: 0 };
  const result = await sweepWorktreeActivity(
    sweepDeps(makeClaims(), [reading({ fellBack: true })], seen),
    makeHeartbeatState(null),
    60_000,
  );

  assert.equal(result.skipped, "nothing-to-say");
  assert.equal(seen.n, 1, "it DID observe — that is the cheap half");
  assert.equal(seen.acquired, 0, "but never reached for the store");
});

test("sweepWorktreeActivity: past the debounce window it fires again", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: "wt-ambient" })]);
  const state = makeHeartbeatState(new Date(NOW.getTime() - 200).toISOString());
  const result = await sweepWorktreeActivity(sweepDeps(claims, [reading()]), state, 100);
  assert.equal(result.skipped, null);
  assert.equal(claims.stamped.length, 1);
});

test("sweepWorktreeActivity: nothing admissible → no write at all, and the debounce is NOT consumed", async () => {
  // A box whose worktrees are all husks must not pay a connector handshake to say nothing — and
  // must not then sit out the window, since the next fire may have something real to report.
  const claims = makeClaims();
  const state = makeHeartbeatState(null);
  const result = await sweepWorktreeActivity(
    sweepDeps(claims, [reading({ fellBack: true })]),
    state,
    60_000,
  );

  assert.equal(result.skipped, "nothing-to-say");
  assert.deepEqual(claims.stamped, []);
  assert.equal(state.bumps.length, 0);
});

test("sweepWorktreeActivity: OFFLINE (no ledger) still plans, writes nothing, and stays silent", async () => {
  const result = await sweepWorktreeActivity(
    sweepDeps(null, [reading()]),
    makeHeartbeatState(null),
    60_000,
  );
  assert.equal(result.skipped, "offline");
  assert.equal(result.written, 0);
  assert.deepEqual(result.stamps.map((s) => s.sessionId), ["wt-ambient"], "the plan is still made");
});

test("liveness-is-observed-not-self-reported: a ledger that THREW is `write-failed`, not `offline` — a fault is not a quiet Tuesday", async () => {
  // Same outcome (nothing written, debounce intact), different fact. A DB that is down is the
  // ordinary state of a laptop; a ledger that accepted the call and threw is a defect, and the
  // sweep's own result is the only place that distinction is visible — nothing is printed.
  const result = await sweepWorktreeActivity(
    sweepDeps(makeClaims([], { stampThrows: true }), [reading()]),
    makeHeartbeatState(null),
    60_000,
  );
  assert.equal(result.skipped, "write-failed");
});

test("sweepWorktreeActivity: a THROWING write stays silent and does NOT consume the debounce", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: "wt-ambient" })], {
    stampThrows: true,
  });
  const state = makeHeartbeatState(null);
  const result = await sweepWorktreeActivity(
    sweepDeps(claims, [reading()]),
    state,
    60_000,
  );

  assert.equal(result.written, 0);
  assert.equal(state.bumps.length, 0, "a failed write must not consume the debounce (the next fire retries)");
});

test("sweepWorktreeActivity: a THROWING observation is swallowed — an fs failure never surfaces", async () => {
  const claims = makeClaims();
  const result = await sweepWorktreeActivity(
    {
      now: nowFn,
      acquire: async () => claims,
      observe: () => {
        throw new Error("fs exploded");
      },
    },
    makeHeartbeatState(null),
    60_000,
  );
  assert.equal(result.skipped, "nothing-to-say");
  assert.deepEqual(claims.stamped, []);
});

test("sweepWorktreeActivity: an UNREADABLE debounce stamp sweeps rather than blocking forever", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: "wt-ambient" })]);
  const result = await sweepWorktreeActivity(
    sweepDeps(claims, [reading()]),
    makeHeartbeatState("not-a-date"),
    60_000,
  );
  assert.equal(result.skipped, null, "a garbage marker must not wedge liveness shut");
});

test("liveness-is-observed-not-self-reported: sweepWorktreeActivity vouches for OTHER sessions, not only its own — the whole point of a sweep", async () => {
  // This is what the retired ping could not do at any debounce. A desktop session draws no status
  // bar and observes nothing, so its liveness has to come from somebody else's process noticing
  // that its worktree is changing.
  const claims = makeClaims([
    claimDoc({ unitId: "n1", sessionId: "wt-desktop" }),
    claimDoc({ unitId: "n2", sessionId: "wt-terminal" }),
  ]);
  await sweepWorktreeActivity(
    sweepDeps(
      claims,
      [
        reading({ name: "wt-terminal", sessionIds: ["wt-terminal"] }),
        reading({ name: "wt-desktop", sessionIds: ["wt-desktop"] }),
      ],
    ),
    makeHeartbeatState(null),
    60_000,
  );
  assert.deepEqual(
    claims.stamped[0]?.map((s) => s.sessionId).sort(),
    ["wt-desktop", "wt-terminal"],
    "one process's sweep vouches for every claimed worktree on the box",
  );
});

// ---------------------------------------------------------------------------
// auditHookConfig
// ---------------------------------------------------------------------------

// Clean: the ambient hooks only on SessionStart / the statusline; unrelated PreToolUse → []
const CLEAN_SETTINGS = JSON.stringify({
  hooks: {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: "bash scripts/presence-hook.sh start" }] },
    ],
    PreToolUse: [
      { matcher: "", hooks: [{ type: "command", command: "echo unrelated-hook" }] },
    ],
  },
});

test("auditHookConfig: clean settings returns []", () => {
  const violations = auditHookConfig(CLEAN_SETTINGS);
  assert.deepEqual(violations, []);
});

test("auditHookConfig: noticeboard hook under Stop is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard done --pg" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag Stop noticeboard hook");
  assert.ok(
    violations.some((v) => /stop/i.test(v)),
    `violation should mention Stop, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: ambient-presence hook under PreToolUse is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "storytree ambient-presence hook start" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag PreToolUse ambient-presence hook");
  assert.ok(
    violations.some((v) => /pretooluse/i.test(v)),
    `violation should mention PreToolUse, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: the presence-hook launcher under a blocking event is a violation", () => {
  // The shared settings.json invokes `bash scripts/presence-hook.sh <mode>` — its command
  // string never names `ambient-presence`, so the audit must catch it by the launcher name.
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "bash scripts/presence-hook.sh statusline" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag PreToolUse presence-hook launcher");
  assert.ok(
    violations.some((v) => /pretooluse/i.test(v)),
    `violation should mention PreToolUse, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: the worktree-activity launcher under a blocking event is a violation", () => {
  // ADR-0535 D2's sweep launcher (`bash scripts/worktree-activity-hook.sh`) names neither
  // `noticeboard` nor `ambient-presence`, exactly like the presence launcher above — but it WRITES
  // to the claim ledger, so it belongs on the same fence. Without the keyword it could be moved
  // onto `PreToolUse` (the per-tool-call path that would make it dense) and the audit would say
  // nothing at all. What earns a keyword is writing to the ledger, not the file it lives in.
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "bash scripts/worktree-activity-hook.sh" }],
        },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag the PreToolUse activity-sweep launcher");
  assert.ok(violations.some((v) => /pretooluse/i.test(v)));
});

test("auditHookConfig: the worktree-activity launcher on SessionStart is NOT a violation", () => {
  // Where it actually ships. SessionStart is not a blocking event, and the launcher detaches.
  assert.deepEqual(
    auditHookConfig(
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "",
              hooks: [{ type: "command", command: "bash scripts/worktree-activity-hook.sh" }],
            },
          ],
        },
      }),
    ),
    [],
  );
});

test("auditHookConfig: the portable ambient launcher under a blocking event is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            { type: "command", command: "node packages/cli/ambient-hook.mjs sweep" },
          ],
        },
      ],
    },
  });

  const violations = auditHookConfig(settings);
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /UserPromptSubmit/);
});

test("auditHookConfig: noticeboard hook under UserPromptSubmit is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: "echo noticeboard status check" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag UserPromptSubmit noticeboard hook");
});

test("auditHookConfig: unrelated PreToolUse hook (not noticeboard-shaped) is NOT a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "echo check something else" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.deepEqual(violations, []);
});

test("auditHookConfig: empty hooks object returns []", () => {
  const violations = auditHookConfig(JSON.stringify({ hooks: {} }));
  assert.deepEqual(violations, []);
});

test("auditHookConfig: no hooks key at all returns []", () => {
  const violations = auditHookConfig(JSON.stringify({}));
  assert.deepEqual(violations, []);
});

test("auditHookConfig: multiple violations across events reported individually", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard done --pg" }] },
      ],
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "run ambient-presence hook start" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 2, "should flag both violations separately");
});

test("auditHookConfig: ambient-presence hook under Stop is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "node ambient-presence.js" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag ambient-presence hook under Stop");
});

// ---------------------------------------------------------------------------
// undeclaredSessionNudge (ADR-0143, re-aimed by ADR-0200 D3)
// ---------------------------------------------------------------------------

test("undeclaredSessionNudge: a worktree identity gets the one-line claim-ledger prompt naming the claim command", () => {
  const line = undeclaredSessionNudge(IDENTITY);
  assert.match(line, /UNCLAIMED/);
  assert.match(line, new RegExp(IDENTITY.sessionId));
  assert.match(line, /noticeboard claim <story-id> --grade exploring --intent "<why>" --pg/);
  assert.match(line, /worktree create --node <story-id> --intent "<what>" --pg/);
  assert.match(line, /ADR-0200/);
  assert.doesNotMatch(line, /noticeboard declare/, "the nudge no longer aims at declare (ADR-0200 D3)");
  assert.equal(line.trim().split("\n").length, 1, "exactly one line — SessionStart stdout is model context");
});

test("undeclaredSessionNudge: a plain checkout (null identity) stays silent", () => {
  assert.equal(undeclaredSessionNudge(null), "");
});
