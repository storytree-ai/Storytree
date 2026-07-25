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
decisions: [235, 241]
capabilities:
  [
    traversal-trace-sink,
    terminal-boundary-observations,
    traversal-session-query,
    terminal-capture-activation,
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

The graph is acyclic: the sink and the observation table consume only increment 1's vocabulary; the
query consumes the sink's reader; the activation composes all three.

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

1. **A real spawned read command writes a replayable visit.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn the real
   CLI binary (`node packages/cli/launch.mjs library artifact plan`) with
   `STORYTREE_TRAVERSAL_DIR` and `STORYTREE_SESSION_ID` pointed at a temporary directory, offline
   and without `--pg`. **Success —** the temporary directory holds one session trace file whose
   replay contains exactly one `full_payload_read` for canonical node `plan`, under the supplied
   `sessionId`, written by a process that has since exited.
2. **Two invocations join into one session with distinct visits.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ In the SAME
   session id, spawn a second command at a different read strength
   (`tree spec context-traversal-telemetry`). **Success —** the replay holds two events under one
   `sessionId` with two distinct `visitId` values, the front-matter and full-payload kinds stay
   distinct, and no event carries `parentVisitId`, `priorVisitId`, or `followedEdgeId` — cross-process
   adjacency creates no causal edge.
3. **A write command leaves no owner prose on disk.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn a write-shaped
   command carrying canary prose in its arguments (`noticeboard declare --working-on "<canary>"
   --node x`, which refuses offline). **Success —** no new event is appended, and the session file's
   BYTES do not contain the canary — asserted against the file contents, not merely against parsed
   objects.
4. **The captured session replays from the command line.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Spawn
   `traversal show <sessionId>` against the same directory. **Success —** it exits 0 and the rendered
   body names both visits in chronological order, keeps the read-strength distinction visible,
   reports context capacity as unknown, and prints the adapter's supported/omitted coverage block.
5. **Capture is additive and opt-out-clean.** _(witness: machine)_ _(proof-gate: context-traversal-capture#gate-1)_ Re-run the same read command with
   `STORYTREE_TRAVERSAL=off`, and again with no resolvable session identity. **Success —** no trace
   file is created in either run, and each command's envelope and exit code are byte-identical to the
   same command run with capture entirely absent.

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

Every UAT leg above is `witness: machine`, and each is bound to `context-traversal-capture#gate-1`
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
   no API key — then signs an `adopted` verdict
   (`storytree adopt context-traversal-capture --pg`, which observe-and-signs this gate and the five
   legs bound to it).

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
