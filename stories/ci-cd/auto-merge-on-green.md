---
id: "auto-merge-on-green"
tier: capability
story: ci-cd
title: "Auto-merge on green — a non-draft, non-hold PR lands the instant verify passes"
outcome: "A non-draft, non-hold PR auto-merges the instant verify is green — never a manual merge."
status: proposed
proof_mode: integration-test
depends_on: [green-gate]
---

# Auto-merge on green — a non-draft, non-`hold` PR lands the instant `verify` passes

**Outcome —** The `automerge` job ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml))
merges a **non-draft, non-`hold`** PR the instant `verify` is green — `gh pr merge --merge
--delete-branch`, never a manual merge (ADR-0022). Auto-merge runs inside free Actions because
GitHub-native auto-merge is paywalled on private repos.

## Guidance

- **Proof-walkthrough first (integration test, against the real `automerge` job definition).** Drive
  the job's gate condition over the matrix of PR states and assert it runs ONLY for `pull_request`
  events where `draft == false` AND no `hold` label — and `needs: verify`, so it never runs before
  green. Then assert the merge step is `gh pr merge … --merge --delete-branch` (the squash/rebase
  modes are NOT used — a `--merge` keeps a verdict commit an ancestor, ADR-0031). The condition is
  the unit under test; the actual `gh` call is asserted by shape, since exercising a real merge needs
  a live PR (the house live-gated pattern).
- **`--merge` not `--squash`** is load-bearing: `claude/real/*` promotion branches must merge
  non-squash so a signed verdict's commit stays an ancestor of `main` (ADR-0031). The capability
  pins the merge mode, not just "it merges."
- **Draft / `hold` is the only opt-out, and it is temporary.** A held unit flips to ready the moment
  it is green — a finished green unit parked in draft is exactly the slip the merge ceremony forbids.
  The capability proves the opt-out exists; the discipline of flipping it lives in the
  `session-orchestrator` operating loop.
- **No manual `gh pr merge`.** Humans approve by making the PR ready (non-draft, no `hold`), not by
  clicking merge. The single auto-merge path is what makes "approval-gated trunk" mean one thing.

## Contracts (3)

1. **`merges-only-when-green-nondraft-unheld`** — the gate condition is exact
   - **asserts —** the `automerge` job runs iff the event is a `pull_request`, `draft == false`, and
     no `hold` label is present, and only after `verify` (`needs: verify`); flipping any of draft /
     `hold` / a red `verify` suppresses the merge.
2. **`merge-mode-preserves-ancestry`** — `--merge`, not squash/rebase
   - **asserts —** the merge step invokes `gh pr merge --merge --delete-branch` (a true merge commit,
     branch deleted) — never `--squash`/`--rebase` — so a promotion branch's verdict commit stays an
     ancestor of `main` (ADR-0031).
3. **`hold-is-the-only-temporary-opt-out`** — draft/`hold` defers, nothing else gates
   - **asserts —** a `hold`-labelled or draft PR with a green `verify` does NOT merge; removing the
     label / marking ready lets the next `automerge` run land it — the opt-out is a temporary
     deferral, not a parallel approval mechanism.
