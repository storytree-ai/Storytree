import type { StoredDoc } from "@storytree/storage-protocol";
import {
  upcastAndValidate,
  KIND_SPECS,
  DOC_REF_PREFIX,
  NODE_REF_PREFIX,
  CAPABILITY_REF_PREFIX,
  STORY_REF_PREFIX,
  parseCiteRef,
  parseDecisionPointer,
  adrDocId,
  adrNumberOfArtifactId,
} from "@storytree/library";

import type { WorkTier } from "./work-hierarchy.js";

/**
 * The Library health checks — ONE pure, testable module surfaced three ways (design §4,
 * docs/research/library-schema-migrations-and-health-checks.md): a cheap dashboard banner, the
 * `storytree library --check` full report, and the ADR-0022 CI gate. NOT a standalone `doctor`
 * command. Ported from the read-only prototype (docs/research/library-doctor-prototype.mjs).
 *
 * Four checks run over the projection (`StoredDoc[]`; the body is in `d.doc`):
 *   1 schema-conformance  — every structured doc upcastAndValidate()s against the current schema (GATE)
 *   2 retired-field       — no doc carries a field a past migration removed (denylist) (GATE)
 *   3 version-floor       — no doc below CURRENT_SCHEMA_VERSION (GATE)
 *   4 referential-integ.  — asset:<id> resolves to a live id (FAIL on break); a DECISION doc: pointer
 *                           resolves against the projection's own `adr-NNNN` rows (see
 *                           referentialIntegrity); any other doc:<path> via docExists, node:<id> via
 *                           nodeExists, and an increment's cites story:/capability: via
 *                           workUnitTier (WARN) (WARN-class, except the FAILs named above)
 *
 * (There was a fifth, count-reconciliation — structured-kind docs == the generated assets.json count.
 * ADR-0210 deleted that file and this check together, with no replacement; see libraryHealth below.)
 *
 * The function stays node-light: the out-of-library resolvers (`docExists`, `nodeExists`,
 * `workUnitTier`) are INJECTED via {@link HealthOpts}, so it is pure and unit-testable; the CLI
 * layer provides the fs-backed resolvers (design §4 "keep it node-light").
 */

export type CheckLevel = "PASS" | "WARN" | "FAIL";

export interface CheckResult {
  /** Stable check name (e.g. "schema-conformance"). */
  readonly name: string;
  readonly level: CheckLevel;
  /** Human-facing detail lines (offending ids, or the clean summary). */
  readonly lines: string[];
}

export interface HealthOpts {
  /** The schema version every freshly-written structured doc must conform to (from migrations). */
  readonly currentSchemaVersion: number;
  /** Fields removed by past migrations — must not reappear (e.g. ["seeAlso"]). */
  readonly retiredFields: string[];
  /**
   * Resolve a NON-DECISION `doc:<relpath>` pointer on disk (relative to docs/). Omit to skip
   * disk-backed doc: resolution.
   *
   * It no longer covers the whole scheme: a DECISION pointer resolves against the projection's own
   * `adr-NNNN` rows and never reaches this resolver (see {@link referentialIntegrity}). Omitting
   * this therefore skips research notes and specs — it can no longer switch the decision tier off,
   * which is deliberate.
   */
  readonly docExists?: (relpath: string) => boolean;
  /**
   * Resolve a `node:<id>` pointer to a story / capability node spec (ADR-0107 D2). Omit to skip
   * node: resolution — the same fail-open posture as {@link HealthOpts.docExists}.
   */
  readonly nodeExists?: (nodeId: string) => boolean;
  /**
   * Resolve a `story:<id>` / `capability:<id>` pointer (ADR-0306 D1) to the TIER that unit actually
   * has in this checkout, or null when it is not here at all. Omit to skip work-hierarchy resolution
   * entirely — the same fail-open posture as its two neighbours, and load-bearing here: an omitted
   * resolver must never be read as "nothing resolves", because the hierarchy is branch-dependent and
   * a false dangling report is exactly what ADR-0306 refuses to produce.
   *
   * Tier-aware rather than a boolean because the schemes are typed: `story:` naming a real capability
   * is a different (and cheaply fixed) defect from naming nothing, and reporting it as absence would
   * send a reader hunting for a unit that is right there.
   */
  readonly workUnitTier?: (id: string) => WorkTier | null;
}

/**
 * The GATE-class checks: the invariant `.strict()` already promises, enforced across the WHOLE set
 * (design §4 "Gate vs. warn"). A FAIL on any of these is a real gate break (non-zero exit). The
 * remaining check (referential-integrity) is WARN-class — a graph invariant with benign transient
 * violations — so it never gates yet.
 */
