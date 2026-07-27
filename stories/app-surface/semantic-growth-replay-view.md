---
id: "semantic-growth-replay-view"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "The shared world view plays one persistent anchored 2.5D growth timeline"
outcome: "A public app-surface growth view carries one persistent island-local scene through deterministic semantic cues from nothing to island reveal, contents settlement and route draw; normal and reduced motion finish on the same hierarchy, anchors and semantic state."
status: building
proof_mode: integration-test
depends_on: [studio-app-surface-adapter]
decisions: [237, 93, 213, 215, 230, 70]
# EDITS-EXISTING correction after the owner LOOK rejected #961: independent complete scene
# snapshots, semantic group stripping and the companion-island dependency are the red. AUTHOR_TEST
# must first prove one mounted WorldSceneView/SceneView, stable island-local identity and explicit
# anchors, ordered deterministic timeline cues, no companion dependency, replay and reduced-motion
# equivalence. The existing renderer, art policy and regression suite remain the proof wall.
# REJECTED SIGNED CANDIDATE real-ms2zlkut @ 9a2c232: one appended compatibility-overload test is
# under-proof. It casts around the public type, checks text/selector presence only, never retains
# Element references, never walks Back, never exercises reduced motion, defines no anchors, carries
# no route, and leaves the full stable scene visible at `empty`. AUTHOR_TEST must add the complete
# three-case executable bundle below before CONFIRM_RED; a single all-in-one or source-regex case is
# invalid even if it makes the current proof command red.
# REJECTED SIGNED CANDIDATE real-ms30c2f4 @ 5396d95: three named cases are still under-proof and the
# package typecheck is RED. The component still accepts/selects six frame models; its tests only
# reuse one by fixture convention. "Visibility" is asserted only through boolean data attributes
# while every pixel stays visible. Anchors are current-frame-derived string ids, omit terrain/
# contents/claim/proof coordinates, and route to fabricated `garden-cove`. A hand-built route to an
# absent neighbour is the rejected trick in a new costume. This branch is not merged.
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

# The shared world view plays one persistent anchored 2.5D growth timeline

**Outcome —** A public app-surface growth view carries one persistent island-local scene through
deterministic semantic cues from nothing to island reveal, contents settlement and route draw;
normal and reduced motion finish on the same hierarchy, anchors and semantic state.

## Owner-directed correction

PR #961 is landed scaffolding, not accepted animation. The owner LOOK rejected its composition
because six independently built semantic snapshots, selective scene-group stripping and a fixed
companion territory made the timing and ownership read misaligned and off-island. No UAT attestation
was recorded.

This is a defect correction inside the existing capability, not a successor capability. The
previous six semantic meanings remain honest:

`empty → land → proposed → claimed → signed-proof → healthy`.

They now cue one shared timeline instead of selecting six complete `WorldPresentationModel` scenes.
The product-motion timeline is exactly:

`nothing → island reveal → contents settle → route draw`.

Several semantic events may resolve to the same timeline track. Time affects interpolation only; it
never invents, skips or owns semantic state.

The public contract must make persistence structural: exactly one `model` plus semantic events and
explicit anchors. Retaining a `frames`-only implementation and merely passing the same model six
times in a test is red because a consumer can still supply six snapshots.

## One provable journey

Mount the public view with one stable `WorldPresentationModel`, one ordered semantic-event trace and
explicit anchors for the primary island. From `empty`, advance through all six meanings and observe
the four product-motion tracks:

1. `nothing` keeps the stable scene mounted while the island-local hierarchy is unrevealed;
2. `land` cues `island reveal` at the island's own terrain anchor;
3. `proposed`, `claimed`, `signed-proof` and `healthy` settle the appropriate island-local contents
   at their planted, claim and proof anchors without replacing the scene;
4. the terminal cue draws an already-present route geometry from the primary island's explicit
   route anchors through the existing lane renderer.

Back and Replay reset and repeat the same track order over the same scene. Reduced motion resolves
each cue immediately and reaches the identical final hierarchy, semantic state, art choice, anchor
coordinates and route.

