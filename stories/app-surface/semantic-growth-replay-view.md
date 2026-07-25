---
id: "semantic-growth-replay-view"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "The shared world view plays and replays one honest semantic growth sequence"
outcome: "A public app-surface growth view applies the six supplied world-presentation frames through `WorldSceneView`, owns their transform/opacity treatment, and makes Next, Back, Replay and reduced-motion rendering deterministic."
status: proposed
proof_mode: integration-test
depends_on: [studio-app-surface-adapter]
decisions: [237, 93, 213, 215, 230, 70]
# EDITS-EXISTING reconciliation after the first real attempt created the declared files.
# AUTHOR_TEST extends SemanticGrowthWorldView.test.tsx to fail while the public view leaves its
# co-located stylesheet unloaded and to cover the semantic contracts below. IMPLEMENT makes the
# view itself load semantic-growth.css and closes the existing typecheck red. Scope stays package-local.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/app-surface", "test"]
  scope:
    testGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.test.tsx"]
    sourceGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/semantic-growth.css", "packages/app-surface/src/index.ts"]
  real:
    testFile: "packages/app-surface/src/SemanticGrowthWorldView.test.tsx"
    sourceFile: "packages/app-surface/src/SemanticGrowthWorldView.tsx"
    editsExisting: true
    scope:
      testGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.test.tsx"]
      sourceGlobs: ["packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/semantic-growth.css", "packages/app-surface/src/index.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "typecheck"]
---

# The shared world view plays and replays one honest semantic growth sequence

**Outcome —** A public app-surface growth view applies the six supplied world-presentation frames
through `WorldSceneView`, owns their transform/opacity treatment, and makes Next, Back, Replay and
reduced-motion rendering deterministic.

## Proof walkthrough first

The existing integration test supplies six representative, already-built
`WorldPresentationModel` frames to the public semantic-growth view:

1. render `empty`, then advance through `land`, `proposed`, `claimed`, `signed-proof`, `healthy`;
2. assert the exact fixture semantics: land has ground but no story marker; proposed introduces the
   pale/non-healthy story; claimed adds presence without proof identity; signed-proof remains
   proposed/non-healthy while carrying the real proof bloom; only the final frame is healthy;
3. mount inside a bounded host, click visible Back/Next/Replay controls through all six frames, Back
   to empty, replay the same action trace twice and compare every semantic snapshot;
4. repeat under `prefers-reduced-motion: reduce`, compare the same semantic snapshots, assert
   animation/orbit instructions are absent, and assert every existing static SVG placement transform
   remains unchanged;
5. prove the public view itself loads its co-located app-owned stylesheet and that removing that load
   makes the motion proof fail; and
6. inspect the package boundary and normal-motion hooks, then let the package proof command rerun the
   existing renderer, sprite, sizing, trail and arrival regression suite.

The first real attempt created the public player, test and stylesheet but left the stylesheet
unloaded, so the declared motion was inert and the package typecheck stayed red. The second writable
red extends that existing test/source pair: it must fail while the public view does not load its
stylesheet, then green when the view loads the package-owned rules and every semantic contract below
passes. The test does not build a Chapter 2 controller, duplicate `SceneView`, synthesize art or
reach into Studio/web.

## Guidance

- Accept exactly six ordered entries keyed `empty`, `land`, `proposed`, `claimed`, `signed-proof`,
  `healthy`, each carrying an already-normalized `WorldPresentationModel`. Fail closed on missing,
  duplicate or reordered keys; do not silently invent a frame.
- Prove the representative fixtures exactly: `land` contains the target ground but no tree, plate or
  other story marker; `proposed` introduces a proposed/non-healthy story; `claimed` adds the real
  claim/presence family without proof/bloom identity; `signed-proof` keeps that story proposed and
  non-healthy while adding the real proof bloom; `healthy` is the only healthy frame.
- Keep the cursor and transition selection pure. Next clamps at healthy, Back clamps at empty,
  restart selects empty, and Replay reapplies the same ordered keys. Time controls interpolation
  only; no timeout advances the cursor and no random value influences output.
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
- Own one semantic transition vocabulary in `@storytree/app-surface`: transform/opacity staging over
  the current arrival/growth, wisp, proof-bloom and proposed-to-healthy hooks. Prefer existing
  transforms and CSS capabilities; add no animation framework, canvas/game engine, raster frame
  sequence or new art.
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

1. **`sgrv-six-ordered-frames-preserve-semantic-honesty`**
   - **asserts —** only the exact ordered key set is accepted; `land` has target ground but no story
     marker; `proposed` adds a proposed/non-healthy story; `claimed` adds real presence without
     bloom/verdict identity; `signed-proof` remains proposed/non-healthy while carrying the proof
     bloom; and healthy status appears only in the final frame.
2. **`sgrv-back-restart-replay-are-deterministic`**
   - **asserts —** in a bounded host, visible/clickable Next walks all six frames, visible/clickable
     Back walks toward empty and visible/clickable Replay returns to empty; equal inputs plus equal
     traces yield equal frame-key sequences and semantic DOM snapshots; controls remain reachable and
     no timer/random/remount history changes the result. The root establishes a definite bounded
     layout and reserves the controls' row; an auto-height root plus percentage-only SVG cap is red.
3. **`sgrv-reduced-motion-keeps-identical-semantics-without-travel`**
   - **asserts —** a stubbed `prefers-reduced-motion: reduce` run yields the same six semantic
     snapshots as normal motion, emits no animation/orbit/interpolated-travel instruction, never hides
     settled state behind a delay, and preserves every static SVG placement `transform` from the
     normal semantic render.
4. **`sgrv-motion-and-authority-stay-in-the-shared-package`**
   - **asserts —** the public view loads `semantic-growth.css` itself; the test fails when that load
     is absent; transition hooks/rules and reduced-motion handling live under
     `packages/app-surface`; the view delegates to `WorldSceneView`; and its source imports no
     Studio/web module, live data/store authority, Chapter 2 controller or duplicate renderer.
5. **`sgrv-existing-art-and-scene-contracts-do-not-regress`**
   - **asserts —** the full package command retains existing Storybook/Vector resolution and fallback,
     sprite sizing/anchors/depth order, semantic mapper, trail/arrival and event tests.

The fifth contract is a regression wall observed by the package command after the new integration
test greens; it does not ask the new test to duplicate the existing fixture matrices. Visible timing,
easing and legibility remain the story's operator-held UAT leg.
