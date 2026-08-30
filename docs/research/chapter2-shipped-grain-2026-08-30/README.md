# The shipped map's ground wears the grain — its palette-safe half, because the other one misreports


> ⚠⚠ **EVERY FIGURE BELOW IS ABOUT THE FOUR-RUNG SHADE LADDER** `[0.78 0.80 0.90 1.00]`, which is
> what shipped when it was measured. The map adopted a NINE-rung ladder at 0.025 spacing from 0.80
> on 2026-08-31 (`adopt-the-refined-shade-ladder`), so any rung index, rung count, per-rung
> separation or "one shade rung" comparison here is read at a coarser resolution than the map now
> draws. The figures are not wrong — they are about a ladder the comparison page still renders, as
> the arms pinned to `LEGACY_SHADE_LEVELS`. What moved, what did not, and why the derived constants
> survived: `chapter2-shipped-adopted-ladder-2026-08-31/`.

**Increment:** `cross-the-grain-octave-into-the-shipped-ground` on
`adopt-the-land-into-the-shipped-map-arc`. **Date:** 2026-08-30. **Measured on:**
`ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`, read out of the live
context; GPU clock via `EXT_disjoint_timer_query_webgl2`.

**The third component of the approved treatment across**, and the rest of the owner's *"improve the
ground texture"*. The first two landed the same week:
[the relief field](../chapter2-shipped-relief-2026-08-30/README.md) put the land's SHAPE in the
buffer, and [the shade ladder](../chapter2-shipped-banded-2026-08-30/README.md) quantised it onto
four authored zones. Both reported the same honest disappointment: **neither moved the overview.**

**This one does.** It is also the first component whose crossing was gated by a MEASUREMENT rather
than by an engineering unknown, and the measurement came back NO for half of it.