export const GATE_CHECKS: ReadonlySet<string> = new Set([
  "schema-conformance",
  "retired-field",
  "version-floor",
]);

/** The cheap checks (no filesystem walk / DB hit) — what the dashboard banner runs (design §4 surface a). */
export const CHEAP_CHECKS: ReadonlySet<string> = new Set([
  "schema-conformance",
  "retired-field",
  "version-floor",
]);

/**
 * Fields removed by a past migration that must not reappear (design §4 check 2): `seeAlso`
 * (migration #1, the sources incident) + the agent kind's prose authority walls and
 * `requiredReading` (migration #2, the ADR-0029 owner reshape — walls are code/guardrails,
 * context is a typed ref-list). The denylist the retired-field check runs against — lives with
 * the check (moved here from the CLI dispatch when the health module joined `@storytree/drive`).
 */
export const RETIRED_FIELDS = ["seeAlso", "owns", "doesNotTouch", "authority", "requiredReading"];

/** The structured-kind keys (KIND_SPECS) — a `template` doc is NOT structured and is skipped by the schema checks. */
const STRUCTURED_KINDS: ReadonlySet<string> = new Set(Object.keys(KIND_SPECS));

/** Pull the doc body (a record) off a StoredDoc, or {} if it is not an object. */
function bodyOf(d: StoredDoc): Record<string, unknown> {
  return typeof d.doc === "object" && d.doc !== null ? (d.doc as Record<string, unknown>) : {};
}

/** True iff this stored doc is a STRUCTURED knowledge unit (kind is a KIND_SPECS key, not a template). */
function isStructured(d: StoredDoc): boolean {
  return STRUCTURED_KINDS.has(d.kind);
}

