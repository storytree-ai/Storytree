---
id: "offer-observability-share"
tier: capability
story: context-traversal-capture
arc: context-decision-tree-arc
title: "A decision point states how much of its own offer set the telemetry could not see"
outcome: "Every recorded offer set renders the share of its candidates a follow could actually have landed on, and names why each of the rest could not be followed — so the followed counts beside it are read against the observable denominator rather than the offered one."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, artifact-offer-candidate-sets, offer-follow-edges, decision-point-playback]
decisions: [235, 260, 312]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/offer-observability-share.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/offer-observability-share.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/offer-observability-share.test.ts"
    sourceFile: "packages/context-traversal-capture/src/offer-observability-share.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/offer-observability-share.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/offer-observability-share.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# A decision point states how much of its own offer set the telemetry could not see

## Guidance

Author the seven contracts below under these ids, VERBATIM — the leaf's test titles must name them
(`spec.contracts` never reaches the leaf, so `check:coverage` reads 0/7 unless the ids appear here):
`an-offer-set-states-how-much-of-itself-the-telemetry-could-not-see`,
`an-unobservable-offer-carries-the-reason-a-follow-could-not-land-on-it`,
`the-verdict-is-derived-from-the-real-allowlist-and-never-a-restated-prefix-table`,
`a-node-ref-is-never-reported-as-having-no-cli-read-because-one-demonstrably-exists`,
`a-set-with-nothing-observable-renders-zero-and-never-a-hidden-division`,
`a-replay-with-no-recorded-offer-renders-no-observability-section-at-all`,
`the-denominator-covers-exactly-the-recorded-offers-with-none-dropped-or-added`.

**What this closes, and what it deliberately does NOT.** `decision-point-playback` made the unfollowed
branch visible: every recorded offer renders `followed` / `not-followed` / `unobservable` / `ambiguous`.
What it cannot say is **how much of the picture is missing**. A set that offers 12 refs of which 8 are
`doc:` renders "followed 1" beside 12 entries, and a reader takes 1-of-12 as the decision. The true
statement is 1-of-4: eight of those branches were never branches this telemetry could see taken. That
gap over-reports how often a session stayed inside the asset graph, which is a distortion of the exact
quantity the arc exists to measure. This capability states the denominator. It emits nothing — no event
kind, no field — and consumes only the events it is handed.

**ADR-0312 settles that the gap is MEASURED, not closed.** Do not add a CLI read shape for `doc:` refs,
do not widen `isFollowableOfferId`, and do not print a follow-up command for an unobservable offer. The
reasoning is in the ADR and is load-bearing here: the moment a `doc:` ref becomes nominally followable
it stops rendering `unobservable` and starts rendering `not-followed` — a *declined branch* — for every
agent that read the ADR as a file, which is how agents are instructed to read ADRs. That converts an
honest "I cannot see this" into a false "the session turned this down", which is precisely the
over-report ADR-0260's Consequences, this story's UAT leg 9, and `decision-point-playback`'s own spec
each name as the thing to avoid.

**THE VERDICT IS DERIVED, NEVER RESTATED — this is the whole point of the module.** The repo already
carries the followable/unfollowable rule in two places pinned in lockstep (`isFollowableOfferId` and
`renderOfferFollowUps`), and contract 6 of `decision-point-playback` exists only because a third copy
would silently unjoin offers from follows. So this module adds NO third copy of the rule. It answers
"could a follow have landed here?" by **running the real machinery**:

1. `followArgvFor(offerId)` builds the argv a follow of that offer would use — the ONE hand-authored
   mapping, and it maps a scheme to a command shape, never to a verdict:
   - an id with no `:` → `["library", "artifact", offerId]` (what `renderOfferFollowUps` prints);
   - `node:<id>` → `["tree", <id>]`;
   - anything else → `null`, because no CLI command in the repo reads it.
2. Run `observeCliInvocation(argv, …)` — the REAL allowlist — and look for a visit
   (`isContextVisitEvent`). No argv, or an argv that observes no visit, means **no read shape lands a
   visit** for this offer.
3. A visit whose `surfaceId` is not the one `emitFollowedEdge` will stamp
   (`LIBRARY_ARTIFACT_SURFACE`) means a read exists but **no follow producer accepts its surface**.
4. Otherwise the offer is observable.

Because every step reads the real allowlist and the real producer's accepted surface, widening either
one moves this classification with it and cannot leave a stale table behind.

