---
id: "pixellab-island-growth-app-witness"
tier: capability
story: app-surface
arc: chapter2-pixellab-island-growth-arc
title: "The real app consumer stages the full-island growth witness behind an exact flag"
outcome: "An exact query-gated mode of Studio's real shared-app consumer presents the registered full-island growth track through the product player while the clean and unknown-query routes remain unchanged."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-studio-demo, pixellab-island-growth-track]
decisions: [273, 237, 219, 230, 70]
# The query gate stages an acceptance instrument inside the real consumer. It is not a Studio-owned
# renderer or state mapper: the host supplies representative read-only inputs to the same public
# component/track Chapter 2 uses. Hosted deployment and LOOK remain story-UAT evidence.
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

# The real app consumer stages the full-island growth witness behind an exact flag

**Outcome —** An exact query-gated mode of Studio's real shared-app consumer presents the registered
full-island growth track through the product player while the clean and unknown-query routes remain
unchanged.

## Proof walkthrough first

Extend the real `TreeView` consumer integration proof:

1. render the clean route and an unknown/near-miss query, proving each mounts the ordinary shared
   forest with no Chapter 2 witness controls, island track or changed controller state;
2. render the exact PixelLab-island witness query and prove `TreeView` mounts one public
   `SemanticGrowthWorldView`/standard island-growth track using the real shared scene mapper, not a
   host-local renderer, canvas movie, GIF/video or duplicate semantic cursor;
3. walk Next, Back and Replay twice and compare the public player's cue/progress/frame/anchor output;
   repeat under reduced motion and verify immediate settlement on the same retained island;
4. source-audit the Studio host, package graph and browser request fixture: no PixelLab client,
   credential, runtime model call, vendor URL or asset-owned timer enters the consumer; every growth
   frame request resolves to the checked-in app-surface asset set;
5. exercise representative desktop and mobile host sizes, proving the full island, root and coastline
   remain inside the world frame with reachable controls and no second responsive composition; and
6. preserve the existing Studio scene, selection, camera, inspector, chat, Storybook/Vector fallback
   and earlier semantic-growth demo regression suite outside the exact witness gate.

The post-merge hosted URL, its network/performance inspection and representative screenshots are
machine-observable story acceptance evidence. Whether the complete island looks alive and coherent
is a separate owner-only judgment.

## Guidance

- Reuse the real `TreeView` consumer and public app-surface component/state mapper. Host code may
  supply representative read-only semantic inputs and an exact query gate; it owns no animation
  clock, frame selector, renderer, asset resolver or Chapter 2 state model.
- Keep clean and unknown-query behaviour ordinary. Do not add a permanent navigation entry for this
  bounded witness.
- The visible controls must be the product's Next, Back and Replay controls. The flagged mode must not
  drive a hidden second cursor or use remounting to restart art.
- Use local packaged assets only and fail source/request audits on any PixelLab runtime dependency,
  hostname, credential or model invocation.
- Validate representative desktop and mobile viewports before handing over the hosted deep link.
  Supporting screenshots or inspection exports supplement the link; they never replace it.
- Do not self-sign LOOK. The owner decides whether the complete island art composes well enough for
  selective adoption after machine proof and real-URL verification.

## Machine contracts

1. **`pigaw-exact-flag-mounts-the-real-shared-player`**
   - **asserts —** only the exact witness flag mounts one public shared growth player/track inside
     real `TreeView`; its semantic model, progress/frame mapper and `SceneView` are imported from
     `@storytree/app-surface`, with no host-local renderer, movie or duplicate cursor.
2. **`pigaw-clean-and-unknown-routes-preserve-the-product`**
   - **asserts —** the clean route and unknown/near-miss query mount the ordinary forest without
     witness controls or track assets and preserve existing selection, camera, inspector, chat,
     scene and art-policy behaviour.
3. **`pigaw-navigation-and-reduced-motion-use-the-product-track`**
   - **asserts —** visible Next, Back and Replay drive the same public cue/progress/frame mapping on
     repeated traces; reduced motion immediately selects equivalent settled frames and the retained
     mature island without a remount or host timer.
4. **`pigaw-runtime-has-no-pixellab-dependency`**
   - **asserts —** Studio source, package dependencies and representative browser requests contain
     no PixelLab SDK/client, hostname, credential, secret or runtime model call; every track image is
     loaded from the versioned local app-surface asset set.
5. **`pigaw-desktop-and-mobile-keep-one-complete-island`**
   - **asserts —** representative desktop and mobile host sizes retain the whole registered coast,
     root and mature footprint inside the shared world frame with reachable controls, stable anchor
     and identical semantic/frame output; no viewport-specific renderer or composition is introduced.
6. **`pigaw-existing-studio-and-demo-contracts-stay-green`**
   - **asserts —** the full Studio command retains the clean map, shared scene, selection/controller,
     Storybook/Vector, semantic-growth demo, legend, inspector, chat and camera regression walls.
