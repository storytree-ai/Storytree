#!/usr/bin/env bash
# Resolve the head branch(es) whose merge this workflow event represents — the input to the
# claim-release writer (ADR-0138 §4 / ADR-0200's guaranteed machine clear).
#
# WHY THIS EXISTS (ADR-0345 D4 / ADR-0304 D3). `ci.yml`'s automerge job already releases a merged
# branch's claims, but it is `pull_request`-only AND gated on `steps.merge.outputs.merged == 'true'`.
# Under a MERGE QUEUE `gh pr merge` QUEUES rather than merges, so that gate is false for every PR and
# the queue's own later merge would run no job that releases claims — every merged branch would keep
# its claims forever, silently. This resolves the same fact from the merge that ACTUALLY landed.
#
# THE SAFETY PROPERTY. Releasing a branch that did NOT merge would erase a LIVE session's claims —
# strictly worse than the bug being fixed. So every ref emitted here is filtered on the PR's own
# `merged_at != null` and `base.ref == main`. When anything is uncertain this emits NOTHING: an
# unreleased claim is recoverable (the 2 h stale reclaim, `worktree prune`, a re-run of this
# workflow), an erased live claim is not.
#
# Emits one branch per line on stdout; empty output means "nothing to release", which is a normal
# outcome (a direct push to main, a closed-unmerged PR) and not an error.
#
# Env: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_NAME, plus per-event:
#   push             — PUSH_BEFORE / PUSH_AFTER (the pushed range)
#   pull_request     — PR_MERGED / PR_HEAD_REF / PR_BASE_REF
#   workflow_dispatch — INPUT_BRANCH
set -uo pipefail

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
event="${GITHUB_EVENT_NAME:?GITHUB_EVENT_NAME required}"

# The all-zero sha git uses for "no such commit" — a branch CREATE has no before-range to compare.
ZERO="0000000000000000000000000000000000000000"

case "$event" in
  workflow_dispatch)
    # The manual escape hatch and the PRE-FLIP VERIFICATION LEVER. The merge-queue path cannot be
    # exercised before the queue is on, so this is how the job's own mechanics (auth, resolution,
    # the writer, idempotency) get proved against the live store first. Trusted as given: a human
    # typed it deliberately.
    branch="${INPUT_BRANCH:-}"
    [ -n "$branch" ] && echo "$branch"
    exit 0
    ;;

  pull_request)
    # Fires when the queue merges the PR, and when a human merges in the UI. Does NOT fire for
    # ci.yml's own `gh pr merge` (GitHub anti-recursion suppresses events from a GITHUB_TOKEN
    # action) — that path is covered by the automerge job's own release step, which is why the two
    # do not double up today and why they must be idempotent when they eventually do.
    if [ "${PR_MERGED:-}" = "true" ] && [ "${PR_BASE_REF:-}" = "main" ]; then
      echo "${PR_HEAD_REF:?PR_HEAD_REF required}"
    fi
    exit 0
    ;;

  push)
    before="${PUSH_BEFORE:-}"
    after="${PUSH_AFTER:-}"
    if [ -z "$after" ] || [ "$after" = "$ZERO" ]; then
      echo "note: push event carries no new head — nothing to resolve." >&2
      exit 0
    fi
    if [ -z "$before" ] || [ "$before" = "$ZERO" ]; then
      echo "note: push has no before-range (branch create / force) — nothing to resolve." >&2
      exit 0
    fi
    ;;

  *)
    echo "note: event '$event' carries no merged head ref — nothing to resolve." >&2
    exit 0
    ;;
esac

# ── push: resolve the PRs the pushed range actually merged ───────────────────
#
# A merge-queue merge produces a push to `main`, and with `max_entries_to_merge > 1` a single push
# can carry SEVERAL merged PRs — so the whole range is walked, not just the tip.
#
# Prefer the MERGE COMMITS in the range (parents > 1): under this repo's merge method that is
# exactly one commit per merged PR, so the association lookup costs one API call per PR rather than
# one per commit on the branch. A queue configured to squash or rebase produces no merge commit, so
# fall back to every commit in the range — correct, just chattier.
commits="$(gh api "repos/${repo}/compare/${before}...${after}" \
  --jq '.commits[] | select((.parents | length) > 1) | .sha' 2>/dev/null)"
status=$?
if [ "$status" -ne 0 ]; then
  echo "warning: could not compare ${before}...${after} (gh error) — resolving nothing." >&2
  exit 0
fi

if [ -z "$commits" ]; then
  commits="$(gh api "repos/${repo}/compare/${before}...${after}" --jq '.commits[].sha' 2>/dev/null)"
  if [ "$?" -ne 0 ] || [ -z "$commits" ]; then
    echo "note: no commits resolved in ${before}...${after} — nothing to release." >&2
    exit 0
  fi
fi

# Associated PRs, filtered HARD to ones that genuinely merged into main. A PR that is merely
# associated with a commit (open, or closed-unmerged) must never reach the writer.
refs=""
while IFS= read -r sha; do
  [ -n "$sha" ] || continue
  found="$(gh api "repos/${repo}/commits/${sha}/pulls" \
    --jq '.[] | select(.merged_at != null) | select(.base.ref == "main") | .head.ref' 2>/dev/null)"
  if [ "$?" -ne 0 ]; then
    echo "warning: could not read PRs for ${sha} (gh error) — skipping that commit." >&2
    continue
  fi
  [ -n "$found" ] && refs="${refs}${found}"$'\n'
done <<< "$commits"

# Order-preserving dedupe: one PR's merge commit can appear under several lookups.
echo -n "$refs" | awk 'NF && !seen[$0]++'
exit 0
