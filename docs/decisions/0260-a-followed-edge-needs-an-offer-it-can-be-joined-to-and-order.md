---
status: accepted
decided: 2026-07-27
arc: context-decision-tree-arc
---
# ADR-0260: A followed edge needs an offer it can be joined to, and ordering cannot supply it

## Status

accepted (2026-07-27) — decided/directed by the owner in conversation on 2026-07-27, choosing candidate B ("offers carry an ID") from the four presented. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Raised the same day, after the owner asked why a recorded traversal renders as a chain rather than a decision tree. The question was real and the answer was not a scheduling matter: the arc that produced those traces closed its worklist without ever being able to draw a decision point. This ADR was filed `proposed` at the owner's direction so the fork could be compared in writing before being settled; the comparison is kept below under *What was weighed*, because the two refusals it records are the fence around the decision.

## Context

`linked-session-context-arc` delivered depth: as of #968 a read can name the visit it descended from (`parentVisitId`), so a traversal can indent. But the owner's expectation — a tree whose forks are *choices*, where an artifact pointed at several others and the session took one — is still undrawable, and the reason is structural rather than unfinished work.

**A decision point is defined by the branch not taken.** Every event the telemetry currently emits describes a read that happened. A tree assembled from those is a *containment* tree: it shows that B was reached from A, never that C and D were equally available at A and were passed over. That distinction is the whole of what the owner asked for, and no amount of `parentVisitId` coverage produces it.

Two events were defined for this in ADR-0235 clause 2 and neither has ever been emitted:

- `CandidateSetEvent` — `{candidateSetId, surfaceId, candidateNodeIds}`. The offer: what this surface put on the table.
- `FollowedEdgeEvent` — `{edgeId, candidateSetId, fromVisitId, toVisitId}`. The choice: which offer was answered.

Note the second's shape. `candidateSetId` is **required and non-optional**, so a followed edge cannot be constructed at all until a candidate set exists. The dependency is enforced by the schema, not by convention — which is a fair encoding of the semantics, since an edge with no offer behind it is exactly the inference ADR-0235 refuses.

**The blocker on candidate sets is ordinary; the blocker on followed edges is not.** #944 parked `candidate_set` because wiring it would couple *signed* UAT event-count assertions in `terminal-capture.uat.test.ts` — the raw `replay.events.length` counts in contracts `a-spawned-read-command-writes-a-replayable-visit` and `two-commands-share-one-session-with-distinct-visits` — to unrelated envelope prose, forcing a deliberate re-proof of a green capability. That is real work with a known shape. `followed_edge` was parked for a different reason: being offered and later read does not entail being followed, and disambiguating repeat offers of the same node needs **ordering** — the input ADR-0235 clause 3 rules out ("temporal proximity is not treated as proof").

**There is a mechanism the schema already anticipates, and it changes the shape of the problem.** `visitFields` carries an optional `followedEdgeId`, so a read can declare at emission time which edge it answers. Where one process both renders the offer and performs the read, that is a *containment fact* and needs no correlation, no ordering, and no inference — the same move that made `agent-ref-descent` honest in #968.

The difficulty is that this is not the interesting case. An agent digging across the Library expresses its choice as a **separate CLI invocation**: it reads an artifact, sees onward pointers, and later runs another command. Two processes, no shared identity, and the second has no idea it is answering the first. That gap is where ordering keeps being reached for, and it is the fork this ADR exists to settle.

**A correction to the standing account, verified on 2026-07-27.** #944 recorded that only `agents <name>` emits a `next:` line resolving to a concrete allowlisted read, and that has been carried since as "the Library barely offers anything, so attribution has nothing to apply to". **The observation is true and the conclusion drawn from it is wrong**, because it looked at the wrong part of the envelope. `next:` is a hint line; the *offer* is the *Sources* block, which every artifact render already emits with explicit ids:

