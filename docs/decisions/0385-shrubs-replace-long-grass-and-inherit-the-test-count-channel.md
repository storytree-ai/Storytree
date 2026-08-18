---
status: accepted
decided: 2026-08-17
amends: [226]
arc: chapter2-code-generated-organic-art-arc
---
# ADR-0385: Shrubs replace long grass and inherit the test-count channel

## Status

accepted (2026-08-17) — directed by the owner in conversation on 2026-08-17. Design-time alignment IS
the ratification (ADR-0110); no second end-of-flow ask. **Recorded late, on 2026-08-19**, after a
librarian-curator pass found the arc's own prose asserting "an `amends` edge born accepted under
ADR-0110" for a decision that had never been written to the log. The decision itself is not new here;
only its record is. That gap is the first Consequence below.

## Context

**The owner's words, verbatim, 2026-08-17:** *"grass still looks ugly, i think we dont do grass for
test complexity, maybe we just stick to green land. I think Instead we do shubs and other small
plants instead. the pixelated triangles for the long grass looks rather ugly and cheap."* Clarified in
the same conversation when asked: **shrub COUNT inherits grass's test-count role.**

**This was the fourth rejection of the same component, not a first impression.** Long grass had already
been rejected on 2026-07-18 ("noisy/colliding"), 2026-07-20 ("messy and noisy rather than cosy"),
2026-07-23 ("way too big") and 2026-08-16 ("rather ugly"). ADR-0280 D4 makes an honest "not good
enough" an accepted outcome, so four rejections are a result rather than a failure to iterate.

**And the cause was measured, which is what makes this a species decision rather than a taste one.**
Three findings converge:

