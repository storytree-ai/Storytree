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
 * CANONICAL definitions; `@storytree/verdict-contract` carries a parity-guarded DUPLICATE
 * (ADR-0068, locked owner decision) so the published verdict SHAPE never imports this organism.
 */
export * from "./schema.js";
export { parseUnit } from "./loader.js";
export * from "./uat-tests.js";
