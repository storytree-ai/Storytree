---
id: "semantic-growth-replay-view"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "The shared world view plays and replays one honest semantic growth sequence"
outcome: "A public app-surface growth view presents the six supplied world frames at one representative world framing and applies their deltas through the app's existing arrival, growth, claim and bloom transforms with deterministic Next, Back, Replay and reduced-motion rendering."
status: proposed
proof_mode: integration-test
depends_on: [studio-app-surface-adapter]
decisions: [237, 93, 213, 215, 230, 70]
# EDITS-EXISTING correction after human UAT-4 failed at 9377e897: the player hard-codes a 100x100
# viewBox and semantic-growth.css gives every changed role one generic settle animation. AUTHOR_TEST
# extends the existing focused test to reject that zoomed/slideshow implementation before IMPLEMENT
# reuses the existing app arrival/growth/claim/bloom vocabulary. Scope stays on the existing files.
# PROOF-PRESERVATION WALL: AUTHOR_TEST extends the full pre-9377 integration suite in place. Replacing
# it with a narrow framing test, or deleting/weakening/skipping/consolidating any existing assertion,
# is red even when the focused command exits zero.
# TWO-RED FLOOR: before implementation, AUTHOR_TEST adds two independent executable cases: stable
# representative framing AND a semantic-growth.css/source motion discriminator. A framing-only green
# is invalid even when every retained test passes.
# ANCHORED-MOTION RED after owner UAT-4 FAIL at ffcdc24: AUTHOR_TEST adds an independent additive
# CSS/source case rejecting whole-scene/whole-group lateral slides and proving in-place/root-anchored
# growth, localized claim entrance/orbit and localized bloom pulse with stable world anchors.
# SVG TRANSFORM FLOOR: unchanged transform attributes are insufficient. The red rejects CSS
# `transform:` animation on mapper-positioned elements and requires additive `scale:` plus box/origin,
# or an inner visual wrapper that never replaces the outer SVG placement transform.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/app-surface", "test"]
  scope:
    testGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.test.tsx", "packages/app-surface/src/SceneView.test.tsx"]
    sourceGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/semantic-growth.css", "packages/app-surface/src/index.ts", "packages/app-surface/src/SceneView.tsx"]
  real:
    testFile: "packages/app-surface/src/SemanticGrowthWorldView.test.tsx"
    sourceFile: "packages/app-surface/src/SemanticGrowthWorldView.tsx"
    editsExisting: true
    scope:
      testGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.test.tsx", "packages/app-surface/src/SceneView.test.tsx"]
      sourceGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/semantic-growth.css", "packages/app-surface/src/index.ts", "packages/app-surface/src/SceneView.tsx"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "typecheck"]
---

# The shared world view plays and replays one honest semantic growth sequence

**Outcome —** A public app-surface growth view presents the six supplied world frames at one
representative world framing and applies their deltas through the app's existing arrival, growth,
claim and bloom transforms with deterministic Next, Back, Replay and reduced-motion rendering.

## Proof walkthrough first

The existing integration test supplies six representative, already-built
`WorldPresentationModel` frames plus one stable representative world framing to the public
semantic-growth view:

1. render `empty`, then advance through `land`, `proposed`, `claimed`, `signed-proof`, `healthy`;
2. assert the exact fixture semantics: land has ground but no story marker; proposed introduces the
   pale/non-healthy story; claimed adds presence without proof identity; signed-proof remains
   proposed/non-healthy while carrying the real proof bloom; only the final frame is healthy;
3. add independent red A: mount inside a bounded host and assert all six frames keep one normal
   contain-style world framing with the representative coast, substrate and standing objects visible
   with breathing room; reject the current literal `viewBox="0 0 100 100"` and any per-frame zoom to
   the newest marker;
4. add independent red B before implementation: read `semantic-growth.css` and, where needed, the
   component source; fail the current `semantic-growth-settle` rule that groups `.hex-territory`,
   `.world-wisp`/`.world-claim-wisp`, `.world-bloom` and `.arrive-island` under one animation; then
   assert `land` is wired to the existing `arrive-ground` profile, `proposed` to `arrive-pop`,
   `claimed` to `wisp-in` plus the mapper's built-in orbit, and `signed-proof` to `bloom-pulse`.
   Named selector/keyframe assertions must discriminate those profiles; prose/comments do not count;
