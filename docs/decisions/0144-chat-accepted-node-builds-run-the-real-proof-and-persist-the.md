---
status: accepted
decided: 2026-07-02
amends: [136]
---
# ADR-0144: Chat-accepted node builds run the real proof and persist — the routed node dispatch is node build --real; landing stays the human gate over the parked branch

## Status

accepted (2026-07-02) — decided/directed by the owner in conversation on 2026-07-02. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. Resolves the open-question artifact `oq-fix-drive-build-shape` (Option A) that ADR-0137's consequences explicitly deferred.

> **Amended by [ADR-0155](0155-orchestrator-drives-retire-the-chat-propose-unit-accept-to-b.md)**
> (accepted, 2026-07-04) — **the chat TRIGGER described below is retired; this ADR's decision stands.**
> The `## Context`'s "propose→accept→build loop" (ChatPanel's Build button → `POST /api/chat/accept` →
> `dispatchAcceptedBuild`) was removed in PR #587: the desktop session-orchestrator now DRIVES via its
> spawn (ADR-0137) + landing (ADR-0152) tools rather than accepting a chat proposal into a build. What
> this ADR actually DECIDED is untouched and live: the routed NODE dispatch (`routedBuildRunner`,
> `packages/drive/src/build-worker.ts`) drives `node build --real` with persist semantics and parks the
> proven branch for the human to land (the green `routed-node-real-dispatch` capability). Only the
> **trigger** changed (the orchestrator's own drive, not a human accept-click on a chat proposal); the
> node-`--real`-persist behaviour, the "landing stays the human gate" rule, and `dispatchAcceptedBuild`
> (still called by `builder-spawn-dispatch`, ADR-0137) are unchanged.

## Context

The chat propose→accept→build loop is live (ADR-0108 Phases 3–4, the `chat-drive-bridge` /
`desktop-build-mount` stories): ChatPanel's Build button → `POST /api/chat/accept` →
`dispatchAcceptedBuild` → `routedBuildRunner` (`packages/drive/src/build-worker.ts`). Routing is
tier-based: a STORY accept drives `story build --real` (real red→green per capability, verdicts
persisted to `events.verdict`, a non-draft PR CI auto-merges — ADR-0022/0136); a NODE accept drives
`node build --live` — the SYNTHETIC `add(2,3)` smoke, which per ADR-0099-B must NOT persist (a
forged green), so it runs in-memory: no persisted `building` mark (no build wisp beyond the ADR-0138
claim), no signed verdict, no landing path.

But the chat agent is the `session-orchestrator`, and slow-growth (minimum-to-green) means it
proposes NODE-tier units by design. So the most common chat-accepted build — a single capability, a
fix, a change — was a throwaway demo: the node's REAL proof never ran and nothing persisted. This is
the gap `oq-fix-drive-build-shape` names ("leaf-provable FIXES never wisp… for the most common kind
of work") and the residual ADR-0137's consequences flagged ("a real unit-level drive is still a
smoke today"). ADR-0099-B bars only SYNTHETIC persists — a real drive of an existing contract is a
genuine red→green, so persisting it is correct, not a back-door.

The OQ's three options: **A** — route the node dispatch to `node build --real` (persist + real
proof), land via the human gate over the parked branch; **B** — escalate a fix to its owning story's
Build (rebuilds every capability for a one-line fix — the trap ADR-0136 rejected); **C** — a
node-level auto-merging PR (net-new outward-facing mechanism per fix).

## Decision

**Option A, owner-directed.** The routed build dispatch's NODE branch (`routedBuildRunner`,
`packages/drive/src/build-worker.ts`) drives **`node build --real` with `--store pg` semantics**:
the leaf authors the node's REAL test/impl in a fresh worktree, the spine observes the genuine
red→green and SIGNS, the `building` mark + signed verdict PERSIST to
`events.work_event`/`events.verdict` (the build wisps and blooms honestly, ADR-0048), and a passing
run parks the proven commit on a `claude/real/<unit>-<run>` branch (ADR-0031).

**Landing stays the human gate — no auto-PR per node accept (ADR-0136 intact).** Only
`story build --real` opens the auto-merging PR. A node `--real` pass surfaces its parked branch in
the build envelope/transcript the chat surface already streams back (the `promoted:` line and the
`gh pr create` follow-on), so the human lands it deliberately — merge NON-SQUASH so the verdict's
commit stays an ancestor of main.

The walls are unchanged: the dispatch is a build INTENT — the spine signs, never the caller
(ADR-0091); ADR-0099-B still refuses `--store pg` for any synthetic walk; ADR-0121's per-unit claim
still refuses a concurrent duplicate `--real`; ADR-0130's turn cap remains the runaway brake.

## Consequences

- Chat-accepted node builds are no longer throwaway demos: the node's real proof runs, the verdict
  persists, and the map shows the work (wisp → bloom) like any CLI `--real` drive.
- The synthetic `--live` smoke remains available at the CLI as the pipeline check it always was —
  it is simply no longer what a human's accept dispatches.
- A chat-accepted node build is now subscription-billed real authoring (the click is the approval
  to spend, exactly as it already was for a story accept) and requires the live DB (the build's
  `ensureLiveDb` preflight starts it) and fresh SDK auth — an auth failure is an honest failed run.
- The single-contract landing affordance stays manual (the parked branch named in the chat
  transcript). If that gesture proves too heavy in practice, a node-level landing affordance
  (OQ Option C territory) is a future owner fork, not implied here.
- ADR-0136 is amended in degree, not reversed: its "a node accept is the `--live` smoke" description
  of the routed dispatch is overtaken; its core decision (story go-green = the story Build
  affordance; only a story `--real` opens the auto-merging PR) stands.

## References

- `oq-fix-drive-build-shape` (Library open-question — resolved to Option A by this ADR).
- ADR-0136 (story Build affordance / only story `--real` opens the PR — amended in degree).
- ADR-0137 (chat is the full session-orchestrator; deferred this build-shape residual).
- ADR-0099-B (synthetic smoke verdicts must not persist — untouched; a real drive persisting is correct).
- ADR-0031 (branch-per-pass promotion), ADR-0091 (the spine signs), ADR-0121 (per-unit claim),
  ADR-0130 (turn cap), ADR-0048 (the build wisp).
- `packages/drive/src/build-worker.ts` (`routedBuildRunner` — the changed dispatch),
  `docs/research/wisp-coverage-under-in-app-orchestration.md` (OQ-A).
