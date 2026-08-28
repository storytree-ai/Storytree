import assert from "node:assert/strict";
import { test } from "node:test";

import { extractGroundingRefs, validateGrounding, type GroundingRef } from "./check-web-grounding.js";

test("extractGroundingRefs pulls and splits data-grounds id-lists", () => {
  const html = `
    <p data-grounds="ADR-0020,ADR-0040">green is separation of duties</p>
    <li data-grounds="ADR-0030">people own the outer loop</li>
    <p>no reference here</p>
    <span data-grounds=" ADR-0017 , , asset:foo ">spacey + empty</span>
  `;
  const refs = extractGroundingRefs("src/pages/x.astro", html);
  assert.deepEqual(refs, [
    { file: "src/pages/x.astro", ids: ["ADR-0020", "ADR-0040"] },
    { file: "src/pages/x.astro", ids: ["ADR-0030"] },
    { file: "src/pages/x.astro", ids: ["ADR-0017", "asset:foo"] }, // trimmed, empty entry dropped
  ]);
});

test("extractGroundingRefs reads the SCRIPT-authored form too (TELL's beats)", () => {
  // chapter 2's overlay holds its copy as data and writes `data-grounds` at runtime, so the
  // attribute exists in the browser and in no source file. Before this shape was recognised the
  // rung reported a confident OK over a page whose claims it had never seen.
  const ts = `
    export const TELL_SCRIPT = [
      { id: 'proven', lines: ['{proven} are green.'], grounds: ['ADR-0040'] },
      { id: 'turn', lines: ['This one is real.'], grounds: ["ADR-0453", 'ADR-0040'] },
      { id: 'plain', lines: ['no claim here'] },
    ];
  `;
  assert.deepEqual(extractGroundingRefs("src/scripts/act2-tell.ts", ts), [
    { file: "src/scripts/act2-tell.ts", ids: ["ADR-0040"] },
    { file: "src/scripts/act2-tell.ts", ids: ["ADR-0453", "ADR-0040"] },
  ]);
});

test("a script-authored citation is validated exactly like an attribute one", () => {
  // The point of widening the extractor was to put both forms through the SAME judge. Assert that
  // rather than trusting it: a superseded decision cited from a script must be a problem.
  const refs: GroundingRef[] = [
    { file: "src/scripts/act2-tell.ts", ids: ["ADR-0040", "ADR-0014"] },
  ];
  const problems = validateGrounding(refs, new Map([[40, "accepted"], [14, "superseded"]]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.id, "ADR-0014");
  assert.match(problems[0]?.reason ?? "", /SUPERSEDED/);
});

test("an empty or comment-only grounds array contributes nothing rather than a phantom claim", () => {
  assert.deepEqual(extractGroundingRefs("src/scripts/x.ts", "grounds: []"), []);
  assert.deepEqual(extractGroundingRefs("src/scripts/x.ts", "grounds: [ ]"), []);
});

test("a comment that DOCUMENTS the mechanism is not a claim (the measured false block)", () => {
  // The defect: a source comment reading `the \`data-grounds="…"\` attribute form` was extracted as
  // a citation of an id called "…" and BLOCKED the gate over copy that was perfectly fine. Both
  // forms must be ignored inside comments, and both must still be seen in real code.
  const ts = [
    '// this rung matches the `data-grounds="…"` attribute form',
    '/* and also grounds: ["ADR-9999"] written in prose */',
    'const real = { grounds: ["ADR-0040"] };',
    '<p data-grounds="ADR-0453">live claim</p>',
  ].join("\n");
  assert.deepEqual(extractGroundingRefs("src/scripts/x.ts", ts), [
    { file: "src/scripts/x.ts", ids: ["ADR-0453"] },
    { file: "src/scripts/x.ts", ids: ["ADR-0040"] },
  ]);
});

test("a commented-OUT claim is no longer validated — a claim nobody can read is not a claim", () => {
  assert.deepEqual(extractGroundingRefs("src/pages/x.astro", '<!-- kept for later -->'), []);
  assert.deepEqual(
    extractGroundingRefs("src/scripts/x.ts", '// <p data-grounds="ADR-0001">retired copy</p>'),
    [],
  );
});

test("extractGroundingRefs returns nothing when there are no refs", () => {
  assert.deepEqual(extractGroundingRefs("src/pages/y.astro", "<p>plain prose</p>"), []);
});

const STATUS = new Map<number, string>([
  [20, "accepted"],
  [30, "accepted"],
  [40, "accepted"],
  [11, "superseded"],
]);

test("validateGrounding passes when every ADR ref resolves to a current ADR", () => {
  const refs: GroundingRef[] = [
    { file: "src/pages/index.astro", ids: ["ADR-0020", "ADR-0040"] },
    { file: "src/pages/how-it-works.astro", ids: ["ADR-0030"] },
  ];
  assert.deepEqual(validateGrounding(refs, STATUS), []);
});

test("validateGrounding flags a missing ADR", () => {
  const problems = validateGrounding([{ file: "a.astro", ids: ["ADR-9999"] }], STATUS);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.id, "ADR-9999");
  assert.match(problems[0]?.reason ?? "", /not in the decision log/);
});

test("validateGrounding flags a SUPERSEDED ADR (the drift this gate exists for)", () => {
  const problems = validateGrounding([{ file: "a.astro", ids: ["ADR-0011"] }], STATUS);
  assert.equal(problems.length, 1);
  assert.match(problems[0]?.reason ?? "", /SUPERSEDED/);
});

test("validateGrounding flags an unsupported reference scheme rather than trusting it", () => {
  const problems = validateGrounding([{ file: "a.astro", ids: ["asset:spine-observes-red-green"] }], STATUS);
  assert.equal(problems.length, 1);
  assert.match(problems[0]?.reason ?? "", /unsupported reference scheme/);
});

test("validateGrounding reports every bad id across refs", () => {
  const refs: GroundingRef[] = [
    { file: "a.astro", ids: ["ADR-0020", "ADR-9999"] }, // one good, one missing
    { file: "b.astro", ids: ["ADR-0011"] }, // superseded
  ];
  const problems = validateGrounding(refs, STATUS);
  assert.equal(problems.length, 2);
  assert.deepEqual(
    problems.map((p) => p.id).sort(),
    ["ADR-0011", "ADR-9999"],
  );
});