## Design and ownership floor

- **One persistent render.** `SemanticGrowthWorldView` mounts one `WorldSceneView`, which mounts the
  existing `SceneView`. Advancing, reversing and replaying must not swap `model.scene`, rebuild a
  scene snapshot, change the React key or remount the island subtree.
- **Stable island-local hierarchy.** Terrain, coast, planted tree/flora, parcels, plate, claim,
  proof bloom and route attachment points have stable semantic ids, painter order and ancestry
  under one primary-island root. No recursive group stripping or identity clearing creates a state.
- **Explicit anchors.** The timeline receives or derives deterministic island-local anchors for
  terrain reveal, planted contents, claim/proof and route endpoints. Tracks target those anchors
  without changing settled coordinates or the existing ground-contact/painter-Y model.
- **Semantic events cue tracks.** The ordered domain meanings remain inspectable, but their effect
  on product motion is a pure deterministic cue fold. Consumers may choose when an event advances;
  they may not select DOM nodes, author keyframes or pass a replacement scene.
- **The route belongs to the primary island.** Stable route geometry is present in the single scene
  model and is revealed from explicit primary-island anchors by the existing `SceneView` lane path.
  No fabricated neighbour, fixed companion territory or companion-owned geometry is required.
- **Reduced motion settles identically.** It removes interpolation, concealment, orbit and delayed
  settlement, not meaning. The normal and reduced terminal DOM/semantic snapshots differ only in
  motion metadata.
- **Shared product authority only.** Timeline types, cue folding, selectors and reduced-motion rules
  live in `@storytree/app-surface`. Studio and Chapter 2 supply semantic events and staged data only.
- **One renderer and current art.** Reuse `WorldSceneView`/`SceneView`, Storybook/default,
  Vector/fallback, current sprite anchors, masks/transforms and stroke drawing. Do not add a second
  renderer, website-local product animation or a parallel Studio animation path.
- **No generated art.** New cutouts, frames or generated assets remain out. They require a later
  story-author-approved bounded manifest brief proving silhouette deformation cannot be expressed
  by the existing transform/mask/stroke vocabulary.

## Honest red

AUTHOR_TEST extends the existing focused integration suite before implementation and fails the
current #961 shape for independently executable reasons:

1. the public API still requires six complete models and selects `frame.model`;
2. the rendered island/coast/content nodes do not retain object identity across the trace;
3. no explicit primary-island anchor contract or inspectable four-track cue fold exists;
4. route draw depends on a second story in the Studio fixture rather than primary-island anchors;
5. reduced-motion proof compares snapshot states rather than the same persistent hierarchy.

The red must hold references to the island root and representative descendants before advancing,
then prove those exact nodes remain connected and identical through Next, Back and Replay. Source
text, comments, equal serialized snapshots or unchanged SVG `transform` attributes alone do not
prove persistence.

**Three-case AUTHOR_TEST completion floor.** Before implementation, the focused test file must add
all three independent executable cases below; each must fail current HEAD for its named behavioural
reason. One case, a type cast, comments, source regex or simple `querySelector(...).toBeTruthy()`
cannot substitute for the bundle.

1. **Persistent hierarchy + explicit anchors.** Mount the proposed public API with one stable model,
   six semantic events and explicit island-local terrain, contents, claim/proof and route endpoint
   anchors. Retain actual `Element` references for the primary island root, representative terrain,
   planted content and lane path at `nothing`. Walk every key and assert strict reference identity
   (`toBe`), connection, ancestry, semantic ids and inspectable anchor coordinates at every stop.
   The current source has no anchors and must fail this case. Anchors carry inspectable coordinates
   for terrain, contents, claim, proof and both route endpoints; string story ids alone are red.
