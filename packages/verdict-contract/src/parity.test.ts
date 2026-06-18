import { test } from "node:test";
import assert from "node:assert/strict";
// TEST-ONLY import of the library organism (a devDependency): the runtime contract never
// imports it. This guard asserts the DUPLICATED enums (ADR-0068, locked owner decision) have an
// IDENTICAL option set to the library's CANONICAL `Tier`/`Status`, so the duplicate can never
// silently drift. (ADR-0068 step 3 moved the canonical enums from `@storytree/core` to
// `@storytree/library` — the parity guard stays; it now guards library(canonical) vs contract.)
import { Tier as LibraryTier, Status as LibraryStatus } from "@storytree/library";
import { Tier as ContractTier, Status as ContractStatus } from "./index.js";

/** Sorted option set of a zod enum — order-independent identity check. */
function options(e: { options: readonly string[] }): string[] {
  return [...e.options].sort();
}

test("PARITY GUARD: contract Tier has an identical option set to library Tier", () => {
  assert.deepEqual(
    options(ContractTier),
    options(LibraryTier),
    "verdict-contract Tier drifted from @storytree/library Tier — reconcile the duplicate (ADR-0068)",
  );
});

test("PARITY GUARD: contract Status has an identical option set to library Status", () => {
  assert.deepEqual(
    options(ContractStatus),
    options(LibraryStatus),
    "verdict-contract Status drifted from @storytree/library Status — reconcile the duplicate (ADR-0068)",
  );
});
