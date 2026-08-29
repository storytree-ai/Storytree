// kit-island-measure.mjs — DRIVER for the whole-island kit dressing.
//
// Reproduce:
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5210
//   DISPLAY=:0 ST_KIT_URL=http://localhost:5210/kit-island.html \
//     pnpm --filter @storytree/forest-world-r3f measure-kit-island
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked — `tsconfig.json` covers only
// `.ts`/`.tsx` under `src` and `harness`. Every number is computed in the typechecked modules
// (`kit-vocabulary.ts`, `kit-scene.ts`, `kit-island-scene.ts`, `frame-budget.ts`); this starts a
// browser, interleaves a sweep and decides an exit code
// (`measurement-instrument-must-be-typechecked`).
//
// ⚠ `DISPLAY=:0` MUST BE SET EVEN HEADLESS and the flags must be angle/gl, or Chromium falls
// back to SwiftShader SILENTLY. Every frame figure here would then be a software rasteriser's.
//
// ⚠ IT REFUSES, rather than reporting, on: a software renderer · no `EXT_disjoint_timer_query`
// (falling back to a wall clock is not an option after PR #1683, which found the previous
// instrument wrong by 30-250x because it timed SUBMISSION rather than EXECUTION) · the pinned
// default port every worktree shares · a console error or an HTTP >= 400 · a kit arm that put
// nothing on the island that the bare arm did not · a non-interleaved sweep.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, frameBudgetVerdict, median, spread } from './frame-budget.ts';
import { KIT_ARMS, ZOOMS } from './kit-island-scene.ts';
import { SHADE_LEVELS } from './palette-band.ts';

/**
 * THE SMALLEST DIFFERENCE THE LAND ITSELF CAN EXPRESS, in bytes — the reference every texture-rung
 * delta is read against.
 *
 * ⚠ IT IS THE PROJECT'S OWN NUMBER, NOT A PERCEPTUAL ONE. The banded material quantises onto
 * `SHADE_LEVELS`, so the tightest pair of rungs (0.78 and 0.80) is the finest step any ground
 * pixel beside these props is allowed to take. A texture rung whose pixels move by less than that
 * is moving by less than the land's own resolution, which is a claim this repo can check rather
 * than a threshold someone chose.
 */
const LADDER_STEP_BYTES = (() => {
  let step = Infinity;
  for (let i = 1; i < SHADE_LEVELS.length; i++) step = Math.min(step, SHADE_LEVELS[i] - SHADE_LEVELS[i - 1]);
  return step * 255;
})();

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_KIT_URL'] ?? 'http://localhost:5210/kit-island.html';
const OUT =
  process.env['ST_KIT_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-kit-island-2026-08-28');

const REPEATS = Number(process.env['ST_KIT_REPEATS'] ?? 7);
// ⚠ 300, NOT 20, AND THE NUMBER WAS FORCED BY THE INSTRUMENT REFUSING. At a batch of 20 the
// overview zoom reported the DRESSED island (89,067 triangles, 38 draw calls, a bigger buffer) as
// measurably FASTER than the bare one — 0.06 ms against 0.11 — repeatably. Adding work cannot
// subtract cost, and `frame-budget.ts` said so rather than publishing it: UNVERIFIED, with the
// advice to raise the batch until the effect clears the noise. At 300 the ordering is monotone at
// both zooms. The refusal is why this number is 300; it was not tuned to make an answer come out.
const BATCH = Number(process.env['ST_KIT_BATCH'] ?? 300);
/** The texture rungs the sweep compares. The middle one is what gets committed. */
// Only the COMMITTED rung by default: the others are not in the repo (the kit is ~900 MB and
// lives on the owner's box), so a default sweep would fail on any fresh checkout. Regenerate them
// with `export-dressing.py` and pass ST_KIT_RUNGS=512,256,128 to re-run the comparison.
const RUNGS = (process.env['ST_KIT_RUNGS'] ?? '').split(',').map(Number).filter((n) => n > 0);
const COMMITTED_RUNG = Number(process.env['ST_KIT_COMMITTED_RUNG'] ?? 128);
// ⚠ THE MAIN RUN LOADS THE COMMITTED ASSET BY ITS COMMITTED NAME. It used to load
// `dressing-webp90-<rung>.glb`, which is the EXPORT's filename and is not in the repo — so the
// driver could only run on a box that had just re-exported the kit, and a fresh checkout got a
// 404 dressed up as an empty island. The rung sweep still opens rung files by name, and is now
// opt-in (`ST_KIT_RUNGS`) because which rung is right was settled by measurement in PR #1693.
const KIT_ASSET = process.env['ST_KIT_ASSET'] ?? '/assets/dressing-kit.glb';

