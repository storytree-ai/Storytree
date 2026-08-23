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
export * from "./legacy-uat-disposition.js";
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
// Proof-binding-integrity: a total, display/audit-only adapter over the strict machine-leg resolver.
export * from "./proof-binding-outcome.js";
// Proof-binding-integrity: a complete read-only projection of parsed machine legs into audit rows.
export * from "./machine-leg-binding-audit.js";
export * from "./burned-ordinal-collision.js";
export * from "./uat-witness-census.js";
// ADR-0107 (generalising ADR-0106 d4): the proving-process OQ-attachment predicate — an open question
// carrying a `node:<id>` reference is attached to that node's proving process and WITHHOLDS its green
// (the green-fold is the orchestrator's `gateStoryGreenOnOpenQuestions`). Pure, browser-safe.
export * from "./oq-gating.js";
// ADR-0196 D1/D4: the universal lifecycle projection — every stored per-kind vocabulary (friction
// route, plan status, ADR status, stateless-kind defaults) maps onto ONE `open|active|archived`
// triad. Pure, browser-safe — the single place this mapping lives.
export * from "./lifecycle.js";
// ADR-0246 (`foreign-project-forest-arc` inc 1): the repo root as a PARAMETER — the pure
// explicit > env > module-derived precedence every root-reading site now shares. Deliberately in the
// browser-safe root barrel (no `node:`), because the studio server cannot statically import
// `@storytree/library/store` without breaking `vite build`, and it must reach the same decision.
export * from "./repo-root.js";

// The cross-cutting knowledge tier (ADR-0017) — the library's namesake competence: schema-
// validated, versioned knowledge documents. Moved out of `@storytree/core` (ADR-0068 step 4) so
// consumers read the knowledge schema across the built ADR-0010 §4 boundary. Pure zod, browser-safe
// (re-exported here AND via the `/knowledge`, `/knowledge-render`, `/sources` subpaths the studio
// browser imports directly so it never pulls a node:-laden root barrel).
export * from "./knowledge.js";
// ADR-0223: the authored `dependsOn` dependency DAG — the pure cycle detector (`directional-dag-arc`
// increment 1) and the corpus-wide acyclicity judge the `check:library-dag-acyclic` rung is a thin
// store read around. Pure, browser-safe: no zod, no store, no node: — it reads `dependsOn` and
// nothing else, so the citation web is structurally outside the dependency relation.
export * from "./knowledge-dag.js";
// ADR-0403 dec 7 (`adrs-into-the-dag-arc` inc 08): the decision-record POINTER, resolved in exactly
// one place. The corpus carries two live `doc:` spellings of the same file and a parser that
// accepts one silently reclassifies the majority as "not a decision" — a confident, plausible,
// wrong answer that has already been shipped once. Pure and browser-safe.
export * from "./decision-pointer.js";
// ADR-0403 dec 5 (`adrs-into-the-dag-arc` inc 08): the COMBINED decisions-plus-Library acyclicity
// proof. ADR-0223 D4's no-loop guarantee was STRUCTURAL — decisions were sinks, so nothing could
// come back — and dec 4 retires it, which means proving the property over the graph that will
// actually be walked rather than over either half alone. `pnpm probe:combined-dag` is a thin read
// around this; no gate rung enforces it.
export * from "./combined-dag.js";
// The TOTAL defensive read of the authored dependency edge off a stored payload. It was ADR-0402's
// temporary read tolerance; `adrs-into-the-dag-arc-inc-06` drained the corpus on 2026-08-22 and the
// legacy `standsOn` branch is GONE. What remains is permanent: eight readers project an untrusted
// live row, and a surprise row must read as "no edges" rather than take a fail-closed gate down.
// Migration #7 stays forever — the registry is append-only (see depends-on.ts).
export * from "./depends-on.js";

// ADR-0363 D2 (`traversal-panel-arc` increment `standson-depth-from-work-join`): the READ-ONLY
// depth-from-work join — the same `dependsOn` substrate seeded at the artifacts whose `cites` names a
// work unit, so a reader can ask "how far is this knowledge from the actual work". Pure and
// browser-safe like its sibling; it reports its own denominators because an UNREACHABLE artifact and
// a VERY DEEP one must never print alike. Nothing records the result and no gate enforces it.
export * from "./knowledge-depth.js";
// ADR-0403 dec 3 (`adrs-into-the-dag-arc` inc 09): the EDGE-RESOLUTION SEAM. The owner sequenced the
// decisions into the graph BEFORE the storage migration, so the depth walk is built while decisions
// are still files — and it must not learn that. One verb, `amendsOf`; no `supersedesOf` and no
// edge-type parameter, so ADR-0403 dec 6's never-sum rule is held by the shape of the interface.
export * from "./decision-amends-seam.js";
// ADR-0428: the COMPOSED STATEMENT at a chain frontier, and the outstanding-effects marker that
// keeps it honest — one artifact, because a composed statement without a staleness signal silently
// lies (the legislation.gov.uk "Changes to Legislation" precedent). What is STORED is the basis; the
// marker is DERIVED from it, so it cannot go stale the way a stored flag would. Pure, browser-safe.
export * from "./composed-statement.js";
// ADR-0427 (2026-08-23) RETIRED the two `amends` annotation modules that were exported here — the
// presence judge (`amends-annotation.js`, ADR-0419 D4) and the drain worklist that consumed it
// (`amends-drain.js`, ADR-0419 D3). The judge asked only whether a target's body mentioned its
// amender's number anywhere, while the obligation asks WHICH CLAUSE moved; since `adr list` already
// derives and prints `amended by NNNN`, the string it accepted was the one that adds nothing
// (ADR-0037 §1). It was never wired to the gate, and the backlog it was built for was drained to
// zero (453/453) before it went. THE OBLIGATION STANDS — ADR-0139 D4, held by the librarian's
// judgment and by the authoring-time note in `packages/cli/src/adr-amends-obligation.ts`. Do not
// rebuild a presence check here; an instrument that measured THINNESS would be a different thing.
// ADR-0223 dec 5's one-time seed, as a pure function: the tier order (dec 3, amended by ADR-0363 D1)
// and the down-tier citation projection the migration applies. Pure and browser-safe apart from the
// zod pointer check it borrows from the schema.
export * from "./standson-bootstrap.js";
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
  explainDocValidationError,
} from "./library-doc.js";
// `tool-signal-gaps-arc`: the ad-hoc corpus query predicate — "how many rows of kind K satisfy
// predicate P", the question that had no CLI surface and cost every asker a throwaway tsx script.
// Pure over already-fetched documents, so the CLI supplies the rows and this holds no connection.
export * from "./query.js";
