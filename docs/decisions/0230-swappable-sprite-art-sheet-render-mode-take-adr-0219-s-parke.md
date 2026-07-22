---
status: accepted
decided: 2026-07-22
amends: [219]
arc: sprite-art-sheets-arc
---
# ADR-0230: Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off

## Status

accepted (2026-07-22) — decided/directed by the owner in conversation on 2026-07-22, after a research
spike into generative isometric asset pipelines. Design-time alignment IS the ratification (ADR-0110);
no second end-of-flow ask. The LOOK verdict on any produced render remains separate and the owner's
(ADR-0070 stage 2), still outstanding.

## Context

The grounded-art arc built a machinery-heavy parametric factory ([ADR-0214](0214-ground-ai-authored-art-in-a-physical-model-csg-over-svg-not.md)
→ [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md)) to make
AI-authored art *physically correct* — because Opus emitting raw SVG coordinates reintroduced floating
roofs, off-wall doors, and depth-order inversions (the 19-house swarm). [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md)
then adopted nano-banana AUTHOR-TIME, bridged raster→checkable-vector, and its **D3 explicitly PARKED
the raster-sprite look layer** as "a bigger, later fork … if it is ever wanted it is its own ADR." This
is that ADR.

A research spike (four web sweeps, 2026-07-22) plus the owner's reframe moved the calculus:

1. **The pain was the authoring surface, not sprites.** Asking a text model for isometric *geometry*
   is the failure; nano-banana's raster *look* is good. Every reliable industry pipeline "hands the
   model the angle" (fixed iso/ortho reference) and treats the generator as a look source.
2. **The "last 10% human cleanup" blocker is a SHIPPING concern, and the owner waived it.** storytree
   is prototyping an agent harness — graphics need not be perfect. If the mechanism proves out, real
   art (purchased packs or a commissioned artist) drops into the same slot later. That removes the
   exact wall most generative-asset projects stall on.
3. **The feared blocker — "flat sprites merge / draw wrong" — is already solved here.** The scene
   already emits `{y, node}` drawables and depth-sorts by ground-anchor Y (`scene.ts:~2771`, painter's
   algorithm). Sprites reuse that sort; no new occlusion machinery. (The research rates flat-sprite iso
   placement a HIGH-confidence solved problem — pivot-Y sort.)
4. **Sprite sheets make multi-style toggling trivial** — swapping a whole coherent art style is a sheet
   swap, which the per-type parametric factory is structurally bad at.

## Decision

**Take ADR-0219 D3's parked raster-sprite fork for the STUDIO map, as a default-off "art style" world
setting that selects among nano-banana-generated 2.5D isometric sprite art-sheets. This is a
prototype-quality validation of a lighter, generated-asset alternative — it stands BESIDE the vector
factory, does not remove it.**

1. **Sprite render mode.** A *style sheet* maps object `kind` (optionally `kind:status`) → a sprite
   image + a 0..1 ground-contact anchor. `renderNode` swaps vector→sprite per node, with **graceful
   per-node fallback** (an uncovered kind stays vector), and **reuses the existing ground-anchor depth
   sort** — no new occlusion pass. The sprite replaces the whole object group (no child recursion).
2. **Default-off world-settings toggle.** An `artStyle` SELECT control (`vector | <sheet>`), copying
   the `substrate` precedent; at its `vector` default it writes no URL param, so **off is byte-identical
   to today**. Studio `WorldSettingsPanel` renders it with no UI work.
3. **Generation is AUTHOR-TIME ONLY** (upholds ADR-0219 D1): nano-banana (`gemini-3-pro-image`,
   `@google/genai`) in `packages/art-authoring`, key read from GCP Secret Manager via ambient ADC into
   `process.env`, fail-closed, validated by one free `models.list` probe before any paid burst. The
   committed PNG sheet is the source of truth (non-deterministic model → the asset, never the call, is
   canonical). "Hand the model the angle": a fixed iso/ortho reference + the locked `style-bible.md`
   (ADR-0219 D2); the reference is never parsed into our code, never fetched per-instance or at runtime.
   **The API key is owner-provided; Claude never enters credentials.**
4. **Scope and invariants that STAND.** Studio map only — `packages/forest-world-r3f` and the public
   website are untouched (the ADR-0217 `factoryart` precedent). Stays **2.5D isometric** (ADR-0219 D4).
   The **look verdict stays owner-attested** (ADR-0070 stage 2 / ADR-0159); sheets land default-off
   until the owner signs. The vector factory (ADR-0214/0217) remains the default render and is NOT
   deleted — the two coexist behind the toggle.

Rejected: replacing or deleting the parametric factory; per-instance or runtime generative calls;
auto-tracing raster into the scene-graph as geometry; shipping this to the public website now; any
machine-signed look verdict; real 3D / R3F as the map renderer (ADR-0219 D4 stands).

## Consequences

- **Good — the prototype is unblocked without the factory's per-type machinery.** Multi-style toggling
  is a sheet swap; occlusion is free (existing sort); per-object DOM cost drops from a baked building's
  ~1,400 nodes to one `<image>`.
- **Good — zero risk to the current map.** Default-off + graceful fallback means the vector render is
  byte-identical when the toggle is off, and partially-covered sheets still render (sprited where
  available, vector otherwise — the `evening` sheet exercises exactly this).
- **Cost — raster forfeits what the vector factory gave for free:** text-diffable art, parametric
  per-status recolour precision (handled here by per-status sprite variants), and machine-checkable
  geometric correctness. A raster sprite *cannot* have a floating roof, so the checker's job is moot for
  it — but "reads as a cottage" was never machine-checkable anyway and stays the owner's look verdict.
- **Cost — a real bill and a real dependency:** `@google/genai`, an owner-provided key, a few dollars
  per authoring burst (the first two sheets cost ~$3–5). Non-determinism is handled structurally
  (committed asset is canonical). Nano-banana emits opaque JPEG, so a background-cutout step is needed.
- **Cost — cross-asset consistency is the known risk** (the research wall: angle/light/scale/style drift
  across a generated set). Mitigated by hand-the-angle + the locked style bible; residual drift is
  exactly what the owner's look verdict judges.
- **Honest — the central bet is unproven until attested.** Whether generated sheets clear the prototype
  look bar is the owner's call (ADR-0070 stage 2); this ADR authorizes the experiment, not its success.

## References

- [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — **amends this
  ADR's parent**: takes its D3 parked raster-sprite fork (for the studio, prototype-scoped). Its D1
  (author-time only), D2 (hand-the-angle / never inline raw), and D4 (2.5D isometric) all STAND.
- [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) /
  [ADR-0214](0214-ground-ai-authored-art-in-a-physical-model-csg-over-svg-not.md) — the parametric
  factory this offers a prototype-scoped alternative to; NOT removed, remains the default render.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) /
  [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md) — the look is
  operator-attested, stage 2; sheets land default-off until the owner signs.
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — colour-is-class;
  the sprite sheet is a studio-scoped render exception, like ADR-0218's baked-art and ADR-0217's
  `factoryart` chrome.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) /
  [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — the world is a
  live function of data; sprites are still composed live per render (the sheet is the only static input).
- `docs/research/grounded-art-concept/style-bible.md` — the locked style the generation honors.
- `sprite-art-sheets-arc` — the owning arc (increment log is the durable residue).
