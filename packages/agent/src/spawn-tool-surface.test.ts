/**
 * Contract tests for spawn-tool-surface (spawn-tool-surface capability, ADR-0137 Phase-3 chip).
 *
 * Pins the integration of the spawn surface into the headless orchestrator session, one test
 * block per declared contract (stories/chat-subagent-spawn/spawn-tool-surface.md):
 *
 *   sts-spawn-tools-mounted-only-with-deps — spawn power is opt-in per composition, absent by
 *     default (§7 scale-down mirror): a dep-less session is byte-identical to the propose-only
 *     surface; with deps, exactly the two spawn tools join allowedTools and the spawn MCP
 *     server mounts.
 *   sts-tool-call-runs-the-gate-then-the-handler — invoking a spawn tool drives claim-acquire
 *     STRICTLY BEFORE the handler; a refused claim returns the holder-naming refusal text as a
 *     normal tool result (never a throw) and the handler is never invoked (ADR-0138 §3).
 *   sts-chat-session-keeps-no-write-bash — tools: [] stays; NO Write/Edit/Bash in allowedTools
 *     (ADR-0137 d.1, the wall test that matters most).
 *   sts-single-session-guard-holds — a second orchestration is refused while a spawn-capable
 *     session is in flight; a spawn inside it neither releases nor bypasses the guard
 *     (ADR-0108 d.6).
 *   sts-no-verdict-crosses-back — a spawn tool returns the handler's progress/status TEXT;
 *     no verdict-shaped payload appears in any tool result (ADR-0091 / ADR-0108 d.5).
 *
 * The gate's own mechanics (intent stamping, heartbeat bumps, the blank-unit wall) are pinned in
 * claim-gated-spawn.test.ts; this file pins the COMPOSITION — the surface wraps every handler in
 * the gate and mounts on the headless-orchestrator seam only when spawn deps are present.
 *
 * Every test is OFFLINE: queryFn and spawn handler stubs are injected — no live SDK spend.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runHeadlessOrchestrator } from "./headless-orchestrator.js";
import { buildSpawnTools } from "./spawn-tool-surface.js";
import type { SpawnSurfaceDeps } from "./spawn-tool-surface.js";
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

/** A held-claim row for the refusal arm — the holder the refusal text must name. */
const HOLDER = {
  unitId: "story-x",
  sessionId: "sess-other",
  branch: "claude/sess-other",
  intent: "orchestrate",
  claimedAt: "2026-07-03T00:00:00.000Z",
  heartbeatAt: "2026-07-03T00:00:00.000Z",
};

/**
 * Build recording spawn deps. `order` records "claim" / "handler:<name>" events so gate-vs-handler
 * ordering is observable; `refuse: true` makes the store report the story held by {@link HOLDER}.
 */
function makeSpawnDeps(opts?: { refuse?: boolean; order?: string[] }): SpawnSurfaceDeps {
  const order = opts?.order ?? [];
  return {
    store: {
      async claim(req: { unitId: string; sessionId: string; branch: string }) {
        order.push("claim");
        if (opts?.refuse === true) {
          return { acquired: false as const, heldBy: HOLDER };
        }
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
    ): Promise<string> => {
      order.push("handler:spawn_story_author");
      return "story-author session finished (stub)";
    },
    spawnBuilder: async (
      _args: { unitId: string; userPrompt: string },
      _onTrace: (msg: unknown) => void,
    ): Promise<string> => {
      order.push("handler:spawn_builder");
      return "builder run-123 dispatched; progress: AUTHOR_TEST running (stub)";
    },
  };
}

/** Find one tool definition by name off the built surface (fails loudly when absent). */
function toolNamed(
  tools: ReturnType<typeof buildSpawnTools>,
  name: string,
): ReturnType<typeof buildSpawnTools>[number] {
  const t = tools.find((d) => d.name === name);
  assert.ok(t !== undefined, `expected the built surface to carry '${name}'`);
  return t;
}

/** Flatten a CallToolResult's text content for assertions. */
function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? "").join("\n");
}

// ---------------------------------------------------------------------------
// sts-spawn-tools-mounted-only-with-deps — spawn power is opt-in per
// composition, absent by default (§7 scale-down mirror)
// ---------------------------------------------------------------------------

