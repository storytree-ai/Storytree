/**
 * `@storytree/library` — the library organism (ADR-0068 step 3).
 *
 * The owner decision: the library owns schema-validated, versioned documents, and a
 * story / capability / contract IS such a document. This package is the CANONICAL home of
 * the work-hierarchy schema (ADR-0002 / ADR-0010 / ADR-0013) — moved out of `@storytree/core`
 * (the farmer organism) so consumers read the schema across the built ADR-0010 §4 boundary.
 *
 * Pure zod, browser-safe: no `node:` imports in this entry (`loader.ts`'s `parseUnit` validates
 * already-parsed data and never touches the filesystem). The `Tier` / `Status` enums are the
 * CANONICAL definitions; `@storytree/proof-protocol` carries a parity-guarded DUPLICATE
 * (ADR-0068, locked owner decision) so the published verdict SHAPE never imports this organism.
 */
export * from "./schema.js";
export { parseUnit } from "./loader.js";
export * from "./uat-tests.js";

// The cross-cutting knowledge tier (ADR-0017) — the library's namesake competence: schema-
// validated, versioned knowledge documents. Moved out of `@storytree/core` (ADR-0068 step 4) so
// consumers read the knowledge schema across the built ADR-0010 §4 boundary. Pure zod, browser-safe
// (re-exported here AND via the `/knowledge`, `/knowledge-render`, `/sources` subpaths the studio
// browser imports directly so it never pulls a node:-laden root barrel).
export * from "./knowledge.js";
export {
  CURRENT_SCHEMA_VERSION,
  type Migration,
  MIGRATIONS,
  upcast,
} from "./migrations.js";
export { renderBody, generateTemplate } from "./knowledge-render.js";
export {
  groupSources,
  SOURCE_GROUP_ORDER,
  type SourceGroup,
  type SourceGroupName,
  type ResolvedSource,
  type AssetTarget,
} from "./knowledge-sources.js";
export {
  LibraryAsset,
  LibraryTemplate,
  LibraryDoc,
  validateLibraryDoc,
  upcastAndValidate,
} from "./library-doc.js";
