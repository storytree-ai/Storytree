import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { decidePiToolCall } from "@storytree/agent";

import { PathWriteScope } from "./phase-machine.js";
import type { Phase } from "./phase-machine.js";

/**
 * The pi fence REUSES the spine's scope predicate — it does not re-derive one
 * (`pi-harness-admission-arc` increment 1).
 *
 * `packages/agent` cannot import `@storytree/orchestrator` (the orchestrator depends on the agent,
 * so the edge only runs one way), which is why `createPiScopeFence` takes `isWriteAllowed` as a
 * plain structural function — the same seam `sdk-author.ts` uses. That arrangement is easy to
 * CLAIM and easy to quietly break: nothing in `pi-fence.ts` would notice if the predicate it was
 * handed had been hand-rolled to a slightly different rule, and a second copy of the phase rule is
 * how "the test author is not the code author" silently stops being true for one runtime.
 *
 * So the proof lives HERE, on the side of the edge that can see both: the real
 * {@link PathWriteScope} — the very object `write-scoped-executor.ts` and `sdk-author.ts` consume
 * — is plugged into the pi fence unadapted, and the fence's verdict is asserted to agree with the
 * scope's own verdict on every in-workspace path. A divergence in either direction fails.
 */

const CWD = path.resolve("/work/space");

/** The ADR-0020 §2 default split, as the gate configures it. */
const scope = new PathWriteScope({
  testGlobs: ["**/*.test.ts", "**/*.test.cjs"],
  sourceGlobs: ["src/**/*.ts", "**/*.cjs"],
});

/**
 * Plugged in UNADAPTED: `WriteScope.isWriteAllowed` takes the wider `Phase`, so it satisfies the
 * fence's `(phase: AuthoringPhase, relPath: string) => boolean` directly. If either side's
 * signature drifts, this line stops compiling — which is the point of writing it this way rather
 * than wrapping it in a lambda that would paper over the difference.
 */
const isWriteAllowed = scope.isWriteAllowed.bind(scope);

const AUTHORING_PHASES = ["AUTHOR_TEST", "IMPLEMENT"] as const;

const PATHS = [
  "unit.test.ts",
  "nested/deep/unit.test.ts",
  "unit.test.cjs",
  "src/impl.ts",
  "impl.cjs",
  "README.md",
  "docs/notes.txt",
];

test("the pi fence's write verdict matches PathWriteScope's own, path for path", () => {
  for (const phase of AUTHORING_PHASES) {
    for (const rel of PATHS) {
      for (const toolName of ["write", "edit"]) {
        const fence = decidePiToolCall({
          phase,
          cwd: CWD,
          toolName,
          toolInput: { path: rel, content: "x", edits: [] },
          isWriteAllowed,
        });
        const spine = scope.isWriteAllowed(phase, rel);
        assert.equal(
          fence.allow,
          spine,
          `${toolName} ${rel} in ${phase}: fence said ${String(fence.allow)}, PathWriteScope said ${String(spine)}`,
        );
      }
    }
  }
});

test("the reused scope still carries the ADR-0020 red-green property through the fence", () => {
  // Named explicitly rather than left implicit in the matrix above: the property the whole gate
  // rests on is that the leaf may write the test only in AUTHOR_TEST and the source only in
  // IMPLEMENT — never the test it must satisfy.
  const authorTest = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "unit.test.ts", content: "x" },
    isWriteAllowed,
  });
  assert.equal(authorTest.allow, true);

  const authorSource = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "src/impl.ts", content: "x" },
    isWriteAllowed,
  });
  assert.equal(authorSource.allow, false);

  const implementSource = decidePiToolCall({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "src/impl.ts", content: "x" },
    isWriteAllowed,
  });
  assert.equal(implementSource.allow, true);

  const implementTest = decidePiToolCall({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "unit.test.ts", content: "x" },
    isWriteAllowed,
  });
  assert.equal(implementTest.allow, false);
});

test("the observe-only phases have no pi authoring surface to fence", () => {
  // The fence is only ever constructed for an authoring phase, so this asserts the spine's half:
  // CONFIRM_RED / CONFIRM_GREEN / GATE deny every write, which is why no pi slice runs in them.
  const observeOnly: Phase[] = ["CONFIRM_RED", "CONFIRM_GREEN", "GATE"];
  for (const phase of observeOnly) {
    for (const rel of PATHS) {
      assert.equal(scope.isWriteAllowed(phase, rel), false, `${rel} must be unwritable in ${phase}`);
    }
  }
});
