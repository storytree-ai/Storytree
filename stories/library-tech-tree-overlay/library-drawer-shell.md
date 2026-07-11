---
id: "library-drawer-shell"
tier: capability
story: library-tech-tree-overlay
title: "A slide-down Library drawer overlay behind ?overlay=library with a peek↔dive↔closed state machine"
outcome: "A slide-down Library drawer overlays the live forest map behind ?overlay=library and walks a peek↔dive↔closed state machine — its geometry and behaviour machine-witnessed, its appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [185, 70, 171, 23]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component from a NEW source file under
# apps/studio/src/components (red = module-not-found at HEAD), then writes that one component (green).
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY — the flag
# opens the drawer to peek; the map stays live beneath (no dimming); Esc/toggle close from peek; a dive
# collapses the drawer to a bar and reserves an EMPTY body-panel region; Esc unwinds dive→peek→closed.
# The drawer's APPEARANCE (does it read as a forest-cozy lens over the world; the slide animation; the
# z-layering against the map chrome) and its real MOUNTING into TreeView.tsx's `.world-frame` are the
# story's operator-attested UAT leg 1 (the look is witnessed, never a machine visual verdict; do NOT add
# a visual assertion here, and do NOT edit TreeView.tsx in this `real:` scope — the component is proven
# in isolation, the placement is attested).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src
# (a studio frontend component).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryDrawer.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryDrawer.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/LibraryDrawer.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/LibraryDrawer.tsx"]
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
        - "src/components/LibraryDrawer.test.tsx"
---

# A slide-down Library drawer overlay behind ?overlay=library with a peek↔dive↔closed state machine

**Outcome —** A slide-down Library drawer overlays the live forest map behind `?overlay=library` and
walks a peek↔dive↔closed state machine — its geometry and behaviour machine-witnessed, its appearance
operator-attested.

**Depends on —** nothing (this is the story's root capability). The drawer shell is a self-contained
behavioural overlay whose open state is seeded from the `?overlay=library` query flag and whose mode
(closed / peek / dive) is the surface every later increment mounts into: the finder (increment 2) fills
the peek body, the dive body panel (increment 4) fills the region this shell reserves. It holds no
backend seam.

> **Proof status (honest) — `proposed`, NET-NEW two-stage.** `apps/studio/src/components/LibraryDrawer.tsx`
> does NOT exist at HEAD (verified 2026-07-11 — `ls` returns absent). This capability authors it
> test-first: a new vitest jsdom test drives the drawer's flag-open / peek / dive / close state machine,
> RED at HEAD (module-not-found), GREEN once the component is written. Its GEOMETRY/BEHAVIOUR is
> machine-witnessed; its APPEARANCE inside the real map (the forest-cozy look, the slide, the z-layering)
> and its real mounting into `TreeView.tsx`'s `.world-frame` are the story's operator-attested UAT leg 1
> (ADR-0070). Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020),
> never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the DRAWER SHELL AS A WHOLE — a behavioural
React component that reads the `?overlay=library` flag, holds a three-state mode (closed / peek / dive),
renders the slide-down overlay over the map, and walks the state machine (open to peek, Esc/toggle close,
dive collapses to a bar and reserves the body region, Esc unwinds dive→peek→closed) — spanning the flag
reader, the mode transitions, and the reserved-region stub, exercised in jsdom. It is the SHELL every
later increment mounts into; the finder / focus subgraph / dive body are those increments' jobs, gated on
this shell's mode.

THE QUERY-FLAG PRECEDENT (ADR-0185 / the worldSettings `?layout=` pattern). The drawer opens behind a
QUERY param (`?overlay=library`), read from the search string that precedes the `#hash` — NOT a new hash
route. This mirrors the map's existing dials: `readRenderScene(search)`
(`apps/studio/src/lib/worldSettings.ts:285`) and `readLayoutMode(search)`
(`apps/studio/src/components/TreeView.tsx:1044`) both read a `?…` param off the reactive `search` state
seeded from `window.location.search` (`TreeView.tsx:141,1264`). So DO NOT add a variant to the `Route`
union in `route.ts` — declare a pure `readLibraryOverlay(search: string): boolean` reader (the `?overlay`
value `=== 'library'`) that the drawer consumes, testable in isolation. The drawer takes `search` (and
the mode transitions) as inputs so the state machine is deterministically drivable in jsdom — the same
"take the search string as a param" discipline worldSettings uses to stay unit-testable.

