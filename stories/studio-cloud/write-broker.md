---
id: "write-broker"
tier: capability
story: studio-cloud
title: "A members-gated write-broker persists a builder's locally-signed verdict / presence — validating shape and attribution, never re-signing"
outcome: "The hosted studio exposes a members-gated POST endpoint that persists a builder's already-signed verdict / presence declaration through the existing store write path — validating SHAPE (zod) and ATTRIBUTION (the signer/session is the authenticated builder), refusing a non-builder (403) and a forged-attribution or malformed body — holding no signing key and never re-signing."
status: proposed
proof_mode: integration-test
depends_on: [guest-scope]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors an
# integration test that imports a NOT-YET-EXISTING symbol from a NEW source file under apps/studio/server
# (red = module-not-found against the source that does not exist at HEAD), then writes that one new source
# file (green). The new module is the broker handler — a node:http handler that validates the proof-protocol
# `Verdict` / notice-board `PresenceDeclarationDoc` SHAPE, enforces the ATTRIBUTION wall (the verdict's
# `signer` / the presence's `sessionId` must match the authenticated builder), gates on a builder-or-admin
# resolved role, and persists via an INJECTED store-write seam (the same LibraryBackend.signUatVerdict /
# presence upsert the studio already owns). The handler is offline-testable by injection: a stub write
# seam records what it persisted; no live DB, no IAP. install: true + a typecheck wall because the handler
# imports @storytree/proof-protocol (`Verdict`) + @storytree/notice-board (`PresenceDeclaration`) + studio-
# members (`resolveAccess`/the builder predicate) across package boundaries (the proof runs in a fresh
# worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). The studio package's test runner is
# VITEST (`pnpm --filter studio test` → `vitest run`), NOT node:test — so the test imports `{ describe, it,
# expect } from 'vitest'` and the `real.proofCommand` below runs vitest on the single file (the default
# node:test single-file proof would pass under `node --test` but the studio regression — vitest — cannot
# load a node:test file, "No test suite found"; both the proof AND the package suite must agree on vitest).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/**/*.test.ts"]
    sourceGlobs: ["apps/studio/server/**/*.ts"]
  real:
    testFile: "apps/studio/server/writeBroker.test.ts"
    sourceFile: "apps/studio/server/writeBroker.ts"
    scope:
      testGlobs: ["apps/studio/server/writeBroker.test.ts"]
      sourceGlobs: ["apps/studio/server/writeBroker.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "studio", "exec", "vitest", "run", "server/writeBroker.test.ts"]
---

# A members-gated write-broker persists a builder's locally-signed verdict / presence

**Outcome —** The hosted studio exposes a **members-gated POST endpoint** that persists a builder's
**already-signed** verdict / presence declaration through the existing store write path — validating
**SHAPE** (the proof-protocol `Verdict` / notice-board `PresenceDeclarationDoc` zod shapes) and
**ATTRIBUTION** (the verdict's `signer` / the presence's `sessionId` must be the authenticated builder),
refusing a non-builder (**403**) and a forged-attribution or malformed body (**400**) — holding **no
signing key** and **never re-signing** (ADR-0091).

**Depends on —** [`guest-scope`](guest-scope.md) — the broker is a route on the SAME `/api/*` table the
served studio gates through `createMembersPolicy`/`resolveMembersAccess`; it extends that policy gate
with the `builder`-scoped exception and rides the same identity (`server/identity.ts`) and store seam.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. The collaborators are real
> and shipped: the studio's one route table (`apps/studio/server/apiRouter.ts`), the policy gate
> (`apps/studio/server/guestPolicy.ts` — `createMembersPolicy`, where any `POST` that is not
> `/api/comments` is admin-only today), the persistence seam (`apps/studio/server/libraryBackend.ts` —
> `signUatVerdict(verdict, actor)` appends a signed verdict to `events.verdict` via `PgWorkStore`;
> presence upserts via `PgPresenceStore`), and the IAP identity (`server/identity.ts`). The EXISTING
> pattern to mirror is `POST /api/uat/attest` (`handleUatAttest` in `apiRouter.ts`): it stamps the signer
> from the verified caller, refuses a client-supplied signer, validates, and persists — EXCEPT the broker
> persists a HANDED-IN, locally-signed verdict (it never builds/signs one).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the BROKERED WRITE AS A WHOLE — an
authenticated builder POSTs a locally-signed verdict (or a presence declaration), the endpoint validates
shape AND attribution AND the builder scope, then persists through the store seam; a non-builder, a
malformed body, or a mismatched signer is refused BEFORE any write. That spans the gate + the validators
+ the store seam, so it is an integration test over the real shapes + an injected store-write double, not
a single isolated assertion. It carries the most contracts in ADR-0117 because each refusal wall is a
distinct red→green obligation a leaf must pin (the "leaf drops the trickiest contract" risk is real here).

THIS IS THE INVERSE OF `/api/uat/attest` ON THE VERDICT SIDE (the key distinction, ADR-0117 d.3): the
operator-attest endpoint *signs* a NEW `operator-attested` verdict (it builds the `Verdict`, stamping the
signer). The broker *persists* the build spine's OWN local signature — it takes a fully-formed `Verdict`
as input and writes it unchanged. The broker therefore holds **no signing key** and **never re-signs**
(ADR-0091's gate-runs-then-signs integrity: the local gate already signed; the broker is a *persisting*
endpoint, not a *signing* one). It deliberately is the one input shape `/api/build` forbids — but it is
SAFE because of the attribution wall below, not because it re-derives the verdict.

THE ATTRIBUTION WALL (ADR-0117 d.3 — you cannot POST a write attributed to someone else): the endpoint
reads the authenticated builder identity from the IAP-verified caller (the SAME `policy.me.email` source
`handleUatAttest` uses — NEVER a client-supplied field). It then refuses unless:
- for a verdict — `verdict.signer` equals the authenticated builder (a builder cannot persist a verdict
  attributed to another signer);
- for presence — the declaration's session is attributable to the authenticated builder (`sessionId` is
  the worktree key; the broker binds the persisted session to the verified caller, never to a
  client-claimed identity).
