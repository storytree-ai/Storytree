/**
 * `--runtime pi` IS WIRED (ADR-0449, `pi-harness-admission-arc` increment 3) — the offline half of
 * the live run, pinned.
 *
 * Increments 1 and 2 built the fence and the leaf and left `resolveLiveRuntime` REFUSING `pi`, with
 * a test asserting that refusal, precisely so the path could not open by someone widening a union.
 * This file is the deliberate replacement: it asserts the ADMISSION, and — more usefully — it
 * asserts the two properties that admission could plausibly have broken.
 *
 * ## THE COLLISION THESE TESTS EXIST FOR
 *
 * ADR-0449 says point the run at ANTHROPIC. `validatePiEndpoint` (wall 1) refuses a `providerId`
 * that is a pi BUILT-IN, and `anthropic` is one. A session reading only the ADR writes
 * `providerId: "anthropic"` and meets its own first wall; a session reading only the wall widens
 * the wall and re-opens pi's environment-variable key resolution, which is the door the leaf exists
 * to shut. Neither is right. So the composed endpoint is asserted to satisfy BOTH: a fresh provider
 * id that wall 1 accepts, carrying the subscription credential that wall 5 accepts.
 *
 * That works because pi's OAuth dispatch keys on the TOKEN VALUE and never on `model.provider` —
 * `pi-ai`'s `dist/api/anthropic-messages.js`, `isOAuthToken(apiKey)`. These tests cannot reach that
 * (it is pi's code and needs a live call), so they pin OUR half: the composition our walls admit.
 * The live half was measured — 2026-09-01, this exact composition drove a full
 * AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE walk to a signed PASS.
 *
 * ## AND WHAT IS DELIBERATELY *NOT* WIDENED
 *
 * ADR-0449 authorised ONE trial run through the live smoke. `--real` authors at real repo paths and
 * promotes a commit toward main; admitting an as-yet-unproven third harness to that is a separate
 * decision nobody has taken. So the narrowing did not disappear when `resolveLiveRuntime` opened —
 * it MOVED, and these tests are where that is held.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { PiPhaseAuthor, validatePiEndpoint } from "@storytree/agent";
import {
  PI_SUBSCRIPTION_DEFAULT_MODEL,
  PI_SUBSCRIPTION_PROVIDER_ID,
  composePiSubscriptionEndpoint,
} from "@storytree/orchestrator";

import {
  PI_LEAF_ENDPOINT_LABEL,
  honestFramingLive,
  liveLeafLines,
  nodeBuild,
  resolveLiveRuntime,
} from "./node-build.js";
import { storyBuild } from "./story-build.js";

/** A token shaped like the real subscription credential. NOT a credential — no such account. */
const FAKE_SUBSCRIPTION_TOKEN = "sk-ant-oat01-not-a-real-token-fixture";
/** A token shaped like a METERED per-token key — the thing ADR-0449 forbids. */
const FAKE_METERED_KEY = "sk-ant-api03-not-a-real-key-fixture";

test("resolveLiveRuntime ADMITS pi — the increment-2 refusal, changed on purpose", () => {
  const pi = resolveLiveRuntime("pi");
  assert.equal(pi.ok, true);
  assert.equal(pi.ok && pi.runtime, "pi");

  // The other two are untouched, and an unknown runtime still fails closed naming all three.
  assert.equal(resolveLiveRuntime("claude").ok, true);
  assert.equal(resolveLiveRuntime("codex").ok, true);
  assert.equal(resolveLiveRuntime(undefined).ok, true);
  const unknown = resolveLiveRuntime("llama");
  assert.equal(unknown.ok, false);
  assert.match(unknown.ok === false ? unknown.reason : "", /unknown --runtime "llama"/);
  assert.match(unknown.ok === false ? unknown.reason : "", /"pi"/);
});

