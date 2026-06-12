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
**pre-reversal world**. Six reversals are the current truth; calibrate everything to these:

1. **pi is GONE** (ADR-0011). We **own the agent loop** on the raw Anthropic Messages API
   (`@anthropic-ai/sdk`, Anthropic-only for now). `packages/pi-adapter` is removed; `packages/agent`
   is the loop's home — but see reversal 6 for which executor is *live*.
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
6. **The Claude Agent SDK is the LIVE runtime** (ADR-0030, supersedes ADR-0011 in part):
   live node builds run `ClaudeAgentAuthor` on subscription auth; the owned loop is **demoted** to
   the offline/deterministic test executor + pivot-out fallback, behind the `PhaseAuthor` seam.

## The foundation is built and green (do not re-scaffold)

Run `pnpm -r test` before assuming anything is unbuilt. The packages:

- **`packages/core`** — the schema (`schema.ts`, work hierarchy), the library schema
  (`knowledge.ts`), and the foundation types: `proof.ts` (ProofMode/Verdict/SigningRow),
  `signer.ts` (fail-closed identity chain), `model-events.ts` (typed content blocks),
  `store.ts` (the narrow `Store` + `InMemoryStore` + `validateLibraryDoc` + a reusable parity suite).
- **`packages/agent`** — both leaf executors behind the `PhaseAuthor` seam (`phase-author.ts`,
  ADR-0030): the **owned loop** (ADR-0011 — now the offline/deterministic executor + pivot-out
  fallback): `model.ts` (the `Model` seam + `ScriptedModel` + `AnthropicModel`), `run-turn.ts`,
  `step.ts` (fail-closed `runStep`/`runStepValidated`), `tool-executor.ts`, `fs-tools.ts` (the real
  local file tool surface — read/write/edit/list/run); and **`ClaudeAgentAuthor`** (`sdk-author.ts`
  — the **live** runtime on the Claude Agent SDK, subscription-funded, write scope held by a
  fail-closed `PreToolUse` hook).
- **`packages/orchestrator`** — the deterministic spine (ADR-0005): `sequence.ts` (`runSequence` /
  `runLoop`, with the *halted-is-never-a-pass* guard), and the **working prove-it-gate** (ADR-0020):
  `phase-machine.ts`, `write-scoped-executor.ts`, `shell-test-executor.ts`, `prove-it-gate.ts`.
- **`packages/store`** — the Cloud SQL Postgres store (plain pg, **no DBOS**): `connection.ts`
  (Node connector + keyless IAM), `schema.sql` (the `events` schema only), `pg-store.ts`,
  `load-corpus.ts` (the library migration).

## Library / knowledge tier — where the source of truth is

**As of ADR-0023, the shared Cloud SQL Postgres store is the LIVE source of truth for artifact
state; `knowledge.json` is the migration seed/export, not the edit-here surface.** This is what lets
multiple sessions iterate on different artifacts in parallel (per-id rows, transactional upserts — no
file conflicts).

- **ITERATE ON ARTIFACTS (multiple parallel sessions OK):** use the CLI against the live DB —
  `pnpm storytree library artifact edit <id> --set <field>=<value> --pg` and
  `pnpm storytree library artifact new --file <doc.json> --pg` (writes are refused without `--pg`;
  bring the DB up first with `pnpm db:up`). Different artifacts never contend; **same** artifact
  across sessions is not yet coordinated (ADR-0009 claims are DBOS-deferred). **Do NOT hand-edit
  `knowledge.json` for live changes, and do NOT run `load-corpus.ts --force` against a live DB with
  CLI edits — it reverts them.**
  *(Invocation note: `pnpm storytree …` forwards every flag EXCEPT `--json` — pnpm reserves that —
  so pass a doc via `--file`, or use inline `--json` only via `npx tsx packages/cli/src/main.ts …`.)*
- **EXPLORE (read, offline OK):** `storytree library` (dashboard) · `… artifact <id>` ·
  `… artifact list <category>` · `… library tree focus <id>` — choose-your-own-adventure, just-in-time
  (ADR-0023). Read commands run offline (in-memory seed); no DB needed.
- **SEED / EXPORT VIEW:** `apps/studio/data/knowledge.json` (the structured corpus the DB was migrated
  from) + the **generated** `apps/studio/data/assets.json` + `docs/glossary.md` (via
  `npx tsx apps/studio/data/build-corpus.mjs`; never hand-edit the generated two). These reflect the
  seed, not live CLI edits — a DB→seed export is later work.
- **STUDIO UI (one parallel session at a time):** the live store is now the **default**
  (`oq-studio-store-default` → B) — `pnpm --filter studio dev` reads/writes the live DB and sees CLI
  edits (bring the DB up first with `pnpm db:up`). For offline work set `STORYTREE_STUDIO_STORE=json`
  to fall back to the pre-DB JSON backend (`apps/studio/server/devApi.ts`), which won't reflect CLI
  writes. Keep the UI session out of artifact data; keep artifact sessions out of `apps/studio/src`.

## How to run

- Install: `corepack enable pnpm` · `pnpm install`
- Gate: `pnpm -r typecheck` · `pnpm -r test` (tests are offline — no DB or API key needed)
- **Credentials auto-hydrate:** the CLI fills `CLAUDE_CODE_OAUTH_TOKEN` (SDK leaf) and
  `STORYTREE_DB_USER` (live `--pg` store) from `~/.storytree/secrets.json` when unset — env always
  wins (`packages/cli/src/secrets.ts`). One rotation point, survives sessions and worktrees; no
  env-var prefixes needed on `pnpm storytree …` commands.
