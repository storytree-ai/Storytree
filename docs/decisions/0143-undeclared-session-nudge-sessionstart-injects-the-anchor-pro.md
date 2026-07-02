---
status: accepted
load_bearing: true
decided: 2026-07-02
amends: [142, 33]
---
# ADR-0143: Undeclared-session nudge — SessionStart injects the anchor prompt and the gate warns

## Status

accepted (2026-07-02) — decided/directed by the owner in conversation on 2026-07-02 (ADR-0110). The
owner asked whether anchoring could be enforced at worktree/branch creation; this ADR records why
that altitude was rejected and what was chosen instead.

## Context

ADR-0142 made `noticeboard declare --node` take the work-time story claim — the wisp. But lighting
the wisp is still the session's deliberate act, learned from CLAUDE.md. The owner's ask: make it
structural — "gate worktrees and branches on declaring."

That altitude was examined and rejected:

1. **Remote sessions have no DB.** Web/VM sessions cannot open the Postgres data socket (443-only
   egress). A hard creation-gate on a live-store declare either blocks them entirely or fails open —
   and a fail-open gate is a nudge with extra steps.
2. **At creation time the story isn't known.** Orientation is pull-based (ADR-0023): orient first,
   then decide the unit. A creation-gate forces `nodes: []` theater or a guessed story — a dishonest
   wisp, exactly what ADR-0128's "the bare map is honest" call rejected.
3. **We don't own the creation paths.** Worktrees come from the Claude Code harness (chips, the
   desktop app), plain git, and the drive's own build machinery (`claude/real/*` promotion
   worktrees); a gate there is porous where it matters and breaks our own flows where it doesn't.
4. **Blocking session flow on presence infrastructure is the V1 scar** ADR-0033 encoded against —
   presence is advisory-by-construction, and `auditHookConfig` exists to keep presence commands off
   blocking hook events.

The deterministic hard point remains the SPAWN (ADR-0138 §3: "no claim, no subagent"), deferred
behind ADR-0137 Phase 3. What is missing until then is pressure between session start and the
landing ceremony.

## Decision

Two never-blocking mechanisms, replacing discipline with structure without a creation-gate:

1. **SessionStart injects the anchor prompt.** The ambient presence hook's `start` mode — which
   deliberately printed NOTHING (SessionStart stdout lands in the model's context) — now prints
   exactly ONE line when the session is a recognised `.claude/worktrees/*` worktree: the undeclared-
   session nudge naming the `noticeboard declare --working-on … --node … --pg` command and why
   (ADR-0142: the declare lights the story wisp). This is a deliberate, narrow amendment of the
   print-nothing contract: one static line, offline-computable (no store read), fail-silent, still
   never registered on a blocking event. The agent sees the ceremony as its first instruction every
   session; no re-reading CLAUDE.md required. Machine sessions (build leaves in generated worktrees)
   may see the same line; it is one line of inert context for a scoped leaf.
2. **The gate warns while undeclared.** A `check:declared` step (WARN-class, ALWAYS exit 0) joins
   `pnpm gate`, the same shape as `check:agents-sync`: SKIP when the cwd is not a session worktree,
   when DB creds are absent, or when the DB is unreachable; WARN when this session has no active
   node-anchored declaration on the board. A session can start work undeclared, but it cannot reach
   the landing ceremony without being told, by machine, at every gate run. CI is unaffected (the
   verify job is DB-free; the check lives in the local gate only).

The enforcement ladder is unchanged above this: build-claim hard-refusal (ADR-0121), the merge
ceremony + merged-branch guard (ADR-0142), and — when ADR-0137 Phase 3 lands — claim-at-spawn
(the `spawn-claim.ts` seam is built and waiting) as the true deterministic gate.

## Consequences

- Every interactive session is prompted to anchor itself at the moment it starts and reminded at
  every gate run — the two moments it is guaranteed to be listening — with zero new blocking paths
  and zero DB coupling at session start.
- The SessionStart print-nothing contract is narrowed, not abandoned: one static line, `start` mode
  only; `end` and `statusline` are unchanged, and the never-blocking-hooks audit still holds.
- A session that ignores both signals still lands only through the merge ceremony, whose guard and
  branch-clear (ADR-0142) keep the map honest either way.
- When claim-at-spawn lands (ADR-0137 Phase 3), the nudge and the warn become the soft edges of a
  hard gate rather than the only pressure.

## References

- ADR-0142 (claim-at-declare; the discipline this makes structural), ADR-0033 (advisory-by-
  construction presence; the never-blocking scar), ADR-0138 §3 (the spawn as the designed hard
  point), ADR-0137 (Phase 3), ADR-0128 (the bare map is honest — why no guessed declares).
- `packages/drive/src/ambient-presence.ts` (`undeclaredSessionNudge`),
  `packages/cli/src/ambient-presence-entry.ts` (the one-line print),
  `packages/cli/src/check-declared.ts` + the root `gate` script.
