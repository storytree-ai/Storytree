---
id: "context-traversal-telemetry"
tier: story
title: "An orientation runner records one real-boundary metadata-only context traversal"
outcome: "A real createOrientationRunner instance can be decorated so one successful orientation journey replays as an identity-stable metadata-only traversal trace."
status: proposed
proof_mode: UAT
uat_witness: machine
arc: linked-session-context-arc
depends_on: [drive-machinery]
artifact_edges: [drive-machinery]
decisions: [235, 192]
capabilities: [traversal-event-vocabulary, orientation-runner-telemetry]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-telemetry", "test"]
  scope:
    testGlobs: ["packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts"]
    sourceGlobs: ["packages/context-traversal-telemetry/src/traversal-events.ts", "packages/context-traversal-telemetry/src/traversal-trace.ts", "packages/context-traversal-telemetry/src/orientation-runner-adapter.ts", "packages/context-traversal-telemetry/src/index.ts"]
  real:
    testFile: "packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts"
    sourceFile: "packages/context-traversal-telemetry/src/orientation-runner-adapter.ts"
    scope:
      testGlobs: ["packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts"]
      sourceGlobs: ["packages/context-traversal-telemetry/src/traversal-events.ts", "packages/context-traversal-telemetry/src/traversal-trace.ts", "packages/context-traversal-telemetry/src/orientation-runner-adapter.ts", "packages/context-traversal-telemetry/src/index.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-telemetry", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-telemetry", "typecheck"]
---

# An orientation runner records one real-boundary metadata-only context traversal

**Outcome —** A real `createOrientationRunner` instance can be decorated so one successful
orientation journey replays as an identity-stable metadata-only traversal trace.

This observability-first increment establishes a story-owned telemetry package with a strict event
and trace core plus one integration adapter. The adapter wraps an injected orientation runner and
structured store; the UAT injects a runner returned by the production `createOrientationRunner`
factory. This proves integration against the real boundary without editing drive sources or
claiming that desktop production composition activates the adapter. The model performs no
bookkeeping, and the trace never stores prompts, context bodies, tool results, hidden reasoning,
credentials, spawn payloads, or returned result content.

## Why this is one story

The consumer is an orientation-boundary integrator answering one question: *what context path did
this real runner observably serve?* The shared precondition is a successful request through the
decorated runner, and the shared observable is one replayed metadata trace.

## Capabilities

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`traversal-event-vocabulary`](traversal-event-vocabulary.md) | Boundary observations have a strict metadata-only shape and replay with stable session, visit, and canonical node identity. | — |
| 2 | [`orientation-runner-telemetry`](orientation-runner-telemetry.md) | A wrapper around an injected orientation runner records successful supported search/list and read observations while declaring every omitted adapter surface. | `traversal-event-vocabulary` |

The graph is acyclic: the adapter consumes the vocabulary and structured trace; the vocabulary
consumes nothing.

## UAT Test Criteria

**Goal —** Decorate a real `createOrientationRunner` instance, drive one successful orientation
journey, and replay its deterministic observations while preserving every uncertainty and identity
boundary ADR-0235 settles.

