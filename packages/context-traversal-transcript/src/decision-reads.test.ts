/**
 * The decision-record read EXTRACTOR (`decision-reads.ts`), story
 * `context-traversal-transcript`, capability `transcript-decision-read-extraction`.
 *
 * Every fixture writes real transcript JSONL into a unique temporary directory — never the real
 * `~/.claude/projects` — and every helper takes an explicit path, so nothing here depends on HOME
 * or on this machine's own history.
 *
 * The bar these assertions are written against: WHAT INPUT WOULD MAKE THIS RED? A test that only
 * shows the extractor returning *something* would pass against an extractor that mints the wrong id
 * form, drops every subagent read, or records a file being WRITTEN as a file being read — which are
 * the three ways this increment fails while looking finished. Each has its own negative case below.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  DECISION_READ_SURFACES,
  decisionNodeIdsInPath,
  scanTranscriptDecisionReads,
  scrapeShellDecisionReads,
  sessionIdFromCwd,
} from "./decision-reads.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `decision-reads-${prefix}-`));
}

/** A `.claude/worktrees/<sessionId>` cwd — exactly the shape `deriveIdentity()` rule 1 matches. */
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

// ---------------------------------------------------------------------------------------------
// THE NODE ID FORM — get this wrong and every read recorded closes nothing
// ---------------------------------------------------------------------------------------------

test("node-id-is-the-corpus-doc-pointer-form: the node id is exactly the corpus's own doc:decisions/NNNN-slug.md pointer form, from every spelling of the path that reaches a transcript", () => {
  // A Windows absolute path inside a worktree — the commonest real shape on this platform.
  assert.deepEqual(
    decisionNodeIdsInPath(
      "C:\\code\\storytree\\.claude\\worktrees\\wt\\docs\\decisions\\0403-the-decision-log-becomes-ordinary.md",
    ),
    ["doc:decisions/0403-the-decision-log-becomes-ordinary.md"],
  );
  // A posix repo-relative path.
  assert.deepEqual(decisionNodeIdsInPath("docs/decisions/0223-a-thing.md"), [
    "doc:decisions/0223-a-thing.md",
  ]);
  // A bare `decisions/` relpath at a token boundary.
  assert.deepEqual(decisionNodeIdsInPath("./decisions/0001-foundational-stack.md"), [
    "doc:decisions/0001-foundational-stack.md",
  ]);
});

test("a-non-decision-path-is-never-recorded-as-a-decision-read: a NON-decision file is not recorded as one, including the near-misses a looser pattern would swallow", () => {
  // Ordinary source, and an ordinary markdown file that is not a decision record.
  assert.deepEqual(decisionNodeIdsInPath("packages/library/src/knowledge.ts"), []);
  assert.deepEqual(decisionNodeIdsInPath("C:\\Users\\dev\\.claude\\projects\\memory\\some-arc.md"), []);
  // A directory named `decisions` that is not the decision log's own segment boundary.
  assert.deepEqual(decisionNodeIdsInPath("docs/mydecisions/0001-a.md"), []);
  // A decisions-shaped path whose number is not four digits, and one that is not markdown.
  assert.deepEqual(decisionNodeIdsInPath("docs/decisions/12-a.md"), []);
  assert.deepEqual(decisionNodeIdsInPath("docs/decisions/0012-a.txt"), []);
});

// ---------------------------------------------------------------------------------------------
// THE SHELL SCRAPER — a floor, and it must decline rather than guess
// ---------------------------------------------------------------------------------------------

test("a-shell-read-is-recovered-from-a-later-segment: a shell read is recovered from a LATER segment, so the `cd <worktree> && cat <adr>` shape (the commonest one on disk) is not lost to its leading verb", () => {
  const scrape = scrapeShellDecisionReads(
    "cd /home/dev/code/storytree && cat docs/decisions/0139-the-accepted-adr-set.md",
  );
  assert.deepEqual(scrape.nodeIds, ["doc:decisions/0139-the-accepted-adr-set.md"]);
  assert.deepEqual(scrape.declinedVerbs, []);
});

test("every-claimed-read-verb-yields-its-path: every read verb the scraper claims actually yields its path, and one command naming two decision records yields both", () => {
  assert.deepEqual(scrapeShellDecisionReads("sed -n '1,60p' docs/decisions/0001-foundational-stack.md").nodeIds, [
    "doc:decisions/0001-foundational-stack.md",
  ]);
  assert.deepEqual(scrapeShellDecisionReads("head -20 docs/decisions/0002-work-hierarchy.md").nodeIds, [
    "doc:decisions/0002-work-hierarchy.md",
  ]);
  assert.deepEqual(
    scrapeShellDecisionReads("grep -n 'status' docs/decisions/0003-a.md docs/decisions/0004-b.md").nodeIds,
    ["doc:decisions/0003-a.md", "doc:decisions/0004-b.md"],
  );
});

