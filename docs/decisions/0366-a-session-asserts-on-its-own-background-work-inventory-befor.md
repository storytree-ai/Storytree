---
status: accepted
decided: 2026-08-14
amends: [271]
arc: shared-box-session-ownership-arc
---
# ADR-0366: A session asserts on its own background-work inventory before it may go inert

## Status

accepted (2026-08-14) — decided/directed by the owner in conversation on 2026-08-14. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0271 D1 gave the merge ceremony a closing leg — residue, release claims, leave the worktree
committed-clean, debrief — and ADR-0275 forked its ending into continue-or-inert. Every clause of
that leg is about state the session can SEE: an arc row, a claim row, a git working tree. None of it
is about the processes the session started.

On this dev box those processes are the gap. Several sessions run concurrently, each spawning deep
pnpm / tsx / node trees plus detached servers, and nothing attributes any of it back to the session
that started it. Two failures compound out of that one gap:

**A session cannot enumerate what it still owns.** The harness notifies on a background task's
COMPLETION or its FAILURE, so a task that HANGS produces neither — it emits no signal at all, and
that silence is indistinguishable from "already notified and handled". `TaskList` enumerates the todo
list, not background shells (confirmed 2026-08-14: it answered `No tasks found` for a session holding
a completed background shell). The only record of a live job is a tool result that scrolls out of
context as the session grows. So a session can run every step of ADR-0271's leg, report itself INERT,
and still hold live work it has no way to discover.

**The cost is correctness, not tidiness.** `library artifact edit` is last-write-wins with no
detector, and both writers print success. A hung write that commits after its session has gone inert
therefore silently reverts whatever corrected the field in the meantime — reverting a field another
session had already fixed AND verified, leaving a corrupted artifact attributable to nobody.

And because nothing attributes a process to an owner, the only reclaim heuristic available is start
time, which reaches across sessions and kills a sibling's LIVE run. The sibling gets no signal about
why its work died and pays the wedged-versus-slow diagnosis from the other side. Measured when the
owning arc was filed: three sessions gating at once, four live on the notice board.

## Decision

**D1 — Long-running work registers its owner, in a per-session registry.** A process records itself
as one small JSON file at `~/.storytree/spawns/<sessionId>/<pid>.json` and removes that file on exit.
The session id is the ADR-0033 D1 worktree identity — the SAME identity the claim ledger and the
traversal capture already use, honouring the existing `STORYTREE_SESSION_ID` override — so there is
one answer to "who am I" and no second derivation that can disagree with the notice board.

A file per pid, not an append log: every session and every one of its parallel invocations would
otherwise append to one file, where an interleaved write tears a line that then reads as a lost
record. One file per pid makes a registration a single write to a path nobody else names.

