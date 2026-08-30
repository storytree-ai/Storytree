// The RENDER, pinned whole.
//
// One golden assertion rather than a dozen `assert.match` probes, and the reason is mechanical:
// `check:mutation-diff` reds on a single surviving mutant, and a render is mostly string literals —
// every prose word, every column width, every separator is its own mutant. A partial assertion kills
// the words it happens to quote and leaves the rest standing, so the honest options are to pin the
// whole output or to leave the render unproven. It is also the assertion a reader wants: what this
// command PRINTS is its entire observable behaviour.
//
// It is deliberately brittle. Changing the wording is meant to fail here, and updating this string
// is the moment to check the new wording still says what `vocabularyHelp` promises — that frequency
// SELECTS candidates and licenses no authoring.

import assert from "node:assert/strict";
import test from "node:test";

import type { DefinitionDoc } from "../definition-injection.mjs";
import { vocabularyCommand, vocabularyHelp, type VocabularyDeps } from "./vocabulary.js";

const DEFS: DefinitionDoc[] = [
  { kind: "definition", id: "arc", title: "arc / epic", oneLine: "The initiative overlay." },
];

/** Two transcripts, each one operator prompt, worded differently so neither is deduped. */
function deps(): VocabularyDeps {
  return {
    transcriptDir: () => "/t",
    collect: () => ["/t/a.jsonl", "/t/b.jsonl"],
    readFile: (file) =>
      JSON.stringify({
        type: "user",
        promptSource: "sdk",
        message: { content: `drive the gizmo widget to landed, from ${file}` },
      }),
    definitions: () => DEFS,
  };
}

const EXPECTED_BODY = [
  "storytree vocabulary — 3 candidate(s) above the threshold",
  "",
  "  hit rate:   0 of 2 owner prompts (0.0%) resolve at least one definition",
  "  corpus:     1 definitions · 2 transcripts read (this repo only, worktrees included)",
  "  threshold:  a term must appear in 2+ distinct sessions",
  "",
  "  term                            ownerSess  sessSess  ownerN  sessN",
  "  drive                                  2         0       2      0",
  "  drive the                              2         0       2      0",
  "  drive the gizmo                        2         0       2      0",
  "",
  "  Frequency SELECTS; it does not license authoring. Promote a term only when it names",
  "  an object or an act the system treats as one thing, and a reader who mis-resolves it",
  "  does the wrong work. Prefer widening an existing definition's title (`arc / epic`)",
  "  to minting a twin — the matcher reads slash-separated title parts as surfaces.",
].join("\n");

test("the render is exactly this, headline and table and closing caveat", () => {
  const env = vocabularyCommand(deps(), { minSessions: 2, limit: 3 });
  assert.equal(env.ok, true);
  assert.equal(env.body, EXPECTED_BODY);
  assert.deepEqual(env.next, [
    "storytree library artifact list definition",
    'storytree library search "<term>"',
  ]);
});

test("--limit truncates the table and the headline counts what is SHOWN", () => {
  const one = vocabularyCommand(deps(), { minSessions: 2, limit: 1 });
  assert.match(one.body, /^storytree vocabulary — 1 candidate\(s\) above the threshold\n/);
  assert.equal(one.body.split("\n").filter((l) => l.startsWith("  drive")).length, 1);
});

test("the empty render says nothing cleared the threshold instead of an empty table", () => {
  const env = vocabularyCommand(deps(), { minSessions: 99 });
  assert.equal(
    env.body,
    [
      "storytree vocabulary — 0 candidate(s) above the threshold",
      "",
      "  hit rate:   0 of 2 owner prompts (0.0%) resolve at least one definition",
      "  corpus:     1 definitions · 2 transcripts read (this repo only, worktrees included)",
      "  threshold:  a term must appear in 99+ distinct sessions",
      "",
      "  No unresolved term clears the threshold — nothing to promote on this reading.",
    ].join("\n"),
  );
});

test("a run over no transcripts reports n/a rather than dividing by zero", () => {
  const env = vocabularyCommand({ ...deps(), collect: () => [] });
  assert.match(env.body, /hit rate: {3}0 of 0 owner prompts \(n\/a\) resolve/);
});

test("the help page is exactly this", () => {
  assert.equal(
    vocabularyHelp().body,
    [
      "storytree vocabulary",
      "",
      "Which words are in heavy use here, and which of them resolve to no `definition`?",
      "",
      "  storytree vocabulary [--limit <n>]",
      "",
      "Reads the local session transcripts, ranks terms by DOCUMENT frequency (distinct sessions,",
      "so one verbose session cannot promote a word), drops everything the shipped injector already",
      "resolves, and prints the residue. Offline: no store, no credentials.",
      "",
      "The headline is the injector's HIT RATE over the owner-prompt corpus — the figure the",
      "definition tier is trying to move — so every run is a before/after against one instrument.",
      "",
      "It REPORTS; it never authors. Frequency selects candidates and never licenses writing one,",
      "and widening an existing definition's title is usually cheaper than minting a new artifact",
      "(`edit-first-curation`) — the matcher reads slash-separated title parts as surfaces, so",
      "`arc / epic` gives one artifact two.",
      "",
      "A term must appear in 6+ distinct sessions to be reported. That floor is fixed rather than a",
      "flag: it is what stops one verbose transcript promoting its own vocabulary, so loosening it",
      "per-run would quietly undo the ranking's whole guarantee.",
    ].join("\n"),
  );
  assert.deepEqual(vocabularyHelp().next, [
    "storytree library artifact list definition",
    "storytree vocabulary --limit 50",
  ]);
});
