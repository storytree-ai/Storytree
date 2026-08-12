---
status: accepted
decided: 2026-07-27
amends: [117]
arc: foreign-project-forest-arc
---
# ADR-0259: Every client reaches the store through an HTTP front door; direct pg is a server-side privilege

## Status

accepted (2026-07-27) — decided/directed by the owner in conversation on 2026-07-27: *"good
architecture feels like everything goes through the same front door."* Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) — it
generalises the brokered write endpoint from a narrow inner-circle build path into **the** client
transport. 0117's trade (the server is the single DB authority; callers are authorized in-app; no
per-caller Cloud SQL grant) is unchanged, and is the reason it generalises cleanly.

The MCP adapter in D4 is **recommended, not decided** — flagged so a later reader does not quote it as
ratified.

## Context

**The product shape settles the architecture.** The owner's end state: the app connects to a database
*the user chooses* in order to grow a tree, and storytree's own corpus is the meta-tree — one instance
of the general shape, not a special case. That is already chartered as `foreign-project-forest-arc` /
[ADR-0246](0246-forests-for-other-projects-the-adr-0133-deferral-is-lifted-a.md), whose end state
requires driving a foreign tree to signed green with **"no credential on storytree infrastructure
anywhere in the loop"**, and whose tenancy is pinned to
[ADR-0244](0244-distribution-posture-ship-the-method-protect-the-stream-repu.md) D6/D7 as
**deployment-per-forest, not a tenant column**.

Read together those two settle what this ADR records: if every forest is its own deployment, and no
foreign loop may hold a credential on our infrastructure, then **the door ships with the forest**. There
is no central broker that could serve everyone's tree, and there was never going to be.

**Today's clients disagree with each other.** The studio server and the desktop backend
(`apps/desktop/electron/backend-entry.ts`) are already app servers that own a store connection and serve
an API. The CLI is the odd one out: it dials Postgres directly through `createPool`. That was the
shortest path when the CLI ran on one machine under the owner's own credentials, and it is why a remote
session appears to have "no database access" — the environment is fine with HTTPS; the *client* only
speaks `pg` ([ADR-0258](0258-the-inner-loop-is-separable-from-the-store-remote-sessions-l.md)).

**The seam this rests on already exists.** `packages/storage-protocol` defines `Store` as seven methods
(`upsertDoc` / `patchDoc` / `getDoc` / `queryDocs` / `deleteDoc` / `appendEvent` / `readEvents`; `patchDoc`
was added by [ADR-0352](0352-a-set-edit-writes-only-the-fields-it-names.md) and is routed and gated
exactly like the other writes), deliberately narrow,
with a shared parity suite any backend must pass to prove behavioural equivalence. An HTTP-speaking
implementation is the extension point that seam was designed for — the second backend, not a rewrite —
and the parity suite is what keeps it honest.

**The sandbox constraint points the same way.** A proxied agent sandbox reaches the network only through
a mandatory TLS-terminating proxy. Client-mTLS exists precisely to defeat middleboxes, so admitting it
would hand the sandbox an uninspectable tunnel out; the exclusion is inherent to the containment design,
not an oversight. What such an environment *does* support is ordinary HTTPS to a named host. Conforming
to that is not a workaround — it is the same conclusion the product shape reaches independently.

## Decision

### D1 — The HTTP front door is the store transport for every client that is not the server

Any client — CLI, cloud session, desktop UI, studio UI, a foreign project's tooling — reaches the store
over HTTP. `pg` becomes a **server-side privilege**, held only by the process behind the door.

### D2 — There is no laptop carve-out, because the desktop app is the local door

An earlier draft of this decision proposed keeping direct `pg` on the laptop so a studio outage could
not block the daily loop. That carve-out **dissolves**: the desktop app already runs its own backend
holding the store connection, so a local session's door is simply local. "Everything through the same
door" holds without a second write path to keep in sync — which is exactly the drift cost ADR-0250
warned about, now avoided rather than accepted.

### D3 — Two exceptions, and neither is a client

1. **The server behind the door** holds `pg`. Trivially.
2. **[ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) db-backed proofs**
   run real SQL against a real Postgres *during* the proof. No API can stand in for the wire protocol
   here. These are not a client reaching a store; they are a test needing a database, and they keep a
   direct connection wherever they run.

Neither is a loophole for ordinary reads and writes.

### D4 — MCP is an adapter over the door, never the door itself *(recommended, not decided)*

A remote MCP server is HTTPS-on-443 with OAuth — the same shape as the door, and a natural fit for
agent-native access to a forest with no CLI in the loop. The recommendation is nonetheless to build the
door as a **plain typed HTTP API implementing `Store`**, and to expose MCP as a thin adapter over it.

The reason is contract-shaped: MCP is *model-facing*, with tools described for a model to choose between
and a conversational round-trip. `Store` is six typed methods called by deterministic code — the spine,
the studio server, the CLI. Routing the spine through tool calls would be the wrong contract for the
caller that matters most. One door, two façades.

