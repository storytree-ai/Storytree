---
id: "builder-role"
tier: capability
story: studio-members
title: "A third role — builder — a member who may POST builds through the broker, resolved by the same access compute"
outcome: "studio-members gains a `builder` role: a member who may POST brokered builds/writes (read + comment like a member, plus the brokered write scope), resolved by `resolveAccess`, holding no DB identity; `admin ⊇ builder ⊇ member`, and the last-admin guard is unaffected by builders."
status: proposed
proof_mode: integration-test
depends_on: [user-directory]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDITS-EXISTING (editsExisting: the role enum +
# the access-control compute already exist): the leaf adds the `builder` member to `USER_ROLES` and the
# `builder`-aware branches to `resolveAccess` / the last-admin guards in packages/studio-members/src/
# users.ts, and writes the new assertions into the EXISTING users.test.ts. The RED the spine observes is
# a NEW assertion that `builder` is a valid role and resolves with the brokered-write scope — failing at
# HEAD because `USER_ROLES` is `["admin","member"]` only (a value/behaviour red, not a missing module).
# studio-members is pure-zod, browser-safe: NO `node:`/pg may enter this module (the studio bundles it).
# install: true + a typecheck wall because the suite imports the package's own zod types across modules
# (the proof runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). Single
# LITERAL test file (no `*`), so the default node:test proof on the one test file is legal — no proofCommand.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/studio-members", "test"]
  scope:
    testGlobs: ["packages/studio-members/src/**/*.test.ts"]
    sourceGlobs: ["packages/studio-members/src/**/*.ts"]
  real:
    editsExisting: true
    testFile: "packages/studio-members/src/users.test.ts"
    sourceFile: "packages/studio-members/src/users.ts"
    scope:
      testGlobs: ["packages/studio-members/src/users.test.ts"]
      sourceGlobs: ["packages/studio-members/src/users.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/studio-members", "typecheck"]
---

# A third role — builder — a member who may POST builds through the broker

**Outcome —** `studio-members` gains a `builder` role: a member who may POST brokered builds/writes
(read + comment like a `member`, **plus** the brokered write scope), resolved by `resolveAccess`,
holding **no DB identity**. The role ordering is `admin ⊇ builder ⊇ member` for the broker gate, and
the last-admin guard is unaffected by builders.

**Depends on —** [`user-directory`](user-directory.md) — the role lives in the same `User` doc + the
same `resolveAccess` compute the directory owns; this capability extends that schema and that compute,
so it couples to the directory's write boundary and access resolution.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. The collaborators are real
> and shipped: `packages/studio-members/src/users.ts` already defines `USER_ROLES = ["admin","member"]`,
> the `User` zod schema (`role: z.enum(USER_ROLES)`), `resolveAccess` (verified email → row → role), and
> the last-admin guards (`wouldOrphanAdminsOnRemove` / `wouldOrphanAdminsOnRole`). This capability adds
> the third member to the enum and the `builder`-aware logic, test-first, in that module.

## Guidance

WHY THIS IS A CAPABILITY, NOT JUST A CONTRACT: it is a small, cohesive extension of ONE module's role
model — the enum, the doc schema that validates against it, and the access compute that resolves it —
proven by integration over `resolveAccess` against the real `User` projection (a directory of mixed
roles), not a single isolated string assertion. It is the *authorization-tier* half of ADR-0117; the
broker ENDPOINT that consumes this scope is a separate capability in `studio-cloud`
([`write-broker`](../studio-cloud/write-broker.md)), and the Members-panel affordance that invites a
builder is an operator-attested leg of the studio-members Story UAT (not a leaf unit).

STUDIO-MEMBERS IS PURE-ZOD, BROWSER-SAFE (the hard boundary): this module is bundled by the studio SPA.
NO `node:` import, NO `pg`, NO I/O may enter it (CLAUDE.md: "keep `node:`/pg out of it"). The `builder`
role is data + pure compute only — exactly like `admin`/`member` today.

THE ROLE ORDERING IS `admin ⊇ builder ⊇ member` (ADR-0117 d.2): a `builder` can do everything a
`member` can (read + comment) PLUS hold the brokered write scope; an `admin` can do everything a
`builder` can PLUS manage users + edit assets. `resolveAccess` returns the resolved role; the broker
gate (in `write-broker`) is what reads "is this caller `builder`-or-`admin`?". This capability's job is
to make `builder` a first-class resolvable role, not to gate any endpoint.

THE BUILDER HOLDS NO DB IDENTITY (ADR-0117 d.2/d.4 — the whole point): a `builder` is authorized
IN-APP (IAP authenticates, `resolveAccess` resolves the role); it is NOT a Cloud SQL IAM grant. Nothing
in this module touches a DB; the role is purely an app-layer authorization fact.

THE LAST-ADMIN GUARD IS UNAFFECTED BY BUILDERS (the no-lockout invariant, ADR-0043 d.4 preserved):
`adminCount` counts `role === "admin"` only, so adding/removing/re-roling builders never changes the
admin count. A directory with one admin and any number of builders still refuses removing/down-roling
that sole admin; promoting a builder TO admin, or down-roling an admin who is not the last, is allowed
exactly as today. Re-roling a `member`/`builder` between each other never orphans (neither is an admin).

OFFLINE-TESTABLE BY THE PURE COMPUTE: every assertion runs over the pure functions (`resolveAccess`,
`wouldOrphanAdminsOnRole`, `wouldOrphanAdminsOnRemove`, `User.parse`) with an in-memory `UserDoc[]`
projection and a seed-admin set — no store, no clock, no IAP. The same shape `users.test.ts` already uses.

## Integration test

**Goal —** Prove that `builder` is a valid, resolvable role with the read+comment+brokered-write scope
(strictly between `member` and `admin`), that a `builder` doc validates at the write boundary while a
bogus role is refused, and that builders never perturb the last-admin no-lockout guard — all over the
pure compute, no I/O.

The integration test exercises this capability against its **real in-story collaborator** — the real
`resolveAccess` + the real last-admin guards + the real `User` schema over an in-memory `UserDoc[]`
projection (the directory `user-directory` owns). No stubs within studio-members' own compute.

The integration test would:

1. Validate a `{ role: "builder", … }` doc through `User.parse` → it parses (the enum admits it); a
   `{ role: "contributor" }` (bogus) doc → refused at the write boundary (the fail-closed enum).
2. Resolve a verified email whose projection row is a `builder` via `resolveAccess` → it returns
   `role: "builder"` (not coerced to `member`, not elevated to `admin`).
3. Assert the scope ordering through whatever the broker gate reads: a `builder` (and an `admin`)
   satisfies the brokered-write predicate; a plain `member` does not. (The predicate itself lives with
   the gate in `write-broker`; this test pins that `resolveAccess` surfaces the role the gate needs.)
4. Last-admin guard: a directory of `{ one admin, N builders }` → `wouldOrphanAdminsOnRemove(adminEmail)`
   and `wouldOrphanAdminsOnRole(adminEmail, "builder")` are BOTH true (removing/down-roling the sole
   admin orphans — a builder is not an admin), while removing/re-roling any builder is never an orphan.
5. With two admins, down-roling one to `builder` is allowed (`wouldOrphanAdminsOnRole` false) — the
   guard counts admins only, and a builder does not count toward the admin floor.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the
`@storytree/studio-members` suite), collaborators stubbed where applicable. They extend the existing
`users.test.ts`; cite at real `file:line` when built.

