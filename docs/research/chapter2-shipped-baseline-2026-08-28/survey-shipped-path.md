# Survey: the shipped forest-world-r3f path (baseline, 2026-08-28)

Read-only survey for `adopt-the-land-into-the-shipped-map-arc-inc-01`. Scope: what
`packages/forest-world-r3f/src/*` (the `./canvas` subpath) draws TODAY, as shipped/mirrored —
never the rich `harness/` pipeline. Every quantitative claim is cited `path:line`. Where source
alone can't settle something it is marked NOT ESTABLISHED.

---

## 1. The shipped path, end to end

### 1.1 Geometry: semantic scene → 3D descriptors → mesh

`buildScene(input)` (`packages/forest-world/src/scene.ts`) turns a `SceneInput` into a typed
scene graph (`SceneG`), carrying an **already-folded** `SceneStatus` per node
(`packages/forest-world/src/scene.ts:13-15,56-63` — the fold itself never happens inside this
core; "Status arrives folded by the surface … the data→visual-status fold never enters the
core").

`worldTo3D(scene)` (`packages/forest-world-r3f/src/world-to-3d.ts:313-317`) walks that graph and
emits a flat array of `Descriptor3D` (`InstanceDescriptor | SkippedDescriptor`). The mapping,
one SceneKind → one InstanceKind, total-coverage (everything unmapped becomes an explicit
`{kind:'skipped', sceneKind}`, never a throw):

| SceneKind (input) | InstanceKind (output) | source |
|---|---|---|
| `tile` | `hex-ground` | `world-to-3d.ts:204-218` |
| `tree` | `story-tree` | `world-to-3d.ts:220-229` |
| `trail-fill` | `trail-strip` | `world-to-3d.ts:172-191` |
| `trail-ghost` | `trail-ghost-strip` (hidden=true) | `world-to-3d.ts:172-191` |
| `cave` | `cave-arch` | `world-to-3d.ts:231-256` |
| `wisp` | `wisp-sprite` | `world-to-3d.ts:258-267` |
| everything else | `skipped` | `world-to-3d.ts:193,272-273` |

`ForestWorldCanvas.tsx` (`packages/forest-world-r3f/src/ForestWorldCanvas.tsx`) is the ONLY
consumer of these descriptors on the shipped path — it groups by `kind` (`byKind`,
`ForestWorldCanvas.tsx:44-45`) and draws one placeholder mesh family per group:

| InstanceKind | React component | Three.js primitive | args | segments | source |
|---|---|---|---|---|---|
| `hex-ground` | `HexGround` (GPU-instanced via drei `<Instances>`) | `cylinderGeometry` | `[9, 9, 3, 6]` (radiusTop, radiusBottom, height=3, **radialSegments=6**) | 6 | `ForestWorldCanvas.tsx:49-68` |
| `story-tree` trunk | `StoryTree` | `cylinderGeometry` | `[1.2, 1.6, 8]` (radialSegments **defaults to 32** — not passed) | 32 | `ForestWorldCanvas.tsx:70-84,76` |
| `story-tree` crown | `StoryTree` | `coneGeometry` | `[7, 14, 8]` (radius, height, **radialSegments=8**) | 8 | `ForestWorldCanvas.tsx:79-82` |
| `trail-strip` | `TrailStrip` | drei `<Line>` (not a mesh — a line-strip buffer, width from `strip.width ?? 3`) | polyline `points` | n/a | `ForestWorldCanvas.tsx:87-98` |
| `cave-arch` | `CaveArch` | `circleGeometry` | `[hw, 24]` (radius = half the arch mouth width, **segments=24**) | 24 | `ForestWorldCanvas.tsx:100-113` |
| `wisp-sprite` | `WispSprite` | `sphereGeometry` | `[2.2, 12, 12]` (radius, **widthSegments=12, heightSegments=12**) | 12×12 | `ForestWorldCanvas.tsx:115-123` |

✅ **`trail-ghost-strip` descriptors are never drawn on the shipped path** — `ForestWorldCanvas`
only reads `byKind(descriptors, 'trail-strip')`, filtered further by `showTrails`
(`ForestWorldCanvas.tsx:176`); there is no `trail-ghost-strip` branch anywhere in the file. The
comment at `world-to-3d.ts:9-10,66-67` and `ForestWorldCanvas.tsx:17` both name this as
deliberate ("the cave props carry that story").

⚠ **Trails are hidden by default.** `ForestWorldCanvasProps.showTrails` defaults to `false`
(`ForestWorldCanvas.tsx:132,170,176`) — with no focus/selection concept on this canvas, the
"minimal reveal" is all-or-nothing (comment cites ADR-0169 §3/§4, `ForestWorldCanvas.tsx:14-17`).

Coordinate convention: the mapper positions everything 1:1 in the core's SVG-pixel units
(`HEX_RADIUS = 9`, `TILE_HEIGHT = 3`, `ForestWorldCanvas.tsx:49-50`, comment at :47-48 — "render
them 1:1 and size the camera instead").

### 1.2 Colour on the shipped path — THREE DIVERGENT PALETTES

⚠ **`ForestWorldCanvas.tsx` carries its own hardcoded six-entry palette**
(`STATUS_COLOUR`, `ForestWorldCanvas.tsx:30-37`), explicitly self-described as
"spike palette, not art direction" (`ForestWorldCanvas.tsx:23`). This is a THIRD, independent
copy from the two the rest of the app shares (the studio's `index.css` and the harness's
`palette-band.ts`, which the studio/harness world already keeps in sync with each other by
hand — `palette-band.ts:52-56` names `index.css` as its own source of truth, "if you retune a
token here, move it there in the same landing", `apps/studio/src/index.css:1617-1618`).

Representative hex values, all six `SceneStatus` tokens, side by side:

| status | `ForestWorldCanvas.tsx` `STATUS_COLOUR` (line 30-37) | `harness/palette-band.ts` `STATUS_TOKENS` (`top[0]` / `side`, line 93-116) | `apps/studio/src/index.css` `.hex-territory.st-*` (`--hex-top-0` / `--hex-side`, line 1620-1680) |
|---|---|---|---|
| `healthy` | `#4f9d5d` | `#8cb85e` / `#648244` | `#8cb85e` / `#648244` |
| `mapped` | `#5d8fa8` | `#b3946a` / `#85683f` | `#b3946a` / `#85683f` |
| `proposed` | `#c2b280` | `#d8c069` / `#a8914a` | `#d8c069` / `#a8914a` |
| `building` | `#7f8fd1` | `#d8c069` / `#a8914a` **(same object as `proposed`)** | `#d8c069` / `#a8914a` **(same CSS block as `proposed`)** |
| `unhealthy` | `#8a5a44` | `#57544a` / `#37352c` | `#57544a` / `#37352c` |
| `unknown` | `#9a9a9a` | `#9ca3af` / `#70757e` | `#9ca3af` / `#70757e` |

palette-band.ts and index.css are byte-identical for all six statuses (`palette-band.ts:93-116`
vs `index.css:1620-1680` — confirmed by direct comparison of every hex literal above); that pair
is the ADR-0462 "five colours over six states" world. `ForestWorldCanvas.tsx`'s map agrees with
neither: every single one of its six values is a different hex from the other two columns.

⚠ **ADR-0462 (commit `e9af5550`, landed 2026-08-28, this session's own recent history) did NOT
touch `ForestWorldCanvas.tsx`.** `git show e9af5550 --stat` (run this session) lists 27 changed
files — `apps/studio/src/index.css`, `packages/forest-world-r3f/harness/palette-band.ts`,
`harness/shadow-ladder.ts`, `harness/ground-cover.ts`, `harness/status-vocabulary.ts` (new),
`harness/island-fixture.ts`, and research/doc assets — **`src/ForestWorldCanvas.tsx` is absent
from that list.** The shipped canvas's palette is therefore **pre-ADR-0462**, and in particular
it is the ONLY one of the three palettes that still paints `building` a distinct colour
(`#7f8fd1`, a blue-purple, unrelated to any of the other five entries in its own map) rather
than sharing `proposed`'s yellow. This is a real, currently-live divergence, not a stale
research artefact — nothing in the diff touched the shipped file.

✅ **The ADR-0038 building→proposed fold is NOT implemented anywhere inside
`packages/forest-world-r3f`.** The fold function is `worldStatus()` in
`apps/studio/src/lib/worldStatus.ts:39-44`:
```
export function worldStatus(status: WorkStatus | null): WorkStatus | null {
  if (status === 'building' || status === 'healthy' || status === 'unhealthy') {
    return 'proposed';
  }
  return status;
}
```
(Note: this fold, as written, ALSO fully replaces `healthy`/`unhealthy` with `proposed` — read
the surrounding `provenStatus()`, `worldStatus.ts:56-62`, which re-derives `healthy` from a
signed verdict afterward; the net effect the module's own header describes, `worldStatus.ts:5-19`,
is that only `building` is what gets folded away in practice, `healthy`/`unhealthy` are
authored-provenance fallbacks under a *different* rule, ADR-0395.) This function lives in
`apps/studio`, is called from `TreeView.tsx:61,2909` (via `presentStories`,
`worldStatus.ts:89-114`) **before** `buildScene()` is invoked in the studio's own render path
(`TreeView.tsx:2909`). Neither `packages/forest-world/src/scene.ts` nor
`packages/forest-world-r3f/src/world-to-3d.ts` nor `ForestWorldCanvas.tsx` contain any fold
logic of their own — `scene.ts:13-15` states this explicitly ("the data→visual-status fold never
enters the core"), and `palette-band.ts:144-150`'s own comment on `TREE_TOKENS['building']`
confirms it from the harness side: *"`building` is in any case unreachable on the shipped map:
`worldStatus` folds it to `proposed` before any class is stamped (ADR-0038). This block is what a
surface that does NOT fold — the r3f harness, a legend, a demo — now draws."*

⚠ **Consequence: whether `building` ever reaches `ForestWorldCanvas.tsx`'s distinct
`#7f8fd1` depends entirely on whether whatever calls `worldTo3D(buildScene(...))` pre-folds
status the way the studio does.** The dev harness (`harness/main.tsx:46-56`) sidesteps the
question by authoring already-folded demo statuses directly (`'healthy' | 'proposed' |
'unhealthy'` only — `building` never appears as a territory `status` in the fixture). Because
(§3 below) nothing in the parent repo actually mounts `<ForestWorldCanvas>` outside that harness,
there is currently no live caller for which this question has an observable answer — it is
architecturally possible for `building` to reach the shipped canvas unfolded, but nothing in this
repo currently exercises that path.

### 1.3 What else the shipped canvas draws

- **Ground:** `HexGround` — one GPU-instanced `<Instances>` block of `cylinderGeometry(9,9,3,6)`,
  one `<Instance>` per `hex-ground` descriptor, coloured by `colourOf(t.material)`
  (`ForestWorldCanvas.tsx:52-68`).
- **Story tree:** `StoryTree` — a `<group>` of two meshes: a brown (`#6b4f35`, hardcoded, not
  status-coloured) trunk cylinder at y=4, and a status-coloured cone crown at y=12
  (`ForestWorldCanvas.tsx:70-85`).
- **Trail strip:** `TrailStrip` — a drei `<Line>` (not a mesh/triangle primitive) along the
  descriptor's `points`, tan colour `#b0a48e` hardcoded (not status-coloured), width from
  `strip.width ?? 3` (`ForestWorldCanvas.tsx:87-98`). Only drawn when `showTrails` is true.
- **Cave arch:** `CaveArch` — one unlit (`meshBasicMaterial`, dark `#171310`, not
  status-coloured) `circleGeometry` disc, rotated to the portal's rim bearing
  (`ForestWorldCanvas.tsx:100-113`).
- **Wisp sprite:** `WispSprite` — one emissive sphere (`#ffe9a8` base / `#ffd75e` emissive,
  hardcoded, not status-coloured), offset +20 in y above the wisp's ground position
  (`ForestWorldCanvas.tsx:115-123`).
- **Camera / controls:** a perspective `<Canvas>` (`fov: 45, near: 1, far: 4000`) auto-framed by
  `frameWorld()` (centroid + spread-proportional back-off, `ForestWorldCanvas.tsx:145-163,181`),
  driven by drei `<MapControls>` (pan/zoom/rotate, `ForestWorldCanvas.tsx:19-20,198`).
- Background colour `#101418`, one ambient light (0.7) + one directional light (1.1) at
  `[120,300,80]` (`ForestWorldCanvas.tsx:182-184`) — no shadows, no ground shading model beyond
  flat `meshStandardMaterial` colour.

⚠ **Only `hex-ground`, `story-tree` crown, and `cave-arch` fill are status-coloured.** Trunk,
trail line, cave disc, and wisp sprite all use fixed hardcoded colours regardless of `material`.

---

## 2. What `pnpm sync:web-engine` actually mirrors

Script: `pnpm sync:web-engine` → `packages/cli/src/web-engine.ts` (`package.json:50`), over the
pure core `packages/cli/src/web-engine-sync.ts`.

**Two `EnginePackage` descriptors, and ONLY these two** (`web-engine-sync.ts:75`,
`ENGINE_PACKAGES = [CORE_PACKAGE, R3F_PACKAGE]`):

| package | `srcDir` (source, parent repo) | `destDir` (dest, `web/`) | required files |
|---|---|---|---|
| `CORE_PACKAGE` | `packages/forest-world/src` | `src/lib/forest-world` | `scene.ts`, `index.ts` |
| `R3F_PACKAGE` | `packages/forest-world-r3f/src` | `src/lib/forest-world-r3f` | `index.ts`, `world-to-3d.ts`, `ForestWorldCanvas.tsx` |
(`web-engine-sync.ts:51-72`)

✅ **`packages/forest-world-r3f/harness/` is NEVER copied — `srcDir` names only `.../src`, a
sibling directory, and the sync reads exactly that directory's file list**
(`web-engine.ts:37-38,53-68` — `readPackageSources()` does `readdirSync(srcDirAbs(pkg))`, and
`srcDirAbs` joins `repoRoot` with `pkg.srcDir.split('/')`, i.e. `packages/forest-world-r3f/src`
only). There is no code path in `web-engine.ts` or `web-engine-sync.ts` that ever reads
`packages/forest-world-r3f/harness/*`. This is also the documented and tested reason `harness/`
exists at all — `harness/scope-fence.test.ts:1-16` states the sync "copies every non-test
`.ts`/`.tsx` it finds under [`src/`] and offers NO mechanism to exclude one," which is exactly
why the live-render experiment's files were moved out of `src/` into `harness/` rather than
excluded some other way.

Within `packages/forest-world-r3f/src`, the sync copies every file passing `isEngineSource()`
(`.ts`/`.tsx`, not `.test.ts(x)`, not `*-fixture.ts(x)`, not `.d.ts` — `web-engine-sync.ts:86-93`)
— for this package that is `index.ts`, `world-to-3d.ts`, `ForestWorldCanvas.tsx`, `act2-director.ts`
(the `.test.ts` siblings are excluded). Each copy is stamped with an `@generated` banner
(`web-engine-sync.ts:101-107`) naming the parent source and gets its relative `.js` imports
rewritten extensionless for Vite/Astro resolution (`web-engine-sync.ts:116-118`), plus LF EOL
normalisation (`web-engine-sync.ts:97-99`).

`pnpm check:web-engine` (same file, `--check` mode) is the drift gate: bootstrap-allows a
package whose `destDir` doesn't exist yet in `web/` as a SKIP (`web-engine.ts:107-116`), and
otherwise fails hard on any drift (`web-engine.ts:125-136`).

---

## 3. Is `<ForestWorldCanvas>` actually mounted anywhere?

Searched the whole parent repo (`packages/`, `apps/`, root config/docs) for
`ForestWorldCanvas` / `forest-world-r3f/canvas` / bare `@storytree/forest-world-r3f` imports.
Every hit:

| file:line | what it is |
|---|---|
| `packages/forest-world-r3f/harness/main.tsx:24,151` | the package's OWN dev harness (`vite harness`, `package.json:12`) — imports and mounts `<ForestWorldCanvas descriptors={descriptors} showTrails />` directly |
| `packages/forest-world-r3f/harness/scope-fence.test.ts:98` | a string literal in the fence test's required-file list, not an import |
| `packages/forest-world-r3f/harness/banded-material.ts:2` | a comment referencing the component by name |
| `packages/forest-world-r3f/src/ForestWorldCanvas.tsx` / `index.ts:4` | the component's own definition / barrel comment |
| `packages/forest-world-r3f/package.json:9` | the `./canvas` export map entry itself |
| `packages/cli/src/web-engine-sync.ts:66-67`, `web-experience-check.ts:116`, `frontend-capture-trigger.ts:26`, `frontend-capture-trigger.test.ts:56` | build/CI tooling that NAMES the package (sync dest dir, the ADR-0134 WebGL-specifier detector, capture-trigger scoping) — none of these import or mount the component |
| `repo-manifest.json:62,507` | manifest metadata mapping the package/file to its owning story (`website-experience` / `r3f-world-spike`), not a runtime import |
| `.claude/launch.json:63` | a VS Code/editor launch config that runs `pnpm --filter @storytree/forest-world-r3f dev` (i.e. launches the harness), not a mount site |
| `docs/research/chapter2-compositor-order-and-caps-2026-08-17/order-and-caps-report.json:21` | a prior research artefact naming the package |

**No hit inside `apps/studio` or `apps/desktop` imports or mounts `ForestWorldCanvas`** —
confirmed separately: `grep -rln "forest-world" apps/` returns only studio files that use
`@storytree/forest-world` (the CORE package: `worldSettings.ts`, `factoryBuildings.ts`,
`TreeView.tsx`, `index.css`, various tests) for the studio's own SVG scene render — **none of
them touch `forest-world-r3f` or the R3F canvas.**

✅ **`web/` (the public-website submodule) is NOT checked out in this worktree** —
`git submodule status` reports `-a3691b40e974b1878a5e9b5a3e44f94404e1af9d web` (leading `-` =
uninitialized), and `find web -maxdepth 2` returns only the empty stub directory. **Whether the
website mounts `<ForestWorldCanvas>` on a real page is therefore UNVERIFIED** — establishing it
needs `git submodule update --init web` followed by a grep of `web/src` for
`forest-world-r3f`/`ForestWorldCanvas`/`data-experience-entry` mount points; this survey does not
do that (out of scope: read-only against this checkout's tracked tree).

**Bottom line for the ADR-0380 D6 fence-4 question this feeds:** inside the parent repo,
`<ForestWorldCanvas>` — with its perspective camera (`fov:45`, `ForestWorldCanvas.tsx:181`) and
drei `MapControls` (`ForestWorldCanvas.tsx:198`) — is mounted in exactly one place, the package's
own dev-only harness (`harness/main.tsx:151`), which is never synced to the website (§2) and
never built into any shipped app. It is DORMANT, not live, as far as this checkout can establish.
The live-website half of the question is UNVERIFIED, not "no" — a later session must check the
`web/` submodule directly rather than assume this survey settled it.

---

## 4. Authored geometry counts for the shipped path

No authored triangle/vertex count exists anywhere in the repo today — this is the first. Derived
by hand from the installed `three@0.185.1` source
(`node_modules/.pnpm/three@0.185.1/node_modules/three/src/geometries/{Cylinder,Cone,Circle,Sphere}Geometry.js`,
read this session) against the exact `args` each shipped mesh passes. Static/authored counts
only — no runtime instrumentation.

**`CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments=1)`**
(confirmed from source, `CylinderGeometry.js:167-179`): torso emits 2 triangles per
`(radialSegments × heightSegments)` cell UNLESS one radius is 0, in which case the row touching
that end degenerates to 1 triangle per column (`CylinderGeometry.js:167,171`: the `if
(radiusTop > 0 || y !== 0)` / `if (radiusBottom > 0 || y !== heightSegments-1)` guards). Each cap
(when its radius > 0) is a `radialSegments`-triangle fan (`CylinderGeometry.js:270-289`: one
`indices.push` per `x` in `0..radialSegments`, no doubling). `ConeGeometry` IS a
`CylinderGeometry(0, radius, height, ...)` (`ConeGeometry.js:32`).

### 4.1 hex-ground — `cylinderGeometry(9, 9, 3, 6)` (`ForestWorldCanvas.tsx:57`)
Both radii > 0 (9, 9), radialSegments=6, heightSegments=1 (default):
- torso: `6 segments × 1 × 2 triangles = 12`
- top cap (radiusTop=9>0): `6`
- bottom cap (radiusBottom=9>0): `6`
- **Total: 24 triangles per hex-ground instance.** Instanced via drei `<Instances>`
  (`ForestWorldCanvas.tsx:55`) — one draw call for N tiles, but N × 24 authored triangles.

### 4.2 story-tree — trunk `cylinderGeometry(1.2, 1.6, 8)` + crown `coneGeometry(7, 14, 8)`
(`ForestWorldCanvas.tsx:76,80`)

Trunk: radiusTop=1.2>0, radiusBottom=1.6>0, radialSegments **defaults to 32** (only 3 args
passed — three.js's constructor default, `CylinderGeometry.js:34`), heightSegments=1:
- torso: `32 × 1 × 2 = 64`
- top cap: `32`
- bottom cap: `32`
- Trunk subtotal: **128 triangles.**

Crown: `coneGeometry(radius=7, height=14, radialSegments=8)` → `CylinderGeometry(0, 7, 14, 8, 1)`.
radiusTop=0, radiusBottom=7>0:
- torso: at the single height row (y=0), the `radiusTop>0||y!==0` guard is false for every
  column, so only the SECOND triangle of each cell is emitted → `8 segments × 1 × 1 = 8` (not 16
  — the degenerate-tip row halves it)
- top cap: **skipped** (`if (radiusTop > 0) generateCap(true)` is false, `CylinderGeometry.js:83`) → `0`
- bottom cap (radiusBottom=7>0): `8`
- Crown subtotal: **16 triangles.**

**Total: 128 + 16 = 144 triangles per story-tree instance** (two meshes, one `<group>`).

### 4.3 cave-arch — `circleGeometry(hw, 24)` (`ForestWorldCanvas.tsx:108`, `hw` = half the arch
mouth width, variable per instance, does not affect triangle count)
`CircleGeometry` is a plain fan from a centre vertex: `segments` triangles, no cap logic, single
one-sided disc (`CircleGeometry.js:99-105`, one `indices.push` per segment):
- **Total: 24 triangles per cave-arch instance** (one-sided — `meshBasicMaterial`, unlit, not
  double-sided by default).

### 4.4 wisp-sprite — `sphereGeometry(2.2, 12, 12)` (`ForestWorldCanvas.tsx:119`)
widthSegments=12, heightSegments=12, default `thetaLength=Math.PI` (full sphere, both poles
present). Per source (`SphereGeometry.js:130-144`): both the polar row (`iy=0`) and the
antipolar row (`iy=heightSegments-1`) drop one of their two triangles per column (the pole-fan
correction), giving triangle count `2 × widthSegments × (heightSegments − 1)`:
- `2 × 12 × (12 − 1) = 2 × 12 × 11 = 264`
- **Total: 264 triangles per wisp-sprite instance.**

### 4.5 Per-instance summary

| primitive | triangles | breakdown |
|---|---|---|
| hex-ground | **24** | torso 12 + top cap 6 + bottom cap 6 |
| story-tree | **144** | trunk 128 (torso 64 + 2 caps ×32) + crown 16 (torso 8 + bottom cap 8, top cap absent) |
| cave-arch | **24** | one-sided 24-segment fan |
| wisp-sprite | **264** | `2 × 12 × (12−1)`, both poles present |

### 4.6 One representative island (illustrative total, from the dev-harness fixture)

Using the harness demo's `greenhouse` island (`harness/main.tsx:46-52`): `ring(0,0)` authors
exactly 7 `Axial` tiles (centre + 6 explicit offsets listed at `main.tsx:36-44`), 1 wisp entry
(`main.tsx:52`), and — per `world-to-3d.ts:220-229` — exactly one `story-tree` descriptor per
territory (the tree carries the territory's own translate). Each `SceneTerritoryInput.wisps`
entry yields exactly one `wisp` scene node (`packages/forest-world/src/scene.ts:1422`,
`t.wisps.map((w) => {…})`).

- 7 hex-ground × 24 = **168**
- 1 story-tree × 144 = **144**
- 1 wisp-sprite × 264 = **264**
- Subtotal (excluding cave-arch): **576 triangles**

⚠ **Cave-arch count for this island is NOT ESTABLISHED from source alone.** Cave placement comes
from `routeTrails()` (`packages/forest-world/src/routing.ts`, not read in depth this session), a
cost-field router over the whole `trailIslands` set and its `depends_on` edges
(`harness/main.tsx:99-108`) — how many forced-route portals land on any one island is a function
of the routed network, not a static per-island constant, so it cannot be hand-derived the way
tile/tree/wisp counts can. Establishing it would require either running `routeTrails` for a
concrete island graph and counting the resulting `cave` scene nodes, or instrumenting
`worldTo3D`'s output at runtime (which this survey deliberately avoids, per the increment's
"authored, not runtime" framing for tiles/trees/caves/wisps *per primitive*, though a *per-island
cave count* is a routing-runtime fact, not an authored-geometry one).
