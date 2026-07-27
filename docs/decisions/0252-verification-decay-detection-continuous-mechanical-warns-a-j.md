---
status: accepted
decided: 2026-07-26
arc: verification-integrity-arc
---
# ADR-0252: Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session

## Status

accepted (2026-07-26) — decided/directed by the owner in conversation on 2026-07-26. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. This settles the OPEN OWNER FORK
the `verification-integrity-arc` charter named as blocking its close: the detection-and-cleanup
process's **trigger and shape**. At charter time the owner leaned toward "something like the librarian
pass" and said explicitly they had not decided; this ADR is that decision.

## Context

The arc's charter was built on a four-instrument audit of the 60k-LOC codebase (2026-07-26) that found
essentially no code slop and found every serious defect in the **proof layer** instead. The common
property of those defects is that **none of them can ever go red**: a stale oracle report, a vacuous
test, and two drifted mirror surfaces all look identical to a healthy system from the outside. Nothing
routine surfaces them, which is why the charter required a recurring detection pass rather than only
one-off fixes.

Two measurements from that audit constrain what the pass may be, and they pull in opposite directions.

**Metrics alone are wrong about the specific defect roughly three times in four.** Three of the audit's
four headline aggregate findings were REFUTED under adversarial verification. A metric threshold
therefore cannot itself be a finding, and a gate that BLOCKS on these signals would be wrong on the
measured evidence — not merely over-cautious.

**But the metrics were right about the REGION every time**, and each adversarial dive then found real
defects the aggregate had missed entirely: the 87 missing ADR badges, the `UserRole` gap, the
path-prefix check, and the vacuous ADR-0237 proof. So neither half stands alone. **Two-phase —
mechanical sweep to LOCATE, adversarial refutation to ESTABLISH — is the instrument**, and either half
by itself is misleading rather than merely incomplete.

Increment 1 (ADR-0249) added a third force. The forged-verdict path was invisible to the shipped test
suite because *reuse across observations was the mechanism* — the class could not be seen from inside a
single per-unit test. That is a direct argument for a sweep that looks ACROSS surfaces, not for a deeper
test within one.

Against that sits the arc's own guardrail — *an advisory list stays readable or stops being advisory* —
and the live counter-example: `check:coverage` already carries a 121-contract WARN backlog with known
noise in it. An unbounded advisory list is this shape's known failure mode, not a hypothetical one.

Verification decay also accrues over weeks, so a deep pass on every merge would burn heavily on nothing.

## Decision

The process **splits by cost**. Four owner calls, recorded as answered.

**1. Trigger — continuous mechanical warns, plus a deep adversarial pass that is judgment-gated at arc
close.**

The cheap mechanical checks run on **every** `pnpm gate`: mirror-pair drift, vacuous-proof detection,
WARN-list hygiene, and contract-binding drift.

The expensive adversarial pass has **no calendar cadence**. It fires at **arc close**, and only when
the orchestrator closing the last leg **judges it warranted** — the owner rejected all three cadences
offered (monthly-or-arc-close, monthly, arc-close-unconditionally) in favour of this. A warn signal
crossing a line escalates the deep pass early, and that escalation is the **backstop for the skip risk
that judgment-gating introduces**: a judgment gate can decline indefinitely, so the continuous half
must be able to force the question.

**The deep pass is ALWAYS cut as a FRESH SESSION** — never an in-session subagent of the closing
session. Two reasons, both load-bearing:

- An orchestrator auditing the increment it just landed is the conflict-of-interest case. Increment 1's
  own lesson generalises here: *a cross-check against evidence of unknown provenance is not
  fail-closed*, and a session's judgment about its own work is exactly that kind of evidence.
- The pass is expensive — the chartering audit ran ~1.2M tokens. It needs its own context and budget,
  not the tail of a session that has already spent most of both.

**2. Shape — the cheap half lives in `pnpm gate` as non-blocking warns.**

Alongside `check:agents-sync`, `check:corpus-sync`, and `check:coverage`, which already carry exactly
this warn-not-block pattern. Every session sees it with no new invocation to remember. The accepted cost
is added noise in a gate output that is already noisy — which decision 3 exists to bound.

**3. Enforcement — advisory per finding, with a fixed drain ceiling on the COUNT.**

No individual **located** finding ever blocks a landing; on a ~75% false-positive rate that would be
wrong on the evidence. (This governs located regions — heuristic signals with a false-positive
surface. The narrow escalation class decision 1 provides for is not a located region, is not counted
against this ceiling, and does red the gate on its own; see the second correction below.) But the gate
**FAILs when the backlog count grows past a fixed ceiling** — the same shape as
`check:friction-drain` (ADR-0168 D4). This is the concrete answer to the arc's guardrail: the list
cannot silently grow into `check:coverage`'s condition, because growth is what reds the gate.

**The ceiling is tuned on the first real sweep, not picked in advance** — set just above whatever that
sweep actually finds, so it starts GREEN and any subsequent growth reds it. This gives an honest
baseline rather than an arbitrary number, and the ceiling can only ever be tightened.

**4. Home — a Library `process` artifact, in the librarian-curator mould.**

