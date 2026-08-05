---
id: "artifact-offer-candidate-sets"
tier: capability
story: context-traversal-capture
arc: context-decision-tree-arc
title: "An artifact render records what it offered, followed or not"
outcome: "A library artifact read records every onward artifact its Sources block offered as a candidate set at render time, whether or not anything follows it."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, terminal-boundary-observations]
decisions: [235, 260]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/offer-candidate-sets.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/offer-candidate-sets.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/offer-candidate-sets.test.ts"
    sourceFile: "packages/context-traversal-capture/src/offer-candidate-sets.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/offer-candidate-sets.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/offer-candidate-sets.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# An artifact render records what it offered, followed or not

## Guidance

Author the seven contracts below under these ids, VERBATIM — the leaf's test titles must name them
(`spec.contracts` never reaches the leaf, so `check:coverage` reads 0/7 unless the ids appear here):
`offers-resolve-to-exactly-the-printed-sources-refs-in-authored-order`,
`only-the-bare-library-artifact-id-shape-offers`,
`a-missing-doc-or-rejecting-store-offers-nothing-and-never-throws`,
`an-offer-is-recorded-at-render-time-even-when-nothing-follows`,
`the-candidate-set-names-the-visit-that-rendered-it-and-never-replaces-it`,
`composed-coverage-declares-candidate-sets-and-still-denies-followed-edges`,
`the-coverage-declaration-names-both-adr-0260-d7-gaps`.

**Why this boundary, and why the offer needs no derivation.** `storytree library artifact <id>` runs
`viewArtifact` (`packages/cli/src/commands.ts:269`), which renders the doc through
`renderStoredDoc` and then prints a **Sources** block by calling
`groupSources(a.references, …)` (`commands.ts:282-294`). All three branches of `renderStoredDoc`
(`packages/library/src/store/render-doc.ts:206`, `:228`, `:253`) set `references` from
`asStringArray(doc.references)` — so the doc's own `references` array IS the printed offer list, in
every branch, unconditionally. `groupSources` only re-buckets those refs for display: it drops
nothing (an unresolvable `asset:` ref still prints under `Other`), so the printed set and the
authored array hold exactly the same refs. The renderer already computes the offer; this capability
records it. Nothing is inferred and nothing new is derived.

**D2 IS THE POINT — the offer is recorded at RENDER time, not at follow time.** `emitCandidateSet` is
a pure function of the render's own visit plus the ids that render offered. It is handed no future
events and can consult none, so an offer is recorded whether or not anything ever follows it. This is
not a stylistic preference: an implementation that recorded only the offers something later answered
would rebuild the CONTAINMENT tree ADR-0260 exists to replace, while passing any test that merely
checks "a candidate set exists". Contract 4 falsifies exactly that shape and is the contract to write
first.

**Shape — five exports from `offer-candidate-sets.ts`:**

```ts
export type OfferDocStore = AgentDocStore;              // re-use the structural port, add no package
export type OfferDeps = Pick<ObserveCliDeps, "sessionId" | "nextVisitId" | "now">;
export interface CoverageCaveat { readonly id: string; readonly note: string }
export function resolveArtifactOffers(argv: readonly string[], store: OfferDocStore): Promise<readonly string[]>;
export function emitCandidateSet(
  observed: readonly ContextTraversalEvent[],
  offeredIds: readonly string[],
  deps: OfferDeps,
): ContextTraversalEvent[];
export const OFFER_CANDIDATE_SET_COVERAGE: ContextTraversalCoverage;
export const OFFER_CANDIDATE_SET_CAVEATS: readonly CoverageCaveat[];
export function renderCoverageCaveats(caveats: readonly CoverageCaveat[]): string;
```

Import `AgentDocStore` / `AgentDescentDeps`'s sibling types from `./descend-agent-refs.js` and
`./observe-cli.js`. Add NO new package and NO new `package.json` dependency — the store port is
structural and `@storytree/storage-protocol`'s `Store` satisfies it as-is. ADR-0235 clause 6 stays
intact: the port reads `id` and one ref array off the doc — never a title, a body, or any content.

