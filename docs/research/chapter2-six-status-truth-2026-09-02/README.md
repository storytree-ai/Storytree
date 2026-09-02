# The map still tells the truth — all six statuses, one forest

`adopt-the-land-into-the-shipped-map-arc` · increment `demonstrate-the-map-still-reports-truth` ·
2026-09-02 · `packages/forest-world-r3f`

**Every one of the 35 fixture islands read as the status it holds and none read as a state it does
not hold, at both of this arc's zooms** — 31 island-reads judged (0 empty, 0 FAIL), all six statuses
judged at both 2 and 8 px/unit, and the pair-separation table's only zero is exactly `proposed`/
`building`, the pair ADR-0462 decided share one token. Nothing here was asserted; every number below
came off a real GPU render of the shipped ground.

Reproduce (the driver refuses a software rasteriser and the shared vite ports):

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5361 --strictPort --host 127.0.0.1
```

```bash
ST_STATUS_URL=http://127.0.0.1:5361/shipped-status.html pnpm --filter @storytree/forest-world-r3f measure-shipped-status
```

Renderer for every number here: **ANGLE / Qualcomm Adreno X1-85, D3D11** — a real GPU, not
SwiftShader. `status-truth.txt` is the run verbatim; `status-truth.json` the same data.

---

## 1. The premise, checked at source before anything was built

- **The shipped map carries status as COLOUR ONLY**, and the ground's colour lookup
  (`ForestWorldCanvas.tsx`'s `GROUND_COLOUR`) holds **five hexes over six statuses**: `proposed` and
  `building` are the SAME authored token, `#d8c069`. This is a decision, not a defect —
  ADR-0462 D1/D2 (its predecessor on this point, ADR-0461, is superseded by ADR-0475): *"if something is building just color it
  yellow because its basicly the same as proposed, theres no value add."* An instrument that
  condemned the pair for reading alike would be condemning the decision, not a bug.
- **Only `healthy` wears the grass layer** (`GRASS_STATUS_GATE = ['healthy']`, ADR-0492 D1). Layers
  2/3/4 (shore sand, the worn path, rock on slope) all ride the same `grassGate`, so they can only
  ever alter a `healthy` parcel's pixels — an ungated row multiplies them by zero. Layer 6 (the
  cliff normal as detail relief) only moves a fragment between authored rungs of its own token's
  ramp. Every layer this ground now carries **modulates the status ramp and never replaces it**
  (ADR-0490 D5) — which is exactly the property a six-way separability claim depends on, and exactly
  what an added layer could have quietly eroded without anyone noticing until this landing.
- **The terrain vocabulary that would separate `proposed` from `building`
  (`harness/terrain-vocabulary.ts`, `harness/terrain.html`) is harness-only and not adopted onto the
  shipped map** — the increment `name-the-four-states-as-terrains` scoped that adoption out. So on
  the shipped map the pair is byte-identical **by decision**, and this run's job is to measure that
  identity rather than to hide it (the same move `harness/status-measure.mjs` already made on the
  older four-terrain page).
- **The `building → proposed` fold lives in `apps/studio/src/lib/worldStatus.ts` and runs BEFORE
  `buildScene()`** — the r3f canvas never receives `building` from real data; only this harness's own
  fixture (`harness/crowd-layout.ts`'s `CROWD_POPULATION`) injects it, which is why the fold cannot be
  tested from inside this package and isn't.

## 2. The instrument (`harness/status-truth.ts`)

Given a rendered frame, the scene's background colour, a list of islands (`{id, status, rect}` in
frame pixels) and a reader table, the instrument:

1. Builds the reader table as **every authored rung × every status token** —
   `SHADE_LEVELS` plus the derived shadow rung (`shippedLadder()`, imported from
   `grain-status-reading.ts` rather than re-derived), delivered per status token via
   `deliveredForLevel`. Not one reference colour per status: the shipped ladder can deliver any of
   nine lit rungs plus the shadow rung depending on a fragment's slope and occlusion, and a
   single-reference table would call honest shading a misread.
2. For every non-background pixel inside an island's rect, finds the NEAREST table entry
   (`nearestReadStatus`, the arc's own luma-weighted distance — `W_LUMA = [0.3, 0.59, 0.11]`,
   transcribed from the same quantiser `harness/shadow-ladder.ts` and `harness/ground-cover.ts`
   already use) and folds the result onto a **family key** (`familyKeyOf`) — the alphabetically first
   member of the set of statuses sharing that status's authored token, so `proposed` and `building`
   vote into ONE bucket rather than splitting a majority in two.
