/**
 * The pi LEAF (`pi-harness-admission-arc` increment 2): a third {@link PhaseAuthor} behind the
 * runtime-neutral seam, alongside {@link ClaudeAgentAuthor} and {@link CodexPhaseAuthor}.
 *
 * Increment 1 proved the FENCE — a `tool_call` handler that refuses an out-of-scope write, the
 * shell off the authoring tool surface AND refused by the handler, driven through pi's real
 * loader, runner and agent loop with no credential and no network (`pi-fence.ts`). This file is
 * the thing the fence fences. It still spends nothing: every assertion its test file makes runs
 * against a dead localhost port.
 *
 * ## THE CLAUSE WITH TEETH: NO PAID FALLBACK IS REACHABLE
 *
 * The arc's end state 2 — "an unreachable configured endpoint produces a REFUSAL, never a silent
 * reroute to a metered provider, asserted by a test, not by configuration discipline" — is
 * ADR-0177/ADR-0198's failure mode in sharper form. The Cursor leaf was retired because a
 * subscription-shaped path turned out to be metered API billing and the owner met surprise
 * charges. A harness aimed at open weights fails the same way from the other end: when the local
 * model is missing, slow or misconfigured, it falls back to a paid frontier endpoint, silently,
 * mid-run, looking like success.
 *
 * pi has that gun loaded, and this is not inference from its docs — it is what its shipped code
 * does:
 *
 *  - `createAgentSession()` with no explicit `model` calls `findInitialModel()`, which picks from
 *    settings and then from provider defaults (`dist/core/sdk.js`). Whatever is authenticated wins.
 *  - pi's built-in providers resolve API keys STRAIGHT OUT OF THE ENVIRONMENT — `ANTHROPIC_API_KEY`,
 *    `OPENAI_API_KEY` and ~40 more, in `pi-ai`'s own `env-api-keys.js`. An ambient key on the box
 *    is a live, billable provider inside the leaf's process.
 *
 * Five walls, in the order they fire, none of them configuration:
 *
 *  1. **A CONFIGURED ENDPOINT IS REQUIRED.** {@link validatePiEndpoint} refuses an absent endpoint,
 *     a non-http(s) URL, and a `providerId` that collides with a pi built-in. There is no default
 *     and no "first available".
 *  2. **THE ENVIRONMENT IS SCRUBBED** ({@link scrubMeteredPiAuth}) around the slice, and it is
 *     scrubbed on `process.env` ITSELF rather than passed as an override, because pi's
 *     `getProviderEnvValue(name, env)` reads `env?.[name] || process.env[name]` — an override
 *     cannot subtract, only add. This one is BEST-EFFORT by construction: the list is a copy of
 *     pi's table and a pi release that adds a provider adds a name we do not know.
 *  3. **THE PREFLIGHT IS THE WALL** ({@link decidePiPreflight}). BEFORE registering anything, the
 *     leaf asks pi's OWN runtime what is authenticated and refuses to run at all if the answer is
 *     not "nothing". This is what makes wall 2's staleness survivable: a metered provider the scrub
 *     missed does not open a fallback, it stops the slice, and the refusal names the provider so an
 *     operator can see what is set. The ORDER is load-bearing and was measured — after
 *     `registerProvider`, pi's answer to the same question is unstable, so a wall built on it
 *     reports a clean reading on a dirty box some of the time. See {@link decidePiPreflight}.
 *  4. **THE RESOLVED MODEL IS VERIFIED, NOT TRUSTED.** The session is created with an explicit
 *     `model`; the leaf then refuses on pi's own `modelFallbackMessage` and re-checks that
 *     `session.model` is provider-for-provider and id-for-id the one it asked for. A substitution
 *     is the reroute, so it is checked rather than assumed away.
 *  5. **A CREDENTIAL, IF ONE IS SUPPLIED AT ALL, MUST BE A SUBSCRIPTION TOKEN**
 *     ({@link validatePiCredential}, ADR-0449). The slot added for the arc's one real trial run
 *     accepts a Claude subscription OAuth token and REFUSES a metered per-token API key — not as
 *     policy, but because pi's own dispatch keys on the token's shape and would otherwise put the
 *     same string on the wire as `x-api-key`, which IS the metered call.
 *
 * ## THE CREDENTIAL SLOT (ADR-0449), AND THE WALL IT DID *NOT* NEED
 *
 * Increment 2 shipped this leaf with no credential field at all, and said so as a guarantee. ADR-0449
 * then decided the arc's one real trial run points at ANTHROPIC through the existing
 * subscription-funded `CLAUDE_CODE_OAUTH_TOKEN` — never a metered key, never a local model — which
 * authorises a slot. {@link PiEndpoint.apiKey} is it: an EXPLICIT value on the endpoint, never an
 * environment lookup, absent by default, and constrained by wall 5.
 *
 * ⚠ ADR-0449 ALSO PROJECTED THAT WALL 3 WOULD NEED A NAMED EXCEPTION. IT DOES NOT, AND THAT WAS
 * MEASURED RATHER THAN ARGUED. Wall 3 asks pi's own `ModelRuntime.getAvailable()` what is
 * authenticated, BEFORE registration, and excludes the configured endpoint's own id by construction.
 * pi resolves `anthropic` from `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`
 * (`pi-ai`'s `env-api-keys.js`) and from nothing else — `CLAUDE_CODE_OAUTH_TOKEN` is not among them,
 * and all three of the names that ARE have already been removed by wall 2 when wall 3 reads. Measured
 * on a fresh `ModelRuntime`, three runs of three, WITH the positive control that proves the reading is
 * not blind: `CLAUDE_CODE_OAUTH_TOKEN` alone → `[]`; `ANTHROPIC_API_KEY` alone → `[anthropic]`, 13
 * models. So the subscription token opens no ambient provider, wall 3 passes clean, and it is left
 * COMPLETELY UNEDITED — the general "refuse if any paid provider is reachable" guarantee is not merely
 * un-weakened, it is not touched. The deliberate loosening ADR-0449 authorised is real, but it lands
 * at the credential slot under wall 5, which is where it can be checked. `pi-author.test.ts` pins the
 * measurement WITH its control, so a pi release that starts reading `CLAUDE_CODE_OAUTH_TOKEN` reds
 * this rather than silently making wall 3 refuse every slice.
 *
 * ## FAILURE IS NOT A THROWN EXCEPTION, AND THAT IS THE TRAP
 *
 * Measured against pi 0.84.3 with the endpoint pointed at a closed port: `session.prompt()`
 * RESOLVES NORMALLY. The failure lands as `stopReason: "error"` with `errorMessage: "Connection
 * error."` on the last assistant message, after pi's own auto-retry. A leaf that reported success
 * on "no exception thrown" would report a green authoring slice for a run in which no model ever
 * answered — the silent half of the failure this increment exists to prevent. So
 * {@link classifyPiSliceOutcome} reads the terminal message state and fails closed on anything that
 * is not an observed clean stop, including no assistant message at all.
 *
 * ## THE COST GUARD (end state 5)
 *
 * pi documents no turn or spend ceiling, so the leaf imposes one via `Agent.shouldStopAfterTurn`
 * ({@link createPiTurnCeiling}) and reports exhaustion as `{ ok: false, exhausted: true }` — the
 * shape `AuthorResult` already expects, so the gate falls through to its OWN observation instead of
 * discarding work that may already be on disk. A ceiling is a COST GUARD, NEVER A PROOF SIGNAL
 * (ADR-0020): this leaf, like every other, never observes red/green and never reports a verdict.
 *
 * There is no USD ceiling and no field for one. The Codex leaf refuses a fake USD cap for the same
 * reason (ADR-0232): a dollar figure this runtime cannot meter is a phantom, and printing one would
 * invite exactly the false confidence ADR-0198 was written about.
 *
 * ## pi IS REACHED BY DYNAMIC IMPORT, AND THAT IS LOAD-BEARING
 *
 * pi is a devDependency of `@storytree/agent` and must stay one (`pi-containment.test.ts` clause 3:
 * a runtime dependency ships pi to every consumer). A static value import here would put pi's module
 * graph — and with it its credential store and provider clients — into the graph of anyone who
 * imports `@storytree/agent` at all. So the runtime handles are pulled with `await import(...)`
 * inside the slice: importing this module, or the barrel that re-exports it, loads no pi. pi
 * missing is then an ordinary REFUSAL rather than a module-resolution crash. The containment guard
 * asserts both halves.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AuthoringPhase, AuthorResult, PhaseAuthor } from "./phase-author.js";
import { PI_AUTHORING_TOOLS, PI_SHELL_TOOLS, createPiScopeFence } from "./pi-fence.js";
import type { PiFenceViolation } from "./pi-fence.js";
import type { TokenUsage } from "./model-events.js";

/**
 * pi's runtime module, referenced as a TYPE only. `typeof import(...)` is erased entirely, so this
 * names pi without linking it — the dynamic import in {@link loadPiRuntime} is the only thing that
 * ever loads it.
 */
