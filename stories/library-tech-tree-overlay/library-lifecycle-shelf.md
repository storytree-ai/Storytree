---
id: "library-lifecycle-shelf"
tier: capability
story: library-tech-tree-overlay
title: "The finder gains an Active | All lifecycle toggle (default Active): Active mode shows each shelf row's count of open+active items (via `lifecycleOf` from @storytree/library over the row's category), the muted total beside it when it differs ('2 of 38'); All shows plain totals; the Decisions row counts only `group === 'Decisions'` docs (the 223→191 count-bug fix); scoped into a stateful category, per-kind state chips render using the kind's OWN stored vocabulary and filter the scoped browse list — the signed lf-*/lcs- paths stay byte-green"
outcome: "The finder gains an Active | All lifecycle toggle, DEFAULT Active (ADR-0196 D3). ACTIVE mode: each category shelf row shows the count of `open`+`active` items — computed via `lifecycleOf` from `@storytree/library` (already a studio dependency) over each asset's lifecycle-bearing fields (friction `fields.route`, plan wire `status`, ADR `DocMeta.status`) — with the muted TOTAL shown alongside when it differs (the '2 of 38' presentation); ALL mode shows plain totals. The Decisions shelf row counts ONLY `group === 'Decisions'` docs (the count-bug fix, 223 → 191). When SCOPED into a stateful category, per-kind STATE CHIPS render using the kind's OWN stored vocabulary — friction: open/routed/archived (derived from `route`); Decisions: proposed/accepted/superseded; plan: projected open/active/archived — each chip FILTERING the scoped browse list; kinds without state get no chips. The Active|All toggle also filters scoped browse lists in Active mode. `GuidanceAsset` (apps/studio/src/types.ts) gains the optional `status?: string` plan-lifecycle mirror (additive only). The toggle/count/chip BEHAVIOUR is machine-witnessed; the toggle styling and chip look are operator-attested (ADR-0070)."
status: proposed
proof_mode: integration-test
depends_on: [library-category-shelf, library-lifecycle-wire]
decisions: [196, 188, 183, 168, 70, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true) — this REWORKS the signed
# inc-9 finder (`apps/studio/src/components/LibraryFinder.tsx`, green at HEAD with its `lf-*`/`lcs-*` contracts)
# and the pure heart `apps/studio/src/lib/libraryShelf.ts` to add the Active|All lifecycle toggle, the
# live/total counts, the Decisions count-bug fix, and the per-kind scoped state chips ADR-0196 D3 settles. The
# rework is ADDITIVE around the EXISTING shelf/scope path: with a typed query and no scope the finder still
# ranks via `searchCorpus` (the `lf-*` path), and the idle shelf still renders one row per category + a
# Decisions row (the `lcs-*` path), so the signed `lf-*`/`lcs-*` contracts in `LibraryFinder.test.tsx` /
# `LibraryCategoryShelf.test.tsx` stay byte-green. `lifecycleOf` is imported from `@storytree/library` (already
# a studio dependency via the `library-lifecycle-wire` sibling); `GuidanceAsset.status?` is the additive
# plan-lifecycle mirror. real.sourceFile picks ONE representative (LibraryFinder.tsx); real.scope.sourceGlobs
# names the reworked component + the reworked pure heart (libraryShelf.ts) + the additive types.ts (the
# multi-sourceGlob precedent from library-category-shelf). real.testFile is a NET-NEW
# `LibraryLifecycleShelf.test.tsx` driving the toggle/count/chip behaviour in jsdom.
# The RED the spine observes is a FAILING-ASSERTION red (LibraryFinder.tsx exists — NOT module-not-found): at
# HEAD the shelf shows one flat count and no toggle / no state chips, so the lifecycle test fails.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the BEHAVIOUR ONLY — the toggle default (Active),
# the live open+active counts + muted total, the All-mode totals, the Decisions group-only count, the scoped
# per-kind state chips using each kind's stored vocabulary, the chip-click scoped-list filter, and the
# Active-mode scoped-browse filter. The toggle's APPEARANCE (its styling, the state-chip look) is the story's
# operator-attested UAT leg (ADR-0196 D3, ADR-0070) — do NOT author a visual/colour/pixel/animation assertion
# here, and do NOT edit `TreeView.tsx` in this `real:` scope (the finder mount is the orchestrator's supplement
# glue after PASS — plan §G).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this cap
# declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio). install: true
# (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lls-`-named contract test lives
# in LibraryLifecycleShelf.test.tsx. Its TITLE must carry the unique `lls-` id or coverage silently drops
# N-1/N past the signed green (`sdk-leaf-drops-contract-id-test-names` — this arc's recurring class; the fix if
# it happens is TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryLifecycleShelf.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryFinder.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/LibraryLifecycleShelf.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibraryFinder.tsx"
        - "apps/studio/src/lib/libraryShelf.ts"
        - "apps/studio/src/types.ts"
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
        - "src/components/LibraryLifecycleShelf.test.tsx"
