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
   * Builder spawn runner: starts a write-scoped builder SDK session for the given
   * unitId and returns a summary string.
   */
  spawnBuilder: (
    args: { unitId: string; userPrompt: string },
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
    "Spawn a write-scoped builder session to implement a capability or fix an issue. " +
      "The session is claim-gated: if another session already holds the story you will " +
      "be told who holds it and the spawn will not start. Writes inside the spawned " +
      "session are fenced to the declared source scope — NOT in this chat.",
    {
      unitId: z.string().describe("The story / unit id to build."),
      userPrompt: z.string().describe("The task prompt for the builder session."),
    },
    async ({ unitId, userPrompt }) => {
      const result = await claimGatedSpawn({
        unitId,
        sessionId,
        branch,
        kind: "orchestrate",
        store,
        spawnFn: (onTrace) => deps.spawnBuilder({ unitId, userPrompt }, onTrace),
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

  return [spawnStoryAuthorTool, spawnBuilderTool];
}
