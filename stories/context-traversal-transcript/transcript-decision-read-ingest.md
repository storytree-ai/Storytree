---
id: "transcript-decision-read-ingest"
tier: capability
story: context-traversal-transcript
arc: linked-session-context-arc
title: "Recovered decision reads become validated events in each session's own trace, idempotently"
outcome: "The decision reads recovered from every host transcript become validated traversal events in each session's own trace, idempotently, and a zero is reported as blindness rather than as silence."
status: mapped
proof_mode: integration-test
depends_on:
  [
    transcript-decision-read-extraction,
    transcript-session-correlation,
    transcript-occupancy-ingest,
  ]
decisions: [235, 241, 403]
# DELIVERED AND GREEN, BUT NOT SPINE-PROVEN — read this before treating the unit as adoptable.
# `packages/context-traversal-transcript/src/ingest-decision-reads.ts` and its 13-case companion suite
# exist at HEAD and pass under `pnpm --filter @storytree/context-traversal-transcript test`. They were
# landed by an ORDINARY hand-authored commit (e936eb17, "feat(traversal): recover the decision-record
# read history from host transcripts", under `adrs-into-the-dag-arc-inc-07`), NOT by a `--real` build.
# The planned red was therefore never observed by storytree's spine and NO SIGNED VERDICT BACKS THIS
# CAPABILITY. `status: mapped` records exactly that; `proposed` would falsely advertise a greenfield
# unit the spine is expected to drive.
#
# THERE IS DELIBERATELY NO `real:` ARM (ADR-0094), on the same ground as the sibling extractor:
# registering one would invite a net-new `--real` drive against files that already exist, whose
# CONFIRM_RED could only be manufactured — the theater ADR-0085 bans and ADR-0097 §2 re-affirms. The
# spec-borne `proof.command` below is the observing command; adoption OBSERVES it green (ADR-0085's
# brownfield route) rather than re-driving it.
#
# WHY `transcript-occupancy-ingest` IS A REAL EDGE AND NOT PADDING. Contract 9 asserts that this
# adapter's `adapterId` DIFFERS from the occupancy adapter's `HOST_TRANSCRIPT_COVERAGE.adapterId`,
# which the test imports from `./ingest-occupancy.js` — a trace refuses a duplicate `adapterId`, so
# that sibling's delivered outcome is a genuine precondition for this capability's own proof to pass.
# The runtime module itself does not import it; the edge is carried by the proof surface, and it is
# declared rather than left implicit because it is exactly the kind a later reader would otherwise
# mistake for an accident.
#
# This capability was MINTED, not built, by `linked-session-context-arc-inc-28`. No contract below
# invents an obligation: each states what a SHIPPED test already asserts.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-transcript", "test"]
  scope:
    testGlobs: ["packages/context-traversal-transcript/src/ingest-decision-reads.test.ts"]
    sourceGlobs: ["packages/context-traversal-transcript/src/ingest-decision-reads.ts"]
---

# Recovered decision reads become validated events in each session's own trace, idempotently

**Outcome —** The decision reads recovered from every host transcript become validated traversal
events in each session's own trace, idempotently, and a zero is reported as blindness rather than as
silence.

## Guidance

**What this capability owns.** `packages/context-traversal-transcript/src/ingest-decision-reads.ts` —
the batch sweep and its report. It composes three already-proven pieces and adds no matching of its
own: `collectTranscriptFiles` from `./correlate-transcripts.js` (the SAME walk, at the same depth
bound, that occupancy correlation uses), `scanTranscriptDecisionReads` from `./decision-reads.js` (the
sibling extractor), and `appendTraversalEvents` / `readTraversalSession` from
`@storytree/context-traversal-capture` — the durable local JSONL sink (ADR-0241). Every byte written
goes through that sink, so ADR-0241 D4's validate-before-write rule holds here for free. Neither
directory is resolved here: both are supplied by the caller, which is what keeps this module
HOME-independent and its tests deterministic.

**It is a BATCH ingest, and that is a property of the record.** Unlike `observeCliInvocation`, which
records as the command runs, this reads a file the harness wrote at some earlier moment. The trace is
therefore only as current as the last run of this ingest, and `renderDecisionReadIngest` says so on
its own face rather than letting a reader take the count for a live one.

**Why it sweeps every session at once.** `ingestTranscriptOccupancy` takes ONE session id, because
occupancy is something a live session asks about itself. This one is retroactive by construction: its
purpose is to recover the history back to 2026-06-08 across every worktree that ever ran, against an
arc grounding of ZERO recorded decision reads. So it derives the session from each line's own `cwd`
and writes into as many session traces as it finds.

