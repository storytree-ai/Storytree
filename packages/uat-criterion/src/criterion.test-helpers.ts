import { criterionRevisionId } from "@storytree/proof-protocol";
import { canonicalCriterionContent } from "./criterion.js";

/**
 * ⚠ THIS FILE IS MUTATED AS PRODUCTION SOURCE. `check:mutation-diff`'s aperture is "under `src/`
 * and not named `*.test.ts`" (`mutation-diff.ts`'s `isTestFile`), so the house `*.test-helpers.ts`
 * convention puts shared test scaffolding squarely in it. That is why the scan below carries NO
 * loop counter: `while (stop < n) stop += 1` is mutable into `stop -= 1`, which does not fail an
 * assertion — it HANGS, and Stryker scores a hang `Timeout`, which the rung maps to UNPROVEN and
 * reds on. An `EQUIVALENT` annotation would be dishonest there (the mutant is not equivalent; the
 * suite merely failed to say so in time), so the counter is removed rather than annotated.
 */

// Stryker disable next-line Regex: EQUIVALENT — both patterns are used only through `.test(line)`
// on a single line and neither capture is read, so widening or narrowing the trailing whitespace
// RUN cannot change the boolean for any line that has at least one space there. The mutants that
// are NOT equivalent — either `^` anchor, and `\s` for `\S` — change which lines end an item, and
// are killed by "fixture stamping: the generator agrees with the parser about where an item ends".
const ITEM_LINE = /^\d+\.\s+/;
// Stryker disable next-line Regex: EQUIVALENT for the whitespace-RUN mutant, on the same reasoning
// as the line above — `.test(line)` cannot tell `\s+` from `\s` on a line that has a space there.
const HEADING_LINE = /^##\s+/;

/** True when a line opens a new fixture item or a new section — i.e. ends the item before it. */
function endsItem(line: string): boolean {
  return ITEM_LINE.test(line) || HEADING_LINE.test(line);
}

/** Add authored test-only identities to otherwise readable UAT fixture prose. */
export function authoredCriteria(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let ordinal = 0;
  // `line` is the value as it was BEFORE this loop stamps `lines[start]`, which is what the hash
  // must be taken over. Only already-yielded indices are mutated, so the live iterator is safe.
  for (const [start, line] of lines.entries()) {
    if (!ITEM_LINE.test(line)) continue;
    const offset = lines.slice(start + 1).findIndex(endsItem);
    const stop = offset === -1 ? lines.length : start + 1 + offset;
    ordinal += 1;
    const criterionId = `uatc_${ordinal.toString(16).padStart(24, "0")}`;
    lines[start] = `${line} (criterion-id: ${criterionId})(revision-id: pending)`;
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
