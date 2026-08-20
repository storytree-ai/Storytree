# The reference board and the lever register — 2026-08-20

ADR-0392 D3 says the owner's attestation may be called only when *"why doesn't this look like the
reference?"* cannot be answered with *"because we haven't built X yet"*. That rule needs two things
the arc has never had: a named **reference**, and an auditable **register of levers**. The owner
supplied the references on 2026-08-20. This is both.

**The calibration he set, verbatim, and it matters as much as the references:**

> here are some images of what is available online. We dont need to be this good, but i expect us to
> do a version of this that looks at least half as good

So this is not a parity target. "Half as good" is the bar, and a lever priced out with a reason is a
first-class outcome. What is forbidden is the unexamined lever.

---

## ⚠ The board's own honesty gap, stated first

**The three reference images live in the conversation, not in this repository.** They were pasted by
the owner and this session cannot write them to disk. A reference board whose references are not
committed is one machine wipe from being a list of adjectives, and every mechanism below would then
rest on one session's description of pictures nobody can re-open.

**The remedy is one action by the owner: drop the three images into this directory** (any filenames;
the table below names them R1/R2/R3 in the order they were supplied). Until that happens the
descriptions here are the only record, and they were written while looking at the originals.

---

## The references

| | What it is | The register calls it |
|---|---|---|
| **R1** | An isometric round garden platform: a stone-ringed well with blue water, wooden rail fences, potted shrubs, a stone arch doorway, paved path, on a disc of grass bounded by a thick wall of individual stone blocks. Watermarked stock (Dreamstime), so it is a MOOD reference, not a coherent buildable scene. | `R1-stone-garden` |
| **R2** | A soft, pastel, painterly isometric tea-house: timber structure with a tiled roof, scattered small props (pots, lanterns, rocks), dense moss and foliage clumps, stone path, warm-cool colour drift across the frame. | `R2-tea-house` |
| **R3** | A dense cottage garden on a square plot: many plant species in many colours (reds, oranges, purples, yellows, several greens), brick paving, a pond, two timber buildings, bounded by a stone kerb with a visible soil/grass edge slab. | `R3-cottage-garden` |

All three are almost certainly AI-generated "isometric game asset" renders rather than shipped game
art. **That does not weaken them as references** — the owner is naming a LOOK, and the mechanisms
below are readable regardless of provenance. It does mean they should not be treated as evidence
that a particular technique is cheap or even coherent in 3D.

---

## What the references are DOING that we are not

The instruction ADR-0392 D3 gives is to state the MECHANISM, not the preference — "it looks better"
is not a lever. Ten mechanisms, ordered by how strongly they separate the references from our
current island.

### 1. Contact darkening (ambient occlusion) — the most consistent difference, and we have none

Every object in all three references darkens the ground where it meets it. Every shrub, pot, fence
post, building and stone sits in a soft dark pool. It is present in R1, R2 and R3 without exception,
at every scale, and it is doing most of the work of making things look *placed* rather than *pasted*.

Our island has **zero** contact darkening. A plant meets the ground at a hard colour boundary.

This is almost certainly the single highest-value unattempted lever, and it is cheap in the way that
matters: it is a darkening, so it lands on the existing shade ladder rather than needing new hues.

### 2. Cast shadows — absent from every island this arc has produced

Directional shadows from objects onto ground and onto each other. R1's fences and trees cast clearly;
R3's buildings and dense planting cast into each other, which is a large part of why its density
reads as depth rather than as clutter.

Shadow is the *stated reason* author-time 3D was reopened, and no island on this arc has one. Already
parked as `shadow-ladder-is-admissible-and-affordable`, with the known blocker recorded: on the
shipped 132-entry palette every shadow rung quantised away to **zero pixels**, and the ladder used to
make it visible is not admissible on a mixed-status island.

### 3. A thick, material island edge

All three references bound the ground with a substantial edge that is *its own material*: R1 a wall
of individual stone blocks with visible depth; R3 a stone kerb over a soil slab. The edge is a
significant fraction of the silhouette and it reads as *thickness* — the island is a solid object.

Ours extrudes 2.2 ground units of the same green, which at 50° renders as a few nearly-invisible
dark slivers along the south rim. The island reads as a flat cut-out. Already parked as
`blender-island-shell-render`.

### 4. Bevelled forms — nothing in the references is a flat plane

