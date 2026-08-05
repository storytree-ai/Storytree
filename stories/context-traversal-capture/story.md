---
id: "context-traversal-capture"
tier: story
title: "The real terminal CLI captures its own context reads to a replayable durable trace"
outcome: "A real terminal CLI invocation records its own metadata-only context reads to a durable per-session trace a later command replays."
status: proposed
proof_mode: UAT
uat_witness: machine
arc: linked-session-context-arc
depends_on: [context-traversal-telemetry]
consumed_by: [cli]
decisions: [235, 241, 260]
capabilities:
  [
    traversal-trace-sink,
    terminal-boundary-observations,
    traversal-session-query,
    terminal-capture-activation,
    revisit-link-metadata,
    agent-ref-descent,
    artifact-offer-candidate-sets,
    offer-follow-edges,
    decision-point-playback,
    offer-observability-share,
    offer-set-render-agreement,
  ]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/terminal-capture.uat.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/terminal-capture.ts", "packages/context-traversal-capture/src/sink.ts", "packages/context-traversal-capture/src/observe-cli.ts", "packages/context-traversal-capture/src/query-render.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/terminal-capture.uat.test.ts"
    sourceFile: "packages/context-traversal-capture/src/terminal-capture.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/terminal-capture.uat.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/terminal-capture.ts", "packages/context-traversal-capture/src/sink.ts", "packages/context-traversal-capture/src/observe-cli.ts", "packages/context-traversal-capture/src/query-render.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# The real terminal CLI captures its own context reads to a replayable durable trace

**Outcome —** A real terminal CLI invocation records its own metadata-only context reads to a
durable per-session trace a later command replays.

Story `context-traversal-telemetry` (increment 1) shipped a trustworthy observational seam that
nothing in production composes: no emitter, no persistence, no query, and therefore zero real
traces. This story is the activation increment. It instruments the terminal CLI's ONE production
dispatch boundary — the single `run(argv, …)` call in `packages/cli/src/main.ts` — persists each
session's observations to a local append-only JSONL trace outside process memory (ADR-0241), and
adds one read command that replays a captured session. When it is green, real traces exist for the
first time and can be interrogated.

The terminal boundary is process-per-invocation, which is precisely why it is the right first
adapter: an in-memory trace cannot survive one `pnpm storytree …` call, so durability is FORCED to
exist rather than being deferred behind something that merely looks like progress.

## Why this is one story

The consumer is a session owner asking one question: *where did this session's context go?* The
shared precondition is one or more real terminal CLI invocations in a resolvable session; the shared
observable is that session's durable trace, replayed. Everything in this story exists to make that
one journey possible — a sink to write it, an observation table to fill it, a renderer to read it,
and the production activation that makes it happen for real.

This is a DIFFERENT journey from increment 1's. That story's consumer is an orientation-boundary
integrator asking what a decorated runner observably served, its precondition is an in-process call
through the decorator, and its observable is an in-memory replay. Folding the two together would
force an outcome sentence needing a conjunction ("a runner records … *and* the CLI persists and
replays …"), which is the splitting rule's own trigger. So this increment is a new story, in its own
building `packages/context-traversal-capture` (ADR-0192 D2 — a new story's code lives in its own
workspace package), consuming increment 1's vocabulary and trace across the declared edge. Increment
1's story is not reopened and its adjudicated UAT criteria are not rewritten.

The one alternative considered — extending increment 1's story and hanging a node-only `./store`
subpath off its existing package (the `@storytree/library/store` precedent) — is legal under the
landlord rule but was rejected: it mixes two consumer journeys under one outcome, reopens registered
UAT criteria, and pushes `node:fs`/`node:os` toward a barrel that is deliberately browser-safe
zod-only because the studio bundles it.

## Capabilities

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`traversal-trace-sink`](traversal-trace-sink.md) | An event appended in one process replays in another through a tolerant, honestly-partial reader. | — |
| 2 | [`terminal-boundary-observations`](terminal-boundary-observations.md) | A terminal invocation's argv becomes metadata-only read observations only when it matches an allowlisted read shape. | — |
| 3 | [`traversal-session-query`](traversal-session-query.md) | A captured session renders as a chronological replay that states its own coverage, unknowns, and skipped lines. | `traversal-trace-sink` |
| 4 | [`terminal-capture-activation`](terminal-capture-activation.md) | The real terminal CLI process captures its own reads additively and replays them on demand. | `traversal-trace-sink`, `terminal-boundary-observations`, `traversal-session-query` |
| 5 | [`revisit-link-metadata`](revisit-link-metadata.md) | A visit to a node this session already read carries the earlier visit's id, and carries none when it does not. | `traversal-trace-sink`, `terminal-boundary-observations` |
| 6 | [`agent-ref-descent`](agent-ref-descent.md) | Each floor ref the agents render resolves becomes a child visit naming the agent's visit as its parent, and no other CLI shape descends anything. | `traversal-trace-sink`, `terminal-boundary-observations` |
| 7 | [`artifact-offer-candidate-sets`](artifact-offer-candidate-sets.md) | A library artifact read records every onward artifact its Sources block offered as a candidate set at render time, whether or not anything follows it. | `traversal-trace-sink`, `terminal-boundary-observations` |
| 8 | [`offer-follow-edges`](offer-follow-edges.md) | A read invoked with an offer id on the command line stamps that edge on its own visit and records it; a read invoked without one records no edge at all. | `traversal-trace-sink`, `terminal-boundary-observations`, `artifact-offer-candidate-sets` |
| 9 | [`decision-point-playback`](decision-point-playback.md) | A replay renders each recorded offer's every candidate with what the trace deterministically says happened to it, and surfaces every follow it could not resolve rather than dropping it. | `traversal-trace-sink`, `artifact-offer-candidate-sets`, `offer-follow-edges` |

