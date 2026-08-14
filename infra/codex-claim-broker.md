# The Codex claim broker — operator runbook

The resident process that lets a sandboxed Codex lobby session take and promote claims **without ever
holding a credential**. Decision: [ADR-0368](../docs/decisions/0368-the-claim-broker-holds-the-credential-the-sandbox-may-not-an.md),
amending [ADR-0355](../docs/decisions/0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md).

This is an operator runbook because it has to be. Nothing in this repository installs, starts, or
self-attests the broker — ADR-0364 D6: an agent may never edit its own fence.

## The one rule

**Codex must never be able to launch this.** Start it yourself, or from a logon task, or from a
service wrapper — never on demand from a Codex session, and never from the trusted actuator.

That is not caution, it is the entire repair. The existing actuator is hash-pinned, exact-grammar,
exact-arity and topology-verified, and it *still* fails, because Codex invokes it and it therefore runs
with the sandbox's token — the token `Protect-SandboxCredentials` has just denied every credential
path. Authentication is not something a program does; it is something a program HAS, by virtue of who
started it. A broker the writer can start is the actuator again, wearing a new name.

## What it holds

`storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com`, impersonated from your own
login. Its scope lives in Postgres grants, not its name: `SELECT/INSERT/UPDATE/DELETE` on
`events.node_claim`, `INSERT` on `events.claim_event`, `USAGE` on that sequence — 2 of the 19 tables in
`events`, audit table append-only. Proof and the negative test:
[`docs/research/codex-claim-writer-scoped-identity-2026-08-14.md`](../docs/research/codex-claim-writer-scoped-identity-2026-08-14.md).

You need `roles/iam.serviceAccountTokenCreator` on that account (the operator already holds it) and
live ADC:

```bash
gcloud auth application-default print-access-token
```

## Start it

From the primary checkout — the broker fences itself to the repository whose worktrees it will
promote, and it takes that from its own working directory:

```bash
pnpm -C packages/cli exec node --import tsx src/codex-claim-broker-entry.ts
```

**Run it from `packages/cli`, not from the checkout root.** `tsx` resolves only through a workspace
and the checkout ROOT has none of its own, so a root-level `node --import tsx …` dies with
`Cannot find package 'tsx' imported from C:\code\storytree\`. The fence is unaffected by the
subdirectory: `git rev-parse --show-toplevel` from `packages/cli` still answers the primary checkout,
which is what the broker pins. Run it from a WORKTREE, however, and it pins that worktree and then
refuses to promote anything — the `repository:` line it prints on startup is how you check.

It prints its port, identity, repository and handshake path to stderr, then serves until `SIGINT` /
`SIGTERM`. On graceful shutdown it removes the handshake, so a later caller gets an honest "broker not
running" rather than a connection error against a dead port. **A hard kill skips that** — the
handshake outlives the process and names a port nothing is listening on. If the bootstrap reports a
connection error rather than "not running", delete the handshake and restart.

### Keeping it running

ADR-0368 D1 allows by hand, a logon task, or a service wrapper — never on demand from a Codex session.
A process started as a child of some other tool session dies with that session, which is a quiet way
to lose the broker; a logon task is the durable form:

```powershell
$node = (Get-Command node.exe).Source
Register-ScheduledTask -TaskName 'Storytree Codex Claim Broker' `
  -Action (New-ScheduledTaskAction -Execute $node `
      -Argument '--import tsx src/codex-claim-broker-entry.ts' `
      -WorkingDirectory 'C:\code\storytree\packages\cli') `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME") `
  -Principal (New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
      -LogonType Interactive -RunLevel Limited)
```

`RunLevel Limited` is deliberate: the broker wants your ordinary token, not an elevated one. It holds
its authority through impersonation of a narrowly-granted service account, not through privilege.

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

The sandboxed bootstrap reads `STORYTREE_CODEX_BROKER_HANDSHAKE`, so that variable must be visible to
the Codex process.

## What crosses the wall

Results. Never credentials. The broker performs the ledger write itself and answers `ok`, or a refusal
naming the holder — so a prompt-injected or confused writer has nothing to exfiltrate. A
token-vending broker was rejected for exactly this reason: it needs every piece this design needs and
THEN hands a credential across.

Three verbs, fixed shapes, unknown fields refused:

| verb | what narrows it |
|---|---|
| `take` | grade forced to `exploring`; branch must be exactly `claude/<sessionId>`; a unit another live session holds is refused by the ledger |
| `promote` | identity is **derived from Git** against the worktree path — the request has no identity field, so a caller cannot promote a session it is not standing in |
| `release` | refused for any session **this broker did not itself mint**; the registry is in-memory, so a restarted broker fails closed |

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

## Status

**Started for the first time on 2026-08-15, and still not proven end to end.**

What is now true: the ADR-0364 boundary is installed on the dev host, the broker has run holding the
scoped claim-writer identity with a correctly-ACL'd handshake, and the managed hook was driven
directly and refuses correctly in every direction — lobby, sibling reached-into, sibling walked-into,
and `.git` metadata — while admitting a write in the session's own claimed worktree.

What is still NOT true: `codex-lobby-to-write-live-smoke` has not run. Its twelve criteria on
`codex-factory-parity-arc` — rewritten before running under ADR-0364 D7 — are what decide whether the
lifecycle may be described as operational. A broker that passes its unit tests is not a lifecycle that
works; this arc was closed once on a bar that had drifted.

⚠ **A blocker was measured, and it is open.** The hook re-reads live claims on every covered tool call
by spawning the claim probe, which builds a Cloud SQL connector per invocation. Measured back to back:
**18,976 ms and 48,192 ms**, against the hook's **30 s** budget — so the same legitimate write was
refused on one run and admitted on the next. It fails closed, so it is not a security hole; it does
block criterion 6. The fork is an open question on the arc
(`oq-where-the-resident-claim-authority-lives-and-whether-the`), and the leading candidate is to let
the hook read through this already-resident process, which holds a warm pool.

Evidence: [`docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md`](../docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md)
