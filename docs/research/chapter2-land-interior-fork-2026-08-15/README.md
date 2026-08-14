# ADR-0367's interior fork, settled on rendered evidence

**Date:** 2026-08-15 · **Blender:** 5.2.0 LTS, headless, CPU Cycles, seed 20260815 · **Camera:** 20°
from `LAND_CAMERA_ELEVATION_DEG` · **Cost:** $0 · **Vendor calls:** 0

ADR-0367's Consequences name a fork and deliberately leave it open: **(a)** regularise the island's
interior into a repeating lattice so a finite rendered tile set can cover it, or **(b)** keep the
shipped relaxed mesh and render only what does not depend on cell shape. This is the measured spike.

**Nothing here is owner-attested.** There has been no owner LOOK and no fork decision. The
recommendation below is explicitly non-binding; the visual call is an owner attestation.

## The headline

**The fork's framing is measurably too coarse, and correcting it is this spike's main result.**

"(a) buys thickness, (b) leaves the interior flat" turns out not to be the real trade. The rendered
wall pieces are indexed by **quantised outward ground heading**, not by cell shape, so *any* polygon
boundary can be walked with them. Walls, elevation, terracing and cast height are therefore available
to the relaxed mesh **with zero cell-shaped pieces in existence**. What a lattice uniquely buys is one
thing and one thing only: **a cell's TOP FACE can be rendered art instead of a flat fill.**

That reduces the fork to a single question the pictures can answer, and `a` vs `b++` in
`interior-fork.png` isolates exactly it — same island, same piece set, same elevation field, same code
state, differing only in whether the top face is stamped from a render or filled flat.

| | (a) lattice | (b) mesh, as written | (b+) mesh + parcel elev. | (b++) mesh + per-cell elev. |
|---|---:|---:|---:|---:|
| interior cells | 102 | 214 | 214 | 214 |
| **distinct cell shapes** | **6** | **214** | **214** | **214** |
| rendered **interior** pieces | 6 | **0** | **0** | **0** |
| rendered rim pieces (shared) | 16 | 16 | 16 | 16 |
| delivered land colours | 59 | 44 | 58 | **60** |
| mean cell area (px²) | 316 | 150 | 150 | 150 |
| interior sprites per island | 102 | **0** | **0** | **0** |

**Every one of the shipped mesh's 214 cells is a unique polygon — 214 shapes for 214 cells**, measured
by translation-canonical shape key. ADR-0367's premise is confirmed mechanically, not accepted on
report. The regularised lattice collapses that to **6** shapes, each used exactly 17 times.

## Recommendation (NON-BINDING — the owner signs the look)

**Take option (b), and take it as far as `b++`: keep the relaxed mesh, keep the flat per-cell fills
carrying their status tint, and buy walls, terracing and elevation from the heading-indexed rim piece
set that option (b) already requires.**

The measurement that drives it: **`b++` reaches 60 delivered land colours against `a`'s 59, with zero
interior pieces and without regularising anything.** The shading richness a reader actually receives is
equal; the structural cost is not close. Everything else follows:

1. **(a)'s single advantage is bounded, and its ceiling is structural rather than budgetary.** A piece
   rendered in isolation cannot carry any shading that depends on its neighbours — no inter-cell
   ambient occlusion, no cell-to-cell cast shadow — because at render time the neighbours do not
   exist. So a lattice's top-face art can never be more than a self-contained bevel or surface
   texture. Making it more would mean indexing pieces by shape × neighbourhood, which is a
   combinatorial set, not a finite one.
2. **The advantage that remains is real but small, and it was given its best shot.** See the chamfer
   sweep below: at the authored bevel the rendered top face is 7.0% of delivered land pixels, and even
   at a bevel consuming a fifth of a cell's radius it reaches 29.6% — while making the repeating hex
   rosette *more* legible, not less. `chamfer-fairness.png` shows (a) at that widest setting beside
   `b++`.
3. **(a) costs the thing the relaxed mesh was built to buy.** At the delivered pixel scale the
   six-kite lattice reads as a repeating hexagonal rosette. That is the "graph paper" outcome
   ADR-0367 names, wearing hexagons.
