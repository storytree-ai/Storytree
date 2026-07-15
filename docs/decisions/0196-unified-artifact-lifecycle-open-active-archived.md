---
status: accepted
decided: 2026-07-14
amends: [37, 168, 183]
load_bearing: true
---
# ADR-0196: Unified artifact lifecycle: open, active, archived

## Status

**accepted** (2026-07-14) — decided/directed by the owner in conversation on 2026-07-14 (ADR-0110:
design-time alignment IS the ratification; no second end-of-flow ask). The owner's direction,
recorded verbatim in substance:

1. **One lifecycle for every artifact**: *"artifacts just all have 'open' — needs attending to,
   'archived' — dealt with / no longer load-bearing, 'active' — currently load-bearing."* ADRs are
   the most load-bearing kind, so every artifact adapts THEIR state shape — and the ADR triad
   (`proposed`/`accepted`/`superseded`) already IS `open`/`active`/`archived` under older names.
2. **Fewer per-kind vocabularies**: friction's `routed` vs `archived` split and plan's five-state
   enum read as over-engineering at the surface. Collapse them at the lifecycle level; kind-specific
   detail survives as fields, not as lifecycle states.
3. **Epics and plans hold pre-decision context**, so ADRs need less of a drafting runway — but the
   drafted-awaiting-ratification state itself is retained (it is `open`; see D2), because the
   friction→ADR escalation route and operator-attested design forks depend on it (ADR-0168 D5).

## Context

The studio Library shelf (ADR-0188) shows one flat count per category: `friction 38`,
`Decisions 223`, `plan 12`. Those counts mix live items with settled history — the real friction
worklist was 2 open (26 routed, 10 archived), the plan row is ~11 superseded versions of one arc's
plan chain, and the Decisions row counts every doc under `docs/` (223), not the 191 ADRs. The owner
asked whether artifacts share common state categories. They do not — each stateful kind grew its
own vocabulary:

| Kind | Stored state | Values |
|---|---|---|
| adr | frontmatter `status` (ADR-0037) | proposed / accepted / superseded |
| friction | derived from body `route` (ADR-0168 D2) | open / routed / archived |
| plan | schema `status` (ADR-0183 D2) | draft / ready / consumed / superseded / retired |
| arc, open-question, proposal | none (prose / deletion) | — |
| durable kinds | none (evergreen) | — |

Three vocabularies, three sets of display rules, and two kinds whose "done" states are
indistinguishable from their "live" states in every count surface. Yet all three project cleanly
onto the same triad — the one ADRs already use semantically.

## Decision

**One sentence:** every Library artifact has exactly one lifecycle — **`open`** (needs attending
to), **`active`** (currently load-bearing), **`archived`** (dealt with / no longer load-bearing) —
implemented first as a single pure projection over the existing stored vocabularies, with
kind-specific detail (`route`, plan terminal reasons) retained as fields below the lifecycle, and
the stored-vocabulary rename deferred until evidence shows the projection is not enough.

### D1 — The lifecycle interface and the per-kind mapping

| Kind | open | active | archived |
|---|---|---|---|
| adr | proposed (drafted, awaiting owner ratification) | accepted | superseded |
| friction | no `route` set | — (never load-bearing) | any `route` set (`route` records where it went) |
| plan | draft | ready | consumed / superseded / retired |
| arc (epic) | — | in flight | closed |
| open-question | unanswered | — | settled |
| proposal | under consideration | — | graduated / declined |
| definition, principle, pattern, guardrail, techstack, process, agent, template | — | the default | soft-retired |

A kind uses the subset that applies. `active` is a lifecycle state, NOT the curated ★
`load_bearing` calibration tag (ADR-0086) — the two are unrelated axes.

### D2 — What each collapse means (the amends)

- **friction (amends ADR-0168 D2):** the derived lifecycle collapses `routed` and `archived` into
  `archived` — both are "dealt with". The `route` field remains the audit detail and keeps feeding
  the recurrence-extinction measure (a re-firing `tool`-routed item = the fix failed; a re-firing
  `nothing`-tombstone = wrong judgment, re-opens). The drain ceiling gates `open` only — unchanged.
- **plan (amends ADR-0183 D2):** the five-state enum stays STORED (the consumption machinery reads
  it) but every surface presents the projection: draft→open, ready→active,
  consumed/superseded/retired→archived. ADR-0183 already holds that plans are disposable and the
  arc's increment log is the durable residue, so terminal-state distinctions are detail, not
  lifecycle.
