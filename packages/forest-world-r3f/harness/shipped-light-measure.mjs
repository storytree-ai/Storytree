// shipped-light-measure.mjs — DRIVER for the shipped map's COLOUR PIPELINE: a three-rung ladder in
// which each rung differs from the one before it in exactly one thing.
//
//   app-today    the shipped canvas as it drew on 2026-08-30 — R3F's default ACES + sRGB, no probe
//   exact        + exact-colour mode — the transfer the approved reference render was taken in
//   exact-probe  + the measured light calibration — a lit white face lands on the ladder's top rung
//
// THE INCREMENT: `cross-the-light-calibration-probe` on `adopt-the-land-into-the-shipped-map-arc`.
// It was parked to cross ONE thing — the probe — on the premise that the shipped crowns read
// lighter than `chapter2-vocabulary-2026-08-29/island-kit-8px.png` because a `MeshStandardMaterial`
// carries a specular term the authored arithmetic does not model. The DIRECTION of that premise
// holds and its MECHANISM does not: the dominant term is the transfer function itself, and the
// probe could not honestly cross without it, because `target / probe` is a one-shot solve that is
// exact only where the delivered value is linear in intensity.
//
// ⚠⚠ EACH PIPELINE IS ITS OWN PAGE LOAD, and that is a correctness requirement rather than tidiness.
// `THREE.ColorManagement.enabled` is a GLOBAL that a `Color` reads when it is CONSTRUCTED, so a
// material built before a flip keeps the conversion it was built with. Flipping mid-run would give
// an arm some colours from one pipeline and some from another, and the picture would look
// perfectly ordinary.
//
// Reproduce (⚠ needs a real GPU — the refusals below are `shipped-land-measure.mjs`'s):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5262 --strictPort
//   DISPLAY=:0 ST_LIGHT_URL=http://localhost:5262/shipped-land.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-light
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`shipped-land-scene.ts`, `src/light-calibration.ts`); this
// starts a browser, walks three page loads and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { LAND_PIPELINES, LAND_PIPELINE_SPECS, LAND_ZOOMS } from './shipped-land-scene.ts';
import { SHADE_LEVELS } from '../src/shade-ladder.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_LIGHT_URL'] ?? 'http://localhost:5232/shipped-land.html';
const OUT =
  process.env['ST_LIGHT_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-light-2026-08-31');
const ANGLE = process.env['ST_LIGHT_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_LIGHT_ALLOW_SOFTWARE'] === '1';

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

const TARGET = SHADE_LEVELS[SHADE_LEVELS.length - 1];
const rows = [];
let identity = null;

for (const pipeline of LAND_PIPELINES) {
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

  const url = `${URL_}?pipeline=${pipeline}&only=dressed`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => 'landRunner' in window, null, { timeout: 120_000 });
  if (consoleErrors.length > 0) {
    fail(`${pipeline}: the page logged errors:\n  ${consoleErrors.join('\n  ')}`);
  }
  if (httpErrors.length > 0) {
    fail(`${pipeline}: the page failed to load something:\n  ${httpErrors.join('\n  ')}`);
  }

  const id = await page.evaluate(() => window.landRunner.identity());
  if (identity === null) identity = id;
  if (id.renderer !== identity.renderer) {
    fail(`the renderer changed between pipelines: ${identity.renderer} then ${id.renderer}`);
  }
  if (id.software && !ALLOW_SOFTWARE) {
    fail(
      `${id.renderer} is a SOFTWARE rasteriser. Take this on the box with a discrete GPU. To ` +
        'develop the colour half here, set ST_LIGHT_ALLOW_SOFTWARE=1 — the run then stamps itself.',
    );
  }

  const probed = await page.evaluate(() => window.landRunner.pipeline());
  // ⚠ THE GROUND, HASHED, BEFORE ANYTHING ELSE. The safety claim of this whole increment is that
  // moving the canvas's transfer function does not move one ground pixel, so the map still reports
  // exactly what it reported (ADR-0392 D5 / ADR-0398 D7). Measured across page loads, not argued.
  const ground = {};
  const palette = {};
  for (const zoom of LAND_ZOOMS) {
    ground[zoom] = await page.evaluate(([z]) => window.landRunner.digest('shadow', z), [zoom]);
    palette[zoom] = await page.evaluate(([z]) => window.landRunner.offPalette('shadow', z), [zoom]);
  }
  const props = {};
  for (const zoom of LAND_ZOOMS) {
    props[zoom] = await page.evaluate(
      ([z]) => window.landRunner.props('shadow', z),
      [zoom],
    );
    const shot = await page.evaluate(
      ([z]) => window.landRunner.snapshotDressed('shadow', z),
      [zoom],
    );
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, `dressed-${pipeline}-${zoom}px.png`),
      Buffer.from(shot.png.split(',')[1], 'base64'),
    );
    if (shot.props === 0) {
      fail(
        `${pipeline} at ${zoom}px drew ZERO props. A kit that failed to parse produces a picture ` +
          'identical to the bare island and says nothing about why.',
      );
    }
  }
  rows.push({ pipeline, probed, ground, palette, props });
  await page.close();
}

await browser.close();

// ── THE REFUSALS. Each one is a way this comparison could look right and mean nothing.

const byPipeline = new Map(rows.map((r) => [r.pipeline, r]));

