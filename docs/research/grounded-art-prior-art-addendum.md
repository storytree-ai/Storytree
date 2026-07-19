# Prior-art addendum — targeted pass on the landed direction (ADR-0214)

**Increment 2 of `grounded-art-machinery-arc`. Research only — no machinery built, no pipeline code
written, nothing vendored, no ADR drafted.** Dated 2026-07-19.

Readable version (same content, laid out): <https://claude.ai/code/artifact/bd930cd2-0e42-41e7-ad55-34750cce388a>

Companion to [`grounded-art-prior-art-survey.md`](grounded-art-prior-art-survey.md) (increment 1,
PR #819). That survey asked seven broad questions before any machinery was designed. This pass asks
five narrow ones **around where increment 1 landed** — the owner's re-scoping of the constraint set to
runtime, and the baked-parts/live-composition decision that made a build-time boolean kernel viable.

Method harness: 5 targeted research agents, deliberately small. Increment 1's 714-agent run hit a
session limit and its failed verifier votes were scored as refutations; this pass was sized to stay
inside the limit and every agent was instructed to report infrastructure failures as failures. Each
section below carries its own **Could not verify** list, and those lists are load-bearing — read them.

---

## Verdicts

| | Question | Verdict |
|---|---|---|
| A1 | `manifold-3d` as a build-time boolean kernel | **Clears the bar** — adopt |
| A2 | 3D → filled vector with hidden-surface removal | **Reshapes** — the hard part is not the kernel |
| B | Deterministic relaxation layout | **Write it ourselves** — the formalism is 1991, published |
| C | Holodeck solver, forked | **Vocabulary only** — do not fork |
| D-i | Off-the-shelf whole pipelines | **Confirms** — the market gap is our constraint set |
| D-ii | buildingSMART IDS | **Borrow the shape, kill the format** |
| E | VGBench ≥17-point gap | **Partially confirms, badly confounded** |

**The headline is A2, and it is not what we went looking for.** The boolean kernel question resolved
cleanly and cheaply. The question that did *not* resolve cleanly is the one ADR-0214 assumed was
already solved — see "The correction that matters most" below.

---

## A1 — `manifold-3d` clears the bar

Increment 1 filed Manifold as REFERENCE ONLY purely on browser-safety grounds. The owner's build-time
re-scoping removes that objection, and on inspection the library is a **better** fit than the vendored
`csg.js` plan on the one axis we care about most.

- **Licence: Apache-2.0**, verified from the LICENSE file and from npm registry metadata.
- **Determinism is DEMONSTRATED IN CI, not claimed.** The README makes no determinism claim at all —
  so recall-based reasoning would have found nothing here. But `manifold.yml` runs an "Export
  determinism meshes" step on Windows, Linux and macOS under `MANIFOLD_OBJ_HEX_FLOAT: 1`, feeding a
  final "Cross-platform determinism check" job. Hex-float OBJ means **bit-exact**, not eyeball-equal.
- **The covered cases are exactly ours.** Six boolean tests: `DeterminismSimpleSubtract`, `…Union`,
  `…Intersect`, `MultiCoplanar`, `NonIntersecting`, `AlmostCoplanar`. Aperture subtraction with
  coplanar and near-coplanar walls is the covered surface, not an adjacent one.
- **Determinism is actively defended.** PR #1681 replaced `std::hypot` because it is "recommended but
  not required correctly-rounded (IEEE 754 §9.2)" — a project fixing *theoretical* FP divergence that
  its own CI had not caught.

**Two scope limits, both load-bearing.**

1. **The guarantee holds only with threading OFF.** PR #1594 sets `MANIFOLD_PAR=OFF` to remove
   "threading as a source of ordering nondeterminism". Parallel builds are outside the guarantee.
   This lands in our favour: `MANIFOLD_PAR` defaults to `OFF` and the package's own `build:wasm`
   script does not enable it, so **the shipped npm WASM build sits inside the asserted
   configuration** — but we must verify that for whatever build we consume, and never enable TBB.
2. **Input must be manifold.** Non-manifold input yields an error status; a `Merge` function fixes
   "slightly non-manifold meshes". It fails loudly, which suits a checker verdict.

**One open defect to design around — issue #1706.** Booleans emit sliver triangles on *near*-coincident
inputs (three vertices within FP noise, ~1e-6 on a 25,400-unit mesh). Critically these return
`Status() == NoError` and stay manifold, so **they are silent** — the same failure signature as the
occlusion bug that motivated this whole arc. Mitigation: cut apertures strictly *through* walls
(over-extrude the cutter past both faces) rather than flush-coincident, and add a sliver check before
projection. Also open: #1683, CrossSection loses double precision — avoid the 2D CrossSection path.

**A correction to the arc's framing that should survive into any ADR:** the coplanar risk is real but
it lives in **near**-coincidence, not exact coplanarity. `MultiCoplanar` is a *passing* determinism
test case. The original session's worry was aimed at the wrong target.

**API shape** is exactly our case — `cube()`, `subtract()`, `translate()`, `getMesh()` returning flat
`vertProperties: Float32Array` / `triVerts: Uint32Array` triangle soup, ready to project. Latest 3.5.1.

**Alternatives, ranked:** OpenCASCADE (LGPL-2.1, active — doubles as an A2 asset via its HLR); CGAL
corefinement (booleans sit in CGAL's **GPL** tier, a real constraint for a hosted app); libigl (GPL-3.0,
and leans on CGAL anyway); Cork (last pushed 2020, effectively dead — do not adopt).

Sources: <https://raw.githubusercontent.com/elalish/manifold/master/LICENSE> ·
<https://github.com/elalish/manifold/blob/master/.github/workflows/manifold.yml> ·
<https://github.com/elalish/manifold/pull/1594> · <https://github.com/elalish/manifold/pull/1681> ·
<https://raw.githubusercontent.com/elalish/manifold/master/scripts/determinism_cases.sh> ·
<https://github.com/elalish/manifold/issues/1706> · <https://www.cgal.org/license.html>

**Could not verify:** `npmjs.com/package/manifold-3d` 403s (worked around via `registry.npmjs.org`;
download counts not obtained). Issue #1706 has no maintainer reply, so "known defect" is the
reporter's framing, not the project's position.

---

## A2 — the correction that matters most

**ADR-0214 D1 claims CSG "eliminates the silent-occlusion class by construction". That is true for
apertures and false for everything else.**

Subtracting a window from a wall does remove the decal that had to be depth-sorted — that part of D1
holds. But the moment two *parts* overlap in projection — a roof overhang crossing a wall, a porch in
front of another wall, an L-plan wing — we are back to sorting filled polygons, and CSG has not helped
at all. The spike's original bug was a ground-level door painted behind its wall while the checker
returned zero violations. The same failure signature returns one level up, between parts.

**Centroid sorting is not repairable by better sorting.** The documented, adopted solution is
**BSP-tree splitting**: the interpenetrating polygons must be *split*, not ordered. GL2PS credits
Bruce Naylor for the BSP and occlusion-culling approach, inserts primitives into a BSP tree, and
traverses "back to front in a painter-like algorithm" with `GL2PS_BEST_ROOT` choosing roots "leading
to the minimum number of splits".

There is a pleasing irony here: increment 1's own techstack artifact already noted that vendored
`csg.js`'s BSP tree "is independently valuable: it is the exact-occlusion solution even if only used
for depth-correct polygon splitting". **That, not the booleans, turns out to be the part worth
keeping** — and if we adopt manifold for the booleans, we still need a BSP splitter for the render.

**The second, harder finding: almost everything in the 3D→vector space produces LINE ART, and we
need FILLED FACES.** That eliminates most of the obvious candidates outright.

Ranked shortlist:

1. **Own isometric projector over manifold's triangles, with a BSP pre-split.** Manifold hands us
   `triVerts`/`vertProperties` directly and our projection is a fixed isometric, so a splitter is
   tractable and stays in-repo, deterministic, and checkable. Strongest fit with the prove-it-gate.
2. **GL2PS** with `GL2PS_BSP_SORT | GL2PS_OCCLUSION_CULL` — the only *verified* off-the-shelf path to
   filled-polygon SVG with correct occlusion. Failure modes: slow, large output, splitting inflates
   polygon count (hits ADR-0069's node-count ceiling), v1.4.2 dated 2022, and we would own the
   binding. **Do not route via VTK** — on the OpenGL2 backend `vtkGL2PSExporter` rasterizes 3D props
   into the background, yielding a bitmap, not vector faces.
3. **CadQuery `hlr()`** — genuinely does hidden-line removal via OCCT `HLRBRep_Algo`, orthographic,
   with projection-direction control. But its SVG writer emits `fill="none"` stroke groups: **correct
   HLR geometry, no fills.** Viable only if we assemble faces ourselves.
4. **Blender Freestyle SVG** — real occlusion (visibility query, not painter sort), and *Fill
   Contours* exists, but fills are per-object silhouettes rather than per-face flat shading, and the
   manual itself warns "This feature is somewhat unstable" and that layer order "is by no means
   perfect". Also: "No edges at face intersections are detected yet." Heavy dependency,
   doc-claimed fills with no demonstration found.

**Rejected with reasons:** three.js `SVGRenderer` does emit filled faces but sorts by projected z with
no splitting and no occlusion culling — cyclic overlap renders wrong. `svg3d` sorts by Z centroid,
which its own author calls "a very approximate way". fogleman's `ln` is ray-cast line art, last
pushed 2019. `vpype`'s `occult` consumes 2D SVG, not 3D meshes — useful only as a post-pass.
OpenSCAD `projection()` flattens to a z=0 silhouette with no per-face regions.

Sources: <https://geuz.org/gl2ps/> · <http://www.geuz.org/gl2ps/gl2ps.pdf> ·
<https://vtk.org/doc/nightly/html/classvtkGL2PSExporter.html> ·
<https://raw.githubusercontent.com/CadQuery/cadquery/master/cadquery/occ_impl/exporters/svg.py> ·
<https://docs.blender.org/manual/en/4.1/addons/render/render_freestyle_svg.html> ·
<https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/renderers/SVGRenderer.js> ·
<https://prideout.net/blog/svg_wireframes/>

**Could not verify:** GL2PS's C source (`gitlab.onelab.info` blocked by anti-bot, GitHub mirrors 404)
— **polygon splitting is inferred from documented `BEST_ROOT` wording, not from reading
`gl2psSplitPrimitive`.** This is the one claim in the top recommendation resting on docs rather than
code; worth a spike before committing. `projects.blender.org` 403s throughout, so the Freestyle fill
defect issues are unread and nothing is asserted about them. Blender's Geometry Nodes boolean and
determinism posture went unverified in both this agent's pass and D-i's — `docs.blender.org` 403s.

---

## B — deterministic relaxation layout: write it ourselves

**HOG-Layout has no public code and we do not need it.** Its algorithm is a re-skin of a published
1991 formalism. The thing to stand on is **Fruchterman–Reingold's temperature-limited displacement
loop**, with **d3-force** (ISC) as the determinism-design reference — its default random source is a
*fixed-seed* LCG and its default alpha decay is calibrated to exactly 300 iterations, the same cap
HOG-Layout uses. The pass is roughly 300 lines.

Increment 1's summary of HOG-Layout was **accurate in every particular checked** against the paper:
the planar/vertical/yaw force decomposition, SAT collision with a minimum translation vector, support
via contact-surface-area ratio, explicit Euler with separate step sizes, and convergence at
`F_residual < ε_conv` capped at `T_max = 300`. Both deadlock escapes confirmed.

**One correction, and it matters.** The vertical-deadlock escape works by *shrinking the object along
Z*. That silently mutates part geometry. Fine for a plausibility metric; fatal for a checker that
verifies a roof is the specified size. If adopted, it must raise an explicit failure, not quietly fix.

**The single most useful distinction this pass produced — sampling vs relaxation.** The furniture-layout
classics that everyone reaches for **fail our determinism requirement outright**:

- **Yu et al., "Make it Home" (SIGGRAPH 2011)** — its own keywords include "stochastic optimization";
  simulated annealing with a Metropolis-Hastings step, ~25,000 iterations, random initialisation, and a
  criterion that "can accept moves that increase the cost". Non-deterministic by construction.
- **Merrell et al., "Interactive Furniture Layout" (SIGGRAPH 2011)** — "rapidly sampling the density
  function using a hardware-accelerated Monte Carlo sampler". No code released.
- The residential-floor-plan line is the same family, and Yu et al. cite it as precedent.

Force-directed relaxation is the branch that fits, and Fruchterman–Reingold says so itself: "Simulated
annealing decides probabilistically whether to accept a transition to an inferior configuration, but
our force-directed placement always seeks the lowest ground." **But note FR's one admitted randomness
source** — for coincident vertices it acts "as though the two vertices are a small distance apart in a
randomly chosen orientation". Exactly-coincident parts are *common* in building layout, so that
tie-break must be replaced with a deterministic rule (break by part ID).

**Position-Based Dynamics is the better architectural match, with one hazard the paper names for us.**
Explicit constraint functions projected a fixed number of times, no sampling. But Müller et al. 2007
states plainly that Gauss-Seidel projection produces an effect "dependent on the order in which
constraints are solved… the process can lead to oscillations if the order is not kept constant." Read
that as the engineering spec: **fix the constraint ordering by a stable part key, never by hash-map
iteration order.** XPBD's contribution is orthogonal but worth having — it fixes PBD's property that
"constraints become arbitrarily stiff as the iteration count increases", which means convergence
tuning won't silently move parts.

**There is no published termination guarantee anywhere in this literature.** FR admits its own
termination "is guesswork"; ForceAtlas2 is blunter — "Our layout stops exclusively at the user's
request". A hard iteration cap is universal practice. **For a prove-it-gate the honest posture is to
treat "hit the cap without reaching `ε_conv`" as a RED verdict, not a pass with a warning.**

Standard escapes, in order of pedigree: cooling/displacement clamping (FR found "quenching and
simmering" beat steady decay); velocity damping (d3-force's `velocityDecay`, whose docs warn less decay
"risks numerical instabilities and oscillation"); per-node adaptive speed (ForceAtlas2's "swinging"
measure); and explicit deadlock escapes (HOG-Layout's orthogonal push is safe, its Z-scale is not).

| Implementation | Licence | Fit |
|---|---|---|
| [d3-force](https://github.com/d3/d3-force) | ISC | Best determinism reference; 2D only, no yaw/Z — adopt the design, not the code |
| [PositionBasedDynamics](https://github.com/InteractiveComputerGraphics/PositionBasedDynamics) | MIT | Reference PBD/XPBD, C++; makes no determinism claim; usable as a correctness oracle |
| HOG-Layout | — | No implementation exists |
| Merrell 2011 / Yu 2011 | — | No code; sampling-based anyway |

Sources: <https://arxiv.org/html/2604.10772> ·
<https://www.mathe2.uni-bayreuth.de/axel/papers/reingold:graph_drawing_by_force_directed_placement.pdf> ·
<https://matthias-research.github.io/pages/publications/posBasedDyn.pdf> · <https://mmacklin.com/xpbd.pdf> ·
<https://web.cs.ucla.edu/~dt/papers/siggraph11/siggraph11.pdf> ·
<https://graphics.stanford.edu/projects/furniture/> ·
<https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679>

**Could not verify:** `openaccess.thecvf.com` 403s as expected — all HOG-Layout claims rest on the
arXiv HTML. Bender et al.'s PBD survey 404s. Merrell 2011's optimiser section unread (Berkeley TLS
hostname mismatch); characterised from its Stanford project page. Eades 1984 and Kamada–Kawai 1989
not fetched directly — described only via FR 1991, which was read. Weiss et al. not investigated.
d3-force's bit-reproducibility across JS engines unverified — **recommend the gate compare positions
at a fixed tolerance, not by exact float equality.**

---

## C — Holodeck: adopt the vocabulary, do not fork

Increment 1 called the solver separable and the fork cheap. Reading the actual code, the separability
holds but **the fork does not** — and the reason is one increment 1 missed entirely.

**The 30-second wall-clock bound is load-bearing on OUTPUT QUALITY, not just on runtime.** The DFS
appends every completed layout to `self.solutions` and takes an argmax over the accumulated
candidates. More seconds means more candidates means a better answer. This is **anytime best-of-N**,
so replacing wall-clock with an iteration budget changes the output *distribution*, not merely its
reproducibility — and the tuned weights (`1.0/0.5/0.5/0.5/1.8`) no longer sit at their tuned operating
point. You inherit ~850 lines of Python that must become deterministic TypeScript *and* be re-tuned.

**Verified against the code, with corrections to increment 1:**

| Claim | Verdict |
|---|---|
| Real paths are `modules/generation` | **Corrected** — `ai2holodeck/generation/` |
| LLM-generated constraints, then layout optimisation | Confirmed |
| Ten constraint types in five categories | **Corrected** — five categories exactly; the parse map holds **16 keys**, and several parse but never dispatch (`around` has no handler) |
| Randomised best-of-N DFS, 30s wall-clock | Confirmed, with a nuance — the class default is `max_duration=5`; 30 is passed at the call site. The wall solver runs at 5s |
| `random_seed` assigned and never read | **Confirmed decisively** — grep returns exactly two lines: the parameter and the assignment. The only `random.seed(...)` in the file is inside a dead test method |
| Only one file imports `ai2thor`, and it is not the solver | **Corrected** — *two* files do (`small_objects.py` and `utils.py`), and `floor_objects.py` imports from the latter. Separability holds at **class** granularity, not file granularity |

**Nondeterminism sources are few and cheap to fix** — five `random.shuffle`/`randint`/`sample` call
sites, plus unconditional `multiprocessing.Pool` in the wall and small-object solvers. No `np.random`,
no set iteration, no unstable sort keys. Seeding is genuinely a one-instance change. **It is the time
bound, not the seed, that makes the fork expensive.**

**Asset coupling: none** — this is the axis where increment 1 was right. `object_dim` unpacks to
`(obj_length, obj_width)`; the database→bbox conversion happens *outside* the solver class; collision
is pure shapely polygon intersection. Our parametric parts would feed it a footprint tuple and nothing
else. Solver dependency licences are all permissive (shapely BSD-3, rtree MIT, scipy BSD, numpy BSD-3);
only Gurobi is proprietary and it is opt-in.

**The vocabulary is worth taking, with one gap that disqualifies it as-is:**

| Category | Weight | Types |
|---|---|---|
| `global` | 1.0 | `edge`, `middle` |
| `relative` | 0.5 | `in front of`, `behind`, `left of`, `right of`, `side of` |
| `direction` | 0.5 | `face to`, `face same as` |
| `alignment` | 0.5 | `center aligned`, `edge alignment` |
| `distance` | 1.8 | `near`, `far` |

The **hard/soft split is confirmed and worth adopting**: collision and boundary are *filters* that
delete candidates; relational constraints only *add score*. The `edge` term is an instructive hybrid —
the code comments "edge is hard constraint" when restricting to edge solutions and "edge is soft
constraint" when falling through. One vocabulary term switching hard/soft by value is a pattern worth
stealing. The relative predicates are already **rotation-aware**, dispatching on target rotation
0/90/180/270 — exactly the isometric case.

**What does not transfer: the entire vocabulary is 2D-footprint-on-a-floor. There is no vertical
axis** — no "above", "below", "attached to", "supported by". `wall_objects.py` handles height
separately and *randomly*. For roof-on-wall, porch-under-eave and aperture-in-wall we must invent the
containment and adjacency-with-contact predicates anyway. Also missing: symmetry, and any
structural-soundness predicate.

**Recommendation: adopt-vocabulary-only.** A from-scratch deterministic pass is a smaller, honester
artifact — enumerate candidates on a fixed grid in fixed order, score with the same five weighted
categories, argmax with an explicit tie-break. Determinism becomes structural rather than retrofitted.
Note that fixed enumeration order removes the *need* for a seed entirely; the seed exists in Holodeck
only because its search is randomised to sample a huge space under time pressure — a constraint we do
not share at building-part cardinality.

Sources: `allenai/Holodeck` @ `ai2holodeck/generation/floor_objects.py`, `wall_objects.py`,
`small_objects.py`, `utils.py` · <https://arxiv.org/abs/2312.09067>

**Could not verify:** the solver was read, not executed — the anytime-quality claim is read from the
accumulate-then-argmax structure, not benchmarked. `multiprocessing` fork-vs-spawn seed divergence is
reasoned, not observed. The paper's own "ten constraints" figure was not reconciled against the code's
16 parse keys (arXiv not fetched, per the code-first instruction). `rtree`/`numpy` licences read from
PyPI `license_expression`, not upstream LICENSE files.

---

## D-i — off-the-shelf pipelines: the market gap is our constraint set

Increment 1 could issue no verdict here (25/25 verification panels failed). Re-run from primary
sources, the direction its unverified extractions pointed **holds**, with two corrections.

- **Meshy — confirmed.** Returns GLB/OBJ/FBX/USDZ/STL/3MF; no seed parameter and no determinism
  statement in either the text-to-3D or image-to-3D endpoint docs. Printability really is separate
  opt-in repair endpoints, not a generation guarantee. Output ownership is tier-split (paid: full
  private ownership; free: CC BY 4.0). No vector output.
- **Rodin / Hyper3D — CORRECTED.** It *does* expose a seed ("ranging from 0 to 65535"). But the docs
  stop at *randomization control* and never state that the same seed reproduces identical geometry.
  **A seed with no reproducibility contract does not satisfy a prove-it-gate.**
- **Houdini Indie — confirmed and sharpened.** Revenue cap $100K USD, funding under $1M/24mo, max 3
  licences, and "cannot be used in the same pipeline as commercial versions of Houdini". Three
  disqualifiers increment 1 missed: **no floating/network licence** (Commercial-only), format-locked
  to `.hipnc`/`.hdanc`, and rendered output **watermarked and capped at 1920×1080**.
- **VITRUVIUS — KILLED as a category error.** It is ICON's AI *home-design* system producing floor
  plans, permit documents and budgets. Wrong domain entirely. Drop it from the survey.
- **Blender — the serious candidate, and still unverified.** GPL-3.0 confirmed from the source repo:
  headless-scriptable, no revenue cap, no format lock. That clears the licensing bar that kills
  Houdini and CityEngine. But `docs.blender.org` 403'd every fetch in **both** agents' passes, so its
  Geometry Nodes boolean behaviour, its determinism posture, and Freestyle SVG's real capabilities
  are all unverified from primary docs. **This is the one open item worth a follow-up probe.**

**The crux, and the finding:** every mesh-validity tool found operates at **topology** level. Open3D
offers `is_watertight` / `is_edge_manifold` / `is_vertex_manifold` / `is_self_intersecting` /
`is_orientable`; trimesh's repair module fills holes and fixes winding. **Neither has any notion of
support, contact, or reachability.** There is no off-the-shelf tool that answers "is 30% of this
roof's footprint carried by a wall". That predicate class is ours to write — which is the same
altitude gap increment 1's Q3 identified but could not evidence.

Sources: <https://docs.meshy.ai/en/api/text-to-3d> · <https://developer.hyper3d.ai/llms-full.txt> ·
<https://www.sidefx.com/products/houdini-indie/> · <https://www.sidefx.com/products/compare/> ·
<https://github.com/blender/blender> ·
<https://www.open3d.org/docs/release/python_api/open3d.geometry.TriangleMesh.html> ·
<https://trimesh.org/trimesh.repair.html>

**Could not verify:** Tripo's docs are client-rendered and returned only a page title — its seed and
determinism claims remain unverified. `docs.blender.org` 403 throughout. CityEngine's subscription
model and pricing rest on search snippets only (`support.esri.com` 403) — treat as unverified.
ICON's own VITRUVIUS page 404s; characterised from a third-party report.

---

## D-ii — buildingSMART IDS: borrow the shape, kill the format

Increment 1's most promising un-adjudicated lead. Verified against the schema itself, and **it does
not survive** — for two independent reasons, either of which alone would be decisive.

**What it is.** An `.ids` XML file, v1.0 Final since June 2024. Structure confirmed from
`Schema/ids.xsd`: `ids > specifications > specification`, each carrying an **applicability** (which
elements this rule targets) and **requirements** (what those elements must have). That
selector-plus-predicate split really is the same shape as `check(model) → Violation[]`, and is worth
citing as design lineage.

**Reason 1 — it cannot express a single one of our rules.** Exactly **six** facet elements exist:
`entity`, `partOf`, `classification`, `attribute`, `property`, `material`. The schema defines **no
geometric or spatial facet whatsoever** — nothing for coordinates, dimensions, overlap, containment,
contact, or distance. `partOf` expresses IFC *decomposition relationships*, not spatial containment,
so it cannot even carry `aperture-containment`. All six of our rules — `support-overlap`,
`aperture-containment`, `aperture-collision`, `attachment-contact`, `door-reachable`, `below-grade` —
are inexpressible. (One nice touch worth stealing: facets carry a `cardinality` of
`required`/`prohibited`/`optional`.)

**Reason 2 — the spec is CC BY-ND 4.0.** No-Derivatives. A storytree-flavoured adaptation of the
schema is not something we may publish.

**Also:** `ifcVersion` is a *required* attribute enumerated to IFC2X3/IFC4/IFC4X3_ADD2 — hard-coupled
to IFC. IDS standardises the **rule** shape only, not the report; the reference implementation
`ifctester` (LGPL-3.0) supplies output in Console/JSON/ODS/HTML/BCF. And a correction to increment 1's
framing: `ids-audit-tool` (MIT) audits `.ids` files themselves for schema validity — it does *not*
check models against IDS.

Sources: <https://raw.githubusercontent.com/buildingSMART/IDS/development/Schema/ids.xsd> ·
<https://raw.githubusercontent.com/buildingSMART/IDS/master/LICENSE> ·
<https://docs.ifcopenshell.org/ifctester.html> · <https://github.com/buildingSMART/ids-audit-tool>

---

## E — VGBench: partially confirms, too confounded to cite

This was the most direct published evidence anywhere for the arc's central bet — "capability comes
from the machinery, not the model tier". **It does not carry that weight.**

The ≥17-point gap is real and reproducible from the paper's own Table 7. Across ten LLMs: **SVG 49.4,
TikZ 69.8, Graphviz 73.1** — gaps of 20.4 and 23.7 points. The paper does explicitly attribute this to
representational level: TikZ and Graphviz "include more high-level semantics compared to SVG, which is
composed of low-level geometry primitives".

**Three things block it from validating the bet.**

1. **The comparison is uncontrolled.** The three formats come from three different corpora (Kaggle
   icons, DaTikZ, crawled GitHub) answering three different question sets (SVG asks colour/category;
   TikZ asks concept/counting/relation; Graphviz asks layout/domain/relation). **The same semantic
   content is never expressed in all three formats.** Representational level is fully confounded with
   content and task difficulty.
2. **The paper's own VLM baseline reverses the ordering.** LLaVA-1.5-13b, reading *rasterized images*,
   scores **84.1 on SVG** and 47.8/50.1 on TikZ/Graphviz. The authors read this as SVG carrying "more
   low-level visual signals"; the simpler reading is that the SVG questions are easy and the
   TikZ/Graphviz ones are hard. This is close to decisive.
3. **Pretraining-corpus frequency is never mentioned anywhere in the paper.** Token length *is*
   studied, and partly supports the confound — SVG degrades from 65.7 at <1k chars to 57.2 at >4k, and
   at short lengths the TikZ gap falls to 11.9.

**The decision-relevant fact runs against us.** Within-family scaling *narrows* the gap in 4 of 6
comparisons, and **GPT-4o — the strongest SVG performer at 64.4 — has the smallest gaps in the entire
table (15.4/16.4, both below 17)**. SVG improves faster with scale because the high-level formats
saturate near 80. A gap that closes at the frontier is the opposite of what the bet needs.

The generation half tells a third story: CLIP scores are nearly flat across formats (under 0.6 points
apart for GPT-4), and FID puts Graphviz *far behind* SVG — inverting the understanding ordering.

**Nearest supporting evidence, weak:** in-context learning lifts GPT-4's SVG from 54.9 to 61.6 while
leaving TikZ flat (81.0→80.5) — scaffolding helps most where the representation is lowest-level, model
held fixed. Suggestive for the bet, but it is about prompting rather than authoring surface, and it is
a single-model result.

**Net: the central bet remains UNVALIDATED**, exactly as increment 1 found. This pass closes the
lead rather than confirming it.

Sources: <https://aclanthology.org/2024.emnlp-main.213/> · <https://arxiv.org/html/2407.10972v2> ·
<https://ar5iv.labs.arxiv.org/html/2407.10972>

---

## What this means for the arc

**The cheap questions resolved and the expensive one moved.** The boolean kernel — the piece ADR-0214
called "the genuinely hard piece" and for which Fable was reserved — is a solved, Apache-2.0,
CI-determinism-tested dependency we can adopt in an afternoon. What is *not* solved is the render:
filled-polygon occlusion between parts, which ADR-0214 assumed CSG had eliminated.

**The two most expensive commitments in ADR-0214 both weaken further.** Increment 1 pushed against the
vendored-kernel plan and the vision reviewer; this pass adds that the kernel work is not merely
avoidable but *already done by someone else*, and that the central bet justifying the whole
machinery-over-tier thesis has now had its best remaining piece of supporting evidence examined and
found confounded.

**Candidate ADRs** — increment 1 named four and drafted none. This pass leaves them **still undrafted**
(an owner call, per the arc), now with evidence attached, plus one new candidate:

1. **Re-scope the constraint set** to build-time vs runtime, per the owner decisions of 2026-07-19.
   *Unchanged; this is a recording task, not a research question.*
2. **Replace the vendored-kernel plan** with baked parts through a robust build-time kernel, retiring
   the hand-hardened `csg.js` increment and the Fable reservation. **Now strongly evidenced** — A1
   gives the kernel, its licence, its determinism proof, and the one defect to design around.
3. *(Possible)* **Demote the vision reviewer** from gate to advisor. *Unchanged from increment 1's Q4.*
4. *(Possible)* **Correct the WFC rejection text** and cite Merrell 2007. *Unchanged.*
5. **NEW — the occlusion class is not eliminated by CSG.** ADR-0214 D1's "by construction" claim holds
   for apertures and fails between parts. A BSP splitter in the projection path is load-bearing and
   currently unplanned. This is arguably the most consequential correction of either increment.

**Also stale and worth curating:** `asset:isometric-art-geometry-libraries` still lists
"deterministic (pixel-stable across machines and runs)", "browser-safe", and "dependency-light" as
hard constraints on any kernel adoption, and files Manifold REFERENCE ONLY on browser-safety grounds.
The owner's re-scoping voided all three for build-time tooling. Its own note that csg.js's BSP tree
"is independently valuable… for depth-correct polygon splitting" turns out to be the durable part.

**Not done, deliberately:** no machinery built, no pipeline code, nothing vendored, no dependency
added, and no ADR drafted.
