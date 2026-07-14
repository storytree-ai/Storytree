// The friction lifecycle projection — ONE definition shared by the two consumers that must agree:
// the capture CLI's `friction list` worklist view (`friction.ts`) and the drain-ceiling gate's pure
// core (`friction-drain.ts`). Since ADR-0196 this is a CONSUMER of the universal lifecycle
// projection in @storytree/library (`lifecycleOf(kind, doc)`): the old three-way
// open/routed/archived collapsed to the universal `open | archived` (D2 — "routed" and "archived"
// are both dealt-with; WHERE an item went stays on `route` as audit detail, never as lifecycle).
// Still PURE (the library root barrel is browser-safe, no `node:` import) so the gate core stays
// DB-free and unit-testable.

import { lifecycleOf as universalLifecycleOf } from "@storytree/library";

/**
 * A friction item's DERIVED lifecycle (ADR-0168 D2 as amended by ADR-0196 D2 — a projection of
 * `route`, never stored): **open** (no route — un-adjudicated backlog) or **archived** (any route
 * set — dealt with; `route: nothing` is the tombstone flavour, `route` itself says where it went).
 * Friction is never `active` (ADR-0196 D1: never load-bearing), so the universal triad narrows.
 */
export type FrictionLifecycle = "open" | "archived";

/**
 * Project a friction item's lifecycle from its `route` via the universal projection (ADR-0196 D4:
 * the mapping's single home is @storytree/library — no second ad-hoc status surface). No/empty
 * route → open; any route (the `nothing` tombstone included) → archived.
 */
export function lifecycleOf(route: string | undefined | null): FrictionLifecycle {
  // The friction arm of the universal projection never returns "active" (ADR-0196 D1).
  return universalLifecycleOf("friction", { route }) as FrictionLifecycle;
}
