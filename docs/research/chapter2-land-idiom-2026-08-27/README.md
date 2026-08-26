# Authoring the LAND in the textured idiom — 2026-08-27

**Arc:** `chapter2-island-that-looks-good-first-arc`.
**Increment:** `author-the-land-in-the-textured-idiom`.
**Decision this sits under:** **ADR-0418** (the direction flip — textured, sculpted 3D assets drawn
live; the palette fence lifted on the **experiment surface only**).
**Evidence this builds on and does NOT re-derive:** `docs/research/chapter2-pine-kit-2026-08-22/`
(the trial, and `build_island.py` which this pass forked), `docs/research/chapter2-island-props-2026-08-21/`
(the smoothed-coast lever), `docs/research/chapter2-islanders-canopy-2026-08-22/` (the reference).

Everything here is the **experiment surface**. Nothing is adopted into the app; adoption stays a
separate event (ADR-0380 D6, ADR-0406 D2). The purchased kit's licence permits derived output and
forbids resale or repackaging; only derived renders are committed.

**⚠ NO OWNER LOOK IS SPENT HERE, AND NOTHING IN THIS DIRECTORY ASKS FOR ONE.** ADR-0392 D1 reserves
a single attestation, on whole islands, at the end, and the arc holds a separate `ready` increment
for it. This pass makes the material; it does not get it signed.

---

## 0. The question, and the shape of the answer

The trial found the thing nobody was looking at: **the kit ships 42 objects that all stand ON land
and no ground material at all**, while land is roughly two thirds of a top-down island frame. So the
flat green in the render the owner approved is *our own code* — a two-octave procedural noise ramped
through three authored greens — and it is the weakest thing on screen. The increment asked three
questions. Short answers first; the evidence is §4–§6.

1. **What is a good-looking land at both zoom levels?** One that does **three different jobs at
   three different scales**, and the measurements separate them cleanly: *geometry* carries the
   silhouette (and costs under 1.5% of contrast or range to do it), a *material that knows where it
   is on the island* carries the overview (+22 luminance spread, and it is what makes the ground
   read as a place rather than a surface), and a *high-frequency grain octave* carries the zoom
   (+59% pixel-scale contrast on bare land, where the place-aware material buys +3%). Miss any one
   and the land fails at one specific zoom, predictably.
2. **Texture, procedural material, or geometry?** **Geometry and procedural, not texture — and the
   reason texture loses is not aesthetic.** An image map is authored for an object of bounded size;
   the ground is unbounded, so a map on it is a *tiling* problem, and the tiling is legible as a
   quilted grid at **both** zoom levels (`land-textured-*.png`). It also cost 22.7% of the island's
   chromatic fraction and 16.5% of its structural contrast while more than tripling the colour count.
   The one thing the bought pack genuinely gives the land is a **detail normal**, and only below
   about strength 0.30 — above that its rock striation shows through the grass as visible whorls.
3. **The coast and the skirt?** **The kit's cliff generalises, and it is doing measurable work.**
   `combined` and `strata` differ in nothing but the skirt material; swapping the kit's cliff for a
   competent procedural bedded rock costs **9.8% of structural contrast and 6.8 of luminance spread**,
   because the pale procedural rock lifts the island's dark anchor by 7.0 luma (p2 52.5 → 59.5). The
   smoothed coast is worth keeping and the *stepped* skirt is worth adding — a single 3.2-unit
   extruded face is a lot of frame doing nothing at 1948 px.

**The recommended land is `combined`:** grid geometry clipped to a smoothed, gently perturbed coast
polygon · a landform that falls to the shore · one worn path worn *down* rather than painted on ·
an attribute-driven material reading shore-distance, path wear and its own slope · a grain octave ·
the kit's cliff on a six-row stepped skirt. Pictures: `land-combined-487px.png` /
`land-combined-1948px.png`, and the land alone at `land-combined-bare-*.png`.

