/**
 * Spawn tool surface builder (spawn-tool-surface capability, ADR-0137 Phase-3 chip).
 *
 * Builds the two spawn MCP tools (spawn_story_author / spawn_builder), each gate-wrapped
 * with claimGatedSpawn so there is no constructor path that mounts an ungated spawn tool
 * (the surface composes the fence — ADR-0137 d.1).
 *
 * The surface is OPTIONAL: absent from HeadlessOrchestratorArgs → this module is never
 * consulted → the session is byte-identical to the propose-only surface (§7 scale-down
 * mirror from the orientation surface). Present → the two tools mount on the spawn MCP
 * server; tools: [] stays on the chat session (writes happen inside spawned sessions
 * under their own per-scope fences, never in the orchestrating chat).
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { claimGatedSpawn } from "./claim-gated-spawn.js";
import type { ClaimStore } from "./claim-gated-spawn.js";
import type { ClaimHolder } from "./spawn-claim.js";

// ---------------------------------------------------------------------------
// SpawnSurfaceDeps
// ---------------------------------------------------------------------------

/**
 * The deps the caller injects to mount the spawn tool surface on a headless-orchestrator
 * session. All fields are required: the surface provides no ungated or default path.
 */
export interface SpawnSurfaceDeps {
  /** The claim store (the real pg store in production, a recording fake in tests). */
  store: ClaimStore;
  /** The orchestrator session id — stamped into every spawn claim. */
  sessionId: string;
  /** The orchestrator session branch — stamped into every spawn claim. */
  branch: string;
  /**
   * Story-author spawn runner: starts a write-scoped story-author SDK session for the
   * given unitId and returns a summary string. onTrace feeds SDK messages back for
   * heartbeat bumping (ADR-0138 §4).
   */
  spawnStoryAuthor: (
    args: { unitId: string; userPrompt: string },
    onTrace: (msg: unknown) => void,
  ) => Promise<string>;
  /**
   * Builder spawn runner: dispatches the WHOLE unit's registered proof through the routed build
   * worker and returns a summary string. It takes only the `unitId` — a builder drives the whole
   * unit's proof and has NO per-run scope (ADR-0160 D5.i: the phantom `userPrompt` the schema used
   * to advertise is dropped; scoped intent is `spawnGlueWorker`'s job).
   */
  spawnBuilder: (
    args: { unitId: string },
    onTrace: (msg: unknown) => void,
  ) => Promise<string>;
  /**
   * Glue-worker spawn runner (ADR-0160): starts a write-scoped SDK session fenced to the
   * caller-declared `paths` that HONOURS the `userPrompt` — the scoped-edit affordance the desktop
   * chat lacked. Writes inside the spawned session are fenced to `paths`; landing is the existing
   * gate→PR path. Returns a folded summary string (never a verdict).
   *
   * `maxTurns` is an OPTIONAL per-run turn ceiling (ADR-0163 Gap A): a glue task can be open-ended,
   * and inheriting the story-author-tuned spawn default (~40, ADR-0130) can cut the worker off after
   * it has written the complete edit but before it can self-confirm. Absent → the spawn default.
   */
  spawnGlueWorker: (
    args: { unitId: string; paths: string[]; userPrompt: string; maxTurns?: number },
    onTrace: (msg: unknown) => void,
  ) => Promise<string>;
}

// ---------------------------------------------------------------------------
// MCP server name
// ---------------------------------------------------------------------------

/** The in-process MCP server name the spawn tools live under (`mcp__spawn__<tool>`). */
export const SPAWN_SERVER = "spawn";

// ---------------------------------------------------------------------------
// Refusal text helper
// ---------------------------------------------------------------------------

/** Format a holder-naming refusal message so the orchestrator can surface who holds a story. */
function refusalText(heldBy: ClaimHolder): string {
  return (
    `Story '${heldBy.unitId}' is currently held by session '${heldBy.sessionId}' ` +
    `on branch '${heldBy.branch}' (intent: ${heldBy.intent}). ` +
    `Wait for that session to merge or pick a different story.`
  );
}

// ---------------------------------------------------------------------------
// Surface builder
// ---------------------------------------------------------------------------

/**
 * Build the two spawn MCP tool definitions, each gate-wrapped with claimGatedSpawn.
 *
 * Called by headless-orchestrator when spawn deps are present (the §7 scale-down
 * mirror: absent deps → this function is never called → no dead stubs advertised
 * to the model). The returned definitions are passed directly to createSdkMcpServer.
 *
 * Every handler is gate-wrapped here — the surface composes the fence so there is
 * no constructor path that mounts an ungated spawn tool (ADR-0137 d.1).
 */
