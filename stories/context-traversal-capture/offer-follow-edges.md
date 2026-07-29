---
id: "offer-follow-edges"
tier: capability
story: context-traversal-capture
arc: context-decision-tree-arc
title: "A read that carries an offer id declares the edge it answered; a bare read declares none"
outcome: "A library artifact read invoked with an offer id on the command line stamps that edge on its own visit and records it, and a read invoked without one records no edge at all."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, terminal-boundary-observations, artifact-offer-candidate-sets]
decisions: [235, 260]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/follow-offer-edges.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/follow-offer-edges.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/follow-offer-edges.test.ts"
    sourceFile: "packages/context-traversal-capture/src/follow-offer-edges.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/follow-offer-edges.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/follow-offer-edges.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# A read that carries an offer id declares the edge it answered; a bare read declares none

## Guidance

Author the seven contracts below under these ids, VERBATIM — the leaf's test titles must name them
(`spec.contracts` never reaches the leaf, so `check:coverage` reads 0/7 unless the ids appear here):
`a-follow-up-command-carries-the-offer-id-of-the-render-that-printed-it`,
`only-an-observable-read-shape-plans-an-offer-id`,
`the-offer-id-travels-in-argv-and-is-never-resolved-from-the-trace`,
`a-followed-read-stamps-its-own-visit-and-emits-one-edge-naming-the-offer`,
`a-malformed-or-self-answering-offer-id-records-a-read-with-no-edge`,
`composed-coverage-declares-followed-edges-and-candidate-follow-causality`,
`the-caveats-carry-the-sharpened-command-form-gap-and-the-unrepairable-under-report`.

**What this closes, and why the sibling had to land first.** `artifact-offer-candidate-sets` records
what a `library artifact <id>` render OFFERED. This capability records which offer a later read
ANSWERED. `FollowedEdgeEvent.candidateSetId` is required and non-optional, so a followed edge is
literally uninstantiable until a candidate set exists — the dependency is enforced by the schema, not
by convention.

**THE REFUSAL IS THE POINT, and contract 3 is the contract to write first.** ADR-0260 D3 chose
candidate B (the offer's identity travels in argv) and named the variant it REFUSES: having the CLI
resolve "the most recent candidate set containing this node" from the session's own trace. That is
candidate C wearing candidate B's clothes, and it is fenced twice — by ADR-0235 clause 3 (temporal
proximity is not proof) and by D3 itself. **If the id is not on the command line, there is no edge.**
The refusal is enforced by SHAPE, not by discipline: `emitFollowedEdge` takes the invocation's own
batch plus an offer parsed from argv, and is handed no prior events and no trace reader — so a
recency join is structurally impossible here rather than merely untested, the same way
`emitCandidateSet` cannot see the future.

**ADR-0260 D4 — under-reporting is the ACCEPTED failure mode, and inference may never repair it.** An
agent that types the bare command produces a read with no `followedEdgeId`, which draws as no
decision point. No pass, renderer, or backfill in this package or downstream may correlate that gap
away. A thin tree is the honest cost; that asymmetry (wrong-never, missing-sometimes) is what decided
the fork.

**Shape — the exports from `follow-offer-edges.ts`:**

```ts
export const OFFER_FLAG = "--from-offer";
export interface FollowedOffer { readonly candidateSetId: string; readonly fromVisitId: string }
export interface OfferIdentity { readonly visitId: string; readonly candidateSetId: string }
export type FollowDeps = Pick<ObserveCliDeps, "sessionId" | "now">;
export function parseOfferFollow(argv: readonly string[]): {
  readonly argv: readonly string[];
  readonly followed: FollowedOffer | null;
};
export function planOfferIdentity(argv: readonly string[], mintVisitId: () => string): OfferIdentity | null;
export function renderOfferFollowUps(candidateSetId: string, refs: readonly string[]): string[];
export function emitFollowedEdge(
  observed: readonly ContextTraversalEvent[],
  followed: FollowedOffer | null,
  deps: FollowDeps,
): ContextTraversalEvent[];
export const FOLLOW_OFFER_EDGE_COVERAGE: ContextTraversalCoverage;
export const FOLLOW_OFFER_EDGE_CAVEATS: readonly CoverageCaveat[];
```

