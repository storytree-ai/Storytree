---
id: "library"
tier: story
title: "The library tier"
outcome: "An agent grows and curates a schema-validated versioned event-sourced knowledge Library through one choose-your-own-adventure CLI."
status: mapped
proof_mode: UAT
# Agent-exercised end-to-end (every Story UAT leg is _(witness: machine)_), so the story is
# machine-witnessed — overrides the ADR-0040 fail-closed `human` default, no operator signpost.
uat_witness: machine
capabilities: [library-schema-and-write-validation, migrate-on-write-upcaster, event-sourced-store-seam, eager-batch-migrate, seed-corpus-scripts, library-health-gate, library-cli]
# Consumer-side outbound edge (ADR-0075): the library validates/upcasts every doc against the verdict
# vocabulary's Tier/Status, so it imports the verdict-contract ROOT port — now a declared edge (was an
# exempt substrate dependency before ADR-0075 collapsed that class). library is no longer the graph
# TRUNK; verdict-contract is the bottom root.
depends_on: [verdict-contract]
# Provider-side inbound edge (ADR-0074 §4): the cli HUB organism imports @storytree/library
# (commands.ts validates/upcasts on every write). The store hub also imports it, but that edge is
# declared consumer-side in stories/store/story.md depends_on; the cli edge is declared here to
# de-noise the hub and let this organism own its "wired into the CLI" edge.
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the tier (17/18/19), the CLI (23), migrations + health (26).
decisions: [17, 18, 19, 23, 26]
---

# The library tier

**Outcome —** An agent grows and curates a schema-validated, versioned, event-sourced knowledge Library through one choose-your-own-adventure CLI.

The library tier (ADR-0017 / ADR-0019 / ADR-0023) is the knowledge corpus as a buildable system, spread across three packages: `packages/core` defines the per-kind schema and the migrate-on-write upcaster; `packages/store` is the event-sourced persistence seam (an in-memory reference impl + a Cloud SQL Postgres impl) plus the corpus seeder and the eager batch migrator; `packages/cli` is the agent-facing surface — a guidance-enveloped, `--pg`-gated choose-your-own-adventure CLI — wrapped by a pure health gate that the ADR-0022 CI run enforces offline. Unlike `studio`, this organism has a real, passing, OFFLINE automated test suite that observationally verifies most of its behaviour today (I ran it: `@storytree/core` 48/48 pass, `@storytree/store` 16 pass + 1 live-gated skip, `@storytree/cli` 34/34 pass). EXCLUDED here: `apps/studio` — that is `studio`'s organism, not the library tier.

## What this is

This is storytree's **second story** — and the **first authored with real test evidence**. `studio` (the first) is `status: proposed` because `apps/studio` has **zero** automated tests, so every unit there is a pure retrospective spec. The library tier is different: most of its leaves are covered by **real, passing, offline automated tests** that I verified by running. Per `docs/glossary.md`, a unit "observationally verified by an existing target-repo test suite, **without** storytree driving a red→green flow" is `status: mapped` (brownfield) — a distinct, **weaker** state than `healthy`. storytree's own prove-it-gate (`packages/orchestrator/src/prove-it-gate.ts`) has **not** driven a single one of these proofs; they predate it. So **nothing here is `healthy`** — the honest candidate status for a covered capability is `mapped`, and for an uncovered behaviour `proposed`. Each contract below is marked with whether a REAL passing test currently covers it (citing the test `file:line`) versus a would-be test.

A **story** is a **bounded context** — a self-contained organism (the microservice grain, ADR-0010) — composed of capabilities, and the map grain a newcomer points at (ADR-0002). Under the organism model the proof ladder shifts up one rung: the **story** carries the integrated **UAT**, each **capability** is proven by an **integration test** against real *in-story* collaborators (no stubs within the organism), and each **contract** stays the isolated unit-test leaf (ADR-0010 §2). Every dependency below is a within-story, code-derived edge. This story now **owns one declared cross-story interface** (ADR-0010 §4): the **open-question / proposal authoring path** ([`interface-oq-proposal-authoring.md`](interface-oq-proposal-authoring.md), declared 2026-06-11) — the ADR-0018 OQ→ADR flow that `stories/feedback-graduation`'s `signal-synthesis` will emit through.

