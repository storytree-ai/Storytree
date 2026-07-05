/**
 * Integration test for the glue-deps composition (glue-deps-composition capability,
 * scoped-glue-actuator / ADR-0160). Proves the composition:
 *   - renders the REAL glue-worker library agent fail-closed (no spend on a dead render);
 *   - builds the write fence from the CALLER-DECLARED paths and honours the task prompt;
 *   - threads the assembled spawnGlueWorker dep through the real orchestrate() chain unchanged.
 *
 * Exercised against the real in-story collaborators — the real renderAgentPrompt over the real seed
 * (loadCorpus + InMemoryStore), the real generalised runner, the real orchestrate composition + the
 * real buildSpawnTools surface — with the SDK query() scripted and the claim store injected (ADR-0010
 * §5: a live SDK-billed spawn never runs on a gate pass).
 *
 * Coverage ids (from stories/scoped-glue-actuator/glue-deps-composition.md):
 *   gdc-renders-the-real-glue-worker-agent
 *   gdc-fence-built-from-caller-declared-paths-and-honours-prompt
 *   gdc-threads-glue-dep-through-orchestrate-without-a-fork
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus, renderAgentPrompt } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

import { BuildRegistry, type BuildContext, type BuildEnvelope } from "./build-worker.js";
import { orchestrate } from "./orchestrate.js";
import { buildSpawnDeps, pathFence } from "./spawn-deps.js";
import type { SpawnSurfaceDeps } from "./spawn-deps.js";

// ---------------------------------------------------------------------------
// Helpers (mirror spawn-deps.test.ts)
// ---------------------------------------------------------------------------

const OK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 1,
  total_cost_usd: 0.001,
  result: "Added 3 routes to apps/desktop/electron/backend-entry.ts.",
};

/** A queryFn that captures the SDK request (options + prompt), counts calls, then fires the hook. */
function capturingQuery(): {
  fn: SdkQueryFn;
  calls: () => number;
  systemPrompt: () => string;
  userPrompt: () => string;
  allowedTools: () => string[];
  fireHook: (toolName: string, filePath: string) => Promise<unknown>;
} {
  let calls = 0;
  let captured: Record<string, unknown> = {};
  let capturedPrompt = "";
  const fn: SdkQueryFn = ({ options, prompt }) => {
    calls += 1;
    captured = options as Record<string, unknown>;
    capturedPrompt = typeof prompt === "string" ? prompt : "";
    return (async function* () {
      yield OK_RESULT;
    })();
  };
  const fireHook = async (toolName: string, filePath: string): Promise<unknown> => {
    const hooks = (captured.hooks ?? {}) as {
      PreToolUse?: Array<{ hooks: Array<(i: unknown, id: string, ctx: unknown) => Promise<unknown>> }>;
    };
    const hook = hooks.PreToolUse?.[0]?.hooks?.[0];
    assert.ok(hook !== undefined, "a PreToolUse fence hook must be wired");
    return hook(
      {
        hook_event_name: "PreToolUse",
        tool_name: toolName,
        tool_input: { file_path: filePath },
        tool_use_id: "tu",
        session_id: "s",
        transcript_path: "t",
        cwd: process.cwd(),
      },
      "tu",
      { signal: new AbortController().signal },
    );
  };
  return {
    fn,
    calls: () => calls,
    systemPrompt: () => (typeof captured.systemPrompt === "string" ? captured.systemPrompt : ""),
    userPrompt: () => capturedPrompt,
    allowedTools: () => (Array.isArray(captured.allowedTools) ? (captured.allowedTools as string[]) : []),
    fireHook,
  };
}

function recordingClaimStore(): SpawnSurfaceDeps["store"] {
  return {
    claim: async (req: { unitId: string; sessionId: string; branch: string; intent?: string }) => ({
      acquired: true as const,
      claim: {
        unitId: req.unitId,
        sessionId: req.sessionId,
        branch: req.branch,
        intent: req.intent ?? "orchestrate",
        claimedAt: "2026-07-05T00:00:00.000Z",
        heartbeatAt: "2026-07-05T00:00:00.000Z",
      },
      reclaimed: false,
    }),
    bumpHeartbeat: async (_unitId: string): Promise<void> => {},
  };
}

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

