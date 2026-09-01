# The shore gets vertices to bend through — one inset ring, measured

**2026-09-01 · `adopt-the-land-into-the-shipped-map-arc`, increment
`inset-ring-inside-the-shore-band` · every frame figure off the Mint box (RTX 2060), two full runs**

---

## What this is, in one paragraph

Yesterday's increment made the shipped island's land **fall to its coastline** — and then discovered
that the number controlling how *wide* that fall is does nothing. The reason turned out to be the
mesh rather than the number: **the shipped ground has no vertices between the coastline and the
first interior corner 8.66 units inland**, so a fall shaped over a 3-unit beach and a fall shaped
over a 7-unit beach come out as the identical straight ramp. The shore had an effect but no *shape*.

This increment gives it vertices to bend through, and measures whether the shape shows up. **It
does.** The band now costs the map no more fidelity than drawing no band at all, and 176,784
delivered pixels change — more than *doubling* the band's width changes. It costs 31% more ground
triangles and about 5% of the ground's own frame time on one island. **The map is still one draw
call, and it still reports exactly what it reported before.**

---

## The pictures — look at the coast, not the middle

Same island, same 7-unit beach, same light, same camera. The only thing that moves between the
second and third picture is whether the mesh has any vertices inside that beach.

| file | what it is |
| --- | --- |
| `ring-one-8px-none.png` | **the control** — no shore fall at all, the land stands full height right up to the waterline |
| `ring-one-8px-beach.png` | **what shipped yesterday** — the land falls, but as a straight ramp |
| `ring-one-8px-ring.png` | **what ships now** — one chain of vertices at the beach's midpoint |
| `ring-one-8px-ring-pair.png` | two chains, at the beach's thirds — measured, and *not* adopted |

The same four at 2 px/unit (`ring-one-2px-*.png`), and the 35-island forest at 2, 8 and fitted-to-a-
screen (`ring-forest-*`). ⚠ **At the fitted zoom the whole beach is four delivered pixels wide**, so
that row is context and cannot falsify anything — it is printed beside every figure so a null result
there reads as "too small to see" rather than as "no difference".

---

## Did the shape actually arrive? — the number, and it is a surface property

`shoreRelief` is *analytic*: it answers the smoothstep at every point. What the map **draws** is a
triangulation that samples that field at its vertices and interpolates flat between them. With no
vertex inside the beach, the drawn shore is a straight ramp from the waterline to the first corner
8.66 units inland — the falloff's shape is not coarse but **absent**.

The **sag** is that gap: per triangle, how far its own plane sits from the field at its centroid.
Measured over a **fixed** region (the 7-unit beach) on every arm, so the rows compare.

| arm | band | rings | band triangles | max sag | **mean sag** | vs `beach` |
| --- | --- | --- | --- | --- | --- | --- |
| `none` | — | — | 269 | 1.179 | **0.287** | *baseline: the land with no band at all* |
| `authored` | 3.1 | — | 269 | 3.379 | **0.720** | +71.5% |
| `beach` | 7 | — | 269 | 2.427 | **0.420** | — (what shipped yesterday) |
| `shelf` | 16.5 | — | 269 | 0.830 | **0.168** | −60.1% |
| **`ring`** | **7** | **3.5** | **712** | **1.753** | **0.286** | **−31.9%** ← ships |
| `ring-pair` | 7 | 2.33, 4.67 | 913 | 1.591 | **0.138** | −67.1% |

**Read the `ring` row against the `none` row.** 0.286 against 0.287: **drawing the shore band now
costs the map no more fidelity than drawing no band at all.** Yesterday it cost 46% more.

⚠ **A low sag does not by itself pick an arm, and `shelf` is why it is worth saying.** Its band is so
wide that the falloff is gentle enough for even this mesh, which is why it reports the lowest sag of
the four width arms. It is still refused — for a reason this column cannot see: it lowers ground
*inland* of the pre-coast boundary, and that ground carries props.

