// shipped-status-measure.mjs — DRIVER for "does the shipped map still tell the truth?": the real
// 35-island fixture forest, on the shipped ground stack, read back through
// `harness/status-truth.ts` at both of this arc's zooms.
//
// THE INCREMENT: `demonstrate-the-map-still-reports-truth` on
// `adopt-the-land-into-the-shipped-map-arc`, end-state item 3 — the fence the whole land programme
// could fail without noticing, because a prettier map that misreports is a regression, not an
// improvement. This is the increment that asks the question ONCE, of the finished thing, across
// every status, rather than trusting each layer's own per-landing look.
//
// ⚠⚠ THE REFUSALS. The run fails if: the renderer is a software rasteriser (unless allowed); ANY
// non-empty island's read family is not its own (an island that was genuinely IN FRAME with real
// ground pixels, but voted for a foreign status — printed by name); any status was judged at fewer
// than TWO zooms (2 AND 8 px/unit — an island entirely off-frame at a given zoom is skipped there,
// never counted as a pass or a fail, so this refusal is what catches a status the fixture never let
// the instrument see at all); or the pair-separation table's zero set is anything other than
// EXACTLY `{proposed, building}` — ADR-0462's own decision, and the one identity this page expects.
//
// An "EMPTY" island (in the geometric frame, but with no actual ground pixels once the rect is
// shrunk and the background excluded) is neither a pass nor a fail — it was not judged there, and
// is reported as such rather than folded into either count.
//
// Reproduce (⚠ needs a real GPU — every committed frame figure on this arc comes off a discrete GPU):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5361 --strictPort --host 127.0.0.1
//   ST_STATUS_URL=http://127.0.0.1:5361/shipped-status.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-status
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`harness/status-truth.ts`, `harness/shipped-status-scene.ts`);
// this starts a browser, walks one page and decides an exit code
// (`measurement-instrument-must-be-typechecked`).

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_STATUS_URL'] ?? 'http://localhost:5361/shipped-status.html';
const OUT =
  process.env['ST_STATUS_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-six-status-truth-2026-09-02');
const ALLOW_SOFTWARE = process.env['ST_STATUS_ALLOW_SOFTWARE'] === '1';
const ZOOMS = [2, 8];

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

