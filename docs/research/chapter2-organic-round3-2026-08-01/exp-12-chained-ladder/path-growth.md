# exp-12 — path-growth treatment

**Treatment: "the path arrives first."** When an island is placed, its incident trails draw on
*ahead of* the island's own settle, growing outward from the arriving island, painted with a
PixelLab-authored worn-dirt cross-section instead of a flat stroke, and reaching full worn width only
once the destination story is healthy.

This is a **wiring + paint** treatment, not new machinery. Every moving part below already exists,
is pure, and is unit-tested.

---

## 1. The existing machinery it rides (verified in code, 2026-08-01)

| piece | file | what it already does |
|---|---|---|
| `arrivalGrowPlan(network, arrivalIds)` | `packages/app-surface/src/trailReveal.ts:150` | roots at the ARRIVING island(s), walks each incident edge's segment chain outward, folds shared segments to the earliest draw-on, returns a `TrailRevealPlan`. Pure, deterministic, tested (`trailReveal.test.ts`). |
| `REVEAL_STAGGER_MS = 350` | `trailReveal.ts:24` | per-chain-position stagger. `delayMs = chainIndex * 350`. |
| `RevealSegment.fromEnd` | `trailReveal.ts` | true ⇒ the mask grows from the segment path's geometric END, so growth always runs *away* from the arriving island even when the stored chain is drawn the other way. |
| `WorldPresentationModel.reveal` | `packages/app-surface/src/WorldSceneView.tsx:61` | the slot the plan is handed in on. |
| mask + width hookup | `packages/app-surface/src/SceneView.tsx:805-811` | a segment in the plan gets `mask="url(#trail-m-<id>)"` and `strokeWidth = trailFillWidth(seg.revealedUsage) + widen` (casing +2.5, shadow +5). |
| `is-growing` class | `SceneView.tsx:294-296, 322-326` | stamped on `.trail-fill` / `.trail-ghost` for any planned segment. |
| the `<mask>` defs | `apps/studio/src/components/TreeView.tsx:2676-2699` | one `<mask id="trail-m-…">` per planned segment: a white stroke over the segment's own `d`, `pathLength={1}`, `userSpaceOnUse` with oversized bounds, `animationDelay: seg.delayMs`. |
| the draw-on animation | `apps/studio/src/index.css:1829-1842` | `.trail-reveal-mask` — `stroke-dasharray: 1`, offset 1→0 (or −1→0 for `.from-end`). Length-agnostic because of `pathLength=1`. |

**The gap, confirmed:** `apps/studio/src/components/SemanticGrowthDemo.tsx:376-378` sets
`neighbours`, `lanes` and `laneMotion: 'draw'` — that is only the ADR-0242 *lit selection lane*
highlight. It **never sets `reveal`**, so `growPlan` is null, no masks are emitted, and the dirt trail
is fully drawn from the first frame. The path-growth beat has never played in the Chapter 2 witness.
It was never missing from the engine; it was never plugged in.

---

## 2. The treatment, in three increments

### Increment A — plug it in (no new assets, no new machinery)

In the Chapter 2 witness, compute the plan for the island being placed at this step and pass it:

```ts
const growPlan = arrivalGrowPlan(network, arrivingIds);   // arrivingIds = the step's placements
// …
reveal: growPlan,
```

That alone restores: draw-on from the arriving island outward, 350 ms per chain position, direction
correctness via `fromEnd`, and the shared-segment fold. Deterministic frame selection stays with the
app (ADR-0274 D3) — the plan is a pure function of the network and the arrival set.

### Increment B — the path leads the island in (this is the varied beat)

Sibling treatments in this round grow the trail *after* the island settles. This one inverts it: the
reveal starts **one stagger step (350 ms) before** the island's own settle animation, so the trail
reaches the socket just as the island lands on it. The island then appears to arrive *along* a path
that was already reaching for it, instead of sprouting and then sprouting a road.

