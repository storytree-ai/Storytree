---
status: accepted
decided: 2026-08-16
amends: [276]
arc: shared-box-session-ownership-arc
---
# ADR-0376: A gate step reports whether its process tree is doing work, and never claims to know why not

## Status

accepted (2026-08-16). The owner chartered `shared-box-session-ownership-arc` with end state 4 stated
outright — *"a gate step that has stopped making progress is distinguishable from a slow one without
leaving the tool"* — and directed this session to drive the arc to close. This ADR records HOW that
end state is met, not whether to meet it; the design-time alignment is the ratification (ADR-0110),
so there is no second end-of-flow ask. It is the last of the arc's four end states.

## Context

`pnpm gate` had no per-step liveness signal at all. From outside the tool a WEDGED step and a SLOW
step produced the same observation — a step number that had not advanced — so the only way to tell
them apart was to leave the tool and read process CPU by hand (`Get-Process node | Sort-Object CPU`).
A session then either waited indefinitely on a run that would never finish, or killed one that would
have completed. Measured overlap when the friction
`concurrent-gates-on-one-dev-box-wedge-each-other-silently` was filed: three sessions gating at once,
four live on the notice board.

That hand-read is the same manoeuvre the rest of this arc exists to remove. ADR-0366 gave a session an
inventory of its own background work and ADR-0370 gave it a stop path that verifies, both on the
finding that a start-time heuristic over the process table reaches across sessions and destroys a
sibling's live work. End state 4 is the last surface still pushing sessions back to that table.

**Elapsed time is not the signal, and that is the whole design constraint.** Measured 2026-08-14: the
`pnpm -r --no-bail test` leg went ~10 minutes with NO new output while workspaces were genuinely
running, because `pnpm -r` buffers a workspace's output and prints it when that workspace finishes.
SILENCE IS THE NORMAL APPEARANCE OF A LARGE WORKSPACE MID-SUITE. A timer would therefore report the
healthy case and the wedged case identically — it would only restate the observation the reader
already had.

Two structural obstacles made this larger than its one-line framing, and both are why the entry sat
parked rather than being picked off:

1. **The runner could not emit a heartbeat at all.** `gate-run.ts`'s `executeStep` used `spawnSync`
   with `stdio: "inherit"`, which BLOCKS the event loop for the entire step. No timer fires, and there
   is nothing to hook. Any signal requires converting that to an async `spawn` — a change to the very
   runner (ADR-0276) every other change is judged by.
2. **Output bytes are not available as the progress measure.** `stdio: "inherit"` is load-bearing: the
   runner's own contract promises each check "prints exactly what it always did", and piping to count
   bytes would change colour handling and interleaving for every step in the plan.

## Decision

