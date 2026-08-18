# The hex lines, and flat green — which grid actually draws the island's lines

> **⚠ RE-COMPOSED 2026-08-18 — 3 of 4 pictures moved.** The plant positioner's CRC32 affine collapse was
> propagated into `scatter.py` itself by the increment
> `crc32-dispersion-fix-propagated-and-evidence-rerendered`, so every placement on this pass's
> pictures moved.  **Nothing was re-RENDERED** — no piece PNG is touched; the fix changes
> where a piece is stamped, never what it looks like. The full delta table, and what did NOT move,
> is in `../chapter2-plant-dispersion-2026-08-17/README.md`. Numbers in the prose below were
> measured on the PRE-FIX placements unless they say otherwise.


**Date:** 2026-08-16 · **Camera:** 50° (a named parameter, inherited from the prior pass, not
restated) · **Land:** the interior fork's settled `b++`, ONE island for every panel · **Cost:** $0 ·
**Vendor calls:** 0 · **Blender renders:** 0 (this pass composes from the prior pass's committed
piece sets)

The owner looked at the dressed island and said, verbatim:

> *"maybe remove the hex lines, first, feels noisy, also can we just stick with green for these
> experiments"*

**Nothing here is owner-attested.** Whether the island reads better without the lines is the owner's
look and this page has no standing to make it (ADR-0070 stage 2). What it can do is say which grid
the lines actually come from, what removing them costs, and why the island is not green — each as a
number, before anything is deleted.

## The headline, in three lines

1. **The island has two grids and only one of them is ever stroked.** The compositor draws a seam
   **1× for the coast and 214× for the mesh cells. The 17 hex TILES are stroked 0 times.**
2. **The owner's eye is still right.** The mesh is *built from* the hex lattice, and **40.5% of that
   lattice's perimeter is still traced by a cell edge** (against 9.5% for a rotated control — a
   **4.28× excess**). The hex-shaped lines a viewer sees are real; they are just made of cell seams.
3. **So there is no hex seam to remove on its own.** The only lever that removes those lines is the
   one that removes **all** the interior seams — **2 221 delivered px, 6.35% of the island** — and
   that costs **4 of 77 cross-capability boundaries**.

## THE FENCE — what this pass did not touch

**`LAND_CAMERA_ELEVATION_DEG` in `packages/forest-world/src/camera.ts` is still 20 and was not
touched.** The broken map on `main` is `frontend-visual-judgment-arc`'s live dogfood fixture (owner,
2026-08-15 — *"i dont want this fixed by any session"*). **This pass did not fix the map.**

The whole diff is `docs/research/chapter2-hex-lines-and-flat-green-2026-08-16/**`. Asserted
mechanically, not promised: `verify.py` check 9 runs `git diff` + `git ls-files --others` and fails
if anything outside `docs/research/` moved, and separately re-reads `camera.ts` to confirm the
constant is still 20.

## The pictures

| file | what it is |
|---|---|
| **`which-grid.png`** | **THE MECHANICAL ANSWER.** Both grids drawn onto the seam-free island in a colour the palette does not contain. Left: the 17 hex tiles, *stroked 0 times*. Right: the 214 mesh cells, *stroked 214 times*. Look at how well the left overlay still lines up with the terracing — that is the ghost, and it is why the phrase "hex lines" was a fair description of the appearance. |
| **`line-fork.png`** | **THE FORK THE OWNER ASKED FOR.** Five panels, one island, one code state, one variable. 1 as-is · 2 hex-off · 3 cells-off · 4 both-off · 5 all-off. **Panels 1 and 2 are pixel-identical, and that identity is the finding, not a mistake.** |
| **`line-detail-6x.png`** | **JUDGE THE ART HERE.** The same crop of the same island at 6×, as-is / cells-off / all-off. Nearest-neighbour, so every block is one delivered pixel. |
| **`green-reading.png`** | **WHY THE ISLAND IS NOT GREEN.** The fixture's real status mix beside the same island with every capability driven to `healthy`. Same art, same palette, same flat ground — only the status differs. |

## 1. Which grid draws the lines — answered by total accounting, not by looking

`which-grid.png` · report section `strokeInventory`

The compositor puts a line on the island in exactly one way: `fill_polygon(canvas, alpha, poly_px,
rgb, seam_rgb=...)` strokes the polygon's own ring when `seam_rgb` is not None. Every line therefore
passes through one function, and `seams.py` wraps it and matches each stroked ring against a set of
rings **recomputed from the island's own geometry** — the coast, the 214 cell rings at the heights
they are drawn at, and the 17 hex rings at every height a cell is drawn at.

| stroke class | times stroked |
|---|---:|
| coast | **1** |
| mesh cell | **214** (one per cell) |
| **hex tile** | **0** |
| unclassified | **0** |