test("a-shell-write-is-declined-and-counted-by-verb: a shell segment that WRITES a decision record is declined, and the decline is counted BY VERB rather than swallowed", () => {
  // `sed -i` rewrites the file it names — a read verb doing a write.
  const inPlace = scrapeShellDecisionReads("sed -i 's/a/b/' docs/decisions/0386-a-thing.md");
  assert.deepEqual(inPlace.nodeIds, [], "sed -i must record no read");
  assert.deepEqual(inPlace.declinedVerbs, ["sed"]);

  // `git` spans reads and writes under one verb, so the whole verb is declined ON PURPOSE — and
  // the count is what makes that omission a stated size rather than a silent gap.
  const staged = scrapeShellDecisionReads("git add docs/decisions/0386-a-thing.md");
  assert.deepEqual(staged.nodeIds, []);
  assert.deepEqual(staged.declinedVerbs, ["git"]);
});

test("a-redirect-target-is-authoring-never-reading: a decision record that is a > redirect TARGET is a file being authored, and is never recorded as a read", () => {
  const authored = scrapeShellDecisionReads("cat > docs/decisions/0386-a-thing.md <<'ADREOF'\nstatus: accepted\nADREOF");
  assert.deepEqual(authored.nodeIds, [], "the ADR being written must not read as an ADR being read");
  assert.equal(authored.redirectTargets, 1, "and the drop must be counted, not silent");
});

test("a-heredoc-body-is-never-scraped: a heredoc BODY is not scraped, so prose that merely mentions a decision record is not recorded as a read of one", () => {
  const prBody = [
    "gh pr create --body-file - <<'PRBODY'",
    "This lands the change described in docs/decisions/0403-the-decision-log.md",
    "and supersedes cat docs/decisions/0223-an-older-one.md",
    "PRBODY",
  ].join("\n");
  const scrape = scrapeShellDecisionReads(prBody);
  assert.deepEqual(scrape.nodeIds, [], "authored prose inside a heredoc is not a read");
});

// ---------------------------------------------------------------------------------------------
// SESSION IDENTITY — mirrors deriveIdentity() rule 1, and refuses the lobby exactly as it does
// ---------------------------------------------------------------------------------------------

test("session-identity-mirrors-derive-identity-rule-one: the session id mirrors deriveIdentity() rule 1: a worktree cwd names its session, and the PRIMARY CHECKOUT names none", () => {
  assert.equal(sessionIdFromCwd("C:\\code\\storytree\\.claude\\worktrees\\agent-abc\\packages"), "agent-abc");
  assert.equal(sessionIdFromCwd("/home/dev/code/storytree/.claude/worktrees/agent-abc"), "agent-abc");
  // Rule 3: the shared lobby has no isolated identity to claim under, and this must not invent one.
  assert.equal(sessionIdFromCwd("C:\\code\\storytree"), undefined);
  // The segments must be CONSECUTIVE — a path that merely contains both words is not a worktree.
  assert.equal(sessionIdFromCwd("/home/dev/.claude/notes/worktrees/agent-abc"), undefined);
});

// ---------------------------------------------------------------------------------------------
// THE WHOLE SCAN, over a realistic transcript
// ---------------------------------------------------------------------------------------------

