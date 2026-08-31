import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

import { Agent } from "@earendil-works/pi-agent-core";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { ModelRuntime, createWriteTool } from "@earendil-works/pi-coding-agent";

import {
  PI_CREDENTIAL_API,
  PI_DEFAULT_API,
  PI_LOCAL_PLACEHOLDER_KEY,
  PI_METERED_AUTH_ENV,
  PI_SUBSCRIPTION_TOKEN_MARKER,
  PiPhaseAuthor,
  classifyPiSliceOutcome,
  createPiTurnCeiling,
  decidePiPreflight,
  isPiSubscriptionToken,
  resolvePiCredential,
  scrubMeteredPiAuth,
  scrubMeteredPiAuthEnv,
  validatePiCredential,
  validatePiEndpoint,
} from "./pi-author.js";
import type { PiEndpoint } from "./pi-author.js";
import { PI_AUTHORING_TOOLS, PI_SHELL_TOOLS } from "./pi-fence.js";
import type { AuthoringPhase } from "./phase-author.js";

/**
 * OFFLINE proof of the pi LEAF (`pi-harness-admission-arc` increment 2). NOTHING HERE SPENDS
 * ANYTHING: every slice below runs against a CLOSED localhost port, over a throwaway pi config
 * directory, with `allowModelNetwork: false`. No credential is read and no provider is reachable.
 *
 * ## What the arc asks this file to settle
 *
 * End state 2: "an unreachable configured endpoint produces a REFUSAL, never a silent reroute to a
 * metered provider. ASSERTED BY A TEST, NOT BY CONFIGURATION DISCIPLINE." That is ADR-0177/ADR-0198's
 * failure mode in sharper form — the Cursor leaf was retired after a subscription-shaped path turned
 * out to be metered and the owner met surprise charges.
 *
 * ## THE TRAP THIS FILE EXISTS TO CATCH, measured rather than imagined
 *
 * Against pi 0.84.3 with the endpoint pointed at a closed port, `session.prompt()` RESOLVES
 * NORMALLY. Nothing throws. The failure appears only as `stopReason: "error"` with
 * `errorMessage: "Connection error."` on the last assistant message, after pi's own auto-retry. A
 * leaf that concluded "no exception, therefore authored" would report a green authoring slice for a
 * run in which no model ever answered — the silent half of the failure this whole increment is
 * about. `unreachable-endpoint-refuses` is the assertion that catches it.
 *
 * ## THE CONTROL, so no assertion here can pass vacuously
 *
 * `metered-env-is-visible-without-the-scrub` sets a fake `ANTHROPIC_API_KEY` and proves pi's OWN
 * `ModelRuntime` then reports anthropic models as AVAILABLE — i.e. an ambient key really is a live
 * provider inside the leaf's process. The scrubbed case is only meaningful because that control
 * passes; without it, "no metered provider was available" would be equally satisfied by a runtime
 * that never resolves anything. Do not delete it to tidy the file.
 *
 * ## WHAT IT DELIBERATELY DOES NOT PROVE
 *
 * A SUCCESSFUL authoring slice. That needs a model that answers, which is increment 3's owner-gated
 * endpoint decision. The success path's parts are proved separately and honestly: the outcome
 * mapping as a pure function, and the turn ceiling against pi's REAL `Agent` loop.
 */

const CWD = path.resolve("/work/space");

const ENDPOINT: PiEndpoint = {
  providerId: "storytree-local",
  baseUrl: "http://127.0.0.1:1/v1",
  modelId: "probe-model",
  contextWindow: 32_768,
  maxTokens: 4_096,
};

const PROMPTS = { AUTHOR_TEST: "you are the red builder", IMPLEMENT: "you are the green builder" };

/** The same shape `sdk-author.test.ts` uses: tests only in AUTHOR_TEST, one source in IMPLEMENT. */
const testOnlyInAuthor = (phase: AuthoringPhase, rel: string): boolean =>
  phase === "AUTHOR_TEST" ? rel.endsWith(".test.cjs") : rel === "impl.cjs";

const errorOf = (result: { ok: boolean; error?: string }): string => result.error ?? "";

// ── Wall 1: an endpoint is REQUIRED, explicit, and never a pi built-in ───────

test("validatePiEndpoint refuses an absent endpoint — there is no default and no first-available", () => {
  const decision = validatePiEndpoint(undefined);
  assert.equal(decision.ok, false);
  assert.match(errorOf(decision), /no endpoint configured/);
});

test("validatePiEndpoint refuses a pi BUILT-IN provider id — the door metered auth comes through", () => {
  // Registering over `anthropic`/`openai` composes on top of pi's own provider and inherits its
  // environment-variable API-key resolution (`pi-ai`'s `env-api-keys.js`), which is exactly the
  // fallback this leaf exists to make unreachable.
  for (const providerId of ["anthropic", "openai", "google-vertex", "openrouter"]) {
    const decision = validatePiEndpoint({ ...ENDPOINT, providerId });
    assert.equal(decision.ok, false, `${providerId} must be refused`);
    assert.match(errorOf(decision), /pi built-in/);
  }
  assert.equal(validatePiEndpoint(ENDPOINT).ok, true);
});

