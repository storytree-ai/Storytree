/**
 * The decision-record read INGEST (`ingest-decision-reads.ts`), story
 * `context-traversal-transcript`, capability `transcript-decision-read-ingest`.
 *
 * Every fixture writes real transcript JSONL into a unique temporary directory (never the real
 * `~/.claude/projects`) and ingests into a unique temporary trace directory (never the real
 * `~/.storytree/traces`), then reads the trace back through a brand-new `readTraversalSession`
 * call — nothing in-process is shared between "ingest" and "verify", so these prove durability
 * through the real sink rather than an in-memory shortcut.
 *
 * The assertions are written against the three ways this work fails while LOOKING finished: it
 * mints the wrong node id (so the reads close no caveat), it double-counts on a second run (so the
 * record inflates every time anyone runs it), or it reports a floor as a census (so a reader draws
 * a conclusion the data cannot carry). Each has a test that goes red on it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readTraversalSession } from "@storytree/context-traversal-capture";
import {
  ContextTraversalCoverage,
  traversalProvenanceOf,
} from "@storytree/context-traversal-telemetry";

import { DECISION_READ_SURFACES } from "./decision-reads.js";
import { readHarnessIngestReceipt, recordHarnessIngestRun } from "./ingest-receipt.js";
import { HOST_TRANSCRIPT_COVERAGE } from "./ingest-occupancy.js";
import {
  DECISION_READ_COVERAGE,
  DECISION_READ_OMISSIONS,
  ingestDecisionReads,
  renderDecisionReadIngest,
} from "./ingest-decision-reads.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ingest-decision-reads-${prefix}-`));
}

function worktreeCwd(sessionId: string): string {
  return `/home/dev/code/storytree/.claude/worktrees/${sessionId}`;
}

interface ToolUseOpts {
  readonly cwd: string;
  readonly timestamp: string;
  readonly toolUseId: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly isSidechain?: boolean;
}

function toolUseLine(opts: ToolUseOpts): string {
  return JSON.stringify({
    type: "assistant",
    cwd: opts.cwd,
    sessionId: "host-window-uuid",
    timestamp: opts.timestamp,
    isSidechain: opts.isSidechain ?? false,
    message: {
      id: `msg_${opts.toolUseId}`,
      content: [{ type: "tool_use", id: opts.toolUseId, name: opts.name, input: opts.input }],
    },
  });
}

function writeTranscript(filePath: string, lines: readonly string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

/** A transcript root holding one parent window and one SUBAGENT window nested three levels down —
 * the depth `collectTranscriptFiles` reaches and a depth-1 walk would miss entirely. */
function twoWindowFixture() {
  const transcriptDir = freshDir("transcripts");
  const traceDir = freshDir("trace");
  const cwd = worktreeCwd("agent-alpha");

  writeTranscript(path.join(transcriptDir, "C--code-storytree", "parent.jsonl"), [
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:20:23.863Z",
      toolUseId: "toolu_p1",
      name: "Read",
      input: { file_path: "C:\\code\\storytree\\.claude\\worktrees\\agent-alpha\\docs\\decisions\\0403-a.md" },
    }),
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:24:00.000Z",
      toolUseId: "toolu_p2",
      name: "Bash",
      input: { command: "cd /repo && cat docs/decisions/0139-c.md" },
    }),
    // THE STORE ROUTE, and the reason this fixture is not written wholly in the old shape: every
    // read above names a file, and `docs/decisions/` was deleted on 2026-08-22. A fixture carrying
    // only those keeps passing forever over an extractor that can no longer see a real read — which
    // is exactly how this module's own defect survived the migration that caused it.
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:26:00.000Z",
      toolUseId: "toolu_p3",
      name: "Bash",
      input: { command: "pnpm storytree library artifact adr-0405 --pg 2>&1 | head -30" },
    }),
  ]);

  writeTranscript(
    path.join(transcriptDir, "C--code-storytree", "parent", "subagents", "explorer.jsonl"),
    [
      toolUseLine({
        cwd,
        timestamp: "2026-06-08T01:22:00.000Z",
        toolUseId: "toolu_s1",
        name: "Grep",
        input: { pattern: "status", path: "docs/decisions/0223-b.md" },
        isSidechain: true,
      }),
    ],
  );

  // A DIFFERENT session's worktree, so the sweep is proved to write more than one trace.
  writeTranscript(path.join(transcriptDir, "C--code-storytree", "other.jsonl"), [
    toolUseLine({
      cwd: worktreeCwd("agent-beta"),
      timestamp: "2026-07-01T09:00:00.000Z",
      toolUseId: "toolu_b1",
      name: "Read",
      input: { file_path: "docs/decisions/0403-a.md" },
    }),
  ]);

  return { transcriptDir, traceDir };
}

