// shipped-shadow-measure.mjs — DRIVER for "the shadow at forest scale": four arms over one
// forest, differing only in how the ground occlusion field is allocated.
//
//   clamped     the map as it ships — ONE field over the forest rect, resolution clamped
//   raised      A — the same field with the texture cap lifted until the authored resolution lands
//   per-island  B — one field, one material and one draw call PER ISLAND
//   atlas       C — ONE field packed over the islands themselves; one material, one draw call
//
// THE INCREMENT: `the-forest-shadow-field-goes-coarse-at-scale` on
// `adopt-the-land-into-the-shipped-map-arc`. It was parked as a FORK — the increment says in terms
// "cost options A and B (and the union-rect third) against the same instrument, at both zooms, on
// the Mint box, two runs, with pictures — and put the fork to the owner if the numbers do not
// settle it". This is that instrument.
//
// ⚠⚠ THE REFUSALS ARE WHERE THIS PAGE'S HONESTY LIVES, and two of them exist because of a trap
// this arc has already fallen into. A contact pool is ~24 ground units across, so at the overview
// zoom it is sub-pixel and every arm renders the same bytes — a comparison that CANNOT come back
// negative. So the driver refuses unless the pool is wide enough to photograph at the zoom it is
// comparing at, AND unless the remedies actually move pixels there.
//
// Reproduce (⚠ needs a real GPU — every committed frame figure comes off the Mint box):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5296 --strictPort
//   DISPLAY=:0 ST_SHADOW_URL=http://localhost:5296/shipped-shadow.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-shadow
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`harness/shipped-shadow-scene.ts`, `src/shadow-atlas.ts`,
// `src/land-shadow.ts`); this starts a browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_SHADOW_URL'] ?? 'http://localhost:5296/shipped-shadow.html';
const OUT =
  process.env['ST_SHADOW_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-shadow-2026-08-31');
const ANGLE = process.env['ST_SHADOW_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_SHADOW_ALLOW_SOFTWARE'] === '1';
const BATCH = Number(process.env['ST_SHADOW_BATCH'] ?? '30');
const REPEATS = Number(process.env['ST_SHADOW_REPEATS'] ?? '5');

const ARMS = ['clamped', 'raised', 'per-island', 'atlas'];
const REMEDIES = ['raised', 'per-island', 'atlas'];
/** The ground with NO occlusion field — not a fifth option, the DENOMINATOR. See the runner's
 *  own note: a pool is a small part of a 2560 x 1600 frame, so "0.3% of the frame changed" reads
 *  as nothing while the two pictures beside it are visibly different objects. */
const REFERENCE = 'none';
const PICTURE_ARMS = [REFERENCE, ...ARMS];
const SIZES = ['one', 'forest'];
/** The arc's two zooms, the CLOSE one the comparison actually turns on, and the FITTED one — the
 *  only zoom at which the whole forest is on screen, and therefore the only one at which the
 *  per-island arm's thirty-five draw calls actually happen. */
const ZOOMS = [2, 8, 20, 'fit'];
const CLOSE_ZOOM = 20;
const FIT = 'fit';
/** Ground units across a contact pool — the sizing number the pixel check below rests on. */
const POOL_GROUND_WIDTH = 24;
/** The authored resolution, in samples per ground unit. Spelled here so a change to it has to be
 *  looked at rather than absorbed: the whole increment is about not delivering it. */
const AUTHORED_GRES = 3;

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
await page.waitForFunction(() => 'shadowRunner' in window, null, { timeout: 300_000 });
if (consoleErrors.length > 0) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);
if (httpErrors.length > 0) fail(`the page failed to load something:\n  ${httpErrors.join('\n  ')}`);

const identity = await page.evaluate(() => window.shadowRunner.identity());
const maxTextureSize = await page.evaluate(() => window.shadowRunner.maxTextureSize());
if (identity.software && !ALLOW_SOFTWARE) {
  fail(
    `${identity.renderer} is a SOFTWARE rasteriser. Take this on the box with a discrete GPU. To ` +
      'develop the page here, set ST_SHADOW_ALLOW_SOFTWARE=1 — the run then stamps itself.',
  );
}

