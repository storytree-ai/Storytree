---
status: accepted
decided: 2026-07-20
---
# ADR-0220: Self-healing session worktrees: SessionStart repairs the empty-husk branch-at-main failure

## Status

accepted (2026-07-20) — decided/directed by the owner in conversation on 2026-07-20 ("this is a
reoccurring issue … can you retro and then solve this properly"). Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask.

## Context

The worktree-creation harness intermittently leaves a session with an **empty, unregistered**
`.claude/worktrees/<name>` slot while the session's `claude/*` branch sits **checked out at the MAIN
checkout**. Reflog evidence (reproduced live 2026-07-20, twice in one day) pins the mechanism: the
harness's create sequence is *checkout branch at main → detach main → `git worktree add <slot>
<branch>`*, and when it dies before the detach, the add fatally refuses (`'<branch>' is already used
by worktree at '<main>'`) — the husk fails **OPEN** (reads succeed against main) and the session is
unusable for landing work (worktree-identity writes refuse; `check:declared` cannot pass).

The first mitigation (friction `session-worktree-never-created-branch-at-main`, landed 2026-07-20
morning) was a **detector** — `packages/cli/worktree-health.mjs --hook` announcing the break with a
RESTART remedy. It had a structural hole its own header documented: every cwd-relative SessionStart
hook command (`node packages/cli/worktree-health.mjs`) needs its script to EXIST at the session cwd,
and an **empty** slot has no files — so the detector was inert for exactly the variant that recurs,
and the remedy (restart the whole session, owner intervention) still priced every occurrence at a
full session turnaround. The same afternoon the bug recurred and the detector, as predicted, said
nothing.

Two facts make a proper fix possible:

1. **The bug's fingerprint is its own escape hatch.** From the empty husk, `git rev-parse
   --show-toplevel` resolves UP to the main checkout — so a hook command can locate and run MAIN's
   copy of the script even when the slot has no files.
2. **The failure state is mechanically finishable.** The husk is the harness's own sequence
   interrupted mid-way; the remaining steps (detach main, `worktree add`) are exactly determinable,
   and the detach is inherently gentle — same commit, zero working-tree file changes, safe even
   against a dirty main tree.

## Decision

**The SessionStart health hook repairs the empty husk instead of announcing it.**

1. **Reach:** `.claude/settings.json` invokes the health hook THROUGH git —
   `bash -c 't="$(git rev-parse --show-toplevel 2>/dev/null)" && node
   "$t/packages/cli/worktree-health.mjs" --hook || true'` — so a healthy worktree runs its own copy
   (as before) and an empty husk runs main's copy. The hook is also **reordered BEFORE
   provision-worktree**: repair first, then the provision hook finds a real checkout and installs
   node_modules with its own budget/retry/heads-up.
2. **Fences (pure `repairDecision`):** repair fires only for the provable fingerprint — verdict
   `broken` **AND** cwd IS the slot root **AND** the slot is EMPTY **AND** main's HEAD is attached to
   a `claude/*` branch (the harness-owned namespace; main's resting state in this workflow is
   detached, so a lingering `claude/*` checkout IS the failed-create residue). Anything else —
   populated husk, main detached, main on a human branch — keeps the loud announce + RESTART remedy,
   now stating which fence held.
3. **Repair (`repairBrokenSlot`):** finish the harness's sequence — `git checkout --detach` at main
   (frees the branch in place), `git worktree add <slot> <branch>`, then RE-CLASSIFY with real
   probes; only a `registered` verdict counts. A failed add checks main back out on the branch
   (leave-as-found). The agent receives a `WORKTREE AUTO-REPAIRED` SessionStart heads-up: proceed,
   do NOT restart, do NOT touch main.
4. **Classification is slot-root-aware:** git resolves a *subdirectory* of a healthy worktree to the
   slot root, not to itself — the classifier now compares `topLevel` against the containing slot
   root (`slotRootOf`), fixing a latent false-BROKEN for worktree subdirs caught while smoking this
   change.
5. **The doctor stays read-only** unless `--repair` is passed
   (`node packages/cli/worktree-health.mjs --cwd <slot> [--repair]`); `--hook` implies repair.

The prior guidance "do NOT do mid-build git surgery — RESTART" is **superseded for the empty-husk
case only**: the surgery is now automated, fenced, and proven (unit + throwaway-repo E2E, plus a
live repair of the very session that shipped this). For un-repairable shapes the restart guidance
stands unchanged.

## Consequences

- The recurring failure now costs one hook execution instead of a dead session + owner intervention.
  The 2026-07-20 afternoon occurrence was repaired manually with exactly these steps and the session
  proceeded to land this ADR — the procedure is live-proven.
- Main's checkout may be found DETACHED after a repair (its normal resting state in this workflow);
  the branch it was wrongly holding lives on in the session worktree. Main's working tree is never
  touched.
- The fix only runs from the checkout whose `.claude/settings.json` + script version include it —
  the MAIN checkout must be advanced past this ADR's merge for husk sessions to benefit (a husk
  resolves to main's copy).
- The harness bug itself (dying between checkout and detach) remains upstream; if empty husks appear
  WITHOUT a `claude/*` branch at main, or populated husks recur, those still announce + restart and
  should be escalated against the harness.
- `worktree-health.mjs` now mutates git state (fenced) — it is no longer a pure detector; its
  fail-safe contract is unchanged (`--hook` always exits 0, never breaks a session).

## References

- ADR-0033 (worktree identity), ADR-0162 (SessionStart heads-up injection, onboarding cost),
  ADR-0110 (design-time ratification), ADR-0200 D3 (claim-gated workspace ceremony).
- `packages/cli/worktree-health.mjs` (+ `.d.mts`, `src/worktree-health.test.ts`),
  `.claude/settings.json` (hook order + git-resolved command), CLAUDE.md "Worktree slot NEVER
  created" bullet.
- Friction `session-worktree-never-created-branch-at-main` (the detector round);
  memory `worktree-not-provisioned-branch-at-main` (occurrence log).
