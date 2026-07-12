// Electron E2E: pty sessions survive route changes (ADR-0189 — app-owned sessions,
// terminal-orchestrator-seat-arc increment 1).
//
// THE WALK THIS PINS: expand the terminal on the forest page, run a probe command in the REAL pty,
// SPA-navigate away (Overview — TreeView and the dock unmount), assert the session is STILL LIVE in the
// Electron main, SPA-navigate back, and assert the SAME session re-attached with the probe output
// replayed from the main-held scrollback ring — never a fresh spawn. Before ADR-0189 the dock's unmount
// cleanup disposed every session, so leaving the forest page killed a live interactive Claude Code
// session; this spec is the regression wall for exactly that.
//
// WHY REAL ELECTRON: the thing under test is the MAIN-process session ownership (PtySessionManager's
// ring + list/snapshot, the terminal:list/terminal:snapshot IPC, the preload's single-consumer relays)
// under a REAL renderer unmount/remount — jsdom mocks the bridge away, so only `_electron` proves the
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
import { appDir, stubApi, waitForForestSettled } from './harness.mjs';

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

/** The visible terminal pane's rendered text (xterm renders rows into the DOM). */
const visiblePaneText = (win) =>
  win.evaluate(() => {
    const body = document.querySelector('.terminal-dock-body:not([hidden])');
    return body ? (body.textContent ?? '') : '';
  });

test('pty sessions survive a route change: away to Overview and back re-attaches with scrollback', async (t) => {
  const ciArgs = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : [];
  const app = await electron.launch({
    args: ['.', ...ciArgs],
    cwd: appDir,
    // Clear any env runtime pin (ADR-0181) so the walk serves THIS checkout's freshly-built code via
    // the launch-checkout fallback. NOTE a dev box may also pin via ~/.storytree/desktop.runtime.json —
    // that pin must resolve to a main worktree CONTAINING this feature (post-land it does), else stage
    // the walk with the config set aside. (Redirecting USERPROFILE to dodge the file is NOT an option:
    // the native keychain hard-crashes Electron without a real profile.)
    env: { ...process.env, STORYTREE_STUDIO_STORE: 'json', STORYTREE_DESKTOP_RUNTIME: '' },
  });
  /** Restore whatever repo selection the machine really had (the spec borrows the owner's file). */
  let restoreSelection = () => {};
  try {
    const win = await app.firstWindow();
    await stubApi(win);

    // The main shows a "Starting storytree" launch page, boots the sidecar, then NAVIGATES the window
    // to the served studio URL — an evaluate racing that swap dies "execution context destroyed". Wait
    // for the studio origin before driving the renderer (the /api stubs registered above persist).
    await win.waitForURL(/^http:\/\/127\.0\.0\.1:/, { timeout: 120_000 });

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

    // Run the probe in the REAL pty and wait for it to echo through the real shell.
    await win.locator('.terminal-dock-body:not([hidden])').click();
    await win.keyboard.type('echo survival-probe', { delay: 15 });
    await win.keyboard.press('Enter');
    const sawProbe = await pollFor(async () => (await visiblePaneText(win)).includes('survival-probe'), {
      timeout: 30_000,
    });
    assert.ok(sawProbe, 'the probe command echoed in the live terminal');

    // ROUTE AWAY (SPA click nav — no reload): TreeView and the dock unmount.
    await win.locator('nav.topnav a', { hasText: 'Overview' }).click();
    await win.waitForSelector('.terminal-dock', { state: 'detached', timeout: 10_000 });

    // The pty is app-owned: still listed while NO dock is attached (the pre-ADR-0189 behaviour killed
    // it right here).
    const whileAway = await listSessions(win);
    assert.deepEqual(
      whileAway.map((s) => s.sessionId),
      [sessionId],
      'the session survives the dock unmount',
    );

    // ROUTE BACK: the remounting dock re-attaches to the SAME session (no fresh spawn) and replays the
    // main-held scrollback into a fresh xterm.
    await win.locator('nav.topnav a', { hasText: 'Forest' }).click();
    await waitForForestSettled(win);
    await win.waitForSelector('.terminal-dock-tabs .terminal-dock-tab', { state: 'attached', timeout: 20_000 });

    const expandAgain = win.locator('[aria-label="expand terminal"]');
    await expandAgain.waitFor({ state: 'visible', timeout: 10_000 });
    await expandAgain.click();

    const after = await pollFor(async () => {
      const sessions = await listSessions(win);
      return sessions.length > 0 ? sessions : null;
    }, { timeout: 15_000 });
    assert.deepEqual(
      after.map((s) => s.sessionId),
      [sessionId],
      'the SAME single session re-attaches — no duplicate spawn on remount',
    );

    const replayed = await pollFor(async () => (await visiblePaneText(win)).includes('survival-probe'), {
      timeout: 20_000,
    });
    assert.ok(replayed, 'the re-attached pane replays the buffered scrollback (survival-probe present)');
  } finally {
    restoreSelection();
    await app.close(); // window close → disposeAllTerminals: app-quit stays a sanctioned kill
  }
});
