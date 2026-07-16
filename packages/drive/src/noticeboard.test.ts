import test from "node:test";
import assert from "node:assert/strict";

import type {
  ClaimDocT,
  ClaimRequest,
  ClaimResult,
  PresenceDeclarationDoc,
  SessionClaimGroup,
} from "@storytree/notice-board";
import { STALE_THRESHOLD_MS, POSSIBLY_DEAD_THRESHOLD_MS } from "@storytree/notice-board";

import {
  deriveIdentity,
  noticeboardCommand,
  renderLedgerBoard,
  type ClaimLedgerReadLike,
  type PresenceStoreLike,
  type SessionClaimStoreLike,
  type SessionIdentity,
  type NoticeboardDeps,
} from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fixed clock + helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-11T10:00:00.000Z");
const nowFn = () => NOW;

/** Build a minimal valid PresenceDeclarationDoc. */
function makeDoc(overrides: Partial<PresenceDeclarationDoc> = {}): PresenceDeclarationDoc {
  return {
    sessionId: "test-session",
    branch: "main",
    workingOn: "testing stuff",
    nodes: [],
    status: "active",
    startedAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake in-memory PresenceStoreLike
// ---------------------------------------------------------------------------

interface FakeEvent {
  type: string;
  doc: unknown;
  actor: string;
  at: string;
}

function makeFakeStore(): PresenceStoreLike & { docs: Map<string, PresenceDeclarationDoc>; events: FakeEvent[] } {
  const docs = new Map<string, PresenceDeclarationDoc>();
  const events: FakeEvent[] = [];
  return {
    docs,
    events,
    async declare(doc: PresenceDeclarationDoc): Promise<PresenceDeclarationDoc> {
      const existing = docs.get(doc.sessionId);
      let persisted: PresenceDeclarationDoc;
      if (existing !== undefined) {
        // Merge: preserve original startedAt
        persisted = { ...doc, startedAt: existing.startedAt };
      } else {
        persisted = doc;
      }
      docs.set(persisted.sessionId, persisted);
      events.push({ type: "declared", doc: persisted, actor: persisted.sessionId, at: doc.lastSeenAt });
      return persisted;
    },
    async done(sessionId: string, lastSeenAt: string): Promise<PresenceDeclarationDoc | null> {
      const existing = docs.get(sessionId);
      if (existing === undefined) return null;
      const updated: PresenceDeclarationDoc = { ...existing, status: "done", lastSeenAt };
      docs.set(sessionId, updated);
      events.push({ type: "done", doc: updated, actor: sessionId, at: lastSeenAt });
      return updated;
    },
    async listActive(): Promise<PresenceDeclarationDoc[]> {
      return Array.from(docs.values()).filter((d) => d.status === "active");
    },
    async history(sessionId: string): Promise<FakeEvent[]> {
      return events.filter((e) => (e.doc as PresenceDeclarationDoc).sessionId === sessionId);
    },
  };
}

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
// Board (undefined sub) — null store
// ---------------------------------------------------------------------------

test("board: null store → ok:false body explains needs live store, next has pnpm db:up", async () => {
  const deps: NoticeboardDeps = { store: null, identity: null, now: nowFn };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /live store|--pg/);
  assert.ok(env.next !== undefined && env.next.some((n) => n.includes("pnpm db:up")));
  assert.ok(env.next !== undefined && env.next.some((n) => n.includes("noticeboard") && n.includes("--pg")));
});

// ---------------------------------------------------------------------------
// declare — refusals
// ---------------------------------------------------------------------------

test("declare: null store → ok:false, next mentions pnpm db:up", async () => {
  const identity: SessionIdentity = { sessionId: "wt-abc", branch: "claude/real/test" };
  const deps: NoticeboardDeps = { store: null, identity, now: nowFn };
  const env = await noticeboardCommand("declare", { workingOn: "test task", nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.ok(env.next !== undefined && env.next.some((n) => n.includes("pnpm db:up")));
});

test("declare: null identity → ok:false with guidance about worktree identity derivation", async () => {
  const store = makeFakeStore();
  const deps: NoticeboardDeps = { store, identity: null, now: nowFn };
  const env = await noticeboardCommand("declare", { workingOn: "some work", nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /worktree|identity/i);
});

test("declare: blank workingOn → ok:false polite refusal", async () => {
  const store = makeFakeStore();
  const identity: SessionIdentity = { sessionId: "wt-abc", branch: "claude/real/test" };
  const deps: NoticeboardDeps = { store, identity, now: nowFn };
  // blank string
  const env = await noticeboardCommand("declare", { workingOn: "   ", nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /workingOn|working.on/i);
});

test("declare: missing workingOn → ok:false polite refusal", async () => {
  const store = makeFakeStore();
  const identity: SessionIdentity = { sessionId: "wt-abc", branch: "claude/real/test" };
  const deps: NoticeboardDeps = { store, identity, now: nowFn };
  const env = await noticeboardCommand("declare", { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /workingOn|working.on/i);
});

// ---------------------------------------------------------------------------
// declare — success
// ---------------------------------------------------------------------------

test("declare: success passes the built doc with correct sessionId, branch, startedAt", async () => {
  const store = makeFakeStore();
  const identity: SessionIdentity = { sessionId: "wt-realtest", branch: "claude/real/noticeboard" };
  const deps: NoticeboardDeps = { store, identity, now: nowFn };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "implementing noticeboard-cli", nodes: ["noticeboard-cli"] },
    deps,
  );
  assert.equal(env.ok, true, env.body);

  // The store should have received the declaration with the right identity fields
  const stored = store.docs.get("wt-realtest");
  assert.ok(stored !== undefined, "doc should have been stored");
  assert.equal(stored.sessionId, "wt-realtest", "sessionId from identity");
  assert.equal(stored.branch, "claude/real/noticeboard", "branch from identity");
  assert.equal(stored.startedAt, NOW.toISOString(), "startedAt = fixed now");
  assert.equal(stored.lastSeenAt, NOW.toISOString(), "lastSeenAt = fixed now");
  assert.equal(stored.workingOn, "implementing noticeboard-cli");
  assert.deepEqual(stored.nodes, ["noticeboard-cli"]);
  assert.equal(stored.status, "active");
});

test("declare: next points to noticeboard board when nodes were declared", async () => {
  const store = makeFakeStore();
  const identity: SessionIdentity = { sessionId: "wt-abc", branch: "claude/real/feat" };
  const deps: NoticeboardDeps = { store, identity, now: nowFn };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "doing a thing", nodes: ["noticeboard-cli"] },
    deps,
  );
  assert.equal(env.ok, true);
  // next should point onward — the spec says storytree tree <first-node> --pg or noticeboard --pg
  assert.ok(env.next !== undefined && env.next.length > 0, "should have next suggestions");
});

test("declare: next points to noticeboard --pg when no nodes declared", async () => {
  const store = makeFakeStore();
  const identity: SessionIdentity = { sessionId: "wt-nonode", branch: "main" };
  const deps: NoticeboardDeps = { store, identity, now: nowFn };
  const env = await noticeboardCommand(
    "declare",
    { workingOn: "general exploration", nodes: [] },
    deps,
  );
  assert.equal(env.ok, true);
  assert.ok(
    env.next !== undefined && env.next.some((n) => n.includes("noticeboard") && n.includes("--pg")),
    "next should include the noticeboard board command",
  );
});

// ---------------------------------------------------------------------------
// done — refusals
// ---------------------------------------------------------------------------

test("done: null store → ok:false, next mentions pnpm db:up", async () => {
  const identity: SessionIdentity = { sessionId: "wt-abc", branch: "main" };
  const deps: NoticeboardDeps = { store: null, identity, now: nowFn };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.ok(env.next !== undefined && env.next.some((n) => n.includes("pnpm db:up")));
});

test("done: null identity → ok:false with worktree guidance", async () => {
  const store = makeFakeStore();
  const deps: NoticeboardDeps = { store, identity: null, now: nowFn };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /worktree|identity/i);
});

test("done: no active declaration for session → ok:false", async () => {
  const store = makeFakeStore();
  const identity: SessionIdentity = { sessionId: "wt-ghost", branch: "main" };
  const deps: NoticeboardDeps = { store, identity, now: nowFn };
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no active declaration|not found/i);
});

