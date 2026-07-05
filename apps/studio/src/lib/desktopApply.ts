// The desktop "apply a landed fix" bridge (ADR-0164 Phase 1), as the studio renderer sees it.
//
// The studio bundle is served in TWO places: the hosted/dev studio (a browser, no Electron) and the
// desktop app (which renders this same bundle and injects `window.desktopApply` via its preload, Rail 1
// — the MAIN process is the supervisor). This module is how the shared StoreBanner FEATURE-DETECTS the
// desktop app: `getDesktopApply()` returns the bridge only when the preload injected it, so the hosted
// studio shows the plain manual restart instructions while the desktop app shows the one-click
// "Rebuild & relaunch" button. The renderer imports NO Electron/agent/build code — its only path to a
// rebuild is this injected bridge (ADR-0004 / ADR-0109 §Decision 4).

/** The result the MAIN process returns for a rebuild — mirrors apps/desktop/src/apply `RebuildResult`. */
export type RebuildRelaunchResult =
  | { ok: true }
  | { ok: false; step: string; code: number; output: string };

/** The bridge the desktop preload exposes on `window`. Absent in the hosted/dev studio (a browser). */
export interface DesktopApplyBridge {
  /**
   * Ask the MAIN process to rebuild the studio + electron bundles and relaunch onto them. Resolves
   * with `{ ok: true }` while the app is relaunching (the window is about to go away), or a typed
   * failure the banner surfaces — the app stayed on the old working build (fail-closed).
   */
  rebuildAndRelaunch: () => Promise<RebuildRelaunchResult>;
}

declare global {
  interface Window {
    /** Injected by the desktop preload (ADR-0164). Undefined in the hosted/dev studio. */
    desktopApply?: DesktopApplyBridge;
  }
}

/** The desktop apply bridge, or `undefined` in a plain browser (the hosted/dev studio). */
export function getDesktopApply(): DesktopApplyBridge | undefined {
  return typeof window !== "undefined" ? window.desktopApply : undefined;
}
