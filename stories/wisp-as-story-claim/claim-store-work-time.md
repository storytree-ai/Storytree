---
id: "claim-store-work-time"
tier: capability
story: wisp-as-story-claim
title: "Claim-store work-time extensions — release-by-branch, trace heartbeat bump, work-time intent"
outcome: "The per-unit write-claim generalises from build-time to work-time: a bulk release-by-branch (the CI clear), a cheap trace-driven heartbeat bump (so a live session never ages out), and a work-time claim-acquisition path carrying an `edit`/`orchestrate` intent."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [138, 121, 9, 33, 64]
# Node-borne proof config (ADR-0057 keystone A) + DB-BACKED proof mode (ADR-0064 §1): authoring THIS block
# makes the capability inner-loop buildable. The `--real` arm drives the LOAD-BEARING delta A1
# (releaseClaimsByBranch on PgClaimStore) — the bulk-release CI calls on merge (capability D). EDIT-EXISTING:
# PgClaimStore exists at HEAD (release()/claim()/current()/history()); the leaf adds the new method, so the
# red is a runtime assertion (the new live test calls a method that returns nothing) — `editsExisting: true`.
# `db: true` provisions an ISOLATED storytree_test DB (never prod) and FORCES STORYTREE_DB_NAME, so the
# round-trip test connects via createTestPool(). `install: true` + typecheck because claim-store.ts imports
# from ../claim.js and the test imports `pg`/the connector. A custom pnpm proofCommand carries
# `--test-force-exit` so the connector socket can never hang the proof (a live-store-test trap).
# events.node_claim + events.claim_event are PREREQUISITES already on this branch (the ADR-0121 schema),
# outside the leaf's write scope. The pure helpers A2 (claim.ts heartbeat bump shape) and A3 (work-time
# ClaimRequest intent builder) are enumerated as contracts below and covered by the offline package suite;
# the `--real` arm proves the one load-bearing db method.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/notice-board", "test"]
  scope:
    testGlobs: ["packages/notice-board/src/**/*.test.ts"]
    sourceGlobs: ["packages/notice-board/src/**/*.ts"]
  real:
    testFile: "packages/notice-board/src/store/claim-store-release-by-branch.live.test.ts"
    sourceFile: "packages/notice-board/src/store/claim-store.ts"
    scope:
      testGlobs: ["packages/notice-board/src/store/claim-store-release-by-branch.live.test.ts"]
      sourceGlobs: ["packages/notice-board/src/store/claim-store.ts"]
    install: true
    db: true
    editsExisting: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/notice-board", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "@storytree/notice-board"
        - "exec"
        - "node"
        - "--import"
        - "tsx"
        - "--test"
        - "--test-force-exit"
        - "src/store/claim-store-release-by-branch.live.test.ts"
---

# Claim-store work-time extensions

**Outcome —** The per-unit write-claim (`events.node_claim`, the ADR-0121 lock) generalises from
**build-time** to **work-time**, via three deltas — none of which exist yet:

- **A1 `releaseClaimsByBranch(branch)`** on `PgClaimStore` — the bulk-release CI calls on merge (capability D).
- **A2** a cheap **trace-driven heartbeat bump** — reset `heartbeatAt` from a liveness signal without the
  full re-acquire/refuse path, so a live session's claim never ages out (ADR-0138 §4).
- **A3** a **work-time claim-acquisition** path carrying an `intent` of the work kind (`"edit"` / `"orchestrate"`).

**Depends on —** (root — no within-story upstream).

