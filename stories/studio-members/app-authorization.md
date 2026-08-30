---
id: "app-authorization"
tier: capability
story: studio-members
title: "The app authorizes by user row and role; non-members are served nothing"
outcome: "Every API request resolves its verified email to a user row and enforces role; non-members are served nothing but a request-access signal."
status: proposed
proof_mode: integration-test
depends_on: [user-directory]
# ADOPTION BASIS (ADR-0465 D2/D4), declared spec-borne per ADR-0057. All three contracts are
# exercised today by the studio suite: `serveApi.integration.test.ts` drives the REAL hosted server
# over node:http and asserts membership-gates-the-corpus ("a stranger gets 403 + requestAccess on the
# whole corpus; only /api/me answers"), role-enforced ("a member reads, comments as self, but cannot
# write assets or reach user mgmt" / the seed admin writing assets) and identity-still-fail-closed
# ("refuses identity-less /api/* with 401 — every route, health and me included");
# `guestPolicy.test.ts` proves the same decisions at the policy layer, degraded and normal.
# NO `real:` arm — the code and its tests already exist, so there is no red to observe (ADR-0465).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/server/serveApi.integration.test.ts"
      - "apps/studio/server/guestPolicy.test.ts"
    sourceGlobs:
      - "apps/studio/server/guestPolicy.ts"
      - "apps/studio/server/identity.ts"
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
