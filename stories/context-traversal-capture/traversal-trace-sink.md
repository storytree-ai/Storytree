---
id: "traversal-trace-sink"
tier: capability
story: context-traversal-capture
arc: linked-session-context-arc
title: "A traversal trace survives process exit and reads back honestly partial"
outcome: "An event appended in one process replays in another through a tolerant reader that counts every line it could not use — locally at once, and in the shared store shortly after, without either write ever being on a command's own path."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [235, 241, 484]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs:
      [
        "packages/context-traversal-capture/src/sink.test.ts",
        "packages/context-traversal-capture/src/store/*.test.ts",
      ]
    sourceGlobs:
      [
        "packages/context-traversal-capture/src/sink.ts",
        "packages/context-traversal-capture/src/store/traversal-event-store.ts",
        "packages/context-traversal-capture/src/store/ship.ts",
      ]
  # The READ-ONLY coverage surface (ADR-0353): where the contract tests actually live, which for
  # contracts 5-13 is the store subtree rather than the signed `real.testFile` beside it. Declared
  # here rather than widened into `real.scope`, because the real arm is a WRITE FENCE for a `--real`
  # drive and this is a statement about where proof is READ from.
  coverage:
    testGlobs:
      - "packages/context-traversal-capture/src/store/traversal-event-store.test.ts"
      - "packages/context-traversal-capture/src/store/ship.test.ts"
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

**A line also carries WHAT ITS `sessionId` NAMES** (since 2026-08-22,
`linked-session-context-arc-inc-30`). `appendTraversalEvents` accepts an optional `grade`
(`window` | `declared`) and `slot`, and stamps them on EVERY line as additive siblings of `event` —
`{"v":1,"event":{…},"grade":"window","slot":"<worktree>"}`. Siblings rather than a `v` bump on
purpose: they describe the line's identity, not any event's shape, so the event vocabulary is
untouched, existing traces stay fully readable, and an older reader still accepts a newer line. The
reader returns the session's classification (`identity`) and the distinct `slots` it saw, computed
only from lines it actually USED — a skipped line vouches for nothing. **An ungraded line is a
LEGACY SLOT-ERA line and is labelled, never retrofitted**: nothing on disk records which window
wrote it.

**THE TRACE ALSO REACHES A SHARED STORE, AND THE LOCAL FILE IS STILL THE DURABLE ONE** (ADR-0484
D1/D4, since 2026-08-30). ⚠ The fence that stood here — *"no shared-database path"* — is WITHDRAWN;
it is the clause ADR-0484 D1 reverses, and the reversal is recorded there rather than left to drift.
What has NOT changed is everything the fence was protecting, so read the replacement precisely:

- `packages/context-traversal-capture/src/store/traversal-event-store.ts` is the Postgres
  implementation of the SAME append/read/list seam, which is exactly what ADR-0241 D8 said the seam
  existed for. No caller of the capture path changed to make it exist, and it builds no pool of its
  own — the caller injects one, as the caller has always injected the session identity (D9).
- `packages/context-traversal-capture/src/store/ship.ts` is the path between them, and its shape is
  **durable local write, then asynchronous ship**. The event is on disk before the command returns;
  a DETACHED, throttled process drains it afterwards. **A command never waits on the database and
  never fails because of the log** — the original "no await on a network or DB call" fence, intact,
  and the reason a bare read must not start opening a pool to write telemetry.
- **A failure to ship is not swallowed.** ADR-0484 D4 withdrew *"the trace is a courtesy"* as too
  weak while keeping *"it must not block operations"*. A failed ship leaves the cursor unadvanced
  and records why, so `storytree traversal backlog` can say how many events are waiting and since
  when — *"we have no data"* stays distinguishable from *"nothing happened"*.
- **NOTHING BACKFILLS (ADR-0484 D6, owner-directed).** `ensureShipBaseline` stamps a session's
  cursor at the trace file's CURRENT END the first time the capture path appends after the landing,
  and a session with no cursor is skipped by the sweep entirely. Two stores is the accepted end
  state, not a transitional one to be resolved.

