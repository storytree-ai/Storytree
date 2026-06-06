# Defects amend the owning story

**Rule:** a defect surfaced against a unit is a gap in that unit's existing proof coverage, not a new work item. The fix is to **amend the owning capability** (the one whose contract the defect violates) — add the test that pins the missing behaviour, re-prove red→green, re-run the story's UAT — reverting it to `building` until it proves green again. Do not spawn a new unit per defect.

This is the rule already named in the glossary as **defects-amend-the-owning-story**; this doc elaborates it.

## Why this matters

A story is the single owner of its bounded context's contract. Defects in that context are gaps in its proofs' coverage. Spawning a "fix story X" unit per surfaced defect fragments the corpus into a briar patch where every story patches another and no story owns a coherent domain.

The reflex on "this unit has N defects" must be "what test entries are missing that would pin the N behaviours?" — not "draft N follow-up units." The operator authored the story and its outcome precisely so the loop can run without per-defect consultation; re-litigating the story's existence on every failed UAT defeats the point.

## The discriminator

Does the defect describe an observable inside the unit's existing domain, or a genuinely new contract shape (a new surface, a new boundary, an observable beyond the unit's stated outcome)?

- **Inside the existing domain** → amend the owning unit.
- **Genuinely new contract shape** → judgment call; surface to the operator. Default is still amend; "new unit" is the exception requiring explicit justification.
- **Implies the contract is wrong, not just incomplete** (the outcome describes the wrong value, the unit is split at the wrong seam, or the defect crosses a boundary the unit should never have crossed) → stop and surface; the unit may be mis-scoped.

## Three branches

1. **Amend and iterate.** The unit is `building` (or reverts from `healthy` on amendment), and the defects belong to its existing domain. Re-run the proof cycle on the *same* unit: add a test per defect (each pinning the correct behaviour), drive it red then green, re-run the story UAT, loop on failure with the new defects. The defects are the iteration's *input*, not candidate follow-up units — do not surface them as such.
2. **New contract shape.** A defect implies a surface outside the unit's stated outcome. Surface to the operator: the defect, the unit's outcome, the gap between them. The operator decides whether to expand the outcome (still amend), draft a new unit (rare, explicit), or defer. This changes the DAG shape, so it is the operator's call.
3. **Stop and surface structural.** The defect implies the contract itself is wrong, crosses a boundary the unit should not have crossed, or cannot be expressed as a new test without restating the whole outcome. Stop, surface the structural concern with the unit id, its outcome, the defect's shape, and why amend-and-iterate cannot absorb it. Wait for direction.

When amending pins a defect, the *shape* of the new assertion matters — pin the real observable, not another shape an implementation can shortcut around. See [implementer-shortcut-patterns](implementer-shortcut-patterns.md): amend-and-iterate closes the routing loop; a depth assertion closes the authoring loop so the same defect class does not recur on the next pass.

Composes with [stale-prerequisite-links-are-phantoms](stale-prerequisite-links-are-phantoms.md): this rule's new-contract-shape branch *expands* the DAG; that rule *contracts* it by removing a stale edge. Both reach the operator before the DAG shape changes.
