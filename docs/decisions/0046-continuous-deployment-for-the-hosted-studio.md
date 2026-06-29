---
status: accepted
decided: 2026-06-13
---

# ADR-0046: Continuous deployment for the hosted studio (merge → deploy)

## Status

**accepted** (2026-06-13) — the owner chose **Option 2 (GitHub Actions + WIF) with the recommended
defaults** (conservative `paths:` filter + delegate the image build to Cloud Build) in conversation,
resolving owner decisions 1–3 below. The implementation landed in the same unit — see *Done in this
unit*. (Authored first as a proposal; flipped to accepted on the owner's call the same day. Decision 4
— PR #95 sequencing — and the §Decision-C `/api/health` probe owner-check remain operational
follow-ups; decision 5 applied only to Option 1 and is now moot.)
It closes the merge→deploy gap that ADR-0042 left open and that bit us in practice: the
"Circle"→"Members" rename (`studio-members`, PR #102) merged to `main` but the live Cloud Run
service kept serving the OLD bundle until someone re-ran the manual runbook.

Extends [ADR-0022](0022-ci-green-gate-and-auto-merge.md): its green-gate + auto-merge mechanism is
reused **unchanged** as this CD's trigger edge ([ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md)
created the hosting target that brought merge→deploy into scope). Builds on
[ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) (keyless / no JSON keys) and
[ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) (the Cloud Run + IAP posture this CD must
preserve, not regress).

*Numbering note:* `docs/decisions/` runs 0001–0045 on disk; checked `git branch -a` (no
`docs/decisions/0046*` on any local or remote branch) — 0046 is free. ADRs are docs, not DB rows
(ADR-0017/0045), so there is no live-DB ADR ref to collide with.

## Date

2026-06-13

## Context

The hosted studio (`storytree-studio`, Cloud Run, australia-southeast1, project `storytree-498613`,
behind direct IAP) is deployed **manually** — there is **no continuous deployment**. The runbook
(`infra/studio-cloud.md` §3–§4) is two owner-run steps:

1. `gcloud builds submit --config infra/studio-cloudbuild.yaml --substitutions=_TAG=<short-sha> .`
   — builds the image from the repo root (the image is `COPY . .` + `pnpm --filter studio build`,
   and it **snapshots `docs/` + `stories/`** which the server serves at runtime).
2. `gcloud run deploy storytree-studio --image …/studio:<sha> --service-account
   storytree-studio-host@… --set-env-vars "STORYTREE_STUDIO_STORE=pg,STORYTREE_DB_USER=…,
   STORYTREE_STUDIO_ADMINS=…" --memory 1Gi --max-instances 2 --no-allow-unauthenticated --iap`.

Because the deploy is a separate human act, **merging to `main` does not change the live site**. The
`/api/health` `code` git-HEAD stamp (ADR-0042 consequence) makes the resulting skew *observable*, but
nothing *closes* it. We want merge→deploy automatic.

Three constraints frame the design:

- **Keyless only (ADR-0021).** No long-lived JSON service-account keys in a GitHub secret. Prefer
  Workload Identity Federation (WIF) / ambient SA, exactly as the in-flight CI presence-retire work
  does (`infra/ci-presence.tf`, PR #95).
- **Free GitHub Actions budget (ADR-0022).** CI stays in the free tier; a deploy job's minutes are a
  real (if small) line item on a private repo's monthly pool.
- **Don't regress the security posture (ADR-0042).** Whatever deploys MUST keep `--iap`,
  `--no-allow-unauthenticated`, the runtime SA `storytree-studio-host`, and the three env vars. A
  redeploy with `--iap` prints a harmless org-less warning (the project has **no Organization**, so
  IAP uses a one-time custom OAuth client — already wired); CD must not touch that.

A keyless foundation already exists — and this is the load-bearing finding. **PR #95's
`infra/ci-presence.tf` (held draft, pending the owner's one-time `terraform apply`) stands up a
reusable WIF pool + provider** trusting GitHub Actions OIDC, scoped by `attribute.repository ==
HuaMick/Storytree`:

```
projects/635716509357/locations/global/workloadIdentityPools/github-actions/providers/github
```

A second consumer (a *deploy* SA) attaches to the **same** pool by adding one
`roles/iam.workloadIdentityUser` principalSet binding — no new pool, no key. That is the cheapest
keyless path to CD this repo has.

## What counts as "studio-affecting" (for the path-filter question)

The served artifact is determined by: the built SPA (`apps/studio/src` + the workspace packages it
imports — `@storytree/core`, `@storytree/store`), the server (`apps/studio/server` + those
packages), the **`docs/` and `stories/` snapshots baked into the image**, and the dependency closure
(`pnpm-lock.yaml`). So a change is studio-affecting iff it touches:

`apps/studio/**` · `packages/**` · `docs/**` · `stories/**` · `pnpm-lock.yaml` ·
`package.json` · `apps/studio/Dockerfile` · `infra/studio-cloudbuild.yaml` · the deploy workflow itself.

Note `docs/**` and `stories/**` change on a large fraction of merges (every ADR, every story edit),
so path-filtering saves less than it first appears — it mainly skips `infra/`-only, `legacy/`-only,
`.github/`-other, and `packages/agent`-only-when-unimported merges.

## Options considered

### Option 1 — Cloud Build GitHub trigger (native GCP)

Connect the repo through the Cloud Build GitHub App (a one-time owner console step), create a push
trigger on `^main$` with an `includedFiles` glob filter, and run `infra/studio-cloudbuild.yaml`
extended with a `gcloud run deploy` step. The build+deploy run entirely in GCP.

- **Keyless:** ✅ native — Cloud Build runs as its own SA; no GitHub-side credential at all.
- **GitHub Actions minutes:** ✅ **zero** (nothing runs in Actions).
- **Path filtering:** ✅ native `includedFiles` globs on the trigger.
- **Cost:** Cloud Build free tier (120 build-min/day) covers a ~3–5 min studio build comfortably.
- **IAM:** the trigger SA needs `roles/run.developer` + `roles/iam.serviceAccountUser` on
  `storytree-studio-host` (actAs at deploy) + `roles/artifactregistry.writer`.
- **Costs against it:**
  - A **second GitHub↔GCP integration** to stand up and audit (the Cloud Build GitHub App /
    Developer Connect connection), *on top of* the WIF pool PR #95 already introduces. Two trust
    surfaces where one would do.
  - CD config lives **partly outside the repo** in a GCP trigger resource. The 2nd-gen GitHub
    connection's app-install/OAuth handshake is a console step that Terraform can't fully capture,
    so it's less reviewable than an in-repo workflow.
  - **Entangles build with deploy in the shared yaml.** `infra/studio-cloudbuild.yaml` is *also* the
    manual runbook's build config; an unconditional `gcloud run deploy` step there would deploy on
    every manual `builds submit` too. Avoiding that means a separate CD-only build config or a
    substitution guard — extra surface.

### Option 2 — GitHub Actions deploy-on-merge via WIF (keyless) — **recommended**

A new `.github/workflows/deploy-studio.yml`, triggered `on: push: branches: [main]` with a
conservative `paths:` filter, authenticates to GCP via **the existing WIF pool** (reused from
`ci-presence.tf`) as a dedicated **deploy SA**, then delegates the heavy image build to Cloud Build
(`gcloud builds submit`, reusing `infra/studio-cloudbuild.yaml` unchanged) and runs `gcloud run
deploy` with the full ADR-0042 flag set.

- **Keyless:** ✅ reuses the WIF pool/provider already being stood up; adds one principalSet
  binding for the deploy SA. No JSON key.
- **GitHub Actions minutes:** ✅ small — the Actions job only orchestrates (auth → submit →
  deploy-wait → assert), ≈1–2 min/deploy; the 3–5 min Docker build runs in Cloud Build, not Actions.
  Well inside the free private-repo pool even at a high merge cadence.
- **Path filtering:** ✅ native `on.push.paths`. Branch protection is deliberately off (ADR-0022),
  so a path-skipped run blocks nothing.
- **Single integration surface:** the repo already commits to GitHub↔GCP via WIF; this extends it
  rather than adding the Cloud Build App as a parallel trust path.
- **In-repo, reviewable, versioned:** the whole pipeline is one YAML file next to `ci.yml`, and the
  IAM/SA is one Terraform file next to `ci-presence.tf`.
- **Costs against it:**
  - **Sequencing dependency:** the WIF pool comes from PR #95, which is held draft pending the
    owner's `terraform apply`. CD's Terraform must **reference** that pool, not recreate it (the
    `github-actions` pool is a project singleton). So PR #95's WIF should land/apply first (or its
    pool definition be promoted into this unit deliberately).
  - Two SAs touch one flow (a build SA inside Cloud Build + the deploy SA in Actions) when
    delegating the build — slightly more moving parts than Option 1's single trigger SA. (The
    build-in-Actions variant, 2b below, collapses this to one SA at the cost of more Actions
    minutes.)

  *Variant 2b — build the image in Actions (`docker build` + push to Artifact Registry), then
  deploy.* One SA, `artifactregistry.writer` + `run.developer` + actAs; no Cloud Build at all. But
  the Docker build then burns Actions minutes (more than the free-tier-friendly delegate path) and
  re-implements what `studio-cloudbuild.yaml` already does. Recommended only if the owner prefers to
  avoid Cloud Build entirely.

