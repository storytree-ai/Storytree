# Layer 2 — the shore sand: built, measured, and NOT adopted (2026-09-02)

Increment `layer-2-shore-sand-as-a-ground-field` on `land-ground-stack-arc`.

**The layer is transcribed, its carrier is built, and both are green — but it does not go on the
map.** Two blockers, both measured on this run. One is an owner fork; one is engineering.

> ⚠ Every figure here was taken on this run. Nothing is inherited from an increment row, an arc
> intent or an earlier evidence sheet.

---

## Blocker 1 — visible and honest do not overlap (the OWNER FORK)

Layer 2 enters through the seam ADR-0490 D5 fences it to, and rides layer 1's per-token gate, so
**no ungated token can move at all** — the yellow, red, slate and grey islands render exactly as
before, by construction. The question is entirely about the GREEN.

Measured over every colour layers 1+2 can deliver together (49,891 distinct colours — the sand
ramp, the grass ramps, and the whole band between them, walked at a resolution finer than one
channel unit):

| | strength |
| --- | --- |
| Sand **visible** (moves a pixel >20/255, ADR-0490 D6) | **≥ ~0.22** |
| Sand **honest** (every reachable colour still reads as its own token) | **≤ ~0.15** |

**They miss each other.** At the strength the beach can be seen, a *lit* sand pixel on a HEALTHY
island lands nearer the `building`/`proposed` yellow than its own green — a signed-off capability
reporting as in-progress work (ADR-0392 D5 / ADR-0398 D7).

Per-rung, at layer 1's shipped 0.32 with sand:

| ladder rung | margin | reads as |
| --- | --- | --- |
| 0.77 – 0.95 | +6.44 → +0.06 | healthy ✓ |
| **0.975** | **−3.08** | `building` yellow ✗ |
| **1.0** | **−5.07** | `building` yellow ✗ |

So the joint ceiling on `healthy` is **0.235**, where layer 1 alone admitted 0.4065. The binding
constraint is **how far the LADDER reaches**, not which token wears the layer.

⚠ **This is NOT the fork ADR-0492 dissolved, and the same move cannot be made twice.** That one was
a property of one TOKEN, and the per-token gate removed it. Layer 2 already inherits that gate.

### ⚠ And the model and the picture disagree — which is the whole reason this is a question

`grass-status-reading.ts` says these rim pixels sit nearer the yellow's reference swatch. **The
picture does not read that way**: in `authored-one-8.png` the island is unmistakably green with a
pale warm shore. Nothing about it says "proposed".

ADR-0489 D3 moved the fence from composition to OUTCOME — *can a viewer tell what state this island
is in?* — and D4 states outright that proxies of this shape have failed in both directions. But
D5 does **not** license removing a report from a surface that carries one, and the beach is such a
surface today. **That is the fork, and it is an owner call rather than an agent art call**, because
what is at stake is the map's reporting guarantee and not its look.

---

## Blocker 2 — the carrier costs 50 seconds to build (ENGINEERING)

`shoreField.sample()` is O(coast edges) per texel, and the packed atlas is 5.4 M texels — most of
them open sea.

| scene | shore field build |
| --- | --- |
| one island (153,062 texels) | **730 ms** |
| 35-island forest (5,380,800 texels) | **49.7 s** |

**This is not shippable and it is not what stops the layer being right** — the per-texel polygon
query is correct, and is what proved everything above. The remedy is a distance **transform** over
a rasterised island mask (two-pass chamfer or jump-flood): O(texels) instead of O(texels × edges),
and it belongs to whoever picks this up.

⚠ **It also shaped this run.** `shippedGroundBuild` returns the field as a **thunk**, not a value —
eager, it would have put 50 s into the shipped canvas's mount for a field nothing reads. And this
comparison is scoped to **one island**: four forest-scale sanded scenes is over three minutes of
field-building before a frame is drawn, and the first attempt duly hung.

---

## The arms

