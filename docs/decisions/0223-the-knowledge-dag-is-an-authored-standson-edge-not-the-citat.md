---
status: accepted
decided: 2026-07-21
amends: [185]
arc: directional-dag-arc
---
# ADR-0223: The knowledge DAG is an authored standsOn edge, not the citation web

## Status

accepted (2026-07-21) — decided/directed by the owner in conversation on 2026-07-21, after inspecting
the Library focus graph and observing that `recursive-decomposition-patterns` renders with circular
edges and a "busy" fan. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.
The look legs of the resulting studio surface remain operator-attested at build time (ADR-0070 stage 2).

**Amends ADR-0185 (its dec 2 focus-subgraph mechanism, in part).** ADR-0185's Context ratified the
premise that "the knowledge corpus **is** a DAG (`references` edges today)", and its dec 2 drove the
upstream/downstream fan off those citation edges. That premise is **overturned here**: citations are a
web, not a DAG, and can no longer be the DAG substrate. The `references` field and the citation lens
itself survive unchanged; only the claim that they *define the DAG* is retired. ADR-0185's dec 1/3–6
are untouched; read its dec 2 through this ADR.

## Context

The Library studio renders a "focus DAG" — a selected artifact centred, its upstream ("stands on")
neighbours fanned left, its downstream ("stood on by") neighbours fanned right (ADR-0185 dec 2, remolded
through ADR-0188/0193). Its only available edge is `references` — the knowledge tier's SINGLE citation
field (`packages/library/src/knowledge.ts`; the work hierarchy's `depends_on` is a separate, work-tier
edge). So the focus graph walks citations both ways and lays them out with dagre `rankdir: 'LR'` on the
rule "referenced ranks left of referencer".

That rule assumes a DAG. Citations are not one. They are a **many-to-many web** whose bidirectional links
are not just legal but correct: two artifacts may each legitimately cite the other ("composes with" /
"see also" / "escalate to"). Concretely, `recursive-decomposition-patterns` and `exploration-principles`
cite each other (exploration escalates to recursion; recursion composes with exploration), as do
`recursive-decomposition-patterns` and `pull-based-context-architecture` — two 2-cycles centred on one
node. The corpus schema has **no acyclicity constraint** on `references` (by design — a citation web
should be free to loop). When dagre meets these 2-cycles it breaks them with an internal heuristic and
drops the mutually-citing neighbours onto an arbitrary side, so the "stands on" column can render empty
while everything piles onto "stood on by". The graph does not crash (the walk is one-level-each-way and
guards seen nodes / self-edges), but it reads as busy and its two sides are a lie: they are driven by
citation direction, which mutual citations scramble.

The forces:

- **The citation system is good and must stay.** Free, cyclic, many-to-many cross-reference is the right
  model for a body of knowledge. We do not want to constrain it to please a layout engine.
- **A directional DAG is a different object.** A tech-tree / dependency view needs a directed, acyclic
  edge with a stable orientation — something you can topologically rank. A web cannot supply that.
- **The two must not be conflated.** ADR-0185 conflated them ("references are the DAG edges, today").
  That "today" was a stand-in; this ADR replaces it.

## Decision

1. **The knowledge DAG substrate is a new, authored `standsOn` edge — distinct from `references`.**
   `X.standsOn = [B, C]` means *X is built on the more-foundational B and C.* It is an authored/curated
   relationship, optional, defaulting to empty, carried on the schema like `references` (not in the
   markdown body). The transient signal kinds (`friction`, `open-question`, `proposal`) stay edge-free.

2. **Citations (`references`) are untouched and stop being the DAG.** `references` remains the free,
   cyclic "see also / composes with" web, cycles allowed, schema unchanged. It is simply **no longer the
   graph substrate**; the focus DAG walks `standsOn`. If citations are surfaced at all in the DAG view,
   they are a secondary faint "see also" affordance, never the backbone.

