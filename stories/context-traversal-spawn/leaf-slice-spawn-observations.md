---
id: "leaf-slice-spawn-observations"
tier: capability
story: context-traversal-spawn
arc: linked-session-context-arc
title: "One authoring slice's run accounting becomes a linked handoff, child window, and return"
outcome: "A build authoring slice's run accounting observes as an explicit spawn handoff, one child context observation, and a result return — metadata only, capacity carried only as the runtime declared it."
# AMENDED after its first signed green (2026-07-26): a defect found while building the dependent
# capability `build-spawn-capture` violated this capability's own contract surface — the composed
# child session id carried `:`, which is illegal in a Windows path segment, so the sink silently
# wrote nothing for the child lane. The defect amends the OWNING capability rather than spawning a
# new unit (`defects-amend-the-owning-story`): contract 11 is new, contract 2 is de-pinned from the
# literal template, and the authored line reverts to `building` because the existing signed verdict
# no longer covers the full contract list. The crown still DERIVES from signed verdicts (ADR-0020),
# not from this line.
# AMENDED AGAIN (2026-07-26, arc increment 4): this capability was authored on a FALSE premise —
# that nothing at this boundary declares a context-window size. The leaf's per-slice run accounting
# DOES declare one, so capacity becomes a faithful pass-through rather than a permanent absence.
# Contract 6 is restated from "always absent" to "never inferred", contract 10 inverts
# `field:context_window_capacity` from omitted to supported, and contracts 12-13 are new. The ban on
# lookup tables, defaults, maps and estimates is UNCHANGED — only its justification is corrected.
# The line stays `building`: no signed verdict covers the amended contract list.
# AMENDED AGAIN (2026-08-11, arc `traversal-panel-arc`): a spawned lane can now NAME the model and
# runtime it ran on. `LeafSliceRun` gains a structural `source?`, the `spawn_handoff` gains `model`
# and `runtime` (both omitted when undeclared — absent means UNOBSERVED, deliberately diverging from
# `sliceUsageDocs()`'s balancing default), and `BUILD_SPAWN_BOUNDARY_COVERAGE` gains
# `field:agent_model_identity`. Contracts 14-18 are new; contract 10's supported list is restated to
# match. No existing contract's claim changes. The stale "contract 8 is the unimplemented one" note
# is corrected in place — that emission landed, and its `byModel`-canary consequence is now history
# with a standing rule. The line stays `building`: no signed verdict covers the amended list.
status: building
proof_mode: integration-test
depends_on: []
decisions: [235, 241, 192]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-spawn", "test"]
  scope:
    testGlobs: ["packages/context-traversal-spawn/src/observe-leaf-slices.test.ts"]
    sourceGlobs: ["packages/context-traversal-spawn/src/observe-leaf-slices.ts"]
  real:
    testFile: "packages/context-traversal-spawn/src/observe-leaf-slices.test.ts"
    sourceFile: "packages/context-traversal-spawn/src/observe-leaf-slices.ts"
    scope:
      testGlobs: ["packages/context-traversal-spawn/src/observe-leaf-slices.test.ts"]
      sourceGlobs: ["packages/context-traversal-spawn/src/observe-leaf-slices.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-spawn", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-spawn", "typecheck"]
---

# One authoring slice's run accounting becomes a linked handoff, child window, and return

## Guidance

Author the PURE observer in the story-owned `packages/context-traversal-spawn` package: one build's
authoring slices in, `ContextTraversalEvent`s out. No filesystem, no clock of its own beyond an
injected one, no `@storytree/drive`, no `@storytree/agent`.

**Input is structurally declared HERE, not imported.** Declare a local `LeafSliceRun` shape —
`phase`, `subtype`, `turns`, optional `costUsd`, optional
`usage: { inputTokens, cacheCreationInputTokens, cacheReadInputTokens, outputTokens }`, optional
`byModel` whose value shape carries an optional `contextWindow?: number`, and optional
`source?: "sdk-leaf" | "codex-leaf" | "owned-loop"` (the runtime the run itself declares —
`SdkRunInfo.source` / `CodexRunInfo.source`) — matching what the SDK
leaf already collects per authoring slice. Importing
`@storytree/agent` would drag the agent organism into a package the studio-adjacent telemetry tier
must stay free of; reading the accounting structurally is exactly what `sliceUsageDocs()` in
`packages/drive/src/usage.ts` already does, and it lets every proof here run offline with no leaf,
no DB, and no API key.

**Shape.** `observeLeafSlices({ parentSessionId, runId, unitId, runs, now, nextId })` returns a
chronological `ContextTraversalEvent[]`. For each slice it emits, in order:

1. `spawn_handoff` on the PARENT session (`sessionId === parentSessionId`), carrying an explicit
   `edgeId`, `parentSessionId`, `childSessionId`, and `agentType` — plus the lane's `model` and
   `runtime` when, and only when, the slice declared them (see the attribution rule below).
2. `model_context` on the CHILD session — one aggregate observation of that child's own independent
   window — but only when the slice reported `usage`.
3. `result_return` on the PARENT session, carrying the same `edgeId` and child id, with
   `resultTokenCount` and `ok`.

**Identity is explicit and deterministic (ADR-0235 clause 2).** The child session id is composed
from declared build identity ALONE — the parent session id, the run id, the unit id, and the phase —
never from a timestamp, an array index, or adjacency. The parent id is supplied by the caller and
never derived here (the increment-2 rule, ADR-0241 D9). The same edge identity joins the handoff and
the return so the lanes link by id alone.

**A session id is also a FILENAME, so it must be legal as one.** The sink names one file per
session, `<sessionId>.jsonl`, and it swallows a failed write (`catch { return false }`). A child id
carrying a character that is illegal in a path segment on any supported platform therefore makes
that child's lane silently unpersistable — no file, no events, no error — and story UAT leg 2
unsatisfiable. This was MEASURED, not theorised: a `:`-separated child id returned `false` from
`appendTraversalEvents` and left zero files on disk under Windows, while the same id without colons
wrote normally. **The separator choice is free** — any character legal in a path segment on every
supported platform (`-`, `_`, `__`) — provided the id stays derived from declared build identity
alone, so determinism and explicit-id-only linkage are untouched. Contract 11 asserts this on the id
the observer RETURNS; it is a permanent regression case for a real defect, not speculative breadth.

**The separator is now `__`, and the literal-template assertions were NOT fixed points.** The test
file had hard-coded the colon composition in three places
(e.g. ``assert.equal(secondSpawn.childSessionId, `${PARENT_SESSION_ID}:build:${RUN_ID}:${UNIT_ID}:IMPLEMENT`)``);
those assertions pinned a SPELLING that amended contract 2 explicitly removed from the contract, and
they were updated to the `__` spelling when contract 11 landed. What is promised remains composition
from the declared components (parent, runId, unitId, phase) plus byte-identical determinism, NOT a
particular separator — so a test asserting the literal template is describing today's spelling, never
constraining tomorrow's. An implementer who treats such an assertion as untouchable deadlocks.

**What is NOT observed is asserted, not merely omitted.** `payloadTokenCount` is always absent: the
size of the prompt handed to the child is not visible at this boundary, and a contract pins that so
a later estimate goes RED rather than quietly appearing.

**Capacity is a PASS-THROUGH, and the negative cases are the load-bearing ones.** This capability was
first authored believing nothing here declares a window size; that premise was FALSE. The leaf's
per-slice run accounting carries a runtime-declared context window on every `byModel` entry, which is
exactly the runtime-declared value ADR-0235 clause 4 asks for and emphatically NOT a lookup table. So
the local `LeafSliceRun.byModel` value shape gains an optional `contextWindow?: number` (still a
STRUCTURAL declaration — this package imports neither `@storytree/agent` nor the SDK), and the
observer carries exactly that number onto the child `model_context` — never a number it computed.

Attribution must be UNAMBIGUOUS: capacity is set only when the slice's `byModel` declares exactly ONE
distinct positive window. It stays ABSENT when no model declares one, when two or more models declare
DIFFERENT windows, and when the declared value is `0` or negative. Clause 4 speaks of the capacity
declared by *that* runtime, singular, and clause 6 requires missing metadata to stay visibly unknown
rather than be inferred — so collapsing two different declared windows into one number is a
fabrication, and picking the first arbitrarily is worse. A `0` is not a capacity either: the
vocabulary is `count.positive()`, so a `0` carried forward would fail the event's own parse
downstream, and it must become ABSENT here rather than at validation time.

**The ban is unchanged — no model-id → capacity lookup table, no default capacity, no estimate**, in
this layer or any other. That is an assumption, not an observation. Contracts 6, 12 and 13 are what
make a later inference go RED; only the justification for the ban has changed, never its strength.

**One aggregate observation per child, not a running total.** Each authoring slice is its own
independent query with its own window (ADR-0235 clause 5), so `cumulativeInputTokens` and
`addedInputTokens` are EQUAL and both equal
`inputTokens + cacheCreationInputTokens + cacheReadInputTokens`. The equality is the honest
statement about what was observed, not a rounding or a placeholder.

**Coverage is exhaustive by construction.** Export `BUILD_SPAWN_BOUNDARY_COVERAGE` — a
`ContextTraversalCoverage` whose `supported` names exactly what this adapter emits
(`surface:spawned_agent`, `surface:claude_sdk`, `event:spawn_handoff`, `event:model_context`,
`event:result_return`, `field:model_tokens`, `field:child_context_window`, —
since the pass-through above — `field:context_window_capacity`, and — since the lane attribution
below — `field:agent_model_identity`) and whose `omitted` is every
remaining member of the closed `CoverageFeature` domain, explicitly including
`field:candidate_follow_causality`. Derive the omissions from `CoverageFeature.options` so a future
vocabulary addition cannot leave a silent gap.

**`field:context_window_capacity` MOVED from omitted to supported (increment 4), and the assertion
INVERTED with it** — it is now declared and asserted as supported, not omitted. The rule that forced
the move is the durable part: coverage declares what the adapter CAN observe, not what any one trace
happens to contain, so `supported` became the honest declaration the moment the pass-through landed,
even though many individual slices still carry no capacity. A hard-coded side is never a fixed point
when the adapter's ability changes — treating one as untouchable leaves a self-contradicting suite
and deadlocks, exactly as the literal colon-template assertions did in the previous amendment. The
exhaustiveness assertions derived from the enum are untouched throughout — they are what keep any
such move honest, because a feature cannot simply vanish from the declaration.

**Contract 8's `modelId` emission has LANDED** (it was the RED of the increment that observed it —
`observe-leaf-slices.ts` had carried zero occurrences of the field since this capability was first
authored, and contract 8 had shipped under a signed PASS twice without ever being built). The
observer now emits it: `modelIdFor()` returns the sole `byModel` key when there is exactly one and
`undefined` otherwise, and the child's `model_context` carries it only in the former case.

