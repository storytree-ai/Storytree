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
export * from "./uat-test-criteria.js";
// ADR-0085 (ADR-0083 Fork B): the brownfield `## Reliability Gates` obligation set — the
// author-declared gates that flip a brownfield/foundational story green, distinct from UAT.
export * from "./reliability-gates.js";
// ADR-0020 coverage-honesty follow-on: the `## Contracts` parser — a capability's declared leaf
// contracts, so a coverage check can map each to an observed test (a signed `--real` green attests
// ONE authored test, not every enumerated contract).
export * from "./contracts.js";
// ADR-0106 (amends 0044/0082/0097): the pure per-test UAT witness RESOLUTION — the asymmetric
// classifier the adopt pass + studio share to resolve `either` into a binary human|machine witness.
export * from "./witness-resolution.js";
// ADR-0107 (generalising ADR-0106 d4): the proving-process OQ-attachment predicate — an open question
// carrying a `node:<id>` reference is attached to that node's proving process and WITHHOLDS its green
// (the green-fold is the orchestrator's `gateStoryGreenOnOpenQuestions`). Pure, browser-safe.
export * from "./oq-gating.js";
// ADR-0196 D1/D4: the universal lifecycle projection — every stored per-kind vocabulary (friction
// route, plan status, ADR status, stateless-kind defaults) maps onto ONE `open|active|archived`
// triad. Pure, browser-safe — the single place this mapping lives.
export * from "./lifecycle.js";

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
// ADR-0210: the Library `template` artifacts, re-homed here from the retired generated
// `apps/studio/data/assets.json`. The single source the corpus migration, the desktop seed, and the
// offline studio backend read for the per-kind authoring scaffolds. Browser-safe (bodies generated
// from KIND_SPECS via generateTemplate; only editorial metadata + the bespoke template-adr embedded).
export { libraryTemplates, type LibraryTemplateAsset } from "./templates.js";
// ADR-0095: the agent-memory → Library graduation engine (the pure candidate-generation core).
// Browser-safe (no node:, no fs, no clock) — the CLI reads the memory files off disk and passes
// already-parsed `MemoryFile[]` in; the librarian-curator finalises the emitted candidates.
export * from "./graduation/graduation.js";
// ADR-0202: the parked-memory lease compute (content-hash change detection, lease-expiry date
// math, and the new/changed/expired/parked classifier). Pure, browser-safe — see the module header.
export * from "./graduation/park.js";
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