**⚠ One thing it does badly, stated up front:** on the arc's own colour-spread instrument it
**overshoots**, and so does every other treatment here including the control the owner approved.
That is §6, and it is a finding about the *instrument* as much as about the land.

---

## 1. Hardware — and a false comment corrected in place

`build_island.py:373` read:

```python
scene.cycles.device = "CPU"                   # no CUDA/OptiX/HIP on this box, measured
```

That was true of the box it was written on (Snapdragon X / Adreno X1-85, where Cycles enumerates no
GPU backend at all) and is **false on this one**. Under ADR-0139 an accepted record must be true in
full, so it is corrected **in place** rather than left standing with a note: the device is now
**selected at runtime** (`--device auto|gpu|cpu|<backend>`), preferring a GPU backend that actually
offers a non-CPU device and falling back to CPU when none does. That keeps it correct on the Windows
box too, which is the point of making it a choice rather than a constant.

**Two probe traps, both live:**

- `get_devices_for_type(t)` **raises `TypeError`** for a backend this build does not know (METAL on
  Linux) rather than returning an empty list. Wrap per type or it dies on the first one. *(Known
  from the trial; re-confirmed.)*
- **It also returns the CPU alongside any GPU.** `OPTIX` here returns
  `['NVIDIA GeForce RTX 2060', 'AMD Ryzen 5 5600X 6-Core Processor']`. So `if devices:` reports a GPU
  on a **CPU-only** box — the exact false positive that would make the fallback unreachable. Filter
  by `d.type == backend`; that is the only reading that answers the question asked. *(New.)*

### The measured numbers, and what they are actually of

This box: **Linux Mint, AMD Ryzen 5 5600X (12 threads), NVIDIA RTX 2060 6 GB, driver 595.84,
Blender 5.2.1 LTS.** OptiX and CUDA both enumerate the 2060; HIP and oneAPI have no devices.
Wall clock for the **whole process** — 382 MB `.blend` load, scene build, render, PNG write —
on `build_island.py`'s scene at 128 samples:

| | 487 px | 1948 px |
|---|---:|---:|
| **This box, OptiX (RTX 2060)** | **3.6 s** | **22.5 s** |
| **This box, CPU (5600X)** | **4.7 s** | **49.1 s** |
| Windows box, CPU (Snapdragon X), ADR-0415 D6 | 41 s | 4 min 45 s |

**⚠ THE SPEEDUP IS MOSTLY THE MACHINE, NOT THE GPU — do not report it as a GPU win.** At 1948 px the
end-to-end gain over the recorded Windows baseline is **12.7×**, and it decomposes as
**5.8× machine** (285 s → 49.1 s, CPU to CPU) and **2.2× GPU** (49.1 s → 22.5 s). At 487 px the GPU
is worth almost nothing (3.6 s vs 4.7 s) because a ~2.5 s fixed cost — loading a 382 MB blend and
building the scene — dominates the frame. The script now prints its own build and per-render times
separately so this cannot be misread again; Blender's `Time:` field is **cumulative from process
start**, not per-frame.

What the GPU actually bought this session is not the headline number but the **iteration loop**: a
487 px look at a change in ~3 s and a full seven-variant sweep at both zoom levels in ~6 minutes.
That is what made trying seven directions affordable instead of two.

---

## 2. What was built

`build_land.py` — one script, seven variants, **one axis moved at a time**:

| variant | geometry | ground material | skirt | isolates |
|---|---|---|---|---|
| `control` | hex prisms | the trial's two-octave noise | kit `Cliff` | *(baseline)* |
| `procedural` | hex prisms | rich procedural, hue-varied | kit `Cliff` | **material** |
| `textured` | hex prisms | the kit's **image maps** on land | kit `Cliff` | **texture** |
| `relief` | grid, smoothed coast, displaced | the trial's noise | kit `Cliff` | **geometry** |
| `structure` | grid + path | attribute-driven, **no grain** | kit `Cliff` | place-awareness |
| `combined` | grid + path | attribute-driven **+ grain** | kit `Cliff`, stepped | **the candidate** |
| `strata` | grid + path | attribute-driven + grain | **procedural** rock | **the skirt** |

