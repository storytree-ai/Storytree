---
status: accepted
decided: 2026-07-29
amends: [252]
arc: verification-integrity-arc
---
# ADR-0269: A drain ceiling rises only when the measured population enlarges, never to absorb growth

## Status

accepted (2026-07-29) — decided/directed by the owner in conversation on 2026-07-29. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

It settles a question a librarian correction explicitly refused to settle. ADR-0252's decision 3 says
flatly that a drain ceiling "can only ever be tightened"; on 2026-07-29 `mirror-pair-drift`'s ceiling
moved UPWARD, 10 → 11, and the correction recorded that as a *projection* of the same decision's
first-sweep rule while flagging that the population-enlargement rule lived only in
`process:verification-decay-detection` and in a code comment — and that under [ADR-0034](0034-process-artifacts-ways-of-working.md)
§2 a process artifact "is a view of decisions, never a place where new policy is made". So the rule
was either a reading of ADR-0252 or unrecorded policy, and a correction cannot decide which. The
owner's answer is that it gets its own ADR. This one **amends** ADR-0252 rather than superseding it
(ADR-0139: a partial redefinition is an `amends` edge): decision 3 stands in full for the case it was
written about, and gains a bounded, evidence-gated exception for the case it was not.

## Context

**What the tightening-only rule buys, and why it is load-bearing.** ADR-0252 decision 3 makes the
decay sweep advisory per finding but fail-closed on the COUNT: the gate reds when the backlog grows
past a fixed ceiling, tuned just above whatever the instrument's first real sweep actually found. The
tightening-only clause is the whole of its integrity. Without it, every red is dischargeable by
editing one number, the ceiling tracks the backlog upward forever, and the check degrades into exactly
the condition it was built to escape — a WARN no size ever fails. Nothing here weakens that.

**The case it was not written about.** A ceiling is not a bare number; it is a number *about a
population*. ADR-0252 already relies on this — its per-instrument split exists because "a number
baselined on one population cannot carry meaning for a different one", which is why one shared total
was rejected. Decision 3 was written assuming the population is whatever the instrument scans, and
that this is fixed. It is not always fixed, because an instrument's aperture is code.

On 2026-07-29, `mirror-pair-drift` was found measuring a smaller world than the one it guards.
`MIRROR_SURFACE` in `packages/cli/src/check-verification-decay.ts` walked only
`apps/desktop/src/backend` and never `apps/desktop/electron` — so `/api/attestations` and
`/api/uat/attest`, two routes the desktop genuinely serves and one of them self-documented in
`backend-entry.ts` as re-composing the studio payload with no studio import, had **never entered the
count at all**. The instrument sat at a ceiling of ten while its real population was eleven, and
reported a complete sweep on every day it did so.

**Under a flat tightening-only rule, correcting that is punished.** Widening the aperture reds the
gate on the landing that widens it, and the cheapest way back to green is to leave the aperture narrow
or revert the widening. That is not a new argument — it is ADR-0252's own argument, applied one level
down. Decision 3's per-instrument split was justified because under a single shared total "the
cheapest way to add one of decision 1's remaining chartered instruments is to weaken it until it finds
little — a mechanism that pays you to look less". An unqualified tightening-only rule pays you to look
*at less*, which is the same defect wearing different clothes: the instrument stays green by staying
blind, and the blindness is invisible because the count is the only thing anyone reads.

**But the exception is dangerous, and that is the real design problem.** "The population enlarged" is
cheap to assert and, unbounded, it is a general-purpose discharge for any red — the precise gaming
ADR-0252 exists to prevent. So the decision below is mostly an EVIDENCE BAR, not a permission.

## Decision

**1. A drain ceiling is tightening-only WITHIN A FIXED MEASUREMENT APERTURE.** ADR-0252 decision 3 is
unchanged for every case where the aperture is unchanged: a ceiling raised to absorb findings that
accumulated under an unchanged aperture is the gaming move, is forbidden, and stays forbidden. Repair
a signal, lower the number.

**2. When an instrument's aperture genuinely ENLARGES, it is re-baselined on the first real sweep of
the new population** — the same first-sweep rule ADR-0252 already applies to a new instrument, applied
to an instrument that has become able to see more. An aperture change is a change to what the
instrument SCANS: a directory added to its walk, a file pattern widened, a dispatch form it could not
previously parse. It is NOT a change to what counts as a finding, a threshold, a severity, or a
classification — those move the count without moving the world, and are governed by clause 1.

**3. The falsifiable tell: WHAT is counted changed, not merely HOW MANY.** If the landing cannot name
specific items the previous aperture was structurally incapable of seeing, it is not an enlargement,
and clause 1 governs. "The number went up and I believe the world is bigger" does not clear this bar.

