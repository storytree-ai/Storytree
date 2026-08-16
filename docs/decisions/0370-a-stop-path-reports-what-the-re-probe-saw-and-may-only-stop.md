---
status: accepted
decided: 2026-08-14
amends: [366]
arc: shared-box-session-ownership-arc
---
# ADR-0370: A stop path reports what the re-probe saw, and may only stop its own session's work

## Status

accepted (2026-08-14). The owner chartered `shared-box-session-ownership-arc` with end state 3 stated
outright — *"the documented stop path actually stops what it names, including a detached child
holding a port — or reports honestly that it did not"* — and directed this session to drive the arc.
This ADR records HOW that end state is met, not whether to meet it; the design-time alignment is the
ratification (ADR-0110), so there is no second end-of-flow ask.

## Context

ADR-0366 gave a session an INVENTORY of the background work it owns (`storytree own`) and made the
ADR-0271 closing leg assert on it before the session may call itself inert. That closed end state 1
and deliberately closed nothing else: seeing work is not reclaiming it.

The reclaim path a session is actually told to use is measurably dishonest. Friction
`taskstop-kills-the-wrapper-and-leaves-the-detached-child-holding-the-port`: `TaskStop` terminates the
shell it launched, the detached node process that shell spawned keeps running and keeps its listening
port, and the call reports SUCCESS. The success message is what stops anyone checking, so the leak
survives until a later session collides with the held port and goes hunting the process table — the
manoeuvre this arc exists to make unnecessary. Doing the documented right thing still leaks.

Two forces pull in opposite directions, and getting either wrong is worse than the status quo.

**Under-reporting.** A stop verb that concludes from the SIGNAL it sent inherits the exact defect it
was built to fix. Delivering a signal is evidence the request was accepted, never evidence the
process died. On Windows this is not a corner case: `taskkill /T` without `/F` sends `WM_CLOSE`,
which a console process ignores, so the polite rung routinely does nothing at all while returning
success. Measured here on a real 8-process gate tree — the graceful rung left every process running
and the outcome was only reached on the forced rung.

**Over-reaching.** The other failure is worse, because it destroys someone else's work rather than
misinforming your own. With no ownership signal to filter on, the only reclaim heuristic available is
start time, and start time reaches across sessions. Measured when the arc was filed: three sessions
gating at once, four live on the notice board. A sweep kills a sibling's live run and the sibling
gets no signal about why its work died — it pays the wedged-versus-slow diagnosis from the other
side, blind. This is the one cluster on the friction board whose failure mode is DESTROYING ANOTHER
SESSION'S WORK.

The registry ADR-0366 built is what makes a non-heuristic answer possible: ownership is a directory
name, so "my work" is a listing rather than a guess about a command line.

## Decision

**D1 — The verdict comes from the re-probe, never from the signal.** A stop runs a ladder — probe,
graceful, wait, probe, force, wait, probe — and reports what the liveness PROBE said at the end. The
terminator's return value is not consulted as a verdict at all, in either direction: a delivered
signal does not make a stop successful, and an undeliverable one does not make it a failure (a
`taskkill` at an already-dead pid exits non-zero, which is not a failure to stop). Escalation is
conditional, so a process that dies politely keeps the exit handlers that de-register its own record
and flush what it was writing.

**D2 — Four outcomes, and only one of them is success.** `stopped` (a re-probe confirmed it is gone),
`already-gone` (it was dead before anything was signalled — a stale row, not a kill), `still-running`
(confirmed alive after the forced rung), `unconfirmed` (the probe could not answer). `unconfirmed` is
NOT a success: an unanswerable probe is not a probe that said yes, which is the ADR-0328 D3 discipline
`holdsLiveWork` already applies to `unknown`. Anything that leaves work running exits non-zero, so a
stop that under-delivered cannot read as success to a script.

**D3 — A session may only stop its own rows, and this is structural rather than advisory.** Targets
are resolved from the invoking session's own inventory; a pid belonging to another session is never a
candidate. A refused pid is ATTRIBUTED — the report names the owning session — because attribution is
what makes a start-time guess unnecessary rather than merely discouraged. Cross-session reach is not
policed here; it is unrepresentable, because the candidate set is one session's directory.