THE THREE-STATE MODEL (ADR-0185 dec 1). **closed** — no drawer (the bare live map). **peek** — the drawer
is slid down over the map and the map stays FULLY LIVE beneath it (no dimming scrim; the operator can still
pan/zoom the world through the gap). **dive** — the drawer collapses to a bar and RESERVES the region where
the artifact body will mount (increment 4); this shell renders that region EMPTY (a placeholder, no artifact
content). The transitions: the flag opens closed→peek; a "dive" action goes peek→dive; Esc unwinds one level
(dive→peek, then peek→closed); the close toggle goes any-open→closed. Closing also CLEARS the `?overlay`
flag from the search (a `commitSearch`-style write, mirroring how the gear panel writes dials) so a reload
stays on the bare map — but in the isolated test the mode transitions are driven directly and the URL write
is observed through the `onCommitSearch`/`onClose` callback the drawer is handed, not a real navigation.

THE SHELL RESERVES, IT DOES NOT FILL (the seam to increments 2 & 4). The shell's job is the MODE STATE, the
overlay chrome, and the RESERVED regions — a peek body region (the finder mounts here, increment 2) and a
dive body region (the artifact body mounts here, increment 4). This capability renders those regions as
EMPTY, identifiable slots (a stable `data-testid` / role), and proves "peek shows the peek slot; dive shows
the collapsed bar + an empty dive slot". WHAT fills them is those increments' work. Do NOT build the finder,
the graph, or the body panel here (slow growth / minimum to green).

THE FOREST-COZY THEME IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0185 dec 5 + ADR-0070). The drawer follows the
map's forest-cozy palette (the world's CSS variables — `var(--board-1)`/`var(--board-2)`/`var(--border)`/
`var(--accent)`, as `.world-frame` uses at `index.css:1352`), NOT neutral-admin white, and NEVER the
black-terminal look (reserved for the session-orchestrator terminal, ADR-0174/0175). The overlay sits at
`z-index: 4` — above the side-panel/legend layer (z:3, `index.css:1707`), below the flyout (z:5,
`index.css:1869`), the stress-layout layer (z:6, `index.css:4109`), and the chat dock (z:20, `index.css:3287`).
That palette, the slide animation, and the z-layering are WITNESSED by the owner (UAT leg 1), never a machine
visual verdict — do NOT author a visual/appearance assertion in this cap's tests.

OFFLINE-TESTABLE IN JSDOM (the `ReviewToggle.test.tsx` / chat-panel discipline). `@vitest-environment jsdom`,
`@testing-library/react` for render / `fireEvent` (Esc keydown, toggle/dive clicks). No backend seam to mock
(the shell holds no `api` call) — the test renders `<LibraryDrawer search="?overlay=library" …/>`, asserts the
peek posture and the live-map (no-scrim) invariant, fires dive/Esc/close, and asserts the mode transitions and
the reserved slots. No real `fetch`, no socket, no DB, no Electron. The component imports no agent/drive/model
(the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the drawer shell: `?overlay=library` opens it to peek with the map live beneath (no
dimming); Esc and the close toggle return it to closed; a dive action collapses it to a bar and reserves
an EMPTY dive body region; Esc from dive unwinds to peek (one level), and a second Esc closes — entirely
in jsdom, no backend.

The integration test exercises this capability against its own composition (no backend seam) — the flag
reader, the mode state, the overlay chrome, and the reserved-region stubs are all real. It would:

1. Render `<LibraryDrawer search="?overlay=library" …/>` in jsdom. Assert the drawer is in **peek** — the
   drawer overlay is present, the peek body slot is rendered, and the map stays live beneath (NO dimming
   scrim element; the drawer does not cover/disable the world viewport). Then render with `search=""`
   (flag absent) and assert the drawer is **closed** (no overlay rendered).
2. Fire the close toggle. Assert the mode flips to **closed** (the overlay is gone) and the drawer's
   `onClose`/`onCommitSearch` callback is invoked to clear the `?overlay` flag — closing leaves the bare map.
3. Fire Esc from peek. Assert it also returns to **closed** (Esc is the keyboard close) — the drawer is a
   genuine two-way overlay, not one-way.
4. Fire the dive action from peek. Assert the mode flips to **dive** — the drawer collapses to a bar and a
   dive body region is reserved and rendered EMPTY (a stable slot with NO artifact content — that content
   is increment 4); the collapsed bar is present.
5. Fire Esc from dive. Assert it unwinds to **peek** (NOT straight to closed) — the peek body slot returns
   and the dive slot is gone; fire Esc again and assert it closes — proving the peek↔dive↔closed state
   machine unwinds one level per Esc.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryDrawer.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id
is the lead of a distinctly-named test, so the coverage check reports 5/5. None of these is an APPEARANCE
assertion — the look (forest-cozy palette, the slide, z-layering) is the story's operator-attested UAT
leg 1 (ADR-0070).

1. **`lds-flag-opens-drawer-to-peek`** — the `?overlay=library` flag opens the drawer to peek; absent → closed
   - **asserts —** with `search="?overlay=library"` the drawer renders in peek (the overlay + the peek body
     slot are present); with `search=""` (or `?overlay=` anything-else) the drawer renders closed (no
     overlay). The flag is read by a pure `readLibraryOverlay(search)` (value `=== 'library'`), NOT a new
     `Route` variant.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the `readLibraryOverlay` reader + the
     flag→peek open)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx` (net-new, vitest jsdom).
2. **`lds-peek-overlays-live-map`** — in peek the map stays live beneath (no dimming)
   - **asserts —** in peek the drawer renders NO full-screen dimming scrim over the map and does not cover
     the world viewport — the forest map is still visible/interactive beneath (observable via the absence
     of a `.drawer-scrim` element / a `data-map-live` marker on the drawer container). This is ADR-0185
     dec 1's "you only lose the map when you deliberately dive".
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the peek render — overlay without scrim)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx`.
3. **`lds-esc-and-toggle-close-from-peek`** — Esc and the close toggle both close from peek
   - **asserts —** firing the close toggle from peek flips the mode to closed (the overlay is gone) and
     invokes the drawer's close callback to clear the `?overlay` flag; firing Esc from peek likewise closes.
     The drawer is a genuine two-way overlay.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the close toggle + the Esc keydown handler
     + the flag-clear callback)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx`.
4. **`lds-dive-collapses-to-bar-and-reserves-body`** — a dive collapses the drawer to a bar and reserves an empty body region
   - **asserts —** firing the dive action from peek flips the mode to dive: the drawer collapses to a bar
     (the collapsed-bar element is present, the full peek body slot is gone) and a dive body region is
     reserved and rendered EMPTY — a stable slot holding NO artifact content (the body is increment 4).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the dive transition — collapsed bar +
     empty reserved region)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx`.
