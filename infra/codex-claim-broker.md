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
node --import tsx packages/cli/src/codex-claim-broker-entry.ts
```

It prints its port, identity, repository and handshake path to stderr, then serves until `SIGINT` /
`SIGTERM`. On shutdown it removes the handshake, so a later caller gets an honest "broker not running"
rather than a connection error against a dead port.

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

**Not yet proven end to end.** `codex-lobby-to-write-live-smoke` — the twelve criteria on
`codex-factory-parity-arc`, rewritten before running under ADR-0364 D7 — is what decides whether the
lifecycle may be described as operational. A broker that passes its unit tests is not a lifecycle that
works; this arc was closed once on a bar that had drifted.
