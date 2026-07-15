---
id: "library-lifecycle-shelf"
tier: capability
story: library-tech-tree-overlay
title: "The Library panel carries ONE three-state lifecycle selector (open | active | archived, DEFAULT open) and the selected state governs the whole panel: the shelf renders only categories with ≥1 item in the state (plain per-state count, 'N of M' retired), scoped browse filters to the state uniformly for every kind, and a typed search's results filter to the state (assets + Decisions); the per-kind state chips retire; empty states are one quiet line — the surviving lf-*/lcs- blocks stay byte-green, the re-tensed ones are trimmed before the build (ADR-0197 D5)"
outcome: "The Library panel carries exactly ONE lifecycle control — a three-state selector `open | active | archived`, exactly one state selected, DEFAULT `open` (the needs-attention inbox) — and the selected state governs everything the panel shows (ADR-0197). SHELF: one row per category with ≥1 item projecting (via `lifecycleOf` from `@storytree/library`) to the selected state, its count the plain per-state number (the ADR-0196 'N of M' muted-total presentation RETIRES); a category with zero items in the state does not render; the Decisions row counts only `group === 'Decisions'` docs (the 223→191 fix stands). SCOPED BROWSE: the scoped category's items filtered to the selected state — uniformly for every kind (the ADR-0196 friction/Decisions chips-only exception retires with the chips). SEARCH: `searchCorpus` results filtered to the selected state before rendering, assets and Decisions alike. The per-kind STATE CHIPS retire (ADR-0197 D3 — one control, one vocabulary); friction's routed/fixed distinction stays readable as per-row `route` detail. Empty states are quiet (ADR-0197 D4): an all-empty `open` shelf renders one line, an empty scoped/search result names the selected state in one line. No `types.ts` change this time (`GuidanceAsset.status?` already landed at #731). The selector geometry/behaviour is machine-witnessed; the selector's appearance ('nice looking') and the muted-total/typography are the story's operator-attested UAT leg (ADR-0070)."
status: proposed
proof_mode: integration-test
depends_on: [library-category-shelf, library-lifecycle-wire]
decisions: [197, 196, 188, 183, 70, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true) — this RE-PROVES the finder
# surface a second time in two days (the inc-12 `library-top-drawer` re-prove precedent): ADR-0197 (owner-directed
# at the #731 walk, amends ADR-0196 D3) replaces the landed Active|All two-state toggle + per-kind state chips +
# "N of M" muted totals with ONE three-state selector (open|active|archived, DEFAULT open) that governs the shelf
# categories, the scoped browse, AND the typed search uniformly. It reworks the signed inc-13 finder
# (`apps/studio/src/components/LibraryFinder.tsx`, green at #731 with its ADR-0196 `lls-*` contracts) and the pure
# count heart `apps/studio/src/lib/libraryShelf.ts` (add per-state counts; keep `count` as the total for the
# surviving `lcs-*` pure test). The rework is ADDITIVE around the EXISTING shelf/scope/search path but it CHANGES
# what the panel renders by default, so — unlike the inc-9/inc-13 additive reworks — it genuinely RE-TENSES a
# handful of signed `lf-*`/`lcs-*` component blocks whose fixtures project `active` (durable kinds) and so become
# unobservable under the default `open` state. Per ADR-0197 D5 (the inc-10/inc-12 reconciliation ceremony):
# story-author records the retire/re-home notes on `library-finder.md` + `library-category-shelf.md`, the
# ORCHESTRATOR trims those re-tensed blocks as mechanical glue committed BEFORE this `--real` build, and the
# surviving behaviours re-prove under the reworked `lls-*` v2 contracts here. The leaf NEVER edits
# `LibraryFinder.test.tsx` / `LibraryCategoryShelf.test.tsx` (both OUTSIDE this cap's `real.scope`).
# real.sourceFile picks ONE representative (LibraryFinder.tsx); real.scope.sourceGlobs names the reworked
# component + the reworked pure heart (libraryShelf.ts) — types.ts is DROPPED (no wire change this time;
# `GuidanceAsset.status?` already landed at #731). real.testFile is the SAME NET-NEW
# `LibraryLifecycleShelf.test.tsx`, its contract set REPLACED by the v2 `lls-*` selector contracts.
# The RED the spine observes is a FAILING-ASSERTION red (LibraryFinder.tsx exists — NOT module-not-found): at
# HEAD (post-#731) the finder renders the Active|All toggle + per-kind state chips + the "N of M" muted totals, so
# the v2 selector assertions (a three-state open-default selector, hidden-empty categories, plain per-state
# counts, no chips, quiet empty states) fail.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the BEHAVIOUR ONLY — the selector's three-state
# geometry + open default, the state governing which categories render (≥1 in state) with a plain per-state count,
# the state governing the scoped browse uniformly for every kind, the state filtering the typed search (assets +
# Decisions), the retirement of the per-kind state chips, and the quiet empty states. The selector's APPEARANCE
# (its "nice looking" segmented styling, the muted-total typography, the empty-state copy's look) is the story's
# operator-attested UAT leg (ADR-0197 D1, ADR-0070) — do NOT author a visual/colour/pixel/animation assertion
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

