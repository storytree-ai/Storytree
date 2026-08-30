---
id: "library-open-overlay"
tier: capability
story: library-tech-tree-overlay
title: "The Open document overlay — a separate full-detail artifact view over the map, reusing the byte-locked LibraryDiveBody router, dismissable back to the lens"
outcome: "Opening an artifact mounts a SEPARATE full-detail document overlay OVER the map (ADR-0187 dec 2, 'like opening a Word doc') as its OWN container, rendering the artifact's full detail by REUSING the landed `<LibraryDiveBody selection={selection} />` router verbatim inside it; a null selection renders nothing (the overlay is closed/unmounted); and a dismiss control invokes an `onDismiss` callback — the overlay is transient (close the doc, back to the lens/map), unlike the permanent lens. Its mount-over-map, its null-renders-nothing, and its dismiss-fires-onDismiss behaviour are machine-witnessed; its 'Word doc over the map' appearance is operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-dive-body]
decisions: [187, 185, 70, 23]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest jsdom
# component test importing a NOT-YET-EXISTING component (LibraryOpenOverlay.tsx) under apps/studio/src/components
# (red = module-not-found at HEAD), then writes it (green). The component is a THIN CONTAINER that REUSES the
# byte-locked `LibraryDiveBody` router verbatim inside it — do NOT re-author body rendering, do NOT edit
# LibraryDiveBody.tsx / diveBody.ts (`ldb-*` stays byte-green).
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the CONTAINER GEOMETRY/BEHAVIOUR ONLY — a
# non-null `selection: SearchResult` mounts the overlay container (a distinct testid) with the reused
# `LibraryDiveBody` (the `library-dive-body` testid) nested inside it; a null selection renders nothing; a
# dismiss control fires `onDismiss`. The overlay's APPEARANCE (does it read as a full-detail document "like
# opening a Word doc" OVER the live map; the reading-pane legibility; the forest-cozy palette) and its real
# MOUNTING into TreeView (`<LibraryOpenOverlay selection={openSelection} onDismiss={…} />` as a `.world-frame`
# sibling) are the story's operator-attested UAT leg (the look is witnessed, never a machine visual verdict;
# do NOT add a visual/colour/pixel/animation assertion here, and do NOT edit TreeView.tsx or LibraryDiveBody.tsx
# in this `real:` scope — the overlay is proven in isolation, driven by `selection`/`onDismiss` props; the
# TreeView mount is the orchestrator's supplement glue after PASS — plan §G).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `loo-`-named contract test lives
# in LibraryOpenOverlay.test.tsx. Its TITLE must carry the unique `loo-` id or coverage silently drops
# coverage (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is TEST-TITLE-ONLY).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryOpenOverlay.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryOpenOverlay.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/LibraryOpenOverlay.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/LibraryOpenOverlay.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — run the ONE test file under vitest.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/LibraryOpenOverlay.test.tsx"
---

# The Open document overlay — a separate full-detail view over the map, reusing LibraryDiveBody

**Outcome —** Opening an artifact mounts a SEPARATE full-detail document overlay OVER the map (ADR-0187 dec 2,
"like opening a Word doc") as its OWN container, rendering the artifact's full detail by REUSING the landed
`<LibraryDiveBody selection={selection} />` router verbatim inside it. A null selection renders nothing (the
overlay is closed/unmounted). A dismiss control invokes an `onDismiss` callback — the overlay is TRANSIENT
("close the doc, back to the lens/map"), UNLIKE the permanent lens. Its mount-over-map, its
null-renders-nothing, and its dismiss-fires-`onDismiss` behaviour are machine-witnessed; its "Word doc over the
map" appearance is operator-attested.

