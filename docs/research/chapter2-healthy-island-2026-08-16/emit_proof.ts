/**
 * THE PROOF HALF — what the LIVE STORE says about one story, read the way the map reads it.
 *
 * WHY THIS IS A SEPARATE FILE FROM `emit_healthy_island.ts`, AND WHY IT IS THE MORE IMPORTANT ONE.
 *
 * The obvious way to build "a healthy island from a real story" is to look for capabilities whose
 * spec frontmatter says `status: healthy`. That is wrong, and it is wrong in the direction that
 * would have produced another fixture:
 *
 *   NOT ONE capability in the entire `stories/**` corpus is authored `status: healthy`. The
 *   authored ladder across all 48 stories is proposed / mapped / building / retired, and nothing
 *   else. A search for authored green returns the empty set.
 *
 * That is not a gap — it is ADR-0040 working. Green in the world derives from a SIGNED VERDICT and
 * never from authored paint (`apps/studio/src/lib/worldStatus.ts`):
 *
 *     provenStatus(status, verdict) =
 *         verdict.outcome === 'pass'  ->  'healthy'      // the ONLY source of green
 *         status === 'healthy'        ->  'mapped'       // authored green with no signed pass
 *                                                        //   UNDER-claims (brownfield)
 *         otherwise                   ->  worldStatus(status)
 *
 *     worldStatus(status) =
 *         'building'   -> 'proposed'    // ADR-0038: live work is signalled by wisps, not by a hue
 *         'unhealthy'  -> 'mapped'      // ADR-0296, owner-directed: the world draws NO withered form
 *         otherwise    -> as authored
 *
 * So a healthy island is one whose capabilities carry signed PASSES, and it is reachable only
 * through the store. This file reads them.
 *
 * TWO CONSEQUENCES THE ARC SHOULD READ CAREFULLY, both mechanical rather than matters of taste:
 *
 *   1. THE FIXTURE'S CHARCOAL IS NOT MERELY INVENTED — IT IS UNRENDERABLE. `fork-spike-island`'s
 *      tenth capability is `unhealthy`, which `worldStatus` folds to `mapped`. The shipped map has
 *      drawn no charcoal since ADR-0296. The ~16% of delivered land the owner circled on 2026-08-16
 *      is therefore a colour the app cannot produce for any story, in any state, at all.
 *   2. ITS TWO `building` CAPABILITIES ARE ALSO UNRENDERABLE AS AUTHORED — `building` folds to
 *      `proposed` (ADR-0038). Of the fixture's five status tokens, TWO reach the delivered picture
 *      only because the fixture bypassed the fold.
 *
 * `verify.py` asserts both against the app's own fold rather than against this comment.
 *
 * WHAT IS READ, AND FROM WHERE
 *   per-capability verdict  <- `events.verdict` via `PgWorkStore.readEvents` + `deriveVerdictGlyphs`
 *                              (@storytree/drive) — the SAME derivation `storytree tree` prints.
 *   per-criterion state     <- `rollupCriterionStatus` (@storytree/orchestrator) over the same
 *                              events, the SAME compute `apiRouter.applyUatCriteria` uses:
 *                              healthy -> proven, unhealthy -> failing, else pending.
 *
 * Needs the live store. Run:
 *   npx tsx docs/research/chapter2-healthy-island-2026-08-16/emit_proof.ts --story <id>
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Imported by RELATIVE path into each package's own source, exactly as the interior fork's
// `emit_island.ts` imports `packages/forest-world/src`: `docs/research/**` is not a workspace
// package, so a bare `@storytree/...` specifier does not resolve from here (measured:
// ERR_MODULE_NOT_FOUND). Reaching a package's own entry point relatively still gets the package's
// real module — its own internal bare imports resolve from ITS location — so this is a path
// question and not a second copy.
import { createPool, closePool } from '../../../packages/library/src/store/index.js';
import { PgWorkStore } from '../../../packages/orchestrator/src/store/index.js';
import { rollupCriterionStatus } from '../../../packages/orchestrator/src/index.js';
import { deriveVerdictGlyphs, readVerdictEvents } from '../../../packages/drive/src/index.js';

import { loadNodeSpec, type NodeSpec } from '../../../packages/orchestrator/src/node-spec.js';

import { asciiJson } from './ascii_json.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

const ARGV = process.argv.slice(2);
const argOf = (name: string, fallback: string): string => {
  const i = ARGV.indexOf(name);
  const v = i >= 0 ? ARGV[i + 1] : undefined;
  return v === undefined ? fallback : v;
};
const STORY_ID = argOf('--story', '');
if (!STORY_ID) throw new Error('--story <story-id> is required');
const OUT_PATH = argOf('--out', join(HERE, 'proof.json'));

const STORY_DIR = join(REPO, 'stories', STORY_ID);

function loadStorySpec(): NodeSpec {
  for (const name of [`${STORY_ID}.md`, 'story.md', 'index.md']) {
    const f = join(STORY_DIR, name);
    if (existsSync(f)) {
      const spec = loadNodeSpec(f);
      if (spec.tier === 'story') return spec;
    }
  }
  for (const e of readdirSync(STORY_DIR)) {
    if (!e.endsWith('.md')) continue;
    try {
      const spec = loadNodeSpec(join(STORY_DIR, e));
      if (spec.tier === 'story') return spec;
    } catch {
      /* not the story spec */
    }
  }
  throw new Error(`stories/${STORY_ID} carries no spec declaring tier: story`);
}