// ---------------------------------------------------------------------------
// Board — grouping and staleness
// ---------------------------------------------------------------------------

test("board: groups sessions by declared node ids; prose-only session groups under (no node)", async () => {
  const store = makeFakeStore();

  // Session A: declared under noticeboard-cli, fresh (lastSeenAt = NOW)
  const docA = makeDoc({
    sessionId: "wt-session-a",
    branch: "claude/real/noticeboard",
    workingOn: "building noticeboard",
    nodes: ["noticeboard-cli"],
    lastSeenAt: NOW.toISOString(),
  });
  store.docs.set(docA.sessionId, docA);

  // Session B: no nodes, stale (lastSeenAt = STALE_THRESHOLD_MS + 1min ago)
  const staleTime = new Date(NOW.getTime() - STALE_THRESHOLD_MS - 60_000);
  const docB = makeDoc({
    sessionId: "wt-session-b",
    branch: "main",
    workingOn: "exploring the library",
    nodes: [],
    lastSeenAt: staleTime.toISOString(),
  });
  store.docs.set(docB.sessionId, docB);

  const deps: NoticeboardDeps = { store, identity: null, now: nowFn };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);

  // Session A should appear under noticeboard-cli
  assert.match(env.body, /noticeboard-cli/);
  assert.match(env.body, /wt-session-a/);

  // Session B should appear under (no node)
  assert.match(env.body, /\(no node\)/);
  assert.match(env.body, /wt-session-b/);

  // Session A should be fresh, session B should be stale
  assert.match(env.body, /fresh/);
  assert.match(env.body, /stale/);
});

