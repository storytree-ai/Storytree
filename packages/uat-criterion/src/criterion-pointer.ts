import { z } from "zod";
import { Criterion, parseCriteria } from "@storytree/model-uat";
import type { UatCriterionDetail } from "./detail-kind.js";

/**
 * The `criterion-detail-pointer` capability (ADR-0209 D5/D6): a story criterion
 * points to its detail artifact by id WITHOUT ceding the one-line title. This
 * module wraps a `@storytree/model-uat` `Criterion` (unchanged — witness/tier
 * ownership stays there) with a validated detail artifact id, and extends the
 * criterion annotation grammar with an optional `(detail: <id>)` tag. The
 * story stays display-canonical for the one-liner: {@link displayTitle} always
 * reads the criterion's title, never a resolved detail body's prose.
 */

// ---------------------------------------------------------------------------
// DetailArtifactId
// ---------------------------------------------------------------------------

/**
 * A validated detail artifact id: a single non-empty, whitespace-free token
 * (mirroring the `<story>#uat-<n>` / `<story>#detail-<n>` id scheme). Empty,
 * whitespace-only, and multi-token strings are refused.
 */
export const DetailArtifactId = z
  .string()
  .trim()
  .min(1)
  .refine((val) => !/\s/.test(val), "a detail artifact id must be a single token (no whitespace)");

export type DetailArtifactId = z.infer<typeof DetailArtifactId>;

// ---------------------------------------------------------------------------
// CriterionDetailBinding
// ---------------------------------------------------------------------------

/**
 * The binding between a story criterion and its detail artifact id. Strict:
 * unknown fields rejected. `detail`, when present, is the resolved detail
 * body — carried for callers that already fetched it, but never consulted by
 * {@link displayTitle}.
 */
export const CriterionDetailBinding = z
  .object({
    criterion: Criterion,
    detailArtifactId: DetailArtifactId,
  })
  .strict();

export type CriterionDetailBinding = z.infer<typeof CriterionDetailBinding>;

/**
 * A binding as used by {@link displayTitle}: the criterion, plus an optional
 * already-resolved detail body. Not itself validated by
 * {@link CriterionDetailBinding} (that schema requires `detailArtifactId`,
 * which a bare display-title caller may not have to hand).
 */
export interface DisplayableBinding {
  criterion: Criterion;
  detail?: UatCriterionDetail;
}

// ---------------------------------------------------------------------------
// bindDetail
// ---------------------------------------------------------------------------

/**
 * Bind a classified `Criterion` to a detail artifact id. Throws (message
 * mentions "detail") for an empty, whitespace-only, or multi-token id — the
 * binding is validated, never silently coerced. Does NOT move witness/tier
 * ownership out of `@storytree/model-uat` — the criterion passes through
 * unchanged.
 */
export function bindDetail(criterion: Criterion, detailArtifactId: string): CriterionDetailBinding {
  const parsed = DetailArtifactId.safeParse(detailArtifactId);
  if (!parsed.success) {
    throw new Error(
      `invalid detail artifact id "${detailArtifactId}": must be a single non-empty, whitespace-free token`,
    );
  }
  return CriterionDetailBinding.parse({ criterion, detailArtifactId: parsed.data });
}

// ---------------------------------------------------------------------------
// displayTitle
// ---------------------------------------------------------------------------

/**
 * The story stays display-canonical for the one-line title (ADR-0209 D6):
 * always returns the criterion's `title`, never a resolved detail body's
 * prose (`action`/`successConditions`/etc.) — even when one is attached.
 */
export function displayTitle(binding: DisplayableBinding): string {
  return binding.criterion.title;
}

// ---------------------------------------------------------------------------
// parseCriterionPointers
// ---------------------------------------------------------------------------

/**
 * Optional inline detail-pointer annotation, e.g. `(detail: demo-story#detail-2)`,
 * mirroring the `(witness: ...)`/`(tier: ...)` tags in
 * `@storytree/model-uat`'s prose parser. Captured loosely (up to the closing
 * paren) so an explicit-but-empty/malformed value can be REFUSED rather than
 * silently dropped.
 */
const DETAIL_TAG = /\(detail:\s*([^)]*)\)/i;

const STORY_UAT_HEADING = /^##[^\n\S]+(?:UAT Test Criteria|Story UAT)([^\n]*)$/im;
const NEXT_H2 = /^## /m;
const NUMBERED_ITEM = /^\d+\.[^\n\S]+(.*)$/;

/** Extract the `## UAT Test Criteria` section (between its heading and the next `##`). `null` when absent. */
function criteriaSection(body: string): string | null {
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

/**
 * Pull the declared detail id from an item. Absent → `undefined` (no
 * pointer). An explicit but empty/whitespace-only/multi-token value THROWS,
 * refused rather than silently dropped.
 */
function itemDetailArtifactId(item: string, id: string): string | undefined {
  const tag = DETAIL_TAG.exec(item);
  if (tag === null) return undefined;
  const parsed = DetailArtifactId.safeParse(tag[1]!);
  if (!parsed.success) {
    throw new Error(`${id}: invalid detail artifact id "${tag[1]}" — must be a single non-empty token`);
  }
  return parsed.data;
}

/**
 * PURE: parse a story's markdown `body` into {@link CriterionDetailBinding}s —
 * one per numbered UAT criterion item that carries a `(detail: <id>)` tag
 * (tag order relative to `(witness: ...)`/`(tier: ...)` does not matter).
 * Criteria with no `(detail: ...)` tag are omitted (they have no pointer). An
 * explicit but malformed `(detail: ...)` value throws at the parsing
 * boundary, mirroring `parseCriteria`'s witness/tier refusal behaviour. The
 * underlying criterion for a pointed leg is identical to what
 * `@storytree/model-uat`'s `parseCriteria` would produce for the same body.
 */
export function parseCriterionPointers(storyId: string, body: string): CriterionDetailBinding[] {
  const section = criteriaSection(body);
  if (section === null) return [];
  const items = splitItems(section);
  const criteria = parseCriteria(storyId, body);
  const bindings: CriterionDetailBinding[] = [];
  items.forEach((item, index) => {
    const criterion = criteria[index];
    if (criterion === undefined) return;
    const detailArtifactId = itemDetailArtifactId(item, criterion.id);
    if (detailArtifactId === undefined) return;
    bindings.push(bindDetail(criterion, detailArtifactId));
  });
  return bindings;
}
