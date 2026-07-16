import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import { run } from "./commands.js";
import {
  createWorktree,
  type WorktreeCreateIo,
  type WorktreeCreateLedgerLike,
} from "./worktree-create.js";

/**
 * `storytree worktree create` — the claim-gated workspace ceremony (ADR-0200 D3). These tests prove
 * the STRICT ORDER the ceremony hangs on, entirely offline behind the injected ledger + IO seams:
 *
 *   parse → mint (collision re-draws INCLUDED — the identity is final before it is claimed) →
 *   take the exploring claim(s) → git fetch/worktree add → pnpm install → the start-payload envelope.
 *
 * The load-bearing invariant: NO CLAIM, NO WORKSPACE — a refused/failed take leaves zero worktree
 * IO behind it, and a blank intent refuses before anything (no claim, no cut). Lane A's pure
 * `mintWorktreeName` truths live in worktree-create.test.ts; this file proves the command + its
 * `run` dispatch glue only.
 */

const PRIMARY = path.join(path.sep, "primary");
const wtPath = (basename: string): string =>
  path.join(PRIMARY, ".claude", "worktrees", basename);

const ISO = "2026-07-16T00:00:00.000Z";

function claimOf(req: ClaimRequest): ClaimDocT {
  return {
    unitId: req.unitId,
    sessionId: req.sessionId,
    branch: req.branch,
    intent: req.intent ?? "",
    grade: req.grade ?? "work",
    claimedAt: ISO,
    heartbeatAt: ISO,
  };
}

interface FakeLedger extends WorktreeCreateLedgerLike {
  readonly takes: ClaimRequest[];
  readonly releases: { unitId: string; sessionId: string }[];
  readonly baselines: string[];
  // The wider noticeboard-verb surface (RunDeps.presence.ledger is ClaimLedgerStoreLike) — the
  // create ceremony never calls these; they throw so a stray call is loud, not silent.
  upgrade(unitId: string, sessionId: string, opts?: { branch?: string; intent?: string }): Promise<ClaimResult>;
  downgrade(unitId: string, sessionId: string, grade: "exploring" | "waiting"): Promise<boolean>;
}

/** A ledger whose take/claimsFor behaviour is scriptable per unit; every call is recorded. */
function fakeLedger(opts?: {
  takeImpl?: (req: ClaimRequest, callIndex: number) => Promise<ClaimResult>;
  claimsForImpl?: (unitId: string) => Promise<ClaimDocT[]>;
  baselineThrows?: boolean;
}): FakeLedger {
  const takes: ClaimRequest[] = [];
  const releases: { unitId: string; sessionId: string }[] = [];
  const baselines: string[] = [];
  return {
    takes,
    releases,
    baselines,
    async baselineCursor(sessionId) {
      if (opts?.baselineThrows === true) throw new Error("baseline exploded");
      baselines.push(sessionId);
    },
    async take(req) {
      const idx = takes.length;
      takes.push(req);
      if (opts?.takeImpl) return opts.takeImpl(req, idx);
      return { acquired: true, claim: claimOf(req), reclaimed: false };
    },
    async release(unitId, sessionId) {
      releases.push({ unitId, sessionId });
      return true;
    },
    async claimsFor(unitId) {
      return opts?.claimsForImpl ? opts.claimsForImpl(unitId) : [];
    },
    async upgrade() {
      throw new Error("worktree create must never call ledger.upgrade");
    },
    async downgrade() {
      throw new Error("worktree create must never call ledger.downgrade");
    },
  };
}

interface FakeIo extends WorktreeCreateIo {
  readonly calls: {
    exists: string[];
    fetch: number;
    add: { branch: string; path: string }[];
    install: string[];
  };
}

/** An IO whose `exists` collides for the first N draws; every mutation call is recorded. */
function fakeIo(opts?: { collideFirstN?: number; installOk?: boolean; addThrows?: boolean }): FakeIo {
  const calls: FakeIo["calls"] = { exists: [], fetch: 0, add: [], install: [] };
  const collideFirstN = opts?.collideFirstN ?? 0;
  return {
    calls,
    primaryRoot: () => PRIMARY,
    exists(absPath) {
      calls.exists.push(absPath);
      return calls.exists.length <= collideFirstN;
    },
    fetchMain() {
      calls.fetch += 1;
    },
    addWorktree(_primaryRoot, branch, absPath) {
      if (opts?.addThrows === true) throw new Error("git worktree add exploded");
      calls.add.push({ branch, path: absPath });
    },
    install(absPath) {
      calls.install.push(absPath);
      return { ok: opts?.installOk !== false, code: opts?.installOk === false ? 1 : 0 };
    },
  };
}

/** Deterministic suffix draws: aaaaaa, bbbbbb, cccccc, … (mint re-draws walk the sequence). */
function suffixSequence(): () => string {
  let i = 0;
  const draws = ["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee", "ffffff"];
  return () => draws[i++] ?? "zzzzzz";
}