3. The island's **read family** is the plurality of those family votes; **own share** / **foreign
   share** are the fractions voting for the island's own family versus any other; **pass** is
   `readFamily === ownFamily`. An island with zero ground pixels in its rect (fully off-frame, or
   entirely background after the rect is shrunk) is reported **empty**, never a pass.
4. `statusPairSeparation` reports, for every pair of statuses, the minimum colour distance between
   their delivered-colour sets — the same reader table's own separation floor.

### Hostile fixtures and the seeded-fault sweep

`harness/status-truth.test.ts` holds 16 tests, including: an island painted entirely in a foreign
token (must FAIL, reading as that foreign family); a `healthy` island mixed with a real grass colour
at `SHIPPED_GRASS_MIX` (0.32) (must still read `healthy`); background pixels inside a rect that must
not vote; an island rect with zero ground pixels (must report `empty`, never a pass); a 90/10
majority split (the plurality must win, and `ownShare`/`foreignShare` must not be interchangeable);
an exact 50/50 tie between two DIFFERENT statuses (the alphabetically-first family must win the tie,
never the island's own status by construction); and the pair table (`proposed`/`building` at exactly
0, every other pair above 0).

**`check:mutation-diff` mutates `src/` only, so `harness/` is unproven by it** — this module's proof
is the hand sweep. Six faults were seeded one at a time, directly into `status-truth.ts`, each
restored before the next: flipping the plurality to the minority (argmax → argmin), counting
background pixels as ground, dropping the blue channel from the distance, swapping the `ownShare`/
`foreignShare` fields, making an empty island pass, and letting a tie resolve to the LAST-sorted
family instead of the first (`>` → `>=`). **All six were killed on the first sweep (6/6)**, and the
file was diffed byte-identical to the pre-sweep original afterward.

## 3. The comparison page (`harness/shipped-status-scene.ts` + `.html`)

The page builds the real fixture forest's ground the ONE way the map builds it — `shippedGroundBuild`
+ `buildGroundMaterial`, imported from `ForestWorldCanvas.js` and mirrored key for key against
`CellGround`'s own `useMemo` body (grass, sand, the worn path, rock, the cliff detail relief, all at
the shipped strengths, no custom token table — the whole point is the map's own five colours). Every
island's screen rect is a **projection, not a guess**: since every island is a rigid translation of
the SAME one-island fixture, its view-space footprint is the fixture's own footprint
(`viewSpaceExtent`, the same projection `shipped-crowd-scene.ts`'s private `shippedIslandExtent`
performs) shifted by the island's world offset carried through the camera's own affine transform
(`viewSpaceShift`: `M(d) - M(0) = A·d` for any affine `M`) — no per-vertex re-projection of the merged
mesh is needed. Because islands sit close enough at this crowd's density to overlap in the raw
projection, every rect is **shrunk to its middle 60%** (`STATUS_RECT_SHRINK`) before any pixel is
voted — a documented choice, not a tuned one: it gives up a margin on every side rather than risk a
neighbour's colour entering the vote.

At 8 px/unit only one island sits near the forest's own centroid by default — the frame holds ~320×200
ground units against a crowd spread over thousands. The page (and the driver, independently) checks
which statuses are geometrically present in the default frame at each zoom and, for any that are not,
renders an **additional frame recentred on one of that status's own islands**
(`orientedCamera(centre, …)` takes a world-space centre directly) — so every status is judged at both
zooms rather than only the ones the random scatter happened to place centrally.

## 4. The verdict, both zooms

31 island-reads judged, **0 empty, 0 FAIL**. Every status was judged at both 2 and 8 px/unit:

| status | judged at |
|---|---|
| building | 2, 8 |
| healthy | 2, 8 |
| mapped | 2, 8 |
| proposed | 2, 8 |
| unhealthy | 2, 8 |
| unknown | 2, 8 |

A representative slice (full table in `status-truth.txt`):

