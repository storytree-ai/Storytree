// claimColour — the studio's LOCAL mirror of @storytree/drive's `subagentColourState` (ADR-0138 §5).
//
// Why a mirror, not an import: apps/studio/src is browser-bundled and MUST NOT import
// `@storytree/drive` (the model-path boundary, modelPathBoundary.test.ts) — exactly as types.ts
// mirrors `BuildPhase`/`WorkStatus` from proof-protocol rather than importing them. This is the tiny
// pure function that turns a claim's free-prose `intent` into the colour-state the claim wisp wears.
//
// Honesty wall (ADR-0138 §5 / ADR-0045): the result is ALWAYS one of the three coordination states —
// NEVER "green"/"bloom". A claim is "a session is working this story," never a proof; only a signed
// verdict paints the green bloom. An UNKNOWN intent defaults to `supplementing` (the catch-all glue
// state) and never throws — a claim wisp must always render, and must always render NON-green.

import type { SubagentColourState } from '../types';

/**
 * Map a claim's activity word to its subagent colour-state, mirroring `subagentColourState` in
 * `@storytree/drive`:
 *   - `"edit"`        (and the role word `"authoring"`)      → `authoring`   (story-author file edits)
 *   - `"real"`        (and the role word `"proving"`)        → `proving`     (red→green leaf / real build)
 *   - `"orchestrate"` (and the role word `"supplementing"`)  → `supplementing` (non-leaf glue)
 *
 * ADR-0346 D3 split the source field in two: a typed `role` (exactly the three role words above)
 * and a free-prose `intent` nothing parses. The TYPED half is what this is meant to read — and the
 * three role words are already accepted, so it reads a role correctly today. The map still passes
 * `intent` at the call site (`TreeView.tsx`), which is deliberately out of increment 2's scope; a
 * post-split prose row lands on the fall-through below, which is the SAME `supplementing` those
 * rows rendered as when the field held the constant `"orchestrate"`, so the colour does not move.
 * Repointing the call site at `claimRole(claim)` is the follow-on that retires the ramp.
 *
 * Any OTHER value (a prose intent, or a malformed row) falls through to `supplementing` — never a
 * throw, never "green". Pure: a string in, a colour-state out.
 */
export function claimColourState(intent: string): SubagentColourState {
  switch (intent) {
    case 'authoring':
    case 'edit':
      return 'authoring';

    case 'proving':
    case 'real':
      return 'proving';

    case 'supplementing':
    case 'orchestrate':
      return 'supplementing';

    default:
      // An unrecognised intent is honest glue, not a proof: the wisp still shows, still non-green.
      return 'supplementing';
  }
}