4. **(b) leaves ADR-0367 D5 free by construction** and touches none of the app behaviour keyed to cell
   shape.

**What (b) genuinely leaves flat, stated as a cost and not softened:** the *interior* of a cell's top
face. No bevel, no per-cell occlusion, no surface texture. Priced: option (b) exactly as written costs
15 delivered land colours against (a) (44 against 59), and 29.6% of land pixels at (a)'s widest bevel.
Taken to `b++` the colour gap inverts to 60 against 59 and what stays flat is only the top face's
interior shading — which is why the recommendation is (b) *taken to `b++`* and not (b) as written. If
the owner looks at `b++` and wants the
paver-bevel read of `a` at chamfer 5.5, this recommendation is wrong and (a) is the answer — that is a
look call, and it is the owner's.

**Two conditions attach to (b)** and neither is discretionary:

- **The substrate's vertex interning is still in SCREEN space** (`substrate.ts`, `VKEY` rounds to
  0.1 px of the *projected* coordinate). Reconciling the jitter in #1344 left this half open, and it is
  the one honest argument FOR (a): a ground-plane lattice needs no interning tolerance at all, so (a)
  sidesteps the whole class. Under (b) the mesh's cell decomposition is a function of the projection —
  measured on the camera lane as 50 → 52 cells and a reveal wave moving `1,4,7,10,11,9,6,2` →
  `1,4,7,8,8,10,11,3`. ADR-0367 D1 now fixes one camera, so the risk is bounded rather than live; but
  any future camera move re-decomposes the interior. **Move the interning to ground space before the
  land's geometry moves.** Not fixed here — this spike changes no shipped geometry.
- **The reveal's path-`d` index** must become a real cell id first, exactly as ADR-0367's Consequences
  already require. (b) raises cells by an elevation term, which changes every emitted `d` string.

## The pictures

| file | what it is |
|---|---|
| **`interior-fork.png`** | **the fork.** One island, four ways, one piece set, one code state. `a` vs `b++` isolates the top face and nothing else. |
| **`chamfer-fairness.png`** | (a) at chamfer 1.7 and at 5.5 — its best shot — beside `b++`, cropped to the land at 4×. |
| `a.png` `b.png` `bplus.png` `bplusplus.png` | the four composites at 1:1, each with the real hero tree standing on it. |

The hero tree is the shipped `code-blender` mature frame (frame 18), planted at its registered root
anchor and composited **after** the land's back half at its own 1:1 scale — passing a sprite carrying a
signed owner ceiling verdict through the *land's* palette snap would re-author art the owner has
already looked at.

## Both traps the increment names, and how each was closed

**A fork picture can silently compare two variables.** `crown-normals-fork.png` was composed from five
variant directories, four rendered before a canopy constant existed and one after — one lever varied,
two changed, no error and no visible cue. Here every cell of every sheet is produced by ONE run of
`compose.py` reading ONE `island.json` and ONE `pieces/` directory; `blender_land.py` renders every
piece both variants use in a single invocation; and variant (b) requires no interior piece at all, so
there is nothing it could have been rendered either side of. The elevation field is identical across
`a` and `b++` by construction — the same `height_of()`, the same CRC32-keyed micro step.

