/**
 * ADR-0196 D1/D4 — the universal lifecycle projection. Every stored per-kind vocabulary (friction
 * `route`, plan `status`, ADR frontmatter status, and the stateless-kind defaults) maps onto ONE
 * triad: `open | active | archived`. This is the SINGLE place that mapping lives — D4: "any new
 * stateful kind MUST route through it — a second ad-hoc status surface is the failure mode this ADR
 * exists to end."
 *
 * Pure zod-free logic, browser-safe: NO `node:` / `fs` / `pg` import in this entry — the studio
 * bundles the root barrel this module is re-exported from.
 */

/** The universal lifecycle triad (ADR-0196 D1). */
export type Lifecycle = "open" | "active" | "archived";

/** The lifecycle-bearing fields this projection reads — nothing else. */
export interface LifecycleDoc {
  route?: string | null | undefined;
  status?: string | null | undefined;
}

/**
 * Project a stored doc's kind + lifecycle-bearing fields onto the universal triad (ADR-0196 D1).
 * Never throws — an unrecognised kind degrades to `active` (a corpus that grows kinds must not
 * crash a shelf).
 */
export function lifecycleOf(kind: string, doc: LifecycleDoc): Lifecycle {
  switch (kind) {
    case "friction":
      // Friction is NEVER active (D1: "— (never load-bearing)"). Any route in the closed
      // FrictionRoute set — the `nothing` tombstone included — means "dealt with" => archived
      // (D2 collapses `routed` and `archived` into one).
      return doc.route ? "archived" : "open";

    case "plan":
      switch (doc.status) {
        case "ready":
          return "active";
        case "consumed":
        case "superseded":
        case "retired":
          return "archived";
        case "draft":
        default:
          return "open";
      }

    case "adr":
      switch (doc.status) {
        case "accepted":
          return "active";
        case "superseded":
          return "archived";
        case "proposed":
        default:
          return "open";
      }

    case "open-question":
    case "proposal":
      return "open";

    case "arc":
      return "active";

    default:
      // Every durable kind (definition/principle/pattern/guardrail/techstack/process/agent/
      // template) is evergreen-active, and so is any kind this projection doesn't yet know about
      // (D2: never invent an absent closed state; degrade to active, never throw).
      return "active";
  }
}