See [`../README.md`](../README.md) for the representation and how every field maps to ADR-0002 / `docs/glossary.md`.

## Continuity with v1 (the Agentic corpus)

The library tier is a conceptual port of a proven V1 shape, not a fresh invention. Its architectural **spine** is the V1 `standalone-resilient-library` pattern (`legacy/Agentic/patterns/standalone-resilient-library.yml`): a library that depends only on a minimal, load-bearing floor, is exercised end-to-end by a test that imports it **directly**, sits behind a **thin CLI shim** (parse args → call library → map to an exit code), and **never spawns an LLM subprocess inside the library**. That is exactly this tier's split: `packages/core` + `packages/store` are the library (the schema, the upcaster, the Store seam, the seeder, the health checks), and `packages/cli` is the thin shim — guidance + envelope + `--pg` gate over library calls, with no inference inside the library. The library stays correct "when the rest of the system is in flames" because it is AI-free; agents are *users* of the CLI, never code inside the tier.

Lineage of the v2 capabilities to their V1 ancestors (reference only — the V1 stories are read-only in `legacy/Agentic/stories/`):

| v2 capability | V1 ancestor | what carried |
|---|---|---|
| [`event-sourced-store-seam`](event-sourced-store-seam.md) | story 4 (Store trait + MemStore) + story 5 (SurrealStore) | the narrow Store abstraction proven by **trait-parity testing** — V1 ran story 4's trait-level harness against both `MemStore` and `SurrealStore` to prove the seam was a real abstraction, not a 1-impl stub; the direct ancestor of v2's exported `storeParitySuite()` run against both `InMemoryStore` and `PgLibraryStore`. |
| [`library-schema-and-write-validation`](library-schema-and-write-validation.md) | story 6 (agentic-story YAML loader + schema + DAG check) | validate-at-the-load/write-boundary into a typed value with typed errors, so downstream code never defends against malformed input — here zod-at-write instead of JSON-schema-at-load. |
| [`library-health-gate`](library-health-gate.md) | story 3 (agentic stories health, library + CLI) | a pure health classifier built as a library with a thin CLI on top, whose exit code makes it an enforceable gate rather than a cosmetic inspector. |
| [`library-cli`](library-cli.md) | the `standalone-resilient-library` thin-shim pattern (stories 1 / 3, library + CLI) | the CLI is the dumb shim over the library; business logic lives in the library, the shim only parses, dispatches, and maps to an envelope/exit code. |

What deliberately does **not** carry: V1's Rust crates and `Cargo.toml` dependency-floor mechanics (v2 is TS + pnpm workspaces), the SurrealDB/surrealkv embedded engine (replaced by Cloud SQL Postgres, ADR-0017), and V1's per-build `runs`/`test_runs` evidence grain (this tier persists history-as-events + a current projection, not run rows).

## Capabilities (7)

Listed roots-first (a capability appears after everything it depends on). The `status` column is the honest per-capability call: `mapped` = a real passing offline test observationally verifies the dominant behaviour; `proposed` = no standalone test verifies it yet; the Proof note in each file marks the `proposed` pockets inside a `mapped` capability.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`library-schema-and-write-validation`](library-schema-and-write-validation.md) | Every library artifact is zod-validated at the write boundary against a single per-kind schema source of truth. | mapped | — |
| 2 | [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md) | A library doc authored against an older schema is forward-migrated and version-stamped at the write boundary rather than rejected. | mapped | `library-schema-and-write-validation` |
| 3 | [`event-sourced-store-seam`](event-sourced-store-seam.md) | A narrow Store seam appends every write as a history event and updates a current-state projection atomically. | mapped | `library-schema-and-write-validation`, `migrate-on-write-upcaster` |
| 4 | [`eager-batch-migrate`](eager-batch-migrate.md) | A lagging library doc is bulk forward-migrated in place non-destructively at the store boundary. | mapped | `event-sourced-store-seam`, `migrate-on-write-upcaster` |
| 5 | [`seed-corpus-scripts`](seed-corpus-scripts.md) | The store seeds every studio knowledge unit and template through the validated write boundary. | proposed | `event-sourced-store-seam`, `migrate-on-write-upcaster` |
| 6 | [`library-health-gate`](library-health-gate.md) | Five health checks classify every stored doc into PASS, WARN, or FAIL. | mapped | `library-schema-and-write-validation`, `migrate-on-write-upcaster` |
| 7 | [`library-cli`](library-cli.md) | An agent curates library artifacts through guidance-enveloped, `--pg`-gated commands. | mapped | `event-sourced-store-seam`, `eager-batch-migrate`, `seed-corpus-scripts`, `library-health-gate`, `library-schema-and-write-validation`, `migrate-on-write-upcaster` |