test("the composed endpoint satisfies OUR OWN walls — wall 1 does not have to be widened", () => {
  const composed = composePiSubscriptionEndpoint({
    env: { CLAUDE_CODE_OAUTH_TOKEN: FAKE_SUBSCRIPTION_TOKEN },
  });
  assert.equal(composed.ok, true);
  if (!composed.ok) return;

  // Wall 1: NOT a pi built-in. This is the assertion that fails the day someone "fixes" the
  // collision by pointing the endpoint at `anthropic`.
  assert.notEqual(composed.endpoint.providerId, "anthropic");
  assert.equal(composed.endpoint.providerId, PI_SUBSCRIPTION_PROVIDER_ID);

  // Wall 5: the credential clauses. `anthropic-messages` is the ONLY dialect under which pi
  // inspects the token's shape; under any other the same string goes out as a plain bearer key,
  // which is the metered wire shape wearing the right string.
  assert.equal(composed.endpoint.api, "anthropic-messages");
  assert.equal(composed.endpoint.apiKey, FAKE_SUBSCRIPTION_TOKEN);
  assert.equal(composed.endpoint.baseUrl, "https://api.anthropic.com");
  assert.equal(composed.endpoint.modelId, PI_SUBSCRIPTION_DEFAULT_MODEL);

  // The whole endpoint, through the leaf's own validator — every wall at once, not a re-derivation.
  assert.equal(validatePiEndpoint(composed.endpoint).ok, true);
});

test("a METERED key in the credential variable is refused by wall 5, not quietly spent", () => {
  // The composer does not judge the token — it is a composition root, not a wall — so this proves
  // the refusal is the LEAF's and would fire however the endpoint was assembled.
  const composed = composePiSubscriptionEndpoint({
    env: { CLAUDE_CODE_OAUTH_TOKEN: FAKE_METERED_KEY },
  });
  assert.equal(composed.ok, true);
  if (!composed.ok) return;
  const walls = validatePiEndpoint(composed.endpoint);
  assert.equal(walls.ok, false);
  assert.match(walls.ok === false ? walls.error : "", /not a Claude subscription token/);
});

test("an ABSENT or BLANK credential is refused at composition, naming the variable", () => {
  for (const env of [{}, { CLAUDE_CODE_OAUTH_TOKEN: "" }, { CLAUDE_CODE_OAUTH_TOKEN: "   " }]) {
    const composed = composePiSubscriptionEndpoint({ env });
    assert.equal(composed.ok, false, `expected refusal for ${JSON.stringify(env)}`);
    // Naming the variable is the point: wall 5 would refuse a blank credential too, but it cannot
    // say WHICH variable was empty, and `VAR=` is how a shell says "not configured".
    assert.match(composed.ok === false ? composed.reason : "", /CLAUDE_CODE_OAUTH_TOKEN/);
    // And it must never suggest a fallback: there is no metered route to reach for (ADR-0198).
    assert.doesNotMatch(composed.ok === false ? composed.reason : "", /ANTHROPIC_API_KEY/);
  }
});

test("--model overrides the endpoint's model id but nothing else about the endpoint", () => {
  const composed = composePiSubscriptionEndpoint({
    model: "claude-opus-5",
    env: { CLAUDE_CODE_OAUTH_TOKEN: FAKE_SUBSCRIPTION_TOKEN },
  });
  assert.equal(composed.ok, true);
  if (!composed.ok) return;
  assert.equal(composed.endpoint.modelId, "claude-opus-5");
  // Still fresh, still the credential dialect — a model override cannot walk the endpoint onto a
  // built-in provider or off the one adapter that recognises a subscription token.
  assert.equal(composed.endpoint.providerId, PI_SUBSCRIPTION_PROVIDER_ID);
  assert.equal(composed.endpoint.api, "anthropic-messages");
  assert.equal(validatePiEndpoint(composed.endpoint).ok, true);
});

// ── The two REPORTING surfaces, which only a live run otherwise reaches ─────────────────────────

