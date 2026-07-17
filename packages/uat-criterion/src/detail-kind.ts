import { z } from "zod";

/**
 * The uat-detail-kind capability (ADR-0209 D5/D6): a detailed UAT criterion is
 * a structured Library artifact kind. Its body carries the proof-bearing
 * fields — action, success conditions, evidence expectations — plus optional
 * `asset:<id>` refs to reusable Library principles/processes. It deliberately
 * does NOT carry a `title` (or any title-shaped) field: the story stays the
 * single display-canonical authority for the criterion's one-line title
 * (ADR-0209 D6) — this schema must never grow a competing one.
 */

/** The stable Library kind string for a detailed UAT criterion. */
export const UAT_CRITERION_DETAIL_KIND = "uat-criterion" as const;

/**
 * A reference from a UAT criterion detail to a reusable Library artifact —
 * shaped `asset:<id>`, matching the pointer convention used elsewhere in the
 * Library (see `packages/library/src/knowledge-sources.ts`).
 */
export const UatCriterionDetailRef = z
  .string()
  .regex(/^asset:.+$/, "a ref must be shaped asset:<id>");

export type UatCriterionDetailRef = z.infer<typeof UatCriterionDetailRef>;

/**
 * A required text field must carry real content, not just satisfy `.min(1)`
 * on raw length — a whitespace-only string is refused (Test creation
 * principles: "real content over existence").
 */
const nonBlankText = (label: string) =>
  z
    .string()
    .min(1, `${label} must not be empty`)
    .refine((value) => value.trim().length > 0, `${label} must carry real content`);

/** The structured body of a detailed UAT criterion Library artifact. */
export const UatCriterionDetail = z
  .object({
    kind: z.literal(UAT_CRITERION_DETAIL_KIND),
    /** The stable id this detail is keyed by, e.g. `<story-id>#<criterion-id>`. */
    id: nonBlankText("id"),
    /** What the UAT walk actually does. */
    action: nonBlankText("action"),
    /** What observable state constitutes success. */
    successConditions: nonBlankText("successConditions"),
    /** What evidence must be captured to attest the walk. */
    evidenceExpectations: nonBlankText("evidenceExpectations"),
    /** Optional refs to reusable Library principles/processes. */
    refs: z.array(UatCriterionDetailRef).default([]),
  })
  .strict();

export type UatCriterionDetail = z.infer<typeof UatCriterionDetail>;
