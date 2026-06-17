---
status: accepted
decided: 2026-06-17
amends: [36]
---
# ADR-0069: Parameterise the forest-world geometry as a procedural pipeline (stay on SVG)

## Status

accepted (2026-06-17) — owner steer following a render-substrate scoping memo. The owner asked
whether the `#/tree` forest world should be rebuilt/refactored in a browser game engine, "feels like
we're pushing the limits of SVG … I've seen devs one-shot way more complex stuff using AI yet we go
through multiple iterations just to get rivers right." The memo diagnosed that the river pain is
**not** an SVG/substrate limit, and the owner confirmed the direction this ADR records: focus the
forest-world's geometry on a **parameterised procedural pipeline** rather than hand-specified vector
paths. This **amends [ADR-0036](0036-story-world-studio-visualisation.md)** (the SVG-not-PixiJS world
decision stands; this adds the *authoring model* for the world's geometry and sharpens 0036 §2's
deferral triggers). It is the rendering-authoring counterpart to
[ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md)'s "complexity is
emergent, not scored": 0062 governs *what* each element means; this governs *how the geometry is
authored* so that complexity can emerge cheaply.

## Context

The river network on the forest map has been through ~6 iteration rounds (PRs #157, #186–#193: basin
MST → drainage width → meander → ponds → river→pond transition). Each round was expensive, and the
owner reasonably asked whether the substrate — all hand-rolled inline SVG in
[`TreeView.tsx`](../../apps/studio/src/components/TreeView.tsx) (~4,200 lines) with deterministic
geometry helpers in [`riverGeometry.ts`](../../apps/studio/src/lib/riverGeometry.ts) — is the
problem, and whether a game engine (PixiJS, Konva, Three.js, Phaser, a regl/shader pipeline) would
make the world more "one-shottable" by AI.

The scoping memo (this session) separated the candidate causes and found:

- **Substrate perf is NOT the bottleneck.** The map emits ~1,800–2,500 SVG nodes today (10 stories,
  ~72 capabilities), almost entirely **static** — only the SMIL build-wisp orbit animates. Static SVG
  is comfortable to ~1,000–3,000 nodes (pain ~3,000–5,000); the much lower ~100–500 ceiling applies
  only to per-frame-animated content, which we are not. We have ~3–5× node-count headroom.