**Fences that stand unchanged.** No retention, rotation, eviction, compaction, pruning, or size cap
— traces are deliberately unbounded (ADR-0241 D7); a "helpful" trim would destroy the long-session
evidence this arc exists to gather. No await on a network or DB call on the capture path: that code
runs on every CLI invocation. Every proof runs against a temporary directory and must never depend
on the real `HOME`, and no proof here needs a database.

Files: `packages/context-traversal-capture/src/sink.ts`, `src/store/traversal-event-store.ts` and
`src/store/ship.ts` with their suites, plus the package scaffold (`package.json`, `tsconfig.json`,
`src/index.ts`, `src/store/index.ts`). Give the package a `test` script or `pnpm -r test` will never
run it.

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

The shared-store half (ADR-0484). Contracts 5-8 run through the PARITY SUITE, which drives BOTH
backends — the JSONL sink and `PgTraversalEventStore` — through one set of assertions, so "the
Postgres store is the same seam" is proven rather than asserted in a header.

5. **`appended-events-replay-in-a-fresh-read`**
   - **asserts —** for EACH backend, events appended through `TraversalEventStore.append` are read
     back by `read` in append order under their own session, with `skipped` at zero.
   - **falsifiability —** goes red against a Postgres `read` that orders by the event's own
     timestamp rather than by `seq`: append order is the only "earlier" this producer may know
     (ADR-0235), so a trace whose clock went backwards would make the two backends disagree about
     what its history was.
6. **`invalid-events-never-reach-the-store`** and **`a-duplicate-identity-is-skipped-and-counted-never-thrown-on`**
   - **asserts —** for EACH backend, an event failing `ContextTraversalEvent` is dropped by
     `TraversalEventStore.append` while its siblings still land, and a repeated identity replays once
     through `read` rather than throwing — the tolerance ADR-0241 D4/D5 require, held over ROWS
     exactly as over lines.
   - **falsifiability —** goes red against a `PgTraversalEventStore.read` that lets a row whose
     payload no longer parses reach the in-memory trace, which THROWS on it — turning a query
     command into a crash, which is the specific outcome D5 exists to prevent.
7. **`a-reship-of-already-landed-rows-adds-nothing`**
   - **asserts —** appending the same batch twice through `PgTraversalEventStore.append` leaves the
     store holding it once.
   - **falsifiability —** goes red the moment `ON CONFLICT (event_id) DO NOTHING` is dropped. This
     is what makes the retry safe to be as simple as it is: a ship that failed AFTER the database
     committed part of a batch re-sends those rows on its next attempt, and without the clause every
     recovery would double a session's history.
8. **`a-write-the-pool-refuses-returns-false-and-never-throws`**
   - **asserts —** `PgTraversalEventStore.append` answers `false` for a write the pool rejects, and
     `read`/`list` answer empty rather than throwing when the pool rejects a SELECT.
   - **falsifiability —** goes red against a store that propagates a driver error into its caller.
     `false` is load-bearing in BOTH directions: telemetry never changes a caller's control flow
     (ADR-0241 D3), and the shipper needs an answer it can turn into a reportable backlog rather
     than a swallowed success (ADR-0484 D4).
9. **`the-baseline-is-the-files-current-end-so-history-is-never-backfilled`**
   - **asserts —** given a trace holding three pre-landing events, the first capture after the
     landing stamps `ensureShipBaseline` and only the FOURTH event ships; the three stay on disk.
     Its companion asserts that a session with no cursor is not in `shippableSessions` at all.
   - **falsifiability —** goes red against a shipper that baselines an unseen session at zero on its
     first sweep — which would silently perform the migration ADR-0484 D6 declined, and do it in the
     direction that looks like success.
10. **`a-ship-that-fails-leaves-the-cursor-unadvanced-and-records-why`**
    - **asserts —** a refused ship advances no offset, increments `consecutiveFailures`, records
      `lastError` and leaves `lastShippedAt` absent; when the store recovers, the SAME bytes ship and
      the failure state clears.
    - **falsifiability —** goes red against a cursor advanced before the store confirmed — the shape
      that loses events silently — and against a "successful" retry that shipped nothing because the
      offset had already moved past the bytes.
