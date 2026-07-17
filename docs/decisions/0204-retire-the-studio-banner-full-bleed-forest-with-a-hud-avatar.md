---
status: accepted
decided: 2026-07-16
amends: [8]
arc: studio-hud-chrome-arc
---
# ADR-0204: Retire the studio banner: full-bleed forest with a HUD avatar on the verified identity

## Status

accepted (2026-07-16) — decided/directed by the owner in conversation on 2026-07-16. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0008 — the free-text single-operator identity field retires; attribution everywhere
comes from the verified identity the server already resolves. ADR-0008's comment substrate itself
stands.

## Context

The studio topbar carries Overview / Forest / Library nav links, the IAP identity chip, a free-text
"operator" field, and the desktop-only Credentials dock. Most of it is already redundant: ADR-0185
retired the standalone `#/library` page (the nav link is just a shortcut to the `?overlay=library`
lens over the forest), and the Overview page (`Home.tsx`) is a brochure plus three stats the owner
judged never useful. The forest map is the app — members should land on it and stay there. The
operator field is an ADR-0008 single-operator dogfood relic: on the hosted deployment the server
already stamps comment authors from the IAP-verified identity (the scoped path in
`apps/studio/server/apiRouter.ts`), so the client-declared name is redundant where it matters and
unverified where it doesn't.

## Decision

1. **The forest is the landing surface.** `#/` resolves to the tree view; the `home` route and
   `Home.tsx` (Overview, including its stats row) are retired without replacement. `#/doc/...`,
   `#/asset/...`, and `#/members` routes remain.
2. **The topbar is removed.** Global chrome becomes a floating HUD over the full-bleed app: a brand
   chip top-left (routes to the forest) and an avatar top-right — an initials circle derived from
   the verified identity, carrying the role. *(The brand chip is OVERTAKEN by
   [ADR-0205](0205-one-pathway-chrome-the-hud-sheds-the-brand-chip-and-lens-sho.md) §1, 2026-07-17:
   the chip RETIRES — the forest is the landing surface and a permanent "home" affordance to the
   place you already are is a second pathway to nowhere (`one-way-to-do-things`). The topbar-removal
   and the top-right avatar stand. Noted in place per ADR-0139.)*
3. **The avatar menu carries the rehomed functions:** the identity + role line, Library lens
   (overlay), Documents (the doc-corpus entry Overview/Sidebar used to provide), Members
   (admin-gated), Credentials (desktop-gated, behaviour unchanged), and Sign out (clears the IAP
   session on the hosted deployment; hidden where there is no IAP). *(The Library lens and Documents
   entries are OVERTAKEN by
   [ADR-0205](0205-one-pathway-chrome-the-hud-sheds-the-brand-chip-and-lens-sho.md) §2, 2026-07-17:
   both menu shortcuts RETIRE — the map's library drawer (ADR-0191) is the one pathway to the Library
   and the lens dive (ADR-0185) the one pathway into document bodies, so the duplicating menu entries
   fail the `one-way-to-do-things` bar; the menu becomes a pure account surface. The identity + role
   line, Members, Credentials, and Sign out stand. Noted in place per ADR-0139.)*
4. **The operator field retires** (the amends edge on ADR-0008): attribution everywhere comes from
   the verified identity — the IAP email on the hosted path, `STORYTREE_STUDIO_DEV_IDENTITY`
   locally, the conventional `operator` fallback only in the open dev posture. The localStorage
   `storytree.operator` key and `useOperator` go away.
5. **No new auth.** Google IAP (ADR-0042) remains the sign-on; the avatar *presents* that identity.
   An app-managed Google OAuth/SSO path (profile photos, non-IAP members, public hosting) is
   explicitly out of scope — a future ADR if non-IAP access is ever wanted. Until then the avatar is
   initials-only; `UserDoc` gains no photo field.
6. **The look is operator-attested** (ADR-0070 stage 2): geometry/behaviour land red→green through
   the gate; the owner signs the visual verdict on a staged, confirmed-working studio.

## Consequences

- The studio story's UAT journey changes (no banner nav, no operator-name step); the story prose and
  its Playwright shadow are updated with the increments that change the behaviour they describe.
- Deep links to `#/` land on the forest; the retired Overview stats are gone without replacement,
  per the owner.
- Local/offline (JSON-store) sessions show an honest identity fallback on the avatar instead of a
  free-text field.
- The document corpus keeps its routes but loses its Overview entry point; the avatar menu's
  Documents entry is the replacement door.

## References

- ADR-0042 (hosted studio behind direct IAP — unchanged sign-on), ADR-0185/0188/0191 (the library
  lens over the forest this completes), ADR-0008 (amended), ADR-0070 (stage-2 operator attestation),
  ADR-0110 (born-accepted ratification).
- Arc: `studio-hud-chrome-arc` (live store). Surface: `apps/studio/src/` (App.tsx, lib/route.ts,
  components/Home.tsx retired, the new HUD component).