test("the-sweep-writes-validated-events-into-each-sessions-own-trace: the sweep writes validated full_payload_read events, keyed on doc:decisions/NNNN-slug.md, into EACH session's own trace — subagent reads included, under the parent's identity", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const result = ingestDecisionReads({ traceDir, transcriptDir });

  assert.equal(result.extracted, 5);
  assert.deepEqual(result.byShape, { read: 2, grep: 1, shell: 1, cli: 1 });
  assert.equal(result.appended, 5);
  assert.equal(result.sidechainReads, 1, "the subagent read is kept, not dropped");
  assert.equal(result.distinctDecisions, 4);
  assert.equal(result.earliestAt, "2026-06-08T01:20:23.863Z");
  assert.deepEqual(
    result.sessions.map((session) => [session.sessionId, session.extracted, session.appended]),
    [
      ["agent-alpha", 4, 4],
      ["agent-beta", 1, 1],
    ],
  );

  // Read the bytes back through a fresh sink call — this is the durability proof.
  const alpha = readTraversalSession({ dir: traceDir, sessionId: "agent-alpha" });
  assert.equal(alpha.skipped, 0);
  assert.deepEqual(
    alpha.replay.events.map((event) => [
      event.kind,
      "nodeId" in event ? event.nodeId : undefined,
      "surfaceId" in event ? event.surfaceId : undefined,
    ]),
    [
      ["full_payload_read", "doc:decisions/0403-a.md", "host-transcript-file-read"],
      ["full_payload_read", "doc:decisions/0223-b.md", "host-transcript-grep"],
      ["full_payload_read", "doc:decisions/0139-c.md", "host-transcript-shell"],
      // The store route mints the ARTIFACT id, on its own surface. Both spellings are the corpus's
      // own pointer form for the route that reached it: `offerIdOf()` passes a `doc:` ref through
      // and prints `asset:adr-0405` with the scheme stripped, so each joins to the offer it answers.
      ["full_payload_read", "adr-0405", "host-transcript-cli-read"],
    ],
    "the id form is the corpus's own pointer form — anything else joins to no offer and closes nothing",
  );

  const beta = readTraversalSession({ dir: traceDir, sessionId: "agent-beta" });
  assert.equal(beta.replay.events.length, 1);
});

test("re-ingesting-appends-nothing-to-the-bytes-on-disk: re-ingesting appends NOTHING and does not double the bytes on disk — idempotence is a property of the ids, not of run order", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const first = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(first.appended, 5);
  const afterFirst = fs.readFileSync(path.join(traceDir, "agent-alpha.jsonl"), "utf8");

  const second = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(second.extracted, 5, "the same reads are still EXTRACTED — nothing is forgotten");
  assert.equal(second.appended, 0, "and none of them is written a second time");

  const afterSecond = fs.readFileSync(path.join(traceDir, "agent-alpha.jsonl"), "utf8");
  assert.equal(afterSecond, afterFirst, "the file is byte-identical after the second run");
  assert.equal(readTraversalSession({ dir: traceDir, sessionId: "agent-alpha" }).replay.events.length, 4);
});

