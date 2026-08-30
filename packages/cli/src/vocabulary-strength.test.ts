// The DECISIONS this verb makes, each pinned where it is made.
//
// `vocabulary.test.ts` beside this proves what the command DOES; `vocabulary-render.test.ts` pins
// what it PRINTS. This file exists because a third class of behaviour is reachable from neither: the
// small decisions inside the pipeline — which words are stopwords, where the length boundaries fall,
// which malformed transcript shapes are survivable — whose only observable effect is a number two
// layers up. `check:mutation-diff` reds on a SINGLE surviving mutant, so a decision that no input
// can distinguish is not a stylistic gap here; it is a red gate.
//
// Two shapes are used deliberately:
//   - BOUNDARIES ARE TESTED FROM BOTH SIDES. A `<=` and a `<` differ on exactly one value, so a test
//     that only shows the far side of a threshold proves the threshold exists and not where it is.
//   - THE MALFORMED-INPUT TESTS USE `null`, NOT JUNK. Every defensive guard in `splitTranscript`
//     survives a string or a number by accident — the property access simply returns `undefined`.
//     `null` is the one value that throws, so it is the only input that proves the guard is load-
//     bearing rather than decorative.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DefinitionDoc } from "../definition-injection.mjs";
import { run } from "./commands.js";
import { InMemoryStore } from "@storytree/storage-protocol";
import {
  asRecord,
  defaultVocabularyDeps,
  GRAM_WIDTHS,
  byRank,
  gramsOfWidth,
  isGeneric,
  MAX_GRAM,
  normalize,
  rankVocabulary,
  repoRootOf,
  repoTranscriptPrefix,
  splitTranscript,
  tokenize,
  vocabularyCommand,
  vocabularyOptionsFrom,
  type SessionText,
  type VocabularyDeps,
} from "./vocabulary.js";

const DEFS: DefinitionDoc[] = [
  { kind: "definition", id: "arc", title: "arc / epic", oneLine: "The initiative overlay." },
];

/** `n` sessions each saying `phrase` once as the operator, worded distinctly so none is deduped. */
function ownerSessions(n: number, phrase: string): SessionText[] {
  return Array.from({ length: n }, (_unused, i) => ({
    owner: [`${phrase} (asked on day ${i + 1})`],
    session: [],
  }));
}

/** One transcript line as the harness writes it for a genuinely submitted prompt. */
function ownerLine(text: string): string {
  return JSON.stringify({ type: "user", promptSource: "sdk", message: { content: text } });
}

// ── the stopword list ─────────────────────────────────────────────────────────────────────────

// Every chunk of the STOPWORDS blob is its own string literal, so each needs a probe made only of
// words from THAT chunk — and only words of three characters or more, since `isGeneric` passes
// anything shorter on length alone and would answer `true` whether or not the word is a stopword.
const STOPWORD_PROBES: readonly string[] = [
  "the and but",
  "been have with",
  "your their which",
  "few most such",
  "again because during",
  "never through would",
  "going three second",
  "small different point",
  "time days week",
  "seen look told",
  "take give find",
  "leave come already",
  "quite maybe please",
  "didnt wasnt couldnt",
  "via per something",
];

test("every chunk of the stopword list is load-bearing", () => {
  for (const probe of STOPWORD_PROBES) {
    assert.equal(isGeneric(probe), true, `"${probe}" is made only of stopwords`);
  }
});

test("a gram is generic only when EVERY token is a stopword or shorter than three characters", () => {
  assert.equal(isGeneric("xy"), true, "two characters carries no meaning, stopword or not");
  assert.equal(isGeneric("abc"), false, "three characters is long enough to mean something");
  assert.equal(isGeneric("the sprocket"), false, "one real word makes the whole gram real");
  assert.equal(isGeneric("sprocket lathe"), false);
});

// ── normalisation and tokenising ──────────────────────────────────────────────────────────────

test("normalize lowercases, collapses hyphen and underscore, and folds runs of whitespace", () => {
  assert.equal(normalize("Fan-Out_Lane"), "fan out lane", "hyphen and underscore become a space");
  assert.equal(normalize("a  \n\t b"), "a b", "a RUN of whitespace folds to one space, not each");
});

test("tokenize drops single characters and punctuation, and answers empty rather than null", () => {
  assert.deepEqual(tokenize("Fan-Out v2 — a test"), ["fan", "out", "v2", "test"]);
  assert.deepEqual(tokenize("!! ?? -- ."), [], "no word at all is an empty list, never a crash");
});

