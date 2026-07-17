import test from "node:test";
import assert from "node:assert/strict";

import type {
  ClaimDocT,
  ClaimRequest,
  ClaimResult,
  SessionClaimGroup,
} from "@storytree/notice-board";

import {
  deriveIdentity,
  noticeboardCommand,
  renderLedgerBoard,
  type ClaimLedgerReadLike,
  type SessionClaimStoreLike,
  type SessionIdentity,
  type NoticeboardDeps,
} from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fixed clock + helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-11T10:00:00.000Z");
const nowFn = () => NOW;

// ---------------------------------------------------------------------------
// deriveIdentity
// ---------------------------------------------------------------------------

test("deriveIdentity: recognises a .claude/worktrees/<name> path with forward slashes", () => {
  const result = deriveIdentity((args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      return "/home/user/.claude/worktrees/my-session-abc123";
    }
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
      return "claude/real/my-feature";
    }
    return "";
  });
  assert.ok(result !== null, "should return an identity");
  assert.equal(result.sessionId, "my-session-abc123");
  assert.equal(result.branch, "claude/real/my-feature");
});

test("deriveIdentity: recognises a .claude/worktrees/<name> path with backslashes", () => {
  const result = deriveIdentity((args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      return "C:\\Users\\user\\.claude\\worktrees\\wt-session-xyz";
    }
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
      return "claude/some-branch";
    }
    return "";
  });
  assert.ok(result !== null, "should return an identity");
  assert.equal(result.sessionId, "wt-session-xyz");
  assert.equal(result.branch, "claude/some-branch");
});

test("deriveIdentity: returns null for a plain checkout (not under .claude/worktrees/)", () => {
  const result = deriveIdentity((args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      return "/home/user/projects/storytree";
    }
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
      return "main";
    }
    return "";
  });
  assert.equal(result, null);
});

test("deriveIdentity: returns null when git throws (not a git repo or other error)", () => {
  const result = deriveIdentity((_args) => {
    throw new Error("not a git repository");
  });
  assert.equal(result, null);
});

