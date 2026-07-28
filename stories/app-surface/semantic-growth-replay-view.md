---
id: "semantic-growth-replay-view"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "The shared world view grows one persistent island's story tree from trunk to canopy"
outcome: "A public app-surface growth view keeps one island and story-tree root persistent while the tree's local geometry progresses from planted trunk through branches and canopy into the settled product tree, with reduced motion resolving each cue to the same completed topology."
status: building
proof_mode: integration-test
depends_on: [studio-app-surface-adapter]
decisions: [237, 93, 213, 215, 230, 70]
# EDITS-EXISTING correction after the owner LOOK rejected #961: independent complete scene
# snapshots, semantic group stripping and the companion-island dependency are the red. AUTHOR_TEST
# must first prove one mounted WorldSceneView/SceneView, stable island-local identity, an in-place
# island reveal, authored tree-local trunk/branch/canopy progression, replay and reduced-motion
# equivalence. Whole-tree scale/fade is red; wisps, paths and unrelated UI are regressions only.
# The existing renderer, art policy and regression suite remain the proof wall.
# REJECTED LOOK CANDIDATE 43f940c2 (2026-07-28): the persistent island and planted anchor stand,
# but scaling/fading one already-mature `.story-tree .pop-motion-inner` does not show a tree growing.
# This is a structural reset of the same capability, not another duration/easing correction.
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

# The shared world view grows one persistent island's story tree from trunk to canopy

**Outcome —** A public app-surface growth view keeps one island and story-tree root persistent while
the tree's local geometry progresses from planted trunk through branches and canopy into the settled
product tree, with reduced motion resolving each cue to the same completed topology.

## Owner-directed correction

PR #961 is landed scaffolding, not accepted animation. The owner LOOK rejected its composition
because six independently built semantic snapshots, selective scene-group stripping and a fixed
companion territory made the timing and ownership read misaligned and off-island. No UAT attestation
was recorded.

This is a defect correction inside the existing capability, not a successor capability. The
previous six semantic meanings remain honest:

`empty → land → proposed → claimed → signed-proof → healthy`.

They now cue one shared timeline instead of selecting six complete `WorldPresentationModel` scenes.
After the second owner LOOK rejected a scaled/faded mature tree as “still not an animation,” the
product-motion timeline is structurally reset to:

`nothing → island reveal → trunk growth → branch growth → canopy accumulation → mature tree`.

The six semantic meanings cue those six presentation tracks in order. Time affects interpolation
only; it never invents, skips or owns semantic state. Wisp, pathway and unrelated UI choreography
remain outside this increment: those surfaces are unchanged regressions, not steps in the provable
journey.

The public contract must make persistence structural: exactly one `model` plus semantic events and
explicit anchors. Retaining a `frames`-only implementation and merely passing the same model six
times in a test is red because a consumer can still supply six snapshots.

## One provable journey

Mount the public view with one stable `WorldPresentationModel`, one ordered semantic-event trace and
the primary story tree's planted anchor. From `empty`, advance through all six meanings and observe
the six product-motion tracks:

1. `nothing` keeps the stable scene mounted while the island-local hierarchy is unrevealed;
2. `land` cues `island reveal` at the island's own terrain anchor;
3. `proposed` grows the trunk upward from the planted ground-contact anchor;
4. `claimed` extends real branch geometry from trunk forks rather than scaling the mature crown;
5. `signed-proof` accumulates independently addressable canopy clusters around those branches; and
6. `healthy` resolves the same tree root to the current mature Storybook or Vector presentation.

Back and Replay reset and repeat the same track order over the same scene. Reduced motion resolves
each cue immediately to that cue's completed tree-local topology and reaches the identical mature
hierarchy, semantic state, art choice and planted coordinate.

## Design and ownership floor

- **One persistent render.** `SemanticGrowthWorldView` mounts one `WorldSceneView`, which mounts the
  existing `SceneView`. Advancing, reversing and replaying must not swap `model.scene`, rebuild a
  scene snapshot, change the React key or remount the island subtree.
- **Stable island-local hierarchy.** Terrain, coast and one story-tree root have stable semantic
  ids, painter order and ancestry under one primary-island root. The tree-local rig's trunk,
  branches and canopy clusters also have deterministic stable identities. No recursive group
  stripping, remount or identity clearing creates a state.