function fail(msg) {
  console.error(`\nREFUSED: ${msg}\n`);
  process.exit(1);
}

if (/:5184\b/.test(URL_) && !process.env['ST_KIT_ALLOW_DEFAULT_PORT']) {
  fail(`${URL_} is the harness's pinned default port, which every worktree shares. Use a free one.`);
}

const GPU_ARGS = [
  '--use-gl=angle',
  '--use-angle=gl',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });

/** Open the page against one texture rung and hand back a driveable handle. */
async function openPage(kitUrl) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const target = kitUrl ? `${URL_}?kit=${encodeURIComponent(kitUrl)}` : URL_;
  const response = await page.goto(target, { waitUntil: 'load', timeout: 120_000 }).catch((e) => {
    fail(`could not reach ${target} — ${e}`);
  });
  if (response && response.status() >= 400) fail(`${target} answered ${response.status()}`);

  await page
    .waitForFunction(() => window.__stKitReady === true || typeof window.__stKitError === 'string', null, {
      timeout: 180_000,
    })
    .catch(async () => {
      await browser.close();
      fail(`${target} never became ready`);
    });

  const err = await page.evaluate(() => window.__stKitError ?? null);
  if (err) {
    await browser.close();
    fail(`the page threw: ${err}`);
  }
  return { page, consoleErrors, target };
}

