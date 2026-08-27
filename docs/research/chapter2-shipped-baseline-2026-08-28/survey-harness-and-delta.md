# Chapter 2 shipped baseline — harness path, shipped path, and the delta

Survey for `adopt-the-land-into-the-shipped-map-arc-inc-01`. Read-only. Every quantitative or
structural claim below carries a `path:line` citation against
`packages/forest-world-r3f` at the commit surveyed (worktree `land-adopt`, 2026-08-28). Where a
grep confirmed an absence, the grep itself is quoted so a later session does not have to re-run
it to trust the negative.

---

## 1. The harness path, end to end

**Land geometry generation and assembly.** `harness/IslandView.tsx`'s `groundMeshes()`
(`harness/IslandView.tsx:388-470` for the setup, `harness/IslandView.tsx:531-609` for the
per-cell triangulation loop) is the single function that turns `GroundCell[]` (from
`groundCellsFrom`, `harness/island-descriptors.ts:82-119`) into three.js `BufferGeometry`. It:

- calls `planLandDefinition(cells)` once (`harness/IslandView.tsx:415`, defined
  `harness/land-definition.ts:325-472`) to classify every cell edge as `interior` / `parcel` /
  `rim` and to compute the parcel-bevel inset per vertex;
- groups cells into one mesh **per `(status, wheat, colour-variant)` key**
  (`harness/IslandView.tsx:437-443`) — i.e. one draw call per distinct token/variant
  combination, not per cell and not per capability;
- for each cell, triangulates the (possibly bevel-inset) polygon as a **centroid fan**: one
  extra centroid vertex, `n` triangles for an `n`-point cell (`harness/IslandView.tsx:538-559`);
- for each `parcel`-role edge, emits a bevel **quad** (2 triangles) running from the inset line
  down to the original edge (`harness/IslandView.tsx:561-573`);
- for each `rim`-role edge, emits a wall-skirt **quad** (2 triangles) hanging a constant
  `LAND_CELL_DEPTH` below wherever the (undulating) rim sits (`harness/IslandView.tsx:575-609`,
  `wallFootY` at `harness/land-definition.ts:243-246`).

**Geometry primitive per cell:** a triangle fan over the cell's own polygon (4 points per cell
in the reference fixture, so 4 triangles per fan — see §5), *not* an instanced primitive. There
is one shared `BufferGeometry`/`THREE.Mesh` per status-family group, built by CPU-side
concatenation of per-cell triangle data into flat `position`/`normal` arrays
(`harness/IslandView.tsx:612-615`) — never `InstancedMesh`.

**Relief height field and normal.** `harness/land-definition.ts` §1
(`harness/land-definition.ts:63-149`): `landHeight(x,z)` sums three long-wavelength sine waves
(62/41/27 ground units against a measured 16.5-unit mean cell pitch,
`harness/land-definition.ts:67-69,89`), `landNormal(x,z)` returns the field's **analytic**
per-vertex unit normal (`harness/land-definition.ts:139-149`) — explicitly not a per-face
normal, because a face normal would quantise each triangle whole onto the banded ladder and
reproduce the rejected per-cell noise "by another route" (comment at
`harness/land-definition.ts:130-138`). `LAND_RELIEF_AMPLITUDE = 2.2`
(`harness/land-definition.ts:89`).

**Edge classification / parcel bevel.** `harness/land-definition.ts` §2
(`harness/land-definition.ts:151-472`): `planLandDefinition` classifies every cell-edge triple
as `interior` (shared by two cells of the same parcel, drawn as nothing), `parcel` (a
capability boundary — the one edge that "carries information"), or `rim` (the island's outer
edge), then computes a per-parcel, per-vertex bevel inset of `PARCEL_BEVEL_WIDTH = 1.6`
ground units (`harness/land-definition.ts:210`) dropping `PARCEL_BEVEL_DROP = 1.15`
ground units (`harness/land-definition.ts:223`). `LAND_CELL_DEPTH = 2.2`
(`harness/land-definition.ts:233`) is the rim-wall skirt depth; `RIM_IS_BEVELLED_FOR_CLOSURE =
true` (`harness/land-definition.ts:189`) means the rim loop is bevelled too, to keep the
top-face surface closed at a corner where a parcel meets the coast.

