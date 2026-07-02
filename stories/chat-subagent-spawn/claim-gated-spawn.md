---
id: "claim-gated-spawn"
tier: capability
story: chat-subagent-spawn
title: "The claim-at-spawn gate — no claim, no subagent; a refusal names the holder; the trace bumps the heartbeat"
outcome: "Every spawn is claim-gated: the story-claim is acquired (work-kind intent stamped) BEFORE the spawn function runs, a refusal names the holder and spawns nothing, and the loop's trace signals bump the claim heartbeat so a live spawn never ages out — realising wisp-as-story-claim's deferred E2 contract."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [138, 137, 121, 142]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors an
# integration test importing a NOT-YET-EXISTING gate from a NEW module in packages/agent (red =
# module-not-found at HEAD), then writes that one new source file (green). The gate composes two
# ALREADY-BUILT seams it does not own: the E1 acquire-or-wait decision (resolveSpawnClaim,
# packages/agent/src/spawn-claim.ts — same package, runtime import) and the work-time claim request
# (workClaimRequest, @storytree/notice-board — a workspace dep this capability ADDED to
# packages/agent; the story's declared notice-board edge made physical). The claim STORE is injected
# (a structural { claim, bumpHeartbeat } shape mirroring PgClaimStore), so the proof runs offline
# over a recording fake — the pg half is wisp-as-story-claim's own proven ground, never re-proven
# here. The RED is a runtime module-not-found; ordering/refusal/heartbeat are runtime behaviours
# (never a type-only red). `install: true` + a typecheck wall because the module value-imports
# @storytree/notice-board (the story-author-spawn precedent — a bare no-install worktree cannot
# resolve a package import). Scope stays within packages/agent (ADR-0087). Single LITERAL source
# file — default node:test proof, no proofCommand.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/claim-gated-spawn.test.ts"
    sourceFile: "packages/agent/src/claim-gated-spawn.ts"
    scope:
      testGlobs: ["packages/agent/src/claim-gated-spawn.test.ts"]
      sourceGlobs: ["packages/agent/src/claim-gated-spawn.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# The claim-at-spawn gate — no claim, no subagent

**Outcome —** Every spawn is claim-gated: the story-claim is acquired (work-kind intent stamped)
BEFORE the spawn function runs, a refusal names the holder and spawns nothing, and the loop's trace
signals bump the claim heartbeat so a live spawn never ages out — realising wisp-as-story-claim's
deferred E2 contract.

**Depends on —** nothing in-story (a root). Cross-story it consumes `wisp-as-story-claim`'s built
seams — the E1 acquire-or-wait decision (`resolveSpawnClaim`, `packages/agent/src/spawn-claim.ts`)
and the work-time claim-store deltas (`PgClaimStore.claim()` / `bumpHeartbeat`, injected) — and
`notice-board`'s claim primitive (`workClaimRequest` / `ClaimResult`,
`packages/notice-board/src/claim.ts`).

> **Proof status (honest) — `proposed`. This capability is the GRADUATION the corpus forecast.**
> `stories/wisp-as-story-claim/take-claim-at-spawn.md` built the E1 seam and recorded its second
> contract (`orchestrator-acquires-before-spawn`) as DEFERRED — "blocked on ADR-0137 Phase 3 …
> when Phase 3 lands, this becomes a real contract (likely its own capability)." ADR-0137 flipped
> accepted 2026-07-02; this is that capability. The E1 seam itself is NOT re-proven or re-implemented
> here — it is consumed (edit-first: the seam exists, this wires it into the spawn path).

## Guidance

THE HARD POINT IS THE SPAWN (ADR-0138 §3): the wisp-claim design deliberately chose guidance + the
spawn choke point over a runtime session-start wall — "every work path except ADR-authoring runs
through a spawn." This gate IS that choke point made mechanical: a single wrapper every spawn tool
handler passes through — build the work-time `ClaimRequest` (`workClaimRequest`, intent stamped from
the work kind so the wisp's colour layer can read the role, ADR-0138 §5), call the injected claim
store's `claim()`, feed the `ClaimResult` to the E1 seam (`resolveSpawnClaim`), and run the spawn
function ONLY on `proceed`. There is NO bypass arm: the gate's API offers no claim-free spawn path,
and a blank/absent story id is a fail-closed typed refusal (ADR-authoring — the sole claim-free act —
is not a spawn and never routes through this gate; it simply has no story node to claim).

A REFUSAL IS A WAIT, NEVER AN ERROR (ADR-0138 §2 / ADR-0009): a held story hard-refuses the second
claimant and NAMES the holder (`sessionId` / `branch` / `intent`) so the orchestrator can tell the
user who has it and wait for the holder's merge / pick other work. The refusal must carry the holder
verbatim from the E1 decision — never swallowed into a generic failure.

THE TRACE BUMPS THE HEARTBEAT (ADR-0138 §4 — the load-bearing follow-on `claim.ts` named): a live
session's claim must NEVER age into the 2 h stale-reclaim while a spawn is running. The gate exposes a
trace hook the runtime's `onMessage` seam feeds (`headless-orchestrator.ts:73` — the SDK turn /
tool-call events we already emit); each signal bumps the claim heartbeat through the injected store
(`bumpHeartbeat`). A dead session stops emitting and ages out TRUTHFULLY — no self-reported ping, no
zombie.

