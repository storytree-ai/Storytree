---
id: "studio"
tier: story
title: "The studio"
outcome: "An operator reviews the project record through one browsable forum studio."
status: proposed
proof_mode: UAT
capabilities: [dev-server-persistence-backbone, seed-library-corpus, read-corpus, resolve-comment, annotate-topic, browse-library, author-library-artifact, chat-panel, hud-chrome, verified-attribution, coalesced-camera-pan, map-route-retention, map-payload-cache, map-server-memo, map-boot-independence, compositor-pan-transform, camera-rasterisation-probe, act2-regrow-camera-zoom-out, act2-regrow-camera-frame-delivery, arc-orientation-lens, act2-intro-cursor]
# Story-level edges: the "Cross-story boundary" section below, encoded (consumed seams,
# ADR-0010 §4; code-import-evidenced — see that section for file:line). ADR-0036. As of ADR-0100
# the studio app is a consuming SURFACE in the boundary scan (check:boundaries now walks apps/*),
# so EVERY @storytree/* runtime dep is a declared + forest-rendered edge — not just the first three.
# ADR-0112: the studio server now lazy-imports @storytree/drive (the build/orchestrate drivers carved
# out of cli) for its db-control / build surfaces and DROPPED its @storytree/cli dependency — so the
# `cli` edge is gone. The drive surface is owned by drive-machinery, already in depends_on below, so
# this is a re-pointing of the same code edge to a narrower package, not a graph change.
# ADR-0237 increment 1: Studio is the first consumer of `@storytree/app-surface`; the shared package
# owns the world-scene slice while Studio retains TreeView's controller and surrounding chrome, so
# the consumer-side `app-surface` edge is declared here.
# ADR-0267: the arc surface's read path needs the `Store` SEAM itself, not the rendered asset wire —
# `LibraryBackend.docStore()` hands the live store to the shared arc rollup so the studio and
# `storytree arc show` derive one join. That makes `storage-protocol` a declared edge here. It is a
# TYPE-only import today (the runtime value is the pg store the backend already builds), but
# check:boundaries reads the code graph, not the emit, and a type edge is still a real coupling.
depends_on: [library, drive-machinery, notice-board, forest-world, studio-members, proof-protocol, uat-criterion-detail, art-factory, app-surface, storage-protocol]
# Deciding ADRs (ADR-0037 §2): UI-drives-agents (8), the story world (36, recalibrated by 38),
# the app brought into the boundary scan as a consuming surface (100), the drive-package
# extraction that re-pointed the build/secrets seam off cli onto @storytree/drive (112), the
# garden-composition fold that added the baked-kit import (221), the art-factory split that
# makes that import a declared cross-story edge (222), the shared app-surface extraction (237),
# map route retention before caching or density work (240), and the measurement that re-costs a pan
# frame and moves the camera off the SVG `<g>` for the duration of a gesture (272). ADR-0240's staged
# order was taken one increment at a time: stage 1 is `map-route-retention` (retain the map across SPA
# routes), stage 2 is `map-payload-cache` (persist and paint the two READ-ONLY payloads, stamped and
# paint-then-revalidate), stage 3 is `map-server-memo` (memoize the `stories/` and `docs/` walks
# behind a fingerprint that moves on a content edit, and add `no-cache` + `ETag` validators to the
# two read routes — what makes the always-revalidate stage 2 mandated actually cheap), stage 4 is
# `map-boot-independence` (de-serialise the boot so the map's own fetch starts as soon as membership
# resolves). ADR-0240's stage 5 was to be the density budget; ADR-0272 measured a pan frame as ~99.8%
# RASTERISATION and DE-SEQUENCED density (D3) — ~85% of the map would have to disappear to fix pan
# that way — so stage 5 is `compositor-pan-transform` (D2: the camera stops being a `<g transform>`
# for the duration of a gesture). 272 is therefore a NEW deciding ADR here: it amends 240's decisions
# 1 and 3 and changes which increment this story authors next.
decisions: [8, 36, 38, 100, 112, 221, 222, 237, 240, 272, 313]
---

# The studio

**Outcome —** An operator reviews the project record through one browsable forum studio.

apps/studio is a hand-built, single-process Vite dev app (run with `pnpm --filter studio dev`) that turns the repo's own docs/ corpus and a synthesised guidance Library into a reviewable forum: read rendered ADRs/glossary, anchor comments onto exact text spans / sections / whole topics and resolve them, and browse-author-seed a categorised Library of injectable guidance artifacts. The backend serves docs read-only from <repo>/docs and persists through the LibraryBackend seam: Cloud SQL in the live posture, or the offline JSON stores (`comments.json` plus the knowledge-derived, gitignored `assets.runtime.json`) used by the scripted UAT. HONESTY: every unit below is a RETROSPECTIVE spec over already-working code: each contract describes the isolated unit test that WOULD prove a leaf (citing real code at file:line), each capability describes the integration test that WOULD prove it against its real in-story collaborators (no stubs within the organism), and the single story-level UAT below describes the acceptance walkthrough that WOULD prove the whole organism against the real running app. The package carries test tooling (a vitest suite in `pnpm -r test` scope and the scripted Playwright story UAT — see § Proof), but no passing proof ceremony is claimed here. Nothing here is authored proven or healthy; proof state derives from signed evidence.

