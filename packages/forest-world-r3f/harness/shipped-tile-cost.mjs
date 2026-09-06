// shipped-tile-cost.mjs — the GPU's own clock over the tile page's arms: what the real map costs per
// frame on the derived tile at each spacing rung, against the map as it shipped, on the whole fitted
// forest and on the read island.
//
// The same instrument as `shipped-land-ratio-cost.mjs` (round-robin interleaved sweeps, two
// independent runs diffed row by row by `run-agreement.ts`), pointed at `shipped-tile.html`.
//
// ⚠⚠ THIS REPORTS AND DOES NOT GATE (ADR-0517 D4 / ADR-0520 D6). Every number moves because the
// forest's extent moves; the number is taken on the arc's named box (ADR-0505 D3), written beside
// the sheet and quoted in the debrief as a report. It does not pick the rung.
//
//   ST_TILE_URL=http://127.0.0.1:<port>/shipped-tile.html pnpm --filter @storytree/forest-world-r3f measure-tile-cost

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, median, spread } from './frame-budget.ts';
import { isInterleaved, roundRobinPlan } from './frame-cost.ts';
import { MIN_RUNS_FOR_AGREEMENT, runAgreement } from './run-agreement.ts';
import { SPACING_SHOTS } from './shipped-spacing-scene.ts';
import { TILE_EVIDENCE_DIR } from './shipped-tile-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_TILE_URL'] ?? 'http://localhost:5392/shipped-tile.html';
const OUT = process.env['ST_TILE_OUT'] ?? join(HERE, '..', '..', '..', 'docs', 'research', TILE_EVIDENCE_DIR);
const ANGLE = process.env['ST_TILE_ANGLE'] ?? 'gl';
const BATCH = 20;
const REPEATS = 5;
const RUNS = MIN_RUNS_FOR_AGREEMENT;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail("ST_TILE_URL points at 5184, the port every worktree's vite pins by default — a sibling worktree may own it.");
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', `--use-angle=${ANGLE}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.tileRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const { arms: ARMS, manifest } = await page.evaluate(() => ({ arms: window.tileRunner.arms(), manifest: window.tileRunner.manifest() }));
const CONTROL = manifest.control;
const SHIPPED = manifest.arms.find((a) => a.id !== CONTROL && a.spacing.ratio === manifest.shippedRatio)?.id;
if (SHIPPED === undefined) fail(`no arm carries the shipped ratio ${manifest.shippedRatio}`);
const CONFIGS = SPACING_SHOTS.flatMap((p) => ARMS.map((arm) => ({ arm, picture: p.picture, zoom: p.zoom })));
const keyOf = (c) => `${c.arm}|${c.picture}|${c.zoom}`;
const plan = roundRobinPlan(CONFIGS, REPEATS);
if (!isInterleaved(plan, CONFIGS)) {
  fail('the sweep plan is not interleaved — a thermal drift would land on one arm and read as its cost');
}

const warmAll = () =>
  page.evaluate(
    async ([configs]) => {
      const r = window.tileRunner;
      for (const c of configs) await r.cost({ ...c, batch: 1 });
      return true;
    },
    [CONFIGS],
  );
const sweep = async () =>
  page.evaluate(
    async ([plan_, batch]) => {
      const r = window.tileRunner;
      const out = [];
      for (const c of plan_) out.push(await r.cost({ ...c, batch }));
      return { id: r.identity(), samples: out };
    },
    [plan, BATCH],
  );

await warmAll();
const runs = [];
for (const _ of Array.from({ length: RUNS })) {
  void _;
  runs.push(await sweep());
}
await browser.close();

const id = runs[0].id;
if (id.software) {
  fail(`the renderer is a software rasterizer (${id.renderer}). A frame time off SwiftShader is not comparable to any committed figure on this arc.`);
}
for (const run of runs) {
  for (const s of run.samples) {
    if (!s.timerQueryAvailable) fail(`${s.arm}: no EXT_disjoint_timer_query_webgl2 — there is no GPU clock to read`);
    if (s.hidden) fail(`${s.arm}: the page was HIDDEN, which suspends rAF and throttles the compositor`);
  }
}