// ⚠ 5184 is the default every worktree's vite pins, and 5347 is the skirt page's own fixed port —
// two harnesses on either would serve a SIBLING worktree's page, and the numbers would belong to
// whichever branch started first (`strictport-vite-collision-measures-a-siblings-worktree`). This
// driver's port (5361) is its own.
if (URL_.includes(':5184/') || URL_.includes(':5347/')) {
  fail(
    'ST_STATUS_URL points at a port another page on this arc already pins (5184 the shared vite ' +
      'default, 5347 the skirt page) — a sibling worktree or a sibling page may own it, and the ' +
      'numbers would not be this run\'s. Start the harness on a port of your own, e.g. --port 5361.',
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
await page.waitForFunction(() => window.statusRunner !== undefined, null, { timeout: 300000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const result = await page.evaluate(async ([zooms]) => {
  const r = window.statusRunner;
  const id = r.identity();
  const offsets = r.islandOffsets();
  const statuses = [...new Set(offsets.map((o) => o.status))].sort();

  // frames[zoom] -> { verdict, snapshot, centre, recentredOn: string|null }
  const frames = [];
  const shots = {};

  for (const zoom of zooms) {
    const v0 = r.verdict(zoom);
    frames.push({ zoom, centre: { x: 0, z: 0 }, recentredOn: null, verdict: v0 });
    shots[`forest-${zoom}`] = r.snapshot(zoom);

    // geometric presence — a status the fixture places where this frame's projection reaches at
    // all, regardless of whether any of its islands came back empty after the pixel-level check.
    const present = new Set(v0.islands.map((isl) => isl.status));
    for (const status of statuses) {
      if (present.has(status)) continue;
      const target = offsets.find((o) => o.status === status);
      if (target === undefined) continue;
      const centre = { x: target.x, z: target.z };
      const v = r.verdict(zoom, centre);
      frames.push({ zoom, centre, recentredOn: target.id, verdict: v });
      shots[`forest-${zoom}-recentred-${status}`] = r.snapshot(zoom, centre);
    }
  }

  const pairs = r.pairs();
  return { id, statuses, frames, pairs, shots };
}, [ZOOMS]);

if (result.id.software && !ALLOW_SOFTWARE) {
  fail(
    `the renderer is a software rasterizer (${result.id.renderer}). Frame numbers off SwiftShader ` +
      'are not comparable to any committed figure on this arc. Set ST_STATUS_ALLOW_SOFTWARE=1 to ' +
      'take the geometry anyway, and do not quote it as a timing.',
  );
}

// ── THE REFUSALS ───────────────────────────────────────────────────────────────────────────────

const judgedZoomsByStatus = new Map(); // status -> Set<zoom>
const failures = []; // { id, status, zoom, readFamily, ownShare, foreignShare }
let judgedCount = 0;
let emptyCount = 0;

for (const f of result.frames) {
  for (const isl of f.verdict.islands) {
    if (isl.empty) {
      emptyCount += 1;
      continue;
    }
    judgedCount += 1;
    const set = judgedZoomsByStatus.get(isl.status) ?? new Set();
    set.add(f.zoom);
    judgedZoomsByStatus.set(isl.status, set);
    if (!isl.pass) {
      failures.push({
        id: isl.id,
        status: isl.status,
        zoom: f.zoom,
        recentredOn: f.recentredOn,
        readFamily: isl.readFamily,
        ownShare: isl.ownShare,
        foreignShare: isl.foreignShare,
      });
    }
  }
}

if (failures.length > 0) {
  const lines = failures.map(
    (f) =>
      `  ${f.id} (status=${f.status}) at ${f.zoom}px/unit${f.recentredOn ? ` recentred on ${f.recentredOn}` : ''}: ` +
      `read as ${f.readFamily} (own ${(f.ownShare * 100).toFixed(1)}%, foreign ${(f.foreignShare * 100).toFixed(1)}%)`,
  );
  fail(`${failures.length} island(s) read as a state they do not hold:\n${lines.join('\n')}`);
}

const underJudged = result.statuses.filter((s) => (judgedZoomsByStatus.get(s)?.size ?? 0) < 2);
if (underJudged.length > 0) {
  fail(
    `${underJudged.length} status(es) were judged at fewer than two zooms: ${underJudged.join(', ')} — ` +
      'the fixture never placed a non-empty island of that status where either frame could see it.',
  );
}

const zeroPairs = result.pairs.filter((p) => p.minDistance === 0);
const zeroSet = new Set(zeroPairs.flatMap((p) => [p.a, p.b]));
const expectedZero = new Set(['building', 'proposed']);
const zeroSetMatches =
  zeroPairs.length === 1 && zeroSet.size === 2 && [...zeroSet].every((s) => expectedZero.has(s));
if (!zeroSetMatches) {
  fail(
    `the pair-separation table's zero set is ${JSON.stringify(zeroPairs)}, not exactly ` +
      '{proposed, building} — either a second pair has silently lost its separation, or the ' +
      'decided pair has gained one back.',
  );
}

// ── THE REPORT ─────────────────────────────────────────────────────────────────────────────────

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};

say(`renderer: ${result.id.vendor} — ${result.id.renderer}`);
say(`software=${result.id.software}`);
say('');
say(`${result.statuses.length} statuses in the fixture: ${result.statuses.join(', ')}`);
say(`${judgedCount} island-reads judged, ${emptyCount} empty (off-frame or all-background after the rect shrink)`);
say(`${failures.length} FAIL`);
say('');

for (const f of result.frames) {
  const passCount = f.verdict.islands.filter((isl) => isl.pass).length;
  const emptyHere = f.verdict.islands.filter((isl) => isl.empty).length;
  const failHere = f.verdict.islands.length - passCount - emptyHere;
  const where = f.recentredOn ? `recentred on ${f.recentredOn}` : 'default centre';
  say(
    `${f.zoom}px/unit, ${where}: ${f.verdict.islands.length} in frame — ${passCount} PASS, ` +
      `${failHere} FAIL, ${emptyHere} EMPTY`,
  );
  for (const isl of f.verdict.islands) {
    const verdict = isl.empty ? 'EMPTY' : isl.pass ? 'PASS' : 'FAIL';
    say(
      `  ${isl.id.padEnd(16)} status=${isl.status.padEnd(9)} read=${(isl.readFamily ?? '—').padEnd(9)} ` +
        `own=${(isl.ownShare * 100).toFixed(1).padStart(5)}% foreign=${(isl.foreignShare * 100).toFixed(1).padStart(5)}% ${verdict}`,
    );
  }
  say('');
}

say('per-status zoom coverage:');
for (const status of result.statuses) {
  const zooms = [...(judgedZoomsByStatus.get(status) ?? new Set())].sort((a, b) => a - b);
  say(`  ${status.padEnd(10)} judged at: ${zooms.join(', ') || '(none)'}`);
}
say('');

say('the pair-separation table (minimum colour distance between every pair\'s delivered-colour sets):');
for (const p of result.pairs) {
  say(`  ${p.a.padEnd(10)} ${p.b.padEnd(10)} ${p.minDistance.toFixed(2).padStart(8)}${p.minDistance === 0 ? '  <- ADR-0462: one token, two keys' : ''}`);
}

for (const [name, dataUrl] of Object.entries(result.shots)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
writeFileSync(
  join(OUT, 'status-truth.json'),
  JSON.stringify({ renderer: result.id, statuses: result.statuses, frames: result.frames, pairs: result.pairs }, null, 2) + '\n',
);
writeFileSync(join(OUT, 'status-truth.txt'), lines.join('\n') + '\n');

console.log(`\nwrote ${Object.keys(result.shots).length} frames + 2 reports to ${OUT}`);
await browser.close();
