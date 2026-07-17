import test from "node:test";
import assert from "node:assert/strict";
import { Criterion } from "./criterion.js";
import type { ModelRegistry } from "./model-registry.js";
import { MODEL_REGISTRY_VERSION, SEED_MODEL_REGISTRY } from "./model-registry.js";
import { resolveStoryWitnesses, resolveWitness } from "./model-uat-witness.js";
import type { WitnessResolution } from "./model-uat-witness.js";
// Namespace import of the package's PUBLIC entry point (`@storytree/model-uat` →
// `src/index.ts`) — deliberately separate from the internal-file imports above, and
// typed loosely (cast at each use site) so this file compiles regardless of what
// `index.ts` currently exports. A downstream story depends on the package root, not
// on reaching into `model-uat-witness.js` directly.
import * as ModelUatPackageRoot from "./index.js";

/**
 * Story UAT for `model-uat-witness` (ADR-0209): the integrated acceptance walkthrough proving the
 * `model-uat-witness.ts` facade end-to-end against the REAL `criterion.ts` parser/validator and the
 * REAL `model-registry.ts` resolver — the story-level composition glue over the three delivered
 * capabilities (`three-kind-witness`, `model-tier-classification`, `model-eligibility-registry`).
 *
 * Every leg below is `(witness: machine)` (deterministic, offline, spine-observable) — this
 * foundation is itself proven by a machine witness. No DB, SDK, API key, or live model.
 *
 * The journey: a criterion's declared witness resolves to `machine` / `human` (as declared),
 * `legacy-unresolved` (an untagged criterion, never defaulted into model judgment), or — for a
 * `model` criterion — the eligibility outcome (`model-eligible` with the substituting judge, or a
 * distinct `model-hold`) against an explicit, versioned registry.
 */

const STORY = "model-uat-witness-demo";

// ---------------------------------------------------------------------------
// Leg 1 + 2 — classify the three kinds, and legacy stays unresolved
// ---------------------------------------------------------------------------

const JOURNEY_BODY = `## UAT Test Criteria

1. **Machine leg** _(witness: machine)_: a deterministic, spine-observed proof.
2. **Human leg** _(witness: human)_: irreducible operator judgment.
3. **Model leg, advanced** _(witness: model)(tier: advanced)_: judged by an eligible registered judge.
4. **Legacy leg:** an existing untagged criterion awaiting explicit migration.
`;

test("UAT leg 1: the three kinds classify explicitly and distinctly", () => {
  const results = resolveStoryWitnesses(STORY, JOURNEY_BODY, SEED_MODEL_REGISTRY);
  assert.equal(results.length, 4);
  assert.equal(results[0]!.status, "machine");
  assert.equal(results[1]!.status, "human");
  assert.notEqual(results[0]!.status, results[1]!.status);
  // The model leg never collapses into machine or human.
  assert.notEqual(results[2]!.status, "machine");
  assert.notEqual(results[2]!.status, "human");
  assert.ok(
    results[2]!.status === "model-eligible" || results[2]!.status === "model-hold",
    "a model criterion resolves to one of the model-specific outcomes, never machine/human",
  );
});

test("UAT leg 2: an untagged legacy criterion stays unresolved and never defaults into model judgment", () => {
  const results = resolveStoryWitnesses(STORY, JOURNEY_BODY, SEED_MODEL_REGISTRY);
  const legacy = results[3]!;
  assert.equal(legacy.status, "legacy-unresolved");
  assert.notEqual(legacy.status, "model-eligible");
  assert.notEqual(legacy.status, "model-hold");
  assert.ok(!("tier" in legacy), "a legacy-unresolved resolution carries no model tier");

  // The legacy outcome is independent of the registry — it never even looks at eligibility.
  const emptyRegistry: ModelRegistry = { version: MODEL_REGISTRY_VERSION, models: [] };
  const legacyAgain = resolveStoryWitnesses(STORY, JOURNEY_BODY, emptyRegistry)[3]!;
  assert.equal(legacyAgain.status, "legacy-unresolved");
});

