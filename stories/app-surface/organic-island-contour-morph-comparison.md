---
id: "organic-island-contour-morph-comparison"
tier: capability
story: app-surface
arc: chapter2-pixellab-organic-growth-arc
title: "An app-native island contour-morph comparison runs in the real shared app"
outcome: "An exact query-gated real Studio mode compares app-native radial contour expansion of the existing SVG island against the landed pose-to-pose organic control for an owner-held reading of land growing from nothing."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-studio-demo, pixellab-organic-growth-tracks]
decisions: [274, 237, 219, 230, 70]
# EXPERIMENT, NOT AN ADOPTED DEFAULT. This disk node records one independently provable comparison;
# it confers no owner LOOK verdict and becomes live-PG-claimable only after the node itself lands.
proof:
  command:
    file: pnpm
    args: ["-r", "--filter", "@storytree/app-surface", "--filter", "studio", "test"]
  scope:
    testGlobs: ["packages/app-surface/src/organic-island-contour-morph.test.ts", "packages/app-surface/src/SceneView.test.tsx", "apps/studio/src/components/TreeViewShell.test.tsx"]
    sourceGlobs: ["packages/app-surface/src/organic-island-contour-morph.ts", "packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/SceneView.tsx", "packages/app-surface/src/index.ts", "apps/studio/src/components/SemanticGrowthDemo.tsx", "apps/studio/src/components/TreeView.tsx"]
  real:
    testFile: "packages/app-surface/src/organic-island-contour-morph.test.ts"
    sourceFile: "packages/app-surface/src/organic-island-contour-morph.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/app-surface/src/organic-island-contour-morph.test.ts", "packages/app-surface/src/SceneView.test.tsx", "apps/studio/src/components/TreeViewShell.test.tsx"]
      sourceGlobs: ["packages/app-surface/src/organic-island-contour-morph.ts", "packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/SceneView.tsx", "packages/app-surface/src/index.ts", "apps/studio/src/components/SemanticGrowthDemo.tsx", "apps/studio/src/components/TreeView.tsx"]
    install: true
    proofCommand:
      file: pnpm
      args: ["-r", "--filter", "@storytree/app-surface", "--filter", "studio", "test"]
    typecheck:
      file: pnpm
      args: ["-r", "--filter", "@storytree/app-surface", "--filter", "studio", "typecheck"]
---

# An app-native island contour-morph comparison runs in the real shared app

**Outcome —** An exact query-gated real Studio mode compares app-native radial contour expansion of
the existing SVG island against the landed pose-to-pose organic control for an owner-held reading of
land growing from nothing.

This is independent Round 2 Experiment 7: a comparison/owner-LOOK instrument, not an adoption or a
replacement for the clean product route.

## Proof walkthrough first

Exercise the exact `?organicGrowth=organic-island-contour-morph#/tree` comparison and its public
shared-app implementation as one integration:

1. render clean Studio and a near-miss query before the exact flag, proving neither mounts the
   comparison, its controls or its contour-growth treatment;
2. render the exact query through real `TreeView`, `SemanticGrowthWorldView`, `WorldSceneView` and
   `SceneView`, proving the host supplies only the bounded fixture and uses no private renderer,
   cursor, replacement camera or copied control track;
3. capture the existing mature SVG island/coast paths, parcel geometry, view box, world anchor and
   painter slot as the exact settled target, then prove the final contour output is byte- or
   coordinate-equivalent to that target rather than a scaled snapshot or redrawn approximation;
4. feed boundary, adjacent and representative normalized progress through the focused contour
   mapper, proving a tiny opaque seed grows by deterministic radial expansion and path interpolation
   while view box, camera, parcel anchor and finished-island scale remain invariant;
5. inspect every declared parcel and topology change, proving new lobes, coast segments or holes
   enter in one deterministic sequence without a shape snap, and prove the final coast settle
   converges exactly on the mature coastline;
6. compare early, intermediate and mature renders, proving changing geometry is the only land
   transition: no opacity cross-fade, hidden fade, radial wipe, raster land, complete-scene image or
   scale transform of the finished island participates;
7. run the landed Round 1 `organic-pose-to-pose` organic track beside the new land treatment through
   the same public player, registry, semantic inputs and app-owned clock, proving the control is
   reused rather than copied, regenerated or re-timed;
8. walk forward, Back and Replay twice, proving equal cue actions settle to equal semantic progress,
   interpolated contours, topology phase, coast state, sockets, organic control frame and retained
   mature scene;
9. repeat under reduced motion, proving each cue settles immediately to the same exact SVG geometry
   and pose-to-pose frame without interpolation delay, an asset clock or an alternate scene;
10. audit runtime sources, dependencies and representative browser requests, proving land remains
    app-native SVG and no PixelLab client, hostname, credential, model call, raster land asset or
    runtime generation enters the comparison; and
11. open the hosted exact comparison at representative desktop and mobile viewports, recording URL,
    commit, viewports, request set and retained final scene before the owner judges whether the
    contour morph reads as land growing from nothing or as a rubbery zooming blob.

