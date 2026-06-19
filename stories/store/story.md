---
id: "store"
tier: story
title: "The store — one keyless Postgres data layer every organism persists through"
outcome: "Every organism's persisted state — library docs, presence, members, work verdicts — flows through one keyless-IAM Cloud SQL Postgres connection; a session pulls live data and writes transactionally as history-plus-projection."
status: mapped
proof_mode: UAT
# Agent-exercised: the UAT is a data pull an agent runs (`--pg` read against the live store), so the
# story is machine-witnessed (ADR-0040). The live legs are DB-gated (CI is DB-free), the same posture
# as library/notice-board's live legs — machine, never a worktree PASS.
uat_witness: machine
capabilities: [keyless-store-connection, shared-events-schema]
# Consumer-side outbound edges (ADR-0010 §3, code-import-evidenced): the store implements the
# persistence seams owned by these organisms — the library Store (PgLibraryStore), notice-board's
# presence store (PgPresenceStore), and studio-members' user store (PgUserStore). See the
# code-derived graph below.
# ADR-0075: pg-store reads verdict-DATA (Verdict.parse) and implements the base Store/ChangeStore
# seam, so the base + verdict-contract ROOT ports are now declared cross-story edges (they were exempt
# substrate dependencies before ADR-0075 collapsed that class).
depends_on: [library, notice-board, studio-members, base, verdict-contract]
# Provider-side inbound edge (ADR-0074 §4): the cli HUB imports @storytree/store (buildStore swaps
# PgLibraryStore in under `--pg`). Declared here so store owns its full connection set in one place.
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the tier lives in shared Postgres (17), DBOS deferred → plain pg
# (19), keyless Cloud SQL IAM via ADC (21), store-as-a-first-class-hub-organism (74), and the ports
# as declared root organisms — store's base/verdict-contract edges are now declared (75).
decisions: [17, 19, 21, 74, 75]
---

# The store — one keyless Postgres data layer every organism persists through

**Outcome —** Every organism's persisted state — library docs, presence, members, work verdicts —
flows through one keyless-IAM Cloud SQL Postgres connection; a session pulls live data and writes
transactionally as history-plus-projection.

This is storytree's **persistence hub** ([ADR-0017](../../docs/decisions/0017-cross-cutting-knowledge-tier.md)
the tier in shared Postgres; [ADR-0019](../../docs/decisions/0019-library-tier-name-and-defer-dbos.md)
DBOS deferred, so the store is a **plain typed `node-pg` connection**, no durable workflows;
[ADR-0021](../../docs/decisions/0021-keyless-agent-session-auth-and-db-bootstrap.md) keyless Cloud SQL IAM via ambient
ADC). It is the one place every organism's state is durable: `packages/store` carries the IAM
connector (`connection.ts`), the `events` schema (`schema.sql`), and the per-domain Postgres store
impls (`pg-store.ts`, `presence-store.ts`, `user-store.ts`, the work/verdict log, the corpus
seeder/migrator).

