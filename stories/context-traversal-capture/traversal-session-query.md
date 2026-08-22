---
id: "traversal-session-query"
tier: capability
story: context-traversal-capture
arc: linked-session-context-arc
title: "A captured session renders as an honest chronological replay"
outcome: "A captured session renders as a chronological replay that states its own coverage, its unknowns, and every line it skipped."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink]
decisions: [235, 241]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/query-render.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/query-render.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/query-render.test.ts"
    sourceFile: "packages/context-traversal-capture/src/query-render.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/query-render.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/query-render.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# A captured session renders as an honest chronological replay

## Guidance

Author PURE renderers in the story-owned package — no filesystem, no clock, no store: they take the
values `traversal-trace-sink`'s reader already returns and produce envelope-shaped bodies with
ADR-0023 `next:` pointers. `renderTraversalSessions(list)` renders the session index;
`renderTraversalSession(replay, { skipped })` renders one session. The thin CLI dispatch that calls
them belongs to `terminal-capture-activation`, not here.

**The session index** lists session ids with their event counts and last-observed time, newest first,
so an owner can find the session they just ran without knowing its id.

**One line per event, chronological.** Each line shows read strength VISIBLY distinct (front-matter
inspection versus full-payload read — the ADR-0235 clause 3 distinction must survive rendering, not
be flattened to "read"), the canonical `nodeId`, the `surfaceId`, and the chronological `visitId`. A
revisit renders as a NEW forward visit; it links to an earlier visit ONLY when `priorVisitId` is
actually present. Never draw an edge from adjacency, ordering, or timestamp proximity — at the
terminal boundary those fields are always absent, so the render's honest output is a flat forward
sequence.

**Always print the coverage block.** Supported and omitted, from the adapter's own declaration. The
render's value is inseparable from knowing what it could not see.

**Capacity is unknown here, and says so — but says WHICH unknown.** The CLI boundary observes no model
tokens, so when a session carries no `model_context` event the render must state capacity as UNKNOWN.
A session that DOES carry a `model_context` declaring no `contextWindowCapacity` is a different fact
and must render differently: unknown because the observation carried no window size, not because
nothing was observed. Reusing the no-observation wording there would deny an observation the replay
just rendered. Which shapes reach which branch varies by boundary and shifts as adapters learn to read
more, so the render owes both branches on their own terms rather than treating either as a given
boundary's permanent case. `capacity: unknown` leads either way. Never a default capacity, never a
fabricated gauge, and never the owner-selected 500k threshold shown as a limit — it is display-only
and out of scope for this increment (ADR-0235 clause 4/7).

**A session says what its id NAMES.** Since 2026-08-22 (`linked-session-context-arc-inc-30`) the
reader classifies each session's identity from the grades its own lines carry, and both renders
state it: `window` (one host context window), `declared` (an id the caller supplied — as precise as
its declarer), `slot` (the LEGACY era, when the id was the pooled worktree slot), or `mixed`. A
`slot`-keyed trace is the union of every window that ran in one worktree — the parent session, its
subagents, and every later session handed the same slot — so its repeat counts are not one
session's, and it is NOT retrofittable, because no line records which window wrote it. The index
labels every row and prints a sizing note when any legacy row is present; the replay prints the
classification under `session:` and renders the worktree slot beside it as the grouping attribute it
is. Same posture as `capacity:` on both edges: a reader that supplied no classification gets no
identity line rather than a guessed one, and a replay with no events is labelled with nothing.

**A partial replay says it is partial.** Print the reader's `skipped` count whenever it is non-zero.
An honest partial is required; a silent one is forbidden (ADR-0241 D5). A render over a corrupt or
crash-truncated trace still succeeds — the command that wraps it must exit 0 with an honest partial
rather than crash.

Files: `packages/context-traversal-capture/src/query-render.ts` and `query-render.test.ts`. This
capability needs only the reader's RETURN TYPE, so it can start against a signature agreed with
`traversal-trace-sink` up front; it touches none of that capability's files.

## Contracts

1. **`session-list-is-newest-first-with-counts`**
   - **asserts —** the session index renders each session id with its event count and last-observed
     time, ordered newest first, and renders an empty index without error rather than as a missing
     surface.
2. **`replay-renders-chronological-visits-with-read-strength`**
   - **asserts —** each event renders on its own line in chronological order carrying `nodeId`,
     `surfaceId`, and `visitId`, with front-matter and full-payload strengths visibly distinct; a
     revisit renders as a new forward visit and links to an earlier visit only when `priorVisitId` is
     present.
3. **`capacity-renders-unknown-without-a-model-observation`**
   - **asserts —** the render always prints the adapter coverage block (supported and omitted) and
     states context capacity as unknown when the replay carries no `model_context` event — no default
     capacity, no fabricated gauge, and no 500k region rendered as a limit; and that the two ways
     capacity goes unknown render distinctly — a replay carrying a `model_context` that declares no
     `contextWindowCapacity` still leads with `capacity: unknown` but must NOT claim there was no
     observation, since one was made and rendered.
4. **`a-partial-replay-states-its-skipped-count`**
   - **asserts —** a replay accompanied by a non-zero `skipped` count renders that count as an
     explicit partial-read notice, and the render still returns a complete body rather than throwing.

## Integration evidence

`packages/context-traversal-capture/src/query-render.test.ts` feeds hand-built replay values — parsed
through increment 1's schemas so the fixtures cannot drift from the vocabulary — into both renderers:
a two-visit session at both read strengths, a revisit with and without an explicit `priorVisitId`, a
session with no `model_context` event, and a replay carrying a non-zero `skipped` count. The
renderers are pure, so every assertion is over returned strings with no directory, clock, or store in
play.
