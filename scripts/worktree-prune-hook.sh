#!/usr/bin/env bash
# SessionStart worktree-reaper launcher (ADR-0142 / ADR-0033) — the self-cleaning half of worktree
# hygiene. Mirrors scripts/presence-hook.sh: find a `tsx` that exists even in a FRESH git worktree
# (which has no node_modules of its own), then run the prune entry.
#
# TWO CALLS, TWO CADENCES (worktree-reaper-integrity-arc, `drain-announce-is-muted-at-the-launcher`):
#   - `announce` FIRST, in the FOREGROUND, undirected — one ledger read (no git-heavy scan, no
#     removals), fast enough to pay on every session start, and the only place the entry's stdout
#     (the agent-visible SessionStart `additionalContext`) is allowed to reach the harness. It reports
#     the series through the PREVIOUS run, which is correct: it runs before the prune below appends a
#     new record, so it never waits on this run's removals to speak.
#   - the PRUNE second, DETACHED, exactly as before this split — see "WHY DETACHED" below.
# Do not swap the order or fold them into one call: the removals are what must never block session
# start, not the one-file-read health check.
#
# WHY DETACHED: reaping a dead worktree deletes its working tree (node_modules and all), which on
# Windows can take seconds. Running it in the foreground would tax EVERY session start, so we launch
# it in a background subshell and return immediately — the session never blocks or slows. The entry
# is capped + throttled + idempotent, so a detached run that the OS later reaps simply retries next
# session; nothing is left half-done that a `git worktree prune` won't tidy.
#
# HARD CONTRACT (matches ambient-presence-entry.ts / provision-worktree.mjs): ALWAYS exit 0, bounded,
# and silent on every failure path — a prune must never surface into the session. The announce half
# follows the same contract (it always exits 0 on its own), so `|| true` here is belt-and-braces, not
# load-bearing.
set -u

rel_tsx="packages/cli/node_modules/.bin/tsx"
rel_entry="packages/cli/src/worktree-prune-entry.ts"

# Foreground, synchronous: the drain-health voice. Output flows through untouched — this is the one
# call in this script whose stdout the harness is meant to read.
announce() {
  "$1" "$2" --announce || true
}

# Launch detached in a background subshell so the child is orphaned (survives this script's exit) and
# the hook returns at once. Output is discarded — the entry is silent on success by contract.
launch() {
  ( "$1" "$2" >/dev/null 2>&1 & )
}

# 1) Installed worktree: use its own tsx + entry (cwd-relative).
if [ -x "${rel_tsx}" ] && [ -f "${rel_entry}" ]; then
  announce "${rel_tsx}" "${rel_entry}"
  launch "${rel_tsx}" "${rel_entry}"
  exit 0
fi

# 2) Fresh worktree: borrow the primary checkout's tsx + entry. The common git dir is <primary>/.git,
#    so its parent is the primary root. cwd stays the worktree, so the entry's git probes
#    (git-common-dir, --show-toplevel) still resolve THIS worktree as the protected current one.
common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -n "${common}" ]; then
  root="$(cd "$(dirname "${common}")" 2>/dev/null && pwd || true)"
  if [ -n "${root}" ] && [ -x "${root}/${rel_tsx}" ] && [ -f "${root}/${rel_entry}" ]; then
    announce "${root}/${rel_tsx}" "${root}/${rel_entry}"
    launch "${root}/${rel_tsx}" "${root}/${rel_entry}"
    exit 0
  fi
fi

# 3) No tsx anywhere — fail silent per the hook contract.
exit 0
