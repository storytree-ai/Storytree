---
id: "camera-rasterisation-probe"
tier: capability
story: studio
arc: act2-camera-choreography-arc
title: "Measure camera-transform rasterisation during the real forest regrow"
outcome: "A repeatable Studio diagnostic reports the rasterisation-cost delta between the real 40-island regrow growth-only baseline and cursor-driven camera-transform variants under ADR-0286's bracketed idle-floor protocol."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [286]
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/components/cameraRasterisationProbe.test.ts", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/src/components/cameraRasterisationProbe.ts", "apps/studio/src/components/TreeView.tsx", "apps/studio/scripts/measure-camera-rasterisation.mjs", "apps/studio/package.json"]
  real:
    testFile: "apps/studio/src/components/cameraRasterisationProbe.test.ts"
    sourceFile: "apps/studio/src/components/cameraRasterisationProbe.ts"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/cameraRasterisationProbe.test.ts", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/src/components/cameraRasterisationProbe.ts", "apps/studio/src/components/TreeView.tsx", "apps/studio/scripts/measure-camera-rasterisation.mjs", "apps/studio/package.json"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "studio", "exec", "vitest", "run", "src/components/cameraRasterisationProbe.test.ts"]
---

# Measure camera-transform rasterisation during the real forest regrow

**Outcome —** A repeatable Studio diagnostic reports the rasterisation-cost delta between the real
40-island regrow growth-only baseline and cursor-driven camera-transform variants under ADR-0286's
bracketed idle-floor protocol.

## Why this is one capability

This is one evidence-producing journey: run the shipped forest regrow in a production browser,
compare its growth-only cost with diagnostic camera-transform variants, and receive one admissible
comparison report. Every leg shares the same production build, real 40-island corpus, semantic
cursor, frame observer and report. Splitting collection from comparison would leave neither half
capable of settling the rasterisation question.

This capability belongs to `studio`: the existing `TreeView` camera/controller remains Studio-owned,
while `@storytree/app-surface` continues to render the world it is given. It is a diagnostic child of
`act2-camera-choreography-arc`, not product choreography. Its results inform the arc's open ADR forks;
they do not select a transform, easing, framing or beat.

## Guidance

- Exercise a **production build** in Chromium at the fixed viewport used by the ADR-0286 measurements.
  Fail closed unless the loaded real corpus resolves to exactly 40 mapped islands; a different corpus
  is new evidence, not a comparable continuation of this baseline.
- Keep the shipped regrow authoritative. The growth-only control is the current `?act2=intro` run,
  with the existing island order, causal edge schedule, speed multiplier and settlement unchanged.
  Camera variants are diagnostic overlays around that run; they must not rebuild or retime its plan.
- There is **one clock**. Derive every variant's camera transform from the regrow's existing semantic
  cursor at the frame being painted. Do not add a timer, independent `requestAnimationFrame` loop,
  animation library or CSS transition. Sampling observes browser frames; it does not drive motion.
- Keep the variant set declarative and named in the report. It may bracket plausible translate/scale
  transform shapes, but it must not encode a product choice or silently make one variant the default.
  Outside the exact diagnostic route, the product camera/controller is byte-for-byte unchanged.
- Apply ADR-0286's admissibility rule to **every** baseline and variant run: measure an idle-floor
  window immediately before and after the regrow, retain the run only when both floors are at the
  approximately 16.7 ms vsync floor, and record rejected runs with the failed floor rather than
  interpreting them. Alternate/repeat baseline and variant runs so one warm or contended interval
  cannot masquerade as a transform effect.
- Record enough raw evidence to re-check the conclusion: build identity, browser and viewport,
  corpus/island count, diagnostic variant, regrow settings, pre/post idle floors, frame timestamps,
  cursor position, visible growth-node count, applied camera transform and accepted/rejected reason.
  Emit machine-readable JSON plus a concise comparison table to a caller-supplied output path.
- Compare rasterisation cost only. Report per-variant deltas against the bracketed growth-only
  baseline using the same frame buckets and summary statistics. Do not claim look, pacing, narrative
  quality, chosen choreography or a product performance budget.
- Preserve the settled observable: every run ends on the same forest, camera state and regrow event
  sequence as its control. A diagnostic transform must be removed on settle, abort and route exit.
- Keep the REAL-build catalog in lockstep by naming `camera-rasterisation-probe` in
  `packages/cli/src/node-build.test.ts`; this is discoverability regression evidence, not another
  implementation surface.

## Integration test

1. Build Studio for production, serve it, and open the exact diagnostic route in Chromium at the
   fixed viewport. Assert the real corpus contains 40 mapped islands and capture the shipped regrow
   schedule and final forest/camera state as invariants.
2. Run the growth-only baseline and each declared cursor-driven camera-transform variant. For every
   run, collect the pre-run idle floor, frame/cursor/growth/transform samples, and post-run idle floor.
3. Prove the variant transform is a pure function of the sampled existing cursor: advancing that
   cursor advances growth and the transform together, while no second clock or scheduling loop exists.
4. Reject a synthetic contended pre- or post-floor run; retain clean repeated baseline/variant runs;
   and prove alternating run order does not change how deltas are paired.
5. Emit the JSON evidence and comparison table. Read them back and assert every retained delta traces
   to raw samples and an admissible bracket, while rejected runs remain visible but un-interpreted.
6. Settle, abort and leave the diagnostic route; assert the shipped schedule, final forest and camera
   match the growth-only control and the clean Studio route never activates a diagnostic transform.

## Contracts

1. **`camera-raster-probe-reuses-the-regrow-cursor`**
   - **asserts —** the growth-only control preserves the shipped 40-island regrow schedule, and every
     diagnostic camera transform is derived from that same sampled semantic cursor without a second
     timer, frame loop, transition or independently advancing state.
2. **`camera-raster-probe-brackets-every-production-run`**
   - **asserts —** every production Chromium baseline and variant run records both adjacent idle
     floors, admits only runs whose two floors are approximately 16.7 ms, and retains rejected runs
     with an explicit failed-floor reason instead of using them in a comparison.
3. **`camera-raster-probe-reports-traceable-cost-deltas`**
   - **asserts —** the emitted JSON and comparison table identify the build, browser, viewport,
     40-island corpus, variant and regrow settings; retain raw frame/cursor/growth/transform samples;
     and derive each rasterisation-cost delta from admissible repeated growth-only and variant runs.
4. **`camera-raster-probe-leaves-product-choreography-unchanged`**
   - **asserts —** variants exist only on the exact diagnostic route, make no product transform the
     default, and settle or clean up to the same regrow event sequence, final forest and camera state
     as the growth-only control on completion, abort and route exit.

## Explicitly outside this increment

- Choosing, shipping or visually attesting camera choreography, framing, easing, beats or narration.
- Changing the regrow's island order, causal edge schedule, speed dial, first-arrival behaviour or
  reduced-motion behaviour.
- Adding another animation clock, replacing the renderer, or optimising rasterisation.
- Treating a non-40-island corpus or a contended run as comparable evidence.
- Writing or deciding the open ADRs. This capability produces the evidence their owner needs.
