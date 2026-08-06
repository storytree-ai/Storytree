import { z } from "zod";
import { Outcome, ProofMode } from "./enums.js";
import { CriterionId, CriterionRevisionId } from "./criterion-binding.js";

/**
 * The verdict DATA shapes (ADR-0068 §3) — the published SHAPE readers validate
 * verdict-DATA against, across the built ADR-0010 §4 boundary. DATA + validators ONLY:
 * no proof machinery, no signing chain, no store — those stay in the farmer organism
 * (`@storytree/core` / the gate). Browser-safe; zod is the only runtime dependency.
 *
 * Mirrors `@storytree/core/proof.ts` field-for-field so a later re-point is a no-op diff,
 * with ONE additive generalization: {@link Verdict} carries `outputVersion` (ADR-0068 §3),
 * defaulted so older docs round-trip unchanged.
 */

/**
 * A pointer to a piece of evidence backing a verdict (a recorded red/green diagnostic,
 * a test-run log, a UAT transcript). `kind` names the evidence class, `ref` is its
 * addressable id/path, `note` is optional prose.
 */
export const EvidenceRef = z
  .object({
    kind: z.string(),
    ref: z.string(),
    note: z.string().optional(),
  })
  .strict();
export type EvidenceRef = z.infer<typeof EvidenceRef>;

/**
 * The verdict-data output-format version (ADR-0068 §3). Generalizes ADR-0016's
 * `fnv1:` / `ast1:` hash tagging to the WHOLE verdict doc: a literal that lets a reader
 * know which shape it is parsing before it trusts the fields. Currently the single
 * version `v1`; future shape changes bump this so readers can branch on it.
 */
export const VerdictOutputVersion = z.literal("v1");
export type VerdictOutputVersion = z.infer<typeof VerdictOutputVersion>;

/**
 * The per-contract coverage axis a signed green CARRIES (ADR-0127, Option A of ADR-0122). ADR-0020
 * makes red→green non-forgeable for the ONE authored test the spine observed, but a capability that
 * declares N `## Contracts` can reach a signed green on one proven test — coverage of the REST was
 * only live-DERIVABLE (re-computed each run by `storytree coverage` / `check:coverage`). This records
 * the fact ON the verdict so it is ATTESTED at sign time, not merely re-derivable against
 * possibly-changed source later.
 *
 * Deliberately MINIMAL (owner-directed 2026-06-27): just the two declared-contract-id lists — the
 * contracts a SUBSTANTIVE test covered (ADR-0126 vouching) vs the ones the green over-claimed. The
 * covering test name(s) stay live-derivable (`storytree coverage`), not frozen here. `covered` ∪
 * `uncovered` is the unit's declared contract set at sign time; `uncovered` non-empty means the green
 * over-claims those contracts. Both lists are `[]` for a unit that declares no contracts.
 *
 * Plus ONE honesty qualifier on those lists — `unreadTitles` (2026-08-06). It is not a richer record
 * of the kind the owner's minimal choice ruled out (that was about freezing covering test NAMES,
 * verbosity with no honesty payoff); it is what makes `uncovered` mean one thing instead of two.
 * ADR-0126's two folds point in OPPOSITE directions: hollowness folds toward covered, readability
 * folds toward UNCOVERED — so without this count, "no test names this contract" and "I could not read
 * that test's title" arrive at a reader identically, and frozen on a signature. That is not
 * hypothetical: it is the failure ADR-0127 already records (PR #1172 stamped `coverage 0/6` over six
 * tests that all existed and passed).
 */
