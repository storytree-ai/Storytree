# Which camera elevation should the land declare? — rendered evidence for the owner's pick

**Date:** 2026-08-15 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0
· **Land variant:** `b++` (the interior fork's settled option) · **Tree:** the real `code-blender`
mature frame, re-rendered per angle

ADR-0367 D1 fixed ONE shared camera for the land and the objects standing on it, and deliberately
left its VALUE open: *"whether the shared value stays 20 degrees or moves is an increment's
measurement to make, but there is ONE value and both sides read it."* The owner looked at the
20-degree land on 2026-08-15 and said it **"looks too low, it needs to more a birds eye view"**.
This is that measurement, so the pick is made by LOOKING rather than by argument.

**Nothing here is owner-attested, and `LAND_CAMERA_ELEVATION_DEG` is NOT changed by this
increment.** The recommendation below is explicitly non-binding; the look is the owner's.

## THE PICTURE

| file | what it is |
|---|---|
| **`camera-elevation-sweep.png`** | **THE PICK.** The same island with the real hero tree standing on it at 20° / 30° / 35.26° / 45° / 60°. Both sides of the composition rendered at each panel's own camera. |
| **`tree-camera-read.png`** | **THE COST.** The same mature tree at each camera, 4×, nothing else in frame — because a bird's-eye land is bought with the tree's trunk and limb silhouette. |
| `panel-<tag>.png` | each composite at 1:1 |

### The candidate set, and why each is in it

| angle | ground ×sin θ | upright ×cos θ | why it is here |
|---:|---:|---:|---|
| **20°** | 0.342 | 0.940 | the CURRENT declared value — the anchor, without which the sweep has no baseline |
| **30°** | 0.500 | 0.866 | the classic isometric drawing angle; the shallowest that reads as a citybuilder |
| **35.26°** | 0.577 | 0.817 | TRUE isometric, `atan(1/√2)` — all three axes foreshorten equally |
| **45°** | 0.707 | 0.707 | ground and upright foreshorten identically; the natural midpoint |
| **60°** | 0.866 | 0.500 | strongly overhead — the far end before plan view |

## What the pictures show

**The land gains enormously and monotonically.** Delivered land pixels go 17 426 → 24 023 → 27 261
→ 32 593 → 38 910, i.e. **+56% at 35.26° and +87% at 45%** over today. At 20° the island reads as a
low sliver: the relaxed mesh's cell mosaic, the parcel terracing and the rim walls are all present
and almost none of it is legible. From 30° up the interior opens out and the land starts to read as
a place rather than a ridge. The owner's complaint is confirmed by the pictures, not merely accepted.

**The tree pays for it, gradually and then suddenly.** Measured on the mature frame
(`tree-camera-read.json`; bark/foliage is a stated proxy — bark is `R > G + 12`, foliage `G >= R`,
over `alpha > 200`):

| angle | bbox height | aspect (h/w) | bark share of tree px | clear stem rows below the canopy |
|---:|---:|---:|---:|---:|
| 20° | 119 px | 1.352 | **27.5%** | **55** |
| 30° | 124 px | 1.292 | 24.3% | 51 |
| 35.26° | 125 px | 1.214 | 22.3% | 48 |
| 45° | 128 px | 1.094 | 18.7% | 41 |
| 60° | 114 px | **0.974** | **12.2%** | **15** |

Read alongside the picture:

- **20° → 30°** is nearly free. The crown still reads as separated lobes with visible gaps, the limb
  structure is still visible through the canopy, and the trunk is unmistakable. Side by side with 20°
  the tree is hard to fault.
- **35.26°** is the last angle where the crown keeps its airiness. Lobes begin to merge and a little
  in-crown limb detail closes up, but the trunk and root flare still carry the woody read.
- **45° is where it starts to go.** The crown consolidates into one dense mass and most of the
  in-crown limb silhouette is gone. It still reads as a tree, but as a canopy on a stump rather than
  a tree with branches. Bark share is down a third from 20°.
- **60° is where it stops reading as a tree.** Aspect passes below 1 — the sprite is wider than it is
  tall — the trunk is short enough that the ROOT FLARE dominates the woody read, and the crown is a
  flat mass seen from above. It reads closer to a shrub. This is the one option that costs the
  subject, not just some of its detail.

**So the trade has a knee, and it is at 45°.** Between 20° and 35.26° the land nearly doubles its
readable area for a modest, mostly-invisible tree cost; past 45° the tree's structure goes faster
than the land's legibility improves.

## Recommendation (NON-BINDING — the owner signs the look)

**Take 35.26°, true isometric.** It is the largest bird's-eye gain available at essentially no cost
to the signed tree: +56% land pixels and a ground plane that goes from 0.342 to 0.577, against a
tree that keeps 81% of its bark share and 87% of its clear stem. It is also a principled angle
rather than a taste — at `atan(1/√2)` the three axes foreshorten equally, which is the projection
the citybuilder read the owner named is built on.

**If the owner wants the change to feel bigger, take 45°** and accept the named cost: the crown
consolidates and the in-crown limb silhouette largely goes. That is a real loss of tree detail and
it is visible in `tree-camera-read.png` — but the tree still reads as a tree, and the land is at its
most legible.

**Do not take 60°.** It is the only candidate where the tree stops reading as its own subject.

**Angle changes are priced as renders, not decisions.** Because the tree is generated in 3D the
camera is a PARAMETER: pick one, look at it in the app, and move it again if it is wrong. Nothing in
this sweep is a one-way door.

## The camera is a parameter, not a re-authoring — and what that does and does not license

The skeleton, the girth, the crown lobes and the cel bands are all camera-independent, so every
panel is **the same tree correctly seen from a different height**. Nothing was re-tuned: the
crown-normals mix, the canopy constants and the palette are untouched, and this increment does not
re-open the hero tree's signed ceiling verdict, which was about whether code-generated art reaches
the bar and never about the viewing angle.

What a camera change DOES drag along is re-MEASUREMENT, and there are two items:

1. **The retime shift — measured, and small.** The camera re-times the track: `retime()` paces frames
   by silhouette-change arc length off `cheap_silhouette()`, which rasterises through `to_screen()`,
   which reads `EL`. So the angle moves WHICH growth state each frame index lands on. Measured
   against 20°, the largest move of any frame is **Δu = 0.0275** at 30° / 35.26° / 60° and
   **Δu = 0.0550** at 45° — one or two of the retimer's 110 fine samples — with 11–16 of the 19
   frames moving by at most that. Frames 0 and 18 do not move at all, ever (see below). The pacing is
   therefore perturbed rather than restructured.
   **ADR-0293's owner-picked staging boundary** (wood extends alone, then leaves flush) is verified by
   an author-time MEASUREMENT in the hero track's README, not by a check wired into `pnpm gate` —
   searched for in `packages/**` and the hero tooling, and there is none. It cannot fire on this
   increment because the DEFAULT is unchanged; whoever lands a new angle must re-run `measure.py` and
   re-confirm the boundary at that angle. Flagged, not fixed.
2. **The seven accepted gaps** in the hero track's README §6 were all measured in the 20° projection.
   A higher camera shows more crown top and less limb, so those instruments read differently. They are
   ACCEPTED as they stand; re-measuring them is the job of the increment that lands an angle, and
   re-tuning them is not on the table.

## Why these panels compare ONE variable — the controls, each made rather than asserted

**The tree's growth stage is pinned STRUCTURALLY, not by ordinal.** This is the trap that would have
voided the sweep: comparing "frame 18" across angles could have compared differently grown trees,
which is exactly the two-variable failure `crown-normals-fork.png` shipped with. It does not here,
and the reason is in the code rather than in luck — `retime()` ends with
`picks[0], picks[-1] = 0.0, 1.0`, pinning the first and last frames unconditionally. So the mature
frame is `u = 1.0`, the fully grown skeleton, at every angle. `sweep_render.py` **asserts** it and
raises `SWEEP VOID` otherwise:

```text
     20.0 deg  skeleton={nodes:352, iters:28, lobes:29}  mature={u:1.0, N:36.0, lobes:19}
     30.0 deg  skeleton={nodes:352, iters:28, lobes:29}  mature={u:1.0, N:36.0, lobes:19}
   35.264 deg  skeleton={nodes:352, iters:28, lobes:29}  mature={u:1.0, N:36.0, lobes:19}
     45.0 deg  skeleton={nodes:352, iters:28, lobes:29}  mature={u:1.0, N:36.0, lobes:19}
     60.0 deg  skeleton={nodes:352, iters:28, lobes:29}  mature={u:1.0, N:36.0, lobes:19}
  PASS  one skeleton (352, 28, 29) and one mature state (1.0, 36.0, 19) at every angle
```

**The 20° panel IS the shipped art, not a lookalike.** Its tree frame is **pixel-identical** to the
delivered `code-blender` frame-18 — 0 differing pixels of 128×128 — so the `--elev` override is a
genuine no-op at its default and the baseline is the thing itself. Its LAND is identical to the
committed `bplusplus.png` too (17 426 land px, 60 colours, both), which is what proves the
compositor rebinding below is complete rather than merely plausible.

**`emit_island.ts` re-emits byte-identically at the default** — `1fa6ce51565e537a`, the digest
`verify.py` already records — so the sweep's parameterisation changed no committed geometry.

**ONE compositor, rebound per angle — never a copy.** `compose_sweep.py` imports the interior-fork
spike's `compose.py` and re-points its module state at each angle's island and piece set. There is
exactly one implementation of the projection, the piece stamping, the palette and the ADR-0367 D4
back half, so a sweep panel cannot drift from the picture it is compared against: it IS that code.
The only locally written step is planting the tree, because `compose.add_tree` reads the shipped 20°
sprite from a path inlined in its body and each panel needs its own angle's render.

**ONE code state across FIVE render directories, refused before any pixel is drawn.** `provenance`
(landed by the hero track, PR #1350) is adopted rather than reinvented: every piece directory
declares `blender_land.py`'s digest, and `require_one_code_state` runs before drawing. Unlike the
interior fork — where one directory made the call ceremonial — this composes five, so the guard has
real work to do. All five came out at `15927bf56c77`, and every delivered picture carries a
`.provenance.json` sidecar.

**Both sides of each panel are asserted to record the SAME angle.** `compose_sweep.py` refuses if a
piece directory's `render-meta.json` or a tree registration's `camera_elevation_deg` disagrees with
the panel's angle — the mismatch ADR-0367 D1 exists to end, caught mechanically rather than by
inspection.

## What this sweep does NOT show — the honest gap that matters for landing

**It varies the camera only, and a real camera move would ALSO re-decompose the island's interior.**
`buildRelaxedCells` and `smoothCoast` take no elevation argument: they work in the screen space of
`hexCenter`'s own default, and `substrate.ts`'s vertex interning (`VKEY`) rounds to 0.1 px of the
**projected** coordinate. So the mesh's cell decomposition is a function of the projection — measured
on the camera lane as 50 → 52 cells, with the reveal wave moving `1,4,7,10,11,9,6,2` →
`1,4,7,8,8,10,11,3`. Every panel here therefore re-projects the SAME ground island, which is what
isolates the camera as the single variable and makes the comparison honest; the cost is that the
pictures do not show that re-decomposition.

**Two preconditions therefore attach to actually landing any new angle, and neither is
discretionary** — both were already recorded as conditions by the interior-fork spike and ADR-0367's
own Consequences, and this sweep does not discharge either:

- **Move the substrate's vertex interning to GROUND space before the land's geometry moves.**
- **Give the accretion reveal a real cell id** instead of indexing by the literal SVG path `d`
  string, which changes under any elevation term.

Also unchanged and still owed by a landing increment: `TILE_DEPTH`'s layout consumers (the nameplate
baseline and the scene bounds both add it as a LAYOUT constant), and re-rendering the delivered
`code-blender` track at the picked angle — this increment deliberately did not touch the shipped
asset directory, so **the delivered track still ships at 20° until the owner picks.**

**One island, one seed.** 17 hexes, 10 capabilities, the interior fork's own island. The pixel shares
are this island's; the direction of every finding is structural.

## Reproduce

```text
python sweep_render.py                 # emit 5 islands, render 5 piece sets + 5 tree frames
python sweep_render.py --plan-only     # just the retime tables, no pixels
python compose_sweep.py                # -> panel-*.png + camera-elevation-sweep.png
python tree_camera_read.py             # -> tree-camera-read.png + the cost table
```

`blender_land.py` / `blender_tree.py` run under Blender's bundled Python — structural loops MUST run
under Blender, because the system numpy grows a different tree than the bundled 2.3.4 does.
`compose_sweep.py` and `tree_camera_read.py` need system Python with numpy + Pillow.

The three parameterisations this increment added are all additive and default to today's behaviour:
`blender_tree.py --elev` (default 20.0), `blender_land.py --island` (default its own `island.json`),
and `emit_island.ts --elev/--out` (defaults the constant and `island.json`). None of them changes a
committed artifact when run bare, which is asserted above rather than claimed.
