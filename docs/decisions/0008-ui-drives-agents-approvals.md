# ADR-0008: UI watches & drives — autonomous by default

**Status:** proposed (2026-06-04) — full rationale: v1 ADR-0006/0008/0010/0014/0020.

## Decision

The studio is the human's window onto the tree and lets the human step in at will — but the **default flow is autonomous**. Agents prove and promote their own work; the human is optional, not a gate.

- **Autonomous promotion by default:** a capability whose contracts are green and whose UAT is signed **by a dedicated UAT subagent** (ADR-0007, builder ≠ signer) promotes to the trunk on its own. No human approval is required for the common path.
- **The independence safeguard is the dedicated UAT subagent, not a human** — so v2 drops v1's "human-at-the-outer-loop until an independent evaluator exists": the independent evaluator *is* the UAT subagent.
- **The human can intervene anywhere, anytime** — watch live, comment, steer an in-flight run, approve, veto, or pause a unit — through the studio. Intervention is **opt-in**, recorded as typed `actor=operator` events, never a mandatory checkpoint. Ideally the human never needs to.
- **Content invariants are never bypassable:** the trunk admits a unit only with contracts green, an independently-signed UAT, and a healthy upstream. Autonomy relaxes *who clicks*, not *what must be true* (the never-bypass posture, v1 ADR-0014).
- **Cost is a first-class surface:** per-token cost + round counts are rendered; the human can cap spend (budget mechanism, ADR-0005).
- **No escalation-screener** — the studio is always available; nothing rations human attention.

## Open

Agent-signer identity (open-q §1) · wire protocol (open-q §8) · whether any narrow class ever *requires* a human (e.g. irreversible/destructive actions) — decide later.
