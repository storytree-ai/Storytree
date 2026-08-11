import test from "node:test";
import assert from "node:assert/strict";

import { CLAIM_STALE_RECLAIM_MS } from "@storytree/notice-board";
import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import {
  claimLedgerCommand,
  isClaimLedgerVerb,
  type ClaimLedgerDeps,
  type ClaimLedgerStoreLike,
} from "./noticeboard-claims.js";
import type { SessionIdentity } from "./noticeboard.js";

/**
 * The graded claim-ledger verbs (ADR-0200 D2): each verb maps to the RIGHT store call with the
 * RIGHT request (grade, intent, worktree-derived attribution), and each store outcome — acquired /
 * queued / refused / true / false — renders an honest envelope. Offline: the store seam is a fake;
 * the SQL truths live in the claim store's own live legs.
 */

// ---------------------------------------------------------------------------
// Fixed clock + fake ledger store
// ---------------------------------------------------------------------------

const NOW = new Date("2026-07-16T10:00:00.000Z");
const nowFn = () => NOW;

const IDENTITY: SessionIdentity = { sessionId: "wt-ledger", branch: "claude/ledger" };

function doc(over: Partial<ClaimDocT> & Pick<ClaimDocT, "unitId" | "sessionId">): ClaimDocT {
  return {
    branch: "claude/other",
    intent: "",
    claimedAt: NOW.toISOString(),
    heartbeatAt: NOW.toISOString(),
    ...over,
  };
}

interface FakeLedger extends ClaimLedgerStoreLike {
  takes: ClaimRequest[];
  /** The OPTS of every take, alongside `takes` — so the ADR-0346 D1 queue-on-refusal is provable. */
  takeOpts: Array<{ queueOnRefusal?: boolean } | undefined>;
  upgrades: Array<{ unitId: string; sessionId: string; opts?: { branch?: string; intent?: string } }>;
  downgrades: Array<{ unitId: string; sessionId: string; grade: string }>;
  releases: Array<{ unitId: string; sessionId: string }>;
  /** Next result take()/upgrade() returns (default: acquired). */
  nextResult?: ClaimResult;
  /** What downgrade()/release() return (default true). */
  boolResult: boolean;
  /** What claimsFor() returns. */
  rows: ClaimDocT[];
  /** What claimsBySession() returns — the `mine` self-view (defaults to `rows`). */
  ownRows?: ClaimDocT[];
  /** Every claimsBySession() call, so a test can prove `mine` asks to see its own stale rows. */
  bySession: Array<{ sessionId: string; opts?: { includeStale?: boolean } }>;
}

function makeFakeLedger(over: Partial<FakeLedger> = {}): FakeLedger {
  const self: FakeLedger = {
    takes: [],
    takeOpts: [],
    upgrades: [],
    downgrades: [],
    releases: [],
    boolResult: true,
    rows: [],
    bySession: [],
    async take(req: ClaimRequest, opts?: { queueOnRefusal?: boolean }): Promise<ClaimResult> {
      self.takes.push(req);
      self.takeOpts.push(opts);
      if (self.nextResult !== undefined) return self.nextResult;
      return {
        acquired: true,
        reclaimed: false,
        claim: doc({
          unitId: req.unitId,
          sessionId: req.sessionId,
          branch: req.branch,
          intent: req.intent ?? "",
          ...(req.grade !== undefined ? { grade: req.grade } : {}),
        }),
      };
    },
    async upgrade(unitId, sessionId, opts): Promise<ClaimResult> {
      self.upgrades.push({ unitId, sessionId, ...(opts !== undefined ? { opts } : {}) });
      if (self.nextResult !== undefined) return self.nextResult;
      return {
        acquired: true,
        reclaimed: false,
        claim: doc({ unitId, sessionId, grade: "work", branch: opts?.branch ?? "?" }),
      };
    },
    async downgrade(unitId, sessionId, grade): Promise<boolean> {
      self.downgrades.push({ unitId, sessionId, grade });
      return self.boolResult;
    },
    async release(unitId, sessionId): Promise<boolean> {
      self.releases.push({ unitId, sessionId });
      return self.boolResult;
    },
    async claimsFor(): Promise<ClaimDocT[]> {
      return self.rows;
    },
    async claimsBySession(sessionId, opts): Promise<ClaimDocT[]> {
      self.bySession.push({ sessionId, ...(opts !== undefined ? { opts } : {}) });
      return self.ownRows ?? self.rows;
    },
    ...over,
  };
  return self;
}

