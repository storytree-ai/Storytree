import type { StoredDoc } from "@storytree/storage-protocol";
import { upcastAndValidate, KIND_SPECS } from "@storytree/library";

/**
 * The Library health checks — ONE pure, testable module surfaced three ways (design §4,
 * docs/research/library-schema-migrations-and-health-checks.md): a cheap dashboard banner, the
 * `storytree library --check` full report, and the ADR-0022 CI gate. NOT a standalone `doctor`
 * command. Ported from the read-only prototype (docs/research/library-doctor-prototype.mjs).
 *
 * Five checks run over the projection (`StoredDoc[]`; the body is in `d.doc`):
 *   1 schema-conformance  — every structured doc upcastAndValidate()s against the current schema (GATE)
 *   2 retired-field       — no doc carries a field a past migration removed (denylist) (GATE)
 *   3 version-floor       — no doc below CURRENT_SCHEMA_VERSION (GATE)
 *   4 referential-integ.  — asset:<id> resolves to a live id (FAIL on break); doc:<path> via
 *                           docExists (WARN) (WARN-class)
 *   5 count-reconciliation — structured-kind docs == opts.generatedAssetCount (WARN-class)
 *
 * The function stays node-light: filesystem (`docExists`) and the generated-asset count are INJECTED
 * via {@link HealthOpts}, so it is pure and unit-testable; the CLI layer provides the fs-backed
 * resolvers (design §4 "keep it node-light").
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
  /** Resolve a `doc:<relpath>` pointer on disk (relative to docs/). Omit to skip doc: resolution. */
  readonly docExists?: (relpath: string) => boolean;
  /** Generated non-template asset count (assets.json), for count-reconciliation. Omit to skip. */
  readonly generatedAssetCount?: number;
}

/**
 * The GATE-class checks: the invariant `.strict()` already promises, enforced across the WHOLE set
 * (design §4 "Gate vs. warn"). A FAIL on any of these is a real gate break (non-zero exit). The
 * remaining checks (referential-integrity, count-reconciliation) are WARN-class — graph/derivation
 * invariants with benign transient violations — so they never gate yet.
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
  "count-reconciliation",
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

// 4. referential-integrity -----------------------------------------------------------------------
function referentialIntegrity(
  docs: readonly StoredDoc[],
  docExists: ((relpath: string) => boolean) | undefined,
): CheckResult {
  const liveIds = new Set(docs.map((d) => d.id));
  const danglingAsset: string[] = [];
  const danglingDoc: string[] = [];
  for (const d of docs) {
    const body = bodyOf(d);
    for (const ref of [...refsOf(body), ...refListRefsOf(d, body)]) {
      if (ref.startsWith("asset:")) {
        const id = ref.slice("asset:".length);
        if (!liveIds.has(id)) danglingAsset.push(`${d.id} -> ${ref} (no such artifact)`);
      } else if (ref.startsWith("doc:") && docExists !== undefined) {
        const rel = ref.slice("doc:".length);
        if (!docExists(rel)) danglingDoc.push(`${d.id} -> ${ref} (no such file under docs/)`);
      }
    }
  }
  const all = [...danglingAsset, ...danglingDoc];
  // dangling asset: is a real graph break (FAIL); dangling doc: is softer, a doc can move (WARN).
  const level: CheckLevel =
    danglingAsset.length > 0 ? "FAIL" : all.length > 0 ? "WARN" : "PASS";
  return {
    name: "referential-integrity",
    level,
    lines: all.length > 0 ? all : ["every asset:/doc: pointer resolves"],
  };
}

// 5. count-reconciliation ------------------------------------------------------------------------
function countReconciliation(
  docs: readonly StoredDoc[],
  generatedAssetCount: number | undefined,
): CheckResult {
  const structuredCount = docs.filter(isStructured).length;
  if (generatedAssetCount === undefined) {
    return {
      name: "count-reconciliation",
      level: "PASS",
      lines: [`structured units: ${structuredCount} (no generated-asset count to reconcile against)`],
    };
  }
  const ok = structuredCount === generatedAssetCount;
  return {
    name: "count-reconciliation",
    level: ok ? "PASS" : "WARN",
    lines: [
      `structured units (store): ${structuredCount}`,
      `generated non-template assets: ${generatedAssetCount}`,
      ok
        ? "source == generated (regeneration is current)"
        : "MISMATCH: assets.json is stale — re-run build-corpus.mjs",
    ],
  };
}

/**
 * Run the full health report (all five checks) over the projection. Pure: filesystem + the
 * generated-asset count come in via {@link HealthOpts}. Returns one {@link CheckResult} per check,
 * in a stable order (the three GATE checks first, then the two WARN-class checks).
 */
export function libraryHealth(docs: StoredDoc[], opts: HealthOpts): CheckResult[] {
  return [
    schemaConformance(docs),
    retiredField(docs, opts.retiredFields),
    versionFloor(docs, opts.currentSchemaVersion),
    referentialIntegrity(docs, opts.docExists),
    countReconciliation(docs, opts.generatedAssetCount),
  ];
}

/**
 * The CHEAP subset (design §4 surface a): the four checks that need no filesystem walk / DB hit, for
 * the glanceable dashboard banner. Skips the fs-heavy referential-integrity. `docExists` is never
 * called; `generatedAssetCount` is optional (count-reconciliation degrades to PASS without it).
 */
export function libraryHealthCheap(docs: StoredDoc[], opts: HealthOpts): CheckResult[] {
  return [
    schemaConformance(docs),
    retiredField(docs, opts.retiredFields),
    versionFloor(docs, opts.currentSchemaVersion),
    countReconciliation(docs, opts.generatedAssetCount),
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

/** Count results at each level, for a one-line summary. */
export function levelCounts(results: readonly CheckResult[]): { fail: number; warn: number; pass: number } {
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
