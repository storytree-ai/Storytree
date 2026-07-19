# Prior-art survey — grounded art machinery (ADR-0214)

**Increment 1 of `grounded-art-machinery-arc`. Research only — no machinery built, no pipeline code
written, `csg.js` not vendored.** Dated 2026-07-19.

Readable version (same content, laid out): <https://claude.ai/code/artifact/ec93e0fd-005b-4793-967a-e0895548b8d1>

Seven questions put to the literature before any machinery is built, per the arc's owner call that
the first increment is a research pass which may reshape the arc. Method harness: 7 parallel
deep-research passes — 714 agents, 140 sources fetched, 691 claims extracted, **72 adversarially
confirmed**, plus two targeted verification passes on owner-supplied leads.

---

## Method integrity — read before the findings

This increment exists because a previous session asserted a confident claim about coplanar-face
handling in `csg.js` from model prior, and the library's own README contradicted it. So the failures
in this run are reported first rather than buried.

1. **Q6 produced nothing usable.** The run hit a session limit; 128 agents died. Q6 (off-the-shelf
   pipelines) had **all 25 verification panels fail** — zero confirmed claims. Its extractions are
   single-pass and unchecked, and are reported below as a direction only.
2. **The "refuted" bucket is contaminated.** Failed verifier votes appear to have counted as
   refutations, which systematically kills true claims. Proof: the BlindTest result (58.07% average)
   appears as *confirmed* from `arxiv.org/abs/2407.06581` and *refuted* from
   `arxiv.org/html/2407.06581v5` — same paper, same numbers. Several refuted entries carry empty
   reason fields. **Everything below rests only on adversarially-confirmed claims**; refuted items
   are treated as unadjudicated leads, never as disproof.
3. **Q3 is thin.** 4 of 25 adjudicated, 15 unverified — including its most promising lead. No verdict
   issued.

---

## Verdicts

| | Question | Verdict | Confirmed |
|---|---|---|---|
| Q1 | Shape grammars & procedural architecture | **Reshapes** | 17 |
| Q2 | LLM-driven art pipelines, 2024–2026 | **Reshapes** | 16 |
| Q3 | Geometry validity checking | *No verdict* | 4 |
| Q4 | VLM as critic | **Reshapes** | 10 |
| Q5 | LLM SVG / vector generation | **Confirms** | 10 |
| Q6 | Off-the-shelf whole pipelines | *No verdict* | 0 |
| Q7 | WFC / Townscaper family, re-examined | **Reshapes** | 15 |

No question returned *Replaces*. Nothing found makes the arc unnecessary — but several findings
change what should be built inside it.

---

## Q1 — Shape grammars: RESHAPES

**The part-tree is not a naive re-derivation of a split grammar, and the split-grammar authors are
the ones who say so.** Müller et al. state that a split grammar's strict hierarchy is *insufficient*
for mass modelling; CGA needed a separate "assembling solids" stage above it:

> "As split grammars maintain a strict hierarchy, modeling is fairly simple, but also limited.
> However, after introducing rules for combinations of shapes and more general volumetric shapes such
> as roofs, the strict hierarchy of the split-grammar can no longer be enforced... we did not find it
> suitable for many forms of mass modeling."

A part-tree of composed volumes occupies the mass-modelling level — the level split grammars
explicitly do not serve. Complementary layers, not competing answers.

**But the literature already names our error classes.** The class of "an aperture landing where it
must not" is called **occlusion**, a three-valued query (`none` / `part` / `full`) usable as a rule
guard, repaired *by rule selection* (demote window to wall, or delete) rather than by geometric
correction. Shipping CGA exposes `inside()`, `overlaps()`, `touches()` as first-class predicates —
covering what our checker re-invents as `aperture-containment`, `aperture-collision`,
`attachment-contact`. CGA also has semantic selectors (`eave`, `hip`, `valley`, `ridge`,
front/back/top/bottom) — prior art for "typed sockets, never a coordinate".

**Adopt:** the vocabulary (occlusion grading, the `inside`/`overlaps`/`touches` trio, roof-edge nouns
as socket names) and the repair idiom (demote/delete by rule, not geometric nudging).

