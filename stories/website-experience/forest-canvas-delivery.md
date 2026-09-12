---
id: "forest-canvas-delivery"
tier: capability
story: website-experience
title: "The canvas delivery — the dressed scene mounted in a real host surface, at a cost the frame can pay"
outcome: "One R3F canvas mounts the dressed scene into a real host surface and keeps it affordable: ForestWorldCanvas composes the three upstream lanes into a single ground draw however many islands are standing, and the Studio's land view, land-view lib and canvas registration mount, size and register that canvas in a running app — so rendering cost and mount behaviour can be worked without touching a single art module."
status: proposed
proof_mode: integration-test
depends_on: [forest-scene-model, forest-land-surface, forest-land-dressing]
decisions: [123, 562]
# ⚠ SPLIT LANE 4 of 4 (2026-09-12), the sink. Born of the `forest-rendering-engine` split; it
# inherited the files below and NOTHING ELSE. ⚠ **No proof came with it** — ADR-0559 D5: "no
# continuation transfers proof to newly split lanes." The pre-split capability's single July 2026
# signed verdict proved `world-to-3d.ts` and is `forest-scene-model`'s history. This lane starts
# `proposed` with zero signed credit.
#
# ⚠ THIS LANE DELIBERATELY STRADDLES TWO WORKSPACES, and that is the decision, not an oversight.
# `apps/studio/src/components/LandView*.tsx`, `apps/studio/src/lib/landView*.ts` and
# `apps/studio/src/lib/canvasRegistration*.ts` are owned by the RENDERER, not by the studio story
# (verified against `repo-manifest.json` 2026-09-08). They join DELIVERY rather than any art lane
# because that is where rendering COST and MOUNT behaviour are worked: filing them with the art
# would put the optimisation session and the art session back in the same claim, which is exactly
# the serialisation this split exists to end.
#
# ⚠ NO SINGLE COMMAND PROVES THIS LANE, and the `proof:` block can only name one. `command` below
# is the STUDIO suite, which runs the mount half — `LandView.test.tsx`, `landView.test.ts`,
# `canvasRegistration.test.ts`. The package half is one file, `forest-ground-is-one-mesh.test.ts`
# (the whole-forest-one-draw-call claim, whose fourth claim is a source parse of
# `ForestWorldCanvas.tsx`), and it runs under `pnpm --filter @storytree/forest-world-r3f test`.
# Both are declared in `scope` because the lane owns both; only one can be the declared command.
# Whoever arms a `real:` arm here must pick ONE workspace for it and say which.
#
# ⚠ `ForestWorldCanvas.tsx` HAS NO TEST OF ITS OWN, and none is invented here. A React-Three canvas
# has no honest headless oracle — its appearance is owner-witnessed (ADR-0070), and the only
# machine assertion that reaches it today is the source parse named above, which that test's own
# header calls its weakest claim on purpose. This is recorded rather than papered over.
#
# Node-borne proof config (ADR-0057): NOT armed. There is deliberately no `real:` arm — this
# landing draws a boundary and arms no red→green.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/src/components/LandView.test.tsx"
      - "apps/studio/src/lib/landView.test.ts"
      - "apps/studio/src/lib/canvasRegistration.test.ts"
      - "packages/forest-world-r3f/src/forest-ground-is-one-mesh.test.ts"
    sourceGlobs:
      - "apps/studio/src/components/LandView.tsx"
      - "apps/studio/src/lib/landView.ts"
      - "apps/studio/src/lib/canvasRegistration.ts"
      - "apps/studio/src/lib/canvasRegistration.constants.ts"
      - "packages/forest-world-r3f/src/ForestWorldCanvas.tsx"
---

# The canvas delivery — the dressed scene mounted in a real host surface, at a cost the frame can pay

**PROVENANCE — born of a split, carrying no proof.** This capability did not exist before
2026-09-12. On that day `forest-rendering-engine` (itself `r3f-world-spike` until earlier the same
day — ADR-0562) was split into four lanes on a measured import graph:
[`forest-scene-model`](forest-scene-model.md) → [`forest-land-surface`](forest-land-surface.md) →
[`forest-land-dressing`](forest-land-dressing.md) → `forest-canvas-delivery` (this one, the sink).
⚠ **Nothing was inherited but the files.** ADR-0559 D5: *"no continuation transfers proof to newly
split lanes."* The pre-split capability's one signed verdict proved `world-to-3d.ts` and belongs to
the scene-model lane's history. This lane starts `proposed` with zero signed credit.

**Outcome —** One R3F canvas mounts the dressed scene into a real host surface and keeps it
affordable: `ForestWorldCanvas` composes the three upstream lanes into a single ground draw however
many islands are standing, and the Studio's land view, land-view lib and canvas registration mount,
size and register that canvas in a running app.

**Depends on —** all three upstream lanes — [`forest-scene-model`](forest-scene-model.md),
[`forest-land-surface`](forest-land-surface.md) and
[`forest-land-dressing`](forest-land-dressing.md) — because the canvas is what COMPOSES them; it is
the only place in the renderer that holds all three at once. Nothing imports this lane from inside
the package: it is the sink, and that is what lets rendering cost and mount behaviour be worked
while all three art lanes are being worked by other sessions.

