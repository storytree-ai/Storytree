---
id: "terminal-boundary-observations"
tier: capability
story: context-traversal-capture
arc: linked-session-context-arc
title: "Terminal invocations become observations only through a read allowlist"
outcome: "A terminal invocation's argv becomes metadata-only read observations only when it matches an allowlisted read shape."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [235, 241]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/observe-cli.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/observe-cli.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/observe-cli.test.ts"
    sourceFile: "packages/context-traversal-capture/src/observe-cli.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/observe-cli.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/observe-cli.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# Terminal invocations become observations only through a read allowlist

## Guidance

Author a PURE function in the story-owned package:
`observeCliInvocation(argv, { ok, sessionId, nextVisitId, now })` → `ContextTraversalEvent[]`, plus a
`ContextTraversalCoverage` declaration for adapter id `terminal-cli-dispatch`. Pure means no clock, no
id generation, no filesystem: identity and time are injected so the proof is deterministic, matching
increment 1's rule that identity/time originate at the runtime adapter.

**This is an ALLOWLIST of read shapes, not a translation of argv.** The default answer for any
invocation is zero events. Only these shapes observe anything:

| argv shape | event kind | notes |
|---|---|---|
| `tree <story-id>` | `front_matter_read` | canonical `nodeId` from argv |
| `tree spec <node-id>` | `full_payload_read` | the full-payload strength |
| `library artifact <id>` | `full_payload_read` | |
| `library artifact list [<category>]` | `search` | `operation: library_artifact_list`, `resultNodeIds: []` |
| `agents <name> [--step <s>]` | `full_payload_read` | a distinct `surfaceId` for the agent surface |
| `library` (bare dashboard) | `front_matter_read` | the dashboard surface only |

`resultNodeIds` is deliberately EMPTY: the dispatch boundary sees an envelope, not the store, so an
invented result list would be inferred data masquerading as an observation. `agents --step` emits no
`candidate_set` for the same reason — the boundary cannot see the refs list without reading the body.

**Never record argv verbatim.** Write and unknown commands carry owner prose and secrets:
`noticeboard declare --working-on "…"`, `library artifact edit … --set body=@file`,
`adr new --title "…"`, `arc increment add … --outcome "…"`. Those emit NOTHING. The emitted events may
contain only allowlisted ids drawn from the positional read shapes above — never a flag value, never
free text (ADR-0235 clause 6, enforced on bytes by ADR-0241 D4).

**Observation is success-only.** `ok: false` emits zero events, so a refused or failed command never
appears as a read that happened.

**No causality in THIS PURE OBSERVER.** No event `observeCliInvocation` emits carries `parentVisitId`,
`priorVisitId`, or `followedEdgeId`. Two commands in sequence are two independent forward visits; a
revisit is a new forward visit, not a backward jump (ADR-0235 clause 2/3). Canonical `nodeId` stays
separate from the chronological `visitId` supplied by `nextVisitId`.

> Scoped 2026-07-27 (a correction to this paragraph's reach, not to any contract below). Read
> boundary-wide, the sentence above is now false: later increments COMPOSE onto this observer, and
> what the terminal boundary writes to disk carries two of those fields — `priorVisitId` from
> `revisit-links.ts` and `parentVisitId` from `descend-agent-refs.ts`, both under the same adapter id
> `terminal-cli-dispatch`. This capability's own claim is unchanged and still true: the BARE argv
> observer infers nothing from ordering, adjacency, or timestamps, and its base coverage constant
> honestly declares both fields omitted. The composed declaration is the honest one for anything the
> CLI actually renders (`AGENT_DESCENT_COVERAGE`; see `terminal-capture.ts`'s `showTraversalSession`).
> Do not "fix" `observe-cli.ts` or its green test to match — the layering is deliberate.

**Coverage stays exhaustive and honest.** `CoverageFeature` is a closed enum whose validator refuses
any feature that is neither supported nor omitted — that exhaustiveness check is what makes a
convenient omission impossible. Declare `surface:direct_cli` supported (the enum already carries it —
no schema change), together with the read/search event kinds and `field:surface_id` this adapter
actually emits; declare everything else omitted, explicitly including model tokens and context-window
capacity, candidate-follow causality, spawn handoff and result return, child context windows, and
every other surface. Missing capacity stays unknown, never defaulted.

Files: `packages/context-traversal-capture/src/observe-cli.ts` and `observe-cli.test.ts`. This
capability shares no symbol with `traversal-trace-sink` and can be built in parallel with it; the only
shared touch points are `src/index.ts` and `package.json`.

## Contracts

1. **`read-argv-maps-to-read-strength-kinds`**
   - **asserts —** each allowlisted read shape maps to the kind in the table above with the canonical
     `nodeId` taken from argv, the injected `visitId`, and the injected timestamp; front-matter and
     full-payload remain distinct kinds rather than a downstream flag.
2. **`failed-invocations-observe-nothing`**
   - **asserts —** an otherwise-allowlisted read shape with `ok: false` yields zero events, so a
     refusal or failure is never recorded as a completed read.
3. **`write-and-unknown-invocations-emit-no-prose`**
   - **asserts —** a fixture table of write and unknown invocations carrying canary prose in
     `--working-on`, `--set`, `--title`, and `--outcome` yields ZERO events, and no emitted event
     anywhere in the suite contains any token that is not an allowlisted positional id.
4. **`no-causality-is-inferred-at-the-boundary`**
   - **asserts —** no emitted event carries `parentVisitId`, `priorVisitId`, or `followedEdgeId`, and
     `agents --step` emits no `candidate_set` — adjacency, ordering, and timestamps produce no edge.
5. **`terminal-coverage-declares-every-omission`**
   - **asserts —** the `terminal-cli-dispatch` coverage declaration parses against the closed
     `CoverageFeature` enum with `supported` ∪ `omitted` covering it exhaustively, marking
     `surface:direct_cli` supported while explicitly omitting model tokens, context-window capacity,
     candidate-follow causality, spawn/handoff/return, child windows, and every other surface.

## Integration evidence

`packages/context-traversal-capture/src/observe-cli.test.ts` drives the pure observer with injected
`sessionId`, `visitId`s, and timestamps over a table of allowlisted read invocations and a matching
table of write/unknown invocations seeded with canary prose. It parses every emitted event and the
coverage declaration through increment 1's schemas, and asserts the prose-refusal contract over the
serialized events so a leaked flag value cannot hide inside a nested field.
