---
id: "library-permanent-lens"
tier: capability
story: library-tech-tree-overlay
title: "The Library overlay is a permanent lens — the closed→peek→dive state machine and the × close button are retired; the flag gates presence, the map stays live beneath, a body slot renders content, and a bottom selection-preview section fires Open"
outcome: "Behind `?overlay=library` the Library renders as a PERMANENT LENS over the live map (ADR-0187 dec 1): the flag gates presence and nothing renders without it; the retired affordances are gone (NO × close button, NO Dive button, NO closed/dive mode machine); the lens carries no dimming scrim so the map stays live beneath; a body slot renders whatever node it is handed; and a bottom selection-preview description section renders the selected artifact's summary + an `Open` button that fires `onOpen(selection)` (ADR-0187 dec 2). Its flag-gate, its retired-affordance absence, its live-map posture, its body-slot render, and its Open-fires-onOpen behaviour are machine-witnessed; its forest-cozy appearance is operator-attested."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [187, 185, 70, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true) — this is the RE-AUTHOR of
# the signed inc-1 drawer shell to ADR-0187 dec 1 + the dec-2 bottom section. `apps/studio/src/components/
# LibraryDrawer.tsx` EXISTS and is green at HEAD on the OLD closed→peek→dive state machine (the `Mode` union,
# the × `Close library` button, the Dive button, the peekSlot/diveSlot pair). This cap reworks it into a
# permanent lens: the RED the spine observes is a FAILING-ASSERTION red (the source exists — NOT a
# module-not-found), because a NET-NEW test file `LibraryPermanentLens.test.tsx` asserts the reworked geometry
# the HEAD source does not yet have (a stable lens testid gated purely on the flag; no ×/Dive/data-mode
# machine; a renamed `bodySlot`; a bottom selection-preview section with an `Open` button firing `onOpen`).
# real.sourceFile = LibraryDrawer.tsx; real.testFile = the NEW LibraryPermanentLens.test.tsx (NOT the existing
# LibraryDrawer.test.tsx — that stays library-drawer-shell's real.testFile, TRIMMED to its surviving pure
# `ldw-*` flag-reader contracts as part of THIS increment; see the reconciliation note below).
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the MACHINE GEOMETRY ONLY — the flag gate,
# the retired-affordance absence, the no-scrim posture, the body-slot render, and the bottom Open→onOpen wiring.
# The lens's APPEARANCE (does it read as a forest-cozy permanent lens with no × chrome; the bottom
# selection-preview description styling; the polished "like opening a Word doc" framing of the sibling Open
# overlay) and its real MOUNTING into TreeView (the bodySlot composition + `selection`/`onOpen` wiring, and
# the removal of the retired `diveSlot={<LibraryDiveBody …/>}`) are the story's operator-attested UAT leg 1
# (the look is witnessed, never a machine visual verdict; do NOT add a visual/colour/pixel/animation assertion
# here, and do NOT edit TreeView.tsx in this `real:` scope — the lens is proven in isolation, driven by props,
# and the mount is the orchestrator's supplement glue after PASS — plan §G).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lpl-`-named contract test
# lives in LibraryPermanentLens.test.tsx. Its TITLE must carry the unique `lpl-` id or coverage silently
# drops N-1/N past the signed green (`sdk-leaf-drops-contract-id-test-names` — a 4th-occurrence class risk;
# the fix if it happens is TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryPermanentLens.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryDrawer.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/LibraryPermanentLens.test.tsx"]
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
        - "src/components/LibraryPermanentLens.test.tsx"
---

# The permanent-lens shell — the Library overlay is a permanent lens with a bottom Open trigger

**Outcome —** Behind `?overlay=library` the Library renders as a PERMANENT LENS over the live forest map
(ADR-0187 dec 1). The flag gates presence — with the flag the lens renders (a stable lens testid); without it
nothing renders. The retired affordances are GONE: there is NO `×` close button, NO `Dive` button, and NO
`closed`/`dive` mode machine (the `Mode = 'closed'|'peek'|'dive'` state machine of ADR-0185 dec 1 is retired).
The lens carries NO dimming scrim, so the map stays live beneath it at all times. A lens BODY slot renders
whatever node it is handed (the finder+subgraph / overview composition), and a small bottom selection-preview
DESCRIPTION section (ADR-0187 dec 2) renders the currently-selected artifact's summary + an `Open` button that
fires `onOpen(selection)`. Its flag-gate, its retired-affordance absence, its live-map posture, its body-slot
render, and its Open-fires-`onOpen` behaviour are machine-witnessed; its forest-cozy appearance is
operator-attested.

