---
status: accepted
decided: 2026-08-12
supersedes: [338]
arc: arc-and-open-question-truth-maintenance-arc
---
# ADR-0358: Arc and open-question truth-maintenance: owner picks 1B + 2D + 2E + 2B, 7-day lease

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time
alignment IS the ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md));
no second end-of-flow ask. Supersedes [ADR-0338](0338-arc-and-open-question-truth-maintenance-reactive-trigger-ext.md),
which named this gap and laid out the option menu but explicitly decided nothing (it was filed
explore-only per owner direction). ADR-0338 stays on disk as the record of the full option space and
the evidence it is grounded on; this ADR is the pick.

## Context

[ADR-0338](0338-arc-and-open-question-truth-maintenance-reactive-trigger-ext.md) established: the
librarian pass's decision-log-curation half is trigger-gated
([ADR-0324](0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md) D2) on
`docs/decisions/**`, `stories/**`, guidance projections, or a live-store write to
`agent`/`principle`/`guardrail`/`pattern`/`process` — `arc` and `open-question` are on no trigger and
no sweep, and on 2026-08-09 a freshness audit found 2 of 4 live open-questions had already drifted,
one within 3 days, unnoticed. ADR-0338 laid out two independent axes (reactive-trigger extension /
mode 1, and no-landing drift / mode 2) with a costed menu on each and recommended a minimal floor of
1B + 2D + 2E, with 2B addable for fuller mode-2 closure. It left every pick to the owner.

The owner reviewed the walkthrough and picked directly in conversation with the session-orchestrator
on 2026-08-12: **Axis 1 → 1B** (open-question only, not arc), **Axis 2 → 2D + 2E + 2B** (the fuller
mode-2 closure, not the bare floor), and a **7-day lease** for 2B (the recommended value — closer to
the 3-day observed decay rate than agent-memory's 60-day default, per ADR-0338's own framing).

## Decision

Build exactly ADR-0338's Option 1B + 2D + 2E + 2B, scoped as follows:

**1B — reactive trigger, `open-question` only (not `arc`).** Widen
[ADR-0324](0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md) D2's live-store-write
trigger clause to include the `open-question` kind, and extend the `librarian-curator` agent's
workflow (step 5, decision-log truth-maintenance) with an open-question sweep using the SAME
correct-in-place / retire choice [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)
already governs for ADRs: a question whose premise a landing resolved is **retired**
(`library artifact retire --pg`); a question whose content a landing corrected without resolving it is
**corrected in place** (`library artifact edit --set --pg`). Same **sonnet** tier as the rest of the
pass (ADR-0324 D3). `arc` body staleness is an accepted residual per 1B's own scoping — arcs are
touched more often via increment writes and their prose is thinner.

**2D — on-read staleness surfacing.** `arc show`'s open-questions block renders each question's age
since its `verifiedAt` timestamp (`verified 11 days ago` / `UNVERIFIED` when the field is absent, e.g.
on every question authored before this ADR). Advisory only, zero recurring agent cost — a CLI render
change, not a new pass.

