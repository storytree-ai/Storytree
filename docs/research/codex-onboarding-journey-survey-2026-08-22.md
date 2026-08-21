# The Codex onboarding journey — the actual end-to-end survey

**Date:** 2026-08-22 · **Arc:** `codex-onboarding-journey-arc` · **Increment:**
`codex-onboarding-journey-arc-inc-01` · **Decisions:** ADR-0232, ADR-0291, ADR-0356, ADR-0381,
ADR-0390

This is the baseline the increment asked for: what a person on a host with nothing installed
actually has to do to use Codex with storytree, in order, with the actor for each step, the artifact
that proves the step took, and whether anything can CHECK that proof. Plus the two inventories the
increment named — every single-tenant value, and every step that can fail while presenting as
success.

It is a survey. It builds nothing and proposes no tooling; §7 names the increments it decides.

---

## 0. Read this first — the arc's chartering premise is two days out of date

The arc was chartered **2026-08-18**. **ADR-0390 landed 2026-08-20**, and it did not merely change
the answer — it deleted the subject. Three specific statements in the arc's own intent are now
false, and a session that acts on them will spend its budget surveying machinery that is not there:

| The arc's intent says | Measured 2026-08-22 |
| --- | --- |
| "the cloud identity is compiled in… `CLAIM_WRITER_DATABASE_USER` and `CLAIM_WRITER_SERVICE_ACCOUNT` in `packages/notice-board/src/codex-broker/resident.ts`" | **That file does not exist.** Deleted by `67704848` ("retire Codex containment machinery"), together with the whole broker, the containment generator, and the esbuilt bootstrap payload — 26 files, including the two operator runbooks in `infra/`. |
| "the three payloads must be staged by hand under `%ProgramData%` before anything can be generated; the install needs an elevated shell and ~35 minutes" | **There is no install.** `C:\ProgramData\OpenAI\Codex\requirements.toml` was renamed `requirements.toml.disabled-adr0390-20260820-130955` on 2026-08-20 13:09, and the generator that produced it is deleted. |
| "NOTHING answers 'is my Codex setup correct?' short of running the fence harness by hand" | Still true, and now more so: **there is no fence and no harness.** Nothing answers the question at all. |

The briefing this session was handed said the containment boundary "STANDS until the owner
personally runs `infra/codex-boundary-withdraw.ps1 -Apply`". **The owner ran it.** Verified on the
machine two ways: the managed config is renamed out of the way (above), and the deny ACEs are gone —
`icacls C:\code\storytree` returns allow entries only. The arc `codex-factory-parity-arc` is
`closed`, and its increment `codex-parity-withdraw-the-boundary` records the operator action.

**Nothing in this survey removes a fence.** The fence was removed by the owner two days before this
session started; this records that it is gone, which is a different act.

### What that does to the arc's end state

The arc's end state opens with *"the cloud identity a host needs is either provisioned by a
recorded, re-runnable procedure or explicitly declared out of scope with the reason."* That clause
is **dissolved, not answered**: there is no Codex-specific cloud identity any more. Under ADR-0390 a
Codex session authenticates to the database exactly the way a Claude session does — the operator's
own ADC plus `~/.storytree/secrets.json`. The two service accounts that were minted for the broker
survive in GCP with nothing reading them (§5, item 6).

What survives of the end state, and is still entirely unmet, is the rest of it: **one named
sequence** instead of a reconstruction, and **a doctor-style surface that answers whether the setup
took**.

---

## 1. There are two journeys, and they are not the same journey

Conflating them is the first thing that goes wrong, because they need different things and only one
of them involves the Codex product at all.

- **Journey A — Codex as the interactive session driver.** A person opens Codex Desktop (or the
  `codex` CLI) on this repository and it runs the `session-orchestrator` loop: orient, claim,
  build, gate, land. This is what "using Codex with storytree" usually means.
- **Journey B — Codex as the prove-it leaf** (`--runtime codex`, ADR-0232/ADR-0356). The
  deterministic spine drives one `codex exec` turn per phase inside a disposable replica and
  promotes an exact target set. This is a *build tool*, invoked by whichever session is driving —
  which may well be a Claude session.

They share the workspace prerequisites (§2) and **one non-obvious coupling**: Journey B's
authentication is a side effect of Journey A's login (§3, step B2). Nothing in the repository says
so.

---

## 2. Journey A — the interactive driver, step by step

Actors: **operator** (a human at the keyboard), **elevated operator** (needs admin), **agent** (a
session running commands), **product** (Codex does it for you).

