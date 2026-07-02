/**
 * Offline proof for ambient-presence.ts (ADR-0033 Decision 3: advisory-by-construction).
 *
 * Every path through the implementation is fail-silent — presence failures must never
 * surface through fn's result or errors. All fixtures are inline; do NOT read
 * .claude/settings.json from disk.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { PresenceDeclarationDoc } from "@storytree/notice-board";

import type {
  AmbientDeps,
  BuildPresenceInfo,
  HeartbeatState,
} from "./ambient-presence.js";
import {
  withPresence,
  sessionHook,
  statuslineGlance,
  auditHookConfig,
  undeclaredSessionNudge,
} from "./ambient-presence.js";

import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fixed clock
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-13T08:00:00.000Z");
const nowFn = () => NOW;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<PresenceDeclarationDoc> = {}): PresenceDeclarationDoc {
  return {
    sessionId: "wt-test",
    branch: "claude/real/ambient",
    workingOn: "testing ambient",
    nodes: [],
    status: "active",
    startedAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    ...overrides,
  };
}

interface CallRecordingStore extends PresenceStoreLike {
  declareCalls: PresenceDeclarationDoc[];
  declareOpts: Array<{ reactivate?: boolean } | undefined>;
  doneCalls: Array<{ sessionId: string; lastSeenAt: string }>;
  docs: Map<string, PresenceDeclarationDoc>;
}

function makeRecordingStore(seed: PresenceDeclarationDoc[] = []): CallRecordingStore {
  const docs = new Map<string, PresenceDeclarationDoc>();
  for (const doc of seed) {
    docs.set(doc.sessionId, doc);
  }
  const declareCalls: PresenceDeclarationDoc[] = [];
  const declareOpts: Array<{ reactivate?: boolean } | undefined> = [];
  const doneCalls: Array<{ sessionId: string; lastSeenAt: string }> = [];
  return {
    declareCalls,
    declareOpts,
    doneCalls,
    docs,
    async declare(
      doc: PresenceDeclarationDoc,
      opts?: { reactivate?: boolean },
    ): Promise<PresenceDeclarationDoc> {
      declareCalls.push(doc);
      declareOpts.push(opts);
      const existing = docs.get(doc.sessionId);
      // Models the PgPresenceStore contract: an ambient declare never resurrects a retired row.
      if (existing !== undefined && existing.status === "done" && opts?.reactivate === false) {
        return existing;
      }
      const persisted: PresenceDeclarationDoc =
        existing !== undefined ? { ...doc, startedAt: existing.startedAt } : doc;
      docs.set(persisted.sessionId, persisted);
      return persisted;
    },
    async done(sessionId: string, lastSeenAt: string): Promise<PresenceDeclarationDoc | null> {
      doneCalls.push({ sessionId, lastSeenAt });
      const existing = docs.get(sessionId);
      if (existing === undefined) return null;
      const updated: PresenceDeclarationDoc = { ...existing, status: "done", lastSeenAt };
      docs.set(sessionId, updated);
      return updated;
    },
    async listActive(): Promise<PresenceDeclarationDoc[]> {
      return Array.from(docs.values()).filter((d) => d.status === "active");
    },
    async history(): Promise<Array<{ type: string; doc: unknown; actor: string; at: string }>> {
      return [];
    },
  };
}

function makeThrowingStore(): PresenceStoreLike {
  return {
    async declare(): Promise<PresenceDeclarationDoc> {
      throw new Error("store error: declare");
    },
    async done(): Promise<PresenceDeclarationDoc | null> {
      throw new Error("store error: done");
    },
    async listActive(): Promise<PresenceDeclarationDoc[]> {
      throw new Error("store error: listActive");
    },
    async history(): Promise<Array<{ type: string; doc: unknown; actor: string; at: string }>> {
      throw new Error("store error: history");
    },
  };
}

function makeHeartbeatState(initial: string | null = null): HeartbeatState & { bumps: string[] } {
  let stored: string | null = initial;
  const bumps: string[] = [];
  return {
    bumps,
    readLastBump: () => stored,
    writeLastBump: (iso: string) => {
      stored = iso;
      bumps.push(iso);
    },
  };
}

const IDENTITY: SessionIdentity = {
  sessionId: "wt-ambient",
  branch: "claude/real/ambient-integration",
};

const BUILD_INFO: BuildPresenceInfo = {
  nodeId: "ambient-integration",
  runId: "run-42",
  mode: "dry-run",
};

// ---------------------------------------------------------------------------
// withPresence — normal path
// ---------------------------------------------------------------------------

test("withPresence: declares before fn and marks done in finally", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };

  const result = await withPresence(deps, BUILD_INFO, async () => "ok");

  assert.equal(result, "ok");
  assert.ok(store.declareCalls.length >= 1, "declare should have been called");
  assert.ok(store.doneCalls.length >= 1, "done should have been called in finally");
});

test("withPresence: declare doc contains nodeId, sessionId, branch, status active", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };

  await withPresence(deps, BUILD_INFO, async () => "x");

  const declareDoc = store.declareCalls[0];
  assert.ok(declareDoc !== undefined, "at least one declare call");
  assert.ok(declareDoc.nodes.includes(BUILD_INFO.nodeId), "nodeId in nodes");
  assert.equal(declareDoc.sessionId, IDENTITY.sessionId, "sessionId from identity");
  assert.equal(declareDoc.branch, IDENTITY.branch, "branch from identity");
  assert.equal(declareDoc.status, "active", "status is active");
  // workingOn is a non-blank prose line mentioning mode and runId
  assert.ok(declareDoc.workingOn.length > 0, "workingOn is non-blank");
  assert.ok(
    declareDoc.workingOn.includes(BUILD_INFO.mode) || declareDoc.workingOn.includes(BUILD_INFO.runId),
    "workingOn references mode or runId",
  );
});

test("withPresence: done called in finally even when fn throws", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const err = new Error("fn failure");

  await assert.rejects(
    () => withPresence(deps, BUILD_INFO, async () => { throw err; }),
    (caught: unknown) => caught === err,
  );

  assert.ok(store.doneCalls.length >= 1, "done should still be called when fn throws");
});

test("withPresence: fn error object is passed through unchanged", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const originalErr = new Error("original");

  let caught: unknown;
  try {
    await withPresence(deps, BUILD_INFO, async () => { throw originalErr; });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught === originalErr, "exact same error object re-thrown");
});

// ---------------------------------------------------------------------------
// withPresence — null / throwing deps, fail-silent
// ---------------------------------------------------------------------------

test("withPresence: null store — fn result passes through unchanged", async () => {
  const deps: AmbientDeps = { store: null, identity: IDENTITY, now: nowFn };
  const result = await withPresence(deps, BUILD_INFO, async () => "passed");
  assert.equal(result, "passed");
});

test("withPresence: null identity — fn result passes through unchanged", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: null, now: nowFn };
  const result = await withPresence(deps, BUILD_INFO, async () => 42);
  assert.equal(result, 42);
});

test("withPresence: throwing store — fn result passes through, nothing escapes", async () => {
  const deps: AmbientDeps = { store: makeThrowingStore(), identity: IDENTITY, now: nowFn };
  const result = await withPresence(deps, BUILD_INFO, async () => "still ok");
  assert.equal(result, "still ok");
});

test("withPresence: throwing store + fn throws — fn error propagates, store error swallowed", async () => {
  const deps: AmbientDeps = { store: makeThrowingStore(), identity: IDENTITY, now: nowFn };
  const originalErr = new Error("fn threw");
  let caught: unknown;
  try {
    await withPresence(deps, BUILD_INFO, async () => { throw originalErr; });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught === originalErr, "fn error propagates even when store also throws");
});

// ---------------------------------------------------------------------------
// sessionHook
// ---------------------------------------------------------------------------

test("sessionHook start: resolves '' on success and calls declare", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const result = await sessionHook("start", deps, { workingOn: "starting session", timeoutMs: 500 });
  assert.equal(result, "");
  assert.ok(store.declareCalls.length >= 1, "start should call declare");
});

test("sessionHook start: nodes are empty (not a node build — just session scope)", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  await sessionHook("start", deps, { workingOn: "exploring", timeoutMs: 500 });
  const doc = store.declareCalls[0];
  assert.ok(doc !== undefined, "declare was called");
  assert.deepEqual(doc.nodes, [], "start hook declares with empty nodes");
});

test("sessionHook end: resolves '' on success and calls done", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const result = await sessionHook("end", deps, { workingOn: "ending session", timeoutMs: 500 });
  assert.equal(result, "");
  assert.ok(store.doneCalls.length >= 1, "end should call done");
});

test("sessionHook: resolves '' with throwing store on start", async () => {
  const deps: AmbientDeps = { store: makeThrowingStore(), identity: IDENTITY, now: nowFn };
  const result = await sessionHook("start", deps, { workingOn: "work", timeoutMs: 500 });
  assert.equal(result, "");
});

test("sessionHook: resolves '' with throwing store on end", async () => {
  const deps: AmbientDeps = { store: makeThrowingStore(), identity: IDENTITY, now: nowFn };
  const result = await sessionHook("end", deps, { workingOn: "work", timeoutMs: 500 });
  assert.equal(result, "");
});

test("sessionHook: resolves '' with null store", async () => {
  const deps: AmbientDeps = { store: null, identity: IDENTITY, now: nowFn };
  const result = await sessionHook("start", deps, { workingOn: "work", timeoutMs: 500 });
  assert.equal(result, "");
});

test("sessionHook: resolves '' with null identity", async () => {
  const store = makeRecordingStore();
  const deps: AmbientDeps = { store, identity: null, now: nowFn };
  const result = await sessionHook("start", deps, { workingOn: "work", timeoutMs: 500 });
  assert.equal(result, "");
});

test("sessionHook: resolves '' when store call hangs past timeoutMs", async () => {
  const hangingStore: PresenceStoreLike = {
    declare: () => new Promise(() => { /* never resolves */ }),
    done: () => new Promise(() => { /* never resolves */ }),
    listActive: () => new Promise(() => { /* never resolves */ }),
    history: () => new Promise(() => { /* never resolves */ }),
  };
  const deps: AmbientDeps = { store: hangingStore, identity: IDENTITY, now: nowFn };
  // Tiny timeout — should not block the test
  const result = await sessionHook("start", deps, { workingOn: "work", timeoutMs: 20 });
  assert.equal(result, "");
});

