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
  assert.match(problems[0]?.reason ?? "", /not in docs\/decisions/);
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
