---
status: accepted
decided: 2026-06-22
amends: [89]
load_bearing: true
---
# ADR-0091: Proof-bearing builds may run in a hosted self-contained worker off the laptop tether

## Status

accepted — owner-decided 2026-06-22, alongside ADR-0090. It establishes that proof-bearing builds
may run in a hosted, self-contained, gate-running worker — a different vehicle from ADR-0089's
read-only bridge — and so unblocks ADR-0090's Phase 3 hosting without weakening proof integrity.

## Context

ADR-0089 settled three things: a 443-only remote session cannot reach the DB data plane; the only
cloud path to the store is an HTTPS bridge; and — as a guard — that if such a BRIDGE is built it must
expose no proof-bearing writes, because a naked write endpoint reachable by agent-authored code is a
forge pathway. Its default operating stance kept live builds on a laptop / direct session ("the
correct place for trust").

ADR-0090 needs the inner loop — which signs verdicts — to run on a hosted worker so a trusted circle
can drive builds from the UI. On its face that collides with ADR-0089's laptop-tether default. The
distinction that resolves it: ADR-0089's "no proof writes in the cloud" is about a THIN BRIDGE that
persists a verdict handed to it as data. A self-contained WORKER that runs the entire prove-it-gate —
observing RED then GREEN from real subprocess exit codes and signing — is a different vehicle: the
verdict is produced by the gate, never handed in. ADR-0089 did not decide on this vehicle.

## Decision

1. **A self-contained, gate-running worker MAY perform proof-bearing builds off the laptop**,
   including on hosted infrastructure. This is distinct from, and does not reopen, ADR-0089's
   read-only bridge: a thin DB-over-HTTPS bridge, if ever built, still exposes no proof-bearing
   writes.
2. **Two backstops make it safe by construction:**
   - **No verdict is ever handed in.** The worker runs the real gate (ADR-0020): the spine observes
     RED then GREEN from real exit codes and signs. The agent (leaf) holds no DB connection and no
     signing key; its tool surface is the write-scoped filesystem only. The forge pathway ADR-0089
     feared — a write endpoint that persists a supplied verdict — therefore never exists.
   - **CI independently re-proves green before the trunk.** A signed pass pushes a `claude/real/*`
     branch and opens a PR; CI re-runs the full suite on the merge before anything lands on main
     (ADR-0022). So even a worst-case wrong verdict cannot place unproven code on the trunk — the
     damage ceiling is a briefly-wrong hue in the studio, corrected when CI runs.
3. **Identity.** The verdict signer is the triggering operator / member identity, carried on the
   build intent and gated by IAP. The worker's DB principal is a service account, so per-principal
   IAM identity at the data layer is replaced by app-layer authz over the trusted-operator / circle
   set — the ADR-0021 identity-collapse trade, kept bounded by keeping the trigger set trusted.
4. **Amends ADR-0089.** Its laptop-only default for proof-bearing builds is relaxed by sanctioning
   the self-contained worker vehicle; ADR-0089's network findings and read-only-bridge guard stand
   unchanged.

## Consequences

**Good**
- Unblocks ADR-0090 Phase 3 (hosting the worker for the circle) without weakening proof integrity:
  the gate still observes RED then GREEN, and CI is a second, independent proof before the trunk.
- The integrity argument is pre-decided, so a future session need not re-derive whether proof may
  leave the laptop.

**Bad / accepted costs**
- A wrong in-store verdict is briefly possible if the spine / leaf separation is ever broken in the
  worker. The trunk is still protected by CI, but the studio could show a wrong "healthy" until
  corrected — so the separation (no DB and no signing key in the leaf) must be enforced and tested.
- Per-principal DB identity is replaced by app-layer authz; the trust boundary equals the circle set.
- Running the agent on shared infrastructure raises containment stakes (the worker runs
  agent-authored code); a minimal-privilege service account and locked egress are required.

**Neutral**
- Solo / laptop builds remain fully valid and are the simplest trust posture; this ADR adds a
  sanctioned hosted option, it does not retire the laptop path.

## References

- [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) — 443-only egress
  and the read-only bridge; amended (the laptop-only default is relaxed for the self-contained
  worker; the bridge stance stands).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate the worker runs;
  the source of verdict integrity.
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) — the independent second proof before the trunk.
- [ADR-0004](0004-orchestrator-agent-boundary.md) — the orchestrator/agent boundary; preserved (the
  worker is that boundary).
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — keyless Cloud SQL IAM; the
  per-principal identity traded for app-layer authz here.
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) — the architecture
  this decision unblocks.
