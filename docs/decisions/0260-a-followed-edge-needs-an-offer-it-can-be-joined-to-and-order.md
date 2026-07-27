---
status: proposed
arc: context-decision-tree-arc
---
# ADR-0260: A followed edge needs an offer it can be joined to, and ordering cannot supply it

## Status

proposed — raised 2026-07-27 for the owner, who asked why a recorded traversal renders as a chain rather than a decision tree. The question is real and the answer is not a scheduling matter: the arc that produced those traces closed its worklist without ever being able to draw a decision point. This ADR states why, lays out the candidate attribution rules with their honest costs, and asks the owner to choose. It deliberately decides nothing.

## Context

`linked-session-context-arc` delivered depth: as of #968 a read can name the visit it descended from (`parentVisitId`), so a traversal can indent. But the owner's expectation — a tree whose forks are *choices*, where an artifact pointed at several others and the session took one — is still undrawable, and the reason is structural rather than unfinished work.

**A decision point is defined by the branch not taken.** Every event the telemetry currently emits describes a read that happened. A tree assembled from those is a *containment* tree: it shows that B was reached from A, never that C and D were equally available at A and were passed over. That distinction is the whole of what the owner asked for, and no amount of `parentVisitId` coverage produces it.

Two events were defined for this in ADR-0235 clause 2 and neither has ever been emitted:

- `CandidateSetEvent` — `{candidateSetId, surfaceId, candidateNodeIds}`. The offer: what this surface put on the table.
- `FollowedEdgeEvent` — `{edgeId, candidateSetId, fromVisitId, toVisitId}`. The choice: which offer was answered.

Note the second's shape. `candidateSetId` is **required and non-optional**, so a followed edge cannot be constructed at all until a candidate set exists. The dependency is enforced by the schema, not by convention — which is a fair encoding of the semantics, since an edge with no offer behind it is exactly the inference ADR-0235 refuses.

**The blocker on candidate sets is ordinary; the blocker on followed edges is not.** #944 parked `candidate_set` because wiring it would couple two *signed* UAT event-count assertions (`terminal-capture.uat.test.ts:112` and `:137`) to unrelated envelope prose, forcing a deliberate re-proof of a green capability. That is real work with a known shape. `followed_edge` was parked for a different reason: being offered and later read does not entail being followed, and disambiguating repeat offers of the same node needs **ordering** — the input ADR-0235 clause 3 rules out ("temporal proximity is not treated as proof").

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

Two riders, and the first is the more serious. Five of those eight offers are `doc:` entries pointing at ADRs, which are read as files rather than through an allowlisted CLI command — so a follow onto an ADR is invisible to the telemetry today. On this corpus that is the *majority* of a typical offer set, and a tree drawn without it would systematically over-report how often an agent stayed inside the asset graph. Any coverage declaration must say so. Second: an artifact's references are authored, so an offer set is a property of the corpus rather than of the moment, which is what makes it recordable without asking the model anything.

## Decision

None. This ADR presents the fork. The candidates below are the attribution rules available, strongest constraint first.

**Candidate A — within-process offers only.** Emit both events only where a single process renders the offer and performs the read, stamping `followedEdgeId` on the visit directly.

- Deterministic by construction. No ordering, no correlation, no new banned input. Reuses the #968 shape that is already proven.
- Cheapest to build and impossible to get wrong.
- **Records machine-resolved descent, not agent choice.** A renderer that resolves every ref it finds did not choose — it took all of them. This draws the containment tree we already have, with better labels. It does not answer the owner's question.

**Candidate B — the offer's identity travels to the follow.** A candidate set is recorded with its id, and a later invocation *carries* that id back — the `next:` hints become commands that name the offer they came from, so the answering process declares the edge explicitly.

