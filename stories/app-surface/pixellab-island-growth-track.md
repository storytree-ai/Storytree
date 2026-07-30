---
id: "pixellab-island-growth-track"
tier: capability
story: app-surface
arc: chapter2-pixellab-island-growth-arc
title: "A registered local full-island track grows at one planted app-owned anchor"
outcome: "The public app surface maps normalized semantic progress onto one registered local PixelLab-authored full-island frame track, preserving its world anchor and retained final scene under deterministic navigation and reduced motion."
status: proposed
proof_mode: integration-test
depends_on: [semantic-growth-replay-view]
decisions: [273, 237, 219, 230, 70]
# PixelLab supplies author-time appearance only. The writable product seam stays in the existing
# shared player/renderer; versioned PNGs and their metadata are curated inputs, never runtime vendor
# state. Asset generation and normalization are frontend/art work, not a second renderer.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/app-surface", "test"]
  scope:
    testGlobs: ["packages/app-surface/src/**/*island-growth*.test.ts", "packages/app-surface/src/**/*island-growth*.test.tsx", "packages/app-surface/src/SemanticGrowthWorldView.test.tsx", "packages/app-surface/src/SceneView.test.tsx"]
    sourceGlobs: ["packages/app-surface/src/**/*island-growth*.ts", "packages/app-surface/src/**/*island-growth*.tsx", "packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/SceneView.tsx", "packages/app-surface/src/index.ts", "packages/app-surface/src/assets/chapter2-island-growth/**/*"]
  real:
    testFile: "packages/app-surface/src/island-growth-track.test.tsx"
    sourceFile: "packages/app-surface/src/SemanticGrowthWorldView.tsx"
    editsExisting: true
    scope:
      testGlobs: ["packages/app-surface/src/island-growth-track.test.tsx", "packages/app-surface/src/SemanticGrowthWorldView.test.tsx", "packages/app-surface/src/SceneView.test.tsx"]
      sourceGlobs: ["packages/app-surface/src/**/*island-growth*.ts", "packages/app-surface/src/**/*island-growth*.tsx", "packages/app-surface/src/SemanticGrowthWorldView.tsx", "packages/app-surface/src/SceneView.tsx", "packages/app-surface/src/index.ts", "packages/app-surface/src/assets/chapter2-island-growth/**/*"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "typecheck"]
---

# A registered local full-island track grows at one planted app-owned anchor

**Outcome —** The public app surface maps normalized semantic progress onto one registered local
PixelLab-authored full-island frame track, preserving its world anchor and retained final scene
under deterministic navigation and reduced motion.

## Proof walkthrough first

Exercise one curated full-island asset set through the existing public semantic-growth view:

1. load the checked-in track manifest and decode every referenced local PNG;
2. verify prompt, model, generation identifier, licence/provenance note, source-to-normalized offset,
   fixed canvas, frame dimensions/count/order, island/ground anchor, tree root, ground sockets,
   mature footprint and painter-depth slot are present and internally consistent;
3. verify every frame and registered layer uses the same normalized coordinate system, so the coast,
   root, sockets and mature footprint remain planted without per-frame runtime compensation;
4. feed boundary and representative normalized progress values through the app-owned frame selector,
   proving equal semantic progress always selects the same frame and that the asset supplies no
   timer, random value, semantic cursor or vendor request;
5. walk Next, Back and Replay through the same semantic trace twice, comparing progress, frame index,
   world anchor, layer order and retained settled output at every stop;
6. repeat in reduced motion, proving interpolation and holds disappear while each cue immediately
   settles to the same final frame, including the normal retained mature island used after the intro;
7. render through the existing `SceneView` / `SemanticGrowthWorldView` path and prove the local track
   is an appearance layer under the existing world mapper, not a movie, remount clock, alternate
   semantic model or second renderer; and
8. assert a committed budget record covers compressed asset bytes, decoded RGBA memory, frame and
   layer counts, expected decode/frame-pacing target, plus one bounded capability-canopy seam
   assessment. The assessment may select registered variants or app-owned socket overlays, but must
   name a finite bound and must not require a sheet per story or capability count.

The visual quality of the island is not decided by this machine proof. This capability establishes
that the candidate art is local, registered, deterministic and composable; the story's hosted LOOK
leg remains owner-held.

## Guidance

- PixelLab is an author-time supplier only. Commit curated PNG assets plus prompt,
  model/generation/licence metadata; never commit a credential.
- One composite track or a small set of registered layer tracks is allowed. Every track shares one
  canvas and anchor model.
- Normalize crop, coast and root drift before import. Runtime transforms may place the one registered
  island in the world, but may not chase frame-specific drift.
- Keep semantic cues, normalized progress, easing, holds, frame selection, Next, Back, Replay,
  reduced-motion settlement and retained final state in the app. The sheet is appearance, never a
  clock or state machine.
- Use the existing shared renderer and product state mapper. Inspection GIFs/videos may be derived
  from the PNGs, but neither is runtime implementation or acceptance proof.
- Keep app-native water, shadows, UI, labels, effects or geometry wherever they compose more cleanly.
- Capability-count canopy correspondence is a recorded bounded assessment, not this spike's LOOK
  blocker. Do not generate an unbounded family before the single-island witness earns adoption.

## Machine contracts

1. **`pigt-assets-are-local-registered-and-provenanced`**
   - **asserts —** the manifest resolves only versioned local PNGs and records the source prompt,
     model, generation identifier, licence/provenance note, fixed frame size/count/order and every
     source-to-normalized offset; it contains no credential, remote PixelLab URL or animated clock.
2. **`pigt-frames-share-one-planted-coordinate-system`**
   - **asserts —** every decoded frame has the declared dimensions; every registered layer shares the
     canvas, island/ground anchor and depth vocabulary; normalized coast, tree root, ground sockets and
     mature footprint coordinates are invariant across frame selection with no frame-specific runtime
     compensation.
3. **`pigt-progress-selects-frames-deterministically`**
   - **asserts —** the pure app-owned mapper clamps normalized progress, uses the fixed declared order
     and returns the same frame index for the same cue/progress across mounts; timers, random values,
     remount keys, network calls and asset-owned cursors cannot influence selection.
4. **`pigt-navigation-and-reduced-motion-settle-equivalently`**
   - **asserts —** forward, Back and Replay traces yield equal cue/progress/frame/anchor sequences;
     reduced motion removes interpolation and delay but chooses the same settled frame for each cue;
     the mature result remains rendered as the normal final scene after playback.
5. **`pigt-track-composes-in-the-existing-scene-order`**
   - **asserts —** the track renders through the public shared player and real `SceneView` seam at its
     declared world anchor and painter slot; land, tree, foliage and detail respect support and depth
     order; no second renderer, movie element or alternate semantic model exists.
6. **`pigt-budget-and-canopy-assessment-stay-bounded`**
   - **asserts —** committed metadata records compressed bytes, decoded-memory estimate, canvas/frame/
     layer counts and the decode/frame-pacing target; the canopy assessment names a finite registered-
     variant or stable-socket-overlay bound and rejects an unbounded sheet-per-count family.
