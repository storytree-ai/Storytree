---
id: "context-traversal-spawn"
tier: story
title: "A build's spawn boundary replays as linked parent and child context lanes"
outcome: "A build's spawned authoring slices replay as linked parent-and-child metadata-only context lanes whose window capacity is exactly what the runtime declared, or honestly absent when it declared none."
status: proposed
proof_mode: UAT
uat_witness: machine
arc: linked-session-context-arc
depends_on: [context-traversal-telemetry, context-traversal-capture]
consumed_by: [cli]
decisions: [235, 241, 243, 192]
capabilities: [leaf-slice-spawn-observations, build-spawn-capture, multi-adapter-replay]
---

# A build's spawn boundary replays as linked parent and child context lanes

**Outcome —** A build's spawned authoring slices replay as linked parent-and-child metadata-only
context lanes whose window capacity is exactly what the runtime declared, or honestly absent when it
declared none.

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
| 1 | [`leaf-slice-spawn-observations`](leaf-slice-spawn-observations.md) | One authoring slice's run accounting becomes an explicit handoff, one child window observation, and a return — capacity carried only as declared. | — |
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
- `consumed_by: [cli]` — the PROVIDER-side declaration of the ONE remaining cross-story import edge:
  `@storytree/cli` runtime-depends on `@storytree/context-traversal-spawn`. It is code-backed (a real
  `dependencies` entry plus the wiring in `packages/cli/src/commands.ts` and the swapped
  `showTraversalSessionAllAdapters` call in `packages/cli/src/traversal.ts`), not declaration
  wallpaper. Provider-side is the established side for a `cli` edge, not merely the cheaper one: the
  CLI is the wiring HUB, and its own spec declares `depends_on: []` precisely because every spoke
  owns its "wired into the CLI" edge (ADR-0074 §4) — increment 2's `consumed_by: [cli]` was declared
  for exactly this reason. The replay swap is the point of the `multi-adapter-replay` capability: the
  hardcoded `TERMINAL_CLI_DISPATCH_COVERAGE` explicitly OMITS `event:spawn_handoff`,
  `event:model_context`, and `event:result_return`, so once builds emit, `storytree traversal show`
  would render those events under a declaration that denies them. The CLI-side lines themselves are
  un-asserted connective glue (ADR-0158) in another story's building: declared as this edge and
  reviewed in the diff, claimed by no capability here and never this story's evidence.
- **`drive-machinery` is NOT declared, and must not be — the edge would close a cross-story CYCLE.**
  Drive reaches this story's capture through an INVERTED seam it owns (`LeafSlicesObserver` /
  `NodeBuildOpts.onLeafSlices` in `packages/drive/src/node-build.ts`, threaded through
  `story-build.ts`), which the CLI injects at the six build call sites; `@storytree/drive` imports
  nothing from this package and carries no `dependencies` entry for it. **This is a structural
  constraint of the arc, not a stylistic preference, and the next adapter will hit it the moment it
  tries to emit from inside drive.** The loop is:
  `drive-machinery → context-traversal-spawn → context-traversal-capture →
  context-traversal-telemetry → drive-machinery` — it closes because increment 1 declares
  `depends_on: [drive-machinery]` (its UAT proves the adapter against drive's real
  `createOrientationRunner`). Every later adapter in `linked-session-context-arc` — desktop-chat,
  direct SDK, Codex, owned-loop — inherits that ancestry through increments 1 and 2, so **any of
  them that makes drive import it re-closes the same cycle.** The fix is this one: drive declares a
  seam, the composition root injects the implementation, and the declared graph stays acyclic. A
  cycle is a modelling error to resolve, never a thing to tolerate.
