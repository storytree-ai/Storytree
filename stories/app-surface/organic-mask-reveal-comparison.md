---
id: "organic-mask-reveal-comparison"
tier: capability
story: app-surface
arc: chapter2-pixellab-organic-growth-arc
title: "A continuous organic mask-reveal comparison runs in the real shared app"
outcome: "An exact query-gated real Studio mode exposes a bounded Chapter 2 comparison in which app-owned continuous normalized progress reveals two registered mature transparent PixelLab plates through structural masks over the retained native SVG island."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-studio-demo, svg-island-growth-track]
decisions: [274, 237, 219, 230, 70]
# EXPERIMENT, NOT AN ADOPTED DEFAULT. This disk node records one independently provable comparison;
# it confers no owner LOOK verdict and becomes live-PG-claimable only after the node itself lands.
proof:
  command:
    file: pnpm
    args: ["-r", "--filter", "@storytree/app-surface", "--filter", "studio", "test"]
  scope:
    testGlobs: ["packages/app-surface/src/organic-mask-reveal.test.tsx", "apps/studio/src/components/TreeViewShell.test.tsx", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["packages/app-surface/src/organic-mask-reveal.ts", "packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/WorldSceneView.tsx", "packages/app-surface/src/SceneView.tsx", "packages/app-surface/src/index.ts", "apps/studio/src/components/SemanticGrowthDemo.tsx", "apps/studio/src/components/TreeView.tsx", "packages/app-surface/src/assets/chapter2-organic-growth/mask-reveal-v1/**/*"]
  real:
    testFile: "packages/app-surface/src/organic-mask-reveal.test.tsx"
    sourceFile: "packages/app-surface/src/organic-mask-reveal.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/app-surface/src/organic-mask-reveal.test.tsx", "apps/studio/src/components/TreeViewShell.test.tsx", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["packages/app-surface/src/organic-mask-reveal.ts", "packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/WorldSceneView.tsx", "packages/app-surface/src/SceneView.tsx", "packages/app-surface/src/index.ts", "apps/studio/src/components/SemanticGrowthDemo.tsx", "apps/studio/src/components/TreeView.tsx", "packages/app-surface/src/assets/chapter2-organic-growth/mask-reveal-v1/**/*"]
    install: true
    proofCommand:
      file: pnpm
      args: ["-r", "--filter", "@storytree/app-surface", "--filter", "studio", "test"]
    typecheck:
      file: pnpm
      args: ["-r", "--filter", "@storytree/app-surface", "--filter", "studio", "typecheck"]
---

# A continuous organic mask-reveal comparison runs in the real shared app

**Outcome —** An exact query-gated real Studio mode exposes a bounded Chapter 2 comparison in which
app-owned continuous normalized progress reveals two registered mature transparent PixelLab plates
through structural masks over the retained native SVG island.

## Proof walkthrough first

Exercise the exact `?semanticGrowth=organic-mask-reveal#/tree` comparison and its public shared-app
implementation as one integration:

1. render clean Studio and a near-miss query before the exact flag, proving neither mounts the
   comparison, its controls or its organic mask layers;
2. render the exact query through real `TreeView`, `SemanticGrowthWorldView`, `WorldSceneView` and
   `SceneView`, proving the host supplies only the bounded fixture and uses no private renderer,
   cursor or replacement camera;
3. feed boundary and adjacent representative normalized progress values through the pure mask math,
   proving land, trunk, branch, foliage and plant channels are clamped, deterministic and continuous
   rather than discrete frame selection;
4. validate the two checked-in mature transparent PNG plates plus their manifest, fixed canvases,
   alpha bounds, provenance, normalization, root/ground sockets, mature footprints and finite
   runtime budgets;
5. compare early and mature renders, proving progress changes only bounded masks while world
   sockets, x/y registration, scale, native-land anchor and the established camera stay invariant;
6. inspect the shared scene order, proving app-native water/shadow and SVG island/coast/ground remain
   the substrate, ground plants precede the hero tree, and app-native trails/effects/labels/controls
   remain above the organic plates;
7. walk forward, Back and Replay twice, proving equal cue actions settle to equal app-owned progress,
   mask channels, socket positions and retained mature output;
8. repeat the walk under reduced motion, proving each cue settles immediately to the same semantic
   and mature state without an asset clock, remount key or alternate scene;
9. audit the runtime sources, checked-in manifest and representative browser requests, proving no
   PixelLab client, hostname, credential, model call, generated island/composite or authoring
   reference enters runtime, and proving two local requests remain within the declared encoded and
   decode/upload ceilings; and
10. open the hosted exact comparison at recorded representative desktop and mobile viewports,
    capturing the deployment URL, commit, viewport dimensions, request set and retained final scene
    so the owner receives machine evidence before making the separate LOOK judgment.

The focused package and Studio suites prove the deterministic comparison boundary. Hosted viewport
and request capture is a machine-observable deployment leg, not a substitute for the owner-held
aesthetic verdict. This capability stays `proposed` and must not be treated as the adopted Chapter 2
default while that verdict is absent.

## Guidance

- Keep one app-owned normalized progress value and derive every mask channel from it. Do not
  introduce frame indices, randomness, an asset clock or host-local timing.
- Treat the two mature PixelLab PNGs as appearance under app-owned masks. Do not generate or import
  island/coast frames, a full-scene composite, movie/GIF or a runtime vendor dependency.
- Keep root and plant sockets, normalized anchors, scale, camera, view box and mature footprint fixed
  across progress. Reject a plate that needs progress-specific compensation.
- Preserve the declared painter order: native land remains visible; `ground-plants` precedes
  `hero-tree`; existing app-native overlays and controls retain their slots.
- Keep the comparison behind only exact `semanticGrowth=organic-mask-reveal`. Do not make it the
  clean route, a permanent navigation entry or the adopted organic-growth default without a later
  owner verdict.
- Keep the real-build catalog in lockstep. `packages/cli/src/node-build.test.ts` must include
  `organic-mask-reveal-comparison`; this companion proves discoverability, not another implementation
  surface.
- Record desktop/mobile and request/budget evidence from the deployed real app. Do not label an
  expensive or not-yet-captured machine observation as `human`, and do not self-sign LOOK.

## Machine contracts

1. **`omrc-normalized-progress-continuously-drives-structural-masks`**
   - **asserts —** one clamped app-owned value in `[0,1]` deterministically drives continuous land,
     trunk, branch, foliage and plant mask channels; adjacent progress yields adjacent structural
     reveal and no frame index, randomness, timer or asset-owned cursor participates.
2. **`omrc-sockets-and-registration-remain-invariant-through-progress`**
   - **asserts —** early and mature states retain equal root/plant world sockets, x/y registration,
     normalized anchors, scale, native-land world anchor, camera and mature footprint; only mask
     coverage changes.
3. **`omrc-back-and-replay-settle-to-the-same-app-owned-trace`**
   - **asserts —** repeated forward, Back and Replay actions settle to equal cue, normalized progress,
     mask-channel, socket and retained-scene traces without remount-driven playback.
4. **`omrc-reduced-motion-settles-to-the-same-retained-scene`**
   - **asserts —** reduced motion removes interpolation and holds by settling each cue immediately,
     while preserving the same semantic state, mask result, socket registration and mature output.
5. **`omrc-exact-query-isolates-the-real-shared-comparison`**
   - **asserts —** only exact `?semanticGrowth=organic-mask-reveal` mounts the public mask comparison
     inside real `TreeView`; clean and near-miss routes retain the ordinary shared forest without
     comparison controls/assets, a host renderer or changed camera/controller state.
6. **`omrc-native-land-and-declared-painter-order-remain-authoritative`**
   - **asserts —** the existing app-owned SVG island/coast/ground remains visible in its established
     scene slot; registered `ground-plants` paint before `hero-tree`, and existing app-native
     trails/effects/labels/controls remain above them.
7. **`omrc-runtime-has-no-vendor-or-generated-land-dependency`**
   - **asserts —** runtime source, dependencies and representative requests contain no PixelLab
     client/hostname/credential/model call and no generated island, coast, complete-scene composite,
     authoring reference, movie/GIF or second renderer.
8. **`omrc-local-mature-plates-stay-within-the-recorded-budget`**
   - **asserts —** exactly two transparent checked-in mature PNGs load in two requests; their
     manifest stays aligned with the runtime registry at 25,164 encoded bytes and 1,572,864 decoded
     RGBA bytes, below ceilings of 65,536 encoded and 3,145,728 decode-plus-upload bytes.
9. **`omrc-hosted-desktop-and-mobile-evidence-precedes-look`**
   - **asserts —** the deployed exact real-app comparison records URL, commit, representative desktop
     and mobile viewport dimensions, local request set, budget observations and retained final scene
     before owner handoff; this machine evidence records no owner LOOK verdict and cannot adopt the
     comparison by itself.