**2E — author-time measurement-method discipline.** A new `pattern` (or `guardrail`, per
`guidance-curator`'s judgment on the right kind) requiring `question new` and `arc new`/`arc edit`
authors to name HOW any live numeric or measured claim was derived (a query, a command, "self-measured,
n=1" vs. "counted via `storytree session-cost`, n=43"), not the bare number. Landed once as durable
guidance; no recurring cost. This resolves ADR-0338's own open item on 2B below: a question's
measurement-method annotation is what tells the re-verifier whether re-derivation needs a live re-query
or can stay a sonnet read of a cited source.

**2B — park-lease on `open-question`, adapted from
[ADR-0202](0202-parked-memory-leases-the-graduation-worklist-counts-only-new.md).** Two new optional
fields on `OpenQuestion` (no `CURRENT_SCHEMA_VERSION` bump — the same zero-migration shape
`OpenQuestion.arcRef` and `Agent.model` already use): `verifiedAt` (ISO timestamp) and `leaseDays`
(integer, **default 7**). `question new` stamps `verifiedAt` to the authoring timestamp (first
authoring counts as first verification) and accepts an optional `--lease-days` override; a
`question check <id> --pg` command (mirroring `increment check`'s shape) reports fresh vs. lease-expired
and days-since, for both direct session use and as the mechanical half of the librarian-curator's
bounded lease-expiry drain (K≈1–3 expired items per pass, per ADR-0338's own sizing — the whole tier is
tiny). On expiry: re-verify via the **sonnet** librarian-curator pass reading cited sources by default;
escalate to a fresh `corpus-investigator` spawn (also sonnet, per
[ADR-0182](0182-delegatable-library-agents-carry-a-model-tier.md)) only when the question's own 2E
measurement-method annotation says the claim needs a live re-query. Outcomes on expiry: re-lease
(re-verified unchanged), correct-in-place (drifted, fixed), or retire (moot/answered) — the same
inverted-question shape ADR-0202 uses for agent-memory.

**2C (scheduled sweep) and the wider 1A (arc included) are explicitly NOT taken.** 2C remains
disfavoured by this corpus's own precedent (ADR-0252 D4, ADR-0324 D4); the owner did not choose to
override that. 1A's extra arc-body coverage was judged not worth the cost the owner explicitly scoped
down from — arc staleness stays an accepted residual, revisitable if evidence of arc-body drift
accumulates the way open-question drift did.

## Consequences

**Good.** Closes the confirmed gap on the tier where it was actually measured (open-question), with the
fuller mode-2 mechanism (lease-driven re-verification) rather than the bare advisory floor, at bounded
marginal cost: the reactive half rides the existing triggered pass at zero extra trigger cost, and the
lease half is a cheap unconditional check (ADR-0338's own sizing: the tier holds single digits of
items) plus a small bounded drain only on actual expiry.

**Bad / accepted residual, same shape ADR-0324 itself accepts for the ADR case:**
- `arc` body drift is NOT caught by this ADR — an arc's `intent`/`endState` prose falsified by a
  landing with no open-question involved is left for the next session that happens to touch it, same as
  before. If arc-body drift is later measured at a comparable rate to the 2-of-4 open-question figure,
  that is grounds to revisit 1A, not evidence this ADR ignored.
  **(Revisited 2026-08-19, corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) —
  [ADR-0384](0384-the-increment-lifecycle-s-middle-states-get-a-write-path.md):** the predicted trigger
  fired — a parked proposal measured arc-body drift at 67%, clearing this bullet's own bar — and the
  owner considered it directly, after a blind-reader grounding experiment. The residual is now
  **answered, not merely revisited**: 1A stays declined a second time, and the remedy that landed
  instead — a mechanical write path for the increment lifecycle's middle states — is a different
  mechanism from anything Axis 1/Axis 2 named here, on the finding that the experiment's blind readers
  were not actually misled by the prose. This does not reopen 1A or change what this ADR decided; it
  closes the open loop the bullet above predicted.)
- Drift that happens and self-corrects within one 7-day lease window is invisible to 2B, same accepted
  residual ADR-0202 carries for agent-memory.
- 2D/2A-shaped gaps remain: a session that never runs `arc show` or ignores the age render sees nothing.
- Every open-question authored before this ADR lands with no `verifiedAt` — it renders `UNVERIFIED`
  under 2D until either re-authored or swept once by the librarian-curator pass; this is a one-time
  backfill gap, not a standing one.

**Neutral.** [ADR-0338](0338-arc-and-open-question-truth-maintenance-reactive-trigger-ext.md) stays on
disk, flipped to `superseded`, as the record of the full option space this pick was drawn from. The
owning arc (`arc-and-open-question-truth-maintenance-arc`) closes its parked proposal
(`awaiting-owner-pick-from-adr-0338`) against this ADR and records the implementing increment.

## References

- [ADR-0338](0338-arc-and-open-question-truth-maintenance-reactive-trigger-ext.md) — the fully-explored
  option menu this ADR picks from; superseded by this ADR.
- [ADR-0324](0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md) — the trigger clause
  1B widens; D3's sonnet-tier reasoning and D4's declined-batched-drain reasoning (why 2C stays
  unpicked).
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — the
  correct-in-place / retire-and-replace discipline 1B reuses for `open-question`.
- [ADR-0202](0202-parked-memory-leases-the-graduation-worklist-counts-only-new.md) — the park-lease /
  hash-invalidation / inverted-expiry-question mechanism 2B adapts, including the 7-day-vs-60-day
  lease-length reasoning.
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) — D4's rejection of
  an unwitnessed scheduled job, the second precedent 2C is weighed against.
- [ADR-0182](0182-delegatable-library-agents-carry-a-model-tier.md) — the sonnet/opus tier split applied
  to the reactive sweep, the lease-expiry drain, and the escalation-to-`corpus-investigator` case.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this ADR is born
  `accepted` directly (owner directed the pick in conversation).
- [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md) D5 — the
  escalation-authors-a-question discipline that populates the tier 1B/2B/2D/2E all touch.
- `arc:arc-and-open-question-truth-maintenance-arc` — the owning arc; this ADR's implementation closes
  its parked proposal `awaiting-owner-pick-from-adr-0338`.
