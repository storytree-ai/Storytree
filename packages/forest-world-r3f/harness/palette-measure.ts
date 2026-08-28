// palette-measure.ts — THE BEFORE/AFTER PICTURE OF THE SHIPPED GROUND+CROWN PALETTE, at both
// zooms, taken off the REAL `src/ForestWorldCanvas.tsx` on a named renderer.
//
// THE INCREMENT: `the-shipped-canvas-third-status-palette` on
// `adopt-the-land-into-the-shipped-map-arc`. The shipped canvas carried a private six-colour
// "spike palette, not art direction" that disagreed with every land-colour decision this project
// has made — `mapped` BLUE where ADR-0470 settled a tilled clay, `unhealthy` BROWN where the
// decision says a charred near-black, `building` still owning a periwinkle after ADR-0462 merged
// it into `proposed`'s yellow. It is now split into a decided `GROUND_COLOUR` and a decided
// `CROWN_COLOUR`. This driver is the argument: a map that says `mapped` in blue, beside one that
// says it in clay.
//
// ⚠⚠ HOW THE "BEFORE" ARM IS PRODUCED, AND WHY IT IS NOT A PROP. There is no `palette` toggle on
// `ForestWorldCanvas` and this increment adds none — a shipped component gaining a switch so its
// own evidence page can photograph the state it was fixed out of is a worse thing than the defect.
// Instead the SAME page is photographed twice against two states of the file ON DISK: once as the
// working tree stands (AFTER), and once with `src/ForestWorldCanvas.tsx` rolled back to
// `git show HEAD:` (BEFORE). The rollback is restored in a `finally`, and the restored bytes are
// digest-checked against the originals before the process exits non-zero or zero. Both arms mount
// the same component from the same path, so nothing about the comparison depends on this file
// having described either palette correctly.
//
// ⚠ THE FAULT CLASS THIS DRIVER IS BUILT AGAINST: an A/B whose two arms are secretly the same
// scene reports "no difference" with the calm authority of a measurement. Three refusals stand
// between this and that outcome, and they are refusals rather than remarks:
//
//   1. PER-PANEL DIGESTS MUST DIFFER between the arms, on every one of the six states. If the
//      rollback did not take — vite served a cached module, the write silently failed — every
//      panel is byte-identical and the whole page is a picture of one thing twice.
//   2. THE PAIRED CHROMATICITY TEST. For each state, the AFTER panel must be chromatically
//      CLOSER to its decided ground colour than the BEFORE panel is, and the BEFORE panel closer
//      to the retired spike colour than the AFTER panel is. It is PAIRED — a difference of two
//      distances measured in the same run against the same geometry — because an ABSOLUTE
//      threshold would be a number picked by the author. The BEFORE arm is the control, which is
//      the only honest place to read a threshold from (`asset:friction-justification-bar`'s
//      shape, and this arc's standing correction after three instruments that could not fail).
//   3. THE TWO ZOOMS MUST ACTUALLY DIFFER in delivered px/unit, read off the projection matrix
//      each panel's own GL context received. "Both zooms" is otherwise two labels on one picture.
//
// ⚠ WHY CHROMATICITY AND NOT RGB. The canvas has a real `directionalLight` and R3F's default
// tone mapping, so a delivered pixel is never the material hex. Lighting is approximately a
// SCALAR on the material colour, and chromaticity (r/(r+g+b), g/(r+g+b)) is what a scalar leaves
// alone — so it compares what the palette chose rather than how brightly the sun hit it. Tone
// mapping is not exactly scalar, which is precisely why the test is paired rather than absolute.
//
// ⚠ WHY THE MODE AND NOT THE MEAN, and this is a correction made against a measured wrong answer
// rather than a preference. The first version of this driver averaged chromaticity over every
// land pixel in the panel, and it FAILED on `unhealthy`, `proposed` and `unknown` — because the
// average mixes the GROUND with the CROWN, and the crown is exactly what this increment moved
// onto a second, deliberately different table. `unhealthy`'s AFTER crown is a strong red over a
// charred near-black ground, so the panel average moved AWAY from the decided ground colour while
// the ground itself moved onto it. Judging the ground therefore has to isolate the ground: the
// MODAL land colour is the largest flat run of one exact value in the picture, which on an island
// of many parcels carrying one small tree is the lit parcel top by a wide margin. The mean is
// still reported (`meanChroma`), and judged on by nothing.
//
// ⚠ THE PIXELS COME FROM AN ELEMENT SCREENSHOT, DECODED BY THE BROWSER. R3F does not preserve the
// drawing buffer, so `getImageData` on the live canvas returns nothing (`baseline-measure.mjs`
// records the same limit). The screenshot PNG is handed back INTO the page and decoded with
// `createImageBitmap` — Chromium's own decoder, no dependency added to a package that ships to
// the website. The honest consequence is that transparent water is composited against the stage's
// background, which is why `palette.html` gives the stage ONE flat named colour and why every
// pixel near it is excluded below rather than counted as land.
//
// USAGE:
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5241
//   DISPLAY=:0 ST_PALETTE_GPU=1 ST_PALETTE_URL=http://localhost:5241/palette.html \
//     pnpm --filter @storytree/forest-world-r3f measure-palette
//
// ⚠ `vite.config.ts` pins strictPort 5184 for EVERY worktree, so the default port may be a
// SIBLING worktree's server, and a wrong-tree picture is worse than a missing one. This driver
// refuses 5184 outright and, whatever port it is given, refuses a page whose title is not this
// one's.

