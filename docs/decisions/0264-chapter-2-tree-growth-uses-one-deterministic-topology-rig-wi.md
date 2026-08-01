---
status: superseded
decided: 2026-07-29
amends: [237]
arc: chapter2-real-app-surface-arc
---
# ADR-0264: Chapter 2 tree growth uses one deterministic topology rig with art as replaceable finish

## Status

superseded by [ADR-0273](0273-pixellab-island-growth-is-a-selective-standard-shared-app-sp.md)
(2026-07-30). The deterministic root, replay, reduced-motion and shared-app constraints continue;
ADR-0273 replaces this ADR's required procedural topology substrate with a bounded, selective
PixelLab sprite-track experiment after stronger visual evidence and an owner-directed subscription.

**Amends [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md):**
its shared app surface, semantic-event control, persistent-scene posture and conditional
manifest-art fallback stand. D5 is narrowed for tree and plant growth: silhouette change does not
first earn authored raster frames or several reconstructed key poses, and the current mature sprite
is not a required terminal handoff. The implementation is one deterministic, addressable
trunk/branch/canopy topology rendered with the safe layered-SVG vocabulary. Replaceable art may
finish that topology without becoming its state model.

**Evidence note (2026-08-02) — the reversal was tested, and it was half right.** This ADR stays
superseded; nothing below returns to force. But round 4 of the successor arc
(`docs/research/chapter2-code-only-art-2026-08-01/VERDICT.md`) put four model-free generators against
the generated track that replaced this rig, and the result deserves recording here rather than only
in the ADRs that overtook it.

- **Right on the art.** ADR-0273/0274 reversed this decision because generated frames drew a better
  tree, and that holds under measurement: on root flare, crown separation and young-tree proportions
  the generated track wins at every stage of the sequence except the single mature frame. Not one of
  the four code tracks produced anything a person would call a sapling. The reversal stands.
- **Wrong to discard the rig with the renderer.** Every mechanical property this ADR promised, round
  4 delivered in full and for nothing: byte-identical determinism on four independent generators, the
  ground-contact row pinned to one scanline on every frame of every track, `0.50 px` of horizontal
  anchor drift on the best of them, one connected body per frame, monotone mass with no shrink, and a
  palette that is a strict subset of the reference's 32 colours by construction. The decisive number
  is the in-betweens: subdividing the best code track's worst cut moved it `0.676` to `0.953` in
  `0.8 s` for `$0.00` with both endpoints byte-identical, while `6` irreplaceable generations moved
  the generated track's worst cut only `0.279` to `0.457` and then hit a reported floor. This ADR's
  error was making the rig the RENDERER, not having a rig.
- **The renderer, not the method, is what looked schematic.** This ADR rendered its rig through
  layered SVG. Round 4's controlled result is that two near-identical procedural skeletons emitted
  through different renderers give vector clipart through SVG and a competitive pixel-art tree
  through a raster rasteriser — so the reading that grew out of this reversal, that procedural art
  looks cheap, does not survive.

[ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) (2026-08-01) is
where that correction is carried forward as a live decision: code owns skeleton, camera and growth,
with a raster finish, and a generative model supplies components. Read it, not this record, for what
is in force.

## Context

The semantic-growth witness proved the shared six-state player, real Storybook/Vector art policy,
deterministic replay and reduced-motion equivalence. Its next visual attempt did not prove believable
growth. Complete semantic snapshots replaced one another; whole groups appeared with unrelated
timing; a fixed companion island supplied geometry outside the narrated island; and the mature tree
arrived as one scale/fade. The owner rejected that LOOK after PR #961 and directed a persistent
island-local scene.

The hard case is the planted tree, not land formation. An island can reveal a stable surface. A tree
changes visible topology as it grows: a trunk rises from one root, branches can exist only after
their supporting forks, and foliage can exist only after its supporting branch or ground socket.
The animation must therefore communicate dependency while preserving the app surface's existing
mapper transform, painter order, art policy and semantic controls.

Three bounded prototypes compared the implementation choices under the same fixed root, scrub,
replay, reduced-motion and 0/25/50/75/100 checkpoints:

1. an art-directed layered SVG tree using trunk reveals, pivoted branch groups and staggered canopy
   masks;
