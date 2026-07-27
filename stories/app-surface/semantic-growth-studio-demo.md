---
id: "semantic-growth-studio-demo"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "A query-gated Studio demo stages the persistent growth-timeline witness"
outcome: "An explicit `?semanticGrowth=demo` Studio flag mounts the public persistent-scene growth view over one primary island composed through Studio's real world pipeline, with island-local anchors and route geometry; clean Studio remains unchanged."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-replay-view]
decisions: [237, 93, 213, 215, 230, 70]
# WITNESS-HOST correction after the owner LOOK rejected #961: the fixture must compose one stable
# primary-island scene once, supply semantic events and explicit local anchors, and remove the fixed
# companion territory plus all per-frame group stripping. Shared app-surface owns the timeline.
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

# A query-gated Studio demo stages the persistent growth-timeline witness

**Outcome —** An explicit `?semanticGrowth=demo` Studio flag mounts the public persistent-scene
growth view over one primary island composed through Studio's real world pipeline, with island-local
anchors and route geometry; clean Studio remains unchanged.

## Role

This capability is the witness host for `semantic-growth-replay-view`, not a second animation unit.
Studio supplies deterministic fictional data, one stable composed scene, semantic events and
explicit anchors. The shared app-surface owns the timeline, CSS, renderer and controls.

PR #961's fixed companion story and source-local group stripping were deliberately landed as
scaffolding and rejected in owner LOOK. They are not accepted proof and are removed from the current
witness contract.

## Proof walkthrough

1. render clean Studio without the exact `semanticGrowth=demo` flag and prove its real shared map
   remains unchanged;
2. render `?semanticGrowth=demo#/tree` and prove exactly one public
   `SemanticGrowthWorldView` is mounted;
3. compose one representative primary island once through
   `buildWorld → buildRelaxedCells → worldToScene → buildScene`;
4. derive stable island-local terrain, planted-content, claim/proof and route anchors from that
   composed primary hierarchy;
5. supply the six ordered semantic meanings as events over that one model;
6. walk Next, Back and Replay and observe
   `nothing → island reveal → contents settle → route draw` without replacing the scene;
7. repeat with Storybook, explicit Vector and reduced motion.

## Fixture floor

- **One primary island only.** The fixture contains one story and its own capabilities. There is no
  companion story, dependency edge invented for visibility, second territory or companion-owned
  cell filtering.
- **Compose once.** `buildWorld`, `buildRelaxedCells`, `worldToScene` and `buildScene` execute for one
  stable scene model, not once per semantic event. The fixture does not construct a custom
  `SceneInput`, coast, substrate or vegetation replacement.
- **No scene surgery.** Remove `stripKind`, `clearGroundIdentity` and equivalent recursive filtering
  or attribute-clearing helpers. Timeline state must not be represented by deleting scene groups.
- **Island-local anchors.** Terrain reveal, tree/flora/plate settlement, claim/proof and route
  endpoints are explicit, deterministic and owned by the primary hierarchy. Their settled
  coordinates and painter order do not change through the walk.
- **Existing route renderer.** The stable model carries an existing `LaneLayout`/lane path whose
  endpoints are derived from the primary island's explicit anchors. The timeline reveals it with
  `laneMotion: draw`; Studio adds no path renderer or CSS.
- **Static and authority-free.** No API/store/subscription, mutation, timer-driven advance or live
  adapter enters the demo.
- **Current art only.** Reuse TreeView's resolved Storybook sheet/art scale and Vector fallback.
  There is no manifest loader, generated frame/sprite asset, Nanobanana request or local resolver.

## Honest red

Extend the existing `TreeViewShell` semantic-growth integration proof before implementation. It must
fail the current fixture because:

1. `buildFrames()` composes six complete scenes;
2. `stripKind`/`clearGroundIdentity` mutate groups between frames;
3. `COMPANION_STORY` and `dependsOn: [COMPANION_STORY_ID]` are required to produce the lane;
4. the mounted island subtree cannot retain DOM identity across Next/Back/Replay.

The red holds live references to primary-island nodes, walks the controls, and proves those exact
nodes persist. Regex/comments or equal serialized snapshots are insufficient. It also asserts there
is exactly one story/territory identity in the fixture and that the route's declared endpoints are
primary-island anchors.

## Machine contracts

1. **`sgsd-clean-studio-never-mounts-the-demo`**
   - **asserts —** without the exact flag, TreeView mounts its existing shared world and contains no
     semantic-growth fixture or Back/Next/Replay controls.
2. **`sgsd-flag-mounts-one-public-six-frame-player`**
   - **asserts —** the legacy contract id remains stable, but the flagged host now supplies six
     semantic events to one public persistent-scene player, not six models. One `WorldSceneView` and
     one primary island subtree remain mounted while controls expose the ordered meanings and four
     timeline cues.
3. **`sgsd-fixture-is-static-and-semantically-honest`**
   - **asserts —** the one primary island is composed once through the real Studio pipeline. Its
     ground, coast, parcels, tree/flora, plate, claim/proof hooks, art identity, anchors and painter
     order stay stable; the six meanings remain honest; route draw uses explicit primary-island
     endpoints. The source contains no companion, fabricated dependency, scene-group stripping,
     per-event scene composition or Studio-owned animation.
4. **`sgsd-reuses-studio-art-policy-without-a-second-resolver`**
   - **asserts —** the same persistent trace works with TreeView's Storybook/default and explicit
     Vector/fallback policy, preserving the same semantic states, anchors and route. The demo imports
     no manifest loader and adds no art.
5. **`sgsd-existing-studio-behaviour-stays-green`**
   - **asserts —** the full Studio suite retains current selection, arrival/replay escape,
     Storybook/Vector fallback, legend, inspector, chat, camera and clean-route behaviour.

Shared package persistence and timeline behaviour are proven by the owning capability. The visible
motion/ownership verdict remains the story's operator-held UAT-4; an agent never signs it.

## Historical proof residue

PR #958 established the query-gated witness and real shared renderer/art participation. PR #961
proved the shared 850 ms land profile and shared lane renderer, but its companion territory and
snapshot construction failed LOOK. The current witness keeps the reusable rails and removes that
rejected composition.
