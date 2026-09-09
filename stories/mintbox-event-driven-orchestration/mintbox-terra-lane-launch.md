---
id: "mintbox-terra-lane-launch"
tier: capability
story: mintbox-event-driven-orchestration
title: "Verified Terra lane launch — role policy, claims, and safe Mintbox capacity"
outcome: "A fresh Astra coordinator dispatches sustained Terra lane drivers only into safely claimed lanes, verifies their model/effort and detached handles, and enforces the three-lane and GPU serialisation fences."
status: proposed
proof_mode: integration-test
depends_on: [mintbox-supervisor-events, mintbox-protected-driver-transition]
decisions: [561, 505]
---

# Verified Terra lane launch — role policy, claims, and safe Mintbox capacity

**Outcome —** A fresh Astra coordinator dispatches sustained Terra lane drivers only into safely
claimed lanes, verifies their model/effort and detached handles, and enforces the three-lane and GPU
serialisation fences.

## Proof walkthrough first

Give a fresh coordinator a bounded digest containing four ready disjoint 3D lanes, one GPU-intensive
lane, live claims, and one released renderer lane. Observe its selected launches and persisted decision:
each driver is Terra with a verified handle/claim, at most three 3D lanes run, and GPU work waits for
serialization. Repeat with an architecture-marked decision to confirm only that coordinator can use
xhigh.

## Contracts

1. **`mintbox-role-model-effort-is-verified`** — model identity follows the role
   - **asserts —** routine coordinators record GPT-6 Astra `high`; `xhigh` requires an explicitly
     recorded architecture decision; every sustained lane driver records GPT-5.6 Terra before work starts.
2. **`mintbox-launch-binds-handle-and-claim`** — a launched driver is observable and owns its lane
   - **asserts —** `packages/agent/src/headless-orchestrator.ts` persists the detached process handle plus
     the live claim, verifies both after spawn, and fails/reports rather than declaring a lane occupied when
     either is absent.
3. **`mintbox-3d-capacity-and-gpu-serialization-hold`** — safe fan-out does not overrun the box
   - **asserts —** `packages/agent/src/headless-orchestrator.ts` dispatches at most three safely disjoint
     3D lanes and holds a GPU-intensive lane until conflicting GPU work has ended, regardless of otherwise
     independent claims.