**A zero is a VERDICT, not a silence.** The extractor beneath this one matched a FILE PATH, and
`docs/decisions/` was deleted whole on 2026-08-22 (ADR-0403 dec 1). From that commit it could only ever
return zero, and it returned it the same way it would have reported a genuinely quiet machine — the
third instance of one fault class on that migration. `DecisionReadIngestResult.blind` is the repair:
the sweep also counts the tool calls that NAMED a decision and yielded nothing, so
zero-reads-with-many-mentions is reported as an instrument out of date with its subject, and
`probe:decision-reads` exits non-zero on it rather than printing an empty table under a success
banner. The verdict is a TWO-TERM conjunction — zero reads AND at least one mention — and contracts 10
and 11 pin both terms, because either term alone gets one of the two zeros wrong.

**Idempotence is a property of the ids, not of run order.** The event id is deterministic
(`host-transcript-decision-read:<toolUseId>:<nodeId>`), the sweep reads the session's existing trace
first, and it appends only ids that are new — across FILES as well as across runs, so a tool call
appearing in two transcripts (the shape a resumed or forked session produces) is written once.

**Its coverage declaration is its own.** `DECISION_READ_COVERAGE` carries an `adapterId` distinct from
the occupancy adapter's, because a trace refuses a duplicate, and it partitions the closed
`CoverageFeature` vocabulary exhaustively so a future feature can never go silently unnamed.

**Fences that hold at HEAD.** No environment reads and no directory resolution. No clock and no
`randomUUID` in the event id. No direct filesystem write — everything goes through the sink. No
transcript CONTENT in the result or the report (ADR-0235 clause 6). It never throws and never fails a
caller closed (ADR-0241 D3): a missing transcript root, an unreadable trace directory, or a corpus with
no correlated read each return a result with zero appended.

## Contracts

Each contract id below is the lead token of the `test(...)` title that proves it in
`packages/context-traversal-transcript/src/ingest-decision-reads.test.ts`, per the house
`test("<contract-id>: <prose>")` convention.

1. **`the-sweep-writes-validated-events-into-each-sessions-own-trace`**
   - **asserts —** over a fixture of three transcript roots under two worktree cwds — including one
     nested at depth 3 under `parent/subagents/` and marked `isSidechain: true` — the sweep returns
     `extracted: 5`, a per-shape breakdown of `{ read: 2, grep: 1, shell: 1, cli: 1 }`, `appended: 5`,
     `sidechainReads: 1`, `distinctDecisions: 4`, the MINIMUM timestamp as `earliestAt`, and two
     session rows in sorted order. A fresh `readTraversalSession` then replays the first session's four
     events with `skipped: 0`, matching `[kind, nodeId, surfaceId]` triples exactly — every event
     `full_payload_read`, each shape carrying its own distinct `surfaceId`, the store-route read
     carrying the bare `adr-0405` and the file-route reads carrying `doc:decisions/…` — while the
     second session's trace holds exactly one event.
   - **falsifiability —** goes red against minting any other id form (the id strings are asserted
     verbatim, including that the store route mints `adr-0405` and NOT a `doc:` id), against dropping
     the sidechain read or attributing it to a session of its own instead of the parent's, against a
     walk too shallow to reach the depth-3 transcript, against writing every session into one trace
     file, against emitting a kind other than `full_payload_read` or a shared `surfaceId`, against
     double-counting the decision read by two sessions in `distinctDecisions`, and against an
     `earliestAt` taken from the last line rather than the minimum. A sink validation failure surfaces
     as a non-zero `skipped`.
2. **`re-ingesting-appends-nothing-to-the-bytes-on-disk`**
   - **asserts —** a second sweep over unchanged directories still reports `extracted: 5` — nothing is
     forgotten — but `appended: 0`, and the session trace file's raw BYTES are identical to the string
     captured after the first run, with the replayed event count unchanged at four.
   - **falsifiability —** the BYTE assertion is the one that carries this contract, and the
     event-count assertion alone must not be able to satisfy it: an implementation that appends
     duplicates and leans on the sink's tolerant reader to skip them reports the same event count while
     the file silently doubles. Also red against suppressing EXTRACTION rather than the write (so
     `extracted` collapses to 0), against any non-deterministic event id, and against a re-run that
     rewrites or normalises the file in place.