// ---------------------------------------------------------------------------
// statuslineGlance — rendering
// ---------------------------------------------------------------------------

test("statuslineGlance: returns non-empty line with active count and own node", async () => {
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
  ]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  const line = await statuslineGlance(deps, state, 60_000);

  assert.ok(line.length > 0, "should return a non-empty line");
  // Must mention active session count
  assert.match(line, /\d+/);
  // Must mention own node(s)
  assert.match(line, /ambient-integration/);
});

test("statuslineGlance: includes overlap warning when another session shares a node", async () => {
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
    makeDoc({
      sessionId: "wt-other",
      branch: "claude/other",
      workingOn: "other work on same node",
      nodes: ["ambient-integration"],
      status: "active",
    }),
  ]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  const line = await statuslineGlance(deps, state, 60_000);

  // Overlap warning must appear
  assert.match(line, /overlap|warn|conflict|also|other/i);
});

test("statuslineGlance: no overlap warning when other session has different nodes", async () => {
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
    makeDoc({
      sessionId: "wt-other",
      branch: "claude/other",
      workingOn: "working on something else",
      nodes: ["declare-presence"],
      status: "active",
    }),
  ]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  // Provide a prior bump far in the past so heartbeat fires but doesn't mess with the test
  const state = makeHeartbeatState(NOW.toISOString()); // within window → no heartbeat

  const line = await statuslineGlance(deps, state, 60_000);

  // No overlap warning when nodes don't intersect
  assert.doesNotMatch(line, /overlap|conflict/i);
});

