import { criterionRevisionId } from "@storytree/proof-protocol";
import { canonicalCriterionContent } from "./criterion.js";

/** Add authored test-only identities to otherwise readable UAT fixture prose. */
export function authoredCriteria(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let ordinal = 0;
  for (let start = 0; start < lines.length; start += 1) {
    if (!/^\d+\.\s+/.test(lines[start] ?? "")) continue;
    let stop = start + 1;
    while (
      stop < lines.length &&
      !/^\d+\.\s+/.test(lines[stop] ?? "") &&
      !/^##\s+/.test(lines[stop] ?? "")
    ) {
      stop += 1;
    }
    ordinal += 1;
    const criterionId = `uatc_${ordinal.toString(16).padStart(24, "0")}`;
    lines[start] = `${lines[start]} (criterion-id: ${criterionId})(revision-id: pending)`;
    const item = lines.slice(start, stop).join("\n");
    lines[start] = lines[start]!.replace(
      "(revision-id: pending)",
      `(revision-id: ${criterionRevisionId(canonicalCriterionContent(item))})`,
    );
  }
  return lines.join("\n");
}

export const EXACT_CRITERION = {
  criterionId: "uatc_0123456789abcdef01234567",
  revisionId: "uatr1:0123456789abcdef",
} as const;