test("UAT leg 2 (direct call): resolveWitness on a bare-parsed legacy criterion is legacy-unresolved", () => {
  const legacy = Criterion.parse({ id: `${STORY}#uat-9`, title: "Untagged" });
  const resolution: WitnessResolution = resolveWitness(legacy, SEED_MODEL_REGISTRY);
  assert.equal(resolution.status, "legacy-unresolved");
});

// ---------------------------------------------------------------------------
// Leg 3 — a model criterion declares its tier, and the facade surfaces it
// ---------------------------------------------------------------------------

const ADVANCED_BODY = `## UAT Test Criteria

1. **Model leg, advanced** _(witness: model)(tier: advanced)_: judged by a registered advanced-or-stronger judge.
`;

const FRONTIER_BODY = `## UAT Test Criteria

1. **Model leg, frontier** _(witness: model)(tier: frontier)_: judged by a registered frontier judge.
`;

test("UAT leg 3: an advanced-tier model criterion resolves eligible under a frontier-only registry (tier surfaced)", () => {
  const frontierOnly: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "fable", tier: "frontier", available: true }],
  };
  const [result] = resolveStoryWitnesses(STORY, ADVANCED_BODY, frontierOnly);
  assert.equal(result!.status, "model-eligible");
  if (result!.status === "model-eligible") {
    assert.equal(result!.tier, "advanced", "the resolution carries the criterion's own declared tier");
  }
});

test("UAT leg 3: a frontier-tier model criterion carries its own declared tier through resolution", () => {
  const [result] = resolveStoryWitnesses(STORY, FRONTIER_BODY, SEED_MODEL_REGISTRY);
  assert.equal(result!.status, "model-eligible");
  if (result!.status === "model-eligible") {
    assert.equal(result!.tier, "frontier");
  }
});

test("UAT leg 3: the facade refuses at the parse boundary exactly as the underlying parser does", () => {
  const missingTierBody = "## UAT Test Criteria\n\n1. **Bad** _(witness: model)_: no tier declared.\n";
  assert.throws(
    () => resolveStoryWitnesses(STORY, missingTierBody, SEED_MODEL_REGISTRY),
    /tier/i,
    "a model criterion with no preclassified minimum tier is refused, never defaulted",
  );
});

// ---------------------------------------------------------------------------
// Leg 4 — an eligible registered judge witnesses; a stronger tier substitutes upward
// ---------------------------------------------------------------------------

test("UAT leg 4: the frontier judge substitutes upward to satisfy an advanced requirement", () => {
  const frontierOnly: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "fable", tier: "frontier", available: true }],
  };
  const [result] = resolveStoryWitnesses(STORY, ADVANCED_BODY, frontierOnly);
  assert.equal(result!.status, "model-eligible");
  if (result!.status === "model-eligible") {
    assert.equal(result!.judge.id, "fable");
    assert.equal(result!.judge.tier, "frontier", "a stronger judge substitutes upward for a weaker requirement");
  }
});

test("UAT leg 4: an advanced-only registry never satisfies a frontier requirement", () => {
  const advancedOnly: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "opus-class-judge", tier: "advanced", available: true }],
  };
  const [result] = resolveStoryWitnesses(STORY, FRONTIER_BODY, advancedOnly);
  assert.equal(result!.status, "model-hold", "an advanced judge must never satisfy a frontier requirement");
});

// ---------------------------------------------------------------------------
// Leg 5 — an unavailable required tier HOLDS, honestly (never downgraded/rerouted/relabelled)
// ---------------------------------------------------------------------------

test("UAT leg 5: an unavailable frontier judge holds, even with a weaker available judge present", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [
      { id: "fable", tier: "frontier", available: false },
      { id: "opus-class-judge", tier: "advanced", available: true },
    ],
  };
  const [result] = resolveStoryWitnesses(STORY, FRONTIER_BODY, registry);
  assert.equal(result!.status, "model-hold", "an unavailable frontier judge must hold, never downgrade to advanced");
  if (result!.status === "model-hold") {
    assert.equal(result!.tier, "frontier", "the hold still reports the criterion's own required tier");
    assert.equal(typeof result!.reason, "string");
    assert.ok(result!.reason.length > 0, "a hold carries a reason, never a silent signal");
  }
  // Never laundered into machine or human.
  assert.notEqual(result!.status, "machine");
  assert.notEqual(result!.status, "human");
  assert.notEqual(result!.status, "legacy-unresolved");
});