Import `CANDIDATE_SET_PREFIX`, `candidateSetIdOf`, `isOfferableArtifactRead`, `offerIdOf`,
`LIBRARY_ARTIFACT_SURFACE`, `OFFER_CANDIDATE_SET_CAVEATS`, `OFFER_CANDIDATE_SET_COVERAGE` and the
`CoverageCaveat` type from `./offer-candidate-sets.js`; `ObserveCliDeps` from `./observe-cli.js`.
**Never re-declare the `candidate-set:` prefix, the `asset:` stripping rule, or the dispatch
predicate here** — a second copy of any of them is a drift that silently unjoins offers from follows.
Add NO new package and NO new `package.json` dependency.

**Why the id shape carries the from-visit.** `CandidateSetEvent` has no `visitId` field, so
`candidate-set:<rendering visitId>` is the ONLY carrier of which visit made the offer. That is what
lets an answering read name `fromVisitId` from the id ALONE — an exact join, computed from a string
on its own command line, with no trace read anywhere. Parsing is therefore: the value must start with
`CANDIDATE_SET_PREFIX` and the remainder must be non-blank; `fromVisitId` is that remainder.

**`planOfferIdentity` exists to stop DANGLING ids.** A render that prints an offer id its invocation
will not record leaves an id an agent can return, minting an edge that names a candidate set which
never existed. So an offer id is planned only where a candidate set will actually be recorded: the
argv must satisfy `isOfferableArtifactRead` (the same predicate the sibling offers on — mirror it,
never widen it), and `mintVisitId` must not be called otherwise.

Two other capture preconditions — an absent session identity, and `STORYTREE_TRAVERSAL=off` — are the
CALLER's to check, and they are not optional. (An earlier draft of this paragraph argued they needed
no gate at all, on the grounds that both suppress the FOLLOW's capture exactly as they suppress the
OFFER's, so neither could produce an edge naming an unrecorded offer. That argument is about what gets
RECORDED and says nothing about what gets PRINTED — and printing is half of the envelope. The story's
standing UAT leg 5 falsified it immediately: an opted-out run still printed a fresh, per-invocation
offer id, which both broke ADR-0241 **D2**'s opt-out-clean envelope and handed out an id nothing had
recorded. The clause is D2, not D3: D3's envelope promise is only that no telemetry FAILURE alters
one, which an opted-out run never engages — ADR-0241's own Consequences draw that line.) So
`main.ts` asks all three questions before it plans an id: the shape, `isTraversalCaptureEnabled()`, and
a resolvable session identity.

**`renderOfferFollowUps` prints a command per FOLLOWABLE offer, in authored order.** Map each raw ref
through `offerIdOf` (so the id printed on the command line is byte-identical to the id recorded in
the candidate set), then emit `storytree library artifact <offerId> --from-offer <candidateSetId>`.
SKIP any offer id carrying a scheme prefix — an id containing `:` — because `doc:` refs resolve to a
file rather than to an allowlisted CLI read: there is no command that could follow one, and printing
a command that cannot run would forge a follow-up form for the exact gap the caveats declare. A
`doc:` ref is still OFFERED by the sibling capability; it simply gets no follow-up command here.
Under-report the FOLLOW; never under-report the OFFER.

**`emitFollowedEdge` stamps AND appends — both, or the declaration lies.** The visit gains
`followedEdgeId`; a `followed_edge` event is appended carrying `edgeId`, the argv-carried
`candidateSetId`, the parsed `fromVisitId`, and the answering visit's `visitId` as `toVisitId`. The
edge id is derived from the pair (`edge:<fromVisitId>:<toVisitId>`), never minted randomly, so the
function needs no id source and re-running it over its own output appends nothing new. It is a
total no-op — `observed` returned unchanged, never mutated — when `followed` is null, when the batch
holds no `library-artifact` render visit, when the render visit already carries a `followedEdgeId`,
and when `fromVisitId` equals the answering visit's own `visitId` (a read cannot answer its own
offer). Narrow the stamp to the `library-artifact` surface visit and no other: that is the only
surface whose renders print the flag, and a `--from-offer` pasted onto any other shape records no
edge — an honest under-report under D4, not an error.

