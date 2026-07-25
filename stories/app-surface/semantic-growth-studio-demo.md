---
id: "semantic-growth-studio-demo"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "A query-gated Studio demo stages the semantic-growth witness"
outcome: "An explicit `?semanticGrowth=demo` Studio flag mounts the public semantic-growth view over one representative six-frame fixture with Back, Next and Replay while the clean Studio route remains unchanged."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-replay-view]
decisions: [237, 93, 213, 215, 230, 70]
# EDITS-EXISTING hosted-demo leaf. AUTHOR_TEST extends TreeViewShell.test.tsx with clean-vs-flagged
# integration cases. IMPLEMENT adds the smallest static SemanticGrowthDemo fixture component and
# mounts it from TreeView only when the explicit query flag is present. No other Studio surface moves.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/components/TreeViewShell.test.tsx"]
    sourceGlobs: ["apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/SemanticGrowthDemo.tsx"]
  real:
    testFile: "apps/studio/src/components/TreeViewShell.test.tsx"
    sourceFile: "apps/studio/src/components/TreeView.tsx"
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
over one representative six-frame fixture with Back, Next and Replay while the clean Studio route
remains unchanged.

## Proof walkthrough first

Extend the existing `TreeViewShell` integration proof:

1. render clean Studio with no `semanticGrowth` query key;
2. assert the ordinary shared world remains mounted and no semantic-growth demo/controls exist;
3. render `?semanticGrowth=demo#/tree`;
4. assert the bounded public `SemanticGrowthWorldView` is mounted over exactly
   `empty → land → proposed → claimed → signed-proof → healthy`, with controls visible and clickable;
5. walk all six frames with Next, assert exact semantic markers, then operate Back and Replay; and
6. repeat that full walkthrough with Studio's resolved Storybook default and
   `?semanticGrowth=demo&artStyle=vector#/tree`, asserting the host passes the existing sheet/null
   fallback rather than resolving or drawing art itself.

This has its own isolatable red→green after `semantic-growth-replay-view`: today `TreeView` ignores
the query and has no demo fixture. Green is one flag read, one small static fixture component and one
conditional mount. The clean path remains the regression observable.

## Guidance

- Use the exact query gate `semanticGrowth=demo`. Absence, an empty value or any unknown value mounts
  no demo and follows the current clean Studio path byte-for-byte.
- Mount the public `SemanticGrowthWorldView`; never copy its player, controls, semantic keys, motion
  rules or reduced-motion handling into Studio.
- Give the demo a bounded in-map host: it may size within the available forest frame but may not
  expand the page, clip/cover its navigation or place Back/Next/Replay behind the SVG. All three
  controls remain visible and clickable throughout the six-frame walk.
- Supply one deterministic, static representative fixture with exactly six
  `WorldPresentationModel` frames. It exists only to stage UAT and performs no fetch, store read,
  subscription, mutation, clock-driven advance or Chapter 2 narration/pacing.
- Build the fixture from existing `@storytree/forest-world` scene inputs and real semantic identities:
  empty, then land with no story marker, then a pale proposed/non-healthy story, then its real
  claim/presence wisp without proof identity, then the same proposed/non-healthy story carrying the
  real signed-proof bloom, then healthy status. A claim never carries verdict/bloom identity and no
  pre-final frame may appear healthy.
- Reuse TreeView's already-resolved `spriteSheet` and `artScale`: clean/default remains the
  owner-attested Storybook sheet; explicit `?artStyle=vector`, unknown style and uncovered kind use
  the existing fallback path. The demo owns no manifest request, resolver, asset or art policy.
- Keep the mount inside the existing forest/map host and visibly dedicated to the fixture. Do not
  extract or alter legend, inspector, chat, camera, chrome, layout or live controller behaviour.
- This is a witness stage, not a product controller. Do not add website code, Chapter 2 sequencing,
  artifact sync, production art, animation frames or a permanent navigation entry.

## Machine contracts

1. **`sgsd-clean-studio-never-mounts-the-demo`**
   - **asserts —** without the exact flag, TreeView mounts its existing shared world and contains no
     semantic-growth fixture or Back/Next/Replay demo controls.
2. **`sgsd-flag-mounts-one-public-six-frame-player`**
   - **asserts —** `?semanticGrowth=demo#/tree` mounts exactly one public
     `SemanticGrowthWorldView` supplied with the exact six ordered keys inside a bounded host;
     Back/Next/Replay stay visible and clickable; Next walks every frame, Back reverses it and Replay
     returns to empty through that public component.
3. **`sgsd-fixture-is-static-and-semantically-honest`**
   - **asserts —** land has no story marker; proposed is non-healthy; claimed adds real presence
     without proof identity; signed-proof remains proposed/non-healthy while carrying the proof bloom;
     healthy appears only last; the fixture contains no API/store/subscription, mutation, timer
     advance or Chapter 2 controller.
4. **`sgsd-reuses-studio-art-policy-without-a-second-resolver`**
   - **asserts —** the machine proof walks all six frames plus Back/Replay with TreeView's resolved
     Storybook sheet/art scale, repeats the same trace with explicit Vector null/fallback, and observes
     the same semantic states; the demo imports no manifest loader and adds no art.
5. **`sgsd-existing-studio-behaviour-stays-green`**
   - **asserts —** the full Studio suite retains current selection, arrival/replay escape,
     Storybook/Vector fallback, legend, inspector, chat, camera and clean-route behaviour.

The fifth contract is the existing Studio regression wall observed after the new clean/flagged
integration cases green. The visible motion verdict remains the story's operator-held UAT leg.
