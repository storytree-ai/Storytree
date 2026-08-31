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

import { validatePiEndpoint } from "@storytree/agent";
import {
  PI_SUBSCRIPTION_DEFAULT_MODEL,
  PI_SUBSCRIPTION_PROVIDER_ID,
  composePiSubscriptionEndpoint,
} from "@storytree/orchestrator";

import { resolveLiveRuntime } from "./node-build.js";

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