**Depends on —** nothing (`depends_on: []`). This is the RE-AUTHOR of the story's root shell capability
(`library-drawer-shell`, inc 1) into the permanent lens ADR-0187 dec 1 settles — it holds no upstream code
edge. It shares `apps/studio/src/components/LibraryDrawer.tsx` as its `real.sourceFile` with the retired shell
cap (which keeps the trimmed `LibraryDrawer.test.tsx` proving the SURVIVING pure flag-reader invariant); this
cap proves the reworked geometry in a NET-NEW `LibraryPermanentLens.test.tsx`. It holds no backend seam — the
lens reads only its props (`search`, the body slot, and the `selection`/`onOpen` pair), so it is
deterministically drivable in jsdom. The sibling Open overlay (`library-open-overlay`) and the double-click
trigger (`library-open-trigger`) are separate increments; the bottom section's `onOpen` is the button-driven
opener the glue wires to the Open overlay (plan §G).

> **Proof status (honest) — `proposed`, BROWNFIELD re-author (editsExisting).** `LibraryDrawer.tsx` EXISTS
> and is green at HEAD on the OLD closed→peek→dive state machine (verified 2026-07-12 — the `Mode` union, the
> `×` `Close library` button, the `Dive` button, the `peekSlot`/`diveSlot` pair). This capability reworks it
> into a permanent lens: a NET-NEW vitest jsdom test (`LibraryPermanentLens.test.tsx`) drives the reworked
> geometry — the flag gate, the retired-affordance absence, the no-scrim posture, the body slot, and the
> bottom Open→`onOpen` wiring — RED at HEAD as a FAILING-ASSERTION red (the reworked behaviour is absent, NOT
> module-not-found), GREEN once the component is reworked. Its GEOMETRY/BEHAVIOUR is machine-witnessed; its
> APPEARANCE (the forest-cozy permanent lens without × chrome, the bottom selection-preview description styling)
> and its real MOUNTING into `TreeView.tsx` are the story's operator-attested UAT leg 1 (ADR-0070). Status
> stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the PERMANENT-LENS SHELL AS A WHOLE — a
behavioural React component that reads the `?overlay=library` flag, renders the permanent lens (no mode
machine, no close chrome), holds the map live beneath (no scrim), renders a body slot, and renders a bottom
selection-preview section with an Open button — spanning the flag gate, the retired-affordance removal, the
no-scrim posture, the body slot, and the bottom Open→`onOpen` wiring, exercised in jsdom. It is the reworked
shell every later increment mounts into; the sibling Open overlay and the double-click trigger are those
increments' jobs.

THE FLAG STAYS THE INVOCATION GATE — PRESERVE `readLibraryOverlay` (do NOT add a Route variant). The pure
`readLibraryOverlay(search: string): boolean` reader (the `?overlay` value `=== 'library'`) SURVIVES the
rework unchanged — it is still the invocation gate, and its four `ldw-reads-overlay-flag-*` reader contracts
stay green in the trimmed `LibraryDrawer.test.tsx` (they import the pure function, source-independent). The
lens renders when the flag is true and renders nothing when it is absent, exactly as the shell did — the
CHANGE is that there is no longer any in-panel transition OUT of presence (no `closed` state reached by a ×/Esc
inside the lens). Do NOT add a variant to the `Route` union in `route.ts` (the query-flag precedent stands,
ADR-0185). Pin the gate in `lpl-flag-gates-permanent-lens`.

THE RETIRED AFFORDANCES ARE GONE (ADR-0187 dec 1). The `Mode = 'closed'|'peek'|'dive'` state machine, the `×`
`Close library` button (`aria-label="Close library"` / `.library-drawer-close`), and the `Dive` button are
RETIRED. The lens has NO in-panel close (dismissal is by map navigation clearing `?overlay`, owned by the
parent glue — plan §G — NOT the shell) and NO inline dive slot (reading is the separate Open overlay,
`library-open-overlay`). Prove the ABSENCE: no `×`/`Close library` control, no `Dive` button, no
`data-mode="closed"`/`"dive"` machine. Pin it in `lpl-no-closed-or-dive-mode-no-close-button`. This is
executing settled dec 1 — do NOT re-introduce a close affordance "for convenience".

