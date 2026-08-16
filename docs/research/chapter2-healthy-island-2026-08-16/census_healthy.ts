/**
 * WHICH STORY NODE — the whole-corpus census the pick is made from, so "I chose X" is a result
 * rather than a preference.
 *
 * The owner asked, on 2026-08-16: *"which story node did you pick anyways"*. That question has only
 * ever had a bad answer on this arc, because the answer was `fork-spike-island` — a fixture. This
 * file makes the answer checkable: it walks every story in `stories/**`, folds each capability
 * through the app's own `provenStatus` against the live store's signed verdicts, and prints every
 * story ranked by how much of it the map would actually draw GREEN.
 *
 * It reports two columns that are easy to confuse and must not be:
 *
 *   AUTHORED — the `status:` frontmatter. Across the whole corpus this is proposed / mapped /
 *              building / retired. **Not one capability anywhere is authored `healthy`.**
 *   RENDERED — `provenStatus(authored, verdict)`. This is what the map draws, and the ONLY source
 *              of green in it is a signed pass (ADR-0040).
 *
 * Reading the first column and concluding "there is no healthy story in this corpus" is the mistake
 * this file exists to prevent, and it is a mistake that would have sent this increment straight back
 * to inventing statuses.
 *
 * Run:  npx tsx docs/research/chapter2-healthy-island-2026-08-16/census_healthy.ts [--json <path>]
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPool, closePool } from '../../../packages/library/src/store/index.js';
import { PgWorkStore } from '../../../packages/orchestrator/src/store/index.js';
import { deriveVerdictGlyphs, readVerdictEvents } from '../../../packages/drive/src/index.js';
import { loadNodeSpec, type NodeSpec } from '../../../packages/orchestrator/src/node-spec.js';

import { asciiJson } from './ascii_json.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const STORIES = join(REPO, 'stories');

const ARGV = process.argv.slice(2);
const argOf = (n: string, f: string): string => {
  const i = ARGV.indexOf(n);
  const v = i >= 0 ? ARGV[i + 1] : undefined;
  return v === undefined ? f : v;
};
const JSON_OUT = argOf('--json', join(HERE, 'census.json'));

/** `apps/studio/src/lib/worldStatus.ts`, ported — see `emit_proof.ts` for why it is a port. */
const worldStatus = (s: string | null): string | null =>
  s === 'building' ? 'proposed' : s === 'unhealthy' ? 'mapped' : s;
const provenStatus = (s: string | null, outcome: string | undefined): string | null =>
  outcome === 'pass' ? 'healthy' : s === 'healthy' ? 'mapped' : worldStatus(s);

function storySpecIn(dir: string, id: string): NodeSpec | null {
  for (const name of [`${id}.md`, 'story.md', 'index.md']) {
    const f = join(dir, name);
    if (existsSync(f)) {
      try {
        const spec = loadNodeSpec(f);
        if (spec.tier === 'story') return spec;
      } catch {
        /* fall through to the scan */
      }
    }
  }
  for (const e of readdirSync(dir)) {
    if (!e.endsWith('.md')) continue;
    try {
      const spec = loadNodeSpec(join(dir, e));
      if (spec.tier === 'story') return spec;
    } catch {
      /* not the story spec */
    }
  }
  return null;
}

interface Row {
  story: string;
  storyStatus: string;
  /** `presentStories` filters `retired` at BOTH tiers — a retired story has no island at all
   *  (ADR-0038), so however green its capabilities are it is not a candidate surface. */
  rendersOnMap: boolean;
  caps: number;
  authoredHealthy: number;
  renderedHealthy: number;
  allGreen: boolean;
  /** allGreen AND the story is not retired — the actual candidate test. */
  candidate: boolean;
  quota: number;
  tests: number[];
  uatCriteria: number;
  renderedMix: Record<string, number>;
}

