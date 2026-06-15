#!/usr/bin/env bash
# Reap orphaned `claude/real/<id>-<run>` promotion branches (ADR-0031).
#
#   DRY_RUN=true  bash scripts/reap-real-branches.sh   # log only, delete nothing (the safe default)
#   DRY_RUN=false bash scripts/reap-real-branches.sh   # actually delete
#
# A `--real` build promotes a signed pass by pushing a `claude/real/<id>-<run>` branch to origin.
# When a PR follows and auto-merges, the existing automerge job deletes the head (`gh pr merge
# --delete-branch`, .github/workflows/ci.yml). But when NO PR ever follows — the dogfood case — the
# branch lingers on origin forever. This sweep reclaims those orphans CONSERVATIVELY:
#
#   PRIMARY (always safe): the branch tip is already an ancestor of origin/main → it merged
#                          (claude/real/* merges are non-squash per ADR-0031, so the tip lands in
#                          main's history) → delete.
#   SECONDARY (TTL):       the branch has NO open PR and its tip is >= TTL_DAYS old → orphaned → delete.
#
# Hard safety rules, in priority order:
#   - ONLY ever touches refs under `claude/real/`. main and every other branch are untouchable.
#   - A branch with ANY open PR is NEVER deleted, regardless of merge/age state.
#   - On any gh/git tooling error for a branch it KEEPS the branch (fail-safe, never fail-delete).
#   - Logs one line per branch with the decision + reason, so a silent over-delete is impossible.
#
# Env: GITHUB_REPOSITORY (owner/repo, required) · GH_TOKEN (for gh) · DRY_RUN (default true) ·
#      TTL_DAYS (default 7). CI passes DRY_RUN=false on the schedule; manual dispatch defaults to true.
set -uo pipefail

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required (owner/repo)}"
DRY_RUN="${DRY_RUN:-true}"   # default DRY so a hand-run never surprises anyone
TTL_DAYS="${TTL_DAYS:-7}"
PREFIX="claude/real/"

now="$(date -u +%s)"

# Self-sufficient: fetch all remote heads so the merge + age checks are accurate whether this runs in
# CI (fresh checkout) or locally. Fail-soft — a fetch error aborts the sweep without deleting anything.
if ! git fetch --prune --quiet origin "+refs/heads/*:refs/remotes/origin/*"; then
  echo "::warning::could not fetch from origin — aborting sweep (nothing deleted)"
  exit 0
fi

mapfile -t refs < <(git for-each-ref \
  --format='%(refname:short) %(objectname) %(committerdate:unix)' \
  "refs/remotes/origin/${PREFIX}")

if [ "${#refs[@]}" -eq 0 ]; then
  echo "No ${PREFIX}* branches on origin — nothing to reap."
  exit 0
fi

echo "Scanning ${#refs[@]} ${PREFIX}* branch(es)  (DRY_RUN=${DRY_RUN}, TTL=${TTL_DAYS}d, repo=${REPO})"
echo

reaped=0
kept=0
for line in "${refs[@]}"; do
  shortref="${line%% *}"          # e.g. origin/claude/real/foo-abc123
  rest="${line#* }"
  tip="${rest%% *}"               # tip sha
  cdate="${rest##* }"            # committer date, unix seconds
  branch="${shortref#origin/}"   # e.g. claude/real/foo-abc123

  # Belt-and-braces guard: never act on anything outside claude/real/* (so main can never be hit).
  case "$branch" in
    "${PREFIX}"*) : ;;
    *) echo "  KEEP  $branch — not a ${PREFIX} branch (guard)"; kept=$((kept + 1)); continue ;;
  esac

  age_days=$(( (now - cdate) / 86400 ))

  # NEVER reap a branch with an OPEN PR, whatever its merge/age state. On a gh error, keep it.
  open_prs="$(gh pr list --repo "$REPO" --state open --head "$branch" --json number --jq 'length' 2>/dev/null || echo '?')"
  if [ "$open_prs" = '?' ]; then
    echo "  KEEP  $branch — could not check open PRs (gh error); refusing to delete"; kept=$((kept + 1)); continue
  fi
  if [ "$open_prs" != '0' ]; then
    echo "  KEEP  $branch — has $open_prs open PR(s)"; kept=$((kept + 1)); continue
  fi

  reason=''
  if git merge-base --is-ancestor "$tip" origin/main 2>/dev/null; then
    reason="merged into main"
  elif [ "$age_days" -ge "$TTL_DAYS" ]; then
    reason="orphaned: no open PR, ${age_days}d old (>= ${TTL_DAYS}d TTL)"
  fi

  if [ -z "$reason" ]; then
    echo "  KEEP  $branch — not merged, no open PR, ${age_days}d old (< ${TTL_DAYS}d TTL)"; kept=$((kept + 1)); continue
  fi

  if [ "$DRY_RUN" = 'true' ]; then
    echo "  DRY   $branch — WOULD delete ($reason)"; reaped=$((reaped + 1)); continue
  fi

  if gh api -X DELETE "repos/${REPO}/git/refs/heads/${branch}" >/dev/null 2>&1; then
    echo "  REAP  $branch — deleted ($reason)"; reaped=$((reaped + 1))
  else
    echo "::warning::failed to delete $branch — leaving it in place"; kept=$((kept + 1))
  fi
done

echo
if [ "$DRY_RUN" = 'true' ]; then
  echo "Dry run complete: $reaped branch(es) WOULD be reaped, $kept kept."
else
  echo "Sweep complete: $reaped branch(es) reaped, $kept kept."
fi
