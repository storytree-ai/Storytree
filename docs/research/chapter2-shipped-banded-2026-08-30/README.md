# The shipped map's ground wears the authored shade ladder — and it costs less than what it replaced

**Increment:** `improve-the-ground-texture` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-30. **Measured on:**
`ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`, read out of the live
context; GPU clock via `EXT_disjoint_timer_query_webgl2`.

**The second component of the approved treatment across.** The first —
[the relief field](../chapter2-shipped-relief-2026-08-30/README.md), landed the same day — put the
land's SHAPE in the buffer, and reported honestly that under `MeshStandardMaterial` it arrived as a
smooth lambert gradient rather than the authored zones the approved research renders show. This is
the ladder that quantises it.

⚠ **AND THE STANDARD MOVED THE SAME DAY, so read this against it.** The owner, answering
`oq-the-map-this-arc-is-improving-is-mounted-nowhere-which-ma`, volunteered:

> "we need to make sure the look is right first as I understand the image that I stamped as looking
> awesome was done in isolation and now we trying to do the same with the app constraints in place."

So a component that crosses correctly has not thereby delivered the look. That is why there are
**four** arms below and not two: the fourth is the ceiling this one is reaching for, drawn on the
same island, in the same frame, on the same GPU.

Reproduce (⚠ the frame figures need a discrete GPU — headless Chromium on the Windows box comes up
on SwiftShader and the driver refuses it by name):

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5252 --strictPort
DISPLAY=:0 ST_LAND_URL=http://localhost:5252/shipped-land.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-land
```

Raw: [`shipped-banded.json`](shipped-banded.json).

---

## 1. THE PICTURES — four arms, each differing from the one before it in ONE thing

| picture | what it adds |
|---|---|
| `shipped-flat-{2,8}px.png` | — the shipped map **on 2026-08-29**, byte for byte |
| `shipped-relief-{2,8}px.png` | **+ the land's relief field** (crossed earlier the same day, PR #1725) |
| `shipped-banded-{2,8}px.png` | **+ the authored shade ladder** — ⭐ what `<ForestWorldCanvas>` draws now |
| `shipped-treated-{2,8}px.png` | **+ the grain octave** — ⚠ REFERENCE ONLY, see §5 |

**Look at the 8 px pair `relief` → `banded` first.** `relief` is a green wash: a ±4-unit swell
lit by a PBR material integrates into a gradient so gentle it reads as one colour with a soft
edge. `banded` is the same geometry under the same light with the lighting term quantised onto
four authored rungs — and the land acquires legible structure, ridges and hollows you can point
at, at the zoom the map is actually read at.

⚠ **THE OVERVIEW (2 px) IS THE HONEST DISAPPOINTMENT, AND IT IS THE SAME ONE THE RELIEF REPORTED.**
At two delivered pixels per ground unit the island is ~470 px wide and the ladder's zones are a
handful of pixels each. The picture is better than `relief` but it is not transformed. Whatever
finally carries the overview, it is not this — and it is worth saying plainly rather than letting
four pictures imply otherwise.

---

## 2. WHAT IT COST — it is CHEAPER than the material it replaced, by half

| arm | zoom | median ms | % of a 60 Hz frame | draw calls | triangles |
|---|---:|---:|---:|---:|---:|
| flat | 2 px | 0.0038 | 0.02% | 1 | 1,640 |
| relief | 2 px | 0.0039 | 0.02% | 1 | 1,640 |
| **banded** | 2 px | **0.0023** | **0.01%** | 1 | 1,640 |
| treated | 2 px | 0.0092 | 0.06% | 1 | 1,640 |
| flat | 8 px | 0.0448 | 0.27% | 1 | 1,640 |
| relief | 8 px | 0.0448 | 0.27% | 1 | 1,640 |
| **banded** | 8 px | **0.0218** | **0.13%** | 1 | 1,640 |
| treated | 8 px | 0.1069 | 0.64% | 1 | 1,640 |

7 interleaved repeats, 300 renders per timed batch, GPU clock rather than submission time. Spread
0.0000–0.0124 ms. `frame budget: PASS`.

**The banded ground costs 51% LESS per frame than the smooth one at the zoomed read**, and the
reason is structural rather than lucky: `MeshStandardMaterial` runs a physically-based lighting
model over an ambient and a directional light per fragment, while this material does one dot
product, one four-way compare and a table read. Nothing was optimised — the cheaper thing is
simply what a locked palette *is*.

⚠ **DO NOT GENERALISE THAT TO THE TREATMENT AS A WHOLE.** The grain arm costs 4.9x the banded one
and 2.4x the material it would replace. That is still 0.64% of a 60 Hz frame on this island, and
`hardware-floor.mjs` measured this renderer **draw-call bound** — but the ground scales with
COVERAGE, and a whole forest of islands covers far more of the frame than one does.

---

## 3. DID IT REACH A PIXEL, AND DID IT STAY HONEST? — the two questions, both refused on failure

| zoom | arm | distinct land colours | off-palette px | frame changed vs the arm before |
|---|---|---:|---:|---:|
| 2 px | relief | 36 | (not asked) | 55.4% |
| 2 px | **banded** | **4** | **0** | **58.2%** |
| 2 px | treated | 186 | (not asked) | 58.2% |
| 8 px | relief | 38 | (not asked) | 55.3% |
| 8 px | **banded** | **5** | **0** | **58.2%** |
| 8 px | treated | 186 | (not asked) | 58.2% |

⚠ **THE COLOUR COUNT GOES DOWN AND THAT IS THE POINT, WHICH IS WHY IT IS NOT THE MEASURE.** The
relief increment used "distinct delivered colours" as its evidence that a treatment reached a
pixel; here that number *falls* from 36 to 4, because quantising is exactly what the ladder does.
So the reaching-a-pixel question is asked as **`changedPct` per rung** instead — 58.2% of the frame
changes between `relief` and `banded`, which is essentially the whole island — and the driver
REFUSES a run in which any rung changes no pixel at all.

**And the closure is measured on delivered pixels, not argued.** Every land pixel the banded arm
draws is one of the **20** authored `(token × level)` entries this palette contains: **0 off-palette
pixels at either zoom, on the NVIDIA GPU, and 0 on SwiftShader in the same code** — so the fence
this arc rests on is renderer-independent for this material, as it was for the harness's.

---

## 4. WHAT IT BUYS THE MAP'S HONESTY — a TIGHTENING, not a risk

`ADR-0392 D5 / ADR-0398 D7`: the land's colour is a capability's proof state, and a prettier map
that misreports is a regression. The obvious worry about a new ground material is that it moves
what the map says. This one narrows it:

- **Before**, the ground wore `MeshStandardMaterial` under an ambient + directional pair. Its
  reachable colour set was whatever that lighting produced — unbounded below, and 36–38 distinct
  colours delivered on a *single-status* island. Nothing anywhere enumerated it.
- **After**, the reachable set is 24 entries (20 distinct), every one of them `token × level` for
  an authored token and an authored rung, floored at **0.78 of the token**. It is enumerable in
  TypeScript with no GPU, and `banded-ground-material.test.ts` enumerates it — including the
  exhaustive pairwise check that **no two different statuses share a delivered colour**.

The closure is proved twice over, in the two forms that catch different things:

| form | what it can prove | where |
|---|---|---|
| from the SOURCE | no *reachable* pixel is off-palette — the only expression reaching `gl_FragColor` is a `uRamp` element | `banded-ground-material.test.ts`, no GPU |
| from the PIXELS | this run, on this renderer, delivered none | `shipped-land-measure.mjs`, refuses on failure |

---

## 5. THE FOURTH ARM IS A REFERENCE, AND WHY IT IS NOT ADOPTABLE TODAY

`treated` is `harness/banded-material.ts` — the experiment's own material — wearing the grain
octave the approved Cycles render used, on the same island in the same frame. It is here because
the owner's standard is the approved picture rather than "it now runs in the live renderer", and
the gap between `banded` and `treated` is what the crossing has left to close.

⚠ **It is drawn by a different implementation from `banded`, which the other three rungs are not.**
Those three are one function called with one input changed. The gap is closed arithmetically
rather than by hope: `shipped-land-scene.test.ts` proves the two materials build an **identical
ramp** for this island's token, so the only thing that can differ between them is the grain.

**Two things stand between the grain and adoption, and only one is engineering.**

1. **Its colour half is off-palette BY CONSTRUCTION.** It mixes a noise-driven ramp *into* the
   delivered colour, which is precisely the thing §4 says this surface may not do. The grain's
   *normal* half perturbs the lambert BEFORE quantisation and keeps the closure — so the real
   question is whether the palette-safe half alone is worth having, and that is measurable.
2. **`land-grain.ts` has not crossed.** It is a straightforward move once (1) is settled.

---

## 6. WHAT THIS DOES NOT DO

- **It does not touch the classic hex substrate.** `HexGround` still wears the placeholder
  `meshStandardMaterial`. A scene carries one substrate or the other and the relaxed mesh is what
  the studio ships; rewriting the legacy path would be a second untested crossing.
  `shipped-baseline.test.ts` records the asymmetry so it is a known fact rather than a discovery.
- **It does not touch the props, the coast clip or the stepped skirt.** Still `harness/`-only, and
  `scope-fence.test.ts` still fences them.
- **It does not touch the framing.** The comparison fits the island's own bounds rather than
  `frameWorld`'s whole-world rule — deliberately, since
  `does-the-shipped-framing-waste-a-third-of-the-screen` owns that question.
- **It is not in the gate.** `check:land-art` drives `capture.mjs` over the harness pages and does
  not audit this one; adding it would red on the `treated` arm, which is off-palette on purpose.
  The closure is held by the source-level test, which runs in `pnpm -r test` and is the stronger
  of the two forms.
- ⚠ **The `treated` PNGs are one renderer's grain** (`grain-picture-is-renderer-specific`: a
  quarter of a grained surface lands on a different rung across vendors). Do not build a pixel
  baseline over them. The `banded` ones ARE renderer-stable — measured, 0 off-palette on both —
  but the arc's standing advice is to hold the palette rather than the pixels.
