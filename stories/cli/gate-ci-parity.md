---
id: "gate-ci-parity"
tier: capability
story: cli
title: "Gate↔CI parity — the local gate and CI verify stand in one declared two-way delta, checkable"
outcome: "The local pnpm gate and the CI verify invariant sets stand in one declared, checkable two-way relationship — a shared content floor, with every step outside it belonging to exactly one declared class and asserted BOTH ways, plus the HEAD-vs-merge-ref delta; a stale-behind-main branch is surfaced."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [486, 304, 195, 192]
# THE DECIDING ADR EXISTS NOW — ADR-0486 (accepted 2026-08-31), which this unit realises. It settles
# the contract for how far the local gate may differ from CI: one declared two-way delta (D1), the
# permitted delta classes CLOSED at three (D2), every member asserted BOTH ways (D3), both sides read
# from their REAL definitions at runtime (D4), and a SKIP is not an absence (D5). The old "no deciding
# ADR yet (owner escalation)" note is WITHDRAWN in place below: measured against `owner-fork-bar` the
# question cleared none of its three tests — reversible, internal, and a pure engineering tradeoff —
# and ADR-0304 D2 had already settled the direction.
#
# HOMED IN `cli`, NOT `ci-cd` — SETTLED 2026-08-31 (story-author). Authored under `ci-cd`; moved
# here. This is the mirror of `arc-explicit-id-fidelity`'s departure FROM this story under ADR-0369,
# and was settled on the same standard that departure records: the home must be right ON THE MERITS,
# not merely rule-satisfying.
#
# THE MERITS. `cli` already hosts three capabilities of exactly this shape — a PURE JUDGE, resident in
# `packages/cli`, invoked by a `check:*` rung, over a repo-wide fact no single organism owns:
# `organism-boundary-tooling` (`check:boundaries`), `work-hierarchy-camp-fence`
# (`check:hierarchy-camps`), `verification-decay-instruments` (`check:verification-decay`).
# `check:boundaries` is ITSELF a `verify` step, enumerated in `green-gate`'s own outcome — and its
# analyser is a `cli` capability, not a `ci-cd` one. That is the line this corpus has already drawn
# three times: `ci-cd` owns the PIPELINE (that a step runs, that it blocks, that it sits on the merge
# ref, that `automerge` needs it); `cli` owns the JUDGE a `check:*` rung invokes. This unit is the
# fourth judge, not a sixth pipeline fact.
#
# AND IT IS SOURCE-COUPLED TO THIS BUILDING, WHICH NO OTHER PLACEMENT DISSOLVES: the judge must read
# the `GATE_PLAN` literal out of `packages/cli/src/gate-order.ts` (Guidance below), the local gate's
# only real definition. Half this capability's subject IS `cli`'s own source. `repo-manifest.json`'s
# report-only `sourceOwnership` map had ALREADY assigned `packages/cli/src/gate*.ts` to this unit;
# that mapping is internally consistent for the first time now.
#
# THE OTHER TWO REMEDIES, AND WHY NOT. Giving `ci-cd` its own package would move the judge AWAY from
# the `GATE_PLAN` it reads, and would not make it any less a `check:*` rung. Adding `ci-cd` to the
# `hostedStories` register would be false to the register's own definition — the FROZEN set of stories
# whose proof-bound sources ALREADY lived in a foreign building at the 2026-07-13 adoption, which
# `ci-cd`'s never did — and reverses the direction ADR-0192 D3 exists to drive.
#
# `depends_on` DROPPED (was `[green-gate]`), and NOT to dodge a cross-story edge. Run the
# `cross-story-dependency` test literally, both ways: this unit needs the `verify` job to EXIST IN
# `ci.yml` — a repository fact it reads with `node:fs` — never `green-gate`'s DELIVERED OUTCOME
# consumed through `green-gate`'s boundary. No contract below consumes anything `green-gate` delivers;
# each derives its own answer from `ci.yml` and `GATE_PLAN` at runtime, and would pass or fail
# identically whether or not `green-gate` is ever signed. The old edge was DEFINITIONAL (shared
# subject), which the DAG does not encode. False both ways — so no `consumed_by` is owed on `ci-cd`
# either, and `cli` stays a pure source.
#
# ⚠ WHAT THE PRE-FLIGHT DID NOT CATCH, KEPT BECAUSE IT IS THE COSTLY PART. Driven `--real` under
# `ci-cd` on 2026-08-31 and PASSED (AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE,
# 3/3 contracts, $2.8028, persisted in `events.verdict`) — then `check:boundaries` refused the result
# on both rules at once. `storytree node resolve` had reported "REAL-buildable: yes": the money is
# spent BEFORE any boundary rung looks at where the file landed. Anyone adding a `real.sourceFile` to
# a story that owns no package pays the same ~$2.80 for an unlandable verdict. The authored pair is
# NOT lost and must NOT be re-authored — under THIS story the path it already has,
# `packages/cli/src/gate-ci-parity.{ts,test.ts}`, is the correct one.
#
# ✅ THE `real:` ARM IS RESTORED, AND POINTS AT THE SAME PATH IT ALWAYS DID. Under `ci-cd` that path
# was a foreign building; under `cli` it is this story's own, so `check:boundaries` rules 5 and 6 both
# pass over it. The arm is deliberately kept as a `real:` arm rather than demoted to a bare
# `proof.command`: `readUnitSourceFiles` gathers `buildConfig.real` ONLY, so a Class-B block would
# make this file INVISIBLE to the very rules this increment exists to satisfy. That invisibility is a
# limit of the evidence gatherer, never a licence to route around it.
#
# ⚠ THIS UNIT IS BUILT AND ALREADY SIGNED — DO NOT SPEND A `--real` RUN ON IT. The signed PASS binds
# to the unit id and survived the re-home (`storytree tree cli --pg` renders it ✓). Its source and
# tests exist and pass, so `CONFIRM_RED` — which is fail-closed — has no red left to observe and a
# `--real` run would HALT after charging for the attempt. `node resolve` still reports
# "REAL-buildable: yes"; that is the standing pre-flight gap named above, not an invitation.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/gate-ci-parity.test.ts"]
    sourceGlobs: ["packages/cli/src/gate-ci-parity.ts"]
  real:
    testFile: "packages/cli/src/gate-ci-parity.test.ts"
    sourceFile: "packages/cli/src/gate-ci-parity.ts"
    scope:
      testGlobs: ["packages/cli/src/gate-ci-parity.test.ts"]
      sourceGlobs: ["packages/cli/src/gate-ci-parity.ts"]
    install: false
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
    editsExisting: false
