import test from "node:test";
import assert from "node:assert/strict";
import type { Tier } from "./criterion.js";
import {
  MODEL_REGISTRY_VERSION,
  ModelRegistry,
  RegisteredModel,
  SEED_MODEL_REGISTRY,
  resolveJudge,
} from "./model-registry.js";

/**
 * Offline unit tests for the `model-eligibility-registry` capability (ADR-0209 D2).
 *
 * A criterion's required tier resolves against an explicit, VERSIONED registry:
 * a stronger registered judge substitutes upward, an unregistered or self-declared
 * model is ineligible, and a required tier with no available registered judge
 * HOLDS the criterion rather than downgrading, rerouting, or relabelling it.
 */

// ---------------------------------------------------------------------------
// the registry is explicit and versioned
// ---------------------------------------------------------------------------

test("registry schema: a registry carries an explicit schema version", () => {
  assert.equal(typeof MODEL_REGISTRY_VERSION, "number");
  assert.equal(SEED_MODEL_REGISTRY.version, MODEL_REGISTRY_VERSION);
});

test("registry schema: ModelRegistry.parse refuses a registry with no version", () => {
  assert.throws(() =>
    ModelRegistry.parse({ models: [{ id: "fable", tier: "frontier", available: true }] }),
  );
});

test("registry schema: ModelRegistry.parse refuses an unknown/extra field (strict)", () => {
  assert.throws(() =>
    ModelRegistry.parse({
      version: MODEL_REGISTRY_VERSION,
      models: [],
      extra: true,
    }),
  );
});

test("registry schema: RegisteredModel requires id, tier, and available", () => {
  assert.throws(() => RegisteredModel.parse({ id: "fable", tier: "frontier" }));
  assert.throws(() => RegisteredModel.parse({ id: "fable", available: true }));
  assert.throws(() => RegisteredModel.parse({ tier: "frontier", available: true }));
});

test("registry schema: RegisteredModel rejects an unrecognised tier value", () => {
  assert.throws(() => RegisteredModel.parse({ id: "x", tier: "basic", available: true }));
});

test("registry schema: a well-formed registry parses successfully", () => {
  const parsed = ModelRegistry.parse({
    version: 1,
    models: [{ id: "fable", tier: "frontier", available: true }],
  });
  assert.equal(parsed.models.length, 1);
  assert.equal(parsed.models[0]!.id, "fable");
});

// ---------------------------------------------------------------------------
// seed registry reflects today's reality
// ---------------------------------------------------------------------------

test("seed registry: Fable is registered as the admitted frontier judge, under its concrete Claude SDK runtime id", () => {
  const fable = SEED_MODEL_REGISTRY.models.find((m) => m.id === "claude-fable-5");
  assert.ok(fable, "claude-fable-5 must be registered in the seed (the live Claude SDK runtime id, not a bare label)");
  assert.equal(fable!.tier, "frontier");
  assert.equal(fable!.available, true);
});

test("seed registry: GPT-5.6 Sol is never admitted as an eligible-by-aspiration frontier judge", () => {
  const sol = SEED_MODEL_REGISTRY.models.find((m) => /sol|gpt-5\.6/i.test(m.id));
  // Either absent from the seed entirely, or explicitly marked unavailable —
  // never present as an available frontier/advanced judge.
  if (sol !== undefined) {
    assert.equal(sol.available, false, "an admitted-but-not-yet-live candidate must be unavailable, never eligible");
  }
});

test("seed registry: resolving a frontier requirement against the seed yields Fable, eligible, under its concrete runtime id", () => {
  const resolution = resolveJudge("frontier", SEED_MODEL_REGISTRY);
  assert.equal(resolution.status, "eligible");
  if (resolution.status === "eligible") {
    assert.equal(resolution.judge.id, "claude-fable-5");
    assert.equal(resolution.judge.tier, "frontier");
  }
});

test("seed registry: uses the live SDK runtime ids — claude-opus-4-8 (advanced) and claude-fable-5 (frontier) — never a bare label or a Cursor slug", () => {
  const opus = SEED_MODEL_REGISTRY.models.find((m) => m.id === "claude-opus-4-8");
  assert.ok(opus, "claude-opus-4-8 (the live SDK runtime id, headless-orchestrator.ts / ADR-0132) must be registered in the seed");
  assert.equal(opus!.tier, "advanced");
  assert.equal(opus!.available, true);

  const fable = SEED_MODEL_REGISTRY.models.find((m) => m.id === "claude-fable-5");
  assert.ok(fable, "claude-fable-5 must be registered in the seed");
  assert.equal(fable!.tier, "frontier");
  assert.equal(fable!.available, true);

  const cursorSlug = SEED_MODEL_REGISTRY.models.find((m) => m.id === "claude-fable-5-thinking-high");
  assert.equal(
    cursorSlug,
    undefined,
    "claude-fable-5-thinking-high is a Cursor model slug, not the Claude SDK runtime id, and must never be registered",
  );
});

