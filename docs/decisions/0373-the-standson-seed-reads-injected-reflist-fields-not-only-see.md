---
status: accepted
decided: 2026-08-15
amends: [223]
arc: directional-dag-arc
---
# ADR-0373: The standsOn seed reads injected refList fields, not only see-also citations

## Status

accepted (2026-08-15) — decided/directed by the owner in conversation on 2026-08-15, answering the
question `standson-seed-reads-reflist-fields` was parked behind. Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0223 (its dec 5, in part).** Dec 5 scoped the one-time seed to the envelope `references`
field and handed the same-tier remainder to curators. D1 below widens the SOURCE fields it reads and
D2 changes how it treats an artifact that already carries edges. Every other decision of ADR-0223 is
untouched — read its dec 5 through this ADR. It also closes the question ADR-0365 deliberately left
open rather than smuggle in under a narrower heading.

## Context

ADR-0223 dec 5 bootstrapped the authored `standsOn` DAG by projecting down-tier CITATIONS into edges,
reading one field: the envelope `references`. It landed 2026-08-14 with 660 edges across 169
artifacts.

ADR-0365 D1 then placed `uat-criterion` at tier 6 and measured it seeding **exactly zero** edges: all
59 documents carry an empty envelope `references`, while 45 of them keep their citations in a per-kind
`refs` field (a `KIND_SPECS` `refList`). ADR-0365 declined to fix that in place, correctly — the
question is corpus-wide, not `uat-criterion`-shaped, and deciding it inside a tier-placement ADR would
have widened a corpus-wide seed under a narrow heading.

The corpus has four `refList` citation fields. Measured against the live store on 2026-08-14:

| field | docs carrying | refs | seedable (strictly down-tier) |
|---|---|---|---|
| `agent.context` | 13 / 13 | 54 | 48 (6 target definitions, excluded by ADR-0363 D1) |
| `agent.rules` | 13 / 13 | 135 | 135 |
| `agent.antiPatterns` | 12 / 13 | 40 | 40 |
| `uat-criterion.refs` | 45 / 59 | 77 | 77 |

**Every one of them points strictly DOWN the tier order — 0 same-tier, 0 up-tier, across all 306
references.** So acyclicity was never at stake here and the seed's by-construction safety property is
untouched. This was a purely semantic question: is each field a dependency the artifact rests on, or a
list that means something else?

**Those are the raw field counts, and the NET yield is far smaller — measured before this ADR was
written, because the difference is itself the interesting finding.** Deduplicated against what each
artifact already carries, the plan is **118 new edges across 54 artifacts**, not 300:

| kind | refList refs | already in `standsOn` | net new |
|---|---|---|---|
| `agent` | 229 | **179** | 47 (+3 duplicated across its own fields) |
| `uat-criterion` | 77 | 0 | 77 |

The agent tier's envelope `references` had ALREADY captured 179 of the 229 injected relations,
because agent authors list the same unit in both places. So the first pass caught most of the strong
relation by accident, through the weak field — which is worth stating plainly, since it means the
practical gap this ADR closes for agents is small even though the rule it corrects is not.
`uat-criterion` is the opposite and the real yield: 0 of 59 carried any edge, and all 77 are new.

They are not all the same relation, and the split is what decides it. The envelope `references` is a
SEE-ALSO citation — "I consulted this" — and the artifact still functions if the target vanishes. The
three agent fields are strictly stronger: the `storytree agents <name>` renderer **injects the cited
unit's text into the agent's system prompt**, so changing the target changes the agent with no edit to
the agent at all. Their own `KIND_SPECS` placeholders say so — "the renderer injects the cited units'
content; never restate it here".

Which means the seed was recording the weakest relation in the corpus and ignoring the strongest.

## Decision

