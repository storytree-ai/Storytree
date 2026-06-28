---
id: "work-verdict-event-log"
tier: capability
story: drive-machinery
title: "The work/verdict event log and the status rollup"
outcome: "A unit's lifecycle status is derived as a pure projection over typed work and signing events, never hand-maintained."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The work/verdict event log and the status rollup

**Outcome —** A unit's lifecycle status is derived as a pure projection over typed work and signing events, never hand-maintained.

> **Proof status (honest) — `mapped`, with a `proposed` live-Postgres pocket.** The projection and
> the event routing are covered by real, passing, offline suites (`packages/orchestrator/src/proof/rollup.test.ts`
> incl. the reusable parity suite, and `packages/orchestrator/src/store/pg-work-store.test.ts` against a
> structural fake client — both suites now resident in `@storytree/orchestrator`
> (the old `@storytree/core` / `@storytree/store` dissolved into it, ADR-0068/0077) — I ran them green
> 2026-06-13). The **live SQL leg** (real `events.work_event`/`events.verdict` tables over the
> IAM connection) is proven only by the live-gated `PgWorkStore rollup parity` run
> (`packages/orchestrator/src/store/pg-work-store.test.ts`, a visible **skip** unless `STORYTREE_DB_LIVE=1`) —
> currently unrun by default — plus PR #30's one attested `--store pg` real-verdict run.

## Guidance

Two halves, one capability (the projection in `packages/orchestrator/src/proof/` and the pg event store
in `packages/orchestrator/src/store/` — once split across the since-dissolved `packages/core` /
`packages/store` by package locality, ADR-0068/0077 — the same shape as the library's store seam):

- **The vocabulary + projection** (`packages/orchestrator/src/proof/rollup.ts`): `WorkEventDoc` /
  `workEvent` (`rollup.ts:34-52`) shape the lifecycle marks (`proposed`/`building`/`retired`);
  `rollupStatus` (`rollup.ts:66-89`) walks an event stream in `seq` order, last relevant event
  wins. CONSERVATIVE BY CONSTRUCTION: `healthy` is reachable ONLY through a signed pass `Verdict`
  (ADR-0020 — proof is non-authorable); a malformed signing doc grants nothing; a fail verdict
  never grants progress (it only demotes a prior healthy); NO events means the projection ABSTAINS
  (`null`) so the authored frontmatter status stands (ADR-0006: derived state augments, never
  invents). `rollupParitySuite` (`rollup.ts:97-148`) is exported so any `Store` impl is held to the
  same projection bar — the library's trait-parity discipline reused.
- **The Postgres event store** (`packages/orchestrator/src/store/pg-work-store.ts`): `PgWorkStore` routes
  `kind:"work"` → `events.work_event` and `kind:"signing"` → `events.verdict`
  (`pg-work-store.ts:66-133`), EVENT-ONLY and fail-closed — a signing doc that is not a full signed
  `Verdict` throws (nothing forgeable lands), an unknown kind throws, and the whole doc surface
  throws (library artifacts live in `PgLibraryStore`, never here). `readEvents`
  (`pg-work-store.ts:135-186`) merges both tables ordered by `at` (work before signing on a tie)
  and REASSIGNS `seq` monotonically — the two tables have independent BIGSERIALs, so raw values
  cannot order the union. The client is structural (`WorkStoreClient`, `pg-work-store.ts:29-31`) so
  offline tests inject a fake — which is exactly why the live-SQL leg stays a `proposed` pocket.

Consumed by [`prove-it-gate`](prove-it-gate.md) (the signing append rides the narrow `Store` seam)
and [`build-drive-cli`](build-drive-cli.md) (`workEvent` building marks, `rollupStatus` report
lines, `PgWorkStore` under `--store pg`).

## Integration test

**Goal —** Events appended through the real `Store` seam read back as one stream the rollup
derives honestly from: the exported `rollupParitySuite` runs against a REAL `InMemoryStore`
(`packages/orchestrator/src/proof/rollup.test.ts:136` — no events → abstain; building → building; building +
signed pass → healthy; another unit's events grant nothing), and `PgWorkStore.readEvents` merges
both tables into the rollup's input shape (`packages/orchestrator/src/store/pg-work-store.test.ts:126`).

## Contracts (8)

1. **`rollup-abstains-without-events`** — no event speaks for the unit → `null`; the authored status stands
   - **asserts —** `rollupStatus("ghost", []) === null`.
   - **covers —** `packages/orchestrator/src/proof/rollup.ts:66-89`
   - **proven by —** `packages/orchestrator/src/proof/rollup.test.ts:48` (REAL, passing)
2. **`pass-grants-healthy-rebuild-supersedes`** — building → healthy only via a signed pass; a NEW building event after a pass supersedes it
   - **asserts —** building → `building`; + signed pass → `healthy`; + later building → `building`.
   - **covers —** `rollup.ts:72-88`
   - **proven by —** `rollup.test.ts:52`, `:57`, `:65` (REAL, passing)
3. **`fail-never-grants-progress`** — a fail verdict demotes a prior healthy to unhealthy and otherwise changes nothing
   - **asserts —** fail-before-pass leaves status untouched; fail-after-pass → `unhealthy`.
   - **covers —** `rollup.ts:81-86`
   - **proven by —** `rollup.test.ts:73` and `:86` (REAL, passing)
4. **`conservative-parsing-never-overclaims`** — a malformed signing doc, another unit's events, and out-of-order seq all stay honest
   - **asserts —** malformed grants nothing; other-unit grants nothing; events are seq-sorted before walking.
   - **covers —** `rollup.ts:71-80`
   - **proven by —** `rollup.test.ts:102`, `:112`, `:116` (REAL, passing)
5. **`work-event-shape-validates`** — `workEvent` validates and shapes the append payload (`runId:unitId` id rule)
   - **asserts —** a valid doc shapes; the id embeds runId when present.
   - **covers —** `rollup.ts:45-52`
   - **proven by —** `rollup.test.ts:123` (REAL, passing)
6. **`pg-routes-kinds-to-their-tables`** — signing → `events.verdict` with the Verdict's scalar spine; work → `events.work_event` with the LIFECYCLE word in the type column
   - **asserts —** the INSERT targets and column values per kind; a missing tier lands as `'unknown'`.
   - **covers —** `packages/orchestrator/src/store/pg-work-store.ts:66-133`
   - **proven by —** `packages/orchestrator/src/store/pg-work-store.test.ts:51`, `:93`, `:109` (REAL, passing — fake client; the live SQL leg is the `proposed` pocket)
7. **`pg-fails-closed-on-forgeable-input`** — a non-Verdict signing doc and an unknown kind are refused; the doc surface fails loud
   - **asserts —** each throws; nothing lands somewhere silent.
   - **covers —** `pg-work-store.ts:73-76`, `:129-133`, `:189-201`
   - **proven by —** `pg-work-store.test.ts:78`, `:116`, `:169` (REAL, passing)
8. **`pg-read-merges-and-reorders`** — `readEvents` merges both tables by `at` (work before signing on a tie), reassigns `seq`, honours the id filter
   - **asserts —** merged order + monotonic reassigned seq + filter.
   - **covers —** `pg-work-store.ts:135-186`
   - **proven by —** `pg-work-store.test.ts:126` and `:156` (REAL, passing)