**Depends on —** [`library-dive-body`](library-dive-body.md). The overlay REUSES the landed inc-4 body router
verbatim: it mounts `<LibraryDiveBody selection={selection} />` (the `planDive` router → AssetView / DocView)
inside its own container, so it needs the dive body's delivered outcome (the reusable full-detail router) as
its precondition. That is a genuine within-story code edge — this cap imports `LibraryDiveBody` — so
`depends_on: [library-dive-body]`. It holds no backend seam of its own (the reused body router owns the
on-demand `api.docContent` fetch inside `DocView`, already proven at inc-4), so the overlay takes only
`selection` + `onDismiss` as props and is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, NET-NEW.** `apps/studio/src/components/LibraryOpenOverlay.tsx` does NOT
> exist at HEAD (verified 2026-07-12), nor does its test file. This capability authors it test-first: a new
> vitest jsdom test drives the overlay container's mount-over-map (reusing `LibraryDiveBody`),
> null-renders-nothing, and dismiss-fires-`onDismiss` behaviour, RED at HEAD (module-not-found), GREEN once the
> component is written. Its CONTAINER GEOMETRY/BEHAVIOUR is machine-witnessed; its APPEARANCE (the full-detail
> document "like opening a Word doc" over the live map, the reading-pane legibility, the forest-cozy palette)
> and its real MOUNTING into `TreeView.tsx` are the story's operator-attested UAT leg (ADR-0070). Status stays
> `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the OPEN OVERLAY CONTAINER AS A WHOLE — a
behavioural React component that mounts a distinct full-detail overlay container over the map for a non-null
selection (reusing the landed `LibraryDiveBody` router inside it), renders nothing for a null selection, and
dismisses via an `onDismiss` callback — spanning the mount-over-map container, the reuse-of-`LibraryDiveBody`,
the null-unmount, and the transient dismiss, exercised in jsdom. It is the separate reading surface ADR-0187
dec 2 introduces (replacing the inline dive slot); the double-click / Open-button triggers that OPEN it are
`library-open-trigger` / `library-permanent-lens`'s jobs, and the TreeView mount is the glue's.

REUSE `LibraryDiveBody` VERBATIM — the CONTAINER is the change, NOT the body rendering (ADR-0187 dec 2). The
overlay is a THIN container that nests the byte-locked `<LibraryDiveBody selection={selection} />` verbatim —
`LibraryDiveBody` already routes a `SearchResult | null` via `planDive` to `AssetView` (asset body,
no fetch) or `DocView` (ADR body via its own on-demand `api.docContent`), with the empty/prompt state and the
fetch-error guard already proven at inc-4 (`ldb-*`). Do NOT re-author body rendering, do NOT reimplement the
router, and do NOT edit `LibraryDiveBody.tsx` / `diveBody.ts` — `ldb-*` stays byte-green. The change ADR-0187
dec 2 makes is the CONTAINER (a separate overlay over the map) and the TRIGGER (`library-open-trigger`), not
the body. Pin the reuse in `loo-open-overlay-mounts-full-detail-over-map` (the `library-dive-body` testid is
nested inside the `library-open-overlay` container).

THE CONTAINER IS THE OVERLAY OVER THE MAP. Given a non-null `selection: SearchResult` prop, the component
mounts as its OWN container with a distinct testid (e.g. `library-open-overlay`) that renders the artifact's
full detail by nesting `<LibraryDiveBody selection={selection} />` inside it — a separate document overlay OVER
the map (the map stays beneath; the permanent lens is a sibling surface). Assert the reused router (the
`library-dive-body` testid) is nested INSIDE the `library-open-overlay` container. Take `selection` as a prop
so the container proves in isolation (wrap in the AppData provider the reused AssetView/DocView read, exactly
as `LibraryDiveBody.test.tsx` does).

NULL SELECTION RENDERS NOTHING (the closed overlay). With `selection === null` the overlay renders nothing —
it is closed/unmounted (no container, no `LibraryDiveBody`). This is the overlay's closed state: it exists only
while an artifact is open. Pin it in `loo-null-selection-renders-nothing`. (Contrast the permanent lens, which
is always present behind the flag — the Open overlay is present only for an open selection.)

THE OVERLAY IS TRANSIENT — A DISMISS FIRES `onDismiss` (UNLIKE the permanent lens). The Open overlay is
transient: "close the doc, back to the lens/map". A dismiss/back/close control invokes an `onDismiss` callback
prop; the glue clears the open selection (`setOpenSelection(null)`, plan §G), which unmounts the overlay. This
is the DELIBERATE contrast with the permanent lens (dec 1) — the lens has NO in-panel close, but the Open
overlay DOES, because it is a transient document view, not the permanent lens. Prove the dismiss fires
`onDismiss`. **Esc-to-dismiss is an acceptable equivalent** — story-author's call: assert a dismiss/back
BUTTON firing `onDismiss` (the primary affordance) OR Esc-to-dismiss (proven in jsdom via a `keydown`),
whichever the leaf implements; the CONTRACT is that a dismiss affordance fires `onDismiss`. Pin it in
`loo-dismiss-fires-ondismiss`.

NO NEW FETCH OF ITS OWN (the data boundary). The overlay adds NO data seam — the body's on-demand
`api.docContent` lives INSIDE `DocView` (already proven at inc-4). The overlay reads only its `selection` prop
and reuses `LibraryDiveBody`; it makes no fetch/socket/DB call of its own. Keep the container a pure wrapper.

REUSE THE EXISTING `SearchResult` — DEFINE NO NEW TYPE (the inc-7 fence). The `selection` prop uses the
EXISTING `SearchResult` type imported from `../lib/librarySearch` (the same shape `LibraryDiveBody` already
takes). Do NOT define a new type and do NOT touch `apps/studio/src/lib/types.ts` or `apps/studio/server/**` —
that is the inc-7 / inc-6 lane, file-disjoint (plan §Lanes FENCE).

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0185 dec 5 + ADR-0187 + ADR-0070). The overlay follows the
map's forest-cozy palette (as the shell/finder/subgraph/dive/overview/lens do), NOT neutral-admin white and
NEVER the black-terminal look. The "like opening a Word doc" full-detail document over the live map, the
reading-pane legibility, and the palette are WITNESSED by the owner (UAT leg), never a machine visual verdict —
do NOT author a visual/colour/pixel/animation assertion in this cap's tests (assert the container mount, the
reused `library-dive-body` nesting, the null-unmount, and the dismiss→`onDismiss` wiring, never their styling).
Witness the look at `?overlay=library#/tree`.

OFFLINE-TESTABLE IN JSDOM (the `LibraryDiveBody.test.tsx` discipline). `@vitest-environment jsdom`,
`@testing-library/react` for render / `fireEvent` (click the dismiss control, or fire Esc). Wrap
`<LibraryOpenOverlay>` in the AppData provider (the reused AssetView/DocView read `useAppData()`); stub
`api.docContent` if a doc-selection fixture is exercised (the fetch is DocView's, already covered at inc-4 — the
overlay's own contracts need not re-prove the fetch). No real `fetch` beyond the stubbed `docContent`, no
socket, no DB, no Electron. The component imports no agent/drive/model (the `modelPathBoundary.test.ts` wall
stays green).

## Integration test

**Goal —** Prove the Open document overlay container: a non-null `selection: SearchResult` mounts the overlay
as its own container (a distinct testid) with the reused `<LibraryDiveBody selection={selection} />` (the
`library-dive-body` testid) nested inside it; a null selection renders nothing; and a dismiss control invokes
`onDismiss` — entirely in jsdom, driven by props.

The integration test exercises this capability against its own composition — the overlay container, the reuse
of the real `LibraryDiveBody` router, the null-unmount, and the transient dismiss are all real (only
`api.docContent` inside DocView is stubbed if a doc fixture is used). It would:

1. Render `<LibraryOpenOverlay selection={assetResult} onDismiss={spy} />` in jsdom, wrapped in the AppData
   provider. Assert the overlay mounts as its own container (the `library-open-overlay` testid is present) and
   the reused router (the `library-dive-body` testid) is nested INSIDE that container.
2. Render `<LibraryOpenOverlay selection={null} onDismiss={spy} />`. Assert the overlay renders nothing (no
   `library-open-overlay` container, no `library-dive-body`).
3. Render `<LibraryOpenOverlay selection={assetResult} onDismiss={spy} />` and fire the dismiss control (a
   dismiss/back button, or Esc). Assert `onDismiss` is invoked (the glue clears the open selection to unmount
   the overlay).

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryOpenOverlay.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id
is the lead of a distinctly-named test, so the coverage check reports 3/3 against the ONE `real.testFile`. None
of these is an APPEARANCE assertion — the look (the full-detail "Word doc" over the map, the reading-pane
legibility, the forest-cozy palette) is the story's operator-attested UAT leg (ADR-0070).

1. **`loo-open-overlay-mounts-full-detail-over-map`** — a non-null selection mounts the overlay container reusing LibraryDiveBody nested inside it
   - **asserts —** given a non-null `selection: SearchResult` prop the overlay mounts as its OWN container (a
     distinct testid, e.g. `library-open-overlay`) rendering the artifact's full detail by REUSING
     `<LibraryDiveBody selection={selection} />` — the reused router (the `library-dive-body` testid) is nested
     INSIDE the `library-open-overlay` container. Do NOT re-author body rendering — `LibraryDiveBody` is
     imported verbatim.
   - **covers —** `apps/studio/src/components/LibraryOpenOverlay.tsx` (the container mounting the reused `LibraryDiveBody`)
   - **proven by —** `apps/studio/src/components/LibraryOpenOverlay.test.tsx` (net-new, vitest jsdom).
2. **`loo-null-selection-renders-nothing`** — a null selection renders nothing (the overlay is closed/unmounted)
   - **asserts —** with `selection === null` the overlay renders nothing — no `library-open-overlay` container
     and no `library-dive-body` (the overlay exists only while an artifact is open). Contrast the permanent
     lens, which is always present behind the flag.
   - **covers —** `apps/studio/src/components/LibraryOpenOverlay.tsx` (the null → closed/unmounted branch)
   - **proven by —** `apps/studio/src/components/LibraryOpenOverlay.test.tsx`.
3. **`loo-dismiss-fires-ondismiss`** — a dismiss control invokes onDismiss (the overlay is transient, back to the lens/map)
   - **asserts —** firing the overlay's dismiss/back/close control invokes the `onDismiss` callback prop (the
     glue clears the open selection to unmount the overlay) — the overlay is TRANSIENT, unlike the permanent
     lens. Esc-to-dismiss is an acceptable equivalent affordance (proven in jsdom via a `keydown`); the
     contract is that a dismiss affordance fires `onDismiss`.
   - **covers —** `apps/studio/src/components/LibraryOpenOverlay.tsx` (the dismiss control → `onDismiss`)
   - **proven by —** `apps/studio/src/components/LibraryOpenOverlay.test.tsx`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the Open overlay container as a new thin
component that reuses the landed `LibraryDiveBody` router, test-first.

- **The new test —** `apps/studio/src/components/LibraryOpenOverlay.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryDiveBody.test.tsx` shape; NO
  real `fetch`/socket/DB/Electron beyond a stubbed `api.docContent` if a doc fixture is used). Import
  `{ LibraryOpenOverlay }` from `"./LibraryOpenOverlay"` and `import type { SearchResult } from
  "../lib/librarySearch"` for the `selection` fixture — define NO new type. Wrap the component in the AppData
  provider (the reused AssetView/DocView read `useAppData()`). Name each test for its contract id (`loo-…`) so
  `storytree coverage library-open-overlay` reports 3/3 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `apps/studio/src/components/LibraryOpenOverlay.tsx` does not exist at HEAD, so the test fails
  module-not-found (the net-new missing-symbol red, ADR-0057).
- **The GREEN —** write `apps/studio/src/components/LibraryOpenOverlay.tsx`: a thin container taking
  `{ selection: SearchResult | null; onDismiss: () => void }` as PROPS — when `selection` is non-null, render
  the overlay container (root `<div className="library-open-overlay" data-testid="library-open-overlay">` over
  the map) nesting `<LibraryDiveBody selection={selection} />` verbatim + a dismiss/back control wired to
  `onDismiss` (and/or an Esc keydown → `onDismiss`); when `selection` is null, render nothing. It holds no data
  of its own (the reused body router owns its `useAppData()` read + `DocView`'s on-demand fetch). MOUNTING it
  into `TreeView.tsx` (`<LibraryOpenOverlay selection={openSelection} onDismiss={() => setOpenSelection(null)} />`
  as a `.world-frame` sibling) and the forest-cozy appearance are witnessed under the story's UAT leg
  (operator-attested, ADR-0070), NOT asserted in CI and NOT in this `real:` scope. After it, the import
  resolves, the assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Reuse `LibraryDiveBody` verbatim, do NOT re-author the body** — the overlay is a container around the
  landed router; import `LibraryDiveBody` and nest it; do NOT edit `LibraryDiveBody.tsx` / `diveBody.ts`
  (`ldb-*` stays byte-green) (`loo-open-overlay-mounts-full-detail-over-map`).
- **Null selection renders nothing** — the overlay exists only while an artifact is open
  (`loo-null-selection-renders-nothing`).
- **The overlay is transient — a dismiss fires `onDismiss`** — unlike the permanent lens, the Open overlay has
  a dismiss/back control (or Esc) that fires `onDismiss` (`loo-dismiss-fires-ondismiss`).
- **No new fetch of its own** — the on-demand `api.docContent` lives inside `DocView` (inc-4); the overlay
  adds no data seam.
- **Reuse the existing `SearchResult`, touch no `types.ts`/`server`** (inc-7 fence) — the `selection` prop uses
  `SearchResult` from `../lib/librarySearch`; define no new type.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the container mount, the reused
  `library-dive-body` nesting, the null-unmount, and the dismiss→`onDismiss` wiring; the "Word doc over the
  map" look is the story's UAT leg. Do NOT author a visual verdict, and do NOT edit `TreeView.tsx` in the
  `real:` scope (the mount is the orchestrator's supplement glue after PASS — plan §G).
- **Every `loo-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is TEST-TITLE-ONLY, never an
  assertion/source edit).
