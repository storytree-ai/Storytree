import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMintboxCoordinatorDigest,
  createMintboxSupervisorState,
  decideMintboxSupervisorEvent,
  isMintboxRendererReleased,
  isMintboxProgressReportDue,
  MINTBOX_COORDINATOR_DIGEST_MAX_BYTES,
  mintboxEventDedupeKey,
  recordMintboxDetachedHandle,
  recordMintboxProgressReport,
  type MintboxDetachedHandle,
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

test("mintbox-meaningful-events-wake-once: ignores an unrecognised runtime event kind without consuming its wake key", () => {
  const initial = createMintboxSupervisorState(facts);
  const runtimeEvent = { ...event } satisfies Parameters<typeof decideMintboxSupervisorEvent>[1];
  Reflect.set(runtimeEvent, "kind", "conversation-message");

  const decision = decideMintboxSupervisorEvent(initial, runtimeEvent);

  assert.equal(decision.wake, null);
  assert.deepEqual(decision.state, initial);
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

test("repeated handle observation refreshes health and every digest string remains bounded", () => {
  const long = "界".repeat(400);
  const initial = recordMintboxDetachedHandle(createMintboxSupervisorState({
    ready3dLanes: Array.from({ length: 20 }, () => long),
    blocked3dLanes: Array.from({ length: 20 }, () => long),
    parallelSessionCount: 1,
  }), {
    id: long,
    role: "worker",
    pid: 17,
    host: "mint",
    detached: true,
    startedAt: event.occurredAt,
    health: "running",
    model: long,
    effort: long,
    lane: long,
  });
  const refreshed = recordMintboxDetachedHandle(initial, {
    id: long,
    role: "worker",
    pid: 17,
    host: "mint",
    detached: true,
    startedAt: event.occurredAt,
    health: "failed",
    model: long,
    effort: long,
    lane: long,
    outcome: long,
  });

  assert.equal(refreshed.handles.length, 1);
  assert.equal(refreshed.handles[0]?.id, long, "durable OS identity is never truncated");
  assert.equal(refreshed.handles[0]?.health, "failed", "a probe refresh cannot leave stale health behind");
  assert.equal(refreshed.handles[0]?.outcome?.length, 280);
  const digest = buildMintboxCoordinatorDigest(refreshed, {
    ...event,
    subject: long,
    occurredAt: `2026-09-09T00:00:00.${"1".repeat(400)}Z`,
    summary: long,
  });
  assert.equal(digest.event.subject.length, 280);
  assert.equal(digest.event.occurredAt, "2026-09-09T00:00:00.111Z");
  assert.equal(digest.event.summary?.length, 280);
  assert.equal(digest.workers[0]?.id.length, 280);
  assert.equal(digest.workers[0]?.model.length, 280);
  assert.equal(digest.workers[0]?.effort.length, 280);
  assert.equal(digest.workers[0]?.lane?.length, 280);
  assert.equal(digest.ready3dLanes.length, 8);
  assert.equal(digest.blocked3dLanes.length, 8);
  assert.ok(Buffer.byteLength(JSON.stringify(digest), "utf8") <= MINTBOX_COORDINATOR_DIGEST_MAX_BYTES);
  assert.equal(JSON.stringify(digest).includes("transcript"), false);
});

test("mintbox-supervisor-owns-handles-not-transcripts: coordinator digests exclude transcript-shaped summaries while retaining bounded operational summaries", () => {
  const state = createMintboxSupervisorState(facts);
  const privateConversation = decideMintboxSupervisorEvent(state, {
    kind: "completion",
    subject: "terrain",
    deliveryId: "private-conversation-72",
    occurredAt: "2026-09-09T01:00:00.000Z",
    summary: "User: MINTBOX-PRIVATE-CONVERSATION-DO-NOT-RETAIN\r\nAssistant: acknowledged\nUser: continue",
  });
  assert.ok(privateConversation.wake);
  const serializedPrivateDigest = JSON.stringify(privateConversation.wake.digest);
  assert.equal(serializedPrivateDigest.includes("MINTBOX-PRIVATE-CONVERSATION-DO-NOT-RETAIN"), false);
  assert.equal(serializedPrivateDigest.includes("\r"), false);
  assert.equal(serializedPrivateDigest.includes("\n"), false);

  const operationalEvent = decideMintboxSupervisorEvent(privateConversation.state, {
    kind: "completion",
    subject: "terrain",
    deliveryId: "operational-summary-73",
    occurredAt: "2026-09-09T01:01:00.000Z",
    summary: "terrain proof passed",
  });
  assert.ok(operationalEvent.wake);
  assert.equal(operationalEvent.wake.digest.event.summary, "terrain proof passed");
});

test("renderer release requires matching terminal-green and claim-release evidence without changing wake identity", () => {
  const protectedId = "renderer-1";
  assert.equal(isMintboxRendererReleased({ rendererId: protectedId, terminal: "failure", claim: "released" }, protectedId), false);
  assert.equal(isMintboxRendererReleased({ rendererId: protectedId, terminal: "disappeared", claim: "released" }, protectedId), false);
  assert.equal(isMintboxRendererReleased({ rendererId: protectedId, terminal: "green", claim: "held" }, protectedId), false);
  assert.equal(isMintboxRendererReleased({ rendererId: "other", terminal: "green", claim: "released" }, protectedId), false);
  const sharedPrefix = "r".repeat(280);
  assert.equal(isMintboxRendererReleased({ rendererId: `${sharedPrefix}-one`, terminal: "green", claim: "released" }, `${sharedPrefix}-two`), false);
  assert.equal(isMintboxRendererReleased({ rendererId: protectedId, terminal: "green", claim: "released" }, protectedId), true);

  const state = createMintboxSupervisorState(facts);
  const withoutEvidence = decideMintboxSupervisorEvent(state, event);
  const withEvidence = decideMintboxSupervisorEvent(state, {
    ...event,
    rendererEvidence: { rendererId: protectedId, terminal: "green", claim: "released" },
  });
  assert.equal(withEvidence.wake?.dedupeKey, withoutEvidence.wake?.dedupeKey);
  assert.equal(withEvidence.wake?.id, withoutEvidence.wake?.id);
  assert.deepEqual(withEvidence.wake?.digest.event.rendererEvidence, {
    rendererId: protectedId,
    terminal: "green",
    claim: "released",
  });
  assert.equal(withoutEvidence.wake?.digest.event.rendererEvidence, undefined);
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
  assert.equal(recorded.handles[0]?.architecture, true);
  assert.equal(recorded.handles[0]?.lane?.length, 280);
  assert.equal(recorded.handles[0]?.outcome?.length, 280);
  assert.equal(recordMintboxDetachedHandle(recorded, coordinator), recorded, "same durable handle is idempotent");
  const { architecture: _architecture, ...withoutArchitecture } = coordinator;
  const high = recordMintboxDetachedHandle(state, { ...withoutArchitecture, id: "coord-high", effort: "high" });
  assert.equal(high.handles[0]?.architecture, undefined);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "wrong-model", model: "gpt-5.6-terra" }), /must use gpt-6-astra/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...withoutArchitecture, id: "bad-effort", effort: "max" }), /invalid Mintbox coordinator effort: max/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...withoutArchitecture, id: "no-proof" }), /xhigh requires architecture/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "not-detached", detached: false } as never), /positive detached pid/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "zero-pid", pid: 0 }), /positive detached pid/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "", }), /handle identity is required/);
  assert.throws(() => recordMintboxDetachedHandle(state, { ...coordinator, id: "bad-date", startedAt: "never" }), /handle startedAt must be an ISO-compatible timestamp/);
});

