import { test } from "node:test";
import assert from "node:assert/strict";

import type { StoredDoc, StoreEvent } from "@storytree/storage-protocol";

import {
  BOTTLENECK_POPULATION,
  COLLAPSING_RULE,
  computeBottlenecks,
  computeRecurrence,
  floorHealthReading,
  RECURRENCE_ATTRIBUTION_RULE,
  routeSpansOf,
  TRIPWIRE_ROUTES,
} from "./factory-health.js";

/**
 * THE CALIBRATION CAPTURE — the three items `factory-floor-health-arc` names, frozen verbatim.
 *
 * Frozen rather than read live for one reason: `pnpm -r test` is credential-free (ADR-0302 D3), and a
 * calibration that skipped without a database would be a green test proving nothing. These rows are a
 * capture taken 2026-08-08 from the live store; reproduce them with
 *
 *   SELECT seq, type, at, doc->>'route' FROM events.library_event WHERE id = $1 ORDER BY seq
 *
 * and the matching `events.library_artifact` doc. The live tier moves on — an item can be reinforced
 * or re-routed after this capture — so these assert that the INSTRUMENT reproduces the archaeology,
 * not that the corpus still looks like this today. The live figures are re-read by running the verb.
 */

function ev(id: string, seq: number, at: string, route: string | null): StoreEvent {
  return {
    seq,
    id,
    kind: "friction",
    type: seq === 0 ? "created" : "updated",
    doc: route === null ? {} : { route },
    actor: "cli",
    at,
  };
}

