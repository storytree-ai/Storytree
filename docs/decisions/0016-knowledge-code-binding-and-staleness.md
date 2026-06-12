---
status: proposed
decided: 2026-06-07
---

# ADR-0016: Knowledge↔code binding & staleness model

## Status

proposed (2026-06-07) — informed by
[`knowledge-code-binding-and-staleness`](../research/knowledge-code-binding-and-staleness.md);
refines [ADR-0006](0006-event-store-observability-surface.md) (event store) and the contract
`covers` field in `packages/core` ([ADR-0013](0013-structured-corpus-markdown-as-view.md));
prerequisite for [ADR-0017](0017-cross-cutting-knowledge-tier.md) (the knowledge tier).

## Date

2026-06-07

## Context

storytree has two logical planes with agents between them — a **knowledge library** and the
**story tree** — over one shared event store (ADR-0006/0009; corpus location corrected in
ADR-0017). A work unit's proof, and a knowledge artifact, **bind to specific code**. The
requirement (owner): when the code a binding points at changes, the agent must **see** it changed
(a staleness signal), never silently consume stale context.

Today the binding is `Covers = { file, lines }` — brittle: line numbers shift on any edit above
them, so the pointer rots. Research surveyed how mature systems solve this (Kythe symbol identity;
GitHub stack-graphs / Sourcegraph SCIP per-commit indexing; Unison/Nix content-addressing;
Hypothes.is/Fiberplane-Drift fuzzy re-anchoring; XTDB bitemporal history; Salsa incremental
revision-compare; g3doc freshness). The findings and their tradeoffs are in the research note.

## Decision

1. **Binding = a versioned, re-anchorable anchor** (replaces `Covers = {file, lines}`). An anchor
   carries: `file`; an optional `symbol`/AST path; a **`content_hash`** of the bound span; a
   text-quote fallback `{ quote, prefix, suffix }`; and **`bound_commit` + `bound_hash`** — the
   code version it was glued to. **Identity is separate from version** (the Kythe lesson): the
   anchor *what* and the bound *when* are distinct fields, never fused.

2. **The change unit is a *described change-event*.** Content-hash answers *"did the bytes
   change?"* (mechanical, unskippable); a short human/agent-authored **description** answers *"is
   this meaningful, and why?"* (semantic). A **described** change advances the binding's
   `bound_hash` and **propagates drift**; an **undescribed** change is **demoted** — filtered from
   consumer-facing operations (context assembly, drift propagation, the studio changelog, proof
   invalidation) but **kept in the event log** and recoverable via an explicit "show undescribed
   divergence" audit. *Demoted, not deleted* — nothing meaningful can silently vanish.

3. **Staleness = a lazy, explanatory drift flag.** `drift = current_hash != last_described_hash`,
   computed compare-on-read and surfaced to agents **with the description** of what changed — so a
   token-budgeted agent can decide whether the change affects it without re-deriving. Lazy now;
   eager CDC / dirty-bit propagation is a deferred seam (the monorepo-scale optimization).

4. **Two drift signals, matching the provenance model.** **Code-drift** — a binding's covered
   span changed (hash compare). **Source-drift** — an artifact's source ADR or upstream artifact
   changed (the `derives_from` DAG; ADR-0017). Knowledge with **no code anchor** (principles,
   guardrails) falls back to source-drift + g3doc-style **freshness** (owner + reviewed-date).

5. **History = bitemporal** (XTDB model). **Transaction-time** = the event log's natural order
   (audit, immutable). **Valid-time** = the described-change narrative, allowing backdated
   corrections without rewriting history. *"What did we know, bound to which code, when"* is an
   `as-of` query over the projection.

6. **Borrow the ideas, not the monorepo machinery.** Kythe and per-commit SCIP/stack-graph
   indexing are cited for identity/binding ideas only — their per-commit re-index cost does not
   pay off at single-operator scale (ADR-0012 borrow-when-needed; scale asymmetry).

## Consequences

- **`packages/core` schema change:** `Covers` upgrades from `{file, lines}` to the re-anchorable
  anchor above; contracts and knowledge units share it. The brittle line-pointer is retired.
- **Event vocabulary gains a `change` event** carrying `{ hash_before, hash_after, description,
  author }` — the described-change unit. This partially answers ADR-0006's open event-vocabulary
  question (§8) for change events specifically.
- **The binding+drift layer *is* the "agents-in-between" interface** the owner described: the two
  planes stay logically separate, linked by versioned anchors; agents read drift as a real-time
  input.
- **Re-location** (a refactor moves a span) is handled the clean way in-loop — the described
  change updates the binding — with the symbol/fuzzy anchor as the **fallback** for edits made
  outside the agent loop.

## What this does NOT decide

- The **re-location fallback granularity** — symbol/AST path vs fuzzy text-quote as the secondary
  layer (content-hash is settled as the primary detector).
- **Which revision** is canonical for `bound_*` — event-log transaction id, git commit SHA, or the
  span content-hash — and how they reconcile when an agent commits code and appends an event in
  one logical step.
- The exact **hashing** (AST-fingerprint vs normalized-text) and span boundaries.
- The **citing / reciprocity** mechanism and the **comments** layer — deferred (ADR-0017).

## References

- [`knowledge-code-binding-and-staleness`](../research/knowledge-code-binding-and-staleness.md)
  (the research note), [ADR-0006](0006-event-store-observability-surface.md) (event store),
  [ADR-0013](0013-structured-corpus-markdown-as-view.md) (`covers` is validatable),
  [ADR-0012](0012-tool-execution-pluggable-sandbox.md) (borrow-when-needed),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) (consumes this).
- Design conversation, 2026-06-07.
