import test from "node:test";
import assert from "node:assert/strict";

import {
  contractKey,
  formatContractGrammar,
  GERUND_INTRODUCER,
  judgeContractGrammar,
  parseContractSentence,
  TRIGGER_INTRODUCERS,
  VacuousGrammarSweep,
  type ContractGrammarFacts,
  type DeclaredContract,
} from "./contract-grammar.js";

// ---------------------------------------------------------------------------
// The form classifier — HAND-WRITTEN literal expectations
// ---------------------------------------------------------------------------
//
// THE TABLE BELOW IS WRITTEN OUT BY HAND ON PURPOSE, and iterating `TRIGGER_INTRODUCERS` instead
// would be the exact defect this arc measured twice (`pbt-as-an-additive-proof-leg`,
// `proof-protocol-remaining-weak-files`): an expectation READ OFF ITS OWN SUBJECT cannot fail,
// because a mutant that empties or edits the array edits the expectation with it and the assertion
// stays green. What kills those mutants is a literal set nothing in the module can move.
//
// Every entry is a real lead measured in `stories/**` on 2026-08-27 (ADR-0459 D1), except the four
// EARS keywords, which are kept so a sentence written in the notation still parses.

const TRIGGERED_LEADS: readonly (readonly [string, string])[] = [
  ["when the store answers, the hierarchy is read live", "when"],
  ["while a run is `building` the panel polls the endpoint", "while"],
  ["where a branch overflows the fan cap, a per-node expander renders", "where"],
  ["if the anchor is missing the check refuses", "if"],
  ["after archival the post's prior events are unchanged", "after"],
  ["before the handler runs, claim-acquire is recorded", "before"],
  ["given a broker-POST double that authorizes the caller, the probe reports READY", "given"],
  ["once the poll returns a terminal status the panel stops", "once"],
  ["unless the store is reachable the read degrades to cache", "unless"],
  ["upon a second send both exchanges are present", "upon"],
  ["during revalidation the map exposes a provisional state", "during"],
  ["on a refused claim the tool returns the typed error", "on"],
  ["with `selection={null}` the card renders nothing", "with"],
  ["without `--pg` the focused view omits the presence block", "without"],
  ["over a corpus of 13 artifacts the renderer emits one row each", "over"],
  ["for a story with no capabilities the rollup reports empty", "for"],
  ["against a stale base ref the classifier chooses full scope", "against"],
  ["under a failing store the read comes from the cache", "under"],
  ["from a multi-candidate set the selection yields exactly one maquette", "from"],
];

test("every trigger introducer this grammar accepts classifies its sentence as triggered", () => {
  for (const [sentence, introducer] of TRIGGERED_LEADS) {
    const parse = parseContractSentence({ asserts: sentence, covers: undefined });
    assert.equal(parse.form, "triggered", sentence);
    assert.equal(parse.introducer, introducer, sentence);
  }
});

test("the introducer set holds exactly the nineteen measured leads — no more, no fewer", () => {
  // The counterpart to the table above: that table proves each listed word WORKS, and this proves
  // nothing else was quietly added. Together they pin the set in both directions, which one
  // assertion over the array could not do.
  assert.equal(TRIGGER_INTRODUCERS.length, 19);
  assert.deepEqual(
    [...TRIGGER_INTRODUCERS].sort(),
    [
      "after", "against", "before", "during", "for", "from", "given", "if", "on", "once",
      "over", "unless", "under", "upon", "when", "where", "while", "with", "without",
    ].sort(),
  );
});

test("a gerund lead is a trigger — 96 of the corpus's 307, bigger than when+after+on combined", () => {
  const parse = parseContractSentence({
    asserts: "clicking Build calls the `api` dispatch seam exactly once",
    covers: undefined,
  });
  assert.equal(parse.form, "triggered");
  // The sentinel is written out as a LITERAL, not as `GERUND_INTRODUCER`. Asserting against the
  // exported constant would be the same self-derived expectation the hand-written table above exists
  // to avoid: a mutant rewriting the constant rewrites the expectation with it and stays green.
  assert.equal(parse.introducer, "«gerund»");
  assert.equal(GERUND_INTRODUCER, "«gerund»");
});

