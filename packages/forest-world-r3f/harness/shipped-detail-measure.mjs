// shipped-detail-measure.mjs — drive `shipped-detail.html`: the kit's texture rung and the crown
// lighting ladder over the SAME dressed ground, measured and written out as frames, numbers and a
// report. Run it on the arc's named box (the RTX 2060, ADR-0505 D3) for figures that go in a README;
// run it locally with `ST_DETAIL_ANGLE=default` on the Windows box to see whether the page works.
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5371 --strictPort --host 127.0.0.1
//   ST_DETAIL_URL=http://127.0.0.1:5371/shipped-detail.html pnpm --filter @storytree/forest-world-r3f measure-shipped-detail
//
// ⚠ EVERY REFUSAL BELOW IS A WAY THIS PAGE COULD REPORT ON SOMETHING OTHER THAN THE TREES:
// a software rasteriser, an insensitive delta instrument, a control that differs from itself, an
// arm whose ground differs from the control's (then the number is another change wearing this
// increment's name), a dressed arm that drew no kit, or a crown rung that is byte-identical to the
// rung above it (then the material patch never reached the compiled program and the "ladder" is
// six copies of one picture).

import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlib } from 'node:zlib';

import { chromium } from '@playwright/test';

import {
  CONTROL_ARM,
  CROWN_ARMS,
  DETAIL_ARMS,
  DETAIL_ARM_FRACTION,
  DETAIL_ARM_KIT,
  DRESSED_ARMS,
  MASK_ARM,
  SHIPPED_DETAIL_ARM,
} from './shipped-detail-scene.ts';
import { VISIBLE_DELTA } from './visible-delta.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_DETAIL_URL'] ?? 'http://localhost:5371/shipped-detail.html';
const OUT =
  process.env['ST_DETAIL_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-tree-detail-2026-09-04');
const ANGLE = process.env['ST_DETAIL_ANGLE'] ?? 'gl';
const ALLOW_SOFTWARE = process.env['ST_DETAIL_ALLOW_SOFTWARE'] === '1';

const ARMS = [...DETAIL_ARMS];
const SIZES = ['one', 'forest'];
const ZOOMS = [8, 'fit'];
const READ_ZOOM = 8;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_DETAIL_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
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
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => window.detailRunner !== undefined, null, { timeout: 300000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(
  async ([arms, sizes, zooms, readZoom]) => {
    const r = window.detailRunner;
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
    `the renderer is a software rasterizer (${result.id.renderer}). Set ST_DETAIL_ANGLE=default on ` +
      'the Windows box to reach its GPU, or ST_DETAIL_ALLOW_SOFTWARE=1 to take the GEOMETRY and COUNT ' +
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
        `control's ${control.groundTriangles} — the arms do not share a ground, so no difference here is the trees'.`,
    );
  }
  if (row.placements !== control.placements || row.groves !== control.groves) {
    fail(`${row.arm} at ${row.size}/${row.zoom} stands ${row.placements} objects against the control's ${control.placements}`);
  }
  if (row.arm === MASK_ARM) {
    if (row.meshes !== 0 || row.drawCalls !== 1) {
      fail(`the mask arm at ${row.size}/${row.zoom} drew ${row.meshes} kit meshes in ${row.drawCalls} calls — it must stand nothing`);
    }
    if (row.mask.pixels !== 0) fail('the mask arm differs from itself');
    continue;
  }
  if (row.meshes === 0) fail(`${row.arm} at ${row.size}/${row.zoom} drew ZERO kit meshes — the kit did not load`);
  if (row.drawCalls !== 1 + row.meshes) {
    fail(`${row.arm} at ${row.size}/${row.zoom} submits ${row.drawCalls} draw calls for the ground plus ${row.meshes} merged meshes`);
  }
  if (row.mask.pixels === 0) fail(`${row.arm} at ${row.size}/${row.zoom} differs from the bare ground at NO pixel — nothing was drawn`);
}

for (const size of SIZES) {
  for (const zoom of ZOOMS) {
    const control = at(CONTROL_ARM, size, zoom);
    if (control.touched !== 0) {
      fail(`the CONTROL arm differs from itself at ${size}/${zoom} (${control.touched} px) — the denominator is not a denominator`);
    }
  }
}

// The crown ladder must actually MOVE the picture rung to rung — a byte-identical neighbour means
// the patch never reached the compiled program.
for (const size of SIZES) {
  for (const [i, arm] of CROWN_ARMS.entries()) {
    if (i === 0) continue;
    const row = at(arm, size, READ_ZOOM);
    if (row.touchedVsLeaner === 0) {
      fail(
        `${arm} at ${size} is byte-identical to ${CROWN_ARMS[i - 1]} — the prop-lighting patch is not in the ` +
          'compiled program, and this "ladder" is copies of one picture',
      );
    }
  }
}

