import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMintboxCoordinatorDigest,
  createMintboxSupervisorState,
  decideMintboxSupervisorEvent,
  isMintboxProgressReportDue,
  recordMintboxDetachedHandle,
  recordMintboxProgressReport,
  verifyMintboxCoordinatorPolicy,
} from "./mintbox-supervisor.js";

const facts = {
  rendererId: "proof-renderer",
  rendererHealth: "running" as const,
  rendererBlocker: "green boundary pending",
  ready3dLanes: ["canopy"],
  blocked3dLanes: ["shadows"],
  parallelSessionCount: 2,
  lastOutcome: "terrain proof passed",
};
const event = { kind: "completion" as const, subject: "terrain", deliveryId: "job-72", occurredAt: "2026-09-09T01:00:00.000Z", summary: "green" };

test("each meaningful event wakes exactly once across retry and supervisor recovery", () => {
  const initial = createMintboxSupervisorState(facts);
  const first = decideMintboxSupervisorEvent(initial, event);
  assert.ok(first.wake);
  assert.equal(first.wake.model, "gpt-6-astra");
  assert.equal(first.wake.effort, "high");
  assert.equal(decideMintboxSupervisorEvent(first.state, event).wake, null, "retry is deduplicated");
  const recovered = JSON.parse(JSON.stringify(first.state));
  assert.equal(decideMintboxSupervisorEvent(recovered, event).wake, null, "persisted key survives restart");

  for (const kind of ["failure", "dependency-release", "empty-ready-worker", "owner-attestation-gate"] as const) {
    const decision = decideMintboxSupervisorEvent(initial, { ...event, kind, deliveryId: `${kind}-1` });
    assert.ok(decision.wake, `${kind} wakes a compact coordinator`);
  }
});

test("state owns detached handles and digest carries bounded facts rather than raw transcripts", () => {
  const renderer = { id: "renderer-1", role: "renderer" as const, pid: 12, host: "mint", detached: true as const, startedAt: "2026-09-09T00:00:00.000Z", health: "running" as const, model: "existing-renderer", effort: "n/a" };
  const worker = { id: "worker-1", role: "worker" as const, pid: 13, host: "mint", detached: true as const, startedAt: "2026-09-09T00:01:00.000Z", health: "running" as const, model: "gpt-5.6-terra", effort: "high", lane: "canopy" };
  const state = recordMintboxDetachedHandle(recordMintboxDetachedHandle(createMintboxSupervisorState(facts), renderer), worker);
  const digest = buildMintboxCoordinatorDigest(state, event);
  assert.equal(state.handles[0]?.id, "renderer-1");
  assert.deepEqual(digest.workers, [{ id: "worker-1", health: "running", model: "gpt-5.6-terra", effort: "high", lane: "canopy" }]);
  assert.equal(JSON.stringify(digest).includes("transcript"), false);
  assert.equal(state.handles[0]?.health, "running", "renderer is observed, never stopped or restarted");
});

test("Astra is high by default and xhigh requires an architecture decision", () => {
  assert.deepEqual(verifyMintboxCoordinatorPolicy({}), { model: "gpt-6-astra", effort: "high" });
  assert.deepEqual(verifyMintboxCoordinatorPolicy({ architecture: true, effort: "xhigh" }), { model: "gpt-6-astra", effort: "xhigh" });
  assert.throws(() => verifyMintboxCoordinatorPolicy({ effort: "xhigh" }), /architecture/);
  assert.throws(() => verifyMintboxCoordinatorPolicy({ model: "gpt-5.6-terra" }), /gpt-6-astra/);
});

test("three-hour progress reports carry operational state, weekly usage, and delta", () => {
  const base = createMintboxSupervisorState(facts);
  assert.equal(isMintboxProgressReportDue(base, new Date("2026-09-09T00:00:00.000Z")), true);
  const first = recordMintboxProgressReport(base, { at: "2026-09-09T00:00:00.000Z", weeklyUsagePercent: 32, action: "wait for renderer green boundary" });
  assert.equal(isMintboxProgressReportDue(first.state, new Date("2026-09-09T02:59:59.000Z")), false);
  assert.equal(isMintboxProgressReportDue(first.state, new Date("2026-09-09T03:00:00.000Z")), true);
  const second = recordMintboxProgressReport(first.state, { at: "2026-09-09T03:00:00.000Z", weeklyUsagePercent: 37, action: "wake coordinator" });
  assert.equal(second.report.weeklyUsageDelta, 5);
  assert.equal(second.report.rendererBlocker, "green boundary pending");
  assert.deepEqual(second.report.lanes, { ready3d: ["canopy"], blocked3d: ["shadows"] });
});
