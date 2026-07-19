---
status: accepted
load_bearing: true
decided: 2026-06-29
amends: [121, 33]
supersedes: [48]
---
# ADR-0138: The wisp is a forced, CI-cleared story-claim — one coordination and observability layer

## Status

accepted — directed and green-lit by the owner 2026-06-29 in design discussion with the orchestrator
(the ADR-0137 workflow: the orchestrator holds the discussion and authors the ADR), drafted by the
orchestrator from that discussion; design-time direction IS ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)). The owner made the four
load-bearing calls recorded here: **story** grain, **hard refuse**, **trace-driven** staleness, and
**claim-at-spawn by guidance** with ADR-authoring as the sole claim-free action. Edges finalized by the
librarian-curator on accept: **supersedes** [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md)
(fully — the wisp is the claim now, not the build; ADR-0048's build-wisp becomes a colour state) and
**corrects [ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) in place**
(per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md); session activity
IS rendered, now honestly — honest-by-absence generalises); **amends**
[ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) /
[ADR-0033](0033-session-presence-notice-board.md) (the claim); builds on
[ADR-0137](0137-chat-is-the-full-session-orchestrator-it-spawns-the-inner-lo.md) (prose-only, no
frontmatter edge). The two open-questions this resolves/narrows
(`oq-wisp-coverage-target`, `oq-fix-drive-build-shape`) are reconciled in the live store on the same
accept pass.

## Context

The forest map serves **two distinct jobs** that prior ADRs conflated under one signal:

- **Observability** — "a proof is being mechanically driven on this node right now" (the build-wisp,
  ADR-0048).
- **Coordination** — "another session is working on this story, so I should wait / pull main after its
  merge / avoid stomping it."

[ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) (2026-06-28) correctly
found the map honest-by-absence **for the observability job** — a wisp is a `--real` build, and ~92% of
work is not a driven build, so the map is usually bare. But it answered the observability question and
read the result onto the coordination job, where it does not hold: the **coordination need is real and
demonstrated.** The duplicate-build collisions in the record (a PR closed as a full duplicate; the
recurring `cascade-parallel-duplicate-build` trap) are sessions stomping each other for lack of a
**node-anchored "someone is here"** signal. The studio **dock** (ADR-0033) lists active sessions but
**not which story each is touching** (sessions declare `nodes:[]`), so it never solved overlap.

Why coordination presence was demoted (ADR-0048 §5) / declined
([ADR-0124](0124-honest-session-presence-machine-emitted-by-the-outer-loop-ru.md), superseded by
ADR-0128): declaring a node was **voluntary** and the declaration was **never reliably cleared** (racy
`SessionEnd` → stale zombies). **Both objections are now removable** because we own the outer loop and
the inner loop (ADR-0137 / [ADR-0030](0030-all-in-on-claude-agent-sdk.md)): we can force the declaration
and clear it from a machine event.

**The primitive already exists.** `events.node_claim`
([ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) / ADR-0009 — the
ADR-0033 §4 "typed-claims-with-refusal" upgrade, deferred *"until overlap conflicts became routine"*,
which they now are) is a per-node **DB lock**: `unit_id` is the **PRIMARY KEY**, so a second concurrent
claim cannot insert — the atomic `INSERT … ON CONFLICT DO UPDATE … WHERE (re-entrant OR stale)` returns
no row to a second claimant = a **hard refusal that names the holder**. It carries `session_id`,
`branch`, and a free-prose `intent` (with `"edit"` already foreseen), a heartbeat-staleness reclaim, and
a `claim_event` audit log (`claimed | reclaimed | released | conflict-refused`). **Today it is acquired
only by a `--real` build and is invisible on the map** (the wisp reads `events.work_event` building
rows, never `node_claim`). So the lock the design needs is built; what is missing is *when* it is taken,
*how* it is cleared, and *that it is rendered.*

## Decision

1. **The story-claim is the single coordination + observability layer.** `events.node_claim`, at
   **story** grain, is the source of truth for "who is working on what." **The wisp is the render of the
   claim**, not of the build: one wisp per claimed story. This unifies the notice board and the wisp
   into one layer (the claim is the primitive; the wisp is its render; the dock remains the lighter
   session roster).

