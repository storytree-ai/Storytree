/**
 * Contract tests for spawn-tool-surface (spawn-tool-surface capability, ADR-0137 Phase-3 chip).
 *
 * Pins the integration of the spawn surface into the headless orchestrator session:
 *
 *   1. Scale-down (mirror §7): absent spawn dep → no spawn tools in allowedTools — byte-identical
 *      to the propose-only surface. Phase-1/2 consumers, the terminal `orchestrate` command, and
 *      every existing test are untouched (the absent-dep path never diverges).
 *
 *   2. Wall (ADR-0137 d.1 — the wall test that matters most): spawn dep present → tools: [] stays
 *      (the chat session has NO write surface — writes happen inside spawned sessions under their own
 *      fences); allowedTools = propose_unit + orientation tools + the two spawn tools and NOTHING
 *      else; NO Write, Edit, or Bash — pinned against the captured SDK options so a future edit that
 *      quietly widens the chat's own reach goes RED here.
 *
 *   3. Preservation: the propose_unit tool (the non-spoofable proposal declaration, ADR-0108 d.3)
 *      must still appear in allowedTools when spawn is wired — the spawn surface must NOT evict it.
 *
 * The gate-wrapping behavior (claimGatedSpawn wrapping each handler, refusal returning holder text)
 * is tested in claim-gated-spawn.test.ts; this file pins the composition at the headless-orchestrator
 * seam — that the spawn surface is mounted when spawn deps are present and stays absent otherwise.
 *
 * Every test is OFFLINE: queryFn and spawn handler stubs are injected — no live SDK spend.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runHeadlessOrchestrator } from "./headless-orchestrator.js";
import type { HeadlessOrchestratorArgs } from "./headless-orchestrator.js";
import type { SdkQueryFn } from "./sdk-author.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const OK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 1,
  total_cost_usd: 0.001,
  result: "session finished",
};

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

function capturingQuery(messages: unknown[]): { fn: SdkQueryFn; opts: () => unknown } {
  let last: unknown;
  const fn: SdkQueryFn = (q) => {
    last = q.options;
    return queryYielding(messages)(q);
  };
  return { fn, opts: () => last };
}

// ---------------------------------------------------------------------------
// Minimal inline spawn-deps fixture
//
// Mirrors the SpawnSurfaceDeps shape that spawn-tool-surface.ts will export.
// Defined inline here so the test imports ONLY from already-existing modules —
// the implementation will add HeadlessOrchestratorArgs.spawn? to accept this shape,
// and the `Object.assign` cast below lets the extra property flow through at runtime
// without a TypeScript error on the not-yet-declared field.
// ---------------------------------------------------------------------------

function makeSpawnDeps(): object {
  return {
    store: {
      async claim(req: { unitId: string; sessionId: string; branch: string }) {
        return {
          acquired: true as const,
          claim: {
            unitId: req.unitId,
            sessionId: req.sessionId,
            branch: req.branch,
            intent: "orchestrate",
            claimedAt: "2026-07-03T00:00:00.000Z",
            heartbeatAt: "2026-07-03T00:00:00.000Z",
          },
          reclaimed: false,
        };
      },
      async bumpHeartbeat(_unitId: string): Promise<void> {},
    },
    sessionId: "sess-test",
    branch: "claude/sess-test",
    spawnStoryAuthor: async (
      _args: { unitId: string; userPrompt: string },
      _onTrace: (msg: unknown) => void,
    ): Promise<string> => "story-author session finished (stub)",
    spawnBuilder: async (
      _args: { unitId: string; userPrompt: string },
      _onTrace: (msg: unknown) => void,
    ): Promise<string> => "builder session finished (stub)",
  };
}

// ---------------------------------------------------------------------------
// 1. Scale-down: absent spawn dep → no spawn tools in allowedTools
// ---------------------------------------------------------------------------

test("spawn-tool-surface: absent spawn dep — no spawn tools in allowedTools (§7 scale-down: byte-identical to propose-only surface)", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    // No spawn dep — the session must be byte-identical to today's propose-only surface.
    queryFn: fn,
  });

  const allowed = (opts() as { allowedTools?: string[] }).allowedTools ?? [];
  const hasSpawnTool = allowed.some((n) => n.includes("spawn"));
  assert.ok(
    !hasSpawnTool,
    `with no spawn dep, no spawn tool may appear in allowedTools (§7 scale-down mirror); ` +
      `got: ${JSON.stringify(allowed)}`,
  );
});

// ---------------------------------------------------------------------------
// 2. Wall (ADR-0137 d.1): spawn dep present → tools: []; allowedTools includes
//    spawn_story_author and spawn_builder; NO Write/Edit/Bash
//    — THE WALL TEST THAT MATTERS MOST —
// ---------------------------------------------------------------------------

test("wall (ADR-0137 d.1): spawn dep present → tools: [] stays; allowedTools includes spawn_story_author and spawn_builder; NO Write/Edit/Bash", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  // Inject spawn deps via Object.assign so the extra `spawn` property flows to the
  // runtime object while we cast to the declared type. After the implementation adds
  // HeadlessOrchestratorArgs.spawn?, the cast becomes a no-op but stays valid.
  const base: HeadlessOrchestratorArgs = {
    systemPrompt: "SYS",
    userPrompt: "orient and spawn as needed",
    queryFn: fn,
  };
  await runHeadlessOrchestrator(
    Object.assign({}, base, { spawn: makeSpawnDeps() }) as HeadlessOrchestratorArgs,
  );

  const o = opts() as { tools?: unknown; allowedTools?: string[] };
  const allowed = o.allowedTools ?? [];

  // The two spawn tools must be advertised to the model.
  assert.ok(
    allowed.some((n) => n.includes("spawn_story_author")),
    `spawn_story_author must appear in allowedTools when the spawn dep is provided; ` +
      `got: ${JSON.stringify(allowed)}`,
  );
  assert.ok(
    allowed.some((n) => n.includes("spawn_builder")),
    `spawn_builder must appear in allowedTools when the spawn dep is provided; ` +
      `got: ${JSON.stringify(allowed)}`,
  );

  // tools: [] must stay — the chat session has NO write surface (ADR-0137 d.1).
  // Writes happen inside the spawned sessions under their own per-scope fences.
  assert.deepEqual(
    o.tools,
    [],
    "tools must be [] — the chat must NEVER have its own write surface; " +
      "writes happen inside spawned sessions under their own fences (ADR-0137 d.1)",
  );

  // NO Write/Edit/Bash in allowedTools — the write wall must hold even with spawn power.
  for (const bad of ["Write", "Edit", "Bash"]) {
    assert.ok(
      !allowed.includes(bad),
      `'${bad}' must NOT appear in allowedTools — the chat has spawn power, not write power ` +
        `(ADR-0137 d.1, the wall test that matters most); got: ${JSON.stringify(allowed)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Preservation: propose_unit still in allowedTools when spawn is wired
// ---------------------------------------------------------------------------

test("spawn-tool-surface: propose_unit still appears in allowedTools when spawn dep is wired (the proposal surface is preserved, not evicted)", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  const base: HeadlessOrchestratorArgs = {
    systemPrompt: "SYS",
    userPrompt: "orient",
    queryFn: fn,
  };
  await runHeadlessOrchestrator(
    Object.assign({}, base, { spawn: makeSpawnDeps() }) as HeadlessOrchestratorArgs,
  );

  const allowed = (opts() as { allowedTools?: string[] }).allowedTools ?? [];
  assert.ok(
    allowed.some((n) => n.includes("propose_unit")),
    `propose_unit must still appear in allowedTools when spawn is wired — ` +
      `the spawn surface must not evict the proposal tool (ADR-0108 d.3); ` +
      `got: ${JSON.stringify(allowed)}`,
  );
});
