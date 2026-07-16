// Electron E2E: pty sessions survive route changes (ADR-0189 — app-owned sessions,
// terminal-orchestrator-seat-arc increment 1).
//
// THE WALK THIS PINS: expand the terminal on the forest page, run a probe command in the REAL pty,
// SPA-navigate away (#/members — TreeView and the dock unmount; the banner nav retired, ADR-0204),
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

test('pty sessions survive a route change: away to Members and back re-attaches with scrollback', async (t) => {
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

    // Run the probe in the REAL pty and wait for it to echo through the real shell.
    await win.locator('.terminal-dock-body:not([hidden])').click();
    await win.keyboard.type('echo survival-probe', { delay: 15 });
    await win.keyboard.press('Enter');
    const sawProbe = await pollFor(
      async () => (await sessionText(win, sessionId)).includes('survival-probe'),
      { timeout: 30_000 },
    );
    assert.ok(sawProbe, 'the probe command echoed through the real pty into the session scrollback');

    // ROUTE AWAY (SPA hash nav — no reload): TreeView and the dock unmount. The banner nav retired
    // with ADR-0204 (the HUD chrome has no route links), so navigate the way the app itself does —
    // a location.hash write the hash router picks up (same mechanism as the '#/tree' seed above).
    await win.evaluate(() => {
      location.hash = '#/members';
    });
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
    await win.evaluate(() => {
      location.hash = '#/tree';
    });
    await waitForForestSettled(win);
    // ADR-0190 chrome: the session panel (rows beside the pane) replaced the numbered tab strip.
    await win.waitForSelector('.terminal-dock-panel .terminal-dock-panel-row', { state: 'attached', timeout: 20_000 });

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

    const replayed = await pollFor(
      async () => (await sessionText(win, sessionId)).includes('survival-probe'),
      { timeout: 20_000 },
    );
    assert.ok(
      replayed,
      'the main still serves the buffered scrollback for the re-attached session (survival-probe present)',
    );
  } finally {
    restoreSelection();
    await app.close(); // window close → disposeAllTerminals: app-quit stays a sanctioned kill
  }
});
