---
id: "library-top-drawer"
tier: capability
story: library-tech-tree-overlay
title: "The permanent lens defaults to a SLIM, TITLE-LESS collapsed top drawer handle; lens state is URL-derived (?overlay=library present = expanded, absent = the collapsed handle); the terminal-dock ARROW chevron is the single open/close affordance (the Expand/Collapse WORD buttons retire) firing an onToggle seam the parent glue owns; the \"Library\" wordmark renders EXPANDED-ONLY; the expanded drawer gains a drag-resize separator (the terminal dock idiom); the ADR-0188 dec-6 component-local Minimise/Restore machine and the #715 corner toggle retire; the map stays live beneath with no scrim in either state; the pure readLibraryOverlay reader survives"
outcome: "The Library lens presents by default as a persistent SLIM, TITLE-LESS collapsed top drawer handle/tab (ADR-0191/0193): with `search=\"\"` the drawer renders collapsed — a stable `data-lens-state=\"collapsed\"` marker, a slim handle bar carrying the ARROW toggle but NO \"Library\" wordmark (the title belongs to the expanded state, ADR-0193 dec 2), the handed `bodySlot` NOT rendered, and NO dimming scrim. With `search=\"?overlay=library\"` the drawer renders EXPANDED — `data-lens-state=\"expanded\"`, the `bodySlot` content visible, the handle bar still present, the \"Library\" wordmark/title present, a drag-resize separator present, still no scrim. LENS STATE IS URL-DERIVED: clicking the handle's single ARROW toggle affordance (one chevron button with an accessible expand/collapse label, the terminal-dock idiom — the Expand/Collapse WORD buttons retire) fires an `onToggle` callback prop (the parent glue owns the URL write via `commitSearch`; the component NEVER mutates the URL/history itself) — re-rendering with a changed `search` flips collapsed→expanded→collapsed with the same handed `bodySlot` intact on re-expand. The EXPANDED drawer carries a drag-resize separator (`role=\"separator\"`) whose drag changes the drawer's inline height (the terminal dock idiom); the collapsed state renders no separator. The ADR-0188 dec-6 component-local Minimise/Restore state machine RETIRES (no \"Minimise\"/\"Restore\" controls in either state), and the #715 bottom-corner toggle it replaces is mooted. The pure exported `readLibraryOverlay(search)` reader survives as the sole gate. Its slim title-less collapsed-handle default, its flag-derived expand with the wordmark present, its arrow-toggle→onToggle seam, its URL-derived round-trip, its drag-resize separator, its no-scrim posture, and its surviving reader are machine-witnessed; the full-width / half-screen layout, the half-screen default proportion, and the handle silhouette are the story's operator-attested LOOK leg (ADR-0070)."
status: proposed
proof_mode: integration-test
depends_on: [library-permanent-lens]
decisions: [193, 191, 188, 187, 185, 70, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true) — this REPLACES the inc-9
# `library-lens-minimise` capability on the SAME source (`apps/studio/src/components/LibraryDrawer.tsx`), the
# inc-10 cap-replacement precedent (library-dag-canvas replaced library-focus-subgraph on one source file). It
# executes settled ADR-0193 (born accepted, owner-directed 2026-07-13, amends ADR-0191 dec 1/3) on top of the
# already-executed ADR-0191 (which amended ADR-0188 dec 1/6) — NOT a re-decision. The lens state stays URL-derived
# (`?overlay=library` present = expanded, absent = a persistent COLLAPSED top drawer handle — "absent renders
# nothing" is RETIRED); ADR-0193 polishes the handle: the Expand/Collapse WORD buttons retire for a single
# terminal-dock ARROW chevron toggle, the collapsed handle is SLIM and TITLE-LESS (the "Library" wordmark renders
# EXPANDED-ONLY), and the expanded drawer gains a DRAG-RESIZE separator (the terminal dock idiom). The ADR-0188
# dec-6 component-local Minimise/Restore machine RETIRES; the handle is the single open/close affordance and fires
# a new `onToggle?: () => void` prop (the parent glue owns the URL write via `commitSearch`; the component never
# writes the URL itself). real.sourceFile = LibraryDrawer.tsx (single source; NO multi-sourceGlob).
# real.testFile = a NET-NEW LibraryTopDrawer.test.tsx that drives the slim title-less collapsed handle, the
# flag-derived expand with the wordmark present, the arrow-toggle→onToggle seam, the URL-derived round-trip, the
# drag-resize separator, the no-scrim posture, and the surviving reader, in jsdom.
# The RED the spine observes is a FAILING-ASSERTION red (LibraryDrawer.tsx exists — NOT module-not-found): at
# HEAD (the inc-9 lens as amended by ADR-0191) `search=""` renders the collapsed handle WITH the "Library"
# wordmark (the amended slim, title-less contract fails), the toggle is a WORD button reading "Expand"/"Collapse"
# (the arrow-toggle contract fails), there is NO drag-resize separator (the new resize contract fails), and the
# component-local Minimise/Restore machine may still be present — so the amended/new tests fail as a
# FAILING-ASSERTION red (NOT module-not-found).
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the BEHAVIOUR ONLY — the SLIM, TITLE-LESS
# collapsed handle by default (data-lens-state="collapsed", the ARROW toggle present, the "Library" wordmark
# ABSENT, the bodySlot NOT rendered, no scrim), the flag-derived expand (data-lens-state="expanded", the bodySlot
# visible, the handle still present, the "Library" wordmark PRESENT), the single ARROW toggle firing onToggle
# exactly once in BOTH states with the component NEVER touching the URL/history AND no "Expand"/"Collapse" word
# button, the URL-derived round-trip with the bodySlot intact on re-expand and the retired Minimise/Restore
# machine absent, the drag-resize separator present in the expanded state (a drag CHANGES the inline height) and
# absent in the collapsed state, the no-scrim posture in both states, and the surviving pure reader. The
# FULL-WIDTH / HALF-SCREEN layout, the half-screen DEFAULT proportion, and the arrow/handle silhouette / slide are
# the story's operator-attested UAT LOOK leg (ADR-0193 dec 1/2, ADR-0191 dec 3, ADR-0070) — do NOT author a
# visual/colour/pixel/animation/proportion assertion here (assert the separator's presence/absence and that a drag
# CHANGES the height, never a specific proportion/pixel value), and do NOT edit `TreeView.tsx` or `index.css` in
# this `real:` scope (the mount rewire + the full-width/half-screen look + removing the #715 `.world-library-dock`
# corner toggle are the orchestrator's supplement glue after PASS — plan §G).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this cap
# declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio). install: true
# (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `ltd-`-named contract test lives
# in LibraryTopDrawer.test.tsx. Its TITLE must LEAD with the unique `ltd-` id or coverage silently drops N-1/N
# past the signed green (`sdk-leaf-drops-contract-id-test-names` — this arc's 6th-occurrence class risk; the fix
# if it happens is TEST-TITLE-ONLY, never an assertion/source edit).
#
# RECONCILIATION (authored NOW by story-author, executing settled ADR-0191 — NOT a re-decision, the inc-10
# cap-replacement precedent): this cap REPLACES `library-lens-minimise` (DELETED). The inc-9 `lmin-*` contracts
# pinned the retired component-local Minimise/Restore machine; their still-true behaviours re-home into the
# `ltd-*` contracts (the handle bar + state-kept body → ltd-flag-renders-expanded / ltd-lens-state-is-url-derived;
# the flag gate → ltd-flag-renders-expanded / ltd-flag-reader-survives; the no-scrim posture →
# ltd-no-scrim-either-state; the inc-8 strip-absence assertion is SUBSUMED — the reworked lens renders no strip,
# and the lsel-open-button contract already carries the Open job). The inc-9 `lpl-flag-gates-permanent-lens`
# contract ("the flag alone gates presence — absent renders nothing") is RETIRED by ADR-0191 (absent now renders
# the collapsed handle); its flag semantics re-home into this cap's ltd-collapsed-handle-by-default +
# ltd-flag-renders-expanded + ltd-flag-reader-survives (see the reconciliation note appended to
# `library-permanent-lens.md`). Deleting `LibraryLensMinimise.test.tsx`, swapping the `node-build.test.ts`
# snapshot, and trimming the `lpl-flag-gates-permanent-lens` block from `LibraryPermanentLens.test.tsx` are the
# orchestrator's mechanical glue, done SEPARATELY — not this cap's `real.scope` (its `sourceGlobs` is
# `LibraryDrawer.tsx` only, its `testGlobs` is `LibraryTopDrawer.test.tsx` only).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryTopDrawer.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryDrawer.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/LibraryTopDrawer.test.tsx"]
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
        - "src/components/LibraryTopDrawer.test.tsx"