function pngOf(dataUrl) {
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// ------------------------------------------------------------------ the committed rung's run

const main = await openPage(KIT_ASSET);
const identity = await main.page.evaluate(() => window.__stKitIdentity());
if (identity.software || /swiftshader|llvmpipe|software/i.test(identity.renderer)) {
  await browser.close();
  fail(
    `rendered by ${identity.renderer}, a software rasteriser — every frame figure here would be ` +
      'a verdict about the CPU. Check DISPLAY=:0 is set; without it these flags fall back silently.',
  );
}
if (!identity.timerQuery) {
  await browser.close();
  fail(
    'EXT_disjoint_timer_query_webgl2 is absent, so there is no GPU clock. Falling back to a wall ' +
      'clock is not an option after PR #1683 — it timed submission, not execution, and was wrong ' +
      'by 30-250x.',
  );
}

const payload = await main.page.evaluate(() => window.__stKitPayload());

// ---- the pictures, and the presence floor read off a control in the same run
const frames = {};
for (const zoom of ZOOMS) {
  for (const arm of KIT_ARMS) {
    frames[`${arm}@${zoom}`] = await main.page.evaluate(
      ([a, z]) => window.__stKitSnapshot(a, z),
      [arm, zoom],
    );
    writeFileSync(join(OUT, `island-${arm}-${zoom}px.png`), pngOf(frames[`${arm}@${zoom}`]));
  }
}

const presence = [];
for (const zoom of ZOOMS) {
  const readings = {};
  for (const arm of KIT_ARMS) {
    readings[arm] = await main.page.evaluate(([a, z]) => window.__stKitColours(a, z), [arm, zoom]);
  }
  // ⚠ THE BAR IS READ OFF THE OTHER TWO ARMS IN THE SAME RUN, never chosen here. Every banded
  // material quantises onto four authored rungs, so a banded island delivers a handful of
  // colours however much stands on it; a textured one delivers thousands. A kit arm that drew
  // nothing would land on the bare arm's count and be measured as a very cheap island.
  // The textured arm must deliver at least four times the count of the richest BANDED arm. Four
  // rather than two because a `MeshStandardMaterial` shades continuously whether or not its maps
  // bound (PR #1686's surviving mutation), so a modest multiple is reachable without texturing.
  // What settles that question properly is the colour-convention probe on the same asset; this
  // floor only refuses an arm that drew nothing at all.
  // Over EVERY banded arm, not two named ones: `land` joined them on 2026-08-29 and a bar that
  // named its siblings by hand would have silently stopped covering the richest of them.
  const banded = KIT_ARMS.filter((a) => a !== 'kit');
  const bar = Math.max(...banded.map((a) => readings[a].distinct)) * 4;
  presence.push({
    zoom,
    bare: readings.bare.distinct,
    today: readings.today.distinct,
    land: readings.land.distinct,
    kit: readings.kit.distinct,
    bar,
    ok: readings.kit.distinct >= bar,
  });
}

// ---- THE PLACEMENT'S OWN VERDICT, and the asset the pure tests placed against.
//
// ⚠ BOTH OF THESE ARE REFUSALS RATHER THAN NUMBERS IN A TABLE. The overlap is the defect the
// owner reported by eye ("the rocks are appearing where the trees are"); a run that photographed
// an island with props inside each other and printed a count would be handing him the same
// picture again with a footnote. And the footprint check is what ties the pure tests to the
// asset: they place at a frozen table because they have no GPU to load a kit with, so a
// re-export that changed a tree's proportions would move every placement while every node test
// kept passing.
if (payload.overlaps.length > 0) {
  const worst = payload.overlaps
    .slice(0, 6)
    .map((o) => `${o.a} / ${o.b} by ${(-o.gap).toFixed(2)} units`)
    .join('\n  ');
  fail(
    `${payload.overlaps.length} pair(s) of props stand closer than their own footprints allow:\n  ${worst}`,
  );
}
if (payload.footprintDrift.length > 0) {
  fail(`the loaded kit disagrees with the frozen footprints:\n  ${payload.footprintDrift.join('\n  ')}`);
}
// ⚠ A LEAF TINT ROTATES HUE AND MAY NOT CHANGE VALUE (ADR-0475 D1). The delivered-pixel half of
// that is the colour guard's; this is the arithmetic half, checked here so a picture is never
// taken through a tint that darkens — which is the one thing indistinguishable by eye from the
// colour convention breaking.
for (const [material, tints] of Object.entries(payload.tintsByMaterial)) {
  for (const t of tints) {
    if (Math.abs(t.lumaRatio - 1) > 0.01) {
      fail(`${material}'s ${t.status} tint delivers ${t.lumaRatio.toFixed(3)}x the map's own value`);
    }
  }
}

// ---- the frame cost, interleaved. The cold start is paid once, outside the sweep.
await main.page.evaluate(() => window.__stKitWarm());
const plan = [];
for (let r = 0; r < REPEATS; r++) {
  for (const zoom of ZOOMS) for (const arm of KIT_ARMS) plan.push({ arm, zoom, repeat: r });
}
// ⚠ INTERLEAVED, NOT GROUPED. Grouping repeats by configuration aliases GPU drift onto the
// variable: the last arm measured would carry every thermal or clock change of the whole sweep.
const samples = new Map();
let disjoint = 0;
for (const step of plan) {
  const reading = await main.page.evaluate(
    ([a, z, b]) => window.__stKitTime(a, z, b),
    [step.arm, step.zoom, BATCH],
  );
  const key = `${step.arm}@${step.zoom}`;
  if (!samples.has(key)) samples.set(key, { readings: [], meta: reading });
  if (reading.gpuNs === null) disjoint++;
  else samples.get(key).readings.push(reading.gpuNs / 1e6);
}

const frame = [];
for (const [key, entry] of samples) {
  const [arm, zoom] = key.split('@');
  const ms = median(entry.readings);
  frame.push({
    arm,
    pxPerUnit: Number(zoom),
    kept: entry.readings.length,
    of: REPEATS,
    medianMs: ms,
    spreadMs: spread(entry.readings),
    pctOf60Hz: (ms / FRAME_BUDGET_60HZ_MS) * 100,
    drawCalls: entry.meta.drawCalls,
    triangles: entry.meta.triangles,
    width: entry.meta.width,
    height: entry.meta.height,
  });
}

// ⚠ THE BUDGET VERDICT IS ONE JUDGEMENT OVER ALL THE ROWS AT A ZOOM, with the BARE island as
// the baseline — not a per-row test. `frame-budget.ts` refuses a set with no positive control,
// because without one there is no delta to attribute a dressing's cost to.
const budget = {};
for (const zoom of ZOOMS) {
  const rows = KIT_ARMS.map((arm) => ({
    label: arm,
    samples: samples.get(`${arm}@${zoom}`)?.readings ?? [],
    software: identity.software,
    hidden: false,
  }));
  const verdict = frameBudgetVerdict({ rows, baselineLabel: 'bare' });
  budget[zoom] = {
    status: verdict.status,
    prose: verdict.prose,
    failures: verdict.failures,
    unverified: verdict.unverified,
  };
}

// ------------------------------------------------------------------ is the committed rung right?

const rungs = [];
for (const rung of RUNGS) {
  const handle = rung === COMMITTED_RUNG ? main : await openPage(`/assets/dressing-webp90-${rung}.glb`);
  const shots = {};
  for (const zoom of ZOOMS) {
    shots[zoom] =
      rung === COMMITTED_RUNG
        ? frames[`kit@${zoom}`]
        : await handle.page.evaluate(([z]) => window.__stKitSnapshot('kit', z), [zoom]);
  }
  const p = rung === COMMITTED_RUNG ? payload : await handle.page.evaluate(() => window.__stKitPayload());
  rungs.push({ rung, wireBytes: p.wireBytes, gpuBytes: p.gpuBytes, shots });
  if (handle !== main) {
    if (handle.consoleErrors.length) fail(`the ${rung} rung logged console errors`);
    await handle.page.close();
  }
}

// Each rung is compared against the NEXT ONE UP, at both zooms: what does the extra rung buy?
const rungDiffs = [];
for (let i = 1; i < rungs.length; i++) {
  const higher = rungs[i - 1];
  const lower = rungs[i];
  for (const zoom of ZOOMS) {
    const d = await main.page.evaluate(
      async ([a, b, step]) => {
        const load = (src) =>
          new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = src;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const draw = (img) => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, img.width, img.height).data;
        };
        const da = draw(ia);
        const db = draw(ib);
        let differing = 0;
        let sum = 0;
        let maxDelta = 0;
        let overStep = 0;
        for (let k = 0; k < da.length; k += 4) {
          const dr = Math.abs(da[k] - db[k]);
          const dg = Math.abs(da[k + 1] - db[k + 1]);
          const dbb = Math.abs(da[k + 2] - db[k + 2]);
          const worst = Math.max(dr, dg, dbb);
          if (worst > 0) {
            differing++;
            sum += (dr + dg + dbb) / 3;
            if (worst > step) overStep++;
          }
          if (worst > maxDelta) maxDelta = worst;
        }
        return {
          differing,
          total: da.length / 4,
          // ⚠ THE MEAN OVER THE PIXELS THAT MOVED, and the worst single one. A mean over the
          // WHOLE frame divides a real difference by an island of unchanged ground and reports
          // 0.05 of a byte, which reads as "no difference" for any change however large.
          meanDeltaOverDiffering: differing > 0 ? sum / differing : 0,
          maxDelta,
          overStep,
        };
      },
      [higher.shots[zoom], lower.shots[zoom], LADDER_STEP_BYTES],
    );
    rungDiffs.push({
      from: higher.rung,
      to: lower.rung,
      zoom,
      differingPct: (d.differing / d.total) * 100,
      meanDeltaOverDiffering: d.meanDeltaOverDiffering,
      maxDelta: d.maxDelta,
      overLadderStepPct: (d.overStep / d.total) * 100,
      savedWireBytes: higher.wireBytes - lower.wireBytes,
      savedGpuBytes: higher.gpuBytes - lower.gpuBytes,
    });
  }
}

