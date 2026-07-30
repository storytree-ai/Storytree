---
status: accepted
decided: 2026-07-30
supersedes: [264]
amends: [219, 230, 237]
arc: chapter2-pixellab-island-growth-arc
---
# ADR-0273: PixelLab island growth is a selective standard shared-app sprite track

## Status

accepted (2026-07-30) — decided/directed by the owner in conversation on 2026-07-30. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Supersedes [ADR-0264](0264-chapter-2-tree-growth-uses-one-deterministic-topology-rig-wi.md).**
That decision correctly protected root stability, deterministic replay and app-owned semantics, but
it made a procedural topology rig the first implementation and excluded generated frame sequences.
The later PixelLab spike changed the visual evidence: a coherent generated growth sequence was the
strongest direction the owner had seen, and the owner has now funded a bounded full-island trial.
This decision keeps ADR-0264's behavioural protections while replacing its required rendering
substrate.

**Amends [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md),
[ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md), and
[ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md).**
Generation remains author-time only; the shared app remains the product surface and semantic owner.
The narrow addition is that a generated multi-frame sheet may be a selectively used render asset
inside a standard app-owned animation track. It is not a runtime model, asset-owned timeline or
alternate surface.

## Context

Chapter 2 needs the island and its story tree to emerge as one convincing, persistent scene. Earlier
snapshot swaps and simple scale/fade treatments failed the owner's LOOK verdict. ADR-0264 responded
by requiring one deterministic topology rig and reserving generated art for texture and finish.
That was the honest decision under the evidence then available, but it left the most important
question unanswered: can the app attain the organic, authored growth quality the owner wants?

A fresh PixelLab spike produced a coherent nine-frame tree-growth sequence with a stable visual
identity and markedly stronger art direction than the previous candidates. Its measurable root
drift can be normalized at author time. A parallel Nano Banana sprite-sheet experiment supplied
useful staging but weaker art and substantially more vertical drift. PixelLab therefore merits a
larger test, but a tree on transparency is not enough evidence for adoption. Composition,
coastline, ground detail, painter order, stable anchoring, replay and performance can all fail when
the same approach is extended to a complete island.

The owner has subscribed to PixelLab and directs a full-island experiment. The direction is
deliberately selective: PixelLab does not need to make every pixel, and capability-count canopy
mapping remains desirable rather than a blocker for this visual spike. One boundary is absolute:
the Chapter 2 introduction is still an in-app animation. A GIF, video, website-only demo, Studio
fixture or vendor-hosted playback would answer a different question.

## Decision

### D1 — Run one bounded, full-island PixelLab art experiment

The successor arc `chapter2-pixellab-island-growth-arc` will prove one complete island growth
sequence in the real shared app. PixelLab may generate the hard organic material: island formation,
the hero tree, foliage, flowers and other authored growth beats. The builder may use one composite
sheet or several registered layer sheets when that produces better control and painter ordering.

PixelLab is a selective art supplier, not the renderer or the whole art system. Existing app-owned
SVG, CSS, procedural geometry and reusable Storybook assets remain appropriate for water, shadows,
interaction affordances, effects, labels and any element they express more cleanly. No production
commitment follows merely from consuming the subscription or completing the spike.

All accepted outputs are versioned local assets with their prompt/model/generation metadata and an
explicit licence/provenance note. The app makes no runtime PixelLab call and does not require a
PixelLab credential in any browser, build artifact or deployed environment.

### D2 — The generated sheet is appearance; the shared app owns animation

PixelLab frames may depict visual interpolation, but they do not become Chapter 2's semantic state
model. The existing shared app surface owns:

- the semantic growth cues and their ordering;
- the normalized animation progress and deterministic frame selection;
- the clock, easing, holds and transition policy;
- Next, Back, Replay and any scrub/debug control;
- reduced-motion settlement; and
- the final retained island state used by the rest of the app.

Back and Replay select the same frame for the same semantic progress. Remount keys, per-play
regeneration and asset-local timers are forbidden. Reduced motion removes interpolation and delay
and reveals the same settled state for each cue. The clean route and any query-gated witness use the
same product component and state mapper.

A generated animated WebP, GIF or video may be exported for inspection only. It cannot be the app
implementation or the acceptance witness. Runtime playback uses ordinary local image assets through
the app's standard animation/rendering path.

### D3 — One planted coordinate system survives every frame

