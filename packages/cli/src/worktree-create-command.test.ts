import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import { run } from "./commands.js";
import {
  createWorktree,
  findResumableCeremony,
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
  claimsBySession(sessionId: string, opts?: { includeStale?: boolean }): Promise<ClaimDocT[]>;
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
    async claimsBySession() {
      throw new Error("worktree create must never call ledger.claimsBySession");
    },
  };
}

interface FakeIo extends WorktreeCreateIo {
  readonly calls: {
    /** MINT-collision probes only — the `<worktrees>/<name>` candidates. */
    exists: string[];
    /** RESUME provision probes — the `<worktree>/node_modules` reads. */
    provisionProbe: string[];
    registryReads: number;
    fetch: number;
    add: { branch: string; path: string }[];
    install: string[];
  };
}

/** An IO whose `exists` collides for the first N draws; every mutation call is recorded. */
function fakeIo(opts?: {
  collideFirstN?: number;
  installOk?: boolean;
  addThrows?: boolean;
  /** What `git worktree list --porcelain` reports (absolute paths + their branch). */
  registered?: ReadonlyArray<{ path: string; branch: string | null }>;
  /** Worktree paths whose `node_modules` exist — a PROVISIONED (live-session) tree. */
  provisioned?: readonly string[];
  registryThrows?: boolean;
  /** Records the ordering of side effects, so a checkpoint can be proven to PRECEDE the install. */
  order?: string[];
}): FakeIo {
  const calls: FakeIo["calls"] = {
    exists: [],
    provisionProbe: [],
    registryReads: 0,
    fetch: 0,
    add: [],
    install: [],
  };
  const collideFirstN = opts?.collideFirstN ?? 0;
  const nodeModulesSuffix = `${path.sep}node_modules`;
  return {
    calls,
    primaryRoot: () => PRIMARY,
    exists(absPath) {
      // The resume probe asks "is this tree provisioned?" through the same fs seam; it must NOT be
      // counted as a mint collision draw, or the re-draw assertions below would move under it.
      if (absPath.endsWith(nodeModulesSuffix)) {
        calls.provisionProbe.push(absPath);
        return (opts?.provisioned ?? []).some((p) => path.join(p, "node_modules") === absPath);
      }
      calls.exists.push(absPath);
      return calls.exists.length <= collideFirstN;
    },
    registeredWorktrees() {
      calls.registryReads += 1;
      if (opts?.registryThrows === true) throw new Error("git worktree list exploded");
      return opts?.registered ?? [];
    },
    fetchMain() {
      calls.fetch += 1;
    },
    addWorktree(_primaryRoot, branch, absPath) {
      if (opts?.addThrows === true) throw new Error("git worktree add exploded");
      calls.add.push({ branch, path: absPath });
    },
    install(absPath) {
      opts?.order?.push("install");
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

/**
 * The staged-payload sink, silenced. The DEFAULT sink is stderr, so every test in this file would
 * otherwise print three announcement lines into the gate log for a payload it is not asserting on.
 * The default is not left unproven by that: the `run`-dispatch happy path below goes through
 * `commands.ts`, which injects nothing, and one test drives the real stderr write directly.
 */
const QUIET = (): void => {};

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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
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

test("run dispatch: Codex uses its product-owned worktree helper, never a guessed Claude farm slot", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await run(
    [
      "worktree", "create",
      "--runtime", "codex",
      "--node", "story-a",
      "--intent", "continue in Codex",
      "--pg",
    ],
    {
      store: new InMemoryStore(),
      presence: { ledger },
      worktree: { createIo: io, stamps: NO_STAMPS, generateSuffix: suffixSequence() },
    },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /Codex Desktop owns Codex worktree creation and recovery/);
  assert.match(env.body, /~\/.codex\/worktrees/);
  assert.equal(ledger.takes.length, 0, "the ownership refusal happens before claims");
  assert.equal(io.calls.add.length, 0, "Storytree must not create a product-owned Codex slot");
});

test("create: an unknown runtime refuses before claims or filesystem IO", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading", runtime: "mystery" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /choose claude or codex/);
  assert.equal(ledger.takes.length, 0);
  assert.equal(io.calls.add.length, 0);
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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true);
  assert.deepEqual(ledger.baselines, ["story-a-aaaaaa"], "baselined once, for the minted identity");
});

