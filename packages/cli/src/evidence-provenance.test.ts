import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * A COMMITTED DERIVED PICTURE CARRIES ITS OWN PRODUCER, AND THE COMPOSER WILL NOT MIX CODE STATES
 * (increment `committed-derived-evidence-carries-producer`, on `chapter2-code-generated-organic-art-arc`).
 *
 * The art track decides art-direction questions by LOOKING at committed pictures, so a picture that
 * has gone stale does not merely mislead — it decides wrongly. Three measured observations, three
 * different artifacts:
 *
 *  1. `frames/contact-sheet.png` sat labelled v6 for two increments; `grep -rn contact-sheet *.py`
 *     found NO producer, and the invocation had to be back-solved from the image's own dimensions.
 *  2. `framing-fork.png`, the owner-facing evidence for an open fork, was silently contradicted by a
 *     re-render of the track beside it.
 *  3. `crown-normals-fork.png` was composed by `sheet.py` from five variant directories, four
 *     rendered BEFORE a canopy constant existed and one after. A picture whose whole purpose was to
 *     isolate ONE lever varied two, with no error and no visible cue, and a table committed in
 *     `blender_tree.py`'s own source was false for four of its five rows.
 *
 * THE REMEDY IS A WRITER, NOT A CHECK, and that is a decided fork rather than an omission. The
 * owner rejected a cheap refuse-the-suspicious-write guard on 2026-08-12 (the ADR-0352 concurrent-write
 * fork) — *"i dislike A, feels like it may discourage legitimate cleanup"* — so a drift rung over
 * `docs/research/`'s 1,204 committed PNGs, whose honest churn is constant, is OUT OF SCOPE by
 * decision. There is deliberately NO `check:*` step and NO backfill: `provenance.py` refuses only
 * when two cells BOTH DECLARE a code state and the declarations DISAGREE, so every artifact made
 * before this change stays exactly as it is.
 *
 * WHY THE PROOF LIVES HERE, IN TYPESCRIPT, OVER A SUBPROCESS. The repo has no Python test runner and
 * introducing one is out of scope, so the producer is proved the way the repo already proves an
 * external tool: spawned for real, and skipped with a named reason when the host lacks it. A test in
 * `packages/cli/src` asserting over committed `docs/**` is `friction-inbox.test.ts`'s precedent.
 *
 * THE REFUSAL HALF NEEDS ONLY THE STANDARD LIBRARY, and that is why `sheet.py` runs its coherence
 * guard BEFORE it imports numpy/Pillow: the half with teeth then runs everywhere, CI included, where
 * the drawing half can only run on a host that has the imaging stack.
 */

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const trackDir = path.join(
  repoRoot, "docs", "research", "chapter2-code-only-art-2026-08-01", "blender-hero-v1",
);
const SHEET = path.join(trackDir, "sheet.py");
/** A real delivered frame: the cells must be genuine PNGs for the drawing half to mean anything. */
const FRAME = path.join(trackDir, "frames", "frame-18.png");

/** The marker the composer's refusal must carry, asserted verbatim so a WARNING cannot pass as one. */
const REFUSAL = "REFUSED: cells were not rendered at the same code state";

/**
 * The first interpreter that actually answers. Probed by RUNNING it rather than by looking it up:
 * on Windows `python3`/`py` are commonly the Microsoft Store shim, which resolves on PATH and then
 * does nothing useful.
 */
function findPython(): string | null {
  for (const candidate of ["python", "python3", "py"]) {
    const probe = spawnSync(candidate, ["-c", "print('storytree-ok')"], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.includes("storytree-ok")) return candidate;
  }
  return null;
}

const PY = findPython();
const HAS_IMAGING =
  PY !== null && spawnSync(PY, ["-c", "import numpy, PIL"], { encoding: "utf8" }).status === 0;

/** A variant directory shaped like a delivered one: one frame plus its `registration.json`. */
function variantDir(root: string, label: string, codeSha: string | null): string {
  const dir = path.join(root, label);
  mkdirSync(dir, { recursive: true });
  copyFileSync(FRAME, path.join(dir, "frame-18.png"));
  const registration: Record<string, unknown> = { track: label, frameCount: 1 };
  if (codeSha !== null) {
    registration["codeState"] = { generator: "blender_tree.py", sha256: codeSha };
  }
  writeFileSync(path.join(dir, "registration.json"), JSON.stringify(registration, null, 1));
  return dir;
}

