---
id: "merge-presence-retire"
tier: capability
story: ci-cd
title: "Merge-clear — the merge is the authoritative 'this branch's work is done' fact"
outcome: "On merge, the merged branch's claim rows are authoritatively released (the SessionEnd-miss backstop), for any branch shape, keyless and fail-soft."
status: proposed
proof_mode: integration-test
depends_on: [auto-merge-on-green]
# Cross-story forward edge (ADR-0010 §4): retires through notice-board's presence-store seam.
# ADOPTION BASIS (ADR-0465 D2/D4), declared spec-borne per ADR-0057. All three contracts are
# exercised today by `packages/notice-board/src/store/ingest-merge.test.ts`, which proves the writer
# offline against a fake store AND audits the two workflow files that invoke it:
# `merge-releases-the-branch-claims` — releaseBranchClaims calls releaseClaimsByBranch with the FULL
# branch and returns the count; a zero count is a clean no-op; a second release is idempotent and does
# not disturb the waiter the first one promoted.
# `fail-soft-never-blocks-the-merge` — "a THROWING store is swallowed — returns -1, never rejects".
# `branch-shape-blind-and-keyless` — parseMergedHeadRefs "keeps ANY branch shape — no claude/*
# filtering", the ci.yml audit asserts no automerge step is gated on a claude/* head ref, and
# claim-release.yml carries the merge-queue-reachable second caller in STRICT mode.
# NO `real:` arm — the code and its tests already exist, so there is no red to observe (ADR-0465).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/notice-board", "test"]
  scope:
    testGlobs:
      - "packages/notice-board/src/store/ingest-merge.test.ts"
    sourceGlobs:
      - "packages/notice-board/src/store/ingest-merge.ts"
---

# Merge-clear — the merge is the authoritative "this branch's work is done" fact

**Outcome —** On merge, the `automerge` job runs
[`packages/notice-board/src/store/ingest-merge.ts`](../../packages/notice-board/src/store/ingest-merge.ts)
(keyless WIF, [`infra/ci-presence.tf`](../../infra/ci-presence.tf)) to authoritatively release the
merged branch's `node_claim` rows — the backstop for the racy `SessionEnd` hook that a fresh
worktree's deletion makes miss (ADR-0033 / ADR-0041) — and the whole thing is **fail-soft**.

> **Corrected in place 2026-08-31 — the mechanism this capability clears was replaced, the
> capability was not.** As authored it retired the merged session's `events.session` PRESENCE row.
> ADR-0200 D7 retired advisory session-presence rows outright; what the merge actually clears today
> is the deterministic CLAIM ledger — `releaseBranchClaims` deletes the merged branch's `node_claim`
> rows and emits one `released` event each, promoting any queued waiter. The writer also MOVED with
> ADR-0068/ADR-0077: `packages/store` dissolved and it now lives in the notice-board organism's
> `./store` subpath. Two further facts the original text got the wrong way round, both measured:
> there is **no `claude/*` head-ref gate** (there was one, and PR #1024's `worktree-…` branch kept
> its work claim for 46 minutes past its own merge because of it), and there is now a **second
> caller** — `.github/workflows/claim-release.yml`, triggered by the push to `main`, so a merge
> QUEUE cannot strand a branch's claims. Contract 3 below is rewritten accordingly; contracts 1 and
> 2 are re-worded to the surviving mechanism. The DECISION — that the merge is the authoritative
> "done" fact, cleared keylessly and fail-soft — never changed, which is why this is an in-place
> correction rather than a supersede.

> **Corrected in place 2026-09-08 — this capability's writer had NEVER RUN across a shorter window
> than first suspected, and both its contracts were green throughout.** Measured on the real merge of
> PR #1877 (2026-09-07, run 34146276659, job `automerge`): the release step printed
> `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "tsx" not found` and exited 254. `continue-on-error:
> true` then swallowed the 254, so the job went green and the merge clear ADR-0138 §4 calls
> *guaranteed* silently did not happen — while the step's own comment asserted, in prose, that `tsx`
> could resolve ("a @storytree/notice-board devDep").
>
> ⚠ **CORRECTION TO THIS CORRECTION, same day: `tsx` was NOT "never a dependency," and the window is
> NOT "since the writer moved here under ADR-0077."** This repo's own git history shows `tsx` present
> in `@storytree/notice-board`'s devDependencies continuously from the package's creation (2026-06-18)
> through at least 2026-08-21. It was stripped on **2026-08-23 09:31** by `c0c58ccd`
> ("convert the pure-schema set to bun test — 13 packages", `bun-runtime-migration-arc` increment 3),
> which removed the same devDependency from twelve of thirteen converted packages as apparently
> manifest-unused. A sibling commit ninety minutes later (`3e6c5aa9`) already found that removal rule
> too narrow for other packages ("a dependency is not only what the manifest's own scripts use") and
> restored `tsx` where it broke a package-as-cwd invocation — but its sweep read scripts under
> `packages/**`/`apps/**`, not `.github/workflows/*.yml`, so this cross-workflow invocation was not
> among the ones it caught. The exact failure signature is independently confirmed on 2026-08-26
> (PR #1663) as well as 2026-09-07 (PR #1877). **So the unrealised window is 2026-08-23 → 2026-09-08 —
> about two and a half weeks, not the roughly eleven implied by "since ADR-0077."** `claim-release.yml`
> carries the identical invocation and was equally broken for that whole window, though — per this
> repo's own Actions history — it was never actually exercised inside it (its only two runs recorded
> there both read `skipped`, and no `push`-triggered run appears at all under an ordinary GITHUB_TOKEN
> automerge), so it never had the chance to fail loudly either.
>
> The claims this was meant to release are among the corpses `ledger-liveness-honesty-arc` measured on
> 2026-09-05, for whatever share of that measurement falls inside the shorter window — that
> measurement predates this correction and was not re-run against it. Fixed by declaring the
> dependency (`packages/notice-board/package.json`); the assertion-in-a-comment is replaced by a real
> one, which is repo-wide rather than scoped here because the next instance will be a different
> workflow: `ingest-ci-activity.test.ts` scans every workflow for `pnpm --filter <pkg> exec <bin>` and
> fails unless `<pkg>` declares `<bin>`. ⚠ Contract 2 below is UNCHANGED and was never wrong —
> fail-soft IS the contract on the merge path. What this shows is its blind spot: fail-soft plus a
> wiring claim that only a comment held meant nothing observed the difference between "released
> nothing because there was nothing to release" and "never ran at all". Read contract 1 as the one
> that had no witness on the merge path until now. See ADR-0138 §4 and ADR-0345 D4 (both corrected in
> place, same date) for the decision-level account.

