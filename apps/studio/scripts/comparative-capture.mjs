#!/usr/bin/env node
// The corpus-scale comparative capture (frontend-visual-judgment-arc, increment
// `frontend-corpus-scale-comparative-capture`; settled-attestation + explicit baseline added by
// increment `frontend-capture-settled-and-explicit-baseline`): renders THIS branch beside a baseline
// (by default `merge-base(origin/main, HEAD)`) over the SAME live corpus, same viewport, same settle
// discipline, and prints the five-measure element-count delta the increment names — content extent
// (union bbox of `.parcel`), island parcels, `world-cave` portals, `trail-fill`, `parcel-blade` —
// before it ever writes an image. This is the surface `frontend-builder`'s Stage 2 appearance
// witnessing now points at, replacing `launchOffline()`'s four-island `TREE_FIXTURE` stub for that
// purpose (the stub stays for what it is good at: deterministic, DB-less pointer-capture E2E — see
// harness.mjs's own header).
//
// NUMBERS FIRST, IMAGE SECOND (the increment's own design note): the delta table is the thing a
// human never has to eyeball to catch a shrink or a lost connector; the screenshot pair is for the
// judgment a count cannot make.
//
// THE SETTLE IS THE APP'S OWN ATTESTATION, NOT A SLEEP. Both captures are taken through
// `captureSettledScreenshot` (apps/desktop/e2e/harness.mjs, built for
// `frontend-settled-signal-from-the-app`) — reused rather than re-derived, so this script waits on
// `window.__storytreeMotionSettled` exactly the way the desktop E2E harness does, and writes the same
// `<png>.settled.json` sidecar attestation beside each PNG. There is no plain sleep left here.
//
// THE BASELINE IS EXPLICIT, MERGE-BASE STAYS THE DEFAULT. `merge-base(origin/main, HEAD)` answers
// "did MY BRANCH change the render?" — right for a PR, and the zero-argument behaviour still. It does
// NOT answer "is the CURRENT render right?", and the two come apart the moment a defect is already on
// `main`: on a branch that hasn't touched the render, merge-base IS the branch, so a defect already on
// `main` shows a confident all-zero delta. `--baseline-ref <commit-ish>` lets a caller ask the second
// question by pointing the baseline capture at an explicit historical commit instead.
//
// THE TWO-CHECKOUTS PROBLEM. Comparing against a baseline commit means having it checked out and
// runnable. This script provisions a SEPARATE worktree at that commit (once — later runs reuse it if
// the resolved baseline ref hasn't moved) and `pnpm install`s it, the same shape
// `dogfood-probe.run.ts` already uses for an isolated probe checkout. That + two live-store dev
// servers + a real Chromium is NOT cheap or fully deterministic (a live corpus can change between
// the two captures), which is why this is an on-demand command for Stage 2 visual witnessing, not a
// `pnpm gate` rung — see the PR description / library artifact update for the affordability call.
//
// TRIGGER (fail-wide, reusing `ci-affected.ts` — never a second hand-rolled path list, mirroring
// ADR-0324's librarian-curation trigger): by default this script first asks whether the branch's own
// diff against `merge-base(origin/main, HEAD)` even touches the render surface
// (`frontend-capture-trigger.ts`'s `RENDER_SURFACE_PROJECTS`). An untouched surface prints the
// reason and exits 0 without spinning anything up; `--force` overrides. This trigger always reasons
// about the BRANCH's own diff against `origin/main` — it is unaffected by `--baseline-ref`, which
// only changes what the baseline capture renders, never whether a capture is worth taking.
//
// Usage: pnpm --filter studio capture:comparative [-- --out <dir>] [--settle-timeout-ms <ms>]
//        [--viewport WxH] [--branch-url <url>] [--baseline-url <url>] [--baseline-ref <commit-ish>]
//        [--force] [--clean-worktree] [--branch-port <n>] [--baseline-port <n>]
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
  verifyServedTree,
} from '../src/lib/comparativeCapture.ts';
// Reused, not re-derived (frontend-capture-settled-and-explicit-baseline's own design note): the
// desktop E2E harness's settled-attestation glue operates on any Playwright Page-like object
// (`.locator`/`.waitForFunction`/`.evaluate`/`.screenshot`) — an Electron window and this script's
// plain Chromium `page` both satisfy it, so there is no reason to fork a second implementation of the
// wait.
import { captureSettledScreenshot } from '../../desktop/e2e/harness.mjs';

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(studioDir, '..', '..');

