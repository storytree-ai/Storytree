---
id: "invite-ui"
tier: capability
story: studio-members
title: "Admins invite, re-role, and remove users from the studio"
outcome: "An admin invites, re-roles, and removes users from the studio; the invitee activates on first Google sign-in."
status: proposed
proof_mode: UAT
depends_on: [app-authorization]
# ADOPTION BASIS (ADR-0465 D2/D4), declared spec-borne per ADR-0057.
# `admin-only-user-management` — `serveApi.integration.test.ts` "refuses every /api/users verb for a
# member (403, no mutation)"; the panel side is `MembersPanel.test.tsx`, which drives the real invite
# and re-role controls against a doubled transport.
# `invite-then-activate` — the same suite's "an admin lists, invites, re-roles and removes; invite
# then activates on first request" and "the last admin cannot be removed or down-roled (409)".
# NO `real:` arm — the code and its tests already exist, so there is no red to observe (ADR-0465).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/server/serveApi.integration.test.ts"
      - "apps/studio/src/components/MembersPanel.test.tsx"
    sourceGlobs:
      - "apps/studio/server/apiRouter.ts"
      - "apps/studio/src/components/MembersPanel.tsx"
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
- UI: a "Members" admin panel (members list with role + status + invited-by, an invite box, role
  toggle, remove). Members never see it (the role check hides it and the API enforces).

## Acceptance walk (draft)

> **Corrected 2026-08-31 — this section used to be headed `## UAT Test Criteria (would-be)`, and that
> heading made the whole spec UNLOADABLE.** `parseUatTestCriteria`'s `STORY_UAT_HEADING` matches any
> `## UAT Test Criteria …` heading and then demands one `_(criterion-id: …)_` annotation per numbered
> item; this draft carried none, so `loadNodeSpec` threw `expected exactly one (criterion-id: ...)
> annotation, found 0` and `storytree tree studio-members` rendered the capability — and its
> dependency edges — as `(spec missing)`, silently, with no error anywhere. The canonical UAT tier is
> the STORY's (`stories/studio-members/story.md` carries the three annotated criteria); a capability
> never owns criteria of its own, so the fix is the heading, not a set of manufactured ids. The same
> defect and fix apply to [`invite-notify`](invite-notify.md).

1. Admin opens the Members panel and invites a member by email. **Success —** the row appears as
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
