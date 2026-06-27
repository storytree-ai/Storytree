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

## ⚠️ Current state — calibrate to the live decision log

`README.md` / `.env.example` / `infra/` prose and the **older** accepted ADRs describe a pre-reversal
world — and an `accepted` ADR can have a body that is partly overtaken while it stays green (the
canonical trap: ADR-0011 §5 "DBOS/Postgres durable execution stands" is dead, overtaken by ADR-0019;
**do not** revert wording toward "DBOS stands"). Don't hand-track this — **query the live decision
log:** `storytree adr list --load-bearing` (★ the curated calibrate-to-these set, ADR-0086) and
`storytree adr list --current` (every accepted, non-superseded ADR, with its reversal edges printed
inline). The list is derived from `docs/decisions/` on disk, so it can never drift; it is **no longer
hand-maintained here**.

The headline current-state facts those ADRs encode: pi is gone — we own the agent loop (0011), now
demoted under the **live Claude Agent SDK** runtime (0030); the **library tier lives in shared Cloud
SQL Postgres**, DBOS deferred (0017 / 0019); the **prove-it-gate is BUILT** spine-side (0020); **DB
auth is keyless** Cloud SQL IAM via ambient ADC (0021 — credentials are present, verify with `gcloud
auth application-default print-access-token`, don't assume unauthenticated).

## The foundation is built and green (do not re-scaffold)

Run `pnpm -r test` before assuming anything is unbuilt. The packages:

**`@storytree/core` is DISSOLVED (ADR-0068 — the organism rebuild is complete).** The shared
god-package was decomposed into the organisms below; each type/function now lives with the organism
that owns it, and cross-organism coupling passes through declared `port`s (proof-protocol,
model-events), never by importing another organism's source.

- **`packages/proof-protocol`** (formerly `verdict-contract`, renamed for role-not-position per
  ADR-0078) — the published verdict SHAPE (ADR-0068 §3), the first concrete `port`: zod DATA shapes +
  validators (`Verdict`/`ProofMode`/`SigningRow`/`EvidenceRef`/`ChangeEvent`/`DriftFlag`/`Attestation`/
  `anchor`, plus the duplicated `Tier`/`Status`). The verdict/proof MESSAGE FORMAT organisms exchange —
  browser-safe, zod-only; readers `.safeParse()` verdict-DATA across the boundary and never import the
  proof machinery. The bottom root the whole graph rests on (depends on nothing).
- **`packages/storage-protocol`** (formerly `base`, renamed for role-not-position per ADR-0078) — the
  universal, browser-safe STORAGE SEAM (ADR-0068 step 5): the narrow `Store` / `ChangeStore`
  document-event contract (the verbs any store must offer), the `InMemoryStore` reference impl + the
  shared `./parity` suite a real backend is held to, and `StoredDoc`/`StoreEvent`/`DeleteDocOpts`/
  `retiredEventDoc`. A contract, not a database — the second root (depends only on proof-protocol). The
  `node:test` parity suites live behind the `./parity` subpath so the main entry carries no `node:` import.
- **`packages/library`** — the library organism: the work-hierarchy schema (`schema.ts`, story /
  capability / contract, `Tier`/`Status`/`Unit`) and the knowledge-document schema (`knowledge.ts`,
  `knowledge-render.ts`, `knowledge-sources.ts`, `migrations.ts`, `library-doc.ts`,
  `validateLibraryDoc`/`upcast`) — the root barrel is pure-zod / browser-safe (the studio bundles it).
  Its **node-only `store/` subpath** (`packages/library/src/store/`, imported as
  `@storytree/library/store`) owns the library's persistence (ADR-0077 — moved here when the old
  `@storytree/store` package dissolved): the shared Cloud SQL Postgres store (plain pg, **no DBOS**) —
  `connection.ts` (Node connector + keyless IAM), `schema.sql`/`migrate.ts` (the `events` schema),
  the corpus store `pg-store.ts`, the comment store `pg-comment-store.ts`, the ADR allocator
  `adr-store.ts`, and `load-corpus.ts` (the library migration). It carries `node:`/`pg` imports, so it
  is never re-exported from the root barrel — Node consumers import the subpath directly.
- **`packages/notice-board`** — the notice-board organism (ADR-0068 step 6): the session-presence
  schema + staleness classification (`PresenceDeclarationDoc`/`classifyPresence`/`mergeDeclaration`/
  the staleness thresholds). Pure zod, browser-safe (the studio bundles it).
