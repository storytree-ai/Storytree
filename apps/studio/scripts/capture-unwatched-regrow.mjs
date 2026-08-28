#!/usr/bin/env node
// The unwatched-regrow before/after capture (regrow-survives-being-unwatched-arc).
//
// The owner reported this one from USING the app: "it freezes and stops growing … it should just
// keep growing in the background else it looks like its bugged out." He watched the Act 2 forest
// regrow, looked away, and came back to a forest that had stopped. ADR-0469 fixed it. This script
// is the argument he can WATCH — a pair of runs over the real corpus, in a real browser, one
// against the code that had the defect and one against the code that fixed it, with the app's own
// progress readout visible in every still.
//
// WHY IT SWAPS ONE FILE RATHER THAN CHECKING OUT TWO WORKTREES. `comparative-capture.mjs` provisions
// a whole second worktree at a baseline commit, which is right when the question is "did my branch
// change the render?" — a diff of everything. The question HERE is narrower and the answer is
// stronger when the experiment is tighter: substitute `act2Intro.ts` alone, on one dev server, over
// one corpus, in one browser, and the ONLY thing that differs between the two arms is the hook under
// test. Everything else is held fixed by construction rather than by hoping two checkouts agree.
//
// WHICH CODE IS ACTUALLY BEING SERVED IS VERIFIED, NOT ASSUMED. A file swap behind a running Vite is
// exactly the kind of setup that silently measures the same arm twice — a stale transform, a missed
// invalidation, and both arms report the fixed behaviour while the table claims a comparison. So
// before either arm is measured this fetches the module Vite is really serving and asserts the
// defect's own fingerprint (`visibilitychange`) is present for `before` and absent for `after`.
// An arm that cannot be identified is never measured.
//
// THE PRE-FIX ARM IS THE INSTRUMENT'S OWN CONTROL. Both scenarios below assert a SIGNATURE, not a
// threshold picked by hand: the parked route must SNAP to the settled forest and the occluded window
// must FREEZE at the frame it was on. If either simulation were inert — a park that did not park, an
// occlusion that never suppressed a frame — the pre-fix arm would come back healthy and this script
// would say so instead of quietly reporting a pass. The before arm is what proves the after arm
// means anything.
//
// Usage: pnpm --filter studio capture:unwatched [-- --out <dir>] [--away-ms <ms>]
//                                               [--baseline-ref <commit-ish>] [--port <n>]
//                                               [--url <base>] [--keep-server]
// (DB up — `pnpm db:up` — unless --url points at a server you already have.)

import { chromium } from '@playwright/test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureLiveDb, loadLocalSecrets } from '@storytree/drive';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(HERE, '..');
const REPO = path.resolve(STUDIO, '..', '..');
const HOOK_REL = 'apps/studio/src/components/act2Intro.ts';
const HOOK_ABS = path.join(REPO, HOOK_REL);

/** The commit that fixed it. Its PARENT is the code the owner was looking at when he reported it. */
const FIX_COMMIT = '47376a69';

const log = (msg) => process.stderr.write(`[unwatched-capture] ${msg}\n`);

function parseArgs(argv) {
  const out = {
    out: path.join(REPO, 'docs', 'research', 'unwatched-regrow-2026-08-28'),
    awayMs: 8000,
    baselineRef: `${FIX_COMMIT}^`,
    port: 5199,
    url: null,
    keepServer: false,
    targetProgress: 0.18,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--away-ms') out.awayMs = Number(next());
    else if (arg === '--baseline-ref') out.baselineRef = next();
    else if (arg === '--port') out.port = Number(next());
    else if (arg === '--url') out.url = next();
    else if (arg === '--keep-server') out.keepServer = true;
    else if (arg === '--target-progress') out.targetProgress = Number(next());
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startDevServer(port) {
  log(`starting the studio dev server on ${port}…`);
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      path.join(STUDIO, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--port',
      String(port),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  return child;
}

async function waitForReady(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `${url}: our own dev server exited (code ${child.exitCode}) before answering. With ` +
          `--strictPort that almost always means another session already holds this port — re-run ` +
          `with --port pointing at a free one.`,
      );
    }
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`${url} did not answer within ${timeoutMs}ms`);
    await sleep(300);
  }
}