> **Historical note (librarian pass, 2026-07-18; UAT re-tensed 2026-07-25):** the `assets.json` /
> `seed.assets.mjs` machinery retained in the retrospective capability prose is **retired** —
> `seed.assets.mjs` → the `build-corpus.mjs`
> generator at ADR-0018, artifact state to the live Cloud SQL store at ADR-0023, and the last committed
> `assets.json` + `build-corpus.mjs` at ADR-0210. The studio's Library tier is now DB-backed (the offline
> backend derives its view at runtime from the library's committed FIXTURE corpus,
> `@storytree/library/fixture`, plus `@storytree/library` `libraryTemplates()` — ADR-0302 D1 deleted the
> `knowledge.json` that seed used to read, and the fixture is a small sandbox seed, not a copy of the
> Library);
> comments likewise moved to the store in the live posture. The Story UAT below is current: its offline
> proof seam exercises `comments.json` plus derived `assets.runtime.json`, never the retired `assets.json`.

## What this is

This is storytree's **first story** — the seed of the self-building tree, authored by
hand (the bootstrap "midwife" step) by decomposing what was really built in
`apps/studio`. A **story** is a **bounded context** — a self-contained organism, the
unit of independent deployability (the microservice grain, ADR-0010) — composed of
capabilities, and the map grain a newcomer points at (ADR-0002). Under the organism
model the proof ladder shifts up one rung: the **story** carries the integrated **UAT**
(the acceptance walkthrough of the whole organism against real collaborators), each
**capability** is proven by an **integration test** against real *in-story*
collaborators (no stubs within the organism), and each **contract** stays the isolated
unit-test leaf (ADR-0010 §2).

Every dependency below is a within-story code-derived edge, and nothing here runs
against a stubbed upstream interface. This story now **owns one declared cross-story
interface** (ADR-0010 §4): the **comment substrate**
([`interface-comment-substrate.md`](interface-comment-substrate.md), declared 2026-06-11)
— the store-seam comment surface `stories/feedback-graduation` consumes. As a **consuming
surface** (ADR-0100 — `apps/studio` is a sink the boundary scan now walks) it also **declares
every cross-story seam it rides**: the original three (the pg/library backend, the
drive-machinery node-spec + verdict stream, the notice-board presence surface) plus the
render-core, access-control, verdict-shape and build/secrets seams that arrived later (the
build/secrets seam re-pointed off `cli` onto `@storytree/drive` by ADR-0112) — see
§"Cross-story boundary" below.

See [`../README.md`](../README.md) for the representation and how every field maps to
ADR-0002 / `docs/glossary.md`.

