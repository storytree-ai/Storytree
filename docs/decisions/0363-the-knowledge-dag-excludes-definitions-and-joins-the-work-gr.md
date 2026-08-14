---
status: accepted
decided: 2026-08-14
amends: [223]
arc: directional-dag-arc
---
# ADR-0363: The knowledge DAG excludes definitions and joins the work graph by projection

## Status

accepted (2026-08-14) — decided/directed by the owner in conversation on 2026-08-14, answering the two
questions `standson-corpus-bootstrap` was parked behind. Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask.

**Amends ADR-0223 (its dec 3 tier table, in part).** ADR-0223 placed `definition` in tier 1 alongside
`techstack`. D1 below removes it from the DAG entirely. Every other row of that table, and all of
ADR-0223's other decisions, are untouched — read its dec 3 tier 1 through this ADR.

*Body written 2026-08-14 by the session that drove the bootstrap.* The number was allocated and the
scaffold stamped `accepted` when the owner answered, but the body was never filled and the file was
never committed — it survived only as an untracked scaffold in the primary checkout, while the two
decisions themselves were recorded verbatim in the `standson-corpus-bootstrap` increment. This body is
transcribed from that contemporaneous record; it completes the file, it does not make a new decision.

## Context

ADR-0223 made the knowledge DAG an authored `standsOn` edge over a fixed tier order, to be bootstrapped
once from down-tier citations. Two questions had to be answered before that bootstrap could compute a
tier for every artifact, and both were parked on the arc as open questions.

**Question 1 — is the definition tier a DAG at all?** The shipped cycle detector was run over the live
citation web on 2026-08-13: **300 knowledge artifacts, 827 edges, 166 cycles, 114 of 300 sitting in at
least one.** The shape split cleanly. Definitions were the densest core — 57 mutual pairs, and
mutually constitutive *by meaning*: `story ↔ capability`, `capability ↔ contract`, `dag ↔ node`,
`verdict ↔ uat`. You cannot define "story" without "capability" or the reverse. Orienting those pairs
means picking an arbitrary winner and calling it foundational, which records a fact about the curator
rather than about the knowledge. Principles, by contrast, mostly cite each other as "see also" —
genuinely optional edges, cheap to orient or drop.

**Question 2 — do story nodes become tier 0?** The owner had earlier corrected that "storynodes should
be tier 0". That is larger than it sounds: the `story` / `capability` / `contract` ids *in the corpus*
are definition artifacts, not work nodes. Real story nodes live in `stories/**` with their own
`depends_on` DAG and are not library artifacts at all. So the correction reads as a proposal to unify
the work graph with the knowledge graph — measuring depth as "how far is this knowledge from the actual
work" rather than "how far from the decision that ratified it".

## Decision

1. **The definition tier is EXCLUDED from the knowledge DAG.** Definitions keep `references` only and
   carry no `standsOn`, joining `friction` and `open-question` as tiers the DAG does not orient
   (ADR-0223 dec 1's edge-free class; `proposal` was named there but that kind no longer exists —
   ADR-0298 / ADR-0305 D1). ADR-0223 dec 3's tier 1 therefore holds `techstack` alone.

   **The owner's reason is that the depth definitions would contribute buys nothing a reader uses:** a
   separate mechanism already injects definitions into an agent's context, so a model never needs to
   grep or traverse them. Their position in a dependency ranking is not consulted by anybody, which
   makes the arbitrary-winner cost of orienting the mutual pairs a cost paid for nothing.

   Enforced at the schema (`EDGE_FREE_KINDS`), so a definition cannot carry the edge at all rather than
   merely being skipped by one projection. What the schema cannot enforce is the other direction — a
   per-doc zod schema cannot see target kinds — so the *bootstrap* additionally declines to point at
   definitions, and a hand-authored edge into one stays legal and harmless (a definition carrying no
   outgoing edge is a sink and cannot close a cycle).

2. **The work graph joins the knowledge graph by PROJECTION, not by merger.** Story nodes do NOT become
   tier 0. The two graphs stay separately enforced on their own substrates — `standsOn` over the
   library corpus, `depends_on` over `stories/**` — and "depth from the work" is computed as a
   **read-only join at render time**, owned by the studio increment. Nothing in the corpus records it
   and no gate enforces it.

   This answers the owner's correction without merging two graphs that have different authors,
   different write paths and different gates. Tier order is otherwise unchanged from ADR-0223 dec 3.

## Consequences

- **Good.** The bootstrap becomes tractable: the part of the cycle census that could only ever have
  been resolved by arbitrary curator fiat is removed from the problem rather than decided badly.
- **Measured, and it corrects the estimate this ADR was expected to justify.** Re-running the detector
  over the citation web *minus* definitions on 2026-08-14 left **112 cycles across 71 nodes**, down
  from 166 across 114. So the exclusion removed about a third of the cycles, **not the bulk of them** —
  definitions were the densest core but never the whole of it. The residue is real and lives almost
  entirely in tier 2 (principle / pattern / guardrail cite each other 420 times). It does not block
  anything: those are `references`, which are unconstrained, and the down-tier projection is acyclic by
  construction regardless. It does mean the "curation tail" ADR-0223 dec 5 hands to curators is
  substantially larger than that ADR's Consequences estimated.
- **Cost.** The tier table is now split across two ADRs. Anyone computing a tier must read ADR-0223 dec
  3 *and* this ADR — which is what the `amends` edge is for.
- **Bad / watch.** Depth-from-work existing only at render time means it is never validated by a gate.
  A broken join surfaces as a wrong-looking picture, not as a red rung.

## References

- ADR-0223 — the ADR this amends: the authored `standsOn` edge, the tier order (dec 3) and the
  bootstrap-from-down-tier-citations rule (dec 5).
- ADR-0110 — design-time alignment is ratification (why this is born `accepted`).
- ADR-0139 — correct-in-place vs supersede-and-replace; why this is an `amends` edge and not a
  superseding ADR.
- `packages/library/src/knowledge.ts` — `EDGE_FREE_KINDS`, where D1 is enforced.
- `packages/library/src/standson-bootstrap.ts` — the tier order and the projection D1/D2 parameterise.
- Arc: `directional-dag-arc`; increment: `standson-corpus-bootstrap`.
