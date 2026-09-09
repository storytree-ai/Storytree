import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMintboxCoordinatorDigest,
  createMintboxSupervisorState,
  decideMintboxSupervisorEvent,
  isMintboxProgressReportDue,
  mintboxEventDedupeKey,
  recordMintboxDetachedHandle,
  recordMintboxProgressReport,
  updateMintboxProgrammeFacts,
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
  assert.equal(first.wake.id, "mintbox-coordinator:completion:terrain:job-72");
  assert.equal(first.wake.model, "gpt-6-astra");
  assert.equal(first.wake.effort, "high");
  assert.equal(first.wake.architecture, false);
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
  assert.equal(first.report.coordinatorHealth, "none");
  assert.equal(first.report.weeklyUsageDelta, null);
  assert.deepEqual(first.report.workerHealth, []);
  assert.equal(isMintboxProgressReportDue(first.state, new Date("2026-09-09T02:59:59.000Z")), false);
  assert.equal(isMintboxProgressReportDue(first.state, new Date("2026-09-09T03:00:00.000Z")), true);
  const second = recordMintboxProgressReport(first.state, { at: "2026-09-09T03:00:00.000Z", weeklyUsagePercent: 37, action: "wake coordinator" });
  assert.equal(second.report.weeklyUsageDelta, 5);
  assert.equal(second.report.rendererBlocker, "green boundary pending");
  assert.equal(second.report.lastOutcome, "terrain proof passed");
  assert.deepEqual(second.report.lanes, { ready3d: ["canopy"], blocked3d: ["shadows"] });
});

test("recording handles validates real detached identity, coordinator exceptions, and idempotence", () => {
  const state = createMintboxSupervisorState(facts);
  const coordinator = {
    id: "coord-architecture", role: "coordinator" as const, pid: 14, host: "mint", detached: true as const,
    startedAt: "2026-09-09T00:02:00.000Z", health: "blocked" as const, model: "gpt-6-astra", effort: "xhigh", architecture: true as const,
    lane: "a".repeat(300), outcome: "b".repeat(300),
  };
  const recorded = recordMintboxDetachedHandle(state, coordinator);
  assert.equal(recorded.handles.length, 1);
  assert.equal(recorded.handles[0]?.lane?.length, 280);
  assert.equal(recorded.handles[0]?.outcome?.length, 280);
  assert.equal(recordMintboxDetachedHandle(recorded, coordinator), recorded, "same durable handle is idempotent");
  const { architecture: _architecture, ...withoutArchitecture } = coordinator;
  assert.doesNotThrow(() => recordMintboxDetachedHandle(state, { ...withoutArchitecture, id: "coord-high", effort: "high" }));
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "wrong-model", model: "gpt-5.6-terra" }), /must use gpt-6-astra/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...withoutArchitecture, id: "bad-effort", effort: "max" }), /invalid Mintbox coordinator effort: max/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...withoutArchitecture, id: "no-proof" }), /xhigh requires architecture/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "not-detached", detached: false } as never), /positive detached pid/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "zero-pid", pid: 0 }), /positive detached pid/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "", }), /handle identity is required/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "bad-date", startedAt: "never" }), /handle startedAt must be an ISO-compatible timestamp/);
});

test("programme facts are bounded, replaceable, and reject invalid capacity", () => {
  const long = "x".repeat(300);
  const updated = updateMintboxProgrammeFacts(createMintboxSupervisorState(facts), {
    rendererId: long, rendererHealth: "failed", rendererBlocker: long, lastOutcome: long,
    ready3dLanes: Array.from({ length: 10 }, (_, n) => `${long}-${n}`),
    blocked3dLanes: Array.from({ length: 9 }, (_, n) => `blocked-${n}`), parallelSessionCount: 0,
  });
  assert.equal(updated.facts.rendererId?.length, 280);
  assert.equal(updated.facts.rendererBlocker?.length, 280);
  assert.equal(updated.facts.lastOutcome?.length, 280);
  assert.equal(updated.facts.ready3dLanes.length, 8);
  assert.equal(updated.facts.blocked3dLanes.length, 8);
  assert.equal(updated.facts.parallelSessionCount, 0);
  const minimal = updateMintboxProgrammeFacts(updated, { ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 1 });
  assert.deepEqual(minimal.facts, { ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 1 });
  for (const bad of [-1, 1.5, Number.NaN]) {
    assert.throws(() => createMintboxSupervisorState({ ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: bad }), /parallelSessionCount must be a non-negative integer/);
  }
});