## Capabilities (21)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md) | Data written through the studio's API survives a dev-server restart. | — |
| 2 | [`seed-library-corpus`](seed-library-corpus.md) | Running the seeder produces the categorised, ADR-cited starter corpus the Library serves. | — |
| 3 | [`read-corpus`](read-corpus.md) | An operator reads any corpus document as rendered markdown in the studio. | `dev-server-persistence-backbone` |
| 4 | [`resolve-comment`](resolve-comment.md) | An operator resolves a comment with the resolved state persisted across every surface. | `dev-server-persistence-backbone` |
| 5 | [`annotate-topic`](annotate-topic.md) | An operator anchors a comment onto a precise place in a rendered topic. | `dev-server-persistence-backbone`, `read-corpus` |
| 6 | [`browse-library`](browse-library.md) | An operator explores the seeded guidance Library down to a single rendered artifact. | `dev-server-persistence-backbone`, `seed-library-corpus`, `read-corpus` |
| 7 | [`author-library-artifact`](author-library-artifact.md) | An operator durably changes the Library's contents through the editor form. | `dev-server-persistence-backbone`, `browse-library` |
| 8 | [`chat-panel`](chat-panel.md) | The studio frontend renders a chat panel — a thin client that POSTs the operator's intent to `/api/chat`, streams the SSE response, and renders the `done` proposal / `error` / `refused` outcomes (and an honest disabled state where the route is absent), importing no agent/drive/model code. | — |
| 9 | [`hud-chrome`](hud-chrome.md) | The forest map becomes the landing surface and the top banner + Overview page retire: the only global chrome is a single verified-identity avatar (top-right) — no brand chip and no navigation outside it — whose menu shows the read-only identity + role and ONLY the role-/posture-gated Members, Credentials, and Sign out account items, with no Library/Documents navigation (ADR-0204, re-tensed by ADR-0205). | `dev-server-persistence-backbone` |
| 10 | [`verified-attribution`](verified-attribution.md) | Comment attribution derives from the verified `/api/me` identity everywhere: the composer presents the verified identity read-only (`operator` fallback in the open dev posture) and the post relies on the server stamp, and the localStorage operator store (`lib/operator.ts`) retires (ADR-0204 D4). | `dev-server-persistence-backbone` |
| 11 | [`coalesced-camera-pan`](coalesced-camera-pan.md) | An operator's forest drag commits the latest camera position at most once per display frame. | — |
| 12 | [`map-route-retention`](map-route-retention.md) | An operator returns to the same live forest map after a SPA hash-route transition. | — |
| 13 | [`map-payload-cache`](map-payload-cache.md) | An operator who reloads the studio sees the forest paint from the last visit's persisted payloads instead of waiting on a cold server walk. | — |
| 14 | [`map-server-memo`](map-server-memo.md) | An operator's repeated studio load is answered without re-reading a corpus that has not changed on disk. | — |
| 15 | [`map-boot-independence`](map-boot-independence.md) | An operator's forest map begins fetching its own data as soon as membership resolves, instead of waiting on Library-corpus payloads the map never reads. | — |
| 16 | [`compositor-pan-transform`](compositor-pan-transform.md) | A forest drag moves the already-rasterised map on the compositor, so the `.world-camera` `<g>` transform is written once at the end of a gesture rather than once per frame. | `coalesced-camera-pan` |
| 17 | [`camera-rasterisation-probe`](camera-rasterisation-probe.md) | A repeatable Studio diagnostic reports the rasterisation-cost delta between the real 40-island regrow growth-only baseline and cursor-driven camera-transform variants under ADR-0286's bracketed idle-floor protocol. | — |
| 18 | [`act2-regrow-camera-zoom-out`](act2-regrow-camera-zoom-out.md) | The existing Act 2 regrow carries the Studio camera from a close opening view to the ordinary fitted whole-forest view on its own cursor. | `camera-rasterisation-probe` |
| 19 | [`act2-regrow-camera-frame-delivery`](act2-regrow-camera-frame-delivery.md) | The approved Act 2 bottom-anchored zoom-out preserves its exact choreography while its stable-picture frames reach the display within one refresh interval of the growth-only control. | `act2-regrow-camera-zoom-out`, `camera-rasterisation-probe` |
| 20 | [`arc-orientation-lens`](arc-orientation-lens.md) | An owner arriving cold is oriented by the map's arc lens alone, without asking an agent to reconstruct the context. | — |
| 21 | [`act2-intro-cursor`](act2-intro-cursor.md) | The Act 2 forest regrow is driven end to end by one app-owned cursor the operator can move. | — |

Rows 20–21 are **brownfield `mapped` units authored retrospectively** by
`capability-layer-coverage-arc` increment 4 (2026-08-07) over already-working, already-tested code.
They close ADR-0317's grain residue: six `repo-manifest.json` subtrees whose declared owner was this
STORY only because no capability existed for that code. Both carry a spec-borne `proof:` and no
`real:` arm (ADR-0094) — see each file's frontmatter comment for why that omission is load-bearing.

## Dependency graph (code-derived)

These are **within-story** edges, **read off the real source** (static analysis of the
imports / data-flow between capabilities), never hand-drawn from UAT need (ADR-0010 §3):
A → B means A's code actually couples to B's code inside the one organism. The graph is
acyclic; `dev-server-persistence-backbone`, `seed-library-corpus`, `chat-panel`,
`coalesced-camera-pan`, `map-route-retention`, `map-payload-cache`, `map-server-memo`,
`map-boot-independence`, `camera-rasterisation-probe`, `arc-orientation-lens` and
`act2-intro-cursor` are the roots. (Cross-story edges are NOT in this graph — they are boundary
interfaces, declared in §"Cross-story boundary" below and encoded as frontmatter `depends_on` —
ADR-0010 §4.)

- `read-corpus` → `dev-server-persistence-backbone`
  - read-corpus owns its doc handlers (listDocs, safeDocPath, handleDocs at devApi.ts:96-343) but **rides** the backbone's `/api/*` middleware registration — handleDocs is dispatched only because storytreeDataApi.configureServer mounted the namespace before Vite's SPA fallback (devApi.ts:358-377). The coupling is the shared connect-middleware seam, read straight off the code.
- `annotate-topic` → `dev-server-persistence-backbone`
  - The annotate UI calls api.createComment → POST /api/comments, whose handler runs readAnchor + writeStore (devApi.ts:199-223), and re-finds highlights from the GET → readStore round-trip — annotate's data path is literally the backbone's comment persistence handlers.