**The accounting is TOTAL, and that is what makes the zero mean something.** An unmatched stroke is
a refusal rather than a bucket — `compose_lines.py` exits on any `other` — so "no hex is stroked" is
what remains once every line on the canvas has been attributed, not something anybody looked for and
failed to find.

**And the detector that found nothing is armed and provably alive.** It carries 102 candidate hex
rings, and `verify_refusal.py` feeds it a synthetic hex tile at every one of the island's 6 distinct
cell heights and requires it to fire each time. A detector only ever observed returning zero is
indistinguishable from one that was never wired up, and this pass's headline is a negative — so that
distinction is the whole ballgame.

**The consequence for the brief:** `hex-off` is **pixel-identical to `as-is`** on the decoded raster
(`verify.py` check 3). Removing "the hex lines" as literally asked changes nothing, because there is
nothing there to remove.

## 2. But the owner's eye is not wrong — the hex ghost, measured against a control

`which-grid.png` (left panel) · report section `hexGhost`

The mesh is **built from** the lattice: `substrate.ts`'s `buildMeshCells` interns the same
`hexCorners` the tiles are made of. So the cell seams could still *trace* hexes even though no hex is
stroked — which would make the owner's phrase exactly right about the appearance and only wrong about
the mechanism. **They do.**

Measured as the share of hex-lattice perimeter lying within a tolerance of some cell edge. That
number is meaningless alone, because cell edges tile the whole interior and any curve drawn across it
is near one somewhere — so it is reported beside **two controls**: the same lattice displaced half a
hex width, and rotated 17° (a hex lattice is periodic, so a pure displacement can land back on a
correlated position; a non-multiple-of-60° rotation cannot).

| tolerance (ground units) | lattice | displaced control | rotated control | **excess over chance** |
|---:|---:|---:|---:|---:|
| 0.25 | **40.5%** | 13.0% | 9.5% | **4.28×** |
| 0.5 | 49.8% | 22.5% | 17.6% | 2.82× |
| 1.0 | 64.2% | 43.0% | 32.9% | 1.95× |
| 2.0 | 82.5% | 62.4% | 57.7% | 1.43× |

**Read the last column, and read it at the TIGHTEST row.** The excess is largest where the tolerance
is tightest — 4.28× at a quarter of a ground unit — which is the signature of a real geometric
coincidence rather than a chance one. A chance alignment would behave the opposite way. `verify.py`
check 7b asserts exactly that ordering, so the claim is not resting on the reader's impression of the
table.

**Why the lattice survives partly rather than wholly.** `buildMeshCells` erodes it without erasing
it: it triangulates every hex into 6 triangles, **merges** same-owner triangle pairs across shared
edges (deleting the hex-boundary edge where the merge crosses one), then **relaxes** every unpinned
vertex (jitter 0.42, 3 iterations). Pinned rim vertices do not move, and unmerged boundaries survive
intact. On this island that arithmetic is 102 triangles → 46 merged quads + 10 unmerged triangles →
214 cells.

**This is the finding that actually matters for the brief.** The lines the owner is reacting to are
hex-shaped *and* they are cell seams. There is no separate hex layer to switch off, so the request
resolves to a single real lever: remove the interior cell seams, all of them.

## 3. What removing them costs — and what it does not

`line-fork.png` · `line-detail-6x.png` · report sections `whatRemovalCosts`, `fillsHeld`,
`statusStillReads`

| panel | delivered px changed vs as-is | share of island |
|---|---:|---:|
| `hex-off` | **0** | 0% |
| `cells-off` | **2 221** | **6.35%** |
| `both-off` | 2 221 | 6.35% |
| `all-off` (coast edge too) | 2 596 | 7.42% |

**6.35% of the island is interior seam.** That is the size of the thing being called noisy, and it
is a large number for a line: the prior pass measured a whole grass tuft at **7 delivered pixels**,
so the seams occupy roughly the area of *three hundred tufts*. A one-pixel line drawn along every one
of 214 cells is a fundamentally different object from a 7-pixel decoration, which is the asymmetry
that makes lines read loud at this scale.

### What it costs: 4 of 77 capability boundaries

A seam is drawn in its **own cell's status token** at `SEAM_LEVEL` (0.90) — a darker shade of the
fill it borders. So it carries no colour a reader could not already get from the fill, and no cell's
status, identity or claimed footprint is encoded in it. What a seam *can* be the only thing drawing
is a boundary between two cells whose fills happen to deliver the same colour.

| adjacency | count |
|---|---:|
| cell–cell adjacencies | 396 |
| …crossing a **capability** boundary | 77 |
| **…that go invisible without the seam** | **4 (5.2%)** |
| same-capability adjacencies that merge | 119 of 319 |