⚠ **And the fixed region separates two arms that deliver the bit-identical land.** `authored` and
`beach` move the same vertices by the same amounts — that is yesterday's finding — and still report
different sags, because each is measured against **its own** analytic field. `authored`'s smoothstep
finishes in 3.1 units where `beach`'s takes 7, so the straight ramp this mesh is forced to draw
departs from it further. *The narrower the authored band, the more of its shape the mesh fails to
carry.* That is yesterday's finding restated as a quantity rather than as an identity — and it is
the clearest single argument for why more vertices were the only remedy.

---

## Can a viewer see it? — pixels between adjacent arms

The sag says the mesh can now *carry* the shape. This says a viewer would *see* it. Both are needed:
a ring that halved the sag and moved no pixel would have bought a property nobody can look at.

| size | zoom | `authored`\|`beach` | `beach`\|`shelf` | **`beach`\|`ring`** | `ring`\|`ring-pair` |
| --- | --- | --- | --- | --- | --- |
| one | 2 | **0** | 8,145 | **11,056** | 5,453 |
| one | 8 | **0** | 130,106 | **176,784** | 86,988 |
| one | fit | **0** | 135,050 | **183,635** | 90,451 |
| forest | 2 | 59 | 37,381 | **53,065** | 27,242 |
| forest | 8 | **0** | 128,522 | **191,019** | 93,120 |
| forest | fit | 31 | 21,766 | **31,288** | 16,515 |

**The ring changes more of the picture than widening the band from 7 units to 16.5 does** — 176,784
pixels against 130,106 on the island at 8 px/unit, which is 80% of the shore's entire footprint
(221,906 px). The zero column is yesterday's finding holding: `authored` and `beach` are the same
file, and they are committed as the same file so a reader can check.

---

## What it costs

| size | arm | triangles | +% | vertex KB | sq units of land | draw calls |
| --- | --- | --- | --- | --- | --- | --- |
| one | `beach` | 2,264 | — | 238.8 | 11,935 | 1 |
| one | **`ring`** | **2,962** | **+30.8%** | 312.4 | **11,935** | **1** |
| one | `ring-pair` | 3,424 | +51.2% | 361.1 | 11,935 | 1 |
| forest | `beach` | 79,240 | — | 8,357 | 421,369 | 1 |
| forest | **`ring`** | **103,714** | **+30.9%** | 10,939 | **421,369** | **1** |
| forest | `ring-pair` | 120,524 | +52.1% | 12,712 | 421,369 | 1 |

⚠⚠ **`sq units of land` is identical to the last decimal, and that is the check rather than a
leftover.** The ring *divides* parcels. A division that lost ground would be a hole in the island;
one that double-counted it would draw **one capability's status colour over another's** — a
misreport, and the one way this component could do real harm (ADR-0392 D5 / ADR-0398 D7). Conserved
area is the evidence that a divided parcel is still the same parcel. The driver refuses any run in
which it moves.

### Frame cost — only the rows that reproduced across two runs

⚠ **Two full runs were taken and compared row by row. Most rows did not reproduce**, in the way this
arc has now seen four times: the forest at 8 px/unit and fitted came back 170–530% apart between
runs, with in-run spreads of 0.3–0.9 ms. Those rows are **dropped**, not averaged. What follows is
every row where both runs agreed to within 1% *and* the in-run spread was under 0.01 ms.

| group | `beach` | **`ring`** | `ring-pair` |
| --- | --- | --- | --- |
| one island @ 8 px/unit | 0.546 ms | **0.576 ms (+5.4%)** | 0.585 ms (+7.1%) |
| 35-island forest @ 2 px/unit | 0.351 ms | **0.438 ms (+24.7%)** | 0.493 ms (+40.5%) |

The forest number is the honest one to quote for cost, and **0.44 ms is 2.6% of a 60 fps frame.**
ADR-0415 D1 leaves the hardware floor as one of only two grounds for rejecting detail, and this is
not near it.