async function seededStore(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

const NO_TRACE = (): void => {};

// ---------------------------------------------------------------------------
// pathFence — the caller-declared fence builder (unit-level, no SDK)
// ---------------------------------------------------------------------------

test("pathFence permits writes under the declared paths and denies everything else (including stories/**)", () => {
  const fence = pathFence(["apps/desktop/electron/backend-entry.ts", "apps/desktop/src"]);
  assert.equal(fence("apps/desktop/electron/backend-entry.ts"), true, "an exact declared file is permitted");
  assert.equal(fence("apps/desktop/src/backend/build-route.ts"), true, "a file under a declared dir is permitted");
  assert.equal(fence("packages/agent/src/evil.ts"), false, "code outside the fence is denied");
  assert.equal(fence("stories/demo/story.md"), false, "stories/** is NOT a glue worker's scope — denied");
  // Fail-closed: an empty scope writes nothing.
  assert.equal(pathFence([])("apps/desktop/electron/backend-entry.ts"), false, "empty paths → all-deny fence");
});

// ---------------------------------------------------------------------------
// gdc-renders-the-real-glue-worker-agent
// ---------------------------------------------------------------------------

test("gdc-renders-the-real-glue-worker-agent: the composed glue worker's system prompt is the real rendered glue-worker agent; a store with no glue-worker agent yields a typed error BEFORE any SDK call", async () => {
  const store = await seededStore();
  const cap = capturingQuery();
  const built = await buildSpawnDeps({
    store,
    claimStore: recordingClaimStore(),
    sessionId: "sess-42",
    branch: "claude/sess-42",
    cwd: process.cwd(),
    build: scriptedBuild(),
    queryFn: cap.fn,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  // Drive the glue spawn so the scripted queryFn captures the systemPrompt the composition passed.
  await built.deps.spawnGlueWorker(
    { unitId: "desktop-build-mount", paths: ["apps/desktop/electron/backend-entry.ts"], userPrompt: "x" },
    NO_TRACE,
  );

  const expected = await renderAgentPrompt(store, "glue-worker");
  assert.ok(expected.ok, "the seed must carry a glue-worker agent");
  if (expected.ok) {
    assert.equal(
      cap.systemPrompt(),
      expected.agent.prompt,
      "the spawned glue worker's system prompt must be the REAL rendered glue-worker agent (not a stub/fork)",
    );
    assert.ok(cap.systemPrompt().length > 0, "the rendered prompt must be non-empty");
    assert.match(cap.systemPrompt(), /glue-worker/, "the prompt must carry the glue-worker role");
  }

  // Fail-closed: a store WITH story-author but WITHOUT glue-worker errors before any SDK call.
  const noGlue = await seededStore();
  await noGlue.deleteDoc("glue-worker");
  const failCap = capturingQuery();
  const failed = await buildSpawnDeps({
    store: noGlue,
    claimStore: recordingClaimStore(),
    sessionId: "sess-42",
    branch: "claude/sess-42",
    cwd: process.cwd(),
    build: scriptedBuild(),
    queryFn: failCap.fn,
  });
  assert.equal(failed.ok, false, "an absent glue-worker agent must be a typed refusal");
  if (!failed.ok) assert.match(failed.error, /glue-worker agent not found/, "the error must name the missing agent");
  assert.equal(failCap.calls(), 0, "no SDK call may be made on a dead render (no spend, fail-closed)");
});

// ---------------------------------------------------------------------------
// gdc-fence-built-from-caller-declared-paths-and-honours-prompt
// ---------------------------------------------------------------------------

test("gdc-fence-built-from-caller-declared-paths-and-honours-prompt: spawnGlueWorker calls the runner with a fence built from paths (writes under a declared path allowed, else denied) and threads the userPrompt verbatim; the result folds to a summary with a fence-denial note when violations occur", async () => {
  const store = await seededStore();
  const cap = capturingQuery();
  const built = await buildSpawnDeps({
    store,
    claimStore: recordingClaimStore(),
    sessionId: "sess-42",
    branch: "claude/sess-42",
    cwd: process.cwd(),
    build: scriptedBuild(),
    queryFn: cap.fn,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const TASK = "add these 3 routes to backend-entry.ts and stop";
  const summary = await built.deps.spawnGlueWorker(
    { unitId: "desktop-build-mount", paths: ["apps/desktop/electron/backend-entry.ts"], userPrompt: TASK },
    NO_TRACE,
  );

  // The userPrompt is threaded to the spawned session (the runner receives it in its prompt).
  assert.match(cap.userPrompt(), /add these 3 routes to backend-entry\.ts and stop/, "the task prompt must be threaded verbatim");

  // The fence was built from paths: a write inside is permitted, one outside (incl. stories/**) denied.
  assert.deepEqual(
    await cap.fireHook("Write", "apps/desktop/electron/backend-entry.ts"),
    {},
    "a write inside the declared paths must be permitted",
  );
  const denyOutside = (await cap.fireHook("Edit", "packages/agent/src/x.ts")) as {
    hookSpecificOutput?: { permissionDecision?: string };
  };
  assert.equal(denyOutside.hookSpecificOutput?.permissionDecision, "deny", "a write outside the fence must be denied");
  const denyStories = (await cap.fireHook("Write", "stories/x/story.md")) as {
    hookSpecificOutput?: { permissionDecision?: string };
  };
  assert.equal(denyStories.hookSpecificOutput?.permissionDecision, "deny", "stories/** must be denied for a glue worker");

  // A clean session folds to the SDK result summary (never a verdict).
  assert.match(summary, /Added 3 routes/, "the runner's summary must fold to a plain string");
  assert.doesNotMatch(summary, /verdict|signed/i, "the folded summary must carry no verdict language");

  // A session that DID deny a write appends a fence-denial note.
  const denyCap = capturingQuery();
  const denyBuilt = await buildSpawnDeps({
    store,
    claimStore: recordingClaimStore(),
    sessionId: "s",
    branch: "b",
    cwd: process.cwd(),
    build: scriptedBuild(),
    // A queryFn whose session attempts one out-of-scope write mid-stream, so a violation is recorded.
    queryFn: (({ options }) => {
      const hooks = (options as { hooks?: { PreToolUse?: Array<{ hooks: Array<(i: unknown, id: string, c: unknown) => Promise<unknown>> }> } }).hooks;
      const hook = hooks?.PreToolUse?.[0]?.hooks?.[0];
      return (async function* () {
        if (hook !== undefined) {
          await hook(
            { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "packages/x.ts" }, tool_use_id: "t", session_id: "s", transcript_path: "t", cwd: process.cwd() },
            "t",
            { signal: new AbortController().signal },
          );
        }
        yield OK_RESULT;
      })();
    }) as SdkQueryFn,
  });
  assert.equal(denyBuilt.ok, true);
  if (denyBuilt.ok) {
    const denySummary = await denyBuilt.deps.spawnGlueWorker(
      { unitId: "u", paths: ["apps/desktop"], userPrompt: "x" },
      NO_TRACE,
    );
    assert.match(denySummary, /write fence denied 1 out-of-scope write/, "a denied write must be noted on the summary");
  }
  void denyCap;
});

// ---------------------------------------------------------------------------
// gdc-threads-glue-dep-through-orchestrate-without-a-fork
// ---------------------------------------------------------------------------

test("gdc-threads-glue-dep-through-orchestrate-without-a-fork: buildSpawnDeps composes spawnGlueWorker and orchestrate() mounts the glue tool alongside the unchanged story-author + builder spawns; with no spawn dep the surface is byte-identical to today's", async () => {
  const store = await seededStore();
  const built = await buildSpawnDeps({
    store,
    claimStore: recordingClaimStore(),
    sessionId: "sess-42",
    branch: "claude/sess-42",
    cwd: process.cwd(),
    build: scriptedBuild(),
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  // The composed deps carry the glue worker alongside the existing two spawns (additive).
  assert.equal(typeof built.deps.spawnGlueWorker, "function", "the composition must wire spawnGlueWorker");
  assert.equal(typeof built.deps.spawnStoryAuthor, "function", "the story-author spawn is unchanged");
  assert.equal(typeof built.deps.spawnBuilder, "function", "the builder spawn is unchanged");

  // Threaded through the real orchestrate(): the glue tool joins allowedTools beside the others.
  const cap = capturingQuery();
  await orchestrate({ intent: "drive", store, queryFn: cap.fn, spawn: built.deps });
  const allowed = cap.allowedTools();
  assert.ok(
    allowed.includes("mcp__spawn__spawn_glue_worker"),
    `the glue tool must join allowedTools; got ${JSON.stringify(allowed)}`,
  );
  assert.ok(allowed.includes("mcp__spawn__spawn_story_author"), "the story-author spawn stays mounted");
  assert.ok(allowed.includes("mcp__spawn__spawn_builder"), "the builder spawn stays mounted");

  // With NO spawn dep, orchestrate() is byte-identical to today's — no spawn tool advertised.
  const bare = capturingQuery();
  await orchestrate({ intent: "orient", store, queryFn: bare.fn });
  assert.ok(
    !bare.allowedTools().some((n) => n.includes("spawn")),
    "with no spawn dep, no spawn tool may be advertised (byte-identical to today's surface)",
  );
});
