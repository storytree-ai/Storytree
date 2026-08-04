---
id: "decision-point-playback"
tier: capability
story: context-traversal-capture
arc: context-decision-tree-arc
title: "The replay draws the branch taken and the branches not taken, and says so when it cannot"
outcome: "A replay carrying a recorded offer renders that offer's every candidate with what the trace deterministically says happened to it — followed, not followed, unfollowable, or ambiguous — and surfaces every recorded follow it could not resolve rather than dropping it."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, artifact-offer-candidate-sets, offer-follow-edges]
decisions: [235, 260]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/decision-point-playback.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/decision-point-playback.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/decision-point-playback.test.ts"
    sourceFile: "packages/context-traversal-capture/src/decision-point-playback.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/decision-point-playback.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/decision-point-playback.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# The replay draws the branch taken and the branches not taken, and says so when it cannot

## Guidance

Author the seven contracts below under these ids, VERBATIM — the leaf's test titles must name them
(`spec.contracts` never reaches the leaf, so `check:coverage` reads 0/7 unless the ids appear here):
`a-decision-point-renders-the-branch-taken-and-the-branches-not-taken`,
`the-join-is-the-recorded-edge-and-never-a-node-name-or-a-recency-match`,
`an-edge-that-answered-something-the-offer-did-not-contain-is-never-snapped-to-a-candidate`,
`an-unresolvable-follow-is-surfaced-rather-than-dropped`,
`a-repeated-offer-is-ambiguous-only-when-an-edge-actually-lands-on-it`,
`an-unfollowable-offer-renders-unobservable-and-never-as-a-declined-branch`,
`a-replay-with-no-recorded-offer-renders-no-decision-section-at-all`.

**What this closes.** `artifact-offer-candidate-sets` records what a render OFFERED;
`offer-follow-edges` records which offer a later read ANSWERED. Both are now emitted, and the replay
already prints one line per event — but a `candidate_set` line prints only a COUNT
(`candidates=4`), so the offered ids are nowhere on screen and **an unfollowed branch is invisible**.
That is the whole gap between a containment chain and a decision tree: a tree drawn only from reads
that happened cannot answer "what else was on the table here?". This capability is the READ side that
makes the recorded offer legible — it emits nothing, adds no event kind and no field.

**THE JOIN IS ALREADY DETERMINISTIC — do not invent one.** `FollowedEdgeEvent.candidateSetId` is
required and names the offer exactly; `toVisitId` names the answering visit; that visit carries
`nodeId`. So "which candidate was followed" is read off recorded fields in three hops, with no
matching, no scoring, and no proximity anywhere. **`nodeId` equality is NOT a join** — a candidate is
followed only because an edge naming this set resolves to a visit on it, never because a visit
somewhere in the trace happens to read a node the set offered. That is candidate C wearing candidate
B's clothes, fenced by ADR-0235 clause 3 and by ADR-0260 D3, and contract 2 presents exactly that
temptation.

**ADR-0260 D4 governs every gap: under-report, never repair.** Where the trace does not prove what
happened, the render says so — it never picks the likelier candidate, never drops an inconvenient
edge, and never fills a hole by correlation. Three distinct honest-gap shapes exist and they must
render distinguishably, because collapsing them re-introduces exactly the inference the arc refuses:

- **not followed** — the offer is followable and nothing recorded answered it. (Which, per the
  standing caveat, means either it was genuinely not taken OR the follow mechanism was bypassed. The
  render may not distinguish those two and must not pretend to.)
- **unobservable** — the offer carries a scheme prefix (a `doc:` ref), so no CLI read exists that
  could ever follow it. Rendering one as "not followed" would report a branch the agent declined when
  in fact it was never a branch this telemetry could see the agent take — over-reporting declines is
  a distortion of the exact quantity the arc measures.
- **ambiguous** — the same node id was offered more than once in ONE set and an edge landed on it, so
  which offer slot was answered cannot be said.

**Shape — the exports from `decision-point-playback.ts`:**

```ts
export type CandidateOutcome =
  | { readonly status: "followed"; readonly toVisitId: string; readonly edgeId: string }
  | { readonly status: "not-followed" }
  | { readonly status: "unobservable"; readonly reason: string }
  | { readonly status: "ambiguous"; readonly reason: string; readonly edgeIds: readonly string[] };

export interface DecisionCandidate { readonly nodeId: string; readonly outcome: CandidateOutcome }

export type UnresolvedReason =
  | "answering-visit-absent"
  | "answered-a-node-the-offer-did-not-contain"
  | "offer-absent-from-this-trace";

export interface UnresolvedFollow {
  readonly edgeId: string;
  readonly candidateSetId: string;
  readonly toVisitId: string;
  readonly reason: UnresolvedReason;
}

export interface DecisionPoint {
  readonly candidateSetId: string;
  readonly surfaceId: string;
  readonly candidates: readonly DecisionCandidate[];
  readonly unresolved: readonly UnresolvedFollow[];
}

export interface DecisionPointReport {
  readonly points: readonly DecisionPoint[];
  readonly orphanFollows: readonly UnresolvedFollow[];
}

export function computeDecisionPoints(events: readonly ContextTraversalEvent[]): DecisionPointReport;
export function renderDecisionPoints(report: DecisionPointReport): string;
export function isFollowableOfferId(offerId: string): boolean;
```