---

## Why `ring` ships and `ring-pair` does not — and it is not the cost

`ring-pair` has the better average by a distance: mean sag 0.138 against 0.286. Its frame cost is
nowhere near a floor. **On the two numbers this page leads with, it wins.**

What it loses is **coverage**.

| arm | coastal parcels banded (island) | (forest) |
| --- | --- | --- |
| **`ring`** | **47 of 53 — 89%** | **1,657 of 1,849 — 90%** |
| `ring-pair` | 36 of 53 — 68% | 1,313 of 1,849 — 71% |

An inward offset of a curve crosses itself as soon as the offset exceeds the curve's radius of
curvature, and this coastline is a noise-perturbed curve whose headlands sometimes turn tighter than
4.67 units. Where the outer chain cannot be placed honestly the parcel gets **no** band. So
`ring-pair` leaves roughly a fifth of the shore abrupt — and a band that keeps stopping reads worse
than one that is uniformly gentler.

⚠ **This is a property of the implementation, not of two rings, and it is worth revisiting.** The cap
degrades a chain's *depth* and not the ring *count*, so a parcel that cannot carry the outer chain
falls back to no chain rather than to the inner one. Fixing that would very likely make `ring-pair`
the better arm on both measures. It is named here so the refusal is revisitable rather than final.

---

## How it works, and the two things that would have broken it

**The move.** For each parcel that meets the coast, insert a chain of vertices at a fixed distance
inland and divide the parcel's top face along it. The precedent is one dimension over: the coast
clip's `subdivide` arm inserted the coastline's own points along each rim *edge*, so the island's
boundary became the curve. This does the same thing *inside* the parcel.

**⚠ The cheap version does not work, and it is worth knowing which one.** Inserting the new points
*collinearly* into the parcel's own outline — the literal transcription of the coast clip's move —
leaves the polygon's shape unchanged, so the triangulator is free to route straight past them. The
band only bends if the face is actually **divided**.

**⚠⚠ Neighbouring parcels cannot be allowed to disagree.** Two parcels share an edge; if each placed
its own point on that edge, the two would land a few floating-point steps apart, which is two
heights, which is **a crack running the length of the shore**. The rule is deliberately *edge-local*
and therefore automatically agreed: a point goes on an edge exactly when the inset lies between its
two endpoints' distances from the water, solved in the edge's canonical orientation. Two parcels
computing it independently get the identical number. The chain's *interior* points need no agreement
— they are strictly inside one parcel and no neighbour ever sees them.

**⚠⚠ And the skirt has to follow the same outline.** A top face that bends through a point on an
edge, over a wall that spans that edge straight, is the same hairline crack by another route. So the
wall carries every inserted point too — two triangles apiece, rather than the whole parcel's worth a
second parcel would have cost.

**The cap, and it is reported rather than silent.** Where the coast turns tighter than its ring, the
chain is demoted down the coast clip's own scale ladder until the division holds — keeping a
shallower band rather than none. 18 of the island's 47 banded parcels were capped. The ladder's
bottom rung is *dropped*: a zero-depth band delivers no shape and still costs its triangles, so those
parcels keep their undivided outline instead.

---

## Reproduce

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5302 --strictPort
DISPLAY=:0 ST_SHORE_URL=http://localhost:5302/shipped-shore.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-shore
```

Needs a real GPU — the driver refuses a software rasteriser rather than committing its numbers.
`shore-measurements.md` / `.json` are run A; `shore-measurements-run-b.json` is the independent
second run the frame table above was filtered against.

Module: `packages/forest-world-r3f/src/shore-ring.ts`. Page:
`packages/forest-world-r3f/harness/shipped-shore.html`. Yesterday's evidence, which is this page's
denominator: `docs/research/chapter2-shipped-shore-2026-09-01/`.
