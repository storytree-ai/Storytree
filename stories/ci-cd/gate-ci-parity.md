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
# from their REAL definitions at runtime (D4), and a SKIP is not an absence (D5). The old "no deciding
# ADR yet (owner escalation)" note is WITHDRAWN in place below: measured against `owner-fork-bar` the
# question cleared none of its three tests — reversible, internal, and a pure engineering tradeoff —
# and ADR-0304 D2 had already settled the direction.
#
# ⚠⚠ BLOCKED BY ADR-0192 — DO NOT SPEND A `--real` RUN ON THIS UNIT UNTIL ITS SOURCE HAS A HOME.
# Measured 2026-08-31, the expensive way: this unit WAS driven `--real` on 2026-08-31 and PASSED — phase trail AUTHOR_TEST → CONFIRM_RED → IMPLEMENT →
# CONFIRM_GREEN → GATE, verdict PASS, coverage 3/3 contracts, $2.8028. `check:boundaries`
# then REFUSED the result on two rules at once:
#   - the hosted-story landlord rule (ADR-0074 §4) — story "ci-cd" claimed a unit source file inside
#     "cli"'s building (`packages/cli`) with no declared edge; and
#   - the ADR-0192 PACKAGES-FORWARD REFUSAL — "ci-cd" is NOT in the frozen `hostedStories` register,
#     and a NEW story cannot host in a foreign building AT ALL, regardless of any declared edge.
# The register holds 15 entries, DOWN from the frozen 18, because its whole purpose is to SHRINK as
# stories migrate out (ADR-0192 D3). Adding "ci-cd" to it would reverse the decision's direction and
# is described by the refusal itself as a deliberate owner-reviewed grandfathering — not a session's
# call to make on the way past.
#
# THE ROOT CAUSE IS THAT "ci-cd" OWNS NO WORKSPACE PACKAGE. Verified against `repo-manifest.json`:
# `sourceOwnership` gives it ZERO subtrees. Its capabilities were all Class C (no `proof:` block at
# all), so none had ever declared a `real.sourceFile` — which is why no hosting evidence existed and
# why the register never listed it. Authoring the first one CREATED the first hosting relationship,
# and ADR-0192 refused it on sight. That is the rule working, not a defect.
#
# ⚠ THE PRE-FLIGHT DOES NOT CATCH THIS, AND THAT IS THE COSTLY PART. `storytree node resolve`
# reported "REAL-buildable: yes" and the build ran to a signed PASS before any boundary rung looked
# at where the file landed. So the money is spent BEFORE the refusal is discoverable. Anyone adding a
# `real.sourceFile` to a story that owns no package will pay the same ~$2.80 for an unlandable verdict.
#
# ⚠ THE WORK IS NOT LOST — DO NOT RE-DRIVE IT FROM SCRATCH. The leaf's authored pair is parked on
# `origin/claude/real/gate-ci-parity-real-mtghoj67`: `packages/cli/src/gate-ci-parity.ts` and `packages/cli/src/gate-ci-parity.test.ts`. It is good work — pure functions, the CI
# job scoped correctly, both real definitions read at runtime — and the signed PASS persists in
# `events.verdict`. Re-home those two files into a package "ci-cd" legitimately owns, repoint the
# arm, and re-prove; do not re-author.
#
# THE FORK, for story-author / an architecture decision — NOT an owner fork (ADR-0192 already
# settled the rule; what is open is only WHICH remedy):
#   (a) give "ci-cd" its own workspace package and re-home the unit's source there; or
#   (b) re-home the CAPABILITY to the "cli" story, whose building already hosts the repo's checking
#       apparatus (`verification-decay-instruments` owns check sources there today) — the subject is
#       the gate/CI relationship, but the ARTEFACT is one more `check:*` rung; or
#   (c) an owner-reviewed grandfathering of "ci-cd" onto the shrinking register — the direction
#       ADR-0192 exists to reverse, and the weakest of the three.
# Until one is chosen, the `proof:` block is REMOVED so `node resolve` reports the unit
# NOT buildable and `--real` refuses fail-closed. That refusal is the point: it is cheaper than
# another unlandable verdict.
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
