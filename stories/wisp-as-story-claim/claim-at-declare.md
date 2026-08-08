---
id: "claim-at-declare"
tier: capability
story: wisp-as-story-claim
title: "Claim-at-declare — anchoring a node on the notice board takes the work-time story claim"
outcome: "Declaring presence on a story (`storytree noticeboard declare --node <story> --pg`) ALSO takes the work-time claim on it (intent `orchestrate`) — one ceremony step = presence + wisp; `noticeboard done` bulk-releases every claim the session holds, the statusline heartbeat bumps the session's claim heartbeats, and a refusal never fails the declare — it surfaces the holder loudly. The cheap acquisition wiring for ADR-0138 §3's work-time claim, landed by ADR-0142; the claim-at-SPAWN gate (capability E's E2) landed cross-story as chat-subagent-spawn's claim-gated-spawn, was mounted, and then RETIRED with that whole story under ADR-0175 — so with ADR-0200's workspace-creation claim, this is the live acquisition surface."
status: proposed
proof_mode: integration-test
depends_on: [claim-store-work-time]
decisions: [142, 138, 121, 33, 175]
# DOCUMENTATION OF LANDED WORK (ADR-0142, PR #535) — authored AFTER the landing to keep the story's
# map honest, not to drive a build. NO `proof:` block: the behaviour is already proven by ordinary
# offline package tests that landed WITH the implementation (packages/drive/src/noticeboard.test.ts,
# packages/notice-board/src/store/claim-store.test.ts), not by a fresh red→green through the
# prove-it-gate — a `real:` arm authored now would manufacture a fake red over green code. Absent
# block ⇒ the node is not `--real`-buildable, which is correct: there is nothing left to build.
---

# Claim-at-declare — the landed work-time claim acquisition

