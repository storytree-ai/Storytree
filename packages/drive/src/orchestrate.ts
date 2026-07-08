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
  LandingSurfaceDeps,
  InspectSurfaceDeps,
} from "@storytree/agent";
import { runHeadlessOrchestrator } from "@storytree/agent";

import { renderAgentPrompt } from "@storytree/library/store";

import type { SpawnSurfaceDeps } from "./spawn-deps.js";

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
   * OPTIONAL prior-session id to RESUME (ADR-0170, amending ADR-0108: chat continuity). Threaded
   * to the headless runner, whose SDK session loads the prior conversation — so a follow-up send
   * remembers the exchange it continues instead of spawning a memoryless fresh session (the
   * ADR-0163 gap-D fix). Absent → a fresh session, byte-identical to before (the §7 mirror). The
   * result's `sessionId` is what a caller threads back here on the next send.
   */
  resume?: string;
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
  /** Model for the orchestrator session (live run only). Default: the headless orchestrator's
   *  (claude-opus-4-8). */
  model?: string;
  /** Turn ceiling for the live session (live run only) — orientation needs headroom (default 16 is tight). */
  maxTurns?: number;
  /** OPTIONAL hard USD budget ceiling for the live session — no ceiling by default (ADR-0131; the turn cap is the brake). */
  maxBudgetUsd?: number;
  /**
   * Optional sink for streamed assistant text deltas (ADR-0108 Phase 2 streaming) — forwarded to the
   * headless runner so a consuming surface (the chat panel) can render tokens live as the session
   * generates them, instead of waiting for the whole multi-turn session to finish. Omit for a
   * non-streaming consumer (the terminal `orchestrate` command). The proposal is still the authority.
   */
  onDelta?: (text: string) => void;
  /**
   * Optional sink for EVERY SDK message as it streams (the trace seam, ADR-0108 §7) — forwarded to the
   * headless runner so a caller can capture the agent's full turn/tool trail (what it DID), not just
   * its answer. Raw SDK message shape; omit when no trace is needed.
   */
  onMessage?: (message: unknown) => void;
  /**
   * OPTIONAL spawn surface deps: when present, orchestrate() mounts `spawn_story_author` and
   * `spawn_builder` as claim-gated MCP tools in the headless session (ADR-0137 Phase 3).
   * Absent → session byte-identical to the propose-only surface (additive threading only,
   * the §7 scale-down mirror from the orientation surface).
   *
   * The claim deps carry the session's `sessionId` + `branch` (ADR-0033 identity key, ADR-0138 §2/§5)
   * and stamp work KIND per tool into the claim's `intent` so a refusal names a real holder and the
   * wisp's colour-by-subagent layer shows a real role. Blank identity is a fail-closed refusal at the
   * ClaimDoc wall — never a default.
   */
  spawn?: SpawnSurfaceDeps;
  /**
   * OPTIONAL landing surface deps (ADR-0152): when present, orchestrate() mounts `run_gate` and
   * `open_landing_pr` as fail-closed MCP tools in the headless session — the merge-ceremony surface
   * the terminal session-orchestrator already has (run the gate, then commit → push → open a
   * NON-DRAFT PR that CI re-proves and auto-merges, ADR-0022). Absent → session byte-identical to
   * the propose/spawn surface (additive threading only, the §7 scale-down mirror).
   *
   * The spine still signs (ADR-0091 / ADR-0020): `run_gate` reports the OBSERVED pass/fail, never a
   * verdict; no landing tool carries a verdict-shaped payload. The desktop sidecar composes the real
   * deps via `buildLandingDeps` and threads them here; offline tests inject a recording double.
   */
  landing?: LandingSurfaceDeps;
  /**
   * OPTIONAL inspect surface deps (ADR-0173): when present, orchestrate() mounts `view_ci_run`,
   * `view_pr_checks`, and `git_inspect` as fail-closed, READ-ONLY MCP tools in the headless session —
   * the CI/git diagnosis surface the terminal session-orchestrator gets for free (read a failing-job
   * log, an arbitrary PR's checks, the read-only git verbs) so a blind chat can root-cause a red
   * pipeline itself. Absent → session byte-identical to the propose/spawn/landing surface (additive
   * threading only, the §7 scale-down mirror).
   *
   * Observation ONLY (ADR-0173 invariant 1): no inspect tool mutates the tree, merges, pushes, or
   * carries a verdict-shaped payload; each refuses a mutating argument fail-closed. The desktop
   * sidecar composes the real deps via `buildInspectDeps`; offline tests inject a recording double.
   */
  inspect?: InspectSurfaceDeps;
}

/**
 * The composition result — mirrors {@link HeadlessOrchestratorResult} so the CLI surface can
 * forward it directly; the proposal text is the main deliverable on success.
 *
 * When a composition session is already in flight the refusal is typed:
 *   `{ ok: false, refused: true, reason: "single-session", error }`.
 * This lets consumers (e.g. the chat surface) distinguish "busy, retry" from a hard error.
 */
export type OrchestrateResult = HeadlessOrchestratorResult & {
  /** Present only on the typed single-session refusal (ADR-0108 decision 6). */
  refused?: true;
  /** Present only on the typed single-session refusal. */
  reason?: "single-session";
};

// ---------------------------------------------------------------------------
// Composition-level single-session guard (ADR-0108 decision 6)
// ---------------------------------------------------------------------------

/**
 * True while a composition-level orchestration session is in flight.
 * This is the AUTHORITATIVE, TYPED brake; `runHeadlessOrchestrator`'s module-level `inFlight`
 * flag remains a lower-level backstop. Guards synchronously at the TOP of `orchestrate()`.
 */
let compositionInFlight = false;

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
  resume,
  queryFn,
  runner,
  model,
  maxTurns,
  maxBudgetUsd,
  onDelta,
  onMessage,
  spawn,
  landing,
  inspect,
}: OrchestrateArgs): Promise<OrchestrateResult> {
  // 0. Composition-level single-session guard (ADR-0108 decision 6) — synchronous, typed refusal.
  //    Fires BEFORE any async work so the caller gets an immediate, distinguishable signal.
  if (compositionInFlight) {
    return {
      ok: false,
      refused: true,
      reason: "single-session",
      error:
        "A composition orchestration session is already in-flight — one session at a time (ADR-0108 decision 6).",
    };
  }
  compositionInFlight = true;

  try {
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
    return await runHeadlessOrchestrator({
      systemPrompt: renderResult.agent.prompt,
      userPrompt: intent,
      ...(resume !== undefined ? { resume } : {}),
      ...(queryFn !== undefined ? { queryFn } : {}),
      ...(runner !== undefined ? { runner } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(maxTurns !== undefined ? { maxTurns } : {}),
      ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
      ...(onDelta !== undefined ? { onDelta } : {}),
      ...(onMessage !== undefined ? { onMessage } : {}),
      ...(spawn !== undefined ? { spawn } : {}),
      ...(landing !== undefined ? { landing } : {}),
      ...(inspect !== undefined ? { inspect } : {}),
    });
  } finally {
    compositionInFlight = false;
  }
}
