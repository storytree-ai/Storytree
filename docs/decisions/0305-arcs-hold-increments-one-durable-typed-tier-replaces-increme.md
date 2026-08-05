---
status: accepted
decided: 2026-08-04
amends: [183, 298]
arc: arcs-hold-increments-arc
---
# ADR-0305: Arcs hold increments: one durable typed tier replaces increments, proposals and plans

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. The owner directed each fork
in turn: collapse the three lists, cut the status enum down, collapse the body headings, drop
`draft` in favour of `proposal` as a status, and rename the kind to `increment`.

## Context

### Three lists describe the same thing at three stages

ADR-0183 D1 gave the arc a structured `increments[]` landing log. ADR-0183 D2 gave it a separate
`plan` kind for the choreography of one increment. ADR-0298 D1, one day before this decision, added
a third — `proposals[]`, the parked-work entry that replaced the retired `proposal` kind.

All three describe *a unit of arc work*; what separates them is **when in its life** you are looking:

| list | what it holds | when it is written |
| --- | --- | --- |
| `proposals[]` | decided, not started | at parking |
| `plan` | the choreography being executed | at planning |
| `increments[]` | what landed | at the merge ceremony |

Nothing about them is a different *kind* of thing, which is why they share fields by copy:
`ArcProposal` carries `summary` / `motivation` / `scope` / `migration` / `risks`, which restate a
plan's `objective` / `decomposition` / `traps`; `ArcProposalRealization` and `ArcIncrement` are the
same `{date, pr?, note|outcome}` shape written twice. Keeping three schemas consistent by hand is
work that buys nothing a lifecycle field would not.

### The plan body's five headings are editorial, not structural

`packages/cli/src/plan.ts` declares `PLAN_BODY_FIELDS = ["objective", "decomposition", "lanes",
"budgets", "traps"]` and then treats all five identically: the consumption-time freshness check
(ADR-0183 D2) concatenates them, regex-mines every backtick-quoted token that looks like a repo
path, and git-logs those since `anchor.sha`. **No code reads `lanes` as lanes or `budgets` as
budgets.** The four non-`objective` headings are optional, and their real function is to prompt the
expensive planner model to think about contention and spend — a prompt-engineering job that belongs
in the `planner` agent's prose, not in a schema the machine cannot use.

### Five statuses, of which two are a reason rather than a state

`PlanStatus` is `draft | ready | consumed | superseded | retired`. Three earn their place:
`draft`→`ready` gates consumption, and `consumed` is a write-lock (a consumed plan is never edited;
re-planning supersedes it). But `superseded` and `retired` are both terminal and differ only in
*why* the plan stopped — that is a reason string wearing a state's clothes. ADR-0196 D2 already
judged wide lifecycle vocabularies "surface-level over-engineering" and gave the arc two values on
that ground; applying the same standard here is consistent with the record, not new.

### `proposal` returns as a state, which is what it always was

ADR-0298 retired `proposal` as a KIND because a change-sized `proposal` and an initiative-sized
`arc` both answered "what is decided and not yet built", and nothing told a session which to reach
for — so sessions reached for the cheaper one and remedies arrived with no owning initiative (8 live
proposals, 0 reachable from any arc). That complaint was about a kind competing with another kind.
As a *status* on an increment, `proposal` competes with nothing: it is the increment tier's own
not-yet-started state, always inside an arc by construction.

### `plan` is an overloaded word

`plan` collides with plan mode in the harness, with the `planner` agent, and with the ordinary
English sense of the word in every prose surface that has to disambiguate it. `increment` is already
the vocabulary the arc uses for its unit of landing — and the collapse in D1 is exactly what frees
the name, since `increments[]` ceases to exist as an array.

## Decision

### D1 — The arc holds increments; `increments[]`, `proposals[]` and the `plan` kind are gone