**A `byModel` KEY is therefore declared, EMITTED metadata on the wire, not an opaque free-text
input** — with a standing consequence next door. `build-spawn-capture`'s contract 5 threads a
distinctive canary through every input that only LOOKS free-text and asserts it never reaches the
written bytes; it passed while contract 8 was unimplemented because the key went nowhere. That
fixture has since MOVED its canary off `byModel` and onto `subtype`, which is genuinely never
emitted. The rule this leaves behind is permanent: a `byModel` key is now observable output, so
nothing that must not reach disk may ride it. Recording it here is so a later session does not
rediscover the collision the hard way and mistake it for a contract conflict.

**The lane NAMES the model and runtime it ran on, and both ride the HANDOFF.** A spawned lane is
useless to a reader who cannot tell what ran it, so the `spawn_handoff` carries `model` (the sole
`byModel` key — the same `modelIdFor()` rule contract 8 already established, reused rather than
re-derived) and `runtime` (the slice's declared `source`, passed through verbatim into the
vocabulary's closed `AgentRuntime` set). They sit on the handoff and deliberately NOT on the
`result_return`: the lane's identity is established when it is SPAWNED, and restating it on the
return would give one fact two sources of truth with no observer able to say which is right. The
return schema is `.strict()`, so it REFUSES both keys — the wrong emission is a parse failure, not a
silently redundant field.

**Absent means UNOBSERVED, and this observer DIVERGES from the accounting path on purpose.** Each
field is omitted — the key wholly missing, not `null`, not an empty string — whenever the slice does
not declare it: `model` when `byModel` names several keys or none, `runtime` when the run carries no
`source`. `sliceUsageDocs()` (`packages/drive/src/usage.ts`) does the opposite for the same value,
defaulting a missing source to `sdk-leaf`, and that is RIGHT there — an accounting row must balance,
so it must name a source. It is WRONG here. This vocabulary exists so a renderer can print "not
recorded" rather than assert a runtime nobody witnessed, and a defaulted `sdk-leaf` would be
indistinguishable from an observed one. The two instruments agree wherever the field is present and
this one stays silent where it is not, instead of both inventing the same answer. That divergence is
deliberate and must not be "fixed" into agreement — the same shape as `contextWindowCapacityFor`'s
refusal to guess an ambiguous capacity.

**Optional is also what keeps ALREADY-RECORDED lanes readable.** 111 `spawn_handoff` events are on
disk without these fields; the vocabulary is `.strict()` and the sink DROPS an unparseable event
silently (`catch { return false }`, the same swallow contract 11 was written for), so making either
field required would have discarded every existing lane invisibly — no file, no error, no way to
tell. Contract 18 is the permanent regression case for that.

**Fences.** Metadata only (ADR-0235 clause 6): never a prompt, a context body, a tool result, hidden
reasoning, a credential, a spawn payload, or returned result content — token counts only. No
causality from time or ordering. No compaction, pruning, eviction, ranking, prefetch, or traversal
limit. Nothing written to disk here; persistence belongs to `build-spawn-capture`.

Files: `packages/context-traversal-spawn/src/observe-leaf-slices.ts` and
`observe-leaf-slices.test.ts`. Append the barrel export line only after the source lands.

## Contracts

1. **`one-slice-emits-handoff-context-return-in-order`**
   - **asserts —** a single slice carrying usage emits exactly three events in chronological order —
     `spawn_handoff` under the parent `sessionId`, `model_context` under the child `sessionId`, then
     `result_return` under the parent `sessionId` — and the handoff and return carry the same
     explicit `edgeId`.
2. **`child-session-id-is-explicit-and-deterministic`**
   - **asserts —** the child id is composed from declared build identity ALONE — the parent session
     id, the run id, the unit id, and the phase — is byte-identical across repeated observation of
     identical input, is never equal to the parent, and changes if and only if one of those declared
     components changes: never with the clock, the slice's position in the array, an adjacent slice,
     or the separator's incidental spelling. The composition is pinned by its declared components,
     NOT by a literal template, so contract 11 can constrain the separator without reopening this
     one.
3. **`payload-token-count-is-always-absent`**
   - **asserts —** no emitted `spawn_handoff` carries `payloadTokenCount` under any input, including
     slices with full usage — the handed-off prompt size is not observed at this boundary, so a
     later estimate must go red here.
4. **`result-return-carries-output-tokens-and-outcome`**
   - **asserts —** `resultTokenCount` equals the slice's `usage.outputTokens` when the runtime
     reported one and is absent otherwise, and `ok` is true exactly when the slice's `subtype` is
     `success`.
5. **`child-window-is-one-aggregate-observation`**
   - **asserts —** each `model_context` states
     `cumulativeInputTokens === addedInputTokens === inputTokens + cacheCreationInputTokens +
     cacheReadInputTokens` for its own child session, and two slices' windows never accumulate into
     each other — each child's window stands alone.
6. **`context-window-capacity-is-never-inferred`**
   - **asserts —** no emitted `model_context` ever carries a `contextWindowCapacity` that did not
     travel IN on that slice's own run accounting. Over the whole fixture set, every capacity value
     present on the observer's output is strictly equal to a window declared on that slice's
     `byModel`, and no value appears that is absent from the input — for any model id, any usage
     shape, and any number of models. The guard that makes a model-id → capacity lookup table, a
     default capacity, or any computed estimate a RED change rather than a quiet one.
   - **falsifiability —** an implementation that supplies capacity from a table, a constant, an
     environment value, or a computation over the model id must FAIL this contract. It is asserted
     over the emitted SET, not one happy-path event, so a single correct pass-through cannot vouch
     for the rest.
   - **AMENDED (increment 4) —** this contract previously read `context-window-capacity-is-always-absent`
     on the false premise that nothing at this boundary declares a window. The absence claim is
     replaced by the never-inferred claim; the anti-inference tripwire it exists to be is unchanged.
7. **`a-slice-without-usage-emits-no-model-context`**
   - **asserts —** a slice reporting no token breakdown still emits its `spawn_handoff` and
     `result_return` but NO `model_context` — additive capture with nothing honest to persist, the
     `sliceUsageDocs` skip precedent.
8. **`model-and-agent-type-come-from-the-runtime`**
   - **asserts —** `modelId` is the sole `byModel` key when there is exactly one and is absent when
     there are several or none, and `agentType` is the rendered Library agent the leaf actually runs
     as for that phase (`red-builder` for the test-authoring phase, `green-builder` for the
     implementing phase) — a runtime-grounded stable type, never an invented label.
   - **falsifiability —** this contract's test was authored against a source that emitted no
     `modelId` at all, and it correctly went RED there before the emission landed. A first run that
     comes back green against a source lacking the emission is proof the test is not reading the
     observer's output — it is the diagnosis, not the result.
   - **the subject is the observer's OUTPUT.** The asserted value is the `modelId` field read OFF the
     `model_context` event that `observeLeafSlices` RETURNED — never a string the test composed, and
     never the sole-key rule re-derived inside the test file. A test that does either would pass
     against any implementation, including the current one that emits nothing.
   - **both sides of the rule, across the fixture set, not one happy path.** `modelId` is PRESENT and
     strictly equal to the sole `byModel` key when there is exactly one, and WHOLLY ABSENT — no key
     at all, not `null`, not an empty string — when there are several or none. The current
     implementation satisfies every absent-side case VACUOUSLY, by emitting nothing at all, so those
     cases alone can never go red; the PRESENT-side case is what separates a faithful implementation
     from today's, and a suite that asserts only absence is the under-authored test this contract
     exists to catch.
   - **`modelId` and capacity are different rules — do not conflate them.** Contract 12 already
     states the discriminating interaction: two `byModel` entries declaring the SAME positive window
     carry a capacity but NO `modelId`, because attribution to a single model stays ambiguous.
     `modelId` follows the KEY COUNT; capacity follows the count of DISTINCT DECLARED WINDOWS.
9. **`zero-slices-emit-nothing-and-every-event-parses`**
   - **asserts —** an empty slice list yields zero events, and every event emitted for a mixed slice
     set parses clean through increment 1's `ContextTraversalEvent` union, carrying no field outside
     the strict vocabulary.
10. **`coverage-is-exhaustive-over-the-closed-feature-enum`**
    - **asserts —** `BUILD_SPAWN_BOUNDARY_COVERAGE` parses through `ContextTraversalCoverage`, names
      every member of the closed `CoverageFeature` domain exactly once as either supported or
      omitted, lists the three emitted event kinds plus the spawned-agent and SDK surfaces AND
      `field:context_window_capacity` AND `field:agent_model_identity` as supported, and explicitly
      omits `field:candidate_follow_causality`.
    - **AMENDED AGAIN (2026-08-11) —** `field:agent_model_identity` joins `supported`. It is a
      feature the closed domain gained in this same increment, so it did not MOVE sides: it entered
      the declaration already supported, because this adapter genuinely observes both halves of it —
      the model from the slice's `byModel` split, the runtime from the run's declared `source`. The
      exhaustiveness requirement is untouched and stays derived from `CoverageFeature.options`, which
      is what forced the new feature to be declared at all rather than silently widening the claim.
    - **AMENDED (increment 4) —** `field:context_window_capacity` moves from `omitted` to
      `supported`. The existing assertion that it is omitted INVERTS; it is not merely added to.
      Coverage declares what the adapter CAN observe, not what a given trace contains, so
      `supported` is honest even though many slices will still carry no capacity. The
      exhaustiveness-over-the-closed-domain requirement is UNCHANGED and stays derived from
      `CoverageFeature.options` — it is what stops the feature quietly disappearing from the
      declaration instead of moving sides.
11. **`child-session-id-is-a-legal-filename-segment`**
    - **asserts —** CALL `observeLeafSlices(...)` over the fixture set, then read the
      `childSessionId` field OFF the returned `spawn_handoff` and `result_return` events — the values
      the observer itself produced — and assert that EVERY one of them contains none of
      `: \ / * ? " < > |` and no control character, so each is usable verbatim as the sink's
      `<sessionId>.jsonl` filename.
    - **the subject is the observer's OUTPUT, never a string the test builds.** A test that composes
      an id itself, or re-derives the composition rule inside the test file, and then character-checks
      that string does NOT satisfy this contract: it never calls the system under test, so it would
      pass against any implementation, including the defective one. The asserted value must have
      travelled out of `observeLeafSlices`.
    - **every emitted event, not a sample.** The check runs over all `spawn_handoff` and
      `result_return` events the fixture set produces — every phase, unit id, and run id shape — so
      one safely-spelled id cannot vouch for the rest.
    - **the fixtures' INPUT `parentSessionId` values are themselves filename-safe.** That is what
      makes any illegal character in the output attributable to the observer's own composition, which
      is the property under test: filename-safe parent in, filename-safe child out.
    - **falsifiability check —** this contract's test was authored against a source composing
      `` `${parentSessionId}:build:${runId}:${unitId}:${phase}` `` and correctly went RED there; the
      source now composes with `__`. A run that comes back green against a colon-composing source is
      proof the test is not reading the observer's output, not proof the code is safe.
    - Permanent regression case for a MEASURED defect — a `:`-separated child id made
      `appendTraversalEvents` return `false` and write nothing on Windows, silently, because the sink
      swallows the failure — and it is what makes story UAT leg 2 satisfiable at all.
12. **`a-single-declared-window-is-carried-verbatim-onto-the-child-context`**
    - **asserts —** CALL `observeLeafSlices(...)` over a slice whose `byModel` declares exactly ONE
      distinct positive `contextWindow`, then read `contextWindowCapacity` OFF the returned
      `model_context` event — the value the observer itself produced — and assert it is PRESENT and
      strictly equal to the number that travelled in on the input. When that declaring model is also
      the slice's sole `byModel` key, the same event carries its `modelId` (contract 8's rule,
      unchanged). The emitted event parses clean through increment 1's `ModelContextEvent`, so an
      out-of-vocabulary or non-positive capacity is caught by the vocabulary rather than by the
      test's own arithmetic.
    - **the subject is the observer's OUTPUT, never a value the test composed.** A contract phrased
      as "we read the key `contextWindow`" would prove only that the test author and the implementer
      picked the same string — the tautology this story has already paid for once. The asserted
      number must have travelled OUT of `observeLeafSlices`, and the fixture's declared window must
      be a distinctive value that no plausible default or lookup table would produce, so a wrong
      implementation fails rather than coincides.
    - **the discriminating case —** two `byModel` entries declaring the SAME positive window is ONE
      distinct window, so capacity IS carried, while `modelId` stays absent because attribution to a
      single model remains ambiguous. An implementation that shortcuts the rule to "exactly one
      `byModel` KEY" passes the happy path and fails here; that is precisely why the rule is stated
      over distinct declared WINDOWS rather than over model count.
    - **no literal id template, no composed strings.** This contract constrains one number's
      provenance and nothing else. It must not re-pin any session-id spelling — contract 2 owns that
      composition and contract 11 owns its filename-safety.