- **`packages/studio-members`** — the studio-members organism (ADR-0068 step 6): the member/user
  schema + access-control compute (`UserDoc`/`resolveAccess`/`mergeUser`/`parseSeedAdmins`/the
  last-admin guard). Pure zod, browser-safe.
- **`packages/agent`** — both leaf executors behind the `PhaseAuthor` seam (`phase-author.ts`,
  ADR-0030): the **owned loop** (ADR-0011 — now the offline/deterministic executor + pivot-out
  fallback): `model.ts` (the `Model` seam + `ScriptedModel` + `AnthropicModel`), `run-turn.ts`,
  `step.ts` (fail-closed `runStep`/`runStepValidated`), `tool-executor.ts`, `fs-tools.ts` (the real
  local file tool surface — read/write/edit/list/run); and **`ClaudeAgentAuthor`** (`sdk-author.ts`
  — the **live** runtime on the Claude Agent SDK, subscription-funded, write scope held by a
  fail-closed `PreToolUse` hook). Also owns the model-event vocabulary `port` (`model-events.ts`,
  ADR-0068 step 6a) — orchestrator consumes it across the seam.
- **`packages/orchestrator`** — the deterministic spine (ADR-0005) **and the proof RULER** (the
  "farmer", ADR-0068): `sequence.ts` (`runSequence` / `runLoop`, with the *halted-is-never-a-pass*
  guard), the **working prove-it-gate** (ADR-0020): `phase-machine.ts`, `write-scoped-executor.ts`,
  `shell-test-executor.ts`, `prove-it-gate.ts`; and the proof machinery in `proof/` (`signer.ts`,
  `anchor-compute.ts`/`hashSpan`, `rollup.ts`, `verdict-line.ts`, `attestations.ts`, `proof-status.ts`,
  `source-drift.ts`) — the COMPUTE moved out of the dissolved core; the DATA shapes it reads/returns
  are proof-protocol's.
- **`packages/cli`** — the choose-your-own-adventure Library/CLI surface (ADR-0023); also home to the
  ADR frontmatter parser (`adr-frontmatter.ts`) and the `stories/` corpus guard
  (`scripts/validate-corpus.ts`, run in its `test`).

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
- **AGENT TIER = seed-canonical (the exception, ADR-0055):** agents are authored in `knowledge.json`
  and rendered offline (`storytree agents`, the generated CLAUDE.md region per ADR-0051, the
  `.claude/agents/*.md` files per ADR-0052), so for the `agent` kind the **seed is the edit surface** —
  the inverse of the live-canonical default above. After editing an agent in the seed, reconcile the
  live store: `pnpm db:up && pnpm storytree library sync-agents --pg` (upserts every seed agent,
  deletes any live agent absent from the seed; agent-kind only, idempotent) — else `storytree agents
  --pg` and the studio go stale. Don't hand-reconcile with a throwaway script. `pnpm gate` ends with a
  best-effort `check:agents-sync` that **WARNs** (never blocks) if the live tier drifted while the DB
  is up — your nudge to run the sync; it SKIPs silently offline (CI is DB-free, so it's local-only).
- **GRADUATED A NON-AGENT ARTIFACT INTO THE SEED? migrate it live (ADR-0103):** the ADR-0095
  graduation flow writes a new principle/definition into `knowledge.json` (so the offline agent
  renderer picks it up), which leaves it **seed-only** — invisible to `--pg`, and a `> MISSING REF`
  for any agent that cites it against the live store / studio. Carry it across: `pnpm db:up && pnpm
  storytree library sync-corpus --pg`. This is the INVERSE of `sync-agents`: **migrate-only** — it
  upserts only seed non-agent artifacts ABSENT from live, and (unlike `load-corpus --force`) never
  overwrites a live edit or deletes a live-only artifact; idempotent. `pnpm gate` ends with a
  best-effort `check:corpus-sync` that **WARNs** (never blocks, local-only) if a seed artifact is
  missing from live — your nudge to run it.
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

- **Remote (web/VM) sessions** run in an ephemeral container (Claude Code on the web): GitHub only
  via MCP, and **egress is 443-only** — an HTTPS proxy where the "Network access" setting picks
  *which hosts*, not *which ports* (so even "Full" can't open another port; "Custom" only narrows
  hosts). The offline gate (`pnpm -r typecheck && pnpm -r test`) is fully runnable and is your green
  signal; the Node `>=24` engine warning is harmless (the container ships v22). The keyless DB path
  is **not** what's missing here: `gcloud` is no longer required (`db:up`/`down`/`status` are REST
  now, ADR-0063), and on VM sessions the `storytree-remote-dev` service-account key (carried in env)
  + the `scripts/remote-session-setup.sh` SessionStart hook hydrate ADC + `~/.storytree/secrets.json`,
  so the REST **control plane** (`db:status`, the activation flip) works. What still **can't** work
  here: anything that opens a DB *connection* — live/`--pg` library writes, live story builds,
  `db:up`'s connection-readiness poll — because Postgres' data socket is port **3307**, which the
  443-only egress blocks (control plane works; the data plane hangs). Use a laptop session (direct
  network) or a hosted HTTPS/443 DB bridge; don't burn time on the connector here. *(Durable home for
  this kind of ways-of-working is a `process` artifact, ADR-0034 — write it from a session that has
  the DB.)*