test("EARS's OWN CASING parses — `WHEN …` is how the notation is conventionally written", () => {
  // The one thing ADR-0447 D4 adopted is EARS's sentence form, and EARS writes its keywords in CAPS.
  // A case-sensitive lead scan would reject the notation this grammar was narrowed FROM, which is the
  // opposite of ADR-0459 D1's "keep EARS's four so a sentence written in the notation still parses".
  for (const sentence of [
    "WHEN the store answers, the hierarchy is read live",
    "WHILE a run is building, the panel polls",
    "IF the anchor is missing, the check refuses",
    "Given a broker double, the probe reports READY",
  ]) {
    assert.equal(parseContractSentence({ asserts: sentence, covers: undefined }).form, "triggered", sentence);
  }
  assert.equal(
    parseContractSentence({ asserts: "WHEN the store answers, `read()` goes live", covers: undefined })
      .introducer,
    "when",
  );
});

test("an ABSENT sentence parses honestly rather than borrowing a default", () => {
  // The judge short-circuits a missing `asserts` into `asserts-missing` before it reads the parse, so
  // nothing else here exercises this path — and a parse that silently substituted prose for an absent
  // sentence would report a form and a system nobody wrote.
  const parse = parseContractSentence({ asserts: undefined, covers: undefined });
  assert.equal(parse.form, "ubiquitous");
  assert.equal(parse.introducer, null);
  assert.equal(parse.system, "unnamed");
});

test("a CAPITALISED -ing word leads a subject, not a trigger", () => {
  // `Rendering` as a proper noun / identifier is naming the subject. The gerund rule is lowercase-only
  // for exactly this reason, and a mutant dropping the case restriction must be caught.
  const parse = parseContractSentence({
    asserts: "Rendering is delegated to the shared pipeline",
    covers: undefined,
  });
  assert.equal(parse.form, "ubiquitous");
  assert.equal(parse.introducer, null);
});

const UBIQUITOUS_LEADS: readonly string[] = [
  "`createRun(unitId)` returns a unique `runId`",
  "the dispatcher handles `POST /api/chat/reset` and returns false for any other path",
  "an unhandled `SceneKind` maps to an explicit `skipped` descriptor",
  "each exchange renders a prompt echo line above its reply",
  "plain Enter submits and Shift+Enter does not",
];

test("a subject-led sentence is ubiquitous and names no introducer", () => {
  for (const sentence of UBIQUITOUS_LEADS) {
    const parse = parseContractSentence({ asserts: sentence, covers: undefined });
    assert.equal(parse.form, "ubiquitous", sentence);
    assert.equal(parse.introducer, null, sentence);
  }
});

test("a sentence opening on a code span is a subject, never an introducer", () => {
  // A sentence reading "`onceEvery(n)` returns …" opens on the word `once` INSIDE a code span. Scanning past the
  // backtick would misread the subject as a trigger, so the lead scan excludes backticks.
  const parse = parseContractSentence({
    asserts: "`onceEvery(n)` returns a gate that admits every nth call",
    covers: undefined,
  });
  assert.equal(parse.form, "ubiquitous");
  assert.equal(parse.introducer, null);
});

test("an introducer must be a whole word — `online` does not open a trigger clause", () => {
  const parse = parseContractSentence({
    asserts: "online sessions are listed newest-first by `sessionIndex`",
    covers: undefined,
  });
  assert.equal(parse.form, "ubiquitous");
});

// ---------------------------------------------------------------------------
// The system slot
// ---------------------------------------------------------------------------

test("the system is named by a code span in the sentence", () => {
  const parse = parseContractSentence({
    asserts: "`incrementCheck` returns a drifted verdict past the threshold",
    covers: undefined,
  });
  assert.equal(parse.system, "sentence");
});

test("a `covers` bullet names the system when the sentence carries no code span", () => {
  // MEASURED REFUSAL (ADR-0459 D3): 68 of 307 triggered sentences carry no code span, and their
  // `covers` bullets name the system perfectly well — "after a first send settles …" with
  // `covers: apps/studio/src/components/ChatPanel.tsx`. Demanding both was tried and refused.
  const parse = parseContractSentence({
    asserts: "after a first send settles, both exchanges are present in the transcript, in order",
    covers: "`apps/studio/src/components/ChatPanel.tsx` (the ordered-transcript accumulation)",
  });
  assert.equal(parse.system, "covers");
});

test("neither a code span nor a covers bullet leaves the system unnamed", () => {
  const parse = parseContractSentence({
    asserts: "representative world state becomes the public model",
    covers: undefined,
  });
  assert.equal(parse.system, "unnamed");
});