Implementation is a negative offset on the existing per-segment delay — no new timing system:
`animationDelay: seg.delayMs - REVEAL_STAGGER_MS` clamped at 0 for the first chain position, with the
island's settle scheduled at `REVEAL_STAGGER_MS`. The app keeps ownership of the clock (ADR-0274 D3);
the asset carries no timing.

### Increment C — paint the stroke with the generated dirt profile

`.trail-fill` is a flat stroke today. Replace its paint with the PixelLab tile set's **transverse
profile** — one 32 x 3 px strip cut author-time from the N–S straight tile (`trail-profile.png`,
**103 bytes**, 11 occupied pixels across, 4 tones: `#e6ccc2 #ddc4b9 #cdb194 #c7a788`).

Two ways to ride it, both compatible with the existing mask:

1. **SVG `<pattern>` with `patternTransform` per segment** — the profile repeated along the segment,
   rotated to the segment's tangent. Cheap, but a curved segment needs the pattern re-oriented per
   sub-span.
2. **A single `<image>` sprite per segment, generated author-time** — stamp the profile perpendicular
   along the segment's own `d` at author time, emit one PNG per trail segment, and let the existing
   `mask="url(#trail-m-<id>)"` grow it. This is what `path-stroke-demo.png` shows: the same profile
   ridden along an arbitrary quadratic curve, rendered at mask progress 0.35 / 0.70 / 1.00. The
   reveal mechanism is untouched — only the paint under it changes.

**Health-gated width.** `trailFillWidth(seg.revealedUsage)` already steps the stroke by the number of
revealed edges. Add a second, smaller step keyed on the *destination* story's health, so a trail to an
unhealthy story draws on thin and only widens to its full worn width when the story goes green. The
plan already carries `revealedUsage` per segment; the health lookup is app state, not asset state.

---

## 3. How the 18 configs map onto the trail segment chain

The app's trails are **arbitrary-geometry SVG segments** (`s.d` path data on a pan/zoom world
camera), not a square grid. So there are two mappings, and I recommend the first.

### Mapping 1 (recommended) — the set is a TEXTURE SOURCE, not an autotiler

| tiles | mask | role |
|---|---|---|
| `tile_2`, `tile_4`, `tile_7` | N-S (5) | **the transverse profile** — cut one row across the straight (row 16, well clear of the depth band), and that is the stroke paint for every segment regardless of its geometry. The three straights give three worn-ness variants: map them to `revealedUsage` 1 / 2 / 3+, which is exactly the width step the code already computes. |
| `tile_6`, `tile_13`, `tile_15`, `tile_16` | NESW (15) | **junction decals** stamped at a trail node where `usage >= 3` — the trodden-out scuff where several trails meet. |
| `tile_10`, `tile_11`, `tile_12`, `tile_14` | T (7 / 13 / 14) | **fork decals** at a node where a segment chain branches in two. |
| `tile_0`, `tile_1` | ground (0) | unused — the app owns the ground plane. |
| `tile_3`, `tile_5`, `tile_8`, `tile_9` | corners (3 / 9 / 6 / 12) | unused — an SVG curve needs no corner tile. |

11 of 18 tiles carry a role; 7 do not. Total shipped asset weight under this mapping is **one 103-byte
profile PNG** plus, optionally, 2–4 junction decals at 32 x 32.

### Mapping 2 (only if the map ever becomes a grid) — the standard 4-bit autotile

`mask` bits: `bit0=N bit1=E bit2=S bit3=W`; a set bit means the path continues across that edge.
Look up the cell's mask from its painted neighbours and place:

`0 → tile_0/1` · `3 → tile_3` · `5 → tile_2/4/7` · `6 → tile_8` · `7 → tile_10/14` ·
`9 → tile_5` · `12 → tile_9` · `13 → tile_11` · `14 → tile_12` · `15 → tile_6/13/15/16` ·
`tile_17` is stamp-only (a solid path fill).

---

## 4. What I measured about the generated set — including two defects

`create_path_tiles`, job **`9e383226-5853-49a2-bf38-87a21e37b945`**, seed **31250**, cost 20–40
generations. Args: `tile_type: square_topdown`, `tile_size: 32`, `tile_view_angle: 55`,
`tile_depth_ratio: 0.18`, `outline_mode: segmentation`.

