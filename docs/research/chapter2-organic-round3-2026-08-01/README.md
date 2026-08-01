# Chapter 2 organic growth — Round 3 (2026-08-01)

Arc: `chapter2-pixellab-organic-growth-arc`. Eight parallel PixelLab experiments, each adversarially
reviewed, then synthesised into one ranking.

## What was asked

Ten prior candidates had been judged and nine rejected. Two questions were **closed** going in: the
island (experiment 6's connected SVG accretion is the recorded lead, reused unchanged as the control
here) and the small plants (ADR-0277 D2 retains the registered cutout/pose technique). One question
was left open, and it is the only thing round 3 was called to settle:

> **A hero tree whose trunk and canopy read as ONE CONNECTED ORGANISM while it grows.**
> Every recorded failure has been the same failure — a separately authored crown attached to a
> separately authored trunk reads as a seam, gap, blob, floating canopy or pasted-on crown.
> Mechanical registration has been proven insufficient: **continuity must come from how the art is
> GENERATED, not from how it is aligned.**

A second requirement rode along: **path growth**, missing from every prior mock. The engine already
has the machinery (`arrivalGrowPlan`, `REVEAL_STAGGER_MS`, the `reveal` field, the per-segment trail
masks); the Chapter 2 witness simply never wired it. Every experiment had to propose a treatment.

Hard constraints throughout (ADR-0274 / ADR-0277 / ADR-0219 / ADR-0237): PixelLab is author-time only,
no vendor call or asset-owned clock reaches the repo or the browser, no generated land or coast or
composite, fixed canvas and frame order, one stable root socket, measured — not claimed — root drift,
and the app camera is authoritative (the plate is **low top-down / 2.5D isometric**).

## The eight techniques

| id | technique in one line |
|---|---|
| `exp-11-in-context-inpaint` | Draw the tree **inside the real island plate** with `create_map_object` / `inpaint_image`, then extract it — so it inherits the plate's own camera, light and palette by construction. |
| `exp-12-chained-ladder` | A **descent chain**: each rung is `create_image_pixflux` img2img from the previous rung at high preservation strength, so every frame is a direct descendant of the one before it. |
| `exp-13-crown-inpaint` | Author one trunk raster, then **inpaint each successive crown into that same raster** — trunk and canopy are never separate images, so there is nothing to register. |
| `exp-14-pro-reference` | `create_image_pro` with up to four **labelled reference images** carrying the previous stage forward, betting that the reference chain preserves identity across stages. |
| `exp-15-object-rig-v3` | One `create_1_direction_object` **rig**, two `create_object_state` poses (sapling and mature), and a 16-frame `animate_object` **v3 interpolation** between them. |
| `exp-16-leader-repair` | Take the **round-1 provisional leader** and repair its two named defects — the mass cliff at 05→06 and the ground fragment in the mature poses — extending it to 19 frames from a true seedling. |
| `exp-17-reverse-ablation` | **Reverse ablation**: start from one finished mature drawing and progressively *remove* canopy backwards, so every younger frame is a strict subset of the same organism. |
| `exp-18-topology-eroded-prior` | **Erode a mature prior** into per-age deterministic priors, then re-generate each age from its own prior at a tuned strength, so topology is inherited but the art is genuinely redrawn. |

Every experiment directory holds `raw/` (unmodified model returns), `frames/`, `contact-sheet.png`,
`preview.gif`, a measured `README.md`, and a `path-growth.md` proposal.

## Where the ranking lives

**[`RANKING.md`](./RANKING.md)** — the synthesis. It contains:

1. A ranked table of all eight on the open question, plus style match to the SVG island, camera
   correctness, motion quality and root stability, with the supporting measurements.
2. The top three recommended for a hosted in-app comparison lab, and exactly which axes each beats
   the round-1 provisional leader on.
3. What to drop outright, and what to keep from each dropped experiment.
4. One consolidated, implementable path-growth treatment naming the real machinery.
5. An honest "what round 3 did not solve".
6. Every reviewer/README discrepancy found, including the ones the reviewers missed.

**Headline result:** ranked order `exp-15 > exp-16 > exp-18 > exp-12 > exp-17 > exp-13 > exp-11 > exp-14`.
Host exp-15, exp-16 and exp-18. exp-15 beats the incumbent on how it *moves*; exp-16 beats it on how
it *looks* and where it *starts*; neither beats it on both. And the finding that reframes the round —
the incumbent the owner already likes ships **detached pixels on four of its nine frames**, so
"one connected component" is hygiene, not the verdict.

## Generation spend

The shared subscription pool ran from **~1771 generations at round start to 31 of 2000 remaining** —
approximately **1,740 generations consumed across the eight experiments**. The pool was exhausted
before the round finished: `exp-12`'s second `create_path_tiles` call hard-failed in flight with
*"You have run out of generations and credits"*, and `exp-16` stopped work at 31 remaining.

Per-experiment figures are mostly estimates, because the API does not itemise cost per call:

| experiment | recorded / estimated | basis |
|---|---|---|
| exp-11 | ~420–840 | 21 calls; unattributable pool delta of 1694 (concurrent experiments) |
| exp-12 | ~58–78 | 38 pixflux (1 each) + 1 `create_path_tiles` (unpriced) |
| exp-13 | ~450–890 | 22 `inpaint_image` + 9 pixflux |
| exp-14 | 450 (arith.) | 18 calls × 25 generations; no receipt — true range 360–720 |
| exp-15 | 53 confirmed + 5 uncosted calls | API-confirmed for 5 of 10 calls |
| exp-16 | ~176 | recorded |
| exp-17 | ~223 | recorded, **including ~60 wasted** on duplicate submissions with lost job ids |
| exp-18 | 54 | recorded, fully itemised |

The per-experiment claims sum well above the actual pool drawdown, which is itself the honest
takeaway: **only exp-18, exp-16 and exp-17 recorded spend accurately enough to reconcile.** A round 4
needs a top-up and per-call cost capture.