1. **One ground unit is one delivered pixel.** The greenery-technique survey (PR #1391) established
   that Blender's default hair strand is ~1/150th of a delivered pixel and renders to literally zero.
   Every grass technique in the tutorial ecosystem is authored for a renderer whose pixels are two
   orders of magnitude smaller than ours.
2. **The withdrawn blade is the ONE component that loses to the downsample.** Survival through the 3x3
   majority vote is 43-79% for the blade tuft against 94-116% for every other piece measured. The
   owner's four rejections therefore have a **pipeline cause, not an aesthetic one**: the blade is the
   single piece whose structure is finer than the vote that delivers it.
3. **Every shading lever this arc ever tried was applied to that one component.** The degenerate
   custom-normals sweep and the 46%-zero-delivery finding were both measuring the blade. At a median
   of 3 delivered pixels there was never room for any shading lever to act.

**The size ceiling belongs to grass, not to the medium.** The blade delivers 2 px in a 2x1 box; a
shrub in the same set delivers 11-12 px in a 6x3 box — 4x the area — and the four authored species
deliver 7-20 px (island average 11.71 against the blade set's 5.44). This was over-generalised on this
arc for weeks as "nothing has ever moved the size number", and PR #1389 corrected it: changing the
species moves it about 7x.

## Decision

**D1 — LONG GRASS IS WITHDRAWN.** The long-grass blade tuft is removed from the vegetation vocabulary.
No further render is spent improving it. Its measurements are kept as history; its geometry is not
mounted.

**D2 — SHRUBS AND OTHER SMALL PLANTS BECOME THE VEGETATION, AND SHRUB COUNT INHERITS THE TEST-COUNT
CHANNEL.** ADR-0226 D2's decision — *a capability's test count is read from its vegetation density* —
is **UNCHANGED**. Only the species moves. `grassCount = 2 + tests * 1.9` stands as written.

**D3 — THIS IS A RE-SKIN, CARRIED AS AN `amends` EDGE, NOT A SUPERSEDE.** ADR-0226 stays `accepted`
and stays current. Its vocabulary survives in full: vegetation health = proof state, flowers = UAT
criteria 1:1 read from FORM (bud / bloomed / wilted), the decorative wildflower stays retired so
"flower" means UAT only, and **the flower is never animated** — motion that changes silhouette would
blur the three verdict shapes (the ADR-0045 honesty wall). Grass remained safe to animate because it
signalled by density and colour rather than shape; **that property transfers to shrubs and is the
reason the channel survives the species change at all.**

**D4 — A SPECIES CARRIES NO MEANING.** ADR-0226 D2 gives the signal to COUNT. Making a species mean
something would invent a semantic channel under cover of an art change, so the species set is free to
vary for silhouette legibility and must not be read as state. This is a fence on the art, not a
limitation of it.

**D5 — THE GROUND STAYS FLAT GREEN.** Owner-directed the previous day (2026-08-16). `mottle` (26.5% of
pixels, claiming nothing) and the grass-as-ground-carpet reading were both declined, the carpet on a
number rather than a taste: it would have put 897 px of grass tracking no test count against 275 that
do, so roughly 3 in 4 grass pixels would have asserted tests that do not exist — art telling a lie,
the ADR-0367 D5 failure.

## Consequences

**A DECIDED DECISION WENT UNRECORDED FOR TWO DAYS, AND THE ARC PROSE PAPERED OVER IT.** The arc's
`intent` asserted this ADR's existence and its `amends` edge before either existed. Under ADR-0110
design-time alignment is ratification, which makes it easy to treat the conversation as sufficient and
never allocate the number — and the surface that should have caught it, the arc body, instead described
the missing record as if it were present. **The lesson is narrow and worth keeping: when prose names
the edge an ADR would carry, that is the moment to allocate it.**

**THE COUNT RULE'S KNOWN OVERLOAD IS INHERITED, DELIBERATELY.** `2 + tests * 1.9` has no area term, so
a small parcel receives a full-size budget: correlation of density against log owned-area is -0.93
across a 29.5x spread. Measured on the real-corpus island the overload is narrower than it sounds —
**exactly 1 of 11 capabilities** (18 plants on ground holding 14, a 1.262x overload), with every other
capability at or below 0.59x. An area-aware budget was rendered as a fork (PR #1389) and **introduces
four monotonicity breaks against the current rule's zero**, which is a direct cost to D2's readability:
a reader would read the test counts in the wrong order. That fork stays the owner's and is not decided
here.

**THE RE-SKIN RAISES VISIBILITY WITHOUT IMPROVING DISCRIMINATION, AND THAT IS STATED RATHER THAN
GLOSSED.** Measured on one unlit surface (PR #1409): median delivered pixels per surviving placement
3 -> 8, delivered vegetation 682 -> 1,446 px, placements delivering nothing 8.2% -> 2.3%, at an
identical 132-entry palette. But least- versus most-tested capability reads **2.48x -> 2.28x** per unit
area — the ratio is fractionally *worse*. Absolute visibility roughly triples; the channel's
discrimination does not improve. Anyone claiming this re-skin fixed readability is overclaiming.

**DELIVERED MONOTONICITY WAS ALREADY BROKEN BEFORE THIS DECISION AND IS NOT ITS DOING** — 10 inverted
ordered pairs of 11 capabilities on the blade, 9 after. The rule's *authored* counts are monotone with
zero breaks. The weakness is in delivery, and it belongs with the parked
`adr0226-vocabulary-re-examined-for-3d`, not with this re-skin.

**SILHOUETTE IS THE LEVER THAT REACHES THIS SCALE, AND IT IS NEARLY FREE.** Technique classes acting
*above* the quantisation threshold — normal mapping, normal transfer, world-space masking — are
discarded before delivery. Geometry and silhouette are what survive. Silhouette variety costs **zero
palette entries**; ground micro-relief costs **+619** to buy 3.5 luma points and zero additional
distinct levels. Four silhouette cues are now measured as surviving the majority vote: area, aspect,
**disconnection** (topological, so it survives any downsample that keeps the mark) and **concavity**
(PR #1409 — two pieces at the same 8x3 box and the same 2.67 aspect read as plainly different at fill
0.58 versus 0.83, which also falsifies an aspect-only instrument). Vertical separation does **not**
survive: a crown-on-a-stem delivers a mask pixel-identical to a ground mound.

**WHICH LEVER THE SHRUBS ACTUALLY GET IS STILL OPEN AND IS THE OWNER'S** — the live
`oq-which-high-frequency-lever-do-the-shrubs-get`. This ADR decides the SPECIES, not the lever, and a
candidate set implementing the silhouette option has been rendered (PR #1409) and **is not
owner-attested**.

**RUNTIME 3D REOPENING DOES NOT DISSOLVE THIS DECISION.** ADR-0380 D6 (2026-08-18) reopened runtime 3D
for the land and its vegetation, and the scale ladder that followed (PR #1413) found **no land element
needs the GPU, with the deciding rung at 2x**. So the pixel scale that made the blade fail is a real
property of the delivery path rather than an artefact of a budget nobody had decided, and the species
change stands on its own measurements either way.
