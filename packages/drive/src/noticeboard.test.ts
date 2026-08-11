import test from "node:test";
import assert from "node:assert/strict";

import { CLAIM_STALE_RECLAIM_MS } from "@storytree/notice-board";
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
  /** The OPTS of every claim — so the ADR-0346 D1 queue-on-refusal is provable at this seam. */
  claimOpts: Array<{ queueOnRefusal?: boolean } | undefined>;
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
    claimOpts: [],
    releasedSessions: [],
    releaseCount: 0,
    async claim(req: ClaimRequest, opts?: { queueOnRefusal?: boolean }): Promise<ClaimResult> {
      if (self.throwing === true || self.throwUnits?.includes(req.unitId) === true) {
        throw new Error("claim store unavailable");
      }
      self.claimed.push(req);
      self.claimOpts.push(opts);
      if (
        self.refuseWith !== undefined &&
        (self.refuseUnits === undefined || self.refuseUnits.includes(req.unitId))
      ) {
        // Mirrors `PgClaimStore` under ADR-0346 D1: a refused work take with queueOnRefusal comes
        // back as the QUEUED arm, in the store's own transaction — never a bare dead end.
        if (opts?.queueOnRefusal === true) {
          return {
            acquired: false,
            queued: true,
            waiting: {
              unitId: req.unitId,
              sessionId: req.sessionId,
              branch: req.branch,
              intent: req.intent ?? "",
              grade: "waiting",
              claimedAt: NOW.toISOString(),
              heartbeatAt: NOW.toISOString(),
            },
            heldBy: self.refuseWith,
          };
        }
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
    async listAllClaims(): Promise<ClaimDocT[]> {
      self.calls += 1;
      return claims;
    },
  };
  return self;
}

/** A heartbeat old enough to be reclaimable at NOW — the ghost the board must SAY is a ghost. */
const STALE_BEAT = new Date(NOW.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString();

const CLAIM_IDENTITY: SessionIdentity = { sessionId: "wt-claim", branch: "claude/claim-branch" };

// ---------------------------------------------------------------------------
// Board (undefined sub) — the ledger IS the board (ADR-0200 D7)
// ---------------------------------------------------------------------------

test("board: no ledger (offline) → UNREAD, never an assertion of absence, ok:true, NEVER a presence read", async () => {
  const deps: NoticeboardDeps = { identity: null, now: nowFn };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Claim ledger \(ADR-0200\):/);
  // Unknown is not empty. An offline board that says "no claims" asserts something about a store
  // it never read — the same shape as the stale-row defect this increment removes.
  assert.match(env.body, /UNREAD — offline/);
  assert.doesNotMatch(env.body, /No claims on the ledger/, "offline never claims the ledger is empty");
  assert.match(env.body, /pass --pg/);
  assert.doesNotMatch(env.body, /Active sessions/, "the legacy presence board is retired");
  assert.doesNotMatch(env.body, /Presence/, "no presence section survives (ADR-0200 D7)");
});

test("board: ledger null behaves exactly like ledger absent (the offline UNREAD render)", async () => {
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
  assert.match(env.body, /- story-x {2}\[exploring\/supplementing\] {2}3m {2}what I'm thinking/);
  assert.doesNotMatch(env.body, /Presence/, "presence is retired — the ledger is the whole board");

  // next points at the claim verbs (ADR-0200).
  assert.ok(
    env.next !== undefined && env.next.some((n) => n.includes("noticeboard claim") && n.includes("--grade")),
    "next suggests the claim verb",
  );
});

test("board: with a ledger holding NO rows at all, the empty line says exactly that", async () => {
  const deps: NoticeboardDeps = { identity: null, now: nowFn, ledger: makeFakeLedger([]) };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /No claims on the ledger — no rows at all, live or stale\./);
  assert.doesNotMatch(env.body, /offline/, "a read empty ledger is not the offline hint");
});

