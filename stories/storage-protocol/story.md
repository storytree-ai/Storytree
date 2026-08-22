---
id: "storage-protocol"
tier: story
title: "The storage-protocol port — the universal document-event storage seam every organism persists through"
outcome: "Every organism that persists state speaks ONE narrow, browser-safe Store/ChangeStore contract — the same event-sourced grammar (append an event AND update the projection, atomically) over any backend — so WHAT an organism stores is decoupled from WHERE it is stored. A foundational root the whole graph rests on, depending only on the proof-protocol root."
status: proposed
proof_mode: UAT
# Machine-judged: a pure SEAM has no UAT journey. Its author-declared observe reliability gate runs
# the parity suite through the deterministic spine; the suite alone is not a current signed pass.
uat_witness: machine
# Lightweight + expandable (ADR-0074 §3, the port shape): the narrow seam, its in-memory reference,
# and the seam's own HTTP transport (ADR-0259) are ONE unit; no sub-capabilities yet. The list grows
# one case per real defect.
capabilities: []
# Root organism (ADR-0075): storage-protocol is a NEAR-root — it depends only on the proof-protocol
# root (declared below, a foundational→foundational edge). The cli HUB imports it; declared
# provider-side here so the hub stays de-noised. Domain organisms that import it declare it consumer-side.
depends_on: [proof-protocol]
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the seam extraction (68); ports as root organisms (74/75); the
# role-not-position rename base→storage-protocol (78); author-defined story green and the historical
# mapped bootstrap (83); the observe-gate mechanism (85), narrowed by ADR-0395; the HTTP front door that
# made the seam's own transport this port's job — contract only, no caller migrated (259).
decisions: [68, 74, 75, 78, 83, 85, 259]
---

# The storage-protocol port — the universal document-event storage seam

**Outcome —** Every organism that persists state speaks ONE narrow, browser-safe Store/ChangeStore
contract — the same event-sourced grammar (append an event AND update the projection, atomically) over
any backend — so *what* an organism stores is decoupled from *where* it is stored. A foundational root
the whole graph rests on, depending only on the proof-protocol root.

## What this port is

`packages/storage-protocol` (formerly `base` — renamed for role-not-position by
[ADR-0078](../../docs/decisions/0078-rename-root-ports-role-not-position.md)) is the universal,
browser-safe **storage seam** (ADR-0068 step 5): the narrow `Store` / `ChangeStore` contract — the
*verbs* any store must offer (`upsertDoc` / `getDoc` / `queryDocs` / `deleteDoc` / `appendEvent` /
`readEvents`) — the `InMemoryStore` reference implementation, the `StoredDoc` / `StoreEvent` /
`DeleteDocOpts` / `retiredEventDoc` shapes, and — since
[ADR-0259](../../docs/decisions/0259-every-client-reaches-the-store-through-an-http-front-door-di.md) —
the seam's own **HTTP transport**: the wire contract both halves share (`store-wire.ts`), the
`HttpStore` client, and the pure `handleStoreRequest` server half. It defines what *storing* means; it
never says where data lives.

It is a **contract, not a database.** The real Postgres implementation lives elsewhere (the library's
node-only store substrate, ADR-0077; drive-machinery, notice-board, and studio-members each implement
the same event-sourced pattern over *their own* tables). storage-protocol is the socket; those are the
devices that plug into it — so code written against the socket keeps working when the backend swaps
(`InMemoryStore` in a test, Postgres in production). The `InMemoryStore` reference is also the
executable spec: a real Postgres store is "correct" precisely because it passes the same `./parity`
suite the in-memory one does.

**The HTTP front door — built and parity-proven, wired to nobody.** ADR-0259 D1 makes an HTTP door the
store transport for every client that is not the server, with direct `pg` a **server-side privilege**
held only by the process behind the door. A door is just another backend behind the same six verbs, so
the transport belongs to the seam rather than to any one app: `store-wire.ts` is the contract BOTH
halves decode against (six routes, one per seam method — reads GET, writes POST — with ids kept out of
path segments so no TLS-terminating proxy can rewrite them, and an absent doc answered `200 {doc:null}`
so `404` stays readable as "the door is not mounted here"); `HttpStore` is the client half, browser-safe
over `fetch` / `URLSearchParams` / JSON with the transport injectable; and `handleStoreRequest` is a
pure, transport-agnostic server half — explicitly NOT an authorization layer, which the mounting door
supplies. All of it is held to the same `storeParitySuite` as `InMemoryStore`, run over a real loopback
socket, so the new backend is *demonstrated* equivalent rather than reviewed-equivalent.