5. **`lds-esc-unwinds-dive-to-peek`** — Esc from dive unwinds one level to peek, then closes
   - **asserts —** firing Esc from dive returns the mode to peek (the peek body slot returns, the dive slot
     is gone) — NOT straight to closed; a second Esc from peek then closes the drawer. The peek↔dive↔closed
     state machine unwinds one level per Esc.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the Esc unwind ladder over the three-state mode)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the drawer shell as a new component,
test-first.

- **The new test —** `apps/studio/src/components/LibraryDrawer.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `ReviewToggle.test.tsx` /
  `ChatPanel.test.tsx` shape; NO real `fetch`/socket/DB/Electron). Import `{ LibraryDrawer }` (and, if
  extracted, `readLibraryOverlay`) from `"./LibraryDrawer"`. Name each test for its contract id (`lds-…`)
  so `storytree coverage library-drawer-shell` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `apps/studio/src/components/LibraryDrawer.tsx` does not exist at HEAD, so the test fails module-not-found
  (the net-new missing-symbol red, ADR-0057).
- **The GREEN —** write `apps/studio/src/components/LibraryDrawer.tsx`: a behavioural component that reads
  the `?overlay=library` flag via a pure `readLibraryOverlay(search)`, holds a three-state mode
  (closed / peek / dive), renders the slide-down overlay + the peek body slot + (in dive) the collapsed bar
  and an EMPTY reserved body region, and walks the state machine (flag→peek, dive, Esc-unwind, toggle-close,
  flag-clear on close). WIRING it into `TreeView.tsx`'s `.world-frame` (as a sibling of `WorldSettingsPanel`
  / `ChatDock`, `TreeView.tsx:2137-2141`) and the forest-cozy appearance are witnessed under the story's
  UAT leg 1 (operator-attested, ADR-0070), NOT asserted in CI and NOT in this `real:` scope. After it, the
  import resolves, the assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck`
  stay green.

Rules:

- **Query flag, not a hash route** — the drawer opens behind `?overlay=library` read by a pure
  `readLibraryOverlay(search)` (`lds-flag-opens-drawer-to-peek`), mirroring `readRenderScene` /
  `readLayoutMode`; do NOT add a `Route` variant to `route.ts`.
- **Map live in peek** — peek renders no dimming scrim; the map shows through
  (`lds-peek-overlays-live-map`, ADR-0185 dec 1). You only lose the map on a deliberate dive.
- **Shell reserves, does not fill** — the peek/dive body regions are empty slots
  (`lds-dive-collapses-to-bar-and-reserves-body`); the finder (inc 2) and the dive body (inc 4) fill them.
  Do not build them here (minimum to green).
- **Esc unwinds one level** — dive→peek→closed, one Esc per level (`lds-esc-unwinds-dive-to-peek`).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the flag/state machine/reserved
  slots; the forest-cozy look, the slide, and the z-layering are the story's UAT leg 1. Do not author a
  visual verdict, and do not edit `TreeView.tsx` in the `real:` scope (the mounting is attested, the
  component proven in isolation).