test("seed registry: an advanced requirement resolves against the seed to the registered Opus-class judge, under its concrete runtime id", () => {
  const resolution = resolveJudge("advanced", SEED_MODEL_REGISTRY);
  assert.equal(resolution.status, "eligible");
  if (resolution.status === "eligible") {
    assert.equal(resolution.judge.id, "claude-opus-4-8");
    assert.equal(resolution.judge.tier, "advanced");
  }
});

// ---------------------------------------------------------------------------
// substitute upward only
// ---------------------------------------------------------------------------

test("substitution: a registered frontier judge satisfies an advanced requirement", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "fable", tier: "frontier", available: true }],
  };
  const resolution = resolveJudge("advanced", registry);
  assert.equal(resolution.status, "eligible");
  if (resolution.status === "eligible") {
    assert.equal(resolution.judge.id, "fable");
  }
});

test("substitution: a registered advanced judge never satisfies a frontier requirement", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "opus-class-judge", tier: "advanced", available: true }],
  };
  const resolution = resolveJudge("frontier", registry);
  assert.equal(resolution.status, "hold");
});

test("substitution: an advanced judge satisfies an advanced requirement (exact match)", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "opus-class-judge", tier: "advanced", available: true }],
  };
  const resolution = resolveJudge("advanced", registry);
  assert.equal(resolution.status, "eligible");
  if (resolution.status === "eligible") {
    assert.equal(resolution.judge.tier, "advanced");
  }
});

// ---------------------------------------------------------------------------
// unregistered or self-declared models are ineligible
// ---------------------------------------------------------------------------

test("unregistered: a model id absent from the registry cannot be resolved as eligible", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "fable", tier: "frontier", available: true }],
  };
  const resolution = resolveJudge("advanced", registry);
  assert.equal(resolution.status, "eligible");
  if (resolution.status === "eligible") {
    assert.notEqual(resolution.judge.id, "self-declared-model", "only a registered id can be returned");
  }
});

test("unregistered: an empty registry never invents an eligible judge for any required tier", () => {
  const empty: ModelRegistry = { version: MODEL_REGISTRY_VERSION, models: [] };
  const advancedResult = resolveJudge("advanced", empty);
  const frontierResult = resolveJudge("frontier", empty);
  assert.equal(advancedResult.status, "hold");
  assert.equal(frontierResult.status, "hold");
});

// ---------------------------------------------------------------------------
// unavailable holds — never launders to a lower tier or a human relabel
// ---------------------------------------------------------------------------

test("unavailable holds: a registered-but-unavailable frontier judge holds, even with a weaker available judge present", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [
      { id: "fable", tier: "frontier", available: false },
      { id: "opus-class-judge", tier: "advanced", available: true },
    ],
  };
  const resolution = resolveJudge("frontier", registry);
  assert.equal(resolution.status, "hold", "an unavailable frontier judge must hold, never downgrade to the advanced judge");
});

test("unavailable holds: a registered-but-unavailable judge cannot be returned as eligible for its own tier", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "fable", tier: "frontier", available: false }],
  };
  const resolution = resolveJudge("frontier", registry);
  assert.equal(resolution.status, "hold");
});

test("unavailable holds: hold is a distinct status, never `human` or any relabel of a classified kind", () => {
  const empty: ModelRegistry = { version: MODEL_REGISTRY_VERSION, models: [] };
  const resolution = resolveJudge("advanced", empty);
  assert.equal(resolution.status, "hold");
  // hold must never be reported under an eligible-shaped status such as "human" —
  // status is confined to the eligible|hold discriminant.
  assert.notEqual((resolution as { status: string }).status, "human");
  assert.notEqual((resolution as { status: string }).status, "eligible");
});

test("unavailable holds: a hold carries a reason string, not a silent/empty signal", () => {
  const empty: ModelRegistry = { version: MODEL_REGISTRY_VERSION, models: [] };
  const resolution = resolveJudge("frontier", empty);
  assert.equal(resolution.status, "hold");
  if (resolution.status === "hold") {
    assert.equal(typeof resolution.reason, "string");
    assert.ok(resolution.reason.length > 0);
  }
});

// ---------------------------------------------------------------------------
// pure function, no I/O
// ---------------------------------------------------------------------------

test("purity: resolveJudge is deterministic — same inputs, same output", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "fable", tier: "frontier", available: true }],
  };
  const first = resolveJudge("advanced", registry);
  const second = resolveJudge("advanced", registry);
  assert.deepEqual(first, second);
});

test("purity: the required-tier parameter is a Tier from model-tier-classification", () => {
  const requiredTier: Tier = "advanced";
  const registry: ModelRegistry = { version: MODEL_REGISTRY_VERSION, models: [] };
  const resolution = resolveJudge(requiredTier, registry);
  assert.equal(resolution.status, "hold");
});
