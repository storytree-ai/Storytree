# ADR-0026: Library schema migrations & health checks — per-row version pin, forward-only migrate-on-write, and a gated health module

## Status

accepted (2026-06-09). Implements the design note
[`docs/research/library-schema-migrations-and-health-checks.md`](../research/library-schema-migrations-and-health-checks.md)
(flipped to IMPLEMENTED, same date). Builds on the event-sourced Library ([ADR-0017](0017-cross-cutting-knowledge-tier.md)),
the deferral of DBOS ([ADR-0019](0019-library-tier-name-and-defer-dbos.md)), the prove-it-gate spirit
([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)), the CI green gate
([ADR-0022](0022-ci-green-gate-and-auto-merge.md)), and the Library CLI surface
([ADR-0023](0023-library-cli-choose-your-own-adventure.md)).

## Date

2026-06-09

## Context

- The Library schema is **TypeScript/zod, not SQL** ([ADR-0018](0018-knowledge-tier-phase1-structured-source.md)):
  `packages/core/src/knowledge.ts` `KIND_SPECS` drives a `.strict()` discriminated union; `validateLibraryDoc`
  rejects unknown fields. **Adding or removing one field forces every stored doc to change in lockstep.**
- The store is **event-sourced JSONB** ([ADR-0017](0017-cross-cutting-knowledge-tier.md)):
  `events.library_event` is append-only history, `events.library_artifact` is the current-state projection
  (one JSONB row per id). The DDL (`schema.sql`) is `doc JSONB` — it does **not** change when the *knowledge*
  schema changes. **No DBOS** ([ADR-0019](0019-library-tier-name-and-defer-dbos.md)): plain `node-pg`, no
  durable workflows, so "migrate everything atomically in one transaction" is not a tool we have.
