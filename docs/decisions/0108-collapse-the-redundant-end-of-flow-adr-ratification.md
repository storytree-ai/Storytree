---
status: proposed
amends: [84]
---
# ADR-0108: Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once

## Status

proposed — authored on 2026-06-26 at the owner's request to EXPLORE a friction, not to settle it. The
owner's words: *"I spend the time aligning [on decisions in the design conversation] and then at the end
you still ask me to ratify the ADRs."* This ADR maps why the flow re-asks, and lays out the choice as an
**owner fork** (the options in §Decision). The substantive pick is the owner's — it is value-laden and a
process call the corpus does not settle (`owner-fork-bar`), so this ADR is *honestly* `proposed`: it is
NOT an instance of the friction it describes (it genuinely needs the owner's call), it is the friction's
proper escalation. The `status:` flips per [ADR-0084](0084-agents-may-flip-an-adr-green.md) once the
owner picks an option.

It **amends [ADR-0084](0084-agents-may-flip-an-adr-green.md)** — the policy that an agent may transcribe
a `proposed → accepted` flip "when the decision is made and the `## Status` prose supports it." This ADR
does not overturn that wall (status is a PROJECTION of the prose, never an invented ratification); it
asks WHEN, in the lifecycle, the owner's ratification actually happens — and proposes recording it where
it occurs (design time) instead of re-collecting it at the end. It overturns no honesty wall:
`green = a signed verdict` ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) and
`human-owns-the-outer-loop` are untouched.

## Context

### The friction, in one line

The owner aligns on a decision DURING a design conversation (they verbally direct it). An agent builds
it. At the END the ADR is still `proposed`, and the owner is asked to "ratify" — a second time. The
up-front alignment and the end-of-flow ratification feel like the same act collected twice.

### The two live instances

[ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) and
[ADR-0107](0107-an-open-question-attached-to-a-proving-process-gates-its-gre.md): both were *directed by
the owner* in a design conversation on 2026-06-25, both are now BUILT + green + validated end-to-end
(merged PRs #362/#364/#366/#367 for 0106; #365 for 0107), and both still sit `proposed`. Their `## Status`
prose reads *"owner's current thinking… Left `proposed` for owner ratification (not yet a ratified
wall)."* A `librarian-curator` pass on 2026-06-25 explicitly DECLINED to flip them, because — correctly,
under [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) — *status projects
the prose, and the prose reserves ratification for the owner; flipping would invent a ratification that
didn't happen.*

### Where the second ask actually comes from (the mechanics traced)

The double-ask is **not** produced by any gate. It is manufactured at AUTHORING time, by how the
`## Status` prose is written, and then made binding by the projection invariant. Three roots:

1. **Mechanical — every ADR is born `proposed`.** `storytree adr new` (ADR-0050) scaffolds
   `status: proposed` unconditionally (`packages/cli/src/adr.ts` `scaffold()`). There is no
   "born accepted / owner-directed" path. So even a decision the owner just dictated starts life
   `proposed`.

2. **Habitual — the prose hedges a decision that was actually made.** The recurring authoring habit
   writes the `## Status` section as *"owner's current thinking, left proposed for owner ratification"*
   even when the owner *directed* the decision (≈14 ADRs carry ratification-flavoured prose). Because
   status is a PROJECTION of that prose (ADR-0086), that hedge then *forbids* the green flip: an agent
   that flipped it would be inventing a ratification the prose says hasn't happened. **The habit writes
   the second ask into existence.** Note: this convention appears NOWHERE in `CLAUDE.md` or the agent
   guidance as a stated rule — it is emergent, reinforced only by the born-`proposed` scaffold and a
   general "ratification stays owner-held" stance that is really about not enacting decisions
   *unilaterally* (a different thing from recording a decision the owner already made).

3. **Conceptual — what counts as "ratification" is ambiguous.** [ADR-0084](0084-agents-may-flip-an-adr-green.md)'s
   honesty wall — *never invent an owner ratification that didn't happen* — is currently read
   conservatively to mean *a separate, end-of-flow ratification act is required.* But that reading is a
   CHOICE, not a logical necessity. If the owner's verbal directive in the design conversation IS the
   ratification, then authoring the prose as "decided by the owner on <date>" → `accepted` is an honest
   projection of what truly happened, not an invented flip.