- Install: `corepack enable pnpm` · `pnpm install`
- **Fresh worktree?** A new git worktree has NO `node_modules` — run `pnpm install` in it FIRST, or
  the gate / `pnpm storytree …` / `tsx` all fail. And invoke the CLI as **`pnpm storytree …`** (not a
  bare `node --import tsx packages/cli/src/main.ts` — tsx resolves only through the workspace, so the
  bare form errors `ERR_MODULE_NOT_FOUND 'tsx'` from the worktree root). Presence hooks already
  self-heal via `scripts/presence-hook.sh`; your own CLI calls do not.
- Gate: `pnpm -r typecheck` · `pnpm -r test` (tests are offline — no DB or API key needed)
- **Credentials auto-hydrate:** the CLI fills `CLAUDE_CODE_OAUTH_TOKEN` (SDK leaf) and
  `STORYTREE_DB_USER` (live `--pg` store) from `~/.storytree/secrets.json` when unset — env always
  wins (`packages/cli/src/secrets.ts`). One rotation point, survives sessions and worktrees; no
  env-var prefixes needed on `pnpm storytree …` commands.
- **Cloud SQL** (not local Docker): `pnpm db:up` / `pnpm db:status` / `pnpm db:down`
  (gcloud against instance `storytree-498613:australia-southeast1:storytree-pg`). `db:up` it when you
  need it and then **LEAVE IT RUNNING — do not `db:down` when you finish** (owner call 2026-06-13:
  sessions kept stopping it between bursts). Auto-stop is now a **fixed nightly window — asleep
  01:00–07:00 Australia/Sydney** (ADR-0114, `infra/cost-backstop.tf`): one Cloud Scheduler job STOPS it
  at 01:00 and a second STARTS it at 07:00, so it stays predictably up across the day for the
  member-facing hosted studio (ADR-0042). The old idle-aware 5 h auto-stop (ADR-0015 §5) was
  **removed** — superseded by this window (ADR-0114). A manual `db:up` still works any
  time inside the sleep window (a no-op if already up); re-`db:up` if a query can't connect after the
  overnight stop.
  Run the library migration: `STORYTREE_DB_USER=<iam-email> npx tsx packages/library/src/store/load-corpus.ts`.
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
- **Hosted studio (ADR-0042):** the members deployment — Cloud Run `storytree-studio`
  (australia-southeast1) behind **direct IAP** (no LB, no domain), serving
  `apps/studio/server/serve.ts`: members read + comment (author stamped from the IAP identity,
  own-comments-only edits), admins (`STORYTREE_STUDIO_ADMINS` seeds the first) manage members + edit
  assets, db control off. Day-to-day membership is the in-UI **Members** panel (ADR-0043,
  `stories/studio-members`); the old gcloud grant/revoke runbook lives in `infra/studio-cloud.md` (image:
  `infra/studio-cloudbuild.yaml`; Terraform codification = the open `cloud-run-iap` capability).
  Local guarded trial: `pnpm --filter studio build` then `pnpm --filter studio serve` with
  `STORYTREE_STUDIO_DEV_IDENTITY=<email>`.
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

`docs/decisions/` is the append-only decision HISTORY. Every ADR carries **structured YAML
frontmatter** (`status` proposed/accepted/superseded · `decided` · outgoing
`supersedes`/`supersedes_in_part`/`amends` edges · the `load_bearing` current-state tag; ADR-0037 /
0086) — CI validates it (`adr-health` in `@storytree/cli`).

