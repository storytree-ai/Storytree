/**
 * THE SEARCHABLE PROSE OF A STRUCTURED ARTIFACT (ADR-0464 D3).
 *
 * ## The fault this exists to close
 *
 * `library search` ranked every artifact on `title` + `description` + `body`. That reads the whole of
 * a decision and the whole of an increment, and almost nothing of anything else — because only three
 * kinds store their prose in a `body` field at all. Measured on the live corpus, 2026-08-27:
 *
 * | kind | rows | carry `body` | mean body | mean description |
 * |---|---:|---:|---:|---:|
 * | `increment` | 1,145 | 1,145 | 3,999 | 138 |
 * | `adr` | 460 | 460 | 11,742 | 95 |
 * | `principle` | 95 | **0** | — | 240 |
 * | `guardrail` | 22 | **0** | — | 165 |
 * | `process` | 21 | **0** | — | 259 |
 * | `agent` | 13 | **0** | — | 314 |
 *
 * Every other kind keeps its prose in the per-kind section fields {@link KIND_SPECS} declares — a
 * guardrail's `rule` / `enforcedBy` / `failureMode`, a definition's `whatItIs`, a process's `steps`,
 * an agent's `role` and `workflow`. None of it was indexed. So the ranker was comparing a decision's
 * 11,742 characters against a guardrail's 165, and the guardrail lost queries whose ANSWER it is.
 *
 * That is the deeper half of "the ranked population is wrong": not only WHICH rows are ranked
 * (`TRANSIENT_KINDS` in `./search.ts`) but WHICH TEXT of them is. No amount of tier weighting can
 * promote a passage the index never read.
 *
 * ## Why this is driven by KIND_SPECS and not by a hand-kept field list
 *
 * Same reason `renderBody` is: a list written out here would be one more thing to update when a kind
 * gains a field, and its failure is invisible — search would simply stop seeing the new prose, and
 * every query would still return plausible results. Reading the spec table means a new field is
 * searchable the day it is authored.
 *
 * It is deliberately NOT `renderBody`, though the two read the same table. `renderBody` reproduces
 * the stored markdown byte-for-byte, headings and ref bullets included; this wants the words only, so
 * headings ("What it is", "Rule") never enter the index as corpus-wide noise terms.
 *
 * ## Why ref-list fields are skipped
 *
 * A `refList` field holds `asset:<id>` pointers, not prose. Indexing them would make every artifact
 * findable by the ids it cites — so a search for `merge-ceremony` would return each of the thirteen
 * agents that stand on it above the ceremony itself. The pointers are already extracted separately as
 * edges (`refsOf` in the CLI adapter), which is where a reader can act on them.
 *
 * Pure and browser-safe: no `node:` import, no store, no clock.
 */

import { KIND_SPECS, type KindFieldSpec } from "./knowledge.js";

/**
 * {@link KIND_SPECS} widened to a string-keyed lookup, by ASSIGNMENT rather than by assertion.
 *
 * `KIND_SPECS` is typed with `satisfies` so it keeps its literal keys — which is what makes the
 * totality check over `KnowledgeKind` work, and is exactly why it cannot be indexed by a `string`
 * that arrived from a database row. Widening it here is a checked assignment (the compiler proves the
 * shape fits), so no cast is needed and `noUncheckedIndexedAccess` gives the `| undefined` this
 * module's tolerance depends on.
 */
const SPEC_TABLE: Readonly<Record<string, readonly KindFieldSpec[]>> = KIND_SPECS;

/**
 * The prose of one stored artifact, joined with newlines in {@link KIND_SPECS} order — or `""` when
 * the kind declares no section fields.
 *
 * TOLERANT BY DESIGN, and that is the difference from `renderBody`, which throws on an unknown kind.
 * This runs over whatever the store holds, including rows a running binary is older than and the
 * rendered `LibraryAsset` kinds that have no spec entry at all (`template`). An empty string is the
 * honest answer for those and lets the caller fall back to `body`; a throw would take the whole
 * search down over one unrecognised row.
 */
export function searchProse(kind: string, doc: Record<string, unknown>): string {
  const specs = SPEC_TABLE[kind];
  if (specs === undefined) return "";
  const parts: string[] = [];
  for (const spec of specs) {
    const value = doc[spec.field];
    // Prose only. An array is a ref-list of `asset:` pointers (see the header); anything else is
    // structured state (`schemaVersion`, a timestamp) and is not text a reader would search for.
    if (typeof value === "string" && value !== "") parts.push(value);
  }
  return parts.join("\n\n");
}
