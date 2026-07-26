---
id: "semantic-growth-studio-demo"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "A query-gated Studio demo stages the semantic-growth witness"
outcome: "An explicit `?semanticGrowth=demo` Studio flag mounts the public semantic-growth view over one six-frame fixture composed through Studio's real world geometry, substrate, parcels, vegetation and representative framing while the clean Studio route remains unchanged."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-replay-view]
decisions: [237, 93, 213, 215, 230, 70]
# EDITS-EXISTING correction after human UAT-4 failed at 9377e897: the hosted fixture hand-writes a
# four-point coast with empty relaxed substrate/decor/plants and is framed by the player's 100x100
# close-up. AUTHOR_TEST rejects that basic/zoomed fixture before IMPLEMENT reuses TreeView's existing
# composition path. No other Studio surface moves.
# PROOF-PRESERVATION WALL: AUTHOR_TEST extends the full pre-attempt semantic-growth describe block.
# Deleting/replacing/weakening/skipping/narrowing/consolidating any existing test/assertion is red.
# COMPOSITION-RED FLOOR: one additive executable proof must discriminate every named real composition
# source/rendered requirement; a parcel-only green is invalid even when the command exits zero.
# ANCHORED-MOTION HOST RED after owner UAT-4 FAIL at ffcdc24: the retained integration walk must prove
# stable composed anchors and localized in-world deltas; whole-scene/whole-group lateral slide is red.
# SVG TRANSFORM FLOOR: transform-attribute snapshots alone are insufficient; source/computed proof
# must reject full CSS `transform:` replacement on mapped elements and prove additive scale/origin/
# stagger or the existing `.pop-motion-inner` composition that preserves outer placement.
# AUTHORED-CHOREOGRAPHY HOST RED after the owner's continued UAT-4 FAIL following c87382ba: exact
# `.pop-motion-inner` placement preservation and additive scale are necessary but not sufficient.
# The host rejects one generic whole-object pop across terrain/tree/flora/plate/parcels and witnesses
# distinct, ordered terrain-formation and identity-growth staging with honest reduced motion.
# FINAL-REPLAY HOST FLOOR after real-ms1ss9ig: AUTHOR_TEST resolves the shared CSS for both Vector
# inner hooks and Storybook direct-image hooks, enforces the exact role/property/timing/per-item/
# one-bloom choreography, and separately rejects any arrival outside its exact entering frame.
# REAL-GATE SOURCE SEAM: TreeViewShell.test.tsx authors the executable red and SemanticGrowthDemo.tsx
# is the existing fixture-only source seam; shared app-surface CSS/SceneView remain read-only proof.
# HOST-FIXTURE ROLE RED after real-ms1yihh5: before dependency CSS audits, the proposed fixture must
# render planted tree AND garden-flora hooks through both Vector and Storybook from its own non-empty
# deterministic permanent vegetation input. Parcel flora and already-green shared CSS cannot pass it.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/components/TreeViewShell.test.tsx"]
    sourceGlobs: ["apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/SemanticGrowthDemo.tsx"]
  real:
    testFile: "apps/studio/src/components/TreeViewShell.test.tsx"
    sourceFile: "apps/studio/src/components/SemanticGrowthDemo.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/TreeViewShell.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/SemanticGrowthDemo.tsx"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "studio", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
---

# A query-gated Studio demo stages the semantic-growth witness

**Outcome —** An explicit `?semanticGrowth=demo` Studio flag mounts the public semantic-growth view
over one six-frame fixture composed through Studio's real world geometry, substrate, parcels,
vegetation and representative framing while the clean Studio route remains unchanged.

## Proof walkthrough first

Extend the existing `TreeViewShell` integration proof:

