---
status: accepted
decided: 2026-07-31
supersedes: [273]
amends: [219, 230, 237]
arc: chapter2-pixellab-organic-growth-arc
---
# ADR-0274: PixelLab animates organic growth over the app-owned SVG island

## Status

accepted (2026-07-31) — decided/directed by the owner in conversation on 2026-07-31.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Supersedes
[ADR-0273](0273-pixellab-island-growth-is-a-selective-standard-shared-app-sp.md).**
Its hosted full-island raster witness proved that generated frames can run deterministically in the
shared app, but it also exposed the wrong visual abstraction: the generated island changed the
established camera angle and replaced geometry that the existing SVG already expresses well.
ADR-0273's app-owned clock, deterministic navigation, stable-anchor, reduced-motion, provenance and
author-time-only protections continue here. Its authorization to generate the land, coastline or a
complete-island composite does not.

**Amends
[ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md),
[ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md), and
[ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md).**
Generated animation remains a selective app-owned render track, but only for organic material whose
deformation benefits from authored frames: trees, canopy, plants, flowers and bounded foliage
details. The island and coast remain app-native SVG.

## Context

The PixelLab full-island experiment reached the real shared app and answered an important
engineering question: locally versioned frames can be driven by normalized semantic progress
without a runtime vendor dependency or second animation system. It did not pass the owner's visual
judgement. The raster island used the wrong camera angle, and putting the land itself into a sprite
sequence discarded a strong existing asset.

The existing SVG island already owns the intended 2.5D/isometric silhouette, coast, parcel geometry
and camera relationship. The app can grow or reveal that geometry continuously and crisply. Asking
an image model to redraw it introduces camera, crop and shoreline drift without buying meaningful
organic motion.

PixelLab remains useful where the current app art is weakest. Branches, leaves, flowers and ground
plants change shape as they grow; a small registered sequence can express that authored deformation
better than a whole-scene scale/fade or a rigid procedural reveal. The correction is therefore a
layering decision, not a rejection of generated art.

## Decision

### D1 — The existing SVG island is the sole land substrate

Chapter 2 grows the existing app-owned SVG island, coast and ground geometry through the standard
shared renderer. Their established isometric camera, world parcel, view box and painter-order role
are authoritative. The implementation may use app-native masks, clips, path reveals or bounded
geometry interpolation, but it does not substitute PixelLab land frames.

There is no generated island, generated coastline, full-island raster composite or sprite sheet
whose frames redraw the parcel. Water, shadows, labels, effects and interaction geometry also remain
app-native unless a later decision names a narrower reason to change them.

### D2 — PixelLab is reserved for organic growth tracks

PixelLab may author the visual deformation of:

- the rooted hero tree, including trunk, branches and canopy;
- bounded capability-aware foliage overlays; and
- plants, flowers and other small ground details attached to declared sockets.

[ADR-0277](0277-occlusion-registered-cutouts-are-plant-only.md) narrows this authorization for one
tested assembly: Experiment 8's cutout trunk plus separately authored occlusion-registered canopy is
plant-only and is not a hero-tree solution. Other coherent whole-tree PixelLab treatments remain in
scope for comparison; none is selected by that amendment.

Accepted outputs are transparent, locally versioned PNG or atlas assets with fixed frame
dimensions, frame count, order, prompt/model metadata, generation identifiers and licence/provenance
notes. PixelLab is author-time tooling only. No vendor request, credential, model call or generated
animation clock enters the runtime, build artifact or deployed environment.

The app owns semantic state, normalized progress, frame selection, timing, easing, holds, Next,
Back, Replay, reduced-motion settlement and the retained final scene. The same semantic progress
always selects the same local frame.

### D3 — The app camera and planted sockets constrain every generated frame

Generation starts from a fixed reference plate exported from the real SVG island at its established
camera angle. Every organic track declares:

- a fixed canvas and transparent background;
- one root or ground-socket anchor in app/world coordinates;
- a depth slot and mature footprint;
- fixed frame dimensions, count and playback order; and
- author/import-time crop and anchor normalization.

The generated asset must fit the app's camera; the camera does not move to fit the asset. A track
with the wrong projection, drifting root, changing ground contact or incompatible mature footprint
is rejected or regenerated rather than compensated by moving the island at runtime.

Separate registered tracks are preferred when they preserve painter order and let the app compose
land, trunk, canopy and ground details cleanly. The SVG island remains visible as the real retained
scene beneath and around those organic layers.

### D4 — Capability correspondence uses a finite app-owned seam

Capability-count correspondence is desirable but does not justify an unbounded generated family.
The bounded seam is a finite set of app-owned foliage or flower sockets over the mature organic
base. The app may reveal registered overlays monotonically as capability count grows.

If one small set of canopy variants proves cheaper and visually stronger, it may be tested, but the
pipeline does not generate a bespoke tree sheet for every story or capability count. The root,
camera and mature footprint remain invariant across variants.

### D5 — The corrected hosted witness is the adoption instrument

The successor arc `chapter2-pixellab-organic-growth-arc` must produce one hosted real-shared-app
witness in which:

- the existing SVG island grows at the established camera angle;
- a separately selected coherent hero-tree treatment and PixelLab-authored plant tracks grow from
  stable app-owned sockets;
- the clean product route is unchanged and any witness gate uses the same product component;
- deterministic progress, Back/Replay equivalence and reduced-motion settlement have executable
  proof;
- camera/reference registration and root/socket invariance have executable or import-time proof;
- there is no runtime PixelLab dependency and asset/decode/performance costs are recorded; and
- desktop and mobile evidence reaches the owner for the owner-held LOOK verdict.

