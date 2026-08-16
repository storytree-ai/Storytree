# One healthy island, from a real story node — and what it replaces

**Date:** 2026-08-16 · **Camera:** 50° (a named parameter, inherited, not restated) · **Land:** the
interior fork's settled `b++`, interior mesh seams REMOVED · **Story:** `context-traversal-capture`,
read live · **Cost:** $0 · **Vendor calls:** 0 · **Blender renders:** 0

The owner, 2026-08-16, verbatim:

> *"your grown triangle grass doesnt look good enough yet, it looks buggy, and theres bvlack grass
> and ther colors bleeding through, the green on the land is not consistent either with different
> mesh trianles rendering different colors, and the mess lines as well add to the noise. I think all
> of this was okay in 2d, but in 3d its very noisy and doesnt make space for shadows which is one of
> the bigger wins of going 3d."*

then *"i think we focus on getting a healthy island looking right"*, and — the question this pass is
built around — **_"which story node did you pick anyways"_**.

**Nothing here is owner-attested.** Whether the island now reads right is the owner's look and this
page has no standing to make it (ADR-0070 stage 2).

## The headline, in four lines

1. **The story node was `fork-spike-island` — a fixture**, invented for the interior-fork spike on
   2026-08-15 and carried unchanged through every appearance judgment this arc has made: the grass
   pass (#1371), the hex-lines pass (#1372), the dressing pass (#1373).
2. **Its charcoal is not merely invented — it is a colour the app cannot draw.** The fixture's tenth
   capability is `unhealthy`, and `worldStatus` folds `unhealthy → mapped` (ADR-0296,
   owner-directed: *the world draws no withered form*). The shipped map has drawn no charcoal for any
   story, in any state, since that decision. Two of the fixture's five tokens are like this —
   `building → proposed` as well (ADR-0038).
3. **And no capability anywhere in the corpus is authored `healthy` — 0 of 244.** Green derives from
   a SIGNED VERDICT and never from authored paint (ADR-0040). A healthy story is found in the STORE,
   not in the frontmatter, and looking in the frontmatter is what would have sent this increment
   straight back to inventing statuses.
4. **The surface is now `context-traversal-capture`:** 11 capabilities, every one `healthy` off its
   own signed pass, 10 UAT criteria every one `proven`, real contract counts 4..7. Seams off, flat
   green, 50°.

## The pictures

| file | what it is |
|---|---|
| **`healthy-island.png`** | **THE SURFACE.** One real story, seams off, flat green. This is what the rest of the arc should be judged against. |
| **`fixture-vs-real.png`** | **WHAT IT REPLACES.** The fixture beside the real island, one code state, one camera. The charcoal on the left is the fabricated `unhealthy` capability. |
| **`seam-fork.png`** | **THE OWNER'S SEAM DECISION, EXECUTED AND RE-MEASURED.** As-shipped vs seams-off on the real island, one variable. |
| **`island-detail-6x.png`** | **JUDGE THE ART HERE.** The same crop at 6×, nearest-neighbour, so every block is one delivered pixel. Third panel carries the DECLINED grass at real contract counts. |
| **`green-consistency.png`** | **THE OWNER'S SECOND COMPLAINT, ISOLATED.** With every capability agreeing, the remaining colour variation is provably not status. |

## 1. Which story node — answered by census, not by preference

`census_healthy.ts` · `census.json`

Every story in `stories/**`, every capability folded through the app's own `provenStatus` against the
live store's signed verdicts.

| | |
|---|---:|
| stories | 46 |
| capabilities | 244 |
| **AUTHORED `healthy`** | **0** |
| **RENDERED `healthy`** (a signed pass, or a healthy gate that covers it) | **164** |
| fully-green stories that render on the map | **16** |

Those two rows are the whole reason this file exists. Reading the first and concluding *"there is no
healthy story in this corpus"* is the mistake that produces another fixture.

**The pick is `context-traversal-capture`, and the tie-break is the UAT tier.** Sixteen stories are
fully green at the capability tier. This is the only one **also** green at the UAT tier — all ten of
its criteria roll up `proven`. Under ADR-0226 D4 a flower IS a UAT criterion with its verdict read
from FORM, so on any other candidate every flower on the island would be a closed bud, on a picture
whose entire point is that it is healthy. `library-tech-tree-overlay` is larger (17 capabilities,
also fully green) and was rejected for exactly that reason: all four of its criteria are `pending`.

### The surface, in full

| | |
|---|---|
| story | `context-traversal-capture` — *"The real terminal CLI captures its own context reads to a replayable durable trace"* |
| story authored status | `proposed` |
| capabilities | **11**, rendered `healthy` × 11 |
| authored statuses | `proposed` × 11 — **not one is authored healthy** |
| verdict glyphs | ✓ × 11 — every capability carries its OWN signed pass; **none** leans on ADR-0097 gate coverage |
| contract counts | 4, 5, 4, 5, 5, 7, 7, 7, 7, 7, 6 — **64 total** |
| UAT criteria | **10**, every one `proven` |
| territory | **13 hexes** — the app's own `max(3, caps + 2)` quota, grown by its own frontier rule |
| interior | 162 relaxed mesh cells |

## 2. Mesh seams off — the owner's decision, executed and re-measured

`seam-fork.png` · report section `whatRemovalCosts`

Owner-decided 2026-08-16 (*"i think we remove the mesh lines"*). PR #1372 measured the MECHANISM on
the fixture and this pass does not re-open it; what it re-measures is the COST, because the cost is a
function of the status mix and this island has exactly one status.

**The stroke inventory reproduces on a real island.** The accounting is TOTAL — an unclassified
stroke is a refusal, not a bucket — so the zero means something:

| stroke class | times stroked |
|---|---:|
| coast | **1** |
| mesh cell | **162** (one per cell) |
| **hex tile** | **0** |
| unclassified | **0** |

| | this island | the fixture (#1372) |
|---|---:|---:|
| delivered px changed by removal | **1 892** | 2 221 |
| **share of the island** | **6.21%** | 6.35% |
| cell fills moved | **0 of 162** | 0 of 214 |
| palette widened | **no** | no |
| cross-capability boundaries | 69 | 77 |
| …going invisible | **31 (45%)** | 4 (5.2%) |

**Read the last row carefully — it is arithmetic, not a regression.** A boundary goes invisible
exactly when both sides deliver the same colour. On a one-status island every neighbour pair already
agrees, so the share had to rise. It is the honest cost of drawing a uniformly-healthy island without
seams, and it is why the increment asked for a re-measurement rather than letting #1372's number
carry over.

**6.21% against #1372's 6.35% is a cross-check worth naming**: two different islands, two different
cell counts, one compositor, and the seam's share of the land lands within 0.14 points. That is the
seam being a property of the mesh rather than of either fixture.

## 3. Why the green still is not consistent — with the status variable removed

`green-consistency.png` · report section `greenConsistency`

The owner's second complaint — *"the green on the land is not consistent either with different mesh
trianles rendering different colors"* — is usually read as a status-mix complaint, and on the fixture
it partly was. **This island removes the status variable entirely**, so whatever survives is provably
not semantic and can be attributed exactly.

| authored mechanism | cells | what it is |
|---|---:|---|
| `variant-0` | 44 | `STATUS_TOKENS[status]["top"]` is a THREE-shade list; each cell picks one **by hash** |
| `variant-1` | 48 | " |
| `variant-2` | 49 | " |
| **`wheat`** | **21 (13.0%)** | a deterministic subset of hexes tinted with the wheat token — a **TAN** cell on a green island |

**6 distinct delivered cell fills on an island where all 11 capabilities agree.** None of that
variation carries anything a reader could act on.

**MEASURED, NOT ACTED ON.** Whether to collapse the variant list, drop the wheat subset, or keep both
is an appearance decision and the owner's. This pass names the mechanism and its size; it does not
touch either, and it proposes no app change (see the fence).

## 4. The grass, at real contract counts

`island-detail-6x.png` panel 3 · report section `decorAtRealTestCounts`

**The grass art is DECLINED** — the owner looked on 2026-08-16 and neither shape was good enough, and
PR #1371 had already measured why no amount of tuning would have helped (a tuft is 61 opaque pixels
in Blender and 7 delivered; a custom-normal sweep repaints 90% of RAW pixels and changes ZERO
delivered ones). The delivered surface carries none of it.

It is rendered in one panel anyway, for one reason: the increment asks the render to be **driven by
the story's real test counts**, and `scatter.capability_tests` invents a count from a hash (its own
docstring says so; the dressing pass listed it as gap 3). Replacing it with `spec.contracts.length`
is what makes the density a reading of the work:

| | |
|---|---:|
| tufts | 143 |
| shrubs | 27 |
| wilts | **0** — the wilt is the status wilt, and nothing here is unhealthy |
| **UAT flowers** | **10** — exactly one per criterion (ADR-0226 D4), all `proven`, so all bloomed |
| centroid fallbacks | 0 |
| flower exhaustion fallbacks | 1 |

The count rules are the app's own and unchanged (`round(2 + tests·1.9)` and the status multipliers).

## THE FENCE — what this pass did not touch

**`LAND_CAMERA_ELEVATION_DEG` in `packages/forest-world/src/camera.ts` is still 20 and was not
touched.** It is `frontend-visual-judgment-arc`'s live dogfood fixture (owner, 2026-08-15 — *"i dont
want this fixed by any session"*). The research track's 50° is a named parameter that settles the
research track and nothing else.

The whole diff is `docs/research/chapter2-healthy-island-2026-08-16/**`. Asserted mechanically, not
promised: `verify.py` runs `git diff` + `git ls-files --others` and fails if anything outside
`docs/research/` moved, and separately re-reads `camera.ts` to confirm the constant.

**No Blender frame was rendered, and that is a proved property rather than a convenience.**
`blender_land.py` renders one sprite per variant-A shape class (six kites) plus 16 wall headings, and
those kite shapes are a property of the HEX LATTICE, not of which hexes a story claims. The composer
compares this island's six shape keys against the ones the committed pieces were rendered for and
REFUSES if they differ. They are equal, so **`blender_land.py` is neither edited nor re-run and the
interior fork's committed provenance is untouched.**