5. add independent anchored-motion red C: inspect executable CSS/source and fail while any transition
   laterally translates the world, scene, complete terrain/island, or complete asset/flora group.
   Assert terrain reveals/grows at its existing world coordinates; flora/tree scale from their
   planted/root anchors with the existing brief eased overshoot/stagger; claim enters locally then
   uses its existing orbit; bloom pulses radially at its existing proof anchor. Compare settled
   static placement transforms before/after, Back and Replay, and source-discriminate the animated
   property itself: a CSS `transform:` in an arrival/pulse selector or keyframe applied to a
   mapper-positioned SVG element is red because it visually replaces `transform="translate(...)"`
   during motion even when the DOM attribute is unchanged. Require additive individual `scale:` with
   `transform-box: fill-box`, the correct ground/root origin and stagger, or an inner visual wrapper
   whose outer placement transform remains effective for every computed animation frame;
6. click visible Back/Next/Replay controls through all six frames, Back to empty, replay the same
   action trace twice and compare every semantic snapshot and transition-family trace;
7. repeat under `prefers-reduced-motion: reduce`, compare the same semantic snapshots, assert
   animation/orbit instructions are absent, and assert every existing static SVG placement transform
   remains unchanged;
8. prove the public view itself loads its co-located app-owned stylesheet and that removing that load
   makes the motion proof fail; and
9. inspect the package boundary and normal-motion hooks, then let the package proof command rerun the
   existing renderer, sprite, sizing, trail and arrival regression suite.
10. source-audit `SemanticGrowthWorldView.test.tsx` against its pre-9377 suite and fail unless every
   existing test and assertion remains independently present: semantic-sequence/navigation,
   co-located stylesheet loading, reduced-motion static-transform preservation, bounded SVG,
   definite root-height chain, package-root export, and Storybook signed-proof bloom parity. The new
   framing and per-delta motion assertions extend that suite; they never replace or consolidate it.

Human UAT-4 failed the implementation at `9377e897`: its literal `0 0 100 100` viewBox crops a normal
Studio-composed island into an over-zoomed close-up, and one 320 ms fade/scale over territory, wisp,
bloom and arrival hooks reads as static scene swaps rather than in-game growth. The writable red
extends the existing test/source pair and must fail both defects before greening. The test does not
build a Chapter 2 controller, duplicate `SceneView`, synthesize art or reach into Studio/web.
The first promoted correction at `fcd6cf5` is not valid proof: it replaced the 309-line integration
suite with a 36-line framing-only test and thereby made green mean less. This correction must restore
the full pre-9377 proof surface before adding the new red.
The second promoted correction at `e7b55c0` is also invalid proof: it preserved the old suite but
added only stable framing, leaving the generic `semantic-growth-settle` slideshow untested and
unchanged. Both independent additive reds must exist before implementation begins.
Owner UAT-4 failed again at `ffcdc24`: the composition looked better, but whole asset groups sliding
laterally into place read like a PowerPoint transition. This correction changes motion only. The
world and every settled art anchor stay fixed; entering meaning grows/reveals at that anchor.
The next real-proof candidate exposed why attribute snapshots alone under-claim that failure: CSS
`transform: scale(...)` overrides an SVG element's mapper-authored `transform="translate(...)"` while
the animation runs, then the element appears to slide back when the CSS transform releases. The
proof must discriminate computed/source property composition, not merely unchanged DOM attributes.

## Guidance

- Accept exactly six ordered entries keyed `empty`, `land`, `proposed`, `claimed`, `signed-proof`,
  `healthy`, each carrying an already-normalized `WorldPresentationModel`. Fail closed on missing,
  duplicate or reordered keys; do not silently invent a frame.
- Prove the representative fixtures exactly: `land` contains the target ground but no tree, plate or
  other story marker; `proposed` introduces a proposed/non-healthy story; `claimed` adds the real
  claim/presence family without proof/bloom identity; `signed-proof` keeps that story proposed and
  non-healthy while adding the real proof bloom; `healthy` is the only healthy frame.
