// GENERATOR (inverse of bootstrap): knowledge.json -> the derived asset store.
//
//   npx tsx apps/studio/data/build-corpus.mjs
//
// Reads apps/studio/data/knowledge.json (the structured source of truth) and
// regenerates apps/studio/data/assets.json — each knowledge unit's `body`
// rendered via @storytree/library renderBody (category = kind, id/references/
// timestamps kept); PLUS the generated template-<kind> units (definition /
// principle / pattern / guardrail / techstack / open-question) via
// generateTemplate, and template-adr kept verbatim (it scaffolds the ADR source
// layer, not a knowledge kind).
//
// (docs/glossary.md was a second generated view of knowledge.json; it was RETIRED
// by ADR-0135 — the Library's definition artifacts are the sole term authority and
// terms are looked up just-in-time, so there is no longer a generated dictionary.)
//
// Asset ORDERING is taken from the existing assets.json; the field VALUES
// (title/description/references/body) are rendered from knowledge.json — the
// structured source of truth (id/category + timestamps are stable keys).
// renderBody/generateTemplate are driven by the same KIND_SPECS the schema and
// the parser use — one table, three consumers, ADR-0017 "templates -> schema".

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  KIND_SPECS,
  renderBody,
  generateTemplate,
} from '../../../packages/library/src/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
// Path override (default = the real in-repo location) lets `--check` run against a temp fixture tree —
// see packages/cli/src/corpus-build-check.test.ts — and keeps the generator relocatable.
const dataDir = process.env.STORYTREE_CORPUS_DATA_DIR
  ? path.resolve(process.env.STORYTREE_CORPUS_DATA_DIR)
  : here;
const assetsFile = path.join(dataDir, 'assets.json');
const knowledgeFile = path.join(dataDir, 'knowledge.json');

const KNOWLEDGE_KINDS = new Set(Object.keys(KIND_SPECS));
const GENERATED_TEMPLATE_KINDS = new Set([
  'template-definition',
  'template-principle',
  'template-pattern',
  'template-guardrail',
  'template-techstack',
  'template-process',
  'template-open-question',
  'template-agent',
  'template-proposal',
]);

// One-line gloss per generated template's description ("Fillable scaffold for a new
// <kind> artifact (<gloss>)."). A kind added to KIND_SPECS must be added here too.
const TEMPLATE_GLOSS = {
  definition: 'what something is',
  principle: 'how to judge',
  pattern: 'a reusable approach',
  guardrail: 'a deterministically-enforced boundary',
  techstack: 'what we build on',
  process: 'a repeatable operating ceremony',
  'open-question': 'an unresolved decision to settle',
  agent: 'a role and its operating discipline',
  proposal: 'a planned change to roll out when ready',
};

// ---------------------------------------------------------------------------
// assets.json
// ---------------------------------------------------------------------------

// Render one knowledge doc into a runtime-store asset. `category` is the doc's
// `kind` (knowledge.json is the source of truth, so a recategorized unit's asset
// category follows it); `prevAsset` (if any) supplies stable timestamps.
function renderKnowledgeAsset(doc, prevAsset) {
  return {
    id: doc.id,
    category: doc.kind,
    title: doc.title,
    description: doc.description,
    body: renderBody(doc),
    references: doc.references,
    // Citations are structured-only now: `references` (grouped as "Sources" at render time) plus
    // the optional `provenance` prose. No body `## See also`. Carry provenance through when present.
    ...(doc.provenance ? { provenance: doc.provenance } : {}),
    createdAt: doc.createdAt ?? prevAsset?.createdAt,
    updatedAt: doc.updatedAt ?? prevAsset?.updatedAt,
  };
}

// Serialize an assets array to its exact on-disk form (the `--check` compare and the writer share it).
const serializeAssets = (out) => JSON.stringify(out, null, 2) + '\n';

