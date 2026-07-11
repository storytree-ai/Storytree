#!/usr/bin/env -S tsx
import { openSync, closeSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  pruneWorktrees,
  resolveContext,
  defaultWorktreeIo,
  DEFAULT_THRESHOLD_MS,
} from "./worktree.js";

/**
 * SessionStart worktree reaper (ADR-0142 / ADR-0033) — the self-cleaning half of worktree hygiene.
 *
 * The merge ceremony deliberately keeps a worktree alive across its branch's death (session identity
 * is worktree-derived; `branch next` reuses the worktree, ADR-0142), and the merge is async on CI
 * after the session stopped — so nothing ever reaps a worktree once its session truly ends and
 * `.claude/worktrees/` accumulates. This entry is the standing drain: at each SessionStart it reaps a
 * SMALL CAP of provably-dead worktrees (merged + clean + idle registered ones, plus old orphan husks),
 * with the current worktree, the primary, live/unmerged branches, dirty trees, and detached gates all
 * held back by the classifier (see `worktree.ts`). It NEVER touches the just-started session's own
 * worktree (it is the current-worktree guard's job to know that).
 *
 * HARD CONTRACT (mirrors ambient-presence-entry.ts / provision-worktree.mjs): ALWAYS exit 0, bounded,
 * and silent on every failure path — a prune hiccup must never surface into or slow the session. The
 * launcher (`scripts/worktree-prune-hook.sh`) runs this DETACHED so even a slow removal never blocks
 * session start; this entry adds a throttle so frequent/parallel sessions don't re-scan needlessly.
 */

/** Reap at most this many per run — the one-time bulk backlog is cleared by the manual CLI, not here. */
const HOOK_CAP = 8;
/** Throttle: skip the scan entirely if a run stamped the lock within this window (any session). */
const THROTTLE_MS = 30 * 60 * 1000;

function main(): void {
  try {
    const ctx = resolveContext(defaultWorktreeIo);
    const lock = path.join(ctx.worktreesDir, ".prune.lock");

    // Throttle: a fresh lock means another (or this) session pruned recently — nothing to do.
    try {
      if (Date.now() - statSync(lock).mtimeMs < THROTTLE_MS) {
        process.exit(0);
      }
    } catch {
      // No lock yet (or unreadable) — proceed to a real run.
    }
    // Stamp the lock BEFORE the (possibly slow) removals so a concurrently-starting session backs off.
    try {
      closeSync(openSync(lock, "w"));
    } catch {
      // Best-effort — a missing worktrees dir means there is nothing to prune anyway.
    }

    const env = pruneWorktrees({
      force: true,
      yes: true,
      hook: true,
      cap: HOOK_CAP,
      includeDetached: false,
      thresholdMs: DEFAULT_THRESHOLD_MS,
      liveSessions: new Set(), // offline: the mtime idle heuristic stands in for the notice board
    });
    // Say something ONLY when it actually reaped — otherwise stay silent per the hook contract.
    if (/Reaped [1-9]/.test(env.body)) {
      process.stderr.write((env.body.split("\n")[0] ?? "").concat("\n"));
    }
  } catch {
    // Never surface — the session proceeds regardless.
  }
  process.exit(0);
}

main();
