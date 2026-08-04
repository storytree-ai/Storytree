---
status: accepted
decided: 2026-07-27
amends: [250]
---
# ADR-0258: The inner loop is separable from the store: remote sessions lack the Cloud SQL connector, not database access

## Status

accepted (2026-07-27) — decided/directed by the owner in conversation on 2026-07-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) — it narrows
0250's framing, which was accurate about the Cloud SQL connector but was read, including by the session
that wrote it, as a statement about database access in general. 0250's mechanism, its D2 refusal, and
its D3 vehicle all stand.

## Context

The owner asked for full development access from a phone-driven cloud session and pushed back on two
things this session had asserted. Both pushbacks were correct, and re-reading the code is what settled
them — so the corrections are recorded here rather than left in a conversation.

**1. The inner loop is separable from the store.** The leaf (`packages/agent`, behind the `PhaseAuthor`
seam) is the Claude Agent SDK plus a subscription token. The spine (`packages/orchestrator`) is plain
TypeScript: the phase machine, the per-phase write-scope fence, the shell test executor, the RED→GREEN
observation, and the verdict signing. **Neither touches Postgres.** What actually needs the database is
narrower than "a real build": persisting the verdict, and an [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md)
db-backed proof that connects to a test database *during* the run.

**2. The coupling is our own decision, not the sandbox's.** `packages/drive/src/node-build.ts` resolves
`--store` to `pg` **always** for `--real` (ADR-0060/0081); `--store memory` was deliberately removed and
the help text states there is no run-without-persisting mode. So a `--real` build on a machine without
DB reach refuses *before the leaf gets a chance to run*. That refusal is well-motivated — an unpersisted
"real" pass is an unfalsifiable claim, and a synthetic pass that persisted would be a forged healthy
(ADR-0020) — but it is self-imposed, and it is what makes the inner loop look DB-bound when it is not.

**3. "Remote sessions cannot have database access" is over-broad.** What cannot work is the Cloud SQL
**connector**, and the reasons are properties of the transport rather than a missing firewall rule:

- The sandbox reaches the network only through a mandatory proxy running outside it, which the sandbox
  cannot reconfigure or bypass. This holds at **every** access level, including `Full` — that setting
  widens the *domain allowlist*, not the transport.
- The proxy terminates and re-originates TLS. **Client-mTLS is definitionally incompatible with a TLS
  middlebox**: the point of a client certificate is that the endpoint proves its identity to the far
  end, and a proxy that re-originates the session cannot forward someone else's certificate — it can
  only present its own. This is impossible by construction, not by policy, which is why no tunnel,
  forwarder, or port trick can ever work.
- The connector is additionally non-443 and raw TCP. The container's own policy names all three shapes
  — client-mTLS, non-443 HTTPS, raw-TCP databases — as unsupported: *report, do not work around*.

None of that says a database is unreachable. **Ordinary HTTPS on 443 to an allowlisted host works** —
that is the entire premise of the hosted studio, and `/api/write-broker`
([ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md)) is already such an
endpoint. A database reachable *over HTTPS* is available to a remote session today. The Postgres wire
protocol is not, and never will be.

**4. Which moves the real blocker from the network to trust.** Once an HTTPS path is granted to exist,
the thing still stopping a remote session from persisting a verdict is
[ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) D4 — no proof-bearing
writes through a bridge — a judgement about forgeability that is **ours to revisit**. ADR-0250's framing
made this look like physics. It is not, and conflating the two is what kept the question closed.

## Decision

### D1 — The inner loop runs with the orchestrator, wherever the orchestrator runs

The leaf is never relocated away from the session driving it. The session **is** the outer loop
(ADR-0030); splitting them would mean the orchestrator cannot observe the loop it is accountable for,
and it buys nothing, because the leaf never needed the database in the first place.

This kills, explicitly, the shape this session proposed and the owner rejected: dispatching the build to
a CI runner or a separate VM while the session watches from elsewhere.

### D2 — State the fence as the connector, not as "database access"

The precise, durable claim — the one sessions should reason from:

> A proxied sandbox cannot run the Cloud SQL connector, because client-mTLS cannot survive a
> TLS-terminating proxy. It **can** reach an HTTPS endpoint on 443.

ADR-0250 D1 remains correct about the connector and about the futility of tunnelling. What is corrected
is the inference drawn from it. "Remote sessions are offline-only" is true of today's *client*, not of
the environment's reach: every caller dials Postgres directly through `createPool`.