function deps(claims: ClaimLedgerStoreLike | null, identity: SessionIdentity | null = IDENTITY): ClaimLedgerDeps {
  return { claims, identity, now: nowFn };
}

// ---------------------------------------------------------------------------
// Refusals shared by every verb
// ---------------------------------------------------------------------------

test("isClaimLedgerVerb: recognises the six verbs and nothing else", () => {
  for (const v of ["claim", "upgrade", "downgrade", "release", "claims", "mine"]) {
    assert.equal(isClaimLedgerVerb(v), true, v);
  }
  assert.equal(isClaimLedgerVerb("declare"), false);
  assert.equal(isClaimLedgerVerb("done"), false);
  assert.equal(isClaimLedgerVerb(undefined), false);
});

test("every verb refuses without a unit id, with the usage envelope", async () => {
  const env = await claimLedgerCommand("claim", undefined, {}, deps(makeFakeLedger()));
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a unit id/);
  assert.match(env.body, /--grade exploring\|waiting\|work/);
});

test("every verb refuses without the live store (--pg), next has pnpm db:up", async () => {
  for (const verb of ["claim", "upgrade", "downgrade", "release", "claims"] as const) {
    const env = await claimLedgerCommand(verb, "story-x", { grade: "exploring", intent: "x" }, deps(null));
    assert.equal(env.ok, false, verb);
    assert.match(env.body, /--pg/);
    assert.ok(env.next?.includes("pnpm db:up"), verb);
  }
});

test("write verbs refuse without a worktree identity; the claims read does not need one", async () => {
  const ledger = makeFakeLedger();
  for (const verb of ["claim", "upgrade", "downgrade", "release"] as const) {
    const env = await claimLedgerCommand(
      verb,
      "story-x",
      { grade: "exploring", intent: "x" },
      deps(ledger, null),
    );
    assert.equal(env.ok, false, verb);
    assert.match(env.body, /worktree|identity/i);
  }
  assert.equal(ledger.takes.length, 0);
  const read = await claimLedgerCommand("claims", "story-x", {}, deps(ledger, null));
  assert.equal(read.ok, true, read.body);
});

// ---------------------------------------------------------------------------
// claim — request mapping per grade
// ---------------------------------------------------------------------------

test("claim: default grade is exploring and it REQUIRES --intent (fail-closed, no store call)", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("claim", "story-x", {}, deps(ledger));
  assert.equal(env.ok, false);
  assert.match(env.body, /--intent/);
  assert.equal(ledger.takes.length, 0);

  const blank = await claimLedgerCommand("claim", "story-x", { intent: "   " }, deps(ledger));
  assert.equal(blank.ok, false);
  assert.equal(ledger.takes.length, 0);
});

test("claim: exploring maps to take() with grade exploring, the intent prose, and identity attribution", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand(
    "claim",
    "story-x",
    { intent: "reading the drainage spec" },
    deps(ledger),
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.takes, [
    {
      unitId: "story-x",
      sessionId: "wt-ledger",
      branch: "claude/ledger",
      intent: "reading the drainage spec",
      grade: "exploring",
    },
  ]);
  assert.match(env.body, /Exploring claim taken/);
  assert.match(env.body, /hovering wisp/);
  assert.match(env.body, /"reading the drainage spec"/);
});

test("claim --grade waiting: maps to a waiting request (intent optional) and reports the queue position", async () => {
  const ledger = makeFakeLedger({
    rows: [
      doc({ unitId: "story-x", sessionId: "holder", grade: "work" }),
      doc({ unitId: "story-x", sessionId: "first-waiter", grade: "waiting" }),
      doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting", branch: "claude/ledger" }),
    ],
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "waiting" }, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.takes, [
    { unitId: "story-x", sessionId: "wt-ledger", branch: "claude/ledger", grade: "waiting" },
  ]);
  assert.match(env.body, /Waiting claim taken/);
  assert.match(env.body, /position 2 of 2/);
});