- **No `artifact_edges` entry records the drive seam — mechanically it cannot.** `artifact_edges`
  (ADR-0166) annotates a SUBSET of a story's OWN `depends_on` as deliberately code-unbacked, and
  `check:boundaries` rejects a stray entry that is not a declared `depends_on` edge. Recording the
  seam that way would mean first writing `depends_on: [drive-machinery]` here — a false statement
  under the dependency test (this story is a pure package, proven offline, and needs nothing drive
  delivers as a precondition to pass its own UAT), and a re-introduction of the very edge direction
  the inversion removed. The seam is therefore recorded HERE, in prose, where the next adapter's
  author reads it — deliberately visible, rather than encoded as an edge that would be untrue.
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
persist as bytes, carry metadata only, keep the child's window honest by carrying exactly the
capacity the runtime declared and nothing when it declared none, and replay under a coverage
statement that admits what it does not observe — and that the boundary those lanes come from is
actually WIRED: a build CALLS an installed observer, rather than a seam nothing composes.

1. **One authoring slice becomes a linked parent/child lane triple.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Observe one _(criterion-id: uatc_3ee0e7d2b5158438f850c121)_ _(revision-id: uatr1:60666349a1c16bdd)_
   build authoring slice's run accounting through the story-owned observer. **Success —** exactly
   three events in chronological order: a `spawn_handoff` and a `result_return` on the PARENT
   session, and a `model_context` on an explicitly-named CHILD session; the child id is a
   deterministic string derived from declared build identity (never from time, ordering, or
   adjacency) and is never equal to the parent; both edge events carry the same explicit `edgeId`;
   and every emitted event parses clean through increment 1's `ContextTraversalEvent`.
2. **Both lanes survive as bytes in their own per-session traces.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Run the build _(criterion-id: uatc_be05a78a3906baa8b9e9397c)_ _(revision-id: uatr1:a22e2a2f5bdeae93)_
   capture against a temporary trace directory with an explicit parent session id. **Success —** the
   directory holds a parent trace file carrying the handoff and return, and a separate child trace
   file carrying that child's `model_context`; both are asserted by LISTING the directory and reading
   the FILE CONTENTS back through a fresh reader — a write the sink silently refused fails this leg
   — and the parent's and child's token observations are never merged into one window. This holds on
   every supported platform, which requires the composed child session id to be legal as a path
   segment (`leaf-slice-spawn-observations` contract 11): the sink names one file per session and
   swallows a failed write, so an illegal character would make this leg unsatisfiable and invisible
   at once.
3. **Only metadata ever reaches the bytes, and capture changes nothing else.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Thread a _(criterion-id: uatc_395bf5cc8865a1a12651f077)_ _(revision-id: uatr1:04869694730a8955)_
   canary string through every free-text-looking input, then re-run with no resolvable parent
   session id, with `STORYTREE_TRAVERSAL=off`, and against an unwritable directory. **Success —** the
   canary appears nowhere in any written bytes — no prompt, no context body, no tool result, no
   hidden reasoning, no credential, no spawn payload, no returned result content; the two opt-out
   runs create no file at all; the unwritable run returns normally without throwing; and no run alters
   an exit code, an envelope, or a verdict.
4. **The child's window is one honest observation and its capacity is a pass-through, never an estimate.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Observe _(criterion-id: uatc_f5af5e29ddb9342bd9eb1b81)_ _(revision-id: uatr1:694283a84b6f3ad7)_
   slices with and without reported token usage, and with and without a runtime-declared context
   window. **Success —** each child `model_context` states
   `cumulativeInputTokens === addedInputTokens === inputTokens + cacheCreationInputTokens +
   cacheReadInputTokens` as one aggregate observation for that child's independent window;
   `contextWindowCapacity` is PRESENT and strictly equal to the number that travelled in on the
   slice's own run accounting exactly when that accounting declares ONE distinct positive window, and
   is WHOLLY ABSENT in every other case — no model declares one, two or more models declare DIFFERENT
   windows, or the declared value is `0` or negative — so an implementation supplying a default, a
   model-id → capacity map, or a first-model-wins pick fails this leg rather than coinciding with it;
   every emitted `model_context` parses clean through increment 1's `ModelContextEvent`, so an
   out-of-vocabulary capacity is caught by the schema rather than by the leg's own arithmetic; the
   replay still reports capacity unknown for a `model_context` that carries none;
   `payloadTokenCount` is ABSENT on every handoff; and a slice that reported no usage emits the
   handoff and return but NO `model_context`.
