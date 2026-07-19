---
status: accepted
decided: 2026-07-19
amends: [214]
arc: grounded-art-machinery-arc
---
# ADR-0217: Art factories are per object type: parametric kit, explicit draw order, render-and-look loop

## Status

accepted (2026-07-19) — decided/directed by the owner in conversation on 2026-07-19, after the
increment-1 and increment-2 prior-art passes (PR #819 / PR #820) and a re-grounding on the
house-art swarm's actual defect record. Design-time alignment IS the ratification (ADR-0110); no
second end-of-flow ask.

## Context

[ADR-0214](0214-ground-ai-authored-art-in-a-physical-model-csg-over-svg-not.md) was written from a
spike plus in-session reasoning. Two research increments and one re-reading of the empirical record
have since moved three of its load-bearing assumptions.

**The origin evidence, restated.** The house-art swarm (2026-07-18, `docs/research/forest-house-art/`)
vibed out 19 isometric buildings. They looked good and were full of physical mistakes. Two buildings
subsequently pulled through the `packages/procedural-architecture` spike — a parametric part-tree with
derived positions plus a pure invariant checker — and the owner's eye rated the results significantly
better. That contrast is the whole reason this arc exists, and it is the strongest evidence available:
increment 2's question E went looking for published validation that a constrained authoring surface
raises quality independent of model tier, found VGBench's ≥17-point gap, and found it too confounded
to cite (different corpora per format; the paper's own VLM baseline reverses the ordering; the gap
narrows as models scale). We have no external validation of the central bet. We have our own n=2, on
our own art, judged by the owner.

**What the defect record actually says.** The swarm's `README.md` catalogues every surviving defect
across the 19 houses. Classified, the two dominant classes are:

- **Floating / no-contact — 7 houses.** A crystal shard disconnected from its spire; lantern rods
  attaching in mid-air; a deck railing ending mid-span with no post; a corbel narrower than the bay it
  carries.
- **Depth-order inversion — 5 houses.** A windmill sail blade drawing *behind* the balcony railing it
  should sweep in front of; stepping stones z-ordered backwards; a relocated rock drawing over an eave
  tip that should be in front of it.

Each of those houses is a single object drawn by a single author, so the second class is not an
artifact of composing many objects. Two of those inversions were **introduced by the fix pass itself**
(`coastal-lighthouse`, `trail-gatehouse` each corrected real faults and created a fresh z-order bug).

**Three assumptions that do not survive that record.**

1. **The part-tree does not eliminate occlusion inversions.** ADR-0214 decision 1 claims CSG kills the
   silent-occlusion class "by construction", and the swarm README repeats the claim for the parametric
   system. A part-tree derives *positions*; it does not derive *draw order*. The spike's own documented
   bug was a centroid painter's sort placing a ground-level door behind the wall it was cut into while
   the checker returned zero violations. The largest defect class is killed by derivation; the second
   largest is untouched by it, and both documents currently claim otherwise.
2. **Nothing in the defect record motivates a boolean kernel.** Zero of the 19 houses has a defect a
   CSG subtraction would have prevented. The aperture-adjacent defects are all placement and occlusion
   — a window straddling a panel seam with the seam drawn through it, a door hanging 15px off its wall
   plane, a brace overlapping a window-frame corner. Increment 1 independently found that CGA does
   apertures as facade subdivision and asset instancing rather than subtraction, that Müller et al.
   deliberately avoided booleans citing their unreliability, and that SimWorlds solves this exact
   failure class without CSG.
3. **A general composition layer is not needed.** `packages/forest-world/src/scene.ts` is already a set
   of per-type factories — `buildTree`, `buildPlant`, `buildConifer`, `buildSignpost`, `buildBloom`,
   `buildPlate`, `buildTerritorySurface`, `buildTerritoryFlora` — each taking parameters plus a seed and
   emitting a `SceneG`. Nothing connects them; island placement is procedural rules plus `rand01`
   jitter, and it has carried the world for months. Increment 2's questions B and C researched
   deterministic layout solvers at length and both returned negative: write nothing (B), fork nothing
   (C).

**What already works and is un-productised.** Round 4 of the swarm — one artist agent per house in a
**render → look → refine** loop, editing the SVG, rendering its own edit to PNG, reading that PNG, and
stopping only once it had looked at and accepted its own output — applied 136 geometry fixes and won
its before/after verify on all 19 houses. It was not naked self-refinement: an independent judge ran
before/after and **reverted two auto-fixes that made things worse**. Increment 2's question Q4 found
that VLM self-refinement degrades without an external verifier and that published gains were an oracle
artifact — and named exactly this mitigation. The literature and the in-house result agree.

**The owner's scope calls (2026-07-19, directed in conversation).** The map view is top-down and
perfection is not the bar — sizing follows from what survives being small, which is silhouette. The
entry point is either concept art generated elsewhere (e.g. nano banana) or a direct prompt; either way
the artifact goes **to a model**, never into our code.

## Decision

**Art is produced by a factory per object type — building, plant, landscape — each a five-station
pipeline with a model at both ends and deterministic machinery in the middle. ADR-0214's authoring-model
direction stands; its CSG mechanism, its occlusion claim, and its implied general composition layer do
not.**

1. **One factory per object type, and no factory that connects them.** Cross-object placement stays
   what it is today: procedural rules plus seeded jitter in `scene.ts`. No layout solver is built.
   ADR-0214's part-tree, typed sockets and face-relative aperture placement stand as the *intra*-object
   authoring surface (its decision 2 is upheld).
2. **Station 1 — author.** A model authors parts, sockets and dials, never coordinates, optionally
   holding a reference image. **The reference is never parsed by our code**, and vector output from an
   image model is re-authored through the parametric surface rather than inlined — consuming free-form
   vector is precisely the failure that produced the 19 defective buildings.
3. **Station 2 — derive and check.** Positions are derived from `on` / `attached` relations, making a
   floating part inexpressible; `check(model) → Violation[]` returns named, located violations for what
   derivation cannot see. This kills the 7-house floating/contact class. ADR-0214 decision 3 stands.
4. **Station 3 — order and bake, and this is net-new.** An explicit deterministic draw-order pass runs
   before bake, because nothing upstream covers occlusion and the refine loop regenerates these bugs
   without it. Centroid sorting is not repairable by sorting better; correctness requires splitting
   interpenetrating polygons (BSP, per GL2PS's `BEST_ROOT` precedent). Sizing is governed by the
   top-down scope call: silhouette-changing inversions are in scope, sub-pixel precision is not.
   Parts bake at build time and the runtime composes them, so **the runtime performs no geometry**.
5. **Apertures are authored as compound paths, not boolean subtractions. The CSG kernel is not
   adopted.** ADR-0214 decision 1 is reversed on its mechanism. `manifold-3d` is recorded as a
   qualified build-time fallback should a future defect actually demand booleans (Apache-2.0;
   cross-platform bit-exact determinism proven in CI under `MANIFOLD_PAR=OFF`, which is the shipped npm
   default; open defect #1706 emits silent slivers on near-coincident input, so cut through rather than
   flush) — but it is **not** a dependency today and the vendored-`csg.js` plan is retired, along with
   the Fable reservation for degenerate booleans.
6. **Station 4 — render, look, refine.** Bounded at three passes, with an independent before/after
   judge empowered to revert. The vision reviewer is an **advisor, never a gate** (ADR-0214 decision 5
   is amended): BlindTest puts four SOTA VLMs at 58% average on geometry trivial for humans, absolute
   scoring is unreliable, and self-refinement degrades without an external verifier. The programmatic
   checker of station 2 is the gate.
7. **Station 5 — the owner attests the look.** Unchanged, and not automatable (ADR-0070 stage 2 /
   ADR-0159). ADR-0214 decision 4 stands: fidelity to the existing look is the metric and improving the
   art is a non-goal.
8. **Concept art designs the factory, not the instance.** A reference image informs one object type's
   kit once, deliberately; instances are then composed from that kit. This is what reconciles a
   generative entry point with ADR-0214 decision 4's "report the gap, never reinterpret". *(Proposed in
   conversation and approved by the owner; if per-instance references are later wanted, that is a fresh
   decision.)*

Rejected: a general cross-object composition or layout solver; forking Holodeck's solver; adopting
buildingSMART IDS as the rule format; a boolean kernel as a present-day dependency; any machine-signed
look verdict.

## Consequences

- **Good:** the expensive, Fable-reserved piece of ADR-0214 is removed rather than solved — no WASM
  dependency, no exact-boolean hardening, no degenerate-case work. The package family stays pure and
  zero-dependency.
- **Good:** the two dominant empirical defect classes each get a station that provably addresses them,
  rather than one mechanism assumed to address both.
- **Good:** the reusable technique the swarm already demonstrated at n=19 becomes a pipeline instead of
  a paragraph in a README.
- **Cost:** the draw-order pass is net-new and was not in any prior plan. A correct implementation needs
  polygon splitting, and split count inflates node count — ADR-0069's ceiling is the thing to watch.
- **Cost:** render-to-PNG remains net-new infrastructure (no `resvg`, `sharp` or `puppeteer` today);
  without it station 4 does not exist. Unchanged from ADR-0214.
- **Cost:** a factory per object type means the work does not amortise across types the way a general
  system would have. That is the deliberate trade — generality is what produced the layout-solver and
  occlusion-solver problems that stations 3 and B/C respectively resolved by narrowing scope.
- **Resolved (2026-07-19, increment 4 — the question this ADR posed and the increment closed):** how
  compound-path apertures show a wall's thickness as a reveal. The suspicion above was that it would
  have to be a *painted* trapezoid; it is a trapezoid, but a **real** one — `reveal()`
  (`packages/procedural-architecture/src/apertures.ts`) emits an outer rim, a pane set back along the
  facet normal, and jamb/head quads bridging them, so the reveal takes the same N·L shading as every
  other surface and cannot drift out of register with the hole it lines. Two quads per opening, no
  boolean kernel, no new dependency — so **decision 5 stands unchanged and `manifold-3d` remains
  unused**. `DEFAULT_REVEAL` is 0.34, compared at 0 / 0.18 / 0.34 / 0.7 on both flat and tapered
  facets. What is settled is that the approach produces real reveal geometry; **the look verdict is
  still the owner's and is not yet given** (ADR-0070 stage 2, decision 7).
- **Resolved (2026-07-19, increment 5 — a question this ADR did NOT pose, and decision 4's missing
  half):** decision 4 says parts bake at build time and the runtime composes them, but left open *what
  a baked part is* and *who may consume one* — which mattered the moment a second surface wanted a
  building, because the factory emits a full SVG document and a scene consumer wants drawables. The
  answer needed no adapter and no second pipeline: the pipeline splits **one step before markup**.
  `bake.ts` runs shade / cull / cut / order / project and returns resolved vector drawables in painter
  order; `render-svg.ts` was reduced to a *printer* of that list. **One bake, two printers** — a second
  consumer therefore cannot drift from the SVG backend, and a test holds the seam by asserting the
  printer emits exactly one element per baked node. Decision 4 stands unchanged and is now realised.
- **Measured (2026-07-19, increment 5) — a building's DOM cost is NOT its polygon count, and the cost
  bullet above is the thing it bears on.** The prediction that split count inflates node count held;
  the ratio is now measured at roughly **1.5x**, because every fragment the ordering pass splits emits
  *two* nodes — a fill and an outline. Increment 4's arc entry recorded the mushroom at 936 polygons
  and read that figure against ADR-0069's 1,000–3,000 comfortable ceiling as "~30% of the budget";
  the true node cost is ~1,394, i.e. about **half** the comfortable ceiling for one building. Guarded
  by a node-cost test in `bake.test.ts`. Coplanar-fragment merging remains the un-taken mitigation.
  This is why increment 5's `?factoryart=on` flag defaults **off**, and the default is load-bearing
  rather than mere caution: the studio map's own node count is already unbounded in work volume
  (`scene.ts` scales vegetation as `2 + tests * 1.9`, with no LOD, culling or density budget), so
  stamping a ~1,400-node building per story is a density decision that has not been taken.
- **Discovered, and an OPEN OWNER CALL (2026-07-19, increment 5) — baked art cannot currently enter
  the shared scene-graph.** A baked facade's fill is its material modulated by N·L, so two walls of one
  building differ and no CSS class can name them. But `SceneNodeBase`
  (`packages/forest-world/src/scene.ts`) deliberately carries no fill/stroke:
  [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) decision 1 keeps
  colour class-driven and its decision 4 shares *the look only*. Increment 5 therefore placed the
  buildings in studio **chrome**, where ADR-0102's flat identity glyphs already lived (ADR-0093
  decision 2's line), behind `?factoryart=on`, default off. The consequence is real and is not a bug:
  the public website never gets buildings, and `packages/forest-world-r3f`'s mapper would emit
  `{ kind: 'skipped' }` for any building kind. **Whether baked art may carry its own paint into the
  shared scene is an owner fork — it would amend ADR-0093, and it is NOT decided here.** Recorded so
  the next session finds the constraint rather than rediscovering it, or widens `SceneNodeBase`
  without noticing that doing so is a fork.
- **Unresolved, and honestly so:** the central bet — capability from machinery rather than model tier —
  remains externally unvalidated (increment 2, question E). It rests on an in-house n=2. The
  human-in-the-loop entry point means the machinery does not have to carry that bet alone.

## References

- [ADR-0214](0214-ground-ai-authored-art-in-a-physical-model-csg-over-svg-not.md) — **amended**: its
  authoring-model direction and decisions 2/3/4 stand; decision 1's CSG mechanism is reversed, its
  "occlusion eliminated by construction" claim is corrected, decision 5's vision reviewer is demoted to
  advisor, and decision 6's kernel constraints were already re-scoped to runtime by the owner (inc 1).
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — stay on SVG;
  parameters and generators, never hand-placed coordinates; the node-count ceiling station 3 must watch.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) /
  [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md) — the look is
  operator-attested, stage 2.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one element per
  signal; why whole buildings cannot be baked but parts can.
- `docs/research/grounded-art-prior-art-survey.md` (increment 1, PR #819) — shape grammars, LLM art
  pipelines, VLM-as-critic, WFC/Merrell.
- `docs/research/grounded-art-prior-art-addendum.md` (increment 2, PR #820) — the boolean kernel, the
  draw-order finding, the layout-solver negatives, IDS, VGBench.
- `docs/research/forest-house-art/README.md` — the 19-house defect record this ADR is grounded in.
- `packages/procedural-architecture` — no longer the spike this ADR was written against: stations 1–3
  are shipped (the part-tree, the checker, `draw-order.ts`, `apertures.ts`), `bake.ts` is the pipeline
  tail that returns drawables, and the SVG backend is now an 83-line printer over that bake rather than
  the pipeline's end. `baked/kit.json` is the build-time roster of decision 4, drift-guarded by a test.
- `packages/forest-world/src/scene.ts` — the per-type factories that already exist and already work.
