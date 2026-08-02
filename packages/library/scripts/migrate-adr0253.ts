import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  canonicalUatCriterionContent,
  criterionRevisionId,
  legacyUatTestId,
} from "../src/uat-test-criteria.js";
import { LegacyUatDispositionLedger } from "../src/legacy-uat-disposition.js";

const repoRoot = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../../.."));
const storiesDir = path.join(repoRoot, "stories");
const ledgerPath = path.join(storiesDir, "uat-legacy-dispositions.json");
const headingPattern = /^##[^\n\S]+(?:UAT Test Criteria|Story UAT)[^\n]*$/im;
const nextH2 = /^## /m;
const numbered = /^\d+\.[^\n\S]+/;

if (existsSync(ledgerPath)) {
  throw new Error(`${ledgerPath} already exists; ADR-0253 migration is single-use`);
}

function opaqueCriterionId(): string {
  return `uatc_${randomBytes(12).toString("hex")}`;
}

function migrateStory(storyId: string, file: string) {
  const body = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const heading = headingPattern.exec(body);
  if (heading === null) return { body, entries: [] as unknown[] };
  const sectionStart = heading.index + heading[0].length;
  const after = body.slice(sectionStart);
  const next = nextH2.exec(after);
  const sectionEnd = next === null ? body.length : sectionStart + next.index;
  const section = body.slice(sectionStart, sectionEnd);
  const lines = section.split("\n");
  const itemStarts = lines
    .map((line, index) => (numbered.test(line) ? index : -1))
    .filter((index) => index >= 0);
  if (itemStarts.length === 0) return { body, entries: [] as unknown[] };

  const entries: unknown[] = [];
  for (let itemIndex = itemStarts.length - 1; itemIndex >= 0; itemIndex -= 1) {
    const start = itemStarts[itemIndex]!;
    const end = itemStarts[itemIndex + 1] ?? lines.length;
    const itemLines = lines.slice(start, end);
    const item = itemLines.join("\n");
    if (/\(criterion-id:/i.test(item) || /\(revision-id:/i.test(item)) {
      throw new Error(`${file}:${start + 1}: criterion already carries ADR-0253 metadata`);
    }
    const criterionId = opaqueCriterionId();
    const revisionId = criterionRevisionId(canonicalUatCriterionContent(item));
    itemLines[0] = `${itemLines[0]} _(criterion-id: ${criterionId})_ _(revision-id: ${revisionId})_`;
    lines.splice(start, end - start, ...itemLines);

    const ordinal = itemIndex + 1;
    const legacyTestId = legacyUatTestId(storyId, ordinal);
    entries.unshift({
      legacyTestId,
      disposition: "unresolved",
      reviewedAt: "2026-08-02",
      rationale:
        legacyTestId === "app-surface#uat-4"
          ? "Known mixed-history collision: this positional key named materially different fourth criteria across app-surface revisions. Historical rows require row-level review and earn no current credit."
          : "Unresolved at cutover: the positional key alone cannot establish continuity across pre-ADR-0253 revisions. History is retained for review and earns no current proof credit.",
    });
  }

  const migratedSection = lines.join("\n");
  return {
    body: `${body.slice(0, sectionStart)}${migratedSection}${body.slice(sectionEnd)}`,
    entries,
  };
}

const dispositions: unknown[] = [];
let migratedStories = 0;
for (const storyId of readdirSync(storiesDir).sort()) {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file) || !statSync(file).isFile()) continue;
  const migrated = migrateStory(storyId, file);
  if (migrated.entries.length === 0) continue;
  writeFileSync(file, migrated.body, "utf8");
  dispositions.push(...migrated.entries);
  migratedStories += 1;
}

const ledger = LegacyUatDispositionLedger.parse({ version: 1, dispositions });
writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
process.stdout.write(
  `ADR-0253 migrated ${ledger.dispositions.length} criteria across ${migratedStories} stories; ledger=${ledgerPath}\n`,
);
