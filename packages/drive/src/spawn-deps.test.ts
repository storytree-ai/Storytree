/**
 * Regression test for the spawn-deps composition (spawn-deps-composition capability):
 * pins that orchestrate() threads optional spawn deps through to runHeadlessOrchestrator —
 * the additive carry that mounts the spawn MCP tool surface when deps are present and
 * leaves the session byte-identical to the propose-only surface when absent.
 *
 * RIGHT-KIND RED: at HEAD, OrchestrateArgs has no spawn field — orchestrate() ignores any
 * spawn-shaped value passed via a variable (structural subtyping; no excess-property check on
 * variables). runHeadlessOrchestrator therefore receives no spawn, buildSpawnTools is never
 * called, and mcp__spawn__* is absent from allowedTools.
 * The assertion that mcp__spawn__spawn_story_author is in allowedTools FAILS →
 * assertion-red (not module-not-found, not a syntax error).
 *
 * GREEN path (after implementation): orchestrate() gains spawn?: SpawnSurfaceDeps, threads it
 * to runHeadlessOrchestrator, which calls buildSpawnTools() and mounts mcp__spawn__* in
 * allowedTools → assertion passes.
 *
 * OFFLINE: the queryFn seam is injected — no live SDK spend (ADR-0010 §5).
 *
 * Coverage ids (from stories/chat-subagent-spawn/spawn-deps-composition.md):
 *   sdc-spawn-deps-threaded-to-session
 *   sdc-absent-spawn-no-spawn-tools
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

import { orchestrate } from "./orchestrate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 1,
  total_cost_usd: 0.001,
  result: "Proposal: next unit TBD.",
};

/**
 * A queryFn that captures the SDK Options it receives, then yields one scripted result.
 * The `allowedTools()` accessor returns whatever the Options carried — the observable
 * that proves spawn tools were (or were not) threaded into the session.
 */
function capturingQuery(): { fn: SdkQueryFn; allowedTools: () => string[] } {
  let captured: string[] = [];
  const fn: SdkQueryFn = ({ options }) => {
    const raw = options as { allowedTools?: unknown };
    captured = Array.isArray(raw.allowedTools) ? (raw.allowedTools as string[]) : [];
    return (async function* () {
      yield OK_RESULT;
    })();
  };
  return { fn, allowedTools: () => captured };
}

/**
 * A minimal structural SpawnSurfaceDeps double — defined structurally (no import of the
 * private spawn-tool-surface type) so the proof runs without widening the public API.
 * The claim store is a recording fake (claim always granted, heartbeat a no-op); the spawn
 * handlers are stubs that return a summary string without actually spawning anything.
 * No tool handler is called in these tests (the scripted queryFn yields a result message
 * without calling any MCP tool), so the stubs are never exercised — the observable is
 * solely whether the tools appear in allowedTools.
 */
const MOCK_SPAWN_DEPS = {
  store: {
    claim: async (_req: { unitId: string; sessionId: string; branch: string; intent?: string }) => ({
      acquired: true as const,
      claim: {
        unitId: _req.unitId,
        sessionId: _req.sessionId,
        branch: _req.branch,
        intent: "orchestrate",
        claimedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
      },
      reclaimed: false,
    }),
    bumpHeartbeat: async (_unitId: string): Promise<void> => {},
  },
  sessionId: "test-sdc-session",
  branch: "main",
  spawnStoryAuthor: async (
    _args: { unitId: string; userPrompt: string },
    _onTrace: (msg: unknown) => void,
  ): Promise<string> => "story-authored (stub)",
  spawnBuilder: async (
    _args: { unitId: string; userPrompt: string },
    _onTrace: (msg: unknown) => void,
  ): Promise<string> => "built (stub)",
};

// ---------------------------------------------------------------------------
// sdc-spawn-deps-threaded-to-session
// ---------------------------------------------------------------------------
//
// The critical threading invariant (ADR-0112 / ADR-0137 d.1): when orchestrate() receives
// spawn deps, it passes them to runHeadlessOrchestrator as the `spawn` field — which then
// calls buildSpawnTools(spawn) and mounts mcp__spawn__spawn_story_author and
// mcp__spawn__spawn_builder in the session's allowedTools.
//
// RIGHT-KIND RED at HEAD: orchestrate() has no spawn parameter and ignores any extra
// field on the args object. The spawn tools therefore do NOT appear in allowedTools →
// the assertion below FAILS with a behavior-assertion error, not a module-not-found.

test(
  "sdc-spawn-deps-threaded-to-session: orchestrate() threads spawn deps to runHeadlessOrchestrator, mounting mcp__spawn__spawn_story_author and mcp__spawn__spawn_builder in allowedTools when spawn is present",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const { fn, allowedTools } = capturingQuery();

    // Pass spawn deps via a variable (not an object literal) so TypeScript's excess-property
    // check does not fire on the unknown 'spawn' field in the current OrchestrateArgs interface.
    // At runtime (tsx, types stripped), the variable is passed through structurally; at the
    // type level, OrchestrateArgs structural subtyping accepts extra properties on a variable.
    // After the implementation adds spawn?: SpawnSurfaceDeps to OrchestrateArgs, the variable
    // form remains valid and the cast is no longer logically needed.
    const args = {
      intent: "Orient and propose the next unit.",
      store,
      queryFn: fn,
      spawn: MOCK_SPAWN_DEPS,
    };
    const r = await orchestrate(args);

    assert.equal(
      r.ok,
      true,
      `orchestrate must succeed (session-orchestrator rendered from corpus); error: ${r.error ?? "(none)"}`,
    );

    const tools = allowedTools();

    // These assertions fail at HEAD because spawn is not threaded; pass after implementation.
    assert.ok(
      tools.includes("mcp__spawn__spawn_story_author"),
      `mcp__spawn__spawn_story_author must be in allowedTools when spawn deps are supplied ` +
        `(spawn threading not yet implemented); got: ${JSON.stringify(tools)}`,
    );
    assert.ok(
      tools.includes("mcp__spawn__spawn_builder"),
      `mcp__spawn__spawn_builder must be in allowedTools when spawn deps are supplied; ` +
        `got: ${JSON.stringify(tools)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// sdc-absent-spawn-no-spawn-tools
// ---------------------------------------------------------------------------
//
// Additive-only threading: absent deps → session byte-identical to the propose-only
// surface; no mcp__spawn__* tools are advertised. This invariant holds at HEAD (the
// control case that confirms the capturing harness works correctly).

test(
  "sdc-absent-spawn-no-spawn-tools: orchestrate() without spawn deps produces a propose-only session with no mcp__spawn__* tools — today's behaviour, unchanged (additive threading only)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const { fn, allowedTools } = capturingQuery();
    const r = await orchestrate({ intent: "Orient and propose.", store, queryFn: fn });

    assert.equal(
      r.ok,
      true,
      `orchestrate must succeed with no spawn deps; error: ${r.error ?? "(none)"}`,
    );

    const tools = allowedTools();
    assert.equal(
      tools.some((t) => t.startsWith("mcp__spawn__")),
      false,
      `no mcp__spawn__* tool must appear in allowedTools when spawn deps are absent ` +
        `(propose-only surface, byte-identical to today); got: ${JSON.stringify(tools)}`,
    );

    // The proposal tool is always present (non-spoofable declaration surface).
    assert.ok(
      tools.includes("mcp__proposal__propose_unit"),
      "mcp__proposal__propose_unit must always be present regardless of spawn deps",
    );
  },
);