type PiModule = typeof import("@earendil-works/pi-coding-agent");
type PiSession = Awaited<ReturnType<PiModule["createAgentSession"]>>["session"];
// Via `create`'s return, not `InstanceType`: pi's `ModelRuntime` constructor is private.
type PiModelRuntime = Awaited<ReturnType<PiModule["ModelRuntime"]["create"]>>;
type PiModel = NonNullable<PiSession["model"]>;

/** Default per-slice turn ceiling — the runaway brake, mirroring the SDK leaf's 16. */
const DEFAULT_PI_MAX_TURNS = 16;

/**
 * The placeholder pi is handed as the endpoint's API key.
 *
 * NOT A CREDENTIAL, and the distinction is the point. pi refuses to send a request at all when
 * neither an API key nor a header resolves (`AgentSession._getRequiredRequestAuth` throws
 * `formatNoApiKeyFoundMessage`), while the OpenAI-compatible servers this leaf exists to talk to —
 * llama.cpp, Ollama, LM Studio — ignore the value. So a fixed, public, meaningless string
 * satisfies pi's precondition without any secret existing.
 *
 * It remains the DEFAULT, and a slice that supplies no {@link PiEndpoint.apiKey} still runs on this
 * and nothing else — which is every local endpoint. There is nothing to rotate and nothing to leak:
 * sent to a metered provider, it is simply rejected.
 *
 * ⚠ WHAT CHANGED, AND WHAT DID NOT. This used to add "there is no way to point this leaf at a metered
 * provider by supplying a key", because there was no field to put one in — and that the question was
 * "the owner-gated decision in increment 3". That decision has been MADE (ADR-0449): the arc's one
 * real trial run points at Anthropic through the existing SUBSCRIPTION credential. So the field now
 * exists. The guarantee it carried is not surrendered, it is re-bought in the form a leaf that
 * carries a credential can satisfy — {@link validatePiCredential} refuses anything that is not a
 * subscription token, so "no metered call is reachable" survives as a checked refusal instead of an
 * absent field. End state 4 survives too: the value is passed in per slice by the caller and hydrated
 * from nowhere, so there is still nothing on this leaf for a different runtime to pick up.
 */
export const PI_LOCAL_PLACEHOLDER_KEY = "storytree-local-no-credential";

/**
 * The substring pi's OWN `anthropic-messages` adapter uses to recognise a Claude SUBSCRIPTION OAuth
 * token — `isOAuthToken(apiKey)` is `apiKey.includes("sk-ant-oat")` (`pi-ai`'s
 * `dist/api/anthropic-messages.js`, 0.84.3).
 *
 * TRANSCRIBED FROM pi RATHER THAN INVENTED, and that is what makes wall 5 a real check rather than a
 * guess about token strings. pi branches on this one predicate: matched, it builds its client with
 * `authToken` (an `Authorization: Bearer` header) plus the Claude Code identity betas, which is the
 * SUBSCRIPTION call; unmatched, it builds the same client with `apiKey`, which goes out as
 * `x-api-key` — the METERED call ADR-0449 forbids. So wall 5 is not asserting a naming convention, it
 * is asserting which of pi's two code paths this slice will take.
 *
 * BEST-EFFORT IN THE SAME WAY {@link PI_METERED_AUTH_ENV} IS: a hand-kept copy of someone else's
 * predicate goes stale if they change it. The consequence of staleness here is FAIL-CLOSED in the
 * safe direction — a subscription token pi stopped recognising is refused by wall 5 and the slice
 * does not run.
 */
export const PI_SUBSCRIPTION_TOKEN_MARKER = "sk-ant-oat";

