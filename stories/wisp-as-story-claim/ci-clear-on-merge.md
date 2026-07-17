---
id: "ci-clear-on-merge"
tier: capability
story: wisp-as-story-claim
title: "CI clears the claim on merge — the merge job releases the merged branch's node_claim rows"
outcome: "The CI merge job releases `events.node_claim` rows (every grade) for the merged/closed branch, calling `releaseClaimsByBranch` (capability A1) — the guaranteed machine clear that fixes 'never cleared' (the presence sweep this rode alongside retired with the presence layer, ADR-0200)."
status: proposed
proof_mode: operator-attested
depends_on: [claim-store-work-time]
decisions: [138, 33, 121]
# SUPPLEMENT / GLUE: this capability has NO isolatable red→green of its own — the released function
# (releaseClaimsByBranch) is PROVEN in capability A; what lives here is the YAML wiring in
# .github/workflows/ci.yml (extend the merge job's presence sweep to also call it for the merged/closed
# branch). A workflow edit cannot be driven red→green by the prove-it-gate, so the proof mode is
# `operator-attested` (ADR-0070): the clear is OBSERVED — the merge job runs, the branch's wisp disappears
# (the appearance UAT, capability F, witnesses it). Built by the orchestrator's OWN subagent (not the
# red→green leaf), exactly the `orchestrate-route-supplement` glue class. NO `proof:` block — operator-
# attested capabilities are not `--real`-buildable; they are witnessed.
---

# CI clears the claim on merge

**Outcome —** The CI merge job — which already *"sweep[s] possibly-dead presence rows"* — **also releases
`events.node_claim` rows for the merged/closed branch**, calling `releaseClaimsByBranch` (capability
[`claim-store-work-time`](claim-store-work-time.md), A1). This is the **guaranteed machine clear** that
fixes ADR-0138's "never cleared" failure mode — the reason coordination presence was previously demoted
(ADR-0124, superseded). `branch` is already a column on `events.node_claim`, so the release keys on it
alone.

**Depends on —** [`claim-store-work-time`](claim-store-work-time.md) (A1's `releaseClaimsByBranch` is the
function this wiring calls).

> **ADR-0200 note (all grades, no presence sweep).** The merge job's OLD companion — the possibly-dead
> **presence** sweep this capability's outcome referenced ("which already sweeps possibly-dead presence
> rows") — retired with the presence layer (ADR-0200; the ADR-0079 reaper is gone). What stands is the
> **claim** clear: `releaseClaimsByBranch(<merged-branch>)` now releases **every grade** for the branch
> (exploring / waiting / work), keyed on `branch` alone, appending one `released` audit event per cleared
> claim. `worktree prune` (keyed on live claims, ADR-0200 D6) and the 2 h stale-reclaim are the backstops
> if a clear is ever missed.

> **Proof status (honest) — `proposed`, operator-attested (glue, ADR-0070).** This capability is the
> **supplement glue** in the `orchestrate-route-supplement` sense: a `.github/workflows/ci.yml` edit has
> **no isolatable red→green test** the prove-it-gate could drive. The load-bearing logic
> (`releaseClaimsByBranch`) is proven in capability A against an isolated `storytree_test` DB; here we only
> WIRE the merge job to call it. The clear is **CI/operator-observed** — the merge job runs and the merged
> branch's claim-wisp disappears (witnessed by the appearance UAT, capability F). Built by the
> orchestrator's own subagent, not the red→green leaf.

## Guidance

This is glue, deliberately. Read the existing merge job in `.github/workflows/ci.yml` — the step that
*"sweeps possibly-dead presence rows"* on a merge. Extend it (or add an adjacent step) so that, on a
merged/closed PR, it also calls `releaseClaimsByBranch(<merged-branch>)` against the live store — releasing
**every** `events.node_claim` row for that branch and appending the `released` audit events (A1 does both
in one transaction). The branch name is available to the merge job; pass it through to the release call.

- **The function is A's, not yours.** Do NOT re-implement the bulk release here — call A1
  (`PgClaimStore.releaseClaimsByBranch`). If A1 is not yet on the branch, this capability is blocked on A
  (its `depends_on`); STOP and say so rather than inlining SQL into the workflow.
- **Idempotent + advisory.** Releasing a branch with no claims is a no-op (returns `0`); a release failure
  must not fail the merge (the merge already happened) — log it, like the presence sweep. The
  trace-driven staleness reclaim (A2) is the backstop if a clear is ever missed (ADR-0138 §4).
- **No new edit surface.** This touches `.github/workflows/ci.yml` only. The studio/desktop render reads
  the cleared state automatically once the rows are gone (capability B's fold emits nothing for an absent
  claim).

## How it is witnessed

The clear has no unit test (a workflow step is not a red→green leaf). It is witnessed two ways, both
operator/CI-observed:

1. **CI-observed —** the merge job runs the release step on a real merge; the released count + the
   `released` `claim_event` rows are the machine evidence the clear fired.
2. **Operator-attested (the visible leg) —** on the forest map, the merged branch's claim-wisp
   **disappears** after merge — leg 4 of the story UAT (capability [`appearance-uat`](appearance-uat.md)).
   A human witnesses no stale zombie wisp remains.