Reproduce (⚠ the frame figures need a discrete GPU):

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5271 --strictPort
DISPLAY=:0 ST_LAND_URL=http://localhost:5271/shipped-land.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-land
```

Raw: [`shipped-grain.json`](shipped-grain.json).

**It reproduces the two landings before it exactly.** `flat`, `relief` and `banded` came back at
0.0038 / 0.0039 / 0.0023 ms at the overview and 0.0448 / 0.0448 / 0.0218 at the zoomed read — every
one of those six medians within 0.0001 ms of the figures the ladder increment published, on a page
that has since grown two arms and changed material implementation for its ceiling. That is the
control on everything below.

---

## 1. THE PICTURES — five arms now, each differing from the one before it in ONE thing

| picture | what it adds |
|---|---|
| `shipped-flat-{2,8}px.png` | — the shipped map **on 2026-08-29**, byte for byte |
| `shipped-relief-{2,8}px.png` | **+ the land's relief field** (PR #1725) |
| `shipped-banded-{2,8}px.png` | **+ the authored shade ladder** (PR #1726) |
| `shipped-grain-normal-{2,8}px.png` | **+ the grain octave's NORMAL half** — ⭐ what `<ForestWorldCanvas>` draws now |
| `shipped-grain-both-{2,8}px.png` | **+ its COLOUR half** — ⚠ REFERENCE ONLY, see §3 |

⚠⚠ **ALL FIVE ARE ONE MATERIAL NOW, WHICH THE LADDER'S FOUR WERE NOT.** That comparison's ceiling
arm wore `harness/banded-material.ts` — the experiment's own material — so "these two differ only in
the grain" was a claim it had to close arithmetically by proving the two materials build an
identical ramp. `land-grain.ts` has crossed, so `grain-both` is `createBandedGroundMaterial` with
one option changed. The claim is now a property of the call, and the single-status refusal the old
ceiling arm needed retired with it: the shipped material takes a ramp ROW per parcel, so every arm
draws a mixed-status island correctly.

✅ **AND THE OVERVIEW MOVED — the first time on this arc.** Look at `shipped-banded-2px.png` beside
`shipped-grain-normal-2px.png`. The banded island is broad soft zones; the grained one carries a
fine texture across its whole surface. That is not luck of the eye — it is what the field's own
sizing predicts, and the prediction was authored months before this picture: the grain's delivered
feature is **~6.5 ground units**, which at 2 delivered px per unit is **~13 px**, comfortably
resolvable. Relief (a ±4-unit swell = two delivered pixels) and the ladder (zones a handful of
pixels wide) were both below that line. **15.9% of the overview frame changes**, against 15.8% at
the zoomed read — the grain is very nearly zoom-independent, because it samples in world
coordinates.

⚠ **BE PRECISE ABOUT WHAT THAT DOES AND DOES NOT SETTLE.** The island is still a green lozenge at
2 px; what it now has is a SURFACE rather than a fill. The arc's open problem — what makes an
island read as a *place* at the overview — is not closed by a texture, and nothing here claims it is.

---

## 2. WHAT IT COST — 0.55% of a 60 Hz frame, and the normal half is the expensive one

| arm | zoom | median ms | % of a 60 Hz frame | draw calls | triangles |
|---|---:|---:|---:|---:|---:|
| flat | 2 px | 0.0038 | 0.02% | 1 | 1,640 |
| relief | 2 px | 0.0039 | 0.02% | 1 | 1,640 |
| banded | 2 px | 0.0023 | 0.01% | 1 | 1,640 |
| **grain-normal** | 2 px | **0.0078** | **0.05%** | 1 | 1,640 |
| grain-both | 2 px | 0.0093 | 0.06% | 1 | 1,640 |
| flat | 8 px | 0.0448 | 0.27% | 1 | 1,640 |
| relief | 8 px | 0.0448 | 0.27% | 1 | 1,640 |
| banded | 8 px | 0.0218 | 0.13% | 1 | 1,640 |
| **grain-normal** | 8 px | **0.0909** | **0.55%** | 1 | 1,640 |
| grain-both | 8 px | 0.1078 | 0.65% | 1 | 1,640 |

7 interleaved repeats, 300 renders per timed batch, GPU clock rather than submission time. Spread
0.0000–0.0001 ms.

**Read it against the material it REPLACES, not against the ladder.** The shipped ground wore
`MeshStandardMaterial` on 2026-08-29 at 0.0448 ms; it now wears the banded ladder plus the grain at
0.0909 — **2.03x**, and 0.55% of a 60 Hz frame. The ladder had bought a 51% saving; the grain spends
it and about as much again.

⚠ **THE NORMAL HALF IS 84% OF THE FULL GRAIN'S COST, WHICH INVERTS THE INTUITIVE ORDER.** Adding the
colour half on top costs only 0.0169 ms more (0.0909 → 0.1078). That matches the decomposition
[the frame-cost study](../chapter2-frame-cost-2026-08-28/README.md) measured — the normal half
evaluates the field FOUR times for a central difference (32 sin/frag) where the colour half
evaluates it once (8) — and it means the cheap half of the grain is the one that is inadmissible,
and the expensive half is the one that ships. There is no version of this fork where holding the
palette closure saves frame time.

⚠ **AND IT SCALES WITH COVERAGE.** This is one island filling ~2/3 of its own fitted frame.
`hardware-floor.mjs` measured this renderer draw-call bound and a dressed 35-island forest at
0.602 ms over 299 draw calls, so nothing here is near a constraint — but a forest covers far more of
the frame than one island does, and that measurement has not been retaken with the grain on.

---

## 3. THE MEASUREMENT THAT GATED IT — and it came back NO

The increment's own framing said the crossing is mechanical and what gates it is **whether the
shipped ground may leave the closed palette** — *"a MEASUREMENT before it is an owner fork."* It
said, in as many words, not to escalate before asking whether a 13% status-independent mottle
actually moves any pixel into a neighbouring status's family.

`harness/grain-status-reading.ts` asks it. **The answer is that it does.**

| | |
|---|---|
| the colour half at its authored `fac = 0.13` | **INADMISSIBLE** |
| where | `proposed`/`building` at ladder rungs **0.78** and **0.80** |
| what it reads as | **`healthy`** — a capability that is merely proposed reporting as signed-off |
| worst margin, grained | **−8.00** weighted channel units |
| worst margin, ungrained | **+3.00**, at the same place |
| readings that move | **4 of 24** `(status, rung)` pairs |
| the largest mix every reading survives | **0.031** — under a quarter of the authored one |

**THE BINDING FACT IS THE PALETTE'S, NOT THE GRAIN'S.** The shipped ladder's tightest reading margin
is 3.0 units, and it is the shared yellow at its darkest rung against `healthy`'s green. It HOLDS —
every one of the 24 `(status, rung)` readings reports its own family, so the ground the map draws
today is honest — but it holds with almost nothing to spare. A 13% mottle is simply more than 3
units of headroom can absorb. Any treatment that perturbs a delivered colour at all will meet this
same wall until the yellow and the green are pulled apart.

**HOW IT IS ASKED, AND WHY NOT WITH A CAMERA.** Two traps this arc had already paid for made a pixel
sweep the wrong instrument, and both are named in the increment:

- **A grained picture is renderer-specific.** SwiftShader and an RTX 2060 disagree on 24.5% of
  grained pixels — a different mottle, not a rounding difference. So the answer has to be a claim
  about the FIELD's reachable colour set, not about one machine's frame.
- **The fixture island is single-status.** No sweep over these pictures can see a foreign-status
  read at all.

So it is arithmetic, and it is EXHAUSTIVE rather than sampled: the colour half is linear in the
grain scalar, so the reachable set for one `(token, rung)` base is a straight SEGMENT in RGB between
`mix(base, darkStop, fac)` and `mix(base, lightStop, fac)`. Walking that segment at 1/2000 of the
scalar moves any channel by at most 0.017 — two orders inside the rounding grid — so the walk
enumerates every colour the half can deliver. All six shipped ground tokens, all four rungs, no GPU.
The reader model is the house one (`nearestStatus` over a weighted table), the same port the shadow
ladder uses, so this is a reuse rather than a new judge.

⚠ **ONE CORRECTION THE INSTRUMENT MADE BEFORE IT WAS BELIEVED**, recorded because it fails in the
direction that reads like a discovery: the reader's reference colours must be built at
`FLAT_GROUND_LEVEL` (0.90), not at full light. The live renderer never delivers flat ground at 1.0 —
a flat up-normal lands on rung 0.90 — so a table of full-strength tokens compares every delivered
pixel against a colour the map cannot draw, and reports the ORDINARY SHIPPED GROUND as already
misreporting on four rungs. `shadow-ladder.ts` makes that correction at length and this module got
it wrong first.

**SO THE NORMAL HALF SHIPS AND THE COLOUR HALF DOES NOT.** The normal half perturbs the lambert
BEFORE the quantiser, so the fragment still writes an authored ramp entry — the closure is untouched
by construction, and measured: **0 off-palette pixels at both zooms**, on the same run that found
25,630 and 410,396 of them in the `grain-both` arm (every land pixel it drew).

| zoom | arm | distinct land colours | authored entries | off-palette px |
|---|---|---:|---:|---:|
| 2 px | banded | 4 | 20 | **0** |
| 2 px | **grain-normal** | 4 | 20 | **0** |
| 8 px | banded | 4 | 20 | **0** |
| 8 px | **grain-normal** | 4 | 20 | **0** |

✅ **AND THE COST OF HOLDING THE CLOSURE IS SMALL, WHICH IS THE POINT OF PICTURING IT.** Put
`shipped-grain-normal-8px.png` beside `shipped-grain-both-8px.png`. The normal half already carries
the texture; the colour half mostly softens its edges into a continuous mottle. On a four-rung ladder
the normal half can only express grain as a threshold crossing, so it delivers a stipple where
Cycles delivers micro-variation — that difference is visible, and it is a good deal smaller than the
gap between either of them and the ungrained ladder.

**The fork is the owner's** and is open as
`oq-the-grain-s-colour-half-is-inadmissible-on-the-shipped-pa`, carrying the number rather than a
yes/no: 0.13 requested, 0.031 admissible, and a third option — separate the yellow from the green —
that is a palette decision rather than an art one.

---

## 4. WHAT THIS PAID FOR ON THE WAY — the local escape hatch was drawing a blank frame

⚠⚠ **`ST_LAND_ALLOW_SOFTWARE=1` DID NOT WORK, AND IT FAILED VACUOUSLY.** The ladder increment left
that flag documented as the way to develop the colour half on the Windows box without a GPU round
trip. Measured here: under `--use-angle=gl` Chromium there comes up on SwiftShader **and its
readback is blank** — `readPixels` returns one uniform colour for every arm. Every rung then
"changes 0% of the frame", which the driver reports as *"that component is in the code and not in
the picture"*, naming an innocent component; and the palette-closure check passes, because a blank
frame has no off-palette pixel in it either. It cost an hour looking like a broken relief field.

Two things changed:

- **A blank-frame refusal**, asked of every arm before any comparison: one distinct delivered colour
  means the page drew nothing, and the driver now says so and names the cause.
- **`ST_LAND_ANGLE`** (default `gl`, so every committed figure stays comparable). The same Windows
  box exposes a REAL GPU under `--use-angle=default` — measured, `ANGLE (Qualcomm, Qualcomm(R)
  Adreno(TM) X1-85 GPU, D3D11)`, `software=false`, timer query available — so `ST_LAND_ANGLE=default`
  is a working local development route and a better one than the software flag ever was. ⚠ It is
  **not** a way to take a committed figure: every number in `docs/research/chapter2-shipped-*` is an
  RTX 2060's, and a table whose rows came off two GPUs is not a ladder.

---

## 5. WHAT THIS DOES NOT DO

- **It does not settle the overview.** It moves it — measurably and visibly, for the first time on
  this arc — and the island is still a green lozenge at 2 px. Whatever finally makes an island read
  as a place up there is a fourth thing nobody has named.
- **It does not touch the classic hex substrate**, the props, the coast clip or the stepped skirt.
  `scope-fence.test.ts` still fences all of them.
- **It does not touch the framing** — `does-the-shipped-framing-waste-a-third-of-the-screen` owns
  that question, and the comparison deliberately fits the island's own bounds instead.
- **It does not re-measure the hardware floor.** The grain scales with coverage and the 35-island
  crowd figure predates it.
- **It is not in `check:land-art`.** That rung drives `capture.mjs` over the harness pages; adding
  this one would red on the `grain-both` arm, which is off-palette on purpose. The closure is held
  by the source-level test in `pnpm -r test` and by the driver's own delivered-pixel refusal.
- ⚠ **The grained PNGs are one renderer's mottle.** Do not build a pixel baseline over them
  (`grain-picture-is-renderer-specific`). The `banded` ones are renderer-stable; the arc's standing
  advice is to hold the palette rather than the pixels.