**Outcome —** `storytree noticeboard declare --node <story> --pg` **also takes the work-time claim** on
each declared node — one ceremony step = presence **+ wisp**. This is the **cheap acquisition wiring**
for ADR-0138 §3's work-time claim, decided and landed by
[ADR-0142](../../docs/decisions/0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md)
(PR #535): a session that anchors itself on the board now has a durable claim-wisp on the map, so
visibility no longer depends on a `--real` build being mid-flight — the gap ADR-0142's context observed
live (every active session under "(no node)", zero claims, between builds).

**Depends on —** [`claim-store-work-time`](claim-store-work-time.md) (A3's `workClaimRequest` intent
builder is what the declare acquires with; the session-scoped bulk operations below are the
`bySession` twins of A1's `releaseClaimsByBranch` and A2's heartbeat bump, added to the same
`PgClaimStore`).

> **ADR-0200 note (declare is one acquisition point of several).** Declare-time acquisition (this
> capability) stands, but it is no longer the *earliest*: under ADR-0200 a session is **born claimed** at
> `worktree create` (the `exploring` claim, ADR-0200 D3), and `declare --node` / `noticeboard claim`
> **upgrade** to the `work` claim. `done` still bulk-releases via `releaseClaimsBySession`; the statusline
> heartbeat still bumps via `bumpHeartbeatsBySession`. The refusal path generalises: a held work slot no
> longer only refuses — the session can **queue** (`waiting`) and be atomically promoted on release. The
> `check:declared` rung hardened from WARN to **FAIL** (ADR-0200 D3): a session holding zero live claims
> of any grade cannot reach the merge ceremony.

> **Proof status (honest) — LANDED (ADR-0142, PR #535); the authored status stays `proposed`.** This
> capability documents work that landed WITH its ADR, proven by the ordinary offline package suites —
> not driven red→green through the prove-it-gate after the fact (no `proof:` block; a `real:` arm
> authored now would fake a red over green code). The declare/done/heartbeat claim behaviour is proven
> in `packages/drive/src/noticeboard.test.ts` (claim-at-declare, fail-soft refusal + failure arms,
> done-releases) and `packages/notice-board/src/store/claim-store.test.ts`
> (`releaseClaimsBySession` / `bumpHeartbeatsBySession`); implementation in
> `packages/drive/src/noticeboard.ts` (the `SessionClaimStoreLike` seam + the declare/done wiring) and
> `packages/notice-board/src/store/claim-store.ts`. `healthy` stays earned via the fold, never
> authored (ADR-0020).

## Guidance

What ADR-0142 landed here (leg 2 of its three; legs 1 and 3 are context below):

- **Declare acquires.** `declare --node <story> --pg` takes the work-time claim on each declared node —
  intent `orchestrate`, via `workClaimRequest` (A3) + `PgClaimStore.claim()`. Re-declares re-take
  re-entrantly (a heartbeat refresh, the existing `claim()` re-entrancy). Only a **deliberate**
  `declare --node` lights a wisp: ambient hook declares (`nodes: []`, `reactivate: false`) never touch
  claims.
- **Refusal is fail-soft and loud.** Another session holding the story never fails the declare —
  presence still lands; the envelope surfaces the holder (`sessionId` / `branch` / `intent`) so the
  session coordinates or picks other work (ADR-0138 §2). A claim-store hiccup likewise: presence
  declared, "wisp NOT lit" surfaced.
- **`done` releases everything.** `noticeboard done` calls `releaseClaimsBySession` — a done session is
  working nothing, so its wisps go out (one transaction, one `released` audit event per claim). Also
  fail-soft: stale-reclaim and the CI merge clear (capability D) are the backstops.
- **The statusline heartbeat keeps claims live.** The ambient beat that keeps presence fresh also calls
  `bumpHeartbeatsBySession` on its existing debounce — touches only `heartbeat_at`, no audit event —
  so a live session's claims never age into the 2 h stale-reclaim window (ADR-0138 §4).

**Sibling context (ADR-0142 legs 1 & 3, not this capability's surface):** the CI `verify` job now
refuses a PR whose head branch already merged (`scripts/merged-branch-guard.sh`) — *a branch is one
landed unit* — which is what keeps capability D's branch-keyed clear honest (a merge clears exactly the
landed branch's claims, never live work); and the merge ceremony gains the post-merge leg.

> **ADR-0271 note (leg 3's continuation half is retired).** Leg 3's original shape — fetch main, cut a
> fresh branch, re-declare, keep working — was amended by
> [ADR-0271](../../docs/decisions/0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md)
> (2026-07-30): a session's working life ends where its PR merges, so the post-merge leg is now the
> **closing leg** — residue, release claims, owner debrief, then inert — and new work re-enters through a
> **fresh session**, not a fresh branch in this one. The wisp lifecycle across a landing is therefore an
> **ending**, not a blink: capability D's machine-clear is the session's last board state, which is
> honest — it isn't working. `storytree branch next` survives only for the rare owner-directed
> in-session continuation. **Legs 1 and 2 — this capability included — stand unchanged.**

**Relation to capability E ([`take-claim-at-spawn`](take-claim-at-spawn.md)):** this wiring **neither
replaced nor blocked** E2's claim-at-SPAWN path (ADR-0142 leg 2, verbatim). E1's pure acquire-or-wait
seam is built, proven, and deliberately kept (`packages/agent/src/spawn-claim.ts`, named by ADR-0175).
E2's GATE did land cross-story as chat-subagent-spawn's
[`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md) under a signed `--real` PASS, and its
runtime mount landed after it — but **all of it then retired with that whole story under
[ADR-0175](../../docs/decisions/0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)**
(execution status *SPAWN — DONE (2026-07-31)*): the spawn tool surface, the gate and the deps composition
are deleted, held gone by `apps/desktop/src/backend/spawn-surface-retired.test.ts`, and that story plus
all five of its capabilities are `status: retired` — so the link above points at retired work whose code
no longer exists. The spawn therefore never became the live hard point (*no claim, no subagent*,
ADR-0138 §3): **declare-time acquisition, together with ADR-0200 D3's forced `exploring` claim at
workspace creation, is the live acquisition surface** — not one of two coexisting paths.

## How it was proven

Landed with its tests in PR #535 (the ADR-0142 unit) — machine-proven by the offline package suites,
witnessed on the live board:

1. **Suite-proven —** `packages/drive/src/noticeboard.test.ts` proves declare-takes-the-claim (intent
   `orchestrate`), the refused arm (presence lands, holder surfaced), the claim-write-failure arm
   (presence lands, "wisp NOT lit"), no-claims-without-`--node`, and done-releases-the-session's
   claims. `packages/notice-board/src/store/claim-store.test.ts` proves `releaseClaimsBySession`
   (bulk delete + one `released` event per claim, other sessions untouched) and
   `bumpHeartbeatsBySession` (heartbeat-only, no audit event).
2. **Board-witnessed —** a session's `declare --node` lights exactly one wisp on the claimed story on
   the forest map (the appearance UAT, capability F, attested the wisp render); `done` and the CI merge
   clear (D) put it out.
