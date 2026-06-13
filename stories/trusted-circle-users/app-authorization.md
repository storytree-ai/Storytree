---
id: "app-authorization"
tier: capability
story: trusted-circle-users
title: "The app authorizes by user row and role; non-members are served nothing"
outcome: "Every API request resolves its verified email to a user row and enforces role; non-members are served nothing but a request-access signal."
status: proposed
proof_mode: integration-test
depends_on: [user-directory]
---

# The app authorizes by user row and role; non-members are served nothing

**Outcome —** Every API request resolves its verified email to a user row and enforces role;
non-members are served nothing but a request-access signal.

## Guidance

- Evolve `guestPolicy` from a guest/admin function into a role lookup over the `user-directory`
  projection: resolve the IAP-verified email → row → decision. IAP is now authenticate-only
  (ADR-0043), so the email is present; absence still fail-closes to 401.
- Decisions: non-member → 403 with a `request-access` marker on every `/api/*` except a tiny
  `GET /api/me` (returns the caller's membership/role so the SPA can render the wall); member →
  GET + comment-as-self (ADR-0042 d.3 scope, preserved); admin → also users + asset writes +
  attestations. `/api/db/*` stays structurally off (ADR-0042).
- The corpus (tree/library/docs) is gated too — a non-member gets nothing, so widening IAP doesn't
  expose it.

## Contracts (3)

1. **`membership-gates-the-corpus`** — non-members are served no data
   - **asserts —** an authenticated non-member gets 403 + request-access on tree/library/docs/
     comments; only `GET /api/me` answers.
2. **`role-enforced`** — member vs admin reach differs
   - **asserts —** member: comment ok, asset write + user admin 403; admin: all ok.
3. **`identity-still-fail-closed`** — no verified email, no API
   - **asserts —** a request with no identity is 401 even though the corpus is otherwise gated by
     membership.
