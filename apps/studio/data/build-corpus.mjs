// GENERATOR (inverse of bootstrap): knowledge.json -> the derived artifacts.
//
//   npx tsx apps/studio/data/build-corpus.mjs
//
// Reads apps/studio/data/knowledge.json (the structured source of truth) and
// regenerates:
//   (a) apps/studio/data/assets.json — each knowledge unit's `body` rendered via
//       packages/core renderBody (category = kind, id/references/timestamps kept);
//       PLUS the generated template-<kind> units (definition / principle / pattern /
//       guardrail / techstack / open-question) via generateTemplate, and template-adr
//       kept verbatim (it scaffolds the ADR source layer, not a knowledge kind).
//   (b) docs/glossary.md — the glossary is now a GENERATED VIEW of knowledge.json
//       (owner decision #2: the glossary becomes a generated view of the structured
//       knowledge source, not a hand-edited file). Every glossary member is a knowledge
//       unit carrying `glossarySection` (the `## ` heading it sits under). Sections, the
//       preamble, the lifecycle-section intro, and the "## v1 -> v2 term map" table are
//       emitted in the order fixed by GLOSSARY_SECTION_ORDER, which also fixes the within-
//       section term order. Each term renders as `**label** — paragraph`:
//         - label    = `glossaryTerm ?? title` (the exact bolded label, asides/casing).
//         - paragraph for a `definition` = `whatItIs` + (whatItIsNot ? " " + whatItIsNot : "")
//                      — round-1 split the authoritative paragraph into oneLine/whatItIs/
//                      whatItIsNot/seeAlso; recomposing whatItIs+whatItIsNot preserves the
//                      definition's full meaning (seeAlso is links/provenance, not prose).
//         - paragraph for a NON-definition (principle/pattern/guardrail) = its one-line
//                      `description` (those members have no whatItIs; their glossary form is
//                      a terse one-liner). NOTE: `cold-rebuild`'s authoritative glossary
//                      entry is a rich multi-clause paragraph that `description` does not
//                      fully carry — see the build-corpus report; flagged for owner review.
//
// Asset ORDERING is taken from the existing assets.json; the field VALUES
// (title/description/references/body) are rendered from knowledge.json — the
// structured source of truth (id/category + timestamps are stable keys).
// renderBody/generateTemplate are driven by the same KIND_SPECS the schema and
// the parser use — one table, three consumers, ADR-0017 "templates -> schema".

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  KIND_SPECS,
  renderBody,
  generateTemplate,
} from '../../../packages/core/src/index.ts';

const dataDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dataDir, '..', '..', '..');
const assetsFile = path.join(dataDir, 'assets.json');
const knowledgeFile = path.join(dataDir, 'knowledge.json');
const glossaryFile = path.join(repoRoot, 'docs', 'glossary.md'); // now a GENERATED view (written here)
const glossarySidecarFile = path.join(repoRoot, 'docs', 'glossary.generated.md'); // retired sidecar — deleted