**Shader material.** `harness/banded-material.ts`'s `createBandedMaterial()`
(`harness/banded-material.ts:157-330`) builds a raw `THREE.ShaderMaterial` with hand-written
GLSL (vertex shader `harness/banded-material.ts:225-238`; fragment shader
`harness/banded-material.ts:239-321`). Inputs:

- **uniforms**: `uRamp` (the token's finished delivered colours, already rounded in
  TypeScript by `tokenRamp`/`shadowRamp` — the GPU *selects*, it does not shade, per the
  comment at `harness/banded-material.ts:163-168`), `uLightDir`, optionally `uGrainNormalStrength`
  / `uGrainColourMix`, and (when shadowed) `uShadowTex` + `uShadowRect`
  (`harness/banded-material.ts:213-224`);
- **varyings available**: `vNormal` (world-space) and `vWorld` (world-space position) only —
  set in the vertex shader (`harness/banded-material.ts:229-236`) and read in the fragment
  shader. No UV varying, no vertex colour varying, no second geometric attribute.
- **attributes on the uploaded geometry**: `position` and `normal` only
  (`harness/banded-material.ts:329-330`, and again at every `geom.setAttribute` call in
  `harness/IslandView.tsx:614-615,652-653,704-705,860-861`) — confirmed by grep, see §4.

The fragment stage computes half-lambert `dot(n, L)*0.5+0.5`
(`harness/banded-material.ts:274`), quantises it onto the authored 4-rung ladder via
`st_bandIndex` (generated GLSL from `SHADE_LEVELS`, `bandGlsl()` at
`harness/palette-band.ts:614-625`), optionally darkens one rung further from the shadow texture,
then selects `uRamp[idx]` by an if-chain (GLSL ES 1.0 forbids dynamic uniform-array indexing —
comment `harness/banded-material.ts:315`). Delivered colour = `token * level`, never a computed
blend, which is the whole "closed palette" argument (`harness/palette-band.ts:26-38`).

**Ground-space shadow texture precedent.** `harness/land-shadow.ts:9-16` states the rejection of
a per-vertex shadow attribute in favour of a ground-space texture:

> "The ground mesh is a triangle FAN PER CELL — one vertex per cell corner plus a centroid, on
> cells whose measured mean pitch is 16.5 ground units. A per-vertex shadow attribute on that
> mesh can carry a feature no finer than a whole cell, and the shadows this island actually
> throws are 4.3 ground units at the median plant. The shadow would have been smeared across
> entire capabilities... The field is sampled in the FRAGMENT stage instead."

The field is built by `buildShadowField` (`harness/land-shadow.ts`, further down the same file)
at `SHADOW_GRES = 3` samples per ground unit (`harness/land-shadow.ts:38`), uploaded as a
single-channel `THREE.DataTexture` by `shadowFieldTexture()`
(`harness/banded-material.ts:126-146`), and sampled in the fragment stage by projecting the
varying world position into the field's rect and doing a single `texture2D` lookup, thresholded
at 0.5 (binary — no penumbra rung to spare):

```
harness/banded-material.ts:285-291
        vec2 uv = vec2((vWorld.x - uShadowRect.x) * uShadowRect.z,
                       (vWorld.z - uShadowRect.y) * uShadowRect.w);
        float sh = texture2D(uShadowTex, uv).r;
        if (sh > 0.5) {
          ...darken to SHADOW_RUNG_INDEX for lit rungs lighter than the shadow rung...
        }
```

(Note: the increment brief cited `banded-material.ts:97-113` for this sampling code; that range
is actually the `BandedMaterialOptions`/`ShadowTexture` type declarations. The live sampling
code is at the lines quoted above — verified directly, cited precisely here for anyone
following up.)

**Rim/skirt.** Covered above under edge classification: the wall skirt is a quad-per-rim-edge
extrusion hanging a fixed depth below the (now undulating) rim line
(`harness/IslandView.tsx:575-609`). This is a *flat, single-depth* wall, not a stepped/terraced
cliff — see §3 component 6.

**Grain octave.** `harness/land-grain.ts` — a high-frequency value-noise field at lattice
spacing `GRAIN_LATTICE = 2.5` ground units (`harness/land-grain.ts:66`), delivering features
~6.5 ground units wide (`GRAIN_FEATURE_RATIO = 2.6`, `harness/land-grain.ts:88`, measured not
assumed). Two independent halves, wired as two separate `GrainMode`s
(`harness/banded-material.ts:71-89`):

