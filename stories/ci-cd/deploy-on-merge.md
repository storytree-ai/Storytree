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

> **Adjudicated 2026-08-31 (`prove-unproven-capabilities-arc-inc-25`) — RE-SCOPED by correcting stale
> prose; no tiering or hierarchy change. The premise that routed it here does not survive a check at
> source.** That increment filed this capability under "the thing to prove is a deployment", on the
> reading "a live Cloud Run deploy". **This spec has never claimed a live deploy.** The
> proof-walkthrough below says the opposite in terms: *"It is a workflow/posture audit, not a real
> deploy."* All four contracts are assertable against
> [`.github/workflows/deploy-studio.yml`](../../.github/workflows/deploy-studio.yml) and
> [`infra/studio-cd.tf`](../../infra/studio-cd.tf) with no GCP call, no rollout and no money — the
> same in-repo file-audit shape `auto-merge-on-green` carries, and the same one
> `packages/cli/src/dist-bucket-infra.test.ts` and `web-editor-iam-bootstrap.test.ts` already use
> against `.tf` files.
>
> Verified against the live workflow the same day: the `paths:` filter, the WIF provider +
> `storytree-studio-deployer` SA with no JSON key, the Cloud Build step, and the full
> `--service-account … --set-env-vars … --no-allow-unauthenticated --iap` flag set are all present
> exactly as the contracts describe. **What did NOT survive is contract 4's trigger claim — corrected
> below.**
>
> End-state: **capability-shaped, correctly tiered, correctly `integration-test`, and UNBUILT** — a
> build-lane item, not an adjudication one. It is **not** an ADR-0466 case: the artifacts under test
> are files in this repo, so nothing outside has to publish a result back.

## Guidance

- **Proof-walkthrough first (integration test, against the real deploy workflow definition).** The
  unit is the assembled deploy job: assert it triggers on `push:main` ONLY when a studio-affecting
  path changed (the `paths:` filter — `apps/studio/**`, `packages/**`, `docs/**`, `stories/**`,
  lockfile, build/deploy machinery), authenticates keyless (WIF provider + `storytree-studio-deployer`
  SA, no JSON key), builds via Cloud Build with a short-SHA tag, deploys with the full
  `--service-account … --set-env-vars … --no-allow-unauthenticated --iap` flag set, re-asserts 100%
  of traffic onto the revision it just created, and runs the safe smoke check (that named revision is
  `Ready` and is the one serving — no curl, the site is
  IAP-locked). It is a workflow/posture audit, not a real deploy; the live rollout follows the house
  manual/dispatch path (next bullet).
- **The GITHUB_TOKEN no-cascade reality, and how it is CLOSED (corrected in place 2026-08-31 —
  ADR-0061).** An auto-merged PR's `push:main` still does NOT cascade a deploy: GitHub will not fire
  a push-triggered workflow from a `GITHUB_TOKEN` push (anti-recursion). Owner *manual* merges do
  cascade. ⚠ **The old wording here — "until a deploy PAT is wired, a studio-affecting auto-merge is
  deployed on demand" — described a gap that no longer exists and named a remedy that was never
  taken.** ADR-0061 closed it with **no PAT and no new secret**: `ci.yml`'s `automerge` job holds
  `actions: write` and, as its LAST step, greps the merged PR's file list against the ADR-0046
  studio-affecting path set and runs `gh workflow run deploy-studio.yml --ref main`.
  `workflow_dispatch` is the documented anti-recursion exception, and a dispatch on `--ref main`
  presents a `refs/heads/main` OIDC token the deploy SA's main-scoped WIF binding already accepts.
  So a studio-affecting auto-merge **does** deploy today — automatically, via dispatch rather than
  via cascade. The hand-run `gh workflow run deploy-studio.yml --ref main` survives as the
  break-glass path, not as the routine one. The capability still proves the trigger + posture, not a
  rollout.
- **Full posture, every time, verbatim.** The deploy passes the entire ADR-0042 flag set on every run
  so the IAP wall, the least-privilege runtime SA, and the env vars (`STORYTREE_STUDIO_STORE=pg`,
  the SA DB user, the admin allowlist) can never silently drift between deploys.
- **Deploys serialize, never race.** `concurrency: deploy-studio` with `cancel-in-progress: false` —
  a newer merge waits for the in-flight rollout rather than aborting it half-finished.
- **The smoke check is IAP-safe.** It does not curl the site (no `--no-iap` spoof — that would drop
  the wall); `gcloud run deploy` already blocks until the revision is Ready, and the check confirms
  the revision built from this commit is `Ready` and holds 100% of traffic — i.e. members are on it.
- **Serving is re-asserted, never assumed.** A `--tag … --no-traffic` side-deploy (an attestation
  deep-link) rewrites the service's traffic block into an explicit pin, after which every CD deploy
  lands at 0% traffic. So the job pins traffic to its own revision by name each run — the same
  declare-don't-inherit posture as the flag set above (ADR-0046 §C.2).

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
4. **`automerge-dispatches-the-deploy`** — the no-cascade gap is closed by dispatch, not by a PAT
   - **asserts —** `deploy-studio.yml` declares `workflow_dispatch` alongside `push:main`; and
     `ci.yml`'s `automerge` job carries `actions: write` and a LAST step that matches the merged PR's
     file list against the ADR-0046 studio-affecting path set and runs `gh workflow run
     deploy-studio.yml --ref main` — so a studio-affecting auto-merge deploys even though its
     `GITHUB_TOKEN` `push:main` cannot cascade (anti-recursion). Asserts the step is LAST (a
     dispatch failure must not be able to skip the fail-soft claim-release steps above it) and that
     it carries no `continue-on-error` (a missed deploy is the bug ADR-0061 fixed, so it is loud).
     *(Renamed and re-asserted 2026-08-31. It previously read `manual-or-dispatch-trigger` and
     asserted the deploy fires only from an owner manual merge or a HAND-RUN dispatch — "the honest
     trigger gap, recorded not papered over". That gap was closed by ADR-0061 and the contract had
     gone stale in the direction that reads as honesty: it described a live automated dispatch as an
     unfilled hole.)*
