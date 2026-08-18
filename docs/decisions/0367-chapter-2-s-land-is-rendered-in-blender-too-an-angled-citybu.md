---
status: accepted
decided: 2026-08-14
amends: [280, 274]
arc: chapter2-code-generated-organic-art-arc
---
# ADR-0367: Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera

## Status

accepted (2026-08-14) — decided/directed by the owner in conversation on 2026-08-14. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md).** ADR-0280
reserved the land: "the existing app-owned SVG island remains the sole land substrate", and its end
state promised "no runtime 3D substrate, second renderer or asset-owned clock". The second half
STANDS UNCHANGED and is restated below as D3. The first half is narrowed: the app still OWNS the
land — its shape, its per-cell identity, its status tint, its reveal, its hit targets — but the land's
ART may now be produced by our own Blender script at author time, exactly as the hero tree's is.

**Amends [ADR-0274](0274-pixellab-animates-organic-growth-over-the-app-owned-svg-isla.md)** on the
same clause and no further: PixelLab's organic-growth track continues over the same island, and that
sibling arc is untouched by this decision.

This is the first spend of the author-time-3D licence the owner reopened on 2026-08-14 when signing
the hero tree's ceiling verdict (recorded on increment `attest-code-generated-hero-tree-ceiling`).
The owner's stated reason for reopening was that the shadows and lighting Blender produces make a
material difference; the owner's stated ambition for it is that the map should read like a
citybuilder.

## Context

Nine authored versions established that our own code can produce organic art that reaches the
quality bar (ADR-0280, attested 2026-08-14). Every one of them rendered an OBJECT that stands on the
land. The land itself was never in scope, and the current state of it is worth stating precisely,
because two facts in the shipped code decide most of this ADR's shape.

**FACT 1 — the land has no camera at all.** The hero tree is authored at a declared 20-degree
orthographic camera, stated in its manifest and its registration record. The land is a pure PLAN
view: `hexCenter` in `packages/forest-world/src/hex.ts` maps axial coordinates to pixels with no
y-scale, no elevation and no projection matrix, and every stage downstream of it — the relaxed
substrate mesh, the coast, the scene builders — works in that same untransformed space. There is no
land projection constant to change, because none has ever existed. The only reconciliation between
the plan-view land and the 20-degree trees is a display-only vertical squash applied to the sprite
box in the round-3 lab, whose own source comment calls it a "comparison stand-in, never a solved
camera", plus a single `TILE_DEPTH = 8` pixel offset on a fallback path. So "angle the island" is not
a change to a camera value. It is the first time the land is given a camera at all, and that — not
the choice of renderer — is the load-bearing part of this decision.

**Annotated in place 2026-08-16 (ADR-0139); the decision is unchanged.** This paragraph is the
decision-time snapshot that D1 itself goes on to resolve, not a standing claim about today's
codebase: PR #1344 (increment `land-declares-a-shared-camera`) built exactly what D1 required, and
`LAND_CAMERA_ELEVATION_DEG` now exists in `packages/forest-world/src/camera.ts`, with
`hexCenter`/`hexCorners`/`pixelToHex`/`hexPath` projecting through it. Read the "no camera at all" /
"none has ever existed" sentences above as describing the land BEFORE this ADR's own D1 landed, not
as a claim about the present. The load-bearing point they establish — that giving the land a camera
was a first, not a value change — is unaffected by the correction and is why the paragraph is kept
rather than deleted.

**FACT 2 — the island's silhouette is computed at runtime and can never be pre-rendered whole.**
Each story claims hex tiles on a quota of `max(3, capabilities.length + 2)`; the territory boundary
is recomputed as every tile edge whose neighbour is foreign soil; and the coast path is a
story-id-hashed outset-and-Chaikin smoothing of that boundary. The outline therefore changes when a
story gains a capability, when the DAG re-ranks, and when neighbour packing nudges a seed, and every
island's shore is unique by construction. There is no authored island path anywhere in the
repository, and no pre-rendered land art of any kind exists today. A single baked island plate is
structurally impossible, and this is forced by the code rather than chosen.

Two further attachments constrain any substitution, both load-bearing rather than incidental. Land
cells are the CAPABILITY: the interior is sub-partitioned by equal-weight Voronoi over per-capability
seed points and **each individual cell carries its capability's status tint**, so the land is a live
status display, not decoration. And the accretion reveal indexes cells by their literal SVG path `d`
string, so the per-cell reveal transform is keyed to the exact emitted geometry.