test("a-tool-call-seen-in-two-transcripts-is-written-once: a tool call that appears in TWO transcript files — the shape a resumed or forked session produces — is counted and written ONCE", () => {
  const transcriptDir = freshDir("forked");
  const traceDir = freshDir("forked-trace");
  const line = toolUseLine({
    cwd: worktreeCwd("agent-fork"),
    timestamp: "2026-06-09T10:00:00.000Z",
    toolUseId: "toolu_shared",
    name: "Read",
    input: { file_path: "docs/decisions/0403-a.md" },
  });
  writeTranscript(path.join(transcriptDir, "proj", "original.jsonl"), [line]);
  writeTranscript(path.join(transcriptDir, "proj", "resumed.jsonl"), [line]);

  const result = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(result.scannedFiles, 2, "both files were read");
  assert.equal(result.extracted, 1, "and the duplicated call was counted once");
  assert.equal(result.appended, 1);
});

test("a-dry-run-writes-not-one-byte: a dry run reports the same extraction and writes not one byte", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const dry = ingestDecisionReads({ traceDir, transcriptDir, dryRun: true });
  assert.equal(dry.extracted, 5);
  assert.equal(dry.appended, 0);
  assert.equal(dry.dryRun, true);
  assert.equal(fs.existsSync(path.join(traceDir, "agent-alpha.jsonl")), false, "no trace file was created");
});

test("a-sweep-that-finds-nothing-is-an-honest-empty-answer: a sweep that finds no decision read at all is an honest empty answer, not a crash and not a trace file", () => {
  const transcriptDir = freshDir("empty");
  const traceDir = freshDir("empty-trace");
  writeTranscript(path.join(transcriptDir, "proj", "w.jsonl"), [
    toolUseLine({
      cwd: worktreeCwd("agent-none"),
      timestamp: "2026-06-08T01:20:00.000Z",
      toolUseId: "toolu_x",
      name: "Read",
      input: { file_path: "packages/library/src/knowledge.ts" },
    }),
  ]);

  const result = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(result.scannedFiles, 1);
  assert.equal(result.extracted, 0);
  assert.deepEqual(result.sessions, []);
  assert.equal(result.earliestAt, undefined);
});

test("the-reached-blind-spots-are-sized-on-the-result: the blind spots the sweep REACHED are sized on the result, so a lobby-heavy or git-heavy history cannot read as a complete one", () => {
  const transcriptDir = freshDir("blind");
  const traceDir = freshDir("blind-trace");
  writeTranscript(path.join(transcriptDir, "proj", "w.jsonl"), [
    // the primary checkout — deriveIdentity() rule 3 refuses it, so this is reached and unattributed
    toolUseLine({
      cwd: "C:\\code\\storytree",
      timestamp: "2026-06-08T01:20:00.000Z",
      toolUseId: "toolu_lobby",
      name: "Read",
      input: { file_path: "docs/decisions/0001-e.md" },
    }),
    // a decision record named under a verb this scraper does not read
    toolUseLine({
      cwd: worktreeCwd("agent-blind"),
      timestamp: "2026-06-08T01:21:00.000Z",
      toolUseId: "toolu_git",
      name: "Bash",
      input: { command: "git show origin/main:docs/decisions/0403-a.md" },
    }),
  ]);

  const result = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(result.extracted, 0);
  assert.equal(result.uncorrelatedReads, 1);
  assert.deepEqual(result.declinedShellVerbs, [{ verb: "git", segments: 1 }]);
});

// ---------------------------------------------------------------------------------------------
// THE REPORT — bounding the claim is half its job
// ---------------------------------------------------------------------------------------------

test("the-report-bounds-its-own-claim-as-a-floor: the report states, on its own face, that the count is a FLOOR, that the record is only as fresh as this run, and that a read count is not a sufficiency measure", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  const rendered = renderDecisionReadIngest(ingestDecisionReads({ traceDir, transcriptDir }));

  assert.match(rendered, /FLOOR, NOT A CENSUS/, "a count that reads as a census is the failure");
  assert.match(rendered, /BATCH ingest/, "a batch record must not read as a live one");
  assert.match(rendered, /NOT A SUFFICIENCY MEASURE/);
  // Every declared omission is printed IN FULL, never abbreviated when the numbers look good.
  for (const omission of DECISION_READ_OMISSIONS) {
    assert.ok(rendered.includes(omission), `the report must declare: ${omission}`);
  }
  // And the sized, reached-but-unrecorded block is present alongside the headline figures.
  assert.match(rendered, /REACHED AND NOT RECORDED, sized:/);
  assert.match(
    rendered,
    /extracted 5 read\(s\) — 1 cli \(the STORE route[^)]*\), 2 Read \(exact path, HISTORICAL\), 1 Grep/,
  );
  assert.match(rendered, /doc:decisions\/NNNN-slug\.md/);
});

