import { z } from "zod";

/**
 * ADR-0085 (resolving ADR-0083 Fork B): a brownfield / foundational story declares a
 * `## Reliability Gates` section — the author-owned obligation set that flips it green,
 * SEPARATE from `## Story UAT` (the integrated acceptance journey; a pure port has none).
 *
 * Each numbered item is a stable, addressable gate unit (`<story>#gate-<n>`) that earns a
 * real signed verdict; the story greens only when ALL its gates (and its UAT tests, and its
 * capabilities — ADR-0083 Fork A) are healthy. A gate's `kind` says HOW it is earned:
 *  - `observe`      — "the existing suite / scaffolding works": observe-and-sign at a clean
 *                     HEAD → an `adopted` machine verdict (ADR-0085 d.3). Needs a `proofCommand`.
 *  - `build-tests`  — brownfield code with no test-first coverage; the writer flags the gap →
 *                     earned by a genuine red→green through the gate (real work, real red).
 *  - `integrate`    — an existing suite not structured as capabilities; wrap it → earned when
 *                     the capability it is folded under greens.
 *
 * Pure, no I/O — a parser + validator the verdict log writes against by gate id. It NEVER
 * touches a store, a clock, or the verdict log (mirrors `uat-tests.ts`, ADR-0044).
 */

// ---------------------------------------------------------------------------
// Gate kind
// ---------------------------------------------------------------------------

export const RELIABILITY_GATE_KINDS = ["observe", "build-tests", "integrate"] as const;
export const ReliabilityGateKind = z.enum(RELIABILITY_GATE_KINDS);
export type ReliabilityGateKind = z.infer<typeof ReliabilityGateKind>;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * One addressable reliability gate. `id` is the join key the verdict log writes against;
 * `kind` says how it is earned; `proofCommand` (the inline backticked command) is what the
 * spine OBSERVES for an `observe` gate. Strict: unknown fields rejected.
 */
export const ReliabilityGate = z
  .object({
    /** Stable gate id, `<story>#gate-<n>` (1-based, positional). */
    id: z.string().min(1),
    /** Human-readable title (the prose item's bold lead, else its first line). */
    title: z.string().min(1),
    /** How the gate is earned (`observe` is the conservative default when untagged). */
    kind: ReliabilityGateKind,
    /** The declared command the spine observes for an `observe` gate (the first backticked span). */
    proofCommand: z.string().min(1).optional(),
  })
  .strict();

export type ReliabilityGate = z.infer<typeof ReliabilityGate>;

// ---------------------------------------------------------------------------
// Id scheme
// ---------------------------------------------------------------------------

/**
 * PURE: the stable gate id for a story's nth reliability gate (1-based). The single home of
 * the `<story>#gate-<n>` scheme so the parser and the verdict log can never fork.
 */
export function reliabilityGateId(storyId: string, ordinal: number): string {
  return `${storyId}#gate-${ordinal}`;
}

// ---------------------------------------------------------------------------
// Prose parser
// ---------------------------------------------------------------------------

/** Match a `## Reliability Gates …` heading. */
const RELIABILITY_HEADING = /^##[^\n\S]+Reliability Gates[^\n]*$/im;
/** Match the next `## …` heading after the section start. */
const NEXT_H2 = /^## /m;
/** A numbered list item lead: `1. …`. */
const NUMBERED_ITEM = /^\d+\.[^\n\S]+(.*)$/;
/** The bold lead of an item, e.g. `**The suite is green**`. */
const BOLD_LEAD = /^\*\*(.+?)\*\*/;
/**
 * Optional inline kind annotation, e.g. `(gate: observe)`. Captured loosely so an explicit-but-
 * invalid value is REFUSED (not silently defaulted). Absent → `observe` (the conservative
 * brownfield default: just observe the declared command works).
 */
const KIND_TAG = /\(gate:\s*([A-Za-z-]+)\)/i;
/** The first backticked command span in an item — the `observe` gate's declared proof command. */
const COMMAND = /`([^`]+)`/;

/** Extract the `## Reliability Gates` section body (between its heading and the next `##`). */
function reliabilitySection(body: string): string | null {
  const heading = RELIABILITY_HEADING.exec(body);
  if (heading === null) return null;
  const after = body.slice(heading.index + heading[0].length);
  const next = NEXT_H2.exec(after);
  return (next === null ? after : after.slice(0, next.index)).trim();
}

/** Split a section into its numbered items, preserving multi-line continuations. */
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
 * Pull the declared kind from an item. Absent → `observe` (conservative default). An explicit
 * but invalid value (e.g. `(gate: rubberstamp)`) THROWS rather than defaulting — the author
 * declared something the model does not know how to honour, so refuse it loud.
 */
function itemKind(item: string, id: string): ReliabilityGateKind {
  const tag = KIND_TAG.exec(item);
  if (tag === null) return "observe";
  const parsed = ReliabilityGateKind.safeParse(tag[1]!.toLowerCase());
  if (!parsed.success) {
    throw new Error(
      `${id}: invalid gate kind "${tag[1]}" — must be one of ${RELIABILITY_GATE_KINDS.join("|")}`,
    );
  }
  return parsed.data;
}

/**
 * PURE: parse a story's markdown `body` into addressable reliability-gate units (ADR-0085).
 * Each numbered item under `## Reliability Gates` becomes one {@link ReliabilityGate} with a
 * positional, stable id (`<story>#gate-<n>`, 1-based). Positional so the same prose always
 * yields the same ids regardless of how the author numbered the list.
 *
 * Backward-compatible: a story with no `## Reliability Gates` section (the common case) yields
 * `[]`. An item with no `(gate: …)` tag defaults to `observe`; an explicit-but-invalid kind
 * throws. The first backticked span (if any) is captured as `proofCommand`.
 */
export function parseReliabilityGates(storyId: string, body: string): ReliabilityGate[] {
  const section = reliabilitySection(body);
  if (section === null) return [];
  const items = splitItems(section);
  return items.map((item, index) => {
    const id = reliabilityGateId(storyId, index + 1);
    const command = COMMAND.exec(item);
    return ReliabilityGate.parse({
      id,
      title: itemTitle(item),
      kind: itemKind(item, id),
      ...(command !== null ? { proofCommand: command[1]!.trim() } : {}),
    });
  });
}
