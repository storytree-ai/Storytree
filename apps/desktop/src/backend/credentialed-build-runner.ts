/**
 * The credentialed build runner — CredentialBridge wired into the sidecar's build invocation
 * path (ADR-0109 Step 2 as redefined by ADR-0113 §5; the desktop story's
 * local-credential-wiring glue).
 *
 * The SDK leaf's auth is AMBIENT — `nodeBuild`/`storyBuild` take no env; the leaf reads
 * `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` from the process environment — so "feed the
 * brokered credential to the build drivers" means: make the keychain token ambient for exactly
 * the duration of one build, then scrub it back out. The bridge's DriverFn seam does the
 * application; this module composes it around the routed {@link BuildRunner}.
 *
 * Precedence (the drive secrets.ts posture): an env var the operator EXPLICITLY set wins and
 * is never overridden; then the keychain via the bridge (oauth preferred — the subscription
 * path the desktop exists for — else the metered api-key); then whatever the secrets file
 * hydrated stays in place. With no credential on any tier the bridge REJECTS typed and the
 * build never reaches the SDK — an honest not-signed-in failure, never an empty token.
 *
 * Renderer safety (ADR-0109 d.4): the token is read in the main-owned sidecar, injected only
 * into the ambient env, never returned, never written to a sink line — no renderer-reachable
 * surface (the /api/* HTTP routes, the run transcript) ever carries it.
 */

import type { BuildEnvelope, BuildRunner } from "@storytree/drive/build-worker";

import type { CredentialBroker } from "../credential/broker.js";
import type { CredentialKind } from "../credential/kinds.js";
import { CREDENTIAL_ENV_VAR, CREDENTIAL_KINDS } from "../credential/kinds.js";
import { CredentialBridge } from "./credential-bridge.js";

export interface CredentialedBuildRunnerOpts {
  /** The keychain-backed broker (the ADR-0109 Step-1 core). */
  broker: CredentialBroker;
  /** The base runner the credential is fed to (the routed nodeBuild/storyBuild worker). */
  runner: BuildRunner;
  /** The ambient env the SDK leaf reads. Injected for offline tests; defaults to process.env. */
  env?: Record<string, string | undefined>;
  /**
   * Credential env var NAMES the operator EXPLICITLY set before any hydration ran — recorded
   * by the caller BEFORE `loadLocalSecrets()` fills the file tier, so "explicit env wins" can
   * be told apart from "the secrets file filled it". Absent = nothing was explicit.
   */
  explicitEnvVars?: ReadonlySet<string>;
}

/** True when `env[name]` carries a non-blank value (the secrets.ts notion of "set"). */
function isSet(env: Record<string, string | undefined>, name: string): boolean {
  return (env[name] ?? "").trim() !== "";
}

/**
 * Wrap a {@link BuildRunner} so every build runs under the resolved credential:
 * explicit env > keychain (via {@link CredentialBridge}) > secrets-file-hydrated env.
 */
export function credentialedBuildRunner(opts: CredentialedBuildRunnerOpts): BuildRunner {
  const env = opts.env ?? (process.env as Record<string, string | undefined>);
  const explicit = opts.explicitEnvVars ?? new Set<string>();

  return async (unitId, sink) => {
    // Tier 1 — explicit env wins: the operator set a credential; the keychain never overrides it.
    if (CREDENTIAL_KINDS.some((k) => explicit.has(CREDENTIAL_ENV_VAR[k]))) {
      return opts.runner(unitId, sink);
    }

    // Tier 2 — the keychain, kind-picked fresh PER BUILD (sign-in after launch just works;
    // sign-out fails the next build closed). Oauth preferred over the metered key.
    let kind: CredentialKind | null = null;
    for (const k of CREDENTIAL_KINDS) {
      if ((await opts.broker.read(k)) !== null) {
        kind = k;
        break;
      }
    }

    if (kind === null) {
      // Tier 3 — the secrets-file tier: loadLocalSecrets already hydrated the ambient env.
      if (CREDENTIAL_KINDS.some((k) => isSet(env, CREDENTIAL_ENV_VAR[k]))) {
        return opts.runner(unitId, sink);
      }
      // No credential anywhere: route through the bridge so its typed fail-closed rejection
      // surfaces (the driver — and so the SDK — is never invoked without a token).
      kind = "oauth";
    }

    // The bridge applies the credential through its DriverFn seam: inject into the ambient
    // env, run the base runner, scrub in finally — no long-lived raw token parked in env.
    // BridgeResult carries only {ok, body}, so the driver captures the full envelope
    // (incl. `next`) and the wrapper returns that.
    let captured: BuildEnvelope | null = null;
    const bridge = new CredentialBridge(opts.broker, async (id, credentialEnv, driverSink) => {
      const saved = new Map<string, string | undefined>();
      for (const [name, value] of Object.entries(credentialEnv)) {
        saved.set(name, env[name]);
        env[name] = value;
      }
      try {
        const envelope = await opts.runner(id, driverSink);
        captured = envelope;
        return { ok: envelope.ok, body: envelope.body };
      } finally {
        for (const [name, value] of saved) {
          if (value === undefined) delete env[name];
          else env[name] = value;
        }
      }
    });

    const result = await bridge.build(unitId, kind, sink);
    return captured !== null ? captured : result;
  };
}