- **Cloud SQL** (not local Docker): `pnpm db:up` / `pnpm db:status` / `pnpm db:down`
  (gcloud against instance `storytree-498613:australia-southeast1:storytree-pg`). It is **STOPPED by
  default** for cost — bring it up only for a burst. Auto-stop is **idle-aware** now (ADR-0015 §5,
  `infra/idle-stop.tf`): a Cloud Function stops it only after ~60 min with **zero DB connections**, so
  it won't stop a live session, but a long idle gap will — re-`db:up` if a query can't connect (a
  daily blunt cron is the cost floor behind it).
  Run the library migration: `STORYTREE_DB_USER=<iam-email> npx tsx packages/store/src/load-corpus.ts`.
- Prove-it-gate: `packages/orchestrator/src/prove-it-gate.ts` (+ `.e2e.test.ts`). Red-green is enforced
  spine-side (phase machine + per-phase write-scope + spine-observed RED/GREEN + a signed verdict).
  Live smoke (ADR-0030, subscription-billed): `pnpm storytree node build <id> --live`
  (`--dry-run` is the offline scripted walk). Phase E chains a WHOLE story in dependency order:
  `pnpm storytree story build <story-id> --dry-run | --live [--budget <usd>]` (topo order from
  `depends_on`, story UAT node last, halt-is-never-a-pass; live default $10 total ceiling).
  `--store pg` on live/real builds persists verdicts to `events.work_event`/`events.verdict`
  (refused for dry-runs — a scripted PASS persisted would be a forged healthy).
- Library CLI (ADR-0023): `pnpm storytree library` (explore; offline). Writes need the live DB:
  `pnpm db:up` then `pnpm storytree library artifact edit <id> --set <field>=<value> --pg`. See the
  Library section above (note: inline `--json` needs `npx tsx packages/cli/src/main.ts`, not `pnpm`).
- Studio UI: `pnpm --filter studio dev` (Vite, port 5173) — backed by the live store **by default**
  (`oq-studio-store-default` → B; bring the DB up with `pnpm db:up` first). Set
  `STORYTREE_STUDIO_STORE=json` for the offline JSON backend (won't reflect CLI edits).
  **Durable background mode:** `pnpm studio:up` / `studio:down` / `studio:status` runs it detached
  (no terminal to babysit; pid/log in `apps/studio/.studio.{pid,log}`). The UI self-reports store
  health (`/api/health`) and shows a banner with a **Start DB** button when the live store is
  stopped — no need to relaunch the studio after a DB idle-stop; it recovers in place. It also
  banners when the checkout MOVES under the running server (a `code` git-HEAD stamp in
  `/api/health` — the "404 unknown endpoint after a merge" trap): `pnpm studio:down` / `studio:up`.

## Legacy — `legacy/Agentic/` is REFERENCE-ONLY

A vendored, read-only V1 Rust submodule (`.gitmodules` → `HuaMick/Agentic`). **Do not edit it.** Its
own `CLAUDE.md` / ADRs / `assets/` are V1's and are **not authoritative** for storytree. The current
foundation was ported *conceptually* from it (see `docs/research/agentic-foundation-survey.md`), not lifted.

## Load-bearing ADRs

`docs/decisions/` runs **0001–0039 on `main`** — calibrate to what's on disk. Every ADR carries
**structured YAML frontmatter** (`status` proposed/accepted/superseded · `decided` · outgoing
`supersedes`/`supersedes_in_part`/`amends` edges; ADR-0037) — CI validates it (`adr-health` in
`@storytree/cli`), so flip status BY HAND and record supersession as an outgoing edge on the new
ADR, or the gate goes red. Read the Status sections for the detail (many are superseded-in-part).
The current-state set:

- **0011** — own the agent loop (pi retired) — *superseded in part by 0030*
- **0017** — the knowledge/library tier lives in shared Postgres
- **0018** — Phase-1 structured source (`knowledge.json`); the glossary is generated
- **0019** — the tier is named "library"; **DBOS deferred** ← the big one
- **0020** — red-green enforcement on the owned loop (the gate is built)
- **0021** — keyless agent/DB auth; the Phase-2 migration ran
- **0022** — CI green gate + auto-merge-on-green (inside free Actions)
- **0023** — agent↔Library interaction is a choose-your-own-adventure CLI (`packages/cli`)
- **0030** — all-in on the Claude Agent SDK as the **live** runtime (subscription auth); the owned
  loop is the offline/deterministic executor + pivot-out fallback, behind the `PhaseAuthor` seam
- **0037** — decision binding: stories declare deciding ADRs (`decisions:` frontmatter), drift
  checks fire through CI, and **live story builds are gated on open-question hygiene** — an
  unprocessed operator answer on a deciding ADR's OQ refuses the build until a session processes
  it (record in an ADR + retire the OQ, or post a follow-up comment)

## Conventions

- ESM, `NodeNext`: relative imports use the **`.js`** extension; cross-package via the package name.
- `verbatimModuleSyntax` (use `import type`), `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `strict`. No build step — packages export raw TS consumed via `tsx`.
- Tests: `node:test` + `node:assert/strict`, `*.test.ts` under `src/`.
- **Merge to main quickly and frequently.** When a unit of work is green (`pnpm gate`), commit and
  open a **non-draft PR** without waiting to be asked — CI auto-merges it on green (ADR-0022).
  **Never merge manually** (`gh pr merge` in any flavor lands pre-CI — no required checks). To hold
  a PR for review: mark it draft or add the `hold` label. `claude/real/*` promotion branches merge
  **non-squash** (ADR-0031 — the verdict's commit must stay an ancestor of `main`). Don't commit
  red/WIP work to a non-draft PR; finish the unit or mark it draft.
