---
status: accepted
decided: 2026-08-03
amends: [247]
load_bearing: true
arc: uat-journey-surgery-arc
---
# ADR-0295: The UAT driver's own verdict is the witness — model-driven UAT by default

## Status

accepted (2026-08-03) — decided/directed by the owner in conversation on 2026-08-03. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0247](0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md), which
retired the `model` witness eight days earlier. ADR-0247 anticipated exactly this: *"The owner's
direction was explicitly reversible … Reviving the tier means a new ADR."* This is that ADR. It
narrows rather than overturns: ADR-0247's binary witness split and its decisions 2–6 stand, and
ADR-0209's rubric-judge machinery is **not** revived — see decision 2.

## Context

ADR-0247 retired ADR-0209's `model` witness kind after a 26-story leg-by-leg sweep produced zero model
legs, concluding that criteria sort cleanly into *has a compiler* and *irreducible human judgement*.

Two things have changed, one measured and one owner-supplied.

**The measured one: the sweep ran on a pre-filtered population.** ADR-0294 records that 100 of 133
bound machine legs are bound to a package's own unit suite, and that most criteria are properties of a
module rather than steps in a journey. The governing rule
(`asset:human-witness-is-a-judgment-gap-not-cost`) directs authors toward `machine` whenever a compiler
*could* exist, and ADR-0184 converted legs from human to machine on exactly that basis. So by the time
the sweep asked "would a model judge serve this leg better?", the legs had already been shrunk toward
what a package suite can assert. A null result on that population is weaker evidence than it reads: it
establishes that the *currently-written* criteria need no model, not that a well-written acceptance
journey needs none.

**The owner-supplied one: browser control.** The owner's judgement on 2026-08-03 is that frontier
models are now good enough at headless and browser control that a model can drive an acceptance
journey directly, and that this — not a rubric judge reading evidence — is what UAT actually needs.
Under ADR-0294 the surviving criteria are journeys through a real surface, which is precisely the shape
a driver can execute.

The remaining question was whether the model's own report may stand as the verdict, or whether the pass
must come from mechanical assertions the run emitted. The counter-argument raised in conversation was
that a model which skipped a step and one which completed it produce identical prose summaries, so
without retained evidence there is nothing to audit and the owner's own fallback ("adjust if models
turn out not to be good enough") has nothing to adjust from.

The owner answered that directly, and the answer is a deliberate risk acceptance rather than an
oversight: *"if the models are not good enough we will just get false positive uat assertions and
following sessions or I will pick up on it when we use the app or other sessions discover it in their
work. This would be annoying if we had other users but we dont, its just [me] and my inner circle
atm."*

That is a real detection channel with a stated blast radius, and it is the reason this ADR does not
mandate a trace.

## Decision

**1. A UAT criterion may be witnessed by the model that drove it, and this is the default.**

Where a criterion is a journey through a real surface, the honest witness is a run that performed that
journey. A model driving headlessly or through a browser is such a run, and its reported outcome is
admissible as the verdict. The `machine` witness kind covers this: a model driver reaching an outcome
is a machine witness in the same way the Playwright suite is.

**2. This revives no ADR-0209 machinery.** There is no `model` witness *kind*, no `advanced`/`frontier`
capability tier, no eligibility registry, no independent read-only judge separate from the run, and no
escalation ladder. The witness split stays **binary — `human` or `machine`** exactly as ADR-0247 set
it. What changes is what may produce a `machine` outcome: previously only a command whose exit code the
spine observed out-of-band, now also a model-driven run of the journey. ADR-0247's decisions 2–6 stand
unchanged, and its retirement worklist (decision 5 — the three `model-*` packages and stories) remains
live and is *not* reopened here: that machinery is a rubric judge, which is still not what we are
building.

**3. False-positive UAT assertions are an accepted cost, detected by use.**

The owner's explicit risk acceptance, recorded as the decision rather than as a caveat: a model good
enough to drive but not good enough to judge will produce green criteria that are not true. Those are
caught by the owner using the app, by later sessions working the same surface, and by sibling sessions
encountering the defect in their own work. This is affordable **because the current user population is
the owner and his inner circle**. It would not be affordable with external users.