test("board (THE MEASURED DEFECT, 2026-08-11): a stale-only ledger no longer asserts 'no live claims'", async () => {
  // The exact shape measured against the live store: `noticeboard --pg` printed "No live claims on
  // the ledger." while `noticeboard claims forest-world --pg` printed this very row, unmarked and
  // looking alive. Under ADR-0346 D1's binding fence that ghost fences a live session out.
  const ledger = makeFakeLedger([
    makeClaimDoc({
      unitId: "forest-world",
      sessionId: "procedural-arch",
      branch: "claude/procedural-arch",
      grade: "exploring",
      intent: "procedural architecture",
      claimedAt: new Date(NOW.getTime() - 554 * 3_600_000).toISOString(),
      heartbeatAt: STALE_BEAT,
    }),
  ]);
  const env = await noticeboardCommand(undefined, { nodes: [] }, { identity: null, now: nowFn, ledger });

  assert.equal(env.ok, true, env.body);
  assert.doesNotMatch(env.body, /No claims on the ledger/, "the ledger is NOT empty — saying so was the defect");
  assert.match(env.body, /No LIVE claims on the ledger — but it is not empty/);
  assert.match(env.body, /STALE — 1 row across 1 session/);
  assert.match(env.body, /## procedural-arch  branch=claude\/procedural-arch  \[STALE\]/);
  assert.match(env.body, /- forest-world  \[exploring\/supplementing\] {2}554h {2}STALE 4h — reclaimable {2}procedural architecture/);
});

test("board: a live session's own stale row rides through MARKED, in its own section", async () => {
  const ledger = makeFakeLedger([
    makeClaimDoc({
      unitId: "noticeboard-cli",
      sessionId: "wt-live",
      branch: "claude/live",
      grade: "work",
      intent: "building",
      claimedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    }),
    makeClaimDoc({
      unitId: "abandoned-unit",
      sessionId: "wt-live",
      branch: "claude/live",
      grade: "exploring",
      intent: "left behind",
      claimedAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
      heartbeatAt: STALE_BEAT,
    }),
  ]);
  const env = await noticeboardCommand(undefined, { nodes: [] }, { identity: null, now: nowFn, ledger });

  assert.match(env.body, /## wt-live  branch=claude\/live$/m, "one live row keeps the session out of the STALE section");
  assert.doesNotMatch(env.body, /STALE — /, "no dark-session section: this session is live");
  assert.match(env.body, /- noticeboard-cli  \[work\/supplementing\] {2}10m {2}building/);
  assert.match(env.body, /- abandoned-unit  \[exploring\/supplementing\] {2}20m {2}STALE 4h — reclaimable {2}left behind/);
});

// ---------------------------------------------------------------------------
// renderLedgerBoard (pure)
// ---------------------------------------------------------------------------

test("renderLedgerBoard: fixed groups render sessions in order with branch, graded claims, ages, intent", () => {
  const entry = (
    unitId: string,
    grade: SessionClaimGroup["claims"][number]["grade"],
    intent: string,
    ageMinutes: number,
    role: SessionClaimGroup["claims"][number]["role"] = "supplementing",
  ): SessionClaimGroup["claims"][number] => ({
    unitId,
    grade,
    role,
    intent,
    ageMs: ageMinutes * 60_000,
    claimedAt: new Date(NOW.getTime() - ageMinutes * 60_000).toISOString(),
    stale: false,
    heartbeatAgeMs: 0,
  });
  const groups: SessionClaimGroup[] = [
    {
      sessionId: "wt-old",
      branch: "claude/old-branch",
      stale: false,
      claims: [
        entry("story-x", "work", "building x", 5, "proving"),
        entry("story-y", "exploring", "poking around y", 90),
      ],
    },
    {
      sessionId: "wt-new",
      branch: "claude/new-branch",
      stale: false,
      claims: [entry("story-z", "waiting", "", 2)],
    },
  ];
  const body = renderLedgerBoard(groups);
  assert.equal(
    body,
    [
      "Claim ledger (ADR-0200):",
      "",
      "## wt-old  branch=claude/old-branch",
      // grade/ROLE (ADR-0346 D3): the typed word rides beside the grade, the prose after the age.
      "  - story-x  [work/proving]  5m  building x",
      "  - story-y  [exploring/supplementing]  1h  poking around y",
      "",
      "## wt-new  branch=claude/new-branch",
      "  - story-z  [waiting/supplementing]  2m",
    ].join("\n"),
  );
});

test("renderLedgerBoard: an empty ledger says the ledger is empty — 'live' is not smuggled in", () => {
  const body = renderLedgerBoard([]);
  assert.match(body, /Claim ledger \(ADR-0200\):/);
  assert.match(body, /No claims on the ledger — no rows at all, live or stale\./);
});

test("renderLedgerBoard: dark sessions render LAST, counted, and named as reclaimable", () => {
  const stale = (unitId: string, hbHours: number): SessionClaimGroup["claims"][number] => ({
    unitId,
    grade: "work",
    role: "supplementing",
    intent: "",
    ageMs: 300 * 3_600_000,
    claimedAt: new Date(NOW.getTime() - 300 * 3_600_000).toISOString(),
    stale: true,
    heartbeatAgeMs: hbHours * 3_600_000,
  });
  const body = renderLedgerBoard([
    {
      sessionId: "wt-live",
      branch: "claude/live",
      stale: false,
      claims: [
        {
          unitId: "story-live",
          grade: "work",
          role: "supplementing",
          intent: "building",
          ageMs: 60_000,
          claimedAt: NOW.toISOString(),
          stale: false,
          heartbeatAgeMs: 0,
        },
      ],
    },
    { sessionId: "wt-dead-a", branch: "claude/dead-a", stale: true, claims: [stale("story-p", 234)] },
    {
      sessionId: "wt-dead-b",
      branch: "claude/dead-b",
      stale: true,
      claims: [stale("story-q", 401), stale("story-r", 570)],
    },
  ]);
  const lines = body.split("\n");
  assert.ok(
    lines.indexOf("## wt-live  branch=claude/live") < lines.findIndex((l) => l.startsWith("STALE — ")),
    "live sessions render before the stale section",
  );
  assert.match(body, /STALE — 3 rows across 2 sessions with no heartbeat for over 2h\./);
  assert.match(body, /a stale\n?work row blocks nobody/);
  assert.match(body, /## wt-dead-a  branch=claude\/dead-a  \[STALE\]/);
  assert.match(body, /- story-r  \[work\/supplementing\] {2}300h {2}STALE 570h — reclaimable/);
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

test("declare --node takes the work-time claim on each declared node (supplementing role, identity attribution)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "landing ADR-0142", nodes: ["story-a", "story-b"] },
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(
    claims.claimed.map((r) => ({
      unitId: r.unitId,
      sessionId: r.sessionId,
      branch: r.branch,
      intent: r.intent,
      role: r.role,
    })),
    [
      // THE RED→GREEN (ADR-0346 D3): the session's OWN WORDS reach the store, and the enum the map
      // reads lives in its own field. This deepEqual asserted `intent: "orchestrate"` twice until
      // the split — the constant that made the column 55% one string and left 15 of 16 refusals
      // unable to say what the holder was doing.
      {
        unitId: "story-a",
        sessionId: "wt-claim",
        branch: "claude/claim-branch",
        intent: "landing ADR-0142",
        role: "supplementing",
      },
      {
        unitId: "story-b",
        sessionId: "wt-claim",
        branch: "claude/claim-branch",
        intent: "landing ADR-0142",
        role: "supplementing",
      },
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
  // …and it now states the holder's LIVENESS (ADR-0346 D1 companion work). "Coordinate or pick
  // other work" is unanswerable without knowing whether the holder is alive or a ghost.
  assert.match(env.body, /LIVE — heartbeat 0m ago/);
  // …plus its ROLE, its PROSE and how long it has HELD the row (ADR-0346 D3). OTHER_HOLDER is a
  // pre-split row, so its role is derived from the legacy intent word — the line is honest across
  // both eras without a second describer.
  assert.match(env.body, /role supplementing/);
  assert.match(env.body, /intent "orchestrate"/);
  assert.match(env.body, /held 0m/);
});

test("declare: the --working-on prose reaches the STORE trimmed, never just the envelope (ADR-0346 D3)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const prose = "splitting claim intent into a typed role and prose";
  const env = await noticeboardCommand(
    "declare",
    { workingOn: `   ${prose}  `, nodes: ["story-a"] },
    deps,
  );
  assert.equal(env.ok, true, env.body);
  // The verb ALREADY validated this string and printed it here. The bug was that it stopped here:
  // `workingOn` appeared nowhere in the write path, so the row got a constant instead.
  assert.match(env.body, /workingOn: {2}splitting claim intent into a typed role and prose/);
  assert.equal(claims.claimed[0]?.intent, prose, "and the SAME text, trimmed, is what was written");
  assert.equal(claims.claimed[0]?.role, "supplementing");
});

test("declare: a holder with NO prose reads as (none), never as an empty pair of quotes", async () => {
  const claims = makeFakeClaims({ refuseWith: { ...OTHER_HOLDER, intent: "" } });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.match(env.body, /intent \(none\)/, "silence is stated as silence");
  assert.doesNotMatch(env.body, /intent ""/, 'an empty "" reads as a broken field, not as silence');
});

test("declare: a HELD node whose holder is a GHOST says STALE, not merely 'held'", async () => {
  const ghost: ClaimDocT = {
    ...OTHER_HOLDER,
    heartbeatAt: new Date(NOW.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString(),
  };
  const claims = makeFakeClaims({ refuseWith: ghost });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  // The live store reclaims a stale holder rather than refusing, so this shape should not reach a
  // session — the render is computed, not asserted, so the message cannot outlive that guarantee.
  assert.match(env.body, /HELD by other-session .*STALE — no heartbeat for 4h, reclaimable/);
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

test("declare: a total refusal explains the ceremony requirement and the ADR-0346 D4 fork", async () => {
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
  // The held node is a FENCE now, not a hint — and the session is already in its line, so there is
  // nothing to poll and nothing to re-run. ADR-0270 D2's "proceed on your own judgment" is gone;
  // its surviving clause is not.
  assert.deepEqual(claims.claimOpts, [{ queueOnRefusal: true }]);
  assert.match(env.body, /story-a: HELD by other-session .* you are QUEUED behind them; this node is fenced/);
  assert.match(env.body, /The held node is FENCED, and you are in its line/);
  assert.match(env.body, /work another capability you already hold, or write what you were attempting/);
  assert.match(env.body, /never an owner question/);
  assert.doesNotMatch(env.body, /coordinate or pick other work/);
  // `next` points at the two D4 branches — what you hold, and where the residue goes.
  assert.ok(
    env.next?.some((n) => n.startsWith("storytree noticeboard mine --pg")),
    `next should offer the session's own holdings; got ${JSON.stringify(env.next)}`,
  );
  assert.ok(env.next?.some((n) => n.includes("arc increment add")));
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
  // ok:true and FENCED are not in tension: the session holds a live claim (so the ceremony
  // requirement is met and refusing would be a lie in the other direction), and it may not write
  // the withheld node. Before ADR-0346 D1 the withheld node was a hint; now it is a wall.
  assert.match(env.body, /under ADR-0346 D1 that is a FENCE, not a hint: do not write it/);
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
  assert.match(env.body, /never an owner question/, "the held node's remedy");
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
    // The grain a declare is supposed to use post-ADR-0346 D2. The two stories stay in the universe
    // because they are still real objects a near-miss must be able to suggest.
    { id: "cap-a", kind: "capability" },
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
    { workingOn: "x", nodes: ["cap-a", "stories/story-b", "story-zz"] },
    deps,
  );
  assert.equal(env.ok, true, "the session DOES hold a live claim, so the ceremony is satisfied");
  assert.match(env.body, /PARTIAL: claimed 1 of 3 nodes/);
  assert.match(env.body, /cap-a \[capability\]: claimed — the wisp is lit/);
  assert.deepEqual(
    claims.claimed.map((c) => c.unitId),
    ["cap-a"],
  );
  // The pasted PATH is caught as a path, not as a coincidence.
  assert.match(env.body, /stories\/story-b: NOT CLAIMED.*did you mean story-b \[story\]/);
  assert.match(env.body, /story-zz: NOT CLAIMED/);
  // The unresolved block renders in the PARTIAL arm too: "PARTIAL" alone would read as
  // "a sibling holds it", which is a different situation with a different remedy.
  assert.match(env.body, /2 declared ids name nothing in the work graph/);
});

test("declare --node <story> is REFUSED — the story grain retired (ADR-0346 D2)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims, universe: KNOWS_AB };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /story-a: NOT CLAIMED — a STORY is no longer a work claim \(ADR-0346 D2\)/);
  assert.deepEqual(claims.claimed, [], "the retired grain never reaches the store");
  // A fence is neither a conflict nor a typo, and saying so is the point: nobody holds this id, and
  // no amount of waiting or re-running reaches the remedy. It is a different GRAIN.
  assert.match(env.body, /1 declared id is a STORY: story-a/);
  assert.match(env.body, /Nobody is holding these ids: the grain went, not the node/);
  assert.match(env.body, /uat_witness: machine.* story's UAT node/s);
  assert.ok(
    env.next?.some((n) => n.startsWith("storytree tree story-a")),
    `next should point at the story's own capabilities; got ${JSON.stringify(env.next)}`,
  );
});

test("declare: a story with uat_witness: machine still claims — its id names the UAT node", async () => {
  const claims = makeFakeClaims();
  const universe: NonNullable<NoticeboardDeps["universe"]> = async () => ({
    targets: [{ id: "driven", kind: "story", uatWitness: "machine" }],
    nonClaimable: [],
    complete: true,
    unreadSources: [],
  });
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims, universe };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["driven"] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /driven \[story\]: claimed — the wisp is lit/);
});

test("declare: the story fence is per-node and FAIL-SOFT — a fenced id never costs a sibling its claim", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { identity: CLAIM_IDENTITY, now: nowFn, claims, universe: KNOWS_AB };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "x", nodes: ["story-a", "cap-a"] },
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /PARTIAL: claimed 1 of 2 nodes/);
  assert.deepEqual(
    claims.claimed.map((c) => c.unitId),
    ["cap-a"],
  );
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