1. render clean Studio with no `semanticGrowth` query key;
2. assert the ordinary shared world remains mounted and no semantic-growth demo/controls exist;
3. render `?semanticGrowth=demo#/tree`;
4. assert the fixture was composed by the same `buildWorld -> buildRelaxedCells -> worldToScene ->
   buildScene` path as the real map, over a deterministic representative story with multiple
   capabilities and Studio's non-empty permanent vegetation input; assert a generated organic coast,
   non-empty relaxed substrate, capability parcels and parcel vegetation are present, and reject the
   current hand-authored four-point coast plus empty `relaxedCells`/`decor`/`plants`;
5. assert the bounded public `SemanticGrowthWorldView` is mounted over exactly
   `empty → land → proposed → claimed → signed-proof → healthy` at one normal representative
   contain framing, with the whole island and its breathing room visible and controls clickable;
6. walk all six frames with Next, assert exact semantic markers and stable composed coordinates:
   terrain reveals/grows in place, flora/tree scale from planted/root anchors with the existing brief
   overshoot/stagger, claim enters locally then orbits, and bloom pulses radially at its proof anchor;
   reject lateral translation of the whole scene, terrain/island or complete asset/flora group, then
   operate Back and Replay and compare the same settled transforms. Source-discriminate that no
   semantic-growth arrival/pulse keyframe sets full CSS `transform:` on a mapper-positioned SVG
   element: unchanged `transform="translate(...)"` attributes are insufficient because CSS
   `transform: scale(...)` still overrides visual placement during animation. Require additive
   individual `scale:` with fill-box, ground/root origin and stagger, or the existing
   `.pop-motion-inner` composition that leaves the outer placement transform effective throughout;
7. before reading dependency CSS, add an independent host-fixture red against the exact query-gated
   proposed frame. Render once with explicit Vector/null and require both
   `.story-tree .pop-motion-inner` and `.garden-flora .pop-motion-inner`; render again with a
   Storybook sheet covering tree and flora and require both direct `image.story-tree` and
   `image.garden-flora`. All four hooks must come from `SemanticGrowthDemo`'s own deterministic,
   non-empty permanent vegetation input composed through `worldToScene`; `.parcel-flora` cannot
   substitute. Source-audit `SemanticGrowthDemo.tsx` and fail the current
   `const VEGETATION: SceneVegetationInput = {}` before any shared-CSS assertion may count;
8. source-audit the exact existing `.pop-motion-inner` seam as a placement-preservation floor, with
   no second wrapper, full CSS `transform:` replacement or lateral entry. Then fail while
   terrain/tree/flora/plate/parcels merely alias one `arrive-pop`/whole-object scale. Require rendered
   role hooks and shared source/CSS timing to show land locally forming/revealing coast/substrate,
   followed in proposed by ground-contact tree/flora growth before plate and capability parcels
   resolve in a restrained local stagger. At least two identity subroles use materially distinct
   existing reveal/timing treatments (for example grounded scale versus local opacity, mask or clip);
   selector aliases, class names alone and numeric scale changes alone are red. Claim remains local
   with mapper orbit, bloom remains a local proof pulse, and every transition settles one-shot.
   In that executable case, discover planted, plate, parcel-boundary, parcel-flora and bloom selectors
   independently from rendered hooks and resolve shorthand plus precedence-winning longhands into
   name/duration/easing/delay/iteration/fill, then canonicalize the referenced keyframes by property
   and offset. Prove CSS participation—not DOM existence—for Vector tree/flora
   `.pop-motion-inner` and Storybook direct `image.story-tree`/`image.garden-flora`. Require planted
   tree/flora first; parcel boundary at least 100 ms later; earliest parcel flora at least 60 ms
   after boundary with at least two deterministic per-item offsets; and plate at least 180 ms after
   planted. Prove anchored planted scale/opacity, rooted parcel-flora scale/opacity, parcel-boundary
   opacity/reveal with no scale, and plate opacity plus vertical-only individual `translate:` with
   no scale; directly compare plate/planted and ungrouped parcel-boundary/parcel-flora keyframe
   bodies, with at least one pair differing in property set. Resolve bloom iteration to exactly `1`
   from shorthand/longhand precedence and prove its terminal rest state;