test("architecture events use xhigh and event validation retains each meaningful branch", () => {
  const state = createMintboxSupervisorState({ ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 0 });
  const { summary: _summary, ...eventWithoutSummary } = event;
  const architecture = decideMintboxSupervisorEvent(state, { ...eventWithoutSummary, architecture: true });
  assert.deepEqual(architecture.wake && { model: architecture.wake.model, effort: architecture.wake.effort, architecture: architecture.wake.architecture }, { model: "gpt-6-astra", effort: "xhigh", architecture: true });
  assert.equal(architecture.wake?.digest.event.summary, undefined);
  assert.throws(() => decideMintboxSupervisorEvent(state, { ...event, subject: "" }), /subject and deliveryId are required/);
  assert.throws(() => decideMintboxSupervisorEvent(state, { ...event, deliveryId: "" }), /subject and deliveryId are required/);
  assert.throws(() => decideMintboxSupervisorEvent(state, { ...event, occurredAt: "not-a-date" }), /event occurredAt must be an ISO-compatible timestamp/);
});

test("digest reports absent renderer and workers with and without lanes within its fixed bound", () => {
  let state = createMintboxSupervisorState({ ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 0 });
  for (let n = 0; n < 10; n += 1) {
    const worker = {
      id: `worker-${n}`, role: "worker", pid: n + 1, host: "mint", detached: true,
      startedAt: "2026-09-09T00:00:00.000Z", health: n % 2 === 0 ? "running" : "finished",
      model: "gpt-5.6-terra", effort: "high",
    } as const;
    state = n % 2 === 0
      ? recordMintboxDetachedHandle(state, { ...worker, lane: `lane-${n}` })
      : recordMintboxDetachedHandle(state, worker);
  }
  const digest = buildMintboxCoordinatorDigest(state, event);
  assert.deepEqual(digest.renderer, { id: null, health: "unknown", blocker: null });
  assert.equal(digest.coordinatorHealth, "none");
  assert.equal(digest.workers.length, 8);
  assert.equal(digest.workers[0]?.id, "worker-2");
  assert.deepEqual(digest.workers[0], { id: "worker-2", health: "running", model: "gpt-5.6-terra", effort: "high", lane: "lane-2" });
  assert.deepEqual(digest.workers[1], { id: "worker-3", health: "finished", model: "gpt-5.6-terra", effort: "high" });
});

test("report validates cadence inputs and includes workers with and without lanes", () => {
  let state = createMintboxSupervisorState(facts);
  state = recordMintboxDetachedHandle(state, { id: "coord", role: "coordinator", pid: 1, host: "mint", detached: true, startedAt: "2026-09-09T00:00:00.000Z", health: "finished", model: "gpt-6-astra", effort: "high" });
  state = recordMintboxDetachedHandle(state, { id: "bare-worker", role: "worker", pid: 2, host: "mint", detached: true, startedAt: "2026-09-09T00:00:00.000Z", health: "failed", model: "gpt-5.6-terra", effort: "medium" });
  state = recordMintboxDetachedHandle(state, { id: "lane-worker", role: "worker", pid: 3, host: "mint", detached: true, startedAt: "2026-09-09T00:00:00.000Z", health: "blocked", model: "gpt-5.6-terra", effort: "high", lane: "shadows" });
  const result = recordMintboxProgressReport(state, { at: "2026-09-09T00:00:00.000Z", weeklyUsagePercent: 0, action: "x".repeat(300) });
  assert.equal(result.report.coordinatorHealth, "finished");
  assert.deepEqual(result.report.workerHealth, [
    { id: "bare-worker", health: "failed", model: "gpt-5.6-terra", effort: "medium" },
    { id: "lane-worker", health: "blocked", model: "gpt-5.6-terra", effort: "high", lane: "shadows" },
  ]);
  assert.equal(result.report.action.length, 280);
  assert.throws(() => recordMintboxProgressReport(state, { at: "bad", weeklyUsagePercent: 1, action: "go" }), /report at must be an ISO-compatible timestamp/);
  assert.throws(() => recordMintboxProgressReport(state, { at: event.occurredAt, weeklyUsagePercent: -1, action: "go" }), /weekly usage percent must be between 0 and 100/);
  assert.throws(() => recordMintboxProgressReport(state, { at: event.occurredAt, weeklyUsagePercent: 101, action: "go" }), /weekly usage percent must be between 0 and 100/);
  assert.throws(() => recordMintboxProgressReport(state, { at: event.occurredAt, weeklyUsagePercent: 1, action: " " }), /Mintbox progress report needs an action/);
});