// ---------------------------------------------------------------------------
// Leg 6 — no self-declared judge, no unregistered tier
// ---------------------------------------------------------------------------

test("UAT leg 6: an empty registry never invents an eligible judge for any declared tier", () => {
  const empty: ModelRegistry = { version: MODEL_REGISTRY_VERSION, models: [] };
  const advancedResult = resolveStoryWitnesses(STORY, ADVANCED_BODY, empty)[0]!;
  const frontierResult = resolveStoryWitnesses(STORY, FRONTIER_BODY, empty)[0]!;
  assert.equal(advancedResult.status, "model-hold");
  assert.equal(frontierResult.status, "model-hold");
});

test("UAT leg 6: only a registered entry confers eligibility — an unregistered id is never substituted in", () => {
  const registry: ModelRegistry = {
    version: MODEL_REGISTRY_VERSION,
    models: [{ id: "fable", tier: "frontier", available: true }],
  };
  const [result] = resolveStoryWitnesses(STORY, ADVANCED_BODY, registry);
  assert.equal(result!.status, "model-eligible");
  if (result!.status === "model-eligible") {
    assert.notEqual(result!.judge.id, "self-declared-model", "only a registered id can ever be returned");
  }
});

// ---------------------------------------------------------------------------
// End-to-end: the whole journey is deterministic (same inputs, same outputs)
// ---------------------------------------------------------------------------

test("end-to-end: resolving the same story body against the same registry is deterministic", () => {
  const first = resolveStoryWitnesses(STORY, JOURNEY_BODY, SEED_MODEL_REGISTRY);
  const second = resolveStoryWitnesses(STORY, JOURNEY_BODY, SEED_MODEL_REGISTRY);
  assert.deepEqual(first, second);
});

test("end-to-end: a story with no UAT section resolves to no witnesses (backward-compatible)", () => {
  assert.deepEqual(resolveStoryWitnesses(STORY, "# Just a heading\n\nno uat here\n", SEED_MODEL_REGISTRY), []);
});

// ---------------------------------------------------------------------------
// Leg 7 — the STORY's public package entry point exposes the composed facade
// ---------------------------------------------------------------------------
//
// A downstream story depends on `@storytree/model-uat` (the package root,
// `src/index.ts`), never on reaching into `model-uat-witness.ts` directly. Today
// `index.ts` is a placeholder (`export {}` — "reserved for subsequent leaf units"),
// so the story's outcome, though fully proven internally above, is not yet a
// consumable contract at the package boundary. These regress until `index.ts`
// re-exports the composed facade.

test("UAT leg 7: the package root exports resolveStoryWitnesses as a callable function", () => {
  const facade = ModelUatPackageRoot as unknown as Record<string, unknown>;
  assert.equal(
    typeof facade.resolveStoryWitnesses,
    "function",
    "the package root (@storytree/model-uat) must export resolveStoryWitnesses — the story's public composed facade — not leave it reachable only via the internal model-uat-witness.js file",
  );
});

test("UAT leg 7: resolveStoryWitnesses from the package root resolves a full journey identically to the internal facade", () => {
  const facade = ModelUatPackageRoot as unknown as {
    resolveStoryWitnesses?: (storyId: string, body: string, registry: ModelRegistry) => WitnessResolution[];
    SEED_MODEL_REGISTRY?: ModelRegistry;
  };
  assert.equal(typeof facade.resolveStoryWitnesses, "function", "resolveStoryWitnesses must be exported from the package root");
  assert.equal(typeof facade.SEED_MODEL_REGISTRY, "object", "SEED_MODEL_REGISTRY must be exported from the package root");

  const viaPackageRoot = facade.resolveStoryWitnesses!(STORY, JOURNEY_BODY, facade.SEED_MODEL_REGISTRY!);
  const viaInternalFile = resolveStoryWitnesses(STORY, JOURNEY_BODY, SEED_MODEL_REGISTRY);
  assert.deepEqual(
    viaPackageRoot,
    viaInternalFile,
    "the package root's facade must resolve the same journey to the exact same outcome as the internal file",
  );
});