The graph is acyclic: the sink and the observation table consume only increment 1's vocabulary; the
query consumes the sink's reader; the activation composes all three.

Capabilities 7, 8 and 9 are this story's contributions to a DIFFERENT arc (`context-decision-tree-arc`,
ADR-0260) rather than to `linked-session-context-arc`, whose worklist is complete. They land here
because the boundary they observe is this story's boundary — the terminal CLI's `library artifact`
read — and an arc is an initiative overlay, not a hierarchy edge (ADR-0183). Capability 7 records
what a read OFFERED; capability 8 records which offer a later read ANSWERED, and could not have
landed first: `FollowedEdgeEvent.candidateSetId` is required and non-optional, so a followed edge is
uninstantiable until a candidate set exists. Capability 9 is the READ side of the same boundary and
emits nothing at all: both halves are now recorded, but the replay printed only a candidate COUNT, so
the offered ids never reached the screen and an unfollowed branch stayed invisible — which is the
whole distance between a containment chain and a decision tree.

## Declared boundaries

- `depends_on: [context-traversal-telemetry]` — a real runtime import edge: the sink validates every
  event through increment 1's vocabulary before writing, and the reader feeds
  `createContextTraversalTrace()`.
- `consumed_by: [cli]` — the provider-side declaration for the CLI's runtime import of this package
  at its dispatch boundary. Provider-side keeps the `cli` story spec untouched, and the edge is
  code-backed (a real `dependencies` entry), not declaration wallpaper.
- `repo-manifest.json` → `packageOwnership.organisms` carries
  `"@storytree/context-traversal-capture": "context-traversal-capture"`. This story is NOT in the
  `hostedStories` register and must never be added to it: every proof-bound source it claims lives
  inside its own package. The CLI-side lines it needs are un-asserted connective glue (ADR-0158) and
  are claimed by nothing.

## UAT Test Criteria

**Goal —** Spawn the REAL terminal CLI, prove it wrote a durable trace of exactly the reads it
performed and nothing else, then replay that trace from the command line — with every ADR-0235
uncertainty and every ADR-0241 honesty rule intact.

1. **A real spawned read command writes a replayable visit.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn the real _(criterion-id: uatc_7d2fd64553fdd66d3d23248c)_ _(revision-id: uatr1:1ff82f7c25357a12)_
   CLI binary (`node packages/cli/launch.mjs library artifact plan`) with
   `STORYTREE_TRAVERSAL_DIR` and `STORYTREE_SESSION_ID` pointed at a temporary directory, offline
   and without `--pg`. **Success —** the temporary directory holds one session trace file whose
   replay contains exactly one `full_payload_read` for canonical node `plan`, under the supplied
   `sessionId`, written by a process that has since exited.
