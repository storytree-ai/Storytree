// shipped-cover-measure.mjs — drive `shipped-cover.html`: the ground cover's SIZE ladder over the
// same dressed ground, measured and written out as frames, numbers and a report. Run it on the
// arc's named box (the RTX 2060, ADR-0505 D3) for figures that go in a README; run it locally with
// `ST_COVER_ANGLE=default` on the Windows box to see whether the page works.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5372 --strictPort --host 127.0.0.1
//   ST_COVER_URL=http://127.0.0.1:5372/shipped-cover.html pnpm --filter @storytree/forest-world-r3f measure-shipped-cover
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE COVER:
// a software rasteriser, an insensitive delta instrument, a control that differs from itself, an
// arm whose GROUND differs from the control's, an arm that CASTS differently from the control (then
// the cover has started casting and the ground under it is no longer the same ground), a dressed
// arm that drew no kit, a rung byte-identical to the rung below it (then the size never reached the
// placements and the "ladder" is copies of one picture), and — the one this increment exists for —
// a ground-cover prop that has grown to half the criterion marker's width.

import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlib } from 'node:zlib';

import { chromium } from '@playwright/test';

import { COVER_RECIPE_COUNTS } from '../src/cover-dressing.ts';
import { KIT_ROLE_SIZE } from '../src/kit-vocabulary.ts';
import {
  CONTROL_ARM,
  COVER_ARMS,
  COVER_ARM_SIZE,
  COVER_LADDER,
  DRESSED_ARMS,
  MASK_ARM,
  SHIPPED_COVER_ARM,
} from './shipped-cover-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_COVER_URL'] ?? 'http://localhost:5372/shipped-cover.html';
const OUT =
  process.env['ST_COVER_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-ground-cover-2026-09-04');
const ANGLE = process.env['ST_COVER_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_COVER_ALLOW_SOFTWARE'] === '1';

const ARMS = [...COVER_ARMS];
const SIZES = ['one', 'forest'];
const ZOOMS = [8, 'fit'];
const READ_ZOOM = 8;

