# storytree — agent onboarding

**New session? Read this first, then `docs/glossary.md` (authoritative terms).** This file is the
one-read orientation; it overrides any stale prose in `README.md`, `.env.example`, or the infra docs.

## What this is

A v2 rebuild of the AgenticEngineering project: a multi-agent system that grows software as a DAG of
**stories**, watched live. Work hierarchy: **story > capability > contract**, split by proof mode
(ADR-0002 / ADR-0010; `docs/glossary.md` is authoritative).

- **TypeScript + Node 24 + pnpm workspaces** (`corepack enable pnpm`; pnpm@9.15.0). Workspaces:
  `packages/*`, `apps/*`.
- The V1 Rust repo is vendored **read-only** at `legacy/Agentic/` (a git submodule) — reference only,
  see "Legacy" below.

## ⚠️ Current state — READ THE REVERSALS FIRST

Much of `README.md` / `.env.example` / `infra/` prose and the older ADRs (0001–0009) describe a
**pre-reversal world**. Five reversals are the current truth; calibrate everything to these:

1. **pi is GONE** (ADR-0011). We **own the agent loop** on the raw Anthropic Messages API
   (`@anthropic-ai/sdk`, Anthropic-only for now). `packages/pi-adapter` is removed; `packages/agent`
   is the real loop.
2. **DBOS is DEFERRED** (ADR-0019, reaffirmed ADR-0020). The store is a **plain typed `node-pg`
   Postgres connection** — no DBOS, no durable workflows yet. DBOS stays a *named, reserved* future
   target. **Trap:** ADR-0011 §5 "DBOS/Postgres durable execution stands" (2026-06-06) is *overtaken*
   by ADR-0019 (2026-06-08) — do not revert wording toward "DBOS stands".
3. **The library/knowledge tier lives in shared Cloud SQL Postgres** (ADR-0017; JSONB docs,
   zod-validated at write; current state = projection, history = events). Git holds code + a
   *generated* markdown view, not the source of artifact state.
4. **The prove-it-gate (red-green) is BUILT**, spine-side (ADR-0020). Don't reinvent or bypass it.
5. **DB auth is KEYLESS** Cloud SQL IAM via ambient ADC (ADR-0021). **Credentials are present** —
   verify with `gcloud auth application-default print-access-token`, do **not** assume you're
   unauthenticated. The Phase-2 library migration has already run (the library is in the live DB).

## The foundation is built and green (do not re-scaffold)

Run `pnpm -r test` before assuming anything is unbuilt. The packages:

- **`packages/core`** — the schema (`schema.ts`, work hierarchy), the library schema
  (`knowledge.ts`), and the foundation types: `proof.ts` (ProofMode/Verdict/SigningRow),
  `signer.ts` (fail-closed identity chain), `model-events.ts` (typed content blocks),
  `store.ts` (the narrow `Store` + `InMemoryStore` + `validateLibraryDoc` + a reusable parity suite).
- **`packages/agent`** — the owned loop (ADR-0011): `model.ts` (the `Model` seam + `ScriptedModel` +
  `AnthropicModel`), `run-turn.ts`, `step.ts` (fail-closed `runStep`/`runStepValidated`),
  `tool-executor.ts`, `fs-tools.ts` (the real local file tool surface — read/write/edit/list/run).
- **`packages/orchestrator`** — the deterministic spine (ADR-0005): `sequence.ts` (`runSequence` /
  `runLoop`, with the *halted-is-never-a-pass* guard), and the **working prove-it-gate** (ADR-0020):
  `phase-machine.ts`, `write-scoped-executor.ts`, `shell-test-executor.ts`, `prove-it-gate.ts`.
- **`packages/store`** — the Cloud SQL Postgres store (plain pg, **no DBOS**): `connection.ts`
  (Node connector + keyless IAM), `schema.sql` (the `events` schema only), `pg-store.ts`,
  `load-corpus.ts` (the library migration).

## Library / knowledge tier — where the source of truth is

- **STRUCTURED SOURCE (edit here):** `apps/studio/data/knowledge.json` (74 units, zod-validated).
- **GENERATOR:** `apps/studio/data/build-corpus.mjs` → `apps/studio/data/assets.json` +
  `docs/glossary.md`. These are **generated views — never hand-edit them**; re-run the generator
  (`npx tsx apps/studio/data/build-corpus.mjs`) after editing `knowledge.json`.
- **LIVE RUNTIME COPY:** the shared Cloud SQL Postgres (`events.library_artifact` projection +
  `events.library_event` log), loaded via `packages/store/src/load-corpus.ts`.
- **STOPGAP:** `apps/studio/server/devApi.ts` still reads/writes the `data/*.json` files and calls
  itself "the whole backend, no database." That's pre-DB. The **studio↔store swap is PENDING** — don't
  treat the JSON as the live store, and don't hand-edit `assets.json` (the generator clobbers it).

## How to run

- Install: `corepack enable pnpm` · `pnpm install`
- Gate: `pnpm -r typecheck` · `pnpm -r test` (tests are offline — no DB or API key needed)
- **Cloud SQL** (not local Docker): `pnpm db:up` / `pnpm db:status` / `pnpm db:down`
  (gcloud against instance `storytree-498613:australia-southeast1:storytree-pg`). It is **STOPPED by
  default** for cost — bring it up only for a burst, and bring it back **down** when done.
  Run the library migration: `STORYTREE_DB_USER=<iam-email> npx tsx packages/store/src/load-corpus.ts`.
- Prove-it-gate: `packages/orchestrator/src/prove-it-gate.ts` (+ `.e2e.test.ts`). Red-green is enforced
  spine-side (phase machine + per-phase write-scope + spine-observed RED/GREEN + a signed verdict).
- Studio UI: `pnpm --filter studio dev` (Vite, port 5173).

## Legacy — `legacy/Agentic/` is REFERENCE-ONLY

A vendored, read-only V1 Rust submodule (`.gitmodules` → `HuaMick/Agentic`). **Do not edit it.** Its
own `CLAUDE.md` / ADRs / `assets/` are V1's and are **not authoritative** for storytree. The current
foundation was ported *conceptually* from it (see `docs/research/agentic-foundation-survey.md`), not lifted.

## Load-bearing ADRs

`docs/decisions/` runs **0001–0021 on `main`** (if `MEMORY.md` mentions 0024–0028, those are other
branches — calibrate to what's on disk). Read the older ADRs' **Status lines first** (many are
superseded-in-part). The current-state set:

- **0011** — own the agent loop (pi retired)
- **0017** — the knowledge/library tier lives in shared Postgres
- **0018** — Phase-1 structured source (`knowledge.json`); the glossary is generated
- **0019** — the tier is named "library"; **DBOS deferred** ← the big one
- **0020** — red-green enforcement on the owned loop (the gate is built)
- **0021** — keyless agent/DB auth; the Phase-2 migration ran

## Conventions

- ESM, `NodeNext`: relative imports use the **`.js`** extension; cross-package via the package name.
- `verbatimModuleSyntax` (use `import type`), `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `strict`. No build step — packages export raw TS consumed via `tsx`.
- Tests: `node:test` + `node:assert/strict`, `*.test.ts` under `src/`.
- Commit only when asked; the project cadence is merge-to-main-when-green.