test("validatePiEndpoint refuses a malformed endpoint rather than half-configuring one", () => {
  const cases: Array<[Partial<PiEndpoint>, RegExp]> = [
    [{ baseUrl: "not a url" }, /not a URL/],
    [{ baseUrl: "file:///etc/passwd" }, /not http/],
    [{ modelId: "  " }, /required/],
    [{ contextWindow: 0 }, /contextWindow/],
    [{ maxTokens: -1 }, /maxTokens/],
  ];
  for (const [override, expected] of cases) {
    const decision = validatePiEndpoint({ ...ENDPOINT, ...override });
    assert.equal(decision.ok, false, `${JSON.stringify(override)} must be refused`);
    assert.match(errorOf(decision), expected);
  }
});

// ── Wall 5: the credential slot (ADR-0449) ──────────────────────────────────
//
// ⚠ THIS BLOCK REPLACES AN ASSERTION THAT WAS TRUE AND IS DELIBERATELY NO LONGER TRUE, which is the
// same shape as `resolveLiveRuntime`'s `--runtime pi` refusal test: increment 2 asserted
// `Object.hasOwn(ENDPOINT, "apiKey") === false` and documented it as the guarantee that no metered
// call was reachable, BECAUSE there was nowhere to put a credential. ADR-0449 decided the arc's one
// real trial run points at Anthropic on the existing SUBSCRIPTION credential, so the field now
// exists. The guarantee is not dropped — it is re-bought as a REFUSAL that a test can exercise,
// which the absent field never could. The tests below are that refusal, from both sides.

test("a slice with NO credential is unchanged — the local default is still the placeholder", () => {
  // The regression half. Every local endpoint takes this branch and nothing above applies to it.
  assert.equal(Object.hasOwn(ENDPOINT, "apiKey"), false);
  assert.match(PI_LOCAL_PLACEHOLDER_KEY, /no-credential/);
  assert.equal(validatePiEndpoint(ENDPOINT).ok, true);
});

test("the credential slot ACCEPTS a Claude subscription token under the anthropic dialect", () => {
  // What ADR-0449 authorised, and the only thing it authorised.
  const decision = validatePiEndpoint({
    ...ENDPOINT,
    providerId: "storytree-anthropic-trial",
    baseUrl: "https://api.anthropic.com",
    api: PI_CREDENTIAL_API,
    apiKey: "sk-ant-oat01-NOT-A-REAL-TOKEN",
  });
  assert.equal(decision.ok, true, errorOf(decision));
});

test("the credential slot REFUSES a metered per-token API key — ADR-0449's clause, mechanically", () => {
  // The clause is "never a metered per-token key". A slot that took any string would leave that
  // resting on whoever composes the endpoint getting it right forever, which is how ADR-0198
  // happened. pi branches on the token's shape, so this is checkable rather than trusted.
  const decision = validatePiEndpoint({
    ...ENDPOINT,
    providerId: "storytree-anthropic-trial",
    baseUrl: "https://api.anthropic.com",
    api: PI_CREDENTIAL_API,
    apiKey: "sk-ant-api03-NOT-A-REAL-KEY",
  });
  assert.equal(decision.ok, false, "a metered key must be refused, not spent");
  // The MESSAGE is asserted in full, not sampled. A fail-closed refusal is only as good as what the
  // operator reads off it: the reason, the decision that authorises the narrow case, the mechanism
  // (pi sends an unrecognised token as `x-api-key`), and the decision that says why that matters.
  const metered = errorOf(decision);
  for (const fragment of [
    "not a Claude subscription token",
    "ADR-0449",
    "NEVER a metered",
    "per-token API key",
    "x-api-key",
    "which is the metered call",
    "ADR-0198",
  ]) {
    assert.ok(metered.includes(fragment), `the refusal must say ${JSON.stringify(fragment)}: ${metered}`);
  }
});