## Proof — the machine-checkable half (`verify.py`, 44/44)

```text
== 1. nothing on this island is invented ==     the increment's actual obligation
  every emitted capability / AUTHORED status / TEST COUNT re-derived INDEPENDENTLY from disk
  NO status outside the RENDERED vocabulary; every `healthy` backed by a SIGNED PASS
  0 of 244 capabilities corpus-wide are authored healthy (so authored green is not a route)
  every emitted UAT criterion id appears in the story spec; states are rolled up, not defaulted
  the tile quota is the app's own max(3, caps+2)
== 2. the fold is the APP's ==                  re-read from worldStatus.ts, not restated here
  building->proposed (0038) · unhealthy->mapped (0296) · pass->healthy is the ONLY green (0040)
  the FIXTURE painted ['building','unhealthy'] — tokens the map cannot produce
== 3. the story was CHOSEN by census ==         candidate, green at BOTH tiers, no gate-coverage lean
== 4. the prior passes are IMPORTED ==          no second compositor / scatter / seam control here
== 5. the fence ==                              LAND_CAMERA_ELEVATION_DEG still 20; diff in docs/research/**
== 6. the delivered pictures ==                 sidecars, one code state, total stroke inventory,
                                                0 cell fills moved, palette not widened,
                                                measurements exclude the hero tree
== 7. determinism ==                            re-composing reproduces all 5 pictures PIXEL-IDENTICALLY
```

