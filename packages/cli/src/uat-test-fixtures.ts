import { criterionRevisionId } from "@storytree/proof-protocol";
import { canonicalUatCriterionContent } from "@storytree/library";

export function fixtureCriterionId(ordinal: number): string {
  return `uatc_${ordinal.toString(16).padStart(24, "0")}`;
}

export function fixtureBinding(ordinal: number, prose: string) {
  return {
    criterionId: fixtureCriterionId(ordinal),
    revisionId: criterionRevisionId(canonicalUatCriterionContent(`${ordinal}. ${prose}`)),
  };
}

/** Add identities only inside UAT sections; reliability-gate ordinals remain positional. */
export function authoredUat(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let inUat = false;
  let ordinal = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^##\s+(?:Story UAT|UAT Test Criteria)(?:\s|$)/i.test(line)) {
      inUat = true;
      ordinal = 0;
      continue;
    }
    if (inUat && /^##\s+/.test(line)) {
      inUat = false;
      continue;
    }
    const match = inUat ? /^(\d+)\.\s+(.*)$/.exec(line) : null;
    if (!match) continue;
    ordinal += 1;
    const prose = match[2]!;
    const binding = fixtureBinding(ordinal, prose);
    lines[index] = `${match[1]}. ${prose} (criterion-id: ${binding.criterionId})(revision-id: ${binding.revisionId})`;
  }
  return lines.join("\n");
}