test("a-dry-run-says-so-in-its-first-line: a dry run says so in its own first line, so a report cannot be mistaken for a record that was written", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  const rendered = renderDecisionReadIngest(ingestDecisionReads({ traceDir, transcriptDir, dryRun: true }));
  assert.match(rendered.split("\n")[0] ?? "", /DRY RUN, nothing written/);
});

test("the-adapter-declares-exhaustive-coverage-under-a-distinct-adapter-id: the adapter declares its own exhaustive coverage under an id distinct from the occupancy adapter's, since a trace refuses a duplicate adapterId", () => {
  // Re-parsing proves exhaustiveness the same way the module's own load-time parse does, and would
  // go red if a future CoverageFeature member were added without being named here.
  ContextTraversalCoverage.parse(DECISION_READ_COVERAGE);
  assert.notEqual(DECISION_READ_COVERAGE.adapterId, HOST_TRANSCRIPT_COVERAGE.adapterId);
  assert.deepEqual(
    [...DECISION_READ_COVERAGE.supported].sort(),
    [
      // `event:front_matter_read` is here because the store route can emit it: a
      // `library artifact adr-NNNN --raw <field>` read hands back ONE field, and declaring it
      // omitted while emitting it would make this declaration state the opposite of the truth.
      "event:front_matter_read",
      "event:full_payload_read",
      "field:surface_id",
      "surface:host_transcript",
    ],
  );
  // This adapter sees a READ and can say nothing about which offer it answered — so these stay
  // omitted, and a later increment that starts claiming causality has to change this line first.
  assert.ok(DECISION_READ_COVERAGE.omitted.includes("event:candidate_set"));
  assert.ok(DECISION_READ_COVERAGE.omitted.includes("event:followed_edge"));
  assert.ok(DECISION_READ_COVERAGE.omitted.includes("field:candidate_follow_causality"));
});

// ---------------------------------------------------------------------------------------------
// THE ZERO — the property whose absence let this ingest report a dead extractor as a clean answer
// ---------------------------------------------------------------------------------------------

test("a-zero-against-mentions-is-reported-as-BLINDNESS: a sweep that reads every file and recovers nothing from transcripts full of decision talk is a verdict, not an empty result", () => {
  const transcriptDir = freshDir("blind-sweep");
  const traceDir = freshDir("blind-sweep-trace");
  writeTranscript(path.join(transcriptDir, "proj", "w.jsonl"), [
    toolUseLine({
      cwd: worktreeCwd("agent-blind"),
      timestamp: "2026-08-22T10:00:00.000Z",
      toolUseId: "toolu_m1",
      name: "Bash",
      input: { command: 'echo "=== ADR-0404 ==="; pnpm storytree adr list --load-bearing' },
    }),
    toolUseLine({
      cwd: worktreeCwd("agent-blind"),
      timestamp: "2026-08-22T10:01:00.000Z",
      toolUseId: "toolu_m2",
      name: "Bash",
      input: { command: "pnpm storytree adr new --title 'a fork' --pg" },
    }),
  ]);

  const result = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(result.scannedFiles, 1, "the walk itself succeeded — this is not the empty-root failure");
  assert.equal(result.extracted, 0);
  assert.equal(result.decisionMentions, 2);
  assert.equal(result.blind, true, "zero reads against real decision traffic is an instrument out of date");

  // And the report SAYS SO, in place of the quiet zero that hid this for the whole migration.
  const rendered = renderDecisionReadIngest(result);
  assert.match(rendered, /THE EXTRACTOR MAY BE BLIND/);
  assert.match(rendered, /UNVERIFIED/);
});

