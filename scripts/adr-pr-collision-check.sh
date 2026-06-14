#!/usr/bin/env bash
# ADR-number collision check across OPEN PRs (ADR-0050, Layer 2 of the dup-number gate).
#
# The DB allocator (`storytree adr new`) stops two ONLINE sessions picking the same ADR number, and
# adr-health's `adr-number-unique` check makes any duplicate that reaches `main` un-mergeable (CI runs
# on the PR's merge-into-main ref, so a number already on main fails the PR). The one gap that leaves
# is a TRULY-CONCURRENT pair: two PRs that each ADD the same number on their own branch, neither
# merged yet — neither one's merge ref contains the other's file. This step closes that gap: it fails
# a PR whose newly-added ADR number is also being added by another open PR.
#
# CI-only (needs `gh` + the Actions token). FAIL-OPEN on tooling errors (gh/network) and FAIL-CLOSED
# only on a real collision — so a flaky API never blocks all merges, while a genuine clash does; the
# adr-health gate on main remains the ultimate backstop either way.
#
# Env: GH_TOKEN (the Actions token), GITHUB_REPOSITORY (owner/repo), PR_NUMBER (this PR).
set -uo pipefail

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
pr="${PR_NUMBER:?PR_NUMBER required}"

# The 4-digit numbers of ADR files a PR ADDS (status=added; an edit/renumber of an existing file is
# not a new claim). Empty on any gh failure — callers treat empty-for-self as "nothing to check".
added_adr_numbers() {
  gh api "repos/${repo}/pulls/$1/files" --paginate \
      --jq '.[] | select(.status=="added") | .filename' 2>/dev/null \
    | grep -oE 'docs/decisions/[0-9]{4}-' \
    | grep -oE '[0-9]{4}' \
    | sort -u
}

mine="$(added_adr_numbers "$pr")"
if [ -z "$mine" ]; then
  echo "PR #$pr adds no new ADR files — no collision possible."
  exit 0
fi
echo "PR #$pr adds ADR number(s):"
echo "$mine" | sed 's/^/  ADR-/'

others="$(gh pr list --repo "$repo" --state open --json number --jq '.[].number' 2>/dev/null)"
if [ -z "$others" ]; then
  echo "warning: could not list open PRs (gh error) — relying on the adr-health gate on main." >&2
  exit 0
fi

collision=0
for other in $others; do
  [ "$other" = "$pr" ] && continue
  theirs="$(added_adr_numbers "$other")"
  [ -z "$theirs" ] && continue
  common="$(comm -12 <(echo "$mine") <(echo "$theirs"))"
  if [ -n "$common" ]; then
    nums="$(echo "$common" | sed 's/^/ADR-/' | paste -sd', ' -)"
    echo "::error::ADR number collision with open PR #$other on ${nums}. One of you must renumber — run \`storytree adr new --title \"...\" --pg\` to reserve a free number, or \`storytree adr next --pg\`."
    collision=1
  fi
done

if [ "$collision" = "1" ]; then
  exit 1
fi
echo "No ADR-number collision with other open PRs."
exit 0
