/**
 * THE FROZEN `amends` EDGE SET, READ BACK OUT OF ITS SNAPSHOT — pure, no filesystem.
 *
 * `decision-read-measurement-arc` / `repoint-amends-reach-at-the-frozen-snapshot`.
 *
 * ## WHY AN INSTRUMENT READS A COMMITTED FILE INSTEAD OF THE CORPUS
 *
 * ADR-0419 D5 asks one before/after question: now that every amended decision self-describes, have
 * reaches INTO amended decisions fallen? Answering it needs a set of `amends` edges to join the read
 * record against — and `-inc-18` migrated all 517 of them onto `dependsOn` in place, so the live
 * corpus can no longer supply one. Measured on 2026-08-24, `probe:amends-reach` over live rows read
 * ONE edge and reported the frozen window's 203 chain-walkers as 0.
 *
 * That is not a corpus that stopped being read. It is a JOIN KEY that was deleted underneath a
 * comparison, and the distinction is invisible in the output: both look like a collapse.
 *
 * `docs/research/amends-edge-snapshot-2026-08-23.md` was frozen under ADR-0431 D2 for exactly this
 * moment — it is the ONLY machine-readable record of which decision amended which. Sourcing the
 * BEFORE and AFTER arms from it means both arms are joined against the SAME edge set, which is what
 * the design always required: an edge set that moves between arms is a confound, not a measurement.
 *
 * ## THE SNAPSHOT IS READ-ONLY, PERMANENTLY
 *
 * ADR-0431 D2: never regenerated, never edited. This parser therefore VALIDATES rather than trusts —
 * it re-reads the edge count the snapshot declares about itself in its own counts table and reports a
 * disagreement, so a file that was edited despite the rule cannot be read as authoritative in
 * silence. The alternative (trusting the row count) would make an accidental truncation look exactly
 * like a smaller corpus.
 *
 * ## WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not resolve `supersedes`, which reaches this module by no path at all — the snapshot's
 * table has no column for it, and {@link DecisionEdge} has no field for it (ADR-0403 dec 6). It does
 * not read `dependsOn`: that arm is a LIVE reading, is not part of the frozen comparison, and is
 * counted apart and never summed (ADR-0419 D1). And it never touches the amendment PROSE, which is
 * the surviving record on both ends (ADR-0431 D3).
 */

import type { DecisionEdge } from "./decision-read-baseline.js";

/** The heading the edge table lives under. Rows before it — the counts table — are never edges. */
const EDGE_TABLE_HEADING = "## Every edge";

/** The row in the counts table that states how many edges the file should hold. */
const DECLARED_COUNT_LABEL = "`amends` edges (all statuses)";

/** `ADR-0011` -> 11. Anchored, so a number inside prose in another column cannot match. */
const ADR_CELL = /^ADR-(\d{1,6})$/;

export interface AmendsSnapshot {
  /** `source -> target` decision-number pairs, in file order, duplicates already collapsed. */
  readonly edges: readonly DecisionEdge[];
  /**
   * The edge count the snapshot declares about ITSELF, from its counts table.
   *
   * `undefined` means the counts row was absent — reported as a problem rather than defaulted,
   * because a missing self-check and a passing self-check must never read the same.
   */
  readonly declaredEdgeCount: number | undefined;
  /**
   * Everything that makes this read less than authoritative, in the order found.
   *
   * NON-EMPTY IS A HARD STOP FOR A CALLER, not a warning to print: the whole value of this file is
   * that it is the frozen record, and a frozen record that no longer matches its own declaration is
   * evidence of an edit the rule forbids.
   */
  readonly problems: readonly string[];
}

