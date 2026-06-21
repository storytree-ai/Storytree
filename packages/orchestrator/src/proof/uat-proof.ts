import type { Status, Verdict } from "@storytree/proof-protocol";
import type { UatTestWitness } from "@storytree/library";

import { rollupStatus, type RollupEvent } from "./rollup.js";

/**
 * The per-test UAT proof COMPUTE (ADR-0082): a story's UAT decomposes into per-test units
 * (`@storytree/library` `uat-tests.ts`, ADR-0044), and each test earns a SIGNED VERDICT by its
 * declared witness — `machine` by a machine proof, `human` by an `operator-attested` verdict
 * (ADR-0007) signed by a real person, `either` by whichever is produced. The story's own UAT then
 * greens when ALL its tests are green.
 *
 * Two halves, deliberately split by stage (ADR-0082 d.5):
 *  - {@link checkUatProof} runs at SIGN time on the write surface — the trust guard that keeps
 *    "green" honest (no agent self-attests a human test; no human click greens a machine test).
 *  - {@link rollupStoryUat} runs at READ time — it only DERIVES the story-UAT status from the
 *    already-signed per-test verdicts, exactly as {@link rollupStatus} derives a single unit's.
 *
 * The DATA shapes it reads ({@link Verdict}, {@link Status}, {@link UatTestWitness}) are the verdict
 * CONTRACT's / the library's; this is the COMPUTE half (the farmer organism's ruler, ADR-0068).
 */

/** The fields of a verdict the trust guard inspects. */
export interface UatProofCheck {
  /** The test's declared witness permission (`human` | `machine` | `either`). */
  witness: UatTestWitness;
  /** The verdict offered to prove the test — only the fields the guard reads. */
  verdict: Pick<Verdict, "proofMode" | "signer">;
  /**
   * The building agent's resolved run identity (the wisp). A human-witness verdict may never be
   * self-signed by it. Optional: a `sandbox:` signer is rejected regardless, so omitting this is
   * still fail-closed against the agent's own run identity convention.
   */
  agentIdentity?: string;
}

/** The guard's verdict: legitimate, or refused with a reason. */
export type UatProofResult = { ok: true } | { ok: false; reason: string };

/**
 * SIGN-TIME guard (ADR-0082 d.2): is this verdict a LEGITIMATE proof of a UAT test with the given
 * declared witness? Pure — the write surface calls it before it signs.
 *
 * - `human`: the verdict MUST be `operator-attested` AND signed by a NON-agent identity — never a
 *   `sandbox:` run identity, never the building agent itself (ADR-0007 *an agent can never
 *   self-exempt*).
 * - `machine`: the verdict must NOT be `operator-attested` — a human click cannot stand in for a
 *   machine proof (ADR-0044 §5 trust calibration).
 * - `either`: a machine proof passes as-is; an `operator-attested` verdict must still clear the
 *   human guard.
 */
export function checkUatProof({
  witness,
  verdict,
  agentIdentity,
}: UatProofCheck): UatProofResult {
  const signer = verdict.signer.trim();
  const operatorAttested = verdict.proofMode === "operator-attested";

  // A human attestation must be a real operator attestation, signed by a non-agent human identity.
  const humanGuard = (): UatProofResult => {
    if (!operatorAttested) {
      return {
        ok: false,
        reason: `a human-witness UAT test must be proven 'operator-attested', not '${verdict.proofMode}'`,
      };
    }
    if (signer.length === 0) {
      return { ok: false, reason: "operator attestation has no signer (fail-closed)" };
    }
    if (signer.startsWith("sandbox:")) {
      return {
        ok: false,
        reason: `an agent identity ('${signer}') can never self-attest a human-witness UAT test (ADR-0007 no-self-exempt)`,
      };
    }
    if (agentIdentity !== undefined && signer === agentIdentity.trim()) {
      return {
        ok: false,
        reason: "the building agent can never self-attest its own UAT test (ADR-0007 no-self-exempt)",
      };
    }
    return { ok: true };
  };

  switch (witness) {
    case "human":
      return humanGuard();
    case "machine":
      return operatorAttested
        ? {
            ok: false,
            reason:
              "a machine-witness UAT test cannot be greened by operator attestation; run the machine proof",
          }
        : { ok: true };
    case "either":
      return operatorAttested ? humanGuard() : { ok: true };
  }
}

/**
 * READ-TIME roll-up (ADR-0082 d.3): a story's OWN UAT status, DERIVED from its per-test UAT verdicts.
 * Pure — the AND over each test's {@link rollupStatus}:
 *  - `healthy` iff EVERY declared test is `healthy`;
 *  - `unhealthy` if ANY test has a signed `fail` (it withers — short-circuits);
 *  - otherwise `null` (abstain) so the world under-claims, never over-claims.
 *
 * An empty list returns `null` (nothing declared to prove). This is the STORY-grained roll-up over
 * a story's own decomposed UAT only; it is NOT the forbidden child-capability roll-up (ADR-0040 §2 /
 * ADR-0044 §3) — six green plants still do not make a green crown.
 */
export function rollupStoryUat(
  tests: readonly { readonly id: string }[],
  events: readonly RollupEvent[],
): Status | null {
  if (tests.length === 0) return null;
  let allHealthy = true;
  for (const t of tests) {
    const status = rollupStatus(t.id, events);
    if (status === "unhealthy") return "unhealthy";
    if (status !== "healthy") allHealthy = false;
  }
  return allHealthy ? "healthy" : null;
}

/**
 * READ-TIME story-green roll-up (ADR-0083 Fork A): a story's CROWN status, DERIVED as the AND of two
 * necessary clauses — (a) the **capability clause**: EVERY declared capability is proven `healthy`
 * (its own {@link rollupStatus} over the signed verdicts); and (b) the **UAT clause**: the story's
 * own per-test UAT roll-up ({@link rollupStoryUat}) is `healthy`. This makes capabilities-green a
 * NECESSARY condition for the crown, reconciling it with the glossary's standing dependency rule —
 * *"you cannot prove a unit that stands on an unproven one"* — and refining ADR-0040 §2 / ADR-0082's
 * *"only the story's own UAT greens it"*: six green plants still are not SUFFICIENT (the UAT clause
 * must also hold), but a crown can never be `healthy` while any plant is red or unproven.
 *
 * Pure, conservative, never over-claims:
 *  - `healthy` iff the capability clause holds AND the UAT clause is `healthy`;
 *  - `unhealthy` if the UAT clause withered (a signed UAT regression) OR any capability is `unhealthy`
 *    (a red plant withers the crown — short-circuits);
 *  - otherwise `null` (abstain) — e.g. a capability still unproven (`mapped`), or no per-test UAT
 *    declared — so the world under-claims to `mapped`, never paints a green crown the proof can't bear.
 *
 * A story with ZERO capabilities (the two foundational ports `proof-protocol` / `storage-protocol`)
 * satisfies the capability clause VACUOUSLY — its green derives entirely from the per-test UAT clause.
 */
export function rollupStoryGreen(
  capabilityIds: readonly string[],
  tests: readonly { readonly id: string }[],
  events: readonly RollupEvent[],
): Status | null {
  const uat = rollupStoryUat(tests, events);
  if (uat === "unhealthy") return "unhealthy";

  let capsAllHealthy = true;
  for (const capId of capabilityIds) {
    const status = rollupStatus(capId, events);
    if (status === "unhealthy") return "unhealthy"; // a red plant withers the crown
    if (status !== "healthy") capsAllHealthy = false;
  }

  return capsAllHealthy && uat === "healthy" ? "healthy" : null;
}
