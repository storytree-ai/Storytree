---
status: accepted
decided: 2026-08-20
amends: [70]
load_bearing: true
---
# ADR-0392: The owner attests once the island is whole; agents make the art calls until then

## Status

accepted (2026-08-20) — decided/directed by the owner in conversation on 2026-08-20. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The chapter 2 code-generated-art arc has been running a look-verdict loop: a pass renders
something, the owner looks, he reacts, the next pass responds to the reaction. Over August that
produced a long series of one-line rejections — *"grass looks rather ugly"*, *"ugly and cheap"*,
*"all these look the same"*, and most recently *"the live version just like circular swirls"*.

Every one of those verdicts was correct about what it saw. The problem is what it was shown. Each
was a verdict on a **fragment**: a contact sheet of grass tufts, a piece-only technique survey, a
1×/2×/4×/8× ladder of the same authored geometry, a row of five shrubs on a transparent panel. The
arc's own standing rule already says *judge on the ISLAND, never a contact sheet*, and the rule was
broken repeatedly — including by the pass immediately before this ADR.

On 2026-08-20 the owner named the cost directly:

> i cant make a call on this until we have it to its full potential and on an island, so have the
> remaining increments get us to that stage until then i guess we keep working and agents can make
> the calls until there is confidence that its hit the stage where i can actually do the attestion
> without judging a half cooked cake.

Two distinct things are being said, and only reading both gets the change right.

**First, a sequencing complaint.** An attestation on a fragment is not cheap-but-imperfect evidence;
it is evidence about the wrong object. A shrub judged alone tells you nothing about a shrub among
two hundred others on a green field, and the arc has now measured that directly: at delivered size
the live and sprite islands read almost identically, while the same two plants side by side at 20×
look nothing alike. Which one is "the art" depends entirely on what is in frame.

**Second, a cost complaint about the loop itself.** Each fragment-verdict costs an owner
interruption, and the reaction it produces is necessarily a reaction to the fragment — so the next
pass optimises the fragment. Four rejections of long grass were spent before a measurement showed
the blade tuft was the ONE piece whose structure was finer than the majority downsample; every
shading lever the arc ever tried had been applied to the one component that could not carry one.
The loop was not converging on the art. It was converging on whatever was easiest to photograph.

There is a real tension to name rather than paper over. **ADR-0070 stage 2 puts appearance behind an
operator's eye: the look is witnessed, never machine-judged.** That principle is not being abandoned
here, and this ADR would be wrong to abandon it — the previous session declined to ship a metric
tuned until it agreed with a preferred conclusion precisely because ADR-0070 says a number cannot
settle a look. What ADR-0070 does not settle is **WHEN** the witnessing happens, or who decides the
hundred intermediate questions on the way there. Left unstated, that defaulted to "at every fork",
which is what produced the fragment loop.

## Decision

**D1 — THE OWNER'S ATTESTATION MOVES TO THE END, AND THERE IS ONE OF IT.** The look/feel verdict on
chapter 2's organic art is taken ONCE, on a whole island at full potential, not per technique, per
fork, or per pass. Until that bar is met, a session does not ask the owner to judge appearance.

Bringing him a fragment for a verdict is now the error, not the diligence. This does not make the
owner unavailable — see D5 — it removes one specific move: *"here are two options, which do you
prefer"* asked about something that is not yet the thing.

**D2 — AGENTS MAKE THE INTERMEDIATE ART CALLS, AND MUST RECORD THEM.** Every appearance decision on
the way to the bar — silhouette style, plant proportion, ground treatment, shadow depth, colour
placement within the authored palette — is the driving session's to make. It picks, it proceeds.

This AMENDS ADR-0070 rather than superseding it: the terminal attestation is still the operator's
and still cannot be machine-derived. What changes is that the intermediate forks no longer queue for
a human, because a human judging them is judging a half-cooked cake.