5. **The replay declares coverage for every kind it shows.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-1)_ Replay a trace holding _(criterion-id: uatc_09aa131d8afc905a5ad9f554)_ _(revision-id: uatr1:fcb9af45e15cf4c6)_
   both terminal read events and build spawn events through the multi-adapter replay. **Success —**
   every event kind present in the replay is named `supported` by at least one declared adapter;
   both adapter ids print their full supported AND omitted lists; the build adapter's declaration is
   exhaustive over the closed coverage domain — every member named exactly once as either supported
   or omitted — declaring `field:context_window_capacity` SUPPORTED (coverage states what the adapter
   CAN observe, not what any one trace happens to contain) and `field:candidate_follow_causality`
   explicitly OMITTED; and a corrupt line yields a partial-read notice instead of a throw.
6. **A build's spawn boundary actually reaches an installed observer.** _(witness: machine)_ _(proof-gate: context-traversal-spawn#gate-2)_ Drive an _(criterion-id: uatc_83f44c24f013ec7124d3ca64)_ _(revision-id: uatr1:42f87b862cd2a0db)_
   offline `--real` build chain with a canned live author supplied through the `liveAuthorOverride`
   accounting seam (ADR-0243 D1) and a spy observer installed at drive's `onLeafSlices` opt.
   **Success —** the observer is CALLED — once per built node, carrying that node's own unit id and
   run accounting deep-equal to the canned per-slice entries that went in — so a seam nothing
   composes, a passthrough that drops the option, and one that synthesises accounting of its own
   each go RED rather than passing silently; with the option omitted the observer stays silent, so
   the pre-ADR-0243 status quo is the falsifier for a passthrough that fabricates a `LiveAuthor`;
   and the canned accounting buys reachability and NO authority — the same rosy accounting yields a
   PASS against a passing implementation and a HALT/FAIL against a failing one, and it dies in the
   injected in-memory store rather than reaching `events.usage_event` or `events.verdict`
   (ADR-0243 D3/D4). **No operator attestation is taken for this leg and none is offered:** the
   condition has a compiler and now has a harness, so a signature here would be spent on a harness
   gap, which `human-witness-is-a-judgment-gap-not-cost` refuses (ADR-0243 D2). Its limitation is
   named rather than papered (ADR-0243 D5) — a canned `LiveAuthor` is a FIXTURE and fixtures drift:
   this leg proves the CALL happens; that a real SDK run still produces the assumed shape stays
   covered by the compile-time `keyof ModelUsage` pin plus any real build the owner runs.

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

The activation lines — drive's own `LeafSlicesObserver` seam and `onLeafSlices` opt
(`packages/drive/src/node-build.ts`, `story-build.ts`), and the CLI-side wiring that injects this
package's capture and swaps the replay (`packages/cli/src/commands.ts`,
`packages/cli/src/traversal.ts`, `packages/cli/package.json`) — are un-asserted connective glue
(ADR-0158) in another story's building: declared as a consumed-by edge and reviewed in the diff,
never claimed as this story's evidence. **The one-off confirmation that a real
`node build --real` writes these lanes end to end is still NOT a UAT leg of this story** — see
"Explicitly outside this increment" for exactly what remains outside and why.