const DEFAULT_VIEWPORT = { width: 1600, height: 1000 };
// 90s, not 45s: `settle-bridge-reports-settled-before-the-world-arrives`
// (frontend-appearance-repair-arc) measured GENUINE settle at 42-80s (load-dependent) on the live
// corpus this script captures against — a 45s default expired BEFORE the app could legitimately
// settle. It went unnoticed only because the predicate it fed had its own bug (reporting `settled:
// true` ~8s in, before the world had even arrived) that happened to mask the too-short timeout by
// returning early on a false positive; fixing that bug without raising this default would have
// started biting on the very next slow-corpus run. 90s carries margin above the observed ceiling.
const DEFAULT_SETTLE_TIMEOUT_MS = 90_000;
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
    settleTimeoutMs: Number(values.get('settle-timeout-ms') ?? DEFAULT_SETTLE_TIMEOUT_MS),
    viewport,
    branchUrl: values.get('branch-url') ?? null,
    baselineUrl: values.get('baseline-url') ?? null,
    baselineRef: values.get('baseline-ref') ?? null,
    branchPort: Number(values.get('branch-port') ?? DEFAULT_BRANCH_PORT),
    baselinePort: Number(values.get('baseline-port') ?? DEFAULT_BASELINE_PORT),
    force: flags.has('force'),
    cleanWorktree: flags.has('clean-worktree'),
    help: flags.has('help'),
  };
}

