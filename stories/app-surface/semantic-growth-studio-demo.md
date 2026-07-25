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
# stagger or an inner wrapper that preserves outer placement throughout motion.
# INNER-WRAPPER VOCABULARY RED after c87382ba: the host proof binds to exact `.pop-motion-inner`
# emission/targeting and asserts individual scale, fill-box, center/root origins, Studio overshoot,
# nonzero stagger, local claim orbit and reduced-motion settlement; flat 320ms motion remains red.
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
   capabilities and Studio's permanent vegetation input; assert a generated organic coast,
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
   individual `scale:` with fill-box, ground/root origin and stagger, or an equivalent inner visual
   wrapper that leaves the outer placement transform effective throughout;
7. source-audit the already-landed inner seam: `SceneView` emits exact `.pop-motion-inner` and the
   shared CSS targets that exact class. Reject any full `transform:` in `arrive-ground`, `arrive-pop`
   or `bloom-pulse`; require individual `scale:`, `transform-box: fill-box`, centered ground and
   `center bottom` flora/tree/parcel roots (plate/bloom may center), the existing Studio overshoot
   `cubic-bezier(0.34, 1.45, 0.5, 1)`, and a nonzero inter-layer delay/stagger. Assert claim entry is
   local opacity with mapper orbit intact. Class mismatches and comments-only matches are red;
8. repeat the trace under reduced motion and assert the same final static transforms appear
   immediately without slide, travel, orbit, delayed concealment or changed framing;
9. repeat that full walkthrough with Studio's resolved Storybook default and
   `?semanticGrowth=demo&artStyle=vector#/tree`, asserting the host passes the existing sheet/null
   fallback rather than resolving or drawing art itself.
10. source-audit the retained pre-attempt semantic-growth describe block and fail unless its
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
After the valid outer/inner split at `c87382ba`, the CSS still used full transform scale, centered
origin and simultaneous flat 320 ms ease-out without fill-box, root anchoring, stagger or overshoot.
The final red proves the exact existing wrapper carries the real in-game vocabulary; it adds no seam.

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
  or verify an inner visual wrapper whose outer mapped placement transform stays effective throughout
  computed animation. Claim and bloom remain localized under the same rule.
- Bind the host proof to the exact already-landed `.pop-motion-inner` seam. Assert executable
  `SceneView` output contains that exact class and shared CSS targets it; reject a class mismatch,
  comments-only match or another wrapper. Parse `arrive-ground`, `arrive-pop` and `bloom-pulse` and
  require individual `scale:` with no full `transform:`, `transform-box: fill-box`, centered ground,
  and `center bottom` roots for flora/tree/parcel pixels (plate/bloom may center). Require the existing
  Studio `cubic-bezier(0.34, 1.45, 0.5, 1)` overshoot and nonzero inter-layer delay/stagger rather
  than simultaneous flat 320 ms ease-out. Claim stays local opacity plus mapper orbit. Reduced mode
  renders the same settled inner scale/opacity and outer placement transforms.
- Derive one stable representative contain framing from that composed world's real bounds through
  the same world-framing vocabulary TreeView uses. Keep the full coast, substrate, parcel vegetation
  and standing objects visible with ordinary breathing room at every state. Do not pass a magic
  100x100 viewBox, crop to the tree/plate, or zoom independently per frame.
- Derive exactly these semantic deltas from that one composition: empty, then land with the real
  coast/substrate but no story marker, then the pale proposed/non-healthy story with its real parcels
  and vegetation, then its real claim/presence wisp without proof identity, then the same
  proposed/non-healthy story carrying the real signed-proof bloom, then healthy status. A claim never
  carries verdict/bloom identity and no pre-final frame may appear healthy.
- Mark only the entering delta with the shared player's existing app transforms: land uses ground
  arrival, proposed uses flora growth/pop, claimed uses the real claim entrance/orbit, and
  signed-proof uses the real bloom pulse. Back and Replay reapply the same trace. The demo owns no
  transform, keyframe or animation selector and never remounts a parallel scene player.
