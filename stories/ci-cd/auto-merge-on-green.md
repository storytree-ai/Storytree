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

> **Adjudicated 2026-08-31 (`prove-unproven-capabilities-arc-inc-25`) — RECORDED AS CORRECT, no
> hierarchy change. The premise that routed it here does not survive a check at source.** That
> increment filed this capability under "the thing to prove is a deployment, a live runtime, or a
> CI-side behaviour — not a unit a worktree red→green can drive", on the reading "live GitHub merge
> semantics". **This spec has never claimed live merge semantics.** The proof-walkthrough below
> scopes the unit to the `automerge` job **definition** — an in-repo file — and says so in terms:
> *"The condition is the unit under test; the actual `gh` call is asserted by shape, since exercising
> a real merge needs a live PR."* All three contracts are assertable against
> `.github/workflows/ci.yml` with no PR, no network and no money.
>
> **The harness pattern is already built here, twice** — so this is not even a new technique:
> `packages/notice-board/src/store/ingest-merge.test.ts` reads `.github/workflows/ci.yml` and
> `claim-release.yml` as fixtures, and `packages/library/src/gate-command-file-audit.ts` audits the
> same file. Verified against the live job the same day: `needs: verify`, the `if:` on
> `pull_request` + `draft == false` + no `hold` label, and `gh pr merge --merge --delete-branch` are
> all present exactly as the contracts describe.
>
> So the end-state is **capability-shaped, correctly tiered, correctly `integration-test`, and
> UNBUILT** — it belongs in a build lane, not an adjudication lane. It is **not** an ADR-0466 case:
> nothing outside this repo has to publish a result back, because the artifact under test is a file
> in this repo.

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
- **The merge step reads its outcome back, and a test must not mistake that for drift (added
  2026-08-31).** Since ADR-0304 D3 the step does not assume the merge took: it reads `gh pr view …
  --json state` and sets a `merged` output, because against a base branch requiring a merge queue
  `gh pr merge` ENQUEUES rather than merges, and every step after it is post-MERGE work that must not
  run on a merely-queued PR. `MERGED` and `OPEN` are the only two reachable states; anything else is
  a loud failure rather than a default. ⚠ The queue itself is **DECLINED and will not be switched
  on** (ADR-0362 D1, withdrawing ADR-0304 D3), so the guard is inert today — but it is kept
  deliberately (ADR-0362 D2b) and is NOT dead code to strip. A contract test asserting the merge step
  should pin `gh pr merge --merge --delete-branch` and tolerate the readback around it.

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
