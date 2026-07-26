---
id: "multi-adapter-replay"
tier: capability
story: context-traversal-spawn
arc: linked-session-context-arc
title: "A replay declares every installed adapter's coverage, so no event renders under a declaration that omits it"
outcome: "A captured session replays under the union of installed adapter coverage declarations, so every rendered event kind is supported by at least one declaration."
status: proposed
proof_mode: integration-test
depends_on: [leaf-slice-spawn-observations]
decisions: [235, 241, 192]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-spawn", "test"]
  scope:
    testGlobs: ["packages/context-traversal-spawn/src/replay-adapters.test.ts"]
    sourceGlobs: ["packages/context-traversal-spawn/src/replay-adapters.ts"]
  real:
    testFile: "packages/context-traversal-spawn/src/replay-adapters.test.ts"
    sourceFile: "packages/context-traversal-spawn/src/replay-adapters.ts"
    scope:
      testGlobs: ["packages/context-traversal-spawn/src/replay-adapters.test.ts"]
      sourceGlobs: ["packages/context-traversal-spawn/src/replay-adapters.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-spawn", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-spawn", "typecheck"]
---

# A replay declares every installed adapter's coverage, so no event renders under a declaration that omits it

## Guidance

Author the multi-adapter replay composition:
`showTraversalSessionAllAdapters(sessionId, opts?)` reads through increment 2's
`readTraversalSession` and renders through its `renderTraversalSession`, declaring
`coverage: [TERMINAL_CLI_DISPATCH_COVERAGE, BUILD_SPAWN_BOUNDARY_COVERAGE]`.

**Why this exists.** Increment 2's `showTraversalSession` HARDCODES the single terminal adapter's
declaration, because at the time the terminal was the only producer. Now a session's trace can hold
`spawn_handoff`, `model_context`, and `result_return` events too — and rendering those under a
coverage block that explicitly OMITS them would tell the reader the trace could not contain what it
is visibly showing. That is precisely the dishonesty ADR-0235 clause 6 forbids: coverage must state
what each adapter can observe, and missing metadata must stay visibly unknown rather than be
papered over.

**Coverage is a per-adapter CAPABILITY statement, not an emission claim.** The replay declares the
union of INSTALLED adapters' declarations rather than only those that actually emitted into this
particular session. The renderer already labels each declaration by `adapterId`, and no declaration
asserts that its adapter emitted anything. The stricter alternative — persisting each adapter's
declaration into the trace alongside its events — is a storage-contract change inside increment 2's
package, which this story does not edit; revisit it there.

**Honesty is preserved, not smoothed.** Capacity still renders unknown for a `model_context` that
carries none — this composition adds no default, no inferred gauge, and no 500k danger region. The
partial-read notice from a tolerant read survives to the rendered body: a corrupt or truncated line
is reported as skipped, never swallowed and never thrown on.

**Fences.** No edit to `packages/context-traversal-capture/**`: `showTraversalSession` stays in
place and simply stops being the CLI's caller; collapsing it belongs to whoever holds that story's
claim. No new render surface, no gauges, no colours, no ordering or ranking of events, and no
inference of an edge from adjacency. Reads only — this composition writes nothing.

Files: `packages/context-traversal-spawn/src/replay-adapters.ts` and `replay-adapters.test.ts`.
Append the barrel export line only after the source lands. The one-line CLI swap
(`packages/cli/src/traversal.ts` calling this instead of `showTraversalSession`) is un-asserted
connective glue (ADR-0158) in another story's building and is claimed by no contract here.

## Contracts

1. **`every-rendered-event-kind-is-supported-by-a-declared-adapter`**
   - **asserts —** for a replay containing terminal read events AND build spawn events, every event
     kind present is named `supported` by at least one declared coverage entry — the render can never
     show an event kind that every declared adapter omits.
2. **`both-adapter-declarations-render-supported-and-omitted`**
   - **asserts —** the rendered body names both `terminal-cli-dispatch` and the build spawn boundary
     adapter, each printing its FULL supported AND omitted lists — never just the supported side,
     and never a merged single declaration that hides which adapter observes what.
3. **`capacity-still-renders-honestly-unknown`**
   - **asserts —** a trace whose `model_context` carries no `contextWindowCapacity` renders capacity
     as unknown — no default capacity, no inferred gauge, no danger region — while its token
     observations still render.
4. **`a-corrupt-line-renders-a-partial-notice-without-throwing`**
   - **asserts —** a trace file containing a malformed, truncated, or duplicate-identity line
     replays every good event, reports the skipped count in the rendered body, and returns an
     envelope rather than throwing.

## Integration evidence

`packages/context-traversal-spawn/src/replay-adapters.test.ts` writes mixed fixture traces — terminal
read events beside build spawn events, one `model_context` without capacity, and a deliberately
corrupt raw line — into a temporary directory through increment 2's sink, then renders them through
this composition. Coverage is asserted against the closed `CoverageFeature` domain rather than
against a hand-copied list, so a future vocabulary addition surfaces as a failure instead of a silent
gap in what the replay claims to observe.