9. add a separate executable shared-CSS selector audit: full-motion terrain arrivals match only
   exact frame `land`; tree/flora/plate/parcel-boundary/parcel-flora only `proposed`; wisp only
   `claimed`; bloom only `signed-proof`. Reject generic
   `[data-semantic-growth-frame][data-motion='full']` arrival selectors, accumulated terrain/identity
   arrivals on claimed/signed-proof/healthy, claim arrival on signed-proof/healthy, every healthy
   arrival, and any reduced-motion arrival or delayed concealment;
10. repeat the trace under reduced motion and assert the same final static transforms appear
   immediately without slide, travel, orbit, delayed concealment or changed framing;
11. repeat that full walkthrough with Studio's resolved Storybook default and
   `?semanticGrowth=demo&artStyle=vector#/tree`, asserting the host passes the existing sheet/null
   fallback rather than resolving or drawing art itself.
12. source-audit the retained pre-attempt semantic-growth describe block and fail unless its
   independent executable tests/assertions remain intact: clean and unknown query isolation; exactly
   one public player plus navigation; signed-proof proposed/non-healthy with bloom and final-only
   healthy; land with no story marker; and the bounded `.tree-layout > .world-frame` host.

Human UAT-4 failed the implementation at `9377e897`: the demo's hard-coded
`M 14 22 L 86 22 L 78 78 L 22 78 Z` coast, empty relaxed substrate/decor/plants and 100x100 framing
made the island look basic and over-zoomed, while broad whole-scene swaps did not read as in-game
animation. This remains one isolatable correction after `semantic-growth-replay-view`: extend the
existing flagged integration test, amend the existing static fixture and keep the clean path as the
regression observable.
The first attempted correction is invalid proof: it replaced 195 lines of the existing
`TreeViewShell` semantic-growth integration coverage with a 22-line parcel-only test. The full prior
describe block must be restored before the composition red is added; a passing command cannot make
deleted proof valid.
Owner UAT-4 then failed at `ffcdc24`: the real composition was better, but whole asset groups sliding
into place still looked cheap. The host correction is limited to proving the shared surface now grows
and reveals at stable in-world anchors; Studio still owns no animation implementation.
The following real-proof candidate showed the source of the remaining slide: full CSS
`transform: scale(...)` temporarily replaced mapper-authored SVG translation while the DOM attribute
stayed unchanged. The host proof must therefore inspect property composition, not only attributes.
After the valid outer/inner split at `c87382ba`, placement-safe additive scaling still did not prove
an authored in-game sequence. The owner kept UAT-4 red after the framing and lateral placement
corrections, asking for a fresh session to do the space justice. The host red now treats the existing
inner seam as a placement floor, not a visual verdict: terrain formation and identity growth are
distinct staged events, and tree/flora/plate/parcels cannot all be one generic whole-object pop. It
adds no seam or motion system.
The run `real-ms1wbkzb` from contract `b07f3eca` stopped fail-closed at AUTHOR_TEST after exhausting
the maximum 48 turns while feedback proof remained green. No slices ran, no verdict was produced and
no candidate was promoted. The available output identifies no defect, so this history records none.
The run `real-ms1yihh5` from contract `4ede131` reached AUTHOR_TEST success after 40 turns following
red attempts, but feedback ended green and the spine failed closed at CONFIRM_RED; no verdict or
candidate was produced. Its concrete host-local loophole is the empty
`const VEGETATION: SceneVegetationInput = {}`: dependency CSS can pass while the hosted fixture never
renders planted `garden-flora`. The next red proves the fixture roles before auditing shared CSS.

## Guidance

- Use the exact query gate `semanticGrowth=demo`. Absence, an empty value or any unknown value mounts
  no demo and follows the current clean Studio path byte-for-byte.