| island | status | read family | own% | foreign% | verdict |
|---|---|---|---|---|---|
| crowd-story-13 | proposed | building | 100.0% | 0.0% | PASS |
| crowd-story-16 | mapped | mapped | 100.0% | 0.0% | PASS |
| crowd-story-17 | healthy | healthy | 94.2% | 5.8% | PASS |
| crowd-story-03 (recentred) | unhealthy | unhealthy | 100.0% | 0.0% | PASS |
| crowd-story-27 (recentred) | unknown | unknown | 100.0% | 0.0% | PASS |
| crowd-story-08 (recentred) | building | building | 100.0% | 0.0% | PASS |

⚠ **`proposed` islands correctly read as `building`, not as `proposed`** — `familyKeyOf` folds the
shared-token pair onto its alphabetically-first member, so a `proposed` island's plurality vote lands
on the label `building` while `pass` is computed against the FAMILY (both labels), not the exact
string. This is the fold working as designed, not a `proposed`-specific defect: no pixel in the
reader table can ever vote `proposed` over `building` at the shared token, because the two entries are
byte-identical and ties resolve alphabetically every time (`nearestReadStatus`, `status-truth.test.ts`'s
tie-break test).

The `healthy` islands' own-share sits at 91–94% rather than 100% — the remainder is genuinely `unknown`-
or `mapped`-nearest votes from the map's own layered pixels (sand, worn path, rock on slope, the cliff
normal, all still gated or bounded as §1 describes) landing marginally nearer a different token at a
handful of pixels near an island's edge. It never moves the plurality.

## 5. The pair-separation table

| status a | status b | min distance |
|---|---|---|
| building | proposed | **0.00** |
| healthy | unknown | 25.12 |
| building | healthy | 25.58 |
| healthy | proposed | 25.58 |
| building | unknown | 28.94 |
| proposed | unknown | 28.94 |
| mapped | unhealthy | 30.10 |
| building | mapped | 35.07 |
| mapped | proposed | 35.07 |
| unhealthy | unknown | 42.15 |
| healthy | mapped | 48.32 |
| mapped | unknown | 40.94 |
| healthy | unhealthy | 46.02 |
| building | unhealthy | 65.53 |
| proposed | unhealthy | 65.53 |

**`building`/`proposed` at exactly zero is the measured identity ADR-0462 D1/D2 decided** — one
authored token under two keys, "a fact about the code that no later edit can half-apply" — never a
defect this run is reporting. Every other pair sits well above zero (the next-lowest, `healthy`/
`unknown`, is 25.12 channel units apart), which is what the six-way separability claim above rests
on: every status the map can independently colour, it colours distinguishably.

## 6. What this demonstration does NOT show

- **The `proposed`/`building` pair is separable only by a channel that is not on the shipped map.**
  `harness/terrain-vocabulary.ts` carries that channel; adopting it is a separate, later event this
  increment does not authorise or attempt.
- **This is the GROUND alone**, per ADR-0475 D2's own frame — island-level state reads off the
  ground at the opening view; per-capability state reads off the props on zoom (ADR-0475 D5(b)),
  which this page does not render or judge.
- **The fold from `building` to `proposed` on real data** (`apps/studio/src/lib/worldStatus.ts`) is
  entirely outside this package and untested here — this run's `building` islands come only from the
  harness fixture, never from a live capability's own worldStatus.

## 7. Files

| | |
|---|---|
| `harness/status-truth.ts` + `.test.ts` | the pure reader: the full reader table, the nearest-status search, the family fold, per-island and whole-verdict aggregation, the pair-separation table; 16 hostile tests, 6 hand-seeded faults, 6/6 killed |
| `harness/shipped-status-scene.ts` | the shipped ground stack mirrored onto the page, the affine per-island rect projection, the runner (`identity`/`frame`/`verdict`/`snapshot`/`pairs`/`islandOffsets`), the mount |
| `harness/shipped-status.html` | the page shell — premise paragraphs with the corrected ADR citations, per-zoom verdict tables, the pair-separation table |
| `harness/shipped-status-measure.mjs` | the driver: renders both zooms plus any recentred frames a status needs, refuses on any genuine misread, under-judged status, or a wrong zero-pair set |
| `packages/forest-world-r3f/package.json` | `measure-shipped-status` script |
| `forest-2.png` / `forest-8.png` | the two default-centre frames |
| `forest-{2,8}-recentred-<status>.png` | the extra frames this run needed to judge every status at both zooms |
| `sheet.png` | a 4-up contact sheet of the above |
| `status-truth.json` / `.txt` | the run's data and verbatim report |
