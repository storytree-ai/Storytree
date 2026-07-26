---
id: "studio-members"
tier: story
title: "Studio members — real accounts, roles, and invitations from the UI"
outcome: "An admin invites someone by email from the studio; they sign in with Google and become a tracked user with a role; the API enforces what each role may do, and non-members see nothing but a request-access wall."
status: proposed
proof_mode: UAT
capabilities: [user-directory, app-authorization, invite-ui, invite-notify, builder-role]
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
decisions: [43, 100, 117]
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

## The builder role (ADR-0117)

[ADR-0117](../../docs/decisions/0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md)
adds a **third role, `builder`**, so a trusted co-builder may contribute brokered builds/writes to the
shared forest as an in-app grant (no per-friend Cloud SQL IAM grant). A `builder` reads + comments like a
`member` **plus** holds the brokered-write scope, is resolved by the same `resolveAccess`, and holds **no
DB identity**; `admin ⊇ builder ⊇ member`, and the last-admin no-lockout guard counts admins only (a
builder never changes the admin floor). The role lives here ([`builder-role`](builder-role.md)); the
write-broker ENDPOINT that consumes the scope is a `studio-cloud` capability
([`write-broker`](../studio-cloud/write-broker.md)), CONSUMED BY the desktop's brokered forest writes
([`shared-forest-connection`](../desktop/shared-forest-connection.md)). ADR-0117 d.2 says the Members
panel marks a `builder` exactly as it does an admin or member (ADR-0043 in-UI invitation) — that grant
path is **NOT YET BUILT** at either layer, so UAT leg 8 below is currently unwalkable; see the recorded
gap under Open modeling calls.

## Capabilities (5)

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`user-directory`](user-directory.md) | Users persist as append-only events plus a one-row-per-email projection with role + status, validated at the write boundary; the last admin can never be removed. | proposed | — |
| 2 | [`app-authorization`](app-authorization.md) | Every API request resolves its verified email to a user row and enforces role; non-members are served nothing but a request-access signal. | proposed | `user-directory` |
| 3 | [`invite-ui`](invite-ui.md) | An admin invites, re-roles, and removes users from the studio; the invitee activates on first Google sign-in. | proposed | `app-authorization` |
| 4 | [`invite-notify`](invite-notify.md) | Inviting emails the invitee the studio link (best-effort, config-gated) so they learn they have access; the admin sees whether it sent. | proposed | `invite-ui` |
| 5 | [`builder-role`](builder-role.md) | A third role — `builder` — a member who may POST brokered builds/writes, resolved by the same access compute, holding no DB identity; `admin ⊇ builder ⊇ member`, last-admin guard unaffected. | proposed | `user-directory` |

## UAT Test Criteria

