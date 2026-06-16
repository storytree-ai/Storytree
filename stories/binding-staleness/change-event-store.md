---
id: "change-event-store"
tier: contract
story: binding-staleness
title: "A typed change-event contract on the store"
outcome: "The store gains a narrow ChangeStore contract — append + read ADR-0016 ChangeEvents — implemented by InMemoryStore and held to a reusable parity suite, so any backend (the parallel session's Postgres adapter next) can be proven equivalent offline."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [16]
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the node
# inner-loop buildable. EDIT-EXISTING (ADR-0057 §3 expansion C): the leaf adds a parity-suite
# regression test that FAILS against current behaviour, then edits the EXISTING
# packages/core/src/store.ts. The red is genuine and runtime: the test imports `changeStoreParitySuite`
# from `./store.js`, which does not exist at HEAD, so calling it throws ("not a function") until
# IMPLEMENT adds the contract + suite. `install: true` + typecheck because store.ts imports `zod`
# (fresh-worktree tsx + tsc need the lockfile-only install, ADR-0031 §2); single source file → the
# default node:test proof on the one test file is legal.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/core", "test"]
  scope:
    testGlobs: ["packages/core/src/**/*.test.ts"]
    sourceGlobs: ["packages/core/src/**/*.ts"]
  real:
    testFile: "packages/core/src/change-event-store.test.ts"
    sourceFile: "packages/core/src/store.ts"
    scope:
      testGlobs: ["packages/core/src/change-event-store.test.ts"]
      sourceGlobs: ["packages/core/src/store.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/core", "typecheck"]
    editsExisting: true
---

# A typed change-event contract on the store

**Outcome —** The store gains a narrow `ChangeStore` contract — append + read ADR-0016 `ChangeEvent`s —
implemented by `InMemoryStore` and held to a reusable parity suite, so any backend (the parallel
session's Postgres adapter next) can be proven equivalent offline.

> **The gap this closes (ADR-0016 §2).** ADR-0016's change unit is the `ChangeEvent` (already defined in
> [`anchor.ts`](../../packages/core/src/anchor.ts)), but there is nowhere to PUT one: the narrow `Store`
> seam holds docs + generic events, not the binding's change log. This unit adds a small typed contract
> for appending and reading change events, backed by `InMemoryStore`, and — critically — a REUSABLE
> parity suite so the parallel session's `PgChangeStore` can be held to the same behavioural bar (exactly
> how `storeParitySuite` proves `PgLibraryStore` ≡ `InMemoryStore` today). [`gate-emits-change`](gate-emits-change.md)
> writes through this contract; [`drift-reads-store`](drift-reads-store.md) reads through it.

## Guidance

THREE additions to `packages/core/src/store.ts` (the only source file in scope). `ChangeEvent` already
lives in `anchor.ts` — import the **type** at the top of `store.ts` (a type-only import keeps the seam
clean):

```ts
import type { ChangeEvent } from "./anchor.js";
```

**1. The `ChangeStore` interface** (kept narrow and SEPARATE from `Store` on purpose — do NOT add these
methods to the `Store` interface: `Store` is implemented by `PgLibraryStore`/`PgWorkStore` in
`packages/store`, and widening it would break their typecheck before the parallel session builds the pg
change store). A backend implements `ChangeStore` in addition to `Store`:

```ts
/**
 * The binding-staleness change log (ADR-0016 §2). A SEPARATE seam from {@link Store} — a backend
 * implements both — so the narrow doc/event store is not widened for every implementer at once (the
 * Postgres `PgChangeStore` is a parallel follow-on, held to {@link changeStoreParitySuite}).
 */
export interface ChangeStore {
  /** Append one ADR-0016 change event to the unit's change log. */
  appendChangeEvent(change: ChangeEvent): Promise<void>;
  /** Read change events, newest-appended last (insertion order); filter by `unitId` when given. */
  readChangeEvents(filter?: { unitId?: string }): Promise<ChangeEvent[]>;
}
```