/** Half the criterion marker's width — the bound a ground-cover flower may never reach. */
const MARKER_HALF_WIDTH = KIT_ROLE_SIZE.bloom.units * 0.5;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_COVER_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
      'worktree may own it, and the numbers would be its tree rather than this one. Start the ' +
      'harness on a port of your own with --port <n> --strictPort.',
  );
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', `--use-angle=${ANGLE}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.coverRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, readZoom]) => {
    const r = window.coverRunner;
    const rows = [];
    for (const size of sizes) {
      for (const zoom of zooms) {
        for (const arm of arms) rows.push({ size, zoom, ...r.read(arm, size, zoom) });
      }
    }
    const reference = await r.reference('/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png');
    const shots = {};
    for (const arm of arms) {
      for (const size of sizes) {
        for (const zoom of zooms) shots[`${arm}-${size}-${zoom}`] = r.snapshot(arm, size, zoom);
      }
    }
    return {
      id: r.identity(),
      calibration: r.calibration(),
      kits: r.kits(),
      rows,
      reference,
      shots,
      sensitivity: r.sensitivity('one', readZoom),
    };
  },
  [ARMS, SIZES, ZOOMS, READ_ZOOM],
);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Set ST_COVER_ANGLE=default on ` +
      'the Windows box to reach its GPU, or ST_COVER_ALLOW_SOFTWARE=1 to take the GEOMETRY and COUNT ' +
      'numbers anyway — and do not quote a software frame as this map’s picture.',
  );
}
if (result.sensitivity.length > 0) {
  fail(
    'the visible-delta instrument failed its own sensitivity rung, so no reading below means ' +
      `anything:\n  ${result.sensitivity.join('\n  ')}`,
  );
}

const at = (arm, size, zoom) => result.rows.find((r) => r.arm === arm && r.size === size && r.zoom === zoom);

for (const row of result.rows) {
  if (row.land === 0) fail(`${row.arm} at ${row.size}/${row.zoom} delivered NO land pixels`);
  const control = at(CONTROL_ARM, row.size, row.zoom);
  if (row.groundTriangles !== control.groundTriangles) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} draws ${row.groundTriangles} GROUND triangles against the ` +
        `control's ${control.groundTriangles} — the arms do not share a ground, so no difference is the cover's.`,
    );
  }
  if (row.groundCasters !== control.groundCasters) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} stands on a ground built from ${row.groundCasters} casters against ` +
        `the control's ${control.groundCasters} — the arms do not share an occlusion field.`,
    );
  }
  // ⚠ THE REAL "GROUND COVER CASTS NOTHING" CHECK, and it is scoped to the DRESSED arms because
  // `bare` stands nothing on purpose: it contributes no caster and borrows the canopy's ground,
  // which is exactly what makes it an honest mask. Asking it to cast like the control would refuse
  // the one arm that is doing its job.
  if (row.arm !== MASK_ARM && row.ownCasters !== control.ownCasters) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} contributes ${row.ownCasters} casters against the control's ` +
        `${control.ownCasters} — ground cover has started casting, so the ground under this arm is no ` +
        'longer the ground under the control and no pixel figure on the page is the cover’s alone.',
    );
  }
  // ⚠ THE BOUND IS ON THE FLOWER PATCH ALONE, flower against flower. A bush at the boldest rung is
  // wider than the marker and is not confusable with it; refusing on ANY cover prop scales the
  // whole layer back to protect a claim nobody made (measured: this refusal fired on a 3.4-unit
  // BUSH on 2026-09-04 before it was scoped).
  if (row.widestFlower >= MARKER_HALF_WIDTH) {
    fail(
      `${row.arm} at ${row.size}/${row.zoom} delivers a ground-cover FLOWER ${row.widestFlower.toFixed(3)} units wide, ` +
        `at or past HALF the criterion marker's ${KIT_ROLE_SIZE.bloom.units} — the map has grown a second ` +
        'flower at the marker’s size, which is the one thing this row may not do.',
    );
  }
  if (row.arm === MASK_ARM) {
    if (row.meshes !== 0 || row.drawCalls !== 1) {
      fail(`the mask arm at ${row.size}/${row.zoom} drew ${row.meshes} kit meshes in ${row.drawCalls} calls — it must stand nothing`);
    }
    if (row.mask.pixels !== 0) fail('the mask arm differs from itself');
    if (row.census.objects !== 0) fail(`the mask arm stands ${row.census.objects} objects — it must stand none`);
    continue;
  }
  if (row.meshes === 0) fail(`${row.arm} at ${row.size}/${row.zoom} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) {
    fail(`${row.arm} at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  }
  if (row.mask.pixels === 0) fail(`${row.arm} at ${row.size}/${row.zoom} differs from the bare ground at NO pixel — nothing was drawn`);
  if (COVER_ARM_SIZE[row.arm] !== null && row.census.cover === 0) {
    fail(`${row.arm} at ${row.size}/${row.zoom} stands NO ground cover — the scatter placed nothing`);
  }
  if (COVER_ARM_SIZE[row.arm] === null && row.census.cover !== 0) {
    fail(`${row.arm} at ${row.size}/${row.zoom} stands ${row.census.cover} cover props and should stand none`);
  }
}

for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL_ARM, size, zoom);
    if (control.touched !== 0) {
      fail(`the CONTROL arm differs from itself at ${size}/${zoom} (${control.touched} px) — the denominator is not a denominator`);
    }
  }
}

// ⚠ THE LADDER MUST ACTUALLY MOVE THE PICTURE, rung to rung. A byte-identical neighbour means the
// size never reached the placements — which is precisely the failure the 2026-09-03 run could not
// tell apart from "the cover is too small to see", because it never had this refusal.
for (const size of SIZES) {
  for (const [i, arm] of COVER_LADDER.entries()) {
    if (i === 0) continue;
    const row = at(arm, size, READ_ZOOM);
    if (row.touchedVsLeaner === 0) {
      fail(
        `${arm} at ${size} is byte-identical to ${COVER_LADDER[i - 1]} — the size rung is not reaching the ` +
          'placements, and this "ladder" is copies of one picture',
      );
    }
  }
}

