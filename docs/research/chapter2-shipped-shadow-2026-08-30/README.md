# The shipped map's ground wears shadows — and the map has one object to cast them

**Increment:** `cross-the-shadow-work-into-the-shipped-renderer` on
`adopt-the-land-into-the-shipped-map-arc`. **Date:** 2026-08-30. **Measured on:**
`ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`, read out of the live
context; GPU clock via `EXT_disjoint_timer_query_webgl2`.

**The fourth component across, and the one the owner asked for by name** — *"i'm still hoping for
future iterations to improve the ground texture and add shadows"* (2026-08-29). The three before it
landed the same week: [relief](../chapter2-shipped-relief-2026-08-30/README.md) put the land's
shape in the buffer, [the shade ladder](../chapter2-shipped-banded-2026-08-30/README.md) quantised
it onto four authored zones, and [the grain octave](../chapter2-shipped-grain-2026-08-30/README.md)
gave those zones a surface.

**This one is different in kind, and the difference is the finding.** The three before it were
treatments of the GROUND. A shadow is a relationship between the ground and the things standing on
it — so the first thing it measures is how much is standing there. The answer is **one object**.

Reproduce (⚠ the frame figures need a discrete GPU):

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5273 --strictPort
DISPLAY=:0 ST_LAND_URL=http://localhost:5273/shipped-land.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-land
```

Raw: [`shipped-grain.json`](shipped-grain.json) — the driver's own filename, unchanged since the
grain landing so the two directories' raw files are read the same way.

---

## 1. THE FINDING: the shipped map draws ONE of the 1,089 things standing on its ground

Measured with a census over `worldTo3D(islandScene())`, pinned in `shipped-land-scene.test.ts`:

| what the semantic scene emits, standing on the land | count | drawn by the shipped mapper |
|---|---:|---:|
| grass blades (`parcel-blade`) | 693 | 0 |
| flora (`parcel-flora`) | 144 | 0 |
| shrubs (`parcel-shrub`) | 112 | 0 |
| tall-flower parts (six kinds) | 136 | 0 |
| stems (`parcel-stem`) | 3 | 0 |
| **story tree** | **1** | **1** |

The 1,088 skips are explicit `{ kind: 'skipped' }` audit records, not an accident — `world-to-3d.ts`
has no case for the vegetation families. So the shadow this map can draw is bounded by its own
emptiness rather than by the field.

⚠⚠ **THAT INVERTS THE INCREMENT'S OWN INSTRUCTION, AND THE INVERSION IS MEASURED.** The increment
said to lead with CONTACT DARKENING, because the reference board
(`chapter2-reference-board-2026-08-20/`) ranked it **first of ten** mechanisms separating the
owner's references from our island — *"it is doing most of the work of making things look placed
rather than pasted"*. That ranking was taken on the EXPERIMENT island, which stands **155 props**,
where 155 tight pools genuinely are most of the effect. Here:

| | ground units |
|---|---:|
| the crown's contact pool, derived reach | **9.74** |
| the crown itself | 7.0 |
| the trunk's own pool | 2.25 |
| the CAST shadow's reach from the foot | **13.21** |

The contact pool is a ring **2.7 units wide** around a crown that hides most of it; the cast shadow
leans clear of the canopy and is the visible term. Both ship — they merge into one texture and one
rung, so dropping either buys nothing — but the ranking that put contact first is a fact about a
populated island, and it becomes true here when the props do.

**The terrain term did not cross at all, and that is also a measurement.** A height field
self-shadows only where it is steeper than the light. The authored light climbs **1.438** units per
ground unit; the shipped relief's steepest slope at its amplitude of 2.2 is **0.455**. The term is
identically zero — not small, zero — so `src/land-shadow.ts` carries the canopy stamp only, and
`assertTerrainDoesNotSelfShadow` throws if the amplitude ever rises past the light. The march stays
in `harness/land-shadow.ts`, where the experiment's own amplitudes still exercise it.

---

## 2. THE PICTURES — six arms now, and a fork rather than a chain

| picture | what it adds | to what |
|---|---|---|
| `shipped-flat-{2,8}px.png` | — the shipped map **on 2026-08-29** | — |
| `shipped-relief-{2,8}px.png` | + the land's relief field (PR #1725) | flat |
| `shipped-banded-{2,8}px.png` | + the authored shade ladder (PR #1726) | relief |
| `shipped-grain-normal-{2,8}px.png` | + the grain octave's NORMAL half (PR #1731) | banded |
| `shipped-shadow-{2,8}px.png` | **+ the occlusion field** — ⭐ what ships now | grain-normal |
| `shipped-grain-both-{2,8}px.png` | + the grain's COLOUR half — ⚠ REFERENCE ONLY | grain-normal |

⚠ **THE LADDER STOPPED BEING A CHAIN, AND THE INSTRUMENT HAD TO SAY SO.** Two arms now hang off
`grain-normal` — the shadow (a candidate) and the grain's colour half (a reference) — and neither
extends the other. `LAND_STEPS` used to be `LAND_ARMS.slice(1)`, which would have published
`grain-both → shadow` as a one-thing comparison of two things. Every arm now **names its own
predecessor** (`LAND_ARM_SPECS`), and the steps are derived from that, so a fork cannot leave the
pair list quietly describing a chain that no longer exists.

**And two pictures with the tree in them, which are the ones to actually look at:**
`shipped-grain-normal-treed-8px.png` beside `shipped-shadow-treed-8px.png`. Without the field the
tree is PASTED onto the ground; with it, it is PLANTED in it. That is the whole of what contact
darkening was ranked first for, delivered by a single object.

⚠ Those two are drawn by `snapshotTreed` and are measured by **nothing** above. Every arm in the
ladder is ground-only, because the palette closure is asked of delivered pixels and a
`MeshStandardMaterial` crown puts thousands of them in the frame that are off the ground palette by
construction. A shadow with nothing casting it is not a picture anyone can judge, so the owner's
pair is taken separately and labelled as such.

**What the field covers:** 1 caster, **3.11%** of the padded ground rect past the material's own
0.5 threshold — and **1.9% of the delivered frame changes** between `grain-normal` and `shadow`, at
BOTH zooms. The two figures differ because part of the shadow falls off the coast.

---

## 3. THE RUNG IS DERIVED, AND ON THIS PALETTE IT IS 0.77

A shadow is a LUMINANCE operation and the land's status colours are ordered along luminance, so
darkening a parcel walks it toward another status's colour. Past some depth a reader takes a
`proposed` capability for a `healthy` one — doubt painted as proof, the one direction this surface
may not be wrong in (ADR-0392 D5 / ADR-0398 D7, ADR-0367 D5).

`src/shadow-rung.ts` sweeps the ladder downward asking whether every authored ground token still
reads as ITSELF under the house reader model, and hands back the deepest level at which they all
do. **It is re-asked against the SHIPPED tokens rather than inherited from the experiment's** —
`harness/shadow-ladder.ts`'s answer is derived over `palette-band.ts`'s vocabulary, which is not
`ForestWorldCanvas`'s.

| | |
|---|---|
| deepest admissible rung, shipped tokens | **0.77** |
| flat ground's own rung | 0.90 |
| so a shadowed parcel is | **14.4% darker** than a lit one |
| what breaks at 0.76 | `proposed`/`building` **`#d8c069` reads as `healthy` `#8cb85e`** |
| headroom at the ladder's existing floor (0.78) | **3.00** weighted channel units |

