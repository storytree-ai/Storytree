---
status: accepted
decided: 2026-08-14
arc: codex-factory-parity-arc
amends: [355]
---
# ADR-0368: The claim broker holds the credential the sandbox may not, and derives identity Git cannot be lied to about

## Status

accepted (2026-08-14) — the DESIGN was directed by the owner in conversation on **2026-08-13** (the
out-of-sandbox broker, chosen over the token-vending alternative); design-time alignment IS the
ratification (ADR-0110), so this records a decision already made rather than asking again.

Amends **ADR-0355**, whose D4 said the writer "restarts or hands off" after the bootstrap ceremony and
never allocated anywhere for operator authority to live. ADR-0355's fence — Codex writes only in its
current claimed worktree — is unchanged and still binding, as is ADR-0364's replacement of the
mechanism that grants it.

## Context

ADR-0355's `## Delivery status` records the defect precisely: **the lobby bootstrap authenticates as
the identity its own boundary has just denied.** The trusted actuator is well-built — hash-pinned,
exact-grammar, exact-arity, topology-verified, refusing everything outside its two verbs — and it
still fails, because *Codex invokes it*. It therefore runs under `CodexSandboxUsers`, and
`Protect-SandboxCredentials` has already denied that account gcloud ADC, `~/.storytree/secrets.json`
and `~/.codex/auth.json`, while `codex-worktree-create-entry.ts` needs exactly those paths for
`loadLocalSecrets()` + `createPool()`.

This is a composition fault, not a reason to widen the sandbox. **Authentication is not something a
program DOES; it is something a program HAS, by virtue of who started it.** No amount of argument
validation fixes an inherited token, which is why the actuator's considerable discipline buys nothing
here.

Two further forces shaped the answer:

- **A scoped token cannot express the property that matters.** `storytree-codex-claim-writer@…` was
  minted and proven narrow first (PR #1323,
  `docs/research/codex-claim-writer-scoped-identity-2026-08-14.md`) — 2 of 19 tables in `events`, the
  audit table append-only. But Postgres grants are TABLE-shaped and cannot say "only rows for your own
  session", so any design that hands that credential into the sandbox lets one Codex session promote
  or release another session's claims. Narrowing the grant does not reach the question.
- **The ordering was deliberate.** The identity landed BEFORE this, so the broker was never built
  holding the operator's personal login.

## Decision

**D1. The broker is a resident process running as the OPERATOR, which Codex sends a message to.
Codex starts nothing.** This single property is the whole repair, and it is the easy one to rebuild by
accident: a broker the writer launches is the actuator again wearing a new name. (The rule was never
"the broker is a standalone process" — it is that Codex must never LAUNCH the broker. The storytree
desktop app is now the ordinary resident holder, started and stopped with the app itself;
`packages/cli/src/codex-claim-broker-entry.ts` — started by hand or by a logon task — is retained as a
headless fallback for a host with no desktop app. Never by the sandbox, and never on demand, either
way. ADR-0375 D1.)

**D2. Results cross the wall; credentials do not.** The broker performs the ledger write itself and
answers `ok`, or a refusal naming the holder. Nothing secret crosses, so a prompt-injected or confused
writer has nothing to exfiltrate. **A token-vending broker is explicitly rejected**: it needs every
piece this design needs — a privileged resident process, a channel, an ACL — and THEN hands a
credential across. Same build cost, strictly less security; the middle rung is skipped.

**D3. Identity is DERIVED, not believed — and the two verbs differ, structurally.** This is the
capability a token cannot have at any expiry.

- **`promote` derives from Git.** The request carries a worktree PATH and no identity field at all;
  the broker runs `resolveCodexSessionTopology` against that path and uses what Git says. A caller
  cannot promote a session it is not standing in, because it has nowhere to claim otherwise.
- **`take` cannot, and pretending it could would be the lie.** `storytree worktree create` takes its
  exploring claims BEFORE `git worktree add` runs, so at take time there is no topology to read. The
  narrowing there is structural instead: **the grade is forced to `exploring`** (the ungated verb can
  never mint write authority), the branch must be exactly `claude/<sessionId>`, and a unit another
  live session holds is refused by the ledger itself. A take can therefore only ever create its own
  row.
- The broker is fenced to ONE repository — the primary checkout it was started for. A worktree of
  another checkout is refused even when its topology resolves perfectly.

**D4. The verb set is take / promote / release — three, where the increment specified two.** The
addition is recorded rather than taken quietly. `storytree worktree create` rolls back the claims it
took when `git worktree add` fails; with no `release` every failed bootstrap would strand claims until
they aged out. **`release` is the one destructive verb, so it is narrowed by memory: the broker
refuses any session it did not itself mint via `take`.** That registry is in-memory and deliberately
not persisted — a restarted broker forgetting its mints fails CLOSED, where a persisted registry
surviving a crash could authorise a release for a session that no longer exists.

The ceremony's fourth seam, `claimsFor`, is deliberately NOT brokered: it feeds a cosmetic board
digest the ceremony already wraps in `try`/`catch`. The client throws rather than answering `[]`,
because an empty answer would render "no other sessions" — a claim it cannot make.