**Corrected in place 2026-08-16 (ADR-0139); the decision is unchanged.** The path-`d` index was the
decision-time fact and is exactly what made the Consequences section below name a real cell id as an
accepted cost still owed. It was paid down the same day, by a sibling increment rather than by this
ADR's own D1: PR #1341 (`land-cells-get-a-shape-free-id`) re-keyed the reveal onto `landCellId` — a
stable, shape-free, emission-order identity — so it now survives the land's geometry moving. Treat
the sentence above as the state this ADR was written against, not the state today.

## Decision

**D1 — THE LAND GETS A DECLARED CAMERA, AND IT IS THE SAME ONE THE HERO TREE ALREADY DECLARES.** The
map is angled. The camera is expressed once, as a named constant with an angle in degrees, and both
the land render and the object sprites are authored against it. A land rendered at one angle and a
tree rendered at another do not compose, and today's 20-degree trees standing on a plan-view ground
are exactly that mismatch, currently absorbed by a squash dial that is admitted not to be a camera.
Whether the shared value stays 20 degrees or moves is an increment's measurement to make, but there
is ONE value and both sides read it.

**Corrected in place 2026-08-16 (ADR-0139); the decision is unchanged.** This D1 built exactly as
written: PR #1344 gave the land the declared camera, `hexCenter` and its siblings now project through
it (see the Context FACT 1 annotation), and the squash dial's default is now DERIVED rather than the
hand-picked stand-in. "Today's 20-degree trees standing on a plan-view ground" describes the mismatch
D1 existed to fix, not the shipped state. Whether the value stays 20 degrees remains genuinely
unsettled at the ADR level (see Consequences, "What this does not license") — this correction touches
only the now-resolved mismatch, not the still-open value question.

**D2 — LAND ART IS PRODUCED BY OUR OWN BLENDER SCRIPT AT AUTHOR TIME, AND IT IS DELIVERED AS AN
ADDRESSABLE SET, NEVER AS A BAKED ISLAND.** ADR-0280 D1's terms carry over unchanged: the script is
the source of truth, never a `.blend`; no hand-sculpted asset and no imported mesh is authoritative;
randomness is identity-keyed; renders are deterministic from a fixed seed on pinned Blender LTS at
CPU Cycles (ADR-0280 D2a). What the render delivers is pieces the app composes per cell and per
coast segment — because Context FACT 2 makes anything coarser impossible.

**D3 — THE APP KEEPS OWNING THE LAND. ⚠ THE RUNTIME-3D HALF OF THIS DECISION IS AMENDED BY
[ADR-0380](0380-the-runtime-target-is-desktop-class-hardware-with-a-gpu-and.md) D6 (2026-08-18) —
a live renderer IS now admitted for the land and its vegetation, owner-directed.** What that
amendment does NOT touch, and what therefore still stands here in full: no asset-owned clock, no
vendor call and no generated clock in the runtime, build or deployed environment; and the app
continues to own which cells are claimed and by which story, the coast derivation, per-cell
capability identity AND status tint, the accretion reveal and its timing, hit targets, trail routing
and docking, nameplate placement, scene bounds, reduced motion, replay and painter order. ADR-0380
restates every one of those as a binding fence on the renderer it admits, and adds two more from
ADR-0069 — accessible DOM text/hit targets, and determinism held on the scene GRAPH rather than on a
live raster. The sentence this decision originally carried — that runtime 3D stays closed and this
ADR "must not be read as opening" it — was true when written and is no longer the current decision.
Blender contributing pixels at author time is likewise no longer the ONLY route to land pixels,
though it remains the right one wherever a sprite is the better answer.

**D4 — THE SAME BACK HALF APPLIES.** Land renders pass through the same quantise/palette treatment
the hero tree's do, against the island's existing palette. A raw Blender render shipped as land is
the ADR-0145 failure reproduced, and the fact that this land is bigger than a tree makes that worse,
not more forgivable.

**D5 — THE LAND'S STATUS TINT SURVIVES, AND IT OUTRANKS THE ART.** Whatever the render delivers, a
cell must still be able to show its capability's status. A treatment that can only be shipped by
giving up per-cell status colour is refused under this ADR without a further owner decision, because
the tint is semantic state and this ADR is about appearance.

## Consequences

**THE FIRST INCREMENT'S JOB IS A FORK, NOT A RENDER, AND IT IS NAMED HERE SO IT IS NOT REDISCOVERED
EXPENSIVELY.** The shipped island interior is not a lattice: it is a Townscaper-style RELAXED,
JITTERED quad mesh in which every cell is a unique polygon, pinned only at the silhouette. A finite
rendered tile set cannot cover unique per-cell shapes. So exactly one of these has to give, and they
have very different costs:

