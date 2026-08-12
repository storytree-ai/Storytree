---
status: accepted
decided: 2026-08-12
amends: [232]
arc: codex-factory-parity-arc
---
# ADR-0356: Codex promotes only an explicit finite phase target set

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0232 D4 and its exact-one-file consequences. Codex still authors only in a disposable
replica and the spine remains the sole promotion/proof/signing authority; the promotion manifest is
widened from one exact path to one explicit finite set of exact paths.

## Context

ADR-0232 safely admitted Codex by allowing the spine to copy one named replica file into the real
build worktree. That boundary cannot express an ordinary bounded implementation unit whose source,
test, and export surface must change together. The current `permissionPaths` input already carries a
list, but production selects only its first entry as `targetRel`, reports only that file, and promotes
only that file. Treating phase globs as the promotion authority would make the set flexible at the
cost of admitting paths the spine never named exactly.

The owner chose the packing-list model: the spine names a finite manifest before authoring; after the
run it observes the replica, refuses any undeclared change, and copies only the declared changes.

## Decision

1. **Every Codex phase receives an exact finite promotion manifest.** It contains one or more
   normalized repository-relative `allowedTargets` and an explicit non-empty set of required phase
   targets contained within it. Wildcards, absolute paths, traversal, duplicates after
   normalization, and paths outside the disposable replica are refused before Codex starts. The
   spine authors this manifest; Codex cannot add to it.

2. **Observed changes, not the prompt or final response, drive promotion.** The spine snapshots the
   disposable replica before the turn and computes its complete changed-path set afterward, including
   additions, modifications, deletions, renames as delete-plus-add, and untracked files. At least one
   required phase target must carry the expected change and every required output must exist when the
   phase requires an output file. A Codex claim that it changed a file is not evidence.

3. **One undeclared change refuses the whole phase before any copy.** Every observed path must be an
   exact member of `allowedTargets` and must still satisfy the phase predicate. If one path is
   unlisted, ambiguous, missing when required, or otherwise out of scope, the spine copies nothing,
   reports the complete refusal, and discards the replica. There is no partial salvage.

4. **Only the observed allowed subset is copied.** The spine stages the admitted replica changes and
   applies them to the real build worktree only after the entire manifest check succeeds. Declared
   paths Codex did not change are not rewritten. Deletes are applied only when explicitly allowed and
   phase-valid. The resulting real-worktree diff is checked against the same manifest before the
   normal out-of-band proof proceeds.

5. **Proof and signing authority do not move.** Codex still receives no proof command, never decides
   red/green, and cannot sign or promote itself. The spine runs the registered proof over the combined
   multi-file result and emits a promotion only from the existing clean, green path.

## Consequences

**Good.** A single Codex phase can now implement the bounded source/test/export changes real units
require without weakening replica isolation. Review and refusal evidence show the exact packing list,
the observed subset, and any unexpected path. An undeclared write still dies with the replica.

**Cost / watch.** The author and spine must model a manifest rather than one `targetRel`; snapshot and
diff logic must handle additions, deletions, renames, and Windows path normalization. Atomic refusal
needs tests that prove no early file was copied before a later extra path was discovered. Large or
pattern-shaped output sets remain deliberately unsupported and require another decision rather than a
glob shortcut.

## References

- ADR-0232 — the Codex subscription leaf and disposable-replica boundary amended here.
- ADR-0031 / ADR-0064 — the deterministic spine and real build worktree retain proof authority.
- ADR-0110 — the owner's in-conversation direction is ratification.
- `packages/agent/src/codex-author.ts` — replica authoring and promotion boundary.
- `packages/orchestrator/src/resolve-prove-spec.ts` — spine-authored phase permissions.
