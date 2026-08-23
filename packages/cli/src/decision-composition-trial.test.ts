import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  computeCompositionTrial,
  parseFrozenArms,
  FROZEN_ARMS_PATH,
  FROZEN_PAIR_COUNT,
  type FrozenArms,
} from "./decision-composition-trial.js";
import type { DecisionReadObservation, DecisionSupportGraph } from "./decision-read-baseline.js";
import type { AltitudeClass } from "./decision-altitude.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frozenText = (): string => fs.readFileSync(path.join(REPO_ROOT, FROZEN_ARMS_PATH), "utf8");

// ---------------------------------------------------------------------------
// parseFrozenArms — over the REAL committed table, because that is the instrument
// ---------------------------------------------------------------------------

test("composition-trial: the frozen write-up parses to exactly 54 matched pairs", () => {
  const arms = parseFrozenArms(frozenText());
  assert.equal(arms.pairs.length, FROZEN_PAIR_COUNT);
  assert.equal(arms.treated.length, FROZEN_PAIR_COUNT);
  assert.equal(arms.control.length, FROZEN_PAIR_COUNT);
});

test("composition-trial: the parsed arms match the write-up's own named members", () => {
  // Spot checks at the head, the middle and the tail of the table. If the parser ever drifts onto a
  // different column pair these are what say so — a count alone would not.
  const arms = parseFrozenArms(frozenText());
  assert.deepEqual(arms.pairs[0], { rank: 1, treated: 278, control: 249 });
  assert.deepEqual(arms.pairs[29], { rank: 30, treated: 421, control: 372 });
  assert.deepEqual(arms.pairs[53], { rank: 54, treated: 393, control: 391 });
});

test("composition-trial: the arms are disjoint, and the control arm holds the names it must", () => {
  const arms = parseFrozenArms(frozenText());
  assert.equal(arms.treated.filter((n) => arms.control.includes(n)).length, 0);
  // ADR-0419 is CONTROL. Composing it would destroy the comparison permanently (ADR-0428 D6), and
  // it is the decision this arc's own work most often has in hand — so it is named here explicitly.
  assert.ok(arms.control.includes(419));
  assert.ok(!arms.treated.includes(419));
});

test("composition-trial: a truncated table is REFUSED, never silently measured", () => {
  const lines = frozenText().split("\n");
  const truncated = lines.filter((line) => !line.startsWith("| 54 |")).join("\n");
  assert.throws(() => parseFrozenArms(truncated), /parsed 53 matched pairs, expected 54/);
});

test("composition-trial: a table assigning one decision to both arms is REFUSED", () => {
  const doubled = frozenText().replace("| 1 | ADR-0278 |", "| 1 | ADR-0249 |");
  assert.throws(() => parseFrozenArms(doubled), /appears in BOTH arms/);
});

// ---------------------------------------------------------------------------
// computeCompositionTrial
// ---------------------------------------------------------------------------

const arms: FrozenArms = {
  treated: [400],
  control: [500],
  pairs: [{ rank: 1, treated: 400, control: 500 }],
};

const support: DecisionSupportGraph = {
  decisions: [100, 200, 300, 400, 500],
  amends: [
    { from: 400, to: 300 },
    { from: 300, to: 200 },
    { from: 500, to: 100 },
  ],
  dependsOn: [],
  decisionsCarryingDependsOn: 0,
  dependsOnNonDecisionTargets: 0,
};

const altitude = new Map<number, AltitudeClass>([
  [400, "executive"],
  [500, "executive"],
]);

function read(windowId: string, decision: number): DecisionReadObservation {
  return {
    slotId: "slot",
    windowId,
    nodeId: `adr-${String(decision).padStart(4, "0")}`,
    at: "2026-08-01T00:00:00.000Z",
    surface: "library-artifact",
  };
}

test("composition-trial: depth is ROOTED at the frontier, not the deepest chain anywhere in the window", () => {
  // The window reads the treated frontier alone (depth 1) and, separately, a two-record chain that
  // the frontier does not reach in this window. A global longest-chain measure would score the
  // treated frontier 2; the rooted one scores it 1, which is what a frontier walk means.
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude,
    reads: [read("w1", 400), read("w1", 500), read("w1", 100)],
  });
  const treated = reading.cells.find((c) => c.arm === "treated" && c.altitude === "executive");
  const control = reading.cells.find((c) => c.arm === "control" && c.altitude === "executive");
  assert.equal(treated?.meanDepthOverReaders, 1);
  assert.equal(treated?.walks, 0);
  assert.equal(control?.meanDepthOverReaders, 2);
  assert.equal(control?.walks, 1);
});

