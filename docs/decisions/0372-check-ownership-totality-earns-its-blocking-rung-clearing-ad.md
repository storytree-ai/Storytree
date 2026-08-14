---
status: proposed
arc: verification-integrity-arc
amends: [317, 311]
---
# ADR-0372: check:ownership-totality earns its blocking rung, clearing ADR-0317 D2's bar

## Status

proposed — 2026-08-14. This is librarian curation over a landed increment
(`ownership-map-holds-totality` on `verification-integrity-arc`), not an owner-directed decision in
conversation, so under ADR-0110 it stays `proposed` rather than `accepted` until the owner ratifies.

**Amends** [ADR-0317](0317-code-ownership-is-a-declared-map-held-to-the-disk-by-a-total.md). D2
shipped the `sourceOwnership.subtrees` map REPORT-ONLY and set an explicit forward bar: *"ADR-0311
retired sixteen gate rungs for want of evidence, so the blocking rung must still earn its place on
the report's own numbers before it lands."* That bar is now cleared, on the evidence in Context below.
Nothing else in ADR-0317 is reopened: the map stays declared-not-derived, subtree-grain, and
`storytree ownership` itself keeps exiting 0 regardless of what it finds — this decision adds a
second, narrower, separately-wired instrument that reads the same map, exactly the shape
[ADR-0336](0336-re-wire-the-act-1-static-import-closure-check-as-a-new-narro.md) used for
`check:web-experience-closure`.

**Amends** [ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md). D5
requires that any check joining the gate beyond the nine audited survivors clear a fresh evidence bar
and get its own ADR. `check:ownership-totality` is not a re-admission of any of the sixteen D2
retired — the map it reads did not exist at that audit — so it is a new rung under D5's general rule,
following the precedent ADR-0336 already set for `check:web-experience-closure`.

## Context

**The bar ADR-0317 D2 set, restated precisely.** At authoring (2026-08-06) the map was hand-verified
to 527/527 files owned, but D2 declined to block on it: *"the blocking version was impossible because
it would red the repo against 398 files; against unowned subtrees the initial list is a walkable
backlog, so a ratchet becomes reachable rather than indefinitely deferred."* The condition for
landing a blocking rung was therefore evidence, not time: the report's own numbers had to show both
that totality is reachable AND that leaving it unwatched actually costs something.

**Both halves are now measured.** `capability-layer-coverage-arc` has walked the map down since
authoring; as of this landing 555 of 595 files carry a declared owner — 40 unowned, a shrinking and
walkable backlog rather than the 398-file wall D2 measured at file grain. (A separate population —
declarations that DO own their files but only at STORY grain — is now classified by WHY, per this
same increment's `storytree ownership` change; that is `capability-layer-coverage-arc`'s worklist and
orthogonal to the unowned count here.) That is the reachability half.

**The cost half is what forced the question.** Inside a single increment of
`capability-layer-coverage-arc`, totality broke three times with nothing watching:

- Twice from a SIBLING session's code landing on `main` between reads — a shared-backlog shape, not
  this branch's fault, and not what this decision charges (see D1).
