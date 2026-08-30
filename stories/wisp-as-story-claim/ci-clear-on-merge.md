---
id: "ci-clear-on-merge"
tier: capability
story: wisp-as-story-claim
title: "CI clears the claim on merge — the merge job releases the merged branch's node_claim rows"
outcome: "CI releases `events.node_claim` rows (every grade) for the merged branch, calling `releaseClaimsByBranch` (capability A1) — the guaranteed machine clear that fixes 'never cleared' (the presence sweep this rode alongside retired with the presence layer, ADR-0200). Two callers since ADR-0345 D4: the automerge job, and the standalone claim-release workflow keyed on the merge that landed, which covers hand merges the automerge job never sees (and would cover a merge queue, declined by ADR-0362 D1)."
status: proposed
proof_mode: operator-attested
depends_on: [claim-store-work-time]
decisions: [138, 33, 121, 466]
# ⚠ CORRECTED 2026-08-31 (`prove-unproven-capabilities-arc-inc-25`) — THE PROOF ROUTE IS SETTLED AND
# UNBUILT, AND THIS IS NOT A RETIREMENT. This capability was swept into ADR-0465 D1's second pile as
# "not capability-shaped". That classification is WRONG and the increment's own premise correction says
# so: it is capability-SHAPED with a SETTLED but UNBUILT proof route. What it claims — every
# `events.node_claim` row for a merged branch gone, one `released` audit row per cleared claim, the
# oldest live waiter promoted — is a fully MECHANICAL, byte-level checkable fact. The only reason the
# prove-it-gate cannot sign it is that the fact happens inside a GitHub Actions step our build cannot run
# and watch, which is a COST rather than a judgment gap
# (`human-witness-is-a-judgment-gap-not-cost`). ADR-0466 (accepted 2026-08-27, owner-answered *"just
# trust its result"*) settles exactly that boundary: an outside system publishes its own pass/fail where
# our build can read it, and a FRESH GREEN published result earns a signed verdict — D2 applying it to
# BOTH the cross-repo and the CI-workflow shape, D3 refusing to bring the world inside. Adjudicating this
# node as a retirement would DISCARD an answer the owner has already given.
# ⚠ NOTHING IMPLEMENTS ADR-0466 YET AND NO ARC OWNS IT (searched 2026-08-31). So the route exists as
# POLICY and not as a mechanism: there is no publishing format, no transport, no verdict provenance field
# and no revision-binding today (ADR-0466 D5 leaves all of that undecided). `proof_mode` therefore stays
# `operator-attested` — the honest reading of THIS repo TODAY — and this capability still carries NO
# `proof:` block and NO `real:` arm. Do not author one, do not name a command that only looks like it
# exercises the workflow, and do not record the route as available. The end-state recorded here is:
# capability-shaped · proof route SETTLED by ADR-0466 · UNBUILT · needs a chartered build lane that does
# not exist.
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