/**
 * The only pi wire dialect a credential may be supplied under.
 *
 * {@link PI_SUBSCRIPTION_TOKEN_MARKER} is recognised ONLY by pi's `anthropic-messages` adapter. Under
 * any other dialect — `openai-completions`, the leaf's default, included — the identical string is
 * forwarded as an ordinary bearer key to whatever `baseUrl` is configured, with no subscription
 * semantics anywhere in the path. That is indistinguishable at the wire from the metered shape, so a
 * credential outside this dialect is refused rather than sent.
 */
export const PI_CREDENTIAL_API = "anthropic-messages";

/**
 * The wire dialect a {@link PiEndpoint} uses when it names none — pi's OpenAI-compatible adapter,
 * which is what a local llama.cpp / Ollama / LM Studio server speaks.
 *
 * NAMED ONCE BECAUSE IT WAS SPELLED THREE TIMES, and the mutation rung is what found that: the copy
 * inside wall 5's condition was behaviourally DEAD — any string that is not
 * {@link PI_CREDENTIAL_API} produces the same refusal, so mutating that copy to `""` changed nothing
 * a test could observe. Three literals where one belongs is also how the condition and the refusal
 * message drift apart, which would leave an operator reading a dialect name the check never used.
 */
export const PI_DEFAULT_API = "openai-completions";

/** Whether a credential is a Claude subscription OAuth token, by pi's own predicate. */
export function isPiSubscriptionToken(apiKey: string): boolean {
  return apiKey.includes(PI_SUBSCRIPTION_TOKEN_MARKER);
}

/**
 * What the leaf hands pi as the endpoint's API key: the configured credential, or the placeholder.
 *
 * PULLED OUT OF THE `registerProvider` CALL SO IT CAN BE ASSERTED. Buried inline it was a one-line
 * `??` that no offline test could reach — whether the slot's value actually arrives at pi would have
 * been observable only on the wire, i.e. only by spending. The interesting half is the DEGRADATION:
 * a credential that silently fell through to {@link PI_LOCAL_PLACEHOLDER_KEY} would run a slice
 * pointed at a REAL endpoint while looking exactly like a local one, which is the failure this leaf
 * exists to prevent, wearing a passing test.
 *
 * `??` and not `||` for that reason: `||` would treat a blank credential as absent and fall through.
 * Wall 5 refuses a blank one before this is ever reached, so the two agree — but they agree because
 * both are fail-closed, not because either is relying on the other.
 */
export function resolvePiCredential(endpoint: PiEndpoint): string {
  return endpoint.apiKey ?? PI_LOCAL_PLACEHOLDER_KEY;
}

/**
 * The metered-provider API-key environment variables removed from `process.env` for the duration of
 * a pi slice — a transcription of pi-ai's OWN provider→env table (`env-api-keys.js`), which is what
 * pi reads when it resolves a built-in provider's key.
 *
 * BEST-EFFORT, AND SAID SO. A hand-kept copy of someone else's table goes stale the day they add a
 * provider, and nothing here can detect that. It is defence in depth, never the guarantee — the
 * guarantee is {@link decidePiPreflight}, which asks pi what is actually authenticated and refuses
 * the whole slice rather than trusting this list to be complete.
 *
 * DELIBERATELY ABSENT: `GOOGLE_APPLICATION_CREDENTIALS` and the `AWS_*` family, which pi also
 * treats as auth (for google-vertex and amazon-bedrock). Those are AMBIENT IDENTITIES this repo
 * uses for other things — Cloud SQL runs on ADC (ADR-0021) — and deleting them out from under a
 * process that shares them is a worse hazard than the refusal they might cause. If one of those
 * providers is genuinely reachable, the preflight refuses the slice and names it, which is the
 * correct outcome: a paid provider IS reachable, and the operator should know rather than have the
 * leaf quietly steal the variable.
 */
export const PI_METERED_AUTH_ENV: readonly string[] = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "COPILOT_GITHUB_TOKEN",
  "ANT_LING_API_KEY",
  "QWEN_TOKEN_PLAN_API_KEY",
  "QWEN_TOKEN_PLAN_CN_API_KEY",
  "NVIDIA_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_CLOUD_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "XAI_API_KEY",
  "RADIUS_API_KEY",
  "OPENROUTER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "ZAI_API_KEY",
  "ZAI_CODING_CN_API_KEY",
  "MISTRAL_API_KEY",
  "MINIMAX_API_KEY",
  "MINIMAX_CN_API_KEY",
  "MOONSHOT_API_KEY",
  "HF_TOKEN",
  "FIREWORKS_API_KEY",
  "TOGETHER_API_KEY",
  "BASETEN_API_KEY",
  "OPENCODE_API_KEY",
  "KIMI_API_KEY",
  "CLOUDFLARE_API_KEY",
  "XIAOMI_API_KEY",
  "XIAOMI_TOKEN_PLAN_CN_API_KEY",
  "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
  "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
];

const METERED_AUTH_ENV_LOWER: ReadonlySet<string> = new Set(
  PI_METERED_AUTH_ENV.map((name) => name.toLowerCase()),
);

/**
 * Remove every case variant of the metered auth variables from an env record. PURE — the exact
 * shape `scrubMeteredCodexAuth` has, so the two leaves' scrubs read the same and are testable the
 * same way (`codex-author.ts`).
 */
export function scrubMeteredPiAuth(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name, value]) => value !== undefined && !METERED_AUTH_ENV_LOWER.has(name.toLowerCase()),
    ),
  );
}

/**
 * Apply the scrub to `process.env` and hand back the restore.
 *
 * IN-PROCESS MUTATION, and unavoidably so. The Codex leaf can pass a scrubbed env to a CHILD
 * PROCESS; pi is a library that runs in ours, and it reads the real environment directly:
 * `getProviderEnvValue(name, env)` is `env?.[name] || process.env[name] || …`, so a scrubbed
 * override cannot SUBTRACT a variable, only shadow one that is already absent.
 *
 * Narrow by construction: only the names in {@link PI_METERED_AUTH_ENV} are touched, only for the
 * duration of one slice, and the restore runs in a `finally`. It is not re-entrant, which is fine —
 * the spine runs authoring slices one at a time.
 */
export function scrubMeteredPiAuthEnv(env: NodeJS.ProcessEnv = process.env): () => void {
  const removed = new Map<string, string>();
  for (const name of Object.keys(env)) {
    if (!METERED_AUTH_ENV_LOWER.has(name.toLowerCase())) continue;
    const value = env[name];
    if (value === undefined) continue;
    removed.set(name, value);
    delete env[name];
  }
  return () => {
    for (const [name, value] of removed) {
      env[name] = value;
    }
  };
}

