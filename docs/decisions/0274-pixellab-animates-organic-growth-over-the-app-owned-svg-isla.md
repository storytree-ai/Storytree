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

**Amended by
[ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) (2026-08-01) and
[ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) (2026-08-02).**
D1, D3 and every runtime safeguard stand unchanged under both. ADR-0280 widens D2's reservation of
organic growth tracks from PixelLab to any author-time source, code first, and narrows the model's
role to supplying components rather than whole frames or growth tracks. ADR-0282 adds the scale rule
D2 never carried: an authored per-frame track — from any source — is affordable for at most one
focused tree, and every other tree in the forest renders app-native. This ADR is not superseded and
its arc is not closed; the hero-tree source remains unselected.

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

## Standing position at a glance (2026-08-02)

This section is a summary, not a decision. It restates what D1–D6 below, ADR-0277, ADR-0280,
ADR-0282 and the recorded owner LOOK verdicts already establish, so the current art-direction
position can be read from this one ADR instead of reconstructed from four ADRs plus the arc
increment log. Nothing here is new policy; where it appears to differ from a decision clause, the
clause wins.

**Island — SETTLED (recorded lead).** Experiment 6's connected SVG accretion is the island
treatment. It carries the only explicitly positive island-formation LOOK the arc has recorded — "the
island growth looks really good" — and it is the fixed composition the round-3 hero-tree lab
compares candidates over. It is app-owned SVG land, as D1 requires; no generated-land substitute is
in scope. Whole-composition and clean-route adoption still run through D5.

**Small plants and flowers — SETTLED.** The registered cutout/pose technique is retained for ferns,
flowers, grasses and other small ground details on declared app-owned sockets (ADR-0277 D2 and D5).
Each retained plant track still carries the fixed canvas, pose order and dimensions, stable ground
socket, crop normalization, painter slot, provenance and decode budget those clauses require.