3. **`a-tool-call-seen-in-two-transcripts-is-written-once`**
   - **asserts —** one identical tool-call line written verbatim into TWO transcript files — the shape
     a resumed or forked session produces — is counted and written ONCE: `scannedFiles: 2` (both files
     genuinely walked), `extracted: 1`, `appended: 1`.
   - **falsifiability —** goes red against de-duplicating only within a single file, or only against
     the on-disk trace at append time while still counting both occurrences (`extracted: 2`), against
     de-duplicating by whole-line or file identity rather than by tool-call id plus node id
     (`appended: 2`), and against "fixing" it by skipping the second file — `scannedFiles: 2` pins that
     both were read.
4. **`a-dry-run-writes-not-one-byte`**
   - **asserts —** a dry run reports the same full extraction, reports `appended: 0`, echoes
     `dryRun: true` on the result, and leaves the session trace file NON-EXISTENT on disk.
   - **falsifiability —** the assertion is filesystem EXISTENCE, not content, so it goes red against
     any write path at all under dry run — merely creating or touching the file, or calling the sink
     with an empty array in a way that creates it. Also red against a dry run that short-circuits
     extraction, against reporting the would-be appends in `appended`, and against not surfacing the
     flag on the result.
5. **`a-sweep-that-finds-nothing-is-an-honest-empty-answer`**
   - **asserts —** a corpus holding one real tool call that names no decision record returns
     `scannedFiles: 1`, `extracted: 0`, an EMPTY `sessions` array, and `earliestAt` strictly
     `undefined`. It is an answer, not a crash, and it writes no trace file.
   - **falsifiability —** goes red against throwing on a corpus with no matches, against creating a
     zero-valued `sessions` row merely because a tool call was attributable, against a placeholder or
     epoch string for `earliestAt` instead of `undefined`, against matching an ordinary source path as
     a decision read, and against not walking the file at all.
6. **`the-reached-blind-spots-are-sized-on-the-result`**
   - **asserts —** the blind spots the sweep REACHED are sized on the result rather than swallowed: a
     read whose cwd is the PRIMARY CHECKOUT (which `deriveIdentity()` rule 3 refuses) contributes
     `uncorrelatedReads: 1` and no extraction, and a `git show <rev>:<path>` segment contributes
     exactly `declinedShellVerbs: [{ verb: "git", segments: 1 }]` — so a lobby-heavy or git-heavy
     history cannot read as a complete one.
   - **falsifiability —** goes red against attributing the lobby read to some session, against
     discarding it without sizing it, against scraping `git show` as a real read, against keying the
     declined verb as anything but the bare `"git"`, and — the arrays are compared whole — against any
     extra entry.
7. **`the-report-bounds-its-own-claim-as-a-floor`**
   - **asserts —** the rendered report states on its own face that the count is a FLOOR and not a
     census, that it is a BATCH ingest only as fresh as this run, that a read count is NOT a
     sufficiency measure, and what was REACHED AND NOT RECORDED; it names the `doc:decisions/NNNN-slug.md`
     id form and prints the per-shape breakdown with its exact counts and ordering. It then asserts
     that EVERY string in the exported `DECISION_READ_OMISSIONS` array appears verbatim in the output.
   - **falsifiability —** goes red against abbreviating, truncating, re-wrapping or conditionally
     omitting any single omission entry — each is an exact substring, so even reflowing a multi-line
     one breaks it — against dropping the floor / batch / sufficiency caveats or the sized
     not-recorded block when the numbers happen to look good, and against changing the breakdown line's
     counts, order, or its qualifying parentheticals.
8. **`a-dry-run-says-so-in-its-first-line`**
   - **asserts —** the report of a dry run declares itself on line ZERO — the split output's first
     element carries the dry-run marker — so a report cannot be mistaken for a record that was written.
   - **falsifiability —** goes red against rendering the marker anywhere else (a trailing footer, a
     second line, or a blank leading line all fail) and against not distinguishing dry-run output from
     a real-record header at all.
9. **`the-adapter-declares-exhaustive-coverage-under-a-distinct-adapter-id`**
   - **asserts —** `ContextTraversalCoverage.parse(DECISION_READ_COVERAGE)` succeeds under a second,
     independent parse; its `adapterId` is NOT EQUAL to the occupancy adapter's
     `HOST_TRANSCRIPT_COVERAGE.adapterId`, since a trace refuses a duplicate; `supported` is exactly
     the four features this adapter can observe, sorted and compared whole; and `omitted` includes the
     candidate-set, followed-edge and follow-causality features it cannot.
   - **falsifiability —** goes red against reusing the occupancy adapter's id — the sharing failure a
     trace would refuse — against adding or removing any `supported` member, notably dropping the
     front-matter-read feature while the store route can still emit it via `--raw <field>`, and against
     claiming causality this adapter cannot observe. The re-parse also reds if a new `CoverageFeature`
     lands unnamed by the partition, so a vocabulary addition cannot silently widen the honest-coverage
     claim.