- Treat the full pre-attempt semantic-growth describe block in `TreeViewShell.test.tsx` as a
  preservation floor. AUTHOR_TEST extends it in place and retains independent tests and
  discriminating assertions for clean/unknown query isolation, one public player/navigation,
  signed-proof remaining non-healthy while blooming and final-only healthy, land without a story
  marker, and the bounded `.tree-layout > .world-frame` host. Deleting, replacing, weakening,
  skipping, narrowing or consolidating any of that proof is red even when the focused command passes.
- Mount the public `SemanticGrowthWorldView`; never copy its player, controls, semantic keys, motion
  rules or reduced-motion handling into Studio.
- Give the demo a bounded in-map host: it may size within the available forest frame but may not
  expand the page, clip/cover its navigation or place Back/Next/Replay behind the SVG. All three
  controls remain visible and clickable throughout the six-frame walk.
- Supply one deterministic, static representative fixture with exactly six
  `WorldPresentationModel` frames. It exists only to stage UAT and performs no fetch, store read,
  subscription, mutation, clock-driven advance or Chapter 2 narration/pacing.
- Compose the fixture through the existing Studio path: deterministic representative story and
  capability data enter `buildWorld`, its real draw tiles enter `buildRelaxedCells`, and
  `worldToScene` receives the same permanent vegetation input before `buildScene`. Reuse the resulting
  coast paths, relaxed substrate, capability parcels, parcel flora and standing vegetation across
  the six frames. Do not hand-author `SceneInput`, a coast path, centroid/tree positions,
  `relaxedCells`, `drawTiles`, `decor` or `plants`; do not maintain a demo-only geometry builder.
- Add one fail-closed composition red in addition to the retained tests. Its executable/source
  assertions must cover every part of the composition boundary together: real source calls
  `buildWorld`, `buildRelaxedCells`, `worldToScene` and `buildScene`; source has no custom
  `SceneInput`, `COAST`, or hand-filled empty `relaxedCells`/`decor`/`plants`; the rendered proposed
  frame contains non-empty relaxed substrate, multiple capability parcels, parcel flora/permanent
  vegetation; and the public player receives stable composed framing other than `0 0 100 100`.
  Inspect actual imports/calls, source literals and rendered selectors/attributes. Comments or prose
  matches do not count, and a parcel-only assertion is invalid.
- Before any read-only app-surface CSS audit, add an independent executable host-fixture case. Mount
  the exact `?semanticGrowth=demo` proposed frame with explicit Vector/null and assert real planted
  `.story-tree .pop-motion-inner` plus `.garden-flora .pop-motion-inner`; mount it with a deterministic
  Storybook sheet that covers both roles and assert direct `image.story-tree` plus
  `image.garden-flora`. These are host render assertions, not selector literals: all four must arise
  from the demo's own deterministic, non-empty `SceneVegetationInput` passed through `worldToScene`.
  `.parcel-flora`, CSS rules for an absent role, comments or DOM from another fixture cannot
  substitute. Source-audit rejects `const VEGETATION: SceneVegetationInput = {}`. IMPLEMENT may only
  populate that existing fixture input with the existing Studio vegetation vocabulary; it may not
  change app-surface motion/source, `SceneView`, renderer/art policy, assets or production inputs.
  The later choreography and exact-frame dependency CSS proofs remain mandatory but cannot satisfy
  this host-local red.
- Add an anchored-motion host red to the retained integration walk. Snapshot the composed
  coast/substrate/parcel/standing-object placement transforms, advance, Back and Replay, and prove
  those settled world anchors and the stable non-100 framing do not shift. Assert entering terrain
  reveals/grows in place, flora/tree scale from planted/root anchors with the existing eased
  overshoot/stagger, claim enters locally and uses its real orbit, and bloom pulses radially at its
  proof anchor. A whole-scene, whole-terrain/island or complete asset/flora lateral slide is red.
- Do not accept equal SVG `transform` attributes as sufficient anchor proof. The executable test must
  inspect the shared semantic-growth CSS/source (without widening the declared write globs) and reject
  full `transform:` declarations in arrival/pulse selectors or keyframes applied to positioned
  terrain, flora/tree, claim or bloom elements. It must positively find additive individual `scale:`
  with `transform-box: fill-box`, an appropriate ground/root origin and the intended layer stagger,
  or verify the existing `.pop-motion-inner` composition keeps outer mapped placement effective
  throughout computed animation. Claim and bloom remain localized under the same rule.