test("a whitespace-only covers bullet names nothing", () => {
  const parse = parseContractSentence({
    asserts: "representative world state becomes the public model",
    covers: "   ",
  });
  assert.equal(parse.system, "unnamed");
});

// ---------------------------------------------------------------------------
// The judge — the ratchet
// ---------------------------------------------------------------------------

function contract(overrides: Partial<DeclaredContract> & Pick<DeclaredContract, "id">): DeclaredContract {
  return {
    specPath: "stories/cli/thing.md",
    asserts: "`thing()` returns a value",
    covers: undefined,
    ...overrides,
  };
}

function facts(overrides: Partial<ContractGrammarFacts>): ContractGrammarFacts {
  return {
    contracts: [contract({ id: "a" })],
    unchanged: new Set<string>(),
    specCount: 1,
    baseSpecCount: 1,
    branch: "claude/test",
    ...overrides,
  };
}

test("a clean branch passes", () => {
  const verdict = judgeContractGrammar(facts({}));
  assert.equal(verdict.verdict, "pass");
  assert.deepEqual(verdict.breaches, []);
  assert.equal(verdict.charged, 1);
});

test("a NEW contract with no asserts bullet is charged", () => {
  const verdict = judgeContractGrammar(
    facts({ contracts: [contract({ id: "a", asserts: undefined })] }),
  );
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.breaches.length, 1);
  assert.equal(verdict.breaches[0]?.code, "asserts-missing");
  assert.equal(verdict.breaches[0]?.id, "a");
});

test("an EMPTY asserts bullet is the same breach as a missing one", () => {
  const verdict = judgeContractGrammar(facts({ contracts: [contract({ id: "a", asserts: "   " })] }));
  assert.equal(verdict.breaches[0]?.code, "asserts-missing");
});

test("a NEW contract naming its system nowhere is charged", () => {
  const verdict = judgeContractGrammar(
    facts({ contracts: [contract({ id: "a", asserts: "the state becomes the model" })] }),
  );
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.breaches[0]?.code, "system-unnamed");
});

test("a missing asserts bullet reports ONE breach, never two", () => {
  // A contract with no sentence also names no system. Reporting both would send the author to fix a
  // system slot on a contract that has no sentence to put it in.
  const verdict = judgeContractGrammar(
    facts({ contracts: [contract({ id: "a", asserts: undefined, covers: undefined })] }),
  );
  assert.equal(verdict.breaches.length, 1);
  assert.equal(verdict.breaches[0]?.code, "asserts-missing");
});

test("THE RATCHET — an UNCHANGED breaching contract is not charged", () => {
  const broken = contract({ id: "a", asserts: "the state becomes the model" });
  const verdict = judgeContractGrammar(
    facts({
      contracts: [broken],
      unchanged: new Set([contractKey(broken.specPath, broken.id)]),
    }),
  );
  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.charged, 0);
  assert.equal(verdict.declared, 1);
});

test("THE RATCHET — an EDITED breaching contract IS charged, alongside untouched siblings", () => {
  const untouched = contract({ id: "old", asserts: "the state becomes the model" });
  const edited = contract({ id: "new", asserts: "the other state becomes the other model" });
  const verdict = judgeContractGrammar(
    facts({
      contracts: [untouched, edited],
      unchanged: new Set([contractKey(untouched.specPath, untouched.id)]),
    }),
  );
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.breaches.length, 1);
  assert.equal(verdict.breaches[0]?.id, "new");
  assert.equal(verdict.charged, 1);
  assert.equal(verdict.declared, 2);
});

test("the form census counts EVERY declared contract, charged or not", () => {
  // The census is the grammar's read of the corpus, not of the diff — a branch charging nothing still
  // reports what the corpus looks like.
  const verdict = judgeContractGrammar(
    facts({
      contracts: [
        contract({ id: "a", asserts: "when the store answers, `read()` goes live" }),
        contract({ id: "b", asserts: "`read()` returns the cached row" }),
        contract({ id: "c", asserts: "`write()` appends an event" }),
      ],
      unchanged: new Set([contractKey("stories/cli/thing.md", "a")]),
    }),
  );
  assert.equal(verdict.triggered, 1);
  assert.equal(verdict.ubiquitous, 2);
  assert.equal(verdict.declared, 3);
  assert.equal(verdict.charged, 2);
});

