// @storytree/base — the universal, browser-safe base seam (ADR-0068 step 5), extracted from the
// dissolving @storytree/core god-package. The narrow Store/ChangeStore document-event contract +
// InMemoryStore reference impl. The reusable node:test parity suites (storeParitySuite /
// changeStoreParitySuite) are exported from the `./parity` subpath, NOT here, so the main entry
// carries no `node:` import and stays browser-safe.
export * from "./store.js";