---

# Gate↔CI parity — the local gate and CI verify stand in one declared two-way delta, checkable

**Outcome —** The local `pnpm gate` and the CI `verify` invariant sets stand in **one declared,
checkable relationship** — they share a content floor, each side additionally keeps steps the other
does not (a TWO-WAY content delta, not an equality), and `gate` runs on the working tree / HEAD while
`verify` runs on the merge-with-`main` ref — and a branch that is stale behind `main` is surfaced. So
"my local gate was green but CI went red" stops being tribal knowledge and becomes a checkable fact
about a declared **shared content floor** plus two declared deltas: the **two-way content delta** and
the **merge-ref**.

> **No count is stated here, deliberately (ADR-0486 D4).** This paragraph and the frontmatter
> `outcome` both read "a content floor of eight checks" until 2026-08-31, and the frontmatter added
> "the local plan keeps ONE CI does not". Both were measured false that day — the floor is 21 and the
> local-only set has THREE members — and contract 1 below already carried the correction while these
> two lines still carried the error, so the file contradicted itself. The membership is derived at
> runtime from the real definitions; it is not transcribed into prose that goes stale.

> **✅ THE DECIDING ADR IS ADR-0486** (accepted 2026-08-31), and this unit realises it. The escalation
> note that stood here — *"No deciding ADR yet (owner escalation) … the contract for how far the local
> gate is allowed to differ from CI is arguably an architectural decision"* — is WITHDRAWN, not merely
> answered. Measured against `owner-fork-bar` the question cleared NONE of its three tests: the
> relationship is REVERSIBLE (a constant and a check over our own tooling), INTERNAL rather than
> outward-facing, and an ENGINEERING tradeoff rather than a value call — and both of the bar's own
> below-the-bar tells fire (the rationale is purely engineering; it cannot be put to the owner in one
> plain sentence without an ADR number). The DIRECTION was already settled one level up by ADR-0304 D2,
> which requires the gate and CI to share ONE affected-scope classifier precisely so a local pass
> predicts a CI pass. The friction remains real (per CLAUDE.md it stranded three PRs at once); what
> changed is that it is now a decided standard rather than an open question.

## Guidance

