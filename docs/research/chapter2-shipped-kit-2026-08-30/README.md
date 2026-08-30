# The bought kit stands on the shipped map — one object per capability

**Increment:** `cross-the-bought-kit-onto-the-shipped-map` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-30. **Measured on:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`,
read out of the live context. Two runs; run 1 carried a 4.94 ms outlier on one row and run 2 was
clean, so **run 2 is what is committed** — and it reproduced PR #1743's four published control
medians to 0.0001 ms, which is what licenses reading its new rows against the old table at all.

Reproduce (the frame figures need a discrete GPU; the primary Windows box reaches its own Adreno
with `ST_LAND_ANGLE=default` for development, but every committed figure here is the RTX's):

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port <free> --strictPort
DISPLAY=:0 ST_LAND_URL=http://localhost:<free>/shipped-land.html \
  pnpm --filter @storytree/forest-world-r3f run measure-shipped-land
```

Raw: [`shipped-grain.json`](shipped-grain.json).

---

## 1. THE ANSWER

**The shipped map now draws one bought object per capability, and it is the sixth component of the
approved treatment to cross.** The five before it were all GROUND. This is the first thing that
STANDS on it.

| | before | after |
|---|---|---|
| things standing on the shipped island | **1** (the story tree) | **12** (the story tree + one pine per capability) |
| draw calls they cost | 2 | **4** — the props merge to one mesh per (material, tint) |
| ground frame cost, 8 px/unit | 0.0929 ms | **0.0929 ms** — unchanged, and it has to be |
| what a capability's state is drawn as | the colour of its ground | its ground **and** the species and leaf tint of its own tree |

**The pictures:** `shipped-bare-{2,8}px.png` against `shipped-dressed-{2,8}px.png`. Same island,
same ground, same framing, same light — differing in exactly the props.

⚠ **THE GROUND FIGURES ARE UNCHANGED ON PURPOSE, AND THAT IS A CHECK RATHER THAN AN OMISSION.**
Every measured arm on this instrument is ground-only, because the palette closure is asked of
delivered pixels and a textured crown puts thousands of them in the frame that are off the ground
palette by construction. So the props ride alongside the ladder rather than inside it, and the
ladder reproducing its own published medians is what says the props changed nothing they should not
have.

---

## 2. THE TWO THINGS THAT ACTUALLY BLOCKED IT — neither of them the ones the arc predicted

The arc's start-order note says a textured asset "is a NEW CAPABILITY, not a probe" because there is
"ZERO model- or texture-loading infrastructure" anywhere, and prices it against 546 MB of
uncompressed TGA. **Checked by grep before any work, that is overtaken:** `harness/kit-scene.ts`
imports `GLTFLoader` from `three` itself (no dependency to install), `harness/assets/dressing-kit.glb`
is committed at 162,748 B, and the colour guard, the tint rule, the vocabulary and the loader are all
built. The 546 MB is the SOURCE kit in `C:\code\assets`, not what a visitor downloads. So this was a
CROSSING of the same shape as the five before it — and the two things that really blocked it were
found by reading, not by building.

### 2a. The shipped descriptor stream was blind to which capability a cell belongs to

`harness/island-descriptors.ts`'s `groundCellsFrom` has read the owning capability's id off each
`parcel` group since the procedural dressing. `worldTo3D` did not: a `cell-ground` descriptor carried
the FOLDED status and the ring, and nothing else. **ONE OBJECT PER CAPABILITY is not expressible
against that** — the eleven `healthy` capabilities on this island are eleven copies of one value.

`worldTo3D` now carries `parcel`. Measured against the harness's own reader on the real fixture:
**164 cells, 11 parcels, identical id sets.**

⚠ The id is taken ONLY from a group whose own kind is `parcel`. Every `<g>` on an island carries an
`id` for its own reasons — a territory, a trail edge, a hit target — and reading `node.id` generally
would partition the land along lines that are not capability boundaries, invisibly: the resulting
picture is an ordinary island, and every prop on it would assert about the wrong capability. That
trap has its own test, and the test was checked against the broken implementation.