# The lifecycle shelf — ONE three-state selector (open | active | archived, default open) governs the whole panel

**Outcome —** The Library panel carries exactly ONE lifecycle control — a three-state selector
`open | active | archived`, exactly one state selected, DEFAULT `open` (the panel opens as the
needs-attention inbox) — and the selected state governs everything the panel shows (ADR-0197). **Shelf:** one
row per category with ≥1 item projecting (via `lifecycleOf` from `@storytree/library`) to the selected state,
its count the plain per-state number — the ADR-0196 D3 "N of M" muted-total presentation RETIRES; a category
with zero items in the state does not render; the Decisions row counts only `group === 'Decisions'` docs (the
223→191 fix stands). **Scoped browse:** the scoped category's items filtered to the selected state — uniformly
for every kind (the ADR-0196 friction/Decisions chips-only exception retires with the chips). **Search:**
`searchCorpus` results filtered to the selected state before rendering, assets and Decisions alike. The per-kind
STATE CHIPS retire (ADR-0197 D3 — one control, one vocabulary; friction's routed/fixed distinction stays
readable as per-row `route` detail text). Empty states are quiet (ADR-0197 D4): an all-empty `open` shelf renders
one line, an empty scoped/search result names the selected state in one line. There is NO `types.ts` change this
time — `GuidanceAsset.status?` already landed at #731. The selector's geometry/behaviour is machine-witnessed;
its appearance ("nice looking") and the empty-state/typography look are the story's operator-attested UAT leg.

