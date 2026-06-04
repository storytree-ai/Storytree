# ADR-0007: Proof model

**Status:** proposed (2026-06-04) — full rationale: v1 ADR-0005/0006/0008/0027.

## Decision

Operationalize ADR-0002's **two** proof modes (+ composition). There is no third "exempt" tier: a unit is proven by a test or a UAT, or it isn't a unit on the tree.

| Tier | Proven by | Collaborators |
|---|---|---|
| contract | one isolated automated test | stubbed (mock-UAT seam permits it) |
| capability | ≥1 integrated UAT + its contracts green | **real** — also generates `dependency` edges |
| story | composition (its capabilities proven) | — |

- **Mock-UAT seam:** stubs are correct in a contract test, a structural defect in a UAT.
- **Red-before-green** is a structural discipline at the **contract** level (spine-enforced over pi's stream, not an agent-role split); the red/green records are **forensic evidence, not a promotion gate**.
- **Builder ≠ signer:** a capability's UAT is run and signed by a **dedicated UAT subagent**, never the agent that built it. That independence is the safeguard that lets promotion run autonomously, human-free (ADR-0008) — the evaluator never grades its own homework.
- **Guardrails are contracts, not a special tier.** Anything that must be deterministic — the orchestrator's own routing, approval/steering rules, hooks, CI/CD wrapping agent behaviour — is written as deterministic code and proven by ordinary contract tests. This **retires v1's `manual_signings`/UAT-exempt class**: a thing is either guardrail-code-with-a-contract, or it is *guidance* (not proof at all — ADR-0010).
- **Cold-rebuild = health invariant:** a unit is `healthy` iff a cold agent (its spec + transitive upstream specs only) can drive it red→green.

## Open

Proof/attestation persistence + the **agent**-signer identity (open-q §1) · brownfield `mapped` mechanism (open-q §2).