> **Cross-story boundary (ADR-0010 §4):** this capability writes through the **claim-store** seam
> owned by [`stories/notice-board`](../notice-board/story.md) (the `events.node_claim` ledger). It
> does not own the ledger; it adds the merge-time release to a store another story defines. A
> forward edge from this trunk into a sibling — declared, not absorbed.

## Guidance

- **Proof-walkthrough first (integration test, against the real writer + the real job wiring).** The
  capability has two halves to prove together: (1) `ingest-merge.ts` parses the merged head ref(s)
  and releases each branch's `node_claim` rows through the claim-store seam (the same
  `releaseClaimsByBranch` semantics notice-board defines, one `released` event per claim); and
  (2) the `automerge` job wires it FAIL-SOFT — every release step is `continue-on-error: true` and
  the writer itself never exits non-zero. It is deliberately NOT gated on a head-ref shape: claims
  are keyed on the full branch and any shape can hold them. Prove the writer's offline portion
  against a fake transactional client and the wiring by auditing the two workflow YAMLs; the live
  claim write follows the house live-gated pattern.
- **Fail-soft is the contract, not a nicety — in the `automerge` job.** The merge already happened
  (ADR-0033) — a GCP-auth hiccup, a cold Cloud SQL handshake, or a DB-down must NEVER fail the merge
  job. Every step there carries `continue-on-error: true`; the writer swallows its own errors and
  returns `-1`. If this can ever redden a merge, the capability is broken. ⚠ The SECOND caller,
  `claim-release.yml`, is deliberately the opposite: it gates nothing, so a swallowed failure there
  would rebuild the very silent-release-failure defect it exists to close, and it therefore runs
  `STORYTREE_CLAIM_RELEASE_STRICT` and reds loudly. Fail-soft is a property of the merge PATH, not of
  the writer everywhere.
- **Keyless (ADR-0021).** Auth is GitHub OIDC → the `github-actions` WIF pool → the
  `storytree-ci-presence` service account (its Cloud SQL IAM `.iam` short-form username). No JSON key
  in a secret. The pool/provider/SA are provisioned by `infra/ci-presence.tf` (a one-time owner
  `terraform apply`); the provider resource name embeds the project NUMBER, not the id.
- **Why the merge is the right trigger:** the merge IS the authoritative "this session's work is
  done" fact — the one the `SessionEnd` hook misses when a worktree is deleted before it fires. The
  `ci.yml` constants (pool path, SA email, project number) must match the `ci-presence.tf` outputs.

## Contracts (3)

1. **`merge-releases-the-branch-claims`** — the merged branch's claims are released
   - **asserts —** `ingest-merge.ts`, given the merged head ref(s), releases that branch's
     `node_claim` rows through the claim-store seam (`releaseBranchClaims` → `releaseClaimsByBranch`,
     one `released` event per claim) and returns the count — so the branch's wisps leave the map
     after its PR lands. A branch holding no claims is a clean no-op, a second release is idempotent,
     and the second release does not disturb the waiter the first one promoted.
2. **`fail-soft-never-blocks-the-merge`** — every failure mode is swallowed
   - **asserts —** the retire steps are `continue-on-error: true` and `ingest-merge.ts` exits zero
     even on a store/auth error (bad creds, DB down, cold-handshake timeout) — the merge job's
     success is independent of the retire outcome.
3. **`branch-shape-blind-and-keyless`** — every merged branch shape is cleared, keylessly, by two
   callers
   - **asserts —** `parseMergedHeadRefs` keeps ANY branch shape (a lobby-ceremony `worktree-…`, a
     `claude/real/…` promotion and a `renovate/…` branch all survive parsing, and a batch push
     yields each one), no `automerge` step is gated on a `claude/*` head-ref prefix, and
     `claim-release.yml` carries a SECOND caller a merge queue can reach — triggered by the push to
     `main`, refusing to release for a merely-CLOSED PR, never cancelling in progress, and running
     `STORYTREE_CLAIM_RELEASE_STRICT` so a failed standalone release is loud rather than silent.
     Authentication is keyless WIF throughout (the `ci-presence.tf` pool + the
     `storytree-ci-presence` SA's Cloud SQL IAM username) — no JSON key is referenced.
   - **why the shape gate had to go —** claims are keyed on the FULL branch and any shape can hold
     them; the old `startsWith(head.ref, 'claude/')` gate is what let PR #1024's work claim outlive
     its own merge.