test("a repeated handle id changes observations but never immutable process identity", () => {
  const base = {
    id: "stable-worker",
    role: "worker" as const,
    pid: 41,
    host: "mint",
    detached: true as const,
    startedAt: "2026-09-09T00:00:00.000Z",
    health: "running" as const,
    model: "gpt-5.6-terra",
    effort: "high",
    lane: "terrain",
    outcome: "warming",
  };
  const initial = recordMintboxDetachedHandle(createMintboxSupervisorState(facts), base);
  const immutableVariants: ReadonlyArray<readonly [string, MintboxDetachedHandle]> = [
    ["role", { ...base, role: "renderer" }],
    ["pid", { ...base, pid: 42 }],
    ["host", { ...base, host: "other-box" }],
    ["startedAt", { ...base, startedAt: "2026-09-09T00:00:01.000Z" }],
    ["model", { ...base, model: "another-runtime-model" }],
    ["effort", { ...base, effort: "medium" }],
    ["architecture", { ...base, architecture: true }],
    ["lane", { ...base, lane: "water" }],
  ];
  for (const [field, incoming] of immutableVariants) {
    assert.throws(
      () => recordMintboxDetachedHandle(initial, incoming),
      /cannot change immutable process identity/,
      `${field} stays bound to the original process`,
    );
  }

  const { outcome: _outcome, ...withoutOutcome } = base;
  const healthRefresh = recordMintboxDetachedHandle(initial, { ...withoutOutcome, health: "failed" });
  assert.equal(healthRefresh.handles[0]?.health, "failed");
  assert.equal(healthRefresh.handles[0]?.outcome, "warming", "an omitted observation does not erase the last outcome");
  const outcomeRefresh = recordMintboxDetachedHandle(healthRefresh, { ...base, health: "failed", outcome: "probe failed" });
  assert.equal(outcomeRefresh.handles[0]?.outcome, "probe failed");
  assert.equal(
    recordMintboxDetachedHandle(outcomeRefresh, { ...base, health: "failed", outcome: "probe failed" }),
    outcomeRefresh,
    "an unchanged observation preserves the state identity",
  );
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
  assert.throws(() => decideMintboxSupervisorEvent(state, {
    ...event,
    rendererEvidence: { rendererId: " ", terminal: "green", claim: "released" },
  }), /renderer evidence needs a rendererId/);
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
  assert.equal(mintboxEventDedupeKey({ ...event, subject: "a:b", deliveryId: "c" }), "completion:a%3Ab:c");
  assert.equal(mintboxEventDedupeKey({ ...event, subject: "a%b:c", deliveryId: "d%e:f" }), "completion:a%25b%3Ac:d%25e%3Af");
  assert.notEqual(
    mintboxEventDedupeKey({ ...event, subject: "a:b", deliveryId: "c" }),
    mintboxEventDedupeKey({ ...event, subject: "a", deliveryId: "b:c" }),
  );
  assert.notEqual(
    mintboxEventDedupeKey({ ...event, subject: "a:b", deliveryId: "c" }),
    mintboxEventDedupeKey({ ...event, subject: "a%3Ab", deliveryId: "c" }),
  );
});

