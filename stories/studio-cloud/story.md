---
id: "studio-cloud"
tier: story
title: "Studio cloud — the trusted circle interacts with a served studio"
outcome: "A small circle of trusted devs opens a URL, signs in with their Google account, and interacts with the live studio — world, library, docs — leaving comments under their verified identity; nothing else about the system is exposed."
status: proposed
proof_mode: UAT
capabilities: [serve-mode, guest-scope, container-image, cloud-run-iap, circle-onboarding, hosted-db-wake, write-broker, deploy-health-signal]
# Story-level edges: the studio UI being served, the library story's store seam (ADR-0010 §4), and —
# ADR-0117 — studio-members, whose `builder` role + `resolveAccess` the write-broker gate consumes (the
# real code edge already exists: guestPolicy.ts imports @storytree/studio-members, and studio-members'
# story declares "Membership is CONSUMED BY the hosted studio"). The broker persists a builder's
# locally-signed verdict/presence under the studio's one service-account DB identity.
# notice-board + proof-protocol: honesty edges the ADR-0115 drift report surfaced (2026-07-05 map
# audit) — this story's registered unit sources import the presence schema (@storytree/notice-board,
# the hosted server's session reads) and the verdict/signing shapes (@storytree/proof-protocol, the
# broker's verdict persist) directly, not only through the studio.
# cli (ADR-0192 rule 5 — the hosted-story landlord / packages-forward edge): the `deploy-health-signal`
# capability's proof-bound source (packages/cli/src/deploy-health.ts) is HOSTED in cli's building
# (packages/cli), where every gate check lives. NO code import backs it — the pure classifier imports
# nothing and is wired into the gate by the root package.json check script (glue), not by a package
# dependency — so the edge is declared consumer-side here and annotated in artifact_edges (ADR-0192 D1).
# studio-cloud is on the `hostedStories` grandfather register (rule 6 admits it).
depends_on: [studio, library, studio-members, notice-board, proof-protocol, cli]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, library, cli]
decisions: [42, 49, 117, 194] # deciding ADRs (ADR-0037 §2): 0042 stood it up, 0049 lets it wake its own DB, 0117 the members-gated write-broker + builder scope, 0194 the deploy-health gate signal
---

# Studio cloud — the trusted circle interacts with a served studio

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

## The write-broker (ADR-0117)

[ADR-0117](../../docs/decisions/0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md)
adds a **members-gated write-broker** on this served studio's `/api/*` table: a thick-local co-builder
(the `desktop` story) POSTs his **already-signed** verdict / presence to the broker, and the SERVER — under
its one service-account DB identity — validates SHAPE + ATTRIBUTION and persists it, so his local build
blooms in the shared forest WITHOUT a per-friend Cloud SQL IAM grant. The broker holds **no signing key**
and never re-signs (ADR-0091); it is the inverse of `/api/uat/attest` on the verdict side (that endpoint
*signs* a new verdict; the broker *persists* a handed-in one). Authorization is the existing `resolveAccess`
gate with the `builder` scope required ([`builder-role`](../studio-members/builder-role.md)). It rides the
ONE route table + the existing policy gate (`guestPolicy.ts`) — not a second backend (ADR-0042). It is
CONSUMED BY the desktop over HTTP ([`shared-forest-connection`](../desktop/shared-forest-connection.md)).

## Capabilities (8)

Listed roots-first (1–7 serve + gate the studio; 8 watches this story's own post-merge CD from the repo
side, so a silently-failed deploy is loud at the gate tail — ADR-0194).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`serve-mode`](serve-mode.md) | A standalone node server serves the built SPA and the same /api route table the dev plugin uses — no Vite at runtime. | proposed | — |
| 2 | [`guest-scope`](guest-scope.md) | In guarded mode every API request carries a verified identity; guests read everything, comment as themselves, and touch only their own comments; admins keep asset writes; db control is refused. | proposed | `serve-mode` |
| 3 | [`container-image`](container-image.md) | The studio builds into a container image carrying dist/, the server, and the docs/stories snapshot — runnable anywhere with only env + ADC. | proposed | `serve-mode` |
| 4 | [`cloud-run-iap`](cloud-run-iap.md) | Terraform stands up the Cloud Run service behind IAP with a least-privilege runtime service account reaching Cloud SQL keylessly. | proposed | `container-image`, `guest-scope` |
| 5 | [`circle-onboarding`](circle-onboarding.md) | Adding a trusted dev is one IAM grant plus a runbook link; removing them is one revoke; the circle's access is enumerable at a glance. | proposed | `cloud-run-iap` |
| 6 | [`hosted-db-wake`](hosted-db-wake.md) | When the shared DB idle-stops, an admin wakes it from the site — keyless, container-native, no gcloud; the page self-recovers, non-admins are refused. | proposed | `serve-mode`, `guest-scope` |
| 7 | [`write-broker`](write-broker.md) | A members-gated POST endpoint persists a builder's locally-signed verdict / presence — validating shape + attribution, refusing a non-builder (403) / malformed (400) / mismatched signer — holding no signing key, never re-signing. | proposed | `guest-scope` |
| 8 | [`deploy-health-signal`](deploy-health-signal.md) | A pure classifier turns the deploy-studio CD run list into an ok / red / unknown health signal, so a red post-merge deploy is loud at the gate tail (best-effort, WARN-only, ADR-0194). | proposed | — |

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
8. **Broker a build (ADR-0117):** the owner marks `friend@example.com` a **builder** (Members panel);
   the friend's thick-local desktop POSTs a locally-signed verdict to the write-broker. **Success —** the
   broker validates shape + attribution + the builder scope and persists it (the server is the single DB
   authority); the friend's build blooms in the forest the owner watches; a `member` (non-builder) POST is
   403, a malformed body 400, a mismatched-signer body refused. *(The broker's gate/shape/attribution core
   is [`write-broker`](write-broker.md)'s contracts; the end-to-end "a builder's brokered write blooms in
   the shared forest" walk is operator-attested under ADR-0070, witnessed jointly with `desktop` UAT leg 5.)*

## Open modeling calls (for the owner)

None — ADR-0042 resolved exposure and guest scope; [ADR-0117](../../docs/decisions/0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md)
added the members-gated write-broker + the `builder` scope (a settled owner-directed decision, born
accepted per ADR-0110). Cost detail (direct IAP integration vs classic LB ~US$20/mo) is recorded in
ADR-0042 and lands with `cloud-run-iap`.