2. **Two invocations join into one session with distinct visits.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ In the SAME _(criterion-id: uatc_6e39dfcc18d5caa4aa3c64a5)_ _(revision-id: uatr1:63ba2bacb36c23cd)_
   session id, spawn a second command at a different read strength
   (`tree spec context-traversal-telemetry`). **Success —** the replay holds two events under one
   `sessionId` with two distinct `visitId` values, the front-matter and full-payload kinds stay
   distinct, and no event carries `parentVisitId`, `priorVisitId`, or `followedEdgeId` — cross-process
   adjacency creates no causal edge.
3. **A write command leaves no owner prose on disk.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn a write-shaped _(criterion-id: uatc_411c5b920d3cc42fc2fb2a4f)_ _(revision-id: uatr1:3e7eb060347651e7)_
   command carrying canary prose in its arguments (`noticeboard declare --working-on "<canary>"
   --node x`, which refuses offline). **Success —** no new event is appended, and the session file's
   BYTES do not contain the canary — asserted against the file contents, not merely against parsed
   objects.
4. **The captured session replays from the command line.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn _(criterion-id: uatc_65130d5b0ef6482a5b443cf7)_ _(revision-id: uatr1:1e4a7006a96937cd)_
   `traversal show <sessionId>` against the same directory. **Success —** it exits 0 and the rendered
   body names both visits in chronological order, keeps the read-strength distinction visible,
   reports context capacity as unknown, and prints the adapter's supported/omitted coverage block.
5. **Capture is additive and opt-out-clean.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Re-run the same read command with _(criterion-id: uatc_11abf3bd67912119d765e77a)_ _(revision-id: uatr1:c1fb11dbcf0067ef)_
   `STORYTREE_TRAVERSAL=off`, and again with no resolvable session identity. **Success —** no trace
   file is created in either run, and each command's envelope PAYLOAD and exit code are
   byte-identical to the same command run with capture entirely absent. The payload is what
   "byte-identical" now means, and the narrowing is ADR-0260 D3's declared cost rather than a
   loosened assertion: a run that RECORDS an offer also PRINTS follow-up commands carrying that
   offer's id, and the id is a fresh visit id each time, so whole-stdout equality no longer holds even
   between two capture-on runs. The leg therefore also pins the half that keeps the change honest —
   the offer-carrying lines appear ONLY where an offer is genuinely recorded, and never on a run that
   captured nothing, since a printed id naming a candidate set that does not exist is an id an agent
   can return into a forged edge.
6. **A real `agents` render writes a depth, not a flat column.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn the real _(criterion-id: uatc_6b22fe35e0d9d416355d515a)_ _(revision-id: uatr1:bfbeadbe7ad9f435)_
   CLI binary (`node packages/cli/launch.mjs agents <a-real-agent-id>`) into a fresh temporary
   directory, offline and without `--pg`, then spawn `traversal show <sessionId>` against the same
   directory. **Success —** the replay's FIRST event is a `full_payload_read` of that agent carrying
   NO `parentVisitId` key at all, followed by at least one `front_matter_read` whose `parentVisitId`
   equals that agent visit's `visitId`; the rendered body names the child's parent link; and the
   rendered coverage block shows `field:parent_visit_id` under `supported` and NOT under `omitted`.
   The pure capability proves the descent over caller-supplied events, which is strictly weaker than
   "the real CLI, spawned, writes a parent-linked child visit and renders it" — this leg closes that
   gap at a boundary where spawning is free.
7. **A real artifact read records the branches it did NOT take.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn the real _(criterion-id: uatc_cb75462a2561f8db0825a9a2)_ _(revision-id: uatr1:3fa49ba3844329a1)_
   CLI binary (`node packages/cli/launch.mjs library artifact plan`) into a fresh temporary directory,
   offline and without `--pg`, and run NOTHING after it — so nothing in the session ever follows what
   that read offered. Then spawn `traversal show <sessionId>` against the same directory.
   **Success —** the replay holds exactly one visit and exactly one `candidate_set` whose
   `candidateSetId` names that visit and whose `candidateNodeIds` are the artifact's four real
   authored refs in authored order (the `doc:` one kept prefix-and-all); NOT ONE of those four ids
   appears as the `nodeId` of any visit in the trace, so every recorded offer is a branch this session
   did not take; the rendered body names the offer and its count; the coverage block shows
   `event:candidate_set` under `supported` and NOT `omitted`, while `event:followed_edge` and
   `field:candidate_follow_causality` stay under `omitted`; and the body carries both ADR-0260 D7
   caveats. This is the load-bearing leg for ADR-0260 D2: an implementation that recorded offers
   lazily — only once something followed — would leave this trace with no candidate set at all and
   would still pass every other leg above.