The obligation that comes with the authority: **an agent art call is RECORDED, with its reason, on
the increment that made it.** The owner is not being asked to trust a black box — he is being asked
to review once, at the end, with the trail available. An unrecorded art call is a violation of this
decision, not an exercise of it.

**D3 — WHAT "FULL POTENTIAL" MEANS: NO KNOWN UNBUILT LEVER REMAINS.** Corrected in place on
2026-08-20 after the owner read the first version of this section and said what he actually meant:

> we have been through many iterations and each time I ask why we can't replicate some of the
> results we see online its because of something we havn't build or done, each time we make
> incremental improvements, so rather then me attest each time i think what i'm asking for is make
> sure what we have done is what we belive to be the fullest possible version of what we trying to
> achieve before i attest

The first version of D3 was a CHECKLIST OF COMPONENTS — land, shadow, vegetation, flowers, tree,
coast, real data — inferred from things he had said across the arc. That was the wrong shape, and it
is worth being precise about why, because the error is instructive: a checklist asks *is everything
PRESENT?*, and every one of the rejected passes could have answered yes to its own checklist. What
he is describing is a test on OUR OWN KNOWLEDGE, not on the artefact's inventory.

**THE BAR, STATED AS THE TEST HE ACTUALLY APPLIES.** The attestation may be called only when the
answer to *"why doesn't this look like &lt;reference&gt;?"* is **NOT** *"because we haven't built X
yet"*. Every lever the team knows about is either BUILT, or explicitly PRICED OUT and recorded with
the reason it is not worth its cost. A lever that is merely *unattempted* means the bar is not met,
and the owner is not asked.

The components in the old list are still needed — but as CONSEQUENCES of this test rather than as
the test. A missing flower fails the bar because "we haven't built the flowers" is exactly the
sentence that must not be available, not because a box is unticked.

**WHY THIS IS THE EXPENSIVE FAILURE AND NOT A PEDANTIC ONE.** The pattern the owner named is that
the agent ALREADY KNEW the work was incomplete at the moment it asked him to look. The verdict he
gives is therefore spent on a version nobody believed was finished — which makes his look
worthless as evidence AND wastes the one thing this arc most needs to conserve. The fragment problem
D1 fixes is about the wrong OBJECT; this is about the wrong MATURITY of the right object. Both
produce a verdict that cannot be acted on, by different routes.

**WHAT THIS OBLIGES, MECHANICALLY.** Two things, because a bar phrased as a belief is otherwise
unfalsifiable:

1. **A REFERENCE BOARD.** The arc has never named what it is trying to match. "Results we see
   online" has been an unstated standard the whole time, which is precisely why "known levers" has
   meant *whatever the last session happened to think of*. Name the references, and derive the
   levers from the gap between them and ours.
2. **A LEVER REGISTER, DISCHARGED BEFORE THE ATTESTATION IS CALLED.** Every known lever, its state —
   BUILT / PRICED OUT (with the reason) / NOT ATTEMPTED — maintained as the work proceeds. If any
   entry reads NOT ATTEMPTED, the bar is not met. This is the artefact that makes "the fullest
   version we believe possible" a claim someone can check rather than a feeling.

**WHAT IT DOES NOT MEAN.** It is not a demand for perfection or for parity with a AAA reference —
"priced out with the reason" is a first-class, honourable outcome, and the arc has already used it
correctly several times (hair techniques measured out on delivered pixels, the shadow ladder
measured inadmissible on a mixed island, grass-as-carpet refused on a number). A lever we have
LOOKED AT and rejected is DISCHARGED. What is forbidden is the unexamined one, still sitting there,
known about, while the owner is asked to judge.

**D4 — THE REMAINING INCREMENTS ARE SEQUENCED AGAINST THAT BAR, AND THE HYGIENE ONES ARE NOT
BLOCKERS.** Of the arc's ten pre-existing open increments, four serve the bar directly (the island
shell/coast, the shadow ladder, the ground-displacement sweep, the camera value). Six are
correctness or tooling work — real, worth doing, and NOT on the path to the attestation. They do not
gate it, and a session should not treat draining them as progress toward the bar.

