---
id: "deploy-on-merge"
tier: capability
story: ci-cd
title: "Deploy on merge — a studio-touching merge redeploys the live studio, keylessly"
outcome: "A studio-touching merge to main redeploys the live studio to Cloud Run — keyless WIF → Cloud Build image → gcloud run deploy with the full IAP posture."
status: proposed
proof_mode: integration-test
depends_on: [auto-merge-on-green]
# Cross-story forward edge (ADR-0010 §4): deploys the cloud-run-iap service studio-cloud stands up.
---

# Deploy on merge — a studio-touching merge redeploys the live studio, keylessly

**Outcome —** A studio-touching merge to `main` triggers
[`.github/workflows/deploy-studio.yml`](../../.github/workflows/deploy-studio.yml): keyless WIF
([`infra/studio-cd.tf`](../../infra/studio-cd.tf)) → a Cloud Build image (reusing
`infra/studio-cloudbuild.yaml`) → `gcloud run deploy` with the **full ADR-0042 IAP + runtime-SA +
env-var posture** re-asserted verbatim every time (ADR-0046). This is the literal CD half of the
trunk.

> **Cross-story boundary (ADR-0010 §4):** this capability redeploys the **`cloud-run-iap`** service
> owned by [`stories/studio-cloud`](../studio-cloud/story.md) (the Cloud Run + IAP service + runtime
> SA that story stands up). It does not own the service's shape — it re-applies it on each merge. A
> forward edge from this trunk into a sibling — declared, not absorbed.

## Guidance

- **Proof-walkthrough first (integration test, against the real deploy workflow definition).** The
  unit is the assembled deploy job: assert it triggers on `push:main` ONLY when a studio-affecting
  path changed (the `paths:` filter — `apps/studio/**`, `packages/**`, `docs/**`, `stories/**`,
  lockfile, build/deploy machinery), authenticates keyless (WIF provider + `storytree-studio-deployer`
  SA, no JSON key), builds via Cloud Build with a short-SHA tag, deploys with the full
  `--service-account … --set-env-vars … --no-allow-unauthenticated --iap` flag set, and runs the
  safe smoke check (newest CREATED revision == newest READY revision — no curl, the site is
  IAP-locked). It is a workflow/posture audit, not a real deploy; the live rollout follows the house
  manual/dispatch path (next bullet).
- **The GITHUB_TOKEN no-cascade reality (honest).** An AUTO-MERGED PR's `push:main` does NOT cascade
  a deploy: GitHub will not fire a push-triggered workflow from a `GITHUB_TOKEN` push (anti-recursion).
  Owner *manual* merges DO cascade. Until a deploy PAT is wired, a studio-affecting auto-merge is
  deployed on demand with `gh workflow run deploy-studio.yml --ref main` (or the `workflow_dispatch`
  entry). The capability proves the trigger + posture; it does not claim auto-merge alone deploys.
- **Full posture, every time, verbatim.** The deploy passes the entire ADR-0042 flag set on every run
  so the IAP wall, the least-privilege runtime SA, and the env vars (`STORYTREE_STUDIO_STORE=pg`,
  the SA DB user, the admin allowlist) can never silently drift between deploys.
- **Deploys serialize, never race.** `concurrency: deploy-studio` with `cancel-in-progress: false` —
  a newer merge waits for the in-flight rollout rather than aborting it half-finished.
- **The smoke check is IAP-safe.** It does not curl the site (no `--no-iap` spoof — that would drop
  the wall); `gcloud run deploy` already blocks until the revision is Ready, and the check confirms
  the newest created revision is the newest ready one (the rollout actually took).

## Contracts (4)

1. **`triggers-on-studio-affecting-merge`** — the `paths:` filter scopes deploys to real changes
   - **asserts —** the job fires on `push:main` when a studio-affecting path changed (app, packages,
     docs, stories, lockfile, or the build/deploy machinery) and does NOT fire for an unrelated-only
     change; `workflow_dispatch` is always available as the on-demand path.
2. **`keyless-deployer-auth`** — WIF, no JSON key, least-privilege deployer SA
   - **asserts —** auth is GitHub OIDC → the `github-actions` WIF provider → the
     `storytree-studio-deployer` SA (matching `studio-cd.tf` outputs, project NUMBER not id); no
     service-account key is referenced anywhere.
3. **`full-iap-posture-redeployed`** — the ADR-0042 flag set is re-asserted verbatim
   - **asserts —** `gcloud run deploy` carries `--service-account <runtime SA>`, the full
     `--set-env-vars` (store=pg, DB user, admin allowlist), `--no-allow-unauthenticated`, and `--iap`
     — the IAP + runtime-SA + env posture re-applied on every deploy (forward edge into
     studio-cloud's `cloud-run-iap`).
4. **`manual-or-dispatch-trigger`** — auto-merge alone does not cascade a deploy
   - **asserts —** because the `automerge` job merges with `GITHUB_TOKEN`, the resulting `push:main`
     does not cascade `deploy-studio.yml` (anti-recursion); the deploy fires from an owner manual
     merge or an explicit `gh workflow run deploy-studio.yml --ref main` / `workflow_dispatch` — the
     honest trigger gap, recorded not papered over.
