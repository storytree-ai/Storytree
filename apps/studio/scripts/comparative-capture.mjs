#!/usr/bin/env node
// The corpus-scale comparative capture (frontend-visual-judgment-arc, increment
// `frontend-corpus-scale-comparative-capture`): renders THIS branch beside
// `merge-base(origin/main, HEAD)` over the SAME live corpus, same viewport, same settle discipline,
// and prints the five-measure element-count delta the increment names — content extent (union bbox
// of `.parcel`), island parcels, `world-cave` portals, `trail-fill`, `parcel-blade` — before it ever
// writes an image. This is the surface `frontend-builder`'s Stage 2 appearance witnessing now points
// at, replacing `launchOffline()`'s four-island `TREE_FIXTURE` stub for that purpose (the stub stays
// for what it is good at: deterministic, DB-less pointer-capture E2E — see harness.mjs's own header).
//
// NUMBERS FIRST, IMAGE SECOND (the increment's own design note): the delta table is the thing a
// human never has to eyeball to catch a shrink or a lost connector; the screenshot pair is for the
// judgment a count cannot make.
//
// THE SETTLE IS A SLEEP, ON PURPOSE, STATED PLAINLY. `frontend-settled-signal-from-the-app` (the
// sibling increment on this arc) has not landed — there is no app-emitted "I have stopped moving"
// signal yet. Rather than inventing a second, competing one here (explicitly forbidden by this
// increment's design notes), this script waits for the first real DOM evidence the map painted at
// all (`g.hex-flora` attached), then SLEEPS a fixed `--settle-ms` (default below) and reads whatever
// is on screen at that point. Replace this sleep with the real signal the moment it exists; until
// then, every printed report says so.
//
// THE TWO-CHECKOUTS PROBLEM. Comparing against `merge-base(origin/main, HEAD)` means having it
// checked out and runnable. This script provisions a SEPARATE worktree at that commit (once — later
// runs reuse it if the merge-base hasn't moved) and `pnpm install`s it, the same shape
// `dogfood-probe.run.ts` already uses for an isolated probe checkout. That + two live-store dev
// servers + a real Chromium is NOT cheap or fully deterministic (a live corpus can change between
// the two captures), which is why this is an on-demand command for Stage 2 visual witnessing, not a
// `pnpm gate` rung — see the PR description / library artifact update for the affordability call.
//
// TRIGGER (fail-wide, reusing `ci-affected.ts` — never a second hand-rolled path list, mirroring
// ADR-0324's librarian-curation trigger): by default this script first asks whether the branch's own
// diff against `merge-base(origin/main, HEAD)` even touches the render surface
// (`frontend-capture-trigger.ts`'s `RENDER_SURFACE_PROJECTS`). An untouched surface prints the
// reason and exits 0 without spinning anything up; `--force` overrides.
//
// Usage: pnpm --filter studio capture:comparative [-- --out <dir>] [--settle-ms <ms>]
//        [--viewport WxH] [--branch-url <url>] [--baseline-url <url>] [--force]
//        [--clean-worktree] [--branch-port <n>] [--baseline-port <n>]
// (DB up — `pnpm db:up` — unless both --branch-url and --baseline-url are given.)

import { chromium } from '@playwright/test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureLiveDb, loadLocalSecrets } from '@storytree/drive';

import { discoverWorkspaceProjects } from '../../../packages/cli/src/ci-affected.ts';
import { gitLines, localAffectedScope } from '../../../packages/cli/src/gate-scope.ts';
import { renderSurfaceTrigger } from '../../../packages/cli/src/frontend-capture-trigger.ts';
import {
  CAPTURE_SELECTORS,
  computeCaptureDelta,
  formatCaptureComparisonTable,
  toRenderElementCounts,
} from '../src/lib/comparativeCapture.ts';

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(studioDir, '..', '..');

const DEFAULT_VIEWPORT = { width: 1600, height: 1000 };
const DEFAULT_SETTLE_MS = 8_000;
const DEFAULT_BRANCH_PORT = 5187;
const DEFAULT_BASELINE_PORT = 5188;
const READY_TIMEOUT_MS = 60_000;

function log(msg) {
  console.log(`[capture-comparative] ${msg}`);
}