1. **The seed reads four per-kind `refList` fields in addition to the envelope `references`:**
   `agent.context`, `agent.rules`, `agent.antiPatterns`, and `uat-criterion.refs`. The tier rule is
   unchanged — a citation seeds an edge only when the target is strictly more foundational — so this
   widens what counts as a citation SOURCE and nothing else. A new source field never admits a new
   target kind: the definitions in `agent.context` stay excluded (ADR-0363 D1).

   The allow-list is explicit and per-kind. A `rules`-shaped property on a kind not named here is
   ignored rather than read, so the decision cannot silently widen to kinds nobody adjudicated.

   `agent.antiPatterns` is INCLUDED although it reads as a negative pointer. Its content is injected
   exactly as `rules` is, so the operational test is identical: change the guardrail and the agent's
   prompt changes. The polarity lives in the content, not in the direction of the dependency — an
   agent required to refuse a named failure mode depends on that failure mode being defined.

2. **An artifact that already carries authored edges is EXTENDED, not skipped whole.** ADR-0223 dec
   5's seed skipped any document already carrying `standsOn`, so that a re-run could never revert
   curation. That rule would make D1 a no-op: all 13 agents were already seeded from their envelope
   `references` by the first pass, so the seed would read every new `rules` / `context` /
   `antiPatterns` field and write none of them.

   The emitted set is the existing edges in their authored order followed by the new ones, so
   **"never overwrite authored curation" is preserved in full** — nothing is removed or reordered.
   What is given up is "never re-add": an edge a curator DELIBERATELY DELETED returns if it is also
   derivable from a citation field, because the stored document cannot distinguish a deleted edge from
   one that was never seeded.

   Measured: 11 of the 13 agents already carried edges, so under the old rule every one of them would
   have been walked past. Under this rule 7 artifacts were EXTENDED and 162 were genuine no-ops — an
   artifact whose citations are already all present emits nothing at all, so a re-run does not churn
   `updatedAt` across the corpus.

3. **That re-add risk is accepted knowingly, and it is small today.** The first pass landed
   2026-08-14 and the 420-edge same-tier tail it handed to curators is untouched, so there is
   essentially no deletion history to lose. If curation deletions later become common the remedy is to
   RECORD them — a deletion is a curator's decision and deserves to be durable — not to restore the
   skip, which would permanently freeze every already-seeded artifact against any future pass.

## Consequences

- **The `uat-criterion` tier stops seeding zero** — 77 edges across 45 documents where there were
  none. That is the concrete asymmetry ADR-0365 measured and left standing, and it is the bulk of
  what this ADR actually delivers.
- **"Does this principle actually reach an agent?" becomes answerable from the graph, but it was
  ALREADY mostly answerable** and nobody had noticed. 179 of the 229 injected agent relations were
  already edges, seeded from `references` by the first pass, because agent authors happen to list the
  same unit in both fields. This ADR closes the remaining 47 and — more usefully — makes the answer
  no longer depend on that coincidence. An agent author who cites a principle ONLY in `rules`, which
  is what the field's own placeholder tells them to do, no longer drops off the graph.
- **The tech tree's shape barely moves**, contrary to what the raw 300 suggested. Principles and
  guardrails already carried most of their agent fan. `buildFocusGraph`'s `FAN_CAP` collapses
  per-parent overflow regardless, so the incremental 47 cannot produce a hairball.
- **An edge no longer tells you WHICH relation it encodes.** Folding "compiled into" and "cited" into
  one `standsOn` edge is a real loss of resolution, and it is the strongest argument that was weighed
  against this. It is accepted because both satisfy the operational test of a dependency, and because
  the DAG's purpose is to orient, not to classify. If the distinction is later needed, that is a new
  edge type and a new ADR — not a reinterpretation of this one.
- The seed remains a ONE-TIME migration, not a live rule. After it runs, `standsOn` is authored
  independently and may diverge from every citation field freely (ADR-0223 dec 5, unchanged).

## References

- ADR-0223 (the DAG and its dec 5 seed), ADR-0363 D1 (definitions excluded as targets), ADR-0365
  (placed `uat-criterion` at tier 6 and measured it seeding zero, leaving this open).
- `packages/library/src/standson-bootstrap.ts` — `CITATION_REFLISTS` and the pure projection.
- `packages/cli/src/standson-bootstrap.ts` — `pnpm standson:bootstrap [--write]`, the applier.
- `packages/library/src/standson-bootstrap.test.ts` — the contracts, including the extend-not-skip
  pair and the per-kind allow-list.