test("the credential slot REFUSES a subscription token under any OTHER dialect", () => {
  // Both clauses are load-bearing and neither implies the other. Only `anthropic-messages` looks at
  // the token's shape; under `openai-completions` the identical string goes out as a plain bearer
  // key with no subscription semantics in the path — the metered wire shape wearing the right
  // string. Refused as firmly as a metered key.
  const base: PiEndpoint = {
    ...ENDPOINT,
    providerId: "storytree-anthropic-trial",
    baseUrl: "https://api.anthropic.com",
    apiKey: "sk-ant-oat01-NOT-A-REAL-TOKEN",
  };
  // The DEFAULT dialect first — the case a caller reaches by simply not setting `api` at all, and
  // therefore the one most likely to be met by accident.
  assert.equal(validatePiEndpoint(base).ok, false, "the default dialect must be refused");
  const defaulted = errorOf(validatePiEndpoint(base));
  // ⚠ THE MESSAGE MUST NAME THE DIALECT IT ACTUALLY GOT, and for the default case that means naming
  // the DEFAULT rather than "undefined". An operator who set no `api` at all is the likeliest one to
  // meet this refusal, and "not 'undefined'" tells them nothing about what to change.
  for (const fragment of [
    "requires api 'anthropic-messages'",
    `not '${PI_DEFAULT_API}'`,
    "Only that adapter recognises a subscription",
    "ordinary bearer key",
    "indistinguishable at the wire from the metered call",
  ]) {
    assert.ok(defaulted.includes(fragment), `the refusal must say ${JSON.stringify(fragment)}: ${defaulted}`);
  }
  for (const api of ["openai-completions", "openai-responses"]) {
    const decision = validatePiEndpoint({ ...base, api });
    assert.equal(decision.ok, false, `api '${api}' must be refused`);
    assert.match(errorOf(decision), /requires api 'anthropic-messages'/);
    assert.ok(errorOf(decision).includes(`not '${api}'`), "the refusal names the dialect it got");
  }
});

test("a BLANK credential is a refusal, never a silent fall-through to the placeholder", () => {
  // The dangerous degradation: a blank credential that fell through to `PI_LOCAL_PLACEHOLDER_KEY`
  // would run a slice pointed at a REAL endpoint while reporting like a local one. `??` in the
  // leaf's `registerProvider` call is what makes this reachable rather than swallowed by `||`.
  for (const apiKey of ["", "   "]) {
    const decision = validatePiEndpoint({ ...ENDPOINT, api: PI_CREDENTIAL_API, apiKey });
    assert.equal(decision.ok, false, `apiKey ${JSON.stringify(apiKey)} must be refused`);
    assert.match(errorOf(decision), /present but blank/);
    // Names the remedy, not just the fault: omitting the field is what a local endpoint should do.
    assert.ok(
      errorOf(decision).includes("omit the field to run on the local placeholder instead"),
      `the refusal must name the remedy: ${errorOf(decision)}`,
    );
  }
});

test("WALL 1 STILL BINDS OVER A VALID CREDENTIAL — 'anthropic' is refused as a providerId", () => {
  // The collision ADR-0449 walks into on its naive reading: it says point at Anthropic, and wall 1
  // refuses `providerId: "anthropic"` because re-registering a pi built-in composes over pi's own
  // provider and inherits its environment-variable auth resolution. That refusal is CORRECT and is
  // not widened; the shape that satisfies both is a FRESH provider id carrying the credential
  // explicitly. A perfect credential must not buy a way past this.
  const decision = validatePiEndpoint({
    ...ENDPOINT,
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    api: PI_CREDENTIAL_API,
    apiKey: "sk-ant-oat01-NOT-A-REAL-TOKEN",
  });
  assert.equal(decision.ok, false, "a credential must not open the built-in door");
  assert.match(errorOf(decision), /is a pi built-in/);
});

test("the subscription predicate is pi's OWN, not a naming convention we invented", () => {
  // `isOAuthToken(apiKey)` is `apiKey.includes("sk-ant-oat")` in pi-ai's `anthropic-messages`
  // adapter (0.84.3). Transcribed rather than guessed: matched, pi builds its client with
  // `authToken` (Authorization: Bearer) plus the Claude Code identity betas — the SUBSCRIPTION
  // call; unmatched, with `apiKey`, which goes out as `x-api-key` — the METERED one. Wall 5
  // asserts which of pi's two code paths the slice will take, not how a string is spelled.
  assert.equal(PI_SUBSCRIPTION_TOKEN_MARKER, "sk-ant-oat");
  assert.equal(isPiSubscriptionToken("sk-ant-oat01-abc"), true);
  assert.equal(isPiSubscriptionToken("sk-ant-api03-abc"), false);
  assert.equal(isPiSubscriptionToken(PI_LOCAL_PLACEHOLDER_KEY), false);
});

test("the configured credential is what REACHES pi — it does not degrade to the placeholder", () => {
  // The value `registerProvider` is handed, asserted directly. Left inline as a `??` this was the
  // one link in the chain no offline test could reach: whether the slot's value actually arrives at
  // pi would have been observable only on the wire, i.e. only by spending. The interesting half is
  // the DEGRADATION — a credential that silently fell through to the placeholder would run a slice
  // against a REAL endpoint while looking exactly like a local one.
  assert.equal(resolvePiCredential(ENDPOINT), PI_LOCAL_PLACEHOLDER_KEY, "no credential → placeholder");
  assert.equal(
    resolvePiCredential({ ...ENDPOINT, api: PI_CREDENTIAL_API, apiKey: "sk-ant-oat01-NOT-REAL" }),
    "sk-ant-oat01-NOT-REAL",
    "a configured credential must be the value pi is handed, verbatim",
  );
});