test("each-read-shape-carries-its-own-surface-and-sidechain-reads-stay-under-the-parent: a realistic transcript yields every read shape with its own surface, keeps SIDECHAIN reads under the parent session, and records nothing for the non-decision reads beside them", () => {
  const dir = freshDir("scan");
  const file = path.join(dir, "window.jsonl");
  const cwd = worktreeCwd("agent-scan");

  writeTranscript(file, [
    // 1. an exact Read of a decision record, by the PARENT
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:20:23.863Z",
      toolUseId: "toolu_read_parent",
      name: "Read",
      input: { file_path: "C:\\code\\storytree\\.claude\\worktrees\\agent-scan\\docs\\decisions\\0403-a.md" },
    }),
    // 2. an exact Read of a decision record, by a SUBAGENT (58-68% of the real corpus)
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:21:00.000Z",
      toolUseId: "toolu_read_sidechain",
      name: "Read",
      input: { file_path: "docs/decisions/0223-b.md" },
      isSidechain: true,
    }),
    // 3. a Grep at an exact FILE
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:22:00.000Z",
      toolUseId: "toolu_grep_file",
      name: "Grep",
      input: { pattern: "status", path: "docs/decisions/0139-c.md" },
    }),
    // 4. a Grep over a DIRECTORY — names no file, so records nothing (a declared omission)
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:23:00.000Z",
      toolUseId: "toolu_grep_dir",
      name: "Grep",
      input: { pattern: "status", path: "docs/decisions" },
    }),
    // 5. a shell read
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:24:00.000Z",
      toolUseId: "toolu_bash",
      name: "Bash",
      input: { command: "cd /repo && sed -n '1,40p' docs/decisions/0405-d.md" },
    }),
    // 6. an ordinary source read that must NOT appear
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:25:00.000Z",
      toolUseId: "toolu_other",
      name: "Read",
      input: { file_path: "packages/library/src/knowledge.ts" },
    }),
    // 7. a decision read in the LOBBY — reached, attributable to nobody, counted
    toolUseLine({
      cwd: "C:\\code\\storytree",
      timestamp: "2026-06-08T01:26:00.000Z",
      toolUseId: "toolu_lobby",
      name: "Read",
      input: { file_path: "docs/decisions/0001-e.md" },
    }),
  ]);

  const scan = scanTranscriptDecisionReads(file);

  assert.deepEqual(
    scan.reads.map((read) => [read.nodeId, read.shape, read.sidechain, read.sessionId]),
    [
      ["doc:decisions/0403-a.md", "read", false, "agent-scan"],
      ["doc:decisions/0223-b.md", "read", true, "agent-scan"],
      ["doc:decisions/0139-c.md", "grep", false, "agent-scan"],
      ["doc:decisions/0405-d.md", "shell", false, "agent-scan"],
    ],
  );
  assert.equal(scan.uncorrelatedReads, 1, "the lobby read is reached and counted, never attributed");
  assert.equal(scan.reads[0]?.at, "2026-06-08T01:20:23.863Z", "the timestamp is carried through verbatim");
  // The three shapes carry three DIFFERENT surfaces: a scraped shell read is weaker evidence than
  // an exact Read, and flattening them would hide that.
  assert.equal(new Set(Object.values(DECISION_READ_SURFACES)).size, 3);
});

test("a-tool-call-with-no-id-is-skipped-and-counted: a tool call carrying no id is skipped and COUNTED, because an event keyed on nothing could never be de-duplicated on the next run", () => {
  const dir = freshDir("noid");
  const file = path.join(dir, "window.jsonl");
  fs.writeFileSync(
    file,
    `${JSON.stringify({
      type: "assistant",
      cwd: worktreeCwd("agent-noid"),
      sessionId: "host-window-uuid",
      timestamp: "2026-06-08T01:20:00.000Z",
      message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "docs/decisions/0403-a.md" } }] },
    })}\n`,
  );

  const scan = scanTranscriptDecisionReads(file);
  assert.deepEqual(scan.reads, []);
  assert.equal(scan.unidentifiedCalls, 1);
});

test("the-scan-never-throws-on-a-deficient-transcript: the scan never throws: a missing file, an unparseable line, and a line with no cwd each contribute nothing rather than failing the sweep", () => {
  const dir = freshDir("tolerant");
  assert.deepEqual(scanTranscriptDecisionReads(path.join(dir, "absent.jsonl")).reads, []);

  const file = path.join(dir, "messy.jsonl");
  writeTranscript(file, [
    '{"type":"assistant","cwd":"/x/.claude/worktrees/a","timestamp":"nope', // truncated JSON
    JSON.stringify({
      type: "assistant",
      sessionId: "w",
      timestamp: "2026-06-08T01:20:00.000Z",
      message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "docs/decisions/0403-a.md" } }] },
    }), // no cwd at all
    toolUseLine({
      cwd: worktreeCwd("agent-tolerant"),
      timestamp: "2026-06-08T01:21:00.000Z",
      toolUseId: "toolu_ok",
      name: "Read",
      input: { file_path: "docs/decisions/0403-a.md" },
    }),
  ]);

  const scan = scanTranscriptDecisionReads(file);
  assert.deepEqual(
    scan.reads.map((read) => read.nodeId),
    ["doc:decisions/0403-a.md"],
    "the one good line still lands",
  );
});
