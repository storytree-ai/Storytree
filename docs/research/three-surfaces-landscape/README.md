# Three-surfaces landscape research

The research backing storytree's **three-surfaces** thesis: a neutral, fully-cited survey
of how the AI-coding-agent field (2023–2026) relates to storytree's model of three
"attention surfaces" for managing agent context —

- **library** — a curated/validated knowledge tier,
- **storytree** — the codebase as an *authored, top-down* DAG (story > capability > contract;
  story = organism/microservice, capability = organ),
- **noticeboard** — a dependency-aware task/work tier as agent external memory.

These docs are written **website-ready** (neutral tone, primary-source citations, no personal
claims) so they can be lifted straight into the public storytree site when the web submodule is
scaffolded. The headline page is `three-surfaces.md`; the rest are the receipts behind it.

## What's here

| File | What it is |
|---|---|
| [`three-surfaces.md`](three-surfaces.md) | **The centerpiece thesis essay** (~1,650 words). The problem (context window + no memory), the three surfaces, how the field converged on each piece, the two things still distinctive (no one unifies the triad; the code-map is at a different *altitude*), honest caveats, and the open question. Start here. |
| [`competitors/gastown-loom.md`](competitors/gastown-loom.md) | Deep dive on Steve Yegge's **Gas Town**/Beads and Geoffrey Huntley's **loom**, scored against the three surfaces. Both converge on ~the noticeboard; neither unifies the triad. |
| [`competitors/ecosystem-landscape.md`](competitors/ecosystem-landscape.md) | The wider ecosystem: code-map cohort (Aider, CodeGraph, Augment, Cody), library cohort (Anthropic Skills/memory, Letta), noticeboard (Beads), spec-driven (Spec Kit, Kiro). Master scorecard + the symbol-vs-architecture altitude finding. |
| [`convergence-timeline.md`](convergence-timeline.md) | A dated, primary-sourced timeline of the field converging on structured agent-context surfaces (Dec 2024 → Nov 2025). |
| [`sources.md`](sources.md) | Consolidated, deduplicated bibliography (~45 sources) with quality ratings, grouped by topic, plus a "refuted/contested" section. |
| [`raw/`](raw/) | The **verbatim** deep-research workflow outputs (JSON) these docs were synthesized from — full provenance. |

## Provenance

Synthesized on **2026-06-08** from three adversarially-verified deep-research passes
(fan-out web search → primary-source fetch → 3-vote claim verification → synthesis):

1. `raw/2026-06-08_gastown-loom.json` — Gas Town & loom.
2. `raw/2026-06-08_ecosystem-three-surfaces.json` — the wider ecosystem sweep.
3. `raw/2026-06-08_convergence-dates.json` — dating the convergence events.

## Honesty notes (carried into every doc)

- **Point-in-time snapshot.** Sources span ~2023–Jun 2026; the fast movers move fast. "No one
  unifies all three" is a finding about the *surveyed sources at this date*, not a guarantee.
- **The surface mappings are analytical** — Beads-as-noticeboard etc. is this survey's framing,
  not the authors' own language.
- **Refuted/contested claims are flagged, not buried** — the Augment/Cody "pure RAG" reading and
  the arXiv 2310.00297 "momentum analog" reading both failed verification and are marked as such.
- **Coverage gaps** — Cursor, Cline/Roo, Devin, Factory, OpenHands, Windsurf, GraphRAG produced
  no verified claims and are deliberately off the scorecard (absence of evidence ≠ absence).