- `annotate-topic` → `read-corpus`
  - annotate-topic mutates the DOM read-corpus renders: useAnnotations injects `<mark>`s into the memoized markdown subtree (DocView.tsx:51-59) and reads slugged heading ids produced by read-corpus's slugify/parseHeadings (markdown.ts) — its anchors are computed against read-corpus's rendered output, a direct render-layer coupling.
- `resolve-comment` → `dev-server-persistence-backbone`
  - toggleResolved calls api.updateComment → PATCH /api/comments?id, whose handler stamps/clears resolvedAt and writeStore-persists it (devApi.ts:225-239), then refreshComments re-fetches GET /api/comments — resolve's only write and its read-back are both the backbone's handlers. (No edge to annotate-topic: resolve imports none of annotate's create path; the surfaces only share the Comment shape and the comments.json file.)
- `browse-library` → `dev-server-persistence-backbone`
  - Library.tsx / AssetView render from AppData populated by GET /api/assets and the doc index GET /api/docs (App.tsx:58-59) — both served by the backbone's `/api/*` middleware over the on-disk JSON store; the read path is backbone code.
- `browse-library` → `seed-library-corpus`
  - browse-library consumes the **artifacts the seeder wrote**: the grid, chip counts (definition 54, pattern 11, guardrail 8, principle 5, techstack 4, template 6), and every doc: citation come from apps/studio/data/assets.json, which exists only because seed.assets.mjs produced it — a data-provenance coupling on the seeder's output file.
- `browse-library` → `read-corpus`
  - RefLink builds an in-app doc link via docHref(relpath) into #/doc/<relpath> (AssetView.tsx:106-113), and following it lands in read-corpus's DocView — resolving and rendering that cited doc is read-corpus's code, which browse-library calls into.
- `author-library-artifact` → `dev-server-persistence-backbone`
  - AssetEditor's save()/remove() call api.createAsset/updateAsset/deleteAsset → POST/PATCH/DELETE /api/assets, whose handlers run readAssetInput, the dup/relock guards, createdAt/updatedAt stamping and writeStore (devApi.ts:291-321) — author's durable mutations are the backbone's asset handlers.
- `author-library-artifact` → `browse-library`
  - After every save/delete, AssetEditor/AssetView call refreshAssets() then navigate into browse-library's surfaces — create/edit land on AssetView (the detail render browse-library owns), delete routes to the Library list (AssetView.tsx:36-38); author's post-mutation render path is browse-library's components.
- `chat-panel` → (no within-story edge — a THIRD root)
  - chat-panel is a self-contained behavioural component (the `BuildSection` precedent): its ONLY
    backend seam is the studio `api` streaming client (the chat method it adds to api.ts / a lib helper),
    not another capability's code. It does NOT couple to `dev-server-persistence-backbone` — the chat
    route is not a persistence-backbone handler; it is the desktop's `chat-sse-mount` dispatcher (the
    studio-dev-server mount of `/api/chat` is a separate follow-on, see chat-panel.md "Where /api/chat
    lives"). The chat WIRE SHAPE it consumes (`chat-sse-mount`'s `done`/`error`/`refused` SSE frames) is a
    CROSS-BOUNDARY contract (plain JSON over HTTP against a locally-declared type), NOT a within-story
     code edge and NOT a package import — so it adds no frontmatter `depends_on` (within- or cross-story).
     See chat-panel.md "No new cross-story edge".
- `coalesced-camera-pan` → (no within-story edge — a FOURTH root)
  - The camera controller and the Studio-only chrome are neighbouring slices in `TreeView.tsx`, not
    imports from any named `studio` capability. Its shared `WorldSceneView`/`SceneView` seam is already
    the declared **cross-story** `studio → app-surface` edge; this increment neither imports a new
    package nor changes the world's model, so it adds no in-story or cross-story dependency.
- `map-route-retention` → (no within-story edge — a FIFTH root)
  - This is the App-owned route-lifetime composition around the existing `TreeView`, not an import from
    `coalesced-camera-pan`, `hud-chrome`, or any other named capability. It retains the existing Studio
    map instance without changing its controller, route parser, terminal owner, or `@storytree/app-surface`
    seam, so it adds no in-story or cross-story dependency.
- `map-payload-cache` → (no within-story edge — a SIXTH root)
  - Its own new module (`src/lib/payloadCache.ts`) plus the boot/tree-load call sites it wires are
    NEIGHBOURING slices in `App.tsx` / `TreeView.tsx` / `StoreBanner.tsx`, not imports from
    `map-route-retention`, `coalesced-camera-pan`, or `dev-server-persistence-backbone` — the same
    same-file-adjacency-is-not-an-edge call `coalesced-camera-pan` makes. Nor is it a UAT-need edge: a
    full browser RELOAD keeps nothing in memory, so route retention's delivered outcome is not a
    precondition of this capability's proof, and retention passes with no cache present. It reads
    `/api/health`'s existing `code.head` through the banner's existing poll and adds no package import,
    so it adds no in-story or cross-story dependency.
- `map-server-memo` → (no within-story edge — a SEVENTH root)
  - Its own new module (`server/corpusMemo.ts`) imports neither `readTree` nor `listDocs`; the two read
    routes call both, as they already do. The one edge a reader would reasonably question is
    `read-corpus`, which owns the doc handlers (`listDocs` / `handleDocs`) this increment wires a memo
    and a validator INTO — the honest call is that this is the same same-file-adjacency-is-not-an-edge
    reading `coalesced-camera-pan` and `map-payload-cache` already make, and it holds here for a
    stronger reason: the increment is required to leave `listDocs`'s exported signature and its returned
    VALUE unchanged (the `docsMirrorProbe` / `check:mirror-conformance` diff depends on that), so it
    consumes nothing read-corpus produces and changes nothing read-corpus renders. Nor is it a UAT-need
    edge: the proof drives a temp-dir corpus through the routes and asserts freshness and validators, so
    read-corpus's delivered outcome is not a precondition of it. It adds no package import, so no
    cross-story edge either.
- `map-boot-independence` → (no within-story edge — an EIGHTH root)
  - It removes one boot gate (`status`) and one dead boot fetch from `App.tsx`'s existing composition
    and teaches the assets consumers a not-yet-loaded state. `treeMounted` — stage 1's route-retention
    rule, owned by `map-route-retention` — is deliberately LEFT as the mount gate and is neither
    consumed nor changed, so neighbouring it in `App.tsx` is the same same-file-adjacency-is-not-an-edge
    call the three siblings above make. Nor is it a UAT-need edge: the proof holds `listAssets` pending
    and asserts `/api/tree` is nonetheless requested, which needs no sibling's delivered outcome as a
    precondition. It changes no server code and adds no package import, so no cross-story edge either.
- `compositor-pan-transform` → `coalesced-camera-pan` (a REAL edge — and the one place on this arc
  where the same-file-adjacency call does NOT apply)
  - Its four arc siblings above each recorded that neighbouring another capability's code in
    `TreeView.tsx` / `App.tsx` is not an edge, because they consume nothing those capabilities produce.
    That reasoning fails here, and the discriminator is consumption, not proximity: this capability's
    per-frame write EXECUTES INSIDE the machinery `coalesced-camera-pan` delivered — the
    `requestAnimationFrame` callback `queuePan` schedules, guarded by its generation counter, drained by
    `commitPendingPan`, force-landed by `flushPendingPan` on pointer-up — and it edits those exact
    functions to re-target that write onto the new compositor-only wrapper. Stage 1's frame boundary IS
    this unit's scheduling contract: with no coalescer there is no once-per-frame boundary to paint on
    and no trailing-edge flush to commit from, so the code coupling is a data-flow dependency read off
    the real source (ADR-0010 §3), not a UAT-need edge drawn from the ADR. Tested the other way, the
    edge is one-directional and the graph stays acyclic: `coalesced-camera-pan` needs nothing this unit
    delivers — it landed and proves green with no wrapper present. It adds no package import (the
    shared `WorldSceneView`/`SceneView` seam it paints through is the already-declared `studio →
    app-surface` cross-story edge, untouched), so it adds no cross-story edge.
- `camera-rasterisation-probe` → (no within-story edge — a NINTH root)
  - This is a Studio-owned production diagnostic around the already-shipped regrow and camera
    controller. It consumes their current public behaviour without requiring another named Studio
    capability's delivered outcome, changes no product choreography, and adds no package import. The
    existing `studio → app-surface` boundary already covers the rendered world it measures.
- `act2-regrow-camera-zoom-out` → `camera-rasterisation-probe`
  - The product zoom consumes the probe's delivered production-comparison boundary to measure the
    final shipped curve against interleaved growth-only controls under the same 40-island idle-floor
    protocol. The reverse does not hold: the probe already reports declarative camera variants without
    this product choreography, so the graph remains acyclic. The camera implementation stays
    Studio-owned and adds no package import; the existing `studio → app-surface` edge still covers the
    rendered world.
- `arc-orientation-lens` → (no within-story edge — a TENTH root)
  - The four modules this organ owns reach only `src/api.ts`, `src/lib/poll.ts`, `src/types.ts` and
    `src/lib/route.ts`'s `assetHref` — three story-grain infrastructure files no capability owns,
    plus one deep-link helper. Its mount sits beside the camera and drawer slices in `TreeView.tsx`,
    which is the same same-file-adjacency-is-not-an-edge call the four map-stage siblings above
    already make: it consumes nothing any named `studio` capability produces, and its proof takes
    rollups as PROPS, so no sibling's delivered outcome is a precondition of it. Its `ArcRollup[]`
    arrives over `GET /api/arcs` from `@storytree/drive`'s shared join — the already-declared
    `drive-machinery` and `storage-protocol` cross-story seams, untouched — so it adds no in-story
    or cross-story dependency.
- `act2-intro-cursor` → (no within-story edge — an ELEVENTH root)
  - The regrow's ORDER, geometry and render layers are `@storytree/app-surface`'s
    (`deriveForestRegrowPlan`), which is the already-declared `studio → app-surface` edge; this unit
    owns only the clock, the cursor and the transport over them. It adds no package import.
    **The one edge a reader would reasonably question runs the OTHER way:**
    `act2-regrow-camera-zoom-out` names its driver as *"the existing normalized regrow cursor"* —
    this unit's — so the camera capabilities consume it, not the reverse. Tested both ways the edge
    is one-directional and the graph stays acyclic: this unit landed and proves green with no camera
    choreography present. That inbound edge is NOT yet declared on the two camera specs; increment 4
    recorded it in [`act2-intro-cursor.md`](act2-intro-cursor.md) rather than editing them, because
    changing a `proposed` capability's `depends_on` moves `story build`'s topo order.

## Cross-story boundary (ADR-0010 §4)

Declared 2026-06-12 (ADR-0036) — these arrived with the live-store backend and the story-world
view, **after** this retro-spec's first authoring; all three are read off real imports, the
within-story standard applied across the boundary. Encoded as frontmatter `depends_on`.

- **`library`** — the **store connection seam** (`event-sourced-store-seam`): PgBackend builds
  `createPool()` → `PgLibraryStore` and renders stored docs via `renderStoredDoc`
  (`server/libraryBackend.ts:318-330`); browser code imports the schema surface
  (`@storytree/core/knowledge` / `knowledge-render` / `sources` — `src/lib/knowledgeFields.ts`,
  `src/components/AssetView.tsx`). Consumed, not absorbed. (`PgCommentStore` is NOT an edge —
  the comment substrate is this story's own declared interface.)
- **`drive-machinery`** — the **node-spec surface**: `/api/tree` loads `stories/` frontmatter
  via the orchestrator's `loadNodeSpec` (lazy-imported, `server/devApi.ts`), and the world's
  proof hues (plus the panel's verdict facts) read the gate's `events.verdict` stream
  (`server/libraryBackend.ts` latestVerdicts; hue-from-verdict per ADR-0040).
- **`notice-board`** — the **presence surface**: the world's session wisps read
  `PgPresenceStore.listActive()` and classify bands with `classifyPresence`
  (`server/libraryBackend.ts` activeSessions; ADR-0033 — advisory, silently absent offline).

Brought into the fold 2026-06-24 (ADR-0100) — the studio is a consuming **surface** the boundary scan
now walks (`check:boundaries` reads `apps/*` package.json deps), so these four seams it had ridden are
now declared + forest-rendered edges too, each read off real imports:

- **`forest-world`** — the **shared render core**: the `#/tree` world is `buildScene()`'d from the pure
  geometry kernel (`src/components/TreeView.tsx:110`, `src/components/SceneView.tsx:13`) — the studio and
  the public site draw the same look from one deterministic core (ADR-0093). Consumed as a package; the
  website consumes the synced artifact.
- **`art-factory`** — the **baked-art kit**: `src/lib/factoryBuildings.ts` imports the factory's
  build-time assets (`@storytree/procedural-architecture/kit.json` + `/stone.json`) and folds the baked
  buildings / hero garden set / stones onto the island (ADR-0221). This is a real package import
  (`apps/studio/package.json` `@storytree/procedural-architecture`), made a declared + forest-rendered
  cross-story edge by the ADR-0222 split that moved the package's ownership from `forest-world` to its
  own `art-factory` story.
- **`studio-members`** — the **access-control compute**: the server resolves member access with
  `resolveAccess` / `mergeUser` (`server/libraryBackend.ts:25`, `server/guestPolicy.ts:17`) — the
  member/user schema the Members panel renders from (ADR-0043).
- **`proof-protocol`** — the **verdict-shape port**: the server `.safeParse`s the published verdict DATA
  shapes across the seam (`server/libraryBackend.ts:26`, `server/apiRouter.ts:28`) — the browser-safe
  message format, never the proof machinery (ADR-0068 / ADR-0078).
- **`drive-machinery`** (the **build + secrets seam**, re-pointed off `cli` by ADR-0112) — the
  db-control / build surfaces lazy-import `@storytree/drive/build` and `@storytree/drive/secrets`
  (`server/devApi.ts`) — the build/orchestrate runtime the studio rides for orchestration plumbing.
  This is a SECOND seam onto `drive-machinery` (the node-spec + verdict-stream bullet above is the
  first), not a new story edge: before ADR-0112 the drivers lived in `packages/cli` and the studio
  declared a `cli` edge to reach them; the move carved them into `@storytree/drive` (owned by
  `drive-machinery`), so the studio now imports the narrower package and dropped its `@storytree/cli`
  dependency. The `cli` edge is gone from `depends_on`.

**The `chat-panel` capability adds NO new cross-story edge (recorded — the wire-shape-only call).** The
new [`chat-panel`](chat-panel.md) capability (the renderer chat panel) CONSUMES the `/api/chat` SSE wire
shape (`chat-sse-mount`'s `done`/`error`/`refused` `data:` frames), but consuming a wire shape over HTTP
is neither a package import nor a `depends_on` edge: the frames are plain JSON the panel parses against a
LOCALLY-declared discriminated union, and `@storytree/drive` (where the `ChatStreamEvent` type lives) is
on the `apps/studio/src` model-path FORBIDDEN list (`modelPathBoundary.test.ts`, ADR-0004 / ADR-0090 d.2)
— so the panel must NOT import it. The panel's single backend seam is the studio's own `api` client (the
`BuildSection` precedent), and it adds no `@storytree/*` runtime import the boundary scan (ADR-0100) would
require a declared edge for. The cross-boundary CONTRACT is the wire shape itself, owned by `desktop`'s
[`chat-sse-mount`](../desktop/chat-sse-mount.md); the panel is its consumer across the HTTP seam, enforced
by both sides authoring to the same frame, not by a code edge. So `studio`'s `depends_on` is unchanged by
this capability. (Full reasoning: chat-panel.md "No new cross-story edge".)

## UAT Test Criteria

The integrated **acceptance walkthrough** proves the whole `studio` organism end-to-end against the
real running app in Chromium (ADR-0010 §2). It is one coherent deterministic journey over the current
product: forest → Library lens → document → review → Library artifact → author/edit/delete → cold
restart → byte-identical cleanup. `pnpm --filter studio uat` owns the server/browser lifecycle and pins
the cross-story live-store seam to the permitted offline JSON backend; every in-story collaborator is
real. Under ADR-0106 every criterion below is therefore `witness: machine`, bound to the exact
command-bearing `studio#gate-1`.

**Goal —** One scripted operator reviews the project record through the current studio: opens the
Library from the forest, reads a rendered ADR, anchors and resolves a verified-attribution comment,
browses a knowledge-derived artifact and follows its source back to the corpus, authors a structured
artifact, proves durability across a cold process, and restores both offline stores byte-for-byte.

1. **Boot the current offline studio on the forest.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Let the UAT-managed Vite process start with `STORYTREE_STUDIO_STORE=json`, then open `/`. **Success —** the `/api/*` backbone answers, the app lands on the forest map, and the offline-store status is visible; no retired Overview page or pre-fold sidebar is required. _(criterion-id: uatc_b5d90e0780e17d4a53e11260)_ _(revision-id: uatr1:c160d418fa617c2d)_
2. **Open an ADR through the forest's Library-and-document chrome.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ From the forest, expand the persistent Library drawer, find ADR-0002 in the Library lens, and open it in the full-detail document overlay. **Success —** the real `docs/` markdown renders with its heading and slugged sections while the only global HUD chrome remains the verified-identity account avatar; no retired brand chip or avatar-menu Documents shortcut is used. _(criterion-id: uatc_eeaf4e098276044a6cc7e0c8)_ _(revision-id: uatr1:97f0d87c97b486db)_
3. **Follow an in-corpus cross-link.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ From a rendered document that cites ADR-0002, follow the source link and then return. **Success —** `resolveDocHref` produces the internal document target, the sibling markdown renders from disk in the document surface, and returning restores the prior document context. _(criterion-id: uatc_7b1437b0d3e80ded20966d08)_ _(revision-id: uatr1:a7b8af0550d269df)_
4. **Anchor a comment with verified attribution.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Open the document's review affordance, target the declared prose span/block, and post the probe comment. **Success —** the review surface shows the anchored comment and the offline comment record carries the resolved `/api/me` identity (or the conventional `operator` fallback in open offline dev); there is no editable operator-identity input and the server, not the request body, stamps attribution. _(criterion-id: uatc_7c6ecbc6de6af9f9a059e508)_ _(revision-id: uatr1:699eff46ec71c0a4)_
5. **Reload and recover the anchored comment.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Reload and reopen the same document through the Library lens. **Success —** the comment is re-fetched and rendered at the same declared target, proving the anchor survived a fresh browser render and the real offline-store read-back. _(criterion-id: uatc_30ad1e76fb65b01061a00868)_ _(revision-id: uatr1:a7517685d52f683d)_
6. **Resolve the comment across its surfaces.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Resolve the probe comment. **Success —** the thread and all current comment-status surfaces update without a manual reload, and `comments.json` records `resolved: true` with a non-null `resolvedAt`. _(criterion-id: uatc_a0ac6978b43fc0eae856fcb1)_ _(revision-id: uatr1:032f9c241753afa2)_
7. **Browse the knowledge-derived Library.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Return to the forest Library lens and inspect its lifecycle/category surface. **Success —** categories are non-empty and their live counts equal what the offline derivation seam yields — `deriveOfflineAssets(loadFixtureSeedUnits())`: the library's committed FIXTURE corpus (`@storytree/library/fixture`) rendered, plus `@storytree/library` templates — as served through the seeded `assets.runtime.json`. The expected counts are read from that seam and never pinned, because the fixture is a small offline sandbox seed that drifts from the live Library by design (ADR-0302 D1); this proves the derivation is wired, not that the offline Library mirrors the corpus, and no retired hard-coded 88-record `assets.json` corpus is assumed. _(criterion-id: uatc_bc8b96d7284d1fb608628c07)_ _(revision-id: uatr1:13e190a12c573291)_ _(previous-revision-id: uatr1:155c01cbc82e6de9)_
8. **Narrow the Library deterministically.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Choose the declared lifecycle/category scope and search for `deep`. **Success —** the Library finder narrows to the matching current-corpus items using its real searchable fields, while the forest remains the underlying surface. _(criterion-id: uatc_087ce84cb1d97ca9a44d1449)_ _(revision-id: uatr1:35b81f8288075971)_
9. **Follow an artifact source back to the corpus.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Open `deep-modules` in the Library's full-detail overlay and follow its ADR-0002 source. **Success —** the artifact's derived body and Sources render, then the cited ADR opens as real document markdown — the Library→corpus seam works through the current overlay. _(criterion-id: uatc_7400d218244cc813266ec95d)_ _(revision-id: uatr1:019c6b1cb8110ebe)_
10. **Author a structured Library artifact.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Open the new-artifact editor, let the title slug the id, keep the `pattern` kind, fill its required structured fields, verify the derived live preview, and create it. **Success —** `POST /api/assets` returns 201, the detail renders with `createdAt === updatedAt`, and the probe record exists in `assets.runtime.json` with its structured fields. _(criterion-id: uatc_b79eb0edf3c8bcde0184737c)_ _(revision-id: uatr1:2067be7645c2fec6)_
11. **Edit, relock, and delete the artifact.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Edit the probe through its structured fields, save, then delete it through the UI. **Success —** the id stays locked, `createdAt` is preserved, `updatedAt` advances, the edited field persists, and deletion removes the probe from `assets.runtime.json` before returning to the forest Library. _(criterion-id: uatc_de3fbde6018e06eaf8898b2f)_ _(revision-id: uatr1:f5a06e3375a73207)_
12. **Survive a cold process restart.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Start a second fresh Vite process over the same offline stores, reopen the reviewed document through the current forest/Library path, and inspect the deleted artifact id. **Success —** the resolved comment is reconstructed from storage and the deleted artifact remains absent, proving durability without relying on the first process's memory. _(criterion-id: uatc_2fbd323c9f6adfe167fdcbe5)_ _(revision-id: uatr1:484b9cf2571d7541)_
13. **Restore both offline stores byte-for-byte.** _(witness: machine)_ _(proof-gate: studio#gate-1)_ Delete the probe comment through the UI and compare the stores with their snapshots from before the journey. **Success —** both `comments.json` and the knowledge-derived `assets.runtime.json` are byte-identical to their baselines; the UAT leaves no persistent residue. _(criterion-id: uatc_cfeb76b5de7e939b62a81dca)_ _(revision-id: uatr1:9dc90d354cedb62c)_

## Reliability Gates

1. **The current Studio story UAT passes** _(gate: observe)_ `pnpm --filter studio uat`. This exact
   command is the machine proof obligation for `studio#uat-1` through `studio#uat-13`. It boots the real
   dev server against the offline JSON seam, drives the real browser journey, and owns snapshot/restore
   cleanup. No capability-coverage annotation is claimed. If the command is stale or red, observe-and-sign
   produces no green verdict: the uncovered machine work defers to Build under ADR-0106/ADR-0098.

## Proof

The integrated acceptance walkthrough lives at the story tier (ADR-0010 §2). All 13 real criteria are
machine-witnessed through the same exact `studio#gate-1` command, so no human attestation is required
and no leg may be signed from prose or from the separate vitest suite. The story proves only when
`pnpm --filter studio uat` passes at a clean HEAD and the spine signs the gate-backed UAT verdicts,
with the capabilities' own integration-test/contract obligations healthy underneath.

**Honest status — `proposed`.** The Playwright file exists, but existence is not green. Its current run
may expose stale selectors or product/storage drift; any failing command is the red evidence that routes
the machine legs to Build, not a warning to ignore and never a signed pass. A passing local run likewise
does not self-author `healthy`: the prove-it ceremony must observe and sign it. The command uses the
offline JSON seam allowed by ADR-0010 §5, real in-story collaborators, a second cold server for restart
durability, and snapshot/restore cleanup; Chromium may require the one-time
`pnpm --filter studio exec playwright install chromium`.
