---
id: "claim-at-declare"
tier: capability
story: wisp-as-story-claim
title: "Claim-at-declare — anchoring a node on the notice board takes the work-time story claim"
outcome: "Declaring presence on a story (`storytree noticeboard declare --node <story> --pg`) ALSO takes the work-time claim on it (intent `orchestrate`) — one ceremony step = presence + wisp; `noticeboard done` bulk-releases every claim the session holds, the statusline heartbeat bumps the session's claim heartbeats, and a refusal never fails the declare — it surfaces the holder loudly. The cheap acquisition wiring for ADR-0138 §3's work-time claim, landed by ADR-0142; the claim-at-SPAWN wiring (capability E) stays deferred behind ADR-0137 Phase 3."
status: proposed
proof_mode: integration-test
depends_on: [claim-store-work-time]
decisions: [142, 138, 121, 33]
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
landed branch's claims, never live work); and the merge ceremony gains the post-merge leg (fetch main,
fresh branch, re-declare → the wisp lifecycle across a landing is a blink, never a silent death).

**Relation to capability E ([`take-claim-at-spawn`](take-claim-at-spawn.md)):** this wiring **neither
replaces nor blocks** E2's claim-at-SPAWN path (ADR-0142 leg 2, verbatim). E1's pure acquire-or-wait
seam is built and proven; E2's spawn-path wiring stays deferred behind ADR-0137 Phase 3. When the
orchestrator actually spawns, the spawn becomes the hard point (*no claim, no subagent*, ADR-0138 §3);
declare-time acquisition remains the session-grain wiring alongside it.

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