test("a-zero-against-no-mentions-is-an-honest-quiet-answer: the other zero — nothing read AND nothing named — stays a real answer, because a machine with no decision traffic is not a broken instrument", () => {
  const transcriptDir = freshDir("quiet-sweep");
  const traceDir = freshDir("quiet-sweep-trace");
  writeTranscript(path.join(transcriptDir, "proj", "w.jsonl"), [
    toolUseLine({
      cwd: worktreeCwd("agent-quiet"),
      timestamp: "2026-08-22T10:00:00.000Z",
      toolUseId: "toolu_q1",
      name: "Read",
      input: { file_path: "packages/library/src/knowledge.ts" },
    }),
  ]);

  const result = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(result.extracted, 0);
  assert.equal(result.decisionMentions, 0);
  assert.equal(result.blind, false, "no reads and nothing named is a quiet machine, not a blind one");
  assert.doesNotMatch(renderDecisionReadIngest(result), /THE EXTRACTOR MAY BE BLIND/);
});

test("a-recovered-read-clears-the-blind-verdict-without-certifying-completeness: one recovered read is enough to rule out total blindness, and the report says explicitly that it certifies nothing more", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  const result = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(result.blind, false);

  const rendered = renderDecisionReadIngest(result);
  assert.match(rendered, /not blind: 5 read\(s\) recovered/);
  // The floor language survives beside it — "not blind" must never be read as "complete".
  assert.match(rendered, /FLOOR, NOT A CENSUS/);
  assert.match(rendered, /never a\ntarget to drive to zero/);
});

test("the-store-route-declines-are-sized-apart-from-the-shell-declines: a storytree invocation that reached the log and minted no read is counted on its OWN line, because most of them named no single decision", () => {
  const transcriptDir = freshDir("declines");
  const traceDir = freshDir("declines-trace");
  writeTranscript(path.join(transcriptDir, "proj", "w.jsonl"), [
    toolUseLine({
      cwd: worktreeCwd("agent-declines"),
      timestamp: "2026-08-22T10:00:00.000Z",
      toolUseId: "toolu_d1",
      name: "Bash",
      input: { command: "pnpm storytree adr list --current" },
    }),
    toolUseLine({
      cwd: worktreeCwd("agent-declines"),
      timestamp: "2026-08-22T10:01:00.000Z",
      toolUseId: "toolu_d2",
      name: "Bash",
      input: { command: "git show origin/main:docs/decisions/0403-a.md" },
    }),
  ]);

  const result = ingestDecisionReads({ traceDir, transcriptDir });
  assert.deepEqual(result.declinedShellVerbs, [{ verb: "git", segments: 1 }]);
  assert.deepEqual(result.declinedCliVerbs, [{ verb: "adr list", segments: 1 }]);
  // Folding the two together would report `adr list` under "NAMED a decision record", which it did
  // not — a small false claim, and exactly the kind this module exists to stop making.
  assert.match(renderDecisionReadIngest(result), /1 storytree invocation\(s\) that reached the decision log/);
});

// ---------------------------------------------------------------------------
// ADR-0484 D5 — the tier, and whether anyone ever looked
// ---------------------------------------------------------------------------

test("every-surface-this-ingest-mints-classifies-harness-derived: the provenance table names all four, so nothing this adapter writes can reach a surface unlabelled", () => {
  // THE DRIFT GUARD, and it is here because this is the one place both halves are visible: the
  // surface ids are minted by `DECISION_READ_SURFACES` in this organism, and the classification
  // lives in the vocabulary package, which is a ROOT and can never import back. A surface added
  // there and not classified would otherwise read `unclassified` on every render — silently, and
  // on exactly the tier a reader is most likely to over-trust.
  const minted = Object.values(DECISION_READ_SURFACES);
  assert.equal(minted.length, 4, "a fifth shape needs a fifth row in the provenance table");
  for (const surfaceId of minted) {
    const row = traversalProvenanceOf(surfaceId);
    assert.equal(row.provenance, "harness-derived", `${surfaceId} is not classified harness-derived`);
    assert.notEqual(row.provenance, "unclassified", `${surfaceId} is not in the provenance table at all`);
    assert.match(row.scope, /decision|DECISION/, `${surfaceId} does not state its decision-only narrowness`);
  }
});