function frictionDoc(input: {
  id: string;
  title?: string;
  route?: string;
  dischargedBy?: string;
  dates?: string[];
  references?: string[];
}): StoredDoc {
  return {
    id: input.id,
    kind: "friction",
    doc: {
      title: input.title ?? input.id,
      ...(input.route !== undefined ? { route: input.route } : {}),
      ...(input.dischargedBy !== undefined ? { dischargedBy: input.dischargedBy } : {}),
      ...(input.references !== undefined ? { references: input.references } : {}),
      reinforcedBy: (input.dates ?? []).map((date) => ({ branch: "claude/x", date, evidence: "`e`" })),
    },
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
}

/** `sdk-leaf-drops-contract-id-test-names` — routed `guardrail` 2026-07-11, RE-routed `tool` 2026-07-30. */
const CALIBRATION_ID = "sdk-leaf-drops-contract-id-test-names";
const CALIBRATION_EVENTS: StoreEvent[] = [
  ev(CALIBRATION_ID, 0, "2026-07-11T09:27:54.730Z", null),
  ev(CALIBRATION_ID, 1698, "2026-07-11T13:54:04.888Z", "guardrail"),
  ev(CALIBRATION_ID, 1707, "2026-07-11T23:20:44.118Z", "guardrail"),
  ev(CALIBRATION_ID, 1718, "2026-07-12T03:36:47.284Z", "guardrail"),
  ev(CALIBRATION_ID, 1743, "2026-07-12T16:00:31.251Z", "guardrail"),
  ev(CALIBRATION_ID, 1744, "2026-07-12T16:00:53.933Z", "guardrail"),
  ev(CALIBRATION_ID, 1755, "2026-07-13T11:11:56.275Z", "guardrail"),
  ev(CALIBRATION_ID, 1928, "2026-07-16T14:36:17.032Z", "guardrail"),
  ev(CALIBRATION_ID, 1930, "2026-07-16T15:28:18.817Z", "guardrail"),
  ev(CALIBRATION_ID, 2363, "2026-07-26T12:07:53.010Z", "guardrail"),
  ev(CALIBRATION_ID, 2628, "2026-07-28T13:34:54.437Z", "guardrail"),
  ev(CALIBRATION_ID, 2827, "2026-07-30T08:15:37.408Z", "tool"),
  ev(CALIBRATION_ID, 2854, "2026-07-30T10:33:51.322Z", "tool"),
];
const CALIBRATION_DOC = frictionDoc({
  id: CALIBRATION_ID,
  title: "the SDK leaf drops the contract id from test names",
  route: "tool",
  dischargedBy: "#1031",
  dates: [
    "2026-07-11",
    "2026-07-12",
    "2026-07-12",
    "2026-07-12",
    "2026-07-13",
    "2026-07-16",
    "2026-07-16",
    "2026-07-26",
    "2026-07-28",
  ],
});

/** Negative control 1: `friction-db-up-poll-false-unreachable-while-socket-accepts`, routed `tool` 07-13. */
const CONTROL_1 = "friction-db-up-poll-false-unreachable-while-socket-accepts";
const CONTROL_1_EVENTS: StoreEvent[] = [
  ev(CONTROL_1, 1774, "2026-07-13T12:48:53.177Z", null),
  ev(CONTROL_1, 1791, "2026-07-13T14:23:39.699Z", "tool"),
  ev(CONTROL_1, 2313, "2026-07-25T23:15:48.642Z", "tool"),
];
const CONTROL_1_DOC = frictionDoc({
  id: CONTROL_1,
  route: "tool",
  dates: ["2026-07-13", "2026-07-25", "2026-07-25"],
});

/** Negative control 2: `friction-gate-wall-clock-perf-threshold-false-red`, routed `tool` 07-25. */
const CONTROL_2 = "friction-gate-wall-clock-perf-threshold-false-red";
const CONTROL_2_EVENTS: StoreEvent[] = [
  ev(CONTROL_2, 2314, "2026-07-25T23:16:49.504Z", null),
  ev(CONTROL_2, 2325, "2026-07-25T23:58:56.216Z", "tool"),
  ev(CONTROL_2, 2583, "2026-07-28T03:51:42.977Z", "tool"),
];
const CONTROL_2_DOC = frictionDoc({
  id: CONTROL_2,
  route: "tool",
  dates: ["2026-07-28", "2026-07-28", "2026-07-28", "2026-07-30"],
});

const CALIBRATION_DOCS = [CALIBRATION_DOC, CONTROL_1_DOC, CONTROL_2_DOC];
const CALIBRATION_LOG = [...CALIBRATION_EVENTS, ...CONTROL_1_EVENTS, ...CONTROL_2_EVENTS];

// ---------------------------------------------------------------------------
// Question 1 — recurrence since route
// ---------------------------------------------------------------------------

test("route spans open only when the route CHANGES, so repeated same-route writes are one span", () => {
  const spans = routeSpansOf(CALIBRATION_EVENTS);
  assert.deepEqual(
    spans.map((s) => [s.route, s.from]),
    [
      ["guardrail", "2026-07-11T13:54:04.888Z"],
      ["tool", "2026-07-30T08:15:37.408Z"],
    ],
    "eleven guardrail-carrying events are ONE guardrail span; the tool re-route opens the second",
  );
  assert.equal(spans[0]?.to, "2026-07-30T08:15:37.408Z", "the first span closes where the second opens");
});

test("CALIBRATION: the known-firing guardrail case reports EIGHT post-route reinforcements", () => {
  // The arc's close condition 2: `sdk-leaf-drops-contract-id-test-names`, routed `guardrail`
  // 2026-07-11T13:54:04Z, carries eight reinforcements AFTER the route landed — the ninth is dated
  // the same day and is unorderable at day granularity, so it is never counted as post-route.
  const report = computeRecurrence({ docs: CALIBRATION_DOCS, events: CALIBRATION_LOG });

  const guardrail = report.byRoute.find((r) => r.route === "guardrail");
  assert.ok(guardrail, "the guardrail route must appear — it is the tripwire the arc names");
  assert.equal(guardrail.postRoute, 8, "eight post-route reinforcements under `guardrail`");
  assert.equal(guardrail.tripwire, true, "a guardrail was rendered into every session; recurrence is failure");

  const offender = guardrail.offenders[0];
  assert.equal(offender?.id, CALIBRATION_ID, "the answer NAMES the offending item, not just a rate");
  assert.equal(offender?.postRoute, 8);
  assert.equal(offender?.routedAt, "2026-07-11T13:54:04.888Z");
});

test("the same-day reinforcement is held apart, never silently counted or silently dropped", () => {
  const report = computeRecurrence({ docs: [CALIBRATION_DOC], events: CALIBRATION_EVENTS });
  const item = report.byRoute.flatMap((r) => r.offenders).find((o) => o.id === CALIBRATION_ID);
  assert.equal(item?.postRoute, 8);
  // 9 reinforcements on the doc: 8 post-route + 1 same-day. Nothing vanished.
  const spans = routeSpansOf(CALIBRATION_EVENTS);
  assert.equal(spans.length, 2);
  const recomputed = computeRecurrence({ docs: [CALIBRATION_DOC], events: CALIBRATION_EVENTS });
  const guardrailSpan = recomputed.byRoute.find((r) => r.route === "guardrail");
  assert.equal(guardrailSpan?.postRoute, 8);
});

test("a re-routed item attributes its recurrence to the route STANDING at the time, not today's", () => {
  const report = computeRecurrence({ docs: [CALIBRATION_DOC], events: CALIBRATION_EVENTS });
  const tool = report.byRoute.find((r) => r.route === "tool");
  assert.equal(tool?.postRoute, 0, "nothing recurred after the 2026-07-30 re-route to `tool`");
  assert.deepEqual(report.multiSpan, [CALIBRATION_ID], "the multi-span case is named, not hidden");
  // The item's CURRENT route is `tool`; pooling under it would credit eight guardrail failures to a
  // route that did not exist when they happened.
  assert.equal(report.byRoute.find((r) => r.route === "guardrail")?.postRoute, 8);
});

test("CALIBRATION: the two `tool` negative controls report 2 and 4 post-route reinforcements", () => {
  // The arc predicted "2 later" and "3 later". The first reproduces exactly; the second is FOUR —
  // the item carries reinforcements dated 07-28, 07-28, 07-28 and 07-30, all strictly after its
  // 2026-07-25T23:58 route. The arc's prose undercounts by one, which is the kind of hand-count
  // error an instrument exists to retire. The assertion pins what the DATA says.
  const report = computeRecurrence({ docs: CALIBRATION_DOCS, events: CALIBRATION_LOG });
  const tool = report.byRoute.find((r) => r.route === "tool");
  assert.ok(tool);
  assert.equal(tool.tripwire, false, "`tool` recurrence is EXPECTED while the capability is unbuilt");
  const byId = new Map(tool.offenders.map((o) => [o.id, o.postRoute]));
  assert.equal(byId.get(CONTROL_1), 2);
  assert.equal(byId.get(CONTROL_2), 4);
});

test("routes are never pooled — the tripwire route sorts first and carries its own totals", () => {
  const report = computeRecurrence({ docs: CALIBRATION_DOCS, events: CALIBRATION_LOG });
  assert.equal(report.byRoute[0]?.route, "guardrail", "the discriminating route leads");
  assert.equal(report.byRoute[0]?.tripwire, true);
  assert.ok(
    report.byRoute.every((r) => r.tripwire === TRIPWIRE_ROUTES.includes(r.route)),
    "tripwire-ness is the declared set, not a per-call judgement",
  );
  const pooled = report.byRoute.reduce((sum, r) => sum + r.postRoute, 0);
  assert.equal(pooled, 14, "8 guardrail + 6 tool — reported apart, and a reader can still add them");
});

test("reinforcements predating any route are PRE-ROUTE: capture evidence, not recurrence", () => {
  const id = "unrouted-then-routed";
  const docs = [frictionDoc({ id, route: "guardrail", dates: ["2026-07-01", "2026-07-09"] })];
  const events = [ev(id, 1, "2026-07-01T00:00:00.000Z", null), ev(id, 2, "2026-07-05T00:00:00.000Z", "guardrail")];
  const report = computeRecurrence({ docs, events });
  assert.equal(report.byRoute.find((r) => r.route === "guardrail")?.postRoute, 1, "only the 07-09 one");
});

test("an item with no route event has no spans, so nothing is attributed to a route it never held", () => {
  const id = "never-adjudicated";
  const report = computeRecurrence({
    docs: [frictionDoc({ id, dates: ["2026-07-01", "2026-07-02"] })],
    events: [ev(id, 1, "2026-07-01T00:00:00.000Z", null)],
  });
  assert.deepEqual(report.byRoute, []);
  assert.equal(report.sample.routed, 0);
  assert.equal(report.sample.items, 1);
});

test("every figure carries its window and sample, and the attribution rule is in the report", () => {
  const report = computeRecurrence({
    docs: CALIBRATION_DOCS,
    events: CALIBRATION_LOG,
    window: { from: "2026-07-14", to: "2026-07-27" },
  });
  assert.deepEqual(report.window, { from: "2026-07-14", to: "2026-07-27" });
  assert.equal(report.sample.items, 3);
  assert.equal(report.sample.events, CALIBRATION_LOG.length);
  assert.equal(report.attributionRule, RECURRENCE_ATTRIBUTION_RULE);
  // Window bounds the REINFORCEMENTS, not the items: 07-16, 07-16 and 07-26 fall inside.
  assert.equal(report.byRoute.find((r) => r.route === "guardrail")?.postRoute, 3);
});

// ---------------------------------------------------------------------------
// Question 3 — distinct bottlenecks
// ---------------------------------------------------------------------------

function incrementDoc(id: string, frictionRefs: string[]): StoredDoc {
  return {
    id,
    kind: "increment",
    doc: { title: id, frictionRefs },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

const POPULATION: StoredDoc[] = [
  frictionDoc({ id: "a-flake-hides-later-steps", route: "tool" }),
  frictionDoc({ id: "gate-aborts-early", route: "tool" }),
  frictionDoc({ id: "shared-tmp-path-collides", route: "tool" }),
  frictionDoc({ id: "cites-its-cause", route: "principle", references: ["asset:the-underlying-cause"] }),
  frictionDoc({ id: "the-underlying-cause", route: "principle" }),
  frictionDoc({ id: "stands-alone", route: "adr" }),
  frictionDoc({ id: "already-landed", route: "tool", dischargedBy: "#900" }),
  frictionDoc({ id: "archived-with-reason", route: "nothing" }),
  frictionDoc({ id: "never-adjudicated" }),
];
const INCREMENTS: StoredDoc[] = [
  incrementDoc("one-remedy-for-two", ["a-flake-hides-later-steps", "gate-aborts-early"]),
  incrementDoc("another-remedy-overlapping", ["a-flake-hides-later-steps", "shared-tmp-path-collides"]),
  incrementDoc("single-ref-joins-nothing", ["stands-alone"]),
];

test("the population is un-discharged ROUTED filings — discharged, archived and unrouted are out", () => {
  const recurrence = computeRecurrence({ docs: POPULATION, events: [] });
  const report = computeBottlenecks({ docs: POPULATION, increments: INCREMENTS, recurrence });
  assert.equal(report.sample.filings, 6, "9 friction docs, 6 live: −discharged −archived −unrouted");
  assert.equal(report.population, BOTTLENECK_POPULATION);
  assert.equal(report.context.allFilings, 9);
  assert.equal(report.context.archived, 1);
  assert.equal(report.context.discharged, 1);
});

test("six filings collapse to three distinct causes across BOTH authored edges, transitively", () => {
  const recurrence = computeRecurrence({ docs: POPULATION, events: [] });
  const report = computeBottlenecks({ docs: POPULATION, increments: INCREMENTS, recurrence });
  assert.equal(report.sample.causes, 3);
  assert.equal(report.sample.collapsed, 3, "six filings absorbed into three causes");
  const members = report.causes.map((c) => c.members.join("+")).sort();
  assert.deepEqual(members, [
    "a-flake-hides-later-steps+gate-aborts-early+shared-tmp-path-collides",
    "cites-its-cause+the-underlying-cause",
    "stands-alone",
  ]);
});

test("the collapse is AUDITABLE: each cause names the authored edges that produced it", () => {
  const recurrence = computeRecurrence({ docs: POPULATION, events: [] });
  const report = computeBottlenecks({ docs: POPULATION, increments: INCREMENTS, recurrence });
  const merged = report.causes.find((c) => c.members.length === 3);
  assert.deepEqual(merged?.joinedBy, [
    "increment:another-remedy-overlapping",
    "increment:one-remedy-for-two",
  ]);
  // ONE label per citation pair, naming both ends and the direction — a `cited-by:` twin would print
  // the same edge twice and leave a reader guessing which filing did the citing.
  const cited = report.causes.find((c) => c.members.includes("cites-its-cause"));
  assert.deepEqual(cited?.joinedBy, ["cites-its-cause cites the-underlying-cause"]);
});

test("the rule is STATED in the output and the count declares itself a CEILING", () => {
  const recurrence = computeRecurrence({ docs: POPULATION, events: [] });
  const report = computeBottlenecks({ docs: POPULATION, increments: INCREMENTS, recurrence });
  assert.equal(report.rule, COLLAPSING_RULE);
  assert.match(report.rule, /CEILING on distinctness/);
  assert.equal(report.sample.unjoined, 1, "`stands-alone` carries no join edge and is counted alone");
});

test("no field on the bottleneck report can be read as a filing-volume health figure", () => {
  // ADR-0316 D3 / ADR-0314 D7. Volume is allowed ONLY under `context`, whose name says what it is.
  const recurrence = computeRecurrence({ docs: POPULATION, events: [] });
  const report = computeBottlenecks({ docs: POPULATION, increments: INCREMENTS, recurrence });
  const reading = floorHealthReading({ recurrence, bottlenecks: report });
  const serialised = JSON.stringify(reading);
  assert.equal(serialised.includes("allFilings"), false);
  assert.equal(serialised.includes("archived"), false);
  assert.equal(serialised.includes("discharged"), false);
  assert.deepEqual(
    Object.keys(reading).sort(),
    ["attributionRule", "collapsingRule", "distinctCauses", "unjoined", "window"],
    "the reading a renderer consumes carries no volume field at all when nothing is loud",
  );
});

test("a DISCHARGED item's recurrence never makes the floor loud — its remedy landed", () => {
  // The calibration item carries `dischargedBy: #1031`, so its eight guardrail failures are HISTORY,
  // not a live bottleneck. Question 1 still reports them (that is the extinction record); question 3
  // does not, and the reading a renderer consumes follows question 3's population.
  const docs = [...CALIBRATION_DOCS, ...POPULATION];
  const recurrence = computeRecurrence({ docs, events: CALIBRATION_LOG });
  assert.equal(recurrence.byRoute.find((r) => r.route === "guardrail")?.postRoute, 8);
  const bottlenecks = computeBottlenecks({ docs, increments: INCREMENTS, recurrence });
  assert.equal(
    bottlenecks.causes.some((c) => c.members.includes(CALIBRATION_ID)),
    false,
  );
  assert.equal(floorHealthReading({ recurrence, bottlenecks }).loudest, undefined);
});

test("the reading a renderer consumes names ONE loud cause, its route and its window", () => {
  // The same shape as the calibration item but still LIVE: routed `guardrail`, remedy not landed.
  const id = "a-live-guardrail-that-keeps-firing";
  const events = [
    ev(id, 1, "2026-07-11T09:00:00.000Z", null),
    ev(id, 2, "2026-07-11T13:54:04.888Z", "guardrail"),
  ];
  const docs = [
    ...POPULATION,
    frictionDoc({ id, route: "guardrail", dates: ["2026-07-11", "2026-07-12", "2026-07-16", "2026-07-28"] }),
  ];
  const recurrence = computeRecurrence({ docs, events });
  const bottlenecks = computeBottlenecks({ docs, increments: INCREMENTS, recurrence });
  const reading = floorHealthReading({ recurrence, bottlenecks });
  assert.equal(reading.loudest?.cause, id);
  assert.equal(reading.loudest?.route, "guardrail", "loudness is measured on TRIPWIRE routes only");
  assert.equal(reading.loudest?.recurrences, 3, "recurrences on ONE distinct cause — never a filing count");
  assert.equal(reading.collapsingRule, COLLAPSING_RULE);
  assert.equal(reading.attributionRule, RECURRENCE_ATTRIBUTION_RULE);
});

test("a live board with only `tool` recurrence reads QUIET — an expected shape is not a signal", () => {
  const docs = [CONTROL_1_DOC, CONTROL_2_DOC];
  const recurrence = computeRecurrence({ docs, events: [...CONTROL_1_EVENTS, ...CONTROL_2_EVENTS] });
  const bottlenecks = computeBottlenecks({ docs, increments: [], recurrence });
  const reading = floorHealthReading({ recurrence, bottlenecks });
  assert.equal(reading.loudest, undefined, "six post-route reinforcements, all on `tool`: quiet");
  assert.equal(reading.distinctCauses, 2);
});