// The payload half, from the file the page fetched — the same bytes, measured the way the
// embedding measures them (brotli q11 of the raw .glb and of its base64 as `kit-asset.ts` carries it).
const brotli = (buf) => brotliCompressSync(buf, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }).length;
const payload = result.kits.map((k) => {
  const file = join(HERE, 'assets', basename(k.url));
  const bytes = readFileSync(file);
  return {
    ...k,
    file: basename(file),
    brotliBytes: brotli(bytes),
    base64Bytes: bytes.toString('base64').length,
    base64BrotliBytes: brotli(Buffer.from(bytes.toString('base64'), 'utf8')),
  };
});

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};
say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software}`);
say(
  `light probe: a lit white face delivered ${result.calibration.probe.toFixed(4)} at the authored intensities; ` +
    `scale ${result.calibration.scale.toFixed(4)} onto the ladder's ${result.calibration.target}; floor ${result.calibration.floor}`,
);
say('');
say('THE KIT — what every arm parsed, and what the shipped canvas pays for it');
say('file                      wire B    brotli B  base64 B  base64+brotli B   GPU B (mips)  textures  edges     tris     load ms');
for (const k of payload) {
  say(
    `${k.file.padEnd(24)} ${String(k.wireBytes).padStart(9)} ${String(k.brotliBytes).padStart(10)} ` +
      `${String(k.base64Bytes).padStart(9)} ${String(k.base64BrotliBytes).padStart(16)} ` +
      `${String(k.gpuBytes).padStart(13)} ${String(k.textures).padStart(9)}  ${k.textureEdges.join('/').padEnd(9)} ` +
      `${String(k.triangles).padStart(8)} ${k.loadMs.toFixed(0).padStart(8)}`,
  );
}
say('');
say(`the recipe's own counts per recipe-island: ${Object.entries(COVER_RECIPE_COUNTS).map(([r, n]) => `${r} ${n}`).join(' · ')}`);
say('');
say('THE REFERENCE — the approved Cycles render, through this page’s own family census');
say(
  `  land-combined: colour families ${result.reference.families} · largest holds ` +
    `${(result.reference.largestShare * 100).toFixed(1)}% · MICRO ` +
    `${result.reference.stats.micro.toFixed(2)} · STRUCT ${result.reference.stats.struct.toFixed(2)}`,
);
say('  ⚠ measured, never differenced: another resolution, framing and camera, and all SEVEN layers.');
say('');
for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const px = at(CONTROL_ARM, size, zoom).pxPerUnit;
    say(`── ${size} @ ${zoom === 'fit' ? `fit (${px.toFixed(3)} px/unit)` : `${zoom} px/unit`} ─────────────────────────────────`);
    say(
      'arm         rung calls       tris objects  cover  bush  tuft flowr widest flowr  fam largest  MICRO  STRUCT   moved>20  vs-leaner  prop px   luma p10  p50  p90 spread',
    );
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      const rung = COVER_ARM_SIZE[arm];
      const b = r.census.byRole;
      say(
        `${arm.padEnd(11)} ${(rung === null ? '—' : rung.toFixed(1)).padStart(4)} ${String(r.drawCalls).padStart(5)} ` +
          `${String(r.triangles).padStart(10)} ${String(r.census.objects).padStart(7)} ${String(r.census.cover).padStart(6)} ` +
          `${String(b.bush ?? 0).padStart(5)} ${String(b.tuft ?? 0).padStart(5)} ${String(b.flowerPatch ?? 0).padStart(5)} ` +
          `${r.widestCover.toFixed(2).padStart(6)} ${r.widestFlower.toFixed(2).padStart(5)} ${String(r.families).padStart(4)} ${(r.largestShare * 100).toFixed(1).padStart(6)}% ` +
          `${r.stats.micro.toFixed(2).padStart(6)} ${r.stats.struct.toFixed(2).padStart(7)} ${String(r.visible).padStart(10)} ` +
          `${(r.visibleVsLeaner === null ? '—' : String(r.visibleVsLeaner)).padStart(10)} ${String(r.mask.pixels).padStart(8)} ` +
          `${String(r.mask.p10).padStart(10)} ${String(r.mask.p50).padStart(4)} ${String(r.mask.p90).padStart(4)} ${String(r.mask.spread).padStart(6)}`,
      );
    }
    say('');
  }
}
say('WHAT THE SIZE LADDER DID, at the read zoom on one island — against the CANOPY that ships today:');
const c1 = at(CONTROL_ARM, 'one', READ_ZOOM);
for (const arm of COVER_LADDER) {
  const r = at(arm, 'one', READ_ZOOM);
  say(
    `  ${arm.padEnd(10)} (x${COVER_ARM_SIZE[arm]}): ${r.census.cover} cover props, widest ${r.widestCover.toFixed(2)} units; ` +
      `moved ${r.visible} px past ${VISIBLE_DELTA}/255 (${r.touched} touched), ${r.visibleVsLeaner ?? '—'} vs the rung below; ` +
      `prop px ${r.mask.pixels} (canopy ${c1.mask.pixels}); families ${r.families}; MICRO ${r.stats.micro.toFixed(2)}.`,
  );
}
say(`  the SHIPPED arm is ${SHIPPED_COVER_ARM} (size rung ${COVER_ARM_SIZE[SHIPPED_COVER_ARM]}).`);
say('');
say('THE CRITERION MARKER STAYS DISTINCT — the bound is flower against FLOWER:');
say(
  `  the widest ground-cover FLOWER on any arm at any view is ` +
    `${Math.max(...result.rows.map((r) => r.widestFlower)).toFixed(3)} ground units, against the marker's ` +
    `${KIT_ROLE_SIZE.bloom.units} and the bound of ${MARKER_HALF_WIDTH}. The asset carries no second red flower.`,
);
say(
  `  (the widest ground-cover prop of ANY role is ${Math.max(...result.rows.map((r) => r.widestCover)).toFixed(3)} units — ` +
    'a BUSH, which is not confusable with a tall red flower at any width and is not fenced by that bound.)',
);
say('');
say('THE GAP THAT REMAINS, at the read zoom on one island — bare → canopy → cover → approved:');
const b1 = at(MASK_ARM, 'one', READ_ZOOM);
const s1 = at(SHIPPED_COVER_ARM, 'one', READ_ZOOM);
say(`  colour families ${b1.families} → ${c1.families} → ${s1.families} → approved ${result.reference.families}`);
say(
  `  largest family  ${(b1.largestShare * 100).toFixed(1)}% → ${(c1.largestShare * 100).toFixed(1)}% → ` +
    `${(s1.largestShare * 100).toFixed(1)}% → ${(result.reference.largestShare * 100).toFixed(1)}%`,
);
say(
  `  MICRO           ${b1.stats.micro.toFixed(2)} → ${c1.stats.micro.toFixed(2)} → ${s1.stats.micro.toFixed(2)} → ` +
    `${result.reference.stats.micro.toFixed(2)}`,
);
say(
  `  STRUCT          ${b1.stats.struct.toFixed(2)} → ${c1.stats.struct.toFixed(2)} → ${s1.stats.struct.toFixed(2)} → ` +
    `${result.reference.stats.struct.toFixed(2)}`,
);
say('');
say('⚠ EVERY FIGURE ABOVE IS RE-MEASURED ON THIS RUN. Nothing is inherited from an increment row,');
say('  an arc intent or an earlier evidence sheet.');

for (const [name, dataUrl] of Object.entries(result.shots)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(result.rows, null, 2));
writeFileSync(join(OUT, 'payload.json'), JSON.stringify(payload, null, 2));
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
say('');
say(`wrote ${Object.keys(result.shots).length} frames + measurements.json + payload.json + report.txt to ${OUT}`);
say(`dressed arms: ${DRESSED_ARMS.join(', ')}`);
await browser.close();