const NO_STAMPS = (): { story: string; arc: string }[] => [];

// ---------------------------------------------------------------------------
// (1) ORDERING — no claim, no workspace
// ---------------------------------------------------------------------------

test("create: a take() that throws refuses with ZERO worktree IO (no claim, no workspace)", async () => {
  const ledger = fakeLedger({
    takeImpl: async () => {
      throw new Error("ledger down");
    },
  });
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "poking at the seam" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /ledger down/);
  assert.equal(io.calls.fetch, 0, "fetch must not run after a failed take");
  assert.equal(io.calls.add.length, 0, "addWorktree must not run after a failed take");
  assert.equal(io.calls.install.length, 0, "install must not run after a failed take");
  assert.equal(ledger.releases.length, 0, "nothing was taken, so nothing releases");
});

// ---------------------------------------------------------------------------
// (2) blank / missing intent — refuses before the claim AND before any IO
// ---------------------------------------------------------------------------

test("create: a blank --intent refuses with zero take() calls and zero IO (no claim, no cut)", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "   " },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /--intent/);
  assert.equal(ledger.takes.length, 0);
  assert.equal(io.calls.exists.length, 0, "a blank intent refuses before minting begins");
  assert.equal(io.calls.add.length, 0);
  assert.equal(io.calls.install.length, 0);
});

test("run dispatch: `worktree create` with a MISSING --intent refuses", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await run(["worktree", "create", "--node", "story-a", "--pg"], {
    store: new InMemoryStore(),
    presence: { ledger },
    worktree: { createIo: io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /--intent/);
  assert.equal(ledger.takes.length, 0);
});

// ---------------------------------------------------------------------------
// (3) missing --node
// ---------------------------------------------------------------------------

test("run dispatch: `worktree create` with no --node refuses", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await run(["worktree", "create", "--intent", "reading", "--pg"], {
    store: new InMemoryStore(),
    presence: { ledger },
    worktree: { createIo: io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /--node/);
  assert.equal(ledger.takes.length, 0);
  assert.equal(io.calls.add.length, 0);
});

// ---------------------------------------------------------------------------
// (4) happy path — claims, cut, install, and the start payload
// ---------------------------------------------------------------------------

test("run dispatch: happy path takes each claim then cuts ONE worktree and installs, envelope = the start payload", async () => {
  const foreign: ClaimDocT = {
    unitId: "story-a",
    sessionId: "other-session-1a2b3c",
    branch: "claude/other-session-1a2b3c",
    intent: "poking at the same story",
    grade: "exploring",
    claimedAt: ISO,
    heartbeatAt: ISO,
  };
  const ledger = fakeLedger({
    claimsForImpl: async (unitId) => (unitId === "story-a" ? [foreign] : []),
  });
  const io = fakeIo();
  const env = await run(
    [
      "worktree", "create",
      "--node", "story-a", "--node", "story-b",
      "--intent", "wiring the create ceremony",
      "--pg",
    ],
    {
      store: new InMemoryStore(),
      presence: { ledger },
      worktree: {
        createIo: io,
        stamps: () => [{ story: "story-a", arc: "demo-arc" }],
        generateSuffix: suffixSequence(),
      },
    },
  );
  assert.equal(env.ok, true);

  // The minted identity: arc-stamped anchor → <arc>-<story>-<suffix>, branch claude/<basename>.
  const basename = "demo-story-a-aaaaaa";
  const expectedPath = wtPath(basename);

  // Claims first, one per --node, in order, attributed to the MINTED identity.
  assert.deepEqual(ledger.takes.map((t) => t.unitId), ["story-a", "story-b"]);
  for (const t of ledger.takes) {
    assert.equal(t.grade, "exploring");
    assert.equal(t.sessionId, basename);
    assert.equal(t.branch, `claude/${basename}`);
    assert.equal(t.intent, "wiring the create ceremony");
  }

  // Then exactly one cut + one install, with the minted branch/path.
  assert.equal(io.calls.fetch, 1);
  assert.deepEqual(io.calls.add, [{ branch: `claude/${basename}`, path: expectedPath }]);
  assert.deepEqual(io.calls.install, [expectedPath]);

  // The start payload: the path, each claim, the ceremony, and the foreign-row board digest.
  assert.ok(env.body.includes(expectedPath), "envelope must carry the absolute worktree path");
  assert.match(env.body, /\[exploring\] story-a/);
  assert.match(env.body, /\[exploring\] story-b/);
  assert.match(env.body, /someone else is exploring story-a \("poking at the same story"\)/);
  assert.match(env.body, /session id/i);
  assert.match(env.body, /noticeboard release/);
  const next = env.next ?? [];
  assert.ok(next.some((n) => n.includes("storytree tree story-a")));
  assert.ok(next.some((n) => n.includes("storytree noticeboard claims story-a")));
});

test("create: an install FAILURE keeps the worktree and claims standing, reported with the fix", async () => {
  const ledger = fakeLedger();
  const io = fakeIo({ installOk: false });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, true, "an install failure never tears the ceremony down");
  assert.match(env.body, /pnpm install/);
  assert.equal(io.calls.add.length, 1);
  assert.equal(ledger.releases.length, 0, "the claims stand");
});

// ---------------------------------------------------------------------------
// (5) offline — no ledger, no ceremony
// ---------------------------------------------------------------------------

test("run dispatch: offline (no live ledger) refuses naming db:up and --pg", async () => {
  const io = fakeIo();
  const env = await run(
    ["worktree", "create", "--node", "story-a", "--intent", "reading"],
    { store: new InMemoryStore(), worktree: { createIo: io } },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /--pg/);
  assert.ok((env.next ?? []).some((n) => n.includes("db:up")));
  assert.equal(io.calls.add.length, 0);
});

// ---------------------------------------------------------------------------
// (6) collision re-draws — part of MINTING, so they precede every claim
// ---------------------------------------------------------------------------

test("create: a basename collision re-draws the suffix and succeeds on a later draw — mint precedes take", async () => {
  const ledger = fakeLedger();
  const io = fakeIo({ collideFirstN: 2 });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, true);
  // Three draws probed; the third (cccccc) is free and becomes the identity.
  assert.equal(io.calls.exists.length, 3);
  assert.equal(ledger.takes.length, 1);
  assert.equal(ledger.takes[0]?.sessionId, "story-a-cccccc");
  assert.deepEqual(io.calls.add, [
    { branch: "claude/story-a-cccccc", path: wtPath("story-a-cccccc") },
  ]);
});