- **adr (amends ADR-0037 in interpretation only):** the frontmatter vocabulary
  `proposed`/`accepted`/`superseded` is unchanged on disk (191 files, `adr-health`, CI all speak
  it) and is now DECLARED the ADR-local spelling of open/active/archived. `proposed` is not
  deleted: it is the owner-ratification inbox (`open` = needs attending — by the owner), which the
  friction→ADR route (ADR-0168 D5: born-`proposed`, never born-accepted) and operator-attested
  design forks require. The discipline change the owner directed — hold pre-decision context in
  epics/plans, draft ADRs later — needs no schema change.
- **arc / open-question / proposal / durable kinds:** gain an explicit lifecycle where today only
  prose or deletion exists. Arc close becomes visible state instead of increment-log prose;
  durable kinds gain a soft-retire (`archived` keeps history — `edit-first-curation` applied to
  retirement). These are projection defaults now (in-flight/active; absent states never invented);
  a stored `lifecycle` field for kinds that have NO stored state today lands with the build only
  where a surface needs to WRITE a transition (arc close), not speculatively.

### D3 — The build: projection module + surfaces (this unit)

- **`lifecycleOf`** — one pure, browser-safe module in `@storytree/library` (the root barrel; the
  studio bundles it): `(kind, doc) → open | active | archived`. The CLI's
  `friction-lifecycle.ts` becomes a consumer/re-export; the drain ceiling's counting is untouched.
- **Plan `status` on the wire:** `renderStoredDoc` serializes plan `status` onto `GuidanceAsset`
  (today `arcRef` crosses, `status` does not) so the studio can project it.
- **Studio shelf (extends ADR-0188 dec 2):** an Active | All toggle, default Active — counts show
  the live number with the total muted ("2 of 38"); scoped categories get per-kind state chips
  that keep each kind's own vocabulary (friction: open/routed/archived as `route`-detail chips;
  Decisions: proposed/accepted/superseded).
  (**Amended 2026-07-15 —
  [ADR-0197](0197-lifecycle-selector-open-by-default-one-three-state-toggle-go.md):** this shelf
  surface is replaced by ONE three-state selector open | active | archived, default `open`,
  governing shelf categories, scoped browse, and search; the "N of M" counts and the per-kind
  chips retire. The projection, the wire crossing, and the Decisions count fix stand unchanged.)
- **Decisions count fix:** `buildCategoryShelf` counts `docs.length` (every doc, 223); it must
  filter `group === 'Decisions'` (191) like `Library.tsx` already does.

### D4 — The stored-vocabulary rename is deferred

Renaming frontmatter/statuses on disk (`proposed`→`open` etc.) is a mechanical sweep across 191
ADR files, `adr-health`, the CLI, and CI — all cost, no new capability while the projection is the
single display path. It happens only as a follow-on IF lived experience shows the projection
leaks (two vocabularies confusing agents in practice), and then as its own ADR-less mechanical
change under this decision. Default: never.

## Consequences

**Good.** One lifecycle concept everywhere; the shelf's counts become honest (live by default,
history on demand); friction and plan lose their surface-level special cases without losing their
machine-read detail; arcs and durable guidance gain explicit close/soft-retire states; zero data
migration and zero frontmatter churn in the first increment.

**Bad / costs.** Two vocabularies coexist under the hood (stored kind-local + projected universal)
until/unless D4 fires — the projection module is the single place that owns the mapping, and any
new stateful kind MUST route through it (a second ad-hoc status surface is the failure mode this
ADR exists to end). The friction gate's user-facing wording ("routed") survives in `route`-detail
chips, which may read as a fourth state to a casual reader; the shelf copy must present it as
"where it went", not lifecycle.

## References

- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) (**amended in interpretation**: the ADR
  status vocabulary becomes the ADR-local spelling of the universal lifecycle; disk vocabulary
  unchanged), [ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md)
  (**amended**: D2's derived lifecycle collapses routed/archived → archived with `route` as detail;
  D5's born-`proposed` escalation = born-`open`, preserved),
  [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) (**amended**:
  D2's five plan states stay stored but every surface presents the three-state projection),
  [ADR-0188](0188-the-library-lens-is-an-always-on-side-panel-over-a-chrome-fr.md) (the shelf this
  extends; derived-from-corpus rule unchanged),
  [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) /
  [ADR-0084](0084-agents-may-flip-an-adr-green.md) (this acceptance),
  [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) (`load_bearing`
  stays a distinct curated axis).
- Code: `packages/cli/src/friction-lifecycle.ts` (the collapse target),
  `packages/library/src/store/render-doc.ts` (the plan-status wire gap),
  `apps/studio/src/lib/libraryShelf.ts` (the count bug + the shelf hearts).
- Owner direction conversation, 2026-07-14 (this session).
