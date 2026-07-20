---
status: accepted
decided: 2026-07-18
amends: [69]
arc: grounded-art-machinery-arc
---
# ADR-0214: Ground AI-authored art in a physical model: CSG over SVG, not a render-substrate swap

## Status

accepted (2026-07-18) — decided/directed by the owner in conversation on 2026-07-18. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The forest world's art is authored by agents, and that authoring keeps hitting a ceiling. Agents emit
raw SVG coordinates and reintroduce the same class of physics errors — floating roofs, doors that do
not meet their walls, parts that do not join. The house-art swarm (2026-07-18, 19 candidate SVGs) is
the concrete instance: markup-only reviewers passed buildings the owner saw were physically wrong the
moment they were rendered.

A spike (`packages/procedural-architecture`) built a parametric part-tree plus a pure invariant
checker, and generated two buildings that stay sound across thousands of parameter combinations. Its
findings:

1. **The physics fix is the MODEL layer, not the renderer.** Authors declare parts and structural
   relations (`on`, `attached`); positions are derived, so "the roof floats" is not expressible. What
   the relation cannot see — a part slid off its support, an aperture past a wall's end, two windows
   colliding, a door on the third floor — is caught by a pure `check(model) → Violation[]`. Four of
   five error classes die here, and they die engine-agnostically. Swapping renderers does not fix them.
2. **Occlusion is the exception, and it fails SILENTLY.** A painter's algorithm keyed on each
   primitive's own centroid painted a ground-level door *behind* the wall it was cut into while the
   checker returned zero violations. Two independent subagents hit it and neither diagnosed it as a
   renderer bug. It passes the gate and fails the eye.
3. **The renderer is thin.** `render-svg.ts` is ~200 lines holding all the SVG knowledge; everything
   else speaks 3D volumes and face normals.
4. **"Physically coherent" is mechanizable; "reads as a windmill" is not.** The checker was green
   through several versions that looked wrong.

[ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) already settled the
substrate question: stay on SVG, with three named triggers for a swap (routine per-frame animation of
more than ~100–500 elements; node count past ~3,000–5,000; genuine need for per-pixel terrain shading).
None have fired. It also set the authoring direction — parameters and generators, never hand-placed
coordinates — and made determinism and free DOM text / accessibility load-bearing constraints
([ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md)'s hosted IAP members app depends on both).

Two alternatives were weighed against that and rejected:

- **Voxel occupancy as the authoring substrate.** A cubic grid makes floating *detectable*, but the
  part-tree already makes it *inexpressible* — prevention beats detection, and it is already built.
  Voxels also restyle the art: the world's domes, tapered frustums, curved coastlines and organic
  ponds all go blocky. The owner's own reference image, which reads as voxel art, is on inspection
  modular isometric vector — box-primitive buildings with free-form curved nature. What is compelling
  in it is the *discipline* (one projection, tight palette, one light direction, ground shadows, a
  recurring kit), not the grid.
- **A three.js / R3F substrate swap.** `packages/forest-world-r3f` exists, but its own file header
  reads "spike scale, no art direction… each descriptor family gets a placeholder mesh" with a spike
  palette — so a prior poor impression of 3D is evidence of an art-direction gap, not of 3D being
  wrong. It stays rejected on ADR-0069's constraints: WebGL forfeits determinism (cross-GPU
  antialiasing variance), DOM text, and no-GPU rendering; and it would require reimplementing the
  look, which lives in ~5,900 lines of `apps/studio/src/index.css` rather than in the scene graph.

## Decision

**The layer that changes is the AUTHORING MODEL, not the render substrate. SVG output stands
(ADR-0069 decision 3 upheld); buildings are authored as solids and composed by CSG.**

1. ~~**CSG is the modelling kernel.**~~ **REVERSED by [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md)
   decision 5 — both its mechanism and its occlusion claim.** This decision read: *an aperture is a
   boolean subtraction from a solid wall, not a quad painted near it; that removes the decal which had
   to be depth-sorted at all, so the silent-occlusion class is eliminated by construction rather than
   patched per case — the spike's three-line host-facet fix holds for one flat wall and breaks on an
   L-plan, a wing, or a porch in front of another wall. Part joins likewise become boolean facts that
   are checkable rather than eyeballed.*

   Two things in that are wrong. **No boolean kernel is adopted:** zero of the 19 catalogued house
   defects has a fault CSG subtraction would have prevented, CGA does apertures as facade subdivision
   and asset instancing rather than subtraction, and the vendored-`csg.js` plan is retired. Apertures
   are compound paths with real reveal quads, shipped without a kernel or a new dependency.
   **Occlusion is NOT eliminated by construction:** a part-tree derives *positions*, it does not derive
   *draw order*, and subtraction never addressed inter-part occlusion at all — a roof overhang crossing
   a wall is back to sorting filled polygons. Five of the 19 single-object buildings get depth order
   wrong. That class needs the explicit draw-order pass of ADR-0217 station 3, built as
   `packages/procedural-architecture/src/draw-order.ts`. Decisions 2, 3 and 4 below are unaffected and
   stand.
