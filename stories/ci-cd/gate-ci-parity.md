---
id: "gate-ci-parity"
tier: capability
story: ci-cd
title: "Gate↔CI parity — the local gate and CI verify stand in one declared two-way delta, checkable"
outcome: "The local pnpm gate and the CI verify invariant sets stand in one declared, checkable relationship — a shared content floor of eight checks, a two-way content delta (CI keeps steps the local plan does not, and the local plan keeps one CI does not), and HEAD vs merge-ref; a stale-behind-main branch is surfaced."
status: proposed
proof_mode: integration-test
depends_on: [green-gate]
decisions: [486, 304, 195]
# THE DECIDING ADR EXISTS NOW — ADR-0486 (accepted 2026-08-31), which this unit realises. It settles
# the contract for how far the local gate may differ from CI: one declared two-way delta (D1), the
# permitted delta classes CLOSED at three (D2), every member asserted BOTH ways (D3), both sides read
# from their REAL definitions at runtime and never transcribed (D4), and a SKIP is not an absence (D5).
# The old "no deciding ADR yet (owner escalation)" note is WITHDRAWN in place below: measured against
# `owner-fork-bar` the question cleared none of its three tests — reversible, internal, and a pure
# engineering tradeoff — and ADR-0304 D2 had already settled the direction.
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
checkable relationship** — they share a content floor of eight checks, each side additionally keeps
steps the other does not (a TWO-WAY content delta, not an equality), and `gate` runs on the working
tree / HEAD while `verify` runs on the merge-with-`main` ref — and a branch that is stale behind
`main` is surfaced. So "my local gate was green but CI went red" stops being tribal knowledge and
becomes a checkable fact about a declared **shared content floor** plus two declared deltas: the
**two-way content delta** and the **merge-ref**.

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
- The `build` delta exists for a real reason (recorded against `green-gate`): the packages export raw
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
     `green-gate`'s `proves-against-merge-ref` — this contract surfaces the cause locally.
