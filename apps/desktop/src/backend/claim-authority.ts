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
 *
 * ## Why hosting is SELF-DETECTED (ADR-0379, amending ADR-0375 D9)
 *
 * A third property joined them: **installing the boundary is the only action that turns hosting on.**
 * D9 gated hosting on an environment variable, which made the boundary a two-step install where the
 * second step was a human remembering — and forgetting it is silent, because the fence then fails
 * closed and refuses every covered write with no statement of why. The gate is now the presence of an
 * installed standing policy, which is the same artifact that tells the hook where the handshake is.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

// The `/resident` subpath, NOT the barrel: this is the one module that opens a Cloud SQL pool, and
// it is kept off the barrel so the sandboxed lobby bootstrap — which dials the broker's CLIENT —
// cannot ship the connector transitively. Importing it by name is the point.
import {
  startResidentClaimBroker,
  type ResidentBrokerConstruction,
  type ResidentClaimBroker,
} from "@storytree/notice-board/codex-broker/resident";

/**
 * The OVERRIDE, no longer the gate.
 *
 * Hosting opens a SECOND Cloud SQL pool, impersonates the scoped claim-writer service account, and
 * publishes an ACL'd handshake — machinery meaningful only on a host running the Codex containment
 * boundary. ADR-0375 D9 kept that off an ordinary member's launch path by requiring this variable,
 * because a member holds no impersonation grant and an unconditional attempt would open a connector,
 * fail, and log a credential error on every launch.
 *
 * That reasoning was right and the discriminator was wrong. The question worth answering is *is the
 * Codex boundary installed on this host* — a property of the machine, directly observable. The
 * variable asked *did a human remember* instead, and the two coincide only until someone forgets. The
 * forgetting is silent: the fence fails closed, Codex cannot write, and nothing says why. So the gate
 * is now `standingPolicyInstalled` and this variable survives only to FORCE either answer.
 */
export const CLAIM_AUTHORITY_ENV = "STORYTREE_CODEX_CLAIM_AUTHORITY";

/**
 * Where the trusted actuator installs the standing policy it generates. The same directory the fence
 * re-measurement harness defaults to, and the same file the managed hook is handed on argv — so the
 * app is reading the very artifact whose presence defines "this host runs the boundary".
 */
export function standingPolicyDirectory(env: NodeJS.ProcessEnv): string {
  return join(env.PROGRAMDATA ?? "C:\\ProgramData", "OpenAI", "Codex", "Storytree", "sessions");
}

/**
 * The installed standing policies, or an empty list.
 *
 * NEVER THROWS, and every failure direction answers "none": a host with no `%ProgramData%` (any
 * non-Windows machine), no managed directory, or a directory this process cannot read is a host that
 * is not running the boundary, which is exactly the ordinary member ADR-0375 D9 set out to leave
 * alone. There is no failure here that should produce an ATTEMPT.
 */
function installedStandingPolicies(env: NodeJS.ProcessEnv): readonly string[] {
  try {
    return readdirSync(standingPolicyDirectory(env)).filter((name) =>
      /^standing-.*\.json$/i.test(name),
    );
  } catch {
    return [];
  }
}

/** Why this host is or is not hosting — carried so the log can say which, and never inferred. */
export type HostingDecision = {
  readonly host: boolean;
  readonly reason: string;
};

/**
 * Decide whether this desktop backend hosts the authority.
 *
 * Pure and separately tested, because the failure it guards is invisible at runtime: a gate that
 * silently answers "no" on a factory host produces a desktop that launches perfectly and a Codex that
 * cannot write a single file.
 *
 * An UNRECOGNISED value falls through to detection rather than reading as off. That direction is
 * deliberate: a typo'd override on a factory host would otherwise re-create the exact silent failure
 * this change exists to remove, and the reason string names the ignored value so it is not lost.
 */
export function decideHosting(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly standingPolicies: () => readonly string[];
}): HostingDecision {
  const raw = input.env[CLAIM_AUTHORITY_ENV]?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return { host: true, reason: `${CLAIM_AUTHORITY_ENV}=${raw} forced hosting on` };
  }
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return { host: false, reason: `${CLAIM_AUTHORITY_ENV}=${raw} forced hosting off` };
  }

  const policies = input.standingPolicies();
  const ignored = raw === undefined || raw === "" ? "" : ` (ignoring unrecognised ${CLAIM_AUTHORITY_ENV}=${raw})`;
  return policies.length > 0
    ? {
        host: true,
        reason: `the Codex containment boundary is installed on this host (${policies.join(", ")})${ignored}`,
      }
    : {
        host: false,
        reason:
          `no Codex containment boundary is installed on this host ` +
          `(no standing-*.json under ${standingPolicyDirectory(input.env)})${ignored}`,
      };
}

export type ClaimAuthorityComposition =
  | { readonly ok: true; readonly broker: ResidentClaimBroker }
  | { readonly ok: false; readonly error: string }
  /** Not an error: the operator did not ask for it. Distinguished so the log can say which. */
  | { readonly ok: false; readonly disabled: true; readonly error: string };

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
    /** Injected only by tests — production reads the real managed directory. */
    readonly standingPolicies?: () => readonly string[];
  },
  construction?: ResidentBrokerConstruction,
): Promise<ClaimAuthorityComposition> {
  const decision = decideHosting({
    env: host.env,
    standingPolicies: host.standingPolicies ?? (() => installedStandingPolicies(host.env)),
  });
  if (!decision.host) {
    return {
      ok: false,
      disabled: true,
      error: `not hosting the Codex claim authority — ${decision.reason}`,
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
