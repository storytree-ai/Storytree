// A single question the two measurement arms cannot answer: is a drag on the LAND VIEW clean once
// the page is OLD? The instrument takes its 6-second idle/drag windows the moment the page goes
// quiet — and the cure moves that moment 22 s earlier, so the two arms' short windows sit at
// different ages and are not comparable. This holds the AGE fixed instead: land, wait, then watch.
import { chromium } from '@playwright/test';

const url = process.argv[2];
const ageMs = Number(process.argv[3] ?? 60000);
const WINDOW_MS = 6000;

const watchFrames = (ms) => new Promise((resolve) => {
  const deltas = []; let last = performance.now(); const until = last + ms;
  const tick = (now) => { deltas.push(now - last); last = now; if (now < until) requestAnimationFrame(tick); else resolve(deltas); };
  requestAnimationFrame(tick);
});

const cost = (d) => {
  const s = [...d].sort((a, b) => a - b);
  const late = d.filter((x) => x > 25).length;
  return { frames: d.length, median: s[Math.floor(s.length / 2)], worst: s.at(-1), late };
};
const row = (n, c) => `${n.padEnd(20)} frames ${String(c.frames).padStart(4)}  median ${c.median.toFixed(1)} ms  worst ${c.worst.toFixed(1)} ms  late ${c.late}/${c.frames}`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=gl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// ⚠ THE FLAG GOES ON THE REAL QUERY STRING, BEFORE THE HASH — the studio routes on the hash and its
// flag readers read `window.location.search`, so `#/tree?landView=1` mounts nothing at all. (The
// same trap `measure-land-view.mjs` names; this probe walked into it once.)
const target = new URL(url);
target.searchParams.set('landView', '1');
target.hash = '/tree';
await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 300000 });
// A mounted canvas that renders nothing looks exactly like a working one, so wait for a SIZED one.
await page.waitForFunction(
  () => {
    const c = document.querySelector('[data-testid="land-view"] canvas');
    return c instanceof HTMLCanvasElement && c.width > 0 && c.height > 0;
  },
  undefined,
  { timeout: 300000 },
);
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
if (/swiftshader|llvmpipe|software/i.test(renderer)) { console.error(`REFUSED: software rasteriser (${renderer})`); process.exit(1); }
console.log(`renderer  ${renderer}`);
console.log(`ageing the page ${ageMs} ms before watching anything`);
await page.waitForTimeout(ageMs);

console.log(row('idle, aged', cost(await page.evaluate(watchFrames, WINDOW_MS))));

const canvas = await page.$('[data-testid="land-view"] canvas');
const shotBefore = await canvas.screenshot();
const watch = page.evaluate(watchFrames, WINDOW_MS);
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
const until = Date.now() + WINDOW_MS;
for (let i = 0; Date.now() < until; i += 1) {
  const k = ((i * 7) % 120) - 60;
  await page.mouse.move(cx + k, cy + k / 2);
  await page.waitForTimeout(16);
}
await page.mouse.up();
const deltas = await watch;
const moved = !(await canvas.screenshot()).equals(shotBefore);
console.log(row('drag, aged', cost(deltas)));
console.log(`drag moved pixels: ${moved}${moved ? '' : '  ⚠ THE DRAG MOVED NOTHING — this row measures nothing'}`);
await browser.close();