> **Proof status (honest) — UNPROVEN as a capability, and only PARTLY covered as code.** The three
> Studio mount files carry real suites (`LandView.test.tsx`, `landView.test.ts`,
> `canvasRegistration.test.ts`, run by `pnpm --filter studio test`). The package half is one file,
> `forest-ground-is-one-mesh.test.ts`, run by `pnpm --filter @storytree/forest-world-r3f test`.
> **`ForestWorldCanvas.tsx` itself has no test**, and that is stated rather than remedied by
> invention: a React-Three canvas has no honest headless oracle, its appearance is owner-witnessed
> (ADR-0070), and the one machine assertion that reaches it is a SOURCE PARSE inside the draw-call
> test — which that test's own header flags as its weakest claim, deliberately. No contract id
> leads any of these tests (ADR-0122), so `storytree coverage forest-canvas-delivery` correctly
> reports zero and no signed verdict names this unit.

## The lane — 1 package module + the Studio mount

| file | role |
|---|---|
| `packages/forest-world-r3f/src/ForestWorldCanvas.tsx` | the canvas: descriptors → instanced meshes + map controls; mounts exactly ONE `<CellGround>` and hands it the whole slice. |
| `apps/studio/src/components/LandView.tsx` | the Studio's land view — where the canvas is mounted in a running app. |
| `apps/studio/src/lib/landView.ts` | the land view's pure half (sizing, framing, the data it hands the canvas). |
| `apps/studio/src/lib/canvasRegistration.ts` | canvas registration — how a mounted canvas announces itself to the host surface. |
| `apps/studio/src/lib/canvasRegistration.constants.ts` | its constants. |

**WHY THE STUDIO FILES ARE HERE AND NOT IN THE STUDIO STORY.** They are owned by the RENDERER in
`repo-manifest.json`, and that ownership is correct rather than historical: they exist to mount and
size THIS canvas, and they change when the canvas changes. Given that they are the renderer's, the
only live question was which LANE takes them, and delivery is the answer because cost and mount
behaviour are worked together. Filing them with an art lane would put the optimisation session and
the art session back into one claim — the precise serialisation this split exists to end.

## Integration test

**Goal —** Prove the canvas composes the three lanes into an affordable frame, and that the host
surface mounts, sizes and registers it correctly.

1. **One ground, however many islands.** Take a multi-island world through the scene model and
   assert the composed scene yields ONE ground buffer and one ramp upload — the ramp sized by
   `tokens × levels`, not by cells and not by islands — and that the canvas mounts exactly one
   `<CellGround>` handed the whole slice. Feed a world of 1 island and a world of 35 and assert the
   draw-call count does not move. ⚠ The fourth link in that chain is a SOURCE PARSE of
   `ForestWorldCanvas.tsx` rather than an execution, and must be labelled as such wherever it is
   asserted; it is the weakest link on purpose, because the alternative is no assertion at all.
2. **The mount sizes from the frame, not from a remembered number.** Assert the land view derives
   the camera frame from the host element's measured size through the scene model's framing, and
   that a deliberately oblong host is separable from a square one — the failure a remembered
   constant hides.
3. **Registration is idempotent and reversible.** Mount, register, unmount → assert the host
   surface's registry returns to its pre-mount state and a second mount does not double-register.
4. **The canvas is the ONLY composition point.** Assert no upstream lane module imports the canvas
   — a lane backedge here would mean the art lanes could not be claimed while delivery is being
   worked, which is the property the whole partition buys.

## Guidance

**WHY THIS IS A CAPABILITY AND NOT GLUE.** Its outcome states in one sentence without conjunction
stapling — *the dressed scene is mounted in a real host surface at a cost the frame can pay* — and
its proof shares one precondition (a dressed scene) and one observable (what the host ends up
holding). It is also where optimisation lands, and optimisation is exactly the work that must NOT
share a claim with art retuning: an optimiser and an artist working the same lane each measure
against a frame the other is changing.

**THE LANE FENCE.**

- **This lane is the SINK. Nothing upstream may import it** — including an `import type`, because a
  type-only cycle pins two modules into one lane at compile time as firmly as a value cycle does.
  If an upstream module finds it needs something from the canvas, the thing it needs is upstream
  and has been put in the wrong file.
- **Delivery may import all three upstream lanes** — that is its job.
- **No art retuning here.** A colour, a tint, a shadow radius or a prop placement changed inside
  this lane is a change in the wrong place, and it will be invisible to the art lanes' own suites.
  Land it in [`forest-land-surface`](forest-land-surface.md) or
  [`forest-land-dressing`](forest-land-dressing.md) and let this lane compose it.
- **A cost claim names its budget.** "Affordable" is not a contract. A performance assertion in
  this lane states the frame budget it is measured against and the machine class it was measured
  on, or it proves nothing — and a number taken from a run on one box is evidence about that box.

**THE LOOK IS THE OWNER'S.** Whether the mounted world reads well is a taste judgment with no
compiler; it is witnessed on a live or staged surface and never self-signed by an agent (ADR-0070).
What this lane can prove by machine is the draw-call structure, the sizing derivation, the
registration lifecycle and the import direction — and it should prove exactly those, not a proxy
for the look.
