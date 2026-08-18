# The 17.2% is attributed, the fourth compositor site is fixed, and a sidecar stops lying

`python verify.py` → **36/36 green** → `verify-report.json`. The measurements behind it:
`python residual.py` → `residual-report.json` (~12 min) · `python dressed_fix.py` →
`dressed-fix-report.json` (~3 min) · `python picture.py` → `the-fourth-site.png` (~3 min). No Blender
render in this pass: every piece is a committed PNG. Camera **50 deg** — the research track's named
parameter; the app's `LAND_CAMERA_ELEVATION_DEG` is **20** and is neither read nor written here.

This pass also **re-composed the dressing pass** (`chapter2-island-place-dressing-2026-08-16/`), whose
pictures were the ones carrying the fourth site's defect — 6 of its 8 moved — and **corrected two
sibling READMEs in place** whose prose had gone stale against their own committed reports.

---

## 1. THE HEADLINE: the 17.2% was a SECOND DEFECT, and it is already gone

The increment that commissioned this pass asked for an attribution of a number:

> *"The real-corpus island's grass delivery residual is 17.2%, more than twice the fixture's 7.1%
> and unattributed."*

The attribution is that **the number no longer exists, and the gap it names is absent rather than
explained.** 17.2% was measured on 2026-08-17 against the plant positions the affine-CRC32 scatterer
produced. PR #1393 replaced that positioner the next morning. On the same island, the same
compositor, the same seed and the same piece set:

| | placements | delivering nothing |
|---|---:|---:|
| **real corpus, as published 2026-08-17** | 180 | 31 → **17.2%** |
| **real corpus, TODAY** | 181 | 12 → **6.6%** |
| **fixture, TODAY** | 115 | 8 → **7.0%** |

(All three are the un-subtracted count, which is the figure #1387 published. Holding out the
co-credited class — a placement whose pixels ARE on the island but were credited to a colour-identical
neighbour by the attribution's own tiebreak — the real island is at **11 of 181, 6.1%**, and every
other table below uses that stricter number.)

So the real surface is not "more than twice the fixture". It is **at or below it.**

⚠ **The committed evidence already said so and the prose did not.** PR #1393 re-ran the
order-and-caps pass's `verify.py` and rewrote `order-and-caps-report.json` with exactly these
numbers — but left that pass's README table quoting the pre-dispersion ones. For a day the track's
headline delivery rate was a figure its own committed report contradicted. That table is corrected in
place here, and `verify.py` carries the rung that would have caught it: **every rate a README quotes
must be a rate its own report holds.**

### The 2×2 that separates the two defects

Two defects, two switches, four corners, one run. Both switches live in `compose_core.py` and are the
ones the shipped guards already use — no copy of either compositor was made to produce this table.

**real corpus** (`context-traversal-capture`, 162 cells, 11 capabilities), % delivering nothing:

| | depth key = OLD (pre-#1387) | depth key = SHIPPED |
|---|---:|---:|
| positioner = `LEGACY_AFFINE` | **51.1%** (92 of 180) | **14.4%** (26 of 180) |
| positioner = `SPREAD` (shipped) | 34.8% (63 of 181) | **6.1%** (11 of 181) |

**fixture** (`fork-spike-island`, 214 cells, 10 capabilities):

| | depth key = OLD | depth key = SHIPPED |
|---|---:|---:|
| positioner = `LEGACY_AFFINE` | **44.6%** (50 of 112) | **7.1%** (8 of 112) |
| positioner = `SPREAD` | 35.7% (41 of 115) | **7.0%** (8 of 115) |

Reading the corners. The real island's top-left reproduces PR #1387's committed "before"
**exactly** — 94 of 180 by the un-subtracted count, which is the figure that pass published. Its
top-right reproduces the published 17.2% **to within one placement** (30 vs 31), and the gap is
stated rather than smoothed: `scatter.LEGACY_AFFINE` restores the MEADOW's affine draw, not the UAT
flowers' spiral, which PR #1393 fixed unconditionally. Reproducing the old numbers from the shipped
code is what makes the other two corners readings of the same instrument rather than of a new one.

### What each fix bought, in percentage points of the original loss

| | painter order (#1387) | dispersion (#1393) | residual |
|---|---:|---:|---:|
| **real corpus** (51.1% → 6.1%) | **36.7** | **8.3** | 6.1 |
| **fixture** (44.6% → 7.0%) | **37.5** | **0.1** | 7.0 |

**The dispersion fix bought 8.3 points on the real island and 0.1 on the fixture.** That 83×
asymmetry, on two islands nobody chose for this property, is what the next section explains — and it
is why the "more than twice the fixture" gap looked like a property of the real geometry when it was
a property of the positioner.

**And it is DECOMPOSED, not credited whole.** `scatter.py`'s replacement changed three things at
once. `candidates=1` turns off best-candidate blue noise while keeping the avalanche hash and the
area-weighted cell choice: on the real island that ablation lands at **6.1%**, identical to the
shipped positioner. **All 8.3 points come from killing the diagonal; blue-noise spacing contributes
zero.** (On the fixture the split is 1.0 / −0.9, which at n≈112 is one placement either way and
should be read as noise, not as blue noise costing anything.)

---

## 2. THE PREDICTION HAS A SIGN, and the sign is CO-TENANCY

Reproducing a magnitude is the weak form of an attribution. PR #1383 earned trust on this arc because
its prediction had a sign — above the cell centroid 78.3% of placements delivered nothing, below it
3.8%, a 20× split across a comparison containing no pixel quantity. The same bar is met here.

> **THE DIAGONAL ONLY COSTS DELIVERY WHERE TWO PLANTS SHARE A CELL.**

Under the affine draw both coordinates came from two CRC32s over messages differing in one character,
so every plant stood on its cell's bounding-box diagonal. Two plants in one cell were therefore not
merely close — they were **collinear on a line the cell fixed**. A plant alone in its cell has nothing
to collide with and loses nothing at all.

That predicts a monotone gradient in a plain COUNT of co-tenants, and a collapse of that gradient
under the fixed positioner. Both were stated before the table was read.

**real corpus — % delivering nothing, by how many other placements share the cell:**

| co-tenants | 0 | 1 | 2 | 3+ |
|---|---:|---:|---:|---:|
| `LEGACY_AFFINE` | **4.6%** (65) | 10.3% (68) | 20.0% (15) | **40.6%** (32) |
| `SPREAD` | 2.5% (79) | 14.3% (42) | 4.2% (24) | 5.6% (36) |

Strictly monotone under the diagonal, **4.6% → 40.6%, an 8.8× split**, and the gradient is gone under
the fix (a 36.0-point spread becomes 3.1). The axis is a count of neighbours, not a pixel quantity,
which is what makes it a prediction rather than a restatement.

**And the cross-island claim, which is the one that could have failed loudly.** The two islands were
never chosen to differ in density and nothing in the pipeline knows density is an axis:

| | plants per cell | placements with ≥2 co-tenants | dispersion bought |
|---|---:|---:|---:|
| fixture | 0.54 | 7 of 112 (6.3%) | 0.1 pts |
| real corpus | **1.12** | **47 of 180 (26.1%)** | **8.3 pts** |

The island with twice the plants per cell — and four times the share of crowded cells — is the one the
dispersion fix bought more on. The ORDERING is what was predicted; the 83× magnitude is reported, not
predicted, and is super-linear because both the share of crowded placements and the rate within them
move together.

⚠ **This corrects a reading in the order-and-caps README, and the correction makes the claim
cleaner.** That pass guessed the real island "packs more decor onto fewer, **smaller** cells". The
cells are not smaller: mean cell area is **150.5 ground units² on the fixture against 152.0 on the
real island — 1% apart**, and the medians agree to the same margin. The real island simply has FEWER
cells (162 against 214) carrying MORE plants (181 against 115). So cell SIZE is held constant between
the two geometries by accident, and plants-per-cell is left as the only relevant difference — which is
what makes the cross-island comparison above a controlled one rather than a coincidence. `verify.py`
asserts the equality so the claim cannot quietly stop being true.

---

## 3. WHAT IS LEFT, one row at a time — and it is not a third defect

The real island's residual is **11 true zeros of 181** (a twelfth is co-credited to a colour-identical
neighbour, which is an instrument artefact and is subtracted throughout).

**6 OCCLUDED — and by nothing that is a defect.** `ownCellsFill` is **0**: the thing #1387 fixed is
gone. What remains is 2 behind another cell, 3 behind a wall, 1 behind another plant — a plant
genuinely standing behind a nearer raised surface, which is correct 2.5D occlusion.

**5 OUT-VOTED — the raster's own floor, stated as a THRESHOLD rather than a magnitude.** The back
half's downsample is a 3×3 majority, so a colour needs **5 of 9** to take a delivered pixel. That is a
hard, stated boundary and not a tuning knob, which makes it the right shape for closing a search:

| | real corpus | fixture |
|---|---:|---:|
| placements reaching 5-of-9 in some block | 167 | 107 |
| **…of which deliver (or are co-credited)** | **167 (100%)** | **107 (100%)** |
| out-voted placements' best block | 1, 2, 3, 3, **4** | 2, 4, **4** |

**Reaching the threshold is sufficient for delivery, without a single exception across 274 placements
on two islands, and no out-voted placement reaches it.** So there is no placement that owned a
majority somewhere and still delivered nothing — which is what closes the search rather than
continuing it. (Below the threshold delivery is possible but not guaranteed: the majority is a mode,
and four can win when the other five are split. 2 of the real island's 14 sub-threshold placements
still deliver.)

**That is the SIZE question, and this pass hands it over rather than answering it, with one number
corrected.** Median delivered pixels per SURVIVING placement, across all four corners: **3 on the
fixture, every time**, and **3 → 4 on the real island** — the painter-order fix moves it by one,
because a survivor that used to deliver only the half of its mark standing below its cell's centroid
now delivers the whole thing. The DISPERSION fix moves it not at all, on either island. So this arc's
standing "median 3, and nothing has ever moved it" is very slightly overstated for the real geometry,
and the correction points the same way: the mark is 3–4 delivered pixels and the levers tried so far
do not change that. It feeds `adr0226-vocabulary-re-examined-for-3d` and
`shrubs-replace-long-grass-and-inherit-the-test-count`; it does not by itself decide either. The
technique triage is NOT reopened — normals have no optimum, the carpet was refused on a number, and
clump-on-mound was declined by the owner on 2026-08-16.

---

## 4. THE FOURTH COMPOSITOR SITE IS FIXED — by an import, not a fifth copy

`compose_dressed.py` kept its own draw-list assembly and imported neither rule from `compose_core`, so
PR #1387's two fixes never reached it. Every delivered dressing picture — `island-dressed.png`,
`dressing-layers.png`, `dressing-density.png`, `island-dressed-detail.png` and the
`status-vocabulary.png` sheet the status colours were settled on — was composed with a placement
sorting on its own ground y alone, and with `caps=` reaching the cells but not the walls.

Measured on the dressing island, with each rule reintroduced through `compose_core`'s own switch:

| | old rule | as shipped |
|---|---:|---:|
| placements owning ZERO supersampled px | **32 of 120 (26.7%)** | **3 of 120 (2.5%)** |
| supersampled px owned by decor | 3 205 | **5 209** (+2 004, ≈223 delivered-equivalent) |
| `caps=`-vs-ground-truth disagreement | **4 803 ground-equiv px, 12 wrong wall colours** | **0** |

Two things worth reading precisely.

**26.7% is not the 46%, and they are different quantities.** The arc's 46% is placements delivering
zero *delivered* pixels — occlusion plus out-voting plus co-crediting. The number here is measured on
the supersampled canvas before the downsample, so it is occlusion ALONE. Occlusion alone is what the
depth key can move.

**The walls figure is much bigger than the arc's existing one because that one counted a single
status.** PR #1381 reported **936** charcoal `unhealthy` wall px and PR #1387 restated it as **904**
on the island body; both are counts of `unhealthy` alone. Driving an island all-`healthy` through
`caps=` left EVERY original status' walls standing, so the amber `building`, pale `proposed` and brown
`mapped` bands were wrong too and nobody had counted them. Of the 4 803 here, **869.6
ground-equivalent px are the charcoal `unhealthy` side token** — the directly comparable subtotal, and
close to 904 on a different island at a different camera, which is the agreement one should expect. `status-vocabulary.png` is the picture this most damages: five panels each
claiming to show one status, standing on the original island's mixed-status walls.

`the-fourth-site.png` shows it at 6×: the same island composed twice with only
`compose_core.DECOR_SORTS_AFTER_ITS_CELL` moved, and a third panel painting every pixel the old rule
laid down and then overpainted. The crop is DERIVED — the window holding the most changed pixels — not
chosen, and the hero tree is not composited at all, because it occludes cells and a per-cell measure
with it in frame already cost this arc one full re-measure.

**What it moved in the delivered pictures.** Decor share of the island at the app's authored density
**0.97% → 1.56%** (339 → 547 delivered px), and at ×6 **4.30% → 7.52%**. `status-vocabulary.png`'s five
panels each shed 9–16 colours that belonged to statuses the panel was not showing — `healthy` 47 → 31,
`building` 47 → 37, `proposed` 45 → 36, `mapped` 44 → 33, `unhealthy` 46 → 33 — on a sheet whose whole
purpose is to say what ONE status looks like. `island-bare.png` is byte-identical across the change,
which is the check on the whole repair: bare land carries no decor and its walls come from the
island's own statuses, so neither rule may move a pixel of it.

### Why the repair is an import, and the trap it turns into a mechanism

`compose_dressed` now calls `compose_core.decor_depth_key` and `compose_core.walls_under_caps`, and
defines **neither switch of its own**. `verify.py` asserts function IDENTITY, not equality — a copy
that happened to agree today would pass an equality test.

⚠ This deliberately uses the property that bit this track in PR #1393: **converting a module to an
alias disarms every monkey-patch aimed at it**, because a callee resolves its globals in the module
that DEFINES it. Two live sites went inert that way and both kept printing as though they worked.
Here that is the point — one switch in `compose_core` now reaches three compositors, and a guard that
patched an importer's own copy of the name would find **no such name to patch** and raise, rather than
measuring the unmodified rule and printing CAUGHT.

**Three copies remain three; convergence beyond these two rules is NOT done.** `compose_core.py` is a
554-line superset of `compose_dressed.py`'s first 400 lines, so a full convergence is available — but
it would have to rebind `compose_core` to a second decor piece set with four roles per piece and would
put eight delivered pictures at risk for no measurement this increment needs. Parked as an arc
increment rather than half-attempted here.

---

## 5. `provenance.producer.sha256` — an unedited script is now provably unedited

Re-running the **untouched** `compose_shadow.py` used to rewrite its sidecars: the committed value was
the CRLF hash of a file this repo stores LF (`.gitattributes` sets `* text=auto eol=lf`), so the digest
recorded the working-copy line endings of whoever rendered rather than the source. That is a false
positive in the one mechanism this arc relies on to prove a picture was composed at one code state.

`producer_record` now hashes through `sha256_source`, which folds CRLF and bare CR to LF and touches
nothing else, and stamps every record with `basis: source-bytes-with-CRLF-and-CR-normalised-to-LF` so
a reader can tell which rule made a digest without dating the sidecar by its commit.

Proved both ways in `verify.py`: the same source hashes identically from an LF checkout and a CRLF
one, **and the check is not vacuous** — the two files' RAW digests do differ. `sha256_file` is
unchanged and still hashes raw bytes, which is asserted directly against `hashlib` on a committed PNG
that itself contains CRLF byte pairs a text rule would have folded. Normalising a binary would corrupt
the digest of the very artifact the record exists to identify.

**Scope, and what deliberately did NOT change.** Only `producer_record`. `codeState.sha256` — the
Blender generator digest that `require_one_code_state` actually groups on — is computed inline by
`blender_tree.py` / `blender_land.py` at render time and is left alone: changing it would invalidate
every declared code state on the track and force refusals across passes whose pixels are correct. It
carries the same latent instability and that is now written down rather than fixed silently; it can
only ever produce a false REFUSAL across checkouts, never a false pass. The sibling increment
`render-sample-count-is-recoverable-from-provenance` still owns the sample-count half of
`provenance.py`, which this pass does not touch.

One-off churn to expect: the first re-render of any pass rewrites its sidecars' `producer.sha256`
under the new rule. That happens once.

---

## 6. Proof — every guard, and where each one can fail

```text
== the attribution ==
  the 2x2's top-left corner reproduces #1387's committed "before" EXACTLY   94 of 180
  the top-right reproduces the published 17.2% to within one placement      30 vs 31 of 180
  today the real island is at or BELOW the fixture                          6.1% vs 7.0%
  the decomposition ADDS UP, re-derived and not trusted                     36.7 + 8.3 + 6.1 = 51.1
  the dispersion fix is SPLIT, not credited whole                           8.3 + 0.0

== the signed prediction ==
  under LEGACY the loss concentrates on CROWDED cells        4.6% alone -> 40.6% at 3+
  a plant ALONE loses about the same either way              the positioner is not the variable
  under SPREAD the gradient COLLAPSES                        36.0 points -> 3.1
  the two islands have the SAME mean cell area               150.5 vs 152.0 ground units^2, so
                                                             plants-per-cell is the only difference
                                                             and the comparison is CONTROLLED
  THE CROSS-ISLAND CLAIM, which could have failed loudly     denser island == bigger gain

== what is LEFT ==
  no OUT-VOTED placement reaches the 5-of-9 threshold        best blocks hold 1,2,3,3,4
  reaching it is SUFFICIENT, without exception               167 of 167 and 107 of 107 deliver
  no surviving occlusion is a plant buried by its OWN cell   0; the rest is correct 2.5D occlusion

== the fourth site, re-measured LIVE rather than read from a report ==
  compose_dressed VENDORS NO COPY                identity of the function object, not equality
  and defines NEITHER switch of its own          so a guard cannot patch a name nothing reads
  its code calls no bare C.boundary_walls        the DURABLE fence form: what the file DOES,
  and carries no bare own-ground-y depth key     never "file X is UNEDITED"
  THE GUARD FIRES both ways                      32 -> 3 buried; 4803 -> 0 ground-equiv px
  the BARE land is still byte-identical          so nothing above is a second change

== determinism ==
  re-composing reproduces the measurement        compared as VALUES, never as PNG bytes
                                                 (0 of 22 files matched by bytes across two
                                                  pixel-identical runs on this track, #1379)

== provenance ==
  LF and CRLF checkouts hash IDENTICALLY         the defect #1387 hit
  and the check is NOT vacuous                   the raw byte digests DO differ
  binaries still hash RAW                        asserted against hashlib on a committed PNG

== the sibling README is honest ==
  every rate order-and-caps quotes is a rate its own report holds
                                                 the rung that would have caught the stale table

== the fence ==
  every path written is under docs/research/**
  no file here assigns LAND_CAMERA_ELEVATION_DEG
```

`verify.py` runs everything inside one `main()` whose every exception becomes a FAILED check, a
`REFUSED` report and a non-zero exit. That is not decoration: PR #1382's harness died on
`FileNotFoundError` before its guard and printed **five false passes**, and PR #1389's crashed inside
`ok()` on a list detail and mis-parsed a correlation as `None`, so a guard that fired perfectly read
as one that had not. A harness that cannot parse its own evidence must never be able to look green.

---

## 7. Honest gaps

1. **The guard is not wired to a `check:*` rung**, and will not be until the track comes out from
   behind the owner's `docs/research/**` fence — wiring it means editing `package.json` and
   `packages/cli/src/gate-order.ts`, both outside it. Unchanged from the order-and-caps pass's §6.
2. **Full compositor convergence is parked, not done.** Two rules now have one implementation; three
   ~700-line copies still exist and nothing detects the fork beyond those two rules.
3. **`codeState.sha256` carries the same line-ending instability** as the producer digest did, and is
   deliberately not fixed here (§5). It can only produce a false refusal, never a false pass.
4. **The out-vote threshold is asserted in one direction on the residual and both directions on the
   full run**, but the 5-of-9 boundary is a property of THIS downsample. Nothing here says what
   happens at another supersample.
5. **One island each, one seed, one camera, one piece set.** The co-tenancy gradient is measured on
   two geometries and not swept; the claim it supports is an ordering, not a coefficient.

## 8. One incidental repair, recorded because the shape recurs

The order-and-caps `verify.py` proved `LAND_CAMERA_ELEVATION_DEG` was still 20 with an **unscoped**
`git grep` over the whole repo — which matched **its own committed report**, so every run embedded the
previous run's copy of the match inside the next one and the field grew geometrically. It is now
scoped to `packages/forest-world/src` and `packages/app-surface/src`, which is where the claim it
makes actually lives. Reusable shape: *a check that writes its own findings into a committed file must
not search that file.*

## 9. Re-run log — everything this pass invalidated, and what it did to each

| pass | why | outcome |
|---|---|---|
| `chapter2-island-place-dressing-2026-08-16` | its compositor is the thing that was fixed | re-composed: 6 of 8 pictures moved, `island-bare.png` byte-identical by construction, `verify.py` **15/15**, `verify_refusal.py` all green |
| `chapter2-compositor-order-and-caps-2026-08-17` | `compose_core` was refactored (`walls_under_caps` extracted) and its README was stale | re-run **31/31**; every delivery number identical, so the extraction is proved behaviour-neutral rather than assumed |
| `chapter2-grass-reads-as-signal-2026-08-16` | `compose_core.py` edited | pixels unchanged (an extraction plus a docstring correction); its own committed pictures are untouched and were not re-composed |
| `chapter2-code-only-art-2026-08-01/blender-hero-v1` | `provenance.py` edited | no picture depends on the producer digest; sidecars pick up the new `basis` on their next write |
| everything else on the arc | not reached | untouched — no `pieces-*` file is in the diff, and no Blender render was run |