THE PERMANENT LENS OVER A LIVE MAP (the surviving no-scrim invariant). The old `lds-peek-overlays-live-map`
invariant SURVIVES as the permanent posture: the lens renders NO full-screen dimming scrim over the map, so
the forest map stays live/interactive beneath it at all times (observable via the ABSENCE of a scrim element).
Pin it in `lpl-permanent-lens-over-live-map`. There is no deliberate-dive-loses-the-map state any more — the
map is always live beneath the lens (the Open overlay is the separate document surface).

THE BODY SLOT RENDERS CONTENT — RENAME `peekSlot` → a permanent body slot, REMOVE `diveSlot`. The lens takes a
single body slot prop (rename the retired `peekSlot` to a permanent body slot, e.g. `bodySlot`) that renders
whatever node it is handed — the finder+subgraph / overview composition the glue feeds it (plan §G, unchanged
from the peek composition). The retired `diveSlot` prop is REMOVED entirely (the inline collapse-to-a-bar dive
is gone, replaced by the separate Open overlay). Prove the body slot renders handed content and that there is
no dive slot. Pin it in `lpl-body-slot-renders-content`. Take the body slot as a prop so the lens proves in
isolation (the shell stays provider-free; the AppData-backed composition is mounted by TreeView, plan §G).

THE BOTTOM SELECTION-PREVIEW DESCRIPTION SECTION — the Open trigger (ADR-0187 dec 2). The lens carries a small
description section at the BOTTOM, driven by a `selection: SearchResult | null` prop:

- **Non-null selection** — the section renders the selected artifact's SUMMARY (its title + description off the
  `SearchResult`) and an **`Open`** button whose label is the word **"Open"** (NOT "Dive"). Clicking it invokes
  an `onOpen(selection)` callback prop with the selection.
- **Null selection** — the section renders the empty/prompt state, with NO enabled Open button.

Assert the section content (title + description), the **"Open"** label, and that `onOpen` fires WITH the
selection; NEVER the styling. Pin it in `lpl-bottom-selection-preview-open-fires-onopen`. Take `selection` and
`onOpen` as props so the wiring proves in jsdom — the glue passes `selection={librarySelection}` and
`onOpen={setOpenSelection}` (plan §G), and the Open overlay renders the opened selection.

REUSE THE EXISTING `SearchResult` — DEFINE NO NEW TYPE (the inc-7 fence). The `selection` prop uses the
EXISTING `SearchResult` type imported from `../lib/librarySearch` (the same discriminated shape the finder /
subgraph / overview / dive already lift). Do NOT define a new type and do NOT touch
`apps/studio/src/lib/types.ts` or `apps/studio/server/**` — that is the inc-7 / inc-6 lane, file-disjoint
(plan §Lanes FENCE). Keep any shared shape component-local; the `SearchResult` on `librarySearch.ts` is all
this needs.

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0185 dec 5 + ADR-0187 + ADR-0070). The lens follows the
map's forest-cozy palette (the world's CSS variables, as the shell/finder/subgraph/dive/overview do), NOT
neutral-admin white and NEVER the black-terminal look. The permanent lens's appearance (no × chrome, the
bottom selection-preview description section, the "like opening a Word doc" framing of the sibling Open
overlay) is WITNESSED by the owner (UAT leg 1), never a machine visual verdict — do NOT author a
visual/colour/pixel/animation assertion in this cap's tests (assert the flag gate, the retired-affordance
ABSENCE, the no-scrim posture, the body-slot render, and the bottom Open→`onOpen` wiring, never their styling).
Witness the look at `?overlay=library#/tree`.

