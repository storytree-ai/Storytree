/**
 * The SUBJECT cut's classifier (ADR-0524).
 *
 * THE CASES THAT ARE NOT DECORATION, each one a way the bar's highlighted segment could lie:
 *   • shell NOISE must not decline a real read — `2>&1`, a `| head`, a trailing `;` and a `--pg`
 *     are on six of eight real store reads on this disk, so an argv-strict rule under-counts badly;
 *   • a WRITE wearing a read's shape must not count — `library artifact <id> --set` and
 *     `arc increment close` put nothing in front of the caller that the traversal draws;
 *   • an unrecognised storytree verb must fall through to `shell`, never to `other-tool`: it WAS a
 *     command, and mis-filing it would move bytes between two named segments rather than into a
 *     residual;
 *   • a command-carrying tool is matched on the INPUT shape, not its name, so a renamed shell tool
 *     stays shell.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyToolSubject, storytreeReadSurface, toolSubjectLabel, type ToolSubject } from "./tool-subjects.js";

test("EVERY recognised surface, row by row — the table pinned rather than sampled", () => {
  // Each row is a branch of the surface table. Sampled coverage leaves the unsampled rows free to
  // return anything, which is exactly what a mutation run reports as an unkillable table entry.
  const table: readonly (readonly [string, string])[] = [
    ["storytree library artifact adr-0524", "library-artifact"],
    // No third token at all — the shape the write-verb check has to tolerate rather than trip on.
    ["storytree library artifact", "library-artifact"],
    ["storytree library artifact list definition", "library-artifact"],
    ["storytree library artifact history adr-0524 --pg", "library-artifact"],
    ["storytree library", "library-dashboard"],
    ["storytree library --pg", "library-dashboard"],
    ["storytree library search 'claim ledger'", "library-search"],
    ["storytree library related adr-0524 --unlinked", "library-query"],
    ["storytree library query kind=adr", "library-query"],
    ["storytree library tree focus adr-0524", "library-tree-focus"],
    ["storytree library inbound adr-0524", "library-inbound"],
    ["pnpm storytree arc show my-arc --pg", "arc"],
    ["storytree arc list --pg", "arc"],
    ["storytree arc", "arc"],
    ["storytree adr list --load-bearing", "adr"],
    ["storytree adr pull 524 --out x.md", "adr"],
    ["storytree adr show 524", "adr"],
    ["storytree question list --pg", "open-question"],
    ["storytree question show oq-x --pg", "open-question"],
    ["storytree friction list --pg", "friction"],
    ["storytree friction show f-1 --pg", "friction"],
    ["storytree agents session-orchestrator", "agents"],
    ["storytree tree my-story --pg", "tree"],
  ];
  for (const [command, surface] of table) {
    assert.equal(storytreeReadSurface(command), surface, command);
    assert.deepEqual(classifyToolSubject("Bash", { command }), { subject: "knowledge-graph", surface }, command);
  }
});

test("a storytree AREA whose sub-verb is not a read returns null — the branch, not just the area", () => {
  // The area matching and the sub-verb matching are separate decisions, and a test that only ever
  // passes read verbs cannot tell whether the second one runs at all.
  for (const command of [
    "storytree library artifact new --file x.json --pg",
    "storytree arc increment add my-arc --outcome x --pg",
    "storytree adr new --title x --pg",
    "storytree adr next --pg",
    "storytree question settle oq-x --answer y --pg",
    "storytree question new --arc a --title t --pg",
    "storytree friction new --title t --pg",
    "storytree library graduate x --pg",
  ]) {
    assert.equal(storytreeReadSurface(command), null, command);
  }
  // Two rows were REMOVED for scoring zero across 4,232 transcripts — they must stay removed, or the
  // table grows unevidenced entries that silently move bytes out of `shell`.
  assert.equal(storytreeReadSurface("storytree increment show inc-1 --pg"), null, "increment: unevidenced");
  assert.equal(storytreeReadSurface("storytree resteer list --pg"), null, "resteer: unevidenced");
});

test("a launcher is recognised in EVERY spelling it appears in, and in nothing else", () => {
  for (const launcher of [
    "storytree",
    "pnpm storytree",
    "npx tsx packages/cli/src/main.ts",
    "node packages/cli/launch.mjs",
    String.raw`node C:\code\storytree\packages\cli\launch.mjs`,
    "STORYTREE",
  ]) {
    assert.equal(storytreeReadSurface(`${launcher} arc list`), "arc", launcher);
  }
  // A launcher reached by ABSOLUTE PATH: only the base name matches, so a reader that compared the
  // whole path would decline every installed-binary invocation.
  assert.equal(storytreeReadSurface("/usr/local/bin/storytree arc list"), "arc");
  assert.equal(storytreeReadSurface(String.raw`C:\tools\bin\storytree arc list`), "arc");
  // And nothing that merely resembles one. `storytree-web` is a different repo's binary.
  for (const impostor of ["storytree-web", "mystorytree", "packages/cli/src/other.ts", "launch.mjs"]) {
    assert.equal(storytreeReadSurface(`${impostor} arc list`), null, impostor);
  }
});

test("RUNS of whitespace collapse, and empty tokens never take a positional slot", () => {
  // A doubled space or a leading indent is ordinary in a transcript. An empty token is not cosmetic:
  // it takes a POSITIONAL slot, so the read is declined silently and only for commands that happen
  // to be spaced that way.
  assert.equal(storytreeReadSurface("  storytree  arc   list  "), "arc");
  // The sharpest case, because only the TRAILING space matters here: with an empty token kept,
  // `sub` is "" rather than undefined and the dashboard branch is missed entirely.
  assert.equal(storytreeReadSurface("storytree library "), "library-dashboard");
  // A segment holding no token at all — a trailing separator. The tokeniser must answer an empty
  // list rather than nothing, or the launcher search runs on a null.
  assert.equal(storytreeReadSurface("storytree arc list ; "), "arc");
  assert.equal(storytreeReadSurface("   "), null);
  assert.equal(storytreeReadSurface("	 storytree	library  artifact  adr-0524"), "library-artifact");
});

test("a segment with no launcher is SKIPPED, never read as though the launcher were at token 0", () => {
  // The first segment's tokens spell a read exactly. Only the missing launcher disqualifies it, so
  // this is what proves the launcher search is consulted at all.
  assert.equal(storytreeReadSurface("library artifact adr-0524 ; storytree arc list"), "arc");
  assert.equal(storytreeReadSurface("library artifact adr-0524"), null);
});

test("every shell separator starts a new segment, so a launcher anywhere in a line is found", () => {
  // `&&`, `||`, `|`, `;` and a newline. A separator the splitter misses hides every read behind it.
  for (const command of [
    "cd /repo && pnpm storytree arc list --pg",
    "false || storytree arc list",
    "echo hi | storytree arc list",
    "echo hi ; storytree arc list",
    "echo hi\nstorytree arc list",
  ]) {
    assert.equal(storytreeReadSurface(command), "arc", command);
  }
});

test("shell NOISE does not decline a real read — the measured shape of six of eight store reads", () => {
  // A launcher mid-pipeline, a redirect, a pipe, a trailing flag and a `cd &&` prefix: all noise
  // that never reaches argv, and an argv-strict allowlist declines every one of them.
  const noisy = [
    'cd "C:/code/storytree" && pnpm storytree library artifact merge-ceremony --pg 2>&1 | tail -120',
    "pnpm storytree arc show context-window-composition-arc --pg 2>&1 | sed -n '1,140p'",
    "storytree library artifact adr-0524 --raw body --out body.txt --pg",
  ];
  for (const command of noisy) {
    assert.equal(classifyToolSubject("Bash", { command }).subject, "knowledge-graph", command);
  }
});

test("a write wearing a read's shape is NOT the knowledge graph — it is shell", () => {
  const writes = [
    "pnpm storytree library artifact edit adr-0524 --set status=accepted --pg",
    "storytree library artifact adr-0524 --set body=@body.txt --pg",
    // The `--set=value` spelling as well as `--set value`: both are the same write.
    "storytree library artifact adr-0524 --set=body=x --pg",
    // These two carry NO `--set`, so only the write-verb table can refuse them. Without the rows
    // for `edit` and `retire` they would read as ordinary artifact reads.
    "pnpm storytree library artifact edit adr-0524 --pg",
    "pnpm storytree library artifact retire oq-x --reason 'withdrawn' --pg",
    "pnpm storytree arc increment close my-inc --pr 42 --pg",
    "pnpm storytree adr new --title 'x' --pg",
    "pnpm storytree noticeboard declare --node x --pg",
    "pnpm storytree question settle oq-x --answer 'y' --pg",
  ];
  for (const command of writes) {
    assert.equal(classifyToolSubject("Bash", { command }).subject, "shell", command);
    assert.equal(storytreeReadSurface(command), null, command);
  }
});

test("an unrecognised storytree verb falls through to shell, never to other-tool", () => {
  // It WAS a command. Mis-filing it as `other-tool` would move bytes between two NAMED segments of
  // the bar rather than leaving them in the one the reader can act on.
  assert.equal(classifyToolSubject("Bash", { command: "pnpm storytree doctor --dev" }).subject, "shell");
  assert.equal(classifyToolSubject("Bash", { command: "pnpm storytree context" }).subject, "shell");
  assert.equal(classifyToolSubject("Bash", { command: "pnpm gate --scope" }).subject, "shell");
});

test("file tools are file reads, and everything else is other-tool", () => {
  for (const name of ["Read", "Grep", "Glob", "NotebookRead"]) {
    assert.deepEqual(classifyToolSubject(name, { file_path: "/x" }), { subject: "file-read", surface: null });
  }
  for (const name of ["WebFetch", "Write", "Edit", "Task", "TodoWrite"]) {
    assert.equal(classifyToolSubject(name, {}).subject, "other-tool", name);
  }
});

test("a command-carrying tool is matched on its INPUT, not its name — a renamed shell tool stays shell", () => {
  assert.equal(classifyToolSubject("PowerShell", { command: "Get-ChildItem" }).subject, "shell");
  assert.equal(
    classifyToolSubject("PowerShell", { command: "pnpm storytree library artifact x" }).subject,
    "knowledge-graph",
  );
  // A `Read` never carries a command, so the file branch wins even if one somehow appears.
  assert.equal(classifyToolSubject("Read", { command: "storytree library" }).subject, "file-read");
});

test("a command naming several segments answers with the first read it finds", () => {
  // One call's OUTPUT bytes cannot be split between two surfaces without inventing a division, so
  // the classifier commits to one rather than reporting a set the fold could not spend.
  assert.equal(
    storytreeReadSurface("pnpm storytree arc show a --pg && pnpm storytree library artifact b --pg"),
    "arc",
  );
});

test("every subject has a plain-language label", () => {
  const all: ToolSubject[] = ["knowledge-graph", "file-read", "shell", "other-tool", "unattributed"];
  for (const subject of all) assert.ok(toolSubjectLabel(subject).length > 0, subject);
  assert.equal(toolSubjectLabel("knowledge-graph"), "knowledge graph", "the owner's naming, ADR-0524 D3");
});
