#!/usr/bin/env bash
# Ambient-session hook launcher (ADR-0033 / ADR-0048; re-founded on the claim ledger by
# ADR-0200 D5/D7 — presence is retired, the entry now serves the SessionStart claim nudge
# and the claim-ledger statusline glance + heartbeat). Runs the ambient entry with a
# `tsx` that exists even in a FRESH git worktree that has no node_modules of its own.
#
# THE BUG THIS FIXES (the "5 sessions, nothing on the tree" report, 2026-06-14): a fresh
# `.claude/worktrees/<name>` checkout has no node_modules, so the old hook command
#   pnpm --silent --filter @storytree/cli exec tsx src/ambient-presence-entry.ts <mode>
# failed with "'tsx' is not recognized" BEFORE the entry script — and its statusline
# self-heal — ever ran. The session then never landed a presence row and never showed on
# the board/tree. The self-heal in ambient-presence.ts is downstream of this failure, so
# it could never fire; the fix has to be here, ahead of tsx.
#
# THE FIX: a worktree is physically nested inside the primary checkout, so Node's module
# resolution already walks up to the primary's node_modules on its own — the ONLY thing
# missing is the tsx BINARY. Prefer the worktree's own tsx when it is installed; otherwise
# borrow the primary checkout's. cwd stays the worktree either way, so deriveIdentity()'s
# git calls (`git rev-parse --show-toplevel`) resolve the WORKTREE identity regardless of
# which install we borrow.
#
# HARD CONTRACT (matches ambient-presence-entry.ts): ALWAYS exit 0, bounded, and silent on
# every failure path — an ambient failure must never surface into the session.
set -u

rel_tsx="packages/cli/node_modules/.bin/tsx"
rel_entry="packages/cli/src/ambient-presence-entry.ts"

# 1) Installed worktree: use its own tsx + its own entry (cwd-relative). This is the
#    pre-existing behaviour for a worktree someone has run `pnpm install` in.
if [ -x "${rel_tsx}" ] && [ -f "${rel_entry}" ]; then
  exec "${rel_tsx}" "${rel_entry}" "$@"
fi

# 2) Fresh worktree: borrow the primary checkout's tsx + entry. The common git dir is
#    <primary>/.git, so its parent is the primary checkout root.
common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -n "${common}" ]; then
  root="$(cd "$(dirname "${common}")" 2>/dev/null && pwd || true)"
  if [ -n "${root}" ] && [ -x "${root}/${rel_tsx}" ] && [ -f "${root}/${rel_entry}" ]; then
    exec "${root}/${rel_tsx}" "${root}/${rel_entry}" "$@"
  fi
fi

# 3) No tsx anywhere (e.g. the primary checkout has not been installed either) — fail
#    silent per the hook contract.
exit 0