**4. Evidence retention is available, not required.**

A driver that emits assertions and retains a trace (Playwright-style traces, DOM snapshots, a step log)
makes a suspicious green auditable rather than merely re-testable. This is recommended where it is
cheap — the Playwright path already produces it via `trace: 'retain-on-failure'` — but it is **not** a
condition of a valid verdict. Decision 3 is the chosen detection mechanism.

**5. `human` narrows to genuine taste, and taste is not a story-UAT criterion.**

Per ADR-0294 decision 3, an appearance verdict lives at the capability as `operator-attested`. What
remains for the owner at story level is what neither a compiler nor a driver can settle and which is
not merely a look: a live-spend decision, an outward-facing commitment, an owner value call. On the
current corpus that is roughly six criteria, each needing individual adjudication rather than a rule.

**6. The revisit condition is named, so the bet is falsifiable.** This decision should be reopened when
either holds: (a) the system acquires users outside the owner's inner circle, which removes the blast
radius that makes decision 3 affordable; or (b) false-positive greens are observed often enough that
detection-by-use is demonstrably slower than the cost of the trace discipline in decision 4. Neither
is a prediction; they are the conditions under which the evidence would have changed.

## Consequences

**Good.**

- The witness question stops being a bottleneck on the owner. Combined with ADR-0294, the standing
  attestation queue falls from 41 criteria to roughly 6, and none of the remainder are look-and-feel.
- No new machinery is built or revived. The binary stands, the spine's signing path is untouched, and
  the sign-time guards (`checkUatProof` — a machine leg cannot be greened by operator attestation, a
  human leg cannot be signed by an agent identity) continue to hold unchanged.
- It gets cheaper to have *real* journeys. Hand-writing a Playwright walkthrough per story was the
  implicit cost that made property-shaped legs attractive; a model driver removes it, which is what
  makes ADR-0294's target reachable rather than aspirational.
- The bet is cheap to reverse in either direction, and decision 6 says what would trigger that.

**Cost / watch.**

- **Green will sometimes be wrong, by design.** This is the accepted cost, not a defect to be
  surprised by later. A reader encountering a false green should treat it as this decision operating
  and route it to decision 6's evidence, rather than filing it as a bug in the proof machinery.
- Detection-by-use is unmeasured. Nobody has established how long a false green survives before
  someone trips over it, and the honest position is that we will find out. If that latency turns out
  to be long, decision 4's trace discipline is the cheap next move, not a redesign.
- A model that both authors the journey's assertions and reports their outcome has no independent
  check. The mitigation is sequencing rather than machinery: author journeys in prose first, then let
  a driver execute them, so the claim being tested is human-authored even when the driving is not.
- This ADR makes ADR-0247's decision 1 partly untrue as written ("no independent read-only model judge
  **in the UAT path**"). ADR-0247 stays `accepted` because its decisions 2–6 stand and its central
  finding — that the corpus needed no *rubric* judge — is not contradicted. Per ADR-0139 the `amends`
  edge is the machine-readable record, and ADR-0247's body is corrected in place to point here.

## References

- [ADR-0247](0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md) — the retirement
  this amends; its decisions 2–6 and its retirement worklist stand.
- [ADR-0209](0209-tier-model-judged-uat-below-irreducible-human-witness.md) — the rubric-judge design
  that is **not** revived here.
- [ADR-0294](0294-story-uat-is-a-journey-not-a-spec-criteria-that-duplicate-lo.md) — the criteria half
  of the same conversation; this decision depends on its journey-shaped criteria to be meaningful.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — where the
  appearance verdict lives instead.
- [ADR-0184](0184-machine-witness-drive-machinery-s-three-live-uat-legs.md) — the human→machine
  conversions that contributed to the pre-filtered population.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the spine observes and signs;
  unchanged by this decision.
- `asset:human-witness-is-a-judgment-gap-not-cost` — the labelling rule, now narrowed by decision 5.
- `apps/studio/playwright.config.ts` — the existing driver, including `trace: 'retain-on-failure'`.
