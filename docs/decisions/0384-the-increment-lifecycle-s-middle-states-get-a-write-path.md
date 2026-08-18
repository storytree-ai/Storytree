---
status: accepted
decided: 2026-08-19
amends: [305, 358]
arc: arc-and-open-question-truth-maintenance-arc
---
# ADR-0384: The increment lifecycle's middle states get a write path

## Status

accepted (2026-08-19) — decided/directed by the owner in conversation on 2026-08-19 ("go with E and
drive closed"), after a blind-reader experiment they commissioned to ground the choice. Design-time
alignment IS the ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md));
no second end-of-flow ask.

## Context

[ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) D2 collapsed the
increment lifecycle to **`proposal → ready → active → closed`**. Only the two ENDS ever had a writer:
`arc increment new` writes `proposal`, `arc increment add` and `arc increment close` write `closed`.
**Nothing anywhere wrote `ready` or `active`** — not a verb, not an agent, not a migration.

Measured 2026-08-19: **all 37 open increments across all 9 active arcs sat at `proposal`. Zero `ready`,
zero `active`.** A four-state lifecycle was a two-state lifecycle in practice, and every consumer of
the middle states was reading a constant:

- `arcShowNext` (`packages/arc/src/arc.ts`) offers the consumption-time freshness check on `ready`
  entries **only** — so it never offered one, on any arc, ever.
- `incrementCheck`'s execute-once write-lock ([ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md)
  D2, renamed by ADR-0305 D2) treats `active` as spent. The lock never engaged: a consumed increment
  stayed indefinitely re-consumable, and the *"is this already spent?"* branch was unreachable.
- Readiness, blocking and owner-waiting therefore lived in **prose** instead, because the schema gave
  them nowhere else to go.

**How this was found, and what it corrects.** The owning arc was carrying a parked proposal
(`arc-body-drift-meets-the-adr0358-reopening-bar`) asking the owner to revisit
[ADR-0358](0358-arc-and-open-question-truth-maintenance-owner-picks-1b-2d-2e.md)'s declined Option 1A,
on the evidence that 4 of 6 measurable active arcs (~67%) carry `intent`/`endState` prose falsified by
later landings — clearing the 50% bar ADR-0358 itself named. The owner directed a grounding experiment
before deciding. **Three blind agents onboarded on three arcs** (the 99.2 KB art arc, the arc whose end
state was met while its prose still read "pending their pick", and a control the proposal certified as
accurate). **None was misled.** All three produced accurate pictures at self-reported high confidence,
including exact parked counts and correct blockers.

What it cost them not to be misled was **93k, 97k and 117k tokens** and ~12 minutes each, reconstructing
from increment bodies, ADRs and git what the arc could have stated. And all three converged on the same
defect from different directions:

- On `traversal-panel-arc` the owner's own unblocking verdict for `wide-reflow` (2026-08-14) sits as
  prose in an increment body; the lifecycle never flipped, so the arc surface still renders it parked.
- On `chapter2-code-generated-organic-art-arc` an increment's prose says "READY" while its status is
  `proposal`.
- On `arc-and-open-question-truth-maintenance-arc` the derived open-questions block renders
  *"(none — this arc is not waiting on the owner)"* while the arc is, in fact, waiting on the owner.

So the 67% prose-drift figure is real but is a **symptom reading**. Prose drifts because prose is
carrying the entire state load. The charter fields of the art arc make this literal: they hold eight
dated status stamps (`DELIVERED STATE, corrected in place 2026-08-14`, `WHAT THE ARC IS WAITING ON:`,
`MET AND SIGNED 2026-08-14`, …). Authors had already invented a current-state field — unbounded,
refreshed from memory, inside the charter.

