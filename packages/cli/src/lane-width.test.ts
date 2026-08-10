import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORTS,
  STRICT,
  arcRecords,
  attributeChurn,
  classify,
  constructLines,
  forgiveOnly,
  marginalRanking,
  measure,
  simulateWaves,
  storyKeys,
  type ArcUnits,
  type SurfaceEdit,
  type Unit,
} from "./lane-width.js";

const unit = (arc: string, n: number, files: string[]): Unit => ({
  arc,
  incs: [`${arc}-inc-${n}`],
  date: `2026-08-${String(n).padStart(2, "0")}`,
  prs: [n],
  files: new Set(files),
});
const arc = (name: string, sets: string[][]): ArcUnits[] => [
  { arc: name, units: sets.map((f, i) => unit(name, i + 1, f)) },
];
const all = () => true;

// A surface with one appendable list and two ordinary functions — the shape ADR-0341 D4/D5 compared.
const SURFACE = [
  /* 1 */ `import { a } from "./a.js";`,
  /* 2 */ `import { b } from "./b.js";`,
  /* 3 */ ``,
  /* 4 */ `const REGISTRY = [`,
  /* 5 */ `  "one",`,
  /* 6 */ `  "two",`,
  /* 7 */ `];`,
  /* 8 */ ``,
  /* 9 */ `export function helper(): number {`,
  /* 10 */ `  return 1;`,
  /* 11 */ `}`,
  /* 12 */ ``,
  /* 13 */ `export function run(): void {`,
  /* 14 */ `  helper();`,
  /* 15 */ `}`,
].join("\n");

const edit = (hash: string, addedLines: number[]): SurfaceEdit => ({ hash, text: SURFACE, addedLines });

test("constructLines buckets each line under its enclosing column-0 declaration", () => {
  const map = constructLines(SURFACE);
  assert.equal(map[1], IMPORTS);
  assert.equal(map[3], IMPORTS, "the gap before the first declaration is still the import block");
  assert.equal(map[5], "REGISTRY");
  assert.equal(map[10], "helper");
  assert.equal(map[14], "run");
});

test("attributeChurn ranks by EDITS touched, not by lines added — a 1-line wiring edit conflicts as hard", () => {
  const churn = attributeChurn([
    edit("a", [5]),
    edit("b", [6]),
    edit("c", [5, 6]),
    edit("d", Array.from({ length: 50 }, (_, i) => 10)), // one edit, fifty lines, inside `helper`
  ]);
  const [top, second] = churn.constructs;
  assert.equal(top!.construct, "REGISTRY");
  assert.equal(top!.commits, 3);
  assert.equal(second!.construct, "helper");
  assert.equal(second!.lines, 50, "still the bigger diff, and still ranked below");
  assert.equal(top!.share, 0.75);
});

test("confinement separates the two cases: a fix removes churn only where NOTHING else was touched", () => {
  // `node-build.test.ts` shape — every edit is the appendable list, so de-registrying it removes all of it.
  const registryOnly = attributeChurn([edit("a", [5]), edit("b", [6]), edit("c", [5, 6])], ["REGISTRY"]);
  assert.equal(registryOnly.confinedShare, 1);

  // `commands.ts` shape — edits straddle the fence, so the file keeps being touched and the width stays.
  const straddling = attributeChurn(
    [edit("a", [5, 14]), edit("b", [6, 10]), edit("c", [5]), edit("d", [14])],
    ["REGISTRY"],
  );
  assert.equal(straddling.confinedShare, 0.25, "only the REGISTRY-only edit would stop touching the file");
});

test("confinement widens as the fence covers more constructs, and is zero with no fence at all", () => {
  const edits = [edit("a", [5, 14]), edit("b", [6, 10])];
  assert.equal(attributeChurn(edits).confinedShare, 0, "no fence forgives nothing");
  assert.equal(attributeChurn(edits, ["REGISTRY"]).confinedShare, 0);
  assert.equal(attributeChurn(edits, ["REGISTRY", "run", "helper"]).confinedShare, 1);
});

test("attributeChurn on no edits reports zero rather than dividing by it", () => {
  const churn = attributeChurn([], ["REGISTRY"]);
  assert.equal(churn.edits, 0);
  assert.equal(churn.confinedShare, 0);
  assert.deepEqual(churn.constructs, []);
});

test("simulateWaves grows a wave while landings stay disjoint and closes on the first clash", () => {
  const waves = simulateWaves([
    { own: ["a.ts"] },
    { own: ["b.ts"] },
    { own: ["a.ts", "c.ts"] },
    { own: ["d.ts"] },
  ]);
  assert.deepEqual(
    waves.map((w) => w.n),
    [2, 2],
  );
  assert.deepEqual(waves[0]!.blockedBy, ["a.ts"]);
});

