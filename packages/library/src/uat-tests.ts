import { z } from "zod";

/**
 * ADR-0044 `uat-test-units`: a story's UAT prose becomes stable, addressable test
 * units, each declaring who may attest it. Pure, no I/O — a parser + validator the
 * attestation log (ADR-0044 d.2) writes against by **test id**.
 *
 * The granularity is the UAT TEST, not the story (ADR-0044 d.1): a story has one
 * tree but many UAT tests, and "always allow both" human and machine. This module
 * owns the id scheme (`<story>#uat-<n>`) and the per-test witness enum; it never
 * touches a store, a clock, or the verdict log.
 */

// ---------------------------------------------------------------------------
// Witness kind
// ---------------------------------------------------------------------------

/**
 * Who MAY attest a UAT test (ADR-0044 d.2 "always allow both"). This is the
 * PERMISSION, finer than schema.ts's `UatWitness` (`human`|`machine`) which records
 * who DID witness a story's UAT-node: a test can admit `either`, but a recorded
 * attestation is concretely one or the other.
 */
export const UAT_TEST_WITNESSES = ["human", "machine", "either"] as const;
export const UatTestWitness = z.enum(UAT_TEST_WITNESSES);
export type UatTestWitness = z.infer<typeof UatTestWitness>;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * One addressable UAT test (ADR-0044 d.1). `id` is the join key the attestation log
 * writes against; `witness` declares who may attest. Strict: unknown fields rejected.
 *
 * `witness` defaults to `either` — the conservative default (ADR-0044 d.2 "always
 * allow both"): it neither forges a human-witnessed claim nor restricts a machine
 * run out, so a backward-compatible prose-only test still loads.
 */
export const UatTest = z
  .object({
    /** Stable test id, `<story>#uat-<n>` — the attestation log's key. */
    id: z.string().min(1),
    /** Human-readable title (the prose item's bold lead). */
    title: z.string().min(1),
    /** Who may attest this test. */
    witness: UatTestWitness.default("either"),
  })
  .strict();

export type UatTest = z.infer<typeof UatTest>;

// ---------------------------------------------------------------------------
// Id scheme
// ---------------------------------------------------------------------------

/**
 * PURE: the stable test id for a story's nth UAT test (1-based). The single home of
 * the `<story>#uat-<n>` scheme so the parser and the attestation log can never fork.
 */
export function uatTestId(storyId: string, ordinal: number): string {
  return `${storyId}#uat-${ordinal}`;
}

// ---------------------------------------------------------------------------
// Prose parser
// ---------------------------------------------------------------------------

/** Match a `## Story UAT …` heading (e.g. `## Story UAT (would-be)`). */
const STORY_UAT_HEADING = /^##[^\n\S]+Story UAT[^\n]*$/im;
/** Match the next `## …` heading after the section start. */
const NEXT_H2 = /^## /m;
/** A numbered list item lead: `1. …` (captures the rest of the first line). */
const NUMBERED_ITEM = /^\d+\.[^\n\S]+(.*)$/;
/** The bold lead of an item, e.g. `**Human relay:**` or `**Decompose**`. */
const BOLD_LEAD = /^\*\*(.+?)\*\*/;
/**
 * Optional inline witness annotation, e.g. `(witness: human)`. Captures the raw
 * value loosely so an explicit-but-invalid value can be REFUSED (not silently
 * defaulted) — the `witness-kind-validated` contract.
 */
const WITNESS_TAG = /\(witness:\s*([A-Za-z]+)\)/i;

/** Extract the `## Story UAT` section body (between its heading and the next `##`). */
function storyUatSection(body: string): string | null {
  const heading = STORY_UAT_HEADING.exec(body);
  if (heading === null) return null;
  const after = body.slice(heading.index + heading[0].length);
  const next = NEXT_H2.exec(after);
  return (next === null ? after : after.slice(0, next.index)).trim();
}

/** Split a UAT section into its numbered items, preserving multi-line continuations. */
function splitItems(section: string): string[] {
  const items: string[] = [];
  let current: string[] | null = null;
  for (const line of section.split("\n")) {
    if (NUMBERED_ITEM.test(line)) {
      if (current !== null) items.push(current.join("\n"));
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) items.push(current.join("\n"));
  return items;
}

/** Pull the title from a numbered item: the bold lead (colon stripped), else the first line. */
function itemTitle(item: string): string {
  const firstLine = (item.split("\n")[0] ?? "").replace(/^\d+\.[^\n\S]+/, "").trim();
  const bold = BOLD_LEAD.exec(firstLine);
  const raw = bold !== null ? bold[1]! : firstLine;
  return raw.replace(/:$/, "").trim();
}

/**
 * Pull the declared witness from an item. Absent → `either` (conservative default).
 * An explicit but invalid value (e.g. `(witness: nobody)`) THROWS — the
 * `witness-kind-validated` contract refuses it rather than defaulting.
 */
function itemWitness(item: string, id: string): UatTestWitness {
  const tag = WITNESS_TAG.exec(item);
  if (tag === null) return "either";
  const parsed = UatTestWitness.safeParse(tag[1]!.toLowerCase());
  if (!parsed.success) {
    throw new Error(
      `${id}: invalid witness "${tag[1]}" — must be one of ${UAT_TEST_WITNESSES.join("|")}`,
    );
  }
  return parsed.data;
}

/**
 * PURE: parse a story's markdown `body` into addressable UAT test units (ADR-0044
 * d.1). Each numbered item under `## Story UAT` becomes one {@link UatTest} with a
 * positional, stable id (`<story>#uat-<n>`, 1-based) — positional so the same prose
 * always yields the same ids regardless of how the author numbered the list.
 *
 * Backward-compatible: a story with no `## Story UAT` section (or none yet) yields
 * `[]`; an item with no witness annotation defaults to `either`. An explicit but
 * invalid witness value throws.
 */
export function parseUatTests(storyId: string, body: string): UatTest[] {
  const section = storyUatSection(body);
  if (section === null) return [];
  const items = splitItems(section);
  return items.map((item, index) => {
    const id = uatTestId(storyId, index + 1);
    return UatTest.parse({ id, title: itemTitle(item), witness: itemWitness(item, id) });
  });
}