### 2b. A `.glb` cannot cross the web-sync seam

`isEngineSource` (`packages/cli/src/web-engine-sync.ts`) carries `.ts` and `.tsx` **and nothing
else**, and `check:web-engine` blocks until the mirror matches. A `src/` module that fetched
`/assets/dressing-kit.glb` would work in the parent's own harness and **404 in the public engine
copy** — silently, only for visitors, and only once somebody mounted it.

So the asset is embedded as a generated `.ts` module, and the cost is measured rather than argued
(`node:zlib` brotli q11):

| | on disk | brotli |
|---|---:|---:|
| the raw `.glb` | 162,748 B | 110,487 B |
| base64 in a `.ts` | 217,034 B | **124,567 B** |

**+12.7% over the wire** for an asset that cannot go missing. The alternative — teaching the sync to
carry binary assets — buys back 14,080 B and costs a change to a pure tested module, its gate rung,
and a URL every consuming bundler has to resolve. It is written down beside the number rather than
taken silently; if the payload ever matters more than the wiring, that is the route.

⚠ The `.glb` stays the one source of truth. `src/kit-asset.ts` is a projection of it, and
`src/kit-asset.test.ts` re-derives the base64 from the committed file and compares byte for byte —
the generated-view + drift pattern, because a projection with no drift check is how this package
acquired three disagreeing status palettes.

---

## 3. TWO THINGS THE PROPS EXPOSED ABOUT THE MAP'S OWN LIGHT

Both predate this increment. Neither was visible while the only lit object was a flat placeholder
cone, and both are corrections in the SAME direction: the light is now **derived** from the same
constants the ground is shaded by, so the three cannot drift apart.

### 3a. The key light was on the wrong side of the island

`ForestWorldCanvas` hung its directional light at `[120, 300, 80]` — **(+0.36, +0.90, +0.24)**
normalised. The land's own authored sun is `LIGHT_DIRECTION` = **(-0.45, +0.83, +0.35)**. Opposite
side in x.

So every lit object on the shipped map was lit from the east while the ground beside it was banded —
and, since the shadow field crossed on 2026-08-30, **cast its shadows** — from the west. A prop lit
from one side while throwing its shadow toward that same side is the incoherence that reads as
"wrong" before anyone can name it. The story tree carried it alone for months; a stand of trees
cannot.

### 3b. The intensities were chosen for flat placeholder meshes, and they saturate a texture

`0.7` ambient + `1.1` directional = **1.8**. For a flat cone whose own colour IS the picture, that is
merely bright. The bought kit is the first thing on this map with a TEXTURE, and **the first dressed
frame came back with pale grey needles on pink trunks** — which reads as a broken asset and is an
overexposed one.

The ladder already says what "lit" and "unlit" mean here, so the intensities are read off it — the
same pair `calibrateLights` starts from: a fully lit white face lands on the ladder's **top rung**
(1.00) and an unlit one on its **floor** (0.78). Ambient `0.78`, directional `0.22`.

⚠ **WHAT IS NOT DONE, and it is the honest gap in the picture.** That calibration has a second half:
`calibrateLights` then PROBES a live renderer and scales both by `target / probe`, because a standard
material's real response carries a specular term this arithmetic does not model. The shipped canvas
runs no probe, so what it hangs is the authored INTENT rather than the measured correction — and the
crowns in `shipped-dressed-8px.png` are visibly lighter than the ones in the approved
`chapter2-vocabulary-2026-08-29/island-kit-8px.png`, which were calibrated. **Closing it is one
small unit** (cross `calibrateLights`, probe once per mount off `useThree(s => s.gl)`), and it is
named here rather than left for someone to notice in a picture.

---

## 4. WHAT THE MAP STILL DOES NOT SAY — the named gap, not a quiet drop