Leg 6 is the one exception, and it is deliberately narrower than that: it asserts that a build's
spawn boundary CALLS an installed observer with the build's own per-slice run accounting, not that
bytes appear at the end of a live run. Its evidence is another package's suite —
`pnpm --filter @storytree/drive test`, story `drive-machinery`'s capability
`leaf-slices-observer-activation` (`packages/drive/src/leaf-slices-activation.test.ts`) — reached
through Reliability Gate 2 below rather than through an import this story is structurally forbidden
to declare. That leg exists because ADR-0243 (accepted 2026-07-27) decided the `liveAuthorOverride`
accounting seam; before it the same question had no harness and was escalated to the owner unsigned.

## Reliability Gates

Every UAT leg above is `witness: machine`, and each is bound to its gate by an explicit
`_(proof-gate: …)_` annotation — legs 1–5 to `context-traversal-spawn#gate-1`, leg 6 to
`context-traversal-spawn#gate-2` — the binding the resolver looks up VERBATIM, with no first-observe
fallback and no inference from ordering. The gates are what make those legs
machine-provable at all: without one a machine leg has no command to resolve to, refuses operator
attestation (ADR-0082 d.2), and the story's UAT can never green. Increment 2 of this arc lost a whole
cycle to exactly that omission; this section is the fix, authored up front rather than retrofitted.

Neither gate carries a `(covers:)` list, deliberately. All three capabilities are driven red→green by
the spine and earn their own signed `--real` verdicts; a coverage list here would let an adopt pass
green a capability that never went red, which is the inverse theater ADR-0085 / ADR-0097 ban.

1. **The spawn package's own suite is green** _(gate: observe)_
   `pnpm --filter @storytree/context-traversal-spawn test`. The spine runs it at a clean committed
   HEAD and OBSERVES it green — the pure slice observer (ordered handoff/context/return, explicit
   child identity, absent payload counts, capacity carried only as the runtime declared it and
   absent under every ambiguous or non-positive declaration, the exhaustive coverage declaration),
   the build capture composition (parent and child lanes as bytes on disk, the declared capacity and
   its absence proven on those bytes, the no-op and never-throw edges, the canary refusal), and the
   multi-adapter replay (no event kind rendered under a declaration that omits it, capacity still
   honestly unknown for an event that carries none) — all offline, no DB and no API key —
   then signs an `adopted` verdict (`storytree adopt context-traversal-spawn --pg`, which
   observe-and-signs this gate and the five legs bound to it).
2. **A build's spawn boundary actually calls the observer** _(gate: observe)_
   `pnpm --filter @storytree/drive test`. The machine witness for UAT leg 6 — and the one gate here
   whose command runs ANOTHER package's suite. That is structural, not an oversight, and the next
   reader must not "fix" it: **`packages/context-traversal-spawn` may not import
   `@storytree/drive`.** The import would close the cycle
   `drive-machinery → context-traversal-spawn → context-traversal-capture →
   context-traversal-telemetry → drive-machinery`, which `check:boundaries` refuses and which the
   *Declared boundaries* section above sets out at length. So the activation proof lives where the
   composition site lives — `packages/drive`, story `drive-machinery`'s capability
   `leaf-slices-observer-activation` (`packages/drive/src/leaf-slices-activation.test.ts`) — with a
   SPY observer and ZERO traversal import, reachable offline only because ADR-0243 D1's
   `liveAuthorOverride` accounting seam populates the `liveAuthor` that composition site reads.
   This gate is how a cycle-free leg still reaches THIS story's UAT: the leg binds by its
   `_(proof-gate: …)_` annotation, which needs no dependency edge, so the proof arrives without the
   `depends_on: [drive-machinery]` that would re-close the loop. A gate whose command runs another
   package's suite has precedent in `drive-machinery`'s own gates 4–7. The spine observes it green
   at a clean committed HEAD — no DB, no API key, no model, no subscription spend — then signs an
   `adopted` verdict (`storytree adopt context-traversal-spawn --pg`, which observe-and-signs this
   gate and the one leg bound to it). It carries NO `(covers:)` list: it exists for leg 6 alone, and
   a covers-entry would let an adopt pass green a capability that never went red (ADR-0085 /
   ADR-0097). `leaf-slices-observer-activation` is `drive-machinery`'s capability and earns its own
   signed `--real` verdict there — this story observes that suite, it does not adopt that capability.

