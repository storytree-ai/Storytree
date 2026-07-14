---
status: accepted
decided: 2026-07-14
amends: [22]
load_bearing: true
---
# ADR-0195: Affected-only PR test scope: CI cost scales with the change, not the repo

## Status

accepted (2026-07-14) — decided/directed by the owner in conversation on 2026-07-14 ("put in place
a session for affected-only tests, this should make the cicd much more scalable"). Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0022:** the auto-merge invariant — "the pull_request checkout tests the merge result,
so main stays green" — stands, but what the PR-side gate PROVES is redefined: a PR's `verify` may
prove the changed workspace projects plus their transitive dependents rather than the whole
workspace, with every merged tree still getting one full-suite proof as the backstop (§5).

## Context

Measured 2026-07-13 (run 29254574586): `verify` ≈ 3m42s, of which `pnpm -r test` is 2m17s (62%),
`pnpm -r typecheck` 33s, `pnpm -r build` 11s; setup+install ~20s; the 11 check:* steps + web
submodule clone ~14s. All three `-r` steps run every workspace project (11 packages + 2 apps)
unconditionally on every PR — PR CI cost is O(repo), not O(change), and grows with every landed
story. ADR-0022 chose the full run as the simplest sufficient implementation of "the merge result
is green", not as the invariant itself.

pnpm already owns the workspace dependency graph, and `--filter "...<name>"` (the package plus its
transitive DEPENDENTS, dev edges included) is its native affected-selection primitive — no new
tooling (turbo/nx rejected: a second build-graph tool for a two-minute problem). The graph is
denser than the conceptual organism DAG (e.g. proof-protocol dev-depends on library for its tests),
which only ever widens selection — the safe direction.

**The correctness trap this design must respect:** several test suites read files OUTSIDE any
declared dependency edge, which pnpm's graph cannot see —

- `@storytree/cli`'s test runs `scripts/validate-corpus.ts` over the repo-root `stories/**`, and
  the adr-health gates (`adr-number-unique` et al., inside `pnpm -r test`) read `docs/decisions/**`;
- `@storytree/drive`'s node-build tests read `stories/**`;
- `@storytree/library`'s `store.test.ts` and cli's `corpus-build-check.test.ts` /
  `check-surface-coverage.test.ts` read the corpus seed `apps/studio/data/knowledge.json` /
  `assets.json` — a cross-package file read that sits INSIDE `apps/*` (verified by grep; the one
  input the "outside packages+apps" rule alone would miss);
- `@storytree/drive`'s `workspacePackageForSource` reads other packages' `package.json` at runtime.

## Decision

1. **On `pull_request`, `verify` narrows typecheck+test to the affected subgraph.** A tested
   classifier (`pnpm ci:affected` → `packages/cli/src/ci-affected.ts`; thin CI shell
   `ci-affected-main.ts`) lists the PR's changed files and emits either `-r` (full) or a
   `--filter "...<name>"` chain naming each changed project — pnpm expands the dependents from the
   real workspace graph, so cross-package breakage is still caught. `pnpm -r build` stays full
   (11s — not worth the surface), and every check:* step stays unconditional.
2. **The diff source is the merge commit itself:** `git diff --name-only --no-renames HEAD^1 HEAD`
   on the `refs/pull/N/merge` checkout (`fetch-depth: 2` keeps the base-tip parent available).
   That is exactly what the PR changes versus the base the merge was cut against — race-free
   against a moving main, and ONE diff source of truth: pnpm's own `--filter "...[ref]"` git
   filtering is deliberately NOT used, so the classifier and the selection can never disagree
   about what changed.
3. **Conservative classification — the FULL `-r` run fires when ANY changed file is:**
   (a) outside `packages/*` / `apps/*` — `stories/**`, `docs/decisions/**`, `scripts/**`,
   `.github/**`, `pnpm-lock.yaml`, root `package.json`/tsconfig, `CLAUDE.md`, `.claude/**`, the
   `web` gitlink — the paths the trap suites read;
   (b) under `apps/studio/data/**` — the corpus seed read across package boundaries;
   (c) any `package.json` — workspace manifests are the selection graph's own inputs;
   (d) inside `packages/`/`apps/` but mapping to no known workspace project (conservative
   unknown — covers `packages/README.md`, deleted-package leftovers).
   Refining these rules (e.g. "stories/** selects cli+drive instead of FULL") is an amendment to
   this ADR, never a quiet edit — every FULL trigger is pinned red→green in `ci-affected.test.ts`.
4. **Fail-open to FULL, fail-visible otherwise:** not a PR event, HEAD not a merge commit, git
   failure, or any classifier error → `-r`. A crash before the step writes its output fails the
   step — red CI, never a silently narrowed green. Push and dispatch events skip the classifier
   entirely (`|| '-r'` in the workflow expression).
5. **The accepted trade, stated plainly: an under-selected PR can land red on main.** The backstop
   invariant: **every merged tree gets one FULL-suite proof.** A PR whose verify classified `full`
   proves it on the merge ref (ADR-0022's model); after an AFFECTED-ONLY merge, the automerge job
   dispatches a full ci.yml run on main (`workflow_dispatch`, fail-soft, skipped when the PR-side
   already ran full), so an under-selection is caught minutes after the merge that landed it and
   fixed forward. Under rule 3, under-selection requires a PR that INTRODUCES a new cross-boundary
   file read while touching none of the FULL-trigger paths — so new cross-boundary reads must
   arrive with a dependency edge, or with an amendment here adding the path to the FULL triggers.
   *Correction (2026-07-14, same day, before the mechanism ever gated a merge): as first worded
   this point cited "the `push` → main trigger ci.yml already carries" as the backstop — wrong for
   auto-merged PRs, i.e. all of them: the automerge job merges with `GITHUB_TOKEN`, and
   GITHUB_TOKEN-caused events never trigger workflows (GitHub anti-recursion — the same rule
   ADR-0061's deploy dispatch works around; verified against run history: push runs fired for the
   owner's hand-merged PRs #684–#686 and for NO bot-merged PR since). The dispatched-run mechanism
   above restores the directed backstop.*
6. **Local `pnpm gate` is unchanged** — the local mirror stays full; only the PR-side CI scope
   narrows.

## Consequences

- PR CI's dominant cost now scales with the change: a leaf-surface PR runs its dependent slice
  (e.g. forest-world → r3f → studio/desktop) instead of all 13 projects; low-tier protocol changes
  still fan out to nearly everything — correct, not a bug.
- Doc-only, stories-only, corpus-seed, lockfile, and workflow PRs still run FULL by rule —
  correctness over savings; the measured win concentrates on in-package source changes.
- Sanity-watch after landing: on the next few real PRs the `Affected scope` step must log
  `mode=full` for a doc-only PR and the filtered project set for a leaf-package PR.

## References

- ADR-0022 (approval-gated trunk / auto-merge-on-green) — amended by this ADR.
- `packages/cli/src/ci-affected.ts` (rules), `ci-affected-main.ts` (CI shell),
  `ci-affected.test.ts` (the pinned classification behaviour), `.github/workflows/ci.yml`
  (`Affected scope (PRs only)` step).
- Measured baseline: Actions run 29254574586 (2026-07-13).
