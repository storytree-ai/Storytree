import type { StoredDoc } from "@storytree/storage-protocol";
import {
  upcastAndValidate,
  KIND_SPECS,
  NODE_REF_PREFIX,
  CAPABILITY_REF_PREFIX,
  STORY_REF_PREFIX,
  parseCiteRef,
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
 *   4 referential-integ.  — asset:<id> resolves to a live id (FAIL on break); doc:<path> via
 *                           docExists, node:<id> via nodeExists, and an increment's cites
 *                           story:/capability: via workUnitTier (WARN) (WARN-class)
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
  /** Resolve a `doc:<relpath>` pointer on disk (relative to docs/). Omit to skip doc: resolution. */
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
  const danglingAsset: string[] = [];
  const danglingOut: string[] = [];
  for (const d of docs) {
    const body = bodyOf(d);
    for (const ref of [...refsOf(body), ...refListRefsOf(d, body), ...citesOf(body)]) {
      if (ref.startsWith("asset:")) {
        const id = ref.slice("asset:".length);
        if (!liveIds.has(id)) danglingAsset.push(`${d.id} -> ${ref} (no such artifact)`);
      } else if (ref.startsWith("doc:") && docExists !== undefined) {
        const rel = ref.slice("doc:".length);
        if (!docExists(rel)) danglingOut.push(`${d.id} -> ${ref} (no such file under docs/)`);
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
  const all = [...danglingAsset, ...danglingOut];
  // dangling asset: is a real graph break (FAIL); a dangling doc:/node: is softer (WARN).
  const level: CheckLevel =
    danglingAsset.length > 0 ? "FAIL" : all.length > 0 ? "WARN" : "PASS";
  return {
    name: "referential-integrity",
    level,
    lines: all.length > 0 ? all : ["every asset:/doc:/node:/story:/capability: pointer resolves"],
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
