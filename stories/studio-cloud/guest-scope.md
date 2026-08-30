---
id: "guest-scope"
tier: capability
story: studio-cloud
title: "Every hosted request carries a verified identity; a caller comments as themselves and touches nothing else"
outcome: "In guarded mode every API request carries a verified identity; an admitted caller comments under their stamped identity and edits only their own comments; admins keep asset writes; db control is refused for everyone."
status: proposed
proof_mode: integration-test
depends_on: [serve-mode]
# ADOPTION BASIS (ADR-0465 D2/D4), declared spec-borne per ADR-0057. The four contracts are
# exercised today by `guestPolicy.test.ts` (the policy decisions, guarded and degraded) and
# `serveApi.integration.test.ts` over the REAL hosted server: identity-less /api/* is 401 on every
# route; "comment authorship is stamped from the verified identity — the client field is ignored";
# "a member edits their own comment but not another author's; an admin may touch any"; asset writes
# need the admin role and "db control is 403 for member AND admin".
# NO `real:` arm — the code and its tests already exist, so there is no red to observe (ADR-0465).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/server/guestPolicy.test.ts"
      - "apps/studio/server/serveApi.integration.test.ts"
    sourceGlobs:
      - "apps/studio/server/guestPolicy.ts"
      - "apps/studio/server/identity.ts"
---

# Every hosted request carries a verified identity; a caller comments as themselves and touches nothing else

**Outcome —** In guarded mode every API request carries a verified identity; an admitted caller
comments under their stamped identity and edits only their own comments; admins keep asset
writes; db control is refused for everyone.

> **Corrected in place 2026-08-31 (ADR-0043 overtook the premise, not the contracts).** This spec
> was authored under ADR-0042, where IAP's allowlist WAS the membership decision and anyone it let
> through was a "guest" who could read everything. ADR-0043 made IAP **authenticate-only**
> (`allAuthenticatedUsers`) and moved the authorization decision into the app's own users
> projection: a verified NON-member is now served nothing but `GET /api/me` — 403 + a
> `request-access` marker on the whole corpus. **That membership gate is
> [`app-authorization`](../studio-members/app-authorization.md)'s, not this capability's**, and it is
> the reason no wording here should still promise reading "everything".
>
> What this capability owns is UNCHANGED and still true, which is why this is a correction and not a
> supersede: the identity layer is fail-closed, comment authorship is stamped from the verified
> caller rather than the request body, a caller's write reach ends at their OWN comments, and
> `/api/db/*` is refused for everyone hosted. All four contracts below stand as written; only the
> word "guest" in the outcome named a population ADR-0043 retired. Read "guest" below as "a caller
> the app has already admitted".

## Guidance

- Identity (`server/identity.ts`): `x-goog-authenticated-user-email` (IAP strips and re-adds it
  at the edge — the value is `accounts.google.com:<email>`; take the email). A dev override env
  exists for trying guarded mode locally; it never applies when the real header is present.
- Policy (`server/guestPolicy.ts`), fail-closed: guarded mode + no identity → 401 for every
  `/api/*` (static stays open — the bundle is not a secret; probes hit the container directly).
  Guests: GET anything; `POST /api/comments` with author **stamped from identity** (client
  field ignored); PATCH/DELETE a comment only when its stored author equals the caller.
  Admins (`STORYTREE_STUDIO_ADMINS`, comma-separated, case-insensitive): plus asset writes,
  same comment stamping. `/api/db/*`: 403 for all in guarded mode — its premise is the
  operator's own machine (dbControl.ts header).
- The dev plugin runs with NO policy (open) — local behaviour is byte-identical to before.

## Contracts (4)

1. **`fail-closed-identity`** — no identity, no API
   - **asserts —** guarded mode refuses identity-less `/api/*` with 401; `vite dev` (no policy)
     never refuses.
2. **`author-is-the-verified-identity`** — comment authorship cannot be forged
   - **asserts —** a guest POST with `author: "someone-else"` persists with the caller's
     verified email.
3. **`own-comments-only`** — a guest's reach ends at their own comments
   - **asserts —** PATCH/DELETE on another author's comment → 403; on their own → applied.
4. **`admin-allowlist-gates-asset-writes`** — asset writes need the allowlist; db control has
   no hosted caller
   - **asserts —** guest POST/PATCH/DELETE `/api/assets` → 403; an allowlisted admin passes
     through; `/api/db/*` → 403 for guest AND admin in guarded mode.