1. **Bootstrap admin:** _(witness: machine)_ _(proof-gate: studio-members#gate-1)_ the seeded admin
   reaches `/api/me` with its verified identity header. **Success —** the response resolves an active
   admin and the seed is persisted as an active admin user row.
2. **Invite:** _(witness: machine)_ _(proof-gate: studio-members#gate-1)_ the admin POSTs
   `dev@example.com` as a member through the shared `/api/users` route the Members panel calls.
   **Success —** the response and user projection contain an `invited` member row; this in-app route
   crosses no gcloud or IAM boundary.
3. **Activate:** _(witness: machine)_ _(proof-gate: studio-members#gate-1)_ the invited email reaches
   `/api/me` with its verified identity header. **Success —** its row is persisted `active`; the
   resolved member can read corpus APIs, and a resolved member's comment write is stamped from the
   verified identity rather than from the client-supplied author field.
4. **Role wall:** _(witness: machine)_ _(proof-gate: studio-members#gate-1)_ a resolved member POSTs
   an asset edit and a user invitation through their API routes. **Success —** both are 403, and the
   refused asset write leaves no asset mutation; the corresponding admin requests succeed.
5. **Stranger:** _(witness: machine)_ _(proof-gate: studio-members#gate-1)_ an uninvited verified
   identity requests `/api/me` and each corpus API. **Success —** `/api/me` reports `member: false`,
   corpus requests return 403 with `requestAccess`, and the frontend load-state projects that result
   to the request-access wall.
6. **No lockout:** _(witness: machine)_ _(proof-gate: studio-members#gate-1)_ the sole admin tries to
   DELETE themselves or PATCH their role to member through `/api/users`. **Success —** both return
   409 and the guarded user mutation does not occur.
7. **Remove:** _(witness: machine)_ _(proof-gate: studio-members#gate-1)_ an admin DELETEs
   `dev@example.com` through `/api/users`. **Success —** the next `/api/me` resolves that identity as
   `member: false`. Comment history staying attributed is STRUCTURAL, not asserted by this leg's
   proof command: the users handler is handed only the user-store methods, so removal has no
   comment-mutating call to make, and authorship was stamped from the verified identity back at
   comment creation (asserted separately, leg 3).
8. **Mark a builder (ADR-0117):** _(witness: machine)(detail: studio-members#uat-8)_ an admin grants
   `friend@example.com` the **builder** role through the same in-app `/api/users` route the Members
   panel calls — no gcloud, no Cloud SQL IAM grant. **Success —** the grant is accepted and the user
   projection holds a `builder` row for that email; that identity then reads and comments with the
   member scope, and satisfies the brokered-write predicate the
   [`write-broker`](../studio-cloud/write-broker.md) gate reads. The role-resolution half of that
   predicate is already proven by [`builder-role`](builder-role.md)'s contracts and is REFERENCED
   here, never restated as a separate success condition. Every clause above compiles — row state,
   permission outcomes, scope resolution — so this leg is `machine`; it is deliberately left with no
   proof binding because the in-app grant it names does not yet exist. See the recorded gap under
   Open modeling calls.

## Reliability Gates

1. **The membership API and domain seams are green** _(gate: observe)_
   `pnpm --filter @storytree/studio-members --filter studio test`. The studio integration suite drives
   verified identity headers through bootstrap and activation, and drives the same `/api/users` route
   the Members panel calls through invitation, role enforcement, last-admin refusal, and removal. It
   also asserts stranger denial across the corpus APIs, member corpus reach, verified comment-author
   stamping, and post-removal nonmembership. The `@storytree/studio-members` suite proves the schema,
   access compute, event/projection store seam, last-admin guard, and builder-scope core. The
   last-admin refusal is proven twice over — the real `PgUserStore` refuses and ROLLS BACK with no
   write or delete, and the server maps that refusal to a 409 — so leg 6's no-mutation clause is
   asserted at the store, not merely implied by the status code.
   Two limits, stated so a green run is not over-read. The removal test does not re-read an earlier
   comment after deletion; comment history staying attributed is STRUCTURAL — the users handler is
   handed only the user-store methods, a narrowing the typecheck enforces and this command does not.
   And this offline command drives no Members-panel UI, no live Google/IAP exchange, no real invite
   email (the suite injects no mailer, so every invite reports its notification skipped), and no
   Cloud SQL. Leg 8 is deliberately NOT bound to this gate: the command exercises no in-app `builder`
   grant, and binding it here would let a passing run read as proof of a path that does not exist.

## Open modeling calls (for the owner)

**A. Two signed human attestations sit beneath legs now tagged `machine` (owner call — do not
self-resolve).** `studio-members#uat-2` and `studio-members#uat-3` each carry a signed
`outcome: pass`, `witness: human` attestation from 2026-06-14 recording a LIVE walk: an invite sent
from the Members UI that actually delivered an email, and a Google sign-in from that invite link
reaching the studio. The ids are stable, but the success conditions underneath them were REPLACED in
place on 2026-07-25 (commit `19739937`, "resolve remaining adopted UAT witnesses"): what were
aspirational legs reading *"invites … from the UI"* and *"the invitee signs in with Google"* became
the offline, header-stubbed API walk they state today, tagged `machine`. So the operator's signature
now keys to a success condition he never witnessed, while what he DID witness — the panel affordance,
real SMTP delivery, a real IAP/Google exchange — is asserted by no leg in this story and is explicitly
outside the proof command's reach. Note the signed evidence is BROADER than the current text, not
narrower: it covers [`invite-notify`](invite-notify.md) delivery, which the suite skips. This pass
deliberately left legs 2 and 3 untouched — no re-tag, no re-binding, no renumber (positional ids are
what the signatures key off). The owner decides whether to accept the machine legs and treat the two
signatures as history of a superseded condition, or to restore a live-journey leg — noting that an
appended leg takes a NEW id, so the existing signatures would not follow it.

**B. Leg 8's in-app `builder` grant does not exist yet (recorded gap, no gate minted).** ADR-0117 d.2
decided the Members panel marks a `builder` exactly as it does an admin or member. Neither layer
implements it: the panel's invite select offers only `member` and `admin` and its row action is a
binary admin/member toggle, and beneath it the `/api/users` role validator admits only `admin` or
`member`, so a `builder` grant is a 400. A `builder` row can therefore only arrive by a direct store
write — the very out-of-band path ADR-0117 existed to remove. Leg 8 is consequently CURRENTLY
UNWALKABLE by human or machine, and it is left with no proof binding rather than pointed at a gate
that would pass without exercising it. Its basis is a BUILD gap, not a judgment gap: it dissolves the
moment the validator and the panel admit the role and an assertion is written. What ADR-0117 also
names as operator-attested — the look of that panel affordance, and the end-to-end "invite a builder
→ their local build blooms in the shared forest" walk — is not this leg: the first has no subject
until the affordance is built (ADR-0070 stage 2 applies then, via the frontend two-stage flow), and
the second is the desktop's cross-machine journey
([`shared-forest-connection`](../desktop/shared-forest-connection.md)), not a membership condition.
Note for a follow-up pass: [`builder-role`](builder-role.md)'s Guidance and proof-status note still
describe leg 8 as operator-attested, which this re-adjudication supersedes.

**C. Settled, not open.** ADR-0043 fixed the base model and
[ADR-0117](../../docs/decisions/0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md)
added the `builder` role (a settled owner-directed decision, born accepted per ADR-0110 — not
re-litigated). Inviting also emails the invitee ([`invite-notify`](invite-notify.md)). Per-story or
per-artifact roles, and self-serve "request access" notifications to *admins* (the inbound direction — a
stranger asking in), remain deferred-but-named extensions.