// ── the ranking's boundaries ──────────────────────────────────────────────────────────────────

test("a four-character term IS a candidate — the floor excludes three, not four", () => {
  const read = rankVocabulary(ownerSessions(6, "please fork the sprocket now"), DEFS, {
    minSessions: 6,
  });
  assert.ok(
    read.candidates.some((c) => c.term === "fork"),
    "four characters clears the floor",
  );
});

test("a prompt of exactly 25 characters is too short to score; 26 is long enough", () => {
  const twentyFive = "a".repeat(25);
  const twentySix = "b".repeat(26);
  assert.equal(twentyFive.length, 25);
  assert.equal(
    rankVocabulary([{ owner: [twentyFive], session: [] }], DEFS).promptsScored,
    0,
    "the boundary is exclusive at 25",
  );
  assert.equal(
    rankVocabulary([{ owner: [twentySix], session: [] }], DEFS).promptsScored,
    1,
    "one character more is scored",
  );
});

test("the verbatim-prompt dedupe compares TRIMMED text, so whitespace cannot fake a second use", () => {
  const prompt = "drive the sprocket lathe to landed";
  const read = rankVocabulary(
    [
      { owner: [`  ${prompt}  `], session: [] },
      { owner: [prompt], session: [] },
    ],
    DEFS,
  );
  assert.equal(read.promptsScored, 1, "the same prompt, differently padded, is one prompt");
});

test("the grams of one width are every window of that width, and nothing past the end", () => {
  // Asserted on the GENERATOR rather than on a ranked count two layers up: an off-by-one at the end
  // of the token list adds grams that the candidate LIST cannot show, because the extras are either
  // empty or duplicates of shorter grams. Here the whole result is visible.
  assert.deepEqual(gramsOfWidth(["a", "b", "c"], 1), ["a", "b", "c"]);
  assert.deepEqual(gramsOfWidth(["a", "b", "c"], 2), ["a b", "b c"]);
  assert.deepEqual(gramsOfWidth(["a", "b", "c"], 3), ["a b c"]);
  assert.deepEqual(gramsOfWidth(["a", "b"], 3), [], "a width wider than the text yields nothing");
  assert.deepEqual(gramsOfWidth([], 1), [], "and no tokens yields nothing rather than one empty gram");
});

test("the counted widths are one through three, and MAX_GRAM cannot disagree with them", () => {
  assert.deepEqual([...GRAM_WIDTHS], [1, 2, 3]);
  assert.equal(MAX_GRAM, 3);
});

test("a gram at the very end of a prompt is counted once, not twice", () => {
  const read = rankVocabulary(
    Array.from({ length: 6 }, (_unused, i) => ({
      owner: [`pass ${i + 1} of the review, then run the sprocket lathe`],
      session: [],
    })),
    DEFS,
    { minSessions: 6 },
  );
  const term = read.candidates.find((c) => c.term === "sprocket lathe");
  assert.ok(term, "the trailing two-word term is a candidate");
  assert.equal(term.ownerUses, 6, "once per session, and the phrase ENDS each prompt");
  assert.equal(term.ownerSessions, 6);
});

/** One candidate, named and weighted — the two use counts play no part in the order. */
function candidate(term: string, ownerSessions: number, sessionSessions: number) {
  return { term, ownerSessions, sessionSessions, ownerUses: 0, sessionUses: 0 };
}

test("the candidate order is owner sessions, then session sessions, then the alphabet", () => {
  // Each pair is asked in BOTH directions. A comparator that returns the same sign both ways is
  // not merely mis-ordered, it is inconsistent — and an inconsistent comparator can still leave an
  // already-ordered array alone, which is exactly how a broken tie-break passes a sorted-output test.
  assert.ok(
    byRank(candidate("alpha", 9, 0), candidate("zebra", 8, 9)) < 0,
    "owner sessions outrank session sessions",
  );
  assert.ok(byRank(candidate("zebra", 8, 9), candidate("alpha", 9, 0)) > 0, "and the reverse");
  assert.ok(
    byRank(candidate("alpha", 8, 8), candidate("zebra", 8, 6)) < 0,
    "tied on the owner, more session uses ranks first — though the alphabet agrees here",
  );
  assert.ok(
    byRank(candidate("alpha", 8, 6), candidate("zebra", 8, 8)) > 0,
    "and against the alphabet: fewer session uses ranks LAST even when named first",
  );
  assert.ok(byRank(candidate("alpha", 8, 8), candidate("zebra", 8, 8)) < 0, "a full tie is alphabetical");
  assert.ok(byRank(candidate("zebra", 8, 8), candidate("alpha", 8, 8)) > 0);
});