Two prose remedies were on the table and both are now second-best: extending the librarian sweep to arc
bodies (ADR-0338's Option 1A), and adding a bounded current-state field. Neither targets the mechanical
defect, and the experiment found no reader the prose actually misled.

## Decision

**Give the lifecycle's middle two states a write path.** Two verbs on the existing `arc increment`
surface, implemented as one function (`arcIncrementPromote`, `packages/arc/src/arc.ts`):

- **`storytree arc increment ready <id> --pg`** → `ready`. The entry is consumable; this is what carries
  the arc's freshness-check offer.
- **`storytree arc increment start <id> --pg`** → `active`. Execution has begun; this engages ADR-0183
  D2's execute-once write-lock. The verb is `start` rather than `active` because these are acts, not
  adjectives.

Four properties, each pinned by a named test:

1. **Forward-only**, on the same reasoning as `arc increment close`'s record-once closure: these states
   record what HAS happened. `proposal → ready → active` in any forward jump (skipping `ready` is legal);
   a demotion is **refused**, not silently applied, and a wrong status is corrected in place via
   `library artifact edit`. A `closed` increment is terminal (ADR-0305 D2/D3) and the refusal points at
   parking a fresh entry instead.
2. **Re-promotion to the state already held is refused**, like a second closure.
3. **Field-scoped** ([ADR-0352](0352-a-set-edit-writes-only-the-fields-it-names.md)):
   a promotion writes `status` and `updatedAt` and nothing else, so a sibling's in-place body correction
   is never carried back.
4. **The arc's own lifecycle is deliberately NOT recomputed.**
   [ADR-0335](0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md) keys that on the
   OPEN/closed partition, and `proposal`/`ready`/`active` are all open — a promotion cannot change it.

`ready` does **not** require an `anchor.sha`. The anchor is the planner's to write (ADR-0183), and a
hand-parked entry has none; promoting one is allowed and the response says plainly that
`increment check` will report VACUOUS rather than fresh. Refusing here would make the verb unusable for
exactly the 37 entries that motivated it, and an honest note beats a fence that taxes the honest case.

**What this does NOT decide.** ADR-0358's Option 1A stays declined and the bounded-state-field option
stays unbuilt. The 67% arc-body prose-drift measurement stands on the record with no demonstrated
victim, and is **re-measurable once state is structured** — if prose drift still hurts a reader after
this lands, that is the evidence to revisit it on. The parked proposal closes against this ADR as
answered-differently, not as adopted.

## Consequences

**Good.** The declared lifecycle becomes the real one. ADR-0183 D2's execute-once lock engages for the
first time. `arc show` can offer the freshness check, which it never could. An owner unblocking a parked
entry has a place to put that fact where the surface can see it, instead of a body a later reader pays
~100k tokens to find. The fix is mechanical rather than curated — the failure mode ADR-0239 and ADR-0335
both record for remembered state.

**Bad / accepted residual.**
- ~~**A verb is still a remembered call.**~~ **CLOSED by
  [ADR-0386](0386-the-increment-s-active-flip-rides-the-notice-board-claim.md) (2026-08-19).** This was
  named here as the natural next increment and deliberately not bundled — the verbs were its
  prerequisite either way, and the cross-package change (noticeboard → arc) had its own blast radius.
  `noticeboard declare` on an increment now flips it to `active`, composed at the CLI root so neither
  organism grew a dependency on the other. `ready` stays an explicit editorial act, decided on the
  re-measured population rather than on symmetry. What remains open is narrower: `noticeboard
  claim`/`upgrade` still produce no flip (ADR-0386 D4).
- **The 37 existing entries are not backfilled.** They stay `proposal` until someone promotes them; this
  is a one-time gap, not a standing one. (Re-measured 2026-08-19, the day after this landed: 33 open
  increments on 10 active arcs — 32 `proposal`, 1 `ready`, 0 `active`. The backlog drains as sessions
  declare, now that ADR-0386 makes the flip automatic.)
- **Arc-body prose drift is untouched**, exactly as ADR-0358 left it.

**Neutral.** `arc increment add` still writes `closed` directly — recording a landing that was never
parked skips the middle states legitimately, and that path is unchanged.

## References

- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) D2 — the four-state
  lifecycle this ADR amends by making its middle two states reachable; D3's durability and D5's
  closure-reason rule are untouched.
- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) D2 — the execute-once
  write-lock keyed on `active`, and the planner-written anchor `ready` interacts with.
- [ADR-0358](0358-arc-and-open-question-truth-maintenance-owner-picks-1b-2d-2e.md) — the arc-body-drift
  question this work was commissioned against; its Option 1A stays declined.
- [ADR-0335](0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md) — the mechanical-not-
  curated precedent, and the OPEN/closed partition this verb deliberately does not disturb.
- [ADR-0352](0352-a-set-edit-writes-only-the-fields-it-names.md) — the field-scoped
  write discipline the promotion follows.
- [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) — 9 of 15 arcs had met
  their end state unnoticed: the standing evidence that remembered state rots.
- `packages/arc/src/arc.ts` (`arcIncrementPromote`), `packages/arc/src/arc.test.ts` (nine pinning tests),
  `packages/cli/src/commands.ts` (dispatch).