/**
 * Assert the dev server is really serving the arm we think it is, by the DEFECT'S OWN FINGERPRINT.
 *
 * The pre-fix hook pauses the run on `visibilitychange` and clamps a frame delta to 500 ms; the
 * fixed hook deletes both and anchors the cursor with a `now()` on the clock. Those strings survive
 * Vite's dev transform (it rewrites imports and JSX, not identifiers or comments), so fetching the
 * transformed module and looking for them answers "which code is behind this URL?" without trusting
 * that a file write propagated. Throws on any doubt — an arm that cannot be identified is not
 * measured.
 */
async function assertServedArm(baseUrl, arm) {
  const url = `${baseUrl}/src/components/act2Intro.ts`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url} to identify the served arm (${res.status})`);
  const source = await res.text();
  const pausesOnHidden = source.includes('visibilitychange');
  const expected = arm === 'before';
  if (pausesOnHidden !== expected) {
    throw new Error(
      `[${arm}] the served hook does not match the arm: expected the visibilitychange pause to be ` +
        `${expected ? 'PRESENT' : 'ABSENT'} and it is ${pausesOnHidden ? 'PRESENT' : 'ABSENT'}. ` +
        `Vite is serving a stale transform — refusing to measure two arms that may be the same code.`,
    );
  }
  log(`[${arm}] served hook confirmed (visibilitychange pause ${pausesOnHidden ? 'present' : 'absent'})`);
}

/**
 * Make the page able to go away the two ways the owner's app does.
 *
 * `__unwatchedOcclude(on)` reproduces what a window covering the desktop app does to the PAGE: it
 * flips `document.hidden` / `visibilityState`, fires the real `visibilitychange` event, and — the
 * half a naive simulation forgets — stops delivering animation frames, holding the pending callback
 * until the window is uncovered. Real occlusion is a Windows compositor property this Linux box
 * cannot produce, so it is simulated; both halves of what the browser actually does are simulated,
 * and the pre-fix arm freezing is what proves the simulation bites.
 */
const OCCLUSION_SHIM = () => {
  let hidden = false;
  let held = null;
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  window.requestAnimationFrame = (cb) => {
    if (!hidden) return realRaf(cb);
    held = cb;
    return -1;
  };
  window.cancelAnimationFrame = (id) => {
    if (id === -1) held = null;
    else realCancel(id);
  };
  window.__unwatchedOcclude = (on) => {
    hidden = on;
    document.dispatchEvent(new Event('visibilitychange'));
    if (!on && held) {
      const cb = held;
      held = null;
      realRaf(cb);
    }
  };
};

/** The app's own progress readout: the precise cursor plus the sentence a human reads off the still. */
async function readCursor(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.act2-intro');
    if (!el) return null;
    const raw = el.getAttribute('data-act2-progress');
    return {
      progress: raw === null ? null : Number(raw),
      readout: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
}

async function waitForCursor(page, predicate, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const cursor = await readCursor(page);
    if (cursor && cursor.progress !== null && predicate(cursor.progress)) return cursor;
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${what} (last: ${JSON.stringify(cursor)})`);
    }
    await sleep(120);
  }
}

/**
 * One arm × one scenario: start a regrow, go away the given way for `awayMs` of REAL time, come
 * back, and record where the forest is — twice, so a cursor that is merely correct once is told
 * apart from one that is still running.
 */
