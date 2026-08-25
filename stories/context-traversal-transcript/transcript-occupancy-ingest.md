---
id: "transcript-occupancy-ingest"
tier: capability
story: context-traversal-transcript
arc: linked-session-context-arc
title: "A session's correlated windows become occupancy events on disk, idempotently"
outcome: "A session's correlated windows become validated occupancy events on disk, idempotently."
status: proposed
proof_mode: integration-test
depends_on: [transcript-occupancy-extraction, transcript-session-correlation]
decisions: [235, 241, 248]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-transcript", "test"]
  scope:
    testGlobs: ["packages/context-traversal-transcript/src/ingest-occupancy.test.ts"]
    sourceGlobs: ["packages/context-traversal-transcript/src/ingest-occupancy.ts"]
  real:
    testFile: "packages/context-traversal-transcript/src/ingest-occupancy.test.ts"
    sourceFile: "packages/context-traversal-transcript/src/ingest-occupancy.ts"
    scope:
      testGlobs: ["packages/context-traversal-transcript/src/ingest-occupancy.test.ts"]
      sourceGlobs: ["packages/context-traversal-transcript/src/ingest-occupancy.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "typecheck"]
---

# A session's correlated windows become occupancy events on disk, idempotently

## Guidance

Author the five contracts below under these ids, VERBATIM — the leaf's test titles must START with
the contract id:
`ingest-writes-validated-model-context-events-to-disk`,
`cumulative-is-the-running-billing-total-per-window`,
`capacity-is-absent-because-a-transcript-declares-none`,
`re-ingesting-appends-no-bytes`,
`the-adapter-declares-its-own-exhaustive-coverage`.

**What this composes.** Two siblings in this package, already green, plus increment 2's sink:

- `correlateTranscripts(sessionId, { dir })` from `./correlate-transcripts.js` — which host windows
  belong to this storytree session.
- `readTranscriptWindow(filePath)` from `./transcript-occupancy.js` — that window's per-request
  occupancy observations.
- `appendTraversalEvents` / `readTraversalSession` from `@storytree/context-traversal-capture` — the
  durable local JSONL sink (ADR-0241).
- `ContextTraversalCoverage` / `CoverageFeature` from `@storytree/context-traversal-telemetry`.

Do not re-implement any of them, and do not reach into a trace file directly — every byte written
goes through `appendTraversalEvents`, which is what makes ADR-0241 D4's validate-before-write rule
hold here for free.

**Shape.** Export from `ingest-occupancy.ts`:

```ts
export const HOST_TRANSCRIPT_COVERAGE: ContextTraversalCoverage;

export interface IngestedWindow {
  readonly windowId: string;
  /** Observations the window yielded. */
  readonly observed: number;
  /** Events actually appended — 0 on a re-ingest. */
  readonly appended: number;
}

export interface TranscriptIngestResult {
  readonly sessionId: string;
  readonly windows: readonly IngestedWindow[];
  readonly scannedFiles: number;
  readonly appended: number;
  /** Assistant-shaped transcript lines skipped across every window. */
  readonly skippedLines: number;
  /** Sidechain requests excluded across every window. */
  readonly sidechainRequests: number;
  /** Correlated files naming only SUBAGENT windows — reached, and not observed by this adapter. */
  readonly sidechainFiles: number;
}

export function ingestTranscriptOccupancy(input: {
  readonly sessionId: string;
  /** The trace directory the sink writes under — supplied, never resolved here. */
  readonly traceDir: string;
  /** The host transcript root to scan — supplied, never resolved here. */
  readonly transcriptDir: string;
}): TranscriptIngestResult;
```

**Where it lands, and why that changed.** Each correlated window's events are written to **that
window's own trace** (`{dir, sessionId: windowId}`), stamped `grade: "window"` with the storytree
session recorded beside them as the `slot` grouping attribute. CORRELATION is unchanged and still
slot-driven — the `cwd` join (ADR-0248) is what FINDS a session's transcripts, matching the final
segment of `.claude/worktrees/<name>` — so the verb's argument is still the storytree session and
only the destination moved.

`linked-session-context-arc-inc-30` made the terminal-CLI read trace's identity the host context
WINDOW while this ingest still keyed occupancy by the slot, so the two adapters disagreed about what
a session was: `traversal show <windowId>` rendered a window's reads and reported `capacity: unknown`
even after a successful ingest, while `traversal show <slot>` rendered the occupancy and none of the
reads. That was disclosed rather than fixed at the time, because the repair lives in this story and
inc-30's fence did not reach it. It is fixed here, and the disclosure the CLI printed is REPLACED
rather than left standing — it would now be a false statement, not merely a stale one.

The two slot-keyed traces already on this machine are left exactly as they are. Traces are local,
unretained and version-pinned (ADR-0241), so nothing is owed a migration; their lines carry no grade,
so `classifyTraceIdentity` reads them as the legacy `slot` era and `traversal list` / `show` label
them as such. That is a THIRD labelling case only if it goes unsaid — it is said here, and it is the
same answer inc-30 gave for the reads it could not retrofit.

**The event.** One `model_context` event per observation, in window order then request order:

| field | value |
|---|---|
| `kind` | `"model_context"` |
| `eventId` | `` `host-transcript:${windowId}:${requestId}` `` — DETERMINISTIC, no `randomUUID` |
| `sessionId` | **the window's id** — the context window this observation was read from, not the storytree session that found it (`linked-session-context-arc-inc-32`) |
| `at` | the observation's `at`, verbatim |
| `windowId` | the observation's window |
| `modelId` | the observation's `modelId`, key ABSENT when it had none |
| `residentInputTokens` | the observation's resident total — the occupancy quantity (ADR-0248 D1) |
| `cumulativeInputTokens` | the running SUM of `residentInputTokens` within this window, up to and including this request |
| `addedInputTokens` | equal to `cumulativeInputTokens` |
| `contextWindowCapacity` | never set — the key must not appear |

`cumulativeInputTokens` is a BILLING total: tokens processed, monotonic within a window, exactly as
its definition site documents it (ADR-0248 D2). `residentInputTokens` is OCCUPANCY: tokens resident
at one request, and it falls. They are different kinds of quantity and this is the first boundary
that emits both, which is precisely why they must not be computed from each other in the wrong
direction — never derive resident from cumulative.

`addedInputTokens` duplicates `cumulativeInputTokens` **deliberately**, matching what
`context-traversal-spawn` already does. ADR-0248 D3 deletes that field; giving it a real per-request
delta here would contradict an accepted decision and make the deletion harder. Emitting the existing
duplicate convention leaves the deletion increment ONE uniform pattern to remove. Write that reason
in a comment at the assignment.

**Idempotence is a contract, not a nicety.** The ingest reads the session's existing trace through
`readTraversalSession` FIRST, collects the `eventId`s already present, and appends only events whose
id is new. A second run over unchanged transcripts must append zero bytes. Deterministic `eventId`
is what makes that possible — never a UUID, never a counter, never a timestamp-derived id.

**Never throws, and never fails a caller closed (ADR-0241 D3).** A missing transcript root, an
unreadable trace directory, a session with no correlated window: each returns a result with zero
appended rather than an error. The sink already absorbs its own filesystem edges.

**Coverage (ADR-0235 clause 6).** `HOST_TRANSCRIPT_COVERAGE` declares
`adapterId: "host-transcript"` and supports exactly:
`surface:host_transcript`, `event:model_context`, `field:model_tokens`,
`field:resident_input_tokens`, `field:window_id`.
Everything else is omitted, computed as
`CoverageFeature.options.filter((f) => !supported.includes(f))` so a future feature can never go
silently unnamed. In particular `field:context_window_capacity` is OMITTED — the transcript surface
declares no window size — and so are every visit, search, candidate, followed-edge, spawn, and
return feature: this adapter observes model requests only.

**Fences.** No `@storytree/drive` import (nothing in this arc may make `drive` reach a traversal
package). No environment reads — both directories are supplied by the caller, which is what keeps
the tests HOME-independent and the CLI the only place that resolves defaults. No clock, no
`randomUUID`, no direct filesystem write, no retention or pruning, no rendering (the CLI's envelope
is glue), and no change to any sibling module.

**Files.** `packages/context-traversal-transcript/src/ingest-occupancy.ts` and
`ingest-occupancy.test.ts`. The package scaffold already exists — add nothing to `package.json`, and
do not touch `src/index.ts`, `transcript-occupancy.ts`, or `correlate-transcripts.ts`.

## Contracts

1. **`ingest-writes-validated-model-context-events-to-disk`**
   - **asserts —** over a temporary transcript root and a separate temporary trace directory, each
     correlated WINDOW produces its own trace file that `readTraversalSession` replays, in request
     order, as `model_context` events carrying that window's id as BOTH `sessionId` and `windowId`,
     plus the observation's `residentInputTokens` — every assertion read off the REPLAY of the bytes
     on disk, never off the returned result object. Each trace reports `identity: "window"` and
     `slots: [<the storytree session>]`. The storytree-session-keyed file does NOT exist, asserted as
     file EXISTENCE. `JSON.stringify` of the raw contents contains none of the canary prose planted
     in the fixture's message text.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that returns the events without writing them (the
     replay would be empty), against one that bypasses `appendTraversalEvents` — an event carrying an
     unknown key is refused by the `.strict()` vocabulary before it reaches the bytes — and, since
     `linked-session-context-arc-inc-32`, against one that keys the write by the storytree session
     instead of the window. **The existence assertion is what carries that last one.** A reader over
     a MISSING file returns an empty replay exactly as a genuinely empty one does, so an assertion
     phrased as "the session trace replays nothing" would pass against a still-session-keyed
     implementation the moment anything else about the fixture changed; only existence separates
     *moved* from *wrote nothing*. Renaming the file alone is caught too: `replay(sessionId)` filters
     on `event.sessionId`, so the events themselves must carry the window's identity, and the
     `identity`/`slots` assertions fail against a write that omits the grade the sink stamps.