Every surface in R1 has a rounded or chamfered edge that catches light differently from the face.
The stone blocks, the well rim, the path tiles. It is what gives the whole image its "soft toy"
solidity.

Our ground cells are flat polygons with a hard vertical skirt. A chamfer is geometry, costs no new
palette entries if it lands on existing ladder rungs, and would give every cell edge a lit lip.

### 5. Hue variation in the ground — ours is one flat token

R1's grass has visibly darker and lighter patches. R3's ground carries several greens plus brick and
soil. R2 drifts warm to cool across the frame.

Our all-healthy island is exactly one token at one band — a single unbroken colour. **⚠ This is the
one mechanism that collides with a standing owner directive**: the three hash-picked colour variants
were removed on 2026-08-16 as noise, and the mesh seams with them. The reference's variation is
*regional* (patches, drift) rather than *per-cell* (hash noise), which is a real distinction and
probably the way through — but it is close enough to a rejected decision that it should be built
carefully and shown, not assumed.

### 6. Warm/cool light split — our palette construction cannot currently express it

In all three references, lit faces are warmer and shadowed faces cooler. It is subtle and it is
everywhere.

Our banded material computes `token × level` — a pure **value** multiplication. Multiplying a colour
by a scalar cannot shift its hue, so a shadowed face is the same hue as a lit face, only darker. **We
are structurally incapable of this mechanism as the palette is currently constructed**, and that is a
finding rather than a tuning gap: it would need the ladder to carry authored *colours* per rung
rather than *multipliers*.

The palette-entry cost is real and needs pricing rather than assuming — it is the same
|tokens| × |levels| arithmetic, so the count does not change, but the entries stop being derivable
from the token and must be authored.

### 7. Plant species and colour variety

R3 is the extreme case: a dozen distinguishable plant silhouettes in half a dozen hues. R1 has three
or four. Ours currently has one procedural shrub in two silhouette styles, all one green.

**⚠ Colour variety collides with semantics and is NOT an art call.** Under ADR-0226 the vegetation
signal is the *count* of plants and its colour is the capability's proof state. A red or purple
plant would either assert a status we do not have or make status unreadable. **Species** variety is
an art call (a species means nothing, ADR-0226 D2); **hue** variety is an owner/ADR question.

### 8. Props that are not vegetation — scale anchors

Fences, pots, lanterns, buildings, a well, paving. These do three things: give scale, break
monotony, and create the occlusion and shadow interplay that makes the scene read as a place.

**⚠ Also not an art call.** The arc retired the decorative wildflower specifically so that "flower"
means UAT and only UAT, and ADR-0367 D5 forbids art that asserts a state the work does not hold. A
decorative fence asserts nothing and may be harmless; a building that looks like a story tree is not.
**This is the largest single gap between us and the references and it is an owner/story-author
question, not something to decide under cover of an art change.**

### 9. Paths and paving as a distinct material

All three have a walked surface with its own material and pattern. Ours has none.

The app already has a trail network with real routing (ADR-0169), currently drawn as ribbons and
absent from the live island entirely. This may be closer to free than it looks.

### 10. A rim highlight on top faces

Subtle in R1: top faces carry a lighter lip along their lit edge. Distinct from an outline (which is
a dark silhouette edge); this is a light one, inboard.

---

## The lever register

The register is the artefact ADR-0392 D3 makes binding: **if any entry reads NOT ATTEMPTED, the bar
is not met and the owner is not asked.** A register that does not block is decoration.

`PRICED OUT` is honourable and final — it means we looked, measured, and decided against with a
recorded reason. Do **not** re-run a priced-out lever.

### Discharged — PRICED OUT on real measurement. Do not re-run.

| Lever | Why it is discharged |
|---|---|
| Hair / particle grass | Three regimes measured on delivered pixels, none is grass: tutorial scale delivers **0 px**; thick enough to see welds into a near-solid 9×8 rectangle; sparse enough to keep gaps is debris at 72% survival. At matched footprint hair delivers 15 px *with a hole* against the hand-modelled dome's 18 px solid. |
| Shading levers (normal maps, custom normals, world-space masking) | Act above the quantisation threshold on the sprite path, so they are discarded before delivery. The custom-normals sweep fired provably (90% of raw px repainted at mix 1.00) and delivered the **identical** 7 px, 2 colours, one lit cap at every setting. |
| Resolution laddering (1×/2×/4×/8×) | Scales the same authored geometry, so no rung authors new detail. Confirmed by the owner looking: *"all these look the same"*. |
| Grass-as-ground-carpet | Refused on a number, not taste: it puts **897 px of grass tracking no test count against 275 that do** — ~3 in 4 grass pixels would assert tests that do not exist, which is art telling a lie (ADR-0367 D5). |
| Long-grass blade species | Rejected by the owner four times, and the pipeline cause is measured: the blade tuft is the ONE piece whose structure is finer than the 3×3 majority vote (43–79% survival against 94–116% for everything else). |

