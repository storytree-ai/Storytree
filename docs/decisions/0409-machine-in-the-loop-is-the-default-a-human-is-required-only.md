---
status: accepted
decided: 2026-08-21
arc: machine-verdict-approver-arc
amends: [348, 357]
---
# ADR-0409: Machine in the loop is the default; a human is required only for taste or a capability models lack

## Status

accepted (2026-08-21) — decided/directed by the owner in conversation on 2026-08-21. Design-time
alignment IS the ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md));
no second end-of-flow ask. Recorded 2026-08-22.

## Context

Two ADRs already narrowed *one* human requirement.
[ADR-0348](0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md) D1 narrowed the
`human` UAT witness to taste, and D2/D3 withdrew live spend and outward-facing commitment as bases.
[ADR-0357](0357-human-uat-witness-also-covers-surfaces-no-harness-owns-every.md) D1 added a second
basis — a success condition no harness the spine owns can reach — and D2/D4 required *every* human
leg to STATE its basis. Both were scoped to the UAT witness LABEL.

On 2026-08-21 the owner stated the general rule those two are instances of. Verbatim:

> "models have improved significantly and human in the loop as a requirement no long is a thing we
> should push if thats what this pulls at, machine in the loop is fine for most surfaces, human in
> the loop is only required when the judgement is taste or models are not yet capable to do it
> themselves"

and, on the rule that a model never signs off its own output:

> "Regarding no model signing off its own output, this still holds in that you should have separate
> sessions or separate agents doing build and test or llm as a judge style panels"

and the one carve-out, in the same message:

> "Adopting a code thats mapped should require some sort of human signature."

**What occasioned it.** [ADR-0405](0405-the-machine-uat-signing-verb-already-exists-the-gap-is-bindi.md)
D6 escalated a machine-checked acceptance record to him for a signature his standing delegation
already covered — the second time in two months a session reached for a person where the system
already had an answer. [ADR-0408](0408-a-machine-witnessed-acceptance-leg-carries-no-human-approver.md)
applied the ruling to that one field. This ADR records the general rule and reconciles the rest of
the system against it.

**Why the rule bites rather than merely being agreeable.** Inserting a human where a machine would do
makes the person the QUEUE: work that could drain on its own waits on an evening, and the backlog
grows faster than one human clears it. Worse, a human gate nobody has capacity to exercise degrades
into a rubber stamp — the checkpoint stops checking while still LOOKING like a control, which is
worse than no gate because a reader trusts it.

## Decision

**D1 — THE TWO-CONDITION TEST.** A human is required in a loop ONLY when **(a)** the judgement is
**TASTE** — an aesthetic call, an owner value call, or an acceptance of risk on work the system did
not produce — or **(b)** **MODELS ARE NOT YET CAPABLE** of making it. Machine in the loop is the
default for every other surface. This generalises ADR-0348 D1 and ADR-0357 D1 from the UAT witness
label to human-in-the-loop as a system-wide requirement. Before applying the test at all, apply the
cheaper one first: **a class of decision the owner has already delegated is not a human requirement**
(ADR-0110's standing-delegation basis; ADR-0408's Context).

**D2 — CONDITION (b) DECAYS, AND MUST SAY WHAT RETIRES IT.** This extends ADR-0357 D2's
state-your-basis rule from UAT legs to every human requirement in the system. "No harness exists yet"
is a BUILD task, never a basis; cost is never a basis; liveness is never a basis. Genuine
incapability means the mechanism sits outside what any model plus any harness the spine owns can
reach. A requirement resting on (b) states what would retire it, so a later reader can re-test it.
Taste does not decay; capability does.

**D3 — "NO MODEL SIGNS OFF ITS OWN OUTPUT" IS UNCHANGED, AND IS SATISFIED STRUCTURALLY.** The rule is
about INDEPENDENCE, not species. It is satisfied by a separate session, a separate agent, an
LLM-as-judge panel, or the spine observing an exit code out-of-band — never by inserting a person.
Removing the human never removes the JUDGE. **A surface where the author ends up judging its own
output has failed this ADR, not satisfied it.** Conflating independence with a human requirement is
how one smuggles in under the other, and it is the specific error this decision closes.

**D4 — THE RULE REACHES SESSIONS, not just this transcript.** The principle
`machine-in-the-loop-is-the-default-human-is-the-exception` is wired onto the three agents that make
witness, approval or attestation calls: `session-orchestrator`, `story-author` and
`frontend-builder`, and the generated projections are regenerated. It sits beside
`human-witness-is-a-judgment-gap-not-cost`, which it generalises.

**D5 — THE AUDIT IS DONE, AND NOTHING NEEDED TO CHANGE.** Every place the system still demands a
human was reconciled against the test (detail below). All five `human` UAT legs pass with a stated
basis and none is flipped; the two code-level human requirements are correct as they stand. That is
a finding, not a skipped step — ADR-0357 D2's state-your-basis rule had already done most of this
work a leg at a time, which is why the general rule found nothing to correct.

**D6 — ADR-0070 STAGE 2 IS EXPLICITLY LEFT OPEN AND NAMED.** ADR-0357 D6 left capability-tier
`operator-attested` nodes out of scope and said an appearance verdict blocking a capability's green
is still an owner question; it also said not to extend by analogy. This ADR does not.

The two-condition test **does** settle one half by construction: an
[ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) stage-2 verdict is a
verdict on THE LOOK, the look is taste, and taste is condition (a) — permanently human, with no
model improvement that retires it. The general ruling therefore CONFIRMS those nodes rather than
threatening them.

