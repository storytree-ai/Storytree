---
id: "take-claim-at-spawn"
tier: capability
story: wisp-as-story-claim
title: "Take the claim at spawn — the acquisition seam the orchestrator calls before spawning a subagent"
outcome: "A claim-acquisition seam the session-orchestrator calls BEFORE it spawns any subagent: acquire the story-claim with the work-kind intent, and on refusal surface the holder so the orchestrator waits or picks other work — the pure seam built, proven under a signed --real PASS, and deliberately KEPT by ADR-0175. The spawn-path GATE graduated cross-story, landed as chat-subagent-spawn's claim-gated-spawn, was mounted on the runtime, and was then RETIRED WITH THAT WHOLE STORY by ADR-0175 (sources deleted 2026-07-31) — so no live spawn path is claim-gated today; live acquisition runs at workspace creation (ADR-0200 D3) and at declare-time (claim-at-declare)."
status: proposed
proof_mode: integration-test
depends_on: [claim-store-work-time]
decisions: [138, 137, 30, 142, 175]
# Node-borne proof config (ADR-0057 keystone A). The provable delta is a PURE seam: a function the caller
# invokes before spawning that decides acquire-or-wait from a ClaimResult and, on refusal, surfaces the
# holder. It was authored NET-NEW and builtins-only as packages/agent/src/spawn-claim.ts, consuming a
# ClaimResult (the type-only import of @storytree/notice-board's ClaimResult is erased) and returning a
# proceed/wait decision naming the holder. NO `install`/`db`: the seam is a PURE decision over an injected
# ClaimResult (it does NOT itself open a pool — that was the deferred wiring), so the default node:test
# single-file proof runs it install-free.
# STATE AT HEAD, verified at FILE level rather than from prose: the seam LANDED —
# packages/agent/src/spawn-claim.ts (`resolveSpawnClaim`) and packages/agent/src/spawn-claim.test.ts both
# exist, authored by the gated leaf under a signed --real PASS, and ADR-0175 names this file among the two
# it deliberately KEEPS ("belongs to the LIVE wisp-as-story-claim story this ADR does not retire"). So the
# arm's original red — the missing module — is spent, and a fresh --real drive here would manufacture a red
# over green code. The arm is retained only because packages/cli/src/node-build.test.ts pins this node id in
# its REAL-buildable snapshot; dropping it is a packages/** change outside a stories/**-only pass, and
# whether it SHOULD be dropped is open modeling call 6 on the story — surfaced, not settled.
# The wiring into the spawn path was a DEFERRED contract below (contract 2) blocked on ADR-0137 Phase 3; it
# then GRADUATED and LANDED cross-story as chat-subagent-spawn's claim-gated-spawn, was mounted on the
# runtime, and was RETIRED WITH THAT WHOLE STORY by ADR-0175 (execution status: "SPAWN — DONE
# (2026-07-31)") — those sources are DELETED and held gone by
# apps/desktop/src/backend/spawn-surface-retired.test.ts. Neither the graduation nor the retirement ever
# blocked this seam.
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
the orchestrator waits or picks other work. ADR-0138 §3 intended the spawn as the de-facto hard point
(*no claim, no subagent*) — an intent the tree no longer realises, for the reason set out immediately
below. The seam itself is **built and proven** — `packages/agent/src/spawn-claim.ts`
(`resolveSpawnClaim`) and its spec are at HEAD, authored by the gated leaf under a signed `--real` PASS,
and ADR-0175
deliberately **KEEPS** that file, naming it as belonging to this live story.

**The spawn-path half was realised and has since been RETIRED — read this before citing it.** E2's gate
graduated into chat-subagent-spawn's [`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md)
and was mounted on the runtime by that story's `spawn-tool-surface` / `spawn-deps-composition`; all three
went green under signed `--real` PASSes, and all three then retired with the whole
[`chat-subagent-spawn`](../chat-subagent-spawn/story.md) story under **ADR-0175** (its execution status
reads *SPAWN — DONE (2026-07-31)*): `packages/agent/src/{spawn-tool-surface,claim-gated-spawn}.ts`,
`packages/drive/src/{spawn-deps,spawn-builder,spawn-trace}.ts` and
`apps/desktop/src/backend/spawn-turns.ts` are **deleted**, the `spawn?` thread through
`headless-orchestrator` → `orchestrate` → `chat-stream` → `chat-sse-mount` is unpicked, and the sidecar
composition is gone — held gone by `apps/desktop/src/backend/spawn-surface-retired.test.ts`. That story
and all five of its capabilities are `status: retired`; their spec files stay browsable as history, so
**every cross-story link from here points at retired work whose code no longer exists** and is labelled
as such at each mention. Consequently **no live spawn path is claim-gated today**: live acquisition runs
at **workspace creation** (the `exploring` claim, ADR-0200 D3) and at **declare-time**
([`claim-at-declare`](claim-at-declare.md), ADR-0142).

