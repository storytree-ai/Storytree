import { z } from "zod";

import type { ReliabilityGate, ReliabilityGateKind } from "@storytree/library";
import { sweepDecisions, type DecisionFork, type DecisionSweep } from "./decision-sweep.js";

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
 * The finer sub-classification of an UNCOVERED capability — the Layer-2 ↔ Layer-3 contract (ADR-0098 d.1).
 * The structural covers-diff ({@link classifyAdoption}) only ever emits `unclassified` (an uncovered cap
 * awaiting the agent's call); {@link assembleProposal} stamps the finer ADR-0098 d.1 taxonomy from the
 * agent's injected per-pocket reading:
 *  - `observe` — untested but CORRECT and testable-as-is (an `observe` gate, observe-and-sign → `adopted`).
 *  - `R1`      — untested AND incomplete/incorrect: a behavioural red (`editsExisting`, ADR-0057).
 *  - `R2`      — untested, correct, but UNTESTABLE as-is: a refactor-for-testability structural red (ADR-0098 d.1).
 * `unclassified` stays the fail-closed default for an uncovered cap the agent supplied no reading for —
 * never silently guessed. A string union, so a future arm widens cleanly; consumers treat unknown values
 * as forward-compatible.
 */
export type PocketClass = "unclassified" | "observe" | "R1" | "R2";

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

// ---------------------------------------------------------------------------
// Layer-2 JUDGMENT half (ADR-0098 d.1): pocket classification → proposed gates
// ---------------------------------------------------------------------------

/**
 * The kind of reliability gate the proposal RECOMMENDS for an uncovered pocket — the two honest
 * brownfield paths (ADR-0085 / ADR-0098): `observe` (correct & testable-as-is → observe-and-sign) or
 * `build-tests` (earned by a real red→green, R1 or R2). Never `integrate` (folded under a cap, not
 * proposed per-pocket).
 */
export type ProposedGateKind = "observe" | "build-tests";

/**
 * A RECOMMENDED reliability-gate stanza for one uncovered pocket — the proposal's build hand-off, as
 * DATA (recommend-only, ADR-0097 d.4: the machine never writes the authored spec). It carries exactly
 * what a `## Reliability Gates` item needs so it round-trips through the real `parseReliabilityGates`
 * ({@link renderProposedGate} is the renderer; the round-trip is the honesty oracle — a recommendation is
 * a valid floor entry, not free text). The human reviews and authors it; nothing greens until
 * `gate run --real` drives it.
 */
export interface ProposedGate {
  /** The uncovered capability this gate would cover. */
  capId: string;
  /** `observe` (adopt-able as-is) or `build-tests` (earned by real red→green). */
  kind: ProposedGateKind;
  /** The cap ids the gate `(covers:)` — at least `[capId]`. */
  covers: string[];
  /** The gate's human title (the bold lead of the rendered item). */
  title: string;
  /**
   * The declared proof command (the backticked span): the suite the spine OBSERVES for an `observe`
   * gate, or the whole-package-suite regression wall a `build-tests` R1/R2 drive greens against (ADR-0098 d.2).
   */
  proofCommand: string;
  /** For a `build-tests` gate: the ADR-0098 d.1 red taxonomy (`R1` behavioural / `R2` refactor). Absent for `observe`. */
  redKind?: "R1" | "R2";
  /**
   * For a `build-tests` gate: the `(build: <node-id>)` whose `real:` arm `gate run --real` borrows to
   * drive the red→green (ADR-0098 U2). Absent for `observe` (nothing to drive).
   */
  buildNode?: string;
}

/**
 * The agent's per-pocket READING of one uncovered capability — the JUDGMENT half of Layer 2, supplied as
 * INJECTED DATA (the orchestrator / story-author session's pre-build pocket analysis, ADR-0098 d.5),
 * exactly as {@link DecisionFork}s are injected into the decision sweep. The pure compute never invents
 * this — *is this pocket correct? testable-as-is?* is reasoning over code, not a heuristic. An uncovered
 * cap with NO reading stays `unclassified` (the fail-closed default).
 */
export interface PocketReading {
  /** The agent's ADR-0098 d.1 call: `observe` (testable-as-is) | `R1` (behavioural) | `R2` (refactor). */
  class: Exclude<PocketClass, "unclassified">;
  /** The recommended gate's title. */
  title: string;
  /** The recommended proof command (the observe suite, or the build-tests regression-wall package suite). */
  proofCommand: string;
  /** For an `R1`/`R2` reading: the `(build:)` node id whose `real:` arm the gate borrows. */
  buildNode?: string;
  /** The candidate design forks the agent surfaced for this pocket — fed to the decision sweep. */
  forks?: readonly DecisionFork[];
}

/** Everything {@link assembleProposal} reads: the structural spec + the agent's per-pocket readings. */
export interface AssembleProposalSpec extends AdoptionProposalSpec {
  /**
   * The agent's per-pocket reading, keyed by capability id. An uncovered cap ABSENT from this map stays
   * `unclassified` and gets no proposed gate (the fail-closed honesty wall). Covered caps are ignored.
   */
  readings: Readonly<Record<string, PocketReading>>;
}

/**
 * A story's FULL adoption proposal (Layer 2, both halves): the structural covers-diff
 * ({@link AdoptionProposal}) enriched with the agent-stamped pocket classes, the recommended gate
 * stanzas, and the decision sweep over the surfaced forks. Recommend-only — it greens nothing and
 * authors nothing; it is the "adopt-able vs needs-build-tests vs decisions-I-need-from-you" surface
 * ADR-0097 names.
 */
export interface AdoptionProposalEnriched extends AdoptionProposal {
  /** One recommended gate stanza per CLASSIFIED uncovered pocket (none for an `unclassified` / covered cap). */
  proposedGates: ProposedGate[];
  /** The decision sweep over every surfaced per-pocket fork — escalated vs routine, blocked vs resolved. */
  sweep: DecisionSweep;
}

/** PURE: turn one agent pocket reading into the recommended {@link ProposedGate}. */
function toProposedGate(capId: string, reading: PocketReading): ProposedGate {
  if (reading.class === "observe") {
    return {
      capId,
      kind: "observe",
      covers: [capId],
      title: reading.title,
      proofCommand: reading.proofCommand,
    };
  }
  // `R1` / `R2` → a `build-tests` gate that borrows a `(build:)` node's `real:` arm.
  return {
    capId,
    kind: "build-tests",
    covers: [capId],
    title: reading.title,
    proofCommand: reading.proofCommand,
    redKind: reading.class,
    ...(reading.buildNode !== undefined ? { buildNode: reading.buildNode } : {}),
  };
}

/**
 * PURE: assemble a story's full adoption proposal (ADR-0097 Layer 2, both halves). Runs the structural
 * {@link classifyAdoption} covers-diff, then stamps each UNCOVERED pocket with the agent's injected
 * {@link PocketReading} class, emits a recommended {@link ProposedGate} per classified pocket, and sweeps
 * the surfaced per-pocket forks through the real {@link sweepDecisions} owner-fork bar. An uncovered cap
 * with no reading stays `unclassified` with NO proposed gate (fail-closed — never guessed `observe`).
 * Covered caps are untouched. Deterministic and order-preserving (mirrors {@link classifyAdoption}); the
 * agent supplies judgement, the spine supplies the honest assembly + the deterministic ruler.
 */
export function assembleProposal(spec: AssembleProposalSpec): AdoptionProposalEnriched {
  const base = classifyAdoption(spec);

  const capabilities = base.capabilities.map((cap): CapAdoption => {
    if (cap.covered) return cap; // a covered cap owes nothing — untouched
    const reading = spec.readings[cap.capId];
    if (reading === undefined) return cap; // un-read uncovered cap → stays `unclassified`
    return { ...cap, pocket: reading.class };
  });

  const proposedGates: ProposedGate[] = [];
  const forks: DecisionFork[] = [];
  for (const cap of capabilities) {
    if (cap.covered) continue;
    const reading = spec.readings[cap.capId];
    if (reading === undefined) continue; // unclassified → no recommendation, no forks
    proposedGates.push(toProposedGate(cap.capId, reading));
    if (reading.forks !== undefined) forks.push(...reading.forks);
  }

  const sweep = sweepDecisions({ gateId: `${spec.storyId}#adoption`, forks });
  return { ...base, capabilities, proposedGates, sweep };
}

/**
 * PURE: render a {@link ProposedGate} to the `## Reliability Gates` item body (the text AFTER the `N. `
 * numbering) so it round-trips back through the real `parseReliabilityGates`:
 * `**Title** _(gate: <kind>)_ _(covers: …)_ [_(build: …)_] \`cmd\``. The italic underscores are cosmetic
 * (the parser reads the `(gate:)` / `(covers:)` / `(build:)` tags and the first post-tag backtick span);
 * the command is rendered LAST so it falls after the `(gate:)` tag the parser anchors on. This is the
 * recommend-only hand-off shape — a human pastes it under a story's `## Reliability Gates`.
 */
export function renderProposedGate(gate: ProposedGate): string {
  const parts = [`**${gate.title}**`, `_(gate: ${gate.kind})_`];
  if (gate.covers.length > 0) parts.push(`_(covers: ${gate.covers.join(", ")})_`);
  if (gate.buildNode !== undefined) parts.push(`_(build: ${gate.buildNode})_`);
  parts.push(`\`${gate.proofCommand}\``);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Readings input (the JSON boundary): validate the agent's injected per-pocket reading
// ---------------------------------------------------------------------------

/** Zod for one surfaced design fork in a readings file — validated at the JSON boundary, fail-closed. */
const ForkInput = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    changesPublicSeam: z.boolean(),
    materiallyDifferentStrategies: z.boolean(),
    crossCuttingOrIrreversible: z.boolean(),
    resolution: z.string().optional(),
  })
  .strict();

