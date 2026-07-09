---
status: accepted
decided: 2026-07-05
load_bearing: true
---
# ADR-0163: Mature the desktop in-app orchestrator by dogfooding: Claude Code routes real work through it and chips the gaps, never bypassing

## Status

accepted (2026-07-05) — decided/directed by the owner in conversation on 2026-07-05, as the retro on
the ADR-0160 scoped-glue-actuator's first live drive. Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask. Stands on ADR-0108 (the human owns the outer loop) and names
the maturation *process* for the desktop-orchestrator parity target ADR-0137 / ADR-0152 set.

> **Amended by [ADR-0174](0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md)**
> — the dogfood arc's **endpoint is retired, not reached**: rather than maturing the in-app *interactive*
> orchestrator to independence, ADR-0174 retires it for an embedded terminal running real Claude Code
> (the terminal already ships the whole Gap A/B/D backlog — turn knobs, fresh-branch landing, CI-watch,
> continuity, inspection). The **"unblock + chip, never bypass" discipline (D3)** and the **recorded
> rejection of a standing agent-supervises-agent supervisor tier (D2)** are untouched, as is the
> human-owns-the-outer-loop stance (ADR-0108) this ADR stands on.

> **Amended by [ADR-0175](0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)**
> — the chat infrastructure this arc built (the SSE transport, the resizable dock, the SDK session
> engine) is **re-aimed under a new `app-guide` help/setup role**, not deleted: repurposed rather than
> matured toward an independent in-app work-orchestrator.

## Context

The desktop **in-app** session-orchestrator — the autonomous Claude Agent SDK session running in the
storytree Electron app's sidecar (`apps/desktop/electron/backend-entry.ts`), the same rendered
`session-orchestrator` agent the terminal runs (ADR-0051) — was brought to whole-loop parity on paper:
it can orient, spawn the inner loop (ADR-0137), and run the merge ceremony (ADR-0152). Its first real
autonomous drive (fix `GET /api/attestations` missing from the sidecar, 2026-07-05) **validated the
ADR-0160 scoped-glue actuator** — it routed to `spawn_glue_worker` (not a whole-story `--real` build),
diagnosed and re-composed the endpoint within the `paths` fence, gated green, and opened a PR. But the
same drive **surfaced landing/ergonomics gaps** the in-app surface still lacks versus the mature
terminal session-orchestrator:

- **Gap A — no per-run turn knob on the glue actuator.** `spawn_glue_worker` (`spawn-tool-surface.ts`)
  has no `maxTurns`, so the worker inherited the story-author-tuned spawn budget (~40,
  `resolveSpawnMaxTurns`, ADR-0130) and exhausted it on an open-ended "investigate + edit" task — cut
  off *after* the complete edit but *before* self-confirm.
- **Gap B — dead-branch landing + no CI-watch.** `open_landing_pr` → `buildLandingDeps` pushes the
  session's fixed branch with no already-merged check, so it committed onto an already-landed branch
  and CI's `merged-branch-guard.sh` (ADR-0142) refused the PR (#599, closed). And the landing surface
  is only `run_gate` + `open_landing_pr` — with **no CI-watch affordance**, so the in-app orchestrator
  cannot even see its PR failed; it believes it is done. That directly violates the session-orchestrator
  discipline *"a PR is not done until CI is green — WATCH it."*

The mature terminal orchestrator re-landed the fix cleanly (fresh branch, watched CI) as PR #601 —
because its tool surface *has* those affordances. The question the owner raised: how do we mature the
in-app orchestrator to that reliability? The forces:

- **Don't block.** Maturing it in the abstract (build every affordance up front, then trust it) stalls
  real work behind speculative gap-filling.
- **Don't bypass.** Doing the work directly in the mature Claude Code session (never routing through
  the in-app orchestrator) means its gaps never surface — it stays untrusted forever, never dogfooded.
- **Don't over-architect.** The retro's first proposal — a *standing* "babysitter" where the mature
  orchestrator permanently supervises the in-app one — was **rejected**: it inserts a second agent into
  the seat ADR-0108 reserves for the human, creates claim / single-session-guard conflicts (ADR-0138 /
  ADR-0108 d.6), and costs more to build than the gaps it papers over (removing the babysitter still
  requires building those same affordances). ADR-0152's thesis is *parity, not a new orchestrator*.

## Decision