test("create: a THROWING baselineCursor never fails the ceremony (courtesy only)", async () => {
  const ledger = fakeLedger({ baselineThrows: true });
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, "the workspace stands; the baseline is best-effort");
  assert.equal(ledger.releases.length, 0, "the claims stand too");
});

test("create: a ledger WITHOUT baselineCursor (the optional seam absent) still completes the ceremony", async () => {
  const bare = fakeLedger();
  // Omitted by destructuring rather than asserted into an open dictionary and deleted through:
  // the ABSENCE is then a fact about the value's type, which is what the test is about.
  const { baselineCursor: _baselineCursor, ...bareLedger } = bare;
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger: bareLedger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
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
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, false);
  assert.deepEqual(ledger.baselines, [], "no claim, no workspace, no baseline");
});

// ---------------------------------------------------------------------------
// The claim namespace (ADR-0310 D2) — a phantom id never mints a worktree
// ---------------------------------------------------------------------------

/** A universe knowing story-a only, so anything else is a phantom. */
const KNOWS_STORY_A = async () => ({
  targets: [{ id: "story-a", kind: "story" as const }],
  nonClaimable: [],
  complete: true,
  unreadSources: [],
});

test("create: an id naming NOTHING refuses with ZERO claim and ZERO worktree IO", async () => {
  // The most expensive shape of the phantom failure: born-claimed on nothing, with a branch and a
  // whole installed worktree hung off it. The fence sits in the parse block, on the right side of
  // the ceremony's load-bearing invariant.
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-aa"], intent: "poking at the seam" },
    { ledger, universe: KNOWS_STORY_A, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /names nothing in the work graph/);
  assert.match(env.body, /story-a {2}\[story\]/, "the near-miss is named");
  assert.deepEqual(ledger.takes, [], "no claim");
  assert.equal(io.calls.exists.length, 0, "not even a mint draw");
  assert.equal(io.calls.fetch, 0);
  assert.equal(io.calls.add.length, 0);
  assert.equal(io.calls.install.length, 0);
});

test("create: EVERY node is checked before any is refused — two typos are reported together", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-aa", "story-a", "stories/story-a"], intent: "x" },
    { ledger, universe: KNOWS_STORY_A, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, false, env.body);
  assert.match(env.body, /"story-aa"/);
  assert.match(env.body, /"stories\/story-a"/, "the second bad id is not left for a re-run");
  assert.deepEqual(ledger.takes, []);
});

test("create: a resolvable node proceeds through the whole ceremony untouched", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "poking at the seam" },
    { ledger, universe: KNOWS_STORY_A, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.equal(ledger.takes.length, 1);
  assert.equal(io.calls.add.length, 1);
});

test("create: with NO universe every id passes, exactly as before ADR-0310", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["whoami"], intent: "x" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(
    ledger.takes.map((t) => t.unitId),
    ["whoami"],
  );
});

test("create: the missing-intent refusal still precedes the namespace check — it needs no corpus read", async () => {
  const ledger = fakeLedger();
  const env = await createWorktree(
    { nodes: ["story-aa"], intent: "  " },
    { ledger, universe: KNOWS_STORY_A, io: fakeIo(), stamps: NO_STAMPS },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /requires --intent/);
});

// ---------------------------------------------------------------------------
// RESUME — a partial ceremony is ADOPTED, never duplicated
// (increment `worktree-create-is-resumable`, friction
//  `worktree-create-timeout-leaves-a-half-provisioned-session`)
// ---------------------------------------------------------------------------
//
// The failure being fixed: the call crosses the caller's foreground timeout AFTER the claim is taken
// and the worktree is cut but BEFORE `pnpm install` finishes, so the caller holds a live claim and a
// cut-but-unusable worktree with no start payload. Because the mint carries a RANDOM suffix, a re-run
// could not recognise its own orphan by name and minted a SECOND worktree beside it.
//
// The durable link is the surviving exploring CLAIM: its sessionId IS the worktree basename
// (ADR-0033) and its branch is `claude/<basename>`, so unit + intent + that identity shape names the
// earlier attempt. The discriminator that keeps adoption off a LIVE session's worktree is the very
// thing that makes the orphan an orphan: its `node_modules` are absent.

const ORPHAN = "story-a-orphan";