mkdirSync(OUT, { recursive: true });

// ── THE SWEEP.

/** Median of a list, which is what a frame figure should be: one hitched frame moves a mean and
 *  moves a median not at all. */
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const readings = {};
for (const size of SIZES) {
  readings[size] = {};
  for (const zoom of ZOOMS) {
    readings[size][zoom] = {};
    for (const arm of ARMS) {
      const samples = [];
      let base = null;
      for (let r = 0; r < REPEATS; r += 1) {
        const one = await page.evaluate(
          ([a, s, z, b]) => window.shadowRunner.time(a, s, z, b),
          [arm, size, zoom, BATCH],
        );
        base = one;
        if (one.gpuNs !== null) samples.push(one.gpuNs);
      }
      readings[size][zoom][arm] = {
        ...base,
        gpuNs: samples.length > 0 ? median(samples) : null,
        samples: samples.length,
        spreadNs: samples.length > 1 ? Math.max(...samples) - Math.min(...samples) : 0,
      };
    }
  }
}

// ── THE PIXEL COMPARISONS. Every remedy against the control, at every zoom and size — and the
//    SHADOW'S OWN FOOTPRINT, which is what the differences have to be read against.

const changed = {};
const shadowPx = {};
const movedPx = {};
for (const size of SIZES) {
  changed[size] = {};
  shadowPx[size] = {};
  movedPx[size] = {};
  for (const zoom of ZOOMS) {
    changed[size][zoom] = {};
    shadowPx[size][zoom] = {};
    movedPx[size][zoom] = {};
    for (const arm of ARMS) {
      shadowPx[size][zoom][arm] = await page.evaluate(
        ([a, s, z]) => window.shadowRunner.shadowPixels(a, s, z),
        [arm, size, zoom],
      );
    }
    for (const arm of REMEDIES) {
      changed[size][zoom][arm] = await page.evaluate(
        ([a, s, z]) => window.shadowRunner.changedPct('clamped', a, s, z),
        [arm, size, zoom],
      );
      movedPx[size][zoom][arm] = await page.evaluate(
        ([a, s, z]) => window.shadowRunner.changedPixels('clamped', a, s, z),
        [arm, size, zoom],
      );
    }
  }
}

// ── THE PICTURES. Both sizes at 8 and at the close zoom; the forest only at 2.

const shots = [];
for (const [size, zoom] of [
  ['forest', FIT],
  ['forest', 2],
  ['forest', 8],
  ['forest', CLOSE_ZOOM],
  ['one', 8],
  ['one', CLOSE_ZOOM],
]) {
  for (const arm of PICTURE_ARMS) {
    const png = await page.evaluate(
      ([a, s, z]) => window.shadowRunner.snapshot(a, s, z),
      [arm, size, zoom],
    );
    const name = `shadow-${size}-${zoom}px-${arm}.png`;
    writeFileSync(join(OUT, name), Buffer.from(png.split(',')[1], 'base64'));
    shots.push(name);
  }
}

await browser.close();

const at = (size, zoom, arm) => readings[size][zoom][arm];

// ── THE REFUSALS. Each one is a way this comparison could look right and mean nothing.

// 1. NON-VACUITY: the control must ACTUALLY be clamped at forest scale, or there is nothing here
//    to remedy and every row below is a picture of a solved problem.
const control = at('forest', 8, 'clamped');
if (!(control.gres < AUTHORED_GRES)) {
  fail(
    `the clamped arm delivered ${control.gres} samples/unit at forest scale — the authored ` +
      `${AUTHORED_GRES} — so the defect this page exists to compare against is not present.`,
  );
}