11. **`an-unusable-line-is-counted-and-stepped-past-never-wedging-the-queue-behind-one-bad-byte`** and
    **`a-crash-truncated-final-line-is-left-for-the-next-attempt-never-shipped-half-parsed`**
    - **asserts —** a garbage line is counted as `unshippable` and the cursor clears it, while an
      unfinished final line (no trailing newline) is neither shipped nor counted, and IS shipped once
      the writer completes it.
    - **falsifiability —** the two fail in opposite directions and are asserted together for that
      reason: stopping on the bad line wedges every later event behind one corrupt byte forever,
      while consuming the partial line loses the event that was mid-write. A single case could be
      satisfied by an implementation that gets the other one wrong.
12. **`the-backlog-reports-how-many-and-since-when-and-which-sessions-are-failing`**
    - **asserts —** `traversalShipBacklog` reports the tracked session count, the total unshipped
      events, the oldest unshipped event's `at`, the waiting sessions and — separately — the FAILING
      ones with the reason their last attempt gave.
    - **falsifiability —** goes red against a report that folds failing sessions into "waiting",
      which is the collapse ADR-0484 D4 names: a session that cannot ship reads exactly like a
      session that has nothing to say. The empty-backlog case is asserted beside it so the figures
      are not vacuously zero.
13. **`the-throttle-is-per-machine-and-keyed-on-the-attempt`**
    - **asserts —** `shouldAttemptShip` is true before any attempt, false at the boundary minus one
      millisecond, and true again at the window; `hasUnshippedEvents` is false for a session with no
      cursor and true for one with unshipped bytes.
    - **falsifiability —** goes red against a throttle keyed on SUCCESS, which would let an
      unreachable database spawn a shipper per invocation, and against a trigger that wakes for
      pre-landing history — the two ways this could become expensive on the command's own path.
14. **`the-ship-trigger-fires-only-when-every-rule-passes`**
    - **asserts —** `shouldStartShip` answers TRUE for an ordinary invocation with something to ship,
      and FALSE on each rule INDEPENDENTLY: no session identity, this process already being the
      shipper, capture off, an overridden `STORYTREE_TRAVERSAL_DIR`, a session carrying no cursor,
      and the throttle window — which reopens once it has passed. A companion asserts the guard and
      `resolveTraversalDir` name the SAME environment variable.
    - **falsifiability —** the affirmative case is the load-bearing half: without it every refusal is
      equally consistent with a trigger that never fires, which would leave the shared log
      permanently empty while every negative assertion passed. The cross-module case goes red if the
      guard and the sink drift onto different variable names — the shape where both halves keep
      working alone and the trigger silently sweeps a directory a caller redirected.

## Integration evidence

`packages/context-traversal-capture/src/sink.test.ts` exercises append and read over a temporary
directory with an explicit `sessionId` (never the real `HOME`), constructing a fresh reader per
assertion so durability is proven across instances rather than within one object. The
duplicate/malformed/truncated/unknown-`v` fixtures are written as raw file content so the reader is
held to real on-disk shapes, and the metadata-only and refusal contracts assert on the file text.

`src/store/traversal-event-store.test.ts` runs the ONE parity suite against both backends and then
the cases that belong to the Postgres one alone. Its double is an in-memory TABLE, not the house
canned-row fake, and the choice is argued in the helper's header: this store's interesting behaviour
is what a caller gets BACK after appending, so a canned-row fake would answer the parity suite's
questions with values the test itself supplied — an expectation derived from its own subject. What
the double cannot vouch for is the DDL and the driver; that half is proven END TO END through the
CLI against the live store and recorded on the increment, rather than by a live suite here, because
a live suite would need `@storytree/library/store` and this package's narrow dependency set is
itself a decision (ADR-0241 D9).

`src/store/ship.test.ts` drives the whole local-durable-then-ship path over temporary directories
with an injected clock, so a cursor's timestamps are assertable rather than merely present. Its
cases are the ones the JSONL sink never had — a ship that fails and retries, a backlog that is
reported rather than hidden, a command that completes normally with no database at all — plus the
one this landing must not get wrong in the other direction: that nothing backfills. Every figure it
asserts is paired with a control (an empty backlog, a second ship that touches the store zero times)
so no assertion rests on a number that cannot move. No test here opens a database.
