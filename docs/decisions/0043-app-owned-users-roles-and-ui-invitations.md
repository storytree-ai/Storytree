---
status: accepted
decided: 2026-06-14
---

# ADR-0043: App-owned users, roles, and invitations from the UI

## Status

accepted (2026-06-14) — owner decision: the trusted circle should be **real users tracked in the
system**, invitable **from the studio UI**, with **roles**. **Replaces**
[ADR-0008](0008-ui-drives-agents-approvals.md)'s single-local-operator identity assumption (already
narrowed by ADR-0042) and [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md)'s IAP-allowlist
authorization model (the per-account allowlist as the gate + the env-var admin list) with the
app-owned user model below (ADR-0008 and ADR-0042 corrected in place per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)). Builds on
ADR-0042's serve mode + IAP authentication and ADR-0021's keyless store access.

## Date

2026-06-14

## Context

ADR-0042 gated access with IAP's per-account allowlist and named admins through
`STORYTREE_STUDIO_ADMINS`. That has no user records, no roles beyond admin/not, and no way to add
someone without an owner running a gcloud command. The owner wants proper users in the system,
invitations from the UI, and roles — i.e. identity is now a first-class part of the product, not a
deployment detail.

## Owner decisions (2026-06-14)

1. **Authorization model: app-owned.** IAP is demoted to *authentication only* — it proves "you
   are a Google account" and nothing more. The studio's **own users table authorizes**: who is in,
   and what they may do. (Chosen over keeping the IAP allowlist as the gate, which would require
   giving the runtime service account IAP-admin rights to grant access to itself.)
2. **Roles: Admin + Member.** Admins invite/manage users, edit Library artifacts, and record
   attestations; members read everything the studio shows and comment as themselves. More tiers
   are deferred-but-easy (the role is a single enum column).

## Decision

1. **Users are an app-owned, event-sourced projection.** A `users` projection over append-only
   `events.user_event` (the house event+projection pattern, siblings to `events.comment*` /
   `events.session*`): `{ email, role: 'admin'|'member', status: 'invited'|'active', invitedBy,
   createdAt, lastSeenAt }`. Identity key = the verified email. zod-validated at the write boundary
   in `@storytree/core`, like every other doc.
2. **IAP authenticates; the app authorizes.** IAP is reconfigured to admit any authenticated
   Google account (`allAuthenticatedUsers` on the IAP resource) — it stops being the allowlist.
   Every `/api/*` request resolves the verified email to a user row:
   - **not in the table** → the app reveals nothing (403 + a "request access" affordance); the
     world, library, and docs are NOT served to non-members, so widening IAP to authenticate-only
     does not expose the corpus.
   - **member** → read everything + comment as self (the ADR-0042 guest scope).
   - **admin** → additionally: user management, asset writes, attestations.
3. **Invitations are a UI action, fully self-contained.** An admin invites by email + role from
   the studio; that writes an `invited` user row — no GCP/IAM call, no special server powers. The
   invitee signs in with Google (IAP authenticates), the app finds their row and flips it to
   `active` on first request. Admins can change a role or remove a user from the same UI.
4. **Bootstrap + safety.** `STORYTREE_STUDIO_ADMINS` survives only as a *bootstrap seed*: a listed
   email is treated as an active admin on first sign-in, so there is always a first admin who can
   invite the rest. The system refuses to remove/down-role the last remaining admin (no lockout).
5. **Comment authorship stays the verified identity** (ADR-0042 d.3, unchanged); now it also keys
   into the user row, so the forum shows real, role-aware authorship.

## Consequences

- The security posture shifts from "only allowlisted Google accounts can reach the app" to "any
  Google account can reach the app, which then reveals nothing to non-members." For a trusted-
  circle demo this is the conventional, lower-friction shape; the corpus's confidentiality now
  rests on the app's membership check rather than IAP's allowlist, so that check is fail-closed and
  covered by tests.
- `circle-onboarding` (ADR-0042's gcloud grant/revoke runbook) is **replaced** by the in-UI invite
  flow for day-to-day membership; the IAP layer keeps only the coarse "is a Google account" gate.
- A new `users` event family + projection, an admin UI surface, and role enforcement in the policy
  layer (`guestPolicy` grows from a 2-state guest/admin function to a role lookup). Deployed via
  the existing image + Cloud Run path; the IAP allowlist is widened to authenticated users as part
  of the rollout.
- Self-hosting identity (vs delegating to IAP/IAM) is a deliberate cost: the app owns the
  request-access UX, the last-admin guard, and audit via the event log — in exchange for
  invitations that need nothing but the UI.
