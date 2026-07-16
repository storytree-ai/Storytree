// Claim-gate check (ADR-0200 D3), wired into `pnpm gate` — NOT into CI.
//
// ADR-0142 made `noticeboard declare --node` take the work-time story claim (the wisp), and
// ADR-0200 made the notice board the claim LEDGER: a session is born claimed (`worktree create`,
// D3) or claims deliberately (`noticeboard claim` / `declare --node`). This check is the gate-side
// enforcement of that ceremony — the rung moved from advisory (the ADR-0143 WARN on a missing
// presence declaration) to ENFORCING: a session that holds NO live claim FAILS the gate
// (ADR-0200 D3: an unclaimed session cannot reach the merge ceremony). Any grade counts —
// an `exploring` birth claim and a `work` declare claim both pass. The SKIP arms stay exit-0
// (CI is DB-free and MUST stay green):
//
//   - not a .claude/worktrees/* session (CI, main checkout, build worktree) -> SKIP silently.
//   - no DB creds / DB unreachable / timeout / unexpected error             -> SKIP.
//   - session holds >= 1 live claim (any grade)                             -> OK.
//   - session holds ZERO live claims                                        -> FAIL (exit 1),
//     naming the claim ceremony.
//
// Read-only against the ledger; only the zero-claims arm sets a non-zero exit code.

import { pathToFileURL } from "node:url";

import { deriveIdentity } from "@storytree/drive";
import { createPool, closePool } from "@storytree/library/store";
import { PgClaimStore } from "@storytree/notice-board/store";

import { loadLocalSecrets } from "./secrets.js";

const TAG = "[check:declared]";
/** Bound the live read so a stopped DB can't hang the gate (> the ~6s Cloud SQL cold handshake). */
const LIVE_READ_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * PURE: the claim-gate decision (ADR-0200 D3). "ok" while the session holds >= 1 live claim of ANY
 * grade — a `worktree create` exploring claim and a `declare --node` work claim both pass (an
 * absent grade IS the work claim, ADR-0200 D2 back-compat) — "fail" on zero claims, with guidance
 * that names the claim ceremony. The SKIP arms (offline, no creds, not a session worktree) are I/O
 * conditions and live in main(), not here.
 */
export function evaluateDeclared(input: {
  sessionId: string;
  claims: readonly { unitId: string; grade?: string }[];
}): { verdict: "ok" | "fail"; message: string } {
  if (input.claims.length > 0) {
    const held = input.claims.map((c) => `${c.unitId} (${c.grade ?? "work"})`).join(", ");
    return {
      verdict: "ok",
      message: `${TAG} OK — session "${input.sessionId}" holds ${input.claims.length} live claim(s): ${held}.`,
    };
  }
  return {
    verdict: "fail",
    message:
      `${TAG} FAIL — session "${input.sessionId}" holds NO live claim: an unclaimed session cannot reach ` +
      "the merge ceremony (ADR-0200 D3). Claim your unit: " +
      'pnpm storytree noticeboard claim <story-id> --grade exploring --intent "<why>" --pg, or anchor with ' +
      'pnpm storytree noticeboard declare --working-on "<what>" --node <story-id> --pg, or be born claimed via ' +
      'pnpm storytree worktree create --node <story-id> --intent "<what>" --pg.',
  };
}

async function main(): Promise<void> {
  const identity = deriveIdentity();
  if (identity === null) return; // not a session worktree — nothing to claim against, stay silent

  loadLocalSecrets();
  if (process.env["STORYTREE_DB_USER"] === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); claim unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const claims = new PgClaimStore(handle.pool);
    const own = await withTimeout(
      claims.claimsBySession(identity.sessionId),
      LIVE_READ_TIMEOUT_MS,
      "live read",
    );
    const decision = evaluateDeclared({ sessionId: identity.sessionId, claims: own });
    if (decision.verdict === "ok") {
      console.log(decision.message);
    } else {
      console.error(decision.message);
      process.exitCode = 1;
    }
  } catch (err) {
    console.log(
      `${TAG} SKIP — live DB not reachable (${(err as Error).message}); claim unverified, offline gate unaffected.`,
    );
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }
}

// Run only as an entrypoint — the test imports evaluateDeclared without triggering the live read.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    // An UNEXPECTED error is still a SKIP, never a red gate — CI and offline sessions are DB-free.
    console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); claim unverified.`);
  });
}
