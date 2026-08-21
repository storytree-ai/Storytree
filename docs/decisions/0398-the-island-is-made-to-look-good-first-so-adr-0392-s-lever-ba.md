---
status: accepted
decided: 2026-08-21
amends: [392]
arc: chapter2-island-that-looks-good-first-arc
---
# ADR-0398: The island is made to look good first, so ADR-0392's lever bar governs finishing rather than direction

## Status

accepted (2026-08-21) — decided/directed by the owner in conversation on 2026-08-21. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

This AMENDS ADR-0392 and does not supersede it. ADR-0392 D1 and D2 stand exactly as written; D3's
bar is given the scope it actually governs, and D4's sequencing is spent. ADR-0392 stays accepted
and current, and is no longer wholly self-describing — which is the ADR-0139 shape for an amendment.

## Context

ADR-0392 answered a real and expensive failure: the arc kept asking the owner to judge appearance on
a fragment, at a maturity nobody believed was finished, and the loop converged on whatever was
easiest to photograph. Its answer was to move the owner's look to the END, once, on a whole island —
and to define when "the end" has arrived. That definition is D3.

**What D3 says TODAY, which is not what it said when it was first written.** D3 was corrected in
place on 2026-08-20 (commit `10c20e25`) the same day it landed, after the owner read it. The first
version was a CHECKLIST OF SEVEN COMPONENTS — land, shadow, vegetation, flowers, tree, coast, real
data — inferred from things he had said across the arc. He replaced it: the bar is *exhausting known
LEVERS*, not ticking off components. The live D3 therefore reads: the attestation may be called only
when *"why doesn't this look like the reference?"* cannot be answered with *"because we haven't
built X yet"*, and it obliges two artefacts — a named reference board, and a lever register in which
no entry reads NOT ATTEMPTED.

That correction is worth restating here because the checklist is still quoted inside D3 as the thing
it rejected, and a reader skimming for a list finds one. **There is no live seven-item bar. There
has not been one since 2026-08-20.** Anyone amending ADR-0392 on the strength of that list is
amending a paragraph that was already withdrawn by its own author, and this ADR very nearly was.

**What actually changed on 2026-08-21.** The owner redirected the work, verbatim:

> "I want to run another experiment and take a look at if we even need the hero tree in the center,
> maybe our starting point is have a session generate a nice looking island and take a top down
> approach rather then bottom up. Can we park this arc and setup a fresh one, this session can then
> have more freedom to experiment and show me whats possible. To be honest i think the tree is
> rather redundant because the land color is a bigger signal, making the tree really just an
> asthetic."

`chapter2-code-generated-organic-art-arc` is parked at 58 landed increments with eleven still open.
`chapter2-island-that-looks-good-first-arc` replaces it and inverts the order: make islands that
look good FIRST, then work backwards to what is actually needed to hold them up and what turns out
not to be needed at all.

**The collision this creates, stated precisely.** D3 is a GATE ON ASKING. It says the owner is not
asked until every known lever is BUILT or PRICED OUT. Read literally against the new arc it forbids
the very thing the owner has just asked for: the arc's whole purpose is to show him several
directions BEFORE the levers are discharged, because which levers are worth discharging is what the
look is supposed to decide. Twelve levers sit in the register, nine of them unattempted; under a
literal D3 the owner could not be shown anything until all nine were spent — on a direction chosen
by a session, for an island nobody has yet agreed is the right island.