2. **Authors declare parts, sockets, and dials — never a coordinate.** The part-tree's `on` /
   `attached` relations stand, extended with typed socket compatibility (a `wall_top` accepts a
   `roof_bottom`), so an invalid composition is unexpressible rather than merely wrong. Face-relative
   aperture placement (the spike's `Facet` plus `cu` / `sill`) stands.
3. **The invariant checker is load-bearing and stays.** `check(model) → Violation[]` returning NAMED
   violations is what turns generated art into a red-green unit and what an agent iterates against;
   `[support-overlap] roof: only 30% of its footprint is carried by 'wall'` is actionable in a way
   that a failed render is not. Prevention handles what the relation can see; the checker handles the
   rest.
4. **The look is composed, not authored.** Fidelity to the existing look is the metric and improving
   the art is an explicit non-goal. The look comes from a fixed kit of proven parts, a locked palette
   addressed by material name, one shared light vector, and seeded deterministic jitter (`rand01`,
   never `Math.random`) — not from the agent's taste. Where a backend or a kit cannot reproduce
   something, that is a finding to report, not a licence to reinterpret. **Amended by
   [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md):** the metric is no
   longer "fidelity / improving the art is a non-goal" but "moves toward a named cosy target" (a
   directed aesthetic, owner-attested). D4's **never-reinterpret rule STANDS** — the concept goes TO an
   author and is never parsed into our code (ADR-0217 D2).
5. **Two verdicts, neither automated away.** A render-to-PNG step plus a vision reviewer is required,
   because markup-only critics are provably blind to geometry (the house swarm demonstrated this). The
   final look verdict stays owner-attested ([ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
   stage 2 / [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md)).
6. **Determinism, text output, and no-WebGL rendering are hard constraints on the kernel choice**
   (ADR-0069 decision 4). A kernel that cannot be shown pixel-stable does not ship.

Rejected: voxel occupancy as the authoring substrate; a three.js / WebGL substrate swap; automating the
look verdict.

## Consequences

- **Good:** ~~the one error class that passes the gate and fails the eye dies by construction rather than
  by cleverness.~~ *(Corrected per decision 1 above: the floating/no-contact class does die by
  derivation, but the silent-occlusion class does not — it needs ADR-0217 station 3.)*
  `packages/forest-world` is untouched — this lands beside it as a building-authoring
  layer over the existing engine-agnostic seam. Output stays diffable text, renders without a GPU, and
  keeps DOM text. The agent's authoring surface shrinks to parts / sockets / dials, which is precisely
  what raises the ceiling: capability comes from the machinery, not from the model tier.
- **Cost:** a CSG kernel is real work, and exact booleans are the genuinely hard piece (coplanar faces,
  near-zero-volume intersections, and other degenerate cases). A WASM kernel would be the first
  non-zero dependency in a package family that is otherwise pure and browser-safe, and its determinism
  must be proven rather than assumed.
- **Cost:** render-to-PNG is net-new infrastructure — the repo has no `resvg`, `sharp`, or `puppeteer`
  today, and without it there is no vision reviewer and no contact sheet for the owner to judge.
- **Cost:** parameter explosion is a live risk that ADR-0069 already warns about. The auto-sizing
  layout compiler is deliberately built LAST, on evidence of a seam that cannot otherwise be closed.
- **Unresolved:** whether CSG-in-SVG holds at whole-island scale. Cutting holes in one wall is cheap; a
  hundred buildings plus terrain is where an exact kernel could get slow or emit enough polygons to hit
  ADR-0069's node-count ceiling. This is the first thing the arc measures.
- **Bootstrapping:** the geometry kernel and the checker are inner-loop provable red-green. The kit,
  the palette, and the look calls remain orchestrator / owner outer-loop work.

## References

- [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) — **amends this
  ADR.** Decisions 2, 3 and 4 stand; decision 1's CSG mechanism is reversed, its "occlusion eliminated
  by construction" claim is corrected, decision 5's vision reviewer is demoted to advisor, and decision
  6's kernel constraints are re-scoped to runtime. Read it before relying on anything here.
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — parameterise the
  forest-world geometry, stay on SVG. This ADR upholds its decisions 3 and 4 and **amends** it: the
  silent-occlusion class is a fourth error class its three swap triggers do not cover. The fix is at the
  model layer rather than a substrate swap — though per ADR-0217 it is an explicit draw-order pass, not
  the boolean subtraction this ADR originally proposed.
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the shared forest-world render core; the
  engine-agnostic seam this lands beside.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) / [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md)
  — the look is operator-attested, stage 2.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one element per
  signal; complexity is emergent, not scored.
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted IAP members app (why free DOM text
  and accessibility are load-bearing).
- `packages/procedural-architecture` — the spike this rests on: `procedural-utils.ts` (the part-tree and
  the isometric projection seam), `invariants.ts` (the checker), `render-svg.ts` (the ~200-line backend).
- `packages/forest-world-r3f/src/ForestWorldCanvas.tsx` — "spike scale, no art direction"; why a prior
  impression of 3D is not evidence against it.