The two palettes happen to agree at 0.77, and that agreement is **measured rather than assumed** —
`shadow-rung.test.ts` pins the shipped answer, and it is a derived number that will move if either
palette does. `shadowLadderFor` **throws** on a palette with no admissible rung: a shadow that
cannot ship honestly has to fail loudly, because the failure is the finding.

⚠ **THE DEDUPE IS LOAD-BEARING.** ADR-0462 put `proposed` and `building` on the same hex, so a
reader table keyed by STATUS holds that colour twice and one of the pair always wins the tie —
asked that way the shipped palette condemns itself at every rung. The material knows only tokens,
so tokens are what it is asked about.

⚠ **AND THE REFERENCE RUNG IS 0.90, NOT FULL LIGHT.** Build the references at `token x 1.0` and the
instrument reports the ORDINARY SHIPPED GROUND as already misreporting on four rungs — a false
alarm shaped exactly like a live defect. `shadow-ladder.ts`'s `FLAT_GROUND_LEVEL` exists for this
and now lives in `src/shadow-rung.ts` so there is one of it.

**The closure holds, and it GROWS by exactly one entry per row.** A shadowed row is `token x
{0.77, 0.78, 0.80, 0.90, 1.00}` — five authored `(token x level)` products where there were four:

| zoom | arm | distinct land colours | authored entries | off-palette px |
|---|---|---:|---:|---:|
| 2 px | grain-normal | 4 | 20 | **0** |
| 2 px | **shadow** | **5** | **25** | **0** |
| 8 px | grain-normal | 4 | 20 | **0** |
| 8 px | **shadow** | **5** | **25** | **0** |

The shadow costs palette ENTRIES; it does not cost the closure. The fragment stage still SELECTS a
`uRamp` element and never computes a colour, so "every delivered land pixel is an authored entry"
stays a property of the source rather than of the pixels that happened to be photographed.

---

## 4. WHAT IT COST — 0.0019 ms, which is 2.1% on top of the grain