function compose(root: string, out: string, cells: readonly string[]) {
  const res = spawnSync(
    PY as string,
    [SHEET, out, ...cells, "--frames", "18", "--zoom", "1"],
    { encoding: "utf8", cwd: root },
  );
  return { code: res.status, text: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

test("the composer REFUSES to compose cells rendered at different code states", (t) => {
  if (PY === null) {
    t.skip("no working Python interpreter on this host; a stand-in would prove nothing");
    return;
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "storytree-evidence-mixed-"));
  variantDir(root, "mix000", SHA_A);
  variantDir(root, "mix100", SHA_B);
  const out = path.join(root, "fork.png");

  const { code, text } = compose(root, out, [
    `mix000=${path.join(root, "mix000")}`,
    `mix100=${path.join(root, "mix100")}`,
  ]);

  assert.notEqual(code, 0, `the composer must FAIL on a mixed-code-state set, got exit ${code}:\n${text}`);
  assert.ok(text.includes(REFUSAL), `expected the refusal marker, got:\n${text}`);
  assert.ok(text.includes("mix000"), `the refusal must name the disagreeing cells, got:\n${text}`);
  assert.ok(text.includes("mix100"), `the refusal must name the disagreeing cells, got:\n${text}`);
  assert.equal(
    existsSync(out), false,
    "a refused composition must leave no picture behind — a half-written fork sheet is the artifact this exists to prevent",
  );
});

test("a coherent set is NOT refused, and an undeclared cell polices nothing", (t) => {
  if (PY === null) {
    t.skip("no working Python interpreter on this host; a stand-in would prove nothing");
    return;
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "storytree-evidence-coherent-"));
  variantDir(root, "same0", SHA_A);
  variantDir(root, "same1", SHA_A);
  // No `codeState` at all: every one of the 1,204 pictures already committed looks like this, and
  // nothing here may police the past (the increment's scope, third bullet).
  variantDir(root, "legacy", null);

  const { text } = compose(root, path.join(root, "ok.png"), [
    `same0=${path.join(root, "same0")}`,
    `same1=${path.join(root, "same1")}`,
    `legacy=${path.join(root, "legacy")}`,
  ]);

  assert.ok(
    !text.includes("REFUSED"),
    `an agreeing set plus an undeclared cell must not be refused, got:\n${text}`,
  );
});

test("the composer writes a provenance sidecar naming itself, its command and a hash per input", (t) => {
  if (PY === null || !HAS_IMAGING) {
    t.skip("needs a Python with numpy + Pillow (the real imaging stack) to draw a sheet at all");
    return;
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "storytree-evidence-sidecar-"));
  variantDir(root, "v8", SHA_A);
  variantDir(root, "v9", SHA_A);
  const out = path.join(root, "v8-vs-v9.png");

  const { code, text } = compose(root, out, [
    `v8=${path.join(root, "v8")}`,
    `v9=${path.join(root, "v9")}`,
  ]);
  assert.equal(code, 0, `the composer must succeed on a coherent set:\n${text}`);
  assert.ok(existsSync(out), `expected the picture at ${out}:\n${text}`);

  const sidecarPath = `${out}.provenance.json`;
  assert.ok(existsSync(sidecarPath), `expected a provenance sidecar at ${sidecarPath}:\n${text}`);
  const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as {
    artifact?: string;
    producer?: { tool?: string; sha256?: string };
    command?: { argv?: string[] };
    inputs?: { label?: string; frames?: { file?: string; sha256?: string }[]; codeState?: unknown }[];
    codeState?: { sha256?: string | null };
  };

  assert.equal(sidecar.artifact, "v8-vs-v9.png", "the sidecar must name the artifact it belongs to");
  assert.equal(sidecar.producer?.tool, "sheet.py", "the sidecar must name the producer that wrote it");
  assert.match(
    sidecar.producer?.sha256 ?? "", /^[0-9a-f]{64}$/,
    "the producer must hash its OWN source: the tool is part of the code state that made the picture",
  );
  // Observation 1 cost ten minutes back-solving an unrecorded invocation out of the image's pixel
  // dimensions. The exact argv is what makes that reconstruction unnecessary.
  assert.deepEqual(
    sidecar.command?.argv?.slice(-4), ["--frames", "18", "--zoom", "1"],
    `the sidecar must record the exact command, got ${JSON.stringify(sidecar.command)}`,
  );
  assert.ok(
    (sidecar.command?.argv ?? []).some((a) => a.startsWith("v8=")),
    `the sidecar must record which directory each cell came from, got ${JSON.stringify(sidecar.command)}`,
  );
  assert.deepEqual(sidecar.inputs?.map((i) => i.label), ["v8", "v9"], "one input record per composed cell");
  for (const input of sidecar.inputs ?? []) {
    const frame = input.frames?.[0];
    assert.equal(frame?.file, "frame-18.png", `input ${input.label} must list the frames it composed`);
    assert.match(
      frame?.sha256 ?? "", /^[0-9a-f]{64}$/,
      `input ${input.label} must carry a content hash per composed frame`,
    );
  }
  assert.equal(
    sidecar.codeState?.sha256, SHA_A,
    "the sidecar must stamp the one code state every cell agreed on",
  );
});
