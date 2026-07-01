---
id: "member-suggest-write-policy"
tier: capability
story: library-review
title: "A member may comment and suggest; only owner/admin accept/reject and hard-edit"
outcome: "The studio's authorization policy lets a member POST comments AND suggestions (additive proposals) but refuses the suggestion accept/reject decision and the hard asset edit (403); an owner/admin may do all four. The member-suggest scope is a new allowed write in guestPolicy, resolved off the SAME resolveAccess role the policy already reads."
status: proposed
proof_mode: integration-test
depends_on: [suggestion-edit-store]
# Node-borne proof config (ADR-0057 keystone). EDITS-EXISTING (R1, editsExisting): guestPolicy.ts
# ALREADY decides which writes a member vs admin may make (createMembersPolicy.gate ~:95-126) and
# already has a passing vitest suite (apps/studio/server/guestPolicy.test.ts). The leaf ADDS the
# suggestion-write allowances + the accept/reject + hard-edit refusals to the EXISTING gate and writes
# the new assertions into the EXISTING guestPolicy.test.ts. The RED the spine observes is a NEW
# assertion that a member POST to the suggestion-create path is PERMITTED while a member POST to the
# accept/reject path is REFUSED (403) — failing at HEAD because the gate's `adminOnly` rule currently
# 403s every non-comment, non-write-broker POST (so a member suggestion-create is wrongly refused, and
# there is no accept/reject path to gate). A value/behaviour red, not module-not-found.
#
# CRITICAL — apps/studio is VITEST (guestPolicy.test.ts is `describe/it/expect`), NOT node:test. The
# default `node --test` real proof cannot run it, so this cap declares a `real.proofCommand` running the
# ONE file under vitest (cwd = apps/studio). install: true + a typecheck wall (the gate imports the
# studio server types + resolveAccess from @storytree/studio-members).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/**/*.test.ts"]
    sourceGlobs: ["apps/studio/server/**/*.ts"]
  real:
    editsExisting: true
    testFile: "apps/studio/server/guestPolicy.test.ts"
    sourceFile: "apps/studio/server/guestPolicy.ts"
    scope:
      testGlobs: ["apps/studio/server/guestPolicy.test.ts"]
      sourceGlobs: ["apps/studio/server/guestPolicy.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # apps/studio is vitest (environment node), NOT node:test. Run the ONE test file under vitest.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "server/guestPolicy.test.ts"
---

# A member may comment and suggest; only owner/admin accept/reject and hard-edit

**Outcome —** The studio's authorization policy lets a member POST comments AND suggestions (additive
proposals) but refuses the suggestion accept/reject decision and the hard asset edit (403); an
owner/admin may do all four. The member-suggest scope is a new allowed write in `guestPolicy`, resolved
off the SAME `resolveAccess` role the policy already reads.

**Depends on —** [`suggestion-edit-store`](suggestion-edit-store.md) — the policy gates the suggestion
WRITE that store persists (and the accept/reject decision the route drives); it couples to the
suggestion surface's route paths.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. Today `guestPolicy.ts`
> (`createMembersPolicy.gate`, `apps/studio/server/guestPolicy.ts:95-126`) lets a member POST only
> comments (and a builder/admin the write-broker); every other non-GET POST is admin-only. There is a
> passing vitest suite (`guestPolicy.test.ts`) that pins the wake-authorization + member/admin scope.
> This capability EXTENDS that gate: a member may also POST a suggestion (create), but the accept/reject
> decision and the hard asset edit stay admin-only.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: it is a cohesive evolution of ONE module's authorization rule
— the member/admin write scope — proven by integration over the real `createMembersPolicy.gate` against
resolved accesses of mixed roles (a member, an admin), not a single isolated assertion. It is the
ROLE-WALL half of the suggestions model; the transition behaviour it guards is `accept-reject-suggestion-api`
(cap 3), and the record it gates the write to is `suggestion-edit-store` (cap 2).