// ── what counts as the operator's text ────────────────────────────────────────────────────────

test("machine text is recognised only at the START of a prompt, never inside one", () => {
  const inside = ownerLine("please explain what the <system-reminder> block is doing here");
  const atStart = ownerLine("<system-reminder>the file changed on disk</system-reminder>");
  assert.deepEqual(
    splitTranscript(inside).owner,
    ["please explain what the <system-reminder> block is doing here"],
    "a prompt ABOUT machine text is still the operator's",
  );
  assert.deepEqual(splitTranscript(atStart).owner, [], "a prompt that IS machine text is not");
});

test("a prompt of exactly 3000 characters is kept; one character more is machine text", () => {
  const exact = "z".repeat(3000);
  const over = "z".repeat(3001);
  assert.deepEqual(splitTranscript(ownerLine(exact)).owner, [exact], "the boundary is exclusive");
  assert.deepEqual(splitTranscript(ownerLine(over)).owner, [], "3001 is over it");
});

test("a null entry, a null message, and a null content part are each survived, not thrown on", () => {
  // `null` is the only shape that makes these guards load-bearing: every other malformed value
  // returns `undefined` from the property access below it and is dropped without a guard at all.
  const raw = [
    "null",
    JSON.stringify({ type: "user", promptSource: "sdk", message: null }),
    JSON.stringify({
      type: "user",
      promptSource: "sdk",
      message: { content: [null, { type: "text", text: "the surviving sprocket lathe prompt" }] },
    }),
  ].join("\n");
  const split = splitTranscript(raw);
  assert.deepEqual(split.owner, ["the surviving sprocket lathe prompt"]);
  assert.deepEqual(split.session, []);
});

// ── the command's own reads ───────────────────────────────────────────────────────────────────

test("a transcript that yields no text at all is not counted as a session", () => {
  const deps: VocabularyDeps = {
    transcriptDir: () => "/t",
    collect: () => ["/t/empty.jsonl", "/t/owner-only.jsonl", "/t/session-only.jsonl"],
    readFile: (file) => {
      if (file.endsWith("empty.jsonl")) return "not json at all\n\n";
      if (file.endsWith("owner-only.jsonl")) return ownerLine("a prompt from the operator alone");
      return JSON.stringify({ type: "assistant", message: { content: "the session speaking" } });
    },
    definitions: () => DEFS,
  };
  const env = vocabularyCommand(deps, { minSessions: 1 });
  assert.equal(env.ok, true);
  assert.match(env.body, /2 transcripts read/, "the text-free one is dropped");
  assert.match(
    env.body,
    /hit rate:\s+0 of 1 owner prompts/,
    "the OWNER-only transcript is kept — its prompt is scored",
  );
  assert.match(
    env.body,
    /session speaking\s+0\s+1\s+0\s+1/,
    "and the SESSION-only transcript is kept — its terms reach the table on the session side",
  );
});

test("the hit rate is a percentage of the prompts, not of a hundred or a product", () => {
  const deps: VocabularyDeps = {
    transcriptDir: () => "/t",
    collect: () => ["/t/a.jsonl"],
    readFile: () =>
      [
        ownerLine("what shape does the arc take when it closes"),
        ownerLine("the sprocket lathe needs a second pass before it lands"),
        ownerLine("run the sprocket lathe over the whole corpus this time"),
        ownerLine("check the sprocket lathe against yesterday's numbers please"),
      ].join("\n"),
    definitions: () => DEFS,
  };
  const env = vocabularyCommand(deps, { minSessions: 1 });
  assert.match(
    env.body,
    /hit rate:\s+1 of 4 owner prompts \(25\.0%\)/,
    "one prompt in four names a definition",
  );
});

test("the default deps resolve the committed projection beside the injector, with no argument", () => {
  // The path is built from this module's own URL rather than from the cwd, so it must be proven by
  // actually READING it — a wrong number of `..` segments still returns a plausible-looking string.
  const defs = defaultVocabularyDeps().definitions();
  assert.ok(Array.isArray(defs) && defs.length > 0, "the projection parses to a non-empty list");
  assert.ok(
    defs.every((d) => typeof d.id === "string" && typeof d.oneLine === "string"),
    "and carries the id/oneLine pair the injector reads",
  );
});