**The id vocabulary is deliberately asymmetric, and the asymmetry is the honest part.** Strip the
`asset:` prefix, so an asset offer's id equals the canonical `nodeId` a real
`library artifact <that-id>` read would record — that identity is what makes the offer joinable at
all. Keep a `doc:` ref VERBATIM, prefix included: an ADR file has no canonical Library node, and
stripping the prefix would forge an `asset:`-shaped id for something the telemetry can never observe
a visit to. Any other ref shape passes through verbatim (`groupSources` prints it under `Other`).

**`doc:` refs are OFFERED, not dropped.** They are a large minority of the corpus's references
(36.7% of 1500, measured over the live store 2026-08-05 by ADR-0312) and can be anywhere from none to
all of an INDIVIDUAL offer set — 25.8% of sets have nothing observable in them at all — and following
one is invisible to this adapter. (This sentence used to read "the majority of a typical offer set",
generalising from the five-of-eight sample in ADR-0260's Context; ADR-0312 measured the corpus and
that generalisation is false, though the sampled artifact itself has since grown to 8 `doc:` of 12.
Corrected in place per ADR-0139 — the instruction below is unaffected, and the per-set variance is
exactly why ADR-0312 renders the observable denominator per set rather than quoting any one figure.)
Excluding them
would make the tree read as though the session stayed inside the asset graph — the exact distortion
ADR-0260's Consequences names. They go in the candidate set, and the gap goes in the caveats (D7,
contract 7). Under-report the FOLLOW; never under-report the OFFER.

**Mirror `observe-cli.ts`'s dispatch rule exactly — never widen it.** Offer only where
`observeCliInvocation` already observes a visit: `argv[0] === "library"`, `argv[1] === "artifact"`,
`argv[2]` present and not `"list"`, and `argv.length === 3` (`observe-cli.ts:95-103`).
`["library","artifact","x","--pg"]` really does print a Sources block in the real CLI and is
deliberately NOT offered here, because that shape observes no visit — a candidate set with no
rendering visit would be an orphan offer with nothing to join to. Widening the read allowlist is a
separate decision; **do NOT edit `observe-cli.ts` or `observe-cli.test.ts`.**

**Never throws.** Any store rejection, absent doc, or odd `references` shape (missing, a string,
holding non-string entries) resolves to `[]`. Telemetry never breaks a command.

**Coverage composes, it never rewrites.** `OFFER_CANDIDATE_SET_COVERAGE` is built FROM
`AGENT_DESCENT_COVERAGE` (imported from `./descend-agent-refs.js`) by moving `event:candidate_set`
from `omitted` to `supported` and changing nothing else — the same composition move
`revisit-links.ts:66-84` and `descend-agent-refs.ts:158-162` already make. `adapterId` STAYS
`terminal-cli-dispatch`. `event:followed_edge` and `field:candidate_follow_causality` BOTH stay
OMITTED: this adapter records the offer and nothing whatever about which offer was answered, and
`FollowedEdgeEvent` has no producer until ADR-0260 D3's increment.

**The caveats are part of the declaration, not documentation.** ADR-0260 D7 requires two gaps to be
visible wherever this adapter's coverage is: `doc:` follows are unobservable, and follow-completeness
depends on agents using the offered command form — a NEW class of dependency for this telemetry,
which D4 forbids ever repairing by inference, so an honest declaration is the only mitigation. They
carry stable machine ids so a contract pins them without matching prose. They live here rather than
as a `caveats` field on `ContextTraversalCoverage` only because that schema belongs to a green story
in another package; lifting them there is a later consolidation, not this increment.

**Absent means absent, and `.nonempty()` means silent.** `exactOptionalPropertyTypes` is on and the
sink writes `JSON.stringify(parsed.data)`. `CandidateSetEvent.candidateNodeIds` is `.nonempty()`, so
an artifact with no references appends NOTHING — never a placeholder id, never an empty array, never
a fabricated "no offers" marker.

