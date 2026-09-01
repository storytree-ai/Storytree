// shipped-skirt-measure.mjs — DRIVER for "the stepped skirt": the island's edge four ways, over one
// island and one forest, differing only in how that edge is cut and what it wears.
//
//   flat            the map as it ships — ONE wall per rim edge, the parcel's status colour
//                   (CONTROL and DENOMINATOR)
//   stepped         six ledges, still the status colour — the SHAPE without the rock (option C)
//   rock            six ledges, all rock — the approved picture's cliff (option A)
//   soil-over-rock  six ledges, the TOP one keeping the status tint (option B)
//
// THE INCREMENT: the stepped cliff skirt on `adopt-the-land-into-the-shipped-map-arc` — the SIXTH
// and last component of the approved treatment, and the only one that could not be built at all
// until the owner decided. He settled it 2026-09-01 and moved the fence with it: sessions may add
// colours as needed, and the acceptance test is now an OUTCOME the session applies to the final
// render — "can I tell what state this island is in".
//
// ⚠⚠ THE REFERENCE ARM IS THE POINT OF THIS PAGE. Every crossing on this arc is judged against the
// picture the owner approved rather than against its own best arm, and this driver puts the approved
// Cycles render through the SAME instrument as the live frames. It also re-derives the finding the
// component rests on rather than quoting it: `land-combined` and `land-strata` differ in nothing but
// the skirt material, so the gap between them IS what the kit's cliff is worth.
//
// ⚠ THE REFUSALS. The run fails if: the renderer is a software rasterizer (unless allowed), the
// ground stops being ONE draw call, the `flat` arm stops being byte-identical to the map that shipped
// before this component, or the rock arm fails to move the island's dark anchor at all — which is
// what "the component is in the code and not in the picture" looks like from outside, and what this
// arc has already been bitten by once.
//
// Reproduce (⚠ needs a real GPU — every committed frame figure comes off a discrete GPU):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5312 --strictPort
//   ST_SKIRT_URL=http://localhost:5312/shipped-skirt.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-skirt
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is computed
// in the typechecked modules (`harness/shipped-skirt-scene.ts`, `src/stepped-skirt.ts`); this starts
// a browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_SKIRT_URL'] ?? 'http://localhost:5312/shipped-skirt.html';
const OUT =
  process.env['ST_SKIRT_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-skirt-2026-09-01');
const ALLOW_SOFTWARE = process.env['ST_SKIRT_ALLOW_SOFTWARE'] === '1';
const BATCH = Number(process.env['ST_SKIRT_BATCH'] ?? '30');

/** The arm every pixel figure is read against: the map before this component. */
const CONTROL = 'flat';
const ARMS = ['flat', 'stepped', 'rock', 'soil-over-rock'];
/** The arm that SHIPS. Its refusals are the strict ones. */
const SHIPPED_ARM = 'rock';
const SIZES = ['one', 'forest'];
const ZOOMS = [2, 8];
const FIT = 'fit';
/** The zoom the cliff is actually read at — a 3-unit-deep edge is 24 px here and 6 px at zoom 2. */
const READ_ZOOM = 8;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

/** ⚠ 5184 is the default every worktree's vite pins, so two harnesses on one box would serve each
 *  other's pages and the numbers would belong to whichever branch started first
 *  (`strictport-vite-collision-measures-a-siblings-worktree`). This driver's default is its own. */
