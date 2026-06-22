import { test } from "node:test";
import assert from "node:assert/strict";

import { decideIdleAction, peakFromTimeSeries } from "./decide.js";

// ── peakFromTimeSeries — the reduce that decides sawData (the bug lived here) ──

test("peakFromTimeSeries: an empty response is sawData=false (unknown, NOT idle)", () => {
  // The DEAD-FUNCTION bug: the old metric returned no series, so every cycle hit
  // this branch and the caller refused to stop. Absent data must read as unknown.
  assert.deepEqual(peakFromTimeSeries({}), { sawData: false, max: 0 });
  assert.deepEqual(peakFromTimeSeries({ timeSeries: [] }), { sawData: false, max: 0 });
  assert.deepEqual(peakFromTimeSeries(undefined), { sawData: false, max: 0 });
});

test("peakFromTimeSeries: all-zero samples are sawData=true, max=0 (the IDLE case that must stop)", () => {
  // num_backends emits continuous 0-valued points while idle — so an idle window is
  // present-with-zeroes, not absent. This is what lets the decision reach STOP.
  const data = {
    timeSeries: [
      { points: [{ value: { int64Value: "0" } }, { value: { int64Value: "0" } }] },
      { points: [{ value: { doubleValue: 0 } }] },
    ],
  };
  assert.deepEqual(peakFromTimeSeries(data), { sawData: true, max: 0 });
});

test("peakFromTimeSeries: peak is the max across all series and points (int64 + double)", () => {
  const data = {
    timeSeries: [
      { points: [{ value: { int64Value: "1" } }, { value: { int64Value: "6" } }] }, // storytree
      { points: [{ value: { int64Value: "1" } }] }, // storytree_test
      { points: [{ value: { doubleValue: 2.5 } }] }, // a fractional aligned value
    ],
  };
  assert.deepEqual(peakFromTimeSeries(data), { sawData: true, max: 6 });
});

test("peakFromTimeSeries: a series with no points contributes nothing but isn't an error", () => {
  const data = { timeSeries: [{ points: [] }, { points: [{ value: { int64Value: "3" } }] }] };
  assert.deepEqual(peakFromTimeSeries(data), { sawData: true, max: 3 });
});

// ── decideIdleAction — the full noop/stop matrix ──

test("decideIdleAction: a stopped instance is a noop, never a stop", () => {
  const d = decideIdleAction({ state: "STOPPED", policy: "NEVER", sawData: false, peakConnections: 0, idleMinutes: 300 });
  assert.equal(d.action, "noop");
  assert.equal(d.reason, "not-running");
});

test("decideIdleAction: RUNNABLE but policy NEVER is still not-running", () => {
  const d = decideIdleAction({ state: "RUNNABLE", policy: "NEVER", sawData: true, peakConnections: 0, idleMinutes: 300 });
  assert.equal(d.action, "noop");
  assert.equal(d.reason, "not-running");
});

test("decideIdleAction: no metric data fails SAFE (noop, do not stop)", () => {
  const d = decideIdleAction({ state: "RUNNABLE", policy: "ALWAYS", sawData: false, peakConnections: 0, idleMinutes: 300 });
  assert.deepEqual(d, { action: "noop", reason: "no-metric-data", idleMinutes: 300 });
});

test("decideIdleAction: any connection in the window leaves it UP (active)", () => {
  const d = decideIdleAction({ state: "RUNNABLE", policy: "ALWAYS", sawData: true, peakConnections: 2, idleMinutes: 300 });
  assert.deepEqual(d, { action: "noop", reason: "active", peakConnections: 2, idleMinutes: 300 });
});

test("decideIdleAction: RUNNABLE + samples present + zero peak => STOP (the whole point)", () => {
  const d = decideIdleAction({ state: "RUNNABLE", policy: "ALWAYS", sawData: true, peakConnections: 0, idleMinutes: 300 });
  assert.deepEqual(d, { action: "stop", reason: "idle", idleMinutes: 300 });
});

// ── the two pure functions composed: the fixed metric now reaches STOP ──

test("an idle window (present, all-zero) on a RUNNABLE instance decides STOP end-to-end", () => {
  const idleWindow = { timeSeries: [{ points: [{ value: { int64Value: "0" } }, { value: { int64Value: "0" } }] }] };
  const { sawData, max } = peakFromTimeSeries(idleWindow);
  const d = decideIdleAction({ state: "RUNNABLE", policy: "ALWAYS", sawData, peakConnections: max, idleMinutes: 300 });
  assert.equal(d.action, "stop");
});

test("a busy window on a RUNNABLE instance decides NOOP/active end-to-end", () => {
  const busy = { timeSeries: [{ points: [{ value: { int64Value: "0" } }, { value: { int64Value: "4" } }] }] };
  const { sawData, max } = peakFromTimeSeries(busy);
  const d = decideIdleAction({ state: "RUNNABLE", policy: "ALWAYS", sawData, peakConnections: max, idleMinutes: 300 });
  assert.equal(d.action, "noop");
  assert.equal(d.reason, "active");
  assert.equal(d.peakConnections, 4);
});