**Depends on —** [`library-category-shelf`](library-category-shelf.md), [`library-lifecycle-wire`](library-lifecycle-wire.md).
This capability RE-PROVES the finder surface a second time (the inc-12 `library-top-drawer` re-prove precedent):
ADR-0197 replaces the landed inc-13 Active|All toggle + per-kind chips + "N of M" totals with the single
three-state selector. It reworks the same delivered category-shelf finder (`LibraryFinder.tsx` / `libraryShelf.ts`)
around the existing shelf/scope/search path, so it needs that surface as its precondition
(`depends_on: [library-category-shelf]`). It CONSUMES `lifecycleOf` from `@storytree/library` to project each
item's lifecycle and reads the plan-lifecycle `status` the wire cap crossed onto `GuidanceAsset` (already landed),
so it needs the delivered projection + wire (`depends_on: [library-lifecycle-wire]`). It holds no backend seam —
the selector, counts, browse, and search read only the loaded corpus already handed in as props (`assets`/`docs`),
so it is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, BROWNFIELD re-prove (editsExisting).** `LibraryFinder.tsx` /
> `libraryShelf.ts` EXIST and are green at HEAD (post-#731) on their ADR-0196 `lls-*` path — the Active|All
> two-state toggle, the per-kind state chips, the "N of M" muted totals. ADR-0197 (owner-directed at the #731
> walk, amends ADR-0196 D3) reworks them to ONE three-state selector (open|active|archived, default open) that
> governs the shelf, the scoped browse, and the typed search. A NET-NEW-shaped but SAME-named vitest jsdom test
> (`LibraryLifecycleShelf.test.tsx`, its contract set REPLACED by the v2 `lls-*` selector contracts) drives the
> selector default, the state-governed shelf (hidden-empty categories, plain per-state counts), the
> state-filtered scoped browse, the state-filtered search, the retired chips, and the quiet empty states — RED at
> HEAD as a FAILING-ASSERTION red (the landed finder shows Active|All + chips + "N of M", so the selector
> assertions fail), GREEN once the finder/heart are reworked. Its BEHAVIOUR is machine-witnessed; its APPEARANCE
> (the selector styling, the empty-state look, the muted-total-gone typography) is the story's operator-attested
> UAT leg (ADR-0070). Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020),
> never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the ONE-SELECTOR-GOVERNS-THE-PANEL model AS A
WHOLE — a behavioural re-prove that (a) replaces the two-state toggle with a three-state open|active|archived
selector defaulting to open, (b) renders only the categories with ≥1 item in the selected state, each with a
plain per-state count (retiring "N of M"), (c) filters the scoped browse to the selected state uniformly for
every kind, (d) filters the typed search to the selected state (assets + Decisions), (e) retires the per-kind
state chips, and (f) shows quiet one-line empty states — spanning the pure per-state count heart, the selector
state machine, the projection consumption, and the state-governed shelf/browse/search render, exercised in
jsdom. It is the ADR-0197 execution of the DRAW half; the pure projection + the plan-`status` wire it consumes
are the sibling `library-lifecycle-wire`, already delivered.

