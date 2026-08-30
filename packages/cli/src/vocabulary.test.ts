import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DefinitionDoc } from "../definition-injection.mjs";
import {
  DEFAULT_MIN_SESSIONS,
  defaultVocabularyDeps,
  parseLimitFlag,
  rankVocabulary,
  repoRootOf,
  repoTranscriptPrefix,
  splitTranscript,
  vocabularyCommand,
  vocabularyHelp,
  type SessionText,
  type VocabularyDeps,
} from "./vocabulary.js";

const DEFS: DefinitionDoc[] = [
  { kind: "definition", id: "arc", title: "arc / epic", oneLine: "The initiative overlay." },
  { kind: "definition", id: "verdict", title: "verdict", oneLine: "A signed proof record." },
];

/**
 * `n` sessions that each say `phrase` once, as the owner — each in a DISTINCT wording, because
 * verbatim-identical prompts are deduped as templates (see the dedupe test below).
 */
function ownerSessions(n: number, phrase: string): SessionText[] {
  return Array.from({ length: n }, (_unused, i) => ({
    owner: [`${phrase} (asked on day ${i + 1})`],
    session: [],
  }));
}

test("a term used across many sessions with no definition is a candidate", () => {
  const read = rankVocabulary(ownerSessions(8, "please drive the increment to landed"), DEFS, {
    minSessions: 6,
  });
  const terms = read.candidates.map((c) => c.term);
  assert.ok(terms.includes("increment"), `expected 'increment' among ${terms.join(", ")}`);
  assert.equal(read.candidates.find((c) => c.term === "increment")?.ownerSessions, 8);
});

test("a term the shipped injector already resolves is never a candidate", () => {
  const read = rankVocabulary(ownerSessions(8, "drive the arc to closed"), DEFS, { minSessions: 6 });
  assert.ok(!read.candidates.some((c) => c.term === "arc"));
});

test("a SURFACE the injector reaches only through a title part is also excluded", () => {
  // `epic` resolves only because `arc`'s title is "arc / epic". A second matcher would miss that
  // and report `epic` as unresolvable, which is the whole reason the injector is asked rather than
  // reimplemented.
  const read = rankVocabulary(ownerSessions(9, "land an epic for this work"), DEFS, {
    minSessions: 6,
  });
  assert.ok(!read.candidates.some((c) => c.term === "epic"));
});

test("ranking is by DOCUMENT frequency, so one verbose session cannot promote a word", () => {
  const shouty: SessionText = {
    owner: [Array.from({ length: 50 }, () => "widget").join(" ")],
    session: [],
  };
  const spread = ownerSessions(7, "the gizmo needs attention");
  const read = rankVocabulary([shouty, ...spread], DEFS, { minSessions: 6 });
  const terms = read.candidates.map((c) => c.term);
  assert.ok(terms.includes("gizmo"), "a term spread across sessions clears the threshold");
  assert.ok(!terms.includes("widget"), "50 uses in ONE session must not clear it");
});

test("generic grammar fragments are dropped", () => {
  const read = rankVocabulary(ownerSessions(9, "and then we should just go about it"), DEFS, {
    minSessions: 6,
  });
  assert.deepEqual(read.candidates, []);
});

test("the hit rate counts owner prompts that resolve at least one definition", () => {
  const sessions: SessionText[] = [
    { owner: ["please drive the arc to closed today, thanks"], session: [] },
    { owner: ["the gizmo needs a good deal more attention than that"], session: [] },
  ];
  const read = rankVocabulary(sessions, DEFS, { minSessions: 1 });
  assert.equal(read.promptsScored, 2);
  assert.equal(read.promptsResolved, 1);
});

test("prompts too short to carry a term are not scored", () => {
  const read = rankVocabulary([{ owner: ["ok"], session: [] }], DEFS, { minSessions: 1 });
  assert.equal(read.promptsScored, 0);
});

test("splitTranscript separates operator text from session text", () => {
  const raw = [
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "drive the increment" } }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "driving it now" }] },
    }),
  ].join("\n");
  const split = splitTranscript(raw);
  assert.deepEqual(split.owner, ["drive the increment"]);
  assert.deepEqual(split.session, ["driving it now"]);
});

