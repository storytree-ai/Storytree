// The knowledge/library schema (`knowledge.ts`, `knowledge-render.ts`, `knowledge-sources.ts`,
// `migrations.ts`, `library-doc.ts`) MOVED to `@storytree/library` (ADR-0068 step 4) — its namesake
// competence: schema-validated, versioned knowledge documents. Consumers now import those symbols
// (KIND_SPECS, renderBody, validateLibraryDoc, upcast, groupSources, …) from `@storytree/library`.
//
// The base Store seam (`store.ts`, `store-parity.ts`) MOVED to `@storytree/base` (ADR-0068 step 5) —
// the universal, browser-safe base: the narrow Store/ChangeStore document-event contract, the
// InMemoryStore reference impl, StoredDoc/StoreEvent/DeleteDocOpts/retiredEventDoc, and the reusable
// node:test parity suites (storeParitySuite / changeStoreParitySuite, behind `@storytree/base/parity`).
export * from "./adr.js";
export * from "./presence.js";
export * from "./users.js";
export * from "./model-events.js";