The `plan` kind is renamed **`increment`**. The arc's two structured arrays are removed. An arc's
increments are found the way its plans already were — by query on the child's `arcRef` (ADR-0183 D3
is untouched: every containment edge still lives on the child, and the arc row still names no
child).

An arc doc therefore keeps exactly: `intent`, `endState`, `lifecycle` (ADR-0239 D1, unchanged), and
the common artifact fields. Nothing else.

### D2 — One lifecycle: `proposal → ready → active → closed`

`IncrementStatus` is `proposal | ready | active | closed`, enum-fenced at the schema, defaulting to
`proposal`.

- **`proposal`** — decided, not started. Replaces both `draft` and the retired `proposals[]` entry.
  `draft` is dropped outright: it meant "not safe to consume", which `proposal` also means and says
  better, and no consumer ever distinguished a half-authored plan from a deliberately parked one.
- **`ready`** — authored and consumable. The gate the orchestrator checks before executing.
- **`active`** — execution started. Never edited again; re-planning supersedes (ADR-0183 D2's
  write-lock, renamed from `consumed`).
- **`closed`** — terminal, for any reason. `superseded` and `retired` are removed as states; the
  reason lives in `outcome.note` (D5).

### D3 — Increments are durable and are never pruned

A closed increment IS the landing-log entry that `increments[]` used to hold, so the log survives by
not deleting the artifact that produced it. This amends ADR-0183 D2, but only its **retention**
half: increments remain Postgres-only, absent from `knowledge.json`, and skipped by every seed
ceremony. The owner's stated reason for ephemerality — *"plans will move very rapidly and managing
them in git will be a pain"* — was an argument against git, not against durability, and it is
honoured unchanged. `EPHEMERAL_KINDS` keeps `increment` as its member; what changes is that nothing
prunes the rows.

### D4 — The body collapses to `objective` + `body`

`decomposition`, `lanes`, `budgets` and `traps` are removed as named fields. An increment has a
required one-sentence `objective` and a required free `body`. The decomposition-with-proof-routes,
lane fences, turn budgets and known traps that those headings prompted for move into the `planner`
agent's authoring guidance, where a checklist can actually be enforced by the reader.

**One convention survives the collapse and is now load-bearing on the body alone:** the freshness
check mines backtick-quoted paths, and reports a plan naming none as VACUOUS — explicitly *not*
green. File surfaces must still be named in backticks, and the `planner` guidance must say so.

### D5 — A closed increment carries `outcome`

`outcome?: {date, pr?, note?}` — absent until the increment closes, set in the same closing leg that
already appends the arc's increment entry today (ADR-0271). This is `ArcIncrement`'s shape moved
onto the artifact it describes; `ArcProposalRealization`, its duplicate, is removed.

### D6 — The delivery ceiling's inputs move, and keep answering

`parked` (required when status is `proposal`) and `frictionRefs?` move onto the increment unchanged.
ADR-0298 D2's join and D3's comparison point continue to answer "how long has this decided-but-
unbuilt remedy been waiting" — on the increment tier, per artifact, exactly as before.

### D7 — Evidence stays separable from intention, by status rather than by schema

ADR-0298 D4 kept unbuilt work out of the landing log **structurally**: two arrays, opposite
lifecycles, impossible to confuse. Under one list that guarantee weakens to a filter, and this
decision accepts that trade with the obligation stated explicitly: **no surface may present a
`proposal` increment alongside `closed` ones as though it were something that happened.** Where the
old design made the error impossible, the new one makes it a rendering rule — cheaper to hold, and
easier to get wrong. Any arc view that lists increments must separate the not-yet-started from the
landed.

## Consequences

**The three-way consistency work disappears.** Parking an item, planning it, and landing it are one
artifact moving through four states, so the pair-of-arrays reconciliation ADR-0298 D4 had to reason
about stops existing. A parked item that gets built no longer *becomes* a different record — it
changes status, and its own history is the trace.