test("the credential is EXPLICIT — no environment variable of any name can fill the slot", () => {
  // End state 4 survives the new field: "no credential hydrated for it that a different runtime
  // could pick up". The metered fallback this leaf exists to close is pi's built-ins reading
  // `process.env`; a slot that did its own env read would rebuild that door one layer up. So the
  // value is passed in per slice and this file reads no variable to fill it — asserted by setting
  // every plausible name and observing that the endpoint stays credential-free.
  const names = [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_OAUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "PI_API_KEY",
    "STORYTREE_PI_API_KEY",
  ];
  const had = new Map(names.map((n) => [n, process.env[n]]));
  for (const n of names) process.env[n] = "sk-ant-oat01-AMBIENT-NOT-A-REAL-TOKEN";
  try {
    const decision = validatePiEndpoint(ENDPOINT);
    assert.equal(decision.ok, true);
    assert.equal(
      decision.ok ? decision.endpoint.apiKey : "unreachable",
      undefined,
      "an ambient variable must never become the slice's credential",
    );
    assert.equal(validatePiCredential(ENDPOINT).ok, true);
  } finally {
    for (const [n, v] of had) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  }
});

// ── Wall 2: the metered environment, with its control ────────────────────────

test("scrubMeteredPiAuth removes every case variant, and nothing else", () => {
  const scrubbed = scrubMeteredPiAuth({
    ANTHROPIC_API_KEY: "sk-real",
    openai_api_key: "sk-also-real",
    OpenRouter_API_Key: "sk-third",
    PATH: "/usr/bin",
    STORYTREE_DB_USER: "someone@example.com",
  });
  assert.deepEqual(Object.keys(scrubbed).sort(), ["PATH", "STORYTREE_DB_USER"]);
});

test("the scrub list is pi's OWN table — the two providers the arc names by name are on it", () => {
  // ADR-0198's lesson is specifically about Anthropic/OpenAI billing, and the arc's end state 2
  // names both. The rest of the list is transcribed from pi-ai's provider→env map; it is
  // best-effort by construction, which is why the preflight below is the actual wall.
  assert.ok(PI_METERED_AUTH_ENV.includes("ANTHROPIC_API_KEY"));
  assert.ok(PI_METERED_AUTH_ENV.includes("OPENAI_API_KEY"));
  assert.ok(PI_METERED_AUTH_ENV.length > 20, "the table is pi's, not a two-name token gesture");
});

test("scrubMeteredPiAuthEnv mutates process.env and RESTORES it exactly", () => {
  // It has to mutate the real environment: pi's `getProviderEnvValue(name, env)` is
  // `env?.[name] || process.env[name]`, so a scrubbed OVERRIDE cannot subtract a variable, only
  // shadow one that is already absent. The restore is what keeps that narrow.
  const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: "sk-fake", KEEP_ME: "yes" };
  const restore = scrubMeteredPiAuthEnv(env);
  assert.equal(env["ANTHROPIC_API_KEY"], undefined);
  assert.equal(env["KEEP_ME"], "yes");
  restore();
  assert.equal(env["ANTHROPIC_API_KEY"], "sk-fake");
  assert.equal(env["KEEP_ME"], "yes");
});