// 2. EVERY REMEDY MUST ACTUALLY REMEDY. A remedy that costs memory and delivers the same coarse
//    field is worse than the control, and would otherwise sit in the table looking like an option.
for (const arm of REMEDIES) {
  const r = at('forest', 8, arm);
  if (r.gres !== AUTHORED_GRES) {
    fail(`the ${arm} arm delivered ${r.gres} samples/unit at forest scale, not ${AUTHORED_GRES}`);
  }
}

// 3. THE PIXEL CHECK — the trap this page is built around. The pool has to be wide enough to
//    photograph at the zoom being compared, AND the remedies have to move pixels there. Either
//    check alone is satisfied by a comparison that could not have failed.
const poolPx = POOL_GROUND_WIDTH * CLOSE_ZOOM;
if (poolPx < 24) {
  fail(`a contact pool is ${poolPx} delivered px at the close zoom — too small to falsify anything`);
}
for (const arm of REMEDIES) {
  if (changed['forest'][CLOSE_ZOOM][arm] <= 0) {
    fail(
      `${arm} rendered the forest BYTE-IDENTICALLY to the clamped control at ${CLOSE_ZOOM} px per ` +
        'ground unit. Either it is not doing anything, or the frame does not contain a shadow.',
    );
  }
}

// 3b. THE INCREMENT'S OWN CLAIM, MEASURED: the pool SHRINKS under the clamp. The increment says
//     "the contact pool under a story tree goes from a soft round shadow to a shrunken, jagged
//     blob"; the first half of that is a number and this is it. It refuses only on the two arms
//     drawing the SAME footprint, because that would mean the clamp costs nothing at all.
const clampedFootprint = shadowPx['forest'][CLOSE_ZOOM]['clamped'];
const authoredFootprint = shadowPx['forest'][CLOSE_ZOOM]['atlas'];
if (clampedFootprint === authoredFootprint) {
  fail(
    `the clamped and authored fields both cover ${clampedFootprint} px at ${CLOSE_ZOOM} px/unit — ` +
      'then the resolution clamp changes nothing a reader can see and there is no defect here.',
  );
}
if (authoredFootprint === 0) {
  fail('the authored-resolution arm casts NO shadow in this frame — the comparison is of nothing');
}

// 4. THE CONTROL THAT SAYS THE REMEDY IS NARROW: on ONE island nothing was wrong, and every arm
//    must leave it essentially as it is. `essentially` rather than `exactly` is measured rather
//    than conceded — the atlas reaches its sample through a different multiply-add, so a texel on
//    a shadow's own edge can land the other side of the material's threshold. What may not happen
//    is a VISIBLE change, and 1% of a frame is far past that.
for (const arm of REMEDIES) {
  const pct = changed['one'][CLOSE_ZOOM][arm];
  if (pct > 1) {
    fail(
      `${arm} changed ${pct.toFixed(3)}% of the ONE-ISLAND frame at ${CLOSE_ZOOM} px/unit. A ` +
        'single island is already at the authored resolution, so a remedy must not repaint it.',
    );
  }
}

// 5. THE DRAW-CALL CLAIM, MEASURED AT THE ZOOM WHERE IT HAPPENS.
//
//    ⚠⚠ THIS PAGE FOUND SOMETHING THE INCREMENT DID NOT ANTICIPATE, and it is why the check is
//    written this way. Thirty-five meshes have thirty-five bounding spheres, so three FRUSTUM-CULLS
//    them: at 8 px per ground unit the per-island arm submits ONE draw, because only one island is
//    on screen. A check that asserted "planned meshes equal submitted draws" would have failed the
//    honest result. So the arm's cost is asserted where it is actually paid — the fitted zoom,
//    the only frame with the whole forest in it.
for (const arm of ['clamped', 'raised', 'atlas']) {
  for (const zoom of ZOOMS) {
    if (at('forest', zoom, arm).drawCalls !== 1) {
      fail(`${arm} submitted ${at('forest', zoom, arm).drawCalls} draw calls at ${zoom} — must be ONE`);
    }
  }
}
const perIslandFit = at('forest', FIT, 'per-island');
if (perIslandFit.drawCalls !== perIslandFit.meshes) {
  fail(
    `the per-island arm planned ${perIslandFit.meshes} meshes and submitted ${perIslandFit.drawCalls} ` +
      'with the WHOLE forest on screen — then it is not the arm it claims to be',
  );
}
//    And the culling really is what the low number at 8 px/unit is, rather than a broken scene:
//    fewer draws AND fewer triangles, together.
const perIslandClose = at('forest', 8, 'per-island');
if (!(perIslandClose.drawCalls < perIslandFit.drawCalls)) {
  fail('the per-island arm submitted as many draws zoomed in as fitted — nothing was culled');
}
if (!(perIslandClose.trianglesSubmitted < at('forest', 8, 'atlas').trianglesSubmitted)) {
  fail(
    'the per-island arm submitted as many TRIANGLES as a one-mesh arm at 8 px/unit — then the ' +
      'draw-call difference above is not culling and this reading is not what it looks like.',
  );
}

