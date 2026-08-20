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

**This story declares ZERO UAT criteria (ADR-0294 D1 permits it), and that is the honest shape.**
The journey it would narrate — a real `node build --real` writing both lanes as bytes end to end —
is deliberately OUTSIDE this increment and says so below ("Explicitly outside this increment",
bullet (b)). Everything that was authored here instead restated a capability contract, so the story
rung was signing proof the capability rung already earns. The story greens by the ADR-0085 own-proof
union of its three capabilities plus the two reliability gates below, not by a second signature over
the same tests.

**Goal (retained as the story's stated outcome, no longer as criteria) —** one build's spawned
authoring slices become linked parent/child lanes that persist as bytes, carry metadata only, keep
the child's window honest by carrying exactly the capacity the runtime declared and nothing when it
declared none, replay under a coverage statement that admits what it does not observe — and the
boundary those lanes come from is actually WIRED: a build CALLS an installed observer, rather than a
seam nothing composes.

> **ADR-0294 D2 pass — 2026-08-21.** All six machine legs were deleted, none re-pointed, each
> checked against the named test's ACTUAL assertions rather than against file existence. Their
> ordinals (`context-traversal-spawn#uat-1` … `#uat-6`) are BURNED and recorded `superseded` in
> [`stories/uat-legacy-dispositions.json`](../uat-legacy-dispositions.json); no surviving leg may
> ever take them. Every leg carried `proven=–` (no signed verdict) at deletion, so no proof credit
> was destroyed. What each leg claimed, and which node already proves it:
>
> - **Leg 1** (one slice becomes a linked parent/child lane triple) — capability
>   [`leaf-slice-spawn-observations`](leaf-slice-spawn-observations.md), contracts 1
>   `one-slice-emits-handoff-context-return-in-order`, 3 `payload-token-count-is-always-absent`,
>   2 `child-session-id-is-explicit-and-deterministic` and 9
>   `zero-slices-emit-nothing-and-every-event-parses`, in
>   `packages/context-traversal-spawn/src/observe-leaf-slices.test.ts`. The first test asserts the
>   exact `["spawn_handoff","model_context","result_return"]` kind order, both edge events on the
>   PARENT session, the `model_context` on the composed CHILD session, `spawn.edgeId ===
>   result.edgeId`, and a strict `ContextTraversalEvent.parse` of every emitted event — the leg's
>   whole clause set, assertion for assertion.
> - **Leg 2** (both lanes survive as bytes in their own per-session traces) — capability
>   [`build-spawn-capture`](build-spawn-capture.md), contract 1
>   `parent-and-child-lanes-land-in-their-own-files` in
>   `packages/context-traversal-spawn/src/build-capture.test.ts`, which writes to a temporary
>   directory and reads the files back; plus `leaf-slice-spawn-observations` contract 11
>   `child-session-id-is-a-legal-filename-segment`, the regression that keeps the sink's write from
>   being silently refused on a colon-bearing id.
> - **Leg 3** (only metadata reaches the bytes, and capture changes nothing else) —
>   `build-spawn-capture` contracts 5 `no-canary-text-ever-reaches-the-bytes`, 2
>   `an-absent-parent-session-is-a-total-no-op`, 3 `traversal-off-is-a-total-no-op`, 4
>   `capture-never-throws-and-never-changes-an-exit-code` and 8
>   `written-bytes-carry-no-field-outside-the-closed-vocabulary` — the canary sweep, both opt-out
>   runs, the unwritable target and the closed-vocabulary parse, all in `build-capture.test.ts`.
> - **Leg 4** (the child's window is one honest observation; capacity is a pass-through) —
>   `leaf-slice-spawn-observations` contracts 6 `context-window-capacity-is-never-inferred`, 12
>   `a-single-declared-window-is-carried-verbatim-onto-the-child-context`, 13
>   `an-undeclared-ambiguous-or-non-positive-window-yields-absent-capacity`, 5
>   `child-window-is-one-aggregate-observation` and 7 `a-slice-without-usage-emits-no-model-context`
>   (one test in `observe-leaf-slices.test.ts` carries the first four contract names in its own
>   title); the on-disk halves are `build-spawn-capture` contracts 6 and 7; and the "replay still
>   reports capacity unknown" clause is [`multi-adapter-replay`](multi-adapter-replay.md) contract 3
>   `capacity-still-renders-honestly-unknown`.
> - **Leg 5** (the replay declares coverage for every kind it shows) — `multi-adapter-replay`
>   contracts 1 `every-rendered-event-kind-is-supported-by-a-declared-adapter`, 2
>   `both-adapter-declarations-render-supported-and-omitted`, 3 and 4
>   `a-corrupt-line-renders-a-partial-notice-without-throwing`, in
>   `packages/context-traversal-spawn/src/replay-adapters.test.ts`; the exhaustive-over-the-closed-
>   domain half is `leaf-slice-spawn-observations` contract 10
>   `coverage-is-exhaustive-over-the-closed-feature-enum`.
> - **Leg 6** (a build's spawn boundary actually reaches an installed observer) — story
>   `drive-machinery`'s capability
>   [`leaf-slices-observer-activation`](../drive-machinery/leaf-slices-observer-activation.md), in
>   `packages/drive/src/leaf-slices-activation.test.ts`. Its five tests carry the leg's clauses one
>   for one: `the-leaf-slices-observer-fires-with-the-canned-run-accounting` and
>   `each-chained-node-reports-its-own-slices` (called once per built node with that node's own
>   accounting), `no-live-author-override-leaves-the-observer-silent` (the omitted-option
>   falsifier), `a-canned-live-author-cannot-move-a-verdict` (reachability buys no authority) and
>   `the-canned-accounting-dies-in-the-injected-store` (it never reaches `events.usage_event` or
>   `events.verdict`). This one lived in ANOTHER story's capability rather than this story's own,
>   which is still one rung DOWN — a capability signing a story rung is what D2 deletes, wherever
>   that capability is homed.
>
> Reliability gates 1 and 2 below are LEFT IN PLACE and are now UNCLAIMED by any criterion. Gate
> ordinals are positional (`reliabilityGateId` mints `<story>#gate-<n>` from position), so deleting
> one would silently re-point signed verdicts and other stories' surviving `(proof-gate:)` bindings;
> they stay exactly where they are.


## Evidence

The story's proof is the union of its three capabilities' own signed `--real` verdicts, observed as a
whole suite by reliability gate 1 below: `pnpm --filter @storytree/context-traversal-spawn test`, over
the three capability file pairs `observe-leaf-slices.test.ts`, `build-capture.test.ts` and
`replay-adapters.test.ts`. *(This paragraph previously read "every leg above is asserted inside the
story's own package suite … (legs 1 and 4) … (legs 2 and 3) … (leg 5)". That was the duplication
itself, stated out loud: the leg mapping named the very capability tests the legs restated. The legs
were deleted under ADR-0294 D2 on 2026-08-21 and the mapping now names only the suite, not a
per-leg split.)* All three capabilities earn their own signed `--real` verdicts through the
prove-it-gate first; the reliability gate below is a second, whole-suite observation of those
spine-driven proofs at a clean committed HEAD, never an adoption standing in for a red that never
happened.

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

The ACTIVATION question — does a build's spawn boundary actually call an installed observer with the
build's own per-slice run accounting? — is answered one rung down, in story `drive-machinery`'s
capability `leaf-slices-observer-activation`
(`packages/drive/src/leaf-slices-activation.test.ts`), observed here by reliability gate 2. That
capability exists because ADR-0243 (accepted 2026-07-27) decided the `liveAuthorOverride` accounting
seam; before it the same question had no harness and was escalated to the owner unsigned.
*(This paragraph previously opened "Leg 6 is the one exception …" and read the same capability as
this story's own UAT evidence. Under ADR-0294 D2 that was a story rung signed by a capability rung,
so the leg was deleted on 2026-08-21 and the capability is now cited as what proves the activation,
not as what proves a leg here.)*

## Reliability Gates

**Both gates are now UNCLAIMED by any criterion, and both STAY — a gate is never deleted.** This
section previously read "Every UAT leg above is `witness: machine`, and each is bound to its gate by
an explicit `_(proof-gate: …)_` annotation — legs 1–5 to `context-traversal-spawn#gate-1`, leg 6 to
`context-traversal-spawn#gate-2`", which was true until the ADR-0294 D2 pass of 2026-08-21 deleted
all six legs as duplicates of the capability proofs the same commands run. `reliabilityGateId` mints
`<story>#gate-<n>` from POSITION, so removing a gate silently renumbers every later one and
re-points already-signed verdicts and other criteria's surviving `(proof-gate:)` bindings; both gates
therefore stay exactly where they are, and what changed is only that no criterion names them. They
remain the author's expandable reliability floor and the commands the adopt pass observes.

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
   observe-and-signs this gate; the five legs that used to bind to it were deleted on 2026-08-21,
   ADR-0294 D2).
2. **A build's spawn boundary actually calls the observer** _(gate: observe)_
   `pnpm --filter @storytree/drive test`. The activation observation — and the one gate here
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
   This gate is how a cycle-free observation still reaches THIS story: a `(proof-gate:)` binding
   needs no dependency edge, so the proof arrived without the `depends_on: [drive-machinery]` that
   would re-close the loop. *(It read "how a cycle-free LEG still reaches THIS story's UAT" until
   2026-08-21, when its leg 6 was deleted under ADR-0294 D2 — the mechanism it describes is
   unchanged, but no criterion binds here any more.)* A gate whose command runs another
   package's suite has precedent in `drive-machinery`'s own gates 4–7. The spine observes it green
   at a clean committed HEAD — no DB, no API key, no model, no subscription spend — then signs an
   `adopted` verdict (`storytree adopt context-traversal-spawn --pg`, which observe-and-signs this
   gate). It carries NO `(covers:)` list, and MUST NOT gain one now that it is unclaimed:
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
  seam ADR-0243 D1 decided, and observed here by reliability gate 2. *(This clause read "that is UAT
  leg 6 above, bound to gate 2" until 2026-08-21; leg 6 was deleted under ADR-0294 D2 because that
  capability already proves it, and the gate now stands unclaimed.)* Three named things stay
  outside this story, and nothing beyond them:
  - **(a) The CLI's ONE injection line.** `onLeafSlices: captureBuildLeafSlices` in
    `nodeStoryBuildOpts` (`packages/cli/src/commands.ts:1454`) — un-asserted connective glue
    (ADR-0158) in the CLI's own building, reviewed in the diff and claimed by no capability.
  - **(b) The end-to-end BYTES assertion,** deferred with its reason stated rather than hidden:
    bytes-from-run-accounting is ALREADY proven red→green on signed `--real` verdicts by this
    story's own `build-spawn-capture` (its contract 1
    `parent-and-child-lanes-land-in-their-own-files` and contracts 2–5/8 LIST the trace directory
    and read the file contents back — cited as UAT legs 2 and 3 here until those legs were deleted
    on 2026-08-21 under ADR-0294 D2), and the only package that may legally compose drive with the
    spawn adapter is
    `packages/cli`, where the composing code already exists — a capability over it would need a
    vacuous source or a manufactured red, and both are worse than a named gap.
  - **(c) Two sibling composition sites.** `packages/drive/src/node-build.ts:1204` (inside
    `runNodeBuild`, offline-unreachable without materially enlarging `NodeBuildOpts`) and
    `packages/drive/src/story-build.ts:737` (the live-smoke arm, which needs a real leaf). Both are
    fed by the SAME single object literal as (a) — that single-sourcing is what bounds the residual
    to one reviewed line rather than a class of failure.

  ADR-0243 D5's limitation is kept visible rather than papered: a canned `LiveAuthor` is a FIXTURE
  and fixtures drift. `leaf-slices-observer-activation` proves the CALL happens; that a real SDK run
  still produces the assumed shape stays covered by the compile-time `keyof ModelUsage` pin plus any
  real build the owner runs.
  No operator attestation is offered for any of this (ADR-0243 D2): with the harness closed, a
  signature would be spent on nothing a person must judge
  (`human-witness-is-a-judgment-gap-not-cost`). ADR-0243 is still listed in `decisions:` above
  because it governs the ACTIVATION and the refusal of an attestation over it. *(This paragraph read
  "the activation is now one of THIS story's acceptance criteria — leg 6 exists, is `machine`, and
  takes no operator signature" until 2026-08-21. Leg 6 was deleted under ADR-0294 D2: the activation
  is proven at `drive-machinery`'s capability, one rung down, so it is no longer an acceptance
  criterion HERE. Neither the machine witness nor the refused attestation changed — only where the
  claim is homed.)* Nothing else in this story turns on it.
- Any context-window capacity lookup table, default capacity, model-id → capacity map, or estimate,
  in any layer. The ban is unchanged; only its justification is corrected. This boundary DOES declare
  a window size — the leaf's per-slice run accounting carries a runtime-declared context window — so
  capacity here is a faithful PASS-THROUGH of exactly that number and nothing else, and stays absent
  whenever the runtime declared none, declared two different ones, or declared a non-positive one
  (ADR-0235 clause 4, runtime-declared-or-absent; clause 6, missing metadata stays visibly unknown
  rather than inferred). `leaf-slice-spawn-observations` contracts 6, 12 and 13 assert BOTH
  outcomes, precisely so an inferred value — a table, a
  default, or a first-model-wins pick over an ambiguous slice — goes RED rather than quietly
  appearing. *(This sentence said "Leg 4 asserts BOTH outcomes" until 2026-08-21; leg 4 was deleted
  under ADR-0294 D2 as a restatement of exactly those three contracts, so the ban now points at the
  contracts that actually hold it.)*
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