---

# The top drawer handle — the lens defaults to a collapsed top drawer handle and its state is URL-derived

**Outcome —** The Library lens presents by default as a persistent SLIM, TITLE-LESS collapsed top drawer
handle/tab (ADR-0191/0193). With `search=""` the drawer renders collapsed — a stable `data-lens-state="collapsed"`
marker, a slim handle bar carrying the ARROW toggle but NO "Library" wordmark (the title belongs to the expanded
state, ADR-0193 dec 2), the handed `bodySlot` NOT rendered, and NO dimming scrim. With `search="?overlay=library"`
the drawer renders EXPANDED — `data-lens-state="expanded"`, the `bodySlot` content visible, the handle bar still
present, the "Library" wordmark/title present, a drag-resize separator present, still no scrim. LENS STATE IS
URL-DERIVED: clicking the handle's single ARROW toggle affordance (one chevron button with an accessible
expand/collapse label, the terminal-dock idiom — the Expand/Collapse WORD buttons retire) fires an `onToggle`
callback prop (the parent glue owns the URL write via `commitSearch`; the component NEVER mutates the URL/history
itself) — re-rendering with a changed `search` flips collapsed→expanded→collapsed with the same handed `bodySlot`
intact on re-expand. The EXPANDED drawer carries a drag-resize separator (`role="separator"`) whose drag changes
the drawer's inline height (the terminal dock idiom); the collapsed state renders no separator. The ADR-0188 dec-6
component-local Minimise/Restore state machine RETIRES (no "Minimise"/"Restore" controls in either state), and
the #715 bottom-corner toggle it replaces is mooted. The pure exported `readLibraryOverlay(search)` reader
survives as the sole gate. Its slim title-less collapsed-handle default, its flag-derived expand with the wordmark
present, its arrow-toggle→`onToggle` seam, its URL-derived round-trip, its drag-resize separator, its no-scrim
posture, and its surviving reader are machine-witnessed; the full-width / half-screen layout, the half-screen
default proportion, and the handle silhouette are the story's operator-attested LOOK leg (ADR-0070).