test("board: possibly-dead band appears for very old sessions", async () => {
  const store = makeFakeStore();
  const deadTime = new Date(NOW.getTime() - POSSIBLY_DEAD_THRESHOLD_MS - 60_000);
  const docDead = makeDoc({
    sessionId: "wt-dead-session",
    branch: "old-branch",
    workingOn: "ancient work",
    nodes: ["some-node"],
    lastSeenAt: deadTime.toISOString(),
  });
  store.docs.set(docDead.sessionId, docDead);

  const deps: NoticeboardDeps = { store, identity: null, now: nowFn };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /possibly.dead/i);
});

test("board: session with multiple nodes appears under EACH node id", async () => {
  const store = makeFakeStore();
  const doc = makeDoc({
    sessionId: "wt-multi",
    branch: "claude/real/multi",
    workingOn: "multi-node work",
    nodes: ["noticeboard-cli", "presence-store"],
    lastSeenAt: NOW.toISOString(),
  });
  store.docs.set(doc.sessionId, doc);

  const deps: NoticeboardDeps = { store, identity: null, now: nowFn };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);

  // The board body should include both node sections referencing this session
  // (at minimum, both node ids appear in the output)
  assert.match(env.body, /noticeboard-cli/);
  assert.match(env.body, /presence-store/);
  // The session appears at least once
  assert.match(env.body, /wt-multi/);
});

// ---------------------------------------------------------------------------
// Full lifecycle: declare → board → done → board + history
// ---------------------------------------------------------------------------