test("create: 5 collisions refuse with NO claims taken (the identity must be final before it is claimed)", async () => {
  const ledger = fakeLedger();
  const io = fakeIo({ collideFirstN: 5 });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /collid|draw/i);
  assert.equal(io.calls.exists.length, 5, "the re-draw cap is 5 attempts");
  assert.equal(ledger.takes.length, 0, "collision re-draws happen BEFORE any claim");
  assert.equal(io.calls.add.length, 0);
  assert.equal(io.calls.install.length, 0);
});

// ---------------------------------------------------------------------------
// (7) multi-node partial failure — release what was taken, refuse, zero IO
// ---------------------------------------------------------------------------

test("create: a LATER take that throws releases the earlier claims, refuses, and runs zero worktree IO", async () => {
  const ledger = fakeLedger({
    takeImpl: async (req, callIndex) => {
      if (callIndex === 1) throw new Error("second take exploded");
      return { acquired: true, claim: claimOf(req), reclaimed: false };
    },
  });
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a", "story-b"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /second take exploded/, "the original error is never masked");
  // The first claim was taken, so it is released best-effort before the refusal.
  assert.deepEqual(ledger.releases.map((r) => r.unitId), ["story-a"]);
  assert.equal(ledger.releases[0]?.sessionId, "story-a-aaaaaa");
  assert.equal(io.calls.fetch, 0);
  assert.equal(io.calls.add.length, 0);
  assert.equal(io.calls.install.length, 0);
});

// ---------------------------------------------------------------------------
// Help / dispatch glue
// ---------------------------------------------------------------------------

test("run dispatch: worktreeHelp documents create", async () => {
  const env = await run(["worktree", "--help"], { store: new InMemoryStore() });
  assert.equal(env.ok, true);
  assert.match(env.body, /worktree create/);
});

// ── The birth cursor-baseline (ADR-0200 D4): the snapshot never re-fires as deltas ──

test("create: baselines the MINTED session's delta cursor after the claims + digest (the birth snapshot is swallowed)", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, true);
  assert.deepEqual(ledger.baselines, ["story-a-aaaaaa"], "baselined once, for the minted identity");
});

test("create: a THROWING baselineCursor never fails the ceremony (courtesy only)", async () => {
  const ledger = fakeLedger({ baselineThrows: true });
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, true, "the workspace stands; the baseline is best-effort");
  assert.equal(ledger.releases.length, 0, "the claims stand too");
});

test("create: a ledger WITHOUT baselineCursor (the optional seam absent) still completes the ceremony", async () => {
  const bare = fakeLedger();
  const ledger = { ...bare, takes: bare.takes, releases: bare.releases } as Record<string, unknown>;
  delete ledger["baselineCursor"];
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger: ledger as unknown as WorktreeCreateLedgerLike, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, true);
});

test("create: a refused take never reaches the baseline (no workspace, no cursor)", async () => {
  const holder = claimOf({ unitId: "story-a", sessionId: "other-sess", branch: "claude/other", grade: "work" });
  const ledger = fakeLedger({
    takeImpl: async () => ({ acquired: false, heldBy: holder }),
  });
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
  );
  assert.equal(env.ok, false);
  assert.deepEqual(ledger.baselines, [], "no claim, no workspace, no baseline");
});