test("durable default state and event key retain their exact scheduler identity", () => {
  assert.deepEqual(createMintboxSupervisorState({ ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 0 }), {
    version: 1, handles: [], wakeKeys: [], facts: { ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 0 },
  });
  assert.equal(mintboxEventDedupeKey(event), "completion:terrain:job-72");
});

test("the digest retains populated facts, newest coordinator, and its explicit event details", () => {
  let state = createMintboxSupervisorState(facts);
  state = recordMintboxDetachedHandle(state, { id: "old", role: "coordinator", pid: 1, host: "mint", detached: true, startedAt: event.occurredAt, health: "running", model: "gpt-6-astra", effort: "high" });
  state = recordMintboxDetachedHandle(state, { id: "new", role: "coordinator", pid: 2, host: "mint", detached: true, startedAt: event.occurredAt, health: "failed", model: "gpt-6-astra", effort: "high" });
  assert.deepEqual(buildMintboxCoordinatorDigest(state, event), {
    event: { kind: "completion", subject: "terrain", occurredAt: "2026-09-09T01:00:00.000Z", summary: "green" },
    coordinatorHealth: "failed", workers: [],
    renderer: { id: "proof-renderer", health: "running", blocker: "green boundary pending" },
    ready3dLanes: ["canopy"], blocked3dLanes: ["shadows"], parallelSessionCount: 2, lastOutcome: "terrain proof passed",
  });
});

test("validation refuses blank identity fields and all numeric boundary failures", () => {
  const state = createMintboxSupervisorState(facts);
  const valid = { id: "handle", role: "worker" as const, pid: 1, host: "mint", detached: true as const, startedAt: event.occurredAt, health: "running" as const, model: "gpt-5.6-terra", effort: "high" };
  for (const key of ["id", "host", "model", "effort"] as const) {
    assert.throws(() => recordMintboxDetachedHandle(state, { ...valid, [key]: " " }), /Mintbox handle identity is required/);
  }
  assert.throws(() => recordMintboxDetachedHandle(state, { ...valid, pid: -1 }), /positive detached pid/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...valid, pid: 1.5 }), /positive detached pid/);
  assert.throws(() => decideMintboxSupervisorEvent(state, { ...event, subject: " " }), /subject and deliveryId are required/);
  assert.throws(() => decideMintboxSupervisorEvent(state, { ...event, deliveryId: " " }), /subject and deliveryId are required/);
  assert.doesNotThrow(() => recordMintboxProgressReport(state, { at: event.occurredAt, weeklyUsagePercent: 100, action: "cap reached" }));
  assert.throws(() => recordMintboxProgressReport(state, { at: event.occurredAt, weeklyUsagePercent: Number.NaN, action: "go" }), /weekly usage percent must be between 0 and 100/);
});

test("an empty programme renders null optional report facts rather than invented operational data", () => {
  const state = createMintboxSupervisorState({ ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 0 });
  const { report } = recordMintboxProgressReport(state, { at: event.occurredAt, weeklyUsagePercent: 4, action: "await event" });
  assert.equal(report.lastOutcome, null);
  assert.equal(report.rendererBlocker, null);
  assert.deepEqual(report.workerHealth, []);
});