test("sts-spawn-tools-mounted-only-with-deps: absent spawn dep — no spawn tool in allowedTools, no spawn MCP server (byte-identical propose-only surface)", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    // No spawn dep — the session must be byte-identical to today's propose-only surface.
    queryFn: fn,
  });

  const o = opts() as { allowedTools?: string[]; mcpServers?: Record<string, unknown> };
  const allowed = o.allowedTools ?? [];
  assert.ok(
    !allowed.some((n) => n.includes("spawn")),
    `with no spawn dep, no spawn tool may appear in allowedTools (§7 scale-down mirror); ` +
      `got: ${JSON.stringify(allowed)}`,
  );
  assert.ok(
    !Object.keys(o.mcpServers ?? {}).includes("spawn"),
    "with no spawn dep, the spawn MCP server must not be mounted",
  );
});

test("sts-spawn-tools-mounted-only-with-deps: with the dep, EXACTLY the two spawn tools join allowedTools and the spawn MCP server mounts (propose_unit preserved)", async () => {
  // Baseline: the propose-only surface (no spawn dep).
  const base = capturingQuery([OK_RESULT]);
  await runHeadlessOrchestrator({ systemPrompt: "SYS", userPrompt: "orient", queryFn: base.fn });
  const baseAllowed = (base.opts() as { allowedTools?: string[] }).allowedTools ?? [];

  // Same composition + the spawn dep.
  const withDeps = capturingQuery([OK_RESULT]);
  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient and spawn as needed",
    queryFn: withDeps.fn,
    spawn: makeSpawnDeps(),
  });
  const o = withDeps.opts() as { allowedTools?: string[]; mcpServers?: Record<string, unknown> };

  // EXACTLY the two spawn tool names join the baseline — nothing else changes, and the
  // proposal surface (ADR-0108 d.3) is preserved, not evicted.
  assert.deepEqual(
    o.allowedTools,
    [...baseAllowed, "mcp__spawn__spawn_story_author", "mcp__spawn__spawn_builder"],
    "the ONLY additions over the propose-only surface must be the two spawn tool names",
  );
  assert.ok(
    Object.keys(o.mcpServers ?? {}).includes("spawn"),
    "the spawn MCP server must be mounted when the spawn dep is present",
  );
});

// ---------------------------------------------------------------------------
// sts-tool-call-runs-the-gate-then-the-handler — no claim, no subagent,
// per tool call (ADR-0138 §3, enforced AT the surface)
// ---------------------------------------------------------------------------

test("sts-tool-call-runs-the-gate-then-the-handler: claim-acquire runs STRICTLY BEFORE the handler; the handler's summary text returns to the model", async () => {
  const order: string[] = [];
  const tools = buildSpawnTools(makeSpawnDeps({ order }));

  const storyAuthor = toolNamed(tools, "spawn_story_author");
  const result = await storyAuthor.handler(
    { unitId: "story-x", userPrompt: "author the story" },
    {},
  );

  assert.deepEqual(
    order,
    ["claim", "handler:spawn_story_author"],
    "the claim must be acquired BEFORE the handler runs (no claim, no subagent — ADR-0138 §3)",
  );
  assert.match(
    resultText(result as { content: Array<{ type: string; text?: string }> }),
    /story-author session finished \(stub\)/,
    "the handler's typed summary text must return to the model",
  );
});

test("sts-tool-call-runs-the-gate-then-the-handler: a refused claim returns the holder-naming refusal text as a normal tool result — the handler is NEVER invoked", async () => {
  const order: string[] = [];
  const tools = buildSpawnTools(makeSpawnDeps({ refuse: true, order }));

  // Both tools hold the wall — exercise each; neither may throw (a wait, never a crash).
  for (const name of ["spawn_story_author", "spawn_builder"]) {
    const result = await toolNamed(tools, name).handler(
      { unitId: "story-x", userPrompt: "do work" },
      {},
    );
    const text = resultText(result as { content: Array<{ type: string; text?: string }> });
    assert.match(text, /sess-other/, "the refusal must name the holder session");
    assert.match(text, /claude\/sess-other/, "the refusal must name the holder branch");
  }

  assert.ok(
    !order.some((e) => e.startsWith("handler:")),
    `on a refused claim the handler must NEVER run; recorded: ${JSON.stringify(order)}`,
  );
});

