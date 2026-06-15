---
status: accepted
decided: 2026-06-15
amends: [46]
---
# ADR-0061: PAT-free studio CD trigger via workflow_dispatch from automerge

## Status

**accepted** (2026-06-15) — the owner chose **Option 3 (explicit `workflow_dispatch` from the
`automerge` flow)** from a PAT-free options exploration, on the explicit constraint of **not**
generating a long-lived deploy Personal Access Token, and green-lit implementation in the same call.
The change lands with this ADR — see *Done in this unit*. (Authored first as a proposal; flipped to
accepted on the owner's call the same day, mirroring ADR-0046.)

**Amends [ADR-0046](0046-continuous-deployment-for-the-hosted-studio.md)** — it revises only *how the
merge→deploy edge fires*. ADR-0046's Option 2 (keyless GitHub Actions + WIF deploy on `push: main`)
stands; the deploy SA, its IAM, the Cloud Build delegation, the full ADR-0042 flag set, and the
Ready-revision smoke check are all **unchanged**. This ADR closes the one gap ADR-0046's `push: main`
trigger left open: it does not fire for **auto-merged** PRs. Builds on
[ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the auto-merge mechanism whose `GITHUB_TOKEN`
merge causes the gap) and [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) (the
keyless / no-long-lived-secret north star this option keeps intact).

## Date

2026-06-15

## Context

`deploy-studio.yml` triggers `on: push: main` (with a studio-affecting `paths:` filter). But
`ci.yml`'s `automerge` job merges every green PR with the built-in **`GITHUB_TOKEN`**
(`gh pr merge … --merge`, ADR-0022). GitHub **deliberately will not cascade a `push`-triggered
workflow from a `GITHUB_TOKEN` push** (anti-recursion, to prevent infinite workflow loops). So the
merge commit that `automerge` creates does **not** fire `deploy-studio.yml` — only *owner-manual*
merges (a user token) cascade.

The result is the exact bug this CD was built to kill, reintroduced one layer up: a studio change
auto-merges to `main` and the live Cloud Run service keeps serving the **old bundle** until someone
runs `gh workflow run deploy-studio.yml --ref main` by hand. This just caused a real "Cloud Run
doesn't show my updates" report. The header comment in `deploy-studio.yml` and `infra/studio-cd.md`
both name a **deploy PAT** as the pending fix — which the owner does **not** want (a long-lived,
broadly-scoped human credential is exactly the posture ADR-0021 exists to avoid).

Two facts (verified against current GitHub Actions docs, 2026-06; these rules have changed over time)
frame the option space:

1. **`workflow_dispatch` and `repository_dispatch` are the documented exception** to the
   anti-recursion rule: they **always** create a workflow run, even when invoked with
   `GITHUB_TOKEN` — *provided* the token has **`actions: write`** permission (otherwise the dispatch
   API call 403s).
2. **The deploy SA's WIF binding is scoped to `attribute.ref/refs/heads/main`** (`infra/studio-cd.tf`,
   deliberately tighter than the repo-wide CI-presence SA in `infra/ci-presence.tf`, because the
   deploy SA is privileged — it can ship a Cloud Run revision and `setIamPolicy` the IAP wall). A
   job running in a **`pull_request`** context has OIDC `ref` claim **`refs/pull/<n>/merge`**, which
   does **not** match `refs/heads/main`. A `workflow_dispatch` run on `--ref main` has `ref` claim
   `refs/heads/main`, which matches the existing binding **verbatim**. This single fact is what makes
   the dispatch route free of any IAM change and rules out the "deploy inline in the PR job" route.

## Options considered

All four are PAT-free. The security-decisive axes: *does it add a new secret? does it widen any
trust surface?*

### Option 3 — explicit `workflow_dispatch` from the automerge flow — **chosen**

After the merge step, the `automerge` job dispatches `deploy-studio.yml` against `main`
(`gh workflow run deploy-studio.yml --ref main`), gated to studio-affecting merges. The job is
granted **`actions: write`**. The dispatched run authenticates with the **existing `main`-scoped
deploy-SA WIF binding** because it runs as `workflow_dispatch` **on `main`** (fact 2), and the
dispatch is the documented anti-recursion exception (fact 1).

- **New secret:** none. **New IAM:** none — reuses the binding as-built.
- **Keyless / ADR-0021 spirit:** fully preserved — adds nothing to the trust surface the owner
  doesn't already trust.
- **Reliability:** high — `workflow_dispatch` always creates a run.
- **Cost:** one dispatch step + a studio-path gate + the `actions: write` scope on the merge job; the
  deploy appears as a separate `workflow_dispatch` run (traceable via `gh run list`) rather than a
  `push: main` cascade.

### Option 2 — GitHub App installation token for the merge — runner-up

