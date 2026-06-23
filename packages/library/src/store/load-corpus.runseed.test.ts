import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { Store } from "@storytree/storage-protocol";
import type { LoadCorpusResult } from "./load-corpus.js";
import { runSeed } from "./load-corpus.js";

/**
 * Offline seam tests for `runSeed` — the injectable orchestration core extracted from `main()`
 * as the R2 refactor-for-testability target (library#gate-4 / ADR-0098 d.6).
 *
 * `runSeed(deps)` takes the three seed steps as injected fakes, so the orchestration sequence
 * can be verified offline without a DB, API key, or filesystem access to the studio data files.
 *
 * Structural red: `runSeed` does not yet exist in load-corpus.ts — this file fails to link
 * with "does not provide an export named 'runSeed'" until the implementation is added.
 */

test("runSeed calls applySchema then loadCorpus then loadComments in order", async () => {
  const calls: string[] = [];

  // Recording doubles: each step records its name in the call log.
  const fakeApplySchema = async (): Promise<void> => {
    calls.push("applySchema");
  };
  const fakeLoadCorpus = async (_store: Store): Promise<LoadCorpusResult> => {
    calls.push("loadCorpus");
    return { knowledge: 3, templates: 2 };
  };
  const fakeLoadComments = async (): Promise<number> => {
    calls.push("loadComments");
    return 5;
  };

  const store = new InMemoryStore();

  await runSeed({
    applySchema: fakeApplySchema,
    store,
    loadCorpus: fakeLoadCorpus,
    loadComments: fakeLoadComments,
  });

  assert.deepEqual(
    calls,
    ["applySchema", "loadCorpus", "loadComments"],
    "seed steps must fire in schema-first, corpus-second, comments-third order",
  );
});

test("runSeed passes the injected store to loadCorpus", async () => {
  const store = new InMemoryStore();
  let capturedStore: Store | undefined;

  await runSeed({
    applySchema: async (): Promise<void> => {},
    store,
    loadCorpus: async (s: Store): Promise<LoadCorpusResult> => {
      capturedStore = s;
      return { knowledge: 0, templates: 0 };
    },
    loadComments: async (): Promise<number> => 0,
  });

  assert.strictEqual(
    capturedStore,
    store,
    "runSeed must pass the injected store to loadCorpus, not create its own",
  );
});
