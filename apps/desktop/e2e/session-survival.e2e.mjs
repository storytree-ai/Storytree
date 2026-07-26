// Electron E2E: pty sessions survive route changes (ADR-0189 — app-owned sessions,
// terminal-orchestrator-seat-arc increment 1).
//
// THE WALK THIS PINS: expand the terminal on the forest page, run a probe command in the REAL pty,
// SPA-navigate away (#/members — the visited TreeView and dock park hidden/inert), then return and
// assert the SAME live session and probe output are immediately available — never a fresh spawn.
// Before ADR-0189 the dock's unmount cleanup disposed every session; ADR-0240 now also retains the
// renderer-side map/dock presentation across a route change. This is the regression wall for both
// lifetime boundaries.
//
// WHY REAL ELECTRON: the thing under test is the MAIN-process session ownership (PtySessionManager's
// ring + list/snapshot, the terminal:list/terminal:snapshot IPC, the preload's single-consumer relays)
// under a REAL renderer route transition — jsdom mocks the bridge away, so only `_electron` proves the
// cross-process lifecycle. The /api/* surface is stubbed offline (harness.mjs contract); the pty and the
// bridge are REAL. The repo gate is satisfied by pre-writing the userData repo-selection.json (the same
// file the picker persists) pointing at this checkout — a real git repo in dev and CI alike.
//
// Run: pnpm --filter desktop test:e2e  (pretest:e2e builds the studio dist + the electron main first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appDir, stubApi, waitForForestSettled, waitForStudioOrigin } from './harness.mjs';

/** The repo the terminal opens in — the launch checkout (apps/desktop → repo root), a git repo. */
const repoRoot = join(appDir, '..', '..');

/** Poll an async predicate until truthy or deadline; returns the last value either way. */
async function pollFor(fn, { timeout = 15_000, step = 250 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, step));
  }
}

/** The live sessions the bridge reports (repo-scoped by the main) — [{ sessionId }]. */
const listSessions = (win) => win.evaluate(() => window.desktopTerminal.list());

/** The session's text as the MAIN holds it — `snapshot()`'s serialized screen state. This is the
 *  renderer-INDEPENDENT observable: the dock renders on xterm's WebGL renderer where available
 *  (contract 13 — glyphs paint to a canvas, so DOM `textContent` sees nothing) and falls back to
 *  the DOM renderer where not (e.g. CI's --disable-gpu), so a DOM-text read would pass or fail by
 *  GPU availability, not by the behaviour under test. The main-held ring is also the thing this
 *  spec actually pins (app-owned sessions); the renderer-side replay wiring is jsdom-pinned in
 *  TerminalDock.test.tsx. */
const sessionText = (win, sessionId) =>
  win.evaluate(async (id) => {
    const result = await window.desktopTerminal.snapshot(id);
    return typeof result === 'string' ? result : result.data;
  }, sessionId);

/** The main-held terminal dimensions make the resize debounce observable. DOM bounds alone can
 *  look correct before TerminalDock's delayed `fit()` forwards a collapsed size to the pty. */
const sessionDimensions = (win, sessionId) =>
  win.evaluate(async (id) => {
    const result = await window.desktopTerminal.snapshot(id);
    return typeof result === 'string' ? null : { cols: result.cols, rows: result.rows };
  }, sessionId);

