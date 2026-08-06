import test from "node:test";
import assert from "node:assert/strict";

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
  upgrades: Array<{ unitId: string; sessionId: string; opts?: { branch?: string; intent?: string } }>;
  downgrades: Array<{ unitId: string; sessionId: string; grade: string }>;
  releases: Array<{ unitId: string; sessionId: string }>;
  /** Next result take()/upgrade() returns (default: acquired). */
  nextResult?: ClaimResult;
  /** What downgrade()/release() return (default true). */
  boolResult: boolean;
  /** What claimsFor() returns. */
  rows: ClaimDocT[];
}

function makeFakeLedger(over: Partial<FakeLedger> = {}): FakeLedger {
  const self: FakeLedger = {
    takes: [],
    upgrades: [],
    downgrades: [],
    releases: [],
    boolResult: true,
    rows: [],
    async take(req: ClaimRequest): Promise<ClaimResult> {
      self.takes.push(req);
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

test("isClaimLedgerVerb: recognises the five verbs and nothing else", () => {
  for (const v of ["claim", "upgrade", "downgrade", "release", "claims"]) {
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
  assert.match(env.body, /NO work claim/);
  assert.match(env.body, /nothing blocks you/i);
  assert.match(env.body, /ADR-0270/);
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
  assert.match(env.body, /\[work\]\s+other-wt\s+10m\s+branch=claude\/other\s+intent "orchestrate"/);
  assert.match(env.body, /\[waiting\]\s+waiter-wt/);
  assert.match(env.body, /capability you are (actually )?writing/);
  assert.match(env.body, /ADR-0270/);
  assert.match(env.body, /not an owner question/i);
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

test("upgrade queued: reported as waiting in line behind the holder, with the queue position", async () => {
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
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /waiting in line behind holder-wt/);
  assert.match(env.body, /position 1 of 1/);
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
  assert.match(first ?? "", /\[work\]\s+holder-wt\s+3h\s+branch=claude\/other\s+intent "real"/);
  assert.match(second ?? "", /\[waiting\]\s+waiter-wt\s+10m/);
  assert.match(second ?? "", /intent \(none\)/);
  assert.match(third ?? "", /\[work\]\s+legacy-wt/);
});

test("claims: an empty unit reads as no claims, with the claim command as next", async () => {
  const ledger = makeFakeLedger();
  const env = await claimLedgerCommand("claims", "story-x", {}, deps(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /No claims on "story-x"/);
  assert.ok(env.next?.some((n) => n.includes("noticeboard claim story-x")));
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
  targets: [{ id: "story-x", kind: "story" }],
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
    "story-x",
    { grade: "work" },
    depsWithUniverse(ledger),
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Work claim acquired on "story-x" \[story\] — the wisp is lit/);
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
