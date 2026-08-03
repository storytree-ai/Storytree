---
status: accepted
decided: 2026-08-03
amends: [282, 283]
arc: act2-tree-and-plant-growth-arc
---
# ADR-0292: Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle

## Status

accepted (2026-08-03) — decided/directed by the owner in conversation on 2026-08-03. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md)**
(D2's authored-track count and D8's no-hero-selection fence) **and
[ADR-0283](0283-act-2-growth-follows-the-edge-pathways-grow-from-settled-nod.md)** (D3's parked
hero-tree candidate). Neither is superseded. The Act 2 architecture, the edge-driven causal
schedule, the derived-from-the-real-graph order and the owner's attestations of increments 1–3 all
stand untouched.

## Context

The owner attested the Act 2 intro's third increment on 2026-08-03 — *"this looks great"* — and in
the same breath named what it still does not do: the islands grow, the pathways grow, but **the
trees and plants on an island simply appear with it**. This decision records the forks they directed
when we went looking for why.

**What actually happens today is not quite "appears".** Everything green on an island — the central
tree, the per-capability plants, the decorative conifers, the UAT flowers *and* the nameplate — lives
in one `hex-flora` group, and under the regrow that whole group gets exactly one CSS beat
(`index.css`, `.world-scene.act2-regrowing .hex-flora.arrive-island`): `arrive-pop`, opacity 0→1 and
scale 0.55→1, 0.42 s, delayed 0.32 s. So it is one rigid scale-up of the entire vegetation block,
from the group's centre, with tree and nameplate and every plant locked together.

**And that beat is on the wrong clock.** Its 0.42 s is wall-clock CSS; the ADR-0286 D3 speed dial
scales the app's cursor and never reaches the stylesheet. It was tuned to land inside the island's
`islandGrowthMs: 760` window, and at 1× it does. At the 0.25× the owner took the dial to on
2026-08-03 (ADR-0286 D4, amended that day) the island's own accretion window stretches to ~3.0 s
while the flora beat still finishes at 0.74 s: the vegetation reaches full size in the first quarter
of the island's formation and then stands there, fully grown, while the ground assembles under it.
Taking the pace to the floor made the divergence four times worse. This is a defect, not a fork, and
it is named here because D2 below dissolves it rather than patching it.

**The motion language already exists.** `packages/app-surface/src/semantic-growth.css` grows
`.story-tree` from `transform-origin: center bottom` — explicitly rooted at the ground, "never a
shared centered origin that would make a tree appear to grow from its own middle" — and sprouts
`.parcel-flora` with a deterministic per-item stagger. It is wired to the single-island semantic
player's frame, not to the regrow's cursor. What was missing was a driver, not a vocabulary.

