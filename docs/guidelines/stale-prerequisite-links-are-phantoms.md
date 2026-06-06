# Stale prerequisite links are phantoms

**Rule:** distinguish two kinds of rigidity in the story DAG. The proof ladder *inside* a unit (contract → integration → UAT, anything upstream invalidates everything downstream) is sacred. A declared cross-story dependency edge is **contestable**: it can encode a belief that has since become false. When a cross-story `boundary` edge gates a unit and a staleness suspicion arises, the question is not only "heal the upstream story" — it is also "is this edge itself a phantom?"

## Why this matters

Across stories, one story may depend on another only through a declared **boundary** (see the glossary). That edge makes a story's proof meaningful in context: signing a downstream story whose upstream boundary is broken would attest to a chain you cannot actually rely on. But edges go stale — most often when an ADR or an upstream story's interface is amended and a downstream story still carries an edge reflecting the old intent. The entanglement the edge claims no longer exists. It is a phantom: still drawn on the map, pointing at nothing.

Removing a phantom edge is **map correction**, not discipline loosening. The cross-story dependency mechanism stays load-bearing; the removed edge was never load-bearing, it was stale data. (The within-unit proof ladder is untouched by any of this.)

The DAG has a built-in focus mechanism: a unit whose upstream boundary is unhealthy will not be promoted, so downstream branches stay dormant until upstream heals. That is by design and makes speculative downstream authoring cheap. What the tree cannot tolerate is a unit whose promotion path has decayed to point at the *wrong* upstream. Removing a phantom restores the focus.

## The discriminator

Compare what the two stories' proofs actually verify — observable-anchored, not authorship-anchored:

- Read the downstream story's declared interface and the observables its UAT/integration tests pin.
- Read the candidate-upstream story's declared boundary and the observables its tests pin.
- **No shared observable** — neither story's proofs touch the same boundary surface, error variant, or data shape → the edge is a **phantom**. Removable.
- **Shared observable** — the downstream behaviour assumes a property the upstream's proofs pin → the edge is **load-bearing**. Keep it.

Edge cases: partial overlap keeps the edge (it still pins something real); if the downstream's own proofs are stale, amend the downstream first (defects amend the owning story), then re-run the discriminator; do not edit an edge to point at a *different* entanglement — map correction removes edges that point at nothing, it does not re-target them.

## Three branches

1. **Load-bearing → heal the chain.** Shared observables exist. Drive the upstream story to `healthy`, then re-prove the downstream. Do not surface; this is exactly the rigidity the cross-story dependency exists to enforce.
2. **Phantom → amend the downstream.** No shared observables. Surface to the operator — DAG-shape changes are operator-adjudication territory. Name the two stories, the discriminator finding (downstream observables vs upstream observables, empty intersection), the likely authorship context, and the proposed edit (remove the edge). On approval, route the boundary amendment to the owning story.
3. **Hard call → stop and surface.** The downstream is mis-scoped, two stories overlap on the contested surface, or the "amend first" chain runs more than one story deep. Stop. Surface the structural concern with the story ids and observed proof states. Wait for direction.

When in doubt, heal the chain: the cost of healing one extra upstream is small; the cost of removing a load-bearing edge by mistake is letting a future unit prove `healthy` while standing on an unverified foundation.

Composes with [defects-amend-the-owning-story](defects-amend-the-owning-story.md): that rule routes a defect *set* after a failed UAT (DAG-shape *expansion*); this rule routes an *edge* under an unhealthy-upstream gate (DAG-shape *contraction*). Both surface to the operator before changing the DAG shape.