---

# The lifecycle shelf — an Active | All toggle, live counts, and per-kind state chips over the corpus

**Outcome —** The finder gains an **Active | All** lifecycle toggle, DEFAULT **Active** (ADR-0196 D3). In ACTIVE
mode each category shelf row shows the count of `open`+`active` items — computed via `lifecycleOf` from
`@storytree/library` (already a studio dependency) over each asset's lifecycle-bearing fields (friction
`fields.route`, plan wire `status`, ADR `DocMeta.status`) — with the muted TOTAL shown alongside when it differs
(the "2 of 38" presentation); ALL mode shows plain totals. The Decisions shelf row counts ONLY
`group === 'Decisions'` docs (the count-bug fix, 223 → 191). When SCOPED into a stateful category, per-kind
STATE CHIPS render using the kind's OWN stored vocabulary — friction: open/routed/archived (from `route`);
Decisions: proposed/accepted/superseded; plan: projected open/active/archived — each chip FILTERING the scoped
browse list; kinds without state get no chips. The toggle also filters scoped browse lists in Active mode.
`GuidanceAsset` (`apps/studio/src/types.ts`) gains the optional `status?: string` plan-lifecycle mirror
(additive). The toggle/count/chip BEHAVIOUR is machine-witnessed; the toggle styling and the chip look are the
story's operator-attested UAT leg.

**Depends on —** [`library-category-shelf`](library-category-shelf.md), [`library-lifecycle-wire`](library-lifecycle-wire.md).
This capability REWORKS the landed inc-9 finder + shelf heart (`LibraryFinder.tsx` / `libraryShelf.ts`) — it adds
the Active|All toggle, the live/total counts, the Decisions count-bug fix, and the scoped per-kind state chips
around the existing category-shelf browse/scope path, so it needs the delivered category shelf as its
precondition (`depends_on: [library-category-shelf]`). It CONSUMES `lifecycleOf` from `@storytree/library` to
project each item's lifecycle and it reads the plan-lifecycle `status` the wire cap crossed onto `GuidanceAsset`,
so it needs the delivered projection + wire as its precondition (`depends_on: [library-lifecycle-wire]`). It
holds no backend seam — the toggle, counts, and chips read only the loaded corpus already handed in as props
(`assets`/`docs`), so it is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, BROWNFIELD re-author (editsExisting).** `LibraryFinder.tsx` /
> `libraryShelf.ts` EXIST and are green at HEAD on their category-shelf browse/scope path (the `lf-*`/`lcs-*`
> contracts; one flat count per row, no toggle, no state chips). This capability reworks them: a NET-NEW vitest
> jsdom test (`LibraryLifecycleShelf.test.tsx`) drives the Active-default toggle, the live open+active counts +
> muted total, the All-mode totals, the Decisions group-only count, the scoped per-kind state chips, and the
> chip/toggle filtering — RED at HEAD as a FAILING-ASSERTION red (the toggle/state-chip behaviour is absent),
> GREEN once the finder/heart are reworked and `GuidanceAsset.status?` added. Its BEHAVIOUR is machine-witnessed;
> its APPEARANCE (the toggle styling, the state-chip look) is the story's operator-attested UAT leg (ADR-0070).
> Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the LIFECYCLE-AWARE SHELF AS A WHOLE — a
behavioural rework that (a) adds an Active|All toggle defaulting to Active, (b) counts live (`open`+`active`)
items per row via `lifecycleOf` with the muted total beside it, (c) fixes the Decisions count to the
`group === 'Decisions'` subset, (d) renders per-kind state chips from each stateful kind's OWN stored vocabulary
when scoped, and (e) filters the scoped browse list by chip and by the Active toggle — spanning the pure count
heart, the toggle state machine, the projection consumption, and the scoped chip render/filter, exercised in
jsdom. It is the DRAW half of ADR-0196 D3; the pure projection + the plan-`status` wire it consumes are the
sibling `library-lifecycle-wire`.

