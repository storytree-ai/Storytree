---
id: "gate-emits-change"
tier: capability
story: binding-staleness
title: "The gate stamps the bound hash and emits a change event"
outcome: "When a unit is (re)proven WITH a binding, the prove-it-gate stamps the proved span's content-hash onto the signed verdict (boundHash) and emits an ADR-0016 ChangeEvent to the change-log sink — and when no binding is supplied it signs exactly as before, so the staleness model is woven in additively."
status: proposed
proof_mode: integration-test
depends_on: [boundhash-on-verdict, change-event-store]
decisions: [16]
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the node
# inner-loop buildable. EDIT-EXISTING (ADR-0057 §3 expansion C): the leaf adds a regression test that
# FAILS against current behaviour, then edits the EXISTING packages/orchestrator/src/prove-it-gate.ts.
# The red is genuine and runtime: at HEAD proveUnit ignores any binding, so the signed verdict carries
# no boundHash and no ChangeEvent is emitted — the new test's assertions fail until IMPLEMENT wires it.
# `install: true` + typecheck because the gate imports across packages (@storytree/core, @storytree/agent)
# — a fresh worktree needs the lockfile-only install; tsx strips types so only `tsc --noEmit` catches
# type errors (ADR-0031 §2). Single source file → the default node:test proof on the one test file is
# legal. The change is additive (gated on an OPTIONAL binding), so the orchestrator regression suite
# (every existing prove-it-gate test) stays green at the backstop.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/**/*.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/**/*.ts"]
  real:
    testFile: "packages/orchestrator/src/gate-emits-change.test.ts"
    sourceFile: "packages/orchestrator/src/prove-it-gate.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/gate-emits-change.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/prove-it-gate.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
    editsExisting: true
---

# The gate stamps the bound hash and emits a change event

**Outcome —** When a unit is (re)proven WITH a binding, the prove-it-gate stamps the proved span's
content-hash onto the signed verdict (`boundHash`) and emits an ADR-0016 `ChangeEvent` to the change-log
sink — and when no binding is supplied it signs exactly as before, so the staleness model is woven in
**additively**.

**Depends on —** [`boundhash-on-verdict`](boundhash-on-verdict.md) (the `Verdict.boundHash` field),
[`change-event-store`](change-event-store.md) (the `ChangeStore` sink + `ChangeEvent` shape).

> **The gap this closes (ADR-0016 §2-3).** The binding/staleness engine is inert until something
> RECORDS, at proof time, the hash of the code that was proved and emits the change event marking that
> baseline. The prove-it-gate (`packages/orchestrator/src/prove-it-gate.ts`) is the one place a unit is
> genuinely (re)proven on a clean committed tree — so it is where the binding is captured. This keeps the
> gate's honesty walls UNCHANGED (no new phase, no leaf-authored verdict): the binding is just extra
> provenance the SPINE stamps onto the verdict it already builds, and the ChangeEvent it already could
> append. Both are gated on an OPTIONAL `binding` so every existing caller is byte-for-byte unchanged.

## Guidance

Edit `packages/orchestrator/src/prove-it-gate.ts` — four small, additive touch-points:

**1. Type imports** (extend the existing `@storytree/core` type import block near the top):

```ts
import type { ChangeStore, ChangeEvent } from "@storytree/core";
```

**2. A `ProvenBinding` type + two OPTIONAL `ProveSpec` fields.** Add the interface near `ProveSpec`, and
the two fields inside the `ProveSpec` interface (both optional — absent = current behaviour):

```ts
/**
 * ADR-0016: the binding being proved. When present on a {@link ProveSpec}, the gate stamps
 * `verdict.boundHash` with `boundHash` and — if a {@link ProveSpec.changeStore} is also present —
 * emits a {@link ChangeEvent} recording the proof's content baseline. Absent on every pre-ADR-0016
 * caller, so the gate's existing behaviour is unchanged.
 */
export interface ProvenBinding {
  /** The content-hash (hashSpan) of the proved span at proof time → verdict.boundHash + the event's hashAfter. */
  boundHash: string;
  /** The prior signed boundHash this re-proof advances FROM; absent on a first proof (hashBefore = hashAfter). */
  priorHash?: string;
  /** The described "changed: why" for the emitted ChangeEvent; absent = an undescribed (demoted) change. */
  description?: string;
}
```

Inside `ProveSpec`:

```ts
  /** ADR-0016 (optional): the binding proved — stamps verdict.boundHash + emits a ChangeEvent. Absent = unchanged. */
  binding?: ProvenBinding;
  /** ADR-0016 (optional): the change-log sink the emitted ChangeEvent is appended to. Absent = no emission. */
  changeStore?: ChangeStore;
```

**3. Stamp `boundHash` onto the verdict** — in the existing verdict construction (Phase 5 GATE), add the
field via the spread-when-present idiom (so `exactOptionalPropertyTypes` stays happy and the key is
absent, not `undefined`, when there is no binding):

```ts
  const verdict: Verdict = {
    unitId: spec.unitId,
    proofMode: spec.proofMode,
    outcome: "pass",
    commitSha: tree.commitSha,
    signer: signer.signer,
    runId: spec.runId,
    evidence: [toEvidence(redObs), toEvidence(greenObs)],
    at: spec.now(),
    ...(spec.binding !== undefined ? { boundHash: spec.binding.boundHash } : {}),
  };
```

