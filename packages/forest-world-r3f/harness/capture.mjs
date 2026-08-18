// capture.mjs — drives the live-render experiment's evidence page in headless Chromium,
// photographs it, and reads DELIVERED PIXELS back out of the canvases to prove the
// locked-palette claim on a real rasteriser rather than on the TypeScript that fed it.
//
// WHY PLAYWRIGHT AND NOT THE BROWSER PANE. `@playwright/test` is already an installed dev
// dependency of `apps/studio` with its Chromium cached on this box, and two existing repo
// scripts already drive it exactly this way (`apps/studio/scripts/comparative-capture.mjs`,
// `.../measure-camera-rasterisation.mjs`). The Browser pane serves the PRIMARY checkout,
// so from a worktree it photographs the wrong tree.
//
// THE HONEST LIMIT, STATED HERE BECAUSE IT BOUNDS ONE OF THE THREE QUESTIONS. Headless
// Chromium on this machine renders WebGL through ANGLE-on-SwiftShader — measured, not
// assumed: the renderer string comes back `SwiftShader driver` on every launch. That is
// SOFTWARE rasterisation. It delivers the same PIXELS a GPU would, so the palette proof
// and the detail comparison are sound; it says NOTHING about frame cost on the Adreno
// X1-85, so the ADR-0380 D2 hardware-floor question CANNOT be answered from here and is
// not answered below. Frame timings are recorded as a RELATIVE instrument only and are
// labelled as such in the report. Reporting a SwiftShader frame time as a D2 verdict would
// be exactly the class of error this arc has had to correct five times.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The authored palette comes from the SAME module the shader's GLSL ladder is generated
// from. A capture script holding its own copy of the palette would only ever prove that
// the two copies agree.
import { landPalette, statusFamilyOf } from '../src/palette-band.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../../docs/research/chapter2-live-render-2026-08-19');
const URL = process.env['ST_HARNESS_URL'] ?? 'http://localhost:5184/compare.html';

function fail(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'load' });

// Gate on the page's OWN settled signal, never a sleep.
await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 30_000 });

if (consoleErrors.length) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);

const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  if (!gl) return { ok: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ok: true,
    version: gl.getParameter(gl.VERSION),
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unavailable',
  };
});
if (!renderer.ok) fail('no WebGL context in the capture browser — nothing was rendered');

// --- the delivered-pixel readback -------------------------------------------------------
//
// Every canvas on the page, sampled through a 2D context so what is measured is the
// COMPOSITED result the eye sees, not the WebGL buffer before presentation.

const delivered = await page.evaluate(() => {
  const out = [];
  for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
    const w = canvas.width;
    const h = canvas.height;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const counts = new Map();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Only fully-opaque pixels are the plant. An edge pixel blended against a
      // transparent clear colour is a COMPOSITING artefact, not a colour the shader
      // chose, and counting it would condemn the palette for the compositor's arithmetic.
      if (data[i + 3] !== 255) continue;
      opaque++;
      const hex =
        '#' +
        data[i].toString(16).padStart(2, '0') +
        data[i + 1].toString(16).padStart(2, '0') +
        data[i + 2].toString(16).padStart(2, '0');
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    out.push({ w, h, opaque, colours: [...counts.entries()] });
  }
  return out;
});

if (delivered.length === 0) fail('the page drew no canvases at all');

const palette = new Set(landPalette());
let totalOpaque = 0;
let offPalette = 0;
const offenders = new Map();
const distinct = new Set();

for (const c of delivered) {
  totalOpaque += c.opaque;
  for (const [hex, n] of c.colours) {
    distinct.add(hex);
    if (!palette.has(hex)) {
      offPalette += n;
      offenders.set(hex, (offenders.get(hex) ?? 0) + n);
    }
  }
}

// NON-VACUITY, PER CANVAS — and the global form of this check was NOT enough.
//
// The first version asserted only that the PAGE delivered enough pixels. It passed at
// 45,836 opaque pixels and printed PALETTE CLOSED while six panels were blank: the browser
// caps simultaneous WebGL contexts near sixteen and had silently LOST the oldest ones. A
// lost canvas contributes zero pixels and zero colours, so it can never break a palette
// check — it can only make one pass for the wrong reason. The page is now drawn through a
// single shared context, and this per-canvas floor is what keeps that fixed: every panel
// must show its own plants, or the run refuses.
const blank = [];
for (let i = 0; i < delivered.length; i++) {
  // The floor is deliberately LOW, because the failure it exists to catch is exact: a lost
  // WebGL context delivers precisely ZERO. The smallest legitimate panel here is an 18x3
  // sprite rung carrying 17 opaque pixels for three whole plants — that is not a defect,
  // it is the finding. An earlier draft set this floor at 20 and condemned those four
  // panels; the floor was wrong, not the panels, and raising a floor until real evidence
  // passes is how an instrument stops measuring anything.
  if (delivered[i].opaque < 5) blank.push(`#${i} (${delivered[i].w}x${delivered[i].h})`);
}
if (blank.length) {
  fail(
    `${blank.length} of ${delivered.length} canvases delivered essentially nothing: ` +
      `${blank.join(', ')}. A blank canvas cannot fail a palette check, so this run would ` +
      'have reported a clean closure it never tested.',
  );
}