if (main.consoleErrors.length) fail(`the page logged console errors:\n  ${main.consoleErrors.join('\n  ')}`);
await browser.close();

// ------------------------------------------------------------------ report

const report = {
  url: URL_,
  renderer: identity.renderer,
  vendor: identity.vendor,
  timerQuery: identity.timerQuery,
  repeats: REPEATS,
  batch: BATCH,
  disjointDiscarded: disjoint,
  committedRung: COMMITTED_RUNG,
  payload,
  presence,
  frame,
  budget,
  rungs: rungs.map((r) => ({ rung: r.rung, wireBytes: r.wireBytes, gpuBytes: r.gpuBytes })),
  rungDiffs,
};
writeFileSync(join(OUT, 'kit-island.json'), `${JSON.stringify(report, null, 1)}\n`);

const pad = (s, n) => String(s).padEnd(n);
console.log('');
console.log(`renderer   ${identity.renderer}`);
console.log(`payload    ${payload.wireBytes} B on the wire · ${payload.gpuBytes} B on the GPU · ` +
  `${payload.distinctObjects} distinct assemblies · ${payload.totalProps} props placed`);
console.log('');
console.log(
  `${pad('role', 14)}${pad('count', 8)}${pad('h (units)', 12)}${pad('w (units)', 12)}${pad('sized by', 9)}` +
    `${pad('px@2', 8)}${pad('px@8', 8)}${pad('floor', 8)}signal`,
);
for (const r of payload.roles) {
  console.log(
    `${pad(r.role, 14)}${pad(r.count, 8)}${pad(r.worldHeight.toFixed(1), 12)}${pad(r.worldWidth.toFixed(1), 12)}` +
      `${pad(r.sizedBy, 9)}${pad(r.deliveredPx['2px'].toFixed(0), 8)}${pad(r.deliveredPx['8px'].toFixed(0), 8)}` +
      `${pad(r.clearsFloor ? 'yes' : 'NO', 8)}${r.signal}`,
  );
}
console.log('');
console.log(`census     ${Object.entries(payload.census).map(([k, v]) => `${k} x${v}`).join(' · ')}`);
console.log(
  `placement  ${payload.overlaps.length} overlapping pair(s) · footprints ` +
    Object.entries(payload.footprints).map(([k, v]) => `${k} ${v.toFixed(2)}u`).join(' · '),
);
for (const [material, tints] of Object.entries(payload.tintsByMaterial)) {
  const mean = payload.leafMeans[material];
  console.log(
    `tints      ${material} mean (${mean.r.toFixed(0)},${mean.g.toFixed(0)},${mean.b.toFixed(0)}) -> ` +
      tints
        .map(
          (t) =>
            `${t.status} ${t.token} delivers (${t.delivered.r.toFixed(0)},${t.delivered.g.toFixed(0)},` +
            `${t.delivered.b.toFixed(0)}) at value x${t.lumaRatio.toFixed(3)}`,
        )
        .join(' · '),
  );
}

