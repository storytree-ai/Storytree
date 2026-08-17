# Blender greenery techniques, measured at the delivered pixel — stage 1

**Date:** 2026-08-17 · **Camera:** 50° (the research track's named parameter; the app's
`LAND_CAMERA_ELEVATION_DEG` is **20** and is neither read nor written) · **Blender:** 5.2.0 LTS, CPU
Cycles, **48 samples**, adaptive sampling off, fixed seed · **Renders:** 11 pieces, **~5 s total** ·
**Vendor calls:** 0 · **Cost:** $0 · **Proof:** `verify.py` **36/36**

The owner, 2026-08-17, on being told we build every blade as an explicit hand-written mesh and use no
particle system anywhere:

> *"i think we need to try other options for long grass (or other greenery that gives our green land
> textures) these pixel triangles dont really look nice, there are lots of blender techniques for
> doing grass its probably worth a small research pass"*

## → OPEN `greenery-techniques.png`

Nine panels at 14×, where **every block is one pixel the island would actually receive**. Panels 1–6
are the candidate techniques, 7–9 the marks they are measured against.

**This page carries no appearance verdict** — ADR-0070 stage 2 reserves that for the owner, and
ADR-0280 D4 makes an honest *"none of these helped"* an accepted outcome. What it carries is numbers.

---

## The fact that decides every result below, and it is the pipeline rather than any technique

The committed piece protocol is **28.0 ground units across, rendered at 84 px, downsampled 3×**.
Therefore:

**ONE GROUND UNIT IS ONE DELIVERED PIXEL, and a whole piece canvas is 28 delivered px.**

Blender's default hair `radius_scale` is **0.01** world units. In this pipeline that is **0.06
supersampled pixels — about 1/150th of one delivered pixel.** Every grass tutorial in the ecosystem is
authored for a renderer whose pixels are two orders of magnitude smaller than ours. So the honest
framing of the owner's question is not *which technique looks nicest*; it is **which technique still
exists at 28 pixels.**

---

## What each candidate delivered

`survival` = delivered px as a share of raw opaque blocks. **Over 100% means the majority vote is
FILLING gaps** — the signature of a mass. **Under ~85% means the vote is DESTROYING structure.**

| candidate | raw px | delivered px | survival | box | what it is |
|---|---:|---:|---:|---|---|
| `control-emitter-only` | 0 | **0** | — | — | the guard: proves the emitter is hidden |
| `hair-tutorial` (strand 0.02u) | **0** | **0** | — | — | **invisible before any downsample** |
| `hair-fine` (0.33u) | 222 | 26 | 105% | 7×6 | a mass |
| `hair-1px` (1.0u) | 323 | 36 | 100% | 8×7 | a mass |
| `hair-2px` (2.0u) | 316 | 33 | 94% | 7×7 | a mass |
| `hair-clumped` (children + clump) | 494 | 55 | 100% | 9×8 | **a near-solid rectangle** |
| `hair-domesized` (footprint-matched) | 139 | **15** | 97% | 5×5 | a mass, with a hole |
| `hair-sparse` (12 thick strands) | 125 | 10 | **72%** | 5×6 | **debris** |
| `geonodes-fine` (blade 0.4u) | 337 | 40 | 107% | 8×8 | a mass |
| `geonodes-1px` (blade 1.0u) | 391 | 45 | 104% | 8×8 | a mass |
| `card-authored` (the control/ceiling) | 186 | 24 | 116% | 8×4 | an authored bitmap |

And the baselines, read off the committed sets rather than quoted from a README:

| baseline | delivered px | survival | box |
|---|---:|---:|---|
| `pieces-m00-blade` tufts — **the WITHDRAWN long grass** | **2–3** | **43–79%** | 2×1 |
| `pieces-species` (PR #1389) — dome / spire / spreader / pair | 7–20 | 95–115% | 2×4 … 8×3 |
| `shrub-a` — already shipped | 12 | 95% | 6×3 |

---

## 1. Hair has three regimes and none of them is grass

**At tutorial scale it delivers ZERO RAW PIXELS.** Not few — zero, before the downsample is even
reached. The strand is thinner than the render's own pixel grid.

**Thick and dense enough to see, it delivers a blob.** `hair-clumped` — the recognisable tutorial
grass recipe, strands plus interpolated children plus clumping plus roughness — delivers a
**near-solid 9×8 rectangle** at 100% survival. The 100% is the mechanism, not a coincidence: the 3×3
majority needs only 5 of 9 samples to call a block solid, so every gap between strands is voted
closed. **The downsample does not thin hair into blades; it welds hair into a mass.**

**Sparse enough for the gaps to survive, it delivers debris.** `hair-sparse` is the one setting where
separation survives, at 72% survival — and what arrives is:

```
..#..
.##..
#.#..
.##.#
.....      <- an entirely empty row
.#.#.
```

Scattered single pixels and a hole through the middle. **That is the same failure the owner already
rejected in the long grass**, reached from the opposite direction.

## 2. At matched footprint, hair LOSES to the hand-modelled lobes

The first reading of the table above was that hair delivers *more* than the species set — 26–55 px
against the dome's 18. **That reading was a confound and this pass closed it.** The hair candidates
stand on a 3.0-unit emitter under 4.5 units of hair: a ~6×5.5-unit object against the dome's ~6×2.5. A
bigger object delivering more pixels is arithmetic, not a technique win.

`hair-domesized` is sized to the dome's own delivered box. Matched:

| | delivered px | box | shape |
|---|---:|---|---|
| `hair-domesized` | **15** | 5×5 | `#..##` — a hole in the middle, ragged outline |
| the species `dome` | **18** | 6×4 | solid, clean |

**Hair is not a better mark than a modelled lobe at this scale. It is a slightly worse one.**

**My own prediction was half wrong and the half that was wrong matters.** Before measuring I expected
hair to collapse and deliver *nothing more than a tuft*. On quantity that was wrong by a factor of
three — hair delivers plenty. What is measured out is **structure**: hair cannot express a blade here
at any count, because the two available regimes are *welded* and *debris*. Reaching the right verdict
through the wrong number would have made every downstream size argument unsafe, which is why the
footprint-matched panel exists rather than a paragraph asserting the same thing.

## 3. Geometry Nodes lands in the same regime, for the same reason

`geonodes-fine` / `geonodes-1px` distribute blade instances over a surface field with rotation aligned
to the normal — density from geometry rather than from a hash. They deliver **40–45 px at 104–107%
survival in an 8×8 box**: the mass regime again. The marks are still discrete meshes finer than the
vote, so the arc's existing silhouette finding predicted this, and it held. **A disagreement would
have been the informative result; there wasn't one.**

## 4. The control, and what it is honest about

`card-authored` is a camera-facing quad carrying a silhouette authored **at** the delivered resolution
and upscaled by exactly the supersample factor. It is barely a Blender technique — one quad and a
hand-authored bitmap — and it is in the set as the **ceiling**: it bounds what anything in this
pipeline can deliver.

**It is not a perfect identity, and that is stated rather than smoothed:** 20 authored pixels arrive
as **24**, at 116% survival, because the billboard is not snapped to the delivered pixel grid, so its
edges bleed into neighbouring blocks. **The ceiling drawn here is therefore slightly generous to
itself.** Snapping it would be a real improvement to the control and is not done here.

## 5. The finding the baselines gave for free, and it is the most useful one

**The withdrawn long grass is the only thing in the entire set that LOSES to the downsample.** Blade
tufts survive at **43–79%**; every mark intended as a mark — candidate or shipped — survives at
**94–116%**.

So the owner's three rejections (*"rather ugly"*, *"looks buggy"*, *"ugly and cheap"*, *"these pixel
triangles dont really look nice"*) have a precise pipeline cause rather than an aesthetic one: **the
blade tuft is the one piece whose structure is finer than the majority vote, so the vote destroys it.**
A 2-pixel mark in a 2×1 box is not a stylised blade of grass; it is the residue of one.

That also retro-explains two earlier results on this arc at a stroke. The custom-normals sweep was
degenerate (90% of raw pixels repainted, identical delivered output at every setting) because there
were 2–3 delivered pixels to shade. And the 46%-zero-delivery finding was measuring the same piece.
**Every shading lever this arc tried was applied to the one component that cannot carry one.**

---

## What this pass does NOT settle

1. **There is no owner LOOK, and stage 1 cannot substitute for one.** Whether the species dome, the
   shrub, or a hair blob reads better as greenery on an island is exactly the judgment this page must
   not make. `greenery-techniques.png` is where to make it.
2. **No island was composed.** Every number here is a single piece in isolation. A mark's behaviour
   *in situ* — occlusion, neighbours, density — is stage 2, and the arc has already been bitten once
   by judging a piece alone (the "grass is 7 pixels" figure was an isolated tuft; in situ the modal
   outcome was nothing).
3. **The fourth candidate on the increment's list — higher-amplitude ground displacement — is NOT
   here.** It is a ground technique, so its cost is measured in palette entries closed over the whole
   island, not in a piece's delivered footprint; measuring it at piece scale would produce a number
   that cannot be compared to the +619 figure the shadow pass established. It belongs in stage 2.
4. **Alpha cards were tested only as a control, not as a shippable component.** A real card component
   would need a grid-snapped billboard, an authored texture per species and a decision about whether
   an authored bitmap inside a Blender pass is still "code-generated art" under ADR-0280 — which is an
   ADR question, not a render.
5. **One camera, one seed, one sample count (48), one zoom.** Never compare a pixel count across
   sample counts; the arc measured that alone moving a land figure by ~2 px.
6. **`hair-sparse` is excluded by name from one `verify.py` assertion**, because it was authored to
   lose and its losing is its result. An earlier draft of that check asserted over the whole set and
   failed — the wording was wrong, not the data, and the tempting repair (drop the threshold) would
   have stopped the check catching a real collapse.

## Proof — `verify.py` **36/36**

```text
blender --background --python blender_greenery.py -- --out pieces-greenery   # 11 pieces, ~5 s
python measure.py                                                            # the census + report
python sheet.py                                                              # the sheet + sidecar
python verify.py                                                             # the floor, 36 checks
```

Needs system Python with numpy + Pillow; Blender 5.2.0 LTS only to re-render the pieces.

Two checks are built to **fire** rather than to pass:

- **The instrument is the committed one.** `measure.py` copies `compose_options.py:804-827`'s delivery
  predicate rather than importing it (importing runs a 30-minute island compose). A drifted copy would
  silently re-scale every number here, so it is held to **PR #1389's own published figures** — and
  reproduces all six species-set pieces exactly (18/7/20/10 px and 12/11 for the shrubs).
- **The emitter guard would have caught a failure.** `ParticleSettings.use_render_emitter` **does not
  exist in Blender 5.2**, so the emitter is hidden with a Transparent BSDF instead — an approach that
  would fail *generously*, adding a ~6×2 delivered-px disc to every hair piece and inflating exactly
  the statistic this pass reports. `control-emitter-only` proves it worked (0 raw px, 0 delivered);
  `verify.py` then runs the guard against a visible disc and confirms it rejects it.

`verify.py` also covers the fence (`docs/research/**` only — 19 files touched, none outside;
`blender_grass.py`, `blender_species.py` and `scatter.py` all untouched; `LAND_CAMERA_ELEVATION_DEG`
still 20), the pipeline arithmetic, every finding above re-derived from the report, and evidence
hygiene (opaque sheet, provenance sidecar over all three scripts, no script moved since the picture
was drawn, sample count recorded).

**Nothing here proposes an app change.** The finding that the shipped compositor still mounts the
withdrawn `pieces-m00-blade` set (`compose_healthy.py:95`) is written down with a file and a line, as
the fence requires, and left alone.
