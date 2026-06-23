import type { ReliabilityGate, ReliabilityGateKind } from "@storytree/library";

/**
 * The Layer-2 ADOPTION-PROPOSAL classifier (ADR-0097 Layer 2): the mechanical, ratified compute that
 * answers *"what does bringing this brownfield story into the fold actually take?"* — which of a
 * story's capabilities are already COVERED by a declared reliability gate, and which are UNCOVERED and
 * still owe real work.
 *
 * This is the FORK-1 (structural-now) half the owner settled
 * ([`docs/research/layer2-adoption-proposal-design.md`](../../../../docs/research/layer2-adoption-proposal-design.md)):
 * a covers-DIFF of Layer 1's `(covers:)` declarations (the built `covers` field on a
 * {@link ReliabilityGate}, ADR-0097 d.5) against the story's full capability set. Deterministic,
 * offline, pure-by-injection (mirrors {@link observeAndSign}) — it reads only the cap-id list + the
 * gates, touches no store / git / clock, so the whole compute is offline-testable. It **trusts** that a
 * declared gate genuinely exercises the caps it `(covers:)`; real coverage MEASUREMENT (to catch a gate
 * whose suite only smoke-imports its code) is named follow-on — the same vacuity gap ADR-0098 §2 accepts.
 *
 * **The Layer-2 ↔ Layer-3 contract (the extensibility slot).** The FINER sub-classification of the
 * UNCOVERED set — does an uncovered cap need a behavioural red→green, or a refactor-for-testability? —
 * is agent analysis (the story-author's batch-sweep, ADR-0098 §5), and
 * [ADR-0098](../../../../docs/decisions/0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)
 * (proposed, under owner review) FINALIZES that taxonomy. So {@link PocketClass} is a deliberately
 * EXTENSIBLE slot, NOT a baked-in commitment to any `observe` / `R1` / `R2` words: the only value the
 * structural compute emits today is `unclassified` (an uncovered cap awaiting the agent's call). Layer 3
 * grows the slot; nothing here hard-couples to it.
 */

/**
 * The finer sub-classification of an UNCOVERED capability — the Layer-2 ↔ Layer-3 contract (ADR-0098 §1).
 * Layer 2's mechanical output is covered-vs-uncovered (the covers-diff); the finer call is agent analysis
 * that fills this slot, and ADR-0098 (proposed) finalizes its taxonomy. EXTENSIBLE by design — today the
 * structural compute only emits `unclassified`; the additional arms ADR-0098 ratifies are grown here
 * later (a string union widens cleanly), so consumers must treat unknown values as forward-compatible.
 */
export type PocketClass = "unclassified";

/** The fields of a reliability gate the classifier reads — only its id, kind, and coverage declaration. */
export type ClassifierGate = Pick<ReliabilityGate, "id" | "kind" | "covers">;

/** One gate whose `(covers:)` declares a capability — surfaced so a consumer can see HOW it is covered. */
export interface CoveringGate {
  /** The covering gate's id (`<story>#gate-<n>`). */
  gateId: string;
  /**
   * The gate's kind: an `observe` gate makes the cap ADOPT-ABLE as-is (observe-and-sign → `adopted`);
   * a `build-tests` / `integrate` gate declares a path but is earned by real work. Carried so the
   * studio / agent can distinguish "already adoptable" from "covered-but-owes-work" without re-parsing.
   */
  kind: ReliabilityGateKind;
}

/** The per-capability classification: is it covered by a declared `(covers:)` gate, and by which? */
export interface CapAdoption {
  /** The capability id (a member of the story's declared `capabilities`). */
  capId: string;
  /** Structural (Fork-1) verdict: covered iff ≥1 reliability gate `(covers:)` it. Trusts the declaration. */
  covered: boolean;
  /** The gates whose `(covers:)` names this cap (empty when uncovered). */
  coveredBy: CoveringGate[];
  /**
   * The Layer-2 ↔ Layer-3 slot ({@link PocketClass}): the finer sub-classification of an UNCOVERED cap.
   * `undefined` for a covered cap (nothing owed). The structural compute only ever sets `unclassified`
   * here — the agent's observe/R1/R2 call (ADR-0098) fills it.
   */
  pocket?: PocketClass;
}

