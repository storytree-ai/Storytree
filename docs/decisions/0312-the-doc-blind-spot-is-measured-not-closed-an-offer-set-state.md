---
status: accepted
decided: 2026-08-05
arc: context-decision-tree-arc
amends: [260]
---
# ADR-0312: The doc: blind spot is measured, not closed: an offer set states how much of itself the telemetry cannot see

## Status

accepted (2026-08-05) — decided/directed by the owner in conversation on 2026-08-05. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends ADR-0260, which stands and is not superseded. Every decision in it survives intact; what this ADR overtakes is a single expectation in its Consequences — that closing the `doc:` blind spot "is a candidate increment in its own right". It is not. The gap is measured instead, and this ADR records why closing it would make the surface less honest rather than more.

## Context

`context-decision-tree-arc` exists to answer one question about a recorded traversal: *what else was on the table here?* Three build increments delivered it. A `library artifact <id>` render records the ids its Sources block offered (ADR-0260 D1/D2); a read invoked with `--from-offer <candidateSetId>` stamps the edge it answered (D3); and `traversal show` renders, per recorded offer, every candidate with what the trace deterministically says happened to it — `followed`, `not-followed`, `unobservable`, `ambiguous`.

**One distortion survived all three, and it is a distortion of the arc's own quantity.** A Sources block routinely offers `doc:` refs pointing at ADR files. They are correctly recorded as *offered* — the render really did print them — but an ADR is read as a FILE, not through an allowlisted CLI read shape, so there is no visit for a follow to land on. ADR-0260 D7 declared this as a coverage caveat, and increment 5 made it *visible* by rendering each such offer `[unobservable]` rather than silently omitting it. Neither closed it. ADR-0260's Consequences left the expectation that a later increment would.

**The corpus was measured rather than sampled, 2026-08-05, over the live store: 682 artifacts, 353 of them carrying at least one reference, 1500 references in total.**

| prefix | count | share |
| --- | --- | --- |
| `asset:` (followable) | 905 | 60.3% |
| `doc:` | 550 | 36.7% |
| `node:` | 32 | 2.1% |
| bare / malformed | 13 | 0.9% |

The mean offer set holds 4.25 refs (median 3, max 28). **25.8% of offer sets have nothing observable in them at all**, and 70.5% carry at least one `doc:` ref.

**That measurement corrects the standing account in two directions at once, and both corrections matter.** ADR-0260 recorded, from a single sampled read of `merge-ceremony`, that `doc:` refs are "the MAJORITY of a typical offer set". Corpus-wide that is **false** — the majority of references, 60.3%, are followable. But the sampled artifact has since grown and now offers **12 refs of which 8 are `doc:`**, so for *that* artifact the claim is not merely true but stronger than when it was written. Both readings were reachable from one sample, which is the point: **the unobservable share of an offer set ranges from 0% to 100% depending on which artifact was read.** A static prose caveat cannot express a quantity that moves that much, and a single sampled number will mislead whichever way it is quoted.

**A second, smaller thing was found while establishing the fork: two structurally different gaps are being reported as one.** `isFollowableOfferId` is `!offerId.includes(":")`, so every scheme-prefixed offer — `doc:` and `node:` alike — renders `unobservable` with the single reason *"this offer id carries a scheme prefix and has no CLI read that could ever follow it"*. For a `doc:` ref that is exactly right: no command in the repo reads an ADR body. For a `node:` ref it is defensible but misleading. `storytree tree <id>` IS allowlisted and does observe a `front_matter_read`, so a CLI read plainly exists; what blocks the edge is that `emitFollowedEdge` only stamps a `library-artifact` visit. The sentence survives only on a narrow reading of "follow" (record an edge), and on the natural reading — no CLI read exists — it is wrong. The verdict `unobservable` is correct in both cases and does not move; what is missing is that the two cases have different causes, and only one of them would be closed by adding a read shape.

**Does a `doc:` ref have an allowlisted CLI read at all? No — and not by oversight.** The `adr` area exposes `list`, `new`, and `next`; `list` renders titles and statuses, never a body. No command anywhere in the repo renders an ADR's text. `observeCliInvocation` allowlists `tree`, `library`, and `agents`. So "give `doc:` refs a followable read shape" means inventing a CLI verb whose primary purpose is to be observable, while `CLAUDE.md` instructs agents to read `docs/decisions/` as files.

## Decision

