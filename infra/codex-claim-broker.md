# The Codex claim broker — operator runbook

The resident process that lets a sandboxed Codex session take and promote claims **without ever
holding a credential**, and that answers the managed hook's live-claim read on every covered tool
call. Decisions: [ADR-0368](../docs/decisions/0368-the-claim-broker-holds-the-credential-the-sandbox-may-not-an.md)
and [ADR-0375](../docs/decisions/0375-the-resident-claim-authority-lives-in-the-desktop-app-and-th.md),
amending [ADR-0355](../docs/decisions/0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md).

This is an operator runbook because it has to be. Nothing in this repository installs, starts, or
self-attests the broker — ADR-0364 D6: an agent may never edit its own fence.

## The one rule

**Codex must never be able to launch this.** Start it yourself — today that means running the
storytree desktop app — never on demand from a Codex session, and never from the trusted actuator.

That is not caution, it is the entire repair. The existing actuator is hash-pinned, exact-grammar,
exact-arity and topology-verified, and it *still* fails, because Codex invokes it and it therefore runs
with the sandbox's token — the token `Protect-SandboxCredentials` has just denied every credential
path. Authentication is not something a program does; it is something a program HAS, by virtue of who
started it. A broker the writer can start is the actuator again, wearing a new name.

A desktop app **spawned by** a sandboxed Codex runs as `CodexSandboxUsers` with ADC denied, so it can
impersonate nothing and no broker starts. Hosting the broker in a GUI app does not weaken this.

## Who holds it

**The storytree desktop app (ADR-0375 D1).** It starts the broker at launch and stops it at shutdown.
Start the app and the authority is up; there is no separate thing to remember.

`packages/cli/src/codex-claim-broker-entry.ts` remains as a **headless fallback** for a host with no
desktop app. It is no longer the ordinary holder.

> ⚠ **Never run both at once.** They race for the same handshake file and the same default directory.
> The loser publishes a port the winner is not listening on, and every caller then fails closed
> against a dead port. Nothing in the code refuses this — it is yours to keep straight. This is why
> the logon scheduled task was removed (below).

### Why the app's liveness now matters more than it used to