test("composition-trial: a window walking the treated chain is measured at its rooted depth", () => {
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude,
    reads: [read("w1", 400), read("w1", 300), read("w1", 200)],
  });
  const treated = reading.cells.find((c) => c.arm === "treated" && c.altitude === "executive");
  assert.equal(treated?.meanDepthOverReaders, 3);
  assert.equal(treated?.meanDepthOverWalkers, 3);
  assert.equal(treated?.maxDepth, 3);
});

test("composition-trial: the contrast states treated MINUS control, per altitude class", () => {
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude,
    reads: [read("w1", 400), read("w1", 500), read("w1", 100)],
  });
  const contrast = reading.contrasts.find((c) => c.altitude === "executive");
  assert.equal(contrast?.depthDifference, -1);
  assert.equal(contrast?.walkShareDifference, -1);
});

test("composition-trial: depth over READERS and depth over WALKERS answer different questions", () => {
  // Two windows read the treated frontier; only one goes deeper. Averaged over readers the frontier
  // reads at 2; averaged over walkers alone it reads at 3. A report quoting one number could not
  // tell "fewer walks" from "shallower walks", which is why both are carried.
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude,
    reads: [read("w1", 400), read("w1", 300), read("w1", 200), read("w2", 400)],
  });
  const treated = reading.cells.find((c) => c.arm === "treated" && c.altitude === "executive");
  assert.equal(treated?.readings, 2);
  assert.equal(treated?.meanDepthOverReaders, 2);
  assert.equal(treated?.meanDepthOverWalkers, 3);
});

test("composition-trial: an UNLABELLED frontier lands in its own bucket and is named, never dropped", () => {
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude: new Map<number, AltitudeClass>([[500, "existence"]]),
    reads: [read("w1", 400), read("w1", 300)],
  });
  const unlabelled = reading.cells.find((c) => c.arm === "treated" && c.altitude === null);
  assert.equal(unlabelled?.readings, 1);
  assert.deepEqual(reading.unlabelledFrontiers, [400]);
});

test("composition-trial: frontiers nobody read are reported as a denominator", () => {
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude,
    reads: [read("w1", 400)],
  });
  assert.deepEqual(reading.unreadFrontiers, [500]);
});

test("composition-trial: a period with no decision reads is VACUOUS, not a null result", () => {
  // A table of zeros must never be readable as "composition changed nothing".
  const reading = computeCompositionTrial({ arms, support, altitude, reads: [] });
  assert.equal(reading.vacuity.length, 1);
  assert.match(reading.vacuity[0] ?? "", /nothing to compare/);
});

test("composition-trial: reads of decisions in neither arm are vacuous for THIS trial and say so", () => {
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude,
    reads: [read("w1", 100), read("w1", 200)],
  });
  assert.equal(reading.windowsObserved, 1);
  assert.match(reading.vacuity.join(" "), /none of them was a frontier in either arm/);
});

test("composition-trial: the observation window is honoured on both ends", () => {
  const early: DecisionReadObservation = { ...read("w1", 400), at: "2026-07-01T00:00:00.000Z" };
  const reading = computeCompositionTrial({
    arms,
    support,
    altitude,
    reads: [early, read("w2", 400)],
    from: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(reading.readsInWindow, 1);
  assert.equal(reading.windowsObserved, 1);
});

test("composition-trial: ids are resolved through the corpus resolver, never joined raw", () => {
  // `-inc-01` measured a raw-string join at a ~35x under-count that reports no error. A read spelled
  // the historical file way must still land on its decision.
  const fileShaped: DecisionReadObservation = {
    ...read("w1", 400),
    nodeId: "doc:decisions/0400-a-decision.md",
  };
  const reading = computeCompositionTrial({ arms, support, altitude, reads: [fileShaped] });
  const treated = reading.cells.find((c) => c.arm === "treated" && c.altitude === "executive");
  assert.equal(treated?.readings, 1);
});
