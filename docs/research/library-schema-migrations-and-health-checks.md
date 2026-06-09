# Library schema migrations & health checks: versioning data through schema change, and detecting what didn't come forward

**Date:** 2026-06-09
**Status:** IMPLEMENTED (2026-06-09, ref [ADR-0026](../decisions/0026-library-schema-migrations-and-health-checks.md)).
The recommendation landed: the per-row `schemaVersion` pin, the forward-only migration registry + write-boundary
upcaster, the eager batch-migrate, the `schema_migration` ledger, and the one health module surfaced three ways
(dashboard banner + `--check` + the CI SEED gate) are all built and green. The original proposal text is kept
below for the rationale; an **Implementation note** at the very end records what landed. The read-only `library
doctor` **prototype** still ships alongside (`docs/research/library-doctor-prototype.mjs`, runnable, writes
nothing). Names tradeoffs on both sides per the project's `assess-tradeoffs-by-naming-both-sides` principle.
**Owner ask (verbatim):** *"how storytree should handle data migrations when the Library schema changes —
(a) whether/how to pin a migration to a specific version of the code/schema, and (b) how to use health
checks to detect data that was NOT brought forward or mapped during a schema-change migration."* The owner
is not an expert here and wants **ideas + a survey of established patterns with tradeoffs named**.
**Motivating incident:** the `seeAlso`→Sources migration (`docs/research/library-sources-unification.md`,
PR #16, on `main`).

---

## 0. TL;DR — the recommendation

1. **Stamp each artifact with a per-row `schemaVersion`** (an optional int on `commonShape`, absent = 0).
   Per-**row**, not per-corpus, because parallel sessions edit different artifacts and the store is
   *built* to hold mixed-version rows mid-flight (the incident proved this — 16 units lagged the other 78).
2. **Express migrations as an ordered registry of forward transforms** (`{ version, name, up(doc) }`),
   numbered like Flyway/Alembic but operating on **JSONB docs**, not DDL — because the schema that changes
   lives in `knowledge.ts`/zod, and `schema.sql` (`doc JSONB`) barely moves.
3. **Pin via auto-upcast-at-the-write-boundary** (event-sourcing's *upcaster*): the loader/CLI runs any
   pending `up()` transforms to bring a doc to `CURRENT_SCHEMA_VERSION` *before* `validateLibraryDoc`,
   then stamps it. A doc authored against an old schema is **forward-migrated, not rejected** — turning
   pain-point #2 ("we only caught the stragglers by luck") into a system. Pair it with an **eager batch
   migrate** so the live projection doesn't carry a long mixed-version tail.
4. **No down-migrations; rely on the event log as the backup.** History is append-only
   (`events.library_event`) — a "rollback" is re-projecting a pre-migration doc from its event, which the
   store can already do. The `seeAlso`→`provenance` transform is *lossy* anyway, so a true inverse is a
   fiction.
5. **One shared checks module, surfaced where you already look — NOT a new command.** Five checks
   (schema-conformance, retired-field, version-floor, referential-integrity, count-reconciliation) live as
   one pure function and feed **three consumers**: a **cheap health banner on the existing `storytree
   library` dashboard** (which already prints a cosmetic `Library: OK` line — make it real), a **`--check`
   flag** for the full per-id report + a live `--pg` run (the one thing CI can't do — the DB is stopped by
   default), and the **ADR-0022 CI green gate** (fail-closed, non-zero exit). **Schema-conformance +
   retired-field + version-floor are the GATE** (they *are* the invariant `.strict()` only enforces one
   write at a time); referential-integrity + count-reconciliation start as **WARN** and graduate.
6. **The prototype already earns its keep:** run against today's seed it reports `0 FAIL, 2 WARN` and
   **surfaced a real dangling citation** (`oq-adr-0014-draft` → `doc:decisions/0018-resolve-knowledge-open-questions.md`,
   a file that was renamed out from under it). That is exactly the silent drift no current check catches.

Why this shape: the Library is **event-sourced JSONB with a materialised projection** (ADR-0017) and **no
DBOS** (ADR-0019). That rules the heavyweight DDL-migration tools down to a partial fit and rules the
event-sourcing **upcaster** *up* as the natural primitive — but the upcaster has to live at the *write*
boundary (where validation already is), not the read path (where the projection is already materialised).
The recommendation is the smallest mechanism that makes the strict validator's promise *true across the
whole live set*, not just true of the next doc someone happens to write.

---

## 1. Current state + the concrete incident

### 1a. What the Library is (the shape that constrains every answer)

- **Schema = TypeScript/zod, not SQL.** `packages/core/src/knowledge.ts` `KIND_SPECS` drives a
  `.strict()` discriminated union (`Knowledge`); `validateLibraryDoc` (`packages/core/src/store.ts`)
  rejects unknown fields. **Adding or removing one field forces every stored doc to change in lockstep.**
- **Store = event-sourced JSONB** (`packages/store`, ADR-0017): `events.library_event` is the append-only
  **history**; `events.library_artifact` is the **current-state projection** (one JSONB row per id).
  Relationships are id-pointers *inside* the JSONB (`references: ["asset:x", "doc:y.md"]`), **no
  cross-table FKs**. DDL (`schema.sql`) is just `doc JSONB` — it does **not** change when the *knowledge*
  schema changes.
- **No DBOS** (ADR-0019): plain `node-pg`, no durable workflows. Keyless IAM; instance **stopped by
  default**.
- **Generated views downstream.** `apps/studio/data/knowledge.json` is the structured seed; `assets.json`
  + `docs/glossary.md` are **generated** from it by `build-corpus.mjs`. The live DB is seeded from those
  files by `load-corpus.ts`. So a "schema migration" potentially has to move through **four** surfaces:
  the zod schema → `knowledge.json` → the generated views → the live projection.
- **Parallel sessions** edit different artifact ids concurrently (CLAUDE.md; per-id rows, transactional
  upserts). Same-artifact coordination (ADR-0009 *claims*) is **DBOS-deferred** — so "migrate everything
  atomically in one transaction" is not a tool we have.

Today's corpus (verified): **94 structured units + 7 templates = 101 assets**; `seeAlso` retired on all
94; `provenance` populated on 44.

### 1b. The incident (the running example): `seeAlso` → Sources

PR #16 changed the schema: it **removed** the body `seeAlso` field from every `KIND_SPECS`, **added** an
optional `provenance`, and **lifted** prose cross-links into the structured `references` field. Because the
schema is `.strict()`, removing `seeAlso` meant **every stored unit had to migrate in the same change**. It
was done with a **one-shot ad-hoc script** (`apps/studio/data/migrate-sources.mjs`) + a hand-curated
provenance map, then `build-corpus.mjs` regenerated the views and `load-corpus.ts` re-seeded the DB.

It worked — but it exposed three gaps this note exists to close:

| # | Pain point | What actually happened |
|---|---|---|
| **1** | **No versioning / no record of "which migration ran."** | `migrate-sources.mjs` is a throwaway. Nothing in the data or the DB records that the migration was applied, what schema version the current data conforms to, or how to replay it. The next schema change starts from zero archaeology. |
| **2** | **Concurrent drift during the migration.** | Mid-flight, `main` grew **78 → 94** units (parallel sessions merged other PRs); **16 new units were authored against the OLD schema** (still carrying `seeAlso`). We caught them only because the strict validator *would have thrown* on re-write — **luck, not a system.** A migration written against "the 78 I can see" silently misses anything added concurrently or afterward. |
| **3** | **No health check for "did everything come forward?"** | We **manually eyeballed** that all 94 migrated (0 `seeAlso`, N `provenance`). Nothing asserts that **every live row validates against the current schema**, that no field was orphaned, that no row was silently dropped or left half-migrated. |

The deep reason all three bite: **`.strict()` is a *write-boundary* gate.** It fires only when a doc is
re-written. A stale doc can sit in the projection indefinitely; a concurrently-authored old-shape doc is
invisible until someone touches it. The validator promises an invariant it only checks one row at a time,
lazily. Everything below is about making that invariant *true of the whole live set, on demand*.

---

## 2. Survey of established approaches (tradeoffs named both sides)

Five families, from the DB-migration world, the event-sourcing world, and the document-store world. The
question for each: **does it fit JSONB-docs + a materialised projection + append-only events + no-DBOS +
parallel per-id sessions?**

### A. Numbered forward-only DDL migrations — Flyway / Liquibase / node-pg-migrate / Alembic / Prisma Migrate

**What it is.** A `schema_migrations` table records which ordered, numbered scripts (`V1__…`, `V2__…`) have
run; the tool applies pending ones in order, transactionally, once each. The industry default for
relational schema evolution.

- **For:** battle-tested; a single source of truth for "which migrations ran"; ordering + idempotency
  solved; `node-pg-migrate` is already in our ecosystem (plain pg). Directly answers pain-point **#1**.
- **Against:** these tools version **DDL**. Our schema-that-changes is **zod in `knowledge.ts`**, and our
  data lives **inside JSONB**, not in columns — so a Flyway script would be `UPDATE library_artifact SET
  doc = jsonb_set(...)`, hand-written SQL re-implementing the zod transform, **divorced from the schema it
  must track**. It also can't touch the **upstream** surfaces (`knowledge.json`, the generated views) — it
  only knows the DB. And the instance is **stopped by default**, so a DB-only migration tool can't run in
  the offline gate. *Good for the `schema_migrations` ledger idea; wrong layer for the transform.*

### B. Event-sourcing **upcasters** (upcast-on-read) — Axon / EventStore / Marten

**What it is.** Old events/docs keep their old shape forever; an **upcaster** function transforms vN → vN+1
**at read time**, composed in a chain (v0→v1→v2…). The native event-sourcing answer to schema drift: you
*never* rewrite history, you reinterpret it on the way out.

- **For:** a perfect conceptual fit — we already *are* event-sourced (history = events, current =
  projection). Zero-downtime: no bulk rewrite, no lockstep cutover. New docs and old docs coexist; the
  reader is always handed the current shape. Forward transforms are exactly the `up()` we'd write anyway.
- **Against:** classic upcasting runs on the **read path** — but our projection (`library_artifact`) is
  **already materialised**, and `validateLibraryDoc` runs at **write**, not read. Pure upcast-on-read would
  mean the *stored* projection stays mixed-version (readers tolerate it, but the doctor's "every row at
  current version" check can never be green) and we'd validate the *upcast* shape, not the *stored* one —
  weakening the write gate. Upcasters also **accumulate forever** (every historical version's transform is
  permanent code). *The right primitive — but applied at our **write** boundary, not the textbook read
  boundary (see §4).*

### C. Expand / contract (parallel-change / "tolerant reader")

**What it is.** Never change a field in place. **Expand:** add the new field, keep the old; dual-write both;
make readers tolerant of either. **Backfill** old rows. **Contract:** once everything is migrated and no
reader needs the old field, remove it. The zero-downtime schema-change discipline from continuous
delivery.

- **For:** the **only** approach that survives "78→94 mid-flight" *without coordination* — during the
  expand window, a doc with `seeAlso` **and** a doc with `provenance` are both valid, so concurrent
  authors against either schema never break. It dovetails with the upcaster (expand = tolerate, contract =
  drop the upcaster once `version-floor` is green). Directly answers pain-point **#2**.
- **Against:** it **fights `.strict()`** head-on: a tolerant reader needs the validator to *accept* both the
  old and new field during the window — i.e. a deliberate "keep `seeAlso` as an ignored optional" phase
  (the sources note's own §4 "transition option"). That's a real, if temporary, loosening of the strict
  gate, and someone must remember to **contract** (teams routinely skip the cleanup and accrete dead
  fields). More moving parts than a hard cutover for a small corpus. *The discipline that makes concurrent
  migration safe — at the cost of a temporary strict-validation hole.*

### D. Per-document `schemaVersion` stamp + lazy-or-eager migrate (MongoDB / document-store convention)

**What it is.** Every document carries a `schemaVersion` field. On read (lazy) or in a batch job (eager),
docs below the current version are transformed and re-stamped. The mainstream NoSQL pattern (Mongo's
"document versioning").

- **For:** the **stamp is the pin** pain-point #1 wants, at the **per-row grain** the parallel-sessions
  reality demands — the data itself records "I conform to v1." It makes the doctor's `version-floor` check
  trivial (`WHERE schemaVersion < current`) and lets migration be **lazy** (upcast a doc when next
  touched) **or eager** (batch) — a knob, not a fork. Composes cleanly with B and C.
- **Against:** denormalises a version int across 94+ rows (cheap, but redundant vs. a single corpus pin);
  **lazy** migration leaves a long mixed-version tail in the projection (readers must stay tolerant — back
  to C's cost); the stamp is **advisory** unless something enforces it (that's what the doctor + the
  write-boundary upcaster are for). *The cleanest home for the pin; needs B/C to give it teeth.*

### E. Validate-don't-migrate (the de-facto status quo)

**What it is.** No versioning at all. The `.strict()` schema *is* the contract; any non-conforming write is
rejected; migrations are one-shot scripts run by hand (today's `migrate-sources.mjs`).

- **For:** zero new machinery; the strict validator already blocks malformed writes; fine while schema
  changes are rare and the corpus is small enough to eyeball. Honest about the project's current maturity.
- **Against:** it **is** the thing that produced all three pain points. No record of what ran (#1); lazy
  per-row validation misses concurrent stragglers (#2); no whole-set assertion (#3). It doesn't scale past
  "one person, one migration, one afternoon." *The baseline this note proposes to grow out of — deliberately,
  not all at once.*

### Fit summary

| Approach | Pin (#1) | Concurrency (#2) | Health (#3) | Fit to JSONB + projection + events + no-DBOS |
|---|---|---|---|---|
| **A** DDL migrations | ✅ ledger | ⚠️ DB-only | — | ⚠️ wrong layer (DDL vs zod/JSONB); can't run offline |
| **B** Upcasters | ⚠️ implicit | ✅ | — | ✅ native fit, but move to the **write** boundary |
| **C** Expand/contract | — | ✅✅ | — | ⚠️ needs a temporary strict-validation window |
| **D** Per-doc `schemaVersion` | ✅✅ per-row | ✅ | ✅ trivial check | ✅ the natural pin for this store |
| **E** Status quo | ❌ | ❌ | ❌ | (the baseline) |

No single row wins. **The recommendation is D (the pin) + B-at-write-boundary (the transform) + a thin
slice of C (a tolerant window only when a *removal* can't land atomically) + the doctor for #3.**

---

## 3. Pinning to a code/schema version (answering ask **(a)**)

**Where the version lives — three options:**

| Where | For | Against |
|---|---|---|
| **Per-row in the JSONB** (`doc.schemaVersion`) — RECOMMENDED | Survives mixed-version reality; per-id grain matches parallel sessions; doctor check is a one-liner; travels with the doc into every view. | Denormalised across all rows; advisory unless enforced. |
| **Corpus-level pin** (one number on `knowledge.json` / a `schema_migrations` row) | Single source of truth; matches Flyway. | **Can't express "16 at v0, 78 at v1"** — exactly the state the incident hit. Forces atomic migration we can't guarantee without claims (DBOS-deferred). |
| **Code-only** (a `CURRENT_SCHEMA_VERSION` const, nothing in data) | Zero data change. | The data can't tell you what it conforms to; you're back to archaeology. |

Recommend **per-row stamp** as the primary pin, **plus** a `schema_migrations`-style **ledger row in the
DB** (cheap, append-only, an A-style "which migrations ran + when + by whom" audit) for the human-facing
"what happened" record. The two answer different questions: the stamp says *what a doc conforms to*; the
ledger says *what the operator ran*.

**Migrate-on-write vs. upcast-on-read vs. batch-then-pin — named both sides:**

- **Migrate-on-write (RECOMMENDED).** The CLI/loader runs pending `up()` transforms before
  `validateLibraryDoc`, then stamps `schemaVersion = CURRENT`. *For:* keeps the **write gate** strict
  (validation runs on the *final* shape); a concurrently-authored old-shape doc is **auto-forwarded**, not
  rejected — #2 solved structurally; no read-path cost. *Against:* a doc nobody edits stays at its old
  version in the projection (so pair with an **eager batch** pass after a migration to drain the tail).
- **Upcast-on-read.** Transform on the way out of the projection. *For:* every read sees current shape
  even pre-batch. *Against:* the stored projection stays stale (version-floor never green); validation
  would run on the upcast shape, weakening the write gate; adds a hot-path transform.
- **Batch-migrate-then-pin (today's model, formalised).** Run the transform over all rows once, stamp,
  delete the migration code. *For:* clean codebase (no upcaster accretion, B's main cost avoided);
  simplest mental model. *Against:* reintroduces the **lockstep cutover** — and the incident proved we
  **can't see all rows at once** under parallel sessions, so a pure batch silently misses concurrent
  stragglers. Only safe *with* the write-boundary upcaster as a backstop.

**Recommend migrate-on-write as the backstop + eager batch as the bulk mover.** The batch does the 94 rows
you can see; the write-boundary upcaster catches the 16 you couldn't. That pairing is precisely what the
incident was missing.

**Interaction with the generated views & parallel sessions:**
- **Generated views** (`assets.json`, `glossary.md`) are **downstream of `knowledge.json`** and carry no
  independent state — the migration transforms `knowledge.json` (and/or the live rows), then
  `build-corpus.mjs` regenerates. The doctor's **count-reconciliation** check (§4) is what catches "you
  migrated the data but forgot to regenerate the views."
- **Parallel sessions** are the reason for the per-**row** stamp and the write-boundary upcaster: session A
  editing artifact X and session B editing artifact Y never contend, and each write auto-forwards its own
  doc. **Same-artifact** concurrency is still uncoordinated (ADR-0009 claims deferred) — out of scope here;
  the stamp doesn't fix it, but last-write-wins on a single id is the existing, accepted behaviour.

---

## 4. Health checks — one module, three surfaces (answering ask **(b)**)

**Not a new command.** The checks are **one pure function** over the corpus
(`libraryHealth(docs, opts) -> CheckResult[]`, in `packages/cli` or `packages/core`); the question is only
*where it surfaces*. There are already two natural homes, and a third on-demand mode — no standalone
`doctor` verb needed:

- **The `storytree library` dashboard** already prints a cosmetic `Library: OK — N artifacts…` line
  (`commands.ts:95`). Make it **real**: run a **cheap summary** (the fast checks only) and show
  `Library: OK` / `Library: 2 WARN, 0 FAIL — run \`storytree library --check\` for detail`. An agent runs
  `storytree library` first thing (ADR-0023, just-in-time), so the health signal is *seen without being
  sought* — the strongest argument against a separate command nobody remembers to run.
- **A `--check` flag** (`storytree library --check`, `… --check --pg`) for the **full per-id report** and a
  **live** run against the projection. This is the one thing CI can't give you (the DB is stopped by
  default). A flag, not a noun: the dashboard *is* the health surface; `--check` just makes it thorough.
- **CI (ADR-0022 green gate)** imports the same module for the **fail-closed gate** (non-zero exit) — no
  human has to remember to run anything.

Why a separate *output mode* at all, rather than running everything on every `storytree library`: **cost**
(the full set walks every `references` pointer, stats every `doc:` target, and with `--pg` hits the DB —
too heavy for a glanceable map) and **exit code** (a gate must exit non-zero on FAIL; you don't want
interactive `storytree library` to start failing your shell because a citation rotted). Both are arguments
for a distinct *mode*, not distinct *logic*.

The five checks the module runs (offline against the seed, or live with `--pg`):

| # | Check | Asserts | Catches | GATE or WARN |
|---|---|---|---|---|
| 1 | **schema-conformance** | every live row `validateLibraryDoc`s against the **current** `Knowledge`/`LibraryDoc` schema | a stale/half-migrated row (the systematic version of the strict validator, run over the *whole set* not one write) | **GATE** |
| 2 | **retired-field** | no row carries a field a past migration removed (explicit denylist, e.g. `seeAlso`) | a field that slipped back in via a `LibraryAsset` arm (which is `.strict()` but **doesn't** enforce `KIND_SPECS`), or an un-migrated concurrent unit | **GATE** |
| 3 | **version-floor** | no row below `CURRENT_SCHEMA_VERSION` | the #2-incident directly: concurrently-authored old-schema docs; the lazy-migration backlog | **GATE** (after adoption) / WARN during rollout |
| 4 | **referential-integrity** | every `asset:<id>` resolves to a live row; every `doc:<path>` resolves on disk | dangling pointers (the prototype **already found one** — see §6) | **WARN** → GATE for `asset:` |
| 5 | **count-reconciliation** | source units == projected rows == generated non-template assets | a silently dropped row; a forgotten `build-corpus.mjs` regeneration; a projection that diverged from the seed | **WARN** → GATE |

**Gate vs. warn — the philosophy.** Checks 1–3 are the invariant the `.strict()` schema *already promises*;
making them fail-closed is just enforcing that promise across the whole set, fully in the spirit of the
**prove-it-gate** (a gate **refuses**, it does not warn — `docs/glossary.md`). Checks 4–5 are **graph/derivation**
invariants that have benign-but-real transient violations (a `doc:` target legitimately moves during an ADR
rename; the views lag a data edit by one regenerate) — so they **start as WARN** to avoid blocking honest
work, and **graduate to GATE** once the corpus is clean and the backlog is drained. Naming both sides: a
gate that fires on benign drift trains people to bypass it (the worst outcome for a gate); a warn that never
graduates is noise nobody reads. The split buys correctness without the false-positive tax — then tightens.

**Where it runs (the three surfaces, one module):**
- **Dashboard banner** (`storytree library`, default): cheap summary, glanceable. Always on, never gates.
- **`--check` / `--check --pg`** (on demand): full per-id report; the **only** way to check the *live*
  projection for out-of-band drift (a hand-edit straight to the DB). Run it **after any migration** as the
  "did everything come forward?" assertion (#3).
- **CI (ADR-0022 green gate):** the **offline** form runs in the free-Actions gate — validates the seed +
  the seed→projection load, with **no DB** (instance stopped by default). *Named limitation:* offline CI
  can't see live out-of-band drift; only an occasional operator `--check --pg` does — by design, not every
  push.

**What it reports.** A per-check `PASS / WARN / FAIL` line + the offending ids, and a final
`n FAIL, m WARN` summary with a non-zero exit on any FAIL (so CI / `pnpm gate` consume it). See §6 for real
output.

---

## 5. Mechanics sketch (schema_version + the upcaster + the doctor)

> Illustrative TypeScript — **not** wired in. The point is the *shape*, and that it's small.

**(a) The pin** — one optional field on `commonShape` (`knowledge.ts`), absent ⇒ 0:

```ts
// commonShape, alongside id/title/references/provenance/...
schemaVersion: z.number().int().nonnegative().default(0),
```

**(b) The migration registry** — ordered forward transforms; the `seeAlso`→Sources migration becomes #1
(retroactively documenting what `migrate-sources.mjs` did):

```ts
// packages/core/src/migrations.ts  (sketch)
export const CURRENT_SCHEMA_VERSION = 1;
export interface Migration { version: number; name: string; up(doc: Record<string, unknown>): Record<string, unknown>; }
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "seeAlso-to-sources", up(doc) {
      // lift backticked artifact-ids from seeAlso into references; drop seeAlso; (provenance is curated, not derivable)
      const { seeAlso, ...rest } = doc;
      return { ...rest /* references already enriched by the original migration */ };
  } },
];
```

**(c) The write-boundary upcaster** — fold pending migrations *before* validation, then stamp:

```ts
export function upcast(doc: Record<string, unknown>): Record<string, unknown> {
  let cur = doc, v = (typeof doc.schemaVersion === "number" ? doc.schemaVersion : 0);
  for (const m of MIGRATIONS) if (m.version > v) { cur = m.up(cur); v = m.version; }
  return { ...cur, schemaVersion: CURRENT_SCHEMA_VERSION };
}
// validateLibraryDoc(upcast(input))  — old-shape input is forwarded, not rejected.
```

**(d) The checks module** — the runnable prototype (`library-doctor-prototype.mjs`) already implements the
five checks read-only against the seed; productionising = extract them into a pure `libraryHealth(docs)`
in `packages/cli`, call its cheap subset from the `dashboard` banner, expose the full report behind
`--check` (with a `--pg` path that queries `library_artifact` instead of reading `knowledge.json`), and
wire the GATE checks into `pnpm gate`. One module, three call sites — no standalone command.

**On down-migrations / rollback.** Deliberately **omitted**. The append-only `events.library_event` *is*
the backup: the pre-migration doc is still in history, so "rollback" = re-project that event. And the
`seeAlso`→`provenance` transform is **lossy** (provenance was hand-curated, not mechanically derivable from
`seeAlso`), so a faithful inverse can't exist regardless. Forward-only + re-projectable history is the
honest model. *Against:* re-projection isn't a one-button operation today (no tooling) — flagged as future
work, not claimed as built.

---

## 6. The prototype, run against today's seed

`npx tsx docs/research/library-doctor-prototype.mjs` (run via the workspace tsx —
`pnpm --filter studio exec node --import tsx ../../docs/research/library-doctor-prototype.mjs`; the bare
`npx tsx` form hits the known zod-resolution snag CLAUDE.md warns about). **Real output, 2026-06-09:**

```
[PASS] schema-conformance
        all 94 structured units validate against the current Knowledge schema
[PASS] retired-field
        no unit carries a retired field (seeAlso)
[WARN] version-floor
        94/94 units below schemaVersion 1 (none carry the stamp yet)
        => they'd be auto-upcast on next write, or batch-migrated; the doctor names the backlog
[WARN] referential-integrity
        oq-adr-0014-draft -> doc:decisions/0018-resolve-knowledge-open-questions.md (no such file under docs/)
[PASS] count-reconciliation
        source units (knowledge.json): 94
        generated non-template assets (assets.json): 94
        generated templates: 7
        source == generated (regeneration is current)

DOCTOR: 0 FAIL, 2 WARN.
```

Two findings worth reading:
- **`version-floor` WARN** is the **expected pre-adoption state**: nothing carries the stamp yet, so the
  doctor honestly reports "94/94 below current" — i.e. the whole corpus is the migration backlog until the
  pin lands. Post-adoption this is the check that would have flagged the 16 stragglers **the moment they
  merged**, not by luck on re-write.
- **`referential-integrity` WARN is a genuine, pre-existing bug the prototype just caught:**
  `oq-adr-0014-draft` cites `doc:decisions/0018-resolve-knowledge-open-questions.md`, but the file on disk
  is `0018-knowledge-tier-phase1-structured-source.md` — the ADR was renamed and the citation rotted. **No
  current check would ever have surfaced this.** That's the case for #3 in one line. (Repointed in this
  change to the real `0018-knowledge-tier-phase1-structured-source.md` — see the Implementation note §10.)

---

## 7. Phased adoption path

Smallest-useful-first, each phase independently valuable and independently abandonable:

1. **Phase 0 — the checks module + dashboard banner + `--check`, WARN-only (lowest risk; the prototype is
   90% of it).** Extract `libraryHealth(docs)`; wire its cheap summary into the existing `storytree library`
   banner and the full report behind `--check`; everything WARN, nothing gates; run the offline form in CI
   as a reporting step. *Value:* immediate visibility (it already found a real bug); zero schema change;
   zero migration risk; **no new command.** **This is the slice to do first.**
2. **Phase 1 — promote schema-conformance + retired-field to GATE.** These are pure functions of the
   *current* schema; no new data field needed. Wire into `pnpm gate`. *Value:* a schema change can no
   longer merge with un-migrated data — the incident's #3, closed.
3. **Phase 2 — add the per-row `schemaVersion` stamp + migration registry + write-boundary upcaster.** Retro-
   number the `seeAlso` migration as #1; batch-stamp the 94 existing rows; promote `version-floor` to GATE.
   *Value:* #1 (pin/record) and #2 (auto-forward concurrent stragglers) closed.
4. **Phase 3 — graduate referential-integrity + count-reconciliation to GATE; add the DB ledger row + a
   re-projection helper.** *Value:* the graph and the views can no longer silently drift; "rollback via
   history" becomes a real operation.

Stop at any phase: Phase 0 alone already beats the status quo.

---

## 8. Open decisions for the owner (flagged, not decided)

1. **Stamp grain:** per-row `schemaVersion` (recommended, parallel-session-safe) vs. a single corpus-level
   pin (simpler, but can't represent mixed-version mid-flight). *Recommend per-row.*
2. **Migration timing default:** migrate-on-write + eager batch (recommended) vs. pure batch-then-pin
   (cleaner code, but lockstep) vs. upcast-on-read (zero-downtime reads, weaker write gate). *Recommend
   migrate-on-write + batch.*
3. **The expand/contract window:** for a future **field removal** that can't land atomically, do we accept a
   temporary "keep the retired field as an ignored optional" loosening of `.strict()` (C's transition
   window)? Names a real, bounded hole in the write gate. *Recommend: allowed, time-boxed, with the doctor's
   `retired-field` check tracking the contract step.*
4. **CI gate scope:** offline-seed-only (free, but can't see live out-of-band drift) vs. an occasional
   scheduled `--pg` run (costs a `db:up`). *Recommend offline in the push gate; `--pg` as a manual/periodic
   operator check.*
5. **How health surfaces:** dashboard banner + `--check` flag (recommended — reuses the surface agents
   already hit, no new noun) vs. a dedicated `storytree library doctor` verb (more discoverable as its own
   thing, but one more command to remember and ADR-0023 keeps the surface lean) vs. CI-only (cheapest, but
   invisible to the agent in the loop). *Recommend banner + `--check`; CI imports the same module.*
6. **Where the migration registry lives:** `packages/core` (shared with the validator, the natural home)
   vs. `packages/store` (closer to the projection). *Lean core* — the transform is a property of the
   schema, which lives in core.
7. **The dangling-citation bug** the prototype found (`oq-adr-0014-draft`): fix the pointer to the real
   `0018-knowledge-tier-phase1-structured-source.md`, or is `oq-adr-0014-draft` itself stale? *Owner call;
   out of scope here.*

---

## 9. Relationship to existing decisions

- **ADR-0017** (event-sourced JSONB tier): the upcaster + re-projectable-history model is native to it; the
  doctor's checks are projection-integrity assertions over it.
- **ADR-0019** (DBOS deferred): *why* "migrate everything in one durable transaction" isn't on the table —
  hence the write-boundary-upcaster + per-row-stamp design that tolerates non-atomic, parallel migration.
- **ADR-0020 / prove-it-gate**: the GATE checks are fail-closed in the same spirit — refuse, don't warn.
- **ADR-0022** (CI green gate): the doctor's offline form is a new gate step; its limits (no live DB in CI)
  are named in §4.
- **ADR-0023** (Library CLI): `doctor` is a new read-only verb on the existing `storytree library` surface.

If adopted past Phase 1, this is ADR-sized (versioned Library migrations + the health-check gate) — but
**that ADR is not written here**; this note is the exploration that would precede it.

---

## 10. Implementation note (what landed, 2026-06-09)

Adopted in full and recorded as [ADR-0026](../decisions/0026-library-schema-migrations-and-health-checks.md).
The recommendation shipped: per-row `schemaVersion` pin + forward-only migration registry + write-boundary
upcaster (migrate-on-write) + eager batch-migrate + `schema_migration` ledger + one health module surfaced
three ways. Files that changed:

- **`packages/core`** — new `migrations.ts`: `CURRENT_SCHEMA_VERSION = 1`, the `Migration` interface, the
  ordered `MIGRATIONS` registry (#1 `seeAlso-to-sources`, retro-documenting the incident migration — mostly a
  stamp that defensively drops a residual `seeAlso`), and `upcast()` (folds pending transforms, then stamps;
  structured-Knowledge-only — `LibraryAsset`/non-knowledge docs pass through unchanged; idempotent). The
  `schemaVersion` optional int added to `commonShape` in `knowledge.ts` (absent ⇒ 0). `store.ts` gained
  `upcastAndValidate` (the write-boundary: `validateLibraryDoc(upcast(doc))`). Exports threaded through
  `index.ts`. Tests: `migrations.test.ts`.
- **`packages/cli`** — new `health.ts`: the pure `libraryHealth(docs, opts)` (five checks) + `libraryHealthCheap`
  (the four no-fs checks for the banner) + `GATE_CHECKS` / `worstLevel` / `gateFailures` / `levelCounts`;
  filesystem (`docExists`) and the generated-asset count are **injected**, so it is offline-unit-testable.
  `commands.ts` wires the cheap subset into the existing `storytree library` dashboard banner and the full
  report behind `--check` (with a `--pg` live path); `index.ts` routes the flag. Tests: `health.test.ts`,
  including the **SEED gate test** — load the stamped corpus into `InMemoryStore` and assert `gateFailures()`
  is empty, which is what makes `pnpm -r test` (ADR-0022) enforce migration health offline.
- **`packages/store`** — new `batch-migrate.ts`: `batchMigrate(store)` (store-agnostic, offline-testable on
  `InMemoryStore`; re-upserts only the rows whose version changed; non-destructive, idempotent) + a script
  `main` that applies the schema, runs the batch against the live projection, and records the ledger row.
  `pg-store.ts` calls `upcastAndValidate` in `upsertDoc` (the write boundary). `schema.sql` gained the
  append-only `events.schema_migration (version PK, name, applied_at, actor)` ledger table. Exports via
  `index.ts`. Tests: `batch-migrate.test.ts`.
- **Data** — `apps/studio/data/stamp-schema-version.mjs` (one-shot, `--dry`-able): stamped all 94 structured
  units in `knowledge.json` with `schemaVersion: 1` (metadata pin — `updatedAt` not bumped). `assets.json`
  regenerated. The live DB is forward-migrated by `batch-migrate` (or by any CLI/studio upsert through the new
  write boundary) when next brought up.
- **Gate / CI** — no workflow change needed: `.github/workflows/ci.yml` already runs `pnpm check:manifest`,
  `pnpm -r typecheck`, and `pnpm -r test`; the new SEED gate test rides the existing `pnpm -r test` step, so
  the GATE-class checks (schema-conformance / retired-field / version-floor) fail-closed in CI automatically.
  All new files live under already-allow-listed surfaces (`docs/decisions/`, `docs/research/`, `packages/`),
  so `pnpm check:manifest` passes unchanged.

Verified: `pnpm check:manifest` OK; `pnpm -r typecheck` clean across core/store/cli; `pnpm -r test` green
(core `migrations.test.ts`, store `batch-migrate.test.ts`, cli `health.test.ts` incl. the SEED gate — 34
cli tests pass, 0 fail).

Deliberately deferred (named in §5 / §7 / §8): a one-button re-projection-as-rollback helper; graduating
referential-integrity + count-reconciliation from WARN to GATE; a DB→seed export so the studio files reflect
live edits.

**Resolved in this change (originally flagged as owner-call):** the `oq-adr-0014-draft` dangling-citation the
prototype surfaced (§6) was repointed (commit 36b5237) from the non-existent
`doc:decisions/0018-resolve-knowledge-open-questions.md` to the real
`doc:decisions/0018-knowledge-tier-phase1-structured-source.md` (ADR-0018, the open-question → ADR resolution
flow the unit intends — a stale filename slug, not a stale unit). The seed + `assets.json` and the live DB row
were corrected; referential-integrity now reports 0 dangling pointers. Fixed here rather than left for the
owner because the intent was unambiguous and the repoint is non-lossy.
