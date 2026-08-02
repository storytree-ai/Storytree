const IDENTITY_METADATA_TAG =
  /_?\((?:criterion-id|revision-id|previous-revision-id|lineage):[^)]*\)_?/gi;

function canonicalContent(item: string): string {
  return item
    .replace(/^\d+\.\s+/, "")
    .replace(IDENTITY_METADATA_TAG, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function criterionRevisionId(canonical: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `uatr1:${hash.toString(16).padStart(16, "0")}`;
}

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
    ) stop += 1;
    ordinal += 1;
    const criterionId = `uatc_${ordinal.toString(16).padStart(24, "0")}`;
    lines[start] = `${lines[start]} (criterion-id: ${criterionId})(revision-id: pending)`;
    const revisionId = criterionRevisionId(canonicalContent(lines.slice(start, stop).join("\n")));
    lines[start] = lines[start]!.replace("(revision-id: pending)", `(revision-id: ${revisionId})`);
  }
  return lines.join("\n");
}

export const EXACT_CRITERION = {
  criterionId: "uatc_0123456789abcdef01234567",
  revisionId: "uatr1:0123456789abcdef",
} as const;
