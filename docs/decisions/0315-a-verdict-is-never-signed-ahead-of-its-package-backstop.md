---
status: accepted
decided: 2026-08-06
amends: [31]
load_bearing: true
---
# ADR-0315: A verdict is never signed ahead of its package backstop

## Status

accepted (2026-08-06) — decided/directed by the owner in conversation on 2026-08-06. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md), which stays
current: its worktree/promotion machinery is unchanged, and its package-grain regression wall is
still the push gate at chain end. One clause of it is reversed — see the Decision.

## Context

`--real` builds run their proof command under `tsx`, which strips types. The observation that a
package still typechecks and its suite still passes therefore cannot come from the proof run; it is a
separate, package-grain re-observation in the installed worktree. ADR-0031 wired that observation as
a **promotion** gate and said so explicitly:

> the suite gates *landing*, not *truth*

Two consequences followed, and stage one of `parallel-red-green-arc` measured both against the code
on `main` (2026-08-05, entry `sign-after-typecheck`):

1. **Single node** (`buildNodeReal`, `packages/drive/src/node-build.ts`): the typecheck + suite ran
   AFTER `proveUnit` returned. A red set `push: false` and nothing else. The signing row stayed.
2. **Story chain** (`packages/drive/src/story-build.ts`): worse. `promote: false` skipped the
   per-node backstop entirely, and the chain re-observed ONCE over the final stacked HEAD. So every
   chained verdict was signed with no package observation of its own commit at all, and a red at the
   end withheld the branch while leaving N signed passes behind it.

`main` was never at risk — CI re-proves before trunk (ADR-0022). What was at risk is the SIGNED
HISTORY: `events.verdict` could hold a PASS over a commit the repo's own typecheck rejects, and every
rollup that reads those rows renders the unit healthy. That is precisely the artifact the proof spine
exists to make trustworthy, and the gap was durable enough that agents carried it as a remembered
trap ("`--real` signs BEFORE it typechecks — read `typecheck:`/`promoted:` after every PASS"). A trap
every session must remember is a gap the machinery should close.

The fork was whether to move the backstop ahead of the signature (a typecheck per node) or to emit a
compensating event demoting the affected verdicts after the fact. The first is simpler and more
honest; the second is cheaper. The cost was measured on `@storytree/orchestrator`, warm: package
typecheck 96 s (93 s under gate contention), package suite 63 s, so **~2.7 min per node**. Against a
live `--real` node's authoring cost — two leaf slices, up to 150 turns, minutes to tens of minutes —
that is a small fraction, and the alternative is a knowingly-forgeable signed history.

## Decision

**A signed verdict may never out-run the package observation that backs it.** The backstop is now a
precondition on SIGNING, not on pushing.

1. **The gate owns it.** `ProveSpec` carries an optional injected `backstop` seam
   (`packages/orchestrator/src/prove-it-gate.ts`). `proveUnit` runs it inside phase GATE, AFTER the
   clean-tree check and the signer resolution and BEFORE the `store.appendEvent` signing call. A red
   backstop is a fail-closed GATE refusal exactly like an unclean tree: **no signing row is written
   at all**. The ordering is deliberate — a dirty tree or an unresolved signer still refuses without
   paying for a typecheck.
2. **It is a precondition, never evidence.** The backstop outcome is not a `TestObservation` and does
   not enter `verdict.evidence`. The two spine red/green observations remain the only evidence
   (ADR-0020 §3); the backstop decides whether they may be signed.
3. **Both drive paths pay it, per node.** `buildNodeReal` injects the seam for every install-bearing
   node — governed by `realConfig.install`, the same condition the post-hoc backstop used — and it is
   injected regardless of `promote`. `promote: false` now governs PROMOTION only.
4. **Per node, not per chain.** This is stronger than earlier, not merely earlier: a verdict attests
   ONE commit, and a chain-end observation over the stacked HEAD says nothing rigorous about commit 1.
   Per-node validates exactly the commit being attested.
5. **The chain-end backstop stays, unchanged, as the PUSH gate** (`observeBackstop` / `backstopJobs`,
   `packages/drive/src/chain-backstop.ts`). The two are not redundant and neither replaces the other:
   per-node gates the SIGNATURE against one commit; chain-end gates the PUSH over the whole stack,
   which can regress in ways no single commit's observation catches.
6. **A red short-circuits.** A red typecheck refuses without also paying for the suite: this is a
   refusal path, the first red is the actionable one, and no verdict is produced either way.

**The reversed clause.** ADR-0031's "the suite gates *landing*, not *truth*" no longer holds for the
per-node backstop. A red package typecheck or suite now means the unit is NOT PROVEN, not merely not
landable. ADR-0031's own text is corrected in place to match (ADR-0139); its decision otherwise
stands, and the sentence remains true of the chain-end push gate it also describes.

## Consequences

- A `--real` node now costs ~2.7 min more when it is install-bearing, and a chain pays that per node
  instead of once. Accepted on the measurement above; it is noise against authoring.
- A story chain that would previously have produced N signed passes and then withheld the push now
  HALTS at the first node whose package it broke. Fewer verdicts, all of them honest — and the halt
  names the failing package instead of surfacing at the end over a stack.
- The remembered trap retires. `typecheck:`/`promoted:` no longer need to be read after every PASS to
  know whether the PASS meant anything: a PASS cannot exist without a green backstop. The build
  report's red lines now say `verdict REFUSED before signing` rather than `push withheld`, because a
  red is why there is no verdict rather than a footnote on one.
- A node with no installed worktree (builtins-only, the default) carries no backstop and is
  unchanged, as are all dry-run and live-smoke walks: a gate with nothing to observe must not invent
  an expectation.
- Nothing is retro-active. Verdicts already signed under the old order keep whatever they attest;
  this ADR changes what may be signed from here, and deliberately does NOT introduce a compensating
  demotion event (the arm not taken).

## References

- [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — the amended ADR: the
  real-build worktree, promotion, and the package-grain regression wall.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate:
  §3 spine-observed red/green, §4 the forensic floor this backstop now joins.
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) — why `main` was never at risk, and why the
  gap was a signed-history gap rather than a trunk-safety one.
- `packages/orchestrator/src/prove-it-gate.ts` (`ProveSpec.backstop`, the GATE step),
  `packages/drive/src/node-build.ts` (`buildNodeReal`, the injected observation),
  `packages/drive/src/chain-backstop.ts` (the chain-end push gate, unchanged).
- Arc `parallel-red-green-arc`, increment `sign-after-typecheck` — the defect, the fork, and the
  measurement.
