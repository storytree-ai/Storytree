---
id: "orientation-runner-telemetry"
tier: capability
story: context-traversal-telemetry
arc: linked-session-context-arc
title: "An orientation-runner adapter records honest read and search telemetry"
outcome: "A wrapper around an injected orientation runner records its successful metadata-only read and search observations while declaring every omitted surface."
status: proposed
proof_mode: integration-test
depends_on: [traversal-event-vocabulary]
decisions: [235, 192]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-telemetry", "test"]
  scope:
    testGlobs: ["packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts"]
    sourceGlobs: ["packages/context-traversal-telemetry/src/orientation-runner-adapter.ts", "packages/context-traversal-telemetry/src/index.ts"]
  real:
    testFile: "packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts"
    sourceFile: "packages/context-traversal-telemetry/src/orientation-runner-adapter.ts"
    scope:
      testGlobs: ["packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts"]
      sourceGlobs: ["packages/context-traversal-telemetry/src/orientation-runner-adapter.ts", "packages/context-traversal-telemetry/src/index.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-telemetry", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-telemetry", "typecheck"]
---

# An orientation-runner adapter records honest read and search telemetry

## Guidance

Implement a wrapper/decorator adapter in the story-owned
`packages/context-traversal-telemetry` package. The adapter accepts an injected orientation runner,
stable `sessionId`, and structured trace store. It delegates each request unchanged and records an
observation only after a successful response. Focused-tree and Library-dashboard reads emit
front-matter observations; `tree spec` and `library artifact <id>` emit full-payload observations;
Library artifact listing emits a search/list observation with canonical result ids. Envelopes and
returned content never enter telemetry.

The adapter owns no drive source and does not alter `createOrientationRunner`. Its UAT composes the
wrapper with a runner returned by the real production `createOrientationRunner` factory, proving a
real-boundary integration seam without claiming that the desktop application activates it. The
runner adapter cannot observe model token usage or capacity, explicit followed-edge identity,
spawn handoffs/returns, or independent child windows, so its coverage declares those fields and
event kinds unsupported and emits none. Direct CLI, SDK, owned-loop, spawned-agent, agents, and
noticeboard adapters are omitted. Spawn/return support is schema-only.

### Contract ids — name every test case after the contract it proves

`spec.contracts` does not reach this brief, so the four ids are restated here and are load-bearing:
write FOUR separate `node:test` cases, each named starting with its contract id, verbatim. One case
asserting all four ids at once does not make four contracts traceable.

`decorated-production-runner-emits-read-strength` ·
`orientation-search-list-is-metadata-only` ·
`orientation-coverage-is-honest` ·
`telemetry-wrapper-is-additive`

### Published surface and the real factory

The wrapper is re-proven red→green, not invented. Export from `orientation-runner-adapter.ts`:
`withContextTraversalTelemetry(runner, telemetry)` returning a runner of the same shape;
`ORIENTATION_RUNNER_ADAPTER_COVERAGE`, a `ContextTraversalCoverage` value whose `adapterId` is
`orientation-runner-decorator`, whose `supported` list is exactly `event:front_matter_read`,
`event:full_payload_read`, `event:search`, and `field:surface_id`, and whose `omitted` list is
every other `CoverageFeature.options` member; and the `OrientationEnvelope`, `OrientationRunner`,
`OrientationNodeStore`, and `OrientationRunnerTelemetry` types. `OrientationRunnerTelemetry`
carries `sessionId`, `trace`, `nodeStore`, an injected `nextVisitId()`, and an injected `now()` —
the adapter never calls an ambient clock or generates an id of its own.

`packages/context-traversal-telemetry/src/index.ts` is in your write scope and is the package's only
export barrel. It already re-exports `./traversal-events.js` and `./traversal-trace.js`, which two
other packages depend on: ADD the adapter's re-export, never replace what is there.

The real factory is `createOrientationRunner` from `@storytree/drive`. It takes
`{ store, storiesDir, lookupConfig, … }` and returns `(argv) => Promise<Envelope>`; the UAT builds
one over a temporary stories directory and an in-memory read-only `Store`, so the boundary crossed
is production code rather than a stub of it.

## Contracts

1. **`decorated-production-runner-emits-read-strength`**
   - **asserts —** the adapter around an injected runner returned by the real
     `createOrientationRunner` factory emits focused-tree front-matter and `tree spec`/artifact
     full-payload as distinct visit kinds with stable session/canonical-node identity, unique visit
     ids, and no envelope body.
   - **falsifiability —** the fixture story's markdown body and the fixture artifacts' bodies carry
     distinctive canary strings, and the test asserts those strings are ABSENT from the serialized
     replay. The two reads target the SAME canonical node, so a wrapper that keyed identity off the
     node instead of the occurrence produces one visit where two are required, and an adapter that
     collapsed read strength into one kind fails on the kind sequence.
2. **`orientation-search-list-is-metadata-only`**
   - **asserts —** a successful Library artifact-list call records its operation plus canonical
     result ids only; requesting a result later does not create a followed edge.
   - **falsifiability —** the list is filtered by kind so its result ids are a known proper subset,
     and the later artifact read is one of those ids — the exact adjacency a temporal-proximity
     implementation would join. The replay's `relationships` must contain NO `followed` edge. A
     search event carrying titles, bodies, or the envelope text fails the canary assertion.
3. **`orientation-coverage-is-honest`**
   - **asserts —** coverage names only supported tree/Library reads and list/search while explicitly
     omitting model capacity/tokens, followed edges, spawn/handoff/return, independent child
     windows, and every other production adapter.
   - **falsifiability —** the omitted set is asserted to be exactly `CoverageFeature.options` minus
     the four supported features — computed from the enum, not hand-listed — so a declaration that
     quietly drops a feature, or that claims a surface this adapter cannot observe, reds. Coverage
     is read off the REPLAY (`replay().coverage`), proving the adapter actually declared it to the
     trace rather than merely exporting a constant.
4. **`telemetry-wrapper-is-additive`**
   - **asserts —** the wrapper preserves successful and unsuccessful runner envelopes; it writes
     observations only for successful calls and never changes bodies, `next` guidance, misses, or
     read-only refusals.
   - **falsifiability —** the same argv is run through the BARE runner and through the decorated
     runner and the two envelopes are compared with a deep equality, for a hit and for a miss — so
     a wrapper that reshapes, re-wraps, or annotates the envelope fails even when it records the
     right event. The miss case additionally asserts the trace's event count is UNCHANGED across
     it, which a wrapper recording before checking `ok` cannot satisfy.

## Integration evidence

`packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts` is this
capability's standing proof and the story's standing machine UAT. It builds a runner through the
real production `createOrientationRunner` factory over a temporary stories directory and an
in-memory read-only `Store`, decorates it with the story-owned wrapper and a structured trace, and
drives front-matter, full-payload, and search/list requests plus a miss. Spawn handoff, result
return, revisit, and model-context observations are appended to the same trace as schema/replay
fixtures — the adapter declares those kinds unsupported and emits none. Neither this proof nor the
adapter edits or claims instrumentation inside the drive package.