Confirming root 3 is pure convention: the `green-flip` ADR-health gate (the only thing that ever
*forces* a flip) fires only when a **healthy story** names a still-`proposed` ADR in its `decisions:`
frontmatter. The `agent` story names `[4, 11, 30, 35, 68, 75]` — **not** 0106/0107 — and is `mapped`,
not healthy. So nothing mechanical pushes 0106/0107 toward `accepted`; they rest `proposed` solely
because the prose says to.

### The lens the corpus already gives us

The `owner-fork-bar` principle says: *escalate OWNERSHIP, not uncertainty* — "owner adjudication is the
system's scarcest channel, and a misrouted fork spends it twice." Applied to ratification: if the owner
already exercised ownership (directed the decision) up front, re-asking them to ratify at the end spends
that scarce channel twice on a call they already made. The sibling `survival-test-for-adrs` confirms a
cross-cutting, decided engineering call is *"an ADR you author yourself (ADR-0084), not an owner fork."*

The honesty constraint any option must respect is ADR-0084's wall: **an agent must never invent an owner
ratification that didn't happen.** The whole question is the line between *"owner's current thinking"*
(genuinely needs ratification) and *"owner already decided"* (ratification is paperwork that lags the
real, already-made alignment).

### A distinction worth separating (it may dissolve part of the friction)

"Ratify" is doing double duty for two different questions:

- **(a) Ratify the DECISION** — "is this the call we're making?" This is settled in the design
  conversation, up front. Re-asking it at the end is the redundancy the owner feels.
- **(b) Confirm the BUILD matches intent** — "does what got built actually match what I meant?" This is
  only knowable AFTER the build, and it is NOT redundant — it is a genuinely different question, and it
  is largely what the story UAT / human-witness signpost (ADR-0040) and the merge ceremony already do.

Calling (b) "ratification" makes it feel like re-asking (a). Part of the fix may simply be to put (a)
where it happens (design time) and stop labelling (b) as a re-ratification of the decision.

## Decision

**This is an OWNER FORK.** Below are four options with their honesty trade-offs and how each clears the
two `proposed` ADRs sitting ready (0106/0107). The agent recommends **Option A**, optionally paired with
**Option C** for the genuinely-still-thinking ADRs. The ADR stays `proposed` until the owner picks.

The crux question, in one plain sentence:
> *When you directed the decision in the design conversation, did you ratify it then — or is "ratify" a
> separate final check that what got BUILT matches what you meant?*
> If you ratified it then → **A** or **B**. If it's a final build-check → **C** or **D**.

---

**Option A — Born accepted when the owner directs it (RECOMMENDED).** When the owner *explicitly directs*
a decision in a design conversation, the ADR is authored `accepted`, with `decided:` set to the
conversation date and the `## Status` prose recording *"decided by the owner in conversation on <date>"* —
alignment IS ratification. ADRs the owner is still *thinking about* (exploratory, not directed) stay
`proposed` exactly as today.
- *Honest when* the owner gave a clear directive ("do X" / "go with B"), not exploratory musing. The
  discriminator is the one `owner-fork-bar` already uses: did the owner exercise OWNERSHIP, or just
  react? The agent authors the prose to what truly happened, so the projection is honest, not invented.
- *Premature when* the direction was tentative or the built thing might diverge from intent. Mitigation
  is exactly ADR-0084 §3's existing catch — observability (studio status chip, the world lighting up, PR
  review) and a one-line revert — plus the build-confirm of distinction (b).
- *Clears 0106/0107:* the owner confirms they directed those calls → flip both to `accepted` now (their
  Status prose is re-authored to "decided 2026-06-25").
- *Touches:* `adr new` gains an owner-directed/`--decided` path (this is the part that amends ADR-0050's
  born-`proposed` scaffold); the authoring habit changes to *record the directive, don't hedge it.*

