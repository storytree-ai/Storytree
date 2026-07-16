---
status: accepted
decided: 2026-06-04
---

# ADR-0008: UI drives agents — approval-gated trunk

**Status:** accepted (2026-06-04; flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) — full rationale: v1 ADR-0006/0008/0010/0013/0014/0020 (this **inverts** their autonomous-cascade posture).

**Correction ([ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) → [ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md) → [ADR-0204](0204-retire-the-studio-banner-full-bleed-forest-with-a-hud-avatar.md), per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** this ADR's core decision — the studio drives the agents, the trunk is approval-gated, the human owns the outer loop — STANDS in full and is current. Overtaken only: its **single-local-operator identity assumption** (the free-text `author` field), which evolved in a chain — first **narrowed by [ADR-0042]** (hosted sessions carry a verified IAP identity) **then replaced by [ADR-0043]** (an app-owned `users` projection with `admin`/`member` roles and invitations from the UI) **then the free-text field itself retired by [ADR-0204]** (the studio chrome carries no operator input; attribution everywhere comes from the verified identity — the IAP email hosted, `STORYTREE_STUDIO_DEV_IDENTITY` locally, the conventional `operator` fallback only in the open dev posture; the localStorage `storytree.operator` key and `useOperator` go away). The comment substrate itself stands. The ADR-0043 app-owned user model, presented via the ADR-0204 HUD avatar, is the current truth.

## Decision

The studio is the human surface and drives the agents.

- **Per-action approval is first-class** (inverts v1's `--dangerously-skip-permissions`): approve / reject / steer individual owned-loop actions in-loop; approvals + steering are typed `actor=operator` events.
- **Human at the outer loop:** the inner loop (drive a unit red→green) is automatable; the outer loop (accept to trunk, accept a decomposition, amend/retry/abandon) is human. Autonomous self-amendment is rejected for now (confirmation-bias); self-building is the north-star, **not** a day-one removal.
- **Approval-gated trunk** (inverts auto-merge-on-green): a green result surfaces for human diff-review and lands only on approval, as a signed promotion event. Content invariants — contracts green, UAT signed, upstream healthy — are **never bypassable**.
- **Cost is a first-class surface:** per-token cost + round counts are rendered and gated on (budget mechanism in ADR-0005).
- **No escalation-screener:** the always-watching studio dissolves its premise — do not re-import it.

## Open

UAT-signer identity (open-q §1) · wire protocol (open-q §8) · channel / per-node-chat fold-in (open-q §5).
