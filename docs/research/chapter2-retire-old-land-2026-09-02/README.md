# Retire the old land path — `retire-the-old-land-path`, 2026-09-02

**Arc:** `adopt-the-land-into-the-shipped-map-arc` — end-state item 6, the LAST unit on the arc:
"Delete the old land path so the shipped map draws the new treatment and nothing else — a flag
nobody flips is not adoption, and two land renderers is a worse outcome than either." Cites
ADR-0380 D6 (running the experiment and adopting its result are separate events).

## What was retired, and why

The second land renderer in `packages/forest-world-r3f` was the CLASSIC EXTRUDED-HEX PRISM
ground — data-selected via `scene.ts`'s `relaxedCells: null` branch, never flag-selected, but
mounted unconditionally beside the relaxed-mesh ground and drawn whenever a scene happened to
carry `tile` nodes. No production surface (studio, public site) has emitted a classic scene since
before this arc began; the only producers were harness fixtures and tests. Leaving it meant a
change to the mesh path's look could quietly diverge from a second, dead code path nobody was
watching — exactly the "two land renderers is a worse outcome than either" the end-state item
names.

**Deleted:**
- `src/ForestWorldCanvas.tsx`: `HexGround` (the instanced 6-segment `cylinderGeometry` prism
  component), its unconditional mount, the `grounds` slice, and the size constants `HEX_RADIUS` /
  `TILE_HEIGHT`.
- `src/world-to-3d.ts`: `'hex-ground'` from the `InstanceKind` union, the `case 'tile'` mapping
  logic, and `'tile'` from `ISLAND_GROUP_KINDS` (dead once `case 'tile'` refuses before that set
  is ever consulted for a tile node's own island).
- `harness/status.tsx`, `harness/status.html`, `harness/status-measure.mjs`, and the
  `measure-status` package.json script — an old comparison arm whose evidence is committed at
  `docs/research/chapter2-status-vocabulary-2026-08-27/`, unreferenced by `land-art-coverage.ts`'s
  `LAND_ART_PAGES` or by any `*.test.ts`, and superseded by `shipped-status.html` /
  `shipped-status-measure.mjs` (from the six-status-truth work).
- `harness/baseline.tsx`'s classic-substrate CONTROL panel (`CLASSIC_SCENE` /
  `CLASSIC_DESCRIPTORS` / `CLASSIC_CENSUS`, the `baseline-classic-control` section, and the
  `hexCenter` / `buildScene` / `SceneG` / `ISLAND_TILES` / `classicHexScene` imports it alone
  needed) — this page called `worldTo3D(CLASSIC_SCENE)` at MODULE LOAD TIME, so leaving it in
  place would have thrown the moment the page loaded, before the canvas ever mounted.
- `harness/shipped-baseline.ts`'s `SHIPPED_HEX_RADIUS` / `SHIPPED_TILE_HEIGHT` exports and the
  `hex-ground` row in `SHIPPED_PRIMITIVES` — nothing in the shipped file transcribes them any more.

## The refusal — a retirement is a refusal, not a silent skip

`world-to-3d.ts`'s `case 'tile'` now throws rather than mapping or skipping. The exact message,
pinned in full by two tests (below), is:

```
world-to-3d: the 3D map draws the relaxed-mesh land only — the classic extruded-hex ground was
retired (adopt-the-land-into-the-shipped-map-arc, retire-the-old-land-path); build the scene with
relaxedCells, not drawTiles
```

It fires the moment `walkNode` meets a `tile`-kind scene node — the earliest honest point
available: `SceneG` (the type `worldTo3D` walks) carries no top-level "which substrate" marker of
its own; `relaxedCells` lives on the CORE's `SceneInput`, one layer up, and is never visible to the
mapper's own recursive walk. A silent `{ kind: 'skipped', sceneKind: 'tile' }` was considered and
rejected: `tile` is a kind this mapper understood and used to draw, so degrading it to a skip would
have silently reproduced the exact 2026-08-28 defect this package exists to keep fixed (a shipped
island with no ground at all, `docs/research/chapter2-shipped-baseline-2026-08-28/`), only now with
no record anywhere that anything had gone wrong.