```
Sources:
  Definitions:    - trunk  (asset:trunk)
  Guardrails:     - Approval-gated trunk  (asset:approval-gated-trunk)
  Decisions:      - decisions/0022-ci-green-gate-and-auto-merge.md  (doc:...)
  Other:          - Prove-and-promote ceremony  (asset:prove-and-promote-ceremony)
```

That single `library artifact merge-ceremony` read puts **eight** onward artifacts on the table (the block above is abridged — the Decisions group lists five ADRs), of which the three `asset:` entries resolve to `library artifact <id>`, an allowlisted read shape. **The candidate set does not need to be invented; the renderer already computes it and prints it.** So the Library offers plenty, and attribution is genuinely the first problem rather than the second.

Two riders, and the first is the more serious. Five of those eight offers are `doc:` entries pointing at ADRs, which are read as files rather than through an allowlisted CLI command — so a follow onto an ADR is invisible to the telemetry today. On this corpus that is the *majority* of a typical offer set, and a tree drawn without it would systematically over-report how often an agent stayed inside the asset graph. Any coverage declaration must say so. *(The MAJORITY claim is OVERTAKEN 2026-08-05 by [ADR-0312](0312-the-doc-blind-spot-is-measured-not-closed-an-offer-set-state.md), which measured the corpus instead of sampling it — 682 artifacts, 1500 references, of which `doc:` is 36.7% and followable `asset:` refs are 60.3%. So as a claim about the corpus this sentence is FALSE: the majority of references are followable. It survives only as a claim about the one sampled artifact, where it has since grown stronger (that read now offers 12 refs of which 8 are `doc:`). The over-report risk in the rest of the sentence is untouched and is exactly what ADR-0312 acts on: an individual offer set's unobservable share ranges 0–100% by artifact, which is why the replay now states `offered N, observable M of N` per set rather than carrying any single sampled figure in prose.)* Second: an artifact's references are authored, so an offer set is a property of the corpus rather than of the moment, which is what makes it recordable without asking the model anything.

## Decision

**Offers carry an identity, and the answering command names it.** Candidate B below, chosen by the owner on 2026-07-27.

1. **A read surface that presents onward artifacts emits a `candidate_set` event carrying the ids it offered.** The Sources block is the offer; the renderer already computes that list, so this is a recording change rather than a new derivation.

2. **The offer is recorded whether or not anything follows it.** A candidate set is emitted at render time, independently of what the session does next. This is the load-bearing half: the branches *not* taken exist in the telemetry only because the offer was recorded when it was made, and an implementation that emitted offers lazily — only once something followed — would reproduce the containment tree this decision exists to replace.

3. **The identity travels in argv, not through the trace.** The printed follow-up commands name the offer they came from, and the answering process declares the edge by stamping `followedEdgeId` on its own visit. The variant considered and **refused** is the CLI silently resolving the "most recent" candidate set from the session's own trace: "the most recent set containing this node" is precisely the recency inference this decision declines, so that variant is candidate C wearing candidate B's clothes. If the id is not on the command line, there is no edge.

4. **Under-reporting is the accepted failure mode, and inference may never repair it.** An agent that types the bare command produces a read with no `followedEdgeId`, and that visit draws as no decision point. No downstream pass, renderer, or backfill may fill the gap by correlation. A thin tree is the honest cost of a bypassed mechanism.

5. **ADR-0235 clause 3 stands unamended.** This decision trades in explicit ids rather than temporal proximity, so it never engages the clause. Clause 3 continues to fence out candidate C, and narrowing it remains a deliberate act needing its own ADR — not a side effect of this one.

6. **The signed-UAT cost is paid, not avoided.** Emitting `candidate_set` couples the raw captured-event counts the signed UAT legs in `terminal-capture.uat.test.ts` assert on — the ones #944 identified — so the increment that lands it re-proves that capability deliberately rather than working around the assertions. The assertions are named by contract rather than by line, because a line number is stale the moment the file it points into is edited, which is the very thing this clause commits to doing.

7. **The gaps in adapter coverage are declared, per ADR-0235 clause 6.** Two are known at decision time: that `doc:` follows are unobservable, and that trace completeness depends on agents using the offered command form. Every such gap must be visible in the coverage declaration rather than inferred later from a thin picture.

### What was weighed

**Candidate A — within-process offers only.** Emit both events only where a single process renders the offer and performs the read, stamping `followedEdgeId` on the visit directly.

- Deterministic by construction. No ordering, no correlation, no new banned input. Reuses the #968 shape that is already proven.
- Cheapest to build and impossible to get wrong.
- **Records machine-resolved descent, not agent choice.** A renderer that resolves every ref it finds did not choose — it took all of them. This draws the containment tree we already have, with better labels. It does not answer the owner's question.

**Candidate B — the offer's identity travels to the follow. CHOSEN.** A candidate set is recorded with its id, and a later invocation *carries* that id back — the printed follow-ups become commands that name the offer they came from, so the answering process declares the edge explicitly.

- Deterministic where the id survives, and the failure mode is **under**-reporting: an agent that types the bare command produces a read with no edge, which draws as no decision point rather than a wrong one. That asymmetry is what decided it — the surface stays honest when the mechanism is bypassed.
- Costs a change to the agent-facing command surface, which is a behavioural ask on every agent, not just a schema addition. It also makes the trace's completeness depend on agents using the offered form, which is a soft dependency of a kind the corpus has been careful to avoid elsewhere. Accepted with eyes open, and mitigated only by D7's coverage declaration — not by inference.
- Its open sub-question is settled by D3: the id rides in **argv**. Trace-side resolution was refused as candidate C in disguise.

**Candidate C — join on "this node was in a recent candidate set".** No new plumbing; attribute a read to the most recent set that offered that node.

- Free, and immediately produces a full-looking tree.
- **Refused on the current rules.** Ambiguous whenever a node is offered twice or is reachable another way, and the disambiguator is ordering. ADR-0235 clause 3 already decides against exactly this. Listed so the choice is explicit rather than quietly foreclosed.

**Candidate D — the model declares its own choices.** Refused on its face: ADR-0235 clause 1 and the founding intent of `linked-session-context-arc` both exist to avoid spending model context on self-reporting, and a model-authored path diary is a named anti-goal of the visual contract.

**The secondary question, settled with the primary one:** whether ADR-0235 clause 3 is stricter than this use needs. It was written against *temporal proximity* as evidence; this decision is an explicit id, so it never engages the clause. Clause 3 therefore stands unamended (D5) and keeps doing its work of fencing out candidate C. Narrowing it would still be available later as a deliberate act with its own wording — it is simply not needed here, and adopting it as a side effect would have been the expensive mistake.

## Consequences

**The arc has a real build, spanning three surfaces.** The telemetry schema (unblocking `candidate_set`, including the signed-UAT re-proof #944 identified), the CLI envelope (offers acquire ids and the printed follow-ups carry them), and the playback (drawing unfollowed branches). None of the three is optional: offers without a rendered follow-up form produce ids nobody can return, and edges without a playback change produce data nobody can see.

**Trace completeness becomes a function of agent behaviour**, which is a new class of dependency for this telemetry. Every previous adapter observed a boundary that fired whether or not anyone cooperated; this one records fully only when agents use the offered command form. That is why D4 forbids repairing the gap by inference and D7 forces it into the coverage declaration — the mitigation is honesty about the hole, not a heuristic that hides it.

**The agent-facing command surface changes**, so this decision reaches guidance as well as code. Rendered follow-ups that carry an offer id are only useful if agents actually run them, which makes this partly a corpus/guidance change rather than purely an adapter change. Sequencing that guidance alongside the emission is the first increment's problem, not a later cleanup.

**Candidate C is now fenced twice.** ADR-0235 clause 3 rules out temporal proximity, and D3 rules out the trace-side resolution that would have reintroduced it under this decision's own name. A future proposal to correlate reads to offers must supersede both.

**A `doc:` follow stays invisible**, because reading an ADR is a file read rather than an allowlisted CLI command — and on the sample above that is five of eight offers. Any tree drawn from this telemetry will therefore over-report how often a session stayed within the asset graph, which is a distortion of exactly the quantity the arc exists to show. It belongs in the D7 coverage declaration rather than being discovered later from a suspiciously tidy picture, and closing it is a candidate increment in its own right. *(That last clause is OVERTAKEN 2026-08-05 by [ADR-0312](0312-the-doc-blind-spot-is-measured-not-closed-an-offer-set-state.md), which amends this ADR on exactly this point and is why it carries an `amends` edge here. The gap is MEASURED, not closed, and closing it is now REFUSED on this arc's own honesty rules rather than merely unscheduled: `isFollowableOfferId` gates the `unobservable` bucket, so making a `doc:` ref nominally followable would render every unanswered one `not-followed` — a declined branch the session never declined. Do NOT read this paragraph as a worklist item; the rest of it stands, and the measurement that replaces the increment is the entry at the end of this section.)*

**Not in scope, deliberately.** Acting on the resulting evidence — ranking, prefetch, or any change to what context is pulled — stays outside `context-decision-tree-arc`, on the same line ADR-0235 clause 7 holds.

**D6's cost was FORCED and larger than #944 estimated, recorded 2026-07-28** when D1/D2/D6/D7 landed (capability `artifact-offer-candidate-sets`, story `context-traversal-capture`). #944 identified two coupled assertions; the emission in fact reddened signed legs across **three** contracts — `a-spawned-read-command-writes-a-replayable-visit`, `two-commands-share-one-session-with-distinct-visits`, and `a-spawned-write-command-leaves-no-canary-bytes` — because every one of them seeds its trace with a `library artifact plan` read, and the `plan` artifact carries four references, so each such read now emits a `candidate_set` alongside its visit. This is worth stating because the opposite premise is easy to reach and is false: those fixtures do **not** resolve to an empty offer set, so they could never have survived the emission untouched, and the re-proof was not an elective tidy-up. The legs were converted from raw `replay.events.length` counts to visit-filtered counts — the honest repair, since what each contract was ever asserting is *one read is one visit*, a claim that must not move when a second event kind starts sharing the trace. D6's substance is untouched: the cost was paid deliberately rather than worked around.

**D3 LANDED 2026-07-29, and D7's declaration is now THREE caveats rather than two** (capability `offer-follow-edges`, story `context-traversal-capture`, signed `--real` PASS). `FOLLOW_OFFER_EDGE_CAVEATS` (`packages/context-traversal-capture/src/follow-offer-edges.ts`) carries: `doc-refs-are-offered-but-follows-are-unobservable`, unchanged; `follow-completeness-depends-on-the-offered-command-form`, kept under the **same stable id** but sharpened, because with a producer actually in place the bare command no longer merely risks an unrecorded follow — it loses the edge **outright**, which the pre-D3 note could not truthfully say; and a new `an-unanswered-visit-and-a-bypassed-mechanism-are-indistinguishable`, which states D4's asymmetry in the same body where a reader meets the data, so the thin picture explains itself rather than inviting the join D4 forbids. D7's substance is untouched and in fact better served: the declaration got more honest, not narrower — which is why the clause above declares *the* gaps rather than a fixed count.

**THE THIRD SURFACE LANDED 2026-08-04 — all three the Consequences call non-optional are now built** (capability `decision-point-playback`, story `context-traversal-capture`, signed `--real` PASS at 7/7 contracts, plus the story's ninth machine UAT leg). `traversal show` renders, for each recorded offer, every candidate with what the trace deterministically says happened to it, so **an unfollowed branch is visible for the first time anywhere in the repo** — which is the distance between the containment chain this arc opened against and a decision tree. Four points are worth keeping:

- **The join needed no invention and none was made.** `candidateSetId` names the offer, `toVisitId` names the answering visit, that visit carries `nodeId` — three hops over recorded fields. `nodeId` equality is explicitly NOT a join, and the capability's contract 2 hands the implementation exactly that temptation (a set offering `x` beside a later read of `x` with no edge) and requires `not-followed`. Verified on the real binary, where a bare read of an offered node did leave the branch untaken rather than drawing a fork.
- **D4's under-report needed a VOCABULARY, not just a refusal.** "Nothing recorded answered this" is three different facts, and collapsing them re-introduces the inference D4 forbids: `not-followed` (followable, unanswered), `unobservable` (a `doc:` ref no CLI read could ever follow), and `ambiguous` (the same node offered twice in one set with an edge landing on it — the "same node offered more than once" case the arc's end state names). Rendering a `doc:` offer as `not-followed` would over-report how often a session turned an offer down, which is a distortion of the exact quantity this arc measures.
- **A recorded follow is never dropped to tidy the picture.** An edge whose answering visit is absent, one that answered a node the offer did not contain, and one naming an offer absent from the trace are each surfaced with their reason rather than discarded or re-attached.
- **The build ADDED a derived block rather than rewriting the existing render lines**, because legs 7 and 8 pin `[candidate-set] … candidates=N` and `[followed-edge] …` verbatim: making the offered ids legible by editing those lines would have reddened two signed legs to no purpose. A falsification probe confirmed the new leg is bound to the real behaviour and that both older legs stay green without it.

**Still not delivered:** the GUIDANCE change this decision reaches — agents must actually run the offered form, which is a behavioural ask rather than code.

**THE `doc:` BLIND SPOT IS SETTLED AND WILL NOT BE CLOSED — ADR-0312 (2026-08-05, owner-directed) amends this ADR on exactly that point.** The Consequences above called closing it "a candidate increment in its own right", and that expectation is withdrawn: it is now MEASURED instead. Every recorded offer set renders `offered N, observable M of N` plus a total line stating that the followed counts are over the observable branches and not the offered ones, so the denominator a reader would otherwise take from the `[candidate-set]` count is stated outright. Two findings drove the reversal. First, measured over the live corpus rather than the single `merge-ceremony` sample this ADR quoted: `doc:` refs are 36.7% of 1500 references, not a majority — but the unobservable share of an individual offer set ranges from 0% to 100%, which is why a static prose caveat could never carry it and a per-trace number can. (The sampled artifact itself has since grown to 12 offers of which 8 are `doc:`, so that one figure is now *more* extreme than when written — both readings were reachable from one sample, which is the point.) Second, and decisive: giving `doc:` refs a followable read shape would make the surface LESS honest, because `isFollowableOfferId` gates the `unobservable` bucket — the moment such an offer becomes followable, every unanswered one renders `not-followed`, a *declined branch*, for every agent that keeps reading the ADR as a file, which is how agents are instructed to read them. That is the over-report D4's vocabulary, this story's signed UAT leg 9, and `decision-point-playback`'s own spec each name as the distortion to avoid. D4 is untouched and unengaged: measuring the size of an under-report is not repairing it by correlation.

## References

- ADR-0235 — records context traversal at deterministic runtime boundaries; clause 2 defines candidate/followed-edge metadata, clause 3 bans temporal proximity as proof, clause 7 holds observability before behaviour change.
- ADR-0248 — settled the occupancy quantity; its arc's worklist is complete.
- `packages/context-traversal-telemetry/src/traversal-events.ts` — `CandidateSetEvent`, `FollowedEdgeEvent`, and the optional `followedEdgeId` on `visitFields`.
- `docs/design/context-traversal/README.md` — the owner-approved visual contract: explicit-only forks, and the honest single-column fallback where the metadata is absent.
- Arc `linked-session-context-arc`, increment entries #944 (the split verdict that parked both events) and #968 (`parentVisitId`'s first producer).
- Arc `context-decision-tree-arc` — the initiative this ADR is filed under.