1. **`builder-is-a-valid-resolvable-role`** — `builder` validates and resolves as itself
   - **asserts —** `User.parse({ role: "builder", … })` succeeds and `{ role: "contributor" }` is
     refused at the write boundary; `resolveAccess` over a projection whose row is a `builder` returns
     `role: "builder"` (never coerced to `member`, never elevated to `admin`).
   - **covers —** `packages/studio-members/src/users.ts` (`USER_ROLES` + `resolveAccess`) *(provisional)*
2. **`builder-scope-is-between-member-and-admin`** — `admin ⊇ builder ⊇ member` for the brokered-write scope
   - **asserts —** the brokered-write predicate (the scope the broker gate reads off the resolved role)
     is satisfied by `builder` AND `admin`, and is NOT satisfied by `member`; a `builder` retains the
     `member` read+comment scope and does NOT gain admin-only powers (user management / asset writes).
   - **covers —** `packages/studio-members/src/users.ts` (the role-scope compute)
3. **`builders-do-not-perturb-the-last-admin-guard`** — the no-lockout floor counts admins only
   - **asserts —** with one admin and any number of builders, removing or down-roling the sole admin is
     refused (`wouldOrphanAdminsOnRemove` / `wouldOrphanAdminsOnRole` true), while removing or re-roling
     any builder is always allowed; with two admins, down-roling one to `builder` is allowed.
   - **covers —** `packages/studio-members/src/users.ts` (`adminCount` + the orphan guards)

## Guidance — the slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, EDITS-EXISTING): extend the role model in place,
test-first.

- **The edited test —** `packages/studio-members/src/users.test.ts` (`node:test` + `node:assert/strict`,
  the package convention). Add the assertions above: `builder` parses + resolves, the scope ordering,
  and the builder-neutral last-admin guard.
- **The RED the spine observes (before IMPLEMENT) —** the new assertions fail against HEAD, where
  `USER_ROLES = ["admin","member"]` — `User.parse({ role: "builder" })` throws (the value not in the
  enum) and `resolveAccess` cannot return a `builder` role (a value/behaviour red, not module-not-found).
- **The GREEN —** in `packages/studio-members/src/users.ts`: add `"builder"` to `USER_ROLES`; the `User`
  schema (`z.enum(USER_ROLES)`) then admits it; add the `builder`-aware scope compute the broker gate
  reads; leave `adminCount` counting `role === "admin"` only (so the guards are already builder-neutral —
  verify with the tests). NO `node:`/pg. After it, the assertions hold and the package suite + typecheck
  stay green.

Rules:

- **Pure-zod, browser-safe** — no `node:`/pg/I/O enters studio-members; the studio bundles it. The
  whole capability is data + pure compute.
- **`admin ⊇ builder ⊇ member`** — a builder gains the brokered-write scope and keeps the member
  read+comment scope; it gains NO admin powers (user management / asset writes stay admin-only). The
  test pins this (`builder-scope-is-between-member-and-admin`).
- **No DB identity** — a builder is authorized in-app, never via a Cloud SQL IAM grant; nothing here
  touches a DB.
- **No-lockout preserved** — `adminCount` counts admins only; builders never change the admin floor. The
  test pins this (`builders-do-not-perturb-the-last-admin-guard`).