2. **`cumulative-is-the-running-billing-total-per-window`**
   - **asserts —** for a window whose resident series is 100, 240, 228, the replayed events carry
     `residentInputTokens` 100, 240, 228 and `cumulativeInputTokens` 100, 340, 568 — so cumulative
     rises while resident falls — and `addedInputTokens` equals `cumulativeInputTokens` on every
     event. With a SECOND correlated window present, that window's `cumulativeInputTokens` restarts
     from its own first request rather than continuing the first window's total.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that sets `cumulativeInputTokens` equal to
     `residentInputTokens` (the 340 and 568 would be wrong), against one that accumulates ACROSS
     windows (the second window's first value would be wrong), and against one that derives
     `residentInputTokens` from the cumulative series by differencing — which would make the
     occupancy quantity monotonic again and quietly undo the whole increment.
3. **`capacity-is-absent-because-a-transcript-declares-none`**
   - **asserts —** every replayed event has NO `contextWindowCapacity` key — asserted as key absence
     over the raw JSON of the trace file's lines, not as a falsy value — even for a fixture whose
     model id is one with a well-known window size, and even when the request's resident total
     exceeds any plausible window.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that defaults capacity to 200_000, to 1_000_000,
     to the ADR-0235 500k threshold, or to a value looked up from `modelId`, and against one that
     writes `contextWindowCapacity: undefined`. ADR-0235 clause 4 makes capacity RUNTIME-DECLARED;
     this surface declares none, and an invented one would be a fabricated denominator under the
     arc's signature bar.
4. **`re-ingesting-appends-no-bytes`**
   - **asserts —** running `ingestTranscriptOccupancy` twice over unchanged directories leaves the
     BYTE LENGTH summed across every window's trace identical to after the first run, leaves the
     replayed event count identical, and returns `appended: 0` on the second run with each window's
     `observed` unchanged. A third run after appending ONE new request appends exactly one event, and
     it lands in the window that GREW while the other window's count is unchanged.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation using `randomUUID` or any non-deterministic
     `eventId` (byte length would grow), and — critically — against one that appends duplicates and
     relies on the sink's tolerant reader to skip them: the reader would report the same event count
     while the file silently doubled, so the byte-length assertion is the one that carries this
     contract and the event-count assertion alone must not be able to satisfy it. Summing ACROSS
     window files is what keeps that true after `linked-session-context-arc-inc-32` — asserting one
     window's file would leave the other's bytes unread — and the third-run placement assertion is
     what stops a growing window's event being credited to the wrong trace.
6. **`one-window-named-by-two-files-is-written-once`**
   - **asserts —** one identical request written verbatim into TWO transcript files under the same
     worktree cwd is counted and written ONCE inside a SINGLE run: `scannedFiles: 2` (both files
     genuinely walked), `appended: 1`, and the window's trace holds exactly one LINE.
   - **falsifiability —** this contract exists because `linked-session-context-arc-inc-32` made the
     re-ingest guard a per-window read taken INSIDE the window loop, rather than one read taken
     before it. The old shape could not satisfy this: both files missed a guard read before either
     append, so the request landed twice — the shape a resumed or forked session produces. It goes
     red against restoring a single pre-loop read, against de-duplicating only within one file, and
     against "fixing" it by skipping the second file, which `scannedFiles: 2` pins. **Asserted on
     LINE COUNT, not on a replayed event count**, because the sink's tolerant reader collapses a
     duplicate id and would report 1 either way — the same reason contract 4 asserts bytes.
5. **`the-adapter-declares-its-own-exhaustive-coverage`**
   - **asserts —** `ContextTraversalCoverage.parse(HOST_TRANSCRIPT_COVERAGE)` succeeds;
     `adapterId` is `host-transcript`; `surface:host_transcript`, `event:model_context`,
     `field:model_tokens`, `field:resident_input_tokens`, and `field:window_id` are in `supported`
     and none of them in `omitted`; `field:context_window_capacity`,
     `field:candidate_follow_causality`, `event:front_matter_read`, `event:full_payload_read`,
     `event:search`, `event:spawn_handoff`, and `event:result_return` are OMITTED; and
     `supported.length + omitted.length === CoverageFeature.options.length`.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against a declaration that names a feature on both lists (the schema refuses
     it), against one that claims `field:context_window_capacity` this adapter cannot observe, and
     against one that hand-lists `omitted` instead of computing it from `CoverageFeature.options` —
     assert the total against `CoverageFeature.options.length` rather than a literal, so a future
     vocabulary addition reds this contract instead of silently widening the honest-coverage claim.

## Integration evidence

`packages/context-traversal-transcript/src/ingest-occupancy.test.ts` builds a transcript root and a
trace directory inside fresh `fs.mkdtempSync(path.join(os.tmpdir(), …))` directories and removes them
afterwards, so nothing reads the developer's real `~/.claude/projects` or `~/.storytree/traces` and
the suite is deterministic in CI. Every substantive assertion is made on the BYTES the ingest wrote —
replayed back through `readTraversalSession`, or read raw for the key-absence, byte-length, and
no-canary claims — rather than on the in-memory result the function returned, so an ingest that
computes correctly and writes nothing (or writes something else) goes red.
