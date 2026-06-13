---
id: "studio-hosting"
tier: story
title: "Studio hosting — the trusted circle interacts with a served studio"
outcome: "A small circle of trusted devs opens a URL, signs in with their Google account, and interacts with the live studio — world, library, docs — leaving comments under their verified identity; nothing else about the system is exposed."
status: proposed
proof_mode: UAT
capabilities: [serve-mode, guest-scope, container-image, cloud-run-iap, circle-onboarding]
# Story-level edges: the studio UI being served, and the library story's store seam (ADR-0010 §4).
depends_on: [studio, library]
decisions: [42] # deciding ADR (ADR-0037 §2)
---

# Studio hosting — the trusted circle interacts with a served studio

**Outcome —** A small circle of trusted devs opens a URL, signs in with their Google account, and
interacts with the live studio — world, library, docs — leaving comments under their verified
identity; nothing else about the system is exposed.

The deciding ADR is [ADR-0042](../../docs/decisions/0042-hosted-studio-demo-cloud-run-iap.md)
(owner decisions 2026-06-14: Cloud Run + IAP exposure; read+comment guest scope). The story turns
the studio from a laptop-bound Vite dev process into a deployable artifact without forking it:
ONE `/api/*` route table serves both the dev plugin and the hosted server, and the hosted
differences are a policy layer, not a second backend.

## Design floor (from ADR-0042)

- **One route table.** The dev plugin and the standalone server mount the same extracted API
  router; hosted behaviour differs only by the injected policy. No endpoint exists twice.
- **Identity from the proxy, fail-closed.** IAP's verified-email header is the identity; in
  guarded mode an API request without one is refused (401). The deployment invariant — ingress
  is IAP-only — is what makes header trust acceptable for a trusted circle; JWT-assertion
  verification is named hardening.
- **Guests read everything, write comments only.** Comment authorship is stamped server-side
  from the verified identity; guests edit/resolve/delete only their own comments; asset writes
  need the admin allowlist; `/api/db/*` is never served hosted.
- **The image is a snapshot; the store is live.** docs/ + stories/ bake into the container;
  library/comments/verdicts/presence flow from the shared Cloud SQL store via the runtime
  service account (keyless IAM, ADR-0021).
- **Local dev is untouched.** `vite dev` keeps the open localhost behaviour, json fallback
  included.

## Capabilities (5)

Listed roots-first.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`serve-mode`](serve-mode.md) | A standalone node server serves the built SPA and the same /api route table the dev plugin uses — no Vite at runtime. | proposed | — |
| 2 | [`guest-scope`](guest-scope.md) | In guarded mode every API request carries a verified identity; guests read everything, comment as themselves, and touch only their own comments; admins keep asset writes; db control is refused. | proposed | `serve-mode` |
| 3 | [`container-image`](container-image.md) | The studio builds into a container image carrying dist/, the server, and the docs/stories snapshot — runnable anywhere with only env + ADC. | proposed | `serve-mode` |
| 4 | [`cloud-run-iap`](cloud-run-iap.md) | Terraform stands up the Cloud Run service behind IAP with a least-privilege runtime service account reaching Cloud SQL keylessly. | proposed | `container-image`, `guest-scope` |
| 5 | [`circle-onboarding`](circle-onboarding.md) | Adding a trusted dev is one IAM grant plus a runbook link; removing them is one revoke; the circle's access is enumerable at a glance. | proposed | `cloud-run-iap` |

## Story UAT (would-be)

**Goal —** One trusted dev who has never seen the system goes from an invite to a comment the
owner reads, without touching a terminal.

1. **Grant:** the owner adds `dev@example.com` to the IAP allowlist (one Terraform var / one
   gcloud command from the runbook). **Success —** the grant is visible in the allowlist
   enumeration.
2. **Sign in:** the dev opens the studio URL, lands on Google sign-in, and arrives at the studio
   with no further setup. **Success —** the world renders with live verdict hues and wisps.
3. **Browse:** the dev clicks through the story world, a story panel, the library, and an ADR.
   **Success —** all read surfaces work; no write affordance errors out on sight.
4. **Comment:** the dev leaves a comment on an artifact. **Success —** it persists to the live
   store with `author = dev@example.com` — regardless of what the client sent.
5. **Scope walls:** the dev attempts an artifact edit and a db start (curl or devtools).
   **Success —** 403 with a clear reason; their own comment they can edit/resolve; another
   author's comment they cannot.
6. **No identity, no API:** a request that bypasses IAP (no identity header) is refused (401)
   even though the static bundle serves. **Success —** fail-closed posture observed.
7. **Revoke:** the owner removes the grant. **Success —** the dev's next visit stops at
   sign-in; nothing else changed.

## Open modeling calls (for the owner)

None — ADR-0042 resolved exposure and guest scope. Cost detail (direct IAP integration vs
classic LB ~US$20/mo) is recorded there and lands with `cloud-run-iap`.