### Built

| Lever | State |
|---|---|
| Live rendering (untying detail from the sprite pixel budget) | BUILT behind the firewall (#1417, #1445). Detail survives zoom; at delivered size it ties with the sprite path. |
| Locked palette in a shader | BUILT and proved on 6.7M delivered pixels, 0 off-palette. |
| Procedural plant geometry with a detail ladder | BUILT. Two silhouette styles (`mound`, `foliage`). |
| Flat green ground / seams removed / one surface | BUILT — owner-directed, and the composition of the three is what produced the flat field. |

### NOT ATTEMPTED — these currently block the bar

| # | Lever | Mechanism | Call belongs to |
|---|---|---|---|
| 1 | **Contact darkening (AO)** | §1. Highest value, lands on the existing shade ladder. | **Art call** (D2) |
| 2 | **Cast shadows** | §2. Parked as `shadow-ladder-is-admissible-and-affordable`; blocker is palette admissibility on a mixed island. | Art call, with a **palette-cost question** |
| 3 | **Thick material island edge** | §3. Parked as `blender-island-shell-render`. | **Art call** (D2) |
| 4 | **Bevelled cell edges** | §4. Geometry; probably free on the existing ladder. | **Art call** (D2) |
| 5 | **Outline pass on the land** | The owner's own stated reference is flat green + speckle + *outlined* blobs; the hero tree already has an outline spec; the land has none. ⚠ Cannot be carried below 2× (at 1× it eats 78% of a vegetation mark) and must NEVER trace a cell-top-against-cell-top join — that is the removed mesh seam. | **Art call** (D2) |
| 6 | **Rim highlight on top faces** | §10. | **Art call** (D2) |
| 7 | **Regional ground hue variation** | §5. ⚠ Near a rejected decision (per-cell hash variants). Regional ≠ per-cell, but build it and show it rather than assuming the distinction carries. | **Art call**, flagged |
| 8 | **Paths / paving as a material** | §9. The trail network already exists and routes; it is absent from the live island. | **Art call** (D2) |
| 9 | **Warm/cool light split** | §6. **We cannot currently express this** — `token × level` is a pure value scale and cannot shift hue. Needs authored per-rung colours instead of multipliers. | **Art call**, but with a real palette-architecture change |
| 10 | **More plant species** | §7. A species means nothing (ADR-0226 D2), so silhouette variety is free of semantics. | **Art call** (D2) |
| 11 | **Plant colour variety** | §7. | ⚠ **OWNER / ADR** — colour is the proof state |
| 12 | **Non-vegetation props** (fences, rocks, structures, pots) | §8. The largest single gap. | ⚠ **OWNER / ADR** — what may appear that asserts nothing |

**Nine of the twelve are art calls this arc can make and record under ADR-0392 D2. Three are not**,
and two of those three (#11, #12) are among the biggest visual gaps — which means the honest reading
is that **the references cannot be approached to "half as good" on art calls alone.** That is a
finding for the owner, not something to work around.

---

## What this changes about the sequencing

The four bar-serving increments already parked (coast shell, shadow, ground displacement, camera)
cover levers 2 and 3. Levers **1, 4, 5, 6** — contact darkening, bevels, outline, rim highlight — are
the cluster that is cheap, unblocked, purely art calls, and absent, and they belong with
`land-carries-its-own-definition-again`. Lever **9** needs its own increment because it changes how
the palette is constructed rather than what is drawn.

Levers **11 and 12** need an owner decision before any work is aimed at them, and that decision is
now AUTHORED rather than left in a transcript:
`oq-may-the-island-carry-things-that-mean-nothing-and-may-veg`, stamped to this arc so it surfaces
as waiting on the owner.

Lever **9** (warm/cool) is parked as `palette-carries-a-warm-cool-light-split`. Levers **1, 4, 5, 6**
are appended to `land-carries-its-own-definition-again`, which is in flight.