test("machine-generated text in the user slot is not counted as the operator's", () => {
  const raw = [
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "<task-notification>done</task-notification>" } }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "[storytree] Library definitions for terms" } }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "a real thing the operator typed" } }),
  ].join("\n");
  const split = splitTranscript(raw);
  assert.deepEqual(split.owner, ["a real thing the operator typed"]);
});

test("a malformed transcript line is skipped rather than throwing", () => {
  const raw = ["{not json", JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "still read" } })].join(
    "\n",
  );
  assert.deepEqual(splitTranscript(raw).owner, ["still read"]);
});

test("the command reports the hit rate and the candidates, and never authors", () => {
  const deps: VocabularyDeps = {
    transcriptDir: () => "/transcripts",
    collect: () => ["/transcripts/a.jsonl", "/transcripts/b.jsonl"],
    // Distinct wording per file: identical prompts are deduped as templates.
    readFile: (file) =>
      JSON.stringify({
        type: "user",
        promptSource: "sdk",
        message: { content: `drive the increment to landed please, from ${file}` },
      }),
    definitions: () => DEFS,
  };
  const env = vocabularyCommand(deps, { minSessions: 2 });
  assert.equal(env.ok, true);
  assert.match(env.body, /hit rate:/);
  assert.match(env.body, /increment/);
  assert.match(env.body, /Frequency SELECTS; it does not license authoring/);
});

test("an unreadable transcript is skipped, not fatal", () => {
  const deps: VocabularyDeps = {
    transcriptDir: () => "/transcripts",
    collect: () => ["/gone.jsonl"],
    readFile: () => {
      throw new Error("ENOENT");
    },
    definitions: () => DEFS,
  };
  const env = vocabularyCommand(deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /0 of 0 owner prompts/);
});

test("no candidate above the threshold says so rather than printing an empty table", () => {
  const deps: VocabularyDeps = {
    transcriptDir: () => "/t",
    collect: () => ["/t/a.jsonl"],
    readFile: () => JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "drive the arc to closed" } }),
    definitions: () => DEFS,
  };
  const env = vocabularyCommand(deps, { minSessions: DEFAULT_MIN_SESSIONS });
  assert.match(env.body, /No unresolved term clears the threshold/);
});

test("help names the offline guarantee and the report-not-author stance", () => {
  const env = vocabularyHelp();
  assert.equal(env.ok, true);
  assert.match(env.body, /no store, no credentials/);
  assert.match(env.body, /REPORTS; it never authors/);
});

test("the repo prefix replaces EACH non-alphanumeric character, matching the harness's slug", () => {
  // Per character, not per run: `C:\code` has two adjacent non-alphanumerics and yields TWO dashes.
  // This is checked against real directory names on disk (`C--code-storytree`); collapsing runs
  // would produce a prefix matching nothing, and the scan would silently read zero transcripts.
  assert.equal(repoTranscriptPrefix(String.raw`C:\code\storytree`), "C--code-storytree");
  assert.equal(
    repoTranscriptPrefix(String.raw`C:\code\storytree\.claude\worktrees\slot`),
    "C--code-storytree--claude-worktrees-slot",
  );
  assert.equal(repoTranscriptPrefix("/home/me/storytree"), "-home-me-storytree");
});

test("a worktree scopes to its REPO, so sibling worktrees' sessions are in scope", () => {
  const root = ["C:", "code", "storytree"].join(path.sep);
  const inWorktree = [root, ".claude", "worktrees", "some-slot"].join(path.sep);
  assert.equal(repoRootOf(inWorktree), root);
  assert.equal(repoRootOf(root), root, "the primary checkout is already the root");
});

test("a tool result in the user slot is not the operator (no promptSource)", () => {
  const raw = [
    JSON.stringify({ type: "user", toolUseResult: {}, message: { content: "declared emit json" } }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "a typed prompt" } }),
  ].join("\n");
  assert.deepEqual(splitTranscript(raw).owner, ["a typed prompt"]);
});

test("a SUBAGENT's brief is not the operator's vocabulary (isSidechain)", () => {
  // The system talking to itself: real text, but not a word the owner chose. Counting these
  // inverted the whole ranking when measured against this repo's own transcripts.
  const raw = [
    JSON.stringify({
      type: "user",
      promptSource: "sdk",
      isSidechain: true,
      message: { content: "You are a subagent. Emit the declared status array." },
    }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "drive the increment" } }),
  ].join("\n");
  assert.deepEqual(splitTranscript(raw).owner, ["drive the increment"]);
});