A named, versioned way-of-working the orchestrator invokes; not a new agent (the roster is already 14
roles) and not an unattended scheduled job (nobody would be in the loop to judge findings, and the
cost is not one to spend unwitnessed).

**What the process artifact must carry**, because these are the audit's transferable instrument and not
incidental detail:

- The **two-phase discipline** — mechanical sweep to locate REGIONS, adversarial refutation to establish
  whether a defect is real. Never one without the other.
- **A metric threshold is never itself a finding.**
- **Adversarial verifiers default to REFUTED** and must state a concrete failure scenario as *inputs to
  wrong outcome* before a finding stands.
- The instruction that the pass runs in a **fresh session**.

## Consequences

**Good.** Verification decay is found by machinery rather than by an owner noticing it in the running
app. The per-gate cost is near zero, so the continuous half is affordable at every merge. The expensive
half is spent only when someone with the closing context believes it will pay, and it is spent in a
session with the budget to do it properly. The drain ceiling means the advisory list has a defined
failure boundary instead of degrading silently. And a blocking gate — which the evidence says would be
wrong — is avoided without giving up enforcement entirely.

**Bad, and accepted.** The judgment gate can be declined indefinitely; the warn-escalation backstop
mitigates this but does not remove it, and it will need watching in practice. Gate output gets noisier.
Fresh-session cutting means the pass's findings arrive disconnected from the session that triggered it,
so the arc's increment log carries more of the continuity burden.