**The frame-cost floor decides the shape more than anything else.** ADR-0272 established, and
ADR-0283 D3 re-confirmed for the regrow, that a forest-map frame's cost is rasterisation
proportional to nodes on screen: 16.7 ms early, **150–217 ms** once the full forest is up
(ADR-0286's table). Read carefully that is permission, not only a limit — during an island's
accretion window the map is *already* paying a full-map repaint per frame, so motion added inside
those windows is close to free. Motion that outlives them is not: anything still running on the
settled map converts a static forest into a permanent repaint at roughly 5 fps.

**The art question turned out to be already answered, twice, in the repo.** ADR-0282 D4 said the
intro needs no new artwork; the owner's answer here is stronger than that — the tree they want is
one they already chose. ADR-0280 names it in as many words: *"exp-16, the track the owner called his
favourite"*, and it has been the reference the code-generated art track is measured against ever
since (`exp-16 (the bar)`, `blender-hero-v1/README.md` §4). It sits committed at
`packages/app-surface/src/assets/exp-16/` — 19 frames, 128×128, with a registered ground anchor. The
small plants have the same provenance: ADR-0277 D2 retained the pose-to-pose plant track precisely
because the small plants *"repeatedly passed the owner's visual comparison"*, and it is committed at
`assets/chapter2-organic-pose-to-pose/plant/` — 5 frames.

**ADR-0282 D2's decode premise does not apply to this shape, and that is the finding that unlocks
the decision.** D2 caps authored raster frames at one focused tree because *"mounting the 23-frame
authored raster track on 45 territories is a decode and memory non-starter"*. That reasoning assumed
**45 different tracks**. One *shared* track is a different cost entirely: 19 images decoded once —
116 KB on disk, ~1.25 MB decoded — whether 5 islands reference it or 400, because every island
displays whichever of the same 19 frames its own cursor has reached. Tree and plants together are 24
decodes and ~150 KB. The premise was sound for the composition D2 was refusing; it was never
measured against this one.

## Decision

### D1 — Growth is per-object and staggered, inside the island's own window

Each tree, each per-capability plant, each conifer and each UAT flower grows on its **own** beat,
rooted at its own ground anchor, within the window its island is already accreting in. The single
rigid `hex-flora` pop is retired. The `semantic-growth.css` vocabulary — rooted origin, seeded
stagger — is the reference for how each object enters; this decision supplies the driver that binds
it to the regrow cursor rather than to the semantic player's frame.

The nameplate is not vegetation and does not join the stagger: it keeps its own `plate-settle`
(translate-only, no scale) behaviour.

### D2 — Every island's central tree is the owner's exp-16 track, from ONE shared track, driven by the island's own cursor

`exp-16` is selected as the tree for the Act 2 regrow, on every island. All islands reference the
same 19 committed frames; an island shows the frame its own local 0→1 accretion progress maps to, so
tree and ground finish together.

**This AMENDS ADR-0282 D2 and D8.** D2's count of "exactly one focused tree earns authored frames"
is replaced for this composition by **one shared track, referenced by every island**, on the measured
ground that the cost D2 was refusing was per-territory tracks and this is not one. D8's fence
("reading D2 as a hero-tree selection") is discharged by the owner making the selection directly, in
conversation, which is the only authority that fence was ever holding the question for. **What is
NOT amended** is D2's real subject — that art cost must not scale with story count. Under this
decision it still does not: adding the 41st island adds zero images.

**This also resolves [ADR-0283](0283-act-2-growth-follows-the-edge-pathways-grow-from-settled-nod.md)
D3's first parked item**, the hero-tree candidate, for the Act 2 regrow.

Binding the frame to the cursor dissolves the Context's clock defect as a side effect rather than by
a patch: a cursor-driven frame index tracks the speed dial by construction, because it is the same
number the rest of the regrow is built on.

### D3 — Code varies the shared track per island

A single track on 40 islands would spend information the procedural tree currently carries: crown
radius scales with capability count, `unhealthy` renders a withered skeleton, `proposed`-or-empty
renders a small young form, and the crown blobs are jittered per story id so no two match. The app
therefore varies the shared art per island — size from capability count, a status treatment, and a
seeded per-story jitter — following the ADR-0226 / ADR-0227 hero-spread pattern, where one authored
`autumn-tree` is baked per status with only its crown recoloured and `<use>`-referenced across the
map.

Exactly which channels carry which signal is an implementation and LOOK question for the increment,
not a decision here. The **requirement** is that capability count and status remain readable in the
tree after the swap.

### D4 — The plants are the retained pose-to-pose plant track — DORMANT: the shipped map has no plants

The small plants use the track ADR-0277 D2 retained, on the same shared-track basis as D2 above. Its
registered ground socket is what makes a per-object rooted sprout honest rather than a scale about a
centre.

**This decision reaches nothing on the shipped map, and the Context above predates the reason.**
ADR-0226's unified vocabulary retired the per-capability plant ring: a capability is now a PARCEL of
~52 small `parcel-flora` marks (2,083 across the 40-island corpus), and the surface emits no
`kind:'flora'` node at all. The plant-track code path is built and tested and applies to zero
objects. The GROWTH half of this decision — every small mark sprouting from its own measured ground
contact rather than the whole group popping — IS delivered, and it is what D1 and D4 were jointly
after; what is dormant is the plant TRACK specifically.

Closing that gap would mean giving each capability parcel its own plant sprite, which is a scene
change in `@storytree/forest-world` and therefore an ADR and story-author call rather than something
to invent inside an increment. At the ADR-0070 stage-2 LOOK on 2026-08-03 the owner attested the
increment and **deferred the track** — "skip the grass for now" — so the code path stays dormant
against a surface that has plants again. `act2-tree-and-plant-growth-arc` amended the corresponding
end-state bullet and closed on the same day; the arc's increment log carries the measured detail.

This is a correction in place, not a re-decision (ADR-0139): the decision about HOW a plant would
grow is unchanged and still correct — the world it addressed was removed underneath it.

### D5 — The stagger is decorative and deterministic; it claims nothing

Per-object entry order and delay are seeded from the story id — stable across runs, and identical for
the same graph, exactly as the regrow's schedule already is. The stagger deliberately does **not**
encode capability build order. Making the plants sprout in the order their capabilities were built
was considered and declined: it would be a genuine claim about the project, and the map payload does
not carry the ordering that would make it true. A decorative stagger cannot be wrong; a semantic one
that is not fed by real data would be.

### D6 — No motion survives the settle

Nothing animates on the settled map. Every beat this arc adds ends when its island lands, and the
whole composition is quiet once the regrow completes.

This is the frame-cost fence, and it is what keeps the arc affordable: motion inside an accretion
window rides frames that are already repainting the whole map, so it adds ~zero; motion that outlives
the run would repaint a 20,000-node map forever at 150–217 ms a frame.

Ambient life on the settled forest — idle sway, wind — is **not** rejected on taste and may be
wanted later. It is fenced behind the paint-isolation / LOD work ADR-0283 D3 and ADR-0272 left open,
and would be that work's consequence, not this arc's.

### D7 — The authored tracks already in the repo are grandfathered

`exp-16` and the retained plant track are accepted art. ADR-0280 D3 — which demotes model-supplied
"a whole frame, a growth track, a pose sequence or a silhouette" in favour of code-owned growth —
governs **new** art from here; it does not retroactively unaccept art that is generated, committed,
and owner-approved.

This settles a question the corpus explicitly parked for the owner and refused to let an agent
answer: ADR-0277's references section records that whether its D2 plant poses "are grandfathered as
accepted art or are themselves the pose sequences D3 demotes is not settled by either record. The
clarification is the owner's, not an agent's." It has now been given, in conversation, and it extends
to the tree track on the same reasoning.

No PixelLab generation is spent. The remaining pool is untouched.

### D8 — Explicitly rejected

- Motion of any kind on the settled map (D6), including a maturation tail that outlives its island.
- Per-territory authored tracks, or any art cost that scales with story count (ADR-0282 D2's real
  subject, upheld).
- A stagger that claims capability build order, or any other semantic the payload cannot feed (D5).
- Patching the CSS flora clock to track the speed dial as a fix in its own right — D2 removes the
  divergent clock rather than synchronising two.
- Reading this as approval to generate new PixelLab art, or as a reversal of ADR-0280 D3 for new art.
- Reading this as closure of `chapter2-pixellab-organic-growth-arc`. It answers that arc's hero-tree
  question for the Act 2 regrow; the whole-composition half of its end state is untouched and the arc
  stays active (ADR-0277 D6).
- Blocking this arc on the code-generated Blender tree reaching parity with exp-16.

## Consequences

**Good.**

- The forest finally grows the way it claims to: an island's ground, its roads and the things living
  on it all arrive on one clock, from one cursor.
- The owner's favourite tree reaches the product, on every island, for no new art and no vendor
  spend.
- The 0.25× clock defect is dissolved rather than patched, so there is one fewer clock in the system
  afterwards than before.
- Art cost stays flat in story count, which is what ADR-0282 D2 was protecting.
- Two questions the corpus had parked — the hero-tree candidate (ADR-0283 D3) and the authored-art
  grandfathering (ADR-0277's references) — are answered by the person who was always the only one who
  could answer them.

**Costs and risks.**

- **Forty islands wearing one tree may read as repetition**, and D3's variation channels may not be
  enough to break it. This is an owner LOOK call and it may come back; if it does, D3's channels are
  the first place to look and D2 is the second.
- **exp-16's track is not monotone in height.** ADR-0289 measured it sitting at 91–99% of mature
  height from frame 03 and *shrinking* between f03 and f12. On a 128 px hero that is character; at map
  render size across 40 simultaneous trees it may read as jitter. Unmeasured at this scale.
- **The procedural tree's information is spent unless D3 earns it back.** Capability count and status
  are visible in today's tree for free; after the swap they cost deliberate work.
- **A style seam is possible** between app-native SVG land, a raster tree and raster plants —
  ADR-0282 already flagged this risk for a single hero tree, and this decision multiplies its
  surface by 40.
- **D6 is a real narrowing.** A living, breathing forest is a reasonable thing to want and this
  decision says not yet, on cost grounds that a later paint-isolation increment could change.
- The frame-cost floor itself is still untouched (ADR-0283 D3). This decision is careful to fit
  underneath it, not to lift it.

## References

- [ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) — the Act 2 intro
  architecture; D2's track count and D8's no-selection fence are amended here, its no-art-cost-per-story
  subject upheld.
- [ADR-0283](0283-act-2-growth-follows-the-edge-pathways-grow-from-settled-nod.md) — edge-driven
  growth; D3's parked hero-tree candidate is resolved here, its frame-cost floor is not.
- [ADR-0285](0285-an-island-forms-the-moment-a-pathway-reaches-it-not-when-all.md) — the causal
  invariant; per-object growth rides the island window and must not disturb it.
- [ADR-0286](0286-the-forest-regrows-on-first-arrival-each-session-paced-by-a.md) — the speed dial
  whose 0.25× default exposed the fixed-clock defect, and the measured frame-cost table.
- [ADR-0272](0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md) — a forest-map
  frame is rasterisation; the basis for D6.
- [ADR-0277](0277-occlusion-registered-cutouts-are-plant-only.md) — the retained plant track (D2) and
  the grandfathering question its references section parked for the owner.
- [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) — code-generated
  organic art; names exp-16 as the owner's favourite, and its D3 is scoped by D7 here.
- [ADR-0289](0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md) — the code-art
  growth track that measures itself against exp-16; the source of the non-monotone-height risk above.
- [ADR-0226](0226-unified-world-art-vegetation-vocabulary-grass-proves-capabil.md) /
  [ADR-0227](0227-baked-hero-trees-carry-status-via-per-status-colourways-rest.md) — the
  define-once / reference-many hero-spread pattern D3 follows.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment is
  ratification.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the owner holds
  the LOOK verdict; nothing here is attested.
- `packages/app-surface/src/assets/exp-16/` — the selected tree track (19 frames, registered anchor).
- `packages/app-surface/src/assets/chapter2-organic-pose-to-pose/plant/` — the retained plant track.
- `packages/app-surface/src/semantic-growth.css` — the rooted per-object growth vocabulary D1 binds
  to the regrow cursor.
- `packages/app-surface/src/forest-regrow.ts` / `forest-regrow-render.ts` — the cursor and the render
  layer D2 drives the frame index from.
- Arc `act2-tree-and-plant-growth-arc` — this initiative.