## Dependency graph (code-derived)

These are **within-story** edges, **read off the real source** (static analysis of the imports / calls between capabilities), never hand-drawn from UAT need (ADR-0010 §3): A → B means A's code actually couples to B's code inside the one organism. The graph is acyclic; `library-schema-and-write-validation` is the lone root. One **cross-story** edge applies: `library → verdict-contract` (the schema validates docs against the verdict vocabulary's `Tier`/`Status`), declared `depends_on: [verdict-contract]` since [ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md) made the ports root organisms rather than an exempt substrate class.

- `migrate-on-write-upcaster` → `library-schema-and-write-validation`
  - `migrations.ts:1` imports `KIND_SPECS` from `knowledge.ts` (`isStructuredKnowledge`, `migrations.ts:55-58`, gates on whether the kind is a structured key), and `store.ts:219-221` composes `upcast` INTO the validator: `upcastAndValidate = validateLibraryDoc(upcast(...))` — a genuine code call, not a UAT inference.
- `event-sourced-store-seam` → `library-schema-and-write-validation`
  - `PgLibraryStore.upsertDoc` (`packages/store/src/pg-store.ts:74-125`) validates the doc at its write boundary (`pg-store.ts:83`) before persisting; the in-memory parity contract is the same `validateLibraryDoc` seam that lives in `store.ts`.
- `event-sourced-store-seam` → `migrate-on-write-upcaster`
  - `PgLibraryStore.upsertDoc` calls `upcastAndValidate` (`pg-store.ts:83`) BEFORE its `BEGIN`/`COMMIT` and **persists the upcast output**, so the store seam is a real consumer of the migrate-on-write capability.
- `eager-batch-migrate` → `event-sourced-store-seam`
  - `batchMigrate` (`packages/store/src/batch-migrate.ts:48-66`) is store-agnostic — it `queryDocs()` every live artifact and re-`upsertDoc`s the lagging ones through the `Store` seam (`batch-migrate.ts:3` imports the `Store` type).
- `eager-batch-migrate` → `migrate-on-write-upcaster`
  - `batch-migrate.ts:4` imports `upcast` + `CURRENT_SCHEMA_VERSION` from `@storytree/core` and runs `upcast` on every row, re-upserting only those whose `schemaVersion` actually changed (`batch-migrate.ts:54-56`) — a direct call into the migrate capability.
- `seed-corpus-scripts` → `event-sourced-store-seam`
  - `loadCorpus` (`load-corpus.ts:61-74`) upserts every knowledge unit + template through the `Store` write boundary.
- `seed-corpus-scripts` → `migrate-on-write-upcaster`
  - each `loadCorpus` upsert runs `upcastAndValidate` at the boundary, so a lagging seed unit is upcast on the way in.
- `library-health-gate` → `library-schema-and-write-validation`
  - `health.ts:2` imports `KIND_SPECS` (the structured-kind set, `health.ts:65`) and the schema-conformance check (`health.ts:84-102`) validates each structured doc — a real consumer of the schema capability.
- `library-health-gate` → `migrate-on-write-upcaster`
  - `health.ts:2` imports `upcastAndValidate`; schema-conformance literally calls `upcastAndValidate(bodyOf(d))` per structured doc (`health.ts:89`) — forwards-then-validates, which is why a doc that only NEEDS upcasting still PASSes.
- `library-cli` → `event-sourced-store-seam`
  - `main.ts:5-11` imports `PgLibraryStore` + `InMemoryStore`; `buildStore` (`main.ts:22-30`) swaps the live `PgLibraryStore` in under `--pg` and otherwise seeds an `InMemoryStore` — every read/write rides the store seam.
- `library-cli` → `eager-batch-migrate`
  - `commands.ts:14` imports `renderStoredDoc` from `@storytree/store` (the view path, `viewArtifact` `commands.ts:219`) — the CLI's read corpus is rendered through the eager-migrate capability's render adapter.
- `library-cli` → `seed-corpus-scripts`
  - `main.ts:28` seeds the default offline store via `loadCorpus` — the CLI's read corpus is the seeder's output.
- `library-cli` → `library-health-gate`
  - `commands.ts:17-23` imports the health helpers from `./health.js` for the dashboard banner (`commands.ts:113-121`) and the `--check` report (`libraryCheck`, `commands.ts:171-207`).
- `library-cli` → `library-schema-and-write-validation`
  - `commands.ts:8-13` imports `groupSources` + `KIND_SPECS` + `CURRENT_SCHEMA_VERSION` from `@storytree/core`; the write commands validate every doc at the boundary.
- `library-cli` → `migrate-on-write-upcaster`
  - `newArtifact` (`commands.ts:334`) and `editArtifact` (`commands.ts:429`) both call `upcastAndValidate` on every write — a doc carrying a retired field is upcast, not rejected.

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `library` organism meets its outcome end-to-end against its **real packages** (`@storytree/core`, `@storytree/store`, `@storytree/cli`) — the proof that lives at the story tier (ADR-0010 §2). It is one coherent agent journey: explore the library, view an artifact, validate-and-author on write, run a migration, run the health gate.

> **HONEST status — there is NO scripted UAT today; this is the would-be acceptance walkthrough.** Several legs ARE automatable offline now (and the capability tests below prove them piecewise — citations given inline), but no single scripted end-to-end UAT exists, and the live-DB legs (steps 6–7) are gated behind `STORYTREE_DB_LIVE=1` / `pnpm db:up` and are currently unrun. So the **story's own acceptance proof is would-be** even though its capabilities are mostly `mapped`.

**Goal —** One agent, in one session, grows and curates the library through the real packages: explores the seeded corpus, drills into an artifact, is refused an offline write then validates-and-authors on a writable store, drains the version tail with a migration, and runs the health gate green.

Every leg below is an **agent (machine) exercise**, so each carries `_(witness: machine)_` (ADR-0044 `uat-test-units`, parsed into `library#uat-<n>` ids): the cited automated test *is* the witnessing run, and these legs are **not** awaiting a human's "I saw it work" — they are awaiting a machine attestation against their test id. This is the deliberate correction of the fail-closed default (absent witness ⇒ `either`, which the studio still offers a human flag for); the library journey is exercised by agents, not the operator, so it is declared `machine` end-to-end (frontmatter `uat_witness: machine` to match — the story carries no human-witness signpost).

1. **Seed + explore offline:** _(witness: machine)_ run `pnpm storytree library` (`main.ts` seeds an `InMemoryStore` via `loadCorpus`, then `run()` dispatches to `dashboard`). **Success —** the envelope is `ok:true` with a `Library: OK — N artifacts across M categories` banner (the cheap health checks passed), a per-kind map, and a `next:` block. *(proven shape: `packages/cli/src/cli.test.ts:22-29`)*
2. **Drill into one artifact:** _(witness: machine)_ `pnpm storytree library artifact <id>`. **Success —** `viewArtifact` renders the artifact via the real `renderStoredDoc` (body derived for a structured unit, passed through for a template), with a grouped Sources block, and `ok:true`. *(`cli.test.ts:31-36`)*
3. **Author on write, offline-refused:** _(witness: machine)_ `pnpm storytree library artifact new --json '<doc>'` WITHOUT `--pg`. **Success —** `ok:false` with `writes go to the shared store … run with --pg`, proving the write gate. *(`cli.test.ts:98-104`)*
4. **Validate-on-write (writable):** _(witness: machine)_ with a writable store, `artifact new` a fresh valid doc creates+persists it (`upcastAndValidate` ran at the boundary), a doc with an unknown field is REFUSED with the zod message as guidance (not persisted), and a duplicate id is refused edit-first. **Success —** created on the valid one *(`cli.test.ts:106-113`)*, `ok:false` on the invalid one *(`cli.test.ts:130-135`)*, edit-first refusal on the duplicate *(`cli.test.ts:115-128`)*.
5. **Run a migration:** _(witness: machine)_ against a store holding a lagging v0 doc, run `batchMigrate`. **Success —** it returns `{scanned:N, upgraded:1}`, the v0 doc is stamped to `CURRENT_SCHEMA_VERSION` with the retired field dropped and all other content preserved, and a re-run reports `upgraded:0`. *(offline-automatable against `InMemoryStore` today: `packages/store/src/batch-migrate.test.ts:30-64`)*
6. **Live persistence (gated):** _(witness: machine)_ `pnpm db:up` then `STORYTREE_DB_USER=<iam-email> pnpm storytree library --pg artifact edit <id> --set <field>=<value>`. **Success —** `PgLibraryStore` upcast-validates and writes the artifact transactionally (event + projection) and `--pg` reads reflect it. *(**PROPOSED:** proven only by `packages/store/src/store.test.ts:91-92` under `STORYTREE_DB_LIVE=1`, which is **skipped by default** — currently unrun.)*
7. **Run the health gate:** _(witness: machine)_ `pnpm storytree library --check` (and `pnpm -r test`'s SEED gate). **Success —** `libraryHealth` runs all five checks, `gateFailures()` is EMPTY on the stamped seed so the envelope is `ok:true` (exit 0), while a WARN keeps `ok=true` and a GATE-class FAIL would set exit 1. *(proven: `packages/cli/src/health.test.ts:191-203` for the seed gate, `health.test.ts:162-181` for the gate/warn classification)*

End state — the library is explored, an artifact authored and validated, the version tail drained, and the gate green, all through the real packages.

## Proof

The story now **carries the UAT** (above): under the organism model the integrated acceptance walkthrough lives at the story tier (ADR-0010 §2). The story is proven when that UAT passes against the real organism *and* its capabilities' integration tests and contracts pass underneath it.

**Honest status — `mapped` (brownfield), NOT `healthy`, NOT pure-`proposed`.** This is the load-bearing difference from `studio`:

- **Why `mapped` and not `proposed`:** unlike `apps/studio` (zero tests), the library tier has a **real, passing, offline** automated suite that observationally verifies the dominant behaviour today. I verified by running it: `@storytree/core` **48/48** pass, `@storytree/store` **16 pass + 1 skip**, `@storytree/cli` **34/34** pass. Per the glossary, that observational green is exactly brownfield `mapped`.
- **Why NOT `healthy`:** storytree's own prove-it-gate (`packages/orchestrator/src/prove-it-gate.ts`) has **not** driven a single one of these proofs red→green. They are pre-existing target-repo tests — the glossary's brownfield `mapped`, which "never short-circuits to proven." Re-running these assertions UNDER the gate's red→green flow is the natural next bootstrap step that would upgrade the mapped capabilities to `healthy` (an open call below).
- **The `proposed` regions (do not over-claim):** (1) the whole **`seed-corpus-scripts`** capability is `status: proposed` — `loadCorpus`/`loadComments`/`applySchema` behaviour, the `recordLedger` row, and both entry-guarded `main()`s have only smoke-import / DDL-shape coverage, never a standalone behavioural assertion. (2) the **Postgres transactional behaviour** of `PgLibraryStore` + the IAM `createPool` connection (a `proposed` pocket inside the `mapped` `event-sourced-store-seam`) — proven ONLY by the default-**skipped** live-gated parity run (`store.test.ts:91-92` under `STORYTREE_DB_LIVE=1`); the `InMemoryStore` parity suite proves the *contract* offline but never touches the Pg impl. (3) the CLI's **uncovered branches** (a `proposed` pocket inside the `mapped` `library-cli`) — `--file` reads, malformed-JSON, whole-doc `--json`/`--file` replace, the bad `--set` token, `main`'s `writable=usePg` wiring, and the FAIL/WARN dashboard banner variant (only the OK banner is tested).
- **The STORY's own UAT is unscripted (would-be):** no scripted end-to-end UAT exists, so the organism-level acceptance proof does not exist yet even though its capabilities are mostly observationally verified. Each capability file's Proof blockquote and each contract's `proven by` / would-be marker pin down exactly which leaves are `mapped` vs `proposed`.

## Open modeling calls (for the owner)

Surfaced rather than guessed — load-bearing and easy to revise (plain files).

1. **`proposed`-vs-`mapped` lock (the headline call).** I recommend the story be `status: mapped` because the dominant behaviour has real passing offline tests, with per-capability / per-contract honesty marking the `proposed` pockets. The alternative is to keep the WHOLE story `proposed` for parity with `studio` and reserve `mapped` until the live-DB legs run. This is the load-bearing difference between the two seed stories — confirm the brownfield-`mapped` framing.
2. **`event-sourced-store-seam` is the riskiest `mapped` call.** The in-memory half is genuinely proven offline, but the Postgres half (`PgLibraryStore` transactions, IAM connection) is proven only by the default-**skipped** live-gated parity suite. Options: (a) keep one capability `mapped`-with-a-`proposed`-Pg-pocket (current); (b) split into two capabilities (`in-memory-store-seam` mapped / `postgres-library-store` proposed). I folded them because the parity suite is one EXPORTED contract deliberately reused across both impls — but the split is defensible if you want the live-gated status visible at the capability grain.
3. **`render-doc`'s home (residual from the seed/batch split).** The old `corpus-seed-and-batch-migrate` (which bundled a `mapped` `batchMigrate`+`render-doc` half with a `proposed` `loadCorpus`/`applySchema` seed half — a banned outcome conjunction) is now SPLIT into [`eager-batch-migrate`](eager-batch-migrate.md) (mapped) and [`seed-corpus-scripts`](seed-corpus-scripts.md) (proposed), each with a single-clause outcome. One residual call: `render-doc` (`renderStoredDoc`) is parked in `eager-batch-migrate` by package locality, but its only live consumer is the CLI view path (`commands.ts:14` → `viewArtifact`), NOT `batchMigrate`. Decision: leave it in `eager-batch-migrate` (current — co-resident in `packages/store`) or move it under `library-cli` where it actually code-couples.
4. **`library-cli` as ONE capability vs split read/write** (mirrors `studio`'s `browse-library` vs `author-library-artifact` split). I kept it as one organism because read and write share the same `Envelope` + `run` dispatch + store seam and the write path is `--pg`-gated guidance — but the read slice is fully `mapped` while the write slice has several `proposed` branches, so a split would let the write slice carry its own weaker status. Relevant prior art (see the "Continuity with v1" section): V1's story-8 folding lesson cautions against splitting along the **library-vs-binary** boundary — but read vs write are arguably distinct *user journeys*, which is the axis V1 said to split on, so the V1 evidence cuts both ways and the call stays open.
5. **Whether this story should later be driven through the REAL prove-it-gate to earn `healthy`.** Today nothing here is `healthy` (the gate never drove these proofs). Re-running the existing assertions under storytree's red→green flow would upgrade the mapped capabilities to `healthy` and is the natural next bootstrap step — confirm that is the intended trajectory.
6. **Contract granularity.** Contracts are kept INLINE and sometimes fold sibling assertions onto one `proven by` line range (e.g. `tree-focus-edges` cites `cli.test.ts:64-87` spanning three tests; `misses-are-guidance` spans three). If you want a strict one-contract-one-test mapping, these should be split into separate contracts.