- Deterministic where the id survives, and the failure mode is **under**-reporting: an agent that types the bare command produces a read with no edge, which draws as no decision point rather than a wrong one. That asymmetry matters — the surface stays honest when the mechanism is bypassed.
- Costs a change to the agent-facing command surface, which is a behavioural ask on every agent, not just a schema addition. It also makes the trace's completeness depend on agents using the offered form, which is a soft dependency of a kind the corpus has been careful to avoid elsewhere.
- Open sub-question: whether the id rides in argv, or the CLI resolves it from the session's own recent trace. The second is invisible to the agent but is a correlation in disguise, and would need its own honesty rule.

**Candidate C — join on "this node was in a recent candidate set".** No new plumbing; attribute a read to the most recent set that offered that node.

- Free, and immediately produces a full-looking tree.
- **Refused on the current rules.** Ambiguous whenever a node is offered twice or is reachable another way, and the disambiguator is ordering. ADR-0235 clause 3 already decides against exactly this. Listed so the choice is explicit rather than quietly foreclosed.

**Candidate D — the model declares its own choices.** Refused on its face: ADR-0235 clause 1 and the founding intent of `linked-session-context-arc` both exist to avoid spending model context on self-reporting, and a model-authored path diary is a named anti-goal of the visual contract.

**The secondary question the owner should answer alongside the primary one:** whether ADR-0235 clause 3 is stricter than this use needs. It was written against *temporal proximity* as evidence. Candidate B is not proximity — it is an explicit id — so it arguably never engages clause 3 at all. But a permissive reading of clause 3 is also how candidate C gets smuggled in later, and the clause is currently doing useful work. Narrowing it should be a deliberate act with its own wording, not a side effect of adopting B.

## Consequences

**If A is chosen:** cheap and safe, and the arc should be re-scoped or closed, because it will not deliver decision points. Better to say that up front than to build A and discover the tree still has no forks.

**If B is chosen:** the arc has a real build, spanning the telemetry schema (unblocking `candidate_set`, including the signed-UAT re-proof #944 identified), the CLI envelope (offers become identified), and the playback (drawing unfollowed branches). The completeness of any trace becomes a function of agent behaviour, which is a new class of dependency for this telemetry and should be stated in the adapter's coverage declaration per clause 6 rather than left implicit.

**If C is chosen:** ADR-0235 clause 3 must be superseded, not narrowed, and the visual contract's "causal forks appear only when deterministic metadata proves that multiple offered branches were followed" clause must change with it. The cost is that every drawn fork becomes a probabilistic claim, and the surface loses the property that what it shows is what was observed.

**Whichever is chosen**, the Sources block is where the offer already lives, so `candidate_set` emission is a recording change at a surface that already computes the list — not a new derivation. The cost #944 identified (re-proving two signed UAT event-count assertions) is unchanged and is the honest price of that increment.

**A `doc:` follow stays invisible** under every candidate here, because reading an ADR is a file read rather than an allowlisted CLI command — and on the sample above that is five of eight offers. Any tree drawn from this telemetry will therefore over-report how often a session stayed within the asset graph, which is a distortion of exactly the quantity the arc exists to show. It belongs in the adapter's clause-6 coverage declaration rather than being discovered later from a suspiciously tidy picture, and closing it is a candidate increment in its own right.

**Not in scope, deliberately.** Acting on the resulting evidence — ranking, prefetch, or any change to what context is pulled — stays outside `context-decision-tree-arc`, on the same line ADR-0235 clause 7 holds.

## References

- ADR-0235 — records context traversal at deterministic runtime boundaries; clause 2 defines candidate/followed-edge metadata, clause 3 bans temporal proximity as proof, clause 7 holds observability before behaviour change.
- ADR-0248 — settled the occupancy quantity; its arc's worklist is complete.
- `packages/context-traversal-telemetry/src/traversal-events.ts` — `CandidateSetEvent`, `FollowedEdgeEvent`, and the optional `followedEdgeId` on `visitFields`.
- `docs/design/context-traversal/README.md` — the owner-approved visual contract: explicit-only forks, and the honest single-column fallback where the metadata is absent.
- Arc `linked-session-context-arc`, increment entries #944 (the split verdict that parked both events) and #968 (`parentVisitId`'s first producer).
- Arc `context-decision-tree-arc` — the initiative this ADR is filed under.
