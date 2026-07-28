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
 * (ADR-0085) and `uat-test-criteria.ts` (ADR-0044). It NEVER touches a store, a clock, or the verdict log.
 *
 * SCOPE (ADR-0262, widened from the first slice): the contract `id` + `title` — enough to map declared
 * contracts to observed test names — PLUS the labelled sub-bullets (`asserts` / `covers` / `proven by` /
 * `falsifiability` / …) as {@link ObligationDecl}s. The first slice discarded those bullets; it split
 * them off the item and threw them away, so the only machine-readable fact about a contract was its
 * name. 932 of the corpus's 947 declared contracts carry an `asserts` bullet, and every route to a
 * finer-grained coverage check has to read it, so it is parsed here rather than re-derived per consumer.
 *
 * WHAT IS DELIBERATELY *NOT* PARSED, and why it is a refusal rather than an omission (ADR-0262): the
 * obligation text is NOT segmented into individual clauses. Segmenting it is the input a clause-granular
 * `check:coverage` denominator would need, and both halves of that were measured and rejected — the
 * segmentation is unfaithful (splitting on `;` reads a four-obligation contract written in comma-and-dash
 * prose as ONE clause) and, decisively, the NUMERATOR does not exist: a test names a contract, never a
 * clause, and the only static proxy (substantive assertions in the covering region) has no discriminating
 * power — measured at 4 of 375 covered contracts. Shipping a segmenter would hand a consumer a ratio
 * whose numerator is inferred rather than observed, which is the defect class `verification-integrity-arc`
 * exists to close. The exact structure is parsed; the heuristic one is not.
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * One labelled obligation under a contract — an authored sub-bullet led by a bold span, e.g.
 * `- **asserts —** row count equals the machine-criterion count.` (ADR-0262).
 *
 * The label vocabulary is READ OFF the prose, never assumed: the corpus uses `asserts` (932),
 * `covers` (649), `proven by` (387), `falsifiability` (38) and `would-be test` (12), but a closed
 * label set here would silently reclassify a newly-coined label as prose, so any bold-led bullet is
 * captured under whatever label it carries.
 */
export const ObligationDecl = z
  .object({
    /** The bold lead, normalised: lowercased, its trailing em-dash/colon separator stripped. */
    label: z.string().min(1),
    /** The prose after the label, wrapped lines joined — verbatim otherwise (markup preserved). */
    text: z.string(),
  })
  .strict();

export type ObligationDecl = z.infer<typeof ObligationDecl>;

/**
 * One declared contract: the leaf behaviour id the coverage check maps to a test, a human-readable
 * title (the prose lead after the id), and the labelled obligations authored under it. Strict:
 * unknown fields rejected.
 */
export const ContractDecl = z
  .object({
    /** The contract id — the bold code-span lead of a numbered item (e.g. `fr-bounded-never-hangs`). */
    id: z.string().min(1),
    /** Human-readable title (the item lead after the id, dash stripped); falls back to the id. */
    title: z.string().min(1),
    /**
     * The labelled sub-bullets authored under this contract, in source order (ADR-0262).
     *
     * OPTIONAL, and the absent/empty distinction is load-bearing (the ADR-0251 rule): `[]` means
     * PARSED and it declares none — a real, if unusual, corpus state (3 of 947). ABSENT means the
     * `ContractDecl` was hand-constructed rather than parsed from a spec, so nothing is known about
     * its obligations either way. {@link parseContracts} always supplies the field; a caller reading
     * `undefined` as "declares none" would be reporting a fact it never observed.
     */
    obligations: z.array(ObligationDecl).optional(),
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

/** A labelled obligation bullet under a contract item: `- **asserts —** …` / `* **covers —** …`. */
const OBLIGATION_BULLET = /^[^\n\S]*[-*][^\n\S]+\*\*([^*]+?)\*\*(.*)$/;
/** The separator authors put INSIDE the bold span (`**asserts —**`) — stripped off the label. */
const TRAILING_SEPARATOR = /[\s—–:-]+$/;
/** The separator authors put AFTER the bold span (`**asserts** — …`) — stripped off the text. */
const LEADING_SEPARATOR = /^[\s—–:-]+/;

/**
 * PURE: the labelled obligations authored under ONE contract item (ADR-0262) — every bold-led
 * sub-bullet among `itemLines` (the item's lines AFTER its lead), with its wrapped continuation lines
 * folded back into a single text.
 *
 * Two boundaries make this faithful rather than approximate. Lines before the FIRST bullet are the
 * item lead's own wrap — title prose, never obligation prose — so they are dropped rather than
 * attributed to an obligation that had not started yet. And the separator is stripped from wherever
 * the author put it (inside the bold span or after it), so `asserts` is one label and not two.
 */
function parseObligations(itemLines: readonly string[]): ObligationDecl[] {
  const collected: { label: string; parts: string[] }[] = [];
  for (const line of itemLines) {
    const bullet = OBLIGATION_BULLET.exec(line);
    if (bullet !== null) {
      const label = (bullet[1] ?? "").trim().replace(TRAILING_SEPARATOR, "").trim().toLowerCase();
      if (label.length === 0) continue; // a bold span that is only punctuation names nothing
      collected.push({ label, parts: [(bullet[2] ?? "").replace(LEADING_SEPARATOR, "").trim()] });
    } else if (collected.length > 0) {
      const trimmed = line.trim();
      if (trimmed.length > 0) collected[collected.length - 1]!.parts.push(trimmed);
    }
  }
  return collected.map((o) =>
    ObligationDecl.parse({ label: o.label, text: o.parts.filter((p) => p.length > 0).join(" ") }),
  );
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
    const lines = item.split("\n");
    const firstLine = lines[0] ?? "";
    const idMatch = CONTRACT_ID.exec(firstLine);
    if (idMatch === null) continue; // a numbered line that is not a contract declaration — skip
    const id = idMatch[1]!.trim();
    if (id.length === 0 || seen.has(id)) continue; // drop blanks; collapse a duplicate id
    seen.add(id);
    out.push(
      ContractDecl.parse({
        id,
        title: itemTitle(firstLine) || id,
        // Always supplied by the parser — `[]` is "declares none", never "unknown" (ADR-0262).
        obligations: parseObligations(lines.slice(1)),
      }),
    );
  }
  return out;
}
