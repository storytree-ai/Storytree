// shipped-coast-measure.mjs — DRIVER for "the coast clip": three shapes of coastline over one
// island and one forest, differing only in which coast the parcels were clipped to.
//
//   none       the map as it ships — the raw hex-union silhouette (CONTROL and DENOMINATOR)
//   outset     the outset only — bays and headlands, every hex corner kept, 0 new triangles
//   project    every rim vertex moved ONTO the smoothed curve — corners cut, 0 new triangles
//   subdivide  the curve's own points along each rim edge — the boundary IS the curve
//
// THE INCREMENT: the coast clip on `adopt-the-land-into-the-shipped-map-arc`. Its premise was
// checked at source before any of this was built: `substrate.ts:344` says the relaxed mesh keeps
// the hex-silhouette coastline with its outer vertices pinned, and `smoothCoast()` — the coast the
// approved treatment asks for — exists in `packages/forest-world/src/coast.ts` with the studio's 2D
// map as its ONLY caller. The component was unimported, not missing.
//
// ⚠⚠ THE REFUSALS ARE WHERE THIS PAGE'S HONESTY LIVES, and the sharpest one is not about looks.
// The coast this map has always drawn SELF-INTERSECTS — twice, on this island — and an SVG fill
// hides that where a triangulated ground cannot: two boundary parcels overlap at a crossing, so one
// capability's status colour is drawn over ground belonging to another. That is a misreport
// (ADR-0392 D5 / ADR-0398 D7), so `src/coast-clip.ts` caps every arm and this driver REFUSES any
// run in which a single parcel folds.
//
// Reproduce (⚠ needs a real GPU — every committed frame figure comes off the Mint box):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5298 --strictPort
//   DISPLAY=:0 ST_COAST_URL=http://localhost:5298/shipped-coast.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-coast
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`harness/shipped-coast-scene.ts`, `src/coast-clip.ts`); this
// starts a browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_COAST_URL'] ?? 'http://localhost:5298/shipped-coast.html';
const OUT =
  process.env['ST_COAST_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-coast-2026-09-01');
const ANGLE = process.env['ST_COAST_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_COAST_ALLOW_SOFTWARE'] === '1';
const BATCH = Number(process.env['ST_COAST_BATCH'] ?? '30');
const REPEATS = Number(process.env['ST_COAST_REPEATS'] ?? '5');

/** The ground with NO coast at all — not a fourth option, the CONTROL and the DENOMINATOR. */
const REFERENCE = 'none';
const ARMS = ['outset', 'project', 'subdivide'];
const ALL_ARMS = [REFERENCE, ...ARMS];
const SIZES = ['one', 'forest'];
const ZOOMS = [2, 8, 'fit'];
const FIT = 'fit';
/** The arc's zoomed-in read — where the beach is 56 delivered px and the comparison actually
 *  turns. */
const READ_ZOOM = 8;
/** Ground units of beach at the authored outset, which is what the pixel check below sizes. */
const BEACH_GROUND_WIDTH = 7;
/** The two arms whose whole claim is that they cost NO triangles. */
const FREE_ARMS = ['outset', 'project'];

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
await page.waitForFunction(() => 'coastRunner' in window, null, { timeout: 300_000 });
if (consoleErrors.length > 0) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);
if (httpErrors.length > 0) fail(`the page failed to load something:\n  ${httpErrors.join('\n  ')}`);