test("full lifecycle: declare then done removes from board, history retains events", async () => {
  const store = makeFakeStore();
  const identity: SessionIdentity = { sessionId: "wt-lifecycle", branch: "claude/real/lifecycle" };
  const deps: NoticeboardDeps = { store, identity, now: nowFn };

  // 1. Declare
  const declareEnv = await noticeboardCommand(
    "declare",
    { workingOn: "lifecycle test", nodes: ["noticeboard-cli"] },
    deps,
  );
  assert.equal(declareEnv.ok, true, declareEnv.body);

  // 2. Board should list the session
  const boardBefore = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(boardBefore.ok, true, boardBefore.body);
  assert.match(boardBefore.body, /wt-lifecycle/);

  // 3. Done
  const doneEnv = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(doneEnv.ok, true, doneEnv.body);
  // done response points back to the board
  assert.ok(
    doneEnv.next !== undefined && doneEnv.next.some((n) => n.includes("noticeboard")),
    "done next should reference the board",
  );

  // 4. Board should no longer list the done session
  const boardAfter = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(boardAfter.ok, true, boardAfter.body);
  assert.doesNotMatch(boardAfter.body, /wt-lifecycle/);

  // 5. History should still retain events (declared + done)
  const histEvents = await store.history("wt-lifecycle");
  assert.ok(histEvents.length >= 2, "history retains at least declare and done events");
  assert.ok(histEvents.some((e) => e.type === "declared"), "history has declared event");
  assert.ok(histEvents.some((e) => e.type === "done"), "history has done event");
});

// ---------------------------------------------------------------------------
// Unknown sub-command → help envelope
// ---------------------------------------------------------------------------

test("unknown subcommand returns a help envelope listing declare, done, and the board", async () => {
  const deps: NoticeboardDeps = { store: null, identity: null, now: nowFn };
  const env = await noticeboardCommand("frobnicate", { nodes: [] }, deps);
  // The help envelope should mention the three valid sub-commands
  assert.match(env.body, /declare/);
  assert.match(env.body, /done/);
  // 'noticeboard' or listing of sub-commands
  assert.match(env.body, /noticeboard/);
});

// ---------------------------------------------------------------------------
// Claim-at-declare / release-at-done (ADR-0142)
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

const CLAIM_IDENTITY: SessionIdentity = { sessionId: "wt-claim", branch: "claude/claim-branch" };

test("declare --node takes the work-time claim on each declared node (orchestrate intent, identity attribution)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { store: makeFakeStore(), identity: CLAIM_IDENTITY, now: nowFn, claims };
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
});