const rowsOf = (run) => {
  const rows = [];
  for (const c of CONFIGS) {
    const usable = run.samples.filter((s) => keyOf(s) === keyOf(c) && s.gpuMsPerFrame !== null).map((s) => s.gpuMsPerFrame);
    if (usable.length === 0) fail(`${keyOf(c)}: every sample was disjoint or untimed — nothing to quote`);
    rows.push({ key: keyOf(c), medianMs: median(usable), spreadMs: spread(usable) });
  }
  return rows;
};
const perRun = runs.map(rowsOf);
const agreement = runAgreement(perRun);
const quotable = (key) => !agreement.droppedKeys.includes(key);
const costOf = (key) => median(perRun.map((rows) => rows.find((r) => r.key === key).medianMs));
const spreadOf = (key) => median(perRun.map((rows) => rows.find((r) => r.key === key).spreadMs));
const drawnBy = (key) => runs[0].samples.find((s) => keyOf(s) === key);

const lines = [];
const say = (t) => {
  lines.push(t);
  console.log(t);
};
say(`renderer: ${id.vendor} — ${id.renderer}`);
say(`software=${id.software}`);
say(`plan: ${CONFIGS.length} configurations (${ARMS.length} arms × ${SPACING_SHOTS.length} pictures) x ${REPEATS} interleaved repeats x ${BATCH} frames per GPU query, ${RUNS} independent runs`);
say('');
say('⚠ THIS REPORTS AND DOES NOT GATE (ADR-0517 D4 / ADR-0520 D6): every number moves because the forest’s extent moves. It picks no rung.');
say('');
for (const p of SPACING_SHOTS) {
  const control = keyOf({ arm: CONTROL, ...p });
  say(`TILE FOOTPRINT — FRAME COST on the GPU's own clock, ${p.picture} @ ${p.zoom}`);
  say('arm                 calls       tris   ms/frame   spread   vs today    % of a 60Hz frame');
  for (const arm of ARMS) {
    const key = keyOf({ arm, ...p });
    const d = drawnBy(key);
    const ms = costOf(key);
    const delta = arm === CONTROL ? 0 : ms - costOf(control);
    say(
      `${arm.padEnd(19)} ${String(d.drawCalls).padStart(5)} ${String(d.triangles).padStart(10)} ` +
        `${ms.toFixed(4).padStart(10)} ${spreadOf(key).toFixed(4).padStart(8)} ` +
        `${(arm === CONTROL ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`).padStart(10)} ` +
        `${((ms / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1).padStart(8)}%` +
        (quotable(key) ? '' : '   ⚠ DROPPED — did not reproduce') +
        (arm === SHIPPED ? '   ← SHIPPED' : arm === CONTROL ? '   ← TODAY (before this landing)' : ''),
    );
  }
  say('');
}
say('DID IT REPRODUCE?');
say(`  ${agreement.prose}`);
for (const d of agreement.dropped) say(`  ⚠ ${d}`);
if (agreement.suspectIdentical) {
  say('  ⚠ every row was BIT-IDENTICAL across runs. For a GPU clock that is evidence the second');
  say('    sweep did not happen, not evidence of stability — do not quote these.');
}
say('');
const forestShipped = keyOf({ arm: SHIPPED, picture: 'forest', zoom: 'fit' });
const forestBefore = keyOf({ arm: CONTROL, picture: 'forest', zoom: 'fit' });
const shipped = costOf(forestShipped);
const before = costOf(forestBefore);
say('WHAT IT MEANS FOR THE BUDGET (16.67 ms at 60 Hz):');
say(`  the SHIPPED picture (${SHIPPED}) draws the whole real map, fitted, in ${shipped.toFixed(4)} ms — ${((shipped / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a frame.`);
say(`  against the layout as it stood (${CONTROL}) that is ${shipped - before >= 0 ? '+' : ''}${(shipped - before).toFixed(4)} ms (${(shipped / before).toFixed(2)}x).`);
say('  ⚠ THIS IS THE GPU’S DRAW COST FOR THIS SCENE AND NOTHING ELSE — not the site’s frame time.');
writeFileSync(join(OUT, 'frame-cost.txt'), `${lines.join('\n')}\n`, 'utf8');
writeFileSync(
  join(OUT, 'frame-cost.json'),
  `${JSON.stringify({ id, plan: { configs: CONFIGS, repeats: REPEATS, batch: BATCH, runs: RUNS }, runs, agreement }, null, 2)}\n`,
  'utf8',
);
console.log(`\nwrote ${join(OUT, 'frame-cost.txt')} and frame-cost.json`);
if (agreement.status === 'SINGLE_RUN' || agreement.status === 'NO_RUNS') {
  console.error(`\n⚠ ${agreement.status}: a reproducibility claim needs ${MIN_RUNS_FOR_AGREEMENT} runs.`);
  process.exit(4);
}