OFFLINE-TESTABLE IN JSDOM (the `LibraryDrawer.test.tsx` / `ReviewToggle.test.tsx` discipline).
`@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent` (click the Open button). No
backend seam to mock (the lens holds no `api` call) — the test renders `<LibraryDrawer search="?overlay=library"
… />` with a body slot and a `selection`/`onOpen` pair, asserts the flag gate / retired-affordance absence /
no-scrim posture / body-slot render, and fires the Open button asserting `onOpen(selection)`. No real `fetch`,
no socket, no DB, no Electron. The component imports no agent/drive/model (the `modelPathBoundary.test.ts` wall
stays green).

## Integration test

**Goal —** Prove the permanent-lens shell: `?overlay=library` renders the lens (a stable lens testid) and
absent the flag nothing renders; there is NO × close button, NO Dive button, and NO closed/dive mode machine;
the lens renders no dimming scrim (the map stays live beneath); the body slot renders whatever node it is
handed and there is no dive slot; and the bottom selection-preview section renders a non-null selection's
summary + an `Open` button that fires `onOpen(selection)`, rendering the empty state with no Open button when
the selection is null — entirely in jsdom, driven by props.

The integration test exercises this capability against its own composition (no backend seam) — the flag gate,
the retired-affordance absence, the no-scrim posture, the body slot, and the bottom Open→`onOpen` wiring are
all real. It would:

1. Render `<LibraryDrawer search="?overlay=library" … />` in jsdom. Assert the permanent lens renders (a stable
   lens testid is present). Then render with `search=""` (flag absent) and assert nothing renders (no lens).
   The flag is read by the surviving pure `readLibraryOverlay(search)`, NOT a new `Route` variant.
2. With the lens rendered, assert the retired affordances are ABSENT: NO `×`/`Close library` button (no
   `aria-label="Close library"` / `.library-drawer-close`), NO `Dive` button, and NO `data-mode="closed"`/
   `"dive"` machine.
3. Assert the lens renders NO dimming scrim over the map — the forest map stays live beneath (the permanent
   posture; observable via the absence of a scrim element).
4. Render the lens with a body slot node handed in. Assert the body slot renders that content, and assert
   there is NO dive slot (the retired `diveSlot` is gone).
5. Render the lens with a non-null `selection: SearchResult` prop. Assert the bottom section renders the
   selection's title + description and an **`Open`** button (label === "Open", not "Dive"); fire the Open
   button and assert `onOpen` is invoked WITH the selection. Then render with `selection={null}` and assert the
   section shows the empty/prompt state with NO enabled Open button.

## Contracts (5 → 4 → 3 surviving; ADR-0188 inc-9 then ADR-0191 inc-12 reconciliation)