- Preserve the exact already-landed `.pop-motion-inner` as the host's placement-safe seam. Assert
  executable `SceneView` output and shared CSS target that exact class; reject a class mismatch,
  comments-only match, another wrapper, full CSS `transform:` replacement or lateral entry. That
  seam and additive scale do not finish the proof. Fail if terrain, tree/flora, plate and parcels use
  one selector/keyframe/timing profile as their sole whole-object treatment. Prove land locally
  forms/reveals coast/substrate, then proposed grows planted tree/flora from ground contact before
  plate/parcels resolve with ordered nonzero local offsets. At least two identity subroles use
  materially distinct existing role-scoped scale, opacity, mask/clip reveal or transform idioms.
  Claim stays local with mapper orbit; bloom stays a local proof pulse; all motion settles one-shot.
  Reduced mode removes timing, concealment and orbit and renders the same final role semantics and
  outer placement transforms immediately.
- Make that choreography assertion CSS-resolved and renderer-complete. From independently rendered
  Studio role hooks, build `resolvedProfile(selector)` over the shared app-surface stylesheet:
  parse animation shorthand positional tokens and every longhand with longhand precedence; resolve
  name, duration, easing, delay, iteration and fill; load that name's actual comment-free
  `@keyframes`; and canonicalize declarations by offset. Selector declarations, animation names,
  DOM existence, delays or numeric scale endpoints alone are insufficient. CSS resolution must
  succeed for Vector tree/flora `.pop-motion-inner` and Storybook direct
  `image.story-tree`/`image.garden-flora` hooks. Compare plate versus planted and directly compare
  ungrouped parcel-boundary versus parcel-flora canonical bodies; both pairs are non-equivalent and
  at least one differs in keyframed property set. Planted tree/flora starts first; parcel boundary
  starts at least 100 ms later; earliest parcel flora starts at least 60 ms after boundary with at
  least two deterministic per-item `:nth-*` or custom offsets; plate starts at least 180 ms after
  planted. Planted growth is anchored scale plus opacity; parcel flora is rooted scale plus opacity;
  parcel boundary is opacity/reveal with no scale; plate is opacity plus vertical-only individual
  `translate:` with no scale. Bloom resolves from shorthand/longhand precedence to iteration exactly
  `1`, finite fill and an explicit terminal rest state. Full `transform:`, lateral translation, a
  new wrapper, `SceneView` change or second renderer remains red.
- Add a separate executable selector audit over that same shared CSS. Each full-motion arrival must
  be qualified by exactly one entering frame: terrain=`land`; tree/flora/plate/parcel-boundary/
  parcel-flora=`proposed`; wisp=`claimed`; bloom=`signed-proof`. Generic
  `[data-semantic-growth-frame][data-motion='full']` arrival targeting is red. Terrain/identity
  arrivals cannot match claimed, signed-proof or healthy; claim cannot arrive on signed-proof or
  healthy; bloom cannot arrive on healthy; nothing arrives on healthy. Reduced mode renders every
  accumulated role immediately without arrival, orbit or delayed concealment.
- Keep the real gate on the existing Studio seam:
  `apps/studio/src/components/TreeViewShell.test.tsx` authors the executable integration/source
  proof and `apps/studio/src/components/SemanticGrowthDemo.tsx` remains the fixture implementation
  source. The test may read `packages/app-surface/src/semantic-growth.css` and
  `packages/app-surface/src/SceneView.tsx` as read-only dependency evidence; neither enters the
  Studio gate's write scope. Do not move shared motion into Studio to make the host proof green.
- Derive one stable representative contain framing from that composed world's real bounds through
  the same world-framing vocabulary TreeView uses. Keep the full coast, substrate, parcel vegetation
  and standing objects visible with ordinary breathing room at every state. Do not pass a magic
  100x100 viewBox, crop to the tree/plate, or zoom independently per frame.