/**
 * The app's fold, ported verbatim from `apps/studio/src/lib/worldStatus.ts`.
 *
 * IT IS RESTATED HERE RATHER THAN IMPORTED, AND THAT IS A REAL COST — a second copy that could
 * drift. It is restated because the original lives in `apps/studio/src`, a browser-bundled React
 * module behind a Vite alias graph, and importing it from a `tsx` script would drag the studio's
 * bundle config into a research pass. So `verify.py` check 2 does what an import would have done
 * mechanically: it re-reads `worldStatus.ts` from disk, extracts its three folding clauses, and
 * fails if this port's behaviour disagrees on any (status x verdict) pair. A copy that is checked
 * against its original on every run is not the same object as a copy nobody compares.
 */
function worldStatus(status: string | null): string | null {
  if (status === 'building') return 'proposed';
  if (status === 'unhealthy') return 'mapped';
  return status;
}
function provenStatus(status: string | null, outcome: string | undefined): string | null {
  if (outcome === 'pass') return 'healthy';
  if (status === 'healthy') return 'mapped';
  return worldStatus(status);
}

async function main(): Promise<void> {
  const storySpec = loadStorySpec();
  const { pool, connector } = await createPool();
  try {
    const work = new PgWorkStore(pool);
    const events = await readVerdictEvents(work);
    if (events === null) {
      throw new Error(
        'the live store returned no verdict events — this pass may not fall back to authored ' +
          'status, because authored status is never green (ADR-0040). Bring the DB up (pnpm db:up).',
      );
    }
    const glyphs = deriveVerdictGlyphs(events);

    const capabilities = storySpec.capabilities.map((capId) => {
      const file = join(STORY_DIR, `${capId}.md`);
      if (!existsSync(file)) throw new Error(`stories/${STORY_ID}/${capId}.md is missing`);
      const spec = loadNodeSpec(file);
      const glyph = glyphs.get(capId);
      const outcome = glyph === '✓' ? 'pass' : glyph === '✗' ? 'fail' : undefined;
      return {
        id: capId,
        title: spec.title,
        authoredStatus: spec.status,
        /** '✓' signed pass · '✗' signed fail · '–' the store holds no verdict for this unit. */
        verdictGlyph: glyph ?? '–',
        verdictOutcome: outcome ?? null,
        /** WHAT THE MAP DRAWS. The only field the island's tint may read. */
        renderedStatus: provenStatus(spec.status, outcome),
        tests: spec.contracts.length,
      };
    });

    const uatCriteria = storySpec.uatTestCriteria
      .filter((t) => !t.wouldBe)
      .map((t) => {
        const status = rollupCriterionStatus(
          { criterionId: t.criterionId, revisionId: t.revisionId },
          events,
        );
        const state = status === 'healthy' ? 'proven' : status === 'unhealthy' ? 'failing' : 'pending';
        return { id: t.criterionId, revisionId: t.revisionId, witness: t.witness ?? null, state };
      });

    const storyGlyph = glyphs.get(STORY_ID);
    const out = {
      storyId: STORY_ID,
      readAt: new Date().toISOString(),
      source:
        'events.verdict via PgWorkStore.readEvents + deriveVerdictGlyphs (@storytree/drive) — the ' +
        'same derivation `storytree tree --pg` prints; criterion states via rollupCriterionStatus ' +
        '(@storytree/orchestrator), the same compute apiRouter.applyUatCriteria uses',
      fold: 'provenStatus(authoredStatus, verdict) — apps/studio/src/lib/worldStatus.ts (ADR-0040 / ADR-0038 / ADR-0296)',
      verdictEventsRead: events.length,
      storyAuthoredStatus: storySpec.status,
      storyVerdictGlyph: storyGlyph ?? '–',
      capabilities,
      uatCriteria,
    };
    writeFileSync(OUT_PATH, `${asciiJson(out)}\n`);
    const mix = capabilities.reduce<Record<string, number>>((m, c) => {
      const k = String(c.renderedStatus);
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {});
    console.log(
      `${OUT_PATH}\n  story=${STORY_ID}  verdictEvents=${events.length}  caps=${capabilities.length}\n` +
        `  authored: ${capabilities.map((c) => c.authoredStatus).join(',')}\n` +
        `  glyphs:   ${capabilities.map((c) => c.verdictGlyph).join(',')}\n` +
        `  RENDERED: ${Object.entries(mix)
          .map(([k, v]) => `${k} x${v}`)
          .join(', ')}\n` +
        `  tests:    ${capabilities.map((c) => c.tests).join(',')}\n` +
        `  uat:      ${uatCriteria.length} criteria — ${uatCriteria
          .map((u) => u.state)
          .join(',')}`,
    );
  } finally {
    await closePool(pool, connector);
  }
}

await main();
