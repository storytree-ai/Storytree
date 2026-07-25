---
id: "traversal-trace-sink"
tier: capability
story: context-traversal-capture
arc: linked-session-context-arc
title: "A traversal trace survives process exit and reads back honestly partial"
outcome: "An event appended in one process replays in another through a tolerant reader that counts every line it could not use."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [235, 241]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/sink.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/sink.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/sink.test.ts"
    sourceFile: "packages/context-traversal-capture/src/sink.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/sink.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/sink.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# A traversal trace survives process exit and reads back honestly partial

## Guidance

Author the durable sink in the story-owned `packages/context-traversal-capture` package as the narrow
append/read/list seam ADR-0241 D8 requires, so a Postgres-backed implementation can replace it later
without touching a caller.

**Shape.** `appendTraversalEvents(events, { dir, sessionId })` writes SYNCHRONOUSLY, one JSON object
per line, each line `{"v":1,"event":{…}}` and `\n`-terminated. `readTraversalSession({ dir,
sessionId })` returns `{ replay, skipped }`, where `replay` comes from increment 1's
`createContextTraversalTrace()`. `listTraversalSessions({ dir })` enumerates the captured sessions
with their event counts and last-observed time. Directory resolution is a separate exported helper:
`STORYTREE_TRAVERSAL_DIR` when set, else `~/.storytree/traces` — env always wins, the
`STORYTREE_SECRETS_FILE` precedent (ADR-0241 D1). Capture is off when `STORYTREE_TRAVERSAL=off`
(ADR-0241 D2).

**Validation happens before the bytes.** Every event parses through increment 1's
`ContextTraversalEvent` vocabulary BEFORE it reaches the file. This is what makes ADR-0235 clause 6's
metadata-only rule a claim about bytes on disk rather than about a parsed object in memory (ADR-0241
D4), and it is asserted that way: the proof reads the file back as text.

**Reads are tolerant and honestly partial (ADR-0241 D5).** A line that is malformed, truncated,
carries an unknown `v`, or repeats an identity already seen is SKIPPED and COUNTED — never thrown on,
never silently discarded. This matters because increment 1's in-memory
`createContextTraversalTrace().append()` THROWS on a duplicate `eventId`/`visitId`: a crash-duplicated
line must not turn a query command into a crash. Tolerate a trailing `\r` and a final partial line
(a crash mid-write is the normal case, not an exception).

**Identity is supplied, never derived here (ADR-0241 D9).** The sink takes `sessionId` as an
argument. It must NOT import `@storytree/drive` for `deriveIdentity()` — the caller resolves identity,
which keeps this package's runtime dependencies to zod plus increment 1's vocabulary and leaves a
future spawned-agent adapter a seam to inherit a parent session id.

**Fences.** No retention, rotation, eviction, compaction, pruning, or size cap — traces are
deliberately unbounded (ADR-0241 D7); a "helpful" trim would destroy the long-session evidence this
arc exists to gather. No shared-database path. No await on a network or DB call: this code runs on
every CLI invocation. Every proof runs against a temporary directory and must never depend on the
real `HOME`.

Files: `packages/context-traversal-capture/src/sink.ts` and `sink.test.ts`, plus the package scaffold
(`package.json`, `tsconfig.json`, `src/index.ts`). Give the package a `test` script or `pnpm -r test`
will never run it.

## Contracts

1. **`appended-events-replay-in-a-fresh-reader`**
   - **asserts —** events appended in one call are returned in chronological order under one
     `sessionId` by a FRESH reader over the same directory, with no shared in-process state between
     writer and reader — the durability-across-instances assertion increment 1 could not make.
2. **`tolerant-read-skips-and-counts-bad-lines`**
   - **asserts —** a trace file containing a duplicate-identity line, a truncated/garbage line, and a
     line with an unknown `v` still returns every good event with a non-zero `skipped` count and never
     throws; a trailing `\r` and a final partial line are tolerated.
3. **`append-creates-its-directory-and-never-throws`**
   - **asserts —** appending into a missing directory creates it and succeeds; appending to an
     unwritable target returns false rather than throwing, so no capture failure can propagate into a
     caller's control flow.
4. **`invalid-events-never-reach-the-bytes`**
   - **asserts —** an event that fails the increment-1 vocabulary is never written — asserted by
     reading the file's BYTES as text, not by inspecting the return value.

## Integration evidence

`packages/context-traversal-capture/src/sink.test.ts` exercises append and read over a temporary
directory with an explicit `sessionId` (never the real `HOME`), constructing a fresh reader per
assertion so durability is proven across instances rather than within one object. The
duplicate/malformed/truncated/unknown-`v` fixtures are written as raw file content so the reader is
held to real on-disk shapes, and the metadata-only and refusal contracts assert on the file text.