CONSUME `lifecycleOf` FROM `@storytree/library` — DO NOT RE-DERIVE THE MAPPING (ADR-0196 D4). The projection is
the SINGLE home of the open/active/archived mapping (D4: "any new stateful kind MUST route through it — a second
ad-hoc status surface is the failure mode this ADR exists to end"). Import `lifecycleOf` from `@storytree/library`
(the root barrel, already a studio dependency) and call it over each item's lifecycle-bearing fields: for an
asset, `lifecycleOf(asset.category, { route: asset.fields?.route, status: asset.status })` (friction's `route`
rides `fields`; a plan's `status` rides the wire mirror the sibling cap crossed); for an ADR doc,
`lifecycleOf('adr', { status: doc.status })`. Do NOT hand-roll a category→state map in the studio — the whole
point of D4 is one mapping. Add the additive optional `status?: string` to `GuidanceAsset` (`types.ts`) so the
plan-lifecycle mirror the wire cap serializes has a typed home (back-compat: optional / absent-by-default, the
`stepRefs?`/`arcRef?` idiom).

THE TOGGLE DEFAULTS TO ACTIVE; ACTIVE ROWS COUNT `open`+`active`, WITH THE TOTAL MUTED WHEN IT DIFFERS. The
finder renders an Active | All toggle (component-local state, like `query`/`scope`), DEFAULT Active. In Active
mode each shelf row shows the count of items whose `lifecycleOf` is `open` OR `active` (the live worklist +
load-bearing set); when that live count differs from the row's total, the total renders muted alongside (the
"2 of 38" presentation — assert BOTH numbers present when they differ, and that only the single number shows
when they are equal). In All mode each row shows the plain total. The pure count heart lives in `libraryShelf.ts`
(reworked): keep the existing `count` (the TOTAL — so the `lcs-*` assertions that read `entry.count === docs.length`
stay byte-green, see the FENCE) and ADD a live count (e.g. `liveCount`) computed via `lifecycleOf`. Pin the
Active-default + live/total presentation in `lls-toggle-defaults-active-and-counts-live`, the All-mode totals in
`lls-all-mode-shows-totals`.

THE DECISIONS ROW COUNTS ONLY THE `group === 'Decisions'` DOCS (the count-bug fix). Today `buildCategoryShelf`
counts `docs.length` (every doc under `docs/`, 223) for the Decisions row; ADR-0196 D3 fixes it to count only
`docs` with `group === 'Decisions'` (the 191 real ADRs) — like `Library.tsx` already does. Rework the Decisions
entry's TOTAL to `docs.filter((d) => d.group === 'Decisions').length`. This is SAFE for the signed `lcs-*`
fixtures — they all carry `group: 'Decisions'`, so `docs.filter(...).length === docs.length` on their corpus and
`lcs-shelf-groups-corpus-by-category` stays byte-green (see the FENCE). Pin the fix in
`lls-decisions-row-counts-decisions-group-only`.

SCOPED INTO A STATEFUL CATEGORY, PER-KIND STATE CHIPS RENDER USING THE KIND'S OWN STORED VOCABULARY. When the
finder is scoped into a category that HAS a stored state vocabulary, render a row of state chips ABOVE the scoped
browse list, using that kind's OWN vocabulary (NOT the universal triad — ADR-0196 Consequences: the shelf copy
presents kind-local detail, "where it went", not the collapsed lifecycle): friction → open / routed / archived
(derived from each item's `route`: no route = open, `nothing` = archived, any other route = routed); Decisions →
proposed / accepted / superseded (from `DocMeta.status`); plan → open / active / archived (the PROJECTED triad,
since plan's stored five-state enum has no shorter kind-local spelling — the projection IS its display detail).
A kind WITHOUT a stored state (definition, principle, arc, …) renders NO chips. Give each chip a DISTINCT testid
(e.g. `library-state-chip-<state>`), NOT the shelf-row or result-row prefix (the FENCE that keeps `lcs-*`/`lf-*`
byte-green). Pin the per-kind chips in `lls-scoped-state-chips-use-kind-vocabulary`.

A STATE CHIP CLICK FILTERS THE SCOPED BROWSE LIST; THE ACTIVE TOGGLE ALSO FILTERS IT. Clicking a state chip
filters the scoped browse list to the items in that state (friction routed → only `route`-set-non-`nothing`
items; Decisions accepted → only `status: 'accepted'` docs; plan active → only `status: 'ready'` plans). And in
Active mode the toggle itself filters the scoped browse list to `open`+`active` items (All mode shows every item
in the scope). Assert the chip-click filter and the Active-toggle scoped-browse filter separately. Pin the chip
filter in `lls-chip-click-filters-scoped-list`, the toggle filter in `lls-active-toggle-filters-scoped-browse`.

FENCE — THE SIGNED `lf-*` AND `lcs-*` CONTRACTS STAY BYTE-GREEN (do NOT disturb `LibraryFinder.test.tsx` /
`LibraryCategoryShelf.test.tsx`). Both signed test files are OUTSIDE this cap's `real.scope` (its `testGlobs` is
`LibraryLifecycleShelf.test.tsx` only), so the leaf CANNOT and MUST NOT edit them. The rework is ADDITIVE and the
existing observations are UNCHANGED, by construction:
- **The `lf-*` query path** — with a typed query and no scope the finder still ranks via `searchCorpus` and
  renders `library-finder-row-<id>` result rows exactly as before; the toggle/chips only affect the shelf +
  scoped-browse states, never the typed-query results list.
- **The `lcs-*` category-shelf path** — the idle shelf still renders one row per present category + a Decisions
  row, each with its testid, and the pure heart still returns an entry per category with a `count` field equal to
  the category's TOTAL. The reworked heart KEEPS `count` as the total (adding `liveCount` additively), so
  `lcs-shelf-groups-corpus-by-category`'s `entry.count === docs.length` still holds. The Decisions count-bug fix
  (`group === 'Decisions'`) is byte-safe on the `lcs-*` fixtures precisely because **every fixture doc carries
  `group: 'Decisions'`** — so `docs.filter((d) => d.group === 'Decisions').length === docs.length` on their
  corpus and the count is unchanged. The state chips carry a DISTINCT testid (`library-state-chip-*`), never the
  shelf-row / result-row prefix, so the `lcs-*` row-count and `lf-short-or-empty-query-yields-no-results`
  assertions are undisturbed. The Active default does not change what the signed tests observe: their fixtures
  carry NO `route`/`status` fields, so every fixture item projects to `active` (assets) / `open` (docs via adr
  status absent → the projection's `open`) — all LIVE — meaning the Active-mode live count equals the total and
  the muted total never appears for them. Keep the existing prop surface and all shelf/result/scope testids so
  both files stay green with ZERO edits. Do NOT rename or disturb the `lf-*` / `lcs-*` test titles.

REUSE THE EXISTING `SearchResult` AND `ShelfEntry` — DEFINE NO NEW WIRE TYPE. The state-chip filtering and the
scoped browse list lift the EXISTING `SearchResult` from `../lib/librarySearch`; the count heart returns the
EXISTING `ShelfEntry` from `../lib/libraryShelf` (extended additively with `liveCount`). The ONLY `types.ts`
change is the additive optional `GuidanceAsset.status?: string` (the plan-lifecycle mirror) — do NOT reshape any
other wire type.

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0196 D3 + ADR-0070). The toggle follows the map's
forest-cozy palette (the world's CSS variables, as the finder does), NOT neutral-admin white. The toggle
styling, the state-chip look, and the muted-total typography are WITHNESSED by the owner (the shared library-lens
attestation), never a machine visual verdict — do NOT author a visual/colour/pixel/animation assertion in this
cap's tests (assert the toggle default + the count numbers + the state-chip presence-by-kind + the chip/toggle
filtering, never their styling).

OFFLINE-TESTABLE IN JSDOM (the `LibraryCategoryShelf.test.tsx` discipline). `@vitest-environment jsdom`,
`@testing-library/react` for render / `fireEvent` (click the Active/All toggle, scope into a category, click a
state chip). No backend seam to mock — the finder takes `assets`/`docs`/`onSelect` as props and renders from the
loaded corpus. No real `fetch`, no socket, no DB, no Electron. The component imports `lifecycleOf` from
`@storytree/library` (a pure browser-safe barrel export — the `modelPathBoundary.test.ts` wall stays green, it
imports no agent/drive/model).

## Integration test

**Goal —** Prove the lifecycle-aware shelf: the Active|All toggle defaults to Active; Active rows count
`open`+`active` via `lifecycleOf` with the muted total beside them when it differs; All rows show plain totals;
the Decisions row counts only `group === 'Decisions'` docs; scoping into a stateful category renders per-kind
state chips from that kind's own vocabulary and a stateless kind renders none; a chip click and the Active toggle
each filter the scoped browse list — entirely in jsdom, driven by props — with the signed `lf-*`/`lcs-*` paths
byte-green.

The integration test exercises this capability against its own composition (no backend seam) — the reworked
count heart, the toggle state, the projection consumption, and the scoped chip render/filter are all real. It
would:

1. Render `<LibraryFinder assets={…} docs={…} onSelect={vi.fn()} />` over a fixed corpus mixing live and settled
   items (e.g. friction with and without `route`, plans with `status` draft/ready/consumed, ADR docs across
   statuses). Assert the toggle defaults to Active and each shelf row shows its `open`+`active` count, with the
   muted total beside a row whose live count differs from its total (and only the single number where they are
   equal).
2. `fireEvent.click` the All side of the toggle. Assert each row now shows its plain total (no muted split).
3. Assert the Decisions row's total counts only `group === 'Decisions'` docs (a corpus with a non-Decisions doc
   is excluded from the Decisions count).