13. **`an-undeclared-ambiguous-or-non-positive-window-yields-absent-capacity`**
    - **asserts —** over fixture slices covering (a) `byModel` entries declaring NO `contextWindow`,
      (b) two models declaring DIFFERENT positive windows (for example 200000 and 1000000), and (c) a
      declared `0` and a declared negative, the returned `model_context` for EACH carries no
      `contextWindowCapacity` key at all — not `null`, not `0`, not an empty string, not a
      placeholder — while its token observations still render intact. Every one of those events also
      parses clean through `ModelContextEvent`.
    - **these negative cases are the real falsifiers.** A pass-through of a number is trivially
      satisfied by a happy-path assertion; only these three shapes separate a faithful carrier from a
      guess. An implementation carrying a default capacity, a model-id → capacity map, or a
      first-model-wins pick over the ambiguous slice must go RED against this contract.
    - **a first run that comes back green is the diagnosis, not the result** — it means the fixtures
      do not actually declare the shapes above, or the assertion is not reading the observer's
      output.
    - **why `0` is excluded —** the vocabulary is `count.positive()`, so a `0` carried forward would
      fail the event's own parse and lose the whole lane. It must become ABSENT at composition time,
      which is what makes case (c) a behaviour contract rather than a schema restatement.
14. **`handoff-names-the-lane-model-and-runtime`**
    - **asserts —** CALL `observeLeafSlices(...)` over a slice declaring exactly ONE `byModel` key
      and its own `source`, then read `model` and `runtime` OFF the returned `spawn_handoff` — the
      values the observer itself produced — and assert `model` is strictly equal to that sole key and
      `runtime` strictly equal to that declared source. The event parses clean through increment 1's
      `SpawnHandoffEvent`, so an out-of-vocabulary runtime is caught by the vocabulary rather than by
      the test's own string comparison.
    - **the subject is the observer's OUTPUT, never a value the test composed.** A test that
      re-derives the sole-key rule inside the test file, or asserts against the literal it fed in
      without reading it back off a returned event, would pass against any implementation — including
      one that emits neither field. This is the same tautology contract 8 and contract 12 each pay
      for once; do not pay for it a third time.
    - **the PRESENT side carries the whole positive claim.** Every absent-side case in contracts
      15–17 is satisfied VACUOUSLY by an observer that emits neither field — which is exactly what
      this observer did before this increment — so a suite asserting only absence proves nothing
      about this pair.