NO RELEASE-ON-COMPLETION (deliberate): the claim outlives one spawn — the story work continues in the
same conversation (author, then drive, then supplement). Release is OWNED elsewhere: the CI merge
clears by branch (wisp-as-story-claim's `ci-clear-on-merge`), `noticeboard done` bulk-releases
(ADR-0142), and trace-staleness is the backstop. Releasing here would drop the coordination signal
between spawns — the exact gap ADR-0138 closed.

THE STORE IS INJECTED, THE DECISION IS REAL: the pg claim store's atomicity is
wisp-as-story-claim's proven ground (`claim-store-work-time`); this proof injects a recording
structural store and exercises the REAL E1 seam over the REAL `ClaimResult` shape — no stub of an
in-story collaborator, no re-proof of the DB.

## Integration test

**Goal —** Prove the gate acquires before it spawns, refuses by naming the holder without spawning,
bumps the heartbeat off trace signals, and fails closed on a blank story id — offline, over an
injected recording store and the real E1 seam.

The integration test would:

1. Acquired arm: injected store grants the claim → assert the store's `claim()` was called with the
   work-time request (intent = the work kind) STRICTLY BEFORE the recording spawn fn ran, and the
   spawn fn ran exactly once.
2. Refused arm: injected store returns `{ acquired: false, heldBy }` → assert a typed wait decision
   carrying the holder's `sessionId`/`branch`/`intent`, and the spawn fn was NEVER invoked.
3. Feed trace signals during a running spawn → assert each bumped the heartbeat through the store.
4. Call with a blank story id → assert a fail-closed typed refusal; no claim call, no spawn.

## Contracts (4)

1. **`cgs-claim-precedes-every-spawn`** — the claim is acquired before the spawn function runs
   - **asserts —** the injected store's `claim()` is invoked with the work-time `ClaimRequest`
     (built via `workClaimRequest`, the work kind stamped as `intent`) and the spawn fn runs only
     AFTER an acquired result — the recorded call order proves claim-then-spawn, and the E1 seam
     (`resolveSpawnClaim`) is the decision boundary (consumed, not re-implemented).
   - **covers —** `packages/agent/src/claim-gated-spawn.ts`
   - **proven by —** `packages/agent/src/claim-gated-spawn.test.ts` (net-new, offline, recording
     store).
2. **`cgs-refusal-surfaces-the-holder-and-spawns-nothing`** — a held story is a wait that names the
   holder
   - **asserts —** on `{ acquired: false, heldBy }` the gate returns a typed wait decision carrying
     the holder's `sessionId` / `branch` / `intent` verbatim (so the orchestrator can say who has the
     story and wait / pick other work, ADR-0138 §2), and the spawn fn is NEVER invoked — no subagent
     exists without the claim (§3).
   - **covers —** `packages/agent/src/claim-gated-spawn.ts` (the refusal arm)
   - **proven by —** `packages/agent/src/claim-gated-spawn.test.ts`.
3. **`cgs-trace-bumps-the-heartbeat`** — a live spawn never ages into stale-reclaim
   - **asserts —** trace signals fed to the gate's hook during a running spawn each bump the claim's
     heartbeat through the injected store (`bumpHeartbeat`), so a live session's claim never crosses
     `CLAIM_STALE_RECLAIM_MS` while work is actually happening — and a session that stops emitting
     stops bumping (ages out truthfully, ADR-0138 §4).
   - **covers —** `packages/agent/src/claim-gated-spawn.ts` (the trace→heartbeat wiring)
   - **proven by —** `packages/agent/src/claim-gated-spawn.test.ts`.
4. **`cgs-no-claim-free-spawn-path`** — the gate exposes no bypass
   - **asserts —** a blank/absent story id is a fail-closed typed refusal (no claim call, no spawn) —
     the gate's API carries no flag, arm, or default through which a spawn can run unclaimed.
     (ADR-authoring, the sole claim-free act, has no story node and never routes through this gate —
     honoured by construction, not by a bypass.)
   - **covers —** `packages/agent/src/claim-gated-spawn.ts` (the fail-closed input wall)
   - **proven by —** `packages/agent/src/claim-gated-spawn.test.ts`.