`CandidateOutcome` is a DISCRIMINATED UNION, not a status plus optional fields: the repo runs
`exactOptionalPropertyTypes`, so a `followed` outcome carrying its visit and edge as optionals would
typecheck differently at the composition site than at the read site. Narrow on `status` and read the
extra members inside the branch.

**`computeDecisionPoints` — the algorithm, stated so it cannot drift into a match.**

1. Index every `ContextVisitEvent` by `visitId` (use the exported `isContextVisitEvent`, never a
   hand-rolled `kind` list — the visit kinds are the vocabulary's to own).
2. Group `followed_edge` events by their `candidateSetId`.
3. For each `candidate_set` event, in observed order, produce one `DecisionPoint`. For each edge
   naming that set, resolve `toVisitId` through the index:
   - no such visit → `unresolved` with `answering-visit-absent`;
   - a visit whose `nodeId` is not in this set's `candidateNodeIds` → `unresolved` with
     `answered-a-node-the-offer-did-not-contain`;
   - otherwise the edge RESOLVES onto that node.
4. For each entry of `candidateNodeIds`, in AUTHORED order, keeping duplicates as separate entries:
   - the node appears more than once in this set AND at least one edge resolved onto it → `ambiguous`
     carrying every resolving edge's id;
   - else an edge resolved onto it → `followed` carrying that edge's `toVisitId` and `edgeId`;
   - else `isFollowableOfferId(nodeId)` is false → `unobservable`;
   - else → `not-followed`.
5. A `followed_edge` whose `candidateSetId` matches no `candidate_set` in these events is an ORPHAN:
   collect it into `report.orphanFollows` with `offer-absent-from-this-trace`. It is never attached to
   some other set and never discarded.

**`isFollowableOfferId` mirrors `renderOfferFollowUps`'s skip rule and contract 6 PINS the two in
lockstep.** That sibling skips any offer id containing `:` when printing follow-up commands, because
a `doc:` ref has no allowlisted CLI read to follow. The same rule decides `unobservable` here. The
rule therefore exists in two modules, which is a drift the arc has already paid for elsewhere — so
contract 6 does not re-state the rule, it asserts AGREEMENT by running `renderOfferFollowUps` over
the same ref list and requiring that the ids it declined to print a command for are exactly the ids
this render marks `unobservable`. Import `renderOfferFollowUps` from `./follow-offer-edges.js`.

**`renderDecisionPoints` returns `""` for an empty report** — no heading, no blank line, nothing —
so the caller appends nothing to a replay that recorded no offer. Otherwise return a block opening
with the line `decision points:` and, per point:

```
  <candidateSetId> (surface=<surfaceId>) — offered N: followed A, not followed B, unobservable C, ambiguous D
    [followed]      <nodeId> (visit=<toVisitId>, edge=<edgeId>)
    [not-followed]  <nodeId>
    [unobservable]  <nodeId> — <reason>
    [ambiguous]     <nodeId> — <reason>
    [unresolved]    edge=<edgeId> to=<toVisitId> — <reason>
```

Candidates render in AUTHORED order — never sorted, never grouped by status, and never with the
followed one hoisted to the top. The order a Sources block offered its refs in is itself observed
data, and re-ordering it to make the picture tidy is a quiet edit to the evidence. Omit a zero-valued
term from the summary line rather than printing `ambiguous 0`. Close the block with the orphan
section only when `orphanFollows` is non-empty:

```
  follows whose offer is absent from this trace:
    [unresolved]    edge=<edgeId> set=<candidateSetId> to=<toVisitId> — <reason>
```

**Never throws, and a render is total.** An empty event list, a set whose every candidate is a `doc:`
ref, an edge pointing at nothing, a visit with no `nodeId` match anywhere — each returns a value.
Telemetry never breaks a command.

**Fences.** No filesystem, no clock, no store, no id generation, no `@storytree/drive` import, no new
package, no new dependency. Do NOT sort, rank, prefetch, or change what context is pulled (outside
the arc, ADR-0235 clause 7). Do NOT read a trace directory, a session file, or any reader — this
function is handed the events it judges and nothing else.

**Do NOT touch coverage, and that is a decision rather than an oversight.** This capability emits
NO event and NO field: it renders `event:candidate_set`, `event:followed_edge` and
`field:candidate_follow_causality`, all three of which `FOLLOW_OFFER_EDGE_COVERAGE` already declares
`supported`. So `offer-candidate-sets.ts`, `follow-offer-edges.ts`, `descend-agent-refs.ts`,
`revisit-links.ts`, `observe-cli.ts` and `replay-adapters.ts` are all left ALONE — there is no new
layer to compose and no third consumer to hand-edit. Adding a coverage constant here would claim an
emission that does not exist.

**Do NOT edit `query-render.ts`, `terminal-capture.ts`, `main.ts`, `commands.ts`, `traversal.ts` or
the UAT file.** The wiring that puts this block into the replay body, and the UAT leg that proves the
real spawned CLI prints it, are separate later steps in the same increment — authored outside this
leaf's write scope.

**No `as` casts of any kind in the test file.** Narrow the `ContextTraversalEvent` union through the
exported `isContextVisitEvent` and explicit `kind` checks plus `assert.ok`, the way
`follow-offer-edges.test.ts` does. The proof run is tsx-driven so types are stripped: a cast makes
the assertion prove nothing while `check:coverage` still counts the test, and the package typecheck
goes red only AFTER the verdict is signed. Annotate a composed event with its OWN member type
(`CandidateSetEvent`, `FollowedEdgeEvent`), never with the whole `ContextTraversalEvent` union — a
union annotation is excess-property-checked against every member. `surfaceId` and `nodeId` optionality
follows the vocabulary: narrow presence before comparing.

**Files.** `packages/context-traversal-capture/src/decision-point-playback.ts` and
`decision-point-playback.test.ts`. The package scaffold and every import above already exist.

## Contracts

1. **`a-decision-point-renders-the-branch-taken-and-the-branches-not-taken`**
   - **asserts —** over a batch holding a `library-artifact` visit `v1`, a `candidate_set`
     `candidate-set:v1` offering `["arc", "plan", "merge-ceremony"]`, a visit `v2` to node `plan`, and
     a `followed_edge` `{candidateSetId: "candidate-set:v1", fromVisitId: "v1", toVisitId: "v2"}`:
     `computeDecisionPoints` returns exactly one point whose `candidates` are three entries in the
     AUTHORED order `arc`, `plan`, `merge-ceremony`; `plan`'s outcome is `followed` with `toVisitId`
     `"v2"` and `edgeId` equal to the edge event's own `edgeId` (read from the input event, never a
     string the test rebuilt); `arc` and `merge-ceremony` are both `not-followed`; and `unresolved` is
     empty. Then assert on the string `renderDecisionPoints` RETURNED: it contains `arc`,
     `merge-ceremony` AND `plan`, the `plan` line carries `v2`, and the `arc` and `merge-ceremony`
     lines do not. **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that renders only the followed branch
     (the containment chain this arc exists to replace), against one that renders only the count the
     existing `[candidate-set]` line already prints, against one that marks every candidate followed,
     and against one that re-orders the candidates so the followed one leads.
