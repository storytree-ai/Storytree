---
id: "circle-onboarding"
tier: capability
story: studio-hosting
title: "Adding a trusted dev is one grant; removing them is one revoke"
outcome: "The circle is managed as an enumerable IAM allowlist with a runbook: invite, sign-in, first comment — and revoke — each a single documented step."
status: proposed
proof_mode: UAT
depends_on: [cloud-run-iap]
---

# Adding a trusted dev is one grant; removing them is one revoke

**Outcome —** The circle is managed as an enumerable IAM allowlist with a runbook: invite,
sign-in, first comment — and revoke — each a single documented step.

## Guidance

- The runbook lives with the infra docs: the grant command (or tf var edit), the URL to send,
  what the dev sees (Google sign-in → the studio), what they can and cannot do (ADR-0042 d.3),
  and the revoke command.
- The allowlist must be enumerable in one command — "who can see this" is an owner question
  that deserves an instant answer.
- The demo runbook notes the degraded mode honestly: if the DB is idle-stopped the circle sees
  the banner and no live layers; the owner brings it up.

## Contracts (2)

1. **`one-step-grant-revoke`** — membership changes are single documented operations
   - **asserts —** the runbook's grant adds access end-to-end; its revoke removes it; both
     verified live once.
2. **`allowlist-enumerable`** — the circle is listable on demand
   - **asserts —** one command answers current membership accurately.