Since ADR-0375 the managed hook reads live claims **through** this process. Close the desktop app and
Codex can neither take nor promote claims **and** every covered write is refused. That direction is
safe — it fails closed — and the refusal says so in as many words ("the resident claim authority is
not reachable — is the storytree desktop app running?"), rather than the misleading "no live work
claim exists for this session", which would send you hunting for a missing claim instead of a closed
app.

### Removing the old logon task

A logon task named `Storytree Codex Claim Broker` was registered on the dev host on 2026-08-15, back
when the standalone entry was the holder. It is now a **second** broker racing the desktop app for
the same handshake. Remove it:

```powershell
Unregister-ScheduledTask -TaskName 'Storytree Codex Claim Broker' -Confirm:$false
```

Confirm it is gone:

```powershell
Get-ScheduledTask -TaskName 'Storytree Codex Claim Broker' -ErrorAction SilentlyContinue
```

### Running the headless fallback

Only on a host with no desktop app, and only when the desktop app is not running:

```bash
pnpm -C packages/cli exec node --import tsx src/codex-claim-broker-entry.ts
```

**Run it from `packages/cli`, not from the checkout root.** `tsx` resolves only through a workspace
and the checkout ROOT has none of its own, so a root-level `node --import tsx …` dies with
`Cannot find package 'tsx' imported from C:\code\storytree\`.

It prints its port, identity, repository and handshake path to stderr, then serves until `SIGINT` /
`SIGTERM`. On graceful shutdown it removes the handshake, so a later caller gets an honest "broker not
running" rather than a connection error against a dead port. **A hard kill skips that** — the
handshake outlives the process and names a port nothing is listening on. If a caller reports a
connection error rather than "not running", delete the handshake and restart.

> The old warning that running it from a worktree pinned that worktree and broke every `promote` is
> **fixed** (ADR-0375 D7): the repository fence now derives from `git rev-parse --git-common-dir`,
> which answers the same primary checkout from anywhere in the repository. That fix is what makes the
> desktop host work at all — under ADR-0181 the desktop serves from a *pinned runtime worktree*,
> which is a linked worktree, so the old derivation would have pinned the wrong thing every time.
> The `repository:` line printed at startup is still the way to check.

## What it holds

`storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com`, impersonated from your own
login. Its scope lives in Postgres grants, not its name: `SELECT/INSERT/UPDATE/DELETE` on
`events.node_claim`, `INSERT` on `events.claim_event`, `USAGE` on that sequence — 2 of the 19 tables in
`events`, audit table append-only. Proof and the negative test:
[`docs/research/codex-claim-writer-scoped-identity-2026-08-14.md`](../docs/research/codex-claim-writer-scoped-identity-2026-08-14.md).

**In the desktop app this is a SECOND pool, separate from the app's own (ADR-0375 D2).** The desktop
backend already holds `createPool()` with no arguments — its FULL library identity. The broker must
never ride that pool: doing so would hand it a broad credential and undo the property PR #1323 was
sequenced first to establish. Two pools in one process is the decision, not an accident.

You need `roles/iam.serviceAccountTokenCreator` on that account (the operator already holds it) and
live ADC:

```bash
gcloud auth application-default print-access-token
```

## The handshake, and the ACL that is the actual door

The broker binds an **ephemeral** `127.0.0.1` port and mints a fresh 32-byte secret per launch, then
writes both to a handshake file and scopes that file to exactly two principals — you, and
`<COMPUTERNAME>\CodexSandboxUsers` — breaking inheritance first:

```
icacls.exe <handshake> /inheritance:r /grant:r <BOX>\<you>:(R,W) /grant:r <BOX>\CodexSandboxUsers:(R)
```

**Read access to that file IS the permission to knock.** If the broker cannot scope it, it refuses to
serve rather than serving openly.

Default location — `%LOCALAPPDATA%\Storytree\codex-broker\handshake.json`. Override with
`STORYTREE_CODEX_BROKER_DIR`, or name the file outright with `STORYTREE_CODEX_BROKER_HANDSHAKE`.

> **Do not move it under `~/.storytree`.** That directory is a denied root in the generated profile —
> it is where storytree-owned secrets live precisely so the sandbox cannot read it. A handshake placed
> there is unreadable by the one account that must read it, and the failure surfaces only at
> live-smoke time as an unexplained bootstrap refusal. The handshake is not a secret to keep from the
> sandbox; it is the sandbox's own door key.

### The hook does NOT read that environment variable — and that is the point

The sandboxed **bootstrap** reads `STORYTREE_CODEX_BROKER_HANDSHAKE`, so that variable must be
visible to the Codex process. The **managed hook** does not: it takes the handshake path from the
administrator-owned policy under `%ProgramData%` (`claimBrokerHandshake`), which the sandbox cannot
write (ADR-0375 D5).

ADR-0368 recorded the env-sourced path as a harmless residual, and it was — a forged `ok` only bought
a worktree whose claim did not exist, and the hook refused every write one layer down. **The hook is
that layer.** If the hook took its path from the environment, a compromised sandbox could point it at
a broker of its own and hand itself a forged work claim, opening the fence completely. So if you move
the handshake, the env var moves the bootstrap and **re-installing the boundary** moves the hook.

## What crosses the wall

Results. Never credentials. The broker performs the ledger write itself and answers `ok`, or a refusal
naming the holder — so a prompt-injected or confused writer has nothing to exfiltrate. A
token-vending broker was rejected for exactly this reason: it needs every piece this design needs and
THEN hands a credential across.

Four verbs, fixed shapes, unknown fields refused:

| verb | what narrows it |
|---|---|
| `take` | grade forced to `exploring`; branch must be exactly `claude/<sessionId>`; a unit another live session holds is refused by the ledger |
| `promote` | identity is **derived from Git** against the worktree path — the request has no identity field, so a caller cannot promote a session it is not standing in |
| `release` | refused for any session **this broker did not itself mint**; the registry is in-memory, so a restarted broker fails closed |
| `claims` | nothing, deliberately — it READS and never grants. It answers the live claims of one named session, which the notice board renders to every member anyway. The authority decision stays the hook's, taken against the identity **Git** derives for the process being fenced, never against the `sessionId` in the request |

### Why `claims` is not the `claimsFor` ADR-0368 refused to broker

ADR-0368 D4 left the ceremony's `claimsFor(unitId)` unbrokered because an empty answer renders "no
other sessions" to an **operator** — overstating safety to a human, so the client throws instead.
`claims` is the opposite case in both respects: it is **session-scoped**, so it never speaks about
other sessions at all, and its consumer is the **hook**, which reads empty as DENY. Empty overstated
safety there; here it withholds authority.

What must never happen is an **error** degrading to an empty list — an outage wearing the costume of
a real answer. A fault answers `ok:false`, the client throws, and the hook exits 2. Anything that
catches that and returns `[]` removes the only fence ADR-0364 leaves standing, and nothing downstream
notices: the write is simply admitted.

## What the guard is not

The channel secret is readable by the sandbox account, therefore by every Codex session on the host.
That is intended: the guard answers *may this process talk to me at all*. **Session separation is the
Git derivation's job and only its job.** Reading the token as session authentication re-introduces the
exact flaw the derivation exists to close.

## Checks

```bash
gcloud auth application-default print-access-token
```

```bash
pnpm db:probe
```

```bash
icacls "%LOCALAPPDATA%\Storytree\codex-broker\handshake.json"
```

Expect the last to list only your account and `CodexSandboxUsers`, with no inherited entries.

```powershell
Get-ScheduledTask -TaskName 'Storytree Codex Claim Broker' -ErrorAction SilentlyContinue
```

Expect **no output** — the logon task is retired and would race the desktop app.

## Status

**Started for the first time on 2026-08-15, and still not proven end to end.**

What is now true: the ADR-0364 boundary is installed on the dev host, the broker has run holding the
scoped claim-writer identity with a correctly-ACL'd handshake, and the managed hook was driven
directly and refuses correctly in every direction — lobby, sibling reached-into, sibling walked-into,
and `.git` metadata — while admitting a write in the session's own claimed worktree.

The **latency blocker measured that day is addressed** (ADR-0375): the hook's claim read is now a warm
loopback call to the resident authority instead of a fresh Cloud SQL connector build per tool call,
and the second process spawn per call is gone with the standalone probe. Measured back to back before
the change: **18,976 ms and 48,192 ms** against a **30 s** budget, so the same legitimate write was
refused on one run and admitted on the next.

What is still NOT true: `codex-lobby-to-write-live-smoke` has not run. Its twelve criteria on
`codex-factory-parity-arc` — rewritten before running under ADR-0364 D7 — are what decide whether the
lifecycle may be described as operational. A broker that passes its unit tests is not a lifecycle that
works; this arc was closed once on a bar that had drifted.

Evidence: [`docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md`](../docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md)
