---
id: "context-traversal-spawn"
tier: story
title: "A build's spawn boundary replays as linked parent and child context lanes"
outcome: "A build's spawned authoring slices replay as linked parent-and-child metadata-only context lanes whose window capacity stays honestly absent."
status: proposed
proof_mode: UAT
uat_witness: machine
arc: linked-session-context-arc
depends_on: [context-traversal-telemetry, context-traversal-capture]
consumed_by: [drive-machinery]
decisions: [235, 241, 192]
capabilities: [leaf-slice-spawn-observations, build-spawn-capture, multi-adapter-replay]
---

# A build's spawn boundary replays as linked parent and child context lanes

**Outcome —** A build's spawned authoring slices replay as linked parent-and-child metadata-only
context lanes whose window capacity stays honestly absent.

Increment 1 (`context-traversal-telemetry`) proved the `spawn_handoff` / `result_return` /
`model_context` vocabulary and gave it no producer. Increment 2 (`context-traversal-capture`) made
traces durable and replayable, but the terminal CLI sees no child session and no model tokens, so
every captured trace so far is a single flat lane with capacity unknown and no handoff in it. This
story is the increment that lights the SPAWN boundary: the build path already collects per-slice run
accounting for every authoring slice it spawns, and that accounting is enough — and exactly enough —
to state, deterministically, that a parent session handed work to a named child, what that child's
own input window accumulated, and that the child returned.

The whole observation is a pure function of accounting the runtime already reported. Nothing is
inferred, nothing is estimated, and nothing new is asked of the model: the leaf performs no telemetry
bookkeeping (ADR-0235 clause 1), and the only production change outside this story's package is a
handful of un-asserted glue lines at the composition site (ADR-0158).

## Why this is one story

The consumer is a session owner asking one question: *where did this build's context go, across the
sessions it spawned?* The shared precondition is one build run whose authoring slices reported run
accounting; the shared observable is that run's parent and child lanes, replayed together with an
honest coverage statement. Every capability here exists to make that one journey possible — an
observer to derive the lanes, a capture composition to persist them under the right session
identities, and a replay that can honestly render a trace containing more than one adapter's event
kinds.

This is a DIFFERENT journey from increment 2's. That story's consumer asks what one terminal process
read; its precondition is a real `pnpm storytree …` invocation and its observable is a single-session
read trace. Folding the two together would force an outcome sentence needing a conjunction ("the CLI
records its reads *and* a build records its spawned children's windows"), which is the splitting
rule's own trigger. So this increment is a new story in its own building
`packages/context-traversal-spawn` (ADR-0192 D2 — a new story's code lives in its own workspace
package), consuming increments 1 and 2 across declared edges. Neither earlier story is reopened and
neither's adjudicated UAT criteria are rewritten.

The one alternative considered — hanging a spawn observer off increment 2's package, which already
owns the sink — is legal under the landlord rule but was rejected: it mixes two consumer journeys
under one outcome, reopens a registered story that is already green, and would edit a package
currently held under another session's work claim.

## Capabilities

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`leaf-slice-spawn-observations`](leaf-slice-spawn-observations.md) | One authoring slice's run accounting becomes an explicit handoff, one child window observation, and a return — capacity absent. | — |
| 2 | [`build-spawn-capture`](build-spawn-capture.md) | A build's parent-lane and child-lane events land as bytes in their own per-session traces, additively and fail-silently. | `leaf-slice-spawn-observations` |
| 3 | [`multi-adapter-replay`](multi-adapter-replay.md) | A replay of a mixed trace declares every installed adapter's coverage, so no event kind renders under a declaration that omits it. | `leaf-slice-spawn-observations` |

The graph is acyclic: the observer consumes only increment 1's vocabulary; the capture composition
consumes the observer plus increment 2's sink; the replay consumes the observer's coverage
declaration plus increment 2's reader and renderer. Capabilities 2 and 3 are independent of each
other.

## Declared boundaries

- `depends_on: [context-traversal-telemetry, context-traversal-capture]` — both are real runtime
  import edges: every emitted event parses through increment 1's `ContextTraversalEvent` vocabulary
  and its coverage domain, and both capture and replay go through increment 2's
  `appendTraversalEvents` / `readTraversalSession` / `renderTraversalSession` barrel. Increment 2's
  package is CONSUMED through its public barrel and is never edited by this story.