**D4 — The unit is the process TREE, not the pid.** The registered pid is usually a shim (`pnpm` →
`tsx` → `node`), and killing it alone orphans the child holding the port — reproducing the reported
bug inside the verb built to fix it. Windows uses `taskkill /T`; POSIX signals the process GROUP and
falls back to the bare pid when the process is not a group leader, because stopping one process beats
stopping none and D1's re-probe reports the shortfall rather than hiding it.

**D5 — A registry row is cleared only on a CONFIRMED death.** Removing a row is the one action here
that can hide work, so it happens exactly when the process is provably gone — never on
`still-running` or `unconfirmed`. A failed stop must leave the row standing, or the next inventory
reports a clean bill over a process that is still writing, which is the false clear ADR-0366 exists
to remove.

## Consequences

A session can now finish honestly: `storytree own` names what it holds and prints the reclaim line
already typed out, `storytree own stop <pid>` reclaims it, and the ADR-0271 closing leg has an action
to take when its ADR-0366 assertion fails rather than only a fact to report. Proved end to end rather
than asserted: a live 8-process gate tree was stopped whole (all eight verified gone, the row
cleared), and an attempt at a concurrently-running sibling's gate was refused, attributed by session
name, and left that gate running — confirmed still progressing afterwards.

**A forced stop leaves a leaked record by construction**, and that is intended. The victim had no
chance to de-register, so the row it leaves is retired by the stopper on EVIDENCE (D5) rather than on
the assumption that the signal worked.

**The pid-reuse window from ADR-0366 is unchanged and now has teeth.** A leaked row whose pid the OS
has re-handed reads as live, and stopping it would signal an unrelated process. D1's rung 0 narrows
this — nothing is ever signalled at a pid the probe reports dead — but the window is not closed, and
closing it needs a start-time or handle check the registry does not record today.

**Coverage is still only what registered.** `stop` inherits ADR-0366's limit exactly: a tree that
registered nothing is invisible here and therefore unstoppable. The arc's
`spawned-work-is-attributable-to-its-session` entry closed the DETACHED-LAUNCHER half of that — `pnpm
studio:up` and `storytree desktop launch` now register their child on the same registrar this stop
ladder already reads, so both are candidates for `own` and `own stop` rather than invisible to them.
Proved by D1's own standard, the re-probe rather than the signal, for the Electron path only:
launched, listed by `storytree own`, then `own stop` walked the tree down through `electron.exe`,
confirmed gone. The studio path shares the identical registrar and is covered by unit tests, but its
live up/stop leg is UNPROVEN here — a sibling session held :5173 at review time, and clearing it to
test would have been exactly the cross-session kill D3 forbids — so "registered" for `pnpm studio:up`
means mechanism-covered, not yet re-probe-confirmed. What remains outside either way is work
storytree did not start: a harness background shell, a hand-launched server, a headless browser. So
an empty inventory still means "nothing storytree started is still running", never "this box is
idle".

**`TaskStop`'s own half remains broken and is not ours.** The harness owns it and it cannot be fixed
from this repo — measured, not inferred (ADR-0366). What is now true is that storytree's OWN stop
path no longer has the defect, so there is a correct path to point at.

**Not closed by this ADR:** end state 2 (attribution for arbitrary OS processes) and end state 4
(gate-step liveness). *Both have since closed — end state 2 by the arc's
`spawned-work-is-attributable-to-its-session` entry (PR #1361, the detached studio and Electron spawn
paths now register), and end state 4 by ADR-0376 (a gate step past two minutes reports whether its own
process tree is burning CPU). What remains open is not an end state but the two limits named above:
`TaskStop` is harness-owned, and only work that REGISTERS is visible.*

## References

- ADR-0366 — the inventory this amends, and the closing-leg assertion it gives an action to.
- ADR-0271 D2 / ADR-0275 — the closing leg and the continue-or-inert fork.
- ADR-0328 D3 — unknown is not a pass; the discipline D2 applies to `unconfirmed`.
- ADR-0033 D1 — the worktree identity that keys ownership.
- `packages/drive/src/spawn-stop.ts` (+ `.test.ts`) — the ladder, the fence and the real terminator.
- `packages/cli/src/own.ts` (+ `.test.ts`) — `storytree own stop`.
- Friction: `taskstop-kills-the-wrapper-and-leaves-the-detached-child-holding-the-port`,
  `a-process-list-on-a-shared-dev-box-carries-no-session-ownership`.
