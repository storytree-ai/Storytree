---
status: accepted
decided: 2026-06-14
---

# ADR-0042: Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests

## Status

accepted (2026-06-14) — direct owner decisions, recorded the same day: the studio gets a hosted,
interactive deployment for a small circle of trusted devs to play with. **Narrows**
[ADR-0008](0008-ui-drives-agents-approvals.md)'s single-local-operator identity assumption (a
free-text `author` field) to the *local dev* studio — hosted sessions carry a **verified identity**
from the IAP auth layer (ADR-0008 corrected in place per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)). Builds on [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md)
(the GCP project) and [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) (keyless
IAM DB auth, here extended to a runtime service-account principal).

> **Amended by [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md)**
> (accepted, 2026-06-22) — the hosted studio backend MAY run the agent, gated to the circle. The thin
> client, members, and IAP model below stand; the "live builds / CLI / agent runtime out of scope for
> the circle" scope is relaxed to allow build-triggering through a gated, build-capable worker.

**Correction ([ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md), per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** this ADR's **serve mode** STANDS and ADR-0043 builds on it — the standalone Cloud Run + IAP deployment (`serve.ts`), IAP **authentication** fail-closed at the API, and the read+comment guest scope. Overtaken only: its **authorization model** — the IAP per-account allowlist as the authorization *gate*, the **`STORYTREE_STUDIO_ADMINS` env-var admin list**, and the IAM-ceremony/no-user-table framing are replaced by ADR-0043's app-owned `users` table with roles + in-UI invitations; IAP is demoted to authentication only. The authorization passages below are corrected in place to point here.

## Date

2026-06-14

## Context

The studio has no production server: the entire backend is a Vite dev-server middleware plugin
(`apps/studio/server/devApi.ts`), and several of its surfaces assume the operator's own machine —
`/api/db/*` shells out to `gcloud` with the operator's ambient ADC ("not a remote-exec hole: the
Vite dev server binds localhost-only", its own header notes), comments attribute to a free-text
`author`, and artifact writes are unguarded. The owner wants a small circle of trusted devs to
**interact** with the studio (the story world, the library, the forum) — a hosted demo, not repo
access. Live builds, the CLI, and the agent runtime are explicitly out of scope for the circle.

## Owner decisions (2026-06-14)

1. **Exposure: Cloud Run + IAP.** A real studio server deploys to Cloud Run in the existing
   `storytree-498613` project; Identity-Aware Proxy gates it to an allowlist of Google accounts.
   *(Authorization gate overtaken — see the Correction above: ADR-0043 widens IAP to authentication
   only and moves authorization to the app's `users` table; the Cloud Run + IAP exposure itself
   stands.)* Prefer the direct Cloud Run–IAP integration; if the classic HTTPS load balancer is required it
   adds roughly US$20/month — accepted. Rejected: tunnels to the laptop (Tailscale/Cloudflare) —
   demo-grade, laptop-bound, shared identity.
2. **Guest scope: read + comment.** Guests browse everything the studio renders (world, library,
   docs, presence, verdicts) and write **comments only**, attributed to their verified identity.
   Artifact editing stays owner-side. Rejected: read-only (nothing to play with) and full edit
   (the library's live source of truth on the honor system, with last-write-wins same-artifact
   races — ADR-0009's claims gate is still deliberately deferred).

## Decision

1. **A standalone serve mode.** `apps/studio/server/serve.ts` — a plain `node:http` server that
   serves the built SPA (`dist/`) and mounts the SAME `/api/*` route table the dev plugin uses
   (extracted to `server/apiRouter.ts`; the handlers were already injectable). No Vite at
   runtime. Docs and stories are read from the repo files baked into the container image — a
   snapshot, refreshed by redeploy; the live layers (library, comments, verdicts, presence) come
   from the shared Cloud SQL store over the Node connector, authenticated as the runtime service
   account (keyless, the ADR-0021 posture — no key file in the image).
2. **Identity from the proxy, fail-closed at the API.** The server reads
   `x-goog-authenticated-user-email` (IAP's verified-identity header). In guarded mode every
   `/api/*` request **without** an identity is refused (401) — defense-in-depth under the
   deployment invariant that ingress is IAP-only; static assets stay open (the bundle is not a
   secret, and health probes hit the container directly). Verifying the IAP JWT signature
   (`x-goog-iap-jwt-assertion`) is named hardening if exposure ever widens beyond the trusted
   circle. Local dev (`vite dev`) keeps today's open, localhost-only behaviour.
3. **The guest policy.** Non-admin identities: every GET; `POST /api/comments` with the author
   **stamped from the verified identity** (the client field is ignored); PATCH/DELETE on a
   comment only when its author matches the caller. Admins (`STORYTREE_STUDIO_ADMINS`, a
   comma-separated email allowlist) additionally get asset writes. *(The env-var admin list as the
   admin mechanism is overtaken — see the Correction above: ADR-0043 makes roles app-owned; this env
   var survives only as a bootstrap seed for the first admin.)* `/api/db/*` is refused for
   everyone in hosted mode — its gcloud-on-the-operator's-machine premise simply doesn't hold in
   a container (the StoreBanner's Start DB button answers 403 there; the owner starts the DB
   from a session as usual).
4. **The circle is an IAM ceremony, not an account system.** Adding a dev = granting their
   Google account on the IAP resource. No passwords, no user table — the comment `author` field
   carries their verified email. *(Overtaken — see the Correction above: this is directly reversed by
   [ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md), which makes the studio an account
   system — an app-owned `users` table with roles, invitations from the UI — and demotes IAP to
   authentication only; corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).)*

## Consequences

- The `dist/`-plus-API container is the studio's first deployable artifact; `pnpm -r build`
  finally has a consumer beyond CI. Dockerfile + Terraform (Cloud Run service, runtime SA with
  `roles/cloudsql.instanceUser` + client, IAP allowlist) land in `infra/` as the follow-up unit.
  *(The IAP allowlist is overtaken — see the Correction above: ADR-0043 widens IAP to
  `allAuthenticatedUsers` and authorizes in-app.)*
- Comments written from the hosted studio land in the live store and appear in the owner's
  normal workflow — the demo doubles as a feedback channel (the forum IS the product surface).
- The world's presence layer shows the circle the owner's live sessions (wisps) — by design;
  presence is advisory and public to the board (ADR-0033).
- A stopped DB renders the hosted studio in its honest degraded mode (banner, no live layers)
  and guests cannot start it; if the circle uses it heavily outside the owner's hours, the
  idle-stop economics (ADR-0015 §5, 8 h window) may need revisiting — a cost note, not a bug.
- The docs/stories snapshot can lag `main` between deploys; the existing `/api/health` code
  stamp makes the skew observable rather than silent.