/**
 * The endpoint a pi slice is allowed to talk to. There is exactly one and it is explicit — including
 * its credential, if it has one at all ({@link PiEndpoint.apiKey}).
 */
export interface PiEndpoint {
  /**
   * The provider id this endpoint is registered under. Must NOT be one of pi's built-in provider
   * ids: re-registering `anthropic` or `openai` would compose over pi's own provider and inherit
   * its environment-variable auth resolution, which is the door this leaf exists to shut.
   */
  providerId: string;
  /** The endpoint's base URL. http/https only; a local server is the intended case. */
  baseUrl: string;
  /** The model id that endpoint serves. Resolved explicitly — never "first available". */
  modelId: string;
  /** Display name for the model. Defaults to {@link modelId}. */
  modelName?: string;
  /** pi's wire dialect for this endpoint. Default: `openai-completions`. */
  api?: string;
  /** The model's declared context window, in tokens. */
  contextWindow: number;
  /** The model's declared max output tokens. */
  maxTokens: number;
  /**
   * THE CREDENTIAL SLOT (ADR-0449). Absent by default — a local endpoint needs none, and gets
   * {@link PI_LOCAL_PLACEHOLDER_KEY} instead.
   *
   * AN EXPLICIT VALUE, NEVER AN ENVIRONMENT LOOKUP, and that is the whole shape of the field rather
   * than a note about how to use it. The metered fallback this leaf exists to make unreachable is
   * pi's built-in providers resolving keys straight out of `process.env`; a slot that did its own
   * `process.env[...]` read would rebuild that door one layer up, and would make the leaf's
   * credential depend on ambient state a caller cannot see. So the value is passed in per slice by
   * whoever composed the endpoint, and this file reads no variable to fill it.
   *
   * Constrained by wall 5 ({@link validatePiCredential}): a subscription OAuth token under
   * {@link PI_CREDENTIAL_API}, or nothing. A metered per-token API key is REFUSED.
   */
  apiKey?: string;
}

/**
 * pi's built-in provider ids as of 0.84.3 (`pi-ai`'s `KnownProvider`), every one of which resolves
 * an API key from the environment. A configured endpoint may not claim one of these names.
 *
 * A DENYLIST here rather than an allowlist, unusually, and for a reason: the set being guarded
 * against is pi's, not ours, so there is nothing to enumerate positively — any name NOT on this
 * list is a fresh provider id that composes over no built-in and inherits no auth. A pi release
 * that adds a provider we have not listed is caught one wall later, by the preflight, which asks pi
 * rather than a list.
 */
const PI_BUILTIN_PROVIDER_IDS: ReadonlySet<string> = new Set([
  "amazon-bedrock",
  "ant-ling",
  "anthropic",
  "google",
  "google-vertex",
  "openai",
  "azure-openai-responses",
  "openai-codex",
  "radius",
  "nvidia",
  "deepseek",
  "github-copilot",
  "xai",
  "groq",
  "cerebras",
  "openrouter",
  "vercel-ai-gateway",
  "zai",
  "zai-coding-cn",
  "mistral",
  "minimax",
  "minimax-cn",
  "moonshotai",
  "moonshotai-cn",
  "huggingface",
  "fireworks",
  "together",
  "baseten",
  "opencode",
  "opencode-go",
  "kimi-coding",
  "cloudflare-workers-ai",
  "cloudflare-ai-gateway",
  "qwen-token-plan",
  "qwen-token-plan-cn",
  "qwen-token-plan-individual",
  "xiaomi",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-sgp",
]);

/** The outcome of validating a configured endpoint. Pure; exported for offline tests. */
export type PiEndpointDecision =
  | { ok: true; endpoint: PiEndpoint }
  | { ok: false; error: string };

/**
 * Wall 1: the endpoint must be configured, explicit, and not a pi built-in. Fail-closed on every
 * branch — there is deliberately no default endpoint, because a default is how a leaf ends up
 * talking to whatever happened to be authenticated.
 */
export function validatePiEndpoint(endpoint: PiEndpoint | undefined): PiEndpointDecision {
  if (endpoint === undefined) {
    return {
      ok: false,
      error:
        "pi leaf refused: no endpoint configured. This leaf never picks a model — an unconfigured " +
        "slice is a refusal, never a fall-through to whatever provider happens to be authenticated.",
    };
  }
  if (PI_BUILTIN_PROVIDER_IDS.has(endpoint.providerId)) {
    return {
      ok: false,
      error:
        `pi leaf refused: providerId '${endpoint.providerId}' is a pi built-in. Registering over a ` +
        "built-in inherits its environment-variable API-key resolution, which is the metered " +
        "fallback this leaf exists to make unreachable (ADR-0198).",
    };
  }
  if (endpoint.providerId.trim().length === 0 || endpoint.modelId.trim().length === 0) {
    return { ok: false, error: "pi leaf refused: endpoint providerId and modelId are required" };
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint.baseUrl);
  } catch {
    return { ok: false, error: `pi leaf refused: baseUrl '${endpoint.baseUrl}' is not a URL` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: `pi leaf refused: baseUrl '${endpoint.baseUrl}' is not http(s)`,
    };
  }
  if (!Number.isInteger(endpoint.contextWindow) || endpoint.contextWindow <= 0) {
    return { ok: false, error: "pi leaf refused: endpoint contextWindow must be a positive integer" };
  }
  if (!Number.isInteger(endpoint.maxTokens) || endpoint.maxTokens <= 0) {
    return { ok: false, error: "pi leaf refused: endpoint maxTokens must be a positive integer" };
  }
  // Wall 5 last, and RETURNED DIRECTLY rather than branched on: it answers `{ ok: true, endpoint }`
  // for an acceptable credential, which is exactly this function's own success value. An
  // `if (!credential.ok) return credential;` ahead of a duplicate success return said the same thing
  // twice, and the mutation rung is what showed that up — negating the branch produced a mutant no
  // test could ever kill, because both arms were already identical.
  return validatePiCredential(endpoint);
}