**`parseOfferFollow` always STRIPS, even when it refuses.** Accept both `--from-offer <value>` and
`--from-offer=<value>`. The flag and its value are removed from the returned argv in every case,
including a malformed or missing value, because the read still happened and the remaining tokens must
still present the bare shape `observeCliInvocation` allowlists — leaving the flag in place would make
a followed read observe NO VISIT AT ALL, silently deleting the very read the mechanism exists to
attribute. A refused value yields `followed: null`: an edge is minted only from an id whose shape
proves it came from a real offer.

**Never throws, and telemetry never breaks a command.** Every input shape — an empty argv, a flag with
no following token, a batch with no visits, an unparseable id — returns a value.

**No `as` casts of any kind in the test file.** Narrow the `ContextTraversalEvent` union through the
exported `isContextVisitEvent` and explicit `kind` checks plus `assert.ok`, the way
`offer-candidate-sets.test.ts` does. The proof run is tsx-driven so types are stripped: a cast makes
the assertion prove nothing while `check:coverage` still counts the test, and the package typecheck
goes red only AFTER the verdict is signed. Annotate a composed event with its OWN member type
(`FollowedEdgeEvent`), never with the whole `ContextTraversalEvent` union — a union annotation is
excess-property-checked against every member and reddens the typecheck after the verdict is signed.
`surfaceId`, `parentVisitId`, `priorVisitId` and `followedEdgeId` are all OPTIONAL — narrow presence
before any comparison rather than comparing two possibly-`undefined` values.

**Coverage composes, it never rewrites.** `FOLLOW_OFFER_EDGE_COVERAGE` is built FROM
`OFFER_CANDIDATE_SET_COVERAGE` by moving `event:followed_edge` AND
`field:candidate_follow_causality` from `omitted` to `supported` and changing nothing else — the same
composition move `revisit-links.ts`, `descend-agent-refs.ts` and `offer-candidate-sets.ts` already
make. `adapterId` STAYS `terminal-cli-dispatch`.

**The caveats compose too, and one of them gets SHARPER.** `OFFER_CANDIDATE_SET_CAVEATS` was written
when nothing could observe a follow at all, so its
`follow-completeness-depends-on-the-offered-command-form` note says only that the agent must re-use
the bare read form. That is now an understatement: with a producer in place, the agent must re-use
the offered form *carrying the offer id*, and a bare command loses the edge outright. The outer layer
therefore carries a note the inner one could not have written, under the SAME stable id (the id is
what a reader and a pin match on), plus a third caveat stating the D4 asymmetry: a visit with no
`followedEdgeId` means either the offer was not answered or the mechanism was bypassed, and the two
are indistinguishable BY DESIGN and are never repaired by inference. The `doc:` caveat carries
through untouched. The inner constant is left exactly as it is — it stays true of the inner adapter.

**Fences.** No filesystem, no clock of its own, no id generation of its own, no store, no
`@storytree/drive` import, no new package, no new dependency, no retention/pruning/cap. Do NOT read
or accept prior events, a trace directory, a session file, or any reader — accepting one at all is
the refused shape, whether or not it is consulted. Do NOT rank, prefetch, or change what context is
pulled (outside the arc, ADR-0235 clause 7). Do NOT edit `observe-cli.ts`, `offer-candidate-sets.ts`,
`terminal-capture.ts`, `query-render.ts`, `main.ts`, `commands.ts`, or the UAT file — the CLI wiring
and the playback are separate, later steps.

**Files.** `packages/context-traversal-capture/src/follow-offer-edges.ts` and
`follow-offer-edges.test.ts`. The package scaffold and every import above already exist.

## Contracts

