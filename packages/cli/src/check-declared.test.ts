// Offline table-tests for the pure claim-gate decision (ADR-0200 D3): a session lands only while
// it HOLDS a live claim — any grade. The I/O arms (SKIP offline, the PgClaimStore read) stay in
// the script's main() and are not exercised here.
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateDeclared, evaluateLobby } from "./check-declared.js";

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
  isPrimaryCheckout: true,
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

test("lobby: SKIP when this is not the primary checkout — a build worktree is not the lobby", () => {
  const res = evaluateLobby({ ...LOBBY, isPrimaryCheckout: false });
  assert.equal(res.verdict, "skip");
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