**4. Emit the `ChangeEvent`** — AFTER the existing signing `appendEvent(...)` call (the verdict is signed
first; the change event records what that signed verdict attests). `tree.commitSha` is already in scope:

```ts
  // ADR-0016: record WHAT code this proof attests — a ChangeEvent advancing the unit's bound hash
  // (provenance: the attested commit). Only when a binding AND a change-log sink are present; both are
  // absent for every pre-ADR-0016 caller, so existing behaviour is unchanged.
  if (spec.binding !== undefined && spec.changeStore !== undefined) {
    const change: ChangeEvent = {
      unitId: spec.unitId,
      hashBefore: spec.binding.priorHash ?? spec.binding.boundHash,
      hashAfter: spec.binding.boundHash,
      ...(spec.binding.description !== undefined ? { description: spec.binding.description } : {}),
      author: signer.signer,
      at: spec.now(),
      commitSha: tree.commitSha,
    };
    await spec.changeStore.appendChangeEvent(change);
  }
```

Touch NOTHING else — no phase change, no executor change, no honesty-wall change. The change is purely the
optional binding capture. (The orchestrator regression suite at the backstop re-runs every existing
prove-it-gate test; because both new fields are optional, those tests pass unchanged.)

### The test

`packages/orchestrator/src/gate-emits-change.test.ts` drives `proveUnit` through a normal red→green walk
with MINIMAL fakes (model the spec-builder on `prove-it-gate.test.ts`'s `freshSpec`, but you do NOT need
the OwnedLoopAuthor machinery — an inline always-ok `PhaseAuthor` and the existing `RecordingTestExecutor`
are enough). Skeleton:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/core";
import type { SignerInputs } from "@storytree/core";
import type { PhaseAuthor } from "@storytree/agent";
import { RecordingTestExecutor } from "./phase-machine.js";
import type { TestObservation } from "./phase-machine.js";
import { proveUnit } from "./prove-it-gate.js";
import type { ProveSpec, TreeState } from "./prove-it-gate.js";

const FIXED_NOW = "2026-06-16T00:00:00.000Z";
const CLEAN: TreeState = { commitSha: "deadbeefcafe", clean: true };
const SIGNER: SignerInputs = { flag: "sandbox:tester@run-1" };
const okAuthor: PhaseAuthor = { async author() { return { ok: true }; } };
const redThenGreen = (): TestObservation[] => [
  { result: "red", kind: "compile", testId: "T" },
  { result: "green", testId: "T" },
];

function buildSpec(store: InMemoryStore, extra: Partial<ProveSpec>): ProveSpec {
  return {
    unitId: "unit-1", proofMode: "contract", testId: "T",
    author: okAuthor, testExecutor: new RecordingTestExecutor(redThenGreen()),
    store, signerInputs: SIGNER, treeState: async () => CLEAN, now: () => FIXED_NOW,
    prompts: { authorTest: "t", implement: "i" }, runId: "run-1",
    ...extra,
  };
}
```

Write the two tests in the Contract below against this skeleton.

## Contract

1. **`gate-stamps-bound-hash-and-emits-change`** — proving a unit WITH a binding stamps `verdict.boundHash`
   and appends exactly one `ChangeEvent` to the change-log sink.
   - **asserts —** with `store = new InMemoryStore()` and `buildSpec(store, { binding: { boundHash: "h2", priorHash: "h1", description: "tightened the loop" }, changeStore: store })`:
     - `proveUnit(spec)` returns `ok: true` and `result.verdict.boundHash === "h2"`;
     - `await store.readChangeEvents({ unitId: "unit-1" })` has length 1, and that event is
       `{ unitId: "unit-1", hashBefore: "h1", hashAfter: "h2", description: "tightened the loop", author: <the resolved signer>, at: "2026-06-16T00:00:00.000Z", commitSha: "deadbeefcafe" }`
       (the resolved signer is whatever `resolveSigner({ flag: "sandbox:tester@run-1" })` yields — read it
       off `result.verdict.signer`);
     - a FIRST proof (no `priorHash`: `binding: { boundHash: "h2" }`) emits an event whose `hashBefore`
       equals `hashAfter` (`"h2"`) and whose `description` key is ABSENT (an undescribed baseline).
2. **`no-binding-signs-exactly-as-before`** — proving WITHOUT a binding is byte-for-byte the old behaviour.
   - **asserts —** with `buildSpec(store, {})` (no `binding`, no `changeStore`):
     - `proveUnit(spec)` returns `ok: true` and `result.verdict.boundHash` is `undefined` (the key is absent);
     - `await store.readChangeEvents()` returns `[]` — no change event was emitted.
   - **proven by —** `packages/orchestrator/src/gate-emits-change.test.ts` (authored by the leaf inside the
     gate's AUTHOR_TEST phase; the spine observes the red — at HEAD `proveUnit` ignores the binding, so
     `verdict.boundHash` is undefined and no `ChangeEvent` is emitted — before IMPLEMENT wires the capture).
