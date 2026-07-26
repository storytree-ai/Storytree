/**
 * Contract tests for the build spawn capture composition (story `context-traversal-spawn`,
 * capability `build-spawn-capture`, ADR-0235 / ADR-0241 / ADR-0192).
 *
 * Real-collaborator integration: every fixture is exercised end to end through the actual
 * `@storytree/context-traversal-capture` sink into a fresh temporary directory (never the real
 * `HOME`, never `STORYTREE_TRAVERSAL_DIR` from the ambient environment) — no stubbed store, no
 * mocked filesystem. Every assertion reads bytes back off disk (via a fresh `readTraversalSession`
 * call, or the raw file text itself), never a return value or a call count, per the node spec's
 * "fail-silent is not the same as unobserved" instruction.
 *
 * Covers the five contracts declared in `stories/context-traversal-spawn/build-spawn-capture.md`:
 *   1. parent-and-child-lanes-land-in-their-own-files
 *   2. an-absent-parent-session-is-a-total-no-op
 *   3. traversal-off-is-a-total-no-op
 *   4. capture-never-throws-and-never-changes-an-exit-code
 *   5. no-canary-text-ever-reaches-the-bytes
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readTraversalSession } from "@storytree/context-traversal-capture";

import { captureBuildSpawn } from "./build-capture.js";
import type { LeafSliceRun, LeafSliceUsage } from "./observe-leaf-slices.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `context-traversal-spawn-build-capture-${prefix}-`));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function usage(overrides: Partial<LeafSliceUsage> = {}): LeafSliceUsage {
  return {
    inputTokens: 100,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 10,
    ...overrides,
  };
}

function deterministicNow(): () => Date {
  return () => new Date("2026-07-26T12:00:00.000Z");
}

function deterministicNextId(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

test("parent-and-child-lanes-land-in-their-own-files: the parent's spawn/return lane and each child's own model-context observation land in their own separate on-disk files, with no cross-contamination", () => {
  const dir = makeTempDir("parent-child");
  try {
    const parentSessionId = "session-parent-1";
    const runId = "run-1";
    const unitId = "unit-a";
    const childPhase = "AUTHOR_TEST";
    const childSessionId = `${parentSessionId}__build__${runId}__${unitId}__${childPhase}`;

    const runs: LeafSliceRun[] = [
      {
        phase: childPhase,
        subtype: "success",
        turns: 2,
        usage: usage({ inputTokens: 500, cacheCreationInputTokens: 50, cacheReadInputTokens: 25, outputTokens: 30 }),
      },
    ];

    const returned = captureBuildSpawn({
      parentSessionId,
      runId,
      unitId,
      runs,
      dir,
      now: deterministicNow(),
      nextId: deterministicNextId(),
    });
    assert.equal(returned, undefined);

    const filesOnDisk = fs.readdirSync(dir).sort();
    assert.deepEqual(filesOnDisk, [`${childSessionId}.jsonl`, `${parentSessionId}.jsonl`].sort());

    // Parent file: read back through a FRESH reader — this proves durability across instances, not
    // an in-process object — and holds exactly the parent-lane events, scoped to the parent id.
    const parentReplay = readTraversalSession({ dir, sessionId: parentSessionId });
    assert.equal(parentReplay.skipped, 0);
    assert.deepEqual(
      parentReplay.replay.events.map((event) => event.kind),
      ["spawn_handoff", "result_return"],
    );
    for (const event of parentReplay.replay.events) {
      assert.equal(event.sessionId, parentSessionId);
    }

    // Child file: holds exactly its own model_context observation, scoped to the child id.
    const childReplay = readTraversalSession({ dir, sessionId: childSessionId });
    assert.equal(childReplay.skipped, 0);
    assert.deepEqual(
      childReplay.replay.events.map((event) => event.kind),
      ["model_context"],
    );
    assert.equal(childReplay.replay.events[0]?.sessionId, childSessionId);

    // No cross-contamination, asserted on the raw bytes rather than on the typed replay: the
    // parent's file must never contain the child's own event kind, and vice versa.
    const parentRaw = fs.readFileSync(path.join(dir, `${parentSessionId}.jsonl`), "utf8");
    assert.equal(parentRaw.includes("model_context"), false, "the parent's file must not contain a child event");

    const childRaw = fs.readFileSync(path.join(dir, `${childSessionId}.jsonl`), "utf8");
    assert.equal(childRaw.includes("spawn_handoff"), false, "the child's file must not contain a parent-lane event");
    assert.equal(childRaw.includes("result_return"), false, "the child's file must not contain a parent-lane event");
  } finally {
    removeTempDir(dir);
  }
});

test("an-absent-parent-session-is-a-total-no-op: a null or empty parentSessionId writes nothing, creates no directory and no file, and returns normally", () => {
  const runs: LeafSliceRun[] = [{ phase: "AUTHOR_TEST", subtype: "success", turns: 1, usage: usage() }];

  const base = makeTempDir("absent-parent");
  try {
    const emptyDir = path.join(base, "would-be-traces-empty");
    const emptyReturn = captureBuildSpawn({
      parentSessionId: "",
      runId: "run-1",
      unitId: "unit-a",
      runs,
      dir: emptyDir,
    });
    assert.equal(emptyReturn, undefined);
    assert.equal(fs.existsSync(emptyDir), false, "an empty parentSessionId must create no directory");

    const nullDir = path.join(base, "would-be-traces-null");
    const nullReturn = captureBuildSpawn({
      parentSessionId: null,
      runId: "run-1",
      unitId: "unit-a",
      runs,
      dir: nullDir,
    });
    assert.equal(nullReturn, undefined);
    assert.equal(fs.existsSync(nullDir), false, "a null parentSessionId must create no directory");
  } finally {
    removeTempDir(base);
  }
});

test("traversal-off-is-a-total-no-op: STORYTREE_TRAVERSAL=off and an explicit enabled:false each produce no directory and no file even with a valid parent session and slices that would otherwise emit", () => {
  const runs: LeafSliceRun[] = [{ phase: "AUTHOR_TEST", subtype: "success", turns: 1, usage: usage() }];
  const parentSessionId = "session-off";

  const base = makeTempDir("off");
  try {
    const overrideDir = path.join(base, "traces-override");
    captureBuildSpawn({
      parentSessionId,
      runId: "run-1",
      unitId: "unit-a",
      runs,
      dir: overrideDir,
      enabled: false,
    });
    assert.equal(fs.existsSync(overrideDir), false, "enabled:false must create no directory");

    const envDir = path.join(base, "traces-env");
    const previous = process.env.STORYTREE_TRAVERSAL;
    process.env.STORYTREE_TRAVERSAL = "off";
    try {
      captureBuildSpawn({
        parentSessionId,
        runId: "run-2",
        unitId: "unit-a",
        runs,
        dir: envDir,
      });
    } finally {
      if (previous === undefined) delete process.env.STORYTREE_TRAVERSAL;
      else process.env.STORYTREE_TRAVERSAL = previous;
    }
    assert.equal(fs.existsSync(envDir), false, "STORYTREE_TRAVERSAL=off must create no directory");
  } finally {
    removeTempDir(base);
  }
});

test("capture-never-throws-and-never-changes-an-exit-code: capture against an unwritable target returns normally rather than throwing, and a caller's surrounding control flow is unchanged", () => {
  const base = makeTempDir("blocked");
  try {
    // Occupy the directory's own path with a plain file, so creating a directory there is
    // impossible on every platform (unreliable to force via OS permissions cross-platform).
    const blockedParent = path.join(base, "blocked-file");
    fs.writeFileSync(blockedParent, "occupied");
    const blockedDir = path.join(blockedParent, "sessions");

    const runs: LeafSliceRun[] = [{ phase: "AUTHOR_TEST", subtype: "success", turns: 1, usage: usage() }];

    let threw = false;
    let simulatedExitCode = 0;
    let returned: unknown;
    try {
      returned = captureBuildSpawn({
        parentSessionId: "session-blocked",
        runId: "run-1",
        unitId: "unit-a",
        runs,
        dir: blockedDir,
      });
      // A caller's own success path continues exactly as if capture had not run at all.
      simulatedExitCode = 0;
    } catch {
      threw = true;
      simulatedExitCode = 1;
    }

    assert.equal(threw, false, "capture must never throw, even against an unwritable target");
    assert.equal(returned, undefined);
    assert.equal(simulatedExitCode, 0, "a caller's own control flow/exit code must be unaffected by a capture failure");
    assert.equal(fs.existsSync(blockedDir), false);
  } finally {
    removeTempDir(base);
  }
});

test("no-canary-text-ever-reaches-the-bytes: a distinctive canary threaded through every free-text-looking input never appears in any written trace file's raw text", () => {
  const dir = makeTempDir("canary");
  try {
    const CANARY = "CANARY-FREE-TEXT-9f3d";
    const parentSessionId = "session-canary";
    const runId = "run-1";
    const unitId = "unit-a";

    const runs: LeafSliceRun[] = [
      {
        phase: "AUTHOR_TEST",
        // A free-text-looking value that is never itself written verbatim: only a derived boolean
        // (`ok`, via a strict "success" comparison) is ever emitted from this field.
        subtype: `${CANARY}-not-a-recognised-subtype`,
        turns: 1,
        usage: usage({ inputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 5 }),
        byModel: {
          [`model-${CANARY}`]: {
            inputTokens: 10,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            outputTokens: 5,
            costUsd: 1,
          },
        },
      },
      {
        phase: "IMPLEMENT",
        subtype: "error_max_turns",
        turns: 3,
      },
    ];

    captureBuildSpawn({
      parentSessionId,
      runId,
      unitId,
      runs,
      dir,
      now: deterministicNow(),
      nextId: deterministicNextId(),
    });

    const files = fs.readdirSync(dir);
    assert.ok(files.length > 0, "capture must have written at least the parent file");

    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      assert.equal(raw.includes(CANARY), false, `canary text leaked into ${file}`);
    }
  } finally {
    removeTempDir(dir);
  }
});
