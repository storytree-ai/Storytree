# Thirty-five islands together — the crowd caveat, answered

**Increment:** `does-the-dressed-island-hold-up-as-a-forest` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-28. **Measured on:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2,
OpenGL 4.5.0)`, read out of the live context, GPU clock via `EXT_disjoint_timer_query_webgl2`.

Reproduce:

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5214
DISPLAY=:0 ST_CROWD_URL=http://localhost:5214/crowd.html ST_CROWD_BATCH=700 ST_CROWD_REPEATS=15 \
  pnpm --filter @storytree/forest-world-r3f measure-crowd
```

Raw report: [`crowd.json`](crowd.json). The real map's own measured density:
`pnpm --filter @storytree/forest-world-r3f measure-real-map`.

---

## THE ANSWER

**The caveat is discharged. It also turns out to have been pointed at the wrong dressing.**

PR #1693 dressed one island from the bought kit, recommended going ahead, and attached this to its
own recommendation:

> *"nobody has seen a CROWD of these islands together, and that's exactly the kind of thing that
> looks fine on one and turns to soup on four hundred."*

Thirty-five of them — the real forest's own count — do not turn to soup. They deliver **35 distinct
island silhouettes out of 35**, at every zoom, in every arm. The real map is 97.5% background, so
the crowd is sparse by construction and the islands never touch. On the fence that actually matters
— *can a reader still pick a failing island out of a healthy forest* — the answer is **yes, and the
bought dressing is nearly twice as good at it as the dressing that ships today**: the failing island
stands **41.2 dE** clear of the worst healthy island when dressed from the kit, against **21.4 dE**
dressed as it is today. And it is **cheaper**: 5.2% of a 60 Hz frame against today's 10.3%, with 373
draw calls against 770.

**The one real cost is not soup, it is DISAPPEARANCE.** At the whole-forest view every prop is
**below the object floor** — a pine is 3.7 device pixels. The props are not noise; they are gone,
and what is left is the land's own colour, which is exactly what the map needs to be reading at that
zoom. The dressing pays for itself the moment a reader zooms in, and costs almost nothing when they
have not.

---

## 1. THE PICTURES — 35 islands, four arms, three zooms

| picture | what it is |
|---|---|
| `crowd-bare-{forest,neighbourhood,island}.png` | the forest with nothing standing on it — the control |
| `crowd-today-*.png` | every island dressed as it is dressed **today**: the `wild` composition, its canopy lathes, plants and flower markers |
| `crowd-kit-*.png` | the same 35 islands, the same ground, dressed from `dressing-kit.glb` |
| `crowd-kit-merged-*.png` | the same props and the same pixels, merged across the whole forest instead of per island — the draw-call remedy |

Same layout, same camera, same light, same run, one variable: **the prop vocabulary**.

**Look at `crowd-today-forest.png` beside `crowd-kit-forest.png`.** Today's dressing speckles every
island — the healthy ones included — with rust-brown flecks, because that is what the procedural
canopy lathe can express. The green islands read muddier and browner than they are. The kit's arm
leaves the status colour clean. That difference is visible before any number is quoted, and it is
what the 21.4-against-41.2 measurement below is measuring.

---

## 2. THE ZOOM A VISITOR ACTUALLY GETS — and it is not the one this arc has been measuring at

⚠ **EVERY LAND PICTURE ON THIS ARC IS TAKEN AT 2 OR 8 DEVICE PIXELS PER GROUND UNIT, AND 2 IS
CALLED "THE OVERVIEW — THE SIZE THE MAP IS ACTUALLY DELIVERED AT". That is the overview of ONE
ISLAND, rendered alone.** A visitor looking at a forest of 35 is further back:

| view | device px per ground unit | one pine delivers | vs the one-island "overview" |
|---|---:|---:|---|
| the whole forest, **fitted to the screen with nothing wasted** | **0.32** | **3.7 px** | 6.3x coarser |
| the whole forest, through the **shipped canvas's own framing rule** | **0.16** | **1.9 px** | 12.2x coarser |
| a neighbourhood — a 3x3 block of the layout | 0.76 | 8.8 px | 2.6x coarser |
| one island — the arc's own standard | 2.00 | 23.1 px | — |

Both whole-forest figures are on a 2560x1600 device-pixel viewport (a 1280x800 CSS window at
device-pixel-ratio 2 — an ordinary laptop).

