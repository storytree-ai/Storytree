---
status: proposed
amends: [44, 82, 97]
---
# ADR-0106: The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process

## Status

proposed — owner's current thinking, recorded during a design conversation on 2026-06-25 while
reviewing why the `agent` story's six UAT legs all read `witness=either` and yet only the human can
close them. The owner directed: adoption should run a **story-writer pass** that DECIDES whether the
human is needed per leg ("it shouldn't automatically require me"), the word **`either` should leave the
UI** (a leg either shows a flag to click or it doesn't), machine-witnessable-but-unproven legs **defer
to Build**, and **agents may raise open questions via the Library throughout the process and gate the
proving process on them**. Left `proposed` for owner ratification (it is "current thinking", not yet a
ratified wall); the `status:` will flip per [ADR-0084](0084-agents-may-flip-an-adr-green.md) once
ratified. **Largely NOT BUILT** — see Consequences.

It **amends [ADR-0044](0044-per-uat-test-human-attestation.md)** (the per-test `witness`
`either` default becomes a *pre-adopt, undecided* state the adopt pass RESOLVES, never the resting
state of an adopted leg and never user-facing), **amends
[ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)** (the operator
"I saw it work" affordance is shown only for a leg whose resolved witness is `human`), and **amends
[ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)** (the Adopt pass gains
a witness-classification step over the story's UAT legs, and §3's "escalate the key decisions through
the open-question / ADR-fork flow" is strengthened into a hard process gate). It **overturns no honesty
wall**: `green = a signed verdict` ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) stands;
the human-witness signpost ([ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md))
stands; this changes WHO is asked to witness and WHEN, not the bar.

## Context

The brownfield go-green model is a proving process the owner ENTERS
([ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)), with adopt and drive
as peer best-efforts ([ADR-0105](0105-drive-and-adopt-are-peer-best-efforts-every-green-is-provisi.md)).
A story's crown greens only when every capability is healthy AND every own-proof obligation — its
reliability gates and its per-test UAT legs — carries a signed pass.

The per-test UAT witness ([ADR-0044](0044-per-uat-test-human-attestation.md)) is a
permission enum — `human | machine | either` — that **defaults to `either`** ("always allow both"), so
a prose-only leg loads without forging a human claim or restricting a machine. Separately, the
story-level `uat_witness` ([ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md))
fail-closed-defaults to `human`.

**The bug the owner found.** `either` is *conservative*, but its EFFECT is the opposite of conservative
in practice. An `either` leg has exactly one signer who ever actually shows up:

- Adopt signs only the story's `## Reliability Gates`, not its UAT legs.
- `story build … --real` deliberately WITHHOLDS the story UAT node (ADR-0097 §6; the `agent`
  story.md says so explicitly).
- No scripted/machine UAT exists for a story whose legs were authored as prose.

So an `either` leg with no scripted test silently degrades to *"the human is the fallback"* — an
**implicit** human requirement, which is exactly what "adoption shouldn't automatically require me"
objects to. The concrete instance: the `agent` story's six legs (`agent#uat-1…6`) all read
`witness=either`, none is signed, and only the operator's "I saw it work" button can close them today.
The owner's two points:

1. **The decision should be MADE, not defaulted.** Hitting Adopt should run a story-writer pass that
   judges, per leg, whether the human is genuinely needed — not leave every leg in an `either` limbo
   that lands on the human by omission.
2. **`either` is redundant in the UI.** From the owner's seat the only question is "do I click this or
   not?" A three-way permission word answers that with "maybe, depends" — noise. Either show a flag or
   don't.

## Decision

**1. The adopt pass RESOLVES each UAT leg's witness; it is never silently defaulted to the human.** When
the operator enters adoption ([ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)),
a `story-author` classification pass runs over the story's `## Story UAT` legs and assigns each a
concrete witness — `machine` or `human`. This replaces `either`-as-resting-state: an adopted story has
no `either` legs.

**2. The rule is ASYMMETRIC — `machine` needs positive evidence; `human` is the default for
experiential or uncertain legs.** A leg may be classed `machine` ONLY when a real test demonstrably
covers it (an existing suite test to observe-and-sign, or a scripted test to author). Anything
experiential ("the world *feels* right", a visual/UX judgement) or any leg the pass cannot confidently
back with a machine check stays `human`. This preserves ADR-0040's fail-closed-toward-the-human intent
(*when in doubt, ask the human*) while removing the legs that ask the human for NO reason. Neither
witness outranks the other — they are peer bases
([ADR-0105](0105-drive-and-adopt-are-peer-best-efforts-every-green-is-provisi.md)); the pass picks the
one the leg NEEDS, not the "stronger" one. A `machine` label is a PROMISE of a real test — never a bare
flag flip (a `machine` leg with nothing behind it would re-create the orphan bug in reverse, going
green *without* the human silently).

**3. Machine-witnessable-but-unproven legs DEFER to Build (owner's choice over author-in-adopt /
classify-and-escalate).** Adopt observe-signs the `machine` legs the current suite already covers (the
cheap first step, ADR-0097 / ADR-0085); a `machine` leg not yet covered becomes a `build-tests`
obligation the Build step authors red→green
([ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)). Adopt stays cheap —
it classifies and observe-signs, it does not author new tests.

**4. Open questions raised during the process GATE it.** At any point in adopt or build, an agent that
hits a genuine fork it cannot settle from the corpus raises an open question via the Library
([ADR-0032](0032-cite-graduation-mechanism.md) signal→Library;
[ADR-0037](0037-decision-binding-and-hygiene-gates.md) OQ hygiene), and an unresolved OQ
attached to the proving process **gates** it — the story does not green past the gated obligation until
the OQ is resolved (generalising ADR-0037's live-build OQ-hygiene gate; making ADR-0097 §3's "escalate
the key decisions through the OQ/ADR-fork flow" a hard gate, not a surfaced note). This is the escape
valve that lets decision 2 be honest: faced with an ambiguous witness call, the pass RAISES A GATING OQ
rather than guessing — the human owns the fork (ADR-0030), the process waits.

**5. The owner UI is BINARY; `either` leaves the owner surface.** A UAT leg either shows the operator a
confirm affordance — the "I saw it work" verdict button
([ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)), shown iff the leg's
resolved witness is `human` — or it shows nothing (a `machine` leg is handled by adopt/build and just
goes green). The word `either` is never rendered. Internally the witness enum keeps its values, but
`either` is demoted to a transient PRE-ADOPT "undecided" state that the adopt pass resolves; it is
never the resting state of an adopted leg.

## Consequences

**Good.**
- The implicit human-fallback disappears: the operator is asked to witness a leg only when a machine
  genuinely cannot, and is never silently made the fallback by an undecided default.
- The owner surface becomes honest and binary — a flag means "you're needed here", its absence means
  "handled" — matching how the owner actually reads the world.
- Reuses the existing machinery end-to-end: observe-and-sign for covered legs, build-tests for the rest
  (ADR-0098), the OQ/ADR-fork flow for the escalations (ADR-0032/0037), the "I saw it work" verdict for
  the human legs (ADR-0082). The new work is the CLASSIFIER and the GATE, not a new proof primitive.
- `machine` is safe by construction: it is only ever chosen with a real test behind it, so it cannot
  green a leg the system never actually checked.

**Bad / costs / follow-on (surfaced, not buried) — the model is the owner's current thinking; the
infrastructure is largely NOT BUILT.**
- **The classification pass does not exist.** A new `story-author` step that judges each UAT leg
  (experiential → `human`; machine-coverable → `machine`, split into observe-existing vs
  author-a-test) is net-new. Today the adopt pass is purely the structural `classifyAdoption`
  covers-diff over capabilities — it makes no witness judgement.
- **OQ-gating of the proving process is not wired.** ADR-0037 gates LIVE BUILDS on OQ hygiene; gating
  the adopt/build proving process on process-attached OQs (raise-and-block, then resume on resolve) is
  new orchestration.
- **The studio surface must drop `either`.** The AdoptPanel + the per-test UAT surface must render the
  binary (a button only for `human` legs) and stop showing the permission word; a guard must forbid an
  adopted story from carrying an `either` leg at rest.
- **Mis-classification is the standing risk.** A pass that wrongly calls a `human` leg `machine`
  silently drops a check the owner wanted. Mitigated by: the asymmetric rule (decision 2 — `machine`
  needs positive test evidence), the gating OQ (decision 4 — raise rather than guess), and the
  expandable floor (ADR-0105 — grow a gate when a machine leg later proves insufficient). Residual risk
  acknowledged, not eliminated.
- **Surface breadth:** library (the witness model + the classifier's inputs) → orchestrator / cli (the
  adopt classification pass + the OQ gate in the proving process + the observe/build-tests routing) →
  studio (the binary UI). Held together by reuse of `observeAndSign`, the build-tests loop, and the OQ
  flow.

## References

- [ADR-0044](0044-per-uat-test-human-attestation.md) — per-test UAT witness + attestation
  surface (**amended**: `either` is a pre-adopt undecided state the adopt pass resolves, never the
  resting state of an adopted leg, never user-facing).
- [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) — per-test UAT earns
  green by witness; the "I saw it work" operator verdict (**amended**: shown only for a `human`-resolved
  leg).
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — adopt enters the
  brown→proposed→green proving process (**amended**: the Adopt pass gains witness classification; §3's
  escalation flow becomes a hard OQ gate).
- [ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md) — the build-tests
  inner loop authors the deferred `machine` legs (decision 3).
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — verdict-derived green +
  the human-witness signpost (its fail-closed-toward-the-human intent is preserved by decision 2's
  asymmetric rule, applied per-leg instead of as a blanket default).
- [ADR-0105](0105-drive-and-adopt-are-peer-best-efforts-every-green-is-provisi.md) — drive/adopt are
  peer bases; by the same logic `machine` and `human` witness are peers, chosen by need not rank.
- [ADR-0032](0032-cite-graduation-mechanism.md) /
  [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — the open-question channel and
  the OQ-hygiene gate this generalises into a proving-process gate (decision 4).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop (the gating OQ is how
  the inner loop hands a fork back).
- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — the policy under which this ADR's `status:` will
  flip on ratification.
- Code this refines: `packages/library/src/uat-tests.ts` (the witness enum + `either` default),
  `packages/library/src/schema.ts` (`effectiveUatWitness`), `packages/cli/src/adopt.ts` (`adoptStory`),
  `apps/studio/server/apiRouter.ts` (`classifyAdoption`, the AdoptPanel payload, `/api/uat/attest`),
  `apps/studio/src/components/BuildSection.tsx` (`AdoptPanel`), `packages/orchestrator/src/proof/uat-proof.ts`
  (`rollupStoryUat`). The `agent` story (`stories/agent/story.md`, six `either` legs) is the concrete
  instance.
