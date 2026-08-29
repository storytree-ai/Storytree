/**
 * THE `references` READER CENSUS, AS A RE-RUNNABLE SCAN — pure, no filesystem, no store.
 *
 * `citation-tier-retirement-arc` / `citation-tier-retirement-arc-inc-01`, under ADR-0477 D3 step 1.
 *
 * ## WHY A VERB AND NOT A SESSION'S GREP
 *
 * ADR-0477 retires the `references` field and the `Sources:` block. Its staged order is safe only
 * because step 1 enumerates every reader BEFORE step 4 removes the field, and the ADR names that
 * enumeration as the arc's single point of failure: a reader that only runs against the live store
 * may never be exercised by the hermetic gate legs, so **a green gate is not sufficient evidence**
 * that nothing was left behind.
 *
 * A grep in a transcript cannot be re-run by the session that does the removal. So the census is a
 * committed DOCUMENT plus this scan, and the scan's job is to answer one question mechanically:
 * *does the tree contain a reader the census does not name?* An UNCENSUSED file is a failure, because
 * it is exactly the shape the ADR says will not break — it will read a field that is gone and
 * quietly report something smaller.
 *
 * ## WHAT THIS IS, EXACTLY — AND WHAT IT CANNOT BE
 *
 * It is a LEXICAL scan. It finds the field NAME in a code position and nothing more. It cannot know
 * whether a hit is the library field or an unrelated property of the same name (the oxlint rules'
 * `variable.references` from the ESLint scope API is the live example, and the census marks it
 * `not-the-field`). It cannot find a reader that reaches the field through a computed key, a spread,
 * or a `Record<string, unknown>` walk that never spells it.
 *
 * So this verb is a FLOOR on the census, never a proof of it. It catches the reader nobody thought
 * of; it does not certify that the ones it found are all there are. That limit is printed in the
 * output rather than left for a reader to infer, on the same ground as `amends-snapshot.ts`
 * validating the count its own snapshot declares: an instrument that reads as more than it is, is
 * how a confident wrong answer gets published.
 *
 * ## THE TEST POPULATION IS COUNTED, NOT CLASSIFIED
 *
 * Test files are reported as a count and deliberately not enumerated in the census. A test that
 * reads a removed field FAILS — loudly, at the moment of removal — which is the honest signal the
 * census exists to manufacture for production code that would instead go quiet. Classifying ~120
 * test files would bury the ~40 readers that actually need a disposition.
 */

/** A code-position occurrence of the field name — not a mention in prose. */
export interface CitationHit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** One census row: a production reader and what step 4 must do about it. */
export interface CensusEntry {
  readonly file: string;
  readonly disposition: string;
}

export interface CensusVerdict {
  /** Production files carrying at least one hit, sorted. */
  readonly production: readonly string[];
  /** Test files carrying at least one hit — counted, never classified. */
  readonly tests: readonly string[];
  /** Production files the census does not name — the failure condition. */
  readonly uncensused: readonly string[];
  /** Census rows whose file carries no hit any more — retired, or moved. */
  readonly resolved: readonly string[];
  /** How many rows the census declares — carried, not re-derived from the other counts. */
  readonly censusRows: number;
  /** True iff every production reader is named by the census. */
  readonly ok: boolean;
}

/**
 * The field name in a CODE position: a property read (`.references`), a declaration or object key
 * (`references:`), a destructure (`{ references }` / `{ references, …}`), or a string key
 * (`"references"`). A bare word in a sentence does not match, which is what keeps prose out.
 */
