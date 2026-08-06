---
id: "act2-regrow-camera-zoom-out"
tier: capability
story: studio
arc: act2-camera-choreography-arc
title: "The Act 2 regrow pulls the camera back to the whole forest"
outcome: "The existing Act 2 regrow carries the Studio camera from a close opening view to the ordinary fitted whole-forest view on its own cursor."
status: proposed
proof_mode: integration-test
depends_on: [camera-rasterisation-probe]
decisions: [286, 292, 313]
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/lib/worldCamera.test.ts", "apps/studio/src/components/TreeView.act2Camera.test.tsx", "apps/studio/src/components/cameraRasterisationProbe.test.ts", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/src/lib/worldCamera.ts", "apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/cameraRasterisationProbe.ts", "apps/studio/scripts/measure-camera-rasterisation.mjs"]
  real:
    testFile: "apps/studio/src/components/TreeView.act2Camera.test.tsx"
    sourceFile: "apps/studio/src/components/TreeView.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/lib/worldCamera.test.ts", "apps/studio/src/components/TreeView.act2Camera.test.tsx", "apps/studio/src/components/cameraRasterisationProbe.test.ts", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/src/lib/worldCamera.ts", "apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/cameraRasterisationProbe.ts", "apps/studio/scripts/measure-camera-rasterisation.mjs"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "studio", "exec", "vitest", "run", "src/lib/worldCamera.test.ts", "src/components/TreeView.act2Camera.test.tsx", "src/components/cameraRasterisationProbe.test.ts"]
---

# The Act 2 regrow pulls the camera back to the whole forest

**Outcome —** The existing Act 2 regrow carries the Studio camera from a close opening view to the
ordinary fitted whole-forest view on its own cursor.

## Why this is one capability

The operator has one continuous journey: start the existing forest regrow close enough to read its
tree detail, watch that same run pull back, and arrive at the ordinary fitted forest with the normal
camera controls restored. Every leg shares one precondition (an Act 2 regrow is active), one driver
(the existing normalized regrow cursor), and one observable (the camera presented by `TreeView`). A
close-only opening or a pull-back that does not settle would be a defect, not a smaller journey.

This is a bounded child of the existing `studio` story. It depends on
[`camera-rasterisation-probe`](camera-rasterisation-probe.md) because the final shipped zoom curve must
be measured against the interleaved growth-only control that capability delivers; the product path
must not invent a second measurement protocol. It adds no cross-story package edge: Studio continues
to own its camera controller while the existing `studio → app-surface` boundary supplies the rendered
world.

## Proof walkthrough first

1. Give the pure camera projection the ordinary fitted camera, immutable frame/world geometry, and
   representative values of the existing normalized regrow cursor. Prove cursor `0` returns the fixed
   close opening, intermediate samples zoom monotonically outward without tracking a changing island,
   and cursor `1` returns the ordinary fitted camera exactly.
2. Mount the real `TreeView`, start the existing first-arrival/replay path, and advance its existing
   semantic cursor. Prove each published cursor sample supplies the camera projection directly, with no
   tween, CSS transition, timer, private rAF driver, second progress value, or independently advancing
   camera state.
3. While the regrow is active, exercise wheel, pointer-pan and keyboard camera input and prove the
   scripted camera remains authoritative. Settle the run, then exercise those same handlers and prove
   the ordinary camera controls work immediately from the exact fitted camera.
4. Repeat with reduced motion and prove every cursor sample presents the fitted camera without an
   animated zoom. For both motion postures, compare the Act 2 island/path/accretion schedule with the
   pre-capability sequence and prove settlement produces no later camera-transform writes.
5. Run the production camera probe with interleaved growth-only controls and the final product curve,
   using its existing 40-island, viewport and idle-floor admissibility rules. Emit and read back the
   measured delta and run span; report a material cost or duration change rather than hiding it.

## Contracts

1. **`act2-regrow-camera-projects-the-existing-cursor`**
   - **asserts —** the camera is a deterministic pure projection of the existing normalized regrow
     cursor plus immutable fitted-camera/frame/world inputs: cursor `0` is the fixed close opening,
     scale moves monotonically outward under one fixed framing, and cursor `1` equals the ordinary
     fitted whole-forest camera exactly; no focal-island/frontier input, tween, transition, timer,
     private rAF driver, second cursor or independently advancing state exists.
2. **`act2-regrow-camera-owns-input-only-until-settle`**
   - **asserts —** wheel, pointer-pan and keyboard camera input cannot displace the scripted camera
     while the existing player reports an active regrow, and the unchanged ordinary handlers resume
     immediately after settlement from the fitted camera without a takeover or cancellation state
     machine.
3. **`act2-regrow-camera-reduces-motion-and-settles-exactly`**
   - **asserts —** reduced motion presents the ordinary fitted camera for the entire run with no
     animated zoom; in either motion posture cursor `1`, completion, abort and route exit leave the
     exact fitted camera and schedule zero later camera-transform writes.
4. **`act2-regrow-camera-preserves-the-run-and-reports-its-cost`**
   - **asserts —** adding the camera projection does not change the Act 2 island order, pathway,
     accretion or vegetation cursor fractions, and the production probe reports the final product
     curve's admitted frame-cost delta and wall-clock run span beside interleaved growth-only controls
     under the existing 40-island bracketed-idle-floor protocol.

## Operator-attested finish

Machine proof covers geometry, ownership, settlement, schedule and measured cost. The opening amount
and pull-back curve are appearance/pacing judgments with no compiler. After green, stage a verified
Studio URL at the ordinary speed for the owner to judge only whether the opening reveals the shipped
tree detail and whether the pull-back arrives naturally at the ordinary whole-forest view. The agent
does not sign that verdict.

## Explicitly outside this increment

- First-person camera, focal-island or growth-frontier tracking, pan choreography, and any manual-input
  takeover/cancellation state machine.
- A second clock, transition, tween, animation library, private frame driver, or camera-owned progress.
- Changes to island order, causal timing, run duration policy, accretion, vegetation, art, density,
  renderer, or the settled forest.
- Website intro sequencing or a second website implementation; the app-owned behaviour is consumed
  through the existing engine boundary.
- Treating the final camera cost as free or changing the production measurement protocol to obtain a
  preferred result.
