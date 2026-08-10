// @storytree/storage-protocol — the universal, browser-safe base seam (ADR-0068 step 5), extracted from the
// dissolving @storytree/core god-package. The narrow Store/ChangeStore document-event contract +
// InMemoryStore reference impl. The reusable node:test parity suites (storeParitySuite /
// changeStoreParitySuite) are exported from the `./parity` subpath, NOT here, so the main entry
// carries no `node:` import and stays browser-safe.
//
// ADR-0259 adds the seam's HTTP transport: the wire contract (`store-wire.ts`) and HttpStore, the
// client half of the front door every non-server client reaches the store through. Both are pure —
// fetch, URL and JSON only — so the main entry stays browser-safe. The contract's SERVER half
// (handleStoreRequest) lives behind the `./http-server` subpath: no browser client mounts a door.
export * from "./store.js";
export * from "./store-wire.js";
export * from "./http-store.js";
export * from "./snapshot-store.js";