### D5 — Verdicts are verified at the door, not accepted by it

The door does not weaken [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md)
D4 — it is where that guard is enforced. A proof-bearing write is admitted only against a re-verified
signature and source anchor, never because a caller asserted it. D4 bars a *thin forwarder*, and this is
the design that stops the door from being one.

The concrete mechanism remains ADR-0258 D4's open direction, gated on an ADR-0081 amendment and an
[ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) verification-integrity
review. **This ADR does not lift that gate.**

## Consequences

**Good**

- One transport for every client, and the product shape and the sandbox constraint stop pulling in
  different directions — the same build serves remote sessions, foreign forests, and the desktop split.
- The `Store` parity suite already exists, so an HTTP backend can be held to demonstrated equivalence
  rather than to review.
- Removes the last structural reason a cloud session is second-class for non-proof work.
- No second write path to keep honest (D2) — the drift cost that made this look expensive.

**Bad / accepted costs**

- The client half was genuinely unbuilt at decision time: an `HttpStore` plus a wire contract, and the
  broker's write set extended past assets (`/api/claims` is GET-only; there is no ADR-allocation
  endpoint). *(**PR #983** landed the first part on 2026-07-27 — the wire contract, `HttpStore`, and a
  pure `handleStoreRequest` server half in `packages/storage-protocol`, held to the shared
  `storeParitySuite`. It migrated nobody: every caller still dialled `createPool`, no server was
  deployed behind the door, and the broker's write set is still assets-only. What remained was the
  wiring and the deployment, not the contract. **The READ half of that wiring landed 2026-08-04**
  (`session-decoupling-arc`, entry `httpstore-lands-before-offline-drops`): `handleStoreRequest` is
  mounted at `/api/store` in the studio's shared route table (`apps/studio/server/storeDoorApi.ts`),
  behind the existing IAP + membership gate, and the CLI selects `HttpStore` when
  `STORYTREE_STORE_URL` is set — proved end-to-end against the live store, where a connector-less
  client read all 616 live artifacts against the offline seed's 231. Read-only: the three POST routes
  answer 403, because D5 below is not lifted. Still open: the CREDENTIAL a remote session presents —
  direct IAP has no programmatic path (measured: `401 Invalid JWT audience`, refused at the edge), and
  ADR-0254 D4 retired the only remote identity, so ADR-0302's ordering fence is not yet discharged.
  Cited by PR rather than by increment number — corrected in place
  2026-07-28 under ADR-0086 / ADR-0139, because this ADR carries the `foreign-project-forest-arc` stamp
  and that arc's increment log numbers its own stream, in which increment 1 is the repo-root
  parameterisation of PR #977. The door work and the tree work are two streams under one `arc:` stamp,
  so an increment number alone is ambiguous here.)*
- Every store call gains a network hop. Reads already run offline on the seed, so the cost lands mostly
  on writes, but it is real.
- A door per forest is more deployment surface than one shared instance — the price of ADR-0244 D6/D7's
  tenancy, already accepted there.
- Repo-root parameterisation is a measured, unscoped prerequisite shared with `distribution-posture-arc`;
  it lands once, under whichever arc reaches it first. *(Corrected in place 2026-07-28 under
  ADR-0086 / ADR-0139 — no longer unscoped, and no longer a prerequisite in waiting.
  `foreign-project-forest-arc` reached it first and landed it: the root became a parameter with
  explicit > env > module-derived precedence across eight sites (PR #977), then drivable per call by the
  build drivers and the studio server (PR #984). Per ADR-0246 D2, `distribution-posture-arc` consumes
  that result rather than re-landing it. The decision above is unchanged; only this cost note is
  corrected.)*

**Neutral**

- No behaviour changes here. This records the target; the increments are scoped separately.

## References

- [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) — amended:
  generalised from an inner-circle build path to the client transport.
- [ADR-0258](0258-the-inner-loop-is-separable-from-the-store-remote-sessions-l.md) — why the block is
  client code, not the environment.
- [ADR-0244](0244-distribution-posture-ship-the-method-protect-the-stream-repu.md) D6/D7 — tenancy is
  deployment-per-forest; the reason the door ships with the forest.
- [ADR-0246](0246-forests-for-other-projects-the-adr-0133-deferral-is-lifted-a.md) — "no credential on
  storytree infrastructure anywhere in the loop".
- [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) D4 — the guard D5
  enforces at the door.
- [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) — db-backed proofs,
  the D3 exception.
- `packages/storage-protocol/src/store.ts` — the six-method seam and its parity suite.
- `packages/storage-protocol/src/{store-wire,http-store,http-store-server}.ts` — increment 1: the wire
  contract, the `HttpStore` client, and the pure server half. Unwired; see the cost note above.
- `apps/desktop/electron/backend-entry.ts`, `apps/studio/server/` — the two doors that already exist.
