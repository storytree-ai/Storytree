---
status: accepted
load_bearing: true
decided: 2026-07-02
amends: [138, 33]
---
# ADR-0142: Branch dies on merge; the wisp survives via claim-at-declare

## Status

accepted (2026-07-02) — decided/directed by the owner in conversation on 2026-07-02. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0138 made the forest-map wisp a **story claim**: a `events.node_claim` row says "a session is
working this story", and the CI merge job machine-clears every claim (and retires presence) **keyed
on the merged PR's head branch** — the guaranteed clear that fixed "never cleared" (the
`ci-clear-on-merge` capability).

Two forces then collided, observed live on 2026-07-02 (the `claude/elated-chatelet-5c23d7` session):

1. **Sessions merge frequently and keep working** — slow growth wants many small landings, and a
   session naturally continues on the same branch after its PR merges. But the merge just
   machine-erased that branch's board state, and nothing re-takes it: the session becomes
   **invisible** — no wisp, no presence — while actively working. The whole point of the wisp layer
   is defeated exactly when the discipline (frequent merges) is followed best.
2. **The durable work-time claim has no acquisition path yet.** ADR-0138 §3's claim-at-spawn wiring
   is explicitly deferred behind ADR-0137 Phase 3; build-time claims (ADR-0121) release in a
   `finally` when the build ends. So even a well-behaved session shows NO wisp between builds — the
   live notice board showed every active session under "(no node)" with zero claims.

Branch reuse after merge also breeds a family of known traps (stale-CONFLICTING PRs, green-but-
unmerged ready-after-draft-push, GitHub's deleted-then-recreated remote refs) — all symptoms of one
missing invariant: **a branch is one landed unit**.

## Decision

Three legs, one invariant — *the branch dies on merge; visibility survives it via the claim*:

1. **Branch dies on merge — enforced, not guidance.** The CI `verify` job refuses a PR whose head
   branch already has a **merged** PR (`gh pr list --head <branch> --state merged`). A merged branch
   name can never land again; the session cuts a fresh `claude/…` branch for the next unit (the
   worktree stays — session identity is worktree-derived, ADR-0033, so the session continues
   seamlessly).
2. **Claim-at-declare — the cheap acquisition wiring for ADR-0138 §3's work-time claim.**
   `storytree noticeboard declare --node <story> --pg` now ALSO takes the work-time claim on each
   declared node (intent `orchestrate`, via `workClaimRequest` + `PgClaimStore.claim`): one ceremony
   step = presence + wisp. Re-declares re-take re-entrantly (heartbeat refresh). A refusal (another
   session holds the story) **never fails the declare** — presence still lands; the refusal is
   surfaced loudly in the envelope, naming the holder. `noticeboard done` releases every claim the
   session holds (`releaseClaimsBySession`), and the statusline heartbeat bumps the session's claim
   heartbeats on its existing debounce (`bumpHeartbeatsBySession`) so a live session's claim never
   ages into stale-reclaim. Ambient hook declares (`nodes: []`, `reactivate: false`) still never
   touch claims — only a deliberate `declare --node` lights a wisp. The claim-at-SPAWN wiring stays
   deferred behind ADR-0137 Phase 3; this neither replaces nor blocks it.
3. **The merge ceremony gains the post-merge leg.** After CI merges the PR: the branch is dead —
   fetch main, cut a fresh branch, re-declare (which re-claims). The wisp lifecycle across a landing
   is a **blink** (merge clears the landed branch's claim; the re-declare re-lights it on the fresh
   branch), never a silent death.
   *[Amended by ADR-0271 (2026-07-30): the continuation half of this leg is retired. A session's
   working life ends where its PR merges, so the post-merge leg is now the **closing leg** — residue,
   release claims, owner debrief, then inert — and new work re-enters through a **fresh session**, not
   a fresh branch in this one (which also retires §1's "the session continues seamlessly"). The wisp
   lifecycle across a landing is therefore an **ending**, not a blink: the machine-clear is the
   session's last board state, which is honest — it isn't working. Legs 1 and 2 stand unchanged.]*

   *[Re-amended by ADR-0275 (2026-08-01), which partially un-inverts the note above — read the two
   together. Continuation is legal again, so "a session's working life ends where its PR merges" is
   retired: the UNIT ends there and the ending of the SESSION is an orchestration call. But what
   returns is NOT this leg as originally written, and NOT the fresh branch in the same worktree —
   that half stays retired, with §1's "continues seamlessly" along with it. What ADR-0275 D1 mandates
   is a fresh **worktree** on a fresh branch cut from freshly-fetched `origin/main`, mechanically
   required the moment repo code is touched again; non-code work (discussion, `--pg` Library and
   decision-log edits) continues in place and never needed a worktree at all. This leg's own claim
   remains exactly true under both endings: the branch is dead at merge, and the re-declare on the
   new branch re-claims. The wisp lifecycle is therefore a **blink** again for a continuing session
   and an **ending** for one that goes inert. Legs 1 and 2 still stand unchanged.]*

## Consequences

- Any session that anchors itself with `declare --node` now has a durable claim wisp on the map —
  visibility no longer depends on a `--real` build being mid-flight.
- The CI branch-clear stays exactly as honest as ADR-0138 built it: a merge clears precisely the
  landed branch's claims, and the fresh-branch discipline makes "branch" and "landed unit" the same
  thing, so the clear can never erase live work again.
- Branch reuse after merge becomes impossible to land (CI-refused), retiring the trap family it fed.
- Costs: `declare`/`done` write the claim store (claim writes are fail-soft PER NODE — one node's
  refusal or hiccup never costs the other nodes their claims); the verify job spends one `gh` API
  call; `events.node_claim` gains two session-scoped bulk operations (`releaseClaimsBySession`,
  `bumpHeartbeatsBySession`).
- The stale-reclaim window (2h) remains the backstop for sessions that vanish without `done`; the
  heartbeat bump keeps live sessions out of it.

## References

- ADR-0138 (wisp = story claim; §3 work-time claim, §4 machine clear) — this ADR wires §3's
  acquisition the cheap way; ADR-0137 Phase 3 keeps the spawn-path wiring.
- ADR-0033 (presence board; worktree-derived identity), ADR-0121 (build-time claim), ADR-0110
  (design-time ratification).
- `stories/wisp-as-story-claim/` (caps A–F), `.github/workflows/ci.yml` (the merge-job clear + the
  new merged-branch guard), `packages/notice-board/src/store/claim-store.ts`,
  `packages/drive/src/noticeboard.ts`.