> **RECONCILED at increment 9 (ADR-0188 dec 3/6 — executing a settled decision, NOT a re-decision).** Contract
> 5 below, `lpl-bottom-selection-preview-open-fires-onopen`, is **RETIRED**: ADR-0188 dec 3 retires the inc-8
> bottom selection-preview strip (its "what am I looking at" + Open job moved to the side-panel pinned card,
> `library-selection-card`), and ADR-0188 dec 6 adds the lens's minimise handle (`library-lens-minimise`). Its
> behaviour is **re-homed** across `lsel-open-button-fires-onopen` (the pinned Open button) +
> `lmin-selection-preview-strip-retired` (the strip's absence). story-author has trimmed the
> `lpl-bottom-selection-preview-open-fires-onopen` `describe`-block (and its now-unused
> `fireEvent`/`SearchResult`/`selection`-fixture imports) from
> `apps/studio/src/components/LibraryPermanentLens.test.tsx` as part of inc 9. The **4 surviving** contracts —
> `lpl-flag-gates-permanent-lens`, `lpl-no-closed-or-dive-mode-no-close-button`,
> `lpl-permanent-lens-over-live-map`, `lpl-body-slot-renders-content` — stay verbatim and are `coverage 4/4`
> against the trimmed `real.testFile`. Contract 5 is retained below as struck history; do not re-add it.

> **RECONCILED again at increment 12 (ADR-0191 — executing a settled decision, NOT a re-decision; amends
> ADR-0188 dec 1/6).** Contract 1 below, `lpl-flag-gates-permanent-lens`, is **RETIRED**: ADR-0191 makes the lens
> state URL-derived and defaults it to a persistent collapsed top drawer handle — so "the flag alone gates
> presence — absent renders nothing" is now FALSE (absent renders the collapsed handle, and only it). The inc-9
> `library-lens-minimise` capability is REPLACED by the new `library-top-drawer` capability on the same source
> (`LibraryDrawer.tsx`) — the inc-10 cap-replacement precedent. Contract 1's flag semantics are **re-homed** into
> `library-top-drawer`'s `ltd-collapsed-handle-by-default` (absent → the collapsed handle) +
> `ltd-flag-renders-expanded` (present → expanded) + `ltd-flag-reader-survives` (the pure exported
> `readLibraryOverlay` reader survives). **The orchestrator authors the test-file trim** — it removes the
> `lpl-flag-gates-permanent-lens` block (and any now-unused imports) from
> `apps/studio/src/components/LibraryPermanentLens.test.tsx` as the mechanical glue of inc 12 (NOT story-author's
> and NOT `library-top-drawer`'s `real.scope`, whose `testGlobs` is `LibraryTopDrawer.test.tsx` only). The **3
> surviving** contracts — `lpl-no-closed-or-dive-mode-no-close-button`, `lpl-permanent-lens-over-live-map`,
> `lpl-body-slot-renders-content` — stay TRUE and survive verbatim (the top-drawer rework is additive over them:
> it never re-introduces a ×/Dive/mode machine, keeps the map live with no scrim, and keeps the body slot), and
> are `coverage 3/3` against the further-trimmed `real.testFile`. Contract 1 is retained below as struck history;
> do not re-add it.

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryPermanentLens.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract
id is the lead of a distinctly-named test; after the inc-9 then inc-12 reconciliations the coverage check reports
**3/3** against the ONE `real.testFile`. None of these is an APPEARANCE assertion — the look (the forest-cozy
permanent lens, the no-× chrome) is the story's operator-attested UAT leg 1 (ADR-0070).

1. **`lpl-flag-gates-permanent-lens`** — *(RETIRED at inc 12, ADR-0191 — the flag no longer gates presence: absent renders the collapsed top drawer handle; flag semantics re-homed to `library-top-drawer`'s `ltd-collapsed-handle-by-default` + `ltd-flag-renders-expanded` + `ltd-flag-reader-survives`; struck history, not a live contract)* — the `?overlay=library` flag gates the permanent lens; absent → nothing
   - **asserts —** with `search="?overlay=library"` the permanent lens renders (a stable lens testid is
     present); with `search=""` (or `?overlay=` anything-else) nothing renders. The flag is read by the
     SURVIVING pure `readLibraryOverlay(search)` (value `=== 'library'`), NOT a new `Route` variant — the flag
     stays the invocation gate.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the preserved `readLibraryOverlay` reader +
     the flag→lens presence gate)
   - **proven by —** `apps/studio/src/components/LibraryPermanentLens.test.tsx` (net-new, vitest jsdom).
2. **`lpl-no-closed-or-dive-mode-no-close-button`** — the retired affordances are gone: no × close button, no Dive button, no closed/dive mode machine
   - **asserts —** with the lens rendered there is NO `×` close button (no `aria-label="Close library"` /
     `.library-drawer-close`), NO `Dive` button, and NO `data-mode="closed"`/`"dive"` machine — the
     `Mode = 'closed'|'peek'|'dive'` state machine of ADR-0185 dec 1 is retired (ADR-0187 dec 1). The lens has
     no in-panel close and no inline dive slot.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the retired mode machine + close/Dive controls removed)
   - **proven by —** `apps/studio/src/components/LibraryPermanentLens.test.tsx`.
3. **`lpl-permanent-lens-over-live-map`** — the lens renders no dimming scrim; the map stays live beneath
   - **asserts —** the lens renders NO full-screen dimming scrim over the map (the old
     `lds-peek-overlays-live-map` invariant survives as the permanent posture) — the forest map stays
     live/interactive beneath at all times (observable via the absence of a scrim element).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the permanent lens render — overlay without scrim)
   - **proven by —** `apps/studio/src/components/LibraryPermanentLens.test.tsx`.
4. **`lpl-body-slot-renders-content`** — the body slot renders handed content; there is no dive slot
   - **asserts —** the lens's BODY slot (the retired `peekSlot` renamed to a permanent body slot, e.g.
     `bodySlot`) renders whatever node it is handed; and there is NO dive slot (the retired `diveSlot` prop is
     REMOVED — the inline dive is gone, replaced by the separate Open overlay).
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the renamed permanent body slot + the removed dive slot)
   - **proven by —** `apps/studio/src/components/LibraryPermanentLens.test.tsx`.
