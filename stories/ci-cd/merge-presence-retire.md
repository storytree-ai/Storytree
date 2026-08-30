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