## Explicitly outside this increment

- **The live activation witness — now narrowed by ADR-0243, no longer an open fork.** ADR-0243 is
  **accepted** (2026-07-27), and its correction 2 falsified the reachability claim this bullet used
  to rest on. `resolveProveSpec`'s `else`-branch was the only obstacle: the agent's constructor is
  the SOLE PRODUCER of a `LiveAuthor`, not a requirement of the observer, which reads plain data
  (turns, tokens, model) and never asks who produced it. So the activation IS machine-proven, at the
  DRIVE seam, by story `drive-machinery`'s capability `leaf-slices-observer-activation`
  (`packages/drive/src/leaf-slices-activation.test.ts`) through the `liveAuthorOverride` accounting
  seam ADR-0243 D1 decided — that is UAT leg 6 above, bound to gate 2. Three named things stay
  outside this story, and nothing beyond them:
  - **(a) The CLI's ONE injection line.** `onLeafSlices: captureBuildLeafSlices` in
    `nodeStoryBuildOpts` (`packages/cli/src/commands.ts:1454`) — un-asserted connective glue
    (ADR-0158) in the CLI's own building, reviewed in the diff and claimed by no capability.
  - **(b) The end-to-end BYTES assertion,** deferred with its reason stated rather than hidden:
    bytes-from-run-accounting is ALREADY proven red→green on signed `--real` verdicts by this
    story's own `build-spawn-capture` (UAT legs 2 and 3 LIST the trace directory and read the file
    contents back), and the only package that may legally compose drive with the spawn adapter is
    `packages/cli`, where the composing code already exists — a capability over it would need a
    vacuous source or a manufactured red, and both are worse than a named gap.
  - **(c) Two sibling composition sites.** `packages/drive/src/node-build.ts:1204` (inside
    `runNodeBuild`, offline-unreachable without materially enlarging `NodeBuildOpts`) and
    `packages/drive/src/story-build.ts:737` (the live-smoke arm, which needs a real leaf). Both are
    fed by the SAME single object literal as (a) — that single-sourcing is what bounds the residual
    to one reviewed line rather than a class of failure.

  ADR-0243 D5's limitation is kept visible rather than papered: a canned `LiveAuthor` is a FIXTURE
  and fixtures drift. Leg 6 proves the CALL happens; that a real SDK run still produces the assumed
  shape stays covered by the compile-time `keyof ModelUsage` pin plus any real build the owner runs.
  No operator attestation is offered for any of this (ADR-0243 D2): with the harness closed, a
  signature would be spent on nothing a person must judge
  (`human-witness-is-a-judgment-gap-not-cost`). ADR-0243 is now listed in `decisions:` above for
  this reason and no other: it governs the ACTIVATION, but the activation is now one of THIS story's
  acceptance criteria — leg 6 exists, is `machine`, and takes no operator signature because
  ADR-0243 decided each of those three things. Nothing else in this story turns on it.
- Any context-window capacity lookup table, default capacity, model-id → capacity map, or estimate,
  in any layer. The ban is unchanged; only its justification is corrected. This boundary DOES declare
  a window size — the leaf's per-slice run accounting carries a runtime-declared context window — so
  capacity here is a faithful PASS-THROUGH of exactly that number and nothing else, and stays absent
  whenever the runtime declared none, declared two different ones, or declared a non-positive one
  (ADR-0235 clause 4, runtime-declared-or-absent; clause 6, missing metadata stays visibly unknown
  rather than inferred). Leg 4 asserts BOTH outcomes, precisely so an inferred value — a table, a
  default, or a first-model-wins pick over an ambiguous slice — goes RED rather than quietly
  appearing.
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