10. **`a-zero-against-mentions-is-reported-as-BLINDNESS`**
    - **asserts —** a sweep that reads every file and recovers nothing from transcripts full of
      decision talk is a VERDICT: `scannedFiles: 1` (the walk succeeded — this is not an empty-root
      failure), `extracted: 0`, `decisionMentions: 2`, and `blind: true`; and the rendered report warns
      that the extractor may be blind and marks the result UNVERIFIED.
    - **falsifiability —** goes red against computing `blind` from zero reads alone — treating a dead
      instrument as a quiet machine, the exact defect that survived the `docs/decisions/` deletion —
      against failing to count the two decision-naming calls, against manufacturing reads from
      `adr list` / `adr new` / an echoed id, and against a report that prints a bare zero without the
      warning and the qualifier.
11. **`a-zero-against-no-mentions-is-an-honest-quiet-answer`**
    - **asserts —** the OTHER zero stays a real answer: a transcript holding one ordinary source read
      yields `extracted: 0`, `decisionMentions: 0`, `blind: false`, and a report carrying no blindness
      warning. A machine with no decision traffic is not a broken instrument.
    - **falsifiability —** goes red against defining `blind` as `extracted === 0` alone, which cries
      blindness here; against over-counting mentions from an ordinary source read, which would flip the
      verdict; and against a renderer that prints the warning unconditionally. With contract 10 this
      pins the conjunction from BOTH sides — neither term alone satisfies both cases.
12. **`a-recovered-read-clears-the-blind-verdict-without-certifying-completeness`**
    - **asserts —** one recovered read is enough to rule out total blindness (`blind: false`, and the
      report names the recovered count), and the SAME output still carries the floor caveat and the
      statement that a mention is a denominator and never a target to drive to zero. Ruling out
      blindness certifies nothing more.
    - **falsifiability —** goes red against reporting blindness when reads were recovered, against a
      not-blind line missing or misstating the count, and — the substantive half — against a renderer
      that treats "not blind" as a clean bill of health and suppresses the floor caveats.
13. **`the-store-route-declines-are-sized-apart-from-the-shell-declines`**
    - **asserts —** a `storytree` invocation that reached the decision log and minted no read is
      counted on its OWN line, apart from the shell declines: `declinedCliVerbs` is exactly the
      two-word `adr list` entry while `declinedShellVerbs` is exactly the `git` entry, and the report
      carries a dedicated line for the store-route count.
    - **falsifiability —** goes red against folding the store-route declines into the shell list —
      which would report `adr list` under the "NAMED a decision record" heading, a false claim — or the
      reverse; against keying the cli decline as anything but the two-word verb; against either array
      picking up an extra entry, since both are compared whole; and against a report that omits the
      dedicated store-route line.

## Integration evidence

`packages/context-traversal-transcript/src/ingest-decision-reads.test.ts` writes every fixture into a
unique `fs.mkdtempSync` transcript directory and ingests into a unique `fs.mkdtempSync` trace
directory — never the real `~/.claude/projects` and never the real `~/.storytree/traces` — then reads
the trace back through a BRAND-NEW `readTraversalSession` call. Nothing in-process is shared between
"ingest" and "verify", so these prove durability through the real sink rather than through an
in-memory shortcut. The suite runs offline with no DB, no API key and no model, under
`pnpm --filter @storytree/context-traversal-transcript test`.

The assertions are written against the three ways this work fails while LOOKING finished: it mints the
wrong node id (so the reads close no caveat), it double-counts on a second run (so the record inflates
every time anyone runs it), or it reports a floor as a census (so a reader draws a conclusion the data
cannot carry). Each has a contract above that goes red on it, and the idempotence contract asserts on
BYTE LENGTH rather than on a replayed count precisely because the tolerant reader would hide the
doubling.

**No signed verdict backs this capability.** The suite is green and observed by the command above, but
it was never driven red→green by the spine (see the frontmatter note). Any adoption must OBSERVE the
command green under ADR-0085's brownfield route; it must not manufacture a red against files that
already exist.
