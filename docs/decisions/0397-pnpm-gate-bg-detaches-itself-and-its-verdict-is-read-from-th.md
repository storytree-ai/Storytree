---
status: accepted
decided: 2026-08-21
arc: the-gate-costs-what-the-change-risks-arc
amends: [328]
load_bearing: true
---
# ADR-0397: pnpm gate:bg detaches itself, and its verdict is read from the handle

## Status

accepted (2026-08-21) — the owner directed driving `the-gate-costs-what-the-change-risks-arc` to a
close, and this is increment 6's own decision rather than a discretionary fork: the increment names
the fix shape in as many words ("spawn fully detached with the child's stdio bound to the log file
rather than inherited, and let the parent exit immediately whatever its own stdout is attached to"),
and forbids the alternative ("do NOT add a guard that detects a pipe and warns or refuses"). What
needed deciding, and is decided here, is the CONSEQUENCE that instruction carries and the increment
did not state: a launcher that returns before the job finishes cannot also report the job's status.

## Context

`pnpm gate:bg` did not background anything. `scripts/gate-bg.mjs` ran `scripts/gate-bg.sh` through a
`spawnSync` with inherited stdio and exited with its status, so the backgrounding was always the
CALLER's job — the harness's own background affordance, wrapped around it.

That works until the caller pipes it, and piping it is the obvious move, because the script prints
the log path a session needs. **Measured 2026-08-20: `pnpm gate:bg 2>&1 | tail -12` did not return.
It held the pipeline in the FOREGROUND for the full 600 s tool ceiling and survived only because the
harness kept the pipe open; a sibling session records the same shape SIGTERMing the run outright.**
That is `piping-gate-bg-defeats-its-detach-and-kills-the-run`, filed and reinforced twice, documented
in agent memory AND in the friction item — **and still hit on that session's first gate launch of the
day.** Documentation had two chances and took neither, which is the evidence that the remedy is code.

The second half of the same problem is the mirror of it. Having dispatched, a session that must not
proceed until the verdict lands had no verb — `a-lane-waiting-on-a-gate-parks-forever-with-no-supported-wait`.
The same session hand-rolled `until ls .gate-logs/*.log.exit >/dev/null 2>&1; do sleep 45; done`
THREE times. The likelier variant is worse: grepping the log for `GATE GREEN` / `GATE RED` reads a
verdict the gate never gave, because those strings appear inside TEST NAMES
(`gate-verdict-string-appears-in-test-names`). ADR-0328 D2 already names the rule that violates —
bound a wait on the process's own exit status or a sentinel it writes, **never** on a line scraped
from its log (`asset:a-probe-cannot-falsify-the-predicate-it-borrows`) — but named no verb that obeys
it.

### What was already right, and is left alone

`scripts/gate-bg.sh` is not the defect and is unchanged. It still tees every byte to the log and
still writes `<log>.exit` from `${PIPESTATUS[0]}` — deliberately not `$?`, which after the `tee`
pipeline reads tee's success — and `packages/cli/src/gate-bg.test.ts` still fences that line in CODE,
including under a copy with `pipefail` stripped. The **sentinel contract is untouched by this ADR**;
what changes is only who reads it and when.

`storytree dispatch <handle>` (ADR-0328 D3) is likewise unchanged and remains the ONE-SHOT read: the
right shape for a HANDBACK, where the dispatcher is gone and someone else reads the verdict later.

## Decision

**`pnpm gate:bg` dispatches and returns. The verdict lives in the handle, and reading it is a verb.**

**D1 — The launcher DETACHES, unconditionally.** `scripts/gate-bg.mjs` chooses the log path (still
`GATE_BG_LOG` first, so ADR-0328 D3's pre-chosen path is intact), prints the handle, and spawns the
wrapper `detached: true` with `stdio: "ignore"`, then `unref()`s it. The child holds no handle the
parent owns, so a pipe on the parent can neither keep it nor kill it. **There is no pipe detection,
no warning and nothing to override** (ADR-0352): a guard here would be tripped by the honest case —
wanting to see the banner — which is the case that was failing.

**D2 — Its exit code reports the LAUNCH, not the gate.** 0 = dispatched, 1 = failed to dispatch. A
launcher that returns before the gate has a verdict cannot report one, and pretending otherwise is
the false-green class this repo cares most about. **That class does not reappear here**, because the
two shapes are not confusable: the old failure was a command that ran for ten minutes and *then*
reported a status; this one returns in about a second printing the word DISPATCH. A launch that
creates no process is caught SYNCHRONOUSLY on `child.pid`, not by an `error` handler — after
`unref()` there is nothing keeping the event loop alive, so an async handler loses the race with
process exit and a failed dispatch would exit 0 having printed a handle to a log nothing will write.

**D3 — The verdict is `storytree dispatch <handle> --wait`, and it returns THE JOB'S OWN CODE.** It
blocks on the sentinel — the real terminal predicate, never a line from the log — and exits with the
status the job exited with, so the gate's reserved **3 (SKIP)** and **4 (PARTIAL RUN)** survive
intact rather than collapsing to a generic 1. This is the narrow reason `Envelope` gained an optional
`exitCode`: it is for a command REPORTING ANOTHER PROCESS'S result, and is not a general severity
channel.

**D4 — The wait is BOUNDED, and expiry is UNVERIFIED rather than a verdict.** Default 8 minutes,
ceiling 9 — both deliberately UNDER the 10-minute foreground ceiling ADR-0328 measured, never at it,
because at the boundary the behaviour is nondeterministic and one of the two observed outcomes is a
SIGTERM with no notification at all. A `--timeout` over the ceiling is **REFUSED**, never clamped:
silent clamping is precisely the harness behaviour that leaves a waiter believing it holds a wait it
does not hold. An expired bound exits **75**, a value the gate itself never returns, so "the wait
expired" cannot be read as a result the job gave; `isVerdict` still admits only `passed`/`failed`.

**D5 — This does not license mechanical waiting, and does not weaken ADR-0328 D3.** The handback
remains the answer when work outlives the waiter, and `asset:mechanical-waiting-never-pays-context-rent`
is unchanged. What D3 above permits is exactly what ADR-0328 D2 already permitted in as many words —
"a foreground call may WAIT on work; it may never be the only thing HOLDING it" — and under D1 the
wait holds nothing: killing the waiter kills no gate.

## Consequences

**A session can now read `gate:bg`'s banner.** The measured trap is removed at the write, so the
remedy needs no reader, no memory and no discipline — which is the only kind that survives the
evidence above.

**A caller that read `pnpm gate:bg`'s own exit code as the gate's verdict is now wrong, and this is
the one migration cost.** Nothing in the repo did — CI never invokes it, and `asset:merge-ceremony`
step 2 backgrounds it rather than branching on it. Agent memory recording that a backgrounded
`gate:bg` returns 0 on a red gate was already true for the harness's completion notification and is
simply true of the launcher now as well. `gate-runner.ts`'s note that a non-zero 4 is seen by
`scripts/gate-bg.mjs` was corrected in place (ADR-0139): what carries the 4 is the `.exit` file.

**Two states now exist where there was one, and they are distinguished by a code rather than by
prose.** 75 means the bound expired; anything else is the job's. The cost is one more number to know;
the benefit is that the unsettled case can no longer be reported as either verdict, which is what a
hand-rolled loop routinely got wrong.

**A detached child is a process this box now holds without a parent.** It registers itself the same
way (`storytree own`), and the closing leg's "hold no LIVE background work" assertion is what catches
it. This does not add an unobservable process; it makes an already-detached-in-practice run honest
about being one.

**What was deliberately NOT done.** No cap, throttle, queue or admission control on concurrent gates
(refused by the owner on `session-decoupling-arc`); no guard a legitimate change must argue with
(ADR-0352); and no second reader of the sentinel — `--wait` composes the existing pure
`readDispatchHandle` rather than re-parsing the file, so the "unverified is not a verdict" vocabulary
has exactly one implementation.

## References

- ADR-0328 — the dispatch-handle handback; D2's bounded-wait clause is what D3/D4 here implement, and
  D3's pre-chosen `GATE_BG_LOG` path is preserved. Amended, not superseded: its Context describes
  `gate-bg.sh`'s sentinel, which is unchanged.
- ADR-0352 — fix the write, do not detect the outcome (why there is no pipe guard).
- `scripts/gate-bg.mjs` (the detaching launcher) · `scripts/gate-bg.sh` (unchanged; the sentinel) ·
  `packages/cli/src/dispatch-wait.ts` (the bounded wait) · `packages/cli/src/dispatch-command.ts`.
- `packages/cli/src/gate-bg-launcher.test.ts` (detach + pipe + structural fences) ·
  `packages/cli/src/dispatch-wait.test.ts` (the bound, the codes, the racy non-answers).
- Friction: `piping-gate-bg-defeats-its-detach-and-kills-the-run`,
  `a-lane-waiting-on-a-gate-parks-forever-with-no-supported-wait`,
  `gate-verdict-string-appears-in-test-names`.