- Once from the authoring session's OWN commit: two new
  `packages/cli/src/typecheck-aperture*.ts` files were born under no declared subtree, and **a FULL
  `pnpm gate` went green with the map already incomplete** (2026-08-14, PR #1326). `storytree
  ownership` is report-only by design (ADR-0317 D2) and `check:boundaries` is correct at package
  grain — the package itself was owned all along — so neither instrument was ever going to catch this.
  Nothing sat between the author and the decay.

That third break is the evidence ADR-0311's survival standard asks for: a concrete, reproduced escape
that recurs without a rung watching for it, repairable in one line by the only party who knows what
the new file is for. `capability-layer-coverage-arc`'s own remedy — hand-repairing the map on every
increment — is exactly the standing-drain cost a blocking rung on the AUTHORED half would remove.

## Decision

**D1 — a new gate rung, `check:ownership-totality`, is wired.** Source:
`packages/cli/src/check-ownership-totality.ts` (the shell) and
`packages/cli/src/ownership-totality.ts` (the pure judge). It partitions every currently-unowned file
by authorship, charged against `git merge-base origin/main HEAD` — the same rule
[ADR-0301](0301-drain-ceilings-charge-by-authorship-verification-decay-and-g.md) decided for
`check:verification-decay` and `check:graduation-worklist`, reused here as vocabulary rather than as
a shared import (the module's own header names this explicitly: *"the same line `decay-attribution.ts`
draws"*):

- **AUTHORED — RED.** A file this branch adds that falls under no declared subtree, or a file that
  WAS owned at the merge base and is unowned now (this branch removed or narrowed the declaration
  covering it). Only this branch's own diff can produce either condition.
- **INHERITED — WARN, never charged.** Already unowned at the merge base. Named and counted, remedy is
  the standing drain (`storytree ownership --all`), exactly as ADR-0301 D2 treats an inherited
  verification-decay breach.

It is wired `own-work` / `seconds`, in `GATE_PLAN` immediately after `check:boundaries` and in
`PRE_EXPENSIVE_CHECKS` (`packages/cli/src/gate-order.ts`) — cheapest-first, alongside the other
branch-local checks ADR-0311 Axis 1 orders ahead of the two `-r` legs.

**D2 — this is deliberately NOT a sixth verification-decay instrument.** ADR-0252 D1 chartered four
cheap instruments and ADR-0278 D1 added a fifth, each locating a REGION a later adversarial pass may
refute — which is why none of them blocks per finding (the ~75% false-positive rate ADR-0252 measured
governs every one of them). `check:ownership-totality` has no such surface: a file either falls under
a declared subtree or it does not, an exact and mechanical assertion with nothing for an adversarial
pass to refute. It therefore sits on the `check:boundaries` / `check:mirror-conformance` side of
ADR-0252's own boundary between exact and heuristic checks, where blocking is honest rather than
premature. Nothing in ADR-0252 or ADR-0278 is reopened by this decision, and — per
`ownership-totality.ts`'s own header — *"a sixth [decay instrument] is an amendment to an accepted ADR
and therefore an owner call, not a curation one"*; this ADR does not attempt that call, because this
rung is not that shape.

**D3 — `storytree ownership` (the report command ADR-0317 D2 shipped) is unchanged.** It still exits
0 regardless of what it finds; `check:ownership-totality` is a separate, narrower instrument that
reads the same declared map. A reader who wants the full backlog, including everything this rung
never charges, still runs the report.

**D4 — `check:ownership-totality` joins ADR-0311's gate beyond the audited nine, under D5's evidence
bar**, alongside `check:web-experience-closure` (ADR-0336). ADR-0311 D1's nine-rung list remains the
closed set that survival audit certified; it is not amended to include this rung retroactively, and
this ADR is the fresh decision D5 requires rather than a reopening of that audit.

## Consequences

**Good.** Totality — the property that makes the map worth having at all — is now held continuously
between drain sessions rather than eroding silently until the next hand sweep notices. The fix a red
demands is always a single `repo-manifest.json` entry, authored by the only party who knows what the
new file is for, and the rung has no false-positive surface to weigh against that cost. It closes the
exact gap PR #1326 demonstrated: a FULL green gate no longer certifies a map that just went
incomplete.

**Bad / accepted.** A second gate rung now reads `repo-manifest.json`, alongside `check:boundaries`;
both fail the same way if the manifest becomes unreadable, and `judgeOwnershipTotality` throws
(rather than passing clean) on every enumeration it cannot observe for exactly that reason. The
INHERITED backlog — 40 files at this landing, entirely `residue`-class — remains warn-only and is not
fixed by this rung; its remedy is still the standing drain `capability-layer-coverage-arc` already
owns. Subtree grain's accepted coarseness (ADR-0317 D2: a subtree may contain a file that morally
belongs to another owner) is untouched — this rung can only assert that a file falls under SOME
declared subtree, never that it is under the RIGHT one.

## References

- [ADR-0317](0317-code-ownership-is-a-declared-map-held-to-the-disk-by-a-total.md) D2 — the map, its
  report-only shipment, and the forward bar this decision clears.
- [ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md) D1/D5 — the
  audited nine and the evidence-plus-ADR requirement any addition must clear.
- [ADR-0301](0301-drain-ceilings-charge-by-authorship-verification-decay-and-g.md) — the
  authorship-charging rule (`git merge-base origin/main HEAD`, AUTHORED vs INHERITED) this rung
  reuses as vocabulary, applied to a second instrument.
- [ADR-0336](0336-re-wire-the-act-1-static-import-closure-check-as-a-new-narro.md) — the direct
  precedent: a narrow new gate rung, amending ADR-0311, for one property of a retired/never-blocking
  surface.
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) /
  [ADR-0278](0278-a-fifth-verification-decay-instrument-an-injected-seam-whose.md) — the
  decay-instrument shape (locate-then-adversarially-refute, advisory per finding) this rung is
  deliberately NOT: it has no false-positive surface for a refutation pass to work on.
- `packages/cli/src/check-ownership-totality.ts` / `ownership-totality.ts` — the rung and its pure
  judge.
- `packages/cli/src/gate-order.ts` — `GATE_PLAN`, `PRE_EXPENSIVE_CHECKS`.
- `capability-layer-coverage-arc` / `verification-integrity-arc` increment
  `ownership-map-holds-totality` — the landing this decision curates, and PR #1326, the measured
  self-landing case (two new files born unowned, a full gate green regardless).