**No `as` casts of any kind in the test file.** Narrow the `ContextTraversalEvent` union through the
exported `isContextVisitEvent` and explicit `kind` checks plus `assert.ok`, the way
`terminal-capture.uat.test.ts`'s `expectVisit` helper does. The proof run is tsx-driven so types are
stripped: a cast makes the assertion prove nothing while `check:coverage` still counts the test, and
the package typecheck goes red only AFTER the verdict is signed. `surfaceId` and `parentVisitId` are
OPTIONAL — narrow presence before any comparison rather than comparing two possibly-`undefined`
values.

**Fences.** No filesystem, no clock of its own, no `@storytree/drive` import, no new package, no new
dependency, no retention/pruning/cap. Do NOT emit `followed_edge`, do NOT stamp `followedEdgeId` on
any visit, and do NOT add an argv flag — that is ADR-0260 D3's increment and contract 6 asserts this
one stays out of it. Do NOT resolve a candidate set from the trace (ADR-0260 D3 refuses trace-side
resolution as candidate C in disguise).

**Files.** `packages/context-traversal-capture/src/offer-candidate-sets.ts` and
`offer-candidate-sets.test.ts`. The package scaffold already exists. Do not touch
`terminal-capture.ts`, `main.ts`, or the UAT file — the wiring is a separate, later step.

## Contracts

1. **`offers-resolve-to-exactly-the-printed-sources-refs-in-authored-order`**
   - **asserts —** over a stub store holding a doc `x` with
     `references: ["asset:a", "doc:decisions/0001-z.md", "asset:b", "bare-thing", 7]`,
     `resolveArtifactOffers(["library","artifact","x"], store)` returns exactly
     `["a", "doc:decisions/0001-z.md", "b", "bare-thing"]` — the `asset:` prefix stripped, the `doc:`
     ref kept prefix-and-all, the unrecognised ref passed through verbatim, the non-string entry
     dropped, and the AUTHORED order preserved rather than regrouped the way the Sources block
     displays them. **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that drops `doc:` refs (which would
     hide the D7 gap instead of declaring it), against one that strips the `doc:` prefix as well as
     the `asset:` one, and against one that sorts or groups the ids.
2. **`only-the-bare-library-artifact-id-shape-offers`**
   - **asserts —** `["library","artifact","x"]` resolves `x`'s refs, while
     `["library","artifact","list"]`, `["library","artifact","x","--pg"]`, `["library","artifact"]`,
     `["library"]`, `["tree","x"]` and `["agents","x"]` each resolve `[]` — mirroring
     `observe-cli.ts:95-103` exactly, so an offer exists only where a rendering visit does.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation keying on `argv[0] === "library" && argv[1] ===
     "artifact"` alone (`list` and the `--pg` shape would both offer), and against one that offers on
     the `tree` surface.
3. **`a-missing-doc-or-rejecting-store-offers-nothing-and-never-throws`**
   - **asserts —** an absent id, a store whose `getDoc` REJECTS, a doc with no `references` key, and a
     doc whose `references` is a string rather than an array each yield `[]` from an awaited
     `resolveArtifactOffers` call with no error thrown. **Falsifiability —** a first run that comes
     back green is the diagnosis, not the result: this assertion must fail against an implementation
     that lets the store's rejection propagate, and against one that spreads a string `references`
     into per-character offers.
4. **`an-offer-is-recorded-at-render-time-even-when-nothing-follows`**
   - **asserts —** `emitCandidateSet([artifactVisit], ["a","b","c"], deps)` where `observed` holds
     ONLY the artifact visit — no visit to `a`, `b` or `c`, and no later event of any kind — returns
     the visit plus exactly one `candidate_set` whose `candidateNodeIds` is `["a","b","c"]`. Assert
     it as the branch-not-taken claim, not merely as a length: compute the offered ids that appear as
     the `nodeId` of NO visit event in the returned batch, and assert that set is exactly
     `["a","b","c"]` — every offer recorded, none of them followed. Then assert the same call with
     `offeredIds: []` appends nothing at all (`.nonempty()` makes a zero-candidate offer
     unrepresentable, and a placeholder would be an invented offer). **Falsifiability —** a first run
     that comes back green is the diagnosis, not the result: this assertion must fail against an
     implementation that records only ids some visit in the batch names (the lazy, containment-tree
     shape ADR-0260 D2 exists to refuse — it would return no candidate set here at all), against one
     that omits the event whenever no follow is present, and against one that emits a candidate set
     with an empty `candidateNodeIds` for the empty-offer case.
