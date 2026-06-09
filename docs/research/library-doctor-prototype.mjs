// READ-ONLY PROTOTYPE (docs/research/library-schema-migrations-and-health-checks.md):
// a `library doctor` sketch. Runs the post-migration health checks against the SEED
// (knowledge.json + assets.json + docs/) — writes nothing, touches no schema.
//
//   npx tsx docs/research/library-doctor-prototype.mjs
//
// It demonstrates pain-point #3 from the design note ("did everything come forward?") as an
// automated assertion instead of an eyeball. Five checks, each reported as PASS / WARN / FAIL:
//   1. schema-conformance  — every structured unit validateLibraryDoc()s against the CURRENT schema
//   2. retired-field       — no unit carries a field the schema has retired (the denylist)
//   3. version-floor       — no unit sits below the current schemaVersion (today: all at v0)
//   4. referential-integ.  — every asset:<id> resolves to a live id; every doc:<path> resolves on disk
//   5. count-reconciliation — source units == generated non-template assets
//
// The real doctor would run the same checks against the LIVE projection (--pg) and gate CI
// (ADR-0022). This prototype runs offline against the seed so it needs no DB.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateLibraryDoc, KIND_SPECS } from '../../packages/core/src/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const dataDir = path.join(repoRoot, 'apps', 'studio', 'data');
const docsDir = path.join(repoRoot, 'docs');

const units = JSON.parse(readFileSync(path.join(dataDir, 'knowledge.json'), 'utf8'));
const assets = JSON.parse(readFileSync(path.join(dataDir, 'assets.json'), 'utf8'));

// --- knobs the real doctor would read from the migration registry --------------------------------
const CURRENT_SCHEMA_VERSION = 1; // pretend the seeAlso->Sources migration is #1
const RETIRED_FIELDS = ['seeAlso']; // fields removed by past migrations — must not reappear
// -------------------------------------------------------------------------------------------------

const liveIds = new Set(units.map((u) => u.id).concat(assets.map((a) => a.id)));
let failed = 0;
let warned = 0;

function report(name, level, lines) {
  const tag = level === 'PASS' ? 'PASS' : level === 'WARN' ? 'WARN' : 'FAIL';
  if (level === 'FAIL') failed++;
  if (level === 'WARN') warned++;
  console.log(`[${tag}] ${name}`);
  for (const l of lines) console.log(`        ${l}`);
}

// 1. schema-conformance ---------------------------------------------------------------------------
{
  const bad = [];
  for (const u of units) {
    try {
      validateLibraryDoc(u);
    } catch (e) {
      bad.push(`${u.id}: ${String(e.message).split('\n')[0]}`);
    }
  }
  report('schema-conformance', bad.length ? 'FAIL' : 'PASS', bad.length
    ? bad
    : [`all ${units.length} structured units validate against the current Knowledge schema`]);
}

// 2. retired-field --------------------------------------------------------------------------------
{
  const hits = [];
  for (const u of units) for (const f of RETIRED_FIELDS) if (f in u) hits.push(`${u.id} still carries '${f}'`);
  report('retired-field', hits.length ? 'FAIL' : 'PASS', hits.length
    ? hits
    : [`no unit carries a retired field (${RETIRED_FIELDS.join(', ')})`]);
}

// 3. version-floor --------------------------------------------------------------------------------
{
  const behind = units
    .map((u) => ({ id: u.id, v: typeof u.schemaVersion === 'number' ? u.schemaVersion : 0 }))
    .filter((u) => u.v < CURRENT_SCHEMA_VERSION);
  report('version-floor', behind.length ? 'WARN' : 'PASS', behind.length
    ? [
        `${behind.length}/${units.length} units below schemaVersion ${CURRENT_SCHEMA_VERSION} (none carry the stamp yet)`,
        `=> they'd be auto-upcast on next write, or batch-migrated; the doctor names the backlog`,
      ]
    : [`every unit at or above schemaVersion ${CURRENT_SCHEMA_VERSION}`]);
}

// 4. referential-integrity ------------------------------------------------------------------------
{
  const danglingAsset = [];
  const danglingDoc = [];
  for (const u of units) {
    for (const ref of u.references ?? []) {
      if (ref.startsWith('asset:')) {
        const id = ref.slice('asset:'.length);
        if (!liveIds.has(id)) danglingAsset.push(`${u.id} -> ${ref} (no such artifact)`);
      } else if (ref.startsWith('doc:')) {
        const rel = ref.slice('doc:'.length);
        if (!existsSync(path.join(docsDir, rel))) danglingDoc.push(`${u.id} -> ${ref} (no such file under docs/)`);
      }
    }
  }
  const all = [...danglingAsset, ...danglingDoc];
  // dangling doc: links are softer (a doc can move) -> WARN; dangling asset: is a real graph break -> FAIL
  const level = danglingAsset.length ? 'FAIL' : all.length ? 'WARN' : 'PASS';
  report('referential-integrity', level, all.length
    ? all
    : ['every asset:/doc: pointer resolves']);
}

// 5. count-reconciliation -------------------------------------------------------------------------
{
  const kinds = new Set(Object.keys(KIND_SPECS));
  const structuredAssets = assets.filter((a) => kinds.has(a.category));
  const ok = structuredAssets.length === units.length;
  report('count-reconciliation', ok ? 'PASS' : 'FAIL', [
    `source units (knowledge.json): ${units.length}`,
    `generated non-template assets (assets.json): ${structuredAssets.length}`,
    `generated templates: ${assets.length - structuredAssets.length}`,
    ok ? 'source == generated (regeneration is current)' : 'MISMATCH: assets.json is stale — re-run build-corpus.mjs',
  ]);
}

console.log(`\n${failed ? 'DOCTOR: ' + failed + ' FAIL' : 'DOCTOR: 0 FAIL'}, ${warned} WARN.`);
process.exitCode = failed ? 1 : 0;