- Reuse TreeView's already-resolved `spriteSheet` and `artScale`: clean/default remains the
  owner-attested Storybook sheet; explicit `?artStyle=vector`, unknown style and uncovered kind use
  the existing fallback path. The demo owns no manifest request, resolver, asset or art policy.
- Keep the mount inside the existing forest/map host and visibly dedicated to the fixture. Do not
  extract or alter legend, inspector, chat, camera, chrome, layout or live controller behaviour.
- This is a witness stage, not a product controller. Do not add website code, Chapter 2 sequencing,
  artifact sync, production art, generated animation assets, sprite-frame/frame-sequence pipelines,
  a second renderer, a product-art fork, animation frames or a permanent navigation entry.

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

**Anchored-motion host red — applies to the `ffcdc24` correction.** The retained integration test
adds executable rendered/source assertions that reject lateral entry translation of the whole
scene, whole terrain/island or complete asset/flora group. It compares settled composed transforms
and framing across forward, Back, Replay and reduced motion, and positively observes in-place terrain
growth, root-anchored flora/tree scale, localized claim entrance/orbit and localized radial bloom.
Studio contributes no keyframe, generated animation asset, sprite-frame pipeline or renderer.

**SVG transform-composition floor — part of the host red.** The machine proof reads real shared
CSS/source and fails full CSS `transform:` animation on mapper-positioned terrain, flora/tree, claim
or bloom elements, including scale-only keyframes. It positively proves additive `scale:` plus
fill-box/root origin/stagger, or an inner wrapper that preserves the outer SVG placement transform
for every animation frame. DOM `transform` attribute snapshots alone cannot pass.

**Exact inner-wrapper vocabulary host red — additive, no new scope.** The retained test proves real
`SceneView` emission and CSS targeting of exact `.pop-motion-inner`; parses every named semantic
keyframe to reject full `transform:` and require individual `scale:`; and asserts fill-box,
ground-center versus flora/tree/parcel `center bottom` origins, the existing Studio overshoot, and a
nonzero inter-layer delay/stagger. It keeps claim opacity plus mapper orbit local and proves reduced
motion settlement. A second wrapper, class mismatch, flat simultaneous ease-out or comments-only
match is red.

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
     implementation. Rendered-selector assertions prove the proposed frame has a generated organic
     coast, non-empty relaxed substrate, multiple capability parcels/parcel flora and the permanent
     Studio vegetation vocabulary; a parcel-only assertion cannot pass this contract. Land retains
     that real ground but no story marker; proposed is non-healthy; claimed adds real presence without
     proof identity; signed-proof remains proposed/non-healthy while carrying the proof bloom; healthy
     appears only last. Its transition trace is ground-arrival, flora-growth, claim-orbit and bloom
     rather than one generic scene-settle animation or whole-group lateral slide; settled world
     anchors remain equal through forward, Back, Replay and reduced motion, and source/computed proof
     rejects full CSS `transform:` replacement in favor of additive `scale:` plus grounded
     origin/stagger on exact `.pop-motion-inner`. It positively asserts executable class
     emission/targeting, fill-box, ground-center and flora/tree/parcel root origins, Studio overshoot,
     nonzero stagger, local claim opacity/orbit and reduced-motion settlement. DOM
     transform-attribute equality, class mismatch and comments-only matches are insufficient. The
     fixture contains no API/store/subscription, mutation, timer advance, generated animation assets,
     sprite-frame pipeline, product-art fork, second renderer or Chapter 2 controller.
4. **`sgsd-reuses-studio-art-policy-without-a-second-resolver`**
   - **asserts —** the machine proof walks all six frames plus Back/Replay with TreeView's resolved
     Storybook sheet/art scale, repeats the same trace with explicit Vector null/fallback, and observes
     the same semantic states; the demo imports no manifest loader and adds no art.
5. **`sgsd-existing-studio-behaviour-stays-green`**
   - **asserts —** the full Studio suite retains current selection, arrival/replay escape,
     Storybook/Vector fallback, legend, inspector, chat, camera and clean-route behaviour.

The fifth contract is the existing Studio regression wall observed after the new clean/flagged
integration cases green. The visible motion verdict remains the story's operator-held UAT leg.
