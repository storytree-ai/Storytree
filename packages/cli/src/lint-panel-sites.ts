/**
 * The SITE SAMPLER for the judge-panel packet — the impure half of `lint-panel.ts`, split out for the
 * same reason `ownership.ts` is split from `source-ownership.ts`: the rule set stays exhaustively
 * unit-testable offline while the I/O glue stays dumb.
 *
 * IT CONSUMES A REPORT, IT DOES NOT RUN THE LINTER. `oxlint` is invoked by the operator and its JSON
 * handed in. That is not laziness — the inventory (`tools/oxlint/inventory.md`) records a measured
 * trap where `-A all` combined with `-D anti-slop/<rule>` silently reports a near-empty run because
 * the CLI's `-D` flags do not enable JS-plugin rules. A sampler that shelled out would be one more
 * place for that to happen quietly; consuming a report the operator produced with the documented
 * command keeps the measurement where it can be checked.
 *
 * STRATIFIED, NOT HEAD-OF-LIST. A rule's first N diagnostics are whatever the file walk reached
 * first, which in this repo means `apps/` before `packages/` and one directory dominating the sample.
 * The arc is explicit that the panel must see "a spread across the store seam, the studio, and
 * ordinary application code" — so {@link sampleSites} round-robins across areas, and a judge asked
 * whether the code's resistance is principled gets to see both the seam that has a real argument and
 * the ordinary code that does not.
 *
 * DETERMINISTIC. Same report, same options, same sites — so a later increment re-running this lane's
 * panel is re-running the same instrument rather than a similar one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { PanelSite } from "./lint-panel.js";

/** One diagnostic as `oxlint --format=json` emits it. Narrow on purpose: only what sampling reads. */
export interface OxlintDiagnostic {
  readonly code?: string;
  readonly message?: string;
  readonly filename?: string;
  readonly labels?: readonly {
    readonly span?: {
      readonly offset?: number;
      readonly length?: number;
      readonly line?: number;
      readonly column?: number;
    };
  }[];
}

/** A diagnostic reduced to the location facts sampling needs. */
export interface SiteLocation {
  readonly file: string;
  readonly line: number;
  readonly offset: number;
  readonly length: number;
}

export interface SampleOptions {
  /** How many sites to put in front of the judges. */
  readonly limit: number;
  /** Lines of source shown either side of the flagged line. */
  readonly contextLines: number;
}

/**
 * TEST SITES ARE NOT PANEL EVIDENCE, and this is a decision rather than a convenience.
 *
 * ADR-0407 D4 already held tests to a laxer bar than production source, owner-decided — a test faking
 * a dependency is doing something categorically different from production code lying about a type. A
 * panel shown test sites is therefore being asked a question the house has already answered
 * separately, and its verdict would silently blend the two. Adjudicate the rule on the code the rule
 * would actually govern.
 */
export function isTestFile(file: string): boolean {
  return /(^|\/)e2e\//.test(file) || /\.test\.[cm]?tsx?$/.test(file);
}

/** Read an `oxlint --format=json` payload, tolerating both the wrapped and bare-array shapes. */
export function readDiagnostics(payload: string): OxlintDiagnostic[] {
  const parsed: unknown = JSON.parse(payload);
  if (Array.isArray(parsed)) return parsed as OxlintDiagnostic[];
  if (parsed !== null && typeof parsed === "object") {
    const diagnostics = (parsed as { diagnostics?: unknown }).diagnostics;
    if (Array.isArray(diagnostics)) return diagnostics as OxlintDiagnostic[];
  }
  return [];
}

/** Everything the given rule flagged, as locations, in report order. */
export function locationsForRule(
  diagnostics: readonly OxlintDiagnostic[],
  ruleId: string,
): SiteLocation[] {
  const tail = ruleId.slice(ruleId.lastIndexOf("/") + 1);
  const out: SiteLocation[] = [];
  for (const diagnostic of diagnostics) {
    const code = diagnostic.code ?? "";
    if (!code.includes(tail)) continue;
    const span = diagnostic.labels?.[0]?.span;
    const file = diagnostic.filename;
    if (span === undefined || file === undefined) continue;
    const line = span.line;
    const offset = span.offset;
    const length = span.length;
    if (line === undefined || offset === undefined || length === undefined) continue;
    out.push({ file: file.replace(/\\/g, "/"), line, offset, length });
  }
  return out;
}

/**
 * The AREA a site belongs to — `packages/library`, `apps/studio`, and so on.
 *
 * Two segments, because one ("packages") collapses the whole monorepo into a single bucket and three
 * splits `packages/cli/src` from `packages/cli/scripts`, which are not different architectures.
 */
export function areaOf(file: string): string {
  const parts = file.split("/").filter((p) => p.length > 0);
  return parts.slice(0, 2).join("/") || file;
}

/**
 * Round-robin across areas, then across files within an area.
 *
 * The second level matters as much as the first: `packages/cli` alone carries a quarter of some
 * rules' firings, and twelve sites from one file is a sample of a file, not of a rule.
 */