Three arms on one island, at both zooms. `flat` and `authored` **differ in exactly the sand** —
same mix factor, read from `SHIPPED_GRASS_MIX` — so any pixel between them is layer 2 and nothing
else. `honest` differs in the factor as well, and has to: being dimmer *is* its claim.

| arm | what it is |
| --- | --- |
| `flat` | the map as it SHIPS — layer 1 at 0.32, no sand (**CONTROL**) |
| `honest` | layers 1+2 at 0.235 — the joint ceiling. Reports correctly |
| `authored` | layers 1+2 at 0.32 — the beach is visible, and misreports at the two brightest rungs |

### one island @ 8 px/unit

| arm | families | largest | top 3 | moved >20/255 | touched | triangles |
| --- | --- | --- | --- | --- | --- | --- |
| `flat` | 20 | 21.0% | 42.4% | 0 | 0 | 5562 |
| `honest` | 21 | 18.9% | 46.4% | 18,516 | 540,225 | 5562 |
| `authored` | **22** | 18.9% | **37.8%** | **32,585** | 62,402 | 5562 |
| *approved render* | *36* | *5.2%* | — | — | — | — |

⚠ **Read `honest`'s 540,225 touched with care** — it differs from the control in *two* ways, and
most of what it moves is the grass coming down from 0.32 to 0.235, not the beach. `authored`
touches only **62,402 px** (11% of the island): that is the coast band, and it is the honest
measure of how partial this layer is.

Triangle count is identical across every arm — layer 2 is fragment-stage and its correct geometry
delta is zero.

---

## What LANDED anyway, and why it is not shelfware

Everything below the adoption is committed, green, and is what any answer to the fork will be
built from:

- **`src/shore-atlas.ts`** — the distance-to-coast field as a ground-space texture (ADR-0490 D4's
  mandated carrier). It rides the occlusion atlas's **own tiles**, so the two cannot disagree about
  where an island sits. ⚠ **Layer 3 (the worn path) needs this same carrier**, so it is not layer
  2's alone.
- **`src/land-sand.ts`** — the transcription: the edge noise, the band ramp, the sand ramp, and the
  GLSL generated from those constants. Anchored on `mat_attribute()` against the decoy.
- **The material's sand seam** — with both refusals (no grass → throw; no packed atlas → throw).
- **`harness/grass-status-reading.ts`'s sand arm** — `sandReachableColours()` and a `reachSet`
  parameter. **This is what produced the finding**, and it is why "layers 2–4 are partial so they
  carry no truth cost" could be tested rather than assumed.

⚠ **The layer is switched off, and that is a BLOCKED adoption rather than a forgotten flag.** This
arc rightly calls a flag nobody flips "not adoption". What stops layer 2 is a measurement and an
unanswered question, both recorded here and on the arc.

## Two traps this run walked into, fixed and worth carrying

- **A shared arm vocabulary broke a sibling page.** `shipped-grass-scene.ts`'s `flat` used to mean
  "no grass" and now means "the map as it ships" — because layer 1 landed. `land-floor-scene.ts`
  borrowed it as its frame-cost CONTROL, which silently made that control a *grassed* shader: it
  would have priced layer 1 against itself and reported ~0 ms, green. Fixed by giving the floor an
  explicitly bare control.
- **A slow page reads exactly like a broken one.** The page published `window.grassRunner` *after*
  `warm()`, so while it built minutes of sanded forest scenes the driver's `waitForFunction` timed
  out against a page that was working perfectly. The handle is now published first.

## Reproducing

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5421 --strictPort
```

```bash
ST_GRASS_URL=http://localhost:5421/shipped-grass.html pnpm --filter @storytree/forest-world-r3f measure-shipped-grass
```

⚠ Not on port 5316 or 5184 — sibling worktrees hold both.

## Files

- `report.txt`, `measurements.json` — the census, verbatim
- 6 frames: `{flat,honest,authored}-one-{8,fit}.png`
