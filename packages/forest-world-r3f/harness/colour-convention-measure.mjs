// colour-convention-measure.mjs — THE DRIVER FOR THE COLOUR GUARD'S RUNTIME LEG.
//
// Reproduce:
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5209
//   DISPLAY=:0 ST_CONVENTION_URL=http://localhost:5209/colour-convention.html \
//     pnpm --filter @storytree/forest-world-r3f measure-convention
//
// ⚠ THIS FILE IS A SHELL ON PURPOSE. It is `.mjs`, so it is NOT typechecked — `tsconfig.json`
// covers `src` and `harness`, and only `.ts`/`.tsx` in them. Every number and every verdict is
// computed in `texture-convention.ts` and `colour-convention-scene.ts`, which ARE typechecked;
// this only starts a browser, reads a report and decides the exit code
// (`measurement-instrument-must-be-typechecked`).
//
// ⚠ `DISPLAY=:0` MUST BE IN THE ENVIRONMENT EVEN HEADLESS, and the flags must be angle/gl.
// Without either, Chromium falls back to SwiftShader SILENTLY — and a software rasteriser's
// colour pipeline is not the one the guard is about. The renderer string is read out of the live
// context and the run refuses.
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so the default port is a port a
// sibling worktree may own. This refuses it.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_CONVENTION_URL'] ?? 'http://localhost:5209/colour-convention.html';
const OUT = process.env['ST_CONVENTION_OUT'] ?? '';

function fail(msg) {
  console.error(`\nREFUSED: ${msg}\n`);
  process.exit(1);
}

if (/:5184\b/.test(URL_) && !process.env['ST_CONVENTION_ALLOW_DEFAULT_PORT']) {
  fail(
    `${URL_} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_CONVENTION_URL.',
  );
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

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const response = await page.goto(URL_, { waitUntil: 'load', timeout: 60_000 }).catch((e) => {
  fail(`could not reach ${URL_} — ${e}`);
});
if (response && response.status() >= 400) fail(`${URL_} answered ${response.status()}`);

await page
  .waitForFunction(
    () => window.__stConventionReady === true || typeof window.__stConventionError === 'string',
    null,
    { timeout: 120_000 },
  )
  .catch(async () => {
    await browser.close();
    fail(`${URL_} never became ready — the page did not finish its run`);
  });

const error = await page.evaluate(() => window.__stConventionError ?? null);
if (error) {
  await browser.close();
  fail(`the page threw: ${error}`);
}

const report = await page.evaluate(() => window.__stConvention);
await browser.close();

if (consoleErrors.length) fail(`the page logged console errors:\n  ${consoleErrors.join('\n  ')}`);
if (!report) fail('the page published no report');

const pad = (s, n) => String(s).padEnd(n);
const rgb = (c) => `(${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)})`;

console.log('');
console.log(`renderer   ${report.renderer}   [${report.vendor}]`);
console.log(
  `calibrated white probe ${report.calibration.probe.toFixed(4)} -> x${report.calibration.scale.toFixed(3)} ` +
    `(ladder ${report.calibration.floor}..${report.calibration.target})`,
);
console.log('');
console.log(
  `${pad('material', 22)}${pad('verdict', 17)}${pad('delivered', 16)}${pad('raw ctl', 16)}${pad('managed ctl', 16)}${pad('sep', 8)}map`,
);
for (const m of report.materials) {
  console.log(
    `${pad(m.material, 22)}${pad(m.verdict, 17)}${pad(rgb(m.delivered), 16)}${pad(rgb(m.rawControl), 16)}` +
      `${pad(rgb(m.managedControl), 16)}${pad(m.separation.toFixed(2) + 'x', 8)}${m.mapWidth}x${m.mapHeight}`,
  );
  if (!m.ok) console.log(`  -> ${m.detail}`);
}
for (const r of report.refusals) console.log(`REFUSED  ${r}`);
console.log('');

if (OUT) {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, 'colour-convention.json');
  writeFileSync(path, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`wrote ${path}`);
}

if (!report.ok) {
  fail(
    'the textured-asset colour convention is BROKEN on this surface. A base-colour map decoded ' +
      'as sRGB renders about 3.5x dark and reads as a deliberate art choice — route the loader ' +
      'through applyRawColourConvention() in texture-convention.ts.',
  );
}

console.log(`CONVENTION HELD across ${report.materials.length} material(s).`);
console.log(`(${HERE})`);
