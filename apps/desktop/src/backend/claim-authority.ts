/**
 * The desktop app as the RESIDENT CLAIM AUTHORITY for Codex sessions (ADR-0375 D1).
 *
 * ## What this is for
 *
 * Under ADR-0364 the managed Codex hook is the ONLY fence: the OS profile grants the whole worktrees
 * area, and which worktree a session may write in is decided by a LIVE claim re-read on every covered
 * tool call. That read used to spawn a probe which built a Cloud SQL connector from scratch each time
 * — measured at 18,976 ms and 48,192 ms against a 30 s budget, so the same legitimate write was
 * refused on one run and admitted on the next. The desktop backend is already a long-lived operator
 * process, so hosting the broker here makes that read a warm loopback call.
 *
 * ## Why this is a composer and not four lines in `backend-entry.ts`
 *
 * Two properties have to be provable, and neither is provable from the sidecar's own startup (which
 * has no test — it is operator-attested glue):
 *
 * 1. **The pool is the claim-writer's, never the desktop's.** The backend already holds
 *    `createPool()` with no arguments — its FULL library identity. A broker riding that pool would
 *    work perfectly, pass every functional test, and quietly undo the narrow-credential property the
 *    whole arc was sequenced to establish. The failure is silent, so the assertion is on the OPTIONS
 *    passed to `createPool`, not on any behaviour.
 * 2. **A failure here never takes the desktop down.** It degrades quiet, following the
 *    `buildInspectDeps` precedent in `backend-entry.ts`: a typed ok/error result, never a throw.
 */

// The `/resident` subpath, NOT the barrel: this is the one module that opens a Cloud SQL pool, and
// it is kept off the barrel so the sandboxed lobby bootstrap — which dials the broker's CLIENT —
// cannot ship the connector transitively. Importing it by name is the point.
import {
  startResidentClaimBroker,
  type ResidentBrokerConstruction,
  type ResidentClaimBroker,
} from "@storytree/notice-board/codex-broker/resident";

/**
 * The opt-in. Hosting the authority opens a SECOND Cloud SQL pool and an impersonation of the scoped
 * claim-writer service account, and publishes an ACL'd handshake — machinery that is meaningful only
 * on a host running the Codex containment boundary.
 *
 * It is off by default deliberately. An ordinary member running the desktop app holds no
 * impersonation grant on that account, so an unconditional attempt would open a connector, fail, and
 * log a credential error on every launch for everyone who is not running the Codex factory. Opt-in
 * keeps the default launch path exactly as it was.
 */
export const CLAIM_AUTHORITY_ENV = "STORYTREE_CODEX_CLAIM_AUTHORITY";

export type ClaimAuthorityComposition =
  | { readonly ok: true; readonly broker: ResidentClaimBroker }
  | { readonly ok: false; readonly error: string }
  /** Not an error: the operator did not ask for it. Distinguished so the log can say which. */
  | { readonly ok: false; readonly disabled: true; readonly error: string };

function enabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env[CLAIM_AUTHORITY_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Compose the resident claim authority for this desktop backend, or say why not.
 *
 * NEVER THROWS. Every failure — no opt-in, no credential, a handshake this process cannot scope, a
 * port it cannot bind — comes back as a typed refusal the caller logs before carrying on without it.
 * The Codex fence fails closed on its own when the authority is absent (the hook refuses every
 * covered write and names this process as the reason), so an absent authority is a Codex-lifecycle
 * outage and never a desktop outage.
 */
export async function startDesktopClaimAuthority(
  host: {
    readonly env: NodeJS.ProcessEnv;
    readonly cwd: string;
    readonly log: (line: string) => void;
  },
  construction?: ResidentBrokerConstruction,
): Promise<ClaimAuthorityComposition> {
  if (!enabled(host.env)) {
    return {
      ok: false,
      disabled: true,
      error: `not hosting the Codex claim authority — set ${CLAIM_AUTHORITY_ENV}=1 to enable it`,
    };
  }
  try {
    const broker = await startResidentClaimBroker(
      { env: host.env, cwd: host.cwd, log: host.log },
      construction ?? {},
    );
    return { ok: true, broker };
  } catch (error) {
    return {
      ok: false,
      error: `could not host the Codex claim authority: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