**What that increment did NOT do (PR #983, 2026-07-27) — read this before citing D1 as current state.**
It migrated nobody. Every caller in this repo still dials `createPool`; no server is deployed behind the
door; the broker's write set is still assets-only; and proof-bearing writes through a door remain GATED
(ADR-0259 D5 — a door must RE-VERIFY signature and source anchor, behind an ADR-0081 amendment and an
ADR-0252 verification-integrity review that ADR does not lift). So `pg` has **not** actually become
server-side-only: D1 is the *target*, and what this port holds today is the contract, not the migration.
The wiring and the deployment are separate work, which is why the transport landing added no edge here.

The contract is **opinionated**: every write does two things atomically (ADR-0017) — append to the
append-only event history AND update the current-state projection — so every store in the system
remembers the same disciplined, event-sourced way. Everything the main entry publishes stays pure — the
seam, `InMemoryStore`, the wire contract, `HttpStore` — so it carries **no `node:` import** and stays
browser-bundleable; the two things a browser never needs live behind subpaths: the `node:test` parity
suites at `./parity`, and the door's server half at `./http-server`.

storage-protocol is the **second root node**: `proof-protocol` is the bottom sink (it depends on
nothing); storage-protocol sits one rung above it, reading only the `ChangeEvent` type from
proof-protocol.

**Why it is its own root organism, not part of library.** It is a shared *port* (a vocabulary), not a
*domain*: library's job is knowledge management, and the library is itself one of the organisms that
persist *through* this seam. If the seam lived inside `library`, every other organism that stores a row
would have to depend on the whole knowledge tier — the exact god-package smell ADR-0068 dissolved.
[ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)
made it an ordinary **root organism** every consumer declares `depends_on` against (the last
`substrate` exemption removed), so a dependency on the persistence seam is a **visible declared +
rendered edge**. (See the live-library open-question `oq-port-class-vs-root-node` for the A-vs-B
analysis the owner settled.)

## Design floor — foundational minimality

storage-protocol MUST stay browser-bundleable (the studio bundles the in-memory store + the seam
types), so its ONLY dependency is the `proof-protocol` root (a real, declared **foundational →
foundational** edge). ADR-0075's **foundational-minimality rule** the gate enforces — a foundational
port may only depend on other foundational ports — holds because both storage-protocol and
proof-protocol are foundational.

The floor **survived** the ADR-0259 transport rather than being bent by it: the dependency list is still
`proof-protocol` alone — the wire decoders are hand-rolled instead of zod, and the client takes an
injectable `fetch` instead of an HTTP dependency — so both new pure modules sit in the main entry. What
a browser never needs is quarantined behind a subpath, and there are now **two** such subpaths: the
`node:test` parity machinery at `./parity`, and the door's server half (`handleStoreRequest`) at
`./http-server`. The main entry still imports no `node:*`.

## Reliability Gates

A pure seam is a published CONTRACT (verbs + a reference impl) — there is no integrated user JOURNEY
to walk; a seam and its parity suite are a machine's job, not a human attestation. This port was
extracted and named inside the Storytree initiative, so its passing suite and foundational position do
not make it brownfield or Adopt-bound
([ADR-0395](../../docs/decisions/0395-brown-records-provenance-missing-proof-stays-on-the-greenfie.md)).
The author-declared observe gate below is therefore the port's one proof obligation: the suite is the
evidence surface, while only the deterministic spine observing it green at a clean committed HEAD and
persisting an `adopted` verdict signs `storage-protocol#gate-1` (ADR-0085).

1. **The seam, its `InMemoryStore` reference, and the HTTP transport parity suite are green**
   _(gate: observe)_ `pnpm --filter @storytree/storage-protocol test`. It exercises the
   `Store`/`ChangeStore` seam, the `InMemoryStore` reference, AND the ADR-0259
   transport (`HttpStore` driven over a real loopback socket with `handleStoreRequest` behind it, so
   both halves of the wire contract are covered at once) against the shared `./parity` contract
   offline (no DB, no API key, no deployed door). From a clean committed HEAD,
   `storytree gate run storage-protocol#gate-1 --pg` makes the spine observe this exact command and
   sign only when it exits green.

## Proof

**Green remains earned, not authored.** `packages/storage-protocol` has a real, passing offline suite
over the seam, its `InMemoryStore` reference, and the ADR-0259 HTTP transport, and now declares that
suite as `storage-protocol#gate-1`; neither the command nor its authored gate is itself a pass. The
authored rung remains `proposed` until the deterministic spine observes the command green at a clean
committed HEAD and persists the signed gate verdict. The world crown derives green only from that
signed proof (ADR-0020 / ADR-0040 / ADR-0085 / ADR-0395).

## Open modeling calls (for the owner)

1. **Capability granularity.** Kept to ZERO sub-capabilities (the narrow seam, its reference impl and
   the seam's own transport are one unit; ADR-0074 §3 lightweight-and-expandable). Split `Store` vs
   `ChangeStore` only if a real defect makes one worth proving on its own.