test("the declared digest byte ceiling holds for maximally escaped bounded fields", () => {
  const hostile = "\u0000".repeat(400);
  let state = createMintboxSupervisorState({
    rendererId: hostile,
    rendererHealth: "failed",
    rendererBlocker: hostile,
    ready3dLanes: Array.from({ length: 20 }, () => hostile),
    blocked3dLanes: Array.from({ length: 20 }, () => hostile),
    parallelSessionCount: 3,
    lastOutcome: hostile,
  });
  for (let n = 0; n < 8; n += 1) {
    state = recordMintboxDetachedHandle(state, {
      id: `${hostile}${n}`,
      role: "worker",
      pid: 100 + n,
      host: "mint",
      detached: true,
      startedAt: event.occurredAt,
      health: "running",
      model: hostile,
      effort: hostile,
      lane: hostile,
    });
  }
  const digest = buildMintboxCoordinatorDigest(state, {
    ...event,
    subject: hostile,
    summary: hostile,
    rendererEvidence: { rendererId: hostile, terminal: "failure", claim: "released" },
  });
  const serialized = JSON.stringify(digest);
  assert.ok(Buffer.byteLength(serialized, "utf8") <= MINTBOX_COORDINATOR_DIGEST_MAX_BYTES);
  assert.equal(serialized.includes("\\u0000"), false);
});

test("digest sanitization replaces exactly unsafe code-unit boundaries", () => {
  const unsafeBoundaries = "\u0000\u001f \ud7ff\ud800\udfff\ue000";
  const digest = buildMintboxCoordinatorDigest(
    createMintboxSupervisorState({ ready3dLanes: [], blocked3dLanes: [], parallelSessionCount: 0 }),
    { ...event, subject: unsafeBoundaries, summary: unsafeBoundaries },
  );
  assert.equal(digest.event.subject, "�� \ud7ff��\ue000");
  assert.equal(digest.event.summary, "�� \ud7ff��\ue000");
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