> pale blush cream grassland ground in soft warm pink-beige, crossed by a worn warm tan dirt footpath
> with a slightly darker packed-earth centre and soft irregular edges; muted storybook pixel art, low
> contrast, no rocks, no grass blades, no flowers

**Palette match: good.** Measured against the real SVG island reference plate:

| | tile set | reference plate | delta |
|---|---|---|---|
| ground / background | `#f0ddd6` | `#f2e3dc` | (2, 6, 6) — near-identical |
| path | `#cdb194` | island body `#ab8f62` | (−34, −34, −50) — the path is lighter than the island body, which is correct: a worn path reads as scuffed-lighter earth on top of it |

**Edge rules: honest.** I measured each tile's true edge connectivity (path-coloured pixels in the
middle band of each edge, sampled 3 px inside the frame) against the declared mask.
**All 17 placeable tiles match their declared mask exactly** — see `path-tiles.png`, where each tile
is labelled `declared=observed`.

### Defect 1 — the set covers only 10 of the 16 masks

Observed masks present: `0, 3, 5, 6, 7, 9, 12, 13, 14, 15`.
**Missing: `1, 2, 4, 8` (all four dead-ends), `10` (the E–W straight) and `11`.**

That matters for mapping 2: a **spur** — the app's `usage === 1` dashed footpath that terminates at
an island — has no dead-end tile, and a horizontal run has no straight. `path-tiles-demo.png` renders
a demo route through the set: **4 of its 9 path cells needed mask 10 and had to be filled with a
90°-rotated N–S straight** (outlined in red in the image).

### Defect 2 — `tile_depth_ratio: 0.18` bakes a seam into every tile

Every tile, **including the two plain-ground tiles**, carries a band of `#755a3b` across **rows 0–1
and rows 29–31** — the 2.5D "tile thickness" side wall. It overwrites the path where the path crosses
those rows, so even a straight is chopped at both ends. Tiled, that becomes a hard dark grid line
across the whole map; rotating a tile for the missing E–W mask puts the band on the vertical edges
instead. Both are plainly visible in `path-tiles-demo.png`.

**Remedy (one call):** regenerate with `tile_depth_ratio: 0` and `tile_view_angle: 75` — a trail lies
on the ground plane and has no thickness. I attempted exactly that
(job `317ad7bf-40a4-4fe8-a962-dadf594028b3`, seed 31251) and it returned
`status: failed — "You have run out of generations and credits"`: the shared round-3 pool had fallen
to 33 remaining while this 40-generation call was in flight. The retry is one call away when budget
returns.

**Note that mapping 1 is immune to both defects.** It never tiles anything: it cuts a single
transverse profile out of the middle of a straight tile, far from the depth band, and paints it along
the app's own arbitrary-geometry segments. Both defects only bite the grid autotiler in mapping 2.

---

## 5. Assets this treatment needs

| asset | source | size |
|---|---|---|
| `trail-profile.png` (32 x 3, 4 tones) | cut author-time from `raw/pathtiles/…_2.png` row 16 | **103 B** |
| junction / fork decals (optional, 2–4 of them) | `tile_6`, `tile_10` unmodified | ~1 kB each |

Nothing else. No new component, no new timing system, no vendor call at runtime (ADR-0274 D2 /
ADR-0219) — increments A and B need **zero** new assets, and increment C needs 103 bytes.

## 6. Evidence in this directory

- `path-tiles.png` — all 18 tiles at 4x, each labelled `declared=observed` edge mask.
- `path-tiles-demo.png` — a demo route autotiled from the set; the dark depth-band seams and the four
  rotated cells (red) are the two defects, visible.
- `path-stroke-demo.png` — the extracted profile ridden along an arbitrary curve at mask progress
  0.35 / 0.70 / 1.00, i.e. increment C under the existing `arrivalGrowPlan` reveal.
- `trail-profile.png` — the 103-byte asset itself.
- `raw/pathtiles/` — the 18 unmodified returns and the source zip.