Plus `--bare`, which renders the land with nothing standing on it. Still a **whole island at
delivered size** — not a crop, not a fragment, not a contact sheet — and it is the only way to ask
"is the LAND good" rather than "is the picture good", which is what this increment was chartered on.

**Held fixed across all seven, so the comparison means something:** the owner-signed 50° orthographic
camera; `LIGHT_DIRECTION` from `palette-band.ts`; the same seed, counts and scatter algorithm; both
delivered sizes. The **ortho scale is pinned to a canonical box** derived from the hex footprint
alone rather than auto-fitted to scene bounds — the trial auto-fitted, which is right for one picture
and wrong for a comparison, because relief adds height and a shore moves the coast in, and either
would silently re-zoom a variant into looking better.

**Validation that the control is a control.** `land-control-487px.png` and the trial's committed
`island-pine-kit-487px.png` measure at 70,894 / 11,052 / bins90 **3,974** and 70,906 / 11,040 /
bins90 **3,978** — the same island, reproduced from a forked script, with the residual coming from
the pinned framing (487×320 vs 487×319). The pinned frame independently lands on the trial's own
auto-fitted **97.6 pack units**.

**Only one thing differs between variants beyond the axis named:** on a land that *has* a shore and
a path, nothing is planted on either. A path with trees growing down the middle of it is not a path.
That is a consequence of the geometry, not a separate art decision, and it moves the tree count by
70 → 67.

---

## 3. The instrument

`measure_land.py`. It keeps the 2026-08-22 colour numbers unchanged — **distinct**, **carrying**
(colours over 40 px), and **bins90** (colours needed for 90% of the opaque frame, the number
ADR-0418 D4 turns into an adoption band) — and adds two that answer the question this increment
turns on, which is *at which zoom does the ground's detail exist?*

- **MICRO** — mean |Δluma| between neighbouring opaque pixels. Contrast at the pixel scale: grain,
  speckle, painted texture. High MICRO at 487 px is what over-detailing looks like; at 1948 px it is
  what surviving the zoom looks like.