2. **Hard refuse, story grain.** A second session claiming a held story is **hard-refused and told the
   holder** (ADR-0009's "a conflict is a hard refusal, never a warning") — it waits (now cheap, see §4)
   or picks other work. **Story** grain is the deliberate call: simplest, and it matches the
   one-worktree-per-story build model ([ADR-0031](0031-real-pass-promotion-and-worktree-deps.md)). The
   accepted cost is that same-story work **serialises** (a second session on a sibling capability
   waits); capability grain is the named scale-up path.

3. **Forced by the outer loop, via guidance — not a hard session-start gate.** The session-orchestrator
   (ADR-0137) is instructed in its **guidance prose** to hold a story-claim before it spawns any
   subagent. The de-facto hard point is the **spawn**: no claim, no subagent — and a refused claim means
   it waits. The **only** action the orchestrator may take without a claim is **authoring an ADR** (its
   sole direct write, ADR-0137) — because an ADR has **no story node** to claim. Leaving the *timing* to
   the orchestrator (claim when it needs to spawn) rather than a runtime wall keeps it simple and is
   sufficient, because every work path except ADR-authoring runs through a spawn.

4. **Cleared on the CI merge by branch; staleness is a trace-driven backstop.** The merge job — which
   already *"sweep[s] possibly-dead presence rows"* — also **releases `node_claim` rows for the
   merged/closed branch** (`branch` is already a column), a **guaranteed machine clear** (the fix for
   "never cleared"). The heartbeat-staleness reclaim stays, but the heartbeat is **bumped by the loops'
   own trace signals** — the SDK turn / tool-call / phase events we already emit (`onMessage` / `onPhase`)
   — so a live session's claim **never** ages out and a dead session's claim ages out **truthfully.** No
   self-reported ping, no zombie. (The mid-flight heartbeat bump that `claim.ts` names as a follow-on
   becomes load-bearing here.)

5. **The wisp's colour is the active subagent / intent; the proof stays distinct.** One story wisp,
   coloured by what the orchestrator is currently doing on the story: **authoring** (story-author),
   **proving** (the builder leaf's red→green phases — the old build-wisp, now a colour *state*),
   **supplementing** (glue). *[Overtaken in part by
   [ADR-0212](0212-one-wisp-per-session-merge-the-build-wisp-into-the-claim-lif.md) (decided
   2026-07-18): the colour-by-role channel STANDS (authoring / proving / supplementing), but the
   builder leaf's red→green `phaseBand` is no longer carried by COLOUR — it moves to the MOTION
   channel (speed / pulse), on the work stage only. Decision only: the engine change is ADR-0212's
   increment 2 and is NOT yet built.]* A spawned subagent runs under the story's claim, so its role
   sets the colour. **Honesty wall (non-negotiable):** a claim's presence or colour is **never** a proof — only a
   real build's `CONFIRM_GREEN` + signed verdict paints the green **bloom**
   ([ADR-0045](0045-live-activity-layer-is-verdict-blooms.md) /
   [ADR-0099](0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md)). A claimed-but-not-proven
   story must look visibly different from a proven-green one, or the map silently inflates proof.

6. **Do not register nodes for the lock.** The race-safety is the `unit_id` PRIMARY KEY on `node_claim` —
   the DB's own unique-constraint infrastructure *is* the mutex. A dedicated node table would add only
   referential integrity, at the cost of another seed↔live drift surface; out of scope.

## Consequences

**Good**
- One coherent layer: the map answers both *"who is here?"* (the claim) and *"is a proof running?"* (the
  proving colour + the bloom). The forensic gap ADR-0128 left — the dock does not show the node — is
  closed.
- The two failure modes that demoted coordination presence (voluntary declaration, never cleared) are
  **structurally** fixed (forced-at-spawn + CI-clear + trace-staleness), so rendering session activity is
  now honest — the ADR-0124 *direction* becomes achievable without its unreliability.
- Reuses the built lock (`node_claim`); the delta is take-at-spawn, clear-on-merge, render-the-claim,
  colour-by-subagent — a smaller change than a new mechanism.
- Directly prevents the documented duplicate-build collisions: a second session is refused and told to
  wait / pull main after the holder's merge.

**Bad / accepted costs**
- Story-grain hard-refuse **serialises** same-story work; a second session on a sibling capability waits.
  Accepted at inner-circle scale ([ADR-0133](0133-inner-circle-desktop-is-the-priority-finish-storytrees-tree-f.md));
  capability grain is the named scale-up.
- "Forced" is guidance + the spawn-gate, not a runtime session-start wall, so the guarantee is only as
  strong as the spawn being the choke point — true for every path except ADR-authoring (which has no
  node), so the surface is narrow and the guidance carries it.
- More to render honestly: the claim≠proof wall (§5) must be enforced visually.

**Neutral / reconciliation**
- **Resolves [`oq-wisp-coverage-target`]** — the owner chose the coordination signal over
  honest-by-absence-only — and **narrows [`oq-fix-drive-build-shape`]** to its landing question (a fix's
  *claim* now shows on the map regardless; the proving colour + the signed verdict still require the
  `--real` drive). The librarian-curator reconciles both open-questions and finalizes the ADR-0128
  supersession edge on accept.
- ADR-0048's build-wisp is **not deleted** — it becomes the *proving* colour state of the story-claim
  wisp; "honest by absence" **generalises** (an empty map now means no session holds any node).
  *[Overtaken by [ADR-0212](0212-one-wisp-per-session-merge-the-build-wisp-into-the-claim-lif.md)
  (decided 2026-07-18): the build wisp IS now retired as a separate drawable. Wisp count encodes
  SESSIONS — one session renders exactly ONE wisp — and the red→green `phaseBand` folds into that
  wisp's MOTION channel, not its colour. The two-layer split this bullet assumes is collapsed; the §5
  honesty wall above is explicitly PRESERVED by ADR-0212, not relaxed. Decision only: `scene.ts` still
  builds both `buildWisps` and `buildClaimWisps` — the merge is ADR-0212 increments 2–3, NOT yet
  built.]*

## References

- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — the build-wisp; **superseded** (the wisp is
  now the claim; the build is a colour state).
- [ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) — honest-by-absence /
  "don't render session activity"; **corrected in place** (per
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md); session activity *is*
  rendered, now honestly).
- [ADR-0124](0124-honest-session-presence-machine-emitted-by-the-outer-loop-ru.md) — the
  machine-emitted-presence *direction*, previously withdrawn for unreliability; **realised here** via the
  forced + CI-cleared claim.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) / ADR-0009 — the
  per-unit write-claim (`events.node_claim`); **amended** from build-time to work-time (the claim is now
  taken at spawn, not only by a build).
