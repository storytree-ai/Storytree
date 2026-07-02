---
id: "take-claim-at-spawn"
tier: capability
story: wisp-as-story-claim
title: "Take the claim at spawn — the acquisition seam the orchestrator calls before spawning a subagent"
outcome: "A claim-acquisition seam the session-orchestrator calls BEFORE it spawns any subagent: acquire the story-claim with the work-kind intent, and on refusal surface the holder so the orchestrator waits or picks other work — the seam built and proven; the spawn-path GATE since graduated and landed as chat-subagent-spawn's claim-gated-spawn, with only the runtime mount (that story's spawn-tool-surface / spawn-deps-composition caps) still deferred."
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
# wiring), so the default node:test single-file proof runs it install-free. The wiring into the spawn path
# was a DEFERRED contract below, blocked on ADR-0137 Phase 3; its GATE half has since GRADUATED and LANDED
# as chat-subagent-spawn's claim-gated-spawn (packages/agent/src/claim-gated-spawn.ts, signed --real PASS) —
# only the runtime mount (headless-orchestrator.ts wiring; that story's spawn-tool-surface /
# spawn-deps-composition caps) remains unbuilt. Neither ever blocked this seam.
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
(ADR-0138 §3). The seam is **built and proven** — and the spawn-path GATE has since landed too: the
deferred wiring's gate half **graduated into its own capability**,
[`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md)
(`packages/agent/src/claim-gated-spawn.ts`, green under a signed `--real` PASS: acquire-before-spawn,
holder-naming refusal, trace→heartbeat bump, fail-closed blank-id wall). What remains **deferred** is only
the runtime MOUNT — `headless-orchestrator.ts` actually calling the gate before a spawn
(chat-subagent-spawn's unbuilt `spawn-tool-surface` / `spawn-deps-composition` caps).

> **ADR-0142 (post-delivery):** the spawn wiring is no longer the only acquisition path — the work-time
> claim is now taken at **declare-time** (`noticeboard declare --node` claims; `done` releases; the
> statusline heartbeat bumps — the landed [`claim-at-declare`](claim-at-declare.md) capability). That
> wiring *neither replaces nor blocks* E2 (ADR-0142 leg 2): the spawn-path acquisition's GATE has since
> landed (chat-subagent-spawn's `claim-gated-spawn`) and the two acquisition paths coexist by design.

**Depends on —** [`claim-store-work-time`](claim-store-work-time.md) (A3's work-time `ClaimRequest` intent
builder; the seam acquires with `kind: "edit" | "orchestrate"`).

> **Proof status (honest) — `proposed`.** The provable piece is the PURE seam — a decision over a
> `ClaimResult` (acquired → proceed; refused → wait, naming the holder) — net-new and builtins-only. The
> spawn-path wiring was a clearly-marked DEFERRED contract blocked on ADR-0137 Phase 3; its GATE half is
> now REALISED by chat-subagent-spawn's [`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md)
> (green under a signed verdict) — only the runtime mount remains deferred. Neither ever blocked the seam.

## Guidance

ADR-0138 §3 makes the orchestrator hold a story-claim before it spawns a subagent — the **only** claim-free
action is authoring an ADR (its sole direct write, no story node). The provable unit HERE is the SEAM, not
the spawn wiring (whose gate half has since been built in chat-subagent-spawn's `claim-gated-spawn`; the
runtime mount that actually spawns is still unbuilt).

**E1 — the pure acquire-or-wait seam (net-new, `packages/agent/src/spawn-claim.ts`).** A function that, given
a `ClaimResult` from `@storytree/notice-board` (`{ acquired: true, claim, reclaimed }` |
`{ acquired: false, heldBy }`), returns the orchestrator's pre-spawn decision: **proceed** when acquired, or
**wait** when refused — and on refusal SURFACE the holder (`heldBy.sessionId` / `heldBy.branch` /
`heldBy.intent`) so the orchestrator can name who has the story and wait for its merge / pick other work. The
type-only import of `ClaimResult` is erased, so the module stays builtins-only and offline-buildable. Keep it
PURE: a `ClaimResult` in, a `{ proceed: true } | { proceed: false; heldBy: … }` decision out; no store, no
clock, no spawn. This is the testable decision boundary; the live SPAWN-path acquire happens in the
graduated gate (chat-subagent-spawn's `claim-gated-spawn`) once its runtime mount lands (the live
session-grain acquire landed at declare-time — ADR-0142, [`claim-at-declare`](claim-at-declare.md)).