/** The claim a timed-out ceremony leaves behind: exploring, create-shaped identity, same intent. */
function orphanClaim(over?: Partial<ClaimDocT>): ClaimDocT {
  return {
    unitId: "story-a",
    sessionId: ORPHAN,
    branch: `claude/${ORPHAN}`,
    intent: "reading",
    grade: "exploring",
    claimedAt: ISO,
    heartbeatAt: ISO,
    ...over,
  };
}

/** The registry row git prints for that orphan's cut-but-unprovisioned worktree. */
const ORPHAN_REGISTERED = [{ path: wtPath(ORPHAN), branch: `claude/${ORPHAN}` }];

test("resume: an UNPROVISIONED orphan matching unit + intent is adopted — no second cut, no second name", async () => {
  const ledger = fakeLedger({ claimsForImpl: async (u) => (u === "story-a" ? [orphanClaim()] : []) });
  const io = fakeIo({ registered: ORPHAN_REGISTERED });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);

  // The identity is the ORPHAN's, not a fresh draw — the suffix generator was never consulted.
  assert.equal(io.calls.exists.length, 0, "adoption precedes minting, so no candidate draw is probed");
  assert.deepEqual(ledger.takes.map((t) => t.sessionId), [ORPHAN], "the claim is RE-taken (idempotent per unit+session)");
  assert.equal(ledger.takes[0]?.branch, `claude/${ORPHAN}`);

  // Nothing is re-cut: the tree already exists, so fetch + add are skipped and only install re-runs.
  assert.equal(io.calls.fetch, 0, "an adopted tree is already cut — no fetch");
  assert.deepEqual(io.calls.add, [], "a second worktree is exactly what this fixes");
  assert.deepEqual(io.calls.install, [wtPath(ORPHAN)], "provisioning is the step that is resumed");

  assert.ok(env.body.includes(wtPath(ORPHAN)), "the start payload names the ADOPTED path");
  assert.match(env.body, /resumed/i, "the envelope says it resumed rather than created");
  // The codex bootstrap entry parses this exact block out of the body — it must survive a resume.
  assert.match(env.body, /work from this path:\r?\n {2}\S/);
});

test("resume: a PROVISIONED worktree is never adopted — that is a live session's workspace", async () => {
  const ledger = fakeLedger({ claimsForImpl: async (u) => (u === "story-a" ? [orphanClaim()] : []) });
  const io = fakeIo({ registered: ORPHAN_REGISTERED, provisioned: [wtPath(ORPHAN)] });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(io.calls.provisionProbe, [path.join(wtPath(ORPHAN), "node_modules")]);
  assert.deepEqual(io.calls.add, [
    { branch: "claude/story-a-aaaaaa", path: wtPath("story-a-aaaaaa") },
  ], "a fully provisioned tree belongs to someone; the ceremony mints its own");
  assert.equal(ledger.takes[0]?.sessionId, "story-a-aaaaaa");
});

test("resume: a claim with a DIFFERENT intent is not mine — the ceremony mints fresh", async () => {
  const ledger = fakeLedger({
    claimsForImpl: async () => [orphanClaim({ intent: "something else entirely" })],
  });
  const io = fakeIo({ registered: ORPHAN_REGISTERED });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(io.calls.add, [
    { branch: "claude/story-a-aaaaaa", path: wtPath("story-a-aaaaaa") },
  ]);
  assert.equal(io.calls.provisionProbe.length, 0, "a non-matching claim is filtered before any fs probe");
});

test("resume: a WORK-graded claim is never adopted — the grade says a session promoted it and is writing", async () => {
  const ledger = fakeLedger({ claimsForImpl: async () => [orphanClaim({ grade: "work" })] });
  const io = fakeIo({ registered: ORPHAN_REGISTERED });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(io.calls.add, [
    { branch: "claude/story-a-aaaaaa", path: wtPath("story-a-aaaaaa") },
  ]);
});

test("resume: a claim with NO registered worktree is not resumable here — the cut never happened", async () => {
  // The deliberately un-taken shape: the ceremony died BEFORE `git worktree add`. There is a stale
  // claim but no tree, and adopting a name whose branch may or may not exist is a different repair.
  const ledger = fakeLedger({ claimsForImpl: async () => [orphanClaim()] });
  const io = fakeIo({ registered: [] });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(io.calls.add, [
    { branch: "claude/story-a-aaaaaa", path: wtPath("story-a-aaaaaa") },
  ]);
});