CONSUME `lifecycleOf` FROM `@storytree/library` — DO NOT RE-DERIVE THE MAPPING (ADR-0196 D4, still binding).
The projection is the SINGLE home of the open/active/archived mapping. Import `lifecycleOf` from
`@storytree/library` (the root barrel, already a studio dependency via `library-lifecycle-wire`) and call it over
each item's lifecycle-bearing fields: for an asset,
`lifecycleOf(asset.category, { route: asset.fields?.route, status: asset.status })` (friction's `route` rides
`fields`; a plan's `status` rides the wire mirror already landed on `GuidanceAsset`); for an ADR doc,
`lifecycleOf('adr', { status: doc.status })`. Do NOT hand-roll a category→state map in the studio. `GuidanceAsset.status?`
is ALREADY on the wire (#731) — there is NO `types.ts` change in this cap.

THE SELECTOR IS ONE THREE-STATE CONTROL, DEFAULT `open`. The finder renders a single segmented selector with
exactly three states — `open`, `active`, `archived` — exactly one selected, DEFAULT `open` (component-local
state, like `query`/`scope`). It REPLACES the ADR-0196 Active|All two-state toggle. Give each state a distinct
testid (e.g. `library-lifecycle-selector-open` / `-active` / `-archived`) carrying an `aria-pressed` reflecting
the current selection. Pin the default + the exclusive three-state geometry in
`lls-selector-defaults-open-and-hides-empty-categories`, and the re-derivation on switch in
`lls-state-switch-rederives-shelf`. Do NOT keep the `library-lifecycle-toggle-active` / `-toggle-all` testids
(they retire with the two-state toggle).

THE SELECTED STATE GOVERNS THE SHELF: ONLY CATEGORIES WITH ≥1 ITEM IN THE STATE RENDER, EACH WITH A PLAIN
PER-STATE COUNT. For the selected state, the shelf renders one row per category that has ≥1 item projecting (via
`lifecycleOf`) to that state; the row's count is that state's plain count (a single number — the "N of M"
muted-total presentation is GONE, ADR-0197 D2). A category with zero items in the selected state does NOT render.
The pure count heart lives in `libraryShelf.ts` (reworked): keep the existing `count` (the TOTAL — so the
surviving `lcs-*` pure test that reads `entry.count === docs.length` stays byte-green, see the FENCE) and ADD the
per-state counts (e.g. an `openCount`/`activeCount`/`archivedCount`, or a `stateCounts` map, computed via
`lifecycleOf`) so the component can pick the selected state's count and hide zero-count categories. The Decisions
row's per-state count still counts ONLY `group === 'Decisions'` docs (the 223→191 fix stands, byte-safe on the
all-Decisions `lcs-*` fixtures). Do NOT render a `library-shelf-row-muted-total` / `library-shelf-row-primary-count`
split (both retire). Pin the state-governed shelf + hidden-empty categories + plain count in
`lls-selector-defaults-open-and-hides-empty-categories`; pin the recompute across states in
`lls-state-switch-rederives-shelf`.

THE SELECTED STATE GOVERNS THE SCOPED BROWSE — UNIFORMLY FOR EVERY KIND. When scoped into a category, the browse
list shows that category's items filtered to the selected state (via `lifecycleOf`) — the SAME rule for every
kind (the ADR-0196 D3 friction/Decisions chips-only exception RETIRES with the chips, ADR-0197 D2/D3). Under
`open` a plan scope browses only its open plans; under `active`, only its active plans; under `archived`, only
its archived ones. The scope-chip transition (`library-scope-chip` / `library-scope-chip-remove`) and the browse
rows (`library-finder-row-<id>`) keep their testids. A browse/search row click still lifts `onSelect(result)`
with the finder-parity `SearchResult` — UNCHANGED (this re-homes the retired `lcs-scoped-row-click-lifts-searchresult`
and `lf-click-invokes-onselect-and-marks-selection`). Pin the state-filtered scoped browse + the `onSelect` lift
in `lls-selector-filters-scoped-browse`.

THE SELECTED STATE GOVERNS THE TYPED SEARCH — ASSETS AND DECISIONS ALIKE. A typed query still runs
`searchCorpus(query, assets, docs)`, but its results are FILTERED to the selected state (via `lifecycleOf`)
before rendering — for assets AND Decisions (ADR-0197 D2). Under default `open`, a query that matches an `open`
item and an `active` item surfaces ONLY the `open` result; switching the selector to `active` surfaces the
`active` one (this is the acknowledged ADR-0197 tradeoff — the durable corpus is hidden until the user flips
state, softened by the D4 hint line). Each in-state result row still renders its title + a `kindLabel` kind
sub-line (an `arc` reads "epic", never the raw key — trap j preserved), and an in-state ADR result still shows
its status (this re-homes the retired `lf-result-renders-title-and-kind-subline-via-kindLabel` and
`lf-adr-result-shows-status`). Pin the state-filtered search + the re-homed subline/status rendering in
`lls-selector-filters-search`.

THE PER-KIND STATE CHIPS RETIRE (one control, one vocabulary — ADR-0197 D3). Scoping into ANY kind renders NO
per-kind state chips — the `library-state-chip-<state>` testids no longer render (the absent-renders-nothing
idiom). The single selector is now the only state vocabulary; friction's routed-vs-nothing distinction stays
readable as per-row `route` detail text on the browse rows, not as a second chip axis, and Decisions'
proposed/accepted/superseded maps 1:1 onto the triad the selector already expresses. Pin the retirement in
`lls-state-chips-retired`.

QUIET, HONEST EMPTY STATES (ADR-0197 D4). When NO item projects to the selected state (an all-empty `open`
shelf), the panel renders a single quiet line (e.g. "nothing needs attention") and NO shelf rows. An empty
scoped/search result names the selected state in ONE line (e.g. "no open matches — switch state") so a search
that misses because of the state filter is explicable at a glance. Give the empty line a stable testid (e.g.
`library-empty-state`). No further chrome. Pin the quiet empties in `lls-quiet-empty-states`.

FENCE — THE SURVIVING `lf-*`/`lcs-*` BLOCKS STAY BYTE-GREEN; THE RE-TENSED ONES ARE TRIMMED BY THE ORCHESTRATOR
BEFORE THIS BUILD (ADR-0197 D5). This is the ONE place the byte-green fence changes from the additive inc-9/inc-13
reworks: ADR-0197 changes what the panel renders BY DEFAULT, so a handful of signed `lf-*`/`lcs-*` COMPONENT
blocks — whose fixtures carry durable-kind assets that project `active` and so become unobservable under the
default `open` state — genuinely re-tense. The leaf does NOT touch either test file (both OUTSIDE this cap's
`real.scope` — its `testGlobs` is `LibraryLifecycleShelf.test.tsx` only). The ORCHESTRATOR trims the re-tensed
blocks as mechanical glue committed BEFORE this `--real` build (D5, the inc-10/inc-12 precedent). The precise
survive/trim split is recorded in the reconciliation notes on `library-finder.md` and `library-category-shelf.md`.
In summary:
- **SURVIVES byte-green (leaf must keep the finder's behaviour so these still hold):** the pure `searchCorpus`
  blocks in `LibraryFinder.test.tsx` (`searchCorpus` describe — unchanged pure ranking, no state filter applies
  to the pure function); `lf-short-or-empty-query-yields-no-results` (component side — asserts ZERO
  `library-finder-row-` rows under an empty query; still true because the idle state renders shelf rows with a
  DISTINCT testid, never the result-row prefix); and the pure `lcs-shelf-groups-corpus-by-category` blocks in
  `LibraryCategoryShelf.test.tsx` (`buildCategoryShelf` still returns one entry per present category with `count`
  as the TOTAL, and `listCategoryResults` still lists all of a category — the pure heart does NO state filtering).
  KEEP `count` as the total, keep `library-finder-row-<id>` / `library-shelf-row-<category>` /
  `library-shelf-decisions-row` / `library-scope-chip` testids, and keep the pure `buildCategoryShelf` /
  `listCategoryResults` signatures so these survive with ZERO edits.
- **TRIMMED by the orchestrator (re-tensed; re-proven under the `lls-*` v2 contracts here):** the component-side
  `lf-*` blocks (`lf-result-renders-title-and-kind-subline-via-kindLabel`, `lf-adr-result-shows-status`,
  `lf-click-invokes-onselect-and-marks-selection`) and the whole `LibraryFinder — idle shelf + scoped browse/search`
  describe block of `lcs-*` component tests (`lcs-idle-renders-category-shelf`,
  `lcs-category-click-scopes-and-lists-all` ×2, `lcs-scoped-typing-filters-within-scope`,
  `lcs-clear-chip-returns-to-shelf`, `lcs-scoped-row-click-lifts-searchresult`). See the neighbour specs' notes.

REUSE THE EXISTING `SearchResult` AND `ShelfEntry` — DEFINE NO NEW WIRE TYPE. The state-filtered browse/search
lift the EXISTING `SearchResult` from `../lib/librarySearch`; the count heart returns the EXISTING `ShelfEntry`
from `../lib/libraryShelf`, extended additively with the per-state counts. There is NO `types.ts` change in this
cap (`GuidanceAsset.status?` landed at #731) — do NOT reshape any wire type.

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0197 D1 + ADR-0070). The selector follows the map's
forest-cozy palette (the world's CSS variables), NOT neutral-admin white. Its "nice looking" segmented styling,
the empty-state copy's look, and the now-absent muted-total typography are WITHNESSED by the owner (the shared
library-lens attestation), never a machine visual verdict — do NOT author a visual/colour/pixel/animation
assertion in this cap's tests (assert the selector default + state geometry, the state-governed row presence +
plain counts, the state-filtered browse/search, the absent chips, and the empty-state text, never their styling).

OFFLINE-TESTABLE IN JSDOM (the `LibraryCategoryShelf.test.tsx` discipline). `@vitest-environment jsdom`,
`@testing-library/react` for render / `fireEvent` (click a selector state, scope into a category, type a query).
No backend seam to mock — the finder takes `assets`/`docs`/`onSelect` as props and renders from the loaded
corpus. No real `fetch`, no socket, no DB, no Electron. The component imports `lifecycleOf` from
`@storytree/library` (a pure browser-safe barrel export — the `modelPathBoundary.test.ts` wall stays green, it
imports no agent/drive/model).

## Integration test

**Goal —** Prove the one-selector-governs-the-panel model: the three-state selector defaults to `open`; the shelf
renders only categories with ≥1 item in the selected state, each with a plain per-state count (no "N of M");
switching the selector re-derives the shelf; the scoped browse filters to the selected state uniformly for every
kind; a typed search filters to the selected state (assets + Decisions), each in-state result rendering its title
+ `kindLabel` sub-line and an ADR result its status; scoping into any kind renders NO per-kind state chips; and
empty states are one quiet line — entirely in jsdom, driven by props — with the surviving `lf-*`/`lcs-*` blocks
byte-green (the re-tensed ones trimmed before the build, ADR-0197 D5).

The integration test exercises this capability against its own composition (no backend seam) — the reworked
per-state count heart, the selector state, the projection consumption, and the state-governed shelf/browse/search
are all real. It would:

1. Render `<LibraryFinder assets={…} docs={…} onSelect={vi.fn()} />` over a fixed corpus mixing states (e.g.
   friction with/without `route`, plans with `status` draft/ready/consumed/retired, ADR docs across statuses, a
   stateless durable asset, plus a non-Decisions doc). Assert the selector defaults to `open` (its
   `aria-pressed`), that the shelf renders one row per category with ≥1 `open` item with its plain per-state
   count, that a category with zero `open` items does NOT render, that the Decisions row counts only
   `group === 'Decisions'` docs, and that NO muted-total split is present.
2. `fireEvent.click` the `active` state (then `archived`). Assert the shelf re-derives — rows appear/disappear by
   whether the category has ≥1 item in the newly-selected state, and each count is that state's plain number.
3. Scope into a stateful category (`fireEvent.click` its shelf row). Assert the browse list shows only the
   scoped category's items in the selected state (uniformly — no per-kind chips), switching state re-filters the
   browse, and a browse row click lifts `onSelect` with the finder-parity `SearchResult`.
4. Type a query. Assert `searchCorpus` results are filtered to the selected state (an `active` asset is hidden
   under default `open`, surfaced after switching to `active`); assert an in-state result renders its title + a
   `kindLabel` sub-line (an `arc` reads "epic") and an in-state ADR result shows its status.
5. Assert scoping into any kind renders NO `library-state-chip-*`; and assert the quiet empty states — an
   all-`open`-empty shelf renders one line, an empty scoped/search result names the selected state in one line.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryLifecycleShelf.test.tsx`). This v2 set REPLACES the ADR-0196 `lls-*` contracts
(the two-state toggle / per-kind chips / "N of M") that #731 signed. Per ADR-0122 (`storytree coverage`) each
contract id is the lead of a distinctly-named test, so the coverage check reports 6/6 against the ONE
`real.testFile`. None of these is an APPEARANCE assertion — the look (the selector styling, the empty-state copy,
the now-absent muted-total typography) is the story's operator-attested UAT leg (ADR-0070). The
survive/trim split of the neighbour `lf-*`/`lcs-*` blocks is a FENCE (above) + the neighbour reconciliation notes,
not a contract.

1. **`lls-selector-defaults-open-and-hides-empty-categories`** — the three-state selector defaults to `open`; the shelf renders only categories with ≥1 item in the state, each with a plain per-state count (no "N of M"); the Decisions row counts only `group === 'Decisions'` docs
   - **asserts —** on default render, the selector reads `open` (its `aria-pressed` true, `active`/`archived`
     false); the pure `buildCategoryShelf` yields per-state counts alongside the existing total `count`; and the
     shelf renders one row per category with ≥1 `open` item, each showing its plain per-state count (a single
     number — NO `library-shelf-row-muted-total` split), while a category with zero `open` items does NOT render.
     The Decisions row's count counts only `group === 'Decisions'` docs (a non-Decisions doc excluded — the
     223→191 fix stands).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the selector state + the state-governed shelf
     render) and `apps/studio/src/lib/libraryShelf.ts` (the per-state count heart + the group-filtered Decisions count)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx` (net-new-shaped, vitest jsdom).
2. **`lls-state-switch-rederives-shelf`** — switching the selector re-derives the shelf (rows and plain counts recompute for the newly-selected state)
   - **asserts —** `fireEvent.click` on the `active` state (then `archived`) recomputes the shelf: a category
     present in one state but empty in another appears/disappears accordingly, and each rendered row shows the
     newly-selected state's plain count. Exactly one state is selected at a time.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the selector → shelf re-derivation) and
     `apps/studio/src/lib/libraryShelf.ts` (the per-state counts)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
3. **`lls-selector-filters-search`** — a typed query's results filter to the selected state (assets + Decisions); an in-state result renders its title + `kindLabel` sub-line and an ADR result its status
   - **asserts —** with default `open`, typing a query that matches both an `open` item and an `active` item
     surfaces ONLY the `open` result row; switching the selector to `active` surfaces the `active` one — for
     assets AND Decisions. An in-state result row renders its `title` and a muted kind sub-line via
     `kindLabel(category, arcDisplay)` (an `arc` reads "epic", never the raw key — trap j, re-homed from the
     retired `lf-result-renders-title-and-kind-subline-via-kindLabel`), and an in-state ADR result additionally
     shows its `status` (re-homed from the retired `lf-adr-result-shows-status`).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the state-filtered search + the result-row
     title/kindLabel/status render)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
