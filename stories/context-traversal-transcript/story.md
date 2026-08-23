---
id: "context-traversal-transcript"
tier: story
title: "The orchestrator's own context window becomes an occupancy series in its session trace"
outcome: "A real session's host transcript becomes per-request window-occupancy observations in that session's durable trace, correlated by identity and honest about every window it merged."
status: proposed
proof_mode: UAT
uat_witness: machine
arc: linked-session-context-arc
depends_on: [context-traversal-telemetry, context-traversal-capture, library]
consumed_by: [cli]
decisions: [235, 241, 248, 192, 403]
capabilities:
  [
    transcript-occupancy-extraction,
    transcript-session-correlation,
    transcript-occupancy-ingest,
    transcript-decision-read-extraction,
    transcript-decision-read-ingest,
  ]
---

# The orchestrator's own context window becomes an occupancy series in its session trace

**Outcome —** A real session's host transcript becomes per-request window-occupancy observations in
that session's durable trace, correlated by identity and honest about every window it merged.

This is ADR-0248 D1. The arc's signature visual is one playhead bar that fills as the playback runs
and shows **context resident in the runtime-declared window at the playhead**. No field in the trace
carries that quantity today, and no re-scaling of an existing one can supply it: the decisive
evidence is that the owner-approved visual contract's committed reference trace **recedes** —
240.9k → 228.1k, and 239.8k → 229.6k. The bar needs a quantity that can FALL, and a billing total is
monotonic by construction.

The host transcript surface has it. `~/.claude/projects/**/*.jsonl` records `message.usage.*` per
assistant message, so the resident total for a single request — fresh input plus cache-read plus
cache-write — is recoverable per request, and it falls whenever the window is compacted or a shorter
prompt is sent. The owner's direction was that **orchestrator observability takes priority**: the
window that matters first is the one the session owner is sitting in, and that is exactly the window
this surface exposes. The SDK-message-stream boundary that would see a build LEAF's own window is
deferred, not refused (ADR-0248 D4).

The substance of this story is not the arithmetic. It is **identity correlation**: a transcript
session id is not a storytree session id, and ADR-0248 D1 names that as this increment's work rather
than a reason to prefer another source. The two identities are joined by the only thing both records
carry — the working directory. `deriveIdentity()` resolves a storytree `sessionId` from a
`.claude/worktrees/<name>` toplevel, and every transcript line records the `cwd` it was written
under, so a transcript belongs to a session when it was written inside that session's worktree.
That join is deterministic, needs no new state, and is exactly as strong as the identity rule it
mirrors — no stronger, which is why it is asserted rather than assumed.

Correlation also surfaces the fact that makes a naive merge a lie: **a storytree session id outlives
any single runtime window.** It is worktree-derived, and one worktree routinely hosts several host
sessions in sequence — two already do on this machine. Each is its own window, starting empty. So
every observation names the window it belongs to, and windows are never concatenated into one
undifferentiated series.

## Why this is one story

The consumer is a session owner asking one question: *how full was my context, and when did it
fall?* The shared precondition is one real session whose host transcript exists on this machine; the
shared observable is that session's trace, now carrying an occupancy series it did not have before.
A sink to write it already exists (increment 2), so everything here is the reading, the joining, and
the writing of one new quantity.

This is a DIFFERENT journey from the three stories already in this arc. `context-traversal-telemetry`
observes a decorated in-process runner; `context-traversal-capture` observes the terminal CLI's own
dispatch; `context-traversal-spawn` observes a build's spawned leaf slices. All three observe a
boundary **this repository controls and emits at**. This story observes a surface written by the host
harness, which we do not emit at and cannot instrument — so it READS rather than emits, and its whole
difficulty (which file, whose session, which window) does not exist for any of them. Folding it into
any of the three would force an outcome sentence needing a conjunction, which is the splitting rule's
own trigger.

