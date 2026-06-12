---
status: proposed
decided: 2026-06-04
---

# ADR-0008: UI drives agents — approval-gated trunk

**Status:** proposed (2026-06-04) — full rationale: v1 ADR-0006/0008/0010/0013/0014/0020 (this **inverts** their autonomous-cascade posture).

## Decision

The studio is the human surface and drives the agents.

- **Per-action approval is first-class** (inverts v1's `--dangerously-skip-permissions`): approve / reject / steer individual owned-loop actions in-loop; approvals + steering are typed `actor=operator` events.
- **Human at the outer loop:** the inner loop (drive a unit red→green) is automatable; the outer loop (accept to trunk, accept a decomposition, amend/retry/abandon) is human. Autonomous self-amendment is rejected for now (confirmation-bias); self-building is the north-star, **not** a day-one removal.
- **Approval-gated trunk** (inverts auto-merge-on-green): a green result surfaces for human diff-review and lands only on approval, as a signed promotion event. Content invariants — contracts green, UAT signed, upstream healthy — are **never bypassable**.
- **Cost is a first-class surface:** per-token cost + round counts are rendered and gated on (budget mechanism in ADR-0005).
- **No escalation-screener:** the always-watching studio dissolves its premise — do not re-import it.

## Open

UAT-signer identity (open-q §1) · wire protocol (open-q §8) · channel / per-node-chat fold-in (open-q §5).