test("classify reads the OWN surface: no own files is registry-only, any source is a build lane", () => {
  assert.equal(classify([]), "registry-only");
  assert.equal(classify(["docs/x.md", "packages/cli/src/x.ts"]), "build");
  assert.equal(classify(["docs/x.md", "stories/y/story.md"]), "authoring");
});

test("arcRecords forgives an arc's hot LEDGER but never its hot SOURCE (ADR-0340's discarded rule)", () => {
  const units = arc("a", [
    ["packages/notice-board/src/claim.ts", "docs/ledger.json"],
    ["packages/notice-board/src/claim.ts", "docs/ledger.json"],
    ["packages/notice-board/src/claim.ts", "docs/ledger.json"],
  ])[0]!.units;
  const recs = arcRecords(units);
  assert.ok(recs.has("docs/ledger.json"));
  assert.ok(
    !recs.has("packages/notice-board/src/claim.ts"),
    "the arc's own subject module must never be forgiven, however hot it is",
  );
});

test("forgiving a surface stops it closing waves — strict is the floor", () => {
  const arcs = arc("a", [
    ["a.ts", "REG"],
    ["b.ts", "REG"],
    ["c.ts", "REG"],
  ]);
  const strict = measure(arcs, all, STRICT);
  assert.deepEqual(strict.dist, [[1, 3]]);
  assert.equal(strict.shareWavesGe2, 0);

  const forgiven = measure(arcs, all, forgiveOnly(["REG"]));
  assert.deepEqual(forgiven.dist, [[3, 1]]);
  assert.equal(forgiven.shareWavesGe2, 1);
});

test("a landing with no own surface left is excluded and COUNTED, never joining a wave for free", () => {
  const arcs = arc("a", [["a.ts", "REG"], ["REG"], ["a.ts"]]);
  const m = measure(arcs, all, forgiveOnly(["REG"]));
  assert.equal(m.registryOnlyExcluded, 1);
  assert.equal(m.units, 2, "the registry-only landing is not measured as a lane");
});

test("marginalRanking scores a sole blocker on BOTH readings", () => {
  // R1 alone serialises the first pair, R2 alone the second — neither has an accomplice
  const arcs = arc("a", [
    ["a.ts", "R1"],
    ["b.ts", "R1"],
    ["c.ts", "R2"],
    ["d.ts", "R2"],
  ]);
  const r = marginalRanking(arcs, all, ["R1", "R2"], STRICT);

  assert.equal(r.baseline.shareWavesGe2, 1 / 3, "strict: waves of 1, 2, 1");
  assert.equal(r.together.shareWavesGe2, 1, "both forgiven: one wave of four");
  for (const s of r.surfaces) {
    assert.ok(s.deltaShareWavesGe2 > 0, `${s.surface} should unlock width on its own`);
    assert.ok(s.costOfOmittingShareWavesGe2 > 0, `${s.surface} should be missed if skipped`);
    assert.equal(s.wavesBlocked, 1);
    assert.equal(s.touchedBy, 2);
  }
});

test("marginalRanking exposes a co-occurring pair: add-one says nothing, leave-one-out says both", () => {
  // S1 and S2 always clash together, so forgiving either alone changes nothing
  const arcs = arc("a", [
    ["x.ts", "S1", "S2"],
    ["y.ts", "S1", "S2"],
  ]);
  const r = marginalRanking(arcs, all, ["S1", "S2"], STRICT);

  assert.equal(r.baseline.shareWavesGe2, 0);
  assert.equal(r.together.shareWavesGe2, 1);
  for (const s of r.surfaces) {
    assert.equal(s.deltaShareWavesGe2, 0, `${s.surface}: fixing it alone buys nothing`);
    assert.equal(s.costOfOmittingShareWavesGe2, 1, `${s.surface}: skipping it costs the whole set`);
  }
});

test("marginalRanking carries the baseline into every reading — an already-deleted surface stays gone", () => {
  const arcs = arc("a", [
    ["a.ts", "GONE", "R1"],
    ["b.ts", "GONE", "R1"],
    ["c.ts", "GONE"],
  ]);
  const r = marginalRanking(arcs, all, ["R1"], forgiveOnly(["GONE"]));
  // R1 still splits the run, so the baseline is waves of 1 and 2 — not the three waves of one that
  // a reading which forgot GONE would produce, which is what makes the delta below discriminating.
  assert.equal(r.baseline.shareWavesGe2, 1 / 2, "R1 still serialises the first pair");
  assert.equal(r.together.shareWavesGe2, 1, "with R1 forgiven too, all three are one wave");
  assert.equal(r.surfaces[0]!.deltaShareWavesGe2, 1 / 2);
});

test("storyKeys reads story grain from both the disk path and the seed-kind path", () => {
  assert.deepEqual(
    [...storyKeys(["stories/cli/story.md", "packages/cli/src/x.ts", "stories/library/story.md"])],
    ["cli", "library"],
  );
});