- `normal` — perturbs the lambert term *before* quantisation (`GRAIN_NORMAL_STRENGTH = 1.0`,
  `harness/land-grain.ts:137`), so the fragment still writes an authored ramp entry: palette
  stays closed.
- `colour` — mixes a noise ramp into the *delivered* colour (`GRAIN_COLOUR_MIX = 0.13`,
  `harness/land-grain.ts:110`), which is off-palette by construction, permitted only on
  `harness/` (ADR-0418 D2/D3), and explicitly not adoptable via `capture.mjs`'s palette-closure
  check as it stands (`harness/banded-material.ts:302-309`).

**Regional colour drift.** `harness/ground-variation.ts` — a low-frequency two-wave field
(`REGION_WAVELENGTHS = [96, 61]` ground units, incommensurate on purpose,
`harness/ground-variation.ts:41`) selects which of a status family's `top[0..2]` authored
tokens a cell wears, so *neighbouring* cells usually agree (patches) rather than jumping
per-cell (hash noise) — the treatment the owner explicitly rejected on 2026-08-16
(`harness/ground-variation.ts:5-13`). Semantically inert: all three variants belong to the same
status family (`harness/ground-variation.ts:30-33`).

**Palette ladder.** `harness/palette-band.ts`. `SHADE_LEVELS: readonly number[] = [0.78, 0.8,
0.9, 1.0]` — **4 rungs** (`harness/palette-band.ts:359`). With a shadow, `SHADOW_LADDER =
[...SHADE_LEVELS, SHADOW_RUNG].sort(...)` — **5 rungs** (`harness/shadow-ladder.ts:292`, with
`SHADOW_RUNG` computed at `harness/shadow-ladder.ts:270-291` and deliberately unreachable by
lighting alone). `landPalette()` (`harness/palette-band.ts:563-569`) is the full closure of
`(authored token x authored level)` — every colour a live-rendered land may legally emit, with
no nearest-entry search and (by the closure's construction) no reachable colour belonging to
another status's family (`statusFamilyOf`, `harness/palette-band.ts:578-`). This whole module
deliberately lives in `harness/`, not `src/`, because `src/` is mirrored verbatim into the
public website repo by `pnpm sync:web-engine` and the increment that built this experiment
explicitly does not authorise adopting it — see `harness/palette-band.ts:4-11` (quoted in full
below) and the scope-fence test that enforces it (`harness/scope-fence.test.ts:1-18`).

> `harness/palette-band.ts:1-11`:
> "// palette-band.ts — the LOCKED-PALETTE SHADER CONTRACT (chapter2 live-render experiment,
> // ADR-0380 D6 fence 3). Pure, browser-free, node:test-provable.
> //
> // IT LIVES IN `harness/` RATHER THAN `src/`, AND THAT IS A SCOPE DECISION, NOT A FILING
> // ACCIDENT. `packages/forest-world-r3f/src` is MIRRORED into the public website repo by
> // `pnpm sync:web-engine`, which copies every non-test file it finds and offers no way to
> // exclude one. The increment authorises the EXPERIMENT and explicitly does not authorise
> // adopting it, so publishing these modules to a public repo is not this session's call to
> // make. `harness/` is dev-only and outside the synced tree, so the experiment reaches no
> // public surface at all."

✅ **Lead finding:** the harness is a fully worked, node-test-provable land renderer — relief,
bevel, shadow, grain, regional drift and the palette ladder are all separate, composable,
independently-toggleable mechanisms feeding one `THREE.ShaderMaterial`. None of it is wired
into `src/`, and one module (`palette-band.ts`) is *structurally* prevented from being wired in
without a file move, because `src/` syncs verbatim to the public site.

---

## 2. THE DELTA — capability table

| Capability | Shipped (`src/`) has it? | What `src/` would need |
|---|---|---|
| Per-cell mesh (fan/quad triangulation of the cell's own polygon) | **No.** `src/ForestWorldCanvas.tsx:52-67`'s `HexGround` draws one `<Instances>` block of `cylinderGeometry(HEX_RADIUS, HEX_RADIUS, TILE_HEIGHT, 6)` — a regular 6-segment cylinder, one instance per hex *centre point*. No cell polygon ever reaches `src/`: `world-to-3d.ts`'s `hex-ground` descriptor carries only a `Transform3D` (position), no `points` (`src/world-to-3d.ts:205-214`). | Route `GroundCell[]` (or the raw scene's cell paths) through the descriptor pipeline instead of/alongside `Transform3D`; build per-cell (or per-parcel-merged) `BufferGeometry` the way `harness/IslandView.tsx:531-609` does. |
| Analytic relief (`landHeight`/`landNormal`) | **No.** Ground is perfectly flat; `TILE_HEIGHT = 3` is a fixed prism height, not a field (`src/ForestWorldCanvas.tsx:47-48,55`). | Port `harness/land-definition.ts` §1 verbatim (it's already pure/browser-free) and sample it per-vertex when building ground geometry. |
| Custom `ShaderMaterial` vs `meshStandardMaterial` | **No.** `HexGround`, `StoryTree`, `WispSprite` all use `<meshStandardMaterial color=.../>` (`src/ForestWorldCanvas.tsx:57,73,78,131`) — a PBR material lit by one `ambientLight` + one `directionalLight` (`src/ForestWorldCanvas.tsx:177-178`), no banding. | Port `harness/banded-material.ts`'s `createBandedMaterial` and its GLSL (browser-bound already; needs `configureExactColour` wired into the R3F `<Canvas>` setup, since `src/` currently leaves colour management at three's default). |
| Banded palette ladder (locked `token x level` closure) | **No.** `STATUS_COLOUR` is a flat hardcoded hex map, one colour per status, no shading rungs at all (`src/ForestWorldCanvas.tsx:26-34`). | Port `harness/palette-band.ts` (currently fenced OUT of `src/` on purpose, §1) plus the `bandGlsl()`-generated quantiser. |
| Shadow ground-texture | **No.** No shadow field, no `DataTexture`, no per-fragment shadow sampling anywhere in `src/`. | Port `harness/land-shadow.ts` (pure) + the texture-upload/sampling half of `harness/banded-material.ts:99-146,285-291`. Needs caster positions (plant/tree instance list) as input. |
| Grain octave | **No.** No noise field of any kind in `src/` (confirmed §4). | Port `harness/land-grain.ts`'s field + its GLSL fragment (`grainGlsl()`), wired as the `normal` half only if the palette-closure constraint is to be honoured on the shipped path. |
| Rim/skirt (wall hanging below the coast) | **Partial-but-different.** `HexGround`'s prism has a `TILE_HEIGHT` side wall by construction (it's a solid cylinder), so every tile — interior or rim — has a flat vertical wall of constant height; there is no rim/interior distinction and no relief for the wall to hang below. | Needs the `edgeRole`/`rim` classification (`land-definition.ts` §2) and the `wallFootY` hang-below-relief construction (`land-definition.ts:243-246`) — meaningless without relief existing first. |
| Regional colour drift | **No.** One hardcoded colour per status, no per-cell or per-region variant at all. | Port `harness/ground-variation.ts` plus a variant→token mapping (`STATUS_TOKENS.top[0..2]`, which doesn't exist in `src/`'s `STATUS_COLOUR` shape). |
| Prop dressing (the five `DressingName`s: `walled`/`hamlet`/`terrace`/`shrine`/`wild`, `harness/island-dressing.ts:138`) | **No.** `src/` draws exactly five prop *kinds* — hex ground, story tree, trail strip, cave arch, wisp sprite (`src/world-to-3d.ts:35-41`) — none of which is a dressing-driven scatter of buildings/paths/boulders/gardens. `harness/island-dressing.ts` is 1388 lines with no `src/` counterpart at all. | This is the largest single gap. Would need the whole `island-dressing.ts` module (parcel-aware layout, per-dressing prop kits) plus `prop-structures.ts`/`prop-linear.ts`/`mesh-kit.ts` (the geometry generators it calls), none of which have any equivalent in `src/`. |