A mismatch is a refusal (403/400), not a silent re-stamp. (Re-stamping would let a builder launder a
write under their own name while claiming another's; refusing is the honest wall.)

THE SHAPE WALL (ADR-0117 d.3): the body is `Verdict.safeParse` (proof-protocol — a `.strict()` zod
object: unknown fields rejected) for the verdict path, and `PresenceDeclaration.safeParse` (notice-board —
also `.strict()`) for the presence path. A malformed body (missing `unitId`/`signer`/`outcome`, an extra
field, a bad enum) is a clean 400 BEFORE any store call — never a 500, never a partial write.

THE AUTHORIZATION GATE (ADR-0117 d.2 — `builder`-or-`admin` scope required): the broker path is the
`builder`-scoped exception to `createMembersPolicy`'s "POST-that-isn't-a-comment is admin-only" rule. The
gate resolves the caller's role via the SAME `resolveAccess`/`resolveMembersAccess` the rest of the studio
uses; a `member` (or non-member) POSTing to the broker is **403** (the `builder-role` capability supplies
the resolvable role + scope predicate). An `admin` may also POST (`admin ⊇ builder`).

THE SERVER IS THE SINGLE DB AUTHORITY (ADR-0117 d.1/d.4): the broker persists under the studio's ONE
service-account DB identity via the existing store write path (`signUatVerdict` for the verdict;
`PgPresenceStore` upsert for presence). The builder holds no DB identity and opens no DB connection — the
brokered bytes enter the forest through this validated HTTP endpoint, not a raw socket.

OFFLINE-TESTABLE BY INJECTION: the handler takes the store-write seam (a `Pick<LibraryBackend,
'signUatVerdict' | …presence-upsert…>`) and the resolved access as injected inputs. The integration test
drives it with the real `Verdict`/`PresenceDeclaration` shapes, a stub write seam that records what it
persisted, and a resolved-access double (builder / member / non-member). No live DB, no IAP, no socket.
Production wires the real `PgBackend` + the real `resolveMembersAccess`, the same shapes `handleUatAttest`
already wires.

## Integration test

**Goal —** Prove that an authenticated builder's well-formed, correctly-attributed verdict (and presence
declaration) is persisted UNCHANGED through the injected store seam, while a non-builder (403), a
malformed body (400), and a mismatched-signer body (refused, not re-stamped) are all rejected before any
write — the handler never signing, never re-stamping, never a 500.

The integration test exercises this capability against its **real in-story collaborators** — the real
proof-protocol `Verdict` + notice-board `PresenceDeclaration` shapes and the real builder-scope predicate
(from `builder-role`) — with the store-write seam injected as a recording stub (no live DB). No stubs
within the studio server's own composition.

The integration test would:

1. Authenticated **builder** POSTs a well-formed `Verdict` whose `signer` equals the builder's verified
   email → the handler persists it UNCHANGED via the injected `signUatVerdict` (asserting the exact
   verdict bytes reached the seam — not a re-signed/re-stamped copy), and answers a success envelope.
2. Authenticated **member** (not a builder) POSTs the same well-formed body → **403** (the builder-scope
   gate), and the store seam is NEVER called.
3. Authenticated builder POSTs a **malformed** verdict (missing `signer`, or an extra strict-mode field,
   or a bad `outcome` enum) → **400** from `Verdict.safeParse`, the store seam NEVER called, never a 500.
4. Authenticated builder POSTs a well-formed verdict whose `signer` is **someone else's** email → refused
   (the attribution wall — 403/400), NOT silently re-stamped to the caller, the store seam NEVER called.
5. **Presence mirrors the verdict path:** an authenticated builder POSTs a well-formed
   `PresenceDeclaration` attributable to them → persisted via the injected presence-upsert seam (bound to
   the verified caller); a member → 403; a malformed declaration → 400; a presence attributed to another
   session/identity → refused, never re-bound silently.
6. No identity at all (the IAP edge bypassed) → **401**, consistent with the rest of the gated `/api/*`.

## Contracts (5)