- Derive exactly these semantic deltas from that one composition: empty, then land with the real
  coast/substrate but no story marker, then the pale proposed/non-healthy story with its real parcels
  and vegetation, then its real claim/presence wisp without proof identity, then the same
  proposed/non-healthy story carrying the real signed-proof bloom, then healthy status. A claim never
  carries verdict/bloom identity and no pre-final frame may appear healthy.
- Mark only the entering delta with the shared player's existing renderer/art and SVG/code-native
  motion vocabulary. Terrain formation, planted identity growth, plate/parcel resolution, claim and
  proof must remain semantically distinct rather than aliases to one pop. Back and Replay reapply the
  same restrained trace. The demo owns no transform, keyframe or animation selector and never
  remounts a parallel scene player.
- Reuse TreeView's already-resolved `spriteSheet` and `artScale`: clean/default remains the
  owner-attested Storybook sheet; explicit `?artStyle=vector`, unknown style and uncovered kind use
  the existing fallback path. The demo owns no manifest request, resolver, asset or art policy.
- Keep the mount inside the existing forest/map host and visibly dedicated to the fixture. Do not
  extract or alter legend, inspector, chat, camera, chrome, layout or live controller behaviour.
- This is a witness stage, not a product controller. Do not add website code, Chapter 2 sequencing,
  artifact sync, production art, generated frame/sprite assets, a Nanobanana or
  sprite-frame/frame-sequence pipeline, a second renderer, a product-art fork, animation frames or a
  permanent navigation entry.

## Machine contracts

**Proof-preservation wall — applies before any numbered contract may pass.** Machine proof
source-audits the pre-attempt semantic-growth describe block in
`apps/studio/src/components/TreeViewShell.test.tsx`. It fails if any existing test/assertion is
deleted, replaced, weakened, skipped, narrowed, folded into a less discriminating replacement or
consolidated away. It must retain independent executable cases for: clean plus unknown query
isolation; one public six-frame player and navigation; signed-proof non-healthy plus bloom and
final-only healthy; land with no story marker; and `.tree-layout > .world-frame` host containment.

**Composition-red floor — applies before IMPLEMENT.** In addition to those retained cases,
AUTHOR_TEST adds executable/source-discriminating assertions for all of the following in one coherent
red: calls to `buildWorld`, `buildRelaxedCells`, `worldToScene` and `buildScene`; absence of a custom
`SceneInput`, `COAST`, and hand-authored empty `relaxedCells`/`decor`/`plants`; rendered proposed-state
evidence of non-empty relaxed substrate, multiple parcels and parcel flora/permanent vegetation; and
stable composed framing that is not `0 0 100 100`. The test inspects real source syntax and rendered
selectors/attributes, never comments/prose. A parcel-only green is invalid.

**Host-fixture renderer-participation red — independent and first.** Before any dependency CSS audit,
AUTHOR_TEST renders the exact query-gated proposed frame twice. Explicit Vector/null must expose
`.story-tree .pop-motion-inner` and `.garden-flora .pop-motion-inner`; a deterministic Storybook
sheet covering tree plus flora must expose direct `image.story-tree` and `image.garden-flora`.
All four hooks must originate from `SemanticGrowthDemo`'s own deterministic non-empty
`SceneVegetationInput` composed through `worldToScene`; `.parcel-flora` cannot substitute. Executable
source proof rejects `const VEGETATION: SceneVegetationInput = {}`. The red must fail before reading
shared app-surface CSS. IMPLEMENT may only populate that existing fixture input with existing Studio
vegetation vocabulary. Shared motion/source, `SceneView`, renderer/art policy and assets remain
unchanged. The authored-choreography and entering-frame dependency CSS reds below are both still
mandatory, but neither can pass this host-local floor.

