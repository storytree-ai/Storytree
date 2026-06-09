// ONE-SHOT MIGRATION (docs/research/library-schema-migrations-and-health-checks.md, Phase 2):
// stamp every structured unit in knowledge.json with the per-row `schemaVersion` pin.
//
//   node apps/studio/data/stamp-schema-version.mjs --dry   # report only, writes nothing
//   node apps/studio/data/stamp-schema-version.mjs         # rewrite knowledge.json in place
//
// The pin is per-ROW (design note §3): the data itself records "I conform to v1", which makes the
// doctor's `version-floor` check a one-liner and matches the parallel-sessions reality. This
// retroactively stamps the 94 existing units against CURRENT_SCHEMA_VERSION (the seeAlso->Sources
// migration is #1). Other fields and ordering are left untouched; `updatedAt` is NOT bumped (the
// stamp is a metadata pin, not a content edit).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CURRENT_SCHEMA_VERSION = 1;

const dry = process.argv.includes('--dry');
const dataDir = path.dirname(fileURLToPath(import.meta.url));
const knowledgeFile = path.join(dataDir, 'knowledge.json');
const docs = JSON.parse(readFileSync(knowledgeFile, 'utf8'));

let changed = 0;
for (const doc of docs) {
  if (doc.schemaVersion === CURRENT_SCHEMA_VERSION) continue;
  if (dry) {
    console.log(`${doc.id}: schemaVersion ${doc.schemaVersion ?? '(absent)'} -> ${CURRENT_SCHEMA_VERSION}`);
    continue;
  }
  doc.schemaVersion = CURRENT_SCHEMA_VERSION;
  changed++;
}

if (!dry) {
  writeFileSync(knowledgeFile, JSON.stringify(docs, null, 2) + '\n', 'utf8');
  console.log(`stamp-schema-version: stamped ${changed}/${docs.length} units -> ${knowledgeFile}`);
} else {
  console.log('\n(dry run — nothing written)');
}