test("a prompt repeated verbatim across sessions counts ONCE (a template, not vocabulary)", () => {
  // The measured failure: one test-fixture prompt appeared in 1,367 transcripts and its words took
  // every top slot. Identical text is one authoring event however many sessions carry it.
  const fixture = "the gizmo emits a declared json array of open questions in the current status";
  const repeated: SessionText[] = Array.from({ length: 20 }, () => ({
    owner: [fixture],
    session: [],
  }));
  const read = rankVocabulary(repeated, DEFS, { minSessions: 6 });
  assert.deepEqual(read.candidates, [], "20 copies of one prompt promote nothing");
  assert.equal(read.promptsScored, 1, "and it is scored once, not twenty times");
});

test("differently-worded prompts about the same term still accumulate", () => {
  const sessions: SessionText[] = [
    "the gizmo needs attention today",
    "can you look at the gizmo again",
    "the gizmo is still wrong here",
    "please fix the gizmo properly",
    "that gizmo came back once more",
    "another gizmo problem to chase",
  ].map((owner) => ({ owner: [owner], session: [] }));
  const read = rankVocabulary(sessions, DEFS, { minSessions: 6 });
  assert.ok(read.candidates.some((c) => c.term === "gizmo"), "distinct prompts are real spread");
});

test("every shape a transcript line can take that is NOT operator text is skipped", () => {
  // Each line here exercises one guard in splitTranscript; the last is the only text that survives.
  const raw = [
    "",
    "   ",
    "[1,2,3]", // valid JSON, not an object
    "null",
    JSON.stringify({ type: "user", promptSource: "sdk" }), // no message
    JSON.stringify({ type: "user", promptSource: "sdk", message: "not an object" }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: null } }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: ["raw string"] } }),
    JSON.stringify({
      type: "user",
      promptSource: "sdk",
      message: { content: [{ type: "tool_result", text: "not text-typed" }] },
    }),
    JSON.stringify({
      type: "user",
      promptSource: "sdk",
      message: { content: [{ type: "text", text: 42 }] },
    }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "   " } }),
    JSON.stringify({ type: "system", promptSource: "sdk", message: { content: "a system note" } }),
    JSON.stringify({ type: "user", promptSource: "sdk", message: { content: "the survivor" } }),
  ].join("\n");
  const split = splitTranscript(raw);
  assert.deepEqual(split.owner, ["the survivor"]);
  assert.deepEqual(split.session, []);
});

test("an over-long user entry is dropped as machine text, at the 3000-character boundary", () => {
  const justUnder = `x ${"a".repeat(2997)}`;
  const justOver = `y ${"b".repeat(2999)}`;
  assert.equal(justUnder.length, 2999);
  assert.ok(justOver.length > 3000);
  const raw = [justUnder, justOver]
    .map((content) => JSON.stringify({ type: "user", promptSource: "sdk", message: { content } }))
    .join("\n");
  assert.deepEqual(splitTranscript(raw).owner, [justUnder]);
});

test("assistant text comes from a string body OR a text part, never other part types", () => {
  const raw = [
    JSON.stringify({ type: "assistant", message: { content: "a bare string body" } }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "kept" }, { type: "tool_use", text: "dropped" }] },
    }),
  ].join("\n");
  assert.deepEqual(splitTranscript(raw).session, ["a bare string body", "kept"]);
});

test("candidates sort by owner sessions, then session sessions, then alphabetically", () => {
  const sessions: SessionText[] = [
    { owner: ["alpha bravo charlie delta"], session: ["bravo"] },
    { owner: ["alpha bravo charlie echo"], session: ["bravo"] },
    { owner: ["alpha bravo foxtrot golf"], session: [] },
    { owner: ["alpha charlie hotel india"], session: [] },
  ];
  const read = rankVocabulary(sessions, DEFS, { minSessions: 2 });
  const ranked = read.candidates.map((c) => `${c.term}:${c.ownerSessions}:${c.sessionSessions}`);
  // Owner sessions first (`alpha` in 4 beats everything); then the session-frequency tiebreak puts
  // `bravo` (3, 2) ahead of the other threes; then alphabetical, so `alpha bravo` precedes
  // `charlie` at (3, 0). The whole order is pinned, because a partial one leaves the comparator's
  // second and third clauses unproven.
  assert.deepEqual(ranked, [
    "alpha:4:0",
    "bravo:3:2",
    "alpha bravo:3:0",
    "charlie:3:0",
    "alpha bravo charlie:2:0",
    "bravo charlie:2:0",
  ]);
});