3. **`standsOn` is directed by a tier order and enforced acyclic by a fail-closed gate.** The tier order,
   bedrock → composite:

   | Tier | Kinds | Role |
   |---|---|---|
   | 0 · decisions | ADRs | **bedrock** — stand on nothing (`DocMeta` has no `references`; natural sinks), stood-on by whatever they ratify |
   | 1 · reference | definition, techstack | |
   | 2 · rules | principle, pattern, guardrail | |
   | 3 · process | process | |
   | 4 · roles | agent | |
   | 5 · initiative | arc / epic | overlay |
   | 6 · ephemeral | plan | stands on its arc |

   A new corpus-guard check (`check:library-dag-acyclic`, sibling to `adr-number-unique`) fails
   `pnpm -r test` on any cycle in `standsOn` — the guarantee citations could never give.

4. **The three tricky placements are settled:**
   - **ADRs are the bedrock (tier 0).** An artifact may stand on the decision that ratified it; ADRs
     stand on nothing, so they are natural sinks that cannot form a cycle. (Their own
     `supersedes`/`amends` chain is a separate ADR-internal graph, governed by `adr-health`, not
     `standsOn`.)
   - **Arcs/epics are a composite overlay (tier 5), NOT under ADRs.** The library defines an arc as
     "upstream of stories and ADRs **by provenance**" — a *causal/provenance* edge (the arc spawned
     them), which is NOT a `standsOn` (foundational-dependency) edge. In the dependency DAG an arc
     *stands on* the ADRs and knowledge that inform it; the arc→plans / arc→stories containment is a
     separate provenance overlay, never this DAG. This is the citations-vs-DAG discipline applied one
     level up.
   - **Friction (and open-questions, proposals) are excluded.** Transient signal is captured,
     adjudicated, then drained/graduated and deleted (ADR-0168 / ADR-0095). It has no durable
     foundational dependency and vanishes on graduation, so it would be pure DAG noise. If ever shown,
     it is a separate "signal" overlay.

5. **The initial `standsOn` values are bootstrapped once from down-tier citations, then curated.** A
   one-time migration projects each artifact's existing `references` through the tier order: a citation
   pointing strictly *down-tier* seeds a `standsOn` edge; same-tier and back citations are dropped.
   Because every seeded edge strictly descends the tier order, the seed is **acyclic by construction**.
   Curators then hand-add the genuine same-tier dependencies the projection cannot infer (the gate
   blocks any that would loop). This is a one-time seed for convenience — it does NOT make citations
   "build the DAG" going forward: after the migration `standsOn` is authored independently and may
   diverge from `references` freely.

6. **The focus graph renders `standsOn`.** `buildFocusGraph` walks `standsOn` instead of `references`,
   so the "stands on" (left) and "stood on by" (right) panes become *literally* the edge and its
   reverse — the UI language and the data finally agree.

## Consequences

- **Good.** The focus graph becomes a true directional, acyclic tech-tree with honest sides; the
  `recursive-decomposition-patterns` busy-ness disappears because the mutual citations are no longer DAG
  edges. Citations stay fully expressive. The two concerns (cross-reference vs dependency) are cleanly
  separated, each with the right shape.
- **Cost.** A schema field, a new gate, a bootstrap migration over ~160 artifacts, and a `buildFocusGraph`
  rewrite + studio render change — decomposed into provable increments under `directional-dag-arc`.
- **Ongoing.** `standsOn` is authored guidance now: new/curated artifacts should declare what they stand
  on, and the librarian-curator maintains it alongside `references`. Bootstrap gets ~80% for free;
  same-tier dependencies are the curation tail.
- **Bad / watch.** A second edge type is a maintenance surface; it can drift from citations (that is the
  point, but it means two things to keep honest). The tier order is a fixed partial order — a future kind
  must be placed in it.

## References

- ADR-0185 (Library as a tech-tree overlay; its dec 2 citation-driven fan is amended here) and its
  remolds ADR-0187 / ADR-0188 / ADR-0191 / ADR-0193.
- `apps/studio/src/lib/focusGraph.ts` — the focus-DAG builder that will walk `standsOn`.
- `packages/library/src/knowledge.ts` — the knowledge schema that gains `standsOn`; `references` at
  line 619 (the citation web, unchanged).
- `packages/library/src/schema.ts:133` — `depends_on`, the work-tier directional edge (the precedent
  for a real dependency edge, kept separate).
- Arc: `directional-dag-arc` — the initiative overlay tracking this build.