test("resume: a registry read that THROWS never fails the ceremony — it falls back to minting fresh", async () => {
  const ledger = fakeLedger({ claimsForImpl: async () => [orphanClaim()] });
  const io = fakeIo({ registryThrows: true });
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.equal(io.calls.registryReads, 1);
  assert.deepEqual(io.calls.add, [
    { branch: "claude/story-a-aaaaaa", path: wtPath("story-a-aaaaaa") },
  ]);
});

test("resume: a claimsFor read that THROWS never fails the ceremony", async () => {
  const ledger = fakeLedger({
    claimsForImpl: async () => {
      throw new Error("ledger read exploded");
    },
  });
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(io.calls.add, [
    { branch: "claude/story-a-aaaaaa", path: wtPath("story-a-aaaaaa") },
  ]);
});

test("resume: a rollback NEVER releases the adopted claim — that claim is the orphan's only handle", async () => {
  // Rolling back what this call took is correct; deleting the claim the PREVIOUS attempt took is not
  // a rollback, it is the failure resume exists to remove — a cut worktree nothing can identify
  // again. So a later take failing must leave the anchor's claim (and say so).
  const ledger = fakeLedger({
    claimsForImpl: async (u) => (u === "story-a" ? [orphanClaim()] : []),
    takeImpl: async (req, callIndex) => {
      if (callIndex === 1) throw new Error("second take exploded");
      return { acquired: true, claim: claimOf(req), reclaimed: false };
    },
  });
  const io = fakeIo({ registered: ORPHAN_REGISTERED });
  const env = await createWorktree(
    { nodes: ["story-a", "story-b"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /second take exploded/, "the original error is never masked");
  assert.deepEqual(ledger.releases, [], "the anchor's PRE-EXISTING claim is not this call's to release");
  assert.doesNotMatch(env.body, /No worktree was created/, "a tree the previous attempt cut does exist");
  assert.ok(env.body.includes(wtPath(ORPHAN)), "…and the refusal names it, so the next run can resume");
});

test("create: a NON-resumed rollback still releases everything it took and says no worktree exists", async () => {
  // The control for the test above: without an adoption there is nothing pre-existing to protect,
  // so the original all-or-nothing rollback must be exactly as it was.
  const ledger = fakeLedger({
    takeImpl: async (req, callIndex) => {
      if (callIndex === 1) throw new Error("second take exploded");
      return { acquired: true, claim: claimOf(req), reclaimed: false };
    },
  });
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a", "story-b"], intent: "reading" },
    { ledger, io, stamps: NO_STAMPS, generateSuffix: suffixSequence(), checkpoint: QUIET },
  );
  assert.equal(env.ok, false);
  assert.deepEqual(ledger.releases.map((r) => r.unitId), ["story-a"]);
  assert.match(env.body, /No worktree was created/);
});

// ---------------------------------------------------------------------------
// STAGED PAYLOAD — what exists is announced BEFORE the slow step
// ---------------------------------------------------------------------------

test("checkpoint: the path, branch and claims are emitted BEFORE install, so a killed caller still knows what it holds", async () => {
  const order: string[] = [];
  const ledger = fakeLedger();
  const io = fakeIo({ order });
  const lines: string[] = [];
  const env = await createWorktree(
    { nodes: ["story-a", "story-b"], intent: "reading" },
    {
      ledger,
      io,
      stamps: NO_STAMPS,
      generateSuffix: suffixSequence(),
      checkpoint: (text) => {
        order.push("checkpoint");
        lines.push(text);
      },
    },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(order, ["checkpoint", "install"], "the announcement must precede the slow step");
  const text = lines.join("\n");
  assert.ok(text.includes(wtPath("story-a-aaaaaa")), "the checkpoint carries the absolute path");
  assert.match(text, /claude\/story-a-aaaaaa/, "…and the branch");
  assert.match(text, /story-a, story-b/, "…and every claim it took");
});

test("checkpoint: the DEFAULT sink really writes to stderr — stdout stays the envelope's alone", async () => {
  // The command's stdout is its machine-readable envelope, so a checkpoint that leaked there would
  // corrupt every caller. Only the real default can show which stream it picked; an injected sink
  // proves nothing about it.
  const err: string[] = [];
  const out: string[] = [];
  const stderrWrite = process.stderr.write;
  const stdoutWrite = process.stdout.write;
  const capture = (sink: string[]) =>
    ((chunk: unknown): boolean => {
      sink.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
  process.stderr.write = capture(err);
  process.stdout.write = capture(out);
  try {
    await createWorktree(
      { nodes: ["story-a"], intent: "reading" },
      { ledger: fakeLedger(), io: fakeIo(), stamps: NO_STAMPS, generateSuffix: suffixSequence() },
    );
  } finally {
    process.stderr.write = stderrWrite;
    process.stdout.write = stdoutWrite;
  }
  assert.match(err.join(""), /\[worktree create\] CUT .*story-a-aaaaaa/, "the announcement lands on stderr");
  assert.equal(out.join(""), "", "and never on stdout");
});

test("checkpoint: a THROWING checkpoint never fails the ceremony (it is an announcement, not a step)", async () => {
  const ledger = fakeLedger();
  const io = fakeIo();
  const env = await createWorktree(
    { nodes: ["story-a"], intent: "reading" },
    {
      ledger,
      io,
      stamps: NO_STAMPS,
      generateSuffix: suffixSequence(),
      checkpoint: () => {
        throw new Error("stderr closed");
      },
    },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(io.calls.install, [wtPath("story-a-aaaaaa")]);
});

// ---------------------------------------------------------------------------
// findResumableCeremony — the pure adoption policy
// ---------------------------------------------------------------------------

const NEVER_PROVISIONED = (): boolean => false;
const WORKTREES_DIR = path.join(PRIMARY, ".claude", "worktrees");

test("findResumableCeremony: a claim whose branch is not `claude/<sessionId>` is not a create-ceremony identity", async () => {
  const found = findResumableCeremony({
    claims: [orphanClaim({ branch: "claude/some-other-branch" })],
    intent: "reading",
    worktreesDir: WORKTREES_DIR,
    registered: [{ path: wtPath(ORPHAN), branch: "claude/some-other-branch" }],
    isProvisioned: NEVER_PROVISIONED,
  });
  assert.equal(found, null);
});

test("findResumableCeremony: a sessionId carrying path separators can never be joined into a path", async () => {
  const evil = "../../../etc";
  const found = findResumableCeremony({
    claims: [orphanClaim({ sessionId: evil, branch: `claude/${evil}` })],
    intent: "reading",
    worktreesDir: WORKTREES_DIR,
    registered: [{ path: path.join(WORKTREES_DIR, evil), branch: `claude/${evil}` }],
    isProvisioned: NEVER_PROVISIONED,
  });
  assert.equal(found, null, "the mint's own alphabet is the fence");
});

test("findResumableCeremony: a registered path on a DIFFERENT branch is a name collision, not my orphan", async () => {
  const found = findResumableCeremony({
    claims: [orphanClaim()],
    intent: "reading",
    worktreesDir: WORKTREES_DIR,
    registered: [{ path: wtPath(ORPHAN), branch: "claude/someone-else" }],
    isProvisioned: NEVER_PROVISIONED,
  });
  assert.equal(found, null);
});

test("findResumableCeremony: the OLDEST matching orphan wins, deterministically", async () => {
  const older = orphanClaim({
    sessionId: "story-a-zzzzzz",
    branch: "claude/story-a-zzzzzz",
    claimedAt: "2026-08-01T00:00:00.000Z",
  });
  const newer = orphanClaim({ claimedAt: "2026-08-09T00:00:00.000Z" });
  const registered = [
    { path: wtPath(ORPHAN), branch: `claude/${ORPHAN}` },
    { path: wtPath("story-a-zzzzzz"), branch: "claude/story-a-zzzzzz" },
  ];
  const args = {
    intent: "reading",
    worktreesDir: WORKTREES_DIR,
    registered,
    isProvisioned: NEVER_PROVISIONED,
  };
  assert.equal(findResumableCeremony({ claims: [newer, older], ...args })?.sessionId, "story-a-zzzzzz");
  assert.equal(findResumableCeremony({ claims: [older, newer], ...args })?.sessionId, "story-a-zzzzzz");
});

test("findResumableCeremony: a blank intent never adopts anything", async () => {
  const found = findResumableCeremony({
    claims: [orphanClaim({ intent: "   " })],
    intent: "   ",
    worktreesDir: WORKTREES_DIR,
    registered: ORPHAN_REGISTERED,
    isProvisioned: NEVER_PROVISIONED,
  });
  assert.equal(found, null);
});