**2. Implement it on `InMemoryStore`** — change the class header to `implements Store, ChangeStore`, back
it with a private array, and add the two methods. Store the event AS GIVEN (the narrow seam stores raw,
like `upsertDoc`'s `doc: unknown` — write-boundary validation is a backend concern layered on top):

```ts
  #changes: ChangeEvent[] = [];

  async appendChangeEvent(change: ChangeEvent): Promise<void> {
    this.#changes.push(change);
  }

  async readChangeEvents(filter?: { unitId?: string }): Promise<ChangeEvent[]> {
    const all = [...this.#changes];
    if (filter?.unitId === undefined) return all;
    return all.filter((c) => c.unitId === filter.unitId);
  }
```

**3. A reusable parity suite** `changeStoreParitySuite(name, makeStore)` — mirror the existing
`storeParitySuite` in the same file (a `test(...)` per contract, EXPORTED so `packages/store` can call it
for `PgChangeStore`). It needs `node:test` + `node:assert/strict` (already imported at the top of
`store.ts`) and a small `ChangeEvent` fixture builder. Register these contracts:

```ts
/**
 * A REUSABLE behavioural-parity suite (node:test) for any {@link ChangeStore} (ADR-0016 §2): the same
 * bar InMemoryStore meets here and the parallel session's PgChangeStore must meet. EXPORTED on purpose.
 */
export function changeStoreParitySuite(
  name: string,
  makeStore: () => (Store & ChangeStore) | Promise<Store & ChangeStore>,
): void {
  // a fixture builder, e.g.:
  //   const change = (unitId: string, why?: string): ChangeEvent => ({
  //     unitId, hashBefore: "aaaa", hashAfter: "bbbb",
  //     ...(why !== undefined ? { description: why } : {}),
  //     author: "tester", at: "2026-06-16T00:00:00.000Z",
  //   });
  // then one test() per contract below.
}
```

Contracts the suite must register (each a `test(\`${name} change parity: …\`, …)`):

- **round-trip** — after `appendChangeEvent(c)`, `readChangeEvents()` returns `[c]` (deep-equal — the
  event is stored and read back unchanged, including an absent `description`).
- **filter by unitId** — append events for `unitId: "a"` and `unitId: "b"`; `readChangeEvents({ unitId: "a" })`
  returns ONLY the `"a"` events; `readChangeEvents()` (no filter) returns all of them.
- **insertion order preserved** — append three events for one unit; `readChangeEvents({ unitId })` returns
  them in append order.
- **empty store** — `readChangeEvents()` and `readChangeEvents({ unitId: "nope" })` each return `[]`
  (never throw) on a fresh store.

Do not touch `storeParitySuite`, `store.test.ts`, or the `Store` interface — only ADD the three pieces
above to `store.ts`.

**The red the spine observes (before IMPLEMENT):** the test file (below) imports `changeStoreParitySuite`
from `./store.js` and calls it. At HEAD that export does not exist, so the call throws — a genuine
runtime red. After IMPLEMENT the suite registers and every parity test passes.

The test file `packages/core/src/change-event-store.test.ts` is exactly the parity-suite invocation (the
parity suite IS the proof — ADR-0016's offline change-event contract):

```ts
import { InMemoryStore, changeStoreParitySuite } from "./store.js";

changeStoreParitySuite("InMemoryStore", () => new InMemoryStore());
```

## Contract

1. **`change-store-parity-holds-for-inmemory`** — the `ChangeStore` contract (append + read, filter,
   order, empty) holds for `InMemoryStore`, proven by the reusable parity suite — the same suite the
   parallel session's `PgChangeStore` will run.
   - **asserts —** (via `changeStoreParitySuite`)
     - append-then-read round-trips a `ChangeEvent` deep-equal (including an absent `description`);
     - `readChangeEvents({ unitId })` filters to that unit; the no-filter read returns all;
     - append order is preserved on read;
     - a fresh store's reads return `[]` (filtered and unfiltered), never throwing.
   - **proven by —** `packages/core/src/change-event-store.test.ts` (authored by the leaf inside the
     gate's AUTHOR_TEST phase; the spine observes the red — the missing `changeStoreParitySuite` export —
     before IMPLEMENT adds the contract, the `InMemoryStore` methods, and the suite).