test("CONTROL: without the scrub, an ambient ANTHROPIC_API_KEY IS a live provider inside pi", async () => {
  // THE PERMANENT RED. Every "no metered provider was reachable" assertion below is only
  // meaningful because this one passes: it proves pi's own runtime really does turn an ambient
  // environment variable into an authenticated, selectable, BILLABLE provider. If pi ever stops
  // doing that, this goes red and the scrubbed assertions stop proving anything — which is the
  // signal to re-derive them, not to delete this test.
  const had = process.env["ANTHROPIC_API_KEY"];
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-fake-not-a-real-key";
  try {
    const providers = await availableProviderIds();
    assert.ok(
      providers.includes("anthropic"),
      `expected pi to expose anthropic from the env; it exposed [${providers.join(", ")}]`,
    );
  } finally {
    if (had === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = had;
  }
});

test("SCRUBBED: the same ambient key is invisible to pi, so there is nothing to reroute to", async () => {
  const had = process.env["ANTHROPIC_API_KEY"];
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-fake-not-a-real-key";
  const restore = scrubMeteredPiAuthEnv();
  try {
    const providers = await availableProviderIds();
    assert.equal(
      providers.includes("anthropic"),
      false,
      `anthropic must be invisible after the scrub; pi exposed [${providers.join(", ")}]`,
    );
  } finally {
    restore();
    if (had === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = had;
  }
});

test("the ambient reading the wall is built on is STABLE — a fresh runtime, before any registration", async () => {
  // The wall's input, asserted to be a real reading rather than a lucky one. Ten fresh runtimes,
  // ten identical answers, which is the property `decidePiPreflight` depends on.
  //
  // ⚠ THE SAME QUESTION ASKED AFTER `registerProvider` IS NOT STABLE, and that is the whole reason
  // for the ordering inside `PiPhaseAuthor.author`. The identical create → register →
  // `getAvailable()` sequence was observed answering `[storytree-local]` (three runs of three under
  // node — anthropic gone from `getAvailable()`, `getAvailableSnapshot()` and `hasConfiguredAuth()`
  // alike) and `[anthropic, storytree-local]` (under bun): registering fires an un-awaited internal
  // refresh alongside a synchronous snapshot rebuild, and which lands first decides the answer.
  //
  // That instability is deliberately NOT asserted here — a test that pins a race is a flake with a
  // rationale. It is recorded in `decidePiPreflight`'s doc, and what stands in its place is this:
  // the reading the leaf actually takes is the one that does not move.
  const had = process.env["ANTHROPIC_API_KEY"];
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-fake-not-a-real-key";
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const providers = await availableProviderIds();
      assert.deepEqual(
        providers,
        ["anthropic"],
        `attempt ${attempt}: the pre-registration reading must not move`,
      );
    }
  } finally {
    if (had === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = had;
  }
});

/** What pi's OWN runtime reports as available, over a throwaway auth store with no network. */
async function availableProviderIds(): Promise<string[]> {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-author-probe-"));
  try {
    const runtime = await ModelRuntime.create({
      authPath: path.join(agentDir, "auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const available = await runtime.getAvailable();
    return [...new Set(available.map((model) => model.provider))].sort();
  } finally {
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
}

test("ADR-0449's SUBSCRIPTION TOKEN OPENS NO AMBIENT PROVIDER — so wall 3 needs no exception", async () => {
  // ⚠ THIS IS THE MEASUREMENT THAT DECIDED THE SHAPE OF THIS LANDING, PINNED SO IT CANNOT ROT.
  //
  // ADR-0449 projected that admitting the subscription credential would require wall 3 — "refuse if
  // ANY paid provider is reachable" — to be relaxed by a deliberate named exception. It does not,
  // and that is measured rather than argued. pi resolves `anthropic` from ANTHROPIC_AUTH_TOKEN /
  // ANTHROPIC_OAUTH_TOKEN / ANTHROPIC_API_KEY (`pi-ai`'s `env-api-keys.js`) and from nothing else.
  // `CLAUDE_CODE_OAUTH_TOKEN` is not among them — and the CLI auto-hydrates that name into the
  // environment, which is exactly why it had to be measured rather than assumed either way.
  //
  // So wall 3 is left COMPLETELY UNEDITED and the general guarantee is not touched. The deliberate
  // loosening ADR-0449 authorised lands at the credential slot, under wall 5, where it is checked.
  //
  // ⚠⚠ THE POSITIVE CONTROL IS THE WHOLE TEST. An assertion that a fresh runtime reports `[]` would
  // pass just as well against a probe that can never report anything — the "green check that
  // verified nothing" shape, and it would be reading a `[]` produced by its own blindness. So the
  // same probe, same process, is first shown REPORTING anthropic off `ANTHROPIC_API_KEY`. Only then
  // does its silence about `CLAUDE_CODE_OAUTH_TOKEN` mean something.
  const names = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];
  const had = new Map(names.map((n) => [n, process.env[n]]));
  const clear = (): void => {
    for (const n of names) delete process.env[n];
  };
  try {
    clear();
    assert.deepEqual(await availableProviderIds(), [], "baseline: nothing authenticated");

    // CONTROL: the probe CAN see anthropic. If this ever stops holding, the assertion below is
    // meaningless and this test is telling you so rather than passing.
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-fake-not-a-real-key";
    assert.deepEqual(
      await availableProviderIds(),
      ["anthropic"],
      "CONTROL: an ambient metered key MUST show up, or the reading below proves nothing",
    );

    // THE MEASUREMENT: the subscription token, alone, opens nothing.
    clear();
    process.env["CLAUDE_CODE_OAUTH_TOKEN"] = "sk-ant-oat01-NOT-A-REAL-TOKEN";
    assert.deepEqual(
      await availableProviderIds(),
      [],
      "CLAUDE_CODE_OAUTH_TOKEN must open no ambient provider — if pi starts reading it, wall 3 " +
        "would refuse every slice on a box that has it hydrated, and THAT is when an exception " +
        "becomes the right answer",
    );

    // And wall 3's verdict over that reading, which is the thing the leaf actually computes.
    assert.equal(
      decidePiPreflight({
        endpointProviderId: "storytree-anthropic-trial",
        ambientProviderIds: await availableProviderIds(),
        modelFound: true,
      }).ok,
      true,
      "the preflight passes clean, unedited, with the subscription token present",
    );
  } finally {
    for (const [n, v] of had) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  }
});

// ── Wall 3: the preflight, which is what actually holds the line ─────────────

test("decidePiPreflight REFUSES the slice when any other provider is authenticated", () => {
  // Not "declines to choose it" — REFUSES. Declining relies on every pi code path continuing to
  // honour the explicit model, a property of someone else's code that a version bump can revoke.
  // Refusing relies on nothing, and it is what makes a stale PI_METERED_AUTH_ENV survivable: a
  // credential the scrub missed cannot open a quiet fallback, it stops the run and gets named.
  const decision = decidePiPreflight({
    endpointProviderId: "storytree-local",
    ambientProviderIds: ["storytree-local", "anthropic", "openai"],
    modelFound: true,
  });
  assert.equal(decision.ok, false);
  assert.match(errorOf(decision), /anthropic, openai/);
  assert.match(errorOf(decision), /reroute/);
});

test("decidePiPreflight passes when the configured endpoint is the ONLY thing authenticated", () => {
  assert.equal(
    decidePiPreflight({
      endpointProviderId: "storytree-local",
      ambientProviderIds: ["storytree-local", "storytree-local"],
      modelFound: true,
    }).ok,
    true,
  );
  // …and an empty available set is still a pass only if the model resolved; it never substitutes.
  const noModel = decidePiPreflight({
    endpointProviderId: "storytree-local",
    ambientProviderIds: [],
    modelFound: false,
  });
  assert.equal(noModel.ok, false);
  assert.match(errorOf(noModel), /resolved no model/);
});

// ── The outcome mapping: fail-closed on anything but an observed clean stop ──

test("classifyPiSliceOutcome fails closed on a connection error that THREW NOTHING", () => {
  // The measured shape of an unreachable endpoint on pi 0.84.3. `ok: true` here would be a green
  // authoring slice for a run in which no model answered.
  const result = classifyPiSliceOutcome({
    ceilingHit: false,
    stopReason: "error",
    errorMessage: "Connection error.",
  });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /Connection error/);
  assert.notEqual("exhausted" in result && result.exhausted, true);
});

test("classifyPiSliceOutcome fails closed when there was no assistant message at all", () => {
  const result = classifyPiSliceOutcome({ ceilingHit: false });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /never answered/);
});

test("classifyPiSliceOutcome fails closed on 'pending' and 'aborted' — neither is a clean stop", () => {
  for (const stopReason of ["pending", "aborted"]) {
    const result = classifyPiSliceOutcome({ ceilingHit: false, stopReason });
    assert.equal(result.ok, false, `${stopReason} must not read as authored`);
  }
});

test("classifyPiSliceOutcome maps a CEILING to exhausted — a cost guard, never a proof signal", () => {
  // ADR-0020: the SPINE is the sole arbiter of red/green. `exhausted` tells the gate that usable
  // work may already be on disk, so it falls through to its OWN observation instead of discarding
  // the slice — the same contract `EXHAUSTION_SUBTYPES` gives the Claude leaf.
  const ceiling = classifyPiSliceOutcome({ ceilingHit: true, stopReason: "toolUse" });
  assert.deepEqual(ceiling.ok, false);
  assert.equal("exhausted" in ceiling && ceiling.exhausted, true);

  const length = classifyPiSliceOutcome({ ceilingHit: false, stopReason: "length" });
  assert.equal("exhausted" in length && length.exhausted, true);

  // A GENUINE error gets NO exhausted flag: nothing usable was produced, so falling through to the
  // spine's own observation would be observing an empty slice.
  const failed = classifyPiSliceOutcome({ ceilingHit: false, thrown: "boom" });
  assert.equal(failed.ok, false);
  assert.equal("exhausted" in failed && failed.exhausted === true, false);
  const errored = classifyPiSliceOutcome({ ceilingHit: false, stopReason: "error" });
  assert.equal("exhausted" in errored && errored.exhausted === true, false);
});

test("classifyPiSliceOutcome reports a clean stop as authored", () => {
  assert.deepEqual(classifyPiSliceOutcome({ ceilingHit: false, stopReason: "stop" }), { ok: true });
  assert.deepEqual(classifyPiSliceOutcome({ ceilingHit: false, stopReason: "toolUse" }), {
    ok: true,
  });
});

// ── Wall 5: the cost guard, against pi's REAL agent loop ─────────────────────

test("createPiTurnCeiling stops on the Nth turn and reports itself as the reason", () => {
  const ceiling = createPiTurnCeiling(3);
  assert.equal(ceiling.stop(), false);
  assert.equal(ceiling.stop(), false);
  assert.equal(ceiling.stop(), true);
  assert.equal(ceiling.turns(), 3);
  assert.equal(ceiling.exhausted(), true);
});

test("the ceiling really stops pi's OWN agent loop — not just our counter", async () => {
  // pi documents no turn ceiling, so this is ours. Proving it against a real `Agent` (the layer the
  // loop lives in, which `AgentSession` drives) is what stops this being a counter that increments
  // beside a loop that never reads it. A scripted `streamFn` keeps it offline: no model, no network.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-author-ceiling-"));
  try {
    const ceiling = createPiTurnCeiling(2);
    const agent = new Agent({
      streamFn: scriptedWriteCall("scratch.txt"),
      initialState: { tools: [createWriteTool(cwd)] },
      shouldStopAfterTurn: () => ceiling.stop(),
    });
    await agent.prompt("keep writing");
    assert.equal(ceiling.turns(), 2, "pi must have asked the ceiling once per completed turn");
    assert.equal(ceiling.exhausted(), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

/** A scripted `streamFn`: every turn calls `write`, so the loop only ends when told to. */
function scriptedWriteCall(target: string): StreamFn {
  let call = 0;
  return () => {
    call += 1;
    const stream = createAssistantMessageEventStream();
    const message: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "toolCall", id: `tc-${call}`, name: "write", arguments: { path: target, content: "x" } },
      ],
      api: "anthropic-messages",
      provider: "scripted-offline",
      model: "scripted-offline",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "toolUse",
      timestamp: 0,
    };
    queueMicrotask(() => {
      stream.push({ type: "start", partial: message });
      stream.end(message);
    });
    return stream;
  };
}

// ── The whole leaf, end to end, against a CLOSED port ────────────────────────

test("the leaf refuses every slice when no endpoint is configured — and spends nothing doing it", async () => {
  const author = new PiPhaseAuthor({
    cwd: CWD,
    isWriteAllowed: testOnlyInAuthor,
    phasePrompts: PROMPTS,
  });
  const result = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /no endpoint configured/);
  // It refused BEFORE loading pi at all, so nothing was armed and nothing is recorded. An armed
  // slice is what the ADR-0446 denominator counts; a slice that never reached pi is not one.
  assert.deepEqual(author.runs, []);
});

test("the leaf refuses without an injected phase prompt — no silent generic fallback", async () => {
  // The anti-blindside guarantee `sdk-author.ts` already fails closed on (ADR-0051 §4): a live leaf
  // must run the rendered red-builder/green-builder agent, never a generic substitute.
  const author = new PiPhaseAuthor({
    cwd: CWD,
    isWriteAllowed: testOnlyInAuthor,
    endpoint: ENDPOINT,
  });
  const result = await author.author("IMPLEMENT", "implement it");
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /green-builder/);
});

test("UNREACHABLE ENDPOINT: the slice REFUSES — it does not resolve quietly and it does not reroute", async () => {
  // The arc's end state 2, asserted rather than configured. `prompt()` does not throw on pi 0.84.3;
  // the failure is only visible as `stopReason: "error"` on the last assistant message, so a leaf
  // that trusted the absence of an exception would call this authored.
  const port = await closedPort();
  const { author, cwd, cleanup } = leafOnClosedPort(port);
  try {
    const result = await author.author("AUTHOR_TEST", "author the failing test");
    assert.equal(result.ok, false, "an endpoint that cannot answer must never read as authored");
    assert.match(errorOf(result), /pi session/);
    // NOT exhaustion: nothing usable was produced, so the gate must not fall through and observe.
    assert.notEqual("exhausted" in result && result.exhausted, true);
    // Nothing was written into the workspace by a run that never reached a model.
    assert.deepEqual(fs.readdirSync(cwd), []);
    // The armed slice IS recorded — it is the ADR-0446 denominator, and a slice the fence was armed
    // for that then failed still armed the fence.
    assert.equal(author.runs.length, 1);
    assert.equal(author.runs[0]?.source, "pi-leaf");
    assert.equal(author.runs[0]?.phase, "AUTHOR_TEST");
  } finally {
    cleanup();
  }
});

test("UNREACHABLE ENDPOINT: no metered provider was ever reachable during that slice", async () => {
  // The other half of end state 2. The refusal above is only worth anything if the leaf could not
  // have silently talked to something else instead: with the environment scrubbed and exactly one
  // provider registered, pi's own runtime has nothing else to offer.
  const had = process.env["ANTHROPIC_API_KEY"];
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-fake-not-a-real-key";
  const port = await closedPort();
  const { author, cleanup } = leafOnClosedPort(port);
  try {
    const result = await author.author("AUTHOR_TEST", "author the failing test");
    assert.equal(result.ok, false);
    // If the scrub had not run, the preflight would have found `anthropic` authenticated and said
    // so; if the scrub ran but the model was substituted, the model check would have said that.
    // Either way the leaf refuses — but for the right reason, which is what this asserts.
    assert.doesNotMatch(errorOf(result), /are authenticated in this process/);
    assert.doesNotMatch(errorOf(result), /substituted/);
  } finally {
    cleanup();
    if (had === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = had;
  }
});

test("A REACHABLE SECOND PROVIDER REFUSES THE SLICE, even though the endpoint itself is fine", async () => {
  // The wall doing its job on the case that actually kills people: the local endpoint is
  // configured correctly, and a metered provider is ALSO authenticated. A leaf that merely
  // preferred the local model would run happily here and reroute the day the local one failed.
  //
  // It also simulates a STALE SCRUB LIST without editing the list, which is the condition the
  // preflight exists to survive. The leaf scrubs the env record it is GIVEN; handing it a COPY
  // leaves the key in `process.env`, which is what pi actually reads
  // (`getProviderEnvValue` falls back to it) — indistinguishable, from pi's side, from a provider
  // whose variable name we never knew to remove.
  const had = process.env["ANTHROPIC_API_KEY"];
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-fake-not-a-real-key";
  const port = await closedPort();
  const { author, cleanup } = leafOnClosedPort(port, { env: { ...process.env } });
  try {
    const result = await author.author("AUTHOR_TEST", "author the failing test");
    assert.equal(result.ok, false);
    assert.match(errorOf(result), /authenticated in this process/);
    assert.match(errorOf(result), /anthropic/);
    // And it refused BEFORE any model call: the recorded slice says why. Note the contrast with
    // the unreachable-endpoint slice above, which failed at `error` — this one never got there.
    assert.equal(author.runs[0]?.subtype, "refused-preflight");
  } finally {
    cleanup();
    if (had === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = had;
  }
});

test("THE SHELL IS OFF THE SURFACE, and the leaf checks rather than assumes", async () => {
  // `sdk-author.ts:5` states the rule the Claude leaf follows: no Bash, because "a shell write
  // would bypass the scope hook". The leaf passes `PI_AUTHORING_TOOLS` and then ASSERTS what pi
  // actually handed back, because a settings file or a pi default that put the shell back would
  // silently unfence every write in the slice. Here it is proved from outside: the slice reached a
  // model call (it failed on the connection, not on the tool surface).
  const port = await closedPort();
  const { author, cleanup } = leafOnClosedPort(port);
  try {
    const result = await author.author("IMPLEMENT", "implement it");
    assert.equal(result.ok, false);
    assert.doesNotMatch(
      errorOf(result),
      /off the authoring surface/,
      "the leaf must have been given exactly the authoring surface it asked for",
    );
    for (const shell of PI_SHELL_TOOLS) {
      assert.equal(PI_AUTHORING_TOOLS.includes(shell), false);
    }
  } finally {
    cleanup();
  }
});

test("the leaf refuses when pi's runtime is unavailable — a missing pi is not a crash", async () => {
  // pi is a devDependency and must stay one (`pi-containment.test.ts`), so the leaf reaches it by
  // dynamic import. That makes "pi is not installed" an ordinary refusal, which is the behaviour
  // every consumer of `@storytree/agent` depends on: importing the barrel loads no pi at all.
  const author = new PiPhaseAuthor({
    cwd: CWD,
    isWriteAllowed: testOnlyInAuthor,
    endpoint: ENDPOINT,
    phasePrompts: PROMPTS,
  });
  // Asserted structurally rather than by unlinking pi from disk: the leaf's own module never names
  // pi in a static import, which is what the containment guard checks and what makes the dynamic
  // load — and therefore its refusal branch — the only path in.
  const source = fs.readFileSync(path.join(import.meta.dirname, "pi-author.ts"), "utf8");
  assert.match(source, /await import\("@earendil-works\/pi-coding-agent"\)/);
  assert.ok(author instanceof PiPhaseAuthor);
});

/** Build a leaf pointed at a port nothing is listening on, in a throwaway workspace. */
function leafOnClosedPort(port: number, extra: { env?: NodeJS.ProcessEnv } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-author-work-"));
  const author = new PiPhaseAuthor({
    cwd,
    isWriteAllowed: testOnlyInAuthor,
    endpoint: { ...ENDPOINT, baseUrl: `http://127.0.0.1:${port}/v1` },
    phasePrompts: PROMPTS,
    maxTurns: 2,
    ...extra,
  });
  return { author, cwd, cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }) };
}

/**
 * A localhost port with nothing listening on it: bind an ephemeral port, read it, close it.
 *
 * Racy in principle and deliberately not hardened: if something bound that port in the microsecond
 * after the close, the request would fail differently and the assertion would still be a refusal.
 * A hardcoded port would be the worse choice — it could belong to a real service on a dev box.
 */
async function closedPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not read an ephemeral port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}