*(Narrowed 2026-07-27: a `Store`-conformant HTTP client now exists — the wire contract plus `HttpStore`
in `packages/storage-protocol`, built as increment 1 of
[ADR-0259](0259-every-client-reaches-the-store-through-an-http-front-door-di.md) and held to the shared
`storeParitySuite`. No caller used it and no server was deployed behind it, so the client-side claim above
still held operationally; what was no longer true is that nothing in the repo speaks HTTP to a store.)*

*(Narrowed again 2026-08-04: the read half is now WIRED — the studio serves `/api/store` and the CLI
dials it through `HttpStore` under `STORYTREE_STORE_URL`, proved against the live store. So "every
caller dials Postgres directly" is no longer true of reads. It does not follow that a remote session
can read: the studio sits behind direct IAP, which has no programmatic path, and ADR-0254 D4 retired
the only identity a remote container ever held — so the block moved from the CLIENT to the
CREDENTIAL. That fork is owner-gated and parked as `remote-session-door-credential` on
`session-decoupling-arc`.)*

### D3 — Name exactly what a remote session cannot have

Two things, and no more:

1. **Proof-bearing persistence** — a *trust* decision (ADR-0089 D4), not a network fact.
2. **ADR-0064 db-backed proofs** — these need the wire protocol *during* the proof, so they stay
   laptop-side by construction. An HTTPS broker cannot help here, and this is a real parity gap.

Everything else is reachable: authoring, the full offline gate, the entire GitHub/PR surface, and — via
the broker, now permitted for a non-human identity by [ADR-0254](0254-a-non-human-identity-may-hold-library-write-scope-proof-bear.md)
D1 — claims, library artifact writes, and ADR allocation.

### D4 — The persistence mechanism is NOT decided here

Recorded as the direction to work up, so the next session starts from it rather than re-deriving:

> The signed verdict rides the existing ADR-0031 `claude/real/<id>-<run>` promotion branch into the PR,
> as the proven commit already does, and is persisted at merge by a party with DB reach that re-verifies
> the signature and the source anchor against the code actually being merged.

Its appeal is that the persister is not a thin forwarder taking a POSTed claim on faith — it re-checks
the anchor against real merged source, which is what ADR-0089 D4 is protecting.

Two things must be settled before it becomes a decision, and neither is settled here:

- **ADR-0081 would need amending** — "a real build always persists" is exactly what this relaxes, and it
  exists for a good reason.
- **A verification-integrity review** of whether `hashSpan` / `source-drift.ts` make merge-time
  persistence ungameable. That is [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md)'s
  territory, and the wrong call here would put a forgeable surface in the proof layer.

## Consequences

**Good**

- The corpus stops telling sessions that a database is unreachable from a remote session, which is the
  belief that made the whole question look closed. The accurate claim is narrower and points somewhere.
- The blocker is relocated from physics to judgement, where it can actually be decided.
- The inner loop's independence from the store is written down, so no future session re-proposes
  relocating the leaf — and the reason `--real` refuses on a DB-less machine is attributed to ADR-0081
  rather than to the sandbox.
- The two genuine gaps (D3) are enumerated, so "full parity" claims can be checked against them.

**Bad / accepted costs**

- D4 leaves the headline capability undecided. That is deliberate — it turns on a proof-integrity review
  that this session is not entitled to short-circuit — but it means a phone-driven `--real` build is
  still not available.
- ADR-0064 db-backed proofs stay laptop-side with no path proposed. Genuine parity gap, recorded rather
  than solved.
- D2's correction is subtle enough to be re-flattened by a future reader into "remote can't reach the
  DB". The CLAUDE.md wording is updated with it for that reason.

**Neutral**

- No code changes. Nothing is granted, provisioned, or relaxed; this ADR corrects a model and scopes the
  remaining question.

## References

- [ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) — amended: framing
  narrowed to the connector. Its mechanism, D2 refusal and D3 vehicle stand.
- [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) D4 — the trust
  decision D3 identifies as the real blocker.
- [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) — the HTTPS write
  endpoint that already exists.
- [ADR-0254](0254-a-non-human-identity-may-hold-library-write-scope-proof-bear.md) D1 — why a remote
  session may now hold library write scope.
- ADR-0060 / ADR-0081 — `--real` always persists; the self-imposed coupling D4 would amend.
- [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) — db-backed proofs, the
  irreducible parity gap.
- [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — the promotion branch D4 would reuse.
- `packages/drive/src/node-build.ts` — where `--store` resolves to `pg` for `--real`.
- `packages/orchestrator/src/proof/` — the spine's signing path, which needs no database.
