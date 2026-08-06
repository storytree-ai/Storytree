#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import {
  CAMERA_RASTERISATION_EXPECTED_ISLANDS,
  CAMERA_RASTERISATION_PROTOCOL,
  assessCameraRasterisationRun,
  formatCameraRasterisationComparisonTable,
  summariseCameraRasterisationRuns,
} from '../src/components/cameraRasterisationProbe.ts';

const VIEWPORT = { width: 1600, height: 1000 };
const VARIANTS = ['growth-only', 'final-product'];

function readArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!arg?.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    values.set(arg.slice(2), value);
    i += 1;
  }
  for (const required of ['url', 'output', 'build']) {
    if (!values.has(required)) throw new Error(`--${required} is required`);
  }
  const repeats = Number(values.get('repeats') ?? 2);
  if (!Number.isInteger(repeats) || repeats < 2) throw new Error('--repeats must be an integer >= 2');
  const url = new URL(values.get('url'));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('--url must be an HTTP(S) production URL');
  return { url, output: resolve(values.get('output')), build: values.get('build'), repeats };
}

function diagnosticUrl(base, variant) {
  const url = new URL(base);
  url.searchParams.set('cameraRasterisation', 'probe');
  url.searchParams.set('cameraVariant', variant);
  url.hash = '/tree';
  return url.href;
}