/**
 * A story's adoption proposal: the per-capability covered/uncovered classification plus the honest
 * provenance of any mis-declaration. Live-derivable (re-compute each load) — it carries no timestamps or
 * verdict state, only the structural diff of the spec's caps against its gates' `(covers:)`.
 */
export interface AdoptionProposal {
  /** The story this proposal is for. */
  storyId: string;
  /** Every declared capability, classified — in the story's declared order (stable, never re-sorted). */
  capabilities: CapAdoption[];
  /** The covered cap ids (a declared `(covers:)` gate names each) — the convenience projection. */
  covered: string[];
  /**
   * The uncovered cap ids — the set that still owes real (build-tests) work. These are the caps a
   * green crown would otherwise over-claim; each holds the crown at `proposed` until covered (ADR-0097 d.5).
   */
  uncovered: string[];
  /**
   * Cap ids named in some gate's `(covers:)` but NOT in the story's declared capability set — a
   * mis-declaration (a typo'd or stale cap id). Surfaced as honest provenance, never silently dropped:
   * an author should fix the `(covers:)` tag or add the capability. Sorted for stable output.
   */
  danglingCovers: string[];
}

/** Everything {@link classifyAdoption} reads, injected for determinism (pure — no store / git / clock). */
export interface AdoptionProposalSpec {
  /** The story id (carried onto the proposal). */
  storyId: string;
  /** The story's declared capability ids (`NodeSpec.capabilities`), in declared order. */
  capabilityIds: readonly string[];
  /** The story's parsed `## Reliability Gates` (`NodeSpec.reliabilityGates`) — only id/kind/covers read. */
  gates: readonly ClassifierGate[];
}

/**
 * PURE: classify a brownfield story's capabilities by the covers-diff (ADR-0097 Layer 2, Fork 1). For
 * each declared capability, COVERED iff some reliability gate's `(covers:)` names it (trusting the
 * declaration — no coverage measurement); UNCOVERED caps carry the `unclassified` {@link PocketClass}
 * slot the Layer-3 agent analysis fills. A `(covers:)` entry that names a cap the story does not declare
 * is reported as a `danglingCovers` mis-declaration rather than silently dropped.
 *
 * Deterministic and order-preserving: `capabilities` follows the declared cap order; `covered` /
 * `uncovered` / `danglingCovers` are stable. Duplicate ids in `capabilityIds` collapse to one entry
 * (first occurrence wins) so a typo'd duplicate never double-counts.
 */
export function classifyAdoption(spec: AdoptionProposalSpec): AdoptionProposal {
  const capSet = new Set(spec.capabilityIds);

  // Index the covering gates per cap id (a cap may be covered by more than one gate; a gate may cover
  // more than one cap). Built once over the gates so the per-cap lookup is structural, not quadratic-feeling.
  const coveringByCap = new Map<string, CoveringGate[]>();
  const danglingCovers = new Set<string>();
  for (const gate of spec.gates) {
    for (const capId of gate.covers) {
      if (!capSet.has(capId)) {
        // A `(covers:)` entry that is not a declared capability — a mis-declaration, surfaced honestly.
        danglingCovers.add(capId);
        continue;
      }
      const list = coveringByCap.get(capId) ?? [];
      list.push({ gateId: gate.id, kind: gate.kind });
      coveringByCap.set(capId, list);
    }
  }

  const capabilities: CapAdoption[] = [];
  const covered: string[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const capId of spec.capabilityIds) {
    if (seen.has(capId)) continue; // collapse a duplicate cap id to its first occurrence
    seen.add(capId);
    const coveredBy = coveringByCap.get(capId) ?? [];
    const isCovered = coveredBy.length > 0;
    capabilities.push(
      isCovered
        ? { capId, covered: true, coveredBy }
        : { capId, covered: false, coveredBy, pocket: "unclassified" },
    );
    (isCovered ? covered : uncovered).push(capId);
  }

  return {
    storyId: spec.storyId,
    capabilities,
    covered,
    uncovered,
    danglingCovers: [...danglingCovers].sort(),
  };
}