test("breaches are ordered by SPEC first — the primary key", () => {
  const bad = "the state becomes the model";
  const verdict = judgeContractGrammar(
    facts({
      contracts: [
        contract({ id: "a", specPath: "stories/z/x.md", asserts: bad }),
        contract({ id: "a", specPath: "stories/a/x.md", asserts: bad }),
      ],
    }),
  );
  assert.deepEqual(
    verdict.breaches.map((b) => b.specPath),
    ["stories/a/x.md", "stories/z/x.md"],
  );
});

test("breaches are then ordered by ID — the tiebreak, observable on its own", () => {
  // Kept SEPARATE from the spec-order test on purpose. With both keys varying at once, a comparator
  // that had lost its tiebreak could still return the expected order by input luck, and the assertion
  // would pass over a real defect. Here every spec path is identical, so ONLY the id tiebreak can
  // produce this order.
  const bad = "the state becomes the model";
  const verdict = judgeContractGrammar(
    facts({
      contracts: [
        contract({ id: "gamma", asserts: bad }),
        contract({ id: "alpha", asserts: bad }),
        contract({ id: "beta", asserts: bad }),
      ],
    }),
  );
  assert.deepEqual(
    verdict.breaches.map((b) => b.id),
    ["alpha", "beta", "gamma"],
  );
});

// ---------------------------------------------------------------------------
// The three vacuity guards — a check that cannot be consulted THROWS
// ---------------------------------------------------------------------------

// EACH GUARD'S MESSAGE IS PINNED, and that is not message-pinning for its own sake. There are three
// guards rather than one BECAUSE the three name three DIFFERENT REPAIRS — a broken disk walk, a broken
// obligation parser, and a broken git read. A guard that fired with a neighbour's wording would send
// the reader to fix the wrong thing, which is the entire cost this split exists to avoid.

test("no capability specs at all is a BLIND CHECK naming the WALK, never a pass", () => {
  assert.throws(
    () => judgeContractGrammar(facts({ specCount: 0 })),
    (err: unknown) =>
      err instanceof VacuousGrammarSweep &&
      err.message.includes("capability-spec walk found no specs under `stories/`"),
  );
});

test("specs but zero contracts parsed is a BLIND CHECK naming the PARSER", () => {
  assert.throws(
    () => judgeContractGrammar(facts({ contracts: [], specCount: 42 })),
    (err: unknown) =>
      err instanceof VacuousGrammarSweep &&
      err.message.includes("no contracts parsed out of 42 capability specs") &&
      err.message.includes("every spec would look clean"),
  );
});

test("an empty BASE against a populated tree is a BLIND CHECK naming the BASE READ", () => {
  // Without this guard a failed `git ls-tree` would charge all 1,254 contracts to one branch.
  assert.throws(
    () => judgeContractGrammar(facts({ baseSpecCount: 0, specCount: 255 })),
    (err: unknown) =>
      err instanceof VacuousGrammarSweep &&
      err.message.includes("the base revision yielded no capability specs while the working tree holds 255") &&
      err.message.includes("every contract in the corpus would be charged to this branch"),
  );
});

test("the guards fire in order — an empty walk is reported as the walk, not as the parse", () => {
  // Both conditions hold here; the message must name the FIRST failure, because "no specs" and "no
  // contracts" are different repairs.
  assert.throws(
    () => judgeContractGrammar(facts({ contracts: [], specCount: 0 })),
    (err: unknown) => err instanceof VacuousGrammarSweep && /walk found no specs/.test(err.message),
  );
});

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

// THE REPORT IS THIS RUNG'S ENTIRE USER INTERFACE, which is why its text is pinned where a library's
// internal error string would not be (the line `proof-protocol-remaining-weak-files` drew: pin PATHS,
// not MESSAGES). Nothing else tells an author what a red means or how to clear it, so a remedy that
// silently changed would be a rung that misdirects every author who trips it.

test("a passing report names the census and the branch", () => {
  const body = formatContractGrammar(
    judgeContractGrammar(
      facts({
        contracts: [
          contract({ id: "a", asserts: "when the store answers, `read()` goes live" }),
          contract({ id: "b", asserts: "`read()` returns the cached row" }),
        ],
      }),
    ),
  );
  assert.ok(body.startsWith("✓ every contract this branch added or edited names its system and its response"), body);
  assert.ok(body.includes("2 contracts declared (1 triggered / 1 ubiquitous), 2 new or edited on claude/test"), body);
});

