---
status: accepted
decided: 2026-07-15
amends: [196]
---
# ADR-0197: Lifecycle selector: open by default, one three-state toggle governs shelf, browse, and search

## Status

**accepted** (2026-07-15) — owner-directed in conversation on 2026-07-15, reviewing the landed
ADR-0196 shelf (PR #731) at the staged walk (ADR-0110: design-time alignment IS the ratification).
The owner's direction, verbatim in substance: *"rather than doing 5 of ... can we just have open
items show by default, and can we have a nice looking toggle between the 3 states that filters the
search as well as what categories show — align this with the less-is-more principle and only
showing what is needed by the user at the time."*

## Context

ADR-0196 D3 shipped the lifecycle surface as an **Active | All** two-state toggle with live counts
and muted totals ("5 of 42"), plus per-kind state chips inside a scoped category. The owner's walk
found it over-chromed: the "N of M" presentation still shows everything's bookkeeping, the
default (Active = open+active) still lists every durable category, and the chips add a second
filtering vocabulary next to the toggle. The universal triad (ADR-0196 D1) already gives one
clean state axis — the surface should commit to it.

## Decision

**One sentence:** the Library panel carries exactly ONE lifecycle control — a three-state
selector **open | active | archived**, defaulting to **open** — and the selected state governs
everything the panel shows: which categories appear on the shelf (only those with ≥1 item in the
state, plain per-state counts, no "N of M"), what a scoped category browses, and what search
returns; the per-kind state chips retire.

### D1 — The selector

A segmented three-state control (open | active | archived), exactly one state selected, DEFAULT
`open` — the panel opens as the needs-attention inbox. It replaces ADR-0196 D3's Active|All
toggle. Its appearance ("nice looking") is the story's operator-attested look leg (ADR-0070); its
geometry/behaviour is machine-proven.

### D2 — The selected state governs the whole panel

- **Shelf:** one row per category with ≥1 item projecting (via the ADR-0196 `lifecycleOf`) to the
  selected state; the count is that state's count, a plain number. A category with zero items in
  the state does not render. Under `open` this typically means a handful of rows (friction,
  open-question, proposal, proposed Decisions); under `active` the durable corpus; under
  `archived` the history.
- **Scoped browse:** the category's items filtered to the selected state — uniformly for every
  kind (the ADR-0196 friction/Decisions chips-only exception retires with the chips).
- **Search:** `searchCorpus` results filtered to the selected state before rendering, assets and
  Decisions alike.

### D3 — The state chips retire

One control, one vocabulary (less-is-more). Friction's tombstone-vs-fixed distinction stays
readable as per-row `route` detail text; Decisions' proposed/accepted/superseded maps 1:1 onto
the triad, so the selector already expresses it.

### D4 — Quiet, honest empty states

All-empty under `open` renders a single line ("nothing needs attention"); an empty scoped/search
result names the selected state in one line (so a search that misses because of the filter is
explicable at a glance, e.g. "no open matches — switch state"). No further chrome.

### D5 — Signed-contract reconciliation (executes this decision, not a re-decision)

State-filtered search re-tenses signed finder contracts whose fixtures project `active` and
assert unfiltered result presence (`lf-*` in `LibraryFinder.test.tsx`, parts of `lcs-*` in
`LibraryCategoryShelf.test.tsx`, and the ADR-0196 `lls-*` chip/"N of M" contracts). Per the
inc-10/inc-12 precedent: story-author records the retire/re-home notes on the owning specs, the
orchestrator trims the affected test blocks as mechanical glue committed BEFORE the `--real`
build, and the surviving behaviours re-prove under the reworked `lls-*` contracts.

## Consequences

**Good.** The panel opens showing only what needs attention; one control filters everything;
less chrome, fewer vocabularies, honest empty states.

**Bad / costs.** A default-`open` search hides the durable corpus until the user flips state —
mitigated by D4's explicit hint line; the reconciliation touches signed test files (bounded by
D5's ceremony). Two paid re-drives of the shelf surface in two days is the cost of walking the
real thing — accepted.

## References

- [ADR-0196](0196-unified-artifact-lifecycle-open-active-archived.md) (**amended**: D3's
  Active|All toggle, "N of M" counts, and per-kind chips are replaced by this selector),
  [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) (look leg
  stays operator-attested),
  [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (this acceptance).
- Owner direction conversation, 2026-07-15 (this session, at the staged #731 walk).