**And a second collision, quieter but the more expensive one.** D3's obliged lever register was
assembled by deriving levers from a named gap to a reference board — which is a genuinely good
mechanism, and it is the artefact the predecessor arc most lacked. But it was assembled BEFORE
anyone had seen an island they liked, so its ordering ("which cluster is cheap, unblocked and
absent") is an ordering by cost, not by value to a decided look. That is precisely the dependency
the new arc inverts.

**The tension is not between D3 and the owner.** D3 and the redirect answer the same complaint —
*stop showing me half-cooked cakes* — and reach different answers because they are governing
different verdicts. D3 governs a verdict on whether the art is FINISHED. The new arc asks for a
verdict on which DIRECTION the art goes. Only the first can be gated on lever exhaustion; gating the
second on it is asking the owner to approve the finished form of a direction he has not chosen.

## Decision

**D1 — THE ORDER IS INVERTED: THE ISLAND IS MADE TO LOOK GOOD FIRST, AND WHAT IT NEEDS IS WORKED OUT
BACKWARDS.** A session on `chapter2-island-that-looks-good-first-arc` makes whole islands that are
built to LOOK good, in several genuinely different directions, and derives the worklist from the
direction the owner picks — rather than assembling separately-proven components toward a worklist
written before anyone knew what a good island looked like.

This is the owner's call and it is a change of METHOD, not a change of standard. Nothing here lowers
what the finished island must be; it changes the order in which we find out what that is.

**D2 — ADR-0392 D1 SURVIVES INTACT AND IS NOT WEAKENED.** The owner's look/feel verdict is still
taken ONCE, at the end, on a whole island at delivered size, on real data. Bringing him a fragment,
a contact sheet, a technique survey, or a ladder of one idea at four settings is still the error
rather than the diligence. *"Show me what's possible"* is a request for exactly one look at whole
islands, not a licence to resume the fragment loop under a new arc's name.

**D3 — ADR-0392 D2 SURVIVES AND IS STRENGTHENED.** Every intermediate appearance call remains the
driving session's to make, and every one must be RECORDED WITH ITS REASON on the increment that made
it. An unrecorded art call is a violation of that decision, not an exercise of it. This arc WIDENS
the authority — it asks for exploration in several directions, on freer terms than the predecessor
would have allowed — so the recording obligation binds harder, not more loosely. The record is what
keeps a terminal attestation grounded in an account of how the island got there.

**D4 — ADR-0392 D3'S LEVER BAR GOVERNS FINISHING, NOT DIRECTION. IT IS SCOPED, NOT WITHDRAWN.**

- The bar — *no known lever is merely UNATTEMPTED; each is BUILT or PRICED OUT with its reason* —
  remains the condition for calling the art FINISHED and for asking the owner to attest that it is.
  It is a good test and it is not retracted. So is its refusal to accept "it looks better" as a
  lever: a lever names a MECHANISM.
- It does NOT gate a DIRECTION look. Asking the owner which of several whole islands to pursue is
  not asking him to judge a half-cooked cake, because there is no cake yet to under-cook — there are
  candidate recipes, and choosing among them is his call to make, not a verdict he is being asked to
  spend prematurely.
- The dependency between the two artefacts INVERTS. The reference board
  (`docs/research/chapter2-reference-board-2026-08-20/`) stands as authored and remains the
  standard — the owner's *"we dont need to be this good, but i expect us to do a version of this
  that looks at least half as good"* is unchanged. The LEVER REGISTER is re-derived from the
  direction the owner picks, and is discharged after that choice rather than before it. Levers the
  chosen direction does not use are not NOT ATTEMPTED against it; they are out of scope for it, and
  saying so is a discharge.

**D5 — ADR-0392 D4'S SEQUENCING IS SPENT.** D4 ranked the predecessor arc's ten open increments
against the bar and put the reference board and lever register first. The reference board was built
and is inherited. The remaining worklist belongs to a parked arc, so there is nothing live for that
clause to sequence; it is history, not instruction. A session must not read it as a queue.

**D6 — WHAT IS NOT RETRACTED, AND THIS IS THE HALF THAT MATTERS MOST.** The predecessor arc's
measured results STAND, in full, and are inherited by the new arc rather than re-derived.
Fifty-eight increments of measurement are not undone by a change of order, and several cost multiple
passes each to establish:

- the sprite path's DELIVERY CEILING — detail finer than the downsample is spent, which is why four
  vegetation passes in a row failed to satisfy;
- the LAND CANNOT SHADOW ITSELF at any relief amplitude this project will accept (light 55.2°,
  steepest slope 24.4°), so ground shadow comes from what STANDS on the land;
- the four status colours are separated mainly by BRIGHTNESS and all six pairs overlap, with 24,780
  delivered pixels of `unknown` ground already reading as `healthy` — the open question now homed on
  the new arc, and directly load-bearing for it, because if the land's colour is the signal that
  matters then that is the signal currently misreporting;
- every PRICED OUT entry in the lever register, which is final. Do not re-run a priced-out lever.

What is set aside is exactly one premise: **that assembling separately-correct components produces a
good-looking island.** The components themselves were never refuted. Several of the old checklist's
items — vegetation at a settled silhouette, a coast, real data — may well come back as FINDINGS of
the new approach, arrived at because an island that looked good turned out to need them. That is the
difference between an order being replaced and a result being withdrawn.

**D7 — THE FOUR ADR-0380 D6 FENCES ARE UNCHANGED AND ARE NOT THIS ARC'S TO MOVE.** Accessibility
stays in the DOM/SVG layer over any canvas; determinism moves to the scene graph rather than
disappearing; the locked palette holds, so nothing ships as a generic 3D render; and the projection
does not move — 2.5D isometric with the declared camera inherited as a parameter. ADR-0392 D5 is
also untouched: the owner remains reachable for scope, semantics, spend and outward-facing actions,
and an art call may never decide a SEMANTIC question under cover of appearance (ADR-0367 D5). The
rule that ADOPTING the live-render experiment into the app is a separate event from RUNNING it
stands.

## Consequences

**The good.** A session reading ADR-0392 tomorrow can no longer take its bar as a live worklist and
build toward a definition of done nobody is asking for. The owner gets to choose a direction before
nine unattempted levers are spent on one nobody has agreed to, which is the cheapest possible moment
to make that choice. And the lever register stops being an ordering by cost and becomes an ordering
by value to a decided look — which is what the new arc's end state means by handing the next arc a
worklist derived from a decision rather than from a guess.

**The cost, stated plainly.** The owner is being asked to look at something LESS finished than D3
was written to guarantee, which is a partial re-opening of the exact complaint ADR-0392 exists to
answer. That is knowingly taken, and D2 above is the defence: the object he is shown is still a
WHOLE island at delivered size on real data, and there is still exactly one look. What has moved is
the maturity of the object, not its wholeness — and it moved because a direction verdict on a
whole-but-unfinished island is worth more than a finishing verdict on the wrong island.

**The risk that needs watching.** "Direction rather than finishing" is an easy phrase to hide a
fragment behind. A technique survey, a contact sheet, or four settings of one idea can all be
described as "showing directions", and the predecessor arc produced several of those and described
them that way at the time. The test is unchanged and mechanical: is each thing shown a WHOLE island,
at DELIVERED size, on REAL data? If not, D2 above is being broken whatever it is being called.

**A second risk, and it already materialised once in the authoring of this very ADR.** The increment
that commissioned this correction described D3 as a live seven-item checklist. It was not — that
version had been withdrawn in place the previous day by the ADR's own author, and the increment was
written against text that no longer existed. Had it been actioned as written, this ADR would have
"corrected" a paragraph that was already correct, and the genuine collision — a lever-exhaustion
gate against an exploratory look — would have gone unaddressed while reading as handled. **The
general lesson is the one ADR-0139 already implies: an ADR that quotes the thing it rejected can be
misread as still asserting it, and the cheap check is `git log` on the file before amending it.**

**What does NOT change.** The gate, the proof discipline, ADR-0367 D5, ADR-0226's vocabulary, the
four ADR-0380 D6 fences, ADR-0392 D1, D2 and D5, the committed research under
`docs/research/chapter2-*`, and the separation between running the live-render experiment and
adopting it.

## References

- ADR-0392 — amended here. D1 and D2 stand; D3 is scoped to finishing; D4's sequencing is spent.
- ADR-0110 — an owner-directed decision is born accepted; design-time alignment is ratification.
- ADR-0139 — an accepted ADR must be true IN FULL; an amendment is an `amends` edge, not a
  supersession, when the target stays current but is no longer wholly self-describing.
- ADR-0070 — the two-stage proof model; stage 2 keeps appearance behind an operator's eye, and
  ADR-0392 already amended it as to WHEN, not as to whose eye.
- ADR-0380 D6 — the four fences the live-render experiment runs inside.
- ADR-0367 D5 / ADR-0226 — the art never asserts a proof state the work does not hold.
- `chapter2-island-that-looks-good-first-arc` — the arc this governs.
- `chapter2-code-generated-organic-art-arc` — parked; its 58 landed increments' results are inherited.
- `docs/research/chapter2-reference-board-2026-08-20/` — the reference board and the lever register.
- `docs/research/chapter2-shadow-ladder-2026-08-20/` — the inherited shadow and confusability findings.