> **ADR-0200 re-aim (the claim gained grades; the store generalised).** This capability's three deltas
> (A1 `releaseClaimsByBranch`, A2 the trace heartbeat bump, A3 the work-time intent builder) all landed
> and are the CI clear + liveness backstop the ledger still runs on. ADR-0200 then **generalised the same
> `PgClaimStore` to three grades** (exploring / waiting / work): `packages/notice-board/src/claim.ts`
> gained `ClaimGrade`, the `exploring`/`waiting` request builders, `oldestLiveWaiter` (the pure promotion
> pick) and `groupClaimsBySession` / `digestOverlapDeltas` / `foldDepartures` (the view folds); the store
> gained `take` / `upgrade` / `downgrade` with **atomic waiter promotion**, `releaseClaimsBySession`,
> `bumpHeartbeatsBySession`, `pullOverlapDeltas`, and `recentDepartures` (proven by the live-gated
> `claim-store-grades.live.test.ts` / `claim-cursor.live.test.ts` / `claim-departures.live.test.ts`).
> That graded machinery is the [`notice-board`](../notice-board/story.md) story's living shape (the
> ledger); this capability remains the render story's hosted-seam entry point onto the claim store
> (ADR-0192 landlord rule). A1's `releaseClaimsByBranch` releases every grade for the branch.

> **Proof status (honest) — `proposed` (none of the three deltas exist yet).** A1/A2 live in the
> DB-backed `PgClaimStore` (`packages/notice-board/src/store/claim-store.ts`); A3's provable piece is a pure
> helper in `packages/notice-board/src/claim.ts`. The `--real` arm drives the load-bearing A1 against an
> isolated `storytree_test`; A2's pure heartbeat shape and A3's intent builder are covered by the offline
> `@storytree/notice-board` suite (`claim.test.ts` / `claim-store.test.ts`).

## Guidance

The lock already exists and is well-shaped — you are GENERALISING it, not rebuilding it. Read
`packages/notice-board/src/claim.ts` (the pure half: `ClaimDoc`, `ClaimRequest`, `ClaimResult`,
`isReclaimable`, `CLAIM_STALE_RECLAIM_MS`) and `packages/notice-board/src/store/claim-store.ts` (the
`PgClaimStore`: `claim()` / `release()` / `current()` / `history()` over `events.node_claim` +
`events.claim_event`). Three deltas, each foreseen in the existing code's own comments:

**A1 — `releaseClaimsByBranch(branch: string): Promise<number>` on `PgClaimStore`.** Bulk-release **every**
`events.node_claim` row whose `branch` column equals `branch`, append one `released` row to
`events.claim_event` per released claim (the existing `#appendEvent` shape), and return the released count.
One transaction (BEGIN … COMMIT, ROLLBACK on error), the same house pattern as `release()`. This is the
**guaranteed machine clear** the CI merge job calls (capability D) — `release()` drops one claim by
`(unitId, sessionId)`; this drops ALL of a merged branch's claims by `branch` alone. The `--real` proof
drives this: a live round-trip seeds two claims on one branch + one on another, calls
`releaseClaimsByBranch`, asserts the count, asserts the branch's `node_claim` rows are gone and the other
branch's claim survives, and asserts a `released` `claim_event` row exists per cleared claim.

**A2 — a trace-driven heartbeat bump.** The `claim.ts` header already names this: *"A heartbeat that bumps
`heartbeatAt` mid-build (so the threshold can shrink) is a named follow-on."* The provable PURE piece is the
SHAPE: a helper that, given the current claim + a `now`, produces the heartbeat-bumped claim WITHOUT the
re-acquire/refuse path (cheaper than `claim()`). The store method that writes the bump
(`UPDATE events.node_claim SET heartbeat_at = now() WHERE unit_id = $1 AND session_id = $2`) rides the
db-backed proof posture; the pure helper is offline-testable in `claim.test.ts`. This is what the loops'
own trace signals (`onMessage` / `onPhase`, ADR-0138 §4) call so a live session's claim never ages out.

**A3 — a work-time `ClaimRequest` intent builder (pure, `claim.ts`).** `ClaimDoc.intent` is already free
prose with `"edit"` foreseen (`claim.ts:59`, `claim.ts:17`). The provable piece is a pure helper that builds
the work-time `ClaimRequest` with the correct intent — e.g. `workClaimRequest({ unitId, sessionId, branch,
kind })` mapping `kind: "edit" | "orchestrate"` to the `intent` string — generalising beyond the current
build-only trigger (`"real"` / `"live-smoke"`). Pure, offline, builtins-only; no store touch.