console.log('');
console.log(`${pad('arm', 10)}${pad('zoom', 8)}${pad('median ms', 12)}${pad('spread', 10)}${pad('% 60Hz', 10)}${pad('calls', 8)}${pad('tris', 10)}kept`);
for (const f of frame.sort((a, b) => a.pxPerUnit - b.pxPerUnit || a.arm.localeCompare(b.arm))) {
  console.log(
    `${pad(f.arm, 10)}${pad(f.pxPerUnit, 8)}${pad(f.medianMs.toFixed(3), 12)}${pad(f.spreadMs.toFixed(3), 10)}` +
      `${pad(f.pctOf60Hz.toFixed(2) + '%', 10)}${pad(f.drawCalls, 8)}${pad(f.triangles, 10)}${f.kept}/${f.of}`,
  );
}
console.log('');
for (const zoom of ZOOMS) {
  console.log(`frame budget @${zoom}px  ${budget[zoom].status} — ${budget[zoom].prose}`);
  for (const f of budget[zoom].failures) console.log(`  FAIL  ${f}`);
  for (const u of budget[zoom].unverified) console.log(`  UNVERIFIED  ${u}`);
}
console.log('');
for (const p of presence) {
  console.log(
    `presence @${p.zoom}px  distinct colours: bare ${p.bare} · today ${p.today} · land ${p.land} · ` +
      `kit ${p.kit} (bar ${p.bar})  ${p.ok ? 'OK' : 'REFUSED'}`,
  );
}
console.log('');
console.log(
  `${pad('rung', 16)}${pad('zoom', 8)}${pad('pixels differ', 16)}${pad('mean delta*', 14)}${pad('max delta', 12)}` +
    `${pad('over ladder', 14)}${pad('wire saved', 14)}gpu saved`,
);
for (const d of rungDiffs) {
  console.log(
    `${pad(`${d.from}->${d.to}`, 16)}${pad(d.zoom, 8)}${pad(d.differingPct.toFixed(2) + '%', 16)}` +
      `${pad(d.meanDeltaOverDiffering.toFixed(2), 14)}${pad(d.maxDelta, 12)}` +
      `${pad(d.overLadderStepPct.toFixed(2) + '%', 14)}${pad(d.savedWireBytes, 14)}${d.savedGpuBytes}`,
  );
}
console.log('  * mean delta is over the DIFFERING pixels only — over the whole frame an island of');
console.log('    unchanged ground divides any real difference down to nothing.');
console.log(
  `  "over ladder" is the share of the frame moving by more than ${LADDER_STEP_BYTES.toFixed(1)} bytes — the` +
    ' smallest step the land\'s own SHADE_LEVELS can express.',
);
console.log('');
console.log(`wrote ${join(OUT, 'kit-island.json')}`);

const failures = presence.filter((p) => !p.ok);
if (failures.length) {
  fail(
    `the kit arm delivered too few distinct colours at ${failures.map((f) => f.zoom).join(', ')} px/unit ` +
      'to have drawn a textured dressing at all. An arm that drew nothing would be measured as a ' +
      'very cheap island and reported as a very fast one.',
  );
}
const overBudget = ZOOMS.filter((z) => budget[z].status === 'FAIL');
if (overBudget.length) fail(`the island is over the 60 Hz frame budget at ${overBudget.join(', ')} px/unit`);
if (disjoint > plan.length / 3) {
  fail(`${disjoint} of ${plan.length} samples were disjoint — the GPU was interrupted too often to time`);
}
console.log('OK.');