// ---------------------------------------------------------------------------
// statuslineGlance — fail-silent
// ---------------------------------------------------------------------------

test("statuslineGlance: returns '' when store is null", async () => {
  const deps: AmbientDeps = { store: null, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);
  const result = await statuslineGlance(deps, state, 60_000);
  assert.equal(result, "");
});

test("statuslineGlance: returns '' when identity is null", async () => {
  const store = makeRecordingStore([]);
  const deps: AmbientDeps = { store, identity: null, now: nowFn };
  const state = makeHeartbeatState(null);
  const result = await statuslineGlance(deps, state, 60_000);
  assert.equal(result, "");
});

test("statuslineGlance: returns '' when store throws", async () => {
  const deps: AmbientDeps = { store: makeThrowingStore(), identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);
  const result = await statuslineGlance(deps, state, 60_000);
  assert.equal(result, "");
});

// ---------------------------------------------------------------------------
// statuslineGlance — heartbeat debounce
// ---------------------------------------------------------------------------

test("statuslineGlance: null lastBump → heartbeat fires, declare called, writeLastBump called", async () => {
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
  ]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  await statuslineGlance(deps, state, 60_000);

  assert.ok(store.declareCalls.length >= 1, "heartbeat should have triggered declare");
  assert.ok(state.bumps.length >= 1, "writeLastBump should have been called");
});

