---
id: "act2-regrow-camera-frame-delivery"
tier: capability
story: studio
arc: act2-camera-frame-delivery-arc
title: "The approved Act 2 camera reaches the display without an extra refresh interval"
outcome: "The approved Act 2 bottom-anchored zoom-out preserves its exact choreography while its stable-picture frames reach the display within one refresh interval of the growth-only control."
status: proposed
proof_mode: integration-test
depends_on: [act2-regrow-camera-zoom-out, camera-rasterisation-probe]
decisions: [313]
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/components/TreeView.act2Camera.test.tsx", "apps/studio/src/components/cameraRasterisationProbe.test.ts", "apps/studio/src/lib/worldCamera.act2Bottom.node.ts"]
    sourceGlobs: ["apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/cameraRasterisationProbe.ts", "apps/studio/src/lib/worldCamera.ts"]
  real:
    testFile: "apps/studio/src/lib/worldCameraFrameDelivery.test.ts"
    sourceFile: "apps/studio/src/lib/worldCameraFrameDelivery.ts"
    editsExisting: false
    scope:
      testGlobs: ["apps/studio/src/lib/worldCameraFrameDelivery.test.ts", "apps/studio/src/components/TreeView.act2Camera.test.tsx", "apps/studio/src/components/cameraRasterisationProbe.test.ts"]
      sourceGlobs: ["apps/studio/src/lib/worldCameraFrameDelivery.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "studio", "test"]
---

# The approved Act 2 camera reaches the display without an extra refresh interval

**Outcome —** The approved Act 2 bottom-anchored zoom-out preserves its exact choreography while its
stable-picture frames reach the display within one refresh interval of the growth-only control.

## Why this is one capability

This is one performance journey: reproduce the owner-reported lag on the approved camera path, lock
the stable-picture frame-delivery diagnosis red, make the smallest exact compositor optimization,
and re-run the same production-shaped comparison. Every leg shares one precondition (the approved
Act 2 regrow), one observable (the composed camera delivered during the run), and one same-build
growth-only control. A diagnosis without regression proof cannot preserve the finding; an optimization
without exact output equivalence could change the approved picture; and deterministic green without
the production rerun would not prove that the visible lag was removed.

This capability directly consumes both prerequisites. [`act2-regrow-camera-zoom-out`](act2-regrow-camera-zoom-out.md)
delivers the approved pure cursor projection and its settled behaviour;
[`camera-rasterisation-probe`](camera-rasterisation-probe.md) delivers the production 40-island,
interleaved, idle-bracketed measurement boundary that must diagnose and verify this optimization.
The second edge is kept explicit because this capability invokes and tightens that probe's delivered
protocol directly, rather than relying only on the zoom capability's prior use of it.

## Proof walkthrough first

1. Read the committed raw PR #1185 evidence and retain its protocol-4 proxy finding:
   `growthNodeCount === 0` selected `12–20k`, where growth-only control p50 was `16.7 ms`
   (`n = 987`) versus final-product p50 `83.3 ms` (`n = 216`), a `+66.6 ms` gap. That non-accretion
   proxy authorized diagnosing and optimizing repeated root SVG camera writes, but it is not final
   stable-picture evidence: paths or vegetation may still change while `growthNodeCount` remains zero,
   which explains rerun variability. Final acceptance therefore uses protocol 5's committed complete
   visual-identity revision: a sampled rAF frame is stable only when that revision is unchanged from
   the preceding sampled rAF frame. Fail closed unless the production build resolves exactly 40 islands,
   every admitted run has valid adjacent idle brackets, and the raw samples and revisions remain traceable.
2. Add a deterministic RED test at the diagnosed frame-delivery seam. It proves unchanged visual-model
   identities cause zero root SVG mutations while the camera is delivered through the compositor, and
   it compares the composed camera matrix with the approved `worldCamera` projection exactly at cursor
   `0`, representative intermediate and clamp-boundary samples, and cursor `1`.
3. Make the smallest hybrid change: deliver unchanged-picture cursor frames through an exact compositor
   transform, then fold that transform into the root SVG camera whenever the visual model changes and
   on settle or cleanup. Prove the fold cannot double-apply, omit, or approximate the camera matrix.
4. Re-run integration proof for the unchanged schedule and timing, fitted reduced motion, scripted input
   ownership, ordinary-control resumption, exact settlement, abort and route-exit cleanup, and zero later
   camera writes. Preserve ADR-0313's pure function of the one existing cursor plus immutable frame/world
   geometry; introduce no tween, CSS transition, easing timer, private frame driver, second clock or
   cursor, tracker, free pan, first-person mode, or takeover state.
5. Run protocol 5's optimized same-build interleaved production comparison. Classify a stable frame only
   when the committed complete visual-identity revision is unchanged between consecutive sampled rAF
   frames. In the densest/highest map-node bucket with at least 100 such samples in each arm, optimized
   final-product p50 must be no more than one `16.7 ms` refresh interval above its same-build growth-only
   control; fail closed if no bucket is adequate. The existing painting-frame buckets and admitted
   run-span envelope are same-build secondary diagnostics inspected for material regression while
   satisfying the primary gap-frame threshold; deterministic integration proof owns unchanged
   schedule and timing.

## Contracts

1. **`act2-camera-gap-frames-deliver-through-the-compositor`**
   - **asserts —** when the visual-model identities are unchanged, an Act 2 cursor update performs zero
     root SVG mutations, delivers the camera through the compositor, and produces a composed camera
     matrix exactly equal to the approved pure `worldCamera` projection at representative cursor samples.
2. **`act2-camera-compositor-folds-exactly-and-cleans-up`**
   - **asserts —** a visual-model change folds the current compositor camera exactly once into the root
     SVG transform, and completion, abort, route exit, reduced motion, and ordinary control resumption
     preserve the fitted destination, ownership and zero-later-write behaviour without changing the
     regrow schedule, timing, island order, pathways, accretion or vegetation.
3. **`act2-camera-production-gap-closes-without-regression`**
   - **asserts —** the optimized same-build interleaved protocol fails closed unless it has exactly 40
     islands, valid idle brackets, exact cleanup, and a densest/highest map-node bucket with at least 100
     traceable samples in each arm whose committed complete visual-identity revision is unchanged between
     consecutive sampled rAF frames; that target bucket's gap-frame p50 is within one `16.7 ms` refresh
     interval of the growth-only control; existing painting-frame bucket deltas and admitted run span
     are same-build secondary diagnostics inspected for material regression, while deterministic
     integration proof owns unchanged schedule and timing.

## Explicitly outside this increment

- Any change to the approved opening scale, bottom anchor, pull-back curve, fitted destination,
  appearance, island/path/accretion/vegetation schedule, or timing.
- A tween, CSS transition, easing timer, private frame driver, second clock or cursor, runtime focal
  island or growth-frontier tracker, free pan, first-person mode, or takeover/cancellation state.
- Weakening the 40-island, adjacent-idle-bracket, exact-cleanup or evidence-traceability rules; treating
  the existing painting buckets as the primary threshold; or replacing the renderer.