Sources: <https://peterwonka.net/Publications/pdfs/2006.SG.Mueller.ProceduralModelingOfBuildings.final.pdf> ·
<https://doc.arcgis.com/en/cityengine/latest/cga/cga-context-queries.htm> ·
<https://doc.arcgis.com/en/cityengine/latest/cga/cga-comp.htm> ·
<https://esri.github.io/cityengine-sdk/html/cgaref/cgareference/cga_changelog.html>

---

## Q2 — LLM art pipelines: RESHAPES

**The loop is published prior art.** The constrained-authoring → validity-check → render →
vision-critique cycle exists in at least three systems. The architecture is not novel — good news for
its soundness, bad news for the assumption we had to derive it.

- **SimWorlds** ablates the machinery at a fixed model: removing the deterministic verifier drops
  Structural Pass Rate 0.97 → 0.87; removing staged construction drops the VLM score 0.87 → 0.76. A
  double dissociation — neither is redundant. It also independently identifies our exact failure class
  and solves it *without CSG*, via a declared contact/support protocol checked by BVH distance tests
  in both directions (declared contacts must touch; undeclared pairs must not interpenetrate).
- **LL3M** publishes the full agentic loop including a separate VLM verification agent — and reports
  our failure mode: the critic is unreliable on spatial relations, and a watering-can handle stays
  disconnected after auto-refinement.
- **3D-GPT** is direct prior art for "declare parts and dials, never a coordinate" — the LLM selects
  from curated typed procedural functions. No render-in-the-loop critique, so it is half our loop.

**The central bet is unvalidated.** Nothing found measures whether constraining the authoring surface
raises quality *independent of model tier*. Candidates either fix the tier or attribute gains
elsewhere (BlenderLLM's 7B beats o1-Preview via fine-tuning, not a constrained surface; LL3M leaves
the surface unconstrained by design). Nearest adjacent evidence: LL3M's BlenderRAG changes only the
scaffold and raises complex operations 1.20 → 5.86 with models held fixed.

Sources: <https://arxiv.org/pdf/2607.01766> · <https://arxiv.org/html/2508.08228v1> ·
<https://arxiv.org/abs/2310.12945> · <https://arxiv.org/abs/2412.14203> · <https://arxiv.org/abs/2403.01248>

---

## Q3 — Geometry validity: NO VERDICT (under-evidenced)

Only 4 claims survived. What they establish is real but narrow: Open3D defines *watertight*
compositionally (edge-manifold AND vertex-manifold AND not self-intersecting); trimesh defines it as
every edge in exactly two faces, treats consistent winding separately, and exposes **no single
`check() → Violation[]` call** — validity is independent boolean properties plus repair routines.

**The altitude gap:** this vocabulary is element-level topology. Our nine rules are architectural
semantics (`support-overlap`, `door-reachable`, `below-grade`). Nothing verified says that altitude
has a standard name.

**Unverified lead worth chasing:** buildingSMART's **IDS** (Information Delivery Specification) —
claimed to be the BIM world's standardised format for *model checking against declared information
requirements*, i.e. a rule schema we could adopt rather than invent.
<https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/README.md>

Sources: <https://www.open3d.org/docs/release/tutorial/geometry/mesh.html> · <https://trimesh.org/trimesh.base.html>

---

## Q4 — VLM as critic: RESHAPES

**The render-and-look station cannot carry the weight ADR-0214 assigns it.**

- **BlindTest**: on seven tasks trivial for humans (do two circles overlap; how many times do two
  lines intersect), four SOTA VLMs average **58.07%**; best is Claude 3.5 Sonnet at 77.84%; humans
  100%.
- **Absolute scoring is unreliable**: GPT-4V Pearson r = 0.454, Gemini 0.262, LLaVA-1.5-13b 0.247.
- **Biases are systematic and tier-resistant**: high-score bias, position bias (LLaVA replicates a
  demonstrated ordering 88.2% of the time), length bias (+0.6/+0.75). They persist in frontier models.
- **Pairwise only helps if order is controlled**: Qwen-VL-Chat swings 29% → 73% on presentation order
  alone; InternVL biases the opposite way.