**The pictures use the generous 0.32, deliberately.** The shipped rule's 0.16 is coarser because
`frameWorld` takes its spread off raw ground `z`, which the 50° camera then foreshortens by
sin(50°) — so it frames about 30% more world than it needs vertically and leaves the forest inside
a large empty margin. Photographing the crowd through that would be scoring the art down for a
framing bug. **If the dressing fails at 0.32 it fails everywhere**, so the crowd gets its best shot
and the shipped rule's own worse figure is reported here rather than quietly substituted.

⚠ **Both are PROJECTIONS, not observations, and the reason is worth stating.** No 35-island 3D
forest exists anywhere today: `<ForestWorldCanvas>` is mounted only in this package's own dev
harness, and the public forest page is a flat DAG diagram built in the `web` submodule from a
snapshot carrying no tile geometry at all. So these say what the shipped framing rule *would*
deliver for a forest of this extent — which is the honest form of the question. An observed figure
is not available to be had.

The rule itself is **imported, not transcribed** (`frameWorld` / `orthographicZoomFor` from
`src/camera-framing.ts`). `back = max(260, spread * 2.6)` appears nowhere in the harness. A camera
check that computed its expectation from a hand-copied duplicate of its own subject is one of the
three instruments-that-could-not-fail this factory caught in two days; this one moves if the shipped
rule moves.

---

## 3. Q1 — DOES IT READ, OR DOES IT TURN TO SOUP?

### 3a. The islands stay separate — 35 out of 35

Connected components of opaque pixels in the delivered frame. This is the direct form of "turns to
soup": 35 islands that deliver 35 blobs are 35 islands; a crowd that delivered four has merged into
a mass.

| zoom | islands in frame | blobs delivered | bare / today / kit / kit-merged |
|---|---:|---:|---|
| forest | 35 | **35** | 35 / 35 / 35 / 35 |
| neighbourhood | 8 | **8** | 8 / 8 / 8 / 8 |
| island | 4 | **4** | 4 / 4 / 4 / 4 |

No arm merges anything. **The crowd is sparse because the real map is sparse** — land is 2.85% of
the forest's own bounding box, measured off the committed `forest-map.png` rather than assumed, and
the synthetic layout is calibrated to reproduce exactly that. A crowd packed shoulder-to-shoulder
would have answered a much harsher question than the product poses, and would have answered it in
the direction that manufactures the very soup the caveat feared.

### 3b. But the props are GONE at the whole-forest view

`kit-vocabulary.ts`'s own ~10 device-pixel object floor, re-asked at the crowd's scale. Below it a
mark has stopped being an object.

| role | forest (0.32) | neighbourhood (0.76) | island (2.00) |
|---|---:|---:|---:|
| tree | **3.7 — below** | **8.8 — below** | 23.1 — object |
| deadTree | **3.1 — below** | **7.3 — below** | 19.3 — object |
| log | **2.9 — below** | **6.8 — below** | 18.0 — object |
| rock | **2.2 — below** | **5.3 — below** | 14.0 — object |
| undergrowth | **1.9 — below** | **4.6 — below** | 12.0 — object |
| bloom | **1.3 — below** | **3.0 — below** | **8.0 — below** |

The island column reproduces PR #1693's committed one-island figures **exactly** (tree 23, bloom 8
below the floor) — which is a check on this instrument, not a coincidence: the same rule at the same
zoom must give the same answer, and it does.

**Read the "below" rows correctly.** They do not say the crowd looks bad. Looking at
`crowd-kit-forest.png`, the dressing at the whole-forest view survives as a faint mottling of the
land's own colour — the islands read as *textured* rather than *flat*, and no individual conifer is
discernible. That is the correct outcome for a map whose job at that zoom is to report status. At
the neighbourhood zoom the pines are visible as upright dark marks even at 9.2 px, just under the
floor; by the island zoom they are unambiguous conifers.

---

## 4. Q2 — DOES THE MAP STILL TELL THE TRUTH AT CROWD SCALE?

**This is the fence that matters most** (ADR-0392 D5 / ADR-0398 D7, as amended by ADR-0461): a
treatment that reads beautifully and misreports proof state is a REGRESSION, and it is the one way
this arc can do real harm.

The reading: each island's **mean delivered colour over every opaque pixel, props included** — the
signal a reader actually receives, not a carefully-isolated ground colour no one sees. The failing
island must be more anomalous, against the healthy population's own median, than **every healthy
island in the same picture**. The bar is that population's own spread, read off the same run.