test("terms shorter than four characters are never candidates", () => {
  const read = rankVocabulary(ownerSessions(8, "the fox ran"), DEFS, { minSessions: 6 });
  assert.ok(!read.candidates.some((c) => c.term.length < 4));
});

test("n-grams run to three words and no further", () => {
  const read = rankVocabulary(ownerSessions(8, "alpha bravo charlie delta echo"), DEFS, {
    minSessions: 6,
  });
  const widths = read.candidates.map((c) => c.term.split(" ").length);
  assert.ok(widths.includes(3), "three-word terms are counted");
  assert.ok(Math.max(...widths) === 3, "and four-word terms are not");
});

test("use counts total every occurrence, while session counts stay per-session", () => {
  const sessions: SessionText[] = [
    { owner: ["gizmo gizmo gizmo here"], session: ["gizmo once"] },
    { owner: ["a second gizmo mention"], session: [] },
  ];
  const read = rankVocabulary(sessions, DEFS, { minSessions: 2 });
  const gizmo = read.candidates.find((c) => c.term === "gizmo");
  assert.equal(gizmo?.ownerSessions, 2);
  assert.equal(gizmo?.ownerUses, 4);
  assert.equal(gizmo?.sessionSessions, 1);
  assert.equal(gizmo?.sessionUses, 1);
});

test("a definition matched only through its ID excludes the term", () => {
  const byId: DefinitionDoc[] = [
    { kind: "definition", id: "proof-mode", title: "Something Else Entirely", oneLine: "…" },
  ];
  const read = rankVocabulary(ownerSessions(8, "explain proof mode to me"), byId, {
    minSessions: 6,
  });
  assert.ok(!read.candidates.some((c) => c.term === "proof mode"));
});

test("--limit parses a positive whole number and refuses everything else", () => {
  assert.deepEqual(parseLimitFlag("12"), { limit: 12 });
  assert.deepEqual(parseLimitFlag("7abc"), { limit: 7 }, "a numeric prefix is taken");
  assert.deepEqual(parseLimitFlag(undefined), {}, "absent is not a refusal");
  assert.deepEqual(parseLimitFlag(true), {}, "a boolean flag is not a limit");
  for (const bad of ["0", "-3", "abc", ""]) {
    const got = parseLimitFlag(bad);
    assert.equal(got.limit, undefined, `${JSON.stringify(bad)} yields no limit`);
    assert.match(String(got.refusal), /--limit must be a positive whole number, got /);
    assert.match(String(got.refusal), new RegExp(JSON.stringify(JSON.stringify(bad)).slice(1, -1)));
  }
});

test("the default deps read this repo's transcript directories and nothing else", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vocab-deps-"));
  try {
    const repo = path.join(root, "repo");
    const prefix = repoTranscriptPrefix(repo);
    const mine = path.join(root, "projects", prefix);
    const sibling = path.join(root, "projects", `${prefix}--claude-worktrees-slot`);
    const other = path.join(root, "projects", "Z--somewhere-else");
    for (const d of [mine, sibling, other]) await mkdir(d, { recursive: true });
    await writeFile(path.join(mine, "a.jsonl"), "primary");
    await writeFile(path.join(sibling, "b.jsonl"), "worktree");
    await writeFile(path.join(other, "c.jsonl"), "another project");

    const defs = path.join(root, "definitions.json");
    await writeFile(defs, JSON.stringify(DEFS));

    const deps = defaultVocabularyDeps(defs, repo);
    const found = [...deps.collect(path.join(root, "projects"))].map((f) => path.basename(f)).sort();
    assert.deepEqual(found, ["a.jsonl", "b.jsonl"], "this repo's own and its worktrees', not others'");
    assert.equal(deps.readFile(path.join(mine, "a.jsonl")), "primary");
    assert.deepEqual(deps.definitions(), DEFS);
    assert.equal(typeof deps.transcriptDir(), "string");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unreadable transcript ROOT yields no files rather than throwing", () => {
  const deps = defaultVocabularyDeps(undefined, "C:\nowhere");
  assert.deepEqual([...deps.collect(path.join(tmpdir(), "definitely-not-here-9e1f"))], []);
});
