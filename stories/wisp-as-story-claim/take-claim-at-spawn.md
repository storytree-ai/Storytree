---
id: "take-claim-at-spawn"
tier: capability
story: wisp-as-story-claim
title: "Take the claim at spawn — the acquisition seam the orchestrator calls before spawning a subagent"
outcome: "A claim-acquisition seam the session-orchestrator calls BEFORE it spawns any subagent: acquire the story-claim with the work-kind intent, and on refusal surface the holder so the orchestrator waits or picks other work — the seam built and proven now; the actual spawn-path wiring deferred behind ADR-0137 Phase 3."
status: proposed
proof_mode: integration-test
depends_on: [claim-store-work-time]
decisions: [138, 137, 30, 142]
# Node-borne proof config (ADR-0057 keystone A). The provable delta is a PURE seam: a function the
# orchestrator calls before spawning that decides acquire-or-wait from a ClaimResult and, on refusal,
# surfaces the holder. NET-NEW, builtins-only — the leaf authors a net-new packages/agent/src/spawn-claim.ts
# whose seam consumes a ClaimResult (type-only import of @storytree/notice-board's ClaimResult is erased) and
# returns a proceed/wait decision naming the holder. The red is the missing module. NO `install`/`db`: the
# seam is a PURE decision over an injected ClaimResult (it does NOT itself open a pool — that is the deferred
# wiring), so the default node:test single-file proof runs it install-free. The ACTUAL wiring into the spawn
# path (acquire via PgClaimStore before headless-orchestrator.ts spawns; release/clear on completion) is a
# DEFERRED contract below, blocked on ADR-0137 Phase 3 (the orchestrator actually spawning) — UNBUILT — and
# does NOT block this seam.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/spawn-claim.test.ts"
    sourceFile: "packages/agent/src/spawn-claim.ts"
    scope:
      testGlobs: ["packages/agent/src/spawn-claim.test.ts"]
      sourceGlobs: ["packages/agent/src/spawn-claim.ts"]
---

# Take the claim at spawn — the acquisition seam

**Outcome —** A claim-acquisition **seam** the session-orchestrator (ADR-0137) calls **before** it spawns
any subagent: acquire the **story-claim** (intent = the work kind), and on refusal **surface the holder** so
the orchestrator waits or picks other work. The de-facto hard point is the spawn: **no claim, no subagent**
(ADR-0138 §3). The seam is **built and proven now**; the actual wiring into the spawn path is **deferred**
behind ADR-0137 Phase 3 (the orchestrator actually spawning), which is UNBUILT.

> **ADR-0142 (post-delivery):** the spawn wiring is no longer the only acquisition path — the work-time
> claim is now taken at **declare-time** (`noticeboard declare --node` claims; `done` releases; the
> statusline heartbeat bumps — the landed [`claim-at-declare`](claim-at-declare.md) capability). That
> wiring *neither replaces nor blocks* E2 (ADR-0142 leg 2): the spawn-path acquisition below stays a
> real, deferred follow-on for when the orchestrator actually spawns.

**Depends on —** [`claim-store-work-time`](claim-store-work-time.md) (A3's work-time `ClaimRequest` intent
builder; the seam acquires with `kind: "edit" | "orchestrate"`).

> **Proof status (honest) — `proposed`.** The provable piece is the PURE seam — a decision over a
> `ClaimResult` (acquired → proceed; refused → wait, naming the holder) — net-new and builtins-only. The
> ACTUAL spawn-path wiring (acquire before `headless-orchestrator.ts` spawns; release on completion) is a
> clearly-marked DEFERRED contract, blocked on ADR-0137 Phase 3, and does NOT block the seam.

## Guidance

ADR-0138 §3 makes the orchestrator hold a story-claim before it spawns a subagent — the **only** claim-free
action is authoring an ADR (its sole direct write, no story node). The provable unit NOW is the SEAM, not
the spawn wiring (which needs the orchestrator to actually spawn — ADR-0137 Phase 3, unbuilt).