test("deriveIdentity: returns null for a .claude/worktrees prefix without a subdirectory name", () => {
  // The basename of ".claude/worktrees/" would be empty — reject
  const result = deriveIdentity((args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      // No name after worktrees — just /worktrees itself
      return "/home/user/projects/some-repo";
    }
    return "main";
  });
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Fake claim stores (the ONE machinery — presence is retired, ADR-0200 D7)
// ---------------------------------------------------------------------------

interface FakeClaims extends SessionClaimStoreLike {
  claimed: ClaimRequest[];
  releasedSessions: string[];
  /** When set, claim() refuses every request with this holder. */
  refuseWith?: ClaimDocT;
  /** When set, claim()/releaseClaimsBySession() throw. */
  throwing?: boolean;
  releaseCount: number;
}

function makeFakeClaims(over: Partial<FakeClaims> = {}): FakeClaims {
  const self: FakeClaims = {
    claimed: [],
    releasedSessions: [],
    releaseCount: 0,
    async claim(req: ClaimRequest): Promise<ClaimResult> {
      if (self.throwing === true) throw new Error("claim store unavailable");
      self.claimed.push(req);
      if (self.refuseWith !== undefined) return { acquired: false, heldBy: self.refuseWith };
      return {
        acquired: true,
        reclaimed: false,
        claim: {
          unitId: req.unitId,
          sessionId: req.sessionId,
          branch: req.branch,
          intent: req.intent ?? "",
          claimedAt: NOW.toISOString(),
          heartbeatAt: NOW.toISOString(),
        },
      };
    },
    async releaseClaimsBySession(sessionId: string): Promise<number> {
      if (self.throwing === true) throw new Error("claim store unavailable");
      self.releasedSessions.push(sessionId);
      return self.releaseCount;
    },
    ...over,
  };
  return self;
}

/** Build a live ClaimDocT (fresh heartbeat so the by-session fold never drops it). */
function makeClaimDoc(overrides: Partial<ClaimDocT> & Pick<ClaimDocT, "unitId" | "sessionId">): ClaimDocT {
  return {
    branch: "claude/some-branch",
    intent: "",
    claimedAt: NOW.toISOString(),
    heartbeatAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeFakeLedger(claims: ClaimDocT[]): ClaimLedgerReadLike & { calls: number } {
  const self = {
    calls: 0,
    async listLiveClaims(): Promise<ClaimDocT[]> {
      self.calls += 1;
      return claims;
    },
  };
  return self;
}

const CLAIM_IDENTITY: SessionIdentity = { sessionId: "wt-claim", branch: "claude/claim-branch" };

// ---------------------------------------------------------------------------
// Board (undefined sub) — the ledger IS the board (ADR-0200 D7)
// ---------------------------------------------------------------------------

test("board: no ledger (offline) → the empty no-live-claims render, ok:true, NEVER a presence read", async () => {
  const deps: NoticeboardDeps = { identity: null, now: nowFn };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Claim ledger \(ADR-0200\):/);
  assert.match(env.body, /No live claims on the ledger\./);
  assert.match(env.body, /offline — pass --pg/);
  assert.doesNotMatch(env.body, /Active sessions/, "the legacy presence board is retired");
  assert.doesNotMatch(env.body, /Presence/, "no presence section survives (ADR-0200 D7)");
});

test("board: ledger null behaves exactly like ledger absent (the offline empty render)", async () => {
  const absent = await noticeboardCommand(undefined, { nodes: [] }, { identity: null, now: nowFn });
  const nulled = await noticeboardCommand(
    undefined,
    { nodes: [] },
    { identity: null, now: nowFn, ledger: null },
  );
  assert.deepEqual(nulled, absent);
});

test("board: with a ledger the claim ledger renders grouped by session — the ONLY section", async () => {
  const ledger = makeFakeLedger([
    makeClaimDoc({
      unitId: "story-x",
      sessionId: "wt-claimer",
      branch: "claude/claimer",
      grade: "exploring",
      intent: "what I'm thinking",
      claimedAt: new Date(NOW.getTime() - 3 * 60_000).toISOString(),
    }),
  ]);

  const deps: NoticeboardDeps = { identity: null, now: nowFn, ledger };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.equal(ledger.calls, 1, "the ledger was read once");

  assert.match(env.body, /Claim ledger \(ADR-0200\):/);
  assert.match(env.body, /## wt-claimer  branch=claude\/claimer/);
  assert.match(env.body, /- story-x {2}\[exploring\] {2}3m {2}what I'm thinking/);
  assert.doesNotMatch(env.body, /Presence/, "presence is retired — the ledger is the whole board");

  // next points at the claim verbs (ADR-0200).
  assert.ok(
    env.next !== undefined && env.next.some((n) => n.includes("noticeboard claim") && n.includes("--grade")),
    "next suggests the claim verb",
  );
});

test("board: with a ledger but no live claims the no-live-claims line renders", async () => {
  const deps: NoticeboardDeps = { identity: null, now: nowFn, ledger: makeFakeLedger([]) };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /No live claims on the ledger\./);
  assert.doesNotMatch(env.body, /offline/, "a live empty ledger is not the offline hint");
});

// ---------------------------------------------------------------------------
// renderLedgerBoard (pure)
// ---------------------------------------------------------------------------

test("renderLedgerBoard: fixed groups render sessions in order with branch, graded claims, ages, intent", () => {
  const groups: SessionClaimGroup[] = [
    {
      sessionId: "wt-old",
      branch: "claude/old-branch",
      claims: [
        {
          unitId: "story-x",
          grade: "work",
          intent: "building x",
          ageMs: 5 * 60_000,
          claimedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
        },
        {
          unitId: "story-y",
          grade: "exploring",
          intent: "poking around y",
          ageMs: 90 * 60_000,
          claimedAt: new Date(NOW.getTime() - 90 * 60_000).toISOString(),
        },
      ],
    },
    {
      sessionId: "wt-new",
      branch: "claude/new-branch",
      claims: [
        {
          unitId: "story-z",
          grade: "waiting",
          intent: "",
          ageMs: 2 * 60_000,
          claimedAt: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
        },
      ],
    },
  ];
  const body = renderLedgerBoard(groups);
  assert.equal(
    body,
    [
      "Claim ledger (ADR-0200):",
      "",
      "## wt-old  branch=claude/old-branch",
      "  - story-x  [work]  5m  building x",
      "  - story-y  [exploring]  1h  poking around y",
      "",
      "## wt-new  branch=claude/new-branch",
      "  - story-z  [waiting]  2m",
    ].join("\n"),
  );
});

test("renderLedgerBoard: an empty ledger renders the clear no-live-claims line", () => {
  const body = renderLedgerBoard([]);
  assert.match(body, /Claim ledger \(ADR-0200\):/);
  assert.match(body, /No live claims on the ledger\./);
});

// ---------------------------------------------------------------------------
// declare — refusals (presence retired: the claim store is the requirement)
// ---------------------------------------------------------------------------

test("declare: null claims store → ok:false, next mentions pnpm db:up", async () => {
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims: null };
  const env = await noticeboardCommand("declare", { workingOn: "test task", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false);
  assert.ok(env.next !== undefined && env.next.some((n) => n.includes("pnpm db:up")));
});

test("declare: null identity → ok:false with guidance about worktree identity derivation", async () => {
  const deps: NoticeboardDeps = { identity: null, now: nowFn, claims: makeFakeClaims() };
  const env = await noticeboardCommand("declare", { workingOn: "some work", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /worktree|identity/i);
});

test("declare: blank workingOn → ok:false polite refusal", async () => {
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims: makeFakeClaims() };
  const env = await noticeboardCommand("declare", { workingOn: "   ", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /workingOn|working.on/i);
});

test("declare: missing workingOn → ok:false polite refusal", async () => {
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims: makeFakeClaims() };
  const env = await noticeboardCommand("declare", { nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /workingOn|working.on/i);
});

test("declare: no --node → ok:false ceremony guidance (the claim IS the declaration, ADR-0200)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /--node/);
  assert.match(env.body, /ADR-0200/);
  assert.equal(claims.claimed.length, 0, "no node → no claim is ever taken");
});

// ---------------------------------------------------------------------------
// declare — the claim-taking anchor ceremony (ADR-0142)
// ---------------------------------------------------------------------------

test("declare --node takes the work-time claim on each declared node (orchestrate intent, identity attribution)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "landing ADR-0142", nodes: ["story-a", "story-b"] },
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(
    claims.claimed.map((r) => ({ unitId: r.unitId, sessionId: r.sessionId, branch: r.branch, intent: r.intent })),
    [
      { unitId: "story-a", sessionId: "wt-claim", branch: "claude/claim-branch", intent: "orchestrate" },
      { unitId: "story-b", sessionId: "wt-claim", branch: "claude/claim-branch", intent: "orchestrate" },
    ],
  );
  assert.match(env.body, /story-a: claimed/);
  assert.match(env.body, /wisp is lit/);
  assert.match(env.body, /workingOn: {2}landing ADR-0142/);
});

test("declare: a claim REFUSAL never fails the declare — the holder is named per node", async () => {
  const claims = makeFakeClaims({
    refuseWith: {
      unitId: "story-a",
      sessionId: "other-session",
      branch: "claude/other",
      intent: "orchestrate",
      claimedAt: NOW.toISOString(),
      heartbeatAt: NOW.toISOString(),
    },
  });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /HELD by other-session/);
  assert.match(env.body, /claude\/other/);
});

test("declare: a THROWING claim store never crashes the declare — surfaced as FAILED, wisp not lit", async () => {
  const claims = makeFakeClaims({ throwing: true });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /claim write FAILED/);
  assert.match(env.body, /wisp NOT lit/);
});

