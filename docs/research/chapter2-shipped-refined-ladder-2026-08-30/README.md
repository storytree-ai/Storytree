# The ground texture did not need the palette moved — it needed the ladder refined

2026-08-30 · `adopt-the-land-into-the-shipped-map-arc` · increment
`move-the-yellow-so-the-ground-texture-can-finish` · branch `claude/adoring-pare-ee23cb`

**In one sentence.** The increment this note belongs to was chartered to move the
`proposed`/`building` yellow away from `healthy`'s green so the ground texture's colour half could
run at full strength. Measured exhaustively, **no yellow does that, and no palette does that** —
the constraint was never the colours. It is how far the shade ladder REACHES, and what the texture
actually needed is more rungs on the ladder rather than any colour change at all. At the right
spacing that costs **nothing derived**: the reader's reference rung, the shadow rung and the
tightest reading margin are all unchanged to the last decimal.

Predecessor evidence: `chapter2-shipped-shadow-2026-08-30/` (the shadow crossing) and
`chapter2-shipped-grain-2026-08-30/` §3 (where the yellow/green tightness was first measured).

---

## 0. What the owner is being asked to look at

Two arms, differing in exactly one thing:

| picture | what it is |
| --- | --- |
| `shipped-shadow-8px.png` | **the map as it ships today** — relief, shade ladder, grain's normal half, occlusion field |
| `shipped-dense-8px.png` | **+ the ladder refined** to nine rungs at 0.025 spacing |

and both at `-2px` (the overview a laptop opens on), plus `-treed-8px`, which puts the island's
story tree back in the frame so the shadow has something casting it.

`shipped-grain-both-8px.png` is the REFERENCE arm and is what the increment was chartered to make
shippable: the ground with the grain's off-palette colour half at its authored 0.13. It is here to
be compared against, not adopted — §2 is why.

---

## 1. THE PREMISE, RESTATED — and it was already stale before it was refuted