/**
 * Wall 5: if a credential is supplied at all, it must be one that pi will spend as a SUBSCRIPTION
 * rather than meter (ADR-0449).
 *
 * Absent is the ordinary case and always passes — every local endpoint runs on
 * {@link PI_LOCAL_PLACEHOLDER_KEY} and nothing here applies to it.
 *
 * ⚠ WHY A CHECK AND NOT A COMMENT. ADR-0449 authorised exactly one thing: the arc's one real trial
 * run against Anthropic on the existing subscription credential, "never a metered per-token key". A
 * slot that accepted any string would leave that clause resting on whoever composes the endpoint
 * getting it right, for the rest of the leaf's life — which is precisely the shape ADR-0198 was
 * written about, where a path that LOOKED subscription-funded was metered billing and the owner met
 * the difference on an invoice. The distinction is mechanical on pi's side
 * ({@link PI_SUBSCRIPTION_TOKEN_MARKER}), so it is checked here rather than trusted.
 *
 * Both clauses are load-bearing and neither implies the other: the TOKEN decides whether pi sends
 * `Authorization: Bearer` or `x-api-key`, and the DIALECT decides whether pi looks at the token's
 * shape at all. A subscription token under `openai-completions` is spent as a plain bearer key with
 * no subscription semantics in the path — the metered wire shape wearing the right string — so it is
 * refused as firmly as a metered key is.
 */
export function validatePiCredential(endpoint: PiEndpoint): PiEndpointDecision {
  const apiKey = endpoint.apiKey;
  if (apiKey === undefined) return { ok: true, endpoint };
  if (apiKey.trim().length === 0) {
    return {
      ok: false,
      error:
        "pi leaf refused: endpoint apiKey is present but blank. An empty credential is a " +
        "half-configured slice — omit the field to run on the local placeholder instead.",
    };
  }
  if (!isPiSubscriptionToken(apiKey)) {
    return {
      ok: false,
      error:
        "pi leaf refused: the endpoint credential is not a Claude subscription token. ADR-0449 " +
        "admits this leaf's one real trial run on the subscription credential and NEVER a metered " +
        "per-token API key; pi sends anything it does not recognise as OAuth via `x-api-key`, " +
        "which is the metered call (ADR-0198).",
    };
  }
  const api = endpoint.api ?? PI_DEFAULT_API;
  if (api !== PI_CREDENTIAL_API) {
    return {
      ok: false,
      error:
        `pi leaf refused: a credential requires api '${PI_CREDENTIAL_API}', not ` +
        `'${api}'. Only that adapter recognises a subscription ` +
        "token as one; under any other dialect pi forwards it as an ordinary bearer key, which is " +
        "indistinguishable at the wire from the metered call.",
    };
  }
  return { ok: true, endpoint };
}

/** The preflight verdict. Pure; exported for offline tests. */
export type PiPreflightDecision = { ok: true } | { ok: false; error: string };

/**
 * Wall 3, and the one that actually holds the line: refuse the slice if pi's runtime is
 * authenticated to ANYTHING at all before the configured endpoint is registered.
 *
 * `ambientProviderIds` is what pi's OWN `ModelRuntime.getAvailable()` reports — providers whose auth
 * resolved, which is precisely the set a fallback could reroute to. Asking pi is what makes this
 * survive a stale {@link PI_METERED_AUTH_ENV}: a credential the scrub missed cannot open a quiet
 * fallback, because its mere presence stops the run and the refusal names it.
 *
 * ⚠ TAKE THE READING BEFORE `registerProvider`, AND HERE IS THE MEASUREMENT SAYING WHY.
 *
 * With `ANTHROPIC_API_KEY` set, a FRESH `ModelRuntime` reports `getAvailable() → [anthropic]`,
 * every time. That is the reading this wall is built on and it is stable.
 *
 * A reading taken AFTER `registerProvider` is NOT. Registering fires an un-awaited internal refresh
 * (`void this.refresh({ allowNetwork: false })`) alongside a synchronous snapshot rebuild, and the
 * same create → register → `getAvailable()` sequence was observed returning `[storytree-local]`
 * (anthropic gone from `getAvailable()`, `getAvailableSnapshot()` and `hasConfiguredAuth()` alike,
 * three runs out of three under node) and `[anthropic, storytree-local]` (under bun). Both answers,
 * same sequence, pi 0.84.3.
 *
 * So a post-registration wall is not merely weaker — it is a wall that reports "nothing else is
 * authenticated" on a box where something plainly is, SOMETIMES. That is worse than no wall: it is
 * this repo's most-recorded fault class (a green check that verified nothing) wearing a passing
 * test. This was not reasoned out in advance — the preflight was written the wrong way round first
 * and passed once, by luck, before failing. Before registration the reading is unambiguous, and
 * every id in it is by definition not ours.
 *
 * Refusing rather than merely not-choosing is deliberate. Not-choosing relies on every downstream
 * pi code path continuing to honour the explicit model — a property of someone else's code, checked
 * once, that a version bump can revoke. Refusing relies on nothing.
 */
export function decidePiPreflight(args: {
  endpointProviderId: string;
  ambientProviderIds: readonly string[];
  modelFound: boolean;
}): PiPreflightDecision {
  // The endpoint id is filtered out defensively rather than because it can appear: the reading is
  // taken before registration, so it cannot. If a caller ever reorders those, this degrades to a
  // narrower wall rather than to a false refusal.
  const foreign = [...new Set(args.ambientProviderIds)]
    .filter((id) => id !== args.endpointProviderId)
    .sort();
  if (foreign.length > 0) {
    return {
      ok: false,
      error:
        `pi leaf refused: ${foreign.length} provider(s) other than the configured endpoint are ` +
        `authenticated in this process (${foreign.join(", ")}). A reachable second provider is a ` +
        "reroute waiting to happen (ADR-0198), so the slice is refused rather than run. Unset that " +
        "provider's credential, or add its variable to PI_METERED_AUTH_ENV if it is one we scrub.",
    };
  }
  if (!args.modelFound) {
    return {
      ok: false,
      error:
        `pi leaf refused: the configured endpoint '${args.endpointProviderId}' resolved no model. ` +
        "The leaf never substitutes one.",
    };
  }
  return { ok: true };
}

/**
 * The per-slice turn ceiling (end state 5). `stop()` is handed to pi's `Agent.shouldStopAfterTurn`,
 * which ends the loop CLEANLY after a completed turn rather than aborting mid-tool-call — so work
 * already written stays on disk for the spine to observe.
 */
