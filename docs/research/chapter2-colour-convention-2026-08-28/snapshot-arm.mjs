// One-shot evidence snapshotter: the same page, the same arm, the same camera, in whatever
// convention the checkout is currently in. Two runs of this, with one line mutated between
// them, are the whole comparison.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const URL_ = process.env.SNAP_URL;
const OUT = process.env.SNAP_OUT;
const TAG = process.env.SNAP_TAG;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(URL_, { waitUntil: 'load', timeout: 60_000 });
await page.waitForFunction(() => window.__stPineReady === true, null, { timeout: 60_000 });
const id = await page.evaluate(() => window.__stPineIdentity());
if (/swiftshader|llvmpipe/i.test(id.renderer)) throw new Error(`software rasteriser: ${id.renderer}`);
const out = { renderer: id.renderer, arms: [] };
for (const pxPerUnit of [2, 8]) {
  const url = await page.evaluate(
    (px) => window.__stPineSnapshot({ variant: 'gltf', pxPerUnit: px, width: 1440, height: 960, batch: 1 }),
    pxPerUnit,
  );
  const file = join(OUT, `${TAG}-${pxPerUnit}px.png`);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  out.arms.push({ pxPerUnit, file });
}
await browser.close();
if (errs.length) throw new Error(`page errors: ${errs.join('; ')}`);
console.log(JSON.stringify(out, null, 1));
