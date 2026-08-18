---
status: accepted
decided: 2026-08-18
amends: [69, 219, 230, 280, 367]
arc: chapter2-code-generated-organic-art-arc
---
# ADR-0380: The runtime target is desktop-class hardware with a GPU, and the land may render live

## Status

accepted (2026-08-18) — decided/directed by the owner in conversation on 2026-08-18. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

**The art hit a wall that was never actually decided.** Chapter 2's land art has been through four
rejected vegetation attempts. The greenery survey (PR #1391) finally measured the cause, and it is
not technique: **one ground unit is one delivered pixel**, so Blender's default hair strand is
**1/150th of a delivered pixel** and renders to literally zero. Every grass tutorial in existence is
authored for a renderer whose pixels are two orders of magnitude smaller than ours. Hair has exactly
three regimes at our scale — invisible, a solid blob, or debris — and at matched footprint it *loses*
to a hand-modelled lobe.

**The scale, stated plainly.** Our entire real-corpus island — 11 capabilities, 162 mesh cells, the
hero tree and every plant — is **30,477 delivered pixels**. A shrub is **12 px in a 6×3 box**. The
owner's reference images, offered as "what might look nice", are ~1M pixels for a *fragment* of a
world: roughly **34× our whole island**, with a single bush carrying more pixels than 5% of
everything we draw.

**Where the pixel budget came from, which turns out to matter.** The map is **SVG** —
`SceneView.tsx` renders `ground` / `parcel` / `territory` / `tile` / `flora` / `tree` / `trail-*` /
`wisp` as vector, and is therefore resolution-independent. Raster enters only where a sprite sheet
*covers* a node's key and substitutes an `<image>`. So the pixel budget binds the organic art alone.
And it was never a performance decision: **no ADR in this log records a payload, bundle-size or
bandwidth constraint on art.** The budget is a locked-palette, pixel-art discipline (ADR-0214 §4 —
"a fixed kit of proven parts, a locked palette addressed by material name, one shared light vector")
plus a 1-ground-unit-to-1-delivered-pixel sprite convention that puts the sprite exactly on the
vector plate at default zoom. An identity choice, inherited as if it were a limit.

**What IS a real website constraint is the ceiling, not the floor.** Raster bytes scale with the
square of linear resolution. The engine's whole committed sprite payload is **805 KB** today;
roughly 3 MB at 2×, **13 MB at 4×**, 50 MB at 8×. The owner's reference images are *game* assets — a
game ships a binary and streams from disk, where 50 MB of textures is unremarkable. A website served
over the wire cannot. So density on the sprite path is affordable for about one more doubling and
not much beyond. Geometry and shaders, by contrast, are a few hundred KB **and do not scale with
resolution at all**.

**The reference machine, measured rather than assumed.** The owner supposed this box "doesn't have
the strongest GPU". It has no discrete GPU at all: a **Snapdragon X Elite X1E80100** with an
**integrated Adreno X1-85**, 31.6 GB RAM, driving **2880×1920**. Two consequences fall out
immediately. There is no CUDA, so Blender here is CPU Cycles **by necessity and not by taste** — a
fact the whole track has been living with without recording it. And at 2880×1920 our 1× sprites are
already upscaled roughly 2× before anyone sees them, which is part of why they read chunky.

**The audience.** Vibecoders and engineers. The owner's position: they all have modern hardware; the
product is not for a low-end phone or an old desktop; and this machine, while modest for graphics,
runs top-down RTS games well.

**WHY RUNTIME 3D WAS SHUT, READ PROPERLY — because the summary this track has been repeating is not
what the log says.** Three distinct reasons exist and they are not equally affected by this decision:

1. **ADR-0069's constraints, which are the substantive ones.** WebGL/shaders "introduce cross-GPU
   antialiasing variance" against a stated requirement that "the world must render identically every
   render"; **every canvas/WebGL forfeits DOM text, tooltips and screen-reader access**, called out
   as "load-bearing for a deployed members app"; and it assumed no-GPU rendering had to work.
   ADR-0214 restates these and adds a fourth: the look lives in **~5,900 lines of
   `apps/studio/src/index.css`**, not in the scene graph, so a substrate swap means reimplementing it.
2. **ADR-0145, the earlier 3D rejection** — cited by ADR-0280 as exactly that. ADR-0214 examined it
   and concluded the prior poor impression of 3D "is evidence of an art-direction gap, not of 3D
   being wrong", because `forest-world-r3f`'s own header reads *"spike scale, no art direction… each
   descriptor family gets a placeholder mesh"*. So the aesthetic objection was never to 3D; it was
   to an unstyled spike.
3. **Scope** — ADR-0280 D5 and ADR-0367 D3: "a gamified agent harness, not a game."

**And `forest-world-r3f` is a SPIKE, not a shipped renderer.** It maps descriptors to placeholder
meshes — instanced hex prisms, a cone-on-trunk story tree, ribbon-line trails, a rim disc for a cave,
an emissive ball for a wisp — behind a deliberate provability firewall (`world-to-3d.ts` stays
importable under bare `node:test`). It proves the mapping, not the art. Reopening is therefore
smaller than building from scratch and materially larger than "turn on what already runs".

## Decision

**D1 — THE RUNTIME TARGET IS DESKTOP-CLASS HARDWARE WITH A WORKING GPU.** Storytree is not designed
for low-end phones or old desktops. The audience is vibecoders and engineers, and we may assume a
modern machine with a GPU capable of real-time 2D and light 3D. Design decisions no longer have to
be justified against hardware we have decided not to serve. **This retires ADR-0069's no-GPU
rendering constraint outright.**

**D2 — THE REFERENCE MACHINE IS THE ACCEPTANCE FLOOR, AND IT IS NAMED.** "Works well" means works
well on a **Snapdragon X Elite X1E80100 / Adreno X1-85 integrated GPU at 2880×1920** — an ARM laptop
with no discrete graphics. Anything a desktop with a discrete card offers is **headroom, never a
requirement**.

The owner's reasoning, and it is the load-bearing half: this machine is **a genuine lower bound on
the user population**, not merely a convenient test target. A thin-and-light ARM laptop with an
integrated GPU is about as weak as a machine gets while still belonging to the audience in D1, so
users can be safely expected to be **on par with it or higher**. Building to this floor therefore
serves everyone, and a thing that runs well here needs no per-tier fallback to run well above.
That it is also the machine the owner judges on, and the only one anyone here can actually test
against, is a second reason rather than the reason — a floor set at hardware nobody in the room owns
would be a floor nobody could check.

**D3 — BELOW THE FLOOR WE REFUSE, CLEARLY, RATHER THAN DEGRADE SILENTLY.** Hardware that cannot meet
D2 — no WebGL2, an old phone — gets an explicit message stating the requirement. We do not ship a
quietly-worse experience and let the user conclude the product is bad. A refusal is one path to
maintain and to test; a silent fallback is two, and the second is the one nobody looks at.

**D4 — DELIVERY OVER THE WIRE IS A STANDING CONSTRAINT, AND IT BINDS RASTER SPECIFICALLY.** Storytree
is served as a website. Raster art costs bytes that scale with the square of resolution, so raising
sprite density is a real spend with a real ceiling (~13 MB at 4×). Geometry and shaders do not have
this property. This is now a recorded constraint rather than an unexamined instinct, and it is the
honest argument for D6 — not a preference for 3D.

**D5 — AUTHOR-TIME COMPUTE MAY EXCEED THE FLOOR, AND NEEDING IT IS AN OWNER CALL-OUT.** Building the
models is not the same activity as running the product. Author-time work may require hardware this
machine does not have — and it already does, since there is no CUDA here. A session that finds it
needs GPU compute to author an asset **raises it to the owner** so cloud GPU can be arranged; it does
not silently spend, and it does not silently accept a worse asset because the local box is slow. The
binding condition is unchanged: **whatever is built that way must still meet D2 on delivery.**
Author-time 3D stays author-time in the ADR-0280 D2a sense — the *tool* may live in the cloud; the
*output* is committed locally with provenance, and no vendor call, credential or generated clock
enters the runtime, build or deployed environment.

**D6 — RUNTIME 3D IS REOPENED FOR THE LAND. THIS AMENDS ADR-0367 D3 AND ADR-0280 D5.** A live
renderer is admitted for the land and its vegetation. Two of the three reasons it was shut no longer
hold: the **no-GPU** constraint is retired by D1, and the **aesthetic** objection was already
adjudicated by ADR-0214 as an art-direction gap in a placeholder spike rather than a fault of 3D.
The **scope** objection is knowingly set aside by the owner, on the grounds that the audience has
the hardware and that the sprite path's ceiling (D4) is now the thing actually capping the art.

**Curation note (2026-08-18) — this also narrows ADR-0219 D4 and ADR-0230's decision, found on a
librarian-curator pass over this branch and recorded here rather than left as a silent gap.**
ADR-0219 D4 — cited approvingly as recently as ADR-0230 (2026-07-22) — parked "the game is 2.5D
isometric and stays that way" and rejected "shipping real 3D / R3F as the map renderer" outright, for
the same shared land/map substrate this decision reopens. That framing was true when written; D6
supersedes it for the land and its vegetation specifically. Everything else those two ADRs decide —
the sprite-sheet render mode, author-time-only generation, baked-vector look — is unaffected. Both
carry their own inline corrections and are added to this ADR's `amends` set for edge honesty.

**WHAT D6 DOES NOT LICENSE. Two of ADR-0069's constraints SURVIVE and are now the binding ones:**

* **ACCESSIBILITY IS NOT TRADED AWAY.** ADR-0069 names DOM text, tooltips and screen-reader access as
  load-bearing for a deployed members app, and a canvas forfeits them. D6 does not license removing
  them. A live land must keep accessible text and hit targets — most plainly by leaving labels,
  nameplates and interactive targets in the DOM/SVG layer over the canvas. **If a live land cannot
  keep them, that is a finding to bring back to the owner, not a licence to drop them.**
* **DETERMINISM MOVES, IT DOES NOT DISAPPEAR.** ADR-0069 requires the world to render identically
  every render, and WebGL cannot promise that across GPUs. So the invariant is restated at the level
  that can hold it: **the app's deterministic scene GRAPH remains the source of truth and stays
  byte-reproducible** (`hash()` / `rand01`, no `Math.random`, no wall-clock), and proofs attach to the
  graph and to author-time renders. Byte-identity is NOT asserted on a live GPU raster, and any
  instrument that currently assumes it must be re-pointed at the graph rather than quietly weakened.
* **The app keeps owning the semantics** (ADR-0367 D3, verbatim): which cells are claimed and by
  which story, the coast derivation, per-cell capability identity AND status tint, the accretion
  reveal and its timing, hit targets, trail routing and docking, nameplate placement, scene bounds,
  reduced motion, replay and painter order. A renderer draws; it decides nothing about the work.
* **No asset-owned clock.** Animation stays app-driven. An asset that animates itself reintroduces
  exactly what ADR-0367 D3 forbade, whatever draws it.
* **The locked-palette identity is NOT relaxed.** A live render still has to look like our art —
  banded or toon-shaded to a locked palette in the shader, rather than shipped as a generic 3D
  render. ADR-0367 D4's rule survives the change of renderer, and it is no more forgivable for being
  live. ADR-0214's finding cuts both ways: an unstyled 3D substrate is exactly what was rejected
  before.
* **THE PROJECTION DOES NOT MOVE. THE GAME IS STILL 2.5D ISOMETRIC.** ADR-0219 D4's holding — *"the
  game is 2.5D ISOMETRIC and stays that way"* — is untouched, and only its *"never a shipped map
  renderer"* clause is narrowed. D6 changes **what draws the land, not the angle it is drawn at**: the
  declared camera of ADR-0367 stands, and a live renderer inherits it as a parameter exactly as the
  sprite pipeline does. A free camera, an orbit control or a perspective view is NOT licensed here.
  This is the fence that keeps the scope objection honest — "not a game" survives the change of
  renderer, because what made it not-a-game was never the pixel path.
* **Author-time Blender is not retired.** It remains the right tool wherever a sprite is the better
  answer — the hero tree's ceiling was signed on 2026-08-14 and is untouched by this.

**WHAT IS DELIBERATELY LEFT OPEN.** Whether the SVG map migrates onto the live path or the two
coexist; whether vegetation moves first or the whole land; how much of the ~5,900 lines of CSS look
has to be reimplemented in shaders; and what the live path costs on the D2 floor. Those are
engineering decisions to be taken on measurement. The scale ladder already recommended on this arc
keeps its value and changes its question: it no longer asks *whether* live rendering is permitted,
but *which elements actually need it* — if 2× sprites read well enough for an element, D4 says that
is the cheaper answer and D6 obliges no one to spend the GPU.

## Consequences

**The vegetation dead-end has an exit, and it is the first one that is not a technique.** Four
rejected attempts all reached for shading levers on a component too small to carry one. A live path
unties detail from a fixed pixel budget, which is the only lever measured to reach the problem.

**We have named a floor we can actually test against.** D2 is unusually concrete for an envelope
decision — a specific SoC and GPU at a specific resolution — and that is the point. "Modern
hardware" is untestable; "smooth on the Adreno X1-85 at 2880×1920" is a check somebody can run. The
cost is that the floor is genuinely tight: an integrated ARM GPU is a real constraint on a live
renderer, and D6 has to be built against it rather than against the discrete card most of the
audience will have. That is the intended trade — a lower bound is only useful if it actually binds,
and the payoff is that meeting it once removes the need for hardware tiers, quality settings or a
per-machine fallback path.

**D3 buys simplicity and spends reach.** One path, testable, honest. But a link opened on a phone now
shows a refusal, and that will be someone's first impression of Storytree.

**D5 admits a cost the owner approves rather than one a session incurs.** That asymmetry is
deliberate: cloud GPU spend is the owner's call, and the alternative — sessions quietly accepting
worse assets because the local box lacks CUDA — is what has been happening tacitly and is worse for
being invisible.

**THE TWO SURVIVING ADR-0069 CONSTRAINTS ARE THE REAL BILL, and they were nearly missed.** This ADR
was first drafted citing ADR-0145 for a palette rule it does not contain, and reopening runtime 3D
without addressing determinism or accessibility at all. Both were found only by reading the cited
ADRs rather than the summary of them that this track has been repeating. Accessibility in particular
is a commitment to real users of a deployed IAP members app, and it is the one place where "the
audience has good hardware" is no argument at all — a screen-reader user has whatever hardware they
have. Expect the accessible-layer-over-canvas requirement to be the hardest part of D6, and treat a
proposal to relax it as a signal to revisit this decision rather than to amend the fence.

**The largest remaining risk is scope creep, accepted knowingly.** "A gamified agent harness, not a
game" was the reasoning that kept runtime 3D shut, and reopening it invites that drift. The fences
above hold the line where it matters: the app owns the meaning, the renderer owns only the pixels.
If those fences start being argued with rather than honoured, the right response is to revisit this
decision, not to loosen them one at a time.

**A second render path is a real maintenance cost.** Until the open question above is settled, the
land can be drawn two ways, and two ways can disagree — this arc has already paid that bill with a
forked compositor that nothing detected until it had been copied three times.

## References

- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — the substantive
  constraints on WebGL. Its no-GPU clause is retired by D1; its determinism and DOM-text/screen-reader
  clauses SURVIVE and are restated as D6's binding fences.
- [ADR-0367](0367-chapter-2-s-land-is-rendered-in-blender-too-an-angled-citybu.md) — D3 amended here;
  D1/D2/D4/D5 stand, and D4's quantise rule and D5's status-tint primacy are restated above.
- [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) — D5's "runtime 3D
  stays closed" clause amended here; D2a's author-time posture stands and is extended by D5.
- [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — D4's "PARKED — do
  NOT reopen … never a shipped map renderer" narrowed here (curation pass, 2026-08-18) for the land
  and its vegetation specifically; every other holding of D4, and D1–D3, stand.
- [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md) — its "real 3D /
  R3F as the map renderer" rejection narrowed here (curation pass, 2026-08-18) on the same terms; the
  sprite-sheet render mode it decides is otherwise unaffected.
- [ADR-0214](0214-ground-ai-authored-art-in-a-physical-model-csg-over-svg-not.md) — §4's locked-palette
  discipline, and the finding that the prior poor impression of 3D was an art-direction gap in a
  placeholder spike rather than a fault of 3D.
- [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md) — the earlier 3D
  rejection (superseded by ADR-0213 for Act 2 authority; cited here only as the historical rejection
  ADR-0280 refers to).
- `packages/forest-world-r3f` — the placeholder-mesh spike behind the provability firewall.
- `packages/app-surface/src/SceneView.tsx` — the SVG scene renderer and its sprite substitution.
- `docs/research/chapter2-greenery-techniques-2026-08-17/` — the survey that measured the technique
  class out and produced the one-ground-unit-is-one-delivered-pixel finding.
- `chapter2-code-generated-organic-art-arc` — the arc this decision serves.