**Anchored-motion host red — applies to the `ffcdc24` correction.** The retained integration test
adds executable rendered/source assertions that reject lateral entry translation of the whole
scene, whole terrain/island or complete asset/flora group. It compares settled composed transforms
and framing across forward, Back, Replay and reduced motion, and positively observes in-place terrain
growth, root-anchored flora/tree scale, localized claim entrance/orbit and localized radial bloom.
Studio contributes no keyframe, generated animation asset, sprite-frame pipeline or renderer.

**SVG transform-composition floor — part of the host red.** The machine proof reads real shared
CSS/source and fails full CSS `transform:` animation on mapper-positioned terrain, flora/tree, claim
or bloom elements, including scale-only keyframes. It positively proves additive `scale:` plus
fill-box/root origin/stagger, or the existing `.pop-motion-inner` composition preserving the outer
SVG placement transform for every animation frame. DOM `transform` attribute snapshots alone cannot
pass.

**Authored semantic-choreography host red — additive, no new scope.** The retained test preserves
real `SceneView` emission and CSS targeting of exact `.pop-motion-inner` as a placement floor and
rejects a second wrapper, full CSS `transform:`, lateral entry, class mismatch or comments-only
match. It discovers planted, plate, parcel-boundary, parcel-flora and bloom selectors independently
from the rendered Studio hooks and builds `resolvedProfile(selector)` by parsing animation shorthand
and precedence-winning longhands into name/duration/easing/delay/iteration/fill. The resolved
name—not the selector body—loads the actual comment-free `@keyframes`, canonicalized by offset and
property. CSS resolution must succeed for both Vector tree/flora `.pop-motion-inner` and Storybook
direct `image.story-tree`/`image.garden-flora`; DOM existence alone cannot pass. Plate/planted and
directly compared, ungrouped parcel-boundary/parcel-flora bodies are each non-equivalent, with at
least one pair differing in keyframed property set. Planted tree/flora starts first; parcel boundary
starts at least 100 ms later; earliest parcel flora starts at least 60 ms after boundary with at
least two deterministic per-item offsets; plate starts at least 180 ms after planted. Keyframes prove
anchored planted scale/opacity, rooted parcel-flora scale/opacity, no-scale parcel opacity/reveal and
no-scale plate opacity plus vertical-only individual `translate:`. Bloom resolves through
shorthand/longhand precedence to iteration exactly `1`, finite fill and a terminal rest state.
Claim stays local with mapper orbit; reduced motion immediately exposes identical final semantics
and placement. Names, selector bodies, delays, numeric scale endpoints, generic whole-object scale,
full `transform:`, lateral translation, another wrapper/renderer or a `SceneView` change are red.

**Entering-delta frame-scoping host red — independent, additive, no new scope.** A separate
executable shared-CSS selector audit requires full-motion terrain arrival rules to use exact frame
`land`; planted tree/flora, plate, parcel-boundary and parcel-flora exact `proposed`; wisp exact
`claimed`; and bloom exact `signed-proof`. Generic
`[data-semantic-growth-frame][data-motion='full']` arrival targeting fails. Terrain/identity arrivals
cannot match claimed, signed-proof or healthy; claim arrival cannot match signed-proof or healthy;
bloom cannot match healthy; and no arrival runs on healthy. Reduced motion has no matching arrival,
orbit or delayed concealment and immediately renders the same accumulated final semantics.

**Existing real-gate source seam — fixture-only.** AUTHOR_TEST edits
`apps/studio/src/components/TreeViewShell.test.tsx`; IMPLEMENT remains bounded to
`apps/studio/src/components/SemanticGrowthDemo.tsx` and the already-declared Studio host source.
Shared `packages/app-surface/src/semantic-growth.css` and
`packages/app-surface/src/SceneView.tsx` are read-only proof inputs, not Studio write seams. Any
Studio-owned animation rule or second renderer fails this floor.

1. **`sgsd-clean-studio-never-mounts-the-demo`**
   - **asserts —** without the exact flag, TreeView mounts its existing shared world and contains no
     semantic-growth fixture or Back/Next/Replay demo controls.