// 6. THE HARDWARE FLOOR ON ARM A. Raising the cap is only an OPTION on a machine whose texture
//    limit covers it. This does not fail the run — it is a finding about the arm — but a run whose
//    `raised` frames were never actually uploaded would be reporting a picture of nothing.
const raisedEdge = at('forest', 8, 'raised').widestEdge;
if (raisedEdge > maxTextureSize) {
  fail(
    `the raised arm needs a ${raisedEdge}-texel edge and this renderer's MAX_TEXTURE_SIZE is ` +
      `${maxTextureSize} — the arm could not have been uploaded, so its frames are not evidence.`,
  );
}

// ── THE REPORT.

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const ms = (ns) => (ns === null ? '   n/a' : (ns / 1e6).toFixed(4));

console.log('');
console.log(`renderer: ${identity.vendor} — ${identity.renderer} · software=${identity.software}`);
console.log(`MAX_TEXTURE_SIZE: ${maxTextureSize} · batch=${BATCH} · repeats=${REPEATS}`);
console.log('');
console.log('WHAT EACH ARM ALLOCATES on the 35-island forest');
console.log('arm         samples/unit  textures   texture MB  widest edge  meshes  vertex MB');
for (const arm of ARMS) {
  const r = at('forest', 8, arm);
  console.log(
    `${arm.padEnd(11)} ${r.gres.toFixed(3).padStart(12)}  ${String(r.textures).padStart(8)}  ` +
      `${mb(r.textureBytes).padStart(10)}  ${String(r.widestEdge).padStart(11)}  ` +
      `${String(r.meshes).padStart(6)}  ${mb(r.attributeBytes).padStart(9)}`,
  );
}

console.log('');
console.log('TOTAL DELIVERED COST — texture plus the vertex data the arm adds');
console.log('arm         total MB   vs clamped');
const clampedTotal = at('forest', 8, 'clamped');
const totalOf = (r) => r.textureBytes + r.attributeBytes;
for (const arm of ARMS) {
  const r = at('forest', 8, arm);
  const ratio = totalOf(r) / totalOf(clampedTotal);
  console.log(`${arm.padEnd(11)} ${mb(totalOf(r)).padStart(8)}   ${ratio.toFixed(2)}x`);
}

console.log('');
console.log('WHAT THE RENDERER ACTUALLY SUBMITTED — ⚠ one mesh has ONE bounding sphere, so the');
console.log('one-mesh arms submit the WHOLE forest at every zoom; per-island gets culled.');
console.log('size    zoom  arm          draws   triangles submitted');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ARMS) {
      const r = at(size, zoom, arm);
      console.log(
        `${size.padEnd(7)} ${String(zoom).padStart(4)}  ${arm.padEnd(11)} ${String(r.drawCalls).padStart(5)}   ` +
          `${String(r.trianglesSubmitted).padStart(19)}`,
      );
    }
  }
}

