---
status: accepted
decided: 2026-06-10
---

# ADR-0028: Merge the v1 cautionary lessons into their positive counterparts — fold the scar evidence, retire the standalone units

## Status

accepted (2026-06-10). Resolves the open-question `oq-anti-pattern-lessons`, which
[ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §"What this does NOT decide" recorded as
**deferred by the owner**. Applies ADR-0018 §6's open-question lifecycle (owner comments in the studio
→ an agent judges the feedback resolves it → record the decision in an ADR → retire the open-question)
and follows the precedent set by ADR-0018 §D5 (`own-the-layers` absorbing the retired
`vibe-the-load-bearing-layers`). Builds on the event-sourced Library
([ADR-0017](0017-cross-cutting-knowledge-tier.md)) and the live-store-as-source-of-truth posture
([ADR-0023](0023-library-cli-choose-your-own-adventure.md)).

## Date

2026-06-10

## Context

The Library carried three v1 "cautionary lesson" units in a `pattern` sub-bucket (`// pattern:
practices & cautionary lessons`). They describe v1 *mistakes*, not reusable approaches you apply — so a
newcomer scanning `pattern` could not tell a warning from an endorsed playbook, and the Library risked
reading its own past scars back as advice to repeat. `oq-anti-pattern-lessons` parked the question of
where the two **remaining** lessons belong (the third, `vibe-the-load-bearing-layers`, was already
folded into `own-the-layers` in ADR-0018 §D5, the precedent here). Each lesson has a positive
counterpart — the practice v2 adopted *instead*:

| cautionary lesson (a v1 mistake) | the practice v2 keeps instead |
|---|---|
| `auto-merge-on-green` | `approval-gated-trunk` (guardrail) |
| `store-lock-races-and-id-collisions` | `claims-in-the-shared-store` (guardrail) |

The open-question offered three options: **A** — keep + cross-link each lesson to its counterpart
(non-destructive, honours the bucket); **B** — merge & retire (fold the lesson's v1 evidence into the
counterpart and retire the standalone unit; DRY-est, loses standalone discoverability); **C** —
recategorize the lessons to `principle` stated negatively (keeps them standalone but stops calling them
patterns). The non-binding recommendation was A. **The owner commented "Go with B" in the studio.**

## Decision

1. **Option B — merge & retire.** Each lesson's substantive v1 evidence is folded into its positive
   counterpart, and the standalone lesson unit is **retired** (removed from the corpus; in the live
   event-sourced store this is a `deleted` event over the projection, so the history is preserved —
   [ADR-0017](0017-cross-cutting-knowledge-tier.md)). No evidence is lost in the merge.

2. **Where the scar evidence lands — the counterpart's "Why".** Both counterparts are **guardrails**,
   whose "Why"-equivalent field is **`failureMode`** ("Failure mode prevented" — *what breaks if the
   boundary is crossed*). That is the natural home for a cautionary tale, mirroring how the
   principle `own-the-layers` absorbed `vibe-the-load-bearing-layers` into its `why` (ADR-0018 §D5):
   - **`auto-merge-on-green` → `approval-gated-trunk.failureMode`.** Preserved: v1 auto-merged the
     moment tests went green and tolerated broken intermediate states *under an eventual-consistency
     posture*, so the mainline was knowingly-broken at times; the throughput-vs-trust trade; v2's
     inversion (green = a *request for human diff-review*, never an automatic merge).
   - **`store-lock-races-and-id-collisions` → `claims-in-the-shared-store.failureMode`.** Preserved:
     under concurrency v1 hit store-lock races and in-process story-ID collisions (*even duplicate ADR
     numbers*); the root cause (concurrency-safety *retrofitted rather than designed in*); v2's stance
     (concurrency-safe state as a *foundation, not a retrofit* — the claim + DB-allocated collision-free
     ids dissolve both classes), and that the remedy stands on the deferred DBOS path (ADR-0019), so the
     claim layer is named/intended, not yet built.

3. **`claims-in-the-shared-store` is the single home for the concurrency scar — not also
   `durable-workflow-per-node`.** The open-question allowed folding the store-lock evidence into the
   claims guardrail *and/or* the `durable-workflow-per-node` pattern. Both halves of the scar
   (store-lock races **and** id collisions) are write-ownership / shared-state concerns the claims
   guardrail already owns and already cross-references the DBOS path for. Duplicating the same scar
   across two units would re-create exactly the redundancy the open-question objected to, so it lands in
   one place; `durable-workflow-per-node` is unchanged.

4. **Fix the dangling pointer.** The `trunk` definition cited `asset:auto-merge-on-green`; that pointer
   is removed (it already cites `asset:approval-gated-trunk`, the merge target, so no reference is
   lost). This keeps the referential-integrity check ([ADR-0026](0026-library-schema-migrations-and-health-checks.md) §6)
   at zero dangling `asset:` pointers.

5. **Retire `oq-anti-pattern-lessons`** per the ADR-0018 §6 lifecycle — the question is now resolved by
   this ADR, so the open-question unit is retired (and the owner's studio comment resolved). No manual
   close by the owner.

## Consequences

- Library units **94 → 91** (the two lessons + the resolved open-question retired). `assets.json` and
  `docs/glossary.md` were regenerated from `knowledge.json` (`build-corpus.mjs`); the glossary is
  byte-unchanged (the retired units carried no `glossaryBody`).
- The two counterparts' `failureMode` now carries the full v1 cautionary evidence — the warning lives
  *inside* the guardrail it justifies, so a reader meets the scar exactly where the practice that
  answers it is defined, never filed beside a recommended playbook.
- Standalone discoverability of the lessons is traded away (the named trade-off of option B); the
  evidence is preserved in the counterpart and the event history retains the retired units.
- The seed (`knowledge.json`) and the live Cloud SQL store were updated in lockstep (the counterpart
  edits via `storytree library artifact edit --pg`; the three retires via a `deleteDoc` over the live
  projection) so the structured source and the authoritative store stay consistent.
- `oq-anti-pattern-lessons`'s parking note in ADR-0018 §"What this does NOT decide" is now closed by
  this ADR.

## References

- [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) (§6 open-question lifecycle; §D5
  `own-the-layers` precedent; §"What this does NOT decide" deferred this question),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) (event-sourced Library — retire = `deleted` event,
  re-projectable history), [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (DBOS deferred — why the
  claim layer is named/intended, not built), [ADR-0023](0023-library-cli-choose-your-own-adventure.md)
  (the live store is the source of truth; the CLI write surface used here),
  [ADR-0026](0026-library-schema-migrations-and-health-checks.md) (referential-integrity / health gate).
- Units changed: `approval-gated-trunk`, `claims-in-the-shared-store` (enriched `failureMode`); `trunk`
  (dangling pointer removed). Units retired: `auto-merge-on-green`, `store-lock-races-and-id-collisions`,
  `oq-anti-pattern-lessons`.
- `apps/studio/data/knowledge.json` (seed), `apps/studio/data/build-corpus.mjs` (generator).
