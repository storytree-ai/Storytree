// capture-resting-view.mjs — the FITTED vs DESIGNED resting frame, measured off the shipped map.
//
// Run the studio (`pnpm studio:up`), then from `apps/studio`:  node scripts/capture-resting-view.mjs
//
// ⚠ IT READS THE DELIVERED CAMERA OFF THE DOM, never off the module that computed it. The number
// reported is the `scale(...)` the browser is actually drawing the map with, and the island sizes
// are `getBoundingClientRect()` on the rendered territories — so a change that computes a beautiful
// scale and fails to apply it is a FALL, not a pass. This is the same discipline
// `harness/projection-probe.ts` adopted after the shipped map's scale was once reported off a
// hand-copied transcription of the framing code rather than off the wire.
//
// The two arms differ ONLY in the `?restingView=fit` query param, so the same build, the same
// corpus and the same paint produce both pictures and the comparison isolates the framing.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.RESTING_VIEW_OUT ?? '../../docs/research/resting-view-2026-08-28';
mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 1600, height: 900 };
/** Refuse to report a framing measured on fewer islands than this. The live corpus is 35; the floor
 *  sits below it so a story landing or retiring does not red the instrument, and far above the 9
 *  that a mid-load capture produced. */
const MIN_ISLANDS = Number(process.env.RESTING_VIEW_MIN_ISLANDS ?? 30);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.error('  page error:', m.text().slice(0, 200)); });

/** Read the shipped camera transform straight off the DOM — the delivered scale, not a recomputation.
 *  `<g class="world-camera" transform="translate(tx ty) scale(s)">` is what the map actually draws with. */
async function measure(url, name) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('g.world-camera', { timeout: 60_000 });

  // ⚠ FAIL CLOSED ON A HALF-LOADED MAP. The corpus streams in, and the resting camera is recomputed
  // as it does — so a capture taken early reports a confident scale for a forest that is not there
  // yet. It bit on the first run of this script: the fitted arm measured 9 islands and reported a
  // scale 14% off its settled value, and nothing about the output said so. Wait for the island
  // count to stop moving, then REFUSE below a floor rather than publish the number.
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 120 && stable < 4; i++) {
    await page.waitForTimeout(500);
    const n = await page.evaluate(
      () => new Set([...document.querySelectorAll('[data-story-id]')].map((e) => e.getAttribute('data-story-id'))).size,
    );
    stable = n === last && n > 0 ? stable + 1 : 0;
    last = n;
  }
  if (last < MIN_ISLANDS) {
    throw new Error(
      `${name}: only ${last} islands settled (floor ${MIN_ISLANDS}) — the map never finished loading, ` +
        `so any framing measured here would be a number for a forest that is not on screen.`,
    );
  }
  // and one more frame for the settled camera's own layout effect
  await page.waitForTimeout(1000);
  const data = await page.evaluate(() => {
    const g = document.querySelector('g.world-camera');
    const t = g?.getAttribute('transform') ?? '';
    const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*scale\(([-\d.]+)\)/.exec(t);
    // every island's drawn bounding box, in CSS px, as the browser lays it out
    // One entry per island: the OUTERMOST element carrying each story id, measured by the browser's
    // own layout. Several nested nodes carry `data-story-id`, so taking the largest box per id is
    // what makes this the island rather than one parcel inside it.
    const byId = new Map();
    for (const el of document.querySelectorAll('[data-story-id]')) {
      const id = el.getAttribute('data-story-id');
      const r = el.getBoundingClientRect();
      const prev = byId.get(id);
      if (!prev || r.width * r.height > prev.w * prev.h) {
        byId.set(id, { id, w: r.width, h: r.height, x: r.x, y: r.y });
      }
    }
    const islands = [...byId.values()];
    return { transform: t, tx: m ? +m[1] : null, ty: m ? +m[2] : null, scale: m ? +m[3] : null, islands };
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return data;
}

const base = 'http://localhost:5173/#/';
const results = {};
results.fitted = await measure(`http://localhost:5173/?restingView=fit#/`, 'studio-fitted');
results.designed = await measure(base, 'studio-designed');
await browser.close();

for (const [k, v] of Object.entries(results)) {
  const n = v.islands.length;
  const ws = v.islands.map((i) => i.w).filter((w) => w > 0).sort((a, b) => a - b);
  const med = ws.length ? ws[Math.floor(ws.length / 2)] : null;
  const onScreen = v.islands.filter((i) => i.x + i.w > 0 && i.x < VIEWPORT.width && i.y + i.h > 0 && i.y < VIEWPORT.height);
  const xs = v.islands.flatMap((i) => [i.x, i.x + i.w]);
  const ys = v.islands.flatMap((i) => [i.y, i.y + i.h]);
  const drawnW = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const drawnH = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  console.log(`${k}: scale=${v.scale}  islands=${n}  medianIslandPx=${med?.toFixed(1)}  ` +
    `visible=${onScreen.length}/${n}  islandSpan=${drawnW.toFixed(0)}x${drawnH.toFixed(0)}  ` +
    `frameFill=${((Math.min(drawnW, VIEWPORT.width) * Math.min(drawnH, VIEWPORT.height)) / (VIEWPORT.width * VIEWPORT.height) * 100).toFixed(0)}%`);
}
console.log(JSON.stringify({ fittedScale: results.fitted.scale, designedScale: results.designed.scale, ratio: results.designed.scale / results.fitted.scale }, null, 2));