Every accepted sheet or layer track declares a fixed canvas, transparent/registered background,
frame dimensions, frame count, playback order, ground/island anchor and depth slot. Import-time
normalization removes crop and root drift; runtime compensation must not chase a moving asset.

The island remains registered to one world parcel throughout the sequence. The coastline, tree root,
ground sockets and mature footprint cannot translate between frames. If multiple tracks are used,
they share the same coordinate model and painter order. Land cannot grow through the tree, foliage
cannot precede its support, and decorative detail cannot conceal a discontinuous scene swap.

The settled final frame is a normal retained scene state, not a temporary overlay hiding the real
island. It must compose with the shared app before and after the Chapter 2 introduction.

### D4 — The full-island witness is the decision instrument

The experiment must reach a viewable shared-app deep link and prove both behaviour and appearance:

- deterministic frame/progress mapping and stable anchor geometry by executable tests;
- Next, Back and Replay equivalence;
- reduced-motion settlement at the same final island;
- no PixelLab network request or secret at runtime;
- acceptable browser memory, decode and frame pacing on the supported app path;
- the unchanged clean product route when the witness is query-gated; and
- an operator-held LOOK verdict on the hosted result.

The arc does not close merely because sheets were generated. Its terminal increment records whether
the full-island art composes successfully enough to adopt this technique selectively, needs one
explicitly bounded follow-on, or should be rejected.

### D5 — Capability-count canopy mapping is assessed without multiplying the pipeline

The full-island witness may use one representative capability count. During the experiment the
builder must assess the cheapest credible production seam for capability-aware canopy density:

- a bounded set of registered canopy variants;
- app-owned foliage clusters attached at stable sockets over the generated base; or
- another monotonic, inspectable overlay that does not change the root or mature footprint.

The experiment must not generate an unbounded sheet per story or capability count. If a bounded
mapping cannot preserve the PixelLab LOOK, that limitation is recorded for the adoption decision;
it does not block seeing whether a complete growing island works.

### D6 — Explicitly rejected

- PixelLab, another model or a credential in the runtime/browser path.
- A website-local recreation, standalone video/GIF, Storybook-only fixture or Studio-only animation
  presented as Chapter 2 proof.
- A second island renderer, second semantic model or asset-owned animation clock.
- Independent frames played without anchor normalization, deterministic indexing and retained final
  state.
- Whole-scene translation, scale/fade or a concealed snapshot swap presented as planted growth.
- Using PixelLab for every surface by default, or generating an unbounded family of sheets before
  the single-island witness earns adoption.

## Consequences

**Good.**

- The strongest observed art direction receives a fair test at the scale that matters: a complete
  island inside the product.
- Chapter 2 keeps one runtime, one semantic state model and its normal navigation/accessibility
  contract.
- Expensive generative work is author-time, inspectable and replaceable; the shipped app remains
  deterministic and offline from the vendor.
- Selective layers let authored organic growth coexist with cheaper, sharper app-native rendering.
- Capability-aware canopy growth remains possible without forcing it into the first visual verdict.

**Costs and risks.**

- Multi-frame raster art increases repository/build weight, browser decode memory and art-iteration
  cost. Atlas dimensions, loading and frame count need explicit budgets.
- A visually coherent tree may not remain coherent when coastline, ground, foliage and painter order
  share the sequence. The full-island witness may reject the technique.
- Author-time normalization and registered layer metadata become real pipeline work; weak source
  frames cannot be repaired by runtime transforms.
- Raster interpolation offers less continuous responsiveness than the superseded topology rig.
  Semantic checkpoints and bounded canopy overlays must carry any dynamic story relationship.
- The owner still holds the appearance verdict. Machine-green playback is necessary but cannot
  attest that the island looks alive.

## References

- [ADR-0264](0264-chapter-2-tree-growth-uses-one-deterministic-topology-rig-wi.md) — superseded
  topology-first implementation decision whose deterministic/app-owned safeguards continue here.
- [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — author-time
  generation boundary.
- [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md) — replaceable
  Storybook/sprite rendering posture.
- [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md) — Chapter 2 is a
  scripted mode of the real shared app.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — two-stage
  frontend proof and owner-held LOOK verdict.
- [`SceneView`](../../packages/app-surface/src/SceneView.tsx) and
  [`SemanticGrowthWorldView`](../../packages/app-surface/src/SemanticGrowthWorldView.tsx) — shared
  renderer/player seams the experiment must use.
- Arc `chapter2-pixellab-island-growth-arc` — bounded full-island adoption test.