**The UAT blooms are not drawn.** The vocabulary's sixth entry is one flower per criterion the owner
has signed (ADR-0226 D4), and it is a claim about a **story**. A `cell-ground` descriptor carries the
capability's parcel and no island attribution, so a bloom count read on the shipped path would
scatter one story's signed criteria across every other story's island — the map asserting a signature
on work nobody signed, which is worse than the absence (ADR-0392 D5). The criteria ARE in the scene
(`tall-flower-proven`, currently a skip); carrying an island id through `worldTo3D` is what closes
it, and it is its own unit.

Both the canvas and the comparison page pass `blooms: 0` explicitly, and both say why at the call
site.

---

## 5. WHAT CROSSED, AND WHAT DELIBERATELY DID NOT

Six modules, five of them splits. Each leaves a re-export behind, and `harness/scope-fence.test.ts`'s
ADOPTED ledger holds both halves — the file really is in `src/`, and the harness really re-exports
from it.

| module | shape | what stayed behind, and why |
|---|---|---|
| `kit-vocabulary.ts` | SPLIT | the fixture adapter — the shipped canvas has no fixture and no `SceneG`, so the crossed half takes cells and facts as arguments |
| `kit-mesh.ts` (from `kit-scene.ts`) | SPLIT | the harness's FETCH (vite serves its `/assets/`) and the light CALIBRATION, which probes a renderer and is an instrument |
| `texture-convention.ts` | SPLIT | the delivered-pixel VERDICT — it measures the convention, it is not part of it |
| `leaf-tint.ts` | MOVE | — |
| `map-texels.ts` | MOVE | — |
| `parcel-cells.ts` | NEW (types split out of `prop-layout.ts`) | 1,100 lines of scatter/grove/meander machinery the shipped map has no use for |

⚠ **THE LEAF TINTS ARE RE-ASKED AGAINST THE SHIPPED TOKENS.** Before the crossing they were bound to
`harness/palette-band.ts`'s `STATUS_TOKENS` / `TREE_TOKENS` — a MIRROR of what `ForestWorldCanvas`
draws, not the thing itself. `src/leaf-tint.test.ts` now parses the canvas's own `GROUND_COLOUR` and
`CROWN_COLOUR` out of its source. They agree today (`#d8c069` for proposed/building, `#7d5f3b` for
mapped) and **that agreement is measured**, exactly as `SHADOW_RUNG`'s 0.77 was on the fourth
crossing.

⚠ **AND A WHOLE DIRECTORY HAD OPTED OUT OF THE COLOUR-CONVENTION SWEEP.**
`texture-convention.test.ts`'s own header says a page cannot opt out by not being on a list, because
there is no list to be off — and it read `harness/` only. The moment the loader crossed, **the one
loader whose output reaches a public map became the only loader nothing checked.** The sweep now
reads both directories and names `src/kit-mesh.ts` explicitly; removing the convention call from the
crossed loader was checked to make it fail.

---

## 6. WHAT THIS DOES NOT CLAIM

- **It is not the look, yet.** A component that crosses correctly has not thereby delivered the look
  (owner, 2026-08-30). The exposure gap in §3b is the measurable part of the distance to the approved
  picture; there may be more, and the picture is the thing to judge it on.
- **It is not mounted.** `<ForestWorldCanvas>` is still mounted in nothing but its own dev harness.
  Look first, mount second — mounting is not this arc's work.
- **The props' own frame cost on the shipped island is not measured here.** The kit's cost was
  measured on the harness island on 2026-08-29 (one island 0.031 ms at 2 px and 0.273 ms at 8 px, 10
  draw calls; thirty-five islands 0.602 ms and 299 draw calls, against the procedural arm's 1.355 ms
  and 756). The dressed arms on this page are outside the timed ladder for the palette reason in §1,
  so what is recorded here is the draw-call and mesh count, not a GPU-clock figure.