> **ADR-0142 (post-delivery):** as of that ADR the spawn wiring was no longer the only acquisition path —
> the work-time claim is taken at **declare-time** (`noticeboard declare --node` claims; `done` releases; the
> statusline heartbeat bumps — the landed [`claim-at-declare`](claim-at-declare.md) capability). That
> wiring *neither replaced nor blocked* E2 (ADR-0142 leg 2). What changed since is on E2's side, not this
> one: the spawn-path acquisition landed and was then retired with its host story (ADR-0175), so
> declare-time acquisition is no longer one of two coexisting paths — together with ADR-0200's
> workspace-creation claim it is the whole live acquisition surface.

**Depends on —** [`claim-store-work-time`](claim-store-work-time.md) (A3's work-time `ClaimRequest` intent
builder; the seam acquires with `kind: "edit" | "orchestrate"`).

> **ADR-0200 note (grades + forced-at-workspace-creation).** ADR-0200 added the acquisition point this
> seam foresaw: a session is **forced onto the ledger at `worktree create`** (the `exploring` claim,
> ADR-0200 D3 — no claim, no workspace), and the `work` claim is taken when it upgrades (declare). This
> pre-spawn acquire-or-wait seam is unchanged and still correct **as a decision function** — on a refused
> `work` claim the caller waits or **queues** (the `waiting` grade, atomically promoted on release) rather
> than hard-failing. What it no longer has is a live spawn-path CALLER: that gate retired with
> chat-subagent-spawn under ADR-0175, so workspace-creation and declare-time are the acquisition points
> standing in the tree today.

> **Proof status (honest) — `proposed`, and that status is deliberate.** The provable piece is the PURE
> seam — a decision over a `ClaimResult` (acquired → proceed; refused → wait, naming the holder). It has
> LANDED (`packages/agent/src/spawn-claim.ts` + `packages/agent/src/spawn-claim.test.ts` at HEAD, authored
> under a signed `--real` PASS), so the arm's original net-new red is spent. `healthy` is nonetheless never
> authored here — it is the fold's verdict (ADR-0020), and an agent granting it would be self-exempting a
> unit toward green. `retired` would be equally wrong: ADR-0175 KEEPS `spawn-claim.ts` **precisely because
> it belongs to this live story**, so retiring the capability would orphan a deliberately-kept source file
> and contradict the ADR. The spawn-path wiring (contract 2) was a clearly-marked DEFERRED contract blocked
> on ADR-0137 Phase 3; it was realised cross-story and then retired with that story (ADR-0175). Neither
> ever blocked the seam. Whether the capability should now narrow to contract 1 alone and drop its spent
> `real:` arm is **open modeling call 6** on the story — surfaced there, not settled here.

## Guidance

ADR-0138 §3 makes the orchestrator hold a story-claim before it spawns a subagent — the **only** claim-free
action is authoring an ADR (its sole direct write, no story node). The provable unit HERE is the SEAM, never
the spawn wiring — that was built cross-story in chat-subagent-spawn (the gate in `claim-gated-spawn`, the
runtime mount in `spawn-tool-surface` / `spawn-deps-composition`, all green under signed `--real` PASSes)
and then retired with that story under ADR-0175, its sources deleted.

**E1 — the pure acquire-or-wait seam (`packages/agent/src/spawn-claim.ts`, LANDED and KEPT).** A function
that, given a `ClaimResult` (`{ acquired: true, claim, reclaimed }` | `{ acquired: false, heldBy }`),
returns the caller's pre-spawn decision: **proceed** when acquired, or
**wait** when refused — and on refusal SURFACE the holder (`heldBy.sessionId` / `heldBy.branch` /
`heldBy.intent`) so the caller can name who has the story and wait for its merge / pick other work. **How
it was actually built (verified in the landed file, not forecast):** it does not import
`@storytree/notice-board` at all — not even type-only. `spawn-claim.ts` DECLARES its own `ClaimHolder` /
`ClaimResult` / `SpawnDecision` shapes, mirroring the notice-board doc shapes, so callers importing only
types pay no runtime cost; the module therefore stays builtins-only and offline-buildable. It is
PURE — a `ClaimResult` in, a `{ proceed: true } | { proceed: false; heldBy: … }` decision out; no store, no
clock, no spawn — and must stay that way. This is the testable decision boundary, and it is the half of this
capability that SURVIVES: ADR-0175 keeps `spawn-claim.ts` by name. The live SPAWN-path acquire that once
consumed it is gone with `claim-gated-spawn`; the live acquire runs at workspace creation (ADR-0200 D3) and
at declare-time (ADR-0142, [`claim-at-declare`](claim-at-declare.md)).