**The current-state / load-bearing set is a CLI query, not a list hand-kept here (ADR-0086):**
`storytree adr list --load-bearing` (★ the curated calibrate-to-these set) · `--current` (every
accepted, non-superseded ADR + edges) · `--status <s>`. It reads `docs/decisions/` on disk — offline,
no DB — so it can never drift from the files. When you land or overtake a decision, **spawn the
`librarian-curator`** to keep status / edges / the `load_bearing` set honest.

**Status is a projection of the `## Status` prose, never an invented flip.** An agent MAY flip an ADR
`proposed → accepted` (the green flip) once the decision is made and the prose supports it (ADR-0084);
the **`librarian-curator` MAY also flip an ADR to `superseded`** as curation (ADR-0086 — record the
`supersedes` edge on the superseding ADR, or the gate goes red). Still HUMAN-only: `accepted →
proposed` (un-deciding). **Modifying a decided ADR is copy-on-write** — a substantive re-decision is a
NEW ADR (allocated below) that supersedes the old, the old body kept as superseded history, never an
in-place body edit (ADR-0086); status flips, edge fixes, typos, and the `load_bearing` tag stay
in-place.

**New ADR? Don't hand-pick the number — allocate it: `pnpm storytree adr new --title "..." --pg`**
(ADR-0050; `pnpm db:up` first). It reserves the next number ATOMICALLY from the store and scaffolds
`docs/decisions/NNNN-slug.md`, so parallel sessions can't collide. Offline it falls back to `max+1`
with a loud "not reserved" warning; either way the `adr-number-unique` gate (in `pnpm -r test`) + a
cross-PR CI check fail any duplicate before it sits on `main`.

## Your operating discipline — the `session-orchestrator` agent (generated)

> Generated from the `session-orchestrator` library agent by `pnpm build:claude` (ADR-0051): this is
> who you are this session and how you land work. The single source of truth is the **library
> artifact**, not this text — edit the artifact (live store / `knowledge.json`) and regenerate; the
> gate's `check:claude` fails if this region drifts. Full assembled guidance: `storytree agents
> session-orchestrator`.

<!-- AGENT:session-orchestrator START — generated by `pnpm build:claude`; edit the library agent, not here (ADR-0051) -->

The interactive session agent: the outer loop that turns an owner's intent into landed work — orient, build one unit to green, run the merge ceremony, escalate the rest.

**Role.** orchestrator is the human-facing session loop (ADR-0030: the human owns the outer loop) that turns an owner's intent into landed work. It orients on the three surfaces — the story tree (the work), the notice board (the sessions), the library (the knowledge) — searched just-in-time; decides the unit; decomposes it into provable units and routes them through the prove-it-gate — the inner loop is one tool, not the whole job (asset:orchestrate-route-supplement) — supplementing the non-leaf glue with its own subagents and delegating the red→green mechanics to the leaf and the spine; keeps the working tree honest; and BEFORE each merge ceremony runs a librarian-curator pass — curate AND graduate (ADR-0095 D7, generalising ADR-0067's after-green spawn; the sequence is green unit → librarian pass → merge): keep the DECISION LOG honest (ADR status, supersession edges, the curated load_bearing current-state set, ADR-0086) AND graduate durable agent-memory into the Library (extract the durable essence into 'able' artifacts, derive definitions / principles for agent guidance, then delete the graduated memory — ADR-0095). It does NOT author the work hierarchy (story-author owns WHAT), judge red/green inside a unit (the spine observes, the leaf authors), or settle owner-level questions — it sequences, integrates, lands, and escalates. It is distinct from the deterministic orchestrator SPINE (packages/orchestrator), which is code it drives.

**Outcome.** Every unit it takes on reaches one of two honest end-states: LANDED on main — green through `pnpm gate`, committed, pushed, and merged by CI via a non-draft PR — or explicitly HELD / ESCALATED with the reason stated. Never: a finished green unit parked in draft, red or WIP work on a non-draft PR, a manual `gh pr merge`, or a silent skip of the gate.

**Workflow.** **session_start:** read CLAUDE.md and the notice board; declare presence (`storytree noticeboard declare --node <story> --pg`); search the corpus just-in-time, never preload it.

1. Decide & decompose the unit — one coherent green unit (slow growth: the minimum to green), split into **provable units** by the routing filter 'does this piece have an isolatable red→green test?' (not package boundaries; `asset:orchestrate-route-supplement`). For a design fork, reserve an ADR (`storytree adr new --pg`) and record it — born `accepted` when the owner DIRECTED the decision in this conversation (`adr new --decided`, ADR-0110: design-time alignment IS ratification, no second end-of-flow ask), `proposed` only while the owner is still exploring.
2. Build to green — **route** the provable units to the inner loop chained in dependency order (`story build --real`, or sequenced `node build --real` across merges; cross-package work sequenced via `depends_on`, never atomic), and **supplement** the non-leaf glue (DB/SQL, deps, visual/UI, config/wiring) with your own subagents — yourself only as a last resort; when the inner loop genuinely can't prove a piece, raise it as a capability gap rather than force-fitting or skipping it. Keep the working tree clean; iterate edit → gate.
3. Gate — `pnpm gate` must pass with nothing red or WIP in the diff.
4. Librarian pass (ADR-0095 D7) — BEFORE the merge ceremony, spawn the **librarian-curator** to curate AND graduate (the sequence is green unit → librarian pass → merge, generalising ADR-0067's after-green spawn): keep the decision log honest — project the ADRs' `## Status` prose into frontmatter (flip statuses, record supersession edges, maintain the `load_bearing` set; substantive re-decisions are copy-on-write, ADR-0086) — AND graduate durable agent-memory into the Library (extract the durable essence, derive definitions / principles that flow into agent guidance, then delete the graduated memory — ADR-0095 D4/D6/D8).
5. Land — run the merge ceremony: commit → push → **non-draft** PR → stop. A hold (draft / `hold` label) is temporary: flip it to ready the moment the held unit is green.
6. Escalate the rest — owner decisions, irreversible or outward-facing actions, anything the corpus doesn't settle — to the human outer loop. Never self-exempt from the gate or the ceremony.