NO NEW ROLE — the existing two suffice (the journey-principle, not a fork). Members comment + suggest;
owner/admin accept/reject + hard-edit. This rides `studio-members`' EXISTING `resolveAccess`
(`admin ⊇ member`, with `builder` in between for the broker) — it does NOT add a role (contrast
`studio-members`' `builder-role`, which DID). The policy reads `access.role` exactly as it does today;
this cap only changes WHICH paths a member may POST to.

THE GATE CHANGE (the model — ADR-0140). In `createMembersPolicy.gate`:
- **Member MAY POST a suggestion-create** (the new allowed write) — like a comment, a suggestion is an
  additive proposal a member authors. So the suggestion-create path joins `/api/comments` as a
  member-permitted POST (not caught by the `adminOnly` "non-comment write" rule).
- **Member MAY NOT accept/reject** — the suggestion-decision path (cap 3's route) is admin-only; a
  member POST there is 403 (member scope — deciding a suggestion is an owner/admin act).
- **Member MAY NOT hard-edit** — the asset-write path stays admin-only exactly as today (a member's
  only route to changing a doc is a SUGGESTION, never a direct `updateAsset`).
- **Owner/admin MAY do all four** — comment, suggest, accept/reject, hard-edit (admin ⊇ member).

This is the studio's authorization seam (the ADR-0043 / ADR-0117 `guestPolicy` lineage), evolved once
more — the same shape `builder-role` + the write-broker exception already use (a specific path
permitted for a specific role, the rest admin-only-by-method).

OFFLINE-TESTABLE BY THE PURE GATE (the `guestPolicy.test.ts` discipline). Every assertion runs over
`createMembersPolicy(identity, access).gate(method, path)` with hand-built `ResolvedAccess` values (a
member, an admin) — no store, no http, no IAP — asserting which `(method, path)` the gate permits vs
throws `HttpError(403)`. The same pure layer `guestPolicy.test.ts:1-9` already pins for wake-auth +
member/admin scope.

## Integration test

**Goal —** Prove that the policy gate permits a member's comment AND suggestion-create writes while
refusing a member's accept/reject decision and hard asset edit (403), and permits all four for an
admin — over the pure gate, no http.

The integration test exercises this capability against its **real in-story collaborator** — the real
`createMembersPolicy.gate` resolving the real `resolveAccess` role over hand-built accesses, no stubs.
It would:

1. Build a MEMBER access. Assert `gate('POST', '/api/comments')` permits (unchanged), and
   `gate('POST', <suggestion-create-path>)` PERMITS (the new allowance).
2. Same member: assert `gate('POST', <suggestion-decision-path>)` THROWS `HttpError(403)` (deciding is
   admin-only), and `gate('PATCH'|'POST', '/api/assets')` (the hard edit) THROWS 403 (unchanged) — a
   member's only path to a doc change is a suggestion.
3. Build an ADMIN access. Assert all four permit: `gate` on comment-create, suggestion-create,
   suggestion-decision, and the asset write all return without throwing (admin ⊇ member).
4. Identity-less caller: `gate(anything)` THROWS 401 (the IAP fail-closed, unchanged) — the new paths
   do not widen the identity wall.
5. A non-member (resolved access `null`): every path but `/api/me` 403s with `requestAccess` (unchanged)
   — the new suggestion paths are inside the membership wall, not a leak.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest,
`apps/studio/server/guestPolicy.test.ts`), pure gate over hand-built accesses. The wake-auth + existing
scope tests already pass; these are the NEW assertions this cap adds. Per ADR-0122 each contract id
leads a distinctly-named test so `storytree coverage member-suggest-write-policy` reports 4/4.

1. **`msp-member-may-create-a-suggestion`** — a member POST to the suggestion-create path is permitted
   - **asserts —** `createMembersPolicy(member, memberAccess).gate('POST', <suggestion-create-path>)`
     returns without throwing, exactly as `'POST', '/api/comments'` does — a suggestion is a
     member-authored additive proposal.
   - **covers —** `apps/studio/server/guestPolicy.ts` (`createMembersPolicy.gate`, the member-suggest allowance) *(provisional path)*
2. **`msp-member-cannot-decide-a-suggestion`** — a member POST to accept/reject is refused
   - **asserts —** the same member's `gate('POST', <suggestion-decision-path>)` throws
     `HttpError(403)` — deciding (accept/reject) is an owner/admin act.
   - **covers —** `apps/studio/server/guestPolicy.ts` (`createMembersPolicy.gate`, the decision admin-wall) *(provisional path)*
3. **`msp-member-cannot-hard-edit`** — a member POST/PATCH to the asset-write path is refused
   - **asserts —** the member's `gate` on the hard asset edit (`/api/assets` non-GET) throws
     `HttpError(403)` (unchanged) — a member's only route to changing a doc is a suggestion, never a
     direct write.
   - **covers —** `apps/studio/server/guestPolicy.ts` (`createMembersPolicy.gate`, the asset admin-wall preserved) *(provisional path)*
4. **`msp-admin-may-do-all-four`** — an admin may comment, suggest, decide, and hard-edit
   - **asserts —** an admin access's `gate` permits comment-create, suggestion-create,
     suggestion-decision, AND the asset write (admin ⊇ member); the identity-less 401 + non-member 403
     walls are unchanged by the new paths.
   - **covers —** `apps/studio/server/guestPolicy.ts` (`createMembersPolicy.gate`, the admin scope) *(provisional path)*

## Guidance — the slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, EDITS-EXISTING): extend the gate in place, test-first.

- **The edited test —** `apps/studio/server/guestPolicy.test.ts` (vitest, `describe/it/expect`,
  environment node — the studio server convention). Add the assertions above using the existing
  `gateError` helper + hand-built `ResolvedAccess` values. Name each test for its contract id (`msp-…`)
  so `storytree coverage` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the new assertions fail against HEAD: a member
  POST to the suggestion-create path is currently 403 (caught by the `adminOnly` non-comment-write
  rule), so `msp-member-may-create-a-suggestion` fails; and there is no suggestion-decision path to
  refuse. A value/behaviour red, not module-not-found.
- **The GREEN —** in `apps/studio/server/guestPolicy.ts` `createMembersPolicy.gate`: add the
  suggestion-create path to the member-permitted writes (alongside `/api/comments`), keep the
  suggestion-decision + asset-write paths admin-only, and leave the 401 / non-member 403 walls intact.
  After it, the assertions hold and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay
  green.

Rules:

- **No new role** — members + admins suffice; ride the existing `resolveAccess` (`admin ⊇ member`). Do
  NOT add a role for this (the journey-principle: this is a scope change, not a new population).
- **A member's only doc-change route is a suggestion** — the hard asset edit stays admin-only; a member
  proposes, an admin decides + applies.
- **Decide is admin-only** — the accept/reject path is gated here BEFORE cap 3's handler runs; cap 3
  assumes an authorized caller.
- **Pure gate proof** — assert permits/throws over hand-built accesses (offline); do not stand up an
  http server or IAP for this cap's net-new.
