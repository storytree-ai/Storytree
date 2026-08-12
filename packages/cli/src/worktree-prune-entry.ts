#!/usr/bin/env -S tsx
import { openSync, closeSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  type DrainVerdict,
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
 * launcher (`scripts/worktree-prune-hook.sh`) runs the PRUNE half DETACHED so even a slow removal
 * never blocks session start; this entry adds a throttle so frequent/parallel sessions don't re-scan
 * needlessly.
 *
 * TWO ENTRY POINTS, ONE FILE (worktree-reaper-integrity-arc, `drain-announce-is-muted-at-the-launcher`):
 *
 *   - `--announce` runs {@link runAnnounce}: ONE ledger read, no git-heavy scan, no removals. It runs
 *     SYNCHRONOUSLY in the launcher's foreground, where its stdout is still attached, and is the
 *     agent's only voice for "the drain has stalled/stopped/outpaced" (see {@link announceContext}).
 *   - no argument runs {@link runPrune}: the existing reap-and-record behaviour, launched DETACHED so a
 *     slow Windows removal never blocks session start. Its own stdout/stderr are still discarded by the
 *     launcher, unchanged from before this split — a prune result was never the thing this file's
 *     provenance entry asked to fix, and a detached write racing an exited parent is unreliable anyway
 *     (see the entry's "why the obvious fix is not obviously enough" section).
 *
 * Calling `runAnnounce` BEFORE `runPrune` (the launcher's order) means the health verdict it reports
 * reflects the series through the PREVIOUS run, not this one — correct for a multi-day signal, and it
 * means the fast half never waits on the slow half's removals.
 */

/** Reap at most this many per run — the one-time bulk backlog is cleared by the manual CLI, not here. */
const HOOK_CAP = 8;
/** Throttle: skip the scan entirely if a run stamped the lock within this window (any session). */
const THROTTLE_MS = 30 * 60 * 1000;

/**
 * The `SessionStart` `additionalContext` payload for an unhealthy drain — the one hook output channel
 * the agent actually reads (stdout on exit 0; stderr is invisible to it, per
 * `provision-worktree.mjs`'s `unprovisionedContext` / `worktree-health.mjs`'s equivalent). `null` when
 * the verdict is not one {@link shouldAnnounceDrain} says is worth breaking silence for — a healthy or
 * still-unproven ledger stays quiet, by design.
 *
 * Pure/string-returning so the gating and the message text are unit tested without spawning a process.
 */
export function announceContext(health: DrainVerdict): string | null {
  if (!shouldAnnounceDrain(health.status)) return null;
  const text = `[worktree drain] ${health.level.toUpperCase()} ${health.headline} — run \`storytree worktree drain\` for the census.`;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
  });
}

/**
 * The fast, synchronous half: read the drain ledger as it stands (before this run's prune, if any,
 * appends to it) and print the agent-visible heads-up when the series says the drain is unhealthy.
 * One file read, no git spawn beyond `resolveContext`'s single `rev-parse`, no fs walk, no network —
 * safe to run in the launcher's foreground on every session start.
 */
export function runAnnounce(): void {
  try {
    const ctx = resolveContext(defaultWorktreeIo);
    const health = classifyDrainHealth(
      readDrainHistory(defaultDrainLedgerIo, drainLedgerPath(ctx.worktreesDir)),
      { now: Date.now(), thresholdMs: DEFAULT_THRESHOLD_MS },
    );
    const out = announceContext(health);
    if (out !== null) process.stdout.write(out + "\n");
  } catch {
    // Never surface — the session proceeds regardless.
  }
  process.exit(0);
}

/** The slow, detached half: throttle, reap, and record — unchanged in substance from before the split. */
export function runPrune(): void {
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
    // Say something when it actually reaped. The launcher runs this half detached and discards both
    // streams, same as before this split — this line is unread today, and fixing that is out of scope
    // (the provenance entry is specifically about the drain HEALTH verdict, which `runAnnounce` now
    // carries through a channel the agent actually reads).
    if (/Reaped [1-9]/.test(env.body)) {
      process.stderr.write((env.body.split("\n")[0] ?? "").concat("\n"));
    }
  } catch {
    // Never surface — the session proceeds regardless.
  }
  process.exit(0);
}

/**
 * True only when THIS file is the process entry (invoked directly by tsx), never when it is
 * `import`ed — mirrors `provision-worktree.mjs` / `worktree-health.mjs`'s guard. Without it, a test
 * importing {@link announceContext} to check the message shape would trigger the `process.exit(0)`
 * at the bottom of {@link runAnnounce} / {@link runPrune} and kill the test runner.
 */
function isEntry(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) {
  if (process.argv[2] === "--announce") {
    runAnnounce();
  } else {
    runPrune();
  }
}