2. a deterministic procedural branch graph whose parent-first topology is rendered with the same
   SVG mask/path vocabulary and may receive replaceable textures; and
3. an art-rich hybrid reconstructed from several authored key poses and reusable raster/vector
   components.

The layered prototype supplied useful motion idioms, but does not need to become a separate asset
architecture. Those same path, mask and local-scale techniques can render a stable procedural rig.
The procedural prototype made support relationships machine-addressable and replay-stable.
The authored key-pose/component hybrid was rejected by the owner as the most error-prone option:
pose consistency, component seams, crop/mask cleanup, pivot alignment, occlusion and the final
consolidation all create independent failure surfaces while still risking a disguised snapshot
swap.

The current renderer already owns story-tree geometry, planted ground anchors, Storybook sprites,
Vector fallback and painter ordering. The decision should add the minimum missing growth substrate,
not a second renderer or a new art pipeline.

## Decision

**Tree and plant growth uses one persistent, deterministic topology rig in the existing
`SceneView`.** The rig is structural product behaviour. It is rendered through layered SVG
path-length growth, support-centred masks/clips and local canopy paint-on; selected Storybook/Vector
art and any later textures are replaceable finish, not a second growth method.

### D1 — One rooted, addressable topology

Each growing tree has one island-local root socket and one retained renderer identity. Its growth
parts are addressable under that identity:

- a trunk beginning at the root;
- major branches beginning at inspectable trunk forks; and
- multiple canopy or leaf clusters beginning at their supporting branch tips.

The topology is deterministic. A fixed model/seed/parameter set produces the same part identities,
geometry, depth order and mature silhouette on every render and replay. Random regeneration,
remounting, per-replay variation and independently generated poses are forbidden.

Capability count is an explicit topology input. A story with more capabilities grows a visibly
larger, denser tree:

- each capability deterministically claims a stable canopy/green-patch slot and supporting tip;
- canopy extent and patch density never decrease as capabilities are added;
- trunk and major-branch thickness/spread may increase through bounded monotonic functions; and
- adding one capability preserves the identities and attachment points already assigned to earlier
  capabilities instead of re-rolling the tree.

The semantic mapping may aggregate several capability slots into one rendered patch at high counts,
but the full capability-to-slot mapping remains addressable for inspection. A bounded level-of-detail
policy caps SVG/DOM work and keeps the tree inside its island parcel; visual scale must not grow
without limit.

The rig belongs to the existing app-surface renderer. It is not a website, Studio-fixture or
Chapter-2-local implementation, and it does not require a second scene model.

### D2 — Semantic cues advance dependency-shaped tracks

The selected growth trace is:

`nothing → island reveal → trunk growth → branch growth → canopy accumulation → mature tree`.

Chapter 2 continues to apply semantic events to one stable presentation model. The shared player
maps those events onto tree-local tracks:

- trunk extent grows upward from the root;
- branch paths extend parent-first from already-visible forks;
- capability-backed canopy and leaves paint, clip or scale outward at their supporting tips; and
- any selected finish settles only after the structural topology is established.

Leaves do not fly into the tree. The whole tree does not translate, pop, overshoot or scale from its
centre. Full CSS `transform` animation must not replace the mapper's planted placement transform.
Path length, masks/clips, opacity and additive local scale/translate are permitted when they retain
ground contact and component ownership. Authored SVG silhouettes, texture clips and canopy shapes
may improve the finish, but their reveals are driven by the rig's parent-first tracks and named
support points; they do not own topology, clocks or replay state.

Back and Replay reapply the identical rig and checkpoints. Reduced motion removes interpolation,
delay, orbit and concealment while exposing the completed topology for each semantic cue at the
same root and final placement.

### D3 — Existing art is optional finish, not a terminal contract

The rig participates in both existing renderer modes. Vector mode may expose the layered structural
geometry directly. Storybook mode may texture or replace those same layers, or crossfade to one
compatible mature sprite at the same anchor. That handoff is optional: the current selected sprite
does not need to be preserved, and the layered rig may remain the mature presentation when it
produces the stronger LOOK.