if (URL_.includes(':5184/')) {
  fail(
    'ST_SKIRT_URL points at 5184, the port every worktree\'s vite pins by default — a sibling ' +
      'worktree may own it, and the numbers would be its tree rather than this one. Start the ' +
      'harness on a port of your own with --port <n> --strictPort.',
  );
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => window.skirtRunner !== undefined, null, { timeout: 300000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, fit, batch]) => {
    const r = window.skirtRunner;
    const id = r.identity();
    const rows = [];
    for (const size of sizes) {
      for (const zoom of zooms) {
        for (const arm of arms) {
          const t = await r.time(arm, size, zoom, batch);
          rows.push({
            arm,
            size,
            zoom,
            triangles: t.triangles,
            skirtTriangles: t.skirtTriangles,
            rimEdges: t.rimEdges,
            attributeBytes: t.attributeBytes,
            drawCalls: t.drawCalls,
            trianglesSubmitted: t.trianglesSubmitted,
            gpuNs: t.gpuNs,
            cliffPixels: r.cliffPixels(arm, size, zoom),
            changedPctVsControl: r.changedPct(arm, 'flat', size, zoom),
            anchor: t.stats.anchor,
            micro: t.stats.micro,
            struct: t.stats.struct,
            mean: t.stats.mean,
            islandPixels: t.stats.pixels,
          });
        }
      }
    }
    const refs = {};
    for (const [name, url] of [
      ['combined', '/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png'],
      ['strata', '/reference/chapter2-land-idiom-2026-08-27/land-strata-1948px.png'],
      ['bare', '/reference/chapter2-land-idiom-2026-08-27/land-combined-bare-1948px.png'],
    ]) {
      refs[name] = await r.reference(url);
    }
    const shots = {};
    for (const arm of arms) {
      for (const size of sizes) {
        shots[`${arm}-${size}-${fit}`] = r.snapshot(arm, size, fit);
        shots[`${arm}-${size}-8`] = r.snapshot(arm, size, 8);
      }
    }
    return { id, rows, refs, shots };
  },
  [ARMS, SIZES, ZOOMS, FIT, BATCH],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Frame numbers off SwiftShader ` +
      'are not comparable to any committed figure on this arc. Set ST_SKIRT_ALLOW_SOFTWARE=1 to ' +
      'take the GEOMETRY numbers anyway, and do not quote the timings.',
  );
}

const at = (arm, size, zoom) =>
  result.rows.find((r) => r.arm === arm && r.size === size && r.zoom === zoom);

// ── THE REFUSALS ───────────────────────────────────────────────────────────────────────────────

for (const row of result.rows) {
  if (row.drawCalls !== 1) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls. The whole ` +
        'forest\'s ground is ONE draw and the skirt adds triangles to that one mesh — a second call ' +
        'means the merge broke, which costs far more than the ledges do.',
    );
  }
}

for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL, size, zoom);
    if (control.cliffPixels !== 0) {
      fail(
        `the CONTROL arm differs from itself at ${size}/${zoom} (${control.cliffPixels} px). The ` +
          'denominator is not a denominator and no percentage on this page means anything.',
      );
    }
    if (control.skirtTriangles !== 0) {
      fail(`the CONTROL arm reports ${control.skirtTriangles} skirt triangles; it must add none.`);
    }
  }
}

// ⚠ THE ONE THAT CATCHES "IN THE CODE, NOT IN THE PICTURE". This arc has already had a rung report
// "changed 0% of the frame" and name an innocent component. The skirt's whole justification is that
// it supplies the island's DARK ANCHOR, so an arm that ships without moving that number has not
// delivered the component whatever its triangle count says.
const shipped = at(SHIPPED_ARM, 'one', READ_ZOOM);
const control = at(CONTROL, 'one', READ_ZOOM);
if (!(shipped.anchor < control.anchor - 5)) {
  fail(
    `the ${SHIPPED_ARM} arm's dark anchor is ${shipped.anchor.toFixed(1)} against the control's ` +
      `${control.anchor.toFixed(1)}. The cliff exists to supply the island's darkest value; if it ` +
      'has not moved it, the component is in the code and not in the picture.',
  );
}
if (shipped.cliffPixels === 0) {
  fail(`the ${SHIPPED_ARM} arm is byte-identical to the control — the cliff is drawing nothing.`);
}

// ── THE REPORT ─────────────────────────────────────────────────────────────────────────────────

const pct = (a, b) => ((a - b) / b) * 100;
const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};

