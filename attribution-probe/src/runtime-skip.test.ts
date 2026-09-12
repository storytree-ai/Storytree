// The RUNTIME-SKIP arm of the attribution probe — the regression guard for the fourth hunk of
// `patches/@hughescr__stryker-bun-runner@1.3.8.patch` (ADR-0566).
//
// WHY A SECOND TEST FILE, AND WHY `node:test` RATHER THAN `bun:test`. The defect this arm exists to
// catch needs a test that skips at RUNTIME — after its `beforeEach` has already run — and
// `node:test`'s `t.skip()` is how this repo writes a host-conditional test (four test files do,
// across `packages/agent` and `packages/cli`). `bun:test` offers no equivalent, so the shape cannot
// be reproduced in `subject.test.ts` beside it. Both files run in the same `bun test` process, which
// is exactly the real arrangement.
//
// THE ORDER OF THESE THREE TESTS IS LOAD-BEARING; do not reorder or insert between them. The bug
// pairs coverage buckets to tests positionally after dropping the tests the inspector marked `skip`,
// so a runtime skip makes buckets outnumber tests and shifts every LATER bucket onto the next test
// along, the last clamped onto the final test. With the skip FIRST and two distinct subjects after
// it, that shift is observable: PROBE_EPSILON's coverage lands on PROBE_ZETA, nothing covers
// `epsilon` any more, and its mutant comes back `Survived` instead of `Killed`. Two tests after the
// skip is the minimum — with only one, the clamp merges the shifted bucket back onto the right test
// and the corruption hides.
import assert from "node:assert/strict";
import { test } from "node:test";

import { epsilon, zeta } from "./subject.js";

// Skips UNCONDITIONALLY and on purpose: it is the instrument, not a disabled test. `t.skip()` runs
// after this test's hooks have fired, which is the whole asymmetry — the runner's preload has
// already allocated it a coverage bucket by the time the inspector marks it skipped.
test("PROBE_SKIP_RUNTIME skips after its hooks ran", async (t) => {
  await Promise.resolve();
  t.skip("deliberate: this arm exists to prove a runtime skip does not shift coverage attribution");
});

test("PROBE_EPSILON halves", () => {
  assert.equal(epsilon(8), 4);
});

test("PROBE_ZETA negates", () => {
  assert.equal(zeta(3), -3);
});