The first implementation adds no frame sequence, independently posed trees, new manifest resolver or
asset-local animation clock. It proves topology, capability scaling and controls through
`semantic-growth-replay-view`, then returns to the owner for the LOOK verdict required by ADR-0070.
Generated, commissioned or painted texture/components may be tried behind the same slots; no existing
final art is protected from replacement.

### D4 — Art is a bounded, replaceable follow-on

If the machine-green rig is structurally honest but visually too schematic, a later bounded
art pass may add:

- tileable or clipped bark, foliage, grass and earth textures;
- stable authored canopy/leaf silhouettes with explicit support-point and depth metadata; and
- optional flower, fruit or ground-detail accents attached to named sockets.

Nano Banana or another generative model may supply author-time texture, colour or concept direction
through ADR-0219/0230's existing pipeline. It does not generate runtime state, a pose sequence,
independent per-frame trees, major-branch cutouts or a sprite sheet for growth. Purchased or
commissioned art fits the same slots.

The art layer cannot change topology, root, perspective, capability mapping or attachment between
replay states. Generated trunk/major-branch cutouts, pivoted structural components and independent
pose silhouettes remain excluded. If a proposed finish requires those changes, it is a new bounded
art decision rather than an implicit widening of this one.

### D5 — Explicitly rejected

- Several independently authored tree key poses reconstructed at runtime.
- A component sheet whose trunk/major branches must be cropped and reassembled into each pose.
- A layered-SVG asset rig that authors a separate fixed topology per tree or cannot derive stable
  capability-backed patches from the shared procedural model.
- Whole-tree or whole-scene snapshots, companion islands, remount keys or asset-local timelines.
- Whole-tree scale/fade, renamed pop/overshoot, incoming foliage particles or unrelated group timing
  presented as growth.
- Generated animation frames, animated WebP/video or a larger sprite sheet as the semantic state
  model.
- A second renderer, forest-world model, Studio-local animation or website-local product motion.

## Consequences

**Good.**

- Growth causality is visible and machine-testable: no branch precedes its fork and no canopy
  precedes its support.
- Root, geometry and replay identity stay stable, closing the off-island and snapshot-replacement
  failures observed after PR #961.
- The layered SVG techniques that looked convincing remain available without making every pose a
  separately authored asset.
- Capability count has a visible, inspectable and monotonic relationship to canopy density and
  bounded tree stature.
- Storybook, Vector and later replacement art share one behaviour contract and one mature anchor.
- Art can improve independently after the structural increment is green and witnessed.

**Costs / risks.**

- `SceneView` gains addressable tree-local geometry and the semantic-growth player gains two more
  settled tracks. Both renderer modes need executable preservation proof.
- A procedural rig can look mathematical or schematic. Its parameters and asymmetry need art
  direction, and the owner still holds the LOOK verdict.
- Capability scaling needs a stable slot allocator and level-of-detail thresholds so a large story
  remains readable and performant without reassigning earlier capabilities.
- An optional transition into mature Storybook art can expose silhouette mismatch. It must be tuned
  at one anchor; it cannot be hidden with a scene swap.
- Texture finish still needs crop/mask and depth metadata, but only after the smaller structural
  substrate proves which assets are actually needed.
- This decision does not attest or ship production art. The previously ready
  `chapter2-tree-topology-growth-rig-20260728` plan drifted before implementation and must be
  superseded, not repaired, against this capability-scaling refinement.

## References

- [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md) — shared
  app-surface and semantic-motion boundary amended here.
- [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md) and
  [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — existing
  renderer/art policy and author-time-only generation boundary.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — owner-held
  appearance verdict after machine proof.
- [`SceneView`](../../packages/app-surface/src/SceneView.tsx),
  [`SemanticGrowthWorldView`](../../packages/app-surface/src/SemanticGrowthWorldView.tsx), and
  [`semantic-growth.css`](../../packages/app-surface/src/semantic-growth.css) — the existing shared
  renderer/player seams the rig extends.
- Story `semantic-growth-replay-view` — the existing behaviour contract.
- Plan `chapter2-tree-topology-growth-rig-20260728` — prior choreography; now drifted and awaiting a
  superseding plan.
- Arc `chapter2-real-app-surface-arc` — owner comparison outcome and increment history.
