/**
 * Programmatic orchestrator composition (ADR-0108 Phase 1):
 * Renders the REAL `session-orchestrator` agent from the seed corpus and drives a
 * headless SDK session, surfacing the proposal text.
 *
 * Phase 1 scope: read/propose only — no signing, no building, no PR/gate/merge.
 * The live run (Story UAT) is the human-witness leg (ADR-0010 §5).
 *
 * REUSABLE at the package level (plain async function): Phase 2's studio chat worker
 * imports this rather than re-implementing — do NOT bury it as CLI-private glue.
 */

import type { Store } from "@storytree/storage-protocol";
import type {
  SdkQueryFn,
  HeadlessOrchestratorResult,
  OrientationRunner,
} from "@storytree/agent";
import { runHeadlessOrchestrator } from "@storytree/agent";

import { renderAgentPrompt } from "./agents.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Args for the programmatic orchestrator composition. */
export interface OrchestrateArgs {
  /** The session intent: what the orchestrator is asked to orient and propose for. */
  intent: string;
  /** The store to render the `session-orchestrator` agent from (seed corpus or live pg store). */
  store: Store;
  /**
   * Injectable SDK query function — an offline scripted double proves the composition without live
   * spend (ADR-0010 §5). OMIT for a live run: `runHeadlessOrchestrator` then defaults to the real SDK
   * `query()` (which lives in @storytree/agent — the single-import-site, ADR-0004 — so the CLI never
   * names the model).
   */
  queryFn?: SdkQueryFn;
  /**
   * The orientation runner (the real CLI `run(argv, deps)` closed over READ-ONLY deps) the headless
   * session's tools dispatch through, so the agent ORIENTS on the real three surfaces. Omit in offline
   * tests — the scripted `queryFn` never dispatches the tools; REQUIRED for a live run, or the
   * orientation tools fall back to a no-op stub and the agent cannot actually orient.
   */
  runner?: OrientationRunner;
  /** Live SDK leaf model (live run only). Default: the runner's (claude-sonnet-4-6). */
  model?: string;
  /** Turn ceiling for the live session (live run only) — orientation needs headroom (default 16 is tight). */
  maxTurns?: number;
  /** Hard USD budget ceiling for the live session (live run only). */
  maxBudgetUsd?: number;
}

/**
 * The composition result — mirrors {@link HeadlessOrchestratorResult} so the CLI surface can
 * forward it directly; the proposal text is the main deliverable on success.
 */
export type OrchestrateResult = HeadlessOrchestratorResult;

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Render the REAL `session-orchestrator` agent from the store and drive a headless read-only SDK
 * session with the rendered system prompt, surfacing the proposal text.
 *
 * THE LOOP DEFINITION IS THE RENDERED AGENT, NOT A FORK (ADR-0108 decision 2 / ADR-0051): the
 * system prompt is assembled by `renderAgentPrompt` from the Library — the SAME prompt the
 * terminal session embodies. Edit the library `session-orchestrator` artifact and both move
 * together; hard-coding a bespoke prompt here forks the one loop definition the design rests on.
 *
 * Fail-closed when the agent is absent from the store (never calls the SDK — no spend on a broken
 * setup). Fail-closed when the SDK session ends without a result message. Never throws: all errors
 * are returned as `{ ok: false, error }`.
 */
export async function orchestrate({
  intent,
  store,
  queryFn,
  runner,
  model,
  maxTurns,
  maxBudgetUsd,
}: OrchestrateArgs): Promise<OrchestrateResult> {
  // 1. Render the session-orchestrator agent — fail-closed before any SDK spend if absent.
  const renderResult = await renderAgentPrompt(store, "session-orchestrator");
  if (!renderResult.ok) {
    return {
      ok: false,
      error: `session-orchestrator agent not found in the store: ${renderResult.reason}`,
    };
  }

  // 2. Drive the headless session with the rendered system prompt and the programmatic intent. The
  //    queryFn/runner are forwarded only when present (exactOptionalPropertyTypes): an offline caller
  //    injects a scripted queryFn; a live caller omits it (real SDK) and injects the real orientation
  //    runner so the agent reads the real three surfaces.
  return runHeadlessOrchestrator({
    systemPrompt: renderResult.agent.prompt,
    userPrompt: intent,
    ...(queryFn !== undefined ? { queryFn } : {}),
    ...(runner !== undefined ? { runner } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(maxTurns !== undefined ? { maxTurns } : {}),
    ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
  });
}