console.log('');
console.log('FRAME COST — median GPU ms per render, 1280x800, both sizes');
console.log('size    zoom  arm          frame ms   spread ms  px/unit  draws  runs');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ARMS) {
      const r = at(size, zoom, arm);
      console.log(
        `${size.padEnd(7)} ${String(zoom).padStart(4)}  ${arm.padEnd(11)} ${ms(r.gpuNs).padStart(9)}   ` +
          `${ms(r.spreadNs).padStart(9)}  ${r.pxPerUnit.toFixed(2).padStart(7)}  ` +
          `${String(r.drawCalls).padStart(5)}  ${String(r.samples).padStart(4)}`,
      );
    }
  }
}

console.log('');
console.log('⚠⚠ THE SHADOW\'S OWN FOOTPRINT — pixels differing from the SAME ground with no field');
console.log('at all. This is the denominator: the pool is a small part of the frame, so a whole-');
console.log('frame percentage reads as "nothing changed" for a visibly different picture.');
console.log('size    zoom  none  clamped   raised  per-island    atlas   clamped vs authored');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const p = shadowPx[size][zoom];
    const ratio = p['atlas'] === 0 ? 0 : p['clamped'] / p['atlas'];
    console.log(
      `${size.padEnd(7)} ${String(zoom).padStart(4)}     0  ${String(p['clamped']).padStart(7)}  ` +
        `${String(p['raised']).padStart(7)}  ${String(p['per-island']).padStart(10)}  ` +
        `${String(p['atlas']).padStart(7)}   ${(ratio * 100).toFixed(1).padStart(6)}%`,
    );
  }
}

console.log('');
console.log('⚠⚠ HOW MUCH OF THE SHADOW EACH REMEDY MOVES — differing pixels as a % of the shadow');
console.log('itself, which is the honest reading of the whole-frame figures printed under it.');
console.log('size    zoom   raised   per-island    atlas');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const m = movedPx[size][zoom];
    const base = shadowPx[size][zoom];
    const pct = (arm) => {
      const denom = Math.max(base['clamped'], base[arm]);
      return denom === 0 ? 0 : (m[arm] / denom) * 100;
    };
    console.log(
      `${size.padEnd(7)} ${String(zoom).padStart(4)}  ${pct('raised').toFixed(1).padStart(6)}%  ` +
        `${pct('per-island').toFixed(1).padStart(10)}%  ${pct('atlas').toFixed(1).padStart(6)}%`,
    );
  }
}

console.log('');
console.log('HOW MUCH OF THE FRAME EACH REMEDY MOVES — % of pixels differing from `clamped`');
console.log('⚠ a pool is 24 ground units across; the px column is how wide that is at this zoom');
console.log('size    zoom  pool px   raised   per-island    atlas');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const c = changed[size][zoom];
    const pool = POOL_GROUND_WIDTH * at(size, zoom, 'clamped').pxPerUnit;
    console.log(
      `${size.padEnd(7)} ${String(zoom).padStart(4)}  ${pool.toFixed(1).padStart(7)}   ` +
        `${c['raised'].toFixed(3).padStart(6)}   ${c['per-island'].toFixed(3).padStart(10)}   ` +
        `${c['atlas'].toFixed(3).padStart(6)}`,
    );
  }
}

console.log('');
console.log('OCCLUDED FRACTION of each arm\'s own field — ⚠ NOT comparable across arms:');
console.log('the rect forms\' denominator is mostly sea, so the SAME shadows read smaller there.');
console.log('arm         one island   forest');
for (const arm of ARMS) {
  console.log(
    `${arm.padEnd(11)} ${(at('one', 8, arm).occlusionCoverage * 100).toFixed(3).padStart(9)}%  ` +
      `${(at('forest', 8, arm).occlusionCoverage * 100).toFixed(3).padStart(7)}%`,
  );
}

console.log('');
console.log(`pictures: ${OUT}`);
for (const name of shots) console.log(`  ${name}`);

writeFileSync(
  join(OUT, 'shadow-remedies.json'),
  `${JSON.stringify(
    { identity, maxTextureSize, batch: BATCH, repeats: REPEATS, readings, changed, shadowPx, movedPx },
    null,
    2,
  )}\n`,
);