---

## 3. THE SIX TREATMENT COMPONENTS AND THEIR LIVE-PATH MECHANISM

### Component 1 — grid geometry clipped to a smoothed, gently perturbed coast polygon

- **(a) `harness/` today:** the ground mesh is *not* clipped to any smoothed/perturbed coast at
  all — it is built directly from the scene's own hex-decomposition cells
  (`groundCellsFrom`, `harness/island-descriptors.ts:82-119`), which are still hex-shaped (4
  points/cell in the reference fixture — see §5). `harness/island-dressing.ts` computes its own
  coast line, but it is a **different, poorer thing**, used only for *prop placement*, not for
  the ground mesh: `smoothLoop(rim, COAST_ROUNDS=2, true)` at
  `harness/island-dressing.ts:189-215` (`Ctx.rim` = "the raw 52-edge rim — the land's actual
  outline"; `Ctx.coast` = "the rim ROUNDED — the line props follow"). `smoothLoop` itself
  (`harness/prop-layout.ts:640-658`) is **plain Chaikin corner-cutting with no per-vertex
  perturbation** — it takes `rounds` and a `closed` flag and nothing else; there is no noise
  term anywhere in its body. So the harness ground mesh still renders the raw hex-outlined
  parcels; only the *prop-scatter* boundary is rounded, and even that rounding carries no
  jitter.
- **(b) `src/` today:** no coast concept at all. `HexGround` instances a regular hexagon prism
  per tile centre (`src/ForestWorldCanvas.tsx:52-67`); there is no polygon clipping, no rim
  concept, no smoothing.
- **(c) What already exists and is unused by either renderer:** `smoothCoast()` in
  `packages/forest-world/src/coast.ts:203-216` (top-level function boundaries; body at
  `coast.ts:204-208`) is the *real* mechanism the target component describes: hex-union
  boundary loops (`boundaryRingLoops`, `coast.ts:32`) → **per-vertex noise outset**
  (`jitteredOutset`, `coast.ts:96-101`, driven by `COAST_NOISE_AMP = 0.5` and
  `COAST_NOISE_WAVES = 3`, `coast.ts:21-22`) → **Chaikin rounding** (`chaikinClosed`,
  `coast.ts:146`). Confirmed by grep that `forest-world-r3f` imports it **nowhere**:
  ```
  $ grep -rn "smoothCoast" harness/*.ts harness/*.tsx src/*.ts src/*.tsx
  (no matches under forest-world-r3f)
  ```
  Its only consumers are `packages/forest-world/src/index.ts` (re-export),
  `packages/forest-world/src/forest-world.test.ts`, and
  `apps/studio/src/components/TreeView.tsx` (the studio's 2D map). ⚠ **Do not confuse the two
  coasts** — `smoothCoast` (perturbed, in `forest-world`) and the harness's own
  `Ctx.coast`/`smoothLoop` (unperturbed, prop-placement-only, in `forest-world-r3f`) are
  different functions with different inputs, living in different packages, and only the first
  matches the arc's target description ("smoothed, gently perturbed").
- **(d) Mechanism the live shipped path would need:** import `smoothCoast` from
  `@storytree/forest-world` (already a workspace dependency of `forest-world-r3f`, per
  `package.json:22`), use its perturbed loop as the polygon to clip/generate ground cells
  against, replacing the raw hex-cell outlines both renderers currently use for the *ground
  mesh itself* (as opposed to `harness/`'s current use of an unperturbed variant purely for
  prop placement).

### Component 2 — a landform falling to the shore

- **(a) `harness/` today:** `landHeight`/`landNormal` (`harness/land-definition.ts:63-149`) is
  a *swell*, not a fall-to-shore: three long sine waves, amplitude-capped
  (`landHeightRange`, `harness/land-definition.ts:103-108`) at roughly ±5 units total on a
  234-unit island (comment `harness/land-definition.ts:47-56`). Nothing in the field is a
  function of distance-to-rim/coast; it is a pure function of `(x, z)` with no boundary-aware
  term at all (confirmed: `landHeight`'s only inputs are `x, z, amplitude`,
  `harness/land-definition.ts:93`).
- **(b) `src/` today:** flat plane, `TILE_HEIGHT` prism, no landform of any kind.
- **(c) Mechanism needed:** a height field additionally weighted by distance-to-coast (falling
  toward `y=0` or below near the rim) — this does not exist in either renderer today and would
  be new work layered on top of `landHeight`, most naturally using the same coast polygon named
  in component 1 as the distance reference.

### Component 3 — one worn path worn DOWN rather than painted on

- **(a) `harness/` today:** paths exist only as **painted-on props**. `growPathRun`
  (`harness/prop-linear.ts:711-`) builds stone-slab geometry that sits *on top of* the height
  field via a supplied `heightAt` callback (`opts.heightAt`, `harness/prop-linear.ts:720`) —
  it does not subtract from or displace the ground mesh. Called for a gravel path
  (`harness/island-dressing.ts:562`) and a sand shore-line (`harness/island-dressing.ts:1078,
  1081`). No ground-mesh displacement occurs anywhere along a route; confirmed by the §4 grep
  (no `subtract`/`carve`/`erode` hits on non-comment code).
- **(b) `src/` today:** no path concept of any kind survives past `trail-strip` — and even
  that is a flat `<Line>` ribbon drawn at `y+0.2` above the ground plane
  (`src/ForestWorldCanvas.tsx:87-98`), i.e. also painted-on, never a depression.
- **(c) Mechanism needed — THE GROUND-SPACE TEXTURE PRECEDENT applies directly.** This is the
  same shape of problem the shadow field already solved and rejected the per-vertex-attribute
  answer for: the ground mesh's cells (mean pitch ~16.5 ground units,
  `harness/land-shadow.ts:11`) are coarser than a worn path (a path is narrower than a cell,
  the way a shadow is finer than a cell — `harness/land-shadow.ts:9-16`, quoted in full in §1).
  A path-wear FIELD sampled in the fragment stage — analogous to `ShadowField`/`shadowFieldTexture`
  (`harness/land-shadow.ts`, `harness/banded-material.ts:99-146`) — is the mechanism: encode
  distance-to-nearest-route as a ground-space texture, sample it per-fragment, and use it to
  (i) darken toward a "worn" rung on the banded ladder and, if true displacement is wanted,
  (ii) also feed a *vertex*-stage height offset sampled at the SAME resolution the texture is
  built at (not per-vertex-attribute, which the shadow precedent already ruled out at this
  cell pitch) — e.g. a vertex-texture-fetch (VTF) of the same ground-space field used for the
  fragment darkening, so the "worn down" claim is a real geometric depression rather than a
  darker rung standing in for one.

### Component 4 — an attribute-driven material reading shore-distance, path wear and slope

- **(a) `harness/` today:** the banded material reads exactly three per-fragment inputs: the
  interpolated `vNormal` (for lambert/slope), `vWorld` (for the shadow-texture UV lookup), and
  the per-mesh uniform `token` (`harness/banded-material.ts:225-291`). **Slope** is already
  read (via the normal → lambert → rung chain — that *is* the whole banding mechanism).
  **Shore-distance** and **path-wear** are read by **nothing** — confirmed no such uniform,
  attribute or texture exists (grep for `shore`/`path.*wear` outside comments turned up only
  prop-placement code, §"What neither renderer has" methodology below).
- **(b) `src/` today:** `meshStandardMaterial` reads only its own colour + the scene's two
  lights; no custom per-fragment input of any kind.
- **(c) Mechanism needed — same ground-space-texture answer as component 3, generalised.**
  `harness/land-shadow.ts:9-16`'s reasoning ("a per-vertex attribute can carry a feature no
  finer than a whole cell... The field is sampled in the FRAGMENT stage instead") applies
  identically to shore-distance and path-wear, because both vary at sub-cell resolution near a
  coast or a route. The mechanism already exists once, twice if you count the grain octave
  (`land-grain.ts`, evaluated analytically per-fragment rather than via texture, but for the
  same "finer than a cell" reason — see component 5). Concretely: bake shore-distance,
  path-wear (and optionally slope, though slope is already free from the existing normal) into
  one multi-channel ground-space texture alongside (or reusing the same upload path as) the
  existing shadow `DataTexture` (`harness/banded-material.ts:99-146`), sample all channels in
  one `texture2D` call in the fragment shader next to the existing shadow lookup
  (`harness/banded-material.ts:285-291`), and let each channel push the quantised rung/token
  choice independently, the way the shadow channel already does.

### Component 5 — a high-frequency grain octave

- **(a) `harness/` today:** fully built, `harness/land-grain.ts` (field) +
  `harness/banded-material.ts:71-89,257-267,301-309` (the two GLSL halves). Lattice spacing
  2.5 ground units, delivered feature ~6.5 ground units (`GRAIN_FEATURE_RATIO`,
  `harness/land-grain.ts:88`) — i.e., *finer* than the mean cell pitch (16.5 units), which is
  exactly why it is evaluated analytically per-fragment (an *analytic* field, not a texture —
  it needs no ground-space texture because it's a closed-form hash/noise function, unlike
  shore-distance/path-wear which need an actual routed polygon to measure distance against).
- **(b) `src/` today:** none. Confirmed by grep (§4): no noise term of any kind in `src/`.
- **(c) Mechanism needed:** port `harness/land-grain.ts` + the `normal`-half GLSL verbatim
  (already palette-closed, so no `capture.mjs`-style closure work needed) into whatever
  material replaces `meshStandardMaterial` on the ground.

### Component 6 — the asset kit's cliff on a six-row stepped skirt

- **(a) `harness/` today:** **does not exist.** The only skirt is the flat, single-depth rim
  wall described in §1 (`harness/IslandView.tsx:575-609`, `LAND_CELL_DEPTH = 2.2`,
  `harness/land-definition.ts:233`) — one quad per rim edge, constant depth, no rows, no
  stepping, no cliff asset. Confirmed by grep for "stepped"/"cliff"/"asset kit" across the
  package (§4 below): the only "cliff" hit is a palette-comment aside about a *reference*
  render's colour choice (`harness/palette-band.ts:336`, "the reference's ochre island has
  TEAL cliffs" — a remark about somebody else's render, not a mechanism here), and the only
  "stepped" hits are an unrelated stepped-*platform* prop generator
  (`harness/prop-structures.ts:1175-1182`, a shrine/dais prop, not the coastal skirt).
- **(b) `src/` today:** does not exist either (the `HexGround` prism wall is flat and constant
  per tile, described in §2's table row).
- **(c) Mechanism needed:** wholly new. Would need (i) an "asset kit" cliff mesh/material —
  no such kit exists in this package today (no `GLTFLoader`/`.glb`/asset-loading pipeline at
  all, confirmed §4) — and (ii) a six-row stepped extrusion replacing the current single flat
  quad-per-rim-edge wall, most naturally built the same way the existing wall is (per rim
  edge, `wallFootY`-style hang-below-relief) but subdividing the vertical run into six
  terraced steps instead of one drop.

**Cross-component note:** components 3 and 4 are the *same* ground-space-texture answer,
already justified once by the codebase (the shadow field) and load-bearing evidence that the
land renderer's designers have already rejected the per-vertex-attribute route for anything
finer than the ~16.5-unit cell pitch — including, explicitly, "the shadows this island actually
throws" at 4.3 ground units (`harness/land-shadow.ts:13`). Shore-distance and path-wear are
narrower still than a shadow, so the same rejection applies with more force, not less.

---

## 4. What NEITHER renderer has

All greps run from `packages/forest-world-r3f` against `src/` and `harness/`, excluding
`*.test.ts` where noted.

**Perlin/simplex/fbm/baked noise beyond `land-grain.ts`:**
```
$ grep -rniE "perlin|simplex|fbm|baked.?noise" src/ harness/ | grep -v "\.test\.ts"
harness/land-grain.ts:82: * ⚠ WHAT IS NOT CLAIMED: that Blender's Perlin has the same ratio. ...
harness/land-grain.ts:241: * the roughness is retuned. An unnormalised fbm would quietly change the grain's amplitude ...
```
Both hits are *inside* `land-grain.ts` itself (comparative remarks about Blender's noise, and
about `land-grain.ts`'s own algorithm) — confirmed no OTHER file in the package references any
of these terms. `harness/ground-variation.ts`'s regional field and
`harness/land-definition.ts`'s relief field are both hand-written sine sums, not lattice noise.

**No third vertex-attribute channel beyond `position`/`normal`:**
```
$ grep -rn "setAttribute(" src/*.tsx harness/*.ts harness/*.tsx
harness/banded-material.ts:330:  g.setAttribute('position', ...)
harness/banded-material.ts:331:  g.setAttribute('normal', ...)
harness/IslandView.tsx:614-615, 652-653, 704-705, 860-861: position + normal pairs only
```
Every `setAttribute` call in the package sets exactly `position` or `normal`. No `uv`, `color`,
or custom attribute channel appears anywhere.

**Nothing that subtracts or displaces the land mesh along a route:**
```
$ grep -rn "subtract|displace.*route|route.*displac|carve|erode|indent" src/*.ts src/*.tsx harness/*.ts harness/*.tsx | grep -v test
```
returned only comment prose about slope/GLSL-gradient subtraction (grain normal math,
`harness/banded-material.ts:259`, `harness/land-grain.ts:294`) and frame-budget/prose asides
(`harness/frame-budget.ts:53,265`, `harness/directions.tsx:457`,
`harness/prop-presence.ts:227,234`, `harness/island-dressing.ts:1028`) — none of these subtract
anything from the *ground mesh's own geometry*. `growPathRun` (component 3 above) confirms the
positive: paths are additive slabs riding the existing height field, never a route-shaped cut.

**No asset-loading pipeline:**
```
$ grep -rniE "gltfloader|useGLTF|\.glb|textureloader|ktx2loader|dracoloader" src/ harness/
(no matches)
```

**No `three-stdlib`/`meshoptimizer`/`draco3d` in any workspace `package.json`:**
```
$ grep -rl "three-stdlib|meshoptimizer|draco3d" packages/*/package.json apps/*/package.json
(no matches)
```

---

## 5. Authored triangle counts for the harness island — FIRST such count on record

⚠ No authored triangle count exists anywhere in the repo today. The only existing instrument is
a **runtime** GPU counter, `renderer.info.render.triangles`, read after render
(`harness/hardware-floor.ts:238`, alongside `drawCalls` at `harness/hardware-floor.ts:239` — the
increment brief's cited `217-218` does not match this checkout; the counter is at 238-239,
verified directly). It reports whatever the GPU actually drew for a given frame/camera, not an
authored, camera-independent count. This section computes that count for the first time, from
source, for the arc's own 13-hex / 11-capability reference island
(`islandScene()`, `harness/island-fixture.ts`).

**Method.** Ran the package's own pure functions — `groundCellsFrom(islandScene())` then
`planLandDefinition(cells)` — against the fixture (no rendering, no GPU; pure TypeScript,
consistent with the provability-firewall design). Cross-checked every number against a comment
elsewhere in the source before trusting it.

```
cell count:                     164
points-per-cell:                4 (every cell — a relaxed quad decomposition, not raw hexagons)
edge counts (interior/parcel/rim): 424 / 180 / 52
```

Cross-checks against source comments, both exact:
- 164 cells matches `harness/IslandView.tsx`'s own aside, "164 draw calls would be measuring a
  different thing" (`harness/IslandView.tsx:365`, in the `groundMeshes` docstring — note: it
  isn't literally 164 draw calls once cells are grouped by `(status, wheat, variant)`, but 164
  IS the fixture's authored cell count, confirming the comment's number).
- 52 matches `harness/island-dressing.ts:189`'s "the raw 52-edge rim — the land's actual
  outline" exactly.

**Arithmetic.**

| Source | Formula | Count |
|---|---|---|
| Top-face fan | `sum(points-per-cell)` over 164 cells, all 4-point ⇒ 4 triangles/cell | 164 × 4 = **656** |
| Parcel bevel | `planLandDefinition`'s `counts.parcel` is the number of `(cell, edge)` instances classified `parcel` — i.e. each cell bevels its own side of every boundary edge it touches, one quad = 2 triangles per instance | 180 × 2 = **360** |
| Rim wall skirt | `counts.rim` = number of rim-edge instances (1 incident cell each), one quad = 2 triangles per instance | 52 × 2 = **104** |
| **Total, whole island** | 656 + 360 + 104 | **1,120 triangles** |

This assumes the `full` land mode (relief + bevel both on) and is independent of whether the rim
wall is split into its own mesh (`edge: 'material'`) or merged into the body buffer
(`edge: 'flush'`) — both produce the same triangle count, only the draw-call count differs
(`harness/IslandView.tsx:459-462`).

**What this does NOT cover:** vegetation (plants/trees/flowers), prop-dressing geometry
(`island-dressing.ts`'s buildings/paths/boulders), or the rim's future six-row stepped skirt
(§3 component 6, which does not exist yet and therefore has no triangle cost to report).
