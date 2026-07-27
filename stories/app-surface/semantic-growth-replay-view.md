---
id: "semantic-growth-replay-view"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "The shared world view reveals one persistent island and settles its story tree"
outcome: "A public app-surface growth view reveals one persistent island before bringing its story tree visibly from its planted anchor into the settled product state, with reduced motion showing the identical final hierarchy immediately."
status: building
proof_mode: integration-test
depends_on: [studio-app-surface-adapter]
decisions: [237, 93, 213, 215, 230, 70]
# EDITS-EXISTING correction after the owner LOOK rejected #961: independent complete scene
# snapshots, semantic group stripping and the companion-island dependency are the red. AUTHOR_TEST
# must first prove one mounted WorldSceneView/SceneView, stable island-local identity, an in-place
# island reveal, an authored non-teleporting story-tree entrance/settle, replay and reduced-motion
# equivalence. Wisps, paths and unrelated UI are regressions only. The existing renderer, art policy
# and regression suite remain the proof wall.
# REJECTED SIGNED CANDIDATE real-ms2zlkut @ 9a2c232: one appended compatibility-overload test is
# under-proof. It casts around the public type, checks text/selector presence only, never retains
# Element references, never walks Back, never exercises reduced motion, defines no anchors, carries
# no visible story-tree entrance, and leaves the full stable scene visible at `empty`. AUTHOR_TEST must add the complete
# three-case executable bundle below before CONFIRM_RED; a single all-in-one or source-regex case is
# invalid even if it makes the current proof command red.
# REJECTED SIGNED CANDIDATE real-ms30c2f4 @ 5396d95: three named cases are still under-proof and the
# package typecheck is RED. The component still accepts/selects six frame models; its tests only
# reuse one by fixture convention. "Visibility" is asserted only through boolean data attributes
# while every pixel stays visible. Anchors are current-frame-derived string ids, omit terrain/
# story-tree anchor coordinates, and fabricates a route to `garden-cove`. That route is historical
# rejected scope, not a requirement of the corrected increment. This branch is not merged.
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

# The shared world view reveals one persistent island and settles its story tree

**Outcome —** A public app-surface growth view reveals one persistent island before bringing its
story tree visibly from its planted anchor into the settled product state, with reduced motion
showing the identical final hierarchy immediately.

## Owner-directed correction

PR #961 is landed scaffolding, not accepted animation. The owner LOOK rejected its composition
because six independently built semantic snapshots, selective scene-group stripping and a fixed
companion territory made the timing and ownership read misaligned and off-island. No UAT attestation
was recorded.

This is a defect correction inside the existing capability, not a successor capability. The
previous six semantic meanings remain honest:

`empty → land → proposed → claimed → signed-proof → healthy`.

They now cue one shared timeline instead of selecting six complete `WorldPresentationModel` scenes.
The current product-motion timeline is deliberately only:

`nothing → island reveal → story-tree entrance → story-tree settled`.

Several semantic events may resolve to the settled story-tree track. Time affects interpolation
only; it never invents, skips or owns semantic state. The latest owner LOOK removes wisp, pathway
and unrelated UI choreography from this increment: those surfaces remain unchanged regressions,
not steps in the provable journey.

The public contract must make persistence structural: exactly one `model` plus semantic events and
explicit anchors. Retaining a `frames`-only implementation and merely passing the same model six
times in a test is red because a consumer can still supply six snapshots.

## One provable journey

Mount the public view with one stable `WorldPresentationModel`, one ordered semantic-event trace and
the primary story tree's planted anchor. From `empty`, advance through all six meanings and observe
the four product-motion tracks:

1. `nothing` keeps the stable scene mounted while the island-local hierarchy is unrevealed;
2. `land` cues `island reveal` at the island's own terrain anchor;
3. `proposed` cues a visibly authored story-tree entrance from its planted anchor rather than
   switching the tree from absent to fully settled;
4. the remaining meanings retain that same tree and resolve its final story-node presentation
   without remounting or teleporting it.

Back and Replay reset and repeat the same track order over the same scene. Reduced motion resolves
each cue immediately and reaches the identical final hierarchy, semantic state, art choice and
planted coordinates.

## Design and ownership floor