export interface PiTurnCeiling {
  /** pi's `shouldStopAfterTurn` callback: true once the ceiling is reached. */
  stop: () => boolean;
  /** Completed turns so far. */
  turns: () => number;
  /** Whether the ceiling is what stopped the loop (as opposed to the model finishing). */
  exhausted: () => boolean;
}

export function createPiTurnCeiling(maxTurns: number): PiTurnCeiling {
  let turns = 0;
  let hit = false;
  return {
    stop: () => {
      turns += 1;
      if (turns >= maxTurns) hit = true;
      return hit;
    },
    turns: () => turns,
    exhausted: () => hit,
  };
}

/** The terminal state of one pi slice, as read off the session. */
export interface PiSliceTermination {
  /** pi's `StopReason` on the last assistant message; absent when there was none at all. */
  stopReason?: string;
  /** pi's `errorMessage` on that message, when it carried one. */
  errorMessage?: string;
  /** Whether the leaf's own turn ceiling is what ended the loop. */
  ceilingHit: boolean;
  /** A thrown error from `prompt()`, when it threw at all. */
  thrown?: string;
}

/**
 * pi stop reasons that mean the leaf hit a CEILING rather than failed — the direct analogue of the
 * SDK leaf's `EXHAUSTION_SUBTYPES`. Usable work may already be on disk, so the gate falls through
 * to its own observation instead of discarding the slice (ADR-0020: a ceiling is a cost guard, not
 * a proof signal). `length` joins our own turn ceiling here: the model ran out of output budget
 * mid-slice, which is exactly the same situation.
 */
const PI_EXHAUSTION_STOP_REASONS: ReadonlySet<string> = new Set(["length"]);

/** pi stop reasons that mean the model finished a turn cleanly. */
const PI_CLEAN_STOP_REASONS: ReadonlySet<string> = new Set(["stop", "toolUse"]);

/**
 * Map a slice's terminal state onto the seam's {@link AuthorResult}. Pure; exported for offline
 * tests.
 *
 * FAIL-CLOSED ON EVERYTHING THAT IS NOT AN OBSERVED CLEAN STOP, which is the whole reason this is a
 * function and not an `if (!threw) return ok`. Measured against pi 0.84.3: an unreachable endpoint
 * lets `prompt()` resolve NORMALLY and reports itself only as `stopReason: "error"` on the last
 * assistant message. `pending` (no terminal state was ever observed) and a missing assistant
 * message (the model never answered at all) are refusals for the same reason.
 */
export function classifyPiSliceOutcome(termination: PiSliceTermination): AuthorResult {
  if (termination.thrown !== undefined) {
    return { ok: false, error: `pi session failed: ${termination.thrown}` };
  }
  if (termination.ceilingHit) {
    return {
      ok: false,
      exhausted: true,
      error: "pi session stopped at the leaf's turn ceiling (cost guard, not a proof signal)",
    };
  }
  const { stopReason } = termination;
  if (stopReason === undefined) {
    return {
      ok: false,
      error: "pi session produced no assistant message (fail-closed): the model never answered",
    };
  }
  if (PI_EXHAUSTION_STOP_REASONS.has(stopReason)) {
    return {
      ok: false,
      exhausted: true,
      error: `pi session stopped on '${stopReason}' (cost guard, not a proof signal)`,
    };
  }
  if (!PI_CLEAN_STOP_REASONS.has(stopReason)) {
    const detail = termination.errorMessage !== undefined ? `: ${termination.errorMessage}` : "";
    return { ok: false, error: `pi session ended '${stopReason}'${detail}` };
  }
  return { ok: true };
}

/** Per-slice accounting, shaped like its siblings so the sink reads one field (`source`). */
export interface PiRunInfo {
  phase: AuthoringPhase;
  /** WHICH leaf runtime produced this run — the discriminator `SdkRunInfo`/`CodexRunInfo` carry. */
  source: "pi-leaf";
  /** `success`, or the pi stop reason / failure label the slice ended on. */
  subtype: string;
  /** Completed turns, as counted by the leaf's own ceiling. */
  turns: number;
  /** The configured endpoint's model id. */
  model: string;
  /** The slice's token breakdown when pi reported one. Additive — absent is never fail-closed. */
  usage?: TokenUsage;
}

/** Constructor args for {@link PiPhaseAuthor}. */
export interface PiPhaseAuthorArgs {
  /** The workspace the leaf authors in; writes outside it are refused by the fence. */
  cwd: string;
  /**
   * The per-phase write-ownership predicate (ADR-0020 §2) over WORKSPACE-RELATIVE paths.
   * Structurally compatible with the orchestrator's `WriteScope.isWriteAllowed`, exactly as
   * `sdk-author.ts` consumes it — `packages/agent` imports no other storytree package.
   */
  isWriteAllowed: (phase: AuthoringPhase, relPath: string) => boolean;
  /** The one endpoint this leaf may talk to. Absent = every slice refuses (wall 1). */
  endpoint?: PiEndpoint;
  /**
   * pi's config directory. Default: a fresh throwaway per slice, which is what keeps the
   * DEVELOPER's `~/.pi` — their credentials, their settings, their auto-discovered extensions —
   * out of the leaf entirely.
   */
  agentDir?: string;
  /** Per-slice turn ceiling — the runaway brake (end state 5). Default: 16. */
  maxTurns?: number;
  /**
   * The rendered `red-builder` / `green-builder` bodies (ADR-0051 §4). REQUIRED on the real pi
   * path: a live leaf that silently ran a generic prompt is the anti-blindside failure
   * `sdk-author.ts` already fails closed on.
   */
  phasePrompts?: { AUTHOR_TEST: string; IMPLEMENT: string };
  /** The environment to scrub. Defaults to `process.env`; injected only by tests. */
  env?: NodeJS.ProcessEnv;
}

/** The runtime handles this leaf pulls out of pi, and nothing else. */
interface PiRuntimeHandles {
  createAgentSession: PiModule["createAgentSession"];
  DefaultResourceLoader: PiModule["DefaultResourceLoader"];
  ModelRuntime: PiModule["ModelRuntime"];
  SessionManager: PiModule["SessionManager"];
  SettingsManager: PiModule["SettingsManager"];
}

/**
 * Load pi's runtime, dynamically. See the module doc: a static import would drag pi into the graph
 * of every consumer of `@storytree/agent`, where it is a devDependency on purpose. A missing pi is
 * a refusal, not a crash.
 */