**Hero tree — UNRESOLVED, and its LOOK is blocked on the camera.** No hero-tree treatment is
selected, and the arc still carries this as its open question. Round 3 put four candidates over the
fixed Experiment 6 island composition in one comparison lab at `?organicGrowth=r3-lab#/tree`
(PR #1062): the round-1 incumbent, exp-15 object-rig v3, exp-16 leader-repair and exp-18 eroded
prior. That lab is built and its owner LOOK verdict has not been taken — and it is no longer merely
pending. The owner directed on 2026-08-01 that the camera must be fixed before any hero-tree LOOK,
and the camera-projection probe then established that PixelLab will not obey a camera word: the
`view` parameter with isometric and aerial vocabulary, and in-context `create_map_object`, all
return side elevation or bare terrain. Every round-3 candidate is front elevation against a low
top-down plate. The workaround needs roughly 40 generations and 12 remain, which the owner has
declined to top up, so this route is blocked on capability and on budget at once.

**Hero-tree source — REOPENED, and now code-first (ADR-0280).** Round 4
(`docs/research/chapter2-code-only-art-2026-08-01/VERDICT.md`) built four model-free generators and
measured them against exp-16. Two results changed the direction. The camera is a free scalar in code
— the blocker that is structurally unavailable from the vendor costs one re-run — and the finish,
not the method, is what made procedural art look schematic: two near-identical procedural skeletons
emitted through different renderers give vector clipart through SVG and a competitive pixel-art tree
through a raster rasteriser. ADR-0280 took that fork: our code owns skeleton, camera and growth, a
generative model supplies components rather than whole frames, and the technique is a code skeleton
with a raster finish. That decision explicitly does not close this arc or select its hero tree —
both tracks are live, and both are unattested.

**Round 4's own caution, kept honest.** Code did not win the drawing. On root flare, crown
separation and young-tree proportions the generated track beats every code track at every stage of
the sequence except the single mature frame, and not one of the four code tracks produced anything a
person would call a sapling. What code won is everything mechanical, and it won it for free: the
best code track's worst cut subdivided `0.676` to `0.953` in `0.8 s` for `$0.00` with byte-identical
endpoints, where `6` irreplaceable generations moved exp-16's worst cut only `0.279` to `0.457` and
hit a reported floor.

**The forest at large — SETTLED (ADR-0282).** The clauses below are written for one focused tree and
say nothing about 45 of them. ADR-0282 settles that: the forest at large — island accretion,
per-territory trees, trails — renders app-native at any story count, and an authored per-frame
track, from any source, is affordable for at most one focused tree.

### Experiment record

Verdicts are the owner's recorded LOOK, quoted from the arc increment log. Each experiment is
anchored to its PR, which is the permanent artifact; two experiments never reached a PR and live on
their branches.

| Exp | Technique | PR | Owner LOOK verdict |
| --- | --- | --- | --- |
| 1 | pose-to-pose | #1045 | Provisional comparison leader — tree animation "probably the most" liked; island formation did NOT pass and must be reworked |
| 2 | layered cutout puppet | (branch only) | Best trunk + ground-plant growth so far; NOT adopted — island below bar, leaves wrong/misplaced, canopy-to-trunk gap reads buggy |
| 3 | texture-under-mask / stroke-matte reveal | #1047 | Rejected, ranked least — read as a slowly revealed static image, "cheap rather than organic emergence" |
| 4 | registered key-pose blending | #1046 | Strongest island formation at the time but NOT accepted — island "fades in rather than grows from nothing" |
| 5 | staggered socket choreography | #1048 | Rejected — owner not a fan of the island growth; tree + flower animations liked as component evidence |
| 6 | connected SVG accretion | #1055 | POSITIVE — "the island growth looks really good"; first positive island LOOK; the current island lead |
| 7 | SVG contour morph | #1053 | Island okay but below the Exp 6 lead; not rejected outright |
| 8 | occlusion-registered canopy | #1054 | Hero-tree assembly REJECTED (canopy still disconnected after a focused correction); cutout/pose technique RETAINED for small plants — ADR-0277 |
| 9 | branch-emitted leaf bloom | (branch only) | Rejected — "this looks really buggy, the placement is all over the place" |
| 10 | registered hybrid handoff | #1056 | Positive for the plant/tree composition ("actually looks quite nice"); trunk-to-thin-twig handoff needs a continuity sprite of comparable trunk weight |

**Hosted witness tags retired 2026-08-01.** The ten per-experiment hosted witness revisions on the
`storytree-studio` service were retired at the owner's direction, superseded by the single round-3
comparison lab in PR #1062 that puts four hero-tree candidates over one fixed composition. This
follows D5's rule that a superseded witness leaves the active witness path once the corrected
implementation lands. The evidence of record is now the PRs above plus the arc increment log, and
each witness rebuilds from its PR or branch. Retiring a witness retires no verdict: the verdict
prose in this ADR and in ADR-0277 stands exactly as written.

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

*(Amended by [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md),
2026-08-01: the reservation of organic growth tracks to PixelLab is WIDENED to any author-time
source, code first. Chapter 2's organic art is now generated by our own code — code owns the
skeleton, the calibrated camera and the growth — and a generative model is demoted to supplying
individual component assets and textures that the code orchestrates, never a whole frame or a growth
track. The vendor is not fixed: the PixelLab budget is treated as spent and Nano Banana is the
default component source. **D1, D3 and every runtime safeguard in this ADR stand unchanged**, and
this ADR is NOT superseded — its arc stays active and its hero-tree candidates remain eligible and
unselected. Noted in place per ADR-0139.)*

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

The owner reviewed the hosted Experiment 1 witness from PR #1045 and said the tree animation was
"probably the most" liked of the experiments, while disliking how the island forms. That witness's
hosted tag was retired on 2026-08-01; PR #1045 is the permanent record and the witness rebuilds from
its branch.

This is partial comparison evidence, not the D5 adoption verdict. The pose-to-pose tree is the
provisional comparison leader; "probably" leaves final selection and clean-route adoption open.
This witness's island-formation treatment does not pass LOOK and must be reworked.

D1 remains unchanged: the rework must retain the existing app-owned SVG island, coast, established
camera and geometry, with no generated-land substitute. The combined composition remains held and
the arc stays active pending a corrected whole-composition owner verdict.

### D5 comparison evidence — occlusion-registered cutout witness (2026-08-01)

The owner reviewed the hosted Experiment 8 witness from PR #1054 twice. The small plants looked good
and retain the registered cutout/pose technique. The tree canopy still looked disconnected from the
trunk after a focused author-time correction removed the reported green blob and moved the overlap
collar to the true crown contact. That witness's hosted tag was retired on 2026-08-01; PR #1054 is
the permanent record and the witness rebuilds from its branch.

This rejects the Experiment 8 cutout-trunk plus occlusion-registered-canopy assembly for the hero
tree. It does not reject every PixelLab-authored whole-tree pose treatment, select a sibling tree
candidate, accept the held island control or close the arc. ADR-0277 records the plant-only narrowing.

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
- [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) — amendment that
  widens D2 from PixelLab to any author-time source, code first, and demotes the generative model to
  a supplier of components.
- [ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) — amendment that
  adds the scale rule: app-native forest at any story count, at most one focused tree on an authored
  per-frame track.
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