// 1. The three pipelines must actually be three different renderer states. An axis whose rungs
//    all configure the same thing is a comparison of a thing with itself.
const states = new Set(
  rows.map((r) =>
    [r.probed.outputColorSpace, r.probed.toneMapping, r.probed.colorManagement].join('|'),
  ),
);
if (states.size !== 2) {
  // `exact` and `exact-probe` share a renderer state on purpose — they differ in the LIGHTS.
  fail(`expected two distinct renderer states across the ladder, saw ${states.size}`);
}
if (byPipeline.get('exact').probed.scale !== 1) fail('`exact` must run no probe');
if (byPipeline.get('app-today').probed.scale !== 1) fail('`app-today` must run no probe');
if (byPipeline.get('exact-probe').probed.scale === 1) fail('`exact-probe` must apply a correction');

// 2. THE CLAIM. In exact-colour mode the one-shot solve lands on the ladder's top rung. That is
//    what "the props are on the same range as the ground" means, and it is the whole increment.
const probe = byPipeline.get('exact-probe').probed;
const missed = Math.abs(probe.delivered - TARGET);
if (missed > 1.5 / 255) {
  fail(
    `the calibration aimed at ${TARGET} and delivered ${probe.delivered.toFixed(4)} — a one-shot ` +
      'solve that misses is not a calibration, and this ladder exists to say so.',
  );
}

// 3. NON-VACUITY: the pipelines must deliver DIFFERENT PROP pictures. A comparison in which every
//    arm draws the same frame proves the axis reached nothing.
for (const zoom of LAND_ZOOMS) {
  const means = rows.map((r) => r.props[zoom].mean.map((v) => Math.round(v)).join(','));
  if (new Set(means).size !== rows.length) {
    fail(`at ${zoom}px two pipelines delivered the same mean prop colour (${means.join(' / ')})`);
  }
}

// 4. ⚠⚠ AND THE OTHER HALF OF THE SAME COIN — THE GROUND MUST NOT MOVE AT ALL. This is the claim
//    that makes the change safe rather than merely nicer: the land's colour IS a capability's
//    status, so a transfer-function change that moved a ground pixel would be changing what the
//    map REPORTS, which is the one direction this surface may not be wrong in.
for (const zoom of LAND_ZOOMS) {
  const digests = new Set(rows.map((r) => r.ground[zoom]));
  if (digests.size !== 1) {
    fail(
      `at ${zoom}px the GROUND differs between pipelines (${[...digests].join(' / ')}). The banded ` +
        'material is a raw ShaderMaterial and gets neither a tone-mapping nor a colour-space chunk ' +
        'from three, so it must deliver identical bytes in all three — if it does not, this change ' +
        'is moving what the map reports about proof state, not only how it looks.',
    );
  }
  for (const { pipeline, palette } of rows) {
    if (palette[zoom].count !== 0) {
      fail(
        `${pipeline} at ${zoom}px delivered ${palette[zoom].count} off-palette ground pixels ` +
          `(${palette[zoom].colours.slice(0, 6).join(' ')})`,
      );
    }
    if (palette[zoom].landPixels === 0) {
      fail(`${pipeline} at ${zoom}px drew no land — a blank frame is off-palette-free too`);
    }
  }
}

// ── THE REPORT.
console.log('');
console.log(`renderer: ${identity.vendor} — ${identity.renderer} · software=${identity.software}`);
console.log(`ladder top rung: ${TARGET}`);
console.log('');
console.log('pipeline      outputColorSpace  toneMapping  colourMgmt  probe    scale     delivered');
for (const { pipeline, probed } of rows) {
  console.log(
    `${pipeline.padEnd(13)} ${String(probed.outputColorSpace).padEnd(17)} ` +
      `${String(probed.toneMapping).padEnd(12)} ${String(probed.colorManagement).padEnd(11)} ` +
      `${probed.probe.toFixed(4)}   ${probed.scale.toFixed(4).padStart(8)}  ${probed.delivered.toFixed(4)}`,
  );
}
console.log('');
console.log('the delivered PROP pixels — every pixel the bought kit adds to the bare island');
console.log('pipeline      zoom  changed    mean rgb            saturated  crushed');
for (const { pipeline, props } of rows) {
  for (const zoom of LAND_ZOOMS) {
    const p = props[zoom];
    const mean = p.mean.map((v) => v.toFixed(1).padStart(5)).join(' ');
    console.log(
      `${pipeline.padEnd(13)} ${String(zoom).padStart(4)}  ${String(p.changed).padStart(7)}  ` +
        `${mean}   ${String(p.saturated).padStart(9)}  ${String(p.black).padStart(7)}`,
    );
  }
}
console.log('');
console.log('the GROUND, hashed — identical across the ladder is the safety claim');
for (const { pipeline, ground, palette } of rows) {
  for (const zoom of LAND_ZOOMS) {
    console.log(
      `${pipeline.padEnd(13)} ${String(zoom).padStart(4)}px  ${ground[zoom]}  ` +
        `${palette[zoom].landPixels} land px · ${palette[zoom].count} off-palette · ` +
        `${palette[zoom].distinctLand} distinct of ${palette[zoom].authored} authored`,
    );
  }
}
console.log('');
for (const spec of LAND_PIPELINE_SPECS) {
  console.log(
    `  ${spec.pipeline.padEnd(13)} ${spec.from === null ? '' : `(on top of ${spec.from}) `}${spec.adds}`,
  );
}
console.log('');
console.log(`pictures: ${OUT}`);

writeFileSync(
  join(OUT, 'light-pipeline.json'),
  `${JSON.stringify({ identity, target: TARGET, rows }, null, 2)}\n`,
);
