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
  /** An `arc`'s stored closure flag (ADR-0239 D1): absent/`active` → active, `closed` → archived. */
  lifecycle?: string | null | undefined;
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

    case "increment":
      // The increment tier's four states (ADR-0305 D2), projected onto the triad. `proposal` is
      // decided-but-not-started => open. `ready` (authored, consumable) and `active` (execution
      // started) are both in flight => active. `closed` is terminal for any reason => archived.
      //
      // Note `active` maps to `active`, where its predecessor `consumed` mapped to `archived`. That
      // is the rename earning its keep rather than a drift: `consumed` was read as spent because a
      // consumed plan was prunable, but ADR-0305 D3 makes increments durable — a closed increment IS
      // the arc's landing-log entry — so the state under execution is exactly the in-flight one the
      // triad's middle value names. Shelving an executing increment as `archived` would hide live
      // work.
      switch (doc.status) {
        case "ready":
        case "active":
          return "active";
        case "closed":
          return "archived";
        case "proposal":
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

    // `proposal` used to share this branch; ADR-0298 retired the kind. Its successor is an entry on
    // an arc, whose open/closed state is the entry's own `realized` field and is read there — an
    // ArcProposal is not a doc, so it never reaches this projection.
    case "open-question":
      return "open";

    case "arc":
      // ADR-0239 D1 — the stored closure flag, read through THIS projection and no other (D4 of
      // ADR-0196: a second ad-hoc status surface is the failure that ADR exists to end). Before the
      // field existed this branch was a hardcoded `"active"`, honouring ADR-0196 D2's deferral of the
      // write; now that `arc close` writes the transition, `closed` is finally witnessable. An arc
      // with no stored field is still in flight, so absent degrades to `active` — the projection
      // never invents an `archived` it cannot read.
      return doc.lifecycle === "closed" ? "archived" : "active";

    default:
      // Every durable kind (definition/principle/pattern/guardrail/techstack/process/agent/
      // template) is evergreen-active, and so is any kind this projection doesn't yet know about
      // (D2: never invent an absent closed state; degrade to active, never throw).
      return "active";
  }
}