**4. The evidence bar. All of it, or clause 1 governs:**

  a. **The aperture change is visible in the diff** as a change to what the instrument scans.

  b. **The enlargement is measured by differential control, not predicted** — run the sweep at the
     prior aperture and at the new one with nothing else varied, and take the difference. This is the
     same control ADR-0252's own re-baselines used (a real binary run with only its inputs varied).

  c. **Drains and discoveries are measured SEPARATELY and never netted.** A landing that both repairs
     signals and widens the aperture reports each effect as its own number. Netting them hides both:
     it lets a repair pay for headroom, and it conceals whether anything was actually fixed.

  d. **Each newly counted item is newly VISIBLE, not newly BROKEN.** An item the same diff introduced
     is growth under clause 1, however the aperture moved.

  e. **The ceiling rises by at most the measured enlargement.** No rounding up, no headroom, no
     "while we're here".

  f. **The decomposition is recorded AT the number** — in the ceiling's own comment, with the arithmetic
     and the named items — so the claim is auditable by the next reader without re-deriving it.

**5. Symmetric, so the exception cannot become a ratchet: an aperture that NARROWS must LOWER the
ceiling by the measured amount, in the same landing.** Without this, the rule is trivially defeated by
widening the aperture, re-baselining upward, then narrowing it again and keeping the headroom. A
narrowing that cannot be measured is not a narrowing that may keep its ceiling.

**6. No owner gate on the move itself.** A session may re-baseline under this ADR without an owner
decision, exactly as it may baseline a new instrument's first sweep. Requiring sign-off would restore
the very disincentive this ADR removes — it would make widening an aperture expensive, and the
cheapest path would again be to leave the guard blind. The record required by 4(f) is the audit
surface; the ceiling comment is where a later reader, or an adversarial pass, checks the claim.

**7. `process:verification-decay-detection` may now carry this rule as a view of THIS decision**,
which resolves the ADR-0034 §2 problem: the operational shape lives in the process, the policy lives
here, and on any disagreement this ADR wins.

## Consequences

**Good.**

- The perverse incentive is closed. Widening an instrument's aperture — the single most valuable thing
  anyone can do to a decay instrument, because it converts unknown unknowns into counted ones — no
  longer reds the gate as its reward.
- A guard measuring a smaller world than the one it guards is now a *repairable* condition rather than
  one nobody is paid to touch. `mirror-pair-drift` was in that state for its entire life before this.
- The audit surface is stronger than before, not weaker: clause 4(f) means every raised ceiling in the
  repo carries its own arithmetic and named items, which is more than the tightening-only regime ever
  required of a *lowered* one.
- Clause 4(c) makes the honest reading of a mixed landing mandatory. The 10 → 11 move that prompted
  this ADR decomposes as 10 baseline, −1 for `/api/activity` registered (a real repair, and that
  instrument's first recorded drain), +2 newly visible — three facts a netted "+1" would have erased.

**Bad, and accepted.**

- **This is a genuine loosening of a rule whose strength was its flatness.** "Never" needs no
  judgement; "never, unless the population enlarged, and here is the bar" does. The bar is deliberately
  procedural rather than a matter of taste, but it is still one more place a determined session could
  argue its way through. The mitigation is that 4(a)–(f) are all mechanically checkable by a reader,
  and 3 is falsifiable: name the items or the exception does not apply.
- **The evidence bar costs a real differential run** (4(b)) on every aperture change. That is a
  deliberate price: an unmeasured enlargement claim is exactly the kind of prose-that-reads-as-a-
  measurement this arc keeps finding.
- **Nothing here is enforced by code.** `check:verification-decay` cannot tell an aperture change from
  a classification change, so clauses 1–5 are honoured by the author and audited by the reader. A
  mechanical check would need the instrument to carry a declared population identity, which no
  instrument does today. That is a possible future increment, not a claim of current enforcement.
- The rule applies to every drain ceiling in the repo (`sync-drain`, `coverage-drain`,
  `corpus-content-drain`, `friction-drain`), not just the decay instruments, since the same argument
  holds wherever a ceiling counts a scanned population. Those ceilings sit at zero today and none has
  an aperture change in flight, so this changes nothing about them now.

## References

- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) — decision 3's drain
  ceiling, the first-sweep baseline, and the tightening-only clause this ADR amends and scopes. Its
  per-instrument split carries the population argument this ADR extends.
- [ADR-0251](0251-mirror-conformance-two-surfaces-required-to-agree-are-gated.md) — the `MIRRORS`
  registry whose second row supplied the −1 in the worked example.
- [ADR-0034](0034-process-artifacts-ways-of-working.md) §2 — a process artifact is a view of decisions,
  never where new policy is made; the constraint that made this ADR necessary rather than optional.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — correct-in-place,
  and `amends` as the edge for a partial redefinition.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment is
  ratification; no second end-of-flow ask.
- `packages/cli/src/check-verification-decay.ts` — `MIRROR_SURFACE` (the aperture), and the
  `MIRROR_PAIR_DRIFT` ceiling carrying the worked decomposition required by 4(f).
- `process:verification-decay-detection` — the operational shape, now a view of this decision.
- [PR #1022](https://github.com/storytree-ai/Storytree/pull/1022) — the landing that exercised the rule
  before it was written down, and the escalation that produced this ADR.