- `consumed_by: [drive-machinery]` — the PROVIDER-side declaration of the new
  `@storytree/drive` → `@storytree/context-traversal-spawn` runtime import at the build composition
  site. `check:boundaries` needs that cross-story edge declared in one direction; provider-side is
  the cheaper side and leaves the `drive-machinery` spec untouched. The edge is code-backed (a real
  `dependencies` entry), not declaration wallpaper.
- This story does NOT depend on `@storytree/drive`. Session identity is resolved by the CALLER and
  passed in (the increment-2 rule, ADR-0241 D9); importing `deriveIdentity()` here would make
  `drive → spawn → drive` a cycle.
- `repo-manifest.json` → `packageOwnership.organisms` carries
  `"@storytree/context-traversal-spawn": "context-traversal-spawn"`. This story is NOT in the
  `hostedStories` register and must never be added to it: every proof-bound source it claims lives
  inside its own package. The drive/CLI-side lines it needs are un-asserted connective glue
  (ADR-0158) in another story's building, claimed by nothing.

## UAT Test Criteria

**Goal —** Prove that one build's spawned authoring slices become linked parent/child lanes that
persist as bytes, carry metadata only, keep the child's window honest with capacity absent, and
replay under a coverage statement that admits what it does not observe.

1. **One authoring slice becomes a linked parent/child lane triple.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Observe one
   build authoring slice's run accounting through the story-owned observer. **Success —** exactly
   three events in chronological order: a `spawn_handoff` and a `result_return` on the PARENT
   session, and a `model_context` on an explicitly-named CHILD session; the child id is a
   deterministic string derived from declared build identity (never from time, ordering, or
   adjacency) and is never equal to the parent; both edge events carry the same explicit `edgeId`;
   and every emitted event parses clean through increment 1's `ContextTraversalEvent`.
2. **Both lanes survive as bytes in their own per-session traces.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Run the build
   capture against a temporary trace directory with an explicit parent session id. **Success —** the
   directory holds a parent trace file carrying the handoff and return, and a separate child trace
   file carrying that child's `model_context`; both are asserted on the FILE CONTENTS and read back
   through a fresh reader, and the parent's and child's token observations are never merged into one
   window.
3. **Only metadata ever reaches the bytes, and capture changes nothing else.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Thread a
   canary string through every free-text-looking input, then re-run with no resolvable parent
   session id, with `STORYTREE_TRAVERSAL=off`, and against an unwritable directory. **Success —** the
   canary appears nowhere in any written bytes — no prompt, no context body, no tool result, no
   hidden reasoning, no credential, no spawn payload, no returned result content; the two opt-out
   runs create no file at all; the unwritable run returns normally without throwing; and no run alters
   an exit code, an envelope, or a verdict.
4. **The child's window is one honest observation and capacity stays absent.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Observe
   slices with and without reported token usage. **Success —** each child `model_context` states
   `cumulativeInputTokens === addedInputTokens === inputTokens + cacheCreationInputTokens +
   cacheReadInputTokens` as one aggregate observation for that child's independent window;
   `contextWindowCapacity` is ABSENT on every emitted event and the replay reports capacity unknown;
   `payloadTokenCount` is ABSENT on every handoff; and a slice that reported no usage emits the
   handoff and return but NO `model_context`.
5. **The replay declares coverage for every kind it shows.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Replay a trace holding
   both terminal read events and build spawn events through the multi-adapter replay. **Success —**
   every event kind present in the replay is named `supported` by at least one declared adapter;
   both adapter ids print their full supported AND omitted lists; the build adapter's declaration is
   exhaustive over the closed coverage domain, with `field:context_window_capacity` and
   `field:candidate_follow_causality` explicitly OMITTED; and a corrupt line yields a partial-read
   notice instead of a throw.

## Evidence

Every leg above is asserted inside the story's own package suite,
`pnpm --filter @storytree/context-traversal-spawn test`, over the three capability file pairs:
`observe-leaf-slices.test.ts` (legs 1 and 4), `build-capture.test.ts` (legs 2 and 3), and
`replay-adapters.test.ts` (leg 5). All three capabilities earn their own signed `--real` verdicts
through the prove-it-gate first; the reliability gate below is a second, whole-suite observation of
those spine-driven proofs at a clean committed HEAD, never an adoption standing in for a red that
never happened.