| arm | zoom | median ms | % of a 60 Hz frame | draw calls | triangles |
|---|---:|---:|---:|---:|---:|
| flat | 2 px | 0.0038 | 0.02% | 1 | 1,640 |
| relief | 2 px | 0.0040 | 0.02% | 1 | 1,640 |
| banded | 2 px | 0.0023 | 0.01% | 1 | 1,640 |
| grain-normal | 2 px | 0.0079 | 0.05% | 1 | 1,640 |
| **shadow** | 2 px | **0.0081** | **0.05%** | 1 | 1,640 |
| grain-both | 2 px | 0.0093 | 0.06% | 1 | 1,640 |
| flat | 8 px | 0.0451 | 0.27% | 1 | 1,640 |
| relief | 8 px | 0.0450 | 0.27% | 1 | 1,640 |
| banded | 8 px | 0.0220 | 0.13% | 1 | 1,640 |
| grain-normal | 8 px | 0.0914 | 0.55% | 1 | 1,640 |
| **shadow** | 8 px | **0.0934** | **0.56%** | 1 | 1,640 |
| grain-both | 8 px | 0.1085 | 0.65% | 1 | 1,640 |

7 interleaved repeats, 300 renders per timed batch, GPU clock rather than submission time.

**The shipped ground is now 2.07x the `MeshStandardMaterial` it replaced** (0.0934 against 0.0451 at
8 px/unit) and **0.56% of a 60 Hz frame**. The occlusion field's own share of that is 0.0019 ms —
**0.011% of a frame** — for a texture fetch and a compare chain. It adds no triangle, no draw call
and no attribute channel; what it adds is 107 KB of texture for this island's ground rect.

⚠ **THE SPREAD IS NOT WHAT THE GRAIN LANDING PUBLISHED, and the difference is the RUN rather than
any arm.** That table reported 0.0000–0.0001 ms; this one carries 0.0003–0.0011 at 2 px and
0.0545–0.1108 at 8 px. The samples say why: **five of seven repeats per arm are identical to
0.0001 ms**, and the last two are 1.1x and 2.2x — a disturbance that landed on the tail of the
interleaved sweep and therefore on every arm alike, which is exactly what interleaving is for. The
MEDIANS are unaffected, and the `shadow > grain-normal` ordering holds in all five clean repeats of
both arms rather than resting on the medians alone.

✅ **THE CONTROL: the four earlier arms reproduce their published medians.** flat / relief / banded /
grain-normal came back at 0.0038 / 0.0040 / 0.0023 / 0.0079 at the overview against a published
0.0038 / 0.0039 / 0.0023 / 0.0078, and 0.0451 / 0.0450 / 0.0220 / 0.0914 at the zoomed read against
0.0448 / 0.0448 / 0.0218 / 0.0909 — worst deviation **0.0007 ms**, two orders inside the run's own
spread, on a page that has since grown an arm and changed how its steps are derived. That agreement
is what licenses reading the new row against the old table at all.

⚠ **ONE RUN WAS DISCARDED AND IT IS NAMED HERE RATHER THAN DROPPED.** The first Mint run came back
~12% high on **every** arm with a 3.13 ms spread on one row — its own instrument reporting a
disturbed run, on a box whose GPU idles at 300 MHz. It is not discarded for disagreeing with a
preferred conclusion: its `shadow / grain-normal` ratio was **1.009**, against 1.021 here, so the
finding is the same in both and only the absolute figures moved.

---

## 5. WHAT THIS DOES NOT DO

- **It does not populate the map.** One object casts one shadow. The 1,088 skipped vegetation nodes
  are the reason this component delivers less here than on the experiment island, and closing that
  gap is the props' work, not the field's.
- **It does not settle the overview.** The shadow IS visible at 2 px — a distinct dark ellipse — but
  what makes an island read as a *place* up there is still unnamed.
- **It does not model a penumbra.** One shadow rung means the decision is binary. Intermediate rungs
  cost palette entries and walk a status toward its neighbour, and this palette's tightest margin is
  3.0 units already.
- **It does not cast onto anything but the ground.** The tree does not shade itself, and nothing
  shades the tree; the field is a ground-space texture the ground samples.
- **It does not re-measure the hardware floor.** The 35-island crowd figure predates the grain and
  now predates this too. ⚠ And the field is allocated over the ground's BOUNDS: one island costs
  107 KB, a thousand-unit forest would cost 36 MB, so `SHADOW_TEXTURE_MAX` coarsens the resolution
  rather than allocating it. That fence is untested against a real crowd.
- **It is not in `check:land-art`.** That rung drives `capture.mjs` over the harness pages. The
  closure is held by the source-level tests in `pnpm -r test` and by this driver's own
  delivered-pixel refusal.
- ⚠ **The grained PNGs are one renderer's mottle** (`grain-picture-is-renderer-specific`). Do not
  build a pixel baseline over them.
