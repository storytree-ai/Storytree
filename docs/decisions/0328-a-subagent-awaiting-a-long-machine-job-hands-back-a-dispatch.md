---
status: accepted
decided: 2026-08-09
arc: session-cost-arc
amends: [323]
load_bearing: true
---
# ADR-0328: A subagent awaiting a long machine job hands back a dispatch handle, never a stall

## Status

accepted (2026-08-09) — the owner directed closing this capability gap in conversation on
2026-08-09, naming the gap, the two principles that must end up consistent with the answer, and the
instruction to establish the harness ground truth BY MEASUREMENT rather than from memory. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. The decision below is what the
measurement forced, not a discretionary fork — where a fork existed (guidance vs tool) it is named in
Consequences and its remaining half is parked, not silently taken.

## Context

`session-cost-arc` increment 2 (PR #1223) SURFACED a capability gap and explicitly declined to close
it. A delegated seat that dispatches a long machine job — `pnpm gate`, a CI run, a `--real` build, a
migration — appeared to have no honest way to wait for it, because all three available doors were
believed shut:

1. It cannot end its turn awaiting a notification — `asset:an-awaited-notification-is-not-a-turn-ending-state`.
2. A foreground bounded wait dies at the 10-minute tool ceiling — hit for real by the
   `guidance-curator` running #1223, whose CI bridge wait timed out while the background task it had
   dispatched completed fine.
3. `sleep N; tail` polling is RETIRED by ADR-0323 D2 and by `asset:mechanical-waiting-never-pays-context-rent`.

Two failure modes follow, and they are the two the corpus cares most about: a confident FALSE terminal,
or a dispatched check nobody read — which is unverified rather than passed
(`asset:unrun-check-is-unverified-not-refuted`).

### The measurement

The ground truth was established by running the harness, not by reading tool descriptions. Six probes
on 2026-08-09, all on this dev machine, with the raw observations retained in the session scratchpad.
The parent-side control and the parent-side cross-checks were taken by the main session, which is the
only party that can see whether a signal leaked upward.

| # | dispatcher → work | observed |
|---|---|---|
| control | main session → background Bash | completion notification received, exit code carried |
| A | subagent → background Bash | notification received **by the subagent**, status + exit code |
| D | subagent → child agent (Agent tool) | child's report received **by the commissioner**, `<result>` payload included |
| cross-check | main session | received **neither** A's job nor D's grandchild — no upward copy |
| E | subagent → slow child, **dispatcher then stops** | grandchild's notification surfaced **at the main session**, for an agent it never spawned |
| B | subagent → wait affordances | see below |

**The premise was half wrong, and interestingly wrong.** Door 1 is not shut. A subagent DOES receive
its own completion signals — for a background Bash job and for a child agent alike — and receives them
EXCLUSIVELY; no copy reached the parent. What is true is narrower and more useful: **delivery is
queued and flushed at a TURN BOUNDARY.** It rides the dispatcher's next round-trip. An agent that
stops taking round-trips is no longer addressable, and the signal then surfaces at the nearest
still-live ancestor (probe E, predicted in advance and confirmed).

That single mechanism RECONCILES the new evidence with the old rather than discarding it. The
July-2026 friction — `friction-background-subagent-reports-route-to-main`,
`friction-builder-agents-stall-awaiting-background-gate`, `friction-subagent-parks-awaiting-dead-subspawn`
— recorded real observations. Their MECHANISM was misdescribed. The corpus says a report "can route
past the agent that commissioned it", which reads as unreliable routing and implies nothing an agent
can do. The truth is that those agents had ENDED THEIR TURNS, which is the one thing an agent
controls. Same harm, different cause — and the cause is actionable where the old one was not.

**Probe B established what a subagent actually holds**, and corrected a plausible wrong answer this
investigation was itself carrying (that `TaskOutput(block=true)` is the honest bounded wait):

- **`TaskOutput` and `TaskGet` do not exist in a subagent runtime.** `ToolSearch "select:TaskOutput"`
  returns verbatim `No matching deferred tools found`; only `Monitor` and `TaskStop` load. They are
  parent-only. (Measured on a `general-purpose` subagent; may vary by agent type.)
- **The 10-minute ceiling is real, and the parameter that sets it is NOT VALIDATED.** Bash accepted
  `timeout` of 900000, 3600000 and even 100000000 (~27.7 h) with no error, then silently clamped:
  `sleep 660` under `timeout: 900000` died at exactly `10m 0s`. An agent can believe it holds a
  thirty-minute wait and be cut at ten, with nothing having refused it. By contrast `Monitor`'s
  `timeout_ms` IS validated (`must be <= 3600000`).
- **At the ceiling the behaviour is nondeterministic.** Two foreground calls of identical shape
  diverged: one was `moved to the background` and completed exit 0; one took SIGTERM (exit 143) with
  no task id, no background conversion, and no completion notification ever. The selector was not
  determined and is not asserted here.
- **`Monitor` IS available to a subagent and its events DO arrive** — all events delivered, none lost.
  Its 60-minute cap is the only single-arming affordance that outlasts a 20-minute job.
- A foreground timeout does not kill unrelated background work.

**The harm is not hypothetical.** Probe E's grandchild was told only to run a ~100-second command,
write a file and reply. Nothing suggested backgrounding. Of its own accord it backgrounded the sleep,
announced "Waiting for it to complete before writing the sentinel file", and ended its turn. The
sentinel file was never written; its work was simply lost. That is this failure mode occurring
spontaneously and unprompted inside a controlled run — the strongest available evidence that nothing
in the environment prevents it and nothing downstream detects it.

### What already exists, and what is actually missing

`scripts/gate-bg.sh` already solves the observability half for the gate: `GATE_BG_LOG` lets a caller
**pre-choose** the log path (l.50-51), and `$log.exit` carries the wrapped command's REAL status via
`${PIPESTATUS[0]}` (l.55, l.70) — deliberately not `$?` — with the contract gate-tested in
`packages/cli/src/gate-bg.test.ts`. A caller who knows that path can read a real exit code ONCE, with
no loop and no scraped predicate.

So the missing piece is not a mechanism and not a notification. It is a **handback contract**: nothing
says what an agent returns when the work outlives what it can honestly wait for, and nothing says what
the caller owes that return. Absent one, the agent picks between stalling and lying, and probe E shows
which it picks.

### The rule reached nobody, which is why prose alone would have changed nothing

Discovered while landing this decision, and more consequential than the wording it corrects:
**`asset:an-awaited-notification-is-not-a-turn-ending-state` was referenced by NO generated agent
file at all.** Not one of the ten rendered agents carried it, in any of the five harness
projections. `asset:mechanical-waiting-never-pays-context-rent` reached only `session-orchestrator`
(the main thread), which is the one seat that was never the problem. Both were authored, both were
correct in their prescription, and neither was in front of a single delegated seat.

That closes the loop on probe E's grandchild, which invented background-and-stall unprompted: nothing
told it not to. A rule reaches a spawned agent only once it is referenced from that agent's `rules` or
`antiPatterns` list, and `mechanical-waiting`'s own authoring pass said so explicitly while deferring
the wiring — "any agent that runs a long machine wait can pick it up when there is evidence it needs
it" (`asset:least-authority-tool-grants`: wire against a named step, not a hoped-for one). The
measurement in this ADR IS that evidence.

It also corrects one premise in the framing that commissioned this work. The seats were expected to be
*guidance-curator, librarian-curator, story-author, glue-worker, frontend-builder*. Measured against
their own artifacts, most of them never run the gate at all — `story-author` and `glue-worker` state
plainly that landing is the orchestrator's, and `librarian-curator` invokes no gate. The seat that
actually drives a long machine job is `frontend-builder` (`node build --real`), and its artifact was
silent on what to do while that run is in flight. So the blast radius is narrower than assumed, and
the wiring below follows the evidence rather than the expectation.

## Decision

**A long machine job is dispatched to the background, waited on only in bounded turns, and — when it
outlives the waiter — handed back as a DISPATCH HANDLE that the caller reads. A stall is never the
answer, and neither is a guess.** Four rules.

**D1 — The discriminator is TURN CONTINUATION, not routing, and the corpus is corrected in place.**
A completion signal reaches the agent that dispatched it, exclusively, provided that agent is still
taking turns; a dispatcher that stops is no longer addressable and its signal surfaces at the nearest
live ancestor. This REPLACES the "may route past the commissioner" premise wherever it appears.
`asset:in-session-subagent` (the definition, which is the origin of the bad premise and is cited as
evidence by the principle tier), `asset:an-awaited-notification-is-not-a-turn-ending-state`, and
`asset:mechanical-waiting-never-pays-context-rent` are corrected in place under ADR-0139. **No third
rule is authored on this axis** — the two principles already discriminate each other and the fix is to
their shared factual premise, not to their number. Both BEHAVIOURAL prescriptions survive the
correction unchanged, which is the test that they were right for a wrong reason rather than wrong.

**D2 — A long machine job is never held by a foreground call.** Dispatch it with the background
affordance first, always. The foreground ceiling is 10 minutes, the parameter that appears to set it
is not validated and clamps silently, and at the ceiling the job may be SIGTERMed with no notification
at all. A foreground call may WAIT on work; it may never be the only thing HOLDING it. Bound every
such wait comfortably under the ceiling and on the REAL terminal predicate — the process's own exit
status or a sentinel it writes, never a line scraped from its log
(`asset:a-probe-cannot-falsify-the-predicate-it-borrows`).

**D3 — Work that outlives the waiter is HANDED BACK, not waited out and not guessed.** The unit of
handback is a DISPATCH HANDLE: the pre-chosen sentinel path, the log path, and what the caller must do
to read the verdict. The dispatcher agrees that path IN ADVANCE (`GATE_BG_LOG=<path> pnpm gate:bg <command…>`,
which makes `<path>.exit` deterministic), so the handle is valid even though the dispatcher never saw
the result; the caller reads it with `storytree dispatch <handle>`. **A handed-back handle is UNVERIFIED until someone reads it**
(`asset:unrun-check-is-unverified-not-refuted`): it is neither a pass nor a fail, it must be reported
as dispatched-and-unread in those words, and the CALLER — which by construction is still taking turns
— owes the single read. This is the "dispatch, return early, let the caller read the verdict" shape,
and it is what makes stopping honest rather than negligent.

**D4 — Ending a turn is a legitimate move; ending it SILENTLY is the failure.** The rule that binds is
not "never stop" — a subagent whose job outlasts it SHOULD stop, and probe E shows the alternative is
losing the work. What is forbidden is stopping without saying what was dispatched, where its verdict
will appear, and that nobody has read it. This is `asset:an-awaited-notification-is-not-a-turn-ending-state`'s
existing remedy, restated with the one thing it lacked: somewhere for the result to be recovered FROM.

**D5 — The rule is WIRED to the seats with evidence, because an unwired rule is not guidance.** A
corrected artifact no delegated agent reads changes nothing, and this axis had been sitting in the
Library unread by every spawned seat. `asset:an-awaited-notification-is-not-a-turn-ending-state` is
wired to `guidance-curator` (which hit the ceiling for real on #1223, and is the seat in
`friction-subagent-parks-awaiting-dead-subspawn`), `frontend-builder` (the only seat that drives a
long machine job, and the seat in `friction-builder-agents-stall-awaiting-background-gate`), and
`graduation-synthesist` (the 2026-07-13 stall). `asset:mechanical-waiting-never-pays-context-rent` is
wired to `guidance-curator` and `frontend-builder` — the two that actually run or await machine work —
and NOT to `graduation-synthesist`, which does not. Wiring follows named evidence per
`asset:least-authority-tool-grants`; a seat that later shows the failure earns the rule then, and
seats fenced away from the gate entirely do not get it on speculation.

## Consequences

**Good.** The gap closes without a new rule and without new prose competing with the two principles
that already own this axis — the corpus's own repeated verdict on this shape (every prior friction
item routed `tool`, one routeReason noting that guidance "would have to be recalled at exactly the
moment an agent is least likely to consult it"). Delegated seats get a move that is honest at every
length: wait if you can bound it, hand back if you cannot, and in both cases the verdict is recoverable
from a real exit code rather than reconstructed. The correction also removes a premise that was
actively harmful: told the signal "may route past" them, agents had no reason to believe waiting would
ever work and every reason to improvise, which is what probe E's grandchild did unprompted.

**Bad / the honest costs.** The handback is a seam, and seams get dropped — a caller that does not
read the handle converts a green gate into an unverified one, which is strictly worse than a red
because it looks finished. D3 states the obligation but nothing enforces it, so this is discipline
today, and it is exactly the kind of discipline the friction record shows decaying. The handle also
costs a round-trip the old stall did not: the caller pays one read it would not otherwise have paid.
And D2 makes every long dispatch two steps where an impatient agent sees one.

**The wiring has a price this arc of all arcs must state.** D5 adds a long rule to three agents'
assembled guidance across five harness projections, and an agent's rules list is eagerly loaded on its
first turn — which is exactly the standing cost ADR-0323 D3 puts under budget. This is a real charge
against the thing this arc exists to reduce, taken deliberately: the alternative measured worse, since
an unwired rule costs nothing and buys nothing while the failure it prevents burns a whole lane plus a
manual nudge, and probe E shows agents reaching for the anti-pattern with no prompting at all. The
mitigation is the one D5 already applies — wire against named evidence, not against every seat that
might one day spawn — and the honest read is that this trades a small permanent input-side cost for
the removal of a recurring one. If a later measurement shows the preamble growth outweighing the
stalls prevented, D5 is the part to revisit first, and the rule bodies are the place to trim.

**The tool half is BUILT — `storytree dispatch <handle>` (corrected in place 2026-08-09, ADR-0139).**
This paragraph previously parked that capability as a separate increment, on the estimate that a
first-class handle needed a verb to mint the sentinel path, dispatch, print the handle, and be
generalised beyond `gate:bg` to `--real` builds and migrations. **That estimate was wrong, and the
error is worth recording because it is the same shape this ADR is about — a claim about a mechanism
made without measuring it.** The dispatch half ALREADY generalised: `scripts/gate-bg.mjs` forwards
`process.argv.slice(2)` into `scripts/gate-bg.sh`, which takes `"$@"` as its command, so
`pnpm gate:bg <any command…>` already backgrounds arbitrary work, already lets the caller pre-choose
the path via `GATE_BG_LOG`, and already PRINTS both the log and the exit-file — that printed pair is
the handle. Only the READER was missing.

So what shipped is the caller's half, which is where the honesty lives: `storytree dispatch <handle>`
reads a handle ONCE — no loop, no watch — and answers `PASS` / `FAIL` (with the command's real exit
code) or `RUNNING` / `UNVERIFIED`. The three unsettled states are structurally incapable of being
read as a verdict: a single `isVerdict` predicate admits only `passed` and `failed`, so a caller
cannot reach a pass by testing "not failed" — which is exactly the confident FALSE terminal D3
exists to prevent. A sentinel that exists but carries no parseable status reads `UNVERIFIED`, never
`FAIL`, because that is a failure to OBSERVE the job rather than a failure OF it
(`asset:unrun-check-is-unverified-not-refuted`). `gate-exceeds-one-foreground-tool-call`'s
instruction to fold "runnable AND observable" into ONE capability is therefore honoured rather than
split: runnable already existed, observable now exists, and the help text names both halves in one
place. `packages/cli/src/dispatch-handle.ts` holds the decision pure-by-injection; the read is
offline and holds no store, so a handle stays readable by whoever inherits it long after the
dispatching agent is gone — which is the whole point of a handback.

**Explicitly NOT decided here.** This does not weaken the gate, does not license skipping a check, and
does not make an unread handle count as a pass — D3 says the opposite in as many words. It does not
re-open ADR-0323 D2, which it amends rather than reverses: mechanical waiting still never pays
full-context rent, and `sleep N; tail` remains retired. And it asserts nothing about what selects
between the two ceiling behaviours in probe B; that was measured as nondeterministic and is left as
measured.

**Falsifiable, on the same terms ADR-0323 D4 set.** Every claim above is a harness observation and the
harness can change under us. If a later probe shows a subagent NOT receiving its own dispatch
notification while still taking turns, or shows a copy reaching the parent, D1 is wrong and the
correction it licenses must be reverted with it. The probes are cheap and the procedure is recorded.

## References

- `session-cost-arc` — the owning arc; `session-cost-arc-inc-02` surfaced this gap and declined to
  close it, which is what this ADR picks up.
- ADR-0323 — session cost is input-side context rent; D2 retires poll loops. Amended, not reversed:
  this extends it to the delegated case and adds the handback D2 had no need to name.
- `asset:an-awaited-notification-is-not-a-turn-ending-state` · `asset:mechanical-waiting-never-pays-context-rent`
  — the two principles on this axis, corrected in place per D1; neither's prescription changes.
- `asset:in-session-subagent` — the definition that ORIGINATED the "can leak to the top level"
  premise and propagated it into the principle tier; corrected in place per D1.
- `asset:unrun-check-is-unverified-not-refuted` — why a handed-back handle is unverified, not passed.
- `asset:a-probe-cannot-falsify-the-predicate-it-borrows` · `asset:an-observable-is-evidence-only-for-what-it-observes`
  — why a bounded wait's condition must be the real terminal predicate.
- `asset:pair-the-fence-with-the-affordance` — D3 and D4 are the fence that ships with D2's affordance.
- `scripts/gate-bg.sh` (l.50-55, l.70) · `scripts/gate-bg.mjs` · `packages/cli/src/gate-bg.test.ts` —
  the DISPATCH half: an arbitrary command backgrounded, a pre-choosable log path, and the gate-tested
  `.exit` sentinel carrying the command's own status.
- `packages/cli/src/dispatch-handle.ts` (+ `.test.ts`) · `packages/cli/src/dispatch-command.ts` — the
  READ half, `storytree dispatch <handle>`: the D3 handback made first-class, with `isVerdict` as the
  single predicate that keeps `RUNNING` / `UNVERIFIED` from ever being cited as an outcome.
- `friction-background-subagent-reports-route-to-main` · `friction-builder-agents-stall-awaiting-background-gate`
  · `friction-subagent-parks-awaiting-dead-subspawn` — the July-2026 evidence, re-explained rather
  than refuted by D1.
- `gate-exceeds-one-foreground-tool-call` · `friction-backgrounded-gate-has-no-reliable-completion-or-outcome-signal`
  — the tool-route precedent, and the fold instruction the parked increment must honour.
- ADR-0139 — correct-in-place; the operation D1 uses on all three artifacts.
- ADR-0110 — design-time alignment is ratification; why this is born accepted.