15. **`ambiguous-model-is-absent-not-guessed`**
    - **asserts —** a slice whose `byModel` declares TWO OR MORE keys emits a `spawn_handoff` with no
      `model` key at all — not `null`, not an empty string, not the first key — while its `runtime`
      still travels normally, so the absence is attributable to the ambiguity rather than to the
      observer having emitted nothing.
    - **falsifiability —** an implementation that picks the first key, joins the keys, or falls back
      to a label must FAIL. `model` follows the `byModel` KEY COUNT (contract 8's rule, reused), NOT
      the count of distinct declared windows that contract 12 governs — an implementation that
      conflates the two passes one and fails the other.
16. **`undeclared-runtime-is-absent-not-defaulted`**
    - **asserts —** a slice carrying NO `source` emits a `spawn_handoff` with no `runtime` key at all,
      even though `sliceUsageDocs()` defaults the identical missing value to `sdk-leaf` for its
      accounting rows. Absent means UNOBSERVED at this boundary and is never defaulted, never looked
      up from a model id, and never borrowed from a sibling slice that did declare one.
    - **falsifiability —** the fixture set must contain a slice that declares `source` alongside one
      that does not, so an implementation that defaults, or that carries the neighbour's value
      forward, goes RED rather than coinciding with the honest answer. Asserted as key ABSENCE, so a
      `null` or `""` placeholder fails too.
    - **this is a deliberate DIVERGENCE, not a defect to reconcile.** A future session that "fixes"
      this to match `sliceUsageDocs()` destroys the distinction between a witnessed `sdk-leaf` and an
      assumed one, which is the entire value of the field; this contract is what makes that change
      RED.
17. **`a-lane-with-neither-field-still-emits`**
    - **asserts —** a slice with NO `byModel` and NO `source` still emits its full `spawn_handoff` /
      `result_return` pair, linked by the same `edgeId`, parsing clean through
      `ContextTraversalEvent`, and carrying neither `model` nor `runtime` — an honestly unattributed
      lane, not a dropped one.
    - **falsifiability —** without this, an implementation that skipped or refused a handoff it could
      not attribute would satisfy contracts 15 and 16 by emitting nothing. Attribution is metadata
      ABOUT a lane; its absence must never cost the lane itself.
18. **`recorded-lanes-without-the-new-fields-still-parse`**
    - **asserts —** a `spawn_handoff` shaped exactly as it was written BEFORE these fields existed —
      no `model`, no `runtime` — parses clean through increment 1's `SpawnHandoffEvent` today. The
      fields are optional, and this is the assertion that keeps them so.
    - **permanent regression case for a MEASURED exposure**, not speculative breadth: 111
      `spawn_handoff` events are already on disk without these fields, the vocabulary is `.strict()`,
      and the sink swallows a failed parse (`catch { return false }`) exactly as it swallowed the
      colon-id write failure contract 11 exists for. Making either field required would therefore
      discard every recorded lane INVISIBLY — no file, no error, no signal. An implementation that
      tightens either field to required must go RED here rather than quietly emptying the archive.

## Integration evidence

`packages/context-traversal-spawn/src/observe-leaf-slices.test.ts` drives the observer over fixture
slice runs shaped exactly like the SDK leaf's per-slice accounting — with usage, without usage, with
one model, with several, with a declared context window, without one, with two DIFFERENT declared
windows, with a non-positive one, with a declared `source`, and with none — using an injected clock and id source so ordering is
asserted, never raced. Every emitted event is round-tripped through increment 1's
`ContextTraversalEvent` (and every `model_context` through `ModelContextEvent`), and the absence
contracts (payload count, never-inferred capacity) are asserted across the whole emitted set, not on
a single happy-path fixture.

The capacity contracts are deliberately weighted toward their negative cases. A number that simply
travels through a function is the easiest thing in this story to prove tautologically — assert the
key name and both sides agree by construction — so the positive contract pins provenance (a
distinctive input value read back OFF the observer's output) while contract 13 carries the falsifying
weight: undeclared, ambiguous, and non-positive inputs must each produce a wholly absent key. Neither
contract may be satisfied by a value the test composed for itself.

The lane-attribution contracts (14–18) are weighted the same way and for the same reason. The
present-side case carries the whole positive claim — both values read back OFF a returned
`spawn_handoff` — because every absent-side case is satisfied vacuously by an observer that emits
neither field, which is exactly what the code did before this increment. The three absence cases then
carry the falsifying weight: an ambiguous `byModel`, an undeclared `source`, and a slice declaring
neither must each produce a wholly missing key on a lane that is still emitted intact. Contract 18 is
different in kind — it asserts nothing about the observer at all, only that the vocabulary still
accepts a handoff written before these fields existed, which is what stops a later tightening from
silently discarding the 111 lanes already on disk.

The filename-safety contract is a character-class check over ids READ OFF the observer's returned
events — not a filesystem write — so it holds identically on every platform's CI runner rather than
passing wherever the host happens to be permissive, and it cannot be satisfied by a string the test
composed for itself. The write-side consequence it protects is proven next door, in
`build-spawn-capture`'s bytes-on-disk contracts.
