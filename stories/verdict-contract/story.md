---
id: "verdict-contract"
tier: story
title: "The verdict-contract port — the shared verdict vocabulary at the root of the graph"
outcome: "Every organism that reads or writes a verdict speaks one zod-validated, browser-safe verdict SHAPE — the foundational root node the whole graph points at, depending on nothing."
status: mapped
proof_mode: UAT
# Agent-exercised: the UAT is an agent running the port's own offline suite and a cross-boundary
# safeParse — machine-witnessed (ADR-0040). No DB, no API key.
uat_witness: machine
# Lightweight + expandable (ADR-0074 §3, the hub/port shape): the port IS the unit — a single
# published shape — so it carries no sub-capabilities yet; the list grows one case per real defect.
capabilities: []
# Root organism (ADR-0075): verdict-contract is the bottom SINK of the dependency order — it depends
# on nothing. The cli HUB imports it; declared provider-side here so the hub stays de-noised (the same
# pattern library/store use). Domain organisms that import it declare it consumer-side in depends_on.
depends_on: []
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the verdict SHAPE / first port (68); ports as root organisms (74/75).
decisions: [68, 74, 75]
---

# The verdict-contract port — the shared verdict vocabulary at the root of the graph

**Outcome —** Every organism that reads or writes a verdict speaks one zod-validated, browser-safe
verdict SHAPE — the foundational root node the whole graph points at, depending on nothing.

`packages/verdict-contract` is the published verdict SHAPE (ADR-0068 §3): the zod DATA shapes +
validators (`Verdict` / `ProofMode` / `SigningRow` / `EvidenceRef` / `ChangeEvent` / `DriftFlag` /
`Attestation` / `anchor`, plus the duplicated `Tier` / `Status`). It is **browser-safe and zod-only**:
readers `.safeParse()` verdict-DATA across the organism boundary and never import the proof machinery
(which lives in `drive-machinery`'s `packages/orchestrator`). It depends on **nothing** — it is the
true sink at the bottom of the dependency order, the node every other organism ultimately points at.

**Why it is a root organism, not an exempt class ([ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)).**
ADR-0074 §2 rejected exempting the most-connected nodes (cli/store) from the boundary gate, because
hiding a connection hides the architecture. The shared ports were the last exemption: a `substrate`
class anyone could depend on with **no declared edge**. ADR-0075 removes it — verdict-contract is an
ordinary **root organism** (`depends_on: []`) that every consumer declares `depends_on` against,
exactly like the `library` trunk, so a dependency on the verdict vocabulary is a **visible declared +
rendered edge**, not an invisible exemption. (See the live-library open-question
`oq-port-class-vs-root-node` for the A-vs-B analysis the owner settled.)

## Design floor — foundational minimality

verdict-contract MUST stay zod-only and node/pg-free so the studio's **browser bundle** works (the
studio bundles it). Under the old `substrate` class this was the rule "substrate may not depend on an
organism". Under ADR-0075 it is the **foundational-minimality rule** the gate enforces: a foundational
port may only depend on other foundational ports. verdict-contract depends on nothing, so it satisfies
it by construction. (Belt-and-suspenders over two backstops: it is the bottom sink, so any back-edge
to a real organism would close a cycle the gate already rejects (ADR-0058); and the studio browser
build catches an external node-only npm import the gate cannot see.)

## Story UAT

The integrated acceptance walkthrough that proves the whole `verdict-contract` organism — *an agent
runs the port's own offline suite and reads verdict-DATA across the boundary* (ADR-0074 §3, the
minimum that proves the goal). Every leg is an **agent (machine) exercise** (`_(witness: machine)_`).
The list is **expandable** — each real defect earns a permanent regression leg.

**Goal —** One agent proves the verdict SHAPE is a real, validated, browser-safe vocabulary: the
package's offline suite passes, and a reader `.safeParse()`s a verdict-DATA value across the boundary.

1. **The port's own suite is green:** _(witness: machine)_ `pnpm --filter @storytree/verdict-contract
   test`. **Success —** the zod shapes + validators pass offline (no DB, no API key).
2. **Cross-boundary safeParse:** _(witness: machine)_ a consumer (e.g. `@storytree/store`) reads a
   stored verdict-DATA value through `Verdict.safeParse`. **Success —** a valid value parses, a
   malformed one is rejected — proving the published shape is the real boundary contract.

End state — the verdict vocabulary validates, parses across the boundary, and stays browser-safe.

## Proof

**Honest status — `mapped` (brownfield), NOT `healthy`.** `packages/verdict-contract` has a real,
passing, offline automated suite that observationally verifies the shapes + validators today. Per the
glossary that observational green is brownfield `mapped` — storytree's own prove-it-gate has not
driven it red→green, so nothing here is `healthy`.

## Open modeling calls (for the owner)

1. **Capability granularity.** Kept to ZERO sub-capabilities (the port is a single published shape;
   ADR-0074 §3 lightweight-and-expandable). Split per shape family (verdict / attestation / drift /
   change-event) only if a real defect makes one worth proving on its own.