export function sampleSites(
  locations: readonly SiteLocation[],
  options: SampleOptions,
): SiteLocation[] {
  const byArea = new Map<string, Map<string, SiteLocation[]>>();
  for (const location of locations) {
    const area = areaOf(location.file);
    let files = byArea.get(area);
    if (files === undefined) {
      files = new Map<string, SiteLocation[]>();
      byArea.set(area, files);
    }
    const bucket = files.get(location.file);
    if (bucket === undefined) files.set(location.file, [location]);
    else bucket.push(location);
  }

  // DENSEST AREA FIRST, ties broken alphabetically.
  //
  // Sorting the areas by NAME looked neutral and was not: this repo has roughly twenty areas, a
  // packet shows a handful of sites, and round-robin over an alphabetical list therefore reaches
  // exactly the alphabetically-first areas every time. Measured on this lane's first packet, that
  // drew `apps/desktop` through `packages/context-traversal-capture` and never reached
  // `packages/storage-protocol` — the document-store seam that carries the strongest architectural
  // argument AGAINST the rule under adjudication. A sample that systematically omits the best case
  // for the code is not a neutral sample, it is a favourable one, and it would have produced a
  // verdict the arc could not honestly rely on.
  //
  // Density is the honest ordering: it puts the panel in front of the places the rule actually
  // governs, and it is a property of the report rather than of the target, so it cannot be tuned
  // toward an answer.
  const areas = [...byArea.keys()].sort((a, b) => {
    const countOf = (area: string): number =>
      [...(byArea.get(area)?.values() ?? [])].reduce((sum, bucket) => sum + bucket.length, 0);
    const delta = countOf(b) - countOf(a);
    return delta !== 0 ? delta : a.localeCompare(b);
  });
  const cursors = new Map<string, { files: string[]; fileIndex: number; withinFile: number }>();
  for (const area of areas) {
    const files = [...(byArea.get(area)?.keys() ?? [])].sort();
    cursors.set(area, { files, fileIndex: 0, withinFile: 0 });
  }

  const picked: SiteLocation[] = [];
  let exhausted = false;
  while (picked.length < options.limit && !exhausted) {
    exhausted = true;
    for (const area of areas) {
      if (picked.length >= options.limit) break;
      const cursor = cursors.get(area);
      const files = byArea.get(area);
      if (cursor === undefined || files === undefined) continue;
      // Advance past files this area has already fully drawn from.
      while (cursor.fileIndex < cursor.files.length) {
        const file = cursor.files[cursor.fileIndex];
        const bucket = file === undefined ? undefined : files.get(file);
        if (bucket !== undefined && cursor.withinFile < bucket.length) break;
        cursor.fileIndex += 1;
        cursor.withinFile = 0;
      }
      if (cursor.fileIndex >= cursor.files.length) continue;
      const file = cursor.files[cursor.fileIndex];
      const bucket = file === undefined ? undefined : files.get(file);
      const location = bucket?.[cursor.withinFile];
      if (location === undefined) continue;
      picked.push(location);
      exhausted = false;
      // One per file per pass, so a dense file cannot crowd out its neighbours.
      cursor.fileIndex += 1;
      if (cursor.fileIndex >= cursor.files.length) {
        cursor.fileIndex = 0;
        cursor.withinFile += 1;
      }
    }
  }
  return picked;
}

/**
 * Read a location's flagged text and surrounding source off disk.
 *
 * ⚠ THE SPAN IS A BYTE OFFSET, NOT A STRING INDEX. oxlint reports offsets into the file's UTF-8
 * bytes; `String.prototype.slice` indexes UTF-16 code units. Every non-ASCII character before the
 * span pushes the two apart — and this codebase's comments are full of em-dashes, three bytes each
 * against one code unit, so the drift reaches dozens of characters within a single file.
 *
 * Sliced as a string, the excerpt lands somewhere else entirely: `arc-rollup.ts:307` rendered as
 * `v === "string" ? v : ""` instead of `Record<string, unknown>`. It was caught by the JUDGES on
 * this lane's first panel run, two of whom reported that the flagged spans did not match the
 * construct — and one of whom held the apparently-broken diagnostics AGAINST the rule under
 * adjudication. That is the shape of the damage: a defect in the instrument was read as a defect in
 * the subject, and it pushed the verdict toward the answer the operator already expected.
 */
export function readSite(root: string, location: SiteLocation, contextLines: number): PanelSite {
  const absolute = path.join(root, location.file);
  const bytes = readFileSync(absolute);
  const source = bytes.toString("utf8");
  const flagged = bytes
    .subarray(location.offset, location.offset + location.length)
    .toString("utf8");
  const lines = source.split(/\r?\n/);
  const start = Math.max(0, location.line - 1 - contextLines);
  const end = Math.min(lines.length, location.line + contextLines);
  return {
    file: location.file,
    line: location.line,
    flagged,
    context: lines.slice(start, end).join("\n"),
  };
}