- **Proof-walkthrough first (integration test, against the REAL gate definition + the REAL
  `verify` job).** The capability is a *relationship between two existing things*, so the proof reads
  both and asserts the relationship — it does not re-run CI. Read the gate's step list from
  **`GATE_PLAN` in `packages/cli/src/gate-order.ts`** — NOT by parsing the `package.json` `gate`
  script's text, which since 2026-08-04 is just the runner invocation and names zero steps, so a text
  parse silently yields the EMPTY set (the same blindness that made `check-verification-decay.ts`'s
  `loadGateChecks` go dark when the `&&` chain was removed; a sweep of `pnpm gate`'s CALLERS does not
  find a consumer that reads its DEFINITION). **Slice to the `GATE_PLAN` literal itself** — the same
  file also declares `RETIRED_CHECKS`, so a whole-file search finds a retired rung (e.g.
  `check:manifest`) and reports it as LIVE, which silently falsifies every "absent from the local
  plan" negative. Then
  parse the `verify` job's step list out of `ci.yml`, normalise both to a SET of content checks, and
  assert the TWO-WAY relationship: the shared content floor is present in BOTH; the CI-only steps
  (`pnpm -r build`, the two PR-only guards, the pinned web-submodule checkout, affected-scope
  selection) are present in `ci.yml` and ABSENT from `GATE_PLAN`; and `check:verification-decay` is
  present in `GATE_PLAN` and ABSENT from `ci.yml`. The ref-delta stays `{HEAD vs merge-ref}`. Each
  side's set is declared as named constants the test compares against, and each direction is asserted
  BOTH ways — present here AND absent there — so adding a step to one and not the other, or MIGRATING
  a step between them, FAILS this check loudly. That is the whole capability: the
  delta is pinned, not folklore.
- This is a META-gate: it guards the *correspondence* of the two gates, not code behaviour. If the
  walkthrough can't be written as "extract both step sets, assert the declared delta," the capability
  is mis-scoped — re-tier rather than padding it with re-runs of the underlying checks.
- The stale-branch leg is the second half of "local-green / CI-red": even with identical step sets, a
  branch many commits behind `main` fails CI on the merge-ref while passing locally on HEAD. The
  capability surfaces this as a checkable condition (branch behind `origin/main`) with the standard
  remedy (`git fetch origin && git merge origin/main`, re-gate, push) — so a stale branch is DIAGNOSED,
  not left as a mystery red.
- The `build` delta exists for a real reason (recorded against [`green-gate`](../ci-cd/green-gate.md),
  which owns the `verify` job itself and lives in the `ci-cd` story): the packages export raw
  TS with no build step; the only buildable target is `apps/studio` (`vite build`), which can fail on
  something `tsx` tolerates. So `build` is legitimately CI-only — the parity contract DECLARES it as
  one of the declared CI-only steps, it does not try to eliminate it.

## Contracts (3)

1. **`declared-content-delta-is-two-way`** — the two invariant sets differ in BOTH directions, by named steps
   - **asserts —** `gateCiParity` reads the local `GATE_PLAN` and the CI `verify` job and reports a
     shared content floor present in BOTH sets, with every step outside that floor belonging to
     exactly one declared class — CI-ONLY ENVIRONMENTAL or LOCAL-ONLY SESSION-DISCIPLINE (ADR-0486 D2)
     — and every member asserted BOTH ways, present on the side that owns it AND absent from the
     other, so a step added to one side alone, or MIGRATING between sides, fails and is NAMED. A step
     matching no declared class fails as undeclared; there is no allowed undeclared difference in
     either direction.
     ⚠ **THE SET SIZES ARE READ, NEVER TRANSCRIBED** (ADR-0486 D4). This bullet deliberately pins no
     count: until 2026-08-31 it declared "a content floor of EIGHT checks" and named
     `check:verification-decay` as the sole local-only step, while the measured floor was 21 and the
     local-only set had THREE members (`check:desktop-route-coverage`, `check:verification-decay`,
     `check:definition-adjudication`). A test written from the old prose would have pinned a delta
     that does not exist. The judge derives both sets at runtime from their real definitions.
2. **`ref-delta-is-declared`** — HEAD-vs-merge-ref is a named, expected difference
   - **asserts —** the relationship records that `gate` runs on the working tree / HEAD while `verify`
     runs on the branch-merged-with-`main` ref, as the second declared delta — so a green local gate
     is documented to predict CI green ONLY up to contract 1's declared CI-only steps AND a non-stale
     branch.
3. **`stale-branch-surfaced`** — a branch behind main is diagnosed, not a silent CI surprise
   - **asserts —** a branch whose tip is behind `origin/main` is reported as stale (the
     "first suspect a stale branch" condition) with the `git fetch && git merge origin/main` remedy;
     an up-to-date branch reports clean. The merge-ref redness this predicts is exercised by
     [`green-gate`](../ci-cd/green-gate.md)'s `proves-against-merge-ref` — a CROSS-STORY pointer, not
     a dependency: that unit owns the pipeline fact, this contract surfaces its cause locally, and
     neither consumes the other's delivered outcome (see the `depends_on` note in the frontmatter).