if (totalOpaque < 5000) {
  fail(
    `only ${totalOpaque} opaque pixels were delivered across ${delivered.length} canvases; ` +
      'the palette result would be vacuously clean',
  );
}

// --- frame timing: RELATIVE ONLY (see the header) ---------------------------------------

const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const deltas = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        deltas.push(now - last);
        last = now;
        if (++n < 40) requestAnimationFrame(tick);
        else resolve(deltas.slice(1));
      };
      requestAnimationFrame(tick);
    }),
);
const sorted = [...frames].sort((a, b) => a - b);
const p50 = sorted[Math.floor(sorted.length / 2)];

// --- the pictures -------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: join(OUT, 'live-vs-sprite.png'), fullPage: true });

const sections = await page.$$('section');
const names = ['delivered-size', 'zoom-ladder', 'magnified', 'detail-ladder', 'status-tokens'];
for (let i = 0; i < sections.length && i < names.length; i++) {
  await sections[i].screenshot({ path: join(OUT, `panel-${names[i]}.png`) });
}

// --- the report ---------------------------------------------------------------------------

const report = {
  capturedFrom: URL,
  webgl: {
    version: renderer.version,
    renderer: renderer.renderer,
    // The single most important caveat in this file.
    isSoftware: /swiftshader|llvmpipe|software/i.test(String(renderer.renderer)),
    note:
      'Headless Chromium on this box rasterises WebGL through SwiftShader (software). ' +
      'Delivered COLOURS are therefore trustworthy and frame COSTS are not — the ADR-0380 ' +
      'D2 hardware-floor question is NOT answered by this run and needs the owner on real hardware.',
  },
  // The MEASURED delivered pixel count per panel, which is evidence in its own right and
  // does NOT agree with the `w * h * fill` arithmetic. A 4.92x3 shrub under the 50-degree
  // camera delivers about FIVE pixels at 1 px/unit, not the ~13 the box arithmetic
  // predicts, because the tilt foreshortens the height and a mound does not fill its box.
  // Both numbers are reported; neither is quietly replaced by the other.
  perPanel: delivered.map((c, i) => ({ i, w: c.w, h: c.h, opaque: c.opaque })),
  palette: {
    authoredEntries: palette.size,
    canvases: delivered.length,
    opaquePixels: totalOpaque,
    distinctDeliveredColours: distinct.size,
    offPalettePixels: offPalette,
    offPaletteColours: [...offenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    foreignStatusReads: [...distinct]
      .filter((h) => palette.has(h))
      .map((h) => ({
        hex: h,
        family: statusFamilyOf({
          r: parseInt(h.slice(1, 3), 16),
          g: parseInt(h.slice(3, 5), 16),
          b: parseInt(h.slice(5, 7), 16),
        }),
      }))
      .filter((x) => x.family === null).length,
  },
  frameTiming: {
    samples: frames.length,
    p50Ms: Number(p50.toFixed(2)),
    meanMs: Number((frames.reduce((s, d) => s + d, 0) / frames.length).toFixed(2)),
    interpretation:
      'RELATIVE ONLY. Software rasteriser, static scene — this is the headless compositor ' +
      'present cadence, not a GPU-bound frame cost. Do not quote it as a D2 verdict.',
  },
};

writeFileSync(join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');

await browser.close();

console.log(`WebGL      : ${renderer.version} via ${renderer.renderer}`);
console.log(`software   : ${report.webgl.isSoftware}`);
console.log(`canvases   : ${delivered.length}`);
console.log(`opaque px  : ${totalOpaque}`);
console.log(`distinct   : ${distinct.size} delivered colours, ${palette.size} authored entries`);
console.log(`OFF-PALETTE: ${offPalette} px`);
if (offPalette > 0) {
  for (const [hex, n] of [...offenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`   ${hex}  ${n} px`);
  }
}
console.log(`frame p50  : ${report.frameTiming.p50Ms} ms (RELATIVE — software rasteriser)`);
console.log(offPalette === 0 ? 'PALETTE CLOSED ON THE GPU' : 'PALETTE BREACHED');
