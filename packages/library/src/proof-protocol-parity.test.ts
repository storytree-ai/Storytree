import { test } from "node:test";
import assert from "node:assert/strict";

// PARITY GUARD — lives HERE, in the library organism, and that placement is load-bearing.
//
// `Tier` / `Status` are DELIBERATELY DUPLICATED into `@storytree/proof-protocol` (ADR-0068, a locked
// owner decision): the published verdict SHAPE must not depend on the library organism, so it carries
// its own copy. This guard asserts the duplicate can never silently drift from the canonical enums.
//
// WHY IT MOVED (ADR-0389 / `session-cutting-outage-arc-inc-02`). It used to live in
// `packages/proof-protocol/src/parity.test.ts` and reach BACK to `@storytree/library` through a
// devDependency. That single back-edge was the only thing making the workspace dependency graph
// cyclic, and pnpm materialises workspace links as Windows JUNCTIONS — which git traverses as
// ordinary directories. `git clean -ffdx`, which the desktop runs and AWAITS on the session-start
// path, therefore recursed unboundedly (154,373 `Function not implemented` warnings; a live capture
// ran 29.5 min at ~85% of a core) and never returned, so worktree-backed sessions could not start.
// With the edge removed the identical clean completes in 58 s.
//
// Here the import direction is FORWARD: `@storytree/library` already declares
// `@storytree/proof-protocol` as a production dependency, so this is an ordinary import and adds no
// edge. proof-protocol keeps its documented invariant — "the bottom root the whole graph rests on
// (depends on nothing)" — which the old devDependency quietly contradicted.
import { Tier as ContractTier, Status as ContractStatus } from "@storytree/proof-protocol";
import { Tier as LibraryTier, Status as LibraryStatus } from "./schema.js";

/** Sorted option set of a zod enum — order-independent identity check. */
function options(e: { options: readonly string[] }): string[] {
  return [...e.options].sort();
}

test("PARITY GUARD: contract Tier has an identical option set to library Tier", () => {
  assert.deepEqual(
    options(ContractTier),
    options(LibraryTier),
    "proof-protocol Tier drifted from @storytree/library Tier — reconcile the duplicate (ADR-0068)",
  );
});

test("PARITY GUARD: contract Status has an identical option set to library Status", () => {
  assert.deepEqual(
    options(ContractStatus),
    options(LibraryStatus),
    "proof-protocol Status drifted from @storytree/library Status — reconcile the duplicate (ADR-0068)",
  );
});