export function buildSpawnTools(deps: SpawnSurfaceDeps) {
  const { store, sessionId, branch } = deps;

  const spawnStoryAuthorTool = tool(
    "spawn_story_author",
    "Spawn a write-scoped story-author session to author or amend a story's work " +
      "hierarchy. The session is claim-gated: if another session already holds the " +
      "story you will be told who holds it and the spawn will not start (a wait, " +
      "never a crash — pick a different story or wait for the merge). Writes inside " +
      "the spawned session are fenced to stories/** — NOT in this chat.",
    {
      unitId: z.string().describe("The story / unit id to author."),
      userPrompt: z.string().describe("The task prompt for the story-author session."),
    },
    async ({ unitId, userPrompt }) => {
      const result = await claimGatedSpawn({
        unitId,
        sessionId,
        branch,
        kind: "orchestrate",
        store,
        spawnFn: (onTrace) => deps.spawnStoryAuthor({ unitId, userPrompt }, onTrace),
      });

      if (!result.ok) {
        if (result.reason === "held") {
          return {
            content: [{ type: "text" as const, text: refusalText(result.heldBy) }],
          };
        }
        // no-unit: blank unitId slipped through — the fail-closed arm
        return {
          content: [{ type: "text" as const, text: "Cannot spawn: blank unit id." }],
        };
      }

      return {
        content: [{ type: "text" as const, text: String(result.result) }],
      };
    },
  );

  const spawnBuilderTool = tool(
    "spawn_builder",
    "Spawn a write-scoped builder session to implement a capability or fix an issue by driving " +
      "the WHOLE unit's registered proof red→green through the prove-it-gate. The session is " +
      "claim-gated: if another session already holds the story you will be told who holds it and " +
      "the spawn will not start. Writes inside the spawned session are fenced to the declared " +
      "source scope — NOT in this chat. A builder has NO per-run scope knob — for a scoped glue " +
      "edit (add a few routes to one wiring file, and stop) use spawn_glue_worker instead.",
    {
      unitId: z.string().describe("The story / unit id to build."),
    },
    async ({ unitId }) => {
      const result = await claimGatedSpawn({
        unitId,
        sessionId,
        branch,
        kind: "orchestrate",
        store,
        spawnFn: (onTrace) => deps.spawnBuilder({ unitId }, onTrace),
      });

      if (!result.ok) {
        if (result.reason === "held") {
          return {
            content: [{ type: "text" as const, text: refusalText(result.heldBy) }],
          };
        }
        return {
          content: [{ type: "text" as const, text: "Cannot spawn: blank unit id." }],
        };
      }

      return {
        content: [{ type: "text" as const, text: String(result.result) }],
      };
    },
  );

  const spawnGlueWorkerTool = tool(
    "spawn_glue_worker",
    "Spawn a write-scoped GLUE worker to make a MINIMAL scoped edit and stop — the right tool for " +
      "un-asserted connective code within a story (add a few routes to a wiring file, thread a dep " +
      "through) that has no isolatable red→green of its own (ADR-0158 / ADR-0160). Its writes are " +
      "fenced fail-closed to the `paths` you declare (a write outside them is denied), it HONOURS " +
      "your task prompt, and it signs nothing — land its result through run_gate + open_landing_pr " +
      "(the gate + CI re-prove the owning story transitively; you never re-run the whole story's " +
      "--real build). Claim-gated on the owning story: if another session holds it you are told who " +
      "and the spawn does not start. Writes happen in the spawned worker — NOT in this chat. Do NOT " +
      "use this to autonomously land un-proven surface: if the edit hides real logic, refactor it to " +
      "earn a contract (spawn_builder); if only a human can judge it (look/feel/live), attest it.",
    {
      unitId: z.string().describe("The OWNING story the glue edit lands under (glue lives within a story)."),
      paths: z
        .array(z.string())
        .describe(
          "The caller-declared source scope the write fence permits (e.g. " +
            "['apps/desktop/electron/backend-entry.ts']). A write outside these paths is DENIED.",
        ),
      userPrompt: z
        .string()
        .describe("The scoped task, honoured verbatim (e.g. 'add these 3 routes to backend-entry.ts and stop')."),
      maxTurns: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Optional per-run turn ceiling for this scoped glue edit; omit to use the spawn default.",
        ),
    },
    async ({ unitId, paths, userPrompt, maxTurns }) => {
      const result = await claimGatedSpawn({
        unitId,
        sessionId,
        branch,
        kind: "orchestrate",
        store,
        spawnFn: (onTrace) =>
          deps.spawnGlueWorker(
            { unitId, paths, userPrompt, ...(maxTurns !== undefined ? { maxTurns } : {}) },
            onTrace,
          ),
      });

      if (!result.ok) {
        if (result.reason === "held") {
          return {
            content: [{ type: "text" as const, text: refusalText(result.heldBy) }],
          };
        }
        return {
          content: [{ type: "text" as const, text: "Cannot spawn: blank unit id." }],
        };
      }

      return {
        content: [{ type: "text" as const, text: String(result.result) }],
      };
    },
  );

  return [spawnStoryAuthorTool, spawnBuilderTool, spawnGlueWorkerTool];
}
