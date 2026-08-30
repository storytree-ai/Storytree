---
id: "cloud-run-iap"
tier: capability
story: studio-cloud
title: "Cloud Run behind IAP with a least-privilege runtime service account, codified in Terraform"
outcome: "Terraform codifies the deployed Cloud Run service and its least-privilege runtime SA — IAP authenticates at the edge, the app authorizes, and the SA reaches Cloud SQL keylessly with nothing beyond serving."
status: proposed
proof_mode: integration-test
depends_on: [container-image, guest-scope]
---

# Cloud Run behind IAP with a least-privilege runtime service account, codified in Terraform

**Outcome —** Terraform codifies the deployed Cloud Run service and its least-privilege runtime SA:
IAP authenticates at the edge, the app authorizes (ADR-0043), and the runtime SA reaches Cloud SQL
keylessly holding nothing beyond what serving needs.

> **Adjudicated 2026-08-31 (`prove-unproven-capabilities-arc-inc-25`) — RE-SCOPED. Two faults fixed:
> a superseded access mechanism, and an illegal proof mode.**
>
> **(1) "The allowlist is the only door" was FALSE and is deleted, not softened.** The outcome and
> contract 1 described a per-user IAP allowlist as the authorization boundary. It is not one.
> `roles/iap.httpsResourceAccessor` on this service is granted to **`allAuthenticatedUsers`**
> (verified 2026-08-31 in [`infra/studio-cloud.md`](../../infra/studio-cloud.md) §"What a passing
> token gets you"), so IAP admits **any** authenticated Google identity, and the studio's own
> membership check is the only real authorization boundary — it answers `403 {"error":"not a
> member"}` with no `x-goog-iap-generated-response` header. Identity became app-owned under ADR-0043
> and membership is managed in the in-app Members panel owned by
> [`stories/studio-members`](../studio-members/story.md), whose own spec says it *"supersedes the
> hosted studio's first access model (ADR-0042's IAP allowlist + env admin list)"*. The two sibling
> capabilities [`guest-scope`](guest-scope.md) and [`hosted-db-wake`](hosted-db-wake.md) already
> carry the corrected posture; this file and [`circle-onboarding`](circle-onboarding.md) were the
> two stragglers, and that one is retired by the same pass.
>
> **(2) `proof_mode` was `UAT`, which is ILLEGAL at `tier: capability`.** The zod schema
> (`packages/library/src/schema.ts:132`) allows a capability only `integration-test |
> operator-attested`; `UAT` is the STORY tier's mode. `loadNodeSpec` tolerated it, so nothing was
> red and nothing was blocked — a validation gap, not a defect in this unit. It is now
> `integration-test`, which is also the honest mode for what remains: a `.tf`-file audit, the same
> shape `packages/cli/src/dist-bucket-infra.test.ts` and `web-editor-iam-bootstrap.test.ts` already
> run against `infra/*.tf`. (One further file shares the illegal mode —
> `stories/studio-members/invite-ui.md` — and is somebody else's call.)
>
> **This is NOT an ADR-0466 case.** The remaining thing to prove is the content of `infra/*.tf`,
> files in this repo; nothing outside has to publish a result back.

> **Stand-up status (honest, re-verified 2026-08-31).** First deployed **imperatively** on
> 2026-06-14 via [`infra/studio-cloud.md`](../../infra/studio-cloud.md) (the runbook records every
> command): the direct Cloud Run–IAP integration (`gcloud run deploy --iap`) was available, so **no
> load balancer and no domain** were needed — the ~US$20/mo LB contingency in ADR-0042 was not
> spent. **Terraform codification of exactly that state is still what completes this capability, and
> it is still unbuilt:** `infra/` holds no `google_cloud_run_v2_service` resource and no
> `google_service_account` for the `storytree-studio-host` runtime SA. What Terraform DOES hold is
> the IAM ring around the service — the deployer SA and its WIF binding (`studio-cd.tf`), the scoped
> DB-wake custom role bound to the runtime SA (`studio-db-wake.tf`), and the two harness identities'
> explicit IAP bindings (`harness-identities.tf`). The service itself is stood up by the runbook and
> re-applied on every studio-affecting merge by `ci-cd`'s
> [`deploy-on-merge`](../ci-cd/deploy-on-merge.md). Until the codification lands, the runbook plus
> that workflow are the source of truth for the deployed shape.

## Guidance

- **Proof-walkthrough first (integration test, against the real Terraform).** The unit is the
  codified posture, not a live GCP call: assert `infra/*.tf` declares the Cloud Run service with the
  runtime SA attached, ingress restricted so IAP is the only path, the `--iap` posture and the
  ADR-0042 env set, and that the runtime SA's role set is exactly what serving needs. A live IAM read
  is NOT the unit — it would make the proof depend on credentials and a running project, and the
  drift it would catch is already caught by `deploy-on-merge` re-asserting the full flag set verbatim
  on every deploy.
- Lands in `infra/` next to the existing Terraform (GCS remote state, ADR-0015). Pieces: the service,
  the runtime SA (`roles/cloudsql.client` + `roles/cloudsql.instanceUser`, an IAM DB user for the
  SA), ingress restricted so IAP is the only path.
- **What the IAP grant is NOT.** Do not re-introduce a per-user allowlist tf var. The grant is
  `allAuthenticatedUsers` and authorization lives in the app (ADR-0043). If that grant is ever
  tightened, `harness-identities.tf` already binds the two harness identities explicitly so
  tightening it will not silently break them — which is the reason those bindings are declared
  despite being redundant today.
- Deploy env: `PORT` (platform), `STORYTREE_STUDIO_STORE=pg`, `STORYTREE_DB_USER=<sa>`,
  `STORYTREE_STUDIO_ADMINS=<owner email>` (the bootstrap-admin seed, not an access list), guarded
  mode on.
- `terraform apply` is an owner-confirmed step (new monthly cost), not an auto-merge side effect.

## Contracts (2)

1. **`iap-authenticates-the-app-authorizes`** — the edge proves identity; the app decides access
   - **asserts —** the codified service is `--no-allow-unauthenticated` with the direct IAP
     integration, so no request reaches the container without an IAP-verified identity header; and
     the IAP accessor role is bound to `allAuthenticatedUsers`, so the edge is an AUTHENTICATION wall
     and never an authorization one. The authorization decision is `guest-scope`'s `resolveAccess`
     over the studio-members directory, and is proven there — this contract asserts only that the
     codified posture leaves it as the single decision point, with no second allowlist beside it.
     *(Replaced `iap-is-the-only-door` 2026-08-31, whose assert — "an unlisted Google account is
     refused by IAP; a listed one lands in the studio" — describes a mechanism ADR-0043 superseded
     and is false against the live grant.)*
2. **`runtime-sa-least-privilege`** — the SA holds only what serving needs
   - **asserts —** the runtime SA's codified role set is Cloud SQL client + instanceUser plus the
     narrow `storytreeStudioDbWake` custom role (exactly `cloudsql.instances.get` +
     `cloudsql.instances.update`, `infra/studio-db-wake.tf`) and nothing else — no
     editor/owner/`cloudsql.admin` grant anywhere in `infra/*.tf`, and no service-account key.