async function main(): Promise<void> {
  const { pool, connector } = await createPool();
  try {
    const events = await readVerdictEvents(new PgWorkStore(pool));
    if (events === null) throw new Error('the live store returned no verdict events — bring the DB up');
    const glyphs = deriveVerdictGlyphs(events);

    const rows: Row[] = [];
    for (const e of readdirSync(STORIES, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const dir = join(STORIES, e.name);
      const spec = storySpecIn(dir, e.name);
      if (!spec) continue;
      const caps = spec.capabilities
        .map((capId) => {
          const f = join(dir, `${capId}.md`);
          if (!existsSync(f)) return null;
          try {
            const cs = loadNodeSpec(f);
            const g = glyphs.get(capId);
            return {
              authored: cs.status,
              rendered: provenStatus(cs.status, g === '✓' ? 'pass' : g === '✗' ? 'fail' : undefined),
              tests: cs.contracts.length,
            };
          } catch {
            return null;
          }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      const mix: Record<string, number> = {};
      for (const c of caps) mix[String(c.rendered)] = (mix[String(c.rendered)] ?? 0) + 1;
      const allGreen = caps.length > 0 && caps.every((c) => c.rendered === 'healthy');
      const rendersOnMap = spec.status !== 'retired';
      rows.push({
        story: e.name,
        storyStatus: spec.status,
        rendersOnMap,
        caps: caps.length,
        authoredHealthy: caps.filter((c) => c.authored === 'healthy').length,
        renderedHealthy: caps.filter((c) => c.rendered === 'healthy').length,
        allGreen,
        candidate: allGreen && rendersOnMap,
        quota: Math.max(3, caps.length + 2),
        tests: caps.map((c) => c.tests),
        uatCriteria: spec.uatTestCriteria.filter((t) => !t.wouldBe).length,
        renderedMix: mix,
      });
    }

    rows.sort(
      (a, b) =>
        Number(b.candidate) - Number(a.candidate) ||
        b.renderedHealthy - a.renderedHealthy ||
        b.caps - a.caps,
    );

    const totalCaps = rows.reduce((s, r) => s + r.caps, 0);
    const totalAuthoredHealthy = rows.reduce((s, r) => s + r.authoredHealthy, 0);
    const totalRenderedHealthy = rows.reduce((s, r) => s + r.renderedHealthy, 0);

    console.log(
      `${rows.length} stories · ${totalCaps} capabilities · verdict events read ${events.length}\n` +
        `AUTHORED healthy: ${totalAuthoredHealthy}   RENDERED healthy (signed pass): ${totalRenderedHealthy}\n`,
    );
    console.log(
      'CAND  story                              caps  green  quota  uat  tests            renderedMix',
    );
    for (const r of rows) {
      const mark = r.candidate ? ' ✓  ' : r.allGreen ? ' r  ' : '    ';
      console.log(
        `${mark}  ${r.story.padEnd(34)} ${String(r.caps).padStart(4)}  ` +
          `${String(r.renderedHealthy).padStart(5)}  ${String(r.quota).padStart(5)}  ` +
          `${String(r.uatCriteria).padStart(3)}  ${`[${r.tests.join(',')}]`.padEnd(16)} ` +
          Object.entries(r.renderedMix)
            .map(([k, v]) => `${k} x${v}`)
            .join(', '),
      );
    }

    writeFileSync(
      JSON_OUT,
      `${asciiJson(
        {
          readAt: new Date().toISOString(),
          verdictEventsRead: events.length,
          fold: 'provenStatus — apps/studio/src/lib/worldStatus.ts (ADR-0040/0038/0296)',
          totals: {
            stories: rows.length,
            capabilities: totalCaps,
            authoredHealthy: totalAuthoredHealthy,
            renderedHealthy: totalRenderedHealthy,
            fullyGreenStories: rows.filter((r) => r.allGreen).map((r) => r.story),
            candidates: rows.filter((r) => r.candidate).map((r) => r.story),
            retiredButFullyGreen: rows.filter((r) => r.allGreen && !r.rendersOnMap).map((r) => r.story),
          },
          rows,
        },
      )}\n`,
    );
    console.log(`\n${JSON_OUT}`);
  } finally {
    await closePool(pool, connector);
  }
}

await main();
