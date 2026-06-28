import { z } from "zod";

/**
 * The `## Contracts` prose parser (ADR-0020 coverage-honesty follow-on): a capability spec lists its
 * leaf contracts — the test-proven behaviours (the `contract` definition) — as numbered items under a
 * `## Contracts` section, each led by a bold code-span id (e.g. `**\`fr-bounded-never-hangs\`**`).
 * This parser pulls those declared ids (+ titles) into structured data, so a coverage check can ask
 * *"does every declared contract have an observed test?"* — the gap a signed `--real` green leaves
 * open (it attests ONE authored test, not every enumerated contract; ADR-0020 §3 observes the new
 * test only).
 *
 * Pure, no I/O — a parser + validator the coverage classifier reads, mirroring `reliability-gates.ts`
 * (ADR-0085) and `uat-tests.ts` (ADR-0044). It NEVER touches a store, a clock, or the verdict log.
 *
 * First-slice scope (deliberate): only the contract `id` + `title` are parsed — enough to map
 * declared contracts to observed test names. The per-contract `asserts` / `covers` / `proven by`
 * prose is NOT modelled here; a richer parse is named follow-on if a consumer needs it.
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * One declared contract: the leaf behaviour id the coverage check maps to a test, and a
 * human-readable title (the prose lead after the id). Strict: unknown fields rejected.
 */
export const ContractDecl = z
  .object({
    /** The contract id — the bold code-span lead of a numbered item (e.g. `fr-bounded-never-hangs`). */
    id: z.string().min(1),
    /** Human-readable title (the item lead after the id, dash stripped); falls back to the id. */
    title: z.string().min(1),
  })
  .strict();

export type ContractDecl = z.infer<typeof ContractDecl>;

// ---------------------------------------------------------------------------
// Prose parser
// ---------------------------------------------------------------------------

/** Match a `## Contracts …` heading (the `(N)` count, if any, is decoration). */
const CONTRACTS_HEADING = /^##[^\n\S]+Contracts\b[^\n]*$/im;
/** Match the next `## …` heading after the section start. */
const NEXT_H2 = /^## /m;
/** A numbered list item lead: `1. …`. */
const NUMBERED_ITEM = /^\d+\.[^\n\S]+/;
/** The contract id: the first bold code-span in an item lead, e.g. `**\`fr-…\`**`. */
const CONTRACT_ID = /\*\*`([^`]+)`\*\*/;

/** Extract the `## Contracts` section body (between its heading and the next `##`). */
function contractsSection(body: string): string | null {
  const heading = CONTRACTS_HEADING.exec(body);
  if (heading === null) return null;
  const after = body.slice(heading.index + heading[0].length);
  const next = NEXT_H2.exec(after);
  return (next === null ? after : after.slice(0, next.index)).trim();
}

/** Split a section into its numbered items, preserving multi-line continuations (the asserts bullets). */
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

/**
 * Pull the title from an item's first line: strip the `N.` prefix and the `**\`id\`**` span, then a
 * leading dash/colon. The id is read from the FIRST LINE only — so a bold code-span inside a later
 * `asserts` bullet can never be mistaken for the contract id.
 */
function itemTitle(firstLine: string): string {
  const noNum = firstLine.replace(NUMBERED_ITEM, "");
  const noId = noNum.replace(CONTRACT_ID, "").trim();
  return noId.replace(/^[—:-]+\s*/, "").trim();
}

/**
 * PURE: parse a capability spec's markdown `body` into its declared {@link ContractDecl}s. Each
 * numbered item under `## Contracts` whose lead carries a `**\`id\`**` code-span becomes one contract;
 * a numbered line WITHOUT such an id (a stray list item) is skipped, and a duplicate id collapses to
 * its first occurrence. Backward-compatible: a spec with no `## Contracts` section yields `[]`.
 */
export function parseContracts(body: string): ContractDecl[] {
  const section = contractsSection(body);
  if (section === null) return [];
  const out: ContractDecl[] = [];
  const seen = new Set<string>();
  for (const item of splitItems(section)) {
    const firstLine = item.split("\n")[0] ?? "";
    const idMatch = CONTRACT_ID.exec(firstLine);
    if (idMatch === null) continue; // a numbered line that is not a contract declaration — skip
    const id = idMatch[1]!.trim();
    if (id.length === 0 || seen.has(id)) continue; // drop blanks; collapse a duplicate id
    seen.add(id);
    out.push(ContractDecl.parse({ id, title: itemTitle(firstLine) || id }));
  }
  return out;
}
