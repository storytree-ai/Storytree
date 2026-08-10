import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STRICT,
  arcRecords,
  classify,
  forgiveOnly,
  marginalRanking,
  measure,
  simulateWaves,
  storyKeys,
  type ArcUnits,
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