**E1 — the pure acquire-or-wait seam (net-new, `packages/agent/src/spawn-claim.ts`).** A function that, given
a `ClaimResult` from `@storytree/notice-board` (`{ acquired: true, claim, reclaimed }` |
`{ acquired: false, heldBy }`), returns the orchestrator's pre-spawn decision: **proceed** when acquired, or
**wait** when refused — and on refusal SURFACE the holder (`heldBy.sessionId` / `heldBy.branch` /
`heldBy.intent`) so the orchestrator can name who has the story and wait for its merge / pick other work. The
type-only import of `ClaimResult` is erased, so the module stays builtins-only and offline-buildable. Keep it
PURE: a `ClaimResult` in, a `{ proceed: true } | { proceed: false; heldBy: … }` decision out; no store, no
clock, no spawn. This is the testable decision boundary; the live SPAWN-path acquire happens in the
deferred wiring (the live session-grain acquire landed at declare-time — ADR-0142,
[`claim-at-declare`](claim-at-declare.md)).

**E2 (DEFERRED — blocked on ADR-0137 Phase 3, do NOT build now).** The actual wiring: before
`packages/agent/src/headless-orchestrator.ts` spawns a subagent, call `PgClaimStore.claim()` with the
work-time `ClaimRequest` (A3) for the story id; feed the `ClaimResult` to the E1 seam; spawn only on
`proceed`, else wait / surface the holder; and release / let CI clear (capability D) on completion. The
`onMessage` trace seam (`headless-orchestrator.ts:73`) feeds A2's heartbeat bump so the claim never ages out
mid-orchestration. This wiring depends on the orchestrator **actually spawning** (ADR-0137 Phase 3, which is
UNBUILT, ADR-0108 Phase 3 drive-authority), so it is captured here as a deferred follow-on, NOT a blocker on
the E1 seam. When Phase 3 lands, this becomes a real contract (likely its own capability). Until then the
session-grain acquisition runs at declare-time (ADR-0142, [`claim-at-declare`](claim-at-declare.md)) —
which neither replaces nor blocks this wiring.

Do NOT touch files outside your write scope. Keep the proved unit a pure seam so the default node:test
single-file proof runs it install-free.

## Integration test

**Goal —** Run the real acquire-or-wait seam (no stubs) over both `ClaimResult` arms — acquired and refused
— proving it returns *proceed* for an acquired claim and *wait* (surfacing the live holder's identity) for a
refused one, so the orchestrator has a tested pre-spawn decision boundary. The deferred wiring (E2) is not
exercised here (it is blocked on ADR-0137 Phase 3).

Exercised against its **real collaborator** — the pure seam itself over the real `ClaimResult` shape
(ADR-0010 §5): a result in, a decision out, no store. The live `PgClaimStore.claim()` call is the deferred
wiring, witnessed when Phase 3 lands, not here.

## Contracts (2)

The test-proven leaf behaviour, plus the explicitly-deferred wiring.

1. **`spawn-seam-proceeds-on-acquire-and-waits-on-refusal`** — the pre-spawn seam returns *proceed* for an
   acquired claim and *wait* (naming the holder) for a refused one.
   - **asserts —** given `{ acquired: true, claim, reclaimed: false }` the seam returns a proceed decision;
     given `{ acquired: false, heldBy }` it returns a wait decision carrying the holder's
     `sessionId` / `branch` / `intent` so the orchestrator can surface who holds the story and wait / pick
     other work (ADR-0138 §2/§3). Pure — no store, no clock, no spawn.
   - **covers —** `packages/agent/src/spawn-claim.ts`
   - **proven by —** `packages/agent/src/spawn-claim.test.ts` (net-new, offline, authored by the leaf).
2. **`orchestrator-acquires-before-spawn`** _(DEFERRED — blocked on ADR-0137 Phase 3, UNBUILT)_ — the
   orchestrator acquires the story-claim (via `PgClaimStore.claim()` with the work-time intent) and spawns a
   subagent ONLY on proceed, releasing / letting CI clear on completion.
   - **asserts —** before `headless-orchestrator.ts` spawns, it claims the story id and spawns iff the E1
     seam says proceed; on refusal it waits / surfaces the holder; the `onMessage` trace bumps the heartbeat
     (A2) so the claim never ages out mid-orchestration.
   - **covers —** `packages/agent/src/headless-orchestrator.ts`
   - **DEFERRED / blocked —** this requires the orchestrator to ACTUALLY spawn subagents (ADR-0137 Phase 3 /
     ADR-0108 Phase 3 drive-authority), which is NOT yet built. It is recorded here so the seam (contract 1)
     has a named home to wire into, but it does NOT block contract 1 and must NOT be driven `--real` until
     Phase 3 lands. At that point it likely graduates into its own capability.
