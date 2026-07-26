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

No individual finding ever blocks a landing; on a ~75% false-positive rate that would be wrong on the
evidence. But the gate **FAILs when the backlog count grows past a fixed ceiling** — the same shape as
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
The ceiling cannot be set until the first sweep exists, so the enforcement half lands strictly after
the detection half — the checks ship advisory-only for at least one interval, which is briefly the very
failure mode decision 3 guards against. Fresh-session cutting means the pass's findings arrive
disconnected from the session that triggered it, so the arc's increment log carries more of the
continuity burden.

**Not decided here.** Which specific checks make up the cheap half beyond the four named, how a warn
signal "crosses a line" in precise terms, and the ceiling's actual number. Those are build-time
decisions for the increment that implements this, not owner forks.

**Unblocks.** This was the last named blocker on the `verification-integrity-arc`'s close. The
remaining chartered work is implementation: this process artifact, the cheap checks, the ceiling, and
the three-or-four durable guardrails still held for the `guidance-curator`.

## References

- `arc:verification-integrity-arc` — the charter that named this fork, and the audit evidence behind it.
- ADR-0249 — increment 1; the demonstrated signed-verdict forgery, and the source of the
  *unattributable-evidence-is-not-fail-closed* reasoning reused above.
- ADR-0211 — the assert-oracle protocol ADR-0249 amends; the vacuous-proof instrument targets this class.
- ADR-0168 D4 — `check:friction-drain`, the drain-ceiling pattern decision 3 mirrors.
- ADR-0110 — owner direction in conversation IS ratification; why this ADR is born `accepted`.
- ADR-0095 D7 / the `librarian-curator` process artifact — the mould decision 4 adopts.
- `check:coverage` (121-contract WARN backlog) — the live counter-example motivating the ceiling.