**D1 — Mature the in-app orchestrator by dogfooding, with Claude Code as the transitional unblocker.**
The owner drives real work **through the in-app desktop orchestrator**. When it hits a gap it cannot
cross, the mature Claude Code session (the terminal-equivalent session-orchestrator) **unblocks the
leg** (completes it so the work is never stalled) **and chips a gap-closing session** to give the
in-app surface the missing affordance — it does **not** silently do the work around the in-app
orchestrator and move on. The loop is: route through it → hit a gap → unblock + chip → the gap closes →
route through it again. This continues until the in-app orchestrator **reliably runs the full loop
end-to-end** — dogfooded into being usable in full.

**D2 — This is transitional scaffolding, not a standing architecture.** The endpoint is the in-app
orchestrator's **independence** — the "babysitting" retires as the gap list drains. There is no
permanent agent-supervises-agent tier: the human still owns the outer loop (ADR-0108), Claude Code is
the *transitional* fallback that keeps work flowing and converts each block into a chipped, closable
unit. When the in-app orchestrator can run a representative drive (author/change → gate → land → watch
CI to green → apply) without a manual unblock, the practice has graduated and this ADR's discipline is
spent.

**D3 — The discipline that makes it converge: always chip, never just fix-and-forget.** A gap
Claude Code papers over without recording is a gap that recurs. Every unblock that reveals a missing
in-app affordance MUST leave behind a chip (or an ADR, for a design fork), so the maturation is a
draining backlog, not an endless babysit. The gaps already found are the first entries:
  - **Gap A** → a chip: an optional `maxTurns` on `spawn_glue_worker`, threaded through
    `spawnGlueWorker` → the write-scoped runner (+ the guidance nudge to hand tight, file-pointed glue
    tasks rather than open-ended "investigate + edit").
  - **Gap B1** → a chip: `open_landing_pr` cuts a fresh branch (and re-declares presence, ADR-0142)
    when the current branch is already merged, instead of committing onto a dead branch.
  - **Gap B2** → a chip: a read-only CI-watch affordance (`poll_pr_checks`-shaped) on the landing
    surface so the in-app orchestrator watches its PR to green — the highest-leverage of the three
    (it fixes the "believes it's done" blind spot and unblocks the autonomous half of ADR-0164).

## Consequences

**Good.**
- Gaps surface through **real use**, not speculation; work is **never blocked** (the mature session
  unblocks); and the system converges on a concrete, draining backlog rather than an open-ended "make
  it reliable" goal.
- ADR-0108 is preserved: the human owns the outer loop, and the in-app orchestrator matures toward
  *independence*, not toward permanent subordination.
- The retro's over-abstraction (a standing supervisor tier) is recorded as **rejected**, so it is not
  re-proposed.

**Bad / open.**
- Costs mature-session (Claude Code) time babysitting a still-unreliable surface; the payoff is
  front-loaded gap discovery.
- Needs an honest **graduation bar** (D2) — a way to say "reliable enough, stop babysitting" — or the
  practice never ends. The bar is judgement, not a gate.
- The convergence depends entirely on the D3 discipline: a mature session that unblocks-and-forgets
  instead of unblock-and-chips would keep the in-app orchestrator perpetually dependent.

## References

- ADR-0160 — the scoped glue actuator whose first live drive is this retro's trigger (it passed; the
  gaps are around it, not in it).
- ADR-0158 — glue is un-asserted code within a story; the actuator's design context.
- ADR-0152 / ADR-0137 — the desktop-orchestrator parity target ("parity, not a new orchestrator"); this
  ADR names how that parity is *reached* (dogfooding), and why a supervising tier is rejected.
- ADR-0108 — the human owns the outer loop; the endpoint of this practice is the in-app orchestrator's
  independence, not a second agent in the outer loop.
- ADR-0130 / ADR-0131 — the turn-cap brake (Gap A's context).
- ADR-0142 — the merged-branch guard + the presence machine-clear on merge (Gap B1's context).
- ADR-0164 — the desktop self-restart-to-apply capability (a further identified gap; its autonomous
  phase depends on Gap B2's CI-watch), chipped and discussed separately.
- Code: `packages/agent/src/spawn-tool-surface.ts` (`spawn_glue_worker`, Gap A),
  `packages/agent/src/landing-tool-surface.ts` + `packages/drive/src/landing-deps.ts` (the landing
  surface, Gap B), `apps/desktop/src/backend/spawn-turns.ts` (`resolveSpawnMaxTurns`, Gap A).
