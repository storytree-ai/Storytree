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

/**
 * A fake over the exact answers `deriveIdentity` asks git for, shaped like real git: a LINKED
 * worktree reports `--git-dir` = `<common>/worktrees/<adminId>` against a `--git-common-dir` of
 * `<common>`, while the PRIMARY CHECKOUT reports the same path for both. Every fixture below is a
 * real reading taken from `git rev-parse` on the dev box, not an invented shape.
 */
function gitFake(opts: {
  toplevel: string;
  gitDir: string;
  commonDir: string;
  branch?: string;
}): (args: string[]) => string {
  return (args: string[]): string => {
    if (args[1] === "--show-toplevel") return opts.toplevel;
    if (args[2] === "--git-dir") return opts.gitDir;
    if (args[2] === "--git-common-dir") return opts.commonDir;
    if (args[1] === "--abbrev-ref") return opts.branch ?? "main";
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };
}

test("deriveIdentity: THE PRIMARY CHECKOUT stays refused — git-dir === git-common-dir (ADR-0033 D1's load-bearing half)", () => {
  // Unchanged by the widening and asserted separately from it: the shared lobby has no isolated
  // identity to claim under, so it cannot satisfy the merge ceremony's explicit claim requirement.
  assert.equal(
    deriveIdentity(
      gitFake({
        toplevel: "/home/user/projects/storytree",
        gitDir: "/home/user/projects/storytree/.git",
        commonDir: "/home/user/projects/storytree/.git",
      }),
    ),
    null,
  );
  // Same verdict when git hands the two answers back with skewed separators / a trailing slash.
  assert.equal(
    deriveIdentity(
      gitFake({
        toplevel: "C:/code/storytree",
        gitDir: "C:\\code\\storytree\\.git",
        commonDir: "C:/code/storytree/.git/",
      }),
    ),
    null,
    "separator or trailing-slash skew must not read as a linked worktree",
  );
});

test("deriveIdentity: THE FIX — a git-registered linked worktree OUTSIDE .claude/ resolves (the Codex shape)", () => {
  // The decisive 2026-07-25 observation: `git worktree list` registered this checkout and
  // `noticeboard declare` refused it anyway, fencing a whole runtime out of the merge ceremony.
  const result = deriveIdentity(
    gitFake({
      toplevel: "C:/Users/mickh/.codex/worktrees/0a10/storytree",
      gitDir: "C:/code/storytree/.git/worktrees/storytree4",
      commonDir: "C:/code/storytree/.git",
      branch: "codex/some-branch",
    }),
  );
  assert.ok(result !== null, "a registered linked worktree must resolve, whatever its parent path");
  assert.equal(result.sessionId, "storytree4");
  assert.equal(result.branch, "codex/some-branch");

  // Not a Codex-specific carve-out — any registered linked worktree at any path.
  const sibling = deriveIdentity(
    gitFake({
      toplevel: "C:/code/storytree-adr0253",
      gitDir: "C:/code/storytree/.git/worktrees/storytree-adr0253",
      commonDir: "C:/code/storytree/.git",
    }),
  );
  assert.equal(sibling?.sessionId, "storytree-adr0253");
});

test("deriveIdentity: worktrees sharing a PATH basename get DISTINCT identities — the collision the widening must not create", () => {
  // The proposal's Risks section, and it is not hypothetical: on the dev box SIX Codex worktrees
  // share the path basename `storytree` and five `--real` replicas share `wt`. Deriving from the
  // path basename would collapse them onto ONE claim — strictly worse than the refusal being
  // fixed. Git's admin-dir id is already de-duplicated per repository, so it path-qualifies for us.
  const first = deriveIdentity(
    gitFake({
      toplevel: "C:/Users/mickh/.codex/worktrees/274b/storytree",
      gitDir: "C:/code/storytree/.git/worktrees/storytree",
      commonDir: "C:/code/storytree/.git",
    }),
  );
  const second = deriveIdentity(
    gitFake({
      toplevel: "C:/Users/mickh/.codex/worktrees/4744/storytree",
      gitDir: "C:/code/storytree/.git/worktrees/storytree1",
      commonDir: "C:/code/storytree/.git",
    }),
  );
  assert.equal(first?.sessionId, "storytree");
  assert.equal(second?.sessionId, "storytree1");
  assert.notEqual(
    first?.sessionId,
    second?.sessionId,
    "two sessions on one claim is worse than the refusal this fix removes",
  );
});

