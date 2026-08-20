---
status: accepted
decided: 2026-08-20
amends: [70]
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

**D3 — WHAT "FULL POTENTIAL ON AN ISLAND" MEANS, AS A WORKING DEFINITION.** The owner named the bar
without enumerating it, and agents cannot execute against an unstated one. This is the
session's READING of it, assembled from what he has actually said across the arc — *"we still dont
have flowers etc"* (2026-08-16), *"focus on getting a healthy island looking right"* (2026-08-16),
shadows as the stated payoff of going 3D (2026-08-16), and *"full potential"* (2026-08-20). It is
explicitly CORRECTABLE by him and is not a claim about what he meant:

A single healthy island, rendered live, is at the bar when it carries all of:

1. **Land with interior definition.** Today the bare island is a single flat green field with no
   seams, no variation and no texture — the composition of three separately-correct owner
   directives. Whatever supplies definition (ground relief, terracing, coast shell, shadow) it can
   no longer be nothing, because ALL the island's visual interest currently rests on vegetation.
2. **Shadow.** The stated reason author-time 3D was reopened, and still absent from every island.
3. **Vegetation** at a settled silhouette, massed as it actually places.
4. **Flowers** — the UAT criteria markers, named as missing since 2026-08-16 and still missing.
5. **The hero story tree standing on the land.** It exists, it is signed, and it has never been
   composited into a live island.
6. **The coast / shoreline**, so the island has an edge rather than ending.
7. All of it **at the size it is actually delivered**, on a REAL story's data, not a fixture.

**D4 — THE REMAINING INCREMENTS ARE SEQUENCED AGAINST THAT BAR, AND THE HYGIENE ONES ARE NOT
BLOCKERS.** Of the arc's ten open increments, four serve D3 directly (the island shell/coast, the
shadow ladder, the ground-displacement sweep, the camera value). Six are correctness or tooling
work — real, worth doing, and NOT on the path to the attestation. They do not gate it, and a session
should not treat draining them as progress toward the bar.

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

**A second risk.** D3 is one session's reading of an unenumerated phrase. If it is wrong, work gets
spent on the wrong seven things. It is written here explicitly as a working definition precisely so
that it can be read and corrected cheaply, rather than living implicitly in whatever the next
session assumes.

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