It therefore lives in its own workspace package, `packages/context-traversal-transcript` (ADR-0192 D2
— a new story's code lives in its own building), and adds nothing to the `hostedStories` register.

## Why this adapter READS rather than emitting ambiently

ADR-0235 clause 1 has runtime adapters record traversal ambiently, and the three existing adapters do.
This one cannot, and the reason is a property of the surface rather than a shortcut: the host harness
writes the transcript, and it has not flushed the current request's usage at the moment our process
runs. An "ambient" hook at CLI dispatch would therefore observe a file that is missing exactly the
request that triggered it. Ingest is explicit — one command, run when the owner wants the series —
and it is idempotent, so running it repeatedly is the normal way to keep a live session's trace
current. That property is a contract, not a convenience: without it, an owner who ran ingest twice
would double every observation.

## Capabilities

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`transcript-occupancy-extraction`](transcript-occupancy-extraction.md) | One host transcript yields one window-occupancy observation per model request, and a quantity that can fall. | — |
| 2 | [`transcript-session-correlation`](transcript-session-correlation.md) | A storytree session id resolves to the host transcript windows written inside its worktree, each named separately. | — |
| 3 | [`transcript-occupancy-ingest`](transcript-occupancy-ingest.md) | A session's correlated windows become validated occupancy events on disk, idempotently. | `transcript-occupancy-extraction`, `transcript-session-correlation` |
| 4 | [`transcript-decision-read-extraction`](transcript-decision-read-extraction.md) | Every decision-record read a host transcript recorded is recovered by argv shape, with each near-miss declined and counted rather than dropped. | — |
| 5 | [`transcript-decision-read-ingest`](transcript-decision-read-ingest.md) | The decision reads recovered from every host transcript become validated traversal events in each session's own trace, idempotently, and a zero is reported as blindness rather than as silence. | `transcript-decision-read-extraction`, `transcript-session-correlation`, `transcript-occupancy-ingest` |

The graph is acyclic, and it is two chains sharing one root. Capabilities 1, 2 and 4 each read
transcript bytes and consume nothing from each other. Capability 3 composes 1 and 2 with increment
2's sink; capability 5 composes 4 and 2 with the same sink, and additionally depends on 3 because its
own coverage contract asserts that its `adapterId` DIFFERS from the occupancy adapter's — a trace
refuses a duplicate, so that sibling's delivered outcome is a genuine precondition for this one's
proof to pass. No edge runs backwards: nothing capability 3 delivers is consumed by 1, 2 or 4, and
nothing capability 5 delivers is consumed by anything here at all.

**Capabilities 4 and 5 are BROWNFIELD (`status: mapped`), unlike 1–3.** Their code was landed by
ordinary hand-authored commits under `adrs-into-the-dag-arc-inc-07` and ADR-0403 rather than driven
red→green by the spine, so no signed verdict backs them and neither carries a `real:` arm (ADR-0094;
a forced net-new red against files that already exist is the theater ADR-0085 bans). Each was MINTED
by `linked-session-context-arc-inc-28` so the subtree it owns is claimable at `work` grade again —
ADR-0346 D2 retired story-grain work claims, and until these existed a session writing those files had
nothing legal to claim. Their specs describe shipped behaviour and invent no new obligation.

## Declared boundaries

- `depends_on: [context-traversal-telemetry, context-traversal-capture, library]` — real runtime
  import edges: the ingest builds `ModelContextEvent`s from increment 1's vocabulary and writes them
  through increment 2's `appendTraversalEvents` / `readTraversalSession` sink. The `library` edge is
  the decision-record extractor's (`decision-log-readers-arc-inc-04`): it resolves an `adr-NNNN`
  artifact id through `decision-pointer.ts`, which ADR-0403 dec 7 makes the ONE place that rule may
  live — a second copy of the strict four-digit guard is the drift seam that module exists to
  prevent, and `adr-health-notes` silently inheriting a decision's edges is what it prevents. The
  root barrel is pure-zod and browser-safe, so the edge drags no `node:`/`pg` import behind it.
- `consumed_by: [cli]` — the provider-side declaration for the CLI's runtime import at the
  `storytree traversal ingest` sub-command. Provider-side keeps the `cli` story spec untouched, and
  the edge is code-backed (a real `dependencies` entry), not declaration wallpaper.
- `repo-manifest.json` → `packageOwnership.organisms` carries
  `"@storytree/context-traversal-transcript": "context-traversal-transcript"`. This story is NOT in
  the `hostedStories` register and must never be added to it: every proof-bound source it claims
  lives inside its own package.
- **One additive edit lands outside this package and is claimed by nothing here.**
  `packages/context-traversal-telemetry/src/traversal-events.ts` gains two optional
  `ModelContextEvent` fields (`residentInputTokens`, `windowId`) and three `CoverageFeature` options
  (`surface:host_transcript`, `field:resident_input_tokens`, `field:window_id`). The vocabulary is
  `.strict()`, so there is nowhere else those fields could live. It is deliberately additive: every
  existing adapter computes its `omitted` list from `CoverageFeature.options`, so all three absorbed
  the new features with no source change, and all three sibling suites stayed green. The owning
  capability's signed verdict was NOT re-run for it — a `--real` rebuild of an already-green unit
  risks permanently under-claiming it, and the edit adds no behaviour that capability's contracts
  describe. What asserts the new fields is THIS story's suite, on bytes on disk.

## UAT Test Criteria

