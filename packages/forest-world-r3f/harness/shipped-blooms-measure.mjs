// shipped-blooms-measure.mjs — DRIVER for "whose signature is that?": three arms over one forest,
// each differing from the one before it in exactly one thing.
//
//   none        the map until 2026-08-31 — `blooms: 0` at both call sites, in terms
//   scattered   the count read and spent over the WHOLE map — the misreport the zero stood in for
//   attributed  the count spent per island (`dressMapFromKit`) — what ships now
//
// THE INCREMENT: `draw-the-uat-blooms-on-the-shipped-map` on `adopt-the-land-into-the-shipped-map-arc`.
//
// ⚠⚠ THE PICTURES ARE THE DELIVERABLE AND THE CENSUS IS THE PROOF, and it is that way round because
// the defect is invisible in a frame. A UAT bloom is one SIGNED criterion of one STORY (ADR-0226
// D4) — a claim about proof state, bound by ADR-0392 D5 / ADR-0398 D7 — and nothing about a
// rendered flower says whose signature it is. So this driver refuses on the CENSUS, never on the
// pixels: `attributed` must misattribute zero, and `scattered` must misattribute a lot, or the
// comparison is a picture of nothing.
//
// Reproduce (⚠ needs a real GPU):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5294 --strictPort
//   DISPLAY=:0 ST_BLOOM_URL=http://localhost:5294/shipped-blooms.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-blooms
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`harness/shipped-blooms-scene.ts`, `src/map-dressing.ts`);
// this starts a browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_BLOOM_URL'] ?? 'http://localhost:5294/shipped-blooms.html';
const OUT =
  process.env['ST_BLOOM_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-blooms-2026-08-31');
const ANGLE = process.env['ST_BLOOM_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_BLOOM_ALLOW_SOFTWARE'] === '1';

const DRESSINGS = ['none', 'scattered', 'attributed'];

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

/** ⚠ 5184 is the default every worktree's vite pins — two harnesses on one box would serve each
 *  other's pages, and the numbers would belong to whichever branch started first. */
if (URL_.includes(':5184/')) {
  fail('port 5184 is the shared worktree default — start vite on a free port.');
}

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    `--use-angle=${ANGLE}`,
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
const httpErrors = [];
page.on('response', (r) => {
  if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url()}`);
});

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForFunction(() => 'bloomRunner' in window, null, { timeout: 180_000 });
if (consoleErrors.length > 0) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);
if (httpErrors.length > 0) fail(`the page failed to load something:\n  ${httpErrors.join('\n  ')}`);

const identity = await page.evaluate(() => window.bloomRunner.identity());
if (identity.software && !ALLOW_SOFTWARE) {
  fail(
    `${identity.renderer} is a SOFTWARE rasteriser. Take this on the box with a discrete GPU. To ` +
      'develop the page here, set ST_BLOOM_ALLOW_SOFTWARE=1 — the run then stamps itself.',
  );
}

mkdirSync(OUT, { recursive: true });

const VIEWS = await page.evaluate(() => window.bloomRunner.views());
if (VIEWS.length === 0) fail('the page offers no frames to take');

const census = {};
const shots = {};
for (const dressing of DRESSINGS) {
  census[dressing] = await page.evaluate(([d]) => window.bloomRunner.census(d), [dressing]);
  shots[dressing] = {};
  for (const view of VIEWS) {
    const shot = await page.evaluate(
      ([d, v]) => window.bloomRunner.snapshot(d, v),
      [dressing, view.id],
    );
    shots[dressing][view.id] = {
      meshes: shot.meshes,
      placements: shot.placements,
      blooms: shot.blooms,
    };
    writeFileSync(
      join(OUT, `blooms-${dressing}-${view.id}.png`),
      Buffer.from(shot.png.split(',')[1], 'base64'),
    );
  }
}

await browser.close();

// ── THE REFUSALS. Each one is a way this comparison could look right and mean nothing.

// 1. NON-VACUITY: the forest must actually hold signatures, and must actually hold stories that
//    signed NONE. A crowd where every story signed everything cannot show a misattribution at all.
const signed = census['attributed'].signed;
if (signed === 0) fail('no story in this forest has signed anything — nothing to attribute');
if (census['scattered'].unsignedIslandsWearingFlowers === 0) {
  fail(
    'the scattered arm put no flower on an unsigned story, so this forest has no unsigned ' +
      'stories in it and the comparison could not have failed.',
  );
}

// 2. THE CLAIM. Attributed misattributes NOTHING and draws every signature the scene holds.
if (census['attributed'].misattributed !== 0) {
  fail(
    `the attributed arm misattributed ${census['attributed'].misattributed} flowers — the whole ` +
      'point of the island id is that this number is zero.',
  );
}
if (census['attributed'].undrawn !== 0) {
  fail(
    `the attributed arm left ${census['attributed'].undrawn} signatures undrawn — a map that ` +
      'attributes correctly and under-reports is still a map that under-reports.',
  );
}

// 3. THE CONTRAST. Scattered must misattribute a LOT, or the fix repaired nothing.
if (census['scattered'].misattributed === 0) {
  fail('the scattered arm misattributed nothing — then the per-island dressing bought nothing');
}

// 4. The `none` arm is the honest under-report it always was: no flower anywhere.
if (census['none'].drawn !== 0) fail(`the none arm drew ${census['none'].drawn} flowers`);
if (census['none'].undrawn !== signed) fail('the none arm must leave every signature undrawn');

// 5. A kit that failed to parse draws no props and produces a picture of bare land that says
//    nothing about why. Every arm must stand SOMETHING.
for (const dressing of DRESSINGS) {
  for (const view of VIEWS) {
    if (shots[dressing][view.id].meshes === 0) {
      fail(`${dressing} at ${view.id} drew ZERO meshes — the kit did not load`);
    }
  }
}

// ── THE REPORT.
console.log('');
console.log(`renderer: ${identity.vendor} — ${identity.renderer} · software=${identity.software}`);
console.log('');
console.log('the census — every PLACED flower attributed to the island it stands on');
console.log('arm          drawn  signed  MISATTRIBUTED  undrawn  stories wearing an unsigned flower');
for (const dressing of DRESSINGS) {
  const c = census[dressing];
  console.log(
    `${dressing.padEnd(12)} ${String(c.drawn).padStart(5)}  ${String(c.signed).padStart(6)}  ` +
      `${String(c.misattributed).padStart(13)}  ${String(c.undrawn).padStart(7)}  ` +
      `${String(c.unsignedIslandsWearingFlowers).padStart(6)}`,
  );
}
console.log('');
console.log('objects standing on each frame (the kit MERGES them, so `meshes` is a handful)');
console.log('arm          view           objects  flowers  meshes');
for (const dressing of DRESSINGS) {
  for (const view of VIEWS) {
    const s = shots[dressing][view.id];
    console.log(
      `${dressing.padEnd(12)} ${view.id.padEnd(13)}  ${String(s.placements).padStart(7)}  ` +
        `${String(s.blooms).padStart(7)}  ${String(s.meshes).padStart(6)}`,
    );
  }
}
console.log('');
for (const view of VIEWS) console.log(`  ${view.id.padEnd(13)} ${view.what}`);
console.log('');
console.log(`pictures: ${OUT}`);

writeFileSync(
  join(OUT, 'blooms-census.json'),
  `${JSON.stringify({ identity, census, shots }, null, 2)}\n`,
);
