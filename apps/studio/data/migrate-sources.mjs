// ONE-SHOT MIGRATION (docs/research/library-sources-unification.md): retire the body `## See also`.
//
//   node apps/studio/data/migrate-sources.mjs --dry   # report only, writes nothing
//   node apps/studio/data/migrate-sources.mjs         # rewrite knowledge.json in place
//
// Per knowledge unit:
//   1. LIFT artifact cross-links named in `seeAlso` prose (backticked ids that match an existing
//      artifact id) into `references` as `asset:<id>` edges — the structured graph absorbs them.
//      (Mechanical + safe: an exact backticked artifact-id in the citation line is a citation.)
//   2. SET `provenance` from the curated PROVENANCE map below — the genuine attribution / "still
//      open" / deferral prose that a grouped pointer can't carry. Everything that was just a
//      restatement of a linked ADR/glossary pointer is intentionally dropped (that duplication is
//      exactly what this change removes). Units absent from the map get no provenance.
//   3. DELETE `seeAlso`.
// The body `## See also` then disappears automatically (renderBody is driven by KIND_SPECS, which
// no longer lists the field). `updatedAt` is bumped only on units that actually changed.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dry = process.argv.includes('--dry');
const dataDir = path.dirname(fileURLToPath(import.meta.url));
const knowledgeFile = path.join(dataDir, 'knowledge.json');
const docs = JSON.parse(readFileSync(knowledgeFile, 'utf8'));
const ids = new Set(docs.map((d) => d.id));
const NOW = '2026-06-08T00:00:00.000Z';