// The payload half, from the files the page fetched — the same bytes, measured the way the
// embedding measures them (brotli q11 of the raw .glb and of its base64 as `kit-asset.ts` carries it).
const brotli = (buf) =>
  brotliCompressSync(buf, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }).length;
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
say('THE KITS — what each arm parsed, and what the shipped canvas would pay for it');
say('file                      wire B    brotli B  base64 B  base64+brotli B   GPU B (mips)  textures  edges     data slots            load ms');
for (const k of payload) {
  say(
    `${k.file.padEnd(24)} ${String(k.wireBytes).padStart(9)} ${String(k.brotliBytes).padStart(10)} ` +
      `${String(k.base64Bytes).padStart(9)} ${String(k.base64BrotliBytes).padStart(16)} ` +
      `${String(k.gpuBytes).padStart(13)} ${String(k.textures).padStart(9)}  ${k.textureEdges.join('/').padEnd(9)} ` +
      `${k.dataSlots.join(',').padEnd(21)} ${k.loadMs.toFixed(0).padStart(7)}`,
  );
}
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
    say('arm             fraction calls      tris   fam largest  MICRO  STRUCT  moved>20   touched  vs-leaner>20  crown px  luma p10  p50  p90  spread  mean');
    for (const arm of ARMS) {
      const r = at(arm, size, zoom);
      const f = DETAIL_ARM_FRACTION[arm];
      say(
        `${arm.padEnd(15)} ${(f === null ? '—' : f.toFixed(2)).padStart(8)} ${String(r.drawCalls).padStart(5)} ` +
          `${String(r.triangles).padStart(9)} ${String(r.families).padStart(5)} ${(r.largestShare * 100).toFixed(1).padStart(6)}% ` +
          `${r.stats.micro.toFixed(2).padStart(6)} ${r.stats.struct.toFixed(2).padStart(7)} ${String(r.visible).padStart(9)} ` +
          `${String(r.touched).padStart(9)} ${(r.visibleVsLeaner === null ? '—' : String(r.visibleVsLeaner)).padStart(13)} ` +
          `${String(r.mask.pixels).padStart(9)} ${String(r.mask.p10).padStart(9)} ${String(r.mask.p50).padStart(4)} ` +
          `${String(r.mask.p90).padStart(4)} ${String(r.mask.spread).padStart(7)} ${r.mask.meanLuma.toFixed(1).padStart(5)}`,
      );
    }
    say('');
  }
}
say('WHAT EACH HALF DID, at the read zoom on one island:');
const c1 = at(CONTROL_ARM, 'one', READ_ZOOM);
const n1 = at('texture-native', 'one', READ_ZOOM);
say(
  `  texture: 128 → native moved ${n1.visible} px past ${VISIBLE_DELTA}/255 (${n1.touched} touched); ` +
    `crown luma spread ${c1.mask.spread} → ${n1.mask.spread}; families ${c1.families} → ${n1.families}; ` +
    `MICRO ${c1.stats.micro.toFixed(2)} → ${n1.stats.micro.toFixed(2)}.`,
);
for (const arm of CROWN_ARMS.slice(1)) {
  const r = at(arm, 'one', READ_ZOOM);
  say(
    `  ${arm} (unlit face at ${(DETAIL_ARM_FRACTION[arm] * 100).toFixed(0)}%): moved ${r.visible} px vs today, ` +
      `${r.visibleVsLeaner} vs the rung above; crown luma p10/p50/p90 ${r.mask.p10}/${r.mask.p50}/${r.mask.p90} ` +
      `(spread ${r.mask.spread}); families ${r.families}; MICRO ${r.stats.micro.toFixed(2)}.`,
  );
}
say(`  the SHIPPED arm is ${SHIPPED_DETAIL_ARM} (kit ${DETAIL_ARM_KIT[SHIPPED_DETAIL_ARM]}, fraction ${DETAIL_ARM_FRACTION[SHIPPED_DETAIL_ARM]}).`);
say('');
say('THE GAP THAT REMAINS, at the read zoom on one island:');
const s1 = at(SHIPPED_DETAIL_ARM, 'one', READ_ZOOM);
say(
  `  today ${c1.families} families → shipped ${s1.families} → approved ${result.reference.families}. ` +
    `MICRO ${c1.stats.micro.toFixed(2)} → ${s1.stats.micro.toFixed(2)} → ${result.reference.stats.micro.toFixed(2)}; ` +
    `STRUCT ${c1.stats.struct.toFixed(2)} → ${s1.stats.struct.toFixed(2)} → ${result.reference.stats.struct.toFixed(2)}.`,
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
