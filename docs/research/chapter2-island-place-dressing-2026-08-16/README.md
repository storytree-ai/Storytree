# Does one island read as a PLACE? — the component art, rendered

**Date:** 2026-08-16 · **Blender:** 5.2.0 LTS, headless, CPU Cycles, seed 20260816 · **Camera:** 50°
· **Land:** the interior fork's settled `b++` · **Tree:** the committed `code-blender` mature frame
at 50° · **Cost:** $0 · **Vendor calls:** 0

The owner's directive for this pass, verbatim: *"this should just be a research pass on a single
island, we still dont have flowers etc, isolate this away from the main app until we ready"*.

The track had settled the land's **structure** (interior fork → `b++`) and its **camera** (elevation
sweep → 50°, owner look verdict 2026-08-16: *"50 degrees looks good, i think we go with this"*). Both
delivered a correct island with nothing growing on it. This pass builds the missing component art.

> ## ⚠ THE OWNER HAS SINCE LOOKED, AND THE GRASS WAS DECLINED. READ THIS FIRST.
>
> This page is **evidence of what was tried**, not a proposal awaiting adoption. What happened after
> the pass, in order:
>
> 1. The owner looked and said **"grass looks rather ugly"**.
> 2. A follow-up pass (**PR #1371**, merged — evidence in
>    [`docs/research/chapter2-grass-reads-as-signal-2026-08-16/`](../chapter2-grass-reads-as-signal-2026-08-16/))
>    measured why, and its answer supersedes any shading
>    hypothesis this page reaches for: **a tuft is 61 opaque pixels in Blender and 7 delivered
>    pixels.** Custom normals were built and swept 0.00 → 1.00; the lever demonstrably fires — 90% of
>    RAW pixels repainted at full strength — and changes **zero delivered pixels at every setting**.
>    **Geometry and silhouette are the only lever** (clumping the blades takes 7 px → 18 px).
> 3. The owner then **declined both grass shapes** — ADR-0280 D4's honest *"none of these is good
>    enough"* — and directed **flat green** for the ground.
>
> So the density question below is **closed, not open**, and this page makes no ask of the owner. The
> measurements are kept in full because they are why the decline is well-founded rather than a matter
> of taste, and because two of them (§ *Measurements* and traps 2–4) are about the RENDER PIPELINE and
> outlive the art entirely.
>
> The UAT flowers were not part of that decline; only the grass was judged.

**Nothing here was owner-attested at the time of writing.** The camera angle was separately settled;
the art was not, and has since been declined as above.

## THE FENCE — what this pass did not touch