**Depends on —** [`library-permanent-lens`](library-permanent-lens.md). This capability REWORKS the permanent
lens (`LibraryDrawer.tsx`) — it turns the lens's presence into a URL-derived collapsed/expanded state defaulting
to a top drawer handle, and it REPLACES the inc-9 `library-lens-minimise` capability on the same source (the
inc-10 cap-replacement precedent: `library-dag-canvas` replaced `library-focus-subgraph` on one source file). It
needs the delivered permanent lens (its flag-derived render, its `bodySlot`, its no-scrim posture) as its
precondition, so `depends_on: [library-permanent-lens]` — the same edge `library-lens-minimise` held. It holds no
backend seam — the lens reads only its props (`search`, `bodySlot`, `onToggle`, the deprecated ignored props), so
it is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, BROWNFIELD re-author (editsExisting).** `LibraryDrawer.tsx` EXISTS and is
> green at HEAD on the ADR-0191 top-drawer lens (URL-derived collapsed/expanded, a titled handle bar, Expand/
> Collapse WORD buttons, no drag-resize, no scrim). This capability polishes it to ADR-0193: a NET-NEW vitest jsdom
> test (`LibraryTopDrawer.test.tsx`) drives the SLIM, TITLE-LESS collapsed handle (`search=""` → the arrow toggle
> visible, the "Library" wordmark absent, the body hidden), the flag-derived expand with the wordmark present, the
> single ARROW-toggle→`onToggle` seam in both states with no Expand/Collapse word button, the URL-derived
> round-trip with the `bodySlot` intact and the retired Minimise/Restore machine absent, the drag-resize separator
> (present + drag changes height when expanded, absent when collapsed), the no-scrim posture, and the surviving
> pure reader — RED at HEAD as a FAILING-ASSERTION red (the collapsed handle still shows the "Library" wordmark,
> the toggle is a WORD button reading "Expand"/"Collapse", and no resize separator exists — NOT module-not-found),
> GREEN once the lens is polished. Its BEHAVIOUR is machine-witnessed; the full-width / half-screen layout, the
> half-screen default proportion, and the handle silhouette are the story's operator-attested LOOK leg (ADR-0070).
> Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the URL-DERIVED TOP-DRAWER STATE AS A WHOLE — a
behavioural rework of the permanent lens that defaults to a SLIM, TITLE-LESS collapsed top drawer handle, expands
when the URL flag is present (showing the "Library" wordmark), drives open/close from a single terminal-dock ARROW
chevron that fires an `onToggle` seam without ever writing the URL itself, carries a drag-resize separator in the
expanded state, keeps the handed body across a URL-derived collapse→expand round-trip, retires the component-local
Minimise/Restore machine, renders no scrim in either state, and preserves the pure flag reader — spanning the slim
title-less collapsed-by-default handle, the flag-derived expand, the arrow-toggle seam, the URL-derived
round-trip, the drag-resize separator, the no-scrim posture, and the surviving reader, exercised in jsdom. It is
the default-discoverable top drawer ADR-0191 settles as polished by ADR-0193, REPLACING the inc-9
`library-lens-minimise` on the same source (the inc-10 cap-replacement precedent).

THE DRAWER DEFAULTS TO A SLIM, TITLE-LESS COLLAPSED TOP HANDLE (search="" → the arrow toggle, no wordmark, the
body hidden, no scrim). With `search=""` (the flag ABSENT) the drawer renders COLLAPSED to a persistent SLIM top
drawer handle — a stable `data-lens-state="collapsed"` marker on the lens element (so the state is observable
without reading styling), the ARROW toggle PRESENT, the "Library" wordmark ABSENT (the title belongs to the
EXPANDED state, ADR-0193 dec 2 — assert the text "Library" is NOT present in the collapsed state), the handed
`bodySlot` content NOT rendered/visible, and NO full-screen dimming scrim. This is the "absent renders nothing"
retirement (ADR-0191 dec 1/2): absent now renders the collapsed handle (and only it) — the library is discoverable
on every map load with no URL knowledge and no corner icon. Pin it in `ltd-collapsed-handle-by-default`.