test("claim --grade waiting with NO work holder: no queue position is rendered — nothing blocks you (ADR-0270 D3.1)", async () => {
  const ledger = makeFakeLedger({
    rows: [doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting", branch: "claude/ledger" })],
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "waiting" }, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.doesNotMatch(env.body, /position \d+ of \d+/);
  assert.match(env.body, /NO LIVE work claim/);
  assert.match(env.body, /nothing blocks you/i);
  assert.match(env.body, /ADR-0270/);
});

// ── The stale predicate reaches the queue arithmetic (ADR-0346 D1 companion work) ─────────────

/** A heartbeat old enough to be reclaimable at NOW. */
const STALE_BEAT = new Date(NOW.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString();

test("claim --grade waiting: a STALE waiter is not ahead of you — the line counts LIVE rows only", async () => {
  const ledger = makeFakeLedger({
    rows: [
      doc({ unitId: "story-x", sessionId: "holder", grade: "work" }),
      // A dead waiter. `oldestLiveWaiter` skips it when the store actually promotes, so counting it
      // into the line told the session it was third when it was in fact second.
      doc({ unitId: "story-x", sessionId: "dead-waiter", grade: "waiting", heartbeatAt: STALE_BEAT }),
      doc({ unitId: "story-x", sessionId: "live-waiter", grade: "waiting" }),
      doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting", branch: "claude/ledger" }),
    ],
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "waiting" }, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /position 2 of 2 in the LIVE line/, "the dead waiter counts for nothing");
});

test("claim --grade waiting: a STALE work row is not a holder — nothing blocks you", async () => {
  const ledger = makeFakeLedger({
    rows: [
      // `claim()` would reclaim this row on the next take, so treating it as a fence was a fiction
      // — and under ADR-0346 D1 it is the fiction that blocks a live session behind a dead one.
      doc({ unitId: "story-x", sessionId: "ghost-holder", grade: "work", heartbeatAt: STALE_BEAT }),
      doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting", branch: "claude/ledger" }),
    ],
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "waiting" }, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /NO LIVE work claim is held here/);
  assert.match(env.body, /reclaims a stale holder/);
  assert.doesNotMatch(env.body, /position \d+ of \d+/);
});

test("claim --grade work acquired: the wisp is lit; reclaim is named", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand(
    "claim",
    "story-x",
    { grade: "work", intent: "real" },
    deps(ledger),
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.takes, [
    { unitId: "story-x", sessionId: "wt-ledger", branch: "claude/ledger", grade: "work", intent: "real" },
  ]);
  assert.match(env.body, /wisp is lit/);
  assert.doesNotMatch(env.body, /reclaimed/);

  ledger.nextResult = {
    acquired: true,
    reclaimed: true,
    claim: doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "work" }),
  };
  const reclaimEnv = await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  assert.match(reclaimEnv.body, /reclaimed from a stale holder/);
});

