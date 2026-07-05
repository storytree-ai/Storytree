/**
 * Contract tests for the spawn_glue_worker tool (spawn-glue-tool capability,
 * scoped-glue-actuator / ADR-0160 D1/D5.i).
 *
 * Pins the third claim-gated spawn tool on buildSpawnTools — the scoped-edit affordance the desktop
 * chat lacked — AND the honesty fix that rides along (spawn_builder's phantom `userPrompt` dropped):
 *
 *   sgt-glue-tool-mounts-claim-gated-with-paths-and-prompt — buildSpawnTools returns spawn_glue_worker
 *     (schema { unitId, paths, userPrompt }) gate-wrapped by claimGatedSpawn; on an acquired claim the
 *     handler receives the caller-declared paths + userPrompt (threaded to the runner's fence).
 *   sgt-glue-tool-runs-the-gate-then-the-handler — claim-acquire runs STRICTLY BEFORE the handler; a
 *     refused claim returns the holder-naming refusal text and the handler is NEVER invoked.
 *   sgt-glue-spawn-returns-summary-never-a-verdict — the tool returns the handler's summary TEXT; no
 *     verdict-shaped payload appears in the result.
 *   sgt-spawn-builder-drops-phantom-userprompt — spawn_builder's schema no longer advertises
 *     userPrompt (a builder drives the WHOLE unit's registered proof, no per-run scope).
 *
 * Every test is OFFLINE: recording handlers + a recording claim store, no live SDK spend.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSpawnTools } from "./spawn-tool-surface.js";
import type { SpawnSurfaceDeps } from "./spawn-tool-surface.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const HOLDER = {
  unitId: "story-x",
  sessionId: "sess-other",
  branch: "claude/sess-other",
  intent: "orchestrate",
  claimedAt: "2026-07-05T00:00:00.000Z",
  heartbeatAt: "2026-07-05T00:00:00.000Z",
};

/** What the recording glue handler captured (to assert paths/userPrompt threading). */
interface GlueCapture {
  args?: { unitId: string; paths: string[]; userPrompt: string };
}

function makeSpawnDeps(opts?: {
  refuse?: boolean;
  order?: string[];
  glue?: GlueCapture;
}): SpawnSurfaceDeps {
  const order = opts?.order ?? [];
  return {
    store: {
      async claim(req: { unitId: string; sessionId: string; branch: string }) {
        order.push("claim");
        if (opts?.refuse === true) return { acquired: false as const, heldBy: HOLDER };
        return {
          acquired: true as const,
          claim: {
            unitId: req.unitId,
            sessionId: req.sessionId,
            branch: req.branch,
            intent: "orchestrate",
            claimedAt: "2026-07-05T00:00:00.000Z",
            heartbeatAt: "2026-07-05T00:00:00.000Z",
          },
          reclaimed: false,
        };
      },
      async bumpHeartbeat(_unitId: string): Promise<void> {},
    },
    sessionId: "sess-test",
    branch: "claude/sess-test",
    spawnStoryAuthor: async () => "story-author session finished (stub)",
    spawnBuilder: async () => "builder run-123 dispatched (stub)",
    spawnGlueWorker: async (args, _onTrace) => {
      order.push("handler:spawn_glue_worker");
      if (opts?.glue !== undefined) opts.glue.args = args;
      return "glue worker session finished; edited apps/desktop/electron/backend-entry.ts (stub)";
    },
  };
}

function toolNamed(
  tools: ReturnType<typeof buildSpawnTools>,
  name: string,
): ReturnType<typeof buildSpawnTools>[number] {
  const t = tools.find((d) => d.name === name);
  assert.ok(t !== undefined, `expected the built surface to carry '${name}'`);
  return t;
}

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? "").join("\n");
}

/** The param names a built tool advertises (inputSchema is the raw zod-shape object). */
function schemaKeys(t: ReturnType<typeof buildSpawnTools>[number]): string[] {
  const shape = (t as unknown as { inputSchema?: Record<string, unknown> }).inputSchema ?? {};
  return Object.keys(shape).sort();
}

// ---------------------------------------------------------------------------
// sgt-glue-tool-mounts-claim-gated-with-paths-and-prompt
// ---------------------------------------------------------------------------