**Correction (2026-07-27, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
a predicted cost above did not occur, and the prediction is removed rather than left to be calibrated
to.** This ADR listed among the accepted bads that "the ceiling cannot be set until the first sweep
exists, so the enforcement half lands strictly after the detection half — the checks ship advisory-only
for at least one interval, which is briefly the very failure mode decision 3 guards against." The
first implementing increment (`check:verification-decay`, `packages/cli/src/check-verification-decay.ts`)
**ran its own first sweep and baselined the ceiling in the same landing** — `DRAIN_CEILING = 5`, the
exact count that sweep located, so it shipped GREEN on an honest baseline with enforcement live from
the first commit. The advisory-only interval was never paid. **Decision 3 is unchanged in every
respect** — advisory per finding, fail-closed on the count, ceiling *tuned on the first real sweep and
never picked in advance*; what is corrected is only the assumption that "tuned on the first sweep"
implied a second, later landing. It does not: a sweep is cheap enough to run and read inside the
increment that builds it.

**Correction (2026-07-27, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
decision 3's opening sentence was overtaken by decision 1's backstop landing, and is scoped rather
than reversed.** It read "No individual finding ever blocks a landing"; the word **located** is added,
with a parenthetical naming the escalation carve-out. The warn-escalation backstop
(`packages/cli/src/verification-decay.ts`, 2026-07-27) declares one class of finding that DOES red the
gate by itself — an instrument that failed to run — so the sentence was, read literally, no longer
true. **Nothing is re-decided.** Decision 3 is unchanged in substance: advisory per located finding,
fail-closed on the count, ceiling tuned on the first real sweep. Decision 1 always required that "a
warn signal crossing a line escalates the deep pass early", so the escalation is decision 1 being
implemented, not decision 3 being weakened — and the two are deliberately independent mechanisms with
different remedies (a PASS versus a DRAIN), which is why an escalation is excluded from the counted
total and cannot be discharged by raising the ceiling. The reasoning behind ~75% false positives still
governs every heuristic located region, none of which blocks anything. Recorded here because a reader
of decision 3 alone would otherwise conclude the shipped escalation VIOLATES this ADR and "fix" it by
removing the red — the exact stale-prose harm ADR-0139 exists to prevent.

**Correction (2026-07-27, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
decision 3's singular "the COUNT" was overtaken by the second chartered instrument landing, and is
scoped rather than reversed.** D3 was written while exactly one instrument existed, so it says "a
fixed drain ceiling on the COUNT" and "the ceiling", and the correction above names a single
`DRAIN_CEILING = 5`. The ceiling is now **per instrument** (`DecayInstrument.ceiling`;
`evaluateDecayCeiling` reds the gate when ANY instrument exceeds its OWN ceiling, while the summed
total is still reported and never enforces). That 5 survives unchanged as `contract-binding-drift`'s
own ceiling; `mirror-pair-drift` baselined at 10 on its own first sweep. **No ceiling was raised, and
nothing is re-decided** — enforcement is still on the COUNT and never on the finding, still fail-closed
on growth, still baselined on a first real sweep and tightening-only, and escalations are still
excluded from every count.

**The split is what KEEPS decision 3 true, not a departure from it**, and the evidence is measured
rather than argued. Under one shared total: (a) a second instrument's honest baseline of 10 arrives as
pure growth and reds the gate on landing, so the cheapest way to add one of decision 1's remaining
chartered instruments is to weaken it until it finds little — a mechanism that pays you to look less,
operating inside the machinery built to fence exactly that; and (b) unrelated backlogs become
fungible — injecting an 11th mirror pair while repairing one contract binding gives 15 located against
a summed ceiling of 15, so a single global total passes **GREEN** over a repo that just grew a new
unobserved mirror, where per-instrument stays RED. "Growth is what reds the gate" is decision 3's
decided property, and only the split preserves it. Two further readings point the same way: decision 3
names `check:friction-drain` (ADR-0168 D4) as its shape, and that check's ceiling is already TWO
independent thresholds (open-count N, oldest-age M) each redding on its own and never summed; and
"tuned on the first real sweep" cannot be satisfied for instruments 2–4 by a number baselined on
instrument 1's sweep, so that rule only carries meaning per instrument. Recorded here because a reader
of decision 3's singular "the COUNT" would otherwise conclude the shipped split VIOLATES this ADR and
"fix" it by re-summing — the exact stale-prose harm ADR-0139 exists to prevent.

**Not decided here.** Which specific checks make up the cheap half beyond the four named, how a warn
signal "crosses a line" in precise terms, and the ceiling's actual number. Those are build-time
decisions for the increment that implements this, not owner forks. All three have since been taken in
code rather than in a further ADR, exactly as intended. `packages/cli/src/verification-decay.ts` (the
pure judge) and `packages/cli/src/check-verification-decay.ts` (the disk-reading entrypoint) are where
they are recorded and reasoned — including which of the four cheap checks is and is not yet swept,
which is now a machine fact printed on every run (`chartered coverage: N/4 … NOT swept: …`) rather
than a source comment somebody must remember to update.

On the third — the **"crosses a line" warn-escalation backstop**, the one that matters because it
covers the skip risk decision 1's judgment gate introduces — the shape is settled and the backstop is
**partly built**; the source, not this ADR, is its record. Two build-time calls fixed its form: a line
is a property of the SIGNAL and never of the clock (decision 1 rejected all three cadences offered, so
an age-keyed line would smuggle the rejected calendar back under a slower name), and escalating is not
adjudicating — an escalation asserts an obligation to LOOK, never that a defect exists.

Exactly **one** line is declared today: an instrument that FAILED TO RUN, where the sweep went blind
and its silence is therefore not evidence. It reds the gate independently of decision 3's ceiling and
is EXCLUDED from the counted total, so raising `DRAIN_CEILING` can never discharge it — its remedy is
a PASS, not a DRAIN. Lines keyed to a signal's AGE, or to a count of arc-closes that declined the
pass, are **NOT built**: both need persisted per-signal state this deliberately-stateless sweep does
not have. The residual is therefore real and worth stating plainly — the skip risk is covered for the
blind-instrument class only, and a signal that merely sits unexamined still escalates nothing.

**Correction (2026-07-27, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
the two unbuilt lines above are a fork now TAKEN, not work still pending — read
[ADR-0256](0256-deferral-keyed-escalation-lines-are-not-built-a-backstop-s-t.md) before treating them
as a backlog.** The facts above are unchanged and remain true: the backstop still declares exactly one
line, and the age-keyed and decline-count-keyed lines are still not built. What is corrected is the
*reading* the words "partly built" and "**NOT built**" invite — that the remaining two are queued
implementation. They were carried forward unchanged across four increments (#955, #956, #963, #965) on
exactly that reading. ADR-0256 settles the fork, and settles it **against** building either: the
deciding property is the DIRECTION of the record — a record written to CLEAR a condition is fail-closed,
one written to TRIGGER a condition is fail-OPEN, and both candidates need a trigger-record written by
the party the backstop fences — so they are not expensive, they are structurally incapable of being
backstops. **Nothing in this ADR is re-decided**: ADR-0256 takes a decision this section explicitly
declined to take, which is why its edge is `amends` and not `supersedes`. ADR-0256 was **ratified by
the owner on 2026-07-27** and is `accepted`, so the fork is settled outright: this section's stated
residual is now **permanent and owner-accepted** rather than pending. Read it as a closed decision, not
as a backlog item to pick up.

**Unblocks.** This was the last named blocker on the `verification-integrity-arc`'s close. What
remained *at decision time* was implementation only — the process artifact, the cheap checks, the
ceiling, and the three-or-four durable guardrails still held for the `guidance-curator`. The CURRENT
state of that work is the arc's increment log (`storytree arc show verification-integrity-arc --pg`),
never this ADR: an ADR is a decision record, not a work tracker (ADR-0183 D1).

## References

- `arc:verification-integrity-arc` — the charter that named this fork, and the audit evidence behind it.
- ADR-0249 — increment 1; the demonstrated signed-verdict forgery, and the source of the
  *unattributable-evidence-is-not-fail-closed* reasoning reused above.
- ADR-0211 — the assert-oracle protocol ADR-0249 amends; the vacuous-proof instrument targets this class.
- ADR-0168 D4 — `check:friction-drain`, the drain-ceiling pattern decision 3 mirrors.
- ADR-0110 — owner direction in conversation IS ratification; why this ADR is born `accepted`.
- ADR-0095 D7 / the `librarian-curator` process artifact — the mould decision 4 adopts.
- `check:coverage` (121-contract WARN backlog) — the live counter-example motivating the ceiling.