test("claim --grade work refused: names the holder, ok:false, next suggests joining the waiting line", async () => {
  const ledger = makeFakeLedger({
    nextResult: {
      acquired: false,
      heldBy: doc({ unitId: "story-x", sessionId: "other-wt", branch: "claude/other", intent: "real" }),
    },
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  assert.equal(env.ok, false);
  assert.match(env.body, /REFUSED/);
  assert.match(env.body, /other-wt/);
  assert.match(env.body, /claude\/other/);
  assert.ok(env.next?.some((n) => n.includes("--grade waiting")));
});

test("claim --grade work refused: prints the unit's full claim board and the capability-narrowing path (ADR-0270 D3.2)", async () => {
  const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000).toISOString();
  const holder = doc({
    unitId: "story-x",
    sessionId: "other-wt",
    grade: "work",
    intent: "orchestrate",
    claimedAt: tenMinAgo,
  });
  const ledger = makeFakeLedger({
    nextResult: { acquired: false, heldBy: holder },
    rows: [holder, doc({ unitId: "story-x", sessionId: "waiter-wt", grade: "waiting", claimedAt: tenMinAgo })],
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  assert.equal(env.ok, false);
  // grade/ROLE (ADR-0346 D3) — this holder is a PRE-SPLIT row, so its role is derived from the
  // legacy `intent` word. That is the whole point of the derivation: an old row still reads.
  assert.match(env.body, /\[work\/supplementing\]\s+other-wt\s+10m\s+branch=claude\/other\s+intent "orchestrate"/);
  assert.match(env.body, /\[waiting\/supplementing\]\s+waiter-wt/);
  assert.match(env.body, /never an owner question/i);
  // A store that refuses WITHOUT queueing has left this session out of the line, and the message
  // has to say so — that is the one thing this arm must not share with the queued render.
  assert.match(env.body, /You are NOT in the line/);
  assert.ok(env.next?.some((n) => n.includes("--grade waiting")));
});

test("claim --grade work asks the store to QUEUE on refusal, never a caller-side follow-up take (ADR-0346 D1)", async () => {
  const ledger = makeFakeLedger();
  await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  assert.deepEqual(ledger.takeOpts, [{ queueOnRefusal: true }]);
  // ONE take. A refusal followed by a separate waiting take has a window in which the holder can
  // release, which under a binding fence leaves the session queued behind nobody, forever.
  assert.equal(ledger.takes.length, 1);
});

test("claim --grade work QUEUED: ok:FALSE, and the session is told it is fenced out (ADR-0346 D1/D4)", async () => {
  const holder = doc({ unitId: "story-x", sessionId: "holder-wt", grade: "work", intent: "growing it" });
  const ledger = makeFakeLedger({
    nextResult: {
      acquired: false,
      queued: true,
      waiting: doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting" }),
      heldBy: holder,
    },
    rows: [holder, doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting" })],
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  // THE line of ADR-0346 D1 at this seam. It used to exit ZERO — "waiting in line behind X" reads
  // as permission to carry on, which is why the queue fired 3 times in 12 days while 16 refusals
  // were handed out and the sessions kept building.
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /QUEUED behind holder-wt/);
  assert.match(env.body, /position 1 of 1 in the LIVE line/);
  assert.match(env.body, /`waiting` BINDS \(ADR-0346 D1\): STOP working "story-x"/);
  // The holder is described by the ONE shared describer — who, role, prose, age, liveness.
  assert.match(env.body, /holder-wt \(branch claude\/other, role supplementing, intent "growing it", held 0m, LIVE/);
  // D4's fork, and only D4's fork: no "proceed on your own judgment" survives anywhere.
  assert.match(env.body, /work another capability you already hold/);
  assert.match(env.body, /release\s+your claims, and END the session/);
  assert.doesNotMatch(env.body, /proceed/i);
  assert.match(env.body, /never an owner question/i);
  assert.ok(env.next?.some((n) => n === "storytree noticeboard mine --pg"));
});

test("claim: an unknown grade is refused before any store call", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("claim", "story-x", { grade: "shouting" }, deps(ledger));
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown claim grade "shouting"/);
  assert.equal(ledger.takes.length, 0);
});

// ---------------------------------------------------------------------------
// upgrade
// ---------------------------------------------------------------------------

test("upgrade: maps to upgrade(unit, session) with the identity branch (fail-closed attribution)", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("upgrade", "story-x", {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.upgrades, [
    { unitId: "story-x", sessionId: "wt-ledger", opts: { branch: "claude/ledger" } },
  ]);
  assert.match(env.body, /Upgraded to the WORK claim/);
  assert.match(env.body, /wisp is lit/);
});

test("upgrade queued: ok:FALSE — QUEUED behind the holder, with the queue position (ADR-0346 D1)", async () => {
  const ledger = makeFakeLedger({
    nextResult: {
      acquired: false,
      queued: true,
      waiting: doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting" }),
      heldBy: doc({ unitId: "story-x", sessionId: "holder-wt", grade: "work" }),
    },
    rows: [
      doc({ unitId: "story-x", sessionId: "holder-wt", grade: "work" }),
      doc({ unitId: "story-x", sessionId: "wt-ledger", grade: "waiting" }),
    ],
  });
  const env = await claimLedgerCommand("upgrade", "story-x", {}, deps(ledger));
  assert.equal(env.ok, false, "the session asked for the work slot and did not get it (ADR-0346 D1)");
  assert.match(env.body, /QUEUED behind holder-wt/);
  assert.match(env.body, /position 1 of 1/);
  assert.match(env.body, /`waiting` BINDS/);
});

// ---------------------------------------------------------------------------
// downgrade
// ---------------------------------------------------------------------------

test("downgrade: requires --grade exploring|waiting (work or missing is refused, no store call)", async () => {
  const ledger = makeFakeLedger();
  for (const grade of [undefined, "work", "loud"]) {
    const env = await claimLedgerCommand(
      "downgrade",
      "story-x",
      grade !== undefined ? { grade } : {},
      deps(ledger),
    );
    assert.equal(env.ok, false, String(grade));
    assert.match(env.body, /--grade exploring\|waiting/);
  }
  assert.equal(ledger.downgrades.length, 0);
});

test("downgrade true: maps to downgrade(unit, session, grade) and reports the downgrade honestly", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("downgrade", "story-x", { grade: "exploring" }, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.downgrades, [
    { unitId: "story-x", sessionId: "wt-ledger", grade: "exploring" },
  ]);
  assert.match(env.body, /Downgraded your claim on "story-x" to exploring/);
});

test("downgrade false: nothing of ours to downgrade — an honest ok:false", async () => {
  const ledger = makeFakeLedger({ boolResult: false });
  const env = await claimLedgerCommand("downgrade", "story-x", { grade: "waiting" }, deps(ledger));
  assert.equal(env.ok, false);
  assert.match(env.body, /Nothing of yours to downgrade/);
});

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

test("release true: maps to release(unit, session) and names the promotion rule", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("release", "story-x", {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.releases, [{ unitId: "story-x", sessionId: "wt-ledger" }]);
  assert.match(env.body, /Released your claim/);
  assert.match(env.body, /oldest\s+live waiter/);
});

test("release false: nothing of ours to release — an honest ok:false", async () => {
  const ledger = makeFakeLedger({ boolResult: false });
  const env = await claimLedgerCommand("release", "story-x", {}, deps(ledger));
  assert.equal(env.ok, false);
  assert.match(env.body, /Nothing of yours to release/);
});

// ---------------------------------------------------------------------------
// claims — the read view
// ---------------------------------------------------------------------------

test("claims: renders every row in queue order with grade, session, age, and intent", async () => {
  const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000).toISOString();
  const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
  const ledger = makeFakeLedger({
    rows: [
      doc({
        unitId: "story-x",
        sessionId: "holder-wt",
        grade: "work",
        intent: "real",
        claimedAt: threeHoursAgo,
      }),
      doc({ unitId: "story-x", sessionId: "waiter-wt", grade: "waiting", claimedAt: tenMinAgo }),
      // A pre-grade row (absent grade) reads as work — the ADR-0200 back-compat default.
      doc({ unitId: "story-x", sessionId: "legacy-wt", claimedAt: tenMinAgo }),
    ],
  });
  const env = await claimLedgerCommand("claims", "story-x", {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  const [header, first, second, third] = env.body.split("\n");
  assert.match(header ?? "", /Claims on "story-x" \(queue order/);
  assert.match(first ?? "", /\[work\/proving\]\s+holder-wt\s+3h\s+branch=claude\/other\s+intent "real"/);
  assert.match(second ?? "", /\[waiting\/supplementing\]\s+waiter-wt\s+10m/);
  assert.match(second ?? "", /intent \(none\)/);
  assert.match(third ?? "", /\[work\/supplementing\]\s+legacy-wt/);
});

test("claims: an empty unit reads as no claims, with the claim command as next", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("claims", "story-x", {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /No claims on "story-x"/);
  assert.ok(env.next?.some((n) => n.includes("noticeboard claim story-x")));
});

test("claims (THE MEASURED DEFECT, 2026-08-11): a stale row renders MARKED, not as a live holder", async () => {
  // `noticeboard claims forest-world --pg` printed exactly this row — `[exploring] procedural-arch
  // 554h` — with nothing to say it had been silent for 23 days, while the board dropped it entirely.
  const ledger = makeFakeLedger({
    rows: [
      doc({
        unitId: "forest-world",
        sessionId: "procedural-arch",
        branch: "claude/procedural-arch",
        grade: "exploring",
        intent: "procedural architecture",
        claimedAt: new Date(NOW.getTime() - 554 * 3_600_000).toISOString(),
        heartbeatAt: STALE_BEAT,
      }),
    ],
  });
  const env = await claimLedgerCommand("claims", "forest-world", {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /\[exploring\/supplementing\]\s+procedural-arch\s+554h.*STALE 4h — reclaimable/);
  assert.match(env.body, /1 of 1 row above is STALE/);
  assert.match(env.body, /blocking nobody/);
});

test("claims: a mixed board counts the stale rows and leaves the live ones unmarked", async () => {
  const ledger = makeFakeLedger({
    rows: [
      doc({ unitId: "story-x", sessionId: "live-wt", grade: "work", intent: "real" }),
      doc({ unitId: "story-x", sessionId: "ghost-a", grade: "waiting", heartbeatAt: STALE_BEAT }),
      doc({ unitId: "story-x", sessionId: "ghost-b", grade: "waiting", heartbeatAt: STALE_BEAT }),
    ],
  });
  const env = await claimLedgerCommand("claims", "story-x", {}, deps(ledger));
  const lines = env.body.split("\n");
  assert.doesNotMatch(lines[1] ?? "", /STALE/, "the live holder carries no marker");
  assert.match(lines[2] ?? "", /STALE/);
  assert.match(env.body, /2 of 3 rows above are STALE/);
});

test("refusal: the holder's LIVENESS is stated, not left for the session to guess", async () => {
  // The line ADR-0346 D1 depends on. "Held by X" leaves the only actionable question — queue behind
  // a live builder, or take over a dead one — unanswered by the message that raises it.
  const ledger = makeFakeLedger({
    nextResult: {
      acquired: false,
      heldBy: doc({
        unitId: "story-x",
        sessionId: "other-wt",
        grade: "work",
        intent: "real",
        heartbeatAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      }),
    },
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  assert.equal(env.ok, false);
  // WHO / ROLE / PROSE / HELD-FOR / LIVENESS — the four things ADR-0346 D3 says a refusal owes a
  // blocked session, in one line, from the ONE shared describer.
  assert.match(
    env.body,
    /HELD by other-wt \(branch .*, role proving, intent "real", held 0m, LIVE — heartbeat 5m ago\)/,
  );
});

test("refusal: the holder's ROLE and PROSE are both named — the actionable half (ADR-0346 D3)", async () => {
  // A POST-SPLIT holder: a typed role AND its own words. Before D3 this line could only say
  // `intent "orchestrate"`, which is what 15 of the 16 refusals measured to 2026-08-11 said.
  const ledger = makeFakeLedger({
    nextResult: {
      acquired: false,
      heldBy: doc({
        unitId: "story-x",
        sessionId: "other-wt",
        grade: "work",
        role: "authoring",
        intent: "rewriting the UAT criteria for the traversal panel",
        claimedAt: new Date(NOW.getTime() - 2 * 60 * 60_000).toISOString(),
        heartbeatAt: new Date(NOW.getTime() - 60_000).toISOString(),
      }),
    },
  });
  const env = await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  assert.equal(env.ok, false);
  assert.match(env.body, /role authoring/);
  assert.match(env.body, /intent "rewriting the UAT criteria for the traversal panel"/);
  assert.match(env.body, /held 2h/, "the claim's own age, distinct from the heartbeat age");
  assert.match(env.body, /LIVE — heartbeat 1m ago/);
  assert.doesNotMatch(env.body, /intent "orchestrate"/);
});

// ---------------------------------------------------------------------------
// mine — this session's holdings, no unit id (ADR-0346 D1 companion work)
// ---------------------------------------------------------------------------

test("mine: needs no unit id — it reads THIS session's rows, asking for the stale ones too", async () => {
  const ledger = makeFakeLedger({
    ownRows: [
      doc({ unitId: "noticeboard-cli", sessionId: "wt-ledger", grade: "work", intent: "building" }),
      doc({
        unitId: "drive-machinery",
        sessionId: "wt-ledger",
        grade: "exploring",
        intent: "left behind",
        heartbeatAt: STALE_BEAT,
      }),
    ],
  });
  const env = await claimLedgerCommand("mine", undefined, {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(
    ledger.bySession,
    [{ sessionId: "wt-ledger", opts: { includeStale: true } }],
    "a session must see its OWN ghosts — they are what other sessions collide with",
  );
  assert.match(env.body, /Claims held by this session \(wt-ledger, branch claude\/ledger\)/);
  assert.match(env.body, /- noticeboard-cli {2}\[work\/supplementing\] {2}0m {2}intent "building"$/m);
  assert.match(env.body, /- drive-machinery {2}\[exploring\/supplementing\].*STALE 4h — reclaimable/);
  assert.match(env.body, /2 rows: 1 live, 1 stale\./);
  assert.match(env.body, /release it rather than leaving it to age out/);
});

test("mine: a session holding nothing gets a plain no — the merge-ceremony check, not an error", async () => {
  const ledger = makeFakeLedger({ ownRows: [] });
  const env = await claimLedgerCommand("mine", undefined, {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /holds NO claims on the ledger — live or stale/);
  assert.match(env.body, /ADR-0200 D3/);
  assert.ok(env.next?.some((n) => n.includes("noticeboard declare")));
});

test("mine: all-live holdings say so without the release nudge", async () => {
  const ledger = makeFakeLedger({
    ownRows: [doc({ unitId: "noticeboard-cli", sessionId: "wt-ledger", grade: "work" })],
  });
  const env = await claimLedgerCommand("mine", undefined, {}, deps(ledger));
  assert.match(env.body, /1 row: 1 live, 0 stale\./);
  assert.doesNotMatch(env.body, /STALE/);
  assert.doesNotMatch(env.body, /age out/);
});

test("mine: offline and identity-less refusals match every other write-ish verb", async () => {
  const offline = await claimLedgerCommand("mine", undefined, {}, deps(null));
  assert.equal(offline.ok, false);
  assert.match(offline.body, /requires the live store \(--pg\)/);

  const anon = await claimLedgerCommand("mine", undefined, {}, deps(makeFakeLedger(), null));
  assert.equal(anon.ok, false);
  assert.match(anon.body, /worktree|identity/i);
});

// ---------------------------------------------------------------------------
// The claim namespace (ADR-0310 D2) — refuse an id that names nothing
// ---------------------------------------------------------------------------

/**
 * A universe knowing exactly one story, so a claim on anything else is a phantom. Injected as a
 * loader rather than reached through the real corpus: these tests are about what the VERB does with
 * the answer, not about how the answer is gathered (that is `claim-universe.test.ts`).
 */
const KNOWS_STORY_X: NonNullable<ClaimLedgerDeps["universe"]> = async () => ({
  targets: [
    { id: "story-x", kind: "story" },
    // The grain a session is supposed to claim at (ADR-0270 D1 / ADR-0346 D2) …
    { id: "cap-x", kind: "capability" },
    // … and the one story shape whose id still names real work: the UAT node `story build` drives.
    { id: "driven-x", kind: "story", uatWitness: "machine" },
  ],
  nonClaimable: [{ id: "session-orchestrator", kind: "agent" }],
  complete: true,
  unreadSources: [],
});

function depsWithUniverse(claims: ClaimLedgerStoreLike | null): ClaimLedgerDeps {
  return { ...deps(claims), universe: KNOWS_STORY_X };
}

test("claim: an id that names NOTHING is refused, and no row is written", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand(
    "claim",
    "story-xx",
    { grade: "work" },
    depsWithUniverse(ledger),
  );
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /REFUSED/);
  assert.match(env.body, /names nothing in the work graph/);
  assert.match(env.body, /story-x {2}\[story\]/, "the near-miss is named");
  assert.deepEqual(ledger.takes, [], "the phantom NEVER reaches the store");
});

test("claim: the refusal lands BEFORE the missing-intent refusal — the id is the thing to fix", async () => {
  // An exploring claim needs --intent. Told that about an id naming nothing, a session would
  // supply the intent and then take the phantom row anyway.
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("claim", "story-xx", {}, depsWithUniverse(ledger));
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /names nothing in the work graph/);
  assert.doesNotMatch(env.body, /requires --intent/);
});

test("claim: a resolvable id passes through and the success line NAMES THE KIND", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand(
    "claim",
    "cap-x",
    { grade: "work" },
    depsWithUniverse(ledger),
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Work claim acquired on "cap-x" \[capability\] — the wisp is lit/);
  assert.equal(ledger.takes.length, 1);
});

// ---------------------------------------------------------------------------
// The story-grain fence (ADR-0346 D2)
// ---------------------------------------------------------------------------

test("claim --grade work on a STORY is refused — the grain retired (ADR-0346 D2), and no row is written", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand(
    "claim",
    "story-x",
    { grade: "work" },
    depsWithUniverse(ledger),
  );
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /is a STORY, and a story is no longer a work claim/);
  assert.deepEqual(ledger.takes, [], "the retired grain never reaches the store");
});

test("the story TIER stays claimable where it names real work — a uat_witness: machine UAT node", async () => {
  // `story build` claims `story.id` for exactly this shape, alongside the story's members. The
  // fence reads the TREE to tell it from a fence-story; it never pattern-matches the id.
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand(
    "claim",
    "driven-x",
    { grade: "work" },
    depsWithUniverse(ledger),
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Work claim acquired on "driven-x" \[story\]/);
});

test("the SHARED grades on a story are untouched by D2 — exploring is the hovering wisp", async () => {
  const ledger = makeFakeLedger();
  const exploring = await claimLedgerCommand(
    "claim",
    "story-x",
    { grade: "exploring", intent: "reading across the story" },
    depsWithUniverse(ledger),
  );
  assert.equal(exploring.ok, true, exploring.body);
  const waiting = await claimLedgerCommand(
    "claim",
    "story-x",
    { grade: "waiting" },
    depsWithUniverse(ledger),
  );
  assert.equal(waiting.ok, true, waiting.body);
  assert.equal(ledger.takes.length, 2, "both shared takes reached the store");
});

test("upgrade on a STORY is fenced too — it ENDS in a work row", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("upgrade", "story-x", {}, depsWithUniverse(ledger));
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /is a STORY, and a story is no longer a work claim/);
  assert.deepEqual(ledger.upgrades, [], "leaving it open would leave the grain reachable");
});

test("with NO universe the story fence stands DOWN — it fails open with the check that feeds it", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("claim", "story-x", { grade: "work" }, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.equal(ledger.takes.length, 1);
});

test("claim: with NO universe the line omits the kind rather than guessing `story`", async () => {
  // The pre-ADR-0310 render said "the STORY wisp is lit" for any string. Unchecked, it now says
  // only what it knows.
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("claim", "anything", { grade: "work" }, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Work claim acquired on "anything" — the wisp is lit/);
  assert.doesNotMatch(env.body, /\[story\]/);
});

test("claim: an addressable-but-not-claimable artifact is refused as what it IS", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand(
    "claim",
    "session-orchestrator",
    { grade: "work" },
    depsWithUniverse(ledger),
  );
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /session-orchestrator {2}\[agent\]/);
  assert.match(env.body, /not a claimable work unit/);
  assert.deepEqual(ledger.takes, []);
});

test("upgrade: fenced too — it CREATES a work row, so a phantom reaches the ledger through it", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("upgrade", "story-xx", {}, depsWithUniverse(ledger));
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /names nothing in the work graph/);
  assert.deepEqual(ledger.upgrades, []);
});

test("release / downgrade / claims are NOT fenced — they take no claim", async () => {
  // Refusing a release on an unresolvable id would strand the 26 measured phantoms permanently:
  // the remedy for a bad row is to be able to drop it.
  const ledger = makeFakeLedger({ rows: [doc({ unitId: "whoami", sessionId: "wt-ledger" })] });
  const released = await claimLedgerCommand("release", "whoami", {}, depsWithUniverse(ledger));
  assert.equal(released.ok, true, released.body);
  assert.deepEqual(ledger.releases, [{ unitId: "whoami", sessionId: "wt-ledger" }]);

  const down = await claimLedgerCommand(
    "downgrade",
    "whoami",
    { grade: "exploring" },
    depsWithUniverse(ledger),
  );
  assert.equal(down.ok, true, down.body);

  const board = await claimLedgerCommand("claims", "whoami", {}, depsWithUniverse(ledger));
  assert.equal(board.ok, true, board.body);
});
