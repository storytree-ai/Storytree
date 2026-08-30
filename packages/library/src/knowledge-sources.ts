/**
 * The corpus's TARGET-TYPE GROUPING table — which heading an artifact kind renders under, and the
 * fixed order those headings appear in.
 *
 * IT NO LONGER GROUPS CITATIONS. `groupSources` and the `Sources:` block it fed are retired with the
 * `references` field itself (ADR-0477 D1). What survives, and survives DELIBERATELY (ADR-0477 D7),
 * is the table: ADR-0464 D2's authored `depends_on` block orders itself by this same grouping
 * (`depends-on-edges.ts`), so removing it here would undo ADR-0464 while appearing to implement
 * ADR-0477. The file keeps its name because that block is what reads it.
 *
 * Resolving an `asset:<id>` to its kind needs the corpus, so the consumer takes a `resolveAsset`
 * callback and fills it from its own corpus view. Pure + offline.
 */

/**
 * The fixed display order of target-type groups; empty groups are omitted at render time.
 *
 * The tail `[Decisions (ADRs), Docs & references, Other]` is a pinned invariant. "Story nodes" is
 * retained in the order though no live kind resolves to it: the `node:`/`story:`/`capability:`
 * tokens it held were `references` spellings (ADR-0477 D1 retired them), and the position is part
 * of the pinned tail's context. A future work-hierarchy pointer lands back in the same slot.
 */
export const SOURCE_GROUP_ORDER = [
  "Definitions",
  "Principles",
  "Patterns",
  "Guardrails",
  "Tech stack",
  "Templates",
  "Open questions",
  "Story nodes",
  "Decisions (ADRs)",
  "Docs & references",
  "Other",
] as const;

export type SourceGroupName = (typeof SOURCE_GROUP_ORDER)[number];

/** Artifact category (the `kind` / `category` discriminator) → its Source group label. */
const CATEGORY_TO_GROUP: ReadonlyMap<string, SourceGroupName> = new Map([
  ["definition", "Definitions"],
  ["principle", "Principles"],
  ["pattern", "Patterns"],
  ["guardrail", "Guardrails"],
  ["techstack", "Tech stack"],
  ["template", "Templates"],
  ["open-question", "Open questions"],
  ["adr", "Decisions (ADRs)"],
]);

/**
 * PURE: the Source group an artifact KIND renders under — the one reading of {@link
 * CATEGORY_TO_GROUP}, shared rather than copied.
 *
 * The `Sources:` block that this table was written for is gone (ADR-0477 D1); ADR-0464 D2's
 * authored-edge onward block (`depends-on-edges.ts`) is now its only reader, and ADR-0477 D7 keeps
 * the table for exactly that reason. Two copies would be a drift surface where one gains a kind and
 * the other does not. A kind
 * with no heading of its own answers "Other", which is a real group in {@link SOURCE_GROUP_ORDER}
 * rather than an absence — `agent`, `process` and `arc` all land there today.
 */
export function sourceGroupOf(kind: string): SourceGroupName {
  const group = CATEGORY_TO_GROUP.get(kind);
  return group === undefined ? "Other" : group;
}

/** The minimal artifact facts a consumer needs to place an `asset:` pointer in a group. */
export interface AssetTarget {
  readonly kind: string;
  readonly title: string;
}