- [ADR-0033](0033-session-presence-notice-board.md) — session presence / the dock; **amended** (the claim
  now renders and is forced; the dock stays the session roster).
- [ADR-0137](0137-chat-is-the-full-session-orchestrator-it-spawns-the-inner-lo.md) — the orchestrator
  that holds the claim, spawns the subagents that colour the wisp, and authors ADRs (the sole claim-free
  action).
- [ADR-0045](0045-live-activity-layer-is-verdict-blooms.md) /
  [ADR-0099](0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md) — the verdict bloom; the
  proof signal that stays distinct from the claim (the §5 honesty wall).
- [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — one-worktree-per-story; why story grain
  fits. ADR-0133 — inner-circle scale; why serialisation is acceptable. ADR-0110 — design-time
  ratification.
- Code: `packages/notice-board/src/claim.ts` + `packages/library/src/store/` (`node_claim` / `claim_event`,
  the atomic lock); `apps/studio/server/inFlightBuilds.ts` (the wisp source to re-point at the claim);
  `packages/drive/src/phase-activity.ts` (the phase→colour writer to generalise to subagent→colour); the
  CI merge job's presence sweep (to extend with a branch-keyed `node_claim` release);
  `packages/agent/src/headless-orchestrator.ts` (`onMessage` trace seam for the heartbeat).
- `docs/research/wisp-coverage-under-in-app-orchestration.md` — the analysis this decision answers; the
  two open-questions (`oq-wisp-coverage-target`, `oq-fix-drive-build-shape`) it resolves / narrows.
