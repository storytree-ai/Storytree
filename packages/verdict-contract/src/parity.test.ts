import { test } from "node:test";
import assert from "node:assert/strict";
// TEST-ONLY import of the farmer organism (a devDependency): the runtime contract never
// imports core. This guard asserts the DUPLICATED enums (ADR-0068, locked owner decision)
// have an IDENTICAL option set to core's, so the duplicate can never silently drift.
import { Tier as CoreTier, Status as CoreStatus } from "@storytree/core";
import { Tier as ContractTier, Status as ContractStatus } from "./index.js";

/** Sorted option set of a zod enum — order-independent identity check. */
function options(e: { options: readonly string[] }): string[] {
  return [...e.options].sort();
}

test("PARITY GUARD: contract Tier has an identical option set to core Tier", () => {
  assert.deepEqual(
    options(ContractTier),
    options(CoreTier),
    "verdict-contract Tier drifted from @storytree/core Tier — reconcile the duplicate (ADR-0068)",
  );
});

test("PARITY GUARD: contract Status has an identical option set to core Status", () => {
  assert.deepEqual(
    options(ContractStatus),
    options(CoreStatus),
    "verdict-contract Status drifted from @storytree/core Status — reconcile the duplicate (ADR-0068)",
  );
});
