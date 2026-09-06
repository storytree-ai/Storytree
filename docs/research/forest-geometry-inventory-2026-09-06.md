# The forest geometry inventory — what is drawn, what is starved, what nobody reaches

**Arc:** `forest-geometry-rebuild-arc` · **increment:** `forest-geometry-rebuild-arc-inc-01` ·
**decision:** ADR-0527 D4 (delete what nobody draws) and D5 (a deletion is evidenced, never inferred
from a grep) · **date:** 2026-09-06 · **the check that keeps this honest:**
`packages/forest-world/src/scene-kind-coverage.test.ts`.

This document is the standing inventory ADR-0527 D4 names. It places every component of the forest
geometry stack — `packages/forest-world/src`, `packages/forest-world-r3f/src`,
`packages/app-surface/src`, the studio's map neighbours in `apps/studio/src`, and the website's
painters in `web/src/lib` — into one of five states, with the three pieces of evidence D5 demands
per entry. **It deletes nothing.** The deletions land in the later units that touch each component,
each with its own story-prose correction and its own green gate.

## The five states

| state | meaning |
| --- | --- |
| **LIVE** | drawn on a surface someone opens: the studio map (`apps/studio`, `SceneView`), the public `/forest` snapshot page, or the public index page's Act 2 walk |
| **HARNESS-ONLY** | reached by `packages/forest-world-r3f/harness/**` or a `measure-*` driver, and by no shipped code. Not dead: an instrument that still earns a number is kept |
| **WIRED-BUT-STARVED** | imported, built and painted, but its input is never produced — a scene-kind no shipped fold feeds. Looks live from the import graph |
| **UNREACHED** | nothing imports it outside its own tests |
| **LIVE-AS-AN-ALARM** | verified never to fire on the real corpus, where never-firing is the *passing* reading of a live instrument that watches for it (ADR-0527 D4, corrected in place) |

Plus **UNCERTAIN** where the evidence did not close, saying what was checked.

## The mechanical check, and what it replaced

The first pass found its two dormant families by their own comments. The check makes the cross-check
arithmetic instead. It reads the `SceneKind` union out of `scene.ts` (comments stripped, so the
union's own commentary cannot count as an emitter) and asks four questions:

1. **Is every declared kind named by builder code?** — static, over `scene.ts` minus the union block.
2. **Is every declared kind PRODUCIBLE?** — runtime, over six scenes that together set every optional
   input (both substrates, a forced cave, the signpost in all three states, the garden, blooms on
   crown and plant, every claim grade and marker state). Several scenes rather than one because a
   garden retires the island's tree, flora, parcels and signpost, and a hero tree replaces the
   procedural crown — "everything at once" hides kinds.
3. **Which kinds does NO shipped fold ever feed?** — runtime, over three MIRRORS of the real folds:
   `TreeView.territoryToScene`/`worldToScene` (studio), `forest-snapshot-map.ts` (`/forest`) and
   `act2-walkthrough.ts` (index). The answer is PINNED as `STARVED_KINDS` + `ALARM_KINDS`, so a
   starved family becoming live, or a live one becoming starved, fails the test and names the kind.
4. **Does each painter still name the kinds it draws?** — static, over `SceneView.tsx`,
   `world-to-3d.ts`, and `web/src/lib/worldSvg.ts` when the submodule is checked out (it says so
   when it is not).

Mutation-tested before trusting it: a phantom kind added to the union fails question 1; deleting the
studio painter's `cave-apron` row fails question 4a; a website mirror that starts sending the
signpost fails question 3 naming the five `sign-*` kinds. The instrument was typechecked before any
number below was read (`pnpm --filter @storytree/forest-world typecheck`).

The result the check keeps giving: **113 declared kinds; 113 named by a builder; 113 producible;
90 fed by a shipped fold; 18 fed by no shipped fold (the starved set); 5 producible only by the
router's forced fallback (the alarm set).** (The first pass's "~120" was an estimate; 113 is the
parsed count.)