const CODE_POSITION =
  /(\.references\b|\breferences\s*:|\{\s*references\s*[,}]|['"]references['"])/;

/** A line that is only a comment — `//` or a jsdoc continuation — carries prose, not a reader. */
const COMMENT_ONLY = /^\s*(\/\/|\*|\/\*)/;

/** Test and fixture scaffolding: counted, never classified (see the module header). */
export function isTestFile(file: string): boolean {
  return /\.(test|uat\.test|spec)\.(ts|tsx|mts)$/.test(file) || /(^|\/)fixture\//.test(file);
}

/** Source files worth scanning — the runtime surfaces, not markdown or generated JSON. */
export function isScannable(file: string): boolean {
  return /\.(ts|tsx|mts|mjs|sql)$/.test(file);
}

/**
 * PURE: every code-position hit in one file's text, 1-indexed, comment-only lines dropped.
 */
export function scanFile(file: string, text: string): CitationHit[] {
  const out: CitationHit[] = [];
  const lines = text.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (COMMENT_ONLY.test(line)) continue;
    if (!CODE_POSITION.test(line)) continue;
    out.push({ file, line: i + 1, text: line.trim() });
  }
  return out;
}

/**
 * PURE: reconcile a scan against the census.
 *
 * `ok` is false when any production file carries a hit the census does not name. A `resolved` row is
 * NOT a failure — it is the expected shape after step 4 retires a reader, and the whole census should
 * read `resolved` once the arc closes.
 */
export function reconcile(
  hits: readonly CitationHit[],
  census: readonly CensusEntry[],
): CensusVerdict {
  const files = [...new Set(hits.map((h) => h.file))].sort();
  const production = files.filter((f) => !isTestFile(f));
  const tests = files.filter((f) => isTestFile(f));
  const named = new Set(census.map((c) => c.file));
  const uncensused = production.filter((f) => !named.has(f));
  const withHits = new Set(production);
  const resolved = census.map((c) => c.file).filter((f) => !withHits.has(f)).sort();
  return { production, tests, uncensused, resolved, censusRows: census.length, ok: uncensused.length === 0 };
}

/**
 * PURE: the census table out of its own markdown.
 *
 * The census is ONE artifact — a document a person reads and a table this verb parses — on the
 * `amends-snapshot.ts` precedent. Rows look like:
 *
 *     | `packages/cli/src/commands.ts` | the Sources block | retire |
 *
 * The first cell is the path (backticks stripped), the last is the disposition. A line that is not a
 * table row, or whose first cell is not a scannable path, is skipped — so prose, headers and the
 * separator row cost nothing.
 */
export function parseCensus(markdown: string): CensusEntry[] {
  const out: CensusEntry[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("|")) continue;
    // Split the row into a leading cell and the rest, so the two guards below answer DIFFERENT
    // questions: `first` is absent only for a row with no cells at all, and `last` is absent for a
    // row with exactly one — `| a |`, where a single cell would have to serve as both the path and
    // its disposition. A `cells.length < 2` test alongside them would subsume both and be
    // unfalsifiable, which is a guard no test can ever be shown to exercise.
    const [first, ...rest] = line.split("|").slice(1, -1).map((c) => c.trim());
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — this guard is a TYPE narrowing,
    // not a behavioural branch. `first` is absent only when the row split to NO cells, and that same
    // row leaves `rest` empty too, so the `last` guard below already skips it. No input can make this
    // check the sole reason a row is dropped, so no test can distinguish it from its removal. It
    // earns its place by narrowing `first` for the `.replace` on the line after next.
    if (first === undefined) continue;
    const last = rest.at(-1);
    if (last === undefined) continue; // exactly one cell, which cannot be both path and disposition
    const file = first.replace(/`/g, "").trim();
    if (!isScannable(file)) continue;
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({ file, disposition: last });
  }
  return out;
}

/** The human-readable verdict, including the floor-not-proof caveat. */
export function formatVerdict(v: CensusVerdict): string {
  const lines: string[] = [];
  lines.push("probe:citation-readers — readers of the `references` field (ADR-0477 D3 step 1)");
  lines.push("");
  lines.push(`  production readers scanned : ${v.production.length}`);
  lines.push(`  census rows                : ${v.censusRows}`);
  lines.push(`  test files (counted only)  : ${v.tests.length}`);
  lines.push(`  UNCENSUSED                 : ${v.uncensused.length}`);
  lines.push(`  resolved (no hit any more) : ${v.resolved.length}`);
  if (v.uncensused.length > 0) {
    lines.push("");
    lines.push("UNCENSUSED READERS — the census is stale and step 4 is NOT safe:");
    for (const f of v.uncensused) lines.push(`  ✗ ${f}`);
  }
  if (v.resolved.length > 0) {
    lines.push("");
    lines.push("resolved — named by the census, no code-position hit remains:");
    for (const f of v.resolved) lines.push(`  ✓ ${f}`);
  }
  lines.push("");
  lines.push(
    "This scan is a FLOOR on the census, not a proof of it: it is lexical, so it cannot see a\n" +
      "reader that reaches the field through a computed key or an untyped record walk, and it cannot\n" +
      "tell the library field from an unrelated property of the same name. Walk the census's own\n" +
      "dispositions before removing anything.",
  );
  return lines.join("\n");
}
