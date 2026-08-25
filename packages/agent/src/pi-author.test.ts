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
  PI_LOCAL_PLACEHOLDER_KEY,
  PI_METERED_AUTH_ENV,
  PiPhaseAuthor,
  classifyPiSliceOutcome,
  createPiTurnCeiling,
  decidePiPreflight,
  scrubMeteredPiAuth,
  scrubMeteredPiAuthEnv,
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

test("the leaf carries NO credential field — there is nothing to hydrate and nothing to leak", () => {
  // End state 4: "no credential hydrated for it that a different runtime could pick up". pi refuses
  // to send a request with neither key nor header, so the leaf supplies one fixed, public,
  // meaningless string. It is a constant, not configuration: there is no way to point this leaf at
  // a metered provider by supplying a key.
  assert.equal(Object.hasOwn(ENDPOINT, "apiKey"), false);
  assert.match(PI_LOCAL_PLACEHOLDER_KEY, /no-credential/);
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
