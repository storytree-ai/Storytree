---
id: "user-directory"
tier: capability
story: trusted-circle-users
title: "Users persist as events plus a role/status projection, last-admin protected"
outcome: "Users persist as append-only events plus a one-row-per-email projection with role + status, validated at the write boundary; the last admin can never be removed."
status: proposed
proof_mode: integration-test
depends_on: []
---

# Users persist as events plus a role/status projection, last-admin protected

**Outcome —** Users persist as append-only events plus a one-row-per-email projection with role +
status, validated at the write boundary; the last admin can never be removed.

## Guidance

- The house event+projection shape (mirror `pg-comment-store` / `presence-store`):
  `events.user_event` (append-only) + a `users` projection keyed by lowercased email.
- The doc (zod in `@storytree/core`): `{ email, role: 'admin'|'member', status:
  'invited'|'active', invitedBy, createdAt, lastSeenAt }`. Fail-closed on a blank email/role.
- Pure helpers like the presence module: `mergeUser` (upsert semantics, anchors email/createdAt),
  a `canRemove`/`canDowngrade` guard that refuses if it would leave zero admins.
- Bootstrap: a seed-admin list (env) is applied as active-admin rows on first sight; never lets the
  projection reach zero admins.

## Contracts (3)

1. **`event-sourced-projection`** — append events, project one row per email
   - **asserts —** two events for one email yield one projection row (latest wins); history is
     retained.
2. **`role-status-validated`** — only valid role/status docs persist
   - **asserts —** blank email, unknown role, or unknown status is refused at the write boundary.
3. **`last-admin-protected`** — the directory can never reach zero admins
   - **asserts —** removing or down-roling the only admin is refused; with two admins it succeeds.