test("statuslineGlance: two renders within debounce window — declare called only once total", async () => {
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
  ]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null); // null → first call triggers bump

  // First render — heartbeat fires
  await statuslineGlance(deps, state, 60_000);
  const countAfterFirst = store.declareCalls.length;

  // Second render — lastBump is NOW.toISOString(), elapsed = 0ms < 60_000ms → no extra bump
  await statuslineGlance(deps, state, 60_000);

  assert.equal(
    store.declareCalls.length,
    countAfterFirst,
    "no extra declare call within debounce window",
  );
  assert.equal(state.bumps.length, 1, "writeLastBump called exactly once for both renders");
});

test("statuslineGlance: past debounce window — heartbeat fires again", async () => {
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
  ]);
  // lastBump was 200ms before NOW, debounce = 100ms → expired
  const pastBump = new Date(NOW.getTime() - 200).toISOString();
  const state = makeHeartbeatState(pastBump);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };

  await statuslineGlance(deps, state, 100);

  assert.ok(store.declareCalls.length >= 1, "heartbeat should fire when debounce window expired");
  assert.ok(state.bumps.length >= 1, "writeLastBump should be called again after window expired");
});

test("statuslineGlance: within debounce window (non-null lastBump recent enough) — no heartbeat", async () => {
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
  ]);
  // lastBump = NOW itself → elapsed = 0ms < 60_000ms → within window
  const state = makeHeartbeatState(NOW.toISOString());
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };

  await statuslineGlance(deps, state, 60_000);

  assert.equal(store.declareCalls.length, 0, "no heartbeat declare when within debounce window");
  assert.equal(state.bumps.length, 0, "writeLastBump not called within window");
});

// ---------------------------------------------------------------------------
// statuslineGlance — declare-if-absent self-heal (lost SessionStart)
// ---------------------------------------------------------------------------

test("statuslineGlance: no own row + expired debounce — declares a minimal nodes:[] doc", async () => {
  const store = makeRecordingStore([]); // board empty — SessionStart was lost
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  await statuslineGlance(deps, state, 60_000);

  assert.equal(store.declareCalls.length, 1, "self-heal should declare exactly once");
  const doc = store.declareCalls[0];
  assert.ok(doc !== undefined);
  assert.equal(doc.sessionId, IDENTITY.sessionId, "sessionId from identity");
  assert.equal(doc.branch, IDENTITY.branch, "branch from identity");
  assert.equal(doc.status, "active");
  assert.deepEqual(doc.nodes, [], "automation can only honestly declare nodes: []");
  assert.ok(doc.workingOn.trim().length > 0, "workingOn is non-blank");
  assert.equal(state.bumps.length, 1, "bump recorded so the next render is debounced");
});

