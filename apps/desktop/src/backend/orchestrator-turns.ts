// The desktop chat ORCHESTRATOR-SESSION turn budget (desktop-orchestrator full-autonomy arc, 2026-07-04).
//
// WHY THIS EXISTS: the desktop chat IS the session-orchestrator (ADR-0136/0137) — the human-watched
// loop the owner drives. Per ADR-0151 (re-deciding ADR-0130 for the orchestrator-session path) that
// session runs UNBOUNDED by default: the owner sees it stream and can stop a genuine hang, so a fixed
// turn cap that false-fails a long-but-healthy orient/propose costs more than it protects. So the
// desktop path forwards NO maxTurns by default — the session gets no `maxTurns` and the SDK is
// unbounded.
//
// The escape hatch is env-only: STORYTREE_ORCHESTRATOR_MAX_TURNS RE-imposes a cap (a bounded/debug
// run). This is the INVERSE default of resolveSpawnMaxTurns (which defaults to a positive number,
// because the spawned story-author is an inner-loop subagent that keeps its runaway brake — ADR-0130
// unchanged there): here `undefined` (unbounded) is the default, a positive env value the override.
//
// This module is a pure function so it carries a CI unit test — the backend-entry glue that reads
// process.env and threads the result into createChatSseMount is operator-attested (a node:test over it
// would spawn a subscription-billed SDK session).

/**
 * Resolve the desktop chat orchestrator-session turn ceiling from an env value.
 *
 * Returns `number | undefined`:
 *   - `undefined` (the default) — UNBOUNDED: no `maxTurns` is handed to the SDK (ADR-0151). This is
 *     what an absent, blank, non-numeric, non-finite, zero, or negative value yields — never a broken
 *     cap (a 0/NaN maxTurns would abort the session before it started).
 *   - a positive whole number — a RE-imposed cap (floored to a whole turn count), for a bounded/debug
 *     run when the operator explicitly sets STORYTREE_ORCHESTRATOR_MAX_TURNS.
 */
export function resolveOrchestratorMaxTurns(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}