The reference board and lever register D3 obliges come FIRST, not last: they are what turns "known
levers" from whatever a session happens to recall into a list anyone can audit, and every later
increment discharges entries from it.

**D5 — THE OWNER IS STILL REACHABLE, FOR EVERYTHING THAT IS NOT AN APPEARANCE VERDICT.** Scope
questions, semantic changes (anything touching what the art ASSERTS, ADR-0226 / ADR-0367 D5), spend,
outward-facing actions, and any genuine fork the corpus does not settle continue to escalate exactly
as before. D1 removes look-verdicts on fragments; it does not make the arc autonomous, and an agent
reading it as licence to decide a SEMANTIC question under cover of an art change has misread it —
that failure mode is already named in ADR-0367 D5 and is unaffected.

## Consequences

**The good.** The owner is interrupted once, on the real object, with the trail of what was decided
and why. Sessions stop optimising whatever is cheapest to photograph. The arc gets a definition of
done it has not had — every pass since 2026-08-14 has been able to say what it measured and none
could say what would finish the work.

**The cost, stated plainly.** Agents will make art calls the owner would not have made. Some of the
intermediate choices will be wrong, and they will compound, because later work builds on earlier
choices. The bar's whole value is that the wrongness is discovered ONCE, against the finished
object, instead of being corrected fragment by fragment against evidence that could not support the
correction anyway. That trade is the owner's, taken knowingly.

**The risk that needs watching.** "Agents make the calls" can decay into "agents make the calls and
nobody remembers why", which would leave the terminal attestation ungrounded — the owner looking at
a finished island with no account of how it got there. D2's recording obligation is the whole
defence, and it is discipline rather than a gate rung (ADR-0168 D1's finding that a compliance gate
prices a ceremony toward theater applies here as it does elsewhere). If art calls start landing
unrecorded, the remedy is to say so loudly, not to reinstate the fragment loop.

**A second risk, and it already materialised once — which is the argument for having written D3 down
at all.** The first version of D3 was a component checklist inferred from the owner's past remarks.
He read it and corrected it the same day: the bar is exhausting known LEVERS, not ticking off
COMPONENTS. Writing the inference down explicitly, labelled as an inference, is what made that
correction cost one conversation turn instead of an arc's worth of work aimed at the wrong target.
The residual risk is the same in kind — the lever register can be incomplete, and a lever nobody
thought of is invisible to a rule about levers we know about. The reference board is the defence:
deriving levers from a NAMED gap is harder to fool than deriving them from memory. It is not
airtight, and the honest statement of the bar is "the fullest version we BELIEVE possible", which is
what the owner asked for and no more.

**What does NOT change.** The gate, the proof discipline, ADR-0367 D5 (art never asserts a proof
state the work does not hold), ADR-0226's vocabulary, the four ADR-0380 D6 fences, and the rule that
adopting the live-render experiment into the app is a separate event from running it.

## References

- ADR-0070 — the two-stage proof model; stage 2 puts appearance behind an operator's eye. AMENDED
  here as to WHEN the attestation is taken, not as to whether it is a human's.
- ADR-0110 — an owner-directed decision is born accepted; design-time alignment is ratification.
- ADR-0380 D6 and its four fences — the live-render reopening this arc is executing against.
- ADR-0367 D5 — the art never outranks what the work actually holds.
- ADR-0226 — the living-surface vocabulary; a semantic change is not an art call.
- ADR-0168 D1 — a compliance gate prices a ceremony toward theater; D2's obligation is discipline.
- `chapter2-code-generated-organic-art-arc` — the arc this governs, and where D4's sequencing lives.
- `docs/research/chapter2-live-island-2026-08-19/` — the island render that prompted the directive.
