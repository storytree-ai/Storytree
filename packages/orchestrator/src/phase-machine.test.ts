import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextPhase,
  advancePhase,
  PathWriteScope,
  globMatch,
  RecordingTestExecutor,
} from "./phase-machine.js";
import type { TestObservation } from "./phase-machine.js";

const RED: TestObservation = { result: "red", kind: "runtime", testId: "t1" };
const GREEN: TestObservation = { result: "green", testId: "t1" };

test("nextPhase: CONFIRM_RED -> IMPLEMENT requires an observed red", () => {
  const ok = nextPhase("CONFIRM_RED", RED);
  assert.deepEqual(ok, { ok: true, next: "IMPLEMENT" });
});

test("nextPhase: CONFIRM_RED rejects a green (a forged/early pass)", () => {
  const bad = nextPhase("CONFIRM_RED", GREEN);
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && /requires an observed red/.test(bad.reason));
});

// ── The red must be the RIGHT KIND (`gate-the-right-kind-red`) ───────────────
//
// `nextPhase` gated on `obs.result === "red"` alone, so ANY red advanced CONFIRM_RED — a syntax
// error in the fresh test, an unrelated pre-existing failure in scope, a timeout kill. The kind was
// computed on every red and read in exactly one place: the evidence note. Derived, published, and
// never allowed to refuse. These arm it against the node's DECLARED expectation — and only on a
// MEASURED kind, because refusing real work on a text guess is not an improvement.

/** A measured red of the given kind (the assert-oracle count basis — the only gated one). */
const measuredRed = (kind: "compile" | "runtime"): TestObservation => ({
  result: "red",
  kind,
  testId: "t1",
  kindBasis: "oracle-count",
});

test("right-kind-red: a MEASURED structural red satisfies a net-new node and is refused for editsExisting", () => {
  // net-new / refactorForTests declare `structural` — the missing symbol IS the point.
  assert.deepEqual(nextPhase("CONFIRM_RED", measuredRed("compile"), "structural"), {
    ok: true,
    next: "IMPLEMENT",
  });
  // editsExisting declares `assertion`: a structural red means the test could not resolve what it
  // imports, so a passing implementation would silence it without proving behaviour changed.
  const bad = nextPhase("CONFIRM_RED", measuredRed("compile"), "assertion");
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && /observed a compile red/.test(bad.reason));
  assert.ok(!bad.ok && /declares a assertion red \(runtime\)/.test(bad.reason));
  assert.ok(!bad.ok && /WRONG red/.test(bad.reason));
});

test("right-kind-red: a MEASURED assertion red satisfies editsExisting and is refused for a net-new node", () => {
  assert.deepEqual(nextPhase("CONFIRM_RED", measuredRed("runtime"), "assertion"), {
    ok: true,
    next: "IMPLEMENT",
  });
  const bad = nextPhase("CONFIRM_RED", measuredRed("runtime"), "structural");
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && /observed a runtime red/.test(bad.reason));
  assert.ok(!bad.ok && /net-new seam/.test(bad.reason));
});

test("right-kind-red: an UNMEASURED (text-inferred) kind never refuses — the heuristic is not a gate", () => {
  // THE false-refusal fence. `defaultClassifyKind` mis-read Node's own `Cannot find module` for as
  // long as nothing consumed its answer, so a text guess must never be able to refuse real work: a
  // wrong-kind text red advances exactly as it did before, in BOTH directions.
  const textRed: TestObservation = {
    result: "red",
    kind: "runtime",
    testId: "t1",
    kindBasis: "output-text",
  };
  assert.deepEqual(nextPhase("CONFIRM_RED", textRed, "structural"), { ok: true, next: "IMPLEMENT" });
  const textCompile: TestObservation = { ...textRed, kind: "compile" };
  assert.deepEqual(nextPhase("CONFIRM_RED", textCompile, "assertion"), { ok: true, next: "IMPLEMENT" });
});

test("right-kind-red: no declared expectation, or no kind at all, leaves the pre-existing behaviour exactly", () => {
  // The dry-run / live-smoke arms prove a SYNTHETIC pair and declare nothing — a gate with nothing
  // to check against must not invent an expectation.
  assert.deepEqual(nextPhase("CONFIRM_RED", measuredRed("compile")), { ok: true, next: "IMPLEMENT" });
  assert.deepEqual(nextPhase("CONFIRM_RED", measuredRed("runtime")), { ok: true, next: "IMPLEMENT" });
  // A kind-less observation is unjudgeable, not wrong.
  const kindless: TestObservation = { result: "red", testId: "t1", kindBasis: "oracle-count" };
  assert.deepEqual(nextPhase("CONFIRM_RED", kindless, "assertion"), { ok: true, next: "IMPLEMENT" });
});

test("right-kind-red: a GREEN at CONFIRM_RED is still refused as a forged pass, whatever is declared", () => {
  // The kind gate is ADDITIVE — it must not become a way past the original red requirement.
  for (const expected of ["structural", "assertion"] as const) {
    const forged = nextPhase("CONFIRM_RED", { result: "green", testId: "t1" }, expected);
    assert.equal(forged.ok, false);
    assert.ok(!forged.ok && /requires an observed red/.test(forged.reason));
  }
});

test("nextPhase: CONFIRM_GREEN -> GATE requires an observed green", () => {
  const ok = nextPhase("CONFIRM_GREEN", GREEN);
  assert.deepEqual(ok, { ok: true, next: "GATE" });
});