test('pty sessions survive a route change: away to Members and back restores the parked dock with scrollback', async (t) => {
  const ciArgs = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : [];
  const app = await electron.launch({
    args: ['.', ...ciArgs],
    cwd: appDir,
    // E2E mode (electron/main.ts, matching the shared harness): serve THIS checkout's freshly-built
    // code, ignore ANY runtime pin (env or ~/.storytree/desktop.runtime.json — the dev-box staging
    // dance this spec used to document is gone), and never spawn the backend sidecar; the pty manager
    // under test lives in the MAIN process, and every /api read is stubbed.
    env: {
      ...process.env,
      STORYTREE_STUDIO_STORE: 'json',
      STORYTREE_DESKTOP_E2E: '1',
    },
  });
  // Live-echo the app's (and, relayed through it, the sidecar's) stderr so a boot failure states its
  // cause in the CI log even when a step timeout eats the end-of-run failure summary (harness.mjs).
  app.process().stderr?.on('data', (chunk) => process.stderr.write(`[app] ${chunk}`));
  /** Restore whatever repo selection the machine really had (the spec borrows the owner's file). */
  let restoreSelection = () => {};
  try {
    const win = await app.firstWindow();
    await stubApi(win);

    // The main shows a "Starting storytree" launch page, boots the sidecar, then NAVIGATES the window
    // to the served studio URL — an evaluate racing that swap dies "execution context destroyed". Wait
    // for the studio origin before driving the renderer (the /api stubs registered above persist);
    // waitForStudioOrigin fails FAST with the page text if the main lands on its error page.
    await waitForStudioOrigin(win);

    // Satisfy the repo gate BEFORE entering the forest: write the persisted selection main reads
    // (userData/repo-selection.json), backing up any real one so a dev box is left untouched.
    const userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
    const selFile = join(userData, 'repo-selection.json');
    const hadFile = existsSync(selFile);
    const backup = hadFile ? readFileSync(selFile, 'utf8') : null;
    restoreSelection = () => {
      try {
        if (backup !== null) writeFileSync(selFile, backup, 'utf8');
        else if (existsSync(selFile)) rmSync(selFile);
      } catch {
        /* best-effort restore */
      }
    };
    mkdirSync(userData, { recursive: true });
    writeFileSync(selFile, JSON.stringify({ path: repoRoot }), 'utf8');

    // Enter the forest with the stubs in force from a clean mount (the harness's launch contract).
    await win.evaluate(() => {
      location.hash = '#/tree';
    });
    await win.reload();
    await waitForForestSettled(win);

    // Expand the terminal (the dock renders once the gate sees the valid repo) and wait for the first
    // session to spawn — the bridge's repo-scoped list() turning non-empty is the spawn observable.
    const toggle = win.locator('[aria-label="expand terminal"]');
    await toggle.waitFor({ state: 'visible', timeout: 120_000 });
    await toggle.click();
    const before = await pollFor(async () => {
      const sessions = await listSessions(win);
      return sessions.length > 0 ? sessions : null;
    }, { timeout: 30_000 });
    assert.ok(before && before.length === 1, `one live session after expand (got ${JSON.stringify(before)})`);
    const sessionId = before[0].sessionId;
    assert.ok(sessionId, 'the spawned session has an id');
    const liveTerminalGeometry = await win.locator('.terminal-dock-body-row').boundingBox();
    assert.ok(
      liveTerminalGeometry && liveTerminalGeometry.width > 0 && liveTerminalGeometry.height > 0,
      'the live terminal has a nonzero geometry before route parking',
    );
    // TerminalDock forwards ResizeObserver fits through a 100 ms debounce. Let the visible dock's
    // initial fit settle before treating these as the dimensions route parking must preserve.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const livePtyDimensions = await sessionDimensions(win, sessionId);
    assert.ok(
      livePtyDimensions && livePtyDimensions.cols > 2 && livePtyDimensions.rows > 1,
      `the live pty has usable dimensions before route parking (got ${JSON.stringify(livePtyDimensions)})`,
    );

    // Run the probe in the REAL pty and wait for it to echo through the real shell.
    await win.locator('.terminal-dock-body:not([hidden])').click();
    await win.keyboard.type('echo survival-probe', { delay: 15 });
    await win.keyboard.press('Enter');
    const sawProbe = await pollFor(
      async () => (await sessionText(win, sessionId)).includes('survival-probe'),
      { timeout: 30_000 },
    );
    assert.ok(sawProbe, 'the probe command echoed through the real pty into the session scrollback');

    // ROUTE AWAY (SPA hash nav — no reload): the already-visited map and dock stay mounted, but the
    // App parks them outside paint, input, and the accessibility tree. The HUD has no route links, so
    // a location.hash write the hash router picks up (same mechanism as the '#/tree' seed above).
    await win.evaluate(() => {
      location.hash = '#/members';
    });
    await win.waitForSelector('[data-testid="tree-route"][data-parked="true"] .terminal-dock', {
      state: 'attached',
      timeout: 10_000,
    });
    assert.equal(
      await win.locator('[data-testid="tree-route"][data-parked="true"] .terminal-dock').isVisible(),
      false,
      'the retained dock is hidden while Members is current',
    );
    const parkedTerminalGeometry = await win
      .locator('[data-testid="tree-route"][data-parked="true"] .terminal-dock-body-row')
      .boundingBox();
    assert.deepEqual(
      parkedTerminalGeometry,
      liveTerminalGeometry,
      'parking keeps the terminal body dimensions intact; a zero-size fit would resize the pty to 2×1',
    );

    // Stay parked beyond TerminalDock's delayed ResizeObserver fit, then assert the MAIN's actual
    // pty dimensions too. This catches a hidden layout collapse that the immediate DOM check misses.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const parkedPtyDimensions = await sessionDimensions(win, sessionId);
    assert.deepEqual(
      parkedPtyDimensions,
      livePtyDimensions,
      'parking preserves the pty dimensions after the resize debounce; it never refits to 2×1',
    );

    // The pty is app-owned: still listed while its dock stays parked (the pre-ADR-0189 behaviour killed
    // it right here).
    const whileAway = await listSessions(win);
    assert.deepEqual(
      whileAway.map((s) => s.sessionId),
      [sessionId],
      'the session survives the parked dock',
    );

    // ROUTE BACK: the same expanded dock becomes visible without an expand/re-attach cycle. Its
    // original session presentation and main-held scrollback remain available; no fresh spawn occurs.
    await win.evaluate(() => {
      location.hash = '#/tree';
    });
    await waitForForestSettled(win);
    // ADR-0190 chrome: the session panel (rows beside the pane) replaced the numbered tab strip.
    await win.waitForSelector('[data-testid="tree-route"]:not([data-parked]) .terminal-dock-panel .terminal-dock-panel-row', {
      state: 'attached',
      timeout: 20_000,
    });
    await win.locator('[aria-label="collapse terminal"]').waitFor({ state: 'visible', timeout: 10_000 });

    const after = await pollFor(async () => {
      const sessions = await listSessions(win);
      return sessions.length > 0 ? sessions : null;
    }, { timeout: 15_000 });
    assert.deepEqual(
      after.map((s) => s.sessionId),
      [sessionId],
      'the SAME single session remains presented — no duplicate spawn on route return',
    );

    const replayed = await pollFor(
      async () => (await sessionText(win, sessionId)).includes('survival-probe'),
      { timeout: 20_000 },
    );
    assert.ok(
      replayed,
      'the main still serves buffered scrollback for the retained session (survival-probe present)',
    );
  } finally {
    restoreSelection();
    await app.close(); // window close → disposeAllTerminals: app-quit stays a sanctioned kill
  }
});
