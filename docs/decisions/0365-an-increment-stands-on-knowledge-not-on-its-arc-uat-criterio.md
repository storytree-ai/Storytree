---
status: accepted
decided: 2026-08-14
amends: [223]
arc: directional-dag-arc
---
# ADR-0365: An increment stands on knowledge, not on its arc; uat-criterion joins the tier order

## Status

accepted (2026-08-14) — decided/directed by the owner in conversation on 2026-08-14. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0223 established the authored `standsOn` edge as the Library's dependency DAG, and ADR-0363
excluded the `definition` tier from it. Seeding the corpus (PR #1328) surfaced two gaps in the tier
order that the seed deliberately declined to guess at, and one of them is a genuine
self-contradiction inside ADR-0223 rather than an omission.

**Gap 1 — `uat-criterion` was never placed.** ADR-0223's own Consequences warned that *"a future kind
must be placed in the tier order"*. The `uat-criterion` kind arrived without that happening, leaving
59 artifacts in a state that is incoherent rather than merely undecided: they are in **no tier**, so
the seed writes them no edges and points none at them, AND in **no `EDGE_FREE_KINDS`**, so the schema
will happily accept a hand-authored `standsOn` on one. Outside the graph for the seed, inside it for
the schema. That asymmetry is the defect — either state is defensible, holding both is not.

**Gap 2 — does an increment stand on its arc?** ADR-0223 says both:

- **dec 3's tier table** puts tier 6 (`plan`, whose successor is `increment` per ADR-0305 D1) as
  *"stands on its arc"*, which would seed `increment → arc` edges.
- **dec 4** says the arc containment relation *"is a separate provenance overlay, never this DAG"*.

~689 increments are affected — the single largest unwritten edge population, larger than the entire
660-edge seed that landed. The bootstrap declined it because ADR-0223 dec 5 scopes the seed to
CITATIONS, and an increment's link to its arc is `arcRef`, not a citation.

The forces are not symmetric. An `increment → arc` edge would give every increment exactly one
upward edge into a tier-5 sink, making arcs by far the densest nodes in the graph and letting them
dominate any depth or centrality measure computed over it — degrading the very readings the studio
projection exists to provide.

## Decision

**D1 — `uat-criterion` joins the tier order at tier 6, as a peer of `increment`.** It is placed, not
excluded, and the reason is evidential rather than aesthetic: a `uat-criterion` genuinely cites
knowledge. `desktop#uat-2`, sampled from the live corpus, carries
`references: [asset:human-witness-is-a-judgment-gap-not-cost]` — a principle. "This acceptance
criterion rests on this principle" is exactly the relation `standsOn` exists to record, so excluding
the kind would discard real dependency information, which is not the case ADR-0363 D1 made for
`definition` (whose depth buys a reader nothing and whose citation core is irreducibly cyclic).

Tier 6 places it alongside `increment` as work-adjacent outermost detail: it may stand on tiers 1–5
(techstack, principle/pattern/guardrail, process, agent, arc) and nothing stands on it. It is NOT
added to `EDGE_FREE_KINDS`; the asymmetry is resolved toward inclusion, so schema and seed now agree.

**D2 — an increment does NOT stand on its arc. dec 4 governs; dec 3's tier-table row is corrected in
place.** Containment and dependency are two different relations that happen to share a pair of
endpoints, which is precisely why one ADR could assert both without the conflict being obvious.

Three reasons, in order of weight:

1. **ADR-0363 D2 already settled the general form of this question.** It ruled that the work graph
   joins the knowledge graph by PROJECTION, not by merger — story nodes do not become tier 0, and the
   two substrates stay separately enforced. Arc containment is the same class of relation. Deciding
   it the other way here would contradict a decision taken one day earlier.
2. **dec 3's row is the older and looser clause.** It was written when tier 6 was `plan` — an
   ephemeral, disposable, git-anchored choreography whose whole meaning was its arc. ADR-0305 D1
   replaced `plan` with the durable `increment`, and the tier-table row was carried across without
   being re-examined against dec 4.
3. **It would degrade the graph it claims to enrich.** 689 edges into tier-5 sinks makes
   distance-from-arc dominate distance-from-foundation in any derived measure.

What an increment DOES stand on is the knowledge it cites — and it already does. Arcs (tier 5) and
increments (tier 6) sit in the DAG as its outermost layer, standing on the guidance they use, with
nothing standing on them. Both halves of that are live today: 8 arcs and 32 increments carry authored
edges in the seeded corpus.

## Consequences

- `KNOWLEDGE_TIERS` gains `uat-criterion: 6`, which resolves the schema/seed asymmetry that was the
  actual defect: the kind is now consistently INSIDE the graph for both.
- **It seeds ZERO edges today, and that is measured, not assumed.** A dry run after placement plans
  0 edges. The reason is that a `uat-criterion` keeps its citations in a per-kind `refs` field (a
  KIND_SPECS `refList`), not in the envelope `references` — all 59 have an EMPTY `references`, while
  45 of 59 carry a populated `refs`. ADR-0223 dec 5's seed reads `references` only. So placement
  makes the kind a legal DAG participant and lets a curator author an edge that the schema and the
  seed now agree about; it does not by itself draw the edges those `refs` describe.
- **Whether the seed should read `refList` fields at all is deliberately NOT decided here.** It is a
  wider question than this kind: `refs`, `context`, `rules` and `antiPatterns` are all `refList`
  fields, and on an `agent` those carry composition refs whose "stands on" reading is plausible but
  unexamined. Deciding it inside a tier-placement ADR would smuggle a corpus-wide seeding change in
  under a narrow heading. Parked as its own increment.
- The authored-edge count therefore stays at 660 after this change. A reader expecting it to move
  should read the two bullets above rather than suspect a broken seed.
- ADR-0223 dec 3's tier table is corrected in place under ADR-0139 — the DECISION did not change
  (dec 4 was always the decision), only a row that was inconsistent with it. This ADR records the
  adjudication because the contradiction was load-bearing and a reader of dec 3 alone would have
  concluded the opposite.
- `arcRef` remains what carries an increment's containment. Nothing about arc ownership,
  `arc show`'s derived views, or ADR-0183 D3's containment-lives-on-the-child rule changes.
- **The `increment → arc` question is closed, not deferred.** If a future reader wants that edge, the
  cost is not "re-run the seed" but "reverse D2", and the burden is to show that
  distance-to-arc is what a reader of the tech-tree actually wants to measure.
- Accepted risk: tier 6 now holds two kinds with different lifetimes (`increment` is durable,
  `uat-criterion` is positional detail). Nothing enforces that they stay comparable, and if
  `uat-criterion` later grows edges into `increment` the two will need separating.

## References

- ADR-0223 — the authored `standsOn` edge (dec 3's tier table corrected in place by this ADR; dec 4
  affirmed; dec 5's citation-scoped seed unchanged).
- ADR-0363 — definitions excluded, work graph joins by projection (D2 is the precedent D2 here rests on).
- ADR-0305 D1 — `plan` retired in favour of the durable `increment`.
- ADR-0306 D2 — `story:` / `capability:` work-hierarchy pointers, the citation edge an increment
  carries in `cites`.
- ADR-0139 — correct-in-place vs supersede-and-replace, chosen by intent.
- `packages/library/src/standson-bootstrap.ts` — `KNOWLEDGE_TIERS` and the projection.