/** The `references` string[] off a doc body. */
function refsOf(body: Record<string, unknown>): string[] {
  const v = body.references;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The typed ref-list field values (KIND_SPECS `refList`, e.g. the agent kind's
 * context/rules/antiPatterns) off a structured doc — they carry `asset:` pointers exactly like
 * `references`, so referential-integrity scans them too (the ADR-0029 Q4 WARN posture covers
 * their dangling candidate refs the same way).
 */
function refListRefsOf(d: StoredDoc, body: Record<string, unknown>): string[] {
  if (!isStructured(d)) return [];
  const specs = KIND_SPECS[d.kind as keyof typeof KIND_SPECS] ?? [];
  const out: string[] = [];
  for (const spec of specs) {
    if (spec.refList !== true) continue;
    const v = body[spec.field];
    if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return out;
}

/**
 * An increment's `cites` (ADR-0306 D2) off a doc body. A schema-level field, not a KIND_SPECS body
 * section, so neither {@link refsOf} nor {@link refListRefsOf} would see it — and a citation edge
 * nothing checks is precisely the "renamed and nobody noticed" failure the typed schemes replace.
 */
function citesOf(body: Record<string, unknown>): string[] {
  const v = body["cites"];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// 1. schema-conformance --------------------------------------------------------------------------
function schemaConformance(docs: readonly StoredDoc[]): CheckResult {
  const structured = docs.filter(isStructured);
  const bad: string[] = [];
  for (const d of structured) {
    try {
      upcastAndValidate(bodyOf(d));
    } catch (e) {
      bad.push(`${d.id}: ${String((e as Error).message).split("\n")[0]}`);
    }
  }
  return {
    name: "schema-conformance",
    level: bad.length > 0 ? "FAIL" : "PASS",
    lines:
      bad.length > 0
        ? bad
        : [`all ${structured.length} structured units validate against the current Knowledge schema`],
  };
}

// 2. retired-field -------------------------------------------------------------------------------
function retiredField(docs: readonly StoredDoc[], retired: readonly string[]): CheckResult {
  const hits: string[] = [];
  for (const d of docs) {
    const body = bodyOf(d);
    for (const f of retired) if (f in body) hits.push(`${d.id} still carries '${f}'`);
  }
  return {
    name: "retired-field",
    level: hits.length > 0 ? "FAIL" : "PASS",
    lines:
      hits.length > 0 ? hits : [`no unit carries a retired field (${retired.join(", ") || "none"})`],
  };
}

// 3. version-floor -------------------------------------------------------------------------------
function versionFloor(docs: readonly StoredDoc[], current: number): CheckResult {
  const structured = docs.filter(isStructured);
  const behind = structured
    .map((d) => {
      const v = bodyOf(d).schemaVersion;
      return { id: d.id, v: typeof v === "number" ? v : 0 };
    })
    .filter((u) => u.v < current);
  return {
    name: "version-floor",
    level: behind.length > 0 ? "FAIL" : "PASS",
    lines:
      behind.length > 0
        ? [
            `${behind.length}/${structured.length} units below schemaVersion ${current}`,
            ...behind.map((u) => `  ${u.id} (v${u.v})`),
          ]
        : [`every structured unit at or above schemaVersion ${current}`],
  };
}

/**
 * The `docs/`-RELATIVE path a NON-DECISION `doc:` pointer names — what `docExists` is asked.
 *
 * A `doc:` payload is docs-relative as authored (`doc:research/note.md`), so this is a slice and
 * nothing more. It is a named function rather than an inline slice because the thing it must NOT do
 * is now the interesting part: it must not rewrite paths. The previous version carried a
 * decision-record branch that mapped `doc:docs/decisions/NNNN-slug.md` back onto a `docs/`-relative
 * FILE, which was correct for exactly as long as those files existed. PR #1546 deleted the whole
 * directory (ADR-0403 dec 1 made a decision an ordinary `adr-NNNN` Library row), and the branch then
 * pointed all 1,035 stored decision pointers at absent files — 645 false "no such file under docs/"
 * reports on 2026-08-22, burying the 13 genuine ones. Decision pointers no longer reach this
 * function at all; see {@link decisionRowNumbers} and the `doc:` arm of {@link referentialIntegrity}.
 *
 * A `doc:` pointer {@link parseDecisionPointer} does not claim — a research note, or a foreign
 * `vendor/decisions/…` tree whose anchoring it deliberately refuses — still resolves on disk here,
 * exactly as authored. `docs/` still holds real files and that half was never broken.
 */
function docsRelativeTarget(ref: string): string {
  return ref.slice(DOC_REF_PREFIX.length);
}

/**
 * The decision numbers this projection HOLDS AS ROWS — `adr-0403` → 403 (ADR-0403 dec 1).
 *
 * DERIVED FROM THE SAME `docs` ARRAY THE CHECK ALREADY HAS, never injected, and that is the whole
 * safety argument. Its three out-of-library neighbours (`docExists` / `nodeExists` / `workUnitTier`)
 * are OPTIONAL and fail OPEN — omit one and that token is silently skipped — which is defensible for
 * a tree this check does not own. It is NOT defensible here: decisions live in the very store this
 * report is reading, so an optional resolver could be dropped by a future caller and the whole
 * decision tier would go unchecked while the report still printed a clean line. That degradation —
 * green and worthless — is the exact fault `decision-log-readers-arc` exists to clear, so the
 * resolver is made structurally unomittable instead of documented as a hazard.
 *
 * One bulk pass over the projection, not ~1,035 point lookups: `queryDocs()` already returned every
 * row, decision rows included.
 *
 * {@link adrNumberOfArtifactId} is strict about the four-digit shape, so a future `adr-health-notes`
 * artifact reads as "not a decision" rather than widening this set with a NaN.
 */
function decisionRowNumbers(docs: readonly StoredDoc[]): ReadonlySet<number> {
  const out = new Set<number>();
  for (const d of docs) {
    const n = adrNumberOfArtifactId(d.id);
    if (n !== null) out.add(n);
  }
  return out;
}

// 4. referential-integrity -----------------------------------------------------------------------
/**
 * All FIVE corpus reference tokens are checked: `asset:<id>` against the live projection (a real
 * graph break — FAIL), `doc:<relpath>` via the injected `docExists` (softer, a doc can move — WARN),
 * and `node:<id>` via the injected `nodeExists` (ADR-0107 D2's proving-process anchor — also WARN,
 * because like a doc it points OUT of the library at a tree this check does not own). A `node:` ref
 * used to fall through every arm and be silently ignored, so a retired story left its citations
 * dangling invisibly. The `story:<id>` / `capability:<id>` schemes (ADR-0306 D1) join them via
 * `workUnitTier`, WARN-class for the same reason and one more: what they point at is BRANCH-
 * DEPENDENT, so an increment citing a story its own branch has not landed yet is legal and must
 * report rather than fail. All THREE out-of-library resolvers are OPTIONAL — omit one and that token
 * is skipped, never failed.
 *
 * ## A DECISION POINTER RESOLVES AGAINST THE STORE, NOT THE FILESYSTEM
 *
 * `doc:` is the one scheme with TWO subjects. A decision record stopped being a file when ADR-0403
 * dec 1 made it an ordinary `adr-NNNN` Library row and PR #1546 deleted `docs/decisions/`, so
 * `doc:decisions/0403-….md` is satisfied when `adr-0403` EXISTS AS A ROW — the same rows this very
 * projection is built from. Asking `docExists` instead reported all ~1,035 stored decision pointers
 * as broken (645 lines on 2026-08-22) and buried the 13 genuine findings underneath, which is
 * precisely the noise this check's own docblock says it exists to prevent. Nothing rewrites the
 * pointers: ADR-0403 dec 7 keeps both file spellings live deliberately and {@link
 * parseDecisionPointer} is the one place that resolves any of the three, so the RESOLVER moved
 * rather than the corpus.
 *
 * That arm is NOT gated on `docExists` being injected, unlike its neighbours. Decision resolution
 * has no out-of-library tree to be agnostic about, and an omittable resolver is how "decision
 * pointers are checked" quietly becomes "decision pointers are never checked" — green and worthless.
 *
 * ## AND IT FAILS CLOSED
 *
 * ZERO DECISION ROWS IS NEVER A CLEAN INDEX (the shape `check-web-grounding.ts` already keeps
 * between a legitimate skip and a connection failure). A projection carrying decision POINTERS but
 * no decision ROWS means the store was unreadable, unmigrated or simply the wrong database — and
 * both available answers are then confidently wrong: reporting every pointer as resolving is the
 * silent zero this whole arc exists to clear, and reporting every pointer as dangling is the 645-line
 * false alarm it just cleared. So the check reports neither. It says the pointers were NOT CHECKED,
 * names how many, and FAILs — a report that cannot read its subject must not read as a clean answer.
 *
 * The refs come from three places on the doc: `references`, the KIND_SPECS `refList` fields, and an
 * increment's schema-level `cites`.
 */
function referentialIntegrity(
  docs: readonly StoredDoc[],
  docExists: ((relpath: string) => boolean) | undefined,
  nodeExists: ((nodeId: string) => boolean) | undefined,
  workUnitTier: ((id: string) => WorkTier | null) | undefined,
): CheckResult {
  const liveIds = new Set(docs.map((d) => d.id));
  const decisionRows = decisionRowNumbers(docs);
  const danglingAsset: string[] = [];
  const danglingOut: string[] = [];
  /** Decision pointers SEEN — the denominator that makes "checked" auditable rather than assumed. */
  let decisionPointers = 0;
  for (const d of docs) {
    const body = bodyOf(d);
    for (const ref of [...refsOf(body), ...refListRefsOf(d, body), ...citesOf(body)]) {
      if (ref.startsWith("asset:")) {
        const id = ref.slice("asset:".length);
        if (!liveIds.has(id)) danglingAsset.push(`${d.id} -> ${ref} (no such artifact)`);
      } else if (ref.startsWith(DOC_REF_PREFIX)) {
        const decision = parseDecisionPointer(ref);
        if (decision !== null) {
          decisionPointers++;
          // The store arm. Suppressed ONLY when the index is empty, which the census below turns
          // into a loud NOT CHECKED — never into silence.
          if (decisionRows.size > 0 && !decisionRows.has(decision.number)) {
            danglingOut.push(
              `${d.id} -> ${ref} (no such decision — ${adrDocId(decision.number)} is not in the store)`,
            );
          }
        } else if (docExists !== undefined) {
          // Any OTHER repository file — research notes, specs. Still on disk, still checked on disk.
          const rel = docsRelativeTarget(ref);
          if (!docExists(rel)) danglingOut.push(`${d.id} -> ${ref} (no such file under docs/)`);
        }
      } else if (ref.startsWith(NODE_REF_PREFIX) && nodeExists !== undefined) {
        const nodeId = ref.slice(NODE_REF_PREFIX.length);
        if (!nodeExists(nodeId)) danglingOut.push(`${d.id} -> ${ref} (no such story/capability node)`);
      } else if (
        (ref.startsWith(STORY_REF_PREFIX) || ref.startsWith(CAPABILITY_REF_PREFIX)) &&
        workUnitTier !== undefined
      ) {
        // ADR-0306 D1's two typed schemes. WARN-class like `doc:`/`node:` and for the SAME reason
        // they are: they point OUT of the library at a tree this check does not own — and here that
        // tree is branch-dependent, so a dangling ref is often just a story that has not landed yet.
        // Failing it would be a write-time rejection wearing a gate's clothes, which D1 forbids.
        const parsed = parseCiteRef(ref);
        if (parsed !== null) {
          const actual = workUnitTier(parsed.id);
          if (actual === null) {
            danglingOut.push(`${d.id} -> ${ref} (no such ${parsed.scheme} in this checkout)`);
          } else if (actual !== parsed.scheme) {
            danglingOut.push(`${d.id} -> ${ref} (exists, but as a ${actual} — wrong scheme)`);
          }
        }
      }
    }
  }
  // FAIL CLOSED. A corpus that cites decisions but holds none of them did not answer the question,
  // and an unanswered question is reported as one — first, above the findings, because it says the
  // findings below are incomplete. See the docblock's fail-closed section.
  const unchecked: string[] =
    decisionPointers > 0 && decisionRows.size === 0
      ? [
          `${decisionPointers} decision pointer(s) NOT CHECKED: this projection holds no adr-NNNN ` +
            "rows at all, so the decision log could not be read (it lives in the store since " +
            "ADR-0403 dec 1). Reporting them as resolving, or as dangling, would both be a " +
            "confident wrong answer. Bring the store up (pnpm db:up) and re-run against it.",
        ]
      : [];
  const all = [...unchecked, ...danglingAsset, ...danglingOut];
  // An unreadable decision index and a dangling asset: are both real breaks (FAIL) — the first
  // because the report cannot stand behind itself, the second because it is a graph break. A
  // dangling doc:/node:/story:/capability: is softer (WARN).
  const level: CheckLevel =
    unchecked.length > 0 || danglingAsset.length > 0 ? "FAIL" : all.length > 0 ? "WARN" : "PASS";
  // The decision census rides EVERY outcome, not just the clean one: "645 decision pointers checked
  // against 409 rows" is what distinguishes a check that ran from a check that found nothing to do,
  // and the difference is invisible in a report that only ever prints its failures.
  const census =
    decisionPointers > 0 && unchecked.length === 0
      ? [
          `${decisionPointers} decision pointer(s) resolved against ${decisionRows.size} adr-NNNN ` +
            "rows in the store",
        ]
      : [];
  return {
    name: "referential-integrity",
    level,
    lines:
      all.length > 0
        ? [...all, ...census]
        : ["every asset:/doc:/node:/story:/capability: pointer resolves", ...census],
  };
}

/**
 * Run the full health report (all four checks) over the projection. Pure: the filesystem resolver
 * comes in via {@link HealthOpts}. Returns one {@link CheckResult} per check, in a stable order (the
 * three GATE checks first, then the one WARN-class check).
 *
 * (The former count-reconciliation check compared the store to the generated assets.json; it was
 * removed with that file, ADR-0210.)
 */
export function libraryHealth(docs: StoredDoc[], opts: HealthOpts): CheckResult[] {
  return [
    schemaConformance(docs),
    retiredField(docs, opts.retiredFields),
    versionFloor(docs, opts.currentSchemaVersion),
    referentialIntegrity(docs, opts.docExists, opts.nodeExists, opts.workUnitTier),
  ];
}

/**
 * The CHEAP subset (design §4 surface a): the three checks that need no filesystem walk / DB hit, for
 * the glanceable dashboard banner. Skips the fs-heavy referential-integrity; `docExists` is never
 * called. (The former count-reconciliation cheap check retired with assets.json, ADR-0210.)
 */
export function libraryHealthCheap(docs: StoredDoc[], opts: HealthOpts): CheckResult[] {
  return [
    schemaConformance(docs),
    retiredField(docs, opts.retiredFields),
    versionFloor(docs, opts.currentSchemaVersion),
  ];
}

/** The worst level across results (FAIL > WARN > PASS). Empty => PASS. */
export function worstLevel(results: readonly CheckResult[]): CheckLevel {
  let worst: CheckLevel = "PASS";
  for (const r of results) {
    if (r.level === "FAIL") return "FAIL";
    if (r.level === "WARN") worst = "WARN";
  }
  return worst;
}

/** The GATE-class checks that FAILed — a non-empty list means a real gate break (non-zero exit). */
export function gateFailures(results: readonly CheckResult[]): CheckResult[] {
  return results.filter((r) => r.level === "FAIL" && GATE_CHECKS.has(r.name));
}

export interface LevelCountsResult { fail: number; warn: number; pass: number }

/** Count results at each level, for a one-line summary. */
export function levelCounts(results: readonly CheckResult[]): LevelCountsResult {
  let fail = 0;
  let warn = 0;
  let pass = 0;
  for (const r of results) {
    if (r.level === "FAIL") fail++;
    else if (r.level === "WARN") warn++;
    else pass++;
  }
  return { fail, warn, pass };
}