THE FLAG RENDERS EXPANDED (search="?overlay=library" → data-lens-state="expanded", the body visible, the handle
still present, the "Library" wordmark PRESENT). With `search="?overlay=library"` the drawer renders EXPANDED — a
stable `data-lens-state="expanded"` marker, the handed `bodySlot` content VISIBLE, the handle bar STILL present
(the handle is the single open/close affordance, present in both states), AND the "Library" wordmark/title PRESENT
(the expanded-only title, ADR-0193 dec 2). Assert the expanded state marker, the visible body, the surviving
handle, and the present "Library" wordmark. Pin it in `ltd-flag-renders-expanded`.

THE SINGLE ARROW TOGGLE FIRES onToggle IN BOTH STATES — NO WORD BUTTON, THE COMPONENT NEVER WRITES THE URL.
Clicking the handle's single ARROW toggle (one chevron button with an accessible expand/collapse label, e.g.
aria-label "expand library" / "collapse library" — the terminal-dock idiom) fires the `onToggle?: () => void`
callback prop EXACTLY ONCE, in BOTH the collapsed and the expanded state (the arrow is the single open/close
affordance — clicking it while collapsed asks to expand, clicking it while expanded asks to collapse). The
Expand/Collapse WORD buttons RETIRE (ADR-0193 dec 2 — assert there is NO button labelled with the words "Expand"
or "Collapse"). The component itself NEVER mutates the URL / `history` — the parent glue owns the URL write via
`commitSearch` (the same reactive seam the gear dials ride, ADR-0191 dec 2). Assert: `fireEvent.click` on the
arrow toggle fires `onToggle` once in the collapsed state and once in the expanded state, there is no "Expand"/
"Collapse" word button, and the component makes no `history`/URL mutation itself (drive it with `onToggle` as the
only observable effect). Pin it in `ltd-handle-toggle-fires-in-both-states`. Do NOT have the component call
`commitSearch` / `pushState` / assign `location` — the URL write is the parent glue's job (plan §G).

THE EXPANDED DRAWER IS DRAG-RESIZABLE — A SEPARATOR WHOSE DRAG CHANGES THE HEIGHT (the terminal dock idiom, the
half-screen DEFAULT is the look). The EXPANDED drawer renders a drag-resize separator (`role="separator"` with an
accessible label such as "resize library") on its bottom edge; a drag (mousedown → mousemove → mouseup) CHANGES
the drawer element's inline height style. The COLLAPSED state renders NO separator and carries NO inline height.
Assert the separator's presence in the expanded state and its absence in the collapsed state, and that a drag
CHANGES the inline height — NEVER a specific proportion/pixel value (the half-screen DEFAULT proportion itself is
the operator-attested look, ADR-0193 dec 1 / ADR-0070). Pin it in `ltd-drag-resize-expanded-only`.

LENS STATE IS URL-DERIVED — a changed `search` flips the state, the body kept on re-expand, the Minimise/Restore
machine ABSENT. Re-rendering the lens with a CHANGED `search` prop flips `collapsed → expanded → collapsed`
(driven purely by the URL flag, not a component-local state machine), and the same handed `bodySlot` content is
intact on re-expand (state kept — the lens re-derives from the URL, it does not lose the handed body). The retired
ADR-0188 dec-6 component-local Minimise/Restore state machine is ABSENT — there is NO "Minimise" and NO "Restore"
control in EITHER state (minimise, collapse, and close unify into clearing the flag, which the parent glue owns).
Assert the round-trip via re-render with a changed `search` (collapsed → expanded with the body → collapsed →
expanded with the SAME body), and assert no "Minimise"/"Restore" controls in either state. Pin it in
`ltd-lens-state-is-url-derived`. This is executing settled ADR-0191 dec 2 — do NOT keep a component-local
minimise state "for convenience".

NO DIMMING SCRIM IN EITHER STATE (the permanent-lens posture extended to the collapsed handle). The lens renders
NO full-screen dimming scrim in EITHER the collapsed or the expanded state — the map stays live/interactive
beneath at all times (observable via the ABSENCE of a scrim element). This extends the inc-8
`lpl-permanent-lens-over-live-map` posture to the collapsed handle: the collapsed handle sits over a fully live
map, exactly as the expanded lens does. Assert the absent scrim in both states. Pin it in
`ltd-no-scrim-either-state`.

THE PURE FLAG READER SURVIVES — PRESERVE `readLibraryOverlay` (no Route variant). The pure exported
`readLibraryOverlay(search: string): boolean` reader SURVIVES unchanged — `'?overlay=library'` → true; `''` and
`'?overlay=other'` → false. It stays the pure exported reader the URL-derived state is computed from (the lens is
expanded when it returns true, collapsed to the handle when it returns false). Assert its three cases directly
(`'?overlay=library'` → true, `''` → false, `'?overlay=other'` → false). Pin it in `ltd-flag-reader-survives`. Do
NOT add a variant to the `Route` union (the query-flag precedent stands, ADR-0185).

