/**
 * Contract tests for the ADR-0016 gate extension (gate-emits-change capability):
 *
 *   (f) When a binding + changeStore are supplied, `proveUnit` stamps `verdict.boundHash` with the
 *       binding's content-hash AND emits a ChangeEvent to the change-log sink — woven in additively.
 *   (g) When no binding is supplied, `proveUnit` behaves exactly as before — `verdict.boundHash`
 *       absent, no ChangeEvent emitted — so every pre-ADR-0016 caller is unaffected.
 *
 * Both tests run a minimal inline `PhaseAuthor` (always-ok) and a `RecordingTestExecutor` driven
 * through the normal red→green walk. No `OwnedLoopAuthor` or `ScriptedModel` machinery is needed
 * here — the behaviour under test is purely in the GATE phase, after both observations are taken.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/core";
import type { SignerInputs } from "./proof/signer.js";
import type { PhaseAuthor } from "@storytree/agent";
import { RecordingTestExecutor } from "./phase-machine.js";
import type { TestObservation } from "./phase-machine.js";
import { proveUnit } from "./prove-it-gate.js";
import type { ProveSpec, TreeState, ProvenBinding } from "./prove-it-gate.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FIXED_NOW = "2026-06-16T00:00:00.000Z";
const CLEAN: TreeState = { commitSha: "deadbeefcafe", clean: true };
const SIGNER: SignerInputs = { flag: "sandbox:tester@run-1" };

/** Minimal leaf — always succeeds authoring; never claims a verdict. */
const okAuthor: PhaseAuthor = { async author() { return { ok: true }; } };

const redThenGreen = (): TestObservation[] => [
  { result: "red", kind: "compile", testId: "T" },
  { result: "green", testId: "T" },
];

/**
 * Build a minimal {@link ProveSpec}. `extra` is spread last so the caller can supply the new
 * ADR-0016 fields (`binding`, `changeStore`) without touching the base spec.
 *
 * After the gate-emits-change implementation lands, `ProveSpec` will include both fields and this
 * function typechecks cleanly; until then tsx strips the type annotation and the extra properties
 * are passed through at runtime, letting the behaviour-assertion red surface.
 */
function buildSpec(store: InMemoryStore, extra: Partial<ProveSpec>): ProveSpec {
  return {
    unitId: "unit-1",
    proofMode: "contract",
    testId: "T",
    author: okAuthor,
    testExecutor: new RecordingTestExecutor(redThenGreen()),
    store,
    signerInputs: SIGNER,
    treeState: async () => CLEAN,
    now: () => FIXED_NOW,
    prompts: { authorTest: "t", implement: "i" },
    runId: "run-1",
    ...extra,
  };
}

// ── (f) WITH BINDING ─────────────────────────────────────────────────────────

test(
  "(f) with binding + changeStore: verdict.boundHash stamped and ChangeEvent emitted",
  async () => {
    const store = new InMemoryStore();

    // The ProvenBinding describes the proved span's content-hash at sign time.
    const binding: ProvenBinding = {
      boundHash: "a1b2c3d4e5f678901234567890abcdef",
      priorHash: "0000000000000000000000000000000a",
      description: "refactored the gate to emit ADR-0016 change events",
    };

    const spec = buildSpec(store, { binding, changeStore: store });
    const result = await proveUnit(spec);

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // ── Verdict must carry boundHash ──────────────────────────────────────
    assert.equal(
      result.verdict.boundHash,
      binding.boundHash,
      "verdict.boundHash must be stamped with the supplied binding.boundHash",
    );

    // ── Exactly one ChangeEvent must have been emitted ────────────────────
    const changes = await store.readChangeEvents({ unitId: "unit-1" });
    assert.equal(changes.length, 1, "exactly one ChangeEvent must be emitted for the unit");

    const change = changes[0]!;
    assert.equal(change.unitId, "unit-1", "ChangeEvent.unitId");
    assert.equal(
      change.hashAfter,
      binding.boundHash,
      "hashAfter = the proved span's content-hash",
    );
    assert.equal(
      change.hashBefore,
      binding.priorHash,
      "hashBefore = the prior bound hash the proof advances from",
    );
    assert.equal(
      change.description,
      binding.description,
      "description propagated from binding.description",
    );
    assert.equal(
      change.author,
      "sandbox:tester@run-1",
      "author = the signer resolved for this proof",
    );
    assert.equal(
      change.commitSha,
      CLEAN.commitSha,
      "commitSha = the attested tree's commit (provenance)",
    );
    assert.equal(
      change.at,
      FIXED_NOW,
      "at = the injected now() (deterministic timestamp)",
    );
  },
);

// ── (g) WITHOUT BINDING ───────────────────────────────────────────────────────

test(
  "(g) without binding: verdict.boundHash absent and no ChangeEvent emitted (back-compat)",
  async () => {
    const store = new InMemoryStore();

    // No binding, no changeStore — the pre-ADR-0016 call shape.
    const spec = buildSpec(store, {});
    const result = await proveUnit(spec);

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // boundHash must be absent — the key is missing, not undefined-valued.
    assert.equal(
      result.verdict.boundHash,
      undefined,
      "verdict.boundHash must be absent when no binding is supplied",
    );

    // No ChangeEvent must have been emitted.
    const changes = await store.readChangeEvents();
    assert.equal(changes.length, 0, "no ChangeEvent must be emitted when no binding is supplied");
  },
);
