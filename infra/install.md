# Explorer onboarding — the one-liner installer (ADR-0207 D1)

`infra/install.ps1` is the single re-runnable command an owner sends a trusted dev to onboard them
as an **explorer** (read-only) on Windows. The dev pastes it and enters one GitHub device code;
everything else is automatic and idempotent.

> **Owner:** the full invite ceremony — the two access grants plus this message —
> is [`explorer-invite.md`](explorer-invite.md).

## What it does

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
in-app guide wraps. It probes each setup invariant — git/Node present, the checkout provisioned, the
repo fetchable, the seed readable, the Claude CLI present + logged in, the checkout current — and
prints a **fix hint per failure**, exiting non-zero on any failure:

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

## Delivery

Once D5 ships the public distribution bucket, the one-liner is:

```powershell
irm https://storage.googleapis.com/storytree-dist/install.ps1 | iex
```

The bucket is now **codified** in [`dist-bucket.tf`](dist-bucket.tf) (see
[`dist-bucket.md`](dist-bucket.md)) but still needs the owner's one-time `terraform apply` plus a
`gsutil cp` of this script. The one-liner goes live the moment that URL answers.

**Until that apply lands**, the repo is private, so a raw GitHub URL will
not fetch unauthenticated. Deliver the script by pasting its contents or hosting it at a temporary
public URL, then:

```powershell
powershell -ExecutionPolicy Bypass -File infra/install.ps1
```

## Scope (v1)

Windows-first. Deferred to follow-on increments: the `sh` variant (macOS/Linux), the public GCS
bucket + auto-update feed (D5), and the packaged-binary desktop install (until then the app launches
from the provisioned checkout in dev mode). The fresh-machine walk is **owner-attested** — only a
real run on a clean machine proves the one command onboards end-to-end.