test("nextPhase: CONFIRM_GREEN rejects a red", () => {
  const bad = nextPhase("CONFIRM_GREEN", RED);
  assert.equal(bad.ok, false);
});

test("nextPhase: AUTHOR_TEST and IMPLEMENT are NOT observation gates (fail-closed)", () => {
  // These advance on an authoring-complete signal, not an obs gate.
  assert.equal(nextPhase("AUTHOR_TEST", RED).ok, false);
  assert.equal(nextPhase("IMPLEMENT", GREEN).ok, false);
});

test("nextPhase: GATE is terminal — no further observation gate", () => {
  assert.equal(nextPhase("GATE", GREEN).ok, false);
});

test("nextPhase rejects a forged transition (claiming green to skip the red gate)", () => {
  // Attempting CONFIRM_RED with a forged green must be refused — the illegal gate is rejected.
  const forged = nextPhase("CONFIRM_RED", { result: "green", testId: "forged" });
  assert.equal(forged.ok, false);
});

test("advancePhase: the two authoring-complete advances are legal", () => {
  assert.deepEqual(advancePhase("AUTHOR_TEST"), { ok: true, next: "CONFIRM_RED" });
  assert.deepEqual(advancePhase("IMPLEMENT"), { ok: true, next: "CONFIRM_GREEN" });
});

test("advancePhase: observation-gate and terminal phases do not authoring-advance", () => {
  assert.equal(advancePhase("CONFIRM_RED").ok, false);
  assert.equal(advancePhase("CONFIRM_GREEN").ok, false);
  assert.equal(advancePhase("GATE").ok, false);
});

test("the full legal path AUTHOR_TEST -> ... -> GATE composes", () => {
  let phase: "AUTHOR_TEST" | "CONFIRM_RED" | "IMPLEMENT" | "CONFIRM_GREEN" | "GATE" =
    "AUTHOR_TEST";

  const a1 = advancePhase(phase);
  assert.ok(a1.ok);
  phase = a1.next;
  assert.equal(phase, "CONFIRM_RED");

  const t1 = nextPhase(phase, RED);
  assert.ok(t1.ok);
  phase = t1.next;
  assert.equal(phase, "IMPLEMENT");

  const a2 = advancePhase(phase);
  assert.ok(a2.ok);
  phase = a2.next;
  assert.equal(phase, "CONFIRM_GREEN");

  const t2 = nextPhase(phase, GREEN);
  assert.ok(t2.ok);
  phase = t2.next;
  assert.equal(phase, "GATE");
});

// ---- write-scope (ADR-0020 §2) ----

const scope = new PathWriteScope({
  testGlobs: ["**/*.test.ts", "src/**/*.test.ts"],
  sourceGlobs: ["src/**/*.ts"],
});

test("write-scope: a TEST path is writable ONLY in AUTHOR_TEST", () => {
  const testPath = "src/feature/thing.test.ts";
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", testPath), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", testPath), false);
  assert.equal(scope.isWriteAllowed("CONFIRM_RED", testPath), false);
  assert.equal(scope.isWriteAllowed("CONFIRM_GREEN", testPath), false);
  assert.equal(scope.isWriteAllowed("GATE", testPath), false);
});

test("write-scope: a SOURCE path is writable ONLY in IMPLEMENT", () => {
  const srcPath = "src/feature/thing.ts";
  assert.equal(scope.isWriteAllowed("IMPLEMENT", srcPath), true);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", srcPath), false);
  assert.equal(scope.isWriteAllowed("CONFIRM_RED", srcPath), false);
  assert.equal(scope.isWriteAllowed("GATE", srcPath), false);
});

test("write-scope: a test path is NOT writable as source in IMPLEMENT (test author != code author)", () => {
  // The .test.ts matches both globs; it stays test-owned and is denied in IMPLEMENT.
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "src/x.test.ts"), false);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", "src/x.test.ts"), true);
});

test("write-scope: an unmatched path is denied in every phase (fail-closed)", () => {
  const stray = "docs/readme.md";
  for (const p of ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"] as const) {
    assert.equal(scope.isWriteAllowed(p, stray), false);
  }
});

test("write-scope: matches Windows backslash paths too", () => {
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", "src\\feature\\thing.test.ts"), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "src\\feature\\thing.ts"), true);
});

test("globMatch: ** spans segments, * stays within a segment", () => {
  assert.equal(globMatch("src/**/*.ts", "src/a/b/c.ts"), true);
  assert.equal(globMatch("src/**/*.ts", "src/c.ts"), true);
  assert.equal(globMatch("src/*.ts", "src/a/b.ts"), false); // single * does not cross /
  assert.equal(globMatch("**/*.test.ts", "deep/nested/x.test.ts"), true);
  assert.equal(globMatch("src/**/*.ts", "other/c.ts"), false);
});

// ---- RecordingTestExecutor (the spine OBSERVES, the model never claims) ----

test("RecordingTestExecutor replays scripted observations and records each testId", async () => {
  const exec = new RecordingTestExecutor([RED, GREEN]);
  const o1 = await exec.run("alpha");
  const o2 = await exec.run("beta");

  assert.deepEqual(o1, RED);
  assert.deepEqual(o2, GREEN);
  assert.deepEqual(exec.observed, ["alpha", "beta"]);
});

test("RecordingTestExecutor rejects on over-run (never a silent green)", async () => {
  const exec = new RecordingTestExecutor([RED]);
  await exec.run("alpha");
  await assert.rejects(() => exec.run("beta"), /exhausted/);
});