- **Self-refinement degrades, and its published gains were an oracle artifact**: "the improvements...
  result from using oracles to guide the self-correction process, and the improvements vanish when
  oracle labels are not available." The same paper names the mitigation — self-correction *does* work
  with an external non-model verifier.

**Adopt:** programmatic checker is the gate and the VLM never is; pairwise against a reference render,
never absolute scoring; randomise order or run both and treat disagreement as abstention; bound the
refinement loop; keep the human verdict.

Sources: <https://arxiv.org/abs/2407.06581> · <https://arxiv.org/abs/2402.04788> ·
<https://arxiv.org/html/2407.04842v1> · <https://arxiv.org/pdf/2310.01798>

---

## Q5 — LLM SVG generation: CONFIRMS

**Direct vector authorship has not matured past ADR-0214's assumption.** SGP-Bench: frontier models
top out ~67% on the SVG track (Claude 3.5 Sonnet 67.4%, GPT-4o 64.8%) against a 25.9% random
baseline — on merely *reading* vector code. A purpose-built SVG benchmark names our bug class
directly: "3D scenes require ordering code so that later shapes occlude earlier ones, which is harder
under SVG's top-to-bottom rendering."

**The sharper finding: no benchmark in this field measures physical coherence.** VGBench scores CLIP
and FID; SGP-GenBench uses CLIP/DINO/VQA/HPS plus a model judge; Chat2SVG reports visual fidelity and
path regularity; MMSVG-Bench uses FID, aesthetic score and a 15-participant study. All appearance.
**Nothing would catch a floating roof.** Our invariant checker measures something this literature does
not measure at all.

**Unadjudicated lead:** VGBench is claimed to measure a ≥17-point gap favouring higher-level formats
(TikZ, Graphviz) over raw SVG, with representational level as the stated cause. If it survives
verification it is the most direct evidence for the central bet found anywhere.

Sources: <https://sgp-bench.github.io/> · <https://arxiv.org/html/2509.05208v1> ·
<https://arxiv.org/html/2504.06263v3> · <https://arxiv.org/html/2505.24499v2> · <https://chat2svg.github.io/>

---

## Q6 — Off-the-shelf pipelines: NO VERDICT (infrastructure failure)

All 25 verification panels failed. The following is **unverified direction only**, given so a re-run
has a starting point; no decision should rest on it.

Extractions point consistently one way: Meshy, Rodin Gen-2 and Tripo are hosted cloud APIs returning
binary mesh formats, with no documented determinism and no structural-validity guarantee (Meshy's
printability is separate opt-in repair endpoints). Houdini Indie is reported revenue-capped, unable to
use network licence servers, and format-locked away from commercial Houdini Engine; VITRUVIUS is
announced rather than shipping. **If it holds up, the market gap is our constraint set — not the
generation.**

---

## Q7 — WFC / constrained generation: RESHAPES

**ADR-0214's rejection reasoning is wrong.** It rejected WFC on the grounds that propagation and
verification are different problems. The literature says they are the same declarative artifact.

- WFC's propagation is standard CSP arc-consistency (AC-3, later AC-4) — not a bespoke generation
  algorithm. Propagators are explicitly *not* complete solvers; they are a separable component.
- In the ASP formulation the adjacency rule is an **integrity constraint** — a rejection predicate.
  The same statement prunes during search *and* rejects a finished assignment.
- **Direct precedent for `check(model) → Violation[]`:** ANTON runs the same rule base in a diagnosis
  mode that consumes an externally-authored artifact and emits named, located violations —
  "error(Part,Time,Reason) messages" — obtained from the generative spec rather than written
  separately.
- **Typed sockets have a name and a 2007 reference implementation**: Paul Merrell's model synthesis
  predates WFC by nine years; adjacency constraints are routinely derived by matching boundary
  cross-sections (Bad North classifies modules by whether polyline profiles match) — exactly "a
  `wall_top` accepts a `roof_bottom`".
- **Complete-only mode is inherited free**, answering the reinterpretation worry.

**Counterweight — do not over-correct.** Global invariants measurably degraded search (hundreds of
conflicts, one-minute timeout under WFC-style global restart, resolved only with local backtracking).
A solver dependency is neither browser-safe nor dependency-light.

