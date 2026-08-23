/**
 * The credentialed build runner — CredentialBridge wired into the sidecar's build invocation
 * path (ADR-0109 Step 2 as redefined by ADR-0113 §5; the desktop story's
 * local-credential-wiring glue).
 *
 * The SDK leaf's auth is AMBIENT — `nodeBuild`/`storyBuild` take no env; the leaf reads
 * `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` from the process environment — so "feed the
 * brokered credential to the build drivers" means: make the keychain token ambient for exactly
 * the duration of one build, then scrub it back out. The bridge's DriverFn seam does the
 * application; this module composes it around an injected {@link BuildRunner}.
 *
 * NOTHING COMPOSES IT TODAY, and that is worth saying rather than leaving to a grep. The runner it
 * was written to wrap was the studio/desktop dispatch worker, retired as a surface by ADR-0404 and
 * deleted as code by ADR-0422 — which is also why the {@link BuildRunner} shape below is declared
 * here now instead of imported from `@storytree/drive/build-worker`. The module survives because
 * `stories/desktop/credential-broker.md` declares `credentialed-build-runner.test.ts` in the
 * `coverage.testGlobs` of the live capability `credential-broker`: the credential precedence this
 * encodes is proven behaviour, held for whatever next drives a build from inside the app. ADR-0422
 * deliberately did NOT adjudicate that — it is a `credential-broker` question, not a consequence of
 * deleting the worker.
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

import type { CredentialBroker } from "../credential/broker.js";
import type { CredentialKind } from "../credential/kinds.js";
import { CREDENTIAL_ENV_VAR } from "../credential/kinds.js";
import { CredentialBridge } from "./credential-bridge.js";

// ── The runner shape this module wraps ───────────────────────────────────────────────────────────
//
// These three declarations used to live in `@storytree/drive/build-worker` and were imported from
// there. ADR-0422 deleted that module: the dispatch machinery it held (`BuildRegistry`,
// `runBuildJob`, `routedBuildRunner`, `adoptRunnerFromAdoptStory`) served the in-app Build/Adopt
// surfaces ADR-0404 retired, and had no production consumer left. These types were the only part of
// it anything still read, so they re-home beside their one reader rather than keeping a package
// subpath, a manifest binding and a capability alive to host fifteen lines.
//
// They stay STRUCTURAL, exactly as they were: a runner is a plain function, not a class to
// implement, so the caller composing one (today: nobody — see the module header) needs no import
// from here either.

/** Which leaf runtime a build runs on — the Claude Agent SDK by default, Codex opt-in (ADR-0232). */
export type BuildRuntime = "claude" | "codex";

/**
 * A build's terminal result. Structurally the CLI's `Envelope` narrowed to what a runner returns,
 * declared locally so this module needs no import of the build entry's full module.
 */
export interface BuildEnvelope {
  ok: boolean;
  body: string;
  /** `readonly` to match the CLI's `Envelope.next` so the real envelope is assignable without a cast. */
  next?: readonly string[];
}

/**
 * Drives one build. `sink` receives COARSE progress lines as the build emits them. Resolves with the
 * final {@link BuildEnvelope}; a thrown error is treated as a failed build.
 */
export type BuildRunner = (
  unitId: string,
  sink: (line: string) => void,
  runtime?: BuildRuntime,
) => Promise<BuildEnvelope>;

type ClaudeCredentialKind = Extract<CredentialKind, "oauth" | "api-key">;
const CLAUDE_CREDENTIAL_KINDS: readonly ClaudeCredentialKind[] = ["oauth", "api-key"];

export interface CredentialedBuildRunnerOpts {
  /** The keychain-backed broker (the ADR-0109 Step-1 core). */
  broker: CredentialBroker;
  /** The base runner the credential is fed to (a nodeBuild/storyBuild-backed driver). */
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

  return async (unitId, sink, runtime = "claude") => {
    // Codex authenticates through the official CLI's saved ChatGPT login. It neither needs nor may
    // be rejected by the Claude keychain bridge; the caller passes `runtime: codex` straight through
    // to the node/story build entries, whose Codex author invokes that supported path.
    if (runtime === "codex") {
      return opts.runner(unitId, sink, runtime);
    }

    // Tier 1 — explicit env wins: the operator set a credential; the keychain never overrides it.
    if (CLAUDE_CREDENTIAL_KINDS.some((k) => explicit.has(CREDENTIAL_ENV_VAR[k]))) {
      return opts.runner(unitId, sink, runtime);
    }

    // Tier 2 — the keychain, kind-picked fresh PER BUILD (sign-in after launch just works;
    // sign-out fails the next build closed). Oauth preferred over the metered key.
    let kind: ClaudeCredentialKind | null = null;
    for (const k of CLAUDE_CREDENTIAL_KINDS) {
      if ((await opts.broker.read(k)) !== null) {
        kind = k;
        break;
      }
    }

    if (kind === null) {
      // Tier 3 — the secrets-file tier: loadLocalSecrets already hydrated the ambient env.
      if (CLAUDE_CREDENTIAL_KINDS.some((k) => isSet(env, CREDENTIAL_ENV_VAR[k]))) {
        return opts.runner(unitId, sink, runtime);
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
    const bridge = new CredentialBridge(opts.broker, async (id, _credentialEnv, driverSink) => {
      const envelope = await opts.runner(id, driverSink, runtime);
      captured = envelope;
      return { ok: envelope.ok, body: envelope.body };
    }, env);

    const result = await bridge.build(unitId, kind, sink);
    return captured !== null ? captured : result;
  };
}
