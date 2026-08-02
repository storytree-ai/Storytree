// Offline table-tests for the pure claim-gate decision (ADR-0200 D3): a session lands only while
// it HOLDS a live claim — any grade. The I/O arms (SKIP offline, the PgClaimStore read) stay in
// the script's main() and are not exercised here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { evaluateDeclared, evaluateLobby, evaluateLobbyFromGit } from "./check-declared.js";

const SESSION = "lucid-carson-2fe321";

test("fail on zero claims — the unclaimed session cannot land", () => {
  const res = evaluateDeclared({ sessionId: SESSION, claims: [] });
  assert.equal(res.verdict, "fail");
  assert.match(res.message, new RegExp(SESSION));
  // The guidance names the claim ceremony, not the retired presence wording.
  assert.match(res.message, /noticeboard claim/);
  assert.match(res.message, /worktree create/);
  assert.match(res.message, /noticeboard declare/);
  assert.match(res.message, /ADR-0200/);
});

test("ok on one exploring claim (a `worktree create` birth claim passes)", () => {
  const res = evaluateDeclared({
    sessionId: SESSION,
    claims: [{ unitId: "notice-board", grade: "exploring" }],
  });
  assert.equal(res.verdict, "ok");
  assert.match(res.message, /notice-board/);
});

test("ok on one work claim (a `declare --node` claim passes; absent grade IS work)", () => {
  const res = evaluateDeclared({
    sessionId: SESSION,
    claims: [{ unitId: "notice-board" }],
  });
  assert.equal(res.verdict, "ok");
  assert.match(res.message, /notice-board/);
  assert.match(res.message, /work/);
});

test("ok on multiple mixed grades — the message lists every claimed unit", () => {
  const res = evaluateDeclared({
    sessionId: SESSION,
    claims: [
      { unitId: "notice-board", grade: "work" },
      { unitId: "studio-members", grade: "exploring" },
      { unitId: "library-cli", grade: "waiting" },
    ],
  });
  assert.equal(res.verdict, "ok");
  assert.match(res.message, /notice-board/);
  assert.match(res.message, /studio-members/);
  assert.match(res.message, /library-cli/);
});

// ── ADR-0245 D5.2: the lobby arm — a DIRTY primary checkout FAILs instead of SKIPping ──────────
//
// The hole this closes: a session working in the primary checkout has no worktree identity, so
// `deriveIdentity()` is null, it cannot hold a claim, and the pre-0245 gate returned silently —
// the one fail-closed claim gate failed OPEN for exactly the misbehaving session. The arm is pure
// git (no DB), so it runs before the live read and stays CI-safe.
//
// The fingerprint is a CONJUNCTION; every test below drops exactly one leg and must SKIP.

const LOBBY = {
  hasManagedWorktreesDir: true,
  branch: "codex/adr-library-cleanup",
  primaryCheckout: "C:/code/storytree",
  dirtyPaths: [" M packages/cli/src/arc.ts", " M packages/library/src/knowledge.ts"],
} as const;

test("lobby: FAIL when the primary checkout is dirty and carries managed worktrees", () => {
  const res = evaluateLobby(LOBBY);
  assert.equal(res.verdict, "fail");
  // Names the condition, the place, and the branch — never a session (attribution is unprovable).
  assert.match(res.message, /PRIMARY CHECKOUT/);
  assert.match(res.message, /C:\/code\/storytree/);
  assert.match(res.message, /codex\/adr-library-cleanup/);
  assert.match(res.message, /ADR-0245/);
  // Routes to the ceremony, and refuses to remediate someone else's work.
  assert.match(res.message, /worktree create/);
  assert.match(res.message, /attribution is unprovable/i);
});

test("lobby: SKIP when the primary checkout is CLEAN — presence in the lobby is legitimate", () => {
  // ADR-0200 D3 opens sessions here; ADR-0220 auto-repair does git surgery here. Keyed on DIRTY,
  // never on PRESENT — a session orienting or running `worktree create` must see nothing.
  const res = evaluateLobby({ ...LOBBY, dirtyPaths: [] });
  assert.equal(res.verdict, "skip");
  assert.equal(res.message, "");
});

test("lobby: SKIP in CI / a plain clone — no .claude/worktrees means this is not a managed checkout", () => {
  // The load-bearing CI guard: `.claude/worktrees/` is untracked, so a CI checkout never has it.
  const res = evaluateLobby({ ...LOBBY, hasManagedWorktreesDir: false });
  assert.equal(res.verdict, "skip");
  assert.equal(res.message, "");
});

test("lobby: the decision has NO caller-location leg — only the lobby's own facts", () => {
  // The regression fence for the 2026-08-02 scoping fix. `isPrimaryCheckout` used to be a leg of
  // the conjunction, which made a worktree caller SKIP no matter how dirty the lobby was. Where
  // the gate is invoked from is not an input any more, so it cannot suppress the verdict: the
  // fields below are ALL of them, and every one describes the primary checkout.
  assert.deepEqual(Object.keys(LOBBY).sort(), [
    "branch",
    "dirtyPaths",
    "hasManagedWorktreesDir",
    "primaryCheckout",
  ]);
});

test("lobby: an unknown branch (detached HEAD) still FAILs and says so, never a crash", () => {
  const res = evaluateLobby({ ...LOBBY, branch: null });
  assert.equal(res.verdict, "fail");
  assert.match(res.message, /detached/i);
});

