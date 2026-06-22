---
status: accepted
decided: 2026-06-22
amends: [42]
load_bearing: true
---
# ADR-0090: UI-driven orchestration: hosted build-capable backend, thin clients, source server-side

## Status

accepted — owner-decided 2026-06-22 in session with the orchestrator. The owner wants to move agent
orchestration off the Claude Code desktop terminal and into the studio UI, reachable by a trusted
circle now and the public eventually. The architecture SHAPE is decided here; the build is phased,
with the cloud and integrity decisions deferred to the hosting phase (ADR-0091 sanctions the
proof-bearing worker; the exact Phase-3 auth/cost wiring is settled when built). The orchestration
surface's APPEARANCE is operator-attested under ADR-0070's two-stage proof when built.

## Context

Today orchestration is a human at a terminal: `pnpm storytree node build <id> --live` /
`story build <id> --real`. The human is the outer loop (ADR-0030); the deterministic spine
(`packages/orchestrator`) drives the prove-it-gate; the SDK leaf (`packages/agent`,
`sdk-author.ts`) authors inside each phase. The studio (ADR-0042) is a read-and-light-write surface
and explicitly puts the live builds, the CLI, and the agent runtime OUT of scope for the circle.

The owner wants to drive builds from the UI, from any machine, for a trusted circle (working the one
shared storytree forest) — and the public eventually. Two findings shaped the decision:

- **The repo is private.** An app that bundles the build engine and source SHIPS the source — an
  Electron `.asar` is trivially unpacked, so packaging is not source protection. A client that
  carries the source is therefore unacceptable the moment it is distributed.
- **A build needs the agent, the source, and a model credential co-located.** You cannot keep the
  source server-side AND run the agent on the client. So the agent runs where the source is: on a
  server-side worker.

ADR-0089 established the network reality (443-only remote sessions cannot reach the DB data plane)
and, as a guard, that proof-bearing work has stayed laptop-tethered. ADR-0008 ("UI drives agents —
approval-gated trunk") already named this direction but left the studio-drives-agents surface and the
approval gate unbuilt.

## Decision

1. **Client–server split.** Orchestration moves into the UI as a THIN client plus a build-capable
   WORKER. The client is the studio frontend (browser now; an optional native wrapper later) and
   carries no source — it receives only the compiled frontend bundle. The worker holds the source,
   the checkout, git, and the inner loop (orchestrator + agent) and runs builds. This fulfils
   ADR-0008.
2. **The UI never imports the agent.** A build is requested as an INTENT (a safe write) over the
   gated API; the worker is the single orchestrator boundary that drives the model. ADR-0004
   preserved.
3. **Bring-your-own credential.** Credentials are client-held, passed per build over TLS, and never
   persisted server-side. The worker is credential-agnostic: the Claude Agent SDK authenticates via
   either `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or `ANTHROPIC_API_KEY` (API key). Guidance: a
   solo / own worker may use the operator's subscription token (the same posture as today, just
   possibly a different box); a SHARED circle worker takes each member's own API key (scoped,
   revocable, billing-capped, intended for delegation).
4. **Source stays server-side in every phase.** No client ever receives the monorepo, the agent, or
   the stories — only the compiled UI. This resolves the private-source concern by construction.
5. **Phased build (slow growth):**
   - **Phase 1 — local loop:** worker + a Build button + a live transcript panel, on the operator's
     own machine. Proves the mechanics at flat subscription cost; no ADR change (local, tethered).
   - **Phase 2 — approve-to-land:** the human approves landing from the UI (ADR-0008's gate); green
     work opens a PR and CI auto-merges. The human still owns accept-to-land.
   - **Phase 3 — host for the circle:** the same worker, hosted (single-tenant — one shared
     storytree forest — IAP-gated). This is where ADR-0091's proof-off-tether sanction, the BYO
     API-key path, and the amendment to ADR-0042 land.
   - **Phase 4 — public (distant):** multi-tenant isolation — the expensive part, deferred to its
     own ADRs and deliberately out of scope here.
6. **Amends ADR-0042.** The hosted studio backend MAY run the agent, gated to the circle. The thin
   client, members, and IAP model stand; the "live builds / CLI / agent runtime out of scope for the
   circle" scope is relaxed to allow build-triggering through the gated worker.

## Consequences

**Good**
- Drive builds from any machine you can sign in on; nothing private is bundled or distributed.
- The thin client is mostly what already exists (the served studio frontend), so the work is the
  backend worker plus the orchestration surface — not a new client.
- BYO-credential means members fund their own usage and no long-lived owner key sits in the cloud.
- ADR-0004 and ADR-0030 hold: the worker is the single model boundary, and the human still owns
  accept-to-land.

**Bad / accepted costs**
- A hosted worker that runs the agent is new surface: the cloud auth/cost model (settled in Phase 3),
  the proof-off-tether re-decision (ADR-0091), and operating an internet-reachable build backend
  whose trust boundary equals the trusted-operator / circle set.
- The worker machine must stay on, and the source lives on it.
- Public use (Phase 4) needs multi-tenant isolation, which is not assumed here.

**Neutral**
- Electron drops from "the plan" to an optional native wrapper of the thin client later; the browser
  is the thin client for the circle.

## References

- [ADR-0008](0008-ui-drives-agents-approvals.md) — UI drives agents; the decision this fulfils.
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — hosted studio (Cloud Run + IAP); amended: the
  backend may run the agent, gated to the circle.
- [ADR-0004](0004-orchestrator-agent-boundary.md) — the orchestrator/agent boundary; preserved
  (the worker is that boundary; the client never imports the agent).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — human owns the outer loop; preserved
  (accept-to-land stays human, Phase 2).
- [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — the
  proof-off-tether sanction that makes the hosted worker legitimate.
- [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) — the network and
  trust context; the read-only bridge stance stands.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the orchestration
  surface's appearance is operator-attested.