**Escalation.** Owner-level calls (design forks worth an ADR, irreversible or outward-facing actions, anything the corpus doesn't settle) and any blocked landing (a red gate it can't resolve, a write that won't persist) are surfaced to the human outer loop with the reason — never decided unilaterally or worked around.

**Stands on** — assembled from these library artifacts; run `storytree agents session-orchestrator` for their full text:
- **Ceremonies & context:** merge-ceremony, prove-and-promote-ceremony, library-edit-ceremony, pull-based-context-architecture, orchestrate-route-supplement
- **Rules:** slow-growth-minimum-to-green, edit-first-curation, owner-fork-bar, reference-dont-restate, observability-first, verify-edit-write-persisted-or-escalate, audit-the-signed-verdict, plain-language-first
- **Refuse:** never-bypass-the-gate, agent-never-self-exempts, approval-gated-trunk, human-owns-the-outer-loop, live-store-is-the-edit-surface

<!-- AGENT:session-orchestrator END -->

## Conventions

- ESM, `NodeNext`: relative imports use the **`.js`** extension; cross-package via the package name.
- `verbatimModuleSyntax` (use `import type`), `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `strict`. No build step — packages export raw TS consumed via `tsx`.
- Tests: `node:test` + `node:assert/strict`, `*.test.ts` under `src/`.
- **Anchor your session on the notice board** once you know what you're working on:
  `pnpm storytree noticeboard declare --working-on "<what>" --node <story-id> --pg` (repeat
  `--node` per story; re-declares upsert, so refining is cheap). Hooks only auto-declare
  `nodes: []`, which renders in the studio session dock but never as a story wisp.
- **Landing work** is the `session-orchestrator` operating discipline above (generated from the
  library `merge-ceremony`, the single source of truth — don't hand-copy the rule back here):
  green unit → **non-draft** PR → CI auto-merges (ADR-0022); never `gh pr merge`; a hold (draft /
  `hold` label) is **temporary** — flip it to ready the moment the held unit is green.
  `claude/real/*` promotion branches merge **non-squash** (ADR-0031). Full text:
  `storytree agents session-orchestrator`.
- **A PR is not "done" until CI is green — WATCH it, don't open-and-walk-away.** CI
  (`.github/workflows/ci.yml`) runs `check:manifest` + `pnpm -r typecheck` + `pnpm -r test` +
  `pnpm -r build` against the **merge of your branch with `main`**, so a green local `pnpm gate` does
  NOT guarantee a green CI: a clean branch can fail on something that landed on `main` *after* you cut
  it (e.g. a new root entry the `repo-surface-allowlist` manifest must list — this exact case stranded
  three PRs at once). After opening, check `gh pr checks <n>`; on a `verify` failure read the cause
  (`gh run view --job=<id> --log-failed`), fix it, and push — never leave a red PR sitting unmerged.
  **First suspect a stale branch:** `git fetch origin && git merge origin/main`, re-gate, push (a
  branch many commits behind `main` is the usual reason a local-green PR is CI-red).