export const ContractCoverageAxis = z
  .object({
    /** Declared contract ids a SUBSTANTIVE observed test named (covered), in declared order. */
    covered: z.array(z.string()),
    /** Declared contract ids no substantive test named — the green over-claims these (ADR-0122). */
    uncovered: z.array(z.string()),
    /**
     * How many observed test titles the static reader could NOT read in full at sign time — the
     * qualifier that tells a `0/N` apart from a `0/N`. Read as THREE states, which is why the
     * producer stamps it even when zero:
     *  - **absent** — a verdict signed before this field existed: not measured, so `uncovered` carries
     *    the old ambiguity and cannot be resolved after the fact;
     *  - **`0`** — measured clean: every title was legible, so `uncovered` is a statement about the
     *    TESTS and the green genuinely over-claims those contracts;
     *  - **`> 0`** — measured with a caveat: part of the surface was never legible to a static reader,
     *    so `uncovered` is at least partly a statement about the CHECKER, not about the tests.
     * OPTIONAL purely for back-compat with verdicts already stored without it; the current producer
     * always populates it. Never a gate signal on its own — it qualifies a claim, it does not make one.
     */
    unreadTitles: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ContractCoverageAxis = z.infer<typeof ContractCoverageAxis>;

/**
 * A verdict: the prove-it-gate's output (ADR-0020 §4). Pinned to a commit SHA and a
 * resolved signer; the `runId` ties it to the run that produced it.
 *
 * `outputVersion` is ADDITIVE (ADR-0068 §3): it defaults to `v1`, so every doc that
 * predates it — and every current producer that does not set it — validates and round-trips
 * unchanged, gaining the tag on parse.
 */
const VerdictData = z
  .object({
    unitId: z.string(),
    proofMode: ProofMode,
    outcome: Outcome,
    commitSha: z.string(),
    signer: z.string(),
    /**
     * ADR-0097 (brownfield go-green is a proving process): the HUMAN who APPROVED bringing this unit
     * into the fold — the operator who pressed Adopt — distinct from `signer` (the MACHINE that
     * witnessed the green out-of-band, the spine principal for an `adopted` verdict). The two are
     * different axes: *"did it work?"* is a machine fact (`signer`), *"do we bring it in?"* is the
     * human's decision (`approvedBy`). OPTIONAL/additive: only `adopted` verdicts carry it today, and
     * every prior verdict (and every non-adoption producer) round-trips unchanged without it.
     */
    approvedBy: z.string().optional(),
    runId: z.string(),
    /**
     * The verdict-data output-format version (ADR-0068 §3). Additive: defaults to `v1` so
     * docs that omit it parse unchanged. A reader keys its parse on this before trusting fields.
     */
    outputVersion: VerdictOutputVersion.default("v1"),
    /** ADR-0253: exact UAT criterion identity. Present only together with revisionId. */
    criterionId: CriterionId.optional(),
    /** ADR-0253: exact immutable UAT criterion revision. Present only together with criterionId. */
    revisionId: CriterionRevisionId.optional(),
    /**
     * ADR-0016 binding anchor: the content-hash (hashSpan) of the proved span at sign time — what
     * lets a verdict know WHICH code it proved, so drift is computable later. OPTIONAL for back-compat:
     * verdicts predating ADR-0016 (and every current caller until gate-emits-change wires it) carry none.
     */
    boundHash: z.string().optional(),
    /**
     * ADR-0127 (per-contract coverage axis, Option A of ADR-0122): which DECLARED `## Contracts` this
     * green covered vs over-claimed, attested at sign time. OPTIONAL/additive — only a `--real`
     * red→green green that resolves a unit's contracts carries it; every prior verdict (and the
     * adopted / operator-attested paths, which prove a whole command/witness, not named per-contract
     * tests) round-trips unchanged without it. A reader keys behaviour off its presence, never its
     * absence (a missing axis means "not recorded", never "fully covered").
     */
    contractCoverage: ContractCoverageAxis.optional(),
    evidence: z.array(EvidenceRef).default([]),
    at: z.string(),
  })
  .strict();

export const Verdict = VerdictData.superRefine((value, ctx) => {
  const hasCriterion = value.criterionId !== undefined;
  const hasRevision = value.revisionId !== undefined;
  if (hasCriterion !== hasRevision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasCriterion ? ["revisionId"] : ["criterionId"],
      message: "criterionId and revisionId must be present together",
    });
  }
  if (value.criterionId !== undefined && value.unitId !== value.criterionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unitId"],
      message: "a criterion verdict unitId must equal criterionId",
    });
  }
});
export type Verdict = z.infer<typeof Verdict>;

/** A new UAT verdict. Legacy/non-UAT verdicts remain readable through Verdict. */
export const CriterionVerdict = Verdict.superRefine((value, ctx) => {
  if (value.criterionId === undefined || value.revisionId === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["criterionId"],
      message: "criterion verdicts require the exact criterionId and revisionId",
    });
  }
});
export type CriterionVerdict = z.infer<typeof CriterionVerdict>;

/**
 * The persisted signed-proof event row (ADR-0017 event store). The durable record of a
 * verdict; `verdictRef` optionally points at the full {@link Verdict} doc.
 */
export const SigningRow = z
  .object({
    id: z.string(),
    unitId: z.string(),
    proofMode: ProofMode,
    outcome: Outcome,
    commitSha: z.string(),
    signer: z.string(),
    at: z.string(),
    verdictRef: z.string().optional(),
  })
  .strict();
export type SigningRow = z.infer<typeof SigningRow>;
