import { z } from "zod";
import { CriterionBinding, CriterionId, CriterionRevisionId } from "@storytree/proof-protocol";

const LegacyTestId = z.string().regex(/^.+#uat-\d+$/, "legacyTestId must be <story>#uat-<n>");
const ReviewFields = {
  legacyTestId: LegacyTestId,
  reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rationale: z.string().trim().min(1),
};

const MappedLegacyUatDisposition = z.object({
  ...ReviewFields,
  disposition: z.literal("mapped"),
  criterionId: CriterionId,
  revisionId: CriterionRevisionId,
}).strict();

const HistoricalOnlyLegacyUatDisposition = z.object({
  ...ReviewFields,
  disposition: z.enum(["superseded", "unresolved"]),
}).strict();

export const LegacyUatDisposition = z.discriminatedUnion("disposition", [
  MappedLegacyUatDisposition,
  HistoricalOnlyLegacyUatDisposition,
]);
export type LegacyUatDisposition = z.infer<typeof LegacyUatDisposition>;

export const LegacyUatDispositionLedger = z.object({
  version: z.literal(1),
  dispositions: z.array(LegacyUatDisposition),
}).strict().superRefine((ledger, ctx) => {
  const seen = new Set<string>();
  ledger.dispositions.forEach((entry, index) => {
    if (seen.has(entry.legacyTestId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dispositions", index, "legacyTestId"],
        message: `duplicate legacy key ${entry.legacyTestId}`,
      });
    }
    seen.add(entry.legacyTestId);
  });
});
export type LegacyUatDispositionLedger = z.infer<typeof LegacyUatDispositionLedger>;

export function mappedLegacyBinding(
  legacyTestId: string,
  ledger: LegacyUatDispositionLedger,
): CriterionBinding | null {
  const entry = ledger.dispositions.find((candidate) => candidate.legacyTestId === legacyTestId);
  if (entry?.disposition !== "mapped") return null;
  return CriterionBinding.parse({ criterionId: entry.criterionId, revisionId: entry.revisionId });
}

export function validateLegacyDispositionCoverage(
  legacyTestIds: readonly string[],
  ledger: LegacyUatDispositionLedger,
): void {
  const expected = new Set(legacyTestIds);
  const actual = new Set(ledger.dispositions.map((entry) => entry.legacyTestId));
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `legacy disposition coverage mismatch; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`,
    );
  }
}