5. **`lpl-bottom-selection-preview-open-fires-onopen`** — *(RETIRED at inc 9, ADR-0188 dec 3/6 — the bottom strip is retired; behaviour re-homed to `lsel-open-button-fires-onopen` + `lmin-selection-preview-strip-retired`; struck history, not a live contract)* — the bottom section renders a non-null selection's summary + an Open button firing onOpen; null → empty state, no Open button
   - **asserts —** given a `selection: SearchResult | null` prop: when non-null the bottom description section
     renders the selection's SUMMARY (title + description off the `SearchResult`) and an **`Open`** button (its
     label is the word "Open", NOT "Dive"); clicking it invokes `onOpen(selection)` WITH the selection. When
     null the section renders the empty/prompt state with NO enabled Open button. Asserts the section content +
     the "Open" label + that `onOpen` fires with the selection, NEVER the styling.
   - **covers —** `apps/studio/src/components/LibraryDrawer.tsx` (the bottom selection-preview description
     section + the Open button → `onOpen(selection)`)
   - **proven by —** `apps/studio/src/components/LibraryPermanentLens.test.tsx`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): re-author the signed drawer shell into the
permanent lens, test-first.

- **The new test —** `apps/studio/src/components/LibraryPermanentLens.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryDrawer.test.tsx` shape; NO
  real `fetch`/socket/DB/Electron). Import `{ LibraryDrawer }` (and, if the reworked source re-exports it,
  `readLibraryOverlay`) from `"./LibraryDrawer"`, and `import type { SearchResult } from "../lib/librarySearch"`
  for the `selection` fixture — define NO new type. Name each test for its contract id (`lpl-…`) so
  `storytree coverage library-permanent-lens` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (NOT module-not-found — the
  source exists): against the HEAD source (the old state machine), the new test's assertions fail — the lens
  testid is not what the test expects, the `×`/`Dive`/`data-mode` affordances are still present, `bodySlot`/the
  bottom Open section don't exist. This is the brownfield red the spine observes against the state-machine code
  at HEAD (ADR-0057).
- **The GREEN —** rework `apps/studio/src/components/LibraryDrawer.tsx` into the permanent lens: preserve the
  pure `readLibraryOverlay(search)` reader (still the invocation gate); render a permanent lens (a stable
  testid) when the flag is true and nothing when it is absent; REMOVE the `Mode` state machine, the `×`
  `Close library` button, and the `Dive` button; render NO dimming scrim; rename `peekSlot` → a permanent body
  slot (e.g. `bodySlot`) and REMOVE `diveSlot`; add the bottom selection-preview description section taking
  `selection: SearchResult | null` + `onOpen: (r: SearchResult) => void` props (summary + `Open` button →
  `onOpen(selection)` when non-null; empty state, no Open button, when null). Keep `search` the ONLY required
  prop (the body slot, `selection`, and `onOpen` optional) so the trimmed `LibraryDrawer.test.tsx`'s
  `ldw-closed-without-flag` render stays green. WIRING it into `TreeView.tsx` (the body-slot composition, the
  `selection`/`onOpen` wiring, and REMOVING the retired `diveSlot={<LibraryDiveBody …/>}`) and the forest-cozy
  appearance are witnessed under UAT leg 1 (operator-attested, ADR-0070), NOT asserted in CI and NOT in this
  `real:` scope. After it, the new test's assertions hold and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green.