async function runScenario({ browser, baseUrl, arm, scenario, awayMs, targetProgress, outDir }) {
  const label = `${arm}-${scenario}`;
  const videoDir = path.join(outDir, 'video', label);
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 820 } },
  });
  await context.addInitScript(OCCLUSION_SHIM);
  const page = await context.newPage();
  const shot = async (name) => {
    await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`) });
  };

  try {
    // `?act2=intro` forces a run on arrival AND mounts the diagnostic readout — the depth / islands /
    // pathways / percent line that makes each still self-describing.
    log(`[${label}] navigating…`);
    await page.goto(`${baseUrl}/?act2=intro#/tree`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('.act2-intro', { timeout: 120_000 });

    const leftAt = await waitForCursor(page, (p) => p >= targetProgress && p < 0.6, 120_000, 'the run to reach the departure point');
    await shot('01-left-at');
    log(`[${label}] leaving at ${(leftAt.progress * 100).toFixed(1)}% — "${leftAt.readout}"`);

    const awayStartedMs = Date.now();
    if (scenario === 'park') {
      // The owner clicks through to another surface. Assigning the hash is the same same-document
      // navigation the in-app link performs, and it is what makes `TreeView` pass `active: false`.
      await page.evaluate(() => {
        window.location.hash = '#/members';
      });
      await page.waitForSelector('.act2-intro', { state: 'detached', timeout: 30_000 });
    } else {
      await page.evaluate(() => window.__unwatchedOcclude(true));
    }

    await sleep(awayMs);

    if (scenario === 'park') {
      await page.evaluate(() => {
        window.location.hash = '#/tree';
      });
      await page.waitForSelector('.act2-intro', { timeout: 60_000 });
    } else {
      await page.evaluate(() => window.__unwatchedOcclude(false));
    }
    const awayMsActual = Date.now() - awayStartedMs;

    // Give the returning frame a moment to be delivered and committed, then read where it landed.
    await sleep(400);
    const returned = (await readCursor(page)) ?? { progress: null, readout: '' };
    await shot('02-returned');
    log(`[${label}] back at ${((returned.progress ?? 0) * 100).toFixed(1)}% — "${returned.readout}"`);

    // Is it still MOVING, or merely correct once? A frozen cursor and a running one read the same at
    // a single instant, which is the whole reason this second sample exists.
    await sleep(2000);
    const later = (await readCursor(page)) ?? { progress: null, readout: '' };
    await shot('03-two-seconds-later');
    log(`[${label}] two seconds later ${((later.progress ?? 0) * 100).toFixed(1)}%`);

    return {
      arm,
      scenario,
      awayMsRequested: awayMs,
      awayMsActual,
      leftAt: leftAt.progress,
      leftAtReadout: leftAt.readout,
      returnedAt: returned.progress,
      returnedAtReadout: returned.readout,
      twoSecondsLater: later.progress,
      grewWhileAway: returned.progress !== null && returned.progress > leftAt.progress + 0.01,
      stillGrowingOnReturn: later.progress !== null && returned.progress !== null && later.progress > returned.progress + 0.005,
      snappedToSettled: returned.progress === 1,
      // THE FREEZE, read off the run's OWN subsequent behaviour rather than off a number chosen by
      // hand. The first cut of this asked whether the cursor came back within 0.5% of where it was
      // LEFT — and missed the defect it was written for: the pre-fix run kept growing for the ~2%
      // between the sample and the occlusion call, then stopped dead at 20.9%. How far it got before
      // it froze is an artifact of THIS SCRIPT's latency; that it never moves again is the defect.
      frozenMidRun:
        returned.progress !== null &&
        returned.progress < 1 &&
        !(later.progress !== null && later.progress > returned.progress + 0.005),
    };
  } finally {
    await context.close();
    // Playwright names the video on close; give it the scenario's name so the pair is watchable.
    const files = existsSync(videoDir) ? readdirSync(videoDir).filter((f) => f.endsWith('.webm')) : [];
    if (files[0]) renameSync(path.join(videoDir, files[0]), path.join(outDir, `${label}.webm`));
    rmSync(videoDir, { recursive: true, force: true });
  }
}

/**
 * The verdict for one arm, stated as the SIGNATURE each world produces rather than as a number
 * chosen by hand. The pre-fix world is recognised by its two defects; the fixed world by growth that
 * continued and is still continuing.
 */
