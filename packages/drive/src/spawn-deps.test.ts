/**
 * Integration test for the spawn-deps composition (spawn-deps-composition capability,
 * ADR-0137 Phase 3): proves the composition renders the real story-author agent
 * fail-closed, carries session identity into the claim deps the gate stamps, and
 * threads the assembled spawn deps through the real orchestrate() chain unchanged.
 *
 * Exercised against the real in-story collaborators — the real renderAgentPrompt over
 * the real seed (loadCorpus + InMemoryStore), the real orchestrate composition, the
 * real buildSpawnTools surface + claim gate — with the SDK query() scripted and the
 * claim store / build runner injected doubles (ADR-0010 §5: a live SDK-billed spawn
 * never runs on a gate pass).
 *
 * Coverage ids (from stories/chat-subagent-spawn/spawn-deps-composition.md):
 *   sdc-renders-the-real-story-author-agent
 *   sdc-claim-deps-carry-session-identity-and-role
 *   sdc-threads-spawn-deps-through-orchestrate-without-a-fork
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus, renderAgentPrompt } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";
import { buildSpawnTools } from "@storytree/agent";

import { BuildRegistry, type BuildContext, type BuildEnvelope } from "./build-worker.js";
import { orchestrate } from "./orchestrate.js";
import { buildSpawnDeps, type SpawnSurfaceDeps } from "./spawn-deps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 1,
  total_cost_usd: 0.001,
  result: "session finished",
};

/**
 * A queryFn that counts calls and captures the SDK Options it receives, then yields one
 * scripted result — the observable that proves what the composition passed the SDK
 * (systemPrompt for the spawned session; allowedTools for the orchestrate session) and
 * that a fail-closed refusal made NO SDK call.
 */
function capturingQuery(): {
  fn: SdkQueryFn;
  calls: () => number;
  lastOptions: () => Record<string, unknown>;
} {
  let calls = 0;
  let captured: Record<string, unknown> = {};
  const fn: SdkQueryFn = ({ options }) => {
    calls += 1;
    captured = options as Record<string, unknown>;
    return (async function* () {
      yield OK_RESULT;
    })();
  };
  return { fn, calls: () => calls, lastOptions: () => captured };
}

/** The claim-request shape the recording store captures (what the gate stamped). */
interface CapturedClaimReq {
  unitId: string;
  sessionId: string;
  branch: string;
  intent?: string;
}

/** A recording claim store: always grants, captures every claim request verbatim. */
function recordingClaimStore(captured: CapturedClaimReq[]): SpawnSurfaceDeps["store"] {
  return {
    claim: async (req: CapturedClaimReq) => {
      captured.push(req);
      return {
        acquired: true as const,
        claim: {
          unitId: req.unitId,
          sessionId: req.sessionId,
          branch: req.branch,
          intent: req.intent ?? "orchestrate",
          claimedAt: "2026-07-03T00:00:00.000Z",
          heartbeatAt: "2026-07-03T00:00:00.000Z",
        },
        reclaimed: false,
      };
    },
    bumpHeartbeat: async (_unitId: string): Promise<void> => {},
  };
}

/** A scripted BuildContext double — the real registry, an immediately-passing runner. */
function scriptedBuild(): BuildContext {
  return {
    registry: new BuildRegistry(),
    runner: async (_unitId, sink): Promise<BuildEnvelope> => {
      sink("phase: GATE");
      return { ok: true, body: "done" };
    },
    isBuildable: async (id) => id === "buildable-unit",
  };
}

/** Compose real spawn deps over the real seed with injected doubles. */
async function composedDeps(opts?: {
  sessionId?: string;
  branch?: string;
  claims?: CapturedClaimReq[];
  spawnQuery?: SdkQueryFn;
}) {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const claims = opts?.claims ?? [];
  const result = await buildSpawnDeps({
    store,
    claimStore: recordingClaimStore(claims),
    sessionId: opts?.sessionId ?? "sess-42",
    branch: opts?.branch ?? "claude/sess-42",
    cwd: process.cwd(),
    build: scriptedBuild(),
    ...(opts?.spawnQuery !== undefined ? { queryFn: opts.spawnQuery } : {}),
  });
  return { store, result };
}

const noTrace = (_msg: unknown): void => {};

// ---------------------------------------------------------------------------
// sdc-renders-the-real-story-author-agent — the spawned role is the rendered
// library agent, fail-closed (ADR-0051 extended to spawned subagents)
// ---------------------------------------------------------------------------