### Option 3 — Google Cloud Deploy — ruled out

Cloud Deploy is a managed **progressive-delivery** pipeline: a delivery-pipeline resource, named
targets, rollouts, approval gates, canary, and orchestrated promotion of one artifact across
**multiple environments** (dev→staging→prod). We have **one service, one environment, one (solo)
author, and an auto-merge-on-green ethos** — none of the problems Cloud Deploy solves. It would add a
release abstraction, its own SA, a skaffold config, and per-pipeline cost for zero benefit. Cloud
Run's native revisions already give instant rollback
(`gcloud run services update-traffic storytree-studio --to-revisions=<prev>=100`). **Revisit only if**
a staging environment or canary/approval-gated rollouts ever become a goal.

## Options at a glance

| Dimension | 1 · Cloud Build trigger | **2 · GH Actions + WIF (rec.)** | 2b · build-in-Actions | 3 · Cloud Deploy |
|---|---|---|---|---|
| Keyless | ✅ native SA | ✅ reuses WIF pool | ✅ reuses WIF pool | ✅ but heavyweight |
| GH Actions minutes | none | ~1–2 min (delegates build) | ~4–6 min (Docker in CI) | n/a |
| New integration surface | +1 (Cloud Build App) | none (extends WIF) | none | +1 (pipeline + SA) |
| CD config in-repo / reviewable | partial (trigger resource) | ✅ full (one YAML) | ✅ full | partial |
| Path filtering | ✅ `includedFiles` | ✅ `on.push.paths` | ✅ `on.push.paths` | n/a |
| Reuses existing build yaml | ✅ (must guard deploy step) | ✅ unchanged | ✗ re-implements | ✗ |
| Fit for one service / solo | good | **best** | good | overkill |

## Decision (Option 2)

Adopt **Option 2**: a dedicated `deploy-studio.yml` GitHub Actions workflow, keyless via the existing
WIF pool, delegating the build to Cloud Build and reusing `infra/studio-cloudbuild.yaml` unchanged.
It is the keyless, single-trust-surface, in-repo, minute-frugal fit for a one-service deploy and it
leans directly on the WIF investment PR #95 already makes.

Shape (as proposed; the *Done in this unit* section records what was built and where the build
refined this sketch):

**A. Terraform — `infra/studio-cd.tf` (new), one-time `terraform apply` by the owner.** *References*
the WIF pool from `ci-presence.tf`; does **not** recreate it.

- `google_service_account.studio_deployer` — `storytree-studio-deployer`.
- `roles/run.admin` (deploy revisions **and** the `setIamPolicy` that `--iap` re-asserts each deploy —
  `run.developer` cannot do the latter; this is the one knowingly-wide grant, with tightening options
  documented in `infra/studio-cd.md`).
- `roles/iam.serviceAccountUser` **on `storytree-studio-host`** (actAs, so the revision keeps running
  as the runtime SA — the ADR-0042 keyless DB posture).