**E2 (GRADUATED — the gate half landed; only the runtime mount remains deferred).** The wiring: before
`packages/agent/src/headless-orchestrator.ts` spawns a subagent, call `PgClaimStore.claim()` with the
work-time `ClaimRequest` (A3) for the story id; feed the `ClaimResult` to the E1 seam; spawn only on
`proceed`, else wait / surface the holder; and release / let CI clear (capability D) on completion. The
`onMessage` trace seam (`headless-orchestrator.ts:73`) feeds A2's heartbeat bump so the claim never ages out
mid-orchestration. This was captured as a deferred follow-on blocked on ADR-0137 Phase 3, forecast to
"become a real contract (likely its own capability)" when Phase 3 landed — **that graduation has happened**:
chat-subagent-spawn's [`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md)
(`packages/agent/src/claim-gated-spawn.ts`) IS that capability, green under a signed `--real` PASS
(claim acquired via the injected store BEFORE the spawn fn runs, refusal names the holder verbatim, trace
signals bump the heartbeat, blank story id fails closed). What is NOT yet built is the runtime MOUNT — the
`headless-orchestrator.ts` wiring that calls the gate before a live spawn (that story's `spawn-tool-surface`
/ `spawn-deps-composition` caps). The session-grain acquisition also runs at declare-time (ADR-0142,
[`claim-at-declare`](claim-at-declare.md)) — the two paths coexist by design.

Do NOT touch files outside your write scope. Keep the proved unit a pure seam so the default node:test
single-file proof runs it install-free.

## Integration test

**Goal —** Run the real acquire-or-wait seam (no stubs) over both `ClaimResult` arms — acquired and refused
— proving it returns *proceed* for an acquired claim and *wait* (surfacing the live holder's identity) for a
refused one, so the orchestrator has a tested pre-spawn decision boundary. The E2 wiring is not exercised
here — its gate half is proven in chat-subagent-spawn's `claim-gated-spawn`, in that capability's own
proof file.

Exercised against its **real collaborator** — the pure seam itself over the real `ClaimResult` shape
(ADR-0010 §5): a result in, a decision out, no store. The live `PgClaimStore.claim()` call at spawn is the
runtime mount's job (chat-subagent-spawn's unbuilt composition caps), not here.

## Contracts (2)

The test-proven leaf behaviour, plus the wiring contract that has since graduated cross-story.

1. **`spawn-seam-proceeds-on-acquire-and-waits-on-refusal`** — the pre-spawn seam returns *proceed* for an
   acquired claim and *wait* (naming the holder) for a refused one.
   - **asserts —** given `{ acquired: true, claim, reclaimed: false }` the seam returns a proceed decision;
     given `{ acquired: false, heldBy }` it returns a wait decision carrying the holder's
     `sessionId` / `branch` / `intent` so the orchestrator can surface who holds the story and wait / pick
     other work (ADR-0138 §2/§3). Pure — no store, no clock, no spawn.
   - **covers —** `packages/agent/src/spawn-claim.ts`
   - **proven by —** `packages/agent/src/spawn-claim.test.ts` (net-new, offline, authored by the leaf).
2. **`orchestrator-acquires-before-spawn`** _(GRADUATED — realised by chat-subagent-spawn's
   `claim-gated-spawn`; only the runtime mount remains)_ — the orchestrator acquires the story-claim (via
   `PgClaimStore.claim()` with the work-time intent) and spawns a subagent ONLY on proceed, releasing /
   letting CI clear on completion.
   - **asserts —** before `headless-orchestrator.ts` spawns, it claims the story id and spawns iff the E1
     seam says proceed; on refusal it waits / surfaces the holder; the `onMessage` trace bumps the heartbeat
     (A2) so the claim never ages out mid-orchestration.
   - **covers —** `packages/agent/src/headless-orchestrator.ts`
   - **GRADUATED —** the forecast happened: ADR-0137 flipped accepted 2026-07-02 and this contract's gate
     half graduated into its own capability —
     [`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md)
     (`packages/agent/src/claim-gated-spawn.ts`, 4/4 contracts green under a signed `--real` PASS): the
     claim is acquired via the injected store BEFORE the spawn fn runs, a refusal names the holder
     verbatim, trace signals bump the heartbeat, and a blank story id is a fail-closed refusal. What is NOT
     yet built is the runtime mount — `headless-orchestrator.ts` actually calling the gate before a live
     spawn (chat-subagent-spawn's unbuilt `spawn-tool-surface` / `spawn-deps-composition` caps). This
     contract stays recorded here as the named cross-story home; it has no test in THIS capability's
     `proof.real.testFile`, so it remains on `check:coverage`'s advisory uncovered list permanently
     (expected, WARN-only) and is never driven `--real` from here.