test("sdc-renders-the-real-story-author-agent: the composed story-author spawn prompt IS renderAgentPrompt(store, 'story-author') over the real corpus — not a stub, not an inlined fork", async () => {
  const spawnQuery = capturingQuery();
  const { store, result } = await composedDeps({ spawnQuery: spawnQuery.fn });

  assert.equal(result.ok, true, `composition must succeed over the real seed; error: ${result.ok ? "(none)" : result.error}`);
  if (!result.ok) return;

  // Drive the composed story-author handler with the scripted queryFn — the captured
  // systemPrompt is the observable that proves the render rode into the spawned session.
  const summary = await result.deps.spawnStoryAuthor(
    { unitId: "some-story", userPrompt: "author it" },
    noTrace,
  );
  assert.equal(spawnQuery.calls(), 1, "the spawn handler drives exactly one SDK session");
  assert.match(summary, /session finished/, "the runner's summary text comes back to the caller");

  const expected = await renderAgentPrompt(store, "story-author");
  assert.equal(expected.ok, true, "the seed corpus must carry the story-author agent");
  if (!expected.ok) return;

  const sent = spawnQuery.lastOptions()["systemPrompt"];
  assert.equal(
    sent,
    expected.agent.prompt,
    "the spawned session's system prompt must be the SAME renderAgentPrompt assembly the terminal serves (one definition, no fork — ADR-0051)",
  );
  assert.ok(
    typeof sent === "string" && sent.length > 0 && /story-author/.test(sent),
    "the rendered prompt is non-empty and carries the story-author role",
  );
});

test("sdc-renders-the-real-story-author-agent: a store with no story-author agent is a typed error BEFORE any SDK call — no spend on a dead render", async () => {
  const spawnQuery = capturingQuery();
  const emptyStore = new InMemoryStore(); // no corpus — the story-author artifact is absent

  const result = await buildSpawnDeps({
    store: emptyStore,
    claimStore: recordingClaimStore([]),
    sessionId: "sess-42",
    branch: "claude/sess-42",
    cwd: process.cwd(),
    build: scriptedBuild(),
    queryFn: spawnQuery.fn,
  });

  assert.equal(result.ok, false, "an absent story-author artifact must fail the composition closed");
  if (result.ok) return;
  assert.match(
    result.error,
    /story-author/,
    "the typed error names the missing agent so the operator can seed it",
  );
  assert.equal(spawnQuery.calls(), 0, "NO SDK call happens on a dead render (fail-closed before spend)");
});

// ---------------------------------------------------------------------------
// sdc-claim-deps-carry-session-identity-and-role — the claim knows who and
// what kind (ADR-0138 §2/§5); blank identity is fail-closed
// ---------------------------------------------------------------------------

test("sdc-claim-deps-carry-session-identity-and-role: the composed deps carry sessionId + branch verbatim, and the gate stamps them — with the work-kind intent — into the claim", async () => {
  const claims: CapturedClaimReq[] = [];
  const spawnQuery = capturingQuery();
  const { result } = await composedDeps({
    sessionId: "sess-42",
    branch: "claude/sess-42",
    claims,
    spawnQuery: spawnQuery.fn,
  });

  assert.equal(result.ok, true, "composition must succeed");
  if (!result.ok) return;

  // Identity rides the deps verbatim — what the surface's gate claims AS.
  assert.equal(result.deps.sessionId, "sess-42", "sessionId carried verbatim");
  assert.equal(result.deps.branch, "claude/sess-42", "branch carried verbatim");

  // Drive a spawn through the REAL surface + gate (buildSpawnTools wraps every handler
  // in claimGatedSpawn): the recorded claim request proves the composed identity and the
  // work-kind intent land on the claim — so a refusal names a REAL holder and the wisp's
  // colour layer reads a real role. Today's WorkClaimKind vocabulary is
  // "edit" | "orchestrate" (both spawn tools stamp "orchestrate"); the finer
  // authoring-vs-driving role split is wisp-as-story-claim's flagged follow-on
  // (story open-call 4), not silently invented here.
  const tools = buildSpawnTools(result.deps);
  const storyAuthor = tools.find((t) => t.name === "spawn_story_author");
  assert.ok(storyAuthor !== undefined, "the surface carries spawn_story_author");
  await storyAuthor.handler({ unitId: "some-story", userPrompt: "author it" }, {});

  assert.equal(claims.length, 1, "exactly one claim precedes the spawn (no claim, no subagent)");
  const claim = claims[0];
  assert.ok(claim !== undefined);
  assert.equal(claim.sessionId, "sess-42", "the claim carries the composed sessionId verbatim");
  assert.equal(claim.branch, "claude/sess-42", "the claim carries the composed branch verbatim");
  assert.equal(claim.unitId, "some-story", "the claim targets the spawned unit");
  assert.equal(
    claim.intent,
    "orchestrate",
    "the work kind is stamped as the claim intent (ADR-0138 §5 — today's WorkClaimKind vocabulary)",
  );
});