The full-island raster witness from ADR-0273 remains useful rejected evidence. It is not the active
visual direction and should leave the active witness path when the corrected implementation lands.
The successor arc does not close until the corrected organic composition has a real owner verdict.

### D5 comparison evidence — pose-to-pose witness (2026-08-01)

The owner reviewed the hosted PR #1045 witness at
`?organicGrowth=organic-pose-to-pose#/tree` and said the tree animation was "probably the most"
liked of the experiments, while disliking how the island forms.

This is partial comparison evidence, not the D5 adoption verdict. The pose-to-pose tree is the
provisional comparison leader; "probably" leaves final selection and clean-route adoption open.
This witness's island-formation treatment does not pass LOOK and must be reworked.

D1 remains unchanged: the rework must retain the existing app-owned SVG island, coast, established
camera and geometry, with no generated-land substitute. The combined composition remains held and
the arc stays active pending a corrected whole-composition owner verdict.

### D5 comparison evidence — occlusion-registered cutout witness (2026-08-01)

The owner reviewed the hosted PR #1054 witness at
`?organicGrowth=organic-canopy-occlusion#/tree` twice. The small plants looked good and retain the
registered cutout/pose technique. The tree canopy still looked disconnected from the trunk after a
focused author-time correction removed the reported green blob and moved the overlap collar to the
true crown contact.

This rejects the Experiment 8 cutout-trunk plus occlusion-registered-canopy assembly for the hero
tree. It does not reject every PixelLab-authored whole-tree pose treatment, select a sibling tree
candidate, accept the held island control or close the arc. ADR-0277 records the plant-only narrowing.

### D5 comparison evidence — registered hybrid handoff witness (2026-08-01)

The owner reviewed held Experiment 10 in PR #1056 at
`?organicGrowth=organic-hybrid-handoff#/tree` and judged the plant/tree composition positively:
the result "actually looks quite nice." The exception is the initial cutout-trunk handoff, where
the grown trunk transitions into a thin twig before the later pose-to-pose tree develops.

The owner attributes this more likely to the selected sprite combination than to the registered
hybrid/match-cut technique itself. Preserve the hybrid rig as promising comparison evidence, but do
not retain the current trunk-to-continuity-pose pairing as the answer. A successor must choose a
continuity sprite whose trunk weight and silhouette match the liked cutout trunk, then re-prove that
the registered handoff has no style pop, silhouette snap, double trunk, ghosting, canopy gap or
timing seam.

This LOOK signal is explicitly limited to plants and trees. Experiment 10's island treatment gains
no positive comparison weight: other island-growth experiments already produced better results,
with connected SVG accretion from Experiment 6 remaining the current recorded lead. This evidence
does not adopt the hybrid rig, choose an island treatment, change the clean route or close the arc.

### D6 — Explicitly rejected

- Generating the island, coast or complete scene as a PixelLab sprite sequence.
- Changing the established app camera, island projection or world parcel to accommodate generated
  art.
- One destructive composite when registered organic layers preserve control and painter order.
- A runtime vendor call, asset-owned clock, second renderer, standalone video/GIF, Storybook-only
  fixture or website recreation presented as product proof.
- Whole-scene scale/fade, snapshot replacement or crop drift presented as planted organic growth.
- An unbounded sheet family keyed by story or capability count.

## Consequences

**Good.**

- The strongest existing island asset and its intended camera stay authoritative.
- PixelLab is used where it adds distinctive value instead of redrawing stable product geometry.
- Independent organic layers can be regenerated or replaced without rebuilding the island.
- The app retains one semantic model, renderer, clock, navigation and accessibility contract.
- Smaller transparent tracks should reduce asset, decode and iteration cost relative to the rejected
  full-island sequence.

**Costs and risks.**

- Every selected PixelLab-authored tree candidate and retained plant track must be generated against
  a precise reference plate; projection mismatch is still a real rejection condition.
- Registered sockets, author-time normalization and cross-layer painter order become explicit
  pipeline work.
- The seam between crisp SVG land and raster organic art may reveal style mismatch and needs a
  hosted visual verdict.
- Multiple organic tracks require deliberate loading and frame budgets even though they are smaller
  than a full-island composite.
- The current full-island witness and story claims must be retired or superseded rather than
  silently relabelled.

## References

- [ADR-0277](0277-occlusion-registered-cutouts-are-plant-only.md) — amendment that retains the
  Experiment 8 cutout/pose technique for small plants and rejects its assembled hero-tree join.
- [ADR-0273](0273-pixellab-island-growth-is-a-selective-standard-shared-app-sp.md) — rejected
  full-island raster experiment and inherited deterministic runtime safeguards.
- [ADR-0264](0264-chapter-2-tree-growth-uses-one-deterministic-topology-rig-wi.md) — earlier
  tree-growth decision whose planted-root and app-owned behaviour constraints remain useful.
- [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — author-time
  generation boundary and fixed 2.5D/isometric posture.
- [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md) — replaceable
  sprite/render-track posture.
- [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md) — Chapter 2 is a
  scripted mode of the real shared app.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — two-stage
  frontend proof and owner-held LOOK verdict.
- [`SceneView`](../../packages/app-surface/src/SceneView.tsx) and
  [`SemanticGrowthWorldView`](../../packages/app-surface/src/SemanticGrowthWorldView.tsx) — shared
  renderer and semantic player seams.
- Arc `chapter2-pixellab-organic-growth-arc` — corrected SVG-land/organic-track adoption test.
