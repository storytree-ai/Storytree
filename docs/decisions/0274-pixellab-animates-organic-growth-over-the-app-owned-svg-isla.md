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

**Owner LOOK evidence (2026-08-01 — Experiment 2, layered cutout puppet).** The owner judged this
comparison to have the best trunk and ground-plant growth animations seen so far, with the plants in
particular animating very well. That positive component evidence does not adopt the complete rig.
The island formation remained below the visual bar, while the tree leaves looked wrong and were
misplaced: a visible gap between canopy and trunk made the settled tree read as buggy and unclean.
The trunk and plant choreography are therefore retained as strong reusable evidence; the current
canopy assembly/registration and island-formation treatment are rejected. No clean-route default or
whole-technique adoption follows from this verdict.

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

Stable coordinates are necessary but not sufficient registration. In the settled scene, canopy
material must visibly connect to and overlap its supporting trunk or branch at the declared socket.
A mathematically invariant socket that leaves a visible air gap, misplaced leaves or a detached
canopy has failed registration and must be re-authored, re-normalized or rejected; the app must not
ship that discontinuity as an intentional puppet joint.

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
- PixelLab-authored tree and plant tracks grow from stable app-owned sockets;
- the clean product route is unchanged and any witness gate uses the same product component;
- deterministic progress, Back/Replay equivalence and reduced-motion settlement have executable
  proof;
- camera/reference registration and root/socket invariance have executable or import-time proof;
- there is no runtime PixelLab dependency and asset/decode/performance costs are recorded; and
- desktop and mobile evidence reaches the owner for the owner-held LOOK verdict.

The full-island raster witness from ADR-0273 remains useful rejected evidence. It is not the active
visual direction and should leave the active witness path when the corrected implementation lands.
The successor arc does not close until the corrected organic composition has a real owner verdict.

Experiment 2's 2026-08-01 owner LOOK is a component-selective result: its trunk and ground-plant
motion are the strongest positive animation evidence in that comparison, but its island formation
and visibly detached canopy fail the composed-scene bar. The experiment remains comparison evidence
and does not close the successor arc or authorize the cutout-puppet rig as the clean-route default.

### D6 — Explicitly rejected

- Generating the island, coast or complete scene as a PixelLab sprite sequence.
- Changing the established app camera, island projection or world parcel to accommodate generated
  art.
- One destructive composite when registered organic layers preserve control and painter order.
- A runtime vendor call, asset-owned clock, second renderer, standalone video/GIF, Storybook-only
  fixture or website recreation presented as product proof.
- Whole-scene scale/fade, snapshot replacement or crop drift presented as planted organic growth.
- A canopy whose leaves are mathematically socketed but visibly detached, misplaced or separated
  from their supporting trunk/branch by an air gap.
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

- Tree and plant art must be generated against a precise reference plate; projection mismatch is
  still a real rejection condition.
- Registered sockets, author-time normalization and cross-layer painter order become explicit
  pipeline work.
- Coordinate-invariant sockets still require a visual continuity check: stable math can produce a
  visibly buggy trunk/canopy gap.
- The seam between crisp SVG land and raster organic art may reveal style mismatch and needs a
  hosted visual verdict.
- Multiple organic tracks require deliberate loading and frame budgets even though they are smaller
  than a full-island composite.
- The current full-island witness and story claims must be retired or superseded rather than
  silently relabelled.

## References

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