**The `doc:` blind spot is measured, not closed. A decision point states how much of its own offer set the telemetry could not see, and why.**

1. **A recorded offer set renders its observable denominator alongside its outcomes.** For every `candidate_set`, the replay states `offered N, observable M of N`, plus a per-trace total carrying the sentence that stops the misreading: *the followed counts above are over M observable branches, not N offered.* The offered count alone is what a reader currently takes as the denominator, and it is the wrong one.

2. **No CLI read shape is added for `doc:` refs, and `isFollowableOfferId` does not widen.** This is the half that is a refusal rather than a build, and the reasoning is the load-bearing part of this ADR. `isFollowableOfferId` gates the `unobservable` bucket. The moment a `doc:` ref becomes nominally followable, an unanswered one stops rendering `unobservable` and starts rendering `not-followed` — a **declined branch**. Agents will keep reading ADR files directly, because that is how they are instructed to read them, so the overwhelming majority of `doc:` offers would render as declines the session never made. That converts an honest *"I cannot see this"* into a false *"the session turned this down"* — over-reporting declines, which ADR-0260's Consequences, this story's signed UAT leg 9, and `decision-point-playback`'s own spec each name by name as the distortion to avoid. **Closing the gap this way would make the surface less honest, not more.** It is refused on the arc's own rules, not on cost.

3. **The unobservable verdict acquires a REASON, and the reason is DERIVED from the real allowlist rather than restated as a prefix table.** Two reasons exist: no CLI read shape observes a visit for this offer (`doc:`, unknown schemes), and a CLI read exists but no follow producer accepts its surface (`node:`). The classification is computed by building the argv a follow would use and running `observeCliInvocation` over it, then comparing the observed `surfaceId` against the surface `emitFollowedEdge` stamps — so widening either the allowlist or the producer moves the classification with it and cannot leave a stale table behind. The repo already carries this rule in two places pinned in lockstep, and a third hand-written copy is precisely the drift `decision-point-playback`'s contract 6 exists to prevent.

4. **The added reason must never move the existing verdict.** `classifyOfferObservability(id).observable` agrees with `isFollowableOfferId(id)` on every id shape the corpus carries, pinned by agreement between the two imported functions rather than by an expectation table. This is what keeps signed UAT leg 9 and `decision-point-playback`'s contract 6 green: this decision adds a denominator and a reason, and changes no outcome.

5. **The one known divergence is asserted, not hidden.** For the bare id `list`, `isFollowableOfferId` returns `true` and `renderOfferFollowUps` prints `storytree library artifact list --from-offer …` — but that argv dispatches to the list SEARCH, which observes a `search` event and no visit, so no edge could ever land on it. Zero instances in the corpus today. It is pinned by a contract because a silent divergence is how the next drift starts.

6. **No percentage is rendered.** `M of N` is the observation. A rounded share of a three-element offer set invites reading precision that is not there, and the fully-unobservable case — a quarter of all sets — is the shape most likely to produce a division that silently yields `NaN`.

7. **ADR-0260 D4 is untouched and this decision does not engage it.** Measuring how much of an offer set is invisible is not repairing a missing edge: no correlation, no backfill, no inference, and no edge is drawn that the telemetry did not record. Under-reporting remains the accepted failure mode; this decision reports the *size* of the under-report, which is the mitigation D7 always called for — honesty about the hole rather than a heuristic that hides it.

### What was weighed

**Candidate A — give `doc:` refs a real followable CLI read shape.** Add `storytree adr show <n>`, allowlist it in `observeCliInvocation`, widen `emitFollowedEdge` past `library-artifact` visits, and change guidance so agents read ADRs through it.

- Closes 36.7% of the gap on paper, and is the increment ADR-0260's Consequences anticipated.
- **Refused.** It converts honest `unobservable` entries into false `not-followed` ones for every agent that keeps reading the file — which is the instructed path — and so *increases* the over-report of declines while appearing to reduce the blind spot. It also compounds the behavioural dependency ADR-0260 D7 already flags as a new class for this telemetry: the trace would now be complete only if agents adopt a second command form whose sole purpose is observation.

**Candidate B — measure the distortion. CHOSEN.** Accept the gap as structural at this boundary and state its size per offer set.

- Honest under any future decision: even if a read shape were added later, the observable share would still need stating, because `node:` refs, unknown schemes and the bypassed-mechanism gap all remain.
- Turns a static prose caveat into a per-trace number, which is the only form that can carry a quantity ranging 0–100% by artifact.
- Costs a rendered block and no emission, no schema change, no new event kind, and no coverage constant.

