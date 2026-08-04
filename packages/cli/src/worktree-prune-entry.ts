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
import {
  classifyDrainHealth,
  defaultDrainLedgerIo,
  drainLedgerPath,
  readDrainHistory,
  shouldAnnounceDrain,
} from "./worktree-drain.js";

/**
 * SessionStart worktree reaper (ADR-0142 / ADR-0033) — the self-cleaning half of worktree hygiene.
 *
 * The merge ceremony deliberately keeps a worktree alive across its branch's death (session identity
 * is worktree-derived, ADR-0033: the landing session runs its closing leg in that tree and leaves it
 * committed-clean, ADR-0271 D1 — the rare owner-directed `branch next` continuation reuses it too),
 * and the merge is async on CI after the session stopped. ADR-0271 hands the reap to the archive, but
 * only for the sessions an owner actually archives — so nothing reaps an unarchived worktree once its
 * session truly ends and `.claude/worktrees/` accumulates. This entry is the standing drain: at each
 * SessionStart it reaps a SMALL CAP of provably-dead worktrees (merged + clean + idle
 * registered ones, plus old orphan husks), with the current worktree, the primary, live/unmerged
 * branches, dirty trees, and detached gates all held back by the classifier (see `worktree.ts`). It
 * NEVER touches the just-started session's own worktree (it is the current-worktree guard's job to
 * know that).
 *
 * HARD CONTRACT (mirrors ambient-presence-entry.ts / provision-worktree.mjs): ALWAYS exit 0, bounded,
 * and silent on every FAILURE path — a prune hiccup must never surface into or slow the session. The
 * launcher (`scripts/worktree-prune-hook.sh`) runs this DETACHED so even a slow removal never blocks
 * session start; this entry adds a throttle so frequent/parallel sessions don't re-scan needlessly.
 *
 * SILENT-ON-FAILURE, NOT SILENT-ON-NOTHING-DRAINED (worktree-reaper-integrity-arc, strand 3). This
 * entry used to be quiet in BOTH cases, which made a reaper that had drained nothing for weeks
 * indistinguishable from a healthy one — the blindness that let the poisoned idle clock rot while
 * `.claude/worktrees/` grew to ~93 GB. Every executing run now appends its counts to the drain ledger
 * (`worktree-drain.ts`), including the zeroes, and this entry speaks up when the recorded series says
 * the drain is stalled, stopped, or losing ground. The silent-on-FAILURE half is untouched: the outer
 * catch still swallows every crash and the exit is still unconditionally 0.
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
    // Say something when it actually reaped…
    if (/Reaped [1-9]/.test(env.body)) {
      process.stderr.write((env.body.split("\n")[0] ?? "").concat("\n"));
    }

    // …AND when the drain itself is unhealthy (worktree-reaper-integrity-arc strand 3).
    //
    // The hook is silent-on-success and silent-on-nothing-to-do BY CONTRACT, which is precisely how a
    // reaper that had drained nothing for weeks stayed indistinguishable from a healthy one while
    // `.claude/worktrees/` grew to ~93 GB. Silence must no longer be the signal for "nothing drained":
    // the run above just appended its counts to the ledger, so read the series back and speak up when
    // it says the drain has stalled, stopped, or is losing ground. The silent-on-FAILURE half of the
    // contract is untouched — the outer catch still swallows every crash, and this whole block is one
    // ledger read with no git, no fs walk, and no network.
    const health = classifyDrainHealth(
      readDrainHistory(defaultDrainLedgerIo, drainLedgerPath(ctx.worktreesDir)),
      { now: Date.now(), thresholdMs: DEFAULT_THRESHOLD_MS },
    );
    // Which states are worth breaking silence for is a decision with a rationale, so it lives in
    // `shouldAnnounceDrain` where it is documented and tested — not as a condition inlined in an
    // untestable entry script.
    if (shouldAnnounceDrain(health.status)) {
      process.stderr.write(
        `[worktree prune] ${health.level.toUpperCase()} ${health.headline} — run \`storytree worktree drain\` for the census.\n`,
      );
    }
  } catch {
    // Never surface — the session proceeds regardless.
  }
  process.exit(0);
}

main();
