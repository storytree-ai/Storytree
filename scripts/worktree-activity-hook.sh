#!/usr/bin/env bash
# SessionStart worktree-ACTIVITY sweep launcher (ADR-0535 D2) — the half that makes the claim board
# know rather than merely admit it does not. Mirrors scripts/worktree-prune-hook.sh: find a `tsx`
# that exists even in a FRESH git worktree (which has no node_modules of its own), then run the
# ambient entry's `sweep` mode DETACHED.
#
# WHAT IT BUYS, AND WHY IT IS NOT THE STATUSLINE. Liveness used to be self-reported by the terminal
# status bar (`presence-hook.sh statusline`), which desktop and unattended sessions never draw — so
# every claim they held aged into stale-reclaim exactly 2h after it was taken, whatever the session
# was doing, and the board told an owner an arc was unheld while a session was 432 tool calls into
# it. The sweep observes file CHANGE inside every claimed worktree instead, so (a) it works for
# session types that draw nothing, and (b) it vouches for EVERY claimed worktree on this box, not
# just this session's — one live process covers the quiet ones. A wedged session cannot fake it: a
# timer proves a process exists, which is exactly what a hang also proves; touching files is not.
#
# WHY DETACHED: the write needs the keyless Cloud SQL connector, whose first handshake measures
# ~6-11s on this box. Session start must never wait on that. The entry checks its debounce marker
# and does the (cheap, local) filesystem observation BEFORE it asks for a store at all, so a box
# with nothing to report costs a handful of stats and no connection — but when there IS something
# to say, the connection is slow, and it happens off the critical path.
#
# WHY NOT A NEW HOOK EVENT: `UserPromptSubmit`, `PreToolUse` and `Stop` are fenced off by
# `auditHookConfig`'s BLOCKING_EVENTS (a ledger-writing hook must never be able to block a session),
# and registering `PostToolUse` would put store work on a per-tool-call path and introduce a hook
# category this repo has never carried — its own decision, not a launcher's quiet call. SessionStart
# plus the statusline reach every session type between them precisely because the sweep is a sweep.
#
# HARD CONTRACT (matches ambient-presence-entry.ts / worktree-prune-hook.sh): ALWAYS exit 0,
# bounded, and silent on every failure path — an ambient failure must never surface into the session.
set -u

rel_tsx="packages/cli/node_modules/.bin/tsx"
rel_entry="packages/cli/src/ambient-presence-entry.ts"

# Launch detached in a background subshell so the child is orphaned (survives this script's exit)
# and the hook returns at once. Output is discarded — the entry is silent by contract.
launch() {
  ( "$1" "$2" sweep >/dev/null 2>&1 & )
}

# 1) Installed worktree: use its own tsx + entry (cwd-relative).
if [ -x "${rel_tsx}" ] && [ -f "${rel_entry}" ]; then
  launch "${rel_tsx}" "${rel_entry}"
  exit 0
fi

# 2) Fresh worktree: borrow the primary checkout's tsx + entry. The common git dir is <primary>/.git,
#    so its parent is the primary root. cwd stays the worktree, so the entry's `deriveIdentity()`
#    still resolves THIS worktree's session id regardless of which install we borrowed.
common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -n "${common}" ]; then
  root="$(cd "$(dirname "${common}")" 2>/dev/null && pwd || true)"
  if [ -n "${root}" ] && [ -x "${root}/${rel_tsx}" ] && [ -f "${root}/${rel_entry}" ]; then
    launch "${root}/${rel_tsx}" "${root}/${rel_entry}"
    exit 0
  fi
fi

# 3) No tsx anywhere — fail silent per the hook contract.
exit 0
