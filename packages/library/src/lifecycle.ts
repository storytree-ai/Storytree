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
  /**
   * A stored lifecycle flag, shared by the two kinds that have one and read per-kind below:
   * an `arc`'s closure flag (ADR-0239 D1: absent/`active` → active, `closed`/`parked` → archived),
   * and an `open-question`'s settlement flag (ADR-0434 D1: absent/`open` → open, `settled` →
   * archived). One field, because the two vocabularies never meet — the `kind` selects the branch
   * before the value is read, so widening this to a per-kind union would buy no safety here and
   * would push a cast onto every caller.
   */
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
      // ADR-0434 D4 — the stored settlement flag, read through THIS projection and no other
      // (ADR-0196 D4). Until it existed this branch was a hardcoded `return "open"`: the identical
      // placeholder the `arc` branch below carried before ADR-0239 gave it a field, one case-arm
      // apart. A question could therefore project to nothing but `open`, so under ADR-0197's
      // three-state selector (which DEFAULTS to `open`) an answered question was not merely
      // mislabelled on its arc — it was unfilterable everywhere and sat permanently on the default
      // shelf.
      //
      // `settled` => `archived` because the triad answers ONE question — is this on the worklist —
      // and an answered question is off it, exactly as a closed arc is. There is no `active` arm:
      // ADR-0196 D1's row for this kind leaves the middle column empty, since a question is not work
      // in flight. Absent degrades to `open`, so the projection never invents a settlement it cannot
      // read — the same rule the `arc` branch applies to a missing closure flag, and what keeps
      // ADR-0434 D1's zero-migration promise honest for every pre-decision question.
      return doc.lifecycle === "settled" ? "archived" : "open";

    case "arc":
      // ADR-0239 D1 — the stored closure flag, read through THIS projection and no other (D4 of
      // ADR-0196: a second ad-hoc status surface is the failure that ADR exists to end). Before the
      // field existed this branch was a hardcoded `"active"`, honouring ADR-0196 D2's deferral of the
      // write; now that `arc close` writes the transition, `closed` is finally witnessable — and
      // since ADR-0337 `arc reopen` writes the way back, so the projection reads a bit that can move
      // both ways rather than a one-way latch. An arc with no stored field is still in flight, so
      // absent degrades to `active` — the projection never invents an `archived` it cannot read.
      //
      // `parked` (ADR-0374 D1) projects to `archived` TOO, and shares the branch deliberately. The
      // triad answers ONE question — is this on the worklist — and a parked arc is off it by the
      // owner's decision exactly as a closed one is off it by its end state. The two are not the
      // same fact and the ARC tier keeps them apart (`closed` met its end state, `parked` did not);
      // the triad simply is not the surface that distinguishes them, and inventing a fourth value to
      // carry the difference here is the wide-enum over-engineering ADR-0196 D2 refused. `open` is
      // the wrong shelf: it means undecided, and parking is a decision.
      return doc.lifecycle === "closed" || doc.lifecycle === "parked" ? "archived" : "active";

    default:
      // Every durable kind (definition/principle/pattern/guardrail/techstack/process/agent/
      // template) is evergreen-active, and so is any kind this projection doesn't yet know about
      // (D2: never invent an absent closed state; degrade to active, never throw).
      return "active";
  }
}