test("statuslineGlance: no own row + within debounce window — no declare (rides the same debounce)", async () => {
  const store = makeRecordingStore([]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(NOW.toISOString()); // elapsed 0ms < window

  await statuslineGlance(deps, state, 60_000);

  assert.equal(store.declareCalls.length, 0, "no self-heal declare within the window");
  assert.equal(state.bumps.length, 0);
});

test("statuslineGlance: self-heal declare throws — fail-silent, line still renders, no bump", async () => {
  const base = makeRecordingStore([]);
  const store: PresenceStoreLike = {
    ...base,
    async declare(): Promise<PresenceDeclarationDoc> {
      throw new Error("store error: declare");
    },
  };
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  const line = await statuslineGlance(deps, state, 60_000);

  assert.ok(line.length > 0, "glance still renders when the self-heal declare fails");
  assert.equal(state.bumps.length, 0, "failed declare must not consume the debounce");
});

test("statuslineGlance: self-heal persists — the next expired beat finds the row and heartbeats it", async () => {
  const store = makeRecordingStore([]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const pastBump = new Date(NOW.getTime() - 200).toISOString();

  await statuslineGlance(deps, makeHeartbeatState(null), 100); // self-heal declares
  await statuslineGlance(deps, makeHeartbeatState(pastBump), 100); // expired again

  assert.equal(store.declareCalls.length, 2, "second beat re-declares the existing row");
  const second = store.declareCalls[1];
  assert.ok(second !== undefined);
  assert.equal(second.lastSeenAt, NOW.toISOString(), "second beat is a lastSeenAt heartbeat");
});

// ---------------------------------------------------------------------------
// statuslineGlance — the ambient beat never resurrects a retired row
// ---------------------------------------------------------------------------

test("statuslineGlance: own row retired to done (merge-retire) — heartbeat does NOT flip it back to active", async () => {
  // The observed live failure: the session's PR merged, ingest-merge retired the row
  // to done, but the still-open idle tab keeps firing the statusline heartbeat. The
  // row is invisible to listActive, so the self-heal branch fires — it must declare
  // ambiently (reactivate: false) so the store refuses the resurrection.
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      status: "done",
    }),
  ]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null); // expired debounce — the beat fires

  const line = await statuslineGlance(deps, state, 60_000);

  assert.equal(
    store.docs.get(IDENTITY.sessionId)?.status,
    "done",
    "retired row must stay done after an ambient heartbeat",
  );
  assert.equal(store.declareOpts[0]?.reactivate, false, "ambient declare carries reactivate: false");
  assert.ok(line.length > 0, "glance still renders");
});