// ── the dispatch arm ──────────────────────────────────────────────────────────────────────────

/**
 * The arm calls `defaultVocabularyDeps()` against the real filesystem, so the only way to reach it
 * without reading this box's actual transcripts is the transcript-root override the discovery helper
 * already honours. The directory name is computed rather than hardcoded, because the harness's slug
 * is derived from the repo path and so differs between this box and CI.
 */
async function withTranscripts<T>(
  files: readonly string[],
  body: () => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "vocab-arm-"));
  const previous = process.env["STORYTREE_TRANSCRIPT_DIR"];
  try {
    const dir = path.join(root, repoTranscriptPrefix(repoRootOf(process.cwd())));
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < files.length; i++) {
      await writeFile(path.join(dir, `s${i}.jsonl`), files[i]!);
    }
    process.env["STORYTREE_TRANSCRIPT_DIR"] = root;
    return await body();
  } finally {
    if (previous === undefined) delete process.env["STORYTREE_TRANSCRIPT_DIR"];
    else process.env["STORYTREE_TRANSCRIPT_DIR"] = previous;
    await rm(root, { recursive: true, force: true });
  }
}

/** Eight sessions naming two invented terms, so both clear the default session threshold. */
const ARM_TRANSCRIPTS: readonly string[] = Array.from({ length: 8 }, (_unused, i) =>
  ownerLine(`the sprocket lathe and the widget forge both need a look, pass ${i + 1}`),
);

test("the arm reports over the real deps, and --limit narrows what it reports", async () => {
  await withTranscripts(ARM_TRANSCRIPTS, async () => {
    const store = new InMemoryStore();
    const full = await run(["vocabulary"], { store });
    assert.equal(full.ok, true);
    assert.match(full.body, /storytree vocabulary — \d+ candidate\(s\) above the threshold/);
    assert.match(full.body, /sprocket lathe/, "the invented term is found in the fixture");

    const limited = await run(["vocabulary", "--limit", "1"], { store });
    assert.equal(limited.ok, true);
    assert.match(limited.body, /storytree vocabulary — 1 candidate\(s\) above the threshold/);
    assert.ok(
      limited.body.length < full.body.length,
      "the limit reaches the render, so the table is genuinely shorter",
    );
  });
});

test("a record is a record, and `null` is not one however its typeof reads", () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
  assert.deepEqual(asRecord([1]), [1], "an array is a record for this read");
  assert.equal(asRecord(null), undefined, "`typeof null` is \"object\", which is the whole trap");
  assert.equal(asRecord(undefined), undefined);
  assert.equal(asRecord(42), undefined);
  assert.equal(asRecord("a string"), undefined);
});

test("--limit becomes the options the command takes, an ABSENT key rather than an undefined one", () => {
  assert.deepEqual(vocabularyOptionsFrom("12"), { options: { limit: 12 } });
  assert.deepEqual(vocabularyOptionsFrom(undefined), { options: {} }, "no key, not `limit: undefined`");
  assert.deepEqual(vocabularyOptionsFrom(true), { options: {} }, "a boolean flag carries no limit");
  const refused = vocabularyOptionsFrom("0");
  assert.deepEqual(refused.options, {}, "a refusal carries no options to run with");
  assert.match(String(refused.refusal), /--limit must be a positive whole number, got "0"/);
});

test("the arm answers for `vocabulary` and swallows nothing else", async () => {
  // The arm's own guard is otherwise proven only by `cli-areas.test.ts`, which sweeps every area
  // generically — and a mutant forced TRUE is invisible to a test that only ever asks for this one
  // area. An area the arm does not own has to fall THROUGH it to the dispatch's refusal.
  const env = await run(["definitely-not-an-area", "--help"], { store: new InMemoryStore() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown area "definitely-not-an-area"/);
});

test("the arm refuses a --limit that is not a positive whole number, and points at its help", async () => {
  await withTranscripts(ARM_TRANSCRIPTS, async () => {
    const refused = await run(["vocabulary", "--limit", "0"], { store: new InMemoryStore() });
    assert.equal(refused.ok, false);
    assert.match(refused.body, /--limit must be a positive whole number, got "0"/);
    assert.deepEqual(refused.next, ["storytree vocabulary --help"]);
  });
});