const KNOWLEDGE_KINDS = new Set(Object.keys(KIND_SPECS));
const GENERATED_TEMPLATE_KINDS = new Set([
  'template-definition',
  'template-principle',
  'template-pattern',
  'template-guardrail',
  'template-techstack',
  'template-process',
  'template-open-question',
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
};

// ---------------------------------------------------------------------------
// (a) assets.json
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

function buildAssets() {
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

  writeFileSync(assetsFile, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out;
}

// ---------------------------------------------------------------------------
// (b) docs/glossary.md
// ---------------------------------------------------------------------------

// The glossary preamble (title + lead paragraph), verbatim. Emitted before the
// first term section.
const GLOSSARY_PREAMBLE = `# Glossary

Authoritative terminology for storytree. Every layer — \`packages/core\` types,
the orchestrator, the studio UI, and the ADRs — uses these words as defined
here. When a term's meaning is in question, **this file wins**. The reasoning
and the tier-boundary rules live in
[ADR-0002](decisions/0002-work-hierarchy-story-capability-contract.md).`;

// The lifecycle section carries an intro paragraph before its bolded terms.
// Keyed by section heading; emitted right after the `## ` heading.
const SECTION_INTROS = {
  "Lifecycle (a capability's status)": `Status lives on every tier (story / capability / contract); a **story**'s state is
not a pure rollup — it carries its own UAT proof (ADR-0010) on top of its
capabilities'. Carried from v1's lifecycle, with
\`under_construction\` renamed to **building** and the health metaphor kept (we did
*not* rename \`healthy\` to "proven" — "proven" stays as general proof-mode
language, \`healthy\` is the status word).`,
};

// The ordered list of `## ` term sections, and the id order within each (matches
// docs/glossary.md). Members are knowledge units of ANY kind that carry
// `glossarySection`: definitions render from whatItIs+whatItIsNot, non-definitions
// (principle/pattern/guardrail — e.g. prove-it-gate, cold-rebuild, red-green, and the
// "Principles & patterns" block) from their one-line `description`. This list fixes
// heading order and within-section term order; `glossarySection` on each unit is the
// membership predicate (see assertGlossaryMembership).
const GLOSSARY_SECTION_ORDER = [
  { heading: 'The work hierarchy', ids: ['story', 'capability', 'contract'] },
  {
    heading: 'Supporting terms',
    ids: [
      'node', 'run', 'uat', 'contract-test', 'dependency', 'boundary', 'event',
      'event-log', 'node-rollup', 'pi-event-stream', 'approval-event-promotion-event', 'dag',
    ],
  },
  {
    heading: "Lifecycle (a capability's status)",
    ids: ['lifecycle-status'],
  },
  {
    heading: 'Proof, evidence & gating',
    ids: [
      'gate', 'prove-it-gate', 'proof-mode', 'operator-attested', 'convergence',
      'cold-rebuild', 'per-node-budget', 'approval', 'verdict', 'evidence',
      'proof-hash', 'red-green', 'mock-uat-seam',
    ],
  },
  {
    heading: 'Principles & patterns (carried from v1)',
    ids: [
      'deep-modules', 'defects-amend-the-owning-story', 'fail-closed-on-dirty-tree',
      'standalone-resilient-library', 'verification-wins', 'human-owns-the-outer-loop',
    ],
  },
  { heading: 'Unit fields', ids: ['unit-fields'] },
  { heading: 'Concurrency & isolation', ids: ['claim', 'write-ownership', 'noticeboard'] },
  {
    heading: 'Studio & tooling',
    ids: [
      'story-tree', 'library', 'studio', 'orchestrator', 'spine', 'leaf-step-leaf-judgment',
      'pi-adapter', 'trunk', 'steering', 'adr', 'fixture', 'ndjson', 'asset',
    ],
  },
];

// The "## v1 -> v2 term map" section, verbatim — has no definition units and would
// be lost if the glossary were rebuilt purely from them. Carried through unchanged.
const TERM_MAP_SECTION = `## v1 → v2 term map

For reading v1 (Agentic) docs. Left = what v1 wrote; right = how to read it here.

| v1 term | storytree |
|---|---|
| story | **capability** (the in-story provable unit, now integration-proven; ADR-0010) |
| epic | a grouping — closest is **story**; a dedicated epic tier is deferred |
| \`contract.yml\` (per-agent) | — dropped (v2 has no per-agent contract file) |
| "story is a contract" / red-green | the **red-green** principle / a capability's proof — not the noun \`contract\` |
| acceptance / acceptance.tests | a story's **UAT** + its capabilities' **integration tests** + their **contract tests** (ADR-0010) |
| depends_on / predecessor / prerequisite | **dependency** (in-story: code-derived; cross-story: via a **boundary**; ADR-0010) |
| under_construction | **building** |
| healthy / proven | **healthy** |
| dashboard | **studio** |
| \`manual_signings\` (ADR-0024) | **operator-attested** proof mode (ADR-0007) |
| \`session_claims\` table (ADR-0022) | **claim** in the shared store (ADR-0009) |
| \`declared_scope\` / \`does_not_touch\` | **write-ownership** (one vocabulary; ADR-0009) |
| \`runs\` / \`test_runs\` (per-build) | a per-node **run** (execution event) + the **node rollup** projection (ADR-0004, ADR-0006) |
| auto-merge-on-green trunk | the **approval-gated trunk** (human admits green; ADR-0008) |
| asset (shared DRY content) | — dropped; in storytree **asset = tree art** (ADR-0001) |
| pattern (the \`patterns/\` subsystem) | — dropped; named patterns (e.g. standalone-resilient-library) carry |
| deployment (v1, ×3 overload) | — not carried; v1 conflated VCS-exclusion vs runtime-artifact-exclusion (ADR-0003) — guard against the overload, do not reintroduce the word |`;

/**
 * Render one knowledge unit as a glossary term entry: `label — paragraph`.
 *   - label     = the verbatim bolded label. `glossaryTerm` carries the FULL label markup
 *                 (its own `**…**` markers, plus any plain-text aside that sits OUTSIDE the
 *                 bold in the glossary, e.g. `**run** (owned-loop run / attempt)`); when
 *                 absent the label is just the bolded `title`.
 *   - paragraph = `glossaryBody`, the term's canonical glossary blurb stored VERBATIM (the
 *                 exact prose after `**label** — ` in docs/glossary.md). This is the
 *                 authoritative source line, intentionally distinct from the Library body
 *                 fields, so the regenerated glossary is BYTE-IDENTICAL to its source.
 *                 FALLBACK (only when `glossaryBody` is absent): recompose from the Library
 *                 fields — a `definition`'s `whatItIs` + (whatItIsNot ? " " + whatItIsNot : ""),
 *                 or any other kind's one-line `description`.
 */
function renderGlossaryTerm(doc) {
  const label = doc.glossaryTerm ?? `**${doc.title}**`;
  const paragraph =
    doc.glossaryBody ??
    (doc.kind === 'definition'
      ? doc.whatItIs + (doc.whatItIsNot ? ' ' + doc.whatItIsNot : '')
      : doc.description);
  return `${label} — ${paragraph}`;
}

/**
 * Guard against glossary drift: every unit carrying `glossarySection` must be placed
 * in GLOSSARY_SECTION_ORDER (right heading + listed id), and every listed id must exist
 * and carry a matching `glossarySection`. Throws on any mismatch so the order table and
 * the source can never silently diverge.
 */
function assertGlossaryMembership(docById) {
  const placed = new Map(); // id -> heading
  for (const section of GLOSSARY_SECTION_ORDER) {
    for (const id of section.ids) {
      const doc = docById.get(id);
      if (!doc) throw new Error(`glossary order lists unknown id ${id}`);
      if (doc.glossarySection !== section.heading) {
        throw new Error(
          `glossary id ${id}: glossarySection ${JSON.stringify(doc.glossarySection)} ` +
            `!= ordered section ${JSON.stringify(section.heading)}`,
        );
      }
      placed.set(id, section.heading);
    }
  }
  for (const doc of docById.values()) {
    if (doc.glossarySection && !placed.has(doc.id)) {
      throw new Error(
        `unit ${doc.id} has glossarySection ${JSON.stringify(doc.glossarySection)} ` +
          `but is not placed in GLOSSARY_SECTION_ORDER`,
      );
    }
  }
}

function buildGlossary() {
  const docs = JSON.parse(readFileSync(knowledgeFile, 'utf8'));
  const docById = new Map(docs.map((d) => [d.id, d]));

  assertGlossaryMembership(docById);

  const blocks = [GLOSSARY_PREAMBLE];

  for (const section of GLOSSARY_SECTION_ORDER) {
    blocks.push(`## ${section.heading}`);
    if (SECTION_INTROS[section.heading]) {
      blocks.push(SECTION_INTROS[section.heading]);
    }
    for (const id of section.ids) {
      blocks.push(renderGlossaryTerm(docById.get(id)));
    }
  }

  blocks.push(TERM_MAP_SECTION);

  const generated = blocks.join('\n\n') + '\n';
  // THE FLIP: the glossary is now generated. Write docs/glossary.md directly and
  // retire the sidecar.
  writeFileSync(glossaryFile, generated, 'utf8');
  let removedSidecar = false;
  if (existsSync(glossarySidecarFile)) {
    unlinkSync(glossarySidecarFile);
    removedSidecar = true;
  }

  const headings = (s) => (s.match(/^## .+$/gm) ?? []).map((h) => h.trim());
  const genHeadings = headings(generated);

  return { glossaryFile, removedSidecar, genHeadings };
}

// ---------------------------------------------------------------------------

function main() {
  const assets = buildAssets();
  const glossary = buildGlossary();
  const byCat = assets.reduce((acc, a) => ((acc[a.category] = (acc[a.category] ?? 0) + 1), acc), {});
  console.log(`build-corpus OK — wrote ${assets.length} assets -> ${assetsFile}`);
  console.log('  by category:', JSON.stringify(byCat));
  console.log(`  wrote generated glossary -> ${glossary.glossaryFile} (${glossary.genHeadings.length} sections)`);
  if (glossary.removedSidecar) {
    console.log('  retired sidecar -> docs/glossary.generated.md (deleted)');
  }
}

main();