Mint a short-lived (1 h) GitHub App installation token in `automerge` (e.g.
`actions/create-github-app-token`) and merge with **that**. A push from an App token **does**
cascade, so `deploy-studio.yml`'s existing `push: main` + native `paths:` filter "just works" — the
cleanest runtime behaviour, and an App token is far safer than a PAT (App-scoped, revocable, expiring).
**But** it plants a **long-lived App private key** in a repo secret — the "long-lived credential at
rest" ADR-0021's posture avoids — plus App creation/install admin, and it re-triggers `ci.yml`'s
`push: main` verify on `main` (redundant minutes) unless guarded. More general (one App fixes *every*
future `GITHUB_TOKEN`-cascade limit) but not secret-free; the wrong trade given this exploration's
whole premise is avoiding a long-lived deploy credential.

### Option 1 — `on: workflow_run` trigger — rejected

Trigger `deploy-studio` off `ci.yml`'s completion. No secret, but awkward: `workflow_run` has **no
`paths` filter**; its `branches` filter matches the *triggering run's head branch* (which for the PR
run is `claude/…`, not `main`, so the obvious `branches: [main]` inverts and only catches the
owner-manual case that already works); and a `success` conclusion does **not** prove a merge happened
(a held/draft PR skips `automerge`, yet the run is still "success"). Correctness requires dropping the
filters and re-deriving "actually merged + touched studio paths" via the API in-job — strictly more
fragile than Option 3 for no security gain.

### Option 4 — fold the deploy into the automerge job — rejected (security regression)

No second workflow, but the job runs in `pull_request` context, so its OIDC `ref` is
`refs/pull/<n>/merge` — the deploy SA's `main`-scoped binding **rejects it** (fact 2). Closing that
means **widening** the most-privileged SA's trust to repo-wide / PR refs — enlarging the blast radius
of the one SA that can ship a revision and rewrite the IAP policy. It also couples deploy failure into
the merge job and doesn't share `deploy-studio`'s concurrency group. This is the only option that
*regresses* the posture.

## Options at a glance

| Dimension | **3 · dispatch (chosen)** | 2 · App token | 1 · workflow_run | 4 · inline deploy |
|---|---|---|---|---|
| New secret | **none** | App private key (long-lived) | none | none |
| New IAM / trust widening | **none** | none (GitHub-side App) | none | **widens deploy-SA binding** |
| Keyless (ADR-0021) spirit | ✅ | ⚠️ long-lived key at rest | ✅ | ✅ |
| Reuses deploy-studio.yml as-is | ✅ (`workflow_dispatch` already present) | ✅ native `push:main`+paths | ✗ rewrites trigger | ✗ duplicates steps |
| "Merge actually happened?" | ✅ dispatch only post-merge | ✅ real push = real merge | ⚠️ verify≠merge | ✅ same job |
| Path filtering | gate in dispatch step | ✅ native | ✗ re-derive in-job | gate in job |
| Concurrency (`group: deploy-studio`) | ✅ shares group | ✅ shares group | ✅ same file | ⚠️ ci job not in group |
| Net security delta vs today | **neutral** | **negative** (new secret) | neutral | **negative** (wider trust) |

## Decision (Option 3)

Close the gap by **dispatching the existing deploy workflow from the `automerge` job** — no new
workflow, no new secret, no new IAM. Concretely:

1. **`deploy-studio.yml` is unchanged.** It already declares `workflow_dispatch:` (the on-demand path),
   so the dispatch target exists; its `push: main` + `paths:` trigger stays for owner-manual merges.
   Its keyless WIF auth (`storytree-studio-deployer`, `attribute.ref/refs/heads/main`), the Cloud
   Build delegation, the full ADR-0042 deploy flag set, and the Ready-revision smoke check are all
   preserved verbatim (ADR-0046).

2. **`ci.yml`'s `automerge` job gains `actions: write`** (alongside its current `contents: write`,
   `pull-requests: write`, `id-token: write`) so `GITHUB_TOKEN` may dispatch (fact 1).

3. **A path-gated dispatch step** runs after the merge succeeds:
   `gh workflow run deploy-studio.yml --ref main`, fired only when the merged PR touched the
   ADR-0046 studio-affecting path set (`apps/studio/**`, `packages/**`, `docs/**`, `stories/**`,
   `pnpm-lock.yaml`, `package.json`, `apps/studio/Dockerfile`, `infra/studio-cloudbuild.yaml`,
   `.github/workflows/deploy-studio.yml`). The changed files come from the merged PR
   (`gh pr view <n> --json files` / the files API still resolves post-merge). *Acceptable
   simplification:* always-dispatch (over-deploy) if the gate proves fiddly — `docs/**` and
   `stories/**` already trip a large fraction of merges (ADR-0046), so the gate saves less than it
   appears.

4. **The dispatched run reuses the existing `main`-scoped binding** (fact 2): it runs as
   `workflow_dispatch` on `main`, so its OIDC `ref` is `refs/heads/main` and the deploy SA accepts it
   with **no IAM change**. It also joins the existing `concurrency: { group: deploy-studio,
   cancel-in-progress: false }`, so a dispatched deploy and an owner-manual `push: main` deploy
   **serialize** rather than race.

