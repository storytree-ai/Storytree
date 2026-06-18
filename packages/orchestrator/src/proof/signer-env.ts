import { execFileSync } from "node:child_process";
import { resolveSigner, type SignerInputs, type SignerResult } from "./signer.js";

/**
 * The IMPURE tier of the fail-closed signer chain (ADR-0020 §4). MOVED here from `@storytree/core`
 * with the pure resolver (ADR-0068 step 1). Split from `signer.ts` so the pure {@link resolveSigner}
 * carries NO `node:` import; this thin wrapper reads `process.env` and shells out to git, then
 * delegates to the pure resolver. Re-exported through the `@storytree/orchestrator` barrel.
 */

/**
 * Thin IMPURE wrapper: reads `process.env.STORYTREE_SIGNER` and `git config user.email`
 * (tolerant of failure -> ''), then delegates to the pure {@link resolveSigner}.
 */
export function resolveSignerFromEnv(opts?: { flag?: string }): SignerResult {
  const inputs: SignerInputs = { gitEmail: readGitEmail() };
  const env = process.env.STORYTREE_SIGNER;
  if (env !== undefined) {
    inputs.env = env;
  }
  if (opts?.flag !== undefined) {
    inputs.flag = opts.flag;
  }
  return resolveSigner(inputs);
}

/** Read `git config user.email`, returning '' on any failure (no repo, unset, git missing). */
function readGitEmail(): string {
  try {
    return execFileSync("git", ["config", "user.email"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}
