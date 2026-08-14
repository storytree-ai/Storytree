---
status: accepted
decided: 2026-08-04
load_bearing: true
arc: arcs-hold-increments-arc
---
# ADR-0306: Typed work-hierarchy refs: increments cite stories and capabilities as resolvable pointers

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04, in the same
design pass that produced ADR-0305. Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask. The owner's framing: *"I would have expected plans to cite library artifacts,
stories and capabilities, so I'm not sure why we have decomposition rather than just a citations
list."*

## Context

### The ids are already there — as prose

ADR-0183 D2 gave the `plan` kind a required `decomposition` field whose contract is *"the provable
units in dependency order — each names its story/capability id and its proof route"*. So a plan
already names its stories and capabilities. It names them in **markdown**, where nothing can query
them, nothing can validate that they exist, and nothing notices when one is renamed or retired.

### The reason it is prose is a missing pointer type, not a design preference

`AssetRef` is `/^asset:[A-Za-z0-9_-]+$/` — Library artifacts only, and `doc:`/ADR refs are
deliberately rejected on ref-list fields (ADRs are searched just-in-time, never preloaded into
assembled context). Stories and capabilities are not Library artifacts at all: they are the
disk-canonical work hierarchy under `stories/**` (ADR-0002/0010). **There has never been a pointer
type that can name one**, so an artifact wanting to cite a story has had no option but prose.

The generic `references` array on every artifact is `z.array(z.string())` and would *validate* a
`story:foo` entry today. Nothing would resolve it. The gap is a resolver and a convention, not a
schema war.

### What the missing edge costs, measured against a question already asked

ADR-0183 D3 puts every containment edge on the child and derives the arc's view by query. For plans
and open questions that query is `store.queryDocs(...)` — the same answer for every session. For
stories and ADRs it is `storyArcStamps(storiesDir)` and `loadTitledAdrMetas(decisionsDir)` in
`packages/arc/src/arc-rollup.ts` (moved out of `packages/drive` by ADR-0369 D2, which still reads
`loadTitledAdrMetas` from `@storytree/drive` across the new package boundary): a **filesystem scan of
whichever working tree the command ran in**.

So half an arc's children are branch-dependent. An ADR stamped to an arc on a session's branch is
in that session's `arc show` and in nobody else's until the PR merges; a story directory that does
not exist on this branch is not in the arc, on this branch, today. The rollup is never wrong, but it
is always relative to one checkout — the same class of error the corpus already records as
*ref-scoped searches falsify absence*.

A typed citation on an increment moves that edge into the shared store, where it is the same for
every session with no merge in the path.

### The second question the edge unlocks

Contention detection today reasons over claims (ADR-0121/0142/0200/0270) — what a session *says* it
is working on. "Which increments touch this capability" is a different and more useful question,
because it is answerable *before* anyone claims anything, at planning time, which is exactly when
ADR-0183's Context said coordination was missing: *"nothing declares the choreography before the
sessions collide."*

## Decision

### D1 — Two new ref schemes: `story:<id>` and `capability:<id>`

Alongside `asset:<id>` (Library) and `doc:<relpath>` (ADR), the corpus gains two pointer types for
work-hierarchy units. They are **citation** edges, not containment edges: ADR-0183 D3 is untouched,
and nothing about an arc's or a story's ownership changes.

A resolver turns each into the unit it names, and a validator reports a ref that resolves to
nothing. Unresolvable refs are a **report**, not a write-time rejection: the work hierarchy is
disk-canonical and branch-dependent, so an increment authored against a story that exists only on
another branch must be writable, and must say so when read.

### D2 — An increment carries `cites`, replacing `decomposition`'s prose ids

`cites?: Ref[]` — a mixed list of `story:` / `capability:` / `asset:` pointers naming what this
increment touches and what guidance it stands on. It replaces the id-naming half of the
`decomposition` field that ADR-0305 D4 removes.

**`cites` is a set, not a sequence.** It carries no order and no proof route, because a flat list
cannot honestly express either. Dependency order and per-unit proof route stay in the increment's
`body` prose (ADR-0305 D4), where they already live.

### D3 — Structured units are deliberately NOT decided here

A structured `units[]` (id, route, dependsOn) would carry order and route as data, and it is the
obvious next question. It is **not decided** by this ADR. `cites` answers the reachability question
— which increments touch this unit — at a fraction of the cost, and whether the ordering half is
worth encoding should be judged after the flat edge exists and its gaps are observed rather than
predicted. Recorded as parked rather than silently omitted: it belongs on
`arcs-hold-increments-arc` as an increment in `proposal` status, not in this ADR's Decision.

### D4 — The arc's story view keeps both paths, and says which it used

Stories become reachable from an arc two ways: the ADR-0183 D3 frontmatter stamp (branch-dependent,
scanned from disk) and, transitively, an increment's `story:` citation (store-resident, identical
everywhere). **Both are kept.** They answer different questions — the stamp says *this arc produced
this story*, the citation says *this increment touched it* — and one does not subsume the other.

The obligation this creates: any surface listing an arc's stories must not silently merge them.
A reader who cannot tell a store-resident edge from a scan of the local working tree cannot tell
whether a story's absence means anything.

## Consequences

**"Which increments touch this capability" becomes a query.** It is answerable at planning time,
before a claim is taken, which is the coordination gap ADR-0183's Context named and did not close.

**Half the arc rollup's branch-dependence is removable, and half is not.** Story reachability gains
a store-resident path. The ADR stamp is unchanged and stays a disk scan — an ADR is a file in
`docs/decisions/`, and no citation edge changes that.

**Refs can dangle, and that is the design.** A `story:` ref naming a unit that does not exist in
this checkout is legal, reported on read, and not an error. This is the price of citing a
disk-canonical, branch-varying hierarchy from a store-resident artifact, and pretending otherwise
would make increments unwritable on the branch that creates the story they plan.

**Nothing is retired.** `decomposition` is removed by ADR-0305 D4, not by this ADR; `references`
keeps its existing meaning; `asset:` and `doc:` are unchanged. This decision is additive, which is
why it carries no `amends` edge.

**Scope not taken.** No structured `units[]` (D3), no ordering data, no proof-route field, and no
change to how claims work. An increment that needs to express order writes prose, as it does today.

## References

- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) — renames the
  kind and removes `decomposition`; this ADR replaces the ids that field carried.
- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) — D2's
  `decomposition` contract, D3's containment-edge-on-the-child rule (untouched here), and the
  Context that named the pre-collision coordination gap.
- [ADR-0002](0002-work-hierarchy-story-capability-contract.md) — the story/capability/contract
  hierarchy these refs point into.
- [ADR-0029](0029-agents-as-library-artifact-category.md) — the assembled-context ref rules that
  keep ADRs out of ref lists; unchanged, and the reason `doc:` is not extended here.
- `packages/arc/src/arc-rollup.ts` (moved out of `packages/drive` by ADR-0369) — the disk-scanning
  half of the arc's child query.
- `packages/library/src/knowledge.ts` — `AssetRef` and `commonShape.references`.
