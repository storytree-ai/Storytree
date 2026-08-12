import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { announceContext } from "./worktree-prune-entry.js";
import { DRAIN_COOLING_FLOOR, DRAIN_MIN_RUNS, serialiseDrainHistory, type DrainRecord } from "./worktree-drain.js";

/**
 * `drain-announce-is-muted-at-the-launcher` (worktree-reaper-integrity-arc). Increment 2 gave the
 * reaper's drain-health verdict a voice (`process.stderr.write` on stalled/outpaced/stopped), but two
 * things stood between that write and a reader: the launcher redirected BOTH streams to `/dev/null`
 * (`scripts/worktree-prune-hook.sh`), and stderr is invisible to the agent even when it isn't
 * redirected — the harness reads only stdout's `hookSpecificOutput.additionalContext` JSON on exit 0
 * (the contract `provision-worktree.mjs`'s `unprovisionedContext` and `worktree-health.mjs`'s
 * equivalent already rely on). A unit test asserting the OLD entry wrote to stderr would have passed
 * throughout — the break was in the wiring BETWEEN the entry and the launcher, not inside either file
 * alone, so the proof below spans both: it runs the REAL `worktree-prune-hook.sh` against a REAL git
 * repository and reads what actually reaches stdout, the one channel that matters.
 */

// ---------------------------------------------------------------------------
// announceContext — the pure message/gating logic, unit-level
// ---------------------------------------------------------------------------

test("announceContext: builds a SessionStart additionalContext payload only for an announce-worthy status", () => {
  const stalled = announceContext({
    status: "stalled",
    level: "fail",
    headline: "the drain is STALLED — 5 run(s) over 48h reaped 0 while at least 12 worktrees sat cooling",
    detail: [],
  });
  assert.notEqual(stalled, null, "a stalled verdict must produce a payload");
  const parsed = JSON.parse(stalled as string) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(parsed.hookSpecificOutput.additionalContext, /FAIL the drain is STALLED/);
  assert.match(
    parsed.hookSpecificOutput.additionalContext,
    /storytree worktree drain/,
    "must point the reader at the census command",
  );

  // ok and unproven are deliberately silent (shouldAnnounceDrain's documented gate) — confirm this
  // wrapper does not widen it.
  assert.equal(announceContext({ status: "ok", level: "ok", headline: "fine", detail: [] }), null);
  assert.equal(announceContext({ status: "unproven", level: "warn", headline: "too little data", detail: [] }), null);
});

// ---------------------------------------------------------------------------
// The empirical, cross-file proof — a real git repo, the real launcher, real stdout
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const hookScript = path.join(repoRoot, "scripts", "worktree-prune-hook.sh");

const git = (args: readonly string[], cwd: string): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/** Block synchronously — used only to let the launcher's detached prune half finish before teardown. */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Build an isolated fixture repo — its own temp root, so the two scenarios below never share a
 * `.prune-history.jsonl` and can never race each other's detached prune half — run `fn`, then tear
 * down. Each fixture borrows THIS worktree's real `packages/` tree via a junction/symlink so the
 * launcher's cwd-relative `packages/cli/node_modules/.bin/tsx` / `…/worktree-prune-entry.ts` resolve
 * inside it, exactly as its branch-1 (installed worktree) expects.
 */
function withFixture(fn: (primary: string, worktreesDir: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "st-prune-announce-"));
  const primary = path.join(root, "primary");
  try {
    mkdirSync(primary, { recursive: true });
    git(["init", "-b", "main"], primary);
    git(["config", "user.email", "fixture@storytree.test"], primary);
    git(["config", "user.name", "fixture"], primary);
    git(["config", "gc.auto", "0"], primary);
    git(["config", "core.autocrlf", "false"], primary);
    writeFileSync(path.join(primary, ".gitignore"), ".claude/\n", "utf8");
    writeFileSync(path.join(primary, "seed.txt"), "seed\n", "utf8");
    git(["add", "-A"], primary);
    git(["commit", "-m", "seed"], primary);

    symlinkSync(
      path.join(repoRoot, "packages"),
      path.join(primary, "packages"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const worktreesDir = path.join(primary, ".claude", "worktrees");
    mkdirSync(worktreesDir, { recursive: true });

    fn(primary, worktreesDir);

    // The launcher's second half (the real prune) is detached and still finishing — give it a moment
    // before the fixture is torn out from under it, so cleanup doesn't race an open file handle.
    sleepMs(400);
  } finally {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // A temp dir the OS still holds is the OS's problem, never a test failure (mirrors
      // worktree-io-default.test.ts's teardown).
    }
  }
}

/**
 * Run the REAL launcher against the fixture repo and return what actually reached stdout. 30s, not
 * the hook's own 15s SessionStart budget: this spawns a cold `tsx` (first-run type-stripping of
 * `worktree.ts`'s whole import graph, no warm cache) inside `execFileSync`, which on a dev box
 * running many concurrent test suites can genuinely take several seconds longer than in isolation
 * (`definition-injection.test.ts` sets the same 30s headroom for the same reason).
 */
function runHook(cwd: string): string {
  return execFileSync("bash", [hookScript], { cwd, encoding: "utf8", timeout: 30_000 });
}

/** A stalled `DrainRecord`: reaped 0, cooling well past the floor, at the given time. */
function stalledRecord(at: number): DrainRecord {
  return {
    at,
    executed: true,
    population: 30,
    registered: 30,
    orphan: 0,
    reapable: 0,
    reaped: 0,
    failed: 0,
    capped: 0,
    held: {
      cooling: DRAIN_COOLING_FLOOR + 5,
      unmerged: 0,
      dirty: 0,
      locked: 0,
      detached: 0,
      live: 0,
      anchor: 0,
    },
  };
}

test("the launcher's announce half reaches stdout as a SessionStart payload, seeded with a STALLED ledger", () => {
  withFixture((primary, worktreesDir) => {
    const now = Date.now();
    const spanMs = 49 * 60 * 60 * 1000; // just past the 48h threshold
    const records: DrainRecord[] = [];
    for (let i = 0; i < DRAIN_MIN_RUNS + 1; i += 1) {
      records.push(stalledRecord(now - spanMs + i * (spanMs / DRAIN_MIN_RUNS)));
    }
    writeFileSync(path.join(worktreesDir, ".prune-history.jsonl"), serialiseDrainHistory(records), "utf8");

    const stdout = runHook(primary);

    assert.match(
      stdout,
      /"hookEventName":"SessionStart"/,
      "the drain-health verdict must reach the agent as a SessionStart additionalContext payload on stdout",
    );
    assert.match(stdout, /STALLED/, "the actionable state must be named in the message");
    assert.match(stdout, /storytree worktree drain/, "the message must point at the census command");
  });
});

test("the launcher stays silent on stdout when the ledger is absent (unproven) — the fix must not become a nag", () => {
  withFixture((primary) => {
    // No `.prune-history.jsonl` written: an absent ledger reads as `unproven`, which
    // `shouldAnnounceDrain` deliberately keeps silent (a fresh ledger must not nag for 48h).
    const stdout = runHook(primary);
    assert.equal(stdout, "", "an unproven ledger must announce nothing — only stalled/outpaced/stopped speak");
  });
});