| # | Step | Actor | Artifact that proves it took | What can CHECK that proof |
| --- | --- | --- | --- | --- |
| A1 | Install git, Node 24, pnpm via corepack | operator (installers may elevate) | `git --version`, `node -v` ≥ 24, `pnpm -v` | ✅ `storytree doctor` → `git`, `node`. `infra/install.ps1` `@step:git` / `@step:node` / `@step:pnpm` |
| A2 | `gh` CLI, GitHub device sign-in, clone | operator (types the one device code) | the checkout on disk | ✅ `doctor` → `repo-fetchable`. `@step:gh-cli` / `@step:github-auth` / `@step:clone` |
| A3 | `pnpm install` at the repo root | agent or operator | `node_modules/.modules.yaml` | ✅ `doctor` → `checkout-provisioned`, `workspace-linked`, `dependencies-current`. `@step:provision` |
| A4 | **Install the Codex product** (Desktop or CLI) | operator | `codex --version` | ❌ **nothing.** `doctor` probes `claude-cli`; there is no `codex-cli`. `install.ps1` has no Codex step |
| A5 | **Log in to Codex with a ChatGPT account** | operator (interactive, browser) | `~/.codex/auth.json`; `codex login status` → `Logged in using ChatGPT` | ❌ **nothing.** `doctor` probes `claude-login`; there is no `codex-login` |
| A6 | **Trust this directory in Codex, and choose the approval policy** | operator, editing `~/.codex/config.toml` | `[projects.'<path>'] trust_level = "trusted"`, and `approval_policy = "never"` if wanted | ❌ nothing. Documented once, in `docs/model-onboarding.md` §4 step 4 |
| A7 | **Generate the guidance projections** — `pnpm build:guidance && pnpm build:agents` | agent (needs the live DB up) | root `AGENTS.md` (ADR-0291) and the 10 files in `.codex/agents/*.toml` | ✅ **`check:guidance` + `check:agents`, both in `pnpm gate`.** The only mechanically checked step in either journey |
| A8 | **Get a worktree** | product, or operator by hand | `git worktree list` shows it | ⚠️ partial. `storytree worktree create --runtime codex` deliberately REFUSES (`packages/cli/src/worktree-create.ts:476`) — Codex Desktop owns `~/.codex/worktrees/*` |
| A9 | **Provision that worktree** (`pnpm install` in it) | the session itself | `node_modules/.modules.yaml` in the worktree | ⚠️ `doctor dependencies-current` if you run it there. **No hook does this for Codex** (§6, S-6) |
| A10 | Database access — ADC plus the IAM email | operator | `gcloud auth application-default print-access-token`; `~/.storytree/secrets.json` carrying `STORYTREE_DB_USER` | ✅ `pnpm db:probe` (exists as a verb; **not** one of doctor's probes) |
| A11 | **Declare on the notice board** — `pnpm storytree noticeboard declare --node <capability> --pg` | agent | the claim row; the wisp on the map | ✅ the declare's own refusal is the check (`IDENTITY_REFUSAL_BODY`) |
| A12 | Drive the loop — gate, non-draft PR, automerge | agent | the merged PR | ✅ `pnpm gate`, CI |

**Steps A4, A5 and A6 are the whole Codex-specific part of Journey A, and not one of them is
installed, checked, or scripted.** A1–A3 and A10–A12 are the ordinary storytree setup every runtime
shares; A7 is generated and gated. So the honest shape of "setting this project up for Codex" is:
*the shared setup, which is well covered, plus three unattended manual steps and one refusal.*

### What A8 actually produces, and why it matters downstream

Two shapes of Codex worktree exist on this host today, and they behave differently:

- **Product-managed** — `~/.codex/worktrees/<4-hex>/storytree`. 16 of them. Git names their admin
  directories `storytree`, `storytree1` … `storytree15`.
- **Hand-made** — `~/.codex/worktrees/<meaningful-name>`, created with a plain `git worktree add`.
  24 of them, e.g. `fix-uat-real-electron-launch-classifier`.

Session identity is derived from git topology alone (`deriveIdentity`,
`packages/drive/src/noticeboard.ts:196`) — rule 2 takes the basename of the worktree's git admin
directory. Both shapes therefore work, which is settled and correct (ADR-0033 D1, widened precisely
because a `.codex/worktrees/<n>/storytree` tree was being refused). But the *identity you get* is
very different: a hand-made tree announces itself as `fix-uat-real-electron-launch-classifier`,
while a product-managed one announces itself as `storytree7`. See §6, S-5.

---

## 3. Journey B — the prove-it leaf, step by step

| # | Step | Actor | Artifact that proves it took | What can CHECK it |
| --- | --- | --- | --- | --- |
| B1 | A1–A3 above. **`pnpm install` IS the Codex install for the leaf** | agent | `packages/agent/node_modules/@openai/codex/bin/codex.js`, version 0.145.0 | ✅ the install; `packages/agent/package.json` pins `@openai/codex ^0.145.0` |
| B2 | **The ChatGPT saved login must already exist** | operator, via A4–A5 | `codex login status` emitting exactly `Logged in using ChatGPT` on one channel and nothing on the other (`packages/agent/src/codex-author.ts:130`) | ✅ the leaf refuses closed: `Codex subscription auth required; login status was '<detail>'` (`codex-author.ts:855`) |
| B3 | **No metered key in the environment** | operator | `OPENAI_API_KEY` / `CODEX_API_KEY` / `CODEX_ACCESS_TOKEN` absent | ✅ `scrubMeteredCodexAuth` strips all three case-insensitively before both child processes (`codex-author.ts:113`). An API-key fallback is forbidden (ADR-0232) |
| B4 | Run it — `pnpm storytree node build <id> --live --runtime codex` | agent | the spine's signed verdict | ✅ the prove-it gate. `--budget` is refused (subscription quota, not USD) and `--max-turns` is fixed at 1 (`packages/drive/src/node-build.ts:1258`, `:1267`) |
| B5 | For `--real`, the live DB as well | agent | `events.verdict` rows | ✅ `ensureLiveDb` self-starts it |

**The leaf hydrates no secrets, deliberately.** Unlike the Claude leaf — which auto-fills
`CLAUDE_CODE_OAUTH_TOKEN` from `~/.storytree/secrets.json` — the Codex leaf reads the official saved
login and strips every key variable. The consequence is B2: **`pnpm install` gives you the binary
and never the credential.** The credential is `~/.codex/auth.json`, and only a Codex sign-in writes
it — journey step A5.

Verified on this host: the pinned wrapper at `packages/agent/node_modules/@openai/codex` is version
0.145.0 and answers `Logged in using ChatGPT`, reading an `auth.json` that the interactive product
wrote. **Not verified, and worth settling in the journey document:** that wrapper also exposes
`codex login`, so it may be able to establish the credential itself without a separate product
install — which would make the leaf independently set up. Nobody has tried it, and the leaf's own
status check cannot tell which client wrote the file, so today's honest statement is the
conservative one: on this host the credential came from the interactive product.

**The leaf runs `--sandbox danger-full-access`** (`codex-author.ts:256`) — deliberate under ADR-0390,
which withdrew the managed profiles. The phase boundary is now the disposable replica plus the exact
promotion manifest, not an OS fence. (The file's own header comment has not caught up; §6, S-8.)

---

## 4. What the two journeys are missing that the Claude path gets for free

This is the sharpest asymmetry the survey found, and it is invisible from the source tree because it
lives in `.claude/settings.json`:

| Mechanism | Claude | Codex |
| --- | --- | --- |
| Worktree health auto-repair on session start | `worktree-health.mjs --hook` | — |
| `pnpm install` provisioning (fresh **or stale** worktree) | `provision-worktree.mjs --hook` | — |
| Presence / claim-ledger anchor nudge | `presence-hook.sh start` | — |
| Worktree prune | `worktree-prune-hook.sh` | — |
| Just-in-time definition injection per prompt | `definition-injection.mjs` (`UserPromptSubmit`) | — |
| Status line | `presence-hook.sh statusline` | — |
| Root guidance projection | `CLAUDE.md` region | `AGENTS.md` (ADR-0291) ✅ |
| Subagent surface | `.claude/agents/*.md` | `.codex/agents/*.toml` ✅ |

`.codex/` in this repository contains exactly one thing: `agents/`. Both projections are generated
and drift-gated, so the *knowledge* half of Codex onboarding is genuinely at parity. The *mechanical
self-healing* half does not exist for Codex at all.

Worth stating precisely, because it would be easy to overstate: **this is not currently breaking
anything.** 40 of the 41 registered Codex worktrees on this host have `node_modules`. Provisioning
is happening — the session does it, rather than a hook — and it is working. What is absent is the
mechanism that announces the failure case, which is exactly the class of gap the arc exists to close.

---

## 5. The single-tenant inventory

Every value below was checked against the current tree. The judgment column is the increment's ask:
configuration, deliberate limit, or open question.

| # | Value | Where | Judgment |
| --- | --- | --- | --- |
| 1 | GCP project `storytree-498613` | `packages/drive/src/db-control.ts:18` (a const, no override); `packages/library/src/store/connection.ts:24` (a *default*, overridable via `createPool({instanceConnectionName})`); the CI workflows | **Open question — but NOT a Codex one.** This is the project-wide database coupling that Claude, CI and the hosted studio share identically. A second host needs its own instance, schema and IAM regardless of runtime. It belongs to whatever arc owns tenancy, not here |
| 2 | `DEFAULT_CODEX_MODEL = "gpt-5.6-terra"` | `codex-author.ts:27` | **Configuration.** `--model` overrides it |
| 3 | `@openai/codex ^0.145.0` | `packages/agent/package.json`, `packages/drive/package.json` | **Deliberate limit.** The leaf pins its own CLI so a phase slice is reproducible |
| 4 | `STORYTREE_CODEX_EXECUTABLE` | `codex-author.ts:28`, validated absolute at `:398` | **Configuration** — and undocumented anywhere outside the source |
| 5 | `~/.codex/worktrees` as the Codex worktree root | `packages/cli/src/worktree.ts:615`, `worktree-create.ts:376` | **Deliberate limit.** Codex Desktop owns the directory; storytree refuses to mint or reap in it |
| 6 | `storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com` and `storytree-codex-claim-reader@…` | GCP only — **no repository reference survives** | **Open question, owner cloud-IAM.** The writer's only consumer was deleted 2026-08-20; the reader's revocation was owed since 2026-08-18 and rode the retire increment without being performed. Two live identities, nothing reading either. ⚠️ the two differ by one word in the same members lists |
| 7 | Windows group `CodexSandboxUsers`, holding `(OI)(CI)(M)` on `C:\code\storytree` | host ACLs, this machine | **Residue.** `infra/codex-boundary-withdraw.ps1` removes DENY entries; the ALLOW grants the install added were left behind. Harmless (Codex now runs as the operator), but it is boundary state outliving the boundary |
| 8 | ~~`CLAIM_WRITER_DATABASE_USER` / `CLAIM_WRITER_SERVICE_ACCOUNT`~~ | ~~`packages/notice-board/src/codex-broker/resident.ts`~~ | **Gone.** The arc's headline single-tenant finding. The file was deleted 2026-08-20 |

**The finding that matters:** the arc's "RIGHT, and it is architecture rather than configuration"
paragraph — the compiled-in Codex cloud identity — **has dissolved.** After ADR-0390 there is no
Codex-specific cloud identity, so there is nothing Codex-specific to parameterise. What is left is
row 1, which is the whole project's tenancy question and has nothing to do with Codex.

The survey's own warning to itself was right for the wrong reason. The increment said *"resist
parameterising the identity until the journey is written down, because the identity may not be the
binding constraint."* It was not the binding constraint; it was not a constraint at all.

---

## 6. The silent-failure inventory

Every step that can fail while presenting as success. Ordered by how much time it would cost a
person who did not already know.

**S-1 — Five research documents read as instruction and describe deleted machinery.**
`docs/research/codex-{actuator-appserver-reachability,boundary-reinstall-adr0375,claim-writer-scoped-identity,desktop-task-rebinding-probe,lobby-to-write-install-and-fence}*.md`. None carried a
supersession marker. The reinstall document has a §8 "commands" section describing a ~35-minute
elevated install of a boundary whose generator no longer exists; the operator would get a long way
in before anything refused. `codex-retire-the-containment-machinery` explicitly asked for these to
survive "as history rather than instruction" and that half was not done. **Corrected in this
increment** — each now opens with a dated historical-record banner. This is the sharpest trap in the
inventory and the only one this survey repaired, because it is five lines and the alternative is a
person spending half an hour installing nothing.

**S-2 — `storytree write-authority` advertises a subcommand that was deleted.** Its help lists
`codex --pg   DRY RUN: generate the current Codex containment bundle`, and its `next:` block offers
the same line. Running it returns `unknown write-authority command "codex". try: rules | install` —
and then re-prints the dead verb in the `next:` offers underneath the refusal. The help text also
still cites ADR-0355, superseded. A person following the printed offer is sent in a circle.

**S-3 — `storytree doctor` says "setup is healthy" on a host with no Codex.** Eleven probes; two of
them (`claude-cli`, `claude-login`) are runtime-specific and neither has a Codex counterpart. Run
today on this host it reports `0 failing, 2 warning, 9 passing — setup is healthy`. It would report
the same on a host where Codex had never been installed. This is precisely the surface the arc's end
state asks for, and it exists — it just does not know Codex exists.

**S-4 — `infra/install.ps1` produces a host that cannot run Codex, silently.** Eight `@step:` markers,
ending at `@step:claude-cli`. There is no Codex step. The installer completes successfully and says
nothing.

**S-5 — Codex session identity is opaque and recycled.** A product-managed slot yields session id
`storytree`, `storytree1` … `storytree15` (git's admin-directory name, deduped by suffix). Two
consequences: on the notice board and the map, a Codex session is a number rather than a name, so an
operator cannot tell what `storytree7` is doing; and because git reassigns the lowest free suffix,
**the ids are recycled** — a new slot can inherit an id whose previous occupant left stale claims.
There is no detector for that. Hand-made Codex worktrees do not have the problem, which is probably
why 24 of the 40 registered ones are hand-made.

**S-6 — no Codex counterpart to any of the six Claude session hooks** (§4). The most consequential
is provisioning: a fresh or stale Codex worktree that is not `pnpm install`ed fails later as
`TS2307` / `ERR_MODULE_NOT_FOUND` / `'tsc' is not recognized`, naming a dependency nobody touched.
The Claude side hit exactly this and built a hook for it (ADR-0162 inc 3). On the Codex side it
currently works because sessions do it themselves.

**S-7 — 38 of 78 `~/.codex/worktrees` slots are unregistered husks.** Storytree's reaper excludes
the directory on purpose (`worktree.ts:615` — "Codex owns its own hygiene"), which is the right
ownership rule. But nothing is actually draining them, so "Codex owns its own hygiene" is currently
a statement about who is responsible rather than about what happens.

**S-8 — `codex-author.ts`'s header claims a fence it no longer has.** Line 8 says the CLI runs "with
network disabled"; `buildCodexExecArgs` passes `--sandbox danger-full-access` (`:256`), which
disables nothing. The nearby ADR-0390 note is correct — the header bullet above it was not updated
with it. A reader auditing the leaf's isolation is told the wrong thing by the file's own summary.

**S-9 — `codexProductionReplicaRoot`'s comment names a profile that no longer exists.**
"Ignored, managed-profile-writable parent for real Codex phase replicas" (`codex-author.ts:451`).

**S-10 — `~/.codex/config.toml` accumulates trust entries and nothing prunes them.** 46
`[projects.…]` blocks, 36 of them naming `%TEMP%\storytree-codex-workspace-*` directories that were
deleted long ago. Product-owned host state; noted because it is part of what "a host set up for
Codex" actually looks like after a few weeks, and because it is per-user and never migrates.

**S-11 — the one existing Codex onboarding step points at a withdrawn file.**
`docs/model-onboarding.md` §4 step 4 tells the reader to set `approval_policy` in `~/.codex/config.toml`
and "**not** to `requirements.toml`". The advice is still right; the file it names as the wrong place
no longer exists on a correctly-configured host, which will read as a live managed-config path to
anyone who goes looking for it.

---

## 7. What this survey decides

The journey is **much shorter than the arc assumed**, and its gaps are concentrated in three manual
steps and one missing instrument rather than spread across a cloud-provisioning problem. That
changes the shape of the remaining work substantially.

**Now clearly worth doing:**

1. **Write the journey document** — Journey A and Journey B as one named sequence someone can
   follow, with the A4/A5/A6 hand-off to the operator made explicit and the B2 coupling stated. The
   material is §2 and §3 above; what is missing is the reader-facing form.
2. **Teach `doctor` about Codex** — `codex-cli` and `codex-login` probes beside `claude-cli` /
   `claude-login`, following the ADR-0207 D3 precedent exactly (detect and instruct; the login fix
   is a dev action, never an installer step). Plus an `@step:codex-cli` in `infra/install.ps1`. This
   is the arc's end-state clause about a doctor-style surface, and it is small.
3. **Clear the dead surfaces** — S-2 (`write-authority codex`), S-8 and S-9 (stale comments in
   `codex-author.ts`), S-11 (`model-onboarding.md`).

**Worth deciding, not obviously worth building:**

4. **Codex session identity legibility** (S-5). Whether `storytree7` is acceptable, or the identity
   rule needs a Codex-aware branch, or the answer is simply that hand-made worktrees are the house
   convention and that should be written down. Recycled ids inheriting stale claims is the part with
   teeth.

**Owner work, outside the repository:**

5. Revoke `storytree-codex-claim-writer@…` and `storytree-codex-claim-reader@…`. Nothing reads
   either. ⚠️ they differ by one word in the same two members lists.

**Explicitly NOT decided by this survey, and why:** the `storytree-498613` tenancy question (§5 row
1). It is real, but it is the whole project's and not Codex's, and answering it here would have this
arc adopt a question four other surfaces share.

**Explicitly closed:** the arc's premise that a Codex-specific cloud identity is compiled in. It was,
on 2026-08-18. It is not now.