async function observeIdleFloor(page, frameCount = 18) {
  const frameDeltasMs = await page.evaluate((count) => new Promise((resolveFloor) => {
    const deltas = [];
    let previous = null;
    const observe = (timestamp) => {
      if (previous !== null) deltas.push(timestamp - previous);
      previous = timestamp;
      if (deltas.length >= count) resolveFloor(deltas);
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }), frameCount);
  return { frameDeltasMs };
}

async function observeRegrow(page) {
  return page.evaluate(() => new Promise((resolveRun, rejectRun) => {
    const frames = [];
    let previous = null;
    const timeout = setTimeout(() => rejectRun(new Error('regrow observation exceeded 120 seconds')), 120_000);
    const observe = (timestamp) => {
      const bridge = window.__storytreeCameraRasterisationProbe;
      if (!bridge) {
        clearTimeout(timeout);
        rejectRun(new Error('camera rasterisation bridge disappeared during the run'));
        return;
      }
      const snapshot = bridge.snapshot();
      if (previous !== null) {
        frames.push({
          timestamp,
          deltaMs: timestamp - previous,
          cursor: snapshot.player.cursor,
          growthNodeCount: snapshot.growthNodeCount,
          mapNodeCount: snapshot.mapNodeCount,
          svgTransform: snapshot.svgTransform,
          htmlTransform: snapshot.htmlTransform,
        });
      }
      previous = timestamp;
      if (!snapshot.player.playing && snapshot.player.cursor >= 1 && frames.length > 0) {
        clearTimeout(timeout);
        resolveRun(frames);
      } else {
        requestAnimationFrame(observe);
      }
    };
    requestAnimationFrame(observe);
  }));
}

function runOrder(repeats) {
  const order = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    // Each variant is bracketed by controls over the two repeats; reversing the second half avoids
    // a warm or contended interval being confounded with one fixed variant position.
    order.push(...(repeat % 2 === 0
      ? ['growth-only', 'final-product', 'growth-only', 'final-product']
      : ['final-product', 'growth-only', 'final-product', 'growth-only']));
  }
  return order;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const runs = [];
  let canonical = null;
  try {
    const order = runOrder(args.repeats);
    for (let ordinal = 0; ordinal < order.length; ordinal += 1) {
      const variant = order[ordinal];
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      await context.addInitScript(() => sessionStorage.setItem('storytree.act2.arrived', '1'));
      const page = await context.newPage();
      // The production server derives the real corpus before the bridge can mount; on a cold local
      // JSON store that legitimately exceeds Playwright's 30 s navigation default. Navigation only
      // needs the shell; readiness is the explicit bridge predicate below.
      await page.goto(diagnosticUrl(args.url, variant), {
        waitUntil: 'domcontentloaded',
        timeout: 180_000,
      });
      await page.waitForFunction(
        () => window.__storytreeCameraRasterisationProbe !== undefined,
        undefined,
        { timeout: 180_000 },
      );
      await page.waitForFunction(
        () =>
          (window.__storytreeCameraRasterisationProbe?.snapshot().corpus.storyCount ?? 0) > 0,
        undefined,
        { timeout: 180_000 },
      );
      const descriptor = await page.evaluate(() => window.__storytreeCameraRasterisationProbe.snapshot());
      canonical ??= descriptor;
      const runId = `${String(ordinal + 1).padStart(2, '0')}-${variant}`;
      const preIdle = await observeIdleFloor(page);
      const start = await page.evaluate(() => window.__storytreeCameraRasterisationProbe.start());
      let frames = [];
      if (start.ok) frames = await observeRegrow(page);
      const postIdle = await observeIdleFloor(page);
      await page.evaluate(() => window.__storytreeCameraRasterisationProbe.settle());
      const settled = await page.evaluate(() => window.__storytreeCameraRasterisationProbe.snapshot());
      const cleanupMatchesFit =
        settled.svgTransform === settled.fitTransform &&
        (settled.htmlTransform === '' || settled.htmlTransform === 'none');
      const runSpanMs = frames.length > 1
        ? frames[frames.length - 1].timestamp - frames[0].timestamp
        : 0;
      const measured = { runId, ordinal, variant, preIdle, postIdle, frames, runSpanMs };
      runs.push({
        ...measured,
        descriptor,
        start,
        admissibility: start.ok
          ? assessCameraRasterisationRun(measured)
          : { accepted: false, reason: descriptor.rejectionReason ?? start.reason ?? 'start-refused' },
        cleanupMatchesFit,
      });
      await page.goto('about:blank');
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const comparableRuns = runs.filter((run) => run.start.ok);
  const summary = summariseCameraRasterisationRuns(comparableRuns);
  const report = {
    protocol: CAMERA_RASTERISATION_PROTOCOL,
    generatedAt: new Date().toISOString(),
    build: args.build,
    productionUrl: args.url.href,
    browser: { name: 'Chromium', version: browserVersion },
    viewport: VIEWPORT,
    expectedMappedIslandCount: CAMERA_RASTERISATION_EXPECTED_ISLANDS,
    corpus: canonical?.corpus ?? null,
    variants: VARIANTS,
    settings: canonical?.settings ?? null,
    runOrder: runs.map((run) => run.variant),
    runs,
    summary,
  };
  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const tablePath = args.output.slice(0, extname(args.output) ? -extname(args.output).length : undefined) + '.md';
  const table = [
    '# Camera rasterisation comparison',
    '',
    `Build: \`${args.build}\` · Chromium ${browserVersion} · ${VIEWPORT.width}×${VIEWPORT.height}`,
    '',
    formatCameraRasterisationComparisonTable(summary).trimEnd(),
    '',
    '| variant | admitted run spans |',
    '| --- | ---: |',
    ...VARIANTS.map((variant) => {
      const spans = runs
        .filter((run) => run.variant === variant && run.admissibility.accepted)
        .map((run) => `${(run.runSpanMs / 1000).toFixed(2)} s`);
      return `| ${variant} | ${spans.length > 0 ? spans.join(', ') : 'none'} |`;
    }),
    '',
    `Accepted runs: ${summary.acceptedRunIds.length}; rejected runs: ${runs.length - summary.acceptedRunIds.length}.`,
    '',
  ].join('\n');
  await writeFile(tablePath, table, 'utf8');

  const hardFailures = runs.filter(
    (run) => !run.start.ok || !run.cleanupMatchesFit || run.descriptor.protocol !== CAMERA_RASTERISATION_PROTOCOL,
  );
  if (hardFailures.length > 0) {
    throw new Error(`probe failed closed; inspect ${args.output} (${hardFailures.map((run) => run.runId).join(', ')})`);
  }
  process.stdout.write(`${table}\nRaw evidence: ${args.output}\nComparison table: ${tablePath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
