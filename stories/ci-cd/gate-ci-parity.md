---
id: "gate-ci-parity"
tier: capability
story: ci-cd
title: "Gate↔CI parity — the local gate equals CI minus build, declared and checkable"
outcome: "The local pnpm gate and the CI verify invariant sets stand in one declared, checkable relationship (gate = CI − build, HEAD vs merge-ref); a stale-behind-main branch is surfaced."
status: proposed
proof_mode: integration-test
depends_on: [green-gate]
---

# Gate↔CI parity — the local gate equals CI minus build, declared and checkable

**Outcome —** The local `pnpm gate` and the CI `verify` invariant sets stand in **one declared,
checkable relationship** — `gate` runs exactly the `verify` content checks MINUS `pnpm -r build`, and
on HEAD rather than the merge-with-main ref — and a branch that is stale behind `main` is surfaced.
So "my local gate was green but CI went red" stops being tribal knowledge and becomes a checkable
fact about TWO declared deltas: the **build** step and the **merge-ref**.

> **No deciding ADR yet (owner escalation).** This is the only genuinely NEW capability in the story
> — today the parity invariant lives ONLY in CLAUDE.md prose ("a green local `pnpm gate` does NOT
> guarantee a green CI … CI adds `pnpm -r build` … tests the merge of your branch with `main`") and
> session memory. It may warrant its own ADR: the *contract for how far the local gate is allowed to
> differ from CI* is arguably an architectural decision. Flagged in the story's "Open modeling calls".
> Authored regardless, because the friction is real (per CLAUDE.md it stranded three PRs at once).

## Guidance

- **Proof-walkthrough first (integration test, against the REAL gate definition + the REAL
  `verify` job).** The capability is a *relationship between two existing things*, so the proof reads
  both and asserts the relationship — it does not re-run CI. Parse the `gate` script (the `package.json`
  `gate` entry / the documented `pnpm -r typecheck && pnpm -r test` + the manifest/sync checks) and
  parse the `verify` job's step list out of `ci.yml`, normalise both to a SET of content checks, and
  assert: `verify_set − {pnpm -r build} == gate_set`. The delta set is EXACTLY `{build}` and the
  ref-delta is `{HEAD vs merge-ref}` — both declared as named constants the test compares against, so
  adding a step to one and not the other FAILS this check loudly. That is the whole capability: the
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
  the one allowed difference, it does not try to eliminate it.

## Contracts (3)

1. **`declared-content-delta-is-exactly-build`** — the two invariant sets differ by one named step
   - **asserts —** the set of content checks the local `gate` runs equals the set the CI `verify` job
     runs with `pnpm -r build` removed; if a check is added to `verify` (or `gate`) without the other,
     the parity check FAILS and names the divergent step. The allowed delta is the single declared
     constant `{pnpm -r build}` — nothing else.
2. **`ref-delta-is-declared`** — HEAD-vs-merge-ref is a named, expected difference
   - **asserts —** the relationship records that `gate` runs on the working tree / HEAD while `verify`
     runs on the branch-merged-with-`main` ref, as the second declared delta — so a green local gate
     is documented to predict CI green ONLY up to the build step AND a non-stale branch.
3. **`stale-branch-surfaced`** — a branch behind main is diagnosed, not a silent CI surprise
   - **asserts —** a branch whose tip is behind `origin/main` is reported as stale (the
     "first suspect a stale branch" condition) with the `git fetch && git merge origin/main` remedy;
     an up-to-date branch reports clean. The merge-ref redness this predicts is exercised by
     `green-gate`'s `proves-against-merge-ref` — this contract surfaces the cause locally.
