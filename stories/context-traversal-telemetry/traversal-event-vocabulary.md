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
  optional `windowId`, `cumulativeInputTokens`, `addedInputTokens`, optional
  `residentInputTokens`, optional positive `contextWindowCapacity`);
  `SpawnHandoffEvent` and `ResultReturnEvent` (`edgeId`, `parentSessionId`, `childSessionId`, plus
  `agentType`/optional `model`/optional `runtime`/optional `payloadTokenCount` and
  `resultTokenCount`/`ok` respectively). The lane's `model` and `runtime` sit on the HANDOFF and
  deliberately NOT on the return: a lane's identity is established when it is spawned, and restating
  it on the return would give one fact two sources of truth with no observer able to say which is
  right. The return is `.strict()`, so it REFUSES them rather than ignoring them.
- `AgentRuntime` — a zod enum `["sdk-leaf", "codex-leaf", "owned-loop"]` (plus a type of the same
  name), the closed vocabulary of `SpawnHandoffEvent.runtime`. It is a deliberate DUPLICATE of
  `UsageSource` in `@storytree/proof-protocol`, never an import: this package is a root the whole
  traversal graph rests on and takes no dependency to borrow three string literals — the same call
  `proof-protocol` itself already makes for `Tier`/`Status`. The values are kept identical ON PURPOSE
  so a reader can join a traversal lane to its `events.usage_event` row without a translation table;
  changing one without the other silently breaks that join.
- `CoverageFeature` — a zod enum whose options are the closed feature domain, covering the runtime
  surfaces (`surface:create_orientation_runner`, `surface:direct_cli`, `surface:claude_sdk`,
  `surface:codex`, `surface:owned_loop`, `surface:spawned_agent`, `surface:agents`,
  `surface:noticeboard`, `surface:host_transcript`), one `event:<kind>` per event kind, and the
  fields `field:surface_id`, `field:parent_visit_id`, `field:prior_visit_id`, `field:model_tokens`,
  `field:resident_input_tokens`, `field:window_id`, `field:context_window_capacity`,
  `field:candidate_follow_causality`, `field:child_context_window`,
  `field:agent_model_identity`.
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

**Vocabulary extended 2026-07-27 by story `context-traversal-transcript` (ADR-0248 D1), additively.**
`ModelContextEvent` gained optional `residentInputTokens` (window OCCUPANCY at one request — the
quantity the arc's playhead bar plots, and the one that can FALL) and optional `windowId` (which
window an observation belongs to, since a worktree-derived `sessionId` outlives any single runtime
window); `CoverageFeature` gained `surface:host_transcript`, `field:resident_input_tokens`, and
`field:window_id`. Every one of the six contracts below still holds unchanged: the added event
fields are optional, and contract 5's exhaustiveness is asserted over `CoverageFeature.options`
rather than a hand-listed subset, so every existing adapter — all of which compute `omitted` from
that same enum — absorbed the three new features with no source change. This capability's signed
verdict was deliberately NOT re-run for the edit: a `--real` rebuild of an already-green unit risks
permanently under-claiming it, and the edit adds no behaviour this capability's own contracts
describe. What asserts the new fields is the extending story's own suite, which round-trips them
through `ContextTraversalEvent` onto bytes on disk.

**Vocabulary extended 2026-08-11 by story `context-traversal-spawn` (arc `traversal-panel-arc`),
additively.** `SpawnHandoffEvent` gained optional `model` (WHICH model the child lane ran on — an
identity string, never a display label) and optional `runtime` (WHICH leaf runtime ran it, typed by
the new `AgentRuntime` enum); `CoverageFeature` gained `field:agent_model_identity`, so an adapter
declares whether it can attribute a lane at all rather than leaving a reader to assume. A new
exported `AgentRuntime` enum joins the published surface (see the bullet above for why it is a
deliberate duplicate of `proof-protocol`'s `UsageSource` rather than an import).

**Absent means UNOBSERVED here and is never defaulted.** That DIVERGES on purpose from
`sliceUsageDocs()` (`packages/drive/src/usage.ts`), which defaults a missing source to `sdk-leaf`
because an accounting row must balance; this vocabulary refuses to, so a renderer can print "not
recorded" rather than assert a runtime nobody witnessed. The two instruments agree wherever the field
is present and this one stays silent where it is not, instead of both inventing the same answer.
Optional is also what keeps the 111 `spawn_handoff` events ALREADY on disk parseable: these schemas
are `.strict()` and the sink DROPS an unparseable event silently, so a required field here would have
discarded every recorded lane invisibly. `ResultReturnEvent` deliberately did NOT gain the pair — the
lane's identity is established at the handoff, and `.strict()` makes the return REFUSE them, so one
fact can never acquire two sources of truth.

Every one of the six contracts below still holds unchanged, for exactly the reason the 2026-07-27
note gives: the two added event fields are OPTIONAL, so every fixture the existing contracts parse
still parses and every absence they assert is still an absence; and contract 5's exhaustiveness is
asserted over `CoverageFeature.options` rather than a hand-listed subset, so every adapter — all of
which derive `omitted` from that same enum — absorbs `field:agent_model_identity` with no source
change. The new cases BIND to existing contracts rather than adding any: the handoff/return schema
cases are contract 4 (`spawn-edge-schemas-link-independent-sessions` already owns what the spawn-edge
schemas require, expose, and refuse), and the coverage-partition case is contract 5
(`adapter-coverage-names-omissions`). No contract is amended, restated, or added by this extension.
As in the previous extension, this capability's signed verdict was deliberately NOT re-run: a
`--real` rebuild of an already-green unit risks permanently under-claiming it, and what asserts the
new fields end-to-end is the extending story's own suite.

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