// Curated provenance: only prose NOT recoverable from the grouped Sources list or already in the
// body. Keys are artifact ids; absent = no provenance. (Derived by reviewing every `seeAlso` in the
// dry run and dropping pure pointer-restatements; see the design note.)
const PROVENANCE = {
  'deep-modules': 'Attribution: Ousterhout, via Matt Pocock. Imported from v1.',
  'edit-first-curation': 'Imported from v1.',
  'assess-tradeoffs-by-naming-both-sides': 'Imported from v1.',
  'spine-sequences-leaf-judges': 'The discriminator is carried verbatim from v1.',
  'claims-in-the-shared-store': 'The DBOS-backed mechanism is deferred by ADR-0019.',
  'stack-dbos-postgres': 'Deferred by ADR-0019 (reaffirmed ADR-0020).',
  'thin-wrapper-over-the-runtime':
    "Carries v1's own-a-thin-wrapper-over-the-agent-runtime principle.",
  'event-log-then-projection': "v2's answer to v1's per-build `runs`-grain mess.",
  'durable-workflow-per-node':
    'The DBOS workflow path is deferred by ADR-0019 (reaffirmed ADR-0020).',
  'standalone-resilient-library': 'Carried from v1.',
  'store-lock-races-and-id-collisions':
    'The DBOS-based remedy is deferred by ADR-0019 (reaffirmed ADR-0020).',
  run: 'See `open-questions.md` §3, §8.',
  'approval-event-promotion-event': 'Identity backing is open (`open-questions.md` §1).',
  'lifecycle-status': 'The brownfield `mapped` mechanism is open (`open-questions.md` §2).',
  'operator-attested': 'Persistence / identity backing is open (`open-questions.md` §1).',
  convergence: 'DAG-stabilisation ownership is open (`open-questions.md` §4).',
  'cold-rebuild': 'Carried from Agentic ADR-0006/0027.',
  'per-node-budget': 'The concrete unit and default ceiling stay open (`open-questions.md` §6).',
  approval: 'The identity backing the signature is open (`open-questions.md` §1).',
  evidence:
    'How v2 persists evidence (events vs files) and the attestation / identity model are open (`open-questions.md` §1).',
  'red-green':
    'Per the v1→v2 term map, v1\'s "story is a contract" / red-green reads as this principle, not the noun `contract`.',
  'verification-wins': "The learning loop's v2 home is open (`open-questions.md` §5).",
  claim: 'See `open-questions.md` §3.',
  'write-ownership': 'See `open-questions.md` §3.',
  orchestrator: 'DBOS deferred by ADR-0019.',
  spine: 'Carried verbatim from Agentic ADR-0026; DBOS deferred by ADR-0019.',
  'pi-adapter':
    "Carries v1's own-a-thin-wrapper-over-the-agent-runtime principle (Agentic ADR-0008/0026).",
  'stack-cloud-sql-keyless-iam':
    'Validated 2026-06-08: 73 units migrated keyless, then the instance stopped.',
  // The guideline-corpus units folded in by PR #14: their seeAlso is genuine substance
  // ("Composes with X (nuance)" relationship prose + v1/legacy origin), not pointer-restatement,
  // so it is preserved verbatim as provenance (their backticked cross-links are also lifted to refs).
  'doc-vs-implementation-precedence':
    'Composes with the `assess-tradeoffs-by-naming-both-sides` pattern (that governs how a surfaced tradeoff is framed; this governs whether the surface should exist). Imported from v1 `assets/guidelines/doc-vs-implementation-precedence.yml`.',
  'dogfood-fix-the-source':
    'Composes with `verify-edit-write-persisted-or-escalate` (a recovery fallback is permitted only after the failure is made visible). Imported from v1 `assets/guidelines/dogfood-fix-the-source.yml`.',
  'exploration-principles':
    'Composes with the `recursive-decomposition-patterns` pattern. Imported from legacy AgenticEngineering `AgenticGuidance`.',
  'guidance-quality':
    'Composes with the `signal-and-noise` principle (the discriminatory-power lens this serves). Imported from legacy AgenticEngineering `AgenticGuidance`.',
  'no-proof-preservation':
    'The inverse of a hand-edit that fakes `healthy`: there a unit claims proof it never earned; here a unit clings to proof its new content no longer supports. See the `prove-it-gate` principle and the `proof-hash` definition. Imported from v1 `assets/guidelines/no-proof-preservation.yml`.',
  'reward-hacking':
    'Composes with `implementer-shortcut-patterns` (the specific hollow shapes), `test-fixtures-mirror-production-failure-modes` (the sterile-fixture inverse), and `test-creation-principles`. See the `faked-uat-theatre` and `agent-never-self-exempts` artifacts. Imported from legacy AgenticEngineering `AgenticGuidance`.',
  'signal-and-noise':
    'Composes with the `guidance-quality` principle (the authoring moves that add signal). Imported from legacy AgenticEngineering `AgenticGuidance`.',
  'stale-prerequisite-links-are-phantoms':
    'Composes with the `defects-amend-the-owning-story` principle (that expands the DAG; this contracts it); both reach the operator before the DAG shape changes. See the `dependency` and `boundary` definitions (ADR-0010). Imported from v1 `assets/guidelines/stale-prerequisite-links-are-phantoms.yml`.',
  'test-creation-principles':
    'Same falsifiability discipline as `verify-edit-write-persisted-or-escalate`, applied to assertions. See the `contract-test` and `mock-uat-seam` definitions. Imported from legacy AgenticEngineering `AgenticGuidance`.',
  'test-fixtures-mirror-production-failure-modes':
    'Composes with `implementer-shortcut-patterns` (sterile fixture here, hollow implementation there) and `tightening-a-shared-contract-needs-a-full-sweep`. See the `mock-uat-seam` definition. Imported from v1 `assets/guidelines/test-fixtures-mirror-production-failure-modes.yml`.',
  'tightening-a-shared-contract-needs-a-full-sweep':
    'Composes with `test-fixtures-mirror-production-failure-modes` (that prevents a sterile fixture passing; this catches a previously-valid fixture a contract change just broke). Imported from v1 `assets/guidelines/tightening-a-shared-contract-needs-a-full-sweep.yml`.',
  'verify-edit-write-persisted-or-escalate':
    'Composes with `implementer-shortcut-patterns` and `test-fixtures-mirror-production-failure-modes` — the same falsifiability discipline applied to a write’s persistence. Imported from v1 `assets/guidelines/verify-edit-write-persisted-or-escalate.yml`.',
  'implementer-shortcut-patterns':
    'Composes with `test-fixtures-mirror-production-failure-modes` (the sterile-fixture inverse) and `reward-hacking`. See the `faked-uat-theatre` and `mock-uat-seam` artifacts. Imported from v1 `assets/guidelines/implementer-shortcut-patterns.yml`.',
  'pull-based-context-architecture':
    'A context-engineering principle for how agents are briefed, not a code spec for any subsystem. Composes with `signal-and-noise` (at the briefing layer) and `recursive-decomposition-patterns`. See ADR-0011 (pull-based just-in-time context). Imported from legacy AgenticEngineering `AgenticGuidance`.',
  'recursive-decomposition-patterns':
    'Source: Recursive Language Models (Zhang/Kraska/Khattab, MIT CSAIL); a context-engineering principle, not a code spec. Composes with `exploration-principles` and `pull-based-context-architecture`. Imported from legacy AgenticEngineering `AgenticGuidance`.',
  'repo-surface-allowlist':
    'Authoritatively defined by ADR-0024; enforces on the ADR-0022 dev-repo green gate. The repo-hygiene complement to `edit-first-curation` (search/edit before authoring) and `signal-and-noise` (cut low-signal docs). Distinct from the PRODUCT proof gate (`gate` / `never-bypass-the-gate` / `prove-it-gate`): same "a gate refuses, it does not warn" family, but this guards the dev repo’s git surface, not promotion onto the story DAG. Mechanism: `repo-manifest.json` + `scripts/check-manifest.mjs`.',
};

/** Backticked ids in `seeAlso` that name a real artifact (and aren't self / already linked). */
function crossLinks(doc) {
  const sa = doc.seeAlso ?? '';
  const refs = doc.references ?? [];
  const ticks = [...sa.matchAll(/`([a-z][a-z0-9-]+)`/g)].map((m) => m[1]);
  return [...new Set(ticks)].filter(
    (t) => ids.has(t) && t !== doc.id && !refs.includes(`asset:${t}`),
  );
}

let changed = 0;
for (const doc of docs) {
  if (!('seeAlso' in doc)) continue;
  const adds = crossLinks(doc);
  const prov = PROVENANCE[doc.id];

  if (dry) {
    console.log(`\n${doc.id} [${doc.kind}]`);
    if (adds.length) console.log('  +asset refs:', adds.join(', '));
    console.log('  provenance:', prov ? JSON.stringify(prov) : '(none)');
    continue;
  }

  doc.references = [...(doc.references ?? []), ...adds.map((t) => `asset:${t}`)];
  if (prov) doc.provenance = prov;
  delete doc.seeAlso;
  doc.updatedAt = NOW;
  changed++;
}

if (!dry) {
  writeFileSync(knowledgeFile, JSON.stringify(docs, null, 2) + '\n', 'utf8');
  console.log(`migrate-sources: rewrote ${changed} units -> ${knowledgeFile}`);
} else {
  console.log('\n(dry run — nothing written)');
}
