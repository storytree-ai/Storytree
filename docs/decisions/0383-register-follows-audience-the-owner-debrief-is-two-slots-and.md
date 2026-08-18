---
status: accepted
decided: 2026-08-19
amends: [288]
arc: owner-facing-output-arc
---
# ADR-0383: Register follows audience: the owner debrief is two slots and concerns become objects

## Status

accepted (2026-08-19) — decided/directed by the owner in conversation on 2026-08-18/19. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0288](0288-not-worth-a-session-is-a-first-class-outcome-restore-discret.md) — D3's requirement that every follow-up be named in the debrief (chipped-and-named, or considered-and-declined with a one-line reason) is withdrawn as a DELIVERY requirement. What survives verbatim is D3's core: a concern may not be dropped in silence. What changes is where it goes — into an object, not into a paragraph. D1/D2/D5's worth-a-session bar is untouched.

## Context

On 2026-08-18 the owner asked what was left on an arc, got an accurate answer, and replied *"can you rephrase with less jargon, what exactly is being asked here"*. The rephrase — same facts, same items, nothing added or removed — got *"this is much easier to read."* Both sit in one transcript minutes apart, which makes register the only variable and the owner the adjudicator. That matched pair is the fixture for everything below.

**The gap was a missing bridge, not a first invention.** `plain-language-first` is scoped to ARTIFACTS by its own text and calibrated for *"a newcomer with the repo NOT loaded"*. ADR-0271 D2 already asks for *"a plain-language outcome paragraph"* — undefined, cited to no principle, operationalised by nothing. The output that failed was neither an artifact nor a landing debrief: it was a mid-session "what's left" answer, the highest-volume owner-facing thing produced, governed by nothing at all. That orphaned adjective sat in every session's always-loaded context on the day the answer still needed a rephrase, which is a measured demonstration of `guidance-quality`'s claim that emphasis fails and structure works.

**The audience is not a newcomer.** The owner holds the project's intent, history and stakes better than any session, because he set them. What he does not hold is the MACHINE VOCABULARY — ids, lifecycle terms, ADR numbers, internal object names. Applied as "explain it to a newcomer" the cure yields padding and mild condescension, which is the worse failure because it is tedious rather than merely opaque.

**Where the demand actually falls — measured, not assumed.** A pass over the session traces found every explain-request clustered at a DECISION: *"...with a diagram and analogy so i can answer them"* (2026-08-17); *"walk me through the proposal ... so i can stamp it"* (2026-08-12, asked again 2026-08-15); *"can you explain this with a diagram i'm not sure i understand, use an analogy"* (2026-08-05, asked of an open question). A second, distinct cluster is pure vocabulary translation — *"can you explain what this means '<our own jargon quoted back>'"* — recurring 2026-08-04, 08-11 and 08-13. The owner confirmed the pattern directly: being asked to decide is when he most often asks for diagrams, re-onboarding and analogies.

**The closing debrief is over-long in a specific way.** The owner: *"there's often a few call outs that I dont really care about"*. What he does read is narrow: *"i generally focus reading on what landed, and if I can now close the session or not (have things been cleanedup, i sometimes find PRs that have yet to be merged or uncommited changes)"*. ADR-0288 D3 is the direct cause — it requires every follow-up to appear in the debrief either as a queued item or as a declined one with its reason, which is precisely the callout traffic being described.

**The durable forms already exist outside software, and none of them mention AI.** BLUF / the Minto Pyramid (US military; McKinsey, 1985) — answer first, support second, data last. SBAR (navy, then healthcare; endorsed by the WHO and the Joint Commission) — the standard shift handoff, which is exactly the re-onboarding case. Dual coding and Mayer's multimedia principle — words plus a picture beat words alone, while a badly chosen picture adds load. The FAR guide for teaching with analogies — every analogy breaks somewhere and naming where is what separates an explanation from a misconception. A survey of the community agent-skill ecosystem found the largest library (Superpowers, ~476k installs) governs how an agent WORKS and carries nothing governing how it TALKS to its owner; what exists is style catalogues and machine-to-machine handoff tooling. So the material is mature, but not as agent skills.

## Decision

**D1 — Register follows audience, and it is a principle, not an adjective.** A new `register-follows-audience` principle stands BESIDE `plain-language-first` rather than widening it, because the reader model differs: compressed and identifier-dense for artifacts and agent-to-agent handoff; for the owner, translate the machine vocabulary, name each thing by what it DOES, lead with the answer or the ask, and never re-explain the project he set. It is cited in the `session-orchestrator` behavioural floor.