**Appending a landing gets slightly heavier.** `arc increment add` mutated one row; closing an
increment now writes an `outcome` and flips a status on a doc. That is one CLI call either way, but
it requires the increment to exist — work that landed with no increment authored has nowhere to
record itself, and the closing leg must create one rather than assume it. This is the main
ergonomic cost of the collapse and the most likely source of friction after it lands.

**The arc's view gets simpler and slightly less safe.** One ordered list is easier to read than
three arrays, and D7's rule is the only thing keeping a parked intention from reading as a landing.

**Two decisions become partly historical, and are corrected in place** (ADR-0139): ADR-0183 D1's
`increments[]` clause and D2's plan-kind/ephemerality clause, and ADR-0298 D1's `proposals[]`
clause. Both ADRs remain `accepted` — their surviving decisions (0183 D3/D4/D5/D6, 0298 D2/D3/D4)
are untouched — so this is an `amends` edge, not a supersession.

**A rename touches every surface that says `plan`.** The kind key, `PlanStatus`/`PlanAnchor`/`Plan`,
the CLI verb group, `arc-rollup`'s `ArcRollupPlan`, the studio's arc view, `SEED_SCOPE_KINDS`'s
exclusion comment, and the `planner` agent's own prose. The `planner` agent keeps its name — it
plans; what it authors is an increment.

**Live rows must migrate**, and the migration is not a pure add: existing `plan` docs re-key to
`increment` and re-map `draft`→`proposal`, `consumed`→`active`, `superseded`/`retired`→`closed`;
existing `increments[]` and `proposals[]` entries become increment docs on their arcs. There is no
`knowledge.json` diff, and no kind needs an exemption to explain that: ADR-0302 D1 decommissioned the
seed and D4 deleted every ceremony that carried it, so no committed mirror exists to diff against.

A `CURRENT_SCHEMA_VERSION` bump DOES follow, per registered migration — corrected in place (ADR-0139)
against a sentence here that predicted none. The decision is unchanged; only that implementation
prediction was wrong, and wrong on its own terms rather than merely overtaken: this reshape REMOVES
fields and NARROWS an enum, so a stored doc still carrying `decomposition`, or a stored `consumed`,
fails the schema's `.strict()` and its enum on its NEXT write. A registered forward transform is the
ramp that makes such a row upcast instead of being refused, and the version pin is precisely what
numbers those registrations — so "no bump" would have meant "no ramp", i.e. every one of the 55 live
plan docs hard-refused at its next write. Increment 1 (D2/D4) took the pin to 4 with
`increment-body-and-status-collapse`; the fold takes it further. Beyond that, the arc schema itself
loses two fields, which every reader of a stored arc must tolerate.

**Sequencing.** The body/status collapse (D2, D4) is self-contained and lands first. The three-list
fold (D1, D3, D5, D6, D7) migrates live rows and rewrites the arc verbs. The typed citations that
would replace the removed `decomposition` field are a separate decision — ADR-0306 — and this ADR
does not depend on it: until it lands, an increment names its units in `body` prose exactly as
`decomposition` did.

## References

- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) — the arc and
  plan kinds; D1's increment log and D2's ephemeral plan tier are the clauses this amends.
- [ADR-0298](0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md) — retired
  `proposal` as a kind; D1's `proposals[]` array is the clause this amends, D2/D3's delivery
  measurement is what D6 preserves.
- [ADR-0196](0196-unified-artifact-lifecycle-open-active-archived.md) — D2's ruling that wide
  lifecycle enums are surface-level over-engineering, the precedent for D2.
- [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) — the arc's
  `lifecycle` flag, unchanged.
- [ADR-0306](0306-typed-work-hierarchy-refs-increments-cite-stories-and-capabi.md) — the typed
  citations that replace `decomposition`'s prose ids.
- `packages/library/src/knowledge.ts` — the schemas this reshapes.
- `packages/cli/src/plan.ts` — `PLAN_BODY_FIELDS` and the backtick path miner behind D4.