test("sgt-glue-tool-mounts-claim-gated-with-paths-and-prompt: buildSpawnTools returns spawn_glue_worker (schema { unitId, paths, userPrompt }); on an acquired claim the handler receives the caller-declared paths and userPrompt", async () => {
  const glue: GlueCapture = {};
  const tools = buildSpawnTools(makeSpawnDeps({ glue }));

  const glueTool = toolNamed(tools, "spawn_glue_worker");
  assert.deepEqual(
    schemaKeys(glueTool),
    ["paths", "unitId", "userPrompt"],
    "spawn_glue_worker must advertise exactly { unitId, paths, userPrompt }",
  );

  await glueTool.handler(
    {
      unitId: "desktop-build-mount",
      paths: ["apps/desktop/electron/backend-entry.ts"],
      userPrompt: "add these 3 routes and stop",
    },
    {},
  );

  assert.deepEqual(
    glue.args,
    {
      unitId: "desktop-build-mount",
      paths: ["apps/desktop/electron/backend-entry.ts"],
      userPrompt: "add these 3 routes and stop",
    },
    "the caller-declared paths + userPrompt must be threaded to the glue handler (→ the runner's fence)",
  );
});

// ---------------------------------------------------------------------------
// sgt-glue-tool-runs-the-gate-then-the-handler
// ---------------------------------------------------------------------------

test("sgt-glue-tool-runs-the-gate-then-the-handler: claim-acquire runs STRICTLY BEFORE the handler; a refused claim returns the holder-naming refusal text and the handler is NEVER invoked (ADR-0138 §3)", async () => {
  // Acquire arm: claim strictly before the handler.
  const order: string[] = [];
  const okTools = buildSpawnTools(makeSpawnDeps({ order }));
  await toolNamed(okTools, "spawn_glue_worker").handler(
    { unitId: "story-x", paths: ["apps/desktop/**"], userPrompt: "edit" },
    {},
  );
  assert.deepEqual(
    order,
    ["claim", "handler:spawn_glue_worker"],
    "the claim must be acquired BEFORE the glue handler runs (no claim, no subagent)",
  );

  // Refuse arm: holder-named refusal text, handler never runs.
  const refusedOrder: string[] = [];
  const refusedTools = buildSpawnTools(makeSpawnDeps({ refuse: true, order: refusedOrder }));
  const result = await toolNamed(refusedTools, "spawn_glue_worker").handler(
    { unitId: "story-x", paths: ["apps/desktop/**"], userPrompt: "edit" },
    {},
  );
  const text = resultText(result as { content: Array<{ type: string; text?: string }> });
  assert.match(text, /sess-other/, "the refusal must name the holder session");
  assert.match(text, /claude\/sess-other/, "the refusal must name the holder branch");
  assert.ok(
    !refusedOrder.some((e) => e.startsWith("handler:")),
    `on a refused claim the glue handler must NEVER run; recorded: ${JSON.stringify(refusedOrder)}`,
  );
});

// ---------------------------------------------------------------------------
// sgt-glue-spawn-returns-summary-never-a-verdict
// ---------------------------------------------------------------------------

test("sgt-glue-spawn-returns-summary-never-a-verdict: the text a spawn_glue_worker call returns to the model is the handler's summary; no verdict-shaped payload appears in the tool result (ADR-0091)", async () => {
  const tools = buildSpawnTools(makeSpawnDeps());
  const result = await toolNamed(tools, "spawn_glue_worker").handler(
    { unitId: "story-x", paths: ["apps/desktop/electron/backend-entry.ts"], userPrompt: "edit" },
    {},
  );

  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  assert.ok(content.length > 0, "the tool must return content");
  for (const item of content) {
    assert.equal(item.type, "text", "every glue tool result item must be plain text");
  }
  assert.match(
    resultText(result as { content: Array<{ type: string; text?: string }> }),
    /glue worker session finished/,
    "the handler's summary text must return to the model",
  );

  const serialized = JSON.stringify(result);
  for (const forbidden of ["verdict", "signedBy", "signing", "proofStatus", "proof_status"]) {
    assert.ok(
      !serialized.includes(`"${forbidden}"`),
      `no '${forbidden}' field may appear — the glue worker only edits; the spine signs out-of-band`,
    );
  }
});

// ---------------------------------------------------------------------------
// sgt-spawn-builder-drops-phantom-userprompt
// ---------------------------------------------------------------------------

test("sgt-spawn-builder-drops-phantom-userprompt: spawn_builder's schema no longer advertises a userPrompt param (a builder drives the WHOLE unit's proof — no per-run scope; ADR-0160 D5.i)", async () => {
  const tools = buildSpawnTools(makeSpawnDeps());

  const builder = toolNamed(tools, "spawn_builder");
  assert.deepEqual(
    schemaKeys(builder),
    ["unitId"],
    "spawn_builder must advertise ONLY { unitId } — the phantom userPrompt (silently discarded) is dropped",
  );

  // And the scoped-intent home is now spawn_glue_worker (which DOES honour userPrompt).
  const glue = toolNamed(tools, "spawn_glue_worker");
  assert.ok(
    schemaKeys(glue).includes("userPrompt"),
    "scoped intent now lives on spawn_glue_worker, which honours userPrompt",
  );
});
