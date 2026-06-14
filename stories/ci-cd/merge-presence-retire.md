---
id: "merge-presence-retire"
tier: capability
story: ci-cd
title: "Merge-presence retire — the merge is the authoritative 'session done' fact"
outcome: "On merge, the merged session's presence row is authoritatively retired (the SessionEnd-miss backstop), keyless and fail-soft."
status: proposed
proof_mode: integration-test
depends_on: [auto-merge-on-green]
# Cross-story forward edge (ADR-0010 §4): retires through notice-board's presence-store seam.
---

# Merge-presence retire — the merge is the authoritative "session done" fact

**Outcome —** On merge, the `automerge` job runs
[`packages/store/src/ingest-merge.ts`](../../packages/store/src/ingest-merge.ts) (keyless WIF,
[`infra/ci-presence.tf`](../../infra/ci-presence.tf)) to authoritatively retire the merged session's
`events.session` presence row — the backstop for the racy `SessionEnd` hook that a fresh worktree's
deletion makes miss (ADR-0033 / ADR-0041) — and the whole thing is **fail-soft**.

> **Cross-story boundary (ADR-0010 §4):** this capability writes through the **`presence-store`**
> seam owned by [`stories/notice-board`](../notice-board/story.md) (the `events.session_event` +
> `events.session` event+projection). It does not own presence; it adds the merge-time "done" event
> to a store another story defines. A forward edge from this trunk into a sibling — declared, not
> absorbed.

## Guidance

- **Proof-walkthrough first (integration test, against the real writer + the real job wiring).** The
  capability has two halves to prove together: (1) `ingest-merge.ts` derives the right session
  identity from the merged head ref and marks its `events.session` row done at the merge timestamp,
  upserting through the presence store seam (the same `done()` semantics notice-board defines); and
  (2) the `automerge` job wires it FAIL-SOFT — every retire step is `continue-on-error: true`, the
  writer itself never exits non-zero, and the steps are gated on a `claude/*` head ref so non-session
  merges skip the GCP/DB spin-up entirely. Prove the writer's offline portion against a fake
  transactional client; the live `events.session` write follows the house live-gated pattern.
- **Fail-soft is the contract, not a nicety.** The merge already happened and presence is advisory
  (ADR-0033) — a GCP-auth hiccup, a cold Cloud SQL handshake, or a DB-down must NEVER fail the merge
  job. Every step carries `continue-on-error: true`; the writer swallows its own errors. If this can
  ever redden a merge, the capability is broken.
- **Keyless (ADR-0021).** Auth is GitHub OIDC → the `github-actions` WIF pool → the
  `storytree-ci-presence` service account (its Cloud SQL IAM `.iam` short-form username). No JSON key
  in a secret. The pool/provider/SA are provisioned by `infra/ci-presence.tf` (a one-time owner
  `terraform apply`); the provider resource name embeds the project NUMBER, not the id.
- **Why the merge is the right trigger:** the merge IS the authoritative "this session's work is
  done" fact — the one the `SessionEnd` hook misses when a worktree is deleted before it fires. The
  `ci.yml` constants (pool path, SA email, project number) must match the `ci-presence.tf` outputs.

## Contracts (3)

1. **`merge-retires-the-session-row`** — the merged session's presence is marked done
   - **asserts —** `ingest-merge.ts`, given the merged head ref and merge timestamp, marks that
     session's `events.session` row done (a `done` event over the projection) through the
     presence-store seam — so the session leaves the active board after its PR lands.
2. **`fail-soft-never-blocks-the-merge`** — every failure mode is swallowed
   - **asserts —** the retire steps are `continue-on-error: true` and `ingest-merge.ts` exits zero
     even on a store/auth error (bad creds, DB down, cold-handshake timeout) — the merge job's
     success is independent of the retire outcome.
3. **`gated-keyless-on-session-branches`** — only agent sessions spin up GCP/DB, keylessly
   - **asserts —** the retire steps run only when the head ref starts with `claude/` (non-session
     merges skip the GCP/DB steps entirely), and authentication is keyless WIF (the `ci-presence.tf`
     pool + `storytree-ci-presence` SA) — no JSON key is referenced.