**Four boundaries.** That is the whole measured cost of removing every interior seam. The 119
same-capability merges cost nothing semantic — two cells of the same capability merging into one
shape does not misreport anything, since the capability is the unit that carries meaning.

### What it does not cost — asserted, not assumed

- **No cell's delivered fill moves.** All 214 cells sampled, **0 moved** (`verify.py` check 5).
  Suppression drops `seam_rgb` to None and touches nothing else, so the fork moves exactly one
  variable. Without this the four panels would be comparing two things and none of them would be
  evidence.
- **No new status-colour collision is introduced** — the pairs sharing a delivered colour are the
  same with the seams as without them.
- **The palette does not widen.** Suppressing a shade can only remove entries.

### One pre-existing problem this surfaced, which is NOT about lines

Three status pairs already share a delivered colour — `building|healthy`, `building|proposed`,
`healthy|proposed` — and the shared entry is the **wheat** colour `(214,178,113)`. **A wheat cell
does not report its capability's status by colour, whether or not it is outlined.** This is a
property of the island as it ships, measured here only because the same instrument happened to see
it; removal neither causes nor worsens it. Flagged rather than fixed — it is not this pass's to
settle, and it may well be intentional.

## 4. Flat green, taken as instructed — and why the island is not green

`green-reading.png` · report section `greenReading`

The ground is **`flat`**, the option that costs nothing and leaves 100% of non-ground pixels
meaningful. **`mottle` and `carpet` are declined by the owner (2026-08-16) and are not re-rendered
here** — `carpet` was already refused on a number by the prior pass (roughly 3 in 4 grass pixels
would assert tests that do not exist, swallowing 9% of the real signal). **The grass renders exactly
as it ships:** the owner answered *"none of these is good enough"* on the grass fork, so neither the
loose blades nor the welded clump is adopted, and this pass is not another grass-shape iteration.
Decorative flowers stay retired (ADR-0226 — a flower means UAT only).

**Then the measurement turned up something better than a treatment.** Only **21.6% of the delivered
land is green**, and the per-status split says why:

| status | delivered px | **green** |
|---|---:|---:|
| `healthy` | 6 370 | **78.4%** |
| `proposed` | 5 727 | 2.0% |
| `building` | 6 328 | 0.1% |
| `unhealthy` | 3 859 | 0.1% |
| `mapped` | 1 452 | 0.0% |

**The island is not green because 7 of its 10 capabilities are not `healthy`.** That is semantic
state doing exactly what ADR-0367 D5 requires — the land is reporting proof state — not an art
choice and not a palette problem.

So *"can we just stick with green"* has two readings, and they cost wildly different things:

- **The ground treatment** — flat green rather than mottle or carpet. **Taken, free, done.**
- **Make every cell green** — which would delete the per-capability status tint. **NOT taken**,
  because that is semantic state the art does not outrank.

**There is a third option the measurement makes visible, and it costs no meaning at all:** change the
**fixture's status mix**. `green-reading.png`'s right-hand panel is the same island with every
capability driven to `healthy` — same art, same palette, same flat ground, and it is unmistakably
green. If the owner wants a green island *for these experiments*, that is the lever, and it deletes
nothing. **Which of the three is meant is the owner's call and this page does not make it.**

## Proof — the machine-checkable half (`verify.py`, 20/20 green)

The look is an owner attestation. These are the claims a session may assert for itself.

```text
== 1. the land ==        compose_land([]) is byte-identical to the shipped compositor
                         the pass composes at its declared angle (50 deg)
== 2. THE INVENTORY ==   every stroke is attributed: coast=1 cell=214 hex=0 other=0
                         the hex detector is ARMED (102 candidate rings)
== 3. the panels ==      `hex-off` is PIXEL-IDENTICAL to `as-is` on the decoded raster
                         removing the interior seams DOES change the island (2221 px)
                         the coast seam is a separate class (375 px more)
== 4. determinism ==     the composite is identical when re-run, on the DECODED raster
== 5. ONE VARIABLE ==    no cell's delivered fill moves when only a seam is suppressed (0/214)
== 6. palette ==         seam removal adds no colour outside the closed palette
== 7. the hex ghost ==   the excess over the rotated control holds at every tolerance
                         and is LARGEST at the tightest one (the signature of a real coincidence)
== 8. the cost ==        4 of 77 cross-capability boundaries go invisible; no new collisions
== 9. the fence ==       changes confined to docs/research/**
                         LAND_CAMERA_ELEVATION_DEG is still 20
```

**Determinism is asserted on the DECODED RASTER, never the file** — the house rule, kept even though
this pass runs no Blender (see gap 1).

## Every guard made to FIRE (`verify_refusal.py`, 8/8)

This pass's headline is a **negative**, and a negative is worth exactly as much as the instrument
that failed to find anything.

