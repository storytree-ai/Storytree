# One hex is the minimum: the zero-capability islands, before and after (2026-09-06)

Owner feedback on `land-ground-stack-arc`, verbatim: **"no capabilities should just be 1 hex which
should be the minimum."** The bug he found: `landRatioFactor` (ADR-0520, `land-per-capability.ts`)
sized every island to `capabilities × 318` — and LEFT an island holding no capability at the size
the drawing gave it, three hex tiles of the radius-27 lattice, ≈ 5,680 units². So the stories with
the least work in them were among the largest things on the map.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA GeForce
> RTX 2060** (ANGLE / OpenGL 4.5), `software=false`, exact-colour mode, on the REAL forest — the
> studio's own layout for the live corpus at the shipped spacing rung
> (`chapter2-forest-spacing-2026-09-06/scenes/spacing-0.json`, 35 islands). Nothing is inherited
> from an increment row, an arc intent or an earlier sheet. The `today` control is the mapper as it
> shipped after ADR-0520, typed as history (`floor: 0`); the `shipped` arm is held to be
> byte-identical to a bare `worldTo3D(scene)` by `shipped-island-floor-scene.test.ts`.

## The answer to the owner's question

**Is the biggest island the one with the most work in it?** Yes — on both arms. `drive-machinery`
(26 capabilities, 8,268 units²) was already rank 1 of 35. What was wrong was the BOTTOM of the
ranking, not the top: the four islands holding NO work sat at ranks 3–6.

| | today (control) | shipped |
| --- | --- | --- |
| largest island | drive-machinery — 26 capabilities, 8,268 units² | the same |
| smallest island | forest-world — 1 capability, 318 units² | storage-protocol — 0 capabilities, 318 units² |
| the zero-capability islands | **ranks #3, #4, #5, #6** — 5,689 / 5,684 / 5,679 / 5,675 units² | **ranks #31, #32, #33, #35** — 318 units² each |
| pairs drawn the wrong way round (fewer capabilities, more land) | **116** — each zero-capability island larger than 29 islands holding work, up to `library-tech-tree-overlay` (16 capabilities, 5,088 units²), 1.12× its size | **0** |
| every island at `max(floor, capabilities) × 318` | yes for every island HOLDING work; the zero-capability islands off-ratio by rule | yes, all 35 |
| total land | 87,281 units² | 65,826 units² |

**Are the smallest islands now the ones with the least work?** Yes, exactly: the four
zero-capability islands draw 318 units² each — one capability's worth — tied with the one
one-capability island (`forest-world`, 318). No island with fewer capabilities is drawn larger than
one with more (`islandSizeInversions` is empty), and the islands holding work did not move by a
unit²: ADR-0520's ratio is settled.

⚠ The corpus carries **four** zero-capability islands, not the three named in the brief:
`proof-protocol`, `storage-protocol`, `website` and `feedback-graduation`.

## The pictures

- `sheet-forest-fit.png` — the whole real forest, fitted, on the SAME frame for both arms. Today the
  four flat lobed islands with no trees on them are the biggest blobs on the map; shipped, they are
  the smallest. Land 0.89% → 0.70% of the frame; 8,240 px moved past 20/255.
- `sheet-one-8px.png` — `website` (0 capabilities) and its neighbours at 8 px/unit. Today it fills a
  1,684 × 600 px box; shipped, 1,395 × 363 (the box includes the neighbours at the frame's edges — the
  island itself is 3× smaller edge to edge). 305,596 px moved.

## Every island — capability count and drawn area (`report.txt`, `islands.json`)