> **⚠ CORRECTION 2026-08-31 — THE PROOF ROUTE IS SETTLED BY ADR-0466 AND IS UNBUILT
> (`prove-unproven-capabilities-arc-inc-25`; noted in place per ADR-0139).** The paragraph above ends at
> "operator/CI-observed" because, when it was written, *how* a CI-observed effect could ever reach the
> proof spine was an open question. **It is no longer open.** ADR-0466 (accepted 2026-08-27) settles it:
> where a check's honest execution lives outside the prove-it-gate's reach, that system PUBLISHES a
> pass/fail our build can read, and a **fresh green published result earns a signed verdict** (D1). D2
> applies this to both shapes of boundary — a separate repository AND a CI workflow step — and names
> `ci-clear-on-merge` as one of the two things it discharges. D3 refuses the alternative of standing the
> live database up inside every build run. The owner's answer was verbatim *"just trust its result."*
>
> **Three consequences, stated so a later sweep cannot re-derive them wrongly:**
>
> 1. **THIS CAPABILITY IS NOT A RETIREMENT CANDIDATE, and the "not capability-shaped" filing it once
>    carried is withdrawn.** What it claims is mechanically true or false — a row disappears, an audit
>    entry appears, a waiter is promoted — and the gate's authority never rested on the observation being
>    OURS, only on it being real and fail-closed (ADR-0466's through-line with ADR-0465 D7). Retiring
>    this node would discard an answer the owner has already given.
> 2. **NOTHING IMPLEMENTS ADR-0466 AND NO ARC OWNS IT** (searched 2026-08-31; the nearest neighbours are
>    ADR-0440's read-nothing CI identity and the `website-release` process). The route is POLICY, not a
>    mechanism: the publishing format, the transport, and whether one mechanism serves both boundaries
>    are all explicitly undecided (D5). Chartering that build lane is somebody's work and it is not this
>    capability's, not this spec's, and not the adjudication pass that wrote this note.
> 3. **SO NOTHING HERE CHANGES TIER, STATUS OR MODE TODAY.** `proof_mode` stays `operator-attested`,
>    there is still NO `proof:` block and NO `real:` arm, and `status` stays `proposed`. Manufacturing a
>    red, or naming a command that only looks like it exercises the workflow, is the exact failure this
>    lane exists to avoid. **When the route IS built, D4's three fences are load-bearing and not
>    hygiene:** the published result must NAME THE COMMIT it observed (freshness is bound to a revision,
>    never a timestamp — a green that outlives the code it watched is how this option fails); ABSENCE
>    FAILS CLOSED (no result, an unreadable one, or one naming an unknown revision is never a pass); and
>    PROVENANCE RIDES THE VERDICT, so a reader can always see whose observation a green rests on
>    (ADR-0085's never-silently-equated property). Without all three this is strictly worse than the
>    honest "never verified by us" state it replaces, because it would look green.

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
- **No new edit surface.** This touches the CI workflows only. The studio/desktop render reads
  the cleared state automatically once the rows are gone (capability B's fold emits nothing for an absent
  claim).

> **TWO CALLERS SINCE ADR-0345 D4. The second one's live justification is the HAND-MERGE gap, not a
> merge queue — the queue is DECLINED (ADR-0362 D1, which withdraws ADR-0304 D3).** The wiring above
> — `ci.yml`'s `automerge` job — is `pull_request`-only AND gated on `steps.merge.outputs.merged ==
> 'true'`. It therefore misses any merge it did not itself perform. **A PR merged BY HAND in the
> GitHub UI runs no `automerge` job, so its claims were never released** — a live gap on today's
> landing path, and the reason the second caller is KEPT rather than removed with the queue
> (ADR-0362 D2a). So the writer has a second caller,
> [`.github/workflows/claim-release.yml`](../../.github/workflows/claim-release.yml), keyed on the
> merge that ACTUALLY landed on `main` (a `push` to main, plus the PR-side `pull_request: closed`
> view) via [`scripts/merged-head-refs.sh`](../../scripts/merged-head-refs.sh). It is also
> queue-reachable, which is why the queue could ever be reconsidered as a settings change
> (ADR-0362 D3): under a queue `gh pr merge` QUEUES rather than merges, that gate is false for every
> PR, and the queue's own later merge would otherwise run no job that releases claims — every merged
> branch keeping its claims forever, silently.
>
> **Both can fire for one merge, and that is safe:** `releaseClaimsByBranch` is idempotent, and the
> property is PROVEN rather than assumed — offline in `ingest-merge.test.ts`, and against a real
> Postgres store in `claim-store-release-by-branch.live.test.ts`, including the sharp case that a
> second release does not disturb the waiter the FIRST release promoted (that session holds the unit
> on its OWN branch). The two only ever overlap once the merge is performed by something other than
> ci.yml's own GITHUB_TOKEN — the queue, or a human — because GitHub anti-recursion suppresses both
> triggers for a GITHUB_TOKEN merge.
>
> **The standalone caller is deliberately LOUD** (`STORYTREE_CLAIM_RELEASE_STRICT=1`) where the
> automerge step is fail-soft: it gates no merge and no deploy, so a swallowed failure there would
> buy nothing and would rebuild the very failure class ADR-0345 D4 is fixing.

## How it is witnessed

The clear has no unit test (a workflow step is not a red→green leaf). It is witnessed two ways, both
operator/CI-observed:

1. **CI-observed —** the merge job runs the release step on a real merge; the released count + the
   `released` `claim_event` rows are the machine evidence the clear fired.
2. **Operator-attested (the visible leg) —** on the forest map, the merged branch's claim-wisp fades and
   goes after merge, and the fade reads as *just left* rather than as a lost claim.

> **Witness re-adjudication 2026-07-26 (ADR-0209 D8).** The old story leg 4 this capability pointed at was
> a single `human` leg fusing all of the above. It split three ways: the release EFFECT on the ledger
> (every grade cleared for the branch, one `released` audit row each, the oldest live waiter promoted) is
> now **story leg 9, `machine`** — witness (1) above, which this capability already called *"the machine
> evidence the clear fired"*; the departure WINDOW (a departing body inside `DEPARTURE_WINDOW_MS` fading
> by age, gone past it, no zombie) is **story leg 10, `machine`**; and only the READING — *just left*, not
> *lost* — stays **story leg 11, `human`**, witness (2) above. **This capability's `proof_mode` is
> deliberately UNCHANGED at `operator-attested`:** the witness kind states what kind of observer is right
> for the leg (released rows are byte-level observables, and an un-harnessed workflow is a cost, not a
> judgment gap), while the proof mode states how the prove-it-gate can reach this capability — and a
> `.github/workflows/ci.yml` edit still has no isolatable red→green. Detail contract for leg 9,
> including why re-running A's own live spec is a FALSE pass here: `wisp-as-story-claim#uat-9`.
> *(This read: "How a CI-observed effect reaches the parent proof spine is an open owner call on the
> story (`## Open modeling calls`, call 4)." **That call is CLOSED** — the owner answered it 2026-08-27
> and it is recorded as ADR-0466; the route is SETTLED and UNBUILT, see the correction block above.
> Corrected in place 2026-08-31 per ADR-0139. Nothing else in this paragraph moves: the witness kind is
> still `machine`, the proof mode is still `operator-attested`, and they answer two different
> questions.)*
