---
status: accepted
decided: 2026-08-15
arc: codex-factory-parity-arc
amends: [368]
---
# ADR-0375: The resident claim authority lives in the desktop app, and the managed hook reads through it

## Status

accepted (2026-08-15) — decided/directed by the owner in conversation on 2026-08-15 ("we make the
desktop app the holder"). Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask.

Amends **ADR-0368**, in exactly two places. D1 put the broker in a standalone process the operator
starts by hand or by a logon task; the holder becomes the desktop app, and the standalone entry
demotes to a headless fallback. D4 deliberately left `claimsFor` unbrokered; a fourth verb is added —
narrower, session-scoped, and for the opposite consumer. Everything else in ADR-0368 survives
verbatim and is restated under "What does not change" below, because the parts that survive are the
parts easiest to erode by accident.

## Context

ADR-0364 made the managed hook's live-claim check **the only fence that decides**. The OS profile is
now a standing grant over the whole worktrees area, so nothing else distinguishes a session's own
worktree from its sibling's. That was the accepted cost, recorded plainly at the time: anyone
weakening the hook weakens everything.

On 2026-08-15 the boundary was installed on the dev host for the first time and the fence was
measured. It is CORRECT in every direction — lobby write denied, own claimed worktree admitted,
sibling reached-into denied, sibling walked-into denied, `.git` denied
(`docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md`). And it is unusable, for a
reason that has nothing to do with its logic.

The hook re-reads live claims on every covered tool call by spawning a standalone probe, and each
invocation builds a Cloud SQL connector and impersonates a scoped principal **from scratch**. There
is no warm connection to reuse. Measured back to back, same host, identical request:

```
attempt 1: 18,976 ms, exit 0   -> {"claims":[ ...two live work claims... ]}
attempt 2: 48,192 ms, exit 0   -> {"claims":[ ...the same two claims... ]}
```

The hook allows the probe 30 seconds and fails closed past it. So the same legitimate write, in a
correctly-claimed worktree, returned FAILED CLOSED on one run and ALLOWED on the next. Both answers
were correct; only one arrived in time.

**This is not a security hole** — it fails closed, which is the right direction, and the probe's
answer is right whenever it lands. It is a usability blocker, and it blocks criterion 6 of
`codex-lobby-to-write-live-smoke` ("a source write in that worktree succeeds"), because a fence that
refuses legitimate writes on a coin flip is not one anyone can work in.

Three forces shaped the answer:

- **The latency is structural, not a tuning knob.** Raising the timeout accepts a ~50 s pause on
  every write. Caching the answer weakens the per-call re-read ADR-0364's fence depends on — the
  whole point is that walking into a sibling worktree is re-evaluated at the moment of the write.
  Only a warm pool removes the cost without removing the property.
- **A warm pool already exists, held by an operator process.** The desktop backend constructs a pool
  and a `PgClaimStore` at startup and lives for the length of the session.
- **`claimsFor` was left unbrokered for a reason that does not apply here.** ADR-0368 D4 refused to
  broker the ceremony's board digest because an empty answer renders "no other sessions" to an
  OPERATOR — overstating safety to a human. The hook's read is the inverse: session-scoped, and an
  empty answer means "no live work claim", which the hook reads as DENY. The failure directions are
  opposites, so the reasoning does not transfer.

## Decision

**D1. The storytree desktop backend is the resident claim authority.** It starts the broker at
launch and stops it at shutdown. `packages/cli/src/codex-claim-broker-entry.ts` is retained as a
headless fallback for a host with no desktop app, and is no longer the ordinary holder.

**ADR-0368 D1 survives embedding, and this is the load-bearing check.** The rule was never "the
broker is a standalone process"; it was **Codex must never LAUNCH the broker**, because authority
comes from who started a process and no amount of argument validation fixes an inherited token. A
desktop app spawned BY a sandboxed Codex runs as `CodexSandboxUsers` with ADC denied: it holds no
credential and can impersonate nothing, so its pool construction fails and no broker starts. The
property is unchanged; only which operator-started process holds it has moved.

**D2. The desktop holds a SECOND, separately-scoped pool — never its own.** The backend's existing
pool is `createPool()` with no arguments: the desktop's FULL library identity. Riding it would hand
the broker a broad credential and silently undo what PR #1323 was sequenced first to establish — the
narrow `storytree-codex-claim-writer@…` identity (2 of 19 tables in `events`), which landed BEFORE
the broker precisely so the broker was never built holding anything broader. Two pools in one
process is the correct shape here, not a smell.

This is enforced by a test on the **options**, not on the behaviour, because the failure it guards is
silent: a broker riding the wrong pool works perfectly and passes every functional test.
`claimWriterPoolOptions()` is pure and asserted directly.

**D3. A fourth verb, `claims`, answers the live claims of ONE named session.** Request
`{protocolVersion, verb:"claims", sessionId}`; answer `{ok:true, verb:"claims", claims:[…]}`. It
takes the same exact-keys grammar as the other three.

It needs no identity narrowing and deliberately has none. It READS; it never grants. A caller naming
someone else's session learns what the notice board already renders to every member — and buys
nothing, because **the authority decision stays the hook's**, taken against the identity Git derives
for the process being fenced, never against the `sessionId` the request asked about. A forged
question yields an answer that cannot match.

**D4. An unreachable authority is a REFUSAL, never an empty list.** This is the single most dangerous
line in the change, and it is the exact inverse of D3's inverse: here an error that degrades to `[]`
STILL fails closed at the hook (no claims → deny), so the danger is not the empty answer — it is any
implementation that treats "broker unreachable" as "no claims, therefore allow", or that adds a
fallback admitting writes when the read fails. That would remove the only fence ADR-0364 leaves
standing, and nothing downstream would notice: the write would simply be admitted.

It is refused structurally. A fault answers `ok:false`; `claimsForSession` throws rather than
returning `[]`; the hook's `readLiveClaims` throws, and every throw routes to `fail()` → exit 2. The
negative tests were written first, and the refusal an operator sees NAMES the cause — "the resident
claim authority is not reachable (is the storytree desktop app running?)" — rather than the
misleading "no live work claim exists for this session".

**D5. The hook takes the broker's handshake path from the ADMINISTRATOR-OWNED POLICY, not from the
environment.** The policy field `claimBrokerHandshake` replaces `claimProbeCommand`.

ADR-0368 recorded as a residual that the BOOTSTRAP's handshake path is resolved from the environment,
and judged it harmless because a forged `ok` only yields a worktree whose claim does not exist, which
the hook then refuses on every write — it fails closed one layer down. **That residual is unchanged
and still harmless, and this decision is the reason it stays that way.** It was safe only because the
hook's own read was NOT redirectable by the sandbox: the hook reached a probe named by the
administrator-owned policy. Moving the hook's read onto the same broker is exactly the change that
could have destroyed that property, because the hook IS the layer the bootstrap's residual falls
through to. A hook taking its handshake path from the environment could be pointed at a broker the
sandbox controls, handed a forged work claim, and the fence would open completely.

So the hook takes `claimBrokerHandshake` from the policy under `%ProgramData%`, written by the
administrator-owned actuator, which the sandbox cannot write. Note what this does and does not do:
it closes the path for the HOOK, and it leaves the bootstrap reading the environment exactly as
ADR-0368 described. Moving the bootstrap's path into the actuator config as well remains the open
hardening ADR-0368 named — it is not done here, and it is not needed for the fence to hold.

**D6. The broker moves to `@storytree/notice-board` behind a `./codex-broker` subpath.** Not a
preference: `apps/desktop` may not import `@storytree/cli` (ADR-0112), and the broker's old home was
`packages/cli`. `notice-board` already owns `PgClaimStore`, already depends on `@storytree/library`
and `pg`, and the broker is claim machinery — so the move adds no package dependency. The root
barrel stays pure-zod and browser-safe; the `node:`/`pg` surface sits behind the subpath, exactly as
`./store` already does. The cli modules become re-export shims (the `packages/cli/src/secrets.ts`
precedent), so every existing caller is unchanged.

The increment that directed this work expected Half A to be cheap because the desktop already holds a
`PgClaimStore`. That was right about the pool and wrong about the import: the sidecar ban made a
package move the shortest honest route, and it is recorded here rather than absorbed silently.

**The subpath barrel deliberately EXCLUDES `resident.ts`, and that exclusion is load-bearing.** It is
the one module that opens a Cloud SQL pool, so re-exporting it from `./codex-broker` drags the
connector into every consumer's bundle — including the sandboxed **lobby bootstrap**, which dials the
broker through the same package's `client.ts`. That would ship a Cloud SQL connector into the one
process ADR-0368 exists to keep credential-free, since it runs as the account every credential path
is denied to. It is not hypothetical: it broke `codex-worktree-create-entry.test.ts`'s bundle-level
assertion the moment the barrel was complete, which is exactly what that assertion is for — the leak
is invisible in the source and only appears once the bundle is built. A host that means to HOLD the
authority imports `@storytree/notice-board/codex-broker/resident` by name.

**D7. The repository fence derives from Git's COMMON directory, not from `--show-toplevel`.** The
broker pins one repository, and it read that pin from `git rev-parse --show-toplevel` at startup —
which answers the *working tree the process stands in*. Started from a linked worktree it therefore
pinned that worktree, and then refused every `promote`, because the topology probe resolves a
caller's `primaryCheckout` through the common dir and the two could never agree.

That was already a live footgun for the standalone entry (the runbook warned operators to check the
`repository:` line it prints). It becomes unavoidable here: the desktop serves from a **pinned
runtime worktree** under ADR-0181, which is a linked worktree, so the old derivation would have
broken the desktop-hosted broker in its ordinary configuration. `--git-common-dir` answers the same
primary checkout from anywhere in the repository, so both hosts are correct from anywhere.

**D9. Hosting the authority is OPT-IN, via `STORYTREE_CODEX_CLAIM_AUTHORITY=1`, and its absence never
breaks a desktop launch.** Hosting opens a second Cloud SQL pool, impersonates the scoped
claim-writer service account, and publishes an ACL'd handshake — machinery meaningful only on a host
running the Codex containment boundary. An ordinary member holds no impersonation grant on that
account, so an unconditional attempt would open a connector, fail, and log a credential error on
every launch for everyone not running the Codex factory. Off by default leaves the ordinary launch
path exactly as it was.

The composition therefore NEVER throws: it returns a typed refusal the backend logs before carrying
on, following the `buildInspectDeps` degrade-quiet precedent. An absent authority is a **Codex
lifecycle outage, never a desktop outage** — the fence fails closed on its own (the hook refuses
every covered write and names this process as the reason), and making it launch-fatal would stop a
member with no impersonation grant from opening the app at all.

**D8. The standalone live-claim probe is DELETED, not left beside the new path.** There is now
exactly one live-claim reader. Leaving the probe wired would mean a second, credentialed reader that
the fence no longer consults — a pinned payload claiming to be something it is not, and the kind of
residue that reads as a supported fallback to the next person. Its Cloud SQL reader identity
(`storytree-codex-claim-reader@…`) is no longer used by anything in this repository; revoking it is
operator work this change does not perform and cannot self-attest.

## Consequences

**Broker lifetime becomes app lifetime, and that is a real behavioural change.** Close the desktop
app and Codex can neither take nor promote claims, and — because the hook reads through it — every
covered write is refused. The direction is safe (it fails closed), but it replaces an always-up logon
task with something an operator can close by accident, so the refusal is worded to say the resident
process is unreachable rather than "no live work claim exists". An operator who reads the old message
would go looking for a missing claim instead of a closed app.

**The desktop app becomes load-bearing for Codex, and the hook now depends on a process that can be
absent.** Previously the hook needed only a database. It is a narrower dependency in one sense (no
credential in the hook's path at all) and a wider one in another (a GUI app's liveness gates a
fence). This is the direction ADR-0368 already accepted when it made the broker a single point of
failure for the bootstrap; it now extends to every covered write.

**Two brokers must not run at once.** The desktop and the standalone entry race for the same
handshake file and the same default directory; the loser publishes a port the winner is not
listening on, and a client reads a handshake that fails closed. Nothing in the code refuses this —
it is operator discipline, stated in `infra/codex-claim-broker.md`. The logon scheduled task
`Storytree Codex Claim Broker`, registered on the dev host on 2026-08-15, is therefore REMOVED as
part of this change rather than left to collide. ADR-0368's option A3 (both, coordinated) was costed
as strictly more complexity than either alone and is not taken.

**The measured blocker is gone, but the smoke is still not run.** The claim read becomes a warm
loopback call rather than a connector build, and the second process spawn per tool call disappears
with the probe. `codex-lobby-to-write-live-smoke` becomes runnable on criterion 6; it still needs a
live Codex desktop task for criteria 1-5, 10 and 11, and this change does not deliver that. Nothing
here may be called operational until that smoke runs. This arc was closed once on a bar that had
drifted, so the distinction is kept sharp.

**What does NOT change, restated because it is what erodes quietly.** ADR-0368 D2 (results cross the
wall, credentials do not). D3 (`promote` derives identity from Git and carries no identity field;
`take` is narrowed structurally with the grade forced to `exploring` and the branch pinned to
`claude/<sessionId>`; `release` is refused for any session this broker did not itself mint). D5 (the
channel is loopback with an ACL'd handshake; read access to that file IS the permission to knock).
D6 (the guard is a wall around the broker, never a wall between sessions — session separation is
D3's job and only D3's). D7 (exact grammar, unknown fields refused rather than ignored). And
ADR-0364's fence: the hook narrows on the worktree the process is actually standing in, re-derived
from Git per tool call, admitted only by a live `work` claim naming that worktree's Git-derived
identity and branch.

## References

- ADR-0368 — the broker this amends; D1 (the holder) and D4 (`claimsFor` unbrokered) are the two
  places it changes, and its handshake-path residual is what D5 closes.
- ADR-0364 — write authority as a standing worktrees grant, with the hook as the only fence. The
  reason a latency blocker in the hook is a blocker for the whole lifecycle.
- ADR-0355 — the containment ADR-0364 and ADR-0368 both amend.
- ADR-0181 — the desktop's pinned runtime worktree, which is why D7 is not optional.
- ADR-0112 — the sidecar/driver boundary that forbids `apps/desktop` importing `@storytree/cli`,
  which is why D6 is a package move.
- ADR-0200 — the claim ledger and its grades.
- `docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md` §4 — the measured blocker.
- `docs/research/codex-claim-writer-scoped-identity-2026-08-14.md` — the narrow identity D2 protects.
- `packages/notice-board/src/codex-broker/` — grammar, door, server, resident composition, client.
- `infra/codex-claim-broker.md` — the operator runbook.
