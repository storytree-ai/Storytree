---
status: accepted
load_bearing: true
decided: 2026-06-08
---

# ADR-0022: CI green gate + auto-merge-on-green (inside free Actions)

## Status

accepted (2026-06-08) — first `.github/` in the repo. Operationalises the project's stated
cadence (`CLAUDE.md`: "merge-to-main-when-green") for a **solo, multi-machine** workflow.
Reconciled with [ADR-0008](0008-ui-drives-agents-approvals.md) (the *product's*
approval-gated story-trunk) — see §Relationship.

## Date

2026-06-08

## Context

Solo development (HuaMick), but across **several machines** — laptop, phone, and Claude
remote VMs — all pushing `claude/*` (and ad-hoc) branches to the private `HuaMick/Storytree`
remote. The owner wants exactly one loop: **open a PR → all checks pass → it merges to
`main`** — without remembering to click merge from whichever device opened it.

There is **no CI** (`.github/` absent on `main`). So auto-merge today would merge *unchecked*
code; the green gate must come first.

Two real constraints shaped the mechanism:

1. **GitHub-native auto-merge is paywalled** for private personal repos (needs Pro, plus a
   branch-protection ruleset requiring the check). We want $0.
2. **GitHub Actions itself is free** on the private repo (verified: a trial CI run went green
   in ~26s) — and the test suites are **offline** (`CLAUDE.md`: no DB or API key needed), so
   CI needs **no secrets**.

The pnpm workspace is `packages/{core,agent,orchestrator,store}` + `apps/studio`.
**Correction (2026-07-06 — ADR-0139 pass):** `packages/core` and `packages/store` were later
dissolved (ADR-0068 / ADR-0077); today's workspace is `packages/{agent,cli,drive,forest-world,
forest-world-r3f,library,notice-board,orchestrator,proof-protocol,storage-protocol,studio-members}`
+ `apps/{studio,desktop}`. The
canonical gate is `pnpm -r typecheck` + `pnpm -r test`; only `apps/studio` has a `build`
(packages export raw TS). `legacy/Agentic` is a private submodule, **not** in the workspace.

## Decision

1. **A CI green gate — `.github/workflows/ci.yml`, job `verify`.** On PRs into `main` and
   pushes to `main`: checkout (no submodule) → pnpm@9.15.0 + Node 24 →
   `pnpm install --frozen-lockfile` → `pnpm -r typecheck` → `pnpm -r test`. This is the gate
   `CLAUDE.md` declares; no secrets. Mirrored locally as `pnpm gate`. **`pnpm -r build` is
   deliberately excluded** — packages ship raw TS, and the one buildable target
   (`apps/studio`) currently fails `vite build` (its `devApi` imports the Node-only
   `@storytree/store`); gating on it would wedge every merge. That breakage is tracked
   separately, not folded into the gate.

   **Correction ([ADR-0195](0195-affected-only-pr-test-scope-ci-cost-scales-with-the-change-n.md),
   per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)): the
   PR-side scope narrowed — on `pull_request`, `verify` no longer runs the full `-r` suite.** It
   runs `pnpm -r typecheck` / `pnpm -r test` over the AFFECTED subgraph (the changed workspace
   projects plus their transitive dependents, `pnpm ci:affected` → `--filter "...<name>"`), fanning
   out to full `-r` whenever a changed file sits outside the selection graph (docs, stories, the
   corpus seed, lockfile, workflows, any `package.json`). **The full `-r` suite still backstops every
   merged tree** — the guarantee ADR-0195 §5 now carries (NOT, as first worded here, the `push` →
   main trigger, which does not fire for `GITHUB_TOKEN` auto-merges — GitHub anti-recursion), so
   §2's merge-result-is-green invariant is untouched; only what a PR proves narrowed. Read §1's "On PRs into `main` and pushes to `main`: … → `pnpm -r typecheck`
   → `pnpm -r test`" as full-on-push, affected-on-PR.

2. **Auto-merge-on-green, done inside free Actions — not GitHub-native auto-merge.** A second
   job `automerge` `needs: verify`, runs only on `pull_request` events, and merges the PR with
   the built-in `GITHUB_TOKEN`:
   `gh pr merge <n> --merge --delete-branch`. Because it depends on `verify`, it fires only
   when the gate is green; the `pull_request` checkout tests the **merge result** (PR head
   merged into `main`), so `main` stays green. Merge-commit style matches existing history;
   the merged branch is deleted.

3. **All PRs auto-merge; opt out per-PR.** Every green PR merges (the owner is the only
   author — there is no one else to review for). To **hold** a PR, mark it a **draft** or add
   a **`hold`** label; the `automerge` job skips both. No allow-list of branch names to
   maintain.

4. **No owner GitHub settings required.** The job grants itself `contents: write` +
   `pull-requests: write` via the workflow's `permissions:` block — so unlike native
   auto-merge, this needs **no paid plan, no branch-protection ruleset, no repo-setting
   click-path**. (If the merge step ever 403s, flip Settings → Actions → General → Workflow
   permissions to allow write — but job-level `permissions` should cover it.)

5. **Stay current across machines — `pnpm sync`.** `git fetch origin && git rebase
   origin/main`. Run it when picking work back up on a different device; since green PRs land
   continuously, this keeps each machine's branch on top of current `main`. (Rebase ⇒
   `git push --force-with-lease`; fine for single-author branches.)

## Relationship to ADR-0008

[ADR-0008](0008-ui-drives-agents-approvals.md) keeps the **product's story-trunk**
approval-gated: a green agent result is a *request for human diff-review*, not an automatic
merge onto the story DAG. This ADR governs a **different trunk** — the dev repo's git `main`,
the meta-layer that *builds* storytree. The shared, non-negotiable invariant is preserved:
**never merge un-green.** What differs is that on the toolmaker's own repo, for a solo author,
green is accepted as *sufficient* (the friction of clicking merge from a phone buys no real
review), whereas the product treats green as *necessary but not sufficient*. The human stays
fully in the loop where ADR-0008 puts them — on what gets built into the **product** — not on
who clicks merge here. The `hold` label / draft is the explicit brake if review is ever wanted.

## Done in this PR

- `.github/workflows/ci.yml` — `verify` gate + `automerge` job.
- Root `package.json` — `pnpm gate` (run the gate locally) and `pnpm sync` (rebase onto
  `main`).
- This ADR.

## What this does NOT decide

- **Squash vs merge-commit** — kept `--merge` to match history.
- **Release / publish / deploy** — no package is published. (Studio CD was out of scope when this
  ADR was written; once a hosting target existed, merge→deploy CD for the hosted studio was decided
  by [ADR-0046](0046-continuous-deployment-for-the-hosted-studio.md), reusing this gate + auto-merge
  as its trigger.)
- **Branch protection** — deliberately skipped (paywalled + unnecessary for one author); the
  gate is enforced by *convention* (merge only via the workflow), not by a server-side rule.

## References

- [ADR-0008](0008-ui-drives-agents-approvals.md) (product approval-gated trunk — reconciled
  here); `CLAUDE.md` ("merge-to-main-when-green").
- `.github/workflows/ci.yml`; root `package.json` (`gate`, `sync`).
- Owner conversation, 2026-06-08.
