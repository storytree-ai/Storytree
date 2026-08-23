# Onboarding a machine onto storytree

**You are the agent onboarding this machine.** Someone pointed you at this repository on a computer
that has never run it, and asked you to make it a working development box. This guide is your answer
and your work plan: you will provision this machine **yourself**, prove each step with something you
observed rather than something you assert, and stop only at the small number of things a human must
do in a browser.

The human who handed you this has exactly **three irreducible jobs**, all of them browser sign-ins
([§2](#2-the-three-sign-ins)). Everything else is yours. Do not ask the human to run a command you
can run.

> **This is the MACHINE guide.** Its sibling [`model-onboarding.md`](model-onboarding.md) onboards a
> *model or harness* onto a checkout that already works. If the box is provisioned and the question
> is "can we drive it with a different model?", you are in the wrong document.
>
> [`CLAUDE.md`](../CLAUDE.md) is a third thing again: the orientation a session reads once the
> machine works. It tells you how to *behave* here, not how the box came to exist. Hand off to it
> the moment [§6](#6-prove-it) passes.

## ⚠ Read this before you trust a single Linux instruction below

**This guide was authored on the Windows dev box and most of its Linux specifics have never been
executed.** Every such claim is tagged **`[UNVERIFIED]`** at the point you meet it, and they are
indexed in [§8](#8-the-unverified-index). That is deliberate, not sloppiness: the first agent to
follow this guide on a real Linux machine is running an experiment, and each `[UNVERIFIED]` marker is
a prediction that run will confirm or falsify. Two obligations follow:

- **Treat a tagged claim as a hypothesis.** If it is wrong, that is a finding worth recording, not a
  failure on your part.
- **Do not silently fix the tag.** When you verify or falsify one, say which, and what actually
  happened. A guide that quietly absorbs corrections loses the only record of what it got wrong.

Untagged claims were read from this repository's own source and are as reliable as anything here.

---

## 1. Bootstrap the machine

The end state of this section is a **cloned, installed checkout** — nothing about credentials yet.

### There is no installer for Linux — the steps below ARE the mechanism

| Platform | Script | State |
|---|---|---|
| Windows | `infra/install.ps1` | Built. Eight idempotent steps, `-Step <name>` repairs one. Serves the read-only *explorer* persona, not a dev box. |
| Linux | none | Deliberate, not a gap (ADR-0432). Follow the steps below. |

If you are on Linux you are not missing a tool. `infra/install.sh` existed for two days and was
deleted: it was never executed, never published, and was written for a human at a terminal rather
than for you. Running the steps yourself and reporting what each one did is the better outcome
anyway — a script would have hidden exactly the findings this run exists to produce.

### The steps

```bash
git --version                      # install via your package manager if absent
node --version                     # must satisfy engines: ">=24"
corepack enable pnpm               # Node 24 ships corepack; no global pnpm install
gh --version                       # the GitHub CLI — you cannot land work without it
bun --version                      # the TEST RUNTIME for 21 packages — see the warning below
```

`packageManager` in the root `package.json` pins **pnpm@9.15.0**; corepack activates exactly that,
so do not install pnpm globally and do not pick a version yourself.

> ### ⚠ Bun is a test RUNTIME here. **Never run `bun install`.**
>
> pnpm installs everything and owns `pnpm-lock.yaml`; Bun's only job is running tests — 21 packages'
> `test` scripts are literally `bun test`. `bun-runtime-migration-arc` ruled the package-manager axis
> out of scope deliberately, so reaching for `bun install` because "Bun is required" makes things
> worse rather than better.
>
> **`pnpm install` cannot supply Bun**, which is the whole reason it is listed here beside `git` and
> `gh` rather than left to the workspace. It is a *machine* dependency (ADR-0433 D1): onboarding owns
> it being installed **and resolvable on `PATH`** — both halves.
>
> **The half that actually bites is `PATH`.** Measured on the owner's Windows box on 2026-08-24: Bun
> had been installed for four days, was not on `PATH`, and the gate reported **seven packages**
> `test: Failed` — a message naming neither Bun nor `PATH`. The same gap now reads as *19 packages
> failing*, so it looks more catastrophic the more of the stack migrates, and it is never a real red.
> If you see a broad, unexplained band of test failures, check `bun --version` before you debug
> anything else.
>
> Install from [bun.sh](https://bun.sh); CI pins **1.4.0** (`oven-sh/setup-bun@v2` in
> `.github/workflows/ci.yml`). `pnpm storytree doctor --dev` has a `bun` probe — ask it rather than
> guessing.

**`[UNVERIFIED]`** On Linux, Bun's own installer (`curl -fsSL https://bun.sh/install | bash`) drops
the binary at `~/.bun/bin` and appends that directory to your shell profile — which means it is on
`PATH` in *new* shells and not in the one you are standing in. Expect to re-source the profile or
open a new shell before `bun --version` answers. This whole paragraph was written from a Windows box
and is a prediction; report what actually happened.

**`[UNVERIFIED]`** On Debian/Ubuntu/Mint, `git` comes from apt, but the distro `nodejs` package is
usually far below the Node 24 floor — expect to need NodeSource or `nvm`. The GitHub CLI likewise
needs GitHub's own apt repository rather than the distro package, which lags.

### Clone and install

The repository is **private** to the `storytree-ai` org, so the clone needs GitHub auth *before* you
can read anything in it — including this file. That is a genuine chicken-and-egg and it is why
[§2](#2-the-three-sign-ins)'s third sign-in effectively comes first in practice.

```bash
gh auth login                                   # device code — a human enters it
gh repo clone storytree-ai/storytree
cd storytree
pnpm install
git submodule update --init web
```

**Initialise the `web` submodule.** Three gate steps — `check:web-grounding`,
`check:web-experience-closure`, `check:web-engine` — exit the reserved code 3 (SKIP) when it is
absent. A skipped step is **unverified, not passed**, and a box with different submodule state is
running a different gate plan while printing a green-looking summary. If you are here to compare
this machine against another, the plans must match.

`legacy/Agentic` is a second submodule: a read-only vendored copy of the V1 Rust project, reference
only. You do not need it initialised and you must never edit it.

---

## 2. The three sign-ins

**Name all three to your human now, before the first one blocks you.** Discovering them one at a
time, an hour apart, is the single most annoying way to run this section and it is entirely
avoidable. Each has its own proof; do not treat one passing as evidence for another.

| # | Credential | What it unlocks | Proof it worked |
|---|---|---|---|
| 1 | Google application-default credentials | The Postgres store | `pnpm db:probe` exits 0 |
| 2 | Claude OAuth token | The Claude Agent SDK leaf | a `--pg` read, then a trivial `--pg` write |
| 3 | GitHub CLI auth | Cloning, and opening a PR | `gh pr list` returns |

### 2.1 Google — application-default credentials

```bash
gcloud auth login --no-launch-browser                    # authenticates the gcloud CLI itself
gcloud auth application-default login --no-launch-browser # writes ADC, which the connector reads
```

**These are two different credentials and you need both.** The first authenticates the `gcloud`
command — without it you cannot read a secret in §2.2. The second writes application-default
credentials, which is what the Cloud SQL connector uses. Running only one leaves the other half
failing in a way that reads as a permissions problem rather than a missing login.

`--no-launch-browser` prints a URL and waits for a code, which is what keeps your human to a single
click on a machine you may not be sitting at. Then:

```bash
pnpm db:probe
```

Exit 0 prints `reachable — SELECT 1 answered in N ms`. Exit 1 prints the exact failure.

**Do not hand-roll this probe.** It runs the canonical connector through the CLI's own composition
root — secrets hydration, the `PoolHandle` shape, and pool teardown are all handled inside the verb.
Three separate attempts have been lost to re-deriving it.

**A slow answer is not a failure.** The instance can take minutes to accept connections after a cold
start while already reporting status RUNNABLE. Wait and re-probe rather than concluding it is down.
And a **saturated machine makes the probe lie** — if the box is loaded, check `storytree own --all`
before believing a red result.

**`[UNVERIFIED]`** Installing the Google Cloud SDK on Mint is its own step (apt repo or the tarball
installer) and is not covered by anything in this repo. You may also need
`gcloud auth application-default set-quota-project storytree-498613`.

### 2.2 Claude — the OAuth token

⚠ **Do NOT run `claude setup-token` here.** The token already exists in Google Secret Manager, and
the §2.1 sign-in is enough to read it:

```bash
gcloud secrets versions access latest --secret=claude-code-oauth-token --project storytree-498613
```

Put that value in `CLAUDE_CODE_OAUTH_TOKEN` ([§3](#3-the-secrets-file)). It is a subscription-funded
credential, not an API key.

**Minting a fresh one is the hazard.** `setup-token` produces a one-year token, and whether a new one
invalidates existing ones is **undocumented in both directions** — the feature requests to list and
revoke them imply several coexist, but the revoke request was closed as not planned. Another machine
depends on the current value, so minting a second could take that box down for a credential you did
not need. `setup-token` remains the way to CREATE one where none exists; that is not this case.

**The trust boundary moved, and the half that moved is worth knowing (ADR-0430).** ADR-0207 D3's
"storytree never handles Claude credentials" invariant is retired — credentials live in the vault and
storytree code may hold one. What did NOT change is disclosure: nothing here may print, log or hash
the value, and you can confirm a credential is present without ever reading it.

### 2.3 GitHub

```bash
gh auth login        # device code
gh pr list           # the proof
```

Without this the machine can run the gate but cannot land anything, which makes it a very expensive
read-only checkout.

---

## 3. The secrets file

`~/.storytree/secrets.json` fills environment variables the live paths need, so they survive across
sessions **and across git worktrees** — an in-repo secrets file would not, because untracked files do
not follow worktrees. **No CLI verb creates this file.** `packages/drive/src/secrets.ts` only reads
it. Creating it is a step in this guide and nowhere else.

```json
{
  "CLAUDE_CODE_OAUTH_TOKEN": "<read from Secret Manager in §2.2 — do NOT mint a new one>",
  "STORYTREE_DB_USER": "<the Google account you signed in as in §2.1>"
}
```

**The vault is the source of truth for that first value, not this file (ADR-0430).** You are copying
it here because nothing in the code reads Secret Manager yet; when that lands, this file becomes an
override and an offline fallback rather than the place the credential lives. Which means: if the two
ever disagree, the vault is right and this file is stale.

**Exactly two keys are read. Nothing else in the file is honoured**, so it cannot be used to inject
arbitrary environment.

### The database identity is per-PERSON, not per-machine

This is the fact that removes what looks like the largest obstacle on a second machine, so it is
worth stating plainly: `STORYTREE_DB_USER` is a **human Google account**, and Cloud SQL IAM grants
attach to that identity. A new machine whose §2.1 sign-in used the **same account** inherits the same
database access.

**There is no per-host grant, no service account to create, and no infrastructure change.** If you
find yourself reading Terraform to get a second machine onto the database, stop — you have gone down
the wrong path.

### Two traps the code already knows about

- **Environment always wins.** The file only fills variables that are unset. A stale export in your
  shell silently beats the file.
- **A blank value is a gap, not a credential.** `VAR=` is how a shell says "not configured", and a
  mangled command substitution produces exactly that. Read as present, it travels to the connector
  and surfaces as *a perfectly healthy database reporting itself unreachable* — measured once at
  ~25 minutes of `{"store":"pg","db":"unreachable"}` while a direct `SELECT 1` answered the whole
  time. That is worse than a wasted probe: it manufactures convincing evidence for the wrong
  diagnosis. `presentEnv()` exists for exactly this and treats whitespace-only as absent.

---

## 4. Work from a linked worktree

**Do not work in the primary checkout.** Two separate mechanisms make it a dead end, and both are
correct behaviour that is baffling on first contact:

- **`storytree noticeboard declare` refuses outright from it.** Session identity derives from the
  worktree, and `deriveIdentity()` returns nothing for a primary checkout — the shared lobby has no
  isolated identity to claim under. There is deliberately no flag to supply one by hand.
- **Anything you run there registers with `storytree own` as nothing at all**, so the machine is
  invisible to its own runtime inventory from day one.

```bash
pnpm storytree worktree create --runtime claude --node <unit-id> --intent "<what you are doing>" --pg
```

That is the claim-gated ceremony: it cuts a branch from a freshly-fetched `origin/main`, creates the
worktree, runs `pnpm install` in it, and takes your claim in one step. Work from the path it prints.

**A fresh worktree has no `node_modules` of its own.** The ceremony installs for you; if you create
one by hand with `git worktree add`, install in it before any `pnpm storytree …` or `pnpm db:*`
command, or they fail with errors naming entirely the wrong cause.

Invoke the CLI as **`pnpm storytree …`**, not a bare `node --import tsx …` — `tsx` resolves only
through the workspace, so the bare form fails from a worktree root with `ERR_MODULE_NOT_FOUND 'tsx'`.

---

## 5. Install the write-authority wall

```bash
pnpm storytree write-authority install          # dry run — shows what would change
pnpm storytree write-authority install --write  # install it
```

This generates a `permissions.deny` block in the **user-level** `~/.claude/settings.json` that
refuses file-tool writes into the primary checkout, so §4's rule is enforced rather than merely
advised. The block is **derived from `repo-manifest.json`** — never hand-edit it; re-run
`install --write` when the manifest changes.

**Know its limits before you rely on it (ADR-0284).** It is a static permissions block and nothing
more: it binds the three file-editing tools, **not Bash** — a shell write into the primary checkout
still succeeds and is still a violation. It is claim-blind, so it permits writes into a *sibling*
worktree. And it does not bind Codex at all.

**`[UNVERIFIED]` — this is the step most likely to behave differently here.** The wall has only ever
existed on Windows; on a fresh Linux box the primary checkout is writable by file tools until you run
the command above. The installer *looks* portable — it resolves the home directory with
`os.homedir()` and derives the primary root rather than hard-coding a path — but it has never been
run on Linux. Report what actually happens, including the exact paths it writes into the deny block.

---

## 6. Prove it

Run these in order. Each proves a different thing, and a pass on one is not evidence for another.

```bash
pnpm storytree doctor --dev      # the machine-level verdict
```

**Pass `--dev`; a bare `doctor` is not the dev verdict.** The dev-persona probes — application-default
credentials, database reachability, the secrets file, GitHub auth, **Bun**, write-authority, worktree
identity — are an **opt-in group**, because an explorer legitimately has none of them. Bare, `doctor`
runs the eleven explorer probes and prints `DEV_SCOPE_NOT_RUN`: a green that names what it did not
check, not a stopping condition. Three of the seven can only ever WARN by decision (`db-reachable`,
`write-authority`, `worktree-identity`), so green-with-those-warning is the expected shape rather than
a defect.

A green doctor is still one signal and not a provisioned box. Run the rest of this list regardless.

```bash
pnpm -r typecheck                                             # hermetic — no DB, no token
pnpm -r test                                                  # hermetic
pnpm db:probe                                                 # §2.1
pnpm storytree library artifact merge-ceremony                # a live read
pnpm storytree arc list --pg                                  # a live read that needs the DB up
gh pr list                                                    # §2.3
```

Then a **trivial live write**, because a read proves less than you think — the read path and the
write path do not share a seam:

```bash
pnpm storytree noticeboard declare --working-on "onboarding this machine" --node <unit-id> --pg
pnpm storytree noticeboard done --pg
```

Finally the whole gate, which is the real verdict:

```bash
pnpm gate
```

Read **the per-step table, not the tail**. `SKIP` and `NOT RUN` both mean *unverified* — never
passed. A laptop with no `web` submodule normally reads **GREEN, NARROWED** with three steps named,
and that is an honest green, not a defect. Never `timeout`-wrap the gate and never pipe it to
`tail`: both kill the run and leave a log that reads like one still in progress.

---

## 7. Gotchas

- **You cannot smoke-test yourself in the third person.** Every proof here is something you
  **observe** — an exit code, a printed row, the gate's own table — never something you assert about
  yourself. If a proof did not run, the honest report is "unverified", and stopping to say so is
  cheap. A self-onboarding that grades its own homework has failed at the only step nobody can review
  from the diff.
- **`pnpm storytree --help` does not list `doctor`.** The verb exists; the help output omits it. If
  you are discovering the CLI from its own help, you will not find the command that tells you whether
  your machine works.
- **A green `pnpm install` that says "Already up to date" still changed things.** That line is about
  dependency *resolution*, not linking. Never read it as "the install was a no-op".
- **`pnpm db:up` exit 75 means the instance is still warming**, not that anything failed. Re-probe;
  do not issue another start. Exit 1 means the activation genuinely did not take.
- **Leave the database running.** Bring it up when you need it and do not stop it when you finish —
  nothing stops it automatically, and stopping it takes CI, the gate, every read command and the
  hosted studio down together.
- **Reads no longer need `--pg`; writes do.** A bare `storytree library …` read already dials the
  live store. Adding `--pg` to a read buys nothing and costs the follow-up offers.
- **Long prose into an artifact field goes through a file, never a `>` redirect.** Under
  `pnpm storytree …` a redirect captures pnpm's two-line run banner as the field's first bytes. Use
  `--out` to capture and `--set field=@path` to write.
- **`[UNVERIFIED]` Line endings.** This repository has been developed exclusively on Windows. Nothing
  is known about whether a fresh Linux clone produces CRLF churn in the working tree, and no
  `.gitattributes` policy has been checked against that case.
- **`[UNVERIFIED]` The gate has never run on Linux.** `pnpm -r typecheck` and `pnpm -r test` are
  hermetic and *should* be portable, but the shell hooks, `worktree-health.mjs`,
  `provision-worktree.mjs` and the `check:*` rungs have only ever been exercised on Windows. Report
  every failure with its actual error rather than working around it — a workaround here hides exactly
  the finding this run exists to produce.

---

## 8. The `[UNVERIFIED]` index

The scoring sheet. Each line is a prediction; the first real Linux run turns it into confirmed or
falsified. Report which, with what you actually saw.

| # | Claim | Section |
|---|---|---|
| ~~1~~ | ~~`infra/install.sh` provisions a bare machine idempotently~~ — **RETIRED**, not answered: the script was deleted (ADR-0432). Never executed, and now never will be. | — |
| 2 | Node 24 needs NodeSource or nvm; distro `nodejs` is too old | [§1](#1-bootstrap-the-machine) |
| 3 | The GitHub CLI needs GitHub's apt repo, not the distro package | [§1](#1-bootstrap-the-machine) |
| 4 | Installing the Google Cloud SDK is an extra step, possibly needing a quota project | [§2.1](#2-the-three-sign-ins) |
| 5 | `write-authority install --write` works on Linux and writes sane paths | [§5](#5-install-the-write-authority-wall) |
| ~~6~~ | ~~`storytree doctor` still reports healthy on an unprovisioned machine~~ — **ANSWERED**: the dev probes landed, and a bare sweep now says `DEV_SCOPE_NOT_RUN` instead of an unqualified green. | [§6](#6-prove-it) |
| 7 | A fresh Linux clone produces no CRLF churn | [§7](#7-gotchas) |
| 8 | `pnpm gate` passes on Linux, hooks and `check:*` rungs included | [§7](#7-gotchas) |
| 9 | Bun's Linux installer puts it on `PATH` only for NEW shells, so `bun --version` fails in the one you are in | [§1](#1-bootstrap-the-machine) |

**One claim that is NOT tagged, because it was measured rather than guessed:** the database grant is
per-identity ([§3](#3-the-secrets-file)). Signing in as the same Google account is sufficient. If
that turns out to be false, it is the most important finding of the run.