**Option B — Pre-authorized green-flip on landing.** The ADR is still born `proposed`, but when the
owner says "decided, go build it" they also pre-authorize *"flip to accepted once it's built + green."*
The agent (or the `librarian-curator` pass before merge) flips on landing with no fresh ask. This
distinguishes "I'm still thinking" ADRs (no pre-auth, stay proposed) from "I've decided, go" ADRs
(pre-authed, flip on green).
- *Honest when* the pre-authorization is explicit and recorded (a marker in the Status prose: *"owner
  pre-authorized acceptance on green, <date>"*), so the eventual flip projects a real owner act.
- The flip still lands at the end, but it is MECHANICAL — the owner's time is spent once, up front.
- *Clears 0106/0107:* if the owner pre-authorizes retroactively, flip both now (they're already green).
- *Touches:* a `pre_authorized` marker convention + the orchestrator/librarian flipping it on green; the
  `green-flip` gate stays the backstop.

**Option C — A one-click ratify affordance (keep the step, kill the friction).** If a distinct
ratification act must remain, make it ONE action: a studio button on the ADR card (or a CLI verb
`storytree adr ratify <n>`) that flips `proposed → accepted` with the owner's identity stamped. The
end-of-flow ask becomes one click, not a re-litigation.
- *Honest:* the flip is an explicit owner act (the strongest honesty — the owner literally ratifies),
  just frictionless.
- It does NOT collapse the double-ask; it makes the second ask trivial. Best if the owner *wants* a final
  confirmation gate (i.e. distinction (b) above is the real job).
- *Clears 0106/0107:* owner clicks ratify on each (two clicks).
- *Touches:* a small studio affordance or CLI verb (a new unit).

**Option D — Keep the status quo (the double-ask is load-bearing).** Keep authoring design-conversation
ADRs as `proposed` and asking for end-of-flow ratification. Honest, maximally conservative — and
justified ONLY if the second ask reliably catches *built-thing-diverged-from-intent* (distinction (b)),
i.e. ratification is really "I confirm what got built matches what I meant."
- *Cost:* spends the owner's scarcest channel twice on decisions already made — the exact `owner-fork-bar`
  anti-pattern, and the cost the owner is reporting feeling. Say so plainly if this is the pick.

---

**Whatever option lands must also clear 0106 and 0107** (flip them, or be the mechanism that does) —
they are the concrete backlog this ADR exists to unblock.

## Consequences

**Good.**
- Names the friction precisely: the second ask is a *convention* (an authoring habit over a born-`proposed`
  scaffold), not a gate — so it is cheap to change and changing it breaks no enforcement.
- Separates "ratify the decision" (up-front, redundant to re-ask) from "confirm the build matches intent"
  (end-of-flow, not redundant) — which may by itself dissolve much of the felt friction via relabelling.
- A/B put ratification where the decision actually happens, honouring `owner-fork-bar` without touching
  ADR-0084's honesty wall (the prose still projects a real owner act).

**Bad / costs / follow-on (surfaced, not buried).**
- A/B move the risk from "redundant ask" to "an `accepted` that briefly overstates consensus if the agent
  misreads a tentative remark as a directive." Mitigated by ADR-0084 §3's existing catch (observability +
  trivial revert) — the same risk that ADR already accepted for the green flip. The residual is real and
  acknowledged.
- This ADR proposes a DIRECTION but commits to none — the owner's pick is required before any code/convention
  change. Until then the friction stands and 0106/0107 stay `proposed`.
- The meta-irony, named on purpose: an ADR about *"stop re-asking the owner to ratify"* is itself
  `proposed`, awaiting owner ratification. That is CORRECT here — this one genuinely is an owner fork (a
  value-laden process call above the `owner-fork-bar`), so it is the friction's proper escalation, not a
  fresh instance of it.
- Meta-layer only (the dev repo's ADRs). It says nothing about the product story-trunk, which stays
  approval-gated ([ADR-0008](0008-ui-drives-agents-approvals.md)).

## References

- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — agents may flip `proposed → accepted` when the
  decision is made and the prose supports it (**amended**: this revisits WHEN, in the lifecycle, the
  owner's ratification is recorded; the projection-honesty wall is preserved).
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) — status is a
  projection of the `## Status` prose; the `librarian-curator` curates statuses (the pass that, correctly,
  declined to flip 0106/0107).
- [ADR-0050](0050-adr-number-allocation.md) — `adr new` scaffolds born-`proposed` (the mechanical root;
  Option A would add an owner-directed path).
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) /
  [ADR-0008](0008-ui-drives-agents-approvals.md) — the human-witness signpost + approval-gated trunk
  (the home of distinction (b), "confirm the build matches intent").
- [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) /
  [ADR-0107](0107-an-open-question-attached-to-a-proving-process-gates-its-gre.md) — the two live
  instances this ADR exists to unblock.
- `owner-fork-bar` (Library principle) — escalate ownership, not uncertainty; the lens that frames the
  double-ask as spending the scarcest channel twice.
- `survival-test-for-adrs` (Library principle) — a cross-cutting decided call is an ADR the agent authors,
  not an owner fork.
- `packages/cli/src/adr.ts` (`scaffold`, `adrNew`), `packages/cli/src/adr-frontmatter.ts`,
  `packages/cli/src/adr-health.ts` (`green-flip`) — the code encodings of the lifecycle traced here.
- Design conversation / exploration, 2026-06-26.
