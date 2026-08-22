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
  scrapeCliDecisionReads,
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
    // 8. THE STORE ROUTE — the row read the way every artifact is read. The only shape a session
    //    recorded after 2026-08-22 can produce, and the one this fixture existed without.
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:27:00.000Z",
      toolUseId: "toolu_cli_artifact",
      name: "Bash",
      input: { command: "cd ../.. && pnpm storytree library artifact adr-0301 --pg 2>&1 | head -30" },
    }),
    // 9. the document route, carrying SHELL NOISE the live observer's argv allowlist would refuse
    //    outright — six of the eight real store reads measured on this disk look exactly like this.
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:28:00.000Z",
      toolUseId: "toolu_cli_pull",
      name: "Bash",
      input: { command: "timeout 240 pnpm storytree adr pull 380 --out /tmp/a380.md >/dev/null 2>&1" },
    }),
    // 10. a command that MENTIONS a decision and reads none — the 66:1 majority. It must record no
    //     read, and must be COUNTED, so a future zero can be told apart from a blind extractor.
    toolUseLine({
      cwd,
      timestamp: "2026-06-08T01:29:00.000Z",
      toolUseId: "toolu_mention",
      name: "Bash",
      input: {
        command:
          'pnpm storytree arc increment close some-inc --note "Dropped: ADR-0306 D3 parks units[]" --pg',
      },
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
      ["adr-0301", "cli", false, "agent-scan"],
      ["adr-0380", "cli", false, "agent-scan"],
    ],
  );
  assert.equal(scan.uncorrelatedReads, 1, "the lobby read is reached and counted, never attributed");
  assert.equal(scan.reads[0]?.at, "2026-06-08T01:20:23.863Z", "the timestamp is carried through verbatim");
  // The mentioning command records no read AND is counted — that PAIR is what lets a zero be read.
  assert.equal(scan.decisionMentions, 1, "the ADR-0306 note is a MENTION of a decision, never a read");
  // The four shapes carry four DIFFERENT surfaces: a scraped shell read is weaker evidence than
  // an exact Read, and flattening them would hide that.
  assert.equal(new Set(Object.values(DECISION_READ_SURFACES)).size, 4);
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

// ---------------------------------------------------------------------------------------------
// THE STORE ROUTE — the shape that replaced the file, and the reasons it is read so narrowly
// ---------------------------------------------------------------------------------------------

test("the-store-route-is-recognised-by-argv-shape: the two verbs that put a decision in front of a caller are recovered, through the shell noise a real command carries", () => {
  const cases: readonly (readonly [string, readonly string[]])[] = [
    ["pnpm storytree library artifact adr-0403 --pg", ["adr-0403"]],
    // Redirections and a pipe: argv never sees these, so an argv-shaped allowlist refuses the whole
    // command. Six of the eight real store reads measured on this disk look exactly like this.
    ["cd ../.. && pnpm storytree library artifact adr-0017 2>&1 | head -25", ["adr-0017"]],
    ["timeout 240 pnpm storytree adr pull 380 --out /tmp/a380.md >/dev/null 2>&1", ["adr-0380"]],
    // A bare launcher and the two in-repo entry points are one invocation wearing three spellings.
    ["storytree library artifact adr-0139", ["adr-0139"]],
    ["npx tsx packages/cli/src/main.ts library artifact adr-0139 --json", ["adr-0139"]],
    ["node packages/cli/launch.mjs adr pull 1", ["adr-0001"]],
    // Two decisions in one command yield two reads: taking only the first would lose one silently.
    [
      "pnpm storytree adr pull 380 --out /tmp/a.md; pnpm storytree library artifact adr-0406 --pg",
      ["adr-0380", "adr-0406"],
    ],
  ];

  for (const [command, expected] of cases) {
    assert.deepEqual(
      scrapeCliDecisionReads(command)
        .reads.map((read) => read.nodeId)
        .sort(),
      [...expected].sort(),
      command,
    );
  }
});

test("a-bare-decision-id-is-a-mention-never-a-read: an `adr-NNNN` token that is not under a read verb records NO read — the measured 66:1 majority — and is sized as a decline instead", () => {
  // Every one of these is a real shape from this disk's history. A loose id matcher records all of
  // them as decision reads, which is how 2,580 false reads would arrive beside 39 true ones.
  const mentions = [
    'echo "=== ADR-0404 increments ==="; grep -n increment packages/cli/src/adr.ts',
    'pnpm storytree arc increment close structured-units --note "Dropped: ADR-0306 D3 parks units" --pg',
    'git commit -m "feat: adopt adr-0403 dec 7"',
    'pnpm storytree question new --arc directional-dag-arc --title "Did ADR-0146 retire suggestions?"',
    // A read of the CHANGE LOG, not of the document.
    "pnpm storytree library artifact history adr-0403 --pg",
    // A write wearing a read's shape.
    "pnpm storytree library artifact adr-0403 --set status=accepted --pg",
    "pnpm storytree adr push 403 --file /tmp/a.md --pg",
    "pnpm storytree adr new --title 'x' --pg",
    // A SEARCH over the log, which names no single decision at all.
    "pnpm storytree adr list --load-bearing",
  ];
  for (const command of mentions) {
    assert.deepEqual(scrapeCliDecisionReads(command).reads, [], command);
  }

  // And the declines are SIZED rather than swallowed: an omission is acceptable only while declared.
  assert.deepEqual(scrapeCliDecisionReads("pnpm storytree adr list --current").declinedVerbs, ["adr list"]);
  assert.deepEqual(
    scrapeCliDecisionReads("pnpm storytree library artifact adr-0403 --set status=accepted --pg").declinedVerbs,
    ["library artifact --set"],
  );
});