**The `node:` finding this corrects, stated so it is not re-lost.** `isFollowableOfferId` is
`!offerId.includes(":")`, so `decision-point-playback` renders a `node:` offer `unobservable` with the
reason *"this offer id carries a scheme prefix and has no CLI read that could ever follow it"* — and
that reason is **false**. `storytree tree <id>` IS allowlisted and does observe a `front_matter_read`
on the `tree` surface; what blocks the edge is that `emitFollowedEdge` only stamps a `library-artifact`
visit. The VERDICT (unobservable) is right and does not move; only the stated REASON was wrong. Measured
on the live corpus 2026-08-05: 32 of 1500 references are `node:`.

**`isFollowableOfferId` KEEPS its verdict and this module must not contradict it.** Contract 3 pins
agreement on every corpus-shaped id, so leg 9 and `decision-point-playback`'s contract 6 stay green.
There is exactly ONE id shape where the derived verdict is strictly more accurate, and contract 3
asserts it rather than hiding it: the bare id `list`. `isFollowableOfferId("list")` is `true` (no
colon), and `renderOfferFollowUps` therefore prints `storytree library artifact list --from-offer …`
— but that argv dispatches to the LIST SEARCH, which observes a `search` event and no visit, so no edge
could ever land. Zero instances in the corpus today; asserted because a silent divergence is how the
next drift starts.

**Shape — the exports from `offer-observability-share.ts`:**

```ts
export type UnobservableReason =
  | "no-cli-read-shape-observes-a-visit-for-this-offer"
  | "a-cli-read-exists-but-no-follow-producer-accepts-its-surface";

export type OfferObservability =
  | { readonly nodeId: string; readonly observable: true }
  | { readonly nodeId: string; readonly observable: false; readonly reason: UnobservableReason };

export interface PointObservability {
  readonly candidateSetId: string;
  readonly offered: number;
  readonly observable: number;
  readonly offers: readonly OfferObservability[];
}

export interface ObservabilityReport {
  readonly points: readonly PointObservability[];
  readonly offered: number;
  readonly observable: number;
}

export function followArgvFor(offerId: string): readonly string[] | null;
export function classifyOfferObservability(offerId: string): OfferObservability;
export function computeOfferObservability(events: readonly ContextTraversalEvent[]): ObservabilityReport;
export function renderOfferObservability(report: ObservabilityReport): string;
```

`OfferObservability` is a DISCRIMINATED UNION on `observable`, not a boolean plus an optional reason:
the repo runs `exactOptionalPropertyTypes`, so an optional `reason` typechecks differently at the
composition site than at the read site. Narrow on `observable` and read `reason` inside the branch.

**`computeOfferObservability` — the algorithm.** For each `candidate_set` event in observed order,
produce one `PointObservability`: `offers` is `classifyOfferObservability` applied to every entry of
`candidateNodeIds` in AUTHORED order, keeping duplicates as separate entries; `offered` is that array's
length; `observable` is the count of entries with `observable: true`. The report's `offered` and
`observable` are the sums across points. A trace with no `candidate_set` yields empty `points` and both
totals `0`. Total: never throws, for any event list.

**Deps injection.** `observeCliInvocation` needs `ObserveCliDeps` (`ok`, `sessionId`, `nextVisitId`,
`now`). This module is PURE and has no identity or clock, so it supplies a fixed internal stub — a
constant session id, a counter or constant visit id, and a fixed `Date`. The stub's values are never
observed by anything: the only thing read off the returned events is whether a visit came back and what
its `surfaceId` is. Do NOT thread real deps in from a caller, and do NOT import a clock.

**`renderOfferObservability` returns `""` when `points` is empty** — no heading, no blank line, nothing
— so a replay that recorded no offer grows no section. Otherwise return a block opening with the line
`offer observability:` and, per point, one line:

```
  <candidateSetId> — offered N, observable M of N; unobservable K: <reason> x<count>, <reason> x<count>
```

Points render in observed order. The reason breakdown lists each reason present with its count, in the
order the reasons are declared in `UnobservableReason`, and OMITS a reason with a zero count; when
`K` is 0 the whole `; unobservable …` clause is omitted. Close the block with one total line:

```
  trace total — offered N, observable M of N: the followed counts above are over M observable branches, not N offered
```

The total line renders even when there is one point — it is the sentence that stops a reader taking the
offered count as the denominator, which is the entire deliverable. **No percentage is rendered
anywhere:** `M of N` is the observation, and a rounded share of a 3-element set invites reading
precision that is not there. Never throws.

**Fences.** No filesystem, no clock, no store, no id generation, no `@storytree/drive` import, no new
package, no new dependency. Do NOT sort, rank, prefetch, or change what context is pulled (outside the
arc, ADR-0235 clause 7). Do NOT read a trace directory or any reader — this module is handed the events
it judges and nothing else. Do NOT modify `isFollowableOfferId`, `renderOfferFollowUps`,
`observeCliInvocation`, `emitFollowedEdge`, or any coverage constant: this capability emits nothing, so
a coverage change here would claim an emission that does not exist.