The test-proven leaf behaviours — each one isolated automated test (`vitest`, the `studio` suite),
collaborators stubbed. None exist yet; each is the assertion a contract test WILL prove against the real
broker handler once authored (provisional path — re-cite at real `file:line` when built). Author EACH —
the refusal walls are the under-cover risk; a green that proves only the happy path is incomplete.

1. **`broker-persists-a-valid-builder-verdict-unchanged`** — the happy path writes the handed-in signature
   - **asserts —** an authenticated builder POSTing a well-formed `Verdict` whose `signer` is their
     verified email persists it UNCHANGED through the injected store-write seam (the exact verdict bytes,
     not a re-signed/re-stamped copy — the broker holds no signing key, ADR-0091), returning a success
     envelope.
   - **covers —** `apps/studio/server/writeBroker.ts` (the persist path) *(provisional)*
2. **`broker-shape-wall-refuses-a-malformed-body`** — a bad body is a 400 before any write
   - **asserts —** a malformed verdict (missing `unitId`/`signer`/`outcome`, an extra strict-mode field,
     a bad enum) fails `Verdict.safeParse` → **400**, the store seam is NEVER called, and it is never a
     500. (Presence: a malformed `PresenceDeclaration` → 400 the same way.)
   - **covers —** `apps/studio/server/writeBroker.ts` (the shape validation)
3. **`broker-attribution-wall-refuses-a-mismatched-signer`** — you cannot POST a write attributed to someone else
   - **asserts —** an authenticated builder POSTing a well-formed verdict whose `signer` is a DIFFERENT
     identity is refused (403/400), NOT silently re-stamped to the caller, the store seam NEVER called.
     (Presence: a declaration attributed to another session/identity → refused, never silently re-bound.)
   - **covers —** `apps/studio/server/writeBroker.ts` (the attribution check)
4. **`broker-scope-gate-403s-a-non-builder`** — only a builder (or admin) may broker a write
   - **asserts —** an authenticated `member` (and a non-member) POSTing a well-formed, correctly-attributed
     body is **403** (the builder-scope exception to the admin-only POST rule); an `admin` passes
     (`admin ⊇ builder`); an identity-less request is **401**. The store seam is NEVER called on a refusal.
   - **covers —** `apps/studio/server/writeBroker.ts` (the authorization gate) + the `builder-role` scope
5. **`broker-presence-path-mirrors-the-verdict-path`** — presence is brokered with the same three walls
   - **asserts —** a presence POST is gated, shape-validated (`PresenceDeclaration`), attribution-walled
     (bound to the verified caller, not a client-claimed session/identity), and persisted via the
     presence-upsert seam — the SAME builder-gate + shape + attribution discipline as the verdict path, a
     distinct route/handler arm proven independently.
   - **covers —** `apps/studio/server/writeBroker.ts` (the presence arm)

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the broker handler as a new module,
test-first.

- **The new test —** `apps/studio/server/writeBroker.test.ts` (`vitest` — `import { describe, it, expect }
  from 'vitest'`, the studio-package suite convention; NOT node:test). Import `{ handleBrokeredWrite }` (or
  the chosen name) from `"./writeBroker.js"`.
  Build the real `Verdict`/`PresenceDeclaration` shapes, a recording store-write stub, and resolved-access
  doubles (builder / member / non-member / no-identity).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `writeBroker.ts` does
  not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057). Assert
  all five contracts: the unchanged persist, the shape wall, the attribution wall, the scope gate, and the
  presence mirror.
- **The GREEN —** write `apps/studio/server/writeBroker.ts`: a handler (and its route arms for verdict +
  presence) that (a) requires the resolved `builder`/`admin` scope (401 identity-less, 403 non-builder),
  (b) `safeParse`s the body against the real shape (400 on failure), (c) enforces the attribution wall
  against the verified caller (refuse a mismatch, never re-stamp), then (d) persists UNCHANGED through the
  injected store seam — signing nothing. Wire the route into `apiRouter.ts`'s dispatch and the
  `builder`-scoped exception into `createMembersPolicy.gate` (so the policy admits a builder's broker
  POST). After it, the import resolves, the assertions hold, and the package suite + typecheck stay green.

Rules:

- **Persist, never sign or re-stamp** — the broker takes the build spine's local signature and writes it
  unchanged; it holds no signing key (ADR-0091) and never re-stamps the signer/session. The test pins
  this (`broker-persists-a-valid-builder-verdict-unchanged`, `broker-attribution-wall-refuses-a-mismatched-signer`).
- **Validate shape AND attribution AND scope BEFORE the write** — three walls, each a clean typed refusal
  (401/403/400), the store seam untouched on any refusal. Never a 500 for a bad request.
- **The server is the single DB authority** — persist via the existing store seam under the studio's
  service-account identity; the builder holds no DB identity.
- **Presence rides the same discipline** — the presence arm is gated + shape-validated + attribution-walled
  exactly as the verdict arm. The test pins this (`broker-presence-path-mirrors-the-verdict-path`).
- **One route table** — the broker is a route on the studio's existing `/api/*` dispatch
  (`apiRouter.ts`), gated by the existing policy (`guestPolicy.ts`) with a builder-scoped exception — not a
  second backend (ADR-0042 one-route-table).