**Why this is its own (hub) story now ([ADR-0074](../../docs/decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §2).**
The store is one of the two most-connected packages in the workspace — exactly the wiring the
observability world most wants visible, not exempt. The v1 boundary gate classed it a "composition
root" and **exempted** its edges; ADR-0074 §2 rejects that. The store is a **first-class hub
organism**: a visible node, its edges enforced like any other organism's, with this lightweight,
expandable UAT (§3) and a declared full connection set (§4).

## Design floor

- **Plain pg, no DBOS** (ADR-0019). A typed connection pool, transactional upserts, no durable
  execution. DBOS stays a named, reserved future target — not a dependency here.
- **Keyless by ambient ADC** (ADR-0021). The Cloud SQL connector authenticates via the session's
  Application Default Credentials (the IAM email is the DB user) — no JSON key, no password.
- **History + projection, atomically.** Every write appends an event AND updates a one-row
  current-state projection in the same transaction (the house event-sourced pattern). The store is
  the seam; the per-kind schema + validation it enforces at the boundary are owned upstream (library).
- **The store implements seams it does not own.** `PgLibraryStore` satisfies the library `Store`
  seam; `PgPresenceStore` the notice-board presence seam; `PgUserStore` the studio-members user
  seam. Those contracts are the consumed organisms' (the `depends_on` edges below); the store is
  their live Postgres realization.
- **AI-free and degrade-aware.** No inference inside the store; offline surfaces degrade rather than
  fail, and a down/idle-stopped DB surfaces as a connection error, never a corruption.

## Capabilities (2)

Lightweight and **expandable** (ADR-0074 §3): the hub's own competence, distinct from the per-domain
seams it realizes (those are the consumed organisms' capabilities, e.g. library's
`event-sourced-store-seam`, notice-board's `presence-store`). The list grows one case per real
defect (`uat-proves-the-goal-not-the-surface`).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`keyless-store-connection`](keyless-store-connection.md) | One Cloud SQL Postgres connection authenticated by ambient keyless IAM (ADR-0021) backs every organism's `--pg` data access; a session pulls live data through it. | mapped | — |
| 2 | [`shared-events-schema`](shared-events-schema.md) | One `events` schema hosts every organism's append-only history plus a current-state projection (library docs, presence, members, work verdicts) under transactional upsert. | mapped | `keyless-store-connection` |

## Dependency graph (code-derived)

Read off the real `packages/store` imports (ADR-0010 §3), these are **cross-story** edges (the store
realizes seams owned by other organisms) — the consumer-side `depends_on` above:

- `store → library` — `pg-store.ts` imports the library `Store`/doc schema + `upcastAndValidate`
  and validates every write at the boundary; `load-corpus.ts`/`batch-migrate.ts` ride the same seam.
- `store → notice-board` — `presence-store.ts` imports `PresenceDeclarationDoc` + `mergeDeclaration`
  and persists the presence projection (`PgPresenceStore`).
- `store → studio-members` — `user-store.ts` imports the member/user schema and persists the user
  directory projection (`PgUserStore`).

Foundational-port edges — now **declared**, not exempt ([ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)
collapsed the `substrate` class): `store → base` (the `Store`/`ChangeStore` document-event seam) and
`store → verdict-contract` (reads verdict-DATA via `Verdict.parse`), both declared in `depends_on`
above so the dependency on the root ports is a visible, rendered edge. The `store → orchestrator` edge
is a **devDependency** (a test-only rollup/hashSpan parity reuse), excluded from the boundary graph
(ADR-0010 §5). Inbound: `cli → store` (declared `consumed_by: [cli]`).

The merged declared graph (depends_on ∪ consumed_by) is **acyclic** (ADR-0058): library/notice-board/
studio-members never reach back to store.

## Story UAT

The integrated acceptance walkthrough that proves the whole `store` organism end-to-end against the
**live** Cloud SQL store — a *successful data pull* (ADR-0074 §3), the minimum that proves the goal.
Every leg is an **agent (machine) exercise** (`_(witness: machine)_`); the live legs need
`pnpm db:up` (CI is DB-free, so they are run locally / in a DB-bearing session, never attested by a
worktree PASS). The list is **expandable** — each real defect earns a permanent regression leg.

**Goal —** A session brings the shared DB up and pulls live data through the one keyless connection,
proving the connector + IAM + the projection read work end-to-end.

1. **Wake the store:** _(witness: machine)_ `pnpm db:up` brings the Cloud SQL instance to RUNNABLE.
   **Success —** `pnpm db:status` reports RUNNABLE; no JSON key was used (auth is ambient ADC).
2. **Pull live data:** _(witness: machine)_ `pnpm storytree library artifact <id> --pg` reads a real
   artifact through `PgLibraryStore` on the keyless connection. **Success —** the artifact renders
   from the live projection with `ok:true` — the connector authenticated via IAM and the projection
   read returned.
3. **Write transactionally:** _(witness: machine)_ `pnpm storytree library artifact edit <id> --set
   <field>=<value> --pg` upserts through the store. **Success —** the write commits as event +
   projection atomically and a re-read reflects it.
4. **Offline degrade:** _(witness: machine)_ with the DB idle-stopped, a `--pg` read surfaces a clear
   connection error and offline (non-`--pg`) reads still work against the in-memory seed. **Success —**
   the store fails closed with guidance (`pnpm db:up`), never a silent corruption.

End state — the live data layer is reachable, a doc pulled and written transactionally, and the
offline degrade path honest.

## Proof

**Honest status — `mapped` (brownfield), NOT `healthy`.** `packages/store` has a real, passing,
offline automated suite (`InMemoryStore` parity proves the seam contract; the live Pg legs are
gated behind `STORYTREE_DB_LIVE=1` and skipped by default). Per the glossary that observational
green is brownfield `mapped` — storytree's own prove-it-gate has not driven these red→green, so
nothing here is `healthy`. The live-DB transactional behaviour (steps 2–3 above) is the
`proposed`-flavoured pocket proven only by the default-skipped live-gated parity run.

## Open modeling calls (for the owner)

1. **Capability granularity.** I kept the hub to **two** lightweight capabilities (connection +
   schema), deliberately NOT re-deriving the per-domain Postgres impls — those are the consumed
   organisms' capabilities (library `event-sourced-store-seam`, notice-board `presence-store`,
   studio-members user store), realized here. Confirm this hub-vs-seam split, or split per-impl if
   you want each Postgres store visible at the capability grain.
2. **The connection-declaration shape (ADR-0074 §4) — settled in this increment.** The store's full
   connection set is declared across `depends_on` (consumer-side: library/notice-board/studio-members)
   and `consumed_by` (provider-side: cli). The gate covers a code edge when EITHER endpoint declares
   it. Recorded here so the call is visible; see the PR for the cross-cutting rationale.