test("deriveIdentity: a RENAMED .claude/worktrees slot keeps its slot name, not git's admin id", () => {
  // Why rule 1 stays first and separate instead of folding into the git-dir rule. Real fixture:
  // `.claude/worktrees/gemini-subagents-preserved` has admin dir `gemini-subagents` because the
  // directory was renamed after creation. Folding the rules would silently re-key its live claims.
  const result = deriveIdentity(
    gitFake({
      toplevel: "C:/code/storytree/.claude/worktrees/gemini-subagents-preserved",
      gitDir: "C:/code/storytree/.git/worktrees/gemini-subagents",
      commonDir: "C:/code/storytree/.git",
    }),
  );
  assert.equal(result?.sessionId, "gemini-subagents-preserved");
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
  /** When set, claim() refuses with this holder — every request, or only {@link refuseUnits}. */
  refuseWith?: ClaimDocT;
  /** Scopes {@link refuseWith} to these unit ids; absent = refuse every request (the old shape). */
  refuseUnits?: readonly string[];
  /** When set, claim()/releaseClaimsBySession() throw. */
  throwing?: boolean;
  /** Scopes the claim() throw to these unit ids — a store hiccup on SOME nodes, not all. */
  throwUnits?: readonly string[];
  releaseCount: number;
}

function makeFakeClaims(over: Partial<FakeClaims> = {}): FakeClaims {
  const self: FakeClaims = {
    claimed: [],
    releasedSessions: [],
    releaseCount: 0,
    async claim(req: ClaimRequest): Promise<ClaimResult> {
      if (self.throwing === true || self.throwUnits?.includes(req.unitId) === true) {
        throw new Error("claim store unavailable");
      }
      self.claimed.push(req);
      if (
        self.refuseWith !== undefined &&
        (self.refuseUnits === undefined || self.refuseUnits.includes(req.unitId))
      ) {
        return { acquired: false, heldBy: self.refuseWith };
      }
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
  // The all-claimed render stays byte-compatible: only the arms that took LESS than they were
  // asked for changed. A session that got what it asked for reads exactly what it always did.
  assert.match(env.body, /^Declared session "wt-claim" on the claim ledger\.$/m);
  assert.doesNotMatch(env.body, /PARTIAL|UNCLAIMED|Withheld/);
});

// ---------------------------------------------------------------------------
// declare — success and fidelity are the SAME thing (cli-write-fidelity-arc)
//
// The verb reports what the session HOLDS when it returns, not that it tried. Until this landed,
// every arm printed `Declared session "<x>"` and exited 0 — so a declare whose nodes were all
// already held read as done, and the session learned it was unclaimed at `check:declared`, ten
// rungs and ~10 minutes into `pnpm gate`, after the work. Filed independently by two sibling
// sessions 20 minutes apart on 2026-08-04.
// ---------------------------------------------------------------------------

const OTHER_HOLDER: ClaimDocT = {
  unitId: "story-a",
  sessionId: "other-session",
  branch: "claude/other",
  intent: "orchestrate",
  claimedAt: NOW.toISOString(),
  heartbeatAt: NOW.toISOString(),
};

test("declare: EVERY node held → ok:false, the headline says it anchored nothing, holder named", async () => {
  const claims = makeFakeClaims({ refuseWith: OTHER_HOLDER });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false, "a declare that took no claim is not a declare");
  assert.match(env.body, /Declare took NO claim/);
  assert.match(env.body, /nothing was anchored/);
  assert.doesNotMatch(
    env.body,
    /^Declared session/m,
    "the success headline must not survive a total refusal — that is the whole defect",
  );
  // The per-node board survives untouched: it is what the session judges from (ADR-0270 D2).
  assert.match(env.body, /HELD by other-session/);
  assert.match(env.body, /claude\/other/);
});

test("declare: the refusal never asserts the SESSION is unclaimed — it knows only what it took", async () => {
  // This seam takes claims; it does not read the session's other rows. A session that declared a
  // second unit after a first usually DOES hold one, so "session is UNCLAIMED" would be this verb
  // committing the same overclaim it exists to fix. Measured live on 2026-08-05: the refusal fired
  // for a held node while the session held another capability the whole time.
  const claims = makeFakeClaims({ refuseWith: OTHER_HOLDER });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.doesNotMatch(env.body, /is UNCLAIMED/);
  assert.doesNotMatch(env.body, /this session holds NO live claim/);
  assert.match(env.body, /this declare anchored NOTHING/);
  assert.match(env.body, /If this session holds no other live claim/, "the ceremony shortfall is conditional");
});

test("declare: a total refusal explains the ceremony requirement and ADR-0270 D2 remedies", async () => {
  const claims = makeFakeClaims({ refuseWith: OTHER_HOLDER });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false);
  assert.match(
    env.body,
    /not ready for the merge ceremony/,
    "names the explicit ceremony requirement",
  );
  assert.match(env.body, /explicit live noticeboard claim/, "names the required claim state");
  assert.match(env.body, /ADR-0270 D2/, "resolving the conflict is the session's own call");
  assert.match(env.body, /not an owner question/);
  // The remedy the measured sessions eventually reached for, offered up front.
  assert.ok(
    env.next?.some((n) => n.includes("claim story-a") && n.includes("--grade waiting")),
    `next should offer the waiting claim; got ${JSON.stringify(env.next)}`,
  );
  assert.ok(
    env.next?.some((n) => n.includes("--node <capability-id>")),
    "next should offer narrowing to the capability actually being written (ADR-0270 D1)",
  );
});