4. Scope into `friction` (`fireEvent.click` its shelf row). Assert open/routed/archived state chips render (from
   each item's `route`); scope into `arc` (stateless) and assert NO state chips render.
5. Click a state chip (e.g. friction `routed`). Assert the scoped browse list filters to that state's items.
   Separately, in Active mode, assert the scoped browse list is filtered to `open`+`active` items (and All shows
   all).

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryLifecycleShelf.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract
id is the lead of a distinctly-named test, so the coverage check reports 6/6 against the ONE `real.testFile`.
None of these is an APPEARANCE assertion — the look (the toggle styling, the state-chip look, the muted-total
typography) is the story's operator-attested UAT leg (ADR-0070). The `lf-*`/`lcs-*` byte-green requirement is a
FENCE (above), not a contract.

1. **`lls-toggle-defaults-active-and-counts-live`** — the Active|All toggle defaults to Active; Active rows count open+active via lifecycleOf, with the muted total beside a row where it differs
   - **asserts —** with default state, the toggle reads Active and each shelf row shows the count of `open`+`active`
     items (via `lifecycleOf(@storytree/library)` over each item's lifecycle-bearing fields); a row whose live
     count differs from its total shows BOTH (the "2 of 38" muted-total presentation), and a row where they are
     equal shows the single number.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the toggle state + Active-mode row render) and
     `apps/studio/src/lib/libraryShelf.ts` (the live-count heart)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx` (net-new, vitest jsdom).
2. **`lls-all-mode-shows-totals`** — All mode shows each row's plain total (no live/muted split)
   - **asserts —** `fireEvent.click` on the All side of the toggle switches every shelf row to its plain total
     count, with no muted-total split.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the All-mode row render)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
3. **`lls-decisions-row-counts-decisions-group-only`** — the Decisions row counts only `group === 'Decisions'` docs (the 223→191 count-bug fix)
   - **asserts —** the Decisions shelf row's total counts only `docs` with `group === 'Decisions'` (a corpus
     containing a non-Decisions doc excludes it) — the `buildCategoryShelf` count-bug fix, mirroring
     `Library.tsx`.
   - **covers —** `apps/studio/src/lib/libraryShelf.ts` (the Decisions count filtered to the Decisions group)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
4. **`lls-scoped-state-chips-use-kind-vocabulary`** — scoped into a stateful category, per-kind state chips render using the kind's own stored vocabulary; a stateless kind renders none
   - **asserts —** scoping into `friction` renders open/routed/archived chips (from each item's `route`); scoping
     into Decisions renders proposed/accepted/superseded chips (from `DocMeta.status`); scoping into `plan`
     renders the projected open/active/archived chips; scoping into a stateless kind (e.g. `arc`) renders NO
     state chips. The chips carry a DISTINCT testid, never the shelf-row / result-row prefix (the fence).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the per-kind scoped state-chip render)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
5. **`lls-chip-click-filters-scoped-list`** — clicking a state chip filters the scoped browse list to that state
   - **asserts —** `fireEvent.click` on a state chip (e.g. friction `routed`) filters the scoped browse list to
     the items in that state (only `route`-set-non-`nothing` friction; only `accepted` Decisions; only the
     matching plans).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the state-chip → scoped-list filter)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
6. **`lls-active-toggle-filters-scoped-browse`** — in Active mode the toggle filters the scoped browse list to open+active; All shows every item in the scope
   - **asserts —** with a scope active and the toggle on Active, the scoped browse list shows only `open`+`active`
     items (via `lifecycleOf`); switching to All shows every item in the scope. The toggle filters the scoped
     browse, not only the shelf counts.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the Active-toggle scoped-browse filter)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): rework the signed category-shelf finder into
the lifecycle-aware shelf, test-first, with the `lf-*`/`lcs-*` paths byte-green.

- **The new test —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the `LibraryCategoryShelf.test.tsx` shape; NO real
  `fetch`/socket/DB/Electron). Import `{ LibraryFinder }` from `"./LibraryFinder"`, the count heart from
  `"../lib/libraryShelf"`, `import type { SearchResult } from "../lib/librarySearch"`, and the corpus fixtures —
  define NO new wire type. Name each test for its contract id (`lls-…`) so
  `storytree coverage library-lifecycle-shelf` reports 6/6 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (LibraryFinder.tsx exists — NOT
  module-not-found): at HEAD the shelf shows one flat `count` per row and no Active|All toggle / no state chips,
  so the toggle-default / live-count / Decisions-fix / state-chip assertions fail. This is the brownfield red the
  spine observes against the category-shelf finder at HEAD (ADR-0057).
- **The GREEN —** rework `apps/studio/src/lib/libraryShelf.ts` (add a `lifecycleOf`-computed live count to each
  `ShelfEntry`, keeping `count` as the total; fix the Decisions total to `group === 'Decisions'`), add the
  additive `GuidanceAsset.status?: string` to `apps/studio/src/types.ts`, and rework
  `apps/studio/src/components/LibraryFinder.tsx`: add the Active|All toggle (component-local, default Active);
  render Active rows with the live count + muted total (when it differs) and All rows with the total; render
  per-kind state chips (from each stateful kind's stored vocabulary) above the scoped browse list; filter the
  scoped browse list on chip click and on the Active toggle. Keep the existing `assets`/`docs`/`onSelect`/
  `selectedId` prop surface, the `library-finder-row-<id>` / shelf-row / scope-chip testids, and the `count`
  total so `LibraryFinder.test.tsx` and `LibraryCategoryShelf.test.tsx` (OUTSIDE this `real.scope`) stay
  byte-green with zero edits. WIRING the finder's mount into `TreeView.tsx` and the forest-cozy appearance are
  witnessed under the story's operator-attested UAT leg (ADR-0070), NOT asserted in CI and NOT in this `real:`
  scope. After it, the new test's assertions hold and `pnpm --filter studio test` + `pnpm --filter studio
  typecheck` stay green.

Rules:

- **Consume `lifecycleOf` from `@storytree/library` — do not re-derive the mapping** (ADR-0196 D4,
  `lls-toggle-defaults-active-and-counts-live`) — call it over each item's lifecycle-bearing fields; the additive
  `GuidanceAsset.status?` is the plan-lifecycle mirror's typed home.
- **The toggle defaults to Active; Active rows count open+active with the muted total when it differs; All shows
  totals** (`lls-toggle-defaults-active-and-counts-live`, `lls-all-mode-shows-totals`).
- **The Decisions row counts only the `group === 'Decisions'` docs** (`lls-decisions-row-counts-decisions-group-only`,
  the 223→191 count-bug fix) — byte-safe on the `lcs-*` fixtures (all carry `group: 'Decisions'`).
- **Scoped state chips use each kind's OWN stored vocabulary; stateless kinds get none**
  (`lls-scoped-state-chips-use-kind-vocabulary`) — friction open/routed/archived, Decisions
  proposed/accepted/superseded, plan projected open/active/archived; distinct testid.
- **A chip click and the Active toggle each filter the scoped browse list** (`lls-chip-click-filters-scoped-list`,
  `lls-active-toggle-filters-scoped-browse`).
- **The signed `lf-*`/`lcs-*` contracts stay byte-green** — additive around the existing paths; keep `count` as
  the total, the state chips carry a distinct testid, and the Decisions fix is byte-safe on their all-Decisions
  fixtures; do NOT edit `LibraryFinder.test.tsx` / `LibraryCategoryShelf.test.tsx` (outside this `real.scope`) or
  disturb the `lf-*`/`lcs-*` titles.
- **Reuse the existing `SearchResult`/`ShelfEntry`; the only `types.ts` change is the additive
  `GuidanceAsset.status?`** — define no new wire type.
- **Appearance is operator-attested, not asserted here** (ADR-0196 D3 / ADR-0070) — prove the toggle/count/chip
  behaviour; the toggle styling, the state-chip look, and the muted-total typography are the shared library-lens
  look leg. Do NOT author a visual verdict, and do NOT edit `TreeView.tsx` in the `real:` scope (the mount is the
  orchestrator's supplement glue after PASS — plan §G).
- **Every `lls-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, this arc's recurring class — the fix if it happens is
  TEST-TITLE-ONLY, never an assertion/source edit).