2. **`the-join-is-the-recorded-edge-and-never-a-node-name-or-a-recency-match`**
   - **asserts —** the D3 refusal against the strongest temptation available. Build a batch holding a
     `candidate_set` offering `["arc", "plan"]` and a LATER visit `v2` that reads node `plan` with NO
     `followed_edge` event anywhere and no `followedEdgeId` on the visit — precisely the input a
     name-matching or recency-joining implementation would "obviously" attribute. Assert BOTH `arc`
     and `plan` come back `not-followed`, the point's `unresolved` is empty, and the rendered string
     contains no `[followed]` marker at all. Then add a second `candidate_set` `candidate-set:vX`
     offering `["plan"]` and an edge naming THAT set resolving to `v2`, and assert the FIRST set's
     `plan` is still `not-followed` — an edge belongs to the set it names and to no other, even when
     both sets offered the same node. **Falsifiability —** a first run that comes back green is the
     diagnosis, not the result: this assertion must fail against an implementation that joins a visit
     to a set because the set offered that visit's `nodeId`, against one that joins on the most recent
     set containing the node, and against one that treats any edge in the batch as evidence for every
     set.
3. **`an-edge-that-answered-something-the-offer-did-not-contain-is-never-snapped-to-a-candidate`**
   - **asserts —** a `candidate_set` offering `["arc", "plan"]` with an edge naming that set whose
     `toVisitId` resolves to a visit on node `something-else`: the point's `unresolved` holds exactly
     one entry, with that `edgeId`, that `toVisitId` and reason
     `"answered-a-node-the-offer-did-not-contain"`; BOTH `arc` and `plan` are `not-followed`; and the
     rendered string names the edge. **Falsifiability —** a first run that comes back green is the
     diagnosis, not the result: this assertion must fail against an implementation that silently drops
     the edge (losing a recorded fact to make the picture tidy), against one that marks the first or
     nearest candidate followed, and against one that appends the off-set node to the candidate list as
     though it had been offered.