**Implementation note — step ordering (don't break presence-retire).** The `automerge` job's
existing presence-retire steps default to `if: success()`, so a *failed* dispatch step placed before
them would skip them. Put the dispatch step **last** in the job (after the presence-retire steps), or
make it `continue-on-error: true`, so a dispatch hiccup never suppresses the fail-soft presence retire.
Unlike presence (advisory, fail-soft), a missed deploy is the bug being fixed, so the dispatch should
be **visible** (a non-zero exit marks the job failed — cosmetic, since the merge already landed — but
loud), not silently swallowed.

## Consequences

- **The gap closes with zero new attack surface.** An auto-merged studio change redeploys within
  minutes via a `workflow_dispatch` run; the manual `gh workflow run …` stopgap (and the deploy-PAT
  plan in `deploy-studio.yml`'s header + `infra/studio-cd.md`) is **retired**. Those PAT/stopgap notes
  should be updated to point at this mechanism.
- **Security delta is neutral.** No secret added, no trust widened; the deploy SA keeps its tight
  `main`-only binding. This is the most faithful continuation of ADR-0021's keyless posture among the
  options.
- **Traceability shifts slightly.** The deploy is a separate `workflow_dispatch` run, not a `push:
  main` cascade off the merge commit — visible in `gh run list` / the Actions tab, but one hop removed
  from the merge. The `/api/health` `code` git-HEAD stamp still confirms the served bundle.
- **A small, bounded Actions-minute cost** per studio-affecting auto-merge (~1–2 min, build delegated
  to Cloud Build per ADR-0046) — the same cost the `push: main` path already incurs for manual merges;
  net new only for the auto-merge case that previously deployed *nothing*.
- **No double-deploy in practice.** Auto-merges fire only the dispatched run (the `push: main` cascade
  is blocked); owner-manual merges fire only the `push: main` run (no dispatch step runs). The two
  paths don't overlap, and the shared concurrency group covers the rare race.

## What this does NOT decide / open questions

- **Path-gate precision vs always-dispatch.** Whether to compute changed files and gate, or just
  always dispatch on auto-merge and lean on Cloud Build/Cloud Run's scale-to-zero economics. (Lean:
  gate, to match ADR-0046's conservative-filter intent; fall back to always-dispatch if brittle.)
- **The redundant owner-manual path.** Left intact deliberately (break-glass + the only path on a
  truly-manual merge). Not consolidated here.
- **A CI assertion that the gate is wired** (e.g. a lint that the dispatch step + `actions: write`
  co-exist) — nice-to-have, not required for v1.
- The deeper "should the App-token route (Option 2) be adopted later as a *general* `GITHUB_TOKEN`
  cascade unlocker" — revisit only if a second cascade limitation appears; for one deploy edge,
  Option 3 is the right size.

## Done in this unit

- **`.github/workflows/ci.yml`** — the `automerge` job gains `actions: write` and a final step,
  *Dispatch studio deploy on a studio-affecting merge*: it reads the merged PR's files
  (`gh pr view … --json files`), grep-matches them against the ADR-0046 studio path set, and runs
  `gh workflow run deploy-studio.yml --ref main` when it matches. Placed **last** (after the fail-soft
  presence-retire) and **loud** (no `continue-on-error`), so a dispatch failure is visible yet cannot
  skip the `if: success()` presence steps.
- **`.github/workflows/deploy-studio.yml`** — unchanged behaviour; the header TRIGGER NOTE and the
  `workflow_dispatch` comment now describe the ADR-0061 dispatch (the deploy-PAT plan is retired).
- **`infra/studio-cd.md`** — the *Triggering a deploy* section rewritten: auto-merges dispatch (no
  PAT), owner-manual merges cascade `push: main`, manual `gh workflow run` is break-glass.
- **No Terraform / IAM / secret change.** The dispatched run reuses the existing `main`-scoped
  deploy-SA WIF binding verbatim.

## References

- [ADR-0046](0046-continuous-deployment-for-the-hosted-studio.md) (the CD this amends — Option 2
  keyless WIF deploy on `push: main`); `infra/studio-cd.tf` (the `main`-scoped deploy-SA binding this
  reuses); `infra/studio-cd.md` (the runbook + the deploy-PAT note this retires).
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the `GITHUB_TOKEN` auto-merge whose no-cascade
  causes the gap); `.github/workflows/ci.yml` (the `automerge` job to extend);
  `.github/workflows/deploy-studio.yml` (the dispatch target — already `workflow_dispatch`-enabled).
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) (keyless / no long-lived secret).
- GitHub Actions docs (verified 2026-06): anti-recursion + the `workflow_dispatch`/`repository_dispatch`
  exception; `GITHUB_TOKEN` needs `actions: write` to dispatch; OIDC `ref` claim is `refs/pull/<n>/merge`
  for `pull_request` events.
- Owner decision, 2026-06-15 (chose Option 3; PAT explicitly declined).