/** A markdown table row split into trimmed cells; `null` when the line is not a table row. */
function cells(line: string): readonly string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  // A trailing `|` produces an empty last cell; dropping empties at both ends is what makes
  // `| a | b |` and `| a | b` parse the same, which matters because neither form is this parser's
  // to enforce on a file it may not edit.
  const parts = trimmed.split("|").map((cell) => cell.trim());
  while (parts.length > 0 && parts[0] === "") parts.shift();
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** The decision number in an `ADR-NNNN` cell, or `null` for anything else (headers, separators). */
function decisionNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const match = ADR_CELL.exec(cell);
  if (match === null) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * PURE: the frozen edge set, out of the snapshot's markdown.
 *
 * Rows are recognised STRUCTURALLY — first cell `ADR-NNNN`, third cell `ADR-NNNN` — so the header
 * row, the `| --- |` separator, and any prose paragraph between tables are skipped without needing a
 * line count. Only the region after {@link EDGE_TABLE_HEADING} is considered, which is what keeps the
 * counts table from contributing a phantom edge.
 */
export function parseAmendsSnapshot(markdown: string): AmendsSnapshot {
  const lines = markdown.split(/\r?\n/);
  const problems: string[] = [];

  let declaredEdgeCount: number | undefined;
  let inEdgeTable = false;
  const edges: DecisionEdge[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let selfEdges = 0;

  for (const line of lines) {
    if (line.trim().startsWith(EDGE_TABLE_HEADING)) {
      inEdgeTable = true;
      continue;
    }
    const row = cells(line);
    if (row === null) continue;

    if (!inEdgeTable) {
      if (row[0] === DECLARED_COUNT_LABEL) {
        const declared = Number(row[1]);
        if (Number.isInteger(declared) && declared >= 0) declaredEdgeCount = declared;
      }
      continue;
    }

    const from = decisionNumber(row[0]);
    const to = decisionNumber(row[2]);
    if (from === null || to === null) continue;

    if (from === to) {
      // A decision amending itself is not a walkable edge and would inflate every crossing count by
      // making one read look like two. Counted and reported rather than silently dropped.
      selfEdges += 1;
      continue;
    }
    const key = `${from}->${to}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    edges.push({ from, to });
  }

  if (!inEdgeTable) {
    problems.push(`the snapshot has no "${EDGE_TABLE_HEADING}" section — no edge table was read`);
  }
  if (declaredEdgeCount === undefined) {
    problems.push(
      `the snapshot's counts table has no "${DECLARED_COUNT_LABEL}" row, so this read cannot be ` +
        "checked against the file's own declaration",
    );
  } else if (declaredEdgeCount !== edges.length + duplicates + selfEdges) {
    problems.push(
      `the snapshot declares ${declaredEdgeCount} edge(s) but ${edges.length + duplicates + selfEdges} ` +
        "row(s) were read — the frozen record must never be regenerated or edited (ADR-0431 D2)",
    );
  }
  if (duplicates > 0) problems.push(`${duplicates} duplicate edge row(s) were collapsed`);
  if (selfEdges > 0) problems.push(`${selfEdges} self-edge row(s) were dropped`);

  return { edges, declaredEdgeCount, problems };
}

export interface FrozenEdgeSelection {
  /** The frozen edges both of whose ends the decision log still holds. */
  readonly edges: readonly DecisionEdge[];
  /**
   * How many frozen edges named a decision the log no longer holds.
   *
   * Expected to be ZERO and reported anyway: the corpus has only GROWN since the freeze (424 rows
   * then, 427 on 2026-08-24), so a non-zero count means a decision was removed, which is itself the
   * finding rather than a rounding detail.
   */
  readonly dropped: number;
}

/**
 * PURE: the frozen edges, narrowed to those BOTH of whose ends the corpus still holds.
 *
 * The same discipline `buildSupportGraph` applies to live rows, for the same reason: a target the
 * decision log does not hold is not walkable, and admitting one creates a phantom node a chain walk
 * could descend into.
 */
export function frozenEdgesWithinCorpus(
  edges: readonly DecisionEdge[],
  decisions: readonly number[],
): FrozenEdgeSelection {
  const known = new Set(decisions);
  const kept = edges.filter((edge) => known.has(edge.from) && known.has(edge.to));
  return { edges: kept, dropped: edges.length - kept.length };
}
