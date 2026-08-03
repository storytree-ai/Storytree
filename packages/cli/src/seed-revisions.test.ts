import test from "node:test";
import assert from "node:assert/strict";

import type { SeedEntry } from "@storytree/library/store";

import { changedSeedIds, seedIdsAddedBetween } from "./seed-revisions.js";

/**
 * The two seed differentials both corpus checks read (`seed-revisions.ts`). The git and filesystem
 * halves are not unit-testable without a scratch repo — they degrade to `null` by construction and
 * their callers' fallbacks are tested where the fallback lives — but the DIFFERENTIALS are pure, and
 * the distinction between them is load-bearing enough to pin.
 */

const entry = (id: string, over: Record<string, unknown> = {}): SeedEntry =>
  ({ id, kind: "principle", title: `T ${id}`, description: "d", ...over }) as unknown as SeedEntry;

const seed = (...entries: SeedEntry[]): Map<string, SeedEntry> =>
  new Map(entries.map((e) => [e.id, e]));

test("changedSeedIds is SYMMETRIC — added, removed, and edited all count as changed", () => {
  const base = seed(entry("kept"), entry("edited"), entry("removed"));
  const now = seed(entry("kept"), entry("edited", { description: "new" }), entry("added"));
  assert.deepEqual([...changedSeedIds(base, now)].sort(), ["added", "edited", "removed"]);
});

test("seedIdsAddedBetween is ONE-DIRECTIONAL — only what this branch ADDED", () => {
  // The distinction the absence classifier rests on. Charging on `changedSeedIds` would call a branch
  // that merely EDITED a long-standing row's prose the author of a "graduation that never synced",
  // which is neither true nor actionable — the id has been in the seed for months and is live already.
  const base = seed(entry("kept"), entry("edited"), entry("removed"));
  const now = seed(entry("kept"), entry("edited", { description: "new" }), entry("added"));
  assert.deepEqual([...seedIdsAddedBetween(base, now)], ["added"]);
});

test("seedIdsAddedBetween ignores a REMOVAL — dropping a seed row is not adding one", () => {
  // The retirement's seed half: a branch that drops a row has not graduated anything, and must not be
  // charged as though it had.
  const base = seed(entry("a"), entry("retired-row"));
  const now = seed(entry("a"));
  assert.deepEqual([...seedIdsAddedBetween(base, now)], []);
});

test("identical revisions differ in neither view", () => {
  const base = seed(entry("a"), entry("b"));
  const now = seed(entry("a"), entry("b"));
  assert.deepEqual([...changedSeedIds(base, now)], []);
  assert.deepEqual([...seedIdsAddedBetween(base, now)], []);
});
