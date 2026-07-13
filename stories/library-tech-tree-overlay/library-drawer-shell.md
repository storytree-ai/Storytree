---
id: "library-drawer-shell"
tier: capability
story: library-tech-tree-overlay
title: "The `?overlay=library` invocation gate — a pure `readLibraryOverlay` flag reader that gates the Library overlay's presence (its closed→peek→dive state machine RETIRED into the permanent lens by ADR-0187 dec 1)"
outcome: "The Library overlay's presence is gated behind `?overlay=library` by a pure `readLibraryOverlay(search)` reader (the `?overlay` value `=== 'library'`), and absent the flag nothing renders — machine-witnessed. Its original closed↔peek↔dive state machine (ADR-0185 dec 1) was RETIRED by ADR-0187 dec 1 (the permanent lens): the reworked geometry is proven by the sibling `library-permanent-lens`; this cap keeps only the SURVIVING pure flag-reader + absent-renders-nothing invariant, its appearance operator-attested at the story's UAT leg 1."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [187, 185, 70, 171, 23]
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

> **RECONCILED for ADR-0187 dec 1 (increment 8, executing settled dec 1 — NOT a re-decision).** The overlay
> became a PERMANENT LENS (ADR-0187 dec 1): the `closed→peek→dive` state machine, the `×` `Close library`
> button, and the `Dive` button are RETIRED. The reworked geometry (the permanent lens, the renamed body slot,
> the bottom selection-preview `Open` section) is authored and proven in the sibling capability
> [`library-permanent-lens`](library-permanent-lens.md) (the M1 rework of `LibraryDrawer.tsx`, real.testFile
> `LibraryPermanentLens.test.tsx`). **This capability keeps only the SURVIVING invariant** — the pure
> `readLibraryOverlay` flag reader (still the invocation gate) and the absent-flag-renders-nothing posture — in
> its now-TRIMMED real.testFile `LibraryDrawer.test.tsx` (the state-machine `it()` blocks retired; the pure
> `ldw-*` reader + `ldw-closed-without-flag` kept). The prose below (the three-state model, the dive slot, the
> Esc-unwind ladder) describes the RETIRED inc-1 shell and is kept as history — the LIVE surviving contracts
> are the 5 in the **Contracts** section below. No ADR, no owner fork — this is executing settled dec 1.

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

## Contracts (5 → 4 surviving; ADR-0187 dec 1 then ADR-0191 inc-12 reconciliation)

The SURVIVING test-proven leaf behaviours after the permanent-lens rework (increment 8) and the top-drawer
rework (increment 12) — each **one isolated automated test** in the `studio` suite (vitest jsdom, the now-TRIMMED
`apps/studio/src/components/LibraryDrawer.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id is
the lead of a distinctly-named test; after the inc-12 reconciliation the coverage check reports **4/4**. These
are the pure `readLibraryOverlay` flag reader (still the invocation gate ADR-0187 dec 1 preserves) — the ONLY
behaviours of the original shell that survive the retirement of the closed→peek→dive state machine AND the
ADR-0191 retirement of "absent renders nothing". The reworked geometry (the permanent lens, the body slot) is
proven by [`library-permanent-lens`](library-permanent-lens.md); the URL-derived collapsed/expanded state and the
default top drawer handle are proven by [`library-top-drawer`](library-top-drawer.md) in
`LibraryTopDrawer.test.tsx`. None of these is an APPEARANCE assertion — the look is the story's operator-attested
UAT leg 1 (ADR-0070).

> **RETIRED** (now-false, deleted from `LibraryDrawer.test.tsx` — they asserted the retired ×/Dive/mode
> machine): `lds-flag-opens-drawer-to-peek` (re-homed as `lpl-flag-gates-permanent-lens`),
> `lds-peek-overlays-live-map` (re-homed as `lpl-permanent-lens-over-live-map`),
> `lds-esc-and-toggle-close-from-peek`, `lds-dive-collapses-to-bar-and-reserves-body`,
> `lds-esc-unwinds-dive-to-peek`, `ldw-peek-reserves-an-empty-slot` (re-homed as
> `lpl-body-slot-renders-content`), `ldw-esc-unwinds-peek-to-closed`, `ldw-close-toggle-clears-overlay-flag`.

> **RETIRED at increment 12 (ADR-0191 — executing a settled decision, NOT a re-decision; amends ADR-0188 dec
> 1/6).** Contract 5 below, `ldw-closed-without-flag` ("absent the flag, the shell renders nothing"), is now
> FALSE: ADR-0191 makes the lens state URL-derived and defaults it to a persistent collapsed top drawer handle,
> so absent the flag the drawer renders the COLLAPSED HANDLE (not nothing). Its behaviour is **re-homed** into
> [`library-top-drawer`](library-top-drawer.md)'s `ltd-collapsed-handle-by-default` (absent → the collapsed
> handle). The orchestrator has trimmed the `ldw-closed-without-flag` block from `LibraryDrawer.test.tsx` as the
> mechanical glue of inc 12. The **4 surviving** contracts — `ldw-reads-overlay-flag-present`,
> `ldw-reads-overlay-flag-present-with-other-params`, `ldw-reads-overlay-flag-absent`,
> `ldw-reads-overlay-flag-other-value` (all the pure `readLibraryOverlay` reader, source-independent) — stay
> verbatim and are `coverage 4/4` against the further-trimmed `real.testFile`. Contract 5 is retained below as
> struck history; do not re-add it.

1. **`ldw-reads-overlay-flag-present`** — `?overlay=library` reads true
   - **asserts —** the pure `readLibraryOverlay('?overlay=library')` returns `true` — the invocation gate
     ADR-0187 dec 1 preserves. Pure, no jsdom.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the `readLibraryOverlay` reader — the surviving invocation gate)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx` (trimmed, vitest).
2. **`ldw-reads-overlay-flag-present-with-other-params`** — true regardless of param order/company
   - **asserts —** `readLibraryOverlay('?foo=bar&overlay=library')` returns `true` — the gate reads the
     `overlay` param regardless of the other params' presence/order. Pure.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the `readLibraryOverlay` reader over a multi-param search)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx`.
3. **`ldw-reads-overlay-flag-absent`** — no search string reads false
   - **asserts —** `readLibraryOverlay('')` returns `false` — absent the flag, the gate is closed. Pure.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the `readLibraryOverlay` reader — absent flag)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx`.
4. **`ldw-reads-overlay-flag-other-value`** — an unrelated/wrong value reads false
   - **asserts —** `readLibraryOverlay('?overlay=other')` returns `false` — only the exact value `'library'`
     opens the gate. Pure.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the `readLibraryOverlay` reader — wrong value)
   - **proven by —** `apps/studio/src/components/LibraryDrawer.test.tsx`.
5. **`ldw-closed-without-flag`** — *(RETIRED at inc 12, ADR-0191 — "absent renders nothing" is now false: absent renders the collapsed top drawer handle; re-homed to `library-top-drawer`'s `ltd-collapsed-handle-by-default`; struck history, not a live contract)* — absent the flag, the shell renders nothing (the bare map)
   - **asserts —** rendering `<LibraryDrawer search="" … />` renders nothing (no `library-drawer` testid) —
     absent the flag, the overlay is not present (the surviving absent-flag-renders-nothing posture, which the
     permanent lens keeps).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the absent-flag → renders-nothing branch)
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