async function loadPiRuntime(): Promise<
  { ok: true; pi: PiRuntimeHandles } | { ok: false; error: string }
> {
  try {
    const mod: PiModule = await import("@earendil-works/pi-coding-agent");
    return {
      ok: true,
      pi: {
        createAgentSession: mod.createAgentSession,
        DefaultResourceLoader: mod.DefaultResourceLoader,
        ModelRuntime: mod.ModelRuntime,
        SessionManager: mod.SessionManager,
        SettingsManager: mod.SettingsManager,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error:
        `pi leaf refused: the pi runtime is not installed (${(e as Error).message}). pi is a ` +
        "devDependency by design (ADR-0198), so this leaf is unavailable wherever it is absent.",
    };
  }
}

/**
 * pi's assistant message, narrowed off its own message union rather than re-typed. A pi release
 * that renames `stopReason` / `errorMessage` / `usage` therefore fails THIS file's typecheck — the
 * same guarantee `pi-fence.ts` buys by pinning the extension types, and the reason the reads below
 * are direct rather than defensive `Record<string, unknown>` lookups (which would degrade silently
 * to "no terminal state observed, forever" and fail closed on every slice for an invisible reason).
 */
type PiAssistantMessage = Extract<PiSession["state"]["messages"][number], { role: "assistant" }>;

/** Read pi's usage block off an assistant message. Additive accounting — absent is never a fail. */
function usageFromPiMessage(message: PiAssistantMessage): TokenUsage | undefined {
  const usage = message.usage;
  const count = (v: number | undefined): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
  const inputTokens = count(usage?.input);
  const outputTokens = count(usage?.output);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  return {
    inputTokens,
    cacheCreationInputTokens: count(usage?.cacheWrite) ?? 0,
    cacheReadInputTokens: count(usage?.cacheRead) ?? 0,
    outputTokens,
  };
}

/** The last assistant message in a pi session, or nothing. */
function lastAssistantMessage(session: PiSession): PiAssistantMessage | undefined {
  const messages = session.state.messages;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message !== undefined && message.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

/**
 * The pi {@link PhaseAuthor}: one `createAgentSession` prompt per authoring slice, inside the
 * in-process fence, against exactly one configured endpoint.
 */
export class PiPhaseAuthor implements PhaseAuthor {
  /** Runtime discriminator used by drive/reporting, as the other two leaves carry. */
  readonly runtime = "pi" as const;

  /** Every fail-closed refusal the fence made, in order — the ADR-0446 sink's input. */
  readonly violations: PiFenceViolation[] = [];

  /** Per-slice accounting. Pushed for a refused slice too: it is the sink's DENOMINATOR. */
  readonly runs: PiRunInfo[] = [];

  /** pi runs no spine-registered feedback commands; proofs stay spine-side and out of band. */
  readonly feedbackRuns: [] = [];
  readonly feedbackToolNames: [] = [];

  readonly #args: PiPhaseAuthorArgs;

  constructor(args: PiPhaseAuthorArgs) {
    this.#args = { ...args, cwd: path.resolve(args.cwd) };
  }

  async author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult> {
    const endpointCheck = validatePiEndpoint(this.#args.endpoint);
    if (!endpointCheck.ok) return { ok: false, error: endpointCheck.error };
    const endpoint = endpointCheck.endpoint;

    const agentBody = this.#args.phasePrompts?.[phase]?.trim();
    if (agentBody === undefined || agentBody.length === 0) {
      const agent = phase === "AUTHOR_TEST" ? "red-builder" : "green-builder";
      return {
        ok: false,
        error:
          `pi leaf has no injected system prompt for phase ${phase}: the rendered ${agent} agent ` +
          "(ADR-0051 §4) was not threaded in. A live leaf MUST run the Library agent, not a " +
          "generic fallback.",
      };
    }
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return { ok: false, error: "pi phase brief is empty" };
    }

    // Wall 2. Applied around EVERYTHING below, including the model-runtime construction, because
    // pi resolves a provider's key while composing it — not only at request time.
    const restoreEnv = scrubMeteredPiAuthEnv(this.#args.env ?? process.env);
    try {
      return await this.#authorScrubbed(phase, endpoint, agentBody, prompt);
    } finally {
      restoreEnv();
    }
  }

  async #authorScrubbed(
    phase: AuthoringPhase,
    endpoint: PiEndpoint,
    agentBody: string,
    prompt: string,
  ): Promise<AuthorResult> {
    const loaded = await loadPiRuntime();
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const pi = loaded.pi;

    const ownsAgentDir = this.#args.agentDir === undefined;
    const agentDir =
      this.#args.agentDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "storytree-pi-agent-"));
    const cwd = this.#args.cwd;
    const ceiling = createPiTurnCeiling(this.#args.maxTurns ?? DEFAULT_PI_MAX_TURNS);
    let session: PiSession | undefined;

    try {
      // A throwaway auth store, no models catalogue, and no network: pi cannot read the developer's
      // real credentials and cannot fetch a provider catalogue that would introduce new ones.
      const modelRuntime: PiModelRuntime = await pi.ModelRuntime.create({
        authPath: path.join(agentDir, "auth.json"),
        modelsPath: null,
        allowModelNetwork: false,
        refreshOnCreate: false,
      });
      // Wall 3, and it MUST be read here — before `registerProvider`, which replaces this snapshot
      // (see {@link decidePiPreflight}). Every id in this reading is by definition not ours.
      const ambient = await modelRuntime.getAvailable();
      const ambientProviderIds = [...new Set(ambient.map((m) => m.provider))];

      modelRuntime.registerProvider(endpoint.providerId, {
        name: `storytree pi endpoint (${endpoint.providerId})`,
        baseUrl: endpoint.baseUrl,
        apiKey: resolvePiCredential(endpoint),
        api: endpoint.api ?? PI_DEFAULT_API,
        models: [
          {
            id: endpoint.modelId,
            name: endpoint.modelName ?? endpoint.modelId,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: endpoint.contextWindow,
            maxTokens: endpoint.maxTokens,
          },
        ],
      });

      const model: PiModel | undefined = modelRuntime.getModel(
        endpoint.providerId,
        endpoint.modelId,
      );
      const preflight = decidePiPreflight({
        endpointProviderId: endpoint.providerId,
        ambientProviderIds,
        modelFound: model !== undefined,
      });
      if (!preflight.ok) {
        this.#recordRun(phase, endpoint, "refused-preflight", ceiling.turns(), undefined);
        return { ok: false, error: preflight.error };
      }
      if (model === undefined) {
        // Unreachable while `decidePiPreflight` refuses `!modelFound` — kept because it is the
        // narrowing the compiler needs AND a real fail-closed guard if that rule is ever loosened.
        // The alternative is a non-null assertion, which is the same claim with nothing behind it.
        this.#recordRun(phase, endpoint, "refused-no-model", ceiling.turns(), undefined);
        return { ok: false, error: "pi leaf refused: the configured endpoint resolved no model" };
      }

      // The fence, IN PROCESS. `noExtensions` turns off pi's own discovery entirely, so nothing in
      // `~/.pi/agent/extensions` or `<cwd>/.pi/extensions` loads — the fence is the only extension
      // there is, and it cannot be disabled by deleting a file or declining project trust.
      const loader = new pi.DefaultResourceLoader({
        cwd,
        agentDir,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPrompt: agentBody,
        extensionFactories: [
          {
            name: "storytree-pi-scope-fence",
            factory: createPiScopeFence({
              phase,
              cwd,
              isWriteAllowed: this.#args.isWriteAllowed,
              onViolation: (violation) => this.violations.push(violation),
            }),
          },
        ],
      });
      await loader.reload();
      const loadedExtensions = loader.getExtensions();
      if (loadedExtensions.errors.length > 0 || loadedExtensions.extensions.length !== 1) {
        // FAIL CLOSED. A slice whose fence did not load is an UNFENCED slice, and running one
        // would produce writes nothing refused — indistinguishable afterwards from a fence that
        // held. An unexpected SECOND extension is refused for the same reason the tool allowlist
        // refuses an unknown tool: it could register one.
        this.#recordRun(phase, endpoint, "refused-fence-not-installed", ceiling.turns(), undefined);
        const detail = loadedExtensions.errors.map((e) => `${e.path}: ${e.error}`).join("; ");
        return {
          ok: false,
          error:
            `pi leaf refused: expected exactly the scope fence to be loaded, got ` +
            `${loadedExtensions.extensions.length} extension(s)${detail === "" ? "" : ` (${detail})`}`,
        };
      }

      const created = await pi.createAgentSession({
        cwd,
        agentDir,
        modelRuntime,
        model,
        tools: [...PI_AUTHORING_TOOLS],
        resourceLoader: loader,
        sessionManager: pi.SessionManager.inMemory(cwd),
        settingsManager: pi.SettingsManager.create(cwd, agentDir),
      });
      session = created.session;

      // Wall 4: pi says outright when it substituted a model, and the session says which one it
      // ended up on. Both are checked — a substitution IS the reroute.
      if (created.modelFallbackMessage !== undefined) {
        this.#recordRun(phase, endpoint, "refused-model-substituted", ceiling.turns(), undefined);
        return {
          ok: false,
          error: `pi leaf refused: pi substituted a model (${created.modelFallbackMessage})`,
        };
      }
      const active = session.model;
      if (active?.provider !== endpoint.providerId || active.id !== endpoint.modelId) {
        this.#recordRun(phase, endpoint, "refused-model-substituted", ceiling.turns(), undefined);
        return {
          ok: false,
          error:
            `pi leaf refused: session resolved '${active?.provider ?? "(none)"}/` +
            `${active?.id ?? "(none)"}', not the configured ` +
            `'${endpoint.providerId}/${endpoint.modelId}'`,
        };
      }

      // The tool surface pi actually gave us — asserted, not assumed. `PI_AUTHORING_TOOLS` excludes
      // the shell (`sdk-author.ts:5`: "a shell write would bypass the scope hook"), and a settings
      // file or a pi default that put it back would silently unfence every write.
      const activeTools = session.getActiveToolNames();
      const shell = activeTools.filter((name) => PI_SHELL_TOOLS.includes(name));
      const offSurface = activeTools.filter((name) => !PI_AUTHORING_TOOLS.includes(name));
      if (shell.length > 0 || offSurface.length > 0) {
        this.#recordRun(phase, endpoint, "refused-tool-surface", ceiling.turns(), undefined);
        return {
          ok: false,
          error:
            `pi leaf refused: the session's tool surface carries tool(s) off the authoring ` +
            `surface (${[...new Set([...shell, ...offSurface])].sort().join(", ")})`,
        };
      }

      // Wall 5, the cost guard. pi never sets this itself (checked against 0.84.3's `sdk.js`), so
      // assigning it clobbers nothing.
      session.agent.shouldStopAfterTurn = () => ceiling.stop();

      const termination: PiSliceTermination = { ceilingHit: false };
      try {
        await session.prompt(`## Phase brief\n${prompt.trim()}`);
      } catch (e) {
        termination.thrown = (e as Error).message;
      }
      termination.ceilingHit = ceiling.exhausted();
      const last = lastAssistantMessage(session);
      const usage = last === undefined ? undefined : usageFromPiMessage(last);
      if (last !== undefined) {
        termination.stopReason = last.stopReason;
        if (last.errorMessage !== undefined) termination.errorMessage = last.errorMessage;
      }

      const outcome = classifyPiSliceOutcome(termination);
      this.#recordRun(
        phase,
        endpoint,
        outcome.ok ? "success" : (termination.stopReason ?? "error"),
        ceiling.turns(),
        usage,
      );
      return outcome;
    } catch (e) {
      this.#recordRun(phase, endpoint, "error", ceiling.turns(), undefined);
      return { ok: false, error: `pi session failed: ${(e as Error).message}` };
    } finally {
      session?.dispose();
      if (ownsAgentDir) {
        fs.rmSync(agentDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Record the slice. Called on EVERY exit including a refusal, because these rows are the
   * write-scope sink's denominator (ADR-0446): a slice that armed the fence and refused before the
   * model answered still armed the fence, and dropping it would flatter every reading taken over it.
   */
  #recordRun(
    phase: AuthoringPhase,
    endpoint: PiEndpoint,
    subtype: string,
    turns: number,
    usage: TokenUsage | undefined,
  ): void {
    const run: PiRunInfo = {
      phase,
      source: "pi-leaf",
      subtype,
      turns,
      model: endpoint.modelId,
    };
    if (usage !== undefined) run.usage = usage;
    this.runs.push(run);
  }
}