test("declare: next points onward to the first node's tree + the board", async () => {
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims: makeFakeClaims() };
  const env = await noticeboardCommand("declare", { workingOn: "doing a thing", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, true);
  assert.ok(
    env.next !== undefined && env.next.some((n) => n.includes("tree story-a")),
    "next should point at the anchored story's tree",
  );
  assert.ok(
    env.next !== undefined && env.next.some((n) => n.includes("noticeboard") && n.includes("--pg")),
    "next should include the board command",
  );
});

// ---------------------------------------------------------------------------
// done — the bulk release (ADR-0142)
// ---------------------------------------------------------------------------

test("done: null claims store → ok:false, next mentions pnpm db:up", async () => {
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims: null };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.ok(env.next !== undefined && env.next.some((n) => n.includes("pnpm db:up")));
});

test("done: null identity → ok:false with worktree guidance", async () => {
  const deps: NoticeboardDeps = { identity: null, now: nowFn, claims: makeFakeClaims() };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /worktree|identity/i);
});

test("done releases every claim the session holds and reports the count", async () => {
  const claims = makeFakeClaims({ releaseCount: 2 });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(claims.releasedSessions, ["wt-claim"]);
  assert.match(env.body, /Released 2 story claims/);
});

test("done with nothing held is a plain ok, not an error", async () => {
  const claims = makeFakeClaims({ releaseCount: 0 });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /nothing to release/i);
});

test("done: a THROWING claim release surfaces the stale-reclaim note", async () => {
  const claims = makeFakeClaims({ throwing: true });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /Claim release FAILED/);
  assert.match(env.body, /stale-reclaim/);
});

// ---------------------------------------------------------------------------
// Unknown sub-command → help envelope
// ---------------------------------------------------------------------------

test("unknown subcommand returns a help envelope listing declare, done, and the board", async () => {
  const deps: NoticeboardDeps = { identity: null, now: nowFn };
  const env = await noticeboardCommand("frobnicate", { nodes: [] }, deps);
  // The help envelope should mention the three valid sub-commands
  assert.match(env.body, /declare/);
  assert.match(env.body, /done/);
  // 'noticeboard' or listing of sub-commands
  assert.match(env.body, /noticeboard/);
});