test("the-report-states-its-own-tier-and-its-narrowness: the count is printed under HARNESS-DERIVED, with the precedence and the decision-only scope beside it", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  const rendered = renderDecisionReadIngest(ingestDecisionReads({ traceDir, transcriptDir }));

  assert.match(rendered, /TIER: HARNESS-DERIVED/);
  assert.match(rendered, /SECONDARY/);
  assert.match(rendered, /storytree log is authoritative/);
  // Deliverable 3: a reader must not take these four surfaces for general tool capture.
  assert.match(rendered, /DECISION-ONLY/);
  assert.match(rendered, /not general tool capture/);
});

test("the-sweep-stamps-a-receipt-per-session-it-measured: a session it swept is recorded as MEASURED, so a later replay can tell that from never-looked-at", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const result = ingestDecisionReads({ traceDir, transcriptDir, now: () => "2026-08-31T05:00:00.000Z" });

  assert.deepEqual([...result.receipted].sort(), ["agent-alpha", "agent-beta"]);
  assert.deepEqual(result.receiptFailures, []);

  const receipt = readHarnessIngestReceipt(traceDir, "agent-alpha");
  assert.notEqual(receipt, null, "the receipt must reach disk, not just the result object");
  assert.deepEqual(receipt?.runs["host-transcript-decision-read"], {
    at: "2026-08-31T05:00:00.000Z",
    observed: 4,
    appended: 4,
  });
  // A session this sweep never reached has none, and that is the honest never-run answer.
  assert.equal(readHarnessIngestReceipt(traceDir, "agent-never-swept"), null);
});

test("a-re-ingest-still-stamps-the-receipt: the fact recorded is that the adapter LOOKED, which a zero-append re-run did", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  ingestDecisionReads({ traceDir, transcriptDir, now: () => "2026-08-31T05:00:00.000Z" });

  const second = ingestDecisionReads({ traceDir, transcriptDir, now: () => "2026-08-31T06:00:00.000Z" });
  assert.equal(second.appended, 0, "idempotence: the second run appends nothing");
  assert.deepEqual([...second.receipted].sort(), ["agent-alpha", "agent-beta"]);

  // The stamp MOVED, because the look is more recent even though nothing was written. A receipt
  // that only advanced on an append would answer "last looked" with the date of the last FIND.
  assert.deepEqual(readHarnessIngestReceipt(traceDir, "agent-alpha")?.runs["host-transcript-decision-read"], {
    at: "2026-08-31T06:00:00.000Z",
    observed: 4,
    appended: 0,
  });
});

test("a-dry-run-stamps-nothing: it declares it writes no byte, so it may not record a session as measured", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const result = ingestDecisionReads({ traceDir, transcriptDir, dryRun: true, now: () => "2026-08-31T05:00:00.000Z" });

  assert.deepEqual(result.receipted, []);
  assert.equal(readHarnessIngestReceipt(traceDir, "agent-alpha"), null);
  assert.match(renderDecisionReadIngest(result), /receipts: none — a dry run writes no byte/);
});

test("the-two-adapters-receipts-survive-each-other: an occupancy stamp on the same trace is not erased by this sweep", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  recordHarnessIngestRun({
    traceDir,
    sessionId: "agent-alpha",
    adapter: "host-transcript-occupancy",
    observed: 9,
    appended: 9,
    at: "2026-08-30T00:00:00.000Z",
  });

  ingestDecisionReads({ traceDir, transcriptDir, now: () => "2026-08-31T05:00:00.000Z" });

  const receipt = readHarnessIngestReceipt(traceDir, "agent-alpha");
  assert.deepEqual(receipt?.runs["host-transcript-occupancy"], {
    at: "2026-08-30T00:00:00.000Z",
    observed: 9,
    appended: 9,
  });
  assert.equal(receipt?.runs["host-transcript-decision-read"]?.observed, 4);
});

