---
id: "base"
tier: story
title: "The base port — the universal Store/ChangeStore document-event seam"
outcome: "Every organism that persists a document or reads a change event speaks one narrow, browser-safe Store/ChangeStore contract — a foundational root node that depends only on the verdict-contract root."
status: mapped
proof_mode: UAT
# Agent-exercised: the UAT is an agent running the port's own offline parity suite — machine-witnessed
# (ADR-0040). No DB, no API key.
uat_witness: machine
# Lightweight + expandable (ADR-0074 §3, the port shape): the narrow seam + its in-memory reference
# are the unit; no sub-capabilities yet. The list grows one case per real defect.
capabilities: []
# Root organism (ADR-0075): base is a NEAR-root — it depends only on the verdict-contract root
# (declared below, a foundational→foundational edge). The cli HUB imports it; declared provider-side
# here so the hub stays de-noised. Domain organisms that import it declare it consumer-side.
depends_on: [verdict-contract]
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the base seam extraction (68); ports as root organisms (74/75).
decisions: [68, 74, 75]
---

# The base port — the universal Store/ChangeStore document-event seam

**Outcome —** Every organism that persists a document or reads a change event speaks one narrow,
browser-safe Store/ChangeStore contract — a foundational root node that depends only on the
verdict-contract root.

`packages/base` is the universal, browser-safe base seam (ADR-0068 step 5): the narrow `Store` /
`ChangeStore` document-event contract, the `InMemoryStore` reference, and
`StoredDoc` / `StoreEvent` / `DeleteDocOpts` / `retiredEventDoc`. The reusable `node:test` parity
suites live behind the `./parity` subpath so the main entry carries **no `node:` import** and stays
browser-bundleable. base is the second root node: `verdict-contract` is the bottom sink, `base` sits
one rung above it (it reads the `ChangeEvent` type from verdict-contract).

**Why it is a root organism, not an exempt class ([ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)).**
The shared ports were the last `substrate` exemption — anyone could depend on them with no declared
edge. ADR-0075 removes it (the same visibility-over-exemption call ADR-0074 §2 made for cli/store):
base is an ordinary **root organism** that every consumer declares `depends_on` against, so a
dependency on the persistence seam is a **visible declared + rendered edge**. (See the live-library
open-question `oq-port-class-vs-root-node` for the A-vs-B analysis the owner settled.)

## Design floor — foundational minimality

base MUST stay browser-bundleable (the studio bundles the in-memory store + the seam types), so its
ONLY dependency is the `verdict-contract` root (a real, declared **foundational → foundational** edge).
ADR-0075's **foundational-minimality rule** the gate enforces — a foundational port may only depend on
other foundational ports — is satisfied because both base and verdict-contract are foundational. The
`node:test` parity machinery is quarantined behind `./parity` so the main entry never imports `node:*`.

## Story UAT

The integrated acceptance walkthrough that proves the whole `base` organism — *an agent runs the
port's own offline parity suite* (ADR-0074 §3, the minimum that proves the goal). Every leg is an
**agent (machine) exercise** (`_(witness: machine)_`); the list is **expandable**.

**Goal —** One agent proves the Store/ChangeStore seam is a real, browser-safe abstraction: the
package's offline suite passes, and the `InMemoryStore` satisfies the shared parity contract.

1. **The port's own suite is green:** _(witness: machine)_ `pnpm --filter @storytree/base test`.
   **Success —** the seam + `InMemoryStore` parity pass offline (no DB, no API key).
2. **The seam is a real abstraction, not a 1-impl stub:** _(witness: machine)_ the exported parity
   suite (`./parity`) runs against `InMemoryStore`. **Success —** the in-memory impl satisfies the
   same contract a Postgres impl is held to (`store` reuses this suite as devDep scaffolding) —
   proving the seam is the genuine abstraction the whole graph persists through.

End state — the document-event seam validates, the reference impl satisfies parity, and base stays
browser-safe.

## Proof

**Honest status — `mapped` (brownfield), NOT `healthy`.** `packages/base` has a real, passing,
offline automated suite (the seam + `InMemoryStore` parity). Per the glossary that observational
green is brownfield `mapped` — storytree's own prove-it-gate has not driven it red→green, so nothing
here is `healthy`.

## Open modeling calls (for the owner)

1. **Capability granularity.** Kept to ZERO sub-capabilities (the narrow seam + its reference impl is
   one unit; ADR-0074 §3 lightweight-and-expandable). Split `Store` vs `ChangeStore` only if a real
   defect makes one worth proving on its own.