- **Planted story-tree anchor.** The timeline receives or derives one deterministic island-local
  ground-contact anchor for the story tree. Its entrance and settlement target that anchor without
  changing the settled coordinate or the existing painter-Y model.
- **Semantic events cue tracks.** The ordered domain meanings remain inspectable, but their effect
  on product motion is a pure deterministic cue fold. Consumers may choose when an event advances;
  they may not select DOM nodes, author keyframes or pass a replacement scene.
- **Growth changes local topology, not the mature tree's scale.** Full motion progressively changes
  the visible story-tree silhouette: trunk extent increases from the planted anchor, branch paths
  extend from real forks, and multiple canopy clusters accumulate around those branches. Scaling or
  fading one already-mature tree/crown—even with nonzero duration or overshoot—cannot pass.
- **Existing-renderer procedural rig first.** Prefer a tree-local rig inside the existing
  `SceneView`: path-length/mask/clip progression over the renderer's own trunk, branch and canopy
  geometry, with the current Storybook/Vector mature presentation as the terminal state. This is one
  semantic tree inside one renderer, not a second world renderer or consumer-owned animation.
- **The mature-art handoff is not the growth proof.** A terminal reveal/crossfade into the selected
  Storybook sprite or Vector tree may finish the track only after the procedural rig has already
  established trunk, branches and accumulating canopy. Fading in mature art alone is red.
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
- **Conditional manifest fallback only.** The two LOOK failures prove whole-object transform/opacity
  insufficient; they do not yet prove the existing renderer's tree-local geometry/mask/stroke
  vocabulary insufficient. No generated asset is authorized in this re-plan. Only if the procedural
  rig reaches machine green and then fails operator LOOK because its available geometry cannot carry
  a coherent growth silhouette may story-author approve a bounded manifest brief for this one
  story-tree slot—ordered trunk/branch/canopy layers or frames, anchors, settled handoff and
  reduced-motion fallback. Generated art would remain a conditional author-time source behind that
  brief, never a new renderer or state model.

## Honest red

AUTHOR_TEST extends the existing focused integration suite before implementation and fails the
current `43f940c2` scale/pop candidate for independently executable reasons:

1. the full-motion rule targets the already-mature `.story-tree .pop-motion-inner` as one object;
2. the tree exposes no stable addressable trunk, branch-segment and canopy-cluster growth rig;
3. visible path extent, branch participation and canopy silhouette do not increase over time;
4. scale/opacity plus overshoot do all visible work, so the mature topology exists from the start;
5. the proof accepts nonzero duration and anchored whole-object motion as “growth.”

The already-green persistent scene, stable anchor, island reveal and reduced-motion assertions stay
as a preservation wall. The new red additionally holds references to real tree-local growth parts
before advancing, then proves those exact parts progressively participate through Next, Back and
Replay. Source text, comments, equal serialized snapshots, duration checks or unchanged outer SVG
`transform` attributes alone do not prove growth.

**Three-case AUTHOR_TEST completion floor.** Before implementation, the focused test file must add
all three independent executable cases below; each must fail current HEAD for its named behavioural
reason. One case, a type cast, comments, source regex or simple `querySelector(...).toBeTruthy()`
cannot substitute for the bundle.

1. **Persistent hierarchy + planted rig.** Mount the proposed public API with one stable model,
   six semantic events and an explicit island-local story-tree ground-contact anchor. Retain actual
   `Element` references for the primary island root, representative terrain, story-tree root, trunk,
   branch segments and multiple canopy clusters at `nothing`. Walk every key and assert strict
   reference identity (`toBe`), connection, ancestry, semantic ids and the same inspectable planted
   anchor at every stop. String story ids or one opaque mature-tree group alone are red.
2. **Executable topology progression.** Prove exact cue order and real visual participation. At
   `nothing`, the persistent rig is mounted but visually unrevealed; `island-reveal` reveals terrain
   only; `trunk-growth` increases visible trunk path/extent from the planted anchor while branches
   and canopy remain unrevealed; `branch-growth` extends at least two branch paths from inspectable
   trunk forks; `canopy-accumulation` reveals multiple independently identified canopy clusters in
   deterministic order and increases the visible silhouette; `mature-tree` settles into the
   selected Storybook or Vector presentation at the same anchor. The proof reads real rendered
   geometry plus participating CSS/mask/path state and compares visible path extent, branch
   participation and canopy-cluster participation at each stop. A whole-tree `scale`/`opacity`
   keyframe, renamed pop, duration assertion, root data attribute or mature-sprite fade cannot pass.
