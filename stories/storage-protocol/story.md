---
id: "storage-protocol"
tier: story
title: "The storage-protocol port — the universal document-event storage seam every organism persists through"
outcome: "Every organism that persists state speaks ONE narrow, browser-safe Store/ChangeStore contract — the same event-sourced grammar (append an event AND update the projection, atomically) over any backend — so WHAT an organism stores is decoupled from WHERE it is stored. A foundational root the whole graph rests on, depending only on the proof-protocol root."
status: mapped
proof_mode: UAT
# Machine-judged: a pure SEAM has no UAT journey (ADR-0085) — its green is an `observe` reliability
# gate (the port's own parity suite), observe-and-signed into an `adopted` verdict. No DB, no API key.
uat_witness: machine
# Lightweight + expandable (ADR-0074 §3, the port shape): the narrow seam + its in-memory reference
# are the unit; no sub-capabilities yet. The list grows one case per real defect.
capabilities: []
# Root organism (ADR-0075): storage-protocol is a NEAR-root — it depends only on the proof-protocol
# root (declared below, a foundational→foundational edge). The cli HUB imports it; declared
# provider-side here so the hub stays de-noised. Domain organisms that import it declare it consumer-side.
depends_on: [proof-protocol]
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the seam extraction (68); ports as root organisms (74/75); the
# role-not-position rename base→storage-protocol (78); author-defined story green + mapped-as-bootstrap
# (83); the brownfield reliability gates + observe-and-sign that flip it (85).
decisions: [68, 74, 75, 78, 83, 85]
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
`readEvents`) — the `InMemoryStore` reference implementation, and the `StoredDoc` / `StoreEvent` /
`DeleteDocOpts` / `retiredEventDoc` shapes. It defines what *storing* means; it never says where data
lives.

It is a **contract, not a database.** The real Postgres implementation lives elsewhere (the library's
node-only store substrate, ADR-0077; drive-machinery, notice-board, and studio-members each implement
the same event-sourced pattern over *their own* tables). storage-protocol is the socket; those are the
devices that plug into it — so code written against the socket keeps working when the backend swaps
(`InMemoryStore` in a test, Postgres in production). The `InMemoryStore` reference is also the
executable spec: a real Postgres store is "correct" precisely because it passes the same `./parity`
suite the in-memory one does.

The contract is **opinionated**: every write does two things atomically (ADR-0017) — append to the
append-only event history AND update the current-state projection — so every store in the system
remembers the same disciplined, event-sourced way. The `node:test` parity suites live behind the
`./parity` subpath so the main entry carries **no `node:` import** and stays browser-bundleable.

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
proof-protocol are foundational. The `node:test` parity machinery is quarantined behind `./parity` so
the main entry never imports `node:*`.

## Reliability Gates

A pure seam is a published CONTRACT (verbs + a reference impl) — there is no integrated user JOURNEY
to walk, so UAT-as-prose does not fit it ([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). Instead this port declares the author-owned **reliability gates** that flip it off `mapped`:
the brownfield obligation set, machine-judged (a seam + its parity suite is a machine's job, not a
human attestation). The list is the **expandable floor** — start by adopting the existing green parity
suite, and add a `_(gate: build-tests)_` gate (a genuine red→green regression leg) the moment that
observation proves insufficient (a real defect slips through a backend).

1. **The seam + its `InMemoryStore` parity are green** _(gate: observe)_ `pnpm --filter
   @storytree/storage-protocol test`. The spine runs it at a clean committed HEAD and OBSERVES it green
   — the `Store`/`ChangeStore` seam and the `InMemoryStore` reference satisfy the shared `./parity`
   contract offline (no DB, no API key) — then signs an `adopted` verdict
   (`storytree gate run storage-protocol#gate-1 --pg`). Adopting this gate flips the port off `mapped`;
   the world's crown derives green from the signed verdict (ADR-0040), no faked red required.

## Proof

**Status off `mapped` is EARNED, not authored.** `packages/storage-protocol` has a real, passing,
offline suite (the seam + `InMemoryStore` parity, the executable spec a real Postgres backend is held
to) — that observational green is brownfield `mapped`. The port leaves `mapped` exactly when its
`observe` reliability gate above is **adopted**: the spine observes the parity suite green at a clean
committed HEAD and signs an `adopted` machine verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)).
`healthy` is non-authorable (ADR-0020) — the authored frontmatter `status:` stays `mapped`; the world
crown DERIVES green from the signed verdict.

## Open modeling calls (for the owner)

1. **Capability granularity.** Kept to ZERO sub-capabilities (the narrow seam + its reference impl is
   one unit; ADR-0074 §3 lightweight-and-expandable). Split `Store` vs `ChangeStore` only if a real
   defect makes one worth proving on its own.