```text
PASS  the hex detector CLASSIFIES a synthetic hex tile as `hex`
PASS  it fires at EVERY height a cell is drawn at (6 distinct heights)
PASS  a genuine mesh cell is classified `cell`, never `hex`   (it discriminates)
PASS  the coast ring is classified `coast`
PASS  an unrecognised ring is `other` — the inventory REFUSES rather than absorbing it
PASS  suppressing `cell` changes the raw canvas   (wired to pixels, not to a counter)
PASS  the inventory COUNTS a suppressed stroke rather than losing it
PASS  a ONE-PIXEL fill drift between two composites is caught
```

The one-pixel drift test perturbs **only a copy**, never the shipped side — the prior pass recorded
getting the analogous test wrong by patching `C.fill_polygon` outright, which moved both canvases
together so they still matched and the guard "passed" a compositor drawing the wrong thing.

## Reproduce

```text
npx tsx emit_hexlines.ts     # the hex lattice, from the app's own hexCorners
python compose_lines.py      # 4 pictures + lines-report.json + provenance sidecars
python verify.py             # 20 checks
python verify_refusal.py     # make every guard fire
```

The composers need system Python with numpy + Pillow. **`bpy` from PyPI is not a route on this
machine**; this pass needs no Blender at all.

## What the code owns (ADR-0280 D1 / ADR-0367 D2–D3, unchanged)

- **The script is the source of truth.** No `.blend`, no hand-sculpted mesh, no vendor call.
- **The prior pass is IMPORTED, not vendored.** `compose_core.py` / `scatter.py` / `grass.py` are
  imported from the committed `chapter2-grass-reads-as-signal-2026-08-16` (PR #1371). That pass had
  to copy *its* predecessor because the predecessor was staged and never committed; this one closes
  that gap rather than repeating it, so there is no second copy here to drift.
- **The hex geometry is INVOKED, never re-derived** — `emit_hexlines.ts` calls the app's own
  `hexCenter` / `hexCorners` / `HEX_R` / `unprojectGround`. A hand-rolled hex formula would be a
  second copy able to disagree with the one the mesh was actually built from, which is precisely the
  question being asked.
- **The camera is read, never restated.** The angle enters once as `grass.PASS_ELEVATION_DEG`.
- **The seam control changes no geometry and re-authors no colour** — it drops `seam_rgb` to None.

## Honest gaps

1. **This pass renders NO Blender frames.** It composes from the prior pass's committed piece sets,
   so it inherits their pixels unexamined and re-proves nothing about them. The Cycles
   adaptive-sampling trap (a render being a function of system load) therefore does not arise here —
   but neither does any fresh evidence about the pieces themselves.
2. **There is no owner LOOK.** Nothing here is attested and no option is chosen. Whether the island
   reads better without the seams is exactly the judgment this page must not make.
3. **The cost measure counts BOUNDARIES, not legibility.** "4 of 77 cross-capability boundaries go
   invisible" says two parcels deliver the same colour where they meet. It does not say whether a
   viewer was reading parcel boundaries in the first place — and nothing on the island outlines a
   capability as such, so parcel identity is weakly drawn either way. That is a pre-existing property
   this pass measured against, not one it introduced.
4. **The cell-ownership map centre-samples rather than majority-downsamples.** It exists only to read
   each cell's own modal fill over hundreds of pixels, where the two disagree solely in blocks
   straddling a boundary. Stated because it is a simplification, not an equivalence.
5. **The hex-ghost tolerance is a judgment.** It is reported as a 4-row sweep beside two controls
   precisely because one threshold is where a result like this could be steered, but the choice of
   0.25–2.0 ground units is still mine and not derived from anything.
6. **The cell-ownership map ignores walls and decor.** A rim cell hidden behind a wall piece reports
   few pixels; mean modal purity is 0.78 rather than 1.0, which is the honest cost of that.
7. **One island, one seed, one camera, one zoom.** 17 hexes, 10 capabilities, 214 cells, 34 968
   delivered island px. The shares are this island's; the direction of each finding is structural.
   The app may render the map at more than one scale and that was not measured.
8. **The test counts, UAT criteria and STATUSES are INVENTED spike data.** `island.json` carries
   geometry and a status list, not real proof state — which is exactly why section 4's "change the
   fixture's status mix" is cheap here and would not be on a real island, where the statuses are
   whatever the work actually is.
9. **The wheat status-colour collision is flagged, not diagnosed.** Whether several statuses sharing
   the wheat entry is a defect or a deliberate choice was not investigated.
10. **Nothing here proposes an app-side change.** Removing the seams in the shipped renderer would be
    a change to `compose.py`'s callers and to the app's own land layer; this pass measures the fork
    and does not check that the app can express the result.