function readArgs(argv) {
  const values = new Map();
  const flags = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!arg?.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags.add(arg.slice(2));
      continue;
    }
    values.set(arg.slice(2), next);
    i += 1;
  }
  const viewport = (() => {
    const raw = values.get('viewport');
    if (!raw) return DEFAULT_VIEWPORT;
    const m = /^(\d+)x(\d+)$/.exec(raw);
    if (!m) throw new Error(`--viewport must be WIDTHxHEIGHT, got "${raw}"`);
    return { width: Number(m[1]), height: Number(m[2]) };
  })();
  return {
    out: values.get('out') ?? path.join(repoRoot, '.gate-logs', 'frontend-capture', new Date().toISOString().replace(/[:.]/g, '-')),
    settleMs: Number(values.get('settle-ms') ?? DEFAULT_SETTLE_MS),
    viewport,
    branchUrl: values.get('branch-url') ?? null,
    baselineUrl: values.get('baseline-url') ?? null,
    branchPort: Number(values.get('branch-port') ?? DEFAULT_BRANCH_PORT),
    baselinePort: Number(values.get('baseline-port') ?? DEFAULT_BASELINE_PORT),
    force: flags.has('force'),
    cleanWorktree: flags.has('clean-worktree'),
    help: flags.has('help'),
  };
}

function printHelp() {
  console.log(`
storytree studio comparative capture — branch vs merge-base(origin/main, HEAD), same live corpus.

  pnpm --filter studio capture:comparative -- [options]

  --out <dir>            output directory (default: .gate-logs/frontend-capture/<timestamp>/)
  --settle-ms <ms>        the placeholder settle sleep, ms (default ${DEFAULT_SETTLE_MS} — see the
                          file header: this is a sleep until frontend-settled-signal-from-the-app lands)
  --viewport WxH          capture viewport (default ${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height})
  --branch-url <url>      skip provisioning; capture the branch render from this already-running URL
  --baseline-url <url>    skip provisioning; capture the baseline render from this already-running URL
  --branch-port <n>       port for the branch's own dev server (default ${DEFAULT_BRANCH_PORT})
  --baseline-port <n>     port for the baseline worktree's dev server (default ${DEFAULT_BASELINE_PORT})
  --force                 capture even when the render-surface trigger says this branch didn't touch it
  --clean-worktree        remove the provisioned baseline worktree when done (default: kept, reused
                          by the next run when the merge-base hasn't moved)
  --help                  this text
`);
}

