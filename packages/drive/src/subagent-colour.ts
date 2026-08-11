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

/**
 * The three ADR-0138 §5 subagent roles — the SAME vocabulary as `ClaimRole` in
 * `@storytree/notice-board`, which ADR-0346 D3 made the claim ledger's own typed column. That
 * package is below this one and restates the words rather than importing them; the two are one
 * vocabulary and must be extended together.
 */
export type SubagentRole = "authoring" | "proving" | "supplementing";

/**
 * The three claim intents the spine can carry:
 * - "edit"        → story-author file edits        (authoring)
 * - "real"        → red→green leaf / real build     (proving)
 * - "orchestrate" → non-leaf glue / supplementing   (supplementing)
 *
 * LEGACY as of ADR-0346 D3: these are the words a claim's `intent` column held while it doubled as
 * an enum. The typed half is now `role`, and `intent` is free prose — so a claim row reaches this
 * mapping through `claimRole`, never through its raw prose. The union stays because the WRITTEN
 * rows carrying these words are still in the ledger and still read through this mapping.
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