**Adopt:** the formalism and vocabulary, not a solver — state invariants as integrity constraints over
the part model, keep our own deterministic evaluator. Cite Merrell as the source of typed sockets. Fix
the ADR's rejection text: reject WFC because we do not want *generation*, not on the false grounds
that verification is different machinery.

Sources: <https://adamsmith.as/papers/wfc_is_constraint_solving_in_the_wild.pdf> ·
<https://escholarship.org/content/qt1f29235t/qt1f29235t.pdf> ·
<https://adamsmith.as/papers/tciaig-asp4pcg.pdf> · <https://adamsmith.as/papers/tog-wfc.pdf> ·
<https://paulmerrell.org/model-synthesis/> · <https://github.com/merrell42/model-synthesis>

---

## Owner-directed follow-up: the layout-solver line

The owner independently proposed *build 3D, then flatten to 2.5D isometric*, with an LLM emitting a
structured scene spec handed to a deterministic solver — naming Holodeck, SceneAssistant and
HOG-Layout. All three were verified. **All three are real.**

**First: our substrate is already 3D→2.5D.** `procedural-utils.ts` is 3D throughout (right-handed
`Vec3`, z-up, Newell normals) and `project()` is labelled "the ONE place 3D becomes 2D" — a strict 30°
isometric projection. The proposal validates the substrate rather than overturning it. The genuine
change is at the **placement layer** — solver-placed rather than relation-derived — which converges
with Q7 from the opposite direction.

