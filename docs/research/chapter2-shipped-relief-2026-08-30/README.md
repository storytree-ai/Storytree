# The shipped map's ground stands on the land's relief — the first component across

**Increment:** `put-the-treatment-on-the-shipped-map` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-30. **Measured on:**
`ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`, read out of the live
context; GPU clock via `EXT_disjoint_timer_query_webgl2`.

**This is the first thing this arc has ever put in `packages/forest-world-r3f/src`.** The owner
authorised adoption on 2026-08-29 looking at `../chapter2-vocabulary-2026-08-29/` — *"This looks
better, stamp it, i'm still hoping for future iterations to improve the ground texture and add
shadows"* — which settles ADR-0406 D2 / ADR-0380 D6's separate-and-deliberate event in the
affirmative. `harness/scope-fence.test.ts` said in as many words that it is where that record
lives; it now carries an `ADOPTED` ledger beside its fence.

Reproduce (⚠ the frame figures need a discrete GPU — headless Chromium on the Windows box comes up
on SwiftShader and the driver refuses it by name):

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5238 --strictPort
DISPLAY=:0 ST_LAND_URL=http://localhost:5238/shipped-land.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-land
```

Raw: [`shipped-relief.json`](shipped-relief.json).

---

## 1. THE PICTURES

Two arms on the island the studio actually ships — 164 parcels — differing in **exactly one thing**:
which relief field `src/cell-ground-geometry.ts` is handed.

| picture | what it is |
|---|---|
| `shipped-flat-{2,8}px.png` | the identity field — **the shipped map as it drew on 2026-08-29**, byte for byte |
| `shipped-relief-{2,8}px.png` | `landRelief` — **what `<ForestWorldCanvas>` now passes, unconditionally** |

`2 px` per ground unit is roughly the overview a laptop opens on; `8 px` is the zoomed-in read.

⚠ **THE 8 px PAIR IS THE ONE TO LOOK AT.** At the overview the two are nearly the same picture, and
that is the honest report rather than a defect: a ±4-unit swell on a 234-unit island is two delivered
pixels of displacement up there. What changes at 8 px is the **silhouette** — the island's edge stops
being a ruled line and starts rolling — and, more quietly, the **surface**, which now carries broad
soft light and shade zones where it was one flat green.

⚠ **AND WHAT IS *NOT* IN THESE PICTURES IS WORTH SAYING PLAINLY.** The shipped canvas wears
`MeshStandardMaterial`, so relief arrives as a SMOOTH lambert gradient. The harness's own land puts
the same normals through a four-rung banded ladder, which is what turns the gradient into the
legible zones the approved research renders show. **Relief is a precondition for that, not a
substitute for it** — a banded ladder over a flat plane has exactly one rung to quantise onto.
Crossing `banded-material.ts` is the next component, and it is what the owner's *"improve the ground
texture"* mostly names.

---

## 2. WHAT IT COST — nothing measurable, and the reason is structural

| arm | zoom | median ms | % of a 60 Hz frame | draw calls | triangles |
|---|---:|---:|---:|---:|---:|
| flat | 2 px | 0.0038 | 0.02% | 1 | 1,640 |
| **relief** | 2 px | **0.0039** | 0.02% | **1** | **1,640** |
| flat | 8 px | 0.0448 | 0.27% | 1 | 1,640 |
| **relief** | 8 px | **0.0448** | 0.27% | **1** | **1,640** |

7 interleaved repeats, 300 renders per timed batch, GPU clock rather than submission time. Spread
0.0000–0.0001 ms.

**The cost is zero because the relief adds no geometry at all.** It moves vertices the ground buffer
already emitted and hands the top face a normal it was already writing. No triangle, no draw call,
no attribute channel — which is a structural claim rather than a measured one, and
`cell-ground-geometry.test.ts` pins it as a test rather than leaving it as an argument.

For scale against the rest of the arc: the dressed 35-island forest costs 0.602 ms at 299 draw
calls, and `hardware-floor.mjs` measured this renderer **draw-call bound**. A component that adds
neither is not a candidate for the budget conversation.

---

## 3. DID IT REACH A PIXEL? — the question four pictures cannot answer

Relief authors **no colour**. All it can do is spread each status token across more of the range
between its lit and unlit ends, so the direct measure is **distinct delivered colours**.

| zoom | flat | relief | frame changed |
|---|---:|---:|---:|
| 2 px | **4** | **36** | 55.4% |
| 8 px | **6** | **38** | 55.3% |

The driver **REFUSES** a run in which the relieved arm delivers no more colours than the flat one.
That failure is real and would otherwise ship silently: the y-span control already proves the field
reached the BUFFER (3.00 units flat, 10.95 relieved — the 3-unit slab plus the field's own 7.95-unit
range across this island), and until this check nothing proved it reached a PIXEL.

The changed-fraction is its control, because a colour count alone is satisfied by an arm that changed
colour everywhere and shape nowhere. Both frames are identical in size by construction — fitted to
the same bounds — which is what makes an index-for-index comparison mean anything; an earlier
instrument on this arc compared two differently-sized frames and reported 100% of pixels differing in
every arm, whatever it drew.

⚠ **THE FIXTURE ISLAND IS ALL ONE STATUS**, which is why the flat arm delivers only 4–6 colours. A
mixed island would start higher in both arms. The RATIO is not the finding; the finding is that a
flat token became a gradient.

---

## 4. WHAT MADE IT CHEAP — a measurement, not a coincidence

The relief field's wavelengths (62 / 41 / 27 ground units) were authored against the **harness**
fixture's 16.5-unit mean cell, with the rule that nothing may go below the cell pitch or it lands
back on the per-cell pattern the owner rejected on 2026-08-16.

The relaxed-mesh island the studio ships measures **16.57 units mean parcel diameter** over its 164
parcels. So the field crossed at its authored scale and needed no re-tuning.

And **185 of its 191 distinct ring vertices belong to more than one parcel** — the substrate interns
them. Sampling a CONTINUOUS function at those coordinates makes the displaced ground watertight
across every interior seam for free, which is the property a per-parcel offset would destroy by
tearing open exactly the seams the owner had removed.

---

## 5. WHAT THE INSTRUMENTS REFUSE

| what | result |
|---|---|
| a software rasteriser, or no GPU timer query | REFUSES, naming the renderer and the Mint box |
| port 5184, the default every worktree pins | REFUSES before launching a browser |
| a console error, or any HTTP >= 400 | REFUSES |
| the two arms differing in triangles, parcels, draw calls or frame size | REFUSES — they must differ in the relief field and nothing else |
| a flat arm whose buffer is not flat, or a relieved arm whose buffer is | REFUSES, both directions |
| the relieved arm delivering no more colours than the flat one | REFUSES — the field is in the geometry but not in the picture |
| a top face that could ever face downward | REFUSES, without a GPU (`cell-ground-geometry.test.ts`) |
| the shipped canvas putting the relief behind a flag | REFUSES (`shipped-baseline.test.ts`) — end-state item 6 |
| the transcribed light drifting from `ForestWorldCanvas.tsx` | REFUSES — relief IS `dot(n, L)`, so a wrong light is a wrong picture |

---

## 6. TWO THINGS THIS PAID FOR, RECORDED RATHER THAN GUESSED

### 6a. The underside had to follow the relief, and the alternative is a returning bug

The field reaches ±4.22 units at the authored amplitude and the parcel prism is 3 units deep. A
bottom face pinned at `-depth` would therefore sit **above** the top face wherever the land dips —
every wall there inside out, and the parcel gone from above under backface culling. That is exactly
the defect the `cell-ground` substrate was added to fix, arriving again through the treatment meant
to improve it. The slab keeps a constant thickness instead, which also keeps the two ground
substrates telling the same story: the classic hex prism is `TILE_HEIGHT` thick and so is this,
everywhere.

### 6b. A stale `Stryker disable … EQUIVALENT` had to go with it

`pushTriangle` carried an annotation arguing that `c.y - a.y` and `c.y + a.y` were equivalent,
because every face reaching it was either a top face at y = 0 or a wall whose two corners shared a
height. Relief falsifies both halves — tops leave that function entirely now, and a wall's corners
stand at whatever heights the field gives them. **A stale equivalence claim is worse than no claim:**
it suppresses a mutant that a test can, and now does, kill.

---

## 7. WHAT THIS DOES NOT DO

- **It is not the whole treatment.** Six components were named; this is one. The banded material and
  its grain octave, the coast clipping, the stepped skirt and the attribute-driven material are all
  still `harness/`-only, and `scope-fence.test.ts` still fences them.
- **It does not touch the props.** The kit dressing the owner approved on 2026-08-29 is still on the
  experiment surface. It is the next-largest crossing and it is a bigger one — the shipped canvas has
  no glTF loading at all.
- **It does not touch the framing.** The comparison page fits the island's own bounds rather than
  using `frameWorld`'s whole-world rule, deliberately: whether that rule wastes about a third of the
  screen is `does-the-shipped-framing-waste-a-third-of-the-screen`, ACTIVE on this arc, and a
  comparison page is not the place to settle it by accident.
- **It moves no meaning** (ADR-0392 D5 / ADR-0398 D7). The field is a function of POSITION ONLY, so
  a parcel's status colour is byte-identical with and without it — asserted as a test, not as prose.
  `unknown` still grows nothing; `check:land-art` can still fail a build for the art being wrong.
- ⚠ **These PNGs are one renderer's pictures.** Do not build a pixel-baseline regression check over
  them (`grain-picture-is-renderer-specific`).
