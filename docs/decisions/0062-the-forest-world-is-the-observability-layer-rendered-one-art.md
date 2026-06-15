---
status: accepted
decided: 2026-06-15
---
# ADR-0062: The forest world is the observability layer rendered: one art element per signal

## Status

accepted (2026-06-15) — owner steer in a design conversation while reviewing the relaxed-substrate
spike (PR [#156](https://github.com/HuaMick/Storytree/pull/156)). This ADR names the *guiding
principle* the existing world-design ADRs already embody — it does not change their mechanics:
[ADR-0036](0036-story-world-studio-visualisation.md) (the Dorfromantik world + DAG layout),
[ADR-0038](0038-story-world-vocabulary-recalibration.md) (the growth/foliage ladder),
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) (hue carries proof) all
stand. It is the rendering-side counterpart to the `observability-first` principle
([ADR-0006](0006-event-store-observability-surface.md)): observability-first governs *what is
recorded* (every state change is a typed event); this ADR governs *how those signals are drawn*.

## Context

The `#/tree` forest map renders each story as an island in a Dorfromantik/Townscaper world. A spike to
replace the regular hex-tile interiors with an irregular relaxed grid (PR #156) made the islands read
as organic landmasses — and surfaced the deeper question the spike could not answer on its own: **what
should an island's appearance encode?**

Two framings were on the table, and the owner settled them:

- *"Make it a complex-looking landmass"* is a **loose signal** — prettiness is not meaning. The
  substrate (the ground) carries no fact; it is just the canvas the meaningful elements sit on.
- *"Drive the form from a single complexity score"* is the **wrong shape**. There is no one number to
  map to form. An island is complex because the story it represents genuinely *has more going on*, and
  each thing it has is drawn by its own distinct element.

Today the world already works this way in part — capabilities → island size, status → the central
tree's growth/foliage (ADR-0038), proof → hue (ADR-0040), presence/builds → wisps — but the principle
behind it was never written down, so each new element risked re-litigating "what does the look mean?"

## Decision

**The forest world IS the observability layer, rendered. Each observed signal maps to its own art
element; an island's complexity emerges from the stack.**

1. **One element per signal.** Every signal the system observes gets exactly one art element, and no
   element is overloaded with two facts. Current bindings: **capabilities → island size**, **tests →
   plants/flora**, **state → the central tree**, **proof verdict → hue** (ADR-0040), **presence/builds
   → wisps**. The set grows as the observability layer instruments more facts.

2. **Complexity is emergent, not scored.** There is no "complexity" metric driving the form. An island
   looks intricate because it carries more signals, each via its own element — and bigger nodes have
   more of everything. **Do not build a single complexity → form knob.**

3. **Location ⟂ form (orthogonal channels).** *Where* an island sits is the DAG's job — rank,
   dependencies, load-bearing centring (ADR-0036). *How* it looks is the stack of signal→element
   mappings. Keep the two disconnected so the eye can read both at once; an island's position must
   never leak into its appearance, nor vice-versa.

4. **The substrate is the canvas — deliberately signal-less.** The tile/ground substrate (regular
   hexes today; the relaxed grid prototyped in PR #156) carries no signal. Its only job is to host the
   meaningful elements gracefully at any size. Substrate work is therefore **canvas quality, not a
   complexity encoder**. (If we ever *do* want the substrate to carry a fact — terrain = proof mode,
   cell hue = health — that is just adding it to the signal→element list under rule 1, a mapping
   decision, not an engine change.)

5. **Keep models swappable, but defer the pluggable abstraction.** Each signal→element stays a
   cleanly-factored renderable (the substrate already sits behind a `?substrate=` seam). We do **not**
   build a general "alternative world-building models" plugin system now — the owner placed that in the
   very-far-future, only-if-this-takes-off bucket. Factor the seam out when **2–3 real models** exist,
   not in anticipation of them (premature-abstraction trap). One model plus a flag is the right amount
   of seam today.

## Consequences

- **A new observable fact ⇒ a new distinct element.** When the observability layer learns to record
  something new, render it as its own element; do not overload an existing one or invent a composite
  "complexity" reading.
- **The relaxed substrate (PR #156) is canvas work.** It lands as a behind-a-flag (`?substrate=`)
  canvas-quality option; the faithful "path B" mesh (triangulate → merge → subdivide → relax, with a
  re-derived coastline) is deferred future canvas work, sequenced *after* the river redesign
  (now landed, PR #157), because path B touches the same coastline/river-dock machinery.
- **No premature plugin layer.** The seam stays a simple mode flag until a second real world-model
  earns the abstraction.
- This is a design-philosophy record: it adds no runtime behaviour by itself — it sets the standard
  every future visualization unit is measured against.

## References

- [ADR-0006](0006-event-store-observability-surface.md) — event store / `observability-first` (the
  data side this ADR mirrors on the rendering side).
- [ADR-0036](0036-story-world-studio-visualisation.md) — the Dorfromantik world + DAG layout (location).
- [ADR-0038](0038-story-world-vocabulary-recalibration.md) — growth/foliage vocabulary (state → tree).
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — hue carries proof.
- PR [#156](https://github.com/HuaMick/Storytree/pull/156) — the relaxed-substrate spike that surfaced
  this; the substrate behind `?substrate=relaxed-quad|relaxed-hex`.
- Library principle `one-element-per-signal` — the pullable form of this decision, now live in the
  library store (`storytree library artifact one-element-per-signal`); the rendering-side counterpart
  to the `observability-first` principle.