test("the pi build envelope NAMES ADR-0449's frontier-model gap — the requirement, not a comment", () => {
  // ADR-0449's Consequences: "If pi is admitted on the strength of this run alone, that gap should
  // be named in the admission record, not silently dropped." This is where that is discharged, and
  // it is discharged by a MECHANISM (printed on every pi build) rather than by whoever writes the
  // admission up remembering. Deleting the clause reds this test.
  const pi = honestFramingLive(false, "pi", "library-cli");
  // The WHOLE clause, newlines collapsed — asserted as one sentence rather than three keywords,
  // because a keyword set survives having most of the sentence deleted around it.
  assert.match(
    pi.replace(/\s+/g, " "),
    /ADR-0449 GAP, NAMED: this run exercised pi's fence under a FRONTIER model \(the subscription Claude endpoint\), NOT the weaker local open-weight model pi would run day to day — which is the kind of model the trial exists to find an alternative to\. A pass here is evidence about the fence under a capable model only\./,
  );
  // And it names the leaf that actually ran, not the Claude default.
  assert.match(pi, /pi agent loop against Anthropic on the subscription credential/);
  assert.match(pi, /under pi's in-process tool_call fence/);
  // The shared tail is still present — the gap is APPENDED to the framing, never a replacement.
  assert.match(pi, /The node's authored status is untouched/);
  assert.match(pi, /the verdict landed in an in-memory store and is gone/);
  assert.match(honestFramingLive(true, "pi", "library-cli"), /signed verdict PERSISTED/);

  // The gap clause is pi-SPECIFIC: the other two runtimes do not carry a claim about pi's fence,
  // and each still names its OWN leaf (so "no pi text" is not satisfied by an empty framing).
  const claude = honestFramingLive(false, "claude", "library-cli");
  assert.doesNotMatch(claude, /ADR-0449 GAP/);
  assert.doesNotMatch(claude, /pi agent loop/);
  assert.match(claude, /the Claude Agent SDK with subscription authentication/);
  const codex = honestFramingLive(false, "codex", "library-cli");
  assert.doesNotMatch(codex, /ADR-0449 GAP/);
  assert.match(codex, /the Codex CLI with saved ChatGPT subscription authentication/);
});

test("liveLeafLines reports a pi run as subscription-drawn, and splits the two wall kinds apart", () => {
  // A genuine leaf instance with pushed rows — the `cannedLiveAuthor` shape. Nothing is driven and
  // no endpoint is contacted; this exercises the REPORTING fold, which a live run would otherwise
  // be the only way to reach.
  const author = new PiPhaseAuthor({
    cwd: process.cwd(),
    isWriteAllowed: () => true,
    endpoint: {
      providerId: PI_SUBSCRIPTION_PROVIDER_ID,
      baseUrl: "https://api.anthropic.com",
      modelId: PI_SUBSCRIPTION_DEFAULT_MODEL,
      api: "anthropic-messages",
      contextWindow: 200_000,
      maxTokens: 8_192,
      apiKey: FAKE_SUBSCRIPTION_TOKEN,
    },
  });
  // BEFORE any slice: the empty-runs fallback. A leaf that ran nothing must SAY so — an empty
  // parenthesis would read as a run that happened and reported nothing.
  const empty = liveLeafLines(author).join("\n");
  assert.match(empty, /\(no slices ran\)/);
  assert.doesNotMatch(empty, /^tokens:/m, "no slice reported usage, so there is no tokens line");

  author.runs.push({
    phase: "AUTHOR_TEST",
    source: "pi-leaf",
    subtype: "success",
    turns: 2,
    model: "m",
    usage: {
      inputTokens: 2,
      outputTokens: 122,
      cacheReadInputTokens: 27974,
      cacheCreationInputTokens: 174,
    },
  });

  const clean = liveLeafLines(author).join("\n");
  assert.match(clean, /leaf: *pi/);
  assert.ok(
    clean.includes(PI_LEAF_ENDPOINT_LABEL),
    `the leaf line must name the endpoint: ${clean}`,
  );
  assert.match(clean, /AUTHOR_TEST: success, 2 turns/);
  assert.doesNotMatch(clean, /no slices ran/);
  // The token breakdown, in full — every field, so dropping one is caught.
  assert.match(
    clean,
    /tokens: +AUTHOR_TEST: 122 out \/ 2 in \/ 27974 cache-read \/ 174 cache-write/,
  );
  // NEVER a USD figure: pi meters nothing this process can read, and printing a zero would be a
  // claim about spend rather than the absence of one (ADR-0232's reasoning, ADR-0449's credential).
  assert.doesNotMatch(clean, /\$[0-9]/);
  assert.match(clean, /subscription draw/);
  assert.match(clean, /no write refusals/);
  assert.match(clean, /no off-surface tool calls/);

  // Now the two wall kinds together. They must NOT be folded: a `tool-surface` refusal carries no
  // path and is not a write-fence firing, so counting it as one inflates the single number that
  // line exists to report (the ADR-0446 split, applied to the human-readable surface).
  author.violations.push({
    phase: "AUTHOR_TEST",
    tool: "write",
    path: "impl.cjs",
    reason: "write refused by phase scope",
    kind: "scope",
  });
  author.violations.push({
    phase: "AUTHOR_TEST",
    tool: "bash",
    path: "(no path)",
    reason: "not on the authoring tool surface",
    kind: "tool-surface",
  });
  const walls = liveLeafLines(author).join("\n");
  const scopeLine = walls.split("\n").find((l) => l.startsWith("scope walls:")) ?? "";
  const surfaceLine = walls.split("\n").find((l) => l.startsWith("tool surface:")) ?? "";
  assert.match(scopeLine, /impl\.cjs/);
  assert.doesNotMatch(scopeLine, /bash/, "a tool-surface refusal must not appear as a write refusal");
  assert.match(surfaceLine, /bash/);
  assert.doesNotMatch(surfaceLine, /impl\.cjs/);
});

// ── The narrowing, asserted IN THIS PACKAGE ────────────────────────────────────────────────────
//
// `packages/cli` drives both verbs through `run()` and asserts the same refusals. These are not
// duplicates of those: the refusals LIVE here, and a guard whose only test sits in another package
// is one the mutation rung cannot attribute — it reported these very lines as reached by nothing.
// Same reason the fence's scope predicate is proved where it is consumed rather than where it is
// declared. Neither call spends: both refuse before any leaf is constructed.

test("nodeBuild REFUSES --runtime pi with --real, and refuses a USD cap on it", async () => {
  const real = await nodeBuild("library-cli", {
    dryRun: false,
    real: true,
    runtime: "pi",
    actor: "t@example.com",
  });
  assert.equal(real.ok, false);
  assert.match(real.body, /--runtime pi is admitted for --live only/);
  assert.match(real.body, /ADR-0449/);
  // The refusal must say what it is protecting, not just say no.
  assert.match(real.body, /promotes\s+a commit toward main/);

  const budget = await nodeBuild("library-cli", {
    dryRun: false,
    live: true,
    runtime: "pi",
    budgetUsd: 1,
    actor: "t@example.com",
  });
  assert.equal(budget.ok, false);
  assert.match(budget.body, /--budget is unavailable with --runtime pi/);
  assert.match(budget.body, /--max-turns is\s+the leaf's real cost guard/);

  // The SAME flags on claude are NOT refused by these guards — so the refusals are pi-specific
  // rather than a blanket block that would read identically from outside.
  const claude = await nodeBuild("library-cli", {
    dryRun: false,
    real: true,
    runtime: "claude",
    actor: "t@example.com",
  });
  assert.doesNotMatch(claude.body, /--runtime pi is admitted/);
});

test("storyBuild REFUSES --runtime pi with --real, and refuses a USD cap on it", async () => {
  const real = await storyBuild("library", {
    dryRun: false,
    real: true,
    runtime: "pi",
    actor: "t@example.com",
  });
  assert.equal(real.ok, false);
  assert.match(real.body, /--runtime pi is admitted for --live only/);
  assert.match(real.body, /ADR-0449/);

  const budget = await storyBuild("library", {
    dryRun: false,
    live: true,
    runtime: "pi",
    budgetUsd: 1,
    actor: "t@example.com",
  });
  assert.equal(budget.ok, false);
  assert.match(budget.body, /--budget is unavailable with --runtime pi/);

  const claude = await storyBuild("library", {
    dryRun: false,
    real: true,
    runtime: "claude",
    actor: "t@example.com",
  });
  assert.doesNotMatch(claude.body, /--runtime pi is admitted/);
});
