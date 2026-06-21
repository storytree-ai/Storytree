---
id: "proof-protocol"
tier: story
title: "The proof-protocol port — the shared verdict vocabulary at the root of the graph"
outcome: "Every organism that reads or writes a verdict speaks one zod-validated, browser-safe verdict SHAPE — the foundational root node the whole graph points at, depending on nothing."
status: mapped
proof_mode: UAT
# Machine-judged: a pure SHAPE has no UAT journey (ADR-0085) — its green is an `observe` reliability
# gate (the port's own offline suite), observe-and-signed into an `adopted` verdict. No DB, no API key.
uat_witness: machine
# Lightweight + expandable (ADR-0074 §3, the hub/port shape): the port IS the unit — a single
# published shape — so it carries no sub-capabilities yet; the list grows one case per real defect.
capabilities: []
# Root organism (ADR-0075): proof-protocol is the bottom SINK of the dependency order — it depends
# on nothing. The cli HUB imports it; declared provider-side here so the hub stays de-noised (the same
# pattern library/store use). Domain organisms that import it declare it consumer-side in depends_on.
depends_on: []
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the verdict SHAPE / first port (68); ports as root organisms (74/75);
# the role-not-position rename verdict-contract→proof-protocol (78); author-defined story green +
# mapped-as-bootstrap (83); the brownfield reliability gates + observe-and-sign that flip it (85).
decisions: [68, 74, 75, 78, 83, 85]
---

# The proof-protocol port — the shared verdict vocabulary at the root of the graph

**Outcome —** Every organism that reads or writes a verdict speaks one zod-validated, browser-safe
verdict SHAPE — the foundational root node the whole graph points at, depending on nothing.

`packages/proof-protocol` (formerly `verdict-contract` — renamed for role-not-position by
[ADR-0078](../../docs/decisions/0078-rename-root-ports-role-not-position.md)) is the published verdict SHAPE (ADR-0068 §3): the zod DATA shapes +
validators (`Verdict` / `ProofMode` / `SigningRow` / `EvidenceRef` / `ChangeEvent` / `DriftFlag` /
`Attestation` / `anchor`, plus the duplicated `Tier` / `Status`). It is **browser-safe and zod-only**:
readers `.safeParse()` verdict-DATA across the organism boundary and never import the proof machinery
(which lives in `drive-machinery`'s `packages/orchestrator`). It depends on **nothing** — it is the
true sink at the bottom of the dependency order, the node every other organism ultimately points at.

**Why it is a root organism, not an exempt class ([ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)).**
ADR-0074 §2 rejected exempting the most-connected nodes (cli/store) from the boundary gate, because
hiding a connection hides the architecture. The shared ports were the last exemption: a `substrate`
class anyone could depend on with **no declared edge**. ADR-0075 removes it — proof-protocol is an
ordinary **root organism** (`depends_on: []`) that every consumer declares `depends_on` against,
exactly like the `library` trunk, so a dependency on the verdict vocabulary is a **visible declared +
rendered edge**, not an invisible exemption. (See the live-library open-question
`oq-port-class-vs-root-node` for the A-vs-B analysis the owner settled.)

## Design floor — foundational minimality

proof-protocol MUST stay zod-only and node/pg-free so the studio's **browser bundle** works (the
studio bundles it). Under the old `substrate` class this was the rule "substrate may not depend on an
organism". Under ADR-0075 it is the **foundational-minimality rule** the gate enforces: a foundational
port may only depend on other foundational ports. proof-protocol depends on nothing, so it satisfies
it by construction. (Belt-and-suspenders over two backstops: it is the bottom sink, so any back-edge
to a real organism would close a cycle the gate already rejects (ADR-0058); and the studio browser
build catches an external node-only npm import the gate cannot see.)

## Reliability Gates

A pure protocol is a published SHAPE — there is no integrated user JOURNEY to walk, so UAT-as-prose
does not fit it ([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). Instead this port declares the author-owned **reliability gates** that flip it off `mapped`:
the brownfield obligation set, machine-judged (a schema/scaffolding port is a machine's job, not a
human attestation). The list is the **expandable floor** — start by adopting the existing green suite,
and add a `_(gate: build-tests)_` gate (a genuine red→green regression leg) the moment that observation
proves insufficient (a real defect slips through a consumer).

1. **The port's own suite is green** _(gate: observe)_ `pnpm --filter @storytree/proof-protocol test`.
   The spine runs it at a clean committed HEAD and OBSERVES it green — the zod shapes, the validators,
   and the cross-boundary parity guard all pass offline (no DB, no API key) — then signs an `adopted`
   verdict (`storytree gate run proof-protocol#gate-1 --pg`). Adopting this gate flips the port off
   `mapped`; the world's crown derives green from the signed verdict (ADR-0040), no faked red required.

## Proof

**Status off `mapped` is EARNED, not authored.** `packages/proof-protocol` has a real, passing,
offline suite that observationally verifies the shapes + validators + the parity guard today — that
observational green is brownfield `mapped`. The port leaves `mapped` exactly when its `observe`
reliability gate above is **adopted**: the spine observes the suite green at a clean committed HEAD and
signs an `adopted` machine verdict ([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)).
`healthy` is non-authorable (ADR-0020) — the authored frontmatter `status:` stays `mapped`; the world
crown DERIVES green from the signed verdict.

## Open modeling calls (for the owner)

1. **Capability granularity.** Kept to ZERO sub-capabilities (the port is a single published shape;
   ADR-0074 §3 lightweight-and-expandable). Split per shape family (verdict / attestation / drift /
   change-event) only if a real defect makes one worth proving on its own.