- **One persistent render.** `SemanticGrowthWorldView` mounts one `WorldSceneView`, which mounts the
  existing `SceneView`. Advancing, reversing and replaying must not swap `model.scene`, rebuild a
  scene snapshot, change the React key or remount the island subtree.
- **Stable island-local hierarchy.** Terrain, coast and the story tree have stable semantic ids,
  painter order and ancestry under one primary-island root. No recursive group stripping or
  identity clearing creates a state.
- **Planted story-tree anchor.** The timeline receives or derives one deterministic island-local
  ground-contact anchor for the story tree. Its entrance and settlement target that anchor without
  changing the settled coordinate or the existing painter-Y model.
- **Semantic events cue tracks.** The ordered domain meanings remain inspectable, but their effect
  on product motion is a pure deterministic cue fold. Consumers may choose when an event advances;
  they may not select DOM nodes, author keyframes or pass a replacement scene.
- **The story tree does not teleport.** Full motion gives the tree a nonzero, visibly distinct
  entrance and settlement at its planted anchor after the island reveal. The island reveal remains
  independently paced and longer than the tree entrance; exact timing and easing stay in LOOK.
- **Reduced motion settles identically.** It removes interpolation, concealment, orbit and delayed
  settlement, not meaning. The normal and reduced terminal DOM/semantic snapshots differ only in
  motion metadata.
- **Shared product authority only.** Timeline types, cue folding, selectors and reduced-motion rules
  live in `@storytree/app-surface`. Studio and Chapter 2 supply semantic events and staged data only.
- **One renderer and current art.** Reuse `WorldSceneView`/`SceneView`, Storybook/default,
  Vector/fallback, current sprite anchors and masks/transforms. Do not add a second
  renderer, website-local product animation or a parallel Studio animation path.
- **Paths, wisps and unrelated UI stay out.** This increment neither authors nor proves pathway
  drawing, wisp motion, legend, inspector, chat, controls choreography or other chrome. Existing
  behaviour on those surfaces is only a regression wall.
- **No generated art.** New cutouts, frames or generated assets remain out. They require a later
  story-author-approved bounded manifest brief proving silhouette deformation cannot be expressed
  by the existing transform/mask/stroke vocabulary.

## Honest red

AUTHOR_TEST extends the existing focused integration suite before implementation and fails the
current #961 shape for independently executable reasons:

1. the public API still requires six complete models and selects `frame.model`;
2. the rendered island/coast/content nodes do not retain object identity across the trace;
3. the story tree becomes fully visible without a distinct entrance/settlement at its planted
   anchor;
4. no inspectable island-reveal/story-tree cue fold exists;
5. reduced-motion proof compares snapshot states rather than the same persistent hierarchy.

The red must hold references to the island root and representative descendants before advancing,
then prove those exact nodes remain connected and identical through Next, Back and Replay. Source
text, comments, equal serialized snapshots or unchanged SVG `transform` attributes alone do not
prove persistence.

**Three-case AUTHOR_TEST completion floor.** Before implementation, the focused test file must add
all three independent executable cases below; each must fail current HEAD for its named behavioural
reason. One case, a type cast, comments, source regex or simple `querySelector(...).toBeTruthy()`
cannot substitute for the bundle.

1. **Persistent hierarchy + planted anchor.** Mount the proposed public API with one stable model,
   six semantic events and an explicit island-local story-tree ground-contact anchor. Retain actual
   `Element` references for the primary island root, representative terrain and story tree at
   `nothing`. Walk every key and assert strict reference identity (`toBe`), connection, ancestry,
   semantic ids and the same inspectable anchor coordinate at every stop. String story ids alone
   are red.
2. **Island reveal + authored tree entrance.** Prove exact cue order. At `nothing`, the persistent
   island and tree nodes remain mounted but visually unrevealed; at `island-reveal`, terrain reveals
   while the tree remains unrevealed; at `story-tree-entrance`, the same tree follows a real
   nonzero-duration shared CSS track from its planted anchor; at `story-tree-settled`, that same
   element rests at the mapper-authored ground-contact placement. Merely changing root data
   attributes while the tree jumps from hidden to its final pixels is red. The proof resolves the
   participating selector/keyframes or equivalent computed visibility and distinguishes entrance
   from settlement. Island reveal remains independently paced and longer than tree entrance without
   prescribing an operator-owned exact duration.