2. **`sgsd-flag-mounts-one-public-six-frame-player`**
   - **asserts —** `?semanticGrowth=demo#/tree` mounts exactly one public
     `SemanticGrowthWorldView` supplied with the exact six ordered keys inside a bounded host;
     it passes one stable representative framing derived from the composed world bounds, the whole
     island remains visible with breathing room, and neither rendered/source framing is the current
     literal `0 0 100 100`; Back/Next/Replay stay visible and clickable; Next walks every frame,
     Back reverses it and Replay returns to empty through that public component.
3. **`sgsd-fixture-is-static-and-semantically-honest`**
   - **asserts —** the fixture source reuses `buildWorld`, `buildRelaxedCells` and `worldToScene`
     and `buildScene` instead of constructing a custom `SceneInput`; executable source assertions
     reject the current four-point `COAST`, empty `relaxedCells`, empty `decor` and empty `plants`
     implementation. Before dependency CSS is read, an independent exact-host render rejects empty
     `VEGETATION` and proves proposed Vector has planted `.story-tree .pop-motion-inner` plus
     `.garden-flora .pop-motion-inner`, while a tree+flora Storybook sheet produces direct
     `image.story-tree` plus `image.garden-flora`; all originate in the demo's deterministic
     `worldToScene` vegetation input and parcel flora cannot substitute. Rendered-selector assertions
     prove the proposed frame has a generated organic
     coast, non-empty relaxed substrate, multiple capability parcels/parcel flora and the permanent
     Studio vegetation vocabulary; a parcel-only assertion cannot pass this contract. Land retains
     that real ground but no story marker; proposed is non-healthy; claimed adds real presence without
     proof identity; signed-proof remains proposed/non-healthy while carrying the proof bloom; healthy
     appears only last. Its transition trace is ground-arrival, flora-growth, claim-orbit and bloom
     rather than one generic scene-settle animation or whole-group lateral slide; settled world
     anchors remain equal through forward, Back, Replay and reduced motion, and source/computed proof
     rejects full CSS `transform:` replacement while preserving exact `.pop-motion-inner` as the
     placement seam. An executable shared-CSS resolver proves both Vector `.pop-motion-inner` and
     Storybook direct-image tree/flora participation, canonical referenced-keyframe/property
     differences for plate/planted and ungrouped parcel-boundary/parcel-flora, planted→boundary
     `100ms`, boundary→flora `60ms` plus two per-item offsets, planted→plate `180ms`, the exact
     anchored/no-scale role treatments, and bloom iteration exactly `1` settling at rest. A separate
     selector audit proves terrain arrives only on land; tree/flora/plate/parcels only on proposed;
     claim only on claimed; bloom only on signed-proof; no accumulated or healthy arrival matches;
     and reduced mode is immediate. Additive scale/fill-box/root origin may serve an appropriate role
     but generic whole-object scale, DOM-only renderer participation, selector-body/name/delay
     assumptions, full `transform:`, class names alone and comments-only matches are insufficient.
     The fixture contains no
     API/store/subscription, mutation, timer advance, generated frame/sprite assets, Nanobanana or
     frame-sequence pipeline, production/product-art fork, second renderer or Chapter 2 controller.
4. **`sgsd-reuses-studio-art-policy-without-a-second-resolver`**
   - **asserts —** the machine proof walks all six frames plus Back/Replay with TreeView's resolved
     Storybook sheet/art scale covering tree and flora, repeats the same trace with explicit Vector
     null/fallback, and observes the same semantic states; the demo imports no manifest loader and
     adds no art.
5. **`sgsd-existing-studio-behaviour-stays-green`**
   - **asserts —** the full Studio suite retains current selection, arrival/replay escape,
     Storybook/Vector fallback, legend, inspector, chat, camera and clean-route behaviour.

The fifth contract is the existing Studio regression wall observed after the new clean/flagged
integration cases green. The visible motion verdict remains the story's operator-held UAT leg.