8. **A real followed command declares its edge, and a bare one declares none.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ In one _(criterion-id: uatc_4bbb8909ea3e832c7033ae7a)_ _(revision-id: uatr1:4cfc5cbe322171bc)_
   temporary directory and one session, spawn the real CLI three times, offline and without `--pg`:
   the offering read (`library artifact plan`); then the follow-up command that read PRINTED, run
   verbatim as an agent would paste it; then a BARE read of a different node the same offer put on
   the table. **Success —** the id printed on the follow-up command is byte-identical to the
   `candidateSetId` the offering read recorded (two OS processes, no shared memory — the string on
   the command line is the only thing the second knows about the first); the answering visit carries
   a `followedEdgeId` equal to the `edgeId` of exactly ONE recorded `followed_edge`, whose
   `candidateSetId` is that printed id, whose `fromVisitId` is the offering visit and whose
   `toVisitId` is the answering visit; all three reads record their own offer, so the chain continues
   past one hop; `traversal show` draws the edge and declares `event:followed_edge` and
   `field:candidate_follow_causality` under `supported` and NOT `omitted`, alongside all three
   ADR-0260 D7 caveats. And the load-bearing half — the BARE read carries NO `followedEdgeId` and
   adds NO second edge, even though the trace it ran against visibly holds a recent candidate set
   offering the very node it read. That is exactly the join a recency-resolving implementation would
   make, and ADR-0260 D3 refuses it: if the id is not on the command line, there is no edge. The
   missing edge is D4's accepted under-report, and no pass may ever correlate it away.
9. **A real replay draws the branches the session did NOT take.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ In one _(criterion-id: uatc_c52578cfeae287b056726977)_ _(revision-id: uatr1:81cf81492ff1399e)_
   temporary directory and one session, spawn the real CLI offline and without `--pg`: the offering
   read (`library artifact plan`), then the follow-up command that read PRINTED, run verbatim as an
   agent would paste it. Then spawn `traversal show <sessionId>` against the same directory.
   **Success —** the rendered body carries a `decision points:` block naming the offering read's
   recorded `candidateSetId`; EVERY id in that read's recorded `candidateNodeIds` appears inside the
   block, so the count rendered equals the count recorded and no offer is dropped from the picture;
   the answered one is marked followed and names the answering visit; each of the others is visibly
   NOT followed, which is the branch-not-taken this arc exists to draw; any `doc:` offer renders as
   unobservable rather than as a declined branch, so the block never over-reports how often the
   session turned an offer down. And the negative half, asserted in the same leg: a replay of a
   session that recorded NO offer carries no `decision points:` block at all — the section appears
   only where a real offer was observed, never as a heading announcing an absence.
10. **A real replay states how much of each offer set it could NOT see.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ In one _(criterion-id: uatc_413f00cf1ff8cd520194c4c4)_ _(revision-id: uatr1:e58f48ee23bb441e)_
    temporary directory and one session, spawn the real CLI offline and without `--pg`: the offering
    read (`library artifact plan`), whose Sources block carries BOTH followable `asset:` refs and a
    `doc:` ref no CLI read can reach. Then spawn `traversal show <sessionId>` against the same
    directory. **Success —** the rendered body carries an `offer observability:` block naming that
    read's recorded `candidateSetId`; its `offered` count equals the number of ids in that read's
    recorded `candidateNodeIds`, so the denominator is the whole offer and not a filtered subset; its
    `observable` count is strictly SMALLER than `offered`, which is the distortion made legible —
    the `[candidate-set]` line beside it reports only the offered count, and a reader taking that as
    the denominator over-reports how often the session stayed inside the asset graph; every
    unobservable entry is accounted for by a NAMED reason rather than a bare remainder; and the block
    closes with a total line stating that the followed counts are over the observable branches, not
    the offered ones. The rendered `offered` count also equals the number of entries the
    `decision points:` block lists for that same set, so the two derived views cannot disagree about
    what was on the table. And the negative halves, asserted in the same leg: a replay of a session
    that recorded NO offer carries no `offer observability:` block at all, and the block never renders
    a percentage — no `%` appears anywhere within it, since a rounded share of a three-element offer
    set claims precision the observation does not carry.

## Evidence