**Do NOT edit `query-render.ts`, `terminal-capture.ts`, `main.ts`, `commands.ts`, `traversal.ts`, the
UAT file, or `decision-point-playback.ts`.** The wiring that appends this block to the replay body, and
the UAT leg that proves the real spawned CLI prints it, are separate later steps in the same increment
— authored outside this leaf's write scope.

**No `as` casts of any kind in the test file.** Narrow the `ContextTraversalEvent` union through the
exported `isContextVisitEvent` and explicit `kind` checks plus `assert.ok`, the way
`decision-point-playback.test.ts` does. The proof run is tsx-driven so types are stripped: a cast makes
the assertion prove nothing while `check:coverage` still counts the test, and the package typecheck goes
red only AFTER the verdict is signed. Annotate a composed event with its OWN member type
(`CandidateSetEvent`), never with the whole `ContextTraversalEvent` union — a union annotation is
excess-property-checked against every member.

**Files.** `packages/context-traversal-capture/src/offer-observability-share.ts` and
`offer-observability-share.test.ts`. The package scaffold and every import above already exist.

## Contracts

1. **`an-offer-set-states-how-much-of-itself-the-telemetry-could-not-see`**
   - **asserts —** over a batch holding a `library-artifact` visit `v1` and a `candidate_set`
     `candidate-set:v1` offering
     `["trunk", "doc:decisions/0022-x.md", "doc:decisions/0031-y.md", "prove-and-promote-ceremony"]`:
     `computeOfferObservability` returns exactly one point with `offered` 4 and `observable` 2, whose
     `offers` are four entries in AUTHORED order with the two `doc:` entries `observable: false` and the
     two bare ids `observable: true`; and the report totals are `offered` 4, `observable` 2. Then assert
     on the string `renderOfferObservability` RETURNED: it contains `offered 4`, `observable 2 of 4`,
     and the total line's phrase `not 4 offered`. **Falsifiability —** a first run that comes back green
     is the diagnosis, not the result: this assertion must fail against an implementation that counts
     every offer observable (the over-report this capability exists to remove), against one that reports
     only the count already on the `[candidate-set]` line, against one that drops the unobservable
     entries from `offers` so the denominator silently becomes the observable count, and against one
     that renders no total line.
2. **`an-unobservable-offer-carries-the-reason-a-follow-could-not-land-on-it`**
   - **asserts —** `classifyOfferObservability("doc:decisions/0022-x.md")` is `observable: false` with
     reason `"no-cli-read-shape-observes-a-visit-for-this-offer"`, and
     `classifyOfferObservability("node:cli")` is `observable: false` with reason
     `"a-cli-read-exists-but-no-follow-producer-accepts-its-surface"` — the two reasons are DIFFERENT
     values read off the returned objects, not two spellings of one. Over a set offering both plus one
     bare id, the rendered string names both reasons with their counts and the `unobservable 2` clause.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that collapses both into one reason (which is the
     false "no CLI read could ever follow it" claim this capability corrects), against one that renders
     the count without the reason, and against one that reports a reason for an observable offer.
3. **`the-verdict-is-derived-from-the-real-allowlist-and-never-a-restated-prefix-table`**
   - **asserts —** two halves. (a) AGREEMENT: for every id in a list spanning the shapes the corpus
     actually carries — a bare id, an `asset:`-stripped id, a `doc:` ref, a `node:` ref, an unknown
     scheme, and an id containing a colon mid-string — `classifyOfferObservability(id).observable`
     equals `isFollowableOfferId(id)`, both read from the imported functions rather than a hand-written
     expectation table, so the added REASON never moves the VERDICT that leg 9 and
     `decision-point-playback`'s contract 6 pin. (b) THE ONE KNOWN DIVERGENCE, asserted rather than
     hidden: for the bare id `"list"`, `isFollowableOfferId` returns `true` while
     `classifyOfferObservability` returns `observable: false` with reason
     `"no-cli-read-shape-observes-a-visit-for-this-offer"` — because `followArgvFor("list")` is
     `["library", "artifact", "list"]`, which `observeCliInvocation` dispatches to the list SEARCH,
     observing a `search` event and no visit. Assert that by calling `observeCliInvocation` in the test
     and checking no returned event satisfies `isContextVisitEvent`, never by asserting the literal
     string. **Falsifiability —** a first run that comes back green is the diagnosis, not the result:
     this assertion must fail against an implementation that hard-codes a scheme→verdict table (which
     would agree today and drift the moment the allowlist widens), against one whose `list` handling
     silently matches `isFollowableOfferId` by special-casing it, and against one that calls neither
     `observeCliInvocation` nor `isFollowableOfferId` at all.
