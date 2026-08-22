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
import { ContextTraversalCoverage } from "@storytree/context-traversal-telemetry";

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

test("the sweep writes validated full_payload_read events, keyed on doc:decisions/NNNN-slug.md, into EACH session's own trace — subagent reads included, under the parent's identity", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const result = ingestDecisionReads({ traceDir, transcriptDir });

  assert.equal(result.extracted, 4);
  assert.deepEqual(result.byShape, { read: 2, grep: 1, shell: 1 });
  assert.equal(result.appended, 4);
  assert.equal(result.sidechainReads, 1, "the subagent read is kept, not dropped");
  assert.equal(result.distinctDecisions, 3);
  assert.equal(result.earliestAt, "2026-06-08T01:20:23.863Z");
  assert.deepEqual(
    result.sessions.map((session) => [session.sessionId, session.extracted, session.appended]),
    [
      ["agent-alpha", 3, 3],
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
    ],
    "the id form is the corpus's own pointer form — anything else joins to no offer and closes nothing",
  );

  const beta = readTraversalSession({ dir: traceDir, sessionId: "agent-beta" });
  assert.equal(beta.replay.events.length, 1);
});

test("re-ingesting appends NOTHING and does not double the bytes on disk — idempotence is a property of the ids, not of run order", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const first = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(first.appended, 4);
  const afterFirst = fs.readFileSync(path.join(traceDir, "agent-alpha.jsonl"), "utf8");

  const second = ingestDecisionReads({ traceDir, transcriptDir });
  assert.equal(second.extracted, 4, "the same reads are still EXTRACTED — nothing is forgotten");
  assert.equal(second.appended, 0, "and none of them is written a second time");

  const afterSecond = fs.readFileSync(path.join(traceDir, "agent-alpha.jsonl"), "utf8");
  assert.equal(afterSecond, afterFirst, "the file is byte-identical after the second run");
  assert.equal(readTraversalSession({ dir: traceDir, sessionId: "agent-alpha" }).replay.events.length, 3);
});

test("a tool call that appears in TWO transcript files — the shape a resumed or forked session produces — is counted and written ONCE", () => {
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

test("a dry run reports the same extraction and writes not one byte", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();

  const dry = ingestDecisionReads({ traceDir, transcriptDir, dryRun: true });
  assert.equal(dry.extracted, 4);
  assert.equal(dry.appended, 0);
  assert.equal(dry.dryRun, true);
  assert.equal(fs.existsSync(path.join(traceDir, "agent-alpha.jsonl")), false, "no trace file was created");
});

test("a sweep that finds no decision read at all is an honest empty answer, not a crash and not a trace file", () => {
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

test("the blind spots the sweep REACHED are sized on the result, so a lobby-heavy or git-heavy history cannot read as a complete one", () => {
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

test("the report states, on its own face, that the count is a FLOOR, that the record is only as fresh as this run, and that a read count is not a sufficiency measure", () => {
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
  assert.match(rendered, /extracted 4 read\(s\) — 2 Read \(exact path\), 1 Grep \(exact path\), 1 shell/);
  assert.match(rendered, /doc:decisions\/NNNN-slug\.md/);
});

test("a dry run says so in its own first line, so a report cannot be mistaken for a record that was written", () => {
  const { transcriptDir, traceDir } = twoWindowFixture();
  const rendered = renderDecisionReadIngest(ingestDecisionReads({ traceDir, transcriptDir, dryRun: true }));
  assert.match(rendered.split("\n")[0] ?? "", /DRY RUN, nothing written/);
});

test("the adapter declares its own exhaustive coverage under an id distinct from the occupancy adapter's, since a trace refuses a duplicate adapterId", () => {
  // Re-parsing proves exhaustiveness the same way the module's own load-time parse does, and would
  // go red if a future CoverageFeature member were added without being named here.
  ContextTraversalCoverage.parse(DECISION_READ_COVERAGE);
  assert.notEqual(DECISION_READ_COVERAGE.adapterId, HOST_TRANSCRIPT_COVERAGE.adapterId);
  assert.deepEqual(
    [...DECISION_READ_COVERAGE.supported].sort(),
    ["event:full_payload_read", "field:surface_id", "surface:host_transcript"],
  );
  // This adapter sees a READ and can say nothing about which offer it answered — so these stay
  // omitted, and a later increment that starts claiming causality has to change this line first.
  assert.ok(DECISION_READ_COVERAGE.omitted.includes("event:candidate_set"));
  assert.ok(DECISION_READ_COVERAGE.omitted.includes("event:followed_edge"));
  assert.ok(DECISION_READ_COVERAGE.omitted.includes("field:candidate_follow_causality"));
});