test("a failing report names every offender, its code and the exact remedy", () => {
  const body = formatContractGrammar(
    judgeContractGrammar(
      facts({ contracts: [contract({ id: "vague-one", asserts: "the state becomes the model" })] }),
    ),
  );
  assert.ok(body.startsWith("✗ 1 contract(s) this branch added or edited do not parse"), body);
  assert.ok(body.includes("  stories/cli/thing.md — `vague-one` [system-unnamed]"), body);
  assert.ok(
    body.includes(
      "name the system mechanically — a `code span` in the asserts sentence, or a " +
        "`- **covers —** …` bullet naming the source it belongs to",
    ),
    body,
  );
});

test("the missing-sentence remedy asks for a SENTENCE, not for a covers bullet", () => {
  // The two remedies are the two repairs, and handing an author the wrong one is the failure the
  // single-breach rule above exists to prevent.
  const body = formatContractGrammar(
    judgeContractGrammar(facts({ contracts: [contract({ id: "silent", asserts: undefined })] })),
  );
  assert.ok(body.includes("`silent` [asserts-missing]"), body);
  assert.ok(
    body.includes(
      "add an `- **asserts —** …` bullet: one sentence naming what the system does, and under what trigger",
    ),
    body,
  );
});

test("a failing report teaches BOTH forms and says the corpus is not retro-fitted", () => {
  const body = formatContractGrammar(
    judgeContractGrammar(facts({ contracts: [contract({ id: "x", asserts: "it works" })] })),
  );
  for (const line of [
    "  The contract line is a grammar, not a convention (ADR-0459, realising ADR-0447 D4). One",
    "  sentence, in either form:",
    "    triggered   — <trigger clause>, <system> <response>   e.g. `when the store answers, …`",
    "    ubiquitous  — <system> <response>                     e.g. \"`createRun(unitId)` returns …\"",
    "  Only contracts this branch ADDED or EDITED are charged; the existing corpus is not retro-fitted.",
  ]) {
    assert.ok(body.includes(line), `missing: ${line}\n\n${body}`);
  }
});

test("a detached HEAD reports without a branch name rather than printing null", () => {
  // The obvious assertion here — `assert.match(body, /this branch/)` — is VACUOUS, and the mutation
  // rung is what found that: the passing line already reads "every contract THIS BRANCH added or
  // edited", so the regex matches whatever the fallback substitutes. It has to be pinned where the
  // branch NAME goes, at the tail of the census.
  const body = formatContractGrammar(judgeContractGrammar(facts({ branch: null })));
  assert.ok(body.endsWith("1 new or edited on this branch"), body);
  assert.doesNotMatch(body, /null/);
});

test("the failing report's exact shape, blank lines included", () => {
  // A HAND-WRITTEN golden, not a snapshot: ADR-0447 D6 refuses snapshot/approval testing because its
  // blessing step converts a red into a green without changing behaviour. There is no blessing step
  // here — this literal was typed out, and changing the report means editing it by hand and meaning it.
  // It is what pins the report's LAYOUT (the blank line that separates the offender block from the
  // header and from the guidance), which no substring assertion can reach.
  const body = formatContractGrammar(
    judgeContractGrammar(facts({ contracts: [contract({ id: "vague", asserts: "it works" })] })),
  );
  assert.equal(
    body,
    [
      "✗ 1 contract(s) this branch added or edited do not parse — 1 contracts declared " +
        "(0 triggered / 1 ubiquitous), 1 new or edited on claude/test",
      "",
      "  stories/cli/thing.md — `vague` [system-unnamed]",
      "      name the system mechanically — a `code span` in the asserts sentence, or a " +
        "`- **covers —** …` bullet naming the source it belongs to",
      "",
      "  The contract line is a grammar, not a convention (ADR-0459, realising ADR-0447 D4). One",
      "  sentence, in either form:",
      "    triggered   — <trigger clause>, <system> <response>   e.g. `when the store answers, …`",
      "    ubiquitous  — <system> <response>                     e.g. \"`createRun(unitId)` returns …\"",
      "  Only contracts this branch ADDED or EDITED are charged; the existing corpus is not retro-fitted.",
    ].join("\n"),
  );
});