**A genuinely live consumer was found and fixed, not merely reported.** `harness/main.tsx` — the
package's own default dev-harness demo (`pnpm --filter @storytree/forest-world-r3f dev` →
`index.html` → `main.tsx`) — built a classic scene (`relaxedCells: null`) and called
`worldTo3D(buildScene(demoInput()))` at module scope. Left unfixed, loading the harness would have
thrown before the canvas ever mounted. It is switched to the mesh substrate via
`buildRelaxedCells(drawTiles, wheatSets, 'mesh')` — the same call `apps/studio` and the public site
make — so the demo now exercises the one substrate the mapper still accepts, and its on-screen
census line reports `cell-ground` in place of the retired `hex-ground`.

No other live consumer was found. The full inventory of what was checked and kept follows.

## What was checked and KEPT, and why each is not old path

- **`groundColourOf` / `linearColourOf`** (`ForestWorldCanvas.tsx`) — kept in full. The banded
  ground's resolver (`linearColourOf`) rides `groundColourOf`, so only the prism-specific prose in
  its doc comment was removed; the function itself is live and load-bearing for the mesh ground.
- **The drei `<Line>` trail (`TrailStrip`, gated by `showTrails`)** — checked and kept. The
  increment row's own instruction was to re-grep before sizing, because "layer 3's worn path" only
  supersedes the ON-LAND run of the trail (`island-path.ts`); the ribbon drawn at sea by
  `TrailStrip` is drawn by nothing else and is unrelated to the land substrate this unit retires.
- **`LEGACY_SHADE_LEVELS`** (`src/shade-ladder.ts`) and **`LEGACY_STATUS_TOKENS`** /
  **`ADR0462_STATUS_TOKENS`** (`harness/status-vocabulary.ts`) — kept as frozen historical records,
  read by tests that hold a palette-drift guard to its own past state. Not old land path; a
  different retired-arm pattern (frozen colour tables, not a ground renderer).
- **`harness/status-vocabulary.ts`** itself — kept in full (unlike `status.tsx`/`status.html`).
  Imported live by `hue-frontier`, `land-theme`, `palette-band`, `shadow-ladder`, `clay`,
  `crowd-reading`, and `IslandView` — an active shared module, not the retired comparison page.
- **`harness/IslandView.tsx`** — kept; mounted by all three `LAND_ART_PAGES`.
- **`harness/land-floor-scene.ts`'s `flat` control** — kept; it is the shipped ground's own flat
  arm, not the classic prism.
- **`packages/forest-world/src/scene.ts`'s `relaxedCells: null` ⇒ classic-hex contract** — left
  entirely untouched, per the increment's own instruction: the studio's 2D SVG map still owns
  classic mode, and nothing under `packages/forest-world` was touched.
- **`classicHexScene` / `CLASSIC_TILES`** (`harness/shipped-baseline.ts`) — kept, role changed
  rather than deleted. Before this landing they built the non-vacuity CONTROL for "the mesh case
  ADDED a representation rather than swapping one for another." That claim no longer has anything
  to control for (there is only one substrate left), so their live use now is the OTHER direction:
  feeding a real-core classic scene into the dedicated refusal test, proving the retirement fires
  through genuine mapper code and not only a hand-built `SceneG` literal.

## Tests that changed, and why