## Part 1 — the scene-kind vocabulary, classified

### LIVE-AS-AN-ALARM — the cave portals (`cave`, `cave-apron`, `cave-arch`, `cave-rim`, `trail-ghost`)

- **Runtime.** `routeTrails` emits a cave only through `addPortal` (`routing.ts:1304-1318`), which
  fires only for a node pair straddling `underOf` — the interior-cost fallback that runs solely when
  the primary A* returns no path (`routing.ts:995-997`, "cave fallback ONLY when the island-blocked
  route is impossible"; ADR-0169 §1 "caves only when forced"). The first pass replayed the real
  snapshot pipeline (35 stories, 90 edges): `caves.length === 0`, closest rim gap 47.3 units; the
  studio's own note on its 227-island graph: `world-cave` "stayed 0 at every value tried". The test's
  forced-ring fixture (the one `routing.test.ts:517` uses) produces entry + exit portals, so the alarm
  CAN fire.
- **Watched.** `apps/studio/src/lib/comparativeCapture.ts:40,57,117` reads `.world-cave` as "the
  connector-health canary" and reports its delta, after an incident that forced 156 of them.
- **Painted.** Studio: `composeClass` `case 'cave'` → `world-cave st-<status>` plus `data-island` /
  `data-edges` (`SceneView.tsx:394-397, 1258`), `cave-apron/arch/rim` in `BASE`. Website: `case
  'cave'` + the three internals in `BASE`. 3D: `case 'cave'` → a `cave-arch` instance with a bearing.
- **Prose.** `stories/forest-world/render-core.md:83-86` (contract `rc-trail-router-deterministic-network`):
  "an edge that cannot route with islands blocked re-routes hidden with rim cave portals" — true.
- **Verdict: KEEP.** Zero is the passing reading. What the projection change owes them: the
  `true-footprint.ts` bearing re-derivation for a cave portal (`packages/forest-world-r3f/src/true-footprint.ts`,
  242 lines, the un-projection ADR-0527 deletes wholesale) goes with the un-projection — the portal's
  bearing under a true surface is the rim normal the router already computes, so no per-descriptor
  special case survives. That is the arc's item 1, not this unit's.

### WIRED-BUT-STARVED — the four families no shipped fold feeds

**(a) The classic extruded-hex ground** — `ground-hex`, `tile`, `tile-side`, `tile-top`, `tile-top-wheat`.

- **Runtime.** `buildGround` takes the classic branch only when `input.relaxedCells` is null
  (`scene.ts:3238`, the tile loop at `:3260-3284`). The studio's substrate mode is the constant
  `SUBSTRATE_MODE: SubstrateMode = 'mesh'` (`TreeView.tsx:1447`) and `relaxedCells` is null only when
  there is no world at all (`TreeView.tsx:2179-2182`). The website builds `relaxedCells`
  unconditionally and sends `drawTiles: []` (`forest-snapshot-map.ts:495-496`,
  `act2-walkthrough.ts:635-636`). The only builder of a classic scene in the repo is the r3f harness
  fixture `harness/shipped-baseline.ts:377-406`, which exists to prove the 3D mapper's REFUSAL
  (`world-to-3d.ts:442-461`, `assert.throws` at `shipped-baseline.test.ts:630`).
- **Importers.** `DrawTile` / `drawTiles` are still live as the INPUT to `buildRelaxedCells` (the
  mesh is built from the tile ownership) — only the classic PAINT branch is starved.
- **Painted.** Studio: `tile`/`tile-top` in `composeClass`, `tile-side`/`tile-top-wheat` in `BASE`,
  `ground-hex` → `hex-land`. Website: `case 'tile'`. 3D: refuses.
- **Prose.** `stories/website-experience/r3f-world-spike.md:94-95`: "`packages/forest-world`'s own
  two-substrate contract is untouched — the studio's 2D SVG map still owns classic mode". That sentence
  asserts what this inventory shows nothing exercises; a deletion must correct it in the same landing.
  `stories/forest-world/render-core.md` does not name the classic ground.
- **Verdict: DELETION CANDIDATE** (scene.ts `:3260-3284`, the four studio painter rows, the website
  `case 'tile'`, and `SceneInput.relaxedCells: null` becoming a type error rather than a fork). The
  harness fixture that builds one is a test of a refusal that would then be unreachable by type; it
  goes too. Existing tests to move with it: `scene.test.ts:157` ("hex ground emits a group per tile")
  and `:1312` ("no substrate cells (classic ground) still renders every flower").

**(b) The cosy-island garden** — `garden-lavender-stem`, `garden-lavender-head`, `garden-grass-blade`,
and the `SceneInput.garden` seam.

- **Runtime.** `buildScene` composes a garden only `if (garden)` (`scene.ts:3451-3453, :3466`). The one
  shipped caller passes `null` (`TreeView.tsx:2966`: `worldToScene(…, null, null, vegetation)`);
  `SemanticGrowthDemo.tsx:347-358` passes `null` too. The `?garden` toggle that fed it was retired by
  ADR-0228 (`worldSettings.ts:157, :387`; `TreeView.tsx:4310-4315`). The website's folds never set it.
- **Importers.** `SceneGardenInput` is imported by `TreeView.tsx` only as the parameter type of the
  always-null argument. **Shared helpers that STAY:** `fittedHeroScale` (`scene.ts:2529`) and
  `gardenHeroUse` (`:2556`) are called by the LIVE vegetation hero tree (`vegHeroTreeUse` at `:3036`;
  `packages/app-surface/src/island-vegetation-growth.ts`; `SceneView.tsx:911`), and `GardenHeroId` is
  read by the studio's hero-tree loader (`factoryBuildings.ts:140-157`). `SceneGardenHero` is the
  hero shape `SceneVegHeroTrees` reuses (`:752`).
- **Garden-only set** (~470 lines): `treeKeepOut` (`:2548-2555`), `placeGardenHeroes` (`:2589`),
  `islandLandfall` (`:2681`), `buildStonePath` (`:2738`), `detourAroundTree` (`:2807`), `towardLand`
  (`:2855`), `lavenderMarks` (`:2868`), `grassMarks` (`:2889`), `buildGardenArt` (`:2913`),
  `buildGardenDefs` (`:3002-3014`), `GARDEN_DEFINED_HEROES` (`:2498`), `SceneGardenInput` (`:741`),
  the three kinds (`:145-148`), the `garden` parameter threaded through `buildTerritoryFlora`
  (`:3080`), the studio painter's three `BASE` rows, and the tests `scene.test.ts:1466-1559` plus the
  garden legs of `scatter-camera.test.ts` (which also exercises `islandLandfall`/`towardLand`).
- **Prose.** `stories/art-factory/landscape-factory.md` (status: proposed) — its outcome asserts "the
  fixed garden set bakes deterministically into the hero-kit roster"; that is the FACTORY's bake, which
  stays (the kit is live for the hero trees). `stories/studio/story.md:404` asserts the studio "folds
  the baked buildings / hero garden set / stones onto the island (ADR-0221)" — already false for the
  garden set and the stone (below); must be corrected in the deletion landing. `stories/app-surface/
  semantic-growth-*` (proposed) mention the garden as a demo composition, not as shipped.
- **Verdict: DELETION CANDIDATE, the strongest.** Delete the garden-only set; keep the two shared
  helpers and rename nothing until the vegetation hero tree stops needing them.

**(c) The human-witness signpost** — `sign-blank`, `sign-pass`, `sign-fail`, `sign-post`, `sign-head`.

- **Runtime.** `buildTree` draws it `if (t.signpost && !unifiedVeg)` (`scene.ts:906`). The studio's
  fold never sets `signpost` (`TreeView.tsx:1314-1395` sets parcels / uatCriteria / bloom / claims /
  departures and nothing else), and always composes vegetation, which is `unifiedVeg`. The website's
  two shipped folds never set it. The only setter is `web/src/lib/worldSvg.ts`'s `worldToSceneInput`
  (`:56-58`), whose caller `renderWorld` (`:471`) has **no caller** in `web/src` (verified: the only
  importers of `worldSvg.ts` are `forest-snapshot-map.ts`, `act2-walkthrough.ts` and a test, all of
  which import `sceneToSvg` alone).
- **Decision.** ADR-0226 decision 5 retired the signpost on the studio; ADR-0040 introduced it.
- **Painted.** Studio `BASE` (three wrapper classes + two empty rows); website `case 'sign-*'` and
  `isOutsideCrown`; 3D: skipped.
- **Prose.** `stories/forest-world/render-core.md` does not assert the signpost. ADR-0040 is the
  decision that describes it and would need an in-place note that the signpost is drawn by no surface
  since ADR-0226 — the librarian's move, in the deletion landing.
- **Verdict: DELETION CANDIDATE** (`buildSignpost` `:919-935`, the five kinds, the studio rows, the
  website branches, `SceneTerritoryInput.signpost`, and the dead website fold it rode in on — see
  Part 3).

**(d) The verdict bloom** — `bloom-anchor`, `bloom-crown`, `bloom-ring`, `bloom-spark`, `bloom-plant`.
⚠ **This one was missed by the first pass and is not a failed experiment: it is a standing decision
that silently stopped being drawn.**

- **Runtime.** The crown bloom is built only inside the procedural `buildTree` (`scene.ts:902`). The
  studio DOES fold it — `territory.bloom = { ageRatio, outcome }` from the verdict
  (`TreeView.tsx:1324, :1390`, ADR-0045's `verdictBloom`) — but `buildTerritoryFlora` calls
  `vegHeroTreeUse` INSTEAD of `buildTree` whenever `vegetation.heroTrees` is supplied
  (`scene.ts:3122-3126`), and the studio always supplies it once `kit.json` has loaded
  (`useVegetation`, `TreeView.tsx:4327-4337`), with a colourway for **all six statuses**
  (`packages/procedural-architecture/baked/kit.json` `heroTreeVariants`: healthy, building, proposed,
  mapped, unhealthy, unknown — so `resolvedTreeStatus` never falls back). The bloom the fold carried
  is discarded. The website never folds a bloom (`forest-snapshot-map.ts`; `act2-walkthrough.ts`;
  `world.ts:397-400` "capability-level blooms are disabled"). `plants[].bloom` is set by no fold.
- **The one transient.** Until the kit chunk arrives, `useVegetation` returns `{}` and the procedural
  tree (with its bloom) renders for the first frames. That is a loading flash, not a drawn state.
- **Decision.** ADR-0045 (accepted) decides "the live-activity layer is a 'recently-landed' bloom
  keyed on `verdict.at`" and carries two in-place corrections (ADR-0048, ADR-0200) each ending "the
  verdict-bloom CORE (Decisions 1–5) STANDS untouched". ADR-0227 replaced `buildTree` with the hero
  `<use>` and cites ADR-0045 ("only a signed verdict blooms") without deciding the bloom's fate. So an
  accepted decision asserts a layer the code no longer draws — a regression by replacement, not a
  retirement.
- **Painted.** Studio `composeClass` `bloom-crown`/`bloom-plant` → `world-bloom … verdict-<outcome>`,
  `bloom-anchor/ring/spark` in `BASE`; website `case 'bloom-*'`; 3D: skipped.
- **Prose.** `stories/app-surface/app-surface-world-view.md:120-128` and `render-core.md:104` assert
  only the NEGATIVE (a wisp carries no bloom) — still true. `stories/app-surface/semantic-growth-replay-view.md:349,396,546`
  (proposed) asserts the Storybook tree replacement "preserves the signed-proof `.world-bloom` overlay
  identity" — a contract about a bloom that is not currently drawn.
- **Verdict: UNCERTAIN as to intent — an OWNER CALL, authored on the arc as an open question.** Two
  honest exits: restore the bloom under the hero tree (ADR-0045 stands; ~40 lines to anchor
  `buildBloom` beside `vegHeroTreeUse`), or retire it (ADR-0045 corrected in place, the five kinds and
  `buildBloom` `:1245-1275` deleted, `territoryToScene`'s fold and `verdictBloom` with it). Neither is
  an agent's call: D4 is about failed experiments and redundancy, and this is a decided feature.

### LIVE — everything else in the vocabulary (90 kinds)

Fed by at least one shipped fold and painted by at least one shipped painter. Notable, because they
read as candidates and are not:

- **`baked-defs` / `baked-art`** — LIVE through the vegetation hero trees (`buildVegetationDefs`
  `:3051`, `vegHeroTreeUse` `:3033`), NOT through the garden. The first pass listed "bakedStone /
  baked-art" together; the KINDS are live, only the `bakedStone` INPUT is dead (Part 2).
- **`empty` / `empties-layer`** — LIVE on the studio (`TreeView.tsx:910-926` builds the empties ring);
  the website sends `empties: []` and its painter never names `empty` (pinned in question 4c).
- **`parcel-flower`** — LIVE on the studio for unhealthy / building / proposed parcels under the
  unified vegetation (measured across the three themes and five statuses; healthy and mapped parcels
  draw none under vegetation, which is the vocabulary's own rule, `scene.ts:2168`).
- **`sapling-trunk`, `flora-dead-*`** — LIVE on the index page's Act 2 walk (one-plant-per-cap flora,
  parcels absent); retired for parcels-present islands on the studio by design.
- **`bare`** — LIVE on `/forest` (an unhealthy story's withered procedural tree; the snapshot sends
  no hero trees) — not on the studio, where the hero `<use>` replaces every tree.
- **`wisps` / `wisp*`** — LIVE on the index page (Act 2's `hasWisp`); the studio always sends
  `wisps: []` and folds builds onto claims as `phase`.
- **`hit` / `hits-layer`** — always emitted; studio moves the layer to the back and classes `hit`.
- **The trail passes, the claim / hover / queue / departing wisp families, the parcels, the tall-flower
  markers, the plates, the coast** — all LIVE on the studio.

## Part 2 — components (not kinds), classified

### UNREACHED

| component | evidence | prose |
| --- | --- | --- |
| **`SceneInput.bakedStone`** (`scene.ts:672`) | Declared and NEVER READ: the only two mentions in `scene.ts` are the field (`:672`) and a comment (`:152`). Its sole producer `loadBakedStone()` (`apps/studio/src/lib/factoryBuildings.ts:213-220`) has **no caller** anywhere; `TreeView.worldToScene` threads its parameter but every caller passes `null`. `BAKED_STONE_DEF` (`scene.ts:709`, exported) has zero references beyond its definition. | `stories/studio/story.md:403-404` says the studio "folds … stones onto the island" — false today. `stories/art-factory/landscape-factory.md` (proposed) asserts the factory BAKES the stone (`standing-stone.ts`, `baked/stone.json`, drift-guarded) — true and unaffected. |
| **`@storytree/procedural-architecture/stone.json`'s only consumer** | The bake and its drift test (`standing-stone.test.ts`) are the factory's; the studio's `loadBakedStone` is the only importer of the asset outside the factory and is itself unreached. | as above |
| **`web/src/lib/world.ts`** (505 lines) and `worldSvg.ts`'s `worldToSceneInput` + `renderWorld` (~128 lines) | `world.ts` is imported only by `worldSvg.ts` (types); `renderWorld` has no caller in `web/src`. The live painter is `sceneToSvg` alone (`forest-snapshot-map.ts:48`, `act2-walkthrough.ts:91`). | The website's own repo; recorded here because it is the only setter of `signpost` and the last user of `wisps`+`bloom` folding on the web. Out of this arc's write scope (a `storytree-web` PR). |
| **`MAX_EXTENT_SHOWN`, `RESTING_ISLAND_SPANS`, `TILE_DEPTH_WORLD`, `loopSignedArea`, `buildBloom`** (exported from `index.ts`) | No importer outside `packages/forest-world`; each is used INTERNALLY, so this is export-surface residue, not dead code. | none |

### WIRED-BUT-STARVED (components)

| component | evidence | prose |
| --- | --- | --- |
| **`SceneView` optional layers `organicPoseLayers` / `svgIslandAccretionLayer`** (`SceneView.tsx:159,170`; `organicPoseImage` `:587-615`; `svgIslandAccretionClip` `:779-806`; plumbing at `:1376-1387`) | The only setter in the repo is `SemanticGrowthDemo.tsx`; `TreeView`'s live `sceneCtx` never sets either. | Part of the `?semanticGrowth=demo` cluster — see below. |
| **The legacy inline render** (`TreeView.tsx:3766-3854` else-branch, ~89 lines; `readRenderScene` `worldSettings.ts:380-385`; the two click guards `:3647, :3688`) | Reached only via `?render=legacy` / `?render=inline`; its own comment calls it a "ONE release" safety net (introduced 2026-06-27). `IslandGround` / `TerritoryFlora` are NOT freed by deleting it — the Shared Islands panel uses them (`TreeView.tsx:4713+`). | No story prose names `render=legacy`. |

### HARNESS-ONLY (kept where it earns a number)

| component | evidence | intent |
| --- | --- | --- |
| **`packages/forest-world-r3f/src`** — every file except `act2-director.ts` (515 lines, LIVE: the website's `act2-walkthrough` / `act2-script` / `act2-validate` import its pure state machine) and `index.ts` (81) | 41,738 lines in `src/`, of which 23,935 are `*.test.ts`; **~17,800 non-test lines** reached only by `harness/**`, the `measure-*` drivers and the package's own tests. No workspace package depends on it (`grep forest-world-r3f */package.json` → only itself); `apps/studio` does not import it; the website mounts `ForestWorldCanvas` nowhere (`web/src/pages/index.astro:38` names the director import only). | **THE LAND TREATMENT, IN FLIGHT** — `land-ground-stack-arc` and `paint-every-land-type-arc`, landings the same week (wheat #1845 today). Reachability says harness-only; intent says under construction. **NOT a deletion candidate**, per ADR-0527 D4's scope note. Comments inside it that describe "what the studio ships" are stale (friction `the-shipped-map-names-a-renderer-and-reads-as-a-surface`). |
| **`harness/shipped-baseline.ts:377-406`** (the classic fixture) | Builds the one classic scene in the repo to assert the mapper refuses it. | Goes with family (a) when the classic branch goes. |

### The `?semanticGrowth=demo` cluster — an OWNER CALL, unchanged from the first pass

`SemanticGrowthDemo.tsx` (791), `SemanticGrowthWorldView.tsx` (619), `chapter2-round3-tree-candidates.ts`
(944), `organic-pose-to-pose-{track,assets}.ts` (690), `svg-island-accretion.ts` (430), plus the two
`SceneView` layers above. Gated to one exact query value and reached by nothing else — but its backing
stories (`app-surface/semantic-growth-studio-demo`, `semantic-growth-replay-view`,
`pixellab-organic-growth-tracks`, `svg-island-growth-track`, `organic-growth-app-witness`) are all
`status: proposed`: in-flight proving scaffolding, not a failed experiment. Deleting it retires those
stories. Not this arc's call; recorded so the next reader does not re-derive it.

### LIVE, and easy to misread as candidates

- **Sprite sheets / `artStyle`** — default-on (`storybook`), owner-attested 2026-07-23.
- **`forest-regrow*`, `island-vegetation-growth`, `shared-growth-tracks.ts`** — the first-load growth
  animation, no longer behind `?act2=intro`.
- **`buildTree`, `buildPlant`, `buildConifer`** — `buildTree` is LIVE on the website (procedural trees
  on both pages) and on the studio only as the pre-kit transient; `buildPlant` / `buildConifer` are
  imported by `SceneView.tsx` for the vegetation track frames.
- **`buildTrails`** — exported and imported by `SemanticGrowthWorldView.tsx` only; the live path
  reaches it inside `buildScene`.
- **`restingFrame`** — LIVE on the studio (`worldCamera.ts`), the website (`forest-arrival.ts`) and
  the 3D camera framing.
- **The engine mirror** `web/src/lib/forest-world/**` and `web/src/lib/forest-world-r3f/**` — every
  file "differs" from its source by the `@generated by pnpm sync:web-engine` header only; held by
  `check:web-engine`.

## Part 3 — the deletion list for the later units

Each row lands in its own unit with the named prose corrected in the same landing.

| # | delete | lines (approx.) | prose to correct | tests that move |
| --- | --- | --- | --- | --- |
| 1 | the classic extruded-hex ground: `scene.ts:3260-3284`, the `tile*`/`ground-hex` painter rows (studio, website), `relaxedCells: null` as a fork, `harness/shipped-baseline.ts:377-406` | ~80 | `stories/website-experience/r3f-world-spike.md:94-95` ("the studio's 2D SVG map still owns classic mode") | `scene.test.ts:157, :1312`; `shipped-baseline.test.ts:630` |
| 2 | the garden-only set (Part 1b), the three `garden-*` kinds and studio rows, `SceneInput.garden` | ~470 | `stories/studio/story.md:403-404` ("folds … hero garden set / stones onto the island") | `scene.test.ts:1466-1559`; garden legs of `scatter-camera.test.ts` |
| 3 | `SceneInput.bakedStone`, `BAKED_STONE_DEF`, `loadBakedStone` + `BakedStoneAsset`, the `bakedStone` parameter of `worldToScene` | ~40 | same sentence as row 2 | `sceneAdapter.test.ts:253-270` |
| 4 | the signpost: `buildSignpost` `:919-935`, the five `sign-*` kinds and painter rows, `SceneTerritoryInput.signpost` | ~60 | ADR-0040 in-place note (drawn by no surface since ADR-0226 D5) | `scene.test.ts` signpost legs (`:1546` is garden-scoped) |
| 5 | the legacy inline render branch + `readRenderScene` + two click guards | ~100 | none names it | `worldSettings` tests of `readRenderScene` |
| 6 | **the verdict bloom — PENDING the owner's answer** (restore or retire) | ~90 if retired | ADR-0045 (correct in place or restore the code); `semantic-growth-replay-view.md:349` | `scene.test.ts` bloom legs |
| 7 | (website repo) `web/src/lib/world.ts`, `worldToSceneInput`, `renderWorld` | ~630 | none | — |

**Not on the list:** cave portals (alarm, keep); `packages/forest-world-r3f/src` (in flight, keep);
the `?semanticGrowth=demo` cluster (owner call, stories proposed); the export-surface residue in
`index.ts` (harmless; tidy when a unit is already in the file).

## What the first pass got right, and what this pass changed

- **Right:** caves are never drawn and must be kept (the alarm state); the r3f package is the work in
  progress and not a candidate; the garden is the strongest candidate; the legacy inline render and the
  two optional `SceneView` layers are dormant.
- **Corrected:** "bakedStone / baked-art" was one entry — the `baked-*` KINDS are live through the
  hero trees; only the `bakedStone` INPUT is dead, and its "possible feeder" (`?factoryart=on`) is a
  comment with no code behind it (`loadBakedStone` has no caller).
- **Found by the check, not by a comment:** the classic `tile*` ground (five kinds), the signpost
  (five kinds), and the verdict bloom (five kinds, a decided feature that regressed).
- **Sized:** the r3f bucket is ~17,800 non-test lines, not ~39,000 — the first pass counted its tests.
- **The website's own dead fold** (`world.ts` + `renderWorld`) is why the signpost still has a setter
  anywhere; it is the storytree-web repo's to delete.