1. **`a-follow-up-command-carries-the-offer-id-of-the-render-that-printed-it`**
   - **asserts —** `renderOfferFollowUps("candidate-set:v1", ["asset:a", "doc:decisions/0001-z.md",
     "asset:b", "bare-thing"])` returns exactly
     `["storytree library artifact a --from-offer candidate-set:v1",
     "storytree library artifact b --from-offer candidate-set:v1",
     "storytree library artifact bare-thing --from-offer candidate-set:v1"]` — every command naming
     the SAME offer id, the `asset:` prefix stripped so the printed id is byte-identical to the id
     the sibling records, the `doc:` ref carrying no follow-up command at all, and the AUTHORED order
     preserved. Assert the round-trip on the returned strings rather than on a composed value: feed
     each returned command's argv back through `parseOfferFollow` and assert every one yields
     `followed.candidateSetId === "candidate-set:v1"` and an argv that satisfies the bare read shape.
     Then assert an empty ref list returns `[]`. **Falsifiability —** a first run that comes back
     green is the diagnosis, not the result: this assertion must fail against an implementation that
     prints the bare command with no offer id (the whole mechanism), against one that prints a
     `doc:` follow-up (a command that cannot run, forging a follow-up for the declared gap), against
     one that keeps the `asset:` prefix (the printed id would never match a recorded offer), and
     against one whose emitted command does not parse back to the offer it names.
2. **`only-an-observable-read-shape-plans-an-offer-id`**
   - **asserts —** `planOfferIdentity(["library","artifact","x"], mint)` returns
     `{visitId: "v1", candidateSetId: "candidate-set:v1"}` for a `mint` returning `"v1"`, and the
     `candidateSetId` equals `candidateSetIdOf(visitId)` rather than a second, hand-built string;
     while `["library","artifact","list"]`, `["library","artifact","x","--pg"]`,
     `["library","artifact"]`, `["library"]`, `["tree","x"]`, `["agents","x"]` and `[]` each return
     null AND leave a counting `mint` stub uncalled. **Falsifiability —** a first run that comes back
     green is the diagnosis, not the result: this assertion must fail against an implementation that
     always mints (every `--pg` read would print a dangling id naming an offer nothing recorded),
     against one keying on `argv[0] === "library" && argv[1] === "artifact"` alone, and against one
     that mints an id then discards it (the call count is what proves the gate ran first).
3. **`the-offer-id-travels-in-argv-and-is-never-resolved-from-the-trace`**
   - **asserts —** the D3 refusal, against the strongest possible temptation. Build a batch holding a
     `library-artifact` visit to node `x` AND a `candidate_set` whose `candidateNodeIds` contains
     `x` — precisely the input a recency-joining implementation would use to "obviously" attribute
     this read. Parse a BARE argv (`parseOfferFollow(["library","artifact","x"])`) and assert its
     `followed` is null and its returned argv is unchanged; then assert
     `emitFollowedEdge(batch, null, deps)` returns a batch whose
     `JSON.parse(JSON.stringify(...))` is deepEqual to the input's — no `followedEdgeId` stamped on
     any visit, and NO `followed_edge` event of any kind. **Falsifiability —** a first run that comes
     back green is the diagnosis, not the result: this assertion must fail against an implementation
     that joins a read to the most recent candidate set containing its `nodeId` (candidate C in
     disguise, fenced by ADR-0235 clause 3 and ADR-0260 D3), against one that stamps an edge whenever
     any candidate set is present in the batch, and against one that mutates the passed batch in
     place.
4. **`a-followed-read-stamps-its-own-visit-and-emits-one-edge-naming-the-offer`**
   - **asserts —** `parseOfferFollow(["library","artifact","y","--from-offer","candidate-set:v1"])`
     returns argv `["library","artifact","y"]` — the bare shape `observeCliInvocation` allowlists —
     and `followed` `{candidateSetId: "candidate-set:v1", fromVisitId: "v1"}`; the `=`-joined form
     `--from-offer=candidate-set:v1` parses identically. Then, on
     `emitFollowedEdge([visitToY], followed, deps)` where `visitToY` is a `library-artifact` visit
     with `visitId: "v2"`: the returned batch holds exactly one `followed_edge`; its `candidateSetId`
     is the argv-carried `"candidate-set:v1"`; its `fromVisitId` is `"v1"`; its `toVisitId` is `"v2"`;
     the returned visit carries `followedEdgeId` EQUAL to that event's `edgeId` (read from the
     returned events, never from a value the test composed); every returned event parses through
     `ContextTraversalEvent`; and re-running `emitFollowedEdge` over its OWN output with the same
     `followed` appends nothing new. **Falsifiability —** a first run that comes back green is the
     diagnosis, not the result: this assertion must fail against an implementation that appends the
     edge without stamping the visit (`field:candidate_follow_causality` would then be a claim the
     visit cannot support), against one that stamps without appending, against one whose `toVisitId`
     is the offering visit rather than the answering one, against one that derives `fromVisitId` from
     anything but the id on the command line, and against one that appends a duplicate edge on the
     re-run.