- **Parallel sessions** edit different artifact ids concurrently. There is no corpus-wide lock.
- The `seeAlso`→Sources migration (`docs/research/library-sources-unification.md`, PR #16) was the motivating
  incident. It worked, but exposed three gaps: **(1)** no record of *which* migration ran or *what version*
  the data conforms to — `migrate-sources.mjs` was a throwaway; **(2)** mid-flight the corpus grew 78→94 as
  parallel sessions merged, and 16 new units were authored against the OLD schema — caught only by luck on
  re-write, not by a system; **(3)** no health check asserting *every* live row validates against the current
  schema / nothing was orphaned or silently dropped.
- The root cause of all three: **`.strict()` is a write-boundary gate.** It fires only when a doc is
  re-written, one row at a time, lazily. A stale or concurrently-authored old-shape doc is invisible until
  someone touches it. The validator promises an invariant it only checks per-write.

The design note surveys five established approaches (numbered DDL migrations; event-sourcing upcasters;
expand/contract; per-document `schemaVersion` + lazy/eager migrate; validate-don't-migrate) and names the
tradeoffs on both sides per the project's `assess-tradeoffs-by-naming-both-sides` principle. No single one
fits JSONB-docs + a materialised projection + append-only events + no-DBOS + parallel per-id sessions; the
recommendation composes the per-row stamp (D) with the upcaster (B) moved to our *write* boundary, a thin
slice of expand/contract (C) only when a removal can't land atomically, plus the health module for #3.

## Decision

1. **Per-row `schemaVersion` pin, not a corpus-level pin.** An optional `schemaVersion` int on `commonShape`
   in `knowledge.ts` (absent ⇒ 0). Per-**row** because parallel sessions edit different artifacts and the
   store is *built* to hold mixed-version rows mid-flight — exactly the state the incident hit (16 lagged
   the other 78). A single corpus pin cannot represent "16 at v0, 78 at v1"; a code-only const leaves the
   data unable to say what it conforms to. *Against:* denormalised across all rows (cheap, redundant vs. a
   single pin) and advisory unless something enforces it — which the write-boundary upcaster + the
   version-floor check do.

2. **An ordered, forward-only migration registry** (`packages/core/src/migrations.ts`): `MIGRATIONS` is an
   ordered list of `{ version, name, up(doc) }` transforms operating on JSONB docs (numbered like
   Flyway/Alembic, but the transform is a JS function on a `Record`, not DDL — because the schema that
   changes lives in zod and the data lives inside JSONB). `CURRENT_SCHEMA_VERSION = 1`. Migration #1
   (`seeAlso-to-sources`) retroactively documents the incident migration: references/provenance were already
   enriched, so it is mostly a stamp that defensively drops any residual `seeAlso`.

3. **Pin via auto-upcast at the WRITE boundary (migrate-on-write), not on read.** `upcast(doc)` folds pending
   `up()` transforms (version > the doc's current) in order, then stamps `schemaVersion = CURRENT_SCHEMA_VERSION`,
   *before* `validateLibraryDoc` runs (`upcastAndValidate` in `store.ts`; the pg store calls it in
   `upsertDoc`). A doc authored against an old schema is **forward-migrated, not rejected** — turning the
   incident's #2 ("caught the stragglers by luck") into a system. The classic event-sourcing upcaster runs on
   *read*; ours runs at *write* so the stored projection converges to current (version-floor can be green)
   and validation runs on the *final* shape (the write gate stays strict). Non-structured `LibraryAsset` /
   non-knowledge docs pass through `upcast` unchanged. Paired with an **eager batch migrate**
   (`packages/store/src/batch-migrate.ts`) that drains the tail of rows nobody touches.

4. **No down-migrations; the event log is the backup.** History is append-only (`events.library_event`), so a
   "rollback" is re-projecting a pre-migration doc from its event. The `seeAlso`→`provenance` transform is
   *lossy* (provenance was hand-curated), so a faithful inverse cannot exist regardless. Forward-only +
   re-projectable history is the honest model. *Against:* a one-button re-projection helper is not built yet
   (future work, not claimed).

5. **One shared health module, surfaced where you already look — NOT a new command.** `libraryHealth(docs, opts)`
   (`packages/cli/src/health.ts`, ported from the read-only prototype) is one pure function running five
   checks, feeding three consumers: a **cheap health banner on the existing `storytree library` dashboard**
   (the cosmetic `Library: OK` line made real), a **`--check` flag** for the full per-id report plus a live
   `--pg` run (the one thing CI can't do — the DB is stopped by default), and the **CI green gate**
   ([ADR-0022](0022-ci-green-gate-and-auto-merge.md)) via the offline SEED test. Filesystem and the
   generated-asset count are injected, so the function stays pure and offline-testable.

6. **GATE vs. WARN split.** **schema-conformance, retired-field, version-floor are the GATE** — they are the
   invariant `.strict()` already promises, enforced across the *whole* set, fully in the prove-it-gate spirit
   ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md): a gate refuses, it does not warn). A FAIL on
   any is a non-zero exit. **referential-integrity and count-reconciliation start as WARN** — graph/derivation
   invariants with benign transient violations (a `doc:` target legitimately moves during an ADR rename; the
   views lag a data edit by one regenerate) — and **graduate to GATE** once the corpus is clean. Naming both
   sides: a gate that fires on benign drift trains people to bypass it; a warn that never graduates is noise.
   (Dangling `asset:` pointers are already a FAIL, since an intra-Library graph break is never benign.)

7. **A `schema_migration` ledger + batch-migrate.** `events.schema_migration (version PK, name, applied_at,
   actor)` is the append-only, human-facing "which migration ran + when + by whom" audit, complementing the
   per-row stamp (the two answer different questions: the stamp says *what a doc conforms to*, the ledger says
   *what the operator ran*). The batch-migrate script reads every live artifact, runs `upcast`, re-upserts
   only the rows whose version changed (idempotent; non-destructive — deliberately unlike
   `load-corpus.ts --force`, which reverts CLI edits), and records the ledger row.

## Consequences

- A schema change can no longer silently leave un-migrated data behind: the GATE checks fail-closed in CI and
  `pnpm gate`, and a concurrently-authored old-shape doc is auto-forwarded on its next write instead of
  rejected. The incident's #1/#2/#3 are closed in mechanism.
- The Library now carries a denormalised `schemaVersion` on every structured row (94 stamped via
  `apps/studio/data/stamp-schema-version.mjs`) and a per-version ledger row in the live DB.
- Migration code accretes forever (every historical `up()` is permanent) — accepted, the registry is tiny.
- Offline CI cannot see live out-of-band drift (a hand-edit straight to the DB); only an occasional operator
  `storytree library --check --pg` does — by design, not every push.
- Re-projection-as-rollback is named but not yet tooled.
- The `oq-adr-0014-draft` dangling-citation the prototype surfaced was repointed in this change (commit
  36b5237): the reference `doc:decisions/0018-resolve-knowledge-open-questions.md` (a non-existent file)
  now points at the real `doc:decisions/0018-knowledge-tier-phase1-structured-source.md` (ADR-0018, the
  open-question → ADR resolution flow the unit intends). A stale filename slug, not a stale unit. The seed
  + `assets.json` and the live DB row were corrected; the referential-integrity sweep now reports 0 dangling
  pointers. (Originally flagged as an owner call / out of scope; resolved here since the intent was
  unambiguous and the fix is non-lossy.)

## References

- [`docs/research/library-schema-migrations-and-health-checks.md`](../research/library-schema-migrations-and-health-checks.md)
  (the design note this implements) + `docs/research/library-doctor-prototype.mjs` (the read-only prototype the
  health module was ported from).
- [ADR-0017](0017-cross-cutting-knowledge-tier.md) (event-sourced JSONB Library — the upcaster +
  re-projectable history are native to it); [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (DBOS
  deferred — *why* non-atomic, parallel, per-row migration is the design constraint);
  [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (the prove-it-gate spirit the GATE checks share);
  [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the green gate the SEED test plugs into);
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md) (the CLI surface the banner + `--check` extend).
- `packages/core/src/migrations.ts`, `packages/core/src/store.ts` (`upcastAndValidate`),
  `packages/cli/src/health.ts`, `packages/store/src/batch-migrate.ts`, `packages/store/src/schema.sql`
  (`events.schema_migration`), `apps/studio/data/stamp-schema-version.mjs`.
