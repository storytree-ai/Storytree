---
id: "traversal-event-vocabulary"
tier: capability
story: context-traversal-telemetry
arc: linked-session-context-arc
title: "Traversal observations record and replay strict metadata-only evidence"
outcome: "A deterministic boundary observation records and replays with strict stable identity, explicit relationships, and adapter-declared coverage."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [235, 192]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-telemetry", "test"]
  scope:
    testGlobs: ["packages/context-traversal-telemetry/src/traversal-events.test.ts"]
    sourceGlobs: ["packages/context-traversal-telemetry/src/traversal-events.ts", "packages/context-traversal-telemetry/src/traversal-trace.ts", "packages/context-traversal-telemetry/src/index.ts"]
  real:
    testFile: "packages/context-traversal-telemetry/src/traversal-events.test.ts"
    sourceFile: "packages/context-traversal-telemetry/src/traversal-trace.ts"
    scope:
      testGlobs: ["packages/context-traversal-telemetry/src/traversal-events.test.ts"]
      sourceGlobs: ["packages/context-traversal-telemetry/src/traversal-events.ts", "packages/context-traversal-telemetry/src/traversal-trace.ts", "packages/context-traversal-telemetry/src/index.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-telemetry", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-telemetry", "typecheck"]
---

# Traversal observations record and replay strict metadata-only evidence

## Guidance

Define the browser-safe strict event vocabulary and append/replay trace in the story-owned
`packages/context-traversal-telemetry` package. A node visit separates canonical `nodeId` from
unique chronological `visitId` and stable `sessionId`. Front-matter inspection and full-payload
read are different event kinds, not a flag guessed downstream. A model-context observation may
carry cumulative input, input added since the preceding observation, and runtime-declared capacity;
absent capacity stays absent.

Spawn handoff and result return schemas carry explicit parent/child session identity plus an edge
identity, never payload or result content. They prove only a vocabulary that future adapters can
emit: spawn and return production adapters are omitted from this increment. An adapter coverage
declaration names supported event kinds and fields plus explicit omissions. All event variants are
strict: no arbitrary metadata bag provides a side door for prompts, bodies, tool results, hidden
reasoning, or credentials.

Replay orders observations chronologically but creates relationships only from explicit ids.
Timestamp proximity is never evidence. Child sessions retain independent token/capacity
observations even though this increment has no production spawn or return adapter.

### Contract ids — name every test case after the contract it proves

`spec.contracts` does not reach this brief, so the six ids are restated here and are load-bearing:
give each `node:test` case a name that STARTS with its contract id, verbatim.

`canonical-and-chronological-identity-stay-separate` ·
`read-strength-is-an-event-kind` ·
`capacity-is-runtime-declared-or-unknown` ·
`spawn-edge-schemas-link-independent-sessions` ·
`adapter-coverage-names-omissions` ·
`replay-does-not-infer-relationships`

### Published surface — two other packages already import this one

This capability is being re-proven red→green, not invented: `@storytree/context-traversal-capture`
and `@storytree/context-traversal-spawn` import this package by name today and must keep compiling.
The exported surface is therefore part of the contract, not a free choice. Export from
`traversal-events.ts`:

- `ContextTraversalEvent` — a zod union over the eight event kinds below, plus a type of the same
  name. Every member is `.strict()`.
- The eight members, each exported by name and each carrying `eventId`, `sessionId`, and an ISO
  `at` timestamp with an offset: `FrontMatterReadEvent` and `FullPayloadReadEvent` (both adding
  `visitId`, `nodeId`, and optional `surfaceId` / `parentVisitId` / `priorVisitId` /
  `followedEdgeId`); `SearchEvent` (`searchId`, `surfaceId`, `operation` ∈
  {`library_artifact_list`, `library_dashboard`}, `resultNodeIds`); `CandidateSetEvent`
  (`candidateSetId`, `surfaceId`, non-empty `candidateNodeIds`); `FollowedEdgeEvent` (`edgeId`,
  `candidateSetId`, `fromVisitId`, `toVisitId`); `ModelContextEvent` (optional `modelId`,
  `cumulativeInputTokens`, `addedInputTokens`, optional positive `contextWindowCapacity`);
  `SpawnHandoffEvent` and `ResultReturnEvent` (`edgeId`, `parentSessionId`, `childSessionId`, plus
  `agentType`/`payloadTokenCount` and `resultTokenCount`/`ok` respectively).
- `CoverageFeature` — a zod enum whose options are the closed feature domain, covering the runtime
  surfaces (`surface:create_orientation_runner`, `surface:direct_cli`, `surface:claude_sdk`,
  `surface:codex`, `surface:owned_loop`, `surface:spawned_agent`, `surface:agents`,
  `surface:noticeboard`), one `event:<kind>` per event kind, and the fields
  `field:surface_id`, `field:parent_visit_id`, `field:prior_visit_id`, `field:model_tokens`,
  `field:context_window_capacity`, `field:candidate_follow_causality`, `field:child_context_window`.
- `ContextTraversalCoverage` — a strict `{ adapterId, supported, omitted }` schema over that enum,
  plus a type of the same name.
- `ContextVisitEvent` / `ContextModelEvent` types, and the `isContextVisitEvent` narrowing guard.

Export from `traversal-trace.ts`: `ContextTraversalTrace` (an `append` / `declareCoverage` /
`replay` interface), `ContextTraversalReplay` (`events`, `coverage`, `relationships`, `sessions`),
`ContextTraversalRelationship`, `ContextTraversalSessionLane`, and the
`createContextTraversalTrace()` factory. `packages/context-traversal-telemetry/src/index.ts` is the
package's only export barrel and is in your write scope: re-export both modules from it, because the
two downstream packages import by package name rather than by path. `append` and `declareCoverage` parse their input as
`unknown`, refuse a duplicate `eventId` / `visitId` / `adapterId` by throwing, and mutate nothing
until every check has passed. The recorder never calls a clock, generates an id, or derives
causality — identity and time originate at the adapter.

`ModelContextEvent.addedInputTokens` is retained deliberately even though ADR-0248 D3 deletes it:
that deletion has live emitters in another story and belongs to the increment that owns them.

## Contracts

1. **`canonical-and-chronological-identity-stay-separate`**
   - **asserts —** every node visit has non-empty `sessionId`, unique `visitId`, and canonical
     `nodeId`; revisiting the same node requires a new `visitId` and may name `priorVisitId`.
   - **falsifiability —** the assertion is made against values that came back OUT of the trace
     (`append`'s return value, or a `replay()` event), never against the literal the test composed.
     Appending two visits that share a `visitId` must THROW, and a blank or whitespace-only
     `sessionId`/`nodeId` must fail to parse — so a schema that accepts any string, or a recorder
     that dedupes silently instead of refusing, goes red rather than coinciding.
2. **`read-strength-is-an-event-kind`**
   - **asserts —** front-matter inspection and full-payload read parse as distinct kinds while
     storing identity, revision/count metadata only; any content-bearing or unknown field is
     refused.
   - **falsifiability —** the refusal half is asserted on a payload carrying a plausible extra key
     (a `body`, `text`, or `metadata` bag) and must FAIL to parse. A schema that is not `.strict()`
     passes the positive half and fails only here, so the negative case is the one that carries the
     contract.
3. **`capacity-is-runtime-declared-or-unknown`**
   - **asserts —** non-negative cumulative/added token observations parse; capacity is retained
     only when supplied by the runtime, with no default capacity and no 500k cutoff semantics.
   - **falsifiability —** an event parsed WITHOUT `contextWindowCapacity` must come back with the
     key absent — asserted as absence, not as a falsy value, so a schema that defaults it to `0`,
     `null`, a model-id lookup, or the 500k threshold goes red. A negative token count and a
     zero/negative capacity must both be refused.
4. **`spawn-edge-schemas-link-independent-sessions`**
   - **asserts —** schema fixtures for handoff/return events require explicit parent and child
     session ids plus their edge id, preserve independent windows, expose metadata counts at most,
     and reject payload/result bodies without asserting that a production spawn adapter emits them.
   - **falsifiability —** a handoff whose `parentSessionId` equals its `childSessionId`, and one
     whose `sessionId` is not the parent, must both be REFUSED; a fixture carrying a `payload` or
     `result` body must fail to parse. Without those three refusals the contract is satisfied by any
     object shaped roughly right.
5. **`adapter-coverage-names-omissions`**
   - **asserts —** each adapter declares supported kinds/fields and explicit omissions;
     contradictory, unknown, or content-bearing coverage data is refused rather than normalized
     into completeness.
   - **falsifiability —** a declaration that OMITS one feature entirely — neither supported nor
     omitted — must be refused, and the same feature named on both lists must be refused. The
     exhaustiveness check is asserted over `CoverageFeature.options` rather than a hand-listed
     subset, so adding a ninth event kind without declaring it reds this contract instead of
     silently widening the honest-coverage claim.
6. **`replay-does-not-infer-relationships`**
   - **asserts —** replay preserves chronological order and explicit prior/spawn/followed ids while
     never deriving an edge from timestamp adjacency; parent and child token windows remain
     separate.
   - **falsifiability —** the fixture places two visits ADJACENT in time with no explicit
     `parentVisitId`, `priorVisitId`, or followed edge, and asserts the replay's `relationships` is
     EMPTY for them. An implementation that pairs neighbours, orders by insertion instead of `at`,
     or merges two sessions' `modelContext` into one lane must fail. Asserted over the returned
     replay, not over the events fed in.

## Integration evidence

`packages/context-traversal-telemetry/src/traversal-events.test.ts` parses a mixed session/child
trace through the story-owned schemas and structured trace store, exercises every refusal above,
and proves the resulting values contain metadata only. Explicit spawn/return edges and independent
windows are schema/replay proof only.