**E2 (GRADUATED, REALISED, THEN RETIRED — describes no live behaviour; do not build from it).** This slot
once carried a step-by-step recipe for claim-gating the in-app orchestrator's spawn path. That recipe is
deliberately **not restated**, because nothing in the tree implements it and a concrete description here
would read to a building leaf as work (`a-spec-body-describes-only-what-it-contracts`). The history, in
short: the deferred follow-on blocked on ADR-0137 Phase 3 graduated into chat-subagent-spawn's
[`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md) — *now `status: retired`* — and was
mounted by that story's `spawn-tool-surface` / `spawn-deps-composition`, all green under signed `--real`
PASSes; ADR-0175 then retired the entire spawn surface as unreachable (neither the spawn nor the landing
surface had a reachable caller), and its sources are deleted, held gone by
`apps/desktop/src/backend/spawn-surface-retired.test.ts`. `packages/agent/src/headless-orchestrator.ts`
itself SURVIVES — ADR-0175 has a KEEP half that repurposes the chat substrate into `app-guide` — but it
mounts no spawn tool, so there is nothing left there to claim-gate. Live acquisition today: workspace
creation (ADR-0200 D3) and declare-time (ADR-0142, [`claim-at-declare`](claim-at-declare.md)).

Do NOT touch files outside your write scope. Keep the proved unit a pure seam so the default node:test
single-file proof runs it install-free.

## Integration test

**Goal —** Run the real acquire-or-wait seam (no stubs) over both `ClaimResult` arms — acquired and refused
— proving it returns *proceed* for an acquired claim and *wait* (surfacing the live holder's identity) for a
refused one, so a caller has a tested pre-spawn decision boundary. The E2 wiring is not exercised here and
cannot be: its cross-story realisation retired with chat-subagent-spawn under ADR-0175 and its sources are
deleted.

Exercised against its **real collaborator** — the pure seam itself over the real `ClaimResult` shape
(ADR-0010 §5): a result in, a decision out, no store. No live `PgClaimStore.claim()` call happens here or
anywhere at spawn time; the live acquire runs at workspace creation and at declare-time.

## Contracts (2)

The test-proven leaf behaviour, plus the wiring contract that graduated cross-story and has since retired
with its host.

1. **`spawn-seam-proceeds-on-acquire-and-waits-on-refusal`** — the pre-spawn seam returns *proceed* for an
   acquired claim and *wait* (naming the holder) for a refused one.
   - **asserts —** given `{ acquired: true, claim, reclaimed: false }` the seam returns a proceed decision;
     given `{ acquired: false, heldBy }` it returns a wait decision carrying the holder's
     `sessionId` / `branch` / `intent` so the orchestrator can surface who holds the story and wait / pick
     other work (ADR-0138 §2/§3). Pure — no store, no clock, no spawn.
   - **covers —** `packages/agent/src/spawn-claim.ts`
   - **proven by —** `packages/agent/src/spawn-claim.test.ts` (net-new, offline, authored by the leaf).
2. **`orchestrator-acquires-before-spawn`** _(GRADUATED, then RETIRED with its cross-story home — **NOT
   LIVE**)_ — the in-app orchestrator acquires the story-claim before spawning a subagent and spawns only
   on proceed.
   - **status —** **NOT LIVE, and not an obligation.** This contract has no implementation in the tree and
     no home capability. The five `chat-subagent-spawn` capabilities that realised it are all
     `status: retired`, and the sources are deleted:
     `packages/agent/src/{spawn-tool-surface,claim-gated-spawn}.ts`,
     `packages/drive/src/{spawn-deps,spawn-builder,spawn-trace}.ts` and
     `apps/desktop/src/backend/spawn-turns.ts`, held gone by
     `apps/desktop/src/backend/spawn-surface-retired.test.ts` (ADR-0175, *SPAWN — DONE (2026-07-31)*). It
     is recorded HERE as the record of a real graduation and a real withdrawal — nothing asserts it, it is
     never driven `--real` from here, and it stays on `check:coverage`'s advisory uncovered list
     permanently (expected, WARN-only).
   - **covers —** nothing at HEAD. It formerly covered `packages/agent/src/headless-orchestrator.ts`'s
     spawn path; that file survives ADR-0175's KEEP half (the chat substrate repurposed into `app-guide`)
     but mounts no spawn tool.
   - **history —** ADR-0137 flipped accepted 2026-07-02 and this contract's gate half graduated into its
     own capability, [`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md) (4/4 contracts
     green under a signed `--real` PASS: claim acquired via the injected store before the spawn fn ran, a
     refusal naming the holder verbatim, trace signals bumping the heartbeat, a blank story id failing
     closed). The runtime mount followed under the same story (`spawn-tool-surface` /
     `spawn-deps-composition`, both green under signed `--real` PASSes). ADR-0175 then retired the whole
     surface as unreachable — neither the spawn nor the landing surface had a reachable caller. Whether
     this contract should now be STRUCK from the capability rather than recorded is **open modeling call
     6** on the story; striking it is a scope decision, not a correction, so it is surfaced there.