3. **Back/Replay + reduced settlement.** Walk forward, Back to `nothing`, Replay, then the same trace
   under reduced motion. Retained island/tree references and the planted anchor must remain
   identical.
   Reduced motion must expose each cue's settled visibility immediately, carry no interpolating
   class/orbit/delay, and finish with the same semantic key, hierarchy, ids/status classes, art,
   planted coordinate and story-tree state as normal motion.

## Implementation boundary

The smallest green may reshape `SemanticGrowthWorldView` and its co-located CSS and public exports.
It may add pure types/helpers inside that existing package scope. `SceneView` changes are permitted
only when the stable story-tree anchor cannot be expressed through its current semantic DOM;
they may not create a second render path.

The Studio host is fixture glue for the operator witness. Its correction is specified by
`semantic-growth-studio-demo`; it does not become a second animation implementation or a second
provable unit.

## Machine contracts

1. **`sgrv-six-ordered-frames-preserve-semantic-honesty`**
   - **asserts —** the retained six domain meanings are unique and ordered, but are supplied as
     semantic events over one stable model. They deterministically cue exactly
     `nothing`, `island-reveal`, `story-tree-entrance`, `story-tree-settled`; healthy meaning
     appears only at the terminal state.
   - **asserts —** one island root plus representative terrain and story-tree descendants keep the
     same DOM identity, semantic ids, ancestry, painter order and planted anchor throughout. No
     complete-scene array, scene replacement, group stripping, companion story or remount key
     participates.
   - **asserts —** persistence does not mean premature visibility: `nothing` conceals the island
     and tree, `island-reveal` reveals terrain only, `story-tree-entrance` visibly introduces the
     same anchored tree, and `story-tree-settled` leaves it at its mapper-authored rest placement.
2. **`sgrv-back-restart-replay-are-deterministic`**
   - **asserts —** equal model/event/action traces yield equal semantic keys, cue phases, track
     targets and settled output. Back reverses toward `nothing`; Replay resets to `nothing` and
     repeats the same cue order without changing the mounted scene or planted anchor.
3. **`sgrv-reduced-motion-keeps-identical-semantics-without-travel`**
   - **asserts —** reduced motion skips interpolation, concealment, orbit and delayed settlement
     while exposing the same semantic states. At the terminal cue it has the same hierarchy, ids,
     classes/status, art selection, planted anchor and settled story tree as normal motion.
4. **`sgrv-motion-and-authority-stay-in-the-shared-package`**
   - **asserts —** the view loads shared CSS itself and owns the pure cue-to-track fold. Tracks use
     in-place island reveal plus a nonzero story-tree entrance/settlement that preserves the outer
     placement transform. The island reveal is independently paced and longer than the story-tree
     entrance. No Studio/web import, timer/random/store/fetch authority, consumer DOM targeting,
     second renderer, generated asset or frame-sequence pipeline exists. Wisp, path and unrelated
     UI choreography are absent from this increment.
5. **`sgrv-existing-art-and-scene-contracts-do-not-regress`**
   - **asserts —** the full package command retains Storybook/Vector resolution and fallback,
     sprite sizing/ground anchors/depth order, semantic selection events, trail/arrival behaviour,
     proof bloom preservation and existing scene-mapper tests.

Visible ownership, timing, easing and legibility remain the story's operator-held UAT-4. Machine
green cannot sign LOOK.

## Historical proof residue

PR #958 proved the six semantic meanings, shared renderer participation, deterministic controls and
reduced-motion state equivalence. PR #961 added an 850 ms land profile and reused the shared lane
renderer. Both are useful scaffolding; the #961 owner LOOK rejected their snapshot/companion
composition. The later owner correction removes that lane/wisp/UI choreography from the current
acceptance journey and keeps it only as regression history. Signed real run `real-ms2zlkut` at `9a2c232`
is also rejected proof residue: it introduced a stable-model overload and track attribute but did
not establish the planted anchor, visibility staging, retained reference identity or
reduced-motion equivalence required here, so its branch was not merged. Signed run
`real-ms30c2f4` at `5396d95` is likewise rejected and unmerged: despite three named cases it left
the frames-only contract intact, asserted metadata instead of visual concealment, fabricated a
missing-neighbour route id, omitted the coordinate anchor vocabulary, and ended typecheck-red. Its
route findings are historical rejection evidence, not current scope.