**Determinism is asserted on the DECODED RASTER, never a file hash** — the house rule. Blender and
Pillow both stamp their own PNG container, so a naive file hash reports non-determinism that does not
exist.

## Every guard made to FIRE (`verify_refusal.py`, 14/14)

This pass's central claim is a NEGATIVE — *nothing here is invented* — and a negative is worth
exactly as much as the instrument that failed to find anything.

```text
PASS  an INVENTED status (`unhealthy`) is REFUSED, not drawn
PASS  a `healthy` cell with NO signed pass is REFUSED (ADR-0040's wall)
PASS  a proof.json read for ANOTHER story is REFUSED
PASS  island.json / proof.json / island_pass.STORY_ID must name ONE story
PASS  a land piece set that does not describe this island's geometry is REFUSED
PASS  the hex detector is ARMED — 78 candidate rings, fires at all 6 cell heights,
      DISCRIMINATES a real cell, classes the coast, and REFUSES an unrecognised ring
PASS  a ONE-PIXEL drift from the shipped compositor is CAUGHT (and clean again after)
PASS  two directories from ONE generator at different states still refuse,
      while two DIFFERENT generators compose fine
```

## Four things this pass got wrong first, each caught by its own instruments

Recorded because each is a live trap for the next pass, not for confession's sake.

**1. Reducing the store to "has its own signed pass" is NOT the app's rule, and it under-counted the
green corpus.** ADR-0097 §5 (owner decision 2026-06-25, Option A) greens a brownfield capability
through a HEALTHY reliability gate that `(covers:)` it, via that gate's signed verdict. The first
census reported **125** rendered-healthy where the real fold gives **164**, and disagreed with
`storytree tree --pg` on four stories. Wrong in the *safe* direction, which is exactly the kind of
wrong that survives review. Fixed by IMPORTING `rollupCapStatus` rather than reducing by hand — the
proof half is now the orchestrator's own compute, and only the small presentation fold is a port.

**2. Every per-cell measurement ran on a composite carrying the hero tree.** The tree is composited
ON TOP of the land at 1:1, so a cell whose projected centroid falls under the canopy had trunk pixels
as its modal "land fill". It painted browns into the swatch strip — which is how it was caught — but
the part that mattered was the boundary cost counting two cells as delivering the same colour when
what they had in common was the trunk covering both. Seam cost moved **4.87% → 6.21%** once the
instruments ran tree-less. The delivered pictures keep the tree; only the measurements lose it.

**3. THE REFUSAL HARNESS REPORTED FIVE FALSE PASSES, and the failure is the one it exists to
prevent.** Its first version copied `compose_healthy.py` into a temp directory, which re-rooted the
module's `HERE` so it could no longer resolve the prior passes. All five guards "fired" with
`FileNotFoundError` from an import, having never reached the thing under test — and a `fires()` that
accepted ANY exception reported them green. **A harness that cannot fail is worth no more than a
guard that cannot.** Fixed twice over: the module now runs REAL, in its real directory, through
environment overrides for its inputs and its output directory (so a guard that fails to fire writes
its perturbed pictures to a scratch directory rather than over the delivered ones); and a fire counts
only when the message carries the refusal it was supposed to raise.

**4. An "independent" check that agrees by construction is worth nothing — and this one failed twice
before it was independent.** `verify.py` re-counts each capability's contracts from the markdown
rather than asking `loadNodeSpec` again. It first missed them entirely (the corpus writes a NUMBERED
list, not bullets), then double-counted every one (7 → 14) by also matching the `- **asserts —**`
bullets nested under each item. Both times it failed against a CORRECT emitter, which is the right
way round.

## What was found and NOT fixed