| arm | zoom | verdict | needle's margin over the worst healthy island | in sigma |
|---|---|---|---:|---:|
| bare | forest | FOUND | 43.89 dE | 658 |
| **kit** | forest | **FOUND** | **41.20 dE** | 178 |
| kit-merged | forest | FOUND | 41.20 dE | 178 |
| **today** | forest | **FOUND** | **21.40 dE** | 306 |
| bare | neighbourhood | FOUND | 43.89 dE | 319 |
| **kit** | neighbourhood | **FOUND** | **39.28 dE** | 120 |
| kit-merged | neighbourhood | FOUND | 39.28 dE | 121 |
| **today** | neighbourhood | **FOUND** | **20.93 dE** | 46 |

**THE HEADLINE: the bought dressing costs 6% of the land's own signal; today's costs 51%.** Bare
land carries 43.89 dE of separation. The kit keeps 41.20 of it. Today's dressing keeps 21.40 — it
throws away more than half the margin, because its rust-brown canopy speckle contaminates the status
colour of every island it stands on, healthy ones included. **On the one fence this arc says it can
do real harm through, the bought kit is a large improvement on what ships today, not a risk to be
managed.**

⚠ **`FOUND` does not mean "the most eye-catching thing in the frame", and the report says which
islands outrank it.** At the whole-forest view the failing island ranks 4th of 35 by raw anomaly,
behind two `mapped` islands and one `unknown`. Those are legitimately different states wearing
legitimately different colours, so a reader scanning for "what looks odd" may land on one first and
then has to tell a different STATE from a failing one. That is a property of the six-colour
vocabulary, not of the dressing — it is identical in the bare arm — but it is recorded rather than
folded away. At the neighbourhood zoom the failing island ranks **1st of 8** in every arm.

**At the island zoom the reading refuses, and that is correct.** At 2 px/unit only four islands are
in frame and just one of them is healthy — a bar cannot be read off a population that small, so
every arm returns `UNVERIFIED`, never a pass or a fail. The neighbourhood zoom exists precisely
because this was measured: the question needs a frame with both a failing island and a healthy
population in it.

### The population, and the one thing in it that is a plant

The real forest holds exactly **two** states today: 21 stories folded to `healthy` by a signed
verdict and 14 sitting at their authored `proposed`. **There is no failing island on the public map
to pick out.** So the majority is kept real — 21 healthy, the live count — and the remaining 14 are
spread across the other five states including exactly **one `unhealthy`**. That island is the
needle, and it is a plant. Saying so is the point: an increment that quietly seeded a failing island
and then reported it was findable would be reporting on a forest the product does not have.

The statuses are **scattered** over the layout, not laid down in order. That was a measured
correction, not a preference: filling the grid in population order put every non-healthy island in
one corner, which handed the whole-forest view an easier question than the product poses and left
the failing island with five neighbours of which **not one was healthy** — so the neighbourhood
reading had no population to read a bar off and correctly returned `UNVERIFIED`.

---

## 5. Q3 — WHAT IT COSTS AT CROWD SCALE

GPU clock, 2560x1600, batch of 700, median of 15 interleaved repeats, disjoint samples discarded
rather than averaged in. Every row RESOLVED against the bare control; every zoom PASS.

| arm | zoom | ms | spread | % of a 60 Hz frame | draw calls | triangles | vs bare |
|---|---|---:|---:|---:|---:|---:|---|
| bare | forest | 0.553 | 0.053 | 3.32% | 210 | 42,840 | — |
| **kit** | forest | **0.858** | 0.105 | **5.15%** | **373** | 2,179,684 | +0.305 ms (1.6x) |
| kit-merged | forest | 0.832 | 0.001 | 4.99% | 216 | 2,179,684 | +0.278 ms (1.5x) |
| **today** | forest | **1.709** | 0.599 | **10.25%** | **770** | 3,112,737 | +1.155 ms (3.1x) |
| bare | neighbourhood | 0.168 | 0.059 | 1.01% | 54 | 11,016 | — |
| **kit** | neighbourhood | **0.292** | 0.088 | 1.75% | 95 | 607,042 | +0.124 ms (1.7x) |
| kit-merged | neighbourhood | 0.632 | 0.008 | 3.79% | 60 | 2,147,860 | +0.464 ms (3.8x) |
| today | neighbourhood | 0.503 | 0.161 | 3.02% | 181 | 813,581 | +0.335 ms (3.0x) |
| bare | island | 0.091 | 0.033 | 0.54% | 22 | 4,542 | — |
| **kit** | island | **0.166** | 0.046 | 0.99% | 36 | 212,238 | +0.075 ms (1.8x) |
| kit-merged | island | 0.596 | 0.000 | 3.58% | 28 | 2,141,386 | +0.505 ms (6.6x) |
| today | island | 0.280 | 0.060 | 1.68% | 64 | 288,552 | +0.189 ms (3.1x) |