function git(args, cwd = repoRoot) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * What this branch changes on top of `main` — the SAME question `pnpm gate --scope` asks
 * (gate-run.ts's own `localDiff`), reproduced here rather than imported because that function isn't
 * exported (only the classification it feeds, `localAffectedScope`, is — see gate-scope.ts's header
 * on the git-reading/judgement split). `merge-base` itself is returned too: it is also the commit
 * this script checks the baseline worktree out to.
 */
function localDiff() {
  let mergeBase;
  try {
    mergeBase = git(['merge-base', 'origin/main', 'HEAD']);
  } catch (err) {
    return { mergeBase: null, diff: { ok: false, reason: `no merge-base with origin/main: ${err.message}` } };
  }
  if (!mergeBase) return { mergeBase: null, diff: { ok: false, reason: 'merge-base resolved to nothing' } };
  try {
    const tracked = git(['diff', '--name-only', '--no-renames', mergeBase]);
    const untracked = git(['ls-files', '--others', '--exclude-standard']);
    return { mergeBase, diff: { ok: true, files: [...gitLines(tracked), ...gitLines(untracked)] } };
  } catch (err) {
    return { mergeBase, diff: { ok: false, reason: `git diff/ls-files failed: ${err.message}` } };
  }
}

function ensureBaselineWorktree(mergeBaseSha, baselineDir) {
  const marker = path.join(baselineDir, '.git');
  if (existsSync(marker)) {
    try {
      const head = git(['rev-parse', 'HEAD'], baselineDir);
      if (head === mergeBaseSha) {
        log(`reusing the existing baseline worktree at ${baselineDir} (already at ${mergeBaseSha.slice(0, 10)})`);
        return { reused: true };
      }
      log(`baseline worktree at ${baselineDir} is at ${head.slice(0, 10)}, merge-base moved to ${mergeBaseSha.slice(0, 10)} — checking it out`);
      git(['checkout', '--detach', mergeBaseSha], baselineDir);
      return { reused: false, checkedOut: true };
    } catch (err) {
      log(`baseline worktree at ${baselineDir} looked stale/broken (${err.message}) — re-provisioning`);
      try {
        git(['worktree', 'remove', '--force', baselineDir]);
      } catch {
        /* fall through to a raw rm */
      }
      rmSync(baselineDir, { recursive: true, force: true });
    }
  }
  mkdirSync(path.dirname(baselineDir), { recursive: true });
  log(`cutting a fresh baseline worktree at ${baselineDir} (detached at ${mergeBaseSha.slice(0, 10)})`);
  git(['worktree', 'add', '--detach', baselineDir, mergeBaseSha]);
  return { reused: false, checkedOut: false };
}

/** `pnpm install` at `cwd`, non-interactive. Windows resolves the `pnpm.cmd` shim only through a
 *  shell (mirrors `dogfood-probe.run.ts` / `provision-worktree.mjs`'s own installer). */
function pnpmInstall(cwd) {
  const win = process.platform === 'win32';
  const res = win
    ? spawnSync('pnpm install --prefer-offline', { cwd, stdio: 'inherit', shell: true, timeout: 10 * 60_000 })
    : spawnSync('pnpm', ['install', '--prefer-offline'], { cwd, stdio: 'inherit', timeout: 10 * 60_000 });
  if (res.status !== 0) {
    throw new Error(`pnpm install failed in ${cwd} (status ${res.status ?? res.error?.message})`);
  }
}

/** Start `vite dev` for the studio app rooted at `cwd`, on `port`. Returns the child + a kill fn. */
function startDevServer(cwd, port, label) {
  log(`starting the ${label} dev server (cwd=${cwd}, port=${port})…`);
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  return child;
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`${url} did not answer within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

function killTree(child, label) {
  if (!child) return;
  log(`stopping the ${label} dev server (pid ${child.pid})…`);
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* best-effort */
  }
}

/** Navigate to `#/tree`, skip the Act 2 arrival regrow (same static-map treatment both renders get —
 *  the same flag `launchOffline()` sets), wait for the first real paint evidence, then SLEEP the
 *  placeholder settle window (see file header). Returns the raw extraction + a PNG buffer. */
async function captureOne(browser, url, viewport, settleMs, label) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => sessionStorage.setItem('storytree.act2.arrived', '1'));
  const page = await context.newPage();
  log(`[${label}] navigating to ${url}#/tree…`);
  await page.goto(`${url}/#/tree`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('g.hex-flora').first().waitFor({ state: 'attached', timeout: 60_000 });
  log(`[${label}] painted — settling (placeholder sleep, ${settleMs}ms — see file header)…`);
  await page.waitForTimeout(settleMs);
  const raw = await page.evaluate((sel) => {
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      parcelRects: Array.from(document.querySelectorAll(sel.parcel)).map(rectOf),
      worldCave: document.querySelectorAll(sel.worldCave).length,
      trailFill: document.querySelectorAll(sel.trailFill).length,
      parcelBlade: document.querySelectorAll(sel.parcelBlade).length,
    };
  }, CAPTURE_SELECTORS);
  const screenshot = await page.screenshot({ fullPage: false });
  await context.close();
  return { counts: toRenderElementCounts(raw), screenshot };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }

  loadLocalSecrets(); // STORYTREE_DB_USER, for the live pg store both dev servers default to.

  const { mergeBase, diff } = localDiff();
  if (!args.force) {
    const projects = discoverWorkspaceProjects(repoRoot);
    const scope = localAffectedScope(diff, projects);
    const trigger = renderSurfaceTrigger(scope);
    log(`render-surface trigger: ${trigger.affected ? 'FIRES' : 'skips'} — ${trigger.reason}`);
    if (!trigger.affected) {
      log('nothing to capture (pass --force to capture anyway).');
      return 0;
    }
  }
  if (!mergeBase) {
    console.error(`[capture-comparative] cannot resolve merge-base(origin/main, HEAD): ${diff.ok ? '' : diff.reason}`);
    return 1;
  }
  log(`merge-base(origin/main, HEAD) = ${mergeBase}`);

  mkdirSync(args.out, { recursive: true });

  let baselineWorktree = null;
  let branchProc = null;
  let baselineProc = null;
  const needsDb = args.branchUrl === null || args.baselineUrl === null;
  try {
    if (needsDb) {
      log('bringing the live store up (both dev servers default to the live pg store)…');
      const ready = await ensureLiveDb((m) => log(`[db] ${m}`));
      if (!ready.ok) {
        console.error(`[capture-comparative] the live store could not be brought up: ${ready.reason}`);
        return 1;
      }
    }

    let branchUrl = args.branchUrl;
    if (branchUrl === null) {
      branchProc = startDevServer(studioDir, args.branchPort, 'branch');
      branchUrl = `http://127.0.0.1:${args.branchPort}`;
      await waitForReady(branchUrl, READY_TIMEOUT_MS);
    }

    let baselineUrl = args.baselineUrl;
    if (baselineUrl === null) {
      const scratchRoot = path.join(tmpdir(), 'storytree-frontend-capture');
      mkdirSync(scratchRoot, { recursive: true });
      // A DIFFERENT merge-base than any cached dir gets its own path, so a stale worktree is never
      // silently reused across unrelated runs — old ones just accumulate under scratchRoot until
      // cleaned by hand or via --clean-worktree next time the SAME merge-base recurs.
      baselineWorktree = path.join(scratchRoot, `baseline-${mergeBase.slice(0, 12)}`);
      ensureBaselineWorktree(mergeBase, baselineWorktree);
      log('provisioning the baseline worktree (pnpm install — this is the expensive step)…');
      pnpmInstall(baselineWorktree);
      const baselineStudioDir = path.join(baselineWorktree, 'apps', 'studio');
      baselineProc = startDevServer(baselineStudioDir, args.baselinePort, 'baseline');
      baselineUrl = `http://127.0.0.1:${args.baselinePort}`;
      await waitForReady(baselineUrl, READY_TIMEOUT_MS);
    }

    const browser = await chromium.launch({ headless: true });
    let branchResult;
    let baselineResult;
    try {
      baselineResult = await captureOne(browser, baselineUrl, args.viewport, args.settleMs, 'baseline');
      branchResult = await captureOne(browser, branchUrl, args.viewport, args.settleMs, 'branch');
    } finally {
      await browser.close();
    }

    const branchLabel = `BRANCH (${git(['rev-parse', '--abbrev-ref', 'HEAD']).trim() || 'HEAD'})`;
    const baselineLabel = `BASELINE (merge-base ${mergeBase.slice(0, 10)})`;
    const rows = computeCaptureDelta(baselineResult.counts, branchResult.counts);
    const table = formatCaptureComparisonTable(baselineLabel, branchLabel, rows);

    writeFileSync(path.join(args.out, 'baseline.png'), baselineResult.screenshot);
    writeFileSync(path.join(args.out, 'branch.png'), branchResult.screenshot);
    const report = [
      '# Forest map — corpus-scale comparative capture',
      '',
      `merge-base: \`${mergeBase}\` · viewport ${args.viewport.width}x${args.viewport.height} · settle: PLACEHOLDER SLEEP ${args.settleMs}ms (no app-emitted settled signal yet — frontend-settled-signal-from-the-app)`,
      '',
      table,
      '',
      '## Raw counts',
      '',
      '```json',
      JSON.stringify({ baseline: baselineResult.counts, branch: branchResult.counts }, null, 2),
      '```',
      '',
      'Images: `baseline.png`, `branch.png` (this directory).',
      '',
    ].join('\n');
    writeFileSync(path.join(args.out, 'comparison.md'), report, 'utf8');

    process.stdout.write(`${table}\n\nWritten to: ${args.out}\n`);
    return 0;
  } finally {
    killTree(branchProc, 'branch');
    killTree(baselineProc, 'baseline');
    if (args.cleanWorktree && baselineWorktree) {
      log(`removing the baseline worktree at ${baselineWorktree} (--clean-worktree)…`);
      try {
        git(['worktree', 'remove', '--force', baselineWorktree]);
      } catch {
        rmSync(baselineWorktree, { recursive: true, force: true });
      }
    } else if (baselineWorktree) {
      log(`baseline worktree kept at ${baselineWorktree} for reuse (pass --clean-worktree to remove it).`);
    }
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`[capture-comparative] unexpected error: ${err instanceof Error ? err.stack : String(err)}`);
    process.exit(1);
  },
);