**The track has three copies of a ~700-line compositor, and nothing detects the fork.**
`compose_dressed.py` (dressing, #1373) was vendored into `compose_core.py` (grass, #1371) and has
since diverged; `compose_lines.py` (hex lines, #1372) then IMPORTED rather than copied, closing the
gap forward. `scatter.py` exists in two directories and is currently byte-identical — with nothing
watching it. **This pass adds no fourth copy** (it imports the grass pass's compositor and scatter
and the hex-lines pass's seam control, asserted by `verify.py` check 4), and it reports the existing
divergence rather than repairing it: both copies are committed evidence of landed work and rewriting
them is not this increment's business. `verify.py` hashes the two `scatter.py` copies and will say so
when they diverge — one line, which is one more than exists today.

## Reproduce

```text
npx tsx census_healthy.ts                                    # the whole-corpus pick (needs the live store)
npx tsx emit_proof.ts --story context-traversal-capture      # the signed verdicts   (needs the live store)
npx tsx emit_healthy_island.ts --story context-traversal-capture   # the island geometry (offline)
python compose_healthy.py                                    # 5 pictures + report + sidecars
python verify.py [--fast]                                    # 44 checks
python verify_refusal.py                                     # 14 guards
```

The composers need system Python with numpy + Pillow. **`bpy` from PyPI is not a route on this
machine**; this pass needs no Blender at all.

## Honest gaps

1. **There is no owner LOOK.** Nothing here is attested. Whether the island reads right is exactly
   the judgment this page must not make.
2. **The island's OUTLINE is its uncontested shape.** The app's tile packer is a MULTI-island packer:
   other territories own hexes and seeds are nudged apart by a growth floor, so on the real map a
   story's shape is also a function of its neighbours. A single-island research surface has none, so
   this grows from the origin into empty ground. The cost function and hash address are the app's,
   so the outline still varies with the story id — but it may be rounder than the shape this story
   takes on a crowded map.
3. **The capability Voronoi seeds are scattered, not laid out.** The app seeds each parcel at its
   capability's laid-out position inside the territory (`capToParcel`), which comes from a layout
   this surface does not run. The seeds are hashed off the capability's own id instead — the app's
   own idiom for anything parcel-shaped — so a capability keeps its patch across runs and angles,
   but the PARTITION is not the one the map would draw.
4. **The presentation fold is a PORT, not an import.** `worldStatus.ts` lives in a browser-bundled
   React module behind a Vite alias graph. `verify.py` check 2 re-reads that file and asserts each
   clause, so the copy is checked against its original on every run — but it is still a copy.
5. **`cell_modal_fill` centre-samples rather than majority-downsampling.** The two disagree only in
   blocks straddling a boundary, and on a small cell a 5×5 centre sample can still pick up a
   neighbour — which is the likeliest reason the `wheat` bucket reports a green among its colours.
6. **The green metric is not comparable to #1372's.** That pass reported 21.6% from a per-status
   pixel table; this is a direct channel test over the whole land with the tree excluded. What IS
   comparable is the pair reported here — both islands measured by this same instrument, in one run.
7. **One island, one seed, one camera, one zoom.** The pixel shares are this island's; the direction
   of each finding is structural.
8. **Nothing here proposes an app-side change**, and the two findings that most obviously imply one
   — the seam removal and the wheat/variant colour spread — are written down as findings precisely
   because the owner's 2026-08-16 directive fences this work out of the app: *"this should just be a
   research pass on a single island, we still dont have flowers etc, isolate this away from the main
   app until we ready"*.
9. **No cast shadows** — the thing the owner named as *"one of the bigger wins of going 3d"*. Pieces
   are rendered in isolation, so a shadow would have to be an app-side pass; the interior fork
   reached the same conclusion. Removing the seams is what makes ROOM for one, which is the most this
   pass can contribute to it.
10. **The `wilt` piece never appears**, because nothing on this island is unhealthy — and under
    ADR-0296 nothing on any island can be. That branch of the vocabulary is now unreachable in the
    world, which is worth noticing as a fact about the art rather than about this island.