- **The real cost is the authoring model.** We hand-write *deterministic vector math per feature* as
  TS → SVG path `d` strings. Every aesthetic change is a geometry edit with invariants to preserve
  (start on the dock, end on the mouth, no self-intersection, stay deterministic), not a parameter
  tweak. This is exactly Red Blob Games' "local minimum" trap: heavily hand-specified geometry is
  rigid and resists redesign ([*De-optimizing mapgen4*](https://www.redblobgames.com/blog/2025-04-22-de-optimizing-mapgen4/)).
  **This pain travels unchanged onto any render substrate** — Pixi/Konva would render the *same*
  computed geometry; they do not write the river math.
- **The "AI one-shots harder stuff" gap is mostly selection bias.** Those demos win by being
  greenfield, screenshot-judged, and engine-/noise-backed (the engine does the load-bearing work);
  ours is correctness-judged, deterministic, accessible, and integrated into a live IAP members app
  ([ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md)). What would actually make *our* world more
  one-shottable is shifting geometry from hand-specified paths toward a parameterised/procedural
  pipeline (the mapgen4 / Townscaper model: author a few rules + parameters, let the algorithm
  compose), plus a faster art-direction preview loop.

Two hard constraints shape the choice and rule out the GPU/shader direction the owner's aesthetic
north star (mapgen4) might suggest: **determinism** (the world must render identically every render —
`hash()`/`rand01`, no `Math.random`, no wall-clock; WebGL/shaders introduce cross-GPU antialiasing
variance, a regression) and **text + accessibility** (SVG gives free crisp DOM text, native `<title>`
tooltips, and screen-reader access — load-bearing for a deployed members app; every canvas/WebGL
option forfeits this and must rebuild a hidden-DOM overlay).

## Decision

**The forest world's geometry is authored as a parameterised procedural pipeline over a
render-agnostic world model, and the render substrate stays SVG.**

1. **Parameters and generators, not hand-placed coordinates.** The world's visual geometry — rivers,
   ponds, coastlines, and any future terrain — is produced by pure, deterministic *generators* driven
   by a small set of meaningful *parameters*, not by hand-specified per-feature path coordinates. An
   aesthetic change should be a parameter tweak or a generator adjustment, never a coordinate edit.
   `riverGeometry.ts` is the model to extend: MST → drainage → confluence → route-around → meander
   are already pure parameterised functions; the direction is to push *more* of the look behind such
   knobs (it already partly exists: `RiverTuning`, the `?rivers=`/`?water=` flags).

2. **The world-model → render seam is the load-bearing structure.** `buildWorld()` emits a
   render-agnostic **model of point arrays** (territories, edges, ponds, coast loops — geometry as
   `Vec2[]`, *not* SVG `d` strings); the SVG layer is a thin renderer that stringifies that model at
   the edge. This is mostly true today (`Territory.coastLoops`, `PondShape.loop` already retain
   points); the remaining `d`-string leakage (e.g. `WorldEdge` stores only `d`) is refactored toward
   point retention. This seam is what makes the generators unit-testable in isolation and keeps the
   renderer swappable later without rewriting the procedural logic.

3. **Stay on SVG; PixiJS/Konva stay named-deferred behind the seam (sharpening
   [ADR-0036](0036-story-world-studio-visualisation.md) §2).** A substrate swap is *not* warranted now
   — it does not make rivers easier and it costs DOM-text accessibility. If a swap is ever executed,
   it replaces only the renderer over the seam (Konva is the lowest-risk target: Canvas2D, SVG-like
   node API, free hit-testing, ~45 KB), never a game engine, Three.js, or a shader/regl pipeline.
   **Explicit triggers** that would justify executing the swap: (a) the world routinely *animates*
   > ~100–500 elements at once; (b) node count grows past ~3,000–5,000 (≈ 3–5× today) and static
   pan/zoom degrades on members' devices; (c) we genuinely need per-pixel terrain shading vector
   paths can't express cheaply.

4. **Determinism is preserved and constrains the substrate.** Generators stay a pure function of the
   data (`hash`/`rand01`, no `Math.random`, no wall-clock). This is *why* the layer stays on
   SVG/Canvas2D and WebGL/shaders are rejected for it — pixel-stable output is a requirement, not a
   nice-to-have.

5. **A faster art-direction preview loop.** Because the look is parameterised, taste calls become
   tune-a-knob-and-reload, not edit-rebuild-redeploy. Tunable parameters stay surfaced (the existing
   URL flags are the seed of this) so the owner can review aesthetic variants quickly on the hosted
   site without a code round-trip.

This is a **direction and an authoring discipline, not a big-bang refactor**: the seam largely exists,
and the move is incremental — re-express hand-tuned geometry as generators as each feature is next
touched, rather than rewriting the world at once.

## Consequences

- **Good:** river/aesthetic iteration shifts from geometry edits toward parameter tuning; pure
  generators are exactly the net-new TS the inner loop can prove red-green (like `riverGeometry.ts`
  already is); the renderer stays swappable behind the seam if a trigger fires; determinism and the
  free SVG text/a11y are kept; complexity emerges cheaply from parameters (the ADR-0062 north star),
  reducing the per-round cost the owner flagged.
- **Cost / bad:** parameterising is upfront work and **will not eliminate taste rounds — only shorten
  them** (visual "is this right?" has no compiler). A parameter explosion is a real risk — mitigate by
  keeping parameters few, meaningful, and named; resist a knob per pixel. Some existing hand-tuned
  geometry must be re-expressed as generators, which is effort with no visible output change.
- **Bootstrapping:** the pure generators are inner-loop-provable, but the seam refactor and the visual
  taste calls remain orchestrator/human outer-loop work for now.
- **No substrate change ships from this ADR.** It records the authoring direction and the deferral
  triggers; the renderer remains SVG until a trigger in decision 3 fires.

## References

- [ADR-0036](0036-story-world-studio-visualisation.md) — the SVG-not-PixiJS world and PixiJS
  named-deferral this amends (decision 2's triggers are sharpened here).
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one-element-per-
  signal / complexity is emergent (the *what*; this ADR is the *how-authored*).
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted IAP members app (why free SVG
  text + accessibility is load-bearing).
- [`apps/studio/src/lib/riverGeometry.ts`](../../apps/studio/src/lib/riverGeometry.ts) — the existing
  render-agnostic parameterised generators (the model to extend).
- [`apps/studio/src/components/TreeView.tsx`](../../apps/studio/src/components/TreeView.tsx) —
  `buildWorld()` (the world-model → render seam) and the SVG emission layer.
- Red Blob Games — [*De-optimizing mapgen4*](https://www.redblobgames.com/blog/2025-04-22-de-optimizing-mapgen4/)
  (the "local minimum" insight) and the [renderer rewrite](https://www.redblobgames.com/blog/2025-09-29-mapgen4-renderer/);
  [boristhebrave on Townscaper's procedural grid](https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html)
  — the "author a few rules + parameters, let the algorithm compose" pattern.
- The render-substrate scoping memo (this session, 2026-06-17) — the diagnosis and engine survey
  behind this decision.
