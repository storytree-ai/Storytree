---
id: "leaf-slice-spawn-observations"
tier: capability
story: context-traversal-spawn
arc: linked-session-context-arc
title: "One authoring slice's run accounting becomes a linked handoff, child window, and return"
outcome: "A build authoring slice's run accounting observes as an explicit spawn handoff, one child context observation, and a result return — metadata only, capacity absent."
# AMENDED after its first signed green (2026-07-26): a defect found while building the dependent
# capability `build-spawn-capture` violated this capability's own contract surface — the composed
# child session id carried `:`, which is illegal in a Windows path segment, so the sink silently
# wrote nothing for the child lane. The defect amends the OWNING capability rather than spawning a
# new unit (`defects-amend-the-owning-story`): contract 11 is new, contract 2 is de-pinned from the
# literal template, and the authored line reverts to `building` because the existing signed verdict
# no longer covers the full contract list. The crown still DERIVES from signed verdicts (ADR-0020),
# not from this line.
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
`byModel` — matching what the SDK leaf already collects per authoring slice. Importing
`@storytree/agent` would drag the agent organism into a package the studio-adjacent telemetry tier
must stay free of; reading the accounting structurally is exactly what `sliceUsageDocs()` in
`packages/drive/src/usage.ts` already does, and it lets every proof here run offline with no leaf,
no DB, and no API key.

**Shape.** `observeLeafSlices({ parentSessionId, runId, unitId, runs, now, nextId })` returns a
chronological `ContextTraversalEvent[]`. For each slice it emits, in order:

1. `spawn_handoff` on the PARENT session (`sessionId === parentSessionId`), carrying an explicit
   `edgeId`, `parentSessionId`, `childSessionId`, and `agentType`.
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

**The existing colon-template assertions are EXPECTED TO CHANGE — they are not fixed points.** The
current test file hard-codes the literal composition in three places (around lines 74, 166, and 211,
e.g. ``assert.equal(secondSpawn.childSessionId, `${PARENT_SESSION_ID}:build:${RUN_ID}:${UNIT_ID}:IMPLEMENT`)``).
Those assertions pin a SPELLING that amended contract 2 explicitly removes from the contract: what is
promised is composition from the declared components (parent, runId, unitId, phase) plus byte-identical
determinism, NOT a particular separator. When the separator changes to satisfy contract 11, those
three assertions must be updated to the new spelling. Preserving them as-is is not compatible with
greening this capability — an implementer who treats them as untouchable will deadlock.

**What is NOT observed is asserted, not merely omitted.** `payloadTokenCount` is always absent: the
size of the prompt handed to the child is not visible at this boundary, and a contract pins that so
a later estimate goes RED rather than quietly appearing. `contextWindowCapacity` is always absent
for the same reason — nothing in the SDK result declares a window size, and ADR-0235 clause 4 is
runtime-declared-or-absent. **No model-id → capacity lookup table**; that is an assumption, not an
observation.

**One aggregate observation per child, not a running total.** Each authoring slice is its own
independent query with its own window (ADR-0235 clause 5), so `cumulativeInputTokens` and
`addedInputTokens` are EQUAL and both equal
`inputTokens + cacheCreationInputTokens + cacheReadInputTokens`. The equality is the honest
statement about what was observed, not a rounding or a placeholder.

**Coverage is exhaustive by construction.** Export `BUILD_SPAWN_BOUNDARY_COVERAGE` — a
`ContextTraversalCoverage` whose `supported` names exactly what this adapter emits
(`surface:spawned_agent`, `surface:claude_sdk`, `event:spawn_handoff`, `event:model_context`,
`event:result_return`, `field:model_tokens`, `field:child_context_window`) and whose `omitted` is
every remaining member of the closed `CoverageFeature` domain — explicitly including
`field:context_window_capacity` and `field:candidate_follow_causality`. Derive the omissions from
`CoverageFeature.options` so a future vocabulary addition cannot leave a silent gap.

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
6. **`context-window-capacity-is-always-absent`**
   - **asserts —** no emitted `model_context` carries `contextWindowCapacity` for any slice, any
     model id, or any usage shape — the guard that makes a model-id → capacity lookup table a RED
     change rather than a quiet one.
7. **`a-slice-without-usage-emits-no-model-context`**
   - **asserts —** a slice reporting no token breakdown still emits its `spawn_handoff` and
     `result_return` but NO `model_context` — additive capture with nothing honest to persist, the
     `sliceUsageDocs` skip precedent.
8. **`model-and-agent-type-come-from-the-runtime`**
   - **asserts —** `modelId` is the sole `byModel` key when there is exactly one and is absent when
     there are several or none, and `agentType` is the rendered Library agent the leaf actually runs
     as for that phase (`red-builder` for the test-authoring phase, `green-builder` for the
     implementing phase) — a runtime-grounded stable type, never an invented label.
9. **`zero-slices-emit-nothing-and-every-event-parses`**
   - **asserts —** an empty slice list yields zero events, and every event emitted for a mixed slice
     set parses clean through increment 1's `ContextTraversalEvent` union, carrying no field outside
     the strict vocabulary.
10. **`coverage-is-exhaustive-over-the-closed-feature-enum`**
    - **asserts —** `BUILD_SPAWN_BOUNDARY_COVERAGE` parses through `ContextTraversalCoverage`, names
      every member of the closed `CoverageFeature` domain exactly once as either supported or
      omitted, lists the three emitted event kinds plus the spawned-agent and SDK surfaces as
      supported, and explicitly omits `field:context_window_capacity` and
      `field:candidate_follow_causality`.
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
    - **falsifiability check —** against the current source, which composes
      `` `${parentSessionId}:build:${runId}:${unitId}:${phase}` ``, a correct test for this contract
      MUST FAIL. A first run that comes back green is proof the test is not reading the observer's
      output, not proof the code is safe.
    - Permanent regression case for a MEASURED defect — a `:`-separated child id made
      `appendTraversalEvents` return `false` and write nothing on Windows, silently, because the sink
      swallows the failure — and it is what makes story UAT leg 2 satisfiable at all.

## Integration evidence

`packages/context-traversal-spawn/src/observe-leaf-slices.test.ts` drives the observer over fixture
slice runs shaped exactly like the SDK leaf's per-slice accounting — with usage, without usage, with
one model, with several — using an injected clock and id source so ordering is asserted, never
raced. Every emitted event is round-tripped through increment 1's `ContextTraversalEvent`, and the
absence contracts (payload count, capacity) are asserted across the whole emitted set, not on a
single happy-path fixture.

The filename-safety contract is a character-class check over ids READ OFF the observer's returned
events — not a filesystem write — so it holds identically on every platform's CI runner rather than
passing wherever the host happens to be permissive, and it cannot be satisfied by a string the test
composed for itself. The write-side consequence it protects is proven next door, in
`build-spawn-capture`'s bytes-on-disk contracts.