KEEP THE DEPRECATED ACCEPTED-BUT-IGNORED PROPS (the pre-rework `TreeView.tsx` call site compiles). The reworked
lens KEEPS the deprecated optional props `selection?`, `onOpen?`, `peekSlot?`, `diveSlot?`, and `onCommitSearch?`
as accepted-but-IGNORED (exactly as the inc-8/inc-9 lens already keeps them) so the pre-rework `TreeView.tsx` call
site compiles byte-unchanged until a later glue increment updates it. `TreeView.tsx` is OUTSIDE this cap's
`real.scope` (the leaf cannot edit it — the mount rewire is the orchestrator's supplement glue, plan §G). Do NOT
remove these props from the component's prop type in this cap. Add `onToggle?: () => void` as the NEW seam.

REUSE THE EXISTING `SearchResult` — DEFINE NO NEW TYPE (the inc-7 fence). The retained (ignored) `selection` prop
uses the EXISTING `SearchResult` from `../lib/librarySearch`. Do NOT define a new type and do NOT touch
`apps/studio/src/types.ts` or `apps/studio/server/**` (the inc-6/7 lane, file-disjoint — plan §Lanes FENCE).

THE LAYOUT AND SILHOUETTE ARE OPERATOR-ATTESTED, NOT ASSERTED (ADR-0193 dec 1 + ADR-0191 dec 3 + ADR-0070). Full
width stands; the expanded default is now ~HALF the forest frame (was the top-third, amended by ADR-0193 dec 1)
and drag-resizable. The full-width / half-screen layout, the half-screen DEFAULT proportion, the arrow/handle
silhouette, the resize feel, and the slide animation are WITNESSED by the owner (the shared still-unsigned inc-9+10
+12 look sitting as updated by the ten ADR-0193 items, with the 2026-07-12 owner-aligned mock as reference), never
a machine visual verdict — do NOT author a visual/colour/pixel/animation/proportion assertion in this cap's tests
(assert the collapsed/expanded `data-lens-state` marker, the arrow toggle's presence and toggle→`onToggle`, the
absent-in-collapsed / present-in-expanded "Library" wordmark, the resize separator's presence/absence and that a
drag CHANGES the height, the hidden/visible body, the absent scrim, and the surviving reader, never their styling
or a specific proportion/pixel value). Use the STABLE `data-lens-state` marker (not a CSS class / computed style)
as the machine-observable state so the assertion never leaks into appearance.

OFFLINE-TESTABLE IN JSDOM (the `LibraryPermanentLens.test.tsx` discipline). `@vitest-environment jsdom`,
`@testing-library/react` for render / `fireEvent` (click the handle's toggle) / re-render with a changed `search`.
No backend seam to mock — the lens reads only its props. No real `fetch`, no socket, no DB, no Electron. The
component imports no agent/drive/model (the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the URL-derived top-drawer state polished to ADR-0193: `search=""` renders the drawer COLLAPSED to
a SLIM, TITLE-LESS handle (`data-lens-state="collapsed"`, the ARROW toggle present, the "Library" wordmark ABSENT,
the `bodySlot` NOT rendered, no scrim, no resize separator); `search="?overlay=library"` renders it EXPANDED
(`data-lens-state="expanded"`, the `bodySlot` visible, the handle still present, the "Library" wordmark PRESENT, a
drag-resize separator present); clicking the single ARROW toggle fires `onToggle` exactly once in BOTH states with
no "Expand"/"Collapse" word button and the component never mutating the URL; re-rendering with a changed `search`
flips collapsed→expanded→collapsed with the same handed `bodySlot` intact on re-expand and no "Minimise"/"Restore"
control in either state; dragging the expanded separator changes the drawer's inline height; no dimming scrim in
either state; and the pure `readLibraryOverlay(search)` reader survives — entirely in jsdom, driven by props.

The integration test exercises this capability against its own composition (no backend seam) — the slim title-less
collapsed handle, the flag-derived expand, the arrow-toggle seam, the URL-derived round-trip, the drag-resize
separator, the no-scrim posture, and the surviving reader are all real. It would:

1. Render `<LibraryDrawer search="" bodySlot={…} onToggle={fn} />` in jsdom. Assert the drawer renders COLLAPSED —
   `data-lens-state="collapsed"`, the ARROW toggle present, the text "Library" NOT present, the `bodySlot` content
   NOT rendered, NO resize separator, and NO scrim.
2. Render with `search="?overlay=library"`. Assert the drawer renders EXPANDED — `data-lens-state="expanded"`, the
   `bodySlot` content visible, the handle bar still present, and the "Library" wordmark PRESENT.
3. `fireEvent.click` the arrow toggle in the collapsed state and assert `onToggle` fired once; render expanded
   and click the toggle and assert `onToggle` fired again (once per click); assert there is NO button labelled
   "Expand"/"Collapse"; and assert the component made no `history`/URL mutation itself.
4. Re-render with a changed `search` (`"" → "?overlay=library" → ""`) and assert the state flips
   collapsed→expanded→collapsed with the SAME handed `bodySlot` intact on re-expand, and assert there is no
   "Minimise"/"Restore" control in either state.
5. In the EXPANDED state, assert a drag-resize separator (`role="separator"`) is present; drive a drag
   (mousedown → mousemove → mouseup) on it and assert the drawer's inline height CHANGES; assert the COLLAPSED
   state renders no separator and carries no inline height (assert the separator + height CHANGE, never a specific
   proportion/pixel value).
6. Assert NO dimming scrim in either the collapsed or the expanded state (the map stays live beneath).
7. Assert `readLibraryOverlay('?overlay=library') === true`, `readLibraryOverlay('') === false`, and
   `readLibraryOverlay('?overlay=other') === false` — the pure exported reader survives, no `Route` variant.

## Contracts (7)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryTopDrawer.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id is
the LEAD of a distinctly-named test, so the coverage check reports 7/7 against the ONE `real.testFile`. None of
these is an APPEARANCE assertion — the full-width / half-screen layout, the half-screen default proportion, and
the handle silhouette are the story's operator-attested UAT LOOK leg (ADR-0070).

1. **`ltd-collapsed-handle-by-default`** — with search="" the drawer renders collapsed to a SLIM, TITLE-LESS handle (a stable data- marker, the arrow toggle, NO "Library" wordmark, the body hidden, no scrim)
   - **asserts —** with `search=""` (the flag absent) the drawer renders COLLAPSED: the lens element carries a
     stable `data-lens-state="collapsed"` marker, the ARROW toggle is present, the "Library" wordmark is ABSENT
     (assert the text "Library" is NOT present in the collapsed state — the title belongs to the expanded state,
     ADR-0193 dec 2), the handed `bodySlot` content is NOT rendered/visible, and there is NO full-screen dimming
     scrim. ("Absent renders nothing" is retired — absent renders the slim collapsed handle and only it.)
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the slim, title-less collapsed top-handle default render)
   - **proven by —** `apps/studio/src/components/LibraryTopDrawer.test.tsx` (net-new, vitest jsdom).
2. **`ltd-flag-renders-expanded`** — with search="?overlay=library" the drawer renders expanded (data-lens-state="expanded", the body visible, the handle still present, the "Library" wordmark PRESENT)
   - **asserts —** with `search="?overlay=library"` the drawer renders EXPANDED: a stable
     `data-lens-state="expanded"` marker, the handed `bodySlot` content VISIBLE, the handle bar STILL present, AND
     the "Library" wordmark/title PRESENT (the expanded-only title, ADR-0193 dec 2).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the flag-derived expanded render with the wordmark)
   - **proven by —** `apps/studio/src/components/LibraryTopDrawer.test.tsx`.
3. **`ltd-handle-toggle-fires-in-both-states`** — clicking the single ARROW toggle fires onToggle exactly once in both states; no "Expand"/"Collapse" word button; the component never mutates the URL/history
   - **asserts —** `fireEvent.click` on the single ARROW toggle (one button with an accessible expand/collapse
     label, the terminal-dock idiom) fires the `onToggle` callback EXACTLY ONCE, in BOTH the collapsed and the
     expanded state; there is NO button labelled with the words "Expand" or "Collapse" (the word buttons retire,
     ADR-0193 dec 2); and the component itself NEVER mutates the URL / `history` (the parent glue owns the URL write
     via `commitSearch`).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the single arrow toggle → `onToggle` seam, no word button, no URL write)
   - **proven by —** `apps/studio/src/components/LibraryTopDrawer.test.tsx`.