test("sdc-claim-deps-carry-session-identity-and-role: blank or whitespace identity is a fail-closed typed error — never a defaulted claim", async () => {
  const spawnQuery = capturingQuery();

  for (const [sessionId, branch, what] of [
    ["", "claude/sess-42", "blank sessionId"],
    ["   ", "claude/sess-42", "whitespace sessionId"],
    ["sess-42", "", "blank branch"],
    ["sess-42", "  \t", "whitespace branch"],
  ] as const) {
    const { result } = await composedDeps({ sessionId, branch, spawnQuery: spawnQuery.fn });
    assert.equal(result.ok, false, `${what} must refuse the composition fail-closed`);
    if (result.ok) continue;
    assert.match(result.error, /fail-closed/, `${what}: the refusal states the wall`);
  }

  assert.equal(spawnQuery.calls(), 0, "no SDK call ever happens on a refused composition");
});

// ---------------------------------------------------------------------------
// sdc-threads-spawn-deps-through-orchestrate-without-a-fork — an additive
// carry on the existing Phase-1/2 chain (the proposal-id-threading precedent)
// ---------------------------------------------------------------------------

test("sdc-threads-spawn-deps-through-orchestrate-without-a-fork: orchestrate() passes the composed spawn deps to the runtime — the spawn tools mount on the session; the chain is otherwise unchanged", async () => {
  const { result } = await composedDeps();
  assert.equal(result.ok, true, "composition must succeed");
  if (!result.ok) return;

  const store = new InMemoryStore();
  await loadCorpus(store);
  const orchQuery = capturingQuery();

  const r = await orchestrate({
    intent: "Orient and propose the next unit.",
    store,
    queryFn: orchQuery.fn,
    spawn: result.deps,
  });

  assert.equal(
    r.ok,
    true,
    `orchestrate must succeed (the real session-orchestrator render, the same chain); error: ${r.error ?? "(none)"}`,
  );

  const tools = (orchQuery.lastOptions()["allowedTools"] ?? []) as string[];
  assert.ok(
    tools.includes("mcp__spawn__spawn_story_author"),
    `mcp__spawn__spawn_story_author must be advertised when spawn deps are threaded; got: ${JSON.stringify(tools)}`,
  );
  assert.ok(
    tools.includes("mcp__spawn__spawn_builder"),
    `mcp__spawn__spawn_builder must be advertised when spawn deps are threaded; got: ${JSON.stringify(tools)}`,
  );
  // The orchestrator DRIVES rather than proposes (ADR-0155): there is no propose_unit surface.
  assert.equal(
    tools.includes("mcp__proposal__propose_unit"),
    false,
    "mcp__proposal__propose_unit must NOT be mounted — the orchestrator drives via spawn tools (ADR-0155)",
  );
});

test("sdc-threads-spawn-deps-through-orchestrate-without-a-fork: without spawn deps orchestrate() reproduces today's propose-only surface byte-identically — no mcp__spawn__* tool advertised", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const orchQuery = capturingQuery();

  const r = await orchestrate({
    intent: "Orient and propose.",
    store,
    queryFn: orchQuery.fn,
  });

  assert.equal(r.ok, true, `orchestrate must succeed with no spawn deps; error: ${r.error ?? "(none)"}`);

  const tools = (orchQuery.lastOptions()["allowedTools"] ?? []) as string[];
  assert.equal(
    tools.some((t) => t.startsWith("mcp__spawn__")),
    false,
    `no mcp__spawn__* tool may appear without spawn deps (the propose-only surface, unchanged); got: ${JSON.stringify(tools)}`,
  );
  assert.equal(
    tools.includes("mcp__proposal__propose_unit"),
    false,
    "mcp__proposal__propose_unit is never present — the orchestrator drives, it does not propose (ADR-0155)",
  );
});