**Verdict: PASS at every zoom, and the bought dressing is CHEAPER than the one that ships today at
every zoom** — 0.858 ms against 1.709 at the whole forest, 0.292 against 0.503 at a neighbourhood,
0.166 against 0.280 on one island. Almost exactly half, on the same axis PR #1693 measured at one
island, now confirmed at 35.

⚠ **THIS TABLE IS A QUIET BOX'S TABLE, AND THE NOISY ONE IS WHY THE RUN SAYS SO.** An identical run
taken while sibling sessions were building on the same machine returned the same medians within
noise but spreads three to six times wider, and `frame-budget.ts` correctly withheld eight of the
twelve deltas as `BELOW NOISE — not quotable` rather than printing them. The instrument refusing to
quote a cost it could not resolve is what makes this table's numbers worth reading; if you re-run
this on a busy box, expect the refusal rather than these figures.

**The whole crowd stands up 2,706 props and the payload does not move.** The kit is one file of
351,416 bytes however many islands are dressed, because it scales with DISTINCT objects and not with
placements. That is the finding PR #1686 established at one asset and #1693 at one island; at 35
islands it still holds.

### ⚠ 5a. The per-island figures do NOT multiply — and they under-shoot, not over-shoot

At one island the kit cost 25 draw calls. Thirty-five islands is **373**, not 875: the ground and
the props of an island are merged per material, and three.js culls each island's group on its own
bounding sphere, so islands outside the frustum cost nothing. The non-linearity runs in the cheap
direction. The bare LAND is where the draw calls actually live — 210 of the 373 — which matters,
because that is the half of adoption nobody has costed yet and it is not the dressing's to fix.

### ⚠ 5b. The whole-forest merge is a REMEDY THAT ONLY WORKS WHEN THE WHOLE FOREST IS ON SCREEN

`kit-merged` places identical props and delivers **identical pixels** — the driver refuses the run
if more than 0.5% of the frame moves by more than the land's own shade-ladder step, and the measured
figure is **0.000%** at all three zooms. All that differs is merge granularity.

| zoom | draw calls | triangles SUBMITTED | net |
|---|---|---|---|
| forest | 373 → **216** (1.7x fewer) | 2,179,684 → 2,179,684 (unchanged) | **0.858 → 0.832 ms — a wash** |
| neighbourhood | 95 → **60** (1.6x fewer) | 607,042 → **2,147,860** (3.5x more) | 0.292 → 0.632 ms — **twice as expensive** |
| island | 36 → **28** (1.3x fewer) | 212,238 → **2,141,386** (10.1x more) | 0.166 → 0.596 ms — **three and a half times as expensive** |

**One merged mesh spanning the whole forest is never frustum-culled.** Every off-screen island is
submitted on every frame. When the whole forest is in frame there is nothing to cull, so halving the
draw calls buys almost nothing (0.858 → 0.832 ms) because the cost was never in the draw calls; the
moment a visitor zooms in it is a large loss. **So do not merge across
islands** — the per-island merge the kit already does is the right granularity, and this row is here
so nobody reaches for the whole-forest merge later on the strength of its draw-call number alone.

This arrived as a REFUSAL, not as a hypothesis. The first version of the same-picture check compared
triangle COUNTS and refused a correct run at 98,410 against 2,138,068. Both arms place the same
props; the check was asserting something that was never the claim. Restating it over **pixels** —
what a reader receives — is what turned an apparent fault into this finding.

---

## 6. WHAT THE INSTRUMENTS REFUSED — five refusals, four of them against this session's own work

**A whole-lane finding cannot rest on an instrument nobody has watched fail.** Three
instruments-that-could-not-fail were caught in this factory in two days. Every refusal below is
committed in the driver and fires on a real run.