5. **`a-malformed-or-self-answering-offer-id-records-a-read-with-no-edge`**
   - **asserts —** `parseOfferFollow` returns `followed: null` for `--from-offer` with no following
     token, `--from-offer notanoffer`, `--from-offer candidate-set:` and `--from-offer=` — and in
     EVERY one of those cases the returned argv is `["library","artifact","y"]`, the flag and its
     value stripped, so the read is still observed as a visit. Then: `emitFollowedEdge` returns the
     batch unchanged when the batch holds no `library-artifact` visit, when the render visit already
     carries a `followedEdgeId`, and when `followed.fromVisitId` equals the render visit's own
     `visitId`. **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that accepts any string as an offer
     id (an edge naming an offer that cannot exist), against one that leaves a refused flag in the
     returned argv (the answering read would observe no visit at all — the mechanism would delete the
     read it exists to attribute), and against one that lets a visit answer its own offer.
6. **`composed-coverage-declares-followed-edges-and-candidate-follow-causality`**
   - **asserts —** `ContextTraversalCoverage.parse(FOLLOW_OFFER_EDGE_COVERAGE)` succeeds; `adapterId`
     is still `terminal-cli-dispatch`; `event:followed_edge` AND `field:candidate_follow_causality`
     are both in `supported` and in NEITHER case in `omitted`; every feature
     `OFFER_CANDIDATE_SET_COVERAGE` declared supported — INCLUDING `event:candidate_set`,
     `field:parent_visit_id` and `field:prior_visit_id` — is still supported; and
     `supported.length + omitted.length === CoverageFeature.options.length`. **Falsifiability —** a
     first run that comes back green is the diagnosis, not the result: this assertion must fail
     against a declaration that adds a feature to `supported` without removing it from `omitted` (the
     schema refuses both-ways), against one that claims `event:followed_edge` while leaving
     `field:candidate_follow_causality` omitted (the edge and the causality field arrive together or
     the declaration is half-honest), and against one that drops an inner layer's feature.
7. **`the-caveats-carry-the-sharpened-command-form-gap-and-the-unrepairable-under-report`**
   - **asserts —** `FOLLOW_OFFER_EDGE_CAVEATS` holds exactly three caveats; their ids are
     `doc-refs-are-offered-but-follows-are-unobservable` (carried through with its note byte-identical
     to the inner layer's), `follow-completeness-depends-on-the-offered-command-form` (the SAME id,
     with a note that DIFFERS from the inner layer's — asserted as a difference against
     `OFFER_CANDIDATE_SET_CAVEATS`, not as matched prose), and a third naming the D4 asymmetry, whose
     note is present and non-empty after trimming; and `renderCoverageCaveats(FOLLOW_OFFER_EDGE_CAVEATS)`
     RETURNS a block containing all three ids and all three notes, asserted on the returned string.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against a list that carries the inner note through unchanged (understating a
     gap that just got sharper — a bare command now loses an edge outright), against one that drops
     the `doc:` caveat while composing, and against a renderer that prints the ids but drops a note.

## Integration evidence

`packages/context-traversal-capture/src/follow-offer-edges.test.ts` runs entirely in memory over
hand-built argv arrays and event fixtures; no temporary directory, no real `HOME`, no store and no
filesystem is involved, because this unit touches none of them — and contract 3's whole claim is that
it CANNOT touch a trace. Every assertion reads what `parseOfferFollow`, `planOfferIdentity`,
`renderOfferFollowUps`, `emitFollowedEdge` and `renderCoverageCaveats` RETURNED — never a value the
test composed — and parses the events through increment 1's `ContextTraversalEvent` vocabulary; the
batch's untouched-ness is asserted on the JSON round-trip so it describes the bytes the sink will
write rather than an in-memory identity. Contract 1 closes its own loop by feeding the rendered
commands back through the parser, so the printed form and the parsed form are proven to be the same
mechanism rather than two hand-matched strings. The coverage contract asserts through
`ContextTraversalCoverage.parse` so the closed-enum exhaustiveness is enforced by the schema rather
than by a hand-counted list.
