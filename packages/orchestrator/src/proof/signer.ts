/**
 * The fail-closed signer-identity chain (ported from
 * legacy/Agentic/crates/agentic-signer/src/lib.rs — ADR-0020 §4).
 *
 * MOVED here from `@storytree/core` (ADR-0068 step 1): signing is the farmer organism's COMPUTE —
 * it constructs the identity a verdict is attributed to — so it lives with the gate that signs, not
 * in the schema package. A verdict must be attributed to a resolved identity. The chain walks, in
 * strict order, flag -> env -> git email, returning the FIRST value that survives trimming. There is
 * NO default fallback (no "unknown", no unix user, no hostname): if every tier is empty the
 * resolution FAILS CLOSED. The core resolver is pure so the whole chain is table-testable.
 *
 * Validation rule: trimmed length > 0. No email-shape regex, no length cap, no character
 * whitelist — the sandbox convention `sandbox:<model>@<run_id>` must pass.
 *
 * PURE by construction: this file carries NO `node:` import. The impure env/git tier
 * (`resolveSignerFromEnv`) lives in `signer-env.ts`; both are re-exported through the
 * `@storytree/orchestrator` barrel.
 */

/** The resolver inputs, one per tier. A missing tier is `undefined`; an empty/blank value falls through. */
export interface SignerInputs {
  flag?: string;
  env?: string;
  gitEmail?: string;
}

/** The result of resolving a signer: either a non-empty identity or a clear error. */
export type SignerResult =
  | { ok: true; signer: string }
  | { ok: false; error: string };

/**
 * PURE signer resolution. Walks flag -> env -> gitEmail; at EACH tier a value that trims to
 * length 0 falls through to the next tier (it does not error — "present but blank" is treated
 * as "absent" here, deliberately simpler than the legacy SignerInvalid distinction so the
 * chain never wedges on a stray empty env var). If all tiers are empty, fails closed.
 */
export function resolveSigner(inputs: SignerInputs): SignerResult {
  const tiers: ReadonlyArray<readonly [string, string | undefined]> = [
    ["flag", inputs.flag],
    ["env", inputs.env],
    ["gitEmail", inputs.gitEmail],
  ];
  for (const [, value] of tiers) {
    if (value !== undefined && value.trim().length > 0) {
      return { ok: true, signer: value.trim() };
    }
  }
  return {
    ok: false,
    error:
      "signer could not be resolved; consulted sources: flag, env (STORYTREE_SIGNER), gitEmail (git config user.email). No default fallback (fail-closed).",
  };
}