3. **Back/Replay + reduced settlement.** Walk forward, Back to `nothing`, Replay, then the same trace
   under reduced motion. Retained island/tree/rig references and the planted anchor must remain
   identical. Reduced motion exposes each cue's completed local topology immediately, carries no
   interpolating class/orbit/delay, and finishes with the same semantic key, hierarchy, ids/status
   classes, mature art, planted coordinate and visible tree topology as normal motion.

## Implementation boundary

The smallest green may reshape `SemanticGrowthWorldView` and its co-located CSS and public exports.
It may add pure types/helpers inside that existing package scope. `SceneView` may expose one
tree-local procedural growth rig from the existing story-tree geometry—including the covered vector
body needed while Storybook is selected—and stable role hooks for trunk, branches and canopy
clusters. It may not create a second scene/world renderer, a consumer-local animation path or a new
art authority.

The Studio host is fixture glue for the operator witness. Its correction is specified by
`semantic-growth-studio-demo`; it does not become a second animation implementation or a second
provable unit.

## Machine contracts

1. **`sgrv-six-ordered-frames-preserve-semantic-honesty`**
   - **asserts —** the retained six domain meanings are unique and ordered, but are supplied as
     semantic events over one stable model. They deterministically cue exactly
     `nothing`, `island-reveal`, `trunk-growth`, `branch-growth`, `canopy-accumulation`,
     `mature-tree`; healthy meaning appears only at the terminal state.
   - **asserts —** one island root plus representative terrain, story-tree root, trunk, branch and
     canopy descendants keep the same DOM identity, semantic ids, ancestry, painter order and
     planted anchor throughout. No complete-scene array, scene replacement, group stripping,
     companion story or remount key participates.
   - **asserts —** persistence does not mean premature visibility: `nothing` conceals the island
     and tree, `island-reveal` reveals terrain only, `trunk-growth` increases trunk extent from the
     anchor, `branch-growth` extends real forks, `canopy-accumulation` adds multiple local clusters,
     and `mature-tree` leaves the selected product tree at its mapper-authored rest placement.
2. **`sgrv-back-restart-replay-are-deterministic`**
   - **asserts —** equal model/event/action traces yield equal semantic keys, cue phases, track
     targets and settled output. Back reverses toward `nothing`; Replay resets to `nothing` and
     repeats the same cue order without changing the mounted scene or planted anchor.
3. **`sgrv-reduced-motion-keeps-identical-semantics-without-travel`**
   - **asserts —** reduced motion skips interpolation, concealment, orbit and delayed settlement
     while exposing each cue's completed tree-local topology immediately. At the terminal cue it has
     the same hierarchy, ids, classes/status, mature art, planted anchor and visible topology as
     normal motion.
4. **`sgrv-motion-and-authority-stay-in-the-shared-package`**
   - **asserts —** the view loads shared CSS itself and owns the pure cue-to-track fold. Tracks use
     in-place island reveal plus tree-local path/mask/clip progression over stable trunk, branch and
     canopy parts while preserving the outer planted transform. Executable proof rejects a
     whole-tree scale/fade or terminal mature-art crossfade as the growth mechanism and observes
     increasing trunk extent, branch participation and canopy-cluster participation. No Studio/web
     import, timer/random/store/fetch authority, consumer DOM targeting, second renderer, generated
     asset or frame-sequence pipeline exists. Wisp, path and unrelated UI choreography are absent
     from this increment.
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

Commit `43f940c2` retained the corrected persistent model/events API, one mounted island, stable
terrain/story-tree anchors, island-local cueing, deterministic controls and reduced-motion
settlement. Those outcomes stand. Its visual growth implementation and proof do not: one fully
mature `.story-tree .pop-motion-inner` scales from `0.28` through overshoot to `1` while fading in.
The second owner LOOK rejected that whole-object pop as not actually animating a tree growing. This
increment is therefore re-planned around the existing-renderer procedural rig above; it is not
halted and it does not authorize generated art.
