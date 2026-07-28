---
id: "semantic-growth-studio-demo"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "A query-gated Studio demo stages the persistent island-and-tree witness"
outcome: "An explicit `?semanticGrowth=demo` Studio flag mounts the public persistent-scene view over one primary island composed through Studio's real world pipeline and witnesses trunk, branch and canopy progression into its settled story tree while clean Studio remains unchanged."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-replay-view]
decisions: [237, 93, 213, 215, 230, 70]
# WITNESS-HOST correction after the owner LOOK rejected #961: the fixture must compose one stable
# primary-island scene once, supply semantic events and the story tree's planted anchor, and remove
# the fixed companion territory plus all per-frame group stripping. Shared app-surface owns the
# island and tree-local trunk/branch/canopy motion; paths, wisps and unrelated UI are outside this
# witness. Whole-tree scale/fade cannot satisfy the host LOOK.
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
view over one primary island composed through Studio's real world pipeline and witnesses trunk,
branch and canopy progression into its settled story tree while clean Studio remains unchanged.

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
   `nothing → island reveal → trunk growth → branch growth → canopy accumulation → mature tree`
   without replacing the scene or scaling/fading one mature tree as the growth effect;
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
- **Story-node motion only.** The witness stages island reveal followed by tree-local trunk extent,
  branch extension and canopy-cluster accumulation inside the existing renderer. It adds no pathway,
  wisp, legend, inspector, chat or other UI choreography.
- **Static and authority-free.** No API/store/subscription, mutation, timer-driven advance or live
  adapter enters the demo.
- **Current art only.** Reuse TreeView's resolved Storybook sheet/art scale and Vector fallback.
  There is no manifest loader, generated frame/sprite asset, Nanobanana request or local resolver.

## Honest red

Extend the existing `TreeViewShell` semantic-growth integration proof before implementation. The
already-green single-scene/single-island/anchor assertions remain a preservation wall. The new red
fails `43f940c2` because the rendered story tree has no independently participating trunk, branch
and canopy growth parts; one mature `.pop-motion-inner` supplies all visible scale/fade motion.

The red holds live references to the primary-island tree root and real tree-local rig parts, walks
the controls, and proves increasing trunk extent, branch participation and canopy-cluster
participation. Regex/comments, duration checks, equal serialized snapshots or a nonzero whole-tree
scale are insufficient.

## Machine contracts

1. **`sgsd-clean-studio-never-mounts-the-demo`**
   - **asserts —** without the exact flag, TreeView mounts its existing shared world and contains no
     semantic-growth fixture or Back/Next/Replay controls.
2. **`sgsd-flag-mounts-one-public-six-frame-player`**
   - **asserts —** the legacy contract id remains stable, but the flagged host now supplies six
     semantic events to one public persistent-scene player, not six models. One `WorldSceneView` and
     one primary island subtree remain mounted while controls expose the ordered meanings and six
     island/tree growth cues.
3. **`sgsd-fixture-is-static-and-semantically-honest`**
   - **asserts —** the one primary island is composed once through the real Studio pipeline. Its
     ground, coast, story tree, art identity, planted anchor and painter order stay stable; the six
     meanings remain honest; the shared timeline reveals the island before progressing the same
     tree through trunk, branches, canopy and mature art. Rendered proof observes increasing
     tree-local geometry/participation, not a scaled/faded mature tree. The source contains no
     companion, fabricated dependency, scene-group stripping, per-event scene composition or
     Studio-owned animation.
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
Commit `43f940c2` retains the corrected persistent host and planted anchor, but its whole-tree
scale/pop is rejected LOOK scaffold only. The re-plan keeps that host and replaces only the tree
growth proof/behaviour.
