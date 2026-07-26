---
id: "coalesced-camera-pan"
tier: capability
story: studio
arc: studio-map-responsiveness-arc
title: "A forest drag commits the camera once per display frame"
outcome: "An operator's forest drag commits the latest camera position at most once per display frame."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [240, 237]
# BROWNFIELD R1: TreeView already has drag panning, but every post-slop pointermove calls setCam.
# AUTHOR_TEST adds the fake-rAF integration proof first; it fails at HEAD because no frame boundary
# exists, then IMPLEMENT changes only the existing TreeView controller/chrome hot path.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/components/TreeView.pan.test.tsx", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/src/components/TreeView.tsx"]
  real:
    testFile: "apps/studio/src/components/TreeView.pan.test.tsx"
    sourceFile: "apps/studio/src/components/TreeView.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/TreeView.pan.test.tsx", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/src/components/TreeView.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # Studio component tests are Vitest + jsdom; the default node:test command cannot run this file.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/TreeView.pan.test.tsx"
---

# A forest drag commits the camera once per display frame

**Outcome —** An operator's forest drag commits the latest camera position at most once per display
frame.

## Why this is one capability

The operator has one journey: zoom out over the existing forest and drag it without the input burst
making the map fall behind their pointer. The scheduling boundary and the camera-neutral Studio chrome
are two parts of the same hot path: both begin with that drag, both protect the same rendered frame, and
both are observed through the camera transform remaining current without re-walking map-adjacent work.
They belong behind one narrow `TreeView` controller boundary rather than becoming a new scene graph or
another product surface.

This is a bounded increment of the existing `studio` story, not a new hosted story. The proof-bound
source remains `apps/studio/src/components/TreeView.tsx`, which the `studio` surface owns. Its existing
`studio → app-surface` cross-story edge already covers the shared `WorldSceneView` / memoized
`SceneView` it consumes; this increment adds no package edge.

## Guidance

- **Start from the measured hot path.** `TreeView.tsx:1837-1866` currently crosses drag slop, computes
  an incremental `panBy`, and calls `setCam` on every `pointermove`. At the reported zoomed-out scale,
  each state update makes React revisit the parent that contains the roughly 16.6k-node scene. Keep the
  latest drag position in controller-owned mutable state and schedule at most one camera commit with
  `requestAnimationFrame`; a burst before that callback must collapse to its cumulative latest delta.
- **Preserve the gesture contract.** Keep the existing slop, lazy pointer capture, click suppression,
  `atFitRef` transition, unanimated interactive camera, keyboard and wheel semantics. The final drag
  position must not be lost if the pointer releases before the next frame; cancellation and unmount must
  not leave a stale scheduled state update. This is an input-scheduling change, not a new camera model.
- **Keep camera-neutral chrome cold.** `StudioWorldChrome` is a sibling of `WorldSceneView` under the
  `.world-camera` group (`TreeView.tsx:2403-2438`) and currently has no camera input. Its world, hidden
  set, buildings flag and stamp callback must stay identity-stable across a camera-only update, and its
  render must be memo-bounded so a pan cannot redo its spokes/stamps/nameplate-key work. Do not move
  Studio chrome into `@storytree/app-surface` to achieve this.
- **Retain the earlier scene protection.** `@storytree/app-surface` already memoizes `SceneView`; the
  `WorldSceneView` adapter memoizes its scene context and `TreeView` keeps model/events stable for a
  camera-only update. That is complementary regression evidence, not a claim that the new coalescer is
  already proven. Do not rework the scene graph, its SVG identity, map density, or visual treatment.
- **Use a real component seam, not a benchmark claim.** Author
  `apps/studio/src/components/TreeView.pan.test.tsx` with the real `TreeView`, the existing
  `AppDataContext`/mocked-tree mount shape from `TreeViewShell.test.tsx`, and a controllable fake rAF.
  Its test titles must carry every contract id below so the coverage scan can bind them. jsdom can prove
  scheduling, final transform and chrome render isolation; it cannot honestly prove FPS, browser paint
  time or an owner-visible feel, so none are asserted here.
- **Keep the real-build catalog in lockstep.** Alongside the focused `TreeView.pan.test.tsx` proof, update
  `packages/cli/src/node-build.test.ts` so its exact REAL-buildable capability catalog includes
  `coalesced-camera-pan`. This required regression companion keeps the capability discoverable by the
  real-build path; it does not add another implementation surface or expand the one `TreeView` hot-path
  boundary.

## Integration test

1. Mount real `TreeView` with a loaded representative map and install a controllable
   `requestAnimationFrame`/`cancelAnimationFrame` fake.
2. Drive a pointerdown and enough pointermoves to cross the existing slop, then issue a burst of moves
   before flushing the scheduled frame.
3. Assert one pending frame represents the burst; flush it and assert `.world-camera` carries the
   cumulative final pan transform. Repeat with a later burst to prove the next frame is independently
   coalesced.
4. End, cancel and unmount gestures with pending work. Assert the released drag retains its last legal
   position, while cancelled/unmounted work cannot apply a stale later update or change click selection.
5. Instrument the camera-neutral Studio chrome at its real memo boundary and assert a camera-only pan
   does not invoke its body again; separately retain the existing `SceneView` memo test as the shared
   scene regression wall.

## Contracts

1. **`pan-frame-coalesces-pointer-bursts`**
   - **asserts —** after a drag crosses `DRAG_SLOP`, any number of pointermoves before the next display
     frame schedules no more than one pending camera frame; it does not call a camera state update per
     input event.
2. **`pan-frame-commits-the-latest-cumulative-delta`**
   - **asserts —** flushing that one frame applies the cumulative latest drag delta to `.world-camera`,
     preserves scale and `atFitRef` semantics, and a later burst schedules exactly one later frame rather
     than replaying stale intermediate deltas.
3. **`pan-frame-settles-or-cancels-pending-work-safely`**
   - **asserts —** pointer release preserves the final legal drag position, while pointer cancellation or
     component unmount clears pending frame work so no stale camera update, synthetic click selection or
     post-unmount state update occurs.
4. **`pan-frame-skips-camera-neutral-studio-chrome`**
   - **asserts —** a camera-only update changes the parent transform but does not re-invoke the memoized
     `StudioWorldChrome` body when its world/chrome inputs are referentially unchanged; its spokes,
     stamps and nameplate-key output remain unchanged.

## Explicitly outside this increment

- Any density budget, LOD, culling, aggregation or visual policy below a zoom threshold. Those change
  what the owner sees and remain the separately planned owner-visible decision in ADR-0240.
- Keeping `TreeView` mounted across routes; client cache/persistence; server tree/docs memoization and
  invalidation; boot de-serialisation; cache headers, ETags or stale-paint reconciliation. Those are the
  later cache/defer stages of the arc, not a pan-event patch.
- Renderer replacement, canvas/WebGL work, scene-graph redesign, sprite/layout changes, browser FPS
  claims, visual attestation, or any change to selection, wheel, keyboard, capture or camera semantics
  beyond safely scheduling an existing drag.