- **(a) Regularise the interior** back to a repeating lattice so a finite tile set tiles it. Buys the
  full citybuilder look — real extruded walls, cast shadows, thickness — and costs the relaxed mesh's
  organic irregularity, which was itself built deliberately.
- **(b) Keep the mesh and render only what does NOT depend on cell shape** — the coast wall and beach,
  the extruded island edge, an angled lighting/shadow pass, elevation — leaving the flat per-cell
  fills as SVG carrying their status tint. Much cheaper, keeps D5 free, and gets most of the
  "shadows and lighting make a difference" effect the owner named, but the interior stays flat.
- **(c) Render per-cell pieces on demand at author time** for the cells that actually occur. Rejected
  on its face by Context FACT 2 — cell geometry depends on live story data, so there is no closed set
  to render — but recorded so it is not re-proposed.

This fork is NOT decided here. It is the first increment's deliverable, settled by a measured spike
against the two named options rather than by argument.

**Accepted costs.** `TILE_DEPTH` is read as a LAYOUT constant, not only a paint constant — the
nameplate baseline and the scene bounds both add it — so giving the land real depth misplaces
nameplates and crops bounds until those two sites are reconciled. The accretion reveal's index is the
literal path `d` string, which is fragile under any change to how cell geometry is emitted and should
be given a real cell id before the land's geometry moves at all.

**Corrected in place 2026-08-16 (ADR-0139); the decision is unchanged.** This particular cost was
paid down before the land's geometry moved: PR #1341 re-keyed the accretion reveal onto `landCellId`
the same day this ADR was decided (see the Context annotation above). It should not be re-driven.

Author-time render cost and committed PNG weight both rise, and the land is a much larger surface
than a 128px tree. And the
existing SVG island is not merely a placeholder being replaced: it is a working, data-driven,
status-bearing display, so every increment here is a substitution under load rather than a green field.

**What this does not license.** It does not reopen runtime 3D (D3). It does not license a `.blend` or
a sculpted asset as truth (D2). It does not touch the sibling PixelLab arc. It does not settle
whether the shared camera angle stays at 20 degrees. And it does not make the hero tree's ceiling
verdict conditional — that verdict is signed and independent of whether this land work succeeds.

## References

- [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) — code owns
  skeleton, camera and growth; D2a admits headless Blender; D4 makes an honest "not good enough" an
  accepted outcome. Amended here on the land-substrate clause only.
- [ADR-0274](0274-pixellab-animates-organic-growth-over-the-app-owned-svg-isla.md) — the sibling
  PixelLab track over the same island. Amended on the same clause and no further.
- [ADR-0289](0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md),
  [ADR-0293](0293-the-chapter-2-growth-track-grows-the-wood-first-and-flushes.md) — the staging
  decisions of the hero-tree track this extends.
- `packages/forest-world/src/hex.ts` — `HEX_R`, `HEX_W`, `TILE_DEPTH`, `hexCenter`: the land's whole
  coordinate system. At decision time it carried no projection term, which was the evidence for FACT
  1 above; PR #1344 built D1's camera and `hexCenter`/`hexCorners`/`pixelToHex`/`hexPath` now project
  through `packages/forest-world/src/camera.ts`'s `LAND_CAMERA_ELEVATION_DEG` — see the FACT 1
  annotation. Corrected in place 2026-08-16 per ADR-0139.
- `packages/forest-world/src/camera.ts` — `LAND_CAMERA_ELEVATION_DEG` and the projection functions D1
  called for (`groundFlattening`, `uprightForeshortening`, `projectGround`/`unprojectGround`), added
  by PR #1344.
- `packages/forest-world/src/substrate.ts` — the relaxed quad mesh whose per-cell uniqueness forces
  the Consequences fork.
- `packages/forest-world/src/coast.ts` — outset, Chaikin smoothing and the story-id-hashed shore.
- `apps/studio/src/components/TreeView.tsx` — tile quotas, territory boundary, nameplate baseline and
  scene bounds.
- `packages/app-surface/src/svg-island-accretion.ts`, `packages/app-surface/src/SceneView.tsx` — the
  per-cell reveal and its path-`d` index.
- `docs/research/chapter2-code-only-art-2026-08-01/blender-hero-v1/` — the hero-tree track this
  borrows its whole method and back half from.
