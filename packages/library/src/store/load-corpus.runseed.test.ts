import test from "node:test";
import assert from "node:assert/strict";
import { runSeed } from "./load-corpus.js";

/**
 * Offline seam tests for `runSeed` — the injectable orchestration core extracted from `main()`
 * as the R2 refactor-for-testability target (library#gate-4 / ADR-0098 d.6).
 *
 * `runSeed(deps)` takes its steps as injected fakes, so the orchestration sequence can be verified
 * offline without a DB, an API key, or filesystem access.
 *
 * NARROWED BY ADR-0302 D1: the middle step was `loadCorpus`, which read the committed corpus seed
 * into the store. Both the seed and the loader are deleted, so the sequence is two steps and the
 * store is no longer a dep. What these tests exist to pin is unchanged — that the ORDER is
 * schema-first and that the caller cannot get data loaded into a database whose DDL has not been
 * applied.
 */

test("runSeed calls applySchema before loadComments", async () => {
  const calls: string[] = [];

  const fakeApplySchema = async (): Promise<void> => {
    calls.push("applySchema");
  };
  const fakeLoadComments = async (): Promise<number> => {
    calls.push("loadComments");
    return 5;
  };

  await runSeed({ applySchema: fakeApplySchema, loadComments: fakeLoadComments });

  assert.deepEqual(
    calls,
    ["applySchema", "loadComments"],
    "seed steps must fire schema-first, comments-second",
  );
});

test("runSeed awaits applySchema — a slow migration cannot be overtaken by the comment load", async () => {
  // The ordering above would still pass if `runSeed` fired both without awaiting the first, so this
  // asserts the await rather than the call order: applySchema resolves on a later tick, and
  // loadComments must not have run by then.
  const calls: string[] = [];

  await runSeed({
    applySchema: async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 5));
      calls.push("applySchema");
    },
    loadComments: async (): Promise<number> => {
      calls.push("loadComments");
      return 0;
    },
  });

  assert.deepEqual(calls, ["applySchema", "loadComments"], "loadComments must await applySchema");
});
