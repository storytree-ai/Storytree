# ADR-0010: Agent-guidance system — forum + trace explorers + injectable assets

**Status:** proposed (2026-06-04) — un-parks v1 ADR-0007 (assets) + ADR-0011 (forum).

## Decision

Agent behaviour and guidance are a **separate system from the proof tree** — about *friction* (helping agents work well), not proving something mechanically works (that's ADR-0007). Three parts, all built on the event store (ADR-0006) and surfaced in the studio (ADR-0008):

- **Guidance assets** — guidance is modular, not monolithic. Small typed, reusable units (`principle` = how to judge · `definition` · `guideline`) that are **injected** into an agent's context on demand, authored and curated independently of any one node. (Carries v1's `assets/` model; `asset` is taken by tree-art in the glossary, so these are **guidance assets**.)
- **Forum** — per-topic threads of posts (author, timestamp, references) where humans and agents leave async notes and feedback, including the inline comments that ride on ADRs and units. A node's thread *is* its channel (folds in v1's channel/post).
- **Trace explorers** — views that navigate the event log (ADR-0006) to see what an agent actually did — the raw material for reducing friction and writing better guidance.

Boundaries:
- **Not proof.** Nothing here gates promotion. Guidance reduces friction; proof (contracts/UAT, ADR-0007) decides health.
- **Guardrails live elsewhere** — a behaviour that must be deterministic is code with a contract (ADR-0007), not a guidance asset.
- **Verification-wins:** when guidance and on-disk evidence disagree, evidence wins (v1 ADR-0011; reject recency-based memory consolidation).

The **foundation studio UI** (forum-style ADR/guidance browser + inline comments + a guidance-asset library; no story-tree yet) is the first surface of this system.

## Open

Asset schema + the injection mechanism (how an asset attaches to an agent's context) · the curation/graduation flow (when a forum note becomes a guidance asset) · whether trace explorers are studio-only or also an agent tool. Tracked in open-q §5/§9.