4. **`a-node-ref-is-never-reported-as-having-no-cli-read-because-one-demonstrably-exists`**
   - **asserts —** the correctness half of the `node:` finding, proved against the allowlist rather than
     claimed. Call `observeCliInvocation(["tree", "cli"], …)` directly and assert it returns an event
     satisfying `isContextVisitEvent` whose `surfaceId` is NOT `LIBRARY_ARTIFACT_SURFACE` — so a read
     demonstrably exists and its surface is demonstrably not the one the follow producer stamps. Then
     assert `followArgvFor("node:cli")` deep-equals that same argv, and that
     `classifyOfferObservability("node:cli")`'s reason is the surface one and NOT the no-read one.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that maps `node:` to no argv (re-asserting the false
     "no CLI read could ever follow it"), against one that maps it to a `library artifact` argv (which
     would wrongly report it observable), and against one that reads the reason from a table rather than
     from the observed surface.
5. **`a-set-with-nothing-observable-renders-zero-and-never-a-hidden-division`**
   - **asserts —** the 25.8%-of-corpus case. For a `candidate_set` whose every candidate is a `doc:`
     ref, the point's `observable` is `0`, `offered` equals the candidate count, every entry of `offers`
     is `observable: false`, and the rendered string contains `observable 0 of N` and the total line —
     with NO `NaN`, no `Infinity`, and no `%` character anywhere in the returned string. Assert the
     absence of `%` over the whole rendered block, since a percentage of a fully-unobservable set is the
     shape most likely to be silently introduced. **Falsifiability —** a first run that comes back green
     is the diagnosis, not the result: this assertion must fail against an implementation that divides
     without guarding (yielding `NaN` or `Infinity` in the body), against one that omits the point
     entirely because nothing is observable (dropping the very sets whose distortion is total), and
     against one that renders a rounded percentage.
6. **`a-replay-with-no-recorded-offer-renders-no-observability-section-at-all`**
   - **asserts —** for a batch of visits and a `search` event but no `candidate_set`,
     `computeOfferObservability` returns empty `points` with both totals `0`, and
     `renderOfferObservability` returns the EMPTY STRING — not a heading, not a blank line, not
     `offer observability:\n  (none)`. Assert also that `computeOfferObservability([])` does the same
     without throwing. **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that always emits the heading (every
     pre-offer trace in existence would grow a section announcing an absence, and the replay's existing
     chronological lines are pinned by two signed UAT legs), and against one that returns a newline or a
     whitespace-only string, which appends a blank line to every such replay.
7. **`the-denominator-covers-exactly-the-recorded-offers-with-none-dropped-or-added`**
   - **asserts —** the composition pin against `decision-point-playback`, derived from returned values on
     both sides rather than from two hand-matched literals. Over one batch holding two `candidate_set`
     events with different candidate counts (one of them repeating an id, so duplicates are in play),
     run BOTH `computeDecisionPoints` and `computeOfferObservability`: the two reports have the same
     number of points, matched pairwise by `candidateSetId` in the same order; for each pair the
     observability point's `offered` equals that decision point's `candidates.length`; and the
     observability point's `offers` node ids, in order, deep-equal the decision point's `candidates` node
     ids, in order. Assert additionally that the report's `offered` total equals the sum of the decision
     report's per-point candidate counts. Import `computeDecisionPoints` from
     `./decision-point-playback.js`. **Falsifiability —** a first run that comes back green is the
     diagnosis, not the result: this assertion must fail against an implementation that de-duplicates
     `candidateNodeIds` (so a repeated offer vanishes from the denominator while the decision view still
     shows it), against one that re-orders candidates, and against one that skips a `candidate_set` the
     decision view reports.

## Integration evidence

`packages/context-traversal-capture/src/offer-observability-share.test.ts` runs entirely in memory over
hand-built event fixtures; no temporary directory, no real `HOME`, no store and no filesystem is
involved, because this unit touches none of them. Every assertion reads what `classifyOfferObservability`,
`computeOfferObservability` and `renderOfferObservability` RETURNED, never a value the test composed.
Contract 3 derives BOTH sides of its agreement check from the imported `isFollowableOfferId` and the
imported `observeCliInvocation` rather than from an expectation table, and contract 7 derives both sides
of its composition check from the two compute functions' returned reports — so the invariants that keep
this module from drifting out of step with the allowlist, with the follow producer, and with the
decision-point view are pinned by AGREEMENT rather than by literals that would need hand-editing on the
next change. Fixture events are annotated with their own member types and parsed through increment 1's
`ContextTraversalEvent` vocabulary, so a fixture that could not be written to a trace cannot silently
prove anything here.