**D5. The channel is loopback with an ACL'd handshake, not a named pipe.** The requirement is that the
channel carry its own access control; a Windows named pipe carries a real DACL, but **Node cannot set
one** (libuv binds with a default security descriptor and exposes no handle to adjust it), so a pipe
would require a second non-TypeScript process to own the door. Instead: an EPHEMERAL `127.0.0.1` port
and a per-launch 32-byte secret, published to a handshake file whose DACL grants read to exactly the
operator and `<COMPUTERNAME>\CodexSandboxUsers`, inheritance broken first. **Read access to that file
IS the permission to knock**, and the broker owns the file so it can set that DACL without elevation.
This reuses machinery the repository already proves — the desktop sidecar's `loopback-guard.ts`
(Host/Origin/per-launch secret) and the actuator's own `icacls` work. A handshake the broker cannot
scope is a door with no lock: it refuses to serve rather than serving openly.

**D6. The guard is a wall around the broker, never a wall between sessions.** The channel secret is
readable by the sandbox account, therefore by every Codex session on the host. That is intended — the
guard answers "may this process talk to me at all". Session separation is D3's job and only D3's.
Anyone reading the token as session authentication has re-introduced exactly the flaw D3 exists to
close.

**D7. The actuator's discipline carries forward.** Exact grammar, exact field sets, unknown fields
REFUSED rather than ignored, single-line values, no interpolation into a command, no shelling out on a
caller's behalf, and every path total over `unknown`. **The broker is the new attack surface**; a
loose grammar turns a wall into a ladder. Unknown fields are refused specifically because the Codex
app-server's habit of silently accepting them is what made a vestigial field indistinguishable from a
live one during the rebinding probe — a grammar that ignores what it does not understand cannot be
audited.

## Consequences

**Fail-closed is total, and an outage is deliberately indistinguishable from a refusal.** A ledger
throw, a queued arm, a grade that did not land, or an unreachable store all answer `ok: false`. The
one distinction preserved is the direction that matters: a refusal carries `heldBy` only when it is
genuine CONTENTION, and its absence tells the client the refusal was a FAULT. The client maps the
first to `{acquired: false, heldBy}` and THROWS on the second, so an outage can never read as "the
unit is busy".

**The broker becomes a new single point of failure for the Codex lifecycle.** If it is not running, no
Codex session can bootstrap. That is the correct direction — the alternative is a bootstrap that works
by holding a credential — but it means the broker's own liveness is now operator-visible work, and
nothing in this repository can install or self-attest it (ADR-0364 D6: an agent may never edit its own
fence).

**The sandbox's credential denies stop being in the way of the work and become a pure backstop.** After
`codex-bootstrap-dials-the-broker` lands, the sandbox has no legitimate reason to read any credential
at all. The profile remains a BLOCKLIST — broad read minus an enumerated list — so a credential
appearing in a new location tomorrow is still readable by default; this decision does not fix that, it
removes the reason anyone would need it.

**One residual, stated rather than left to be discovered. It STANDS, and it is still harmless — but
only because of a decision taken later.** The BOOTSTRAP's handshake path is resolved from the
environment (`STORYTREE_CODEX_BROKER_HANDSHAKE`, else a shared default —
`codex-worktree-create-entry.ts`), so a compromised sandbox can point the bootstrap at a handshake of
its own and be answered by a broker it controls. What that buys is nothing: a forged `ok` yields a
worktree whose claim does not exist in the real ledger, and the managed hook re-reads the LIVE claim
on every tool call and refuses every write. It fails closed one layer down.

**That argument depends entirely on the hook's own read NOT being redirectable the same way**, which
was free here (the hook reached a probe named by the administrator-owned policy) and stopped being
free when ADR-0375 moved the hook's read to this same broker. Had the hook taken its handshake path
from the environment too, the layer this residual falls through to would have been redirectable by
the sandbox, and a forged `ok` would have opened the fence completely instead. ADR-0375 D5 is what
kept that from happening: the hook takes `claimBrokerHandshake` from the policy under `%ProgramData%`,
never from the environment. The residual named here is unchanged; the reason it is survivable is now
a decision someone had to make on purpose, not an accident of the mechanism.

**What this does NOT deliver.** `codex-bootstrap-dials-the-broker` landed in this same change:
`codex-worktree-create-entry.ts` now dials the broker instead of calling `loadLocalSecrets()` /
`createPool()` directly, so the bootstrap holds no credential and opens no database connection. What
remains undelivered is proof of the LIFECYCLE — nothing here may be described as operational until
`codex-lobby-to-write-live-smoke` runs from a genuinely fresh Codex desktop task against its rewritten
twelve criteria. This arc was closed once on a bar that had drifted; a broker that passes its unit
tests is not a lifecycle that works.

## References

- ADR-0355 — the containment this amends; its `## Delivery status` records the credential circularity.
- ADR-0364 — write authority as a standing worktrees grant; D5 names the broker as what removes the
  bootstrap's reason to be an administrator-owned bundle.
- ADR-0200 — the claim ledger and its grades; `take` mints `exploring`, `promote` reaches `work`.
- ADR-0033 — session identity from Git topology, which is what D3 leans on.
- `docs/research/codex-claim-writer-scoped-identity-2026-08-14.md` — the scoped identity, and the
  vacuous-negative-test trap that faked a clean pass.
- `packages/cli/src/codex-claim-broker.ts` — grammar and decisions (pure).
- `packages/cli/src/codex-claim-broker-door.ts` — the channel guard and the handshake ACL.
- `packages/cli/src/codex-claim-broker-entry.ts` — the resident process and the identity it holds.
- `apps/desktop/src/backend/loopback-guard.ts` — the loopback-guard precedent D5 follows.