// ---------------------------------------------------------------------------
// sts-chat-session-keeps-no-write-bash — spawn power, never write power
// (ADR-0137 d.1 — the wall test that matters most)
// ---------------------------------------------------------------------------

test("sts-chat-session-keeps-no-write-bash: with spawn deps present, tools stays [] and allowedTools carries NO Write/Edit/Bash", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient and spawn as needed",
    queryFn: fn,
    spawn: makeSpawnDeps(),
  });

  const o = opts() as { tools?: unknown; allowedTools?: string[] };
  const allowed = o.allowedTools ?? [];

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
// sts-single-session-guard-holds — one orchestration at a time, spawns
// included (ADR-0108 d.6, preserved under the mount)
// ---------------------------------------------------------------------------

test("sts-single-session-guard-holds: a second orchestration is refused while a spawn-capable session is in flight; a spawn inside it neither releases nor bypasses the guard", async () => {
  const deps = makeSpawnDeps();
  let releaseSession: (() => void) | undefined;
  const sessionGate = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  // A spawn-capable session that stays in flight until we release it.
  const inFlightFn: SdkQueryFn = () =>
    (async function* () {
      await sessionGate;
      yield OK_RESULT;
    })();

  const first = runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "long-running orchestration",
    queryFn: inFlightFn,
    spawn: deps,
  });

  // While in flight: a second orchestration is refused with the typed in-flight error.
  const second = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "concurrent attempt",
    queryFn: queryYielding([OK_RESULT]),
  });
  assert.equal(second.ok, false, "a concurrent orchestration must be refused (ADR-0108 d.6)");
  assert.match(second.error ?? "", /in-flight/);

  // A spawn INSIDE the running orchestration (the gate-wrapped handler, same deps) completes…
  const spawned = await toolNamed(buildSpawnTools(deps), "spawn_story_author").handler(
    { unitId: "story-x", userPrompt: "author within the running session" },
    {},
  );
  assert.ok(spawned.content.length > 0, "the in-session spawn itself must complete");

  // …and neither releases nor bypasses the guard: a third orchestration is still refused.
  const third = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "still concurrent",
    queryFn: queryYielding([OK_RESULT]),
  });
  assert.equal(third.ok, false, "a spawn must not release the single-session guard");
  assert.match(third.error ?? "", /in-flight/);

  assert.ok(releaseSession !== undefined);
  releaseSession();
  const firstResult = await first;
  assert.equal(firstResult.ok, true, "the guarded first session must still finish cleanly");
});

// ---------------------------------------------------------------------------
// sts-no-verdict-crosses-back — the model sees progress, never a verdict
// (ADR-0091 / ADR-0108 d.5: the spine signs out-of-band)
// ---------------------------------------------------------------------------

test("sts-no-verdict-crosses-back: a spawn_builder call returns the dispatch's progress/status text — no verdict-shaped payload in any tool result", async () => {
  const tools = buildSpawnTools(makeSpawnDeps());

  const result = await toolNamed(tools, "spawn_builder").handler(
    { unitId: "story-x", userPrompt: "drive the fix" },
    {},
  );

  // The result is TEXT content only — the progress/status fold, nothing structured.
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  assert.ok(content.length > 0, "the tool must return content");
  for (const item of content) {
    assert.equal(item.type, "text", "every spawn tool result item must be plain text");
  }
  assert.match(resultText(result as { content: Array<{ type: string; text?: string }> }), /progress/);

  // No verdict-shaped payload anywhere on the result (verdict / signing / proof-status
  // fields) — the surface has structurally nothing to relay (ADR-0091).
  const serialized = JSON.stringify(result);
  for (const forbidden of ["verdict", "signedBy", "signing", "proofStatus", "proof_status"]) {
    assert.ok(
      !serialized.includes(`"${forbidden}"`),
      `no '${forbidden}' field may appear in a spawn tool result — the spine signs out-of-band`,
    );
  }
});