- **KEEP `onCommitSearch?` as an OPTIONAL prop on the reworked lens (do NOT remove it).** The permanent
  lens no longer uses it (dismissal is the parent glue's map-navigation flag-clear, plan §G — not the
  lens), but the trimmed `LibraryDrawer.test.tsx` is OUTSIDE this cap's `real.scope` (its `testGlobs` is
  `LibraryPermanentLens.test.tsx` only), so the leaf CANNOT edit it. Keeping `onCommitSearch?: (nextSearch:
  string) => void` optional-and-unused makes `ldw-closed-without-flag`'s `<LibraryDrawer search=""
  onCommitSearch={vi.fn()} />` render compile byte-unchanged against the reworked source — the trimmed
  file stays green with zero edits. `search` stays the ONLY REQUIRED prop; the body slot, `selection`,
  `onOpen`, and `onCommitSearch` are all optional.

### Reconcile the retired `library-drawer-shell` contracts (part of THIS increment, executing settled dec 1)

Reworking `LibraryDrawer.tsx` BREAKS the retired shell's `lds-*` state-machine contracts (they assert the
`closed`/`dive` modes + the `×` button that no longer exist). As part of THIS increment (M1), TRIM
`apps/studio/src/components/LibraryDrawer.test.tsx` to only the still-true pure flag-reader contracts — this is
NOT a re-decision (no ADR, no owner fork), it is executing settled dec 1. story-author has authored the trim
already; the M1 leaf keeps it green (see the Reconciliation note in `library-drawer-shell.md`). Specifically:

- **RETIRE** (now-false state-machine `it()` blocks): `lds-esc-and-toggle-close-from-peek`,
  `lds-dive-collapses-to-bar-and-reserves-body`, `lds-esc-unwinds-dive-to-peek`, `ldw-esc-unwinds-peek-to-closed`,
  `ldw-close-toggle-clears-overlay-flag` (all assert the retired ×/Dive/Esc-to-closed machine). The reworked
  survivors `lds-flag-opens-drawer-to-peek` / `lds-peek-overlays-live-map` / `ldw-peek-reserves-an-empty-slot`
  are RE-HOMED here as `lpl-flag-gates-permanent-lens` / `lpl-permanent-lens-over-live-map` /
  `lpl-body-slot-renders-content` (they now assert the reworked source).
- **KEEP** (still-true, source-independent pure reader + absent-flag): `ldw-reads-overlay-flag-present`,
  `ldw-reads-overlay-flag-present-with-other-params`, `ldw-reads-overlay-flag-absent`,
  `ldw-reads-overlay-flag-other-value`, `ldw-closed-without-flag`. These 5 become `library-drawer-shell`'s
  surviving contract set (its `real.testFile` stays the trimmed `LibraryDrawer.test.tsx`). The one component
  render (`ldw-closed-without-flag`) passes `onCommitSearch={vi.fn()}`; since `LibraryDrawer.test.tsx` is
  OUTSIDE this cap's `real.scope` (the leaf cannot edit it), the reworked lens KEEPS `onCommitSearch?` as an
  optional (unused) prop so that render compiles byte-unchanged — the trimmed file stays green with zero
  edits (do NOT remove `onCommitSearch` from the component).

Rules:

- **The flag stays the invocation gate — preserve `readLibraryOverlay`, no Route variant**
  (`lpl-flag-gates-permanent-lens`). The lens renders when the flag is true and nothing when absent.
- **Retire the ×/Dive/mode machine** (`lpl-no-closed-or-dive-mode-no-close-button`, ADR-0187 dec 1). No
  in-panel close; dismissal is by map navigation (parent glue), no inline dive.
- **Permanent lens over a live map — no scrim** (`lpl-permanent-lens-over-live-map`). The map stays live
  beneath at all times.
- **Rename `peekSlot` → a permanent body slot, remove `diveSlot`** (`lpl-body-slot-renders-content`). The body
  slot renders handed content; the inline dive is gone.
- **Bottom selection-preview section fires Open** (`lpl-bottom-selection-preview-open-fires-onopen`, ADR-0187
  dec 2). Non-null selection → summary + `Open` button → `onOpen(selection)`; null → empty state, no Open.
- **Reuse the existing `SearchResult`, touch no `types.ts`/`server`** (inc-7 fence). The `selection` prop uses
  `SearchResult` from `../lib/librarySearch`; define no new type.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the flag gate, the
  retired-affordance absence, the no-scrim posture, the body-slot render, and the bottom Open→`onOpen` wiring;
  the forest-cozy look is UAT leg 1. Do NOT author a visual verdict, and do NOT edit `TreeView.tsx` in the
  `real:` scope (the mount is the orchestrator's supplement glue after PASS — plan §G).
- **Every `lpl-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, a 4th-occurrence class risk — the fix if it happens is
  TEST-TITLE-ONLY, never an assertion/source edit).