4. **`ltd-lens-state-is-url-derived`** — a changed search flips collapsed→expanded→collapsed with the body intact on re-expand; the retired component-local Minimise/Restore machine is absent
   - **asserts —** re-rendering with a changed `search` prop flips `collapsed → expanded → collapsed` (state
     derived purely from the URL flag) with the SAME handed `bodySlot` intact on re-expand; and there is NO
     "Minimise" and NO "Restore" control in either state (the ADR-0188 dec-6 component-local Minimise/Restore
     machine is retired).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the URL-derived state + the retired minimise machine)
   - **proven by —** `apps/studio/src/components/LibraryTopDrawer.test.tsx`.
5. **`ltd-no-scrim-either-state`** — no full-screen dimming scrim in either state (the map stays live beneath the collapsed handle and the expanded lens)
   - **asserts —** the lens renders NO full-screen dimming scrim in EITHER the collapsed or the expanded state —
     the map stays live/interactive beneath at all times (observable via the absence of a scrim element); the
     `lpl-permanent-lens-over-live-map` posture extended to the collapsed handle.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the no-scrim posture in both states)
   - **proven by —** `apps/studio/src/components/LibraryTopDrawer.test.tsx`.
6. **`ltd-flag-reader-survives`** — the pure exported readLibraryOverlay reader survives (no Route variant)
   - **asserts —** `readLibraryOverlay('?overlay=library') === true`; `readLibraryOverlay('') === false` and
     `readLibraryOverlay('?overlay=other') === false`. It stays the pure exported reader the URL-derived state is
     computed from — NOT a new `Route` variant.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the preserved pure `readLibraryOverlay` reader)
   - **proven by —** `apps/studio/src/components/LibraryTopDrawer.test.tsx`.