test("declare: a claim REFUSAL never fails the declare — presence lands, the holder is named", async () => {
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
  const store = makeFakeStore();
  const deps: NoticeboardDeps = { store, identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.ok(store.docs.has("wt-claim"), "presence still declared");
  assert.match(env.body, /HELD by other-session/);
  assert.match(env.body, /claude\/other/);
});

test("declare: a THROWING claim store never fails the declare — surfaced as FAILED, wisp not lit", async () => {
  const claims = makeFakeClaims({ throwing: true });
  const store = makeFakeStore();
  const deps: NoticeboardDeps = { store, identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.ok(store.docs.has("wt-claim"), "presence still declared");
  assert.match(env.body, /claim write FAILED/);
});

test("declare: no claims dep (older caller / offline) → body unchanged, no claims section", async () => {
  const deps: NoticeboardDeps = { store: makeFakeStore(), identity: CLAIM_IDENTITY, now: nowFn };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.doesNotMatch(env.body, /claims:/);
});

test("declare: nodes empty → no claim is ever taken (only an anchored node lights a wisp)", async () => {
  const claims = makeFakeClaims();
  const deps: NoticeboardDeps = { store: makeFakeStore(), identity: CLAIM_IDENTITY, now: nowFn, claims };
  const env = await noticeboardCommand("declare", { workingOn: "x", nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.equal(claims.claimed.length, 0);
});

test("done releases every claim the session holds and reports the count", async () => {
  const claims = makeFakeClaims({ releaseCount: 2 });
  const store = makeFakeStore();
  const deps: NoticeboardDeps = { store, identity: CLAIM_IDENTITY, now: nowFn, claims };
  await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(claims.releasedSessions, ["wt-claim"]);
  assert.match(env.body, /Released 2 story claims/);
});

test("done: a THROWING claim release never un-dones the session — surfaced with the stale-reclaim note", async () => {
  const claims = makeFakeClaims();
  const store = makeFakeStore();
  const deps: NoticeboardDeps = { store, identity: CLAIM_IDENTITY, now: nowFn, claims };
  await noticeboardCommand("declare", { workingOn: "x", nodes: ["story-a"] }, deps);
  claims.throwing = true;
  const env = await noticeboardCommand("done", { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Claim release FAILED/);
  assert.match(env.body, /stale-reclaim/);
});

// ---------------------------------------------------------------------------
// The claim-ledger board (ADR-0200 D7) — renderLedgerBoard + the board branch
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

test("board: with a ledger the claim ledger renders FIRST, presence below the legacy separator", async () => {
  const store = makeFakeStore();
  const presenceDoc = makeDoc({
    sessionId: "wt-presence",
    branch: "main",
    workingOn: "legacy presence work",
    nodes: ["some-node"],
  });
  store.docs.set(presenceDoc.sessionId, presenceDoc);

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

  const deps: NoticeboardDeps = { store, identity: null, now: nowFn, ledger };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.equal(ledger.calls, 1, "the ledger was read once");

  // Ledger section renders, with the graded claim line.
  assert.match(env.body, /Claim ledger \(ADR-0200\):/);
  assert.match(env.body, /## wt-claimer  branch=claude\/claimer/);
  assert.match(env.body, /- story-x {2}\[exploring\] {2}3m {2}what I'm thinking/);

  // Presence renders BELOW, under the retiring separator.
  assert.match(env.body, /Presence \(legacy, retiring\):/);
  assert.match(env.body, /wt-presence/);
  const ledgerAt = env.body.indexOf("Claim ledger (ADR-0200):");
  const presenceAt = env.body.indexOf("Presence (legacy, retiring):");
  assert.ok(ledgerAt >= 0 && presenceAt > ledgerAt, "ledger section comes first");
  assert.ok(
    env.body.indexOf("wt-presence") > presenceAt,
    "the presence rows sit under the separator",
  );

  // next points at the claim verbs (ADR-0200).
  assert.ok(
    env.next !== undefined && env.next.some((n) => n.includes("noticeboard claim") && n.includes("--grade")),
    "next suggests the claim verb",
  );
});

test("board: with a ledger but no live claims the no-live-claims line renders above presence", async () => {
  const store = makeFakeStore();
  const deps: NoticeboardDeps = { store, identity: null, now: nowFn, ledger: makeFakeLedger([]) };
  const env = await noticeboardCommand(undefined, { nodes: [] }, deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /No live claims on the ledger\./);
  assert.match(env.body, /Presence \(legacy, retiring\):/);
  assert.match(env.body, /No active sessions on the notice board\./);
});

test("board: ledger null/absent → EXACTLY the legacy presence-only output (byte-compatible)", async () => {
  const store = makeFakeStore();
  const presenceDoc = makeDoc({
    sessionId: "wt-legacy",
    branch: "main",
    workingOn: "legacy-only board",
    nodes: ["node-a"],
  });
  store.docs.set(presenceDoc.sessionId, presenceDoc);

  const absent = await noticeboardCommand(undefined, { nodes: [] }, { store, identity: null, now: nowFn });
  const nulled = await noticeboardCommand(
    undefined,
    { nodes: [] },
    { store, identity: null, now: nowFn, ledger: null },
  );
  assert.deepEqual(nulled, absent, "ledger:null and absent-ledger envelopes are identical");

  // The legacy body, byte-for-byte: no ledger section, no separator, the presence board alone.
  assert.equal(
    absent.body,
    ["Active sessions:", "", "## node-a", "  - wt-legacy  [fresh]  0m  branch=main  legacy-only board"].join("\n"),
  );
  assert.doesNotMatch(absent.body, /Claim ledger/);
  assert.doesNotMatch(absent.body, /Presence \(legacy/);
  assert.deepEqual(absent.next, [
    "storytree noticeboard declare --working-on <prose> --pg",
    "storytree noticeboard done --pg",
  ]);
});