/** Zod for one capability's agent reading in a readings file. `class` is the ADR-0098 d.1 taxonomy. */
const PocketReadingInput = z
  .object({
    class: z.enum(["observe", "R1", "R2"]),
    title: z.string().min(1),
    proofCommand: z.string().min(1),
    buildNode: z.string().min(1).optional(),
    forks: z.array(ForkInput).optional(),
  })
  .strict();

/** Zod for a whole readings file: a map of capability id → its agent reading. */
const PocketReadingsInput = z.record(PocketReadingInput);

/**
 * PURE: validate + normalise a readings JSON blob (the agent's per-pocket analysis, surfaced e.g. via
 * `adopt plan --readings <file>`) into the `Record<capId, PocketReading>` {@link assembleProposal}
 * consumes. THROWS (zod) on a malformed blob — the boundary is fail-closed, never a silently-dropped or
 * half-read map. Reconstructs each object explicitly so the optional fields satisfy
 * `exactOptionalPropertyTypes`.
 */
export function parsePocketReadings(raw: unknown): Readonly<Record<string, PocketReading>> {
  const parsed = PocketReadingsInput.parse(raw);
  const out: Record<string, PocketReading> = {};
  for (const [capId, r] of Object.entries(parsed)) {
    const forks: DecisionFork[] | undefined = r.forks?.map((f) => ({
      id: f.id,
      question: f.question,
      changesPublicSeam: f.changesPublicSeam,
      materiallyDifferentStrategies: f.materiallyDifferentStrategies,
      crossCuttingOrIrreversible: f.crossCuttingOrIrreversible,
      ...(f.resolution !== undefined ? { resolution: f.resolution } : {}),
    }));
    out[capId] = {
      class: r.class,
      title: r.title,
      proofCommand: r.proofCommand,
      ...(r.buildNode !== undefined ? { buildNode: r.buildNode } : {}),
      ...(forks !== undefined ? { forks } : {}),
    };
  }
  return out;
}