4. **`an-unresolvable-follow-is-surfaced-rather-than-dropped`**
   - **asserts —** two shapes in one contract, because both are the same obligation. (a) An edge naming
     a KNOWN set whose `toVisitId` matches no visit in the batch — the crash-truncated trace — lands in
     that point's `unresolved` with reason `"answering-visit-absent"`, and every candidate stays
     `not-followed`. (b) An edge whose `candidateSetId` matches NO `candidate_set` in the batch lands in
     `report.orphanFollows` with reason `"offer-absent-from-this-trace"`, is absent from every point's
     `unresolved`, and is named in the rendered string under the orphan heading. Assert also that
     `computeDecisionPoints([])` returns empty `points` and empty `orphanFollows` without throwing.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that drops either shape, against one that attaches an
     orphan edge to whichever set happens to be present, and against one that throws on an edge it
     cannot resolve.
5. **`a-repeated-offer-is-ambiguous-only-when-an-edge-actually-lands-on-it`**
   - **asserts —** a `candidate_set` whose `candidateNodeIds` is `["arc", "plan", "arc"]` (reachable in
     production: `offerIdOf` strips `asset:`, so `asset:arc` and `arc` in one Sources block both
     resolve to `arc`). With NO edge, BOTH `arc` entries render `not-followed` — repetition alone is
     not ambiguity, and reporting it as such would over-report doubt. With an edge naming this set
     resolving to a visit on `arc`, both `arc` entries become `ambiguous`, carrying that edge's id,
     while `plan` stays `not-followed` and NEITHER `arc` entry is reported `followed`. **Falsifiability
     —** a first run that comes back green is the diagnosis, not the result: this assertion must fail
     against an implementation that silently attributes the edge to the first matching occurrence (the
     "likelier parent" pick the arc's end state forbids by name), against one that de-duplicates
     `candidateNodeIds` so the second offer vanishes from the picture, and against one that marks every
     repeated id ambiguous even when nothing was followed.
6. **`an-unfollowable-offer-renders-unobservable-and-never-as-a-declined-branch`**
   - **asserts —** a `candidate_set` offering
     `["arc", "doc:decisions/0260-x.md", "plan"]`: the `doc:` entry's outcome is `unobservable` with a
     non-empty `reason`, and is NOT `not-followed`; `arc` and `plan` are `not-followed`; the rendered
     string marks the three distinguishably. Then the LOCKSTEP pin: run
     `renderOfferFollowUps("candidate-set:v1", ["asset:arc", "doc:decisions/0260-x.md", "plan"])` and
     assert the set of offer ids it printed NO command for is exactly the set of ids this report marks
     `unobservable` — asserted by deriving both sets from the returned values, never from a
     hand-written list. **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that renders a `doc:` ref as a declined
     branch (over-reporting how often the session turned an offer down, a distortion of the exact
     quantity this arc measures), against one that omits `doc:` offers from the picture entirely
     (under-reporting what was on the table — the offer really was printed), and against one whose
     followable-id rule has drifted out of step with the sibling that prints the follow-up commands.
7. **`a-replay-with-no-recorded-offer-renders-no-decision-section-at-all`**
   - **asserts —** for a batch of visits and a `search` event but no `candidate_set` and no
     `followed_edge`, `computeDecisionPoints` returns empty `points` and empty `orphanFollows`, and
     `renderDecisionPoints` returns the EMPTY STRING — not a heading, not a blank line, not
     `decision points:\n  (none)`. **Falsifiability —** a first run that comes back green is the
     diagnosis, not the result: this assertion must fail against an implementation that always emits
     the heading (every pre-offer trace in existence would grow a section announcing an absence, and the
     replay's existing chronological lines are pinned by two signed UAT legs), and against one that
     returns a newline or a whitespace-only string, which appends a blank line to every such replay.

## Integration evidence

`packages/context-traversal-capture/src/decision-point-playback.test.ts` runs entirely in memory over
hand-built event fixtures; no temporary directory, no real `HOME`, no store and no filesystem is
involved, because this unit touches none of them — and contract 2's whole claim is that it cannot
reach anything beyond the events it is handed. Every assertion reads what `computeDecisionPoints` and
`renderDecisionPoints` RETURNED, never a value the test composed: the followed edge's id is read back
off the input event rather than rebuilt as a string, and contract 6 derives BOTH sides of its lockstep
comparison from returned values so the two modules' shared rule is pinned by agreement rather than by
two hand-matched literals. Fixture events are annotated with their own member types and parsed through
increment 1's `ContextTraversalEvent` vocabulary, so a fixture that could not be written to a trace
cannot silently prove anything here.