- Treat the pre-9377 `SemanticGrowthWorldView.test.tsx` suite as a preservation floor, not disposable
  scaffolding. AUTHOR_TEST must extend it in place and retain every existing test and assertion.
  Deleting, replacing, weakening, skipping, narrowing or consolidating those assertions is red,
  including when a shorter test covers the new framing defect and the command exits zero. The
  machine proof must source-audit retention of the semantic sequence/navigation, stylesheet-load,
  reduced-motion static-transform, bounded-host, definite-root-height, package-root-export and
  Storybook bloom-parity cases by their independent test bodies and discriminating assertions.
- Meet a fail-closed two-red floor before implementation: add one independent test for stable
  representative framing and a second independent test for semantic delta motion. A framing-only
  test/green, including the shape promoted at `e7b55c0`, is invalid. The motion test must execute a
  source/CSS read of `semantic-growth.css` and, if needed, `SemanticGrowthWorldView.tsx`; it must
  reject the current `semantic-growth-settle` selector grouping and positively discriminate the
  named `arrive-ground`, `arrive-pop`, `wisp-in` plus built-in SVG orbit, and `bloom-pulse` profiles
  on their respective entering deltas. Matching comments or restated prose is never evidence.
- Add an independent anchored-motion red for the `ffcdc24` owner failure. It reads executable
  CSS/source and rejects `translate`, `translateX` or `translateY` used as entry motion on the whole
  semantic-growth scene, terrain/island group, or complete flora/asset group. Static SVG
  translations used for world placement, ground anchors and nesting remain untouched and are not
  animation. Terrain reveals/grows in place; flora/tree scale from planted/root anchors with the
  already-established brief ease/overshoot and layer stagger; the claim uses a localized entrance
  followed by its mapper-owned orbit; the bloom uses its localized radial pulse. The test compares
  settled placement transforms across forward, Back and Replay and proves reduced motion renders
  those same final transforms immediately.
- For mapper-positioned SVG elements, forbid semantic-growth arrival/pulse rules and keyframes from
  animating the full CSS `transform` property. A source assertion must fail `transform: scale(...)`
  as well as `transform: translate(...)`: either replaces the element's SVG placement transform
  during animation even though `getAttribute('transform')` still reports the original translate.
  Use the additive individual `scale:` property with `transform-box: fill-box` and an appropriate
  ground/root `transform-origin`, preserving the existing ease/overshoot and layer stagger; or animate
  a dedicated inner visual wrapper while the outer mapper-authored placement wrapper remains static.
  Apply the same preservation rule to localized claim entrance and bloom pulse. Attribute equality
  alone is not proof; the machine test must inspect real CSS/source and verify the individual
  scale/origin/stagger or equivalent wrapper structure.
- Keep the cursor and transition selection pure. Next clamps at healthy, Back clamps at empty,
  restart selects empty, and Replay reapplies the same ordered keys. Time controls interpolation
  only; no timeout advances the cursor and no random value influences output.
- Accept one deterministic representative world framing alongside the six frames and hold it stable
  through the whole walk. It is the host's normal contain-style view of the composed world bounds,
  with ordinary breathing room around coast, substrate and standing objects; it is not a magic
  `0 0 100 100`, a crop around the current tree, or a frame-by-frame camera jump. The shared view
  remains authority-free: it consumes the framing and does not import Studio camera/controller code.
- Stay bounded by the supplied host. The root/SVG must not escape through viewport sizing or cover
  the controls; Back, Next and Replay remain visible, enabled click targets in normal layout at every
  frame and host size. The public root must itself participate in a definite host-height/min-height
  chain and reserve a separate control row (or an equivalent bounded composition), so the SVG sizes
  into the remaining space. A percentage `max-height` on the SVG against an auto-height root is not
  a bound: the proof must fail that combination because it can still push the controls outside the
  supplied host.
- Delegate every frame to the existing `WorldSceneView`. Reuse the scene's real territory, tree,
  claim-wisp, signed-proof/bloom and status identities. Do not fork `SceneView`, sprite resolution,
  scene construction or `@storytree/forest-world`.
- Sprite replacement must preserve semantic descendants owned by the replaced scene node. Replacing
  the `tree` visual with Storybook must retain the signed-proof `.world-bloom` overlay identity that
  Vector exposes; renderer choice may change artwork, never erase proof-bloom semantics.