**Holodeck** — [arXiv 2312.09067](https://arxiv.org/abs/2312.09067), CVPR 2024, Apache-2.0,
`allenai/Holodeck`. (Lead author UPenn, not UW.) Confirmed: "we prompt GPT-4 to generate spatial
relational constraints between objects and then optimize the layout to satisfy those constraints." Ten
constraint types in five categories; **soft** relational constraints (violations permitted) vs **hard**
collision/boundary constraints. Solver is randomized best-of-N DFS over a discretized grid, wall-clock
bounded at 30s, with an opt-in Gurobi MILP path.
*Blockers:* assets are **retrieved** from 51,464 annotated assets by CLIP+SBERT — open-vocabulary
reinterpretation, structurally welded, not a flag. *Opportunity:* the solver is **separable** — only one
file in the generation tree imports `ai2thor`, and it is not the solver; `floor_objects.py` imports only
shapely/numpy/scipy/rtree. *Caution:* `random_seed` is assigned in the constructor and **never read
again**; live search calls `random.shuffle` unseeded; the search is wall-clock bounded. Non-deterministic
as shipped.

**SceneAssistant** — [arXiv 2603.12238](https://arxiv.org/abs/2603.12238), Luo et al., 2026-03.
Corrections to the popular description: it is a **single VLM** under ReAct doing both acting and visual
self-assessment (no LLM-actor/VLM-supervisor split); the action API is **13** commands, not 4, with
camera control first-class; assets are **generated** (Z-Image → Hunyuan3D); Blender is the substrate.
**The repo carries no licence at all** (`license: null`) — legally unusable as a dependency.

**HOG-Layout** — [arXiv 2604.10772](https://arxiv.org/abs/2604.10772), CVPR 2026. Force-directed
optimizer via explicit Euler integration, forces decomposed into planar `F_plane ∈ ℝ²`, vertical
`F_vert ∈ ℝ`, and yaw torque `τ`; physical forces (collision via SAT, boundary, support contact-area
ratio) and semantic forces (proximity, wall-adjacency, alignment). Its "rule library" is a **RAG
template library** injected into the LLM prompt, not a local rule engine. **No public code.** Assets
retrieved from ~51k curated from Holodeck.

**The closest match to the described actor/supervisor split is a different paper**: SceneSmith
([arXiv 2602.09153](https://arxiv.org/abs/2602.09153), ICML 2026 Spotlight) has explicit
designer/critic/orchestrator agents.

**Cross-cutting finding: across ~14 papers read in this line, not one claims determinism.** Holodeck's
seed is dead code; SceneAssistant concedes a good scene "may occasionally require multiple independent
executions of the same prompt"; HOG-Layout claims *convergence* (residual force below ε, or 300
iterations), which is not reproducibility. This field optimizes for plausibility-under-sampling because
its consumers are embodied-AI training environments where variety is the point.

**The ranking inverts.** The paper we cannot clone (HOG-Layout, no code) has the algorithm that fits
us — force-directed relaxation is **deterministic by construction**: fixed iteration cap, explicit
Euler, no sampling, pure arithmetic. The paper we can legally fork (Holodeck, Apache-2.0) has the
algorithm that fights our constraints hardest. What is adoptable is the **design vocabulary** —
Holodeck's hard/soft split, HOG-Layout's force decomposition — implemented ourselves as a
deterministic relaxation pass.

---

## Owner decisions taken during this increment (2026-07-19)

1. **The constraint set is relaxed and re-scoped to runtime, not build time.** ADR-0069 D4's
   determinism/no-WebGL requirement governs the *live world-geometry layer* ("this is *why* the layer
   stays on SVG/Canvas2D") — ADR-0214 D6 inherited it onto "the kernel choice", which is
   authoring-time tooling. Owner call: **the output need only be 2.5D, browser-compatible, and look
   good.** Pixel-determinism across GPUs and a GPU-free toolchain are dropped.
2. **Model-level determinism is retained** — same inputs, same part positions — because the
   prove-it-gate depends on a reproducible checker verdict, not for aesthetic reasons. Cost is zero
   (existing `hash`/`rand01` discipline).
3. **Baked parts, live composition.** The forest world's art is a function of live data
   (`scene.ts`: `sproutCount = tests * (status === 'building' ? 0.6 : 0.45)`; ADR-0062's one element
   per signal), so whole buildings **cannot** be baked. But *parts* carry no live data and can be.
   Consequence: **runtime never performs CSG**, and the boolean kernel becomes a build-time tool —
   which makes `manifold-3d` (filed REFERENCE ONLY in `asset:isometric-art-geometry-libraries` purely
   on browser-safety grounds) straightforwardly usable, and no GPU is required for it either.

**Open trade, not yet decided:** baked *raster* parts would forfeit free DOM text and accessibility
(load-bearing for ADR-0042's hosted members app) and could not recolour or regrow per signal the way
vector parts can.

---

## What this means for the arc

The core design survives its hardest test: the part-tree is not a naive re-derivation, and SimWorlds
arrived independently at parts + typed relations + a deterministic checker. That is convergent
validation. What changes is **novelty and cost** — the design is sound but not new, and its two most
expensive commitments are the two the evidence pushes hardest against.

**Candidate ADRs amending ADR-0214 (drafted by no one yet, deliberately):**

1. **Re-scope the constraint set** to build-time vs runtime, per the owner decisions above.
2. **Replace the vendored-kernel plan** with baked parts through a robust build-time kernel, retiring
   the hand-hardened `csg.js` increment and the Fable reservation for degenerate booleans.
3. *(Possible)* **Demote the vision reviewer** from gate to advisor, with the Q4 mitigations.
4. *(Possible)* **Correct the WFC rejection text** and cite Merrell for typed sockets.

Held pending a follow-up targeted research pass on the landed direction.

---

## What could not be verified

- **Q6, entirely** — 25/25 verification panels failed. No verified finding exists.
- **Q3, mostly** — 4 of 25 adjudicated; 15 unverified, including the buildingSMART IDS lead.
- **The refuted set (~63 claims)** — unreliable, evidenced by a same-paper self-contradiction. Several
  look substantive, notably VGBench's ≥17-point high-level-format gap.
- **Instant Architecture full text** — cg.tuwien.ac.at PDFs exceeded the fetch size limit; the
  peterwonka.net mirror returned HTTP 404. Split-grammar detail rests on the abstract plus the 2006
  paper.
- **Mesh-repair survey** `dl.acm.org/doi/10.1145/2431211.2431214` — taxonomy extracted, never adjudicated.
- **CVPR camera-ready PDFs** for Holodeck and HOG-Layout — `openaccess.thecvf.com` returned HTTP 403.
  Quotes come from arXiv HTML cross-checked against ar5iv; venues corroborated via arXiv metadata.
- **SAGE and VIGA** appear only as cited baselines; not fetched, treat as unverified.