The standing machine UAT is
`packages/context-traversal-capture/src/terminal-capture.uat.test.ts`, run by
`pnpm --filter @storytree/context-traversal-capture test`. It SPAWNS the real CLI entry
(`node packages/cli/launch.mjs`) as a child process against a temporary trace directory with an
explicit `STORYTREE_SESSION_ID`, so "production emits" is an observation rather than a claim. The
env override is load-bearing, not a convenience: `deriveIdentity()` resolves only inside a
`.claude/worktrees/<name>` slot, so without it this UAT would pass locally and fail in CI.

All proof sources this story claims live under `packages/context-traversal-capture`. The CLI-side
activation lines (`packages/cli/src/main.ts`, `cli-areas.ts`, `commands.ts`, `traversal.ts`,
`package.json`) are un-asserted connective glue in another story's building: they are declared as a
consumed-by edge and reviewed in the diff, never claimed as this story's evidence.

## Reliability Gates

Every UAT leg above is `witness: machine`, and each — including legs 7, 8 and 9, added by
`context-decision-tree-arc`'s first, second and third build increments — is bound to `context-traversal-capture#gate-1`
by an explicit `_(proof-gate: …)_` annotation — the binding the resolver looks up VERBATIM, with no
first-observe fallback and no inference from ordering or `(covers:)`. The gate is what makes those
legs machine-provable at all: without it a machine leg has no command to resolve to, refuses
operator attestation (ADR-0082 d.2), and the story's UAT can never green.

The gate observes the SAME suite the spine already drove red→green: all four capabilities
(`traversal-trace-sink`, `terminal-boundary-observations`, `traversal-session-query`,
`terminal-capture-activation`) earned signed `--real` PASS verdicts through the prove-it-gate, and
`terminal-capture-activation`'s red→green authored the standing UAT file itself. So observing this
suite green at a clean committed HEAD is a truthful second observation of spine-driven proofs, not
an adoption standing in for a red that never happened.

1. **The capture package's own suite is green** _(gate: observe)_
   `pnpm --filter @storytree/context-traversal-capture test`. The spine runs it at a clean committed
   HEAD and OBSERVES it green — the durable JSONL sink (append, tolerant partial read, validated
   bytes), the argv read-allowlist (owner prose never recorded), the replay renderers (read strength
   distinct, coverage always printed, capacity honestly unknown), and the standing UAT that SPAWNS
   the real `node packages/cli/launch.mjs` process to prove production emits — all offline, no DB and
   no API key — plus the render-time offer recording (`artifact-offer-candidate-sets`), whose arrival
   re-proved this gate deliberately rather than around it (ADR-0260 D6: emitting `candidate_set`
   genuinely broke three of these legs' event-count assertions, which now count VISITS where they
   were always making a claim about reads), and the offer-answering edge (`offer-follow-edges`),
   whose arrival re-proved this gate a second time rather than around it (ADR-0260 D3 makes the
   offer's id part of the RENDERED surface, so leg 5's "byte-identical envelope" narrowed to the
   envelope's payload — the claim it was always making) — and the decision-point read side
   (`decision-point-playback`), whose arrival re-proved this gate a THIRD time rather than around it,
   and which was deliberately built to ADD a derived block rather than change any existing line: legs
   7 and 8 pin the `[candidate-set]` and `[followed-edge]` lines VERBATIM, so making the offered ids
   legible by rewriting those lines would have reddened two signed legs to no purpose — then signs an
   `adopted` verdict (`storytree adopt context-traversal-capture --pg`, which observe-and-signs this
   gate and the nine legs bound to it).

## Explicitly outside this increment

- Desktop-chat, spawned-agent, SDK, Codex, owned-loop, and `agents`-runtime capture adapters. Spawn
  handoff and result return stay schema-only.
- Any shared-database or hosted-studio read path for traces. Storage is local per-machine
  (ADR-0241 D8); a Postgres sink is a later swap behind the same seam.
- Retention, rotation, eviction, compaction, pruning, size caps, ranking, prefetch, guidance, and
  traversal limits. Traces are deliberately unbounded (ADR-0241 D7).
- Token/capacity observation at this boundary. The CLI sees no model tokens, so capacity renders as
  unknown; a default capacity, an inferred gauge, or the 500k danger region is out of scope and needs
  a separate owner decision (ADR-0235 clause 7).
- Forest playback, gauges, drill-down UI, icons, and colours.
- Any causal edge inferred from timestamps, adjacency, or invocation order.
- Recording argv verbatim, or observing any non-allowlisted command shape.