- Own the semantic transition vocabulary in `@storytree/app-surface`, but reuse the app's already
  landed transforms rather than inventing a demo animation: coast/relaxed ground uses the existing
  `arrive-ground` scale `0.78 -> 1`, flora/tree/nameplate/parcels use `arrive-pop` scale `0.55 -> 1`,
  the claim uses the real `wisp-in` plus its existing SVG orbit, and signed proof uses the real
  `bloom-pulse` `0.94 <-> 1.06`. Apply each family only when that semantic role enters. Do not group
  territory, claim wisp, bloom and arrival under one new settle keyframe, remount the whole scene to
  fake motion, add an animation framework/game engine/raster sequence, or create new transform
  geometry/easing.
- Never translate the whole world, island/terrain group, or complete sprite/flora group laterally to
  announce a state. Keep every composed world coordinate and settled ground-contact transform stable.
  Reveal terrain where it lies; grow flora/tree from planted/root anchors; introduce the claim only
  around its local tree/island anchor before its existing orbit; pulse proof radially at its existing
  bloom anchor. Reuse current Storybook/Vector art and transform vocabulary only. Do not generate
  animation assets, add sprite-frame/frame-sequence manifests or pipelines, fork product art, create
  a second renderer, or move animation into website/Studio code.
- Resolve the browser's `prefers-reduced-motion` signal inside the shared surface (an explicit test
  override is allowed). Reduced mode suppresses animation, interpolated travel, scale sweeps, delayed
  hidden content and the real wisp's SVG orbit while rendering the same markers immediately. It must
  preserve the scene mapper's existing static SVG `transform` attributes used for placement, anchors
  and nesting; never apply a blanket `transform: none` to scene descendants. The preference never
  changes the cursor or supplied model.
- Keep product authority out. Inputs are plain frames plus optional navigation callbacks; there is no
  fetch, store, subscription, claim mutation, proof mutation, clock-selected semantic state, website
  selector or Chapter 2 pacing/script.
- Export the public seam from the package root. The public view itself imports/loads its co-located
  motion stylesheet, so a consumer cannot mount an inert semantic player by forgetting a separate
  CSS side effect. Motion rules live in the package, not in website or Studio CSS.
- Preserve current art and consumers through the full suite: Storybook remains clean/default; Vector
  remains the explicit, unknown-value and uncovered-kind fallback; existing Studio behaviour is
  observed by the dependent demo-host capability's clean-path regression gate.

## Machine contracts

**Proof-preservation wall — applies before any numbered contract may pass.** The machine proof
source-audits `packages/app-surface/src/SemanticGrowthWorldView.test.tsx` against the pre-9377 suite.
It fails if any existing test/assertion is absent, skipped, weakened, narrowed, folded into a less
discriminating replacement, or consolidated away. At minimum it must find independent executable
cases for: the six-state semantic/navigation trace; component-owned stylesheet load; reduced-motion
preservation of static SVG transforms; bounded SVG/visible controls; a definite root-height chain;
the package-root export; and Storybook tree replacement preserving the signed-proof `.world-bloom`.
The framing and per-delta motion reds are additional assertions in that retained suite.

**Two-red floor — applies before IMPLEMENT.** AUTHOR_TEST must introduce two separate executable
test cases in the retained suite: **A**, stable representative framing; and **B**, semantic-delta
motion. Case B reads `semantic-growth.css` and/or component source and asserts over actual selectors,
keyframe names and wiring. It fails while `semantic-growth-settle` groups territory, wisp/claim-wisp,
bloom and arrival hooks, and passes only when `arrive-ground`, `arrive-pop`, `wisp-in` plus the
mapper-owned orbit, and `bloom-pulse` are applied to land, proposed, claimed and signed-proof
respectively. A source audit that matches comments/prose, or a framing-only green such as `e7b55c0`,
fails this floor.

**Anchored-motion red — applies before the correction at `ffcdc24` may implement.** An additional
independent executable case reads real CSS/source and fails any whole-scene, whole-terrain/island or
whole-flora/asset entry keyframe containing lateral translation. It positively discriminates
in-place terrain reveal/growth, root-anchored flora/tree scale with the existing overshoot/stagger,
localized claim entrance plus built-in orbit, and localized radial bloom pulse. It also compares
settled static placement transforms through forward, Back, Replay and reduced motion. Comment/prose
matches do not satisfy this red.