5. **`the-candidate-set-names-the-visit-that-rendered-it-and-never-replaces-it`**
   - **asserts —** on the returned batch: the artifact visit comes FIRST and survives the
     `JSON.parse(JSON.stringify(...))` round-trip byte-identical to the input visit (no
     `candidateSetId` or any other key stamped onto it); the appended event's `candidateSetId`
     CONTAINS the rendering visit's `visitId`, so the offer is joinable to the render that made it
     without any correlation; its `surfaceId` equals that visit's `surfaceId`; every returned event
     parses through `ContextTraversalEvent`; a batch holding no `library-artifact` visit appends
     nothing; and re-running `emitCandidateSet` over its OWN output with the same `offeredIds`
     appends nothing new. Read the returned events, never a value the test composed. **Falsifiability
     —** a first run that comes back green is the diagnosis, not the result: this assertion must fail
     against an implementation that mints an unrelated random `candidateSetId` carrying no link to
     the visit, against one that mutates the visit instead of appending beside it, and against one
     that appends a second, duplicate candidate set on the re-run.
6. **`composed-coverage-declares-candidate-sets-and-still-denies-followed-edges`**
   - **asserts —** `ContextTraversalCoverage.parse(OFFER_CANDIDATE_SET_COVERAGE)` succeeds;
     `adapterId` is still `terminal-cli-dispatch`; `event:candidate_set` is in `supported` and NOT in
     `omitted`; every feature `AGENT_DESCENT_COVERAGE` declared supported — INCLUDING
     `field:parent_visit_id` and `field:prior_visit_id` — is still supported; `event:followed_edge`
     AND `field:candidate_follow_causality` are BOTH still omitted; and
     `supported.length + omitted.length === CoverageFeature.options.length`. **Falsifiability —** a
     first run that comes back green is the diagnosis, not the result: this assertion must fail
     against a declaration that adds the feature to `supported` without removing it from `omitted`
     (the schema refuses both-ways), against one that drops `field:parent_visit_id`, and against one
     that also claims `event:followed_edge` or `field:candidate_follow_causality` — neither of which
     has a producer until ADR-0260 D3's increment.
7. **`the-coverage-declaration-names-both-adr-0260-d7-gaps`**
   - **asserts —** `OFFER_CANDIDATE_SET_CAVEATS` holds exactly two caveats, whose ids are
     `doc-refs-are-offered-but-follows-are-unobservable` and
     `follow-completeness-depends-on-the-offered-command-form`, each with a `note` that is non-empty
     after trimming; and that `renderCoverageCaveats(OFFER_CANDIDATE_SET_CAVEATS)` RETURNS a block
     containing both ids and both notes — asserted on the returned string, not by reading the
     constant a second time. **Falsifiability —** a first run that comes back green is the diagnosis,
     not the result: this assertion must fail against a declaration carrying only one of the two
     gaps, against one whose notes are empty or whitespace-only strings, and against a renderer that
     prints the block header but drops a caveat line.

## Integration evidence

`packages/context-traversal-capture/src/offer-candidate-sets.test.ts` runs entirely in memory over
hand-built event fixtures and a stub store; no temporary directory, no real `HOME`, and no filesystem
is involved, because this unit touches none of them. Every assertion reads what
`resolveArtifactOffers`, `emitCandidateSet`, and `renderCoverageCaveats` RETURNED — never a value the
test composed — and parses the events through increment 1's `ContextTraversalEvent` vocabulary; the
visit's untouched-ness is asserted on the JSON round-trip so it describes the bytes the sink will
write rather than an in-memory identity. The coverage contract asserts through
`ContextTraversalCoverage.parse` so the closed-enum exhaustiveness is enforced by the schema rather
than by a hand-counted list.