function verdictFor(arm, results) {
  const park = results.find((r) => r.scenario === 'park');
  const occlude = results.find((r) => r.scenario === 'occlude');
  if (arm === 'before') {
    const ok = park?.snappedToSettled === true && occlude?.frozenMidRun === true;
    return {
      ok,
      statement: ok
        ? 'the defect reproduced: the parked route SNAPPED to the settled forest, and the occluded window FROZE mid-run and never moved again'
        : 'the defect did NOT reproduce on this arm — the instrument cannot be trusted to have measured anything',
    };
  }
  const ok =
    park?.grewWhileAway === true &&
    park?.stillGrowingOnReturn === true &&
    park?.snappedToSettled === false &&
    occlude?.grewWhileAway === true &&
    occlude?.stillGrowingOnReturn === true;
  return {
    ok,
    statement: ok
      ? 'the forest kept growing through both absences and was still growing on return'
      : 'the fixed arm did not keep growing through both absences',
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });

  const baselineSource = execFileSync('git', ['show', `${opts.baselineRef}:${HOOK_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const baselineSha = execFileSync('git', ['rev-parse', opts.baselineRef], { cwd: REPO, encoding: 'utf8' }).trim();
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  log(`baseline ${opts.baselineRef} = ${baselineSha.slice(0, 12)} (the code the owner reported)`);

  const backup = path.join(opts.out, 'act2Intro.head.ts.bak');
  copyFileSync(HOOK_ABS, backup);

  let server = null;
  let browser = null;
  const report = { headSha, baselineSha, baselineRef: opts.baselineRef, awayMs: opts.awayMs, arms: {} };

  try {
    let baseUrl = opts.url;
    if (!baseUrl) {
      loadLocalSecrets();
      log('ensuring the live store is up…');
      const ready = await ensureLiveDb((m) => log(`[db] ${m}`));
      if (ready && ready.ok === false) throw new Error(`the live store is not reachable: ${ready.reason ?? 'unknown'}`);
      server = startDevServer(opts.port);
      baseUrl = `http://127.0.0.1:${opts.port}`;
      await waitForReady(baseUrl, 180_000, server);
    }
    log(`server ready at ${baseUrl}`);

    browser = await chromium.launch();

    for (const arm of ['before', 'after']) {
      writeFileSync(HOOK_ABS, arm === 'before' ? baselineSource : readFileSync(backup, 'utf8'));
      // Vite watches the file; give the invalidation a beat, then PROVE which code is being served.
      await sleep(1500);
      await assertServedArm(baseUrl, arm);

      const results = [];
      for (const scenario of ['park', 'occlude']) {
        results.push(
          await runScenario({
            browser,
            baseUrl,
            arm,
            scenario,
            awayMs: opts.awayMs,
            targetProgress: opts.targetProgress,
            outDir: opts.out,
          }),
        );
      }
      report.arms[arm] = { results, verdict: verdictFor(arm, results) };
      log(`[${arm}] ${report.arms[arm].verdict.statement}`);
    }
  } finally {
    copyFileSync(backup, HOOK_ABS);
    rmSync(backup, { force: true });
    log('restored the working-tree hook');
    if (browser) await browser.close().catch(() => {});
    if (server && !opts.keepServer) {
      spawnSync('kill', [String(server.pid)]);
    }
  }

  writeFileSync(path.join(opts.out, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);

  const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
  const lines = [
    '',
    `  UNWATCHED REGROW — ${opts.awayMs / 1000}s away, real corpus, real browser`,
    `  before = ${baselineSha.slice(0, 12)} (${opts.baselineRef})   after = ${headSha.slice(0, 12)} (HEAD)`,
    '',
    '  arm     scenario   left at   came back at   +2s      what happened',
    '  ─────────────────────────────────────────────────────────────────────────────',
  ];
  for (const arm of ['before', 'after']) {
    for (const r of report.arms[arm]?.results ?? []) {
      const what = r.snappedToSettled
        ? 'SNAPPED to the settled forest'
        : r.frozenMidRun
          ? 'FROZE mid-run — never moved again'
          : 'kept growing, and still growing';
      lines.push(
        `  ${arm.padEnd(7)} ${r.scenario.padEnd(10)} ${pct(r.leftAt).padStart(7)}   ${pct(r.returnedAt).padStart(12)}   ${pct(r.twoSecondsLater).padStart(6)}   ${what}`,
      );
    }
  }
  lines.push('');
  for (const arm of ['before', 'after']) {
    const v = report.arms[arm]?.verdict;
    lines.push(`  ${arm}: ${v?.ok ? 'as expected' : '⚠ NOT as expected'} — ${v?.statement}`);
  }
  lines.push('', `  stills + video: ${opts.out}`, '');
  process.stdout.write(`${lines.join('\n')}\n`);

  const bothArmsHonest = report.arms.before?.verdict.ok && report.arms.after?.verdict.ok;
  if (!bothArmsHonest) process.exitCode = 1;
}

await main();