2. **Four-track visibility + route ownership.** Prove exact cue order. At `nothing`, the persistent
   nodes remain mounted but island pixels/contents/route are concealed by shared track state; at
   `island-reveal`, terrain reveals while contents and route remain concealed; at
   `contents-settle`, primary-island contents reveal/settle while the lane remains concealed; only
   `route-draw` exposes the same already-mounted lane with the existing `.trail-lane.is-drawing`
   treatment. Assert both route endpoints equal declared primary-island anchors and no companion or
   fabricated neighbour is present. The second route endpoint may be an island-local frontier point;
   it may not name an absent story. Merely changing root data attributes while all content stays
   visible is red: the test must resolve real shared CSS participation or visibility and fail while
   terrain/content/route pixels all remain exposed.
3. **Back/Replay + reduced settlement.** Walk forward, Back to `nothing`, Replay, then the same trace
   under reduced motion. Retained hierarchy/route references and anchors must remain identical.
   Reduced motion must expose each cue's settled visibility immediately, carry no interpolating
   class/orbit/delay, and finish with the same semantic key, hierarchy, ids/status classes, art,
   anchor coordinates and route geometry as normal motion.

## Implementation boundary

The smallest green may reshape `SemanticGrowthWorldView` and its co-located CSS and public exports.
It may add pure types/helpers inside that existing package scope. `SceneView` changes are permitted
only when an explicit stable anchor/route hook cannot be expressed through its current semantic DOM;
they may not create a second render path.

The Studio host is fixture glue for the operator witness. Its correction is specified by
`semantic-growth-studio-demo`; it does not become a second animation implementation or a second
provable unit.

## Machine contracts

1. **`sgrv-six-ordered-frames-preserve-semantic-honesty`**
   - **asserts —** the retained six domain meanings are unique and ordered, but are supplied as
     semantic events over one stable model. They deterministically cue exactly
     `nothing`, `island-reveal`, `contents-settle`, `route-draw`; claim remains distinct from proof,
     and healthy meaning appears only at the terminal state.
   - **asserts —** one island root and representative terrain/tree/flora/plate/claim/proof/route
     descendants keep the same DOM identity, semantic ids, ancestry, painter order and explicit
     anchor coordinates throughout. No complete-scene array, scene replacement, group stripping,
     companion story or remount key participates.
   - **asserts —** persistence does not mean premature visibility: `nothing` conceals island pixels,
     `island-reveal` reveals terrain only, `contents-settle` reveals island-local contents, and
     `route-draw` alone exposes the already-mounted primary-anchored lane.
2. **`sgrv-back-restart-replay-are-deterministic`**
   - **asserts —** equal model/event/action traces yield equal semantic keys, cue phases, track
     targets and settled output. Back reverses toward `nothing`; Replay resets to `nothing` and
     repeats the same cue order without changing the mounted scene or anchor identities.
3. **`sgrv-reduced-motion-keeps-identical-semantics-without-travel`**
   - **asserts —** reduced motion skips interpolation, concealment, orbit and delayed settlement
     while exposing the same semantic states. At the terminal cue it has the same hierarchy, ids,
     classes/status, art selection, anchors and route geometry as normal motion.
4. **`sgrv-motion-and-authority-stay-in-the-shared-package`**
   - **asserts —** the view loads shared CSS itself and owns the pure cue-to-track fold. Tracks use
     in-place reveal/rooted scale/opacity and the existing lane stroke draw without full placement
     transform replacement. No Studio/web import, timer/random/store/fetch authority, consumer DOM
     targeting, second renderer, generated asset or frame-sequence pipeline exists.
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
composition, which this current contract replaces. Signed real run `real-ms2zlkut` at `9a2c232`
is also rejected proof residue: it introduced a stable-model overload and track attribute but did
not establish the anchors, visibility staging, route ownership, retained reference identity or
reduced-motion equivalence required here, so its branch was not merged. Signed run
`real-ms30c2f4` at `5396d95` is likewise rejected and unmerged: despite three named cases it left
the frames-only contract intact, asserted metadata instead of visual concealment, fabricated a
missing-neighbour route id, omitted the coordinate anchor vocabulary, and ended typecheck-red.