const identity = await page.evaluate(() => window.coastRunner.identity());
if (identity.software && !ALLOW_SOFTWARE) {
  fail(
    `${identity.renderer} is a SOFTWARE rasteriser. Take this on the box with a discrete GPU. To ` +
      'develop the page here, set ST_COAST_ALLOW_SOFTWARE=1 — the run then stamps itself.',
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
    for (const arm of ALL_ARMS) {
      const samples = [];
      let base = null;
      for (let r = 0; r < REPEATS; r += 1) {
        const one = await page.evaluate(
          ([a, s, z, b]) => window.coastRunner.time(a, s, z, b),
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

// ── THE PIXEL COMPARISONS. Every arm against the control — which is both "what changed" and, for
//    this page, THE COAST'S OWN FOOTPRINT, because the control is the map without one.

const coastPx = {};
const changedPct = {};
/** Arm-against-arm, so the report can say whether the three shapes are actually three shapes. */
const between = {};
for (const size of SIZES) {
  coastPx[size] = {};
  changedPct[size] = {};
  between[size] = {};
  for (const zoom of ZOOMS) {
    coastPx[size][zoom] = {};
    changedPct[size][zoom] = {};
    for (const arm of ARMS) {
      coastPx[size][zoom][arm] = await page.evaluate(
        ([a, s, z]) => window.coastRunner.coastPixels(a, s, z),
        [arm, size, zoom],
      );
      changedPct[size][zoom][arm] = await page.evaluate(
        ([a, s, z]) => window.coastRunner.changedPct('none', a, s, z),
        [arm, size, zoom],
      );
    }
    between[size][zoom] = {
      'outset|project': await page.evaluate(
        ([s, z]) => window.coastRunner.changedPixels('outset', 'project', s, z),
        [size, zoom],
      ),
      'project|subdivide': await page.evaluate(
        ([s, z]) => window.coastRunner.changedPixels('project', 'subdivide', s, z),
        [size, zoom],
      ),
    };
  }
}

// ── THE PICTURES.

const shots = [];
for (const [size, zoom] of [
  ['forest', FIT],
  ['forest', 2],
  ['forest', 8],
  ['one', 2],
  ['one', 8],
]) {
  for (const arm of ALL_ARMS) {
    const png = await page.evaluate(
      ([a, s, z]) => window.coastRunner.snapshot(a, s, z),
      [arm, size, zoom],
    );
    const name = `coast-${size}-${zoom}px-${arm}.png`;
    writeFileSync(join(OUT, name), Buffer.from(png.split(',')[1], 'base64'));
    shots.push(name);
  }
}

await browser.close();

const at = (size, zoom, arm) => readings[size][zoom][arm];

// ── THE REFUSALS. Each one is a way this comparison could look right and mean nothing.

// 1. ⚠⚠ NO PARCEL MAY FOLD, ON ANY ARM, AT ANY SIZE. This is the only refusal here that is about
//    the map's HONESTY rather than about the measurement's. A folded parcel draws its capability's
//    status colour over ground that belongs to another capability — a misreport, and the one way
//    this component could do real harm. The coast that ships in the 2D panel folds twice on this
//    island; `src/coast-clip.ts` caps every arm so that no parcel does, and this is the check that
//    a cap which stopped working could not pass silently.
for (const size of SIZES) {
  for (const arm of ALL_ARMS) {
    const folded = at(size, READ_ZOOM, arm).foldedParcels;
    if (folded !== 0) {
      fail(
        `the ${arm} arm folded ${folded} parcel(s) on the ${size} map. A folded parcel paints one ` +
          "capability's status over another's ground — the map has stopped reporting.",
      );
    }
  }
}

// 2. NON-VACUITY: the control must actually be the UNCLIPPED silhouette. If `none` already carried
//    a coast there would be nothing here to compare against, and every picture below would be of a
//    solved problem.
const control = at('one', READ_ZOOM, REFERENCE);
if (control.capRim !== 0 || control.capBound !== 0) {
  fail(`the control reported ${control.capBound}/${control.capRim} capped rim vertices — it is not the unclipped map`);
}
for (const arm of ARMS) {
  if (at('one', READ_ZOOM, arm).groundArea <= control.groundArea) {
    fail(
      `the ${arm} arm bounds ${at('one', READ_ZOOM, arm).groundArea.toFixed(0)} sq units against the ` +
        `control's ${control.groundArea.toFixed(0)} — a coast that adds no land is not a coast`,
    );
  }
}

// 3. THE BEACH MUST BE PHOTOGRAPHABLE AT THE ZOOM BEING COMPARED, and then it must actually move
//    pixels there. Either check alone is satisfied by a comparison that could not have failed —
//    this arc has already produced one pair of byte-identical files by comparing a sub-pixel
//    feature at an overview zoom.
const beachPx = BEACH_GROUND_WIDTH * READ_ZOOM;
if (beachPx < 24) {
  fail(`the beach is ${beachPx} delivered px at the read zoom — too narrow to falsify anything`);
}
for (const size of SIZES) {
  for (const arm of ARMS) {
    if (coastPx[size][READ_ZOOM][arm] <= 0) {
      fail(
        `${arm} rendered the ${size} map BYTE-IDENTICALLY to the control at ${READ_ZOOM} px per ` +
          'ground unit. Either it is not doing anything, or the frame does not contain a coast.',
      );
    }
  }
}

// 4. THE THREE SHAPES MUST BE THREE SHAPES. If two arms render identically the fork is not a fork,
//    and offering the owner three options would be offering him two and a duplicate.
for (const [pair, px] of Object.entries(between['one'][READ_ZOOM])) {
  if (px <= 0) {
    fail(`${pair.replace('|', ' and ')} are BYTE-IDENTICAL at ${READ_ZOOM} px/unit — that is not a fork`);
  }
}

// 5. THE FREE ARMS MUST ACTUALLY BE FREE, and the costly one must actually cost. Both halves are
//    claims the module makes in prose; here they are numbers.
for (const arm of FREE_ARMS) {
  const r = at('one', READ_ZOOM, arm);
  if (r.triangles !== control.triangles || r.ringVertices !== control.ringVertices) {
    fail(
      `the ${arm} arm claims to add no geometry and emitted ${r.triangles} triangles over ` +
        `${r.ringVertices} ring vertices against the control's ${control.triangles} / ${control.ringVertices}`,
    );
  }
}
const sub = at('one', READ_ZOOM, 'subdivide');
if (sub.triangles <= control.triangles) {
  fail(`the subdivide arm emitted ${sub.triangles} triangles, no more than the control's ${control.triangles}`);
}

// 6. THE COAST MAY NOT COST THE ONE-DRAW GROUND. `the forest's ground is ONE draw call` is a
//    property this arc has already committed to, and a coast is a change to where the ground ends
//    rather than to how many meshes carry it.
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ALL_ARMS) {
      if (at(size, zoom, arm).drawCalls !== 1) {
        fail(
          `${arm} submitted ${at(size, zoom, arm).drawCalls} draw calls on the ${size} map at ` +
            `${zoom} — the ground is ONE draw call`,
        );
      }
    }
  }
}

// ── THE REPORT.

const pct = (n, d) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);
const ms = (r) => (r.gpuNs === null ? '     n/a' : (r.gpuNs / 1e6).toFixed(4).padStart(8));

const lines = [];
lines.push(`# the coast clip — three shapes, one instrument`);
lines.push('');
lines.push(`renderer: ${identity.vendor} — ${identity.renderer}`);
lines.push(`software rasteriser: ${identity.software}${identity.software ? '  ⚠ FIGURES NOT COMMITTABLE' : ''}`);
lines.push(`timer query: ${identity.timerQuery} · batch ${BATCH} · ${REPEATS} repeats, median reported`);
lines.push('');
lines.push('## what each arm costs, and what it bounds');
lines.push('');
lines.push('size    arm         tris  ringVerts  vertexKB  sq units  cap bound  least  draws');
for (const size of SIZES) {
  for (const arm of ALL_ARMS) {
    const r = at(size, READ_ZOOM, arm);
    lines.push(
      [
        size.padEnd(7),
        arm.padEnd(11),
        String(r.triangles).padStart(5),
        String(r.ringVertices).padStart(10),
        (r.attributeBytes / 1024).toFixed(1).padStart(9),
        r.groundArea.toFixed(0).padStart(9),
        `${r.capBound}/${r.capRim}`.padStart(10),
        r.capLeast.toFixed(2).padStart(6),
        String(r.drawCalls).padStart(6),
      ].join(' '),
    );
  }
}
lines.push('');
lines.push('## what the coast MOVED — against the frame, and against the coast itself');
lines.push('');
lines.push('⚠ the second column is the one to read. A coast is a thin annulus, so the first column');
lines.push('  is small for every honest arm; the third divides by the arm\'s own footprint.');
lines.push('');
lines.push('size    zoom  arm         % of frame   coast px   beach px');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ARMS) {
      const px = at(size, zoom, arm).pxPerUnit;
      lines.push(
        [
          size.padEnd(7),
          String(zoom).padStart(4),
          arm.padEnd(11),
          changedPct[size][zoom][arm].toFixed(3).padStart(10),
          String(coastPx[size][zoom][arm]).padStart(10),
          (BEACH_GROUND_WIDTH * px).toFixed(1).padStart(10),
        ].join(' '),
      );
    }
  }
}
lines.push('');
lines.push('## are the three shapes actually three shapes?');
lines.push('');
lines.push('size    zoom  outset vs project   project vs subdivide   (pixels)');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    lines.push(
      [
        size.padEnd(7),
        String(zoom).padStart(4),
        String(between[size][zoom]['outset|project']).padStart(18),
        String(between[size][zoom]['project|subdivide']).padStart(22),
      ].join(' '),
    );
  }
}
lines.push('');
lines.push('## frame cost (median GPU ms per render, and the spread over repeats)');
lines.push('');
lines.push('⚠ REPRODUCIBLE PER ROW, NOT PER TABLE. Take two runs and diff them row by row; quote');
lines.push('  only the rows that agree, and say which were dropped.');
lines.push('');
lines.push('size    zoom  arm            ms    spread ms   samples');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    for (const arm of ALL_ARMS) {
      const r = at(size, zoom, arm);
      lines.push(
        [
          size.padEnd(7),
          String(zoom).padStart(4),
          arm.padEnd(11),
          ms(r),
          (r.spreadNs / 1e6).toFixed(4).padStart(11),
          String(r.samples).padStart(9),
        ].join(' '),
      );
    }
  }
}
lines.push('');
lines.push(`## how much of each arm's own coast the fold cap had to give up`);
lines.push('');
for (const size of SIZES) {
  for (const arm of ARMS) {
    const r = at(size, READ_ZOOM, arm);
    lines.push(
      `${size.padEnd(7)} ${arm.padEnd(11)} ${r.capBound}/${r.capRim} rim vertices capped ` +
        `(${pct(r.capBound, r.capRim)}), the worst kept ${r.capLeast.toFixed(2)} of its beach`,
    );
  }
}
lines.push('');
lines.push(`pictures: ${shots.length}`);
for (const s of shots) lines.push(`  ${s}`);

const report = `${lines.join('\n')}\n`;
writeFileSync(join(OUT, 'coast-measurements.md'), report);
writeFileSync(
  join(OUT, 'coast-measurements.json'),
  `${JSON.stringify({ identity, readings, coastPx, changedPct, between, shots }, null, 2)}\n`,
);
console.log(report);
console.log(`wrote ${shots.length} pictures + coast-measurements.{md,json} to ${OUT}`);