The focused app-surface and real Studio suites prove only the bounded comparison boundary. Hosted
evidence makes the experiment available for owner LOOK; it neither supplies that judgment nor adopts
the technique. This capability and the parent story remain `proposed` while the verdict is absent.

## Comparison vocabulary

- **Contour morph** — continuous change of the island's SVG boundary between declared compatible
  contours while its camera, coordinate system and world placement remain fixed.
- **Radial expansion** — outward movement of contour points from the planted seed through geometry,
  not scaling a finished island image or sweeping a reveal mask across it.
- **Path interpolation** — deterministic correspondence and interpolation between declared SVG path
  points at normalized progress values.
- **Topology change** — a declared progress boundary where the outline gains or loses a parcel,
  lobe, coast segment or hole that cannot be expressed by point interpolation alone.
- **Coast settle** — the final bounded transition that reaches the exact existing mature coast path
  and leaves it as the retained scene.
- **Rubbery** — landmarks stretch or recoil as if joined by elastic material instead of accumulating
  into planted land.
- **Ballooning** — the whole silhouette inflates uniformly from its centre, reading as a scaled blob
  instead of structured parcel growth.
- **Melting edge** — coastline features smear, wobble or lose local identity during interpolation.
- **Radial wipe** — the mature island is merely uncovered by an expanding circular mask; this is not
  radial boundary expansion and fails the experiment.
- **Shape snap** — an undeclared discontinuous jump between contour or topology states.
- **Hidden fade** — opacity, blur, overdraw or another concealed cross-fade masks a geometry swap.

## Guidance

- Begin with a tiny opaque SVG seed and end on the exact current mature island/coast geometry. Keep
  the established view box, camera, world anchor, painter slot and finished-island scale invariant.
- Drive contour morph, radial expansion, path interpolation, topology changes and coast settle from
  one clamped app-owned normalized progress value. Declare deterministic parcel/topology order and
  stable point correspondence; do not rely on random points or frame-local repair.
- Fail the technique when it produces rubbery landmark drift, uniform ballooning, a melting edge,
  radial wipe, shape snap or hidden fade. Do not disguise those failures with opacity, blur, raster
  substitution or scaling of the mature snapshot.
- Reuse the landed pose-to-pose registry, assets, sockets and selector unchanged as the Round 1
  control. Do not duplicate its frames, add a second clock or alter its timing to flatter the new
  land treatment.
- Keep the comparison behind only exact `organicGrowth=organic-island-contour-morph`. Do not make it
  the clean route, a permanent navigation entry or the adopted island-growth default without a
  later owner verdict.
- Record desktop/mobile and request evidence from the deployed real app. Do not label the owner LOOK
  question as machine-observable, and do not self-sign it.

## Machine contracts

1. **`oicmc-mature-svg-geometry-and-world-registration-are-exact`**
   - **asserts —** settled output equals the existing mature SVG island/coast paths and parcel
     geometry while view box, camera, world anchor, painter slot and finished-island scale remain
     invariant across progress.
2. **`oicmc-opaque-seed-grows-by-contour-path-interpolation`**
   - **asserts —** one clamped app-owned value deterministically drives radial boundary expansion and
     path interpolation from a tiny opaque seed; no opacity cross-fade, hidden fade, radial wipe,
     raster land, mature-snapshot scale transform, random value, timer or asset cursor participates.
3. **`oicmc-topology-sequence-and-coast-settle-are-deterministic`**
   - **asserts —** parcels, lobes, coast segments and holes follow one declared topology sequence;
     equal progress selects equal contours and topology phase, transitions contain no undeclared
     shape snap, and coast settle reaches the exact mature coastline.
4. **`oicmc-round-one-pose-control-is-reused-unchanged`**
   - **asserts —** the comparison consumes the landed `organic-pose-to-pose` registry, local assets,
     sockets, selector, semantic inputs and app-owned clock without copied frames, regeneration,
     retiming or a second renderer.
5. **`oicmc-back-replay-and-reduced-motion-settle-equivalently`**
   - **asserts —** repeated forward, Back and Replay actions produce equal semantic-progress,
     contour, topology, coast, socket and pose-control traces; reduced motion immediately selects
     the same exact settled SVG geometry and organic frame.
6. **`oicmc-exact-query-isolates-the-real-shared-comparison`**
   - **asserts —** only exact `?organicGrowth=organic-island-contour-morph` mounts the public
     comparison inside real `TreeView`; clean and near-miss routes retain the ordinary shared forest
     without comparison controls, altered camera/controller state or a host-local renderer.
7. **`oicmc-runtime-has-no-vendor-or-raster-land-dependency`**
   - **asserts —** runtime source, dependencies and representative requests contain no PixelLab
     client/hostname/credential/model call and no raster island, coast, complete-scene composite,
     movie/GIF or runtime-generated path; the checked-in SVG and local Round 1 organic assets are the
     only visual inputs.
8. **`oicmc-hosted-comparison-evidence-precedes-look-and-adoption`**
   - **asserts —** the deployed exact real-app comparison records URL, commit, representative desktop
     and mobile viewports, request set and retained final scene before owner handoff; machine evidence
     records no owner LOOK verdict and cannot adopt contour morph by itself.
