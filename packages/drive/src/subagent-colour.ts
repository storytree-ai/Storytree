// ADR-0138 §5 — subagentColourState: pure role/intent → colour-state mapping.
//
// The wisp colour expresses WHAT the orchestrator is doing on the claimed
// story: authoring (story-author), proving (red→green leaf), supplementing
// (glue / non-leaf orchestration).
//
// Honesty wall (ADR-0045 / ADR-0099): "proving" is a CLAIM colour state, never
// the proven-green bloom. A real build's CONFIRM_GREEN + signed verdict owns the
// bloom. This mapping must never emit "green" or "bloom".
//
// This module is pure (no store, no clock) and builtins-only (offline-safe).

/** The three ADR-0138 §5 subagent roles. */
export type SubagentRole = "authoring" | "proving" | "supplementing";

/**
 * The three claim intents the spine can carry:
 * - "edit"        → story-author file edits        (authoring)
 * - "real"        → red→green leaf / real build     (proving)
 * - "orchestrate" → non-leaf glue / supplementing   (supplementing)
 */
export type ClaimIntent = "edit" | "real" | "orchestrate";

/**
 * The colour-state token the wisp renders.
 * Guaranteed never to be "green" or "bloom" (the honesty wall).
 */
export type ColourStateToken = SubagentRole;

/**
 * Pure mapping from a subagent role or claim intent to the colour-state token
 * the wisp should render for that activity.
 *
 * @param input - A `SubagentRole` or `ClaimIntent`.
 * @returns The stable `ColourStateToken` for that input.
 */
export function subagentColourState(input: SubagentRole | ClaimIntent): ColourStateToken {
  switch (input) {
    case "authoring":
    case "edit":
      return "authoring";

    case "proving":
    case "real":
      return "proving";

    case "supplementing":
    case "orchestrate":
      return "supplementing";
  }
}
