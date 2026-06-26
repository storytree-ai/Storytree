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
import type { SdkQueryFn, HeadlessOrchestratorResult } from "@storytree/agent";
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
   * Injectable SDK query function (the real SDK `query()` or an offline scripted double).
   * An offline double allows the composition to be proven without live SDK spend (ADR-0010 §5).
   */
  queryFn: SdkQueryFn;
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
}: OrchestrateArgs): Promise<OrchestrateResult> {
  // 1. Render the session-orchestrator agent — fail-closed before any SDK spend if absent.
  const renderResult = await renderAgentPrompt(store, "session-orchestrator");
  if (!renderResult.ok) {
    return {
      ok: false,
      error: `session-orchestrator agent not found in the store: ${renderResult.reason}`,
    };
  }

  // 2. Drive the headless session with the rendered system prompt and the programmatic intent.
  return runHeadlessOrchestrator({
    systemPrompt: renderResult.agent.prompt,
    userPrompt: intent,
    queryFn,
  });
}
