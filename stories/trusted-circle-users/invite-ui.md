---
id: "invite-ui"
tier: capability
story: trusted-circle-users
title: "Admins invite, re-role, and remove users from the studio"
outcome: "An admin invites, re-roles, and removes users from the studio; the invitee activates on first Google sign-in."
status: proposed
proof_mode: UAT
depends_on: [app-authorization]
---

# Admins invite, re-role, and remove users from the studio

**Outcome —** An admin invites, re-roles, and removes users from the studio; the invitee activates
on first Google sign-in.

## Guidance

- Admin-only API: `GET /api/users` (list), `POST /api/users` (invite {email, role} → `invited`
  row), `PATCH /api/users` (re-role), `DELETE /api/users` (remove) — all behind the admin role
  check, all respecting the last-admin guard.
- Activation is implicit: a `GET /api/me`/any request from an `invited` email flips it to `active`
  + stamps `lastSeenAt` (the upsert in `user-directory`).
- UI: a "Circle" admin panel (members list with role + status + invited-by, an invite box, role
  toggle, remove). Members never see it (the role check hides it and the API enforces).

## Story UAT (would-be)

1. Admin opens the Circle panel and invites a member by email. **Success —** the row appears as
   invited; an audit event exists.
2. The invitee signs in. **Success —** status flips to active; they can use the studio.
3. Admin re-roles them to admin, then back. **Success —** enforced on their next request.
4. Admin removes them. **Success —** they hit the request-access wall next request; history kept.

## Contracts (2)

1. **`admin-only-user-management`** — only admins reach the user APIs/panel
   - **asserts —** member calls to the user APIs 403; the panel is hidden for members.
2. **`invite-then-activate`** — an invite row activates on first sign-in
   - **asserts —** POST creates an `invited` row; a request from that email flips it `active`
     (and the last-admin guard still holds on remove/downgrade).