**SVG transform-composition floor — part of anchored-motion red C.** The executable source/CSS
assertion fails any semantic-growth arrival or pulse selector/keyframe that sets the full
`transform:` property on mapper-positioned terrain, flora/tree, claim or bloom elements, including
`transform: scale(...)`. Passing requires either additive individual `scale:` with
`transform-box: fill-box`, the correct ground/root `transform-origin` and the existing stagger, or a
proved inner visual wrapper whose outer SVG `transform="translate(...)"` remains the effective
placement throughout animation. Merely comparing `getAttribute('transform')` before/after is red.

1. **`sgrv-six-ordered-frames-preserve-semantic-honesty`**
   - **asserts —** only the exact ordered key set is accepted; `land` has target ground but no story
     marker; `proposed` adds a proposed/non-healthy story; `claimed` adds real presence without
     bloom/verdict identity; `signed-proof` remains proposed/non-healthy while carrying the proof
     bloom; and healthy status appears only in the final frame.
2. **`sgrv-back-restart-replay-are-deterministic`**
   - **asserts —** in a bounded host, visible/clickable Next walks all six frames, visible/clickable
     Back walks toward empty and visible/clickable Replay returns to empty; equal inputs plus equal
     traces yield equal frame-key sequences, semantic DOM snapshots and transition-family traces;
     controls remain reachable and no timer/random/remount history changes the result. One supplied
     representative framing is unchanged across all six frames, contains the full representative
     world with breathing room, and the source contains no literal `viewBox="0 0 100 100"` or
     per-frame newest-marker crop. The root establishes a definite bounded layout and reserves the
     controls' row; an auto-height root plus percentage-only SVG cap is red.
3. **`sgrv-reduced-motion-keeps-identical-semantics-without-travel`**
   - **asserts —** a stubbed `prefers-reduced-motion: reduce` run yields the same six semantic
     snapshots as normal motion, emits no animation/orbit/interpolated-travel instruction, never hides
     settled state behind a delay, and preserves every static SVG placement `transform` from the
     normal semantic render.
4. **`sgrv-motion-and-authority-stay-in-the-shared-package`**
   - **asserts —** the public view loads `semantic-growth.css` itself; the test fails when that load
     is absent; normal motion uses the existing per-delta arrival-ground, arrival-pop, wisp
     entrance/orbit and bloom-pulse hooks/profiles. An independent executable motion test reads the
     real CSS/source, rejects `semantic-growth-settle` grouping over `.hex-territory`,
     `.world-wisp`/`.world-claim-wisp`, `.world-bloom` and `.arrive-island`, and positively asserts
     the named per-delta selector/keyframe wiring. A separate source/CSS case rejects whole-group
     lateral translation and proves stable world anchors, in-place terrain growth, root-anchored
     flora/tree scale, localized claim entrance/orbit and localized bloom pulse. It also rejects the
     full CSS `transform:` property on mapper-positioned animated elements and positively requires
     additive `scale:` plus fill-box/root origin/stagger or an equivalent inner-wrapper composition;
     DOM transform-attribute equality and comments/prose cannot satisfy either case. Transition rules
     and reduced-motion handling live under
     `packages/app-surface`; the view delegates to `WorldSceneView`; and its source imports no
     Studio/web module, live data/store authority, generated animation asset/frame pipeline, product
     art fork, Chapter 2 controller or duplicate renderer.
5. **`sgrv-existing-art-and-scene-contracts-do-not-regress`**
   - **asserts —** the full package command retains existing Storybook/Vector resolution and fallback,
     sprite sizing/anchors/depth order, semantic mapper, trail/arrival and event tests; the retained
     integration case plus focused `SceneView` regression prove Storybook replacement of `tree`
     preserves the same signed-proof `.world-bloom` overlay identity exposed by Vector. A green
     command after replacing the retained integration suite with a smaller framing-only test is red.

The fifth contract is a regression wall observed by the package command after the new integration
test greens; it does not ask the new test to duplicate the existing fixture matrices. Visible timing,
easing and legibility remain the story's operator-held UAT leg.
