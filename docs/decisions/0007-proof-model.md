---
status: proposed
decided: 2026-06-04
---

# ADR-0007: Proof model

**Status:** proposed (2026-06-04) — full rationale: v1 ADR-0005/0006/0008/0024/0027. **Amended by ADR-0010** (proof table, mock-UAT seam, cold-rebuild).

## Decision

Operationalize ADR-0002's three proof modes, and add a third.

| Tier | Proven by | Collaborators |
|---|---|---|
| contract | one isolated automated test | stubbed (mock-UAT seam permits it) |
| capability | ≥1 integration test + its contracts green | **real in-story collaborators** (no stubs within the organism); within-story `dependency` edges are code-derived (ADR-0010 §3) |
| story | ≥1 integrated **UAT** | **real** — the whole organism, end to end |

- **Mock-UAT seam (ADR-0010 §5):** **no mocks within an organism** — capability integration tests and the story UAT both run against real in-story collaborators. The **declared cross-story interface is the one stubbable boundary**: a story's UAT may run against a stubbed/contract-tested version of an upstream story's interface (like acceptance-testing a frontend against a stubbed database). Stubs are correct only at that seam and in a contract test; a stub *within* the organism is a **structural defect**.
- **Red-before-green** is a structural discipline at the **contract** level, enforced by the spine over the owned loop's stream (not by splitting agents). The red/green records are **forensic evidence, not a promotion gate**.
- **Third mode — `operator-attested`** (dogfood-only): for surfaces with neither an honest UAT nor an isolatable test (e.g. the orchestrator's own routing/approval discipline). It now attaches at the **story/capability** level, consistent with the new ladder. Promotion is an explicit, per-unit, operator-granted **signed event**; an agent can **never** self-exempt; it is distinct in the audit trail from a UAT sign, and it reaches `healthy` (unlike `mapped`). **Overrules v1 0028-D16.**
- **Cold-rebuild = an authoring guideline (ADR-0010 §6):** a story should be written self-contained enough that a cold agent — given the story's spec plus its upstream stories' declared interfaces (never their internals) — could rebuild it and pass its UAT (the internals may differ; many implementations satisfy one UAT). Guidance for authoring, **not** a gate and **not** the definition of `healthy` (earned via the proof modes / prove-it-gate); never machine-enforced. (Distinct from the DAG-stabilisation sense of convergence — open-q §4.)

## Open

Proof/attestation persistence + signer identity (open-q §1) · who signs a UAT promotion (ADR-0008) · brownfield `mapped` mechanism (open-q §2).