7. **`ltd-drag-resize-expanded-only`** — the EXPANDED drawer renders a drag-resize separator whose drag changes the drawer's inline height; the collapsed state renders none
   - **asserts —** in the EXPANDED state the drawer renders a drag-resize separator (`role="separator"` with an
     accessible label such as "resize library"); driving a drag on it (mousedown → mousemove → mouseup) CHANGES the
     drawer element's inline height style; the COLLAPSED state renders NO separator and carries NO inline height.
     Assert the separator's presence/absence and that a drag CHANGES the height — NEVER a specific proportion/pixel
     value (the half-screen DEFAULT proportion is the operator-attested look, ADR-0193 dec 1 / ADR-0070).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the expanded-only drag-resize separator + inline height)
   - **proven by —** `apps/studio/src/components/LibraryTopDrawer.test.tsx`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): polish the ADR-0191 top-drawer lens into the
ADR-0193 slim, title-less collapsed handle with a single arrow toggle, an expanded-only wordmark, and a
drag-resize separator, test-first, on the same source (the inc-10 cap-replacement precedent).

- **The new test —** `apps/studio/src/components/LibraryTopDrawer.test.tsx` (`@vitest-environment jsdom`, vitest +
  `@testing-library/react` — the studio package convention, the `LibraryPermanentLens.test.tsx` shape; NO real
  `fetch`/socket/DB/Electron). Import `{ LibraryDrawer, readLibraryOverlay }` from `"./LibraryDrawer"` and, for the
  retained (ignored) `selection` fixture, `import type { SearchResult } from "../lib/librarySearch"` — define NO
  new type. LEAD each test title with its contract id (`ltd-…`) so `storytree coverage library-top-drawer` reports
  7/7 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (LibraryDrawer.tsx exists — NOT
  module-not-found): against the ADR-0191 lens at HEAD, the collapsed handle STILL renders the "Library" wordmark
  (so `ltd-collapsed-handle-by-default`'s "wordmark absent" fails), the toggle is a WORD button reading "Expand"/
  "Collapse" (so `ltd-handle-toggle-fires-in-both-states`'s "no word button" fails), there is NO drag-resize
  separator (so `ltd-drag-resize-expanded-only` fails), and the expanded state may not surface the wordmark as a
  distinct title — the amended/new tests fail as a FAILING-ASSERTION red. This is the brownfield red the spine
  observes against the ADR-0191 lens at HEAD (ADR-0057).
- **The GREEN —** polish `apps/studio/src/components/LibraryDrawer.tsx`: keep the URL-derived lens state
  (`readLibraryOverlay(search)` → expanded when true, collapsed to the top handle when false) with a stable
  `data-lens-state="collapsed"`/`"expanded"` marker; render the SLIM, TITLE-LESS collapsed handle by DEFAULT
  (`search=""`) — the ARROW toggle present, the "Library" wordmark ABSENT, the `bodySlot` hidden, no scrim, no
  separator; render expanded (the `bodySlot` visible, the handle still present, the "Library" wordmark PRESENT, a
  drag-resize separator present) behind the flag, still no scrim; replace the Expand/Collapse WORD buttons with a
  single ARROW chevron toggle (accessible expand/collapse label) that fires the `onToggle?: () => void` prop in
  BOTH states WITHOUT the component ever mutating the URL/`history` (the parent glue owns the `commitSearch` write);
  add a `role="separator"` drag handle on the expanded drawer's bottom edge whose drag sets the drawer's inline
  height; REMOVE the ADR-0188 dec-6 component-local Minimise/Restore state machine; preserve the pure exported
  `readLibraryOverlay(search)` reader (no `Route` variant); KEEP `selection?`/`onOpen?`/`peekSlot?`/`diveSlot?`/
  `onCommitSearch?` as accepted-but-ignored optional props so the pre-rework `TreeView.tsx` call site compiles
  byte-unchanged. WIRING the lens mount + the URL write via `commitSearch`, the full-width / half-screen look, the
  half-screen default proportion, and REMOVING the #715 `.world-library-dock` corner toggle are witnessed under the
  story's operator-attested UAT LOOK leg (ADR-0193 dec 1/2, ADR-0191 dec 3, ADR-0070), NOT asserted in CI and NOT
  in this `real:` scope. After it, the new test's assertions hold and `pnpm --filter studio test` + `pnpm --filter
  studio typecheck` stay green.

### Reconcile the retired `library-lens-minimise` + `lpl-flag-gates-permanent-lens` contracts (part of THIS increment, executing settled ADR-0191)

This capability REPLACES `library-lens-minimise` (DELETED — its `lmin-*` contracts pinned the retired
component-local Minimise/Restore machine, ADR-0191 dec 2). This is NOT a re-decision (no owner fork) — it is
executing settled ADR-0191 (born accepted, owner-directed 2026-07-13), the inc-10 cap-replacement precedent
(`library-dag-canvas` replaced `library-focus-subgraph` on one source file). The re-homing:

- **REPLACED** — `library-lens-minimise` (the `lmin-*` contracts): its still-true behaviours re-home into the
  `ltd-*` contracts — the handle bar + state-kept body → `ltd-flag-renders-expanded` /
  `ltd-lens-state-is-url-derived`; the flag gate → `ltd-flag-renders-expanded` / `ltd-flag-reader-survives`; the
  no-scrim posture → `ltd-no-scrim-either-state`. The inc-8 strip-absence assertion is SUBSUMED (the reworked lens
  renders no strip, and `library-selection-card`'s `lsel-open-button` contract already carries the Open job).
- **RETIRED** — the inc-9 `lpl-flag-gates-permanent-lens` contract ("the flag alone gates presence — absent
  renders nothing"): ADR-0191 dec 1/2 makes this false — absent now renders the collapsed handle. Its flag
  semantics re-home into this cap's `ltd-collapsed-handle-by-default` + `ltd-flag-renders-expanded` +
  `ltd-flag-reader-survives`. The other three `lpl-*` contracts
  (`lpl-no-closed-or-dive-mode-no-close-button`, `lpl-permanent-lens-over-live-map`,
  `lpl-body-slot-renders-content`) stay true and survive verbatim (see the reconciliation note appended to
  `library-permanent-lens.md`).
- **Mechanical glue (the orchestrator's, done SEPARATELY — not this cap's `real.scope`)** — deleting
  `apps/studio/src/components/LibraryLensMinimise.test.tsx`, swapping the `node-build.test.ts` REAL-buildable
  snapshot, and trimming the `lpl-flag-gates-permanent-lens` block from
  `apps/studio/src/components/LibraryPermanentLens.test.tsx`. This cap's `real.scope` is `LibraryDrawer.tsx`
  (source) + `LibraryTopDrawer.test.tsx` (test) ONLY — the leaf does not touch those other files.

Rules:

- **The drawer defaults to a SLIM, TITLE-LESS collapsed top handle** (`ltd-collapsed-handle-by-default`, ADR-0191
  dec 1 / ADR-0193 dec 2) — `search=""` → `data-lens-state="collapsed"`, the ARROW toggle, NO "Library" wordmark,
  the body hidden, no scrim.
- **The flag renders expanded with the wordmark present** (`ltd-flag-renders-expanded`, ADR-0191 dec 2 / ADR-0193
  dec 2) — `search="?overlay=library"` → `data-lens-state="expanded"`, the body visible, the handle still present,
  the "Library" wordmark present.
- **The single ARROW toggle fires `onToggle` in both states; no word button; the component never writes the URL**
  (`ltd-handle-toggle-fires-in-both-states`, ADR-0191 dec 2 / ADR-0193 dec 2) — the Expand/Collapse word buttons
  retire; the parent glue owns the `commitSearch` write.
- **Lens state is URL-derived; the Minimise/Restore machine is retired** (`ltd-lens-state-is-url-derived`,
  ADR-0191 dec 2) — a changed `search` flips the state, the body kept on re-expand, no "Minimise"/"Restore".
- **The expanded drawer is drag-resizable — collapsed renders none** (`ltd-drag-resize-expanded-only`, ADR-0193
  dec 1) — a `role="separator"` handle whose drag CHANGES the drawer's inline height; assert presence/absence + a
  height change, never a specific proportion/pixel value.
- **No dimming scrim in either state** (`ltd-no-scrim-either-state`) — the map stays live beneath the collapsed
  handle and the expanded lens.
- **The pure flag reader survives — preserve `readLibraryOverlay`, no Route variant** (`ltd-flag-reader-survives`).
- **Keep the deprecated accepted-but-ignored props** (`selection?`/`onOpen?`/`peekSlot?`/`diveSlot?`/
  `onCommitSearch?`) so the pre-rework `TreeView.tsx` call site compiles; add `onToggle?` as the new seam; reuse
  the existing `SearchResult`, touch no `types.ts`/`server` (inc-7 fence) — define no new type.
- **Layout and silhouette are operator-attested, not asserted here** (ADR-0193 dec 1, ADR-0191 dec 3, ADR-0070) —
  prove the collapsed/expanded behaviour via the stable `data-lens-state` marker; the full-width / half-screen
  proportions, the half-screen default, the arrow/handle silhouette, and the resize feel are the shared inc-9/10/12
  look leg. Do NOT author a visual verdict, and do NOT edit `TreeView.tsx` or `index.css` in the `real:` scope (the
  mount rewire + the look + removing the #715 corner toggle are the orchestrator's supplement glue after PASS —
  plan §G).
- **Every `ltd-` contract test TITLE leads with its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, this arc's 6th-occurrence class risk — the fix if it happens is
  TEST-TITLE-ONLY, never an assertion/source edit).
