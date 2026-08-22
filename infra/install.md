# Onboarding — the one-liner installers (ADR-0207 D1)

Two scripts, one contract. Both take a machine that has nothing to a cloned, provisioned checkout in
eight idempotent steps, and both expose the same `# @step:` names so a repair means the same thing
on either platform:

| Script | Platform | Persona | Ends with |
| --- | --- | --- | --- |
| [`install.ps1`](install.ps1) | Windows (PowerShell 5.1+) | **explorer** (read-only) | `storytree doctor`, then launches the desktop app |
| [`install.sh`](install.sh) | Linux — Debian / Ubuntu / Mint | **dev box** | `storytree doctor` |

`infra/install.ps1` is the single re-runnable command an owner sends a trusted dev to onboard them
as an **explorer** (read-only) on Windows. The dev pastes it and enters one GitHub device code;
everything else is automatic and idempotent.

`infra/install.sh` is its POSIX-sh parity sibling — see [Linux](#linux-installsh) below. macOS is
covered by neither.

> **Owner:** the full invite ceremony — the two access grants plus this message —
> is [`explorer-invite.md`](explorer-invite.md).

## What `install.ps1` does (Windows)

In dependency order, each step no-ops when already satisfied (see *Idempotency* below):

1. **git** — installs Git via winget if absent.
2. **node** — ensures Node 24+ (the workspace engine floor); brings corepack.
3. **pnpm** — activates pnpm 9 via corepack.
4. **gh-cli** — installs the GitHub CLI (drives the device sign-in).
5. **github-auth** — GitHub device sign-in (the one code the dev enters). Read access comes from
   the owner-granted **Read** role on the `storytree-ai` org (ADR-0207 D2).
6. **clone** — clones the read-only checkout (`storytree-ai/Storytree`) to `%USERPROFILE%\storytree`.
7. **provision** — `pnpm install` (no-op once `node_modules/.modules.yaml` exists).
8. **claude-cli** — installs the Claude Code CLI (`irm https://claude.ai/install.ps1 | iex`).

Then it runs **`storytree doctor`** (D6) to verify the setup, detects whether the dev's Claude CLI
is logged in (the `~/.claude/.credentials.json` existence probe — **never** the contents), and,
pre-D5, launches the desktop app from the checkout (`pnpm desktop:start`).

## Verifying + repairing setup (`storytree doctor`, ADR-0207 D6)

`storytree doctor` is the read-only, offline-capable check the installer verifies with and the
in-app guide wraps. It probes each setup invariant — git/Node present, the checkout provisioned, its
workspace linked, dependencies current, the repo fetchable, the Claude CLI present + logged in, the
checkout current — and prints a **fix hint per failure**, exiting non-zero on any failure:

```powershell
pnpm storytree doctor          # from the checkout
```

Its fixes are not new machinery: each installer-repairable probe names the exact idempotent
`install.ps1` step that repairs it (the **repair vocabulary** — re-running that step, or the whole
installer, is the repair). The one exception is Claude login, whose fix is a **dev action** the
doctor *instructs* (run `claude` and sign in) and never executes — the D3 trust boundary. Undetermined
offline probes (remote reachability, checkout freshness) resolve to **warnings**, never failures, so
doctor itself always runs offline. `packages/cli/src/doctor.test.ts` guards both invariants.

### Enacting one repair (`-Step`)

A repair re-runs **one** idempotent step rather than re-walking the whole install:

```powershell
powershell -ExecutionPolicy Bypass -File infra/install.ps1 -Step node
```

`-Step` runs only the named `# @step:` and stops — it skips every other step whole (neither their
`Check` nor their `Install` runs) and returns **before** the trailing verify / login-notice / app
launch, because the guide re-doctors after the repair itself. An unknown name fails loudly and lists
the valid steps, so a mistyped repair can never be misread as a successful one. Dispatch is by the
runner's own step name, so every declared `@step` is invocable by construction — there is no second
step list to drift against.

This is what makes the guide's repair loop enactable: `doctor`'s `fixStep` → `planRepairs`'
installer-step action → `guide-loop`'s `run-installer-step` directive → this command.

### The guided loop (`storytree guide`)

`storytree guide` runs that whole chain for you, so you rarely invoke `-Step` by hand:

```powershell
pnpm storytree guide          # check + explain what needs repairing — enacts NOTHING
pnpm storytree guide --fix    # repair each failure, re-checking after every step
```

Bare `guide` is a **preview**: it names the concrete steps it would run and stops. `--fix` is your
confirmation — it repairs, re-checks, and repeats until the setup is healthy, blocked on you, or
needs the owner. Your Claude sign-in is the one thing it never automates: it tells you to run
`claude`, then stops and waits for you to re-run the guide (D3).

## The trust invariant (ADR-0207 D3)

storytree **never handles Claude credentials**. The script installs the CLI and points the dev at
`claude` login; the dev completes OAuth in their own browser with their own subscription, and the
token lands in their own `~/.claude`. The script only **detects** a logged-in CLI — it never
captures, reads, or transmits a credential. `packages/cli/src/install-script.test.ts` guards this.

## Idempotency (load-bearing — ADR-0207 D1 / D6)

Every step is safely re-runnable: `Invoke-Step` runs a step's `Check` first and, when satisfied,
returns **before** the install action. Re-running the whole script is therefore both the retry
story and the **repair** story — D6's `storytree doctor` guide re-invokes these same steps to fix a
broken environment. An install step that is not safely re-runnable is a bug even when a first
install succeeds. `install-script.test.ts` asserts this structurally.

## Delivery (Windows)

**This is live** (D5 applied + published 2026-07-18). Send the dev exactly this:

```powershell
irm https://storage.googleapis.com/storytree-dist/install.ps1 | iex
```

It is served as a public object from the `storytree-dist` bucket
([`dist-bucket.md`](dist-bucket.md)) and is fetchable with **no credentials** — which is the point,
since the dev has no storytree identity yet. Verified anonymously: HTTP 200, and `irm` returns a
string, so `| iex` executes it.

⚠️ **The published copy does not update itself.** Editing `infra/install.ps1` in the repo does not
reach the bucket — re-publish with `gcloud storage cp` (**not** `gsutil`; see
[`dist-bucket.md`](dist-bucket.md) for the 401 trap). Automating this is an open follow-on.

Running from a checkout is still valid for local testing or if the bucket is ever unreachable:

```powershell
powershell -ExecutionPolicy Bypass -File infra/install.ps1
```

## Linux (`install.sh`)

`infra/install.sh` is the POSIX-sh parity of `install.ps1`, built for the second dev box (Linux
Mint). It reaches the same end-state — a cloned, provisioned checkout — through the **same eight
step names**, so `storytree doctor`'s repair vocabulary is identical on both platforms.

```sh
sh infra/install.sh                        # full sequence
sh infra/install.sh --checkout-dir /opt/storytree
sh infra/install.sh --step node            # targeted repair: re-run ONE idempotent step
sh infra/install.sh --help                 # options + the step inventory
```

It shares every invariant described above — [idempotency](#idempotency-load-bearing--adr-0207-d1--d6),
[`--step` targeted repair](#enacting-one-repair--step), and the
[trust boundary](#the-trust-invariant-adr-0207-d3) (it installs the Claude Code CLI and *detects* a
logged-in state; it never reads or captures a credential).
`packages/cli/src/install-sh-script.test.ts` asserts all three structurally, and additionally holds
the two scripts' `@step` inventories **equal** — a step renamed on one side only would silently
break the repair loop on the other.

### What it stops at

A **cloned, provisioned checkout**, and no further. It does *not* provision dev credentials —
`gcloud` ADC, `~/.storytree/secrets.json`, or database access — which have a different persona and a
separate guide. It installs no Blender, no GPU backend, and no herdr.

### Four decisions taken here rather than copied from Windows

1. **Node 24 from NodeSource, not nvm.** The installer already needs root for apt, so root is not a
   new cost; NodeSource puts `node` on the system PATH *immediately*, so the runner's post-install
   re-check converges inside the same process. nvm is a shell function sourced from a profile — a
   non-interactive `sh` script cannot make it stick, so `command -v node` would keep failing after a
   "successful" install and trip the convergence guard. Bringing your own Node 24 works: every other
   step's check is version-agnostic, so `@step:node` simply reports *already satisfied*.
2. **The GitHub CLI comes from GitHub's own apt repo**, not the distro archive, which lags badly.
3. **ASCII-only is kept — but not for install.ps1's reason.** PowerShell 5.1 mis-decodes non-ASCII in
   a BOM-less UTF-8 file fetched through `irm | iex`; that does not apply to `sh`, which never
   decodes the script. The reason that *does* apply is narrower: diagnostics may be printed on a box
   running under `LC_ALL=C`, where non-ASCII renders as mojibake. Strictly only printed strings need
   it; whole-file ASCII is the mechanically checkable proxy.
4. **No trailing desktop-app launch.** `install.ps1` ends with `pnpm desktop:start` because the app
   *is* an explorer's product. This provisions a dev box, where launching it uninvited is noise.

### Delivery — and why the one-liner cannot bootstrap itself

`install.sh` lives in the repository it clones, so "run the script from the checkout" is circular for
a genuinely bare machine. Two non-circular routes:

- **Paste it into a shell.** Copy the file's contents into a terminal heredoc, or scp it across. This
  is the route for the blind-onboarding run, and it needs no infrastructure.
- **Fetch it from the distribution bucket** — `curl -fsSL https://storage.googleapis.com/storytree-dist/install.sh | sh`.
  ⚠️ **This does not work yet.** Only `install.ps1` is published to `storytree-dist`
  ([`dist-bucket.md`](dist-bucket.md)); publishing `install.sh` beside it is an open follow-on. When
  it is published, the same staleness trap applies — the bucket copy does not update itself, so
  editing `infra/install.sh` does not reach it.

### Verified vs assumed — read this before trusting it

`install.sh` was authored on a Windows box, so **most of it has never been executed**. The split is
recorded in the script's own header and marked `UNVERIFIED` at each unexecuted branch. In summary:

- **Verified** (actually executed): it parses as POSIX sh under `dash -n` (dash is `/bin/sh` on
  Debian/Ubuntu/Mint); `--help` exits 0; an unknown `--step` exits non-zero, lists the valid steps
  and runs no step at all; and `--step git` on a machine that already has git reports *already
  satisfied* without running its install action. The last three run as real subprocesses in
  `install-sh-script.test.ts`, so Linux CI re-proves them on every commit.
- **Unverified** (never executed): every install action — apt-get, the NodeSource setup script,
  GitHub's apt repo and keyring, `corepack enable pnpm`, `gh auth login`, `git clone`,
  `pnpm install`, and the Claude CLI installer — plus every check except `check_git`, the `sudo`
  path, and both trailing actions.

The first real run on a Linux machine is what verifies the rest. Until then, treat a failure there as
"the installer is wrong", not "the box is".

## Scope (v1)

Deferred to follow-on increments: **macOS** (neither script covers it), publishing `install.sh` to
the public GCS bucket, the auto-update feed (D5), and the packaged-binary desktop install (until then
the app launches from the provisioned checkout in dev mode). The fresh-machine walk is
**owner-attested** — only a real run on a clean machine proves the one command onboards end-to-end.