The observer's input is a LOCALLY-declared structural slice-run shape, not an import from
`@storytree/agent`, mirroring how `sliceUsageDocs()` in `packages/drive/src/usage.ts` already reads
that accounting structurally. That keeps this package off the agent organism and lets the same
proofs run offline, with no DB, no API key, and no subscription spend.

The build-side activation lines (`packages/drive/src/node-build.ts`, `story-build.ts`,
`packages/drive/package.json`, `packages/cli/src/traversal.ts`) are un-asserted connective glue
(ADR-0158) in another story's building: declared as a consumed-by edge and reviewed in the diff,
never claimed as this story's evidence. **The one-off confirmation that a real
`node build --real` emits these lanes end to end is NOT a UAT leg of this story** — see "Explicitly
outside this increment": it is escalated to the owner, unsigned, alongside the open design fork about
how a boundary that only emits under live subscription spend can earn a machine leg at all
(ADR-0243, `proposed`).

## Reliability Gates

Every UAT leg above is `witness: machine`, and each is bound to `context-traversal-spawn#gate-1` by
an explicit `_(proof-gate: …)_` annotation — the binding the resolver looks up VERBATIM, with no
first-observe fallback and no inference from ordering. The gate is what makes those legs
machine-provable at all: without it a machine leg has no command to resolve to, refuses operator
attestation (ADR-0082 d.2), and the story's UAT can never green. Increment 2 of this arc lost a whole
cycle to exactly that omission; this section is the fix, authored up front rather than retrofitted.

The gate carries NO `(covers:)` list, deliberately. All three capabilities are driven red→green by
the spine and earn their own signed `--real` verdicts; a coverage list here would let an adopt pass
green a capability that never went red, which is the inverse theater ADR-0085 / ADR-0097 ban.

1. **The spawn package's own suite is green** _(gate: observe)_
   `pnpm --filter @storytree/context-traversal-spawn test`. The spine runs it at a clean committed
   HEAD and OBSERVES it green — the pure slice observer (ordered handoff/context/return, explicit
   child identity, absent payload and capacity counts, the exhaustive coverage declaration), the
   build capture composition (parent and child lanes as bytes on disk, the no-op and never-throw
   edges, the canary refusal), and the multi-adapter replay (no event kind rendered under a
   declaration that omits it, capacity still honestly unknown) — all offline, no DB and no API key —
   then signs an `adopted` verdict (`storytree adopt context-traversal-spawn --pg`, which
   observe-and-signs this gate and the five legs bound to it).

## Explicitly outside this increment

- **The live activation witness.** Confirming that a real `node build --real` / `story build --real`
  writes these lanes is an owner-facing escalation, not a leg of this story: `resolveProveSpec` does
  not set `liveAuthor` for an author override, so no offline drive test can exercise the glue end to
  end, and the boundary emits only under live subscription spend. It is neither machine-provable in
  CI today nor a judgment gap, so it is NOT labelled a human leg to stand in for a missing harness
  (`human-witness-is-a-judgment-gap-not-cost`). The open design fork — how an adapter whose emission
  requires live spend earns its activation leg (injected seam, operator attestation, or recorded
  fixture) — is reserved as ADR-0243, deliberately `proposed` and awaiting the owner. It is not
  settled here, and `decisions:` above lists only the ADRs that DECIDE this story.
- Any context-window capacity lookup table, default capacity, or model-id → capacity map. Nothing at
  this boundary declares a window size, so capacity stays absent (ADR-0235 clause 4) and leg 4
  asserts it, precisely so a later estimate goes RED rather than quietly appearing.
- The desktop-chat capture adapter, and direct SDK, Codex, owned-loop, `agents`, and noticeboard
  adapters. This story adds ONE adapter — the build spawn boundary — and declares every other
  surface omitted.
- Forest playback, gauges, drill-down UI, icons, colours, and the 500k danger-region rendering.
- Any shared-database or hosted-studio read path for traces. Storage stays local per-machine
  (ADR-0241 D8), behind increment 2's seam.
- Retention, rotation, eviction, compaction, pruning, ranking, prefetch, guidance, size caps, and
  traversal limits. Traces stay deliberately unbounded (ADR-0241 D7); a "helpful" trim would destroy
  the long-session evidence this arc exists to gather.
- Any causal edge inferred from timestamps, adjacency, or invocation order. Parent/child linkage is
  explicit-id only.
- Editing `packages/context-traversal-capture/**` (consumed through its barrel only) or collapsing
  its single-adapter `showTraversalSession`, which stays in place and simply stops being the CLI's
  caller.
