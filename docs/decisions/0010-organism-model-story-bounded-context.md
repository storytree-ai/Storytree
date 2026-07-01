---
status: accepted
load_bearing: true
decided: 2026-06-06
---

# ADR-0010: The organism model — story as bounded context, the proof ladder, and cross-story interfaces

## Status

accepted (2026-06-06) — corrects [ADR-0002](0002-work-hierarchy-story-capability-contract.md) and [ADR-0007](0007-proof-model.md) in place (per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)); resolves adjudication call A.

## Date

2026-06-06

## Context

ADR-0002 set three tiers (story / capability / contract) with the **proof mode** as
the tier boundary: the **capability** carried the integrated UAT and the dependency
edges, the **story** was a pure rollup, and the **contract** was a single isolated test.
ADR-0007 operationalised that.

Dogfooding the model against `apps/studio` (the first seed) surfaced a sharper
architectural principle ADR-0002 didn't capture: **a story is a bounded context** — a
self-contained organism that is the unit of independent deployability (the microservice
grain).

The metaphor that drove the reframe (owner, 2026-06-06): an animal shares **one**
nervous system across its parts — DRY is correct *within* one organism. But many animals
in a rainforest each have their **own duplicated** nervous system; they do not share one —
DRY is *wrong across* organisms, because duplication is what preserves independence. Two
organisms may still collaborate, but only through a **declared, documented interface** —
the way a frontend depends on a database: two separate organisms, each able to run in
isolation, coupled only at an explicit, documented seam.

This relocates where proof and dependencies live, and answers the DAG-grain question
ADR-0002 left open (and adjudication call A).

## Decision

### 1. A story is a bounded context (organism)

A story is self-contained and independently deployable — the microservice grain. **Inside**
a story, capabilities share machinery and DRY is good architecture. **Across** stories,
behaviour is **duplicated, not shared**, except through a declared interface (§4).

### 2. The proof ladder shifts up one rung

The proof mode still decides the tier; each tier is now proven one rung higher than
ADR-0002 specified:

| Tier | Proven by | Collaborators |
|---|---|---|
| **story** | ≥1 integrated **UAT** (acceptance walkthrough, minimal-first) | **real** — the whole organism, end to end |
| **capability** | ≥1 **integration test** | **real in-story collaborators** (no stubs within the organism) |
| **contract** | one isolated automated test | stubbed (the mock seam permits it) |

- The **UAT moves up to the story** — it proves the organism meets its goal.
- The **capability is proven by integration tests against real in-story collaborators** —
  organs proven wired together, not in isolation.
- The **contract is unchanged** — the isolated unit-test leaf.

The result is a clean test pyramid bounded by the organism: **unit (contract) →
integration (capability) → acceptance/UAT (story)**.

### 3. Two dependency graphs, at two altitudes

- **Within a story — the capability graph is code-derived** (static analysis of the
  imports/calls between capabilities). Inside the boundary a dependency *is* the code
  coupling; it is read off the source, not hand-authored.
- **Across stories — the story graph is declared-interface-only.** A story may depend on
  another **only** through a documented interface (§4). Each story still runs in isolation
  against that interface. Hidden cross-story coupling is forbidden — it would break the
  microservice carve-out.

This answers ADR-0002's open *DAG grain* question and **adjudication call A**: stories
**do** carry edges, but only via declared interfaces; capabilities have their own
within-story, code-derived graph.

### 4. The cross-story interface (a new first-class concept)

The declared, documented seam between two stories — analogous to an API / port /
consumer-provider contract. It is the **only** legal cross-story coupling: two organisms
that are dependent to deliver an outcome but each function in isolation against the seam.

**Provisional naming (open detail, not a model fork).** The schema term is TBD. Bare
`interface` collides with TS `interface` — the same collision ADR-0002 rejected
`component` for — so the leading candidates are **`boundary`** or **`port`**. Ratify the
name when `packages/core` formalises the schema.

### 5. The mock seam, restated

- **No mocks within an organism.** Capability integration tests and the story UAT both run
  against real in-story collaborators.
- **The declared interface is the one stubbable boundary.** A story's UAT may run against a
  stubbed / contract-tested version of an upstream story's interface — exactly like
  acceptance-testing a frontend against a stubbed database. This is isolation, not theatre.
- **A test's collaborator surface may be wider than its code-derived edges.** A capability's
  integration test may exercise any *real* in-story collaborator it needs as scaffolding —
  e.g. `resolve-comment`'s test renders a real document via `read-corpus` — without that
  becoming a dependency edge. Edges (§3) track code coupling (imports/calls), not test
  scaffolding; touching a real, non-stubbed in-story collaborator is never a missing edge.
  (Owner call, 2026-06-06; closes the `resolve-comment`/`read-corpus` entanglement as
  *keep separate, no edge*.)

### 6. Cold-rebuild — an authoring guideline, not a gate

Cold-rebuild is the aspiration that a story be written **self-contained enough** that a
cold agent — given the story's own spec plus the declared interfaces of its upstream
stories (never their internals) — could rebuild it and pass its UAT. The rebuilt
*internals* may legitimately differ: many implementations satisfy one UAT (many ways to
skin a cat).

This is **guidance for authoring stories, not a machine-enforced invariant**, and **not**
the definition of `healthy`. `healthy` is earned through the proof modes (§2) and the
prove-it-gate; cold-rebuild is never re-derived as a gate (v1 carried it as authoring
guidance and never enforced it). It is the reason a story should declare its upstream
*interfaces* well — but **what an interface document must contain, and the exact
interface/internals line, are deliberately left open** until `packages/core` (or a second
story) forces them. With one story today nothing depends on anything, so this does not yet
bite.

## Consequences

- **Corrects [ADR-0002](0002-work-hierarchy-story-capability-contract.md) in place** (per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)) — the proof-mode table, the dependency grain, and the deferred
  DAG-grain question (§2, §3 here).
- **Corrects [ADR-0007](0007-proof-model.md) in place** (per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)) — the proof table, the mock-UAT seam, and the cold-rebuild
  definition (§2, §5, §6 here).
- **glossary** — `UAT` (now story-level), `capability` (integration-proven), `dependency`
  (split: in-story code-derived vs cross-story interface), `cold-rebuild`, and the
  mock-UAT seam are redefined; the cross-story interface term is added.
- **The first seed** (`stories/studio-foundation/`) folds its seven per-capability UATs
  into one **story-level UAT**, reinterprets `depends_on` as code-derived in-story edges,
  and reframes each capability's contracts as the integration + unit layers.
- **Schema (`packages/core`)** — `proof_mode` carrying the UAT moves to the story tier;
  capabilities carry integration-test proof; the cross-story interface becomes a new
  schema entity.
- **Status enum is unchanged** — `proposed` stays for the retro-authored seed (owner call,
  2026-06-06: experimentation stage; no `experimental`/`built-unproven` tier).

## References

- [ADR-0002](0002-work-hierarchy-story-capability-contract.md) (work hierarchy — corrected in place per ADR-0139), [ADR-0007](0007-proof-model.md) (proof model — corrected in place per ADR-0139).
- `docs/adjudication.md` call A (resolved here).
- Design conversation, 2026-06-06 (the rainforest/organism reframe).