4. **`lls-selector-filters-scoped-browse`** — scoping into a category browses its items filtered to the selected state, uniformly for every kind; a browse row click lifts the finder-parity `SearchResult`
   - **asserts —** clicking a category shelf row scopes to it (a removable `library-scope-chip`) and the browse
     list shows only that category's items in the selected state (via `lifecycleOf`) — the SAME rule for every
     kind (no per-kind exception); switching the selector re-filters the browse. A browse row click invokes
     `onSelect(result)` with the finder-parity `SearchResult` (re-homed from the retired
     `lcs-scoped-row-click-lifts-searchresult` / `lf-click-invokes-onselect-and-marks-selection`).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the state-filtered scoped browse + the unchanged
     `onSelect` lift)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
5. **`lls-state-chips-retired`** — scoping into any kind renders NO per-kind state chips (the `library-state-chip-*` testids no longer render)
   - **asserts —** scoping into a stateful kind (e.g. `friction`, then Decisions, then `plan`) renders ZERO
     `library-state-chip-*` elements — the per-kind chips retire (ADR-0197 D3); the single selector is the only
     state vocabulary. The absent-renders-nothing idiom.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the removed per-kind state-chip render)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.
6. **`lls-quiet-empty-states`** — an all-empty `open` shelf renders one quiet line; an empty scoped/search result names the selected state in one line
   - **asserts —** rendering over a corpus with no `open` item renders a single `library-empty-state` line and NO
     shelf rows; and an empty scoped/search result (a scope or query with no in-state match) renders a one-line
     message that NAMES the selected state (e.g. contains "open"). No further chrome (ADR-0197 D4).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the quiet empty-state render)
   - **proven by —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): re-prove the signed inc-13 finder as the