// Pure: compute the assets array from knowledge.json (ordering seeded by the existing assets.json).
// IO (the write) lives in runBuild so `--check` can regenerate without touching the tree.
function computeAssets() {
  const existing = JSON.parse(readFileSync(assetsFile, 'utf8'));
  const docs = JSON.parse(readFileSync(knowledgeFile, 'utf8'));
  const docById = new Map(docs.map((d) => [d.id, d]));
  const emitted = new Set();

  // 1. Walk the existing store order. Knowledge assets are re-rendered from the
  //    structured source; a knowledge asset whose doc was DELETED from
  //    knowledge.json is dropped (assets.json is a generated derivative, so its
  //    membership follows knowledge.json). Templates are kept/regenerated.
  const out = [];
  for (const a of existing) {
    if (KNOWLEDGE_KINDS.has(a.category)) {
      const doc = docById.get(a.id);
      if (!doc) continue; // retired in knowledge.json -> drop from the store
      out.push(renderKnowledgeAsset(doc, a));
      emitted.add(doc.id);
      continue;
    }
    if (a.category === 'template') {
      if (GENERATED_TEMPLATE_KINDS.has(a.id)) {
        const kind = a.id.slice('template-'.length);
        out.push({ ...a, body: generateTemplate(kind) });
      } else {
        // template-adr (and any other non-knowledge template) kept as-is.
        out.push(a);
      }
      continue;
    }
    throw new Error(`unit ${a.id}: unexpected category ${JSON.stringify(a.category)}`);
  }

  // 2. Append knowledge docs that are NEW (not yet in the store), in knowledge.json
  //    order, so consolidated/created units (e.g. lifecycle-status, unit-fields)
  //    land in the generated store.
  for (const doc of docs) {
    if (emitted.has(doc.id)) continue;
    out.push(renderKnowledgeAsset(doc, undefined));
    emitted.add(doc.id);
  }

  // 3. Append generated templates for kinds that gained one (e.g. template-process,
  //    ADR-0034) — step 1 only re-renders templates already in the store.
  const presentIds = new Set(out.map((a) => a.id));
  for (const tid of GENERATED_TEMPLATE_KINDS) {
    if (presentIds.has(tid)) continue;
    const kind = tid.slice('template-'.length);
    out.push({
      id: tid,
      category: 'template',
      title: `Template — ${kind}`,
      description: `Fillable scaffold for a new ${kind} artifact (${TEMPLATE_GLOSS[kind]}).`,
      body: generateTemplate(kind),
      references: [],
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------

// LF-space compare so a Windows (CRLF) checkout never shows spurious drift — the build-agents.ts fix.
const toLf = (s) => s.replace(/\r\n/g, '\n');

// Default mode: (re)generate assets.json.
function runBuild() {
  const assets = computeAssets();
  writeFileSync(assetsFile, serializeAssets(assets), 'utf8');
  const byCat = assets.reduce((acc, a) => ((acc[a.category] = (acc[a.category] ?? 0) + 1), acc), {});
  console.log(`build-corpus OK — wrote ${assets.length} assets -> ${assetsFile}`);
  console.log('  by category:', JSON.stringify(byCat));
}

// `--check` mode (DB-free, wired into CI + `pnpm gate`): regenerate IN MEMORY and FAIL (exit 1) if
// the on-disk assets.json has drifted — so a stale assets.json can never merge clean. The mirror of
// check:claude / check:agents for the corpus generator. Writes nothing.
function runCheck() {
  const assets = computeAssets();
  const assetsGenerated = serializeAssets(assets);
  const assetsOnDisk = existsSync(assetsFile) ? readFileSync(assetsFile, 'utf8') : '';

  if (toLf(assetsOnDisk) !== toLf(assetsGenerated)) {
    console.error(
      'check:corpus-build — STALE assets.json. Regenerate with ' +
        '`npx tsx apps/studio/data/build-corpus.mjs` and commit:',
    );
    console.error('  ' + path.relative(repoRoot, assetsFile));
    process.exit(1);
  }
  console.log(`check:corpus-build — assets.json in sync (${assets.length} assets).`);
}

function main() {
  if (process.argv.includes('--check')) runCheck();
  else runBuild();
}

// Entry-guard so the module can be imported without side effects; runs when invoked directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