test("statuslineGlance: heartbeat bump of an active own row is also ambient (reactivate: false)", async () => {
  // Closes the race where a merge retires the row between the glance's listActive
  // and its declare — every ambient write carries the flag, not just the self-heal.
  const store = makeRecordingStore([
    makeDoc({
      sessionId: IDENTITY.sessionId,
      branch: IDENTITY.branch,
      nodes: ["ambient-integration"],
      status: "active",
    }),
  ]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  await statuslineGlance(deps, state, 60_000);

  assert.ok(store.declareCalls.length >= 1, "heartbeat declared");
  assert.equal(store.declareOpts[0]?.reactivate, false, "bump declare carries reactivate: false");
  assert.equal(store.docs.get(IDENTITY.sessionId)?.status, "active", "active row still bumps");
});

// ---------------------------------------------------------------------------
// auditHookConfig
// ---------------------------------------------------------------------------

// Clean: notice-board hooks only on SessionStart/SessionEnd; unrelated PreToolUse → []
const CLEAN_SETTINGS = JSON.stringify({
  hooks: {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard declare --pg" }] },
    ],
    SessionEnd: [
      { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard done --pg" }] },
    ],
    PreToolUse: [
      { matcher: "", hooks: [{ type: "command", command: "echo unrelated-hook" }] },
    ],
  },
});

test("auditHookConfig: clean settings returns []", () => {
  const violations = auditHookConfig(CLEAN_SETTINGS);
  assert.deepEqual(violations, []);
});

test("auditHookConfig: noticeboard hook under Stop is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard done --pg" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag Stop noticeboard hook");
  assert.ok(
    violations.some((v) => /stop/i.test(v)),
    `violation should mention Stop, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: ambient-presence hook under PreToolUse is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "storytree ambient-presence hook start" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag PreToolUse ambient-presence hook");
  assert.ok(
    violations.some((v) => /pretooluse/i.test(v)),
    `violation should mention PreToolUse, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: the presence-hook launcher under a blocking event is a violation", () => {
  // The shared settings.json invokes `bash scripts/presence-hook.sh <mode>` — its command
  // string never names `ambient-presence`, so the audit must catch it by the launcher name.
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "bash scripts/presence-hook.sh statusline" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag PreToolUse presence-hook launcher");
  assert.ok(
    violations.some((v) => /pretooluse/i.test(v)),
    `violation should mention PreToolUse, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: noticeboard hook under UserPromptSubmit is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: "echo noticeboard status check" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag UserPromptSubmit noticeboard hook");
});

test("auditHookConfig: unrelated PreToolUse hook (not noticeboard-shaped) is NOT a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "echo check something else" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.deepEqual(violations, []);
});

test("auditHookConfig: empty hooks object returns []", () => {
  const violations = auditHookConfig(JSON.stringify({ hooks: {} }));
  assert.deepEqual(violations, []);
});

test("auditHookConfig: no hooks key at all returns []", () => {
  const violations = auditHookConfig(JSON.stringify({}));
  assert.deepEqual(violations, []);
});

test("auditHookConfig: multiple violations across events reported individually", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard done --pg" }] },
      ],
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "run ambient-presence hook start" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 2, "should flag both violations separately");
});

test("auditHookConfig: ambient-presence hook under Stop is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "node ambient-presence.js" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag ambient-presence hook under Stop");
});

// ---------------------------------------------------------------------------
// statuslineGlance — claim heartbeat piggyback (ADR-0142)
// ---------------------------------------------------------------------------

function makeClaimBumper(throwing = false): {
  bumps: string[];
  bumpHeartbeatsBySession(sessionId: string): Promise<number>;
} {
  const bumps: string[] = [];
  return {
    bumps,
    async bumpHeartbeatsBySession(sessionId: string): Promise<number> {
      if (throwing) throw new Error("claim store error: bump");
      bumps.push(sessionId);
      return 1;
    },
  };
}

test("statuslineGlance: the heartbeat beat also bumps the session's claim heartbeats", async () => {
  const store = makeRecordingStore([makeDoc({ sessionId: IDENTITY.sessionId, nodes: ["n1"] })]);
  const claims = makeClaimBumper();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: () => NOW, claims };
  await statuslineGlance(deps, makeHeartbeatState(null), 60_000); // null lastBump → beat fires
  assert.deepEqual(claims.bumps, [IDENTITY.sessionId]);
});

test("statuslineGlance: within the debounce window the claim bump does NOT fire (same debounce as presence)", async () => {
  const store = makeRecordingStore([makeDoc({ sessionId: IDENTITY.sessionId })]);
  const claims = makeClaimBumper();
  const recent = new Date(NOW.getTime() - 1_000).toISOString();
  const deps: AmbientDeps = { store, identity: IDENTITY, now: () => NOW, claims };
  await statuslineGlance(deps, makeHeartbeatState(recent), 60_000);
  assert.equal(claims.bumps.length, 0);
});

test("statuslineGlance: a THROWING claim bumper stays silent — the glance line still renders", async () => {
  const store = makeRecordingStore([makeDoc({ sessionId: IDENTITY.sessionId, nodes: ["n1"] })]);
  const deps: AmbientDeps = {
    store,
    identity: IDENTITY,
    now: () => NOW,
    claims: makeClaimBumper(true),
  };
  const line = await statuslineGlance(deps, makeHeartbeatState(null), 60_000);
  assert.notEqual(line, "", "the glance still renders despite the claim bump failure");
});

test("statuslineGlance: no claims dep (older caller) → beat unchanged, nothing throws", async () => {
  const store = makeRecordingStore([makeDoc({ sessionId: IDENTITY.sessionId })]);
  const deps: AmbientDeps = { store, identity: IDENTITY, now: () => NOW };
  const line = await statuslineGlance(deps, makeHeartbeatState(null), 60_000);
  assert.notEqual(line, "");
});

// ---------------------------------------------------------------------------
// undeclaredSessionNudge (ADR-0143)
// ---------------------------------------------------------------------------

test("undeclaredSessionNudge: a worktree identity gets the one-line anchor prompt naming the declare command", () => {
  const line = undeclaredSessionNudge(IDENTITY);
  assert.match(line, /UNDECLARED/);
  assert.match(line, new RegExp(IDENTITY.sessionId));
  assert.match(line, /noticeboard declare --working-on "<what>" --node <story-id> --pg/);
  assert.match(line, /ADR-0142/);
  assert.equal(line.trim().split("\n").length, 1, "exactly one line — SessionStart stdout is model context");
});

test("undeclaredSessionNudge: a plain checkout (null identity) stays silent", () => {
  assert.equal(undeclaredSessionNudge(null), "");
});