- `roles/cloudbuild.builds.editor` + `roles/logging.viewer` + `objectAdmin` on a **dedicated** source
  bucket (`…-studio-cd-build`, not the shared `_cloudbuild` default) so `gcloud builds submit` works;
  the Cloud Build execution SA already has `artifactregistry.writer` (the owner's manual builds push
  today), so it is untouched. `roles/artifactregistry.reader` on the `storytree` repo for the deploy
  to reference the image.
- `google_service_account_iam_member` binding the deploy SA to the WIF pool's principalSet with
  `roles/iam.workloadIdentityUser`, scoped to **`attribute.ref/refs/heads/main`** (tighter than
  ci-presence's repo-wide binding — a deploy SA is privileged, so only `main`-branch runs may assume it).
- **No DB grants** — the deployer never touches Cloud SQL; the runtime SA already has them.

**B. Workflow — `.github/workflows/deploy-studio.yml` (new).**

- `on: push: { branches: [main], paths: [ "apps/studio/**", "packages/**", "docs/**",
  "stories/**", "pnpm-lock.yaml", "package.json", "apps/studio/Dockerfile",
  "infra/studio-cloudbuild.yaml", ".github/workflows/deploy-studio.yml" ] }`.
- `permissions: { id-token: write, contents: read }`.
- `concurrency: { group: deploy-studio, cancel-in-progress: false }` — serialize so two quick merges
  deploy in order rather than racing or aborting a half-finished rollout.
- Steps: checkout → `google-github-actions/auth@v2` (WIF provider + deploy SA) →
  `gcloud builds submit --config infra/studio-cloudbuild.yaml --substitutions=_TAG=$(git rev-parse
  --short HEAD) .` → `gcloud run deploy storytree-studio …` with the **full ADR-0042 flag set verbatim**
  (`--iap --no-allow-unauthenticated --service-account storytree-studio-host@… --set-env-vars …
  --memory 1Gi --max-instances 2`) → smoke check (C).

**C. Safe post-deploy smoke check (no `--no-iap` spoofing).** The site is IAP-locked, so the
verify-behind-the-wall recipe (temporary `--no-iap` + a `run.invoker` binding + a spoofed
`x-goog-authenticated-user-email` header) is **explicitly out of bounds for automated CD** — it would
briefly drop the IAP wall. Instead:

1. **Trust the deploy as the primary gate.** `gcloud run deploy` blocks until the new revision is
   **Ready** and fails the step if the container crashes on startup — so a broken bundle already
   fails the job.
2. **Assert the rollout took.** `gcloud run services describe storytree-studio
   --format='value(status.latestReadyRevisionName)'` equals the just-deployed revision, and traffic
   routes 100% to LATEST.
3. **Optional hardening:** add a Cloud Run **startup probe** on a liveness route (per ADR-0042 health
   probes hit the container *directly*, before IAP) so DB-independent boot health is part of
   "Ready". The probe must return 200 **regardless of DB state** — the studio self-reports degraded
   and recovers in place when the DB comes back (don't let an idle-stopped Cloud SQL block a deploy).
   *Owner check needed:* confirm `/api/health`'s status-code semantics (it should be 200 with
   `{db: ok|down}`, never a 5xx on a stopped DB) before pointing a probe at it.

## Owner decisions

1. ✅ **RESOLVED — Option 2** over Option 1 (owner, 2026-06-13). The trade was *single trust surface +
   in-repo config* (Option 2) vs *zero Actions minutes + native trigger filtering* (Option 1).
2. ✅ **RESOLVED — the conservative `paths:` filter** (owner, 2026-06-13; "recommended defaults"). It
   errs toward over-deploying. The residual risk: if the studio's import graph grows a new
   `packages/**` dependency, the filter still catches it (`packages/**` is wholesale), but any *new*
   served input outside those globs would silently not trigger — the staleness bug reintroduced
   narrowly. Deploy-everything would remove that risk at the cost of a build per `main` push.
3. ✅ **RESOLVED — delegate the build to Cloud Build** (owner, 2026-06-13; "recommended defaults"):
   fewer Actions minutes; the build SA + deploy SA split is accepted.
4. ⏳ **PENDING (operational) — sequencing with PR #95.** CD's WIF binding *references* the
   `github-actions` pool from `ci-presence.tf`. Land + `terraform apply` PR #95's WIF first, then this
   unit references it; or apply both from one `infra/` checkout in a single run. **One** owner
   `terraform apply` covers both. (Detail: `infra/studio-cd.md`.)
5. ⛔ **MOOT** — was the Cloud Build trigger SA caveat, which applied only if Option 1 were chosen.

Plus the §Decision-C **owner-check**: confirm `/api/health` returns 200 (not a 5xx) when the DB is
idle-stopped before pointing the optional startup probe at it.

## Consequences

- The merge→deploy gap closes: a studio-affecting merge to `main` redeploys within minutes, and the
  `/api/health` `code` stamp goes from *the skew detector* to *the confirmation the deploy landed*.
- One new keyless principal (`storytree-studio-deployer`) and one new workflow; the IAP / runtime-SA
  / env-var posture (ADR-0042) is preserved verbatim by passing the full deploy flag set every time.
- A small, bounded GitHub Actions minute cost per studio-affecting merge (~1–2 min when delegating
  the build); Cloud Build and Cloud Run stay within free/scale-to-zero economics.
- The manual runbook (`infra/studio-cloud.md` §3–§4) remains valid as the **break-glass** path
  (first stand-up, or deploying an arbitrary non-`main` commit) — CD is additive, not a replacement.
- Rollback stays a one-liner via Cloud Run revisions; no release-pipeline machinery is introduced.
- **Not decided here:** verifying the IAP JWT signature, multi-environment/staging, canary or
  approval-gated rollouts (Cloud Deploy territory), and a DB→seed export — all out of scope.

## Done in this unit

- `.github/workflows/deploy-studio.yml` — `push: main` + the conservative `paths:` filter, keyless
  WIF auth (`storytree-studio-deployer`), `gcloud builds submit` (delegated build, dedicated staging
  dir), `gcloud run deploy` with the full ADR-0042 flag set, and the Ready-revision smoke check
  (`latestReadyRevisionName == latestCreatedRevisionName`; no `--no-iap` spoof).
- `infra/studio-cd.tf` — the deploy SA and its least-privilege IAM, the dedicated source-staging
  bucket (7-day TTL), and the WIF binding (ref-scoped to `main`). References the `ci-presence.tf` WIF
  pool by literal path so the two units stay decoupled. Three outputs paste-check the workflow.
- `infra/studio-cd.md` — the owner runbook: the one-time `terraform apply`, the PR #95 sequencing
  dependency, the output↔workflow paste-check, the IAM-surface review (incl. the `run.admin` rationale
  and two tightening options), and the rollback one-liner.
- **Refinements over the proposal sketch, made during the build:** `run.admin` (not `run.developer`)
  because `--iap` performs a `setIamPolicy`; a dedicated `…-studio-cd-build` staging bucket (not the
  shared `_cloudbuild` default) to scope `objectAdmin`; the WIF binding scoped to
  `attribute.ref/refs/heads/main` (not repo-wide).
- **Held DRAFT** until the owner runs the apply (decision 4) — a deploy that cannot authenticate fails
  *loudly* (not fail-soft like the presence retire), so the PR waits rather than red-running `main`.

## References

- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (green gate + auto-merge — scope clause narrowed
  here; mechanism reused as the trigger edge).
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) (the Cloud Run + IAP posture CD must
  preserve); `infra/studio-cloud.md` (the manual runbook this automates).
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) (keyless / no JSON keys).
- `infra/ci-presence.tf` + `infra/ci-presence.md` (PR #95, branch `claude/nostalgic-bose-4d127b`) —
  the existing WIF pool/provider this CD reuses, and the fail-soft WIF-in-`automerge` precedent.
- `infra/studio-cloudbuild.yaml`, `apps/studio/Dockerfile` (the build this delegates to).
- Owner conversation, 2026-06-13 (the `studio-members` PR #102 stale-bundle incident).