import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHIPPED_GROUND_COLOUR, SPIKE_STATUS_COLOUR } from './shipped-baseline.js';
// The page's report shape, declared ONCE and shared with the page that writes it — a driver
// holding its own copy is this increment's own defect, one size down.
import type { PaletteReport, PanelReading } from './palette-report.js';
import './palette-report.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const CANVAS_REL = 'packages/forest-world-r3f/src/ForestWorldCanvas.tsx';
const CANVAS_ABS = join(REPO, CANVAS_REL);
const URL = process.env['ST_PALETTE_URL'] ?? 'http://localhost:5241/palette.html';
const OUT =
  process.env['ST_PALETTE_OUT'] ?? join(REPO, 'docs', 'research', 'chapter2-shipped-palette-2026-08-28');
const WANT_GPU = process.env['ST_PALETTE_GPU'] === '1';
const GPU_ARGS = ['--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];

/** The six states, in the order the arc's reports print them. */
const STATES = ['healthy', 'mapped', 'proposed', 'building', 'unhealthy', 'unknown'];
const ZOOMS = ['overview', 'zoom'];

/** `palette.html`'s flat stage colour, kept as a fallback exclusion: the canvas turns out to paint
 *  its OWN opaque background, so the stage never shows through — but a future canvas that went
 *  transparent would composite against exactly this, and excluding it costs nothing. */
const STAGE_BG = [0x20, 0x26, 0x2c];

/** THE CANVAS'S OWN WATER, READ OFF THE FILE UNDER TEST rather than transcribed here.
 *
 *  ⚠ THIS IS THE CORRECTION THAT MADE THE MEASUREMENT REAL, and the wrong answer it replaces is
 *  worth recording: with only the stage colour excluded, the modal land colour came back as
 *  `#101418` — the SEA — in all twelve panels, identical in both arms, and the driver dutifully
 *  reported that nothing had changed. The canvas sets `<color attach="background">`, so it is
 *  opaque and the ocean is by far the largest flat run of one value in every panel.
 *
 *  It is PARSED rather than typed in for the reason every other copy in this increment is parsed:
 *  a hardcoded `#101418` would be a fourth transcription of a colour that lives somewhere else,
 *  and this whole unit exists because the third one drifted. A file that stops declaring a scene
 *  background is a refusal, not a default. */
function sceneBackgroundOf(source: string): number[] | null {
  const m = /<color\s+attach="background"\s+args=\{\['(#[0-9a-fA-F]{6})'\]\}/.exec(source);
  if (!m) return null;
  const hex = m[1]!;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** How far from an excluded colour a pixel must be to count as land.
 *
 *  ⚠ SMALL ON PURPOSE, AND THE GENEROUS VERSION WAS MEASURABLY WRONG. The sea is a flat CLEAR
 *  COLOUR with no light on it, so it is EXACTLY one value everywhere but the island's antialiased
 *  rim — a radius of 8 removes it completely. The first version used 30, on the reasoning that
 *  every palette colour is far outside it, and that reasoning was false for exactly one state:
 *  ADR-0470's charred `unhealthy` ground delivers around 25 units from the sea under this canvas's
 *  lighting, so a 30-unit radius DELETED the very land it was meant to isolate and left the panel
 *  reporting its red crown as the modal land colour. A few antialiased rim pixels counted as land
 *  cost the mode nothing; deleting a whole state's ground costs it everything. */
const BG_RADIUS = Number(process.env['ST_PALETTE_BG_RADIUS'] ?? 8);
/** Below this share of the panel the island did not really draw, and a colour verdict over a
 *  handful of edge pixels is noise wearing a number. */
const MIN_LAND_SHARE = Number(process.env['ST_PALETTE_MIN_LAND'] ?? 0.02);
/** Below this summed intensity a pixel has no usable chromaticity (deep shadow, the water's own
 *  dark edge) — a ratio of three near-zero numbers is noise, not a hue. */
const DARK_FLOOR = Number(process.env['ST_PALETTE_DARK_FLOOR'] ?? 60);

function refuse(msg: string): never {
  console.error(`\nREFUSED: ${msg}`);
  process.exitCode = 1;
  throw new Error('refused');
}

if (/:5184\b/.test(URL)) {
  console.error(
    `REFUSED: ${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_PALETTE_URL — a sibling worktree\'s tree photographed\n' +
      'as yours produces a PICTURE rather than a crash, which is the worse failure.',
  );
  process.exit(2);
}

/* ── the shapes, so the driver is TYPECHECKED ────────────────────────────────────────────────
   ⚠ THIS FILE IS `.ts` AND NOT `.mjs`, WHICH IS DELIBERATE AND UNLIKE ITS THIRTEEN SIBLINGS.
   `tsx` and `bun` are transpile-only, so a `.mjs` driver can print confident numbers from code
   that would not compile — the one failure mode a measurement instrument must not have, and one
   this arc has already paid for. `tsconfig.json` covers every `.ts` under `harness/`, so
   `pnpm -r typecheck` reads this file. The conversion was not free: it found eleven implicit-`any` indexings of the
   per-panel report, every one of them in the arithmetic that produces the verdict. */

/** An (x, y) point in the chromaticity plane this driver reduces colours to. */
type Chromaticity = readonly [number, number];

/** What one canvas screenshot reduces to. Returned from inside the page, so every field is
 *  plain JSON. */
interface PanelMeasurement {
  w: number;
  h: number;
  landPixels: number;
  landShare: number;
  distinctColours: number;
  modeRgb: number[];
  modeHex: string;
  modeShare: number;
  topColours: { hex: string; share: number }[];
  modeChroma: Chromaticity;
  meanChroma: Chromaticity;
}

type PanelRecord = PanelReading & PanelMeasurement & { digest: string };

/** One arm of the comparison — the working tree, or HEAD. */
interface Arm {
  renderer: string;
  vendor: string;
  panels: Map<string, PanelRecord>;
  sections: Map<string, string>;
}

/** Chromaticity of a hex literal — the same reduction the delivered pixels go through, so the
 *  two are comparable by construction rather than by the author remembering to match them. */
function chromaOfHex(hex: string): Chromaticity {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const s = r + g + b;
  return [r / s, g / s];
}
const dist = (a: Chromaticity, b: Chromaticity): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* ── the two states of the file on disk ─────────────────────────────────────────────────────
   The AFTER bytes are captured up front and restored in the `finally`, so an exception anywhere
   below leaves the working tree exactly as it was found. */
const AFTER_SOURCE = readFileSync(CANVAS_ABS);
const AFTER_DIGEST = createHash('sha256').update(AFTER_SOURCE).digest('hex');
const BEFORE_SOURCE = execFileSync('git', ['show', `HEAD:${CANVAS_REL}`], { cwd: REPO, maxBuffer: 1 << 24 });

const WATER = sceneBackgroundOf(AFTER_SOURCE.toString('utf8'));
if (!WATER) {
  console.error(
    `REFUSED: ${CANVAS_REL} declares no <color attach="background"> — this driver excludes the\n` +
      'canvas\'s own sea before judging the land, and cannot do so from a guess. If the component\n' +
      'genuinely stopped painting a background, teach this driver the new shape rather than\n' +
      'letting it measure the ocean.',
  );
  process.exit(2);
}
const BEFORE_WATER = sceneBackgroundOf(BEFORE_SOURCE.toString('utf8')) ?? WATER;
console.log(`water    : #${WATER.map((v) => v.toString(16).padStart(2, '0')).join('')} (excluded, parsed from the file under test)`);

if (AFTER_SOURCE.equals(BEFORE_SOURCE)) {
  console.error(
    'REFUSED: the working tree copy of ForestWorldCanvas.tsx is IDENTICAL to HEAD, so there is\n' +
      'no BEFORE to photograph. Either the fix is not in the working tree, or it is already\n' +
      'committed — in which case point the BEFORE arm at the commit before it.',
  );
  process.exit(2);
}

const browser = await chromium.launch(WANT_GPU ? { headless: true, args: GPU_ARGS } : { headless: true });
const page = await browser.newPage({ viewport: { width: 2600, height: 1600 }, deviceScaleFactor: 1 });
const consoleErrors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

/** Decode a PNG buffer with the browser's own decoder and reduce it to the numbers this driver
 *  judges on. Returns null when the crop carries no land at all, which is a refusal upstream
 *  rather than a zero: an empty canvas has no colour to be wrong about. */
async function measureShot(buffer: Buffer, excluded: number[][]): Promise<PanelMeasurement | null> {
  return page.evaluate(
    async ({ b64, excludedColours, radius, floor }): Promise<PanelMeasurement | null> => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      // A 2D context can be refused (another context type already bound, or the canvas is
      // detached). Returning null here surfaces as an explicit refusal upstream rather than as
      // a zeroed measurement, which would read as a legitimate flat picture.
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let land = 0;
      let cx = 0;
      let cy = 0;
      const tally = new Map();
      for (let i = 0; i < d.length; i += 4) {
        // `?? 0` rather than `!`: `noUncheckedIndexedAccess` is right that a byte array index
        // can be out of range, and an out-of-range channel reading as 0 is a black pixel the
        // exclusions below discard — never a NaN propagating silently into the verdict.
        const r = d[i] ?? 0;
        const g = d[i + 1] ?? 0;
        const b = d[i + 2] ?? 0;
        let isBackground = false;
        for (const bg of excludedColours) {
          const dr = r - (bg[0] ?? 0);
          const dg = g - (bg[1] ?? 0);
          const db = b - (bg[2] ?? 0);
          if (Math.sqrt(dr * dr + dg * dg + db * db) < radius) {
            isBackground = true;
            break;
          }
        }
        if (isBackground) continue;
        const s = r + g + b;
        if (s < floor) continue;
        land += 1;
        cx += r / s;
        cy += g / s;
        const key = (r << 16) | (g << 8) | b;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      if (land === 0) return null;
      const top = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, n]) => ({
          hex: `#${[(k >> 16) & 255, (k >> 8) & 255, k & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
          share: n / land,
        }));
      let modeKey = -1;
      let modeCount = 0;
      for (const [k, n] of tally) {
        if (n > modeCount) {
          modeCount = n;
          modeKey = k;
        }
      }
      const mr = (modeKey >> 16) & 255;
      const mg = (modeKey >> 8) & 255;
      const mb = modeKey & 255;
      const ms = mr + mg + mb;
      return {
        w: c.width,
        h: c.height,
        landPixels: land,
        landShare: land / (c.width * c.height),
        distinctColours: tally.size,
        // THE JUDGED FIGURE — see the header note on why it is the MODE and not the mean.
        modeRgb: [mr, mg, mb],
        modeHex: `#${[mr, mg, mb].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
        modeShare: modeCount / land,
        topColours: top,
        modeChroma: [mr / ms, mg / ms],
        // Kept for the reader, judged on by nothing: the whole-island average, which is what a
        // first attempt at this driver used and what the crown confounds.
        meanChroma: [cx / land, cy / land],
      };
    },
    { b64: buffer.toString('base64'), excludedColours: excluded, radius: BG_RADIUS, floor: DARK_FLOOR },
  );
}

/** One whole arm: load the page as the file currently stands, prove it settled, photograph the
 *  two sections, and reduce every one of the twelve canvases. */
async function captureArm(arm: string, water: number[]): Promise<Arm> {
  await page.goto(URL, { waitUntil: 'load' });
  const title = await page.title();
  if (!/shipped ground\+crown palette/.test(title)) {
    refuse(`${URL} served "${title}" — that is not this branch's palette page.`);
  }
  await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 240_000 });
  const report: PaletteReport | null = await page.evaluate(() => window.__stPalette ?? null);
  if (!report) refuse(`${arm}: the page settled but filed no __stPalette report`);

  const panels = new Map<string, PanelRecord>();
  for (const zoom of ZOOMS) {
    for (const st of STATES) {
      const tag = `${st}-${zoom}`;
      const reading = report.panels[tag];
      // A panel that filed no reading never painted; a panel that painted zero frames is a blank
      // rectangle, which photographs beautifully and means nothing.
      if (!reading) refuse(`${arm}: panel ${tag} filed no reading`);
      if (reading.frames <= 0) refuse(`${arm}: panel ${tag} painted ${reading.frames} frames`);
      const el = await page.$(`[data-st-panel="${tag}"] canvas`);
      if (!el) refuse(`${arm}: panel ${tag} has no canvas`);
      const shot = await el.screenshot();
      const measured = await measureShot(shot, [water, STAGE_BG]);
      if (!measured) refuse(`${arm}: panel ${tag} photographed NOTHING but sea and stage`);
      if (measured.landShare < MIN_LAND_SHARE) {
        refuse(
          `${arm}: panel ${tag} is ${(measured.landShare * 100).toFixed(2)}% land — the island did not draw`,
        );
      }
      panels.set(tag, {
        ...reading,
        ...measured,
        digest: createHash('sha256').update(shot).digest('hex').slice(0, 16),
      });
    }
  }

  mkdirSync(OUT, { recursive: true });
  const sections = new Map<string, string>();
  for (const zoom of ZOOMS) {
    const el = await page.$(`section[data-st-panel="palette-${zoom}"]`);
    if (!el) refuse(`${arm}: no section for ${zoom}`);
    const file = `${arm}-${zoom}.png`;
    writeFileSync(join(OUT, file), await el.screenshot());
    sections.set(zoom, file);
  }
  return { renderer: report.renderer, vendor: report.vendor, panels, sections };
}

/** A panel by tag, refusing rather than returning `undefined`. Every caller below is arithmetic
 *  that produces the verdict, so a missing panel must stop the run rather than propagate a NaN
 *  into a table that still prints. */
function panelOf(armRecord: Arm, tag: string): PanelRecord {
  const p = armRecord.panels.get(tag);
  if (!p) refuse(`no panel ${tag} in one of the two arms`);
  return p;
}

/** An arm as plain JSON — Maps do not serialise. */
function armJson(armRecord: Arm) {
  return {
    renderer: armRecord.renderer,
    vendor: armRecord.vendor,
    sections: Object.fromEntries(armRecord.sections),
    panels: Object.fromEntries(armRecord.panels),
  };
}

let after: Arm;
let before: Arm;
try {
  console.log(`url      : ${URL}`);
  console.log(`out      : ${OUT}\n`);

  console.log('AFTER  — the working tree as it stands (the decided ground+crown split)');
  after = await captureArm('after', WATER);

  console.log('BEFORE — src/ForestWorldCanvas.tsx rolled back to HEAD (the retired spike palette)');
  writeFileSync(CANVAS_ABS, BEFORE_SOURCE);
  before = await captureArm('before', BEFORE_WATER);
} finally {
  // ⚠ RESTORE, THEN PROVE THE RESTORE. A driver that leaves a rolled-back shipped file behind on
  // any exit path is worse than one that never ran, and "I wrote the bytes back" is a claim, not
  // a check — a partial write is exactly the shape that would slip through.
  writeFileSync(CANVAS_ABS, AFTER_SOURCE);
  const restored = createHash('sha256').update(readFileSync(CANVAS_ABS)).digest('hex');
  if (restored !== AFTER_DIGEST) {
    console.error(`\n⚠⚠ THE WORKING TREE WAS NOT RESTORED. ${CANVAS_REL} is not what it was — git checkout it.`);
    process.exitCode = 2;
  } else {
    console.log(`\nrestored : ${CANVAS_REL} back to the working-tree copy (sha256 ${AFTER_DIGEST.slice(0, 16)})`);
  }
  await browser.close();
}

if (consoleErrors.length) {
  console.error(`\nREFUSED: the page logged ${consoleErrors.length} error(s):`);
  for (const e of consoleErrors.slice(0, 10)) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`\nrenderer : ${after.renderer} (${after.vendor})`);
const software = /swiftshader|llvmpipe|software|Mesa OffScreen/i.test(after.renderer);
if (WANT_GPU && software) {
  console.error(
    `\nREFUSED: ST_PALETTE_GPU=1 was asked for and the context came up on ${after.renderer}.\n` +
      'A software renderer reporting as hardware is the one outcome worse than no measurement.',
  );
  process.exit(1);
}
console.log(software ? '           [SOFTWARE RASTERISER — colours are trustworthy, frame costs are not]' : '');

let failed = false;

/* ── 1. the two arms are two arms ───────────────────────────────────────────────────────────── */
console.log('\n1. the two arms photographed DIFFERENT scenes (per-panel screenshot digests):');
for (const zoom of ZOOMS) {
  for (const st of STATES) {
    const tag = `${st}-${zoom}`;
    const differ = panelOf(before, tag).digest !== panelOf(after, tag).digest;
    if (!differ) failed = true;
    console.log(
      `  ${differ ? 'ok ' : 'XX '}${tag.padEnd(20)} before ${panelOf(before, tag).digest} ${differ ? '!=' : '=='} after ${panelOf(after, tag).digest}`,
    );
  }
}

/* ── 2. the paired chromaticity verdict ─────────────────────────────────────────────────────── */
console.log('\n2. did the land move TOWARD the decided colour and AWAY from the spike one?');
console.log('   (paired: two distances measured in the same run, the BEFORE arm as the control —');
console.log('    no absolute threshold is picked by this file)\n');
console.log(
  `   ${'state'.padEnd(10)}${'zoom'.padEnd(10)}${'modal land b→a'.padEnd(20)}${'→decided b/a'.padEnd(20)}${'→spike b/a'.padEnd(20)}verdict`,
);
const verdicts = [];
for (const zoom of ZOOMS) {
  for (const st of STATES) {
    const tag = `${st}-${zoom}`;
    const decided = chromaOfHex(SHIPPED_GROUND_COLOUR.get(st)!);
    const spike = chromaOfHex(SPIKE_STATUS_COLOUR.get(st)!);
    const bC = panelOf(before, tag).modeChroma;
    const aC = panelOf(after, tag).modeChroma;
    const toDecided = { before: dist(bC, decided), after: dist(aC, decided) };
    const toSpike = { before: dist(bC, spike), after: dist(aC, spike) };
    const closer = toDecided.after < toDecided.before;
    const away = toSpike.before < toSpike.after;
    const ok = closer && away;
    if (!ok) failed = true;
    verdicts.push({
      tag,
      state: st,
      zoom,
      decided: SHIPPED_GROUND_COLOUR.get(st)!,
      spike: SPIKE_STATUS_COLOUR.get(st)!,
      modalLand: { before: panelOf(before, tag).modeHex, after: panelOf(after, tag).modeHex },
      modalShare: { before: panelOf(before, tag).modeShare, after: panelOf(after, tag).modeShare },
      toDecided,
      toSpike,
      ok,
    });
    console.log(
      `   ${st.padEnd(10)}${zoom.padEnd(10)}` +
        `${`${panelOf(before, tag).modeHex}→${panelOf(after, tag).modeHex}`.padEnd(20)}` +
        `${`${toDecided.before.toFixed(4)}→${toDecided.after.toFixed(4)}`.padEnd(20)}` +
        `${`${toSpike.before.toFixed(4)}→${toSpike.after.toFixed(4)}`.padEnd(20)}` +
        `${ok ? 'ok' : `XX ${closer ? '' : 'not closer to decided '}${away ? '' : 'not away from spike'}`}`,
    );
  }
}

/* ── 3. both zooms are two zooms ────────────────────────────────────────────────────────────── */
console.log('\n3. the two stages really do deliver different resolutions (px per ground unit,');
console.log('   read off the projection matrix each panel\'s own GL context received):');
for (const st of STATES) {
  const o = panelOf(after, `${st}-overview`);
  const z = panelOf(after, `${st}-zoom`);
  const ratio = z.scaleAtTarget / o.scaleAtTarget;
  // A ratio at or near 1 means the "zoomed" row is the overview row with a different caption.
  const ok = ratio > 1.5;
  if (!ok) failed = true;
  console.log(
    `  ${ok ? 'ok ' : 'XX '}${st.padEnd(10)} overview ${o.scaleAtTarget.toFixed(2).padStart(6)} px/unit` +
      `  zoom ${z.scaleAtTarget.toFixed(2).padStart(6)} px/unit  x${ratio.toFixed(2)}` +
      `  (${o.projection}, spread ${o.spreadPct.toFixed(1)}%)`,
  );
}

const jsonPath = join(OUT, 'palette-measure.json');
writeFileSync(
  jsonPath,
  `${JSON.stringify(
    {
      url: URL,
      renderer: { renderer: after.renderer, vendor: after.vendor, software },
      sourceUnderTest: { path: CANVAS_REL, afterSha256: AFTER_DIGEST },
      excludedColours: [WATER, STAGE_BG].map((c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`),
      backgroundExclusionRadius: BG_RADIUS,
      darkFloor: DARK_FLOOR,
      groundPalette: Object.fromEntries(SHIPPED_GROUND_COLOUR),
      spikePalette: Object.fromEntries(SPIKE_STATUS_COLOUR),
      verdicts,
      arms: { before: armJson(before), after: armJson(after) },
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${jsonPath}`);
console.log(`      ${[...after.sections.values(), ...before.sections.values()].join(', ')}`);

if (failed) {
  console.error('\nFAILED — see the XX rows above.');
  process.exit(1);
}
console.log('\nPASS — the before/after arms differ on every panel, the land moved onto the decided');
console.log('       vocabulary and off the spike one at both zooms, and the two zooms are two zooms.');