| # | the check | what it caught |
|---|---|---|
| C1 | **the truth reading is falsified on every run** — the same reading, re-taken with every island given the SAME status | **HELD, 12/12.** With the needle no longer different from its neighbours, every arm returns `LOST`. A reading that still said `FOUND` would be finding position or scatter, not proof state — and its `FOUND` on the real arm would mean nothing. |
| C2 | **no island box may catch zero pixels** | **CAUGHT A REAL BUG.** The first run returned `UNVERIFIED` for all eight arms. `project()` reads `camera.matrixWorldInverse`, which three only refreshes inside `render()` — and the boxes are computed before anything is drawn. All 35 islands were projected through an identity view matrix. The alternative was eight confident colour readings taken off empty frame. |
| C3 | **the two merge arms must deliver the same PICTURE** | **CAUGHT ITSELF.** Its first form compared triangle counts and refused a correct run; restating it over pixels produced §5b. |
| C4 | **a spread that swallows its own median is not a frame time** | **CAUGHT A REAL DEFECT.** Every one of the twelve arms came back with spread ≈ median — `today@forest` read 3.36 ms on one run and **18.03 ms** on the next with byte-identical draw calls and triangle counts. The forest was being rebuilt and re-uploaded inside every timed call, so the GPU was servicing buffer uploads while the timer query was open. Caching the composed scene fixed eleven of twelve arms. |
| C5 | **adding work cannot subtract cost** | Never fired after C4. It is the refusal PR #1693 published its batch size because of, kept here because it is the one that catches a physical impossibility being reported as a saving. |

### ⚠ 6a. And one refusal that was WRONG, removed rather than tuned

The first form of C4 refused any arm whose spread exceeded **half its own median**. That is a number
picked here to make an answer come out — precisely the move `pixel-threshold-reads-off-a-same-run-control`
exists to prevent — and it was wrong in a measurable direction: the residual disturbance on this box
is roughly constant in ABSOLUTE size (~0.1 ms), so a ratio bar refused the CHEAP arms while passing
the expensive ones carrying the same noise. It is replaced by `frame-budget.ts`'s own rule, which
states every cost against a control and withholds a delta that does not clear the wider of the two
rows' spreads. The same rule, applied where it belongs: to the DELTA being claimed rather than to the
median being reported.

A second attempted fix is recorded because it did NOT work: pre-rolling a quarter of the batch
untimed, on the theory that the GPU idles at 300 MHz and boosts under load. It moved nothing. The
pre-roll is kept (it costs nothing and the shader warm-up is genuinely needed); the clock-boost
hypothesis is not supported.

### 6b. The pure modules are mutation-covered

`crowd-layout.test.ts` and `crowd-reading.test.ts`, 21 tests, `bun test`. The load-bearing ones:
the truth reading **FOUNDS** a planted needle (rank 1, +82.06 dE), **LOSES** it when the needle wears
the healthy colour (−0.47 dE), **LOSES** it when a healthy island is planted further out than the
needle (−67.31 dE, and the same needle without the outlier is found — so that `LOST` is the
outlier's doing and not a needle too timid to see), and returns `UNVERIFIED` rather than either
verdict when the measurement is not one. The layout's islands are proved non-overlapping at the real
density and at 15%, and the density model's breaking point is pinned at ~30% land, where the grid
cell becomes narrower than an island.

---

## 7. WHAT THIS IS NOT

- **It adopts nothing.** Everything is under `harness/`. Adoption into
  `packages/forest-world-r3f/src` stays a separate, deliberate event (ADR-0380 D6 / ADR-0406 D2),
  and ADR-0418 D4's replacement check is its precondition and is still not built. This page produces
  evidence for a decision the owner holds, and takes none.
- **The layout models the real forest's COUNT and DENSITY, not its topology.** The real islands sit
  where `depends_on` puts them. Topology decides which island is next to which; it does not change
  how many are in frame, how much of the frame is land, or how many draw calls are submitted — which
  is all three questions asked here. It would change a claim about a specific neighbour pair, and no
  such claim is made.
- **The failing island is a plant** (§4), and the real forest has none.
- **It is one GPU's numbers.** An RTX 2060, named in `crowd.json` and read out of the live context.
  24.5% of grained pixels differ between SwiftShader and this card
  (`grain-picture-is-renderer-specific`); a committed pixel figure is one machine's figure.
- **It does not re-answer the one-island question.** Payload, texture rung and prop vocabulary are
  `chapter2-kit-island-2026-08-28`'s, and are not re-derived here.