test("the-default-clock-stamps-a-real-instant: an ingest run without an injected clock still dates its receipt", () => {
  // The clock is injected so the tests are exact, which leaves the DEFAULT unexercised unless
  // something asks for it — and a default that produced no timestamp would write a receipt the
  // reader refuses, turning every measured session back into a never-run one.
  const { transcriptDir, traceDir } = twoWindowFixture();
  const before = Date.now();

  ingestDecisionReads({ traceDir, transcriptDir });

  const at = readHarnessIngestReceipt(traceDir, "agent-alpha")?.runs["host-transcript-decision-read"]?.at;
  assert.ok(at !== undefined, "the default clock must produce a timestamp");
  const stamped = Date.parse(at);
  assert.ok(!Number.isNaN(stamped), `"${at}" is not an instant`);
  assert.ok(stamped >= before - 1000 && stamped <= Date.now() + 1000, `"${at}" is not this run's time`);
});

test("a-receipt-that-cannot-be-written-is-REPORTED-not-swallowed: the run still stands, and the report says which sessions lost their stamp", () => {
  // A trace directory that is a FILE: nothing can be written under it, so every receipt fails while
  // the sweep itself completes. The point is that "we have no data" stays distinguishable from
  // "nothing happened" even when the bookkeeping is what broke.
  const transcriptDir = freshDir("receipt-fail-transcripts");
  const parent = freshDir("receipt-fail-parent");
  const traceDir = path.join(parent, "not-a-directory");
  fs.writeFileSync(traceDir, "");

  // TWO sessions, so the rendered list is a real list: a single name reads identically however the
  // sessions are joined, and a report that lost its separator would go unnoticed on one.
  writeTranscript(path.join(transcriptDir, "proj", "w.jsonl"), [
    toolUseLine({
      cwd: worktreeCwd("agent-doomed"),
      timestamp: "2026-08-22T10:00:00.000Z",
      toolUseId: "toolu_f1",
      name: "Read",
      input: { file_path: "docs/decisions/0403-a.md" },
    }),
    toolUseLine({
      cwd: worktreeCwd("agent-doomed-too"),
      timestamp: "2026-08-22T10:01:00.000Z",
      toolUseId: "toolu_f2",
      name: "Read",
      input: { file_path: "docs/decisions/0139-c.md" },
    }),
  ]);

  const result = ingestDecisionReads({ traceDir, transcriptDir, now: () => "2026-08-31T05:00:00.000Z" });

  assert.equal(result.extracted, 2, "the sweep itself still ran");
  assert.deepEqual(result.receipted, []);
  assert.deepEqual(result.receiptFailures, ["agent-doomed", "agent-doomed-too"]);

  const rendered = renderDecisionReadIngest(result);
  assert.match(rendered, /receipts: stamped 0 session\(s\) as MEASURED/);
  // EVERY failing session is named — a truncated list with no "and N more" would hide exactly the
  // sessions whose measurement was lost, which is what this line exists to report.
  assert.match(rendered, /2 receipt\(s\) could not be written \(agent-doomed, agent-doomed-too\)/);
});

test("the-report-states-its-tier-clause-by-clause: why the scraper is kept, what it cannot replace, and what it is not", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  const rendered = renderDecisionReadIngest(
    ingestDecisionReads({ traceDir, transcriptDir, now: () => "2026-08-31T05:00:00.000Z" }),
  );

  // A blank line separates the tier block from the omissions above it — run together, the tier
  // statement reads as one more omission rather than as a statement about the whole report.
  assert.match(rendered, /\n\nTIER: HARNESS-DERIVED/);
  // Why it is kept (ADR-0484 D5), and the fence that stops it growing into a substitute.
  assert.match(rendered, /only witness to what/);
  assert.match(rendered, /NOT a storytree command/);
  assert.match(rendered, /never a substitute for widening our/);
  assert.match(rendered, /widening our own capture/);
  // The receipts line, and its own declared floor.
  assert.match(rendered, /receipts: stamped 2 session\(s\) as MEASURED by this adapter/);
  assert.match(rendered, /is NOT stamped/);
  assert.match(rendered, /under-claim of measurement, which is the safe direction/);
  // A clean run prints NOTHING between the count and the coda — not "0 failures", and not any other
  // interpolation. Asserted as adjacency, because "no failure clause" is otherwise unfalsifiable.
  assert.match(rendered, /as MEASURED by this adapter\. A session this sweep extracted no read/);
  assert.doesNotMatch(rendered, /could not be written/);
});
