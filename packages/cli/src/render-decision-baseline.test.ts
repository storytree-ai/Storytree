/**
 * The frozen baseline's RENDER — asserted rather than eyeballed, because these exact lines are what
 * goes into the dated research document the arc freezes.
 *
 * The bar every assertion here is written against: WHAT WOULD MAKE THIS RED? A test that only showed
 * the render producing *something* would pass against a render that prints "0 sessions walked a
 * chain" with no denominator beside it — which is the single failure that would let this arc report
 * its hypothesis FALSIFIED on the strength of an instrument that saw nothing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { computeDecisionReadBaseline, type DecisionSupportGraph } from "./decision-read-baseline.js";
import { renderDecisionReadBaseline, type BaselineRenderContext } from "./render-decision-baseline.js";

const SUPPORT: DecisionSupportGraph = {
  decisions: [10, 11, 12, 20],
  amends: [
    { from: 10, to: 11 },
    { from: 11, to: 12 },
  ],
  dependsOn: [{ from: 20, to: 12 }],
  decisionsCarryingDependsOn: 1,
  dependsOnNonDecisionTargets: 2,
};

const CONTEXT: BaselineRenderContext = {
  top: 5,
  transcriptFiles: 40,
  decisionMentions: 7,
  uncorrelatedReads: 3,
  traceSessions: 11,
  traceSessionsWithoutSlot: 1,
  mixedIdentitySessions: 0,
};

function render(
  reads: Parameters<typeof computeDecisionReadBaseline>[0]["reads"],
  offers: Parameters<typeof computeDecisionReadBaseline>[0]["offers"],
  context: Partial<BaselineRenderContext> = {},
): string {
  const baseline = computeDecisionReadBaseline({
    reads,
    offers,
    support: SUPPORT,
    declaredFrom: undefined,
    declaredTo: undefined,
  });
  return renderDecisionReadBaseline(baseline, { ...CONTEXT, ...context });
}

test("render-decision-baseline: the two support edge populations print APART and never as one figure", () => {
  const text = render([], []);
  assert.match(text, /amends 2\s+dependsOn 1/);
  assert.ok(!/support edges: 3/.test(text), "a blended figure would hide the whole migration");
});

test("render-decision-baseline: 'nobody walked a chain' prints with the population it is over", () => {
  // THE LINE THIS WHOLE FILE EXISTS FOR. A bare "0" here reads as the arc's hypothesis falsified;
  // "0 of 2" reads as two sessions measured and neither walked, which is a finding. "0 of 0" reads
  // as an instrument that saw nothing, which is not.
  const measured = render(
    [
      { slotId: "s", windowId: "w1", nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z", surface: "x" },
      { slotId: "s", windowId: "w2", nodeId: "adr-0020", at: "2026-08-01T00:00:00.000Z", surface: "x" },
    ],
    [{ slotId: "s", candidateSetId: "c", nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z", observable: true }],
  );
  assert.match(measured, /sessions that walked a chain \(depth >= 2\): 0 of 2 \(0\.0%\)/);

  const blind = render([], []);
  assert.match(blind, /sessions that walked a chain \(depth >= 2\): 0 of 0 \(n\/a \(denominator 0\)\)/);
  // ...and the blind run says so in its own words too, rather than leaving the reader to spot a zero.
  assert.match(blind, /VACUITY — one or more figures above measured NOTHING/);
});

test("render-decision-baseline: a healthy run says so explicitly instead of printing nothing", () => {
  const text = render(
    [
      { slotId: "s", windowId: "w1", nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z", surface: "x" },
      { slotId: "s", windowId: "w1", nodeId: "adr-0011", at: "2026-08-01T00:00:00.000Z", surface: "x" },
    ],
    [{ slotId: "s", candidateSetId: "c", nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z", observable: true }],
  );
  assert.match(text, /VACUITY — none\. Every figure above saw its subject\./);
});

test("render-decision-baseline: both grains are printed, so the pooling gap cannot be hidden", () => {
  const text = render(
    [
      { slotId: "s", windowId: "w1", nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z", surface: "x" },
      { slotId: "s", windowId: "w2", nodeId: "adr-0011", at: "2026-08-01T00:00:00.000Z", surface: "x" },
    ],
    [{ slotId: "s", candidateSetId: "c", nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z", observable: true }],
  );
  assert.match(text, /WINDOW grain — one host context window, i\.e\. one sitting/);
  assert.match(text, /SLOT grain — the pooled worktree slot, which unions several sittings/);
  // The window grain saw two one-decision sittings; the slot grain unions them into one chain of 2.
  assert.match(text, /pooling factor \(windows per slot, over sessions that read a decision\): 2/);
});

test("render-decision-baseline: the deepest chain is named decision by decision, so it can be checked by hand", () => {
  const text = render(
    [
      { slotId: "s", windowId: "w1", nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z", surface: "x" },
      { slotId: "s", windowId: "w1", nodeId: "adr-0011", at: "2026-08-01T00:00:00.000Z", surface: "x" },
      { slotId: "s", windowId: "w1", nodeId: "adr-0012", at: "2026-08-01T00:00:00.000Z", surface: "x" },
    ],
    [],
  );
  assert.match(text, /ADR-0010 -> ADR-0011 -> ADR-0012/);
});

test("render-decision-baseline: the reach rank prints distinct sessions AND raw reads, so the rank key is visible", () => {
  const text = render(
    [
      ...Array.from({ length: 9 }, () => ({
        slotId: "s",
        windowId: "w1",
        nodeId: "adr-0010",
        at: "2026-08-01T00:00:00.000Z",
        surface: "x",
      })),
      { slotId: "s", windowId: "w2", nodeId: "adr-0011", at: "2026-08-01T00:00:00.000Z", surface: "x" },
      { slotId: "s", windowId: "w3", nodeId: "adr-0011", at: "2026-08-01T00:00:00.000Z", surface: "x" },
    ],
    [],
  );
  // Two windows beat nine reads by one window, and the raw count is shown beside it so a reader can
  // see that the rank was NOT built on it.
  const ranked = text.slice(text.indexOf("top 5 by distinct WINDOWS"));
  assert.match(ranked, /ADR-0011\s+2 windows\s+\(2 raw reads\)/);
  assert.ok(ranked.indexOf("ADR-0011") < ranked.indexOf("ADR-0010"));
  assert.match(ranked, /ADR-0010\s+1 window\s+\(9 raw reads\)/);
});

test("render-decision-baseline: an offered-and-never-followed decision is reported as its own figure", () => {
  const text = render(
    [],
    Array.from({ length: 4 }, (_, i) => ({
      slotId: "s",
      candidateSetId: `c${i}`,
      nodeId: "adr-0020",
      at: "2026-08-01T00:00:00.000Z",
      observable: true,
    })),
  );
  assert.match(text, /decisions offered and NEVER followed: 1 of 1 \(100\.0%\)/);
  assert.match(text, /ADR-0020\s+offered\s+4\s+followed\s+0/);
});

test("render-decision-baseline: the instrument's own blind spots print as numbers, not as prose alone", () => {
  const text = render([], []);
  assert.match(text, /transcript files swept: 40/);
  assert.match(text, /tool calls that NAMED a decision and yielded no read: 7/);
  assert.match(text, /reads reached but attributable to no storytree session: 3/);
  assert.match(text, /trace sessions holding the offer record: 11/);
  assert.match(text, /with no single slot to join on: 1/);
});

test("render-decision-baseline: the floor and the two-sided bias are stated on every run", () => {
  // Never a footnote a reader might not reach: the direction of each bias is what makes a shallow
  // reading interpretable at all.
  const text = render([], []);
  assert.match(text, /EVERY FIGURE IS A FLOOR, AND THE BIAS IS TWO-SIDED/);
  assert.match(text, /lost capture pushes chain depth DOWN/);
  assert.match(text, /pooling pushes the\nslot-grained figure UP/);
  assert.match(text, /A read is not comprehension/);
});