1. **Cross the real factory boundary through the story-owned adapter.** _(witness: machine)_ _(proof-gate: context-traversal-telemetry#gate-1)_ Create a _(criterion-id: uatc_f4b86cb85b2b44623c6be874)_ _(revision-id: uatr1:a9a9cf768bebee82)_
   runner with the production `createOrientationRunner` factory, then pass that runner and a
   structured trace store to the story-owned decorator. Invoke a front-matter-derived focused-tree
   read followed by `tree spec` for the same canonical node. **Success —** the unchanged runner
   responses return, and replay contains two unique chronological `visitId` values under one stable
   `sessionId` and canonical `nodeId`; the front-matter and full-payload visits remain distinct,
   with no returned markdown copied into telemetry.
2. **Record search/list coverage without claiming a follow.** _(witness: machine)_ _(proof-gate: context-traversal-telemetry#gate-1)_ Invoke the _(criterion-id: uatc_4efa086fe3ca31a282e8dc17)_ _(revision-id: uatr1:8aea752a4afe676d)_
   decorated runner's Library artifact-list boundary, then request one returned artifact.
   **Success —** the search/list observation records only operation and canonical result ids; the
   artifact request is a full-payload visit, but no followed edge appears because the adapter
   receives no explicit followed-edge identity.
3. **Expose the adapter's honest coverage.** _(witness: machine)_ _(proof-gate: context-traversal-telemetry#gate-1)_ Query the wrapper's coverage _(criterion-id: uatc_d05be13138fa617a83a6d052)_ _(revision-id: uatr1:bbc5b381f7f101bc)_
   declaration. **Success —** it names only the tree/Library search-list, front-matter, and
   full-payload observations emitted by this adapter; it explicitly omits model-token/capacity,
   candidate-follow causality, spawn/handoff/return, agents, noticeboard, direct CLI, SDK,
   owned-loop, and every other runtime adapter. Missing capacity remains unknown.
4. **Refuse inferred causality.** _(witness: machine)_ _(proof-gate: context-traversal-telemetry#gate-1)_ Place visits close together in time without an _(criterion-id: uatc_e9ee0be93d55175c7711a3d2)_ _(revision-id: uatr1:16ae6e64fde8e323)_
   explicit followed edge, and include a revisit carrying an explicit prior-visit reference.
   **Success —** temporal proximity creates no causal edge; the revisit is a new forward
   chronological visit linked only to its declared earlier visit.
5. **Prove future parent/child shapes without inventing live wiring.** _(witness: machine)_ _(proof-gate: context-traversal-telemetry#gate-1)_ Parse and _(criterion-id: uatc_5eaa8f7cf499b481be00e78d)_ _(revision-id: uatr1:50b5a1451106ae63)_
   replay schema fixtures carrying explicit spawn-handoff and result-return edges. **Success —**
   parent and child windows remain independent and link only through explicit edge identity; this
   is schema/replay proof only, while the orientation adapter declares those event kinds unsupported
   and emits none.

## Evidence

The standing machine UAT is
`packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts`, run by
`pnpm --filter @storytree/context-traversal-telemetry test`. It constructs the runner through the
production `createOrientationRunner` factory, decorates that injected runner with the story-owned
adapter and structured store, then drives front-matter, full-payload, and search/list requests.
This is a real-boundary integration adapter proof, not proof of desktop application activation.
All proof sources and tests owned by this story remain under
`packages/context-traversal-telemetry`; no drive source is edited or claimed.

## Reliability Gates

Every UAT leg above is `witness: machine`, and each is bound to `context-traversal-telemetry#gate-1`
by an explicit `_(proof-gate: …)_` annotation — the binding the resolver looks up VERBATIM, with no
first-observe fallback and no inference from ordering. The gate is what makes those legs
machine-provable at all: without it a machine leg has no command to resolve to, refuses operator
attestation (ADR-0082 d.2), and the story's UAT can never green. This story shipped without that
binding and its legs were structurally unprovable for five increments; this section is the fix.

The gate carries NO `(covers:)` list, deliberately. Both capabilities are driven red→green by the
spine and earn their own signed `--real` verdicts; a coverage list here would let an adopt pass
green a capability that never went red, which is the inverse theatre ADR-0085 / ADR-0097 ban — and
that is precisely the trap this story was rebuilt to escape rather than re-enter.

1. **The telemetry package's own suite is green** _(gate: observe)_
   `pnpm --filter @storytree/context-traversal-telemetry test`. The spine runs it at a clean
   committed HEAD and OBSERVES it green — the strict metadata-only event vocabulary and its
   refusals, the deterministic record/replay trace with its duplicate-identity refusals and its
   explicit-ids-only relationships, and the standing UAT that decorates a runner built by the real
   production `createOrientationRunner` factory and proves no envelope body, no fixture canary, and
   no inferred edge reaches the trace — all offline, no DB and no API key — then signs an `adopted`
   verdict (`storytree adopt context-traversal-telemetry --pg`, which observe-and-signs this gate
   and the five legs bound to it).

The gate is a truthful SECOND observation, not an adoption standing in for a red that never
happened: both capabilities earned signed `--real` PASS verdicts through the prove-it-gate first,
and `orientation-runner-telemetry`'s own red→green authored the standing UAT file this gate runs.

## Explicitly outside this increment

- Desktop production composition and activation of the adapter, and any claim that desktop consumes
  this package.
- Direct CLI, SDK, Codex, owned-loop, spawned-agent, agents, and noticeboard production adapters.
  Spawn handoff and result return are schema-only in this increment.
- Persistence, retention, access-control policy, long-session aggregation, or idle-span folding.
- Forest playback, gauges, drill-down UI, icons, colors, or the 500k danger-region rendering.
- Ranking, guidance, prefetch, compaction, pruning, eviction, context removal, or traversal limits.
- Any causal edge inferred from timestamps or adjacency.

Those are later evidence-backed increments. This story supplies the trustworthy observational seam
they can consume without reopening ADR-0235.