one-selector-governs-the-panel model, test-first, with the surviving `lf-*`/`lcs-*` blocks byte-green and the
re-tensed ones trimmed by the orchestrator BEFORE this build (ADR-0197 D5).

- **The new test —** `apps/studio/src/components/LibraryLifecycleShelf.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the `LibraryCategoryShelf.test.tsx` shape; NO real
  `fetch`/socket/DB/Electron), its contract set REPLACED by the v2 `lls-*` selector contracts. Import
  `{ LibraryFinder }` from `"./LibraryFinder"`, the count heart from `"../lib/libraryShelf"`,
  `import type { SearchResult } from "../lib/librarySearch"`, and the corpus fixtures — define NO new wire type.
  Name each test for its contract id (`lls-…`) so `storytree coverage library-lifecycle-shelf` reports 6/6
  (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (LibraryFinder.tsx exists — NOT
  module-not-found): at HEAD (post-#731) the finder renders the Active|All two-state toggle + the per-kind state
  chips + the "N of M" muted totals, so the v2 selector assertions (a three-state open-default selector,
  hidden-empty categories, plain per-state counts, no chips, quiet empty states) fail. This is the brownfield red
  the spine observes against the ADR-0196 finder at HEAD (ADR-0057).
- **The GREEN —** rework `apps/studio/src/lib/libraryShelf.ts` (add per-state counts computed via `lifecycleOf`,
  keeping `count` as the total; keep the group-filtered Decisions count) and rework
  `apps/studio/src/components/LibraryFinder.tsx`: replace the Active|All toggle with the three-state
  open|active|archived selector (component-local, default open); render only the categories with ≥1 item in the
  selected state, each with its plain per-state count (no muted-total split); filter the scoped browse to the
  selected state uniformly for every kind; filter the typed search to the selected state (assets + Decisions);
  remove the per-kind state chips; render the quiet empty states. Keep the existing
  `assets`/`docs`/`onSelect`/`selectedId` prop surface, the `library-finder-row-<id>` / `library-shelf-row-<category>`
  / `library-shelf-decisions-row` / `library-scope-chip` testids, and the `count` total + `buildCategoryShelf` /
  `listCategoryResults` signatures so the SURVIVING `LibraryFinder.test.tsx` / `LibraryCategoryShelf.test.tsx`
  blocks stay byte-green (the re-tensed blocks are the orchestrator's pre-build trim, NOT this leaf's edit).
  WIRING the finder's mount into `TreeView.tsx` and the forest-cozy appearance are witnessed under the story's
  operator-attested UAT leg (ADR-0070), NOT asserted in CI and NOT in this `real:` scope. After it, the new test's
  assertions hold and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Consume `lifecycleOf` from `@storytree/library` — do not re-derive the mapping** (ADR-0196 D4,
  `lls-selector-defaults-open-and-hides-empty-categories`) — call it over each item's lifecycle-bearing fields;
  `GuidanceAsset.status?` is already on the wire (#731), no `types.ts` change.
- **One three-state selector (open | active | archived), default open** (`lls-selector-defaults-open-and-hides-empty-categories`,
  `lls-state-switch-rederives-shelf`) — it replaces the two-state toggle; drop the `library-lifecycle-toggle-*`
  testids.
- **The selected state governs the shelf — only ≥1-in-state categories render, plain per-state count, "N of M"
  retired** (`lls-selector-defaults-open-and-hides-empty-categories`, `lls-state-switch-rederives-shelf`); the
  Decisions row counts only `group === 'Decisions'` docs.
- **The selected state governs the scoped browse — uniformly for every kind; the `onSelect` lift is unchanged**
  (`lls-selector-filters-scoped-browse`) — the friction/Decisions chips-only exception retires.
- **The selected state governs the typed search (assets + Decisions); an in-state result renders title +
  `kindLabel` sub-line + ADR status** (`lls-selector-filters-search`) — the re-home of the retired `lf-result-*`
  / `lf-adr-result-shows-status` behaviours.
- **The per-kind state chips retire** (`lls-state-chips-retired`) — the `library-state-chip-*` testids no longer
  render; one control, one vocabulary.
- **Quiet, honest empty states** (`lls-quiet-empty-states`) — an all-empty `open` shelf is one line; an empty
  scoped/search result names the selected state in one line.
- **The surviving `lf-*`/`lcs-*` blocks stay byte-green; the re-tensed ones are the orchestrator's pre-build trim**
  (ADR-0197 D5) — keep `count` as the total, the distinct shelf/result testids, and the pure heart signatures; do
  NOT edit `LibraryFinder.test.tsx` / `LibraryCategoryShelf.test.tsx` (outside this `real.scope`). The precise
  split is in the neighbour specs' reconciliation notes.
- **Appearance is operator-attested, not asserted here** (ADR-0197 D1 / ADR-0070) — prove the selector/shelf/
  browse/search behaviour; the selector styling, the empty-state look, and the muted-total-gone typography are the
  shared library-lens look leg. Do NOT author a visual verdict, and do NOT edit `TreeView.tsx` in the `real:`
  scope (the mount is the orchestrator's supplement glue after PASS — plan §G).
- **Every `lls-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, this arc's recurring class — the fix if it happens is
  TEST-TITLE-ONLY, never an assertion/source edit).
