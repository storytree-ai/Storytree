---
id: "semantic-growth-studio-demo"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "A query-gated Studio demo stages the persistent island-and-tree witness"
outcome: "An explicit `?semanticGrowth=demo` Studio flag mounts the public persistent-scene view over one primary island composed through Studio's real world pipeline and witnesses its island reveal plus story-tree entrance while clean Studio remains unchanged."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-replay-view]
decisions: [237, 93, 213, 215, 230, 70]
# WITNESS-HOST correction after the owner LOOK rejected #961: the fixture must compose one stable
# primary-island scene once, supply semantic events and the story tree's planted anchor, and remove
# the fixed companion territory plus all per-frame group stripping. Shared app-surface owns the
# island and story-tree motion; paths, wisps and unrelated UI are outside this witness.
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

# A query-gated Studio demo stages the persistent island-and-tree witness

**Outcome —** An explicit `?semanticGrowth=demo` Studio flag mounts the public persistent-scene
view over one primary island composed through Studio's real world pipeline and witnesses its island
reveal plus story-tree entrance while clean Studio remains unchanged.

## Role

This capability is the witness host for `semantic-growth-replay-view`, not a second animation unit.
Studio supplies deterministic fictional data, one stable composed scene, semantic events and the
story tree's planted anchor. The shared app-surface owns the island/tree timeline, CSS and renderer.
Pathways, wisps and unrelated UI remain outside the witness journey.

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
4. derive the stable story-tree ground-contact anchor from that composed primary hierarchy;
5. supply the six ordered semantic meanings as events over that one model;
6. walk Next, Back and Replay and observe
   `nothing → island reveal → story-tree entrance → story-tree settled` without replacing the
   scene or teleporting the tree;
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
- **Planted story-tree anchor.** The tree's ground-contact anchor is explicit, deterministic and
  owned by the primary hierarchy. Its settled coordinate and painter order do not change through
  the walk.
- **Story-node motion only.** The witness stages island reveal followed by the tree's authored
  entrance/settlement. It adds no pathway, wisp, legend, inspector, chat or other UI choreography.
- **Static and authority-free.** No API/store/subscription, mutation, timer-driven advance or live
  adapter enters the demo.
- **Current art only.** Reuse TreeView's resolved Storybook sheet/art scale and Vector fallback.
  There is no manifest loader, generated frame/sprite asset, Nanobanana request or local resolver.

## Honest red

Extend the existing `TreeViewShell` semantic-growth integration proof before implementation. It must
fail the current fixture because:

1. `buildFrames()` composes six complete scenes;
2. `stripKind`/`clearGroundIdentity` mutate groups between frames;
3. `COMPANION_STORY` and `dependsOn: [COMPANION_STORY_ID]` add an unrelated second story;
4. the mounted island subtree cannot retain DOM identity across Next/Back/Replay.

The red holds live references to primary-island nodes, walks the controls, and proves those exact
nodes persist. Regex/comments or equal serialized snapshots are insufficient. It also asserts there
is exactly one story/territory identity in the fixture, the story tree has one inspectable planted
anchor, and full motion gives that tree a nonzero entrance rather than an immediate visibility jump.

## Machine contracts

1. **`sgsd-clean-studio-never-mounts-the-demo`**
   - **asserts —** without the exact flag, TreeView mounts its existing shared world and contains no
     semantic-growth fixture or Back/Next/Replay controls.
2. **`sgsd-flag-mounts-one-public-six-frame-player`**
   - **asserts —** the legacy contract id remains stable, but the flagged host now supplies six
     semantic events to one public persistent-scene player, not six models. One `WorldSceneView` and
     one primary island subtree remain mounted while controls expose the ordered meanings and four
     island/tree timeline cues.
3. **`sgsd-fixture-is-static-and-semantically-honest`**
   - **asserts —** the one primary island is composed once through the real Studio pipeline. Its
     ground, coast, story tree, art identity, planted anchor and painter order stay stable; the six
     meanings remain honest; the shared timeline reveals the island before visibly entering and
     settling that same tree. The source contains no companion, fabricated dependency, scene-group
     stripping, per-event scene composition or Studio-owned animation.
4. **`sgsd-reuses-studio-art-policy-without-a-second-resolver`**
   - **asserts —** the same persistent trace works with TreeView's Storybook/default and explicit
     Vector/fallback policy, preserving the same semantic states, planted anchor and settled tree.
     The demo imports no manifest loader and adds no art.
5. **`sgsd-existing-studio-behaviour-stays-green`**
   - **asserts —** the full Studio suite retains current selection, arrival/replay escape,
     Storybook/Vector fallback, legend, inspector, chat, camera and clean-route behaviour.

The fifth contract is a regression wall only: it does not make paths, wisps, legend, inspector,
chat, camera or route presentation part of the operator witness.

Shared package persistence and timeline behaviour are proven by the owning capability. The visible
motion/ownership verdict remains the story's operator-held UAT-4; an agent never signs it.

## Historical proof residue

PR #958 established the query-gated witness and real shared renderer/art participation. PR #961
proved the shared 850 ms land profile and shared lane renderer, but its companion territory and
snapshot construction failed LOOK. The current witness keeps the reusable rails and removes that
rejected composition. The later owner correction also removes lane/wisp/UI choreography from the
current acceptance journey; those surfaces remain historical scaffolding and ordinary regressions.