**The claim is now a MECHANISM, not an argument.** The hero track's `provenance.py` landed while this
spike was in flight (increment `committed-derived-evidence-carries-producer`, PR #1350), so it is
adopted here rather than reinvented. `blender_land.py` declares its own source digest as `code_state`
in each piece directory's `render-meta.json`; `compose.py` and `sweep_chamfer.py` call
`require_one_code_state` **before drawing anything** and refuse if two input directories declare
different states; and every delivered picture gets a `<name>.png.provenance.json` sidecar recording the
producing tool, that tool's own digest, the exact argv, a hash per input piece, the agreed code state,
and a digest of the artifact itself. All four composites and both sheets came out at code state
`920755590a61`. The chamfer sweep is where this has teeth — it composes three separate render
directories — and the `--chamfer` difference correctly lives in each directory's `argv`, not its code
state, because a fork picture is *supposed* to vary its flags.

**The guard was verified by making it fire, not by watching it pass.** With one directory's declared
state deliberately mutated, `sweep_chamfer.py` exits 1 and names the disagreeing cells
(`920755590a61  chamfer 1.7, chamfer 3.4` against `deadbeef0a61  chamfer 5.5`). That test found a
defect in the first wiring: the refusal sat at the bottom next to the sidecar it feeds, so the picture
was written and *then* refused — a mixed-state artifact on disk missing only its provenance record. **A
guard that fires after the damage is a log line, not a refusal**, and a guard never made to fire is not
known to be either.

**And the trap recurred anyway, inside the tool built to prevent it.** `chamfer-fairness.png`'s first version
drew (a) from the *measurement* image, which stops before the silhouette rim pass, beside a `b++` that
had its rim — so a sheet whose entire job was to hold everything but the top face constant varied the
rim as well. Caught by reading the file timestamps, not by any check. The measurement still runs
without the rim (counting chamfer colours across a rim that darkens from the local colour would
attribute rim pixels to the chamfer); the picture is now rendered with it. **The lesson is that
"render both variants from one code state" is necessary and not sufficient**: one state can still be
sampled at two different points in the same pipeline.

**A staged screenshot can photograph a mid-reveal frame whose DOM already reads as settled.** Not
applicable: nothing here is staged against the live app. The composites are produced offline from
committed pieces, so there is no reveal to catch mid-flight. Confining the spike to an offline
compositor is what makes that trap unreachable rather than merely avoided.

## Proof — the machine-checkable half (`verify.py`)

The look is an owner attestation. These are the properties a session may assert for itself. All green:

```text
== 1. determinism (same seed -> same bytes) ==
PASS  geometry: emit_island.ts re-run is byte-identical  1fa6ce51565e537a
PASS  render: every Blender piece re-renders raster-identical  22 pieces pixel-identical
      (22 with a differing PNG container: Blender stamps the file, so the claim is on the raster)
PASS  composite: a / b / bplus / bplusplus each byte-identical across two runs

== 2. the per-cell status tint stays expressible (ADR-0367 D5) ==
PASS  (a) no rendered piece contains ANY island token colour
PASS  (b) all five statuses render from ONE piece set - piece-stamped interior (a)
PASS  (b) all five statuses render from ONE piece set - flat interior (b++)
PASS  (c) permuting the status assignment repaints the land and moves no piece
```

**Determinism is asserted at three seams, not one** — geometry, render, composite. A deterministic
renderer fed a drifting emitter is not a reproducible picture, and a deterministic pair composited
non-deterministically is not either.

**Byte-identity of the render is asserted on the DECODED RASTER, and that distinction is measured
rather than assumed.** A re-render of the same scene at the same seed is pixel-identical while its PNG
container differs every time, because Blender stamps the file. A naive sha256-of-the-file check
reported non-determinism that did not exist — it failed all 22 pieces before this was written down.

**The tint proof does not rest on inspection.** The load-bearing check is 2(a): a rendered piece emits
band KEYS — five widely separated triples standing for (flat top / lit chamfer / shaded chamfer / lit
wall / shaded wall) — and contains no island token colour at all, so the status cannot have been baked
into it. Which colour a key becomes is looked up per cell from that cell's capability's status at paint
time. 2(b) and 2(c) are then consequences rather than coincidences: driving every cell to each of the
five statuses in turn emits exactly that status's own token family, under the piece-stamped interior as
well as the flat one, and permuting the assignment repaints the land while every piece file's hash is
unchanged. The island in the pictures carries all five statuses at once, which is what a mixed-status
story's island legitimately looks like.

### The palette bug this caught, which matters beyond this spike

Check 2(b) failed first, on a real defect. The coast piece's chamfer lip is painted with the **side**
token at the **chamfer** shade — a (token × shade) combination the first palette omitted. The missing
entry did not produce a slightly wrong colour: the nearest surviving entry belonged to a **different
status family**, so an `unknown` island's rim came out `healthy` green across 2564 pixels, at exit 0,
with nothing to see. **A palette snap can only clamp toward what it holds, so an incomplete palette
silently reassigns semantic state.** ADR-0367 D4 (the shared back half) and D5 (the tint outranks the
art) interact here: the palette must be the full closure of (authored token × authored shade level),
and a partial closure is worse than no snap at all. `verify.py` restates the families independently
instead of asking `build_palette` what it allows — a check that consults the palette can only pass.

## Measurements

### Does a rendered top face read at the delivered scale? (`sweep_chamfer.py`)

| chamfer inset (ground px) | share of PIECE px | share of DELIVERED land px |
|---:|---:|---:|
| 1.7 (authored) | 10.9% | 7.0% |
| 3.4 | 16.9% | 16.5% |
| **5.5 — (a)'s best shot** | **25.4%** | **29.6%** |

Measured after the majority downsample, which is the honest question: a band that survives at
supersampled resolution and loses every majority vote at the delivered scale has bought a reader
nothing. `HEX_R` is 27 ground px, so 5.5 consumes about a fifth of a cell's radius.

⚠ **The first version of this measurement was wrong by an order of magnitude in the direction of this
spike's own recommendation** — it reported the chamfer at 0.8% instead of 7.0%, by comparing
unrounded full-resolution floats against rounded targets under a 0.5 total-channel tolerance, so
legitimately matching pixels missed their own target by 0.8 and went uncounted. It was caught by the
sweep disagreeing with `verify.py`. Recorded because a spike that under-measures the option it is about
to advise against is the specific failure this ADR's Consequences warn about, mirrored.

### Where the delivered land pixels come from

| | (a) | (b++) |
|---|---:|---:|
| walls (real thickness) | 33.1%, from the 6 **interior** pieces | 31.6%, from the 16 **rim** pieces |
| chamfer — the only thing a rendered top face adds | 7.0% (29.6% at widest) | 0% |

The walls are the same share either way. That single row is the fork: thickness does not require a
lattice.

### If the lattice has to match the mesh's cell density

The lattice's cells are 2.1× larger than the mesh's (316 vs 150 px²), so "(a) is coarser" is a real
cost. Subdividing once more answers it: **408 cells from 24 distinct shapes** — still finite, still
tileable, at four times the piece count. Measured but not rendered; the six-piece form is the one
judged, because it is the strongest and most legible version of (a).

## What this implies for ADR-0282's scope question — reported, NOT edited

ADR-0282 D1/D8 assert "No generated land, coast or composite", leaning on the ADR-0274 D1 clause
ADR-0367 narrowed. Per this increment's own terms that was left uncorrected deliberately, it is routed
through the `librarian-curator`, and **nothing here edits it.** What the spike contributes is the
measurement the scope question turns on:

- **The piece set is forest-wide by construction, and this is the strong finding.** Sixteen
  heading-indexed rim pieces serve *any* island's coast, because they are indexed by heading and not by
  outline. There is no per-island art, so nothing about the technique is restricted to a hero island.
  Under (b) the interior adds **no pieces at all**.
- **What does not scale for free is per-island COMPOSITION.** This 17-hex island places **82** rim
  sprites. Under (b) that is the whole cost, and the interior adds zero. Under (a) it is 82 + **102**
  interior sprites — and *that* is the number that would decide a forest-wide rollout, because it
  multiplies by island count in the live scene graph.
- **So the scope answer is option-dependent, which is worth knowing before ADR-0282 is touched.** (b)
  is plausibly forest-wide on these numbers; (a) plausibly is not, and would be the option that forces
  a hero-island-only reading. A curator correcting ADR-0282 before the fork is decided would be
  guessing at exactly the value this spike says is contingent. **Recommended sequence: owner decides
  the fork, then the curator corrects ADR-0282 in place** — and if the answer is "hero island only",
  ADR-0282 may need nothing beyond a narrowing note.

The per-island sprite count at forest scale is measured here for one island only. Whether 82 rim
sprites × N islands is affordable in the live scene graph is **not** measured and is not this spike's
question.

## Reproduce

```text
npx tsx emit_island.ts                                    # -> island.json (geometry, both variants)
blender --background --python blender_land.py -- --out pieces --samples 32
python compose.py                                         # -> a/b/bplus/bplusplus + interior-fork.png
python verify.py                                          # determinism + tint; --fast skips re-runs

blender --background --python blender_land.py -- --out sweep-a --only tiles --chamfer 3.4
blender --background --python blender_land.py -- --out sweep-b --only tiles --chamfer 5.5
python sweep_chamfer.py                                   # -> the sweep table + chamfer-fairness.png
```

Both composers refuse before drawing if their input directories declare different code states. To see
the refusal rather than trust it, edit one `sweep-*/render-meta.json`'s `code_state.sha256` and re-run
`sweep_chamfer.py`: it exits 1, names the disagreeing cells, and writes no picture.

`blender_land.py` runs under Blender's bundled Python; `compose.py` / `verify.py` / `sweep_chamfer.py`
need system Python with numpy + Pillow. `bpy` from PyPI is not a route on this machine (no wheel for
the installed Python). The whole piece render is 22 images and takes about 15 seconds, so the hero
track's `--only` subset habit is not needed here; `--only tiles` exists for the chamfer sweep.

## What the code owns (ADR-0367 D2 / ADR-0280 D1, unchanged)

- **The script is the source of truth.** No `.blend`, no sculpted mesh, no imported asset. `island.json`
  is a generated intermediate written by a committed script and never hand-edited.
- **Variant (b) is the SHIPPED code, imported not ported.** `buildRelaxedCells(..., 'mesh')` from
  `packages/forest-world/src/substrate.ts` is called directly, so there is no second copy of the mesh
  to drift. Variant (a) is constructed here because no shipped code implements it — it is the
  hypothetical.
- **The camera is read, never restated.** `LAND_CAMERA_ELEVATION_DEG` (ADR-0367 D1, PR #1344) flows
  from `camera.ts` through `island.json` into the Blender camera and the compositor's projection. No
  file here declares an angle. Ground displacements carry sin θ, upright heights carry cos θ.
- **The light is the hero tree's own key direction,** reused verbatim: land and object must share one
  light as much as one camera.
- **Randomness is identity-keyed** (CRC32 over an address, never a draw counter or a salted `hash()`),
  which is what makes the composite byte-identical across runs.
- **The render delivers PIECES, never a baked island** (ADR-0367 D2). It never could: the island's
  silhouette is computed at runtime and is unique per story.
- **Nothing runtime is introduced** (ADR-0367 D3). Author-time only; no second renderer, no asset-owned
  clock, no shipped geometry touched. This spike writes only under `docs/research/`.

## Honest gaps

1. **There is no owner LOOK.** No option is chosen; the recommendation is non-binding.
2. **The elevation field is invented for the spike.** Parcel levels and the per-cell micro step are
   deterministic placeholders to make walls and thickness visible at all. Real terrain would need an
   authored rule, and that rule is a separate art-direction question.
3. **Inter-cell cast shadows are absent under both options,** and under (a) they are not bakeable per
   shape — a cell's shadow falls on neighbours that do not exist at render time. Any cast shadow is
   therefore an app-side pass under either option, which removes it from the fork rather than settling
   it.
4. **The interior "lighting pass" ADR-0367's (b) bullet mentions is not a Blender contribution.** A
   lighting plate over the interior is a function of the island's unique silhouette, so it cannot be
   pre-rendered; it is an SVG gradient the app can already produce. Blender's contribution to (b) is
   the rim.
5. **The beach stays a flat app-side fill** (`.coast-fill`), as today. Only the cliff is rendered.
6. **One island, one seed.** 17 hexes, 10 capabilities. The shape-count result (214 unique of 214) is
   structural and will not change with the seed; the pixel shares are this island's.
7. **`TILE_DEPTH`'s layout consumers are untouched** — ADR-0367's Consequences already record that the
   nameplate baseline and scene bounds need reconciling before the land gains real depth. This spike
   composes offline and so never met them.
