import { z } from "zod";
import { Status } from "./schema.js";

/**
 * The proof / verdict vocabulary (ADR-0007 + ADR-0020).
 *
 * A verdict is the signed observation a unit was proven (or not) at a commit, by a
 * resolved signer. Proof is a SIGNED EVENT, never an author-set status — see
 * {@link isProvenStatus} and the doc comment there (ADR-0020).
 */

/**
 * The proof modes (ADR-0007). `contract` / `capability` / `story` correspond to the
 * three tiers' automated ladders (isolated test / integration test / UAT); the fourth,
 * `operator-attested`, is the human-anchored, dogfood-only mode that attaches at the
 * story/capability level and can never be self-granted by an agent.
 */
export const ProofMode = z.enum([
  "contract",
  "capability",
  "story",
  "operator-attested",
]);
export type ProofMode = z.infer<typeof ProofMode>;

/** The binary outcome of a proof run. */
export const Outcome = z.enum(["pass", "fail"]);
export type Outcome = z.infer<typeof Outcome>;

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
 * A verdict: the prove-it-gate's output (ADR-0020 §4). Pinned to a commit SHA and a
 * resolved signer; the `runId` ties it to the owned-loop run that produced it.
 */
export const Verdict = z
  .object({
    unitId: z.string(),
    proofMode: ProofMode,
    outcome: Outcome,
    commitSha: z.string(),
    signer: z.string(),
    runId: z.string(),
    /**
     * ADR-0016 binding anchor: the content-hash (hashSpan) of the proved span at sign time — what lets a
     * verdict know WHICH code it proved, so drift is computable later. OPTIONAL for back-compat: verdicts
     * predating ADR-0016 (and every current caller until gate-emits-change wires it) carry none.
     */
    boundHash: z.string().optional(),
    evidence: z.array(EvidenceRef).default([]),
    at: z.string(),
  })
  .strict();
export type Verdict = z.infer<typeof Verdict>;

/**
 * The persisted signed-proof event row (ADR-0017 event store). This is the durable
 * record of a verdict; `verdictRef` optionally points at the full {@link Verdict} doc.
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

/**
 * Is this status the proven / `healthy` state?
 *
 * NOTE (ADR-0020): `healthy` is NON-AUTHORABLE. This predicate exists only to identify the
 * proven status; it does NOT grant it. Reaching `healthy` is possible ONLY through a signed
 * verdict event flowing through the prove-it-gate — enforcement lives in the gate and the
 * loader, never in the `Status` enum (which structurally cannot stop an author from typing
 * `healthy`). Treat author-supplied `healthy` as a value to reject, not honour.
 */
export function isProvenStatus(status: z.infer<typeof Status>): boolean {
  return status === "healthy";
}