| island | caps | 2D tiles | land as drawn | today | rank | shipped | rank |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| drive-machinery | 26 | 28 | 52,980 | 8,268 | 1 | 8,268 | 1 |
| studio | 20 | 22 | 41,698 | 6,360 | 2 | 6,360 | 2 |
| library-tech-tree-overlay | 16 | 18 | 34,097 | 5,088 | 7 | 5,088 | 3 |
| desktop | 12 | 14 | 26,517 | 3,816 | 8 | 3,816 | 4 |
| library | 12 | 14 | 26,516 | 3,816 | 9 | 3,816 | 5 |
| library-review | 9 | 11 | 20,841 | 2,862 | 10 | 2,862 | 6 |
| website-experience | 9 | 11 | 20,834 | 2,862 | 11 | 2,862 | 7 |
| cli · app-surface · context-traversal-capture · wisp-as-story-claim · studio-cloud | 7 | 9 | ≈17,040 | 2,226 | 12–16 | 2,226 | 8–12 |
| ci-cd | 6 | 8 | 15,157 | 1,908 | 17 | 1,908 | 13 |
| studio-members · binding-staleness · context-traversal-transcript | 5 | 7 | ≈13,250 | 1,590 | 18–20 | 1,590 | 14–16 |
| notice-board · app-guide · art-factory · uat-criterion-detail | 4 | 6 | ≈11,355 | 1,272 | 21–24 | 1,272 | 17–20 |
| agent · terminal-repo-picker · arc · proof-binding-integrity · uat-attestation · context-traversal-spawn | 3 | 5 | ≈9,470 | 954 | 25–30 | 954 | 21–26 |
| embedded-terminal · terminal-tabs · context-traversal-telemetry · uat-detail-studio | 2 | 4 | ≈7,570 | 636 | 31–34 | 636 | 27–30 |
| **feedback-graduation** | **0** | 3 | 5,679 | **5,679** | **5** | **318** | 31 |
| **proof-protocol** | **0** | 3 | 5,675 | **5,675** | **6** | **318** | 32 |
| **website** | **0** | 3 | 5,684 | **5,684** | **4** | **318** | 33 |
| forest-world | 1 | 3 | 5,675 | 318 | 35 | 318 | 34 |
| **storage-protocol** | **0** | 3 | 5,689 | **5,689** | **3** | **318** | 35 |

## How the floor is written, and why it is correct on both drawings

`LAND_FLOOR_CAPABILITIES = 1`: an island is sized as if it held at least one capability —
`max(floor, capabilities) × LAND_AREA_PER_CAPABILITY`. The floor is written in the RATIO's terms,
not in today's hex constant, on purpose:

- **On today's radius-27 drawing** (what the studio's 2D map still draws — `max(3, capabilities + 2)`
  tiles), the mapper scales the three tiles (5,680 units²) down by a factor of 0.237 to 318. The
  invariant holds today, on the shipped 3D map, with no residual: a zero-capability island equals a
  one-capability island and is smaller than everything else.
- **Once ADR-0528's derived tile lands** (one hex per capability, a hex being exactly 318 units²,
  `max(1, capabilities)` tiles — in flight on `claude/tile-footprint`), "one hex" and "one
  capability's worth" are the same quantity, and the factor is ≈ 1. The floor does not need
  re-picking. `land-per-capability.test.ts` holds the invariant on BOTH drawings.
- Had the floor been written as one hex OF TODAY'S TILE (1,894 units²), a zero-capability island
  would have stayed six times a one-capability one and larger than everything up to six
  capabilities. That residual is what writing it in the ratio's terms removes.

What this landing does NOT reach: the 2D studio map and the public site's SVG still draw a
zero-capability story at three tiles until ADR-0528 lands; that is the other branch's unit.

## Files

`today-forest.png` · `shipped-forest.png` · `today-one.png` · `shipped-one.png` (2560×1600) ·
`sheet-forest-fit.png` · `sheet-one-8px.png` · `measurements.json` · `islands.json` · `report.txt`.

Page: `harness/shipped-island-floor.html` (`shipped-island-floor-scene.ts`); driver
`shipped-island-floor-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f
measure-shipped-island-floor`, `DISPLAY=:0` on the Mint box).