- **STRUCT** — standard deviation of luma after a **4-px box blur**. Contrast at the scale the eye
  still has at overview: landform, shore, path, the shadow under a stand of trees. Blurring is
  exactly the operation a zoomed-out viewer has already performed, which is why this is the
  "contrast beats detail" quantity (ADR-0415 D1's surviving half).
- **RATIO = MICRO / STRUCT**, and **bins90B** (bins90 measured on the blurred frame — how much of
  the colour count survives when the detail does not).

Two things checked rather than assumed:

- **The pixel read.** `img.pixels` was verified against a **hand-decoded PNG** (zlib plus the five
  filter types, no library): mid-tone samples agree byte-for-byte under *both* `sRGB` and
  `Non-Color` colorspace settings, so Blender applies no transform on the way into `.pixels` and
  `round(v * 255)` **is** the delivered byte. The 2026-08-22 instrument's comment on this was right.
- **Agreement with the older instrument.** Run over the trial's own committed PNG, this one returns
  **bins90 = 3,978**, which is exactly the figure that pass published. The two instruments agree
  where they overlap, so the numbers below can be read against the trial's table directly.

⚠ `island-today.png` and `island-wild.png` (the 9 and 17 rows) are **not** re-measured here. They
are Playwright *element* screenshots with the harness page's checkerboard composited in **opaque**,
so an alpha mask does not reach the island and every figure would be confounded. Those two rows are
quoted from the pass that measured them with a palette-membership mask.

---

## 4. The measurements

All figures from `measurements.json`, one pass, same instrument, and **the three tables below were
generated from that file** rather than transcribed, so they cannot drift from it.

⚠ **The last digit is not stable, and that is the denoiser, not a change.** Re-rendering a variant
whose geometry, material, seed and camera are all identical moved `strata`'s bins90 by 2 counts in
~17,500 — the OptiX denoiser is not bit-deterministic. Treat differences under about 0.05% as noise;
every difference this pass draws a conclusion from is between 10% and 1,600%.

**DRESSED islands** (the primary evidence — whole islands, both delivered sizes):

### 487 px — the overview zoom

| variant | opaque | distinct | **bins90** | bins90B | **MICRO** | **STRUCT** | ratio | **spread** | p2 | p98 | chroma | hues |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `control` | 70,894 | 11,052 | 3,974 | 4,529 | 4.85 | 22.60 | 0.21 | 113.4 | 52.6 | 165.9 | .932 | 3 |
| `procedural` | 70,894 | 15,134 | 8,045 | 9,420 | 4.65 | 20.33 | 0.23 | 100.5 | 52.5 | 153.0 | .930 | 4 |
| `textured` | 70,894 | 19,346 | 12,257 | 8,433 | 5.31 | 18.87 | 0.28 | 98.9 | 49.6 | 148.5 | .720 | 3 |
| `relief` | 71,468 | 11,676 | 4,550 | 4,788 | 4.93 | 22.85 | 0.22 | 114.9 | 53.0 | 167.9 | .945 | 3 |
| `structure` | 71,793 | 23,276 | 16,097 | 17,074 | 5.20 | 22.18 | 0.23 | 139.2 | 51.8 | 191.0 | .929 | 4 |
| **`combined`** | 71,793 | 25,256 | 18,077 | 15,231 | 5.74 | 22.00 | 0.26 | 135.5 | 52.5 | 188.0 | .929 | 4 |
| `strata` | 71,793 | 24,684 | 17,505 | 14,471 | 5.72 | 19.85 | 0.29 | 128.7 | 59.5 | 188.2 | .960 | 4 |
| *trial, committed* | 70,906 | 11,040 | 3,978 | 4,550 | 4.86 | 22.58 | 0.21 | 113.4 | 52.5 | 165.9 | .932 | 3 |

### 1948 px — the zoomed view

| variant | opaque | distinct | **bins90** | bins90B | **MICRO** | **STRUCT** | ratio | **spread** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `control` | 1,134,104 | 48,257 | 5,413 | 5,835 | 2.47 | 28.01 | 0.09 | 117.9 |
| `procedural` | 1,134,104 | 59,535 | 10,443 | 12,972 | 2.43 | 25.50 | 0.10 | 105.2 |
| `textured` | 1,134,105 | 64,442 | 18,804 | 15,821 | 3.25 | 23.79 | 0.14 | 104.0 |
| `relief` | 1,143,138 | 48,550 | 6,125 | 6,268 | 2.35 | 28.17 | 0.08 | 119.9 |
| `structure` | 1,148,472 | 84,590 | 27,191 | 26,822 | 2.45 | 29.13 | 0.08 | 150.0 |
| **`combined`** | 1,148,472 | 84,956 | 30,938 | 26,374 | 3.00 | 29.00 | 0.10 | 146.5 |
| `strata` | 1,148,473 | 83,995 | 30,271 | 25,334 | 3.06 | 26.02 | 0.12 | 135.0 |
| *trial, committed* | 1,134,241 | 48,218 | 5,412 | 5,823 | 2.47 | 28.00 | 0.09 | 117.9 |

### The land ALONE — nothing standing on it

This is the table the increment is really about, and it is the one that changes the picture.

| land only | **bins90** 487 | **bins90** 1948 | **MICRO** 487 | **MICRO** 1948 | **spread** 487 | p98 487 |
|---|---:|---:|---:|---:|---:|---:|
| `control-bare` (the approved ground) | 327 | 236 | 2.31 | 1.15 | 109.2 | 166.9 |
| `structure-bare` (place-aware, no grain) | 7,282 | 9,716 | 2.77 | 1.19 | 131.6 | 191.7 |
| `combined-bare` (place-aware + grain) | 10,404 | 15,889 | 3.40 | 1.83 | 128.5 | 188.5 |

---

## 5. What the numbers say

**1. The approved island's colour content is almost entirely its PROPS. The land has none.**
Take the props off the control and bins90 falls **3,974 → 327 at 487 px (−92%)** and
**5,413 → 236 at 1948 px (−96%)**. And it falls the *wrong way with resolution*: the control's bare
land needs **fewer** colours at 1948 px than at 487 px, across sixteen times the pixels. A surface
that reveals less as you resolve it more has no detail at any zoom — it is a gradient. That is the
single hardest number in this pass, and it is what "the land is the weakest thing on screen" means
stated as a measurement rather than as an opinion.

**2. More colours is not better, and it was measured twice.** `procedural` doubled the colour count
(3,974 → 8,045) and made the picture **flatter and softer** on every other axis: STRUCT −10%,
luminance spread −11.4% (113.4 → 100.5), and MICRO actually *down* 4%. `textured` more than tripled it
(→ 12,257) and cost STRUCT −16.5%, spread −12.8% and **22.7% of the island's chromatic fraction**
(.932 → .720). ADR-0418's "more detail remains bounded above" is usually read as a warning about
overshooting the reference; this is a nearer and cheaper failure — *a treatment can raise the colour
count while making the picture worse on every axis a viewer actually reads.*

**3. Geometry is nearly free and it is not what the colour instruments see.** `relief` moves bins90
by +14% and STRUCT and spread by under 1.5% — and it is the variant that changes the picture most
obviously to a human, because it changes the **silhouette**, which no number in this table captures.
Compare `land-control-487px.png` with `land-relief-487px.png`: same material, same props, same
camera. The measured lever from 2026-08-21 (a hard boundary on a Chaikin-smoothed coast polyline)
transfers to the land itself intact, and the cells are still untouched — only their shared outline is
smoothed.

**4. The three scales are three different jobs, and the bare-land table separates them.**

- **Place-awareness** (shore distance, path wear, own slope) is worth **+22.4 luminance spread**
  (109.2 → 131.6) and a further hue family (2 → 3 on bare land, 3 → 4 dressed), and almost nothing
  at pixel scale (MICRO at 1948 px 1.15 → 1.19, **+3%**). What it buys is p98: 166.9 → 191.7. **The shore is what widened the
  island's range** — it introduced a bright value the land simply did not have before.
- **Grain** — one high-frequency noise octave at 13% and a detail normal at strength 0.30 — is worth
  **+54% MICRO on bare land at 1948 px** (1.19 → 1.83, and +59% against the control's 1.15) and is
  the *only* thing here that makes the ground survive the zoom. Without it, `structure-bare` at
  1948 px is a watercolour wash beside props that are crisply painted.
- Grain's cost is small and real: bins90 +12% (16,097 → 18,077 at 487 px) and −3.7 luminance spread.
  Worth paying. **It did not trade the wrong way at overview**: against the control MICRO rose 18%
  (4.85 → 5.74) while STRUCT moved −2.7% (22.60 → 22.00), so the pixel-scale richness did not come
  out of the structural contrast that carries the 487 px read.

**5. The image texture failed on a structural ground, not an aesthetic one.** See
`land-textured-487px.png` and `land-textured-1948px.png`: the 2048² map tiled at 2.5 ground units
repeats about forty times across the island and the repeat is **legible as a quilted grid at both
zoom levels**. A map is authored for an object of bounded size; the ground is unbounded. And the kit
has no ground map to try — 39 packed maps, every one bark, foliage, log, rock or cliff — so
"textured ground" here could only mean *the cliff map asked to be grass*, which is what the picture
shows it doing. **This is not an argument against textures on props.** It is the specific finding
that the two thirds of the frame the land occupies is the part a bought pack cannot answer, which is
exactly what ADR-0418's Consequences predicted and this pass now has pictures for.

**6. The kit's cliff earns the skirt.** `combined` and `strata` differ in *nothing but the skirt
material*. The procedural bedded rock is competent and reads clean, and it costs **STRUCT −9.8%**
(22.00 → 19.85) and **spread −6.8** (135.5 → 128.7), because it lifts the island's dark anchor by
7.0 luma (p2 52.5 → 59.5). An island's darkest value is doing work; a pale skirt spends it. The
stepped six-row skirt is worth keeping either way — a single extruded face is a lot of frame doing
nothing at 1948 px — but the material on it should stay the kit's.

---

## 6. ⚠ A finding for `replace-the-palette-closure-check`, not an owner question

ADR-0418 D4 specifies the replacement colour-spread band with three anchors: **below it our current
9–17, above it the ~4,000 of an unmodified photoreal render, and the reference the owner named at
474.** Measured against this pass, that band has three problems, and the parked increment that
builds the check should have them before it starts.

1. **The approved render already sits AT the stated upper edge.** The trial island the owner called
   "good enough to flip the prev ADRs" measures **3,978**. So the band's ceiling is not a limit the
   approved look sits comfortably inside — it *is* the approved look.
2. **Every land treatment worth having is above it.** `combined` is 18,077 at 487 px, 4.5× the
   approved render and 38× the named reference. Even `structure`, which has no grain at all, is
   16,097. The reason is structural, not a matter of taste: **474 is measured on a flat-shaded game
   render, and the owner has already approved a continuously shaded ground** (that is the argument
   that ruled out ADR-0418's Option D). A continuously shaded, path-traced surface cannot approach
   474 without being re-quantised, which is the thing the fence was lifted to allow.
3. **bins90 is resolution-dependent, and the band does not say at what size.** The same island moves
   3,974 → 5,413 between the two delivered sizes. Worse, the dependence is not even monotonic: the
   control's bare land goes **327 → 236**, *down*, because a smooth gradient gains no new colours
   from more pixels. A band stated without a resolution is unenforceable.

**Suggested shape, offered and not decided:** state the band **per delivered size**, set its floor
from the banded look it is meant to exclude, and set its ceiling from the **approved render** rather
than from "photoreal" — and pair it with a **MICRO/STRUCT** pair, because bins90 discriminates
banded-from-continuous well and discriminates poorly among continuous renders, where it mostly
counts how much per-pixel variation a material has. That is a check-design question and it belongs
on `replace-the-palette-closure-check`; **it is not an owner question and nothing here escalates.**

---

## 7. Traps — the new ones cost real time in this pass

- ⚠ **CHAIKIN ON A RAW HEX OUTLINE PRODUCES A LOBED AMOEBA.** Chaikin converges to a quadratic
  B-spline of its *control* polygon, so applied to the 30-vertex hex outline it rounds every corner
  over a radius set by the adjacent edge length — 7 units here — and the island came out as a blob
  with no hex cluster left in it. **Resample to ~1 unit first**; then the same three iterations round
  the vertices over ~2 units and leave the silhouette alone, which is what the 2026-08-21 lever
  actually was.
- ⚠ **RELIEF AMPLITUDE IS NOT WHAT MAKES RELIEF READ — WAVELENGTH IS.** The first landform put
  ±1.15 units across a ~30-unit wavelength: a 4° slope, and the island looked flat. What the eye
  reads is the *slope*, so a mid-frequency octave at a third of the amplitude does more work than the
  broad one.
- ⚠ **A PATH'S WIDTH DOES NOT TRANSFER FROM THE PROPS PASS.** 5.5 units of falloff delivered an
  ~11-unit corridor — 22 delivered px at 487 — and it read as a trunk road cutting the island in
  half. The props pass's "paths need 10–11 units, not 7" was measured on a path meant to be *walked
  along* in a dressed composition; a worn track through open ground wants roughly half that.
- ⚠ **A VORONOI USED FOR HUE VARIATION DELIVERS VISIBLE CELLS**, and at island scale they read as
  continents rather than as ground. A slow noise gives the same hue drift with no shape to it.
- ⚠ **THE KIT'S CLIFF NORMAL MAP IMPOSES ROCK ON THE GRASS ABOVE ~0.30 STRENGTH.** At 0.55 its
  directional striation shows through as visible whorls, and the tiling with it. It is a rock map;
  asked to be a ground map it asserts rock.
- ⚠ **A PURE GREEN NEXT TO AN OCHRE READS MINT.** The first hue-varied ramp used a spectrally pure
  green (B ≈ R) and the island came out looking like toothpaste. Warming the red channel fixed it.
- ⚠ **`--out .` SILENTLY FAILS UNDER `blender -b`.** A relative render filepath resolves against the
  **blend file's** directory, not the working directory, so a whole seven-variant sweep died on
  `cannot save: 'land-control-487px.png'` while sitting in the directory it was trying to write to.
  Pass an absolute path.
- ⚠ **A DENOISED PATH-TRACED FRAME COMPRESSES BADLY, AND THESE ARE COMMITTED.** Blender's default
  PNG compression (15) produced 21 MB for this set; `image_settings.compression = 100` produced
  19 MB with the 1948 px frames 25% smaller, at the cost of ~6 s per large frame. Set it in any
  script whose output goes into the repo.
- ⚠ **THE OptiX DENOISER IS NOT BIT-DETERMINISTIC.** An identical re-render moved a measured count
  by 2 in ~17,500. Everything upstream of it *is* seeded and reproducible; the last digit of any
  post-render measurement is not. Do not diff two runs byte-for-byte and report the difference.
- ⚠ **`get_devices_for_type` RETURNS THE CPU ALONGSIDE ANY GPU** — see §1. This is the one that would
  have failed *silently and in the safe-looking direction*, by making the CPU fallback unreachable
  on a box that has no GPU.

Inherited traps this script encodes and does not re-discover: the island's **bounding box lies**
(hex cluster, the box corners are water — everything is clipped to the coast polygon); **a generated
mesh has no UV layer** and an image texture on one samples texel (0,0) for every fragment (the
trial's solid-black skirt); the kit's objects live in the **kit's own collections**; and
**`Pine-Leaves_02` has a hyphen** where its three siblings have underscores.

---

## 8. What is NOT decided here

- **Adoption.** Nothing here reaches the app. ADR-0380 D6 and ADR-0406 D2 keep experiment and
  adoption separate, and the ADR-0418 D4 replacement check gates adoption, not experiment.
- **The owner's look.** Unspent, deliberately (ADR-0392 D1). The arc holds
  `the-owner-looks-at-the-islanders-grounded-islands` for it.
- **Which composition.** This pass moved the LAND under one fixed scatter. It is not a pick between
  the five dressings in `island-dressing.ts`, and it does not touch the canopy work.
- **How any of this reaches `forest-world-r3f`.** A Cycles render is not a live renderer. Attribute-
  driven shading, a displaced grid and a stepped skirt are all ordinary three.js work, but the
  delivered payload is unmeasured and remains the one cost ADR-0418 took on without a number — the
  parked `first-textured-asset-in-the-live-renderer` owns it.
- **How status is carried once colour is freed.** Untouched. ADR-0392 D5 / ADR-0398 D7 hold: an art
  change does not decide what the map asserts. Note that this pass makes it *sharper* — a land whose
  colour is chosen by shore distance, slope and wear has spent its colour on terrain, which is
  exactly the channel the product map uses for status.

## Files

`build_land.py` (the seven variants, `--bare`, `--device`) · `measure_land.py` (the instrument) ·
`measurements.json` (every figure in §4) · `land-<variant>-{487,1948}px.png` (seven dressed islands,
both delivered sizes) · `land-{control,structure,combined}-bare-{487,1948}px.png` (the land alone).

Reproduce:

```
blender -b "<pack>/Pine_Forest_Kit.blend" -P build_land.py -- \
    --land combined --out "$PWD" --widths 487,1948          # add --bare for the land alone
blender -b -P measure_land.py -- "$PWD"/land-*.png --json "$PWD"/measurements.json
```