test("a-non-decision-artifact-is-never-a-decision-read: an ordinary artifact read records nothing, and the strict four-digit id guard keeps every near-miss id out", () => {
  for (const command of [
    "pnpm storytree library artifact merge-ceremony --pg",
    // `adr-health-notes` is a LEGAL artifact id. Accepting any `adr-` prefix would merge it with a
    // decision and hand it that decision's edges — a plausible graph, and silently the wrong one.
    "pnpm storytree library artifact adr-health-notes --pg",
    "pnpm storytree library artifact adr-04031 --pg",
    "pnpm storytree library artifact adr-403 --pg",
  ]) {
    assert.deepEqual(scrapeCliDecisionReads(command).reads, [], command);
  }
});

test("a-raw-field-read-is-not-a-whole-document-read: `--raw <field>` reads ONE stored field and is recorded at that strength, rather than inflating every re-read ratio taken from the trace", () => {
  assert.deepEqual(scrapeCliDecisionReads("pnpm storytree library artifact adr-0403 --raw body --pg").reads, [
    { nodeId: "adr-0403", strength: "front_matter_read" },
  ]);
  assert.deepEqual(scrapeCliDecisionReads("pnpm storytree library artifact adr-0403 --pg").reads, [
    { nodeId: "adr-0403", strength: "full_payload_read" },
  ]);
  // Weakest strength wins when one command does both, matching the live observer's own rule.
  assert.deepEqual(
    scrapeCliDecisionReads(
      "pnpm storytree library artifact adr-0403 --pg; pnpm storytree library artifact adr-0403 --raw body --out /tmp/b.txt",
    ).reads,
    [{ nodeId: "adr-0403", strength: "front_matter_read" }],
  );
});

test("a-heredoc-body-never-mints-a-store-read: a `storytree` verb quoted inside a heredoc BODY is authored prose rather than an invocation, and mints nothing", () => {
  const command = [
    "python - <<'PY'",
    "s = '''",
    "pnpm storytree library artifact adr-0403 --pg",
    "pnpm storytree adr pull 403",
    "'''",
    "PY",
  ].join("\n");
  assert.deepEqual(scrapeCliDecisionReads(command).reads, []);
});

// ---------------------------------------------------------------------------------------------
// THE ZERO ITSELF — the property whose absence hid this module's own defect for a whole migration
// ---------------------------------------------------------------------------------------------

test("the-pre-filter-is-never-narrower-than-the-matcher: a transcript whose only decision read is a STORE read is scanned, though it contains no `decisions/` substring anywhere", () => {
  // THE REGRESSION GUARD FOR THIS INCREMENT'S OWN DEFECT CLASS. `scanTranscriptDecisionReads` skips
  // a whole file on a cheap substring test, so a pre-filter that still asked only for `decisions/`
  // would return an empty scan here WITHOUT EXAMINING A SINGLE TOOL CALL — and an unscanned file and
  // a file with nothing in it are indistinguishable in the result. Narrow DECISION_HINT back to the
  // old pattern and this goes red; that is the mutation this test exists to catch.
  const dir = freshDir("prefilter");
  const file = path.join(dir, "store-only.jsonl");
  writeTranscript(file, [
    toolUseLine({
      cwd: worktreeCwd("agent-store"),
      timestamp: "2026-08-22T10:00:00.000Z",
      toolUseId: "toolu_store",
      name: "Bash",
      input: { command: "pnpm storytree library artifact adr-0403 --pg" },
    }),
  ]);

  assert.equal(
    fs.readFileSync(file, "utf8").includes("decisions/"),
    false,
    "the fixture must not smuggle the old shape back in — that is what would keep this green",
  );

  assert.deepEqual(
    scanTranscriptDecisionReads(file).reads.map((read) => [read.nodeId, read.shape]),
    [["adr-0403", "cli"]],
  );
});

test("a-zero-is-reported-with-the-mentions-that-qualify-it: reads and mentions are counted independently, so 'nobody read a decision' and 'this extractor can no longer see one' stop looking identical", () => {
  const dir = freshDir("mentions");

  // A transcript that talks about decisions constantly and reads none — precisely the state this
  // module sat in from the moment `docs/decisions/` was deleted, reporting a clean zero throughout.
  const blind = path.join(dir, "blind.jsonl");
  writeTranscript(blind, [
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
  const blindScan = scanTranscriptDecisionReads(blind);
  assert.deepEqual(blindScan.reads, []);
  assert.equal(blindScan.decisionMentions, 2, "both calls named a decision and neither yielded a read");

  // And the other zero, which really is an answer: no reads AND nothing named.
  const quiet = path.join(dir, "quiet.jsonl");
  writeTranscript(quiet, [
    toolUseLine({
      cwd: worktreeCwd("agent-quiet"),
      timestamp: "2026-08-22T10:00:00.000Z",
      toolUseId: "toolu_q1",
      name: "Read",
      input: { file_path: "packages/library/src/knowledge.ts" },
    }),
  ]);
  const quietScan = scanTranscriptDecisionReads(quiet);
  assert.deepEqual(quietScan.reads, []);
  assert.equal(quietScan.decisionMentions, 0, "an ordinary source read names no decision at all");
});
