---
id: "studio-members"
tier: story
title: "Studio members — real accounts, roles, and invitations from the UI"
outcome: "An admin invites someone by email from the studio; they sign in with Google and become a tracked user with a role; the API enforces what each role may do, and non-members see nothing but a request-access wall."
status: proposed
proof_mode: UAT
capabilities: [user-directory, app-authorization, invite-ui, invite-notify]
# ADR-0077 U2: studio-members now owns its Postgres user (member) drawer behind ./store (the
# PgUserStore moved in from the dissolving @storytree/store), so it deps @storytree/library
# (createPool/closePool via @storytree/library/store) ONLY — it rolls its OWN duck-typed pool/Store seam
# (PgUserStore), not the @storytree/storage-protocol port (ADR-0078 phantom-dep cleanup).
# ADR-0100: the earlier `studio-cloud` edge was DROPPED — it pointed the wrong way. Membership is
# CONSUMED BY the hosted studio (studio-cloud's guest-scope calls resolveAccess), not a dependency of
# it; studio-members proves its own UAT on the local guarded trial (STORYTREE_STUDIO_DEV_IDENTITY),
# needing no deployed outcome (ADR-0058 delivered-outcome test). The apps-scan that surfaced the real
# studio→studio-members code edge closed a studio-cloud→studio→studio-members→studio-cloud cycle; this
# is the honest break (studio-members' code deps were @storytree/library only all along).
depends_on: [library]
decisions: [43, 100]
---

# Studio members — real accounts, roles, and invitations from the UI

**Outcome —** An admin invites someone by email from the studio; they sign in with Google and
become a tracked user with a role; the API enforces what each role may do, and non-members see
nothing but a request-access wall.

The deciding ADR is [ADR-0043](../../docs/decisions/0043-app-owned-users-roles-and-ui-invitations.md):
identity becomes app-owned (IAP authenticates, the studio authorizes), roles are Admin + Member,
and invitations are a self-contained UI action. This supersedes the hosted studio's first access
model (ADR-0042's IAP allowlist + env admin list).

## Design floor (from ADR-0043)

- **App-owned, event-sourced users.** `events.user_event` + a one-row-per-email `users`
  projection: `{ email, role, status, invitedBy, createdAt, lastSeenAt }`, zod-validated at the
  write boundary — the house pattern (siblings to comments/sessions).
- **IAP authenticates; the app authorizes.** Any Google account passes the edge; the user table
  decides. Non-members get a request-access wall and are served no corpus.
- **Two roles.** Admin (manage users, edit assets, attest) and Member (read + comment as self).
- **Invitations need only the UI.** Invite writes an `invited` row; first sign-in flips it
  `active`. No gcloud, no IAM.
- **Invitees are notified.** Inviting also emails the invitee the studio link (best-effort,
  config-gated) so access isn't a silent row they never hear about — the invite itself never
  depends on the email succeeding.
- **No lockout.** `STORYTREE_STUDIO_ADMINS` seeds the first admin; the last admin can't be removed
  or down-roled.

## Capabilities (4)

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`user-directory`](user-directory.md) | Users persist as append-only events plus a one-row-per-email projection with role + status, validated at the write boundary; the last admin can never be removed. | proposed | — |
| 2 | [`app-authorization`](app-authorization.md) | Every API request resolves its verified email to a user row and enforces role; non-members are served nothing but a request-access signal. | proposed | `user-directory` |
| 3 | [`invite-ui`](invite-ui.md) | An admin invites, re-roles, and removes users from the studio; the invitee activates on first Google sign-in. | proposed | `app-authorization` |
| 4 | [`invite-notify`](invite-notify.md) | Inviting emails the invitee the studio link (best-effort, config-gated) so they learn they have access; the admin sees whether it sent. | proposed | `invite-ui` |

## Story UAT (would-be)

1. **Bootstrap admin:** the seeded admin signs in. **Success —** they land in the studio as an
   active admin; a `users` row exists with role admin.
2. **Invite:** the admin invites `dev@example.com` as a member from the UI. **Success —** an
   `invited` member row exists; no gcloud was run.
3. **Activate:** the invitee signs in with Google. **Success —** their row flips to `active`; they
   see the world/library and can comment as themselves.
4. **Role wall:** the member attempts an asset edit and a user invite. **Success —** both 403; an
   admin doing the same succeeds.
5. **Stranger:** an un-invited Google account signs in. **Success —** they get the request-access
   wall and are served no corpus (no world, no library, no docs).
6. **No lockout:** the sole admin tries to remove themselves / drop to member. **Success —**
   refused with a clear reason.
7. **Remove:** an admin removes `dev@example.com`. **Success —** that account drops to the
   request-access wall on its next request; its comment history remains attributed.

## Open modeling calls (for the owner)

None blocking — ADR-0043 fixed the model. Inviting now also emails the invitee
([`invite-notify`](invite-notify.md)). Per-story or per-artifact roles, and self-serve "request
access" notifications to *admins* (the inbound direction — a stranger asking in), remain
deferred-but-named extensions.
