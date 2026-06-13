---
id: "guest-scope"
tier: capability
story: studio-hosting
title: "Guests read everything, comment as themselves, and touch nothing else"
outcome: "In guarded mode every API request carries a verified identity; guests read everything, comment under their stamped identity, edit only their own comments; admins keep asset writes; db control is refused for everyone."
status: proposed
proof_mode: integration-test
depends_on: [serve-mode]
---

# Guests read everything, comment as themselves, and touch nothing else

**Outcome —** In guarded mode every API request carries a verified identity; guests read
everything, comment under their stamped identity, edit only their own comments; admins keep
asset writes; db control is refused for everyone.

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