function printHelp() {
  console.log(`
storytree studio comparative capture — branch vs a baseline (default merge-base(origin/main, HEAD)),
same live corpus, both captures attested settled by the app itself.

  pnpm --filter studio capture:comparative -- [options]

  --out <dir>            output directory (default: .gate-logs/frontend-capture/<timestamp>/)
  --settle-timeout-ms <ms>  how long to wait for window.__storytreeMotionSettled to attest settled,
                          per capture (default ${DEFAULT_SETTLE_TIMEOUT_MS}) — this is a timeout on the
                          real app signal, not a sleep; see captureSettledScreenshot (harness.mjs).
  --viewport WxH          capture viewport (default ${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height})
  --branch-url <url>      skip provisioning; capture the branch render from this already-running URL
  --baseline-url <url>    skip provisioning; capture the baseline render from this already-running URL
  --baseline-ref <ref>    render the baseline from this commit-ish instead of
                          merge-base(origin/main, HEAD) — answers "is the CURRENT render right?"
                          rather than "did my branch change it?". Ignored when --baseline-url is given.
                          merge-base stays the default when this is omitted.
  --branch-port <n>       port for the branch's own dev server (default ${DEFAULT_BRANCH_PORT})
  --baseline-port <n>     port for the baseline worktree's dev server (default ${DEFAULT_BASELINE_PORT})
  --force                 capture even when the render-surface trigger says this branch didn't touch it
  --clean-worktree        remove the provisioned baseline worktree when done (default: kept, reused
                          by the next run when the resolved baseline ref hasn't moved)
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

/** Resolve a commit-ish (branch, tag, sha, `HEAD~1`, …) to a concrete sha, or throw loudly — a
 *  `--baseline-ref` a caller mistyped must fail the run, never silently fall back to merge-base. */
function resolveRef(ref) {
  try {
    return git(['rev-parse', ref]);
  } catch (err) {
    throw new Error(`--baseline-ref "${ref}" did not resolve to a commit: ${err.message}`);
  }
}

function ensureBaselineWorktree(baselineSha, baselineDir) {
  const marker = path.join(baselineDir, '.git');
  if (existsSync(marker)) {
    try {
      const head = git(['rev-parse', 'HEAD'], baselineDir);
      if (head === baselineSha) {
        log(`reusing the existing baseline worktree at ${baselineDir} (already at ${baselineSha.slice(0, 10)})`);
        return { reused: true };
      }
      log(`baseline worktree at ${baselineDir} is at ${head.slice(0, 10)}, resolved baseline is ${baselineSha.slice(0, 10)} — checking it out`);
      git(['checkout', '--detach', baselineSha], baselineDir);
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
  log(`cutting a fresh baseline worktree at ${baselineDir} (detached at ${baselineSha.slice(0, 10)})`);
  git(['worktree', 'add', '--detach', baselineDir, baselineSha]);
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

/**
 * Wait for `url` to answer — and, when we started the server ourselves, notice if OUR OWN child died
 * first. `--strictPort` makes vite EXIT when the port is already held, and without this check the
 * loop would keep polling and then happily accept a `200` from whoever DOES hold it. Watching the
 * child turns that silent substitution into an immediate, named failure.
 */
async function waitForReady(url, timeoutMs, child = null) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `${url}: our own dev server exited (code ${child.exitCode}) before answering. ` +
          `With --strictPort that almost always means another session already holds this port — ` +
          `re-run with --branch-port / --baseline-port pointing at free ports.`,
      );
    }
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

/**
 * Assert the server answering `url` really serves `expectedSha` before a single number is read off
 * it. See {@link verifyServedTree} for the measured failure this exists to stop; the short version is
 * that a port collision can hand this script a stranger's worktree and nothing downstream would
 * notice. Throws on any doubt — an unidentified tree is never measured.
 */
async function assertServedTree(url, expectedSha, label) {
  let health;
  try {
    const res = await fetch(`${url}/api/health`);
    health = await res.json();
  } catch (err) {
    throw new Error(
      `[capture-comparative] ${label}: could not read /api/health (${err?.message ?? err}) — ` +
        `refusing to measure a server whose tree cannot be confirmed.`,
    );
  }
  const verdict = verifyServedTree(health, expectedSha, label);
  if (!verdict.ok) throw new Error(`[capture-comparative] ${verdict.reason}`);
  log(`${label} server confirmed serving ${expectedSha.slice(0, 12)}`);
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
 *  the same flag `launchOffline()` sets), then capture ONLY once the app itself attests it has
 *  settled (`captureSettledScreenshot`, reused from the desktop E2E harness — no sleep here). Writes
 *  the PNG straight to `pngPath` and the `<pngPath>.settled.json` attestation sidecar
 *  `captureSettledScreenshot` stamps beside it, then reads the element counts off the same settled
 *  DOM. Returns the extracted counts + the settle attestation stamp. */
async function captureOne(browser, url, viewport, settleTimeoutMs, pngPath, label) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => sessionStorage.setItem('storytree.act2.arrived', '1'));
  const page = await context.newPage();
  log(`[${label}] navigating to ${url}#/tree…`);
  await page.goto(`${url}/#/tree`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  log(`[${label}] waiting for the app's own settled attestation (window.__storytreeMotionSettled)…`);
  const stamp = await captureSettledScreenshot(page, pngPath, { timeout: settleTimeoutMs, fullPage: false });
  log(`[${label}] settled and captured — reasons still open: ${stamp.reasons.join(', ') || 'none'}`);
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
  await context.close();
  return { counts: toRenderElementCounts(raw), stamp };
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
  log(`merge-base(origin/main, HEAD) = ${mergeBase} (used for the render-surface trigger, and the baseline default)`);

  // The baseline capture's commit: an explicit --baseline-ref if given, else merge-base(origin/main,
  // HEAD) — unrelated to the trigger decision above, which always reasons about the branch's own diff.
  let baselineSha = mergeBase;
  let baselineSource = 'merge-base(origin/main, HEAD)';
  if (args.baselineRef) {
    baselineSha = resolveRef(args.baselineRef);
    baselineSource = `--baseline-ref "${args.baselineRef}"`;
    log(`explicit baseline ref: ${baselineSource} resolves to ${baselineSha}`);
  }

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
      await waitForReady(branchUrl, READY_TIMEOUT_MS, branchProc);
      await assertServedTree(branchUrl, git(['rev-parse', 'HEAD']), 'branch');
    }

    let baselineUrl = args.baselineUrl;
    if (baselineUrl === null) {
      const scratchRoot = path.join(tmpdir(), 'storytree-frontend-capture');
      mkdirSync(scratchRoot, { recursive: true });
      // A DIFFERENT baseline sha than any cached dir gets its own path, so a stale worktree is never
      // silently reused across unrelated runs — old ones just accumulate under scratchRoot until
      // cleaned by hand or via --clean-worktree next time the SAME baseline sha recurs.
      baselineWorktree = path.join(scratchRoot, `baseline-${baselineSha.slice(0, 12)}`);
      ensureBaselineWorktree(baselineSha, baselineWorktree);
      log('provisioning the baseline worktree (pnpm install — this is the expensive step)…');
      pnpmInstall(baselineWorktree);
      const baselineStudioDir = path.join(baselineWorktree, 'apps', 'studio');
      baselineProc = startDevServer(baselineStudioDir, args.baselinePort, 'baseline');
      baselineUrl = `http://127.0.0.1:${args.baselinePort}`;
      await waitForReady(baselineUrl, READY_TIMEOUT_MS, baselineProc);
      await assertServedTree(baselineUrl, baselineSha, 'baseline');
    }

    const baselinePngPath = path.join(args.out, 'baseline.png');
    const branchPngPath = path.join(args.out, 'branch.png');

    const browser = await chromium.launch({ headless: true });
    let branchResult;
    let baselineResult;
    try {
      baselineResult = await captureOne(browser, baselineUrl, args.viewport, args.settleTimeoutMs, baselinePngPath, 'baseline');
      branchResult = await captureOne(browser, branchUrl, args.viewport, args.settleTimeoutMs, branchPngPath, 'branch');
    } finally {
      await browser.close();
    }

    const branchLabel = `BRANCH (${git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'HEAD'})`;
    const baselineLabel = `BASELINE (${baselineSource} ${baselineSha.slice(0, 10)})`;
    const rows = computeCaptureDelta(baselineResult.counts, branchResult.counts);
    const table = formatCaptureComparisonTable(baselineLabel, branchLabel, rows);

    // Both PNGs are already written to baselinePngPath/branchPngPath by captureSettledScreenshot
    // (inside captureOne), along with their `.settled.json` attestation sidecars — nothing left to
    // write here for the images themselves.
    const report = [
      '# Forest map — corpus-scale comparative capture',
      '',
      `baseline: ${baselineSource} = \`${baselineSha}\` (trigger merge-base: \`${mergeBase}\`) · ` +
        `viewport ${args.viewport.width}x${args.viewport.height} · ` +
        `settle: app-attested via window.__storytreeMotionSettled (captureSettledScreenshot, timeout ${args.settleTimeoutMs}ms) — ` +
        `see baseline.png.settled.json / branch.png.settled.json`,
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