test("declare: PARTIAL — some claimed, some held → ok:true, but the headline names the shortfall", async () => {
  // Decided explicitly, not inherited: the session DOES hold a live claim here, so it satisfies the
  // ceremony requirement and refusing would be a lie in the other direction. It is not writing story-a.
  const claims = makeFakeClaims({ refuseWith: OTHER_HOLDER, refuseUnits: ["story-a"] });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "x", nodes: ["story-a", "story-b"] },
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /PARTIAL: claimed 1 of 2 nodes/);
  assert.match(env.body, /story-a: HELD by other-session/);
  assert.match(env.body, /story-b: claimed — the wisp is lit/);
  assert.match(env.body, /Withheld: story-a/);
  assert.match(env.body, /ADR-0270 D2/);
});

test("declare: a THROWING claim store never crashes the declare — FAILED, wisp not lit, ok:false", async () => {
  const claims = makeFakeClaims({ throwing: true });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false, "a failed write leaves the session just as unclaimed as a refusal");
  assert.match(env.body, /claim write FAILED/);
  assert.match(env.body, /wisp NOT lit/);
  // A store problem is NOT a claim conflict — no re-declare fixes it, so the conflict remedy is
  // withheld and the store probe is offered instead.
  assert.match(env.body, /store problem, not a conflict/);
  assert.doesNotMatch(env.body, /not an owner question/);
  assert.ok(env.next?.some((n) => n.includes("db:probe")), `got ${JSON.stringify(env.next)}`);
});

test("declare: held AND failed together → ok:false with BOTH explanations, neither swallowing the other", async () => {
  const claims = makeFakeClaims({
    refuseWith: OTHER_HOLDER,
    refuseUnits: ["story-a"],
    throwUnits: ["story-b"],
  });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "x", nodes: ["story-a", "story-b"] },
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /Declare took NO claim/);
  assert.match(env.body, /story-a: HELD by other-session/);
  assert.match(env.body, /story-b: claim write FAILED/);
  assert.match(env.body, /not an owner question/, "the held node's remedy");
  assert.match(env.body, /store problem, not a conflict/, "the failed node's remedy");
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

// ---------------------------------------------------------------------------
// declare + the claim namespace (ADR-0310 D2)
// ---------------------------------------------------------------------------

/**
 * A universe knowing story-a and story-b. `declare --node` is the highest-volume claim-taking path
 * and took two of the 26 measured phantoms as PATHS pasted where an id belonged, so it is fenced
 * per node with the same fail-soft posture the loop already takes for a conflict.
 */
const KNOWS_AB: NonNullable<NoticeboardDeps["universe"]> = async () => ({
  targets: [
    { id: "story-a", kind: "story" },
    { id: "story-b", kind: "story" },
  ],
  nonClaimable: [],
  complete: true,
  unreadSources: [],
});

test("declare: an id naming NOTHING is refused per node — no row written, no wisp claimed", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = {
    identity: CLAIM_IDENTITY,
    now: nowFn,
    claims,
    universe: KNOWS_AB,
  };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-c"] }, deps);
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /story-c: NOT CLAIMED/);
  assert.match(env.body, /did you mean story-a \[story\], story-b \[story\]/);
  assert.deepEqual(claims.claimed, [], "the phantom never reaches the store");
  assert.match(env.body, /1 declared id names nothing in the work graph: story-c/);
  assert.match(env.body, /NOT a conflict and NOT a store problem/);
});

test("declare: one bad id never costs the GOOD ones their claims (fail-soft, per node)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = {
    identity: CLAIM_IDENTITY,
    now: nowFn,
    claims,
    universe: KNOWS_AB,
  };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "x", nodes: ["story-a", "stories/story-b", "story-zz"] },
    deps,
  );
  assert.equal(env.ok, true, "the session DOES hold a live claim, so the ceremony is satisfied");
  assert.match(env.body, /PARTIAL: claimed 1 of 3 nodes/);
  assert.match(env.body, /story-a \[story\]: claimed — the wisp is lit/);
  assert.deepEqual(
    claims.claimed.map((c) => c.unitId),
    ["story-a"],
  );
  // The pasted PATH is caught as a path, not as a coincidence.
  assert.match(env.body, /stories\/story-b: NOT CLAIMED.*did you mean story-b \[story\]/);
  assert.match(env.body, /story-zz: NOT CLAIMED/);
  // The unresolved block renders in the PARTIAL arm too: "PARTIAL" alone would read as
  // "a sibling holds it", which is a different situation with a different remedy.
  assert.match(env.body, /2 declared ids name nothing in the work graph/);
});

test("declare: with NO universe every id passes, exactly as before ADR-0310", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["whoami"] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(
    claims.claimed.map((c) => c.unitId),
    ["whoami"],
  );
  assert.doesNotMatch(env.body, /NOT CLAIMED/);
});
