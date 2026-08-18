# Shrubs and small plants replace the long grass — the set, measured on the real island

**Date:** authored 2026-08-18, rendered 2026-08-19 · **Camera:** 50° (the research track's named
parameter; the app's `LAND_CAMERA_ELEVATION_DEG` is **20** and is neither read nor written here) ·
**Island:** the real-corpus `context-traversal-capture` — 11 capabilities, every one `healthy` off
its own signed pass, 162 mesh cells, 10 UAT criteria, flat green, seams off · **Blender renders:**
3 (~6 s) · **Cycles samples:** 48 · **Palette:** 132 entries, the shipped dressed palette ·
**Vendor calls:** 0 · **Cost:** $0

The owner, 2026-08-17:

> *"grass still looks ugly, i think we dont do grass for test complexity, maybe we just stick to
> green land. I think Instead we do shubs and other small plants instead. the pixelated triangles
> for the long grass looks rather ugly and cheap."*

and, asked whether vegetation still signals test count: **shrubs inherit it.** So **ADR-0226 D2 is
unchanged** — a capability's test count is still read from its vegetation density — and only the
species moves. This is a re-skin, not a re-decision.

## → OPEN `shrub-species.png`

Three panels, one island, one code state, one camera, **one palette**, and **the same 171
placements** on all three, so the only variable is which mesh the piece names resolve to:

1. the **withdrawn long grass** (`pieces-m00-blade`, the set `compose_healthy.py:95` still mounts)
2. the **four species** from #1389 (`pieces-species`), which are awaiting the owner's look
3. **+ two small plants in the shrub slots** (`pieces-shrubs`, this pass)

Then `small-plant-set.png` for the set itself at 14× (every block one delivered pixel),
`shrub-detail-6x.png` for the appearance call, and `test-count-channel.png` for what the re-skin
does to the ADR-0226 D2 signal.

**Nothing here is owner-attested and this page has no standing to make an appearance verdict**
(ADR-0070 stage 2). An honest *"this did not help"* is an accepted outcome (ADR-0280 D4).

---

## The headline: the 3-pixel figure was the SPECIES, and it reproduces exactly

The increment said to re-measure the arc's "median 3 delivered px" rather than inherit it, on the
grounds that it was measured on the withdrawn blade **and** on placements carrying the CRC32
diagonal collapse. Both of those facts are true. **The number is unchanged anyway.**

Measured here on the current positioner (`scatter.py`, post-#1393) and the current compositor
(post-#1387 painter order), on the real-corpus island:

| | withdrawn blade | four species (#1389) | small-plant set (this pass) |
|---|---:|---:|---:|
| median delivered px **per surviving placement** | **3** | **8** | **8** |
| placements delivering NOTHING | 8.2% (14/171) | 1.8% (3) | 2.3% (4) |
| delivered vegetation px on the island | **682** | **1 488** | **1 446** |
| delivered px per authored mark | 3.77 | 8.22 | 7.99 |
| palette entries | 132 | 132 | 132 |

**So the correction runs the other way from the one the increment expected.** The diagonal collapse
did not manufacture the 3, and neither did the painter-order defect: fixing both leaves it exactly
where it was. What moves it is changing the species, which is what the owner asked for. The right
statement of the finding is *the long grass delivers three pixels because it is long grass*, not
*the measurement was broken*.

The **zero-delivery share is a different story** and this pass does not reproduce the arc's numbers
there. It reads **8.2%** for the blade set here against the 46% measured before #1387 and the 17.2%
quoted for the real corpus after it. Both of those were measured on a composite with the shipped
seams and the hash-picked ground variants; these panels stand on the flat-green one-surface island
the owner cleared, and every tuft has been spread over all four tuft slots (below). The figure in
this table is the one that belongs to these pictures, and it is not a re-derivation of theirs.

---

## The set

Six mounted plants, in the six slots `scatter.py` already chooses among — four inherited
byte-for-byte from #1389, two authored here.

| slot | withdrawn blade | #1389 | **this pass** | delivered | box | aspect | fill | survival |
|---|---|---|---|---:|---|---:|---:|---:|
| `tuft-3a` | blade tuft | **dome** | dome *(inherited)* | 18 px | 6×4 | 1.50 | 0.75 | 94.7% |
| `tuft-2` | blade tuft | **spire** | spire *(inherited)* | 7 px | 2×4 | 0.50 | 0.88 | 96.9% |
| `tuft-3b` | blade tuft | **spreader** | spreader *(inherited)* | 20 px | 8×3 | 2.67 | 0.83 | 109.1% |
| `tuft-4` | blade tuft | **pair** | pair *(inherited)* | 10 px | 6×3 | 2.00 | 0.56 | 115.4% |
| `shrub-a` | legacy clump | legacy clump | **cushion** | 8 px | 4×3 | 1.33 | 0.67 | 116.1% |
| `shrub-b` | legacy clump | legacy clump | **frond** | 14 px | 8×3 | 2.67 | 0.58 | 96.9% |
| — | — | — | *tier* (**candidate, not mounted**) | 8 px | 4×3 | 1.33 | 0.67 | 91.1% |

```
   dome        spire     spreader      pair       cushion       frond         tier
  ..##..        ##      .######.     .#....       .##.       ###..###       .##.
  ######        ##      ########     ##..##       ####       .##..##.       ####
  ######        ##      .######.     ###.##       .##.       ..####..       .##.
  .####.        .#
```

**`blender_species.py` is NOT edited, and that is a rule rather than a convenience.** Its sha256 is
stamped into `pieces-species/render-meta.json` and into five committed provenance sidecars whose
pictures are in front of the owner right now. A new generator (`blender_shrubs.py`) renders the two
new slots and **inherits nine pieces byte-for-byte** — the four species, the two wilts and the three
UAT flowers — recording each source hash. That is the same move `blender_species.py` itself made
when it inherited seven pieces from `pieces-m00-clump`, and the same reason it gives for not editing
`blender_grass.py`.

### What the two new plants actually buy — and what they do not

**They do not widen the set.** Every extreme — the widest aspect, the narrowest, the highest fill,
the lowest, the biggest mark and the smallest — is held by one of the four **inherited** species. So
aspect spread (5.34×), fill spread (1.57×) and the 7–20 px size ladder are **identical** to #1389's
numbers. The delivered vegetation total is in fact **42 px lower** (1 488 → 1 446, −2.8%), because
the cushion is deliberately the smallest solid mark in the set.

**What they buy is separation between the six outlines**, which is a different question from how
wide the set is. Each species is a point in (aspect, fill, log delivered px), each axis normalised
by the set's own range; the figure is the **minimum pairwise distance**, because the closest pair is
what decides whether a set reads as six things or as five:

| | min pairwise separation | the closest pair |
|---|---:|---|
| withdrawn blade | **0.000** | `tuft-3a` / `tuft-2` — *identical delivered footprints* |
| four species (#1389) | 0.255 | the two legacy clump shrubs |
| small-plant set | **0.449** | pair / frond |

**The withdrawn blade set scores exactly zero, and that is not a rounding artefact:** three of its
four tuft slots (`tuft-3a`, `tuft-2`, `tuft-4`) deliver the *same* 2-pixel mark in the *same* 2×1
box. Four names, two shapes. That is the clearest single statement of why no shading lever ever
moved it.

And the two pieces this pass replaces were the closest pair in #1389's set: both legacy grass-clump
shrubs, 12 px at aspect 2.00 and 11 px at aspect 1.67, sitting almost on top of each other and only
a little way from the dome.

### Aspect alone cannot score this set — a correction to #1389's instrument

#1389 measured outline variety by delivered **aspect ratio** alone. That instrument cannot tell the
`frond` from the `spreader`: both deliver an **8×3** box at aspect **2.67**. They are plainly
different pieces — the spreader fills **0.83** of its box and the frond **0.58**, because the frond
carries a notch. Variety is reported here on both axes, and `verify.py` rung 11 asserts the tie on
one and the separation on the other.

### Concavity survives. Vertical separation does not.

The arc had established three properties that survive the 3×3 majority downsample at this scale:
**area**, **aspect ratio** and **topological disconnection**. Both new pieces were authored to test
a fourth.

- **CONCAVITY SURVIVES.** The frond's notch is authored ~2 delivered px deep and comes through at
  **96.9%** survival, leaving unset pixels between the extremes of its top row. That is a third cue
  class, and it decouples fill from aspect — the frond and the spreader occupy the same box and read
  differently.
- **VERTICAL SEPARATION DOES NOT.** The `tier` candidate raises a crown clear of the ground on a
  visible stem — a gap on the axis the `pair` does not use. Its delivered silhouette is **identical,
  pixel for pixel once the two are aligned**, to the cushion's 8-px mound: the stem and the gap
  beneath the crown are both destroyed. Two very different meshes, one delivered mark. It is
  rendered, measured and **absent from `pieceNames`**, so no composite on this pass can contain it.

**A species carries NO meaning.** ADR-0226 D2 gives the signal to the vegetation COUNT and the
vocabulary has no member for species, so six outlines assert exactly what two did. Making a species
mean something would be inventing a channel under cover of an art change.

---

## The test-count channel — what survives, and what was already broken

`test-count-channel.png`. The count rule is untouched: `grass = round(2 + tests·1.9)`,
`shrubs = round(tests/2.6)`, and the same placements carry all three panels.

**This island's contracts span 4 to 7 tests**, which is narrower than the 2-vs-8 spread the channel's
known weak spot was first measured across. So the numbers below are **not** the 0.78-vs-1.11 figure
re-stated, and they cannot reproduce the 3-to-30 density ladder measured elsewhere.

- **The re-skin makes vegetation VISIBLE without making the channel more DISCRIMINATING.** Least-
  against most-tested capability, delivered px per 1000 ground units: blade **9.21 → 22.86** (a
  **2.48×** read for a 1.75× test count); small plants **25.84 → 59.03** (**2.28×**). Per owned
  cell the same comparison reads blade 1.31 → 3.35 (2.56×) and small plants 3.67 → 8.65 (2.36×).
  Absolute visibility roughly triples on either normaliser; the *ratio* does not improve and is
  fractionally worse.
  *(The chart plots per-AREA, not per-cell: cell counts on this island run from 1 to 40, so a
  two-cell capability's per-cell figure is a fact about the mesh decomposition rather than about
  its vegetation. Both are in the report. The two spikes that remain on the per-area chart are
  real — they are the small parcels the count rule overloads, below.)*
- **DELIVERED-PIXEL MONOTONICITY WAS ALREADY BROKEN BEFORE THE RE-SKIN.** Across the eleven
  capabilities, ordered pairs where a more-tested capability delivers fewer vegetation pixels than a
  less-tested one: **blade 10, four species 9, small plants 9** — against **zero** breaks in what the
  rule AUTHORED, which is monotone by construction. The re-skin is not the cause and marginally
  improves it. The weakness lives in **delivery**, not in the rule: parcel areas on this island span
  28×, and a small parcel's marks land on top of each other while a large one's spread out.
- **THE COUNT-RULE OVERLOAD IS REAL AND NARROW, AND IT IS SHOWN, NOT DECIDED.** `2 + tests·1.9` has
  no area term. On this island **1 of 11** capabilities is budgeted more plants than its own ground
  holds at a shrub's footprint — capability 5, **18 plants on ground that holds 14 (1.262×)** — and
  every other capability sits at 0.59× or below. Shrubs inheriting the rule inherit the overload, and
  **a bigger mark makes it more visible, not less**. The area-aware fix was rendered in #1389 and
  costs **four monotonicity breaks against the current rule's zero**, so a reader would read the test
  counts in the wrong order. That is an ADR-0226 D2 semantic change and is **the owner's call**, not
  this pass's.

---

## Interpenetration — the risk of a bigger mark on unchanged spacing

The placements are identical across all three panels, so a bigger mark has to fit in the same gaps.
Three standing owner rejections on this arc are about exactly this failure mode (stones
*"noisy/colliding"* 2026-07-18, *"messy and noisy rather than cosy"* 07-20, *"way too big"* 07-23),
so it is measured rather than hoped.

Measured on **isolated footprints** — the shipped `paste_decor` blit with nothing else on the canvas
— so an overlap is two plants claiming the same supersampled pixel, not one plant painted over.
Overlap in the finished composite would under-report by exactly the amount the painter order hides.

| | overlapping pairs | plants in ≥1 overlap | overlapping px | as a share of total footprint | median footprint |
|---|---:|---:|---:|---:|---:|
| withdrawn blade | 21 | 28 (16.4%) | 130 ss | **1.71%** | 34 ss |
| four species (#1389) | 58 | 44 (25.7%) | 910 ss | **4.52%** | 114 ss |
| small-plant set | 59 | 42 (24.6%) | 945 ss | **4.77%** | 78 ss |

**It rises, and it stays small.** About a quarter of plants touch a neighbour, and the touching is
under 5% of the total plant footprint — the worst single pair overlaps 57 supersampled pixels, about
six delivered ones, between a dome and a pair. Whether a quarter of plants touching reads as
*massed* or as *cosy* is an appearance call and this page does not make it.

⚠ **The 88% figure in the arc's memory is a different measurement and is not compared here.** It
belongs to the app's `driftSpot` scatter (`scene.ts`'s mulberry32, whose 9.08× drift-bed
concentration is deliberate and owner-directed), on the app's surface, not to this island's
positioner.

---

## What is measured here, and what is quoted

Every figure above is **this pass's own**, taken on the current positioner and the current
compositor, with the three sets composed on one unlit surface so their totals are comparable to each
other. Quoted from siblings, and labelled as such wherever they appear: the unfixed sampler's
`corr(u, v) = +0.9997` (dispersion pass), the 17.2% real-corpus residual (#1387), and #1389's own
vegetation totals — which were taken against **different light fields** for the two sets it compared
(shadow-only against shadow-plus-relief), and are therefore **not** comparable to the table at the
top of this page.

## Fences, and how they are stated

- **`docs/research/**` only.** No `packages/forest-world/src`, no `apps/**`, no `packages/app-surface`,
  no web gitlink bump. `LAND_CAMERA_ELEVATION_DEG` stays **20** and is neither read nor written.
- **Nothing is vendored.** The positioner is `scatter.py` reached through
  `disperse.scatter_dispersed` (which **is** `scatter.scatter_island`); the compositor is
  `compose_healthy.py` imported whole with its writes sent to scratch, so its module-level refusals
  are this pass's refusals; the attribution instrument is the grass-defects pass's `attribute.py`
  and the per-placement roll-up is the delivery-loss pass's `delivery.py`.
- **The no-vendoring promise is checked as a PROMISE ABOUT CONTENT, never as a branch diff.** A
  branch-diff fence tests the branch, not the promise: a check reading `blender_species.py …
  UNEDITED` out of a diff stays green while false the moment a branch legitimately edits that file.
  `verify.py` rung 3 instead asserts that no file in this directory *defines* a compositor, a
  sampler, a palette builder or a back half, and rung 5 compares this set's recorded
  `inheritedGenerator` against `pieces-species`'s own declared code state — a JSON-to-JSON
  comparison, so it cannot be confused by the CRLF-vs-LF hashing trap that once made an untouched
  script look modified.
- **One import-order hazard, asserted rather than trusted.** `attribute.py` builds its own
  `compose_core` module object and registers it in `sys.modules`, while `compose_healthy.py` reaches
  the name by ordinary import — whichever runs first decides whether there is one module or two, and
  with two, a piece set mounted through one is invisible to the other. `CH.D is A.D` is asserted
  before a pixel is drawn. (This is the same defect class as converting a module to an alias and
  then patching the alias, which went inert twice on this arc while printing as if it worked.)

## The floor — `verify.py`, 26 rungs

```
python verify.py
```

Wherever it is affordable a rung **re-derives** the quantity from the committed pixels, the committed
piece sets or the shipped modules rather than reading the report back, because a check that consults
the report it is checking can only ever pass.

**It fails loudly on its own parse errors, and that is not a style note.** Two harnesses on this arc
reported FALSE PASSES because they died before reaching the guard — one on `FileNotFoundError` (five
false passes), one on a corr parser that reported `None` for a refusal that had worked perfectly. So
every rung runs inside a wrapper that turns any exception into a FAILED rung with its traceback, the
expected rung count is declared up front, and **a run that does not reach that count is a failure
even if every rung it did reach passed.**

Three guards are worth naming because each one caught something in this pass:

- **The survival floor (rung 9).** Every mounted piece must survive the 3×3 majority at ≥85% —
  the greenery survey's instrument, where below ~85% the vote is destroying structure rather than
  shrinking it. **It caught this pass's first cushion at 61%**, delivering `####`: a one-pixel-tall
  dash. Smallness was being bought out of height, which is the axis that cannot afford it; it is
  bought out of width instead. The blade set is exempted **by name, with its reason**, because its
  collapse is the finding — and the exemption itself is checked, so it cannot describe a problem that
  is not there. Its four tuft slots survive at **69.2 / 60.0 / 79.4 / 42.9%**, which lands inside
  the greenery survey's independently measured **43–79%** band for the long-grass blade against
  94–116% for every other piece on the arc. That is a corroboration from a different instrument on a
  different pass, not a restatement.
- **The vacuity check on the 6× crop (rung 25).** The crop is chosen as the window holding the most
  delivered vegetation while containing **no** hero-tree pixel — the predecessor pass spent three
  attempts learning that the centroid lands on the trunk and "most vegetation" lands under the
  canopy. **The first tree mask here was differenced against a reference that also contained the
  tree**, so it cancelled to nothing and "no tree pixel in this window" became true of every window
  on the island. A negative permission test passes vacuously when its inventory is empty, so the
  rung now checks the count **both ways**: zero in the chosen window, and a mask large enough that
  zero could have failed.
- **The diagonal gate.** `corr(u, v)` on this pass's own delivered placements is **0.0366** against
  the unfixed sampler's **+0.9997** and a null of exactly zero; on-diagonal share **0.0468** against
  a chance of 0.0396. It is a refusal, not a report line — no picture is written if it fires.

Determinism is asserted on the **decoded raster**, never on the file bytes: a Blender PNG's container
differs on every re-render, measured live on this arc at 0 of 22 files byte-identical across two
pixel-identical runs.

## Files

| | |
|---|---|
| `blender_shrubs.py` | the generator: authors cushion, frond and the tier candidate; inherits nine pieces byte-for-byte |
| `compose_shrubs.py` | the three composites, the attribution, and every measurement |
| `verify.py` | the 26-rung floor |
| `pieces-shrubs/` | the mounted set + the unmounted candidate + `render-meta.json` |
| `shrub-report.json` | every number on this page |
| `shrub-species.png` | **the deliverable** — three panels on the real island |
| `small-plant-set.png` | the set at 14×, every block one delivered pixel |
| `shrub-detail-6x.png` | the appearance call, at 6× |
| `test-count-channel.png` | delivered px per 1000 ground units, by capability |

## What is still open, and whose call it is

1. **The appearance verdict** — the owner's look, on `shrub-species.png` and `shrub-detail-6x.png`.
   Nothing here has standing to make it.
2. **The sixth slot** — `frond` is mounted and `tier` is not. Both are rendered and measured; the
   tier's negative result (its silhouette collapses onto the cushion's) is the argument against it,
   not a preference.
3. **The count rule's missing area term** — shown on `test-count-channel.png`, not decided. Fixing it
   is an ADR-0226 D2 semantic change and costs four monotonicity breaks.
4. **Delivered-pixel monotonicity** — 9 inverted pairs out of 11 capabilities, pre-existing and not
   caused by the re-skin. Whether "vegetation density reads as test count" can hold on a single
   island with a 28× parcel-area spread is the same question the rule's missing area term asks, from
   the other end.
