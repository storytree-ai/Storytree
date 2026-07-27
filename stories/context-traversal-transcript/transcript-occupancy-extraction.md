---
id: "transcript-occupancy-extraction"
tier: capability
story: context-traversal-transcript
arc: linked-session-context-arc
title: "One host transcript yields one occupancy observation per model request"
outcome: "One host transcript yields one window-occupancy observation per model request, and a quantity that can fall."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [235, 248]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-transcript", "test"]
  scope:
    testGlobs: ["packages/context-traversal-transcript/src/transcript-occupancy.test.ts"]
    sourceGlobs: ["packages/context-traversal-transcript/src/transcript-occupancy.ts"]
  real:
    testFile: "packages/context-traversal-transcript/src/transcript-occupancy.test.ts"
    sourceFile: "packages/context-traversal-transcript/src/transcript-occupancy.ts"
    scope:
      testGlobs: ["packages/context-traversal-transcript/src/transcript-occupancy.test.ts"]
      sourceGlobs: ["packages/context-traversal-transcript/src/transcript-occupancy.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "typecheck"]
---

# One host transcript yields one occupancy observation per model request

## Guidance

Author the six contracts below under these ids, VERBATIM — the leaf's test titles must START with
the contract id:
`occupancy-is-the-per-request-resident-total`,
`the-occupancy-series-can-fall`,
`one-observation-per-request-not-per-line`,
`subagent-requests-never-enter-the-parent-window`,
`an-unusable-transcript-reads-partially-and-never-throws`,
`no-transcript-content-reaches-an-observation`.

**What a host transcript is.** A JSONL file written by the Claude Code harness under
`~/.claude/projects/<mangled-cwd>/<transcript-session-id>.jsonl`. Every line is one JSON object.
The lines this capability cares about have `type: "assistant"` and carry:

```jsonc
{
  "type": "assistant",
  "sessionId": "67e6851c-…",          // the HOST session id — this window's identity
  "timestamp": "2026-07-17T22:38:44.720Z",
  "isSidechain": false,                // true = a spawned subagent's own window
  "message": {
    "id": "msg_01…",                   // ONE model request; several lines may share it
    "model": "claude-opus-4-8",
    "usage": {
      "input_tokens": 2,
      "cache_read_input_tokens": 32920,
      "cache_creation_input_tokens": 34801,
      "output_tokens": 692
      // …other keys exist and are ignored
    }
  }
}
```

Lines of every other `type` (`user`, `queue-operation`, `summary`, …) are not model requests and
are not skipped-with-a-count — they are simply not observations. Only a line that LOOKS like an
assistant request and cannot be used counts as skipped.

**Shape.** Export from `transcript-occupancy.ts`:

```ts
export interface OccupancyObservation {
  /** The model request's own id (`message.id`) — stable, and the ingest's identity seed. */
  readonly requestId: string;
  /** The request's ISO-8601 timestamp, carried through verbatim. */
  readonly at: string;
  /** Tokens RESIDENT in the window for this request: input + cache-read + cache-write. */
  readonly residentInputTokens: number;
  /** `message.model`, when the line declares one. Absent, never empty-string, when it does not. */
  readonly modelId?: string;
}

export interface TranscriptWindowRead {
  /** The host session id every usable line agreed on, or `undefined` when the file is unusable. */
  readonly windowId: string | undefined;
  /** Observations in the order the file recorded them. Empty when `windowId` is undefined. */
  readonly observations: readonly OccupancyObservation[];
  /** Assistant-shaped lines that could not be used (unparseable, truncated, no usable usage). */
  readonly skippedLines: number;
  /** Sidechain requests seen and deliberately excluded — reported, never silently dropped. */
  readonly sidechainRequests: number;
}

export function readTranscriptWindow(filePath: string): TranscriptWindowRead;
```

**Occupancy is a SUM, and it is the whole point.** `residentInputTokens` is
`input_tokens + cache_read_input_tokens + cache_creation_input_tokens` for that ONE request. It is
not `input_tokens`, and it is not accumulated across requests. Because `cache_read_input_tokens`
reports the resident context that was replayed from cache, this figure FALLS when the window is
compacted or a shorter prompt is sent — which is the property the whole increment exists for
(ADR-0248). A missing axis reads as 0; a NEGATIVE or non-integer axis makes the line unusable
(skipped and counted), never coerced.

**One request, not one line.** The harness may write several lines for one model request, all
carrying the same `message.id` and the same `usage`. The FIRST line for a `message.id` produces the
observation; later lines with that id are neither observations nor skips. Never dedupe by timestamp,
by position, or by usage equality — only by `message.id`.

**Sidechains are somebody else's window.** A line with `isSidechain: true` belongs to a spawned
subagent running its own independent context window (ADR-0235 clause 5), so it must not enter this
window's series. Count it in `sidechainRequests` — deduped by `message.id` like any other request —
so the omission is visible rather than silent.

**Never throws, always honestly partial (the ADR-0241 D5 posture).** A missing file, an unreadable
file, an empty file, a crash-truncated final line, a line that is not JSON, an assistant line with
no `message.usage` — none of these throw. A truncated or unparseable ASSISTANT-shaped line is
counted in `skippedLines` and the file's other observations still come back. `windowId` is
`undefined` — with `observations` empty — only when the file yields no usable line at all, or when
usable lines disagree about `sessionId`: an ambiguous window identity is refused rather than guessed
at, because every downstream event is keyed on it.

**Metadata only (ADR-0235 clause 6).** An `OccupancyObservation` carries exactly the four fields
above. No message text, no tool input or result, no thinking, no file path, no title, no
`cwd`, and no arbitrary passthrough of the source object.

**Fences.** Read-only: this module never writes a file. No `@storytree/drive` import (nothing in
this arc may make `drive` reach a traversal package), no zod dependency needed here, no clock, no
id generation, no environment reads (the caller supplies the path), no retention or pruning of any
kind, and no correlation logic — which file belongs to which storytree session is capability
`transcript-session-correlation`, not this one.

**Files.** `packages/context-traversal-transcript/src/transcript-occupancy.ts` and
`transcript-occupancy.test.ts`. The package scaffold already exists — add nothing to
`package.json`, and do not touch `src/index.ts`.

## Contracts

1. **`occupancy-is-the-per-request-resident-total`**
   - **asserts —** a fixture request with `input_tokens: 2`, `cache_read_input_tokens: 32_920`, and
     `cache_creation_input_tokens: 34_801` comes back with `residentInputTokens === 67_723`, read off
     the RETURNED observation; a request missing an axis treats it as 0; `modelId` is carried through
     when declared and the KEY is absent when it is not.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that returns `input_tokens` alone (2), against one
     that returns cache-read alone, and against one that returns the sum of ALL usage numbers
     including `output_tokens` — so the three axes are pinned by value, not by "some number came
     back". The absent-`modelId` half is asserted as key absence on
     `JSON.parse(JSON.stringify(observation))`, so `modelId: undefined` reds too.
2. **`the-occupancy-series-can-fall`**
   - **asserts —** a fixture whose four requests carry resident totals 100_000, 240_900, 228_100,
     239_800 comes back as exactly that series, in file order, and the returned series is NOT
     monotonically non-decreasing — asserted by finding an index where the value dropped.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that accumulates a running total (which can only
     rise), against one that returns a max-so-far, and against one that sorts the observations by
     value or by timestamp instead of preserving file order. This is the contract the whole increment
     rests on — the arc's approved reference trace recedes, and a quantity that cannot fall cannot
     draw its bar.
3. **`one-observation-per-request-not-per-line`**
   - **asserts —** a fixture in which three consecutive assistant lines share one `message.id` and
     one `usage` yields exactly ONE observation, and a fixture with three assistant lines carrying
     three DISTINCT `message.id`s and identical `usage` yields exactly THREE. `skippedLines` is 0 in
     both — a repeated line is not an error.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against a naive per-line reader (three from the first fixture), and against
     a deduper keyed on the usage numbers or on the timestamp (one from the second fixture).
4. **`subagent-requests-never-enter-the-parent-window`**
   - **asserts —** a fixture interleaving two `isSidechain: true` requests — one carrying a resident
     total larger than every parent request — among three parent requests returns exactly the three
     parent observations, in order, and reports `sidechainRequests === 2`.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that includes sidechain lines (the large value
     would appear in the series), and against one that excludes them SILENTLY by leaving
     `sidechainRequests` at 0 — the count is what makes the omission honest under ADR-0235 clause 6,
     so dropping it must be red, not invisible.
5. **`an-unusable-transcript-reads-partially-and-never-throws`**
   - **asserts —** four cases, each without throwing: (a) a path that does not exist returns
     `windowId: undefined`, no observations, and zero skips; (b) a file whose last line is
     crash-truncated mid-JSON returns every earlier observation AND `skippedLines >= 1`; (c) an
     assistant line with no `message.usage`, and one with a negative axis, are each counted in
     `skippedLines` while their siblings survive; (d) a file whose usable assistant lines carry TWO
     different `sessionId` values returns `windowId: undefined` with NO observations.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that throws on any of the four, against one that
     returns an empty read for the truncated file instead of its earlier observations, against one
     that reports `skippedLines: 0` for the malformed cases, and against one that resolves the
     ambiguous-identity file by taking the first, the last, or the most frequent `sessionId` — a
     guessed window identity is worse than none, because every event downstream is keyed on it.
6. **`no-transcript-content-reaches-an-observation`**
   - **asserts —** a fixture whose assistant lines carry canary prose in `message.content` text, in a
     tool-use input, in a tool result, in a `summary` line, and in the line's `cwd`, still yields
     observations whose full `JSON.stringify` of the entire `TranscriptWindowRead` does not contain
     the canary.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that spreads the source line into the observation,
     that keeps a `raw`/`message`/`metadata` passthrough, or that carries `cwd` through for the
     correlation capability's convenience — asserted over the stringified WHOLE result, so no
     nested survivor escapes.

## Integration evidence

`packages/context-traversal-transcript/src/transcript-occupancy.test.ts` writes each fixture
transcript into a fresh `fs.mkdtempSync(path.join(os.tmpdir(), …))` directory and removes it
afterwards, so nothing reads the developer's real `~/.claude/projects` and the suite is
deterministic in CI. Every assertion reads the `TranscriptWindowRead` the function RETURNED, never a
value the test composed, and the absent-key and no-content claims are made on the JSON round-trip so
they describe the shape a caller will actually serialize.