**`LAND_CAMERA_ELEVATION_DEG` in `packages/forest-world/src/camera.ts` is still 20 and was not
touched.** The angle being settled for the *research track* is not the app adopting it: the app-side
constant is the live dogfood fixture for `frontend-visual-judgment-arc` (owner, 2026-08-15 — *"i dont
want this fixed by any session"*), and moving it would destroy that experiment.

The whole diff is `docs/research/chapter2-island-place-dressing-2026-08-16/**`. Asserted mechanically,
not promised: `verify.py` check 7 runs `git diff` + `git ls-files --others` and fails if anything
outside `docs/research/` moved.

**The angle is a NAMED PARAMETER, not a literal.** It enters once (`dressing.PASS_ELEVATION_DEG`) and
flows outward through `island.json`; no file downstream declares an angle of its own, and each asserts
that the angle it was handed matches what its inputs were rendered at. `python render_all.py --elev 45`
rebuilds the entire pass at another angle with no source edit. That property is part of the
deliverable — it is what lets the owner keep pricing angles as renders rather than as decisions.

## The headline

**The missing art was never "flowers". It was that the vocabulary the app already DECIDED has never
been rendered as anything but flat SVG strokes.**

ADR-0226 (accepted 2026-07-21) fixed a single vegetation language, and it is deliberately narrow:

| the art | what it MEANS | ADR-0226 |
|---|---|---|
| grass | a capability's **tests** | D2 |
| grass colour / dead grass | that capability's **status** (the wilt) | D3 |
| a flower | the story's **UAT** — one per criterion, exactly 1:1, the **verdict read from FORM** | D4 |

Getting there **retired** the decorative wildflower, anemone and heather-bell accents, *"so a flower
means UAT and only UAT"*. So the obvious reading of the directive — scatter some nice flowers — is the
one thing this pass must not do. Adding decorative species would re-commit the ADR-0367 D5 failure
(art saying something the meaning layer does not authorise) one level up from the palette bug the
interior fork caught.

**This pass therefore adds no member to the vocabulary. It renders the existing one in 3D and asks
whether that is enough to make an island read as a place.**

## The pictures

| file | what it is |
|---|---|
| **`dressing-layers.png`** | **THE COMPARISON.** Bare → + meadow → + UAT flowers. One island, one piece set, one code state. The bare panel is the track's own delivered land, unchanged. |
| **`island-dressed-detail.png`** | **JUDGE THE ART HERE.** The same crop before and after at 5×. At 1:1 a grass tuft is about three pixels — a component is judged where it stands, against the land's own palette, never on a piece sheet. |
| **`dressing-density.png`** | **THE QUESTION FOR THE OWNER.** The app's authored grass counts, then ×3 and ×6. The UAT flowers deliberately do not scale. |
| **`status-vocabulary.png`** | **THE MEANING.** Every capability driven to one status in turn — nothing moves except what the land is saying. |
| `components.png` | the 11 pieces at 5×, each in one representative token set, on a board. |
| `island-bare.png` `island-meadow.png` `island-dressed.png` | the three composites at 1:1. |

## What component art was added

**11 pieces**, against the land's 22. Every one is forest-wide by construction — none depends on an
island's outline or on any cell's shape, the same property that makes the rim pieces reusable.

| piece | count | what it is | indexed by |
|---|---:|---|---|
| `tuft-2` `tuft-3a` `tuft-3b` `tuft-4` | 4 | grass, at the app's own blade counts (2 for an `unknown` capability, 3 ordinarily, 4 for a lush one) | kind × variant |
| `shrub-a` `shrub-b` | 2 | `parcel-shrub`'s dome — three dark under-lobes carrying two lit crown lobes | kind × variant |
| `wilt-twig` `wilt-stem` | 2 | the status wilt, both of the app's sub-forms: a fallen twig and a drooping stem | kind × variant |
| `flower-proven` `flower-pending` `flower-failing` | 3 | ONE UAT criterion, the verdict read from form: bloomed daisy / closed bud / drooping | verdict |

Proportions are the app's own, not re-invented: blade height `(unknown ? 2.6 : 3.4) + rand()*2.4`,
blade width 1.5 ground units, flower height `12 + rand()*4` with a 5.2-unit head, the failing flower's
petals hanging into their 112°–248° arc, leaves at stem fractions 0.34 and 0.6.

### What was deliberately left OUT, and the dated owner call that already refused each

This is the more important half of the list. Each of these is what an unfenced "make it prettier" pass
would obviously have added.

| not added | why — this is not taste |
|---|---|
| **decorative flowers** (wildflower / anemone / heather-bell) | RETIRED by ADR-0226 D2 to make a flower mean UAT and only UAT. Adding them back makes the UAT signal unreadable. |
| **rocks, stones, boulders** | rejected **twice** — as *"noisy/colliding"* (#832, 2026-07-18), then as *"messy and noisy rather than cosy"* (owner, 2026-07-20). |
| **a glow on the proven bloom** | the app draws two low-opacity discs; through a closed-palette snap and a majority downsample those become a hard ring, i.e. the *"sparks"* read the owner's noise complaint already refused. It belongs to the app's SVG layer — the same conclusion the interior fork reached about the interior lighting plate. |
| **a human-witness signpost** | retired by ADR-0226 D5. |
| **bigger art so it reads better** | the 2026-07-23 owner verdict on baked sprite art was that it read *"way too big"*, and the rule drawn from it is that a rendered component derives its size from the vector body it replaces. Whether the art reads at the delivered scale is a MEASUREMENT this pass owes (below), never a licence to inflate it. |
| **shoreline/beach planting** | the app authors no vocabulary for it. Inventing one is a story-author question, not an art one. |

## The rejection this pass is most exposed to, answered in geometry

On **2026-07-22** the owner looked at a **baked 3D flower** (`uat-flower.ts`, inc 14, PR #862) and
rejected it: *"over-complicated"*, with a *"horizontal head"* that *"looks odd"*. It was parked and the
simpler flat flower kept. **This pass renders baked flowers, so that verdict is aimed directly at it.**

The diagnosis that matters is the horizontal head. A flat SVG flower draws its head face-on in SCREEN
space, so the reader always sees a daisy. Model the same flower in 3D with its head in the GROUND plane
and the camera sees an ellipse edge-on — the head stops reading as a face and starts reading as a lid.

**So the flower head is built CAMERA-FACING (billboarded), while the stem and leaves keep real 3D
form.** The tilt is derived from the island's own camera (`90° − elevation`), so the head stays face-on
at whatever angle the pass is authored at rather than being tuned to 50° and breaking at 45°.

**This is a hypothesis offered for the owner's look, not a claim that the rejection is answered.** The
owner rejected a specific asset for a specific read; whether this geometry avoids that read is exactly
the thing only a look can settle.

## Measurements

### How much ground cover does one test buy? (`dressing-density.png`)

The honest statistic is the share of DELIVERED land pixels the decor occupies **after** the majority
downsample — art that survives at supersampled resolution and loses every majority vote at the
delivered scale has bought a reader nothing.

| density | placements (meadow + UAT) | decor px | share of delivered land | survived the downsample |
|---|---:|---:|---:|---:|
| **×1 — the app's authored counts** | **111 + 6** | **353** | **1.01%** | 95.9% |
| ×3 | 333 + 6 | 689 | 1.97% | 95.1% |
| ×6 | 664 + 6 | 1 016 | 2.91% | 94.7% |

**At the app's own authored density the dressing occupies one percent of the island.** That is the
pass's central finding and it is not a defect in the render — it is what the authored counts produce
at the delivered scale.

**The curve is sublinear: six times the placements buys 2.9× the pixels.** Two plausible causes were
measured and BOTH REJECTED, which is why the third is worth believing:

- **Palette collapse — REJECTED.** A tuft is only visible if its blade token survives the snap as a
  different entry from the ground under it, and both are authored tokens from the same app (on a
  healthy parcel a `#71a154` blade stands on `#7dab50` ground — neighbouring mid-greens, with a closed
  palette running last). **0 of 12** (status × blade-role) combinations collapse. Kept in the report
  precisely because it was rejected: it is the explanation a reader reaches for first.
- **The majority downsample — REJECTED.** **94.7–95.9%** of the decor's ground-equivalent coverage
  survives it at every density.
- **Self-overlap in the scatter — the remaining cause.** Per-placement contribution falls from 3.1 to
  1.6 delivered px between ×1 and ×6: the scatter picks a cell uniformly per item, so at high density
  items pile into the same cells and cover ground already covered. **The actionable consequence: more
  coverage needs better-DISTRIBUTED placement (a per-cell quota or blue-noise), not more items.**

**What this implies for the look:** at any density reachable this way the ground cover is a few
percent of the island, so whatever "reads as a place" the pictures achieve comes from the **flowers
and shrubs as silhouette events**, not from grass coverage.

**This is the finding the decline rests on, and PR #1371 sharpened it into the general rule.** The
sublinearity here says *more grass does not buy coverage*; #1371 then measured that **more SHADING
does not buy anything either** — a tuft is 61 opaque pixels in Blender and 7 delivered, and a custom-
normal sweep that repaints 90% of RAW pixels changes zero delivered ones. Together those two say the
same thing from opposite directions: **at this component size the only lever that moves a delivered
pixel is GEOMETRY/SILHOUETTE** (clumping takes 7 px → 18 px). Neither count nor shading is a lever.
That is why "make the grass nicer" was not a fix available to any amount of tuning, and why the owner
declining both shapes and directing flat green is the honest end of this line rather than a rejection
of an implementation detail.

### The vocabulary is a reading of the work (`status-vocabulary.png`)

| status | placements | land colours |
|---|---:|---:|
| healthy | 148 | 47 |
| building | 148 | 47 |
| proposed | 62 | 45 |
| mapped | 109 | 44 |
| unhealthy | 148 | 46 |

Same island, same piece set, same code state — only what the land is SAYING changes. `proposed` carries
less than half the placements of `healthy` because a proposed capability has fewer tests, which is the
vocabulary working rather than a rendering difference.

### The delivered island, per capability

10 capabilities, 214 cells, 117 placements: 99 tufts, 10 shrubs, 2 wilt, 6 UAT flowers. Land colours
60 (bare) → 72 (meadow) → 79 (dressed), on a 132-entry closed palette. 0 centroid fallbacks, 0 flower
exhaustion fallbacks.

## Proof — the machine-checkable half (`verify.py`, 15/15 green)

The look is an owner attestation. These are the claims a session may assert for itself.

```text
== 1. determinism ==
PASS  scatter: re-running the placement is identical                    117 placements
PASS  scatter: changing the UAT criteria moves NO meadow placement      111 unmoved
PASS  render: every decor piece re-renders raster-identical             11/11 pixel-identical
PASS  composite: two runs are byte-identical

== 2. the per-cell status tint stays expressible (ADR-0367 D5) ==
PASS  (a) no rendered decor piece contains ANY island token colour
PASS  (b) all five statuses render from ONE decor piece set
PASS  (c) permuting the statuses repaints the island and moves no piece

== 3. the palette is a FULL closure ==
PASS  every (decor token x authored shade) pair is IN the closed palette   46 decor entries
PASS  every decor piece's roles fit inside ONE token family variant

== 4/5. the land is UNCHANGED, and the copied blit is the shipped blit ==
PASS  compose_dressed's land pass is byte-identical to the shipped compose.py
PASS  paste_decor reproduces C.paste_piece exactly on a two-role piece

== 6/7. the vocabulary, and the fence ==
PASS  exactly one flower per UAT criterion (ADR-0226 D4)
PASS  the density dial scales the meadow and NEVER the UAT flowers
PASS  every placement stands on a land cell (no decor in the water)
PASS  the working tree's changes are confined to docs/research/**
```

**Determinism is asserted on the DECODED RASTER, never the file.** Blender stamps its own PNG
container, so all 11 files differ byte-for-byte on every re-render while the images are identical — a
naive file hash reports non-determinism that does not exist.

**The tint proof does not rest on inspection.** Check 2(a) is load-bearing: a decor piece emits band
KEYS and contains no island token colour at all, so a status cannot have been baked into it. Which
colour a key becomes is looked up per placement. 2(b) and 2(c) are then consequences.

**A stronger property than the land's, worth naming:** every band key inside one piece resolves to a
token from ONE family — a single capability's status, or a single UAT verdict. So an antialiased
fringe pixel can only ever land on a neighbouring shade of the right thing. It structurally cannot do
what the interior fork's missing palette entry did, which was repaint an `unknown` rim in another
status's green.

## Both guards made to FIRE (`verify_refusal.py`)

A guard only ever observed passing is indistinguishable from one that cannot fail.

```text
PASS  the composer REFUSES two land directories at different code states
PASS  two DIFFERENT generators at their own states compose fine
PASS  assert_land_unchanged CATCHES a one-pixel drift in the land pass
PASS  and the land pass is clean again once the perturbation is removed
```

## Four traps this pass hit, each measured

**1. The shared one-code-state guard refuses every correct run of a TWO-GENERATOR composite.**
`provenance.require_one_code_state` groups input directories by declared digest and refuses when two
disagree — right for the shape it was written for, where every cell comes from one generator. This is
the track's first composite built from two: the land pieces declare `blender_land.py`'s digest and the
decor pieces `blender_decor.py`'s. They disagree *by construction*. It refused on the first attempt.
Fixed by grouping inputs by the generator each names and running the shared refusal **within** each
group, which keeps the teeth — two land directories at different states still refuse, proved above.
**Reported here rather than changed in `provenance.py`**, because that module is shared with the hero
track and this is a new usage shape, not a defect in it.

**2. Two sub-pixel polygons carrying different band keys classify ARBITRARILY.** The app draws a grass
blade as a wide dark back path under a narrow light front path. Modelled literally, at the app's own
widths (1.5 and 0.56 ground units), the front strip is under two supersampled pixels wide, so Cycles
blended the two keys and the blade rendered **magenta** — a colour lying exactly equidistant between
the red and blue keys, which the nearest-key classifier then resolves by argmin tie-break rather than
by what the surface is. Most of the blade, not a fringe. Replaced by ONE twisting ribbon shaded across
three bands: same read, no overlapping geometry, and the only blended pixels left are at the
silhouette where the neighbour is transparency. Residual ambiguity is now 0.6–16.7% of a piece's
pixels (2–7 px on a 26–42 px tuft) and is confined to that silhouette.

**3. Cycles ADAPTIVE SAMPLING makes a render a function of SYSTEM LOAD — and it failed in the
direction that hides.** `verify.py` found 2 of 11 pieces re-rendering with differing pixels, and only
when the re-render ran while the box was busy with another compose. These are flat emission shaders
with no noise to converge, so there is no quality argument either way; what adaptive sampling adds is
a per-pixel sample count decided from a running noise estimate, which is sensitive to tile scheduling
and therefore to spare threads. **A determinism check on an idle box passes and the pieces drift only
when someone happens to be running something else.** Fixed at the source (`use_adaptive_sampling =
False`), then re-tested *under a concurrent compose* — the exact condition that produced 9/11 — and it
now returns 11/11. Note the first "fix confirmed" run was itself an idle-box run and proved nothing;
the load test is the one that counts.

**4. A guard can pass because the test perturbs BOTH sides.** The first version of the land-drift
falsification patched `C.fill_polygon` outright — which perturbs this pass's land pass *and* the
shipped `C.compose` it is compared against, so the two canvases moved together and still matched. The
guard "passed" a compositor that was drawing the wrong thing. That is not a hole in the guard; it is
its actual SCOPE made visible — comparing two paths that share every primitive can only catch drift in
the part that DIFFERS, this pass's own draw-list assembly, because the shared primitives are literally
the same function objects. The test now holds the shipped side clean and perturbs only the copy.

## Reproduce

```text
python render_all.py                 # the whole pass at the authored 50 degrees
python render_all.py --elev 45       # the same pass at another angle, no source edit
python render_all.py --skip-land     # decor + compose only (the fast inner loop)

python verify.py                     # 15 checks; --fast skips the Blender re-render
python verify_refusal.py             # make both guards fire
```

`blender_decor.py` runs under Blender's bundled Python; the composers need system Python with numpy +
Pillow. `bpy` from PyPI is not a route on this machine. The decor render is 11 images in about 12
seconds.

## What the code owns (ADR-0280 D1 / ADR-0367 D2-D3, unchanged)

- **The script is the source of truth.** No `.blend`, no sculpted mesh, no imported asset, no vendor
  call. `island.json` is generated by a committed script and never hand-edited.
- **The geometry and the land renderer are the sibling spike's, INVOKED not copied** — `emit_island.ts`
  imports the shipped `buildRelaxedCells`/`smoothCoast`, so there is no second copy of the island.
- **The camera is read, never restated.** It flows from `island.json` into the Blender camera and the
  compositor's projection; three separate assertions check that the land pieces, the decor pieces and
  the tree registration all record the same angle.
- **The light is the hero tree's own key direction, reused verbatim** — now by a third consumer. Land,
  object and ground cover share one light as much as one camera.
- **Randomness is identity-keyed** (CRC32 over an address, never a draw counter or a salted `hash()`),
  which is what makes the composite byte-identical across runs and why changing the UAT criteria moves
  no meadow placement.
- **The render delivers PIECES, never a baked island.** Nothing runtime is introduced; this pass writes
  only under `docs/research/`.

## Honest gaps

1. **The grass was DECLINED** (see the banner at the top). The owner looked, called it *"rather
   ugly"*, and after PR #1371 measured that neither density nor shading moves a delivered pixel,
   declined both shapes and directed flat green. Nothing on this page is adopted.
2. **The density question is therefore CLOSED, not open.** ×1 is the app's authored truth; ×3 and ×6
   are what the same rules produce scaled. The sweep is retained as the evidence that count is not a
   lever, which is half of why the decline is well-founded — not as a choice awaiting a pick.
3. **The test counts are INVENTED.** `island.json` carries geometry and status, not proof state, and no
   real story is being read. The distribution was chosen to exercise every branch of the app's count
   rules rather than to flatter them, but real tests would redistribute the meadow.
4. **The UAT criteria are invented too**, and their verdict mix (3 proven / 2 pending / 1 failing) was
   chosen so all three flower forms appear at once.
5. **`tuft-2` never appears on the delivered island.** It is the `unknown`-capability variant and this
   island carries no `unknown` capability, so that branch is exercised only on `components.png` and in
   the status sweep. The one piece in the set with no on-island evidence.
6. **The nameplate keep-out is not implemented** — the app's flower scatter avoids the nameplate band
   with a SCREEN-space test, and these composites have no nameplate. Inapplicable here rather than
   dropped, but a landing increment owes it.
7. **The proven bloom's glow is absent**, deliberately (see above). The flower therefore reads slightly
   flatter than the app's own proven marker.
8. **Scale against the app's wrapper transforms is not reconciled.** Proportions are taken from
   `tallFlowerMarks`/`meadowSurface`'s local units; the app then applies a wrapper scale
   (`MARKER_SCALE_SMALL = 1.0` after the owner's 2026-07-22 bump). Nothing here verifies the delivered
   ground size matches the vector body it would replace — which is precisely what the 2026-07-23 "way
   too big" verdict is about, so it is the first thing a landing increment must measure.
9. **No cast shadows.** Decor casts nothing onto the land and the land casts nothing onto decor —
   pieces are rendered in isolation, so a shadow would have to be an app-side pass, the same
   conclusion the interior fork reached.
10. **One island, one seed.** 17 hexes, 10 capabilities, 214 cells. The pixel shares are this island's;
    the direction of every finding is structural.
11. **This does not measure per-island composition at forest scale.** 117 sprite placements per island
    multiplied by island count is the number a rollout turns on, and it is not this pass's question.
