/**
 * The spawn-deps composition (spawn-deps-composition capability, ADR-0137 Phase 3):
 * assembles the REAL SpawnSurfaceDeps the runtime consumes — the thin drive-side
 * shell that turns the spawn mechanisms into the live shape:
 *
 *   - RENDER, NEVER FORK, FAIL CLOSED (ADR-0051): the spawned story-author's system
 *     prompt is renderAgentPrompt(store, "story-author") — the SAME assembly the
 *     terminal `storytree agents story-author` serves. An absent artifact is a typed
 *     error BEFORE any SDK call (no spend on a dead render), never a stub prompt,
 *     never an inlined copy of the agent's prose.
 *   - STAMP THE IDENTITY THE CLAIM NEEDS (ADR-0138 §2/§5): the composed deps carry
 *     the session's sessionId + branch (the ADR-0033 identity key) verbatim; the
 *     spawn tool surface's gate stamps them — with the work-kind intent (today's
 *     WorkClaimKind vocabulary: "orchestrate"; the finer authoring/driving role split
 *     is wisp-as-story-claim's flagged follow-on, story open-call 4) — into every
 *     claim, so a refusal names a real holder. Blank identity is a fail-closed typed
 *     error (the ClaimDoc non-blank wall), never a defaulted claim.
 *   - THE WORKER-BACKED DISPATCH (ADR-0090 / ADR-0091): spawn_builder routes through
 *     spawnBuilderDispatch over the INJECTED BuildContext — a third caller of the
 *     SAME routed worker the human's accept click uses; a typed refusal or a runId
 *     folded to conversation TEXT, never a verdict.
 *
 * The desktop sidecar (apps/desktop/electron/backend-entry.ts) builds
 * {@link BuildSpawnDepsArgs} from its live pieces (the pg claim store, the live
 * BuildContext it already composes, the repo cwd, the session identity) and threads
 * the result through orchestrate({ spawn }) — this module is what keeps that glue
 * thin (operator-attested, like the rest of that file).
 *
 * NO import from @storytree/cli (ADR-0112 hard invariant: drive reaches agent and
 * library/store, never CLI).
 */

import type { Store } from "@storytree/storage-protocol";
import type { SdkQueryFn, SpawnSurfaceDeps } from "@storytree/agent";
import { runSpawnStoryAuthor } from "@storytree/agent";
import { renderAgentPrompt } from "@storytree/library/store";

import type { BuildContext } from "./build-worker.js";
import { spawnBuilderDispatch } from "./spawn-builder.js";

// Re-exported so drive-side consumers (orchestrate.ts, the desktop sidecar) have a
// named, stable type off this module rather than a deep reach into @storytree/agent.
export type { SpawnSurfaceDeps } from "@storytree/agent";

/** The claim store the composed deps carry (structurally the surface's ClaimStore). */
type ClaimStore = SpawnSurfaceDeps["store"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What {@link buildSpawnDeps} composes the real spawn deps from. */
export interface BuildSpawnDepsArgs {
  /** The library store the story-author agent renders from (seed corpus or live pg). */
  store: Store;
  /** The claim store the spawn gate claims against (the real pg store in production). */
  claimStore: ClaimStore;
  /** The orchestrator session id — stamped into every spawn claim (ADR-0033 / ADR-0138 §2). */
  sessionId: string;
  /** The orchestrator session branch — stamped into every spawn claim. */
  branch: string;
  /** Working directory for the spawned story-author session (the repo checkout). */
  cwd: string;
  /** The build worker context the builder spawn dispatches through (ADR-0090). */
  build: BuildContext;
  /** Injected for offline tests (ADR-0010 §5); omit for a live run (the real SDK query()). */
  queryFn?: SdkQueryFn;
  /** Turn ceiling for the spawned story-author session (the runaway brake, ADR-0130). */
  maxTurns?: number;
}

/** Typed result — a composition failure is an error BEFORE any SDK call, never a throw. */
export type BuildSpawnDepsResult =
  | { ok: true; deps: SpawnSurfaceDeps }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Assemble the real spawn deps: render the story-author library agent (fail-closed),
 * carry the session identity verbatim for the claim gate, and wire the two spawn
 * handlers — the write-fenced story-author runner and the worker-backed builder
 * dispatch. Never throws: every refusal is a typed { ok: false, error }.
 */
export async function buildSpawnDeps(
  args: BuildSpawnDepsArgs,
): Promise<BuildSpawnDepsResult> {
  // Fail-closed identity (ADR-0138 §2): a blank identity would claim as nobody — the
  // refusal could not name a real holder. Refuse before anything else, never default.
  if (args.sessionId.trim() === "") {
    return {
      ok: false,
      error:
        "spawn deps refused: blank sessionId — the claim identity is fail-closed (ADR-0138 §2), never defaulted.",
    };
  }
  if (args.branch.trim() === "") {
    return {
      ok: false,
      error:
        "spawn deps refused: blank branch — the claim identity is fail-closed (ADR-0138 §2), never defaulted.",
    };
  }

  // Render the REAL story-author library agent — fail-closed BEFORE any SDK call when
  // the artifact is absent (ADR-0051's one-definition rule extended to spawned
  // subagents: edit the artifact, regenerate, and the terminal story-author and the
  // spawned story-author move together).
  const render = await renderAgentPrompt(args.store, "story-author");
  if (!render.ok) {
    return {
      ok: false,
      error: `story-author agent not found in the store: ${render.reason}`,
    };
  }
  const systemPrompt = render.agent.prompt;

  const deps: SpawnSurfaceDeps = {
    store: args.claimStore,
    sessionId: args.sessionId,
    branch: args.branch,

    spawnStoryAuthor: async ({ unitId, userPrompt }, onTrace) => {
      // Coarse boundary traces: runSpawnStoryAuthor exposes no per-message sink yet,
      // so the claim heartbeat (ADR-0138 §4) is bumped at the session's edges; the
      // finer per-message bump needs a trace seam on the runner (agent-package
      // follow-on, flagged — not smuggled in here).
      onTrace({ type: "spawn_started", role: "story-author", unitId });
      const result = await runSpawnStoryAuthor({
        systemPrompt,
        userPrompt: `Unit: ${unitId}\n\n${userPrompt}`,
        cwd: args.cwd,
        ...(args.queryFn !== undefined ? { queryFn: args.queryFn } : {}),
        ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
      });
      onTrace({ type: "spawn_finished", role: "story-author", unitId, ok: result.ok });
      if (!result.ok) {
        return `story-author session failed: ${result.error}`;
      }
      const fenceNote =
        result.violations.length > 0
          ? ` (write fence denied ${result.violations.length} out-of-scope write(s))`
          : "";
      return `${result.summary}${fenceNote}`;
    },

    spawnBuilder: async ({ unitId }, onTrace) => {
      onTrace({ type: "spawn_started", role: "builder", unitId });
      const dispatched = await spawnBuilderDispatch(unitId, args.build);
      onTrace({ type: "spawn_finished", role: "builder", unitId, ok: dispatched.ok });
      if (!dispatched.ok) {
        return `build refused: ${dispatched.reason}`;
      }
      return (
        `build dispatched: run ${dispatched.runId} — coarse progress streams into the ` +
        `run transcript; the spine observes RED→GREEN and signs (ADR-0091); the human lands.`
      );
    },
  };

  return { ok: true, deps };
}
