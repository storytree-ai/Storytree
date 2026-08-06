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

**Correction ([ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** the nudge and
landing-time `check:declared` wall stand as feedback and defence in depth. The rejection of a
creation gate is overtaken for GENERIC WRITES by the repository-minted claim-first ceremony already
built in ADR-0200: ADR-0255 D1 **decides** that the primary checkout is a mechanically read-only
agent lobby, with a separate cross-harness pre-write authority guard refusing mutation before the
late gate. Ambient noticeboard hooks remain never-blocking; the authority guard is a different
surface. *(Precision correction 2026-08-02, decision unchanged, and corrected twice the same day as
increments landed. It first read "the primary checkout **is now** a mechanically read-only agent
lobby", which stated a DECIDED state as an achieved one. The repair then read "It is not enforced yet
… so today the nudge and the landing-time `check:declared` arm are the whole ratchet", which
increment 3 overtook hours later. Neither is true now. What holds: ADR-0257 increment 3 installed the
STATIC half of that wall on the developer machine, so a `Write`/`Edit`/`NotebookEdit` into the lobby
is refused before mutation there — the nudge and `check:declared` are no longer the whole ratchet for
file tools on that box. What does NOT hold, and — corrected a third time on 2026-08-02 — will NOT
come to hold: the guard is **not cross-harness** in force (Codex is untouched and unscheduled), no
layer binds a **shell**, and nothing is installed on any other machine. The claim-aware half is not
"unregistered" but **RETIRED and deleted** —
[ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) D2. So the
"separate cross-harness pre-write authority guard" this correction names **does not exist and is not
being built**; what exists is a static, claim-blind `permissions.deny` block on one machine. This
ADR's own two mechanisms are unaffected either way — and are, if anything, MORE load-bearing now, not
less. Read the build state from ADR-0284, which owns it, not from here and not from ADR-0257.)*

**Correction ([ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md) D2, per
ADR-0139 — 2026-08-06): the sentence directly above is no longer true, and this is the one place it
matters most. This ADR decided TWO mechanisms; ADR-0311 D2 retired the second.** `check:declared` was
removed from root policy and CI, so **only the SessionStart nudge remains as a live mechanism**. The
checker survives unwired at `packages/cli/src/check-declared.ts` and answers when invoked directly;
nothing invokes it on a merge path. Every claim below that an unclaimed session "cannot reach the merge
ceremony" is therefore overtaken — it can, and nothing stops it. **Nothing in this ADR is re-decided:**
the nudge stands exactly as decided, the rejection of a creation-time gate stands, and the reasoning
for both is untouched. What is withdrawn is the *enforcement* the later ADR-0200/ADR-0245 hardening
notes recorded — see the inline notes on Decision 2 and in Consequences. The net ratchet on the
developer machine is now the nudge plus ADR-0284's static `permissions.deny` block (file tools only,
one machine, claim-blind); read the build state from ADR-0284, which owns it.

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
   (ADR-0142: the declare lights the story wisp). **[Corrected 2026-07-16 per ADR-0200 D3, which
   amends this ADR: the nudge is re-aimed at the claim ledger — it now names `noticeboard claim
   <story> --grade exploring --intent "<why>" --pg` for a hand-opened session (the exploring claim
   is the hovering wisp) and the `worktree create` lobby ceremony for fresh workspaces; the
   presence half of `noticeboard declare` is retiring with the presence store. The
   SessionStart-injects-the-anchor mechanism below stands unchanged; only the command the one line
   names has moved.]** This is a deliberate, narrow amendment of the
   print-nothing contract: one static line, offline-computable (no store read), fail-silent, still
   never registered on a blocking event. The agent sees the ceremony as its first instruction every
   session; no re-reading CLAUDE.md required. Machine sessions (build leaves in generated worktrees)
   may see the same line; it is one line of inert context for a scoped leaf.
2. **The gate warns while undeclared.** A `check:declared` step (WARN-class, ALWAYS exit 0) joins
   `pnpm gate`, the same shape as `check:agents-sync`: SKIP when the cwd is not a session worktree,
   when DB creds are absent, or when the DB is unreachable; WARN when this session has no active
   node-anchored declaration on the board. A session can start work undeclared, but it cannot reach
   the landing ceremony without being told, by machine, at every gate run. CI is unaffected (the
   verify job is DB-free; the check lives in the local gate only). **[Corrected 2026-07-16 per
   ADR-0200 D3, which amends this ADR: `check:declared` was hardened from WARN-class to **FAIL** —
   a session that holds NO live claim now FAILs the gate (exit 1), so an unclaimed session cannot
   reach the merge ceremony rather than merely being warned. The check was also re-keyed off the
   retiring presence-declaration record onto the claim ledger (`events.node_claim`): it passes when
   the session holds ≥ 1 live claim of ANY grade (an `exploring` birth claim or a `work` declare
   claim both count, ADR-0200 D2). The SKIP arms (not a session worktree / no DB creds / DB
   unreachable / unexpected error → exit 0) and the CI-unaffected property stand unchanged. See
   `packages/cli/src/check-declared.ts`.]**
   **[Corrected 2026-07-26 per [ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md)
   D5.2, which closed one of those SKIP arms: "not a session worktree" no longer returns silently.
   `check:declared` asks a pure-git lobby question and **FAILs** on the conjunction
   `.claude/worktrees/` present AND *the primary checkout's tree is dirty*. The remaining
   SKIP arms (no DB creds / DB unreachable / unexpected error / any git failure) and the CI-unaffected
   property do stand: `.claude/worktrees/` is untracked, so a CI checkout or a plain clone is false on
   the conjunction and still skips silently. See `evaluateLobby` in
   `packages/cli/src/check-declared.ts`. **Re-corrected in place 2026-08-02**: this note read
   "*Before falling through*, … the strict conjunction *primary checkout* AND … — the one arm that
   reaches a session which, having no worktree identity, cannot hold a claim at all", which described
   the arm's original scoping and is no longer the shape of the code. The lobby question needs no
   session identity, so it no longer falls under the identity branch and no longer takes the caller's
   location as an input: it runs unconditionally, ahead of everything else, for **every** session, and
   its subject is always the primary checkout's tree (`git status --porcelain` runs with `cwd` set
   there, so a worktree's own dirt is never the subject). The old wording had it backwards in effect —
   it covered only a caller standing in the lobby, which since ADR-0257 made that checkout unwritable
   is the rarest shape there is, while every worktree session skipped the question. See ADR-0245
   D5.2's build note.]**
   **[RETIRED 2026-08-06 per [ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md)
   D2 — corrected in place per ADR-0139; the decision this ADR took is not re-decided. The whole of
   Decision 2 is now HISTORICAL: `check:declared` is no longer a step in `pnpm gate` or CI at all, so
   neither the original WARN, ADR-0200 D3's hardening to FAIL, nor ADR-0245 D5.2's lobby arm executes on
   any landing path. An unclaimed session CAN now reach the merge ceremony without being told. The two
   correction notes above remain accurate about the *code*, which survives intact and unwired at
   `packages/cli/src/check-declared.ts` — the predicates, the claim-ledger keying and the SKIP arms are
   all still there and still behave as described when the checker is invoked directly. What was removed
   is only the wiring that made it run. Re-adding it needs fresh production-catch evidence and a new
   ADR (ADR-0311 D5), never merely the wiring.]**

The enforcement ladder is unchanged above this: build-claim hard-refusal (ADR-0121), the merge
ceremony + merged-branch guard (ADR-0142), and — when ADR-0137 Phase 3 lands — claim-at-spawn
(the `spawn-claim.ts` seam is built and waiting) as the true deterministic gate.

## Consequences

- Every interactive session is prompted to anchor itself at the moment it starts and reminded at
  every gate run — the two moments it is guaranteed to be listening — with zero new blocking paths
  and zero DB coupling at session start. *(Half OVERTAKEN 2026-08-06 per ADR-0139: ADR-0311 D2 retired
  `check:declared`, so the gate-run reminder no longer fires. **One** of the two moments survives —
  SessionStart — and it is now the only machine reminder a session gets.)*
- The SessionStart print-nothing contract is narrowed, not abandoned: one static line, `start` mode
  only; `end` and `statusline` are unchanged, and the never-blocking-hooks audit still holds.
- A session that ignores both signals still lands only through the merge ceremony, whose guard and
  branch-clear (ADR-0142) keep the map honest either way.
- When claim-at-spawn lands (ADR-0137 Phase 3), the nudge and the warn become the soft edges of a
  hard gate rather than the only pressure. **[Corrected 2026-07-16 per ADR-0200 D3: the gate rung
  is no longer merely a warn — `check:declared` now FAILs an unclaimed session, so the hard gate at
  the landing ceremony already exists; the nudge remains the soft edge above it.]**
  **[RE-CORRECTED 2026-08-06 per ADR-0139 — ADR-0311 D2 withdrew that hard gate. There is no longer a
  `check:declared` rung at the landing ceremony in any form, so the 2026-07-16 note above is HISTORICAL:
  the nudge is not the soft edge above a hard gate, it is the only edge. This bullet's original
  conditional — that a real hard gate arrives with claim-at-spawn (ADR-0137 Phase 3) — is once again
  the accurate statement of where one would come from.]**

## References

- ADR-0142 (claim-at-declare; the discipline this makes structural), ADR-0033 (advisory-by-
  construction presence; the never-blocking scar), ADR-0138 §3 (the spawn as the designed hard
  point), ADR-0137 (Phase 3), ADR-0128 (the bare map is honest — why no guessed declares).
- `packages/drive/src/ambient-presence.ts` (`undeclaredSessionNudge`),
  `packages/cli/src/ambient-presence-entry.ts` (the one-line print),
  `packages/cli/src/check-declared.ts` + the root `gate` script.