Registration is FAIL-SILENT and identity-gated, like the delta footer and the traversal capture it
sits beside: no identity (the primary checkout, CI) registers nothing, and a write that throws leaves
the command untouched and merely uninventoried. It costs one `mkdir -p`, one small write and one
unlink, and **no extra `git` call** — the identity is the one the entry point already derived
(ADR-0162's startup budget).

**D2 — `storytree own` is the verb, and it is offline.** `storytree own` reports THIS session's
registered work; `--all` reports every session's, grouped by owner; `clear` forgets the records whose
process is gone. It reads no store and needs no database, because the question is asked at the END of
a session — precisely when a session must not depend on a DB being up to finish honestly.

**D3 — The closing leg asserts on that inventory.** ADR-0271 D1's third clause is extended: leave the
worktree committed-clean **and hold no LIVE background work**. A LIVE row means the session is still
running something and is NOT inert, however finished its code is; stop that work or wait for it, then
re-check. This is an ASSERTION, not a glance — the whole failure mode is a session that had no way to
look.

**D4 — UNKNOWN counts as LIVE.** A liveness probe that cannot answer is not a probe that answered no.
`holdsLiveWork` is the single predicate for "may I go inert?", and it admits an empty inventory only
when nothing is live AND nothing is unjudgeable — the same discipline ADR-0328 D3 applies to an
unsettled dispatch handle, for the same reason: folding a non-answer into a pass is how a confident
false terminal is manufactured.

**D5 — A leaked record is SIGNAL and is never swept by a read.** A record whose process is gone was
not de-registered, which happens exactly when that process was killed or crashed. It is the only
evidence a later session has that something died mid-flight, so it is reported as leaked and removed
only on request.

**D6 — The coverage limit is stated in the render, not left to be discovered.** Only REGISTERED work
appears: the storytree CLI, the gate runner, and — since the arc's
`spawned-work-is-attributable-to-its-session` entry — the two DETACHED launchers, `pnpm studio:up`
and `storytree desktop launch`, which register on their CHILD's behalf because the child is what
outlives the session. A harness background shell, a hand-launched server, a headless browser — none
register. So an empty inventory still means "nothing storytree started is still running", never "this
box is idle". An inventory that overstated its own coverage would recreate the exact false clear this
decision exists to remove, so the limit is printed every time rather than documented somewhere a
reader must already suspect the gap to go looking — and it is re-stated, not dropped, as the
registrar list grows.

**D7 — Reclaim is scoped by OWNERSHIP, never by start time.** `own --all` names the owning session of
every registered process, which is what replaces the start-time heuristic. `own clear` touches only
the invoking session's own records. None of the verbs in THIS decision kill anything: naming a
candidate is the whole contract. *(ADR-0370 later adds a verb that does stop processes —
`own stop` — and inherits this scoping as a structural fence rather than a convention: it can only
target the invoking session's own rows. The licence D7 withholds, to stop ANOTHER session's work, is
withheld there too.)*

## Consequences

A session can now answer "what am I still running?" with one offline verb, and the closing leg has
something to assert against instead of an assumption. The specific correctness failure that motivated
this — a hung `--pg` write committing after its owner went inert — is visible while it is still
happening: proved 2026-08-14, a backgrounded `arc show … --pg` appeared in `storytree own` as a live
row naming its pid, its command and its age.

**The inventory is a FLOOR, not a census, and that gap is real.** Three of this arc's four end-states
are untouched by this decision: attribution of arbitrary OS processes (a detached vite, a headless
browser) *(the detached-launcher half is narrowed by the arc's
`spawned-work-is-attributable-to-its-session` entry — `storytree desktop launch` now registers and
was proved end to end on this box; `pnpm studio:up` registers through the identical mechanism but its
live up/stop leg is unproven here; an arbitrary non-storytree process is still untouched either
way)*, the stop paths that report success while a detached child keeps its port *(closed for
storytree's own stop path by ADR-0370; `TaskStop` remains harness-owned and broken)*, and the
gate-step liveness signal *(closed by ADR-0376 — a step past two minutes now reports whether its own
process tree is burning CPU)*. Work that does not register is invisible here, and a session reading an empty
inventory as "the box is clean" would be drawing a conclusion D6 explicitly refuses to support. The
mitigation is that the limit is printed on every render; the risk accepted is that a reader ignores
it.

**PID REUSE is a known, unfixed limit.** A leaked record whose pid the OS has since handed to an
unrelated process reads as `live`. The window is small — records are removed on normal exit, so only
killed or crashed processes linger — and for THIS decision's read-only verbs the failure direction is
safe: it over-reports live work, which blocks an inert declaration rather than permitting a false one.
*(That safety argument is load-bearing only while nothing acts on the record. ADR-0370's `own stop`
does act on it, so the same window becomes a way to signal an unrelated process; it narrows the
window by never signalling a pid the probe reports dead, and records the remainder as an open limit
rather than inheriting this paragraph's conclusion.)*

**Registration is unconditional across CLI invocations**, including cheap ones. That is deliberate:
which command will hang is not knowable when it starts, and the measured hang on this box is the
cheap one (`library artifact edit --pg`). The cost is bounded to one small write and one unlink per
invocation, with no added `git` call.

**A killed gate leaves a record behind**, because the second Ctrl+C exits without unwinding. That is
not a defect: it is exactly what a leaked record means, and reporting it is how a session learns its
gate was killed rather than finished.

## References

- ADR-0271 (the closing leg this amends), ADR-0275 (its continue-or-inert fork), ADR-0303 (the
  escalation landing that reuses the same machinery).
- ADR-0033 D1 (worktree session identity), ADR-0162 (the startup budget registration respects),
  ADR-0328 D3 (the unsettled-is-not-a-verdict discipline D4 follows).
- Arc: `shared-box-session-ownership-arc` — end-state 1. Its other three end-states are open.
- Code: `packages/drive/src/spawn-registry.ts` (the registry + `holdsLiveWork`, re-exporting the
  record format from `packages/drive/src/spawn-record.mjs` — a plain-ESM module so a non-TypeScript
  caller can share one definition), `packages/cli/src/own.ts` (the verb), registration in
  `packages/cli/src/main.ts`, `packages/cli/src/gate-run.ts`, `scripts/studio.mjs` (the `pnpm
  studio:up` detached vite server), and `packages/cli/src/desktop.ts` (`storytree desktop launch`).
- Library: `merge-ceremony` (closing leg step 9c), `session-orchestrator` (workflow step 6c).