The increment was written against a **four-rung** ladder. The shadow crossing (PR #1736) gave the
shipped material a **fifth**, derived rung at 0.77, sitting below all four — exactly where the
tightest reading margin already lived. `harness/grain-status-reading.ts` was still walking
`SHADE_LEVELS`, so every number it reported was about a ground the map had stopped drawing. That
instrument now walks the shipped ladder, and the numbers move with it:

| | four rungs (what the increment was written against) | five rungs (what ships) |
| --- | ---: | ---: |
| patches the ground can draw | 24 | **30** |
| tightest ungrained reading margin | 3.00 | **0.93** |
| where | `yellow@0.78` | **`yellow@0.77`** |
| patches the tint breaks at fac 0.13 | 4 | **6** |
| worst grained margin | −8.00 | **−9.30** |
| largest admissible tint | 0.031 | **0.006** |

**The tightest margin is 0.93 by construction, not by accident.** `deepestAdmissibleRung` derives
the shadow rung as *the deepest level that still reads honestly*, so it always sits on the edge and
always consumes whatever headroom the palette has. Any session hoping to buy tint headroom by
moving a colour has to know that the shadow's own derivation would spend it again.

Pinned in `harness/grain-status-reading.test.ts`, which also holds the old four-rung answers so the
change above is the ladder moving rather than the arithmetic drifting.

## 2. NO PALETTE ADMITS THE TINT — the search, and why it was never going to

Searched exhaustively, no GPU, on the restated five-rung ladder:

- **~5,000 candidate yellows** over an RGB grid (r 160–255, g 110–245, b 20–200): **zero** clear the
  floor at fac 0.13.
- **Green and yellow moved together**, a second coarser sweep: **zero**.
- **Synthetic maximally-separated palettes**, as a ceiling on the whole mechanism:
  red/green/blue/black/white → **−9.26**; a saturated hue wheel → **−4.94**; a pure luma ladder →
  **−39.62**.
- The **least-bad** yellow reaches −0.17 and is then bound by a *different* token
  (`unknown@0.76`) — the constraint simply moves. Whack-a-mole is the tell that it is structural.

**THE MECHANISM, and it is a property of the READER rather than of the palette.** The reader holds
ONE reference per token, at what LIT FLAT GROUND looks like — the only reference a viewer at a
glance can be assumed to have. So a rung spends margin by its DISTANCE FROM the reference, in both
directions. The margin curve peaks there and falls away to zero near 0.77 and near 1.10:

| level | 0.77 | 0.78 | 0.80 | 0.84 | 0.90 | 1.00 | 1.05 | 1.10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| min margin | 0.93 | 3.00 | 8.41 | 18.51 | **29.29** | 14.67 | ~5 | −0.82 |
| survives tint @0.13 | no | no | no | **yes** | yes | yes | yes | no |

The tint pushes each patch **9–17 weighted units**. So the admissible band for a tinted ground is
**levels [0.84, 1.05]** — and the shipped ladder reaches 0.77, with **three of its five rungs below
that floor**. That is the whole finding, and it is now a function, `admissibleLevelBand()`, with the
band and its overlap with the shipped ladder asserted as values.

## 3. WHAT THE TEXTURE ACTUALLY NEEDED — the density lever

The grain's normal half perturbs the lambert BEFORE quantisation, so on flat ground it can only
express itself as a **rung flip**. The excursion it produces is ~0.11 in lambert units, against rung
gaps of 0.02, 0.10 and 0.10 — so most of the island sits mid-band and never moves. That is why the
shipped texture reads as a speckle at band edges rather than as a continuous mottle.

| ladder | rungs | flat ground the grain moves |
| --- | ---: | ---: |
| shipped `[0.78 0.80 0.90 1.00]` | 4 | **14.4%** |
| even over `[0.80, 1.00]` | 6 | 51.3% |
| " | 8 | 65.1% |
| **`REFINED_LADDER`, 0.025 spacing** | **9** | **73.1%** |
| " | 12 | 77.1% |
| " | 16 | 82.8% |

Monotonic in density and saturating below 1 — some flat ground must keep its own rung or the
texture has replaced the shading it modulates. Pinned in `src/land-grain.test.ts`.

### ⚠⚠ 3a. THE SPACING IS 0.025 FOR A MEASURED REASON, AND GETTING THIS WRONG NEARLY PUBLISHED A DISHONEST ARM

The obvious refinement is 0.02 spacing from 0.78 — it is a strict superset of the authored rungs,
which sounds like the safest possible change. **It is not admissible, and the way it fails is the
one this codebase keeps meeting: a derived constant read against the wrong subject.**

Flat ground's lambert under the authored light is **0.9105**. On a 0.02 grid the nearest rung is
**0.92**, not 0.90 — so the reader's whole reference table shifts two points up. Against a 0.92
reference the darkest rungs sit further from their own colour than from a neighbour's, and
`#d8c069@0.78` reads as `#8cb85e`, margin **−1.36**.

Asked with `SHADE_LEVELS`' references — which is what the first pass here did — the same ladder
reports its tightest margin as **3.00, identical to today's**, i.e. completely free. One ladder, two
reference tables, opposite verdicts, and the wrong one is the reassuring one.

`landLadderHonest(lit)` is the check that closes it: it builds the references from the ladder being
judged, and **every arm on the comparison page is held to it**, so a future arm cannot smuggle a
misreporting ladder onto the page the owner decides from.

At **0.025** spacing the nearest rung to 0.9105 is 0.90, exactly where it is today. So the refined
ladder moves nothing derived:

| | shipped `SHADE_LEVELS` | `REFINED_LADDER` |
| --- | ---: | ---: |
| reference rung (flat ground) | 0.90 | **0.90** |
| derived shadow rung | 0.77 | **0.77** |
| tightest reading margin | 0.93 | **0.93** |
| rungs | 4 | 9 |
| flat ground the grain moves | 14.4% | **73.1%** |

It keeps 0.80, 0.90 and 1.00 and drops only **0.78** — today's darkest lit rung, and the one whose
margin was always thinnest.

**A `dense-lifted` arm was built and then withdrawn.** Its claimed 4.9× reading headroom was the
same wrong-reference figure; re-asked correctly it holds 1.46 against the refined ladder's 0.93,
which is not a trade worth putting to anyone.

## 4. WHAT THE PICTURES AND THE FRAME SAY — RTX 2060, Mint box, two runs

Both runs returned **identical medians on every row to four decimals**, and reproduced four
published controls: `flat@8` 0.0448 (published 0.0448), `banded@8` 0.0218 (0.0218), `grain-normal@8`
0.0909 (0.0909), `shadow@8` 0.0929 (0.0934). That agreement is what licenses reading the new row
against the earlier tables at all. Run 1 is committed beside this as
`shipped-refined-ladder-run1.json`; two of its rows carry ~0.22–0.27 ms spreads from the idle-clock
artefact this box is known for, and run 2's worst is 0.026.

**How much of the frame changes** — the refinement is by far the largest visible step since the
ladder itself, and unlike the shadow it lands at the OVERVIEW too:

| step | @2 px/unit | @8 px/unit |
| --- | ---: | ---: |
| `banded → grain-normal` | 15.9% | 15.8% |
| `grain-normal → shadow` (last landing) | 1.9% | 1.9% |
| **`shadow → dense`** | **45.3%** | **45.2%** |

**The palette closure holds and GROWS:**

| arm | distinct land colours delivered | authored entries | off-palette px |
| --- | ---: | ---: | ---: |
| `shadow` (ships) | 5 | 25 | **0** |
| `dense` | **10** | 50 | **0** |

At both zooms. `grain-both`, for contrast, delivers 186 distinct land colours.

**Frame cost**, run 2 medians, one draw call and 1,640 triangles in every arm:

| arm | @2 px | @8 px | % of a 60 Hz frame @8 px |
| --- | ---: | ---: | ---: |
| `flat` (`MeshStandardMaterial`) | 0.0038 | 0.0448 | 0.27% |
| `banded` | 0.0023 | 0.0218 | 0.13% |
| `grain-normal` | 0.0078 | 0.0909 | 0.55% |
| `shadow` (ships today) | 0.0080 | 0.0929 | 0.56% |
| **`dense`** | 0.0529 | **0.1005** | **0.60%** |
| `grain-both` (reference) | 0.0093 | 0.1078 | 0.65% |

The refinement is one more comparison in a chain the shader already walks, so it costs **8% more
than the ground that ships today** at the zoomed read — and relatively more at 2 px, where the whole
frame is cheap enough that a fixed cost dominates.

> ⚠⚠ **CORRECTED IN PLACE 2026-08-31 (ADR-0139): THE `dense` ROW DID NOT REPRODUCE.** Re-measured
> on the same box after the ladder was adopted, with both runs agreeing to four decimals, `dense`
> @8 is **0.1126 ms = 0.68%** of a 60 Hz frame rather than 0.1005 / 0.60%, i.e. **23% more than the
> ground it replaced** rather than 8%. Every other row above reproduced within 1.7%. The likely
> cause is that this run predates the bought-kit crossing, which changed the map's own key light
> and intensities. The 2 px figure held (0.0534 against 0.0529) and the paragraph above understates
> what it means: measured properly, the refinement costs **6.8x** at the overview zoom, and the
> cost is per-DRAW rather than per-fragment — it barely moves when the fragment count grows
> sixteenfold. Full working: `chapter2-shipped-adopted-ladder-2026-08-31/` §3a.

## 5. WHAT THIS DOES NOT SETTLE

- **Whether to adopt is the owner's call, and it is a LOOK decision.** The arithmetic says the
  refined ladder is honest and nearly free; it does not say the picture is better. Nothing is
  adopted here — `SHADE_LEVELS` is untouched and the shipped canvas passes no ladder, so what ships
  is exactly what shipped yesterday.
  > ⚠ **SETTLED 2026-08-30 and LANDED 2026-08-31.** The owner answered
  > `oq-which-shade-ladder-should-the-map-wear-and-the-yellow-doe` with "Adopt it." — option A, the
  > nine-rung ladder. `SHADE_LEVELS` IS those nine rungs as of 2026-08-31; this paragraph describes
  > the state on the day this note was written and is kept for that reason. The `dense` arm on this
  > page is now what the map draws by default, and the `banded` / `grain-normal` / `shadow` /
  > `grain-both` arms are pinned to `LEGACY_SHADE_LEVELS` so their medians above stay reproducible.
- **Whether the tint is still wanted at all.** If the refined ladder delivers the mottle, the
  off-palette colour half has nothing left to buy and `grain-both` can be retired rather than
  unblocked. That is a judgment on the pictures.
- **The props.** The shipped map still draws ONE of the 1,089 things standing on its ground, so
  contact darkening still delivers one pool here. Unchanged by this landing.