**Candidate C — do nothing; the caveat already declares the gap.** Refused: a declaration says *some* offers are unobservable, and the picture it sits beside prints a count a reader will take as the denominator. Increment 5 made the gap visible per entry; nothing yet makes it legible per set, and the arc's end state turns on the picture not over-reporting.

## Consequences

**The arc's own quantity becomes readable for the first time.** "Followed 1 of 12" and "followed 1 of 4 observable" are different claims about a session's behaviour, and only the second is supported by the telemetry. Until now the replay printed the first.

**The expectation that a later increment would close the `doc:` gap is withdrawn.** A future session finding the caveat `doc-refs-are-offered-but-follows-are-unobservable` should not read it as a worklist item. Closing it is refused on the arc's rules by D2 above, and a proposal to add a `doc:` read shape must engage that reasoning rather than treat the gap as unfinished work.

**Two causes that were reported as one are now told apart, without moving any verdict.** The `decision points:` block keeps its single `unobservable` reason and its wording is deliberately left alone — it is accurate for `doc:` refs, which are 550 of the 550-plus unobservable references, and the string is pinned by no test but sits in a capability holding a signed verdict. What changes is that the `offer observability:` block beside it now states which of the two causes applies: no read shape observes a visit at all (`doc:`, unknown schemes) versus a read exists whose surface no follow producer accepts (`node:`, 32 of 1500 references). `isFollowableOfferId` keeps its verdict, so nothing signed moves. A reader who wants the precise cause reads the second block; a reader of the first is not misled about the outcome, only about the reason — which is the residual this decision accepts rather than pays to remove.

**The classification is now a third consumer of `observeCliInvocation`'s allowlist, deliberately.** This is a coupling, and it is the point: the alternative was a fourth hand-written copy of the followable rule, and this arc has already paid three times for that shape of drift. Widening the allowlist or the follow producer will change what this module reports, which is correct behaviour and not a regression.

**The `list` divergence is now known repo state.** `renderOfferFollowUps` prints a follow-up command for a bare `list` offer that cannot land an edge. No corpus instance exists; it is pinned rather than fixed, because fixing it means touching the lockstep pair that leg 9 and contract 6 both bind.

**Not in scope, unchanged.** Acting on the resulting evidence — ranking, prefetch, or any change to what context is pulled — stays outside this arc, on the line ADR-0235 clause 7 holds. The GUIDANCE change ADR-0260 reaches (agents actually re-using the offered form) is likewise untouched by this decision and still outstanding.

## References

- ADR-0260 — the decision this amends: offers carry an identity and the answering command names it; D4 (under-report, never repair) and D7 (declare the gaps) both stand. Its Context's "majority of a typical offer set" claim and its Consequences' "closing it is a candidate increment in its own right" clause are both annotated in place as overtaken by this ADR (ADR-0139 correction, 2026-08-06).
- `asset:unrun-check-is-unverified-not-refuted` — D2's general rule REHOMED into the Library so a future report reaches it while authoring its buckets rather than by opening this ADR (ADR-0139 rehome, ADR-0095 D4, `asset:reference-dont-restate`). Its fourth face states the mechanism D2 turns on: the unknown bucket is gated by a capability predicate, so widening that predicate adds no observations and only moves items into the negative one. The reasoning below is the decision record and stays here in full; the artifact carries the reusable form.
- ADR-0235 — clause 3 bans temporal proximity as proof; clause 6 requires the coverage declaration this measurement makes quantitative; clause 7 holds observability before behaviour change.
- `packages/context-traversal-capture/src/offer-candidate-sets.ts` — `OFFER_CANDIDATE_SET_CAVEATS`, home of `doc-refs-are-offered-but-follows-are-unobservable`.
- `packages/context-traversal-capture/src/follow-offer-edges.ts` — `renderOfferFollowUps`'s skip rule, and `emitFollowedEdge`'s `library-artifact`-only answering surface.
- `packages/context-traversal-capture/src/decision-point-playback.ts` — `isFollowableOfferId`, whose verdict this decision preserves and whose stated reason it corrects.
- `packages/context-traversal-capture/src/observe-cli.ts` — the read allowlist the classification is derived from.
- Arc `context-decision-tree-arc` — the initiative this ADR is filed under; increments #1003, #1005 and #1143 are the three surfaces it builds on.