**D2 — Four owner touchpoints, with slots checkable by presence.** A DECISION (stakes first, terms glossed, both sides of each trade-off, an analogy naming where it breaks, a diagram when the subject is structure or flow, a non-binding recommendation, at most one question). A MID-SESSION UPDATE (answer in sentence one standing alone; items named by function; a visible split between decided work and work needing an owner call; owner-supplied evidence treated as evidence). THE LANDING DEBRIEF (D3 below). RE-ONBOARDING (the SBAR four: where things stand, what you would need to know, what the session makes of it, what it wants from you). The decision touchpoint carries the most structure because that is where the demand measurably falls.

**D3 — The closing debrief is TWO slots.** What LANDED — PR numbers plus a functional outcome paragraph. And whether this session is SAFE TO CLOSE — stated as a yes or a no and never left to infer: PRs MERGED rather than merely opened, working tree clean, claims released.

**D4 — Every other concern becomes an OBJECT, never a debrief paragraph.** A bug worth caring about is FIXED on the spot and lands on ITS OWN PR in its own worktree, so the current diff stays clean. An OUT-OF-SCOPE architectural concern gets its own arc, and that arc opens with an authored `open-question` and implements nothing. Anything else worth the owner's attention IS a question, or it was not worth saying. **IN-SCOPE work is never given a separate arc** — it is parked as an increment on the SAME arc, or escalated to the owner in the SAME session.

**D5 — Silence stays forbidden; narration does not.** ADR-0288 D3's prohibition on dropping a concern survives. Its delivery requirement does not: the test is whether the concern reached an object, not whether it was mentioned.

**D6 — The representation ladder: pick the cheapest that answers, and offer it unasked.** Prose by default; an analogy when the mechanism is unfamiliar, always naming where it breaks; a diagram when the subject is structure, flow or state; an interactive mock only for the genuinely complex, offered with its cost named rather than silently spent. **Being ASKED for a diagram or an analogy is the failure signal** — the ask should have been anticipated.

## Consequences

**The corpus does not get vaguer.** This changes the register of what is said TO THE OWNER only. Ids, ADR numbers and lifecycle terms remain how one session hands off to the next without re-deriving anything. If satisfying this rule ever seems to require blurring an artifact, that is a finding to escalate, not a licence — end state 5 of the owning arc exists to catch exactly that.

**Two known gaps are left open deliberately, both parked as increments on `owner-facing-output-arc`.**

- *The always-loaded projection is only half-solved.* `register-follows-audience` reaches `CLAUDE.md` and `AGENTS.md` as a NAME in the behavioural-floor list; its statement is pull-based (ADR-0156). The operative content reaches the loaded text only through the `session-orchestrator` prose this ADR edits. Adding a principle and regenerating produced a one-line diff, which is the tell ADR-0156's trap predicts.
- *ADR-0359 D5's `analogy` slot is invisible where it matters.* Measured 2026-08-19: `analogy` appears ZERO times in `CLAUDE.md` and ZERO times in `AGENTS.md`; the `question new` signature those files carry reads `[--diagram] [--recommendation]` with the analogy flag absent; and the live `open-question` tier holds ONE artifact in total. A decision the owner directed on 2026-08-12 reached the schema and never reached the sessions expected to honour it.

**The finishing test is the owner's, and this ADR does not claim it.** The real evidence is the owner reading a closing debrief and not asking for a rephrase, which takes as many sessions as it takes. The cheap corroborating test — hand a fresh session the same input plus these slots and compare against the recorded pair — is corroboration only: an agent assessing prose it just wrote is not an independent witness, and the blinding problem is worse here than for a visual surface because the writer holds every term it should have glossed.

**A negative control is available and cheap.** Hand the same session a genuine agent-to-agent artifact — an arc body, an ADR — and confirm it does NOT flag the compressed vocabulary there. If it does, the rule has leaked past its audience.

## References

- [ADR-0288](0288-not-worth-a-session-is-a-first-class-outcome-restore-discret.md) — amended by D3/D5 above.
- [ADR-0271](0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md) — D2's "plain-language outcome paragraph", now pointing at a structure.
- [ADR-0359](0359-the-arc-briefing-panel-is-a-review-queue-not-a-log.md) — D5 added the `analogy` slot this ADR finds unprojected.
- [ADR-0156](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md) — the projection trap both gaps above are instances of.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this ADR is born accepted.
- `asset:register-follows-audience`, `asset:plain-language-first`, `asset:guidance-quality`.