- **`src/world-to-3d.test.ts`** — `mkInput` (the default fixture used by ~29 call sites testing
  story-tree / trail / cave / wisp mapping through the real core) now builds the RELAXED-MESH
  substrate via `buildRelaxedCells` instead of the classic scene it built before; every test that
  did not touch ground continues unmodified against the new substrate. The classic-mode ground
  assertions collapse into ONE dedicated refusal test with the message pinned in full (string
  mutants on the message are what this pin exists to kill). Ground-position and status-fold
  assertions move from `hex-ground` to `cell-ground`, checking real non-collapsing geometry rather
  than a `hexCenter`-derived coordinate that no longer applies to an emergent mesh-relaxation
  position. Two tests ("the tree, the tiles and the blooms…", "NO island group ⇒ absent, on every
  one of the four families") drop their classic-tile arms with an explanation of why the property
  they checked no longer has a code path to exercise. One further, unrelated fixture-fragility
  fix: the UAT-bloom-order assertion now sorts before comparing, because which of two criteria's
  markers ends up above the other in the core's Y-sorted paint order turned out to be a
  substrate-dependent accident (the mesh substrate constrains a marker's scatter to land ON a real
  parcel; the classic substrate never did) rather than a contract the mapper makes.
- **`src/parcel-cells.test.ts`**, **`src/ground-casters.test.ts`** — literal `'hex-ground'`
  descriptor kinds (no longer part of `InstanceKind`, so no longer typecheck) are re-pointed to
  `'cave-arch'` / `'uat-bloom'` respectively, keeping the same "another family is stepped over"
  property each test proves.
- **`harness/shipped-baseline.ts` / `.test.ts`** — the classic census is retired:
  `SHIPPED_HEX_RADIUS` / `SHIPPED_TILE_HEIGHT` and the `hex-ground` row in `SHIPPED_PRIMITIVES` are
  gone; the source-parsing test for those constants is removed with an explanation of why the old
  number has nothing left to pin against; the `HexGround`-slice banding check becomes a positive
  regression guard that the classic component and its descriptor kind do not return; and the
  classic-substrate non-vacuity control (previously: "the same mapper still draws its hexes") is
  proven the OTHER direction, through the real core, as described above.

## The mutation rung's standalone verdict

`pnpm check:mutation-diff`, run once standalone: **6 mutants counted, 6 KILLED, 0 survived, 0
unproven.** Only `src/world-to-3d.ts` carried mutable lines this branch changed (the rung mutates
only a project's `src/`); `src/cell-ground-geometry.ts`'s changed lines were comment-only and
generated no mutants. The refusal message's three `StringLiteral` mutants were killed by the pinned
full-message assertion in `world-to-3d.test.ts`; an `ArrayDeclaration` mutant (on
`ISLAND_GROUP_KINDS`'s literal) was killed by the island-attribution tests.
`harness/island-descriptors.ts` and `harness/shipped-baseline.ts` are reported as NARROWED (GAP)
by the rung's own harness-vs-src rule — mutated by nothing, but exercised by
`@storytree/forest-world-r3f`'s own `harness/` test run, per the rung's stated posture.

## What the orchestrator routes to `story-author`

Two story-prose lines assert what the deleted code used to do and need correcting in the same
spirit as this landing (checked, not fixed, here — out of this leaf's file scope):

- `stories/website-experience/r3f-world-spike.md:112` — asserts "≥1 instanced hex-ground
  descriptor with a transform derived from the hex position" as part of the capability's goal
  prose. The descriptor kind is retired; the assertion needs re-pointing at `cell-ground` (or
  retiring in favour of whatever this capability's outcome now is).
- `stories/website-experience/storm-to-forest-inflection.md:149` — describes the inflection's
  mounted island as filtering descriptors "to `hex-ground` only", with a witnessed log line
  `hex-ground 19 · story-tree 0 · …` from when the site rendered a classic island. Both the filter
  and the witnessed log describe retired behaviour and need correcting to whatever the live
  inflection filters to today.

## Refuted premises / things not done

None of the increment row's premises were refuted. The one thing established beyond the row's own
text: `harness/main.tsx` was a real, previously-unnamed live consumer of the classic substrate
(module-scope `worldTo3D` call), found by grep and fixed rather than left to break — see above.