Do NOT touch `package.json` / `pnpm-lock.yaml`, the `events` schema, the connector, or anything outside
your write scope — they are prerequisites. If a prerequisite is missing, STOP and say so.

## Integration test

**Goal —** Run the real `PgClaimStore` (no stubs) against an isolated `storytree_test` database: seed
claims on two branches, call `releaseClaimsByBranch` for one, and prove the bulk release clears exactly that
branch's `events.node_claim` rows (the others survive) and appends a `released` audit event per cleared
claim — the guaranteed machine clear the CI merge job depends on. The pure A2/A3 helpers are exercised
alongside via the offline `@storytree/notice-board` suite against their real `claim.ts` collaborators.

This capability is proven against its **real in-story collaborators** — the real `PgClaimStore` over the
real `events.node_claim` / `events.claim_event` tables (ADR-0010 §2/§5), via the DB-backed proof mode
(ADR-0064): the spine cuts a worktree, installs deps, provisions a disposable `storytree_test`, forces
`STORYTREE_DB_NAME`, and runs the authored live test against it — never production.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (ADR-0002). The `--real` arm drives
contract A1 (the load-bearing db method); A2/A3 are pure and covered by the offline suite.

1. **`release-claims-by-branch-clears-the-branch`** — `releaseClaimsByBranch` bulk-releases every
   `events.node_claim` row for one git branch and returns the count, leaving other branches untouched.
   - **asserts —** seeding two claims on `branch-X` and one on `branch-Y`, then
     `releaseClaimsByBranch("branch-X")` returns `2`, removes both `branch-X` `node_claim` rows, leaves the
     `branch-Y` claim intact, and appends one `released` `events.claim_event` row per cleared claim. Atomic
     (ROLLBACK on error). Runs against the isolated `storytree_test` DB (`createTestPool` is fail-closed
     against prod, ADR-0054/0064).
   - **covers —** `packages/notice-board/src/store/claim-store.ts`
   - **proven by —** `packages/notice-board/src/store/claim-store-release-by-branch.live.test.ts`, authored
     by the gated leaf and run by the spine against `storytree_test` (the DB-backed proof, ADR-0064 §1).
2. **`heartbeat-bump-shape-resets-without-reacquire`** — the pure heartbeat-bump helper resets `heartbeatAt`
   from a `now` signal without the re-acquire/refuse path, so a fresh-heartbeat claim is no longer
   reclaimable.
   - **asserts —** given a claim whose `heartbeatAt` is older than `CLAIM_STALE_RECLAIM_MS` (so
     `isReclaimable` is `true`), the bump helper produces a claim with `heartbeatAt === now.toISOString()`
     that `isReclaimable(bumped, now)` now reports `false`, and it changes ONLY `heartbeatAt` (all other
     fields equal). Pure — no store, no clock read (caller passes `now`).
   - **covers —** `packages/notice-board/src/claim.ts`
   - **would-be test —** authored in `packages/notice-board/src/claim.test.ts` (offline package suite); the
     store-side write of the bump rides A1's db-backed posture.
3. **`work-claim-request-carries-work-intent`** — the pure work-time `ClaimRequest` builder stamps the
   correct `intent` for the work kind, generalising beyond the build-only trigger.
   - **asserts —** the builder maps `kind: "edit"` → `intent: "edit"` and `kind: "orchestrate"` →
     `intent: "orchestrate"` on the returned `ClaimRequest` (preserving `unitId` / `sessionId` / `branch`),
     and the result validates as a legitimate claim request the store accepts (round-trips through
     `ClaimDoc.parse` once the store stamps timestamps). Pure, builtins-only.
   - **covers —** `packages/notice-board/src/claim.ts`
   - **would-be test —** authored in `packages/notice-board/src/claim.test.ts` (offline package suite).