**D1. Gate steps are `spawn`ed asynchronously and awaited one at a time.** `executeStep` returns a
promise; `runGate` is `async` and its injected `execute` may return a promise. The walk stays strictly
sequential — steps share a working tree and a live DB, and parallelising them is a different unit with
different risks (`gate-run.ts`'s standing note). Nothing about the plan, the four statuses, the exit
codes or the summary changes. What changes is that the runner's event loop is now alive while a step
runs, which is the precondition for every other decision here.

**D2. The progress measure is the CPU burned by the STEP'S OWN process tree**, sampled once a minute
and reported as one line. CPU survives `stdio: "inherit"` untouched, which output bytes do not.

**D3. The sample is rooted at the step's child pid, not at the gate's.** The probe is itself a child
of the gate, so a sum rooted at the gate would include the probe's own `powershell.exe` / `ps` and
report ~1s of CPU every window — a permanent false PROGRESSING in the one module whose job is telling
working from stopped. Rooting at the step puts the probe structurally OUTSIDE its own measurement
rather than subtracted from it.

**D4. Three verdicts, and `idle` never says "wedged".** `progressing` (the tree burned CPU, or changed
shape), `idle` (alive, and doing nothing measurable), `unknown` (the measurement could not be taken,
or cannot support a claim). A process tree burning no CPU is BLOCKED — on I/O, a lock, a DB or network
wait — or WEDGED, and nothing here can tell those apart; saying "wedged" would license killing a step
blocked on a cold DB. The line names both readings and neither. What the signal *does* deliver is the
discrimination that was missing: `progressing` positively acquits the quiet-but-working case, which is
the common one and the one that cost the hand-read.

**D5. CPU is summed only across processes present in BOTH samples, and membership is compared as a SET
of pids rather than as a count.** A total over live processes is not a measure of work done: each
per-pid value is cumulative since that process started, so the total moves for two unrelated reasons —
work being done, and the tree's membership changing. Under `pnpm -r` the membership churns constantly.
Both halves of this were forced by measurement on a live `pnpm -r --no-bail test` (2026-08-16), where
the tree went 16 processes → 7 → 16 while the suite was demonstrably working:

- Summing across SURVIVORS makes the delta genuinely "work done inside this window by processes that
  lived through it", and monotonic by construction. Without it, a long-lived process joining the tree
  dumps its whole history into the delta as a burst of work that never happened, and a departing one
  subtracts its history as a stall.
- Comparing the pid SET catches a turnover a count cannot: a tree that swapped seven workers for seven
  others changed completely while its count never moved. An earlier count-based version of this
  printed `NO CPU PROGRESS` twice over exactly that stretch — a false alarm, and false alarms are how
  a signal like this gets ignored.

**D6. An ABSENCE of work needs a minimum window; evidence of work does not.** Below 30 seconds an
apparently-idle window reports `unknown` rather than `idle`. Measured, not chosen for tidiness:
proving the heartbeat against a real `pnpm -r typecheck` at a 5-second debug interval produced two
`NO CPU PROGRESS` lines on a step that was demonstrably healthy, because a working tree genuinely
idles for a few seconds between spawns while pnpm walks the workspace graph. Over a short window a
LULL and a STALL are the same reading. The asymmetry is the point.

**D7. The signal is REPORTING ONLY and fails soft in every direction.** It cannot red a step, cannot
stop one, and cannot throw into the runner: every probe failure returns a null reading with a note
that becomes `unknown`. This is an instrument bolted to a gate that CI runs, and an instrument that
can fail the thing it observes is worse than no instrument. `unknown` is a first-class outcome, never
quietly a pass — the same ADR-0328 D3 discipline `holdsLiveWork` (ADR-0366) and `own stop` (ADR-0370)
already apply.

## Consequences

The heartbeat prints from two minutes into a step and once a minute after, so **a step under two
minutes says nothing at all and costs zero probes** — the first timer never fires. That is deliberate:
the signal appears exactly where "has this stopped?" is a live question.

**The line interleaves with the step's own inherited output.** That is the accepted cost of leaving
`stdio: "inherit"` alone, and it is why the report is one line rather than a block.

**The probe costs a process-table read per sample** — ~4s on an idle Windows box via `Get-CimInstance
Win32_Process` (almost all of it PowerShell startup, not the query), negligible on POSIX via `ps`. At
a 60-second interval that is noise, and it is outside the measured subtree by D3 so it cannot pollute
the reading. A re-entrancy guard stops a slow probe from overlapping the next tick, which would
otherwise compare samples across the wrong window.

**The probe degrades under load, and the degradation falls the right way.** A full 12-step gate pushed
that read past 15 seconds twice in one run, which is why the budget is 45s. It is worth being explicit
about why a slow probe is tolerable rather than disqualifying: the probe is slow when the box is BUSY,
and a busy box is the healthy case. A genuine wedge means processes are NOT running, so the box is
quiet and the read is fast — the signal is most reliable exactly when it is being relied on. When it
does time out the answer is `unknown` with the reason, never a guess.

**No suite rung's verdict may depend on how loaded the box is.** The live-OS test asserts the module's
fail-soft CONTRACT — either a sane reading or a null carrying why, never a third thing — rather than
"the probe answered", because the first version of that test asserted the latter and went red inside
the very gate run that measured the timeout. That is this repo's own recorded trap (concurrent gates
manufacturing false reds) reproduced in miniature. It is not vacuous: a null with no note fails, as
does any throw, and the branch taken is printed.

**Converting the runner to async is the real risk taken here**, and it is taken knowingly: `runGate`
is what every gate verdict in the repo passes through. It is mitigated by the walk staying sequential
and by the runner's 51 unit tests, which now drive it through an awaited executor unchanged in every
other respect. `scripts/gate-bg.mjs` and every exit-code caller are untouched — the exit codes,
including the local-only 3 (SKIP) and 4 (PARTIAL), are computed by the same pure functions.

**What this does NOT close.** The signal sees only what the OS process table reports for the step's
subtree; a step blocked with no child processes at all reads as `unknown`, not `idle`. And the
`TaskStop` half of end state 3 remains HARNESS-owned and unfixable from this repo (ADR-0370), so the
arc closes with that one recorded reason rather than with every surface repaired — which is exactly
the closing rule its charter states: *"the arc closes when all four hold, or each holds a recorded
reason it does not."*

## References

- `shared-box-session-ownership-arc` — the charter, its four end states and the closing rule.
- ADR-0366 (`storytree own`, the inventory) and ADR-0370 (`own stop`, the verified reclaim) — end
  states 1 and 3, and the source of the `unknown`-is-not-a-pass discipline this reuses.
- ADR-0276 — the gate runner this amends: every step runs, four statuses, the exit rule.
- ADR-0328 D3 — a probe that could not answer is not a probe that said no.
- `packages/cli/src/gate-liveness.ts` (the pure classifier), `gate-liveness-probe.ts` (the OS read),
  `gate-run.ts` (the async executor and the heartbeat), `gate-runner.ts` (the awaited walk).
- friction `concurrent-gates-on-one-dev-box-wedge-each-other-silently` — the filing evidence.