test("lobby: the message counts every dirty path but truncates the list", () => {
  const many = Array.from({ length: 14 }, (_, i) => ` M packages/cli/src/f${String(i)}.ts`);
  const res = evaluateLobby({ ...LOBBY, dirtyPaths: many });
  assert.equal(res.verdict, "fail");
  assert.match(res.message, /14 path\(s\)/);
  assert.match(res.message, /\+11 more/);
  // The full 14 are never dumped into the gate output.
  assert.ok(!res.message.includes("f13.ts"), "the tail of a long dirty list is truncated");
});

// ── The lobby arm END TO END, over real git — the regression fence for the 2026-08-02 scoping fix ─
//
// `evaluateLobby` is deliberately caller-blind now, so it CANNOT express "a worktree session runs
// the gate" — the bug lived entirely in how the facts were gathered and when the probe was reached.
// These drive `evaluateLobbyFromGit` against throwaway repos instead: a primary checkout with a
// managed worktree hanging off it, exactly the real shape. Offline, no DB, no network.

/** Build `<tmp>/primary` (one commit, `.claude/worktrees/` present) + a worktree at `…/wt`. */
function makeFixture(): { root: string; primary: string; worktree: string } {
  const root = mkdtempSync(path.join(tmpdir(), "storytree-lobby-"));
  const primary = path.join(root, "primary");
  mkdirSync(primary);
  const run = (...args: string[]): void => {
    execFileSync("git", args, { cwd: primary, stdio: "ignore" });
  };
  run("init");
  run("config", "user.email", "gate@storytree.test");
  run("config", "user.name", "gate");
  run("config", "commit.gpgsign", "false");
  writeFileSync(path.join(primary, "tracked.txt"), "committed\n");
  run("add", "-A");
  run("commit", "-m", "initial");
  // The real repo excludes the managed-worktree dir via .git/info/exclude (NOT .gitignore), which
  // is what keeps nested worktrees from dirtying the lobby they live in. Mirror that, or every
  // fixture below would read as dirty for a reason the production repo does not have.
  writeFileSync(path.join(primary, ".git", "info", "exclude"), ".claude/\n");
  mkdirSync(path.join(primary, ".claude", "worktrees"), { recursive: true });
  const worktree = path.join(primary, ".claude", "worktrees", "wt");
  run("worktree", "add", "-b", "claude/session", worktree);
  return { root, primary, worktree };
}

function withFixture(fn: (f: ReturnType<typeof makeFixture>) => void): void {
  const f = makeFixture();
  try {
    fn(f);
  } finally {
    rmSync(f.root, { recursive: true, force: true, maxRetries: 3 });
  }
}

test("lobby e2e: a WORKTREE session with a dirty lobby FAILs — the bug this arm shipped with", () => {
  // Before the fix this was a silent exit 0: `evaluateLobbyFromGit()` was only reached when
  // `deriveIdentity()` was null, and then skipped itself again unless the caller stood in the
  // lobby. Every worktree session — i.e. effectively all of them — landed past a dirty lobby.
  withFixture(({ primary, worktree }) => {
    writeFileSync(path.join(primary, "tracked.txt"), "someone else's uncommitted edit\n");
    const res = evaluateLobbyFromGit(worktree);
    assert.equal(res.verdict, "fail");
    assert.match(res.message, /PRIMARY CHECKOUT/);
    assert.match(res.message, /tracked\.txt/);
    assert.match(res.message, /ADR-0245/);
    // Reported from a worktree, so it must not read as an accusation against the reader.
    assert.match(res.message, /If the work is NOT yours/);
  });
});

test("lobby e2e: a WORKTREE session with a CLEAN lobby passes silently", () => {
  withFixture(({ worktree }) => {
    const res = evaluateLobbyFromGit(worktree);
    assert.equal(res.verdict, "skip");
    assert.equal(res.message, "");
  });
});

test("lobby e2e: the session's OWN dirty worktree is NOT the subject — only the lobby is", () => {
  // The arm must never fire on the caller's own in-progress work; that is normal and claimed.
  withFixture(({ primary, worktree }) => {
    writeFileSync(path.join(worktree, "tracked.txt"), "my own work in progress\n");
    writeFileSync(path.join(worktree, "untracked-scratch.txt"), "mine too\n");
    assert.equal(evaluateLobbyFromGit(worktree).verdict, "skip");
    // Sanity: the same probe DOES fire once the lobby itself is dirtied, so the skip above is the
    // subject being right rather than the probe being dead.
    writeFileSync(path.join(primary, "tracked.txt"), "lobby dirt\n");
    assert.equal(evaluateLobbyFromGit(worktree).verdict, "fail");
  });
});

test("lobby e2e: a git failure SKIPs — a check that cannot read the repo never invents a red gate", () => {
  const outside = mkdtempSync(path.join(tmpdir(), "storytree-nonrepo-"));
  try {
    // Not a repository at all: `rev-parse --git-common-dir` exits non-zero, so there is no lobby
    // to judge. Silent exit 0 — the same contract CI and plain clones rely on.
    const res = evaluateLobbyFromGit(outside);
    assert.equal(res.verdict, "skip");
    assert.equal(res.message, "");
  } finally {
    rmSync(outside, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("lobby e2e: no .claude/worktrees in the primary checkout SKIPs — the CI / plain-clone shape", () => {
  withFixture(({ primary }) => {
    writeFileSync(path.join(primary, "tracked.txt"), "dirty but unmanaged\n");
    // Probed from the primary checkout itself, so the cwd stays valid once the marker is removed —
    // a SKIP here is the missing `.claude/worktrees/`, never a git failure in disguise.
    assert.equal(evaluateLobbyFromGit(primary).verdict, "fail");
    rmSync(path.join(primary, ".claude"), { recursive: true, force: true, maxRetries: 3 });
    assert.equal(evaluateLobbyFromGit(primary).verdict, "skip");
  });
});