**Goal —** Spawn the REAL terminal CLI against a REAL host transcript layout, prove it wrote an
occupancy series that can fall, correlated to the right session, named per window, and idempotent —
with every ADR-0235 honesty rule intact.

1. **A real spawned ingest writes a falling occupancy series.** _(witness: machine)_ _(proof-gate: context-traversal-transcript#gate-1)_ _(criterion-id: uatc_80bd59185c3160fb51a2c4ba)_ _(revision-id: uatr1:1d0a1d0b9cc61852)_
   Build a temporary transcript root holding one project directory whose transcript records assistant
   messages under a `cwd` of `<tmp>/.claude/worktrees/<sessionId>`, with per-request resident totals
   that RISE and then FALL. Spawn the real CLI binary
   (`node packages/cli/launch.mjs traversal ingest <sessionId>`) with `STORYTREE_TRAVERSAL_DIR` and
   the transcript-root override pointed at temporary directories, offline and without `--pg`.
   **Success —** the trace directory holds one session file whose replay contains one
   `model_context` event per request, in order, whose `residentInputTokens` series is non-monotonic —
   it goes down at least once — written by a process that has since exited.
2. **Occupancy is the resident total, not the billing total.** _(witness: machine)_ _(proof-gate: context-traversal-transcript#gate-1)_ _(criterion-id: uatc_4b2c037dd7574f5450c9b3fd)_ _(revision-id: uatr1:4357b55f88f8f4a2)_
   In the same spawned run, one request's `cache_read_input_tokens` dominates its `input_tokens` by
   three orders of magnitude. **Success —** that event's `residentInputTokens` equals the sum of the
   request's three input axes, its `cumulativeInputTokens` is strictly larger (the running billing
   total), and `contextWindowCapacity` is absent as a KEY — the transcript declares no window size
   and none is invented.
3. **Two windows in one session stay two windows.** _(witness: machine)_ _(proof-gate: context-traversal-transcript#gate-1)_ _(criterion-id: uatc_f7e9c84c49eea4685c300d31)_ _(revision-id: uatr1:49d9b0d829d22a07)_
   The temporary transcript root holds a SECOND transcript written under the same worktree `cwd`.
   **Success —** the replay holds both windows' events under one `sessionId`, every event carries the
   `windowId` of the transcript it came from, the two `windowId` values differ, and each window's
   `cumulativeInputTokens` restarts from its own first request rather than continuing the other's.
4. **A foreign session's transcript is never correlated.** _(witness: machine)_ _(proof-gate: context-traversal-transcript#gate-1)_ _(criterion-id: uatc_269685e94dabe5cbf9852658)_ _(revision-id: uatr1:c7a8c68f45bd9022)_
   The temporary transcript root also holds a transcript written under the MAIN checkout `cwd` and
   one written under a worktree whose name has the target session id as a strict prefix. **Success —**
   neither contributes any event, the spawned command still exits 0, and its rendered body states how
   many transcript files it scanned and how many windows it correlated — an uncorrelated file is
   reported, never silently dropped.
5. **Re-ingesting the same transcripts appends nothing.** _(witness: machine)_ _(proof-gate: context-traversal-transcript#gate-1)_ _(criterion-id: uatc_e8ef7fe3eed5bcbed7903559)_ _(revision-id: uatr1:a701031e0f439e14)_
   Spawn the same ingest command a second time against the unchanged directories. **Success —** the
   session trace file's BYTE LENGTH is unchanged, the replay's event count is unchanged, and the
   second run's envelope reports zero appended — asserted against the file contents, not merely
   against a parsed count.
6. **No transcript content reaches the trace.** _(witness: machine)_ _(proof-gate: context-traversal-transcript#gate-1)_ _(criterion-id: uatc_74f6b07e4ea15603fe4013d8)_ _(revision-id: uatr1:a13458bc5262c3db)_
   Every assistant message in the temporary transcripts carries canary prose in its text content, and
   one carries it in a tool result. **Success —** the session file's BYTES do not contain the canary,
   and the rendered envelope does not either — ADR-0235 clause 6 asserted on bytes, exactly as
   increment 2 asserts it.

## Evidence

The standing machine UAT is
`packages/context-traversal-transcript/src/transcript-ingest.uat.test.ts`, run by
`pnpm --filter @storytree/context-traversal-transcript test`. It SPAWNS the real CLI entry
(`node packages/cli/launch.mjs`) as a child process against temporary trace and transcript
directories with an explicit `STORYTREE_SESSION_ID`, so "production reads and writes" is an
observation rather than a claim. Both env overrides are load-bearing rather than convenient: without
the transcript-root override the UAT would read the DEVELOPER'S OWN sessions and could never be
deterministic or CI-safe, and without the session-id override `deriveIdentity()` would resolve only
inside a `.claude/worktrees/<name>` slot, so the test would pass locally and fail in CI.

All proof sources this story claims live under `packages/context-traversal-transcript`. The CLI-side
ingest lines (`packages/cli/src/traversal.ts`, `commands.ts`, `package.json`) are un-asserted
connective glue in another story's building (ADR-0158): they are declared as a consumed-by edge and
reviewed in the diff, never claimed as this story's evidence.

## Reliability Gates

Every UAT leg above is `witness: machine`, and each is bound to `context-traversal-transcript#gate-1`
by an explicit `_(proof-gate: …)_` annotation — the binding the resolver looks up VERBATIM, with no
first-observe fallback and no inference from ordering or `(covers:)`. The gate is what makes those
legs machine-provable at all: without it a machine leg has no command to resolve to, refuses operator
attestation (ADR-0082 d.2), and the story's UAT can never green. This arc has now paid twice for
omitting the binding; this section is authored up front rather than retrofitted.

The gate carries NO `(covers:)` list, deliberately. All three capabilities are driven red→green by
the spine and earn their own signed `--real` verdicts; a coverage list here would let an adopt pass
green a capability that never went red, which is the inverse theater ADR-0085 / ADR-0097 ban.

ADR-0243 does NOT apply to this adapter, and the correction is load-bearing rather than incidental.
ADR-0248's original claim that its candidates A and D both inherit ADR-0243's difficulty was wrong
for D and is corrected in that ADR's body: ADR-0243's problem is specific to a boundary that only
fires when a real build spawns a subscription-funded leaf, and therefore cannot be exercised where CI
runs. Reading a local transcript file is free and credential-free — the same shape as increment 2's
terminal CLI dispatch boundary, which earned five signed machine UAT legs by spawning the real CLI
and asserting on bytes on disk. This story's legs are that shape, confirmed by construction rather
than inherited: every one of them runs offline, with no DB, no API key, and no model.

1. **The transcript package's own suite is green** _(gate: observe)_
   `pnpm --filter @storytree/context-traversal-transcript test`. The spine runs it at a clean
   committed HEAD and OBSERVES it green — the per-request occupancy extraction (one observation per
   request not per line, a series that can fall, sidechain windows excluded and counted, an honestly
   partial read of a truncated transcript, no content in the result), the worktree-cwd correlation
   (exact final segment, a prefix refused, an uncorrelated session empty rather than an error, every
   window named separately), and the ingest composition (validated events as bytes on disk, capacity
   absent as a key, deterministic identity making re-ingest a no-op, the adapter's own exhaustive
   coverage declaration) — all offline, no DB and no API key — then signs an `adopted` verdict
   (`storytree adopt context-traversal-transcript --pg`, which observe-and-signs this gate and the
   six legs bound to it).

## Explicitly outside this increment

- **The playback itself.** No bar, no fill, no red over-threshold region, no animation, no panel, no
  regeneration of `docs/design/context-traversal/session-traversal-playback.html` or its `.png`.
  This increment supplies the quantity that visual is blocked on and nothing else.
- **ADR-0248 D3.** `addedInputTokens` stays on `ModelContextEvent`, and this adapter emits it as a
  duplicate of `cumulativeInputTokens` exactly as `context-traversal-spawn` does — deliberately, so
  the deletion increment finds one uniform pattern rather than two conventions. Deleting the key
  requires editing the emitters and assertions in `context-traversal-spawn` and the render fixture in
  `context-traversal-capture`, which are two other stories' proof-bound sources; it belongs to the
  increment that owns them. See the ADR's execution-status bullet.
- **ADR-0243's `liveAuthorOverride` seam and its machine activation leg.** A separate increment, and
  none of this story's legs need it.
- **The SDK message stream (ADR-0248 candidate A).** A build leaf's own window is deferred, not
  refused.
- `parentVisitId` / followed-edge emission, and any causal edge inferred from timestamps, adjacency,
  or invocation order.
- Teaching `showTraversalSessionAllAdapters` (in `context-traversal-spawn`) about this adapter's
  coverage declaration. `traversal ingest` publishes its own coverage in its own envelope, which is
  what ADR-0235 clause 6 asks of an adapter; widening another story's replay renderer is that
  story's increment.
- Any shared-database or hosted-studio read path for transcripts or traces. Storage stays local per
  machine (ADR-0241 D8).
- Retention, rotation, eviction, size caps, and any pruning of transcripts or traces (ADR-0241 D7).
- Reading, storing, or rendering any transcript CONTENT: prompts, message text, tool inputs, tool
  results, hidden reasoning, file paths from the transcript, or titles. Metadata only, asserted on
  the bytes.