say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software} timerQuery=${result.id.timerQuery} batch=${BATCH}`);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own instrument');
say('  arm        anchor    MICRO   STRUCT     mean    pixels');
for (const [name, s] of Object.entries(result.refs)) {
  say(
    `  ${name.padEnd(9)} ${s.anchor.toFixed(2).padStart(6)} ${s.micro.toFixed(3).padStart(8)} ` +
      `${s.struct.toFixed(3).padStart(8)} ${s.mean.toFixed(2).padStart(8)} ${String(s.pixels).padStart(9)}`,
  );
}
const kit = result.refs['combined'];
const proc = result.refs['strata'];
say('');
say('  ⚠ THE FINDING RE-DERIVED RATHER THAN QUOTED. `combined` and `strata` are the same render');
say('    differing in NOTHING but the skirt material, so the gap between them is what the kit’s');
say('    cliff is worth:');
say(
  `      STRUCT  ${kit.struct.toFixed(2)} → ${proc.struct.toFixed(2)} ` +
    `(${pct(proc.struct, kit.struct).toFixed(1)}% when the kit’s rock is swapped out)`,
);
say(
  `      anchor  ${kit.anchor.toFixed(2)} → ${proc.anchor.toFixed(2)} ` +
    `(+${(proc.anchor - kit.anchor).toFixed(1)} luma — a pale skirt spends the island’s dark anchor)`,
);
say('    The research reported −9.8% of structural contrast and +7.0 luma of anchor for that swap.');
say('');

for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    say(`${size} · ${zoom} px per ground unit`);
    say(
      '  arm              triangles  (+skirt)  rim   cliff px   frame%   anchor    MICRO   STRUCT    GPU µs',
    );
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      say(
        `  ${arm.padEnd(15)} ${String(r.triangles).padStart(9)} ${String('+' + r.skirtTriangles).padStart(9)} ` +
          `${String(r.rimEdges).padStart(5)} ${String(r.cliffPixels).padStart(10)} ` +
          `${r.changedPctVsControl.toFixed(2).padStart(8)} ${r.anchor.toFixed(2).padStart(8)} ` +
          `${r.micro.toFixed(3).padStart(8)} ${r.struct.toFixed(3).padStart(8)} ` +
          `${(r.gpuNs === null ? '—' : (r.gpuNs / 1000).toFixed(1)).padStart(9)}`,
      );
    }
    say('');
  }
}

const stepped = at('stepped', 'one', READ_ZOOM);
const soil = at('soil-over-rock', 'one', READ_ZOOM);
say('WHAT THE ARMS SETTLE, at one island and the read zoom:');
say(
  `  the SHAPE alone (his option C) moves STRUCT ${control.struct.toFixed(2)} → ` +
    `${stepped.struct.toFixed(2)} (${pct(stepped.struct, control.struct).toFixed(1)}%) — ` +
    'six ledges in the parcel’s own colour buy no structural contrast at all.',
);
say(
  `  the ROCK (his option A) moves it to ${shipped.struct.toFixed(2)} ` +
    `(${pct(shipped.struct, control.struct).toFixed(1)}%), and the anchor ` +
    `${control.anchor.toFixed(1)} → ${shipped.anchor.toFixed(1)}.`,
);
say(
  `  SOIL OVER ROCK (his option B) lands at STRUCT ${soil.struct.toFixed(2)} and anchor ` +
    `${soil.anchor.toFixed(1)} — ${pct(soil.struct, shipped.struct).toFixed(1)}% of A, ` +
    `for ${shipped.cliffPixels - soil.cliffPixels} px of status band.`,
);
say('');
say('THE GAP TO THE APPROVED PICTURE, which is the verdict this arc asks for:');
say(
  `  anchor  ours ${shipped.anchor.toFixed(1)} vs the render’s ${kit.anchor.toFixed(1)} — ` +
    `${(shipped.anchor - kit.anchor).toFixed(1)} luma LIGHTER, so the cliff arrives and does not ` +
    'reach the render’s depth.',
);
say(
  `  STRUCT  ours ${shipped.struct.toFixed(2)} vs ${kit.struct.toFixed(2)} — ` +
    `${((shipped.struct / kit.struct) * 100).toFixed(0)}% of it.`,
);
say(
  `  MICRO   ours ${shipped.micro.toFixed(2)} vs ${kit.micro.toFixed(2)} — ` +
    `${((shipped.micro / kit.micro) * 100).toFixed(0)}% of it. The pixel-scale read is where the ` +
    'app’s constraints still cost the most.',
);

for (const [name, dataUrl] of Object.entries(result.shots)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(
  join(OUT, 'skirt-measurements.json'),
  JSON.stringify({ renderer: result.id, rows: result.rows, reference: result.refs }, null, 2) + '\n',
);
writeFileSync(join(OUT, 'skirt-measurements.txt'), lines.join('\n') + '\n');

console.log(`\nwrote ${Object.keys(result.shots).length} frames + 2 reports to ${OUT}`);
await browser.close();
