---
id: "invite-notify"
tier: capability
story: studio-members
title: "Invitees are emailed the studio link when invited"
outcome: "Inviting a member emails them the studio link so they learn they have access; sending is best-effort and never blocks the invite, and the admin sees whether it went out."
status: proposed
proof_mode: integration-test
depends_on: [invite-ui]
---

# Invitees are emailed the studio link when invited

**Outcome —** Inviting a member emails them the studio link so they learn they have access; sending
is best-effort and never blocks the invite, and the admin sees whether it went out.

## Guidance

- The invite write stays authoritative (`invite-ui`'s `POST /api/users` `invited` row). Email is a
  follow-on side effect, NOT a precondition: `POST /api/users` always writes the row and returns
  201, then attaches `notify: { status: 'sent' | 'skipped' | 'failed', detail? }` reporting what the
  email did. A send failure is reported, never a 500.
- Owned, dependency-free SMTP-over-TLS (`apps/studio/server/inviteMailer.ts`) behind an
  `InviteMailer` seam — Gmail submission (implicit TLS :465, `AUTH LOGIN`). No nodemailer, so the
  offline gate stays green and the lockfile is untouched (the owned-loop ethos).
- Config-gated: enabled only when `STORYTREE_STUDIO_SMTP_USER` + `STORYTREE_STUDIO_SMTP_PASS`
  (a Google App Password) + `STORYTREE_STUDIO_PUBLIC_URL` are all set; otherwise a disabled mailer
  reports `skipped`. Local dev + an unconfigured deploy both degrade cleanly.
- The email is plain text: who invited them, their role, and the studio URL to sign in with the
  invited Google account. The `Members` panel surfaces the outcome as a notice line after invite.
- Secret handling: the app password lives in Secret Manager, injected as an env var; the deploy
  flags + setup live in `infra/studio-cloud.md` §4c.

## Story UAT (would-be)

1. Admin invites a member with email configured. **Success —** the invitee receives an email
   containing the studio URL; the panel shows "an invite email is on its way"; the `invited` row
   still exists.
2. Admin invites with email NOT configured. **Success —** the row is still written; the panel shows
   "email notifications are off — share the link manually"; no error.
3. The SMTP send fails (bad password / host down). **Success —** the invite still 201s with the row;
   the panel shows "the email didn't send (…) — share the link manually"; no 500.

## Contracts (2)

1. **`best-effort-notify`** — the email never blocks or breaks the invite
   - **asserts —** `POST /api/users` always writes the `invited` row and returns 201 with a `notify`
     field; an unconfigured mailer yields `skipped`; a send failure yields `failed`, never a 500.
2. **`configured-smtp-send`** — when configured, the invitee is emailed the studio link
   - **asserts —** the SMTP conversation authenticates (`AUTH LOGIN`) and delivers a message
     addressed to the invitee containing the studio URL (dot-stuffed, RFC-5321 terminated).