What it does **not** settle is D6's actual question, which is not about who judges but about
sequencing: **whether a human appearance verdict should BLOCK a capability's green.** That is a
workflow call the two-condition test says nothing about, and the owner was explicitly told to be
asked. It is authored as the `open-question`
`oq-does-the-owner-look-gate-a-capability-s-green` on this arc rather than decided here, so the arc
surface reads WAITING and a later session finds the fork instead of re-deriving it. Two paths are
affected today; the question carries the four options, the commit-drift risk any non-gating option
must answer, and a non-binding recommendation to keep the gate for now.

## The audit (D5 in detail)

Measured 2026-08-22 against `origin/main`, through `parseUatTestCriteria` (`storytree uat census` —
never a grep, since the witness tag has two written forms) and by reading the guards' source.

**Five `human` UAT legs across four stories — all pass, none flipped.**

| leg | basis | verdict |
|---|---|---|
| `feedback-graduation` Synthesis (`uatc_03ea0411c6fce01ae8ff93bd`) | sufficiency/durability are value calls with no compiler | **(a) taste** — permanent |
| `map-terminal-build` the seeded command's FORM (`uatc_a011b79159dd94012486cb91`) | whether `pnpm ` is the invocation form the owner wants | **(a) taste** — and the only place that open owner call is queued; **not touched** |
| `desktop` real build blooms via the broker (`uatc_da3559fd2874e2df93362733`) | `ensureHostedIdentity` needs an INTERACTIVE Google sign-in behind IAP | **(b)** — retires with the IAP-credential fork on `remote-session-access-arc` |
| `desktop` the `builder` grant opens the write path (`uatc_1207e89e3a5adfdc8c21359f`) | same IAP mechanism, binding at both ends | **(b)** — same retirement |
| `terminal-repo-picker` the native OS directory dialog (`uatc_7a3b2d98cf30074c51c67eac`) | a main-process native modal Playwright's renderer driver cannot reach | **(b)** — retires with OS-level input automation the spine owns |

Two carry (a), three carry (b) and each names what would retire it, as D2 requires.

**Two code-level human requirements, both correct as they stand.**

1. **`uat attest`'s human guard** (`packages/orchestrator/src/proof/uat-proof.ts`) refuses ANY
   `sandbox:` identity from attesting a human leg, plus a second guard for the building agent
   specifically. Under D3 the first guard's breadth might look like over-reach — independence would
   be satisfied by a *different* agent. **It is not over-reach:** a leg is `human` precisely because
   it is taste (no agent should rule on it) or un-harnessable (no agent CAN reach the mechanism).
   Both bases make every agent the wrong signer, not merely the author. Unchanged.
2. **The brownfield adoption approver** (`runAdopt`, `observeAndSign`'s brownfield-gate class,
   `storytree adopt gate`) stays fail-closed on a blank human — ADR-0408 D3, owner-confirmed in the
   same message as the general rule. It survives condition (a) because it is not a verification
   judgement at all: nothing is checked, risk is ACCEPTED on work the system did not produce, and no
   improvement in model capability retires an ownership decision.

**Two things deliberately out of scope, and why.**

- `human-owns-the-outer-loop` is untouched. The owner still directs the work; this decision is about
  VERIFICATION, not direction, and the two are not the same axis.
- The signer chain generally (`resolveSigner`, the prove-it-gate's signer, `attest`'s signer) is an
  IDENTITY requirement, not a human one — `sandbox:<model>@<run_id>` passes by design. It never
  demanded a person, so the test does not reach it.

## Consequences

- **A session that reaches for a person now has a test to fail.** The commonest error this closes is
  reaching for the no-self-signing rule to justify a human: D3 says that rule never asked for one.
- **The audit found nothing to change, and that is the load-bearing result.** ADR-0357 D2 required
  every human leg to state its basis a year of decisions ago; the general rule arriving later found
  a population already reconciled. The cost of the state-your-basis discipline is what bought this.
- **The rule is now enforced only by guidance, not by a gate.** No `check:*` rung scores whether a
  new human requirement passes the two-condition test, the same way no rung scores the retro or the
  escalation bar. That is deliberate (ADR-0168 D1: a compliance gate prices a ceremony toward
  theater), but it means a future human requirement can enter without stating a basis — for UAT legs
  ADR-0357 D2 is the backstop, and elsewhere there is none. If instances accumulate, the remedy is a
  rung on the UAT-leg pattern, not a broader mandate.
- **Condition (b) creates standing re-test work with no owner.** Three legs rest on it today and each
  names its retirement condition, but nothing schedules the re-test. They will be re-read whenever
  their named fork moves (`remote-session-access-arc`, OS-level input automation), which is the
  honest state rather than a promise of a sweep.
- **`machine-verdict-approver-arc` can close on this** except for D6's open question, which is
  authored on the arc and reaches the owner through the arc surface rather than a transcript.

## References

- [ADR-0348](0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md) D1/D2/D3 ·
  [ADR-0357](0357-human-uat-witness-also-covers-surfaces-no-harness-owns-every.md) D1/D2/D4/D6 — the
  UAT-witness-scoped decisions this generalises, and D6's left-open capability-tier question.
- [ADR-0408](0408-a-machine-witnessed-acceptance-leg-carries-no-human-approver.md) — the first
  application of the ruling, and the brownfield carve-out (D3).
- [ADR-0405](0405-the-machine-uat-signing-verb-already-exists-the-gap-is-bindi.md) D6 — the
  escalation that occasioned the ruling.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) §3 — stage-2
  `operator-attested` on the appearance; confirmed as taste, its blocking question left open.
- `machine-in-the-loop-is-the-default-human-is-the-exception` (Library principle) ·
  `human-witness-is-a-judgment-gap-not-cost` (the sibling it generalises).
- `packages/orchestrator/src/proof/uat-proof.ts` · `packages/drive/src/adopt.ts`.
