# storytree — agent onboarding

**New session? Read this first.** Term definitions are authoritative in the **Library** — look them up
just-in-time (`storytree library artifact <term>`) when you hit one you don't know; don't pre-read a
glossary (ADR-0135 retired `docs/glossary.md`; ADR-0023's choose-your-own-adventure, pull-based model).
This file is the one-read orientation; it overrides any stale prose in `README.md`, `.env.example`, or
the infra docs.

## What this is

A v2 rebuild of the AgenticEngineering project: a multi-agent system that grows software as a DAG of
**stories**, watched live. Work hierarchy: **story > capability > contract**, split by proof mode
(ADR-0002 / ADR-0010; the Library's `definition` artifacts are authoritative — `storytree library
artifact <term>`).

- **TypeScript + Node 24 + pnpm workspaces** (`corepack enable pnpm`; pnpm@9.15.0). Workspaces:
  `packages/*`, `apps/*`.
- The V1 Rust repo is vendored **read-only** at `legacy/Agentic/` (a git submodule) — reference only,
  see "Legacy" below.

## ⚠️ Current state — calibrate to the live decision log

`README.md` / `.env.example` / `infra/` prose and the **older** accepted ADRs describe a pre-reversal
world — and an `accepted` ADR can have a body that is partly overtaken while it stays green (the
canonical trap: ADR-0011 §5 "DBOS/Postgres durable execution stands" is dead, overtaken by ADR-0019;
**do not** revert wording toward "DBOS stands"). Don't hand-track this — **query the live decision
log:** `storytree adr list --load-bearing` (the calibrate-to-these set, ADR-0139: the curated ★ seed
PLUS every accepted ADR that ☆ reaches it through an `amends` edge, transitively) and
`storytree adr list --current` (every accepted, non-superseded ADR, with its reversal edges printed
inline). The list is derived from the LIVE STORE — decisions are ordinary Library artifacts since
ADR-0403 — so it can never drift; it is **no longer hand-maintained here**. ⚠ That means `adr list`
needs the DB up (`pnpm db:up`); the offline read it used to advertise is ADR-0403's named accepted
cost, and the command REFUSES with that reason rather than reporting an empty decision log.

The headline current-state facts those ADRs encode: pi is gone — we own the agent loop (0011), now
demoted behind two subscription-funded live leaves — **Claude Agent SDK by default, Codex opt-in**
(0030 / 0232); the **library tier lives in shared Cloud
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
  It also owns the seam's **HTTP transport** (ADR-0259 — every client that is not the server reaches the
  store through a front door; `pg` is a server-side privilege): the wire contract (`store-wire.ts`) and
  `HttpStore`, held to the same `storeParitySuite` as `InMemoryStore`/`PgLibraryStore`, both pure/browser-safe
  in the main entry; the contract's server half (`handleStoreRequest`) sits behind the `./http-server`
  subpath. **Adding the backend migrated nobody** — every existing caller still dials `createPool`, and
  proof-bearing writes through a door stay GATED (ADR-0259 D5: needs an ADR-0081 amendment + an ADR-0252 review).
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
- **`packages/agent`** — the leaf executors behind the `PhaseAuthor` seam (`phase-author.ts`,
  ADR-0030): the **owned loop** (ADR-0011 — now the offline/deterministic executor + pivot-out
  fallback): `model.ts` (the `Model` seam + `ScriptedModel` + `AnthropicModel`), `run-turn.ts`,
  `step.ts` (fail-closed `runStep`/`runStepValidated`), `tool-executor.ts`, `fs-tools.ts` (the real
  local file tool surface — read/write/edit/list/run); and **`ClaudeAgentAuthor`** (`sdk-author.ts`
  — the compatibility-default live runtime on the Claude Agent SDK, subscription-funded, write
  scope held by a fail-closed `PreToolUse` hook); and **`CodexPhaseAuthor`** (`codex-author.ts` —
  opt-in via `--runtime codex`, default model `gpt-5.6-terra`, saved ChatGPT-managed auth only,
  API-key fallback forbidden, authoring in a disposable replica from which the spine promotes one
  exact phase-checked file). Also owns the
  model-event vocabulary `port` (`model-events.ts`,
  ADR-0068 step 6a) — orchestrator consumes it across the seam.
- **`packages/orchestrator`** — the deterministic spine (ADR-0005) **and the proof RULER** (the
  "farmer", ADR-0068): `sequence.ts` (`runSequence` / `runLoop`, with the *halted-is-never-a-pass*
  guard), the **working prove-it-gate** (ADR-0020): `phase-machine.ts`, `write-scoped-executor.ts`,
  `shell-test-executor.ts`, `prove-it-gate.ts`; and the proof machinery in `proof/` (`signer.ts`,
  `anchor-compute.ts`/`hashSpan`, `rollup.ts`, `verdict-line.ts`, `attestations.ts`, `proof-status.ts`,
  `source-drift.ts`) — the COMPUTE moved out of the dissolved core; the DATA shapes it reads/returns
  are proof-protocol's.
- **`packages/drive`** — the shared build/orchestrate driver core (ADR-0112, extracted from `cli`):
  `node-build.ts` / `story-build.ts` / `adopt.ts` / `orchestrate.ts`, the DB preflight
  (`db-control.ts` / `ensureLiveDb`), the secrets hydrator (`secrets.ts`), and the ADR frontmatter
  parser (`adr-frontmatter.ts`). Consumed by `cli`, the studio worker, and the desktop backend; hard
  invariant: `drive` never imports `cli`.
- **`packages/cli`** — the choose-your-own-adventure Library/CLI surface (ADR-0023); also home to the
  `stories/` corpus guard (`scripts/validate-corpus.ts`, run in its `test`). (The ADR frontmatter
  parser and the build drivers moved to `packages/drive`, ADR-0112.)

## Library / knowledge tier — where the source of truth is

**The shared Cloud SQL Postgres store is the ONLY source of truth for artifact state, for EVERY
kind, with no seed-authored exception left (ADR-0023, ADR-0302 D1, ADR-0307).** This is what lets
multiple sessions iterate on different artifacts in parallel (per-id rows, transactional upserts — no
file conflicts).

**THE THREE SEED CEREMONIES ARE GONE — don't look for them, and don't re-derive them.**
`sync-agents`, `sync-corpus` and `export-corpus`, and with them `check:agents-sync` /
`check:corpus-sync` / `check:corpus-content`, were DELETED by ADR-0302 D4 (deleted, not neutered).
They existed only to police a committed mirror of a database that was already canonical. There is
now one writer path and one direction: **edit the artifact live, regenerate the projections.** If a
memory, an older ADR body or a stale prose paragraph tells you to run one of them, that text is
overtaken — the command does not exist. The gate is three rungs shorter, and no artifact edit of any
kind owes a seed export any more.

- **ITERATE ON ARTIFACTS (multiple parallel sessions OK):** use the CLI against the live DB —
  `pnpm storytree library artifact edit <id> --set <field>=<value> --pg` and
  `pnpm storytree library artifact new --file <doc.json> --pg` (writes are refused without `--pg`;
  bring the DB up first with `pnpm db:up`). Different artifacts never contend. On the **same**
  artifact, a `--set` edit is now FIELD-SCOPED (ADR-0352): it writes only the fields it names, merged
  onto current state inside the store's own write, so two sessions editing DIFFERENT fields no longer
  clobber each other — which is what used to happen silently, with both commands printing success.
  Two limits remain: `--json`/`--file` still replaces the WHOLE doc (a replace is a replace), and two
  sessions editing the SAME field are still last-write-wins with no detector — reconcile forward from
  the sibling's text, never re-apply your own (ADR-0009 claims are DBOS-deferred).
  *(Invocation note: `pnpm storytree …` forwards every flag EXCEPT `--json` — pnpm reserves that —
  so pass a doc via `--file`, or use inline `--json` only via `npx tsx packages/cli/src/main.ts …`.)*
- **AGENT TIER = live-canonical, like every other tier (ADR-0307 D1, superseding ADR-0055).** The
  agent kind was the one seed-authored exception; it is withdrawn. Edit an agent the same way you
  edit anything else — `library artifact edit <id> --pg` — then **regenerate the committed
  projections**: `pnpm build:guidance && pnpm build:agents`. That is TWO steps, not the old
  three-step seed→sync→render dance, and there is no longer a way to make the live tier stale by
  forgetting one. `pnpm gate` still runs `check:guidance` / `check:agents`, which compare the
  generated views against the LIVE store and fail if you edited an agent without regenerating.
- **THE GENERATED VIEWS STAY COMMITTED, AND THAT IS NOT A CONTRADICTION (ADR-0302 D5 / ADR-0307
  D2/D4).** `CLAUDE.md`, `AGENTS.md`, the five harness agent directories, and
  `packages/cli/definitions.generated.json` remain files on disk, because the harness reads them at
  session start *before any tool can run* and therefore before any database is reachable. The line
  is drawn by ROLE, not by taste: **a generator may hold a store connection; anything on the
  harness's startup or per-prompt path may not.** So `build:guidance` / `build:agents` read the live
  store and need it up (locally `pnpm db:up`; in CI, the ADR-0302 D3 keyless WIF credential). They
  fail LOUDLY when it is unreachable rather than falling back to any committed corpus — a generator
  that silently read a stale source would report "in sync" while reverting your live edit.
- **EXPLORE (read):** `storytree library` (dashboard) · `… artifact <id>` ·
  `… artifact list <category>` · `… library tree focus <id>` — choose-your-own-adventure, just-in-time
  (ADR-0023).
- **`apps/studio/data/knowledge.json` IS DELETED (ADR-0302 D1 complete). NO committed file mirrors
  the corpus.** Don't look for it, don't re-create it, and don't add a check that compares anything
  to it. A **bare `storytree library …` read now dials the LIVE store** — `--pg` is no longer needed
  to be current (it still is for WRITES, which is the only branch carrying the write seams), and the
  connector opens LAZILY, so `adr list` / `doctor` / the help surfaces still touch no database.
  Everything else that used to read the seed reads live too: the process-graph and surface-coverage
  diagnostics, `graduate`, the leaf/curator prompt renderers, and the desktop chat mount.
  - **Hermetic tests read `@storytree/library/fixture` instead** — `loadFixtureCorpus(store)` over a
    small FROZEN literal (13 artifacts). It is deliberately NOT a mirror and never reconciled, so it
    drifts by design; that is what keeps `pnpm -r test` credential-free under ADR-0302 D3. Assertions
    about the REAL corpus belong on a `check:*` rung, which may hold a connection (ADR-0307 D4).
  - `storytree doctor`'s `seedReadable` probe went with the file (it existed to answer "is this
    checkout intact?" with zero credentials, so repointing it at a DB would defeat it);
    `checkout-provisioned` answers the weaker question and stays. (The generated
    `apps/studio/data/assets.json` was retired by ADR-0210 — the offline studio sandbox now derives
    its much smaller view from the fixture, and `libraryTemplates()` in `@storytree/library` owns the
    template scaffolds; `docs/glossary.md`, a second generated view, was retired by ADR-0135.)
- **STUDIO UI (one parallel session at a time):** the live store is now the **default**
  (`oq-studio-store-default` → B) — `pnpm --filter studio dev` reads/writes the live DB and sees CLI
  edits (bring the DB up first with `pnpm db:up`). For offline work set `STORYTREE_STUDIO_STORE=json`
  to fall back to the pre-DB JSON backend (`apps/studio/server/devApi.ts`), which won't reflect CLI
  writes. Keep the UI session out of artifact data; keep artifact sessions out of `apps/studio/src`.

## How to run

- **OFFLINE IS NO LONGER A SUPPORTED MODE (ADR-0302 D2) — but most sessions still need no probe at
  session start.** The two heavy legs (`pnpm -r typecheck` / `pnpm -r test`) are still hermetic: no
  DB, no SDK token. What changed is that the CORPUS is online-only — a full `pnpm gate` now needs the
  live store for `check:guidance` / `check:agents`, and every library read is honest only against
  `--pg`. Still don't reflexively `db:up` / `claude -p` / `git fetch` at session
  start — every probe below is **need-gated to a specific action, not a do-first ritual** (over-reading
  them as onboarding steps is the biggest measured time-sink, ADR-0162). Probe only when you actually
  cross the gate: **(a)** a build that needs the DB (`--real --store pg`, or a db-backed proof)
  **self-starts it** (`ensureLiveDb`, `packages/drive`) — a pre-`db:up` is a redundant no-op; a
  **bare `--pg` CLI write** (`artifact edit`, `adr new`) and a **full `pnpm gate`** need `db:up`
  first. **(b)** before an
  **UNATTENDED** `--live`/`--real` build, do **one *hydrated* auth probe or none** — a bare `claude -p`
  reads stale `~/.claude/.credentials.json` → a false 401; the CLI auto-hydrates the real token (see the
  `Credentials auto-hydrate` bullet). Two probes STAY load-bearing: **probe `SELECT 1`, don't assume**
  the DB is unreachable (Cloud SQL bullet), and **`git fetch origin/main`** before a PR / on a CI-red
  (the stale-branch check).
- **Remote (web/VM) sessions ONLY** (Claude Code on the web — ephemeral container, GitHub via MCP)
  can't open a DB *data* connection, and **the reason is NOT a blocked port** (ADR-0250 corrected
  this — the old "443-only egress blocks 3307" wording sent sessions down port-shaped dead ends).
  Raw sockets are 443-only, but the agent proxy CONNECT-**tunnels arbitrary ports**; the real fence is
  that the proxy **re-terminates TLS and resets TLS on any non-443 port**, and its own policy lists
  **client-mTLS / non-443 HTTPS / raw-TCP databases** as unsupported — *report, do not work around*.
  The Cloud SQL connector is all three at once, so `--pg` writes, `--store pg`, and live/`--real`
  builds are **structurally** impossible there — **don't try to tunnel or forward around it.**
  **But read that precisely (ADR-0258): what cannot work is the CONNECTOR, not "database access".**
  Client-mTLS cannot survive a TLS-terminating proxy *by construction* — while ordinary **HTTPS on 443
  is unaffected**, which is why the hosted studio is reachable *at the transport layer* from a remote
  session. **The STORE DOOR is now built and wired** (ADR-0259 D1): `/api/store` serves the read half
  of the `Store` seam from the studio's route table (`apps/studio/server/storeDoorApi.ts`), and the
  CLI dials it through `HttpStore` when **`STORYTREE_STORE_URL`** is set — no `--pg`, no connector.
  Proved 2026-08-04 against the live store: offline seed **231** artifacts, `--pg` **616**, door
  **616** — a connector-less client sees exactly what `--pg` sees. Reads only; the three write routes
  answer 403 (ADR-0259 D5 is not lifted).
  **What is still NOT true is that a REMOTE session can use it, and the reason is the credential, not
  the transport** — measured, not assumed: unauthenticated → `302` to Google sign-in, and a
  `gcloud auth print-identity-token` bearer → `401 Invalid JWT audience`, both stamped
  `x-goog-iap-generated-response: true`, i.e. **IAP refuses at the edge and the app is never reached**.
  IAP wants an OIDC token audienced to its OAuth client, mintable only from a Google identity, and
  ADR-0254 D4 retired `storytree-remote-dev`. **That is now its OWN initiative and blocks nothing** —
  the owner descoped remote sessions from `session-decoupling-arc` on 2026-08-04 ("not a priority,
  its only a nice to have"), so the old "the seed decommit must wait for the door" fence is
  **dissolved**; the credential fork lives on `remote-session-access-arc` (`arc show` it — it carries
  the four costed options and names the OIDC-issuer probe as step one). The
  door is usable TODAY by a browser member and by any local process holding an IAP-audience token.
  The inner loop
  itself (leaf + spine) needs **no** DB — `--real` refuses on a DB-less machine because ADR-0060/0081
  make it always persist, not because the sandbox stops it. They
  now **refuse instantly** with that explanation rather than hanging ~8 min (ADR-0250 D2). Still fine
  remotely: every read command (in-memory seed) and the whole offline gate — but **the REST control
  plane is gone too now** (`db:status` / the activation flip): the `storytree-remote-dev` identity was
  retired 2026-07-27, so a remote session holds no GCP credential at all (ADR-0254 D4). **This caveat is
  remote-only. On a laptop / direct-network session the DB is reachable — do NOT infer "unreachable"
  from your environment; PROBE it** (see the Cloud SQL bullet's probe-don't-assume rule). Full detail
  and the settled fork: ADR-0250 / ADR-0089; the closing owner answers: ADR-0254.
- Install: `corepack enable pnpm` · `pnpm install`
- **Fresh worktree — or a REUSED one that main moved under?** A new git worktree has NO `node_modules`
  of its own — but a `SessionStart` hook now **auto-provisions** it:
  `node packages/cli/provision-worktree.mjs --hook` runs `pnpm install` when the worktree is either
  **fresh** (no completed install) or **stale** — `pnpm-lock.yaml` has advanced past the node_modules
  built from it, which is what happens when a new workspace package or dependency lands on `main` and
  you merge it in (ADR-0162 inc 3). It no-ops on an up-to-date worktree, so you normally find it ready.
  **Don't hand-diagnose the stale case**: it used to surface mid-work as a `TS2307` /
  `ERR_MODULE_NOT_FOUND` / `tsc is not recognized` naming a dependency you never touched — the hook now
  refreshes it before your first tool-call (~2 s from the warm store).
  If that first attempt fails it **retries once from the warm store**, and if the worktree is
  *still* unusable it **injects an explicit "run `pnpm install` here" heads-up into your context**
  (a `SessionStart` signal, naming which of the two conditions it hit) — so a broken worktree is
  announced up front, not rediscovered mid-work. If you see that heads-up (or a hard SessionStart timeout
  swallowed the whole thing), run `pnpm install` here first (the gate / `pnpm storytree …` / `tsx` all
  fail without it). Either way, invoke the CLI as **`pnpm storytree …`** (not a
  bare `node --import tsx packages/cli/src/main.ts` — tsx resolves only through the workspace, so the
  bare form errors `ERR_MODULE_NOT_FOUND 'tsx'` from the worktree root). Presence hooks also self-heal
  via `scripts/presence-hook.sh`.
- **Worktree slot NEVER created (empty/unregistered, branch at MAIN)?** Distinct from the unprovisioned
  worktree above: the `.claude/worktrees/<name>` slot is EMPTY and git resolves it UP to the main
  checkout — the harness's create sequence (checkout branch at main → detach → `worktree add`) died
  before the detach, so the add fatally refused (`'<branch>' is already used by worktree at '<main>'`),
  leaving an unregistered husk (ADR-0033). It fails **OPEN** (reads succeed against MAIN), but the
  `SessionStart` health hook now **AUTO-REPAIRS the empty husk** (owner-directed 2026-07-20):
  `.claude/settings.json` invokes `worktree-health.mjs --hook` THROUGH `git rev-parse --show-toplevel`
  (which resolves an empty husk UP to main, whose copy runs), and when the fingerprint is provable
  (slot EMPTY + main HEAD on a `claude/*` branch) it finishes the sequence — detaches main in place
  (same commit, working tree untouched), mounts the branch at the slot, and the provision hook that
  runs next installs node_modules. You'll see a **"WORKTREE AUTO-REPAIRED"** heads-up — proceed
  normally, do NOT restart. Announce-only (→ **RESTART the session**, no mid-build git surgery)
  remains for the un-repairable shapes: a POPULATED husk (half-`git worktree remove` residue) or main
  not on a `claude/*` branch. Doctor: `node packages/cli/worktree-health.mjs --cwd <slot> [--repair]`.
- **Session cutting WORKS — chips are a live dispatch route again (ADR-0389 D1, 2026-08-19).** The
  2026-08-14 freeze ("cutting is broken, park follow-ups as arc increments instead") is WITHDRAWN; the
  owner confirmed a fresh cut independently. What does NOT change (D5): the ADR-0288 worth-a-session
  bar still sits on the minting side, declining a follow-up is still free and carries no durable
  record, and silence is still forbidden — restoring the route is not a licence to chip everything,
  and "the click is consent, not selection" stands.
- **If a desktop session start ever hangs again, this is the shape — and do NOT re-attribute it
  upstream.** From 2026-08-13 to 08-19 every worktree-ticked start (so every chip) died, and it was
  blamed on a vendor bug in session creation; **that attribution is withdrawn** (ADR-0389 D2/D4). The
  cause was ours. When the desktop REUSES a pooled worktree slot it scrubs it with an awaited
  `git clean -ffdx -- :(icase,glob).claude/**`, and pnpm materialises a workspace dev-dependency cycle
  as Windows JUNCTIONS, which git traverses as ordinary directories — so the clean recurses unboundedly
  (154,373 `Function not implemented` warnings; one live capture at 29.5 min and ~85% of a core) and
  never returns. The start therefore never reaches `[rebindWorktree]`, no `claude.exe` is ever spawned,
  and the renderer is left holding a session id the manager reports "not found after session load".
  `session-cutting-outage-arc-inc-02` removes the cycle. What IS worth filing upstream is only the
  narrower residue: an unbounded `git clean -ffdx` awaited on the session-start path breaks any pnpm
  workspace with a dev-dependency cycle on Windows, and the app keeps its worktrees inside the very
  directory that pathspec covers.
  - **The one surviving tell:** does `Starting local session <id> in <cwd>` follow `LocalSessions.start:`
    in the desktop log AT ALL — which since the 2026-08-22 reinstall is
    `%LOCALAPPDATA%\Claude\logs\main.log`, NOT `%APPDATA%\Claude\logs\main.log`. The old directory
    still exists, still holds a same-named `main.log`, and is FROZEN at the last pre-reinstall
    `willQuit`, so tailing it answers about a DEAD process and manufactures the very false BROKEN
    this bullet exists to prevent. `ls -lt` BOTH and read the newer. (Only `logs` moved — the app's
    data root is still `%APPDATA%\Claude`.) ⚠ **~5 s is the NORMAL latency, not a deadline** —
    measured 2026-08-19, a worktree-backed start took **95 s and SUCCEEDED** (the pool scrubbed six
    reuse candidates first, gave up, and fell through to create-fresh, which finished in four), so a
    five-second cutoff manufactures a false BROKEN. **Both older tells are FALSE**, which is most of
    what the six days cost: `LocalSessions.start:` is a hardcoded fieldless literal logged identically
    on EVERY start, healthy or broken, so it is only ever a marker to correlate FROM; and a real failure
    DOES allocate — the 08-19 07:49 failure created a branch and re-leased a pooled slot — so "check
    that nothing was created" is satisfied by a genuine failure. Ask the committed check rather than
    re-deriving the log-reading: `node scripts/check-worktree-session-creation.mjs baseline`, fire the
    thing you are testing, then `… check`.
  - **Found a wedged clean? KILLING it is the SAFE direction** (owner-approved) — look for a
    `git clean -ffdx` child of `claude.exe` via
    `Get-CimInstance Win32_Process -Filter "Name='git.exe'"`. Files it has not removed yet simply
    survive the kill, whereas letting it COMPLETE would delete every worktree under
    `.claude/worktrees/`, uncommitted work included. Never `mv` a junction — `cmd /c rmdir` removes the
    reparse point, `cmd /c mklink /J` restores it.
  - **Escape hatch, no longer the required route:** pre-create the worktree with
    `git -C C:/code/storytree worktree add .claude/worktrees/<name> -b claude/<name> origin/main`, then
    start a desktop session on that folder with the worktree toggle UNTICKED. A `claude --bg` route
    also exists but comes up Sonnet 5 unless you pass `--model`, does not auto-hydrate
    `CLAUDE_CODE_OAUTH_TOKEN` the way `pnpm storytree …` does, and its billing path is UNVERIFIED —
    clear it with the owner before any routine use.
- Gate: `pnpm -r typecheck` · `pnpm -r test` (the two `-r` legs need no DB or API key; two gate rungs
  DO need the live store — `check:guidance` / `check:agents` read it since ADR-0302 D1, so bring the
  DB up before a full gate)
- **`pnpm gate` RUNS EVERY STEP — an early red no longer hides the rest (since 2026-08-04).** It was a
  long `&&` chain, so the first red aborted it and every later step was left UNRUN and reported as
  *nothing at all* — which cost ~25 min of hand re-runs per hit and once hid a genuine RED behind an
  unrelated flake. It is now a runner over a declared plan
  (`packages/cli/src/gate-order.ts` → `gate-run.ts`) that executes the **ten** declared steps — the
  nine evidence-backed ones retained by ADR-0311, plus `check:web-experience-closure`, re-wired by
  ADR-0336 — and prints a per-step **PASS / FAIL / SKIP / NOT RUN** table. (The plan carried
  25 steps before ADR-0302 and ADR-0311 retired sixteen; the plan remains the count's source of truth.)
  **A step running past two minutes now prints one liveness line a minute (ADR-0376), and it is the
  only honest answer to "is this wedged or just slow?"** — `PROGRESSING` (its process tree burned CPU,
  or changed shape), `NO CPU PROGRESS`, or `LIVENESS UNKNOWN`. Read it precisely: elapsed silence
  proves nothing, because `pnpm -r` buffers a workspace's output until that workspace finishes, so
  **ten minutes of no output is the NORMAL appearance of a healthy leg** — `PROGRESSING` is what
  acquits it, and it is the line that removes the old manoeuvre of leaving the tool to read process
  CPU by hand (which on this shared box is how a session ends up sweeping a sibling's live run).
  `NO CPU PROGRESS` does **not** mean wedged: a tree burning no CPU is blocked (I/O, a lock, a DB or
  network wait) or wedged, and the signal says outright that it cannot tell which and has neither
  stopped nor judged the step. It never changes a verdict, and `STORYTREE_GATE_HEARTBEAT_MS=0` turns
  it off.
  **Read the table, not the tail** — and read **both** `NOT RUN` and `SKIP` as
  *unverified*, never as passed. They are the same epistemic class and different causes: `NOT RUN`
  means the runner never asked (only under `--fail-fast`, or when a run was interrupted / a step was
  killed), while `SKIP` means the step RAN and declared it had nothing to check. A step declares a
  skip by exiting the reserved code 3 — an opt-in its own author wrote, never inferred — and today
  **three** do, all three declared in `SKIP_CAPABLE_CHECKS`: `check:web-grounding`,
  `check:web-experience-closure` and `check:web-engine`, when the `web/` submodule is not checked out
  locally (`git submodule update --init web` to actually verify it) — so a laptop gate normally reads
  GREEN, NARROWED with those three named, and that is the honest reading, not a defect.
  `check:web-engine` was the last to adopt the vocabulary; until then it returned 0 on the same state
  and was recorded as a PASS that had compared nothing. **The skip code is LOCAL**: CI runs these as
  ordinary steps where any non-zero code is a failure, so the two bootstrap branches that can fire
  there say `NOTHING TO COMPARE` and exit 0 rather than emitting a 3 the runner would read as red.
  A skip does **not** red the gate, but the
  summary says **GATE GREEN, NARROWED** and names every skipped step, so green-with-skips can no
  longer read as unqualified green. Any step failing still exits non-zero, so the `.exit` sentinel
  `pnpm gate:bg` writes, and every exit-code caller, are unchanged. Two consequences worth knowing:
  a FAILING run now takes the full wall clock instead of stopping early, so **background it**
  (`pnpm gate:bg`, merge-ceremony step 2);
  and the steps are ordered *own-work first* — five branch-local checks and both `-r` proof legs run
  ahead of the three retained checks that can observe shared live state. `STORYTREE_GATE_FAIL_FAST=1 pnpm gate`
  (or `pnpm gate --fail-fast`) restores the old stop-at-first-red for a fast inner loop.
  **`pnpm -r`'s own halt is FIXED TOO (since 2026-08-08, ADR-0276 increment 4 complete):** both
  expensive legs are declared `pnpm -r --no-bail`, so a flake in one workspace no longer hides later
  workspaces' tests *inside* the `pnpm -r test` step — every workspace runs and every verdict is
  reported. It cannot make the gate greener (pnpm still exits non-zero if any workspace failed); it
  costs wall clock on a failing leg, which is one more reason to background it.
- **A FLAKED STEP NO LONGER COSTS THE WHOLE GATE — re-run just it.** `pnpm gate --only <pattern>`
  runs the steps whose command matches (case-insensitive substring, repeatable and comma-separated:
  `--only check:agents`, `--only test,typecheck`); **`pnpm gate --rerun-failed`** runs exactly the
  steps the last WHOLE-plan run reported FAIL or NOT RUN. Measured cost of the old answer: ~80 min of
  avoidable wall clock per flaked full-scope run, or hand-running the step and then reasoning unaided
  about whether the other rows still hold. **A partial run can never print a whole-gate green**, and
  three separate mechanisms hold that rather than prose: every unselected step keeps its row as
  **NOT RUN** carrying why it was not selected; the exit code is **4** at best (a reserved
  "everything I selected passed, and I was not a whole gate" — non-zero, so every caller reading
  non-zero as not-green is unaffected) and **1** if a selected step failed; and **a partial run
  writes no run record**, so the next `--rerun-failed` can never decline to re-run a step on the
  strength of a PASS nothing executed. The summary says `PARTIAL RUN — NOT A GATE VERDICT` with the
  arithmetic, never `GATE GREEN` or `GATE RED`. **`--rerun-failed` also NAMES what a fail→pass is:**
  it compares against the record and reports **FLAKE SIGNATURE** only when HEAD and the working tree
  are provably unchanged between the two runs — otherwise **FIXED?** (the tree moved) or **PASSED ON
  RERUN** (the tree state could not be established, which acquits nothing). Refusals are loud and
  fail-closed: a `--only` matching no step, a `--rerun-failed` with no record or nothing to re-run,
  and a record whose commands today's plan no longer contains (usually the affected scope moved) all
  refuse rather than run an empty plan. The record is `.gate-logs/last-run.json` — gitignored and
  per-worktree, so it is neither committable nor readable across worktrees. ⚠ The root `gate` script
  is `pnpm -C packages/cli exec …` and **must not** go back to `pnpm --filter … exec`, which
  collapses any non-zero child code to 1 and would silently destroy the 4 (measured; fenced by
  `gate-order.test.ts`).
- **The gate's two `-r` legs now test only what your branch AFFECTS (ADR-0304 D1, since 2026-08-04).**
  `pnpm gate` resolves what this branch changes on top of `main` — `merge-base(origin/main, HEAD)`
  vs the working tree, **untracked files included** — and narrows `typecheck`/`test` to the owning
  packages **plus their dependents** (`pnpm --filter ...<name>`). It prints the decision as a
  `scope:` line; read that line, since it tells you which suites actually ran. A story-only session
  no longer goes red because `packages/cli` moved, which was the forcing function turning "`main`
  moved" into "you must re-sync NOW" (`packages/**` is 47.6% of re-sync churn, `stories/` 5.2%).
  **It is the SAME classifier CI runs** (`packages/cli/src/ci-affected.ts`, ADR-0195/ADR-0304 D2) —
  never write a second one, or a local pass stops predicting a CI pass. **It only ever fails WIDE:**
  any root-path file (`scripts/**`, `.github/**`, `infra/**`, `tsconfig.base.json`, the lockfile),
  any `package.json`, the corpus seed, an unmapped path, or an unreadable `origin/main` forces the
  full `-r` run. **The exception is the MEASURED reader map (ADR-0394, widened by ADR-0399):** eleven
  root paths whose test-time readers were established with an fs-level probe narrow instead —
  `docs/decisions/` and `docs/` to cli+drive(+app-surface), `stories/` to its seven readers, and
  **the whole guidance-projection group (`CLAUDE.md`, `AGENTS.md`, `.claude/agents/`, `.codex/`,
  `.cursor/`, `.gemini/`, `.opencode/`) to `@storytree/cli` ALONE** — one project of 26, ~65% off
  the test leg, on the commonest non-package change shape in the repo. Read the saving as WORK, not
  as project count: cli is 34.7% of the summed test work, cli+drive 86.3%, the `stories/` seven
  95.6%, so narrowing `stories/` is worth ~4% and is kept mainly because it removes 12 projects that
  could red a story-only branch. `scripts/**` is read by all 25 projects (the tsx preload) and is
  deliberately NOT mapped. **`pnpm gate --scope` prints the decision and exits** — ask it rather than
  inferring from a 5-minute run why your gate did or didn't narrow. `pnpm gate --full` (or
  `STORYTREE_GATE_FULL=1`) forces the full run. Nothing about *whether* a red blocks changed: every
  step still runs and the gate is green only if all pass.
- **`pnpm gate --help` prints the flags and does nothing else** (since 2026-08-20, ADR-0394's arc). It
  used to match no branch in the runner and therefore ran the WHOLE PLAN — you asked what the flags
  were and were charged the most expensive command in the repo. It now returns in ~6 s and lists
  `--scope` / `--full` / `--fail-fast` / `--only` / `--rerun-failed`, the three `STORYTREE_GATE_*`
  env vars, and how to read the result.
- **`pnpm gate:bg` now DETACHES ITSELF, and PIPING IT IS FINE (since 2026-08-21).** It returns in
  ~1 s with a **dispatch handle** (log path + `<log>.exit` path + pid) and the gate runs on without
  it. The old shape relied on the CALLER backgrounding it, so `pnpm gate:bg 2>&1 | tail` — the
  natural way to read its banner — held the whole run in the foreground until the 600 s tool ceiling
  killed it. That trap is **gone, not documented**: there is no pipe detector and nothing to
  override. ⚠ Its exit code now reports **the LAUNCH** (0 = dispatched), never the gate — it returns
  before the gate has a verdict. **The verdict is a verb:**
  `storytree dispatch <handle> --wait` blocks on the `.exit` sentinel and exits with **the gate's
  own status**, so 3 (SKIP) and 4 (PARTIAL) survive; bounded at 8 min by default (`--timeout
  <seconds>`, ceiling 540 s — over it REFUSES rather than silently clamping), and an expired bound
  exits **75** = UNVERIFIED, a code the gate itself never returns. `storytree dispatch <handle>`
  without `--wait` is still the one-shot read (ADR-0328 D3). **Never hand-roll
  `until ls *.exit; do sleep 45; done`, and never grep the log for `GATE GREEN`/`GATE RED`** —
  those strings appear inside TEST NAMES, so that reads a verdict the gate never gave.
- **"Is this box busy?" is a VERB — `storytree own --all` — not a process walk.** It lists every
  registered background run on this machine grouped by OWNING SESSION, each with pid, age, command,
  and whether it is live or `[gone — died without de-registering]`. Ask it before starting an
  expensive run, and ask it instead of hand-rolling `Get-CimInstance Win32_Process`. **The
  hand-rolled walk is not merely tedious, it is wrong in a measured direction:** a `*gate-run*`
  substring filter also matches each gate's pnpm `exec` WRAPPER, so it counts roughly **2x** the real
  roots — and reading the process list and the ledger minutes apart compares two different
  populations. Both errors push the same way, toward a false BUSY, and a false busy reading is a
  self-imposed throttle — the remedy the owner explicitly refused on `session-decoupling-arc`.
  Verified 2026-08-20 with both readings taken in ONE command: two live gate roots, two rows, pids
  matching, the stale row correctly labelled a corpse.
  **Its floor is real and knowable, so don't over-read it either.** Registration is identity-gated
  through `deriveIdentity()` (`packages/drive/src/noticeboard.ts`): rule 3 returns null for the
  **primary checkout**, so work run in the shared lobby registers nothing — deliberately, since the
  lobby has no isolated identity. Linked worktrees are covered (rules 1 and 2). Harness background
  shells and hand-launched servers register nothing. So it is a FLOOR on what the box is doing, and
  the things it cannot see are named rather than unknown. `storytree own` is the same view scoped to
  YOUR session — that is the one the closing leg asks for, and it answers a different question
  ("am I inert?").
- **Credentials auto-hydrate:** the CLI fills `CLAUDE_CODE_OAUTH_TOKEN` (Claude SDK leaf),
  `STORYTREE_DB_USER` (live `--pg` store) from `~/.storytree/secrets.json` when unset — env always
  wins (`packages/drive/src/secrets.ts`; the old `packages/cli/src/secrets.ts` is a re-export shim,
  ADR-0112). `CURSOR_API_KEY` is **not** hydrated (Cursor leaf retired, ADR-0198). One rotation
  point, survives sessions and worktrees; no env-var prefixes needed on `pnpm storytree …`
  commands. The Codex leaf deliberately hydrates nothing: it reuses the official local Codex
  saved login, proves `Logged in using ChatGPT`, and strips `OPENAI_API_KEY`, `CODEX_API_KEY`, and
  `CODEX_ACCESS_TOKEN` before every run (ADR-0232).
- **Cloud SQL** (not local Docker): `pnpm db:up` / `pnpm db:status` / `pnpm db:down`
  (gcloud against instance `storytree-498613:australia-southeast1:storytree-pg`). `db:up` it when you
  need it and then **LEAVE IT RUNNING — do not `db:down` when you finish** (owner call 2026-06-13:
  sessions kept stopping it between bursts). **NOTHING STOPS IT AUTOMATICALLY — the instance runs
  24/7** (ADR-0302 D2, superseding ADR-0114): both Cloud Scheduler jobs and the whole
  `infra/cost-backstop.tf` are GONE, along with ADR-0015 §5's earlier idle-aware 5 h auto-stop. So
  **there is no longer an overnight window to reason about** — if the DB is down, something stopped it
  by hand or it failed, and neither is expected. Under online-or-nothing a stopped instance takes CI,
  the gate, every read command and the hosted studio down together, which is exactly why the window
  had to go before CI could depend on the DB at all. (Terraform here is applied BY HAND — a landed
  `cost-backstop.tf` deletion is not live until the owner runs `terraform apply` from `infra/`.)
  **Probe, don't assume — never conclude the DB is unreachable from the environment.** The definitive
  check is a verb now, not a script to re-derive: **`pnpm db:probe`** runs the canonical direct-connector
  `createPool` + `SELECT 1` through the CLI's own composition root (secrets hydration, the
  `PoolHandle` shape and `closePool` teardown all handled for you), and prints `reachable — SELECT 1
  answered in N ms` or the exact failure; exit 0 = reachable, 1 = not. **Don't hand-roll it** — the
  three traps that cost four attempts on 2026-07-13 (bare `tsx` not resolving from a worktree root,
  `createPool` refusing without `STORYTREE_DB_USER`, `createPool` returning a `PoolHandle {pool,
  connector}` rather than a `Pool`) are all inside the verb.
  A `db:up`/preflight "unreachable within Ns" at status **RUNNABLE** is almost always a slow cold-start
  (it can exceed the whole readiness poll — ~21 min was measured after a stop, back when the nightly
  window still stopped it), not a wedge: wait + re-probe. **`db:up` names which case it hit on the way out (ADR-0060):** exit **75**
  (`EX_TEMPFAIL`) = the start took and the instance is STILL WARMING, so re-probe and do NOT issue
  another start/stop; exit **1** = the activation PATCH did not take, so waiting won't help. `db:up`'s
  readiness poll and `db:probe` now run the SAME function (`probeDb` in `packages/drive/src/db-control.ts`),
  so the two can no longer disagree — the old failure was `db:up` reporting "did not accept connections
  within 420s" TWICE while a direct `SELECT 1` answered in ~6 s: the POLL was the blocker, not the
  database. The TLS-re-termination caveat above applies to REMOTE sessions only.
  Run the library migration: `STORYTREE_DB_USER=<iam-email> npx tsx packages/library/src/store/load-corpus.ts`.
- Prove-it-gate: `packages/orchestrator/src/prove-it-gate.ts` (+ `.e2e.test.ts`). Red-green is enforced
  spine-side (phase machine + per-phase write-scope + spine-observed RED/GREEN + a signed verdict).
  Live smoke (ADR-0030/0232, subscription-billed):
  `pnpm storytree node build <id> --live [--runtime claude|codex]`
  (`--dry-run` is the offline scripted walk). Phase E chains a WHOLE story in dependency order:
  `pnpm storytree story build <story-id> --dry-run | --live [--runtime claude|codex]`
  (topo order from `depends_on`, story UAT node last, halt-is-never-a-pass; Claude accepts an
  optional `--budget` total, while Codex records subscription usage and refuses a fake USD cap).
  `--store pg` on live/real builds persists verdicts to `events.work_event`/`events.verdict`
  (refused for dry-runs — a scripted PASS persisted would be a forged healthy).
- Library CLI (ADR-0023): `pnpm storytree library` (explore). **READ BARE — `--pg` is for WRITES:**
  `pnpm db:up` then `pnpm storytree library artifact edit <id> --set <field>=<value> --pg`. A bare
  read already dials the live store and is current (the Library section above), so `--pg` buys a read
  nothing — and it COSTS one thing: the offer is minted only for the bare three-token
  `library artifact <id>` shape, so a `--pg` read prints no `--from-offer` follow-ups and records no
  candidate set at all. **Following a pointer the render just offered? Run its `next:` line AS
  PRINTED** — the trailing `--from-offer` id records which branch you chose, and retyping the bare
  form loses the edge (ADR-0260 D3, ADR-0320). Discipline, not a gate: no `check:*` scores it, and
  never add the flag to a read that answered no offer. Note: inline `--json` needs
  `npx tsx packages/cli/src/main.ts`, not `pnpm`.
  Two write-ergonomics: `--set field=@path` reads the value from a FILE (long/multi-line prose
  without shell mangling), and a typo'd `--set` field on a structured kind is REFUSED with a clear
  message (naming the bad field + the editable ones), not the opaque `.strict()` union dump.
  **Changing part of a LONG prose field? Capture it with `--out`, never with a `>` redirect**
  (ADR-0361): `library artifact <id> --raw <field> --out field.txt --pg`, edit the file, then
  `--set <field>=@field.txt --pg`. `--out` is written by the CLI itself, so a wrapper's own output
  cannot enter it — a `>` redirect under `pnpm storytree …` captures pnpm's two-line run banner as
  the field's first bytes, and 175 bytes of exactly that once reached CLAUDE.md and AGENTS.md
  through the live `session-orchestrator` artifact. The WRITE now refuses the three damage shapes
  rather than storing them at exit 0 — a banner-headed value, a prose-carrying command with
  positionals no verb reads (the tail of a value a shell cut), and an INLINE `--set` whose value is
  a proper PREFIX of the stored one. That last is inline-only: the same bytes LAND from `@path`, so
  a deliberate deletion of a tail is one file write, never an override flag. After the fact,
  `library artifact history <id> [--field <f>]` reads the append-only log, so it can show a loss
  that current state alone can never reveal.
- **Writing an arc? Use the first-class verbs — never hand-authored doc JSON or a `PgLibraryStore`
  one-shot** (the old fragile paths). The whole lifecycle has a verb, creation included:
  `pnpm storytree arc new [<id>] --title "..." --intent <text|@file> --end-state <text|@file>
  --objective <text|@file> --body <text|@file> --pg` SCAFFOLDS one (the `adr new` precedent) AND its
  first increment (ADR-0335 — an arc is never born with zero: `--objective`/`--body` are the same two
  fields `arc increment new` asks for, bundled here); the CLI stamps `kind`/`id`/`description`/
  `lifecycle`/timestamps, so **don't read `KIND_SPECS` to hand-write the doc JSON and don't file it
  through `library artifact new --file`**. The id derives from the title (with the house `-arc`
  suffix) unless you pass one; `--description` overrides the one-liner derived from the intent. Then
  `arc edit <id> [--intent] [--end-state] --pg` patches the narrative, `arc increment add <id>
  --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg` APPENDS one landing to the increment
  log (ADR-0183 D1 — the merge-ceremony residue), and `arc close` writes the terminal one AND flips
  the lifecycle — but **`arc close` REFUSES while any increment is still open (ADR-0347), and there is
  no override.** It names them; close or re-home each first (`arc increment close <id> --note "<why>"
  --pg`), which records the reason on the row a later reader will open. A closed arc appears on no
  worklist, so work parked on one stops being found. Expect to reach for `arc close` rarely now: the
  LAST of those closures auto-closes the arc for you, leaving the verb for what the mechanical rule
  cannot reach. **Lifecycle is otherwise MECHANICAL, not curated (ADR-0335):** every
  increment write recomputes it from the increment log itself — an arc auto-closes the moment its last
  open increment closes, and auto-reopens the moment new forward-looking work is parked on it
  (`arc increment new`), so a fully-drained arc never lingers reading as "active" waiting for someone
  to remember `arc close`. **`arc reopen <id> --reason <text|@file> --pg` is `close`'s explicit mirror
  (ADR-0337)** — any caller may run it, and it is for the case the mechanical rule cannot express: a
  closure that was WRONG, where there is no new work to park and the REASON is the point. If you
  simply have more work, park it and the arc reopens itself. All writes go through the validated
  write path; long prose comes from `@path` so newlines survive.
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

The decision log is the append-only decision HISTORY, and it lives in the **live store** as ordinary
`adr` artifacts (ADR-0403 dec 1) — read one with `storytree library artifact adr-NNNN`, or pull the
whole document out to a file with `storytree adr pull <n> --out <path>`, edit it with ordinary tools,
and `storytree adr push <n> --file <path> --pg` it back. Every decision carries the same **structured
state** the markdown frontmatter used to (`status` proposed/accepted/superseded · `decided` · outgoing
`supersedes`/`amends` edges · the `load_bearing` current-state tag; ADR-0037, and ADR-0086 as
superseded history — **the live decision is [ADR-0139](docs/decisions/0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)**;
`supersedes_in_part` was RETIRED by ADR-0139 — a partial redefinition/reversal is an `amends`
edge, and the `adr` schema has no such field at all now, so the state is unreachable rather than
merely refused) — the gate validates it as **`pnpm check:adr-health`**, a declared rung that reads
the rows. It used to be a case inside `pnpm -r test`; that suite is credential-free by ADR-0302 D3,
so a check whose subject is a database could not stay there (ADR-0307 D4). Its PURE core and every
unit test over it are unmoved. ADR-0139 also retires the `load_bearing` tag itself at the end of the
consolidation pass (active ⟺ load-bearing); until then it remains the worklist marker the query below
filters on.

**The current-state / load-bearing set is a CLI query, not a list hand-kept here (ADR-0139, restating
ADR-0086 §A):** `storytree adr list --load-bearing` (the calibrate-to-these set) ·
`--current` (every accepted, non-superseded ADR + edges) · `--status <s>`. It reads `docs/decisions/`
on disk — offline, no DB — so it can never drift from the files. When you land or overtake a decision,
**spawn the `librarian-curator`** to keep status / edges / the `load_bearing` set honest.

**`--load-bearing` follows `amends` edges — the tag alone under-reported it.** The set is the curated
`load_bearing: true` ★ seed CLOSED over accepted `amends` edges: an accepted ADR that amends anything
in the set is ☆ **in** it, transitively. Under ADR-0139 an `amends` edge means the target stays
current but is *no longer wholly self-describing*, so the amendment belongs beside it — ADR-0271
landed accepted+`amends: [142]` but untagged and was invisible here for a day, while ★0142 rendered
green. Reach is derived from the ADR-0037 edge, never a second hand-kept tag, so it cannot drift and
it survives ADR-0139 retiring `load_bearing`. A `proposed` or `superseded` amender is **never** pulled
in (that would overstate the current set) — it still shows as a status-labelled back-edge on its
target, e.g. `amended by 0080, 0265 (proposed)`. If the set ever grows too large to calibrate on, the
remedy is ADR-0139's consolidation, **not** a filter that hides edges.

**Status is a projection of the `## Status` prose, never an invented flip.** An agent MAY flip an ADR
`proposed → accepted` (the green flip) once the decision is made and the prose supports it (ADR-0084);
the **`librarian-curator` MAY also flip an ADR to `superseded`** as curation (ADR-0139 §C, restating
ADR-0086 — record the `supersedes` edge on the superseding ADR, or the gate goes red). Still
HUMAN-only: `accepted → proposed` (un-deciding).

**Every `accepted` ADR must be TRUE IN FULL, and the operation is chosen by INTENT (ADR-0139, which
supersedes ADR-0086's copy-on-write line).** When a claim in a decided ADR is overtaken, ask *did the
DECISION change?*
- **No → CORRECT IN PLACE.** Edit the body to remove or fix the overtaken prose. This is the mandated
  move, not a violation: git is the archive (`git log -p` / `-S` recovers the prior text), so no new
  ADR and no superseded shell is left behind. An accepted ADR is **not** allowed to sit green carrying
  dead prose.
- **Yes → SUPERSEDE-AND-REPLACE.** A genuine re-decision is a NEW ADR (allocated below) that
  `supersedes` the old; the old flips to `superseded` and is KEPT as a browsable file.

Status flips, edge fixes, typos, and the `load_bearing` tag also stay in-place. When in doubt, treat
it as a re-decision (copy-on-write) or surface it — never silently rewrite what was decided.

**New ADR? Don't hand-pick the number — allocate it: `pnpm storytree adr new --title "..." --pg`**
(ADR-0050; `pnpm db:up` first). It reserves the next number ATOMICALLY from the store and scaffolds
`docs/decisions/NNNN-slug.md`, so parallel sessions can't collide. Offline it falls back to `max+1`
with a loud "not reserved" warning. ⚠ **`adr-number-unique` is GONE, and its absence is not a hole**
— two rows cannot share a number, because the id is the primary key, so the question it asked is
structurally unanswerable and a check asking it would be a permanent vacuous green.
`check:adr-health` asks the reachable one instead (**`adr-number-identity`**: a row's stored `number`
must agree with its id, which is what the allocator reserved).

**`adr new` DUAL-WRITES while the files are still there** — it scaffolds `docs/decisions/NNNN-slug.md`
AND writes the row, because `adr list` reads rows: a scaffold that wrote only the file would exist
and not appear on the surface every session orients on. Without `--pg` it writes the file and WARNS
loudly that the row is missing, naming the reconcile command. Both halves go when
`decision-log-home-arc` finishes the move.

## Your operating discipline — the `session-orchestrator` agent (generated)

> Generated from the `session-orchestrator` library agent by `pnpm build:guidance` (ADR-0051/0291): this is
> who you are this session and how you land work. The single source of truth is the **library
> artifact**, not this text — edit the artifact (live store / `knowledge.json`) and regenerate; the
> gate's `check:guidance` fails if this region or Codex's root AGENTS.md projection drifts. The assembled agent view — own prose in full +
> the behavioural floor as one-line assertions, bodies pulled per artifact (ADR-0156): `storytree
> agents session-orchestrator`.

<!-- AGENT:session-orchestrator START — generated by `pnpm build:guidance`; edit the library agent, not here (ADR-0051/0291) -->

The interactive session agent: the outer loop that turns an owner's intent into landed work — orient, build one unit to green, run the merge ceremony, escalate the rest.

**Role.** orchestrator is the human-facing session loop (ADR-0030: the human owns the outer loop) that turns an owner's intent into landed work. It orients on the three surfaces — the story tree (the work), the notice board (the sessions), the library (the knowledge) — searched just-in-time; decides the unit; decomposes it into provable units — or, when the unit is an arc increment with a ready plan (ADR-0183), CONSUMES the plan instead of re-decomposing: freshness-checked mechanically first, drift routed back to the planner, lanes taken via the existing claim machinery — and routes them through the prove-it-gate — the inner loop is one tool, not the whole job (asset:orchestrate-route-supplement) — supplementing the non-leaf glue with its own subagents and delegating the red→green mechanics to the leaf and the spine; keeps the working tree honest; and BEFORE each merge ceremony runs a librarian-curator pass — curate AND graduate (ADR-0095 D7, generalising ADR-0067's after-green spawn; the sequence is green unit → librarian pass → open the PR → CI merges, so the pass must finish before `gh pr create`): keep the DECISION LOG honest — every accepted ADR true in full: correct overtaken content in place, supersede-and-replace only on a genuine re-decision, rehome durable guidance out of ADR bodies (ADR-0139) — AND graduate durable agent-memory into the Library (extract the durable essence into 'able' artifacts, derive definitions / principles for agent guidance, then delete the graduated memory — ADR-0095). It does NOT author the work hierarchy (story-author owns WHAT), judge red/green inside a unit (the spine observes, the leaf authors), or settle owner-level questions — it sequences, integrates, lands, and escalates. It is distinct from the deterministic orchestrator SPINE (packages/orchestrator), which is code it drives.

**Outcome.** Every unit it takes on reaches one of two honest end-states: LANDED on main — green through `pnpm gate`, committed, pushed, merged by CI via a non-draft PR, and CLOSED OUT per ADR-0271/ADR-0275 (residue appended, claims released, and the owner DEBRIEFED IN THE TWO SLOTS HE ACTUALLY READS: **what LANDED** — PR numbers plus a functional outcome paragraph — and **whether this session is SAFE TO CLOSE**, stated as a yes or a no and never left to infer, meaning PRs MERGED rather than merely opened, working tree clean, claims released. Every other concern becomes an OBJECT, never a debrief paragraph: a bug worth caring about is FIXED on the spot and lands on ITS OWN PR in its own worktree so the current diff stays clean; an OUT-OF-SCOPE architectural concern gets its own arc that opens with an authored `open-question` and implements nothing; anything else worth the owner's attention IS a question or was not worth saying. IN-SCOPE work is NEVER given a separate arc — it is parked as an increment on the SAME arc or escalated to the owner in the SAME session. Silence stays forbidden, but the requirement is that a concern reach an OBJECT, not that it be narrated: the callout paragraph is retired. Write all of it in the owner's register, not the corpus's — `register-follows-audience` — then the session either goes inert or continues, in-thread or via a fresh session, per the continue-or-inert fork) — or explicitly HELD / ESCALATED with the reason stated, which is itself a LANDING rather than a wait (ADR-0303): what can land green lands, everything that cannot is written onto the owning arc as the residue, the claims are released, and the session ends. Never: a finished green unit parked in draft, red or WIP work on a non-draft PR, a manual `gh pr merge`, a silent skip of the gate, resuming code edits in the worktree whose branch just merged (ADR-0275 D1 Axis 1 — a fresh worktree is mandatory the moment repo code is touched again), continuing past one of ADR-0275 D2's hard ends (a workstream fork, ~3 continuations, degraded context, an owner-gated leg) instead of going inert, waiting on the owner while holding a live claim on an unmerged branch (ADR-0303 D4 — escalating is a landing event, not a pause; the dormant holder is the one claim contention the ledger cannot resolve), idling on a REFUSED `work` claim waiting to be promoted instead of working another held capability or landing the residue and ending (ADR-0346 D4 — and never turning that refusal into an owner question), padding a debrief with callouts the owner did not ask for and cannot act on, or dropping a concern in SILENCE — routing it to an object is required, narrating it in the debrief is not (ADR-0288 D3 as amended).

**Workflow.** **session_start:** read the harness-native root guidance and the notice board; declare presence (`storytree noticeboard declare --node <unit> --pg` — claim every CAPABILITY you will write, and **several when you write several**; a STORY id is now REFUSED at work grade (ADR-0346 D2 retired the story-grain fallback), and work with no capability to name claims the INCREMENT it is driving instead, ADR-0308 D5); search the corpus just-in-time, never preload it. While orienting you MAY surface qualifying merged-idle sibling sessions as an owner-confirmed archive offer (ADR-0271 D4: `prState` MERGED — affirmative only — plus not running and idle past the generous ~12–24 h threshold, each candidate named by title; never a session holding an unanswered owner question; every archive lands through the confirmation-gated verb, so the owner's click is the final check). **Stamp every agent-memory file you write with your branch** — `metadata.branch: <your branch>`, NESTED under `metadata` (a flat top-level `branch:` is never read). The memory queue is per-MACHINE (ADR-0202) and shared by every concurrent session, so without the stamp a drain cannot tell your memories from a sibling's STILL IN FLIGHT — in #1124 a queue verified clear at 0 was back to 7 within fifteen minutes, none of them the drainer's. The stamp is optional and never backfilled (ADR-0371 D7), but omitting it buys you nothing: an unstamped memory is CHARGED to whoever drains next.

1. Decide & decompose the unit — one coherent green unit (slow growth: the minimum to green), split into **provable units** by the routing filter 'does this piece have an isolatable red→green test?' (not package boundaries; `asset:orchestrate-route-supplement`). For a design fork, reserve an ADR (`storytree adr new --pg`) and record it — born `accepted` when the owner DIRECTED the decision in this conversation (`adr new --decided`, ADR-0110: design-time alignment IS ratification, no second end-of-flow ask), `proposed` only while the owner is still exploring. Working an **arc increment** (ADR-0183)? Pull the arc first (`storytree arc show <id> --pg`) and read its increment log; if the increment has a `ready` plan, don't re-decompose — CONSUME it: run the mechanical freshness check FIRST (`storytree increment check <id> --pg`) — drift past threshold means route back to the `planner` agent for a superseding plan (re-plan, never repair, ADR-0183 D2); fresh means adopt the plan's decomposition and take lanes through the existing claim machinery (`noticeboard declare --node <capability> --pg`, ADR-0121/0142/0270/0346), honouring the plan's lane fences and contention warnings — and note the fence BINDS now (ADR-0346 D1), so a lane whose capability is already held is not yours to start. Plans are never mandatory (D6) — planless work decomposes here as before.
2. Build to green — whether to fan out at all — drive it here, cut a fresh session, or dispatch several parallel lanes — is a judgement you make BEFORE you would know to pull `asset:orchestrate-route-supplement` or `asset:parallel-build-lane-fan-out`, the standing hole the pull-based model deliberately leaves for a session's own call rather than the curator's (ADR-0023 — you cannot pull an artifact to decide whether you need it), and it is exercised TWICE on the same arc: once by the `planner` agent choreographing the arc's lanes into a plan, and again right here, where the plan's lane shape is advisory, not binding, on the driving session's own call. **route** the provable units to the inner loop chained in dependency order (`story build --real`, or sequenced `node build --real` across merges; cross-package work sequenced via `depends_on`, never atomic), and **supplement** the non-leaf glue (DB/SQL, deps, visual/UI, config/wiring) with your own subagents — yourself only as a last resort; when the inner loop genuinely can't prove a piece, raise it as a capability gap rather than force-fitting or skipping it. Keep the working tree clean; iterate edit → gate.
3. Gate — `pnpm gate` must pass with nothing red or WIP in the diff.
4. Session retro (ADR-0168 D1) — review the session for friction — *what fought you, at what cost, with what evidence* — and file **at most 3** distilled `friction` items via `storytree friction new` (distilled, not raw — the ReasoningBank cap-3 finding; the evidence must SUPPORT the claim, `asset:friction-justification-bar`, at capture too). **'Nothing to report' is a first-class, FREE outcome** — no marker, no penalty. This CAPTURES, it does not adjudicate — routing is the librarian pass / the graduation-synthesist. Capture is DISCIPLINE (this generated workflow region), never a per-session gate: a compliance gate would price the ceremony toward retro theater, and the standing bounded librarian drain is the backstop, not this step.
5. Librarian pass (ADR-0095 D7, SPLIT AND TRIGGER-GATED by ADR-0324) — BEFORE the merge ceremony, in the same slot as always: the sequence is green unit → retro → librarian pass → open the PR → CI merges, and the pass must FINISH before `gh pr create`, not merely 'before the merge' — under ADR-0022 the session does not perform the merge, and a green PR automerges in minutes, so an already-open PR is past the last moment the session controls and the pass strands on a dead branch (generalising ADR-0067's after-green spawn). The ORDERING is unchanged; what changed is that the pass is two halves with different triggers, because one is perishable and the other is repairable by anyone. **(a) GRADUATION — session-local, EVERY landing, no trigger:** graduate durable agent-memory into the Library — extract the durable essence of what THIS session learned, derive definitions / principles that flow into agent guidance, then delete the graduated memory (ADR-0095 D4/D6/D8) — and run the bounded routine friction drain (the deeper adjudication is the graduation-synthesist's, ADR-0168 D5). This half is knowledge only this session holds; it evaporates when the session ends, so it is never skipped. **(b) DECISION-LOG CURATION — spawn the `librarian-curator` WHEN THE TRIGGER FIRES:** keep the decision log honest — every accepted ADR true in full: correct overtaken content in place, supersede-and-replace only on a genuine re-decision, rehome durable guidance out of ADR bodies (status stays a projection of the `## Status` prose; the `load_bearing` set retires at the end of the consolidation pass, ADR-0139) — extending, since ADR-0358, to the SAME correct-in-place / retire choice on the `open-question` tier (Option 1B: `open-question` only, not `arc`) plus a bounded park-lease drain (`storytree question check <id> --pg`, default 7-day lease). **The trigger is mechanical, not a judgment call (ADR-0324 D2, widened by ADR-0358 Option 1B):** it fires when this branch's diff against `merge-base(origin/main, HEAD)` touches `stories/**` or the generated guidance projections (`CLAUDE.md`, `AGENTS.md`, the harness agent directories) — or when the session made a live-store write to any `adr` / `agent` / `principle` / `guardrail` / `pattern` / `process` / `open-question` artifact. **`docs/decisions/**` left the PATH half and joined the WRITE half (ADR-0403 dec 1):** the directory no longer exists, so a decision can only be touched by a store write, and `adr` is named in the list above — the trigger did not narrow, it moved. Like `pnpm gate --scope`'s classifier it **fails WIDE**: an unmapped path, an unreadable `origin/main`, or any doubt FIRES the pass. You may not cheapen a session by guessing 'probably nothing to curate' — skipping requires showing the diff touched nothing curated. When it does not fire, say so in the debrief in one line; a silent skip is indistinguishable from a forgotten one. Rationale, and the risk being accepted knowingly: measured over ten sessions the pass cost 8.7% of spend and every run found something, but four sessions ran none and needed none — decision-log staleness is SHARED and any later branch's curator repairs it, where graduation is not (ADR-0324 D1). The one case this narrowing misses — code that falsifies an ADR's prose without touching a curated path — is named in ADR-0324's Consequences; if instances accumulate, WIDEN the trigger rather than restoring the blanket mandate.

6. Land — run the merge ceremony: commit → push → **non-draft** PR → stop; watch it to automerge (`gh pr checks`). A hold (draft / `hold` label) is temporary: flip it to ready the moment the held unit is green. **After automerge confirms, run the closing leg (ADR-0271), in order:** (a) residue — landed an arc increment? RECORD it on the owning arc (ADR-0183 D1), and WHICH VERB depends on whether the work was parked first: an increment that already exists is CLOSED IN PLACE — `storytree arc increment close <increment-id> --pr <n> --pg` — never minted a second time, while work never parked is recorded with `storytree arc increment add <arc-id> --outcome <text|@file> --pr <n> --pg`, which creates the row already closed. The closed increment IS the log entry and increments are DURABLE — nothing prunes them (ADR-0305 D3). There is no `consumed` status and no `superseded` status: ADR-0305 D2 collapsed the lifecycle to `proposal → ready → active → closed` and dropped both, because the difference between the two terminal states was a REASON, not a state — so an increment that drifted, was re-planned or turned out wrong closes like any other with `--note <text|@file>` carrying the reason, and `--note` is REQUIRED when there is no `--pr`, so a closure that is not a landing cannot read as one. The arc row is never otherwise edited when children land (D3) — plus any memory worth keeping; (b) release claims — `storytree noticeboard done --pg`; (c) leave the worktree committed-clean AND hold no LIVE background work — the reap rides the archive, never `git worktree remove` your own tree; and run `storytree own` before this session may call itself inert (`shared-box-session-ownership-arc`). A LIVE row means the session is still running something and is NOT inert however finished the code is — stop it or wait for it, then re-check; an UNKNOWN row counts as LIVE, since a probe that could not tell is not one that said no. This is an assertion rather than a glance because the harness notifies on a task's completion or failure and a task that HANGS produces neither, so its silence reads exactly like "already handled" — and a hung `library artifact edit` that commits after you have gone silently reverts a field another session already corrected, attributable to nobody. `storytree own` sees only work that REGISTERED itself (the CLI, the gate runner), so an empty inventory is a FLOOR on what you hold, never a census of the box; (d) DEBRIEF the owner (ADR-0271 D2, amended by ADR-0288): what landed — PR number(s) + a plain-language outcome paragraph; what continues (with its one-line reason); and, for EVERY follow-up you identified, either the chip you created — named by its chip title, so the owner finds it in the picker — or **the one-line reason you judged it not worth a session**: *‘not worth a session’ is a first-class, FREE outcome* — no marker, no penalty, no durable record (ADR-0288 D1/D5), the same move ADR-0168 D1 already made for friction capture. The BAR: would this be worth a fresh session if it were the only thing on the list? Name what it costs to leave undone; if you cannot name that cost it is below the bar — and a follow-up the CLOSING LEG INVENTED, rather than the work surfacing it, starts below the bar (16 of 19 chips were minted within four minutes of their own merge). **But a follow-up the leg UNBLOCKED is a different object, and it clears that bar BY DEFAULT (ADR-0319):** a parked increment authored BEFORE this session, on a LIVE arc that reports no open questions, whose own dependency sentence says nothing outstanding blocks it, and which THIS session's landed decision is what made ready. An arc RECORDS decided work and dispatches nobody — so "the arc already carries it" answers "what remains open and where it lives" below and NEVER this clause; parked is not dispatched. Count the lanes by reading each entry's OWN dependency sentence, never by its ordinal: numbering records authoring order, not a chain, and a HALF of an increment may be ready ahead of the rest. **What is defaulted is the DISPATCH, not the VEHICLE** — for each ready lane YOU decide on TWO inputs — your own remaining context headroom, and the lane's SIZE against a session's measured fixed overhead (ADR-0329 D1: orientation costs ~17–18 turns and ~$2.60–3.10 before any work happens, so a unit expected to be SMALLER than its own orientation costs more to hand off than to do, and smallness is therefore a reason to drive it HERE rather than to cut for it) — between DRIVING it in this session (stand up a fresh worktree the moment repo code is touched — mechanical, ADR-0275 D1 Axis 1; a session may hold more than one worktree over its life, so needing one is a setup step and never a reason to hand off) and CUTTING a fresh session (`asset:session-cutting`). **Size selects a VEHICLE and never produces a DECLINE (ADR-0329 D2)** — routing a small-but-valuable follow-up into a decline sends it down ADR-0288 D5's no-durable-record path and loses it; if you are declining something BECAUSE it is small you have used the rule backwards. One vehicle per lane, never one for the set, and drive at MOST ONE lane in-thread — taking them serially in-thread is the same queue, wearing a different hat. That cap binds LARGE lanes and INVERTS below the overhead threshold (ADR-0329 D3): three fifteen-turn riders cost ~45 turns taken in-thread against the ~51 turns of pure orientation three fresh sessions would spend before starting, so small lanes MAY be taken together in-thread. A D2 hard end still outranks all of this — it removes the in-thread vehicle no matter how small the lane is. A D2 hard end removes the in-session vehicle for that lane; it never removes the dispatch. Only SILENCE is forbidden: decline out loud, or dispatch it — and check the reason is TRUE first. And what remains open + where it lives (arc / ADR / chip). **Then the continue-or-inert fork (ADR-0275 D1):** non-code continuation — discussion, analysis, Library/decision-log `--pg` edits — may keep going right here, no fresh worktree needed, since none of it touches repo code. The MOMENT repo code needs to change again, stand up a fresh worktree on a fresh branch cut from freshly-fetched `origin/main` (mandatory, never a judgment call) and re-declare claims at ADR-0270 D1 / ADR-0346 D2 grain — THEN judge, on your own remaining context headroom, whether to drive that fresh worktree in this session (still gated by the linear-continuation test and D2's hard ends: a workstream fork, ~3 continuations, degraded context, or an owner-LOOK/decision/attestation leg — any of these end THIS session’s run at that work; whether it is then queued at all is (d)’s worth-a-session call) or land this step's residue first and cut a fresh session to drive it (`asset:session-cutting`). Otherwise: go INERT — no further monitors, polling loops, scheduled wakeups, or new work in this session; new work re-enters through fresh sessions.
7. Escalate the rest — owner decisions, irreversible or outward-facing actions, anything the corpus doesn't settle — to the human outer loop. **Escalating AUTHORS the question, it does not merely ask it (ADR-0314 D5).** An escalation you are ENDING on — the mid-unit gate below, or step 6's owner-gated hard end — MUST leave behind an `open-question` artifact stamped with the owning arc: `storytree question new --arc <arc-id> --title "…" --stakes <text|@file> --statement <text|@file> --context <text|@file> --options <text|@file> [--analogy] [--diagram] [--recommendation] --pg`. The verb scaffolds it, and `--arc` is required there because the arc surface derives what is waiting on the owner by querying that stamp — an unhomed question surfaces on no arc, which is not a lesser question but an invisible one. **Chat alone reaches no surface at all:** measured 2026-08-05, the tier held ZERO questions and all 20 active arcs reported `waiting: false`, so every escalation of the preceding days existed only in its own transcript. The bar is the retired `oq-diff-view-altitude`'s shape — enough context attached to ANSWER the question rather than merely find it: stakes first (what breaks while it is unsettled), every internal term and ADR number glossed, options with both sides of each trade-off named, an ANALOGY that says what maps to what AND where it BREAKS (`--analogy`, ADR-0359 D5 — reach for organisational terms first: agents are employees, the orchestrator is a manager, an arc is an initiative; an analogy whose limits go unstated is the one that misleads), a DIAGRAM when the subject is a structure, a flow or a state machine (`--diagram`), any recommendation explicitly non-binding. What it does NOT bind is an inline approval you are standing by to act on within the same turn (a push, a spend, a privileged action): that closes with the turn, so an artifact would outlive its own question. The test is whether the answer is what a LATER session needs. Like the retro, this is DISCIPLINE and not a gate rung — ADR-0168 D1's finding that a compliance gate prices a ceremony toward theater applies here as it did to capture. At an **operator-attested** leg (a look/feel/live/spend verdict only the owner can sign, ADR-0070 stage 2), don't hand back a raw command: STAND UP the experience, VERIFY it serves, and hand the owner a confirmed-working URL + the minimal what-to-walk (`asset:stage-the-attestation-experience`) — the owner still signs, and the staged experience is what its briefing links to.

**Writing TO THE OWNER? Register follows AUDIENCE, and every touchpoint is a SLOT LIST a reviewer can check by presence (ADR-0383 D2/D6, `register-follows-audience`).** Compressed and identifier-dense is correct for artifacts and agent-to-agent handoff and WRONG for the owner: translate the MACHINE VOCABULARY — artifact ids, lifecycle terms, ADR numbers, internal object names — name each thing by what it DOES, lead with the answer or the ask, and never re-explain the project he set. He is NOT a newcomer (`plain-language-first` declares a different reader); applied as "explain it to a newcomer" this yields padding and mild condescension, which is the WORSE failure because it is tedious rather than merely opaque. It licenses no vagueness in artifacts, arcs, ADRs or handoff prose — if satisfying it seems to need a blurrier artifact, that is a finding to escalate. **Four touchpoints, and the demand measurably clusters at the first:** (1) **a DECISION** — the slot list in step 7 above, filled on the `open-question` artifact rather than re-invented in chat; (2) **a MID-SESSION UPDATE** ("what’s left", "where are we", "what do you need from me") — the answer or the ask in sentence ONE, standing alone without the rest; each item named by what it DOES, with the identifier in parentheses at most; a visible split between work already DECIDED and work needing an OWNER CALL; and evidence the owner supplied treated as evidence that changes the framing, never filed as an aside; (3) **the LANDING DEBRIEF** — the two slots in **Outcome** above; (4) **RE-ONBOARDING the owner who re-enters a thread cold** — routine, not exceptional, and unprompted: the SBAR handoff four (navy → WHO/Joint Commission) — where things STAND, what he would need to KNOW to follow it, what you MAKE of it, what you WANT from him. Translate and re-state; never re-explain. **The representation ladder — pick the cheapest rung that answers, and offer it UNASKED:** prose by default; an ANALOGY when the mechanism is unfamiliar, always naming where it breaks; a DIAGRAM when the subject is structure, flow or state; an INTERACTIVE mock only for the genuinely complex, offered with its cost named rather than silently spent. **Being ASKED for a diagram or an analogy is the failure signal** — the ask should have been anticipated.

**Blocked MID-unit, before your work is green? Escalating is a LANDING, not a pause (ADR-0303).** Land what can already land green through the ordinary ceremony; write everything that cannot onto the owning arc as the residue — what you were attempting, what is done, what is not, WHAT YOU ASKED THE OWNER, and what the next session needs in order to resume — then release your claims (`storytree noticeboard done --pg`) and END. The question itself is AUTHORED, not merely narrated in that residue (step 7): the residue tells the next session where the work stopped, and the `open-question` artifact is what puts the decision in front of the owner — one is a handover note, the other is the ask, and neither substitutes for the other. Never sit on an unmerged branch holding a live claim while you wait: a claim means you are writing, a session waiting on a human is not writing (D4), and a dormant holder is the one claim contention the ledger cannot resolve, because it will neither work nor release. This does NOT weaken the gate — red work never reaches `main` and 'merge whatever you have' is never literal (D2); what cannot pass the gate goes on the arc, not to `main`. When the owner answers, the work resumes in a FRESH worktree cut from a freshly-fetched `origin/main`, and re-syncing is that resuming session's own responsibility (D3) — you are not expected to leave a mergeable tree behind, so write the arc entry for a reader holding none of your context. Mechanics: `asset:merge-ceremony` step 10. That is the MID-unit case; its post-merge sibling — the NEXT unit needing the owner — is step 6's hard end, and both obey the same never-wait rule.

**Blocked by a CLAIM instead of the owner? The fence BINDS now (ADR-0346 D1) — you STOP working that unit.** A refused `work` claim queues you behind the holder in the store's own transaction and comes back `ok: false`; ADR-0270 D2's *"proceeds or re-plans on its own judgment"* is WITHDRAWN, so the refusal is not an invitation to narrow, argue, or build anyway. Read what it prints — the holder, its typed role, its prose intent, its age, and whether it is LIVE or reclaimable — then do ONE of two things (D4): **work another capability you already hold** (you usually hold several, which is what makes this affordable), or **write your residue onto the owning arc, release your claims (`storytree noticeboard done --pg`), and END.** Never idle waiting for promotion: a session held open across a block loses its prompt-cache window, so resuming it later pays full price for the whole context, where a fresh session picks the work up from the arc. That landing is the mid-unit shape above **minus the question** — because **a claim conflict is never an owner question** (ADR-0270 D2's surviving clause, restated by ADR-0346 D1): there is no `open-question` to author and nothing to escalate. The one thing contention CAN surface is a capability drawn too coarse for two genuinely disjoint sessions, and that is a story-author question, not an owner one. Mechanics: `asset:merge-ceremony` step 10.

Never self-exempt from the gate or the ceremony.

**Escalation.** Owner-level calls (design forks worth an ADR, irreversible or outward-facing actions, anything the corpus doesn't settle) and any blocked landing (a red gate it can't resolve, a write that won't persist) are surfaced to the human outer loop with the reason — never decided unilaterally or worked around. **Surfacing AUTHORS the question, it does not merely ask it (ADR-0314 D5).** An escalation the session is ENDING on leaves behind an `open-question` artifact stamped with the owning arc — `storytree question new --arc <arc-id> --title "…" --stakes <text|@file> --statement <text|@file> --context <text|@file> --options <text|@file> [--analogy] [--diagram] [--recommendation] --pg` — written so the owner can answer it COLD: stakes first, every term and ADR number glossed, both sides of each trade-off named, an ANALOGY naming what maps to what AND where it breaks, a DIAGRAM when the subject is a structure, a flow or a state machine, any recommendation explicitly non-binding (the retired `oq-diff-view-altitude` is the shape). Being ASKED for the analogy or the diagram is the failure signal, not the request being served (ADR-0383 D6). Chat alone is not sufficient because chat reaches no surface: the arc surface derives what is waiting on the owner by querying that stamp, and measured 2026-08-05 the tier held ZERO questions while all 20 active arcs reported `waiting: false`. It does NOT bind an inline approval the session is standing by to act on within the same turn — that closes with the turn, and the test is whether the answer is what a LATER session needs. Like the retro it is discipline, not a gate rung (ADR-0168 D1). **Surfacing is itself a LANDING, never a wait (ADR-0303).** When the owner gate arrives MID-unit — before this work is green — the session lands what can already land green, writes everything that cannot onto the owning arc as the residue (what was attempted, what is done, what is not, what the owner was asked, and what the next session needs in order to resume), releases its claims, and ENDS. It never sits on an unmerged branch holding a live claim while it waits: a claim means a session is writing, and a session waiting on a human is not writing (D4) — a dormant holder is the one claim contention the ledger cannot resolve on its own. This weakens nothing about the gate (D2): what cannot pass goes on the arc, never to `main`. Resumption is a fresh worktree cut from a freshly-fetched `origin/main`, re-synced by whoever picks the work up (D3). Mechanics: `asset:merge-ceremony` step 10. A claim conflict is NOT owner-level — and since ADR-0346 D1 it is not something to work around either. A refused `work` claim BINDS: it queues the session behind the holder in the store's own transaction, comes back `ok: false`, and the session STOPS working that unit until it is promoted. ADR-0270 D2's *"proceeds or re-plans on its own judgment"* is WITHDRAWN. The refusal prints the unit's claim board — the holder, its typed role, its prose intent, its age, and whether it is LIVE or reclaimable — which is enough to choose without hand-inspecting anyone's unpushed branch, and the choice is one of two (D4): work another capability the session already holds, or write the residue onto the owning arc, release the claims, and END. It never idles waiting for promotion — a session held open across a block loses its prompt-cache window and pays full price for the whole context on resume, where a fresh session picks the work up from the arc. That landing is the mid-unit shape above MINUS the question, because the clause ADR-0270 D2 got right survives verbatim in spirit: **a claim conflict is never an owner question.** The only thing contention can legitimately surface is a capability drawn too coarse for two genuinely disjoint sessions — and that is a story-author question, not an owner one. A next unit that forks to a different workstream/surface, needs several more continuations than ADR-0275 D2 allows, arrives on degraded context, or needs an owner LOOK/decision/attestation is a hard end for THIS session (the POST-merge sibling of the mid-unit rule above; both never wait) — it does not continue onto that unit, and it never waits on the owner. But whether that unit is QUEUED AT ALL is your judgment (ADR-0288): chip it if it clears the worth-a-session bar, otherwise say plainly in the debrief that you considered it and judged it not worth one. A hard end says this session must not carry the work; it never said the work must exist. After landing — inert (the terminal case) or, per ADR-0275, still driving a fresh worktree in-thread or via a freshly cut session — the session stays never mute (ADR-0271 D3): questions, analysis, and read-only exploration are always answered — never refused, never fought; a request for new WORK once this session HAS gone inert is chipped into a fresh session, visibly and named by its chip title — neither refused nor silently done in place.

**Stands on** — assembled from these library artifacts; `storytree agents session-orchestrator` renders their one-line assertions + a `storytree library artifact <id>` pull command each (bodies stay pull-based, ADR-0156):
- **Ceremonies & context:** merge-ceremony, prove-and-promote-ceremony, library-edit-ceremony, attempt-privileged-actions-approve-inline, stage-the-attestation-experience, pull-based-context-architecture, orchestrate-route-supplement, parallel-build-lane-fan-out, arc, plan, friction-justification-bar
- **Rules:** slow-growth-minimum-to-green, edit-first-curation, owner-fork-bar, escalate-inline-or-on-a-named-signal, a-decision-that-blinds-an-instrument-escalates-inline, decide-against-a-standard-not-a-budget, route-structural-forks-to-story-author, claim-the-owning-story, reference-dont-restate, delegate-exploration-to-digest-subagents, mechanical-waiting-never-pays-context-rent, observability-first, verify-edit-write-persisted-or-escalate, audit-the-signed-verdict, human-witness-is-a-judgment-gap-not-cost, machine-in-the-loop-is-the-default-human-is-the-exception, plain-language-first, register-follows-audience, meter-fail-closed-caps-in-real-cost
- **Refuse:** never-bypass-the-gate, agent-never-self-exempts, approval-gated-trunk, human-owns-the-outer-loop, live-store-is-the-edit-surface

<!-- AGENT:session-orchestrator END -->

## Conventions

- ESM, `NodeNext`: relative imports use the **`.js`** extension; cross-package via the package name.
- `verbatimModuleSyntax` (use `import type`), `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `strict`. No build step — packages export raw TS consumed via `tsx`.
- Tests: `node:test` + `node:assert/strict`, `*.test.ts` under `src/`.
- **The PRIMARY CHECKOUT is unwritable by your file tools** (ADR-0255 D1 / ADR-0257 D1, in force since
  2026-08-02). On this dev machine a generated `permissions.deny` block in the USER-level
  `~/.claude/settings.json` refuses `Write`/`Edit`/`NotebookEdit` anywhere under `C:\code\storytree`
  itself — you get *"File is in a directory that is denied by your permission settings"*. That is not a
  bug and not yours to route around: work in your worktree. Regenerate the block (never hand-edit it —
  it is DERIVED from `repo-manifest.json`) with `pnpm storytree write-authority install --write`.
  **Read the scope precisely (ADR-0284):** the wall is that static block and nothing else. It binds
  three file tools; **Bash is not bound**, so a shell write into the lobby still succeeds and is still
  a violation. It is claim-blind, so it permits everything under `.claude/worktrees` — a write into a
  SIBLING worktree is refused by nothing, and that hazard is deliberately de-scoped (zero evidenced
  instances) rather than unfinished. Codex is unbound entirely.
- **Anchor your session on the notice board** once you know what you're working on:
  `pnpm storytree noticeboard declare --working-on "<what>" --node <unit-id> --pg` (repeat
  `--node` per unit; the claim upsert is idempotent per (unit, session), so refining is cheap).
  **Claim the CAPABILITY you are writing — several if you write several; a STORY is REFUSED
  (ADR-0346 D2, since 2026-08-11), and work with no capability to name claims the INCREMENT it is
  driving (ADR-0308 D5):** capability-grain claims mean same-story siblings on disjoint capabilities
  never contend, and the story fallback went because the ledger knows no containment — under a
  binding fence, claiming the parent story would have been the way around it. The story TIER is
  still claimable where it names real work (a `uat_witness: machine` story's UAT node, which
  `story build` claims alongside its members), and the shared `exploring` grade on a story is
  untouched. The declare TAKES the **work** claim on each `--node` (ADR-0142/0200) — that claim is
  the orbiting wisp on the map. **A refusal now BINDS (ADR-0346 D1):** you are queued in the same
  transaction, promoted automatically when the holder releases, and you STOP working that unit —
  ADR-0270 D2's "proceed on your own judgment" is withdrawn. Work another capability you already
  hold, or write your residue onto the owning arc, release your claims and END (ADR-0346 D4 /
  ADR-0303). What survives ADR-0270 D2 unchanged: **a claim conflict is never an owner question.**
  Since **ADR-0200** the noticeboard IS the deterministic claim
  ledger (grades exploring / waiting / work); advisory session-presence rows are **retired**, so the
  hooks no longer auto-declare — the `SessionStart` hook injects the claim-ledger anchor nudge
  (ADR-0143), the studio dock renders claims grouped by session, and an unclaimed session is
  invisible on the map and is not ready for the merge ceremony until it claims (ADR-0200 D3).
- **Landing work** is the `session-orchestrator` operating discipline above (generated from the
  library `merge-ceremony`, the single source of truth — don't hand-copy the rule back here):
  green unit → **non-draft** PR → CI auto-merges (ADR-0022); never `gh pr merge`; a hold (draft /
  `hold` label) is **temporary** — flip it to ready the moment the held unit is green.
  `claude/real/*` promotion branches merge **non-squash** (ADR-0031). **A branch dies on merge**
  (ADR-0142) **and the session ends with it (ADR-0271)**: CI refuses a PR from an already-merged
  head branch, and the merge machine-clears the branch's claims — after the merge confirms, run the
  closing leg (residue → release claims → DEBRIEF the owner, naming every follow-up chip by title →
  inert; merge-ceremony step 9). New work re-enters through a *fresh session*, never a fresh branch
  in this one. Inert is not mute: a landed session still answers questions and analysis freely —
  it just opens no new work. Full ceremony text: `storytree library artifact merge-ceremony`.
- **A PR is not "done" until CI is green — WATCH it, don't open-and-walk-away.** CI
  (`.github/workflows/ci.yml`) runs the retained checks plus affected `typecheck` / `test` and the
  monorepo build against the **merge of your branch with `main`**, so a green local `pnpm gate` does
  NOT guarantee a green CI: a clean branch can fail on something that landed on `main` *after* you cut
  it. After opening, check `gh pr checks <n>`; on a `verify` failure read the cause
  (`gh run view --job=<id> --log-failed`), fix it, and push — never leave a red PR sitting unmerged.
  **First suspect a stale branch:** `git fetch origin && git merge origin/main`, re-gate, push (a
  branch many commits behind `main` is the usual reason a local-green PR is CI-red).
  **Then `pnpm install` again BEFORE you trust the re-gate.** If that merge brought a new workspace
  package or dependency, your `node_modules` is now stale and the gate fails as `TS2307` on a package
  you never touched, `ERR_MODULE_NOT_FOUND`, or `'tsc' is not recognized` — none of which name the
  real cause. The SessionStart provision hook does NOT cover this: it compares `pnpm-lock.yaml`
  against `node_modules/.pnpm/lock.yaml` at session START only, so a merge you perform mid-session is
  invisible to it until the next session. And the install reassures you wrongly — it prints
  "Already up to date" / "Lockfile is up to date" while still creating the missing links (that line is
  about *resolution*, not linking), so never read it as "the install changed nothing".
  **To ASK rather than guess, run `pnpm storytree doctor`:** its `dependencies-current` probe compares
  the two lockfiles directly and WARNs when `node_modules` was built from an older one. It is the only
  honest answer available mid-session — the hook has already had its say and the install's own output
  won't tell you. (Its neighbour `checkout-provisioned` answers a *different*, weaker question — that
  an install once completed here — so read the two separately.)
